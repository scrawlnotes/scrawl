import {
  type Actor,
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
  loadCollection,
  updateRecord,
  wonChange,
  currentPhase,
  type Field,
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
  type PersonRef,
  type Phase,
  phaseCards,
  type Priority,
  saveBoard,
  updateCard,
  valueText,
  type VaultFs,
} from '@scrawlnotes/core';
import { cardActivity, type People, peopleIn, workedOnNames, workedOnOut, writerOf } from './activity';
import { checkOpen, cleanPath, Refusal } from './paths';
import { parseValues } from './records';
import { actorOf, type Agent, authorOf, type AgentSpace, type Client, type Due, dueIs, elementsOf, exists, isAssignee, nameIn, noteRefOf, nowOf, personRefOf, pickAcross, pickSpace, selfOf, todayOf, type Who, workedOnBy } from './space';
import { applySubtasks, type SubtaskArg, subtaskOut } from './subtasks';

// Boards: the cards of a board, short, and of every board by a day or a person; a card in full or
// as a brief; adding and changing one card or many at once, moving one by its column's kind, and
// commenting. The current phase is where the agent works unless told otherwise.

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

/** The card a card goes right after in `column`, as `ref` names it; null for the top. */
function afterOf(board: Board, column: string, ref: string, self: string): string | null {
  if (same(ref, 'top')) return null;
  const card = pickCard(board, ref);
  if (card.id === self) throw new Refusal('A card does not go after itself; give the card before it, or "top"', { after: ref });
  if (card.column !== column) {
    const name = board.columns.find((c) => c.id === column)?.name ?? column;
    const cards = columnCards(board, column).filter((c) => c.id !== self);
    throw new Refusal(`${keyOf(board, card)} is not in ${name}: after is a card of the column it goes in, or "top"`, { column: name, cards: cards.slice(0, 30).map((c) => ({ key: keyOf(board, c), title: c.title })) });
  }
  return card.id;
}

/** A card's values of the board's own fields, worked out, the empty ones left out. */
function valuesOf(board: Board, card: Card, today: string): { [key: string]: FieldValue } {
  const values: { [key: string]: FieldValue } = {};
  for (const field of board.fields ?? []) {
    const value = cardValue(board, card, field, today);
    if (!isEmpty(value)) values[field.key] = value;
  }
  return values;
}

/**
 * A card as a list gives it: what tells cards apart and how far each is, without its texts. Its
 * description, subtasks and comments come with the card alone, or with `full: true`.
 */
export function cardLine(board: Board, card: Card, today: string, people: People = []) {
  const column = columnOf(board, card);
  const phase = card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  const values = valuesOf(board, card, today);
  const comments = card.timeline.filter((entry) => entry.kind === 'comment').length;
  const ticked = card.subtasks?.filter((s) => s.done).length ?? 0;
  const worked = workedOnNames(card, people);
  return {
    key: keyOf(board, card),
    title: card.title,
    column: column?.name ?? null,
    ...(phase && { phase: phase.name }),
    priority: card.priority,
    due: card.due,
    ...(card.labels?.length && { labels: card.labels }),
    assignee: card.assignee ? nameIn(card.assignee, people) : null,
    ...(Object.keys(values).length > 0 && { values }),
    ...(card.subtasks?.length && { subtasks: `${ticked}/${card.subtasks.length}` }),
    ...(comments > 0 && { comments }),
    ...(card.note && { note: card.note }),
    ...(worked.length > 0 && { workedOn: worked }),
  };
}

/** A card as the tools give it in full: with who worked on it and what mattered on it, by name. */
export function cardOut(board: Board, card: Card, today: string, people: People = []) {
  const column = columnOf(board, card);
  const phase = card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  const values = valuesOf(board, card, today);
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
    assignee: card.assignee ? { ...card.assignee, name: nameIn(card.assignee, people) } : null,
    ...(Object.keys(values).length > 0 && { values }),
    ...(card.subtasks?.length && { subtasks: card.subtasks.map(subtaskOut) }),
    ...(card.note && { note: card.note }),
    comments: card.timeline.flatMap((entry) => {
      if (entry.kind !== 'comment') return [];
      const by = writerOf(entry, people);
      return [{ at: entry.at, ...(by && { by }), text: entry.text }];
    }),
    workedOn: workedOnOut(card, people),
    activity: cardActivity(board, card, people),
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

/** A board's head as the tools give it: its columns by name and kind, its open phases, how many are done. */
function boardOut(path: string, board: Board) {
  const current = currentPhase(board);
  const open = board.phases.filter((p) => p.state !== 'done');
  return {
    board: path,
    name: boardName(path),
    prefix: board.prefix,
    phasesOn: board.phasesOn,
    currentPhase: current ? { name: current.name, ...(current.goal && { goal: current.goal }), ...(current.doneWhen && { doneWhen: current.doneWhen }) } : null,
    columns: board.columns.map(({ name, kind }) => ({ name, kind })),
    ...(board.phases.length > 0 && { phases: open.map(({ name, state }) => ({ name, state })), donePhases: board.phases.length - open.length }),
    ...(board.fields?.length && { fields: board.fields.map(({ key, label, type, options, collection, many }) => ({ key, label, type, ...(options && { options }), ...(collection && { collection }), ...(many && { many }) })) }),
  };
}

export interface CardsArgs {
  space?: string;
  /** Left out with `due`, `assignee`, `label`, `by` or `since`: every board. */
  board?: string;
  card?: string;
  column?: string;
  phase?: string;
  assignee?: string;
  label?: string;
  due?: Due;
  /** Who worked on it: "self" the agent, "me" the person, or a name. */
  by?: string;
  /** Worked on since this day, by `by` when given, else by anyone. */
  since?: string;
  open?: boolean;
  brief?: boolean;
  /** Each card with its description, subtasks and comments. */
  full?: boolean;
}

/** Who worked on what is asked for: with `by` or `since`, what is done and every phase come too, unless told otherwise. */
const lookingBack = (args: CardsArgs) => !!args.by?.trim() || !!args.since?.trim();

/** The cards that are what `assignee`, `label`, `due`, `by` and `since` ask for, among a space's people. */
async function fitsOf(agent: Agent, client: Client, args: CardsArgs): Promise<(card: Card, people: People) => boolean> {
  const today = todayOf(agent);
  const since = dayArg(args.since, 'Since') ?? undefined;
  const asked = args.assignee || args.by;
  const person = asked ? await agent.person() : null;
  const self = asked ? await selfOf(agent, client) : null;
  return (card, people) =>
    (!args.assignee || isAssignee(card.assignee, args.assignee, person, self, people)) &&
    (!args.label || !!card.labels?.some((l) => same(l, args.label!))) &&
    (!args.due || dueIs(card.due, args.due, today)) &&
    (!lookingBack(args) || workedOnBy(card, args.by?.trim() || undefined, since, { person, self, people, timeZone: agent.timeZone }));
}

/** The cards of one board, or, with no board given, the cards of every board that fit `due`, `assignee`, `label`, `by` or `since`. */
export function cardsTool(agent: Agent, args: CardsArgs & { board: string }, client?: Client): ReturnType<typeof boardCards>;
export function cardsTool(agent: Agent, args: CardsArgs & { board?: undefined }, client?: Client): ReturnType<typeof acrossBoards>;
export function cardsTool(agent: Agent, args: CardsArgs, client?: Client): ReturnType<typeof boardCards> | ReturnType<typeof acrossBoards>;
export function cardsTool(agent: Agent, args: CardsArgs, client: Client = {}) {
  return args.board?.trim() ? boardCards(agent, client, { ...args, board: args.board }) : acrossBoards(agent, client, args);
}

/** Across boards a card's day matters, not its phase: every open card that fits, wherever it is. */
async function acrossBoards(agent: Agent, client: Client, args: CardsArgs) {
  if (args.card) throw new Refusal('Which board is the card on? Give board too, or find the card with search');
  if (!args.due && !args.assignee && !args.label && !lookingBack(args)) throw new Refusal('Give a board, or due, assignee, label, by or since to look across every board');
  const today = todayOf(agent);
  const fits = await fitsOf(agent, client, args);
  const open = args.open ?? !lookingBack(args);
  const spaces = args.space?.trim() ? [await pickSpace(agent, args.space)] : await agent.spaces();
  const found: { [key: string]: unknown; due: string | null; priority: number }[] = [];
  for (const space of spaces) {
    const people = await peopleIn(space.fs);
    for (const element of await elementsOf(space.fs, ['board'])) {
      const board = await loadBoard(space.fs, element.path);
      for (const card of board.cards) {
        if ((open && isFinished(board, card)) || !fits(card, people)) continue;
        found.push({ ...(args.full ? cardOut(board, card, today, people) : cardLine(board, card, today, people)), board: element.path, boardName: boardName(element.path), space: space.id, spaceName: space.name });
      }
    }
  }
  found.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.priority - b.priority);
  return { data: { today, total: found.length, cards: found } };
}

async function boardCards(agent: Agent, client: Client, args: CardsArgs & { board: string }) {
  const today = todayOf(agent);
  const fits = await fitsOf(agent, client, args);
  const { space, element } = await pickAcross(agent, args.space, args.board, ['board'], 'board');
  const [board, people] = await Promise.all([loadBoard(space.fs, element.path), peopleIn(space.fs)]);
  let cards: Card[];
  if (args.card) cards = [pickCard(board, args.card)];
  else {
    const current = board.phasesOn && !lookingBack(args) ? currentPhase(board) : undefined;
    cards = args.phase ? (fold(args.phase) === 'all' ? board.cards : phaseCards(board, pickPhase(board, args.phase)?.id ?? null)) : current ? phaseCards(board, current.id) : board.cards;
    if (args.open ?? !lookingBack(args)) cards = cards.filter((c) => !isFinished(board, c));
    if (args.column) {
      const column = pickColumn(board, args.column);
      const kind = COLUMN_KINDS.includes(fold(args.column) as ColumnKind) ? (fold(args.column) as ColumnKind) : null;
      cards = cards.filter((c) => (kind ? columnOf(board, c)?.kind === kind : c.column === column.id));
    }
    cards = cards.filter((c) => fits(c, people));
    const order = new Map(board.columns.map((c, i) => [c.id, i]));
    cards = [...cards].sort((a, b) => (order.get(a.column) ?? 99) - (order.get(b.column) ?? 99) || a.order - b.order);
  }
  const brief = args.brief && cards.length === 1 ? await briefOf(space.fs, board, element.path, cards[0]!, today) : undefined;
  const full = !!args.card || !!args.full;
  return {
    data: {
      space: space.id,
      spaceName: space.name,
      ...boardOut(element.path, board),
      total: cards.length,
      cards: cards.map((c) => (full ? cardOut(board, c, today, people) : cardLine(board, c, today, people))),
      ...(brief && { brief }),
    },
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
  /** The note it is about, by path or name; null unlinks it. */
  note?: string | null;
  /** Its subtasks to add, change or take off. */
  subtasks?: SubtaskArg[];
  /** The card it goes right after in its column, by key; "top" for the first place. */
  after?: string;
  /** Add the card even though an open one has its title already. */
  another?: boolean;
  /** Many cards at once on the board, each with the fields of one: all written, or none. */
  items?: CardItem[];
}

/** One card of many, as `items` gives it: what one card takes, but the board. */
export type CardItem = Omit<CardArgs, 'space' | 'board' | 'items'>;

/** The most cards or tasks one call adds or changes. */
export const MAX_ITEMS = 50;

/** What one card's turn did: the board as it is now, the card, and whether it was added, changed or already there. */
interface CardDone {
  board: Board;
  card: Card;
  status: 'created' | 'changed' | 'exists';
  message?: string;
}

/** What a field holds, said for a value that does not fit it. */
function fitOf(field: Field): string {
  switch (field.type) {
    case 'number':
      return 'a number, like 4900';
    case 'date':
      return field.time ? 'a day on the calendar as YYYY-MM-DD, or with its time as YYYY-MM-DDTHH:mm' : 'a day on the calendar as YYYY-MM-DD';
    case 'time':
      return 'a time as HH:mm';
    case 'checkbox':
      return 'true or false';
    default:
      return `a ${field.type}`;
  }
}

/** The fields of one card given beside `items`, which say one card while items say many. */
function singleFields(args: object): string[] {
  return Object.entries(args as { [key: string]: unknown })
    .filter(([key, value]) => value !== undefined && !['space', 'board', 'list', 'items'].includes(key))
    .map(([key]) => key);
}

/** Refuses `items` that are none, too many, or given with the fields of one. */
export function checkItems(args: object, items: unknown[], what: string) {
  const single = singleFields(args);
  if (single.length > 0) throw new Refusal(`Give ${single.join(', ')} inside each of items, or leave items out for one ${what}`, { fields: single });
  if (items.length === 0) throw new Refusal(`items is empty; give at least one ${what}`);
  if (items.length > MAX_ITEMS) throw new Refusal(`At most ${MAX_ITEMS} at once; ${items.length} were given`, { given: items.length });
}

/** One card added or changed, or, with `items`, many on one board in one go. */
export function saveCardTool(agent: Agent, client: Client, args: CardArgs & { items: CardItem[] }): ReturnType<typeof saveCards>;
export function saveCardTool(agent: Agent, client: Client, args: CardArgs & { items?: undefined }): ReturnType<typeof saveCard>;
export function saveCardTool(agent: Agent, client: Client, args: CardArgs): ReturnType<typeof saveCard> | ReturnType<typeof saveCards>;
export function saveCardTool(agent: Agent, client: Client, args: CardArgs) {
  return args.items ? saveCards(agent, client, { ...args, items: args.items }) : saveCard(agent, client, args);
}

/** The board a card or cards go on, the clock, the actor, and who "me" and "self" are. */
async function cardPlace(agent: Agent, client: Client, args: CardArgs) {
  const { space, element } = await pickAcross(agent, args.space, args.board, ['board'], 'board');
  const person = await agent.person();
  const name = actorOf(client, person);
  const author = await authorOf(agent, client, name);
  const [board, people, self] = await Promise.all([loadBoard(space.fs, element.path), peopleIn(space.fs), selfOf(agent, client, true)]);
  return {
    space,
    element,
    board,
    people,
    now: nowOf(agent),
    // What it does on a card is written with its name and, when the door knows it, its identity.
    by: { ...(name && { name }), ...(author?.id && { id: author.id }) } satisfies Actor,
    author,
    who: { me: person, self } satisfies Who,
    today: todayOf(agent),
    where: { space: space.id, spaceName: space.name, board: element.path },
  };
}

/** A deal won makes its company a customer (Board.wins): for each card that came into a done column. */
async function writeWins(fs: VaultFs, before: Board, after: Board, ids: string[]) {
  for (const id of ids) {
    const was = before.cards.find((c) => c.id === id);
    const card = after.cards.find((c) => c.id === id);
    if (!card || columnOf(after, card)?.kind !== 'done' || (was && columnOf(before, was)?.kind === 'done')) continue;
    const collection = after.wins && (await loadCollection(fs, (after.fields ?? []).find((f) => f.key === after.wins!.link)?.collection ?? '').catch(() => null));
    const change = collection ? wonChange(after, card, [collection]) : null;
    const record = change && collection!.records.find((r) => r.id === change.id);
    if (record) await updateRecord(fs, collection!.schema, record, { values: change!.values });
  }
}

async function saveCard(agent: Agent, client: Client, args: CardArgs) {
  const { space, element, board, people, now, by, author, who, today, where } = await cardPlace(agent, client, args);
  const step = await applyCard(space, board, args, now, by, author, who);
  if (step.status === 'exists') return { data: { ...where, created: false, exists: true, message: step.message, card: cardOut(board, step.card, today, people) } };
  await saveBoard(space.fs, element.path, step.board);
  await writeWins(space.fs, board, step.board, [step.card.id]);
  return { data: { ...where, created: step.status === 'created', card: cardOut(step.board, step.board.cards.find((c) => c.id === step.card.id)!, today, people) } };
}

async function saveCards(agent: Agent, client: Client, args: CardArgs & { items: CardItem[] }) {
  checkItems(args, args.items, 'card');
  const place = await cardPlace(agent, client, args);
  const { space, element, people, now, by, author, who, today, where } = place;
  let { board } = place;
  // Every card is checked and laid on the board before anything is written: one refused, none written.
  const done: CardDone[] = [];
  for (const [i, item] of args.items.entries()) {
    try {
      const step = await applyCard(space, board, item, now, by, author, who);
      board = step.board;
      done.push(step);
    } catch (error) {
      if (error instanceof Refusal) throw new Refusal(`Item ${i + 1}: ${error.message}; nothing was written`, { item: i + 1, ...error.details });
      throw error;
    }
  }
  if (done.some((step) => step.status !== 'exists')) await saveBoard(space.fs, element.path, board);
  await writeWins(space.fs, place.board, board, done.map((step) => step.card.id));
  const count = (status: CardDone['status']) => done.filter((step) => step.status === status).length;
  return {
    data: {
      ...where,
      created: count('created'),
      changed: count('changed'),
      exists: count('exists'),
      cards: done.map((step) => ({ status: step.status, ...cardLine(board, board.cards.find((c) => c.id === step.card.id)!, today, people) })),
    },
  };
}

/** One card added to `board` or changed on it, as `args` asks; the board is not written. */
async function applyCard(space: AgentSpace, board: Board, args: CardItem, now: Date, by: Actor, author: PersonRef | undefined, who: Who): Promise<CardDone> {
  const column = args.column ? pickColumn(board, args.column) : undefined;
  const phase = args.phase ? pickPhase(board, args.phase) : undefined;
  const priority = args.priority === undefined ? undefined : ([1, 2, 3, 4].includes(args.priority) ? (args.priority as Priority) : undefined);
  if (args.priority !== undefined && priority === undefined) throw new Refusal('Priority is 1 (highest) to 4 (none)', { given: args.priority });
  const due = dayArg(args.due, 'Due');
  const assignee = args.assignee === undefined ? undefined : await personRefOf(space, args.assignee, who);
  const values = args.values ? await parseValues(space.fs, board.fields ?? [], args.values) : undefined;
  if (values && Object.keys(values.extra).length > 0) {
    const [key, raw] = Object.entries(values.extra)[0]!;
    const field = (board.fields ?? []).find((f) => f.key === key)!;
    throw new Refusal(`${field.label} is ${fitOf(field)}; ${JSON.stringify(raw)} does not fit`, { field: key, given: raw });
  }
  const note = await noteRefOf(space.fs, args.note);
  let card: Card;
  let created = false;
  if (args.id) {
    card = pickCard(board, args.id);
    if (args.title !== undefined && !args.title.trim()) throw new Refusal('A card’s title cannot be empty; leave title out to keep it', { card: keyOf(board, card) });
    const subtasks = args.subtasks ? await applySubtasks(space, card.subtasks ?? [], args.subtasks, now, who) : undefined;
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
        ...(note !== undefined && { note }),
      },
      () => now,
      by,
    );
    // To another column, at its end unless after says where; or to another place in its own.
    if ((column && column.id !== card.column) || args.after !== undefined) {
      const to = column?.id ?? card.column;
      const after = args.after !== undefined ? afterOf(board, to, args.after, card.id) : (columnCards(board, to).filter((c) => c.id !== card.id).pop()?.id ?? null);
      board = moveCard(board, card.id, { column: to, after }, () => now, by);
    }
  } else {
    const title = args.title?.trim();
    if (!title) throw new Refusal('A new card needs a title');
    // A cut-off call sent again must not add the card twice; a board rarely means to hold two open cards of one title.
    const twins = args.another ? [] : board.cards.filter((c) => !isFinished(board, c) && same(c.title, title));
    if (twins.length > 1) throw new Refusal(`More than one open card is already called ${title}; nothing was added. Give id to change one of them, or another: true to add one more`, { candidates: twins.map((c) => ({ key: keyOf(board, c), id: c.id, title: c.title })) });
    if (twins.length === 1) {
      const found = twins[0]!;
      const message = `An open card called ${title} is already on this board (${keyOf(board, found)}); nothing was added. To change it, give its id ${keyOf(board, found)}; to add a second one with this title on purpose, pass another: true.`;
      return { board, card: found, status: 'exists', message };
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
      ...(note && { note }),
      ...(author && { author }),
    };
    const subtasks = args.subtasks ? await applySubtasks(space, [], args.subtasks, now, who) : [];
    const before = board.cards.length;
    board = addCard(board, input, () => now, by);
    if (board.cards.length === before) throw new Refusal('The card could not be added');
    card = board.cards[board.cards.length - 1]!;
    if (subtasks.length > 0) board = updateCard(board, card.id, { subtasks }, () => now, by);
    if (args.after !== undefined) board = moveCard(board, card.id, { column: card.column, after: afterOf(board, card.column, args.after, card.id) }, () => now, by);
    created = true;
  }
  return { board, card, status: created ? 'created' : 'changed' };
}

export async function commentTool(agent: Agent, client: Client, args: { space?: string; board: string; card: string; text: string }) {
  const { space, element } = await pickAcross(agent, args.space, args.board, ['board'], 'board');
  let board = await loadBoard(space.fs, element.path);
  const people = await peopleIn(space.fs);
  const card = pickCard(board, args.card);
  const text = args.text.trim();
  if (!text) throw new Refusal('A comment needs text');
  const now = nowOf(agent);
  const by = actorOf(client, await agent.person());
  const author = await authorOf(agent, client, by);
  // A cut-off call sent again must not say the same thing twice.
  const last = [...card.timeline].reverse().find((entry) => entry.kind === 'comment');
  if (last && last.kind === 'comment' && last.text === text && (last.by ?? null) === (by ?? null)) {
    return { data: { space: space.id, board: element.path, written: false, message: 'This is already the last comment on the card, by you; it was not written again.', card: cardOut(board, card, todayOf(agent), people) } };
  }
  board = addComment(board, card.id, text, () => now, { ...(by && { name: by }), ...(author?.id && { id: author.id }) });
  await saveBoard(space.fs, element.path, board);
  return { data: { space: space.id, board: element.path, written: true, card: cardOut(board, board.cards.find((c) => c.id === card.id)!, todayOf(agent), people) } };
}

/** A path inside a space that must exist, for tools that take one. */
export async function existingPath(fs: VaultFs, raw: string): Promise<string> {
  const path = checkOpen(cleanPath(raw));
  if (!(await exists(fs, path))) throw new Refusal(`Nothing is at ${path}`, { path });
  return path;
}
