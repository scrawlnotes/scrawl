import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MemoryFs,
  RemoteConflict,
  RemoteFolderGone,
  RemoteNeedsNewer,
  RemoteSignedOut,
  ServerAccount,
  ServerRemote,
  syncOnce,
  type SyncDevice,
} from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SETUP_MS, type Config } from './config';
import { makeServer } from './server';

// The server as the app reaches it: its API through the client in packages/core, against a
// server in a folder of its own, with no network between.

const URL = 'https://kaan.scrawlnotes.com';
const PERSON = '0b6f3c9e-7a51-4d2a-9a43-2f1c9d5e8b10';
const SPACE = 'sp-k7f3m2qa';
const opened: { data: string; close: () => void }[] = [];

afterEach(() => {
  for (const { data, close } of opened.splice(0)) {
    close();
    rmSync(data, { recursive: true, force: true });
  }
});

function start(options: { ownerEmail?: string; pageSize?: number; minSyncLevel?: number } = {}) {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-server-'));
  let clock = Date.UTC(2026, 9, 15, 10, 0);
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: options.ownerEmail ?? null, appUrl: 'https://app.scrawlnotes.com' };
  const server = makeServer(config, { now: () => clock, ...(options.pageSize && { pageSize: options.pageSize }), ...(options.minSyncLevel !== undefined && { minSyncLevel: options.minSyncLevel }) });
  opened.push({
    data,
    close: () => {
      server.live.stop();
      server.db.close();
    },
  });
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const account = (token: string | null = null) => new ServerAccount({ url: URL, token: () => token, fetch });
  const remote = (token: string, space = SPACE) => new ServerRemote({ url: URL, token: () => token, space, fetch });
  return { server, fetch, account, remote, later: (ms: number) => (clock += ms) };
}

async function owner(s: ReturnType<typeof start>) {
  const { token } = await s.account().setUp({ name: 'Kaan Arslan', email: 'kaan@outlook.com', password: 'a long password', person: PERSON, device: 'Laptop' });
  await s.account(token).openSpace(SPACE, 'Acme');
  return token;
}

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);

describe('setting up and signing in', () => {
  it('lets the first to connect set up a new server and become its owner, once', async () => {
    const s = start();
    expect(await s.account().status()).toMatchObject({ new: true, setupOpen: true, personal: true });
    const { token, account } = await s.account().setUp({ name: 'Kaan Arslan', email: 'kaan@outlook.com', password: 'a long password', person: PERSON, device: 'Laptop' });
    expect(account).toEqual({ id: PERSON, email: 'kaan@outlook.com', name: 'Kaan Arslan', role: 'owner' });
    expect(await s.account(token).me()).toEqual(account);
    expect(await s.account().status()).toMatchObject({ new: false, setupOpen: false });
    const again = await refusal(s.account().setUp({ name: 'Someone', email: 'x@example.com', password: 'another password', person: 'x', device: 'Phone' }));
    expect(again).toMatchObject({ status: 409, code: 'set-up' });
  });

  it('closes setting up an hour after the server started, and keeps it for the owner email when one is given', async () => {
    const late = start();
    late.later(SETUP_MS + 1);
    expect(await late.account().status()).toMatchObject({ new: true, setupOpen: false });
    expect(await refusal(late.account().setUp({ name: '', email: 'kaan@outlook.com', password: 'a long password', person: PERSON, device: '' }))).toMatchObject({ status: 410, code: 'setup-closed' });

    const kept = start({ ownerEmail: 'Kaan@Outlook.com' });
    expect(await refusal(kept.account().setUp({ name: '', email: 'mert@example.com', password: 'a long password', person: PERSON, device: '' }))).toMatchObject({ code: 'not-owner' });
    expect((await kept.account().setUp({ name: '', email: 'kaan@outlook.com', password: 'a long password', person: PERSON, device: '' })).account.role).toBe('owner');
  });

  it('signs in with the email and password, tells a missing account from a wrong password, and ends a key on signing out', async () => {
    const s = start();
    await owner(s);
    expect(await refusal(s.account().signIn({ email: 'kaan@gmail.com', password: 'a long password', device: 'Phone' }))).toMatchObject({ status: 401, code: 'no-account' });
    expect(await refusal(s.account().signIn({ email: 'kaan@outlook.com', password: 'wrong one', device: 'Phone' }))).toMatchObject({ code: 'wrong-password' });
    const { token } = await s.account().signIn({ email: 'KAAN@outlook.com', password: 'a long password', device: 'Phone' });
    expect((await s.account(token).spaces()).map((x) => x.name)).toEqual(['Acme']);
    await s.account(token).signOut();
    expect(await refusal(s.account(token).me())).toBeInstanceOf(RemoteSignedOut);
  });

  it('asks for a password of eight characters at least, and waits after five wrong tries in a minute', async () => {
    const s = start();
    expect(await refusal(s.account().setUp({ name: '', email: 'kaan@outlook.com', password: 'short', person: PERSON, device: '' }))).toMatchObject({ code: 'short-password' });
    await owner(s);
    for (let i = 0; i < 5; i++) await refusal(s.account().signIn({ email: 'kaan@outlook.com', password: 'wrong one', device: '' }));
    expect(await refusal(s.account().signIn({ email: 'kaan@outlook.com', password: 'a long password', device: '' }))).toMatchObject({ status: 429, code: 'too-many' });
    s.later(61_000);
    expect((await s.account().signIn({ email: 'kaan@outlook.com', password: 'a long password', device: '' })).token).toBeTruthy();
  });
});

describe('spaces', () => {
  it('opens a space for its owner and admins only, with the opener its manager, and keeps its files for those in it', async () => {
    const s = start();
    const token = await owner(s);
    expect(await s.account(token).spaces()).toEqual([{ id: SPACE, name: 'Acme', role: 'manager', people: 1, personal: false }]);
    expect(await refusal(s.account(token).openSpace(SPACE, 'Again'))).toMatchObject({ status: 409, code: 'space-exists' });

    // A member, as an invite will make one: they open no space and see none they are not in.
    s.server.db.prepare("INSERT INTO accounts (id, email, name, password, role, created_at) VALUES ('m1', 'mert@example.com', 'Mert', 'x', 'member', 0)").run();
    const memberKey = (s.server.accounts as unknown as { newDevice(a: string, n: string): string }).newDevice('m1', 'Phone');
    expect(await refusal(s.account(memberKey).openSpace('sp-aaaaaaaa', 'Mine'))).toMatchObject({ status: 403, code: 'not-allowed' });
    expect(await s.account(memberKey).spaces()).toEqual([]);
    expect(await refusal(s.remote(memberKey).changes(null))).toBeInstanceOf(RemoteFolderGone);
    expect(await refusal(s.remote(token, 'sp-zzzzzzzz').changes(null))).toBeInstanceOf(RemoteFolderGone);
    expect(await refusal(s.remote('not a key').changes(null))).toBeInstanceOf(RemoteSignedOut);
  });
});

describe('a space’s files, as a remote', () => {
  it('writes while the file is as last seen, reads it back, and lists what changed since a cursor', async () => {
    const s = start();
    const remote = s.remote(await owner(s));
    const empty = await remote.changes(null);
    expect(empty).toEqual({ changed: [], removed: [], cursor: '0' });

    const plan = await remote.write('Sales/Plan.md', new Blob(['# Plan']), null);
    expect(plan).toMatchObject({ path: 'Sales/Plan.md', kind: 'file', size: 6 });
    expect(plan.tag).toBe(await remote.hashOf(new Blob(['# Plan'])));
    expect(plan.hash).toBe(plan.tag);
    expect(await (await remote.read('sales/plan.md')).text()).toBe('# Plan');

    // Written again only from the tag it has; a second "new" file there is refused.
    expect(await refusal(remote.write('Sales/Plan.md', new Blob(['other']), null))).toBeInstanceOf(RemoteConflict);
    expect(await refusal(remote.write('Sales/Plan.md', new Blob(['other']), 'stale'))).toBeInstanceOf(RemoteConflict);
    const second = await remote.write('Sales/Plan.md', new Blob(['# Plan, v2']), plan.tag);

    const since = await remote.changes(empty.cursor);
    expect(since.changed).toEqual([{ path: 'Sales', kind: 'dir' }, second]);
    expect(since.removed).toEqual([]);
    const nothing = await remote.changes(since.cursor);
    expect(nothing).toEqual({ changed: [], removed: [], cursor: since.cursor });
  });

  it('moves a file keeping its tag, removes a file only as last seen, and a folder with everything in it', async () => {
    const s = start();
    const remote = s.remote(await owner(s));
    const a = await remote.write('Notes/a.md', new Blob(['A']), null);
    await remote.write('Notes/Deep/b.md', new Blob(['B']), null);
    const { cursor } = await remote.changes(null);

    const moved = await remote.move('Notes/a.md', 'Archive/a.md', a.tag);
    expect(moved.tag).toBe(a.tag);
    expect(await refusal(remote.move('Archive/a.md', 'Notes/Deep/b.md', a.tag))).toBeInstanceOf(RemoteConflict);
    expect(await refusal(remote.remove('Archive/a.md', 'stale'))).toBeInstanceOf(RemoteConflict);
    await remote.remove('Notes', null);
    await remote.mkdir('Empty/Inside');

    const after = await remote.changes(cursor);
    expect(after.removed).toEqual(['Notes/a.md', 'Notes/Deep/b.md', 'Notes/Deep', 'Notes']);
    expect(after.changed.map((e) => e.path)).toEqual(['Archive', 'Archive/a.md', 'Empty', 'Empty/Inside']);
    expect((await remote.changes(null)).changed.map((e) => e.path)).toEqual(['Archive', 'Archive/a.md', 'Empty', 'Empty/Inside']);
    expect(await refusal(remote.read('Notes/Deep/b.md'))).toBeInstanceOf(RemoteConflict);
  });

  it('takes a path whatever its case or Unicode form as the same, keeping the last spelling', async () => {
    const s = start();
    const remote = s.remote(await owner(s));
    const first = await remote.write('Şirket/Toplantı.md', new Blob(['1']), null);
    const second = await remote.write('şirket/toplantı.md'.normalize('NFD'), new Blob(['2']), first.tag);
    const all = (await remote.changes(null)).changed;
    expect(all.filter((e) => e.kind === 'file')).toEqual([second]);
    expect(await refusal(remote.write('Şirket', new Blob(['x']), null))).toBeInstanceOf(RemoteConflict);
  });

  it('lists a long space a page at a time, entirely or since a cursor', async () => {
    const s = start({ pageSize: 3 });
    const remote = s.remote(await owner(s));
    for (let i = 0; i < 7; i++) await remote.write(`n${i}.md`, new Blob([String(i)]), null);
    const listed: number[] = [];
    const all = await remote.changes(null, (count) => listed.push(count));
    expect(all.changed.map((e) => e.path)).toEqual(['n0.md', 'n1.md', 'n2.md', 'n3.md', 'n4.md', 'n5.md', 'n6.md']);
    expect(listed).toEqual([3, 6, 7]);
    for (let i = 0; i < 5; i++) await remote.remove(`n${i}.md`, (all.changed[i] as { tag: string }).tag);
    const since = await remote.changes(all.cursor);
    expect(since.removed).toEqual(['n0.md', 'n1.md', 'n2.md', 'n3.md', 'n4.md']);
  });

  it('refuses a path a device keeps to itself, and a file larger than the server takes', async () => {
    const s = start();
    const remote = s.remote(await owner(s));
    expect(await refusal(remote.write('.scrawl/sync-state.json', new Blob(['{}']), null))).toMatchObject({ code: 'bad-path' });
    expect(await refusal(remote.write('big.bin', new Blob([new Uint8Array(1024 * 1024 + 1)]), null))).toMatchObject({ status: 413, code: 'too-large' });
    expect(await refusal(remote.write('ok.md', new Blob(['ok']), null))).toBeNull();
  });
});

describe('two devices on one space', () => {
  const LAPTOP: SyncDevice = { id: 'laptop-id', name: 'Laptop' };
  const PHONE: SyncDevice = { id: 'phone-id', name: 'Phone' };
  const now = () => new Date(2026, 9, 15, 11, 0);

  it('sync through the server as through any remote: what one writes the other gets, a removal goes to the trash, a board merges by card', async () => {
    const s = start();
    const laptopKey = await owner(s);
    const { token: phoneKey } = await s.account().signIn({ email: 'kaan@outlook.com', password: 'a long password', device: 'Phone' });
    const laptop = new MemoryFs();
    const phone = new MemoryFs();
    const sync = (fs: MemoryFs, device: SyncDevice, key: string) => syncOnce(fs, s.remote(key), device, { now, saveEveryMs: 0 });

    await laptop.writeText('Sales/Plan.md', '# Plan\n\nCall Acme.');
    await laptop.writeText('Ideas.md', 'An idea');
    await sync(laptop, LAPTOP, laptopKey);
    await sync(phone, PHONE, phoneKey);
    expect(await phone.readText('Sales/Plan.md')).toBe('# Plan\n\nCall Acme.');

    // Both change the note, in different lines: the two are put together.
    await laptop.writeText('Sales/Plan.md', '# Plan for Q4\n\nCall Acme.');
    await phone.writeText('Sales/Plan.md', '# Plan\n\nCall Acme on Monday.');
    await sync(laptop, LAPTOP, laptopKey);
    await sync(phone, PHONE, phoneKey);
    await sync(laptop, LAPTOP, laptopKey);
    expect(await laptop.readText('Sales/Plan.md')).toBe('# Plan for Q4\n\nCall Acme on Monday.');
    expect(await phone.readText('Sales/Plan.md')).toBe('# Plan for Q4\n\nCall Acme on Monday.');

    // Removed on the phone, it goes from the laptop too.
    await phone.remove('Ideas.md');
    await sync(phone, PHONE, phoneKey);
    expect((await sync(laptop, LAPTOP, laptopKey)).removedHere).toEqual(['Ideas.md']);
    expect((await laptop.list('')).map((e) => e.path)).not.toContain('Ideas.md');

    // The laptop's trash goes up as every trash does; after that, a turn with nothing new does nothing.
    await sync(laptop, LAPTOP, laptopKey);
    await sync(phone, PHONE, phoneKey);
    const again = await sync(laptop, LAPTOP, laptopKey);
    expect([...again.uploaded, ...again.downloaded, ...again.merged, ...again.conflicts, ...again.removedHere, ...again.removedThere]).toEqual([]);
  });
});

describe('the sync gate', () => {
  const LAPTOP: SyncDevice = { id: 'laptop-id', name: 'Laptop' };
  const api = (s: ReturnType<typeof start>, token: string, path: string, init: RequestInit = {}) =>
    s.fetch(`${URL}/api/v1/spaces/${SPACE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) } });

  it('refuses a device without a level, or below the one it asks for, before it lists or writes; reading a file stays open', async () => {
    // The level it asks for as it is released.
    const s = start();
    const token = await owner(s);
    // The app of this level syncs as before.
    const laptop = new MemoryFs();
    await laptop.writeText('Sales/Plan.md', '# Plan');
    expect((await syncOnce(laptop, s.remote(token), LAPTOP, { saveEveryMs: 0 })).uploaded).toContain('Sales/Plan.md');

    // A version from before the gate sends no level: each call of a turn is refused, and nothing changes.
    const json = { 'Content-Type': 'application/json' };
    const calls: [string, RequestInit][] = [
      ['/changes', {}],
      ['/files/Sales/New.md', { method: 'PUT', headers: { 'If-None-Match': '*' }, body: 'new' }],
      ['/files/Sales/Plan.md', { method: 'DELETE' }],
      ['/move', { method: 'POST', headers: json, body: JSON.stringify({ from: 'Sales/Plan.md', to: 'Plan.md', ifMatch: null }) }],
      ['/dirs', { method: 'POST', headers: json, body: JSON.stringify({ path: 'Projects' }) }],
    ];
    for (const [path, init] of calls) {
      const response = await api(s, token, path, init);
      expect(response.status).toBe(426);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('update-app');
      expect((await api(s, token, path, { ...init, headers: { ...(init.headers as Record<string, string>), 'Scrawl-Sync': '0' } })).status).toBe(426);
    }
    expect((await s.remote(token).changes(null)).changed.map((e) => e.path)).toEqual(['.scrawl', '.scrawl/sync.json', 'Sales', 'Sales/Plan.md']);
    const read = await api(s, token, '/files/Sales/Plan.md');
    expect(read.status).toBe(200);
    expect(await read.text()).toBe('# Plan');
  });

  it('tells the app it is too old when the server asks for a higher level than it has', async () => {
    const s = start({ minSyncLevel: 99 });
    const token = await owner(s);
    const laptop = new MemoryFs();
    await laptop.writeText('Plan.md', 'plan');
    expect(await refusal(s.remote(token).changes(null))).toBeInstanceOf(RemoteNeedsNewer);
    expect(await refusal(syncOnce(laptop, s.remote(token), LAPTOP, { saveEveryMs: 0 }))).toBeInstanceOf(RemoteNeedsNewer);
    expect(await laptop.stat('.scrawl/sync-state.json')).toBeNull();
  });

  it('refuses none while it asks for no level, and lets a browser send the header', async () => {
    const s = start({ minSyncLevel: 0 });
    const token = await owner(s);
    expect((await api(s, token, '/changes')).status).toBe(200);
    const preflight = await s.fetch(`${URL}/api/v1/spaces/${SPACE}/changes`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.scrawlnotes.com', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,scrawl-sync' },
    });
    expect(preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('scrawl-sync');
  });
});
