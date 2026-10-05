import type { Entry, VaultFs } from '@scrawlnotes/core';
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

  async writeBlob(path: string, data: Blob): Promise<void> {
    await invoke('fs_write_bytes', { root: this.root, path, data: Array.from(new Uint8Array(await data.arrayBuffer())) });
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
