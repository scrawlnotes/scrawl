import { basename, dirname, type Entry, join, MemoryFs, PART_SIZE, type PartsOptions, type VaultFs } from '@scrawlnotes/core';

/** A file handle that can move itself, which not every browser offers yet. */
interface Movable {
  move(parent: FileSystemDirectoryHandle, name: string): Promise<void>;
}

/** Files up to this size are read whole when asked for; larger ones as they are used. */
const READ_AT_ONCE = 8 * 1024 * 1024;
const READ_TRIES = 5;

/** Whether a read failed because the file changed after it was looked up: written, or put in place anew by a write. */
const changedMeanwhile = (error: unknown) =>
  error instanceof DOMException && (error.name === 'InvalidStateError' || error.name === 'NotReadableError' || error.name === 'NotFoundError');

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
    const children: [string, FileSystemHandle][] = [];
    for await (const child of handle.entries()) children.push(child);
    // Every file's size and time are asked for at once: one after another, a folder of a thousand
    // files takes several times as long.
    const out = await Promise.all(
      children.map(async ([name, child]): Promise<Entry | null> => {
        const path = join(dir, name);
        if (child.kind === 'directory') return { name, path, kind: 'dir' };
        try {
          const file = await (child as FileSystemFileHandle).getFile();
          return { name, path, kind: 'file', size: file.size, modified: file.lastModified };
        } catch (error) {
          // Moved or deleted while the folder was read, by the trash: it is not there any more. Being
          // written at that moment, by a save, it is still there, only its size is not known.
          return error instanceof DOMException && error.name === 'NotFoundError' ? null : { name, path, kind: 'file' };
        }
      }),
    );
    return out.filter((entry): entry is Entry => entry !== null);
  }

  /**
   * A file as it is now. The browser refuses to read a file that was written after it was looked
   * up (by this tab, or by the app open in another one), so a file is read at once, and looked
   * up again when it changed meanwhile. A large one is left to be read as it is used.
   */
  async readBlob(path: string): Promise<Blob> {
    for (let attempt = 1; ; attempt++) {
      // A file that is not there is not looked for again.
      const handle = await this.file(path, false);
      try {
        const file = await handle.getFile();
        if (file.size > READ_AT_ONCE) return file;
        return new Blob([await file.arrayBuffer()], { type: file.type });
      } catch (error) {
        if (attempt >= READ_TRIES || !changedMeanwhile(error)) throw error;
        // A write may still be going on: given a moment to end.
        await new Promise((resolve) => setTimeout(resolve, attempt * 15));
      }
    }
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

  async stat(path: string): Promise<Entry | null> {
    try {
      const file = await (await this.file(path, false)).getFile();
      return { name: basename(path), path, kind: 'file', size: file.size, modified: file.lastModified };
    } catch {
      return null;
    }
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

/** The files of a space beside the personal one, in a folder of the browser's storage; made if it is not there. */
export async function openBrowserVaultAt(dir: string): Promise<VaultFs> {
  try {
    let handle = await navigator.storage.getDirectory();
    for (const part of dir.split('/').filter(Boolean)) handle = await handle.getDirectoryHandle(part, { create: true });
    return new OpfsFs(handle);
  } catch {
    return new MemoryFs();
  }
}

/** Deletes a space's folder of the browser's storage with everything in it. */
export async function removeBrowserVaultAt(dir: string): Promise<void> {
  const parts = dir.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) return;
  let handle = await navigator.storage.getDirectory();
  for (const part of parts) handle = await handle.getDirectoryHandle(part, { create: true });
  await handle.removeEntry(name, { recursive: true }).catch(() => undefined);
}
