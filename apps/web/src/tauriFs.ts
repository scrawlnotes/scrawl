import { basename, dirname, type Entry, join, PART_SIZE, type PartsOptions, pathKey, type VaultFs } from '@scrawlnotes/core';
import { invoke } from '@tauri-apps/api/core';

/** How long a path this app wrote is its own: the folders' watch (watch.ts) leaves its changes out. */
const OWN_MS = 3000;
/** What this app wrote lately, by folder, by path: when. */
const written = new Map<string, Map<string, number>>();

/** Marks paths this app is writing, moving or deleting, before it does and once it is done. */
function mark(root: string, ...paths: string[]) {
  const now = Date.now();
  let mine = written.get(root);
  if (!mine) written.set(root, (mine = new Map()));
  for (const [key, at] of mine) if (now - at > OWN_MS) mine.delete(key);
  for (const path of paths) mine.set(pathKey(path), now);
}

/** Whether this app itself changed a path of a folder a moment ago: it, or a folder it is in. */
export function wroteLately(root: string, path: string, now = Date.now()): boolean {
  const mine = written.get(root);
  if (!mine) return false;
  for (let at = pathKey(path); at; at = dirname(at)) {
    const when = mine.get(at);
    if (when !== undefined && now - when <= OWN_MS) return true;
  }
  return false;
}

/** Runs what changes paths, marking them before and after. */
async function marking<T>(root: string, paths: string[], run: () => Promise<T>): Promise<T> {
  mark(root, ...paths);
  try {
    return await run();
  } finally {
    mark(root, ...paths);
  }
}

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
    return marking(this.root, [path], () => invoke('fs_write_text', { root: this.root, path, text }));
  }

  // The bytes go as they are, not as JSON; the paths ride along in headers, which must be ASCII.
  async writeBlob(path: string, data: Blob): Promise<void> {
    const bytes = new Uint8Array(await data.arrayBuffer());
    await marking(this.root, [path], () =>
      invoke('fs_write_bytes', bytes, {
        headers: { 'x-root': encodeURIComponent(this.root), 'x-path': encodeURIComponent(path) },
      }),
    );
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
    return marking(this.root, [from, to], () => invoke('fs_move', { root: this.root, from, to }));
  }

  remove(path: string): Promise<void> {
    return marking(this.root, [path], () => invoke('fs_remove', { root: this.root, path }));
  }

  mkdir(path: string): Promise<void> {
    return marking(this.root, [path], () => invoke('fs_mkdir', { root: this.root, path }));
  }

  stat(path: string): Promise<Entry | null> {
    return invoke('fs_stat', { root: this.root, path });
  }
}
