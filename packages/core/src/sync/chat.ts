import { errorOf, ServerClient, type ServerOptions } from './server';

// Messaging on a Scrawl server (design/chat.md): the conversations, their messages and what is
// done to them, through the server's API; the messages are not files, so this is the one way to
// them (PLAN 5.5). And what the app works out of them: a mention's link, a message as plain text
// for a quote, which messages run on under one face, and what changed put into what is kept.

export type ChatKind = 'public' | 'private' | 'direct';
export type ChatNotify = 'all' | 'mentions' | 'off';

export interface ChatPerson {
  id: string;
  name: string;
}

export interface ChatFile {
  hash: string;
  name: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  thumb?: string;
}

export interface ChatMessage {
  id: string;
  chat: string;
  seq: number;
  author: string;
  agent: string | null;
  body: string;
  mentions: string[];
  mentionsRoom: boolean;
  replyTo: { id: string; author: string; text: string; file: string | null; deleted: boolean } | null;
  forwarded: { chat: string; kind: ChatKind; name: string; author: string; authorName: string } | null;
  files: ChatFile[];
  reactions: { emoji: string; people: string[] }[];
  at: number;
  edited: number | null;
  deleted: number | null;
  rev: number;
}

export interface ChatInfo {
  id: string;
  kind: ChatKind;
  space: string | null;
  spaceName: string;
  name: string;
  topic: string;
  general: boolean;
  createdBy: string;
  createdAt: number;
  archived: number | null;
  members: ChatPerson[];
  gone: string[];
  lastSeq: number;
  last: ChatMessage | null;
  joined: boolean;
  readSeq: number;
  notify: ChatNotify;
  hidden: boolean;
  unread: number;
  alerts: number;
  reads: { [account: string]: number } | null;
}

/** What changed after a cursor: every conversation someone is in as it now is, and the messages new or changed. */
export interface ChatChanges {
  chats: ChatInfo[];
  messages: ChatMessage[];
  cursor: number;
  full?: true;
  more?: true;
}

export interface ChatPage {
  messages: ChatMessage[];
  older: boolean;
  newer: boolean;
}

/** What the live channel brings of messaging (design/chat.md, 11.3). */
export type ChatEvent =
  | { type: 'message'; chat: string; message: ChatMessage }
  | { type: 'chat'; cursor: number }
  | { type: 'typing'; chat: string; account: string }
  | { type: 'presence'; active: string[] }
  | { type: 'presence'; account: string; active: boolean };

/** What a message is sent with. */
export interface ChatSend {
  id: string;
  body: string;
  replyTo?: string | null;
  files?: ChatFile[];
  forwardOf?: string;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** The server's messaging, for one person on one device. */
export class ChatClient {
  private readonly client: ServerClient;

  constructor(options: ServerOptions) {
    this.client = new ServerClient(options);
  }

  /** Every conversation, without a cursor; with one, what changed after it. */
  changes(cursor: number | null): Promise<ChatChanges> {
    return this.client.json(cursor === null ? '/chat' : `/chat/changes?cursor=${cursor}`);
  }

  chat(id: string): Promise<ChatInfo> {
    return this.client.json(`/chat/${encodeURIComponent(id)}`);
  }

  /** A page of a conversation: its latest, those before or after a place, or those around a message. */
  messages(chat: string, query: { before?: number; after?: number; around?: string; limit?: number } = {}): Promise<ChatPage> {
    const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])));
    const asked = params.toString();
    return this.client.json(`/chat/${encodeURIComponent(chat)}/messages${asked ? `?${asked}` : ''}`);
  }

  send(chat: string, message: ChatSend): Promise<ChatMessage> {
    return this.client.json(`/chat/${encodeURIComponent(chat)}/messages`, json('POST', message));
  }

  edit(message: string, body: string): Promise<ChatMessage> {
    return this.client.json(`/chat/messages/${encodeURIComponent(message)}`, json('PATCH', { body }));
  }

  remove(message: string): Promise<ChatMessage> {
    return this.client.json(`/chat/messages/${encodeURIComponent(message)}`, { method: 'DELETE' });
  }

  react(message: string, emoji: string, on: boolean): Promise<ChatMessage> {
    return this.client.json(`/chat/messages/${encodeURIComponent(message)}/reactions/${encodeURIComponent(emoji)}`, { method: on ? 'PUT' : 'DELETE' });
  }

  read(chat: string, seq: number): Promise<ChatInfo> {
    return this.client.json(`/chat/${encodeURIComponent(chat)}/read`, json('POST', { seq }));
  }

  setMine(chat: string, mine: { notify?: ChatNotify | null; hidden?: boolean }): Promise<ChatInfo> {
    return this.client.json(`/chat/${encodeURIComponent(chat)}/me`, json('PATCH', mine));
  }

  direct(people: string[]): Promise<ChatInfo> {
    return this.client.json('/chat/direct', json('POST', { people }));
  }

  openRoom(room: { space: string; name: string; topic?: string; kind: 'public' | 'private'; members?: string[] }): Promise<ChatInfo> {
    return this.client.json('/chat/rooms', json('POST', room));
  }

  changeRoom(chat: string, change: { name?: string; topic?: string; archived?: boolean }): Promise<ChatInfo> {
    return this.client.json(`/chat/${encodeURIComponent(chat)}`, json('PATCH', change));
  }

  rooms(space: string): Promise<ChatInfo[]> {
    return this.client.json(`/spaces/${encodeURIComponent(space)}/rooms`);
  }

  join(chat: string): Promise<ChatInfo> {
    return this.client.json(`/chat/${encodeURIComponent(chat)}/join`, { method: 'POST' });
  }

  add(chat: string, accounts: string[]): Promise<ChatInfo> {
    return this.client.json(`/chat/${encodeURIComponent(chat)}/members`, json('POST', { accounts }));
  }

  async leave(chat: string, account: string): Promise<void> {
    const response = await this.client.request(`/chat/${encodeURIComponent(chat)}/members/${encodeURIComponent(account)}`, { method: 'DELETE' });
    if (!response.ok) throw await errorOf(response);
  }
}

/** An id for a message, made before it is sent, so that one sent again after a lost answer is written once. */
export const newMessageId = () => `m-${crypto.randomUUID()}`;

// ---------- mentions ----------

/** A person mentioned, as the message has it: `[@Mert Kaya](scrawl:person/<id>)`. */
export const personLink = (name: string, id: string) => `[@${name.replace(/[[\]\\]/g, '')}](scrawl:person/${encodeURIComponent(id)})`;

/** Everyone in a room mentioned. */
export const ROOM_MENTION = '[@room](scrawl:room)';

/** The person a mention's address names, or null for any other address. */
export function mentioned(href: string): string | null {
  const match = /^scrawl:person\/(.+)$/.exec(href);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

/**
 * The mention being typed before the cursor: `@` at the start of the text or after a space, and
 * what follows it up to the cursor; null when there is none.
 */
export function mentionAt(text: string, cursor: number): { from: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = /(^|[\s([])@([\p{L}\p{N}._-]{0,30})$/u.exec(before);
  if (!match) return null;
  return { from: cursor - match[2]!.length - 1, query: match[2]! };
}

// ---------- links to Scrawl ----------

/** What a chip in a message can point at: a note, a list or a task, a board or a card, a collection or a record. */
export type ChipKind = 'note' | 'tasks' | 'task' | 'board' | 'card' | 'collection' | 'record';

const ITEM_KINDS = new Set<string>(['note', 'tasks', 'task', 'board', 'card', 'collection', 'record']);

/** Something of a space a message points at (design/chat.md, 3.7): its kind, the space by its id, its path in the space, and the id of a task, a card or a record, which finds it after it moved. */
export interface ChipRef {
  kind: ChipKind;
  space: string;
  path: string;
  id?: string;
}

/** A chip's address: `scrawl:item/card/sp-…/Sales%2FDeals.board.json?id=…`. */
export function itemLink(item: ChipRef): string {
  return `scrawl:item/${item.kind}/${encodeURIComponent(item.space)}/${encodeURIComponent(item.path)}${item.id ? `?id=${encodeURIComponent(item.id)}` : ''}`;
}

/** What a chip's address points at; null for any other address. */
export function parseItemLink(href: string): ChipRef | null {
  const match = /^scrawl:item\/([a-z]+)\/([^/?]+)\/([^?]*)(?:\?id=(.+))?$/.exec(href);
  if (!match || !ITEM_KINDS.has(match[1]!)) return null;
  try {
    return { kind: match[1] as ChipKind, space: decodeURIComponent(match[2]!), path: decodeURIComponent(match[3]!), ...(match[4] && { id: decodeURIComponent(match[4]) }) };
  } catch {
    return null;
  }
}

/** A chip as a message has it: its name as the link's words, where it is as its title. */
export function itemChip(item: ChipRef, name: string, where: string): string {
  const words = name.replace(/[[\]\\]/g, '').trim() || item.path;
  return `[${words}](${itemLink(item)}${where ? ` "${where.replace(/["\\]/g, '')}"` : ''})`;
}

/** A message's address, by its server's address, its conversation and its id: `scrawl:chat/<server>/<chat>/<message>`. */
export function chatLink(server: string, chat: string, message: string): string {
  return `scrawl:chat/${encodeURIComponent(server)}/${encodeURIComponent(chat)}/${encodeURIComponent(message)}`;
}

/** The message an address points at; null for any other address. */
export function parseChatLink(href: string): { server: string; chat: string; message: string } | null {
  const match = /^scrawl:chat\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(href);
  if (!match) return null;
  try {
    return { server: decodeURIComponent(match[1]!), chat: decodeURIComponent(match[2]!), message: decodeURIComponent(match[3]!) };
  } catch {
    return null;
  }
}

// ---------- reading a message ----------

/**
 * A message as plain text, for a quote, a list's line and a notification: its words without
 * Markdown's marks, a mention as `@Name`, lines run together.
 */
export function plainText(body: string): string {
  return body
    .replace(/```[^\n]*\n([\s\S]*?)(```|$)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How long a person's messages run on under one face. */
const RUN_MS = 5 * 60 * 1000;

/** Whether a message runs on under the face of the one before it: the same writer, within five minutes, the same day. */
export function continues(before: ChatMessage | undefined, message: ChatMessage): boolean {
  if (!before || before.author !== message.author || before.agent !== message.agent) return false;
  if (message.forwarded || message.at - before.at > RUN_MS) return false;
  return new Date(before.at).toDateString() === new Date(message.at).toDateString();
}

// ---------- what is kept ----------

/** A conversation's messages with these put in: each by its id, in order. */
export function withMessages(list: ChatMessage[], messages: ChatMessage[]): ChatMessage[] {
  if (!messages.length) return list;
  const byId = new Map(list.map((message) => [message.id, message]));
  for (const message of messages) {
    const kept = byId.get(message.id);
    // An older copy never takes the place of a newer one.
    if (!kept || kept.rev <= message.rev) byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/** What a device keeps of one server's messaging. */
export interface ChatKept {
  chats: ChatInfo[];
  messages: { [chat: string]: ChatMessage[] };
  cursor: number | null;
}

/**
 * What changed, put into what is kept: the conversations as they now are, those no longer there
 * left with their messages; the messages put in their conversations.
 */
export function applyChatChanges(kept: ChatKept, changes: ChatChanges): ChatKept {
  const ids = new Set(changes.chats.map((chat) => chat.id));
  const messages: ChatKept['messages'] = {};
  for (const [chat, list] of Object.entries(kept.messages)) if (ids.has(chat)) messages[chat] = list;
  const byChat = new Map<string, ChatMessage[]>();
  for (const message of changes.messages) byChat.set(message.chat, [...(byChat.get(message.chat) ?? []), message]);
  for (const [chat, list] of byChat) if (ids.has(chat)) messages[chat] = withMessages(messages[chat] ?? [], list);
  return { chats: changes.chats, messages, cursor: changes.cursor };
}
