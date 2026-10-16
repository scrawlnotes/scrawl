import type { SpaceSource } from '../spaces';
import { keyOf } from './paths';
import type { RemoteStore } from './remote';

// The mark a personal space leaves in its old place when it moves (design/spaces.md 3.2): where it
// went, which device moved it and when. One file each move, named by when, so that a mark is never
// written over and an old one stays told apart from a new one. The marks are not synced: a device
// still syncing with the old place reads them before a turn and stops (`RemoteMoved`).

/** The folder of the marks, in the old place. */
export const MOVED_DIR = '.scrawl/moved';

export interface MovedMark {
  /** Where the personal space went. */
  to: SpaceSource;
  /** The name of the device that moved it. */
  by: string;
  /** When, in milliseconds. */
  at: number;
}

/** The path of a mark left at `at`. */
export const movedPath = (at: number) => `${MOVED_DIR}/${at}.json`;

/** When a path of the old place says a mark was left; null when it is not a mark. */
export function movedAt(path: string): number | null {
  const match = /^\.scrawl\/moved\/(\d+)\.json$/i.exec(path.normalize('NFC'));
  return match ? Number(match[1]) : null;
}

export const serializeMoved = (mark: MovedMark) => `${JSON.stringify(mark, null, 2)}\n`;

/**
 * Deletes the copy a personal space left in its old place, asked for when it moved: every file and
 * folder there but the marks, which tell the devices still syncing there where it went.
 */
export async function clearLeftPlace(store: RemoteStore): Promise<void> {
  const listing = await store.changes(null);
  const byKey = new Map(listing.changed.map((entry) => [keyOf(entry.path), entry]));
  const tops = new Set<string>();
  for (const entry of listing.changed) {
    const [top, next] = entry.path.split('/');
    if (keyOf(top!) !== '.scrawl') tops.add(top!);
    else if (next && keyOf(`.scrawl/${next}`) !== MOVED_DIR) tops.add(`.scrawl/${next}`);
  }
  for (const path of tops) {
    const entry = byKey.get(keyOf(path));
    if (entry) await store.remove(path, entry.kind === 'file' ? entry.tag : null);
  }
}

/** A mark as it was written; null when it is not one. */
export function parseMoved(text: string): MovedMark | null {
  try {
    const data = JSON.parse(text) as Partial<MovedMark>;
    const to = data.to;
    if (!to || typeof to !== 'object' || typeof to.provider !== 'string' || !to.place || typeof to.place !== 'object') return null;
    if (typeof data.at !== 'number' || !Number.isFinite(data.at)) return null;
    const place = Object.fromEntries(Object.entries(to.place).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    return { to: { provider: to.provider, ...(typeof to.account === 'string' && { account: to.account }), place }, by: typeof data.by === 'string' ? data.by : '', at: data.at };
  } catch {
    return null;
  }
}
