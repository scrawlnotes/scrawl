import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadList, saveSpace } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { agentOf, parseArgs } from './main';
import { NodeFs } from './nodefs';
import { configDir, dataDir, settingsFile, spacesOf, vaultsFromFolders, vaultsFromSettings } from './vaults';

// The stdio command: a vault on disk through Node, finding the vaults the desktop app is set to,
// the command line, and the built command talking to a real MCP client over stdio.

const made: string[] = [];
const temp = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), `scrawl-${name}-`));
  made.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('a vault on disk', () => {
  it('lists, reads, writes into new folders, stats files only, moves, removes and stays inside', async () => {
    const root = temp('vault');
    const fs = new NodeFs(root);
    await fs.writeText('Plans/Roadmap.md', '# Roadmap\n');
    await fs.mkdir('Empty');
    expect((await fs.list('')).map((e) => `${e.kind}:${e.path}`).sort()).toEqual(['dir:Empty', 'dir:Plans']);
    const listed = await fs.list('Plans');
    expect(listed).toMatchObject([{ name: 'Roadmap.md', path: 'Plans/Roadmap.md', kind: 'file', size: 10 }]);
    expect(listed[0]!.modified).toBeGreaterThan(0);
    expect(await fs.readText('Plans/Roadmap.md')).toBe('# Roadmap\n');
    expect(await fs.stat('Plans/Roadmap.md')).toMatchObject({ kind: 'file', size: 10 });
    expect(await fs.stat('Plans')).toBeNull();
    expect(await fs.stat('Nowhere.md')).toBeNull();
    expect(await fs.list('Nowhere')).toEqual([]);
    await fs.move('Plans/Roadmap.md', 'Archive/Old.md');
    expect(await fs.readText('Archive/Old.md')).toBe('# Roadmap\n');
    await fs.writeBlob('Pics/a.bin', new Blob([new Uint8Array([1, 2, 3])]));
    expect((await fs.readBlob('Pics/a.bin')).size).toBe(3);
    await fs.remove('Archive');
    expect(await fs.list('Archive')).toEqual([]);
    await expect(fs.readText('../outside.md')).rejects.toThrow('Not inside the vault');
    await expect(fs.writeText('a/../../b.md', 'x')).rejects.toThrow('Not inside the vault');
  });
});

describe('finding the vaults', () => {
  it('knows where the app keeps its settings on each system', () => {
    const home = '/home/kaan';
    expect(settingsFile({ platform: 'linux', env: {}, home })).toBe(join('/home/kaan/.config', 'app.scrawlnotes.desktop', 'settings.json'));
    expect(dataDir({ platform: 'linux', env: {}, home })).toBe(join('/home/kaan/.local/share', 'app.scrawlnotes.desktop'));
    expect(configDir({ platform: 'darwin', env: {}, home })).toBe(join('/home/kaan/Library/Application Support', 'app.scrawlnotes.desktop'));
    expect(configDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\kaan\\AppData\\Roaming' }, home: 'C:\\Users\\kaan' })).toBe(join('C:\\Users\\kaan\\AppData\\Roaming', 'app.scrawlnotes.desktop'));
  });

  it('reads the app’s settings: the personal vault, the spaces with where they live, and nothing for folders that are gone', async () => {
    const home = temp('home');
    const host = { platform: 'linux' as const, env: { XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data') }, home };
    expect(await vaultsFromSettings(host)).toBeNull();
    const personal = join(home, 'Notes');
    const acme = join(home, 'Acme');
    const gone = join(home, 'Gone');
    mkdirSync(personal, { recursive: true });
    mkdirSync(acme, { recursive: true });
    await saveSpace(new NodeFs(acme), { id: 'sp-k7f3m2qa', name: 'Acme' });
    mkdirSync(configDir(host), { recursive: true });
    writeFileSync(
      settingsFile(host),
      JSON.stringify({
        vault: personal,
        spaces: [
          { id: 'sp-k7f3m2qa', name: 'Old name', folder: acme, source: { provider: 'onedrive', account: 'kaan@outlook.com', place: { drive: 'd', item: 'i' } } },
          { id: 'sp-abcdefgh', name: 'Team', folder: gone, source: { provider: 'server', place: { url: 'https://scrawl.kaanarslan.dev', space: 'sp-abcdefgh' } } },
        ],
      }),
    );
    const found = await vaultsFromSettings(host);
    expect(found).toEqual([
      { folder: personal, id: 'personal', name: 'Personal', where: 'this computer', personal: true },
      { folder: acme, id: 'sp-k7f3m2qa', name: 'Acme', where: 'OneDrive', personal: false },
    ]);
    // Without a chosen folder, the personal vault is the default one in the data folder.
    mkdirSync(join(dataDir(host), 'Personal'), { recursive: true });
    writeFileSync(settingsFile(host), JSON.stringify({ spaces: [] }));
    expect((await vaultsFromSettings(host))![0]!.folder).toBe(join(dataDir(host), 'Personal'));
  });

  it('takes folders as spaces, the one with a space file as that space and the first without as the personal one', async () => {
    const home = temp('folders');
    const a = join(home, 'A');
    const b = join(home, 'B');
    const c = join(home, 'C');
    for (const dir of [a, b, c]) mkdirSync(dir);
    await saveSpace(new NodeFs(b), { id: 'sp-k7f3m2qa', name: 'Acme' });
    const { found, missing } = await vaultsFromFolders([a, b, c, join(home, 'Nope')]);
    expect(found.map((f) => [f.id, f.name, f.personal])).toEqual([
      ['personal', 'Personal', true],
      ['sp-k7f3m2qa', 'Acme', false],
      ['folder:C', 'C', false],
    ]);
    expect(missing).toEqual([join(home, 'Nope')]);
    expect(spacesOf(found).map((s) => s.fs instanceof NodeFs)).toEqual([true, true, true]);
    expect(parseArgs([a, '--vault', b, '', '--client', 'Claude'])).toEqual({ folders: [a, b], client: 'Claude' });
    expect(() => parseArgs(['--nope'])).toThrow('Unknown option');
    expect(parseArgs(['--help']).help).toBe(true);
    expect((await agentOf(found, 'Claude').person())).toBeNull();
  });
});

describe('the built command', () => {
  it('serves the tools over stdio to a client and writes into the folder', async () => {
    await import('../scripts/build.mjs');
    const vault = temp('cmd');
    const transport = new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, '..', 'dist', 'scrawl-mcp.mjs'), vault, '--client', 'Tester'], stderr: 'pipe' });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(transport);
    expect((await client.listTools()).tools.length).toBe(14);
    const spaces = await client.callTool({ name: 'spaces', arguments: {} });
    expect(spaces.structuredContent).toMatchObject({ person: null, spaces: [{ id: 'personal', name: 'Personal', where: 'this computer', personal: true }] });
    const added = await client.callTool({ name: 'save_task', arguments: { title: 'Try the command', due: '2026-10-16' } });
    expect(added.isError).toBeFalsy();
    const list = await loadList(new NodeFs(vault), 'Inbox.tasks.json');
    expect(list.tasks.map((t) => [t.title, t.due, t.author?.name])).toEqual([['Try the command', '2026-10-16', 'test-client']]);
    await client.close();
  }, 30000);
});
