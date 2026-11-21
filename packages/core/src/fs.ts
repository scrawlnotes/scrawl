/**
 * The storage a vault lives on. Paths are relative to the vault root, use `/` and have no
 * leading slash; the root itself is `''`. Each platform provides one implementation: the real
 * file system on desktop, the origin private file system in the browser, memory in tests.
 */
export interface VaultFs {
  /** Entries directly inside `dir`. A missing directory lists as empty. */
  list(dir: string): Promise<Entry[]>;
  readText(path: string): Promise<string>;
  /** Writes a file, creating parent directories as needed. */
  writeText(path: string, text: string): Promise<void>;
  readBlob(path: string): Promise<Blob>;
  writeBlob(path: string, data: Blob): Promise<void>;
  /**
   * Writes a large file part by part, telling after each part how much is written, and stops
   * when `signal` aborts. The file is there only once it is complete; a write that does not
   * finish leaves nothing behind.
   */
  writeBlobInParts(path: string, data: Blob, options?: PartsOptions): Promise<void>;
  /** Moves or renames a file, creating the target's parent directories as needed. */
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** A file's entry as `list` gives it, or null when there is none; read without listing its folder. */
  stat?(path: string): Promise<Entry | null>;
}

export interface PartsOptions {
  /** Told how many bytes are written so far, after each part. */
  onProgress?: (written: number) => void;
  signal?: AbortSignal;
}

/** How much of a file is written at a time: small enough to show progress and to stop in between. */
export const PART_SIZE = 4 * 1024 * 1024;

export interface Entry {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  /** A file's size in bytes, where the storage tells it without reading the file. */
  size?: number;
  /** When a file was last written, in milliseconds, where the storage tells it without reading the file. */
  modified?: number;
}

export const join = (...parts: string[]) => parts.filter(Boolean).join('/');
export const dirname = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

const ascii = (text: string) => /^[\x00-\x7f]*$/.test(text);

/**
 * A store's files with every name in NFC (design/unicode-names.md 3.1). A letter can be written as
 * one character or as a letter and its mark (NFD): `İ` or `I` and a dot. A name a store keeps in
 * NFD is listed in NFC and reached by its NFC path; a name not there yet is written in NFC. Names
 * on the disk are never changed.
 */
export class NfcFs implements VaultFs {
  /** Each folder's names as the store spells them, by their NFC, from when it was last listed; by the folder's own spelling. */
  private readonly spelt = new Map<string, Map<string, string>>();
  readonly stat?: (path: string) => Promise<Entry | null>;

  constructor(private readonly inner: VaultFs) {
    if (inner.stat) {
      const stat = inner.stat.bind(inner);
      this.stat = async (path) => {
        const entry = await stat(await this.onDisk(path));
        return entry && { ...entry, name: basename(path).normalize('NFC'), path: path.normalize('NFC') };
      };
    }
  }

  private remember(dir: string, entries: Entry[]) {
    this.spelt.set(dir, new Map(entries.map((entry) => [entry.name.normalize('NFC'), entry.name])));
  }

  /** The path as the store spells it: each part as it is there, a part not there in NFC. */
  async onDisk(path: string): Promise<string> {
    if (ascii(path)) return path;
    let at = '';
    for (const part of path.split('/')) {
      const wanted = part.normalize('NFC');
      let found = ascii(part) ? part : this.spelt.get(at)?.get(wanted);
      // Not seen in its folder: made since, by this app or another, or not there at all.
      if (found === undefined) {
        this.remember(at, await this.inner.list(at));
        found = this.spelt.get(at)!.get(wanted) ?? wanted;
      }
      at = join(at, found);
    }
    return at;
  }

  /** A name written, made or moved in: its folder, when it was listed, has it now. */
  private wrote(disk: string) {
    this.spelt.get(dirname(disk))?.set(basename(disk).normalize('NFC'), basename(disk));
  }

  /** A name gone: from its folder, and every folder under it. */
  private gone(disk: string) {
    this.spelt.get(dirname(disk))?.delete(basename(disk).normalize('NFC'));
    for (const dir of [...this.spelt.keys()]) if (dir === disk || dir.startsWith(`${disk}/`)) this.spelt.delete(dir);
  }

  async list(dir: string): Promise<Entry[]> {
    const disk = await this.onDisk(dir);
    const entries = await this.inner.list(disk);
    this.remember(disk, entries);
    const shown = dir.normalize('NFC');
    return entries.map((entry) => {
      const name = entry.name.normalize('NFC');
      return name === entry.name && disk === shown ? entry : { ...entry, name, path: join(shown, name) };
    });
  }

  async readText(path: string): Promise<string> {
    return this.inner.readText(await this.onDisk(path));
  }

  async readBlob(path: string): Promise<Blob> {
    return this.inner.readBlob(await this.onDisk(path));
  }

  async writeText(path: string, text: string): Promise<void> {
    const disk = await this.onDisk(path);
    await this.inner.writeText(disk, text);
    this.wrote(disk);
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    const disk = await this.onDisk(path);
    await this.inner.writeBlob(disk, data);
    this.wrote(disk);
  }

  async writeBlobInParts(path: string, data: Blob, options?: PartsOptions): Promise<void> {
    const disk = await this.onDisk(path);
    await this.inner.writeBlobInParts(disk, data, options);
    this.wrote(disk);
  }

  async move(from: string, to: string): Promise<void> {
    const [source, target] = [await this.onDisk(from), await this.onDisk(to)];
    // The same name in another form: it is there already.
    if (source === target) return;
    await this.inner.move(source, target);
    this.gone(source);
    this.wrote(target);
  }

  async remove(path: string): Promise<void> {
    const disk = await this.onDisk(path);
    await this.inner.remove(disk);
    this.gone(disk);
  }

  async mkdir(path: string): Promise<void> {
    const disk = await this.onDisk(path);
    await this.inner.mkdir(disk);
    this.wrote(disk);
  }
}

/** An in-memory vault for tests and for browsers without persistent storage. */
export class MemoryFs implements VaultFs {
  private readonly files = new Map<string, Blob>();
  private readonly dirs = new Set<string>();
  /** When each file was written: a count rather than a clock, so that two writes never share a moment. */
  private readonly written = new Map<string, number>();
  private writes = 0;

  private put(path: string, data: Blob) {
    this.files.set(path, data);
    this.written.set(path, ++this.writes);
  }

  async list(dir: string): Promise<Entry[]> {
    const prefix = dir ? `${dir}/` : '';
    const entries = new Map<string, Entry>();
    const add = (path: string, isFile: boolean) => {
      if (!path.startsWith(prefix) || path === dir) return;
      const name = path.slice(prefix.length).split('/')[0]!;
      const direct = prefix + name === path;
      if (!entries.has(name) || (direct && isFile)) {
        const file = direct && isFile;
        entries.set(name, {
          name,
          path: prefix + name,
          kind: file ? 'file' : 'dir',
          ...(file && { size: this.files.get(path)!.size, modified: this.written.get(path) }),
        });
      }
    };
    for (const path of this.files.keys()) add(path, true);
    for (const path of this.dirs) add(path, false);
    return [...entries.values()];
  }

  async readBlob(path: string): Promise<Blob> {
    const blob = this.files.get(path);
    if (!blob) throw new Error(`No such file: ${path}`);
    return blob;
  }

  async readText(path: string): Promise<string> {
    return (await this.readBlob(path)).text();
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    this.put(path, data);
  }

  async writeText(path: string, text: string): Promise<void> {
    this.put(path, new Blob([text], { type: 'text/markdown' }));
  }

  async writeBlobInParts(path: string, data: Blob, { onProgress, signal }: PartsOptions = {}): Promise<void> {
    const parts: Blob[] = [];
    for (let offset = 0; offset < data.size; offset += PART_SIZE) {
      signal?.throwIfAborted();
      parts.push(data.slice(offset, offset + PART_SIZE));
      // A turn of the event loop between parts, as real storage takes, so that a stop can come in.
      await new Promise((resolve) => setTimeout(resolve));
      onProgress?.(Math.min(offset + PART_SIZE, data.size));
    }
    signal?.throwIfAborted();
    this.put(path, new Blob(parts, { type: data.type }));
  }

  async move(from: string, to: string): Promise<void> {
    // A move keeps when the file was written, as on a disk.
    this.files.set(to, await this.readBlob(from));
    this.written.set(to, this.written.get(from) ?? ++this.writes);
    this.files.delete(from);
    this.written.delete(from);
  }

  /** Removes a file, or a directory with everything in it. */
  async remove(path: string): Promise<void> {
    const inside = (p: string) => p === path || p.startsWith(`${path}/`);
    for (const p of [...this.files.keys()]) {
      if (!inside(p)) continue;
      this.files.delete(p);
      this.written.delete(p);
    }
    for (const p of [...this.dirs]) if (inside(p)) this.dirs.delete(p);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async stat(path: string): Promise<Entry | null> {
    const data = this.files.get(path);
    return data ? { name: basename(path), path, kind: 'file', size: data.size, modified: this.written.get(path) } : null;
  }
}
