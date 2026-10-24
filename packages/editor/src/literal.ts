import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { isolateHistory } from '@codemirror/commands';
import { type ChangeSet, EditorState, type Extension, Transaction, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { sourceMode } from './livePreview';

// In the normal view the note is text, not Markdown: what is typed or pasted stays as it is.
// `*.txt`, `__init__` or a `#` at the start of a line must not turn into formatting. Characters
// that would act as Markdown syntax are therefore escaped with a backslash as they come in; the
// preview hides the backslash. Formatting is applied with the format controls only.

/** Syntax made of punctuation that the user can type. */
const MARKS = new Set([
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'HeaderMark',
  'QuoteMark',
  'ListMark',
  'TableDelimiter',
  'HorizontalRule',
]);
// These become syntax when a space is typed after them, so the typed text does not overlap them.
const PREFIX_MARKS = new Set(['HeaderMark', 'ListMark']);
const PUNCTUATION = /[!-/:-@[-`{-~]/;

interface Span {
  from: number;
  to: number;
}

/** Positions of the characters in `inserted` that act as Markdown syntax and need a backslash. */
export function positionsToEscape(state: EditorState, inserted: readonly Span[]): number[] {
  const doc = state.doc;
  const end = Math.max(...inserted.map((r) => doc.lineAt(r.to).to));
  const tree = ensureSyntaxTree(state, end, 100) ?? syntaxTree(state);
  const out = new Set<number>();
  for (const range of inserted) {
    tree.iterate({
      from: doc.lineAt(range.from).from,
      to: doc.lineAt(range.to).to,
      enter(node) {
        if (!MARKS.has(node.name)) return;
        let from = Math.max(node.from, range.from);
        let to = Math.min(node.to, range.to);
        // A backslash has no effect inside a code span, so a typed closing backtick is undone
        // by escaping the opening one.
        const span = node.name === 'CodeMark' ? node.node.parent : null;
        const open = span?.name === 'InlineCode' ? span.getChild('CodeMark') : null;
        if (open && to > from) ({ from, to } = open);
        for (let pos = from; pos < to; pos++) {
          if (PUNCTUATION.test(doc.sliceString(pos, pos + 1))) out.add(pos);
        }
        if (PREFIX_MARKS.has(node.name) && node.to === range.from) {
          // `1.` is escaped at the dot: a backslash before a digit is not an escape.
          out.add(/\d/.test(doc.sliceString(node.from, node.from + 1)) ? node.to - 1 : node.from);
        }
      },
    });
  }
  return [...out].sort((a, b) => a - b);
}

// A list is the one thing typing makes: `- `, `* ` or `1. ` at the start of a line, in a quote or
// a callout too, as other notes apps do. The line before the typed space, its mark escaped or not.
const LIST_START = /^((?:[ \t]*>[ \t]?)*[ \t]*)(?:(\\?)[-*]|1(\\?)\.)$/;
const CODE = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'HTMLBlock', 'CommentBlock']);

/**
 * The space typed after a list mark at the start of a line makes the line a list item: the mark's
 * backslash is taken away, in a step of its own, so that undo puts it back and the mark is text
 * again. A mark that typing did not escape, as one under a line of text, is escaped first, outside
 * the history. Null when `inserted` is no such space.
 */
export function typedListStart(state: EditorState, inserted: readonly Span[]): TransactionSpec[] | null {
  const space = inserted.length === 1 ? inserted[0]! : null;
  if (!space || state.doc.sliceString(space.from, space.to) !== ' ') return null;
  const line = state.doc.lineAt(space.from);
  const start = LIST_START.exec(line.text.slice(0, space.from - line.from));
  if (!start) return null;
  const tree = ensureSyntaxTree(state, line.to, 100) ?? syntaxTree(state);
  for (let node: SyntaxNode | null = tree.resolveInner(space.from, -1); node; node = node.parent) {
    if (CODE.has(node.name)) return null;
  }
  const backslash = start[2] ?? start[3]!;
  // Before the dash or star; in `1.` before the dot, as `positionsToEscape` puts it.
  const at = line.from + start[1]!.length + (start[2] === undefined ? 1 : 0);
  const unescape: TransactionSpec = { changes: { from: at, to: at + 1 }, userEvent: 'input.format', annotations: isolateHistory.of('full') };
  if (backslash) return [unescape];
  return [{ changes: { from: at, insert: '\\' }, annotations: Transaction.addToHistory.of(false) }, unescape];
}

/**
 * Dividers written `---` that an edit put right under a line of text, where they underline it as
 * a heading: the blank line between deleted, or text typed on it. Given as the ranges of their
 * `---` in `state`.
 */
export function gluedDividers(before: EditorState, state: EditorState, changes: ChangeSet): Span[] {
  const doc = state.doc;
  const out: Span[] = [];
  changes.iterChangedRanges((_fromA, _toA, from, to) => {
    // The divider is on the changed lines or the one after them.
    const first = doc.lineAt(from).number;
    const last = Math.min(doc.lineAt(to).number + 1, doc.lines);
    let underline = false;
    for (let n = first; n <= last && !underline; n++) underline = UNDERLINE.test(doc.line(n).text);
    if (!underline) return;
    const end = doc.line(last).to;
    const tree = ensureSyntaxTree(state, end, 100) ?? syntaxTree(state);
    tree.iterate({
      from: doc.line(first).from,
      to: end,
      enter(node) {
        if (node.name !== 'SetextHeading2') return;
        const mark = node.node.getChild('HeaderMark');
        if (!mark || out.some((span) => span.from === mark.from)) return false;
        const at = changes.invertedDesc.mapPos(mark.from, 1);
        const old = ensureSyntaxTree(before, at + 1, 100) ?? syntaxTree(before);
        for (let was: SyntaxNode | null = old.resolveInner(at, 1); was; was = was.parent) {
          if (was.name === 'HorizontalRule' && was.from === at) out.push({ from: mark.from, to: mark.to });
        }
        return false;
      },
    });
  });
  return out;
}

// What can underline a heading: a row of dashes, as a divider may be written too.
const UNDERLINE = /^ {0,3}-+[ \t]*$/;

/** Keeps a divider one when an edit puts it right under a line of text: it is written `***` instead. Off in source mode. */
export const keepDividers = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.startState.field(sourceMode, false)) return tr;
  if (!['input', 'delete', 'move'].some((event) => tr.isUserEvent(event))) return tr;
  const glued = gluedDividers(tr.startState, tr.state, tr.changes);
  // In the same transaction, so that one undo puts back the blank line and the `---` with it.
  return glued.length ? [tr, { changes: glued.map((span) => ({ ...span, insert: '***' })), sequential: true }] : tr;
});

const TYPED = ['input.type', 'input.paste', 'input.drop'];

/** Escapes Markdown syntax in text as it is typed, pasted or dropped. Off in source mode. */
export function literalInput(): Extension {
  let busy = false;
  return EditorView.updateListener.of((update) => {
    if (busy || !update.docChanged || update.view.composing || update.state.field(sourceMode, false)) return;
    if (!update.transactions.some((tr) => TYPED.some((event) => tr.isUserEvent(event)))) return;
    let inserted: Span[] = [];
    update.changes.iterChangedRanges((_fromA, _toA, from, to) => {
      if (to > from) inserted.push({ from, to });
    });
    busy = true;
    try {
      // Escaping one mark can let the characters next to it pair up differently, so look again.
      for (let pass = 0; pass < 4 && inserted.length; pass++) {
        const state = update.view.state;
        const positions = positionsToEscape(state, inserted);
        if (!positions.length) break;
        const changes = state.changes(positions.map((from) => ({ from, insert: '\\' })));
        // Same user event as typing, so one undo step removes the character and its backslash.
        update.view.dispatch({ changes, userEvent: 'input.type' });
        inserted = inserted.map((r) => ({ from: changes.mapPos(r.from, -1), to: changes.mapPos(r.to, 1) }));
      }
      if (update.transactions.some((tr) => tr.isUserEvent('input.type'))) {
        for (const spec of typedListStart(update.view.state, inserted) ?? []) update.view.dispatch(spec);
      }
    } finally {
      busy = false;
    }
  });
}
