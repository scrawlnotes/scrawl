import { basename, dirname, type Entry, join, type VaultFs } from './fs';
import { serializeTasks, TASK_LIST_EXT } from './tasks';

export const INBOX = 'Inbox';
/** The inbox's own task list, where tasks that belong to no list of their own go. */
export const INBOX_TASKS = `${INBOX}/tasks.json`;
export const ATTACHMENTS = '_attachments';
const APP_DIR = '.scrawl';
const TRASH = `${APP_DIR}/trash`;
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
  return title || 'untitled';
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
  return path === INBOX_TASKS ? 'Tasks' : basename(path).slice(0, -TASK_LIST_EXT.length);
}

/** A file name split into the name the user sees and the extension that says what the file is. */
function splitName(name: string): [string, string] {
  if (name.endsWith(TASK_LIST_EXT)) return [name.slice(0, -TASK_LIST_EXT.length), TASK_LIST_EXT];
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/**
 * A path that no entry of `taken` uses, made by numbering `name` when needed. Case is ignored:
 * on Windows `tasks` and `Tasks` are the same file, and writing one would replace the other.
 */
function freePath(dir: string, name: string, ext: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const path = join(dir, `${name}${n > 1 ? ` ${n}` : ''}${ext}`);
    if (!taken.has(path.toLowerCase())) return path;
  }
}

/** The paths in `dir`, lowercased for `freePath`. */
async function names(fs: VaultFs, dir: string): Promise<Set<string>> {
  const taken = new Set((await fs.list(dir)).map((e) => e.path.toLowerCase()));
  // The inbox's own list is called Tasks, so no other list there may take that name.
  if (dir === INBOX) taken.add(join(INBOX, `Tasks${TASK_LIST_EXT}`).toLowerCase());
  return taken;
}

const cleanName = (name: string) => name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

/** A name typed by the user, ready to be a file name; `ext` is left off when it was typed too. */
function fileName(name: string, ext: string): string {
  const clean = cleanName(name);
  const bare = clean.toLowerCase().endsWith(ext) ? clean.slice(0, -ext.length).trim() : clean;
  if (!bare || isHidden(bare)) throw new Error('That name cannot be used.');
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
  const base = name.trim() ? fileName(name, TASK_LIST_EXT) : 'Tasks';
  const path = freePath(folder, base, TASK_LIST_EXT, await names(fs, folder));
  await fs.writeText(path, serializeTasks([]));
  return path;
}

export async function createFolder(fs: VaultFs, name: string): Promise<string> {
  const clean = cleanName(name);
  if (!clean || isHidden(clean)) throw new Error('That folder name cannot be used.');
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

/** Deleted notes and task lists go to the trash folder instead of being removed. */
export async function trashItem(fs: VaultFs, path: string, now = new Date()): Promise<void> {
  await fs.move(path, join(TRASH, `${stamp(now)} ${basename(path)}`));
}

/**
 * Moves a folder to the trash with everything in it, files the app does not show included, and
 * keeps the folders inside as they were. Files are moved one by one, since not every storage can
 * move a folder.
 */
export async function trashFolder(fs: VaultFs, path: string, now = new Date()): Promise<void> {
  const target = join(TRASH, `${stamp(now)} ${basename(path)}`);
  const moveAll = async (dir: string) => {
    for (const entry of await fs.list(dir)) {
      if (entry.kind === 'dir') await moveAll(entry.path);
      else await fs.move(entry.path, target + entry.path.slice(path.length));
    }
  };
  await moveAll(path);
  await fs.remove(path);
}

/** Stores an image and returns the source to write into a note. */
export async function saveAttachment(fs: VaultFs, file: Blob, now = new Date()): Promise<string> {
  const ext = file.type.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg') || 'bin';
  // No spaces: the path is written into a Markdown image, where a space would end the address.
  const name = stamp(now).replace(' ', '-');
  const taken = await names(fs, ATTACHMENTS);
  let path = join(ATTACHMENTS, `${name}.${ext}`);
  for (let n = 2; taken.has(path.toLowerCase()); n++) path = join(ATTACHMENTS, `${name}-${n}.${ext}`);
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
