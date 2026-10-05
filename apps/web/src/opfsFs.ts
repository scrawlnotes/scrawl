import { basename, dirname, type Entry, join, MemoryFs, type VaultFs } from '@scrawlnotes/core';

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
      out.push({ name, path: join(dir, name), kind: child.kind === 'directory' ? 'dir' : 'file' });
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

  async move(from: string, to: string): Promise<void> {
    await this.writeBlob(to, await this.readBlob(from));
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
