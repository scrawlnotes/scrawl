import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerAccount } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import { makeServer } from './server';

// Messages found by their words (design/chat.md, 7 and 11.6): where a word starts, without
// accents and case, ı and İ as i, in the words and the files' names; narrowed by who, where,
// what and when; only in the conversations someone is in.

const URL = 'https://kaan.scrawlnotes.com';
const ACME = 'sp-acmeacme';
const PASSWORD = 'a long password';
const MERT = 'person-mert';
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function start() {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-search-'));
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  let now = Date.UTC(2026, 9, 1, 9);
  const server = makeServer(config, { now: () => now, sender: async () => ({ statusCode: 201 }) });
  closers.push(() => {
    server.push.stop();
    server.live.stop();
    server.db.close();
    rmSync(data, { recursive: true, force: true });
  });
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const as = (token: string | null) => new ServerAccount({ url: URL, token: () => token, fetch });
  const { token: kaan } = await as(null).setUp({ name: 'Kaan Arslan', email: 'kaan@example.com', password: PASSWORD, person: 'person-kaan-01', device: 'Laptop' });
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
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !(body instanceof Uint8Array) && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: body instanceof Uint8Array ? (body as Uint8Array<ArrayBuffer>) : JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  let made = 0;
  const say = async (token: string, chat: string, body: string, files: unknown[] = []) => {
    now += 60_000;
    return (await call(token, 'POST', `/chat/${chat}/messages`, { id: `m-search-${++made}`, body, files })).body;
  };
  /** The bodies found, the newest first. */
  const find = async (token: string, query: Record<string, string | number>) =>
    ((await call(token, 'GET', `/chat/search?${new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))}`)).body.messages as { body: string }[]).map((message) => message.body);
  const general = async () => ((await call(kaan, 'GET', '/chat')).body.chats as { id: string; general: boolean }[]).find((chat) => chat.general)!.id;
  const idOf = (token: string) => call(token, 'GET', '/me').then((answer) => answer.body.id as string);
  return { server, kaan, mert, elif, call, say, find, general, idOf, now: () => now, later: (ms: number) => (now += ms) };
}

describe('search', () => {
  it('finds a word where a word starts, without accents and case, ı and İ as i', async () => {
    const s = await start();
    const room = await s.general();
    await s.say(s.kaan, room, 'Müşteri görüşmesi **yarın**');
    await s.say(s.kaan, room, 'The drag preview is cut off on narrow boards');
    await s.say(s.kaan, room, 'İstanbul ofisi açıldı');
    await s.say(s.kaan, room, 'A redrag is not a drag');

    expect(await s.find(s.mert, { q: 'musteri' })).toEqual(['Müşteri görüşmesi **yarın**']);
    expect(await s.find(s.mert, { q: 'YARIN' })).toEqual(['Müşteri görüşmesi **yarın**']);
    expect(await s.find(s.mert, { q: 'istanbul acil' })).toEqual(['İstanbul ofisi açıldı']);
    // Every word, each where a word starts: "drag" is not found inside "redrag" alone.
    expect(await s.find(s.mert, { q: 'drag prev' })).toEqual(['The drag preview is cut off on narrow boards']);
    expect(await s.find(s.mert, { q: 'rag' })).toEqual([]);
    expect(await s.find(s.mert, { q: 'drag' })).toEqual(['A redrag is not a drag', 'The drag preview is cut off on narrow boards']);
    // Nothing typed, nothing narrowed: nothing found.
    expect(await s.find(s.mert, { q: '  ' })).toEqual([]);
    expect(await s.find(s.mert, { q: '#' })).toEqual([]);
  });

  it('finds by a file’s name and a mention’s, and not what was deleted or what it said before', async () => {
    const s = await start();
    const room = await s.general();
    const file = (await s.call(s.kaan, 'POST', '/chat/files', new Uint8Array([1, 2, 3]))).body;
    await s.say(s.kaan, room, '', [{ hash: file.hash, name: 'Quarterly-Plan_v2.pdf', type: 'application/pdf' }]);
    const mertId = await s.idOf(s.mert);
    const old = await s.say(s.kaan, room, 'First words');
    await s.call(s.kaan, 'PATCH', `/chat/messages/${old.id}`, { body: 'Second words' });
    const gone = await s.say(s.kaan, room, 'Soon deleted');
    await s.call(s.kaan, 'DELETE', `/chat/messages/${gone.id}`);
    await s.say(s.kaan, room, `[@Mert Kaya](scrawl:person/${mertId}) look`);

    expect(await s.find(s.elif, { q: 'quarterly plan' })).toEqual(['']);
    expect(await s.find(s.elif, { q: 'v2', has: 'files' })).toEqual(['']);
    expect(await s.find(s.elif, { q: 'first' })).toEqual([]);
    expect(await s.find(s.elif, { q: 'second' })).toEqual(['Second words']);
    expect(await s.find(s.elif, { q: 'deleted' })).toEqual([]);
    expect(await s.find(s.elif, { q: 'kaya' })).toEqual([`[@Mert Kaya](scrawl:person/${mertId}) look`]);
    expect(await s.find(s.elif, { q: 'scrawl' })).toEqual([]);
  });

  it('narrows by who wrote it, the conversation, what it has and when, a page at a time', async () => {
    const s = await start();
    const room = await s.general();
    const dev = (await s.call(s.kaan, 'POST', '/chat/rooms', { space: ACME, name: 'dev', kind: 'public' })).body;
    await s.call(s.mert, 'POST', `/chat/${dev.id}/join`);
    const began = s.now();
    await s.say(s.kaan, room, 'Release notes are in the board');
    await s.say(s.mert, room, 'Release is tomorrow, see https://example.com/plan');
    await s.say(s.mert, dev.id, 'Release script:\n```sh\npnpm release\n```');
    s.later(3 * 24 * 60 * 60 * 1000);
    await s.say(s.kaan, dev.id, 'Release went out');

    const mertId = await s.idOf(s.mert);
    expect(await s.find(s.kaan, { q: 'release', from: mertId })).toEqual(['Release script:\n```sh\npnpm release\n```', 'Release is tomorrow, see https://example.com/plan']);
    expect(await s.find(s.kaan, { q: 'release', in: dev.id })).toEqual(['Release went out', 'Release script:\n```sh\npnpm release\n```']);
    expect(await s.find(s.kaan, { q: 'release', has: 'links' })).toEqual(['Release is tomorrow, see https://example.com/plan']);
    expect(await s.find(s.kaan, { q: 'release', has: 'code' })).toEqual(['Release script:\n```sh\npnpm release\n```']);
    expect(await s.find(s.kaan, { q: 'release', until: began + 24 * 60 * 60 * 1000 })).toHaveLength(3);
    expect(await s.find(s.kaan, { q: 'release', since: began + 24 * 60 * 60 * 1000 })).toEqual(['Release went out']);
    // From alone, with nothing typed.
    expect(await s.find(s.kaan, { from: mertId })).toHaveLength(2);

    const first = (await s.call(s.kaan, 'GET', '/chat/search?q=release&limit=3')).body;
    expect(first.messages).toHaveLength(3);
    expect(first.chats.map((chat: { id: string }) => chat.id).sort()).toEqual([dev.id, room].sort());
    const second = (await s.call(s.kaan, 'GET', `/chat/search?q=release&limit=3&before=${first.next}`)).body;
    expect(second.messages.map((message: { body: string }) => message.body)).toEqual(['Release notes are in the board']);
    expect(second.next).toBeNull();
  });

  it('puts the messages written before search in its index once, at a start', async () => {
    const s = await start();
    const room = await s.general();
    await s.say(s.kaan, room, 'Written before search came');
    s.server.db.exec("INSERT INTO messages_fts (messages_fts) VALUES ('delete-all'); UPDATE meta SET value = '0' WHERE key = 'chat_fts'");
    expect(await s.find(s.mert, { q: 'before' })).toEqual([]);
    s.server.chats.indexMessages();
    expect(await s.find(s.mert, { q: 'before' })).toEqual(['Written before search came']);
    expect(s.server.db.prepare("SELECT value FROM meta WHERE key = 'chat_fts'").get()).toEqual({ value: '1' });
  });

  it('finds only in the conversations someone is in, or in a room they see when asked', async () => {
    const s = await start();
    const secret = (await s.call(s.kaan, 'POST', '/chat/rooms', { space: ACME, name: 'founders', kind: 'private', members: [MERT] })).body;
    const open = (await s.call(s.kaan, 'POST', '/chat/rooms', { space: ACME, name: 'design', kind: 'public' })).body;
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    await s.say(s.kaan, secret.id, 'Budget for the quarter');
    await s.say(s.kaan, open.id, 'Budget for the icons');
    await s.say(s.kaan, dm.id, 'Budget between us');

    expect(await s.find(s.mert, { q: 'budget' })).toEqual(['Budget between us', 'Budget for the quarter']);
    // Elif is in neither the private room nor the direct message, nor has she joined design.
    expect(await s.find(s.elif, { q: 'budget' })).toEqual([]);
    expect(await s.find(s.elif, { q: 'budget', in: open.id })).toEqual(['Budget for the icons']);
    expect((await s.call(s.elif, 'GET', `/chat/search?q=budget&in=${secret.id}`)).status).toBe(404);
  });
});
