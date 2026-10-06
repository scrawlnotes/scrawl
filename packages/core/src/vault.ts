import { t } from '@scrawlnotes/i18n';
import { basename, dirname, type Entry, join, type VaultFs } from './fs';
import { freePath, moveTree, parseStamp, splitName, stamp } from './paths';
import { loadTasks, serializeTasks, TASK_LIST_EXT } from './tasks';

export const INBOX = 'Inbox';
/** The inbox's own task list, where tasks that belong to no list of their own go. */
export const INBOX_TASKS = `${INBOX}/tasks.json`;
export const ATTACHMENTS = '_attachments';
const APP_DIR = '.scrawl';
const TRASH = `${APP_DIR}/trash`;
/** Where each item in the trash was before it was deleted. */
const TRASH_INDEX = `${TRASH}/index.json`;
const WORKSPACE = `${APP_DIR}/workspace.json`;

export interface TreeNode {
  name: string;
  path: string;
  kind: 'note' | 'tasks' | 'folder';
  /** What a note or a task list is called in the interface. */
  title?: string;
  children?: TreeNode[];
}

/** Which notes are open on this device. Not synced. */
export interface Workspace {
  tabs: string[];
  active: string | null;
}

const isNote = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith('.md');
const isTaskList = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith(TASK_LIST_EXT);
// Dot and underscore names hold app state and attachments, not notes.
const isHidden = (name: string) => name.startsWith('.') || name.startsWith('_');

/**
 * A note is named after its first line of text, like an unsaved editor tab. Markdown syntax
 * is left out of the name.
 */
export function titleOf(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '') ?? '';
  const title = line
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // A backslash-escaped character is literal text; keep it out of the mark stripping below.
    .replace(/\\([!-/:-@[-`{-~])|\*\*|__|~~|[*_`]/g, '$1')
    .trim();
  return title || t('note.untitled');
}

// Names given by `createScratchNote`: a note that has not been named by the user yet.
const SCRATCH_NAME = /^\d{4}-\d{2}-\d{2} \d{6}( \d+)?\.md$/;

/**
 * What a note is called in the interface. A note the user has not named shows its first line,
 * like an unsaved editor tab; a named note shows its file name.
 */
export function displayTitle(path: string, text: string): string {
  const name = basename(path);
  return SCRATCH_NAME.test(name) ? titleOf(text) : name.replace(/\.md$/, '');
}

/** A note that was never given a name, and is shown under its first line. */
export const isScratchNote = (path: string) => SCRATCH_NAME.test(basename(path));

/** What a task list is called: its file name, or Tasks for the inbox's own list. */
export function listName(path: string): string {
  return path === INBOX_TASKS ? t('tasks.defaultList') : basename(path).slice(0, -TASK_LIST_EXT.length);
}

/** The paths in `dir`, lowercased for `freePath`. */
async function names(fs: VaultFs, dir: string): Promise<Set<string>> {
  const taken = new Set((await fs.list(dir)).map((e) => e.path.toLowerCase()));
  // The inbox's own list is called Tasks, so no other list there may take that name.
  if (dir === INBOX) taken.add(join(INBOX, `${t('tasks.defaultList')}${TASK_LIST_EXT}`).toLowerCase());
  return taken;
}

const cleanName = (name: string) => name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

/** A name typed by the user, ready to be a file name; `ext` is left off when it was typed too. */
function fileName(name: string, ext: string): string {
  const clean = cleanName(name);
  const bare = clean.toLowerCase().endsWith(ext) ? clean.slice(0, -ext.length).trim() : clean;
  if (!bare || isHidden(bare)) throw new Error(t('error.name'));
  return bare;
}

/**
 * Creates an empty note in the inbox. The file is named after the moment it was created, so
 * nothing has to be asked; the note shows under its first line.
 */
export async function createScratchNote(fs: VaultFs, now = new Date(), folder = INBOX): Promise<string> {
  const path = freePath(folder, stamp(now), '.md', await names(fs, folder));
  await fs.writeText(path, '');
  return path;
}

/** Creates an empty note named `name` in `folder`; without a name it is a scratch note. */
export async function createNote(fs: VaultFs, folder: string, name: string, now = new Date()): Promise<string> {
  if (!name.trim()) return createScratchNote(fs, now, folder);
  const path = freePath(folder, fileName(name, '.md'), '.md', await names(fs, folder));
  await fs.writeText(path, '');
  return path;
}

/** Creates an empty task list in `folder`. Without a name it is called Tasks, numbered when taken. */
export async function createTaskList(fs: VaultFs, folder: string, name: string): Promise<string> {
  const base = name.trim() ? fileName(name, TASK_LIST_EXT) : t('tasks.defaultList');
  const path = freePath(folder, base, TASK_LIST_EXT, await names(fs, folder));
  await fs.writeText(path, serializeTasks([]));
  return path;
}

export async function createFolder(fs: VaultFs, name: string): Promise<string> {
  const clean = cleanName(name);
  if (!clean || isHidden(clean)) throw new Error(t('error.folderName'));
  await fs.mkdir(clean);
  return clean;
}

/** Moves a note or a task list into `folder` and returns its new path. */
export async function moveItem(fs: VaultFs, path: string, folder: string): Promise<string> {
  const [name, ext] = splitName(basename(path));
  const target = freePath(folder, name, ext, await names(fs, folder));
  await fs.move(path, target);
  return target;
}

/** Gives a note or a task list a name of the user's choosing, in the folder it is in. Returns its new path. */
export async function renameItem(fs: VaultFs, path: string, name: string): Promise<string> {
  const ext = splitName(basename(path))[1];
  const clean = fileName(name, ext);
  const folder = dirname(path);
  if (join(folder, `${clean}${ext}`) === path) return path;
  const taken = await names(fs, folder);
  // Changing only the case of a name renames the file onto itself, which is not a clash.
  taken.delete(path.toLowerCase());
  const target = freePath(folder, clean, ext, taken);
  await fs.move(path, target);
  return target;
}

/** Where an item in the trash came from, kept in the trash index. */
interface TrashRecord {
  /** Its name in the trash folder. */
  name: string;
  /** The path it had. */
  from: string;
  /** When it was deleted, as an ISO time. */
  deleted: string;
}

async function readTrashIndex(fs: VaultFs): Promise<TrashRecord[]> {
  try {
    const items = (JSON.parse(await fs.readText(TRASH_INDEX)) as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items.filter(
      (r): r is TrashRecord =>
        typeof r?.name === 'string' && typeof r.from === 'string' && typeof r.deleted === 'string',
    );
  } catch {
    return [];
  }
}

async function changeTrashIndex(fs: VaultFs, change: (records: TrashRecord[]) => TrashRecord[]): Promise<void> {
  const records = change(await readTrashIndex(fs));
  await fs.writeText(TRASH_INDEX, `${JSON.stringify({ version: 1, items: records }, null, 2)}\n`);
}

const forget = (fs: VaultFs, name: string) => changeTrashIndex(fs, (records) => records.filter((r) => r.name !== name));

/** A free path in the trash, named after the moment of deleting so that deleting twice never clashes. */
async function trashPath(fs: VaultFs, name: string, ext: string, now: Date): Promise<string> {
  return freePath(TRASH, `${stamp(now)} ${name}`, ext, await names(fs, TRASH));
}

/** Deleted notes and task lists go to the trash instead of being removed, and the trash remembers where they were. */
export async function trashItem(fs: VaultFs, path: string, now = new Date()): Promise<void> {
  const [name, ext] = splitName(basename(path));
  const target = await trashPath(fs, name, ext, now);
  await fs.move(path, target);
  await changeTrashIndex(fs, (records) => [...records, { name: basename(target), from: path, deleted: now.toISOString() }]);
}

/** Moves a folder to the trash with everything in it, files the app does not show included. */
export async function trashFolder(fs: VaultFs, path: string, now = new Date()): Promise<void> {
  const target = await trashPath(fs, basename(path), '', now);
  await moveTree(fs, path, target);
  await fs.remove(path);
  await changeTrashIndex(fs, (records) => [...records, { name: basename(target), from: path, deleted: now.toISOString() }]);
}

/** Something in the trash, as the trash screen shows it. */
export interface TrashItem {
  /** Where it is in the trash. */
  path: string;
  kind: 'note' | 'tasks' | 'folder';
  /** What it was called in the interface. */
  title: string;
  /** The path it had, which it is restored to. */
  from: string;
  /** When it was deleted, as an ISO time. */
  deleted: string;
  /** What a folder holds, all the way down. */
  holds?: { notes: number; lists: number; folders: number };
  /** How many tasks a task list has. */
  tasks?: number;
}

async function countTree(fs: VaultFs, dir: string): Promise<{ notes: number; lists: number; folders: number }> {
  const holds = { notes: 0, lists: 0, folders: 0 };
  const visit = async (path: string) => {
    for (const entry of await fs.list(path)) {
      if (entry.kind === 'dir') {
        holds.folders++;
        await visit(entry.path);
      } else if (entry.name.endsWith(TASK_LIST_EXT)) holds.lists++;
      else if (entry.name.endsWith('.md')) holds.notes++;
    }
  };
  await visit(dir);
  return holds;
}

/**
 * Lists the trash, the latest deleted first. An item deleted before the trash kept an index has
 * no recorded place; a note or a list goes back to the inbox then, a folder to the top level.
 */
export async function readTrash(fs: VaultFs): Promise<TrashItem[]> {
  const records = new Map((await readTrashIndex(fs)).map((r) => [r.name, r]));
  const items: TrashItem[] = [];
  for (const entry of await fs.list(TRASH)) {
    if (entry.path === TRASH_INDEX) continue;
    const isFolder = entry.kind === 'dir';
    const isList = !isFolder && entry.name.endsWith(TASK_LIST_EXT);
    // Anything else was not put there by the app.
    if (!isFolder && !isList && !entry.name.endsWith('.md')) continue;
    const record = records.get(entry.name);
    // Trash names start with the moment of deleting: `2026-10-05 143207 Plan.md`.
    const stamped = parseStamp(entry.name);
    const name = record ? basename(record.from) : stamped?.rest.startsWith(' ') ? stamped.rest.slice(1) : entry.name;
    const from = record?.from ?? (isFolder ? name : join(INBOX, name));
    const deleted = record?.deleted ?? (stamped?.time ?? new Date(0)).toISOString();
    const item = { path: entry.path, from, deleted };
    if (isFolder) items.push({ ...item, kind: 'folder', title: name, holds: await countTree(fs, entry.path) });
    else if (isList) items.push({ ...item, kind: 'tasks', title: listName(name), tasks: (await loadTasks(fs, entry.path)).length });
    else {
      // Only a note that was never named shows its first line, so only then is it read.
      const text = SCRATCH_NAME.test(name) ? await fs.readText(entry.path) : '';
      items.push({ ...item, kind: 'note', title: displayTitle(name, text) });
    }
  }
  return items.sort((a, b) => b.deleted.localeCompare(a.deleted));
}

/** Puts an item back where it was, numbering its name when that is taken. Returns the path it got. */
export async function restoreFromTrash(fs: VaultFs, item: TrashItem): Promise<string> {
  const folder = dirname(item.from);
  const [name, ext] = item.kind === 'folder' ? [basename(item.from), ''] : splitName(basename(item.from));
  const target = freePath(folder, name, ext, await names(fs, folder));
  if (item.kind === 'folder') {
    await moveTree(fs, item.path, target);
    await fs.remove(item.path);
  } else {
    await fs.move(item.path, target);
  }
  await forget(fs, basename(item.path));
  return target;
}

/** Deletes an item in the trash for good. */
export async function deleteFromTrash(fs: VaultFs, item: TrashItem): Promise<void> {
  await fs.remove(item.path);
  await forget(fs, basename(item.path));
}

/** Deletes everything in the trash for good. */
export async function emptyTrash(fs: VaultFs): Promise<void> {
  if ((await fs.list(TRASH)).length > 0) await fs.remove(TRASH);
}

/** Stores an image and returns the source to write into a note. */
export async function saveAttachment(fs: VaultFs, file: Blob, now = new Date()): Promise<string> {
  // `audio/webm;codecs=opus` is a .webm file.
  const subtype = file.type.split(';')[0]!.split('/')[1]?.trim();
  const ext = subtype?.replace('svg+xml', 'svg').replace('jpeg', 'jpg').replace('mpeg', 'mp3') || 'bin';
  // No spaces: the path is written into a Markdown image, where a space would end the address.
  const name = stamp(now).replace(' ', '-');
  const taken = await names(fs, ATTACHMENTS);
  let path = join(ATTACHMENTS, `${name}.${ext}`);
  for (let n = 2; taken.has(path.toLowerCase()); n++) path = join(ATTACHMENTS, `${name}-${n}.${ext}`);
  await fs.writeBlob(path, file);
  return path;
}

/**
 * Stores a file that is not an image under its own name, numbered when the name is taken.
 * Returns its path; written into a link, the path needs `linkAddress` for its spaces.
 */
export async function saveFile(fs: VaultFs, file: File): Promise<string> {
  const [name, ext] = splitName(cleanName(file.name) || 'file');
  const path = freePath(ATTACHMENTS, isHidden(name) ? `file ${name}` : name, ext, await names(fs, ATTACHMENTS));
  await fs.writeBlob(path, file);
  return path;
}

/**
 * Reads the folders, task lists and notes of a vault: the inbox first, then task lists, then
 * folders, then notes, each by name.
 */
export async function readTree(fs: VaultFs, dir = ''): Promise<TreeNode[]> {
  const entries = (await fs.list(dir)).filter(
    (e) => !isHidden(e.name) && (e.kind === 'dir' || isNote(e) || isTaskList(e)),
  );
  const nodes = await Promise.all(
    entries.map(async (e): Promise<TreeNode> => {
      if (e.kind === 'dir') return { name: e.name, path: e.path, kind: 'folder', children: await readTree(fs, e.path) };
      if (isTaskList(e)) return { name: e.name, path: e.path, kind: 'tasks', title: listName(e.path) };
      return { name: e.name, path: e.path, kind: 'note', title: displayTitle(e.path, await fs.readText(e.path)) };
    }),
  );
  const rank = (n: TreeNode) => (n.path === INBOX ? 0 : n.kind === 'tasks' ? 1 : n.kind === 'folder' ? 2 : 3);
  return nodes.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function loadWorkspace(fs: VaultFs): Promise<Workspace> {
  try {
    const data = JSON.parse(await fs.readText(WORKSPACE)) as Partial<Workspace>;
    const tabs = Array.isArray(data.tabs) ? data.tabs.filter((t) => typeof t === 'string') : [];
    return { tabs, active: typeof data.active === 'string' && tabs.includes(data.active) ? data.active : null };
  } catch {
    return { tabs: [], active: null };
  }
}

export async function saveWorkspace(fs: VaultFs, workspace: Workspace): Promise<void> {
  await fs.writeText(WORKSPACE, JSON.stringify(workspace, null, 2));
}
