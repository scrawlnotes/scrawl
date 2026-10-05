import { basename, type Entry, join, type VaultFs } from './fs';

export const INBOX = 'Inbox';
export const ATTACHMENTS = '_attachments';
const APP_DIR = '.scrawl';
const TRASH = `${APP_DIR}/trash`;
const WORKSPACE = `${APP_DIR}/workspace.json`;

export interface TreeNode {
  name: string;
  path: string;
  kind: 'note' | 'folder';
  /** A note's display name: its first line. */
  title?: string;
  children?: TreeNode[];
}

/** Which notes are open on this device. Not synced. */
export interface Workspace {
  tabs: string[];
  active: string | null;
}

const isNote = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith('.md');
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

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** A path that no entry of `taken` uses, made by numbering `name` when needed. */
function freePath(dir: string, name: string, ext: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const path = join(dir, `${name}${n > 1 ? ` ${n}` : ''}${ext}`);
    if (!taken.has(path)) return path;
  }
}

async function names(fs: VaultFs, dir: string): Promise<Set<string>> {
  return new Set((await fs.list(dir)).map((e) => e.path));
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

export async function createFolder(fs: VaultFs, name: string): Promise<string> {
  const clean = cleanName(name);
  if (!clean || isHidden(clean)) throw new Error('That folder name cannot be used.');
  await fs.mkdir(clean);
  return clean;
}

/** Moves a note into `folder` and returns its new path. */
export async function moveNote(fs: VaultFs, path: string, folder: string): Promise<string> {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  const target = freePath(folder, name.slice(0, dot), name.slice(dot), await names(fs, folder));
  await fs.move(path, target);
  return target;
}

const cleanName = (name: string) => name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

/** Gives a note a name of the user's choosing, in the folder it is in. Returns its new path. */
export async function renameNote(fs: VaultFs, path: string, name: string): Promise<string> {
  const clean = cleanName(name).replace(/\.md$/i, '');
  if (!clean || isHidden(clean)) throw new Error('That name cannot be used.');
  const folder = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  if (join(folder, `${clean}.md`) === path) return path;
  const target = freePath(folder, clean, '.md', await names(fs, folder));
  await fs.move(path, target);
  return target;
}

/** Deleted notes go to the trash folder instead of being removed. */
export async function trashNote(fs: VaultFs, path: string, now = new Date()): Promise<void> {
  await fs.move(path, join(TRASH, `${stamp(now)} ${basename(path)}`));
}

/** Stores an image and returns the source to write into a note. */
export async function saveAttachment(fs: VaultFs, file: Blob, now = new Date()): Promise<string> {
  const ext = file.type.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg') || 'bin';
  // No spaces: the path is written into a Markdown image, where a space would end the address.
  const name = stamp(now).replace(' ', '-');
  const taken = await names(fs, ATTACHMENTS);
  let path = join(ATTACHMENTS, `${name}.${ext}`);
  for (let n = 2; taken.has(path); n++) path = join(ATTACHMENTS, `${name}-${n}.${ext}`);
  await fs.writeBlob(path, file);
  return path;
}

/** Reads the folders and notes of a vault: the inbox first, then folders, then notes, by name. */
export async function readTree(fs: VaultFs, dir = ''): Promise<TreeNode[]> {
  const entries = (await fs.list(dir)).filter((e) => !isHidden(e.name) && (e.kind === 'dir' || isNote(e)));
  const nodes = await Promise.all(
    entries.map(async (e): Promise<TreeNode> => {
      if (e.kind === 'dir') return { name: e.name, path: e.path, kind: 'folder', children: await readTree(fs, e.path) };
      return { name: e.name, path: e.path, kind: 'note', title: displayTitle(e.path, await fs.readText(e.path)) };
    }),
  );
  const rank = (n: TreeNode) => (n.path === INBOX ? 0 : n.kind === 'folder' ? 1 : 2);
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
