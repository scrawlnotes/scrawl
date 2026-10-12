import { FakeGraph, type GraphOptions, OneDriveAccount, OneDriveRemote, RemoteOffline, RemoteSignedOut, type RemoteStore, type VaultFs } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { isDesktop } from './storage';

// Signing in to OneDrive and keeping the sign-in: the code flow with PKCE. On the desktop the sign-in
// goes on in the system browser, its return is caught on this computer and the tokens are asked for
// by the desktop shell, since Microsoft refuses to give a desktop app's tokens to a web page; the
// long-lived key stays in the system's credential store. In the browser the page goes to Microsoft
// and comes back, the tokens are asked for by the page, and the key, which lasts a day there, stays
// in the browser's storage. The access token is only ever in memory. See design/cloud.md, sections
// 2 and 8b.

/** Scrawl's own app registration: public, as every desktop app's is. */
export const DEFAULT_CLIENT_ID = 'fb9dd1e9-b9b0-40ad-ace0-f47a28240fe4';
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'Files.ReadWrite offline_access User.Read';
/** The name the key is kept under in the credential store. */
const SECRET = 'onedrive';
const CLIENT = 'scrawl.onedriveClient';
/** In the browser: the key and when it was given, and a sign-in waiting for the page to come back. */
const BROWSER_KEY = 'scrawl.onedriveKey';
const PENDING = 'scrawl.signIn';
/** In the browser: the sign-in was renewed on opening in this session already, or tried. */
const RENEWED = 'scrawl.signInRenewed';
/** Microsoft ends a browser's key a day after it was given; it is renewed on opening after this long. */
const RENEW_AFTER_MS = 20 * 60 * 60 * 1000;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (await import('@tauri-apps/api/core')).invoke<T>(command, args);
}

/** The app registration to sign in with: one of the user's own, if they gave one. */
export function clientId(): string {
  try {
    return localStorage.getItem(CLIENT) || DEFAULT_CLIENT_ID;
  } catch {
    return DEFAULT_CLIENT_ID;
  }
}

/** Keeps the user's own app registration; an empty one goes back to Scrawl's. */
export function setClientId(id: string) {
  try {
    if (id.trim() && id.trim() !== DEFAULT_CLIENT_ID) localStorage.setItem(CLIENT, id.trim());
    else localStorage.removeItem(CLIENT);
  } catch {
    // Not kept; the default registration is used.
  }
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomText = (length: number) => base64url(crypto.getRandomValues(new Uint8Array(length)));

/** The proof that the one who asks for the tokens is the one who began the sign-in. */
async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomText(48);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

interface TokenAnswer {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Sends a form to the token address and gives the answer as it came. */
type TokenPost = (form: Record<string, string>) => Promise<{ status: number; body: string }>;

/** On the desktop the shell sends it, without the page's Origin, which Microsoft refuses for a desktop app. */
const postFromShell: TokenPost = async (form) => {
  try {
    return await invoke('token_request', { url: `${AUTHORITY}/token`, form });
  } catch (error) {
    if (String(error).includes('offline')) throw new RemoteOffline();
    throw error;
  }
};

/** In the browser the page sends it; Microsoft takes it for the addresses registered as a single-page application. */
const postFromPage: TokenPost = async (form) => {
  let response: Response;
  try {
    response = await fetch(`${AUTHORITY}/token`, { method: 'POST', body: new URLSearchParams(form) });
  } catch {
    throw new RemoteOffline();
  }
  return { status: response.status, body: await response.text() };
};

/** Asks for tokens; a key that is refused means signing in again. */
async function tokenRequest(post: TokenPost, form: Record<string, string>): Promise<TokenAnswer & { access_token: string }> {
  const answer = await post({ client_id: clientId(), scope: SCOPES, ...form });
  let body: TokenAnswer = {};
  try {
    body = JSON.parse(answer.body) as TokenAnswer;
  } catch {
    // Not JSON: told by its status below.
  }
  if (body.error === 'invalid_grant' || body.error === 'interaction_required') throw new RemoteSignedOut();
  if (answer.status >= 500) throw new RemoteOffline();
  if (!body.access_token) throw new Error(body.error_description?.split('\n')[0] || body.error || `Sign-in failed (${answer.status})`);
  return body as TokenAnswer & { access_token: string };
}

/** A sign-in under way in the browser; `cancel` stops waiting for it. */
export interface SignIn {
  done: Promise<void>;
  cancel(): void;
}

/** What a sign-in is for: connecting the personal space, adding a space, or signing in again after the key stopped working. */
export type SignInIntent = 'connect' | 'space' | 'again';

/** The account signed in to, its tokens on demand, and what can be done in its drive. */
export interface Cloud {
  /** Whether the provider here is a stand-in, for trying sync in the browser while developing. */
  fake: boolean;
  /** Whether signing in takes the page to Microsoft and back (the browser), rather than waiting for the system browser. */
  redirects: boolean;
  /** Signs in; done once the key is kept. In the browser the page leaves instead, and comes back signed in. */
  signIn(intent: SignInIntent, email?: string): SignIn;
  /** Whether a key is kept, so that no sign-in is needed. */
  signedIn(): Promise<boolean>;
  signOut(): Promise<void>;
  account(): OneDriveAccount;
  remote(folder: string, fs: VaultFs): RemoteStore;
}

/** The access token in memory and its renewal from the kept key, wherever that key is kept. */
abstract class SignedCloud {
  readonly fake = false;
  private access: { token: string; until: number } | null = null;
  private asking: Promise<string> | null = null;

  constructor(protected readonly post: TokenPost) {}

  protected abstract keptKey(): Promise<string | null>;
  /** Keeps the newest key; `fresh` when a sign-in gave it, not a renewal. */
  protected abstract keepKey(key: string, fresh: boolean): Promise<void>;

  /** An access token: the one in memory while it lasts, otherwise a new one for the kept key. */
  token = (fresh: boolean): Promise<string> => {
    if (!fresh && this.access && Date.now() < this.access.until) return Promise.resolve(this.access.token);
    this.asking ??= this.renew().finally(() => {
      this.asking = null;
    });
    return this.asking;
  };

  private async renew(): Promise<string> {
    const key = await this.keptKey();
    if (!key) throw new RemoteSignedOut();
    const answer = await tokenRequest(this.post, { grant_type: 'refresh_token', refresh_token: key });
    // Microsoft may hand out a new key with each token; the newest is the one kept.
    if (answer.refresh_token && answer.refresh_token !== key) await this.keepKey(answer.refresh_token, false);
    this.keepAccess(answer);
    return answer.access_token;
  }

  /** Takes the tokens a sign-in brought. */
  protected async signedInWith(answer: TokenAnswer & { access_token: string }) {
    if (!answer.refresh_token) throw new Error(t('cloud.noKey'));
    await this.keepKey(answer.refresh_token, true);
    this.keepAccess(answer);
  }

  private keepAccess(answer: TokenAnswer & { access_token: string }) {
    // A minute early, so that a token never runs out in the middle of a turn.
    this.access = { token: answer.access_token, until: Date.now() + ((answer.expires_in ?? 3600) - 60) * 1000 };
  }

  protected forgetAccess() {
    this.access = null;
  }

  private options(): GraphOptions {
    return { token: this.token };
  }

  account() {
    return new OneDriveAccount(this.options());
  }

  remote(folder: string, fs: VaultFs) {
    return new OneDriveRemote({ ...this.options(), folder, fs });
  }
}

/** On the desktop: the system browser, a listener on this computer, and the credential store. */
class DesktopCloud extends SignedCloud implements Cloud {
  readonly redirects = false;

  constructor() {
    super(postFromShell);
  }

  protected keptKey() {
    return invoke<string | null>('secret_get', { name: SECRET });
  }

  protected async keepKey(key: string) {
    await invoke('secret_set', { name: SECRET, value: key });
  }

  signIn(): SignIn {
    let cancelled = false;
    const done = (async () => {
      const { verifier, challenge } = await pkce();
      const state = randomText(16);
      const port = await invoke<number>('oauth_listen');
      const redirect = `http://localhost:${port}`;
      const query = new URLSearchParams({
        client_id: clientId(),
        response_type: 'code',
        redirect_uri: redirect,
        response_mode: 'query',
        scope: SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      await invoke('open_url', { url: `${AUTHORITY}/authorize?${query}` });
      const code = await invoke<string>('oauth_wait', { port, state, pages: { done: t('cloud.browserDone'), failed: t('cloud.browserFailed') } });
      if (cancelled) return;
      await this.signedInWith(await tokenRequest(this.post, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier }));
    })();
    return {
      done: done.then(() => {
        if (cancelled) throw new DOMException('Cancelled', 'AbortError');
      }),
      cancel: () => {
        cancelled = true;
      },
    };
  }

  async signedIn(): Promise<boolean> {
    return (await this.keptKey()) !== null;
  }

  async signOut(): Promise<void> {
    this.forgetAccess();
    await invoke('secret_delete', { name: SECRET });
  }
}

/** What a sign-in that left the page keeps until the page comes back. */
interface Pending {
  verifier: string;
  state: string;
  intent: SignInIntent | 'renew';
  redirect: string;
}

/** How a sign-in that left the page ended, once it came back. */
export interface SignInResult {
  intent: SignInIntent | 'renew';
  /** What went wrong; none when signed in. */
  error?: string;
}

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const text = storage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** In the browser: the page goes to Microsoft and comes back; the key, a day's, is in the browser's storage. */
class BrowserCloud extends SignedCloud implements Cloud {
  readonly redirects = true;

  constructor() {
    super(postFromPage);
  }

  protected async keptKey() {
    return readJson<{ key: string }>(localStorage, BROWSER_KEY)?.key ?? null;
  }

  // A renewed key ends when the first one does: the time kept is that of the sign-in.
  protected async keepKey(key: string, fresh: boolean) {
    const since = fresh ? Date.now() : (readJson<{ since: number }>(localStorage, BROWSER_KEY)?.since ?? Date.now());
    try {
      localStorage.setItem(BROWSER_KEY, JSON.stringify({ key, since }));
    } catch {
      // Not kept: the next turn asks to sign in again.
    }
  }

  /** When the kept key was given; null without one. */
  keySince(): number | null {
    return readJson<{ since: number }>(localStorage, BROWSER_KEY)?.since ?? null;
  }

  signIn(intent: SignInIntent, email?: string): SignIn {
    void this.leave(intent, email);
    // The page leaves; nothing waits here.
    return { done: new Promise<void>(() => undefined), cancel: () => undefined };
  }

  /**
   * Takes the page to Microsoft. Renewing on opening asks nothing (`prompt=none`): Microsoft answers
   * at once, signed in or with an error. Signing in again names the account, so that a single
   * signed-in account goes through without a choice. Returns false when it cannot keep what the
   * return needs, and stays.
   */
  async leave(intent: Pending['intent'], email?: string): Promise<boolean> {
    const { verifier, challenge } = await pkce();
    const state = randomText(16);
    const redirect = `${window.location.origin}/`;
    try {
      sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state, intent, redirect } satisfies Pending));
    } catch {
      return false;
    }
    const query = new URLSearchParams({
      client_id: clientId(),
      response_type: 'code',
      redirect_uri: redirect,
      response_mode: 'query',
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(intent === 'renew' ? { prompt: 'none' } : intent === 'connect' || intent === 'space' ? { prompt: 'select_account' } : {}),
      ...(email && intent !== 'connect' && intent !== 'space' && { login_hint: email }),
    });
    window.location.assign(`${AUTHORITY}/authorize?${query}`);
    return true;
  }

  /** The page came back from Microsoft: the code becomes the tokens, and the address is cleaned. Null when it did not. */
  async finish(): Promise<SignInResult | null> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    if (!code && !error) return null;
    const pending = readJson<Pending>(sessionStorage, PENDING);
    sessionStorage.removeItem(PENDING);
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    // A return this page did not begin is left alone.
    if (!pending || pending.state !== params.get('state')) return null;
    if (error) return { intent: pending.intent, error: params.get('error_description')?.split('\n')[0] || error };
    try {
      await this.signedInWith(await tokenRequest(this.post, { grant_type: 'authorization_code', code: code!, redirect_uri: pending.redirect, code_verifier: pending.verifier }));
    } catch (failure) {
      return { intent: pending.intent, error: failure instanceof Error ? failure.message : String(failure) };
    }
    return { intent: pending.intent };
  }

  async signedIn(): Promise<boolean> {
    return (await this.keptKey()) !== null;
  }

  async signOut(): Promise<void> {
    this.forgetAccess();
    localStorage.removeItem(BROWSER_KEY);
  }
}

/**
 * OneDrive in memory, while developing in the browser: the real adapter and the real screens,
 * against a stand-in for Graph that forgets everything when the page reloads.
 */
class FakeCloud implements Cloud {
  readonly fake = true;
  readonly redirects = false;
  readonly graph = new FakeGraph();
  private signed = false;

  constructor() {
    this.graph.account = { displayName: 'Test account', mail: 'test@example.com', userPrincipalName: 'test@example.com' };
    this.graph.folder('Documents/Receipts');
    this.graph.folder('Notes');
    this.graph.folder('Work');
  }

  signIn(): SignIn {
    let cancelled = false;
    const done = new Promise<void>((resolve, reject) =>
      window.setTimeout(() => {
        if (cancelled) reject(new DOMException('Cancelled', 'AbortError'));
        else {
          this.signed = true;
          resolve();
        }
      }, 1200),
    );
    return { done, cancel: () => (cancelled = true) };
  }

  async signedIn() {
    return this.signed;
  }

  async signOut() {
    this.signed = false;
  }

  private options(): GraphOptions {
    return { fetch: this.graph.fetch, token: async () => this.graph.token };
  }

  account() {
    return new OneDriveAccount(this.options());
  }

  remote(folder: string, fs: VaultFs) {
    return new OneDriveRemote({ ...this.options(), folder, fs });
  }
}

let cloud: Cloud | null | undefined;

/**
 * OneDrive as it can be reached here: on the desktop, and in the browser. While developing in the
 * browser it is a stand-in, unless `VITE_ONEDRIVE=real` asks for the real one.
 */
export function oneDrive(): Cloud {
  if (cloud === undefined || cloud === null) {
    cloud = isDesktop ? new DesktopCloud() : import.meta.env.DEV && import.meta.env.VITE_ONEDRIVE !== 'real' ? new FakeCloud() : new BrowserCloud();
  }
  return cloud;
}

/** The stand-in Graph, while developing in the browser: for trying another device's changes from the console. */
export const fakeGraph = () => (cloud instanceof FakeCloud ? cloud.graph : null);

let result: SignInResult | null = null;

/**
 * Before the app is drawn, in the browser: a sign-in that left the page is finished; or, for a
 * space whose sign-in is getting old, the page goes to Microsoft and back to renew it, once a
 * session and only online. Returns false when the page is leaving.
 */
export async function prepareSignIn(connectedAs: string | null): Promise<boolean> {
  const here = oneDrive();
  if (!(here instanceof BrowserCloud)) return true;
  result = await here.finish();
  if (result || connectedAs === null || !navigator.onLine) return true;
  const since = here.keySince();
  let tried = false;
  try {
    tried = sessionStorage.getItem(RENEWED) !== null;
  } catch {
    return true;
  }
  if (since === null || tried || Date.now() - since < RENEW_AFTER_MS) return true;
  sessionStorage.setItem(RENEWED, '1');
  return !(await here.leave('renew', connectedAs || undefined));
}

/** How the sign-in that left the page ended, once; null when there was none. */
export function takeSignInResult(): SignInResult | null {
  const taken = result;
  result = null;
  return taken;
}
