import { sha256 } from './hash';
import {
  RemoteConflict,
  type RemoteChanges,
  type RemoteEntry,
  type RemoteFile,
  RemoteFolderGone,
  RemoteOffline,
  RemoteSignedOut,
  type RemoteStore,
} from './remote';

// A space on a Scrawl server (apps/server), as the engine's remote; and the server itself, for
// setting it up, signing in and opening spaces. The server speaks what a remote is asked: what
// changed since a cursor, read, write while the file is as last seen, move, remove, an empty
// folder. Its tag is the content's digest, so `hashOf` is SHA-256. See design/server.md,
// sections 5 and 7.

export interface ServerOptions {
  /** The server's address: `https://kaan.scrawlnotes.com`. */
  url: string;
  /** This device's key on the server; null when it has none. */
  token: () => Promise<string | null> | string | null;
  /** `fetch` itself, unless a test gives another. */
  fetch?: typeof fetch;
}

/** An answer of the server that is not what was asked for; the code says what, for the app to say it in its words. */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

async function errorOf(response: Response): Promise<ServerError> {
  let code = '';
  let message = response.statusText;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? '';
    message = body.error?.message ?? message;
  } catch {
    // An answer without a body says no more than its status.
  }
  return new ServerError(response.status, code, message || `The server answered ${response.status}`);
}

/** Answers that say the server is down or busy: nothing was done, the next turn tries again. */
const DOWN = new Set([500, 502, 503, 504]);

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Requests to the server: its address, this device's key, and an unreachable server told as offline. */
class Client {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: ServerOptions) {
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  /** The answer as it comes, but for a server out of reach and, when `signed`, a key it no longer takes. */
  async request(path: string, init: RequestInit = {}, signed = true): Promise<Response> {
    const headers = new Headers(init.headers);
    if (signed) {
      const token = await this.options.token();
      if (!token) throw new RemoteSignedOut(true);
      headers.set('Authorization', `Bearer ${token}`);
    }
    let response: Response;
    try {
      response = await this.fetch(`${this.options.url}/api/v1${path}`, { ...init, headers });
    } catch {
      throw new RemoteOffline();
    }
    if (DOWN.has(response.status)) throw new RemoteOffline();
    if (signed && response.status === 401) throw new RemoteSignedOut();
    return response;
  }

  async json<T>(path: string, init: RequestInit = {}, signed = true): Promise<T> {
    const response = await this.request(path, init, signed);
    if (!response.ok) throw await errorOf(response);
    return (await response.json()) as T;
  }
}

const jsonBody = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

interface ChangesPage {
  changed: RemoteEntry[];
  removed: string[];
  cursor: string;
  full?: boolean;
  more?: boolean;
  after?: string;
  at?: number;
}

export class ServerRemote implements RemoteStore {
  private readonly client: Client;
  private readonly base: string;

  constructor(options: ServerOptions & { space: string }) {
    this.client = new Client(options);
    this.base = `/spaces/${encodeURIComponent(options.space)}`;
  }

  async changes(cursor: string | null, onListed?: (count: number) => void): Promise<RemoteChanges> {
    const changed: RemoteEntry[] = [];
    const removed: string[] = [];
    let query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    let full = false;
    for (;;) {
      const page = await this.call<ChangesPage>(`${this.base}/changes${query}`);
      changed.push(...page.changed);
      removed.push(...page.removed);
      onListed?.(changed.length + removed.length);
      if (page.full) full = true;
      if (!page.more) return { changed, removed, cursor: page.cursor, ...(full && { full: true }) };
      // An entire listing goes on from the last key it reached, as things stood when it began.
      query = page.after !== undefined ? `?after=${encodeURIComponent(page.after)}&at=${page.at}` : `?cursor=${encodeURIComponent(page.cursor)}`;
    }
  }

  async read(path: string, onBytes?: (done: number) => void): Promise<Blob> {
    const response = await this.client.request(`${this.base}/files/${encodePath(path)}`);
    if (!response.ok) return this.fail(response, path);
    if (!onBytes || !response.body) return response.blob();
    const parts: Uint8Array[] = [];
    let done = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      parts.push(value);
      done += value.length;
      onBytes(done);
    }
    return new Blob(parts as BlobPart[]);
  }

  async write(path: string, data: Blob, ifMatch: string | null, onBytes?: (done: number) => void): Promise<RemoteFile> {
    const response = await this.client.request(`${this.base}/files/${encodePath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', ...(ifMatch === null ? { 'If-None-Match': '*' } : { 'If-Match': `"${ifMatch}"` }) },
      body: data,
    });
    if (!response.ok) return this.fail(response, path);
    onBytes?.(data.size);
    return (await response.json()) as RemoteFile;
  }

  async move(from: string, to: string, ifMatch: string | null): Promise<RemoteFile> {
    const response = await this.client.request(`${this.base}/move`, jsonBody({ from, to, ifMatch }));
    if (!response.ok) return this.fail(response, from);
    return (await response.json()) as RemoteFile;
  }

  async remove(path: string, ifMatch: string | null): Promise<void> {
    const response = await this.client.request(`${this.base}/files/${encodePath(path)}`, { method: 'DELETE', ...(ifMatch !== null && { headers: { 'If-Match': `"${ifMatch}"` } }) });
    if (!response.ok) await this.fail(response, path);
  }

  async mkdir(path: string): Promise<void> {
    const response = await this.client.request(`${this.base}/dirs`, jsonBody({ path }));
    if (!response.ok) await this.fail(response, path);
  }

  hashOf(data: Blob): Promise<string> {
    return sha256(data);
  }

  private async call<T>(path: string): Promise<T> {
    const response = await this.client.request(path);
    if (!response.ok) return this.fail(response);
    return (await response.json()) as T;
  }

  /** A refusal as the engine knows it: the file not as last seen, the space gone or not this person's, or the server's own word. */
  private async fail(response: Response, path = ''): Promise<never> {
    const error = await errorOf(response);
    if (response.status === 412 || error.code === 'no-file') throw new RemoteConflict(path);
    if (error.code === 'no-space' || error.code === 'not-member') throw new RemoteFolderGone(error.code === 'not-member');
    throw error;
  }
}

export interface ServerStatus {
  version: string;
  /** No one has an account yet: the first to connect sets it up. */
  new: boolean;
  /** It is new and can still be set up; it can for an hour after it started. */
  setupOpen: boolean;
  /** It keeps personal spaces; a server from before they came leaves it out, and would open a shared one instead. */
  personal?: boolean;
}

export interface ServerAccountInfo {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

export interface ServerSpace {
  id: string;
  name: string;
  role: 'manager' | 'member';
  people: number;
  /** The account's own personal space there; a server before it had them leaves it out. */
  personal?: boolean;
}

export interface ServerSignedIn {
  token: string;
  account: ServerAccountInfo;
}

/** Someone with an account on the server, as its owner and admins see them. */
export interface ServerPerson extends ServerAccountInfo {
  /** How many of its spaces they are in. */
  spaces: number;
  /** When one of their devices was last seen; null when none was. */
  seen: number | null;
}

/** A shared space on the server as its owner and admins see it: who is in it, by account id. */
export interface ServerSharedSpace {
  id: string;
  name: string;
  people: number;
  members: string[];
}

/** Someone in a space on the server. */
export interface ServerMember {
  id: string;
  email: string;
  name: string;
  role: 'manager' | 'member';
  /** Their role on the server: its owner and admins are taken out of a space only by the owner or an admin. */
  serverRole: ServerAccountInfo['role'];
  seen: number | null;
}

/** A link a server made: an invite into a space, or one for a new password. */
export interface ServerLink {
  link: string;
  /** When it runs out. */
  expires: number;
}

/** What a link is, before it is used. */
export type ServerInvitation =
  | { kind: 'space'; space: { id: string; name: string }; by: string; expires: number }
  | { kind: 'reset'; email: string; name: string; expires: number };

/** The server itself: how it stands, setting it up, signing in and out, and its spaces. */
/** An agent connected to the account on the server: a client that signed in through the server's own sign-in (design/agent.md, 7). */
export interface ServerAgent {
  id: string;
  /** What the client called itself: "Claude", "ChatGPT". */
  client: string;
  connected: number;
  seen: number;
  /** The agent's own name, which the person changes; null until it has written (design/activity.md 2.1). */
  name?: string | null;
}

export class ServerAccount {
  private readonly client: Client;

  constructor(options: ServerOptions) {
    this.client = new Client(options);
  }

  status(): Promise<ServerStatus> {
    return this.client.json('/server', {}, false);
  }

  /** The first account, the owner's, on a new server; with the person's id from `me.json`. */
  setUp(input: { name: string; email: string; password: string; person: string; device: string }): Promise<ServerSignedIn> {
    return this.client.json('/setup', jsonBody(input), false);
  }

  signIn(input: { email: string; password: string; device: string }): Promise<ServerSignedIn> {
    return this.client.json('/sessions', jsonBody(input), false);
  }

  /** Ends this device's key on the server. */
  async signOut(): Promise<void> {
    const response = await this.client.request('/sessions/current', { method: 'DELETE' });
    if (!response.ok) throw await errorOf(response);
  }

  me(): Promise<ServerAccountInfo> {
    return this.client.json('/me');
  }

  /** Tells the server the person's time zone, as `Europe/Istanbul`: an agent's "today" there is theirs. */
  setTimeZone(timeZone: string): Promise<ServerAccountInfo & { timeZone: string }> {
    return this.client.json('/me', { ...jsonBody({ timeZone }), method: 'PATCH' });
  }

  /** The spaces this account is in. */
  spaces(): Promise<ServerSpace[]> {
    return this.client.json('/spaces');
  }

  /** A new space on the server, with the id the app made for it; `personal` for the account's own, which anyone opens once. */
  openSpace(id: string, name: string, personal = false): Promise<ServerSpace> {
    return this.client.json('/spaces', jsonBody(personal ? { id, name, personal } : { id, name }));
  }

  /** Names a space anew on the server, for everyone in it; its managers do. */
  renameSpace(space: string, name: string): Promise<ServerSpace> {
    return this.client.json(`/spaces/${encodeURIComponent(space)}`, { ...jsonBody({ name }), method: 'PATCH' });
  }

  /** What an invite or a password link is; a refusal when it was used, ran out or leads nowhere. */
  invitation(code: string): Promise<ServerInvitation> {
    return this.client.json(`/invites/${encodeURIComponent(code)}`, {}, false);
  }

  /** Joins a space with an invite: a new account, or the one with that email and its password. */
  accept(code: string, input: { name: string; email: string; password: string; person: string; device: string }): Promise<ServerSignedIn & { space: ServerSpace }> {
    return this.client.json(`/invites/${encodeURIComponent(code)}/accept`, jsonBody(input), false);
  }

  /** Sets a new password with a link; the account's other devices sign in again. */
  setPassword(code: string, input: { password: string; device: string }): Promise<ServerSignedIn> {
    return this.client.json(`/invites/${encodeURIComponent(code)}/reset`, jsonBody(input), false);
  }

  /** Everyone with an account here, for the owner and the admins. */
  people(): Promise<ServerPerson[]> {
    return this.client.json('/accounts');
  }

  /** Every shared space on the server and who is in it, for its owner and admins; a server from before refuses. */
  sharedSpaces(): Promise<ServerSharedSpace[]> {
    return this.client.json('/shared-spaces');
  }

  /** Makes someone an admin, or a member again; the owner does. */
  setRole(account: string, role: 'admin' | 'member'): Promise<ServerAccountInfo> {
    return this.client.json(`/accounts/${encodeURIComponent(account)}`, { ...jsonBody({ role }), method: 'PATCH' });
  }

  /** Takes someone off the server: out of every space, their keys ended. */
  async removePerson(account: string): Promise<void> {
    const response = await this.client.request(`/accounts/${encodeURIComponent(account)}`, { method: 'DELETE' });
    if (!response.ok) throw await errorOf(response);
  }

  /** A link for someone's new password, for a day. */
  passwordLink(account: string): Promise<ServerLink> {
    return this.client.json(`/accounts/${encodeURIComponent(account)}/reset`, { method: 'POST' });
  }

  /** Who is in a space. */
  members(space: string): Promise<ServerMember[]> {
    return this.client.json(`/spaces/${encodeURIComponent(space)}/members`);
  }

  /** Makes someone in a space a manager, or a member again. */
  setMemberRole(space: string, account: string, role: 'manager' | 'member'): Promise<ServerMember[]> {
    return this.client.json(`/spaces/${encodeURIComponent(space)}/members/${encodeURIComponent(account)}`, { ...jsonBody({ role }), method: 'PATCH' });
  }

  /** Takes someone out of a space. */
  async removeMember(space: string, account: string): Promise<void> {
    const response = await this.client.request(`/spaces/${encodeURIComponent(space)}/members/${encodeURIComponent(account)}`, { method: 'DELETE' });
    if (!response.ok) throw await errorOf(response);
  }

  /** An invite into a space, for one person, for a week. */
  invite(space: string): Promise<ServerLink> {
    return this.client.json(`/spaces/${encodeURIComponent(space)}/invites`, { method: 'POST' });
  }

  /** The agents connected to this account on the server, the newest first. */
  agents(): Promise<ServerAgent[]> {
    return this.client.json('/agents');
  }

  /** A new name for the agent of a connection; what it writes from then on carries it. */
  renameAgent(id: string, name: string): Promise<{ id: string; name: string }> {
    return this.client.json(`/agents/${encodeURIComponent(id)}`, { ...jsonBody({ name }), method: 'PATCH' });
  }

  /** Ends an agent's connection: its tokens stop, and it signs in again the next time it is used. */
  async disconnectAgent(id: string): Promise<void> {
    const response = await this.client.request(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw await errorOf(response);
  }
}

export interface LiveOptions {
  /** The server's address: `https://kaan.scrawlnotes.com`. */
  url: string;
  token: () => Promise<string | null> | string | null;
  /** A space this person is in changed on the server, to its number `seq`. */
  onChanged: (space: string, seq: number) => void;
  /** The connection opened, or closed: whether changes come in as they are made. */
  onLive?: (live: boolean) => void;
  /** The server no longer takes this device's key; `notYet` when this device has none. */
  onSignedOut?: (notYet: boolean) => void;
  /** `WebSocket` itself, unless a test gives another. */
  WebSocket?: typeof WebSocket;
}

/** How long a quiet connection is kept: the server pings every 30 seconds. */
const QUIET_MS = 75_000;

/**
 * The server's live channel (design/server.md, section 5.3): a WebSocket kept open, the key sent
 * as its first message, then a word for every change of the spaces this person is in. A
 * connection lost is opened again, sooner at first and then every 30 seconds at most; sync goes
 * on with its turns meanwhile.
 */
export class ServerLive {
  private socket: WebSocket | null = null;
  private stopped = true;
  private tries = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private quiet: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: LiveOptions) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.open();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.quiet);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  /** Opens again at once what is closed: the network came back, or the app came to the front. */
  wake() {
    if (this.stopped || this.socket) return;
    clearTimeout(this.retry);
    this.tries = 0;
    void this.open();
  }

  private async open() {
    const token = await this.options.token();
    if (this.stopped || this.socket) return;
    if (!token) {
      this.options.onSignedOut?.(true);
      return;
    }
    const Socket = this.options.WebSocket ?? WebSocket;
    let socket: WebSocket;
    try {
      socket = new Socket(`${this.options.url.replace(/^http/, 'ws')}/api/v1/live`);
    } catch {
      this.later();
      return;
    }
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', token }));
    socket.onmessage = (event: MessageEvent) => {
      this.heard(socket);
      let message: { type?: string; space?: string; seq?: number } = {};
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }
      if (message.type === 'ready') {
        this.tries = 0;
        this.options.onLive?.(true);
      } else if (message.type === 'changed' && typeof message.space === 'string') this.options.onChanged(message.space, Number(message.seq));
      else if (message.type === 'signed-out') {
        this.stop();
        this.options.onSignedOut?.(false);
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      clearTimeout(this.quiet);
      this.options.onLive?.(false);
      this.later();
    };
    socket.onerror = () => undefined;
  }

  /** Something came: the connection is alive for a while more. */
  private heard(socket: WebSocket) {
    clearTimeout(this.quiet);
    this.quiet = setTimeout(() => socket.close(), QUIET_MS);
  }

  private later() {
    if (this.stopped) return;
    const wait = Math.min(30_000, 1000 * 2 ** this.tries++);
    this.retry = setTimeout(() => void this.open(), wait);
  }
}

/**
 * What was typed in Connect a server…: the server's address, with an invite's code when it is an
 * invite link. An address without `https://` gets it, but one on this computer, tried without
 * HTTPS, gets `http://`; null when it is neither.
 */
export function readServerInput(text: string): { url: string; invite?: string } | null {
  let value = text.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `${/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value) ? 'http' : 'https'}://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;
  const invite = /^\/join\/([A-Za-z0-9_-]+)\/?$/.exec(parsed.pathname)?.[1];
  return { url: parsed.origin, ...(invite && { invite }) };
}
