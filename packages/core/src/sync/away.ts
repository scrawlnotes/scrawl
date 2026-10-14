import { type VaultFs } from '../fs';
import { keyOf } from './paths';

// Attached files left on the other side: what this device knows of them, and what it was asked
// to do with them meanwhile. A file away is not here to be moved or deleted, so a move or a
// delete of one is written down, and the next turn of syncing does it on the other side. Until
// then everything here reads the files away as they will be. See design/sync.md, section 10.

const STATE = '.scrawl/sync-state.json';
/** What was asked of files away and is not done on the other side yet; kept on the device. */
const OPS = '.scrawl/sync-away.json';
const ATTACHMENTS = '_attachments/';
const TRASH = '.scrawl/trash/';

/**
 * Whether a file may stay on the other side when it is large: an attached file, or one in the
 * trash that is not the app's own text (a note, a list, a board, a keys file).
 */
export function mayStayAway(path: string): boolean {
  const key = keyOf(path);
  if (key.startsWith(ATTACHMENTS)) return key.length > ATTACHMENTS.length;
  return key.startsWith(TRASH) && !/\.(md|json|env)$/.test(key);
}

/** A file on the other side that is not here. */
export interface AwayFile {
  path: string;
  /** Its size there, in bytes. */
  size: number;
  /** An image's width and height there, where the provider tells them. */
  width?: number;
  height?: number;
}

/** A move or a delete of a file away, asked for here and done by the next turn. */
export type AwayOp = { id: string; kind: 'move'; from: string; to: string } | { id: string; kind: 'remove'; path: string };

export async function readAwayOps(fs: VaultFs): Promise<AwayOp[]> {
  try {
    const ops = (JSON.parse(await fs.readText(OPS)) as { ops?: unknown }).ops;
    if (!Array.isArray(ops)) return [];
    return ops.filter(
      (op): op is AwayOp =>
        typeof op?.id === 'string' &&
        ((op.kind === 'move' && typeof op.from === 'string' && typeof op.to === 'string') || (op.kind === 'remove' && typeof op.path === 'string')),
    );
  } catch {
    return [];
  }
}

const writeOps = (fs: VaultFs, ops: AwayOp[]) => fs.writeText(OPS, `${JSON.stringify({ version: 1, ops }, null, 2)}\n`);

let opCount = 0;

/** Writes down a move of a file away; the next turn moves it on the other side. */
export async function moveAway(fs: VaultFs, from: string, to: string): Promise<void> {
  await writeOps(fs, [...(await readAwayOps(fs)), { id: `${Date.now().toString(36)}-${++opCount}`, kind: 'move', from, to }]);
}

/** Writes down that a file away is deleted for good; the next turn deletes it on the other side. */
export async function removeAway(fs: VaultFs, path: string): Promise<void> {
  await writeOps(fs, [...(await readAwayOps(fs)), { id: `${Date.now().toString(36)}-${++opCount}`, kind: 'remove', path }]);
}

/** Forgets the ops done, reading the list again so that one written meanwhile stays. */
export async function finishAwayOps(fs: VaultFs, done: ReadonlySet<string>): Promise<void> {
  if (done.size === 0) return;
  const left = (await readAwayOps(fs)).filter((op) => !done.has(op.id));
  if (left.length === 0) await fs.remove(OPS).catch(() => undefined);
  else await writeOps(fs, left);
}

/** The files away as the last turn left them: what the sync state says is on the other side and not here. */
async function awayInState(fs: VaultFs): Promise<Map<string, AwayFile>> {
  const away = new Map<string, AwayFile>();
  try {
    type Kept = { path?: unknown; size?: unknown; away?: unknown; width?: unknown; height?: unknown };
    const files = (JSON.parse(await fs.readText(STATE)) as { files?: Record<string, Kept> }).files;
    for (const record of Object.values(files ?? {})) {
      if (record?.away !== true || typeof record.path !== 'string') continue;
      const { width, height } = record;
      away.set(keyOf(record.path), {
        path: record.path,
        size: typeof record.size === 'number' ? record.size : 0,
        ...(typeof width === 'number' && typeof height === 'number' && { width, height }),
      });
    }
  } catch {
    // No sync, or not yet: nothing is away.
  }
  return away;
}

/** The files away, as they are once what was asked of them is done. */
export async function readAway(fs: VaultFs): Promise<AwayFile[]> {
  const away = await awayInState(fs);
  for (const op of await readAwayOps(fs)) {
    if (op.kind === 'remove') {
      away.delete(keyOf(op.path));
      continue;
    }
    const file = away.get(keyOf(op.from));
    if (!file) continue;
    away.delete(keyOf(op.from));
    away.set(keyOf(op.to), { ...file, path: op.to });
  }
  return [...away.values()];
}

/** The file away at `path`, or null when it is not away. */
export async function awayAt(fs: VaultFs, path: string): Promise<AwayFile | null> {
  if (!mayStayAway(path)) return null;
  const key = keyOf(path);
  return (await readAway(fs)).find((file) => keyOf(file.path) === key) ?? null;
}
