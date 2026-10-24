import { isSynced } from '@scrawlnotes/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Session } from './session';
import { isDesktop, spaceEntries, vaultFolder } from './storage';
import type { SyncService } from './sync';
import { wroteLately } from './tauriFs';

// What another program writes in a space's folder on the desktop, an agent above all
// (design/background.md 4). The shell watches the folders (src-tauri/src/watch.rs) and says what
// changed in each; what this app wrote itself and what stays on the device are left out. A space
// with something left syncs as after a save, and with the window on screen is read again at once.

/** What changed in one folder, as the shell tells it: paths inside it, with `/`. */
interface Changed {
  folder: string;
  paths: string[];
}

/**
 * Watches the folders of the spaces open, the personal one's and each other one's on this
 * device, following the session as spaces come and go. Returns what stops it.
 */
export function startWatching(session: Session, sync: SyncService): () => void {
  if (!isDesktop) return () => undefined;
  /** Each folder watched, and the space it is: null for the personal one. */
  let folders = new Map<string, string | null>();
  let watched = '';
  const follow = () => {
    const { ready, spaces } = session.getSnapshot();
    const personal = vaultFolder();
    if (!ready || !personal) return;
    const next = new Map<string, string | null>([[personal, null]]);
    const entries = spaceEntries();
    for (const space of spaces) {
      const folder = entries.find((entry) => entry.id === space.id)?.folder;
      if (folder) next.set(folder, space.id);
    }
    const key = JSON.stringify([...next]);
    if (key === watched) return;
    watched = key;
    folders = next;
    void invoke('watch_folders', { folders: [...next.keys()] }).catch(() => undefined);
  };
  const stopFollowing = session.subscribe(follow);
  follow();
  const stopListening = listen<Changed>('folder-changed', ({ payload }) => {
    const space = folders.get(payload.folder);
    if (space === undefined) return;
    const theirs = payload.paths.some((path) => isSynced(path) && !wroteLately(payload.folder, path));
    if (!theirs) return;
    sync.changedOutside(space);
    if (document.visibilityState === 'visible') void session.rescan(space);
  });
  return () => {
    stopFollowing();
    void stopListening.then((off) => off());
  };
}
