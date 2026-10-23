import type { Board } from './board';
import { OPTION_COLORS, type OptionColor } from './collection';
import type { VaultFs } from './fs';
import type { Task } from './tasks';

// The labels of a space (design/labels.md): free words its tasks and cards carry, the same set
// for both. The space's own file keeps each one's color, and those no task or card has yet.

/** A label of a space as its file keeps it. */
export interface SpaceLabel {
  name: string;
  color?: OptionColor;
}

/** A label of a space with its color and how many of its tasks and cards have it. */
export interface LabelUse {
  name: string;
  color: OptionColor;
  tasks: number;
  cards: number;
}

export const LABELS_FILE = '.scrawl/labels.json';

/** Two spellings of one label: case does not tell labels apart. */
export const sameLabel = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Labels as they are kept: trimmed, none empty, each once, the first spelling kept. */
export function cleanLabels(labels: string[]): string[] {
  const out: string[] = [];
  for (const label of labels.map((l) => l.trim()).filter(Boolean)) if (!out.some((kept) => sameLabel(kept, label))) out.push(label);
  return out;
}

/** The colors a label gets from its name: every color but gray, which reads as none. Written out, as collection.ts is not read yet when board.ts reads this. */
const AUTO: readonly OptionColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

/** The color a label has from its name, the same every time and on every device. */
export function autoColor(name: string): OptionColor {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) % 9973;
  return AUTO[hash % AUTO.length]!;
}

/** A label's color: the one its space's file gives it, else the one from its name. */
export function labelColor(name: string, known: readonly SpaceLabel[]): OptionColor {
  return known.find((label) => sameLabel(label.name, name))?.color ?? autoColor(name);
}

/** Reads a space's labels; anything that is not one is left out, and what a newer version writes on one is kept. */
export function parseLabels(text: string): SpaceLabel[] {
  let data: { labels?: unknown } | null;
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return [];
  }
  if (!Array.isArray(data?.labels)) return [];
  const labels: SpaceLabel[] = [];
  for (const raw of data.labels as Partial<SpaceLabel>[]) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) continue;
    if (labels.some((label) => sameLabel(label.name, raw.name!))) continue;
    const { color, ...rest } = raw;
    labels.push({ ...rest, name: raw.name.trim(), ...(OPTION_COLORS.includes(color as OptionColor) && { color }) });
  }
  return labels;
}

export const serializeLabels = (labels: SpaceLabel[]) => `${JSON.stringify({ version: 1, labels }, null, 2)}\n`;

/** A space's labels; none when it has no file yet. */
export async function loadLabels(fs: VaultFs): Promise<SpaceLabel[]> {
  try {
    return parseLabels(await fs.readText(LABELS_FILE));
  } catch {
    return [];
  }
}

export const saveLabels = (fs: VaultFs, labels: SpaceLabel[]) => fs.writeText(LABELS_FILE, serializeLabels(labels));

/**
 * Every label of a space, by name: those its file keeps and those its tasks and cards have, each
 * with its color and how many tasks and cards have it, done ones too.
 */
export function labelUses(known: readonly SpaceLabel[], lists: Iterable<readonly Task[]>, boards: Iterable<Board>): LabelUse[] {
  const uses = new Map<string, LabelUse>();
  const use = (name: string) => {
    const key = name.toLowerCase();
    let found = uses.get(key);
    if (!found) {
      found = { name, color: labelColor(name, known), tasks: 0, cards: 0 };
      uses.set(key, found);
    }
    return found;
  };
  for (const label of known) use(label.name);
  for (const tasks of lists) for (const task of tasks) for (const label of task.labels ?? []) use(label).tasks++;
  for (const board of boards) for (const card of board.cards) for (const label of card.labels ?? []) use(label).cards++;
  return [...uses.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** A space's labels with one more: made from the picker or `@`, in the color its name gives it. One it has stays as it is. */
export function withLabel(known: readonly SpaceLabel[], name: string, color?: OptionColor): SpaceLabel[] {
  const clean = name.trim();
  if (!clean || known.some((label) => sameLabel(label.name, clean))) return [...known];
  return [...known, { name: clean, color: color ?? autoColor(clean) }];
}

/** A space's labels with one's color changed; one only used so far is written in with it. */
export function colorLabel(known: readonly SpaceLabel[], name: string, color: OptionColor): SpaceLabel[] {
  if (!known.some((label) => sameLabel(label.name, name))) return [...known, { name, color }];
  return known.map((label) => (sameLabel(label.name, name) ? { ...label, color } : label));
}

/**
 * A space's labels with one renamed, or taken away with `to` null. Renamed to a label it has,
 * the two are one, in that one's color. One only used so far keeps the color it had, written in.
 */
export function relabelKnown(known: readonly SpaceLabel[], from: string, to: string | null): SpaceLabel[] {
  const was = known.find((label) => sameLabel(label.name, from));
  const rest = known.filter((label) => label !== was);
  if (to === null) return rest;
  const name = to.trim();
  if (!name) return [...known];
  if (!sameLabel(from, name) && rest.some((label) => sameLabel(label.name, name))) return rest;
  const renamed = { ...(was ?? {}), name, color: was?.color ?? autoColor(from) };
  return was ? known.map((label) => (label === was ? renamed : label)) : [...known, renamed];
}

/** One label's new name in a list of labels, or its going; null when the list does not have it. */
function relabeled(labels: string[] | undefined, from: string, to: string | null): string[] | null {
  if (!labels?.some((label) => sameLabel(label, from))) return null;
  return cleanLabels(labels.flatMap((label) => (!sameLabel(label, from) ? [label] : to === null ? [] : [to])));
}

/**
 * A list's tasks with a label renamed, or taken off with `to` null. Not working on them: who
 * worked on a task and when it changed stay as they are. The same array when none has it.
 */
export function relabelTasks(tasks: Task[], from: string, to: string | null): Task[] {
  let changed = false;
  const next = tasks.map((task) => {
    const labels = relabeled(task.labels, from, to);
    if (!labels) return task;
    changed = true;
    const { labels: _was, ...rest } = task;
    return labels.length > 0 ? { ...rest, labels } : rest;
  });
  return changed ? next : tasks;
}

/** A board's cards with a label renamed or taken off, as `relabelTasks` does tasks. The same board when no card has it. */
export function relabelBoard(board: Board, from: string, to: string | null): Board {
  let changed = false;
  const cards = board.cards.map((card) => {
    const labels = relabeled(card.labels, from, to);
    if (!labels) return card;
    changed = true;
    const { labels: _was, ...rest } = card;
    return labels.length > 0 ? { ...rest, labels } : rest;
  });
  return changed ? { ...board, cards } : board;
}
