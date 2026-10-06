import { addCursorBelow, defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
  selectNextOccurrence,
  selectSelectionMatches,
} from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { clipboard, visibleText } from './clipboard';
import {
  formatKeymap,
  insertDivider,
  insertTable,
  toggleCodeBlock,
  toggleHeading,
  toggleLinePrefix,
} from './commands';
import { findPanel } from './find';
import { linkAddress, linkPaste, linkText } from './links';
import { cursorBehavior } from './cursor';
import { literalInput } from './literal';
import { livePreview, type LivePreviewOptions, setSourceMode, sourceMode } from './livePreview';
import { textSelection } from './selection';
import { type SlashItem, slashMenu } from './slash';
import { enterTable, tableGrid, tableRanges } from './table';
import { scrawlTheme } from './theme';

export { clipboard, markdownSlice, visibleText } from './clipboard';
export * from './commands';
export { addCursorBelow, selectNextOccurrence, selectSelectionMatches };
export { literalPattern } from './find';
export { linkAddress, linkText, linkTitleChange, pastedLink, pastedUrl } from './links';
export { cursorBehavior, restingPosition } from './cursor';
export { buildDecorations, livePreview, type LivePreviewOptions, setSourceMode, sourceMode } from './livePreview';
export { literalInput, positionsToEscape } from './literal';
export { textSelection } from './selection';
export { cellMarkdown, parseTable, serializeTable, tableGrid } from './table';
export { scrawlTheme } from './theme';
export type { EditorState } from '@codemirror/state';

/** Counts are of the text as it reads on screen: hidden Markdown syntax is not counted. */
export interface EditorStats {
  line: number;
  col: number;
  /** Characters in the note. */
  chars: number;
  /** Characters in the selection, summed over all cursors. */
  selectedChars: number;
  /** Lines the main selection spans. */
  selectedLines: number;
  cursors: number;
}

export interface ScrawlEditorOptions extends LivePreviewOptions {
  parent: HTMLElement;
  doc?: string;
  onChange?: (doc: string) => void;
  onStats?: (stats: EditorStats) => void;
  /** Stores a pasted or dropped image and returns the source to write into the note. */
  saveImage?: (file: File) => Promise<string>;
  /** Stores a pasted or dropped file that is not an image, and returns its path in the vault. */
  saveFile?: (file: File) => Promise<string>;
  /** Starts recording from the microphone, for the `/` menu. */
  record?: () => void;
  /** A web address was pasted as a link with the address as its text; see `linkTitleChange`. */
  onLinkPasted?: (url: string) => void;
}

export interface ScrawlEditor {
  view: EditorView;
  /** A fresh editing state for a note. Each open tab keeps its own, with its undo history. */
  createState(doc: string): EditorState;
  /** Shows another note in the editor. The current state is `view.state`. */
  setState(state: EditorState): void;
  /** Shows the note as plain Markdown instead of the formatted preview. */
  setSourceMode(on: boolean): void;
  destroy(): void;
}

function statsOf(state: EditorState, chars: number): EditorStats {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.head);
  return {
    line: line.number,
    col: visibleText(state, line.from, main.head).length + 1,
    chars,
    selectedChars: state.selection.ranges.reduce((sum, r) => sum + visibleText(state, r.from, r.to).length, 0),
    selectedLines: state.doc.lineAt(main.to).number - state.doc.lineAt(main.from).number + 1,
    cursors: state.selection.ranges.length,
  };
}

const isImage = (file: File) => file.type.startsWith('image/');

/**
 * Pasted and dropped files are stored and inserted where they land: images through `saveImage`
 * as Markdown images, other files through `saveFile` as links, which show as attached files.
 * Without a place to store a kind of file, that kind is left to the browser.
 */
function fileInput(saveImage?: (file: File) => Promise<string>, saveFile?: (file: File) => Promise<string>) {
  const accepted = (list: FileList | undefined | null) =>
    [...(list ?? [])].filter((file) => (isImage(file) ? saveImage : saveFile));
  const insert = async (view: EditorView, files: File[], at?: number) => {
    const pieces = await Promise.all(
      files.map(async (file) =>
        isImage(file) ? `![](${await saveImage!(file)})` : `[${linkText(file.name)}](${linkAddress(await saveFile!(file))})`,
      ),
    );
    const text = pieces.join('\n');
    const range = at === undefined ? view.state.selection.main : { from: at, to: at };
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length },
      scrollIntoView: true,
      // Not `input.paste`: the syntax is ours and must not be escaped as typed text.
      userEvent: 'input.image',
    });
  };
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = accepted(event.clipboardData?.files);
      if (!files.length) return false;
      event.preventDefault();
      void insert(view, files);
      return true;
    },
    drop(event, view) {
      const files = accepted(event.dataTransfer?.files);
      if (!files.length) return false;
      event.preventDefault();
      void insert(view, files, view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined);
      return true;
    },
  });
}

// Pasted addresses are made into links by `linkPaste`, which writes the syntax so that it is not
// escaped as typed text; the language's own version of that is left out.
const markdownSupport = markdown({ base: markdownLanguage, codeLanguages: languages, pasteURLAsLink: false });

export interface ScrawlViewer {
  /** Shows another text, from the top. */
  show(doc: string): void;
  destroy(): void;
}

/** A note as it reads in the editor, without editing: for looking at an earlier version. */
export function createViewer(options: LivePreviewOptions & { parent: HTMLElement; doc?: string }): ScrawlViewer {
  const extensions = [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    markdownSupport,
    livePreview(options),
    tableGrid,
    scrawlTheme,
  ];
  const view = new EditorView({ parent: options.parent, state: EditorState.create({ doc: options.doc ?? '', extensions }) });
  return {
    show(doc) {
      view.setState(EditorState.create({ doc, extensions }));
      view.scrollDOM.scrollTop = 0;
    },
    destroy: () => view.destroy(),
  };
}

export function createEditor(options: ScrawlEditorOptions): ScrawlEditor {
  // The note's length is recounted only when its text or the view mode changes, not on every cursor move.
  let counted: { doc: unknown; source: boolean; chars: number } | null = null;
  const stats = (state: EditorState) => {
    const source = state.field(sourceMode);
    if (counted?.doc !== state.doc || counted.source !== source) {
      counted = { doc: state.doc, source, chars: visibleText(state, 0, state.doc.length).length };
    }
    return statsOf(state, counted.chars);
  };
  /** Inserts a table and starts typing in its first cell. */
  const addTable = (view: EditorView) => {
    insertTable(view);
    const end = view.state.selection.main.head;
    const table = tableRanges(view.state).find((t) => t.to === end);
    if (table) enterTable(view, table.from);
  };
  const saveImage = options.saveImage;
  const record = options.record;
  const slashItems: SlashItem[] = [
    { label: 'Heading 1', run: toggleHeading(1) },
    { label: 'Heading 2', run: toggleHeading(2) },
    { label: 'Heading 3', run: toggleHeading(3) },
    { label: 'Bullet list', run: toggleLinePrefix('list') },
    { label: 'Quote', run: toggleLinePrefix('quote') },
    { label: 'Code block', run: toggleCodeBlock },
    { label: 'Table', run: addTable },
    { label: 'Divider', run: insertDivider },
  ];
  if (record) slashItems.push({ label: 'Audio recording', detail: 'from the microphone', run: () => record() });
  if (saveImage) {
    slashItems.push({
      label: 'Image',
      detail: 'from a file',
      run(view) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          const src = await saveImage(file);
          view.dispatch(view.state.replaceSelection(`![](${src})`), { scrollIntoView: true, userEvent: 'input.image' });
          view.focus();
        });
        input.click();
      },
    });
  }

  const createState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        textSelection,
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        search({ top: false, createPanel: findPanel }),
        EditorView.lineWrapping,
        markdownSupport,
        livePreview(options),
        tableGrid,
        slashMenu(slashItems),
        cursorBehavior,
        clipboard,
        linkPaste(options.onLinkPasted),
        fileInput(options.saveImage, options.saveFile),
        scrawlTheme,
        keymap.of([...formatKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          // `view.state`, not `update.state`: another listener may have changed the note again from
          // inside this update, and the text to save is the newest one.
          if (update.docChanged) options.onChange?.(update.view.state.doc.toString());
          const modeChanged = update.startState.field(sourceMode) !== update.state.field(sourceMode);
          if (update.docChanged || update.selectionSet || modeChanged) options.onStats?.(stats(update.view.state));
        }),
        // Last on purpose: it changes the note again from inside an update. Any listener after it
        // would then be called with the older text after the newer one, and save the older.
        literalInput(),
      ],
    });
  const view = new EditorView({ parent: options.parent, state: createState(options.doc ?? '') });
  options.onStats?.(stats(view.state));

  return {
    view,
    createState,
    setState(state) {
      view.setState(state);
      options.onStats?.(stats(state));
    },
    setSourceMode: (on) => view.dispatch({ effects: setSourceMode.of(on) }),
    destroy: () => view.destroy(),
  };
}
