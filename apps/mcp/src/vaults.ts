import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AgentSpace } from '@scrawlnotes/agent';
import { loadSpace, readSpaceEntries, type SpaceEntry } from '@scrawlnotes/core';
import { NodeFs } from './nodefs';

// Where the notes are. Without being told, the command reads the desktop app's own settings and
// sees what the app sees: the personal vault and the copies of the spaces on this computer,
// whichever provider they live in. Told folders, each is a space of its own. See design/agent.md, 6.

/** The desktop app's identifier, which names its folders on every system. */
export const APP_ID = 'app.scrawlnotes.desktop';

/** What the command needs to know about the computer, so that tests can say otherwise. */
export interface Host {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
}

/** The app's config folder, where Tauri puts `settings.json`. */
export function configDir(host: Host): string {
  if (host.platform === 'win32') return join(host.env.APPDATA || join(host.home, 'AppData', 'Roaming'), APP_ID);
  if (host.platform === 'darwin') return join(host.home, 'Library', 'Application Support', APP_ID);
  return join(host.env.XDG_CONFIG_HOME || join(host.home, '.config'), APP_ID);
}

/** The app's data folder, where the personal vault is unless another folder was chosen. */
export function dataDir(host: Host): string {
  if (host.platform === 'win32') return join(host.env.APPDATA || join(host.home, 'AppData', 'Roaming'), APP_ID);
  if (host.platform === 'darwin') return join(host.home, 'Library', 'Application Support', APP_ID);
  return join(host.env.XDG_DATA_HOME || join(host.home, '.local', 'share'), APP_ID);
}

export const settingsFile = (host: Host) => join(configDir(host), 'settings.json');

/** A vault found: its folder, and the space it is. */
export interface FoundVault {
  folder: string;
  id: string;
  name: string;
  where: string;
  personal: boolean;
}

const isDir = async (folder: string) => (await stat(folder).catch(() => null))?.isDirectory() ?? false;

/** Where a space lives, in words, from what the app remembers of it. */
function whereOf(entry: SpaceEntry): string {
  const provider = entry.source?.provider;
  if (provider === 'onedrive') return 'OneDrive';
  if (provider === 'server') {
    try {
      return new URL(entry.source?.place.url ?? '').host || 'a server';
    } catch {
      return 'a server';
    }
  }
  return provider ? provider : 'this computer';
}

/**
 * The vaults the desktop app is set to, from its settings file: null when there is no file, so
 * the app was never run here. A folder that is gone is left out.
 */
export async function vaultsFromSettings(host: Host): Promise<FoundVault[] | null> {
  let text: string;
  try {
    text = await readFile(settingsFile(host), 'utf8');
  } catch {
    return null;
  }
  let settings: { vault?: unknown; spaces?: unknown } = {};
  try {
    settings = JSON.parse(text) as typeof settings;
  } catch {
    // An unreadable file is an empty one: the default folder below.
  }
  const found: FoundVault[] = [];
  const personal = typeof settings.vault === 'string' && settings.vault.trim() ? settings.vault : join(dataDir(host), 'Personal');
  if (await isDir(personal)) found.push({ folder: personal, id: 'personal', name: 'Personal', where: 'this computer', personal: true });
  for (const entry of readSpaceEntries(settings.spaces)) {
    if (!entry.folder || !(await isDir(entry.folder))) continue;
    const space = await loadSpace(new NodeFs(entry.folder));
    found.push({ folder: entry.folder, id: entry.id, name: space.name?.trim() || entry.name || basename(entry.folder), where: whereOf(entry), personal: false });
  }
  return found;
}

/** The vaults in the folders given: each a space by its own `space.json`, or the personal space without one. */
export async function vaultsFromFolders(folders: string[]): Promise<{ found: FoundVault[]; missing: string[] }> {
  const found: FoundVault[] = [];
  const missing: string[] = [];
  for (const folder of folders) {
    if (!(await isDir(folder))) {
      missing.push(folder);
      continue;
    }
    const space = await loadSpace(new NodeFs(folder));
    if (space.id) found.push({ folder, id: space.id, name: space.name?.trim() || basename(folder), where: 'this computer', personal: false });
    else {
      const first = !found.some((f) => f.personal);
      found.push({ folder, id: first ? 'personal' : `folder:${basename(folder)}`, name: first ? 'Personal' : basename(folder), where: 'this computer', personal: first });
    }
  }
  return { found, missing };
}

/** The spaces the tools work on, over the vaults found. */
export function spacesOf(found: FoundVault[]): AgentSpace[] {
  return found.map((vault) => ({ id: vault.id, name: vault.name, where: vault.where, personal: vault.personal, fs: new NodeFs(vault.folder) }));
}
