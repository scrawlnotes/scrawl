import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { chatLink, isAgentId, type Notice, ownerOf, publicHost, readWakeHeaders, type WakeEvent, wakeAddressOk, wakeHeaderWords, wakeText } from '@scrawlnotes/core';
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

/** Sends an agent's address its body; what came back, or throws FetchFailed. */
export type WakeSend = (url: string, headers: [string, string][], body: string) => Promise<{ status: number; retryAfter?: string | undefined }>;

const sendWake: WakeSend = async (url, headers, body) => {
  const answer = await safeFetch(url, { method: 'POST', headers: [['content-type', 'application/json'], ['user-agent', 'Scrawl'], ...headers], body });
  const after = answer.headers['retry-after'];
  return { status: answer.status, retryAfter: Array.isArray(after) ? after[0] : after };
};

/** An agent that may be woken: connected, its owner's account in use, an address given. */
interface Target {
  id: string;
  name: string;
  owner: string;
  url: string;
  headers: [string, string][];
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

export class Wakes {
  private readonly waiting = new Set<ReturnType<typeof setTimeout>>();

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

  /** Where an agent is woken from now on: an https address with a public name, and its headers; a hidden value stays as it was. */
  set(agent: string, input: unknown): WakeInfo {
    const given = (input && typeof input === 'object' ? input : {}) as { url?: unknown; headers?: unknown };
    const url = typeof given.url === 'string' ? given.url.trim() : '';
    if (!wakeAddressOk(url)) throw new Refused(400, 'bad-wake-address', 'The address must start with https:// and be a public name');
    const row = this.db.prepare('SELECT wake_headers FROM agent_identities WHERE id = ?').get(agent) as { wake_headers: string | null } | undefined;
    const kept = JSON.parse(row?.wake_headers ?? '[]') as [string, string][];
    const read = readWakeHeaders(typeof given.headers === 'string' ? given.headers : '', kept);
    if ('line' in read) throw new Refused(400, 'bad-wake-header', wakeHeaderWords(read));
    const headers = JSON.stringify(read.headers);
    this.db.prepare('UPDATE agent_identities SET wake_url = ?, wake_headers = ? WHERE id = ?').run(url, headers, agent);
    return wakeInfoOf(url, headers)!;
  }

  /** The agent is woken no more. */
  clear(agent: string) {
    this.db.prepare('UPDATE agent_identities SET wake_url = NULL, wake_headers = NULL WHERE id = ?').run(agent);
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

  /** A message sent: the agents it wakes, of its author's own. */
  sent(chat: string, message: string) {
    const found = this.chats.wakesOf(message);
    if (!found) return;
    for (const agent of found.agents) {
      this.wake(agent.id, { kind: agent.kind, from: found.from.id, space: found.space, chat: found.chat }, found.words, { href: chatLink(this.server, chat, message), space: found.space?.id ?? '', item: message, chat });
    }
  }

  stop() {
    for (const timer of this.waiting) clearTimeout(timer);
    this.waiting.clear();
  }

  private wake(agent: string, what: Pick<WakeEvent, 'kind' | 'space' | 'chat' | 'card' | 'task'> & { from: string }, words: string, origin: Origin) {
    const target = this.targetOf(agent);
    if (!target) return;
    const { from, ...rest } = what;
    const event: WakeEvent = {
      ...rest,
      server: this.server,
      agent: { id: target.id, name: target.name },
      from: { id: from, name: this.accountName(from) },
      at: new Date(this.now()).toISOString(),
    };
    const body = JSON.stringify({ text: wakeText(event, words), event });
    void this.attempt(agent, body, origin, 0);
  }

  /** One try; a failed one that may go through later is tried again, else the owner is told. */
  private async attempt(agent: string, body: string, origin: Origin, tries: number) {
    // The address read again: changed or taken away meanwhile, what is sent follows it.
    const target = this.targetOf(agent);
    if (!target) return;
    let reason: string;
    let again: number | null = null;
    try {
      const answer = await this.send(target.url, target.headers, body);
      if (answer.status >= 200 && answer.status < 300) return this.told(target, origin, true);
      reason = `The address answered ${answer.status}.`;
      if (answer.status >= 500 || answer.status === 429) again = this.againIn(tries, answer.status === 429 ? afterOf(answer.retryAfter, this.now()) : null);
    } catch (error) {
      const why = error instanceof FetchFailed ? error.why : 'unreachable';
      // Not answered in time, it may have started the work: a Claude task does not see a second one is the same, and would do it twice.
      reason = why === 'timeout' ? 'No answer in 10 seconds.' : 'The address could not be reached.';
      if (why === 'unreachable') again = this.againIn(tries, null);
    }
    if (again !== null) {
      const timer = this.later(() => {
        this.waiting.delete(timer);
        void this.attempt(agent, body, origin, tries + 1);
      }, again);
      (timer as { unref?: () => void }).unref?.();
      this.waiting.add(timer);
      return;
    }
    this.told(target, origin, false);
    this.push.notice(target.owner, { title: `${target.name} couldn’t be woken`, body: reason, href: origin.href, tag: `wake:${origin.item}`, space: origin.space, item: origin.item });
  }

  /** The owner's devices hear whether it went, for the line under their message: Sent to Claude, or Couldn't reach Claude. */
  private told(target: Target, origin: Origin, ok: boolean) {
    if (origin.chat) this.live.tell([target.owner], { type: 'wake', chat: origin.chat, message: origin.item, agent: target.id, name: target.name, ok });
  }

  private againIn(tries: number, asked: number | null): number | null {
    if (tries >= AGAIN_MS.length) return null;
    return asked !== null && asked <= AFTER_MAX_MS ? asked : AGAIN_MS[tries]!;
  }

  private targetOf(agent: string): Target | null {
    const row = this.db
      .prepare(
        `SELECT i.id, i.name, i.account_id, i.wake_url, i.wake_headers FROM agent_identities i JOIN accounts a ON a.id = i.account_id
         WHERE i.id = ? AND i.wake_url IS NOT NULL AND a.disabled_at IS NULL
           AND EXISTS (SELECT 1 FROM agents g JOIN devices d ON d.id = g.device_id WHERE d.account_id = i.account_id AND g.client_id = i.client_id AND d.revoked_at IS NULL)`,
      )
      .get(agent) as { id: string; name: string; account_id: string; wake_url: string; wake_headers: string | null } | undefined;
    return row ? { id: row.id, name: row.name, owner: row.account_id, url: row.wake_url, headers: JSON.parse(row.wake_headers ?? '[]') as [string, string][] } : null;
  }

  private accountName(id: string): string {
    const row = this.db.prepare('SELECT name, email FROM accounts WHERE id = ?').get(id) as { name: string; email: string } | undefined;
    return row ? row.name || row.email : '';
  }
}

