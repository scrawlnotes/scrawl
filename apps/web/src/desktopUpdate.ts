import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import { isDesktop } from './storage';

// The desktop app's own updates, as its shell tells them (src-tauri/src/update.rs): it looks for
// a new version by itself and downloads it; Restart installs it and opens the new version, and an
// update not taken goes in when the app closes. The web app has its own way (pwa.ts).

/** How the updates stand. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'upToDate'; checked: number }
  | { state: 'downloading'; version: string; percent: number | null }
  | { state: 'ready'; version: string }
  | { state: 'failed'; offline: boolean; reason: string };

/** The page of a version on GitHub, where its notes are. */
export const releasePage = (version: string) => `https://github.com/scrawlnotes/scrawl/releases/tag/desktop-v${version}`;

let status: UpdateStatus = { state: 'idle' };
let version = '';
const listeners = new Set<() => void>();

function set(next: UpdateStatus) {
  status = next;
  for (const listener of listeners) listener();
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
    for (const listener of listeners) listener();
  });
}

export const useDesktopUpdate = () => useSyncExternalStore(subscribe, () => status);

/** The version running, once the shell has said it. */
export const useAppVersion = () => useSyncExternalStore(subscribe, () => version);

/** Check for updates; the status comes back by `update` too. */
export const checkForUpdates = () => invoke<UpdateStatus>('update_check').then(set);

/** Installs the update downloaded and opens the new version; the app closes on the way. */
export const restartIntoUpdate = () => invoke('update_restart');
