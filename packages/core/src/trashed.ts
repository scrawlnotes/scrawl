import { type Board, BOARD_EXT, loadBoard } from './board';
import { type Collection, isCollection, loadCollection, RECORD_EXT } from './collection';
import type { VaultFs } from './fs';
import { KEYS_EXT, parseKeys } from './keys';
import { loadList, TASK_LIST_EXT, type TaskList } from './tasks';
import type { TrashItem } from './vault';

// What a deleted item holds, read where it is in the trash, to be looked at before it is put
// back: a note's text, a list's tasks, a board's cards, a collection's records, what a folder
// holds, an attached image or recording. A keys file shows its keys' names only: its values stay
// in the file until it is restored.

/** Something inside a deleted folder, a step in for each folder it is in. */
export interface TrashedEntry {
  name: string;
  kind: 'folder' | 'note' | 'tasks' | 'board' | 'keys' | 'collection' | 'file';
  depth: number;
}

export type Trashed =
  | { kind: 'note'; text: string }
  | { kind: 'tasks'; list: TaskList }
  | { kind: 'board'; board: Board }
  | { kind: 'keys'; groups: { name: string | null; keys: string[] }[] }
  | { kind: 'collection'; collection: Collection }
  | { kind: 'folder'; entries: TrashedEntry[] }
  /** An image or a recording, read; null for another file, or one that is on the other side. */
  | { kind: 'attachment'; blob: Blob | null };

const SHOWN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|webm|ogg|oga|opus|mp3|m4a|aac|wav|flac)$/i;

const hidden = (name: string) => name.startsWith('.') || name.startsWith('_');

/** What is in a deleted folder, its folders first then its files, each by name; a collection is one thing. */
async function treeOf(fs: VaultFs, dir: string, depth = 0): Promise<TrashedEntry[]> {
  const entries = (await fs.list(dir)).filter((entry) => !hidden(entry.name));
  const folders = entries.filter((entry) => entry.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((entry) => entry.kind === 'file').sort((a, b) => a.name.localeCompare(b.name));
  const out: TrashedEntry[] = [];
  for (const folder of folders) {
    if (isCollection(await fs.list(folder.path))) {
      out.push({ name: folder.name, kind: 'collection', depth });
      continue;
    }
    out.push({ name: folder.name, kind: 'folder', depth });
    out.push(...(await treeOf(fs, folder.path, depth + 1)));
  }
  for (const file of files) {
    const name = file.name;
    const kind = name.endsWith(TASK_LIST_EXT) ? 'tasks' : name.endsWith(BOARD_EXT) ? 'board' : name.endsWith(KEYS_EXT) ? 'keys' : name.endsWith(RECORD_EXT) ? 'note' : 'file';
    out.push({ name, kind, depth });
  }
  return out;
}

/** What a deleted item holds, read in the trash of the space whose files `fs` are, nothing written. */
export async function readTrashed(fs: VaultFs, item: TrashItem): Promise<Trashed> {
  switch (item.kind) {
    case 'note':
      return { kind: 'note', text: await fs.readText(item.path) };
    case 'tasks':
      return { kind: 'tasks', list: await loadList(fs, item.path) };
    case 'board':
      return { kind: 'board', board: await loadBoard(fs, item.path) };
    case 'keys':
      return { kind: 'keys', groups: parseKeys(await fs.readText(item.path)).map((group) => ({ name: group.name, keys: group.keys.map((entry) => entry.key) })) };
    case 'collection':
      // Read only: a record without an id is not given one in the trash.
      return { kind: 'collection', collection: await loadCollection(fs, item.path, undefined, true) };
    case 'folder':
      return { kind: 'folder', entries: await treeOf(fs, item.path) };
    case 'attachment':
      return { kind: 'attachment', blob: !item.away && SHOWN.test(item.title) ? await fs.readBlob(item.path) : null };
  }
}
