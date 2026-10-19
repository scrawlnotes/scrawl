import { t } from '@scrawlnotes/i18n';
import { BOARD_EXT, type BoardLinks, loadBoard, newBoard, parseBoard, serializeBoard, type Template } from './board';
import { COLLECTION_FILE, type ColumnWidths, collectionName, isCollection, loadSchema, namedById, parseRecord, parseSchema, RECORD_EXT, readWidths, recordTitle, type RecordSort } from './collection';
import { basename, dirname, type Entry, join, type PartsOptions, type VaultFs } from './fs';
import { KEYS_EXT, keyCount, keysName, parseKeys } from './keys';
import { fileNameOf, shownName } from './names';
import { freePath, moveTree, parseStamp, splitName, stamp } from './paths';
import { awayAt, moveAway, readAway, removeAway } from './sync/away';
import { loadTasks, parseList, serializeList, serializeTasks, TASK_LIST_EXT } from './tasks';

/**
 * The personal space's own task list, Inbox, at its top: where a task goes that is given no list,
 * as Todoist's Inbox. Everything else can sit at the top of a space too; there is no inbox folder.
 */
export const INBOX_TASKS = 'Inbox.tasks.json';
export const ATTACHMENTS = '_attachments';
const APP_DIR = '.scrawl';
const TRASH = `${APP_DIR}/trash`;
/** Where each item in the trash was before it was deleted. */
const TRASH_INDEX = `${TRASH}/index.json`;
const WORKSPACE = `${APP_DIR}/workspace.json`;

export interface TreeNode {
  name: string;
  path: string;
  /** A collection is a folder with a schema file in it; its records are not listed, they are its table. */
  kind: 'note' | 'tasks' | 'board' | 'keys' | 'collection' | 'folder';
  /** What a note, a task list, a board, a keys file or a collection is called in the interface. */
  title?: string;
  /** A note with nothing written in it yet, when the tree was read: a phone opens it to be written in. */
  empty?: boolean;
  children?: TreeNode[];
  /** A folder whose items are not read yet, as the app opens: its `children` are empty until they are. */
  reading?: true;
}

/** How a board was last looked at on this device: as columns or as a list, and which phase. */
export interface BoardLook {
  view: 'board' | 'list';
  /** The phase shown: its id, '' for the cards in no phase, or null for every card; unset until one is chosen. */
  phase?: string | null;
  /** In the list, the groups opened or closed against their default (finished ones closed, the rest open), by id. */
  toggled?: string[];
  /** In the list, the long groups shown in full, by id. */
  inFull?: string[];
}

/** How a keys file was last looked at on this device: as a table or as its text. */
export interface KeysLook {
  view: 'table' | 'text';
}

/** How a collection's table was last looked at on this device: the view chosen, and the sort, group, columns and column widths of the plain table. */
export interface CollectionLook {
  /** The saved view chosen, by id; null or unset for the plain table. */
  view?: string | null;
  sort?: RecordSort;
  group?: string | null;
  columns?: string[];
  widths?: ColumnWidths;
}

/** Which notes are open on this device, and how its boards, keys files and collections were looked at. Not synced. */
export interface Workspace {
  tabs: string[];
  active: string | null;
  /** By the path of each board. */
  boards: Record<string, BoardLook>;
  /** By the path of each keys file. */
  keys: Record<string, KeysLook>;
  /** By the path of each collection's folder. */
  collections: Record<string, CollectionLook>;
  /** The onboarding note was closed on this device: it opens by itself no more. */
  welcomeClosed?: boolean;
}

/**
 * The onboarding note, in the personal space: on this device only, never synced (sync/paths.ts),
 * and like everything under `.scrawl` not in the tree, in Search or for an agent.
 */
export const WELCOME_NOTE = `${APP_DIR}/welcome.md`;

/** Whether the onboarding note is there. */
export async function welcomeThere(fs: VaultFs): Promise<boolean> {
  if (fs.stat) return (await fs.stat(WELCOME_NOTE)) !== null;
  try {
    await fs.readText(WELCOME_NOTE);
    return true;
  } catch {
    return false;
  }
}

/** Writes the onboarding note where it is not there yet; one that is there keeps what was written in it. */
export async function ensureWelcome(fs: VaultFs, text: string): Promise<void> {
  if (!(await welcomeThere(fs))) await fs.writeText(WELCOME_NOTE, text);
}

const isNote = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith('.md');
const isTaskList = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith(TASK_LIST_EXT);
const isBoard = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith(BOARD_EXT);
const isKeys = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith(KEYS_EXT);
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
  return SCRATCH_NAME.test(name) ? titleOf(text) : shownName(name.replace(/\.md$/, ''));
}

/** A note that was never given a name, and is shown under its first line. */
export const isScratchNote = (path: string) => SCRATCH_NAME.test(basename(path));

/** What a task list is called: its file name. */
export function listName(path: string): string {
  return shownName(basename(path).slice(0, -TASK_LIST_EXT.length));
}

/** What a board is called: its file name. */
export const boardName = (path: string) => shownName(basename(path).slice(0, -BOARD_EXT.length));

/** Paths of files being written in parts, which no other file may take until they are there. */
const writing = new Set<string>();

/** The paths in `dir`, lowercased for `freePath`. */
async function names(fs: VaultFs, dir: string): Promise<Set<string>> {
  const taken = new Set((await fs.list(dir)).map((e) => e.path.toLowerCase()));
  // A file left on the other side keeps its name, though it is not here.
  if (dir === ATTACHMENTS || dir === TRASH) for (const file of await readAway(fs)) if (dirname(file.path) === dir) taken.add(file.path.toLowerCase());
  return taken;
}

/** A name typed, as a file can be named: what a file name does not take turned into its look-alike (names.ts). */
const cleanName = (name: string) => fileNameOf(name).replace(/\s+/g, ' ').trim();

/** A name typed by the user, ready to be a file name; `ext` is left off when it was typed too. */
function fileName(name: string, ext: string): string {
  const clean = cleanName(name);
  const bare = clean.toLowerCase().endsWith(ext) ? clean.slice(0, -ext.length).trim() : clean;
  if (!bare || isHidden(bare)) throw new Error(t('error.name'));
  return bare;
}

/**
 * Creates an empty note in `folder`, at the top of the space without one. The file is named after
 * the moment it was created, so nothing has to be asked; the note shows under its first line.
 */
export async function createScratchNote(fs: VaultFs, now = new Date(), folder = ''): Promise<string> {
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

/**
 * Creates a board in `folder` from a template, which only sets its start. Without a name it is
 * called Board, numbered when taken; the keys of its cards start with letters from its name. A
 * CRM board's links point at `links`, else at Companies and People in the same folder.
 */
export async function createBoard(fs: VaultFs, folder: string, name: string, template: Template, links?: BoardLinks): Promise<string> {
  const base = name.trim() ? fileName(name, BOARD_EXT) : t('boards.defaultName');
  const path = freePath(folder, base, BOARD_EXT, await names(fs, folder));
  const to = links ?? { company: join(folder, 'Companies'), contact: join(folder, 'People') };
  await fs.writeText(path, serializeBoard(newBoard(boardName(path), template, undefined, to)));
  return path;
}

/** Creates an empty keys file in `folder`. Without a name it is called Keys, numbered when taken. */
export async function createKeys(fs: VaultFs, folder: string, name: string): Promise<string> {
  const base = name.trim() ? fileName(name, KEYS_EXT) : t('keys.defaultName');
  const path = freePath(folder, base, KEYS_EXT, await names(fs, folder));
  await fs.writeText(path, '');
  return path;
}

/** Creates a folder called `name` in `parent`, at the top of the space without one. Returns its path. */
export async function createFolder(fs: VaultFs, name: string, parent = ''): Promise<string> {
  const clean = cleanName(name);
  if (!clean || isHidden(clean)) throw new Error(t('error.folderName'));
  const path = join(parent, clean);
  await fs.mkdir(path);
  return path;
}

/** Moves a note, a task list, a board or a keys file into `folder` and returns its new path. */
export async function moveItem(fs: VaultFs, path: string, folder: string): Promise<string> {
  const [name, ext] = splitName(basename(path));
  const target = freePath(folder, name, ext, await names(fs, folder));
  await fs.move(path, target);
  return target;
}

// ---------- between spaces ----------

/**
 * What a file says about other items of its space, left out as it goes to another space, where
 * the same path would be some other item: a task's note, card and record, a card's or a phase's
 * note. A field keeps the collection it reads, a folder of whichever space it is in.
 */
function withoutLinks(path: string, text: string): string {
  if (path.endsWith(TASK_LIST_EXT)) {
    const list = parseList(text);
    return serializeList({ ...list, tasks: list.tasks.map(({ note: _n, card: _c, record: _r, ...task }) => task) });
  }
  if (path.endsWith(BOARD_EXT)) {
    const board = parseBoard(text);
    return serializeBoard({ ...board, cards: board.cards.map(({ note: _n, ...card }) => card), phases: board.phases.map(({ note: _n, ...phase }) => phase) });
  }
  return text;
}

/** The ways a path of an attached file is written in a note: as it is, and as a link's address has it. */
const writtenAs = (path: string) => [path, path.replace(/[() <>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)];

/**
 * Copies a note, a task list, a board, a keys file or a collection into `folder` of another
 * space, as a move between spaces does before the original goes to its own trash: under a free
 * name there, with the attached files its text links to, and without what it says about items of
 * the space it came from. Returns its path in the other space.
 */
export async function copyToSpace(from: VaultFs, path: string, to: VaultFs, folder: string): Promise<string> {
  const isDir = isCollection(await from.list(path));
  // The files that go, by their path under the item.
  const files: string[] = [];
  const visit = async (dir: string) => {
    for (const entry of await from.list(dir)) {
      if (entry.kind === 'dir') await visit(entry.path);
      else files.push(entry.path);
    }
  };
  if (isDir) await visit(path);
  else files.push(path);
  const texts = new Map<string, string>();
  for (const file of files) if (canLink(file) || file.endsWith(KEYS_EXT)) texts.set(file, await from.readText(file));

  // The attached files the texts link to go along, under a free name where theirs is taken.
  const linked = linkedIn([...texts.values()]);
  const away = (await readAway(from)).filter((file) => dirname(file.path) === ATTACHMENTS && linked.includes(file.path.toLowerCase()));
  if (away.length > 0) throw new AwayFilesError(away.map((file) => file.path));
  const renamed = new Map<string, string>();
  const taken = await names(to, ATTACHMENTS);
  for (const file of await attachedFiles(from)) {
    if (!linked.includes(file.path.toLowerCase())) continue;
    const [name, ext] = splitName(file.name);
    const target = freePath(ATTACHMENTS, name, ext, taken);
    taken.add(target.toLowerCase());
    await to.writeBlob(target, await from.readBlob(file.path));
    if (target !== file.path) renamed.set(file.path, target);
  }
  const relinked = (text: string) => {
    let out = text;
    for (const [was, now] of renamed) {
      const [plain, address] = writtenAs(was);
      const [plainNow, addressNow] = writtenAs(now);
      out = out.split(address!).join(addressNow!).split(plain!).join(plainNow!);
    }
    return out;
  };

  const [name, ext] = isDir ? [basename(path), ''] : splitName(basename(path));
  const target = freePath(folder, name, ext, await names(to, folder));
  for (const file of files) {
    const into = isDir ? join(target, file.slice(path.length + 1)) : target;
    const text = texts.get(file);
    if (text === undefined) await to.writeBlob(into, await from.readBlob(file));
    else await to.writeText(into, relinked(withoutLinks(file, text)));
  }
  if (isDir) await to.mkdir(target);
  return target;
}

/** What is asked needs attached files that are on the other side and not here: they must be brought first. */
export class AwayFilesError extends Error {
  constructor(readonly paths: string[]) {
    super(`Not on this device: ${paths.join(', ')}`);
    this.name = 'AwayFilesError';
  }
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
  // A file left on the other side goes to the trash there, with the next turn of syncing.
  if (await awayAt(fs, path)) await moveAway(fs, path, target);
  else await fs.move(path, target);
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
  /** An attachment is a file that no note linked to any more. */
  kind: 'note' | 'tasks' | 'board' | 'keys' | 'collection' | 'folder' | 'attachment';
  /** What it was called in the interface. */
  title: string;
  /** The path it had, which it is restored to. */
  from: string;
  /** When it was deleted, as an ISO time. */
  deleted: string;
  /** What a folder holds, all the way down. */
  holds?: Holds;
  /** How many tasks a task list has. */
  tasks?: number;
  /** How many cards a board has. */
  cards?: number;
  /** How many keys a keys file has. */
  keys?: number;
  /** How many records a collection has. */
  records?: number;
  /** An attachment's size in bytes. */
  size?: number;
  /** An attachment left on the other side: in the trash there, not here. */
  away?: boolean;
}

/** What a folder holds, all the way down. */
export interface Holds {
  notes: number;
  lists: number;
  boards: number;
  keys: number;
  collections: number;
  folders: number;
}

/** The records of a collection folder: its Markdown files, hidden ones apart. */
const countRecords = (entries: Entry[]) => entries.filter((e) => e.kind === 'file' && e.name.endsWith(RECORD_EXT) && !isHidden(e.name)).length;

async function countTree(fs: VaultFs, dir: string): Promise<Holds> {
  const holds: Holds = { notes: 0, lists: 0, boards: 0, keys: 0, collections: 0, folders: 0 };
  const visit = async (path: string) => {
    for (const entry of await fs.list(path)) {
      if (entry.kind === 'dir') {
        // A collection counts as one thing; its records are not notes.
        if (isCollection(await fs.list(entry.path))) {
          holds.collections++;
          continue;
        }
        holds.folders++;
        await visit(entry.path);
      } else if (entry.name.endsWith(TASK_LIST_EXT)) holds.lists++;
      else if (entry.name.endsWith(BOARD_EXT)) holds.boards++;
      else if (entry.name.endsWith(KEYS_EXT)) holds.keys++;
      else if (entry.name.endsWith('.md')) holds.notes++;
    }
  };
  await visit(dir);
  return holds;
}

/**
 * Lists the trash, the latest deleted first. An item deleted before the trash kept an index has
 * no recorded place; it goes back to the top of the space then.
 */
export async function readTrash(fs: VaultFs): Promise<TrashItem[]> {
  const records = new Map((await readTrashIndex(fs)).map((r) => [r.name, r]));
  const items: TrashItem[] = [];
  for (const entry of await fs.list(TRASH)) {
    if (entry.path === TRASH_INDEX) continue;
    const record = records.get(entry.name);
    if (record?.from.startsWith(`${ATTACHMENTS}/`) && entry.kind === 'file') {
      const title = basename(record.from);
      items.push({ path: entry.path, kind: 'attachment', title, from: record.from, deleted: record.deleted, size: entry.size });
      continue;
    }
    const isFolder = entry.kind === 'dir';
    const isList = !isFolder && entry.name.endsWith(TASK_LIST_EXT);
    const isBoardFile = !isFolder && entry.name.endsWith(BOARD_EXT);
    const isKeysFile = !isFolder && entry.name.endsWith(KEYS_EXT);
    // Anything else was not put there by the app.
    if (!isFolder && !isList && !isBoardFile && !isKeysFile && !entry.name.endsWith('.md')) continue;
    // Trash names start with the moment of deleting: `2026-10-05 143207 Plan.md`.
    const stamped = parseStamp(entry.name);
    const name = record ? basename(record.from) : stamped?.rest.startsWith(' ') ? stamped.rest.slice(1) : entry.name;
    const from = record?.from ?? name;
    const deleted = record?.deleted ?? (stamped?.time ?? new Date(0)).toISOString();
    const item = { path: entry.path, from, deleted };
    const inside = isFolder ? await fs.list(entry.path) : [];
    if (isFolder && isCollection(inside)) items.push({ ...item, kind: 'collection', title: name, records: countRecords(inside) });
    else if (isFolder) items.push({ ...item, kind: 'folder', title: name, holds: await countTree(fs, entry.path) });
    else if (isList) items.push({ ...item, kind: 'tasks', title: listName(name), tasks: (await loadTasks(fs, entry.path)).length });
    else if (isBoardFile) items.push({ ...item, kind: 'board', title: boardName(name), cards: (await loadBoard(fs, entry.path)).cards.length });
    else if (isKeysFile) items.push({ ...item, kind: 'keys', title: keysName(name), keys: keyCount(parseKeys(await fs.readText(entry.path))) });
    else if (namedById(name)) {
      // A record's file is named after its id; it shows by what the record is called, read with its collection's schema while that is there.
      const schema = await loadSchema(fs, dirname(from)).catch(() => parseSchema(''));
      items.push({ ...item, kind: 'note', title: recordTitle(parseRecord(await fs.readText(entry.path), schema, from)) });
    } else {
      // Only a note that was never named shows its first line, so only then is it read.
      const text = SCRATCH_NAME.test(name) ? await fs.readText(entry.path) : '';
      items.push({ ...item, kind: 'note', title: displayTitle(name, text) });
    }
  }
  // Attached files deleted while they were on the other side are in the trash there.
  for (const file of await readAway(fs)) {
    if (dirname(file.path) !== TRASH) continue;
    const record = records.get(basename(file.path));
    if (!record?.from.startsWith(`${ATTACHMENTS}/`)) continue;
    items.push({ path: file.path, kind: 'attachment', title: basename(record.from), from: record.from, deleted: record.deleted, size: file.size, away: true });
  }
  return items.sort((a, b) => b.deleted.localeCompare(a.deleted));
}

/**
 * Puts an item back where it was, numbering its name when that is taken. A note or a folder
 * brings back the attached files it links to that went to the trash meanwhile. Returns the path
 * it got.
 */
export async function restoreFromTrash(fs: VaultFs, item: TrashItem): Promise<string> {
  const folder = dirname(item.from);
  const tree = item.kind === 'folder' || item.kind === 'collection';
  const [name, ext] = tree ? [basename(item.from), ''] : splitName(basename(item.from));
  const target = freePath(folder, name, ext, await names(fs, folder));
  if (tree) {
    await moveTree(fs, item.path, target);
    await fs.remove(item.path);
  } else if (item.away) {
    await moveAway(fs, item.path, target);
  } else {
    await fs.move(item.path, target);
  }
  await forget(fs, basename(item.path));
  if (tree || (item.kind !== 'attachment' && canLink(target))) await restoreAttachments(fs, await textsOf(fs, target));
  return target;
}

/**
 * Deletes an item in the trash for good. What can link to attached files takes with it those
 * that only it linked to, in the trash with it or not. `unsaved` is the text of notes not
 * written yet.
 */
export async function deleteFromTrash(fs: VaultFs, item: TrashItem, unsaved: string[] = []): Promise<void> {
  const tree = item.kind === 'folder' || item.kind === 'collection';
  const texts = tree || (item.kind !== 'attachment' && canLink(item.path)) ? await textsOf(fs, item.path) : [];
  if (item.away) await removeAway(fs, item.path);
  else await fs.remove(item.path);
  await forget(fs, basename(item.path));
  await removeAttachmentsOf(fs, texts, unsaved);
  await removeTrashedFilesOf(fs, texts, unsaved);
}

/** Deletes everything in the trash for good, with the attached files that only its notes linked to. */
export async function emptyTrash(fs: VaultFs, unsaved: string[] = []): Promise<void> {
  const away = (await readAway(fs)).filter((file) => dirname(file.path) === TRASH);
  if ((await fs.list(TRASH)).length === 0 && away.length === 0) return;
  const texts = await textsOf(fs, TRASH);
  await fs.remove(TRASH);
  for (const file of away) await removeAway(fs, file.path);
  await removeAttachmentsOf(fs, texts, unsaved);
}

/** Notes, task lists and boards are what can link to attached files. */
const canLink = (name: string) => name.endsWith('.md') || name.endsWith('.json');

/** The text of every note and task list at `path`: a file, or a folder all the way down. */
async function textsOf(fs: VaultFs, path: string): Promise<string[]> {
  if (canLink(path)) return [await fs.readText(path)];
  const texts: string[] = [];
  const visit = async (dir: string) => {
    for (const entry of await fs.list(dir)) {
      if (entry.path === TRASH_INDEX) continue;
      if (entry.kind === 'dir') {
        // Attachments, the app's own state and other tools' folders link to nothing.
        if (dir === '' && isHidden(entry.name)) continue;
        await visit(entry.path);
      } else if (canLink(entry.name)) texts.push(await fs.readText(entry.path));
    }
  };
  await visit(path);
  return texts;
}

/** Everything that can link to attached files: the notes and task lists in the vault and in its trash. */
const allTexts = async (fs: VaultFs) => [...(await textsOf(fs, '')), ...(await textsOf(fs, TRASH))];

/**
 * Text to look for attachment paths in: lower case, with Markdown's backslash escapes and the
 * percent-encoding of link addresses undone. A file whose path is found in it is linked. A path
 * that is only mentioned keeps a file that could go; that is the safe way to be wrong.
 */
function linkedIn(texts: string[]): string {
  const all = texts.join('\n');
  const decoded = all.replace(/\\([!-/:-@[-`{-~])/g, '$1').replace(/(%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
  return `${all}\n${decoded}`.toLowerCase();
}

/** The attached files in the vault, but not those still being written. */
async function attachedFiles(fs: VaultFs): Promise<Entry[]> {
  return (await fs.list(ATTACHMENTS)).filter(
    (e) => e.kind === 'file' && !isHidden(e.name) && !writing.has(e.path.toLowerCase()),
  );
}

/** The attached files here and those left on the other side, which are the space's too. */
async function everyAttached(fs: VaultFs): Promise<Entry[]> {
  const here = await attachedFiles(fs);
  const known = new Set(here.map((e) => e.path.toLowerCase()));
  const away = (await readAway(fs))
    .filter((file) => dirname(file.path) === ATTACHMENTS && !known.has(file.path.toLowerCase()))
    .map((file): Entry => ({ name: basename(file.path), path: file.path, kind: 'file', size: file.size }));
  return [...here, ...away];
}

/** Moves those of `files` that nothing links to into the trash. Returns their paths. */
async function trashIfUnlinked(fs: VaultFs, files: Entry[], unsaved: () => string[], now: Date): Promise<string[]> {
  if (files.length === 0) return [];
  const texts = await allTexts(fs);
  // Asked only now, after reading the vault, so that an edit made meanwhile counts.
  const linked = linkedIn([...texts, ...unsaved()]);
  const moved: string[] = [];
  for (const file of files) {
    if (linked.includes(file.path.toLowerCase())) continue;
    await trashItem(fs, file.path, now);
    moved.push(file.path);
  }
  return moved;
}

/**
 * Moves a note, a task list, a board, a record or a folder to the trash, and with it the attached
 * files it linked to that nothing outside the trash links to any more: they go with it, and come
 * back with it. A file that nothing ever linked to, put in Files, stays: only deleting what used
 * it takes a file to the trash. `unsaved` gives the text of notes not written yet, asked once
 * the item is in the trash. Returns the paths of the files that went with it.
 */
export async function trashWithFiles(fs: VaultFs, path: string, folder: boolean, unsaved: () => string[] = () => [], now = new Date()): Promise<string[]> {
  const texts = folder || canLink(path) ? await textsOf(fs, path) : [];
  if (folder) await trashFolder(fs, path, now);
  else await trashItem(fs, path, now);
  if (texts.length === 0) return [];
  const gone = linkedIn(texts);
  const files = (await everyAttached(fs)).filter((file) => gone.includes(file.path.toLowerCase()));
  if (files.length === 0) return [];
  // What stays links to them: the notes outside the trash, and those not written yet.
  const linked = linkedIn([...(await textsOf(fs, '')), ...unsaved()]);
  const moved: string[] = [];
  for (const file of files) {
    if (linked.includes(file.path.toLowerCase())) continue;
    await trashItem(fs, file.path, now);
    moved.push(file.path);
  }
  return moved;
}

/**
 * Moves the attached files at `paths`, which a note stopped linking to, into the trash when no
 * other note links to them either. Returns the paths of those moved.
 */
export async function trashUnlinked(
  fs: VaultFs,
  paths: string[],
  unsaved: () => string[] = () => [],
  now = new Date(),
): Promise<string[]> {
  const wanted = new Set(paths.map((path) => path.toLowerCase()));
  const files = (await everyAttached(fs)).filter((file) => wanted.has(file.path.toLowerCase()));
  return trashIfUnlinked(fs, files, unsaved, now);
}

/**
 * Brings back from the trash the attached files that `texts` link to, unless another file of
 * the same name has taken their place. Returns the paths of those that came back.
 */
export async function restoreAttachments(fs: VaultFs, texts: string[]): Promise<string[]> {
  const linked = linkedIn(texts);
  const present = await names(fs, ATTACHMENTS);
  const restored: string[] = [];
  // The latest deleted comes first, so of a file deleted twice its last version comes back.
  for (const item of await readTrash(fs)) {
    const from = item.from.toLowerCase();
    if (item.kind !== 'attachment' || present.has(from) || !linked.includes(from)) continue;
    const path = await restoreFromTrash(fs, item);
    present.add(path.toLowerCase());
    restored.push(path);
  }
  return restored;
}

/** Deletes for good the attached files that `texts` linked to, when nothing else links to them. */
async function removeAttachmentsOf(fs: VaultFs, texts: string[], unsaved: string[]): Promise<void> {
  if (texts.length === 0) return;
  const gone = linkedIn(texts);
  const files = (await everyAttached(fs)).filter((file) => gone.includes(file.path.toLowerCase()));
  if (files.length === 0) return;
  const linked = linkedIn([...(await allTexts(fs)), ...unsaved]);
  const away = new Set((await readAway(fs)).map((file) => file.path.toLowerCase()));
  for (const file of files) {
    if (linked.includes(file.path.toLowerCase())) continue;
    if (away.has(file.path.toLowerCase())) await removeAway(fs, file.path);
    else await fs.remove(file.path);
  }
}

/** Deletes for good the attached files in the trash that `texts` linked to, when nothing else links to them. */
async function removeTrashedFilesOf(fs: VaultFs, texts: string[], unsaved: string[]): Promise<void> {
  if (texts.length === 0) return;
  const gone = linkedIn(texts);
  const trashed = (await readTrash(fs)).filter((item) => item.kind === 'attachment' && gone.includes(item.from.toLowerCase()));
  if (trashed.length === 0) return;
  const linked = linkedIn([...(await allTexts(fs)), ...unsaved]);
  for (const item of trashed) {
    if (linked.includes(item.from.toLowerCase())) continue;
    if (item.away) await removeAway(fs, item.path);
    else await fs.remove(item.path);
    await forget(fs, basename(item.path));
  }
}

/**
 * Takes the first free attachment path that `pick` gives, also free of copies still being
 * written. Nothing awaits between choosing and taking it, so two copies never get the same name.
 */
function reserve(listed: Set<string>, pick: (taken: Set<string>) => string): string {
  const path = pick(new Set([...listed, ...writing]));
  writing.add(path.toLowerCase());
  return path;
}

/** Writes an attachment in parts to a path that `reserve` took, and gives the name back after. */
async function writeAttachment(fs: VaultFs, path: string, file: Blob, options: PartsOptions): Promise<void> {
  try {
    await fs.writeBlobInParts(path, file, options);
  } finally {
    writing.delete(path.toLowerCase());
  }
}

/** Stores an image or a recording and returns the source to write into a note. */
export async function saveAttachment(fs: VaultFs, file: Blob, now = new Date(), options: PartsOptions = {}): Promise<string> {
  // `audio/webm;codecs=opus` is a .webm file.
  const subtype = file.type.split(';')[0]!.split('/')[1]?.trim();
  const ext = subtype?.replace('svg+xml', 'svg').replace('jpeg', 'jpg').replace('mpeg', 'mp3') || 'bin';
  // No spaces: the path is written into a Markdown image, where a space would end the address.
  const name = stamp(now).replace(' ', '-');
  const path = reserve(await names(fs, ATTACHMENTS), (taken) => {
    let free = join(ATTACHMENTS, `${name}.${ext}`);
    for (let n = 2; taken.has(free.toLowerCase()); n++) free = join(ATTACHMENTS, `${name}-${n}.${ext}`);
    return free;
  });
  await writeAttachment(fs, path, file, options);
  return path;
}

/**
 * Stores a file that is not an image under its own name, numbered when the name is taken.
 * Returns its path; written into a link, the path needs `linkAddress` for its spaces.
 */
export async function saveFile(fs: VaultFs, file: File, options: PartsOptions = {}): Promise<string> {
  // An attached file keeps the name it came with, what a file name does not take made a space.
  const [name, ext] = splitName(file.name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'file');
  const path = reserve(await names(fs, ATTACHMENTS), (taken) =>
    freePath(ATTACHMENTS, isHidden(name) ? `file ${name}` : name, ext, taken),
  );
  await writeAttachment(fs, path, file, options);
  return path;
}

/**
 * Reads the folders, task lists, boards, keys files and notes of a vault: task lists first, then
 * boards, then keys files, then collections, then folders, then notes, each by name. With
 * `titles`, a note that did not change since it was kept there is not read again.
 */
export async function readTree(fs: VaultFs, dir = '', titles?: NoteTitles): Promise<TreeNode[]> {
  const fill = async (at: string, listed: Entry[]): Promise<TreeNode[]> => {
    const { nodes, folders } = await readFolder(fs, at, listed, titles);
    await Promise.all(
      folders.map(async (folder) => {
        const node = nodes.find((each) => each.path === folder.path)!;
        node.children = await fill(folder.path, folder.listed ?? (await fs.list(folder.path)));
        delete node.reading;
      }),
    );
    return nodes;
  };
  return fill(dir, await fs.list(dir));
}

/** One folder read: what it holds, and each folder in it, to be read next. */
export interface FolderRead {
  /** In the tree's order; a folder in it is `reading`, its `children` empty. */
  nodes: TreeNode[];
  /** The folders in it, with their entries when they had to be listed to tell them from a collection. */
  folders: { path: string; listed?: Entry[] }[];
  /** How many notes were read from disk for their titles. */
  read: number;
}

/**
 * Reads one folder from its entries as listed: its notes' titles, from `titles` for those that
 * did not change, and the folders in it, to be read next. A collection is told from a folder by
 * its schema file, looked up alone where the files can say whether one file is there; elsewhere
 * the folder is listed, and its entries go with it. The app opens a folder at a time this way;
 * `readTree` reads them all.
 */
export async function readFolder(fs: VaultFs, dir: string, listed: Entry[], titles?: NoteTitles): Promise<FolderRead> {
  const inside = new Map<string, Entry[] | undefined>();
  let read = 0;
  const entries = listed.filter(
    (e) => !isHidden(e.name) && (e.kind === 'dir' || isNote(e) || isTaskList(e) || isBoard(e) || isKeys(e)),
  );
  const nodes = await Promise.all(
    entries.map(async (e): Promise<TreeNode> => {
      if (e.kind === 'dir') {
        const listedHere = fs.stat ? undefined : await fs.list(e.path);
        const collection = listedHere ? isCollection(listedHere) : (await fs.stat!(join(e.path, COLLECTION_FILE))) !== null;
        if (collection) return { name: e.name, path: e.path, kind: 'collection', title: collectionName(e.path) };
        inside.set(e.path, listedHere);
        return { name: e.name, path: e.path, kind: 'folder', children: [], reading: true };
      }
      if (isTaskList(e)) return { name: e.name, path: e.path, kind: 'tasks', title: listName(e.path) };
      if (isBoard(e)) return { name: e.name, path: e.path, kind: 'board', title: boardName(e.path) };
      if (isKeys(e)) return { name: e.name, path: e.path, kind: 'keys', title: keysName(e.path) };
      const kept = titles?.get(e);
      if (kept) return { name: e.name, path: e.path, kind: 'note', title: kept.title, ...(kept.empty && { empty: true }) };
      const text = await fs.readText(e.path);
      read++;
      const title = displayTitle(e.path, text);
      titles?.set(e, title, text.trim() === '');
      return { name: e.name, path: e.path, kind: 'note', title, ...(text.trim() === '' && { empty: true }) };
    }),
  );
  const order: Record<TreeNode['kind'], number> = { tasks: 1, board: 2, keys: 3, collection: 4, folder: 5, note: 6 };
  const rank = (n: TreeNode) => order[n.kind];
  // Names compare without their extension, so that `Board 2` comes after `Board`.
  const plain = (n: TreeNode) => (n.kind === 'folder' || n.kind === 'collection' ? n.name : splitName(n.name)[0]);
  nodes.sort((a, b) => rank(a) - rank(b) || plain(a).localeCompare(plain(b), undefined, { numeric: true }));
  const folders = nodes
    .filter((node) => node.kind === 'folder')
    .map((node) => {
      const listedHere = inside.get(node.path);
      return listedHere ? { path: node.path, listed: listedHere } : { path: node.path };
    });
  return { nodes, folders, read };
}

/** Where a space keeps its notes' titles on this device, so as not to read every note to name it. */
export const NOTE_TITLES = '.scrawl/index/_titles.json';

/** A note's title as it was when its file had this size and this time. */
export interface NoteTitle {
  modified: number;
  size: number;
  title: string;
  empty?: true;
}

/**
 * The notes' titles kept for a space, and those seen as its tree is read now: one whose file
 * has the size and the time it had is named from here, one read anew is kept with them. Only
 * the notes seen are kept again, so that one gone goes from here too.
 */
export class NoteTitles {
  private readonly kept: Map<string, NoteTitle>;
  private readonly seen = new Map<string, NoteTitle>();
  private grew = false;

  constructor(kept: Record<string, NoteTitle> = {}) {
    this.kept = new Map(Object.entries(kept));
  }

  /** The title kept for a note whose file did not change since; null when it has to be read. */
  get(entry: Entry): NoteTitle | null {
    const kept = this.kept.get(entry.path);
    if (!kept || entry.modified === undefined || kept.modified !== entry.modified || kept.size !== entry.size) return null;
    this.seen.set(entry.path, kept);
    return kept;
  }

  /** A note read now, kept with the size and the time of its file. */
  set(entry: Entry, title: string, empty: boolean) {
    if (entry.modified === undefined || entry.size === undefined) return;
    this.seen.set(entry.path, { modified: entry.modified, size: entry.size, title, ...(empty && { empty: true }) });
    this.grew = true;
  }

  /** Whether the titles are to be written again: a note read anew, or one no longer there. */
  get changed(): boolean {
    return this.grew || this.seen.size !== this.kept.size;
  }

  toJSON() {
    return { version: 1, notes: Object.fromEntries(this.seen) };
  }
}

/** The notes' titles a space keeps; none when the file is not there or cannot be read. */
export async function loadNoteTitles(fs: VaultFs): Promise<NoteTitles> {
  try {
    const data = JSON.parse(await fs.readText(NOTE_TITLES)) as { version?: unknown; notes?: unknown };
    if (data.version !== 1 || !data.notes || typeof data.notes !== 'object') return new NoteTitles();
    const notes: Record<string, NoteTitle> = {};
    for (const [path, raw] of Object.entries(data.notes as Record<string, unknown>)) {
      const each = raw as Partial<NoteTitle> | null;
      if (each && typeof each.modified === 'number' && typeof each.size === 'number' && typeof each.title === 'string') {
        notes[path] = { modified: each.modified, size: each.size, title: each.title, ...(each.empty === true && { empty: true }) };
      }
    }
    return new NoteTitles(notes);
  } catch {
    return new NoteTitles();
  }
}

/** Writes the notes' titles after a whole tree was read with them, when they changed. One not written is only read again. */
export async function saveNoteTitles(fs: VaultFs, titles: NoteTitles): Promise<void> {
  if (!titles.changed) return;
  await fs.writeText(NOTE_TITLES, JSON.stringify(titles)).catch(() => undefined);
}

export async function loadWorkspace(fs: VaultFs): Promise<Workspace> {
  try {
    const data = JSON.parse(await fs.readText(WORKSPACE)) as Partial<Workspace>;
    const tabs = Array.isArray(data.tabs) ? data.tabs.filter((t) => typeof t === 'string') : [];
    const boards: Record<string, BoardLook> = {};
    if (data.boards && typeof data.boards === 'object') {
      for (const [path, look] of Object.entries(data.boards as Record<string, unknown>)) {
        if (!look || typeof look !== 'object') continue;
        const { view, phase, toggled, inFull } = look as Partial<BoardLook>;
        const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
        boards[path] = {
          view: view === 'list' ? 'list' : 'board',
          ...((typeof phase === 'string' || phase === null) && { phase }),
          ...(ids(toggled).length > 0 && { toggled: ids(toggled) }),
          ...(ids(inFull).length > 0 && { inFull: ids(inFull) }),
        };
      }
    }
    const keys: Record<string, KeysLook> = {};
    if (data.keys && typeof data.keys === 'object') {
      for (const [path, look] of Object.entries(data.keys as Record<string, unknown>)) {
        if (look && typeof look === 'object') keys[path] = { view: (look as Partial<KeysLook>).view === 'text' ? 'text' : 'table' };
      }
    }
    const collections: Record<string, CollectionLook> = {};
    if (data.collections && typeof data.collections === 'object') {
      for (const [path, look] of Object.entries(data.collections as Record<string, unknown>)) {
        if (!look || typeof look !== 'object') continue;
        const { view, sort, group, columns, widths } = look as Partial<CollectionLook>;
        const read: CollectionLook = {};
        if (typeof view === 'string' || view === null) read.view = view;
        if (sort && typeof sort === 'object' && typeof sort.key === 'string' && (sort.dir === 'asc' || sort.dir === 'desc')) read.sort = { key: sort.key, dir: sort.dir };
        if (typeof group === 'string' || group === null) read.group = group;
        if (Array.isArray(columns)) read.columns = columns.filter((c): c is string => typeof c === 'string');
        const sized = readWidths(widths);
        if (sized) read.widths = sized;
        collections[path] = read;
      }
    }
    return {
      tabs,
      active: typeof data.active === 'string' && tabs.includes(data.active) ? data.active : null,
      boards,
      keys,
      collections,
      ...(data.welcomeClosed === true && { welcomeClosed: true }),
    };
  } catch {
    return { tabs: [], active: null, boards: {}, keys: {}, collections: {} };
  }
}

export async function saveWorkspace(fs: VaultFs, workspace: Workspace): Promise<void> {
  await fs.writeText(WORKSPACE, JSON.stringify(workspace, null, 2));
}
