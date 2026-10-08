import { basename } from '../fs';

// Which paths of a space are synced, and how two spellings of one path are known to be the same.

/** Device-only state under `.scrawl`; never leaves the device. */
const DEVICE_ONLY = ['.scrawl/history', '.scrawl/workspace.json', '.scrawl/sync-state.json', '.scrawl/sync-base', '.scrawl/onedrive.json', '.scrawl/index'];

/** What systems leave in folders. */
const SYSTEM_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

/** Whether a path is synced: not device-only, not a write cut short, not a system file. */
export function isSynced(path: string): boolean {
  const lower = path.toLowerCase();
  if (DEVICE_ONLY.some((p) => lower === p || lower.startsWith(`${p}/`))) return false;
  const name = basename(lower);
  if (SYSTEM_FILES.has(name)) return false;
  // `.<name>.tmp` and `.<name>.part`: what the desktop app and the browser write before a file is whole.
  if (name.startsWith('.') && (name.endsWith('.tmp') || name.endsWith('.part'))) return false;
  return true;
}

/**
 * The same path whatever its case or Unicode form: providers and Windows do not tell them apart,
 * and macOS writes names decomposed (NFD) where others write them composed (NFC).
 */
export const keyOf = (path: string) => path.normalize('NFC').toLowerCase();
