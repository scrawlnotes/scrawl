import { fold, personLink, ROOM_MENTION } from '@scrawlnotes/core';
import { dayArg } from './cards';
import { Refusal } from './paths';
import { type Agent, type Client, selfOf } from './space';

// Messaging (design/chat.md, 9): on a Scrawl server, where the conversations are; a computer's
// door has none. The agent reads what its person sees, direct messages too, and reading marks
// nothing read; it writes in a room or to a person as itself, words only, no files.

/** A conversation as the agent is told of it. */
export interface AgentConversation {
  id: string;
  /** `#dev` for a room, `founders` for a private one, the others' names for a direct message. */
  name: string;
  kind: 'public' | 'private' | 'direct';
  /** The space a room is in. */
  space: { id: string; name: string } | null;
  /** Who is in it. */
  people: { id: string; name: string }[];
  /** What the person has not read in it. */
  unread: number;
  /** When its latest message was written. */
  last: number | null;
  archived: boolean;
}

/** A message as the agent is told of it. */
export interface AgentMessage {
  id: string;
  chat: string;
  at: number;
  /** Who wrote it, by name. */
  author: string;
  /** The agent that wrote it for them: "Claude Code (Laptop)". */
  agent: string | null;
  /** Its Markdown, mentions as `[@Name](scrawl:person/…)`. */
  text: string;
  replyTo: { id: string; author: string; text: string } | null;
  /** Where a forwarded message came from: "#dev · Mert Kaya". */
  forwarded: string | null;
  files: { name: string; type: string; size: number }[];
  reactions: { emoji: string; count: number }[];
  edited: boolean;
  deleted: boolean;
}

/** What a server's door gives the agent of messaging: the person's conversations, as the person. */
export interface AgentChat {
  conversations(): Promise<AgentConversation[]>;
  /** A conversation's latest messages, or the first ones since a time; the oldest first. */
  messages(chat: string, query: { since?: number; limit: number }): Promise<{ messages: AgentMessage[]; more: boolean }>;
  /** Messages found by their words, narrowed; the newest first. */
  search(query: { q?: string; from?: string; in?: string; has?: string; since?: number; limit: number }): Promise<AgentMessage[]>;
  /** Writes a message; `agent` is the agent's own identity. */
  send(chat: string, body: string, replyTo: string | null, agent: string | null): Promise<AgentMessage>;
  /** The direct message with these people, opened when there is none. */
  direct(people: string[]): Promise<AgentConversation>;
  /** Everyone the person shares a space with. */
  people(): Promise<{ id: string; name: string }[]>;
}

export type ChatHas = 'photos' | 'files' | 'voice' | 'code' | 'links';

/** The door's messaging, or why there is none. */
function chatOf(agent: Agent): AgentChat {
  if (!agent.chat) throw new Refusal('Messages are on a Scrawl server: this Scrawl has none');
  return agent.chat;
}

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());
const bare = (name: string) => name.trim().replace(/^#/, '');

/** A moment as the person's clock shows it: `2026-10-24 14:05`. */
function clock(agent: Agent, at: number): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { ...(agent.timeZone && { timeZone: agent.timeZone }), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at);
  } catch {
    return new Date(at).toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** When a day starts on the person's clock, `YYYY-MM-DD`. */
function dayStart(agent: Agent, day: string): number {
  const guess = Date.parse(`${day}T00:00:00Z`);
  if (!agent.timeZone) return new Date(`${day}T00:00:00`).getTime();
  const shown = Date.parse(clock(agent, guess).replace(' ', 'T') + ':00Z');
  return guess - (shown - guess);
}

/** A conversation as a list says it. */
function conversationOut(agent: Agent, conversation: AgentConversation) {
  return {
    id: conversation.id,
    name: conversation.name,
    kind: conversation.kind,
    ...(conversation.space && { space: conversation.space.name }),
    ...(conversation.kind !== 'public' && { people: conversation.people.map((person) => person.name) }),
    unread: conversation.unread,
    ...(conversation.last !== null && { last: clock(agent, conversation.last) }),
    ...(conversation.archived && { archived: true }),
  };
}

/** A message as a tool says it: who wrote it, when, its words; the rest only when there is some. */
function messageOut(agent: Agent, message: AgentMessage) {
  return {
    id: message.id,
    at: clock(agent, message.at),
    from: message.agent ? `${message.agent} · ${message.author}` : message.author,
    ...(message.deleted ? { deleted: true } : { text: message.text }),
    ...(message.replyTo && { replyTo: { id: message.replyTo.id, from: message.replyTo.author, text: message.replyTo.text.slice(0, 200) } }),
    ...(message.forwarded && { forwarded: message.forwarded }),
    ...(message.files.length > 0 && { files: message.files }),
    ...(message.reactions.length > 0 && { reactions: message.reactions.map((each) => `${each.emoji} ${each.count}`) }),
    ...(message.edited && !message.deleted && { edited: true }),
  };
}

/**
 * The conversation `ref` names: its id, a room's name (`#dev` or `dev`), a direct message's
 * people as the list names them, or the one person of a direct message of two; with `space`, a
 * room of that space. Null when none is; more than one is not guessed at.
 */
function findConversation(conversations: AgentConversation[], ref: string, space?: string): AgentConversation | null {
  const byId = conversations.find((each) => each.id === ref.trim());
  if (byId) return byId;
  const found = conversations.filter((each) => {
    if (space?.trim() && !(each.space && (each.space.id === space.trim() || same(each.space.name, space)))) return false;
    if (same(bare(each.name), bare(ref))) return true;
    if (each.kind !== 'direct' || each.people.length !== 1) return false;
    const person = each.people[0]!;
    return same(person.name, ref) || same(person.name.split(/\s+/)[0] ?? '', ref);
  });
  if (found.length > 1) {
    throw new Refusal(`More than one conversation is "${ref.trim()}": name the space with \`space\`, or give its id`, {
      conversations: found.map((each) => ({ id: each.id, name: each.name, ...(each.space && { space: each.space.name }) })),
    });
  }
  return found[0] ?? null;
}

/** The person `ref` names among those the person shares a space with, by full or first name; `"me"` is the person. */
async function personOf(agent: Agent, chat: AgentChat, ref: string): Promise<{ id: string; name: string }> {
  if (ref.trim().toLowerCase() === 'me') {
    const me = await agent.person();
    if (me?.id) return { id: me.id, name: me.name ?? '' };
  }
  const people = await chat.people();
  let found = people.filter((person) => same(person.name, ref));
  if (!found.length) found = people.filter((person) => same(person.name.split(/\s+/)[0] ?? '', ref));
  if (found.length === 1) return found[0]!;
  if (found.length > 1) throw new Refusal(`More than one person is "${ref.trim()}": give the full name`, { people: found.map((person) => person.name) });
  throw new Refusal(`No one is "${ref.trim()}" in the spaces`, { people: people.map((person) => person.name) });
}

/**
 * A message's words with its mentions made: `@room` in a room, and `@` and the name of someone in
 * the conversation, full or the first alone when only one has it, as the app writes them.
 */
export function withMentions(text: string, conversation: AgentConversation): string {
  // Each name as it is written, found by its folded form: Şahin is Sahin too.
  const names = new Map<string, { id: string; name: string } | 'room'>();
  const written = new Set<string>();
  if (conversation.kind !== 'direct') {
    names.set('room', 'room');
    written.add('room');
  }
  const firsts = new Map<string, { person: { id: string; name: string }; as: string }[]>();
  for (const person of conversation.people) {
    names.set(fold(person.name.trim().replace(/\s+/g, ' ')), person);
    written.add(person.name.trim()).add(fold(person.name.trim()));
    const first = person.name.trim().split(/\s+/)[0] ?? '';
    if (first) firsts.set(fold(first), [...(firsts.get(fold(first)) ?? []), { person, as: first }]);
  }
  for (const [first, people] of firsts) {
    if (people.length !== 1 || names.has(first)) continue;
    names.set(first, people[0]!.person);
    written.add(people[0]!.as).add(first);
  }
  const longest = [...written].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  if (!longest.length) return text;
  // Not one already made: a mention's words are in brackets.
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}\\[@])@(${longest.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(pattern, (whole, before: string, name: string) => {
    const who = names.get(fold(name.replace(/\s+/g, ' ')));
    if (!who) return whole;
    return `${before}${who === 'room' ? ROOM_MENTION : personLink(who.name, who.id)}`;
  });
}

export interface MessagesArgs {
  in?: string;
  space?: string;
  query?: string;
  from?: string;
  has?: ChatHas;
  since?: string;
  limit?: number;
}

/**
 * The messages tool: with nothing given, the person's conversations with what is unread in each;
 * with `in`, a conversation's latest messages, or those since a day; with `query`, `from` or
 * `has`, the messages found, in `in` alone when given. Nothing is marked read.
 */
export async function messagesTool(agent: Agent, args: MessagesArgs) {
  const chat = chatOf(agent);
  const conversations = await chat.conversations();
  const day = dayArg(args.since, 'Since');
  const since = day ? dayStart(agent, day) : undefined;
  const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 30)));
  const searching = !!args.query?.trim() || !!args.from?.trim() || !!args.has;
  if (!args.in?.trim() && !searching) {
    const shown = conversations.filter((each) => !each.archived).sort((a, b) => (b.last ?? 0) - (a.last ?? 0));
    return { data: { conversations: shown.map((each) => conversationOut(agent, each)) } };
  }
  const where = args.in?.trim() ? findConversation(conversations, args.in, args.space) : null;
  if (args.in?.trim() && !where) throw new Refusal(`No conversation "${args.in.trim()}"`, { conversations: conversations.map((each) => ({ name: each.name, ...(each.space && { space: each.space.name }) })) });
  if (!searching) {
    const { messages, more } = await chat.messages(where!.id, { ...(since !== undefined && { since }), limit });
    return {
      data: {
        in: where!.name,
        ...(where!.space && { space: where!.space.name }),
        messages: messages.map((message) => messageOut(agent, message)),
        ...(more && { more: since !== undefined ? 'There are more after these: ask again with a later since' : 'There are older ones: ask with since' }),
      },
    };
  }
  const from = args.from?.trim() ? await personOf(agent, chat, args.from) : undefined;
  const found = await chat.search({ q: args.query?.trim(), from: from?.id, in: where?.id, has: args.has, since, limit });
  const nameOf = (id: string) => conversations.find((each) => each.id === id)?.name ?? '';
  return { data: { messages: found.map((message) => ({ in: nameOf(message.chat), ...messageOut(agent, message) })) } };
}

export interface SendMessageArgs {
  to: string;
  text: string;
  replyTo?: string;
  space?: string;
}

/**
 * The send_message tool: a message in a room, or to a person (their direct message, opened when
 * there is none), as the agent itself; `@Name` and `@room` become mentions.
 */
export async function sendMessageTool(agent: Agent, args: SendMessageArgs, client: Client) {
  const chat = chatOf(agent);
  const text = args.text?.trim() ?? '';
  if (!text) throw new Refusal('A message needs its words: `text`');
  const conversations = await chat.conversations();
  let where = findConversation(conversations, args.to, args.space);
  if (!where) {
    const person = await personOf(agent, chat, args.to).catch(() => null);
    if (!person) throw new Refusal(`No room or person "${args.to.trim()}"`, { conversations: conversations.filter((each) => !each.archived).map((each) => each.name) });
    where = await chat.direct([person.id]);
  }
  if (where.archived) throw new Refusal(`${where.name} is archived: it is read, not written`);
  const self = await selfOf(agent, client, true);
  const sent = await chat.send(where.id, withMentions(text, where), args.replyTo?.trim() || null, self?.id ?? null);
  return { data: { sent: { id: sent.id, in: where.name, at: clock(agent, sent.at) }, ...(where.space && { space: where.space.id }) } };
}
