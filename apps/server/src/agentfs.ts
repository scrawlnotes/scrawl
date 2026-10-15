import { readFileSync, rmSync } from 'node:fs';
import { basename, type Entry, type PartsOptions, type VaultFs } from '@scrawlnotes/core';
import type { Blobs } from './blobs';
import { type Actor, Conflict, type SpaceFiles } from './files';

// A space's files on the server as the agent's tools read and write them: the VaultFs the core
// works on, over the same SpaceFiles store the sync engine fills. Every write is a write of the
// store, with the actor, so it is versioned, numbered and told to the live channel like any
// other. See design/agent.md, 7.1.

export class ServerFs implements VaultFs {
  constructor(
    private readonly files: SpaceFiles,
    private readonly blobs: Blobs,
    private readonly space: string,
    private readonly by: Actor,
    private readonly maxBytes: number,
  ) {}

  async list(dir: string): Promise<Entry[]> {
    return this.files.listDir(this.space, dir).map((e) => ({
      name: basename(e.path),
      path: e.path,
      kind: e.kind,
      ...(e.kind === 'file' && { size: e.size, modified: e.at }),
    }));
  }

  async stat(path: string): Promise<Entry | null> {
    const entry = this.files.at(this.space, path);
    if (!entry) return null;
    return { name: basename(entry.path), path: entry.path, kind: entry.kind, ...(entry.kind === 'file' && { size: entry.size }) };
  }

  async readText(path: string): Promise<string> {
    return this.bytesOf(path).toString('utf8');
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.put(path, new Blob([text]));
  }

  async readBlob(path: string): Promise<Blob> {
    return new Blob([Uint8Array.from(this.bytesOf(path))]);
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    await this.put(path, data);
  }

  async writeBlobInParts(path: string, data: Blob, options: PartsOptions = {}): Promise<void> {
    options.signal?.throwIfAborted();
    await this.put(path, data);
    options.onProgress?.(data.size);
  }

  async move(from: string, to: string): Promise<void> {
    const file = this.files.file(this.space, from);
    if (!file) throw new Error(`No file at ${from}`);
    this.files.move(this.space, from, to, file.hash, this.by);
  }

  async remove(path: string): Promise<void> {
    const entry = this.files.at(this.space, path);
    if (!entry) return;
    this.files.remove(this.space, path, entry.kind === 'file' ? entry.hash : null, this.by);
  }

  async mkdir(path: string): Promise<void> {
    if (path) this.files.mkdir(this.space, path, this.by);
  }

  private bytesOf(path: string): Buffer {
    const file = this.files.file(this.space, path);
    if (!file) throw new Error(`No file at ${path}`);
    return readFileSync(this.blobs.pathOf(file.hash));
  }

  /**
   * Writes a file while it is as it was just read. Someone writing it in between makes the
   * store refuse; then it is read again and written once more, as the design says: the tools
   * have read, changed and now write a whole file, and the later of two whole writes stands.
   */
  private async put(path: string, data: Blob): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const taken = await this.blobs.take(data.stream(), this.maxBytes);
      try {
        this.files.write(this.space, path, taken, this.files.file(this.space, path)?.hash ?? null, this.by);
        return;
      } catch (error) {
        if (!(error instanceof Conflict) || attempt > 0) throw error;
      } finally {
        rmSync(taken.temp, { force: true });
      }
    }
  }
}
