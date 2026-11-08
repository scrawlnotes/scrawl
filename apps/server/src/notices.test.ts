import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addCard, addComment, addTask, newBoard, personLink, remindCard, serializeBoard, serializeList, ServerAccount, SYNC_LEVEL, updateCard, updateTask } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import type { LiveSocket } from './live';
import type { PushPayload, Sender } from './push';
import { makeServer } from './server';

// A card's or a task's notifications (design/notifications.md): written by anyone, a board or a
// task list tells whoever it newly mentions or gives something to, by a push or on the live
// channel, and what a push carries opens the card at its comment.

const URL = 'https://kaan.scrawlnotes.com';
const ACME = 'sp-acmeacme';
const PASSWORD = 'a long password';
const KAAN = 'person-kaan-01';
const MERT = 'person-mert';
const BOARD = 'Roadmap.board.json';
const LIST = 'Work/Tasks.tasks.json';
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const at = (minute: number) => () => new Date(Date.UTC(2026, 10, 9, 9, minute));
const kaan = { id: KAAN, name: 'Kaan Arslan' };

async function start() {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-notices-'));
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const sender: Sender = async (subscription, payload) => {
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) as PushPayload });
    return { statusCode: 201 };
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
  const { token: owner } = await as(null).setUp({ name: 'Kaan Arslan', email: 'kaan@example.com', password: PASSWORD, person: KAAN, device: 'Laptop' });
  await as(owner).openSpace(ACME, 'Acme');
  const { link } = await as(owner).invite(ACME);
  const { token: mert } = await as(null).accept(link.split('/').pop()!, { name: 'Mert Kaya', email: 'mert@example.com', password: PASSWORD, person: MERT, device: 'Phone' });
  const call = async (token: string, method: string, path: string, body?: string, headers: Record<string, string> = {}) => {
    const response = await server.app.request(`${URL}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, ...(body !== undefined && { body }) });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as { hash?: string }) : null };
  };
  const hashes = new Map<string, string>();
  /** Writes a file of the space as a device does: over what it last saw. */
  const write = async (token: string, path: string, text: string) => {
    const was = hashes.get(path);
    const result = await call(token, 'PUT', `/spaces/${ACME}/files/${path.split('/').map(encodeURIComponent).join('/')}`, text, { 'Scrawl-Sync': String(SYNC_LEVEL), ...(was ? { 'If-Match': `"${was}"` } : { 'If-None-Match': '*' }) });
    expect(result.status).toBe(200);
    hashes.set(path, result.body!.hash!);
  };
  await call(mert, 'POST', '/push/subscriptions', JSON.stringify({ endpoint: 'https://push.example.com/mert', keys: { p256dh: 'BKey', auth: 'auth' } }), { 'Content-Type': 'application/json' });
  const heard: object[] = [];
  const connect = (account: string, active: boolean) => {
    const socket: LiveSocket = { account, device: (server.db.prepare('SELECT id FROM devices WHERE account_id = ?').get(account) as { id: string }).id, send: (text) => heard.push(JSON.parse(text) as object), close: () => undefined };
    server.live.add(socket);
    server.live.setActive(socket, active, null);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  const minutePasses = async () => {
    for (const run of waiting.splice(0)) run();
    await settle();
  };
  return { server, owner, mert, write, call, sent, heard, connect, settle, minutePasses };
}

function roadmap() {
  let n = 0;
  return newBoard('Roadmap', 'software', () => `c${++n}`);
}

describe('notices', () => {
  it('tells Mert of a mention in a comment by a push that opens the card at it', async () => {
    const s = await start();
    const was = addCard(roadmap(), { title: 'Export a board as CSV' }, at(0), kaan, 'card1');
    await s.write(s.owner, BOARD, serializeBoard(was));
    expect(s.sent).toEqual([]);
    await s.write(s.owner, BOARD, serializeBoard(addComment(was, 'card1', `${personLink('Mert Kaya', 'person-mert')} can you check the headers?`, at(5), kaan, 'cm1')));
    await s.settle();
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]!.endpoint).toBe('https://push.example.com/mert');
    expect(s.sent[0]!.payload).toMatchObject({
      title: `Kaan mentioned you on ${was.prefix}-1`,
      body: '@Mert Kaya can you check the headers?',
      href: `scrawl:item/card/${ACME}/${BOARD}?id=card1&comment=cm1`,
      server: URL,
    });
  });

  it('tells no one of their own doing, nor someone not in the space, nor of a file new to it', async () => {
    const s = await start();
    const given = addCard(roadmap(), { title: 'Undo a move', assignee: { id: MERT, name: 'Mert Kaya' } }, at(0), kaan, 'card1');
    // New to the server: what it holds was done before it came.
    await s.write(s.owner, BOARD, serializeBoard(given));
    const own = addComment(given, 'card1', `${personLink('Kaan Arslan', KAAN)} and ${personLink('Elif Demir', 'person-elif')}`, at(3), kaan, 'cm1');
    await s.write(s.owner, BOARD, serializeBoard(own));
    await s.settle();
    expect(s.sent).toEqual([]);
  });

  it('tells Mert of a task given to him, written by an agent, with where the task is', async () => {
    const s = await start();
    const was = addTask([], { title: 'Collect the feedback' }, at(0), 't1', kaan);
    await s.write(s.owner, LIST, serializeList({ sections: [], tasks: was }));
    const agent = { id: `${KAAN}:laptop`, name: 'Claude Code (Laptop)' };
    await s.write(s.owner, LIST, serializeList({ sections: [], tasks: updateTask(was, 't1', { assignee: { id: MERT, name: 'Mert Kaya' } }, at(2), agent) }));
    await s.settle();
    expect(s.sent.map((each) => [each.payload.title, each.payload.body, each.payload.href])).toEqual([
      ['Claude Code (Laptop) · Kaan assigned you Collect the feedback', 'Tasks · Acme', `scrawl:item/task/${ACME}/Work%2FTasks.tasks.json?id=t1`],
    ]);
  });

  it('tells a device in use on the live channel, and the others a minute later unless it is opened', async () => {
    const s = await start();
    const was = addCard(roadmap(), { title: 'Export a board as CSV' }, at(0), kaan, 'card1');
    await s.write(s.owner, BOARD, serializeBoard(was));
    s.connect(MERT, true);
    await s.write(s.owner, BOARD, serializeBoard(updateCard(was, 'card1', { assignee: { id: MERT, name: 'Mert Kaya' } }, at(1), kaan)));
    await s.settle();
    expect(s.heard.filter((each) => (each as { type: string }).type === 'notice')).toEqual([expect.objectContaining({ type: 'notice', title: `Kaan assigned you ${was.prefix}-1`, body: 'Export a board as CSV', space: ACME, item: 'card1' })]);
    expect(s.sent).toEqual([]);
    // Opened on the device in use: nothing goes to the others.
    expect((await s.call(s.mert, 'POST', '/opened', JSON.stringify({ space: ACME, item: 'card1' }), { 'Content-Type': 'application/json' })).status).toBe(204);
    await s.minutePasses();
    expect(s.sent).toEqual([]);
  });
  it('tells Mert of a reminder of his card, with when it is due', async () => {
    const s2 = await start();
    const was = addCard(roadmap(), { title: 'Export a board as CSV', assignee: { id: MERT, name: 'Mert Kaya' }, due: '2026-11-10' }, at(0), kaan, 'card1');
    await s2.write(s2.owner, BOARD, serializeBoard(was));
    await s2.write(s2.owner, BOARD, serializeBoard(remindCard(was, 'card1', at(5), kaan)));
    await s2.settle();
    expect(s2.sent.map((each) => [each.payload.title, each.payload.body])).toEqual([[`Kaan reminded you about ${was.prefix}-1`, 'Export a board as CSV · Due Nov 10']]);
  });

  it('tells Mert nothing of what he turned off, on every device of his, and the rest still', async () => {
    const s = await start();
    const json = { 'Content-Type': 'application/json' };
    const turned = await s.call(s.mert, 'PATCH', '/me', JSON.stringify({ notify: { mentions: false } }), json);
    expect(turned.body).toMatchObject({ notify: { mentions: false, assignments: true, reminders: true, due: true } });
    expect((await s.call(s.mert, 'GET', '/me')).body).toMatchObject({ notify: { mentions: false, assignments: true } });
    expect((await s.call(s.mert, 'PATCH', '/me', JSON.stringify({ notify: { sound: false } }), json)).status).toBe(400);
    const was = addCard(roadmap(), { title: 'Export a board as CSV' }, at(0), kaan, 'card1');
    await s.write(s.owner, BOARD, serializeBoard(was));
    const mentioned = addComment(was, 'card1', `${personLink('Mert Kaya', MERT)} can you check the headers?`, at(5), kaan, 'cm1');
    await s.write(s.owner, BOARD, serializeBoard(mentioned));
    await s.write(s.owner, BOARD, serializeBoard(updateCard(mentioned, 'card1', { assignee: { id: MERT, name: 'Mert Kaya' } }, at(6), kaan)));
    await s.settle();
    expect(s.sent.map((each) => each.payload.title)).toEqual([`Kaan assigned you ${was.prefix}-1`]);
  });
});
