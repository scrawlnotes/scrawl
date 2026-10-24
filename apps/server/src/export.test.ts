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

  it('puts the space’s rooms under Chat, private and archived ones too, and leaves direct messages out', async () => {
    const data = mkdtempSync(join(tmpdir(), 'scrawl-export-'));
    const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
    const server = makeServer(config, { now: () => Date.UTC(2026, 9, 14, 9, 30) });
    opened.push(() => {
      server.push.stop();
      server.live.stop();
      server.db.close();
      rmSync(data, { recursive: true, force: true });
    });
    const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
    const account = (token: string | null) => new ServerAccount({ url: URL, token: () => token, fetch });
    const { token } = await account(null).setUp({ name: 'Kaan', email: 'kaan@example.com', password: 'a long password', person: 'p-kaan', device: 'Laptop' });
    await account(token).openSpace('sp-acmeacme', 'Acme');
    const { link } = await account(token).invite('sp-acmeacme');
    await account(null).accept(link.split('/').pop()!, { name: 'Mert', email: 'mert@example.com', password: 'a long password', person: 'person-mert', device: 'Phone' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = async (method: string, path: string, body?: unknown): Promise<any> => {
      const response = await server.app.request(`${URL}/api/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !(body instanceof Uint8Array) && { 'Content-Type': 'application/json' }) },
        ...(body !== undefined && { body: body instanceof Uint8Array ? (body as Uint8Array<ArrayBuffer>) : JSON.stringify(body) }),
      });
      return response.json();
    };
    let made = 0;
    const say = (chat: string, body: string, files: unknown[] = []) => call('POST', `/chat/${chat}/messages`, { id: `m-export-${++made}`, body, files });
    const general = ((await call('GET', '/chat')).chats as { id: string; general: boolean }[]).find((chat) => chat.general)!;
    const founders = await call('POST', '/chat/rooms', { space: 'sp-acmeacme', name: 'founders', kind: 'private', members: ['person-mert'] });
    const old = await call('POST', '/chat/rooms', { space: 'sp-acmeacme', name: 'old-plans', kind: 'public' });
    const dm = await call('POST', '/chat/direct', { people: ['person-mert'] });
    const file = await call('POST', '/chat/files', new Uint8Array([1, 2, 3]));
    await say(general.id, 'Welcome, **everyone**', [{ hash: file.hash, name: 'plan.pdf', type: 'application/pdf' }]);
    await say(founders.id, 'Two intros came in', [{ hash: file.hash, name: 'plan.pdf', type: 'application/pdf' }]);
    await say(old.id, 'The plan before');
    await call('PATCH', `/chat/${old.id}`, { archived: true });
    await say(dm.id, 'Only between us');

    const files = unzipSync(readFileSync(await exportSpace(config, 'acme', join(data, 'acme.zip'))));
    const chat = Object.keys(files).filter((name) => name.startsWith('Chat/')).sort();
    expect(chat).toEqual(['Chat/_attachments/' + file.hash.slice(0, 8) + '-plan.pdf', 'Chat/founders/2026-10.md', 'Chat/general/2026-10.md', 'Chat/old-plans/2026-10.md']);
    expect(strFromU8(files['Chat/general/2026-10.md']!)).toBe(
      ['# #general · October 2026', '', '## Wednesday, October 14, 2026', '', '**Kaan** 09:30', 'Welcome, **everyone**', `[plan.pdf](../_attachments/${file.hash.slice(0, 8)}-plan.pdf)`, ''].join('\n'),
    );
    expect(strFromU8(files['Chat/founders/2026-10.md']!)).toContain('Two intros came in');
    expect(Object.values(files).some((content) => strFromU8(content).includes('Only between us'))).toBe(false);
  });
});
