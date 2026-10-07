import { basename, dirname, type Entry, join, MemoryFs, PART_SIZE, type PartsOptions, type VaultFs } from '@scrawlnotes/core';

/** A file handle that can move itself, which not every browser offers yet. */
interface Movable {
  move(parent: FileSystemDirectoryHandle, name: string): Promise<void>;
}

/** A vault in the browser's origin private file system. */
class OpfsFs implements VaultFs {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let handle = this.root;
    for (const part of path.split('/').filter(Boolean)) handle = await handle.getDirectoryHandle(part, { create });
    return handle;
  }

  private async file(path: string, create: boolean): Promise<FileSystemFileHandle> {
    return (await this.dir(dirname(path), create)).getFileHandle(basename(path), { create });
  }

  async list(dir: string): Promise<Entry[]> {
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await this.dir(dir, false);
    } catch {
      return [];
    }
    const out: Entry[] = [];
    for await (const [name, child] of handle.entries()) {
      const path = join(dir, name);
      if (child.kind === 'directory') {
        out.push({ name, path, kind: 'dir' });
        continue;
      }
      try {
        const file = await (child as FileSystemFileHandle).getFile();
        out.push({ name, path, kind: 'file', size: file.size, modified: file.lastModified });
      } catch {
        // Moved or deleted while the folder was read, by a save or the trash: it is not there any more.
      }
    }
    return out;
  }

  async readBlob(path: string): Promise<Blob> {
    return (await this.file(path, false)).getFile();
  }

  async readText(path: string): Promise<string> {
    return (await this.readBlob(path)).text();
  }

  async writeBlob(path: string, data: Blob | string): Promise<void> {
    const writable = await (await this.file(path, true)).createWritable();
    await writable.write(data);
    await writable.close();
  }

  writeText(path: string, text: string): Promise<void> {
    return this.writeBlob(path, text);
  }

  // The browser keeps what is written aside until `close`, and `abort` drops it.
  async writeBlobInParts(path: string, data: Blob, { onProgress, signal }: PartsOptions = {}): Promise<void> {
    const writable = await (await this.file(path, true)).createWritable();
    try {
      for (let offset = 0; offset < data.size; offset += PART_SIZE) {
        signal?.throwIfAborted();
        await writable.write(data.slice(offset, offset + PART_SIZE));
        onProgress?.(Math.min(offset + PART_SIZE, data.size));
      }
      signal?.throwIfAborted();
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      // Opening the file for writing made it; a copy that did not finish leaves nothing.
      await this.remove(path).catch(() => undefined);
      throw error;
    }
  }

  // Browsers that can move a file move it in place, however large; others copy it and delete the original.
  async move(from: string, to: string): Promise<void> {
    const source: FileSystemFileHandle & Partial<Movable> = await this.file(from, false);
    if (typeof source.move === 'function') {
      await source.move(await this.dir(dirname(to), true), basename(to));
      return;
    }
    await this.writeBlob(to, await source.getFile());
    await this.remove(from);
  }

  async remove(path: string): Promise<void> {
    await (await this.dir(dirname(path), false)).removeEntry(basename(path), { recursive: true });
  }

  async mkdir(path: string): Promise<void> {
    await this.dir(path, true);
  }
}

/** Opens the browser vault, or an in-memory one where persistent storage is not available. */
export async function openBrowserVault(): Promise<VaultFs> {
  try {
    return new OpfsFs(await navigator.storage.getDirectory());
  } catch {
    return new MemoryFs();
  }
}
