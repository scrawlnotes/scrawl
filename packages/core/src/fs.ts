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
}
