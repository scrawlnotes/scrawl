import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { Compartment, EditorState, type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Decoration, type DecorationSet, drawSelection, EditorView, keymap, lineNumbers, placeholder, WidgetType } from '@codemirror/view';
import { findPanel } from './find';
import { textSelection } from './selection';
import { scrawlTheme } from './theme';

// A collection's rules file as code, after the Rules view of design/mockups.html: line numbers,
// JS's colors (the file is written in a language like JS's), and what is wrong where it is: the
// word underlined, what to do in a line of its own under the line it is on.

/** What is wrong, at a place of the text. */
export interface RulesProblem {
  at: number;
  message: string;
}

const setProblems = StateEffect.define<RulesProblem[]>();

class Said extends WidgetType {
  constructor(readonly message: string) {
    super();
  }
  eq(other: Said) {
    return other.message === this.message;
  }
  toDOM() {
    const line = document.createElement('div');
    line.className = 'cm-rules-said';
    line.textContent = this.message;
    return line;
  }
}

/** The problems as marks: the word at each underlined, its message under its line, one per line. */
function marks(state: EditorState, problems: RulesProblem[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  const placed = problems
    .map((p) => ({ ...p, at: Math.max(0, Math.min(p.at, doc.length)) }))
    .sort((a, b) => a.at - b.at);
  const said = new Set<number>();
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  for (const p of placed) {
    const line = doc.lineAt(p.at);
    const word = /^[\w$]+|^\S/.exec(doc.sliceString(p.at, line.to));
    const to = word ? p.at + word[0].length : p.at;
    if (to > p.at) ranges.push({ from: p.at, to, deco: Decoration.mark({ class: 'cm-rules-bad' }) });
    if (!said.has(line.number)) {
      said.add(line.number);
      ranges.push({ from: line.to, to: line.to, deco: Decoration.widget({ widget: new Said(p.message), block: true, side: 1 }) });
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const r of ranges) builder.add(r.from, r.to, r.deco);
  return builder.finish();
}

const problemsField = StateField.define<{ problems: RulesProblem[]; deco: DecorationSet }>({
  create: () => ({ problems: [], deco: Decoration.none }),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setProblems)) return { problems: effect.value, deco: marks(tr.state, effect.value) };
    return tr.docChanged ? { problems: value.problems, deco: value.deco.map(tr.changes) } : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.deco),
});

const rulesTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--sl-code)' },
  '.cm-scroller': { fontFamily: 'var(--sl-font-mono)', fontSize: '12.5px', lineHeight: '1.75', fontVariantLigatures: 'none' },
  '.cm-content': { padding: '10px 0' },
  '.cm-line': { padding: '0 16px 0 2px' },
  '.cm-gutters': { backgroundColor: 'var(--sl-code)' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '38px', padding: '0 12px 0 8px', fontSize: '12.5px' },
  '.cm-rules-bad': { textDecoration: 'underline wavy var(--sl-accent)', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
  '.cm-rules-said': { padding: '0 16px 2px 2px', color: 'var(--sl-accent)', fontFamily: 'var(--sl-font-ui, inherit)', fontSize: '11.5px', lineHeight: '1.6', whiteSpace: 'normal' },
  '.cm-placeholder': { color: 'var(--sl-faint)' },
});

export interface RulesEditor {
  view: EditorView;
  /** Shows what is wrong with the text as it is now; none clears it. */
  setProblems(problems: RulesProblem[]): void;
  destroy(): void;
}

/** An editor for a collection's rules file. `onChange` gets each edit typed; `hint` shows while it is empty. */
export function createRulesEditor(options: { parent: HTMLElement; doc: string; hint?: string; onChange: (doc: string) => void }): RulesEditor {
  const language = new Compartment();
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
        language.of([]),
        options.hint ? placeholder(options.hint) : [],
        problemsField,
        scrawlTheme,
        rulesTheme,
        keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  // JS's colors come with its grammar, loaded the first time a rules file is shown.
  let gone = false;
  const js = languages.find((l) => l.name === 'JavaScript');
  void js?.load().then((support: Extension) => {
    if (!gone) view.dispatch({ effects: language.reconfigure(support) });
  });
  return {
    view,
    setProblems: (problems) => view.dispatch({ effects: setProblems.of(problems) }),
    destroy: () => {
      gone = true;
      view.destroy();
    },
  };
}
