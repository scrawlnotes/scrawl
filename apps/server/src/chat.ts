import { randomBytes } from 'node:crypto';
import { type Account, Refused } from './auth';
import type { Blobs, Taken } from './blobs';
import { type Db, transaction } from './db';
import type { Spaces } from './spaces';

// Messaging (design/chat.md). A room belongs to a shared space: a public one is seen by everyone
// in the space and joined by whoever wants, a private one by those in it, who bring others in;
// every space has a general room everyone in it is in. A direct message belongs to the server:
// two people, or a group of up to nine, who share a space. The messages are not files: they are
// here, and the app asks for them. Each change takes the next number of the chat's count, so that
// a device asks what changed after the last number it saw; and those it concerns hear of it on
// the live channel at once.

export type ChatKind = 'public' | 'private' | 'direct';
export type Notify = 'all' | 'mentions' | 'off';

export interface Person {
  id: string;
  name: string;
}

/** A file in a message: its content by its digest, and what the app shows of it without opening it. */
export interface ChatFile {
  hash: string;
  name: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  /** A recording's or a video's length, in seconds. */
  duration?: number;
  /** A small picture of a photo or a video, made by the app before it sent it. */
  thumb?: string;
}

export interface Message {
  id: string;
  chat: string;
  /** Its place in its conversation: 1, 2, 3… */
  seq: number;
  author: string;
  /** The agent that wrote it for its author, when one did. */
  agent: string | null;
  body: string;
  mentions: string[];
  mentionsRoom: boolean;
  /** The message it answers, as much of it as its quote shows. */
  replyTo: { id: string; author: string; text: string; file: string | null; deleted: boolean } | null;
  /** Where a forwarded message came from, as it was then. */
  forwarded: { chat: string; kind: ChatKind; name: string; author: string; authorName: string } | null;
  files: ChatFile[];
  reactions: { emoji: string; people: string[] }[];
  at: number;
  edited: number | null;
  deleted: number | null;
  rev: number;
}

/** A conversation as one person sees it: what it is, who is in it, and how far they read. */
export interface ChatInfo {
  id: string;
  kind: ChatKind;
  space: string | null;
  /** The space's name, for a device that does not have the space. */
  spaceName: string;
  name: string;
  topic: string;
  general: boolean;
  createdBy: string;
  createdAt: number;
  archived: number | null;
  members: Person[];
  /** Those of them no longer on the server: a direct message with only them is read, not written. */
  gone: string[];
  lastSeq: number;
  last: Message | null;
  /** In it: a public room someone has not joined is read, not written, and counts nothing. */
  joined: boolean;
  readSeq: number;
  notify: Notify;
  hidden: boolean;
  unread: number;
  /** Of the unread, those that tell this person: all of them, their mentions, or none. */
  alerts: number;
  /** In a direct message, how far each of the others read: what Seen says. */
  reads: { [account: string]: number } | null;
  /** Whether this person changes the room's name and topic and archives it: whoever opened it, and its space's managers. */
  manage: boolean;
}

/** A conversation's files and links, the latest first, for its Info window (design/chat.md, 8.1). */
export interface Shared {
  files: { message: string; author: string; at: number; file: ChatFile }[];
  links: { message: string; author: string; at: number; url: string; text: string }[];
}

/** A file of a conversation's export: Markdown written here, or a file's content by its digest. */
export interface ExportEntry {
  name: string;
  text?: string;
  hash?: string;
  at: number;
}

interface ChatRow {
  id: string;
  kind: ChatKind;
  space_id: string | null;
  name: string;
  topic: string;
  general: number;
  direct_key: string | null;
  created_by: string;
  created_at: number;
  archived_at: number | null;
  last_seq: number;
  rev: number;
}

interface MemberRow {
  account_id: string;
  left_at: number | null;
  read_seq: number;
  notify: Notify | null;
  hidden: number;
}

interface MessageRow {
  id: string;
  chat_id: string;
  seq: number;
  author_id: string;
  agent_id: string | null;
  body: string;
  mentions_room: number;
  reply_to: string | null;
  forward_of: string | null;
  forward_from: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  rev: number;
}

interface FileRow {
  message_id: string;
  hash: string;
  name: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumb: string | null;
}

/** What a device hears on the live channel: a message as it now is, or that something else changed. */
export type ChatEvent = { type: 'message'; chat: string; message: Message } | { type: 'chat'; cursor: number };

const MESSAGE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const HASH = /^[0-9a-f]{64}$/;
const EMOJI = /^[^\s\p{ASCII}]{1,16}$/u;
const MAX_BODY = 40_000;
const MAX_FILES = 10;
const MAX_GROUP = 9;
const MAX_NAME = 40;
const MAX_TOPIC = 250;
const PAGE = 50;
const MAX_PAGE = 200;
/** How many files and links a conversation's Info window lists, of each. */
const MAX_SHARED = 500;
const CHANGES_PAGE = 500;
const SEND_WINDOW_MS = 10_000;
const SEND_MAX = 30;
const TYPING_MS = 2_500;

/** What a conversation tells someone who has not chosen: everything in a direct message and a private room, mentions in a public one. */
const DEFAULT_NOTIFY: Record<ChatKind, Notify> = { public: 'mentions', private: 'all', direct: 'all' };

// A mention is a link the app writes into the message: `[@Mert Kaya](scrawl:person/<id>)`, and
// everyone in a room `[@room](scrawl:room)`.
const PERSON_LINK = /\]\(scrawl:person\/([^)\s]+)\)/g;
const ROOM_LINK = /\]\(scrawl:room\)/;

const newId = () => `ch-${randomBytes(5).toString('hex')}`;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const marks = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/** A room's name as written, without the # people type before it. */
function roomName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/^#+\s*/, '').replace(/\s+/g, ' ') : '';
  if (!name || name.length > MAX_NAME) throw new Refused(400, 'bad-name', `A room has a name of ${MAX_NAME} characters at most`);
  return name;
}

export class Chats {
  private readonly sent = new Map<string, number[]>();
  private readonly typed = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly spaces: Spaces,
    private readonly blobs: Blobs,
    /** Tells these people's connected devices of a change. */
    private readonly tell: (accounts: Iterable<string>, event: ChatEvent) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** The number of the last change; a device that saw it has seen everything. */
  cursor(): number {
    return Number((this.db.prepare("SELECT value FROM meta WHERE key = 'chat_rev'").get() as { value: string }).value);
  }

  // ---------- general rooms ----------

  /** Gives a shared space its general room; spaces from before messaging get theirs as the server starts. */
  openGeneral(space: string) {
    const row = this.db.prepare('SELECT created_by, personal_of FROM spaces WHERE id = ?').get(space) as { created_by: string; personal_of: string | null } | undefined;
    if (!row || row.personal_of !== null) return;
    transaction(this.db, () => {
      if (this.db.prepare('SELECT 1 FROM chats WHERE space_id = ? AND general = 1').get(space)) return;
      const name = this.db.prepare("SELECT 1 FROM chats WHERE space_id = ? AND kind <> 'direct' AND name = 'general' COLLATE NOCASE").get(space) ? 'general room' : 'general';
      this.db
        .prepare("INSERT INTO chats (id, kind, space_id, name, general, created_by, created_at, rev) VALUES (?, 'public', ?, ?, 1, ?, ?, ?)")
        .run(newId(), space, name, row.created_by, this.now(), this.nextRev());
    });
  }

  openGenerals() {
    const lacking = this.db
      .prepare('SELECT id FROM spaces s WHERE personal_of IS NULL AND NOT EXISTS (SELECT 1 FROM chats c WHERE c.space_id = s.id AND c.general = 1)')
      .all() as { id: string }[];
    for (const space of lacking) this.openGeneral(space.id);
  }

  // ---------- reading ----------

  /** The conversations someone is in: the rooms they joined in the spaces they are in, and their direct messages. */
  list(account: string): ChatInfo[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM chats c LEFT JOIN chat_members me ON me.chat_id = c.id AND me.account_id = ?
         WHERE (c.kind = 'direct' AND me.account_id IS NOT NULL AND me.left_at IS NULL)
            OR (c.kind <> 'direct' AND c.archived_at IS NULL AND c.space_id IN (SELECT space_id FROM members WHERE account_id = ?)
                AND (c.general = 1 OR (me.account_id IS NOT NULL AND me.left_at IS NULL)))
         ORDER BY c.created_at, c.id`,
      )
      .all(account, account) as unknown as ChatRow[];
    return rows.map((row) => this.info(row, account));
  }

  /** A space's rooms for Browse rooms: every public one, the private ones someone is in, and the archived ones. */
  rooms(account: string, space: string): ChatInfo[] {
    this.spaces.check(space, account);
    const rows = this.db.prepare("SELECT * FROM chats WHERE space_id = ? AND kind <> 'direct' ORDER BY name COLLATE NOCASE").all(space) as unknown as ChatRow[];
    return rows.filter((row) => this.canSee(row, account)).map((row) => this.info(row, account));
  }

  /** One conversation someone sees. */
  one(account: string, id: string): ChatInfo {
    return this.info(this.see(id, account), account);
  }

  /**
   * What changed after a cursor: every conversation someone is in, as it now is (one not there any
   * more was left), and the messages of those that are new or changed since, in the order they
   * changed. Without a cursor, the conversations alone: their messages come a page at a time.
   */
  changes(account: string, cursor: number | null): { chats: ChatInfo[]; messages: Message[]; cursor: number; full?: true; more?: true } {
    const upTo = this.cursor();
    const chats = this.list(account);
    if (cursor === null || !Number.isFinite(cursor)) return { chats, messages: [], cursor: upTo, full: true };
    const ids = chats.filter((chat) => chat.joined).map((chat) => chat.id);
    const rows = ids.length
      ? (this.db.prepare(`SELECT * FROM messages WHERE rev > ? AND rev <= ? AND chat_id IN (${marks(ids.length)}) ORDER BY rev LIMIT ?`).all(cursor, upTo, ...ids, CHANGES_PAGE + 1) as unknown as MessageRow[])
      : [];
    const more = rows.length > CHANGES_PAGE;
    const page = rows.slice(0, CHANGES_PAGE);
    return { chats, messages: this.messagesOf(page), cursor: more ? page.at(-1)!.rev : upTo, ...(more && { more: true as const }) };
  }

  /**
   * A page of a conversation's messages, oldest first: the latest, those before or after a place,
   * or those around one message (for a search, a quote or a notification). `older` and `newer`
   * say whether there are more on either side.
   */
  messages(account: string, id: string, query: { before?: number; after?: number; around?: string; limit?: number }): { messages: Message[]; older: boolean; newer: boolean } {
    const chat = this.see(id, account);
    const limit = Math.min(MAX_PAGE, Math.max(1, Math.floor(query.limit ?? PAGE)));
    const before = (seq: number, count: number) => (this.db.prepare('SELECT * FROM messages WHERE chat_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?').all(chat.id, seq, count) as unknown as MessageRow[]).reverse();
    const after = (seq: number, count: number) => this.db.prepare('SELECT * FROM messages WHERE chat_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(chat.id, seq, count) as unknown as MessageRow[];
    let rows: MessageRow[];
    if (query.around !== undefined) {
      const at = this.db.prepare('SELECT seq FROM messages WHERE id = ? AND chat_id = ?').get(query.around, chat.id) as { seq: number } | undefined;
      if (!at) throw new Refused(404, 'no-message', 'No such message in this conversation');
      const older = before(at.seq, Math.floor(limit / 2));
      rows = [...older, ...after(at.seq - 1, limit - older.length)];
    } else if (query.after !== undefined) {
      rows = after(query.after, limit);
    } else {
      rows = before(query.before ?? Number.MAX_SAFE_INTEGER, limit);
    }
    // A deleted message keeps its place, so the numbers have no gaps.
    const first = rows[0]?.seq;
    const last = rows.at(-1)?.seq;
    return {
      messages: this.messagesOf(rows),
      older: first !== undefined ? first > 1 : query.after !== undefined && query.after > 0 && chat.last_seq > 0,
      newer: last !== undefined ? last < chat.last_seq : query.before !== undefined && query.before <= chat.last_seq,
    };
  }

  // ---------- rooms and direct messages ----------

  /** A new room in a space, by anyone in it; whoever opens it is in it, with those they bring into a private one. */
  openRoom(by: Account, input: { space?: unknown; name?: unknown; topic?: unknown; kind?: unknown; members?: unknown }): ChatInfo {
    const space = typeof input.space === 'string' ? input.space : '';
    this.spaces.check(space, by.id);
    if (this.isPersonal(space)) throw new Refused(403, 'personal', 'A personal space has no rooms');
    if (input.kind !== 'public' && input.kind !== 'private') throw new Refused(400, 'bad-kind', 'A room is public or private');
    const kind: ChatKind = input.kind;
    const name = roomName(input.name);
    const topic = text(input.topic, MAX_TOPIC);
    const people = this.peopleIn(space, input.members, by.id);
    const id = newId();
    const chat = transaction(this.db, () => {
      this.checkName(space, name, null);
      const rev = this.nextRev();
      this.db.prepare('INSERT INTO chats (id, kind, space_id, name, topic, created_by, created_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, kind, space, name, topic, by.id, this.now(), rev);
      for (const person of [by.id, ...people]) this.enter(id, person, by.id, rev);
      return this.row(id);
    });
    this.changed(chat);
    return this.info(chat, by.id);
  }

  /** A room's name, topic, or archive, by whoever opened it and the space's managers. The general room is not archived. */
  change(by: Account, id: string, input: { name?: unknown; topic?: unknown; archived?: unknown }): ChatInfo {
    const chat = this.see(id, by.id);
    if (chat.kind === 'direct') throw new Refused(400, 'direct', 'A direct message has no name');
    if (chat.created_by !== by.id && !this.spaces.manages(chat.space_id!, by)) throw new Refused(403, 'not-allowed', 'Only whoever opened the room and the managers of its space change it');
    const name = input.name === undefined ? chat.name : roomName(input.name);
    const topic = input.topic === undefined ? chat.topic : text(input.topic, MAX_TOPIC);
    let archived = chat.archived_at;
    if (input.archived !== undefined) {
      if (input.archived && chat.general) throw new Refused(409, 'general', 'The general room is not archived');
      archived = input.archived ? (chat.archived_at ?? this.now()) : null;
    }
    const changed = transaction(this.db, () => {
      if (name.toLowerCase() !== chat.name.toLowerCase()) this.checkName(chat.space_id!, name, chat.id);
      this.db.prepare('UPDATE chats SET name = ?, topic = ?, archived_at = ?, rev = ? WHERE id = ?').run(name, topic, archived, this.nextRev(), chat.id);
      return this.row(chat.id);
    });
    this.changed(changed);
    return this.info(changed, by.id);
  }

  /** Joins a public room. */
  join(by: Account, id: string): ChatInfo {
    const chat = this.see(id, by.id);
    if (chat.kind !== 'public') throw new Refused(400, 'not-public', 'Only a public room is joined; someone in a private one brings others in');
    if (chat.archived_at !== null) throw new Refused(410, 'archived', 'This room is archived');
    if (!chat.general && !this.isIn(chat, by.id)) {
      transaction(this.db, () => this.enter(chat.id, by.id, by.id, this.nextRev()));
      this.changed(chat);
    }
    return this.info(chat, by.id);
  }

  /** Brings people of the space into a private room, by someone in it. */
  add(by: Account, id: string, accounts: unknown): ChatInfo {
    const chat = this.see(id, by.id);
    if (chat.kind !== 'private') throw new Refused(400, 'not-private', 'People are brought into a private room; a public one they join');
    if (!this.isIn(chat, by.id)) throw new Refused(403, 'not-member', 'You are not in this room');
    if (chat.archived_at !== null) throw new Refused(410, 'archived', 'This room is archived');
    const people = this.peopleIn(chat.space_id!, accounts, by.id).filter((person) => !this.isIn(chat, person));
    if (people.length) {
      transaction(this.db, () => {
        const rev = this.nextRev();
        for (const person of people) this.enter(chat.id, person, by.id, rev);
      });
      this.changed(chat);
    }
    return this.info(chat, by.id);
  }

  /** Leaves a room; no one leaves the general room, nor a direct message, which is hidden instead. */
  leave(by: Account, id: string, account: string) {
    if (account !== by.id) throw new Refused(403, 'not-allowed', 'You leave a room yourself');
    const chat = this.see(id, by.id);
    if (chat.kind === 'direct') throw new Refused(400, 'direct', 'A direct message is hidden, not left');
    if (chat.general) throw new Refused(409, 'general', 'Everyone in a space is in its general room');
    if (!this.isIn(chat, by.id)) return;
    const before = this.listeners(chat);
    transaction(this.db, () => this.db.prepare('UPDATE chat_members SET left_at = ?, rev = ? WHERE chat_id = ? AND account_id = ?').run(this.now(), this.nextRev(), chat.id, by.id));
    this.tell(before, { type: 'chat', cursor: this.cursor() });
  }

  /** Someone's own way with a conversation: what it tells them, and a direct message hidden from their list. */
  setMine(by: Account, id: string, input: { notify?: unknown; hidden?: unknown }): ChatInfo {
    const chat = this.see(id, by.id);
    if (!this.isIn(chat, by.id)) throw new Refused(403, 'not-member', 'You are not in this conversation');
    const me = this.member(chat.id, by.id);
    let notify = me?.notify ?? null;
    if (input.notify !== undefined) {
      if (input.notify !== null && input.notify !== 'all' && input.notify !== 'mentions' && input.notify !== 'off') throw new Refused(400, 'bad-notify', 'A conversation tells you of all, of mentions, or of nothing');
      notify = input.notify;
    }
    let hidden = me?.hidden ?? 0;
    if (input.hidden !== undefined) {
      if (chat.kind !== 'direct') throw new Refused(400, 'not-direct', 'Only a direct message is hidden; a room is left');
      hidden = input.hidden ? 1 : 0;
    }
    transaction(this.db, () => {
      const rev = this.nextRev();
      this.enter(chat.id, by.id, by.id, rev);
      this.db.prepare('UPDATE chat_members SET notify = ?, hidden = ?, rev = ? WHERE chat_id = ? AND account_id = ?').run(notify, hidden, rev, chat.id, by.id);
    });
    this.tell([by.id], { type: 'chat', cursor: this.cursor() });
    return this.info(chat, by.id);
  }

  /**
   * The direct message with these people: the one there is, or a new one. They share a space with
   * whoever opens it; a group has nine people at most and keeps them.
   */
  direct(by: Account, people: unknown): ChatInfo {
    const ids = [...new Set(Array.isArray(people) ? people.filter((each): each is string => typeof each === 'string' && each !== by.id) : [])];
    if (!ids.length) throw new Refused(400, 'no-people', 'A direct message is with someone');
    if (ids.length + 1 > MAX_GROUP) throw new Refused(422, 'too-many-people', `A direct message has ${MAX_GROUP} people at most; a room has more`);
    for (const id of ids) {
      if (!this.db.prepare('SELECT 1 FROM accounts WHERE id = ? AND disabled_at IS NULL').get(id)) throw new Refused(404, 'no-account', 'No such person on this server');
      const shared = this.db
        .prepare('SELECT 1 FROM members a JOIN members b ON b.space_id = a.space_id JOIN spaces s ON s.id = a.space_id WHERE a.account_id = ? AND b.account_id = ? AND s.personal_of IS NULL')
        .get(by.id, id);
      if (!shared) throw new Refused(403, 'not-shared', 'You write to those you share a space with');
    }
    const key = [by.id, ...ids].sort().join(' ');
    const there = this.db.prepare('SELECT * FROM chats WHERE direct_key = ?').get(key) as unknown as ChatRow | undefined;
    if (there) {
      if (this.member(there.id, by.id)?.hidden) return this.setMine(by, there.id, { hidden: false });
      return this.info(there, by.id);
    }
    const chat = transaction(this.db, () => {
      const id = newId();
      const rev = this.nextRev();
      this.db.prepare("INSERT INTO chats (id, kind, direct_key, created_by, created_at, rev) VALUES (?, 'direct', ?, ?, ?, ?)").run(id, key, by.id, this.now(), rev);
      for (const person of [by.id, ...ids]) this.enter(id, person, by.id, rev);
      return this.row(id);
    });
    this.changed(chat);
    return this.info(chat, by.id);
  }

  /** Someone taken out of a space or off the server leaves the rooms of the spaces they are no longer in, so a way back does not bring them back. */
  leftSpaces(account: string) {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
         WHERE cm.account_id = ? AND cm.left_at IS NULL AND c.kind <> 'direct' AND c.space_id NOT IN (SELECT space_id FROM members WHERE account_id = ?)`,
      )
      .all(account, account) as unknown as ChatRow[];
    if (rows.length) {
      transaction(this.db, () => {
        const rev = this.nextRev();
        for (const chat of rows) this.db.prepare('UPDATE chat_members SET left_at = ?, rev = ? WHERE chat_id = ? AND account_id = ?').run(this.now(), rev, chat.id, account);
      });
    }
    this.tell([account], { type: 'chat', cursor: this.cursor() });
  }

  /** Someone came into a space or went out of it: everyone in it hears that its general room's people changed. */
  spaceChanged(space: string) {
    this.tell(this.spacePeople(space), { type: 'chat', cursor: this.cursor() });
  }

  // ---------- messages ----------

  /**
   * Writes a message. Its id is the one the app made for it, so that a message sent again after a
   * lost answer is written once. A forwarded message takes the body and files of the one it
   * forwards; a reply is to a message of the same conversation.
   */
  send(by: Account, id: string, input: { id?: unknown; body?: unknown; replyTo?: unknown; files?: unknown; forwardOf?: unknown }, agent: string | null = null): Message {
    const messageId = typeof input.id === 'string' && MESSAGE_ID.test(input.id) ? input.id : '';
    if (!messageId) throw new Refused(400, 'bad-message', 'A message needs an id of its own');
    const there = this.messageRow(messageId);
    if (there) {
      if (there.chat_id === id && there.author_id === by.id) return this.messagesOf([there])[0]!;
      throw new Refused(409, 'message-exists', 'Another message has this id');
    }
    const chat = this.see(id, by.id);
    this.checkWrite(chat, by.id);
    let body = typeof input.body === 'string' ? input.body : '';
    let files = this.filesFrom(input.files, by.id);
    let forward: { of: string; from: string } | null = null;
    if (input.forwardOf !== undefined && input.forwardOf !== null) {
      const source = typeof input.forwardOf === 'string' ? this.messageRow(input.forwardOf) : undefined;
      if (!source || source.deleted_at !== null) throw new Refused(404, 'no-message', 'No such message to forward');
      const from = this.see(source.chat_id, by.id);
      body = source.body;
      files = this.filesOf([source.id]).get(source.id) ?? [];
      forward = {
        of: source.id,
        from: JSON.stringify({ chat: from.id, kind: from.kind, name: from.kind === 'direct' ? '' : from.name, author: source.author_id, authorName: this.nameOf(source.author_id) }),
      };
    }
    if (body.length > MAX_BODY) throw new Refused(422, 'too-long', `A message has ${MAX_BODY} characters at most`);
    if (!body.trim() && !files.length) throw new Refused(400, 'empty', 'A message has something in it');
    const replyTo = typeof input.replyTo === 'string' ? input.replyTo : null;
    if (replyTo !== null && this.messageRow(replyTo)?.chat_id !== chat.id) throw new Refused(404, 'no-message', 'No such message to reply to in this conversation');
    this.takeTurn(by.id);
    const mentions = this.mentionsIn(body, chat);
    const roomMention = chat.kind !== 'direct' && ROOM_LINK.test(body);
    const row = transaction(this.db, () => {
      const rev = this.nextRev();
      const seq = (this.db.prepare('SELECT last_seq FROM chats WHERE id = ?').get(chat.id) as { last_seq: number }).last_seq + 1;
      this.db.prepare('UPDATE chats SET last_seq = ? WHERE id = ?').run(seq, chat.id);
      this.db
        .prepare('INSERT INTO messages (id, chat_id, seq, author_id, agent_id, body, mentions_room, reply_to, forward_of, forward_from, created_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(messageId, chat.id, seq, by.id, agent, body, roomMention ? 1 : 0, replyTo, forward?.of ?? null, forward?.from ?? null, this.now(), rev);
      this.writeFiles(messageId, files);
      this.writeMentions(messageId, mentions);
      // Who wrote it has read up to it; a hidden direct message comes back to everyone in it.
      this.enter(chat.id, by.id, by.id, rev);
      this.db.prepare('UPDATE chat_members SET read_seq = MAX(read_seq, ?), rev = ? WHERE chat_id = ? AND account_id = ?').run(seq, rev, chat.id, by.id);
      if (chat.kind === 'direct') this.db.prepare('UPDATE chat_members SET hidden = 0, rev = ? WHERE chat_id = ? AND hidden = 1').run(rev, chat.id);
      return this.messageRow(messageId)!;
    });
    return this.told(chat, row);
  }

  /** Changes a message's text, by whoever wrote it. A forwarded message is someone else's words, and stays. */
  edit(by: Account, messageId: string, input: { body?: unknown }): Message {
    const message = this.found(messageId);
    const chat = this.see(message.chat_id, by.id);
    if (message.author_id !== by.id || message.agent_id !== null) throw new Refused(403, 'not-yours', 'You change your own messages');
    if (message.deleted_at !== null) throw new Refused(410, 'deleted', 'This message was deleted');
    if (message.forward_of !== null) throw new Refused(409, 'forwarded', 'A forwarded message stays as it was');
    if (chat.archived_at !== null) throw new Refused(410, 'archived', 'This room is archived');
    const body = typeof input.body === 'string' ? input.body : '';
    if (body.length > MAX_BODY) throw new Refused(422, 'too-long', `A message has ${MAX_BODY} characters at most`);
    if (!body.trim() && !this.filesOf([message.id]).get(message.id)?.length) throw new Refused(400, 'empty', 'A message has something in it; delete it instead');
    const mentions = this.mentionsIn(body, chat);
    const roomMention = chat.kind !== 'direct' && ROOM_LINK.test(body);
    const row = transaction(this.db, () => {
      this.db.prepare('UPDATE messages SET body = ?, mentions_room = ?, edited_at = ?, rev = ? WHERE id = ?').run(body, roomMention ? 1 : 0, this.now(), this.nextRev(), message.id);
      this.db.prepare('DELETE FROM mentions WHERE message_id = ?').run(message.id);
      this.writeMentions(message.id, mentions);
      return this.messageRow(message.id)!;
    });
    return this.told(chat, row);
  }

  /**
   * Deletes a message: its text and files go, its place stays, so that what answered it still
   * makes sense. Whoever wrote it deletes it; in a room, the space's managers too.
   */
  remove(by: Account, messageId: string): Message {
    const message = this.found(messageId);
    const chat = this.see(message.chat_id, by.id);
    const manager = chat.kind !== 'direct' && this.spaces.manages(chat.space_id!, by);
    if (message.author_id !== by.id && !manager) throw new Refused(403, 'not-yours', 'You delete your own messages');
    if (message.deleted_at !== null) return this.messagesOf([message])[0]!;
    const row = transaction(this.db, () => {
      this.db.prepare("UPDATE messages SET body = '', mentions_room = 0, deleted_at = ?, rev = ? WHERE id = ?").run(this.now(), this.nextRev(), message.id);
      for (const table of ['message_files', 'mentions', 'reactions']) this.db.prepare(`DELETE FROM ${table} WHERE message_id = ?`).run(message.id);
      return this.messageRow(message.id)!;
    });
    return this.told(chat, row);
  }

  /** Puts a reaction on a message, or takes it off. */
  react(by: Account, messageId: string, emoji: string, on: boolean): Message {
    if (!EMOJI.test(emoji)) throw new Refused(400, 'bad-emoji', 'A reaction is an emoji');
    const message = this.found(messageId);
    const chat = this.see(message.chat_id, by.id);
    if (!this.isIn(chat, by.id)) throw new Refused(403, 'not-member', 'Join the room to react in it');
    if (message.deleted_at !== null) throw new Refused(410, 'deleted', 'This message was deleted');
    const row = transaction(this.db, () => {
      const done = on
        ? this.db.prepare('INSERT INTO reactions (message_id, account_id, emoji, at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').run(message.id, by.id, emoji, this.now())
        : this.db.prepare('DELETE FROM reactions WHERE message_id = ? AND account_id = ? AND emoji = ?').run(message.id, by.id, emoji);
      if (Number(done.changes) > 0) this.db.prepare('UPDATE messages SET rev = ? WHERE id = ?').run(this.nextRev(), message.id);
      return this.messageRow(message.id)!;
    });
    return row.rev === message.rev ? this.messagesOf([row])[0]! : this.told(chat, row);
  }

  /** Someone read up to a message; never back. Their other devices hear it, and in a direct message the others, for Seen. */
  read(by: Account, id: string, seq: unknown): ChatInfo {
    const chat = this.see(id, by.id);
    const upTo = Math.min(chat.last_seq, Math.max(0, Math.floor(Number(seq) || 0)));
    if (this.isIn(chat, by.id) && (this.member(chat.id, by.id)?.read_seq ?? 0) < upTo) {
      transaction(this.db, () => {
        const rev = this.nextRev();
        this.enter(chat.id, by.id, by.id, rev);
        this.db.prepare('UPDATE chat_members SET read_seq = MAX(read_seq, ?), rev = ? WHERE chat_id = ? AND account_id = ?').run(upTo, rev, chat.id, by.id);
      });
      this.tell(chat.kind === 'direct' ? this.listeners(chat) : [by.id], { type: 'chat', cursor: this.cursor() });
    }
    return this.info(chat, by.id);
  }

  /** Whom to tell that someone is writing in a conversation: the others in it; at most every few seconds. */
  typing(account: string, id: string): string[] {
    let chat: ChatRow;
    try {
      chat = this.see(id, account);
    } catch {
      return [];
    }
    if (!this.isIn(chat, account)) return [];
    const key = `${account} ${id}`;
    if (this.now() - (this.typed.get(key) ?? 0) < TYPING_MS) return [];
    this.typed.set(key, this.now());
    return this.listeners(chat).filter((each) => each !== account);
  }

  // ---------- files ----------

  /**
   * A conversation's files and links, the latest first, for its Info window: the files of the
   * messages not deleted, and the web addresses written in them, each once a message.
   */
  shared(account: string, id: string): Shared {
    const chat = this.see(id, account);
    const files = this.db
      .prepare('SELECT f.*, m.author_id, m.created_at FROM message_files f JOIN messages m ON m.id = f.message_id WHERE m.chat_id = ? AND m.deleted_at IS NULL ORDER BY m.seq DESC, f.n LIMIT ?')
      .all(chat.id, MAX_SHARED) as unknown as (FileRow & { author_id: string; created_at: number })[];
    const written = this.db
      .prepare("SELECT id, author_id, created_at, body FROM messages WHERE chat_id = ? AND deleted_at IS NULL AND (body LIKE '%http://%' OR body LIKE '%https://%') ORDER BY seq DESC LIMIT ?")
      .all(chat.id, MAX_SHARED) as { id: string; author_id: string; created_at: number; body: string }[];
    const links: Shared['links'] = [];
    for (const row of written) {
      for (const link of linksIn(row.body)) links.push({ message: row.id, author: row.author_id, at: row.created_at, ...link });
      if (links.length >= MAX_SHARED) break;
    }
    return { files: files.map((row) => ({ message: row.message_id, author: row.author_id, at: row.created_at, file: fileOf(row) })), links };
  }

  /**
   * A conversation as its export has it (design/chat.md, 10): a Markdown file a month, its days as
   * headings, each message under who wrote it and when, an answer with its quote, a forward with
   * where it came from, and its files in `_attachments/`, linked. The days and the times are those
   * of `timeZone`, the person's.
   */
  exportOf(account: string, id: string, timeZone: string): { name: string; entries: ExportEntry[] } {
    const chat = this.see(id, account);
    const zone = validZone(timeZone);
    const rows = this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY seq').all(chat.id) as unknown as MessageRow[];
    const names = new Map<string, string>();
    const nameOf = (account: string) => {
      if (!names.has(account)) {
        const row = this.db.prepare('SELECT name, email FROM accounts WHERE id = ?').get(account) as { name: string; email: string } | undefined;
        names.set(account, row ? row.name || row.email : 'Someone');
      }
      return names.get(account)!;
    };
    const agents = new Map<string, string>();
    const agentOf = (agent: string) => {
      if (!agents.has(agent)) agents.set(agent, (this.db.prepare('SELECT name FROM agent_identities WHERE id = ?').get(agent) as { name: string } | undefined)?.name ?? 'Agent');
      return agents.get(agent)!;
    };
    const title = chat.kind === 'direct' ? this.listeners(chat).filter((each) => each !== account).map(nameOf).join(', ') : `#${chat.name}`;
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit' });
    const monthName = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'long' });
    const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
    const files = this.filesOf(rows.filter((row) => row.deleted_at === null).map((row) => row.id));
    const attached = new Map<string, ExportEntry>();
    const months = new Map<string, { lines: string[]; day: string; at: number }>();
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of rows) {
      const key = month.format(row.created_at).slice(0, 7);
      let part = months.get(key);
      if (!part) {
        part = { lines: [`# ${title} · ${monthName.format(row.created_at)}`, ''], day: '', at: row.created_at };
        if (chat.topic) part.lines.push(chat.topic, '');
        months.set(key, part);
      }
      part.at = row.created_at;
      const today = day.format(row.created_at);
      if (today !== part.day) {
        part.day = today;
        part.lines.push(`## ${today}`, '');
      }
      const by = row.agent_id ? `${agentOf(row.agent_id)} · ${nameOf(row.author_id)}` : nameOf(row.author_id);
      part.lines.push(`**${by}** ${time.format(row.created_at)}${row.edited_at && !row.deleted_at ? ' (edited)' : ''}`);
      if (row.deleted_at) {
        part.lines.push('*This message was deleted.*', '');
        continue;
      }
      if (row.reply_to) {
        const source = byId.get(row.reply_to);
        if (!source || source.deleted_at) part.lines.push('> Message deleted', '');
        else part.lines.push(`> **${nameOf(source.author_id)}** ${plainOf(source.body).slice(0, 200) || 'A file'}`, '');
      }
      if (row.forward_from) {
        const from = JSON.parse(row.forward_from) as { kind: ChatKind; name: string; authorName: string };
        part.lines.push(`*Forwarded from ${from.kind === 'direct' ? 'a direct message' : `#${from.name}`} · ${from.authorName}*`);
      }
      if (row.body.trim()) part.lines.push(textOf(row.body));
      for (const file of files.get(row.id) ?? []) {
        let entry = attached.get(file.hash);
        if (!entry) {
          entry = { name: `_attachments/${file.hash.slice(0, 8)}-${safeName(file.name || 'file')}`, hash: file.hash, at: row.created_at };
          attached.set(file.hash, entry);
        }
        const link = encodeURI(entry.name);
        part.lines.push(file.type.startsWith('image/') ? `![${file.name}](${link})` : `[${file.name || 'File'}](${link})`);
      }
      part.lines.push('');
    }
    const entries: ExportEntry[] = [...months].map(([key, part]) => ({ name: `${key}.md`, text: part.lines.join('\n'), at: part.at }));
    return { name: safeName(chat.kind === 'direct' ? title : chat.name) || 'conversation', entries: [...entries, ...attached.values()] };
  }

  /** Keeps a file someone sent, for them to attach to a message. */
  upload(account: string, taken: Taken): { hash: string; size: number } {
    this.blobs.keep(taken);
    this.db.prepare('INSERT INTO chat_uploads (hash, account_id, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(taken.hash, account, this.now());
    return { hash: taken.hash, size: taken.size };
  }

  /** A file for someone who uploaded it or sees a message that has it, with what to call it. */
  file(account: string, hash: string): { hash: string; size: number; type: string; name: string } {
    if (!HASH.test(hash)) throw new Refused(404, 'no-file', 'No such file');
    const rows = this.db
      .prepare('SELECT f.*, m.chat_id FROM message_files f JOIN messages m ON m.id = f.message_id WHERE (f.hash = ? OR f.thumb = ?) AND m.deleted_at IS NULL')
      .all(hash, hash) as unknown as (FileRow & { chat_id: string })[];
    const seen = rows.find((row) => this.sees(row.chat_id, account));
    const uploaded = this.db.prepare('SELECT 1 FROM chat_uploads WHERE hash = ? AND account_id = ?').get(hash, account);
    if (!seen && !uploaded) throw new Refused(404, 'no-file', 'No such file');
    const whole = seen && seen.hash === hash;
    return { hash, size: this.blobs.sizeOf(hash), type: whole ? seen.type : '', name: whole ? seen.name : '' };
  }

  // ---------- inside ----------

  /** Whether an account manages a space, as its own role and the server's say. */
  private managesSpace(space: string, account: string): boolean {
    const row = this.db.prepare('SELECT id, role FROM accounts WHERE id = ?').get(account) as Pick<Account, 'id' | 'role'> | undefined;
    return !!row && this.spaces.manages(space, row as Account);
  }

  private nextRev(): number {
    return Number((this.db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'chat_rev' RETURNING value").get() as { value: string }).value);
  }

  private row(id: string): ChatRow {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as unknown as ChatRow | undefined;
    if (!row) throw new Refused(404, 'no-chat', 'No such conversation');
    return row;
  }

  private messageRow(id: string): MessageRow | undefined {
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as unknown as MessageRow | undefined;
  }

  private found(id: string): MessageRow {
    const row = this.messageRow(id);
    if (!row) throw new Refused(404, 'no-message', 'No such message');
    return row;
  }

  private member(chat: string, account: string): MemberRow | undefined {
    return this.db.prepare('SELECT account_id, left_at, read_seq, notify, hidden FROM chat_members WHERE chat_id = ? AND account_id = ?').get(chat, account) as unknown as MemberRow | undefined;
  }

  /** Puts someone in a conversation, or back in it; what they read and chose stays. */
  private enter(chat: string, account: string, by: string, rev: number) {
    this.db
      .prepare(
        `INSERT INTO chat_members (chat_id, account_id, added_by, joined_at, rev) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (chat_id, account_id) DO UPDATE SET left_at = NULL, rev = excluded.rev, joined_at = CASE WHEN chat_members.left_at IS NULL THEN chat_members.joined_at ELSE excluded.joined_at END`,
      )
      .run(chat, account, by, this.now(), rev);
  }

  private inSpace(space: string, account: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM members WHERE space_id = ? AND account_id = ?').get(space, account);
  }

  private spacePeople(space: string): string[] {
    return (this.db.prepare('SELECT account_id FROM members WHERE space_id = ?').all(space) as { account_id: string }[]).map((row) => row.account_id);
  }

  private isPersonal(space: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM spaces WHERE id = ? AND personal_of IS NOT NULL').get(space);
  }

  /** Whether someone is in a conversation: writes in it, counts what they did not read. */
  private isIn(chat: ChatRow, account: string): boolean {
    const me = this.member(chat.id, account);
    if (chat.kind === 'direct') return !!me && me.left_at === null;
    if (!this.inSpace(chat.space_id!, account)) return false;
    return chat.general === 1 || (!!me && me.left_at === null);
  }

  /** Whether someone sees a conversation: a public room is seen by everyone in its space. */
  private canSee(chat: ChatRow, account: string): boolean {
    return chat.kind === 'public' ? this.inSpace(chat.space_id!, account) : this.isIn(chat, account);
  }

  private sees(chat: string, account: string): boolean {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(chat) as unknown as ChatRow | undefined;
    return !!row && this.canSee(row, account);
  }

  /** A conversation someone sees; one they do not is not there for them, so that a private one is not given away. */
  private see(id: string, account: string): ChatRow {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as unknown as ChatRow | undefined;
    if (!row || !this.canSee(row, account)) throw new Refused(404, 'no-chat', 'No such conversation');
    return row;
  }

  /** Everyone in a conversation, whose devices hear what happens in it. */
  private listeners(chat: ChatRow): string[] {
    if (chat.kind !== 'direct' && chat.general) return this.spacePeople(chat.space_id!);
    const rows = (this.db.prepare('SELECT account_id FROM chat_members WHERE chat_id = ? AND left_at IS NULL').all(chat.id) as { account_id: string }[]).map((row) => row.account_id);
    if (chat.kind === 'direct') return rows;
    const space = new Set(this.spacePeople(chat.space_id!));
    return rows.filter((account) => space.has(account));
  }

  /** Whether someone may write in a conversation now. */
  private checkWrite(chat: ChatRow, account: string) {
    if (!this.isIn(chat, account)) throw new Refused(403, 'not-member', 'Join the room to write in it');
    if (chat.archived_at !== null) throw new Refused(410, 'archived', 'This room is archived');
    if (chat.kind === 'direct') {
      const others = this.listeners(chat).filter((each) => each !== account);
      const here = others.filter((each) => this.db.prepare('SELECT 1 FROM accounts WHERE id = ? AND disabled_at IS NULL').get(each));
      if (!here.length) throw new Refused(410, 'gone', 'They are no longer on this server');
    }
  }

  private checkName(space: string, name: string, except: string | null) {
    const taken = this.db.prepare("SELECT id FROM chats WHERE space_id = ? AND kind <> 'direct' AND name = ? COLLATE NOCASE").get(space, name) as { id: string } | undefined;
    if (taken && taken.id !== except) throw new Refused(409, 'name-taken', 'This space has a room with this name');
  }

  /** The people of a space someone brings into a room, without themselves. */
  private peopleIn(space: string, input: unknown, by: string): string[] {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) throw new Refused(400, 'bad-people', 'People are a list');
    const people = [...new Set(input.filter((each): each is string => typeof each === 'string' && each !== by))];
    for (const person of people) if (!this.inSpace(space, person)) throw new Refused(400, 'not-in-space', 'Only people in the space come into its rooms');
    return people;
  }

  private takeTurn(account: string) {
    const since = this.now() - SEND_WINDOW_MS;
    const recent = (this.sent.get(account) ?? []).filter((at) => at > since);
    if (recent.length >= SEND_MAX) throw new Refused(429, 'too-many', 'Too many messages at once; wait a moment');
    recent.push(this.now());
    this.sent.set(account, recent);
  }

  /** The files of a message as the app sends them: each uploaded by whoever sends it, or in a message they see. */
  private filesFrom(input: unknown, account: string): ChatFile[] {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) throw new Refused(400, 'bad-files', 'Files are a list');
    if (input.length > MAX_FILES) throw new Refused(422, 'too-many-files', `A message has ${MAX_FILES} files at most`);
    return input.map((each: unknown) => {
      const file = (each && typeof each === 'object' ? each : {}) as { [key: string]: unknown };
      const hash = typeof file.hash === 'string' && HASH.test(file.hash) ? file.hash : '';
      const thumb = typeof file.thumb === 'string' && HASH.test(file.thumb) ? file.thumb : undefined;
      if (!hash || !this.mayAttach(hash, account) || (thumb && !this.mayAttach(thumb, account))) throw new Refused(400, 'bad-file', 'A file is attached once it is uploaded');
      const number = (key: string) => (typeof file[key] === 'number' && Number.isFinite(file[key]) && (file[key] as number) >= 0 ? { [key]: file[key] as number } : {});
      return {
        hash,
        name: text(file.name, 255),
        type: text(file.type, 100),
        size: this.blobs.sizeOf(hash),
        ...number('width'),
        ...number('height'),
        ...number('duration'),
        ...(thumb && { thumb }),
      };
    });
  }

  private mayAttach(hash: string, account: string): boolean {
    if (this.db.prepare('SELECT 1 FROM chat_uploads WHERE hash = ? AND account_id = ?').get(hash, account)) return true;
    const chats = this.db
      .prepare('SELECT DISTINCT m.chat_id FROM message_files f JOIN messages m ON m.id = f.message_id WHERE (f.hash = ? OR f.thumb = ?) AND m.deleted_at IS NULL')
      .all(hash, hash) as { chat_id: string }[];
    return chats.some((row) => this.sees(row.chat_id, account));
  }

  private writeFiles(message: string, files: ChatFile[]) {
    files.forEach((file, n) =>
      this.db
        .prepare('INSERT INTO message_files (message_id, n, hash, name, type, size, width, height, duration, thumb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(message, n, file.hash, file.name, file.type, file.size, file.width ?? null, file.height ?? null, file.duration ?? null, file.thumb ?? null),
    );
  }

  /** Those mentioned in a message who are in its conversation. */
  private mentionsIn(body: string, chat: ChatRow): string[] {
    const named = new Set([...body.matchAll(PERSON_LINK)].map((match) => decodeURIComponent(match[1]!)));
    return this.listeners(chat).filter((account) => named.has(account));
  }

  private writeMentions(message: string, accounts: string[]) {
    for (const account of accounts) this.db.prepare('INSERT INTO mentions (message_id, account_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(message, account);
  }

  private nameOf(account: string): string {
    const row = this.db.prepare('SELECT name, email FROM accounts WHERE id = ?').get(account) as { name: string; email: string } | undefined;
    return row ? row.name || row.email : '';
  }

  /** A message as it now is, told to everyone in its conversation. */
  private told(chat: ChatRow, row: MessageRow): Message {
    const message = this.messagesOf([row])[0]!;
    this.tell(this.listeners(chat), { type: 'message', chat: chat.id, message });
    return message;
  }

  /** Something about a conversation changed: everyone in it hears so. */
  private changed(chat: ChatRow) {
    this.tell(this.listeners(this.row(chat.id)), { type: 'chat', cursor: this.cursor() });
  }

  private filesOf(ids: string[]): Map<string, ChatFile[]> {
    const map = new Map<string, ChatFile[]>();
    if (!ids.length) return map;
    const rows = this.db.prepare(`SELECT * FROM message_files WHERE message_id IN (${marks(ids.length)}) ORDER BY message_id, n`).all(...ids) as unknown as FileRow[];
    for (const row of rows) map.set(row.message_id, [...(map.get(row.message_id) ?? []), fileOf(row)]);
    return map;
  }

  /** Messages as the app reads them, with their files, mentions, reactions and the quote of what they answer. */
  private messagesOf(rows: MessageRow[]): Message[] {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const files = this.filesOf(ids);
    const mentions = new Map<string, string[]>();
    for (const row of this.db.prepare(`SELECT message_id, account_id FROM mentions WHERE message_id IN (${marks(ids.length)})`).all(...ids) as { message_id: string; account_id: string }[]) {
      mentions.set(row.message_id, [...(mentions.get(row.message_id) ?? []), row.account_id]);
    }
    const reactions = new Map<string, { emoji: string; people: string[] }[]>();
    for (const row of this.db.prepare(`SELECT message_id, emoji, account_id FROM reactions WHERE message_id IN (${marks(ids.length)}) ORDER BY at, rowid`).all(...ids) as { message_id: string; emoji: string; account_id: string }[]) {
      const list = reactions.get(row.message_id) ?? [];
      const same = list.find((each) => each.emoji === row.emoji);
      if (same) same.people.push(row.account_id);
      else list.push({ emoji: row.emoji, people: [row.account_id] });
      reactions.set(row.message_id, list);
    }
    const quoted = [...new Set(rows.map((row) => row.reply_to).filter((each): each is string => each !== null))];
    const quotes = new Map<string, Message['replyTo']>();
    if (quoted.length) {
      const sources = this.db
        .prepare(`SELECT m.id, m.author_id, m.body, m.deleted_at, (SELECT f.type FROM message_files f WHERE f.message_id = m.id ORDER BY f.n LIMIT 1) AS type FROM messages m WHERE m.id IN (${marks(quoted.length)})`)
        .all(...quoted) as { id: string; author_id: string; body: string; deleted_at: number | null; type: string | null }[];
      for (const source of sources) {
        quotes.set(source.id, { id: source.id, author: source.author_id, text: source.body.slice(0, 200), file: source.type, deleted: source.deleted_at !== null });
      }
    }
    return rows.map((row) => ({
      id: row.id,
      chat: row.chat_id,
      seq: row.seq,
      author: row.author_id,
      agent: row.agent_id,
      body: row.body,
      mentions: mentions.get(row.id) ?? [],
      mentionsRoom: row.mentions_room === 1,
      replyTo: row.reply_to === null ? null : (quotes.get(row.reply_to) ?? { id: row.reply_to, author: '', text: '', file: null, deleted: true }),
      forwarded: row.forward_from === null ? null : (JSON.parse(row.forward_from) as Message['forwarded']),
      files: files.get(row.id) ?? [],
      reactions: reactions.get(row.id) ?? [],
      at: row.created_at,
      edited: row.edited_at,
      deleted: row.deleted_at,
      rev: row.rev,
    }));
  }

  /** A conversation as one person sees it. */
  private info(chat: ChatRow, account: string): ChatInfo {
    const ids = this.listeners(chat);
    const people = ids.length
      ? (this.db.prepare(`SELECT id, name, email, disabled_at FROM accounts WHERE id IN (${marks(ids.length)})`).all(...ids) as { id: string; name: string; email: string; disabled_at: number | null }[])
      : [];
    people.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    const me = this.member(chat.id, account);
    const joined = this.isIn(chat, account);
    const readSeq = me?.read_seq ?? 0;
    const notify = me?.notify ?? DEFAULT_NOTIFY[chat.kind];
    const count = (extra: string, ...args: (string | number)[]) =>
      (this.db.prepare(`SELECT COUNT(*) AS n FROM messages m WHERE m.chat_id = ? AND m.seq > ? AND m.author_id <> ? AND m.deleted_at IS NULL ${extra}`).get(chat.id, readSeq, account, ...args) as { n: number }).n;
    const unread = joined ? count('') : 0;
    const alerts =
      !joined || notify === 'off' || unread === 0
        ? 0
        : notify === 'all'
          ? unread
          : count('AND (m.mentions_room = 1 OR EXISTS (SELECT 1 FROM mentions x WHERE x.message_id = m.id AND x.account_id = ?))', account);
    const lastRow = this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY seq DESC LIMIT 1').get(chat.id) as unknown as MessageRow | undefined;
    let reads: ChatInfo['reads'] = null;
    if (chat.kind === 'direct') {
      const rows = this.db.prepare('SELECT account_id, read_seq FROM chat_members WHERE chat_id = ? AND account_id <> ?').all(chat.id, account) as { account_id: string; read_seq: number }[];
      reads = Object.fromEntries(rows.map((row) => [row.account_id, row.read_seq]));
    }
    return {
      id: chat.id,
      kind: chat.kind,
      space: chat.space_id,
      spaceName: chat.space_id ? ((this.db.prepare('SELECT name FROM spaces WHERE id = ?').get(chat.space_id) as { name: string } | undefined)?.name ?? '') : '',
      name: chat.name,
      topic: chat.topic,
      general: chat.general === 1,
      createdBy: chat.created_by,
      createdAt: chat.created_at,
      archived: chat.archived_at,
      members: people.map((person) => ({ id: person.id, name: person.name || person.email })),
      gone: people.filter((person) => person.disabled_at !== null).map((person) => person.id),
      lastSeq: chat.last_seq,
      last: lastRow ? this.messagesOf([lastRow])[0]! : null,
      joined,
      readSeq,
      notify,
      hidden: me?.hidden === 1,
      unread,
      alerts,
      reads,
      manage: chat.kind !== 'direct' && (chat.created_by === account || this.managesSpace(chat.space_id!, account)),
    };
  }
}

/** A file's row as the app reads it. */
function fileOf(row: FileRow): ChatFile {
  return {
    hash: row.hash,
    name: row.name,
    type: row.type,
    size: row.size,
    ...(row.width !== null && { width: row.width }),
    ...(row.height !== null && { height: row.height }),
    ...(row.duration !== null && { duration: row.duration }),
    ...(row.thumb !== null && { thumb: row.thumb }),
  };
}

/** The web addresses in a message, each once: a link's words and address, or an address written as it is. */
export function linksIn(body: string): { url: string; text: string }[] {
  const found = new Map<string, string>();
  for (const match of body.matchAll(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)[^)]*\)|(https?:\/\/[^\s<>()[\]]+)/g)) {
    const url = (match[2] ?? match[3]!).replace(/[.,;:!?'"]+$/, '');
    if (!found.has(url)) found.set(url, match[1]?.trim() || url);
  }
  return [...found].map(([url, text]) => ({ url, text }));
}

/** A message's words for its export: a mention as @Name, a chip and a message's link by their words. */
function textOf(body: string): string {
  return body.replace(/\[([^\]]*)\]\(scrawl:[^)]*\)/g, '$1');
}

/** A message as plain words, for a quote in the export. */
function plainOf(body: string): string {
  return textOf(body)
    .replace(/```[^\n]*\n?/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A name a file can have on any computer. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 120);
}

/** A time zone the export can use; UTC when it is not one. */
function validZone(zone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}
