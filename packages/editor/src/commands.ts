import { syntaxTree } from '@codemirror/language';
import {
  ChangeSet,
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type SelectionRange,
  type StateCommand,
  type Text,
  type Transaction,
} from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { t } from '@scrawlnotes/i18n';
import { attachmentOf } from './media';

interface Span {
  from: number;
  to: number;
}

const MARK_NODES: Record<string, { node: string; mark: string }> = {
  '**': { node: 'StrongEmphasis', mark: 'EmphasisMark' },
  '*': { node: 'Emphasis', mark: 'EmphasisMark' },
  '~~': { node: 'Strikethrough', mark: 'StrikethroughMark' },
  '`': { node: 'InlineCode', mark: 'CodeMark' },
};

// Heading, quote and list markers at the start of a line. Inline formatting goes after them.
const BLOCK_PREFIX = /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)*/;

/**
 * The pieces of text a formatting mark is applied to: one per line, without the whitespace at
 * its edges and without the line's block prefix. A mark that wrapped a line break, a trailing
 * space or a `# ` would not be valid Markdown and would show up as literal characters.
 */
function segments(state: EditorState, from: number, to: number): Span[] {
  const out: Span[] = [];
  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos);
    let start = Math.max(from, line.from, line.from + BLOCK_PREFIX.exec(line.text)![0].length);
    let end = Math.min(to, line.to);
    if (end > start) {
      const text = state.sliceDoc(start, end);
      start += text.length - text.trimStart().length;
      end -= text.length - text.trimEnd().length;
      if (end > start) out.push({ from: start, to: end });
    }
    pos = line.to + 1;
  }
  return out;
}

/** What a formatting command acts on: the selection's segments, or the word under an empty cursor. */
function targets(state: EditorState, range: Span & { empty: boolean }): Span[] {
  if (!range.empty) return segments(state, range.from, range.to);
  const word = state.wordAt(range.from);
  return word ? [word] : [];
}

/** The innermost node called `name` that contains the whole span. */
function enclosing(state: EditorState, span: Span, name: string): SyntaxNode | null {
  const tree = syntaxTree(state);
  for (const start of [tree.resolveInner(span.from, 1), tree.resolveInner(span.from, -1)]) {
    for (let node: SyntaxNode | null = start; node; node = node.parent) {
      if (node.name === name && node.from <= span.from && node.to >= span.to) return node;
    }
  }
  return null;
}

/** Whether everything the main selection covers carries `mark`. */
export function isMarkActive(state: EditorState, mark: string): boolean {
  const spans = targets(state, state.selection.main);
  return spans.length > 0 && spans.every((span) => enclosing(state, span, MARK_NODES[mark]!.node));
}

/**
 * Applies `mark` to the selection (or the word under the cursor), or removes it when all of
 * the selection already has it.
 */
export function toggleMark(mark: string): StateCommand {
  const { node: nodeName, mark: markName } = MARK_NODES[mark]!;
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      const spans = targets(state, range);
      if (!spans.length) {
        // Nothing to wrap: an empty pair to type into. A selection of only whitespace is left alone.
        if (!range.empty) return { range };
        return { changes: { from: range.from, insert: mark + mark }, range: EditorSelection.cursor(range.from + mark.length) };
      }
      const nodes = spans.map((span) => enclosing(state, span, nodeName));
      const remove = nodes.every(Boolean);
      const changes: ChangeSpec[] = spans.flatMap((span, i): ChangeSpec[] => {
        const node = nodes[i];
        if (!remove) {
          return node ? [] : [{ from: span.from, insert: mark }, { from: span.to, insert: mark }];
        }
        const marks = node!.getChildren(markName);
        const open = marks[0]!;
        const close = marks[marks.length - 1]!;
        return [
          { from: open.from, to: open.to },
          { from: close.from, to: close.to },
        ];
      });
      const set = state.changes(changes);
      // The selection keeps covering the text, inside the marks.
      if (range.empty) {
        const head = set.mapPos(range.head, range.head === spans[0]!.from ? 1 : -1);
        return { changes, range: EditorSelection.cursor(head) };
      }
      const map = (pos: number) => set.mapPos(pos, pos === range.from ? 1 : -1);
      return { changes, range: EditorSelection.range(map(range.anchor), map(range.head)) };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

export interface LinkInfo {
  from: number;
  to: number;
  text: string;
  url: string;
  /** A web address written in the text: its text is its address, so it cannot be taken away. */
  bare?: boolean;
}

/**
 * A link's address. The link's text can hold an address of its own, when the text is a web
 * address, so the address is the one after the text.
 */
export function linkUrl(link: SyntaxNode): SyntaxNode | null {
  const close = link.getChildren('LinkMark')[1];
  return link.getChildren('URL').find((url) => close && url.from >= close.to) ?? null;
}

// Where an address is a link's or an image's own, drawn with it.
const ADDRESS_OF = new Set(['Link', 'Image', 'Autolink']);

/**
 * Where a web address written in the text points, as GFM reads one: `https://` goes before one
 * that starts with `www.`. Null for a link's or an image's own address, and for a mail address,
 * which stays text.
 */
export function bareAddress(url: SyntaxNode, text: string): string | null {
  if (ADDRESS_OF.has(url.parent?.name ?? '')) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return /^www\./i.test(text) ? `https://${text}` : null;
}

/**
 * The link the main selection lies in, if any, or the web address written in the text there. A
 * link to an attached file is not one here: it shows as the file, and its address is not for
 * editing.
 */
export function linkAt(state: EditorState): LinkInfo | null {
  const node = enclosing(state, state.selection.main, 'Link');
  if (!node) {
    const url = enclosing(state, state.selection.main, 'URL');
    const text = url ? state.sliceDoc(url.from, url.to) : '';
    return url && bareAddress(url, text) ? { from: url.from, to: url.to, text, url: text, bare: true } : null;
  }
  const [open, close] = node.getChildren('LinkMark');
  if (!open || !close) return null;
  const url = linkUrl(node);
  if (url && attachmentOf(state.sliceDoc(url.from, url.to))) return null;
  return {
    from: node.from,
    to: node.to,
    text: state.sliceDoc(open.to, close.from),
    url: url ? state.sliceDoc(url.from, url.to) : '',
  };
}

/**
 * Links the selection to `url`. Inside an existing link the address is replaced, and an empty
 * address removes the link but keeps its text. A web address written in the text is replaced by
 * the new one.
 */
export function setLink(url: string): StateCommand {
  return ({ state, dispatch }) => {
    const existing = linkAt(state);
    if (existing?.bare) {
      if (!url) return false;
      // Written as text, where a space would end it.
      const insert = url.replace(/\s/g, '%20');
      dispatch(
        state.update({
          changes: { from: existing.from, to: existing.to, insert },
          selection: EditorSelection.range(existing.from, existing.from + insert.length),
          scrollIntoView: true,
          userEvent: 'input.format',
        }),
      );
      return true;
    }
    const range = existing ?? segments(state, state.selection.main.from, state.selection.main.to)[0];
    if (!range) return false;
    const text = existing ? existing.text : state.sliceDoc(range.from, range.to);
    if (!existing && !url) return false;
    const insert = url ? `[${text}](${url})` : text;
    const textFrom = range.from + (url ? 1 : 0);
    dispatch(
      state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.range(textFrom, textFrom + text.length),
        scrollIntoView: true,
        userEvent: 'input.format',
      }),
    );
    return true;
  };
}

/** The lines covered by the selection. A line the selection only reaches the start of is left out. */
function selectedLines(state: EditorState): Line[] {
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to);
    const end = !range.empty && range.to === last.from ? last.number - 1 : last.number;
    for (let n = state.doc.lineAt(range.from).number; n <= end; n++) lines.set(n, state.doc.line(n));
  }
  return [...lines.values()];
}

const HEADING = /^(#{1,6})(?:[ \t]+|$)/;
const LINE_PREFIX = {
  list: { find: /^[ \t]*[-*+][ \t]+/, insert: '- ' },
  quote: { find: /^>[ \t]?/, insert: '> ' },
};
export type LinePrefix = keyof typeof LINE_PREFIX;

/** Heading level of the line holding the main cursor, or 0. */
export function headingLevel(state: EditorState): number {
  return HEADING.exec(state.doc.lineAt(state.selection.main.head).text)?.[1]?.length ?? 0;
}

/** Makes the selected lines headings of `level`, or plain text when they already are. */
export function toggleHeading(level: number): StateCommand {
  const prefix = `${'#'.repeat(level)} `;
  return ({ state, dispatch }) => {
    const changes = selectedLines(state)
      .filter((line, _, all) => all.length === 1 || line.text.trim() !== '')
      .map((line) => {
        const current = HEADING.exec(line.text);
        const insert = current?.[1]?.length === level ? '' : prefix;
        return { from: line.from, to: line.from + (current?.[0].length ?? 0), insert };
      });
    const set = state.changes(changes);
    // A cursor at the start of the line ends up behind the inserted prefix, where the text goes.
    dispatch(
      state.update({ changes: set, selection: state.selection.map(set, 1), scrollIntoView: true, userEvent: 'input.format' }),
    );
    return true;
  };
}

export function hasLinePrefix(state: EditorState, kind: LinePrefix): boolean {
  return LINE_PREFIX[kind].find.test(state.doc.lineAt(state.selection.main.head).text);
}

/** Adds the list or quote prefix to the selected lines, or removes it when every line has it. */
export function toggleLinePrefix(kind: LinePrefix): StateCommand {
  const { find, insert } = LINE_PREFIX[kind];
  return ({ state, dispatch }) => {
    const lines = selectedLines(state).filter((line, _, all) => all.length === 1 || line.text.trim() !== '');
    const remove = lines.every((line) => find.test(line.text));
    const changes = lines.flatMap((line): ChangeSpec[] => {
      const current = find.exec(line.text);
      if (remove) return [{ from: line.from, to: line.from + current![0].length }];
      return current ? [] : [{ from: line.from, insert }];
    });
    const set = state.changes(changes);
    // A cursor at the start of the line ends up behind the inserted prefix, where the text goes.
    dispatch(
      state.update({ changes: set, selection: state.selection.map(set, 1), scrollIntoView: true, userEvent: 'input.format' }),
    );
    return true;
  };
}

// ---------- lists ----------

/** A list item's start: its indentation, its bullet or number, and the space after it. */
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+/;
const BULLET_ITEM = /^[ \t]*[-*+][ \t]+/;
const ORDERED_ITEM = /^[ \t]*\d{1,9}[.)][ \t]+/;

/** How wide an indentation is, a tab as four spaces. */
const widthOf = (indent: string) => indent.replace(/\t/g, '    ').length;

/**
 * The numbers of the numbered lists the given lines are in, counted again from 1 at each level of
 * each list: the changes that fix them. A list is the run of items and their indented lines around
 * a line; a bullet between numbered items at a level starts a new count after it.
 */
function renumbered(doc: Text, lines: number[]): ChangeSpec[] {
  const part = (n: number) => {
    const text = doc.line(n).text;
    return ITEM.test(text) || /^[ \t]+\S/.test(text);
  };
  const seen = new Set<number>();
  const changes: ChangeSpec[] = [];
  for (const around of lines) {
    if (!part(around)) continue;
    let first = around;
    while (first > 1 && part(first - 1)) first--;
    if (seen.has(first)) continue;
    seen.add(first);
    let last = around;
    while (last < doc.lines && part(last + 1)) last++;
    const levels: { indent: number; next: number | null }[] = [];
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      const item = ITEM.exec(line.text);
      if (!item) continue;
      const indent = widthOf(item[1]!);
      while (levels.length > 0 && levels[levels.length - 1]!.indent > indent) levels.pop();
      let level = levels[levels.length - 1];
      if (!level || level.indent !== indent) {
        level = { indent, next: null };
        levels.push(level);
      }
      const number = /^\d+/.exec(item[2]!);
      if (!number) {
        level.next = null;
        continue;
      }
      const want = level.next ?? 1;
      level.next = want + 1;
      const at = line.from + item[1]!.length;
      if (Number(number[0]) !== want) changes.push({ from: at, to: at + number[0].length, insert: String(want) });
    }
  }
  return changes;
}

/** Makes the changes, numbers again the numbered lists they touched, and keeps the cursor with the text. */
function changeLines(state: EditorState, dispatch: (tr: Transaction) => void, specs: ChangeSpec[]): boolean {
  const first = state.changes(specs);
  const doc = first.apply(state.doc);
  const touched = new Set<number>();
  first.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    touched.add(doc.lineAt(fromB).number);
    touched.add(doc.lineAt(toB).number);
  });
  const changes = first.compose(ChangeSet.of(renumbered(doc, [...touched]), doc.length));
  // A cursor at the start of the line ends up behind the inserted prefix, where the text goes.
  dispatch(state.update({ changes, selection: state.selection.map(changes, 1), scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}

/**
 * Makes the selected lines a bulleted or a numbered list. A line of the other kind changes its
 * bullet or number; when every line is of this kind already, they go back to plain lines.
 */
export function toggleList(kind: 'bullet' | 'ordered'): StateCommand {
  const own = kind === 'bullet' ? BULLET_ITEM : ORDERED_ITEM;
  return ({ state, dispatch }) => {
    const lines = selectedLines(state).filter((line, _, all) => all.length === 1 || line.text.trim() !== '');
    const remove = lines.every((line) => own.test(line.text));
    const marker = kind === 'bullet' ? '- ' : '1. ';
    const specs = lines.flatMap((line): ChangeSpec[] => {
      const item = ITEM.exec(line.text);
      if (remove) return [{ from: line.from, to: line.from + item![0].length }];
      if (own.test(line.text)) return [];
      if (item) return [{ from: line.from + item[1]!.length, to: line.from + item[0].length, insert: marker }];
      return [{ from: line.from + /^[ \t]*/.exec(line.text)![0].length, insert: marker }];
    });
    return changeLines(state, dispatch, specs);
  };
}

/** The nearest list item above a line whose indentation `fits`: where it starts and where its text starts. */
function itemAbove(doc: Text, number: number, fits: (indent: number) => boolean): { indent: number; content: number } | null {
  for (let n = number - 1; n >= 1; n--) {
    const text = doc.line(n).text;
    const item = ITEM.exec(text);
    if (item) {
      const indent = widthOf(item[1]!);
      if (fits(indent)) return { indent, content: indent + item[0].length - item[1]!.length };
      continue;
    }
    // A blank line or an item's indented line goes on; any other line ends the list.
    if (text.trim() !== '' && !/^[ \t]/.test(text)) return null;
  }
  return null;
}

/**
 * Moves the selected lines a level in or out. A list item goes under the item above it, as far in
 * as that item's text, or back to its parent's level; the first item of a list stays where it is.
 * Any other line moves by two spaces. Numbered lists are numbered again.
 */
export function indentLines(more: boolean): StateCommand {
  return ({ state, dispatch }) => {
    const specs: ChangeSpec[] = [];
    for (const line of selectedLines(state)) {
      const indent = /^[ \t]*/.exec(line.text)![0];
      const width = widthOf(indent);
      const isItem = ITEM.test(line.text);
      let target: number;
      if (more) {
        const above = isItem ? itemAbove(state.doc, line.number, (each) => each <= width) : null;
        if (isItem && (!above || above.content <= width)) continue;
        target = above ? above.content : width + 2;
      } else {
        if (width === 0) continue;
        const parent = isItem ? itemAbove(state.doc, line.number, (each) => each < width) : null;
        target = parent ? parent.indent : Math.max(0, width - 2);
      }
      specs.push({ from: line.from, to: line.from + indent.length, insert: ' '.repeat(target) });
    }
    if (specs.length === 0) return false;
    return changeLines(state, dispatch, specs);
  };
}

/** Tab and Shift+Tab on list items: a level in or out, as the bar's buttons do; elsewhere they do what they always did. */
const onItems =
  (more: boolean): StateCommand =>
  (target) =>
    selectedLines(target.state).every((line) => ITEM.test(line.text)) && indentLines(more)(target);

const FENCE = /^\s*(`{3,}|~{3,})/;

/** Turns the selected lines into a code block, or a code block back into plain lines. */
export const toggleCodeBlock: StateCommand = ({ state, dispatch }) => {
  const doc = state.doc;
  const block = enclosing(state, state.selection.main, 'FencedCode');
  let changes: ChangeSpec[];
  let selection: EditorSelection | undefined;
  if (block) {
    const first = doc.lineAt(block.from);
    const last = doc.lineAt(block.to);
    changes = [{ from: first.from, to: Math.min(first.to + 1, doc.length) }];
    // An unclosed block has no closing fence to remove.
    if (last.number > first.number && FENCE.test(last.text)) changes.push({ from: last.from - 1, to: last.to });
  } else {
    const lines = selectedLines(state);
    const open = '```\n';
    changes = [
      { from: lines[0]!.from, insert: open },
      { from: lines[lines.length - 1]!.to, insert: '\n```' },
    ];
    // The selection stays on the same text, now between the two fences.
    selection = EditorSelection.create(
      state.selection.ranges.map((r) => EditorSelection.range(r.anchor + open.length, r.head + open.length)),
      state.selection.mainIndex,
    );
  }
  dispatch(state.update({ changes, selection, scrollIntoView: true, userEvent: 'input.format' }));
  return true;
};

/**
 * Inserts a block (a table, a divider) on lines of its own at the cursor. Blocks need a blank
 * line around them to be read as such.
 */
function insertBlock(block: string): StateCommand {
  return ({ state, dispatch }) => {
    const doc = state.doc;
    const line = doc.lineAt(state.selection.main.head);
    const empty = line.text.trim() === '';
    const blankAbove = line.number === 1 || doc.line(line.number - 1).text.trim() === '';
    const isLast = line.number === doc.lines;
    const blankBelow = isLast || doc.line(line.number + 1).text.trim() === '';
    const before = empty ? (blankAbove ? '' : '\n') : '\n\n';
    // The line break that already follows this line separates the block from what comes next;
    // one more makes the blank line. At the end of the note it gives the cursor a line to land on.
    const insert = `${before}${block}${isLast || !blankBelow ? '\n' : ''}`;
    const from = empty ? line.from : line.to;
    dispatch(
      state.update({
        changes: { from, to: line.to, insert },
        // At the end of the block; the caller decides where to go from there.
        selection: { anchor: from + before.length + block.length },
        scrollIntoView: true,
        userEvent: 'input.format',
      }),
    );
    return true;
  };
}

/** Inserts a table of two columns, with a header and one empty row. */
export const insertTable: StateCommand = (target) => {
  const header = [1, 2].map((n) => t('table.column', { n }));
  const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const block = [row(header), row(header.map((h) => '-'.repeat(h.length))), row(header.map((h) => ' '.repeat(h.length)))];
  return insertBlock(block.join('\n'))(target);
};
// Not `---`: under a line of text, with the blank line between deleted, that underlines the line
// as a heading; `***` is a divider wherever it is.
export const insertDivider = insertBlock('***');

/**
 * Splits a selection that spans several lines into one selection per line, each with its own
 * cursor (Sublime's "Split into Lines").
 */
export const splitSelectionIntoLines: StateCommand = ({ state, dispatch }) => {
  const ranges: SelectionRange[] = [];
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to);
    // A selection that ends at the very start of a line does not include that line.
    const end = range.to === last.from && last.number > first ? last.number - 1 : last.number;
    if (end === first) {
      ranges.push(range);
      continue;
    }
    for (let n = first; n <= end; n++) {
      const line = state.doc.line(n);
      ranges.push(EditorSelection.range(Math.max(range.from, line.from), Math.min(range.to, line.to)));
    }
  }
  if (ranges.length === state.selection.ranges.length) return false;
  dispatch(state.update({ selection: EditorSelection.create(ranges, ranges.length - 1), userEvent: 'select' }));
  return true;
};

export const toggleBold = toggleMark('**');
export const toggleItalic = toggleMark('*');
export const toggleCode = toggleMark('`');
export const toggleStrike = toggleMark('~~');

/** Which formatting applies at the main selection; drives the pressed state of format controls. */
export interface FormatState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  link: LinkInfo | null;
  heading: number;
  list: boolean;
  ordered: boolean;
  quote: boolean;
  codeBlock: boolean;
}

export function formatState(state: EditorState): FormatState {
  return {
    bold: isMarkActive(state, '**'),
    italic: isMarkActive(state, '*'),
    strike: isMarkActive(state, '~~'),
    code: isMarkActive(state, '`'),
    link: linkAt(state),
    heading: headingLevel(state),
    list: hasLinePrefix(state, 'list'),
    ordered: ORDERED_ITEM.test(state.doc.lineAt(state.selection.main.head).text),
    quote: hasLinePrefix(state, 'quote'),
    codeBlock: enclosing(state, state.selection.main, 'FencedCode') !== null,
  };
}

export const formatKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: toggleBold },
  { key: 'Mod-i', run: toggleItalic },
  { key: 'Mod-e', run: toggleCode },
  { key: 'Mod-Shift-x', run: toggleStrike },
  // Listed before the search keymap, which uses the same keys for something else.
  { key: 'Mod-Shift-l', run: splitSelectionIntoLines },
  { key: 'Tab', run: onItems(true) },
  { key: 'Shift-Tab', run: onItems(false) },
];
