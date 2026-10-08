import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { findPanel } from './find';
import { textSelection } from './selection';
import { scrawlTheme } from './theme';

// A keys file as text, after the Keys text view of design/mockups.html: line numbers, comments
// faint, key names dim, values as they are. Plain text otherwise; nothing in it is formatted.
// A collection's schema file is shown the same way, its keys dim.

const comment = Decoration.mark({ class: 'cm-env-comment' });
const keyName = Decoration.mark({ class: 'cm-env-key' });
const ENTRY = /^(\s*(?:export\s+)?)([^\s=#][^\s=]*)\s*=/;
const JSON_KEY = /"(?:[^"\\]|\\.)*"(?=\s*:)/g;

/** The marks of one line of a keys file: a comment, or the name of a key. */
function envLine(text: string, at: number, builder: RangeSetBuilder<Decoration>) {
  const start = text.search(/\S/);
  if (start >= 0 && text[start] === '#') builder.add(at + start, at + text.length, comment);
  else {
    const m = ENTRY.exec(text);
    if (m) builder.add(at + m[1]!.length, at + m[1]!.length + m[2]!.length, keyName);
  }
}

/** The marks of one line of JSON: the keys. */
function jsonLine(text: string, at: number, builder: RangeSetBuilder<Decoration>) {
  for (const m of text.matchAll(JSON_KEY)) builder.add(at + m.index, at + m.index + m[0].length, keyName);
}

function highlight(mark: typeof envLine) {
  const decorate = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = view.state.doc.lineAt(pos);
        mark(line.text, line.from, builder);
        pos = line.to + 1;
      }
    }
    return builder.finish();
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) this.decorations = decorate(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

const envTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--sl-code)' },
  '.cm-scroller': { fontFamily: 'var(--sl-font-mono)', fontSize: '12.5px', lineHeight: '1.75' },
  '.cm-content': { padding: '10px 0' },
  '.cm-line': { padding: '0 16px 0 2px' },
  '.cm-gutters': { backgroundColor: 'var(--sl-code)' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '38px', padding: '0 12px 0 8px', fontSize: '12.5px' },
  '.cm-env-comment': { color: 'var(--sl-faint)' },
  '.cm-env-key': { color: 'var(--sl-dim)' },
});

export interface EnvEditor {
  view: EditorView;
  /** Puts text that changed elsewhere into the editor; the cursor stays where it was, and nothing is reported as typed. */
  setText(text: string): void;
  destroy(): void;
}

/** The one change that turns `from` into `to`: what lies between their common start and end. */
function changeBetween(from: string, to: string) {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = 0;
  while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++;
  return { from: start, to: from.length - end, insert: to.slice(start, to.length - end) };
}

/**
 * An editor for the text of a keys file, or with `json` of a schema file. `onChange` gets each
 * edit typed; `onCursor` where the cursor is.
 */
export function createEnvEditor(options: {
  parent: HTMLElement;
  doc: string;
  json?: boolean;
  onChange: (doc: string) => void;
  onCursor?: (at: { line: number; col: number }) => void;
}): EnvEditor {
  let external = false;
  const cursor = (state: EditorState) => {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    options.onCursor?.({ line: line.number, col: head - line.from + 1 });
  };
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        textSelection,
        EditorState.allowMultipleSelections.of(true),
        highlightSelectionMatches(),
        search({ top: false, createPanel: findPanel }),
        EditorView.lineWrapping,
        highlight(options.json ? jsonLine : envLine),
        scrawlTheme,
        envTheme,
        keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !external) options.onChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) cursor(update.state);
        }),
      ],
    }),
  });
  cursor(view.state);
  return {
    view,
    setText(text) {
      const current = view.state.doc.toString();
      if (text === current) return;
      external = true;
      try {
        view.dispatch({ changes: changeBetween(current, text) });
      } finally {
        external = false;
      }
    },
    destroy: () => view.destroy(),
  };
}
