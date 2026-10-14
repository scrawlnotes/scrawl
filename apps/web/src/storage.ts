import { foldersNest, localPath, readSpaceEntries, type SpaceEntry, spaceOf, type VaultFs } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { convertFileSrc } from '@tauri-apps/api/core';
import { openBrowserVault, openBrowserVaultAt, removeBrowserVaultAt } from './opfsFs';
import { TauriFs } from './tauriFs';

/** True inside the desktop app, where notes are files in a folder on disk. */
export const isDesktop = '__TAURI_INTERNALS__' in window;

interface Settings {
  vault: string | null;
  /** The spaces beside the personal one, as `readSpaceEntries` reads them. */
  spaces: SpaceEntry[];
}

// Desktop settings live in a file the shell owns, so they survive whatever the web view does
// with its own storage.
async function invoke<T>(command: string, args?: Record<string, unknown> | Uint8Array, options?: { headers: Record<string, string> }): Promise<T> {
  return (await import('@tauri-apps/api/core')).invoke<T>(command, args, options);
}

let folder: string | null = null;
let defaultFolder: string | null = null;
let settings: Settings = { vault: null, spaces: [] };

/** The folder the desktop app keeps its notes in, as of the last `openVault`. */
export const vaultFolder = () => folder;

/** Desktop: where the notes go unless another folder is chosen, `Personal` in the app's data folder. */
export const defaultVaultFolder = () => defaultFolder;

/** Opens the vault: the browser's own storage, or on desktop the folder chosen or the default one, made by the shell. */
export async function openVault(): Promise<VaultFs> {
  if (!isDesktop) return openBrowserVault();
  const [loaded, fallback] = await Promise.all([invoke<{ vault?: string | null; spaces?: unknown }>('settings_load'), invoke<string>('default_vault_folder')]);
  settings = { vault: loaded.vault ?? null, spaces: readSpaceEntries(loaded.spaces) };
  defaultFolder = fallback;
  folder = settings.vault ?? fallback;
  return new TauriFs(folder);
}

async function saveSettings(next: Settings): Promise<void> {
  settings = next;
  await invoke('settings_save', { settings: next });
}

/** Goes back to the default folder; the shell makes it if it is gone. */
export async function useDefaultVaultFolder(): Promise<void> {
  await saveSettings({ ...settings, vault: null });
}

/**
 * Asks for the notes folder and remembers it. Returns false when the dialog was cancelled.
 * A folder that holds a space's copy, or is inside one, is refused: spaces never nest.
 */
export async function chooseVaultFolder(): Promise<boolean> {
  const chosen = await chooseFolder(t('welcome.dialog'));
  if (!chosen) return false;
  if (settings.spaces.some((space) => space.folder && foldersNest(space.folder, chosen))) throw new Error(t('error.spaceNests'));
  await saveSettings({ ...settings, vault: chosen });
  return true;
}

/** Desktop: the system's folder window; null when it was cancelled. */
export async function chooseFolder(title: string): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const chosen = await open({ directory: true, title });
  return typeof chosen === 'string' ? chosen : null;
}

// ---------- the other spaces ----------

const SPACES_KEY = 'scrawl.spaces';

/** The spaces beside the personal one, in the order the sidebar shows them. */
export function spaceEntries(): SpaceEntry[] {
  if (isDesktop) return settings.spaces;
  try {
    return readSpaceEntries(JSON.parse(localStorage.getItem(SPACES_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

async function saveSpaceEntries(entries: SpaceEntry[]): Promise<void> {
  if (isDesktop) await saveSettings({ ...settings, spaces: entries });
  else localStorage.setItem(SPACES_KEY, JSON.stringify(entries));
}

// In the browser a space's copy is a folder of its own under `.spaces/` of the browser's storage.
const browserFolder = (id: string) => `.spaces/${id}`;

/**
 * The files of a space's copy on this device; null when they are not there to open: on desktop
 * a folder that is gone (a drive not plugged in, say) or one that would hold the personal space
 * or sit in it. Nothing is made for a space that is not there.
 */
export async function openSpaceVault(entry: SpaceEntry): Promise<VaultFs | null> {
  if (!isDesktop) return openBrowserVaultAt(browserFolder(entry.id));
  if (!entry.folder || (folder && foldersNest(entry.folder, folder))) return null;
  return (await invoke<boolean>('folder_exists', { folder: entry.folder })) ? new TauriFs(entry.folder) : null;
}

/** A folder of its own for a new space: named after it in the app's data folder on desktop, under the browser's storage in the browser. */
export async function newSpaceFolder(id: string, name: string): Promise<SpaceEntry> {
  if (!isDesktop) return { id, name };
  const made = await invoke<string>('space_folder_new', { name });
  if (folder && foldersNest(made, folder)) throw new Error(t('error.spaceNests'));
  return { id, name, folder: made };
}

/** Remembers a space, last in the order. One whose id is listed already is refused: it is a copy of that space's folder. */
export async function addSpaceEntry(entry: SpaceEntry): Promise<void> {
  const entries = spaceEntries();
  if (entries.some((each) => each.id === entry.id)) throw new Error(t('error.spaceThere'));
  await saveSpaceEntries([...entries, entry]);
}

/**
 * Forgets a space on this device; with `deleteFiles`, its copy here goes too. The shell deletes
 * only a copy it made in the app's data folder: any other folder stays where it is.
 */
export async function removeSpaceEntry(id: string, deleteFiles: boolean): Promise<void> {
  const entry = spaceEntries().find((each) => each.id === id);
  // Deleted while the settings still list it, which the shell asks for.
  if (deleteFiles && entry) {
    if (!isDesktop) await removeBrowserVaultAt(browserFolder(id));
    else if (entry.folder) await invoke('space_folder_delete', { folder: entry.folder }).catch(() => undefined);
  }
  await saveSpaceEntries(spaceEntries().filter((each) => each.id !== id));
}

/**
 * Desktop: asks for the folder a space's copy on this device moves to. It has to be empty, and
 * neither hold the personal space or another space nor be inside one. Null when the dialog was
 * cancelled.
 */
export async function chooseSpaceFolder(): Promise<string | null> {
  const chosen = await chooseFolder(t('settings.spaceFolderDialog'));
  if (!chosen) return null;
  const taken = [folder, ...settings.spaces.map((space) => space.folder)].filter((each): each is string => !!each);
  if (taken.some((each) => foldersNest(each, chosen))) throw new Error(t('error.spaceNests'));
  if ((await new TauriFs(chosen).list('')).length > 0) throw new Error(t('error.folderNotEmpty'));
  return chosen;
}

/** Desktop: moves a space's copy on this device into the folder chosen for it, and remembers it there. */
export async function moveSpaceEntry(id: string, to: string): Promise<void> {
  await invoke('space_folder_move', { id, to });
  await saveSpaceEntries(spaceEntries().map((each) => (each.id === id ? { ...each, folder: to } : each)));
}

/** Puts the spaces in this order. */
export async function orderSpaceEntries(ids: string[]): Promise<void> {
  const entries = spaceEntries();
  const ordered = ids.map((id) => entries.find((each) => each.id === id)).filter((each): each is SpaceEntry => !!each);
  await saveSpaceEntries([...ordered, ...entries.filter((each) => !ids.includes(each.id))]);
}

/** Desktop: the folder on disk a path of the app is in, and the path inside it. */
function onDisk(path: string): [string, string] | null {
  const space = spaceOf(path);
  if (!space) return folder ? [folder, path] : null;
  const root = settings.spaces.find((each) => each.id === space)?.folder;
  return root ? [root, localPath(path)] : null;
}

/** Desktop: opens a file of a space with the program the system uses for it. */
export async function openFileOnDesktop(path: string): Promise<void> {
  const at = onDisk(path);
  if (at) await invoke('open_file', { root: at[0], path: at[1] });
}

/** Desktop: shows a file of a space selected in its folder, in the system's file manager. */
export async function revealFileOnDesktop(path: string): Promise<void> {
  const at = onDisk(path);
  if (at) await invoke('reveal_file', { root: at[0], path: at[1] });
}

/** Desktop: opens a web or mail address or a phone number in the default browser, mail program or phone program. */
export async function openUrlOnDesktop(url: string): Promise<void> {
  await invoke('open_url', { url });
}

/** Desktop: an address the web view reads a file of a space from, straight from disk. */
export const fileUrl = (path: string) => {
  const at = onDisk(path);
  return at ? convertFileSrc(`${at[0]}/${at[1]}`) : path;
};

/**
 * Saves a text file where the user says: on desktop the system's Save window asks where, in a
 * browser it is downloaded. Returns false when the Save window was cancelled.
 */
/** Downloads a file in the browser, where downloads go. */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves a file where the user says: on desktop the system's Save window asks where, in a browser
 * it is downloaded. Returns false when the Save window was cancelled.
 */
export async function saveFile(name: string, blob: Blob, extension: string): Promise<boolean> {
  if (!isDesktop) {
    downloadBlob(name, blob);
    return true;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const chosen = await save({ defaultPath: name, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
  if (typeof chosen !== 'string') return false;
  const at = Math.max(chosen.lastIndexOf('/'), chosen.lastIndexOf('\\'));
  await invoke('fs_write_bytes', new Uint8Array(await blob.arrayBuffer()), {
    headers: { 'x-root': encodeURIComponent(chosen.slice(0, at)), 'x-path': encodeURIComponent(chosen.slice(at + 1)) },
  });
  return true;
}

export async function saveTextFile(name: string, text: string, type: string, extension: string): Promise<boolean> {
  if (!isDesktop) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const chosen = await save({ defaultPath: name, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
  if (typeof chosen !== 'string') return false;
  const at = Math.max(chosen.lastIndexOf('/'), chosen.lastIndexOf('\\'));
  await invoke('fs_write_text', { root: chosen.slice(0, at), path: chosen.slice(at + 1), text });
  return true;
}
