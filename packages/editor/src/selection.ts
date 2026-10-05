import type { Extension, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';

class LineBreakWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-sl-selected-break';
    el.textContent = ' ';
    return el;
  }
}

const selected = Decoration.mark({ class: 'cm-sl-selected' });
const lineBreak = Decoration.widget({ widget: new LineBreakWidget(), side: 1 });

function build(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const out: Range<Decoration>[] = [];
  for (const range of view.state.selection.ranges) {
    if (range.empty) continue;
    for (const visible of view.visibleRanges) {
      const from = Math.max(range.from, visible.from);
      const to = Math.min(range.to, visible.to);
      for (let pos = from; pos <= to; ) {
        const line = doc.lineAt(pos);
        const end = Math.min(to, line.to);
        if (end > pos) out.push(selected.range(pos, end));
        if (range.to > line.to) out.push(lineBreak.range(line.to));
        pos = line.to + 1;
      }
    }
  }
  return Decoration.set(out, true);
}

/**
 * Draws the selection on the text itself, Sublime style: only selected characters are
 * highlighted and a selected line break shows as one extra cell, so an empty selected line is
 * visibly empty. The default full-width selection layer is hidden by the theme.
 */
export const textSelection: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged || update.viewportChanged) this.decorations = build(update.view);
    }
  },
  { decorations: (v) => v.decorations },
);
