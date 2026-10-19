import {
  addCard,
  addComment,
  type Board,
  boardName,
  type Card,
  cardValue,
  type Column,
  COLUMN_KINDS,
  type ColumnKind,
  columnCards,
  columnOf,
  currentPhase,
  type FieldValue,
  firstColumn,
  fold,
  isDay,
  isEmpty,
  isFinished,
  keyOf,
  loadBoard,
  moveCard,
  type NewCard,
  type Phase,
  phaseCards,
  type Priority,
  saveBoard,
  updateCard,
  valueText,
  type VaultFs,
} from '@scrawlnotes/core';
import { checkOpen, cleanPath, Refusal } from './paths';
import { parseValues } from './records';
import { actorOf, type Agent, type Client, exists, nowOf, personRefOf, pickElement, pickSpace, todayOf } from './space';
import { applySubtasks, type SubtaskArg, subtaskOut } from './subtasks';

// Boards: the cards of a board, a card as a brief, adding and changing a card, moving it by its
// column's kind, and commenting. The current phase is where the agent works unless told otherwise.

/** A day as the agent wrote it, or a refusal: one that is not on the calendar (2026-02-30) too. */
export function dayArg(value: string | null | undefined, what: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  const day = value.trim();
  if (!day) return null;
  if (!isDay(day)) throw new Refusal(`${what} is a day on the calendar as YYYY-MM-DD`, { given: value });
  return day;
}

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/** The column `ref` names: by id, by name, or by kind (the first column of that kind). */
export function pickColumn(board: Board, ref: string): Column {
  const wanted = ref.trim();
  const byId = board.columns.find((c) => c.id === wanted);
  if (byId) return byId;
  const byName = board.columns.filter((c) => same(c.name, wanted));
  if (byName.length === 1) return byName[0]!;
  if (COLUMN_KINDS.includes(fold(wanted) as ColumnKind)) {
    const column = firstColumn(board, fold(wanted) as ColumnKind);
    if (column) return column;
  }
  throw new Refusal(`No column called ${ref}; give a column's name or kind`, { columns: board.columns });
}

/** The phase `ref` names: by id or name; "none" for no phase. */
function pickPhase(board: Board, ref: string): Phase | null {
  const wanted = ref.trim();
  if (fold(wanted) === 'none') return null;
  const found = board.phases.find((p) => p.id === wanted) ?? board.phases.find((p) => same(p.name, wanted));
  if (!found) throw new Refusal(`No phase called ${ref}`, { phases: board.phases.map(({ id, name, state }) => ({ id, name, state })) });
  return found;
}

/** The card `ref` names: by id, by key (`SCR-12`), or by its number alone. */
export function pickCard(board: Board, ref: string): Card {
  const wanted = ref.trim();
  const byId = board.cards.find((c) => c.id === wanted);
  if (byId) return byId;
  const number = /^(?:[A-Za-z0-9]+-)?(\d+)$/.exec(wanted);
  const byKey = number ? board.cards.find((c) => c.key === Number(number[1]) && (!wanted.includes('-') || same(keyOf(board, c), wanted))) : undefined;
  if (byKey) return byKey;
  const byTitle = board.cards.filter((c) => same(c.title, wanted));
  if (byTitle.length === 1) return byTitle[0]!;
  if (byTitle.length > 1) throw new Refusal(`More than one card is called ${ref}; say which by key`, { candidates: byTitle.map((c) => ({ key: keyOf(board, c), title: c.title })) });
  throw new Refusal(`No card ${ref} on this board`, {});
}

/** A card as the tools give it. */
export function cardOut(board: Board, card: Card, today: string) {
  const column = columnOf(board, card);
  const phase = card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  const values: { [key: string]: FieldValue } = {};
  for (const field of board.fields ?? []) {
    const value = cardValue(board, card, field, today);
    if (!isEmpty(value)) values[field.key] = value;
  }
  return {
    id: card.id,
    key: keyOf(board, card),
    title: card.title,
    ...(card.description && { description: card.description }),
    column: column ? { id: column.id, name: column.name, kind: column.kind } : null,
    phase: phase?.name ?? null,
    priority: card.priority,
    due: card.due,
    ...(card.labels?.length && { labels: card.labels }),
    assignee: card.assignee ?? null,
    ...(Object.keys(values).length > 0 && { values }),
    ...(card.subtasks?.length && { subtasks: card.subtasks.map(subtaskOut) }),
    comments: card.timeline.flatMap((entry) => (entry.kind === 'comment' ? [{ at: entry.at, ...(entry.by && { by: entry.by }), text: entry.text }] : [])),
    created: card.created,
    updated: card.updated,
    completed: card.completed,
  };
}

/** A card as a brief: what an agent needs to take it on, in one markdown text. */
async function briefOf(fs: VaultFs, board: Board, path: string, card: Card, today: string): Promise<string> {
  const lines: string[] = [`# ${keyOf(board, card)} ${card.title}`, ''];
  const column = columnOf(board, card);
  lines.push(`Board: ${boardName(path)} · Column: ${column?.name ?? '?'}${card.due ? ` · Due: ${card.due}` : ''}${card.priority < 4 ? ` · P${card.priority}` : ''}`);
  for (const field of board.fields ?? []) {
    const text = valueText(cardValue(board, card, field, today));
    if (text) lines.push(`${field.label}: ${text}`);
  }
  if (card.labels?.length) lines.push(`Labels: ${card.labels.join(', ')}`);
  if (card.description) lines.push('', card.description.trim());
  if (card.subtasks?.length) {
    lines.push('', '## Subtasks', '');
    for (const s of card.subtasks) lines.push(`- [${s.done ? 'x' : ' '}] ${s.title}${s.due ? ` (due ${s.due})` : ''}${s.priority < 4 ? ` (p${s.priority})` : ''}`);
  }
  const phase = card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  if (phase) {
    lines.push('', `## Phase: ${phase.name}`);
    if (phase.goal) lines.push('', `Goal: ${phase.goal}`);
    if (phase.doneWhen) lines.push(`Done when: ${phase.doneWhen}`);
    if (phase.note) {
      const text = await fs.readText(phase.note).catch(() => '');
      if (text.trim()) lines.push('', `### ${phase.note}`, '', text.trim());
    }
  }
  if (card.note) {
    const text = await fs.readText(card.note).catch(() => '');
    if (text.trim()) lines.push('', `## Note: ${card.note}`, '', text.trim());
  }
  const comments = card.timeline.filter((entry) => entry.kind === 'comment');
  if (comments.length > 0) {
    lines.push('', '## Comments');
    for (const entry of comments) if (entry.kind === 'comment') lines.push('', `${entry.at.slice(0, 10)}${entry.by ? ` ${entry.by}` : ''}: ${entry.text}`);
  }
  return `${lines.join('\n')}\n`;
}

/** A board's head as the tools give it. */
function boardOut(path: string, board: Board) {
  const current = currentPhase(board);
  return {
    board: path,
    name: boardName(path),
    prefix: board.prefix,
    phasesOn: board.phasesOn,
    currentPhase: current ? { id: current.id, name: current.name, ...(current.goal && { goal: current.goal }), ...(current.doneWhen && { doneWhen: current.doneWhen }) } : null,
    columns: board.columns,
    phases: board.phases.map(({ id, name, state }) => ({ id, name, state })),
    ...(board.fields?.length && { fields: board.fields.map(({ key, label, type, options, collection, many }) => ({ key, label, type, ...(options && { options }), ...(collection && { collection }), ...(many && { many }) })) }),
  };
}

export async function cardsTool(agent: Agent, args: { space?: string; board: string; card?: string; column?: string; phase?: string; assignee?: string; label?: string; open?: boolean; brief?: boolean }) {
  const space = await pickSpace(agent, args.space);
  const element = await pickElement(space.fs, args.board, ['board'], 'board');
  const board = await loadBoard(space.fs, element.path);
  const today = todayOf(agent);
  let cards: Card[];
  if (args.card) cards = [pickCard(board, args.card)];
  else {
    const current = board.phasesOn ? currentPhase(board) : undefined;
    cards = args.phase ? (fold(args.phase) === 'all' ? board.cards : phaseCards(board, pickPhase(board, args.phase)?.id ?? null)) : current ? phaseCards(board, current.id) : board.cards;
    if (args.open ?? true) cards = cards.filter((c) => !isFinished(board, c));
    if (args.column) {
      const column = pickColumn(board, args.column);
      const kind = COLUMN_KINDS.includes(fold(args.column) as ColumnKind) ? (fold(args.column) as ColumnKind) : null;
      cards = cards.filter((c) => (kind ? columnOf(board, c)?.kind === kind : c.column === column.id));
    }
    if (args.assignee) cards = cards.filter((c) => c.assignee && ((c.assignee.name && same(c.assignee.name, args.assignee!)) || c.assignee.id === args.assignee));
    if (args.label) cards = cards.filter((c) => c.labels?.some((l) => same(l, args.label!)));
    const order = new Map(board.columns.map((c, i) => [c.id, i]));
    cards = [...cards].sort((a, b) => (order.get(a.column) ?? 99) - (order.get(b.column) ?? 99) || a.order - b.order);
  }
  const brief = args.brief && cards.length === 1 ? await briefOf(space.fs, board, element.path, cards[0]!, today) : undefined;
  return {
    data: { space: space.id, ...boardOut(element.path, board), total: cards.length, cards: cards.map((c) => cardOut(board, c, today)), ...(brief && { brief }) },
    ...(brief && { text: brief }),
  };
}

export interface CardArgs {
  space?: string;
  board: string;
  id?: string;
  title?: string;
  description?: string;
  column?: string;
  phase?: string;
  priority?: number;
  due?: string | null;
  labels?: string[];
  assignee?: string | null;
  values?: { [key: string]: unknown };
  /** Its subtasks to add, change or take off. */
  subtasks?: SubtaskArg[];
  /** Add the card even though an open one has its title already. */
  another?: boolean;
}

export async function saveCardTool(agent: Agent, client: Client, args: CardArgs) {
  const space = await pickSpace(agent, args.space);
  const element = await pickElement(space.fs, args.board, ['board'], 'board');
  let board = await loadBoard(space.fs, element.path);
  const now = nowOf(agent);
  const by = actorOf(client, await agent.person());
  const column = args.column ? pickColumn(board, args.column) : undefined;
  const phase = args.phase ? pickPhase(board, args.phase) : undefined;
  const priority = args.priority === undefined ? undefined : ([1, 2, 3, 4].includes(args.priority) ? (args.priority as Priority) : undefined);
  if (args.priority !== undefined && priority === undefined) throw new Refusal('Priority is 1 (highest) to 4 (none)', { given: args.priority });
  const due = dayArg(args.due, 'Due');
  const assignee = args.assignee === undefined ? undefined : await personRefOf(space.fs, args.assignee);
  const values = args.values ? await parseValues(space.fs, board.fields ?? [], args.values) : undefined;
  if (values && Object.keys(values.extra).length > 0) {
    const [key, raw] = Object.entries(values.extra)[0]!;
    throw new Refusal(`The value for ${key} does not fit its field`, { field: key, given: raw });
  }
  let card: Card;
  let created = false;
  if (args.id) {
    card = pickCard(board, args.id);
    const subtasks = args.subtasks ? await applySubtasks(space.fs, card.subtasks ?? [], args.subtasks, now) : undefined;
    board = updateCard(
      board,
      card.id,
      {
        ...(args.title !== undefined && { title: args.title }),
        ...(args.description !== undefined && { description: args.description }),
        ...(priority !== undefined && { priority }),
        ...(due !== undefined && { due }),
        ...(args.labels !== undefined && { labels: args.labels }),
        ...(assignee !== undefined && { assignee }),
        ...(phase !== undefined && { phase: phase?.id ?? null }),
        ...(values && { values: values.values }),
        ...(subtasks && { subtasks }),
      },
      () => now,
    );
    if (column && column.id !== card.column) {
      const last = columnCards(board, column.id).filter((c) => c.id !== card.id).pop();
      board = moveCard(board, card.id, { column: column.id, after: last?.id ?? null }, () => now, by);
    }
  } else {
    const title = args.title?.trim();
    if (!title) throw new Refusal('A new card needs a title');
    // A cut-off call sent again must not add the card twice; a board rarely means to hold two open cards of one title.
    const twins = args.another ? [] : board.cards.filter((c) => !isFinished(board, c) && same(c.title, title));
    if (twins.length > 1) throw new Refusal(`More than one open card is already called ${title}; nothing was added. Give id to change one of them, or another: true to add one more`, { candidates: twins.map((c) => ({ key: keyOf(board, c), id: c.id, title: c.title })) });
    if (twins.length === 1) {
      const found = twins[0]!;
      return {
        data: {
          space: space.id,
          board: element.path,
          created: false,
          exists: true,
          message: `An open card called ${title} is already on this board (${keyOf(board, found)}); nothing was added. To change it, give its id ${keyOf(board, found)}; to add a second one with this title on purpose, pass another: true.`,
          card: cardOut(board, found, todayOf(agent)),
        },
      };
    }
    const input: NewCard = {
      title,
      ...(column && { column: column.id }),
      ...(phase !== undefined && { phase: phase?.id ?? null }),
      ...(args.description !== undefined && { description: args.description }),
      ...(priority !== undefined && { priority }),
      ...(due !== undefined && { due }),
      ...(args.labels && { labels: args.labels }),
      ...(assignee && { assignee }),
      ...(values && { values: values.values }),
    };
    const subtasks = args.subtasks ? await applySubtasks(space.fs, [], args.subtasks, now) : [];
    const before = board.cards.length;
    board = addCard(board, input, () => now, by);
    if (board.cards.length === before) throw new Refusal('The card could not be added');
    card = board.cards[board.cards.length - 1]!;
    if (subtasks.length > 0) board = updateCard(board, card.id, { subtasks }, () => now);
    created = true;
  }
  await saveBoard(space.fs, element.path, board);
  const saved = board.cards.find((c) => c.id === card.id)!;
  return { data: { space: space.id, board: element.path, created, card: cardOut(board, saved, todayOf(agent)) } };
}

export async function commentTool(agent: Agent, client: Client, args: { space?: string; board: string; card: string; text: string }) {
  const space = await pickSpace(agent, args.space);
  const element = await pickElement(space.fs, args.board, ['board'], 'board');
  let board = await loadBoard(space.fs, element.path);
  const card = pickCard(board, args.card);
  const text = args.text.trim();
  if (!text) throw new Refusal('A comment needs text');
  const now = nowOf(agent);
  const by = actorOf(client, await agent.person());
  // A cut-off call sent again must not say the same thing twice.
  const last = [...card.timeline].reverse().find((entry) => entry.kind === 'comment');
  if (last && last.kind === 'comment' && last.text === text && (last.by ?? null) === (by ?? null)) {
    return { data: { space: space.id, board: element.path, written: false, message: 'This is already the last comment on the card, by you; it was not written again.', card: cardOut(board, card, todayOf(agent)) } };
  }
  board = addComment(board, card.id, text, () => now, by);
  await saveBoard(space.fs, element.path, board);
  return { data: { space: space.id, board: element.path, written: true, card: cardOut(board, board.cards.find((c) => c.id === card.id)!, todayOf(agent)) } };
}

/** A path inside a space that must exist, for tools that take one. */
export async function existingPath(fs: VaultFs, raw: string): Promise<string> {
  const path = checkOpen(cleanPath(raw));
  if (!(await exists(fs, path))) throw new Refusal(`Nothing is at ${path}`, { path });
  return path;
}
