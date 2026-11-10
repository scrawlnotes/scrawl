import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { type ChatWakeEvent, chatLink, isAgentId, type Notice, ownerOf, publicHost, readWakeHeaders, type WakeEvent, wakeAddressOk, wakeHeaderWords, type WakeState, wakeText } from '@scrawlnotes/core';
import { CallbackRefused, type EventSubscribe, SubscriptionRefused } from '@scrawlnotes/agent';
import { Refused } from './auth';
import type { Chats } from './chat';
import type { Db } from './db';
import type { Live } from './live';
import { type WakeInfo, wakeInfoOf } from './oauth';
import type { Push } from './push';

// Waking an agent (design/agent-wake.md): when its owner mentions it, answers it, or gives it a
// card or a task, the server sends the agent's address what the owner wrote, and the agent, a
// Claude task or an n8n flow, does the work with its tools and answers in the same place. Scrawl
// runs no agent. Only the owner's own writing wakes one, and nothing an agent writes does, so no
// loop can start. What could not be sent is tried again after a minute and after five, kept in the
// process like the notifications that wait; at the end the owner is told.

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 4096;
/** Tried again after a minute, then after five. */
const AGAIN_MS = [60_000, 5 * 60_000];
/** A 429's Retry-After is taken up to an hour. */
const AFTER_MAX_MS = 60 * 60 * 1000;
/** Reached, and neither an answer nor a tool called for this long: "No answer from Claude yet" (design/agent-wake.md 13). */
const QUIET_MS = 10 * 60_000;
/** A wait for an answer is forgotten after an hour. */
const FORGET_MS = 60 * 60_000;

// ---------- a request to someone else's address ----------

const NOT_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NOT_PUBLIC.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NOT_PUBLIC.addSubnet(net, prefix, 'ipv6');
}

/** Whether an IP is the loopback, a home or a company network, link-local or not one to send to. */
export function notPublic(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return NOT_PUBLIC.check(mapped[1]!, 'ipv4');
  const family = isIP(ip);
  return family === 0 || NOT_PUBLIC.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}

/** Why a request did not get an answer: its address may not be reached, it could not be, or it took too long. */
export class FetchFailed extends Error {
  constructor(
    readonly why: 'refused' | 'unreachable' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'FetchFailed';
  }
}

export interface Fetched {
  status: number;
  headers: { [name: string]: string | string[] | undefined };
  /** Its first 4 KB. */
  body: Buffer;
}

export type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;

/**
 * A request to an address someone gave, which must not reach this server's own network (SSRF):
 * only https and a public name; the name is resolved once, refused when any of its addresses is
 * not public, and the connection goes to the address checked, so a second answer cannot send it
 * elsewhere. Ten seconds, no redirect followed, 4 KB of the answer read. Outside integrations
 * use it too (design/integrations.md).
 */
export async function safeFetch(address: string, init: { method?: string; headers?: [string, string][]; body?: string } = {}, resolve: Resolve = (host) => lookup(host, { all: true })): Promise<Fetched> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new FetchFailed('refused', 'Not an address');
  }
  if (url.protocol !== 'https:' || !publicHost(url.hostname)) throw new FetchFailed('refused', 'Only a public https address is reached');
  let found: { address: string; family: number }[];
  try {
    found = await resolve(url.hostname);
  } catch {
    throw new FetchFailed('unreachable', 'The name was not found');
  }
  const to = found[0];
  if (!to || found.some((each) => notPublic(each.address))) throw new FetchFailed('refused', 'The name is not on the public internet');
  const headers: { [name: string]: string } = {};
  for (const [name, value] of init.headers ?? []) headers[name] = value;
  if (init.body !== undefined) headers['content-length'] = String(Buffer.byteLength(init.body));
  return new Promise<Fetched>((done, fail) => {
    let answered: Fetched | null = null;
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = () => {
      clearTimeout(timer);
      if (answered) done({ ...answered, body: Buffer.concat(chunks).subarray(0, MAX_BYTES) });
    };
    const req = request(
      url,
      {
        method: init.method ?? 'GET',
        headers,
        // The address checked, whatever the name says now.
        lookup: ((_host: string, options: { all?: boolean }, callback: (error: Error | null, address: string | { address: string; family: number }[], family?: number) => void) =>
          options.all ? callback(null, [{ address: to.address, family: to.family }]) : callback(null, to.address, to.family)) as never,
      },
      (response) => {
        answered = { status: response.statusCode ?? 0, headers: response.headers, body: Buffer.alloc(0) };
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
          if (size >= MAX_BYTES) {
            response.destroy();
            finish();
          }
        });
        response.on('end', finish);
        response.on('close', finish);
        response.on('error', finish);
      },
    );
    const timer = setTimeout(() => {
      if (answered) return finish();
      req.destroy();
      fail(new FetchFailed('timeout', 'No answer in 10 seconds'));
    }, TIMEOUT_MS);
    req.on('error', (error) => {
      clearTimeout(timer);
      if (!answered) fail(new FetchFailed('unreachable', error.message));
    });
    req.end(init.body);
  });
}

// ---------- waking ----------

/** Sends an agent's address its body; what came back, its first 4 KB of words too, or throws FetchFailed. */
export type WakeSend = (url: string, headers: [string, string][], body: string) => Promise<{ status: number; retryAfter?: string | undefined; body?: string }>;

const sendWake: WakeSend = async (url, headers, body) => {
  const answer = await safeFetch(url, { method: 'POST', headers: [['content-type', 'application/json'], ['user-agent', 'Scrawl'], ...headers], body });
  const after = answer.headers['retry-after'];
  return { status: answer.status, retryAfter: Array.isArray(after) ? after[0] : after, body: answer.body.toString('utf8') };
};

/** A Claude task's address, as Settings › Agents takes it (design/agent-wake.md 12.2). */
const CLAUDE_TASK = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/[A-Za-z0-9_-]+\/fire$/;
/** What a Claude task's /fire asks besides its token (code.claude.com/docs/en/routines). */
const CLAUDE_HEADERS: [string, string][] = [
  ['anthropic-version', '2023-06-01'],
  ['anthropic-beta', 'experimental-cc-routine-2026-04-01'],
];

/** How long a subscription lasts at most, and how many an agent keeps (design/agent-wake.md 11.8). */
const WATCH_MS = 7 * 24 * 60 * 60 * 1000;
const WATCH_MIN_MS = 60_000;
const WATCHES = 5;

/** An agent that may be woken: connected, and its owner's account in use. */
interface Woken {
  id: string;
  name: string;
  owner: string;
}

/** Where a wake goes: the agent's address, or one of its subscriptions. */
type Route = { kind: 'hook' } | { kind: 'watch'; id: string };

/** A message in Chat that reached an agent, whose answer its owner waits for: the line under it (design/agent-wake.md 13). */
interface Waiting {
  who: Woken;
  origin: Origin & { chat: string };
  since: number;
  /** When the agent was last heard of: reached, or a tool it called. */
  last: number;
  working: boolean;
  late: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Where a wake came from, for the notification that says it could not be sent: what a click opens; and in Chat, the conversation. */
interface Origin {
  href: string;
  space: string;
  item: string;
  chat?: string;
}

/** A Retry-After in seconds or as a date, in ms from now; null when there is none. */
function afterOf(value: string | undefined, now: number): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** A Standard Webhooks signature of an event: HMAC-SHA256 over `id.timestamp.body`, with the key a `whsec_` secret holds. */
export function webhookSignature(secret: string, id: string, timestamp: number, body: string): string {
  return `v1,${createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

/** Whether a subscriber's secret is one to sign with: `whsec_` and 24 to 64 bytes. */
function secretOk(secret: string): boolean {
  if (!/^whsec_[A-Za-z0-9+/]+=*$/.test(secret)) return false;
  const bytes = Buffer.from(secret.slice('whsec_'.length), 'base64').length;
  return bytes >= 24 && bytes <= 64;
}

/** Whether a verification's answer gives the challenge back: as `{ "challenge": … }` or as the body itself; compared in constant time. */
function echoes(body: string | undefined, challenge: string): boolean {
  let given = (body ?? '').trim();
  try {
    const parsed = JSON.parse(given) as { challenge?: unknown };
    if (parsed && typeof parsed === 'object' && typeof parsed.challenge === 'string') given = parsed.challenge;
  } catch {
    // Not JSON: the body itself.
  }
  const a = Buffer.from(given);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class Wakes {
  private readonly waiting = new Set<ReturnType<typeof setTimeout>>();
  /** By agent, the messages it was reached by and has not answered; in the process, gone with it. */
  private readonly answers = new Map<string, Waiting[]>();

  constructor(
    private readonly db: Db,
    private readonly push: Push,
    /** Where the owner hears it went, under their message in Chat. */
    private readonly live: Live,
    private readonly chats: Chats,
    /** The server's address, which the agent is told. */
    private readonly server: string,
    private readonly now: () => number = Date.now,
    private readonly send: WakeSend = sendWake,
    private readonly later: (run: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  ) {}

  // ---------- the address, from Settings › Agents ----------

  /**
   * Where an agent is woken from now on. A Claude task by its URL and token, the headers written
   * here (design/agent-wake.md 12.2); another agent by an https address with a public name and its
   * headers, a hidden value staying as it was.
   */
  set(agent: string, input: unknown): WakeInfo {
    const given = (input && typeof input === 'object' ? input : {}) as { url?: unknown; headers?: unknown; claude?: { url?: unknown; token?: unknown } };
    const row = this.db.prepare('SELECT wake_headers, wake_kind FROM agent_identities WHERE id = ?').get(agent) as { wake_headers: string | null; wake_kind: string | null } | undefined;
    const kept = JSON.parse(row?.wake_headers ?? '[]') as [string, string][];
    let url: string;
    let headers: [string, string][];
    let kind: 'claude' | 'other';
    if (given.claude && typeof given.claude === 'object') {
      url = typeof given.claude.url === 'string' ? given.claude.url.trim() : '';
      if (!CLAUDE_TASK.test(url)) throw new Refused(400, 'bad-claude-url', 'This is not a Claude task’s URL. It starts with https://api.anthropic.com/v1/claude_code/routines/');
      const token = (typeof given.claude.token === 'string' ? given.claude.token : '').trim().replace(/^Bearer\s+/i, '');
      const had = row?.wake_kind === 'claude' ? kept.find(([name]) => name === 'Authorization') : undefined;
      if (!token && !had) throw new Refused(400, 'no-token', 'Paste the token Claude showed after Create');
      if (token && !/^[\x21-\x7e]+$/.test(token)) throw new Refused(400, 'bad-token', 'A token is one word, with no spaces');
      headers = [token ? ['Authorization', `Bearer ${token}`] : had!, ...CLAUDE_HEADERS];
      kind = 'claude';
    } else {
      url = typeof given.url === 'string' ? given.url.trim() : '';
      if (!wakeAddressOk(url)) throw new Refused(400, 'bad-wake-address', 'The address must start with https:// and be a public name');
      const read = readWakeHeaders(typeof given.headers === 'string' ? given.headers : '', kept);
      if ('line' in read) throw new Refused(400, 'bad-wake-header', wakeHeaderWords(read));
      headers = read.headers;
      kind = 'other';
    }
    const saved = JSON.stringify(headers);
    this.db.prepare('UPDATE agent_identities SET wake_url = ?, wake_headers = ?, wake_kind = ? WHERE id = ?').run(url, saved, kind, agent);
    // An agent that answers has its direct message with its person (design/agent-wake.md 14).
    this.chats.agentDirect(ownerOf(agent), agent);
    return wakeInfoOf(url, saved, kind)!;
  }

  /** The agent is woken no more: its address goes, and its subscriptions. */
  clear(agent: string) {
    this.db.prepare('UPDATE agent_identities SET wake_url = NULL, wake_headers = NULL, wake_kind = NULL WHERE id = ?').run(agent);
    this.db.prepare('DELETE FROM event_subscriptions WHERE agent_id = ?').run(agent);
  }

  // ---------- subscriptions, from the agent's own MCP connection (design/agent-wake.md 11) ----------

  /**
   * A client, as ChatGPT is, subscribes its agent to `wake`: the callback must be a public https
   * address and answer a signed challenge before anything is sent there. Seven days at most; the
   * same subscription again is renewed; an agent keeps its five newest.
   */
  async subscribe(agent: string, input: EventSubscribe): Promise<{ id: string; refreshBefore: string }> {
    // In the log, whether an agent got as far as watching and why not: neither its person nor we see it otherwise.
    const who = `${this.identityName(agent)} of ${this.accountName(ownerOf(agent))}`;
    const at = URL.canParse(input.url) ? new URL(input.url).host : 'a wrong address';
    try {
      const made = await this.watch(agent, input);
      console.log(`Watching Scrawl: ${who}, at ${at}`);
      return made;
    } catch (error) {
      console.warn(`Not watching Scrawl: ${who}, at ${at}: ${error instanceof CallbackRefused ? error.reason : error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private identityName(agent: string): string {
    return (this.db.prepare('SELECT name FROM agent_identities WHERE id = ?').get(agent) as { name: string } | undefined)?.name ?? 'An agent';
  }

  private async watch(agent: string, input: EventSubscribe): Promise<{ id: string; refreshBefore: string }> {
    if (Object.keys(input.arguments).length > 0) throw new SubscriptionRefused('wake takes no arguments');
    if (!wakeAddressOk(input.url)) throw new SubscriptionRefused('The callback must be an https address with a public name');
    if (!secretOk(input.secret)) throw new SubscriptionRefused('The secret must start with whsec_ and hold 24 to 64 bytes');
    const id = `sub_${createHash('sha256').update(`${agent}\n${input.url}\nwake\n{}`).digest('base64url').slice(0, 32)}`;
    const challenge = randomBytes(24).toString('base64url');
    const body = JSON.stringify({ type: 'verification', challenge });
    let answer: Awaited<ReturnType<WakeSend>>;
    try {
      answer = await this.send(input.url, this.signed(input.secret, `msg_${randomUUID()}`, id, body), body);
    } catch (error) {
      const why = error instanceof FetchFailed ? error.why : 'unreachable';
      throw new CallbackRefused(why === 'timeout' ? 'timeout' : why === 'refused' ? 'refused' : 'unreachable', 'The callback could not be reached');
    }
    if (answer.status < 200 || answer.status >= 300 || !echoes(answer.body, challenge)) throw new CallbackRefused('challenge_failed', 'The callback did not give the challenge back');
    const lasts = input.ttlMs === null || input.ttlMs === undefined ? WATCH_MS : Math.min(Math.max(input.ttlMs, WATCH_MIN_MS), WATCH_MS);
    const until = this.now() + lasts;
    this.db
      .prepare(
        `INSERT INTO event_subscriptions (id, agent_id, name, arguments, url, secret, expires_at, created_at) VALUES (?, ?, 'wake', '{}', ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET secret = excluded.secret, expires_at = excluded.expires_at`,
      )
      .run(id, agent, input.url, input.secret, until, this.now());
    this.db
      .prepare('DELETE FROM event_subscriptions WHERE agent_id = ? AND id NOT IN (SELECT id FROM event_subscriptions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?)')
      .run(agent, agent, WATCHES);
    this.chats.agentDirect(ownerOf(agent), agent);
    return { id, refreshBefore: new Date(until).toISOString() };
  }

  /** The subscription of an agent to a callback ends. */
  unsubscribe(agent: string, input: { url: string }) {
    this.db.prepare('DELETE FROM event_subscriptions WHERE agent_id = ? AND url = ?').run(agent, input.url);
  }

  // ---------- what wakes ----------

  /**
   * A board or a task list written: its notices to an agent, of what the agent's owner did, wake it;
   * one wake for an agent and a card or a task, the giving first. A reminder wakes nothing.
   */
  noticed(where: { space: string; spaceName: string; name: string }, notices: Notice[]) {
    const first = new Map<string, Notice>();
    for (const notice of notices) {
      if (!isAgentId(notice.to) || notice.kind === 'remind' || notice.by.id !== ownerOf(notice.to)) continue;
      const key = `${notice.to}\n${notice.item.id}`;
      const had = first.get(key);
      if (!had || (notice.kind === 'assign' && had.kind !== 'assign')) first.set(key, notice);
    }
    for (const notice of first.values()) {
      const item = notice.item;
      const comment = typeof notice.in === 'object' ? notice.in.comment : undefined;
      this.wake(
        notice.to,
        {
          kind: notice.kind === 'assign' ? 'assign' : 'mention',
          from: ownerOf(notice.to),
          space: { id: where.space, name: where.spaceName },
          ...(item.kind === 'card'
            ? { card: { id: item.id, key: item.key ?? item.title, title: item.title, board: where.name, ...(comment && { comment }) } }
            : { task: { id: item.id, title: item.title, list: where.name } }),
        },
        notice.kind === 'assign' ? '' : (notice.said ?? ''),
        { href: notice.href, space: where.space, item: item.id },
      );
    }
  }

  /** A message sent: the agents it wakes, of its author's own; or an agent's, which answers what woke it there. */
  sent(chat: string, message: string) {
    const agent = this.chats.agentOf(message);
    if (agent) return this.answered(agent, chat);
    const found = this.chats.wakesOf(message);
    if (!found) return;
    for (const agent of found.agents) {
      this.wake(agent.id, { kind: agent.kind, from: found.from.id, space: found.space, chat: found.chat }, found.words, { href: chatLink(this.server, chat, message), space: found.space?.id ?? '', item: message, chat });
    }
  }

  /** Whether a message waits for an agent's answer: only then is an agent's request looked into. */
  awaited(): boolean {
    return this.answers.size > 0;
  }

  /** The agent called a tool: what reached it is being worked on (design/agent-wake.md 13). */
  busy(agent: string) {
    for (const wait of this.waitsOf(agent)) {
      wait.last = this.now();
      if (!wait.working) {
        wait.working = true;
        wait.late = false;
        this.told(wait.who, wait.origin, 'working');
      }
      this.look(wait);
    }
  }

  stop() {
    for (const timer of this.waiting) clearTimeout(timer);
    this.waiting.clear();
  }

  /** An agent wrote in a conversation: what woke it there is answered, and its line goes. */
  private answered(agent: string, chat: string) {
    for (const wait of this.waitsOf(agent)) {
      if (wait.origin.chat !== chat) continue;
      this.told(wait.who, wait.origin, 'answered');
      this.drop(wait);
    }
  }

  /** What reached an agent is waited on, until it answers there or an hour passes. */
  private reached(who: Woken, origin: Origin) {
    if (!origin.chat || this.reachedBy(who.id, origin.item)) return;
    const at = this.now();
    const wait: Waiting = { who, origin: { ...origin, chat: origin.chat }, since: at, last: at, working: false, late: false, timer: null };
    this.answers.set(who.id, [...this.waitsOf(who.id), wait]);
    this.told(who, origin, 'sent');
    this.look(wait);
  }

  /**
   * When to look at a wait again: ten minutes after the agent was last heard of, when it says
   * "No answer from Claude yet"; at an hour, when it is forgotten.
   */
  private look(wait: Waiting) {
    if (wait.timer) {
      clearTimeout(wait.timer);
      this.waiting.delete(wait.timer);
    }
    const now = this.now();
    const forget = wait.since + FORGET_MS - now;
    const timer = this.later(
      () => {
        this.waiting.delete(timer);
        // A fake clock's timer runs though it was cleared.
        if (wait.timer !== timer) return;
        wait.timer = null;
        const at = this.now();
        if (at - wait.since >= FORGET_MS) return this.drop(wait);
        if (!wait.late && at - wait.last >= QUIET_MS) {
          wait.late = true;
          wait.working = false;
          this.told(wait.who, wait.origin, 'late');
        }
        this.look(wait);
      },
      Math.max(0, wait.late ? forget : Math.min(wait.last + QUIET_MS - now, forget)),
    );
    (timer as { unref?: () => void }).unref?.();
    this.waiting.add(timer);
    wait.timer = timer;
  }

  private drop(wait: Waiting) {
    if (wait.timer) {
      clearTimeout(wait.timer);
      this.waiting.delete(wait.timer);
    }
    const left = this.waitsOf(wait.who.id).filter((each) => each !== wait);
    if (left.length) this.answers.set(wait.who.id, left);
    else this.answers.delete(wait.who.id);
  }

  private waitsOf(agent: string): Waiting[] {
    return this.answers.get(agent) ?? [];
  }

  /** Whether another of the agent's ways reached it already by this message: a later failure leaves its line. */
  private reachedBy(agent: string, message: string): boolean {
    return this.waitsOf(agent).some((wait) => wait.origin.item === message);
  }

  /** What an agent is told goes to each place it is woken at: its address, each of its subscriptions. */
  private wake(agent: string, what: Pick<WakeEvent, 'kind' | 'space' | 'chat' | 'card' | 'task'> & { from: string }, words: string, origin: Origin) {
    const who = this.wokenOf(agent);
    if (!who) return;
    const routes: Route[] = [...(this.hookOf(agent) ? [{ kind: 'hook' as const }] : []), ...this.watchesOf(agent).map((id) => ({ kind: 'watch' as const, id }))];
    if (routes.length === 0) return;
    const { from, ...rest } = what;
    const event: WakeEvent = { ...rest, server: this.server, agent: { id: who.id, name: who.name }, from: { id: from, name: this.accountName(from) }, at: new Date(this.now()).toISOString() };
    const payload = { text: wakeText(event, words), event };
    // One event, by one id, wherever it goes and however often it is tried.
    const eventId = `evt_${randomUUID()}`;
    this.told(who, origin, 'sending');
    for (const route of routes) void this.attempt(agent, route, payload, eventId, origin, 0);
  }

  /** One try; a failed one that may go through later is tried again, else the owner is told, in words they know. */
  private async attempt(agent: string, route: Route, payload: { text: string; event: WakeEvent }, eventId: string, origin: Origin, tries: number) {
    // Read again each try: an address changed or taken away, a subscription ended, an agent disconnected meanwhile.
    const who = this.wokenOf(agent);
    if (!who) return;
    let url: string;
    let headers: [string, string][];
    let body: string;
    let claude = false;
    if (route.kind === 'hook') {
      const hook = this.hookOf(agent);
      if (!hook) return;
      ({ url, headers } = hook);
      body = JSON.stringify(payload);
      claude = hook.kind === 'claude';
    } else {
      const watch = this.watchOf(route.id);
      if (!watch) return;
      url = watch.url;
      body = JSON.stringify({ eventId, name: 'wake', timestamp: new Date(this.now()).toISOString(), data: payload, cursor: null });
      headers = this.signed(watch.secret, eventId, route.id, body);
    }
    let reason: string;
    let again: number | null = null;
    try {
      const answer = await this.send(url, headers, body);
      if (answer.status >= 200 && answer.status < 300) return this.reached(who, origin);
      if (route.kind === 'watch' && answer.status === 410) {
        // The subscriber ended it on its side.
        this.db.prepare('DELETE FROM event_subscriptions WHERE id = ?').run(route.id);
        reason = `${who.name} stopped watching Scrawl. Set it up again in Settings › Agents.`;
      } else if (claude && (answer.status === 401 || answer.status === 403)) {
        reason = `${who.name} didn’t accept the token. Set it up again in Settings › Agents.`;
      } else {
        reason = `The address answered ${answer.status}.`;
        if (answer.status >= 500 || answer.status === 429) again = this.againIn(tries, answer.status === 429 ? afterOf(answer.retryAfter, this.now()) : null);
      }
    } catch (error) {
      const why = error instanceof FetchFailed ? error.why : 'unreachable';
      // Not answered in time, it may have started the work: a Claude task does not see a second one is the same, and would do it twice.
      reason = why === 'timeout' ? `${who.name} didn’t answer in 10 seconds.` : `${who.name} couldn’t be reached.`;
      if (why === 'unreachable') again = this.againIn(tries, null);
    }
    if (again !== null) {
      const timer = this.later(() => {
        this.waiting.delete(timer);
        void this.attempt(agent, route, payload, eventId, origin, tries + 1);
      }, again);
      (timer as { unref?: () => void }).unref?.();
      this.waiting.add(timer);
      if (!this.reachedBy(who.id, origin.item)) this.told(who, origin, 'again', this.now() + again);
      return;
    }
    if (!this.reachedBy(who.id, origin.item)) this.told(who, origin, 'failed');
    this.push.notice(who.owner, { title: `Couldn’t reach ${who.name}`, body: reason, href: origin.href, tag: `wake:${origin.item}`, space: origin.space, item: origin.item });
  }

  /**
   * The owner's devices hear how it goes, for the line under their message (design/agent-wake.md 13);
   * `ok` for an app made before `state`.
   */
  private told(who: Woken, origin: Origin, state: WakeState, again?: number) {
    if (!origin.chat) return;
    const event: ChatWakeEvent = { type: 'wake', chat: origin.chat, message: origin.item, agent: who.id, name: who.name, state, ok: state !== 'failed', ...(again !== undefined && { again }) };
    this.live.tell([who.owner], event);
  }

  /** The headers a subscriber checks an event by (Standard Webhooks), signed now. */
  private signed(secret: string, id: string, subscription: string, body: string): [string, string][] {
    const timestamp = Math.floor(this.now() / 1000);
    return [
      ['webhook-id', id],
      ['webhook-timestamp', String(timestamp)],
      ['webhook-signature', webhookSignature(secret, id, timestamp, body)],
      ['x-mcp-subscription-id', subscription],
    ];
  }

  private againIn(tries: number, asked: number | null): number | null {
    if (tries >= AGAIN_MS.length) return null;
    return asked !== null && asked <= AFTER_MAX_MS ? asked : AGAIN_MS[tries]!;
  }

  /** An agent that may be woken: connected to the server, its owner's account in use. */
  private wokenOf(agent: string): Woken | null {
    const row = this.db
      .prepare(
        `SELECT i.id, i.name, i.account_id FROM agent_identities i JOIN accounts a ON a.id = i.account_id
         WHERE i.id = ? AND a.disabled_at IS NULL
           AND EXISTS (SELECT 1 FROM agents g JOIN devices d ON d.id = g.device_id WHERE d.account_id = i.account_id AND g.client_id = i.client_id AND d.revoked_at IS NULL)`,
      )
      .get(agent) as { id: string; name: string; account_id: string } | undefined;
    return row ? { id: row.id, name: row.name, owner: row.account_id } : null;
  }

  private hookOf(agent: string): { url: string; headers: [string, string][]; kind: string | null } | null {
    const row = this.db.prepare('SELECT wake_url, wake_headers, wake_kind FROM agent_identities WHERE id = ? AND wake_url IS NOT NULL').get(agent) as { wake_url: string; wake_headers: string | null; wake_kind: string | null } | undefined;
    return row ? { url: row.wake_url, headers: JSON.parse(row.wake_headers ?? '[]') as [string, string][], kind: row.wake_kind } : null;
  }

  private watchesOf(agent: string): string[] {
    return (this.db.prepare('SELECT id FROM event_subscriptions WHERE agent_id = ? AND expires_at > ?').all(agent, this.now()) as { id: string }[]).map((row) => row.id);
  }

  private watchOf(id: string): { url: string; secret: string } | null {
    return (this.db.prepare('SELECT url, secret FROM event_subscriptions WHERE id = ? AND expires_at > ?').get(id, this.now()) as { url: string; secret: string } | undefined) ?? null;
  }

  private accountName(id: string): string {
    const row = this.db.prepare('SELECT name, email FROM accounts WHERE id = ?').get(id) as { name: string; email: string } | undefined;
    return row ? row.name || row.email : '';
  }
}
