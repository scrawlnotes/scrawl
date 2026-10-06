import { basename, dirname, type Entry, join, PART_SIZE, type PartsOptions, type VaultFs } from '@scrawlnotes/core';
import { invoke } from '@tauri-apps/api/core';

/** A vault in a folder on disk, through the commands of the desktop shell. */
export class TauriFs implements VaultFs {
  constructor(private readonly root: string) {}

  list(dir: string): Promise<Entry[]> {
    return invoke('fs_list', { root: this.root, dir });
  }

  async readBlob(path: string): Promise<Blob> {
    return new Blob([await invoke<ArrayBuffer>('fs_read', { root: this.root, path })]);
  }

  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await invoke<ArrayBuffer>('fs_read', { root: this.root, path }));
  }

  writeText(path: string, text: string): Promise<void> {
    return invoke('fs_write_text', { root: this.root, path, text });
  }

  // The bytes go as they are, not as JSON; the paths ride along in headers, which must be ASCII.
  async writeBlob(path: string, data: Blob): Promise<void> {
    await invoke('fs_write_bytes', new Uint8Array(await data.arrayBuffer()), {
      headers: { 'x-root': encodeURIComponent(this.root), 'x-path': encodeURIComponent(path) },
    });
  }

  /** Parts go to a hidden file beside the target, which takes the target's name once it is complete. */
  async writeBlobInParts(path: string, data: Blob, { onProgress, signal }: PartsOptions = {}): Promise<void> {
    const part = join(dirname(path), `.${basename(path)}.part`);
    try {
      let offset = 0;
      do {
        signal?.throwIfAborted();
        const bytes = new Uint8Array(await data.slice(offset, offset + PART_SIZE).arrayBuffer());
        await invoke('fs_write_part', bytes, {
          headers: {
            'x-root': encodeURIComponent(this.root),
            'x-path': encodeURIComponent(part),
            'x-offset': String(offset),
          },
        });
        offset += bytes.length;
        onProgress?.(offset);
      } while (offset < data.size);
      signal?.throwIfAborted();
      await this.move(part, path);
    } catch (error) {
      await this.remove(part).catch(() => undefined);
      throw error;
    }
  }

  move(from: string, to: string): Promise<void> {
    return invoke('fs_move', { root: this.root, from, to });
  }

  remove(path: string): Promise<void> {
    return invoke('fs_remove', { root: this.root, path });
  }

  mkdir(path: string): Promise<void> {
    return invoke('fs_mkdir', { root: this.root, path });
  }
}
