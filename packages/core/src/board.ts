import { type Actor, actorIn, type By, isObject, readStamp, readWorkedOn, refKey, type Stamp, stampOf, workedBy, type WorkedOn, writtenBy } from './activity';
import { type Collection, evaluateFormula, type Field, type FieldValue, isEmpty, isLink, type LinkedBlock, linkedRecords, pointsAt, readFields, readLinkedBlock, readValue, type Record as CollectionRecord, valueText } from './collection';
import { type ChoiceRenames, renameChoices } from './fields';
import type { VaultFs } from './fs';
import { cleanLabels } from './labels';
import { type PersonRef, readPersonRef } from './people';
import { addSubtask, type NewSubtask, readSubtasks, type Subtask, writtenSubtask } from './subtasks';
import type { Priority } from './tasks';

// A board is a file of its own in a folder: `<name>.board.json`. It holds its columns, its
// phases and its cards; a card carries its own timeline of what mattered on it, and who worked on it. A board may have
// fields of its own, of a collection's types but name and code (a card has its title and key):
// a deal's company and value. Everything here is a pure function over the board value, as with
// task lists; the interface saves the result.

/** A board file: `<name>.board.json`. */
export const BOARD_EXT = '.board.json';

/**
 * What a column means, apart from its name. The kind sets the behaviour: new cards land in the
 * first column; cards in a done or dropped column are finished; a review column is where an
 * agent leaves its work for a person to look at.
 */
export type ColumnKind = 'backlog' | 'active' | 'review' | 'done' | 'dropped';

export const COLUMN_KINDS: readonly ColumnKind[] = ['backlog', 'active', 'review', 'done', 'dropped'];

export interface Column {
  id: string;
  name: string;
  kind: ColumnKind;
}

/** A phase is an ordered unit of scope without dates; exactly one is current while any is open. */
export type PhaseState = 'done' | 'current' | 'upcoming';

export interface Phase {
  id: string;
  name: string;
  state: PhaseState;
  /** What the phase is for, a sentence or two. */
  goal?: string;
  /** When the phase counts as finished. */
  doneWhen?: string;
  /** Path of a note with more, if any. */
  note?: string | null;
}

/**
 * A card's timeline: only what mattered on it, in one stream (design/activity.md 1.2): its moves
 * between columns, the comments on it, who it was given to and the subtasks ticked off. An entry
 * of a kind a newer version writes is kept as it is, and not shown.
 */
export type TimelineEntry =
  | (Stamp & { kind: 'move'; from: string | null; to: string })
  | (Stamp & { kind: 'comment'; text: string; edited?: string })
  | (Stamp & { kind: 'assign'; given?: PersonRef })
  | (Stamp & { kind: 'tick'; subtasks: string[] })
  | (Stamp & { kind: 'unknown'; raw: { [key: string]: unknown } });

/** Ticks of one actor this close after its last are written as the same entry. */
const TICKS_TOGETHER_MS = 10 * 60 * 1000;

export interface Card {
  id: string;
  /** The number in the card's key: `SCR-12` is key 12 on a board with prefix `SCR`. */
  key: number;
  title: string;
  /** Markdown, as a note's text. Left out when there is none. */
  description?: string;
  /** The column the card is in. */
  column: string;
  /** The phase the card belongs to; none means the general backlog. */
  phase?: string | null;
  /** Position within its column. */
  order: number;
  priority: Priority;
  /** Due day as `YYYY-MM-DD`. */
  due: string | null;
  /** Free words; a board colours them. Left out when empty. */
  labels?: string[];
  /** Who it is given to: a person or an agent of the space, or in the personal space a name as it was typed. */
  assignee?: PersonRef | null;
  /** Who made it. */
  author?: PersonRef | null;
  /** Path of the note the card was made from. */
  note?: string | null;
  created: string;
  updated: string;
  /** When the card last entered a done column; null while it is not in one. */
  completed: string | null;
  timeline: TimelineEntry[];
  /**
   * The values of the board's own fields, by key, as the file has them; `cardValue` reads one as
   * its field's type holds it. A value whose field was taken out stays. Left out when empty.
   */
  values?: { [key: string]: unknown };
  /** Its own subtasks, in their order; left out when it has none. */
  subtasks?: Subtask[];
  /** Everyone who changed it, a person or an agent, once each: what changes leave no entry on the timeline still show here. Left out when no one is known. */
  workedOn?: WorkedOn[];
}

export interface Board {
  /** The letters before the dash in every card's key. */
  prefix: string;
  /** The key the next card gets. */
  nextKey: number;
  /** Whether the phase strip shows and new cards join the current phase. */
  phasesOn: boolean;
  /** How a device that has not chosen opens it: `'list'` for a list, columns when unset. */
  view?: 'list';
  /** In the order they are shown. */
  columns: Column[];
  /** In their order. */
  phases: Phase[];
  /** The board's own fields, in the order a card shows them; left out when it has none. */
  fields?: Field[];
  /** Which piece of an app it is (`deals`, `roadmap`…), as an app template set it up. */
  role?: string;
  /**
   * Each open card says its next step, and one with none is marked: a deal as Pipedrive shows it
   * (design/scrawl-apps.md 3.1). Its next step is the earliest of the records of `collection`
   * linking to it that are not `done`, by `day`: its activities planned.
   */
  next?: BoardNext;
  /** The field a card moved to a dropped column is asked: why a deal was lost. */
  dropAsks?: string;
  /** The fields a card shows on its face, by key, in place of its first links and number: a roadmap card's type, who asked for it and its release. */
  face?: string[];
  /** What the card's window shows of the records linking to it, as a record's linked blocks: a deal's next steps and its history. */
  blocks?: LinkedBlock[];
  /** A card moved to a done column writes `value` into `field` of the record its `link` points at: a deal won makes its company a customer. */
  wins?: BoardWins;
  /** What a card dropped writes into the records that link to it: a deal lost declines its quote (design/scrawl-apps.md 3.2). */
  loses?: BoardBack;
  /** Buttons the card's window has, of the record its link points at, the card given: a deal's Log and Plan, its company's. */
  press?: BoardPress;
  cards: Card[];
}

export interface BoardPress {
  /** The card's link field whose record has the buttons. */
  link: string;
  buttons: string[];
  /** The question of the buttons the card answers: Log's deal. */
  card: string;
  /** Questions answered with the card's fields, question by field: Log's with, the deal's contact. */
  fields?: { [ask: string]: string };
}

export interface BoardNext {
  collection: string;
  day: string;
  done: string;
}

export interface BoardWins {
  link: string;
  field: string;
  value: string;
  /** The records that link to the card, written too: a deal won confirms its quote (design/scrawl-apps.md 3.2). */
  back?: BoardBack;
}

/** The records of a collection whose link points at the card and whose field is one of `from`: their field becomes `value`. */
export interface BoardBack {
  collection: string;
  link: string;
  field: string;
  from: string[];
  value: string;
}

const readBack = (raw: unknown): BoardBack | undefined =>
  isObject(raw) && typeof raw.collection === 'string' && typeof raw.link === 'string' && typeof raw.field === 'string' && typeof raw.value === 'string' && Array.isArray(raw.from)
    ? { collection: raw.collection, link: raw.link, field: raw.field, from: raw.from.filter((v): v is string => typeof v === 'string'), value: raw.value }
    : undefined;

export type Template = 'software' | 'simple' | 'issues' | 'crm';

type Clock = () => Date;
const iso = (now: Clock) => now().toISOString();
const newId = () => crypto.randomUUID();

const SOFTWARE: [string, ColumnKind][] = [
  ['Backlog', 'backlog'],
  ['Todo', 'active'],
  ['Doing', 'active'],
  ['Review', 'review'],
  ['Done', 'done'],
];
const SIMPLE: [string, ColumnKind][] = [
  ['Todo', 'active'],
  ['Doing', 'active'],
  ['Done', 'done'],
];
/** Issue tracking, as Linear has it: a new issue goes to Backlog, the first column; Done, Canceled and Duplicate are all finished. */
const ISSUES: [string, ColumnKind][] = [
  ['Backlog', 'backlog'],
  ['Todo', 'active'],
  ['In Progress', 'active'],
  ['Done', 'done'],
  ['Canceled', 'dropped'],
  ['Duplicate', 'dropped'],
];
/** Deals, as a CRM keeps them: Lead waits, Won is done, Lost is dropped. */
const CRM: [string, ColumnKind][] = [
  ['Lead', 'backlog'],
  ['Contacted', 'active'],
  ['Meeting', 'active'],
  ['Proposal', 'active'],
  ['Won', 'done'],
  ['Lost', 'dropped'],
];
const TEMPLATE_COLUMNS: Record<Template, [string, ColumnKind][]> = { software: SOFTWARE, simple: SIMPLE, issues: ISSUES, crm: CRM };

/** The collections a CRM board's links point at: its companies and its people. */
export interface BoardLinks {
  company: string;
  contact: string;
}

/** A CRM board's fields: the company and the contact a deal is with, its value and its next step. */
const crmFields = (links: BoardLinks): Field[] => [
  { key: 'company', label: 'Company', type: 'link', collection: links.company },
  { key: 'contact', label: 'Contact', type: 'link', collection: links.contact },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'next_step', label: 'Next step', type: 'date' },
];

/**
 * The letters a board's keys start with, from its name: the initials of several words
 * (`Client portal` → `CP`), the first three letters of one (`Roadmap` → `ROA`), `BRD` when the
 * name has no letters to use.
 */
export function prefixFor(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const prefix = words.length >= 2 ? words.map((w) => w[0]!).join('').slice(0, 4) : (words[0] ?? '').slice(0, 3);
  return prefix.toUpperCase() || 'BRD';
}

/**
 * A board as a template starts it. The template only sets the start; everything changes later.
 * A CRM board's links point at the collections in `links`.
 */
export function newBoard(name: string, template: Template, ids: () => string = newId, links: BoardLinks = { company: 'Companies', contact: 'People' }): Board {
  return {
    prefix: prefixFor(name),
    nextKey: 1,
    phasesOn: template === 'software',
    ...(template === 'issues' && { view: 'list' as const }),
    columns: TEMPLATE_COLUMNS[template].map(([name, kind]) => ({ id: ids(), name, kind })),
    phases: [],
    ...(template === 'crm' && { fields: crmFields(links) }),
    cards: [],
  };
}

/** Reads a board file. Anything that is not usable is left out rather than failing the board. */
export function parseBoard(text: string): Board {
  let data: Partial<Record<keyof Board, unknown>> | null;
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return emptyBoard();
  }
  const columns = parseColumns(data?.columns);
  const phases = parsePhases(data?.phases);
  const fields = readFields(data?.fields, true);
  const cards = parseCards(data?.cards, columns);
  const blocks = (Array.isArray(data?.blocks) ? data.blocks : []).map(readLinkedBlock).filter((b): b is LinkedBlock => b !== null);
  const maxKey = cards.reduce((max, c) => Math.max(max, c.key), 0);
  const stored = typeof data?.nextKey === 'number' && Number.isInteger(data.nextKey) ? data.nextKey : 1;
  return {
    prefix: typeof data?.prefix === 'string' && data.prefix.trim() ? data.prefix.trim() : 'BRD',
    nextKey: Math.max(stored, maxKey + 1),
    phasesOn: data?.phasesOn === true,
    ...(data?.view === 'list' && { view: 'list' as const }),
    columns,
    phases: withOneCurrent(phases),
    ...(fields.length > 0 && { fields }),
    ...(typeof data?.role === 'string' && data.role.trim() && { role: data.role.trim() }),
    ...(readNext(data?.next) && { next: readNext(data?.next)! }),
    ...(typeof data?.dropAsks === 'string' && fields.some((f) => f.key === data.dropAsks) && { dropAsks: data.dropAsks }),
    ...(Array.isArray(data?.face) && { face: data.face.filter((k): k is string => typeof k === 'string' && fields.some((f) => f.key === k)) }),
    ...(blocks.length > 0 && { blocks }),
    ...(isObject(data?.wins) && typeof data.wins.link === 'string' && typeof data.wins.field === 'string' && typeof data.wins.value === 'string' && { wins: { link: data.wins.link, field: data.wins.field, value: data.wins.value, ...(readBack(data.wins.back) && { back: readBack(data.wins.back) }) } }),
    ...(readBack(data?.loses) && { loses: readBack(data!.loses) }),
    ...(readPress(data?.press) && { press: readPress(data?.press)! }),
    cards,
  };
}

function readPress(raw: unknown): BoardPress | null {
  if (!isObject(raw) || typeof raw.link !== 'string' || typeof raw.card !== 'string' || !Array.isArray(raw.buttons)) return null;
  const buttons = raw.buttons.filter((n): n is string => typeof n === 'string' && !!n.trim());
  const fields = isObject(raw.fields) ? Object.fromEntries(Object.entries(raw.fields).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
  return { link: raw.link, buttons, card: raw.card, ...(Object.keys(fields).length > 0 && { fields }) };
}

function readNext(raw: unknown): BoardNext | null {
  if (!isObject(raw) || typeof raw.collection !== 'string' || typeof raw.day !== 'string' || typeof raw.done !== 'string') return null;
  return { collection: raw.collection, day: raw.day, done: raw.done };
}

/** A card as a record a link points at: its id, its title for a name, its key for a code, its values. */
export const cardRecord = (path: string, board: Board, card: Card): CollectionRecord => ({ id: card.id, path, name: card.title, code: keyOf(board, card), values: (card.values ?? {}) as CollectionRecord['values'], extra: {}, body: card.description ?? '' });

/** A card's next step (Board.next): the earliest record linking to it not done that has a day; null when it has none. */
export function nextStep(board: Board, path: string, card: Card, collections: readonly Collection[]): CollectionRecord | null {
  const next = board.next;
  const source = next && collections.find((c) => c.dir === next.collection);
  if (!next || !source) return null;
  const planned = linkedRecords(source, path, { id: card.id, name: card.title }).filter((r) => r.values[next.done] !== true && typeof r.values[next.day] === 'string' && r.values[next.day]);
  return planned.reduce<CollectionRecord | null>((first, r) => (!first || (r.values[next.day] as string) < (first.values[next.day] as string) ? r : first), null);
}

/**
 * What a card won writes (Board.wins): the record its link points at, in the collection the link
 * field is of, with the value added to its field; null when it holds it already or there is none.
 */
export function wonChange(board: Board, card: Card, collections: readonly Collection[]): { dir: string; id: string; values: CollectionRecord['values'] } | null {
  const wins = board.wins;
  const field = wins && board.fields?.find((f) => f.key === wins.link && f.type === 'link');
  const link = field ? [card.values?.[field.key]].flat()[0] : null;
  const target = field?.collection ? collections.find((c) => c.dir === field.collection) : undefined;
  const record = isLink(link) && target ? target.records.find((r) => (link.id ? r.id === link.id : r.name.trim().toLowerCase() === link.name.trim().toLowerCase())) : undefined;
  const into = target?.schema.fields.find((f) => f.key === wins!.field);
  if (!record || !into) return null;
  const now = record.values[into.key];
  if (into.type === 'multi-select') {
    const held = Array.isArray(now) ? (now as string[]) : [];
    return held.includes(wins!.value) ? null : { dir: target!.dir, id: record.id, values: { [into.key]: [...held, wins!.value] } };
  }
  return now === wins!.value ? null : { dir: target!.dir, id: record.id, values: { [into.key]: wins!.value } };
}

/**
 * What a card moved into a done or a dropped column writes into the records that link to it
 * (BoardWins.back, Board.loses): a deal won confirms its quote, one lost declines it.
 */
export function followChanges(board: Board, card: Card, kind: ColumnKind, collections: readonly Collection[]): { dir: string; id: string; values: CollectionRecord['values'] }[] {
  const back = kind === 'done' ? board.wins?.back : kind === 'dropped' ? board.loses : undefined;
  const target = back && collections.find((c) => c.dir === back.collection);
  if (!back || !target) return [];
  return target.records
    .filter((r) => [r.values[back.link]].flat().some((l) => isLink(l) && l.id === card.id) && typeof r.values[back.field] === 'string' && back.from.includes(r.values[back.field] as string))
    .map((r) => ({ dir: target.dir, id: r.id, values: { [back.field]: back.value } }));
}

function emptyBoard(): Board {
  return { prefix: 'BRD', nextKey: 1, phasesOn: false, columns: [], phases: [], cards: [] };
}

function parseColumns(list: unknown): Column[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Column[] = [];
  for (const raw of list as Partial<Column>[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || seen.has(raw.id)) continue;
    seen.add(raw.id);
    out.push({ ...raw, id: raw.id, name: raw.name, kind: COLUMN_KINDS.includes(raw.kind as ColumnKind) ? (raw.kind as ColumnKind) : 'active' });
  }
  return out;
}

function parsePhases(list: unknown): Phase[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Phase[] = [];
  for (const raw of list as Partial<Phase>[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || seen.has(raw.id)) continue;
    seen.add(raw.id);
    out.push({
      ...raw,
      id: raw.id,
      name: raw.name,
      state: raw.state === 'done' || raw.state === 'current' ? raw.state : 'upcoming',
      goal: typeof raw.goal === 'string' && raw.goal.trim() ? raw.goal : undefined,
      doneWhen: typeof raw.doneWhen === 'string' && raw.doneWhen.trim() ? raw.doneWhen : undefined,
      note: typeof raw.note === 'string' ? raw.note : undefined,
    });
  }
  return out;
}

function parseCards(list: unknown, columns: Column[]): Card[] {
  if (!Array.isArray(list)) return [];
  const known = new Set(columns.map((c) => c.id));
  const first = columns[0]?.id;
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const raw of list as Partial<Card>[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string' || seen.has(raw.id)) continue;
    // A card whose column is gone goes to the first column instead of disappearing.
    const column = typeof raw.column === 'string' && known.has(raw.column) ? raw.column : first;
    if (!column) continue;
    seen.add(raw.id);
    out.push({
      // Unknown fields are kept, so a newer version's data survives being saved by an older one.
      ...raw,
      id: raw.id,
      key: typeof raw.key === 'number' && Number.isInteger(raw.key) && raw.key > 0 ? raw.key : 0,
      title: raw.title,
      description: typeof raw.description === 'string' && raw.description.trim() ? raw.description : undefined,
      column,
      phase: typeof raw.phase === 'string' ? raw.phase : undefined,
      order: typeof raw.order === 'number' ? raw.order : 0,
      priority: raw.priority === 1 || raw.priority === 2 || raw.priority === 3 ? raw.priority : 4,
      due: typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : null,
      labels: Array.isArray(raw.labels) && raw.labels.length > 0 ? raw.labels.filter((l): l is string => typeof l === 'string') : undefined,
      created: typeof raw.created === 'string' ? raw.created : '',
      updated: typeof raw.updated === 'string' ? raw.updated : '',
      completed: typeof raw.completed === 'string' ? raw.completed : null,
      timeline: parseTimeline(raw.timeline),
      values: isValues(raw.values) ? raw.values : undefined,
    });
    const card = out[out.length - 1]!;
    const subtasks = readSubtasks(raw.subtasks);
    if (subtasks.length > 0) card.subtasks = subtasks;
    else delete card.subtasks;
    const worked = readWorkedOn(raw.workedOn);
    if (worked.length > 0) card.workedOn = worked;
    else delete card.workedOn;
    for (const key of ['assignee', 'author'] as const) {
      const ref = readPersonRef(raw[key]);
      if (ref) card[key] = ref;
      else delete card[key];
    }
  }
  // Cards without a key, from a file written by hand, are numbered after the ones that have one.
  let next = out.reduce((max, c) => Math.max(max, c.key), 0) + 1;
  return out.map((c) => (c.key > 0 ? c : { ...c, key: next++ }));
}

/** Whether a card's values, as the file has them, are a map with something in it. */
const isValues = (raw: unknown): raw is { [key: string]: unknown } =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) && Object.keys(raw).length > 0;

function parseTimeline(list: unknown): TimelineEntry[] {
  if (!Array.isArray(list)) return [];
  const out: TimelineEntry[] = [];
  for (const raw of list) {
    const read = readStamp(raw);
    if (!read) continue;
    // Unknown fields are kept, so a newer version's data survives being saved by an older one.
    const { stamp, kind, rest } = read;
    if (kind === 'move' && typeof rest.to === 'string') {
      out.push({ ...rest, ...stamp, kind: 'move', from: typeof rest.from === 'string' ? rest.from : null, to: rest.to });
    } else if (kind === 'comment' && typeof rest.text === 'string') {
      out.push({ ...rest, ...stamp, kind: 'comment', text: rest.text, ...(typeof rest.edited === 'string' && { edited: rest.edited }) });
    } else if (kind === 'assign') {
      const { given, ...others } = rest;
      const ref = readPersonRef(given);
      out.push({ ...others, ...stamp, kind: 'assign', ...(ref && { given: ref }) });
    } else if (kind === 'tick' && Array.isArray(rest.subtasks)) {
      out.push({ ...rest, ...stamp, kind: 'tick', subtasks: rest.subtasks.filter((s): s is string => typeof s === 'string') });
    } else {
      // A kind this version does not know, kept to be written back as it came.
      out.push({ ...stamp, kind: 'unknown', raw: kind === 'unknown' && isObject(rest.raw) ? rest.raw : (raw as { [key: string]: unknown }) });
    }
  }
  return out;
}



/** Exactly one phase is current while any is open: the first open one, when none is marked. */
function withOneCurrent(phases: Phase[]): Phase[] {
  const current = phases.findIndex((p) => p.state === 'current');
  const first = phases.findIndex((p) => p.state !== 'done');
  if (current === -1 && first === -1) return phases;
  const keep = current === -1 ? first : current;
  return phases.map((p, i) => {
    if (i === keep) return p.state === 'current' ? p : { ...p, state: 'current' };
    return p.state === 'current' ? { ...p, state: 'upcoming' } : p;
  });
}

/** A board as its file holds it. */
export function serializeBoard(board: Board): string {
  const { phases, ...rest } = board;
  const cards = rest.cards.map((c) => ({
    ...c,
    ...(c.subtasks && { subtasks: c.subtasks.map(writtenSubtask) }),
    // A kind of entry this version does not know goes back as it came.
    timeline: c.timeline.map((entry) => (entry.kind === 'unknown' ? entry.raw : entry)),
  }));
  return `${JSON.stringify({ version: 1, ...rest, cards, ...(phases.length > 0 && { phases }) }, null, 2)}\n`;
}

/** Reads the board at `path`. A board whose file is missing is empty. */
export async function loadBoard(fs: VaultFs, path: string): Promise<Board> {
  try {
    return parseBoard(await fs.readText(path));
  } catch {
    return emptyBoard();
  }
}

export function saveBoard(fs: VaultFs, path: string, board: Board): Promise<void> {
  return fs.writeText(path, serializeBoard(board));
}

// ---------- reading ----------

/** A card's key as it is shown: `SCR-12`. */
export const keyOf = (board: Board, card: Card): string => `${board.prefix}-${card.key}`;

export const columnOf = (board: Board, card: Card): Column | undefined => board.columns.find((c) => c.id === card.column);

/** Cards in a done or dropped column are finished. */
export const isFinished = (board: Board, card: Card): boolean => {
  const kind = columnOf(board, card)?.kind;
  return kind === 'done' || kind === 'dropped';
};

/** The cards of a column, in their order. */
export function columnCards(board: Board, column: string): Card[] {
  return board.cards.filter((c) => c.column === column).sort((a, b) => a.order - b.order);
}

/** The first column of a kind, where a card goes when the kind is all that is known. */
export const firstColumn = (board: Board, kind: ColumnKind): Column | undefined => board.columns.find((c) => c.kind === kind);

/** How far a column's cards are, as its icon shows it: waiting, not started, started, in review, done or dropped. */
export type ColumnStatus = 'backlog' | 'todo' | 'started' | 'review' | 'done' | 'dropped';

/** A column's status. The first active column is where work is not started yet; the later ones are where it is. */
export function columnStatus(board: Board, column: Column): ColumnStatus {
  if (column.kind !== 'active') return column.kind;
  return board.columns.find((c) => c.kind === 'active')?.id === column.id ? 'todo' : 'started';
}

export const currentPhase = (board: Board): Phase | undefined => board.phases.find((p) => p.state === 'current');

/** A card's values for its board's fields, each read as its field's type holds it; one that does not fit is left out. */
export function cardValues(board: Board, card: Card): CollectionRecord['values'] {
  const values: CollectionRecord['values'] = {};
  for (const field of board.fields ?? []) {
    const value = readValue(field.type, card.values?.[field.key], field.many, field.time);
    if (value !== null) values[field.key] = value;
  }
  return values;
}

/** A card's value for one of its board's fields, a formula worked out for `today`; null with none. */
export function cardValue(board: Board, card: Card, field: Field, today = ''): FieldValue {
  if (field.type === 'formula') return evaluateFormula(field.formula ?? '', cardValues(board, card), { fields: board.fields ?? [] }, today);
  return readValue(field.type, card.values?.[field.key], field.many, field.time);
}

/** The fields a card shows on its face: the board's first link and its first number, a deal's company and value. */
export function faceFields(board: Board): Field[] {
  const fields = board.fields ?? [];
  if (board.face) return board.face.map((k) => fields.find((f) => f.key === k)).filter((f): f is Field => !!f);
  // A deal's company and its contact, then its value.
  return [...fields.filter((f) => f.type === 'link').slice(0, 2), fields.find((f) => f.type === 'number')].filter((f): f is Field => !!f);
}

/** The sum of a number or formula field over cards; null when none of them has a value. */
export function cardSum(board: Board, cards: Card[], field: Field, today = ''): number | null {
  if (field.type !== 'number' && field.type !== 'formula') return null;
  let sum: number | null = null;
  for (const card of cards) {
    const value = cardValue(board, card, field, today);
    if (typeof value === 'number') sum = (sum ?? 0) + value;
  }
  return sum;
}

/**
 * The cards of a phase, or of none with `null`. A card whose phase is gone counts as in none.
 */
export function phaseCards(board: Board, phase: string | null): Card[] {
  const known = new Set(board.phases.map((p) => p.id));
  return board.cards.filter((c) => (c.phase && known.has(c.phase) ? c.phase : null) === phase);
}

/**
 * How far a phase is: cards in done columns against all its cards. Dropped cards count in
 * neither, so dropping one does not hold a phase back.
 */
export function phaseProgress(board: Board, phase: string | null): { done: number; total: number } {
  const cards = phaseCards(board, phase).filter((c) => columnOf(board, c)?.kind !== 'dropped');
  return { done: cards.filter((c) => columnOf(board, c)?.kind === 'done').length, total: cards.length };
}

/** A phase can close once every card of it is finished. */
export function phaseCanClose(board: Board, phase: string): boolean {
  return phaseCards(board, phase).every((c) => isFinished(board, c));
}

/** How many cards wait in review columns: the person's inbox. */
export const reviewCount = (board: Board): number => board.cards.filter((c) => columnOf(board, c)?.kind === 'review').length;

export const openCardCount = (board: Board): number => board.cards.filter((c) => !isFinished(board, c)).length;

// ---------- columns ----------

/** Adds a column after `after`, or at the end with `undefined`. A name of only spaces adds none. */
export function addColumn(board: Board, name: string, kind: ColumnKind, after?: string, id: string = newId()): Board {
  const clean = name.trim();
  if (!clean) return board;
  const column: Column = { id, name: clean, kind };
  const at = after === undefined ? board.columns.length : board.columns.findIndex((c) => c.id === after) + 1;
  return { ...board, columns: [...board.columns.slice(0, at), column, ...board.columns.slice(at)] };
}

export function renameColumn(board: Board, id: string, name: string): Board {
  const clean = name.trim();
  if (!clean) return board;
  return { ...board, columns: board.columns.map((c) => (c.id === id ? { ...c, name: clean } : c)) };
}

/** Changes what a column means. The last done column cannot become something else. */
export function setColumnKind(board: Board, id: string, kind: ColumnKind, now: Clock = () => new Date()): Board {
  const column = board.columns.find((c) => c.id === id);
  if (!column || column.kind === kind) return board;
  if (column.kind === 'done' && kind !== 'done' && board.columns.filter((c) => c.kind === 'done').length === 1) return board;
  const stamp = iso(now);
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === id ? { ...c, kind } : c)),
    // Cards in the column are finished, or not, as of now.
    cards: board.cards.map((c) => (c.column === id ? { ...c, completed: kind === 'done' ? (c.completed ?? stamp) : null } : c)),
  };
}

/** Moves a column to just after `after`, or to the front with `null`. */
export function moveColumn(board: Board, id: string, after: string | null): Board {
  const column = board.columns.find((c) => c.id === id);
  if (!column || after === id) return board;
  const rest = board.columns.filter((c) => c.id !== id);
  const at = after === null ? 0 : rest.findIndex((c) => c.id === after) + 1;
  if (after !== null && at === 0) return board;
  return { ...board, columns: [...rest.slice(0, at), column, ...rest.slice(at)] };
}

/**
 * Removes a column; its cards go to the end of the first column that remains. The last column
 * and the last done column stay.
 */
export function removeColumn(board: Board, id: string, now: Clock = () => new Date(), by?: By): Board {
  const column = board.columns.find((c) => c.id === id);
  if (!column || board.columns.length === 1) return board;
  if (column.kind === 'done' && board.columns.filter((c) => c.kind === 'done').length === 1) return board;
  const rest = board.columns.filter((c) => c.id !== id);
  const target = rest[0]!;
  let out: Board = { ...board, columns: rest };
  for (const card of columnCards(board, id)) out = moveCard(out, card.id, { column: target.id, after: columnCards(out, target.id).pop()?.id ?? null }, now, by);
  return out;
}

// ---------- phases ----------

export function setPhasesOn(board: Board, on: boolean): Board {
  return board.phasesOn === on ? board : { ...board, phasesOn: on };
}

/** What a phase is described by, apart from its state. */
export type PhasePatch = Partial<Pick<Phase, 'name' | 'goal' | 'doneWhen' | 'note'>>;

/** Adds a phase at the end. It is current when no other phase is open. */
export function addPhase(board: Board, patch: PhasePatch & { name: string }, id: string = newId()): Board {
  const name = patch.name.trim();
  if (!name) return board;
  const phase: Phase = { id, name, state: 'upcoming', ...cleanPhase(patch) };
  return { ...board, phases: withOneCurrent([...board.phases, phase]) };
}

function cleanPhase(patch: PhasePatch): Omit<PhasePatch, 'name'> {
  const out: Omit<PhasePatch, 'name'> = {};
  if (patch.goal !== undefined) out.goal = patch.goal.trim() || undefined;
  if (patch.doneWhen !== undefined) out.doneWhen = patch.doneWhen.trim() || undefined;
  if (patch.note !== undefined) out.note = patch.note || undefined;
  return out;
}

export function updatePhase(board: Board, id: string, patch: PhasePatch): Board {
  if (patch.name !== undefined && !patch.name.trim()) return board;
  const clean = { ...cleanPhase(patch), ...(patch.name !== undefined && { name: patch.name.trim() }) };
  return { ...board, phases: board.phases.map((p) => (p.id === id ? withoutEmpty({ ...p, ...clean }) : p)) };
}

/** A phase without the fields that were cleared, so the file does not carry them as null. */
function withoutEmpty(phase: Phase): Phase {
  return Object.fromEntries(Object.entries(phase).filter(([, v]) => v !== undefined)) as unknown as Phase;
}

/** Moves a phase to just after `after`, or to the front with `null`. */
export function movePhase(board: Board, id: string, after: string | null): Board {
  const phase = board.phases.find((p) => p.id === id);
  if (!phase || after === id) return board;
  const rest = board.phases.filter((p) => p.id !== id);
  const at = after === null ? 0 : rest.findIndex((p) => p.id === after) + 1;
  if (after !== null && at === 0) return board;
  return { ...board, phases: [...rest.slice(0, at), phase, ...rest.slice(at)] };
}

/** Removes a phase; its cards stay, in no phase. */
export function removePhase(board: Board, id: string): Board {
  if (!board.phases.some((p) => p.id === id)) return board;
  return {
    ...board,
    phases: withOneCurrent(board.phases.filter((p) => p.id !== id)),
    cards: board.cards.map((c) => (c.phase === id ? stripPhase(c) : c)),
  };
}

function stripPhase(card: Card): Card {
  const { phase: _gone, ...rest } = card;
  return rest;
}

/**
 * Where the cards of a phase that are not finished go when it closes and nothing else is said:
 * the next open phase, or the first open one when none comes after it.
 */
export function nextOpenPhase(board: Board, id: string): Phase | undefined {
  const open = (p: Phase) => p.id !== id && p.state !== 'done';
  return board.phases.slice(board.phases.findIndex((p) => p.id === id) + 1).find(open) ?? board.phases.find(open);
}

/**
 * What becomes of a closing phase's cards that are not finished: they go to the next open phase,
 * to the open phase given, to no phase with `'backlog'`, or stay in it with `'stay'`.
 */
export type Leftovers = 'next' | 'backlog' | 'stay' | { phase: string };

/**
 * Closes a phase: it is done, and the next open phase becomes current. Its cards that are not
 * finished go where `leftovers` says; to no phase when the phase it names is not open.
 */
export function closePhase(board: Board, id: string, leftovers: Leftovers, now: Clock = () => new Date()): Board {
  const at = board.phases.findIndex((p) => p.id === id);
  if (at === -1 || board.phases[at]!.state === 'done') return board;
  const target =
    leftovers === 'next' ? nextOpenPhase(board, id) : typeof leftovers === 'object' ? board.phases.find((p) => p.id === leftovers.phase && p.id !== id && p.state !== 'done') : undefined;
  const stamp = iso(now);
  const phases = board.phases.map((p) => (p.id === id ? { ...p, state: 'done' as const } : p.state === 'current' ? { ...p, state: 'upcoming' as const } : p));
  return {
    ...board,
    phases: withOneCurrent(phases),
    cards:
      leftovers === 'stay'
        ? board.cards
        : board.cards.map((c) => {
            if (c.phase !== id || isFinished(board, c)) return c;
            return target ? { ...c, phase: target.id, updated: stamp } : { ...stripPhase(c), updated: stamp };
          }),
  };
}

/** Reopens a phase and makes it current; the phase that was current waits again. */
export function reopenPhase(board: Board, id: string): Board {
  if (!board.phases.some((p) => p.id === id)) return board;
  return { ...board, phases: board.phases.map((p) => (p.id === id ? { ...p, state: 'current' } : p.state === 'current' ? { ...p, state: 'upcoming' } : p)) };
}

// ---------- the board's own fields ----------

/**
 * The board with its own fields as given, in their order, and its cards' choices renamed where a
 * choice of a field was. A value whose field is taken out stays on its card.
 */
export function setBoardFields(board: Board, fields: Field[], renames: ChoiceRenames = {}): Board {
  const { fields: _old, ...rest } = board;
  const renamed = Object.keys(renames).length > 0;
  const cards = renamed
    ? board.cards.map((c) => {
        if (!c.values) return c;
        const values = renameChoices(c.values as CollectionRecord['values'], renames);
        return values === c.values ? c : { ...c, values };
      })
    : board.cards;
  return { ...rest, ...(fields.length > 0 && { fields }), cards };
}

/** Values as a card keeps them: the empty ones left out. */
function filledValues(values: { [key: string]: unknown }): { [key: string]: unknown } | undefined {
  const out = Object.fromEntries(Object.entries(values).filter(([, v]) => !isEmpty(v as FieldValue)));
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------- cards ----------

export interface NewCard {
  title: string;
  /** The column it starts in; the first column when left out. */
  column?: string;
  /** The phase it belongs to; the current phase when left out and phases are on. */
  phase?: string | null;
  description?: string;
  priority?: Priority;
  due?: string | null;
  labels?: string[];
  assignee?: PersonRef | null;
  /** Who makes it; without one, the name its timeline is written with. */
  author?: PersonRef | null;
  /** The note it was made from. */
  note?: string | null;
  /** Values of the board's own fields, by key: a deal added from a company has the company. */
  values?: { [key: string]: FieldValue };
  /** Its subtasks, in their order. */
  subtasks?: NewSubtask[];
  /** Put first in its column rather than last. */
  first?: boolean;
  /** Put right after this card of its column, when it is there: cards typed one after another keep their order. */
  after?: string;
}

/**
 * Adds a card at the end of its column, with the next key: or first, or after a card, as asked.
 * A title of only spaces adds none. Who adds it worked on it; given to someone, its timeline says so.
 */
export function addCard(board: Board, input: NewCard, now: Clock = () => new Date(), by?: By, id: string = newId()): Board {
  const actor = actorIn(by);
  const title = input.title.trim();
  const column = input.column && board.columns.some((c) => c.id === input.column) ? input.column : board.columns[0]?.id;
  if (!title || !column) return board;
  const phase = input.phase === undefined ? (board.phasesOn ? currentPhase(board)?.id : undefined) : input.phase;
  const stamp = iso(now);
  const inColumn = columnCards(board, column);
  const last = inColumn.at(-1);
  const after = input.after ? inColumn.find((c) => c.id === input.after) : undefined;
  const card: Card = {
    id,
    key: board.nextKey,
    title,
    ...(input.description?.trim() && { description: input.description.trim() }),
    column,
    ...(phase && board.phases.some((p) => p.id === phase) && { phase }),
    order: after ? after.order + 1 : input.first ? (inColumn[0]?.order ?? 1) - 1 : (last?.order ?? -1) + 1,
    priority: input.priority ?? 4,
    due: input.due ?? null,
    ...(input.labels && input.labels.length > 0 && { labels: cleanLabels(input.labels) }),
    ...(input.assignee && { assignee: input.assignee }),
    ...(input.author ? { author: input.author } : (actor.id || actor.name) && { author: { ...(actor.id && { id: actor.id }), ...(actor.name && { name: actor.name }) } }),
    ...(input.note && { note: input.note }),
    ...(input.values && filledValues(input.values) && { values: filledValues(input.values) }),
    created: stamp,
    updated: stamp,
    completed: columnOf(board, { column } as Card)?.kind === 'done' ? stamp : null,
    timeline: input.assignee ? [{ id: newId(), at: stamp, ...stampOf(actor), kind: 'assign', given: input.assignee }] : [],
  };
  const subtasks = (input.subtasks ?? []).reduce<Subtask[]>((list, s) => addSubtask(list, s, now), []);
  if (subtasks.length > 0) card.subtasks = subtasks;
  const worked = workedBy(card, actor, stamp).workedOn;
  if (worked) card.workedOn = worked;
  // The cards after it in its column move down one to make room.
  const cards = after ? board.cards.map((c) => (c.column === column && c.order > after.order ? { ...c, order: c.order + 1 } : c)) : board.cards;
  return { ...board, nextKey: board.nextKey + 1, cards: [...cards, card] };
}

/** What can be changed of a card by editing it; `values` changes only the board's fields it names. */
export type CardPatch = Partial<Pick<Card, 'title' | 'description' | 'priority' | 'due' | 'labels' | 'assignee' | 'phase' | 'subtasks' | 'note'>> & { values?: { [key: string]: FieldValue } };

/**
 * Changes a card. An empty title keeps the old one; an empty description, label list, assignee
 * or note is removed; a phase the board does not have is treated as none. Who changes it worked
 * on it; its timeline says who it is given to now and which subtasks they ticked off, the ticks
 * of a few minutes as one entry.
 */
export function updateCard(board: Board, id: string, patch: CardPatch, now: Clock = () => new Date(), by?: By): Board {
  if (patch.title !== undefined && !patch.title.trim()) return board;
  const actor = actorIn(by);
  return {
    ...board,
    cards: board.cards.map((c) => {
      if (c.id !== id) return c;
      const stamp = iso(now);
      const next: Card = { ...c, updated: stamp };
      if (patch.title !== undefined) next.title = patch.title.trim();
      if (patch.priority !== undefined) next.priority = patch.priority;
      if (patch.due !== undefined) next.due = patch.due;
      if (patch.description !== undefined) setOrDrop(next, 'description', patch.description.trim() || undefined);
      if (patch.labels !== undefined) setOrDrop(next, 'labels', patch.labels.length ? cleanLabels(patch.labels) : undefined);
      if (patch.assignee !== undefined) setOrDrop(next, 'assignee', patch.assignee || undefined);
      if (patch.phase !== undefined) setOrDrop(next, 'phase', patch.phase && board.phases.some((p) => p.id === patch.phase) ? patch.phase : undefined);
      if (patch.values !== undefined) setOrDrop(next, 'values', filledValues({ ...c.values, ...patch.values }));
      if (patch.subtasks !== undefined) setOrDrop(next, 'subtasks', patch.subtasks.length > 0 ? patch.subtasks : undefined);
      if (patch.note !== undefined) setOrDrop(next, 'note', patch.note || undefined);
      if (patch.assignee !== undefined && refKey(c.assignee) !== refKey(next.assignee)) {
        next.timeline = [...next.timeline, { id: newId(), at: stamp, ...stampOf(actor), kind: 'assign', ...(next.assignee && { given: next.assignee }) }];
      }
      const ticked = (next.subtasks ?? []).filter((s) => s.done && !c.subtasks?.find((was) => was.id === s.id)?.done).map((s) => s.id);
      if (patch.subtasks !== undefined && ticked.length > 0) next.timeline = withTicks(next.timeline, ticked, actor, stamp);
      return workedBy(next, actor, stamp);
    }),
  };
}

/** The timeline with subtasks ticked off: added to the actor's last entry when it is ticks of a few minutes ago, else a new one. */
function withTicks(timeline: TimelineEntry[], ticked: string[], actor: Actor, stamp: string): TimelineEntry[] {
  const last = timeline.at(-1);
  if (last?.kind === 'tick' && writtenBy(last, actor) && Date.parse(stamp) - Date.parse(last.at) <= TICKS_TOGETHER_MS) {
    return [...timeline.slice(0, -1), { ...last, at: stamp, subtasks: [...new Set([...last.subtasks, ...ticked])] }];
  }
  return [...timeline, { id: newId(), at: stamp, ...stampOf(actor), kind: 'tick', subtasks: ticked }];
}

function setOrDrop<K extends 'description' | 'labels' | 'assignee' | 'phase' | 'values' | 'subtasks' | 'note'>(card: Card, field: K, value: Card[K] | undefined): void {
  if (value === undefined) delete card[field];
  else card[field] = value;
}

/** Where a card goes: its column and the card it comes right after there, null to come first. */
export interface CardPlace {
  column: string;
  after: string | null;
}

/**
 * Moves a card within its column or to another. A change of column is written to the card's
 * timeline, and to who worked on it; entering a done column marks it completed.
 */
export function moveCard(board: Board, id: string, place: CardPlace, now: Clock = () => new Date(), by?: By): Board {
  const actor = actorIn(by);
  const card = board.cards.find((c) => c.id === id);
  const column = board.columns.find((c) => c.id === place.column);
  if (!card || !column) return board;
  const siblings = columnCards(board, place.column).filter((c) => c.id !== id);
  const at = place.after === null ? 0 : siblings.findIndex((c) => c.id === place.after) + 1;
  const ordered = [...siblings.slice(0, at), card, ...siblings.slice(at)];
  const before = columnCards(board, place.column);
  if (card.column === place.column && before.length === ordered.length && before.every((c, i) => c.id === ordered[i]!.id)) return board;
  const orderOf = new Map(ordered.map((c, i) => [c.id, i]));
  const stamp = iso(now);
  const changed = card.column !== place.column;
  return {
    ...board,
    cards: board.cards.map((c) => {
      if (c.id === id) {
        const moved: Card = {
          ...c,
          column: place.column,
          order: orderOf.get(id)!,
          updated: stamp,
          completed: column.kind === 'done' ? (changed ? stamp : c.completed) : null,
          timeline: changed ? [...c.timeline, { id: newId(), at: stamp, ...stampOf(actor), kind: 'move', from: c.column, to: place.column }] : c.timeline,
        };
        return changed ? workedBy(moved, actor, stamp) : moved;
      }
      const order = orderOf.get(c.id);
      return order === undefined || order === c.order ? c : { ...c, order };
    }),
  };
}

/** Moves a card to the end of the first column of `kind`: what an agent does without knowing names. */
export function moveCardToKind(board: Board, id: string, kind: ColumnKind, now: Clock = () => new Date(), by?: By): Board {
  const column = firstColumn(board, kind);
  if (!column) return board;
  return moveCard(board, id, { column: column.id, after: columnCards(board, column.id).filter((c) => c.id !== id).pop()?.id ?? null }, now, by);
}

export function removeCard(board: Board, id: string): Board {
  return board.cards.some((c) => c.id === id) ? { ...board, cards: board.cards.filter((c) => c.id !== id) } : board;
}

/** Points the cards made from the note at `from`, and the phases whose note it is, to the note's new path. */
export function relinkBoardNote(board: Board, from: string, to: string): Board {
  if (!board.cards.some((c) => c.note === from) && !board.phases.some((p) => p.note === from)) return board;
  return {
    ...board,
    cards: board.cards.map((c) => (c.note === from ? { ...c, note: to } : c)),
    phases: board.phases.map((p) => (p.note === from ? { ...p, note: to } : p)),
  };
}

// ---------- comments ----------

/** Adds a comment to a card's timeline. A comment of only spaces adds none. */
export function addComment(board: Board, cardId: string, text: string, now: Clock = () => new Date(), by?: By, id: string = newId()): Board {
  const clean = text.trim();
  if (!clean) return board;
  const stamp = iso(now);
  const actor = actorIn(by);
  return mapCard(board, cardId, (c) => workedBy({ ...c, updated: stamp, timeline: [...c.timeline, { id, at: stamp, ...stampOf(actor), kind: 'comment', text: clean }] }, actor, stamp));
}

/** Changes a comment's text and notes when it was edited. An empty text keeps the old one. */
export function editComment(board: Board, cardId: string, id: string, text: string, now: Clock = () => new Date(), by?: By): Board {
  const clean = text.trim();
  if (!clean) return board;
  const stamp = iso(now);
  return mapCard(board, cardId, (c) =>
    c.timeline.some((e) => e.id === id && e.kind === 'comment' && e.text !== clean)
      ? workedBy({ ...c, updated: stamp, timeline: c.timeline.map((e) => (e.id === id && e.kind === 'comment' ? { ...e, text: clean, edited: stamp } : e)) }, actorIn(by), stamp)
      : { ...c, updated: stamp },
  );
}

export function removeComment(board: Board, cardId: string, id: string, now: Clock = () => new Date(), by?: By): Board {
  const stamp = iso(now);
  return mapCard(board, cardId, (c) =>
    c.timeline.some((e) => e.id === id && e.kind === 'comment') ? workedBy({ ...c, updated: stamp, timeline: c.timeline.filter((e) => e.id !== id) }, actorIn(by), stamp) : c,
  );
}

function mapCard(board: Board, id: string, fn: (card: Card) => Card): Board {
  const card = board.cards.find((c) => c.id === id);
  if (!card) return board;
  const next = fn(card);
  return next === card ? board : { ...board, cards: board.cards.map((c) => (c.id === id ? next : c)) };
}

// ---------- across boards ----------

/** An open card with a due day, and the path of the board it is on. */
export interface DueCard {
  board: string;
  card: Card;
}

/** Dated cards that are not finished, across boards, by day then priority. */
export function dueCards(boards: Record<string, Board>): DueCard[] {
  return Object.entries(boards)
    .flatMap(([path, board]) => board.cards.filter((c) => c.due && !isFinished(board, c)).map((card) => ({ board: path, card })))
    .sort((a, b) => a.card.due!.localeCompare(b.card.due!) || a.card.priority - b.card.priority);
}

/** An open subtask with a due day, of a card not finished, with the card and the path of its board. */
export interface DueCardSubtask {
  board: string;
  card: Card;
  subtask: Subtask;
}

/** The dated subtasks not done of the cards not finished, across boards, by day then priority. */
export function dueCardSubtasks(boards: Record<string, Board>): DueCardSubtask[] {
  return Object.entries(boards)
    .flatMap(([path, board]) =>
      board.cards
        .filter((c) => c.subtasks && !isFinished(board, c))
        .flatMap((card) => card.subtasks!.filter((s) => s.due && !s.done).map((subtask) => ({ board: path, card, subtask }))),
    )
    .sort((a, b) => a.subtask.due!.localeCompare(b.subtask.due!) || a.subtask.priority - b.subtask.priority);
}

/** A board whose link fields point at the collection at `from` point at `to`, where it went; the same board when none does. */
export function retargetBoardLinks(board: Board, from: string, to: string): Board {
  if (!board.fields?.some((f) => f.type === 'link' && f.collection === from)) return board;
  return { ...board, fields: board.fields.map((f) => (f.type === 'link' && f.collection === from ? { ...f, collection: to } : f)) };
}

/** The boards with a link field pointing at the collection at `dir`, by path. */
export const boardsLinkingTo = (boards: Record<string, Board>, dir: string): string[] =>
  Object.keys(boards).filter((path) => boards[path]!.fields?.some((f) => f.type === 'link' && f.collection === dir));

/**
 * The cards whose link fields point at `record` of the collection at `dir`, on every board, with
 * the path of their board: the open ones first, the newest first among each.
 */
export function linkedCards(boards: Record<string, Board>, dir: string, record: Pick<CollectionRecord, 'id' | 'name'>): DueCard[] {
  const found: DueCard[] = [];
  for (const [path, board] of Object.entries(boards)) {
    const fields = (board.fields ?? []).filter((f) => f.type === 'link' && f.collection === dir);
    if (fields.length === 0) continue;
    for (const card of board.cards) if (fields.some((f) => pointsAt(card.values?.[f.key], record))) found.push({ board: path, card });
  }
  const finished = (d: DueCard) => (isFinished(boards[d.board]!, d.card) ? 1 : 0);
  return found.sort((a, b) => finished(a) - finished(b) || b.card.created.localeCompare(a.card.created));
}

// ---------- briefs ----------

/** The texts a brief carries for the notes it links: path to text. */
export type NoteTexts = Record<string, string>;

/**
 * A card as a markdown brief for a person or an agent: key, title, fields, description,
 * comments, and the text of the note it came from when given.
 */
export function cardBrief(board: Board, card: Card, notes: NoteTexts = {}): string {
  const lines = [`# ${keyOf(board, card)} ${card.title}`, ''];
  const fields: string[] = [`Status: ${columnOf(board, card)?.name ?? '?'}`];
  const phase = card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  if (phase) fields.push(`Phase: ${phase.name}`);
  if (card.priority < 4) fields.push(`Priority: p${card.priority}`);
  if (card.due) fields.push(`Due: ${card.due}`);
  if (card.labels?.length) fields.push(`Labels: ${card.labels.join(', ')}`);
  if (card.assignee?.name) fields.push(`Assignee: ${card.assignee.name}`);
  for (const field of board.fields ?? []) {
    const value = cardValue(board, card, field);
    if (!isEmpty(value)) fields.push(`${field.label}: ${valueText(value)}`);
  }
  lines.push(...fields.map((f) => `- ${f}`), '');
  if (card.description) lines.push(card.description.trim(), '');
  if (card.subtasks?.length) {
    lines.push('## Subtasks', '');
    for (const s of card.subtasks) lines.push(`- [${s.done ? 'x' : ' '}] ${s.title}${s.due ? ` (due ${s.due})` : ''}${s.priority < 4 ? ` (p${s.priority})` : ''}`);
    lines.push('');
  }
  const comments = card.timeline.filter((e): e is Extract<TimelineEntry, { kind: 'comment' }> => e.kind === 'comment');
  if (comments.length) {
    lines.push('## Comments', '');
    for (const c of comments) lines.push(`**${c.by ?? '?'}**, ${c.at.slice(0, 16).replace('T', ' ')}:`, '', c.text.trim(), '');
  }
  if (card.note && notes[card.note] !== undefined) lines.push(`## From the note ${card.note}`, '', notes[card.note]!.trim(), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

/** A phase as a brief: its goal, when it is done, and its cards by column. */
export function phaseBrief(board: Board, phase: Phase, notes: NoteTexts = {}): string {
  const lines = [`# ${phase.name}`, ''];
  if (phase.goal) lines.push(phase.goal.trim(), '');
  if (phase.doneWhen) lines.push(`Done when: ${phase.doneWhen.trim()}`, '');
  if (phase.note && notes[phase.note] !== undefined) lines.push(notes[phase.note]!.trim(), '');
  const { done, total } = phaseProgress(board, phase.id);
  lines.push(`## Cards (${done}/${total} done)`, '');
  for (const column of board.columns) {
    const cards = columnCards(board, column.id).filter((c) => c.phase === phase.id);
    if (!cards.length) continue;
    lines.push(`### ${column.name}`, '');
    for (const c of cards) lines.push(`- ${keyOf(board, c)} ${c.title}${c.priority < 4 ? ` (p${c.priority})` : ''}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
