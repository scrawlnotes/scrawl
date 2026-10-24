import {
  applyChatChanges,
  ChatClient,
  type ChatEvent,
  type ChatFile,
  type ChatInfo,
  type ChatNotify,
  type ChatKept,
  type ChatMessage,
  newMessageId,
  RemoteOffline,
  ServerAccount,
  ServerError,
  ServerLive,
  withMessages,
} from '@scrawlnotes/core';
import { useSyncExternalStore } from 'react';
import { knownServers, onServersChanged, serverKey } from './servers';

// Messaging on this device (design/chat.md, 11.5): for every server it is signed in to that has
// messaging, the conversations and their latest messages, kept on the device so that Chat opens
// at once and reads without a network; what is written before it is sent; who is writing and who
// is using Scrawl. A live channel of its own brings what happens as it happens, and the device
// says on it whether Scrawl is in use here and which conversation is on its screen.

/** A message written here and not sent yet: shown at once, sent when the server is reached. */
export interface Pending {
  id: string;
  chat: string;
  body: string;
  replyTo: string | null;
  /** Its files, uploaded before it was written. */
  files: ChatFile[];
  at: number;
  /** Why the server would not take it; unset while it waits to be sent. */
  failed?: string;
}

/** One server's messaging, as the screens read it. */
export interface ChatServer {
  url: string;
  /** Who this device is there. */
  me: string;
  chats: ChatInfo[];
  messages: { [chat: string]: ChatMessage[] };
  /** Whether a conversation has older messages than those here. */
  older: { [chat: string]: boolean };
  pending: Pending[];
  /** Who is writing in each conversation, until when. */
  typing: { [chat: string]: { [account: string]: number } };
  /** Who of those sharing a space is using Scrawl now. */
  active: string[];
  /** The largest file the server takes, in megabytes; null when it does not say. */
  maxFileMb: number | null;
  /** A room read without being in it, from Browse rooms: there while it is open. */
  visiting: ChatInfo | null;
}

export interface ChatSnapshot {
  servers: ChatServer[];
  /** What is unread and tells this person, in all of them. */
  alerts: number;
}

/** How many of a conversation's messages are kept on the device; older ones come from the server. */
const KEEP = 500;
/** How long someone shows as writing after they last said so. */
const TYPING_MS = 6000;
/** How often this device says its person is writing, while they are. */
const TYPING_EVERY_MS = 3000;
/** How long after the last touch Scrawl counts as in use. */
const IN_USE_MS = 5 * 60 * 1000;

// ---------- kept on the device ----------

interface Kept extends ChatKept {
  url: string;
  me: string;
  pending: Pending[];
}

const DB = 'scrawl-chat';
const STORE = 'servers';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'url' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let db: Promise<IDBDatabase> | null = null;
const database = () => (db ??= openDb());

async function readKept(url: string): Promise<Kept | null> {
  try {
    const store = (await database()).transaction(STORE).objectStore(STORE);
    return await new Promise((resolve) => {
      const request = store.get(url);
      request.onsuccess = () => resolve((request.result as Kept | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeKept(kept: Kept) {
  try {
    const store = (await database()).transaction(STORE, 'readwrite').objectStore(STORE);
    store.put(kept);
  } catch {
    // Not kept: the next opening asks the server for everything.
  }
}

// ---------- the drafts and the conversation on screen ----------

const draftKey = (url: string, chat: string) => `scrawl.chatDraft:${url}:${chat}`;

/** What was written in a conversation and not sent, on this device. */
export function draftOf(url: string, chat: string): string {
  try {
    return localStorage.getItem(draftKey(url, chat)) ?? '';
  } catch {
    return '';
  }
}

export function keepDraft(url: string, chat: string, text: string) {
  try {
    if (text.trim()) localStorage.setItem(draftKey(url, chat), text);
    else localStorage.removeItem(draftKey(url, chat));
  } catch {
    // Not kept: the draft goes with the conversation.
  }
}

const OPEN = 'scrawl.chatOpen';

/** The conversation last open in Chat on this device. */
export function lastOpen(): { url: string; chat: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(OPEN) ?? 'null') as { url?: unknown; chat?: unknown } | null;
    return value && typeof value.url === 'string' && typeof value.chat === 'string' ? { url: value.url, chat: value.chat } : null;
  } catch {
    return null;
  }
}

export function keepOpen(url: string, chat: string) {
  try {
    localStorage.setItem(OPEN, JSON.stringify({ url, chat }));
  } catch {
    // Not kept: Chat opens on its first conversation.
  }
}

// ---------- one server ----------

class OneServer {
  readonly client: ChatClient;
  private live: ServerLive | null = null;
  state: ChatServer;
  private cursor: number | null = null;
  private turning: Promise<void> | null = null;
  private again = false;
  private saving = 0;
  private typedAt = new Map<string, number>();

  constructor(
    readonly url: string,
    me: string,
    maxFileMb: number | null,
    private readonly changed: () => void,
  ) {
    this.client = new ChatClient({ url, token: () => serverKey(url) });
    this.state = { url, me, chats: [], messages: {}, older: {}, pending: [], typing: {}, active: [], maxFileMb, visiting: null };
  }

  async start() {
    const kept = await readKept(this.url);
    if (kept && kept.me === this.state.me) {
      this.cursor = kept.cursor;
      this.set({ chats: kept.chats, messages: kept.messages, pending: kept.pending.filter((each) => !each.failed) });
    }
    this.live = new ServerLive({
      url: this.url,
      token: () => serverKey(this.url),
      onChanged: () => undefined,
      onLive: (on) => {
        if (!on) return;
        // Back on the channel: what changed meanwhile, what waits to go, and whether this device is in use.
        void this.turn();
        void this.flush();
        store.tellUse(true);
      },
      onEvent: (event) => this.heard(event as ChatEvent),
    });
    this.live.start();
    await this.turn();
    void this.flush();
  }

  stop() {
    this.live?.stop();
    this.live = null;
  }

  wake() {
    this.live?.wake();
    void this.turn();
  }

  say(message: object) {
    this.live?.send(message);
  }

  private set(change: Partial<ChatServer>) {
    this.state = { ...this.state, ...change };
    this.changed();
    window.clearTimeout(this.saving);
    this.saving = window.setTimeout(() => this.save(), 800);
  }

  private save() {
    const messages: Kept['messages'] = {};
    for (const [chat, list] of Object.entries(this.state.messages)) messages[chat] = list.slice(-KEEP);
    void writeKept({ url: this.url, me: this.state.me, chats: this.state.chats, messages, cursor: this.cursor, pending: this.state.pending });
  }

  /** Asks what changed since the last number seen, as many pages as there are; one turn at a time. */
  turn(): Promise<void> {
    if (this.turning) {
      this.again = true;
      return this.turning;
    }
    this.turning = (async () => {
      try {
        do {
          this.again = false;
          let more = true;
          while (more) {
            const changes = await this.client.changes(this.cursor);
            const kept = applyChatChanges({ chats: this.state.chats, messages: this.state.messages, cursor: this.cursor }, changes);
            this.cursor = kept.cursor;
            this.set({ chats: kept.chats, messages: kept.messages });
            more = changes.more === true;
          }
        } while (this.again);
      } catch {
        // Out of reach or signed out: what is kept stays, and the channel's return asks again.
      } finally {
        this.turning = null;
      }
    })();
    return this.turning;
  }

  private heard(event: ChatEvent) {
    if (event.type === 'message') {
      this.put([event.message]);
      // The counts are the server's: they come with the next turn.
      void this.turn();
    } else if (event.type === 'chat') void this.turn();
    else if (event.type === 'typing') {
      const typing = { ...this.state.typing, [event.chat]: { ...this.state.typing[event.chat], [event.account]: Date.now() + TYPING_MS } };
      this.set({ typing });
      window.setTimeout(() => this.changed(), TYPING_MS + 50);
    } else if (event.type === 'presence') {
      if ('account' in event) {
        const others = this.state.active.filter((each) => each !== event.account);
        this.set({ active: event.active ? [...others, event.account] : others });
      } else this.set({ active: event.active });
    }
  }

  /** Messages as they now are, into their conversations; one written here takes the place of its pending copy. */
  put(messages: ChatMessage[]) {
    const byChat = { ...this.state.messages };
    for (const message of messages) byChat[message.chat] = withMessages(byChat[message.chat] ?? [], [message]);
    const sent = new Set(messages.map((message) => message.id));
    this.set({ messages: byChat, pending: this.state.pending.filter((each) => !sent.has(each.id)) });
  }

  /** The latest messages of a conversation, when none are here yet. */
  async open(chat: string) {
    if (this.state.messages[chat]?.length) return;
    try {
      const page = await this.client.messages(chat, { limit: 60 });
      this.set({ messages: { ...this.state.messages, [chat]: withMessages(this.state.messages[chat] ?? [], page.messages) }, older: { ...this.state.older, [chat]: page.older } });
    } catch {
      // Not reached: what is kept shows, and the conversation is asked for again when opened again.
    }
  }

  /** The page before the oldest message here. */
  async older(chat: string) {
    const first = this.state.messages[chat]?.[0];
    if (!first || first.seq <= 1) return this.set({ older: { ...this.state.older, [chat]: false } });
    const page = await this.client.messages(chat, { before: first.seq, limit: 60 });
    this.set({ messages: { ...this.state.messages, [chat]: withMessages(this.state.messages[chat] ?? [], page.messages) }, older: { ...this.state.older, [chat]: page.older } });
  }

  /** Writes a message: shown at once, sent now or when the server is reached. */
  send(chat: string, body: string, replyTo: string | null, files: ChatFile[] = []) {
    const pending: Pending = { id: newMessageId(), chat, body, replyTo, files, at: Date.now() };
    this.set({ pending: [...this.state.pending, pending] });
    void this.flush();
  }

  /** Sends what waits, in the order it was written; one the server refuses is marked, the rest go on. */
  private flushing = false;
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const pending of this.state.pending) {
        if (pending.failed) continue;
        try {
          const sent = await this.client.send(pending.chat, { id: pending.id, body: pending.body, replyTo: pending.replyTo, files: pending.files ?? [] });
          this.put([sent]);
        } catch (error) {
          if (error instanceof RemoteOffline) break;
          const why = error instanceof ServerError ? error.code || 'server' : 'server';
          this.set({ pending: this.state.pending.map((each) => (each.id === pending.id ? { ...each, failed: why } : each)) });
        }
      }
    } finally {
      this.flushing = false;
    }
    void this.turn();
  }

  retry(id: string) {
    this.set({ pending: this.state.pending.map((each) => (each.id === id ? { ...each, failed: undefined } : each)) });
    void this.flush();
  }

  discard(id: string) {
    this.set({ pending: this.state.pending.filter((each) => each.id !== id) });
  }

  /** Someone read up to a message here: the list says so at once, the server after. */
  read(chat: string, seq: number) {
    const info = this.state.chats.find((each) => each.id === chat);
    if (!info || !info.joined || seq <= info.readSeq) return;
    this.set({ chats: this.state.chats.map((each) => (each.id === chat ? { ...each, readSeq: seq, unread: seq >= each.lastSeq ? 0 : each.unread, alerts: seq >= each.lastSeq ? 0 : each.alerts } : each)) });
    void this.client
      .read(chat, seq)
      .then((fresh) => this.set({ chats: this.state.chats.map((each) => (each.id === chat ? fresh : each)) }))
      .catch(() => undefined);
  }

  /** Says this person is writing in a conversation, every few seconds while they are. */
  typing(chat: string) {
    const now = Date.now();
    if (now - (this.typedAt.get(chat) ?? 0) < TYPING_EVERY_MS) return;
    this.typedAt.set(chat, now);
    this.say({ type: 'typing', chat });
  }

  async edit(message: string, body: string) {
    this.put([await this.client.edit(message, body)]);
  }

  async remove(message: string) {
    this.put([await this.client.remove(message)]);
  }

  async react(message: string, emoji: string, on: boolean) {
    this.put([await this.client.react(message, emoji, on)]);
  }

  // ---------- rooms (design/chat.md, 2 and 8.1) ----------

  /** Reads a room without being in it; null leaves it. */
  visit(chat: ChatInfo | null) {
    if (this.state.visiting?.id !== chat?.id) this.set({ visiting: chat });
  }

  /** A change made, then what changed asked for, so that the list shows it before the answer is used. */
  private async made<T>(work: Promise<T>): Promise<T> {
    const done = await work;
    await this.turn();
    return done;
  }

  openRoom(room: { space: string; name: string; topic?: string; kind: 'public' | 'private'; members?: string[] }) {
    return this.made(this.client.openRoom(room));
  }

  /** A space's rooms for Browse rooms: its public ones, the private ones this person is in, and those archived. */
  rooms(space: string) {
    return this.client.rooms(space);
  }

  async join(chat: string) {
    const joined = await this.made(this.client.join(chat));
    if (this.state.visiting?.id === chat) this.set({ visiting: null });
    return joined;
  }

  add(chat: string, accounts: string[]) {
    return this.made(this.client.add(chat, accounts));
  }

  leave(chat: string) {
    return this.made(this.client.leave(chat, this.state.me));
  }

  /** A direct message off the list until its next message, or back on it. */
  hide(chat: string, hidden: boolean) {
    return this.made(this.client.setMine(chat, { hidden }));
  }

  /** What a conversation tells this person: all, mentions or nothing; null for its kind's own. */
  notify(chat: string, notify: ChatNotify | null) {
    return this.made(this.client.setMine(chat, { notify }));
  }

  changeRoom(chat: string, change: { name?: string; topic?: string; archived?: boolean }) {
    return this.made(this.client.changeRoom(chat, change));
  }

  /** The direct message with these people: the one there is, back on the list, or a new one. */
  direct(people: string[]) {
    return this.made(this.client.direct(people));
  }

  shared(chat: string) {
    return this.client.shared(chat);
  }

  /** A conversation's export, its days and times as this device has them. */
  exportZip(chat: string) {
    return this.client.export(chat, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }

  /**
   * Forwards a message to other conversations of the server, each with the words written with it
   * first, as a message of its own (design/chat.md, 3.4).
   */
  async forward(message: string, chats: string[], note: string) {
    for (const chat of chats) {
      if (note.trim()) this.put([await this.client.send(chat, { id: newMessageId(), body: note })]);
      this.put([await this.client.send(chat, { id: newMessageId(), body: '', forwardOf: message })]);
    }
    void this.turn();
  }

  /**
   * Sends a file to the server, to attach to a message: its digest and size come back. How much
   * went is told as it goes; `stop` ends it.
   */
  upload(file: Blob, progress: (sent: number) => void, stop: AbortSignal): Promise<{ hash: string; size: number }> {
    return serverKey(this.url).then(
      (key) =>
        new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('POST', `${this.url}/api/v1/chat/files`);
          if (key) request.setRequestHeader('Authorization', `Bearer ${key}`);
          request.upload.onprogress = (event) => progress(event.loaded);
          request.onload = () => {
            if (request.status >= 200 && request.status < 300) resolve(JSON.parse(request.responseText) as { hash: string; size: number });
            else reject(new Error(request.status === 413 ? 'too-large' : 'upload'));
          };
          request.onerror = () => reject(new Error('offline'));
          request.onabort = () => reject(new Error('stopped'));
          stop.addEventListener('abort', () => request.abort());
          request.send(file);
        }),
    );
  }

  private urls = new Map<string, Promise<string>>();

  /**
   * A file of a message as an address the page shows: kept on the device once read, by its
   * digest, so that it is read from the server once.
   */
  fileUrl(hash: string, type = ''): Promise<string> {
    let url = this.urls.get(hash);
    if (!url) {
      url = this.fileBlob(hash, type).then((blob) => URL.createObjectURL(blob));
      url.catch(() => this.urls.delete(hash));
      this.urls.set(hash, url);
    }
    return url;
  }

  /** A file of a message as it is, from what is kept on the device or else the server. */
  async fileBlob(hash: string, type = ''): Promise<Blob> {
    const address = `${this.url}/api/v1/chat/files/${hash}`;
    const kept = await caches
      .open(FILES)
      .then((cache) => cache.match(address))
      .catch(() => undefined);
    if (kept) return kept.blob();
    const key = await serverKey(this.url);
    const response = await fetch(address, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
    if (!response.ok) throw new Error(`The server answered ${response.status}`);
    const blob = await response.blob();
    const typed = type && !blob.type.startsWith(type.split('/')[0]!) ? new Blob([blob], { type }) : blob;
    void caches
      .open(FILES)
      .then((cache) => cache.put(address, new Response(typed, { headers: { 'Content-Type': typed.type } })))
      .catch(() => undefined);
    return typed;
  }
}

/** Where the files of messages are kept on the device once read. */
const FILES = 'scrawl-chat-files';

// ---------- every server ----------

class ChatStore {
  private servers = new Map<string, OneServer>();
  private snapshot: ChatSnapshot = { servers: [], alerts: 0 };
  private listeners = new Set<() => void>();
  private started = false;
  private lastTouch = Date.now();
  private viewing: { url: string; chat: string } | null = null;
  private use = '';

  start() {
    if (this.started) return;
    this.started = true;
    onServersChanged(() => void this.follow());
    void this.follow();
    const touched = () => {
      const was = this.inUse();
      this.lastTouch = Date.now();
      if (!was) this.tellUse();
    };
    for (const event of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(event, touched, { passive: true });
    window.addEventListener('focus', () => this.tellUse());
    window.addEventListener('blur', () => this.tellUse());
    document.addEventListener('visibilitychange', () => {
      this.tellUse();
      if (document.visibilityState === 'visible') for (const server of this.servers.values()) server.wake();
    });
    window.addEventListener('online', () => {
      for (const server of this.servers.values()) server.wake();
    });
    window.setInterval(() => this.tellUse(), 30_000);
  }

  /** Opens the servers signed in to that have messaging, and closes those signed out of. */
  private async follow() {
    const known = knownServers();
    for (const [url, server] of this.servers) {
      if (known.some((each) => each.url === url)) continue;
      server.stop();
      this.servers.delete(url);
    }
    for (const each of known) {
      if (this.servers.has(each.url) || !(await serverKey(each.url))) continue;
      const account = new ServerAccount({ url: each.url, token: () => serverKey(each.url) });
      let me = each.id ?? '';
      let maxFileMb: number | null = null;
      try {
        const status = await account.status();
        if (!status.chat) continue;
        maxFileMb = status.maxFileMb ?? null;
        if (!me) me = (await account.me()).id;
      } catch {
        continue;
      }
      if (this.servers.has(each.url)) continue;
      const server = new OneServer(each.url, me, maxFileMb, () => this.changed());
      this.servers.set(each.url, server);
      void server.start();
    }
    this.changed();
  }

  server(url: string): OneServer | undefined {
    return this.servers.get(url);
  }

  /** Whether Scrawl is in use on this device now: on screen, in front, touched lately. */
  private inUse(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus() && Date.now() - this.lastTouch < IN_USE_MS;
  }

  /** The conversation on screen in Chat, or none. */
  setViewing(viewing: { url: string; chat: string } | null) {
    this.viewing = viewing;
    this.tellUse();
  }

  /** Says on each server's channel whether Scrawl is in use here, and what is on screen; only when it changed. */
  tellUse(force = false) {
    const active = this.inUse();
    const now = JSON.stringify([active, this.viewing]);
    if (now === this.use && !force) return;
    this.use = now;
    for (const [url, server] of this.servers) server.say({ type: 'active', active, viewing: this.viewing?.url === url ? this.viewing.chat : null });
  }

  private changed() {
    const servers = [...this.servers.values()].map((server) => server.state);
    const alerts = servers.reduce((sum, server) => sum + server.chats.reduce((count, chat) => count + chat.alerts, 0), 0);
    this.snapshot = { servers, alerts };
    for (const heard of this.listeners) heard();
  }

  subscribe = (heard: () => void) => {
    this.listeners.add(heard);
    return () => this.listeners.delete(heard);
  };

  read = () => this.snapshot;
}

export const store = new ChatStore();

/** Messaging as the screens show it, again whenever it changes. */
export const useChat = () => useSyncExternalStore(store.subscribe, store.read);
