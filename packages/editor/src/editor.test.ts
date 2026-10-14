import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  insertTable,
  linkAt,
  setLink,
  splitSelectionIntoLines,
  toggleBold,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleLinePrefix,
  toggleList,
  indentLines,
} from './commands';
import { literalPattern } from './find';
import { pastedLink, pastedUrl } from './links';
import { cursorBehavior, restingPosition } from './cursor';
import { markdownSlice, visibleText } from './clipboard';
import { addCopy, type Copy, copiesField, copyFollows, copyPosition, copyProgress, dropCopy, progressText } from './copies';
import { positionsToEscape } from './literal';
import { buildDecorations, setSourceMode, sourceMode } from './livePreview';
import { attachmentChanges } from './media';
import { cellMarkdown, copiedCells, fillCells, parseTable, pasteTable, serializeTable, tableDecorations, tableGrid, tableOfCells } from './table';

const extensions = [markdown({ base: markdownLanguage }), sourceMode, EditorState.allowMultipleSelections.of(true)];

/** Creates a state from text where `|` marks the cursor, or a pair of `|` marks a selection. */
function stateOf(text: string): EditorState {
  const anchor = text.indexOf('|');
  const head = text.indexOf('|', anchor + 1);
  const doc = text.replaceAll('|', '');
  const selection =
    anchor < 0 ? EditorSelection.cursor(0) : head < 0 ? EditorSelection.cursor(anchor) : EditorSelection.range(anchor, head - 1);
  return EditorState.create({ doc, selection, extensions });
}

function decorations(text: string): string[] {
  return decorationsOf(stateOf(text));
}

function decorationsOf(state: EditorState): string[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
  const out: string[] = [];
  const iter = buildDecorations(state, [{ from: 0, to: state.doc.length }], {}, tree).iter();
  for (; iter.value; iter.next()) out.push(`${iter.value.spec.kind} ${iter.from}-${iter.to}`);
  return out;
}

function run(command: StateCommand, text: string): string {
  let state = stateOf(text);
  command({ state, dispatch: (tr) => (state = tr.state) });
  const { from, to } = state.selection.main;
  const doc = state.doc.toString();
  return from === to
    ? `${doc.slice(0, from)}|${doc.slice(from)}`
    : `${doc.slice(0, from)}|${doc.slice(from, to)}|${doc.slice(to)}`;
}

describe('live preview', () => {
  it('hides emphasis marks wherever the cursor is', () => {
    const hidden = ['hide 0-2', 'strong 0-8', 'hide 6-8'];
    expect(decorations('**bold** text|')).toEqual(hidden);
    expect(decorations('**bo|ld** text')).toEqual(hidden);
    expect(decorations('|**bold** text|')).toEqual(hidden);
  });

  it('styles a heading line and hides the mark with its space', () => {
    expect(decorations('# Tit|le\n\nbody')).toEqual(['h1 0-0', 'hide 0-2']);
  });

  it('keeps only the link text visible', () => {
    expect(decorations('[do|cs](https://x.y) end')).toEqual(['hide 0-1', 'link 1-5', 'hide 5-19']);
  });

  it('hides the backslash of an escaped character', () => {
    expect(decorations('a \\*b|')).toEqual(['hide 2-3']);
  });

  it('draws a top-level table as one grid and nothing inside it', () => {
    // Built directly: the `|` cursor marker of `stateOf` would swallow the pipes.
    const doc = 'text\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nend';
    const state = EditorState.create({ doc, selection: EditorSelection.cursor(doc.length), extensions: [...extensions, tableGrid] });
    expect(decorationsOf(state)).toEqual([]);
    const grid = tableDecorations(state).iter();
    expect([grid.value?.spec.kind, grid.from, grid.to]).toEqual(['grid', 6, 35]);
  });

  it('replaces bullet marks but leaves ordered and task items as written', () => {
    expect(decorations('- item\n\n|')).toEqual(['bullet 0-1']);
    expect(decorations('1. item\n\n|')).toEqual(['syntax 0-2']);
    expect(decorations('- [ ] task\n\n|')).toEqual(['syntax 0-1']);
  });

  it('replaces an image with a widget and never shows its source', () => {
    expect(decorations('![alt](a.png) end|')).toEqual(['image 0-13']);
    expect(decorations('|![alt](a.png)| end')).toEqual(['image 0-13']);
  });

  it('marks every line of a fenced code block', () => {
    expect(decorations('```js\nlet a\n```\n\n|').filter((d) => d.startsWith('codeblock'))).toEqual([
      'codeblock 0-0',
      'codeblock 6-6',
      'codeblock 12-12',
    ]);
  });

  it('puts a copy button for the code, without its fences, at the end of the opening line', () => {
    const state = stateOf('```js\nlet a\nlet b\n```\n\n|');
    const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
    const found: { at: number; code: string }[] = [];
    for (let iter = buildDecorations(state, [{ from: 0, to: state.doc.length }], {}, tree).iter(); iter.value; iter.next()) {
      if (iter.value.spec.kind === 'copy') found.push({ at: iter.from, code: (iter.value.spec.widget as { code: string }).code });
    }
    expect(found).toEqual([{ at: 5, code: 'let a\nlet b' }]);
  });

  it('hides quote marks', () => {
    expect(decorations('> quo|ted')).toEqual(['quote 0-0', 'hide 0-2']);
  });

  it('draws nothing in source mode', () => {
    const state = stateOf('# Title\n\n**bold**|').update({ effects: setSourceMode.of(true) }).state;
    expect(decorationsOf(state)).toEqual([]);
  });
});

describe('cursor around hidden syntax', () => {
  // 'a **bold** c': open mark 2-4, text 4-8, close mark 8-10.
  const state = stateOf('a **bold** c');
  const rest = (pos: number, prev: number, pointer = false) => restingPosition(state, pos, prev, pointer);

  it('rests before a hidden mark', () => {
    expect(rest(4, 5)).toBe(2);
    expect(rest(10, 11)).toBe(8);
    expect(rest(9, -1)).toBe(8);
  });

  it('crosses a mark and one character when stepping right', () => {
    expect(rest(4, 2)).toBe(5);
    expect(rest(10, 8)).toBe(11);
  });

  it('does not treat a click as a step', () => {
    expect(rest(4, 2, true)).toBe(2);
  });

  it('leaves positions away from marks alone', () => {
    expect(rest(6, 5)).toBe(6);
    expect(rest(2, 1)).toBe(2);
    expect(rest(8, 7)).toBe(8);
  });

  it('rests behind a line prefix and leaves the line when stepping left from it', () => {
    const heading = stateOf('one\n# Title');
    expect(restingPosition(heading, 4, 0)).toBe(6);
    expect(restingPosition(heading, 4, 6)).toBe(3);
  });
});

describe('formatting commands', () => {
  it('wraps and unwraps a selection', () => {
    expect(run(toggleBold, 'a |word| b')).toBe('a **|word|** b');
    expect(run(toggleBold, 'a **|word|** b')).toBe('a |word| b');
  });

  it('uses the word under the cursor', () => {
    expect(run(toggleBold, 'a wo|rd b')).toBe('a **wo|rd** b');
    expect(run(toggleBold, 'a **wo|rd** b')).toBe('a wo|rd b');
  });

  it('inserts an empty pair when there is no word', () => {
    expect(run(toggleBold, 'a | b')).toBe('a **|** b');
  });

  it('removes the formatting around the cursor even when it spans several words', () => {
    expect(run(toggleBold, 'a **two wo|rds** b')).toBe('a two wo|rds b');
    expect(run(toggleBold, 'a __wo|rd__ b')).toBe('a wo|rd b');
  });

  // A mark around a space, a line break or a block prefix is not valid Markdown: the characters
  // would show up as text. Formatting a selection must never do that.
  it('keeps edge whitespace and line breaks outside the marks', () => {
    expect(run(toggleBold, 'a |word |b')).toBe('a **|word** |b');
    expect(run(toggleBold, '|one\n|two')).toBe('**|one**\n|two');
    expect(run(toggleBold, '|   |')).toBe('|   |');
  });

  it('formats each line of a multi-line selection and skips blank lines', () => {
    expect(run(toggleBold, '|one\n\ntwo|')).toBe('**|one**\n\n**two|**');
    expect(run(toggleBold, '**|one**\n\n**two|**')).toBe('|one\n\ntwo|');
    expect(run(toggleBold, '**|one**\n\ntwo|')).toBe('**|one**\n\n**two|**');
  });

  it('puts marks after a heading, list or quote prefix', () => {
    expect(run(toggleBold, '|# Title|')).toBe('|# **Title|**');
    expect(run(toggleItalic, '|- item\n> quote|')).toBe('|- *item*\n> *quote|*');
  });

  it('never leaves a formatted selection that fails to parse', () => {
    for (const text of ['|word |', '|one\n\ntwo\n|', '|# Title\n|', ' |a b| ', '|- x\n- y|']) {
      const marked = run(toggleBold, text).replaceAll('|', '');
      const state = EditorState.create({ doc: marked, extensions });
      const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
      let strong = 0;
      tree.iterate({ enter: (node) => void (node.name === 'StrongEmphasis' && strong++) });
      expect(marked.split('**').length - 1, marked).toBe(strong * 2);
    }
  });

  it('adds italic to bold instead of removing a star', () => {
    expect(run(toggleItalic, '**|word|**')).toBe('***|word|***');
    expect(run(toggleItalic, '***|word|***')).toBe('**|word|**');
    expect(run(toggleItalic, '*|word|*')).toBe('|word|');
  });

  it('links the selection, changes the address and removes the link', () => {
    expect(run(setLink('https://x.y'), 'see |docs| now')).toBe('see [|docs|](https://x.y) now');
    expect(run(setLink('https://z.w'), 'see [|docs|](https://x.y) now')).toBe('see [|docs|](https://z.w) now');
    expect(run(setLink(''), 'see [|docs|](https://x.y) now')).toBe('see |docs| now');
  });

  it('sets, changes and removes a heading', () => {
    expect(run(toggleHeading(2), 'Ti|tle')).toBe('## Ti|tle');
    expect(run(toggleHeading(1), '## Ti|tle')).toBe('# Ti|tle');
    expect(run(toggleHeading(1), '# Ti|tle')).toBe('Ti|tle');
  });

  it('toggles a list prefix on every selected line', () => {
    expect(run(toggleLinePrefix('list'), 'o|ne\ntw|o')).toBe('- o|ne\n- tw|o');
    expect(run(toggleLinePrefix('list'), '- o|ne\n- tw|o')).toBe('o|ne\ntw|o');
  });

  it('makes a numbered list, numbers it on from the list above, and changes one kind into the other', () => {
    expect(run(toggleList('ordered'), 'o|ne\ntw|o')).toBe('1. o|ne\n2. tw|o');
    expect(run(toggleList('ordered'), '1. o|ne\n2. tw|o')).toBe('o|ne\ntw|o');
    expect(run(toggleList('ordered'), '- o|ne\n- tw|o')).toBe('1. o|ne\n2. tw|o');
    expect(run(toggleList('bullet'), '1. o|ne\n2. two')).toBe('- o|ne\n1. two');
    expect(run(toggleList('ordered'), '1. a\n2. b\nc|')).toBe('1. a\n2. b\n3. c|');
    expect(run(toggleList('ordered'), '  sub|')).toBe('  1. sub|');
  });

  it('moves a list item under the item above, as far in as its text, and back; numbered lists are numbered again', () => {
    expect(run(indentLines(true), '1. a\n2. b|\n3. c')).toBe('1. a\n   1. b|\n2. c');
    expect(run(indentLines(false), '1. a\n   1. b|\n2. c')).toBe('1. a\n2. b|\n3. c');
    expect(run(indentLines(true), '- a\n- b|')).toBe('- a\n  - b|');
    expect(run(indentLines(true), '- a\n  - b\n- c|')).toBe('- a\n  - b\n  - c|');
    // The first item has nothing to go under.
    expect(run(indentLines(true), '- a|')).toBe('- a|');
    expect(run(indentLines(true), 'a|')).toBe('  a|');
    expect(run(indentLines(false), '  a|')).toBe('a|');
  });
});

describe('literal typing', () => {
  /** Types `text` at the end of `before` and returns the note with the needed backslashes. */
  function typed(before: string, text: string): string {
    let state = EditorState.create({ doc: before + text, extensions });
    let inserted = [{ from: before.length, to: before.length + text.length }];
    for (let pass = 0; pass < 4; pass++) {
      const positions = positionsToEscape(state, inserted);
      if (!positions.length) break;
      const changes = state.changes(positions.map((from) => ({ from, insert: '\\' })));
      state = state.update({ changes }).state;
      inserted = inserted.map((r) => ({ from: changes.mapPos(r.from, -1), to: changes.mapPos(r.to, 1) }));
    }
    return state.doc.toString();
  }
  /** Types `text` one character at a time. */
  const typedSlowly = (text: string) => [...text].reduce((doc, ch) => typed(doc, ch), '');

  it('leaves ordinary text and lone symbols alone', () => {
    expect(typedSlowly('snake_case and 2 * 3 = 6')).toBe('snake_case and 2 * 3 = 6');
    expect(typedSlowly('ls *.txt')).toBe('ls *.txt');
    expect(typedSlowly('issue #12, a - b')).toBe('issue #12, a - b');
  });

  it('keeps typed emphasis characters as text', () => {
    for (const text of ['**bold**', '*.txt and *.md*', '__init__', '~~gone~~', '`code`']) {
      const doc = typedSlowly(text);
      expect(doc.replaceAll('\\', ''), doc).toBe(text);
      expect(decorationsOf(EditorState.create({ doc, extensions })).filter((d) => !d.startsWith('hide')), doc).toEqual([]);
    }
  });

  it('keeps typed line starts as text', () => {
    for (const text of ['# heading', '- item', '1. first', '> quote', '---', '```']) {
      const doc = typedSlowly(text);
      expect(doc.replaceAll('\\', ''), doc).toBe(text);
      expect(decorationsOf(EditorState.create({ doc, extensions })).filter((d) => !d.startsWith('hide')), doc).toEqual([]);
    }
  });

  it('keeps a typed link as text', () => {
    const doc = typedSlowly('[docs](https://x.y)');
    expect(decorationsOf(EditorState.create({ doc, extensions })).filter((d) => !d.startsWith('hide'))).toEqual([]);
  });

  it('escapes pasted Markdown as a whole', () => {
    const doc = typed('', '# Title\n\n**bold** and [a](b)\n- item');
    expect(doc.replaceAll('\\', '')).toBe('# Title\n\n**bold** and [a](b)\n- item');
    expect(decorationsOf(EditorState.create({ doc, extensions })).filter((d) => !d.startsWith('hide'))).toEqual([]);
  });

  it('does not touch text typed inside existing formatting', () => {
    expect(typed('# Title', ' more')).toBe('# Title more');
    expect(typed('- item\n- ', 'next')).toBe('- item\n- next');
  });
});

describe('copying', () => {
  const at = (text: string) => {
    const state = stateOf(text);
    return [state, state.selection.main.from, state.selection.main.to] as const;
  };

  it('gives the text as it reads on screen', () => {
    expect(visibleText(...at('|# Title\n\n**bold** and \\*star\\*|'))).toBe('Title\n\nbold and *star*');
    expect(visibleText(...at('|see [docs](https://x.y) and ![pic](a.png)|'))).toBe('see docs and ');
  });

  it('adds link addresses to the plain text copy', () => {
    expect(visibleText(...at('|see [docs](https://x.y) now|'), true)).toBe('see docs (https://x.y) now');
  });

  it('counts only visible characters', () => {
    expect(visibleText(...at('|**bold**|')).length).toBe(4);
  });

  it('completes a piece of formatted text so that it keeps its formatting', () => {
    expect(markdownSlice(...at('a **|bold|** c'))).toBe('**bold**');
    expect(markdownSlice(...at('a **bo|ld** c|'))).toBe('**ld** c');
    expect(markdownSlice(...at('a |**bo|ld** c'))).toBe('**bo**');
    expect(markdownSlice(...at('# |Title|'))).toBe('# Title');
    expect(markdownSlice(...at('see [|do|cs](https://x.y)'))).toBe('[do](https://x.y)');
    expect(markdownSlice(...at('|plain| text'))).toBe('plain');
  });
});

describe('cursor after inserting a prefix', () => {
  // The slash menu and the format bar act on an empty line; what is typed next must go behind the prefix.
  it('lands behind a quote, list or heading prefix on an empty line', () => {
    expect(run(toggleLinePrefix('quote'), '|')).toBe('> |');
    expect(run(toggleLinePrefix('list'), 'a\n|')).toBe('a\n- |');
    expect(run(toggleHeading(2), '|')).toBe('## |');
  });

  it('lands inside a code block made on an empty line', () => {
    expect(run(toggleCodeBlock, '|')).toBe('```\n|\n```');
  });
});

describe('code block', () => {
  it('wraps the selected lines and unwraps them again', () => {
    expect(run(toggleCodeBlock, 'a\n|b\nc|\nd')).toBe('a\n```\n|b\nc|\n```\nd');
    expect(run(toggleCodeBlock, 'a\n```\n|b\nc|\n```\nd')).toBe('a\n|b\nc|\nd');
  });
});

describe('table model', () => {
  const source = '| Name | Qty |\n| :--- | --: |\n| a\\|b | 2   |';

  it('reads cells, alignment and escaped pipes', () => {
    expect(parseTable(source)).toEqual({ header: ['Name', 'Qty'], align: ['left', 'right'], rows: [['a\\|b', '2']] });
  });

  it('writes the table back with padded columns', () => {
    expect(serializeTable(parseTable(source))).toBe(source);
    const wider = parseTable(source);
    wider.rows.push(['longer name', '']);
    expect(serializeTable(wider)).toBe(
      '| Name        | Qty |\n| :---------- | --: |\n| a\\|b        | 2   |\n| longer name |     |',
    );
  });

  it('gives short rows the missing cells', () => {
    expect(parseTable('| a | b |\n| - | - |\n| 1 |').rows).toEqual([['1', '']]);
  });

  it('stores typed cell text as plain text on one line', () => {
    expect(cellMarkdown(' a|b *c*\nd ')).toBe('a\\|b \\*c\\* d');
  });
});

describe('inserting blocks', () => {
  const table = '| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |';
  const insert = (doc: string, at: number) => {
    let state = EditorState.create({ doc, selection: EditorSelection.cursor(at), extensions: [...extensions, tableGrid] });
    insertTable({ state, dispatch: (tr) => (state = tr.state) });
    return state;
  };

  it('puts a table on its own lines with a blank line around it', () => {
    expect(insert('text\nmore', 4).doc.toString()).toBe(`text\n\n${table}\n\nmore`);
    expect(insert('', 0).doc.toString()).toBe(`${table}\n`);
  });

  it('draws an inserted table as a grid', () => {
    const doc = insert('text', 4).doc;
    expect(tableDecorations(EditorState.create({ doc, extensions: [...extensions, tableGrid] })).size).toBe(1);
  });
});

describe('cells pasted from a spreadsheet', () => {
  const HTML = '<table><tr><td>Name</td></tr></table>';

  it('reads the rows and cells Excel puts on the clipboard', () => {
    expect(copiedCells('Name\tARR\r\nAcme\t48,000 €\r\nGlobex\t\r\n', HTML)).toEqual([
      ['Name', 'ARR'],
      ['Acme', '48,000 €'],
      ['Globex', ''],
    ]);
  });

  it('reads a quoted cell with a line break and quotes in it', () => {
    expect(copiedCells('Name\tNote\nAcme\t"Met at the ""summit""\nthen called"\n', HTML)).toEqual([
      ['Name', 'Note'],
      ['Acme', 'Met at the "summit"\nthen called'],
    ]);
    expect(copiedCells('a\t"b\nc\td', HTML)).toEqual([
      ['a', '"b'],
      ['c', 'd'],
    ]);
  });

  it('is not cells without a tab, with ragged rows and no table, or indented with tabs', () => {
    expect(copiedCells('just text\nmore', HTML)).toBeNull();
    expect(copiedCells('a\tb\nc')).toBeNull();
    expect(copiedCells('\tone\n\ttwo')).toBeNull();
    expect(copiedCells('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('gives the short rows of a web page table the missing cells', () => {
    expect(copiedCells('a\tb\nc', HTML)).toEqual([
      ['a', 'b'],
      ['c', ''],
    ]);
  });

  const paste = (text: string, cells: string[][]) => {
    let state = stateOf(text);
    const spec = pasteTable(state, cells);
    if (!spec) return null;
    state = state.update(spec).state;
    const at = state.selection.main.head;
    const doc = state.doc.toString();
    return `${doc.slice(0, at)}|${doc.slice(at)}`;
  };
  const cells = [
    ['Name', 'Stage'],
    ['Acme *Corp*', 'active'],
  ];
  const table = '| Name          | Stage  |\n| ------------- | ------ |\n| Acme \\*Corp\\* | active |';

  it('makes the first row the header and keeps the text of the cells as it is', () => {
    expect(tableOfCells(cells)).toBe(table);
  });

  it('puts the table on lines of its own with a blank line around it, the cursor after it', () => {
    expect(paste('|', cells)).toBe(`${table}\n|`);
    expect(paste('before |after', cells)).toBe(`before\n\n${table}\n\n|after`);
    expect(paste('one\n|\nthree', cells)).toBe(`one\n\n${table}\n|\nthree`);
    expect(paste('one\n\n|\n\nthree', cells)).toBe(`one\n\n${table}\n|\nthree`);
    expect(paste('take |this| out', cells)).toBe(`take\n\n${table}\n\n|out`);
  });

  it('leaves code as it is', () => {
    expect(paste('```\n|\n```', cells)).toBeNull();
    expect(paste('a `co|de` b', cells)).toBeNull();
  });

  it('fills a table from a cell on, adding the rows and columns the cells run past', () => {
    const model = parseTable('| a | b |\n| - | - |\n| 1 | 2 |');
    fillCells(model, { row: 0, col: 1 }, [
      ['x', 'y|z'],
      ['w', ''],
    ]);
    expect(model).toEqual({
      header: ['a', 'b', ''],
      align: ['', '', ''],
      rows: [
        ['1', 'x', 'y\\|z'],
        ['', 'w', ''],
      ],
    });
  });
});

describe('find', () => {
  it('matches text that was typed literally and is stored escaped', () => {
    const find = (text: string, doc: string) => new RegExp(literalPattern(text), 'u').test(doc);
    expect(find('*.txt', 'ls \\*.txt')).toBe(true);
    expect(find('*.txt', 'ls *.txt')).toBe(true);
    expect(find('a.b', 'axb')).toBe(false);
    expect(find('1.5 (x) [y]', '1\\.5 (x) \\[y\\]')).toBe(true);
  });
});

describe('split selection into lines', () => {
  it('gives every selected line its own selection', () => {
    let state = stateOf('|one\ntwo\nthree|\nfour');
    splitSelectionIntoLines({ state, dispatch: (tr) => (state = tr.state) });
    expect(state.selection.ranges.map((r) => [r.from, r.to])).toEqual([[0, 3], [4, 7], [8, 13]]);
  });

  it('leaves out a line the selection only reaches the start of', () => {
    let state = stateOf('|one\ntwo\n|three');
    splitSelectionIntoLines({ state, dispatch: (tr) => (state = tr.state) });
    expect(state.selection.ranges.map((r) => [r.from, r.to])).toEqual([[0, 3], [4, 7]]);
  });
});

describe('files being copied in', () => {
  const copy = (id: string): Copy => ({ id, name: `${id}.png`, image: true, total: 100, written: 0, shown: false, cancel: () => {} });

  it('keeps its place while the note is edited, out of the note text', () => {
    let state = EditorState.create({ doc: 'see here', extensions: [copiesField] });
    state = state.update({ effects: addCopy.of({ copy: copy('a'), pos: 4 }) }).state;
    state = state.update({ changes: { from: 0, insert: 'Please ' } }).state;
    expect(copyPosition(state, 'a')).toBe(11);
    expect(state.doc.toString()).toBe('Please see here');
    state = state.update({ effects: dropCopy.of('a') }).state;
    expect(copyPosition(state, 'a')).toBeNull();
  });

  it('knows when another file dropped with it waits behind it', () => {
    let state = EditorState.create({ doc: 'x', extensions: [copiesField] });
    state = state.update({ effects: [addCopy.of({ copy: copy('a'), pos: 1 }), addCopy.of({ copy: copy('b'), pos: 1 })] }).state;
    expect(copyFollows(state, 'a')).toBe(true);
    expect(copyFollows(state, 'b')).toBe(false);
    state = state.update({ effects: copyProgress.of({ id: 'a', written: 40 }) }).state;
    expect(copyPosition(state, 'a')).toBe(1);
    expect(copyFollows(state, 'a')).toBe(true);
  });

  it('writes how far a copy is in the unit of the whole', () => {
    expect(progressText(13_002_342, 44_983_910)).toBe('12.4 / 42.9 MB');
    expect(progressText(0, 2048)).toBe('0 / 2 KB');
    expect(progressText(10, 300)).toBe('10 / 300 B');
  });
});

describe('attachments', () => {
  it('draws a link to an attached file as the file, and other links as links', () => {
    expect(decorations('[scope v3.pdf](_attachments/scope%20v3.pdf) and [site](https://x.y)|')).toEqual([
      'attachment 0-43',
      'hide 48-49',
      'link 49-53',
      'hide 53-67',
    ]);
  });

  it('reads an attached file as its name, and leaves it out of the link editor', () => {
    const doc = 'See [Voice memo](_attachments/2026-10-06-153739.webm) now';
    const state = EditorState.create({ doc, selection: { anchor: 4 }, extensions });
    ensureSyntaxTree(state, state.doc.length, 5000);
    expect(visibleText(state, 0, state.doc.length)).toBe('See Voice memo now');
    expect(linkAt(state)).toBeNull();
  });

  it('tells which attached files an edit stopped or started linking to', () => {
    const file = '[b.pdf](_attachments/b%20c.pdf)';
    const state = EditorState.create({ doc: `${file} and [site](https://x.y)\n![](<_attachments/my a.png>)`, extensions });
    const removed = state.update({ changes: { from: 0, to: file.length } });
    expect(attachmentChanges(removed)).toEqual({ removed: ['_attachments/b c.pdf'], added: [] });
    // Undo puts it back.
    expect(attachmentChanges(removed.state.update({ changes: { from: 0, insert: file } }))).toEqual({
      removed: [],
      added: ['_attachments/b c.pdf'],
    });
    // Moved to the next line, it is still linked.
    const moved = state.update({ changes: [{ from: 0, to: file.length }, { from: state.doc.length, insert: ` ${file}` }] });
    expect(attachmentChanges(moved)).toEqual({ removed: [], added: [] });
    // Typing elsewhere on a line with a file changes nothing.
    expect(attachmentChanges(state.update({ changes: { from: file.length, insert: 'x' } }))).toEqual({ removed: [], added: [] });
    expect(attachmentChanges(state.update({ changes: { from: state.doc.line(2).from, to: state.doc.length } }))).toEqual({
      removed: ['_attachments/my a.png'],
      added: [],
    });
  });

  it('shows what can be done with an image or a file only while the selection is that item alone', () => {
    const items = (text: string) => {
      const state = stateOf(text);
      const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
      const out: string[] = [];
      for (let iter = buildDecorations(state, [{ from: 0, to: state.doc.length }], {}, tree).iter(); iter.value; iter.next()) {
        const widget = iter.value.spec.widget as { selected?: boolean; active?: boolean } | undefined;
        if (widget?.selected !== undefined) out.push(`${iter.value.spec.kind} ${widget.selected} ${widget.active}`);
      }
      return out;
    };
    const image = '![](_attachments/a.png)';
    const file = '[a.pdf](_attachments/a.pdf)';
    expect(items(`|${image}| ${file}`)).toEqual(['image true true', 'attachment false false']);
    expect(items(`${image} |${file}|`)).toEqual(['image false false', 'attachment true true']);
    // Inside a longer selection an item is selected but offers nothing of its own.
    expect(items(`|${image} ${file}|`)).toEqual(['image true false', 'attachment true false']);
    expect(items(`${image}| ${file}`)).toEqual(['image false false', 'attachment false false']);
  });
});

describe('deleting a selection', () => {
  /** Deletes (or, with `text`, types over) the selection marked in `text` and shows the result. */
  const take = (marked: string, typed = '') => {
    let state = stateOf(marked);
    state = EditorState.create({ doc: state.doc, selection: state.selection, extensions: [extensions, cursorBehavior] });
    ensureSyntaxTree(state, state.doc.length, 5000);
    const { from, to } = state.selection.main;
    const tr = state.update({ changes: { from, to, insert: typed }, userEvent: typed ? 'input.type' : 'delete.backward' });
    const { head } = tr.state.selection.main;
    const doc = tr.state.doc.toString();
    return `${doc.slice(0, head)}|${doc.slice(head)}`;
  };

  it('takes a link whole when the selection reaches into its hidden syntax', () => {
    // From the start of the link text to the end of the line: the `[` stayed behind.
    expect(take('Docs: [|Tauri](https://tauri.app)|')).toBe('Docs: |');
    // From before the link to the end of its text: `](https://tauri.app)` stayed behind.
    expect(take('Docs: |[Tauri|](https://tauri.app) end')).toBe('Docs: | end');
    expect(take('|Some **bold**| here')).toBe('| here');
  });

  it('takes a span whose text is deleted with its marks, but keeps it when the text is typed over', () => {
    expect(take('See [|Tauri|](https://tauri.app)')).toBe('See |');
    expect(take('See [|Tauri|](https://tauri.app)', 'Docs')).toBe('See [Docs|](https://tauri.app)');
  });

  it('keeps the format of what is left of a span', () => {
    expect(take('Docs: [Tau|ri](https://tauri.app) end|')).toBe('Docs: [Tau|](https://tauri.app)');
    expect(take('|Docs: [Tau|ri](https://tauri.app)')).toBe('|[ri](https://tauri.app)');
    expect(take('a **bo|ld** and *it|alic*')).toBe('a **bo|***alic*');
  });
});

describe('pasted links', () => {
  it('knows a pasted web address from other text', () => {
    expect(pastedUrl('  https://example.com/a?b=c#d \n')).toBe('https://example.com/a?b=c#d');
    expect(pastedUrl('see https://example.com')).toBeNull();
    expect(pastedUrl('ftp://example.com')).toBeNull();
  });

  it('writes the address so that it stays one link, with the address it points to', () => {
    const url = 'https://en.wikipedia.org/wiki/Scrawl_(film)?a[]=1';
    const doc = pastedLink(url);
    expect(doc).toBe('[https://en.wikipedia.org/wiki/Scrawl_(film)?a%5B%5D=1](https://en.wikipedia.org/wiki/Scrawl_%28film%29?a[]=1)');
    const state = stateOf(doc);
    ensureSyntaxTree(state, state.doc.length, 5000);
    const text = 'https://en.wikipedia.org/wiki/Scrawl_(film)?a%5B%5D=1';
    expect(decorations(doc).filter((d) => d.startsWith('link'))).toEqual([`link 1-${1 + text.length}`]);
    expect(linkAt(EditorState.create({ doc, selection: { anchor: 5 }, extensions }))?.url).toBe(
      'https://en.wikipedia.org/wiki/Scrawl_%28film%29?a[]=1',
    );
  });

});
