import { diff3Merge } from 'node-diff3';
import { type Board, BOARD_EXT, type Card, parseBoard, serializeBoard, type TimelineEntry } from '../board';
import { parseFilters, serializeFilters, type TaskFilter } from '../filters';
import { KEYS_EXT } from '../keys';
import { mergeMe, parseMe, serializeMe } from '../me';
import { mergePeople, parsePeople } from '../people';
import { parseSpace, serializeSpace } from '../space';
import { parseList, serializeList, type Task, type Section, TASK_LIST_EXT } from '../tasks';
import { canonical, mergeFields, mergeOrder, mergeRecords, mergeValue, spreadOrder } from './merge-records';

// Merging a file changed on both sides, by what kind of file it is. See design/sync.md, section 5.

export type MergeKind = 'text' | 'tasks' | 'board' | 'filters' | 'space' | 'me' | 'people' | 'trash';

const INBOX_TASKS = 'Inbox/tasks.json';
const TRASH_INDEX = '.scrawl/trash/index.json';

/** How a file is merged; null for a file that cannot be (an attachment). */
export function mergeKindOf(path: string): MergeKind | null {
  const lower = path.toLowerCase();
  // A keys file is lines of text too: two devices that changed different keys keep both.
  if (lower.endsWith('.md') || lower.endsWith(KEYS_EXT)) return 'text';
  if (lower.endsWith(TASK_LIST_EXT) || lower === INBOX_TASKS.toLowerCase()) return 'tasks';
  if (lower.endsWith(BOARD_EXT)) return 'board';
  if (lower === '.scrawl/filters.json') return 'filters';
  if (lower === '.scrawl/space.json') return 'space';
  if (lower === '.scrawl/me.json') return 'me';
  if (lower === '.scrawl/people.json') return 'people';
  if (lower === TRASH_INDEX) return 'trash';
  return null;
}

export interface Merged {
  text: string;
  /** False when the two sides changed the same lines of a note differently; `text` is then the local one. */
  clean: boolean;
}

/** Lines of a note from three versions; where both sides changed the same lines, the merge is not clean. */
export function mergeText(base: string, local: string, remote: string): Merged {
  if (local === remote || remote === base) return { text: local, clean: true };
  if (local === base) return { text: remote, clean: true };
  const regions = diff3Merge(local.split('\n'), base.split('\n'), remote.split('\n'), { excludeFalseConflicts: true });
  if (regions.some((region) => region.conflict)) return { text: local, clean: false };
  return { text: regions.flatMap((region) => region.ok ?? []).join('\n'), clean: true };
}

const byId = <T extends { id: string }>(record: T) => record.id;

function mergeTasks(base: string, local: string, remote: string): string {
  const [b, l, r] = [base, local, remote].map(parseList) as [ReturnType<typeof parseList>, ReturnType<typeof parseList>, ReturnType<typeof parseList>];
  const sections = mergeRecords<Section>(b.sections, l.sections, r.sections, byId, (was, mine, theirs) => mergeFields(was, mine, theirs));
  const merged = mergeRecords<Task>(b.tasks, l.tasks, r.tasks, byId, (was, mine, theirs) => mergeFields(was, mine, theirs, 'updated'));
  // Subtasks go with their parent; a top-level task's place is its section.
  const tasks = spreadOrder(merged, (t) => (t.parent ? `p:${t.parent}` : `s:${t.section ?? ''}`));
  // Read back, so that what the file reader makes of it (a subtask whose parent is gone) is merged too.
  return serializeList(parseList(serializeList({ sections, tasks })));
}

function mergeTimeline(base: TimelineEntry[], local: TimelineEntry[], remote: TimelineEntry[]): TimelineEntry[] {
  const merged = mergeRecords<TimelineEntry>(base, local, remote, byId, (was, mine, theirs) =>
    mergeFields(was, mine, theirs, 'edited' as keyof TimelineEntry & string),
  );
  // Moves and comments of both sides, in the order they happened.
  return [...merged].sort((a, c) => (a.at < c.at ? -1 : a.at > c.at ? 1 : a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
}

function mergeCard(was: Card | undefined, mine: Card, theirs: Card): Card {
  const card = mergeFields(was, mine, theirs, 'updated');
  return { ...card, timeline: mergeTimeline(was?.timeline ?? [], mine.timeline, theirs.timeline) };
}

/**
 * Two devices that gave one key to different cards: the card made later takes the next free key,
 * whichever device merges.
 */
function separateKeys(cards: Card[], nextKey: number): { cards: Card[]; nextKey: number } {
  let next = Math.max(nextKey, ...cards.map((c) => c.key + 1));
  const holders = new Map<number, Card[]>();
  for (const card of cards) holders.set(card.key, [...(holders.get(card.key) ?? []), card]);
  const renumbered = new Map<string, number>();
  for (const group of holders.values()) {
    if (group.length < 2) continue;
    const later = [...group].sort((a, c) => (a.created < c.created ? -1 : a.created > c.created ? 1 : a.id < c.id ? -1 : a.id > c.id ? 1 : 0)).slice(1);
    for (const card of later) renumbered.set(card.id, next++);
  }
  return { cards: cards.map((c) => (renumbered.has(c.id) ? { ...c, key: renumbered.get(c.id)! } : c)), nextKey: next };
}

function mergeBoard(base: string, local: string, remote: string): string {
  const [b, l, r] = [base, local, remote].map(parseBoard) as [Board, Board, Board];
  const columns = mergeRecords(b.columns, l.columns, r.columns, byId, (was, mine, theirs) => mergeFields(was, mine, theirs));
  const phases = mergeRecords(b.phases, l.phases, r.phases, byId, (was, mine, theirs) => mergeFields(was, mine, theirs));
  const merged = mergeRecords(b.cards, l.cards, r.cards, byId, mergeCard);
  const keyed = separateKeys(merged, Math.max(l.nextKey, r.nextKey));
  const board: Board = {
    prefix: mergeValue(b.prefix, l.prefix, r.prefix),
    nextKey: keyed.nextKey,
    phasesOn: mergeValue(b.phasesOn, l.phasesOn, r.phasesOn),
    ...(mergeValue(b.view, l.view, r.view) === 'list' && { view: 'list' as const }),
    columns,
    phases,
    cards: spreadOrder(keyed.cards, (c) => c.column),
  };
  // Read back, so that a card in a column deleted on the other side, or two current phases, are put right.
  return serializeBoard(parseBoard(serializeBoard(board)));
}

function mergeFilterFile(base: string, local: string, remote: string): string {
  const [b, l, r] = [base, local, remote].map(parseFilters) as [TaskFilter[], TaskFilter[], TaskFilter[]];
  return serializeFilters(mergeRecords(b, l, r, byId, (was, mine, theirs) => mergeFields(was, mine, theirs)));
}

interface TrashRecord {
  name: string;
  from: string;
  deleted: string;
}

function parseTrashIndex(text: string): TrashRecord[] {
  try {
    const items = (JSON.parse(text) as { items?: unknown }).items;
    return Array.isArray(items) ? items.filter((r): r is TrashRecord => typeof r?.name === 'string') : [];
  } catch {
    return [];
  }
}

function mergeTrash(base: string, local: string, remote: string): string {
  const [b, l, r] = [base, local, remote].map(parseTrashIndex) as [TrashRecord[], TrashRecord[], TrashRecord[]];
  const items = mergeRecords(b, l, r, (record) => record.name, (was, mine, theirs) => mergeFields(was, mine, theirs));
  return `${JSON.stringify({ version: 1, items }, null, 2)}\n`;
}

const MERGERS: Record<Exclude<MergeKind, 'text'>, (base: string, local: string, remote: string) => string> = {
  tasks: mergeTasks,
  board: mergeBoard,
  filters: mergeFilterFile,
  space: (base, local, remote) => serializeSpace(mergeFields(parseSpace(base), parseSpace(local), parseSpace(remote))),
  me: (base, local, remote) => {
    const me = mergeMe(parseMe(base), parseMe(local), parseMe(remote), mergeFields);
    return me ? serializeMe(me) : local;
  },
  people: mergePeople,
  trash: mergeTrash,
};

/** The structure a file of a kind is read into, to tell whether two writings of it say the same. */
const READERS: Record<Exclude<MergeKind, 'text'>, (text: string) => unknown> = {
  tasks: parseList,
  board: parseBoard,
  filters: parseFilters,
  space: parseSpace,
  me: parseMe,
  people: parsePeople,
  trash: parseTrashIndex,
};

/**
 * A file changed on both sides, merged from its base. A result that says what one side says is
 * that side's text as it is, so that a merge never rewrites a file only to write it differently.
 */
export function mergeFile(kind: MergeKind, base: string, local: string, remote: string): Merged {
  if (kind === 'text') return mergeText(base, local, remote);
  const text = MERGERS[kind](base, local, remote);
  const read = READERS[kind];
  const result = canonical(read(text));
  if (result === canonical(read(remote))) return { text: remote, clean: true };
  if (result === canonical(read(local))) return { text: local, clean: true };
  return { text, clean: true };
}
