import { ServerAccount, type ServerAccountInfo, ServerRemote, type ServerSignedIn } from '@scrawlnotes/core';
import { useSyncExternalStore } from 'react';
import { isDesktop } from './storage';

// The Scrawl servers this device is signed in to (design/server.md, section 7): each one's
// address and who is signed in, for Add space to list; and each one's key, kept apart, in the
// system's credential store on the desktop and in the browser's storage on the web, as the
// OneDrive key is. A device knows the servers it connected to; nothing is listed for it before.

/** A server this device is signed in to. */
export interface KnownServer {
  /** Its address: `https://kaan.scrawlnotes.com`. */
  url: string;
  /** The account's id, the person's: the same on every device signed in to it. */
  id?: string;
  email: string;
  name: string;
  role: ServerAccountInfo['role'];
}

const LIST = 'scrawl.servers';
const browserKey = (url: string) => `scrawl.serverKey:${url}`;
const secretName = (url: string) => `server ${url}`;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (await import('@tauri-apps/api/core')).invoke<T>(command, args);
}

// An invite or a password link the web app was opened with, from the link's page on its server:
// `?join=<link>`. It is taken off the address at once, and kept until Add space has it.
let joining: string | null = (() => {
  try {
    const params = new URLSearchParams(location.search);
    const link = params.get('join');
    if (!link) return null;
    params.delete('join');
    const rest = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
    return link;
  } catch {
    return null;
  }
})();

/** The link the app was opened with, that Add space has not taken yet. */
export const pendingJoin = () => joining;

/** Add space has the link: it is not offered again. */
export function tookJoin() {
  joining = null;
}

/** The address without `https://`, as the app shows a server: `kaan.scrawlnotes.com`. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function knownServers(): KnownServer[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(LIST) ?? '[]');
    return Array.isArray(list) ? list.filter((each): each is KnownServer => !!each && typeof each.url === 'string' && typeof each.email === 'string') : [];
  } catch {
    return [];
  }
}

function keepServers(list: KnownServer[]) {
  try {
    localStorage.setItem(LIST, JSON.stringify(list));
  } catch {
    // Not kept: the server is not listed next time, and is connected to again.
  }
  for (const heard of listeners) heard();
}

// The list as the screens show it, again whenever it changes: signed in, signed out, a role told.
const listeners = new Set<() => void>();
let shown: { raw: string | null; list: KnownServer[] } = { raw: null, list: [] };
const subscribe = (heard: () => void) => {
  listeners.add(heard);
  return () => listeners.delete(heard);
};
const snapshot = () => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LIST);
  } catch {
    // Nothing kept to read: no servers.
  }
  if (raw !== shown.raw) shown = { raw, list: knownServers() };
  return shown.list;
};

/** The servers this device is signed in to, for a screen that lists them. */
export const useKnownServers = () => useSyncExternalStore(subscribe, snapshot);

/** The server last connected to, whose address Connect a server… starts with. */
export const lastServer = (): KnownServer | undefined => knownServers().at(-1);

/** This device's key on a server; null when it has none. */
export async function serverKey(url: string): Promise<string | null> {
  if (isDesktop) return invoke<string | null>('secret_get', { name: secretName(url) });
  try {
    return localStorage.getItem(browserKey(url));
  } catch {
    return null;
  }
}

export const serverAccount = (url: string) => new ServerAccount({ url, token: () => serverKey(url) });

export const serverRemote = (url: string, space: string) => new ServerRemote({ url, token: () => serverKey(url), space });

/** Signed in to a server, or set it up: its key is kept and it is listed, last. */
export async function keepSignIn(url: string, { token, account }: ServerSignedIn): Promise<KnownServer> {
  if (isDesktop) await invoke('secret_set', { name: secretName(url), value: token });
  else localStorage.setItem(browserKey(url), token);
  const server: KnownServer = { url, id: account.id, email: account.email, name: account.name, role: account.role };
  keepServers([...knownServers().filter((each) => each.url !== url), server]);
  return server;
}

/** The role the server gave this account, as it said it last: the list says it too. */
export function noteRole(url: string, role: ServerAccountInfo['role']) {
  const list = knownServers();
  if (list.some((each) => each.url === url && each.role !== role)) keepServers(list.map((each) => (each.url === url ? { ...each, role } : each)));
}

/** Signs out of a server on this device: its key ends there and here, and it is no longer listed. */
export async function signOutOf(url: string) {
  await serverAccount(url)
    .signOut()
    .catch(() => undefined);
  if (isDesktop) await invoke('secret_delete', { name: secretName(url) });
  else localStorage.removeItem(browserKey(url));
  keepServers(knownServers().filter((each) => each.url !== url));
}
