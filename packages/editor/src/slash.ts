import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export interface SlashItem {
  label: string;
  /** Shown dimmed next to the label. */
  detail?: string;
  run: (view: EditorView) => void;
}

/**
 * The insert menu: typing `/` at the start of a line or after a space lists what can be added
 * here. Typing on filters the list, Enter picks, Esc closes.
 */
export function slashMenu(items: readonly SlashItem[]): Extension {
  const options = items.map((item, index) => ({
    label: item.label,
    detail: item.detail,
    // Keeps the items in the given order instead of the alphabet.
    boost: items.length - index,
    apply(view: EditorView, _completion: unknown, from: number, to: number) {
      // Take out the `/` and what was typed after it, then act on the line that is left.
      view.dispatch({ changes: { from: from - 1, to }, userEvent: 'input.format' });
      item.run(view);
    },
  }));

  const source = (context: CompletionContext): CompletionResult | null => {
    const typed = context.matchBefore(/\/\w*$/);
    if (!typed) return null;
    const before = context.state.sliceDoc(Math.max(0, typed.from - 1), typed.from);
    // `and/or` and `https://` are not requests for the menu.
    if (before !== '' && !/\s/.test(before)) return null;
    return { from: typed.from + 1, options, validFor: /^\w*$/ };
  };

  return autocompletion({ override: [source], icons: false, selectOnOpen: true });
}
