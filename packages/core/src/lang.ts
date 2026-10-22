import { t } from '@scrawlnotes/i18n';
import type { Field, FieldValue, Link, Schema } from './collection';
import { clockOf, isDay, dateTimeOf, timeOf } from './day';

// The language of formulas, and later of rules: a syntax like JS's, read by our own reader,
// which takes only what it knows. Numbers, texts, days, yes or no and lists; a field by its key
// and a linked record's field with a dot (`project.customer`); + - * / %, comparisons, && || !,
// `? :`, and a few functions. Nothing in it reaches a file, the network or another space, and a
// formula gives the same for the same record, so it is worked out wherever it is read. A
// default value is written in it too, with what a formula cannot ask: who makes the record and
// the next number. See design/collection-apps.md 4.1 and 5.1.

// ---------- reading ----------

/** What is wrong with what was written, and where in it. */
export class LangError extends Error {
  constructor(
    message: string,
    readonly at = 0,
  ) {
    super(message);
  }
}

/** Fields that read each other round: a formula that, through others, reads itself. */
class RoundError extends LangError {}

export type Token =
  | { k: 'num'; v: number; at: number; end: number }
  | { k: 'str'; v: string; at: number; end: number }
  | { k: 'tpl'; parts: (string | { src: string; at: number })[]; at: number; end: number }
  | { k: 'id'; v: string; at: number; end: number }
  | { k: 'op'; v: string; at: number; end: number }
  | { k: 'end'; at: number; end: number };

const OPS = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '=>', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', '[', ']', '{', '}', ',', '.', '=', ';'];
const ESCAPES: { [c: string]: string } = { n: '\n', t: '\t', r: '\r' };

/** The longest text a formula may be. */
export const MAX_SOURCE = 2000;
/** How deep parentheses and calls may go. */
const MAX_DEPTH = 32;

/** The parts of a text: numbers, texts, names and operators; comments, as JS writes them, left out. */
export function tokenize(src: string, offset = 0): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const at = () => offset + i;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close < 0) throw new LangError(t('lang.openComment'), offset + i);
      i = close + 2;
      continue;
    }
    const start = i;
    if (/\d/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(src.slice(i))!;
      i += m[0].length;
      tokens.push({ k: 'num', v: Number(m[0]), at: offset + start, end: at() });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i))!;
      i += m[0].length;
      tokens.push({ k: 'id', v: m[0].toLowerCase(), at: offset + start, end: at() });
      continue;
    }
    if (c === '"' || c === "'") {
      let v = '';
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\' && i + 1 < src.length) {
          const e = src[i + 1]!;
          v += ESCAPES[e] ?? e;
          i += 2;
        } else v += src[i++];
      }
      if (i >= src.length) throw new LangError(t('lang.openText'), offset + start);
      i++;
      tokens.push({ k: 'str', v, at: offset + start, end: at() });
      continue;
    }
    if (c === '`') {
      const parts: (string | { src: string; at: number })[] = [];
      let text = '';
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\' && i + 1 < src.length) {
          const e = src[i + 1]!;
          text += ESCAPES[e] ?? e;
          i += 2;
        } else if (src[i] === '$' && src[i + 1] === '{') {
          if (text) parts.push(text);
          text = '';
          i += 2;
          const from = i;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (depth > 0) i++;
          }
          if (i >= src.length) throw new LangError(t('lang.openText'), offset + start);
          parts.push({ src: src.slice(from, i), at: offset + from });
          i++;
        } else text += src[i++];
      }
      if (i >= src.length) throw new LangError(t('lang.openText'), offset + start);
      i++;
      if (text) parts.push(text);
      tokens.push({ k: 'tpl', parts, at: offset + start, end: at() });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new LangError(t('lang.unexpected', { token: c }), offset + start);
    i += op.length;
    tokens.push({ k: 'op', v: op, at: offset + start, end: at() });
  }
  tokens.push({ k: 'end', at: offset + src.length, end: offset + src.length });
  return tokens;
}

/** An expression as read: where each part sits in the text is kept, to say what is wrong with it. */
export type Node = { at: number; end: number } & (
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'null' }
  | { k: 'tpl'; parts: (string | Node)[] }
  | { k: 'list'; items: Node[] }
  | { k: 'name'; name: string }
  | { k: 'member'; of: Node; name: string }
  | { k: 'index'; of: Node; index: Node }
  | { k: 'call'; fn: string; args: Node[] }
  | { k: 'unary'; op: '-' | '!'; of: Node }
  | { k: 'bin'; op: string; left: Node; right: Node }
  | { k: 'cond'; test: Node; yes: Node; no: Node }
  // What only a rule writes: the record itself, a set of values, a function, a list's method.
  | { k: 'this' }
  | { k: 'obj'; entries: { key: string; value: Node; at: number }[] }
  | { k: 'arrow'; params: string[]; body: Node | Stmt[] }
  | { k: 'mcall'; of: Node; name: string; args: Node[] }
);

/** A statement of a rule: a name given a value, a field or a name set, a choice, a loop, an end, or something done. */
export type Stmt = { at: number } & (
  | { k: 'let'; name: string; value: Node; constant: boolean }
  | { k: 'set'; name: string; value: Node }
  | { k: 'if'; test: Node; yes: Stmt[]; no: Stmt[] }
  | { k: 'for'; name: string; of: Node; body: Stmt[] }
  | { k: 'return' }
  | { k: 'expr'; node: Node }
);

/** What JS has and a rule does not: said when one is written. */
const NOT_IN_RULES = ['while', 'do', 'function', 'class', 'import', 'export', 'try', 'throw', 'var', 'switch', 'async'];

const BINARY: { [op: string]: number } = { '||': 2, '&&': 3, '==': 4, '!=': 4, '===': 4, '!==': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 };
const SAME: { [op: string]: string } = { '===': '==', '!==': '!=' };

/** Reads an expression; throws a LangError that says what is wrong, in words for the one typing it. */
export function parseExpression(src: string): Node {
  if (!src.trim()) throw new LangError(t('fields.formulaEmpty'));
  if (src.length > MAX_SOURCE) throw new LangError(t('lang.tooLong', { count: MAX_SOURCE }));
  return parseTokens(tokenize(src));
}

function parseTokens(tokens: Token[]): Node {
  const read = reader(tokens);
  const node = read.expression();
  read.end();
  return node;
}

/** What reads tokens one after another: an expression from where it stands, or one token; a rules file reads its calls with it. */
export interface Reader {
  peek(): Token;
  next(): Token;
  isOp(v: string): boolean;
  expect(v: string): Token;
  /** Throws a LangError saying that this token is not expected. */
  fail(token: Token): never;
  expression(): Node;
  /** Throws when anything is left. */
  end(): void;
}

const idOf = (token: Token | undefined) => (token?.k === 'id' ? token.v : null);

export function reader(tokens: Token[]): Reader {
  let i = 0;
  let depth = 0;
  const peek = () => tokens[i]!;
  const isOp = (v: string) => peek().k === 'op' && (peek() as { v: string }).v === v;
  const fail = (token: Token): never => {
    if (token.k === 'end') throw new LangError(t('fields.formulaBroken'), token.at);
    const shown = token.k === 'op' || token.k === 'id' ? token.v : token.k === 'num' ? String(token.v) : '“…”';
    if (token.k === 'op' && token.v === '=') throw new LangError(t('lang.oneEquals'), token.at);
    throw new LangError(t('lang.unexpected', { token: shown }), token.at);
  };
  const expect = (v: string) => {
    if (!isOp(v)) fail(peek());
    return tokens[i++]!;
  };
  const deeper = () => {
    if (++depth > MAX_DEPTH) throw new LangError(t('lang.tooDeep'), peek().at);
  };
  const primary = (): Node => {
    const token = tokens[i++]!;
    switch (token.k) {
      case 'num':
        return { k: 'num', v: token.v, at: token.at, end: token.end };
      case 'str':
        return { k: 'str', v: token.v, at: token.at, end: token.end };
      case 'tpl':
        return {
          k: 'tpl',
          at: token.at,
          end: token.end,
          parts: token.parts.map((p) => {
            if (typeof p === 'string') return p;
            if (!p.src.trim()) throw new LangError(t('fields.formulaBroken'), p.at);
            return parseTokens(tokenize(p.src, p.at));
          }),
        };
      case 'id': {
        if (token.v === 'true' || token.v === 'false') return { k: 'bool', v: token.v === 'true', at: token.at, end: token.end };
        if (token.v === 'null') return { k: 'null', at: token.at, end: token.end };
        if (token.v === 'this') return { k: 'this', at: token.at, end: token.end };
        if (token.v === 'new' && peek().k === 'id') throw new LangError(t('lang.notHere', { word: 'new' }), token.at);
        // `x => …`: a function of one value, as a list's filter takes.
        if (isOp('=>')) {
          i++;
          return arrow([token.v], token.at);
        }
        if (isOp('(')) {
          if (token.v === 'if') throw new LangError(t('lang.noIf'), token.at);
          i++;
          deeper();
          const args: Node[] = [];
          if (!isOp(')')) {
            do args.push(expression(0));
            while (isOp(',') && ++i);
          }
          const close = expect(')');
          depth--;
          return { k: 'call', fn: token.v, args, at: token.at, end: close.end };
        }
        return { k: 'name', name: token.v, at: token.at, end: token.end };
      }
      case 'op': {
        if (token.v === '(') {
          // `(a, b) => …` and `() => …`: names in brackets before an arrow.
          let j = i;
          const params: string[] = [];
          while (idOf(tokens[j]) !== null && (tokens[j + 1]?.k === 'op' && ((tokens[j + 1] as { v: string }).v === ',' || (tokens[j + 1] as { v: string }).v === ')'))) {
            params.push(idOf(tokens[j])!);
            j += (tokens[j + 1] as { v: string }).v === ',' ? 2 : 1;
          }
          const close = tokens[j];
          const next = tokens[j + 1];
          if (close?.k === 'op' && close.v === ')' && next?.k === 'op' && next.v === '=>') {
            i = j + 2;
            return arrow(params, token.at);
          }
          deeper();
          const inner = expression(0);
          expect(')');
          depth--;
          return inner;
        }
        if (token.v === '{') {
          // A set of values: `{ name, planned: contract * 0.3 }`.
          deeper();
          const entries: { key: string; value: Node; at: number }[] = [];
          while (!isOp('}')) {
            const key = tokens[i++]!;
            if (key.k !== 'id' && key.k !== 'str') fail(key);
            const name = (key as { v: string }).v;
            let value: Node;
            if (isOp(':')) {
              i++;
              value = expression(0);
            } else value = { k: 'name', name: name.toLowerCase(), at: key.at, end: key.end };
            entries.push({ key: name, value, at: key.at });
            if (!isOp(',')) break;
            i++;
          }
          const close = expect('}');
          depth--;
          return { k: 'obj', entries, at: token.at, end: close.end };
        }
        if (token.v === '[') {
          deeper();
          const items: Node[] = [];
          if (!isOp(']')) {
            do items.push(expression(0));
            while (isOp(',') && ++i);
          }
          const close = expect(']');
          depth--;
          return { k: 'list', items, at: token.at, end: close.end };
        }
        if (token.v === '-' || token.v === '!') {
          const of = unary();
          return { k: 'unary', op: token.v, of, at: token.at, end: of.end };
        }
        return fail(token);
      }
      default:
        return fail(token);
    }
  };
  const postfix = (node: Node): Node => {
    while (isOp('.') || isOp('[')) {
      // A list's item by its place, from 0: `find("Locations")[0]`.
      if (isOp('[')) {
        i++;
        deeper();
        const index = expression(0);
        const close = expect(']');
        depth--;
        node = { k: 'index', of: node, index, at: node.at, end: close.end };
        continue;
      }
      i++;
      const name = tokens[i++]!;
      if (name.k !== 'id') fail(name);
      if (isOp('(')) {
        // A list's method: `lines.filter(l => l.actual > l.planned)`.
        i++;
        deeper();
        const args: Node[] = [];
        if (!isOp(')')) {
          do args.push(expression(0));
          while (isOp(',') && ++i);
        }
        const close = expect(')');
        depth--;
        node = { k: 'mcall', of: node, name: (name as { v: string }).v, args, at: node.at, end: close.end };
      } else node = { k: 'member', of: node, name: (name as { v: string }).v, at: node.at, end: name.end };
    }
    return node;
  };
  /** A function: what it is given by name, then a value worked out, or a body of statements. */
  function arrow(params: string[], at: number): Node {
    if (isOp('{')) {
      const body = block();
      return { k: 'arrow', params, body, at, end: tokens[i - 1]!.end };
    }
    const body = expression(0);
    return { k: 'arrow', params, body, at, end: body.end };
  }
  const semi = () => {
    if (isOp(';')) i++;
  };
  function block(): Stmt[] {
    expect('{');
    deeper();
    const out: Stmt[] = [];
    while (!isOp('}')) {
      if (peek().k === 'end') fail(peek());
      out.push(statement());
    }
    expect('}');
    depth--;
    return out;
  }
  const body = (): Stmt[] => (isOp('{') ? block() : [statement()]);
  function statement(): Stmt {
    const token = peek();
    const at = token.at;
    if (token.k === 'id') {
      if (NOT_IN_RULES.includes(token.v)) throw new LangError(t('lang.notHere', { word: token.v }), at);
      if (token.v === 'let' || token.v === 'const') {
        i++;
        const name = tokens[i++]!;
        if (name.k !== 'id') fail(name);
        expect('=');
        const value = expression(0);
        semi();
        return { k: 'let', name: (name as { v: string }).v, value, constant: token.v === 'const', at };
      }
      if (token.v === 'if') {
        i++;
        expect('(');
        const test = expression(0);
        expect(')');
        const yes = body();
        const no = idOf(peek()) === 'else' ? (i++, body()) : [];
        return { k: 'if', test, yes, no, at };
      }
      if (token.v === 'for') {
        i++;
        expect('(');
        const kind = tokens[i++]!;
        if (idOf(kind) !== 'const' && idOf(kind) !== 'let') throw new LangError(t('lang.forOf'), kind.at);
        const name = tokens[i++]!;
        if (name.k !== 'id') fail(name);
        if (idOf(peek()) !== 'of') throw new LangError(t('lang.forOf'), peek().at);
        i++;
        const of = expression(0);
        expect(')');
        return { k: 'for', name: (name as { v: string }).v, of, body: body(), at };
      }
      if (token.v === 'return') {
        i++;
        semi();
        return { k: 'return', at };
      }
      const next = tokens[i + 1];
      if (next?.k === 'op' && next.v === '=') {
        i += 2;
        const value = expression(0);
        semi();
        return { k: 'set', name: token.v, value, at };
      }
    }
    const node = expression(0);
    semi();
    return { k: 'expr', node, at };
  }
  // `expression` and `statement` call each other: a function's body holds statements.
  const unary = (): Node => postfix(primary());
  function expression(min: number): Node {
    let left = unary();
    for (;;) {
      const token = peek();
      if (token.k !== 'op') break;
      if (token.v === '?' && min <= 1) {
        i++;
        const yes = expression(0);
        expect(':');
        const no = expression(1);
        left = { k: 'cond', test: left, yes, no, at: left.at, end: no.end };
        continue;
      }
      const prec = BINARY[token.v];
      if (prec === undefined || prec < min) break;
      i++;
      const right = expression(prec + 1);
      left = { k: 'bin', op: SAME[token.v] ?? token.v, left, right, at: left.at, end: right.end };
    }
    return left;
  }
  return {
    peek,
    next: () => tokens[i++]!,
    isOp,
    expect,
    fail,
    expression: () => expression(0),
    end: () => {
      if (peek().k !== 'end') fail(peek());
    },
  };
}

// ---------- kinds ----------

/** The path a button's answers are read from as a record, `input`, followed by the button's name. */
export const ASK_INPUT = '\u0000ask\u0000';

/** What a value is, as far as can be told before working it out. */
/** A day may hold its time; a time is a time of day alone; a span is minutes to add to either: `minutes(30)`. */
export type Kind = 'number' | 'text' | 'day' | 'time' | 'span' | 'bool' | 'null' | 'any' | { list: Kind } | { record: string };

const isList = (k: Kind): k is { list: Kind } => typeof k === 'object' && 'list' in k;
const isRecordKind = (k: Kind): k is { record: string } => typeof k === 'object' && 'record' in k;
const sameKind = (a: Kind, b: Kind): boolean =>
  a === b || (isList(a) && isList(b) && sameKind(a.list, b.list)) || (isRecordKind(a) && isRecordKind(b) && a.record === b.record);

/** Where a name is read: this record's fields, the fields of other collections and boards for a link's target, and what is being written. */
export interface Scope {
  fields: readonly Field[];
  /** In a rule: the names given values before, by let, const, for or a function's own. */
  locals?: ReadonlyMap<string, Kind>;
  /** In a rule: the collection of the record, which `this` is. */
  dir?: string;
  /** In a rule: what a rule's own function gives (add, find…), or undefined for one that is not. Throws what is wrong with how it is called. */
  ruleFn?: (fn: string, args: Kind[], nodes: Node[]) => Kind | undefined;
  /** The fields of the collection, or the board, at a path. */
  schemaOf?: (path: string) => Pick<Schema, 'fields'> | undefined;
  /** The key of the field being worked out, which cannot read itself. */
  self?: string;
  /** Where it is written: a formula cannot ask who looks (`me()`) nor the next number (`next()`); a default value and a rule can. */
  use?: 'formula' | 'default' | 'rule';
}

/** What an expression gives and which of the record's fields it reads. */
export interface Checked {
  kind: Kind;
  reads: string[];
}

/** How a field's value is called in a message: "a choice", "a day". */
function fieldWords(field: Field, kind: Kind): string {
  switch (field.type) {
    case 'select':
      return t('lang.kind.choice');
    case 'multi-select':
      return t('lang.kind.choices');
    case 'person':
      return t('lang.kind.person');
    case 'link':
      return t('lang.kind.record');
    default:
      return kindWords(kind);
  }
}

/** How a kind is called in a message. */
export function kindWords(kind: Kind): string {
  if (isList(kind)) return t('lang.kind.list');
  if (isRecordKind(kind)) return t('lang.kind.record');
  return t(`lang.kind.${kind}`);
}

/** The kind of a field's value; a formula's from its formula, a lookup's from the field it shows, a rollup's from what it does. */
export function kindOfField(field: Field, scope: Scope, stack: string[] = []): Kind {
  switch (field.type) {
    case 'number':
      return 'number';
    case 'date':
      return 'day';
    case 'time':
      return 'time';
    case 'checkbox':
      return 'bool';
    case 'multi-select':
      return { list: 'text' };
    case 'link': {
      const record: Kind = { record: field.collection ?? '' };
      return field.many ? { list: record } : record;
    }
    case 'formula': {
      if (stack.includes(field.key)) throw new RoundError(t('lang.round', { path: [...stack.slice(stack.indexOf(field.key)), field.key].join(' → ') }));
      let node: Node;
      try {
        node = parseExpression(field.formula ?? '');
      } catch {
        return 'any';
      }
      try {
        return check(node, { ...scope, self: field.key }, [...stack, field.key]).kind;
      } catch (error) {
        if (error instanceof RoundError) throw error;
        return 'any';
      }
    }
    case 'lookup': {
      const link = scope.fields.find((f) => f.key === field.lookup?.link && f.type === 'link');
      const target = link?.collection ? scope.schemaOf?.(link.collection) : undefined;
      const shown = target?.fields.find((f) => f.key === field.lookup?.field);
      if (!link || !target || !shown || stack.includes(`${link.collection}#${shown.key}`)) return 'any';
      let kind: Kind;
      try {
        kind = kindOfField(shown, { ...scope, fields: target.fields }, [...stack, `${link.collection}#${shown.key}`]);
      } catch {
        kind = 'any';
      }
      return link.many ? { list: kind } : kind;
    }
    case 'rollup': {
      const r = field.rollup;
      if (!r || r.fn === 'count' || r.fn === 'sum' || r.fn === 'avg') return 'number';
      const source = scope.schemaOf?.(r.from)?.fields.find((f) => f.key === r.field);
      if (!source) return 'any';
      try {
        const kind = kindOfField(source, { ...scope, fields: scope.schemaOf?.(r.from)?.fields ?? [] }, [...stack, `${r.from}#${source.key}`]);
        return kind === 'number' || kind === 'day' || kind === 'time' ? kind : 'any';
      } catch {
        return 'any';
      }
    }
    default:
      return 'text';
  }
}

interface FnSpec {
  /** Least and most arguments. */
  args: [number, number];
  /** Not in a formula: what it gives changes with who looks, or with when the record is made. */
  notInFormula?: true;
  kind: (args: Kind[], at: Node[]) => Kind;
}

// Yes or no counts as 1 or 0 where a number is taken, as in JS: a flag times an amount.
const NUMBERISH = (k: Kind) => k === 'number' || k === 'bool' || k === 'any' || k === 'null';
const DAYISH = (k: Kind) => k === 'day' || k === 'any' || k === 'null';
const TIMEISH = (k: Kind) => k === 'time' || k === 'any' || k === 'null';

function need(ok: boolean, message: string, node: Node) {
  if (!ok) throw new LangError(message, node.at);
}

const FNS: { [name: string]: FnSpec } = {
  today: { args: [0, 0], kind: () => 'day' },
  now: { args: [0, 0], kind: () => 'day' },
  minutes: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(NUMBERISH(a!), t('lang.fnNumber', { fn: 'minutes' }), n!);
      return 'span';
    },
  },
  hours: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(NUMBERISH(a!), t('lang.fnNumber', { fn: 'hours' }), n!);
      return 'span';
    },
  },
  day: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(DAYISH(a!), t('lang.fnDay', { fn: 'day' }), n!);
      return 'day';
    },
  },
  time: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(DAYISH(a!), t('lang.fnDay', { fn: 'time' }), n!);
      return 'time';
    },
  },
  at: {
    args: [2, 2],
    kind: ([a, b], [n, m]) => {
      need(DAYISH(a!), t('lang.fnDay', { fn: 'at' }), n!);
      need(TIMEISH(b!), t('lang.fnTime', { fn: 'at' }), m!);
      return 'day';
    },
  },
  me: { args: [0, 0], notInFormula: true, kind: () => 'text' },
  next: {
    args: [1, 2],
    notInFormula: true,
    kind: ([prefix, digits], [p, d]) => {
      need(prefix === 'text' || prefix === 'any', t('lang.fnNext'), p!);
      if (digits !== undefined) need(NUMBERISH(digits), t('lang.fnNext'), d!);
      return 'text';
    },
  },
  empty: { args: [1, 1], kind: () => 'bool' },
  text: { args: [1, 1], kind: () => 'text' },
  abs: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(NUMBERISH(a!), t('lang.fnNumber', { fn: 'abs' }), n!);
      return 'number';
    },
  },
  round: {
    args: [1, 2],
    kind: (args, nodes) => {
      args.forEach((a, i) => need(NUMBERISH(a), t('lang.fnNumber', { fn: 'round' }), nodes[i]!));
      return 'number';
    },
  },
  year: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(DAYISH(a!), t('lang.fnDay', { fn: 'year' }), n!);
      return 'number';
    },
  },
  month: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(DAYISH(a!), t('lang.fnDay', { fn: 'month' }), n!);
      return 'number';
    },
  },
  sum: {
    args: [1, 1],
    kind: ([a], [n]) => {
      need(a === 'any' || (isList(a!) && NUMBERISH(a.list)), t('lang.fnList', { fn: 'sum' }), n!);
      return 'number';
    },
  },
  min: { args: [1, 64], kind: (args, nodes) => extreme('min', args, nodes) },
  max: { args: [1, 64], kind: (args, nodes) => extreme('max', args, nodes) },
  contains: {
    args: [2, 2],
    kind: ([a], [n]) => {
      need(a === 'text' || a === 'any' || a === 'null' || isList(a!), t('lang.fnContains'), n!);
      return 'bool';
    },
  },
};

/** min() and max(): of numbers, or of days, or of one list of them. */
function extreme(fn: string, args: Kind[], nodes: Node[]): Kind {
  const items = args.length === 1 && isList(args[0]!) ? [(args[0] as { list: Kind }).list] : args;
  const known = items.filter((k) => k !== 'any' && k !== 'null');
  const kind = known[0] ?? 'any';
  known.forEach((k, i) => need((k === 'number' || k === 'day' || k === 'time') && k === kind, t('lang.fnExtreme', { fn }), nodes[Math.min(i, nodes.length - 1)]!));
  return kind;
}

/** The names a few spreadsheet functions go by here, said when one of them is written. */
const ELSEWHERE: { [name: string]: string } = { and: '&&', or: '||', not: '!', concat: '+' };

/**
 * What an expression gives, and the fields of the record it reads; throws a LangError saying
 * what is wrong: a field that is not there, a value of the wrong kind for what is done with it,
 * a function that is not one.
 */
export function check(node: Node, scope: Scope, stack: string[] = []): Checked {
  const reads = new Set<string>();
  const label = (n: Node): string => (n.k === 'name' ? n.name : n.k === 'member' ? `${label(n.of)}.${n.name}` : '');
  // What a part is called in a message: its key, or what it is.
  const words = (n: Node, kind: Kind): string => {
    if (n.k === 'name') {
      const field = scope.fields.find((f) => f.key === n.name);
      return field ? t('lang.isWords', { name: n.name, what: fieldWords(field, kind) }) : n.name;
    }
    const name = label(n);
    return name ? t('lang.isWords', { name, what: kindWords(kind) }) : t('lang.thisIs', { what: kindWords(kind) });
  };
  const visit = (n: Node, fields: readonly Field[] = scope.fields): Kind => {
    switch (n.k) {
      case 'num':
        return 'number';
      case 'str':
        return 'text';
      case 'bool':
        return 'bool';
      case 'null':
        return 'null';
      case 'tpl':
        for (const p of n.parts) if (typeof p !== 'string') visit(p);
        return 'text';
      case 'list': {
        const kinds = n.items.map((item) => visit(item));
        const first = kinds.find((k) => k !== 'null' && k !== 'any');
        return { list: first && kinds.every((k) => k === 'null' || k === 'any' || sameKind(k, first)) ? first : 'any' };
      }
      case 'name': {
        const local = scope.locals?.get(n.name);
        if (local !== undefined) return local;
        const field = fields.find((f) => f.key === n.name);
        if (!field) throw new LangError(t('fields.formulaUnknown', { name: n.name }), n.at);
        if (n.name === scope.self) throw new LangError(t('fields.formulaSelf'), n.at);
        reads.add(n.name);
        return kindOfField(field, scope, stack);
      }
      case 'member': {
        const of = visit(n.of);
        if (of === 'any' || of === 'null') return 'any';
        if (n.name === 'length' && (isList(of) || of === 'text')) return 'number';
        const target = isRecordKind(of) ? of.record : isList(of) && isRecordKind(of.list) ? of.list.record : null;
        if (target === null) throw new LangError(t('lang.notLink', { what: words(n.of, of) }), n.of.at);
        const schema = scope.schemaOf?.(target);
        if (!schema) return isList(of) ? { list: 'any' } : 'any';
        const field = schema.fields.find((f) => f.key === n.name);
        if (!field && target.startsWith(ASK_INPUT)) {
          const keys = schema.fields.map((f) => f.key);
          const said = keys.length > 1 ? `${keys.slice(0, -1).join(', ')} ${t('list.and')} ${keys[keys.length - 1]}` : (keys[0] ?? '');
          throw new LangError(t('rules.askNo', { button: target.slice(ASK_INPUT.length), name: n.name, keys: said }), n.at);
        }
        if (!field) throw new LangError(t('lang.noTargetField', { name: n.name, link: label(n.of) }), n.at);
        let kind: Kind;
        try {
          kind = kindOfField(field, { ...scope, fields: schema.fields, self: undefined }, [...stack, `${target}#${field.key}`]);
        } catch {
          kind = 'any';
        }
        return isList(of) ? (isList(kind) ? kind : { list: kind }) : kind;
      }
      case 'call': {
        const spec = FNS[n.fn];
        const own = !spec && scope.use === 'rule' ? scope.ruleFn?.(n.fn, n.args.map((a) => (a.k === 'arrow' || a.k === 'obj' ? 'any' : visit(a))), n.args) : undefined;
        if (own !== undefined) {
          for (const a of n.args) if (a.k === 'arrow' || a.k === 'obj') visit(a);
          return own;
        }
        if (n.fn === 'sum' && n.args.length === 2 && n.args[1]!.k === 'arrow') {
          visit(n.args[0]!);
          visit(n.args[1]!);
          return 'number';
        }
        if (!spec) {
          const instead = ELSEWHERE[n.fn];
          throw new LangError(instead ? t('lang.writeInstead', { fn: n.fn, instead }) : t('lang.noFunction', { fn: n.fn }), n.at);
        }
        if (spec.notInFormula && scope.use !== 'default' && scope.use !== 'rule') throw new LangError(t(n.fn === 'next' ? 'lang.nextNotInFormula' : 'lang.notInFormula', { fn: n.fn }), n.at);
        const [least, most] = spec.args;
        if (n.args.length < least || n.args.length > most) {
          const count = least === 0 ? t('lang.args.0') : most === 64 ? t('lang.args.1-') : least === most ? t(least === 1 ? 'lang.args.1' : 'lang.args.2') : t('lang.args.1-2');
          throw new LangError(t('lang.args', { fn: n.fn, count }), n.at);
        }
        return spec.kind(n.args.map((a) => visit(a)), n.args);
      }
      case 'index': {
        const of = visit(n.of);
        const at = visit(n.index);
        need(NUMBERISH(at), t('lang.notNumber', { what: words(n.index, at), op: '[ ]' }), n.index);
        if (isList(of)) return of.list;
        if (of === 'any' || of === 'null') return 'any';
        throw new LangError(t('lang.notIndexable', { what: words(n.of, of) }), n.of.at);
      }
      case 'unary': {
        const of = visit(n.of);
        if (n.op === '!') return 'bool';
        need(NUMBERISH(of), t('lang.notNumber', { what: words(n.of, of), op: '-' }), n.of);
        return of === 'number' ? 'number' : 'any';
      }
      case 'cond': {
        visit(n.test);
        const [yes, no] = [visit(n.yes), visit(n.no)];
        if (yes === 'null' || yes === 'any') return no;
        if (no === 'null' || no === 'any') return yes;
        if (!sameKind(yes, no)) throw new LangError(t('lang.branches', { yes: kindWords(yes), no: kindWords(no) }), n.yes.at);
        return yes;
      }
      case 'this':
      case 'obj':
      case 'arrow':
      case 'mcall':
        if (scope.use !== 'rule') throw new LangError(t('lang.onlyInRules'), n.at);
        return visitRule(n);
      case 'bin': {
        const [a, b] = [visit(n.left), visit(n.right)];
        const loose = (k: Kind) => k === 'any' || k === 'null';
        switch (n.op) {
          case '+': {
            // A text on either side makes a text; else numbers, or a day and a number of days; a span goes on a day or a time.
            if (a === 'text' || b === 'text') return 'text';
            if (a === 'span' || b === 'span') {
              const [other, node] = a === 'span' ? [b, n.right] : [a, n.left];
              if (other === 'span' || other === 'day' || other === 'time') return other;
              if (loose(other)) return 'any';
              throw new LangError(t('lang.spanOn', { what: words(node, other) }), node.at);
            }
            if (a === 'time' || b === 'time') throw new LangError(t('lang.timeAdd'), n.at);
            const addable = (k: Kind) => k === 'number' || k === 'bool' || k === 'day' || loose(k);
            if (!addable(a)) throw new LangError(t('lang.notAddable', { what: words(n.left, a) }), n.left.at);
            if (!addable(b)) throw new LangError(t('lang.notAddable', { what: words(n.right, b) }), n.right.at);
            if (a === 'day' && b === 'day') throw new LangError(t('lang.twoDays'), n.at);
            if (a === 'day' || b === 'day') return 'day';
            return loose(a) || loose(b) ? 'any' : 'number';
          }
          case '-': {
            // A span taken from a day or a time leaves a day or a time; a time from a time is minutes.
            if (b === 'span') {
              if (a === 'span' || a === 'day' || a === 'time') return a;
              if (loose(a)) return 'any';
              throw new LangError(t('lang.spanOn', { what: words(n.left, a) }), n.left.at);
            }
            if (a === 'time' && (b === 'time' || loose(b))) return 'number';
            if (a === 'time' || b === 'time') throw new LangError(t('lang.timeAdd'), n.at);
            // A day taken from a day is a number of days, of minutes when both have their time; a number of days taken from a day is a day.
            const takeable = (k: Kind) => k === 'number' || k === 'bool' || k === 'day' || loose(k);
            if (!takeable(a)) throw new LangError(t('lang.notNumberOrDay', { what: words(n.left, a), op: '-' }), n.left.at);
            if (!takeable(b) || ((a === 'number' || a === 'bool') && b === 'day')) throw new LangError(t('lang.notNumberOrDay', { what: words(n.right, b), op: '-' }), n.right.at);
            if (a === 'day' && b === 'day') return 'number';
            if (a === 'day') return b === 'number' ? 'day' : 'any';
            return loose(a) || loose(b) ? 'any' : 'number';
          }
          case '*':
          case '/':
          case '%':
            if (!NUMBERISH(a)) throw new LangError(t('lang.notNumber', { what: words(n.left, a), op: n.op }), n.left.at);
            if (!NUMBERISH(b)) throw new LangError(t('lang.notNumber', { what: words(n.right, b), op: n.op }), n.right.at);
            return 'number';
          case '<':
          case '<=':
          case '>':
          case '>=':
            if (!loose(a) && !loose(b) && !(sameKind(a, b) && (a === 'number' || a === 'day' || a === 'time' || a === 'span' || a === 'text'))) throw new LangError(t('lang.compare', { a: kindWords(a), b: kindWords(b) }), n.at);
            return 'bool';
          case '==':
          case '!=':
            if (!loose(a) && !loose(b) && !sameKind(a, b) && !((isRecordKind(a) && b === 'text') || (isRecordKind(b) && a === 'text'))) throw new LangError(t('lang.compare', { a: kindWords(a), b: kindWords(b) }), n.at);
            return 'bool';
          case '&&':
          case '||':
            if (loose(a)) return b;
            if (loose(b)) return a;
            if (!sameKind(a, b)) throw new LangError(t('lang.logic', { a: kindWords(a), b: kindWords(b) }), n.at);
            return a;
          default:
            throw new LangError(t('lang.unexpected', { token: n.op }), n.at);
        }
      }
    }
  };
  /** What only a rule writes: the record, a set of values, a function (its names known while its body is checked), a list's method. */
  function visitRule(n: Node): Kind {
    switch (n.k) {
      case 'this':
        return scope.dir ? { record: scope.dir } : 'any';
      case 'obj':
        for (const e of n.entries) visit(e.value);
        return 'any';
      case 'arrow': {
        if (Array.isArray(n.body)) return 'any';
        const locals = new Map(scope.locals ?? []);
        for (const p of n.params) locals.set(p, 'any');
        check(n.body, { ...scope, locals }, stack);
        return 'any';
      }
      case 'mcall': {
        const of = visit(n.of);
        const item: Kind = isList(of) ? of.list : 'any';
        const fnArg = (i: number) => {
          const a = n.args[i];
          if (!a) throw new LangError(t('lang.args', { fn: n.name, count: t('lang.args.1') }), n.at);
          if (a.k !== 'arrow' || Array.isArray(a.body)) throw new LangError(t('lang.methodFn', { fn: n.name }), a.at);
          const locals = new Map(scope.locals ?? []);
          if (a.params[0]) locals.set(a.params[0], item);
          return check(a.body, { ...scope, locals }, stack).kind;
        };
        if (of !== 'any' && of !== 'null' && !isList(of)) throw new LangError(t('lang.notList', { what: kindWords(of), fn: n.name }), n.of.at);
        switch (n.name) {
          case 'filter':
            fnArg(0);
            return isList(of) ? of : { list: 'any' };
          case 'map':
            return { list: fnArg(0) };
          case 'some':
          case 'every':
            fnArg(0);
            return 'bool';
          case 'find':
            fnArg(0);
            return item;
          case 'includes':
            for (const a of n.args) visit(a);
            return 'bool';
          default:
            throw new LangError(t('lang.noMethod', { fn: n.name }), n.at);
        }
      }
      default:
        return 'any';
    }
  }
  const kind = visit(node);
  return { kind, reads: [...reads] };
}

/** What a formula gives and reads, or what is wrong with it. */
export function formulaInfo(expr: string, scope: Scope): Checked | { problem: string; at: number } {
  try {
    return check(parseExpression(expr), scope, scope.self ? [scope.self] : []);
  } catch (error) {
    if (error instanceof LangError) return { problem: error.message, at: error.at };
    throw error;
  }
}

// ---------- working out ----------

const pad2 = (n: number) => String(n).padStart(2, '0');
const clockText = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const clockMinutes = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));

/**
 * A day, as a count of days since 1970-01-01, so that days are added to and taken from; with its
 * time, the minutes since its start (14:30 is 870), null for a day alone, which is all day.
 */
export class Day {
  constructor(
    readonly n: number,
    readonly m: number | null = null,
  ) {}
  toString(): string {
    const day = new Date(this.n * 86400000).toISOString().slice(0, 10);
    return this.m === null ? day : `${day}T${clockText(this.m)}`;
  }
  /** Minutes since 1970-01-01: a day alone at its start. */
  get at(): number {
    return this.n * 1440 + (this.m ?? 0);
  }
}

/** A day from minutes since 1970-01-01, with its time. */
const dayAt = (minutes: number) => new Day(Math.floor(minutes / 1440), ((minutes % 1440) + 1440) % 1440);

/** A day, or a day with its time, as a Day; null when the text is not one. */
export function dayValue(text: string): Day | null {
  const value = isDay(text) ? text : dateTimeOf(text);
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number) as [number, number, number];
  const time = timeOf(value);
  return new Day(Math.round(Date.UTC(y, m - 1, d) / 86400000), time ? clockMinutes(time) : null);
}

/** A time of day, as minutes since midnight: 14:30 is 870. */
export class Clock {
  constructor(readonly m: number) {}
  toString(): string {
    return clockText(this.m);
  }
}

/** A time of day as a Clock; null when the text is not one. */
export function clockValue(text: string): Clock | null {
  const clock = clockOf(text);
  return clock ? new Clock(clockMinutes(clock)) : null;
}

/** A span of minutes, `minutes(30)`, `hours(2)`: what is added to a day or a time. */
export class Duration {
  constructor(readonly minutes: number) {}
}

/** A linked record as the language holds it: where it is, and its name for what shows it. */
export interface Ref {
  ref: true;
  dir: string;
  id: string;
  name: string;
  code?: string;
}

/** A card of a board as a rule holds it: where it is. */
export interface CardRef {
  cardref: true;
  board: string;
  id: string;
}

/** A set of values a rule writes, `{ name, planned }`, by key as written. */
export class Obj {
  constructor(readonly values: ReadonlyMap<string, RV>) {}
}

/** A function a rule writes, `l => l.actual > l.planned`, with the names it was written among. */
export class Fn {
  constructor(
    readonly params: string[],
    readonly body: Node | Stmt[],
    readonly env: Env,
  ) {}
}

/** A value as the language works with it. */
export type RV = number | string | boolean | null | Day | Clock | Duration | Ref | CardRef | Obj | Fn | RV[];

export const isCardRef = (v: unknown): v is CardRef => typeof v === 'object' && v !== null && (v as CardRef).cardref === true;

export const isRef = (v: unknown): v is Ref => typeof v === 'object' && v !== null && (v as Ref).ref === true;
const isLinkValue = (v: unknown): v is Link => typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as Link).name === 'string' && typeof (v as Link).id === 'string';

/** A field's value, as the record holds it, as the language reads it. */
export function toRuntime(field: Pick<Field, 'type' | 'collection'>, value: FieldValue | undefined): RV {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'date':
      return typeof value === 'string' ? dayValue(value) : null;
    case 'time':
      return typeof value === 'string' ? clockValue(value) : null;
    case 'link': {
      const ref = (l: Link): Ref => ({ ref: true, dir: field.collection ?? '', id: l.id, name: l.name, ...(l.code && { code: l.code }) });
      if (Array.isArray(value)) return (value as unknown[]).filter(isLinkValue).map(ref);
      return isLinkValue(value) ? ref(value) : null;
    }
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    case 'checkbox':
      return typeof value === 'boolean' ? value : null;
    default:
      if (Array.isArray(value)) return (value as unknown[]).map((v) => (isLinkValue(v) ? v.name : String(v)));
      if (isLinkValue(value)) return value.name;
      return value as RV;
  }
}

/** A value of the language as a record shows it: a day as YYYY-MM-DD, a linked record as a link. */
export function fromRuntime(v: RV): FieldValue {
  if (v === null || v === undefined || v instanceof Obj || v instanceof Fn || isCardRef(v)) return null;
  if (v instanceof Day || v instanceof Clock) return v.toString();
  if (v instanceof Duration) return v.minutes;
  if (isRef(v)) return { id: v.id, name: v.name, ...(v.code && { code: v.code }) };
  if (Array.isArray(v)) {
    const items = v.flat(8).filter((x) => x !== null && x !== undefined);
    if (items.length === 0) return null;
    if (items.every(isRef)) return items.map((r) => fromRuntime(r) as Link);
    return items.map((x) => textOf(x));
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return v;
}

export const isNothing = (v: RV) => v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v));

/** A value as text: what `text()` and `+` with a text make of it. */
export function textOf(v: RV): string {
  if (v === null || v === undefined || v instanceof Obj || v instanceof Fn || isCardRef(v)) return '';
  // A day with its time reads as the day and the clock.
  if (v instanceof Day) return v.m === null ? v.toString() : v.toString().replace('T', ' ');
  if (v instanceof Clock) return v.toString();
  if (v instanceof Duration) return String(v.minutes);
  if (isRef(v)) return v.name;
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(', ');
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v);
}

export const truthy = (v: RV): boolean => !(isNothing(v) || v === false || v === 0);

/** A value as a number for arithmetic: a number, or yes or no as 1 or 0; null for anything else. */
const numberOf = (v: RV): number | null => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : null);

/** Whether two values are the same as the language compares them: a link by its record, a day by its day. */
export function equal(a: RV, b: RV): boolean {
  if (isNothing(a) || isNothing(b)) return isNothing(a) && isNothing(b);
  if (a instanceof Day || b instanceof Day) return a instanceof Day && b instanceof Day && a.n === b.n && a.m === b.m;
  if (a instanceof Clock || b instanceof Clock) return a instanceof Clock && b instanceof Clock && a.m === b.m;
  if (a instanceof Duration || b instanceof Duration) return a instanceof Duration && b instanceof Duration && a.minutes === b.minutes;
  if (isRef(a) && isRef(b)) return a.id && b.id ? a.id === b.id : a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
  if (isRef(a) && typeof b === 'string') return a.name === b || a.code === b;
  if (isRef(b) && typeof a === 'string') return b.name === a || b.code === a;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]!));
  return a === b;
}

function order(a: RV, b: RV): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  // A day alone is at its start, as 00:00.
  if (a instanceof Day && b instanceof Day) return a.at - b.at;
  if (a instanceof Clock && b instanceof Clock) return a.m - b.m;
  if (a instanceof Duration && b instanceof Duration) return a.minutes - b.minutes;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return null;
}

/** What working out reads: the record's fields, a linked record's fields, today, who looks, and for a default the next number. */
export interface Env {
  field(key: string): RV;
  member(ref: Ref, key: string): RV;
  today: string;
  /** The day and the time it is, `YYYY-MM-DDTHH:mm`; unset for this device's clock on today. */
  now?: string;
  me?: string;
  /** The next number with a prefix, in so many digits at least: one more than the highest the field has in the collection. */
  next?(prefix: string, digits: number): string;
  /** In a rule: a name given a value before; undefined when it is not one. */
  local?(name: string): RV | undefined;
  /** In a rule: the record itself. */
  self?: Ref;
  /** In a rule: what one of its own functions gives (add, find…); undefined for one that is not. */
  rule?(fn: string, args: RV[], node: Node): RV | undefined;
  /** In a rule: a field of a card, or its title, column, due day or assignee. */
  cardMember?(card: CardRef, key: string): RV;
  /** The parts visited so far, shared by everything one rule works out. */
  steps?: { n: number };
}

/** Works a function out for the values it is given. */
export function applyFn(fn: Fn, args: RV[]): RV {
  if (Array.isArray(fn.body)) throw new LangError(t('lang.methodFn', { fn: '' }));
  const outer = fn.env;
  return evaluate(fn.body, { ...outer, local: (name) => (fn.params.includes(name) ? (args[fn.params.indexOf(name)] ?? null) : outer.local?.(name)) });
}

/** How many parts of an expression one working out may visit, so that nothing runs away. */
const MAX_STEPS = 100000;

/** Works an expression out; a part that cannot be (an empty field, a wrong kind, a division by zero) gives null. */
export function evaluate(node: Node, env: Env): RV {
  const steps = env.steps ?? { n: 0 };
  const run = (n: Node): RV => {
    if (++steps.n > MAX_STEPS) throw new LangError(t('lang.tooMuch'), n.at);
    switch (n.k) {
      case 'num':
        return n.v;
      case 'str':
        return n.v;
      case 'bool':
        return n.v;
      case 'null':
        return null;
      case 'tpl':
        return n.parts.map((p) => (typeof p === 'string' ? p : textOf(run(p)))).join('');
      case 'list':
        return n.items.map(run);
      case 'name': {
        const local = env.local?.(n.name);
        return local !== undefined ? local : env.field(n.name);
      }
      case 'member': {
        const of = run(n.of);
        if (n.name === 'length' && (Array.isArray(of) || typeof of === 'string')) return of.length;
        if (isRef(of)) return env.member(of, n.name);
        if (isCardRef(of)) return env.cardMember?.(of, n.name) ?? null;
        // A set of values, as old is: the record as it was.
        if (of instanceof Obj) return of.values.get(n.name) ?? null;
        if (Array.isArray(of)) return of.flatMap((r) => (isRef(r) ? [env.member(r, n.name)] : isCardRef(r) ? [env.cardMember?.(r, n.name) ?? null] : [])).flat();
        return null;
      }
      case 'call': {
        const args = n.args.map(run);
        if (n.fn === 'sum' && args[1] instanceof Fn && Array.isArray(args[0])) return numbersIn(args[0].map((x) => applyFn(args[1] as Fn, [x]))).reduce((s, x) => s + x, 0);
        if (!FNS[n.fn] && env.rule) {
          const own = env.rule(n.fn, args, n);
          if (own !== undefined) return own;
          throw new LangError(t('lang.noFunction', { fn: n.fn }), n.at);
        }
        return call(n.fn, args, env);
      }
      case 'index': {
        const of = run(n.of);
        const at = run(n.index);
        return Array.isArray(of) && typeof at === 'number' && Number.isInteger(at) && at >= 0 ? (of[at] ?? null) : null;
      }
      case 'this':
        return env.self ?? null;
      case 'obj':
        return new Obj(new Map(n.entries.map((e) => [e.key, run(e.value)])));
      case 'arrow':
        return new Fn(n.params, n.body, { ...env, steps });
      case 'mcall': {
        const of = run(n.of);
        const list = Array.isArray(of) ? of : [];
        const fn = run(n.args[0] ?? { k: 'null', at: n.at, end: n.end });
        const each = (x: RV) => (fn instanceof Fn ? truthy(applyFn(fn, [x])) : false);
        switch (n.name) {
          case 'filter':
            return list.filter(each);
          case 'map':
            return fn instanceof Fn ? list.map((x) => applyFn(fn, [x])) : [];
          case 'some':
            return list.some(each);
          case 'every':
            return list.every(each);
          case 'find':
            return list.find(each) ?? null;
          case 'includes':
            return list.some((x) => equal(x, fn));
          default:
            throw new LangError(t('lang.noMethod', { fn: n.name }), n.at);
        }
      }
      case 'unary': {
        const v = run(n.of);
        if (n.op === '!') return !truthy(v);
        const x = numberOf(v);
        return x === null ? null : -x;
      }
      case 'cond':
        return truthy(run(n.test)) ? run(n.yes) : run(n.no);
      case 'bin': {
        if (n.op === '&&') {
          const a = run(n.left);
          return truthy(a) ? run(n.right) : a;
        }
        if (n.op === '||') {
          const a = run(n.left);
          return truthy(a) ? a : run(n.right);
        }
        const [a, b] = [run(n.left), run(n.right)];
        switch (n.op) {
          case '==':
            return equal(a, b);
          case '!=':
            return !equal(a, b);
          case '<':
          case '<=':
          case '>':
          case '>=': {
            // What is not written yet is neither before nor after anything: the comparison gives
            // nothing, so that a check of a field still empty does not fail.
            if (isNothing(a) || isNothing(b)) return null;
            const o = order(a, b);
            if (o === null) return false;
            return n.op === '<' ? o < 0 : n.op === '<=' ? o <= 0 : n.op === '>' ? o > 0 : o >= 0;
          }
          case '+': {
            if (typeof a === 'string' || typeof b === 'string') return textOf(a) + textOf(b);
            if (a instanceof Duration || b instanceof Duration) return plus(a instanceof Duration ? b : a, (a instanceof Duration ? a : (b as Duration)).minutes);
            const [x, y] = [numberOf(a), numberOf(b)];
            if (x !== null && y !== null) return x + y;
            if (a instanceof Day && y !== null) return new Day(a.n + Math.trunc(y), a.m);
            if (x !== null && b instanceof Day) return new Day(b.n + Math.trunc(x), b.m);
            return null;
          }
          case '-': {
            if (b instanceof Duration) return plus(a, -b.minutes);
            const [x, y] = [numberOf(a), numberOf(b)];
            if (x !== null && y !== null) return x - y;
            // Two days with their times are so many minutes apart; else so many days.
            if (a instanceof Day && b instanceof Day) return a.m !== null && b.m !== null ? a.at - b.at : a.n - b.n;
            if (a instanceof Clock && b instanceof Clock) return a.m - b.m;
            if (a instanceof Day && y !== null) return new Day(a.n - Math.trunc(y), a.m);
            return null;
          }
          case '*':
          case '/':
          case '%': {
            const [x, y] = [numberOf(a), numberOf(b)];
            if (x === null || y === null || (n.op !== '*' && y === 0)) return null;
            return n.op === '*' ? x * y : n.op === '/' ? x / y : x % y;
          }
          default:
            return null;
        }
      }
    }
  };
  const result = run(node);
  return typeof result === 'number' && !Number.isFinite(result) ? null : result;
}

/** A day, a time or a span with minutes added: a day alone at its start gets a time; a time goes round the clock. */
function plus(v: RV, minutes: number): RV {
  if (v instanceof Day) return dayAt(v.at + Math.round(minutes));
  if (v instanceof Clock) return new Clock((((v.m + Math.round(minutes)) % 1440) + 1440) % 1440);
  if (v instanceof Duration) return new Duration(v.minutes + minutes);
  return null;
}

/** This device's clock on `today`, for now() where none is given. */
function nowOn(today: string): string {
  const d = new Date();
  return `${today}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const numbersIn = (args: RV[]): number[] => args.flat(8).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
const daysIn = (args: RV[]): Day[] => args.flat(8).filter((v): v is Day => v instanceof Day);

function call(fn: string, args: RV[], env: Env): RV {
  const [a, b] = args;
  switch (fn) {
    case 'today':
      return dayValue(env.today);
    case 'now':
      return dayValue(env.now ?? nowOn(env.today));
    case 'minutes':
      return typeof a === 'number' ? new Duration(a) : null;
    case 'hours':
      return typeof a === 'number' ? new Duration(a * 60) : null;
    case 'day':
      return a instanceof Day ? new Day(a.n) : null;
    case 'time':
      return a instanceof Day && a.m !== null ? new Clock(a.m) : null;
    case 'at':
      return a instanceof Day ? (b instanceof Clock ? new Day(a.n, b.m) : new Day(a.n)) : null;
    case 'me':
      return env.me ?? null;
    case 'next': {
      if (typeof a !== 'string' || !env.next) return null;
      const digits = typeof b === 'number' ? Math.max(1, Math.min(12, Math.trunc(b))) : 1;
      return env.next(a, digits);
    }
    case 'empty':
      return isNothing(a ?? null);
    case 'text':
      return textOf(a ?? null);
    case 'abs':
      return typeof a === 'number' ? Math.abs(a) : null;
    case 'round': {
      if (typeof a !== 'number') return null;
      const places = typeof b === 'number' ? Math.max(0, Math.min(10, Math.trunc(b))) : 0;
      const f = 10 ** places;
      return Math.round(a * f) / f;
    }
    case 'year':
    case 'month': {
      if (!(a instanceof Day)) return null;
      const [y, m] = a.toString().split('-').map(Number) as [number, number];
      return fn === 'year' ? y : m;
    }
    case 'sum':
      return numbersIn(args).reduce((s, n) => s + n, 0);
    case 'min':
    case 'max': {
      const numbers = numbersIn(args);
      if (numbers.length > 0) return fn === 'min' ? Math.min(...numbers) : Math.max(...numbers);
      const days = daysIn(args);
      if (days.length > 0) return days.reduce((x, y) => ((fn === 'min' ? y.at < x.at : y.at > x.at) ? y : x));
      const clocks = args.flat(8).filter((v): v is Clock => v instanceof Clock);
      if (clocks.length === 0) return null;
      return clocks.reduce((x, y) => ((fn === 'min' ? y.m < x.m : y.m > x.m) ? y : x));
    }
    case 'contains': {
      if (a === null || a === undefined || b === null || b === undefined) return false;
      if (Array.isArray(a)) return a.some((x) => equal(x, b) || (typeof x === 'string' && typeof b === 'string' && x.toLowerCase() === b.toLowerCase()));
      return textOf(a).toLowerCase().includes(textOf(b).toLowerCase());
    }
    default:
      return null;
  }
}
