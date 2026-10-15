import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname as dirOf, join as joinPath, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { basename, type Entry, type PartsOptions, type VaultFs } from '@scrawlnotes/core';

// A vault in a folder on disk, through Node: what the desktop app's shell does for the web view
// (apps/web/src/tauriFs.ts and the Rust behind it), done here for the stdio command. Paths are
// inside the folder, with `/`; nothing outside it is reached.

export class NodeFs implements VaultFs {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** The place on disk of a path in the vault; a path that would leave the folder is refused. */
  private at(path: string): string {
    const full = resolve(this.root, ...path.split('/').filter(Boolean));
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error(`Not inside the vault: ${path}`);
    return full;
  }

  async list(dir: string): Promise<Entry[]> {
    let names: import('node:fs').Dirent[];
    try {
      names = await readdir(this.at(dir), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entries: Entry[] = [];
    for (const each of names) {
      const path = dir ? `${dir}/${each.name}` : each.name;
      if (each.isDirectory()) entries.push({ name: each.name, path, kind: 'dir' });
      else if (each.isFile()) {
        const info = await stat(this.at(path)).catch(() => null);
        entries.push({ name: each.name, path, kind: 'file', ...(info && { size: info.size, modified: Math.floor(info.mtimeMs) }) });
      }
    }
    return entries;
  }

  async stat(path: string): Promise<Entry | null> {
    try {
      const info = await stat(this.at(path));
      return info.isFile() ? { name: basename(path), path, kind: 'file', size: info.size, modified: Math.floor(info.mtimeMs) } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readText(path: string): Promise<string> {
    return readFile(this.at(path), 'utf8');
  }

  async writeText(path: string, text: string): Promise<void> {
    const full = this.at(path);
    await mkdir(dirOf(full), { recursive: true });
    await writeFile(full, text, 'utf8');
  }

  async readBlob(path: string): Promise<Blob> {
    return new Blob([Uint8Array.from(await readFile(this.at(path)))]);
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    const full = this.at(path);
    await mkdir(dirOf(full), { recursive: true });
    await writeFile(full, Readable.fromWeb(data.stream() as import('node:stream/web').ReadableStream<Uint8Array>));
  }

  /** The parts go to a hidden file beside the target, which takes the target's name once it is complete. */
  async writeBlobInParts(path: string, data: Blob, { onProgress, signal }: PartsOptions = {}): Promise<void> {
    const part = joinPath(dirOf(path), `.${basename(path)}.part`).replace(/\\/g, '/');
    try {
      signal?.throwIfAborted();
      await this.writeBlob(part, data);
      onProgress?.(data.size);
      signal?.throwIfAborted();
      await this.move(part, path);
    } catch (error) {
      await this.remove(part).catch(() => undefined);
      throw error;
    }
  }

  async move(from: string, to: string): Promise<void> {
    const target = this.at(to);
    await mkdir(dirOf(target), { recursive: true });
    await rename(this.at(from), target);
  }

  async remove(path: string): Promise<void> {
    await rm(this.at(path), { recursive: true, force: true });
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(this.at(path), { recursive: true });
  }

  /** A file's bytes as a stream, for what is large. */
  stream(path: string) {
    return createReadStream(this.at(path));
  }
}
