import { isSynced, pathKey as keyOf } from '@scrawlnotes/core';
import type { Blobs, Taken } from './blobs';
import { type Db, transaction } from './db';

// A space's files as the sync engine knows a remote (packages/core/src/sync/remote.ts): a path
// is the same whatever its case or Unicode form; a file's tag is the digest of its content, so it
// changes when the content does and only then, and stays through a move; a write, a move and a
// removal go through only while the file is as the device last saw it. Every change takes the
// space's next number, and what changed since a number is the list of changes. See
// design/server.md, sections 4 and 5.

/** The file is not as the device last saw it, or not there; nothing was done. */
export class Conflict extends Error {
  constructor(readonly path: string) {
    super(`Changed on the server: ${path}`);
    this.name = 'Conflict';
  }
}

/** A path the server does not keep: empty parts, `..`, control characters, a device's own files. */
export class BadPath extends Error {
  constructor(readonly path: string) {
    super(`Not a path the server keeps: ${path}`);
    this.name = 'BadPath';
  }
}

/** Who made a change, kept with it. */
export interface Actor {
  account: string;
  device: string;
}

export type Entry = { path: string; kind: 'file'; tag: string; size: number; hash: string } | { path: string; kind: 'dir' };

export interface ChangesPage {
  changed: Entry[];
  removed: string[];
  cursor: string;
  /** The listing is everything there is, though a cursor was given: the cursor was older than what the server remembers. */
  full?: true;
  /** More of the listing follows: asked for with `cursor` again, or for an entire listing with `after` and `at`. */
  more?: true;
  after?: string;
  at?: number;
}

interface Row {
  key: string;
  path: string;
  kind: 'file' | 'dir';
  hash: string | null;
  size: number;
  seq: number;
  deleted: number;
}

/** The most entries one page of a listing has. */
export const PAGE = 1000;
const MAX_PATH = 1024;

/** The path as the server keeps it, or a `BadPath`. */
export function checkPath(path: string): string {
  const parts = path.split('/');
  // eslint-disable-next-line no-control-regex
  const bad = path.length > MAX_PATH || parts.some((p) => p === '' || p === '.' || p === '..' || /[\u0000-\u001f\u007f\\]/.test(p));
  if (bad || !isSynced(path)) throw new BadPath(path);
  return path;
}

const entryOf = (row: Row): Entry =>
  row.kind === 'dir' ? { path: row.path, kind: 'dir' } : { path: row.path, kind: 'file', tag: row.hash!, size: row.size, hash: row.hash! };

/** The keys inside a folder's key, as a range: `/` is followed by `0`, so nothing else falls between. */
const inside = (key: string) => [`${key}/`, `${key}0`] as const;

export class SpaceFiles {
  constructor(
    private readonly db: Db,
    private readonly blobs: Blobs,
    private readonly now: () => number = Date.now,
    private readonly pageSize = PAGE,
    /** Told after every change, with the space's number then: for the live channel. */
    private readonly onChange: (space: string, seq: number) => void = () => undefined,
  ) {}

  /**
   * What changed since `cursor`, a page at a time. Without a cursor, or with one older than what
   * the server remembers, everything there is, in the order of the keys, as it stood at `at`;
   * what changes while it is read comes again in the next listing from that cursor.
   */
  changes(space: string, cursor: number | null, page: { after?: string; at?: number } = {}): ChangesPage {
    const { seq, oldest_seq } = this.db.prepare('SELECT seq, oldest_seq FROM spaces WHERE id = ?').get(space) as { seq: number; oldest_seq: number };
    if (cursor === null || cursor < oldest_seq) {
      const at = page.at ?? seq;
      const rows = this.db
        .prepare('SELECT * FROM entries WHERE space_id = ? AND deleted = 0 AND key > ? ORDER BY key LIMIT ?')
        .all(space, page.after ?? '', this.pageSize + 1) as unknown as Row[];
      const more = rows.length > this.pageSize;
      const shown = rows.slice(0, this.pageSize);
      return {
        changed: shown.map(entryOf),
        removed: [],
        cursor: String(at),
        ...(cursor !== null && { full: true as const }),
        ...(more && { more: true as const, after: shown.at(-1)!.key, at }),
      };
    }
    const rows = this.db.prepare('SELECT * FROM entries WHERE space_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(space, cursor, this.pageSize + 1) as unknown as Row[];
    const more = rows.length > this.pageSize;
    const shown = rows.slice(0, this.pageSize);
    return {
      changed: shown.filter((r) => !r.deleted).map(entryOf),
      removed: shown.filter((r) => r.deleted).map((r) => r.path),
      cursor: String(more ? shown.at(-1)!.seq : Math.max(cursor, seq)),
      ...(more && { more: true as const }),
    };
  }

  /** A file there now, or undefined. */
  file(space: string, path: string): { path: string; hash: string; size: number } | undefined {
    const row = this.row(space, keyOf(path));
    return row && !row.deleted && row.kind === 'file' ? { path: row.path, hash: row.hash!, size: row.size } : undefined;
  }

  /**
   * Writes what was taken to `path`, while the file there has the tag `ifMatch`, or with null
   * while there is none; its folders are made as needed.
   */
  write(space: string, path: string, taken: Taken, ifMatch: string | null, by: Actor): Entry {
    checkPath(path);
    this.blobs.keep(taken);
    return this.telling(space, () => transaction(this.db, () => {
      const key = keyOf(path);
      const row = this.live(space, key);
      if (row?.kind === 'dir') throw new Conflict(path);
      if (ifMatch === null ? row !== undefined : row?.hash !== ifMatch) throw new Conflict(path);
      this.makeParents(space, path, by);
      const written: Row = { key, path, kind: 'file', hash: taken.hash, size: taken.size, seq: this.next(space), deleted: 0 };
      this.put(space, written, by);
      this.version(space, 'write', path, null, taken.hash, taken.size, by);
      return entryOf(written);
    }));
  }

  /** Moves a file, while it has the tag `ifMatch`; nothing may be at `to`, but the same file spelt otherwise. */
  move(space: string, from: string, to: string, ifMatch: string | null, by: Actor): Entry {
    checkPath(to);
    return this.telling(space, () => transaction(this.db, () => {
      const fromKey = keyOf(from);
      const toKey = keyOf(to);
      const row = this.live(space, fromKey);
      if (!row || row.kind !== 'file' || ifMatch === null || row.hash !== ifMatch) throw new Conflict(from);
      if (toKey !== fromKey && this.live(space, toKey)) throw new Conflict(to);
      if (toKey !== fromKey) this.put(space, { ...row, seq: this.next(space), deleted: 1 }, by);
      this.makeParents(space, to, by);
      const moved: Row = { ...row, key: toKey, path: to, seq: this.next(space), deleted: 0 };
      this.put(space, moved, by);
      this.version(space, 'move', to, row.path, row.hash, row.size, by);
      return entryOf(moved);
    }));
  }

  /** Removes a file while it has the tag `ifMatch`, or a folder with everything in it. */
  remove(space: string, path: string, ifMatch: string | null, by: Actor) {
    this.telling(space, () => transaction(this.db, () => {
      const key = keyOf(path);
      const row = this.live(space, key);
      if (row?.kind === 'dir') {
        const [low, high] = inside(key);
        const within = this.db
          .prepare('SELECT * FROM entries WHERE space_id = ? AND deleted = 0 AND key >= ? AND key < ? ORDER BY key DESC')
          .all(space, low, high) as unknown as Row[];
        for (const each of [...within, row]) {
          this.put(space, { ...each, seq: this.next(space), deleted: 1 }, by);
          if (each.kind === 'file') this.version(space, 'remove', each.path, null, each.hash, each.size, by);
        }
        return;
      }
      if (!row || ifMatch === null || row.hash !== ifMatch) throw new Conflict(path);
      this.put(space, { ...row, seq: this.next(space), deleted: 1 }, by);
      this.version(space, 'remove', row.path, null, row.hash, row.size, by);
    }));
  }

  /** An empty folder; nothing happens when it is there. */
  mkdir(space: string, path: string, by: Actor) {
    checkPath(path);
    this.telling(space, () => transaction(this.db, () => {
      const row = this.live(space, keyOf(path));
      if (row?.kind === 'dir') return;
      if (row) throw new Conflict(path);
      this.makeParents(space, path, by);
      this.put(space, { key: keyOf(path), path, kind: 'dir', hash: null, size: 0, seq: this.next(space), deleted: 0 }, by);
    }));
  }

  /** What is at `path` now: a file with its tag, or a folder; undefined when nothing is. */
  at(space: string, path: string): Entry | undefined {
    const row = this.live(space, keyOf(path));
    return row ? entryOf(row) : undefined;
  }

  /** The entries directly inside `dir` (`''` for the top), as a folder lists them, with when each last changed. */
  listDir(space: string, dir: string): (Entry & { at: number })[] {
    const [low, high] = dir ? inside(keyOf(dir)) : ['', '\uffff'];
    const rows = this.db.prepare('SELECT * FROM entries WHERE space_id = ? AND deleted = 0 AND key >= ? AND key < ? ORDER BY key').all(space, low, high) as unknown as (Row & { at: number })[];
    const depth = dir ? dir.split('/').length + 1 : 1;
    return rows.filter((r) => r.path.split('/').length === depth).map((r) => ({ ...entryOf(r), at: r.at }));
  }

  // ---------- inside ----------

  /** Runs a change, and tells it once it is kept, when it changed anything. */
  private telling<T>(space: string, change: () => T): T {
    const before = this.seqOf(space);
    const result = change();
    const after = this.seqOf(space);
    if (after !== before) this.onChange(space, after);
    return result;
  }

  private seqOf(space: string): number {
    return (this.db.prepare('SELECT seq FROM spaces WHERE id = ?').get(space) as { seq: number }).seq;
  }

  private row(space: string, key: string): Row | undefined {
    return this.db.prepare('SELECT * FROM entries WHERE space_id = ? AND key = ?').get(space, key) as unknown as Row | undefined;
  }

  private live(space: string, key: string): Row | undefined {
    const row = this.row(space, key);
    return row && !row.deleted ? row : undefined;
  }

  private next(space: string): number {
    return (this.db.prepare('UPDATE spaces SET seq = seq + 1 WHERE id = ? RETURNING seq').get(space) as { seq: number }).seq;
  }

  /** The folders a path is in, as on a provider: each one not there yet is made, and listed once. */
  private makeParents(space: string, path: string, by: Actor) {
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      const row = this.live(space, keyOf(dir));
      if (row?.kind === 'dir') continue;
      if (row) throw new Conflict(dir);
      this.put(space, { key: keyOf(dir), path: dir, kind: 'dir', hash: null, size: 0, seq: this.next(space), deleted: 0 }, by);
    }
  }

  private put(space: string, row: Row, by: Actor) {
    this.db
      .prepare(
        `INSERT INTO entries (space_id, key, path, kind, hash, size, seq, author_id, device_id, at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (space_id, key) DO UPDATE SET path = excluded.path, kind = excluded.kind, hash = excluded.hash, size = excluded.size,
           seq = excluded.seq, author_id = excluded.author_id, device_id = excluded.device_id, at = excluded.at, deleted = excluded.deleted`,
      )
      .run(space, row.key, row.path, row.kind, row.hash, row.size, row.seq, by.account, by.device, this.now(), row.deleted);
  }

  private version(space: string, op: 'write' | 'move' | 'remove', path: string, from: string | null, hash: string | null, size: number, by: Actor) {
    this.db
      .prepare('INSERT INTO versions (space_id, path, from_path, op, hash, size, author_id, device_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(space, path, from, op, hash, size, by.account, by.device, this.now());
  }
}
