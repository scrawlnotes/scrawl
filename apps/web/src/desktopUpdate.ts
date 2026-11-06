import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import { isDesktop } from './storage';

// The desktop app's own updates, as its shell tells them (src-tauri/src/update.rs): it looks for
// a new version by itself and only says so, in the sidebar's row; the update window opens from it,
// and nothing is downloaded until the person says Update. Then the app restarts into it; a download not restarted into goes
// in when the app closes. The web app has its own way (pwa.ts).

/** How the updates stand. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'upToDate'; checked: number }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number | null }
  | { state: 'ready'; version: string }
  | { state: 'failed'; offline: boolean; reason: string };

/** The update window: asking, downloading after Update, or downloaded; null while closed. */
export type UpdateAsk = 'ask' | 'download' | 'ready' | null;

/** The latest release on GitHub, where the desktop apps are downloaded. */
export const LATEST_RELEASE = 'https://github.com/scrawlnotes/scrawl/releases/latest';

/** The page of a version on GitHub, where its notes are. */
export const releasePage = (version: string) => `https://github.com/scrawlnotes/scrawl/releases/tag/desktop-v${version}`;

let status: UpdateStatus = { state: 'idle' };
let version = '';
let ask: UpdateAsk = null;
/** The newest version found, kept through a download that failed; '' when up to date. */
let found = '';
let view: { status: UpdateStatus; ask: UpdateAsk; found: string } = { status, ask, found };
const listeners = new Set<() => void>();

function changed() {
  view = { status, ask, found };
  for (const listener of listeners) listener();
}

function set(next: UpdateStatus) {
  if (next.state === 'available') {
    // Not asked: the sidebar's row says so, and opens the window.
    found = next.version;
  } else if (next.state === 'upToDate') {
    found = '';
    if (ask !== null) ask = null;
  } else if (next.state === 'ready' && ask === null) {
    // Downloaded with the window closed: asked once to restart.
    ask = 'ready';
  }
  status = next;
  changed();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Listens to the shell, on the desktop only. */
export function startDesktopUpdates() {
  if (!isDesktop) return;
  void listen<UpdateStatus>('update', (event) => set(event.payload));
  void invoke<UpdateStatus>('update_state').then(set, () => undefined);
  void getVersion().then((found) => {
    version = found;
    changed();
  });
}

export const useDesktopUpdate = () => useSyncExternalStore(subscribe, () => status);

/** How the updates stand, with the update window and the version found. */
export const useUpdateView = () => useSyncExternalStore(subscribe, () => view);

/** The version running, once the shell has said it. */
export const useAppVersion = () => useSyncExternalStore(subscribe, () => version);

/** Check for updates; the status comes back by `update` too. */
export const checkForUpdates = () => invoke<UpdateStatus>('update_check').then(set);

/** Update: the newest version is downloaded, then the app restarts into it (App.tsx). */
export function downloadUpdate() {
  ask = 'download';
  changed();
  return invoke<UpdateStatus>('update_download').then(set);
}

/** The update window, opened from the sidebar's row: at the step the update is at. */
export function openUpdate() {
  ask = status.state === 'ready' ? 'ready' : status.state === 'downloading' ? 'download' : 'ask';
  changed();
}

/** Later, or the window closed: a download goes on. */
export function closeUpdate() {
  ask = null;
  changed();
}

/** Installs the update downloaded and opens the new version; the app closes on the way. */
export const restartIntoUpdate = () => invoke('update_restart');

/**
 * Downloads the newest version and resolves once it is downloaded, for a space a newer version synced
 * (design/sync-gate.md 3.4): true then, to restart into it; false when none is found or it fails.
 */
export async function desktopUpdateReady(): Promise<boolean> {
  if (status.state !== 'ready') await invoke<UpdateStatus>('update_download').then(set, () => undefined);
  return new Promise<boolean>((resolve) => {
    const settle = () => {
      if (status.state === 'ready') resolve(true);
      else if (status.state === 'checking' || status.state === 'downloading') return;
      else resolve(false);
      listeners.delete(settle);
    };
    listeners.add(settle);
    settle();
  });
}
