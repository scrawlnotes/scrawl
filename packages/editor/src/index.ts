import { addCursorBelow, defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import {
  closeSearchPanel,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
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
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import { t } from '@scrawlnotes/i18n';
import { clipboard, visibleText } from './clipboard';
import { copiesField } from './copies';
import {
  formatKeymap,
  insertDivider,
  insertTable,
  toggleCodeBlock,
  toggleHeading,
  toggleLinePrefix,
  toggleList,
} from './commands';
import { findPanel } from './find';
import { foundField } from './found';
import { attachmentChanges, widgetMoves } from './media';
import { linkPaste } from './links';
import { cursorBehavior } from './cursor';
import { wordCount } from './words';
import { keepDividers, literalInput } from './literal';
import { livePreview, type LivePreviewOptions, mediaChanged, setSourceMode, sourceMode } from './livePreview';
import { textSelection } from './selection';
import { type SlashItem, slashMenu } from './slash';
import { enterTable, tableGrid, tableRanges } from './table';
import { scrawlTheme } from './theme';

export { clipboard, markdownSlice, visibleText } from './clipboard';
export * from './commands';
export { addCursorBelow, closeSearchPanel, openSearchPanel, redo, searchPanelOpen, selectNextOccurrence, selectSelectionMatches, undo };
export { createEnvEditor, type EnvEditor } from './env';
export { createRulesEditor, type RulesEditor, type RulesProblem } from './rules';
export { literalPattern } from './find';
export { showFound } from './found';
export { exportHtml, fontRuns, type OutFile, type OutFiles, PDF_WIDTH, pdfContent, type PdfFonts, type PdfNode, titled } from './export';
export { addCopy, type Copy, copyFollows, copyPosition, copyProgress, dropCopy, progressText, showCopy } from './copies';
export { linkAddress, linkText, pastedLink, pastedUrl } from './links';
export { cursorBehavior, restingPosition } from './cursor';
export { wordCount } from './words';
export { attachmentChanges, attachmentsIn, type ItemAbout, type ItemAction, sizeText } from './media';
export { buildDecorations, type LinkTap, livePreview, type LivePreviewOptions, setSourceMode, sourceMode } from './livePreview';
export { literalInput, positionsToEscape } from './literal';
export { textSelection } from './selection';
export { cellMarkdown, parseTable, serializeTable, tableGrid } from './table';
export { scrawlTheme } from './theme';
export type { EditorState, TransactionSpec } from '@codemirror/state';

/** Counts are of the text as it reads on screen: hidden Markdown syntax is not counted. */
export interface EditorStats {
  line: number;
  col: number;
  /** Characters in the note. */
  chars: number;
  /** Words in the note. */
  words: number;
  /** Characters in the selection, summed over all cursors. */
  selectedChars: number;
  /** Words in the selection, summed over all cursors. */
  selectedWords: number;
  /** Lines the main selection spans. */
  selectedLines: number;
  cursors: number;
}

export interface ScrawlEditorOptions extends LivePreviewOptions {
  parent: HTMLElement;
  doc?: string;
  onChange?: (doc: string) => void;
  onStats?: (stats: EditorStats) => void;
  /**
   * Files were pasted, dropped or picked to go in the note at `at`. The host copies them, shows
   * them meanwhile with `addCopy`, and puts them in the note when they are there.
   */
  addFiles?: (files: File[], at: number) => void;
  /** Files copied in the system that a paste did not carry: a computer's app reads them from its clipboard. */
  pastedFiles?: () => Promise<File[]>;
  /** A paste that carried nothing the note takes, no text and no file: a file copied in a folder, in a browser. */
  onEmptyPaste?: () => void;
  /** Starts recording from the microphone, for the `/` menu. */
  record?: () => void;
  /** The note stopped linking to some attached files, or started linking to them, as an edit or undo did. */
  onAttachments?: (removed: string[], added: string[]) => void;
  /** What an empty note shows until something is written in it. */
  placeholder?: (view: EditorView) => HTMLElement;
}

export type { EditorView };

/**
 * Brings the cursor of the editor `dom` is in into what is in sight, a little away from the edge:
 * on a phone, after the keyboard came up over it. False when `dom` is in no editor.
 */
export function revealCursor(dom: Element): boolean {
  const editor = dom.closest<HTMLElement>('.cm-editor');
  const view = editor && EditorView.findFromDOM(editor);
  if (!view) return false;
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'nearest', yMargin: 56 }) });
  return true;
}

/** Where a note was scrolled to in the editor. */
/** Where a note was scrolled to in the editor: the line at its top, and how far into it. */
export type ScrollPlace = ReturnType<EditorView['scrollSnapshot']>;

export interface ScrawlEditor {
  view: EditorView;
  /** A fresh editing state for a note. Each open tab keeps its own, with its undo history. */
  createState(doc: string): EditorState;
  /**
   * Shows another note in the editor, scrolled to `place` when it was open before, else at its
   * top. The current state is `view.state`.
   */
  setState(state: EditorState, place?: ScrollPlace): void;
  /** Where the note shown is scrolled to, for `setState` to come back to. */
  scrollPlace(): ScrollPlace;
  /** Shows the note as plain Markdown instead of the formatted preview. */
  setSourceMode(on: boolean): void;
  /** Draws the note's images, files and recordings anew, after files of it came back. */
  refreshMedia(): void;
  destroy(): void;
}

/** The icons of the `/` menu on a touch screen. */
const SLASH_ICONS = {
  list: '<path d="M10 6.5h10M10 12h10M10 17.5h10"/><circle cx="5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="17.5" r="1.3" fill="currentColor" stroke="none"/>',
  ordered: '<path d="M10.5 6.5h9.5M10.5 12h9.5M10.5 17.5h9.5"/><path d="M4.4 5.2 5.6 4.4v4.2"/><path d="M4.2 10.9c.3-.6 2.1-.8 2.1.4 0 .9-2.1 1.7-2.1 2.9h2.3"/><path d="M4.3 16h2l-1 1.3c.7 0 1.2.4 1.2 1s-.6 1.2-1.3 1.2c-.4 0-.8-.2-1-.4"/>',
  quote: '<path d="M5.5 5v14"/><path d="M10 8h9M10 12h9M10 16h6"/>',
  codeBlock: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 9.5L7 12l2.5 2.5M14.5 9.5L17 12l-2.5 2.5"/>',
  table: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 10h17M3.5 14.5h17M9.5 5v14M15 5v14"/>',
  divider: '<path d="M4 12h16"/>',
  audio: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L20 18"/>',
};

function statsOf(state: EditorState, chars: number, words: number): EditorStats {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.head);
  const selected = state.selection.ranges.filter((r) => !r.empty).map((r) => visibleText(state, r.from, r.to));
  return {
    line: line.number,
    col: visibleText(state, line.from, main.head).length + 1,
    chars,
    words,
    selectedChars: selected.reduce((sum, text) => sum + text.length, 0),
    selectedWords: selected.reduce((sum, text) => sum + wordCount(text), 0),
    selectedLines: state.doc.lineAt(main.to).number - state.doc.lineAt(main.from).number + 1,
    cursors: state.selection.ranges.length,
  };
}

/** Pasted and dropped files go to `addFiles`, with where they land. */
function fileInput(addFiles: (files: File[], at: number) => void, pastedFiles?: () => Promise<File[]>, onEmptyPaste?: () => void) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      const at = view.state.selection.main.head;
      // Files as the page is given them, or as items where only those carry them.
      let files = [...(data?.files ?? [])];
      if (!files.length) files = [...(data?.items ?? [])].filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter((file): file is File => file !== null);
      if (files.length) {
        event.preventDefault();
        addFiles(files, at);
        return true;
      }
      // With no text either, it may be files copied in a folder, which the page is not given: the
      // computer's app reads them from the clipboard; else the person is told how to bring one in.
      if (data && (data.getData('text/plain') || data.getData('text/html'))) return false;
      event.preventDefault();
      if (!pastedFiles) onEmptyPaste?.();
      else
        void pastedFiles().then(
          (found) => (found.length ? addFiles(found, at) : onEmptyPaste?.()),
          () => onEmptyPaste?.(),
        );
      return true;
    },
    drop(event, view) {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length) return false;
      event.preventDefault();
      addFiles(files, view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head);
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

/** Inserts a table and starts typing in its first cell. */
export const addTable = (view: EditorView): boolean => {
  insertTable(view);
  const end = view.state.selection.main.head;
  const table = tableRanges(view.state).find((t) => t.to === end);
  if (table) enterTable(view, table.from);
  return true;
};

export function createEditor(options: ScrawlEditorOptions): ScrawlEditor {
  // The note's length is recounted only when its text or the view mode changes, not on every cursor move.
  let counted: { doc: unknown; source: boolean; chars: number; words: number } | null = null;
  const stats = (state: EditorState) => {
    const source = state.field(sourceMode);
    if (counted?.doc !== state.doc || counted.source !== source) {
      const text = visibleText(state, 0, state.doc.length);
      counted = { doc: state.doc, source, chars: text.length, words: wordCount(text) };
    }
    return statsOf(state, counted.chars, counted.words);
  };
  const addFiles = options.addFiles;
  const record = options.record;
  const slashItems: SlashItem[] = [
    { label: t('slash.heading1'), icon: 'H1', run: toggleHeading(1) },
    { label: t('slash.heading2'), icon: 'H2', run: toggleHeading(2) },
    { label: t('slash.heading3'), icon: 'H3', run: toggleHeading(3) },
    { label: t('slash.list'), icon: SLASH_ICONS.list, run: toggleList('bullet') },
    { label: t('slash.ordered'), icon: SLASH_ICONS.ordered, run: toggleList('ordered') },
    { label: t('slash.quote'), icon: SLASH_ICONS.quote, run: toggleLinePrefix('quote') },
    { label: t('slash.codeBlock'), icon: SLASH_ICONS.codeBlock, run: toggleCodeBlock },
    { label: t('slash.table'), icon: SLASH_ICONS.table, run: addTable },
    { label: t('slash.divider'), icon: SLASH_ICONS.divider, run: insertDivider },
  ];
  if (record) slashItems.push({ label: t('slash.recording'), detail: t('slash.fromMicrophone'), icon: SLASH_ICONS.audio, run: () => record() });
  if (addFiles) {
    slashItems.push({
      label: t('slash.image'),
      detail: t('slash.fromFile'),
      icon: SLASH_ICONS.image,
      run(view) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (file) addFiles([file], view.state.selection.main.head);
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
        options.placeholder ? placeholder(options.placeholder) : [],
        // On a phone the keyboard starts a sentence with a capital, after a full stop and on a new
        // line, as a notes app's does; the editor's own default turns it off.
        options.touch ? EditorView.contentAttributes.of({ autocapitalize: 'sentences' }) : [],
        slashMenu(slashItems, options.touch),
        cursorBehavior,
        clipboard,
        linkPaste(),
        keepDividers,
        // Before `fileInput`: a dragged image comes with a file, which here is moved, not copied.
        widgetMoves,
        addFiles ? fileInput(addFiles, options.pastedFiles, options.onEmptyPaste) : [],
        copiesField,
        foundField,
        scrawlTheme,
        keymap.of([...formatKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          // `view.state`, not `update.state`: another listener may have changed the note again from
          // inside this update, and the text to save is the newest one.
          if (update.docChanged) options.onChange?.(update.view.state.doc.toString());
          if (update.docChanged && options.onAttachments) {
            const removed = new Set<string>();
            const added = new Set<string>();
            for (const tr of update.transactions) {
              const change = attachmentChanges(tr);
              // A link taken away and put back within one update is neither.
              for (const src of change.removed) if (!added.delete(src)) removed.add(src);
              for (const src of change.added) if (!removed.delete(src)) added.add(src);
            }
            if (removed.size || added.size) options.onAttachments([...removed], [...added]);
          }
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
    setState(state, place) {
      view.setState(state);
      // The editor keeps where it was scrolled to; another note starts at its top, or where it was left.
      if (place) view.dispatch({ effects: place });
      else view.scrollDOM.scrollTop = 0;
      options.onStats?.(stats(state));
    },
    scrollPlace: () => view.scrollSnapshot(),
    setSourceMode: (on) => view.dispatch({ effects: setSourceMode.of(on) }),
    refreshMedia: () => view.dispatch({ effects: mediaChanged.of(null) }),
    destroy: () => view.destroy(),
  };
}
