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
  /** Moves or renames a file, creating the target's parent directories as needed. */
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export interface Entry {
  name: string;
  path: string;
  kind: 'file' | 'dir';
}

export const join = (...parts: string[]) => parts.filter(Boolean).join('/');
export const dirname = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** An in-memory vault for tests and for browsers without persistent storage. */
export class MemoryFs implements VaultFs {
  private readonly files = new Map<string, Blob>();
  private readonly dirs = new Set<string>();

  async list(dir: string): Promise<Entry[]> {
    const prefix = dir ? `${dir}/` : '';
    const entries = new Map<string, Entry>();
    const add = (path: string, isFile: boolean) => {
      if (!path.startsWith(prefix) || path === dir) return;
      const name = path.slice(prefix.length).split('/')[0]!;
      const direct = prefix + name === path;
      if (!entries.has(name) || (direct && isFile)) {
        entries.set(name, { name, path: prefix + name, kind: direct && isFile ? 'file' : 'dir' });
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
    this.files.set(path, data);
  }

  async writeText(path: string, text: string): Promise<void> {
    this.files.set(path, new Blob([text], { type: 'text/markdown' }));
  }

  async move(from: string, to: string): Promise<void> {
    this.files.set(to, await this.readBlob(from));
    this.files.delete(from);
  }

  /** Removes a file, or a directory with everything in it. */
  async remove(path: string): Promise<void> {
    const inside = (p: string) => p === path || p.startsWith(`${path}/`);
    for (const p of [...this.files.keys()]) if (inside(p)) this.files.delete(p);
    for (const p of [...this.dirs]) if (inside(p)) this.dirs.delete(p);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }
}
