import type { VaultFs } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { convertFileSrc } from '@tauri-apps/api/core';
import { openBrowserVault } from './opfsFs';
import { TauriFs } from './tauriFs';

/** True inside the desktop app, where notes are files in a folder the user chose. */
export const isDesktop = '__TAURI_INTERNALS__' in window;

interface Settings {
  vault: string | null;
}

// Desktop settings live in a file the shell owns, so they survive whatever the web view does
// with its own storage.
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (await import('@tauri-apps/api/core')).invoke<T>(command, args);
}

let folder: string | null = null;

/** The folder the desktop app keeps its notes in, as of the last `openVault`. */
export const vaultFolder = () => folder;

/** Opens the vault. On desktop this is null until a folder has been chosen. */
export async function openVault(): Promise<VaultFs | null> {
  if (!isDesktop) return openBrowserVault();
  folder = (await invoke<Settings>('settings_load')).vault ?? null;
  return folder ? new TauriFs(folder) : null;
}

/** Asks for the notes folder and remembers it. Returns false when the dialog was cancelled. */
export async function chooseVaultFolder(): Promise<boolean> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const chosen = await open({ directory: true, title: t('welcome.dialog') });
  if (typeof chosen !== 'string') return false;
  await invoke('settings_save', { settings: { vault: chosen } });
  return true;
}

/** Desktop: opens a file in the vault with the program the system uses for it. */
export async function openFileOnDesktop(path: string): Promise<void> {
  if (folder) await invoke('open_file', { root: folder, path });
}

/** Desktop: shows a file in the vault selected in its folder, in the system's file manager. */
export async function revealFileOnDesktop(path: string): Promise<void> {
  if (folder) await invoke('reveal_file', { root: folder, path });
}

/** Desktop: opens a web or mail address in the default browser or mail program. */
export async function openUrlOnDesktop(url: string): Promise<void> {
  await invoke('open_url', { url });
}

/** Desktop: an address the web view reads a file of the notes folder from, straight from disk. */
export const fileUrl = (path: string) => (folder ? convertFileSrc(`${folder}/${path}`) : path);
