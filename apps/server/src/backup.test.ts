import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerAccount, ServerRemote } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { backup, backups, NoSuchBackup, restore } from './backup';
import type { Config } from './config';
import { makeServer } from './server';

// Backups of a running server, the last seven kept, and putting one back with the server stopped.

const URL = 'https://kaan.scrawlnotes.com';
const folders: string[] = [];

afterEach(() => {
  for (const data of folders.splice(0)) rmSync(data, { recursive: true, force: true });
});

function open(data: string) {
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const server = makeServer(config);
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const close = () => {
    server.live.stop();
    server.db.close();
  };
  return { config, server, fetch, close };
}

describe('backups', () => {
  it('keep the last seven, and one put back brings the space as it was', async () => {
    const data = mkdtempSync(join(tmpdir(), 'scrawl-backup-'));
    folders.push(data);
    let s = open(data);
    const { token } = await new ServerAccount({ url: URL, token: () => null, fetch: s.fetch }).setUp({ name: 'Kaan', email: 'kaan@example.com', password: 'a long password', person: 'p-1', device: 'Laptop' });
    await new ServerAccount({ url: URL, token: () => token, fetch: s.fetch }).openSpace('sp-acmeacme', 'Acme');
    let remote = new ServerRemote({ url: URL, token: () => token, space: 'sp-acmeacme', fetch: s.fetch });
    const plan = await remote.write('Plan.md', new Blob(['first']), null);

    for (let day = 1; day <= 8; day++) await backup(s.config, new Date(Date.UTC(2026, 9, day)));
    const kept = backups(s.config);
    expect(kept).toHaveLength(7);
    expect(kept[0]).toMatch(/^2026-10-02/);

    // After the last backup: the plan changes and a file comes; then the server stops and the backup goes back.
    await remote.write('Plan.md', new Blob(['second']), plan.tag);
    await remote.write('Later.md', new Blob(['later']), null);
    s.close();
    expect(() => restore(s.config, 'nothing')).toThrow(NoSuchBackup);
    restore(s.config, kept.at(-1)!);
    expect(existsSync(join(data, 'scrawl.db-wal'))).toBe(false);

    s = open(data);
    remote = new ServerRemote({ url: URL, token: () => token, space: 'sp-acmeacme', fetch: s.fetch });
    const { changed } = await remote.changes(null);
    expect(changed.map((entry) => entry.path)).toEqual(['Plan.md']);
    expect(await (await remote.read('Plan.md')).text()).toBe('first');
    s.close();
  });
});
