import type { VaultFs } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { convertFileSrc } from '@tauri-apps/api/core';
import { openBrowserVault } from './opfsFs';
import { TauriFs } from './tauriFs';

/** True inside the desktop app, where notes are files in a folder on disk. */
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
let defaultFolder: string | null = null;

/** The folder the desktop app keeps its notes in, as of the last `openVault`. */
export const vaultFolder = () => folder;

/** Desktop: where the notes go unless another folder is chosen, `Personal` in the app's data folder. */
export const defaultVaultFolder = () => defaultFolder;

/** Opens the vault: the browser's own storage, or on desktop the folder chosen or the default one, made by the shell. */
export async function openVault(): Promise<VaultFs> {
  if (!isDesktop) return openBrowserVault();
  const [settings, fallback] = await Promise.all([invoke<Settings>('settings_load'), invoke<string>('default_vault_folder')]);
  defaultFolder = fallback;
  folder = settings.vault ?? fallback;
  return new TauriFs(folder);
}

/** Goes back to the default folder; the shell makes it if it is gone. */
export async function useDefaultVaultFolder(): Promise<void> {
  await invoke('settings_save', { settings: { vault: null } });
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

/** Desktop: opens a web or mail address or a phone number in the default browser, mail program or phone program. */
export async function openUrlOnDesktop(url: string): Promise<void> {
  await invoke('open_url', { url });
}

/** Desktop: an address the web view reads a file of the notes folder from, straight from disk. */
export const fileUrl = (path: string) => (folder ? convertFileSrc(`${folder}/${path}`) : path);

/**
 * Saves a text file where the user says: on desktop the system's Save window asks where, in a
 * browser it is downloaded. Returns false when the Save window was cancelled.
 */
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
