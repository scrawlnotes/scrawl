import { syntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  type EditorState,
  type Extension,
  type Range,
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import type { SyntaxNode, Tree } from '@lezer/common';

export interface LivePreviewOptions {
  /** Maps an image source as written in the note to a URL the browser can load. */
  resolveImage?: (src: string) => string;
}

/** Source mode shows the note as plain Markdown: nothing is hidden or replaced. */
export const setSourceMode = StateEffect.define<boolean>();
export const sourceMode = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setSourceMode)) value = effect.value;
    return value;
  },
});

/**
 * How the cursor treats a piece of hidden syntax:
 * - `open` / `close`: the marks around inline formatting (`**`, `[`, `](url)`);
 * - `prefix`: a line-start mark with its space (`# `, `> `, `- `);
 * - `unit`: something replaced as a whole (an image, a rule).
 */
export type Role = 'open' | 'close' | 'prefix' | 'unit';

export interface RoleRange {
  from: number;
  to: number;
  role: Role;
  /** Start and end of the formatted span an `open` or `close` mark belongs to. */
  span?: { from: number; to: number };
}

/** One thing the preview does to a range: draw it differently, hide it, or treat it as a unit. */
export interface PreviewItem {
  from: number;
  to: number;
  deco?: Decoration;
  role?: Role;
  span?: { from: number; to: number };
}
type Item = PreviewItem;

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-sl-bullet';
    el.textContent = '•';
    return el;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-sl-hr';
    return el;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    /** Length of the Markdown source the widget stands for. */
    readonly length: number,
    readonly selected: boolean,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return (
      other.src === this.src && other.alt === this.alt && other.length === this.length && other.selected === this.selected
    );
  }
  toDOM(view: EditorView) {
    const img = document.createElement('img');
    img.className = this.selected ? 'cm-sl-img cm-sl-img-selected' : 'cm-sl-img';
    img.src = this.src;
    img.alt = this.alt;
    img.title = this.alt;
    img.draggable = false;
    // The image changes the line height once it loads.
    img.addEventListener('load', () => view.requestMeasure());
    // Clicking selects the whole image, so it can be copied, cut or deleted as one unit.
    img.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const from = view.posAtDOM(img);
      view.dispatch({ selection: EditorSelection.range(from, from + this.length) });
      view.focus();
    });
    return img;
  }
  ignoreEvent() {
    return true;
  }
}

// `kind` is not used by CodeMirror; it names the decoration for tests and debugging.
const hide = Decoration.replace({ kind: 'hide' });
const syntax = Decoration.mark({ class: 'cm-sl-syntax', kind: 'syntax' });
const bullet = Decoration.replace({ widget: new BulletWidget(), kind: 'bullet' });
const rule = Decoration.replace({ widget: new RuleWidget(), kind: 'rule' });
const quoteLine = Decoration.line({ class: 'cm-sl-quote', kind: 'quote' });
const tableLine = Decoration.line({ class: 'cm-sl-table', kind: 'table' });
const tableHeader = Decoration.mark({ class: 'cm-sl-th', kind: 'th' });

const inlineMarks: Record<string, { kind: string; mark: string }> = {
  StrongEmphasis: { kind: 'strong', mark: 'EmphasisMark' },
  Emphasis: { kind: 'em', mark: 'EmphasisMark' },
  Strikethrough: { kind: 'strike', mark: 'StrikethroughMark' },
  InlineCode: { kind: 'code', mark: 'CodeMark' },
};

/** Walks the syntax tree and lists what the live preview draws, hides and treats as a unit. */
function collect(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
  options: LivePreviewOptions,
  tree: Tree,
): Item[] {
  if (state.field(sourceMode, false)) return [];
  const doc = state.doc;
  const out: Item[] = [];
  // Marks such as `#` and `>` are followed by a space that belongs to the syntax.
  const withSpace = (to: number) => (doc.sliceString(to, to + 1) === ' ' ? to + 1 : to);
  const lineDecos = (from: number, to: number, deco: Decoration) => {
    const last = doc.lineAt(to).number;
    for (let n = doc.lineAt(from).number; n <= last; n++) {
      const at = doc.line(n).from;
      out.push({ from: at, to: at, deco });
    }
  };
  const hidden = (from: number, to: number, role: Role, span?: SyntaxNode) => {
    if (to > from) out.push({ from, to, deco: hide, role, span: span && { from: span.from, to: span.to } });
  };

  const link = (node: SyntaxNode) => {
    const [open, close] = node.getChildren('LinkMark');
    if (!open || !close) return;
    const url = node.getChild('URL');
    const href = url ? doc.sliceString(url.from, url.to) : '';
    if (close.from > open.to) {
      const deco = Decoration.mark({ class: 'cm-sl-link', attributes: { 'data-href': href, title: href }, kind: 'link' });
      out.push({ from: open.to, to: close.from, deco });
    }
    hidden(node.from, open.to, 'open', node);
    hidden(close.from, node.to, 'close', node);
  };

  const image = (node: SyntaxNode) => {
    const [open, close] = node.getChildren('LinkMark');
    const url = node.getChild('URL');
    if (!open || !close || !url) return;
    const src = doc.sliceString(url.from, url.to);
    const alt = doc.sliceString(open.to, close.from);
    const isSelected = state.selection.ranges.some((r) => !r.empty && r.from <= node.from && r.to >= node.to);
    const widget = new ImageWidget(options.resolveImage?.(src) ?? src, alt, node.to - node.from, isSelected);
    out.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget, kind: 'image', alt }), role: 'unit' });
  };

  for (const { from, to } of ranges) {
    tree.iterate({
      from,
      to,
      enter: (ref) => {
        const name = ref.name;

        const heading = /^ATXHeading([1-6])$/.exec(name);
        if (heading) {
          const at = doc.lineAt(ref.from).from;
          const level = heading[1];
          out.push({ from: at, to: at, deco: Decoration.line({ class: `cm-sl-h cm-sl-h${level}`, kind: `h${level}` }) });
          return;
        }
        if (name === 'HeaderMark') {
          const parent = ref.node.parent;
          if (!parent?.name.startsWith('ATXHeading')) return;
          // The leading mark is a prefix; a closing `#` run is simply hidden.
          if (ref.from === parent.from) hidden(ref.from, withSpace(ref.to), 'prefix');
          else out.push({ from: ref.from, to: ref.to, deco: hide });
          return;
        }

        if (name === 'Escape') {
          // `\*` shows as `*`. The pair is one unit, so the character and its backslash go together.
          out.push({ from: ref.from, to: ref.from + 1, deco: hide });
          out.push({ from: ref.from, to: ref.to, role: 'unit' });
          return;
        }

        if (name === 'Table') {
          // A top-level table is drawn as a grid by `tableGrid`; nothing inside it is decorated here.
          if (ref.node.parent?.name === 'Document') return false;
          lineDecos(ref.from, ref.to, tableLine);
          return;
        }
        if (name === 'TableHeader') {
          out.push({ from: ref.from, to: ref.to, deco: tableHeader });
          return;
        }
        if (name === 'TableDelimiter') {
          out.push({ from: ref.from, to: ref.to, deco: syntax });
          return;
        }

        const inline = inlineMarks[name];
        if (inline) {
          out.push({
            from: ref.from,
            to: ref.to,
            deco: Decoration.mark({ class: `cm-sl-${inline.kind}`, kind: inline.kind }),
          });
          const marks = ref.node.getChildren(inline.mark);
          const open = marks[0];
          const close = marks[marks.length - 1];
          if (open && close && open !== close) {
            hidden(open.from, open.to, 'open', ref.node);
            hidden(close.from, close.to, 'close', ref.node);
          }
          return;
        }

        if (name === 'Link') {
          link(ref.node);
          return;
        }
        if (name === 'Image') {
          image(ref.node);
          return false;
        }

        if (name === 'ListMark') {
          const item = ref.node.parent;
          // GFM task items stay as written; tasks live in their own module.
          if (item?.getChild('Task')) {
            out.push({ from: ref.from, to: ref.to, deco: syntax });
            return;
          }
          const isBullet = item?.parent?.name === 'BulletList';
          out.push({ from: ref.from, to: ref.to, deco: isBullet ? bullet : syntax });
          out.push({ from: ref.from, to: withSpace(ref.to), role: 'prefix' });
          return;
        }

        if (name === 'Blockquote') {
          lineDecos(ref.from, ref.to, quoteLine);
          return;
        }
        if (name === 'QuoteMark') {
          hidden(ref.from, withSpace(ref.to), 'prefix');
          return;
        }

        if (name === 'HorizontalRule') {
          out.push({ from: ref.from, to: ref.to, deco: rule, role: 'unit' });
          return;
        }

        if (name === 'FencedCode') {
          const first = doc.lineAt(ref.from).number;
          const last = doc.lineAt(ref.to).number;
          for (let n = first; n <= last; n++) {
            const edge = n === first ? ' cm-sl-codeblock-first' : n === last ? ' cm-sl-codeblock-last' : '';
            const at = doc.line(n).from;
            out.push({ from: at, to: at, deco: Decoration.line({ class: `cm-sl-codeblock${edge}`, kind: 'codeblock' }) });
          }
          return;
        }
        if (name === 'CodeMark' || name === 'CodeInfo') {
          if (ref.node.parent?.name === 'FencedCode') out.push({ from: ref.from, to: ref.to, deco: syntax });
          return;
        }
      },
    });
  }
  return out;
}

/**
 * Builds the live preview decorations for the given ranges: formatting is shown in place and
 * the Markdown syntax around it is hidden. Syntax is never revealed by the cursor, so moving
 * through the note does not shift the text; source mode shows the Markdown instead.
 */
export function buildDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
  options: LivePreviewOptions = {},
  tree: Tree = syntaxTree(state),
): DecorationSet {
  const decos: Range<Decoration>[] = [];
  for (const item of collect(state, ranges, options, tree)) if (item.deco) decos.push(item.deco.range(item.from, item.to));
  return Decoration.set(decos, true);
}

/** Everything the preview does between `from` and `to`. */
export function previewItems(state: EditorState, from: number, to: number, tree: Tree = syntaxTree(state)): PreviewItem[] {
  return collect(state, [{ from, to }], {}, tree);
}

/** The hidden syntax between `from` and `to`, with the role each piece plays for the cursor. */
export function roleRanges(state: EditorState, from: number, to: number, tree: Tree = syntaxTree(state)): RoleRange[] {
  const out: RoleRange[] = [];
  for (const item of collect(state, [{ from, to }], {}, tree)) {
    if (item.role) out.push({ from: item.from, to: item.to, role: item.role, span: item.span });
  }
  return out;
}

class Atomic extends RangeValue {}
const atomic = new Atomic();

/** Ctrl/Cmd+click on a rendered link opens it. */
const followLinks = EditorView.domEventHandlers({
  mousedown(event) {
    if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof HTMLElement)) return false;
    const href = event.target.closest<HTMLElement>('.cm-sl-link')?.dataset.href;
    if (!href || !/^(https?:|mailto:)/i.test(href)) return false;
    window.open(href, '_blank', 'noopener');
    event.preventDefault();
    return true;
  },
});

export function livePreview(options: LivePreviewOptions = {}): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations!: DecorationSet;
      atomic!: RangeSet<Atomic>;
      constructor(view: EditorView) {
        this.build(view);
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.startState.field(sourceMode) !== update.state.field(sourceMode) ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.build(update.view);
        }
      }
      build(view: EditorView) {
        const items = collect(view.state, view.visibleRanges, options, syntaxTree(view.state));
        const decos: Range<Decoration>[] = [];
        const units: Range<Atomic>[] = [];
        for (const item of items) {
          if (item.deco) decos.push(item.deco.range(item.from, item.to));
          if (item.role && item.to > item.from) units.push(atomic.range(item.from, item.to));
        }
        this.decorations = Decoration.set(decos, true);
        // The cursor steps over hidden syntax instead of stopping inside it.
        this.atomic = RangeSet.of(units, true);
      }
    },
    { decorations: (v) => v.decorations },
  );
  const atomicRanges = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? RangeSet.empty);
  return [sourceMode, plugin, atomicRanges, followLinks];
}
