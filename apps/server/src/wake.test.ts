import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addCard, addComment, addTask, newBoard, personLink, serializeBoard, serializeList, ServerAccount, SYNC_LEVEL, updateCard, updateTask, type WakeEvent, WAKE_MASK } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import type { LiveSocket } from './live';
import { makeServer } from './server';
import { CallbackRefused, SubscriptionRefused } from '@scrawlnotes/agent';
import { FetchFailed, notPublic, safeFetch, type WakeSend, webhookSignature } from './wake';

// Waking an agent (design/agent-wake.md 7): only its owner's own writing wakes it, in Chat, on a
// card and on a task; where it is woken is set by its owner and its headers' values never come
// back; what could not be sent is tried again, and its owner told at the end.

const URL = 'https://kaan.scrawlnotes.com';
const ACME = 'sp-acmeacme';
const PASSWORD = 'a long password';
const KAAN = 'person-kaan-01';
const MERT = 'person-mert';
const BOARD = 'Roadmap.board.json';
const LIST = 'Work/Tasks.tasks.json';
const CLAUDE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_01/fire';
const HEADERS = 'Authorization: Bearer sk-ant-oat01-secret\nanthropic-version: 2023-06-01';
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const at = (minute: number) => () => new Date(Date.UTC(2026, 10, 9, 9, minute));
const kaan = { id: KAAN, name: 'Kaan Arslan' };
const mert = { id: MERT, name: 'Mert Kaya' };

interface Woken {
  url: string;
  headers: [string, string][];
  body: { text: string; event: WakeEvent };
  /** The body as sent, which a signature is over. */
  raw: string;
}

async function start() {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-wake-'));
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const woken: Woken[] = [];
  /** What the receiver answers next, in order; then 202. */
  const answers: (number | 'down' | 'slow')[] = [];
  /** Verifications a subscriber's callback was sent, and whether it gives the challenge back. */
  const verified: string[] = [];
  const callback = { echoes: true };
  const wakeSend: WakeSend = async (url, headers, body) => {
    const parsed = JSON.parse(body) as { type?: string; challenge?: string };
    if (parsed.type === 'verification') {
      verified.push(url);
      return { status: 200, body: JSON.stringify({ challenge: callback.echoes ? parsed.challenge : 'something else' }) };
    }
    woken.push({ url, headers, body: JSON.parse(body) as Woken['body'], raw: body });
    const next = answers.shift() ?? 202;
    if (next === 'down') throw new FetchFailed('unreachable', 'connect ECONNREFUSED');
    if (next === 'slow') throw new FetchFailed('timeout', 'No answer in 10 seconds');
    return { status: next };
  };
  const waiting: { run: () => void; ms: number }[] = [];
  const server = makeServer(config, { wakeSend, later: (run, ms) => (waiting.push({ run, ms }), setTimeout(() => undefined, 0)) });
  closers.push(() => {
    server.wakes.stop();
    server.push.stop();
    server.live.stop();
    server.db.close();
    rmSync(data, { recursive: true, force: true });
  });
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const as = (token: string | null) => new ServerAccount({ url: URL, token: () => token, fetch });
  const { token: owner } = await as(null).setUp({ name: 'Kaan Arslan', email: 'kaan@example.com', password: PASSWORD, person: KAAN, device: 'Laptop' });
  await as(owner).openSpace(ACME, 'Acme');
  const { link } = await as(owner).invite(ACME);
  const { token: mertToken } = await as(null).accept(link.split('/').pop()!, { name: 'Mert Kaya', email: 'mert@example.com', password: PASSWORD, person: MERT, device: 'Phone' });
  const call = async (token: string, method: string, path: string, body?: unknown) => {
    const response = await server.app.request(`${URL}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && typeof body !== 'string' && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as { [key: string]: unknown }) : null, text };
  };
  /** An agent of an account connected through OAuth, as claude.ai's connector is: its connection and its identity. */
  const connect = (account: string, client = 'https://claude.ai/oauth/claude-code-client-metadata', name = 'Claude') => {
    server.accounts.newDevice(account, name);
    const device = (server.db.prepare('SELECT id FROM devices WHERE account_id = ? ORDER BY rowid DESC LIMIT 1').get(account) as { id: string }).id;
    server.db
      .prepare('INSERT INTO agents (device_id, client_id, client_name, scope, access_expires_at, refresh_hash, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(device, client, name, 'scrawl', Date.now() + 3600_000, null, Date.now() + 3600_000, Date.now());
    return { device, agent: server.oauth.identity(account, client, name).id };
  };
  const hashes = new Map<string, string>();
  const write = async (token: string, path: string, text: string) => {
    const was = hashes.get(path);
    const response = await server.app.request(`${URL}/api/v1/spaces/${ACME}/files/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Scrawl-Sync': String(SYNC_LEVEL), ...(was ? { 'If-Match': `"${was}"` } : { 'If-None-Match': '*' }) },
      body: text,
    });
    expect(response.status).toBe(200);
    hashes.set(path, ((await response.json()) as { hash: string }).hash);
  };
  const general = server.chats.rooms(KAAN, ACME).find((chat) => chat.general)!.id;
  let made = 0;
  const say = async (token: string, chat: string, body: string, extra: object = {}) => {
    const sent = await call(token, 'POST', `/chat/${chat}/messages`, { id: `m-wake-${String(++made).padStart(4, '0')}`, body, ...extra });
    expect(sent.status).toBe(200);
    return sent.body as { id: string };
  };
  const heard: { type: string; [key: string]: unknown }[] = [];
  const listen = (account: string) => {
    const socket: LiveSocket = { account, device: (server.db.prepare('SELECT id FROM devices WHERE account_id = ?').get(account) as { id: string }).id, send: (text) => heard.push(JSON.parse(text) as { type: string }), close: () => undefined };
    server.live.add(socket);
    server.live.setActive(socket, true, null);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  const later = async () => {
    const due = waiting.splice(0);
    for (const each of due) each.run();
    await settle();
    return due.map((each) => each.ms);
  };
  return { server, owner, mert: mertToken, call, connect, write, general, say, woken, answers, heard, listen, settle, later, verified, callback };
}

type S = Awaited<ReturnType<typeof start>>;

/** Kaan's Claude, connected and with an address. */
async function claude(s: S) {
  const { device, agent } = s.connect(KAAN);
  expect((await s.call(s.owner, 'PUT', `/agents/${device}/wake`, { url: CLAUDE_URL, headers: HEADERS })).status).toBe(200);
  return { device, agent };
}

function roadmap() {
  let n = 0;
  return newBoard('Roadmap', 'software', () => `c${++n}`);
}

describe('the address', () => {
  it('is set by the owner, shown with its headers by name only, and taken away with Stop waking and Disconnect', async () => {
    const s = await start();
    const { device } = s.connect(KAAN);
    const set = await s.call(s.owner, 'PUT', `/agents/${device}/wake`, { url: CLAUDE_URL, headers: HEADERS });
    expect(set.body).toEqual({ url: CLAUDE_URL, host: 'api.anthropic.com', headers: ['Authorization', 'anthropic-version'], kind: 'other' });
    const listed = await s.call(s.owner, 'GET', '/agents');
    expect(listed.body).toEqual([expect.objectContaining({ id: device, wakes: { url: CLAUDE_URL, host: 'api.anthropic.com', headers: ['Authorization', 'anthropic-version'], kind: 'other' }, watches: null })]);
    expect(listed.text).not.toContain('secret');
    // Saved again as the window shows it, values hidden: they stay.
    await s.call(s.owner, 'PUT', `/agents/${device}/wake`, { url: CLAUDE_URL, headers: `Authorization: ${WAKE_MASK}\nanthropic-version: ${WAKE_MASK}` });
    expect(JSON.parse((s.server.db.prepare('SELECT wake_headers FROM agent_identities').get() as { wake_headers: string }).wake_headers)).toEqual([
      ['Authorization', 'Bearer sk-ant-oat01-secret'],
      ['anthropic-version', '2023-06-01'],
    ]);
    expect((await s.call(s.owner, 'DELETE', `/agents/${device}/wake`)).status).toBe(204);
    expect(((await s.call(s.owner, 'GET', '/agents')).body as unknown as { wakes: unknown }[])[0]!.wakes).toBeNull();
    await s.call(s.owner, 'PUT', `/agents/${device}/wake`, { url: CLAUDE_URL, headers: HEADERS });
    await s.call(s.owner, 'DELETE', `/agents/${device}`);
    expect(s.server.db.prepare('SELECT wake_url FROM agent_identities').get()).toEqual({ wake_url: null });
  });

  it('refuses an address that is not public https, a wrong header line, and someone else’s agent', async () => {
    const s = await start();
    const { device } = s.connect(KAAN);
    for (const url of ['http://api.anthropic.com/x', 'https://192.168.1.20:5678/webhook/scrawl', 'https://localhost/x', 'https://n8n:5678/x']) {
      expect((await s.call(s.owner, 'PUT', `/agents/${device}/wake`, { url, headers: '' })).body).toEqual({ error: { code: 'bad-wake-address', message: 'The address must start with https:// and be a public name' } });
    }
    expect((await s.call(s.owner, 'PUT', `/agents/${device}/wake`, { url: CLAUDE_URL, headers: 'Authorization: Bearer x\nX-Scrawl secret' })).body).toEqual({
      error: { code: 'bad-wake-header', message: 'Line 2: a header is Name: value' },
    });
    expect((await s.call(s.mert, 'PUT', `/agents/${device}/wake`, { url: CLAUDE_URL, headers: '' })).status).toBe(404);
  });
});

describe('in Chat', () => {
  it('wakes Claude when Kaan mentions it, with what he wrote and where, and when he answers it', async () => {
    const s = await start();
    const { agent } = await claude(s);
    const asked = await s.say(s.owner, s.general, `${personLink('Claude', agent)} why does the build fail on main?`);
    await s.settle();
    expect(s.woken).toHaveLength(1);
    expect(s.woken[0]!.url).toBe(CLAUDE_URL);
    expect(s.woken[0]!.headers).toEqual([
      ['Authorization', 'Bearer sk-ant-oat01-secret'],
      ['anthropic-version', '2023-06-01'],
    ]);
    expect(s.woken[0]!.body.event).toMatchObject({
      kind: 'mention',
      server: URL,
      agent: { id: agent, name: 'Claude' },
      from: { id: KAAN, name: 'Kaan Arslan' },
      space: { id: ACME, name: 'Acme' },
      chat: { kind: 'public', name: '#general', message: asked.id },
    });
    expect(s.woken[0]!.body.text).toContain('> @Claude why does the build fail on main?');
    expect(s.woken[0]!.body.text).toContain(`replyTo: "${asked.id}"`);
    // Claude answers, as Kaan with its identity; Kaan answers it.
    const answer = s.server.chats.send({ id: KAAN, email: 'kaan@example.com', name: 'Kaan Arslan', role: 'owner' }, s.general, { id: 'm-claude-0001', body: `${personLink('Kaan Arslan', KAAN)} the lockfile is old.`, replyTo: asked.id }, agent);
    await s.settle();
    expect(s.woken).toHaveLength(1);
    await s.say(s.owner, s.general, 'Update it then.', { replyTo: answer.id });
    await s.settle();
    expect(s.woken.map((each) => each.body.event.kind)).toEqual(['mention', 'reply']);
  });

  it('tells Kaan on the live channel whether it went, for the line under his message', async () => {
    const s = await start();
    const { agent } = await claude(s);
    s.listen(KAAN);
    s.answers.push(202, 401);
    const sent = await s.say(s.owner, s.general, `${personLink('Claude', agent)} look`);
    const lost = await s.say(s.owner, s.general, `${personLink('Claude', agent)} and this`);
    await s.settle();
    expect(s.heard.filter((each) => each.type === 'wake')).toEqual([
      { type: 'wake', chat: s.general, message: sent.id, agent, name: 'Claude', ok: true },
      { type: 'wake', chat: s.general, message: lost.id, agent, name: 'Claude', ok: false },
    ]);
  });

  it('tells Kaan of Claude’s message that mentions him, as unread, under Claude’s name, and not of one that does not', async () => {
    const s = await start();
    const { agent } = await claude(s);
    const kaanAccount = { id: KAAN, email: 'kaan@example.com', name: 'Kaan Arslan', role: 'owner' as const };
    const unread = () => s.server.chats.list(KAAN).find((chat) => chat.id === s.general)!;
    const quiet = s.server.chats.send(kaanAccount, s.general, { id: 'm-claude-0001', body: 'Looking at it.' }, agent);
    expect(s.server.chats.alertsFor(quiet.id)).toEqual([]);
    expect(unread()).toMatchObject({ unread: 0, alerts: 0 });
    const told = s.server.chats.send(kaanAccount, s.general, { id: 'm-claude-0002', body: `${personLink('Kaan Arslan', KAAN)} the lockfile is old.` }, agent);
    expect(s.server.chats.alertsFor(told.id)).toEqual([{ account: KAAN, mention: true }]);
    expect(unread()).toMatchObject({ unread: 1, alerts: 1 });
    expect(s.server.chats.pushContent(told.id, KAAN)).toMatchObject({ title: 'Claude · #general', body: '@Kaan Arslan the lockfile is old.' });
    // His own message is still not unread to him.
    await s.say(s.owner, s.general, 'Thanks.');
    expect(unread()).toMatchObject({ unread: 0 });
  });

  it('is not woken by Mert, nor when it is not connected or has no address', async () => {
    const s = await start();
    const { agent, device } = await claude(s);
    await s.say(s.mert, s.general, `${personLink('Claude', agent)} can you look?`);
    await s.settle();
    expect(s.woken).toEqual([]);
    await s.call(s.owner, 'DELETE', `/agents/${device}/wake`);
    await s.say(s.owner, s.general, `${personLink('Claude', agent)} can you look?`);
    const other = s.connect(KAAN, 'https://chatgpt.com/oauth', 'ChatGPT');
    await s.call(s.owner, 'PUT', `/agents/${other.device}/wake`, { url: CLAUDE_URL, headers: '' });
    s.server.db.prepare('UPDATE devices SET revoked_at = 1 WHERE id = ?').run(other.device);
    await s.say(s.owner, s.general, `${personLink('ChatGPT', other.agent)} and you?`);
    await s.settle();
    expect(s.woken).toEqual([]);
  });
});

describe('on a card and a task', () => {
  it('wakes once for a card given to Claude and mentioned in its description, then for a comment', async () => {
    const s = await start();
    const { agent } = await claude(s);
    const was = addCard(roadmap(), { title: 'Fix the login' }, at(0), kaan, 'card1');
    await s.write(s.owner, BOARD, serializeBoard(was));
    const given = updateCard(was, 'card1', { assignee: { id: agent, name: 'Claude' }, description: `${personLink('Claude', agent)} start with the tests` }, at(1), kaan);
    await s.write(s.owner, BOARD, serializeBoard(given));
    await s.settle();
    expect(s.woken.map((each) => each.body.event)).toEqual([expect.objectContaining({ kind: 'assign', card: { id: 'card1', key: `${was.prefix}-1`, title: 'Fix the login', board: 'Roadmap' } })]);
    await s.write(s.owner, BOARD, serializeBoard(addComment(given, 'card1', `${personLink('Claude', agent)} the phone too`, at(2), kaan, 'cm1')));
    await s.settle();
    expect(s.woken[1]!.body.event).toMatchObject({ kind: 'mention', card: { comment: 'cm1' } });
    expect(s.woken[1]!.body.text).toContain('> @Claude the phone too');
  });

  it('is not woken by Mert giving it a card, nor by a card its owner gives Mert', async () => {
    const s = await start();
    const { agent } = await claude(s);
    const was = addCard(roadmap(), { title: 'Fix the login' }, at(0), kaan, 'card1');
    await s.write(s.owner, BOARD, serializeBoard(was));
    await s.write(s.mert, BOARD, serializeBoard(updateCard(was, 'card1', { assignee: { id: agent, name: 'Claude' } }, at(1), mert)));
    await s.settle();
    expect(s.woken).toEqual([]);
  });

  it('wakes Claude for a task given to it', async () => {
    const s = await start();
    const { agent } = await claude(s);
    const was = addTask([], { title: 'Collect the feedback' }, at(0), 't1', kaan);
    await s.write(s.owner, LIST, serializeList({ sections: [], tasks: was }));
    await s.write(s.owner, LIST, serializeList({ sections: [], tasks: updateTask(was, 't1', { assignee: { id: agent, name: 'Claude' } }, at(1), kaan) }));
    await s.settle();
    expect(s.woken.map((each) => each.body.event)).toEqual([expect.objectContaining({ kind: 'assign', task: { id: 't1', title: 'Collect the feedback', list: 'Tasks' } })]);
  });
});

describe('what could not be sent', () => {
  it('is tried again after a minute and five on a 503, then the owner is told', async () => {
    const s = await start();
    const { agent } = await claude(s);
    s.listen(KAAN);
    s.answers.push(503, 503, 503);
    const asked = await s.say(s.owner, s.general, `${personLink('Claude', agent)} look`);
    await s.settle();
    expect(await s.later()).toEqual([60_000]);
    expect(await s.later()).toEqual([300_000]);
    expect(s.woken).toHaveLength(3);
    expect(s.heard.filter((each) => each.type === 'notice')).toEqual([
      expect.objectContaining({ title: 'Couldn’t reach Claude', body: 'The address answered 503.', href: `scrawl:chat/${encodeURIComponent(URL)}/${s.general}/${asked.id}` }),
    ]);
  });

  it('is not tried again on a 401 or when it took too long, and comes again when the address could not be reached', async () => {
    const s = await start();
    const { agent } = await claude(s);
    s.listen(KAAN);
    s.answers.push(401, 'slow', 'down', 202);
    await s.say(s.owner, s.general, `${personLink('Claude', agent)} one`);
    await s.say(s.owner, s.general, `${personLink('Claude', agent)} two`);
    await s.say(s.owner, s.general, `${personLink('Claude', agent)} three`);
    await s.settle();
    expect(s.heard.filter((each) => each.type === 'notice').map((each) => each.body)).toEqual(['The address answered 401.', 'Claude didn’t answer in 10 seconds.']);
    expect(s.woken).toHaveLength(3);
    // The one not reached, a minute later; beside it the two notifications wait a minute for Kaan's other devices.
    expect(await s.later()).toEqual([60_000, 60_000, 60_000]);
    expect(s.woken).toHaveLength(4);
    expect(s.heard.filter((each) => each.type === 'notice')).toHaveLength(2);
  });
});

describe('a Claude task', () => {
  it('is set up by its URL and token, the headers written here, and says in plain words when its token is refused', async () => {
    const s = await start();
    const { device, agent } = s.connect(KAAN);
    const put = (body: unknown) => s.call(s.owner, 'PUT', `/agents/${device}/wake`, body);
    expect((await put({ claude: { url: 'https://n8n.example.com/hook', token: 'sk-ant-oat01-x' } })).body).toMatchObject({ error: { code: 'bad-claude-url' } });
    expect((await put({ claude: { url: CLAUDE_URL, token: '' } })).body).toMatchObject({ error: { code: 'no-token' } });
    expect((await put({ claude: { url: CLAUDE_URL, token: 'Bearer sk-ant-oat01-secret' } })).body).toEqual({ url: CLAUDE_URL, host: 'api.anthropic.com', headers: ['Authorization', 'anthropic-version', 'anthropic-beta'], kind: 'claude' });
    // Saved again without a token, as Change… does: the one there stays.
    expect((await put({ claude: { url: CLAUDE_URL, token: '' } })).status).toBe(200);
    s.listen(KAAN);
    s.answers.push(401);
    await s.say(s.owner, s.general, `${personLink('Claude', agent)} look`);
    await s.settle();
    expect(s.woken[0]!.headers).toEqual([
      ['Authorization', 'Bearer sk-ant-oat01-secret'],
      ['anthropic-version', '2023-06-01'],
      ['anthropic-beta', 'experimental-cc-routine-2026-04-01'],
    ]);
    expect(s.heard.filter((each) => each.type === 'notice')).toEqual([expect.objectContaining({ title: 'Couldn’t reach Claude', body: 'Claude didn’t accept the token. Set it up again in Settings › Agents.' })]);
  });
});

describe('ChatGPT watching (MCP Events)', () => {
  const SECRET = `whsec_${Buffer.alloc(32, 9).toString('base64')}`;
  const HOOK = 'https://chatgpt.com/backend-api/mcp/events/abc';
  const rows = (s: S) => (s.server.db.prepare('SELECT COUNT(*) AS n FROM event_subscriptions').get() as { n: number }).n;

  it('subscribes once the callback gives the challenge back, and gets each wake signed; the same again renews it', async () => {
    const s = await start();
    const { device, agent } = s.connect(KAAN, 'https://chatgpt.com/oauth', 'ChatGPT');
    const made = await s.server.wakes.subscribe(agent, { arguments: {}, url: HOOK, secret: SECRET, ttlMs: null });
    expect(s.verified).toEqual([HOOK]);
    const lasts = Date.parse(made.refreshBefore) - Date.now();
    expect(lasts).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(lasts).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect((await s.call(s.owner, 'GET', '/agents')).body).toEqual([expect.objectContaining({ id: device, agent, wakes: null, watches: { host: 'chatgpt.com' } })]);
    const asked = await s.say(s.owner, s.general, `${personLink('ChatGPT', agent)} look at the build`);
    await s.settle();
    const sent = s.woken[0]!;
    const header = Object.fromEntries(sent.headers) as { [name: string]: string };
    expect(sent.url).toBe(HOOK);
    expect(header['webhook-signature']).toBe(webhookSignature(SECRET, header['webhook-id']!, Number(header['webhook-timestamp']), sent.raw));
    expect(header['x-mcp-subscription-id']).toBe(made.id);
    expect(sent.body).toMatchObject({ eventId: header['webhook-id'], name: 'wake', cursor: null, data: { event: { kind: 'mention', agent: { id: agent, name: 'ChatGPT' }, chat: { message: asked.id } } } });
    expect((sent.body as unknown as { data: { text: string } }).data.text).toContain('> @ChatGPT look at the build');
    await s.server.wakes.subscribe(agent, { arguments: {}, url: HOOK, secret: SECRET, ttlMs: 60 * 60 * 1000 });
    expect(rows(s)).toBe(1);
  });

  it('ends when the subscriber says it is gone (410), and Kaan is told in plain words', async () => {
    const s = await start();
    const { agent } = s.connect(KAAN, 'https://chatgpt.com/oauth', 'ChatGPT');
    await s.server.wakes.subscribe(agent, { arguments: {}, url: HOOK, secret: SECRET, ttlMs: null });
    s.listen(KAAN);
    s.answers.push(410);
    await s.say(s.owner, s.general, `${personLink('ChatGPT', agent)} look`);
    await s.settle();
    expect(rows(s)).toBe(0);
    expect(s.heard.filter((each) => each.type === 'notice')).toEqual([expect.objectContaining({ title: 'Couldn’t reach ChatGPT', body: 'ChatGPT stopped watching Scrawl. Set it up again in Settings › Agents.' })]);
  });

  it('refuses a callback that does not give the challenge back, a wrong secret, a callback on a home network, and arguments', async () => {
    const s = await start();
    const { agent } = s.connect(KAAN, 'https://chatgpt.com/oauth', 'ChatGPT');
    const subscribe = (input: object) => s.server.wakes.subscribe(agent, { arguments: {}, url: HOOK, secret: SECRET, ttlMs: null, ...input });
    s.callback.echoes = false;
    await expect(subscribe({})).rejects.toMatchObject({ reason: 'challenge_failed' });
    await expect(subscribe({})).rejects.toBeInstanceOf(CallbackRefused);
    s.callback.echoes = true;
    await expect(subscribe({ secret: 'whsec_c2hvcnQ=' })).rejects.toBeInstanceOf(SubscriptionRefused);
    await expect(subscribe({ url: 'https://192.168.1.20/hook' })).rejects.toBeInstanceOf(SubscriptionRefused);
    await expect(subscribe({ arguments: { space: 'Acme' } })).rejects.toBeInstanceOf(SubscriptionRefused);
    expect(rows(s)).toBe(0);
  });

  it('ends with Stop watching and with Disconnect', async () => {
    const s = await start();
    const { device, agent } = s.connect(KAAN, 'https://chatgpt.com/oauth', 'ChatGPT');
    await s.server.wakes.subscribe(agent, { arguments: {}, url: HOOK, secret: SECRET, ttlMs: null });
    expect((await s.call(s.owner, 'DELETE', `/agents/${device}/wake`)).status).toBe(204);
    expect(rows(s)).toBe(0);
    await s.server.wakes.subscribe(agent, { arguments: {}, url: HOOK, secret: SECRET, ttlMs: null });
    await s.call(s.owner, 'DELETE', `/agents/${device}`);
    expect(rows(s)).toBe(0);
  });
});

describe('safeFetch', () => {
  it('reaches no address but a public name on https, resolved to a public IP', async () => {
    const resolve = (address: string) => async () => [{ address, family: address.includes(':') ? 6 : 4 }];
    const refused = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ why: 'refused' });
    await refused(safeFetch('http://example.com/hook'));
    await refused(safeFetch('https://127.0.0.1/hook'));
    await refused(safeFetch('https://localhost/hook'));
    await refused(safeFetch('https://example.com/hook', {}, resolve('10.0.0.5')));
    await refused(safeFetch('https://example.com/hook', {}, resolve('::ffff:192.168.1.1')));
    await refused(safeFetch('https://example.com/hook', {}, resolve('fd00::1')));
    expect(notPublic('169.254.169.254')).toBe(true);
    expect(notPublic('8.8.8.8')).toBe(false);
    expect(notPublic('2606:4700::1111')).toBe(false);
  });
});
