import { syntaxTree } from '@codemirror/language';
import {
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
import { t } from '@scrawlnotes/i18n';
import { linkUrl } from './commands';
import { attachmentOf, AudioWidget, FileWidget, isAudio, ItemWidget, type MediaOptions, selectWidget } from './media';

export interface LivePreviewOptions extends MediaOptions {
  /**
   * Maps an image source as written in the note to a URL the browser can load, at once or once
   * the image is read.
   */
  resolveImage?: (src: string) => string | Promise<string>;
  /** Opens a web or mail address of the note. Without it, the browser opens it in a new tab. */
  openLink?: (href: string) => void;
}

const openInBrowser = (href: string) => void window.open(href, '_blank', 'noopener');

/**
 * An image finished loading, so its line is taller now. The editor measures its lines again only
 * when something in it is drawn anew, or when it grows; a short note does not grow, as it is
 * already as tall as the window. So each load draws the images anew, keeping their elements.
 */
const imageLoaded = StateEffect.define<null>();

/** Files of the note came back, from the trash for example: its images, files and recordings are drawn anew. */
export const mediaChanged = StateEffect.define<null>();

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

/** An image in a note. A click selects it, a double click opens it. */
class ImageWidget extends ItemWidget {
  protected override rootClass = 'cm-sl-img-wrap';
  protected readonly selectedClass = 'cm-sl-img-selected';

  constructor(
    /** The source as the note has it. */
    src: string,
    readonly alt: string,
    length: number,
    selected: boolean,
    active: boolean,
    readonly preview: LivePreviewOptions,
    version: number,
    /** How many images had loaded in the editor when it was made; see `imageLoaded`. */
    readonly loads: number,
  ) {
    super(src, length, selected, active, preview, version);
  }
  protected key() {
    return `${this.src}\n${this.alt}\n${this.length}`;
  }
  override eq(other: ImageWidget) {
    return super.eq(other) && other.loads === this.loads;
  }
  protected file() {
    return attachmentOf(this.src);
  }
  /**
   * The bar sits in the image's top right corner. An image narrower than the bar has it from its
   * left edge instead, so that none of it goes under the line numbers.
   */
  protected override placeBar(view: EditorView, root: HTMLElement, bar: HTMLElement) {
    view.requestMeasure({
      read: () => bar.offsetWidth + 16 > root.clientWidth,
      write: (narrow) => bar.classList.toggle('cm-sl-itembar-start', narrow),
    });
  }
  protected opener() {
    const file = this.file();
    const { openFile, openLink = openInBrowser } = this.preview;
    if (file) return openFile ? () => openFile(file) : null;
    return /^https?:/i.test(this.src) ? () => openLink(this.src) : null;
  }
  protected body(view: EditorView, root: HTMLElement) {
    const img = document.createElement('img');
    img.className = 'cm-sl-img';
    // Large images are read when they come into view and decoded aside, so typing never waits on them.
    img.loading = 'lazy';
    img.decoding = 'async';
    const url = this.preview.resolveImage?.(this.src) ?? this.src;
    if (typeof url === 'string') img.src = url;
    else void url.then((resolved) => (img.src = resolved), () => undefined);
    img.alt = this.alt;
    img.title = this.alt;
    // The image changes the line height once it loads.
    img.addEventListener('load', () => {
      if (img.isConnected) view.dispatch({ effects: imageLoaded.of(null) });
    });
    img.addEventListener('click', () => selectWidget(view, root, this.length));
    img.addEventListener('dblclick', () => this.opener()?.());
    return img;
  }
}

const icon = (paths: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const COPY_ICON = icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>');
const COPIED_ICON = icon('<path d="m5 12.5 4.5 4.5L19 7.5"/>');

/** Puts text on the clipboard. Where the clipboard API is not allowed, the older copy command still works inside a click. */
function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text).catch(() => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position: fixed; opacity: 0; pointer-events: none';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    focused?.focus();
    if (!copied) throw new Error(t('error.clipboard'));
  });
}

/** The button in the corner of a code block that copies the code, without the fences. */
class CopyWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }
  eq(other: CopyWidget) {
    return other.code === this.code;
  }
  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-sl-copy';
    button.title = t('editor.copyCode');
    button.setAttribute('aria-label', t('editor.copyCode'));
    button.innerHTML = COPY_ICON;
    // Pressing the button leaves the cursor where it was.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      copyText(this.code).then(
        () => {
          button.innerHTML = COPIED_ICON;
          button.classList.add('cm-sl-copied');
          window.setTimeout(() => {
            button.innerHTML = COPY_ICON;
            button.classList.remove('cm-sl-copied');
          }, 1200);
        },
        // Nothing was copied, so the button does not say it was.
        () => undefined,
      );
    });
    return button;
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
  drawn = { loads: 0, version: 0 },
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

  // An image, file or recording is selected when a selection covers it; it is the active one when
  // the selection is that item alone.
  const { ranges: selection, main } = state.selection;
  const selected = (node: SyntaxNode) => selection.some((r) => !r.empty && r.from <= node.from && r.to >= node.to);
  const active = (node: SyntaxNode) => selection.length === 1 && main.from === node.from && main.to === node.to;

  /** Returns false for a link to an attachment, which is drawn as a whole and has nothing inside to decorate. */
  const link = (node: SyntaxNode): false | undefined => {
    const [open, close] = node.getChildren('LinkMark');
    if (!open || !close) return;
    const url = linkUrl(node);
    const href = url ? doc.sliceString(url.from, url.to) : '';
    const src = attachmentOf(href);
    if (src) {
      // The link text as it reads: escapes are typed characters.
      const label = doc.sliceString(open.to, close.from).replace(/\\([!-/:-@[-`{-~])/g, '$1') || src.slice(src.lastIndexOf('/') + 1);
      const length = node.to - node.from;
      const widget = isAudio(src)
        ? new AudioWidget(src, label, length, selected(node), active(node), options, drawn.version)
        : new FileWidget(src, label, length, selected(node), active(node), options, drawn.version);
      out.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget, kind: 'attachment', label }), role: 'unit' });
      return false;
    }
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
    const widget = new ImageWidget(src, alt, node.to - node.from, selected(node), active(node), options, drawn.version, drawn.loads);
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

        if (name === 'Link') return link(ref.node);
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
          const text = ref.node.getChild('CodeText');
          const end = doc.line(first).to;
          const widget = new CopyWidget(text ? doc.sliceString(text.from, text.to) : '');
          out.push({ from: end, to: end, deco: Decoration.widget({ widget, side: 1, kind: 'copy' }) });
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
const followLinks = (open: (href: string) => void) =>
  EditorView.domEventHandlers({
    mousedown(event) {
      if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof HTMLElement)) return false;
      const href = event.target.closest<HTMLElement>('.cm-sl-link')?.dataset.href;
      if (!href || !/^(https?:|mailto:)/i.test(href)) return false;
      open(href);
      event.preventDefault();
      return true;
    },
  });

export function livePreview(options: LivePreviewOptions = {}): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations!: DecorationSet;
      atomic!: RangeSet<Atomic>;
      drawn = { loads: 0, version: 0 };
      constructor(view: EditorView) {
        this.build(view);
      }
      update(update: ViewUpdate) {
        const has = (type: typeof imageLoaded) => update.transactions.some((tr) => tr.effects.some((e) => e.is(type)));
        const loaded = has(imageLoaded);
        const changed = has(mediaChanged);
        if (loaded || changed) {
          this.drawn = { loads: this.drawn.loads + (loaded ? 1 : 0), version: this.drawn.version + (changed ? 1 : 0) };
        }
        if (
          loaded ||
          changed ||
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
        const items = collect(view.state, view.visibleRanges, options, syntaxTree(view.state), this.drawn);
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
  return [sourceMode, plugin, atomicRanges, followLinks(options.openLink ?? openInBrowser)];
}
