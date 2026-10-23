import { BOARD_EXT, type Card, parseBoard, serializeBoard, type TimelineEntry } from './board';
import { isCollection, loadSchema, parseRecord, recordTitle, type Schema } from './collection';
import { basename, dirname, type Entry, type VaultFs } from './fs';
import { applyChanges, hrefTo, linksIn, type TextChange } from './links';
import { parsePiece, pieceKindOf, serializePiece } from './pieces';
import { readAway } from './sync/away';
import { parseList, serializeList, type Task, TASK_LIST_EXT } from './tasks';
import { ATTACHMENTS, displayTitle, listName, readTrash } from './vault';

// Files: every image, recording and file attached in a space, with where each is used. A file is
// used where a note, a task, a card or a record links to it; a note in the trash still uses its files.
// See PLAN.md 4.2.

/** Where an attached file is used. */
export interface FileUse {
  kind: 'note' | 'task' | 'card' | 'record';
  /** The note's or the record's file, the task's list or the card's board. */
  path: string;
  /** What it is called: a note's or a record's name; a task's title; a card's key, `SCR-12`. */
  title: string;
  /** A card's id on its board, and its title. */
  card?: { id: string; title: string };
  /** A task's id in its list, and the list's name. */
  task?: { id: string; list: string };
  /** In the trash: a note deleted, or something in a folder deleted. */
  inTrash: boolean;
}

export interface AttachedFile {
  path: string;
  /** Its file name. */
  name: string;
  size: number;
  /**
   * When it came: the moment its name was made from (an image pasted or a recording, which the
   * app names so), or when it was written; null when neither is known.
   */
  added: number | null;
  /** Whether its name is the moment it came, rather than a name of its own. */
  named: boolean;
  /** On the other side and not here: over this device's limit, not downloaded. */
  away: boolean;
  uses: FileUse[];
}

/** A pasted image's or a recording's name: `2026-10-06-143207.png`, maybe numbered. */
const MOMENT = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?\.[^.]+$/;

/** When a file the app named by the moment it came came: a pasted image's, a recording's; null for a name of its own. */
export function momentOf(name: string): number | null {
  const m = MOMENT.exec(name);
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!).getTime() : null;
}

/** Where a Markdown link or image points: `](address)` or `](<address with spaces>)`. */
const DESTINATION = /\]\(\s*(?:<([^>\n]*)>|([^\s)]+))/g;

/** The attached file a link's address points to, as its path in the space; null for any other. */
function attachmentOf(href: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(href);
  } catch {
    path = href;
  }
  return path.startsWith(`${ATTACHMENTS}/`) && path.length > ATTACHMENTS.length + 1 ? path : null;
}

/** The attached files a Markdown text links to, lowercased. */
export function filesIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(DESTINATION)) {
    const src = attachmentOf(m[1] ?? m[2] ?? '');
    if (src) found.add(src.toLowerCase());
  }
  return found;
}

/** A whole Markdown link or image: `[text](address "title")`, `![](<address>)`. */
const LINK = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]*)>|([^\s)]+))(?:\s+"[^"\n]*")?\s*\)/g;

/**
 * A Markdown text without its links and images to the attached file at `path`; a line left
 * empty by that goes too. The text as it was when it has none.
 */
export function dropFile(text: string, path: string): string {
  const wanted = path.toLowerCase();
  let changed = false;
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    let hit = false;
    const without = line.replace(LINK, (whole, angled: string | undefined, bare: string | undefined) => {
      if (attachmentOf(angled ?? bare ?? '')?.toLowerCase() !== wanted) return whole;
      hit = true;
      return '';
    });
    if (!hit) {
      lines.push(line);
      continue;
    }
    changed = true;
    if (without.trim() !== '') lines.push(without.replace(/[ \t]+$/, ''));
  }
  return changed ? lines.join('\n') : text;
}

/**
 * A board's text without the links to the attached file at `path` in its cards' descriptions and
 * comments; a comment that was only the file goes. The text as it was when it has none.
 */
export function dropFileFromBoard(text: string, path: string): string {
  const board = parseBoard(text);
  let changed = false;
  const drop = (markdown: string) => {
    const out = dropFile(markdown, path);
    if (out !== markdown) changed = true;
    return out;
  };
  const cards = board.cards.map((card) => ({
    ...card,
    ...(card.description !== undefined && { description: drop(card.description) }),
    // A comment that was only the file goes with it.
    timeline: card.timeline.flatMap((entry): TimelineEntry[] => {
      if (entry.kind !== 'comment') return [entry];
      const text = drop(entry.text);
      return text.trim() === '' && entry.text.trim() !== '' ? [] : [{ ...entry, text }];
    }),
  }));
  return changed ? serializeBoard({ ...board, cards }) : text;
}

/** A task list's text without the links to the attached file at `path` in its tasks' descriptions. The text as it was when it has none. */
export function dropFileFromTasks(text: string, path: string): string {
  const list = parseList(text);
  let changed = false;
  const tasks = list.tasks.map((task) => {
    if (task.description === undefined) return task;
    const description = dropFile(task.description, path);
    if (description === task.description) return task;
    changed = true;
    return { ...task, description };
  });
  return changed ? serializeList({ ...list, tasks }) : text;
}

/** Takes the attached file at `path` out of the text of what uses it: a note, a record, a task list or a board. */
export function dropFileFrom(usePath: string, text: string, path: string): string {
  if (usePath.endsWith(BOARD_EXT)) return dropFileFromBoard(text, path);
  if (usePath.endsWith(TASK_LIST_EXT)) return dropFileFromTasks(text, path);
  return dropFile(text, path);
}

/** A link's text as it reads: a backslash before punctuation dropped. */
const unescaped = (text: string) => text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
/** Text as a link's brackets hold it: what Markdown would read gets a backslash, as the editor writes a file's name. */
const escaped = (text: string) => text.replace(/[\\`*_~[\]<>]/g, '\\$&');

/**
 * What changes in a Markdown text when the attached file at `from` is renamed `to`: its links and
 * images point at `to`, and a link whose text is the file's old name takes the new one; text of
 * its own stays. Links inside code are left. Empty when nothing links to it.
 */
export function relinkFileChanges(text: string, from: string, to: string): TextChange[] {
  const wanted = from.toLowerCase();
  const changes: TextChange[] = [];
  for (const link of linksIn(text)) {
    const angled = link.href.startsWith('<');
    if (attachmentOf(angled ? link.href.slice(1, -1) : link.href)?.toLowerCase() !== wanted) continue;
    if (unescaped(text.slice(link.textFrom, link.textTo)) === basename(from)) changes.push({ from: link.textFrom, to: link.textTo, insert: escaped(basename(to)) });
    changes.push({ from: link.from, to: link.to, insert: angled ? `<${to}>` : hrefTo('', to) });
  }
  return changes;
}

/** A Markdown text with the attached file at `from` renamed `to`, as `relinkFileChanges` says; the text as it was when nothing links to it. */
export function relinkFile(text: string, from: string, to: string): string {
  const changes = relinkFileChanges(text, from, to);
  return changes.length > 0 ? applyChanges(text, changes) : text;
}

/** Tasks with the attached file at `from` renamed `to` in their descriptions; null when none links to it. */
function relinkTasks(tasks: Task[], from: string, to: string): Task[] | null {
  let changed = false;
  const out = tasks.map((task) => {
    if (task.description === undefined) return task;
    const description = relinkFile(task.description, from, to);
    if (description === task.description) return task;
    changed = true;
    return { ...task, description };
  });
  return changed ? out : null;
}

/** A card with the attached file at `from` renamed `to` in its description and comments; null when neither links to it. */
function relinkCard(card: Card, from: string, to: string): Card | null {
  const description = card.description === undefined ? undefined : relinkFile(card.description, from, to);
  let changed = description !== card.description;
  const timeline = card.timeline.map((entry) => {
    if (entry.kind !== 'comment') return entry;
    const text = relinkFile(entry.text, from, to);
    if (text === entry.text) return entry;
    changed = true;
    return { ...entry, text };
  });
  return changed ? { ...card, ...(description !== undefined && { description }), timeline } : null;
}

/**
 * The text of what uses attached files with the one at `from` renamed `to`: a note or a record, a
 * task list (its tasks' descriptions), a board (its cards' descriptions and comments), or a task, a
 * section or a card in the trash. The text as it was when nothing in it links to the file.
 */
export function relinkFileIn(usePath: string, text: string, from: string, to: string): string {
  if (!text.includes(ATTACHMENTS)) return text;
  if (usePath.endsWith(BOARD_EXT)) {
    const board = parseBoard(text);
    let changed = false;
    const cards = board.cards.map((card) => {
      const out = relinkCard(card, from, to);
      if (out) changed = true;
      return out ?? card;
    });
    return changed ? serializeBoard({ ...board, cards }) : text;
  }
  if (usePath.endsWith(TASK_LIST_EXT)) {
    const list = parseList(text);
    const tasks = relinkTasks(list.tasks, from, to);
    return tasks ? serializeList({ ...list, tasks }) : text;
  }
  if (pieceKindOf(usePath)) {
    const piece = parsePiece(text);
    if (!piece) return text;
    if (piece.kind === 'card') {
      const card = relinkCard(piece.card, from, to);
      return card ? serializePiece({ ...piece, card }) : text;
    }
    const tasks = relinkTasks(piece.tasks, from, to);
    return tasks ? serializePiece({ ...piece, tasks }) : text;
  }
  return usePath.endsWith('.md') ? relinkFile(text, from, to) : text;
}

/**
 * Points what links to the attached file at `from` in the trash at `to`, where it was renamed:
 * notes, records, task lists and boards deleted, alone or in a folder, and tasks, sections and
 * cards deleted. A note restored, or a card put back, then shows the file.
 */
export async function relinkFileInTrash(fs: VaultFs, from: string, to: string): Promise<void> {
  const relink = async (path: string) => {
    const text = await fs.readText(path).catch(() => null);
    if (text === null) return;
    const out = relinkFileIn(path, text, from, to);
    if (out !== text) await fs.writeText(path, out);
  };
  const visit = async (dir: string) => {
    for (const entry of await fs.list(dir)) {
      if (entry.kind === 'dir') await visit(entry.path);
      else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) await relink(entry.path);
    }
  };
  for (const item of await readTrash(fs)) {
    if (item.kind === 'folder' || item.kind === 'collection') await visit(item.path);
    else if (item.kind !== 'attachment' && item.kind !== 'keys' && !item.away) await relink(item.path);
  }
}

/** Adds what the notes, records and boards at and under `dir` use, by the file used. */
async function usesUnder(fs: VaultFs, dir: string, entries: Entry[], uses: Map<string, FileUse[]>, inTrash: boolean, noteTitle?: string): Promise<void> {
  const add = (file: string, use: FileUse) => {
    const list = uses.get(file);
    if (list) list.push(use);
    else uses.set(file, [use]);
  };
  // A collection's Markdown files are its records.
  let schema: Schema | null = null;
  if (isCollection(entries)) schema = await loadSchema(fs, dir).catch(() => null);
  for (const entry of entries) {
    if (entry.kind === 'dir') {
      if (dir === '' && (entry.name.startsWith('.') || entry.name.startsWith('_'))) continue;
      await usesUnder(fs, entry.path, await fs.list(entry.path), uses, inTrash);
      continue;
    }
    if (entry.name.endsWith(BOARD_EXT)) {
      const text = await fs.readText(entry.path);
      if (!text.includes(ATTACHMENTS)) continue;
      const board = parseBoard(text);
      for (const card of board.cards) {
        const linked = new Set<string>(filesIn(card.description ?? ''));
        for (const item of card.timeline) if (item.kind === 'comment') for (const file of filesIn(item.text)) linked.add(file);
        for (const file of linked) add(file, { kind: 'card', path: entry.path, title: `${board.prefix}-${card.key}`, card: { id: card.id, title: card.title }, inTrash });
      }
      continue;
    }
    if (entry.name.endsWith(TASK_LIST_EXT)) {
      const text = await fs.readText(entry.path);
      if (!text.includes(ATTACHMENTS)) continue;
      for (const task of parseList(text).tasks) {
        for (const file of filesIn(task.description ?? '')) add(file, { kind: 'task', path: entry.path, title: task.title, task: { id: task.id, list: listName(entry.path) }, inTrash });
      }
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;
    const text = await fs.readText(entry.path);
    if (!text.includes(ATTACHMENTS)) continue;
    const linked = filesIn(text);
    if (linked.size === 0) continue;
    const use: FileUse = schema
      ? { kind: 'record', path: entry.path, title: recordTitle(parseRecord(text, schema, entry.path)), inTrash }
      : { kind: 'note', path: entry.path, title: noteTitle ?? displayTitle(entry.path, text), inTrash };
    for (const file of linked) add(file, use);
  }
}

/** Where each attached file is used, by its path lowercased: notes, cards and records, and those in the trash. */
export async function fileUses(fs: VaultFs): Promise<Map<string, FileUse[]>> {
  const uses = new Map<string, FileUse[]>();
  await usesUnder(fs, '', await fs.list(''), uses, false);
  for (const item of await readTrash(fs)) {
    if (item.kind === 'note') await usesUnder(fs, dirname(item.path), [{ name: basename(item.path), path: item.path, kind: 'file' }], uses, true, item.title);
    else if (item.kind === 'board' || item.kind === 'tasks') await usesUnder(fs, dirname(item.path), [{ name: basename(item.path), path: item.path, kind: 'file' }], uses, true);
    else if (item.kind === 'folder' || item.kind === 'collection') await usesUnder(fs, item.path, await fs.list(item.path), uses, true);
  }
  return uses;
}

/** Every attached file of the space, here or left on the other side, with where it is used; the latest first. */
export async function listFiles(fs: VaultFs): Promise<AttachedFile[]> {
  const uses = await fileUses(fs);
  const files: AttachedFile[] = [];
  const seen = new Set<string>();
  const add = (path: string, size: number, modified: number | undefined, away: boolean) => {
    const name = basename(path);
    const moment = momentOf(name);
    seen.add(path.toLowerCase());
    files.push({ path, name, size, added: moment ?? modified ?? null, named: moment !== null, away, uses: uses.get(path.toLowerCase()) ?? [] });
  };
  for (const entry of await fs.list(ATTACHMENTS)) {
    if (entry.kind !== 'file' || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    add(entry.path, entry.size ?? (await fs.readBlob(entry.path)).size, entry.modified, false);
  }
  for (const file of await readAway(fs)) {
    if (dirname(file.path) !== ATTACHMENTS || seen.has(file.path.toLowerCase())) continue;
    add(file.path, file.size, undefined, true);
  }
  return files.sort((a, b) => (b.added ?? 0) - (a.added ?? 0) || a.name.localeCompare(b.name));
}
