import { type ChatInfo, type ChatMessage, chatLink, plainText } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSyncExternalStore } from 'react';
import { clock } from './chatMedia';
import { type ChatServer, store } from './chatStore';
import { isDesktop } from './storage';

// Notifications of new messages on this device (design/chat.md, 6). On the desktop the app shows
// them itself, from the live channel, while it runs, in the tray too (src-tauri/src/alerts.rs). In
// a browser and on a phone the server sends them by Web Push, to a service worker of its own
// (public/push-sw.js), Scrawl open or not; this subscribes to each server that has messaging once
// the person turns them on here. Either way a conversation read takes its notifications away, and
// the app's icon has the number of what is unread and tells the person.

/** This device's choice: notifications shown or not. A computer shows them unless told not to; a browser once turned on. */
const CHOICE = 'scrawl.notify';
/** The chat lists' "Get notified" closed with ×: it does not come back on this device. */
const BANNER = 'scrawl.notifyBanner';
/** How long a message waits while Scrawl is in use on another of the person's devices (design/chat.md, 6.3). */
const ELSEWHERE_MS = 60_000;

/**
 * How notifications stand here: shown, not shown, blocked by the browser, possible only once
 * Scrawl is on an iPhone's Home Screen, or not possible in this browser.
 */
export type NotifyState = 'on' | 'off' | 'blocked' | 'homeScreen' | 'unsupported';

export interface NotifySnapshot {
  state: NotifyState;
  /** Whether the chat lists say "Get notified of new messages": off here, and not closed. */
  banner: boolean;
  /** Turning them on or off, which asks the browser and the servers. */
  busy: boolean;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing: the choice lasts while the page does.
  }
};

/** An iPhone or an iPad, an iPad saying it is a Mac. */
const onIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
/** Opened from the Home Screen, as an app: on an iPhone, the only Scrawl a push reaches. */
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let busy = false;
let snapshot: NotifySnapshot = { state: 'off', banner: false, busy: false };
const listeners = new Set<() => void>();

function stateNow(): NotifyState {
  if (isDesktop) return read(CHOICE) === 'off' ? 'off' : 'on';
  if (onIos() && !standalone()) return 'homeScreen';
  if (!canPush()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return read(CHOICE) === 'on' && Notification.permission === 'granted' ? 'on' : 'off';
}

function changed() {
  const state = stateNow();
  const banner = (state === 'off' || state === 'homeScreen') && read(BANNER) !== 'closed';
  if (state === snapshot.state && banner === snapshot.banner && busy === snapshot.busy) return;
  snapshot = { state, banner, busy };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** How notifications stand here. */
export const notifySnapshot = () => snapshot;

/** How notifications stand here, again whenever it changes. */
export const useNotify = () => useSyncExternalStore(subscribe, notifySnapshot);

/** The chat lists' banner closed: not again on this device. */
export function closeBanner() {
  write(BANNER, 'closed');
  changed();
}

// ---------- turning them on and off ----------

/** Where a server's push worker is registered: a scope of its own, as each subscription is for one server's key. */
const scopeOf = (url: string) => new URL(`/push/${url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_')}/`, location.origin).href;

/** The servers here that send notifications by Web Push. */
const pushServers = () => store.read().servers.filter((server) => server.push);

/** The key a server signs its pushes with, as the Push API takes it. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const text = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

const sameKey = (subscription: PushSubscription, key: Uint8Array) => {
  const had = subscription.options.applicationServerKey;
  if (!had) return false;
  const bytes = new Uint8Array(had);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
};

/** A registration once its worker is active, which a subscription needs. */
function active(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active) return Promise.resolve(registration);
  const worker = registration.installing ?? registration.waiting;
  return new Promise((resolve) => {
    worker?.addEventListener('statechange', () => worker.state === 'activated' && resolve(registration));
  });
}

/** Servers this browser has given its subscription to, this time the app is open. */
const given = new Set<string>();

/** Subscribes this browser to a server's notifications, and gives the server the subscription; again replaces it. */
async function subscribeTo(url: string) {
  const one = store.server(url);
  if (!one) return;
  const registration = await active(await navigator.serviceWorker.register('/push-sw.js', { scope: scopeOf(url) }));
  const key = keyBytes(await one.client.pushKey());
  let subscription = await registration.pushManager.getSubscription();
  // A server that made a new key: the old subscription does not reach it.
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = subscription.toJSON();
  await one.client.subscribePush({ endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } });
  given.add(url);
}

/** The push registrations of this browser, by the server they are for; those of servers not here any more under null. */
async function registrations(): Promise<{ registration: ServiceWorkerRegistration; url: string | null }[]> {
  if (!canPush()) return [];
  const servers = store.read().servers;
  return (await navigator.serviceWorker.getRegistrations())
    .filter((registration) => new URL(registration.scope).pathname.startsWith('/push/'))
    .map((registration) => ({ registration, url: servers.find((server) => scopeOf(server.url) === registration.scope)?.url ?? null }));
}

/**
 * Turns notifications on here. On a computer, nothing to ask; in a browser, its permission is
 * asked with its own window, and each server is given this browser's subscription. Says what came of it.
 */
export async function turnOn(): Promise<'on' | 'off' | 'blocked' | 'failed'> {
  if (isDesktop) {
    write(CHOICE, 'on');
    changed();
    return 'on';
  }
  busy = true;
  changed();
  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
    write(CHOICE, 'on');
    const results = await Promise.allSettled(pushServers().map((server) => subscribeTo(server.url)));
    // Not one server reached: they stay off, to be turned on again.
    if (results.length > 0 && results.every((result) => result.status === 'rejected')) {
      write(CHOICE, 'off');
      return 'failed';
    }
    return 'on';
  } catch {
    write(CHOICE, 'off');
    return 'failed';
  } finally {
    busy = false;
    changed();
  }
}

/** Turns notifications off here: each server forgets this browser's subscription, which goes. */
export async function turnOff() {
  write(CHOICE, 'off');
  if (isDesktop) return changed();
  busy = true;
  changed();
  try {
    for (const { registration, url } of await registrations()) {
      const subscription = await registration.pushManager.getSubscription().catch(() => null);
      if (subscription && url) await store.server(url)?.client.unsubscribePush(subscription.endpoint).catch(() => undefined);
      await subscription?.unsubscribe().catch(() => false);
      await registration.unregister().catch(() => false);
    }
    given.clear();
  } finally {
    busy = false;
    changed();
  }
}

/** Sends a test notification here: on a computer the app shows it; in a browser the first server sends it. Whether it went. */
export async function sendTest(): Promise<boolean> {
  if (isDesktop) {
    await invoke('chat_notify', { alert: { title: 'Scrawl', body: t('notify.testBody'), more: null, tag: 'test', group: 'scrawl', href: '' } });
    return true;
  }
  for (const server of pushServers()) {
    const one = store.server(server.url);
    if (!one) continue;
    let sent = await one.client.testPush().catch(() => 0);
    // A subscription the server lost, or one never given: given again, and tried once more.
    if (sent === 0 && (await subscribeTo(server.url).then(() => true).catch(() => false))) sent = await one.client.testPush().catch(() => 0);
    if (sent > 0) return true;
  }
  return false;
}

/** Each server that sends notifications has this browser's subscription, once a time the app is open; one signed out of loses its worker. */
async function keepSubscribed() {
  if (isDesktop || stateNow() !== 'on') return;
  for (const server of pushServers()) if (!given.has(server.url)) await subscribeTo(server.url).catch(() => undefined);
  for (const { registration, url } of await registrations().catch(() => [])) if (url === null) await registration.unregister().catch(() => false);
}

// ---------- what a notification says ----------

/** The person's name, as the conversation has them. */
const nameIn = (chat: ChatInfo, id: string) => chat.members.find((person) => person.id === id)?.name ?? t('chat.someone');

/** Who wrote it, and where unless it is a direct message of two (design/chat.md, 6.4): as the server's pushes say it. */
function titleOf(server: ChatServer, chat: ChatInfo, message: ChatMessage): string {
  const author = nameIn(chat, message.author);
  if (chat.kind !== 'direct') return `${author} · #${chat.name}`;
  const others = chat.members.filter((person) => person.id !== server.me);
  return others.length > 1 ? `${author} · ${others.map((person) => person.name.split(/\s+/)[0]).join(', ')}` : author;
}

/** Its first 140 characters without Markdown's marks, or what kind of file it is. */
function bodyOf(message: ChatMessage): string {
  const words = plainText(message.body);
  const file = message.files[0];
  let body = words;
  if (!words && file) {
    if (file.type.startsWith('image/')) body = t('chat.photo');
    else if (file.type.startsWith('video/')) body = t('chat.video');
    else if (file.type.startsWith('audio/')) body = file.duration !== undefined ? `${t('chat.voice')} · ${clock(file.duration)}` : t('chat.voice');
    else body = t('chat.fileLine', { name: file.name });
  }
  return body.length > 140 ? `${body.slice(0, 139)}…` : body;
}

// ---------- on the desktop ----------

/** A short name for a server, which its notifications are grouped by. */
function groupOf(url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 0x01000193);
  return `s${(hash >>> 0).toString(16)}`;
}

/** The conversations with a notification on screen, by server and conversation. */
const shown = new Map<string, { url: string; chat: string }>();

/** A new message as the computer's own notification, when it tells this person and is not on screen here. */
function heardNew(url: string, message: ChatMessage) {
  if (!isDesktop || stateNow() !== 'on') return;
  const tells = () => {
    const server = store.read().servers.find((each) => each.url === url);
    const chat = server?.chats.find((each) => each.id === message.chat);
    if (!server || !chat || message.author === server.me || message.deleted) return null;
    if (!chat.joined || chat.alerts === 0 || chat.readSeq >= message.seq || store.onScreen(url, chat.id)) return null;
    return { server, chat };
  };
  const show = () => {
    const now = tells();
    if (!now) return;
    const { server, chat } = now;
    const more = chat.alerts > 1 ? t('chat.newMessages', { count: chat.alerts }) : null;
    shown.set(`${url}\n${chat.id}`, { url, chat: chat.id });
    void invoke('chat_notify', { alert: { title: titleOf(server, chat, message), body: bodyOf(message), more, tag: chat.id, group: groupOf(url), href: chatLink(url, chat.id, message.id) } }).catch(() => undefined);
  };
  const first = tells();
  if (!first) return;
  // In use on another of the person's devices: a minute to read it there first.
  if (!store.inUse() && first.server.active.includes(first.server.me)) window.setTimeout(show, ELSEWHERE_MS);
  else show();
}

/** The notifications of conversations read, here or on another device, go. */
function takeAwayRead() {
  const servers = store.read().servers;
  if (isDesktop) {
    for (const [key, { url, chat }] of shown) {
      const info = servers.find((each) => each.url === url)?.chats.find((each) => each.id === chat);
      if (info && info.alerts > 0) continue;
      shown.delete(key);
      void invoke('chat_unnotify', { tag: chat, group: groupOf(url) }).catch(() => undefined);
    }
    return;
  }
  // A phone hears nothing of what was read elsewhere until Scrawl is open on it: it is then.
  if (document.visibilityState !== 'visible') return;
  void registrations()
    .then((found) =>
      Promise.all(
        found.map(async ({ registration, url }) => {
          const server = servers.find((each) => each.url === url);
          if (!server?.chats.length) return;
          for (const notification of await registration.getNotifications()) {
            const chat = server.chats.find((each) => each.id === (notification.data as { chat?: string } | null)?.chat);
            if (chat && chat.alerts === 0) notification.close();
          }
        }),
      ),
    )
    .catch(() => undefined);
}

// ---------- the app's icon ----------

let badged = -1;

/** The number on the app's icon: the taskbar's on Windows, the Dock's on a Mac, the Home Screen's for an app added there. */
async function badge(count: number) {
  if (count === badged) return;
  badged = count;
  try {
    if (!isDesktop) {
      if ('setAppBadge' in navigator) await (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge());
      return;
    }
    const window = getCurrentWindow();
    if (/Windows/.test(navigator.userAgent)) await window.setOverlayIcon(count > 0 ? await overlayOf(count) : undefined);
    else await window.setBadgeCount(count > 0 ? count : undefined);
  } catch {
    // An icon that keeps no number.
  }
}

/** The small picture over the taskbar's icon on Windows: the number in a red circle. */
async function overlayOf(count: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const draw = canvas.getContext('2d')!;
  draw.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--sl-p1').trim() || '#e5484d';
  draw.beginPath();
  draw.arc(16, 16, 16, 0, Math.PI * 2);
  draw.fill();
  const text = count > 99 ? '99+' : String(count);
  draw.fillStyle = '#fff';
  draw.font = `600 ${text.length === 1 ? 22 : text.length === 2 ? 18 : 13}px "Segoe UI", system-ui, sans-serif`;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.fillText(text, 16, 17);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob!.arrayBuffer());
}

// ---------- a click on a notification ----------

const opens = new Set<(href: string) => void>();
/** The message the app was opened at by a notification: `?chat=<link>`, taken off the address at once. */
let openedAt: string | null = (() => {
  try {
    const params = new URLSearchParams(location.search);
    const href = params.get('chat');
    if (!href) return null;
    params.delete('chat');
    const rest = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
    return href;
  } catch {
    return null;
  }
})();

/** Calls `open` with the link of each notification clicked, the one the app was opened with first. */
export function onNotificationClick(open: (href: string) => void): () => void {
  opens.add(open);
  if (openedAt) {
    open(openedAt);
    openedAt = null;
  }
  return () => opens.delete(open);
}

const clicked = (href: string) => {
  if (!href.startsWith('scrawl:chat/')) return;
  for (const open of opens) open(href);
};

// ---------- starting ----------

let started = false;

/** Follows the chat store: notifications on the desktop, subscriptions in a browser, read ones taken away, the icon's number. */
export function startNotifications() {
  if (started) return;
  started = true;
  store.onNew = heardNew;
  let servers = '';
  store.subscribe(() => {
    const now = store.read();
    void badge(now.alerts);
    takeAwayRead();
    // A server added, or one with push now: it is given this browser's subscription.
    const pushing = now.servers.filter((server) => server.push).map((server) => server.url).join('\n');
    if (pushing !== servers) {
      servers = pushing;
      void keepSubscribed();
    }
  });
  document.addEventListener('visibilitychange', () => {
    changed();
    takeAwayRead();
  });
  if (isDesktop) void listen<string>('chat-open', (event) => clicked(event.payload));
  else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string; href?: string }>) => {
      if (event.data?.type === 'open-chat' && typeof event.data.href === 'string') clicked(event.data.href);
    });
    navigator.serviceWorker.startMessages();
  }
  // Allowed or blocked in the browser's own settings meanwhile.
  void navigator.permissions
    ?.query({ name: 'notifications' })
    .then((status) => status.addEventListener('change', changed))
    .catch(() => undefined);
  changed();
}
