import { t } from '@scrawlnotes/i18n';
import {
  addCard,
  addColumn,
  addPhase,
  addSection,
  addTask,
  ATTACHMENTS,
  type Board,
  type CardPlace,
  closePhase,
  type ColumnKind,
  createBoard,
  createFolder,
  createNote,
  createScratchNote,
  createTaskList,
  deleteFromTrash,
  dirname,
  displayTitle,
  foldSection,
  emptyTrash,
  INBOX,
  INBOX_TASKS,
  isScratchNote,
  keepVersion,
  listVersions,
  loadBoard,
  loadFilters,
  loadList,
  moveCard,
  moveColumn,
  movePhase,
  moveSection,
  moveTask,
  moveTaskToList,
  type NewCard,
  relinkBoardNote,
  relinkNote,
  loadWorkspace,
  moveHistory,
  moveItem,
  type NewTask,
  pruneHistory,
  readTrash,
  readTree,
  removeCard,
  removeColumn,
  removePhase,
  removeSection,
  removeTask,
  renameColumn,
  renameSection,
  renameItem,
  reopenPhase,
  restoreAttachments,
  restoreFromTrash,
  saveAttachment,
  saveBoard,
  saveFile,
  saveFilters,
  saveList,
  sectionTasks,
  saveWorkspace,
  setColumnKind,
  setDone,
  setPhasesOn,
  sweepAttachments,
  type Section,
  type Task,
  type TaskFilter,
  type TaskList,
  type TaskPlace,
  type TaskPatch,
  type Template,
  trashFolder,
  trashItem,
  trashUnlinked,
  type TrashItem,
  type TreeNode,
  updatePhase,
  updateTask,
  type VaultFs,
  type Version,
  VERSION_EVERY_MS,
} from '@scrawlnotes/core';
import {
  addCopy,
  addCursorBelow,
  type Copy,
  copyFollows,
  copyPosition,
  copyProgress,
  createEditor,
  dropCopy,
  type EditorState,
  type EditorStats,
  type FormatState,
  formatState,
  type ItemAction,
  linkAddress,
  linkText,
  type ScrawlEditor,
  selectNextOccurrence,
  selectSelectionMatches,
  setLink,
  visibleText,
  showCopy,
  toggleBold,
  toggleCode,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleLinePrefix,
  toggleStrike,
  type TransactionSpec,
} from '@scrawlnotes/editor';
import { boardPathOf, filterOf, filterTab, folderOf, isNote, listOf, tabOf } from './items';
import { sampleDoc } from './sample';
import {
  chooseVaultFolder,
  fileUrl,
  isDesktop,
  openFileOnDesktop,
  openUrlOnDesktop,
  openVault,
  revealFileOnDesktop,
  vaultFolder,
} from './storage';

const SAVE_DELAY_MS = 400;
/** What starts a list item, a task box, a quote or a heading, nested as deep as it goes. */
const LINE_MARKERS = /^\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|>\s?|#{1,6}\s+)+/;

// Files read back from storage carry no type; the browser needs one to play or show them.
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  txt: 'text/plain',
};
const typeOf = (path: string) => TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? '';

// What the format bar does: formatting, and the commands that make more than one cursor.
const formatCommands = {
  bold: toggleBold,
  italic: toggleItalic,
  strike: toggleStrike,
  code: toggleCode,
  h1: toggleHeading(1),
  h2: toggleHeading(2),
  h3: toggleHeading(3),
  list: toggleLinePrefix('list'),
  quote: toggleLinePrefix('quote'),
  codeBlock: toggleCodeBlock,
  nextMatch: selectNextOccurrence,
  allMatches: selectSelectionMatches,
  cursorBelow: addCursorBelow,
};
export type FormatAction = keyof typeof formatCommands;

export interface Snapshot {
  ready: boolean;
  /** Desktop only: no notes folder has been chosen yet. */
  needsFolder: boolean;
  /** Desktop only: the folder the notes are in. */
  folder: string | null;
  tree: TreeNode[];
  tabs: string[];
  active: string | null;
  /** Display name of every note, kept current while a note is being typed. */
  titles: Record<string, string>;
  /** Every task list, by the path of its file. */
  tasks: Record<string, Task[]>;
  /** The sections of every task list, by the path of its file. */
  sections: Record<string, Section[]>;
  /** Every board, by the path of its file. */
  boards: Record<string, Board>;
  /** The saved filters, in the order they were made. */
  filters: TaskFilter[];
  /** What is in the trash, the latest deleted first. */
  trash: TrashItem[];
  saved: boolean;
  /** Cursor and formatting of the note on screen; null while a view is shown instead. */
  stats: EditorStats | null;
  /** When the recording from the microphone started; null while nothing is recorded. */
  recording: { since: number } | null;
  /** Why the microphone could not be used, shown for a moment. */
  recordError: string | null;
  format: FormatState | null;
  source: boolean;
}

function titlesOf(nodes: TreeNode[], out: Record<string, string> = {}): Record<string, string> {
  for (const node of nodes) {
    if (node.kind === 'note') out[node.path] = node.title ?? 'untitled';
    else titlesOf(node.children ?? [], out);
  }
  return out;
}

/**
 * The open vault and its editor: which notes are open, what is unsaved, and every action the
 * interface offers. React renders from `getSnapshot` and calls the methods.
 */
export class Session {
  private snapshot: Snapshot = {
    ready: false,
    needsFolder: false,
    folder: null,
    tree: [],
    tabs: [],
    active: null,
    titles: {},
    tasks: {},
    sections: {},
    boards: {},
    filters: [],
    trash: [],
    saved: true,
    stats: null,
    format: null,
    source: false,
    recording: null,
    recordError: null,
  };
  private readonly listeners = new Set<() => void>();
  private fs!: VaultFs;
  private editor: ScrawlEditor | null = null;
  /** Editing state of each open note that is not on screen, undo history included. */
  private readonly states = new Map<string, EditorState>();
  private readonly pending = new Map<string, string>();
  /** Attached files the note on screen stopped linking to, to go to the trash once it is saved. */
  private readonly unlinked = new Set<string>();
  /** Shows the menu of a right click in a note; the interface sets it, to draw it like its other menus. */
  showMenu: ((at: { x: number; y: number }, items: ItemAction[]) => void) | null = null;
  /** The text of each open note as it was last read from or written to the vault. */
  private readonly disk = new Map<string, string>();
  /** When a version of each note was last kept in this session. */
  private readonly versionedAt = new Map<string, number>();
  /** Set while a change made outside the app is being put into the editor. */
  private external = false;
  /** Browser only: addresses of attached images read so far, by their path. */
  private readonly images = new Map<string, Promise<string>>();
  /** The size of each attached file, by its path. */
  private readonly sizes = new Map<string, number>();
  /** Addresses of attached files the browser was asked to play or show, by their path. */
  private readonly media = new Map<string, string>();
  private recorder: MediaRecorder | null = null;
  /** How many files are being copied into notes. */
  private copying = 0;
  private timer = 0;
  /** Task files are written one after another, so an older list never lands on top of a newer one. */
  private taskWrites: Promise<void> = Promise.resolve();
  /** Identifies the current start; a start that was disposed while loading must not finish. */
  private run = 0;
  private parent: HTMLElement | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  async start(parent: HTMLElement) {
    const run = ++this.run;
    this.parent = parent;
    const fs = await openVault();
    if (!fs) {
      if (run === this.run) this.set({ needsFolder: true });
      return;
    }
    this.fs = fs;
    for (const entry of await this.fs.list(ATTACHMENTS)) {
      // A copy that was cut off when the app closed leaves its hidden part behind.
      if (entry.name.startsWith('.') && entry.name.endsWith('.part')) {
        await this.fs.remove(entry.path).catch(() => undefined);
        continue;
      }
      // Nothing is read here: images are read when a note shows them, other files when they are opened.
      if (entry.size !== undefined) this.sizes.set(entry.path, entry.size);
    }
    let tree = await readTree(this.fs);
    // The browser vault starts with a sample note. A folder on disk is the user's own; nothing is put there unasked.
    if (!tree.length && !isDesktop) {
      await this.fs.mkdir(INBOX);
      await this.fs.writeText('Scrawl/Sync engine open questions.md', sampleDoc);
      tree = await readTree(this.fs);
    }
    const workspace = await loadWorkspace(this.fs);
    if (run !== this.run) return;

    this.editor = createEditor({
      parent,
      resolveImage: this.resolveImage,
      addFiles: (files, at) => this.addFiles(files, at),
      onStats: (stats) => {
        // The editor reports as soon as it exists, before any note is in it.
        const { active } = this.snapshot;
        if (!active || !isNote(active)) return;
        this.set({ stats, format: this.editor ? formatState(this.editor.view.state) : null });
      },
      onChange: (doc) => this.changed(doc),
      openFile: (src) => void this.openFile(src),
      revealFile: isDesktop ? (src) => void revealFileOnDesktop(src).catch(() => undefined) : undefined,
      // The desktop web view does not open new windows; links go to the default browser.
      openLink: isDesktop ? (href) => void openUrlOnDesktop(href).catch(() => undefined) : undefined,
      showMenu: (at, items) => this.showMenu?.(at, items),
      onAttachments: (removed, added) => this.attachmentsChanged(removed, added),
      fileSize: (src) => this.sizes.get(src),
      resolveAudio: (src) => this.mediaUrl(src),
      record: () => void this.startRecording(),
    });
    window.addEventListener('pagehide', this.flush);

    const titles = titlesOf(tree);
    const { tasks, sections, boards } = await this.readLists(tree);
    const filters = await loadFilters(this.fs);
    const trash = await readTrash(this.fs);
    if (run !== this.run) return;
    const tabs = workspace.tabs.filter((id) => {
      const list = listOf(id);
      const board = boardPathOf(id);
      const filter = filterOf(id);
      if (filter !== null) return filters.some((f) => f.id === filter);
      if (board !== null) return board in boards;
      return list !== null ? list in tasks : id in titles || !isNote(id);
    });
    this.set({ ready: true, needsFolder: false, folder: vaultFolder(), tree, titles, tabs, tasks, sections, boards, filters, trash });
    // With no tabs from last time nothing is opened: the interface asks what to create.
    const first = workspace.active && tabs.includes(workspace.active) ? workspace.active : tabs[0];
    if (first) await this.open(first);
    // Versions past their keeping time go, also those of notes deleted long ago.
    void pruneHistory(this.fs).catch(() => undefined);
    void this.sweepAttachments(run);
  }

  /** The text of every open note, saved or not. */
  private openTexts = () => [
    ...this.pending.values(),
    ...[...this.states.values()].map((state) => state.doc.toString()),
    ...(this.editor ? [this.editor.view.state.doc.toString()] : []),
  ];

  /**
   * Attached files that no note links to any more go to the trash as the app opens too: those
   * whose links were removed while it was closed, by another program or another device.
   */
  private async sweepAttachments(run: number) {
    try {
      const moved = await sweepAttachments(this.fs, this.openTexts);
      if (moved > 0 && run === this.run) this.set({ trash: await readTrash(this.fs) });
    } catch {
      // It is tried again the next time the app opens.
    }
  }

  dispose() {
    this.run++;
    this.stopRecording();
    window.removeEventListener('pagehide', this.flush);
    if (!this.editor) return;
    void this.flush();
    this.editor.destroy();
    this.editor = null;
    this.states.clear();
    this.set({ ready: false, active: null });
  }

  private changed(doc: string) {
    const path = this.snapshot.active;
    // Text that just came from the file is not an edit to save back.
    if (!path || !isNote(path) || this.external) return;
    this.queueSave(path, doc);
  }

  /** Marks a note as changed, to be saved shortly. */
  private queueSave(path: string, doc: string) {
    this.pending.set(path, doc);
    const title = displayTitle(path, doc);
    const titles = this.snapshot.titles[path] === title ? this.snapshot.titles : { ...this.snapshot.titles, [path]: title };
    this.set({ saved: false, titles });
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(this.flush, SAVE_DELAY_MS);
  }

  /** Writes every unsaved note to the vault. */
  flush = async () => {
    window.clearTimeout(this.timer);
    const writes = [...this.pending];
    this.pending.clear();
    await Promise.all(
      writes.map(async ([path, doc]) => {
        // What the file held before this save is kept as a version, at most every ten minutes.
        const before = this.disk.get(path);
        if (before !== undefined && before !== doc) await this.keep(path, before);
        await this.fs.writeText(path, doc);
        this.disk.set(path, doc);
      }),
    );
    this.markSaved();
    void this.trashUnlinkedFiles();
  };

  /**
   * The note on screen stopped linking to some attached files, or links to them again. Files
   * linked again come back from the trash at once, as undo, paste or a restored version expect.
   */
  private attachmentsChanged(removed: string[], added: string[]) {
    for (const src of added) this.unlinked.delete(src);
    for (const src of removed) this.unlinked.add(src);
    if (added.length) void this.bringBack(added);
  }

  /**
   * Browser only: what was read of files that moved can no longer be read, so it is read again
   * from where they are next.
   */
  private forgetMedia(paths: string[]) {
    for (const path of paths) {
      void this.images.get(path)?.then((url) => URL.revokeObjectURL(url), () => undefined);
      this.images.delete(path);
      const url = this.media.get(path);
      if (url) URL.revokeObjectURL(url);
      this.media.delete(path);
    }
  }

  /** Brings attached files back from the trash that the notes in `texts` link to. */
  private async bringBack(texts: string[]) {
    try {
      const restored = await restoreAttachments(this.fs, texts);
      if (restored.length === 0) return;
      // An image may have been read while its file was coming back; it is read again in full.
      this.forgetMedia(restored);
      this.editor?.refreshMedia();
      this.set({ trash: await readTrash(this.fs) });
    } catch {
      // A file that cannot come back shows as missing; the trash still has it.
    }
  }

  /**
   * Attached files that no note links to any more go to the trash as soon as the note that let
   * go of them is saved, unless another note, saved or not, still links to them.
   */
  private async trashUnlinkedFiles() {
    if (this.unlinked.size === 0) return;
    const paths = [...this.unlinked];
    this.unlinked.clear();
    try {
      const moved = await trashUnlinked(this.fs, paths, this.openTexts);
      if (moved.length === 0) return;
      this.forgetMedia(moved);
      this.set({ trash: await readTrash(this.fs) });
      // An undo or a paste in the moment it took brings them straight back.
      await this.bringBack(this.openTexts());
    } catch {
      // The next start moves them, as it does any file nothing links to.
    }
  }

  /** Shows "Saved" once nothing waits to be written: no note, and no file being copied. */
  private markSaved() {
    if (!this.pending.size && this.copying === 0 && !this.snapshot.saved) this.set({ saved: true });
  }

  /** Keeps `text` as an earlier version of the note at `path`, as `keepVersion` decides. */
  private async keep(path: string, text: string, always = false) {
    const now = Date.now();
    // While the version kept last in this session is recent, the vault is not even asked.
    if (!always && now - (this.versionedAt.get(path) ?? 0) < VERSION_EVERY_MS) return;
    try {
      await keepVersion(this.fs, path, text, { now: new Date(now), always });
    } catch {
      // The history is a safety net: failing to keep a version must not keep the note from saving.
    }
    this.versionedAt.set(path, now);
  }

  /** The earlier versions of a note, the latest first. */
  versions(path: string): Promise<Version[]> {
    return listVersions(this.fs, path);
  }

  readVersion(version: Version): Promise<string> {
    return this.fs.readText(version.path);
  }

  /** The text of an open note as it is now, saved or not. */
  textOf(path: string): string {
    const state = path === this.snapshot.active ? this.editor?.view.state : this.states.get(path);
    return state?.doc.toString() ?? this.disk.get(path) ?? '';
  }

  /** An address the browser can play or show an attached file from. */
  private async mediaUrl(src: string): Promise<string> {
    let url = this.media.get(src);
    if (!url) {
      const blob = await this.fs.readBlob(src);
      url = URL.createObjectURL(new Blob([blob], { type: typeOf(src) }));
      this.media.set(src, url);
    }
    return url;
  }

  /** Opens an attached file: on desktop with the program the system uses for it, in the browser in a new tab. */
  async openFile(src: string) {
    try {
      if (isDesktop) await openFileOnDesktop(src);
      else window.open(await this.mediaUrl(src), '_blank', 'noopener');
    } catch {
      // A file that is gone or cannot be opened simply does not open.
    }
  }

  /** Files were pasted, dropped or picked in the note on screen, to go at `at`. */
  private addFiles(files: File[], at: number) {
    const note = this.snapshot.active;
    if (note && isNote(note)) void this.copyFiles(note, files, at);
  }

  /**
   * Copies files into the attachments one after another. Each shows where it will land, with how
   * far it got and a way to stop it, and goes into the note once it is there. A copy that is
   * stopped or fails leaves nothing behind.
   */
  private async copyFiles(note: string, files: File[], at: number) {
    const jobs = files.map((file) => {
      const stop = new AbortController();
      const copy: Copy = {
        id: crypto.randomUUID(),
        name: file.name,
        image: file.type.startsWith('image/'),
        total: file.size,
        written: 0,
        shown: false,
        cancel: () => stop.abort(),
      };
      return { file, copy, stop };
    });
    this.applyTo(note, { effects: jobs.map(({ copy }) => addCopy.of({ copy, pos: at })) });
    this.copying += jobs.length;
    this.set({ saved: false });
    for (const { file, copy, stop } of jobs) {
      // A copy that is over within half a second never shows.
      const reveal = window.setTimeout(() => this.applyTo(note, { effects: showCopy.of(copy.id) }), 500);
      let told = 0;
      const onProgress = (written: number) => {
        if (Date.now() - told < 100 && written < file.size) return;
        told = Date.now();
        this.applyTo(note, { effects: copyProgress.of({ id: copy.id, written }) });
      };
      try {
        const options = { onProgress, signal: stop.signal };
        const src = copy.image ? await saveAttachment(this.fs, file, new Date(), options) : await saveFile(this.fs, file, options);
        this.sizes.set(src, file.size);
        // In the browser the copied file is at hand, so the image need not be read back.
        if (copy.image && !isDesktop) this.images.set(src, Promise.resolve(URL.createObjectURL(file)));
        const markdown = copy.image ? `![](${src})` : `[${linkText(file.name)}](${linkAddress(src)})`;
        this.applyTo(
          note,
          (state) => {
            const pos = copyPosition(state, copy.id);
            if (pos === null) return null;
            // The next file dropped with this one goes on the line below.
            const insert = markdown + (copyFollows(state, copy.id) ? '\n' : '');
            return { changes: { from: pos, insert }, effects: dropCopy.of(copy.id), userEvent: 'input.media' };
          },
          markdown,
        );
      } catch {
        this.applyTo(note, { effects: dropCopy.of(copy.id) });
      } finally {
        window.clearTimeout(reveal);
        this.copying--;
        this.markSaved();
      }
    }
  }

  /**
   * Changes a note wherever it is: in the editor when it is on screen, in its kept state when
   * its tab is in the background. A note whose tab was closed gets `appended` at its end, if given.
   */
  private applyTo(path: string, change: TransactionSpec | ((state: EditorState) => TransactionSpec | null), appended?: string) {
    const make = typeof change === 'function' ? change : () => change;
    const view = this.editor?.view;
    if (view && this.snapshot.active === path) {
      const spec = make(view.state);
      if (spec) view.dispatch(spec);
      return;
    }
    const state = this.states.get(path);
    if (state) {
      const spec = make(state);
      if (!spec) return;
      const next = state.update(spec).state;
      this.states.set(path, next);
      if (next.doc !== state.doc) this.queueSave(path, next.doc.toString());
      return;
    }
    if (appended) void this.appendToFile(path, appended);
  }

  /** Adds Markdown on a line of its own at the end of a note that is not open. */
  private async appendToFile(path: string, markdown: string) {
    try {
      const text = await this.fs.readText(path);
      await this.fs.writeText(path, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${markdown}\n`);
    } catch {
      // The note itself is gone; the file stays in the attachments.
    }
  }

  /** Records from the microphone into the note on screen, until `stopRecording`. */
  async startRecording() {
    const note = this.snapshot.active;
    if (this.recorder || !note || !isNote(note)) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.set({ recordError: t('format.noMicrophone') });
      window.setTimeout(() => this.set({ recordError: null }), 4000);
      return;
    }
    const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      for (const track of stream.getTracks()) track.stop();
      this.recorder = null;
      this.set({ recording: null });
      void this.saveRecording(note, new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    });
    recorder.start();
    this.recorder = recorder;
    this.set({ recording: { since: Date.now() }, recordError: null });
  }

  stopRecording() {
    this.recorder?.stop();
  }

  private async saveRecording(note: string, blob: Blob) {
    if (blob.size === 0) return;
    const path = await saveAttachment(this.fs, blob);
    this.sizes.set(path, blob.size);
    await this.insertInto(note, `[${linkText(t('editor.voiceMemo'))}](${linkAddress(path)})`);
  }

  /**
   * Puts Markdown on a line of its own: after the cursor's line when the note is on screen, else
   * at the end of the note, also when its tab was closed meanwhile.
   */
  private async insertInto(path: string, markdown: string) {
    const view = this.editor?.view;
    if (view && this.snapshot.active === path) {
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const insert = (line.length > 0 ? '\n' : '') + markdown;
      view.dispatch({
        changes: { from: line.to, insert },
        selection: { anchor: line.to + insert.length },
        scrollIntoView: true,
        // Not typed text: the link syntax is ours and stays as it is.
        userEvent: 'input.media',
      });
      return;
    }
    const state = this.states.get(path);
    if (state) {
      const insert = (state.doc.length > 0 ? '\n' : '') + markdown;
      const next = state.update({ changes: { from: state.doc.length, insert } }).state;
      this.states.set(path, next);
      this.queueSave(path, next.doc.toString());
      return;
    }
    await this.appendToFile(path, markdown);
  }

  /** The address an image in a note loads from. */
  /**
   * The address an image in a note loads from. On desktop the web view reads it from the notes
   * folder itself; in the browser it is read from storage the first time a note shows it.
   */
  resolveImage = (src: string): string | Promise<string> => {
    if (!src.startsWith(`${ATTACHMENTS}/`)) return src;
    if (isDesktop) return fileUrl(src);
    let url = this.images.get(src);
    if (!url) {
      url = this.fs.readBlob(src).then((blob) => URL.createObjectURL(blob));
      // An image that could not be read is tried again the next time.
      url.catch(() => this.images.delete(src));
      this.images.set(src, url);
    }
    return url;
  };

  /**
   * Puts an earlier version's text into the note, as an edit that undo takes back. The text the
   * note has now is kept as a version first.
   */
  async restoreVersion(path: string, text: string) {
    await this.open(path);
    const view = this.editor?.view;
    if (!view || this.snapshot.active !== path) return;
    await this.keep(path, view.state.doc.toString(), true);
    // Files the version links to that went to the trash meanwhile come back with it, before it shows them.
    const restored = await restoreAttachments(this.fs, [text]).catch(() => []);
    if (restored.length) {
      this.forgetMedia(restored);
      this.set({ trash: await readTrash(this.fs) });
    }
    if (this.snapshot.active !== path) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: 0 },
      scrollIntoView: true,
      userEvent: 'input.restore',
    });
    view.focus();
  }

  private saveWorkspace() {
    void saveWorkspace(this.fs, { tabs: this.snapshot.tabs, active: this.snapshot.active });
  }

  /** Desktop: asks for the notes folder and opens it. Open notes are saved and closed first. */
  async chooseFolder() {
    if (!this.parent || !(await chooseVaultFolder())) return;
    const parent = this.parent;
    await this.flush();
    this.dispose();
    this.set({ tabs: [], tree: [], titles: {} });
    await this.start(parent);
  }

  /**
   * Picks up what changed outside the app: notes that were added, renamed or removed, and open
   * notes whose file was edited in another program.
   */
  async rescan() {
    if (!this.snapshot.ready) return;
    await this.flush();
    for (const path of this.snapshot.tabs) {
      // A note with edits that are not saved yet keeps them; they are written on the next save.
      if (!isNote(path) || this.pending.has(path)) continue;
      let text: string;
      try {
        text = await this.fs.readText(path);
      } catch {
        continue;
      }
      const known = this.disk.get(path);
      if (text === known) continue;
      // The text it had here is kept, whatever the other program did to it.
      if (known !== undefined) await this.keep(path, known, true);
      this.disk.set(path, text);
      const view = path === this.snapshot.active ? this.editor?.view : undefined;
      if (!view) {
        // Not on screen: it is read again when its tab is opened.
        this.states.delete(path);
        continue;
      }
      this.external = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: Math.min(view.state.selection.main.head, text.length) },
        });
      } finally {
        this.external = false;
      }
    }
    await this.refreshTree();
  }

  /** Writes every unsaved note and task list. */
  private async settle() {
    await this.flush();
    await this.taskWrites;
  }

  private async refreshTree() {
    await this.settle();
    const tree = await readTree(this.fs);
    this.set({ tree, titles: titlesOf(tree), ...(await this.readLists(tree)), trash: await readTrash(this.fs) });
  }

  /** Reads the inbox's task list, every other task list and every board in the vault. */
  private async readLists(tree: TreeNode[]): Promise<Pick<Snapshot, 'tasks' | 'sections' | 'boards'>> {
    const paths = [INBOX_TASKS];
    const boardPaths: string[] = [];
    const visit = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'tasks') paths.push(node.path);
        else if (node.kind === 'board') boardPaths.push(node.path);
        else if (node.kind === 'folder') visit(node.children ?? []);
      }
    };
    visit(tree);
    const lists = await Promise.all(paths.map(async (path) => [path, await loadList(this.fs, path)] as const));
    const boards = await Promise.all(boardPaths.map(async (path) => [path, await loadBoard(this.fs, path)] as const));
    return {
      tasks: Object.fromEntries(lists.map(([path, list]) => [path, list.tasks])),
      sections: Object.fromEntries(lists.map(([path, list]) => [path, list.sections])),
      boards: Object.fromEntries(boards),
    };
  }

  /** Applies a change to a board and saves it. Board files share the queue of task files. */
  private changeBoard(path: string, change: (board: Board) => Board) {
    const current = this.snapshot.boards[path];
    if (!current) return;
    const next = change(current);
    if (next === current) return;
    this.set({ boards: { ...this.snapshot.boards, [path]: next }, saved: false });
    this.taskWrites = this.taskWrites
      .then(() => saveBoard(this.fs, path, next))
      .catch(() => undefined)
      .then(() => {
        this.markSaved();
      });
  }

  private listAt(path: string): TaskList {
    return { sections: this.snapshot.sections[path] ?? [], tasks: this.snapshot.tasks[path] ?? [] };
  }

  /** Applies a change to a task list, its sections or its tasks, and saves it. */
  private changeList(path: string, change: (list: TaskList) => TaskList) {
    const current = this.listAt(path);
    const next = change(current);
    if (next === current) return;
    this.set({
      tasks: { ...this.snapshot.tasks, [path]: next.tasks },
      sections: { ...this.snapshot.sections, [path]: next.sections },
      saved: false,
    });
    this.taskWrites = this.taskWrites
      .then(() => saveList(this.fs, path, next))
      .catch(() => undefined)
      .then(() => {
        this.markSaved();
      });
  }

  private changeTasks(path: string, change: (tasks: Task[]) => Task[]) {
    this.changeList(path, (list) => {
      const tasks = change(list.tasks);
      return tasks === list.tasks ? list : { ...list, tasks };
    });
  }

  addSection(list: string, name: string) {
    this.changeList(list, (current) => addSection(current, name));
  }

  renameSection(list: string, id: string, name: string) {
    this.changeList(list, (current) => renameSection(current, id, name));
  }

  foldSection(list: string, id: string, collapsed: boolean) {
    this.changeList(list, (current) => foldSection(current, id, collapsed));
  }

  /** Moves a task, with its subtasks, where it was dropped. */
  moveTask(list: string, id: string, place: TaskPlace) {
    this.changeList(list, (current) => moveTask(current, id, place));
  }

  /**
   * Moves a task, with its subtasks, to the end of a section or of the tasks in no section, in
   * its own list or in another.
   */
  moveTaskTo(list: string, id: string, target: string, section: string | null) {
    if (target === list) {
      this.changeList(list, (current) => {
        const last = sectionTasks(current, section)
          .filter((t) => t.id !== id)
          .pop();
        return moveTask(current, id, { parent: null, section, after: last?.id ?? null });
      });
      return;
    }
    if (!(target in this.snapshot.tasks)) return;
    const moved = moveTaskToList(this.listAt(list), this.listAt(target), id, section);
    if (!moved.to.tasks.some((t) => t.id === id)) return;
    this.changeList(list, () => moved.from);
    this.changeList(target, () => moved.to);
  }

  /**
   * What a task made from the note on screen starts with: the selection as it reads, or else the
   * line the cursor is on. Its first line is the title, the rest the description.
   */
  taskFromNote(): { note: string; title: string; description: string } | null {
    const view = this.editor?.view;
    const note = this.snapshot.active;
    if (!view || !note || !isNote(note)) return null;
    const { state } = view;
    const { main } = state.selection;
    const line = state.doc.lineAt(main.head);
    const [from, to] = main.empty ? [line.from, line.to] : [main.from, main.to];
    // A list item, quote or heading reads without its marker, as it shows.
    const lines = visibleText(state, from, to)
      .split('\n')
      .map((text) => text.replace(LINE_MARKERS, '').trim())
      .filter(Boolean);
    return { note, title: lines[0] ?? '', description: lines.slice(1).join('\n') };
  }

  moveSection(list: string, id: string, after: string | null) {
    this.changeList(list, (current) => moveSection(current, id, after));
  }

  /** Saves a filter, a new one or a changed one, and shows it. */
  saveFilter(filter: TaskFilter) {
    const { filters } = this.snapshot;
    const next = filters.some((f) => f.id === filter.id) ? filters.map((f) => (f.id === filter.id ? filter : f)) : [...filters, filter];
    this.writeFilters(next);
    void this.open(filterTab(filter.id));
  }

  /** Deletes a saved filter, and closes its tab; its tasks stay where they are. The interface asks first. */
  async removeFilter(id: string) {
    const tab = filterTab(id);
    if (this.snapshot.tabs.includes(tab)) await this.close(tab);
    this.writeFilters(this.snapshot.filters.filter((f) => f.id !== id));
  }

  private writeFilters(filters: TaskFilter[]) {
    this.set({ filters, saved: false });
    this.taskWrites = this.taskWrites
      .then(() => saveFilters(this.fs, filters))
      .catch(() => undefined)
      .then(() => this.markSaved());
  }

  /** Deletes a section with its tasks; the interface asks first. */
  removeSection(list: string, id: string) {
    this.changeList(list, (current) => removeSection(current, id));
  }

  addTask(list: string, input: NewTask) {
    this.changeTasks(list, (tasks) => addTask(tasks, input));
  }

  updateTask(list: string, id: string, patch: TaskPatch) {
    this.changeTasks(list, (tasks) => updateTask(tasks, id, patch));
  }

  setTaskDone(list: string, id: string, done: boolean) {
    this.changeTasks(list, (tasks) => setDone(tasks, id, done));
  }

  removeTask(list: string, id: string) {
    this.changeTasks(list, (tasks) => removeTask(tasks, id));
  }

  /** Shows a note or a view, adding a tab for it when it has none. */
  async open(id: string) {
    const editor = this.editor;
    if (!editor) return;
    const { active, tabs } = this.snapshot;
    if (id !== active) {
      if (active && isNote(active)) this.states.set(active, editor.view.state);
      const openTabs = tabs.includes(id) ? tabs : [...tabs, id];
      if (isNote(id)) {
        let state = this.states.get(id);
        if (!state) {
          const text = await this.fs.readText(id);
          this.disk.set(id, text);
          state = editor.createState(text);
        }
        this.states.delete(id);
        // Set before the editor reports its new state, so the report is attributed to this note.
        this.set({ active: id, tabs: openTabs });
        editor.setState(state);
        // Source mode is one setting for the whole window, not per note.
        editor.setSourceMode(this.snapshot.source);
      } else {
        this.set({ active: id, tabs: openTabs, stats: null, format: null });
      }
      this.saveWorkspace();
    }
    // Deferred: the editor is still hidden when it replaces a view, and a hidden element cannot take focus.
    if (isNote(id)) window.setTimeout(() => this.editor?.view.focus());
  }

  // ---------- boards ----------

  addCard(board: string, input: NewCard) {
    this.changeBoard(board, (current) => addCard(current, input));
  }

  moveCard(board: string, id: string, place: CardPlace) {
    this.changeBoard(board, (current) => moveCard(current, id, place));
  }

  /** Deletes a card for good; the interface asks first. */
  removeCard(board: string, id: string) {
    this.changeBoard(board, (current) => removeCard(current, id));
  }

  addColumn(board: string, name: string, kind: ColumnKind, after?: string) {
    this.changeBoard(board, (current) => addColumn(current, name, kind, after));
  }

  renameColumn(board: string, id: string, name: string) {
    this.changeBoard(board, (current) => renameColumn(current, id, name));
  }

  setColumnKind(board: string, id: string, kind: ColumnKind) {
    this.changeBoard(board, (current) => setColumnKind(current, id, kind));
  }

  moveColumn(board: string, id: string, after: string | null) {
    this.changeBoard(board, (current) => moveColumn(current, id, after));
  }

  /** Deletes a column; its cards go to the first column. The interface asks first when it has cards. */
  removeColumn(board: string, id: string) {
    this.changeBoard(board, (current) => removeColumn(current, id));
  }

  addPhase(board: string, name: string) {
    this.changeBoard(board, (current) => addPhase(current, { name }));
  }

  renamePhase(board: string, id: string, name: string) {
    this.changeBoard(board, (current) => updatePhase(current, id, { name }));
  }

  movePhase(board: string, id: string, after: string | null) {
    this.changeBoard(board, (current) => movePhase(current, id, after));
  }

  /** Closes a phase; its unfinished cards go to the next phase, or out of any phase when there is none. */
  closePhase(board: string, id: string) {
    this.changeBoard(board, (current) => closePhase(current, id, 'next'));
  }

  reopenPhase(board: string, id: string) {
    this.changeBoard(board, (current) => reopenPhase(current, id));
  }

  /** Deletes a phase; its cards stay, in no phase. The interface asks first. */
  removePhase(board: string, id: string) {
    this.changeBoard(board, (current) => removePhase(current, id));
  }

  setPhasesOn(board: string, on: boolean) {
    this.changeBoard(board, (current) => setPhasesOn(current, on));
  }

  /** Creates an empty scratch note in `folder`, or in the inbox, and opens it. */
  async newNote(folder?: string) {
    const path = await createScratchNote(this.fs, new Date(), folder);
    await this.refreshTree();
    await this.open(path);
  }

  /**
   * Creates a note, a task list or a board called `name` (a default name when it is empty) in
   * `folder`, which is made first when `newFolder` is set, and opens it. A board starts from
   * `template`. Returns a message when it cannot be made.
   */
  async create(kind: 'note' | 'tasks' | 'board', folder: string, name: string, newFolder: boolean, template: Template = 'software'): Promise<string | null> {
    let path: string;
    try {
      const target = newFolder ? await createFolder(this.fs, folder) : folder;
      path =
        kind === 'note'
          ? await createNote(this.fs, target, name)
          : kind === 'tasks'
            ? await createTaskList(this.fs, target, name)
            : await createBoard(this.fs, target, name, template);
    } catch (error) {
      return error instanceof Error ? error.message : t('error.create');
    }
    await this.refreshTree();
    await this.open(tabOf(path));
    return null;
  }

  /** Moves a tab to `index`, a gap between the tabs as they are now: 0 is before the first. */
  moveTab(id: string, index: number) {
    const { tabs } = this.snapshot;
    const from = tabs.indexOf(id);
    if (from < 0 || index === from || index === from + 1) return;
    const rest = tabs.filter((tab) => tab !== id);
    rest.splice(index > from ? index - 1 : index, 0, id);
    this.set({ tabs: rest });
    this.saveWorkspace();
  }

  /** Takes a note out of the tab bar and shows a neighbor. Closing the last tab leaves nothing open. */
  private async detach(path: string) {
    const { tabs, active } = this.snapshot;
    const index = tabs.indexOf(path);
    if (index < 0) return;
    const rest = tabs.filter((tab) => tab !== path);
    this.states.delete(path);
    if (path !== active) {
      this.set({ tabs: rest });
      this.saveWorkspace();
      return;
    }
    this.set({ tabs: rest, active: null });
    const next = rest[index] ?? rest[index - 1];
    if (next) await this.open(next);
    else {
      this.set({ stats: null, format: null });
      this.saveWorkspace();
    }
  }

  async close(path: string) {
    await this.flush();
    const state = path === this.snapshot.active ? this.editor?.view.state : this.states.get(path);
    // A note that was never named or written in leaves nothing behind, like an empty editor tab.
    const discard = isNote(path) && isScratchNote(path) && state?.doc.toString().trim() === '';
    if (discard) await this.fs.remove(path);
    await this.detach(path);
    if (discard) await this.refreshTree();
  }

  /** Moves a note, a task list or a board to the trash. */
  async trash(path: string) {
    await this.settle();
    await trashItem(this.fs, path);
    await this.detach(tabOf(path));
    await this.refreshTree();
  }

  /** Moves a folder and everything in it to the trash. The tabs of what was in it close. */
  async trashFolder(path: string) {
    await this.settle();
    const inside = (id: string) => {
      const folder = folderOf(id);
      return folder !== null && (folder === path || folder.startsWith(`${path}/`));
    };
    const { tabs, active } = this.snapshot;
    // The tab on screen goes last, so the one shown after it is from outside the folder.
    for (const tab of tabs.filter(inside)) if (tab !== active) await this.detach(tab);
    if (active && inside(active)) await this.detach(active);
    await trashFolder(this.fs, path);
    await this.refreshTree();
  }

  /** Puts an item from the trash back where it was. */
  async restore(item: TrashItem) {
    await restoreFromTrash(this.fs, item);
    await this.refreshTree();
  }

  /** Deletes an item in the trash for good. */
  async deleteForever(item: TrashItem) {
    await deleteFromTrash(this.fs, item, this.openTexts());
    await this.refreshTree();
  }

  async emptyTrash() {
    await emptyTrash(this.fs, this.openTexts());
    await this.refreshTree();
  }

  /** A note, a task list or a board changed its path: its tab and its editing state follow it. */
  private async repath(path: string, target: string) {
    const state = this.states.get(path);
    if (state) {
      this.states.delete(path);
      this.states.set(target, state);
    }
    const onDisk = this.disk.get(path);
    if (onDisk !== undefined) {
      this.disk.delete(path);
      this.disk.set(target, onDisk);
    }
    if (path.endsWith('.md')) {
      await moveHistory(this.fs, path, target).catch(() => undefined);
      this.versionedAt.delete(path);
      // Tasks and cards made from the note link to it where it is now.
      for (const list of Object.keys(this.snapshot.tasks)) this.changeList(list, (current) => relinkNote(current, path, target));
      for (const board of Object.keys(this.snapshot.boards)) this.changeBoard(board, (current) => relinkBoardNote(current, path, target));
    }
    const [from, to] = [tabOf(path), tabOf(target)];
    const { tabs, active } = this.snapshot;
    this.set({ tabs: tabs.map((tab) => (tab === from ? to : tab)), active: active === from ? to : active });
    this.saveWorkspace();
    await this.refreshTree();
  }

  /** Moves a note, a task list or a board into `folder`. */
  async move(path: string, folder: string) {
    if (dirname(path) === folder) return;
    await this.settle();
    await this.repath(path, await moveItem(this.fs, path, folder));
  }

  /** Moves a note, a task list or a board into a folder that is created for it. Returns a message when the name cannot be used. */
  async moveToNewFolder(path: string, name: string): Promise<string | null> {
    try {
      await this.move(path, await createFolder(this.fs, name));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : t('error.createFolder');
    }
  }

  /** Gives a note, a task list or a board a name. Returns a message when the name cannot be used. */
  async rename(path: string, name: string): Promise<string | null> {
    await this.settle();
    try {
      await this.repath(path, await renameItem(this.fs, path, name));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : t('error.rename');
    }
  }

  /** Creates a folder; returns a message when the name cannot be used. */
  async newFolder(name: string): Promise<string | null> {
    try {
      await createFolder(this.fs, name);
    } catch (error) {
      return error instanceof Error ? error.message : t('error.createFolder');
    }
    await this.refreshTree();
    return null;
  }

  format(action: FormatAction) {
    const view = this.editor?.view;
    if (!view || !this.snapshot.format) return;
    formatCommands[action](view);
    view.focus();
  }

  setLink(url: string) {
    const view = this.editor?.view;
    if (!view || !this.snapshot.format) return;
    setLink(url)(view);
    view.focus();
  }

  setSource(source: boolean) {
    this.set({ source });
    this.editor?.setSourceMode(source);
    this.editor?.view.focus();
  }
}
