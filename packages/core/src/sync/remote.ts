import { keyOf } from './paths';
import { sha256 } from './hash';
import type { MovedMark } from './moved';

// Where a space's files live away from the device: OneDrive, later Google Drive or WebDAV. The
// engine knows a provider only through this, so the same engine syncs with any of them. See
// design/sync.md.

export interface RemoteFile {
  path: string;
  kind: 'file';
  /** The provider's content tag: it changes when the content does, and only then (OneDrive's `cTag`). */
  tag: string;
  size: number;
  /** The provider's own digest of the content, where it gives one; compared with `RemoteStore.hashOf`. */
  hash?: string;
  /** An image's width and height, where the provider tells them: what is left there shows that large. */
  width?: number;
  height?: number;
}

export interface RemoteDir {
  path: string;
  kind: 'dir';
}

export type RemoteEntry = RemoteFile | RemoteDir;

export interface RemoteChanges {
  changed: RemoteEntry[];
  /** Paths of files and folders that are gone. */
  removed: string[];
  /** Where the next listing starts. */
  cursor: string;
  /**
   * The listing holds everything there is, though a cursor was given: the provider could not
   * tell what changed since it (too old, or forgotten). What it lacks is gone.
   */
  full?: boolean;
}

export interface RemoteStore {
  /** What changed since `cursor`; everything there is when it is null. Told how many items were read so far, page by page. */
  changes(cursor: string | null, onListed?: (count: number) => void): Promise<RemoteChanges>;
  /** A file's content; told how many of its bytes came so far, for a large one. */
  read(path: string, onBytes?: (done: number) => void): Promise<Blob>;
  /** An empty folder; nothing happens when it is there. */
  mkdir(path: string): Promise<void>;
  /**
   * Writes a file, its folders made as needed. With a tag in `ifMatch` it writes only while the
   * file there still has that tag; with null only while there is no file there. Otherwise it
   * writes nothing and throws a `RemoteConflict`.
   */
  write(path: string, data: Blob, ifMatch: string | null, onBytes?: (done: number) => void): Promise<RemoteFile>;
  /** Moves a file, as `write` checks `ifMatch` against the file at `from`; nothing may be at `to`. */
  move(from: string, to: string, ifMatch: string | null): Promise<RemoteFile>;
  /** Removes a file, checked as `write` does, or a folder with everything in it. */
  remove(path: string, ifMatch: string | null): Promise<void>;
  /** The provider's digest of some content, to compare with `RemoteFile.hash`. */
  hashOf?(data: Blob): Promise<string>;
  /** Whether the provider takes a path as it is; one it does not is not synced (no name is changed silently). */
  accepts?(path: string): boolean;
}

/** The file on the other side is not as the engine last saw it, or is gone; nothing was written. */
export class RemoteConflict extends Error {
  constructor(readonly path: string) {
    super(`Changed on the other side: ${path}`);
    this.name = 'RemoteConflict';
  }
}

/** The provider cannot be reached: no network, or it does not answer. Nothing more was done; the next turn tries again. */
export class RemoteOffline extends Error {
  constructor() {
    super('The cloud drive cannot be reached');
    this.name = 'RemoteOffline';
  }
}

/** The provider no longer takes the sign-in: the account must be signed in to again. */
export class RemoteSignedOut extends Error {
  /** @param notYet This device has no key for it at all: it never signed in to it here, or signed out of it. */
  constructor(readonly notYet = false) {
    super('Signed out of the cloud drive');
    this.name = 'RemoteSignedOut';
  }
}

/** The space's folder is gone from the cloud drive (deleted, or out of reach). */
export class RemoteFolderGone extends Error {
  /** @param removed The space is there, but this person was taken out of it. */
  constructor(readonly removed = false) {
    super(removed ? 'You were taken out of this space' : "The space's folder is gone from the cloud drive");
    this.name = 'RemoteFolderGone';
  }
}

/**
 * A newer Scrawl synced this space, by a rule this version does not know: nothing was done here,
 * and no turn goes until this version is updated (design/sync-gate.md).
 */
export class RemoteNeedsNewer extends Error {
  /** @param level The space's level, where it is known: a server that refuses says none. */
  constructor(readonly level: number | null = null) {
    super('A newer version of Scrawl synced this space');
    this.name = 'RemoteNeedsNewer';
  }
}

/** The personal space moved from here to another place on another device; nothing was done here. */
export class RemoteMoved extends Error {
  constructor(readonly mark: MovedMark) {
    super('The personal space moved to another place');
    this.name = 'RemoteMoved';
  }
}

interface StoredFile {
  path: string;
  data: Blob;
  tag: string;
  /** When it last changed, as the listing counts. */
  seq: number;
}

/**
 * A remote in memory, as a provider behaves: names are the same whatever their case or Unicode
 * form, every write gives a new tag, a move keeps it, and the listing tells what changed since a
 * cursor. For tests, and for trying the engine without an account.
 */
export class MemoryRemote implements RemoteStore {
  private readonly files = new Map<string, StoredFile>();
  private readonly dirs = new Map<string, { path: string; seq: number }>();
  /** What was removed, by key: the path it had and when. */
  private readonly gone = new Map<string, { path: string; seq: number }>();
  private seq = 0;
  private tags = 0;
  /** How many times each kind of call was made, for tests to count what went over the wire. */
  readonly calls = { read: 0, write: 0, move: 0, remove: 0, mkdir: 0 };

  /** @param hashes whether the provider gives digests of its files, as OneDrive does. */
  constructor(private readonly hashes = false) {}

  async changes(cursor: string | null): Promise<RemoteChanges> {
    const since = cursor === null ? 0 : Number(cursor);
    const changed: RemoteEntry[] = [];
    const removed: string[] = [];
    // A full listing has every folder, those made for a file's sake too.
    for (const dir of this.dirs.values()) if (cursor === null || dir.seq > since) changed.push({ path: dir.path, kind: 'dir' });
    for (const file of this.files.values()) if (file.seq > since) changed.push(await this.entry(file));
    if (cursor !== null) for (const [key, was] of this.gone) if (was.seq > since && !this.files.has(key) && !this.dirs.has(key)) removed.push(was.path);
    return { changed, removed, cursor: String(this.seq) };
  }

  async read(path: string): Promise<Blob> {
    this.calls.read++;
    const file = this.files.get(keyOf(path));
    if (!file) throw new RemoteConflict(path);
    return file.data;
  }

  async mkdir(path: string): Promise<void> {
    this.calls.mkdir++;
    const key = keyOf(path);
    if (this.dirs.has(key)) return;
    this.dirs.set(key, { path, seq: ++this.seq });
    this.gone.delete(key);
  }

  async write(path: string, data: Blob, ifMatch: string | null): Promise<RemoteFile> {
    this.calls.write++;
    const key = keyOf(path);
    this.check(path, ifMatch);
    const file: StoredFile = { path, data, tag: `t${++this.tags}`, seq: ++this.seq };
    this.files.set(key, file);
    this.gone.delete(key);
    this.makeParents(path);
    return this.entry(file);
  }

  async move(from: string, to: string, ifMatch: string | null): Promise<RemoteFile> {
    this.calls.move++;
    const fromKey = keyOf(from);
    const toKey = keyOf(to);
    const file = this.check(from, ifMatch);
    if (!file) throw new RemoteConflict(from);
    if (toKey !== fromKey && this.files.has(toKey)) throw new RemoteConflict(to);
    this.files.delete(fromKey);
    if (toKey !== fromKey) this.gone.set(fromKey, { path: file.path, seq: ++this.seq });
    const moved: StoredFile = { ...file, path: to, seq: ++this.seq };
    this.files.set(toKey, moved);
    this.gone.delete(toKey);
    this.makeParents(to);
    return this.entry(moved);
  }

  async remove(path: string, ifMatch: string | null): Promise<void> {
    this.calls.remove++;
    const key = keyOf(path);
    if (this.dirs.has(key)) {
      const inside = (k: string) => k === key || k.startsWith(`${key}/`);
      for (const k of [...this.files.keys()]) if (inside(k)) this.forget(k, this.files.get(k)!.path, this.files);
      for (const k of [...this.dirs.keys()]) if (inside(k)) this.forget(k, this.dirs.get(k)!.path, this.dirs);
      return;
    }
    const file = this.check(path, ifMatch);
    if (!file) throw new RemoteConflict(path);
    this.forget(key, file.path, this.files);
  }

  async hashOf(data: Blob): Promise<string> {
    return sha256(data);
  }

  // ---------- for tests: what another program would do to the remote ----------

  /** The text at `path`, or null. */
  async text(path: string): Promise<string | null> {
    const file = this.files.get(keyOf(path));
    return file ? file.data.text() : null;
  }

  /** Every file's path, sorted. */
  paths(): string[] {
    return [...this.files.values()].map((f) => f.path).sort();
  }

  dirPaths(): string[] {
    return [...this.dirs.values()].map((d) => d.path).sort();
  }

  // ---------- inside ----------

  private check(path: string, ifMatch: string | null): StoredFile | undefined {
    const file = this.files.get(keyOf(path));
    if (ifMatch === null ? file !== undefined : file?.tag !== ifMatch) throw new RemoteConflict(path);
    return file;
  }

  private forget<T>(key: string, path: string, from: Map<string, T>) {
    from.delete(key);
    this.gone.set(key, { path, seq: ++this.seq });
  }

  /** Folders a file is in exist, as on a provider; they are not listed as changes of their own. */
  private makeParents(path: string) {
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      const key = keyOf(dir);
      if (!this.dirs.has(key)) this.dirs.set(key, { path: dir, seq: 0 });
      this.gone.delete(key);
    }
  }

  private async entry(file: StoredFile): Promise<RemoteFile> {
    return { path: file.path, kind: 'file', tag: file.tag, size: file.data.size, ...(this.hashes && { hash: await sha256(file.data) }) };
  }
}
