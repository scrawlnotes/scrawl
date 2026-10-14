import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension, type Range, StateField, type TransactionSpec } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { t } from '@scrawlnotes/i18n';
import { sourceMode } from './livePreview';
import { renderInline } from './render';

type Align = '' | 'left' | 'center' | 'right';

export interface TableModel {
  /** Cell contents are Markdown, as stored in the note. */
  header: string[];
  align: Align[];
  rows: string[][];
}

/** Splits a table row into its cells. `\|` is a literal pipe, not a cell border. */
function cells(line: string): string[] {
  const parts = line.trim().split(/(?<!\\)\|/);
  if (parts[0]?.trim() === '') parts.shift();
  if (parts[parts.length - 1]?.trim() === '') parts.pop();
  return parts.map((cell) => cell.trim());
}

export function parseTable(source: string): TableModel {
  const [headerLine = '', delimiter = '', ...rest] = source.split('\n');
  const header = cells(headerLine);
  const marks = cells(delimiter);
  const align = header.map((_, i): Align => {
    const mark = marks[i] ?? '';
    return mark.startsWith(':') && mark.endsWith(':') ? 'center' : mark.endsWith(':') ? 'right' : mark.startsWith(':') ? 'left' : '';
  });
  // Every row gets exactly as many cells as the header.
  const rows = rest.filter((line) => line.trim() !== '').map((line) => header.map((_, i) => cells(line)[i] ?? ''));
  return { header, align, rows };
}

/** Writes the table with its columns padded to one width, so it also reads well as plain text. */
export function serializeTable(model: TableModel): string {
  const all = [model.header, ...model.rows];
  const widths = model.header.map((_, i) => Math.max(3, ...all.map((row) => (row[i] ?? '').length)));
  const line = (row: string[]) => `| ${widths.map((width, i) => (row[i] ?? '').padEnd(width)).join(' | ')} |`;
  const delimiter = widths.map((width, i) => {
    const align = model.align[i];
    if (align === 'center') return `:${'-'.repeat(width - 2)}:`;
    if (align === 'right') return `${'-'.repeat(width - 1)}:`;
    return align === 'left' ? `:${'-'.repeat(width - 1)}` : '-'.repeat(width);
  });
  return [line(model.header), `| ${delimiter.join(' | ')} |`, ...model.rows.map(line)].join('\n');
}

/** Text typed into a cell, as Markdown: one line, with nothing in it acting as syntax. */
export function cellMarkdown(text: string): string {
  return text
    .replace(/\s*\n\s*/g, ' ')
    .trim()
    .replace(/[\\*_`[\]<|~]/g, '\\$&');
}

/**
 * Tab-separated text as rows of cells. A cell that starts with a quote runs to the closing quote,
 * a doubled one being a quote, so it can hold a tab or a line break; a quote anywhere else is
 * text. The line break a spreadsheet ends the copy with is not one more row.
 */
function parseTsv(text: string): string[][] {
  const body = text.replace(/\r?\n$/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      const next = body[i + 1];
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"' && (next === undefined || next === '\t' || next === '\n' || next === '\r')) quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === '\t') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  // A quote that never closed was text: read again without quotes.
  if (quoted) return body.split(/\r?\n/).map((line) => line.split('\t'));
  row.push(field);
  rows.push(row);
  return rows;
}

/**
 * The cells of a range copied from a spreadsheet (Excel, Google Sheets, Numbers) or of a table on
 * a web page, from the plain text that comes with it: a line a row, a tab between cells. Null when
 * the text is not that: without a tab; with rows of different lengths, unless a table came with it
 * as HTML (a web page's rows can be shorter); or with an empty first cell in every row, which is
 * text indented with tabs.
 */
export function copiedCells(plain: string, html = ''): string[][] | null {
  if (!plain.includes('\t')) return null;
  const rows = parseTsv(plain);
  const width = Math.max(...rows.map((r) => r.length));
  if (!/<table[\s>]/i.test(html) && (rows.some((r) => r.length !== width) || rows.every((r) => r[0] === ''))) return null;
  return rows.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);
}

/** Copied cells as a table's Markdown, the first row its header. */
export function tableOfCells(cells: string[][]): string {
  const [header = [], ...rows] = cells.map((row) => row.map(cellMarkdown));
  return serializeTable({ header, align: header.map(() => ''), rows });
}

// Where pasted cells stay text: code shows what was written.
const CODE = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);

function inCode(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      if (CODE.has(node.name) && node.from < pos && pos < node.to) return true;
    }
  }
  return false;
}

/**
 * Cells copied from a spreadsheet, pasted into the note as a table in place of the selection: on
 * lines of its own with a blank line around it, the text before and after it on the line kept on
 * either side, and the cursor on the line after it. One step, which Undo takes back whole. Null in
 * code, where the text stays as it is, and with more than one cursor.
 */
export function pasteTable(state: EditorState, cells: string[][]): TransactionSpec | null {
  if (state.selection.ranges.length > 1) return null;
  const { from, to } = state.selection.main;
  if (inCode(state, from)) return null;
  const doc = state.doc;
  const first = doc.lineAt(from);
  const last = doc.lineAt(to);
  const head = doc.sliceString(first.from, from);
  const tail = doc.sliceString(to, last.to);
  const blankAbove = first.number === 1 || doc.line(first.number - 1).text.trim() === '';
  const isLast = last.number === doc.lines;
  const blankBelow = isLast || doc.line(last.number + 1).text.trim() === '';
  const table = tableOfCells(cells);
  const before = head.trim() ? `${head.trimEnd()}\n\n` : blankAbove ? '' : '\n';
  // As with a table from the menu: the line break after this line, and one more for the blank line.
  const after = tail.trim() ? `\n\n${tail.trimStart()}` : isLast || !blankBelow ? '\n' : '';
  const end = first.from + before.length + table.length;
  return {
    changes: { from: first.from, to: last.to, insert: before + table + after },
    selection: { anchor: end + (tail.trim() ? 2 : 1) },
    scrollIntoView: true,
    // Not `input.paste`: the cells are already Markdown, and typed-text escaping would mark them again.
    userEvent: 'input.table',
  };
}

/** Writes copied cells into a table from the cell `at` on, adding the rows and columns they run past. */
export function fillCells(table: TableModel, at: { row: number; col: number }, cells: string[][]) {
  const width = at.col + Math.max(...cells.map((r) => r.length));
  while (table.header.length < width) {
    table.header.push('');
    table.align.push('');
    for (const row of table.rows) row.push('');
  }
  cells.forEach((values, i) => {
    const row = at.row + i;
    while (row >= table.rows.length) table.rows.push(table.header.map(() => ''));
    const target = row < 0 ? table.header : table.rows[row]!;
    values.forEach((value, j) => (target[at.col + j] = cellMarkdown(value)));
  });
}

/** Starts editing a cell; the cell reacts to the click as it would to the user's. */
function focusCell(wrap: HTMLElement, row: number, col: number) {
  wrap.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"] .cm-sl-cell`)?.click();
}

/** Starts editing the first cell of the table that starts at `from`, with its text selected. */
export function enterTable(view: EditorView, from: number) {
  for (const grid of view.contentDOM.querySelectorAll<HTMLElement>('.cm-sl-grid')) {
    if (view.posAtDOM(grid) !== from) continue;
    focusCell(grid, -1, 0);
    grid.querySelector<HTMLInputElement>('.cm-sl-cell-input')?.select();
    return;
  }
}

class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly selected: boolean,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source && other.selected === this.selected;
  }

  toDOM(view: EditorView) {
    const model = parseTable(this.source);
    const wrap = document.createElement('div');
    wrap.className = this.selected ? 'cm-sl-grid cm-sl-grid-selected' : 'cm-sl-grid';
    const table = wrap.appendChild(document.createElement('table'));

    const range = () => {
      const from = view.posAtDOM(wrap);
      return { from, to: from + this.source.length };
    };
    // The cell being typed in. Its text reaches the model only when the edit ends.
    let editing: { row: number; col: number; box: HTMLElement; input: HTMLInputElement; before: string } | null = null;

    /** The model including the edit in progress; null when that edit changed nothing. */
    const withEdit = (): TableModel | null => {
      if (!editing) return null;
      const text = editing.input.value;
      if (text === editing.before) return null;
      const next = { ...model, header: [...model.header], rows: model.rows.map((row) => [...row]) };
      const target = editing.row < 0 ? next.header : next.rows[editing.row]!;
      target[editing.col] = cellMarkdown(text);
      return next;
    };
    const apply = (next: TableModel, focus?: { row: number; col: number }) => {
      editing = null;
      const at = range();
      view.dispatch({ changes: { ...at, insert: serializeTable(next) }, userEvent: 'input.table' });
      if (!focus) return;
      // The change redrew the table. Continue in the new grid right away, not on a timer:
      // anything typed in between would otherwise land in the note.
      for (const grid of view.contentDOM.querySelectorAll<HTMLElement>('.cm-sl-grid')) {
        if (view.posAtDOM(grid) === at.from) return focusCell(grid, focus.row, focus.col);
      }
    };
    /** Ends the edit in progress and moves on to `focus`, redrawing only when something changed. */
    const finish = (focus?: { row: number; col: number }) => {
      const ended = editing;
      const next = withEdit();
      // Cleared before the cell is redrawn: taking its text field out fires a blur, which calls this again.
      editing = null;
      if (next) return apply(next, focus);
      // Nothing was typed: show the cell with its formatting again.
      if (ended) ended.box.innerHTML = renderInline(raw(ended));
      if (focus) focusCell(wrap, focus.row, focus.col);
    };
    const raw = (cell: { row: number; col: number }) =>
      (cell.row < 0 ? model.header : model.rows[cell.row]!)[cell.col] ?? '';
    /** Changes the shape of the table, keeping whatever is being typed. */
    const reshape = (change: (next: TableModel) => void, focus?: { row: number; col: number }) => {
      const next = withEdit() ?? { ...model, header: [...model.header], align: [...model.align], rows: model.rows.map((row) => [...row]) };
      next.align = [...next.align];
      change(next);
      apply(next, focus);
    };

    /** Gives the keyboard back to the note, with the cursor on the line after (or before) the table. */
    const leave = (above = false) => {
      // Placed on the table's edge as a click would be; the cursor then moves on to the line past it.
      const at = range();
      view.dispatch({ selection: { anchor: above ? at.from : at.to }, userEvent: 'select.pointer' });
      view.focus();
    };

    const control = (parent: HTMLElement, className: string, label: string, title: string, run: () => void) => {
      const el = parent.appendChild(document.createElement('button'));
      el.type = 'button';
      el.className = className;
      el.textContent = label;
      el.title = title;
      el.contentEditable = 'false';
      // On mousedown, and without taking the focus: a click would arrive after the cell's blur had redrawn the table.
      el.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        run();
      });
      return el;
    };

    const addCell = (parent: HTMLElement, tag: 'th' | 'td', row: number, col: number) => {
      const cell = parent.appendChild(document.createElement(tag));
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      if (model.align[col]) cell.style.textAlign = model.align[col]!;
      const box = cell.appendChild(document.createElement('div'));
      box.className = 'cm-sl-cell';
      box.innerHTML = renderInline(raw({ row, col }));

      // A cell is edited in a text field of its own. (Editable text nested in the editor's
      // own editable area would send what is typed to the note instead of the cell.)
      // The field holds plain text; formatting in the cell is kept only if the text is not changed.
      const input = document.createElement('input');
      input.className = 'cm-sl-cell-input';
      input.setAttribute('aria-label', 'Table cell');
      cell.addEventListener('click', () => {
        if (editing?.box === box) return;
        const before = box.textContent ?? '';
        input.value = before;
        input.size = Math.max(3, before.length + 1);
        box.replaceChildren(input);
        editing = { row, col, box, input, before };
        input.focus();
      });
      input.addEventListener('input', () => (input.size = Math.max(3, input.value.length + 1)));
      // Cells copied from a spreadsheet fill the table from this cell on; a single one is text for this cell.
      input.addEventListener('paste', (event) => {
        const data = event.clipboardData;
        const cells = data && copiedCells(data.getData('text/plain'), data.getData('text/html'));
        if (!cells || (cells.length === 1 && cells[0]!.length === 1)) return;
        event.preventDefault();
        reshape((t) => fillCells(t, { row, col }, cells), { row, col });
      });
      input.addEventListener('blur', () => {
        if (editing?.box === box) finish();
      });
      input.addEventListener('keydown', (event) => {
        const last = { row: model.rows.length - 1, col: model.header.length - 1 };
        if (event.key === 'Tab') {
          const step = event.shiftKey ? -1 : 1;
          let next = { row, col: col + step };
          if (next.col > last.col) next = { row: row + 1, col: 0 };
          if (next.col < 0) next = { row: row - 1, col: last.col };
          if (next.row < -1) next = { row: -1, col: 0 };
          // Tab out of the last cell continues the table with a new row.
          if (next.row > last.row) reshape((t) => t.rows.push(t.header.map(() => '')), next);
          else finish(next);
        } else if (event.key === 'Enter') {
          if (row < last.row) finish({ row: row + 1, col });
          else {
            finish();
            leave();
          }
        } else if (event.key === 'Escape') {
          input.value = editing?.before ?? '';
          finish();
          leave();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          // Up and down move between rows, and out of the table past its first and last row.
          const next = row + (event.key === 'ArrowUp' ? -1 : 1);
          if (next >= -1 && next <= last.row) finish({ row: next, col });
          else {
            finish();
            leave(next < -1);
          }
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          // Left and right move within the text first; at its edge they go on to the neighboring cell.
          const left = event.key === 'ArrowLeft';
          const atEdge = input.selectionStart === input.selectionEnd && input.selectionStart === (left ? 0 : input.value.length);
          if (!atEdge || event.shiftKey) return;
          let next = { row, col: col + (left ? -1 : 1) };
          if (next.col > last.col) next = { row: row + 1, col: 0 };
          if (next.col < 0) next = { row: row - 1, col: last.col };
          if (next.row < -1 || next.row > last.row) return;
          finish(next);
          // Coming from the right, continue at the end of the text, as the cursor would in a line.
          // The field is looked up by focus: a change redraws the table, and `wrap` is then the old one.
          const field = document.activeElement;
          if (field instanceof HTMLInputElement && field.classList.contains('cm-sl-cell-input')) {
            const at = left ? field.value.length : 0;
            field.setSelectionRange(at, at);
          }
        } else return;
        event.preventDefault();
      });
      return cell;
    };

    const head = table.appendChild(document.createElement('thead')).appendChild(document.createElement('tr'));
    model.header.forEach((_, col) => {
      const cell = addCell(head, 'th', -1, col);
      if (model.header.length > 1) {
        control(cell, 'cm-sl-grid-del cm-sl-grid-del-col', '×', t('table.deleteColumn'), () =>
          reshape((t) => {
            t.header.splice(col, 1);
            t.align.splice(col, 1);
            for (const r of t.rows) r.splice(col, 1);
          }),
        );
      }
    });
    const body = table.appendChild(document.createElement('tbody'));
    model.rows.forEach((_, row) => {
      const tr = body.appendChild(document.createElement('tr'));
      let lastCell: HTMLElement | null = null;
      model.header.forEach((_, col) => (lastCell = addCell(tr, 'td', row, col)));
      if (lastCell) {
        control(lastCell, 'cm-sl-grid-del cm-sl-grid-del-row', '×', t('table.deleteRow'), () => reshape((t) => t.rows.splice(row, 1)));
      }
    });

    const actions = wrap.appendChild(document.createElement('div'));
    actions.className = 'cm-sl-grid-actions';
    control(actions, '', t('table.addRow'), t('table.addRowTitle'), () =>
      reshape((t) => t.rows.push(t.header.map(() => '')), { row: model.rows.length, col: 0 }),
    );
    control(actions, '', t('table.addColumn'), t('table.addColumnTitle'), () =>
      reshape(
        (t) => {
          t.header.push('');
          t.align.push('');
          for (const r of t.rows) r.push('');
        },
        { row: -1, col: model.header.length },
      ),
    );
    control(actions, '', t('table.delete'), t('table.deleteTitle'), () => {
      editing = null;
      view.dispatch({ changes: range(), userEvent: 'delete.table' });
      view.focus();
    });

    // A click beside the table selects it as a whole, so it can be copied or cut.
    wrap.addEventListener('mousedown', (event) => {
      if (event.target !== wrap) return;
      event.preventDefault();
      const at = range();
      view.dispatch({ selection: EditorSelection.range(at.from, at.to) });
      view.focus();
    });

    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function build(state: EditorState): DecorationSet {
  if (state.field(sourceMode, false)) return Decoration.none;
  const out: Range<Decoration>[] = [];
  // Only top-level tables: the block widget replaces whole lines of the document.
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'Table') continue;
    const from = state.doc.lineAt(node.from).from;
    const to = state.doc.lineAt(node.to).to;
    const selected = state.selection.ranges.some((r) => !r.empty && r.from <= from && r.to >= to);
    const widget = new TableWidget(state.sliceDoc(from, to), selected);
    out.push(Decoration.replace({ widget, block: true, kind: 'grid' }).range(from, to));
  }
  return Decoration.set(out);
}

const tableField = StateField.define<DecorationSet>({
  create: build,
  update(value, tr) {
    const changed =
      tr.docChanged ||
      tr.selection !== undefined ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
      tr.startState.field(sourceMode, false) !== tr.state.field(sourceMode, false);
    return changed ? build(tr.state) : value;
  },
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
});

/** Starts editing the last cell of the table that starts at `from`. */
export function enterTableEnd(view: EditorView, from: number) {
  for (const grid of view.contentDOM.querySelectorAll<HTMLElement>('.cm-sl-grid')) {
    if (view.posAtDOM(grid) !== from) continue;
    const boxes = grid.querySelectorAll<HTMLElement>('.cm-sl-cell');
    boxes[boxes.length - 1]?.click();
    return;
  }
}

/** The tables of a note, for tests. */
export const tableDecorations = (state: EditorState) => state.field(tableField);

/** Where the tables drawn as grids are. Empty in source mode. */
export function tableRanges(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const set = state.field(tableField, false);
  if (set) for (let iter = set.iter(); iter.value; iter.next()) out.push({ from: iter.from, to: iter.to });
  return out;
}

/**
 * Markdown counts a line of text directly under a table as one more row of it. In the note
 * that line is just text, so a blank line is put between the two as soon as it appears.
 */
const keepTextOutOfTables = EditorView.updateListener.of((update) => {
  if (!update.docChanged || update.state.field(sourceMode, false)) return;
  const state = update.view.state;
  const changes: { from: number; insert: string }[] = [];
  for (const table of tableRanges(state)) {
    const first = state.doc.lineAt(table.from);
    const last = state.doc.lineAt(table.to).number;
    // A table written without border pipes has rows that look like text; leave those alone.
    if (!first.text.trimStart().startsWith('|')) continue;
    for (let n = first.number + 2; n <= last; n++) {
      const line = state.doc.line(n);
      if (line.text.trimStart().startsWith('|')) continue;
      changes.push({ from: line.from, insert: '\n' });
      break;
    }
  }
  if (changes.length) update.view.dispatch({ changes, userEvent: 'input.table' });
});

/**
 * Draws tables as a grid that is edited in place: click a cell to type, Tab and Enter move on,
 * and the controls around the grid add and remove rows and columns.
 */
// A selection that ends on a table's edge would draw its cursor as tall as the table.
const hideEdgeCursor = EditorView.editorAttributes.compute([tableField, 'selection'], (state) => {
  const head = state.selection.main.head;
  const onEdge = tableRanges(state).some((t) => head === t.from || head === t.to);
  return { class: onEdge ? 'cm-sl-cursor-on-table' : '' };
});

export const tableGrid: Extension = [tableField, keepTextOutOfTables, hideEdgeCursor];
