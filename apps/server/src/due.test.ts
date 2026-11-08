import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addCard, addTask, moveCardToKind, newBoard, serializeBoard, serializeList, ServerAccount, SYNC_LEVEL } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import type { PushPayload, Sender } from './push';
import { makeServer } from './server';

// The morning's notification (design/notifications.md 5): at nine on the person's clock, once a
// day, their work due today and tomorrow; nothing when nothing is due; not after noon.

const URL = 'https://kaan.scrawlnotes.com';
const ACME = 'sp-acmeacme';
const PASSWORD = 'a long password';
const KAAN = 'person-kaan-01';
const MERT = 'person-mert';
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** Istanbul is three hours ahead of UTC in November. */
const istanbul = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour - 3, minute);

async function start() {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-due-'));
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const sent: PushPayload[] = [];
  const sender: Sender = async (_subscription, payload) => {
    sent.push(JSON.parse(payload) as PushPayload);
    return { statusCode: 201 };
  };
  let clock = istanbul(9, 8);
  const server = makeServer(config, { sender, now: () => clock });
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
  server.accounts.setTimeZone(MERT, 'Europe/Istanbul');
  await server.app.request(`${URL}/api/v1/push/subscriptions`, { method: 'POST', headers: { Authorization: `Bearer ${mert}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://push.example.com/mert', keys: { p256dh: 'BKey', auth: 'auth' } }) });
  const write = async (path: string, text: string) => {
    const response = await server.app.request(`${URL}/api/v1/spaces/${ACME}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { Authorization: `Bearer ${owner}`, 'Scrawl-Sync': String(SYNC_LEVEL), 'If-None-Match': '*' }, body: text });
    expect(response.status).toBe(200);
  };
  const at = (time: number) => {
    clock = time;
    server.due.tick();
    return new Promise((resolve) => setTimeout(resolve, 10));
  };
  return { server, write, sent, at };
}

const day = (minute: number) => () => new Date(Date.UTC(2026, 10, 1, 9, minute));
const kaan = { id: KAAN, name: 'Kaan Arslan' };
const toMert = { id: MERT, name: 'Mert Kaya' };

describe('the morning', () => {
  it("tells Mert at nine on his clock of his work due today and tomorrow, once, and opens Today", async () => {
    const s = await start();
    let n = 0;
    let board = newBoard('Roadmap', 'software', () => `c${++n}`);
    board = addCard(board, { title: 'Export a board as CSV', assignee: toMert, due: '2026-11-09' }, day(0), kaan, 'card1');
    board = addCard(board, { title: 'Done already', assignee: toMert, due: '2026-11-09' }, day(0), kaan, 'card2');
    board = moveCardToKind(board, 'card2', 'done', day(1), kaan);
    board = addCard(board, { title: "Kaan's", assignee: kaan, due: '2026-11-09' }, day(0), kaan, 'card3');
    await s.write('Roadmap.board.json', serializeBoard(board));
    await s.write('Work/Tasks.tasks.json', serializeList({ sections: [], tasks: addTask([], { title: 'Call the dentist', due: '2026-11-10', assignee: toMert }, day(0), 't1', kaan) }));
    await s.write('.scrawl/trash/Old.tasks.json', serializeList({ sections: [], tasks: addTask([], { title: 'In the trash', due: '2026-11-09', assignee: toMert }, day(0), 't2', kaan) }));
    await s.at(istanbul(9, 8, 59));
    expect(s.sent).toEqual([]);
    await s.at(istanbul(9, 9, 0));
    expect(s.sent.map((each) => [each.title, each.body, each.href])).toEqual([['1 due today, 1 due tomorrow', `${board.prefix}-1 and Call the dentist`, 'scrawl:today']]);
    await s.at(istanbul(9, 9, 30));
    expect(s.sent).toHaveLength(1);
  });

  it('tells no one with nothing due, and no one after noon', async () => {
    const s = await start();
    await s.write('Work/Tasks.tasks.json', serializeList({ sections: [], tasks: addTask([], { title: 'Next week', due: '2026-11-16', assignee: toMert }, day(0), 't1', kaan) }));
    await s.at(istanbul(9, 9, 5));
    expect(s.sent).toEqual([]);
    await s.write('Work/Later.tasks.json', serializeList({ sections: [], tasks: addTask([], { title: 'Tomorrow', due: '2026-11-11', assignee: toMert }, day(0), 't2', kaan) }));
    await s.at(istanbul(10, 12, 30));
    expect(s.sent).toEqual([]);
  });
});
