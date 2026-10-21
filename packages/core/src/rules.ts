import { t } from '@scrawlnotes/i18n';
import { join } from './fs';
import { check, type Env, evaluate, isNothing, LangError, type Node, type Reader, reader, type Scope, textOf, tokenize, truthy } from './lang';

// A collection's rules: a file beside its schema, `_rules.js`, written in the language of formulas.
// It is never run as JS: our own reader takes only the calls it knows, at its top. A check says
// what a record must be: `check("delivery", () => delivery >= start, "Delivery is before the start")`.
// A record that fails one is not refused, it is marked at that field, or as a whole for `null`;
// one whose check gives nothing (a field not written yet) does not fail. Checks are worked out
// wherever the record is read and write nothing. Buttons (`action`) and what runs when a record
// is saved (`onSave`) come later in the same file. See design/collection-apps.md 6.

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

export interface Rules {
  checks: CheckRule[];
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
  while (read.peek().k !== 'end') {
    const start = read.next();
    if (start.k !== 'id') read.fail(start);
    if (start.v !== 'check' || !read.isOp('(')) throw new LangError(t('rules.onlyCheck'), start.at);
    read.next();
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
  return { checks };
}

/** The line a place of a text is on, from 1. */
export const lineAt = (src: string, at: number) => src.slice(0, Math.max(0, at)).split('\n').length;

/**
 * What is wrong with a rules file, each on its line: one that cannot be read says where it stops;
 * one that can says of each check whether its field is there and its condition and message can
 * be worked out with the collection's fields.
 */
export function rulesProblems(src: string, scope: Scope): RuleProblem[] {
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
