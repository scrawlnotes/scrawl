import { t } from '@scrawlnotes/i18n';
import { basename, dirname, join } from './fs';
import { check, type Env, evaluate, isNothing, type Kind, LangError, type Node, type Reader, reader, type Scope, type Stmt, textOf, tokenize, truthy } from './lang';

// A collection's rules: a file beside its schema, `_rules.js`, written in the language of formulas.
// It is never run as JS: our own reader takes only the calls it knows, at its top. A check says
// what a record must be: `check("delivery", () => delivery >= start, "Delivery is before the start")`.
// A record that fails one is not refused, it is marked at that field, or as a whole for `null`;
// one whose check gives nothing (a field not written yet) does not fail. Checks are worked out
// wherever the record is read and write nothing. A button is
// `action("Start project", { when: () => status == "Offer", confirm: true }, () => { … })`: its
// body is statements that read the space's records, cards and tasks and change them (run.ts).
// What runs when a record is saved (`onSave`) comes later in the same file. See
// design/collection-apps.md 6.

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

/** A button as read: its label, when it may run (and what it says when it may not), whether it asks first, and what it does. */
export interface ActionRule {
  name: string;
  when?: Node;
  hint?: string;
  confirm: boolean;
  body: Stmt[];
  at: number;
}

export interface Rules {
  checks: CheckRule[];
  actions: ActionRule[];
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
  while (read.peek().k !== 'end') {
    const start = read.next();
    if (start.k !== 'id') read.fail(start);
    if ((start.v !== 'check' && start.v !== 'action') || !read.isOp('(')) throw new LangError(t('rules.onlyCheck'), start.at);
    read.next();
    if (start.v === 'action') {
      actions.push(readAction(read, start.at, actions));
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
  return { checks, actions };
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
    } else throw new LangError(t('rules.actionOption', { name: entry.key }), entry.at);
  }
  return action;
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
 * What is wrong with a button's body, said where it is: a name not given before, a field that is
 * not there or is worked out, a collection, a board or a list not in the space, a field a record
 * of it does not have, a function called the wrong way.
 */
function checkAction(action: ActionRule, scope: Scope, space: RuleSpace | undefined): void {
  const dir = scope.dir ?? '';
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
        args(fn, nodes, 2, 2);
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
  if (action.when) check(action.when, { ...scope, use: 'rule', self: undefined });
  walk(action.body, new Map(), new Set());
}

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
  const ruled: Scope = { ...scope, use: 'rule', self: undefined };
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
      checkAction(action, scope, space);
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
