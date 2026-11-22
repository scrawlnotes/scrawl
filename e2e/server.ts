// The test server's accounts and the calls a test makes to it as its owner. Test values only, for
// the server `pnpm e2e` starts on an empty folder; nothing here reaches a real server.
import { createHash, randomBytes } from 'node:crypto';

export const SERVER = 'http://localhost:8199';
export const OWNER = { name: 'Olive Owner', email: 'owner@scrawl.test', password: 'e2e-owner-password' };
// Every person a test makes signs up with this; each has an email of their own (5 tries a minute per email).
export const PASSWORD = 'e2e-person-password';

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(`${SERVER}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(init.token && { authorization: `Bearer ${init.token}` }) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** Sets the server up with its owner, once a run, and gives the owner's key. */
export async function setUpOwner(): Promise<string> {
  const { token } = await call<{ token: string }>('/api/v1/setup', { body: { ...OWNER, device: 'e2e' } });
  return token;
}

const ownerToken = () => {
  const token = process.env.E2E_OWNER_TOKEN;
  if (!token) throw new Error('No owner key: global-setup.ts did not run');
  return token;
};

/** A link to join a space; each is used once, so each person gets their own. */
export async function invite(space: string): Promise<string> {
  return (await call<{ link: string }>(`/api/v1/spaces/${space}/invites`, { method: 'POST', token: ownerToken() })).link;
}

/** A shared space of the owner's, with a name of its own for the test (a number after it), and a link to join it. */
export async function spaceWithInvite(name: string): Promise<{ id: string; name: string; link: string }> {
  const id = `sp-${randomBytes(4).toString('hex')}`;
  const named = `${name} ${randomBytes(2).toString('hex')}`;
  await call('/api/v1/spaces', { body: { id, name: named }, token: ownerToken() });
  return { id, name: named, link: await invite(id) };
}

const form = (fields: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(), redirect: 'manual' as const });

/**
 * An agent of a person on the test server, as Claude connects: it registers, the person signs in on the
 * server's page and allows it, and its code becomes a token. Gives a caller of the server's MCP tools.
 */
export async function agentOf(who: { email: string; password: string }, name = 'Test agent') {
  const redirect = 'http://localhost:1/callback';
  const registered = (await (await fetch(`${SERVER}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: name, redirect_uris: [redirect] }) })).json()) as { client_id: string };
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const params = { client_id: registered.client_id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'e2e', resource: `${SERVER}/mcp`, scope: 'scrawl offline_access' };
  const allowed = await fetch(`${SERVER}/oauth/authorize`, form({ ...params, email: who.email, password: who.password, decision: 'allow' }));
  const code = new URL(allowed.headers.get('location') ?? 'http://x/').searchParams.get('code');
  if (!code) throw new Error(`The sign-in for the agent did not allow it: ${allowed.status}`);
  const tokens = (await (await fetch(`${SERVER}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: registered.client_id, resource: `${SERVER}/mcp` }))).json()) as { access_token: string };

  // MCP over HTTP: JSON-RPC posts; an answer may come as JSON or as server-sent events.
  let session: string | null = null;
  let id = 0;
  const rpc = async (method: string, params?: unknown, notification = false) => {
    const response = await fetch(`${SERVER}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session && { 'mcp-session-id': session }) },
      body: JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined && { params }), ...(!notification && { id: ++id }) }),
    });
    session = response.headers.get('mcp-session-id') ?? session;
    if (notification) return null;
    const text = await response.text();
    const json = response.headers.get('content-type')?.includes('event-stream') ? text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5)).at(-1)! : text;
    const answer = JSON.parse(json) as { result?: any; error?: { message: string } };
    if (answer.error) throw new Error(`${method}: ${answer.error.message}`);
    return answer.result;
  };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name, version: '1.0.0' } });
  await rpc('notifications/initialized', undefined, true);
  /** Calls a tool; what it said back, as text. */
  return async (tool: string, args: Record<string, unknown>): Promise<string> => {
    const result = await rpc('tools/call', { name: tool, arguments: args });
    const text = (result.content as { type: string; text?: string }[]).map((part) => part.text ?? '').join('\n');
    if (result.isError) throw new Error(`${tool}: ${text}`);
    return text;
  };
}

/** A person of a test: their name and an email no other test uses. */
export const person = (name: string) => ({ name, email: `${name.toLowerCase()}-${randomBytes(3).toString('hex')}@scrawl.test`, password: PASSWORD });
