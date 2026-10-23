import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, Facet, type Range, RangeSet, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { t } from '@scrawlnotes/i18n';
import { CALLOUT_TYPES, type Callout, calloutAt, calloutSvg, type CalloutType, changeCallout, findCallouts, removeCallout, setCallout } from './callout';
import { sourceMode } from './livePreview';
import type { ItemAction, MediaOptions } from './media';

/** How the host shows a menu; the same as an image's. */
const menuFacet = Facet.define<NonNullable<MediaOptions['showMenu']>, MediaOptions['showMenu']>({ combine: (values) => values[0] });

/**
 * The five kinds and, for a callout, Remove callout: the menu of a callout's title and of the
 * format bar's Callout. With `at`, it is the menu of the callout whose marker line starts there;
 * without, of the cursor's place. `focus` gives the keyboard back to the note after a choice.
 */
export function calloutActions(view: EditorView, at?: number, focus = false): ItemAction[] {
  const current = at === undefined ? calloutAt(view.state, view.state.selection.main.head) : findCallouts(view.state).find((c) => c.from === at) ?? null;
  const done = () => {
    if (focus) view.focus();
  };
  const actions: ItemAction[] = CALLOUT_TYPES.map((type) => ({
    kind: type,
    label: t(`callout.${type}`),
    on: current?.type === type,
    run: () => {
      if (current) changeCallout(current.from, type)(view);
      else setCallout(type)(view);
      done();
    },
  }));
  if (current) {
    actions.push({
      kind: 'removeCallout',
      label: t('callout.remove'),
      run: () => {
        removeCallout(current.from)(view);
        done();
      },
    });
  }
  return actions;
}

/** A callout's first line, drawn as its title: its kind's icon and name, which open its menu. */
class TitleWidget extends WidgetType {
  constructor(readonly type: CalloutType) {
    super();
  }
  eq(other: TitleWidget) {
    return other.type === this.type;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = `cm-sl-callout-title cm-sl-callout-${this.type}`;
    const button = wrap.appendChild(document.createElement('button'));
    button.type = 'button';
    button.className = 'cm-sl-callout-kind';
    button.innerHTML = `${calloutSvg(this.type)}<span>${t(`callout.${this.type}`)}</span>`;
    const menu = view.state.facet(menuFacet);
    if (view.state.readOnly || !menu) {
      button.disabled = true;
      return wrap;
    }
    button.title = t('callout.change');
    // Pressing it leaves the cursor and the keyboard as they were.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', () => {
      const box = button.getBoundingClientRect();
      menu({ x: box.left, y: box.bottom + 4 }, calloutActions(view, view.posAtDOM(wrap)));
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

interface Drawn {
  decorations: DecorationSet;
  /** The marker lines, which the cursor steps over. */
  titles: RangeSet<Decoration>;
}

function build(state: EditorState): Drawn {
  if (state.field(sourceMode, false)) return { decorations: Decoration.none, titles: RangeSet.empty };
  const out: Range<Decoration>[] = [];
  const titles: Range<Decoration>[] = [];
  const doc = state.doc;
  for (const callout of findCallouts(state)) {
    const title = Decoration.replace({ widget: new TitleWidget(callout.type), block: true, kind: 'callout-title' }).range(callout.title.from, callout.title.to);
    out.push(title);
    titles.push(title);
    const last = doc.lineAt(callout.to).number;
    for (let n = doc.lineAt(callout.title.from).number + 1; n <= last; n++) {
      const edge = n === last ? ' cm-sl-callout-last' : '';
      out.push(Decoration.line({ class: `cm-sl-callout cm-sl-callout-${callout.type}${edge}`, kind: 'callout' }).range(doc.line(n).from));
    }
  }
  return { decorations: Decoration.set(out, true), titles: RangeSet.of(titles, true) };
}

const calloutField = StateField.define<Drawn>({
  create: build,
  update(value, tr) {
    const changed =
      tr.docChanged ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
      tr.startState.field(sourceMode, false) !== tr.state.field(sourceMode, false);
    return changed ? build(tr.state) : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (drawn) => drawn.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).titles),
  ],
});

/** The callouts of a note, for tests: their titles and lines. */
export const calloutDecorations = (state: EditorState) => state.field(calloutField).decorations;

/**
 * A cursor on a title's edge, as when a note that starts with a callout opens, would be drawn as
 * tall as the title; it is not drawn. What is typed there goes into the callout's text (cursor.ts).
 */
const hideTitleCursor = EditorView.editorAttributes.compute([calloutField, 'selection'], (state) => {
  const head = state.selection.main.head;
  let onEdge = false;
  state.field(calloutField).titles.between(head, head, (from, to) => {
    if (head === from || head === to) onEdge = true;
  });
  return { class: onEdge ? 'cm-sl-cursor-on-table' : '' };
});

/**
 * Draws callouts as boxes of their kind's colour, with a title that changes the kind. `showMenu`
 * is how the host draws the title's menu; without it the title opens none.
 */
export function calloutBlocks(options: { showMenu?: MediaOptions['showMenu'] } = {}): Extension {
  return [calloutField, hideTitleCursor, options.showMenu ? menuFacet.of(options.showMenu) : []];
}

export type { Callout };
