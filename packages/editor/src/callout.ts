import { syntaxTree } from '@codemirror/language';
import { type ChangeSpec, type EditorState, type Line, type StateCommand } from '@codemirror/state';

// A callout is GitHub's: a quote whose first line is only `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
// `[!WARNING]` or `[!CAUTION]` (design/callouts.md). It stays plain Markdown that GitHub and
// Obsidian read; the note draws it as a box of its kind's colour. What finds and changes one is
// here; how it is drawn is in calloutBlock.ts.

export type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution';
export const CALLOUT_TYPES: readonly CalloutType[] = ['note', 'tip', 'important', 'warning', 'caution'];

/** Each kind's icon, and the format controls': the inside of an SVG on a 24 × 24 grid, as the app's icons are. */
export const CALLOUT_ICONS: Record<CalloutType | 'callout', string> = {
  callout: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 5v14"/><path d="M11 10h6M11 14h4"/>',
  note: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  tip: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.6.5 1 1.2 1 2.1V16h4.6v-.5c0-.9.4-1.6 1-2.1A5.5 5.5 0 0 0 12 3.5z"/>',
  important: '<path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5v-10A1.5 1.5 0 0 1 5.5 4z"/><path d="M12 7.5v4.5M12 14.3v.2"/>',
  warning: '<path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.3 12.7a2 2 0 0 1-1.7 3H4.7a2 2 0 0 1-1.7-3z"/><path d="M12 9.5v4M12 16.6v.2"/>',
  caution: '<path d="M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3z"/><path d="M12 8v4.5M12 15.6v.2"/>',
};

/** A kind's icon as an SVG element's markup, in the colour of the text around it. */
export const calloutSvg = (type: CalloutType) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CALLOUT_ICONS[type]}</svg>`;

/** The first line of a callout: the quote's mark and the kind alone. A typed `\[` is no marker. */
const MARKER = /^ {0,3}>[ \t]?\[!(note|tip|important|warning|caution)\][ \t]*$/i;
const QUOTE_PREFIX = /^ {0,3}>[ \t]?/;
const ONLY_PREFIX = /^ {0,3}>[ \t]*$/;

export interface Callout {
  type: CalloutType;
  /** The marker line, from its start to its end. */
  title: { from: number; to: number };
  /** From the marker line's start to the end of its last line. */
  from: number;
  to: number;
}

/** The kind a callout's first line names, or null when the line is not one. */
export function calloutMarker(line: string): CalloutType | null {
  return (MARKER.exec(line)?.[1]?.toLowerCase() as CalloutType | undefined) ?? null;
}

/**
 * The callouts of a note. Only a quote at the top level is one, and only with a line after its
 * marker: GitHub draws no callout inside a list or another quote, and none with nothing in it.
 */
export function findCallouts(state: EditorState): Callout[] {
  const doc = state.doc;
  const out: Callout[] = [];
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'Blockquote') continue;
    const first = doc.lineAt(node.from);
    const last = doc.lineAt(node.to);
    const type = last.number > first.number ? calloutMarker(first.text) : null;
    if (type) out.push({ type, title: { from: first.from, to: first.to }, from: first.from, to: last.to });
  }
  return out;
}

/** The callout `pos` is in, its marker line included. */
export function calloutAt(state: EditorState, pos: number): Callout | null {
  return findCallouts(state).find((c) => c.from <= pos && pos <= c.to) ?? null;
}

const markerOf = (type: CalloutType) => `[!${type.toUpperCase()}]`;

/** The change that gives a callout another kind, in its marker line. */
function kindChange(state: EditorState, callout: Callout, type: CalloutType): ChangeSpec {
  const text = state.sliceDoc(callout.title.from, callout.title.to);
  const start = text.indexOf('[!');
  const end = text.indexOf(']', start) + 1;
  return { from: callout.title.from + start, to: callout.title.from + end, insert: markerOf(type) };
}

/** The lines covered by the selection; a line the selection only reaches the start of is left out. */
function selectedLines(state: EditorState): Line[] {
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to);
    const end = !range.empty && range.to === last.from ? last.number - 1 : last.number;
    for (let n = state.doc.lineAt(range.from).number; n <= end; n++) lines.set(n, state.doc.line(n));
  }
  return [...lines.values()].sort((a, b) => a.number - b.number);
}

/**
 * Makes the selected lines, or the line of the cursor, a callout of `type`; in a callout, gives
 * it that kind instead. On an empty line an empty callout comes, with the cursor in it. A blank
 * line is put around it where a line next to it would otherwise be read as part of it.
 */
export function setCallout(type: CalloutType): StateCommand {
  return ({ state, dispatch }) => {
    const current = calloutAt(state, state.selection.main.head);
    if (current) {
      if (current.type !== type) dispatch(state.update({ changes: kindChange(state, current, type), userEvent: 'input.format' }));
      return true;
    }
    const doc = state.doc;
    const lines = selectedLines(state);
    const first = lines[0]!;
    const last = lines[lines.length - 1]!;
    const changes: ChangeSpec[] = [];
    // A quote line just above would take the marker in as one of its own lines.
    const above = first.number > 1 ? doc.line(first.number - 1).text : '';
    const before = QUOTE_PREFIX.test(above) ? '\n' : '';
    changes.push({ from: first.from, insert: `${before}> ${markerOf(type)}\n` });
    for (let n = first.number; n <= last.number; n++) {
      const line = doc.line(n);
      if (QUOTE_PREFIX.test(line.text)) continue;
      // A blank line inside would end the quote, so it keeps its mark too.
      changes.push({ from: line.from, insert: line.text.trim() === '' && lines.length > 1 ? '>' : '> ' });
    }
    // A line of text right under it would be read as more of its last line. The blank line goes
    // in at that line's start, so a cursor at the end of the last line stays there.
    const below = last.number < doc.lines ? doc.line(last.number + 1) : null;
    if (below && below.text.trim() !== '') changes.push({ from: below.from, insert: '\n' });
    const set = state.changes(changes);
    const empty = lines.length === 1 && first.text.trim() === '';
    // A cursor at the start of a line ends up behind the inserted prefix, where the text goes.
    const selection = empty ? { anchor: set.mapPos(first.to, 1) } : state.selection.map(set, 1);
    dispatch(state.update({ changes: set, selection, scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

/** Changes the kind of the callout whose marker line starts at `at`. */
export function changeCallout(at: number, type: CalloutType): StateCommand {
  return ({ state, dispatch }) => {
    const callout = findCallouts(state).find((c) => c.from === at);
    if (!callout) return false;
    if (callout.type !== type) dispatch(state.update({ changes: kindChange(state, callout, type), userEvent: 'input.format' }));
    return true;
  };
}

/** Turns a callout back into plain lines: its marker line and the quote's marks go, the text stays. */
function unwrap(state: EditorState, callout: Callout): ChangeSpec[] {
  const doc = state.doc;
  const title = doc.lineAt(callout.title.from);
  const changes: ChangeSpec[] = [{ from: title.from, to: Math.min(title.to + 1, doc.length) }];
  for (let n = title.number + 1; n <= doc.lineAt(callout.to).number; n++) {
    const line = doc.line(n);
    const prefix = QUOTE_PREFIX.exec(line.text);
    if (prefix) changes.push({ from: line.from, to: line.from + prefix[0].length });
  }
  return changes;
}

/** Takes away the callout the cursor is in, or the one whose marker line starts at `at`; its text stays. */
export function removeCallout(at?: number): StateCommand {
  return ({ state, dispatch }) => {
    const callout = at === undefined ? calloutAt(state, state.selection.main.head) : findCallouts(state).find((c) => c.from === at);
    if (!callout) return false;
    const set = state.changes(unwrap(state, callout));
    dispatch(state.update({ changes: set, selection: state.selection.map(set, 1), scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

/** Where the text of the callout's first line starts, behind the quote's hidden mark. */
export function calloutTextStart(state: EditorState, callout: Callout): number {
  const line = state.doc.lineAt(callout.title.to + 1);
  return line.from + (QUOTE_PREFIX.exec(line.text)?.[0].length ?? 0);
}

/** A callout with nothing in it but one empty line. */
function isEmpty(state: EditorState, callout: Callout): boolean {
  const title = state.doc.lineAt(callout.title.from);
  const last = state.doc.lineAt(callout.to);
  return last.number === title.number + 1 && ONLY_PREFIX.test(last.text);
}

/**
 * Backspace at the start of a callout's text. An empty callout goes, leaving an empty line;
 * one with text becomes plain lines, as a word processor takes a box away. Without this the
 * text would join the marker line and the callout would come apart.
 */
export function backspaceInCallout(state: EditorState, pos: number): { changes: ChangeSpec[]; anchor: number } | null {
  const callout = findCallouts(state).find((c) => calloutTextStart(state, c) === pos);
  if (!callout) return null;
  if (isEmpty(state, callout)) return { changes: [{ from: callout.from, to: callout.to }], anchor: callout.from };
  const changes = unwrap(state, callout);
  return { changes, anchor: state.changes(changes).mapPos(pos, 1) };
}

/** Enter on the only line of an empty callout takes the callout away, leaving an empty line. */
export function enterInEmptyCallout(state: EditorState, pos: number): { changes: ChangeSpec[]; anchor: number } | null {
  const callout = calloutAt(state, pos);
  if (!callout || pos <= callout.title.to || !isEmpty(state, callout)) return null;
  return { changes: [{ from: callout.from, to: callout.to }], anchor: callout.from };
}

/** Delete at the end of the line above a callout would pull its marker line up into that line. */
export function deleteAboveCallout(state: EditorState, pos: number): boolean {
  return findCallouts(state).some((c) => c.from - 1 === pos);
}

/**
 * The marker line is drawn as the callout's title, and its two edges are positions where typing
 * would break the marker. A cursor that lands there moves on: down into the callout's text, or
 * up to the line above it when it came from the callout's text.
 */
export function leaveCalloutTitle(state: EditorState, pos: number, prev: number, pointer: boolean): number | null {
  const callout = findCallouts(state).find((c) => c.title.from <= pos && pos <= c.title.to);
  if (!callout) return null;
  const up = !pointer && prev > callout.title.to;
  if (up && callout.from > 0) return callout.from - 1;
  return calloutTextStart(state, callout);
}
