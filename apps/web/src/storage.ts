import type { VaultFs } from '@scrawlnotes/core';
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
  const chosen = await open({ directory: true, title: 'Choose the folder for your notes' });
  if (typeof chosen !== 'string') return false;
  await invoke('settings_save', { settings: { vault: chosen } });
  return true;
}
