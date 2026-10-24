import type { VaultFs } from './fs';
import { freePath, parseStamp, stamp } from './paths';
import type { TreeNode } from './vault';

// Quick notes (design/quick-notes.md): a few lines each, seen at a glance as cards, as in Keep.
// They are notes in a folder of the personal space that the tree leaves out, each named after the
// moment it was made, its title its first line as a heading. Their order and the pinned ones are
// the person's, in `.scrawl/quick-notes.json`, synced to their devices.

/** The folder at the top of the personal space that holds the quick notes. */
export const QUICK_NOTES = 'Quick notes';
export const QUICK_NOTES_FILE = '.scrawl/quick-notes.json';

/** How the quick notes are put in order: by hand, the newest first (Keep's Custom), or by when they were made or last changed. */
export type QuickSort = 'custom' | 'created' | 'modified';

export interface QuickOrder {
  /** The notes by file name in the order they were dragged into; a newer one comes first. */
  order: string[];
  /** The pinned notes by file name. */
  pinned: string[];
}

/** Whether a path of the personal space is a quick note. */
export const isQuickNote = (path: string) => path.startsWith(`${QUICK_NOTES}/`) && path.endsWith('.md') && !path.slice(QUICK_NOTES.length + 1).includes('/');

const unescaped = (text: string) => text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
/** A title as its line holds it: what Markdown would read gets a backslash, as the editor writes typed text. */
const escaped = (text: string) => text.replace(/[\\`*_~[\]<>]/g, '\\$&');

const TITLE = /^# (.*)$/;

/** A quick note's file as its title and its body: the title is a first line that is a heading. */
export function splitQuickNote(text: string): { title: string; body: string } {
  const end = text.indexOf('\n');
  const first = end < 0 ? text : text.slice(0, end);
  const title = TITLE.exec(first);
  if (!title) return { title: '', body: text };
  // One empty line stands between the title and the body.
  const rest = end < 0 ? '' : text.slice(end + 1);
  return { title: unescaped(title[1]!).trim(), body: rest.startsWith('\n') ? rest.slice(1) : rest };
}

/** A quick note's file from its title and its body; without a title it is the body alone. */
export function joinQuickNote(title: string, body: string): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (!clean) return body;
  return `# ${escaped(clean)}${body ? `\n\n${body}` : ''}`;
}

const names = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter((each): each is string => typeof each === 'string' && each !== ''))] : []);

export function parseQuickOrder(text: string): QuickOrder {
  let data: { order?: unknown; pinned?: unknown } | null;
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return { order: [], pinned: [] };
  }
  return { order: names(data?.order), pinned: names(data?.pinned) };
}

export const serializeQuickOrder = (order: QuickOrder) => `${JSON.stringify({ version: 1, order: order.order, pinned: order.pinned }, null, 2)}\n`;

/** The quick notes' order and pins; none when there is no file yet. */
export async function loadQuickOrder(fs: VaultFs): Promise<QuickOrder> {
  try {
    return parseQuickOrder(await fs.readText(QUICK_NOTES_FILE));
  } catch {
    return { order: [], pinned: [] };
  }
}

export const saveQuickOrder = (fs: VaultFs, order: QuickOrder) => fs.writeText(QUICK_NOTES_FILE, serializeQuickOrder(order));

/**
 * A new quick note's path, named after the moment: `Quick notes/2026-10-24 192301.md`. `taken`
 * holds paths given out and not written yet, lowercased.
 */
export async function quickNotePath(fs: VaultFs, now = new Date(), taken: ReadonlySet<string> = new Set()): Promise<string> {
  const there = (await fs.list(QUICK_NOTES).catch(() => [])).map((entry) => entry.path.toLowerCase());
  return freePath(QUICK_NOTES, stamp(now), '.md', new Set([...there, ...taken]));
}

/**
 * The personal space's tree without its quick notes, and the quick notes. The folder goes from the
 * tree; something else kept in it, a list or a folder, stays there in it.
 */
export function splitQuickTree(tree: TreeNode[]): { tree: TreeNode[]; notes: TreeNode[] } {
  const folder = tree.find((node) => node.kind === 'folder' && node.path === QUICK_NOTES);
  if (!folder) return { tree, notes: [] };
  const children = folder.children ?? [];
  const notes = children.filter((node) => node.kind === 'note');
  const rest = children.filter((node) => node.kind !== 'note');
  return {
    tree: rest.length > 0 ? tree.map((node) => (node === folder ? { ...folder, children: rest } : node)) : tree.filter((node) => node !== folder),
    notes,
  };
}

export interface QuickTimes {
  /** When a note was made, by its path; a note not known is as old as its name says. */
  created?: (path: string) => number | undefined;
  /** When a note was last written, by its path. */
  modified?: (path: string) => number | undefined;
}

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * The quick notes in the order they show, by path: the pinned ones, then the others, each in
 * `sort`'s order. By hand, a note not in the order yet (made on another device, or by an agent)
 * comes first, the newest of them first: a note's name is the moment it was made.
 */
export function orderQuickNotes(paths: string[], order: QuickOrder, sort: QuickSort, times: QuickTimes = {}): { pinned: string[]; others: string[] } {
  // A note whose time is not known is as old as its name says; one not named so, the oldest.
  const named = (path: string) => parseStamp(nameOf(path))?.time.getTime() ?? 0;
  const newest = (time?: (path: string) => number | undefined) => (a: string, b: string) => {
    const [ta, tb] = [time?.(a) ?? named(a), time?.(b) ?? named(b)];
    return ta !== tb ? tb - ta : nameOf(b).localeCompare(nameOf(a));
  };
  let sorted: string[];
  if (sort === 'custom') {
    const place = new Map(order.order.map((name, index) => [name, index]));
    const unplaced = paths.filter((path) => !place.has(nameOf(path))).sort(newest(times.created));
    const placed = paths.filter((path) => place.has(nameOf(path))).sort((a, b) => place.get(nameOf(a))! - place.get(nameOf(b))!);
    sorted = [...unplaced, ...placed];
  } else sorted = [...paths].sort(newest(sort === 'created' ? times.created : times.modified));
  const pinned = new Set(order.pinned);
  return { pinned: sorted.filter((path) => pinned.has(nameOf(path))), others: sorted.filter((path) => !pinned.has(nameOf(path))) };
}

/** The order by hand as the notes show now, after one was dragged: all of them, pinned ones first; those gone are left out. */
export const placeQuickNotes = (order: QuickOrder, shown: string[]): QuickOrder => ({ order: shown.map(nameOf), pinned: order.pinned });

/**
 * The order and the pins from three versions: the order of the side that reordered it, as a
 * list's; a note taken out of either on one side, as one moved away or unpinned, is out.
 */
export function mergeQuickOrders(base: QuickOrder, local: QuickOrder, remote: QuickOrder, mergeOrder: (base: string[], local: string[], remote: string[]) => string[]): QuickOrder {
  const merged = (b: string[], l: string[], r: string[]) => mergeOrder(b, l, r).filter((name) => !b.includes(name) || (l.includes(name) && r.includes(name)));
  return { order: merged(base.order, local.order, remote.order), pinned: merged(base.pinned, local.pinned, remote.pinned) };
}

/** `name` pinned or not; a note pinned goes in the order where it is. */
export function pinQuickNote(order: QuickOrder, name: string, on: boolean): QuickOrder {
  const pinned = order.pinned.filter((each) => each !== name);
  return { ...order, pinned: on ? [name, ...pinned] : pinned };
}

/** A new note at the top of the order, pinned when it was pinned as it was written. */
export function addQuickNote(order: QuickOrder, name: string, pinned = false): QuickOrder {
  const next = { ...order, order: [name, ...order.order.filter((each) => each !== name)] };
  return pinned ? pinQuickNote(next, name, true) : next;
}

/** A note gone from the quick notes: moved to a folder, or deleted. */
export function dropQuickNote(order: QuickOrder, name: string): QuickOrder {
  return { order: order.order.filter((each) => each !== name), pinned: order.pinned.filter((each) => each !== name) };
}
