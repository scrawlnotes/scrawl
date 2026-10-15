import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerAccount, ServerRemote } from '@scrawlnotes/core';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import { exportSpace, NoSuchSpace } from './export';
import { makeServer } from './server';

// Exporting a space: its files as they are now, in a zip, deleted ones left out.

const URL = 'https://kaan.scrawlnotes.com';
const opened: (() => void)[] = [];

afterEach(() => {
  for (const close of opened.splice(0)) close();
});

describe('export', () => {
  it('zips a space as it is now, found by its name or its id', async () => {
    const data = mkdtempSync(join(tmpdir(), 'scrawl-export-'));
    const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
    const server = makeServer(config);
    opened.push(() => {
      server.live.stop();
      server.db.close();
      rmSync(data, { recursive: true, force: true });
    });
    const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
    const { token } = await new ServerAccount({ url: URL, token: () => null, fetch }).setUp({ name: 'Kaan', email: 'kaan@example.com', password: 'a long password', person: 'p-1', device: 'Laptop' });
    await new ServerAccount({ url: URL, token: () => token, fetch }).openSpace('sp-acmeacme', 'Acme');
    const remote = new ServerRemote({ url: URL, token: () => token, space: 'sp-acmeacme', fetch });
    await remote.write('Notes/Kickoff.md', new Blob(['# Kickoff']), null);
    await remote.write('Notes/Çay ve kahve.md', new Blob(['Türkçe']), null);
    await remote.write('Files/photo.png', new Blob([new Uint8Array([137, 80, 78, 71])]), null);
    const old = await remote.write('Old.md', new Blob(['gone']), null);
    await remote.remove('Old.md', old.tag);
    await remote.mkdir('Empty');

    const out = await exportSpace(config, 'acme', undefined, new Date(Date.UTC(2026, 9, 15)));
    expect(out).toBe(join(data, 'exports', 'Acme-2026-10-15.zip'));
    const files = unzipSync(readFileSync(out));
    expect(Object.keys(files).sort()).toEqual(['Empty/', 'Files/', 'Files/photo.png', 'Notes/', 'Notes/Kickoff.md', 'Notes/Çay ve kahve.md']);
    expect(strFromU8(files['Notes/Çay ve kahve.md']!)).toBe('Türkçe');
    expect([...files['Files/photo.png']!]).toEqual([137, 80, 78, 71]);

    expect(await exportSpace(config, 'sp-acmeacme', join(data, 'acme.zip'))).toBe(join(data, 'acme.zip'));
    await expect(exportSpace(config, 'Northwind')).rejects.toThrow(NoSuchSpace);
    await expect(exportSpace(config, 'Northwind')).rejects.toThrow(/Acme {2}sp-acmeacme/);
  });
});
