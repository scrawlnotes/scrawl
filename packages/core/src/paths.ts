import { BOARD_EXT } from './board';
import { join, type VaultFs } from './fs';
import { TASK_LIST_EXT } from './tasks';

// Naming and moving files, shared by the vault, its trash and the history of notes.

/** A file name split into the name the user sees and the extension that says what the file is. */
export function splitName(name: string): [string, string] {
  for (const ext of [TASK_LIST_EXT, BOARD_EXT]) if (name.endsWith(ext)) return [name.slice(0, -ext.length), ext];
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A moment as file names carry it, in local time: `2026-10-05 143207`. */
export const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})/;

/** The moment a name starts with, as `stamp` wrote it, and the rest of the name; null when it has none. */
export function parseStamp(name: string): { time: Date; rest: string } | null {
  const m = STAMP.exec(name);
  if (!m) return null;
  return { time: new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!), rest: name.slice(m[0].length) };
}

/**
 * A path that no entry of `taken` uses, made by numbering `name` when needed. `taken` holds
 * lowercased paths: on Windows `tasks` and `Tasks` are the same file, and writing one would
 * replace the other.
 */
export function freePath(dir: string, name: string, ext: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const path = join(dir, `${name}${n > 1 ? ` ${n}` : ''}${ext}`);
    if (!taken.has(path.toLowerCase())) return path;
  }
}

/**
 * Moves every file under `from` to the same place under `to`, folders included, empty ones too.
 * Files are moved one by one, since not every storage can move a folder.
 */
export async function moveTree(fs: VaultFs, from: string, to: string): Promise<void> {
  await fs.mkdir(to);
  for (const entry of await fs.list(from)) {
    const target = to + entry.path.slice(from.length);
    if (entry.kind === 'dir') await moveTree(fs, entry.path, target);
    else await fs.move(entry.path, target);
  }
}
