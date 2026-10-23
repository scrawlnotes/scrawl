import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { type Account, type Accounts, digestOf, Refused } from './auth';
import { type Db, transaction } from './db';

// The server as its own authorization server, for the agents that reach it at /mcp (design/
// agent.md, 7.2): OAuth 2.1 with PKCE, clients that bring their own metadata document (CIMD) or
// register themselves (DCR), a sign-in page of the server's own, access tokens that run out in
// an hour and refresh tokens turned over on use. An agent connection is a device, so the bearer
// check is the devices' check with the expiry added; only the digests of tokens and codes are kept.

export const SCOPE = 'scrawl';
const ACCESS_MS = 60 * 60 * 1000;
const REFRESH_MS = 90 * 24 * 60 * 60 * 1000;
const CODE_MS = 10 * 60 * 1000;
const DOC_MS = 24 * 60 * 60 * 1000;
const DOC_BYTES = 64 * 1024;
const DOC_TIMEOUT_MS = 5000;

/** What an OAuth request is refused with, as RFC 6749 names it; `redirect` when the client is to be sent it. */
export class OAuthRefused extends Error {
  constructor(
    readonly status: 400 | 401,
    readonly code: string,
    message: string,
    readonly redirect?: string,
  ) {
    super(message);
    this.name = 'OAuthRefused';
  }

  body() {
    return { error: this.code, error_description: this.message };
  }
}

/** A client as it may sign people in: its id, what it is called, and where it may be sent back to. */
export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
}

/** A sign-in under way: what was asked, checked, before the person is shown the page. */
export interface AuthRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
}

/** An agent connection as the account's page lists it. */
export interface AgentConnection {
  id: string;
  client: string;
  connected: number;
  seen: number;
  /** The agent's own name, once it has written; null before. */
  name: string | null;
}

/** An agent's own identity: `<its account>:<its own>`, and its name. */
export interface AgentIdentity {
  id: string;
  name: string;
}

/** What a bearer token stands for, once checked. */
export interface Verified {
  account: Account;
  device: string;
  clientId: string;
  /** What the client called itself when it registered or in its metadata document. */
  clientName: string;
  expiresAt: number;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Schemes a browser handles itself, never an app's own: a redirect there would run or show something in the page. */
const BROWSER_SCHEMES = new Set(['javascript:', 'vbscript:', 'data:', 'blob:', 'file:', 'filesystem:', 'about:', 'view-source:', 'ftp:', 'ws:', 'wss:']);

/** Whether a redirect URI a client registered may be used: as written, or on the loopback whatever the port (RFC 8252). */
export function redirectAllowed(registered: string, given: string): boolean {
  if (registered === given) return true;
  try {
    const a = new URL(registered);
    const b = new URL(given);
    return a.protocol === 'http:' && b.protocol === 'http:' && LOOPBACK.has(a.hostname) && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

/**
 * A redirect URI a client may register: https, http on the loopback, or an app's own scheme
 * (RFC 8252, 7.1), as Cursor's `cursor://anysphere.cursor-mcp/oauth/callback`.
 */
function redirectValid(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false;
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:') return LOOPBACK.has(url.hostname);
    return !BROWSER_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

/** A host a client's metadata document may be fetched from: a public name, never the loopback, a local name or a bare IP. */
function publicHost(host: string): boolean {
  const name = host.toLowerCase();
  if (!name || LOOPBACK.has(name) || isIP(name.replace(/^\[|\]$/g, '')) !== 0) return false;
  return !name.endsWith('.localhost') && !name.endsWith('.local') && !name.endsWith('.internal') && name.includes('.');
}

const token = () => randomBytes(32).toString('base64url');
const base64url = (data: Buffer) => data.toString('base64url');

export class OAuth {
  private readonly docs = new Map<string, { client: OAuthClient; until: number }>();

  constructor(
    private readonly db: Db,
    private readonly accounts: Accounts,
    private readonly url: string,
    private readonly now: () => number = Date.now,
    private readonly fetchDoc: typeof fetch = fetch,
  ) {}

  get issuer(): string {
    return this.url;
  }

  /** The MCP endpoint, which is what a token is for. */
  get resource(): string {
    return `${this.url}/mcp`;
  }

  get resourceMetadataUrl(): string {
    return `${this.url}/.well-known/oauth-protected-resource/mcp`;
  }

  /** RFC 9728: what /mcp is and who signs people in for it. */
  protectedResourceMetadata() {
    return { resource: this.resource, authorization_servers: [this.issuer], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: 'Scrawl' };
  }

  /** RFC 8414: where the sign-in, the token and the registration are, and what is supported. */
  serverMetadata() {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.url}/oauth/authorize`,
      token_endpoint: `${this.url}/oauth/token`,
      registration_endpoint: `${this.url}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      scopes_supported: [SCOPE, 'offline_access'],
    };
  }

  /** RFC 7591: a client registers itself with its name and where it may be sent back to; it gets an id and no secret. */
  register(body: { [key: string]: unknown }) {
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (uris.length === 0 || !uris.every(redirectValid)) throw new OAuthRefused(400, 'invalid_redirect_uri', 'redirect_uris must be https addresses, http on the loopback, or an app’s own scheme');
    const name = typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 100) : '';
    const id = token();
    this.db.prepare('INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)').run(id, name, JSON.stringify(uris), this.now());
    return {
      client_id: id,
      client_name: name,
      redirect_uris: uris as string[],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_id_issued_at: Math.floor(this.now() / 1000),
    };
  }

  /** The client an id names: one that registered here, or one whose id is the address of its metadata document. */
  async client(id: string): Promise<OAuthClient> {
    if (/^https?:\/\//i.test(id)) return this.document(id);
    const row = this.db.prepare('SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ?').get(id) as { id: string; name: string; redirect_uris: string } | undefined;
    if (!row) throw new OAuthRefused(400, 'invalid_client', 'No such client; register first, or give a client id that is an https address');
    return { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirect_uris) as string[] };
  }

  /**
   * A client's metadata document (CIMD), fetched from its id: only https, only a public name,
   * five seconds, 64 KB, no redirects, and kept for a day. The document must name itself.
   */
  private async document(id: string): Promise<OAuthClient> {
    const cached = this.docs.get(id);
    if (cached && cached.until > this.now()) return cached.client;
    let url: URL;
    try {
      url = new URL(id);
    } catch {
      throw new OAuthRefused(400, 'invalid_client', 'The client id is not an address');
    }
    if (url.protocol !== 'https:' || url.hash || !publicHost(url.hostname)) throw new OAuthRefused(400, 'invalid_client', 'A client id that is an address must be a public https address');
    let data: unknown;
    try {
      const response = await this.fetchDoc(url, { signal: AbortSignal.timeout(DOC_TIMEOUT_MS), redirect: 'manual', headers: { accept: 'application/json' } });
      if (response.status !== 200) throw new Error(`status ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > DOC_BYTES) throw new Error('too large');
      data = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      throw new OAuthRefused(400, 'invalid_client', `The client’s metadata document could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    const doc = data && typeof data === 'object' ? (data as { [key: string]: unknown }) : {};
    if (doc.client_id !== id) throw new OAuthRefused(400, 'invalid_client', 'The client’s metadata document does not name its own address as client_id');
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter(redirectValid) : [];
    if (uris.length === 0) throw new OAuthRefused(400, 'invalid_client', 'The client’s metadata document has no usable redirect_uris');
    const client: OAuthClient = { id, name: typeof doc.client_name === 'string' ? doc.client_name.trim().slice(0, 100) : '', redirectUris: uris };
    this.docs.set(id, { client, until: this.now() + DOC_MS });
    return client;
  }

  /**
   * A sign-in as a client asked for it: the client and its redirect checked first, since a wrong
   * one gets a page and not a redirect; then the rest, which a wrong one is sent back with.
   */
  async start(params: { [key: string]: string | undefined }): Promise<AuthRequest> {
    const client = await this.client(params.client_id ?? '');
    const redirectUri = params.redirect_uri ?? '';
    if (!redirectUri || !client.redirectUris.some((registered) => redirectAllowed(registered, redirectUri))) {
      throw new OAuthRefused(400, 'invalid_request', 'The redirect address is not one this client registered');
    }
    const state = params.state ?? null;
    const back = (code: string, message: string) => new OAuthRefused(400, code, message, sendBack(redirectUri, { error: code, error_description: message, ...(state !== null && { state }), iss: this.issuer }));
    if (params.response_type !== 'code') throw back('unsupported_response_type', 'Only response_type=code is supported');
    if (!params.code_challenge || (params.code_challenge_method ?? 'plain') !== 'S256') throw back('invalid_request', 'A code_challenge with code_challenge_method=S256 is needed');
    if (params.resource !== undefined && params.resource !== this.resource) throw back('invalid_target', `The resource is ${this.resource}`);
    const scopes = (params.scope ?? '').split(/\s+/).filter(Boolean);
    if (scopes.some((s) => s !== SCOPE && s !== 'offline_access')) throw back('invalid_scope', `The scopes here are ${SCOPE} and offline_access`);
    return { client, redirectUri, state, codeChallenge: params.code_challenge, scope: scopes.includes(SCOPE) || scopes.length === 0 ? SCOPE : '' };
  }

  /** The person allowed it: a code for the client, which it turns into tokens within ten minutes, once. */
  grant(request: AuthRequest, account: Account): string {
    const code = token();
    this.db
      .prepare('INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, resource, account_id, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(digestOf(code), request.client.id, request.redirectUri, request.codeChallenge, this.resource, account.id, request.scope, this.now(), this.now() + CODE_MS);
    return sendBack(request.redirectUri, { code, ...(request.state !== null && { state: request.state }), iss: this.issuer });
  }

  /** The person did not allow it. */
  denied(request: AuthRequest): string {
    return sendBack(request.redirectUri, { error: 'access_denied', error_description: 'The person did not allow it', ...(request.state !== null && { state: request.state }), iss: this.issuer });
  }

  /** The token endpoint: a code with its verifier becomes an access and a refresh token; a refresh token becomes new ones, and is spent. */
  async token(form: { [key: string]: string | undefined }) {
    if (form.grant_type === 'authorization_code') return this.exchange(form);
    if (form.grant_type === 'refresh_token') return this.refresh(form);
    throw new OAuthRefused(400, 'unsupported_grant_type', 'grant_type is authorization_code or refresh_token');
  }

  private exchange(form: { [key: string]: string | undefined }) {
    const invalid = (message: string) => new OAuthRefused(400, 'invalid_grant', message);
    const code = form.code ?? '';
    const row = this.db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').get(digestOf(code)) as
      | { client_id: string; redirect_uri: string; code_challenge: string; resource: string; account_id: string; scope: string; expires_at: number; used_at: number | null; device_id: string | null }
      | undefined;
    if (!row) throw invalid('The code is not one this server gave');
    if (row.used_at !== null) {
      // A code used twice was taken by someone: what it gave is ended.
      if (row.device_id) this.end(row.device_id);
      throw invalid('The code was used already');
    }
    if (row.expires_at < this.now()) throw invalid('The code ran out');
    if ((form.client_id ?? row.client_id) !== row.client_id) throw invalid('The code was given to another client');
    if (form.redirect_uri !== undefined && form.redirect_uri !== row.redirect_uri) throw invalid('The redirect address is not the one the code was given with');
    if (!form.code_verifier || base64url(createHash('sha256').update(form.code_verifier).digest()) !== row.code_challenge) throw invalid('The code verifier does not match');
    if (form.resource !== undefined && form.resource !== row.resource) throw new OAuthRefused(400, 'invalid_target', `The resource is ${this.resource}`);
    const account = this.accounts.get(row.account_id);
    return transaction(this.db, () => {
      const client = this.clientName(row.client_id);
      const access = this.accounts.newDevice(account.id, client || 'Agent');
      const device = (this.db.prepare('SELECT id FROM devices WHERE token_hash = ?').get(digestOf(access)) as { id: string }).id;
      const refresh = token();
      this.db
        .prepare('INSERT INTO agents (device_id, client_id, client_name, scope, access_expires_at, refresh_hash, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(device, row.client_id, client, row.scope, this.now() + ACCESS_MS, digestOf(refresh), this.now() + REFRESH_MS, this.now());
      this.db.prepare('UPDATE oauth_codes SET used_at = ?, device_id = ? WHERE code_hash = ?').run(this.now(), device, digestOf(code));
      return this.tokens(access, refresh, row.scope);
    });
  }

  private refresh(form: { [key: string]: string | undefined }) {
    const invalid = (message: string) => new OAuthRefused(400, 'invalid_grant', message);
    const row = this.db
      .prepare('SELECT a.device_id, a.client_id, a.scope, a.refresh_expires_at, d.revoked_at FROM agents a JOIN devices d ON d.id = a.device_id WHERE a.refresh_hash = ?')
      .get(digestOf(form.refresh_token ?? '')) as { device_id: string; client_id: string; scope: string; refresh_expires_at: number; revoked_at: number | null } | undefined;
    if (!row || row.revoked_at !== null) throw invalid('The refresh token is not one this server gave, or the connection was ended');
    if (row.refresh_expires_at < this.now()) throw invalid('The refresh token ran out; sign in again');
    if (form.client_id !== undefined && form.client_id !== row.client_id) throw invalid('The refresh token was given to another client');
    return transaction(this.db, () => {
      const access = token();
      const refresh = token();
      this.db.prepare('UPDATE devices SET token_hash = ?, seen_at = ? WHERE id = ?').run(digestOf(access), this.now(), row.device_id);
      this.db.prepare('UPDATE agents SET access_expires_at = ?, refresh_hash = ?, refresh_expires_at = ? WHERE device_id = ?').run(this.now() + ACCESS_MS, digestOf(refresh), this.now() + REFRESH_MS, row.device_id);
      return this.tokens(access, refresh, row.scope);
    });
  }

  private tokens(access: string, refresh: string, scope: string) {
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_MS / 1000, refresh_token: refresh, scope };
  }

  private clientName(id: string): string {
    const cached = this.docs.get(id)?.client.name;
    if (cached) return cached;
    const row = this.db.prepare('SELECT name FROM oauth_clients WHERE id = ?').get(id) as { name: string } | undefined;
    return row?.name ?? '';
  }

  /** The account and connection a bearer token stands for; null when it is not an agent's, ended, or run out. */
  verify(bearer: string): Verified | null {
    const who = this.accounts.byToken(bearer);
    if (!who) return null;
    const row = this.db.prepare('SELECT client_id, client_name, access_expires_at FROM agents WHERE device_id = ?').get(who.device) as { client_id: string; client_name: string; access_expires_at: number } | undefined;
    if (!row || row.access_expires_at < this.now()) return null;
    return { account: who.account, device: who.device, clientId: row.client_id, clientName: row.client_name, expiresAt: row.access_expires_at };
  }

  /** Whether a device is an agent connection rather than one of the person's own. */
  isAgent(device: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM agents WHERE device_id = ?').get(device);
  }

  /** The agent connections of an account that are not ended, the newest first. */
  list(account: string): AgentConnection[] {
    return this.db
      .prepare(
        `SELECT d.id, a.client_name AS client, a.created_at AS connected, d.seen_at AS seen, i.name AS name FROM agents a JOIN devices d ON d.id = a.device_id
         LEFT JOIN agent_identities i ON i.account_id = d.account_id AND i.client_id = a.client_id
         WHERE d.account_id = ? AND d.revoked_at IS NULL ORDER BY a.created_at DESC`,
      )
      .all(account) as unknown as AgentConnection[];
  }

  /**
   * The agent of an account and a client, made the first time it writes (design/activity.md 2.1).
   * Its name is the client's; a second agent of the account from the same client is "Claude Code (2)",
   * as the server does not know which computer it is on.
   */
  identity(account: string, clientId: string, client: string): AgentIdentity {
    return transaction(this.db, () => this.identityOf(account, clientId, client));
  }

  private identityOf(account: string, clientId: string, client: string, name?: string): AgentIdentity {
    const found = this.db.prepare('SELECT id, name FROM agent_identities WHERE account_id = ? AND client_id = ?').get(account, clientId) as AgentIdentity | undefined;
    if (found) return found;
    const same = (this.db.prepare('SELECT COUNT(*) AS n FROM agent_identities WHERE account_id = ? AND client = ?').get(account, client) as { n: number }).n;
    const made = { id: `${account}:${randomBytes(4).toString('hex')}`, name: name ?? (same === 0 ? client : `${client} (${same + 1})`) };
    this.db.prepare('INSERT INTO agent_identities (id, account_id, client_id, client, name, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(made.id, account, clientId, client, made.name, this.now());
    return made;
  }

  /** A new name for the agent of one of the account's connections; an agent that has not written yet is made with it. */
  rename(by: Account, device: string, name: unknown): AgentIdentity {
    const clean = typeof name === 'string' ? name.trim().slice(0, 100) : '';
    if (!clean) throw new Refused(400, 'no-name', 'Give the agent a name');
    const row = this.db.prepare('SELECT d.account_id, a.client_id, a.client_name FROM agents a JOIN devices d ON d.id = a.device_id WHERE a.device_id = ? AND d.revoked_at IS NULL').get(device) as
      | { account_id: string; client_id: string; client_name: string }
      | undefined;
    if (!row || row.account_id !== by.id) throw new Refused(404, 'no-agent', 'No such agent connection of yours');
    return transaction(this.db, () => {
      const agent = this.identityOf(by.id, row.client_id, row.client_name || 'Agent', clean);
      this.db.prepare('UPDATE agent_identities SET name = ? WHERE id = ?').run(clean, agent.id);
      return { id: agent.id, name: clean };
    });
  }

  /** Ends one of the account's own agent connections: its tokens stop, and the agent has to sign in again. */
  disconnect(by: Account, device: string) {
    const row = this.db.prepare('SELECT d.account_id FROM agents a JOIN devices d ON d.id = a.device_id WHERE a.device_id = ? AND d.revoked_at IS NULL').get(device) as { account_id: string } | undefined;
    if (!row || row.account_id !== by.id) throw new Refused(404, 'no-agent', 'No such agent connection of yours');
    this.end(device);
  }

  private end(device: string) {
    this.accounts.signOut(device);
    this.db.prepare('UPDATE agents SET refresh_hash = NULL WHERE device_id = ?').run(device);
  }
}

/** A redirect address with parameters added, as RFC 6749 sends them. */
function sendBack(redirectUri: string, params: { [key: string]: string }): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
