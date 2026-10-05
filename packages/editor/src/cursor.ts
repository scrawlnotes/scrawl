import {
  Annotation,
  EditorSelection,
  EditorState,
  type Extension,
  findClusterBreak,
  Prec,
  Transaction,
} from '@codemirror/state';
import { type Command, type EditorView, keymap } from '@codemirror/view';
import { type RoleRange, roleRanges, sourceMode } from './livePreview';
import { enterTableEnd, tableRanges } from './table';

// With the Markdown syntax hidden, several document positions look like the same place: before
// and after `**`, for example. This module keeps the cursor on the side that behaves the way
// formatted text does in a word processor, so that no key press appears to do nothing.

/** Marks a selection that was placed deliberately and must not be normalized. */
const rawSelection = Annotation.define<boolean>();

const isInline = (r: RoleRange) => r.role === 'open' || r.role === 'close';

function rolesOnLine(state: EditorState, pos: number): RoleRange[] {
  const line = state.doc.lineAt(pos);
  return roleRanges(state, line.from, line.to);
}

/** The position one visible character after `pos`, skipping hidden marks that start there. */
function stepForward(state: EditorState, pos: number, roles: RoleRange[]): number {
  const line = state.doc.lineAt(pos);
  let at = pos;
  for (let r; (r = roles.find((r) => isInline(r) && r.from === at && r.to > at)); ) at = r.to;
  const unit = roles.find((r) => r.role === 'unit' && r.from === at);
  if (unit) return unit.to;
  if (at < line.to) return line.from + findClusterBreak(line.text, at - line.from, true);
  return Math.min(at + 1, state.doc.length);
}

/**
 * Where a cursor that was moved to `pos` should rest. `prev` is where it came from.
 *
 * - Around inline marks the cursor rests before the hidden mark: outside a span at its start,
 *   inside it at its end, so typing at the end continues the formatting.
 * - After a line prefix the cursor rests behind it, never in front of the hidden `# ` or `- `.
 */
export function restingPosition(state: EditorState, pos: number, prev: number, pointer = false): number {
  for (let i = 0; i < 8; i++) {
    const roles = rolesOnLine(state, pos);
    const inline = roles.find((r) => isInline(r) && r.from < pos && pos <= r.to);
    if (inline) {
      // Stepping right from the resting side crosses the mark and one character.
      const next = !pointer && prev === inline.from ? stepForward(state, inline.to, roles) : inline.from;
      prev = -1;
      if (next === pos) break;
      pos = next;
      continue;
    }
    const prefix = roles.find((r) => r.role === 'prefix' && r.from <= pos && pos < r.to);
    if (prefix) {
      // Stepping left from the start of the text leaves the line.
      const back = !pointer && prev === prefix.to && prefix.from > 0;
      prev = back ? prefix.from : -1;
      pos = back ? prefix.from - 1 : prefix.to;
      continue;
    }
    break;
  }
  return pos;
}

/**
 * A table is drawn as one block, and its two edges are document positions where typing would
 * change the table's source. A cursor that arrives on an edge moves on to the line past the
 * table instead; at the very start or end of the note that line is created first.
 */
function leaveTableEdge(state: EditorState, pos: number, prev: number, pointer: boolean) {
  const table = tableRanges(state).find((t) => pos === t.from || pos === t.to);
  if (!table) return null;
  // Arrow keys continue in their direction. A click, or a move that starts on the table itself
  // (it was selected), goes to the side of the edge it landed on.
  const outside = !pointer && prev >= 0 && (prev < table.from || prev > table.to);
  const down = outside ? prev < table.from : pos === table.to;
  if (down) {
    if (table.to < state.doc.length) return { pos: table.to + 1 };
    return { pos: table.to + 1, insert: { from: table.to, insert: '\n' } };
  }
  if (table.from > 0) return { pos: table.from - 1 };
  return { pos: 0, insert: { from: 0, insert: '\n' } };
}

const normalizeCursor = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.docChanged || tr.annotation(rawSelection)) return tr;
  const state = tr.startState;
  if (state.field(sourceMode, false)) return tr;
  const pointer = tr.isUserEvent('select.pointer');
  if (tr.selection.ranges.length === 1 && tr.selection.main.empty) {
    const edge = leaveTableEdge(state, tr.selection.main.head, state.selection.main.head, pointer);
    if (edge) {
      return [
        tr,
        {
          changes: edge.insert,
          selection: { anchor: edge.pos },
          sequential: true,
          annotations: [rawSelection.of(true), Transaction.addToHistory.of(false)],
        },
      ];
    }
  }
  const before = state.selection.ranges;
  const after = tr.selection.ranges;
  let changed = false;
  const ranges = after.map((range, i) => {
    if (!range.empty) return range;
    const prev = before.length === after.length ? before[i]!.head : -1;
    const pos = restingPosition(state, range.head, prev, pointer);
    if (pos === range.head) return range;
    changed = true;
    return EditorSelection.cursor(pos);
  });
  if (!changed) return tr;
  return [tr, { selection: EditorSelection.create(ranges, tr.selection.mainIndex), sequential: true }];
});

function singleCursor(state: EditorState): number | null {
  const { ranges, main } = state.selection;
  return !state.field(sourceMode, false) && ranges.length === 1 && main.empty ? main.head : null;
}

const moveRaw = (view: EditorView, pos: number) =>
  view.dispatch({ selection: { anchor: pos }, annotations: rawSelection.of(true) });

/** Removes a formatted span whose only character is about to be deleted, marks included. */
function deleteLastCharOfSpan(view: EditorView, edge: RoleRange | undefined, roles: RoleRange[]): boolean {
  const span = edge?.span;
  if (!span) return false;
  const open = roles.find((r) => r.role === 'open' && r.span?.from === span.from && r.span.to === span.to);
  const close = roles.find((r) => r.role === 'close' && r.span?.from === span.from && r.span.to === span.to);
  if (!open || !close) return false;
  const content = view.state.sliceDoc(open.to, close.from);
  if (!content || findClusterBreak(content, 0, true) < content.length) return false;
  view.dispatch({ changes: span, selection: { anchor: span.from }, userEvent: 'delete' });
  return true;
}

/**
 * Backspace at the start of the line under a table. An empty line is removed and the cursor
 * goes back into the table's last cell; a line with text stays where it is, since joining it
 * to the table would make it part of the table's source.
 */
function backspaceUnderTable(view: EditorView, pos: number): boolean {
  const state = view.state;
  const table = tableRanges(state).find((t) => t.to + 1 === pos);
  if (!table) return false;
  const line = state.doc.lineAt(pos);
  if (line.text === '') {
    const isLast = line.number === state.doc.lines;
    view.dispatch({
      changes: isLast ? { from: table.to, to: line.to } : { from: line.from, to: line.to + 1 },
      selection: { anchor: table.to },
      annotations: rawSelection.of(true),
      userEvent: 'delete.backward',
    });
    enterTableEnd(view, table.from);
  }
  return true;
}

/** Delete at the end of the line above a table: the table is not pulled up into that line. */
function deleteAboveTable(view: EditorView, pos: number): boolean {
  return tableRanges(view.state).some((t) => t.from - 1 === pos);
}

/** Backspace deletes the character before the hidden marks, not the marks. */
const backspace: Command = (view) => {
  const start = singleCursor(view.state);
  if (start === null) return false;
  if (backspaceUnderTable(view, start)) return true;
  const roles = rolesOnLine(view.state, start);
  let pos = start;
  for (let r; (r = roles.find((r) => isInline(r) && r.to === pos && r.from < pos)); ) pos = r.from;
  const close = roles.find((r) => r.role === 'close' && r.from === pos);
  if (deleteLastCharOfSpan(view, close, roles)) return true;
  if (pos !== start) moveRaw(view, pos);
  return false;
};

/** Delete removes the character after the hidden marks, not the marks. */
const deleteForward: Command = (view) => {
  const start = singleCursor(view.state);
  if (start === null) return false;
  if (deleteAboveTable(view, start)) return true;
  const roles = rolesOnLine(view.state, start);
  let pos = start;
  for (let r; (r = roles.find((r) => isInline(r) && r.from === pos && r.to > pos)); ) pos = r.to;
  const open = roles.find((r) => r.role === 'open' && r.to === pos);
  if (deleteLastCharOfSpan(view, open, roles)) return true;
  if (pos !== start) moveRaw(view, pos);
  return false;
};

/** A space or line break typed at the end of a formatted span goes after it, ending the formatting. */
const leaveSpan: Command = (view) => {
  const start = singleCursor(view.state);
  if (start === null) return false;
  const roles = rolesOnLine(view.state, start);
  let pos = start;
  for (let r; (r = roles.find((r) => r.role === 'close' && r.from === pos && r.to > pos)); ) pos = r.to;
  if (pos !== start) moveRaw(view, pos);
  return false;
};

const ONLY_PREFIX = /^[ \t]*(?:>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)+$/;

/** Enter on a quote or list line with nothing in it ends the quote or list instead of continuing it. */
const leaveEmptyBlock: Command = (view) => {
  const start = singleCursor(view.state);
  if (start === null) return false;
  const line = view.state.doc.lineAt(start);
  if (!ONLY_PREFIX.test(line.text)) return false;
  // The emptied line stays as a blank line and the cursor goes to a new one below it. Text typed
  // directly under a quote or list item would still be read as part of it.
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: '\n' },
    selection: { anchor: line.from + 1 },
    scrollIntoView: true,
    userEvent: 'input',
  });
  return true;
};

export const cursorBehavior: Extension = [
  normalizeCursor,
  // Highest: the Markdown keymap also binds Enter and Backspace at high precedence and would run first.
  Prec.highest(
    keymap.of([
      { key: 'Backspace', run: backspace },
      { key: 'Delete', run: deleteForward },
      { key: 'Space', run: leaveSpan },
      { key: 'Enter', run: (view) => leaveEmptyBlock(view) || leaveSpan(view) },
    ]),
  ),
];
