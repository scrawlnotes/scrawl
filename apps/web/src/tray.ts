import { t } from '@scrawlnotes/i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import { isDesktop } from './storage';

// Running on with the window closed, on the desktop (design/background.md): the shell keeps a
// tray icon (src-tauri/src/background.rs) whose menu has its words from here and a line saying
// how sync stands. While Background is on, closing the window hides it; Quit in the menu closes
// the app once what was typed is written. Opening at login is the system's, read from it.

let background = true;
/** Whether Scrawl opens at login, once the system has said. */
let autostart: boolean | null = null;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function set(next: boolean) {
  background = next;
  changed();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The menu bar of a Mac, where Windows has its tray. */
const onMac = () => /Mac/.test(navigator.userAgent);

/**
 * Gives the shell the tray's words, which puts the icon there, and answers its Quit: what was
 * typed is written first. Returns what stops listening.
 */
export function startTray(beforeQuit: () => Promise<void>): () => void {
  if (!isDesktop) return () => undefined;
  const words = { open: t('tray.open'), quit: t('tray.quit'), toldTitle: t('tray.toldTitle'), toldBody: t(onMac() ? 'tray.toldBodyMac' : 'tray.toldBody') };
  void invoke('tray_start', { words }).catch(() => undefined);
  void invoke<boolean>('background_get').then(set, () => undefined);
  const stop = listen('quit', () => {
    void beforeQuit()
      .catch(() => undefined)
      .finally(() => void invoke('quit_now'));
  });
  return () => void stop.then((off) => off());
}

let said: string | null = null;

/** How sync stands, for the line under Open in the tray's menu; empty while nothing syncs. */
export function trayStatus(text: string) {
  if (!isDesktop || text === said) return;
  said = text;
  void invoke('tray_status', { text }).catch(() => undefined);
}

/** Whether closing the window leaves Scrawl running in the tray. */
export const useBackground = () => useSyncExternalStore(subscribe, () => background);

export function setBackground(on: boolean) {
  set(on);
  void invoke('background_set', { on }).catch(() => undefined);
}

/** Whether Scrawl starts in the background at login: null until the system has said. */
export const useAutostart = () => useSyncExternalStore(subscribe, () => autostart);

/** Asks the system again: it may have been turned off there (Task Manager's Startup apps). */
export function readAutostart() {
  if (!isDesktop) return;
  void invoke<boolean>('autostart_get').then(
    (on) => {
      autostart = on;
      changed();
    },
    () => undefined,
  );
}

export function setAutostart(on: boolean) {
  autostart = on;
  changed();
  void invoke('autostart_set', { on }).then(readAutostart, readAutostart);
}
