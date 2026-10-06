import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { previewItems, roleRanges, sourceMode } from './livePreview';
import { renderHtml } from './render';

/** Carries the Markdown of a copied piece from one note to another. */
export const MARKDOWN_TYPE = 'application/x-scrawl-markdown';

interface Span {
  from: number;
  to: number;
}

/**
 * The text between `from` and `to` as it reads on screen, without the hidden Markdown syntax.
 * With `links`, a link's address follows its text in parentheses, since plain text has no
 * other place for it.
 */
export function visibleText(state: EditorState, from: number, to: number, links = false): string {
  const replaced = new Set(['hide', 'image', 'attachment']);
  const items = previewItems(state, from, to)
    .filter((item) => item.to > item.from && replaced.has(item.deco?.spec.kind))
    .sort((a, b) => a.from - b.from);
  let out = '';
  let pos = from;
  for (const item of items) {
    const start = Math.max(item.from, pos);
    const end = Math.min(item.to, to);
    if (end <= start) continue;
    out += state.sliceDoc(pos, start);
    if (item.deco!.spec.kind === 'image') out += links ? (item.deco!.spec.alt as string) : '';
    // An attached file reads as its name, the way it shows.
    else if (item.deco!.spec.kind === 'attachment') out += item.deco!.spec.label as string;
    else if (links && item.role === 'close') {
      const url = /^\]\(\s*<?([^)\s>]+)/.exec(state.sliceDoc(item.from, item.to))?.[1];
      if (url) out += ` (${url})`;
    }
    pos = end;
  }
  return out + state.sliceDoc(pos, to);
}

/**
 * The Markdown for a selection. The selection is made on the visible text, so it can start
 * after a hidden `# ` or end inside a bold span; the piece is completed with the syntax it
 * needs to keep its formatting on its own.
 */
export function markdownSlice(state: EditorState, from: number, to: number): string {
  const doc = state.doc;
  const roles = roleRanges(state, doc.lineAt(from).from, doc.lineAt(to).to);
  for (let prefix; (prefix = roles.find((r) => r.role === 'prefix' && r.to === from && r.from < from)); ) from = prefix.from;

  const spans = new Map<string, { open?: Span; close?: Span }>();
  for (const r of roles) {
    if (!r.span || (r.role !== 'open' && r.role !== 'close')) continue;
    const key = `${r.span.from}-${r.span.to}`;
    spans.set(key, { ...spans.get(key), [r.role]: r });
  }
  const pairs = [...spans.values()].filter((s): s is { open: Span; close: Span } => !!s.open && !!s.close);

  // A selection that reaches a span's edge takes the mark with it.
  for (const { open, close } of pairs) {
    if (from >= open.from && from <= open.to && to > open.to) from = open.from;
    if (to >= close.from && to <= close.to && from < close.from) to = close.to;
  }
  // A span the selection starts or ends inside of is opened or closed around the piece.
  const before = pairs
    .filter(({ open, close }) => open.from < from && from < close.from)
    .sort((a, b) => a.open.from - b.open.from)
    .map(({ open }) => doc.sliceString(open.from, open.to));
  const after = pairs
    .filter(({ open, close }) => open.to < to && to < close.to)
    .sort((a, b) => a.close.from - b.close.from)
    .map(({ close }) => doc.sliceString(close.from, close.to));
  return before.join('') + doc.sliceString(from, to) + after.join('');
}

/** The selection, or the line of the cursor when nothing is selected. */
function copiedRanges(state: EditorState): Span[] {
  const ranges = state.selection.ranges.filter((r) => !r.empty);
  if (ranges.length) return ranges.map(({ from, to }) => ({ from, to }));
  const line = state.doc.lineAt(state.selection.main.head);
  return [{ from: line.from, to: Math.min(line.to + 1, state.doc.length) }];
}

/**
 * Puts three versions of the selection on the clipboard: plain text for editors and prompt
 * boxes, HTML for Word and mail, and Markdown for pasting back into a note.
 */
function write(event: ClipboardEvent, view: EditorView): Span[] | null {
  const state = view.state;
  if (!event.clipboardData || state.field(sourceMode, false)) return null;
  const ranges = copiedRanges(state);
  const markdown = ranges.map((r) => markdownSlice(state, r.from, r.to)).join('\n');
  event.clipboardData.setData('text/plain', ranges.map((r) => visibleText(state, r.from, r.to, true)).join('\n'));
  event.clipboardData.setData('text/html', renderHtml(markdown));
  event.clipboardData.setData(MARKDOWN_TYPE, markdown);
  event.preventDefault();
  return ranges;
}

export const clipboard: Extension = EditorView.domEventHandlers({
  copy: (event, view) => write(event, view) !== null,
  cut(event, view) {
    const ranges = write(event, view);
    if (!ranges) return false;
    view.dispatch({ changes: ranges, scrollIntoView: true, userEvent: 'delete.cut' });
    return true;
  },
  paste(event, view) {
    const markdown = event.clipboardData?.getData(MARKDOWN_TYPE);
    if (!markdown || view.state.field(sourceMode, false)) return false;
    event.preventDefault();
    // Not `input.paste`: this is already Markdown from a note and must keep its formatting.
    view.dispatch(view.state.replaceSelection(markdown), { scrollIntoView: true, userEvent: 'input.scrawl' });
    return true;
  },
});
