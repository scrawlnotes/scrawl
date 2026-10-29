import { t } from '@scrawlnotes/i18n';
import { basename, dirname, join } from './fs';
import type { Field, FieldValue } from './collection';
import { ASK_INPUT, check, type Env, evaluate, isNothing, type Kind, LangError, type Node, type Reader, reader, type Scope, type Stmt, textOf, tokenize, truthy } from './lang';

// A collection's rules: a file beside its schema, `_rules.js`, written in the language of formulas.
// It is never run as JS: our own reader takes only the calls it knows, at its top. A check says
// what a record must be: `check("delivery", () => delivery >= start, "Delivery is before the start")`.
// A record that fails one is not refused, it is marked at that field, or as a whole for `null`;
// one whose check gives nothing (a field not written yet) does not fail. Checks are worked out
// wherever the record is read and write nothing. A button is
// `action("Start project", { when: () => status == "Offer", confirm: true }, () => { … })`: its
// body is statements that read the space's records, cards and tasks and change them (run.ts).
// What runs when a record is saved is `onSave("Paid date", () => { … })`: a body as a button's,
// reading the record as it is saved and `old`, the record as it was. See design/collection-apps.md 6.

export const RULES_FILE = '_rules.js';

/** Where a collection's rules are. */
export const rulesPath = (dir: string) => join(dir, RULES_FILE);

/** The longest a rules file may be. */
export const MAX_RULES = 50000;

/** A check as read: the field it is shown at (null for the record), what must hold, and what to say when it does not. */
export interface CheckRule {
  field: string | null;
  /** Where the field is named in the file. */
  fieldAt: number;
  test: Node;
  /** A text, or a text with `${}` in it. */
  message: Node;
  at: number;
}

/** What a question of a button asks for. */
export const ASK_TYPES = ['number', 'text', 'date', 'time', 'choice', 'link', 'person', 'rows', 'tick'] as const;
export type AskType = (typeof ASK_TYPES)[number];

/**
 * What a question of rows is answered with, a row each (design/scrawl-apps.md 3.6): the row's
 * record by its id, the number asked of it, and its choice when it asks one. A purchase order's
 * lines as they came, an order's items coming back and why.
 */
export interface RowAnswer {
  id: string;
  count: number;
  why?: string | null;
}

/** The answers a button is given, by its questions' keys: a field's value, or a question of rows' rows. */
export type AskAnswers = { [key: string]: FieldValue | RowAnswer[] };

export const isRowAnswers = (value: unknown): value is RowAnswer[] =>
  Array.isArray(value) && value.every((r) => typeof r === 'object' && r !== null && typeof (r as RowAnswer).id === 'string' && typeof (r as RowAnswer).count === 'number');

/** The fields of a row as the button's body reads it: the record it is, its number, its choice. */
export const ROW_KEYS = { row: 'row', count: 'count', why: 'why' } as const;

/** A question a button asks before it runs, read in its body as `input.key`. */
export interface AskRule {
  key: string;
  label: string;
  type: AskType;
  /** A choice's options. */
  options?: string[];
  /** A link's collection, by name as the person calls it. */
  collection?: string;
  /** A date that takes its time too. */
  time?: boolean;
  /** A value, or what works one out from the record. */
  default?: Node;
  required: boolean;
  /** The line under its box: a text, or what works one out. */
  note?: Node;
  /** A choice picked from its options side by side: Call, Meeting, Email, Note. */
  chips?: boolean;
  /** A text of several lines: what was said. */
  lines?: boolean;
  /** It and the questions after it are a group of their own under this title: the next step (design/scrawl-apps.md 3.1). */
  section?: string;
  /** A link offers only the records whose field of this key points at the record pressed: a company's deals, its people. */
  within?: string;
  /**
   * Rows: the fields of each row shown beside its name, by key, with what their column is called:
   * a purchase order line's quantity as Ordered. Its `collection` is the rows', the records of it
   * that link to the record pressed; its label is the number's column, Came.
   */
  show?: { key: string; label: string }[];
  /** Rows: the field of each row its number starts at: what is still to come. */
  from?: string;
  /** Rows: a choice asked of each row too, and what its column is called: why it comes back. */
  why?: { label: string; options: string[] };
  at: number;
}

/** A button as read: its label, when it may run (and what it says when it may not), whether it asks first, what it asks for, and what it does. */
export interface ActionRule {
  name: string;
  when?: Node;
  hint?: string;
  confirm: boolean;
  /** The sentence under its window's title. */
  say?: Node;
  /** What its toast says once it has run, worked out over the record as it is then: "Dandadan · episode 7 watched". */
  done?: Node;
  ask?: AskRule[];
  body: Stmt[];
  at: number;
}

/** What runs when a record is saved, as read: its name and what it does. */
export interface SaveRule {
  name: string;
  body: Stmt[];
  at: number;
}

/** What runs when a field changes, as read (design/gym.md 4.1): the field, its name and what it does. */
export interface ChangeRule {
  /** The first field it watches. */
  field: string;
  /** Every field it watches: an expense's shares, worked out again as its amount, who paid or for whom changes (design/more-apps.md 4.11). */
  fields: string[];
  /** Where the field is named in the file. */
  fieldAt: number;
  name: string;
  body: Stmt[];
  at: number;
}

export interface Rules {
  checks: CheckRule[];
  actions: ActionRule[];
  saves: SaveRule[];
  changes: ChangeRule[];
}

/** What is wrong with a rules file: where, on which line, and what. */
export interface RuleProblem {
  at: number;
  line: number;
  message: string;
}

/** Reads a rules file; throws a LangError at the first thing in it that is not a rule. */
export function parseRules(src: string): Rules {
  if (src.length > MAX_RULES) throw new LangError(t('rules.tooLong', { count: MAX_RULES }));
  const read: Reader = reader(tokenize(src));
  const checks: CheckRule[] = [];
  const actions: ActionRule[] = [];
  const saves: SaveRule[] = [];
  const changes: ChangeRule[] = [];
  while (read.peek().k !== 'end') {
    const start = read.next();
    if (start.k !== 'id') read.fail(start);
    if ((start.v !== 'check' && start.v !== 'action' && start.v !== 'onsave' && start.v !== 'onchange') || !read.isOp('(')) throw new LangError(t('rules.onlyCheck'), start.at);
    read.next();
    if (start.v === 'action') {
      actions.push(readAction(read, start.at, actions));
      continue;
    }
    if (start.v === 'onsave') {
      saves.push(readSave(read, start.at, saves));
      continue;
    }
    if (start.v === 'onchange') {
      changes.push(readChange(read, start.at, changes));
      continue;
    }
    const first = read.next();
    let field: string | null;
    if (first.k === 'str' && first.v.trim()) field = first.v.trim();
    else if (first.k === 'id' && first.v === 'null') field = null;
    else throw new LangError(t('rules.checkField'), first.at);
    read.expect(',');
    if (!read.isOp('(')) throw new LangError(t('rules.checkTest'), read.peek().at);
    read.next();
    read.expect(')');
    read.expect('=>');
    const test = read.expression();
    read.expect(',');
    const message = read.expression();
    if (message.k !== 'str' && message.k !== 'tpl') throw new LangError(t('rules.checkMessage'), message.at);
    read.expect(')');
    if (read.isOp(';')) read.next();
    checks.push({ field, fieldAt: first.at, test, message, at: start.at });
  }
  return { checks, actions, saves, changes };
}

/** The rest of `onChange(`: the field, or a list of them, its name and its body. */
function readChange(read: Reader, at: number, before: readonly ChangeRule[]): ChangeRule {
  const fieldAt = read.peek().at;
  const fields: string[] = [];
  const one = () => {
    const each = read.next();
    if (each.k !== 'str' || !each.v.trim()) throw new LangError(t('rules.changeField'), each.at);
    fields.push(each.v.trim());
  };
  if (read.isOp('[')) {
    read.next();
    one();
    while (read.isOp(',')) {
      read.next();
      one();
    }
    read.expect(']');
  } else one();
  read.expect(',');
  const { name, body } = readSave(read, at, before, true);
  return { field: fields[0]!, fields, fieldAt, name, body, at };
}

/** The rest of `onSave(`: its name and its body. */
function readSave(read: Reader, at: number, before: readonly SaveRule[], change = false): SaveRule {
  const label = read.next();
  if (label.k !== 'str' || !label.v.trim()) throw new LangError(t(change ? 'rules.changeName' : 'rules.saveName'), label.at);
  const name = label.v.trim();
  if (before.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new LangError(t(change ? 'rules.changeTwice' : 'rules.saveTwice', { name }), label.at);
  read.expect(',');
  const body = read.expression();
  if (body.k !== 'arrow' || body.params.length > 0) throw new LangError(t(change ? 'rules.changeBody' : 'rules.saveBody'), body.at);
  read.expect(')');
  if (read.isOp(';')) read.next();
  return { name, body: Array.isArray(body.body) ? body.body : [{ k: 'expr', node: body.body, at: body.body.at }], at };
}

/** The rest of `action(`: its label, its options, its body. */
function readAction(read: Reader, at: number, before: readonly ActionRule[]): ActionRule {
  const label = read.next();
  if (label.k !== 'str' || !label.v.trim()) throw new LangError(t('rules.actionName'), label.at);
  const name = label.v.trim();
  if (before.some((a) => a.name.toLowerCase() === name.toLowerCase())) throw new LangError(t('rules.actionTwice', { name }), label.at);
  read.expect(',');
  let options: Node | null = null;
  let body = read.expression();
  if (body.k === 'obj') {
    options = body;
    read.expect(',');
    body = read.expression();
  }
  if (body.k !== 'arrow' || body.params.length > 0) throw new LangError(t('rules.actionBody'), body.at);
  read.expect(')');
  if (read.isOp(';')) read.next();
  const action: ActionRule = { name, confirm: false, body: Array.isArray(body.body) ? body.body : [{ k: 'expr', node: body.body, at: body.body.at }], at };
  for (const entry of options?.k === 'obj' ? options.entries : []) {
    const value = entry.value;
    if (entry.key === 'when') {
      if (value.k !== 'arrow' || Array.isArray(value.body) || value.params.length > 0) throw new LangError(t('rules.actionWhen'), value.at);
      action.when = value.body;
    } else if (entry.key === 'confirm') {
      if (value.k !== 'bool') throw new LangError(t('rules.actionConfirm'), value.at);
      action.confirm = value.v;
    } else if (entry.key === 'hint') {
      if (value.k !== 'str') throw new LangError(t('rules.actionHint'), value.at);
      action.hint = value.v;
    } else if (entry.key === 'say') {
      action.say = textNode(value, 'rules.actionSay');
    } else if (entry.key === 'done') {
      action.done = textNode(value, 'rules.actionDone');
    } else if (entry.key === 'ask') {
      action.ask = readAsk(value);
    } else throw new LangError(t('rules.actionOption', { name: entry.key }), entry.at);
  }
  return action;
}

/** A text, or `() => ` a text: what a button's say or a question's note is. */
function textNode(value: Node, wrong: Parameters<typeof t>[0]): Node {
  if (value.k === 'str' || value.k === 'tpl') return value;
  if (value.k === 'arrow' && !Array.isArray(value.body) && value.params.length === 0) return value.body;
  throw new LangError(t(wrong), value.at);
}

/** A button's questions: `{ total: { label: "Counted total", type: "number" } }`. */
function readAsk(value: Node): AskRule[] {
  if (value.k !== 'obj' || value.entries.length === 0) throw new LangError(t('rules.askShape'), value.at);
  return value.entries.map((entry) => {
    const spec = entry.value;
    if (spec.k !== 'obj') throw new LangError(t('rules.askShape'), spec.at);
    const ask: AskRule = { key: entry.key, label: entry.key, type: 'text', required: false, at: entry.at };
    let typed = false;
    for (const part of spec.entries) {
      const v = part.value;
      if (part.key === 'label') {
        if (v.k !== 'str' || !v.v.trim()) throw new LangError(t('rules.askLabel'), v.at);
        ask.label = v.v.trim();
      } else if (part.key === 'type') {
        if (v.k !== 'str' || !(ASK_TYPES as readonly string[]).includes(v.v)) throw new LangError(t('rules.askType'), v.at);
        ask.type = v.v as AskType;
        typed = true;
      } else if (part.key === 'options') {
        if (v.k !== 'list' || v.items.length === 0 || v.items.some((i) => i.k !== 'str')) throw new LangError(t('rules.askOptions'), v.at);
        ask.options = v.items.map((i) => (i as { v: string }).v);
      } else if (part.key === 'collection') {
        if (v.k !== 'str' || !v.v.trim()) throw new LangError(t('rules.askCollection'), v.at);
        ask.collection = v.v.trim();
      } else if (part.key === 'default') {
        ask.default = v.k === 'arrow' && !Array.isArray(v.body) && v.params.length === 0 ? v.body : v;
      } else if (part.key === 'time') {
        if (v.k !== 'bool') throw new LangError(t('rules.askTime'), v.at);
        ask.time = v.v;
      } else if (part.key === 'required') {
        if (v.k !== 'bool') throw new LangError(t('rules.askRequired'), v.at);
        ask.required = v.v;
      } else if (part.key === 'note') {
        ask.note = textNode(v, 'rules.askNote');
      } else if (part.key === 'chips' || part.key === 'lines') {
        if (v.k !== 'bool') throw new LangError(t('rules.askFlag', { name: part.key }), v.at);
        ask[part.key] = v.v;
      } else if (part.key === 'section') {
        if (v.k !== 'str' || !v.v.trim()) throw new LangError(t('rules.askSection'), v.at);
        ask.section = v.v.trim();
      } else if (part.key === 'within') {
        if (v.k !== 'str' || !v.v.trim()) throw new LangError(t('rules.askWithin'), v.at);
        ask.within = v.v.trim().toLowerCase();
      } else if (part.key === 'show') {
        // { quantity: "Ordered" }: a field of the row and its column's name.
        if (v.k !== 'obj' || v.entries.some((e) => e.value.k !== 'str')) throw new LangError(t('rules.askShow'), v.at);
        ask.show = v.entries.map((e) => ({ key: e.key, label: (e.value as { v: string }).v }));
      } else if (part.key === 'from') {
        if (v.k !== 'str' || !v.v.trim()) throw new LangError(t('rules.askFrom'), v.at);
        ask.from = v.v.trim();
      } else if (part.key === 'why') {
        const label = v.k === 'obj' ? v.entries.find((e) => e.key === 'label')?.value : undefined;
        const options = v.k === 'obj' ? v.entries.find((e) => e.key === 'options')?.value : undefined;
        if (label?.k !== 'str' || options?.k !== 'list' || options.items.length === 0 || options.items.some((i) => i.k !== 'str')) throw new LangError(t('rules.askWhy'), v.at);
        ask.why = { label: label.v, options: options.items.map((i) => (i as { v: string }).v) };
      } else throw new LangError(t('rules.askPart', { name: part.key }), part.at);
    }
    if (!typed) throw new LangError(t('rules.askType'), spec.at);
    if (ask.type === 'choice' && !ask.options) throw new LangError(t('rules.askOptions'), spec.at);
    if ((ask.type === 'link' || ask.type === 'rows') && !ask.collection) throw new LangError(t('rules.askCollection'), spec.at);
    return ask;
  });
}

/** A question as a field, for what reads its answer: a choice is a select, a link links to `collection` (a path). */
export function askField(ask: AskRule, collection?: string, button = ''): Field {
  // Rows are read as a list of records of their own: input.lines, each with its row, count and why.
  if (ask.type === 'rows') return { key: ask.key, label: ask.label, type: 'link', many: true, collection: rowsPath(button, ask.key) };
  const type = ask.type === 'choice' ? 'select' : ask.type === 'tick' ? 'checkbox' : ask.type;
  return { key: ask.key, label: ask.label, type, ...(ask.options && { options: ask.options }), ...(ask.type === 'link' && { collection: collection ?? ask.collection ?? '' }), ...(ask.type === 'date' && ask.time && { time: true }) } as Field;
}

/** Where a question of rows' rows are read from as records: the button's answers, then the question. */
export const rowsPath = (button: string, key: string) => `${ASK_INPUT}${button}/${key}`;

/** The fields of a row of a question of rows, its record in `collection` (a path). */
export function rowFields(ask: AskRule, collection: string): Field[] {
  return [
    { key: ROW_KEYS.row, label: 'Row', type: 'link', collection },
    { key: ROW_KEYS.count, label: ask.label, type: 'number' },
    { key: ROW_KEYS.why, label: ask.why?.label ?? 'Why', type: 'select', options: ask.why?.options ?? [] },
  ];
}

/** What a rule finds by name in the space: its collections, boards and task lists, by path. */
export interface RuleSpace {
  collections: readonly { dir: string; fields: readonly { key: string; type: string; collection?: string }[] }[];
  boards: readonly { path: string; fields: readonly { key: string; type: string; collection?: string }[]; columns: readonly string[] }[];
  lists: readonly string[];
}

type Fielded = { key: string; type: string; collection?: string };

/** A space as its rules see it, from its collections, its boards by path and its task lists' paths. */
export function ruleSpaceOf(
  collections: readonly { dir: string; schema: { fields: readonly Fielded[] } }[],
  boards: { readonly [path: string]: { fields?: readonly Fielded[]; columns: readonly { name: string }[] } },
  lists: readonly string[],
): RuleSpace {
  return {
    collections: collections.map((c) => ({ dir: c.dir, fields: c.schema.fields })),
    boards: Object.entries(boards).map(([path, board]) => ({ path, fields: board.fields ?? [], columns: board.columns.map((c) => c.name) })),
    lists,
  };
}

/** A name as a person calls a collection, a board or a list: its file's name without what the app adds. */
const nameOfPath = (path: string) =>
  basename(path)
    .replace(/\.(board|tasks)\.json$/i, '')
    .trim()
    .toLowerCase();

/** The one of `paths` called `name`, the one in the folder of `from` first; undefined for none. */
export function pathNamed(paths: readonly string[], name: string, from: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  const found = paths.filter((p) => nameOfPath(p) === wanted || p.toLowerCase() === wanted);
  const near = dirname(from);
  return found.find((p) => dirname(p) === near) ?? found[0];
}

const isListKind = (k: Kind): k is { list: Kind } => typeof k === 'object' && 'list' in k;

/**
 * What is wrong with a button's body, or with what runs when a record is saved, said where it is:
 * a name not given before, a field that is not there or is worked out, a collection, a board or a
 * list not in the space, a field a record of it does not have, a function called the wrong way.
 * What runs on save reads `old` too, a record of its own collection.
 */
function checkBody(body: Stmt[], when: Node | undefined, outer: Scope, space: RuleSpace | undefined, saving = false, action?: ActionRule): void {
  const dir = outer.dir ?? '';
  // What a button asks is read as input, a record whose fields are its questions.
  const asked = action?.ask?.length ? `${ASK_INPUT}${action.name}` : null;
  const button = action?.name ?? '';
  const rows = new Map<string, Field[]>();
  const askFields = () =>
    (action?.ask ?? []).map((a) => {
      if ((a.type !== 'link' && a.type !== 'rows') || !space) return askField(a, undefined, button);
      // A link may point at a board's cards too: an activity's deal (design/scrawl-apps.md 3.1).
      const path = pathNamed([...space.collections.map((c) => c.dir), ...(a.type === 'link' ? space.boards.map((b) => b.path) : [])], a.collection!, dir);
      if (!path) throw new LangError(t('rules.noCollection', { name: a.collection! }), a.at);
      if (a.type === 'rows') {
        const fields = space.collections.find((c) => c.dir === path)!.fields;
        for (const key of [...(a.show ?? []).map((s) => s.key), ...(a.from ? [a.from] : [])]) {
          if (!fields.some((f) => f.key === key)) throw new LangError(t('rules.noFieldIn', { where: a.collection!, name: key }), a.at);
        }
        if (!fields.some((f) => f.type === 'link' && f.collection === dir)) throw new LangError(t('rules.noLinkBack', { name: a.collection! }), a.at);
        rows.set(rowsPath(button, a.key), rowFields(a, path));
      }
      return askField(a, path, button);
    });
  const inputFields = asked ? askFields() : [];
  const scope: Scope = {
    ...outer,
    schemaOf: (path) =>
      saving && path === dir ? { fields: [...outer.fields] } : asked && path === asked ? { fields: inputFields } : rows.has(path) ? { fields: rows.get(path)! } : outer.schemaOf?.(path),
  };
  const collectionArg = (node: Node | undefined, fn: string) => {
    if (!node || node.k !== 'str') throw new LangError(t('rules.nameInQuotes', { fn, what: t('rules.what.collection') }), node?.at ?? 0);
    if (!space) return undefined;
    const path = pathNamed(space.collections.map((c) => c.dir), node.v, dir);
    if (!path) throw new LangError(t('rules.noCollection', { name: node.v }), node.at);
    return space.collections.find((c) => c.dir === path)!;
  };
  const boardArg = (node: Node | undefined, fn: string) => {
    if (!node || node.k !== 'str') throw new LangError(t('rules.nameInQuotes', { fn, what: t('rules.what.board') }), node?.at ?? 0);
    if (!space) return undefined;
    const path = pathNamed(space.boards.map((b) => b.path), node.v, dir);
    if (!path) throw new LangError(t('rules.noBoard', { name: node.v }), node.at);
    return space.boards.find((b) => b.path === path)!;
  };
  const keysOf = (node: Node | undefined, fields: readonly { key: string; type: string }[], where: string, extra: string[] = []) => {
    if (!node || node.k !== 'obj') return;
    for (const e of node.entries) {
      const key = e.key.toLowerCase();
      if (extra.includes(key)) continue;
      const field = fields.find((f) => f.key === key);
      if (!field) throw new LangError(t('rules.noFieldIn', { where, name: e.key }), e.at);
      if (field.type === 'formula' || field.type === 'lookup' || field.type === 'rollup') throw new LangError(t('rules.computedSet', { name: e.key }), e.at);
    }
  };
  const args = (fn: string, nodes: Node[], least: number, most: number) => {
    if (nodes.length < least || nodes.length > most) throw new LangError(t('lang.args', { fn, count: least === most ? t(least === 1 ? 'lang.args.1' : 'lang.args.2') : t('lang.args.1-2') }), nodes[0]?.at ?? 0);
  };
  const ruleFn = (fn: string, _kinds: Kind[], nodes: Node[]): Kind | undefined => {
    switch (fn) {
      case 'add': {
        args(fn, nodes, 1, 2);
        const target = collectionArg(nodes[0], fn);
        if (target) keysOf(nodes[1], target.fields, (nodes[0] as { v: string }).v);
        return target ? { record: target.dir } : 'any';
      }
      case 'find':
      case 'linked': {
        args(fn, nodes, 1, fn === 'find' ? 2 : 1);
        const target = collectionArg(nodes[0], fn);
        if (target && fn === 'linked' && !target.fields.some((f) => f.type === 'link' && f.collection === dir)) throw new LangError(t('rules.noLinkBack', { name: (nodes[0] as { v: string }).v }), nodes[0]!.at);
        if (target && fn === 'find') keysOf(nodes[1], target.fields, (nodes[0] as { v: string }).v);
        return target ? { list: { record: target.dir } } : { list: 'any' };
      }
      case 'update':
        args(fn, nodes, 2, 2);
        return 'null';
      case 'remove':
        args(fn, nodes, 1, 1);
        return 'null';
      case 'cards': {
        args(fn, nodes, 1, 2);
        const board = boardArg(nodes[0], fn);
        if (board) keysOf(nodes[1], board.fields, (nodes[0] as { v: string }).v, ['column']);
        return { list: 'any' };
      }
      case 'card': {
        args(fn, nodes, 2, 2);
        const board = boardArg(nodes[0], fn);
        const options = nodes[1];
        if (options?.k !== 'obj' || !options.entries.some((e) => e.key.toLowerCase() === 'title')) throw new LangError(t('rules.cardTitle'), options?.at ?? nodes[0]!.at);
        if (board) {
          keysOf(options, board.fields, (nodes[0] as { v: string }).v, ['title', 'column', 'due', 'assignee', 'description', 'priority']);
          const column = options.entries.find((e) => e.key.toLowerCase() === 'column')?.value;
          if (column?.k === 'str' && !board.columns.some((c) => c.toLowerCase() === column.v.trim().toLowerCase())) throw new LangError(t('rules.noColumn', { board: (nodes[0] as { v: string }).v, name: column.v }), column.at);
        }
        return 'any';
      }
      case 'move':
        // A third, the card's values written with it: why a deal was lost.
        args(fn, nodes, 2, 3);
        if (nodes[2] && nodes[2].k !== 'obj') throw new LangError(t('rules.moveValues'), nodes[2].at);
        if (nodes[1]!.k !== 'str') throw new LangError(t('rules.nameInQuotes', { fn, what: t('rules.what.column') }), nodes[1]!.at);
        return 'null';
      case 'subtask':
        args(fn, nodes, 1, 2);
        return 'null';
      case 'task': {
        args(fn, nodes, 2, 2);
        const list = nodes[0];
        if (!list || list.k !== 'str') throw new LangError(t('rules.nameInQuotes', { fn, what: t('rules.what.list') }), list?.at ?? 0);
        if (space && !pathNamed(space.lists, list.v, dir)) throw new LangError(t('rules.noList', { name: list.v }), list.at);
        const options = nodes[1];
        if (options?.k !== 'obj' || !options.entries.some((e) => e.key.toLowerCase() === 'title')) throw new LangError(t('rules.taskTitle'), options?.at ?? list.at);
        return 'null';
      }
      default:
        return undefined;
    }
  };
  const walk = (stmts: Stmt[], locals: Map<string, Kind>, constants: Set<string>) => {
    for (const s of stmts) {
      const here: Scope = { ...scope, use: 'rule', self: undefined, locals, ruleFn };
      switch (s.k) {
        case 'let':
          locals.set(s.name, check(s.value, here).kind);
          if (s.constant) constants.add(s.name);
          else constants.delete(s.name);
          break;
        case 'set': {
          check(s.value, here);
          if (locals.has(s.name)) {
            if (constants.has(s.name)) throw new LangError(t('rules.constant', { name: s.name }), s.at);
            break;
          }
          const field = scope.fields.find((f) => f.key === s.name);
          if (!field) throw new LangError(t('fields.formulaUnknown', { name: s.name }), s.at);
          if (field.type === 'formula' || field.type === 'lookup' || field.type === 'rollup') throw new LangError(t('rules.computedSet', { name: s.name }), s.at);
          break;
        }
        case 'if':
          check(s.test, here);
          walk(s.yes, new Map(locals), new Set(constants));
          walk(s.no, new Map(locals), new Set(constants));
          break;
        case 'for': {
          const of = check(s.of, here).kind;
          const inner = new Map(locals);
          inner.set(s.name, isListKind(of) ? of.list : 'any');
          walk(s.body, inner, new Set([...constants, s.name]));
          break;
        }
        case 'expr':
          check(s.node, here);
          break;
        default:
          break;
      }
    }
  };
  if (when) check(when, { ...scope, use: 'rule', self: undefined });
  // What a button says and the defaults and notes of what it asks read the record, and a note what was typed.
  const reading: Scope = { ...scope, use: 'rule', self: undefined, locals: new Map(asked ? [['input', { record: asked }]] : []), ruleFn };
  if (action?.say) check(action.say, reading);
  if (action?.done) check(action.done, reading);
  for (const a of action?.ask ?? []) {
    if (a.default) check(a.default, reading);
    if (a.note) check(a.note, reading);
  }
  const locals = new Map<string, Kind>(saving ? [['old', { record: dir }]] : asked ? [['input', { record: asked }]] : []);
  walk(body, locals, new Set(saving ? ['old'] : asked ? ['input'] : []));
}

/** What a field's default may call, as a check: find() over the space, an expense's trip the one whose days hold today. */
export const readingOf = (dir: string, space: RuleSpace | undefined): NonNullable<Scope['ruleFn']> => readingFn({ fields: [], dir }, space);

/** What a check may call: find() and linked(), which read the space and change nothing; another of the rules' own functions is refused. */
function readingFn(scope: Scope, space: RuleSpace | undefined): NonNullable<Scope['ruleFn']> {
  const dir = scope.dir ?? '';
  return (fn, _kinds, nodes) => {
    if (!READ_FNS.includes(fn) && CHANGE_FNS.includes(fn)) throw new LangError(t('rules.readOnlyInCheck', { fn }), nodes[0]?.at ?? 0);
    if (!READ_FNS.includes(fn)) return undefined;
    if (nodes.length < 1 || nodes.length > (fn === 'find' ? 2 : 1)) throw new LangError(t('lang.args', { fn, count: fn === 'find' ? t('lang.args.1-2') : t('lang.args.1') }), nodes[0]?.at ?? 0);
    const name = nodes[0]!;
    if (name.k !== 'str') throw new LangError(t('rules.nameInQuotes', { fn, what: t('rules.what.collection') }), name.at);
    if (!space) return { list: 'any' };
    const path = pathNamed(space.collections.map((c) => c.dir), name.v, dir);
    if (!path) throw new LangError(t('rules.noCollection', { name: name.v }), name.at);
    const target = space.collections.find((c) => c.dir === path)!;
    if (fn === 'linked' && !target.fields.some((f) => f.type === 'link' && f.collection === dir)) throw new LangError(t('rules.noLinkBack', { name: name.v }), name.at);
    const set = nodes[1];
    if (set?.k === 'obj') {
      for (const e of set.entries) if (!target.fields.some((f) => f.key === e.key.toLowerCase())) throw new LangError(t('rules.noFieldIn', { where: name.v, name: e.key }), e.at);
    }
    return { list: { record: target.dir } };
  };
}

/** The rules' own functions that read the space, and those that change it. */
const READ_FNS = ['find', 'linked'];
const CHANGE_FNS = ['add', 'update', 'remove', 'card', 'move', 'subtask', 'task', 'cards'];

/** The line a place of a text is on, from 1. */
export const lineAt = (src: string, at: number) => src.slice(0, Math.max(0, at)).split('\n').length;

/**
 * What is wrong with a rules file, each on its line: one that cannot be read says where it stops;
 * one that can says of each check whether its field is there and its condition and message can
 * be worked out with the collection's fields.
 */
export function rulesProblems(src: string, scope: Scope, space?: RuleSpace): RuleProblem[] {
  const said = (at: number, message: string): RuleProblem => ({ at, line: lineAt(src, at), message });
  let rules: Rules;
  try {
    rules = parseRules(src);
  } catch (error) {
    if (error instanceof LangError) return [said(error.at, error.message)];
    throw error;
  }
  const problems: RuleProblem[] = [];
  const ruled: Scope = { ...scope, use: 'rule', self: undefined, ruleFn: readingFn(scope, space) };
  for (const rule of rules.checks) {
    if (rule.field !== null && !scope.fields.some((f) => f.key === rule.field)) {
      problems.push(said(rule.fieldAt, t('fields.formulaUnknown', { name: rule.field })));
      continue;
    }
    try {
      check(rule.test, ruled);
      check(rule.message, ruled);
    } catch (error) {
      if (error instanceof LangError) problems.push(said(error.at, error.message));
      else throw error;
    }
  }
  for (const action of rules.actions) {
    try {
      checkBody(action.body, action.when, scope, space, false, action);
    } catch (error) {
      if (error instanceof LangError) problems.push(said(error.at, error.message));
      else throw error;
    }
  }
  for (const save of rules.saves) {
    try {
      checkBody(save.body, undefined, scope, space, true);
    } catch (error) {
      if (error instanceof LangError) problems.push(said(error.at, error.message));
      else throw error;
    }
  }
  for (const change of rules.changes) {
    const unknown = change.fields.find((key) => !scope.fields.some((f) => f.key === key));
    if (unknown !== undefined) {
      problems.push(said(change.fieldAt, t('fields.formulaUnknown', { name: unknown })));
      continue;
    }
    try {
      checkBody(change.body, undefined, scope, space, true);
    } catch (error) {
      if (error instanceof LangError) problems.push(said(error.at, error.message));
      else throw error;
    }
  }
  return problems;
}

const parsedRules = new Map<string, Rules | null>();

/** A rules file as read, kept by its text; null when it cannot be read, so that none of it runs until it is put right. */
export function rulesOf(src: string): Rules | null {
  let rules = parsedRules.get(src);
  if (rules === undefined) {
    try {
      rules = parseRules(src);
    } catch {
      rules = null;
    }
    if (parsedRules.size > 200) parsedRules.clear();
    parsedRules.set(src, rules);
  }
  return rules;
}

/** The checks a record fails, with what each says, its record's values read through `env`. */
export function failedChecks(rules: Rules, env: Env): { field: string | null; message: string }[] {
  const failed: { field: string | null; message: string }[] = [];
  for (const rule of rules.checks) {
    let held;
    try {
      held = evaluate(rule.test, env);
    } catch {
      continue;
    }
    if (isNothing(held) || truthy(held)) continue;
    let message = '';
    try {
      message = textOf(evaluate(rule.message, env)).trim();
    } catch {
      message = '';
    }
    failed.push({ field: rule.field, message: message || t('rules.failed') });
  }
  return failed;
}
