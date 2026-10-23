import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  backspaceInCallout,
  calloutAt,
  changeCallout,
  deleteAboveCallout,
  enterInEmptyCallout,
  findCallouts,
  leaveCalloutTitle,
  removeCallout,
  setCallout,
} from './callout';
import { calloutDecorations, calloutBlocks } from './calloutBlock';
import { visibleText } from './clipboard';
import { formatState } from './commands';
import { cursorBehavior } from './cursor';
import { exportHtml, pdfContent } from './export';
import { positionsToEscape } from './literal';
import { buildDecorations, setSourceMode, sourceMode } from './livePreview';
import { renderHtml } from './render';

const extensions = [markdown({ base: markdownLanguage }), sourceMode, calloutBlocks()];

/** A state of `text`, where `|` marks the cursor and a pair of `|` a selection. The tree is read to its end. */
function stateOf(text: string): EditorState {
  const anchor = text.indexOf('|');
  const head = text.indexOf('|', anchor + 1);
  const doc = text.replaceAll('|', '');
  const selection = anchor < 0 ? EditorSelection.cursor(0) : head < 0 ? EditorSelection.cursor(anchor) : EditorSelection.range(anchor, head - 1);
  const state = EditorState.create({ doc, selection, extensions });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

/** Runs a command and shows the note after it with its cursor or selection. */
function run(command: StateCommand, text: string): string {
  let state = stateOf(text);
  command({ state, dispatch: (tr) => (state = tr.state) });
  const { from, to } = state.selection.main;
  const doc = state.doc.toString();
  return from === to ? `${doc.slice(0, from)}|${doc.slice(from)}` : `${doc.slice(0, from)}|${doc.slice(from, to)}|${doc.slice(to)}`;
}

const kinds = (text: string) => findCallouts(stateOf(text)).map((c) => c.type);

function drawn(state: EditorState): string[] {
  const out: string[] = [];
  const preview = buildDecorations(state, [{ from: 0, to: state.doc.length }], {}, ensureSyntaxTree(state, state.doc.length, 5000)!).iter();
  for (; preview.value; preview.next()) out.push(`${preview.value.spec.kind} ${preview.from}-${preview.to}`);
  const callouts = calloutDecorations(state).iter();
  for (; callouts.value; callouts.next()) out.push(`${callouts.value.spec.kind} ${callouts.from}-${callouts.to}`);
  return out;
}

describe('callouts', () => {
  it('reads the five kinds, as GitHub writes them and in small letters', () => {
    expect(kinds('> [!NOTE]\n> a')).toEqual(['note']);
    expect(kinds('> [!tip]\n> a\n\n> [!Important]\n> b\n\n> [!WARNING]\n> c\n\n> [!CAUTION]\n> d')).toEqual(['tip', 'important', 'warning', 'caution']);
  });

  it('leaves as a quote another kind, a title beside the kind, a typed marker, one with nothing in it and one inside a list', () => {
    expect(kinds('> [!INFO]\n> a')).toEqual([]);
    expect(kinds('> [!NOTE] Title\n> a')).toEqual([]);
    expect(kinds('> \\[!NOTE\\]\n> a')).toEqual([]);
    expect(kinds('> [!NOTE]')).toEqual([]);
    expect(kinds('- item\n  > [!NOTE]\n  > a')).toEqual([]);
  });

  it('draws the marker line as a title and the rest as the box, hiding the quote marks', () => {
    // "> [!NOTE]" is 0-9; the second line starts at 10.
    expect(drawn(stateOf('> [!NOTE]\n> te|xt'))).toEqual(['quote 10-10', 'hide 10-12', 'callout-title 0-9', 'callout 10-10']);
  });

  it('draws nothing in source mode', () => {
    const state = stateOf('> [!NOTE]\n> text').update({ effects: setSourceMode.of(true) }).state;
    expect(drawn(state)).toEqual([]);
  });

  it('reads as its title in plain text', () => {
    const state = stateOf('> [!WARNING]\n> Back up first.');
    expect(visibleText(state, 0, state.doc.length)).toBe('Warning\nBack up first.');
  });

  it('keeps a typed marker as text', () => {
    const before = '> ';
    const state = stateOf(`${before}[!NOTE]`);
    expect(positionsToEscape(state, [{ from: before.length, to: state.doc.length }])).toEqual([2, 8]);
  });

  it('tells the format bar the kind, and that it is no plain quote', () => {
    expect(formatState(stateOf('> [!TIP]\n> te|xt'))).toMatchObject({ callout: 'tip', quote: false });
    expect(formatState(stateOf('> quo|te'))).toMatchObject({ callout: null, quote: true });
  });
});

describe('callout commands', () => {
  it('makes the line a callout, the cursor staying on its text', () => {
    expect(run(setCallout('tip'), 'one|')).toBe('> [!TIP]\n> one|');
  });

  it('opens an empty callout on an empty line, with the cursor in it', () => {
    expect(run(setCallout('note'), 'above\n|')).toBe('above\n> [!NOTE]\n> |');
  });

  it('puts a blank line under it when text follows, and over it after a quote', () => {
    expect(run(setCallout('note'), 'a|\nb')).toBe('> [!NOTE]\n> a|\n\nb');
    expect(run(setCallout('note'), '> q\nline|')).toBe('> q\n\n> [!NOTE]\n> line|');
  });

  it('wraps every selected line, a blank one keeping the quote going', () => {
    expect(run(setCallout('warning'), '|a\n\nb|')).toBe('> [!WARNING]\n> |a\n>\n> b|');
  });

  it('gives a callout another kind instead of wrapping it again', () => {
    expect(run(setCallout('caution'), '> [!NOTE]\n> te|xt')).toBe('> [!CAUTION]\n> te|xt');
    expect(run(changeCallout(0, 'important'), '> [!note]\n> text|')).toBe('> [!IMPORTANT]\n> text|');
  });

  it('takes a callout away, its text staying', () => {
    expect(run(removeCallout(), '> [!NOTE]\n> a|\n> b')).toBe('a|\nb');
    expect(run(removeCallout(0), '> [!NOTE]\n> a\n\nafter|')).toBe('a\n\nafter|');
  });
});

describe('cursor in a callout', () => {
  // "above\n" 0-6, "> [!NOTE]" 6-15, "> text" from 16, its text from 18.
  const state = stateOf('above\n> [!NOTE]\n> text');

  it('goes down past the title into the text, and up past it to the line above', () => {
    expect(leaveCalloutTitle(state, 6, 3, false)).toBe(18);
    expect(leaveCalloutTitle(state, 15, 18, false)).toBe(5);
  });

  it('goes into the text when the title is clicked', () => {
    expect(leaveCalloutTitle(state, 10, 3, true)).toBe(18);
    expect(leaveCalloutTitle(state, 2, 0, true)).toBeNull();
  });

  it('keeps the title whole: Delete above it does nothing, Backspace at its text takes the callout away', () => {
    expect(deleteAboveCallout(state, 5)).toBe(true);
    const back = backspaceInCallout(state, 18)!;
    expect(state.update({ changes: back.changes }).state.doc.toString()).toBe('above\ntext');
    expect(back.anchor).toBe(6);
  });

  it('takes an empty callout away with Backspace or Enter, leaving an empty line', () => {
    const empty = stateOf('a\n> [!NOTE]\n> ');
    for (const change of [backspaceInCallout(empty, 14), enterInEmptyCallout(empty, 14)]) {
      expect(empty.update({ changes: change!.changes }).state.doc.toString()).toBe('a\n');
      expect(change!.anchor).toBe(2);
    }
    expect(enterInEmptyCallout(stateOf('> [!NOTE]\n> text'), 16)).toBeNull();
  });

  it('puts what is typed on the title\'s edge, where a note opens, into its text', () => {
    const start = EditorState.create({ doc: '> [!NOTE]\n> text', extensions: [...extensions, cursorBehavior] });
    ensureSyntaxTree(start, start.doc.length, 5000);
    const typed = start.update({ changes: { from: 0, insert: 'X' }, selection: { anchor: 1 }, userEvent: 'input.type' }).state;
    expect(typed.doc.toString()).toBe('> [!NOTE]\n> Xtext');
    expect(typed.selection.main.head).toBe(13);
  });

  it('knows the callout the cursor is in', () => {
    expect(calloutAt(state, 20)?.type).toBe('note');
    expect(calloutAt(state, 2)).toBeNull();
  });
});

describe('callouts going out', () => {
  const fonts = { sans: ['Sans', 'SansX'], mono: ['Mono', 'MonoX'] } as { sans: [string, string]; mono: [string, string] };

  it('is a box of its colour in HTML, with its name; another kind stays a quote', () => {
    const html = exportHtml('Plan\n\n> [!WARNING]\n> Back up **first**.\n\n> [!INFO]\n> a quote', 'Plan', new Map());
    expect(html).toContain('<div class="callout callout-warning"><p class="callout-title"><svg');
    expect(html).toContain('Warning</p>\n<p>Back up <strong>first</strong>.</p>\n</div>');
    expect(html).not.toContain('[!WARNING]');
    expect(html).toContain('<blockquote>\n<p>[!INFO]');
  });

  it('is a box with its name in a PDF', () => {
    const content = pdfContent('> [!TIP]\n> Use the shortcut.', 'Tips', new Map(), fonts);
    expect(content[1]).toMatchObject({
      table: { body: [[{ stack: [{ text: [{ text: 'Tip', bold: true, color: '#1a7f37' }] }, { text: [{ text: 'Use the shortcut.' }] }], fillColor: '#eff6f1' }]] },
    });
  });

  it('goes to the clipboard as a quote with its name in bold', () => {
    expect(renderHtml('> [!NOTE]\n> Read me.')).toBe('<blockquote>\n<p><strong>Note</strong></p>\n<p>Read me.</p>\n</blockquote>\n');
  });
});
