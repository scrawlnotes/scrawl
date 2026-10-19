import { type Board, type Card, columnCards, type Column, moveCard, parseBoard } from './board';
import { childrenOf, type Section, sectionTasks, moveTask, parseList, type Task, type TaskList } from './tasks';

// A task, a section or a card deleted: not taken out of the world for good, but kept in the trash
// in a file of its own with where it was, to be put back there with its ids and its key
// (design/agent-fixes.md 2). A list or a board does not keep what was deleted from it: a file of
// its own in the trash neither grows the list nor needs everything that reads it to pass it over.

/** The trash file of each kind: named so that neither a task list nor a board is taken for it. */
export const PIECE_EXTS = { task: '.task.json', section: '.section.json', card: '.card.json' } as const;

export type PieceKind = keyof typeof PIECE_EXTS;

/** A task deleted from a list, with its subtasks, and its place: its section, the task it was under, the one before it. */
export interface TaskPiece {
  version: 1;
  kind: 'task';
  section: { id: string; name: string } | null;
  parent: string | null;
  after: string | null;
  /** The task first, then its subtasks all the way down. */
  tasks: Task[];
}

/** A section deleted from a list with its tasks, and the section before it. */
export interface SectionPiece {
  version: 1;
  kind: 'section';
  after: string | null;
  section: { id: string; name: string };
  tasks: Task[];
}

/** A card deleted from a board, with its timeline, subtasks and values, and its column, phase and the card before it. */
export interface CardPiece {
  version: 1;
  kind: 'card';
  column: Column;
  phase: { id: string; name: string } | null;
  after: string | null;
  /** The board's prefix, for the card's key to be shown in the trash: ROA-12. */
  prefix: string;
  card: Card;
}

export type Piece = TaskPiece | SectionPiece | CardPiece;

/** The kind of piece a trash file holds, by its name; null for any other file. */
export function pieceKindOf(name: string): PieceKind | null {
  for (const [kind, ext] of Object.entries(PIECE_EXTS) as [PieceKind, string][]) if (name.endsWith(ext)) return kind;
  return null;
}

/** A task and every subtask under it, the task first. */
function withSubtasks(tasks: Task[], id: string): Task[] {
  const task = tasks.find((t) => t.id === id);
  if (!task) return [];
  const out = [task];
  for (const child of childrenOf(tasks, id)) out.push(...withSubtasks(tasks, child.id));
  return out;
}

/** The sibling just before `id` among `siblings`, in their order; null when it comes first. */
const before = <T extends { id: string }>(siblings: T[], id: string): string | null => {
  const at = siblings.findIndex((s) => s.id === id);
  return at > 0 ? siblings[at - 1]!.id : null;
};

/** A task of `list` with its subtasks, as it goes to the trash; null when there is none. */
export function taskPiece(list: TaskList, id: string): TaskPiece | null {
  const task = list.tasks.find((t) => t.id === id);
  if (!task) return null;
  const section = task.parent === null && task.section ? list.sections.find((s) => s.id === task.section) : undefined;
  const siblings = task.parent === null ? sectionTasks(list, section?.id ?? null) : childrenOf(list.tasks, task.parent);
  return { version: 1, kind: 'task', section: section ? { id: section.id, name: section.name } : null, parent: task.parent, after: before(siblings, id), tasks: withSubtasks(list.tasks, id) };
}

/** A section of `list` with its tasks, as it goes to the trash; null when there is none. */
export function sectionPiece(list: TaskList, id: string): SectionPiece | null {
  const section = list.sections.find((s) => s.id === id);
  if (!section) return null;
  const tasks = sectionTasks(list, id).flatMap((task) => withSubtasks(list.tasks, task.id));
  return { version: 1, kind: 'section', after: before(list.sections, id), section: { id: section.id, name: section.name }, tasks };
}

/** A card of `board`, as it goes to the trash; null when there is none. */
export function cardPiece(board: Board, id: string): CardPiece | null {
  const card = board.cards.find((c) => c.id === id);
  const column = card ? board.columns.find((c) => c.id === card.column) : undefined;
  if (!card || !column) return null;
  const phase = card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  return { version: 1, kind: 'card', column: { ...column }, phase: phase ? { id: phase.id, name: phase.name } : null, after: before(columnCards(board, column.id), id), prefix: board.prefix, card };
}

/** What a piece is called in the trash: the task's, the section's or the card's title. */
export function pieceTitle(piece: Piece): string {
  return piece.kind === 'card' ? piece.card.title : piece.kind === 'section' ? piece.section.name : (piece.tasks[0]?.title ?? '');
}

/** How much a piece holds besides itself: a task's subtasks, a section's tasks, a card's subtasks. */
export function pieceCount(piece: Piece): number {
  if (piece.kind === 'task') return piece.tasks.length - 1;
  if (piece.kind === 'section') return piece.tasks.filter((t) => t.parent === null).length;
  return piece.card.subtasks?.length ?? 0;
}

export const serializePiece = (piece: Piece) => `${JSON.stringify(piece, null, 2)}\n`;

const isObject = (value: unknown): value is { [key: string]: unknown } => typeof value === 'object' && value !== null && !Array.isArray(value);
const named = (value: unknown): { id: string; name: string } | null =>
  isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' ? { id: value.id, name: value.name } : null;
const idOrNull = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** A piece as its trash file holds it, its tasks and its card read as a list's and a board's are; null when it is none. */
export function parsePiece(text: string): Piece | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const tasks = () => parseList(JSON.stringify({ tasks: Array.isArray(data.tasks) ? data.tasks : [] })).tasks;
  if (data.kind === 'task') {
    const read = tasks();
    return read.length > 0 ? { version: 1, kind: 'task', section: named(data.section), parent: idOrNull(data.parent), after: idOrNull(data.after), tasks: read } : null;
  }
  if (data.kind === 'section') {
    const section = named(data.section);
    return section ? { version: 1, kind: 'section', after: idOrNull(data.after), section, tasks: tasks() } : null;
  }
  if (data.kind === 'card' && isObject(data.column) && isObject(data.card)) {
    const column = { id: String(data.column.id ?? ''), name: String(data.column.name ?? ''), kind: data.column.kind };
    const board = parseBoard(JSON.stringify({ columns: [column], cards: [{ ...data.card, column: column.id }] }));
    const card = board.cards[0];
    return card ? { version: 1, kind: 'card', column: board.columns[0]!, phase: named(data.phase), after: idOrNull(data.after), prefix: typeof data.prefix === 'string' ? data.prefix : '', card } : null;
  }
  return null;
}

/**
 * A list with a deleted task or section put back where it was: a task under the task it was under,
 * or in its section, found by its id, else by its name, else at the top; after the one that was
 * before it, else at the end. Ids stay as they were. Put back already, it is not put back again.
 */
export function putBackTasks(list: TaskList, piece: TaskPiece | SectionPiece, now: () => Date = () => new Date()): TaskList {
  const there = new Set(list.tasks.map((t) => t.id));
  if (piece.kind === 'section') {
    if (list.sections.some((s) => s.id === piece.section.id)) return list;
    const at = piece.after === null ? 0 : list.sections.findIndex((s) => s.id === piece.after) + 1;
    const section: Section = { id: piece.section.id, name: piece.section.name };
    const sections = at > 0 || piece.after === null ? [...list.sections.slice(0, at), section, ...list.sections.slice(at)] : [...list.sections, section];
    return { sections, tasks: [...list.tasks, ...piece.tasks.filter((t) => !there.has(t.id))] };
  }
  const [task, ...subtasks] = piece.tasks;
  if (!task || there.has(task.id)) return list;
  const parent = piece.parent !== null && there.has(piece.parent) ? piece.parent : null;
  const section = parent !== null ? null : (list.sections.find((s) => s.id === piece.section?.id) ?? list.sections.find((s) => s.name === piece.section?.name))?.id ?? null;
  const { section: _old, ...bare } = task;
  const top: Task = { ...bare, parent, ...(section !== null && { section }) };
  const added: TaskList = { ...list, tasks: [...list.tasks, top, ...subtasks.filter((t) => !there.has(t.id))] };
  const siblings = (parent === null ? sectionTasks(added, section) : childrenOf(added.tasks, parent)).filter((t) => t.id !== task.id);
  const after = piece.after !== null && siblings.some((t) => t.id === piece.after) ? piece.after : (siblings[siblings.length - 1]?.id ?? null);
  return moveTask(added, task.id, { parent, section, after }, now);
}

/**
 * A board with a deleted card put back where it was: in its column, found by its id, else by its
 * name, else the first; in its phase the same way, else in none; after the card that was before
 * it, else at the end of the column. Its id and its key stay. Put back already, it is not again.
 */
export function putBackCard(board: Board, piece: CardPiece, now: () => Date = () => new Date()): Board {
  if (board.cards.some((c) => c.id === piece.card.id) || board.columns.length === 0) return board;
  const column = board.columns.find((c) => c.id === piece.column.id) ?? board.columns.find((c) => c.name === piece.column.name) ?? board.columns[0]!;
  const phase = piece.phase ? (board.phases.find((p) => p.id === piece.phase!.id) ?? board.phases.find((p) => p.name === piece.phase!.name)) : undefined;
  const { phase: _old, ...bare } = piece.card;
  const card: Card = { ...bare, column: column.id, ...(phase && { phase: phase.id }) };
  const added: Board = { ...board, nextKey: Math.max(board.nextKey, card.key + 1), cards: [...board.cards, card] };
  const siblings = columnCards(added, column.id).filter((c) => c.id !== card.id);
  const after = piece.after !== null && siblings.some((c) => c.id === piece.after) ? piece.after : (siblings[siblings.length - 1]?.id ?? null);
  return moveCard(added, card.id, { column: column.id, after }, now);
}
