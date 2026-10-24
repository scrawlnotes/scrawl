import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerAccount } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import type { LiveSocket } from './live';
import type { PushPayload, Sender } from './push';
import { makeServer } from './server';

// Notifications by Web Push (design/chat.md, 6 and 11.4): who a message tells, what it says, the
// minute someone using Scrawl elsewhere has to read it, and no push to a screen it is on.

const URL = 'https://kaan.scrawlnotes.com';
const ACME = 'sp-acmeacme';
const PASSWORD = 'a long password';
const KAAN = 'person-kaan-01';
const MERT = 'person-mert';
const ELIF = 'person-elif';
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function start(answer: (endpoint: string) => number = () => 201) {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-push-'));
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const sent: { endpoint: string; payload: PushPayload; urgency: string }[] = [];
  const sender: Sender = async (subscription, payload, options) => {
    const status = answer(subscription.endpoint);
    if (status >= 400) throw Object.assign(new Error('gone'), { statusCode: status });
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) as PushPayload, urgency: options.urgency });
    return { statusCode: status };
  };
  const waiting: (() => void)[] = [];
  const server = makeServer(config, { sender, later: (run) => (waiting.push(run), setTimeout(() => undefined, 0)) });
  closers.push(() => {
    server.push.stop();
    server.live.stop();
    server.db.close();
    rmSync(data, { recursive: true, force: true });
  });
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const as = (token: string | null) => new ServerAccount({ url: URL, token: () => token, fetch });
  const { token: kaan } = await as(null).setUp({ name: 'Kaan Arslan', email: 'kaan@example.com', password: PASSWORD, person: KAAN, device: 'Laptop' });
  await as(kaan).openSpace(ACME, 'Acme');
  const invited = async (name: string) => {
    const { link } = await as(kaan).invite(ACME);
    return (await as(null).accept(link.split('/').pop()!, { name, email: `${name.toLowerCase()}@example.com`, password: PASSWORD, person: `person-${name.toLowerCase()}`, device: 'Phone' })).token;
  };
  const mert = await invited('Mert');
  const elif = await invited('Elif');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const response = await server.app.request(`${URL}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  let made = 0;
  const say = async (token: string, chat: string, body: string) => (await call(token, 'POST', `/chat/${chat}/messages`, { id: `m-push-${++made}`, body })).body;
  const subscribe = (token: string, name: string) => call(token, 'POST', '/push/subscriptions', { endpoint: `https://push.example.com/${name}`, keys: { p256dh: 'BKey', auth: 'auth' } });
  const general = async () => ((await call(kaan, 'GET', '/chat')).body.chats as { id: string; general: boolean }[]).find((chat) => chat.general)!;
  const deviceOf = (account: string) => (server.db.prepare('SELECT id FROM devices WHERE account_id = ?').get(account) as { id: string }).id;
  /** A device of someone connected to the live channel, in use, with a conversation on its screen or none. */
  const using = (account: string, device: string, viewing: string | null) => {
    const socket: LiveSocket = { account, device, send: () => undefined, close: () => undefined };
    server.live.add(socket);
    server.live.setActive(socket, true, viewing);
    return socket;
  };
  /** Lets every wait of a minute end now. */
  const minutePasses = async () => {
    for (const run of waiting.splice(0)) run();
    await new Promise((resolve) => setTimeout(resolve, 10));
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  return { server, kaan, mert, elif, call, say, subscribe, general, deviceOf, using, minutePasses, settle, sent, waiting };
}

describe('push', () => {
  it('tells a direct message, a private room and a mention at once, a public room’s other messages no one', async () => {
    const s = await start();
    await s.subscribe(s.mert, 'mert');
    await s.subscribe(s.elif, 'elif');
    const general = await s.general();
    await s.say(s.kaan, general.id, 'Good morning');
    await s.settle();
    expect(s.sent).toEqual([]);

    await s.say(s.kaan, general.id, `[@Mert](scrawl:person/${MERT}) can you **look**?`);
    await s.settle();
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({ endpoint: 'https://push.example.com/mert', urgency: 'high', payload: { title: 'Kaan Arslan · #general', body: '@Mert can you look?', badge: 1, server: URL, chat: general.id, tag: general.id } });

    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [ELIF] })).body;
    await s.say(s.kaan, dm.id, 'Have you got a minute?');
    const founders = (await s.call(s.kaan, 'POST', '/chat/rooms', { space: ACME, name: 'founders', kind: 'private', members: [MERT] })).body;
    await s.say(s.kaan, founders.id, 'Two intros came in');
    await s.say(s.kaan, dm.id, 'It is about the release');
    await s.settle();
    // How many in the conversation, and in all of them: Mert has the mention in #general too.
    expect(s.sent.slice(1).map((each) => [each.endpoint, each.payload.title, each.urgency, each.payload.count, each.payload.badge])).toEqual([
      ['https://push.example.com/elif', 'Kaan Arslan', 'high', 1, 1],
      ['https://push.example.com/mert', 'Kaan Arslan · #founders', 'normal', 1, 2],
      ['https://push.example.com/elif', 'Kaan Arslan', 'high', 2, 2],
    ]);

    // Off: nothing, a mention neither.
    await s.call(s.mert, 'PATCH', `/chat/${general.id}/me`, { notify: 'off' });
    await s.say(s.kaan, general.id, `[@Mert](scrawl:person/${MERT}) again`);
    await s.settle();
    expect(s.sent).toHaveLength(4);
  });

  it('waits a minute for someone using Scrawl elsewhere, and sends nothing once they read it there', async () => {
    const s = await start();
    await s.subscribe(s.mert, 'mert');
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    s.using(MERT, 'another-device', null);
    await s.say(s.kaan, dm.id, 'One');
    await s.settle();
    expect(s.sent).toHaveLength(0);
    expect(s.waiting).toHaveLength(1);
    await s.minutePasses();
    expect(s.sent.map((each) => each.payload.body)).toEqual(['One']);

    const two = await s.say(s.kaan, dm.id, 'Two');
    await s.call(s.mert, 'POST', `/chat/${dm.id}/read`, { seq: two.seq });
    await s.minutePasses();
    expect(s.sent).toHaveLength(1);
  });

  it('tells no device of a conversation on someone’s screen, and the device in use hears it live', async () => {
    const s = await start();
    await s.subscribe(s.mert, 'mert');
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    const phone = s.using(MERT, s.deviceOf(MERT), dm.id);
    await s.say(s.kaan, dm.id, 'Seen at once');
    await s.minutePasses();
    expect(s.sent).toHaveLength(0);
    // In use, another conversation on its screen: the minute passes, and the phone is still the one in use.
    s.server.live.setActive(phone, true, null);
    await s.say(s.kaan, dm.id, 'Not on screen');
    await s.minutePasses();
    expect(s.sent).toHaveLength(0);
  });

  it('drops a subscription its push service says is gone, and sends a test to this device', async () => {
    const s = await start((endpoint) => (endpoint.endsWith('/old') ? 410 : 201));
    expect((await s.call(s.mert, 'POST', '/push/subscriptions', { endpoint: 'http://not-https', keys: { p256dh: 'a', auth: 'b' } })).status).toBe(400);
    await s.subscribe(s.mert, 'old');
    await s.subscribe(s.mert, 'mert');
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    await s.say(s.kaan, dm.id, 'Hello');
    await s.settle();
    expect(s.sent.map((each) => each.endpoint)).toEqual(['https://push.example.com/mert']);
    expect((s.server.db.prepare('SELECT endpoint FROM push_subscriptions').all() as { endpoint: string }[]).map((row) => row.endpoint)).toEqual(['https://push.example.com/mert']);

    expect((await s.call(s.mert, 'POST', '/push/test')).body).toEqual({ sent: 1 });
    expect(s.sent.at(-1)!.payload).toMatchObject({ title: 'Scrawl', tag: 'test', badge: 1 });
    expect((await s.call(s.kaan, 'GET', '/push/key')).body.key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    await s.call(s.mert, 'DELETE', '/push/subscriptions', { endpoint: 'https://push.example.com/mert' });
    expect(s.server.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()).toEqual({ n: 0 });
  });
});
