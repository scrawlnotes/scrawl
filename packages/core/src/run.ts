import { t } from '@scrawlnotes/i18n';
import { addCard, type Board, type Card, cardValue, loadBoard, moveCard, type NewCard, removeCard, saveBoard } from './board';
import {
  addRecord,
  type Collection,
  collectionName,
  codeField,
  type Field,
  type FieldValue,
  isComputed,
  isEmpty,
  linkFieldsTo,
  linkTo,
  nameField,
  newRecordId,
  parseRecord,
  pointsAt,
  type Record,
  recordTitle,
  updateRecord,
  valueText,
} from './collection';
import { Computer, valueFor } from './compute';
import { basename, join, type VaultFs } from './fs';
import { type CardRef, dayValue, type Env, equal, evaluate, Fn, fromRuntime, isCardRef, isRef, LangError, type Node, Obj, type Ref, type RV, type Stmt, toRuntime, truthy } from './lang';
import { type ActionRule, lineAt, pathNamed, rulesOf, type SaveRule } from './rules';
import { addSubtask, type NewSubtask } from './subtasks';
import { addTask, loadList, type NewTask, removeTask, saveList, type Task } from './tasks';
import { readTrash, restoreFromTrash, trashItem } from './vault';

// What a button does (design/collection-apps.md 6.2, 6.4): its body is run against the space as it
// is, and nothing is written meanwhile. What it adds, changes and removes is gathered as a list,
// and what it reads after a change sees the change: a record it added is found. Through, the list
// is said (the question before it, the toast after it) and written at once; a body that stops
// halfway, on a mistake or a limit, writes nothing and says on which line it stopped.

/** The most a button may change in one go. */
export const MAX_CHANGES = 500;

/** Where a button runs: the space's collections, boards and task lists as they are, by path. */
export interface RuleSpaceNow {
  collections: readonly Collection[];
  boards: { readonly [path: string]: Board };
  lists: { readonly [path: string]: readonly Task[] };
  today: string;
  /** Who presses it, for me() and for a default. */
  me?: string;
}

/** One thing a button, or what runs on save, does to the space; `by`, the onSave that did it. */
export type Change = (
  | { kind: 'add'; dir: string; id: string; values: Record['values'] }
  | { kind: 'update'; dir: string; id: string; values: Record['values'] }
  | { kind: 'remove'; dir: string; id: string }
  | { kind: 'subtask'; dir: string; id: string; subtask: NewSubtask }
  | { kind: 'card'; board: string; id: string; card: NewCard }
  | { kind: 'move'; board: string; id: string; column: string }
  | { kind: 'task'; list: string; id: string; task: NewTask }
) & { by?: string };

/** What runs on save that stopped: which, on which record, on which line of its rules, and why. */
export interface SaveStop {
  name: string;
  dir: string;
  id: string;
  line: number;
  message: string;
}

/** What a button would do to a record, ready to be said and written; what runs on save of the records it changes is in it. */
export interface Plan {
  action: string;
  dir: string;
  id: string;
  confirm: boolean;
  changes: Change[];
  /** What runs on save that stopped: left out, the rest written. */
  stops?: SaveStop[];
}

/** A button that stopped: on which line of the rules, and why. */
export class RuleStop extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

/** The buttons of a collection's rules, in their order; none when the file cannot be read. */
export const actionsOf = (rules: string | undefined): ActionRule[] => (rules ? (rulesOf(rules)?.actions ?? []) : []);

/** Whether a button may run for a record as it is now, and what it says when it may not: its hint, else its condition as written. */
export function actionState(rules: string, action: ActionRule, computer: Computer, dir: string, record: Record): { on: boolean; hint?: string } {
  if (!action.when) return { on: true };
  let on = false;
  try {
    on = truthy(evaluate(action.when, { ...envOf(computer, dir, record), self: refOf(dir, record) }));
  } catch {
    on = false;
  }
  return on ? { on } : { on, hint: action.hint ?? rules.slice(action.when.at, action.when.end).trim() };
}

const refOf = (dir: string, record: Pick<Record, 'id' | 'name' | 'code'>): Ref => ({ ref: true, dir, id: record.id, name: record.name, ...(record.code && { code: record.code }) });

function envOf(computer: Computer, dir: string, record: Record): Env {
  return {
    today: computer.today,
    field: (key) => computer.read(dir, record, key),
    member: (ref, key) => computer.readMember(ref, key),
  };
}

/** A locals' scope: names given values in a block, and the scope it is in. */
class Locals {
  private readonly names = new Map<string, { value: RV; constant: boolean }>();
  constructor(private readonly outer?: Locals) {}
  get(name: string): RV | undefined {
    return this.names.get(name)?.value ?? this.outer?.get(name);
  }
  has(name: string): boolean {
    return this.names.has(name) || !!this.outer?.has(name);
  }
  declare(name: string, value: RV, constant: boolean) {
    this.names.set(name, { value, constant });
  }
  /** Sets a name given before; false when it is a const. */
  set(name: string, value: RV): boolean {
    const own = this.names.get(name);
    if (own) {
      if (own.constant) return false;
      own.value = value;
      return true;
    }
    return this.outer?.set(name, value) ?? false;
  }
}

/** One run of a body of statements on a record: a button's, or what runs on save. */
interface Run {
  /** The rules file it is written in, for the line it stops on. */
  src: string;
  body: Stmt[];
  dir: string;
  id: string;
  /** What runs on save reads the record as it was, as `old`. */
  old?: Obj;
  /** The onSave's name, put on what it changes. */
  by?: string;
  /** Told of each field of the record it sets. */
  onSet?: (key: string) => void;
}

/** The space as rules see it while they run: what they changed put in it, and the changes gathered. */
interface Overlay {
  collections: Map<string, Collection>;
  boards: Map<string, Board>;
  changes: Change[];
}

const overlayOf = (space: RuleSpaceNow): Overlay => ({
  collections: new Map(space.collections.map((c) => [c.dir, { ...c, records: [...c.records] }])),
  boards: new Map(Object.entries(space.boards).map(([path, b]) => [path, { ...b, cards: [...b.cards] }])),
  changes: [],
});

/** The overlay as it is now; what it gives puts it back so, when what ran next stopped. */
function snapshot(o: Overlay): () => void {
  const collections = new Map([...o.collections].map(([k, c]) => [k, { ...c, records: [...c.records] }]));
  const boards = new Map(o.boards);
  const changes = o.changes.map((c) => ({ ...c, ...('values' in c && { values: { ...c.values } }), ...('card' in c && { card: { ...c.card } }) }) as Change);
  return () => {
    o.collections = collections;
    o.boards = boards;
    o.changes = changes;
  };
}

/** The record as it was, as `old` reads it: its fields, the worked-out ones too; all empty for a new one. */
function oldOf(space: RuleSpaceNow, dir: string, before: Record | null): Obj {
  const fields = space.collections.find((c) => c.dir === dir)?.schema.fields ?? [];
  if (!before) return new Obj(new Map(fields.map((f) => [f.key, null])));
  const computer = new Computer(space.collections, space.boards, space.today);
  return new Obj(new Map(fields.map((f) => [f.key, computer.read(dir, before, f.key)])));
}

/** What a collection runs when one of its records is saved, in their order in its rules. */
export const savesOf = (rules: string | undefined): SaveRule[] => (rules ? (rulesOf(rules)?.saves ?? []) : []);

/**
 * Runs what runs on save for each record the overlay's changes add or change, once each, in their
 * order: what that changes runs nothing again. One that stops is left out and said.
 */
function saveChanged(o: Overlay, space: RuleSpaceNow): SaveStop[] {
  const stops: SaveStop[] = [];
  const seen = new Set<string>();
  const touched = o.changes.flatMap((c) => (c.kind === 'add' || c.kind === 'update' ? [{ dir: c.dir, id: c.id, added: c.kind === 'add' }] : []));
  for (const { dir, id, added } of touched) {
    if (seen.has(`${dir}\u0000${id}`)) continue;
    seen.add(`${dir}\u0000${id}`);
    const src = o.collections.get(dir)?.rules;
    const before = added ? null : (space.collections.find((c) => c.dir === dir)?.records.find((r) => r.id === id) ?? null);
    const old = oldOf(space, dir, before);
    for (const save of savesOf(src)) {
      const back = snapshot(o);
      try {
        execute({ src: src!, body: save.body, dir, id, old, by: save.name }, o, space);
      } catch (error) {
        if (!(error instanceof RuleStop)) throw error;
        back();
        stops.push({ name: save.name, dir, id, line: error.line, message: error.message });
      }
    }
  }
  return stops;
}

/**
 * Runs a button of a record's collection against the space, writing nothing, and gives what it
 * would do, with what runs on save of the records it changes. Throws a RuleStop saying the line
 * and why when it cannot be run through.
 */
export function planAction(rules: string, name: string, dir: string, recordId: string, space: RuleSpaceNow): Plan {
  const action = actionsOf(rules).find((a) => a.name === name);
  if (!action) throw new RuleStop(t('run.noAction', { name }), 0);
  const o = overlayOf(space);
  execute({ src: rules, body: action.body, dir, id: recordId }, o, space, action.when && { node: action.when, name, hint: action.hint, at: action.at });
  const stops = saveChanged(o, space);
  return { action: name, dir, id: recordId, confirm: action.confirm, changes: o.changes, ...(stops.length > 0 && { stops }) };
}

/** What a collection's rules do as a record is saved, writing nothing yet. */
export interface SaveRun {
  /** The record's values as the rules leave them. */
  values: Record['values'];
  /** The fields they set, each with the onSave that set it last. */
  set: { [key: string]: string };
  /** What they do elsewhere, and the record's subtasks, to write right after it; each change with the onSave that made it. */
  after: Plan;
  /** What stopped: its changes left out, the record written as it was given. */
  stops: SaveStop[];
}

/**
 * Runs what a record's collection runs when it is saved: `record` as it is to be written (a new
 * one with the id it will have), `old` as it was, null for a new one. Each onSave sees what the
 * ones before it set; what one changes runs none again. Writes nothing.
 */
export function planSave(dir: string, record: Record, old: Record | null, space: RuleSpaceNow): SaveRun {
  const collection = space.collections.find((c) => c.dir === dir);
  const saves = savesOf(collection?.rules);
  const after: Plan = { action: '', dir, id: record.id, confirm: false, changes: [] };
  if (!collection || saves.length === 0) return { values: record.values, set: {}, after, stops: [] };
  const o = overlayOf(space);
  const home = o.collections.get(dir)!;
  home.records = home.records.some((r) => r.id === record.id) ? home.records.map((r) => (r.id === record.id ? record : r)) : [...home.records, record];
  const was = oldOf(space, dir, old);
  const set: SaveRun['set'] = {};
  const stops: SaveStop[] = [];
  for (const save of saves) {
    const back = snapshot(o);
    const mine: string[] = [];
    try {
      execute({ src: collection.rules!, body: save.body, dir, id: record.id, old: was, by: save.name, onSet: (key) => mine.push(key) }, o, space);
      for (const key of mine) set[key] = save.name;
    } catch (error) {
      if (!(error instanceof RuleStop)) throw error;
      back();
      stops.push({ name: save.name, dir, id: record.id, line: error.line, message: error.message });
    }
  }
  const now = o.collections.get(dir)!.records.find((r) => r.id === record.id) ?? record;
  after.changes = o.changes.filter((c) => !(c.kind === 'update' && c.dir === dir && c.id === record.id));
  return { values: now.values, set, after, stops };
}
function execute(r: Run, o: Overlay, space: RuleSpaceNow, when?: { node: Node; name: string; hint?: string; at: number }): void {
  const { src: rules, dir, id: recordId } = r;
  const stop = (message: string, at: number): never => {
    throw new RuleStop(message, lineAt(rules, at));
  };
  const { collections, boards, changes } = o;
  let computer: Computer | null = null;
  const now = () => (computer ??= new Computer([...collections.values()], Object.fromEntries(boards), space.today));
  const changed = (change: Change, at: number) => {
    if (changes.length >= MAX_CHANGES) stop(t('run.tooMany', { count: MAX_CHANGES }), at);
    changes.push(r.by ? { ...change, by: r.by } : change);
    computer = null;
  };
  const home = collections.get(dir);
  if (!home) throw new RuleStop(t('run.noRecord'), 0);
  const self = () => collections.get(dir)!.records.find((r) => r.id === recordId);
  if (!self()) throw new RuleStop(t('run.noRecord'), 0);
  const named = (kind: 'collection' | 'board' | 'list', value: RV, at: number) => {
    if (typeof value !== 'string') return stop(t('rules.nameInQuotes', { fn: '', what: t(`rules.what.${kind}`) }), at);
    const paths = kind === 'collection' ? [...collections.keys()] : kind === 'board' ? [...boards.keys()] : Object.keys(space.lists);
    const path = pathNamed(paths, value, dir);
    if (!path) return stop(t(kind === 'collection' ? 'rules.noCollection' : kind === 'board' ? 'rules.noBoard' : 'rules.noList', { name: value }), at);
    return path;
  };
  const recordOf = (ref: RV, at: number): { collection: Collection; record: Record } => {
    if (!isRef(ref)) return stop(t('run.notRecord'), at);
    const collection = collections.get(ref.dir);
    const record = collection?.records.find((r) => r.id === ref.id);
    if (!collection || !record) return stop(t('run.gone', { name: ref.name }), at);
    return { collection, record };
  };
  /** The values of a set for a collection's fields, each as its field holds it. */
  const valuesFor = (fields: readonly Field[], set: RV, where: string, at: number, skip: string[] = []): Record['values'] => {
    const values: Record['values'] = {};
    if (set === null || set === undefined) return values;
    if (!(set instanceof Obj)) return stop(t('run.notSet'), at);
    for (const [key, raw] of set.values) {
      if (skip.includes(key.toLowerCase())) continue;
      const field = fields.find((f) => f.key === key.toLowerCase());
      if (!field) stop(t('rules.noFieldIn', { where, name: key }), at);
      if (isComputed(field!.type)) stop(t('rules.computedSet', { name: key }), at);
      values[field!.key] = valueFor(field!, raw);
    }
    return values;
  };
  /** Puts values into a record the button sees, and gathers the change: into what it added, when it is one of those. */
  const patch = (targetDir: string, id: string, values: Record['values'], at: number) => {
    if (targetDir === dir && id === recordId) for (const key of Object.keys(values)) r.onSet?.(key);
    const collection = collections.get(targetDir)!;
    collection.records = collection.records.map((r) => (r.id === id ? withValues(collection, r, values) : r));
    const added = changes.find((c): c is Extract<Change, { kind: 'add' }> => c.kind === 'add' && c.dir === targetDir && c.id === id);
    if (added) {
      added.values = { ...added.values, ...values };
      computer = null;
      return;
    }
    const before = changes.find((c): c is Extract<Change, { kind: 'update' }> => c.kind === 'update' && c.dir === targetDir && c.id === id);
    if (before) {
      before.values = { ...before.values, ...values };
      computer = null;
      return;
    }
    changed({ kind: 'update', dir: targetDir, id, values }, at);
  };
  const matches = (fields: readonly Field[], values: (key: string) => FieldValue | undefined, set: RV, at: number) => {
    if (set === null || set === undefined) return true;
    if (!(set instanceof Obj)) return stop(t('run.notSet'), at);
    for (const [key, wanted] of set.values) {
      const field = fields.find((f) => f.key === key.toLowerCase());
      if (!field) return false;
      const value = values(field.key);
      if (isRef(wanted)) {
        if (!pointsAt(value, { id: wanted.id, name: wanted.name })) return false;
      } else if (!equal(toRuntime(field, value ?? null), wanted)) return false;
    }
    return true;
  };
  const cardOf = (ref: RV, at: number): { path: string; board: Board; card: Card } => {
    if (!isCardRef(ref)) return stop(t('run.notCard'), at);
    const board = boards.get(ref.board);
    const card = board?.cards.find((c) => c.id === ref.id);
    if (!board || !card) return stop(t('run.cardGone'), at);
    return { path: ref.board, board, card };
  };
  const dayOf = (v: RV) => (v === null ? null : (fromRuntime(v) as string | null));
  const own = (fn: string, args: RV[], node: Node): RV | undefined => {
    const at = node.at;
    const me = self()!;
    switch (fn) {
      case 'linked': {
        const path = named('collection', args[0] ?? null, at);
        const source = collections.get(path)!;
        const links = linkFieldsTo(source.schema, dir);
        return source.records.filter((r) => links.some((f) => pointsAt(r.values[f.key], me))).map((r) => refOf(path, r));
      }
      case 'find': {
        const path = named('collection', args[0] ?? null, at);
        const source = collections.get(path)!;
        return source.records.filter((r) => matches(source.schema.fields, (k) => r.values[k], args[1] ?? null, at)).map((r) => refOf(path, r));
      }
      case 'cards': {
        const path = named('board', args[0] ?? null, at);
        const board = boards.get(path)!;
        const set = args[1] ?? null;
        const column = set instanceof Obj ? set.values.get('column') : undefined;
        const rest = set instanceof Obj ? new Obj(new Map([...set.values].filter(([k]) => k !== 'column'))) : set;
        return board.cards
          .filter((c) => (typeof column !== 'string' || board.columns.find((col) => col.id === c.column)?.name.toLowerCase() === column.toLowerCase()) && matches(board.fields ?? [], (k) => cardValue(board, c, (board.fields ?? []).find((f) => f.key === k)!), rest, at))
          .map((c): CardRef => ({ cardref: true, board: path, id: c.id }));
      }
      case 'add': {
        const path = named('collection', args[0] ?? null, at);
        const target = collections.get(path)!;
        const given = valuesFor(target.schema.fields, args[1] ?? null, collectionName(path), at);
        // A link back to the record, when the new one's collection has one and it is not given: as + Add does.
        const back = linkFieldsTo(target.schema, dir).find((f) => isEmpty(given[f.key]));
        if (back) given[back.key] = back.many ? [linkTo(me)] : linkTo(me);
        const values = now().defaults(path, given, space.me);
        const id = newRecordId();
        const record = withValues(target, { id, path: join(path, `${id}.md`), name: '', code: '', values: {}, extra: {}, body: '' }, values);
        target.records = [...target.records, record];
        changed({ kind: 'add', dir: path, id, values }, at);
        return refOf(path, record);
      }
      case 'update': {
        const { collection, record } = recordOf(args[0] ?? null, at);
        patch(collection.dir, record.id, valuesFor(collection.schema.fields, args[1] ?? null, collectionName(collection.dir), at), at);
        return null;
      }
      case 'remove': {
        const { collection, record } = recordOf(args[0] ?? null, at);
        collection.records = collection.records.filter((r) => r.id !== record.id);
        const added = changes.findIndex((c) => c.kind === 'add' && c.dir === collection.dir && c.id === record.id);
        if (added >= 0) changes.splice(added, 1);
        else changed({ kind: 'remove', dir: collection.dir, id: record.id }, at);
        return null;
      }
      case 'card': {
        const path = named('board', args[0] ?? null, at);
        const board = boards.get(path)!;
        const set = args[1];
        if (!(set instanceof Obj) || typeof set.values.get('title') !== 'string') return stop(t('rules.cardTitle'), at);
        const column = set.values.get('column');
        const col = typeof column === 'string' ? board.columns.find((c) => c.name.toLowerCase() === column.trim().toLowerCase()) : board.columns[0];
        if (!col) return stop(t('rules.noColumn', { board: basename(path), name: String(column) }), at);
        const values = valuesFor(board.fields ?? [], set, basename(path), at, ['title', 'column', 'due', 'assignee', 'description', 'priority']);
        const back = (board.fields ?? []).find((f) => f.type === 'link' && f.collection === dir && isEmpty(values[f.key]));
        if (back) values[back.key] = back.many ? [linkTo(me)] : linkTo(me);
        const assignee = set.values.get('assignee');
        const input: NewCard = {
          title: String(set.values.get('title')),
          column: col.id,
          ...(set.values.has('due') && { due: dayOf(set.values.get('due') ?? null) }),
          ...(typeof assignee === 'string' && assignee && { assignee: { name: assignee } }),
          ...(typeof set.values.get('description') === 'string' && { description: String(set.values.get('description')) }),
          ...(Object.keys(values).length > 0 && { values }),
        };
        const id = crypto.randomUUID();
        boards.set(path, addCard(board, input, undefined, undefined, id));
        changed({ kind: 'card', board: path, id, card: input }, at);
        return { cardref: true, board: path, id } satisfies CardRef;
      }
      case 'move': {
        const { path, board, card } = cardOf(args[0] ?? null, at);
        const column = args[1];
        const col = typeof column === 'string' ? board.columns.find((c) => c.name.toLowerCase() === column.trim().toLowerCase()) : undefined;
        if (!col) return stop(t('rules.noColumn', { board: basename(path), name: String(column) }), at);
        if (card.column === col.id) return null;
        boards.set(path, moveCard(board, card.id, { column: col.id, after: null }));
        const added = changes.find((c): c is Extract<Change, { kind: 'card' }> => c.kind === 'card' && c.id === card.id);
        if (added) added.card = { ...added.card, column: col.id };
        else changed({ kind: 'move', board: path, id: card.id, column: col.id }, at);
        return null;
      }
      case 'subtask': {
        const title = args[0];
        if (typeof title !== 'string' || !title.trim()) return stop(t('run.subtaskTitle'), at);
        const set = args[1];
        const assignee = set instanceof Obj ? set.values.get('assignee') : undefined;
        const subtask: NewSubtask = {
          title: title.trim(),
          ...(set instanceof Obj && set.values.has('due') && { due: dayOf(set.values.get('due') ?? null) }),
          ...(typeof assignee === 'string' && assignee && { assignee: { name: assignee } }),
        };
        changed({ kind: 'subtask', dir, id: recordId, subtask }, at);
        return null;
      }
      case 'task': {
        const list = named('list', args[0] ?? null, at);
        const set = args[1];
        if (!(set instanceof Obj) || typeof set.values.get('title') !== 'string') return stop(t('rules.taskTitle'), at);
        const task: NewTask = {
          title: String(set.values.get('title')),
          ...(set.values.has('due') && { due: dayOf(set.values.get('due') ?? null) }),
          record: { collection: dir, id: me.id, name: me.name, ...(me.code && { code: me.code }) },
        };
        changed({ kind: 'task', list, id: crypto.randomUUID(), task }, at);
        return null;
      }
      default:
        return undefined;
    }
  };
  const steps = { n: 0 };
  const envFor = (locals: Locals): Env => {
    const me = self()!;
    return {
      ...envOf(now(), dir, me),
      ...(space.me && { me: space.me }),
      self: refOf(dir, me),
      local: (name) => locals.get(name),
      rule: own,
      cardMember: (ref, key) => {
        const board = boards.get(ref.board);
        const card = board?.cards.find((c) => c.id === ref.id);
        if (!board || !card) return null;
        if (key === 'title') return card.title;
        if (key === 'column') return board.columns.find((c) => c.id === card.column)?.name ?? null;
        if (key === 'due') return card.due ? dayValue(card.due) : null;
        if (key === 'assignee') return card.assignee?.name ?? null;
        const field = (board.fields ?? []).find((f) => f.key === key);
        return field ? toRuntime(field, cardValue(board, card, field, space.today)) : null;
      },
      steps,
    };
  };
  const value = (node: Node, locals: Locals): RV => {
    try {
      return evaluate(node, envFor(locals));
    } catch (error) {
      if (error instanceof LangError) return stop(error.message, error.at || node.at);
      throw error;
    }
  };
  const run = (stmts: Stmt[], locals: Locals): 'return' | void => {
    for (const s of stmts) {
      if (++steps.n > 100000) stop(t('lang.tooMuch'), s.at);
      switch (s.k) {
        case 'let':
          locals.declare(s.name, value(s.value, locals), s.constant);
          break;
        case 'set': {
          const v = value(s.value, locals);
          if (locals.has(s.name)) {
            if (!locals.set(s.name, v)) stop(t('rules.constant', { name: s.name }), s.at);
            break;
          }
          const field = home.schema.fields.find((f) => f.key === s.name);
          if (!field) stop(t('fields.formulaUnknown', { name: s.name }), s.at);
          if (isComputed(field!.type)) stop(t('rules.computedSet', { name: s.name }), s.at);
          patch(dir, recordId, { [field!.key]: valueFor(field!, v) }, s.at);
          break;
        }
        case 'if':
          if (run(truthy(value(s.test, locals)) ? s.yes : s.no, new Locals(locals)) === 'return') return 'return';
          break;
        case 'for': {
          const list = value(s.of, locals);
          if (!Array.isArray(list)) stop(t('run.notListToLoop'), s.of.at);
          for (const item of list as RV[]) {
            const inner = new Locals(locals);
            inner.declare(s.name, item, true);
            if (run(s.body, inner) === 'return') return 'return';
          }
          break;
        }
        case 'return':
          return 'return';
        case 'expr': {
          const v = value(s.node, locals);
          // A function written as a statement is run: a block given to forEach-like hands.
          if (v instanceof Fn && Array.isArray(v.body)) run(v.body, new Locals(locals));
          break;
        }
      }
    }
  };
  if (when) {
    const on = value(when.node, new Locals());
    if (!truthy(on)) throw new RuleStop(t('run.notNow', { name: when.name, hint: when.hint ?? rules.slice(when.node.at, when.node.end).trim() }), lineAt(rules, when.at));
  }
  const root = new Locals();
  if (r.old) root.declare('old', r.old, true);
  run(r.body, root);
}

/** A record of a collection with these values, its name and code following: a new one, before it is written. */
export const recordWith = (collection: Pick<Collection, 'dir' | 'schema'>, id: string, values: Record['values']): Record =>
  withValues(collection, { id, path: join(collection.dir, `${id}.md`), name: '', code: '', values: {}, extra: {}, body: '' }, values);

/** A record with values put in, its name and code following. */
function withValues(collection: Pick<Collection, 'schema'>, record: Record, values: Record['values']): Record {
  const next = { ...record.values, ...values };
  const named = nameField(collection.schema);
  const coded = codeField(collection.schema);
  return { ...record, values: next, name: named ? valueText(next[named.key] ?? null) : record.name, code: coded ? valueText(next[coded.key] ?? null) : record.code };
}

// ---------- what a plan says ----------

/** How many of a collection's records, said: "3 budget lines", "1 budget line" (its singular), "1 record". */
function countOf(collection: Collection | undefined, dir: string, count: number): string {
  if (count === 1) return t('run.one', { what: collection?.schema.singular ?? t('run.record') });
  return t('run.many', { count, what: collectionName(dir).toLowerCase() });
}

const listed = (names: string[]) => (names.length > 5 ? `${names.slice(0, 5).join(', ')}, …` : names.join(', '));

/** A line of the question before a button: what it does, and the names of what it adds or removes, said faint after it; a `head` names the onSave the lines after it are of. */
export interface AskLine {
  text: string;
  names?: string;
  head?: boolean;
}

type Words = Pick<RuleSpaceNow, 'collections' | 'boards' | 'lists'>;

/**
 * What some changes do, said three ways: lines of the question (`ask`), pieces of the toast after
 * a button (`done`) and after a save (`past`); the record's own fields apart, last.
 */
function phrases(changes: Change[], plan: Pick<Plan, 'dir' | 'id'>, space: Words) {
  const ask: AskLine[] = [];
  const done: string[] = [];
  const past: string[] = [];
  const fields: { ask: AskLine[]; done: string[] } = { ask: [], done: [] };
  const line = (text: string, names: string[] = []): AskLine => (names.length > 0 ? { text, names: listed(names) } : { text });
  const collection = (dir: string) => space.collections.find((c) => c.dir === dir);
  const adds = new Map<string, string[]>();
  const updates = new Map<string, number>();
  const removes = new Map<string, string[]>();
  for (const c of changes) {
    if (c.kind === 'add') {
      const schema = collection(c.dir)?.schema;
      const named = schema && nameField(schema);
      adds.set(c.dir, [...(adds.get(c.dir) ?? []), named ? valueText(c.values[named.key] ?? null) : ''].filter((n) => n !== undefined));
    } else if (c.kind === 'update' && !(c.dir === plan.dir && c.id === plan.id)) updates.set(c.dir, (updates.get(c.dir) ?? 0) + 1);
    else if (c.kind === 'remove') removes.set(c.dir, [...(removes.get(c.dir) ?? []), recordTitle(collection(c.dir)?.records.find((r) => r.id === c.id) ?? { name: '', code: '' })]);
  }
  for (const [dir, names] of adds) {
    const what = countOf(collection(dir), dir, names.length);
    const shown = names.filter(Boolean);
    ask.push(line(t('run.askAdd', { what }), shown));
    done.push(what);
    past.push(t('run.added', { what }));
  }
  const subtasks = changes.filter((c): c is Extract<Change, { kind: 'subtask' }> => c.kind === 'subtask');
  if (subtasks.length > 0) {
    const what = t('run.subtasks', { count: subtasks.length });
    ask.push(line(t('run.askAdd', { what }), subtasks.map((s) => s.subtask.title)));
    done.push(what);
    past.push(t('run.added', { what }));
  }
  const cards = changes.filter((c): c is Extract<Change, { kind: 'card' }> => c.kind === 'card');
  for (const path of new Set(cards.map((c) => c.board))) {
    const here = cards.filter((c) => c.board === path);
    const what = t('run.cards', { count: here.length });
    const board = basename(path).replace(/\.board\.json$/i, '');
    ask.push(line(t('run.askCards', { what, board }), here.map((c) => c.card.title)));
    done.push(what);
    past.push(t('run.addedTo', { what, where: board }));
  }
  const moves = changes.filter((c): c is Extract<Change, { kind: 'move' }> => c.kind === 'move');
  for (const column of new Set(moves.map((m) => `${m.board}\u0000${m.column}`))) {
    const [path, id] = column.split('\u0000') as [string, string];
    const count = moves.filter((m) => m.board === path && m.column === id).length;
    const name = space.boards[path]?.columns.find((c) => c.id === id)?.name ?? id;
    ask.push(line(t('run.askMove', { what: t('run.cards', { count }), column: name })));
    done.push(t('run.moved', { what: t('run.cards', { count }), column: name }));
    past.push(t('run.movedTo', { what: t('run.cards', { count }), column: name }));
  }
  const tasks = changes.filter((c): c is Extract<Change, { kind: 'task' }> => c.kind === 'task');
  for (const list of new Set(tasks.map((c) => c.list))) {
    const here = tasks.filter((c) => c.list === list);
    const what = t('run.tasks', { count: here.length });
    const name = basename(list).replace(/\.tasks\.json$/i, '');
    ask.push(line(t('run.askTasks', { what, list: name }), here.map((c) => c.task.title)));
    done.push(what);
    past.push(t('run.addedTo', { what, where: name }));
  }
  for (const [dir, count] of updates) {
    const what = countOf(collection(dir), dir, count);
    ask.push(line(t('run.askChange', { what })));
    done.push(t('run.changed', { what }));
    past.push(t('run.changed', { what }));
  }
  for (const [dir, names] of removes) {
    const what = countOf(collection(dir), dir, names.length);
    ask.push(line(t('run.askRemove', { what }), names));
    done.push(t('run.removed', { what }));
    past.push(t('run.removed', { what }));
  }
  // The record's own fields: from what they were to what they will be.
  const home = collection(plan.dir);
  const record = home?.records.find((r) => r.id === plan.id);
  const own = changes.find((c): c is Extract<Change, { kind: 'update' }> => c.kind === 'update' && c.dir === plan.dir && c.id === plan.id);
  for (const [key, value] of Object.entries(own?.values ?? {})) {
    const field = home?.schema.fields.find((f) => f.key === key);
    const label = field?.label ?? key;
    const before = valueText(record?.values[key] ?? null);
    const after = valueText(value);
    fields.ask.push(line(before ? t('run.askFromTo', { field: label, from: before, to: after || t('run.nothing') }) : t('run.askSet', { field: label, to: after || t('run.nothing') })));
    fields.done.push(t('run.fieldNow', { field: label, to: after || t('run.nothing') }));
  }
  return { ask, done, past, fields };
}

/** The onSaves that made some of the changes, in the order they first did. */
const bysOf = (changes: Change[]) => [...new Set(changes.flatMap((c) => (c.by ? [c.by] : [])))];

/**
 * What a plan does, in the words of the question before it (`ask`, one line each: what it adds
 * with their names, the record's fields from and to, then what each onSave of the records it
 * changes does, under its name) and of the toast after it (`done`).
 */
export function planWords(plan: Plan, space: Words): { ask: AskLine[]; done: string } {
  const main = phrases(plan.changes.filter((c) => !c.by), plan, space);
  const ask = [...main.ask, ...main.fields.ask];
  const done = [...main.done];
  for (const by of bysOf(plan.changes)) {
    const group = phrases(plan.changes.filter((c) => c.by === by), plan, space);
    if (group.ask.length > 0) ask.push({ text: t('run.askThen', { name: by }), head: true }, ...group.ask);
    done.push(...group.done);
  }
  done.push(...main.fields.done);
  return { ask, done: done.length > 0 ? `${plan.action}: ${done.join(', ')}` : t('run.nothingDone', { name: plan.action }) };
}

/** What a record's onSaves did elsewhere, for the toast after it is saved: "Kickoff card: 1 card added to Projects board"; empty when nothing. */
export function savedWords(after: Plan, space: Words): string {
  return bysOf(after.changes)
    .map((by) => {
      const { past } = phrases(after.changes.filter((c) => c.by === by), after, space);
      return past.length > 0 ? `${by}: ${past.join(', ')}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

// ---------- writing a plan ----------

/** Puts a plan's changes in the space's files at once; gives what undoes them: the added to the trash, the changed back, the removed from the trash. */
export async function writePlan(fs: VaultFs, plan: Plan, space: Pick<RuleSpaceNow, 'collections'>, now: () => Date = () => new Date(), by?: string): Promise<() => Promise<void>> {
  const undo: (() => Promise<void>)[] = [];
  const collection = (dir: string) => space.collections.find((c) => c.dir === dir);
  const fresh = async (dir: string, id: string): Promise<Record | null> => {
    const c = collection(dir);
    const known = c?.records.find((r) => r.id === id);
    if (!c || !known) return null;
    try {
      return parseRecord(await fs.readText(known.path), c.schema, known.path);
    } catch {
      return null;
    }
  };
  for (const change of plan.changes) {
    if (change.kind === 'add') {
      const c = collection(change.dir);
      if (!c) continue;
      const record = await addRecord(fs, c, { values: change.values }, change.id);
      undo.push(() => trashItem(fs, record.path).catch(() => undefined));
    } else if (change.kind === 'update') {
      const c = collection(change.dir);
      const record = await fresh(change.dir, change.id);
      if (!c || !record) continue;
      const before = Object.fromEntries(Object.keys(change.values).map((k) => [k, record.values[k] ?? null]));
      await updateRecord(fs, c.schema, record, { values: change.values });
      undo.push(async () => {
        const current = await fresh(change.dir, change.id);
        if (current) await updateRecord(fs, c.schema, current, { values: before });
      });
    } else if (change.kind === 'subtask') {
      const c = collection(change.dir);
      const record = await fresh(change.dir, change.id);
      if (!c || !record) continue;
      const id = crypto.randomUUID();
      await updateRecord(fs, c.schema, record, { subtasks: addSubtask(record.subtasks ?? [], change.subtask, now, id) });
      undo.push(async () => {
        const current = await fresh(change.dir, change.id);
        if (current) await updateRecord(fs, c.schema, current, { subtasks: (current.subtasks ?? []).filter((s) => s.id !== id) });
      });
    } else if (change.kind === 'remove') {
      const record = collection(change.dir)?.records.find((r) => r.id === change.id);
      if (!record) continue;
      await trashItem(fs, record.path, now());
      undo.push(async () => {
        const item = (await readTrash(fs)).find((i) => i.from === record.path);
        if (item) await restoreFromTrash(fs, item);
      });
    } else if (change.kind === 'card') {
      const board = await loadBoard(fs, change.board);
      await saveBoard(fs, change.board, addCard(board, change.card, now, by, change.id));
      undo.push(async () => saveBoard(fs, change.board, removeCard(await loadBoard(fs, change.board), change.id)));
    } else if (change.kind === 'move') {
      const board = await loadBoard(fs, change.board);
      const was = board.cards.find((c) => c.id === change.id)?.column;
      await saveBoard(fs, change.board, moveCard(board, change.id, { column: change.column, after: null }, now, by));
      if (was) undo.push(async () => saveBoard(fs, change.board, moveCard(await loadBoard(fs, change.board), change.id, { column: was, after: null }, now, by)));
    } else if (change.kind === 'task') {
      const list = await loadList(fs, change.list);
      await saveList(fs, change.list, { ...list, tasks: addTask(list.tasks, change.task, now, change.id) });
      undo.push(async () => {
        const current = await loadList(fs, change.list);
        await saveList(fs, change.list, { ...current, tasks: removeTask(current.tasks, change.id) });
      });
    }
  }
  return async () => {
    for (const step of undo.reverse()) await step();
  };
}

