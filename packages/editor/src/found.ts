import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

// What the search window found, shown in the note once it is open: the words marked where they
// were found, that place brought to the middle of the screen and the cursor put before them,
// without taking the keyboard. The marks go with the first change or the first click.

const markFound = StateEffect.define<{ from: number; to: number }[]>();
const found = Decoration.mark({ class: 'cm-sl-found' });

export const foundField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    for (const effect of tr.effects) {
      if (effect.is(markFound)) return Decoration.set(effect.value.map((span) => found.range(span.from, span.to)), true);
    }
    if (tr.docChanged || tr.isUserEvent('select')) return Decoration.none;
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Marks the words found at `spans` in the note on screen, and brings the first of them into sight. */
export function showFound(view: EditorView, spans: [number, number][]) {
  const length = view.state.doc.length;
  const marks = spans
    .map(([from, to]) => ({ from: Math.min(from, length), to: Math.min(to, length) }))
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from);
  const first = marks[0];
  if (!first) return;
  view.dispatch({
    selection: { anchor: first.from },
    effects: [markFound.of(marks), EditorView.scrollIntoView(first.from, { y: 'center' })],
  });
}
