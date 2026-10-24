import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { ServerAccount } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import type { Config } from './config';
import { makeServer } from './server';

// Messaging (design/chat.md): rooms and direct messages, messages and what is done to them, how
// far each person read, files, what changed after a cursor, and the live channel's events.

const URL = 'https://kaan.scrawlnotes.com';
const ACME = 'sp-acmeacme';
const OTHER = 'sp-otherrrr';
const PASSWORD = 'a long password';
const KAAN = 'person-kaan-01';
const MERT = 'person-mert';
const ELIF = 'person-elif';
const DENIZ = 'person-deniz';
const closers: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** Kaan owns the server; Mert and Elif are in Acme with him, Deniz only in Other. */
async function start(options: { listen?: boolean } = {}) {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-chat-'));
  let clock = Date.UTC(2026, 9, 24, 10, 0);
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const server = makeServer(config, { now: () => clock });
  closers.push(() => {
    server.live.stop();
    server.db.close();
    rmSync(data, { recursive: true, force: true });
  });
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const as = (token: string | null) => new ServerAccount({ url: URL, token: () => token, fetch });
  const { token: kaan } = await as(null).setUp({ name: 'Kaan Arslan', email: 'kaan@example.com', password: PASSWORD, person: KAAN, device: 'Laptop' });
  await as(kaan).openSpace(ACME, 'Acme');
  await as(kaan).openSpace(OTHER, 'Other');
  const invited = async (space: string, name: string) => {
    const { link } = await as(kaan).invite(space);
    return (await as(null).accept(link.split('/').pop()!, { name, email: `${name.toLowerCase()}@example.com`, password: PASSWORD, person: `person-${name.toLowerCase()}`, device: 'Phone' })).token;
  };
  const mert = await invited(ACME, 'Mert');
  const elif = await invited(ACME, 'Elif');
  const deniz = await invited(OTHER, 'Deniz');
  /** A request to the API with a person's key: its status and what it answered. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const response = await server.app.request(`${URL}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !(body instanceof Uint8Array) && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: body instanceof Uint8Array ? (body as Uint8Array<ArrayBuffer>) : JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // A file's bytes.
    }
    return { status: response.status, body: parsed };
  };
  let made = 0;
  const id = () => `m-test-${String(++made).padStart(4, '0')}`;
  /** Writes a message and gives it back as the server keeps it. */
  const say = async (token: string, chat: string, body: string, extra: object = {}) => {
    const sent = await call(token, 'POST', `/chat/${chat}/messages`, { id: id(), body, ...extra });
    expect(sent.status).toBe(200);
    return sent.body;
  };
  const list = async (token: string) => (await call(token, 'GET', '/chat')).body.chats as { id: string; general: boolean; space: string; name: string; [key: string]: unknown }[];
  const general = async (token: string, space = ACME) => (await list(token)).find((chat) => chat.general && chat.space === space)!;
  const room = async (token: string, name: string, kind: 'public' | 'private', members: string[] = []) => {
    const opened = await call(token, 'POST', '/chat/rooms', { space: ACME, name, kind, members });
    expect(opened.status).toBe(200);
    return opened.body;
  };
  return { server, data, as, kaan, mert, elif, deniz, call, id, say, list, general, room, later: (ms: number) => (clock += ms) };
}

describe('rooms', () => {
  it('gives every shared space a general room everyone in it is in, and a personal space none', async () => {
    const s = await start();
    const general = await s.general(s.mert);
    expect(general).toMatchObject({ kind: 'public', name: 'general', joined: true, notify: 'mentions', unread: 0 });
    expect((general.members as { name: string }[]).map((person) => person.name)).toEqual(['Elif', 'Kaan Arslan', 'Mert']);
    expect((await s.list(s.kaan)).filter((chat) => chat.general).map((chat) => chat.space).sort()).toEqual([ACME, OTHER].sort());
    expect((await s.call(s.mert, 'DELETE', `/chat/${general.id}/members/${MERT}`)).body.error.code).toBe('general');
    expect((await s.call(s.kaan, 'PATCH', `/chat/${general.id}`, { archived: true })).body.error.code).toBe('general');

    await s.as(s.mert).openSpace('sp-mertmert', 'Personal', true);
    expect((await s.call(s.mert, 'POST', '/chat/rooms', { space: 'sp-mertmert', name: 'notes', kind: 'public' })).body.error.code).toBe('personal');
    expect((await s.list(s.mert)).some((chat) => chat.space === 'sp-mertmert')).toBe(false);

    // A space from before messaging gets its general room as the server starts.
    s.server.db.prepare("INSERT INTO spaces (id, name, created_by, created_at) VALUES ('sp-oldoldol', 'Old', ?, 0)").run(KAAN);
    s.server.db.prepare("INSERT INTO members (space_id, account_id, role, added_at) VALUES ('sp-oldoldol', ?, 'manager', 0)").run(KAAN);
    s.server.chats.openGenerals();
    expect((await s.general(s.kaan, 'sp-oldoldol')).name).toBe('general');
  });

  it('shows a public room to everyone in the space to read and join, and a private one only to those in it', async () => {
    const s = await start();
    const design = await s.room(s.kaan, '# design', 'public');
    expect(design).toMatchObject({ name: 'design', kind: 'public', joined: true, notify: 'mentions' });
    expect((await s.call(s.mert, 'POST', '/chat/rooms', { space: ACME, name: 'Design', kind: 'private' })).body.error.code).toBe('name-taken');
    await s.say(s.kaan, design.id, 'Tab bar icons, second round');

    // Mert finds it in Browse rooms and reads it, but it is not his until he joins.
    expect((await s.list(s.mert)).some((chat) => chat.id === design.id)).toBe(false);
    const browse = (await s.call(s.mert, 'GET', `/spaces/${ACME}/rooms`)).body as { name: string; joined: boolean }[];
    expect(browse.map((each) => [each.name, each.joined])).toEqual([['design', false], ['general', true]]);
    expect((await s.call(s.mert, 'GET', `/chat/${design.id}/messages`)).body.messages).toHaveLength(1);
    expect((await s.call(s.mert, 'POST', `/chat/${design.id}/messages`, { id: s.id(), body: 'Hi' })).body.error.code).toBe('not-member');
    await s.call(s.mert, 'POST', `/chat/${design.id}/join`);
    expect((await s.list(s.mert)).some((chat) => chat.id === design.id)).toBe(true);
    await s.say(s.mert, design.id, 'Looks good');

    // A private room is not there for anyone else: not in Browse, not by its id.
    const founders = await s.room(s.kaan, 'founders', 'private', [MERT]);
    expect((founders.members as { id: string }[]).map((person) => person.id).sort()).toEqual([KAAN, MERT].sort());
    expect((await s.call(s.elif, 'GET', `/chat/${founders.id}`)).status).toBe(404);
    expect((await s.call(s.elif, 'GET', `/chat/${founders.id}/messages`)).status).toBe(404);
    expect(((await s.call(s.elif, 'GET', `/spaces/${ACME}/rooms`)).body as { name: string }[]).map((each) => each.name)).toEqual(['design', 'general']);
    expect((await s.call(s.elif, 'POST', `/chat/${founders.id}/join`)).status).toBe(404);
    expect((await s.call(s.deniz, 'POST', `/chat/${founders.id}/members`, { accounts: [DENIZ] })).status).toBe(404);
    expect((await s.call(s.mert, 'POST', `/chat/${founders.id}/members`, { accounts: [DENIZ] })).body.error.code).toBe('not-in-space');

    // Someone in it brings Elif in; she leaves again, and it is gone from her list.
    await s.call(s.mert, 'POST', `/chat/${founders.id}/members`, { accounts: [ELIF] });
    expect((await s.list(s.elif)).some((chat) => chat.id === founders.id)).toBe(true);
    expect((await s.call(s.elif, 'DELETE', `/chat/${founders.id}/members/${ELIF}`)).status).toBe(204);
    expect((await s.list(s.elif)).some((chat) => chat.id === founders.id)).toBe(false);
    expect((await s.call(s.elif, 'GET', `/chat/${founders.id}`)).status).toBe(404);
  });

  it('is changed and archived by whoever opened it and the space’s managers; an archived room is read, not written', async () => {
    const s = await start();
    const design = await s.room(s.mert, 'design', 'public');
    await s.call(s.elif, 'POST', `/chat/${design.id}/join`);
    expect((await s.call(s.elif, 'PATCH', `/chat/${design.id}`, { topic: 'Mine now' })).body.error.code).toBe('not-allowed');
    expect((await s.call(s.mert, 'PATCH', `/chat/${design.id}`, { name: 'Design', topic: 'Screens and icons' })).body).toMatchObject({ name: 'Design', topic: 'Screens and icons' });
    // Kaan manages Acme, so he archives a room he did not open.
    const archived = await s.call(s.kaan, 'PATCH', `/chat/${design.id}`, { archived: true });
    expect(archived.body.archived).toBe(Date.UTC(2026, 9, 24, 10, 0));
    expect((await s.list(s.mert)).some((chat) => chat.id === design.id)).toBe(false);
    expect(((await s.call(s.mert, 'GET', `/spaces/${ACME}/rooms`)).body as { name: string; archived: number | null }[]).find((each) => each.name === 'Design')!.archived).not.toBeNull();
    expect((await s.call(s.mert, 'POST', `/chat/${design.id}/messages`, { id: s.id(), body: 'Still here?' })).body.error.code).toBe('archived');
  });

  it('takes someone taken out of a space out of its rooms, and does not bring them back when they come back', async () => {
    const s = await start();
    const founders = await s.room(s.kaan, 'founders', 'private', [MERT]);
    await s.as(s.kaan).removeMember(ACME, MERT);
    expect((await s.call(s.mert, 'GET', `/chat/${founders.id}`)).status).toBe(404);
    expect(await s.list(s.mert)).toEqual([]);
    const { link } = await s.as(s.kaan).invite(ACME);
    await s.as(null).accept(link.split('/').pop()!, { name: '', email: 'mert@example.com', password: PASSWORD, person: '', device: 'Laptop' });
    expect((await s.list(s.mert)).map((chat) => chat.name)).toEqual(['general']);
  });
});

describe('direct messages', () => {
  it('is one conversation for the same people, with those who share a space, nine at most', async () => {
    const s = await start();
    const dm = await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] });
    expect(dm.body).toMatchObject({ kind: 'direct', space: null, name: '', notify: 'all' });
    expect((await s.call(s.mert, 'POST', '/chat/direct', { people: [KAAN] })).body.id).toBe(dm.body.id);
    const group = await s.call(s.kaan, 'POST', '/chat/direct', { people: [ELIF, MERT] });
    expect(group.body.id).not.toBe(dm.body.id);
    expect((group.body.members as { id: string }[]).map((person) => person.id).sort()).toEqual([ELIF, KAAN, MERT].sort());
    expect((await s.call(s.mert, 'POST', '/chat/direct', { people: [DENIZ] })).body.error.code).toBe('not-shared');
    expect((await s.call(s.kaan, 'POST', '/chat/direct', { people: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] })).body.error.code).toBe('too-many-people');
    expect((await s.call(s.kaan, 'DELETE', `/chat/${dm.body.id}/members/${KAAN}`)).body.error.code).toBe('direct');
    expect((await s.call(s.elif, 'GET', `/chat/${dm.body.id}`)).status).toBe(404);
  });

  it('comes back to everyone in it when a message comes, after it was hidden', async () => {
    const s = await start();
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    expect((await s.call(s.mert, 'PATCH', `/chat/${dm.id}/me`, { hidden: true })).body.hidden).toBe(true);
    await s.say(s.kaan, dm.id, 'Here: developer.apple.com/account');
    expect((await s.call(s.mert, 'GET', `/chat/${dm.id}`)).body).toMatchObject({ hidden: false, unread: 1, alerts: 1 });
    expect((await s.call(s.kaan, 'PATCH', `/chat/${(await s.general(s.kaan)).id}/me`, { hidden: true })).body.error.code).toBe('not-direct');
  });

  it('is read, not written, once the other one is off the server', async () => {
    const s = await start();
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    await s.say(s.mert, dm.id, 'Bye');
    await s.as(s.kaan).removePerson(MERT);
    const after = await s.call(s.kaan, 'GET', `/chat/${dm.id}`);
    expect(after.body.gone).toEqual([MERT]);
    expect((await s.call(s.kaan, 'GET', `/chat/${dm.id}/messages`)).body.messages).toHaveLength(1);
    expect((await s.call(s.kaan, 'POST', `/chat/${dm.id}/messages`, { id: s.id(), body: 'Still there?' })).body.error.code).toBe('gone');
  });
});

describe('messages', () => {
  it('is written once for its id, in order, and answers with a quote', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const first = await s.call(s.mert, 'POST', `/chat/${general.id}/messages`, { id: 'm-from-mert-1', body: 'Pushed 0.2.21' });
    const again = await s.call(s.mert, 'POST', `/chat/${general.id}/messages`, { id: 'm-from-mert-1', body: 'Pushed 0.2.21' });
    expect(again.body).toEqual(first.body);
    expect((await s.call(s.elif, 'POST', `/chat/${general.id}/messages`, { id: 'm-from-mert-1', body: 'Mine' })).body.error.code).toBe('message-exists');
    expect((await s.call(s.mert, 'POST', `/chat/${general.id}/messages`, { id: 'short', body: 'x' })).body.error.code).toBe('bad-message');
    expect((await s.call(s.mert, 'POST', `/chat/${general.id}/messages`, { id: s.id(), body: '   ' })).body.error.code).toBe('empty');
    const reply = await s.say(s.kaan, general.id, 'Looks good', { replyTo: 'm-from-mert-1' });
    expect(reply).toMatchObject({ seq: 2, author: KAAN, replyTo: { id: 'm-from-mert-1', author: MERT, text: 'Pushed 0.2.21', file: null, deleted: false } });
    expect((await s.call(s.kaan, 'POST', `/chat/${general.id}/messages`, { id: s.id(), body: 'x', replyTo: 'nothing-like-it' })).body.error.code).toBe('no-message');
    const page = await s.call(s.elif, 'GET', `/chat/${general.id}/messages`);
    expect(page.body.messages.map((each: { seq: number }) => each.seq)).toEqual([1, 2]);
    expect(page.body).toMatchObject({ older: false, newer: false });
  });

  it('is changed by whoever wrote it, and deleted by them or a manager, keeping its place', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const mine = await s.say(s.mert, general.id, 'Teh release is out');
    expect((await s.call(s.elif, 'PATCH', `/chat/messages/${mine.id}`, { body: 'Mine now' })).body.error.code).toBe('not-yours');
    s.later(60_000);
    const edited = await s.call(s.mert, 'PATCH', `/chat/messages/${mine.id}`, { body: 'The release is out' });
    expect(edited.body).toMatchObject({ body: 'The release is out', edited: Date.UTC(2026, 9, 24, 10, 1) });
    expect(edited.body.rev).toBeGreaterThan(mine.rev);
    const quoted = await s.say(s.elif, general.id, 'Finally', { replyTo: mine.id });
    expect((await s.call(s.elif, 'DELETE', `/chat/messages/${mine.id}`)).body.error.code).toBe('not-yours');
    // Kaan manages Acme.
    const deleted = await s.call(s.kaan, 'DELETE', `/chat/messages/${mine.id}`);
    expect(deleted.body).toMatchObject({ body: '', seq: mine.seq, files: [] });
    expect(deleted.body.deleted).not.toBeNull();
    expect((await s.call(s.mert, 'PATCH', `/chat/messages/${mine.id}`, { body: 'Back' })).body.error.code).toBe('deleted');
    const page = (await s.call(s.elif, 'GET', `/chat/${general.id}/messages`)).body.messages;
    expect(page.find((each: { id: string }) => each.id === quoted.id).replyTo).toMatchObject({ deleted: true, text: '' });
  });

  it('is forwarded with its words and files and where it came from, to another conversation someone sees', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const file = await s.call(s.elif, 'POST', '/chat/files', new Uint8Array([1, 2, 3, 4]));
    const source = await s.say(s.elif, general.id, 'The drag preview is cut off', { files: [{ hash: file.body.hash, name: 'drag-preview.png', type: 'image/png', width: 600, height: 340 }] });
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    const forwarded = await s.say(s.kaan, dm.id, 'ignored', { forwardOf: source.id });
    expect(forwarded).toMatchObject({
      body: 'The drag preview is cut off',
      files: [{ hash: file.body.hash, name: 'drag-preview.png', type: 'image/png', size: 4, width: 600, height: 340 }],
      forwarded: { chat: general.id, kind: 'public', name: 'general', author: ELIF, authorName: 'Elif' },
    });
    expect((await s.call(s.kaan, 'PATCH', `/chat/messages/${forwarded.id}`, { body: 'Changed' })).body.error.code).toBe('forwarded');
    // Mert sees the file through the forwarded message; Deniz, in no conversation with it, does not.
    expect((await s.call(s.mert, 'GET', `/chat/files/${file.body.hash}`)).status).toBe(200);
    expect((await s.call(s.deniz, 'GET', `/chat/files/${file.body.hash}`)).status).toBe(404);
  });

  it('takes reactions, one of each emoji from each person', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const message = await s.say(s.mert, general.id, 'Deploy done');
    await s.call(s.kaan, 'PUT', `/chat/messages/${message.id}/reactions/${encodeURIComponent('👍')}`);
    await s.call(s.elif, 'PUT', `/chat/messages/${message.id}/reactions/${encodeURIComponent('👍')}`);
    await s.call(s.elif, 'PUT', `/chat/messages/${message.id}/reactions/${encodeURIComponent('👍')}`);
    const reacted = await s.call(s.elif, 'PUT', `/chat/messages/${message.id}/reactions/${encodeURIComponent('🎉')}`);
    expect(reacted.body.reactions).toEqual([{ emoji: '👍', people: [KAAN, ELIF] }, { emoji: '🎉', people: [ELIF] }]);
    const off = await s.call(s.kaan, 'DELETE', `/chat/messages/${message.id}/reactions/${encodeURIComponent('👍')}`);
    expect(off.body.reactions).toEqual([{ emoji: '👍', people: [ELIF] }, { emoji: '🎉', people: [ELIF] }]);
    expect((await s.call(s.kaan, 'PUT', `/chat/messages/${message.id}/reactions/ok`)).body.error.code).toBe('bad-emoji');
  });

  it('keeps the mentions of people in the conversation, and @room only in a room', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const said = await s.say(s.kaan, general.id, `[@Mert](scrawl:person/${MERT}) and [@Deniz](scrawl:person/${DENIZ}), see this. [@room](scrawl:room)`);
    expect(said).toMatchObject({ mentions: [MERT], mentionsRoom: true });
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [MERT] })).body;
    expect(await s.say(s.kaan, dm.id, '[@room](scrawl:room)')).toMatchObject({ mentionsRoom: false });
  });

  it('pages a long conversation from its end, before and after a place, and around a message', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const sent = [];
    for (let n = 1; n <= 12; n++) sent.push(await s.say(s.kaan, general.id, `Message ${n}`));
    const seqs = async (query: string) => {
      const page = (await s.call(s.mert, 'GET', `/chat/${general.id}/messages?${query}`)).body;
      return [page.messages.map((each: { seq: number }) => each.seq), page.older, page.newer];
    };
    expect(await seqs('limit=5')).toEqual([[8, 9, 10, 11, 12], true, false]);
    expect(await seqs('limit=5&before=8')).toEqual([[3, 4, 5, 6, 7], true, true]);
    expect(await seqs('limit=5&after=9')).toEqual([[10, 11, 12], true, false]);
    expect(await seqs(`limit=4&around=${sent[5].id}`)).toEqual([[4, 5, 6, 7], true, true]);
  });

  it('is not written faster than thirty in ten seconds by one person', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    for (let n = 0; n < 30; n++) await s.say(s.kaan, general.id, `Line ${n}`);
    expect((await s.call(s.kaan, 'POST', `/chat/${general.id}/messages`, { id: s.id(), body: 'One more' })).status).toBe(429);
    s.later(10_001);
    await s.say(s.kaan, general.id, 'One more');
  });
});

describe('reading', () => {
  it('counts what someone did not read, and what tells them: all, their mentions, or nothing', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    await s.say(s.kaan, general.id, 'Office is closed on Friday');
    await s.say(s.kaan, general.id, `[@Mert](scrawl:person/${MERT}) can you lock up?`);
    expect(await s.call(s.mert, 'GET', `/chat/${general.id}`).then((each) => each.body)).toMatchObject({ unread: 2, alerts: 1, readSeq: 0 });
    expect(await s.call(s.kaan, 'GET', `/chat/${general.id}`).then((each) => each.body)).toMatchObject({ unread: 0, readSeq: 2 });
    await s.call(s.mert, 'PATCH', `/chat/${general.id}/me`, { notify: 'all' });
    expect((await s.call(s.mert, 'GET', `/chat/${general.id}`)).body).toMatchObject({ notify: 'all', alerts: 2 });
    await s.call(s.mert, 'PATCH', `/chat/${general.id}/me`, { notify: 'off' });
    expect((await s.call(s.mert, 'GET', `/chat/${general.id}`)).body).toMatchObject({ notify: 'off', unread: 2, alerts: 0 });
    expect((await s.call(s.mert, 'PATCH', `/chat/${general.id}/me`, { notify: 'loud' })).body.error.code).toBe('bad-notify');
    // Read up to the first, then a stale device says it read nothing: it never goes back.
    expect((await s.call(s.mert, 'POST', `/chat/${general.id}/read`, { seq: 1 })).body).toMatchObject({ readSeq: 1, unread: 1 });
    expect((await s.call(s.mert, 'POST', `/chat/${general.id}/read`, { seq: 0 })).body.readSeq).toBe(1);
    expect((await s.call(s.mert, 'POST', `/chat/${general.id}/read`, { seq: 99 })).body).toMatchObject({ readSeq: 2, unread: 0 });
  });

  it('tells the others in a direct message how far each read, for Seen', async () => {
    const s = await start();
    const dm = (await s.call(s.kaan, 'POST', '/chat/direct', { people: [ELIF] })).body;
    const asked = await s.say(s.kaan, dm.id, 'Could you send me a voice message?');
    expect((await s.call(s.kaan, 'GET', `/chat/${dm.id}`)).body.reads).toEqual({ [ELIF]: 0 });
    await s.call(s.elif, 'POST', `/chat/${dm.id}/read`, { seq: asked.seq });
    expect((await s.call(s.kaan, 'GET', `/chat/${dm.id}`)).body.reads).toEqual({ [ELIF]: 1 });
    expect((await s.general(s.kaan)).reads).toBeNull();
  });
});

describe('files', () => {
  it('is attached only by whoever uploaded it, and given to those in its conversation', async () => {
    const s = await start();
    const founders = await s.room(s.kaan, 'founders', 'private', [MERT]);
    const photo = await s.call(s.kaan, 'POST', '/chat/files', new Uint8Array([9, 8, 7]));
    const thumb = await s.call(s.kaan, 'POST', '/chat/files', new Uint8Array([1]));
    expect(photo.body).toMatchObject({ size: 3 });
    expect((await s.call(s.mert, 'POST', `/chat/${founders.id}/messages`, { id: s.id(), body: 'Mine', files: [{ hash: photo.body.hash, name: 'x.png' }] })).body.error.code).toBe('bad-file');
    // Before it is in a message, only Kaan gets it.
    expect((await s.call(s.mert, 'GET', `/chat/files/${photo.body.hash}`)).status).toBe(404);
    await s.say(s.kaan, founders.id, '', { files: [{ hash: photo.body.hash, name: 'pitch.png', type: 'image/png', thumb: thumb.body.hash }] });
    const got = await s.server.app.request(`${URL}/api/v1/chat/files/${photo.body.hash}`, { headers: { Authorization: `Bearer ${s.mert}` } });
    expect(got.headers.get('Content-Type')).toBe('image/png');
    expect([...new Uint8Array(await got.arrayBuffer())]).toEqual([9, 8, 7]);
    expect((await s.call(s.mert, 'GET', `/chat/files/${thumb.body.hash}`)).status).toBe(200);
    expect((await s.call(s.elif, 'GET', `/chat/files/${photo.body.hash}`)).status).toBe(404);
    expect((await s.call(s.kaan, 'POST', `/chat/${founders.id}/messages`, { id: s.id(), body: 'x', files: Array.from({ length: 11 }, () => ({ hash: photo.body.hash })) })).body.error.code).toBe('too-many-files');
  });

  it('is no longer given once the message that had it is deleted', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const photo = await s.call(s.mert, 'POST', '/chat/files', new Uint8Array([5, 5]));
    const message = await s.say(s.mert, general.id, 'Oops', { files: [{ hash: photo.body.hash, name: 'secret.png' }] });
    expect((await s.call(s.elif, 'GET', `/chat/files/${photo.body.hash}`)).status).toBe(200);
    await s.call(s.mert, 'DELETE', `/chat/messages/${message.id}`);
    expect((await s.call(s.elif, 'GET', `/chat/files/${photo.body.hash}`)).status).toBe(404);
  });
});

describe('what changed', () => {
  it('gives the conversations without a cursor, then what changed after it, edits and reactions too', async () => {
    const s = await start();
    const general = await s.general(s.kaan);
    const first = await s.call(s.mert, 'GET', '/chat');
    expect(first.body).toMatchObject({ full: true, messages: [] });
    const cursor = first.body.cursor as number;
    const said = await s.say(s.kaan, general.id, 'Standup in five');
    await s.call(s.elif, 'PUT', `/chat/messages/${said.id}/reactions/${encodeURIComponent('👀')}`);
    const other = await s.say(s.kaan, (await s.general(s.kaan, OTHER)).id, 'Only for Other');
    const changes = (await s.call(s.mert, 'GET', `/chat/changes?cursor=${cursor}`)).body;
    expect(changes.messages.map((each: { id: string }) => each.id)).toEqual([said.id]);
    expect(changes.messages[0].reactions).toEqual([{ emoji: '👀', people: [ELIF] }]);
    expect(changes.chats.find((chat: { id: string }) => chat.id === general.id)).toMatchObject({ unread: 1, last: { id: said.id } });
    expect(changes.messages.some((each: { id: string }) => each.id === other.id)).toBe(false);
    expect((await s.call(s.mert, 'GET', `/chat/changes?cursor=${changes.cursor}`)).body.messages).toEqual([]);
  });

  it('says so on the server’s page', async () => {
    const s = await start();
    expect(await (await s.server.app.request(`${URL}/api/v1/server`)).json()).toMatchObject({ chat: true });
  });
});

describe('the live channel', () => {
  /** A server listening on this computer, and a device of someone's on its live channel, keeping what it hears. */
  async function listening() {
    const s = await start();
    const sockets = new WebSocketServer({ noServer: true });
    const http = serve({ fetch: s.server.app.fetch, port: 0, websocket: { server: sockets } });
    await new Promise<void>((resolve) => http.once('listening', () => resolve()));
    const port = (http.address() as AddressInfo).port;
    closers.unshift(async () => {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    const device = async (token: string) => {
      const heard: { type: string; [key: string]: unknown }[] = [];
      const socket = new WebSocket(`ws://localhost:${port}/api/v1/live`);
      socket.onmessage = (event) => heard.push(JSON.parse(String(event.data)) as { type: string });
      await new Promise((resolve) => (socket.onopen = resolve));
      socket.send(JSON.stringify({ type: 'hello', token }));
      await until(() => heard.some((each) => each.type === 'ready'));
      closers.unshift(() => socket.close());
      return { heard, say: (what: object) => socket.send(JSON.stringify(what)), of: (type: string) => heard.filter((each) => each.type === type) };
    };
    return { ...s, device };
  }

  async function until(check: () => boolean) {
    for (let waited = 0; !check(); waited += 20) {
      if (waited > 3000) throw new Error('Waited too long');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it('brings a message to everyone in its conversation, and to no one else', async () => {
    const s = await listening();
    const founders = await s.room(s.kaan, 'founders', 'private', [MERT]);
    const mert = await s.device(s.mert);
    const elif = await s.device(s.elif);
    const said = await s.say(s.kaan, founders.id, 'Two intros came in');
    await until(() => mert.of('message').length === 1);
    expect(mert.of('message')[0]).toMatchObject({ chat: founders.id, message: { id: said.id, body: 'Two intros came in' } });
    await s.say(s.kaan, (await s.general(s.kaan)).id, 'For everyone');
    await until(() => elif.of('message').length === 1);
    expect((elif.of('message')[0]!.message as { body: string }).body).toBe('For everyone');
  });

  it('tells the others that someone is writing, a few seconds apart at most', async () => {
    const s = await listening();
    const general = await s.general(s.kaan);
    const mert = await s.device(s.mert);
    const kaan = await s.device(s.kaan);
    kaan.say({ type: 'typing', chat: general.id });
    kaan.say({ type: 'typing', chat: general.id });
    await until(() => mert.of('typing').length === 1);
    expect(mert.of('typing')[0]).toEqual({ type: 'typing', chat: general.id, account: KAAN });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mert.of('typing')).toHaveLength(1);
    expect(kaan.of('typing')).toHaveLength(0);
  });

  it('tells those who share a space who is using Scrawl now', async () => {
    const s = await listening();
    const mert = await s.device(s.mert);
    const deniz = await s.device(s.deniz);
    expect(mert.of('presence')[0]).toEqual({ type: 'presence', active: [] });
    const kaan = await s.device(s.kaan);
    kaan.say({ type: 'active', active: true, viewing: null });
    await until(() => mert.of('presence').length === 2);
    expect(mert.of('presence')[1]).toEqual({ type: 'presence', account: KAAN, active: true });
    expect(s.server.live.isActive(KAAN)).toBe(true);
    // Deniz shares Other with Kaan, so he hears it too; Mert and Deniz share nothing.
    await until(() => deniz.of('presence').length === 2);
    mert.say({ type: 'active', active: true, viewing: null });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(deniz.of('presence')).toHaveLength(2);
    const late = await s.device(s.elif);
    expect((late.of('presence')[0]!.active as string[]).sort()).toEqual([KAAN, MERT].sort());
  });
});
