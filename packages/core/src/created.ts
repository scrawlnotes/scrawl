import { join, type VaultFs } from './fs';
import { listVersions } from './history';
import { parseStamp } from './paths';

// When each note, task list, board, keys file, collection and folder of a space was made, as the
// app keeps it: what the files say of it is not to be trusted everywhere, as a browser's storage
// keeps no such time and a copy synced in counts as made when it came. Each device writes only
// its own file, `.scrawl/created/<device>.json`, so that no two write the same file; it is synced
// with the space, and reading takes the earliest time a path has in any of them. Paths are kept
// lowercased, as the files of a space are told apart.

export const CREATED_DIR = '.scrawl/created';

type Times = Record<string, string>;

const ownFile = (device: string) => join(CREATED_DIR, `${device.replace(/[^\w.-]/g, '_')}.json`);

async function readTimes(fs: VaultFs, path: string): Promise<Times> {
  try {
    const data = JSON.parse(await fs.readText(path)) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

/** When each path of the space was made, by its path lowercased, in milliseconds: the earliest any device knows. */
export async function readCreated(fs: VaultFs): Promise<Map<string, number>> {
  const times = new Map<string, number>();
  const files = await fs.list(CREATED_DIR).catch(() => []);
  for (const file of files) {
    if (file.kind !== 'file' || !file.name.endsWith('.json')) continue;
    for (const [path, iso] of Object.entries(await readTimes(fs, file.path))) {
      const time = Date.parse(iso);
      if (Number.isNaN(time)) continue;
      const known = times.get(path);
      if (known === undefined || time < known) times.set(path, time);
    }
  }
  return times;
}

/** Writes into this device's file the times of `made`, by path, where it has none yet. Nothing without a device. */
export async function markCreated(fs: VaultFs, device: string, made: Record<string, Date | number>): Promise<void> {
  if (!device || Object.keys(made).length === 0) return;
  const own = await readTimes(fs, ownFile(device));
  let changed = false;
  for (const [path, at] of Object.entries(made)) {
    const key = path.toLowerCase();
    if (key in own) continue;
    own[key] = new Date(at).toISOString();
    changed = true;
  }
  if (changed) await fs.writeText(ownFile(device), JSON.stringify(own, null, 1));
}

/**
 * A rename or a move: what was at `from` keeps the time it was made at `to`, and so does what is
 * under it. The times at the old paths stay, which nothing asks for any more.
 */
export async function carryCreated(fs: VaultFs, device: string, from: string, to: string): Promise<void> {
  if (!device || from === to) return;
  const all = await readCreated(fs);
  const [old, now] = [from.toLowerCase(), to.toLowerCase()];
  const own = await readTimes(fs, ownFile(device));
  let changed = false;
  for (const [path, time] of all) {
    if (path !== old && !path.startsWith(`${old}/`)) continue;
    own[now + path.slice(old.length)] = new Date(time).toISOString();
    changed = true;
  }
  if (changed) await fs.writeText(ownFile(device), JSON.stringify(own, null, 1));
}

/**
 * The times of things made before the app kept them, written into this device's file once, for
 * those of `paths` that have none: the moment a note's name starts with, the first version this
 * device kept of a note, or else when it was last written here. Returns the times written.
 */
export async function guessCreated(fs: VaultFs, device: string, paths: { path: string; modified?: number }[]): Promise<Record<string, number>> {
  const known = await readCreated(fs);
  const guessed: Record<string, number> = {};
  for (const { path, modified } of paths) {
    if (known.has(path.toLowerCase())) continue;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const candidates: number[] = [];
    const stamped = parseStamp(name);
    if (stamped) candidates.push(stamped.time.getTime());
    if (path.endsWith('.md')) {
      const versions = await listVersions(fs, path).catch(() => []);
      for (const version of versions) candidates.push(Date.parse(version.time));
    }
    if (modified !== undefined) candidates.push(modified);
    if (candidates.length > 0) guessed[path] = Math.min(...candidates);
  }
  await markCreated(fs, device, guessed);
  return Object.fromEntries(Object.entries(guessed).map(([path, time]) => [path.toLowerCase(), time]));
}
