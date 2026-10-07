import { FakeGraph, type GraphOptions, OneDriveAccount, OneDriveRemote, RemoteOffline, RemoteSignedOut, type RemoteStore, type VaultFs } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { isDesktop } from './storage';

// Signing in to OneDrive and keeping the sign-in: the code flow with PKCE in the system browser,
// the browser's return caught on this computer, and the tokens asked for by the desktop shell,
// since Microsoft refuses to give a desktop app's tokens to a web page. The long-lived key stays
// in the system's credential store; the access token only in memory. See design/cloud.md,
// section 2.

/** Scrawl's own app registration: public, as every desktop app's is. */
export const DEFAULT_CLIENT_ID = 'fb9dd1e9-b9b0-40ad-ace0-f47a28240fe4';
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'Files.ReadWrite offline_access User.Read';
/** The name the key is kept under in the credential store. */
const SECRET = 'onedrive';
const CLIENT = 'scrawl.onedriveClient';

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

interface TokenAnswer {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Posts to the token address through the shell; a key that is refused means signing in again. */
async function tokenRequest(form: Record<string, string>): Promise<TokenAnswer & { access_token: string }> {
  let answer: { status: number; body: string };
  try {
    answer = await invoke('token_request', { url: `${AUTHORITY}/token`, form: { client_id: clientId(), scope: SCOPES, ...form } });
  } catch (error) {
    if (String(error).includes('offline')) throw new RemoteOffline();
    throw error;
  }
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

/** The account signed in to, its tokens on demand, and what can be done in its drive. */
export interface Cloud {
  /** Whether the provider here is a stand-in, for trying sync in the browser while developing. */
  fake: boolean;
  /** Opens the sign-in in the system browser; done once the key is kept. */
  signIn(): SignIn;
  /** Whether a key is kept, so that no sign-in is needed. */
  signedIn(): Promise<boolean>;
  signOut(): Promise<void>;
  account(): OneDriveAccount;
  remote(folder: string, fs: VaultFs): RemoteStore;
}

class OneDriveCloud implements Cloud {
  readonly fake = false;
  private access: { token: string; until: number } | null = null;
  private asking: Promise<string> | null = null;

  /** An access token: the one in memory while it lasts, otherwise a new one for the kept key. */
  token = (fresh: boolean): Promise<string> => {
    if (!fresh && this.access && Date.now() < this.access.until) return Promise.resolve(this.access.token);
    this.asking ??= this.renew().finally(() => {
      this.asking = null;
    });
    return this.asking;
  };

  private async renew(): Promise<string> {
    const key = await invoke<string | null>('secret_get', { name: SECRET });
    if (!key) throw new RemoteSignedOut();
    const answer = await tokenRequest({ grant_type: 'refresh_token', refresh_token: key });
    // Microsoft may hand out a new key with each token; the newest is the one kept.
    if (answer.refresh_token && answer.refresh_token !== key) await invoke('secret_set', { name: SECRET, value: answer.refresh_token });
    this.keepAccess(answer);
    return answer.access_token;
  }

  private keepAccess(answer: TokenAnswer & { access_token: string }) {
    // A minute early, so that a token never runs out in the middle of a turn.
    this.access = { token: answer.access_token, until: Date.now() + ((answer.expires_in ?? 3600) - 60) * 1000 };
  }

  signIn(): SignIn {
    let cancelled = false;
    const done = (async () => {
      const verifier = randomText(48);
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
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
      const answer = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
      if (!answer.refresh_token) throw new Error(t('cloud.noKey'));
      await invoke('secret_set', { name: SECRET, value: answer.refresh_token });
      this.keepAccess(answer);
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
    return (await invoke<string | null>('secret_get', { name: SECRET })) !== null;
  }

  async signOut(): Promise<void> {
    this.access = null;
    await invoke('secret_delete', { name: SECRET });
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

/**
 * OneDrive in memory, while developing in the browser: the real adapter and the real screens,
 * against a stand-in for Graph that forgets everything when the page reloads.
 */
class FakeCloud implements Cloud {
  readonly fake = true;
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

/** OneDrive as it can be reached here: on the desktop; in the browser only while developing, as a stand-in. Null where there is none yet. */
export function oneDrive(): Cloud | null {
  if (cloud === undefined) cloud = isDesktop ? new OneDriveCloud() : import.meta.env.DEV ? new FakeCloud() : null;
  return cloud;
}

/** The stand-in Graph, while developing in the browser: for trying another device's changes from the console. */
export const fakeGraph = () => (cloud instanceof FakeCloud ? cloud.graph : null);
