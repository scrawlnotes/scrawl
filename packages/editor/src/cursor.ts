import {
  Annotation,
  type ChangeSpec,
  EditorSelection,
  EditorState,
  type Extension,
  findClusterBreak,
  Prec,
  Transaction,
} from '@codemirror/state';
import { type Command, type EditorView, keymap } from '@codemirror/view';
import { backspaceInCallout, calloutTextStart, deleteAboveCallout, enterInEmptyCallout, findCallouts, leaveCalloutTitle } from './callout';
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
    let pos = restingPosition(state, range.head, prev, pointer);
    // Off a callout's marker line, which is drawn as its title.
    pos = leaveCalloutTitle(state, pos, prev, pointer) ?? pos;
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

/** Makes an edit a key press was turned into, with the cursor placed where it says; false when there is none. */
function edit(view: EditorView, change: { changes: ChangeSpec[]; anchor: number } | null, userEvent: string): boolean {
  if (!change) return false;
  view.dispatch({ changes: change.changes, selection: { anchor: change.anchor }, annotations: rawSelection.of(true), scrollIntoView: true, userEvent });
  return true;
}

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

type Piece = { from: number; to: number };

/** The formatted spans with both of their hidden marks on the lines from `from` to `to`. */
function spansOn(state: EditorState, from: number, to: number): { open: RoleRange; close: RoleRange }[] {
  const spans = new Map<string, { open?: RoleRange; close?: RoleRange }>();
  for (const r of roleRanges(state, state.doc.lineAt(from).from, state.doc.lineAt(to).to)) {
    if (!isInline(r) || !r.span) continue;
    const key = `${r.span.from}:${r.span.to}`;
    const span = spans.get(key) ?? {};
    span[r.role as 'open' | 'close'] = r;
    spans.set(key, span);
  }
  return [...spans.values()].filter((s): s is { open: RoleRange; close: RoleRange } => !!s.open && !!s.close);
}

/**
 * What to take away instead of `from`-`to`, so that no formatted span is left with only one of
 * its hidden marks, which would show as a stray `[` or `**`. A span whose text is all taken goes
 * whole, marks included, when one of its marks was in the range too or when the text is deleted
 * rather than typed over. A span whose text is only partly taken keeps its marks, and what is
 * left of its text keeps its format, as in a word processor. Null when the range can go as it is.
 */
export function wholeSpanDeletion(state: EditorState, from: number, to: number, deleting: boolean): Piece[] | null {
  const spans = spansOn(state, from, to);
  let pieces: Piece[] = [{ from, to }];
  let changed = false;
  // A span that grows to its whole length can reach into another one; a few rounds settle that.
  for (let round = 0, again = true; again && round < 8; round++) {
    again = false;
    for (const { open, close } of spans) {
      const next: Piece[] = [];
      for (const p of pieces) {
        const touches = (mark: RoleRange) => p.from < mark.to && p.to > mark.from;
        const takesText = p.from <= open.to && p.to >= close.from;
        if (takesText && (touches(open) || touches(close) || deleting)) {
          const whole = { from: Math.min(p.from, open.from), to: Math.max(p.to, close.to) };
          if (whole.from !== p.from || whole.to !== p.to) again = true;
          next.push(whole);
        } else if (touches(open) || touches(close)) {
          again = true;
          let parts = [p];
          for (const mark of [open, close]) {
            parts = parts.flatMap((q) =>
              q.from < mark.to && q.to > mark.from ? [{ from: q.from, to: mark.from }, { from: mark.to, to: q.to }] : [q],
            );
          }
          next.push(...parts.filter((q) => q.to > q.from));
        } else {
          next.push(p);
        }
      }
      // Pieces that grew into each other become one.
      next.sort((a, b) => a.from - b.from);
      pieces = [];
      for (const p of next) {
        const last = pieces[pieces.length - 1];
        if (last && p.from <= last.to) last.to = Math.max(last.to, p.to);
        else pieces.push({ ...p });
      }
      changed ||= again;
    }
  }
  return changed ? pieces : null;
}

/** Edits that take away a selection, as opposed to the single characters Backspace and Delete take. */
const takesSelection = (tr: Transaction) =>
  tr.isUserEvent('delete') || tr.isUserEvent('input.type') || tr.isUserEvent('input.paste');

/** A selection that is deleted, cut or typed over takes formatted spans whole or not at all; see `wholeSpanDeletion`. */
const keepSpansWhole = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !takesSelection(tr)) return tr;
  const state = tr.startState;
  if (state.field(sourceMode, false)) return tr;
  const edits: { from: number; to: number; text: string }[] = [];
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => edits.push({ from, to, text: inserted.toString() }));
  // Several cursors at once are left as they are.
  if (edits.length !== 1 || edits[0]!.to === edits[0]!.from) return tr;
  const { from, to, text } = edits[0]!;
  const pieces = wholeSpanDeletion(state, from, to, tr.isUserEvent('delete'));
  if (!pieces) return tr;
  // What was typed or pasted goes where the first remaining piece starts.
  const at = pieces[0]?.from ?? from;
  const specs = pieces.length ? pieces.map((p, i) => ({ ...p, insert: i === 0 ? text : '' })) : [{ from, insert: text }];
  const changes = state.changes(specs);
  return {
    changes,
    selection: { anchor: changes.mapPos(at, -1) + text.length },
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    userEvent: tr.annotation(Transaction.userEvent),
  };
});

/** Backspace deletes the character before the hidden marks, not the marks. */
const backspace: Command = (view) => {
  const start = singleCursor(view.state);
  if (start === null) return false;
  if (backspaceUnderTable(view, start)) return true;
  if (edit(view, backspaceInCallout(view.state, start), 'delete.backward')) return true;
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
  if (deleteAboveTable(view, start) || deleteAboveCallout(view.state, start)) return true;
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

/**
 * Text typed or pasted on the edge of a callout's marker line, where a note that starts with one
 * opens, goes to the start of the callout's text: in front of the marker it would break it.
 */
const typeOffCalloutTitle = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent('input.type') || tr.isUserEvent('input.paste'))) return tr;
  const head = singleCursor(tr.startState);
  if (head === null) return tr;
  const callout = findCallouts(tr.startState).find((c) => head === c.title.from || head === c.title.to);
  if (!callout) return tr;
  const inserted: string[] = [];
  let pure = true;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, text) => {
    if (fromA !== head || toA !== head) pure = false;
    inserted.push(text.toString());
  });
  if (!pure) return tr;
  const text = inserted.join('');
  const at = calloutTextStart(tr.startState, callout);
  return { changes: { from: at, insert: text }, selection: { anchor: at + text.length }, scrollIntoView: true, userEvent: tr.annotation(Transaction.userEvent) };
});

export const cursorBehavior: Extension = [
  normalizeCursor,
  keepSpansWhole,
  typeOffCalloutTitle,
  // Highest: the Markdown keymap also binds Enter and Backspace at high precedence and would run first.
  Prec.highest(
    keymap.of([
      { key: 'Backspace', run: backspace },
      { key: 'Delete', run: deleteForward },
      { key: 'Space', run: leaveSpan },
      {
        key: 'Enter',
        run: (view) => {
          const start = singleCursor(view.state);
          const empty = start === null ? null : enterInEmptyCallout(view.state, start);
          return edit(view, empty, 'input') || leaveEmptyBlock(view) || leaveSpan(view);
        },
      },
    ]),
  ),
];
