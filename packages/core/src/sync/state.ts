import { join, type VaultFs } from '../fs';

// What this device last synced, kept on the device and never synced: the base every change is
// told against. See design/sync.md, section 3.

const STATE = '.scrawl/sync-state.json';
/** The text of mergeable files as last synced, which a three-way merge starts from. */
const BASE = '.scrawl/sync-base';

export interface FileRecord {
  /** Its path as last synced; the key it is filed under may spell it otherwise. */
  path: string;
  /** The remote's content tag. */
  tag: string;
  /** The local file's size, when it was last written, and its digest. */
  size: number;
  modified?: number;
  hash: string;
}

export interface SyncState {
  /** The device the state belongs to; a state from elsewhere is not used. */
  device: string;
  /** Where the remote's next listing starts; null before the first sync. */
  cursor: string | null;
  /** Files as last synced, by key. */
  files: Record<string, FileRecord>;
  /** Folders as last synced, by key: their paths. */
  dirs: Record<string, string>;
}

export const freshState = (device: string): SyncState => ({ device, cursor: null, files: {}, dirs: {} });

export async function loadSyncState(fs: VaultFs, device: string): Promise<SyncState> {
  try {
    const data = JSON.parse(await fs.readText(STATE)) as Partial<SyncState> & { version?: number };
    if (data.device !== device || typeof data.files !== 'object' || !data.files) return freshState(device);
    return {
      device,
      cursor: typeof data.cursor === 'string' ? data.cursor : null,
      files: data.files,
      dirs: typeof data.dirs === 'object' && data.dirs ? data.dirs : {},
    };
  } catch {
    return freshState(device);
  }
}

export const saveSyncState = (fs: VaultFs, state: SyncState) => fs.writeText(STATE, `${JSON.stringify({ version: 1, ...state })}\n`);

export async function readBase(fs: VaultFs, path: string): Promise<string | null> {
  try {
    return await fs.readText(join(BASE, path));
  } catch {
    return null;
  }
}

export const writeBase = (fs: VaultFs, path: string, text: string) => fs.writeText(join(BASE, path), text);

export async function dropBase(fs: VaultFs, path: string): Promise<void> {
  await fs.remove(join(BASE, path)).catch(() => undefined);
}

export async function moveBase(fs: VaultFs, from: string, to: string): Promise<void> {
  await fs.move(join(BASE, from), join(BASE, to)).catch(() => undefined);
}
