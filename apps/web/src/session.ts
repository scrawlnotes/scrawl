import { t } from '@scrawlnotes/i18n';
import {
  addCard,
  addColumn,
  addComment,
  addPhase,
  addSection,
  addTask,
  ATTACHMENTS,
  type Board,
  BOARD_EXT,
  type BoardLook,
  type CardPatch,
  type CardPlace,
  closePhase,
  columnCards,
  type ColumnKind,
  createBoard,
  createFolder,
  createKeys,
  createCollection,
  createLinkedCollection,
  addRecord as addCollectionRecord,
  updateRecord as updateCollectionRecord,
  loadCollection,
  freshenLinks,
  moveCollection as moveCollectionDir,
  renameCollection as renameCollectionDir,
  retargetLinks,
  retargetBoardLinks,
  relinkTaskRecords,
  parseRecord,
  serializeRecord,
  renameChoices,
  type ChoiceRenames,
  type ImportPlan,
  serializeSchema,
  type Collection,
  type CollectionLook,
  type CollectionTemplate,
  type BoardLinks,
  type Schema,
  saveSchema,
  type NewRecord,
  type RecordPatch,
  type Record as CollectionRecord,
  createNote,
  createScratchNote,
  createTaskList,
  deleteFromTrash,
  dirname,
  displayTitle,
  editComment,
  foldSection,
  emptyTrash,
  INBOX_TASKS,
  isScratchNote,
  listName,
  keepVersion,
  type KeysLook,
  listVersions,
  loadFilters,
  fromSpace,
  isSpaceId,
  inSpace,
  fillMe,
  loadPeople,
  loadSpace,
  localPath,
  type Me,
  type Person,
  type PersonRef,
  refOf,
  samePerson,
  savePeople,
  setActive,
  withPerson,
  MultiFs,
  newSpaceId,
  type Entry,
  prefixTree,
  loadNoteTitles,
  NoteTitles,
  readFolder,
  saveNoteTitles,
  rebaseBoard,
  rebaseCollection,
  rebaseSchema,
  rebaseTasks,
  type SpaceAt,
  type SpaceEntry,
  type SpaceSource,
  spaceOf,
  toSpace,
  withinSpace,
  moveCard,
  moveCardToKind,
  moveColumn,
  movePhase,
  moveSection,
  moveTask,
  moveTaskToList,
  mergeFile,
  mergeText,
  conflictPath,
  type NewCard,
  type PhasePatch,
  relinkBoard,
  relinkBoardNote,
  relinkNote,
  loadWorkspace,
  moveHistory,
  moveItem,
  copyToSpace,
  type NewTask,
  parseBoard,
  parseList,
  pruneHistory,
  readTrash,
  readCreated,
  markCreated,
  carryCreated,
  guessCreated,
  type FolderLook,
  isDefaultLook,
  readTrashed,
  type Trashed,
  readTree,
  removeCard,
  removeColumn,
  removeComment,
  removePhase,
  removeSection,
  removeTask,
  reopenTasks,
  renameColumn,
  renameSection,
  renameItem,
  reopenPhase,
  restoreAttachments,
  restoreFromTrash,
  saveAttachment,
  saveFile,
  saveFilters,
  saveMe,
  saveSpace,
  startMe,
  sectionTasks,
  saveWorkspace,
  serializeBoard,
  serializeList,
  setColumnKind,
  setDone,
  setPhasesOn,
  type Section,
  type Task,
  type SpaceInfo,
  type SyncReport,
  type TaskFilter,
  type TaskList,
  type TaskPlace,
  type TaskPatch,
  type Template,
  trashFolder,
  trashItem,
  trashWithFiles,
  trashUnlinked,
  type TrashItem,
  type TreeNode,
  updateCard,
  type Subtask,
  updateSubtask,
  setBoardFields,
  type Field,
  updatePhase,
  updateTask,
  type VaultFs,
  type Version,
  VERSION_EVERY_MS,
  type AttachedFile,
  dropFileFrom,
  dropFileFromBoard,
  dropFileFromTasks,
  listFiles,
  readAway,
  type AwayFile,
  AwayFilesError,
  parseRecent,
  type Seen,
  seenMoved,
  seenNow,
  serializeRecent,
  ensureWelcome,
  WELCOME_NOTE,
  welcomeThere,
} from '@scrawlnotes/core';
import {
  addCopy,
  addCursorBelow,
  addTable,
  attachmentsIn,
  closeSearchPanel,
  type Copy,
  copyFollows,
  copyPosition,
  copyProgress,
  createEditor,
  createViewer,
  dropCopy,
  type EditorState,
  type EditorStats,
  type EditorView,
  type FormatState,
  formatState,
  indentLines,
  insertDivider,
  type ItemAbout,
  type ItemAction,
  linkAddress,
  type LinkTap,
  openSearchPanel,
  linkText,
  type ScrawlEditor,
  type ScrollPlace,
  type ScrawlViewer,
  searchPanelOpen,
  selectNextOccurrence,
  selectSelectionMatches,
  redo,
  undo,
  setLink,
  visibleText,
  showCopy,
  showFound,
  toggleBold,
  toggleCode,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleLinePrefix,
  toggleList,
  toggleStrike,
  type TransactionSpec,
} from '@scrawlnotes/editor';
import { boardPathOf, collectionPathOf, collectionTab, FILES, filterOf, filterTab, folderOf, isNote, keysPathOf, listOf, spaceOfTab, tabOf, TODAY, TRASH, UPCOMING } from './items';
import { JobQueue } from './jobs';
import { type OpeningMeasure, openingMeasure, seconds } from './opening';
import welcomeComputer from './welcome.md?raw';
import welcomePhone from './welcome.phone.md?raw';
import {
  addSpaceEntry,
  chooseVaultFolder,
  moveSpaceEntry,
  defaultVaultFolder,
  newSpaceFolder,
  openSpaceVault,
  orderSpaceEntries,
  removeSpaceEntry,
  spaceEntries,
  fileUrl,
  isDesktop,
  openFileOnDesktop,
  clipboardFilesOnDesktop,
  openUrlOnDesktop,
  openVault,
  revealFileOnDesktop,
  useDefaultVaultFolder,
  vaultFolder,
} from './storage';

const SAVE_DELAY_MS = 400;

/** The node at `path` in a tree, a folder found among the folders it is in. */
function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children && path.startsWith(`${node.path}/`)) return findNode(node.children, path);
  }
  return null;
}
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

/** The one change that turns `from` into `to`: what lies between their common start and end. */
function changeBetween(from: string, to: string) {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = 0;
  while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++;
  return { from: start, to: from.length - end, insert: to.slice(start, to.length - end) };
}

// What the format bar does: formatting, and the commands that make more than one cursor.
const formatCommands = {
  bold: toggleBold,
  italic: toggleItalic,
  strike: toggleStrike,
  code: toggleCode,
  h1: toggleHeading(1),
  h2: toggleHeading(2),
  h3: toggleHeading(3),
  list: toggleList('bullet'),
  ordered: toggleList('ordered'),
  indent: indentLines(true),
  outdent: indentLines(false),
  quote: toggleLinePrefix('quote'),
  codeBlock: toggleCodeBlock,
  table: addTable,
  divider: insertDivider,
  nextMatch: selectNextOccurrence,
  allMatches: selectSelectionMatches,
  cursorBelow: addCursorBelow,
  undo,
  redo,
};
export type FormatAction = keyof typeof formatCommands;

export interface Snapshot {
  /** The shell is up: the spaces are open and last time's tabs are there; their items come as they are read. */
  ready: boolean;
  /** The spaces whose items are not all read yet as the app opens: `''` for the personal one, the others by id. */
  reading: ReadonlySet<string>;
  /** Desktop only: the folder the notes are in. */
  folder: string | null;
  /** Desktop only: the folder the notes go to unless another is chosen. */
  defaultFolder: string | null;
  /** Who the user is, from the personal space; null until the first start has asked. */
  me: Me | null;
  /** The personal space's tree. */
  tree: TreeNode[];
  /** The spaces beside the personal one, in the sidebar's order, each with its tree. */
  spaces: SpaceView[];
  tabs: string[];
  active: string | null;
  /** What was on screen last on this device, the latest first, open or not: the start page's Recent. */
  recent: Seen[];
  /** Display name of every note, kept current while a note is being typed. */
  titles: Record<string, string>;
  /** Every task list, by the path of its file. */
  tasks: Record<string, Task[]>;
  /** The sections of every task list, by the path of its file. */
  sections: Record<string, Section[]>;
  /** Every board, by the path of its file. */
  boards: Record<string, Board>;
  /** How each board was last looked at on this device, by the path of its file. */
  boardLooks: Record<string, BoardLook>;
  /** How the items of a folder are put in order on this device, by its path; a space's top by its key, the personal one's by ''. */
  folderLooks: Record<string, FolderLook>;
  /** When each item of every space was made, as the app keeps it, by its path lowercased. */
  created: Record<string, number>;
  /** The text of every keys file, by its path. */
  keys: Record<string, string>;
  /** How each keys file was last looked at on this device, by its path. */
  keysLooks: Record<string, KeysLook>;
  /** Every collection, by the path of its folder: its schema and its records. */
  collections: Record<string, Collection>;
  /** How each collection's table was last looked at on this device, by its folder's path. */
  collectionLooks: Record<string, CollectionLook>;
  /** The saved filters, in the order they were made. */
  filters: TaskFilter[];
  /** The settings of the open space, its name among them. */
  space: SpaceInfo;
  /** What is in the trash, the latest deleted first. */
  trash: TrashItem[];
  /** How many attached files every space has, here or left in the cloud. */
  fileCount: number;
  /** The attached files coming from the cloud now, by their path: how many of their bytes came. */
  downloads: Record<string, { done: number; size: number }>;
  /** Counts the times a file came from the cloud: what lists the files reads them again. */
  fileVersion: number;
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

/** An attached file as Files shows it: its path and the paths of what uses it as the app has them, in its space. */
export interface FileRow extends AttachedFile {
  space: string | null;
}

/** A space beside the personal one, as the interface shows it. */
export interface SpaceView {
  id: string;
  /** From its own `space.json`; the folder's name until it is named. */
  name: string;
  /** Desktop: the folder of its copy on disk. */
  folder: string | null;
  /** Where it lives in the cloud, which its sync follows. */
  source: SpaceSource | null;
  /** Everyone who has opened it, from its `.scrawl/people.json`. */
  people: Person[];
  /** Its folders and files, their paths carrying the space. */
  tree: TreeNode[];
}

/** The personal space's key among the spaces read as the app opens. */
const PERSONAL = '';
/** How many folders and files are read at once as the app opens: each is a call to the browser's storage. */
const READ_AT_ONCE = 8;
/** What is read first as the app opens: the tab on screen, each space's top, the folders looked at, ... */
const FIRST = { tab: 0, top: 1, wanted: 2, files: 3, list: 4, folder: 5, collection: 6, trash: 7 };
/** How often what was read is shown at most, as the app opens. */
const SHOW_MS = 100;

/** A space being read as the app opens. */
interface SpaceRead {
  key: string;
  space: string | null;
  fs: VaultFs;
  /** What the opening's log calls it. */
  name: string;
  /** Each folder read, by its path in the space, `''` for its top: what it holds. */
  folders: Map<string, TreeNode[]>;
  /** Its notes' titles kept on this device: a note that did not change is not read to be named. */
  titles: NoteTitles;
  /** Its jobs not done yet; none left, it is read. */
  left: number;
  started: number;
  notes: number;
  fromDisk: number;
  folderCount: number;
  lists: number;
  boards: number;
  collections: number;
  records: number;
}

/** The reading of every space as the app opens, until all of it is read. */
interface OpeningRead {
  run: number;
  queue: JobQueue;
  reads: Map<string, SpaceRead>;
  /** The task lists, boards, keys files and collections asked for, by path: none is read twice. */
  items: Set<string>;
  /** What the tree has, by path, for one the tab on screen asked for first and could not read. */
  seen: Map<string, TreeNode['kind']>;
  /** The spaces whose tree grew since it was last shown, and those read all through since. */
  changed: Set<string>;
  finished: Set<string>;
  /** The title of the note on screen, read before its folder is. */
  early: Record<string, string>;
  tasks: Record<string, Task[]>;
  sections: Record<string, Section[]>;
  boards: Record<string, Board>;
  keys: Record<string, string>;
  collections: Record<string, Collection>;
  /** Each space's trash, by its key. */
  trash: Map<string, TrashItem[]>;
  /** Something read waits to be shown. */
  dirty: boolean;
  timer: number;
  shownAt: number;
}

/** A space's tree as far as it is read: a folder not read yet is `reading`, with no children. */
function treeOfRead(read: SpaceRead): TreeNode[] {
  const build = (dir: string): TreeNode[] =>
    (read.folders.get(dir) ?? []).map((node) =>
      node.kind === 'folder' && read.folders.has(node.path) ? { name: node.name, path: node.path, kind: 'folder', children: build(node.path) } : node,
    );
  return build('');
}

/** What a tab shows that is read as a file of its own: a task list, a board, a keys file or a collection, by its path. */
function itemOfTab(id: string): [TreeNode['kind'], string] | null {
  const list = listOf(id);
  if (list !== null) return ['tasks', list];
  const board = boardPathOf(id);
  if (board !== null) return ['board', board];
  const keys = keysPathOf(id);
  if (keys !== null) return ['keys', keys];
  const collection = collectionPathOf(id);
  return collection !== null ? ['collection', collection] : null;
}

/** How many of something, for the opening's log, which is not translated: `1 note`, `2 notes`. */
const many = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** What a tab is, for the opening's log: its kind, never its name. */
function tabKind(id: string): string {
  if (id === WELCOME_NOTE) return 'the welcome note';
  if (listOf(id) !== null) return 'a task list';
  if (boardPathOf(id) !== null) return 'a board';
  if (keysPathOf(id) !== null) return 'a keys file';
  if (collectionPathOf(id) !== null) return 'a collection';
  if (filterOf(id) !== null) return 'a filter';
  if (VIEWS.has(id)) return id === TODAY ? 'Today' : id === UPCOMING ? 'Upcoming' : id === FILES ? 'Files' : 'the trash';
  return isNote(id) ? 'a note' : 'a view';
}

function titlesOf(nodes: TreeNode[], out: Record<string, string> = {}): Record<string, string> {
  for (const node of nodes) {
    if (node.kind === 'note') out[node.path] = node.title ?? 'untitled';
    else titlesOf(node.children ?? [], out);
  }
  return out;
}

const RECENT = 'scrawl.recent';
/** The views over everything: on screen, but not something opened, so not in Recent. */
const VIEWS = new Set([TODAY, UPCOMING, TRASH, FILES]);

/** The start page's Recent as this device kept it. */
function loadRecent(): Seen[] {
  try {
    return parseRecent(localStorage.getItem(RECENT));
  } catch {
    return [];
  }
}

function saveRecent(recent: Seen[]) {
  try {
    localStorage.setItem(RECENT, serializeRecent(recent));
  } catch {
    // Not kept; Recent starts again with what is opened next.
  }
}

/** Every link in every collection with the name and code its record has now, where that record is loaded. */
function freshenAll(collections: Record<string, Collection>): Record<string, Collection> {
  const lookup = (dir: string, id: string) => collections[dir]?.records.find((r) => r.id === id);
  const out: Record<string, Collection> = {};
  for (const [dir, collection] of Object.entries(collections)) {
    let records = collection.records;
    collection.records.forEach((record, i) => {
      const values = freshenLinks(record.values, collection.schema, lookup);
      if (values === record.values) return;
      if (records === collection.records) records = [...records];
      records[i] = { ...record, values };
    });
    out[dir] = records === collection.records ? collection : { ...collection, records };
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
    reading: new Set(),
    folder: null,
    defaultFolder: null,
    me: null,
    tree: [],
    spaces: [],
    tabs: [],
    active: null,
    recent: loadRecent(),
    titles: {},
    tasks: {},
    sections: {},
    boards: {},
    boardLooks: {},
    folderLooks: {},
    created: {},
    keys: {},
    keysLooks: {},
    collections: {},
    collectionLooks: {},
    filters: [],
    space: {},
    trash: [],
    fileCount: 0,
    downloads: {},
    fileVersion: 0,
    saved: true,
    stats: null,
    format: null,
    source: false,
    recording: null,
    recordError: null,
  };
  private readonly listeners = new Set<() => void>();
  /** The personal space's files. */
  private personal!: VaultFs;
  /**
   * The files of every space as one; a path says which. A file is read and written by its path
   * here. Whatever works on a space's files as a whole, or writes paths into a file, goes through
   * `at` and works in that space's own files and paths (see `spaces.ts` in core).
   */
  private fs!: MultiFs;
  /** The other spaces as opened: their files and what the device knows of them. */
  private opened = new Map<string, { entry: SpaceEntry; fs: VaultFs; name: string }>();
  private editor: ScrawlEditor | null = null;
  /** Editing state of each open note that is not on screen, undo history included. */
  private readonly states = new Map<string, EditorState>();
  private readonly pending = new Map<string, string>();
  /** Attached files the note on screen stopped linking to, to go to the trash once it is saved. */
  private readonly unlinked = new Set<string>();
  /** Shows the menu of a right click in a note; the interface sets it, to draw it like its other menus. */
  showMenu: ((at: { x: number; y: number }, items: ItemAction[], about?: ItemAbout) => void) | null = null;
  /** Says something for a moment in the status bar, from the window. */
  say: ((text: string) => void) | null = null;
  /** A link tapped in a note on a touch screen; the interface sets it, to show what can be done with it. */
  linkTap: ((link: LinkTap) => void) | null = null;
  /**
   * A phone: a tap on an image opens it, holding one opens its menu, and a tap on a link asks what
   * to do with it; none of them brings up the keyboard.
   */
  touch = false;
  /**
   * Whether a note opened takes the typing cursor. On a phone it does not: a note is opened to be
   * read as often as to be written in, and a tap in it brings the keyboard when it is wanted.
   */
  focusOnOpen = true;
  /**
   * Whether closing the tab on screen shows its neighbor. On a phone it does not: there is no tab
   * bar to fall back on, and what was open before is a page away.
   */
  neighborOnClose = true;
  /** This device's name, which a conflict copy made here carries; sync tells it. */
  deviceName = '';
  /** This device's id, once it is known: the times it writes of what is made go in its own file. */
  deviceId = '';
  /** The text of each open note as it was last read from or written to the vault. */
  private readonly disk = new Map<string, string>();
  /** What each task list, board and keys file held when it was last read or written here, to tell what changed there since. */
  private readonly records = new Map<string, string>();
  /**
   * How many times each task list, board and keys file was changed here: what was read before a
   * change does not take the place of what it changed.
   */
  private readonly edits = new Map<string, number>();
  /** Keys files changed here and not written yet; like notes, they are written a moment after the last change. */
  private readonly keysPending = new Set<string>();
  private keysTimer = 0;
  /** When a version of each note was last kept in this session. */
  private readonly versionedAt = new Map<string, number>();
  /** Set while a change made outside the app is being put into the editor. */
  private external = false;
  // Attached files are known by their path in the app, their space in front: two spaces may
  // each have an `_attachments/` file of the same name.
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
    // The first start of the page writes how it went to the device's log: each space read, the
    // first tab, and the whole.
    const measure = openingMeasure(() => run === this.run);
    this.parent = parent;
    this.personal = await openVault();
    await this.openSpaces();
    const workspace = await loadWorkspace(this.personal);
    // The onboarding note opens each time until it is closed on this device, for those who had
    // the app before it too. It is kept under `.scrawl`, where the folder stays the user's own.
    this.welcomeClosed = workspace.welcomeClosed === true;
    if (!this.welcomeClosed) await ensureWelcome(this.personal, this.welcomeText());
    const welcomeHere = await welcomeThere(this.personal);
    const filters = await loadFilters(this.personal);
    const space = await loadSpace(this.personal);
    // Nothing is asked at the first start: the name and the email wait for a space where others see them.
    const me = await startMe(this.personal, this.snapshot.me);
    const people = await Promise.all([...this.opened.values()].map((each) => loadPeople(each.fs)));
    if (run !== this.run) return;

    this.editor = createEditor({
      parent,
      // The note on screen is where its files are; the desktop web view does not open new
      // windows, so links go to the default browser.
      ...this.filesOf(() => this.onScreen),
      addFiles: (files, at) => this.addFiles(files, at),
      // Files copied in Explorer reach a page only through the desktop app, which reads them from the clipboard.
      pastedFiles: isDesktop ? clipboardFilesOnDesktop : undefined,
      onEmptyPaste: () => this.say?.(t('editor.pasteNothing')),
      onStats: (stats) => {
        // The editor reports as soon as it exists, before any note is in it.
        const { active } = this.snapshot;
        if (!active || !isNote(active)) return;
        this.set({ stats, format: this.editor ? formatState(this.editor.view.state) : null });
      },
      onChange: (doc) => this.changed(doc),
      showMenu: (at, items, about) => this.showMenu?.(at, items, about),
      touch: this.touch,
      onLinkTap: this.touch ? (link) => this.linkTap?.(link) : undefined,
      placeholder: this.touch ? () => this.emptyNote() : undefined,
      onAttachments: (removed, added) => this.attachmentsChanged(this.onScreen, removed, added),
      record: () => void this.startRecording(),
    });
    window.addEventListener('pagehide', this.flush);

    // The shell comes now, with last time's tabs: a space's are checked once it is read, as each
    // space's items come as they are read (`readOpening`). Those of a space no longer on this
    // device, a filter gone, or the onboarding note not there, go now.
    let tabs = workspace.tabs.filter((id) => {
      const where = spaceOfTab(id);
      if (where && !this.opened.has(where)) return false;
      const filter = filterOf(id);
      if (filter !== null) return filters.some((f) => f.id === filter);
      return id !== WELCOME_NOTE || welcomeHere;
    });
    let active = workspace.active;
    // Not closed yet: its tab is the first, and on screen when it was not open already.
    if (!this.welcomeClosed && welcomeHere && !tabs.includes(WELCOME_NOTE)) {
      tabs = [WELCOME_NOTE, ...tabs];
      active = WELCOME_NOTE;
    }
    const spaces = [...this.opened].map(
      ([id, each], index): SpaceView => ({ id, name: each.name, folder: each.entry.folder ?? null, source: each.entry.source ?? null, people: people[index]!, tree: [] }),
    );
    this.set({
      ready: true,
      reading: new Set([PERSONAL, ...this.opened.keys()]),
      folder: vaultFolder(),
      defaultFolder: defaultVaultFolder(),
      me,
      tree: [],
      spaces,
      titles: {},
      tabs,
      tasks: {},
      sections: {},
      boards: {},
      boardLooks: workspace.boards,
      folderLooks: workspace.folders ?? {},
      keys: {},
      keysLooks: workspace.keys,
      collections: {},
      collectionLooks: workspace.collections,
      filters,
      space,
      trash: [],
    });
    // With no tabs from last time nothing is opened: the start page shows.
    const first = active && tabs.includes(active) ? active : tabs[0];
    const reading = this.readOpening(run, measure, first ?? null);
    if (first) await this.openFirst(first, measure);
    await reading;
    if (run !== this.run) return;
    measure.finish();
    // Versions past their keeping time go, also those of notes deleted long ago.
    for (const [, fs] of this.fs.all()) void pruneHistory(fs).catch(() => undefined);
    void this.recountFiles();
    void this.readCreatedTimes();
    this.meetSpaces();
  }

  /**
   * Opens last time's tab on screen as the app opens, before its space is read: a note is read
   * from its file at once. One whose file is gone closes, and the next one opens.
   */
  private async openFirst(first: string, measure: OpeningMeasure) {
    let id: string | undefined = first;
    const start = performance.now();
    while (id) {
      try {
        await this.open(id);
        break;
      } catch {
        const tabs = this.snapshot.tabs.filter((tab) => tab !== id);
        this.set({ tabs });
        id = tabs[0];
      }
    }
    if (!id) return;
    // Its title, before its folder is read.
    const text = isNote(id) ? this.disk.get(id) : undefined;
    if (text !== undefined && this.opening) {
      this.opening.early[id] = displayTitle(id, text);
      this.set({ titles: { ...this.snapshot.titles, [id]: this.opening.early[id]! } });
    }
    measure.step('First tab', performance.now() - start, `First tab at ${seconds(performance.now())}: ${tabKind(id)}`);
  }

  /** Folders looked at, by their paths in the app: while the app opens they are read before the others, and the folders they are in. */
  want(paths: string[]) {
    for (const path of paths) {
      this.wanted.add(path);
      const space = spaceOf(path);
      const parts = localPath(path).split('/').filter(Boolean);
      parts.forEach((_, index) => this.opening?.queue.hurry(`folder:${inSpace(space, parts.slice(0, index + 1).join('/'))}`, FIRST.wanted));
    }
  }

  /** The folders looked at, read first as the app opens. */
  private readonly wanted = new Set<string>();
  /** The spaces being read as the app opens; null once all of them are. */
  private opening: OpeningRead | null = null;
  /** The tree was to be read again while the app opened: it is, once the opening's reading is done. */
  private refreshLater = false;

  /**
   * Reads every space as the app opens, in one queue, a few files at a time, the spaces side by
   * side (design/opening.md, section 5): the tab on screen's file first, then each space's top,
   * the folders looked at, the task lists, boards and keys files, the other folders shallow first,
   * the collections, and each space's trash. What is read is shown as it comes, at most every
   * 100 ms; a space read all through is no longer `reading`, its tabs whose file is gone close,
   * and its sync can begin.
   */
  private async readOpening(run: number, measure: OpeningMeasure, tab: string | null) {
    const o: OpeningRead = {
      run,
      queue: new JobQueue(READ_AT_ONCE),
      reads: new Map(),
      items: new Set(),
      seen: new Map(),
      changed: new Set(),
      finished: new Set(),
      early: {},
      tasks: {},
      sections: {},
      boards: {},
      keys: {},
      collections: {},
      trash: new Map(),
      dirty: false,
      timer: 0,
      shownAt: 0,
    };
    this.opening = o;
    const started = performance.now();
    const counts = { left: 0, started, notes: 0, fromDisk: 0, folderCount: 0, lists: 0, boards: 0, collections: 0, records: 0 };
    o.reads.set(PERSONAL, { key: PERSONAL, space: null, fs: this.personal, name: 'Personal', folders: new Map(), titles: new NoteTitles(), ...counts });
    for (const [id, each] of this.opened) o.reads.set(id, { key: id, space: id, fs: each.fs, name: each.name, folders: new Map(), titles: new NoteTitles(), ...counts });

    /** Adds a job of a space; once none of its jobs is left, the space is read. */
    const add = (read: SpaceRead, key: string, priority: number, job: () => Promise<void>) => {
      read.left++;
      o.queue.add(key, priority, async () => {
        try {
          if (run === this.run) await job();
        } finally {
          read.left--;
          if (read.left === 0) this.spaceRead(o, read, measure);
        }
      });
    };

    /** A task list, a board, a keys file or a collection, read once; the tab on screen's before the tree has it, and again from the tree if that could not be read. */
    const item = (read: SpaceRead, kind: TreeNode['kind'], path: string, asked = false) => {
      if (kind === 'note' || kind === 'folder') return;
      if (!asked) o.seen.set(path, kind);
      if (o.items.has(path)) return;
      o.items.add(path);
      add(read, `item:${path}`, asked ? FIRST.tab : kind === 'collection' ? FIRST.collection : FIRST.list, async () => {
        if (!(await this.readItem(o, kind, path, asked))) {
          o.items.delete(path);
          const known = o.seen.get(path);
          if (asked && known) item(read, known, path);
          return;
        }
        if (kind === 'tasks') read.lists++;
        else if (kind === 'board') read.boards++;
        else if (kind === 'collection') {
          read.collections++;
          read.records += o.collections[path]?.records.length ?? 0;
        }
        this.soonShown(o);
      });
    };

    /** A folder's items, from its entries, listed here unless its parent had to list them; the folders in it come next, those looked at first. */
    const fill = async (read: SpaceRead, dir: string, listed: Entry[] | undefined, depth: number) => {
      const { nodes, folders, read: fromDisk } = await readFolder(read.fs, dir, listed ?? (await read.fs.list(dir)), read.titles);
      read.folders.set(dir, nodes);
      read.notes += nodes.filter((node) => node.kind === 'note').length;
      read.fromDisk += fromDisk;
      read.folderCount += folders.length;
      o.changed.add(read.key);
      this.soonShown(o);
      for (const folder of folders) {
        const path = inSpace(read.space, folder.path);
        add(read, `folder:${path}`, this.wanted.has(path) ? FIRST.wanted : FIRST.folder + (depth + 1) / 100, () => fill(read, folder.path, folder.listed, depth + 1));
      }
      for (const node of nodes) item(read, node.kind, inSpace(read.space, node.path));
    };

    const asked = tab ? itemOfTab(tab) : null;
    const askedRead = tab ? o.reads.get(spaceOfTab(tab) ?? PERSONAL) : undefined;
    if (asked && askedRead) item(askedRead, asked[0], asked[1], true);
    for (const read of o.reads.values()) {
      add(read, `top:${read.key}`, FIRST.top, async () => {
        read.titles = await loadNoteTitles(read.fs);
        await fill(read, '', undefined, 0);
        // The browser vault starts with Inbox. A folder on disk is the user's own; nothing is put there unasked.
        if (read.space !== null || isDesktop || read.folders.get('')!.length > 0) return;
        await createTaskList(this.personal, '', listName(INBOX_TASKS));
        await fill(read, '', undefined, 0);
      });
      add(read, `files:${read.key}`, FIRST.files, async () => {
        for (const entry of await read.fs.list(ATTACHMENTS).catch(() => [])) {
          // A copy that was cut off when the app closed leaves its hidden part behind.
          if (entry.name.startsWith('.') && entry.name.endsWith('.part')) {
            await read.fs.remove(entry.path).catch(() => undefined);
            continue;
          }
          // Nothing is read here: images are read when a note shows them, other files when they are opened.
          if (entry.size !== undefined) this.sizes.set(inSpace(read.space, entry.path), entry.size);
        }
      });
      add(read, `trash:${read.key}`, FIRST.trash, async () => {
        const items = await readTrash(read.fs).catch(() => []);
        o.trash.set(read.key, items.map((each) => ({ ...each, path: inSpace(read.space, each.path), from: inSpace(read.space, each.from) })));
        this.soonShown(o);
      });
    }
    // Inbox is the personal space's list even when its file is not there yet, as the sidebar shows it.
    item(o.reads.get(PERSONAL)!, 'tasks', INBOX_TASKS);

    await o.queue.idle();
    if (run !== this.run || this.opening !== o) return;
    this.showOpening(o);
    this.opening = null;
    // How things are looked at is kept only for those still there.
    const { boards, keys, collections, boardLooks, keysLooks, collectionLooks } = this.snapshot;
    const there = <T>(looks: Record<string, T>, items: Record<string, unknown>) => Object.fromEntries(Object.entries(looks).filter(([path]) => path in items));
    this.set({ reading: new Set(), boardLooks: there(boardLooks, boards), keysLooks: there(keysLooks, keys), collectionLooks: there(collectionLooks, collections) });
    if (this.refreshLater) {
      this.refreshLater = false;
      void this.refreshTree();
    }
  }

  /**
   * Reads a task list, a board, a keys file or a collection as the app opens, keeping its text to
   * tell later whether it changed there. One that cannot be read now, as it is being written, is
   * shown empty, as it was when the app opened all at once; one only asked for by the tab on
   * screen, which may be gone, is left until the tree has it. False when nothing was read.
   */
  private async readItem(o: OpeningRead, kind: TreeNode['kind'], path: string, asked: boolean): Promise<boolean> {
    if (kind === 'collection') {
      // A collection that cannot be read (its schema file gone meanwhile) is left out, not shown broken.
      const loaded = await this.loadCollectionAt(path).catch(() => null);
      if (loaded) o.collections[path] = loaded;
      return loaded !== null;
    }
    const text = await this.fs.readText(path).catch(() => null);
    if (text === null && asked) return false;
    if (text !== null) this.records.set(path, text);
    if (kind === 'tasks') {
      const list = this.parseListAt(path, text ?? '');
      o.tasks[path] = list.tasks;
      o.sections[path] = list.sections;
    } else if (kind === 'board') o.boards[path] = this.parseBoardAt(path, text ?? '');
    else o.keys[path] = text ?? '';
    return true;
  }

  /** A space is read all through: its line in the opening's log, and it is shown so. */
  private spaceRead(o: OpeningRead, read: SpaceRead, measure: OpeningMeasure) {
    if (o !== this.opening) return;
    o.finished.add(read.key);
    void saveNoteTitles(read.fs, read.titles);
    const took = performance.now() - read.started;
    measure.step(
      read.name,
      took,
      `${read.name} read in ${seconds(took)}: ${many(read.notes, 'note')}, ${read.fromDisk} read from disk; ${many(read.folderCount, 'folder')}, ` +
        `${many(read.lists, 'task list')}, ${many(read.boards, 'board')}, ${many(read.collections, 'collection')}, ${many(read.records, 'record')}`,
    );
    this.showOpening(o);
  }

  /** Shows what was read soon: at once when nothing was shown for a while, otherwise with what comes meanwhile. */
  private soonShown(o: OpeningRead) {
    o.dirty = true;
    if (o.timer) return;
    o.timer = window.setTimeout(() => this.showOpening(o), Math.max(0, SHOW_MS - (performance.now() - o.shownAt)));
  }

  /**
   * Shows what was read as the app opens: the trees as far as they are read, the lists, boards,
   * keys files and collections read, the trash. One changed here meanwhile is shown as it is: what
   * was written then was merged with its file. A space read all through is no longer `reading`.
   */
  private showOpening(o: OpeningRead) {
    if (o !== this.opening) return;
    window.clearTimeout(o.timer);
    o.timer = 0;
    o.shownAt = performance.now();
    if (!o.dirty && o.finished.size === 0) return;
    o.dirty = false;
    const now = this.snapshot;
    const patch: Partial<Snapshot> = {};
    if (o.changed.has(PERSONAL)) patch.tree = treeOfRead(o.reads.get(PERSONAL)!);
    if ([...o.changed].some((key) => key !== PERSONAL)) {
      patch.spaces = now.spaces.map((view) => (o.changed.has(view.id) && o.reads.has(view.id) ? { ...view, tree: prefixTree(treeOfRead(o.reads.get(view.id)!), view.id) } : view));
    }
    if (patch.tree || patch.spaces) {
      const everything = [...(patch.tree ?? now.tree), ...(patch.spaces ?? now.spaces).flatMap((view) => view.tree)];
      // A note being typed keeps the title it has now.
      const typed = Object.fromEntries([...this.pending.keys()].filter((path) => path in now.titles).map((path) => [path, now.titles[path]!]));
      patch.titles = { ...o.early, ...titlesOf(everything), ...typed };
    }
    o.changed.clear();
    const fresh = <T>(read: Record<string, T>, shown: Record<string, unknown>) => Object.fromEntries(Object.entries(read).filter(([path]) => !(path in shown)));
    if (Object.keys(o.tasks).length > 0) {
      patch.tasks = { ...now.tasks, ...fresh(o.tasks, now.tasks) };
      patch.sections = { ...now.sections, ...fresh(o.sections, now.tasks) };
    }
    if (Object.keys(o.boards).length > 0) patch.boards = { ...now.boards, ...fresh(o.boards, now.boards) };
    if (Object.keys(o.keys).length > 0) patch.keys = { ...now.keys, ...fresh(o.keys, now.keys) };
    if (Object.keys(o.collections).length > 0) patch.collections = freshenAll({ ...now.collections, ...fresh(o.collections, now.collections) });
    o.tasks = {};
    o.sections = {};
    o.boards = {};
    o.keys = {};
    o.collections = {};
    if (o.trash.size > 0) patch.trash = [...o.trash.values()].flat().sort((a, b) => b.deleted.localeCompare(a.deleted));
    const finished = [...o.finished];
    o.finished.clear();
    if (finished.length > 0) patch.reading = new Set([...now.reading].filter((key) => !finished.includes(key)));
    this.set(patch);
    for (const key of finished) void this.closeGoneTabs(key);
  }

  /** Once a space is read, its tabs whose file is gone close, as they did when the app opened all at once. */
  private async closeGoneTabs(key: string) {
    for (const id of this.snapshot.tabs) if ((spaceOfTab(id) ?? PERSONAL) === key && !this.tabThere(id)) await this.detach(id);
  }

  /** Whether what a tab shows is there, as its space was read. */
  private tabThere(id: string): boolean {
    const { tasks, boards, keys, collections, titles, filters } = this.snapshot;
    // The onboarding note is not in the tree; it was looked for as the app opened.
    if (id === WELCOME_NOTE) return true;
    const filter = filterOf(id);
    if (filter !== null) return filters.some((f) => f.id === filter);
    const item = itemOfTab(id);
    if (item) {
      const [kind, path] = item;
      return path in (kind === 'tasks' ? tasks : kind === 'board' ? boards : kind === 'keys' ? keys : collections);
    }
    return id in titles || !isNote(id);
  }

  /**
   * The user's row among the people of every space beside the personal one: written as a space is
   * opened, when the row says something else than the profile, or was not seen today. Opening
   * it again the same day writes nothing. The personal space has no people: it is only you.
   */
  private meetSpaces() {
    const me = this.snapshot.me;
    if (!me) return;
    this.taskWrites = this.taskWrites
      .then(async () => {
        const met = new Map<string, Person[]>();
        for (const [id, space] of this.opened) {
          try {
            const people = await loadPeople(space.fs);
            if (samePerson(people, me)) continue;
            const next = withPerson(people, me);
            await savePeople(space.fs, next);
            met.set(id, next);
          } catch {
            // Written the next time the space is opened.
          }
        }
        if (met.size > 0) this.set({ spaces: this.snapshot.spaces.map((space) => ({ ...space, people: met.get(space.id) ?? space.people })), saved: false });
      })
      .catch(() => undefined)
      .then(() => this.markSaved());
  }

  /** Makes a person of a space inactive, or active again: an inactive one is not offered when a task or a card is given. */
  setPersonActive(space: string, person: string, active: boolean) {
    const opened = this.opened.get(space);
    if (!opened) return;
    this.set({ spaces: this.snapshot.spaces.map((each) => (each.id === space ? { ...each, people: setActive(each.people, person, active) } : each)), saved: false });
    this.taskWrites = this.taskWrites
      .then(async () => savePeople(opened.fs, setActive(await loadPeople(opened.fs), person, active)))
      .catch(() => undefined)
      .then(() => this.markSaved());
  }

  // ---------- the other spaces ----------

  /**
   * Opens the spaces the device lists beside the personal one, in its order. A space whose copy
   * is not there to open is skipped, not forgotten: it may be on a drive that is not plugged in.
   * Nothing is written to a space by opening it.
   */
  private async openSpaces() {
    this.opened = new Map();
    for (const entry of spaceEntries()) {
      try {
        const fs = await openSpaceVault(entry);
        if (!fs) continue;
        const info = await loadSpace(fs);
        const name = info.name ?? entry.name ?? entry.folder?.split(/[\\/]/).pop() ?? t('settings.space');
        this.opened.set(entry.id, { entry, fs, name });
      } catch {
        // Unreadable now; it is tried again the next time the app opens.
      }
    }
    this.fs = new MultiFs(this.personal, new Map([...this.opened].map(([id, space]) => [id, space.fs])));
  }

  /** The spaces as the interface shows them, each with its tree read now. */
  private async spaceViews(reads: (key: string) => boolean = () => true): Promise<SpaceView[]> {
    return Promise.all(
      [...this.opened].map(async ([id, space]) => {
        const shown = this.snapshot.spaces.find((each) => each.id === id);
        return {
          id,
          name: space.name,
          folder: space.entry.folder ?? null,
          source: space.entry.source ?? null,
          people: await loadPeople(space.fs),
          tree: shown && !reads(id) ? shown.tree : prefixTree(await this.treeOf(space.fs).catch(() => []), id),
        };
      }),
    );
  }

  /** A space's tree read again, its notes named from the titles it keeps where they did not change. */
  private async treeOf(fs: VaultFs): Promise<TreeNode[]> {
    const titles = await loadNoteTitles(fs);
    const tree = await readTree(fs, '', titles);
    await saveNoteTitles(fs, titles);
    return tree;
  }

  /** Where a path of the app is: its space's files, the space, and the path as those files have it. */
  private at(path: string): SpaceAt {
    return this.fs.at(path);
  }

  /** An attached file's path in the app: `src` as a note, a card or a record at `home` has it, in the space `home` is in. */
  private attached(home: string, src: string): string {
    return inSpace(spaceOfTab(home), src);
  }

  /** The note in the editor, whose attached files the editor shows. */
  private get onScreen(): string {
    return this.snapshot.active ?? '';
  }

  /** The trash read again, and how many attached files there are with it: one going to the trash or coming back changes both. */
  private async freshTrash() {
    this.set({ trash: await this.readTrash() });
    await this.recountFiles();
  }

  /**
   * Counts the attached files of every space, those left in the cloud too, for the sidebar; and
   * learns which are left there, for the notes to show them in their place. A note shows them
   * anew when that changed.
   */
  private async recountFiles() {
    let count = 0;
    const away = new Map<string, AwayFile>();
    for (const [space, fs] of this.fs.all()) {
      const here = (await fs.list(ATTACHMENTS).catch(() => [])).filter((e) => e.kind === 'file' && !e.name.startsWith('.') && !e.name.startsWith('_'));
      const known = new Set(here.map((e) => e.path.toLowerCase()));
      const there = (await readAway(fs).catch(() => [])).filter((file) => dirname(file.path) === ATTACHMENTS && !known.has(file.path.toLowerCase()));
      for (const file of there) away.set(inSpace(space, file.path).toLowerCase(), { ...file, path: inSpace(space, file.path) });
      count += here.length + there.length;
    }
    const changed = away.size !== this.awayFiles.size || [...away.keys()].some((key) => !this.awayFiles.has(key));
    this.awayFiles = away;
    if (count !== this.snapshot.fileCount) this.set({ fileCount: count });
    if (changed) this.editor?.refreshMedia();
  }

  /** The attached files left in the cloud, by their path in the app, lowercased. */
  private awayFiles = new Map<string, AwayFile>();
  /** Brings a file left in the cloud here, told how much of it came; set by sync. */
  fetcher: ((path: string, onBytes: (done: number) => void) => Promise<boolean>) | null = null;
  private fetching = new Map<string, Promise<boolean>>();
  private watchers = new Map<string, Set<(done: number | null) => void>>();

  /** The attached file at `path` when it is left in the cloud; null when it is here. */
  awayAt(path: string): AwayFile | null {
    return this.awayFiles.get(path.toLowerCase()) ?? null;
  }

  /**
   * Brings an attached file left in the cloud here, once however often it is asked for, telling
   * those watching how far it got. True once it is here.
   */
  download(path: string): Promise<boolean> {
    const running = this.fetching.get(path);
    if (running) return running;
    const size = this.awayAt(path)?.size ?? 0;
    const tell = (done: number | null) => {
      for (const watcher of this.watchers.get(path) ?? []) watcher(done);
    };
    let shownAt = 0;
    const onBytes = (done: number) => {
      tell(done);
      // The lists show how far it got a few times a second.
      if (Date.now() - shownAt < 250) return;
      shownAt = Date.now();
      this.set({ downloads: { ...this.snapshot.downloads, [path]: { done, size } } });
    };
    this.set({ downloads: { ...this.snapshot.downloads, [path]: { done: 0, size } } });
    tell(0);
    const job = (async () => {
      let here = false;
      try {
        here = (await this.fetcher?.(path, onBytes)) ?? false;
      } catch {
        // Offline, or gone from the cloud: it can be asked for again.
      }
      this.fetching.delete(path);
      if (here) {
        this.forgetMedia([path]);
        await this.recountFiles();
      }
      const { [path]: _done, ...downloads } = this.snapshot.downloads;
      this.set({ downloads, fileVersion: this.snapshot.fileVersion + 1 });
      tell(null);
      return here;
    })();
    this.fetching.set(path, job);
    return job;
  }

  /** Tells how a download of the file at `path` goes, at once when it is on its way; returns what stops telling. */
  watchDownload(path: string, tell: (done: number | null) => void): () => void {
    let watchers = this.watchers.get(path);
    if (!watchers) this.watchers.set(path, (watchers = new Set()));
    watchers.add(tell);
    const going = this.snapshot.downloads[path];
    if (going) tell(going.done);
    return () => {
      watchers.delete(tell);
      if (watchers.size === 0) this.watchers.delete(path);
    };
  }

  /** The trash of every space as one list, each item's paths carrying its space. */
  private async readTrash(reads: (key: string) => boolean = () => true): Promise<TrashItem[]> {
    const lists = await Promise.all(
      this.fs.all().filter(([space]) => reads(space ?? PERSONAL)).map(async ([space, fs]) => (await readTrash(fs).catch(() => [])).map((item) => ({ ...item, path: inSpace(space, item.path), from: inSpace(space, item.from) }))),
    );
    return lists.flat().sort((a, b) => b.deleted.localeCompare(a.deleted));
  }

  /** A trash item as its space's files have it, with the files. */
  private trashAt(item: TrashItem): [VaultFs, TrashItem] {
    return [this.at(item.from).fs, { ...item, path: localPath(item.path), from: localPath(item.from) }];
  }

  /**
   * Adds a space that lives in a cloud folder: its copy on this device is made (on desktop a
   * folder named after it in the app's data folder), and its sync brings what the folder holds.
   * A folder that is a space already keeps the id it has, so that the same space is the same on
   * every device; `id` is that one, read from the folder. A space that is there already
   * (`existing`) comes with its own name, which its sync brings; only a new one has `name`
   * written in it. Returns the space's id.
   */
  async addSpace(name: string, source: SpaceSource, id?: string, existing = false): Promise<string> {
    const entries = spaceEntries();
    const kept = isSpaceId(id) && !entries.some((each) => each.id === id) ? id : newSpaceId();
    const made = await newSpaceFolder(kept, name.trim());
    const fs = await openSpaceVault(made);
    if (!fs) throw new Error(t('error.create'));
    if (!existing) await saveSpace(fs, { id: kept, name: name.trim() });
    await addSpaceEntry({ ...made, source });
    await this.reloadSpaces();
    return kept;
  }

  /** The files of a space's copy on this device, for its sync; null when it is not open. */
  spaceVault(id: string): VaultFs | null {
    return this.opened.get(id)?.fs ?? null;
  }

  /** Forgets a space on this device; with `deleteFiles`, its copy here goes too. Its tabs close. */
  async removeSpace(id: string, deleteFiles: boolean) {
    await this.settle();
    for (const tab of this.snapshot.tabs.filter((each) => spaceOfTab(each) === id)) await this.detach(tab);
    await removeSpaceEntry(id, deleteFiles);
    await this.reloadSpaces();
  }

  /**
   * Desktop: moves a space's copy on this device into a folder chosen for it. What is unsaved is
   * saved first; the tabs stay open, their paths the same, and read the files where they are now.
   */
  async moveSpaceCopy(id: string, to: string) {
    await this.settle();
    try {
      await moveSpaceEntry(id, to);
    } finally {
      // Opened again either way, so that its sync starts again where its files are.
      await this.reloadSpaces();
    }
  }

  /** Moves a space up or down in the sidebar's order. */
  async moveSpace(id: string, by: -1 | 1) {
    const ids = this.snapshot.spaces.map((space) => space.id);
    const at = ids.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    ids.splice(at, 1);
    ids.splice(to, 0, id);
    await orderSpaceEntries(ids);
    await this.reloadSpaces();
  }

  /** Names a space beside the personal one; the name is kept in the space. */
  renameSpaceById(id: string, name: string) {
    const space = this.opened.get(id);
    if (!space) return;
    space.name = name.trim() || space.name;
    this.set({ spaces: this.snapshot.spaces.map((each) => (each.id === id ? { ...each, name: space.name } : each)), saved: false });
    this.taskWrites = this.taskWrites
      .then(async () => saveSpace(space.fs, { ...(await loadSpace(space.fs)), id, name: name.trim() }))
      .catch(() => undefined)
      .then(() => this.markSaved());
  }

  /** Opens the spaces again after the device's list changed, and reads everything of them; a space added has the user among its people. */
  private async reloadSpaces() {
    await this.flush();
    await this.openSpaces();
    await this.refreshTree();
    this.meetSpaces();
  }

  /** The text of every open note of a space, saved or not: the notes that may link to its attached files. */
  private openTexts(space: string | null): string[] {
    const mine = (path: string) => spaceOf(path) === space;
    return [
      ...[...this.pending].filter(([path]) => mine(path)).map(([, text]) => text),
      ...[...this.states].filter(([path]) => mine(path)).map(([, state]) => state.doc.toString()),
      // With no note on screen the editor holds the last one shown, which may be gone.
      ...(this.editor && this.snapshot.active && isNote(this.snapshot.active) && mine(this.onScreen) ? [this.editor.view.state.doc.toString()] : []),
    ];
  }

  dispose() {
    this.run++;
    if (this.opening) window.clearTimeout(this.opening.timer);
    this.opening = null;
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

  /** Writes every unsaved note to the vault; keys files waiting to be written are queued too. */
  flush = async () => {
    this.flushKeys();
    window.clearTimeout(this.timer);
    const writes = [...this.pending];
    this.pending.clear();
    await Promise.all(
      writes.map(async ([path, doc]) => {
        const before = this.disk.get(path);
        let text = doc;
        let held = before;
        if (before !== undefined) {
          // Sync, or another program, may have written the file since it was read here: what it
          // wrote is kept, merged line by line with what was typed.
          const disk = await this.fs.readText(path).catch(() => undefined);
          if (disk !== undefined && disk !== before && disk !== doc) {
            held = disk;
            const merged = mergeText(before, doc, disk);
            if (merged.clean) {
              text = merged.text;
              this.showMerged(path, doc, text);
            } else {
              await this.keep(path, disk, true);
              // What was typed is written; what came from elsewhere goes beside it, as sync puts
              // it, for every device to find.
              await this.conflictCopy(path, disk);
            }
          }
        }
        // What the file held before this save is kept as a version, at most every ten minutes.
        if (held !== undefined && held !== text) await this.keep(path, held);
        await this.fs.writeText(path, text);
        this.disk.set(path, text);
        // A record edited as a note: its collection shows what was written.
        if (dirname(path) in this.snapshot.collections) await this.reloadCollection(dirname(path));
      }),
    );
    this.markSaved();
    void this.trashUnlinkedFiles();
  };

  /** Another version of a note, beside it: `Plan (conflict, iPhone, 2026-10-14 0932).md`. */
  private async conflictCopy(path: string, text: string) {
    const siblings = await this.fs.list(dirname(path)).catch(() => []);
    const copy = conflictPath(path, this.deviceName, new Date(), new Set(siblings.map((s) => s.path.toLowerCase())));
    await this.fs.writeText(copy, text).catch(() => undefined);
  }

  /** Puts text merged in from the file into the open note, the cursor staying where it was. */
  private showMerged(path: string, saved: string, merged: string) {
    const view = path === this.snapshot.active ? this.editor?.view : undefined;
    const state = view?.state ?? this.states.get(path);
    if (!state) return;
    const current = state.doc.toString();
    // Typed on while it was saved: the merge goes on top of that too.
    const next = current === saved ? merged : mergeText(saved, current, merged).text;
    if (next === current) return;
    const changes = changeBetween(current, next);
    if (view) {
      this.external = true;
      try {
        view.dispatch({ changes });
      } finally {
        this.external = false;
      }
    } else this.states.set(path, state.update({ changes }).state);
    if (this.pending.has(path)) this.pending.set(path, next);
  }

  /**
   * A note, a card or a record at `home` stopped linking to some attached files, or links to them
   * again. Files linked again come back from the trash at once, as undo, paste or a restored
   * version expect.
   */
  private attachmentsChanged(home: string, removed: string[], added: string[]) {
    for (const src of added) this.unlinked.delete(this.attached(home, src));
    for (const src of removed) this.unlinked.add(this.attached(home, src));
    if (added.length) void this.bringBack(spaceOfTab(home), added);
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

  /** Brings attached files of a space back from the trash that the texts link to. */
  private async bringBack(space: string | null, texts: string[]) {
    try {
      const restored = await restoreAttachments(this.fs.of(space), texts);
      if (restored.length === 0) return;
      // An image may have been read while its file was coming back; it is read again in full.
      this.forgetMedia(restored.map((path) => inSpace(space, path)));
      this.editor?.refreshMedia();
      await this.freshTrash();
    } catch {
      // A file that cannot come back shows as missing; the trash still has it.
    }
  }

  /**
   * Attached files that no note links to any more go to the trash as soon as the note that let
   * go of them is saved, unless another note of their space, saved or not, still links to them.
   */
  private async trashUnlinkedFiles() {
    if (this.unlinked.size === 0) return;
    const paths = [...this.unlinked];
    this.unlinked.clear();
    for (const [space, fs] of this.fs.all()) {
      const mine = paths.filter((path) => spaceOf(path) === space).map(localPath);
      if (mine.length === 0) continue;
      try {
        const moved = await trashUnlinked(fs, mine, () => this.openTexts(space));
        if (moved.length === 0) continue;
        this.forgetMedia(moved.map((path) => inSpace(space, path)));
        await this.freshTrash();
        // An undo or a paste in the moment it took brings them straight back.
        await this.bringBack(space, this.openTexts(space));
      } catch {
        // The next start moves them, as it does any file nothing links to.
      }
    }
  }

  /** Shows "Saved" once nothing waits to be written: no note, no keys file, and no file being copied. */
  private markSaved() {
    if (!this.pending.size && !this.keysPending.size && this.copying === 0 && !this.snapshot.saved) this.set({ saved: true });
  }

  /** Keeps `text` as an earlier version of the note at `path`, as `keepVersion` decides; in its own space's history. */
  private async keep(path: string, text: string, always = false) {
    const now = Date.now();
    // While the version kept last in this session is recent, the vault is not even asked.
    if (!always && now - (this.versionedAt.get(path) ?? 0) < VERSION_EVERY_MS) return;
    try {
      const { fs, local } = this.at(path);
      await keepVersion(fs, local, text, { now: new Date(now), always });
    } catch {
      // The history is a safety net: failing to keep a version must not keep the note from saving.
    }
    this.versionedAt.set(path, now);
  }

  /** The earlier versions of a note, the latest first. */
  async versions(path: string): Promise<Version[]> {
    const { fs, space, local } = this.at(path);
    return (await listVersions(fs, local)).map((version) => ({ ...version, path: inSpace(space, version.path) }));
  }

  readVersion(version: Version): Promise<string> {
    return this.fs.readText(version.path);
  }

  /** A note's history goes with it when it moves in its space. */
  private moveHistory(from: string, to: string): Promise<void> {
    const source = this.at(from);
    const target = this.at(to);
    if (source.space !== target.space) return Promise.resolve();
    return moveHistory(source.fs, source.local, target.local).catch(() => undefined);
  }

  /** The text of an open note as it is now, saved or not. */
  textOf(path: string): string {
    const state = path === this.snapshot.active ? this.editor?.view.state : this.states.get(path);
    return state?.doc.toString() ?? this.disk.get(path) ?? '';
  }

  /** An address the browser can play or show a file attached at `home` from. */
  private mediaUrl(home: string, src: string): Promise<string> {
    return this.mediaUrlOf(this.attached(home, src));
  }

  /** An address the browser can play or show an attached file from, by its path in the app. */
  private async mediaUrlOf(path: string): Promise<string> {
    let url = this.media.get(path);
    if (!url) {
      const blob = await this.fs.readBlob(path);
      url = URL.createObjectURL(new Blob([blob], { type: typeOf(path) }));
      this.media.set(path, url);
    }
    return url;
  }

  /** Opens a file attached at `home`: on desktop with the program the system uses for it, in the browser in a new tab. */
  private async openFile(home: string, src: string) {
    try {
      if (isDesktop) await openFileOnDesktop(this.attached(home, src));
      else window.open(await this.mediaUrl(home, src), '_blank', 'noopener');
    } catch {
      // A file that is gone or cannot be opened simply does not open.
    }
  }

  /** Files were pasted, dropped or picked in the note on screen, to go at `at`. */
  private addFiles(files: File[], at: number) {
    const note = this.snapshot.active;
    if (note && isNote(note)) void this.copyFiles(note, note, files, at);
  }

  /**
   * What an editor or a viewer of something at `home` (a note, a board, a collection) needs of
   * the vault's files: its images, its other files and their sizes, all in the space `home` is in.
   */
  private filesOf(home: () => string) {
    return {
      resolveImage: (src: string) => this.resolveImageAt(home(), src),
      openFile: (src: string) => void this.openFile(home(), src),
      revealFile: isDesktop ? (src: string) => void revealFileOnDesktop(this.attached(home(), src)).catch(() => undefined) : undefined,
      openLink: isDesktop ? (href: string) => void openUrlOnDesktop(href).catch(() => undefined) : undefined,
      fileSize: (src: string) => this.sizes.get(this.attached(home(), src)) ?? this.awayAt(this.attached(home(), src))?.size,
      resolveAudio: (src: string) => this.mediaUrl(home(), src),
      away: (src: string) => this.awayAt(this.attached(home(), src)),
      download: (src: string) => this.download(this.attached(home(), src)),
      watchDownload: (src: string, tell: (done: number | null) => void) => this.watchDownload(this.attached(home(), src), tell),
    };
  }

  /**
   * A second editor, for a card's description or a record's notes at `home` (its board or its
   * collection): wired to the files of that space like the note editor, but its text belongs to
   * whoever opened it. Destroyed by them too.
   */
  openEditor(home: string, parent: HTMLElement, doc: string, onChange: (doc: string) => void, hint?: string): ScrawlEditor {
    const editor: ScrawlEditor = createEditor({
      parent,
      doc,
      onChange,
      // What shows while it is empty.
      placeholder: hint
        ? () => {
            const shown = document.createElement('span');
            shown.textContent = hint;
            return shown;
          }
        : undefined,
      ...this.filesOf(() => home),
      addFiles: (files, at) => void this.copyFiles(editor.view, home, files, at),
      showMenu: (at, items, about) => this.showMenu?.(at, items, about),
      touch: this.touch,
      onLinkTap: this.touch ? (link) => this.linkTap?.(link) : undefined,
      onAttachments: (removed, added) => this.attachmentsChanged(home, removed, added),
    });
    return editor;
  }

  /**
   * Copies files chosen with Attach into a second editor, on a line of their own: the cursor's,
   * when it is empty, else a new one under it. They go to the attachments of the space `home` is in.
   */
  attachTo(editor: ScrawlEditor, home: string, files: File[]) {
    const { view } = editor;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    let at = view.state.selection.main.head;
    if (line.text.trim() !== '') {
      view.dispatch({ changes: { from: line.to, insert: '\n' }, selection: { anchor: line.to + 1 } });
      at = line.to + 1;
    }
    void this.copyFiles(view, home, files, at);
  }

  /** A read-only view of Markdown, for a comment on a card of the board at `home`: images and files of its space show in it. */
  openViewer(home: string, parent: HTMLElement, doc: string): ScrawlViewer {
    return createViewer({ parent, doc, ...this.filesOf(() => home) });
  }

  /** The text of a note as the vault has it; empty when it cannot be read. */
  readNote(path: string): Promise<string> {
    return this.fs.readText(path).catch(() => '');
  }

  /**
   * Copies files into the attachments one after another. Each shows where it will land, with how
   * far it got and a way to stop it, and goes into the note once it is there. A copy that is
   * stopped or fails leaves nothing behind. `target` is a note by its path, or an editor; the
   * files go to the attachments of the space `home` is in.
   */
  private async copyFiles(target: string | EditorView, home: string, files: File[], at: number) {
    const { fs } = this.at(home);
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
    this.applyTo(target, { effects: jobs.map(({ copy }) => addCopy.of({ copy, pos: at })) });
    this.copying += jobs.length;
    this.set({ saved: false });
    for (const { file, copy, stop } of jobs) {
      // A copy that is over within half a second never shows.
      const reveal = window.setTimeout(() => this.applyTo(target, { effects: showCopy.of(copy.id) }), 500);
      let told = 0;
      const onProgress = (written: number) => {
        if (Date.now() - told < 100 && written < file.size) return;
        told = Date.now();
        this.applyTo(target, { effects: copyProgress.of({ id: copy.id, written }) });
      };
      try {
        const options = { onProgress, signal: stop.signal };
        const src = copy.image ? await saveAttachment(fs, file, new Date(), options) : await saveFile(fs, file, options);
        this.sizes.set(this.attached(home, src), file.size);
        // In the browser the copied file is at hand, so the image need not be read back.
        if (copy.image && !isDesktop) this.images.set(this.attached(home, src), Promise.resolve(URL.createObjectURL(file)));
        const markdown = copy.image ? `![](${src})` : `[${linkText(file.name)}](${linkAddress(src)})`;
        this.applyTo(
          target,
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
        this.applyTo(target, { effects: dropCopy.of(copy.id) });
      } finally {
        window.clearTimeout(reveal);
        this.copying--;
        this.markSaved();
        void this.recountFiles();
      }
    }
  }

  /**
   * Changes a note wherever it is: in the editor when it is on screen, in its kept state when
   * its tab is in the background. A note whose tab was closed gets `appended` at its end, if given.
   * Another editor is changed directly, as long as it is still there.
   */
  private applyTo(path: string | EditorView, change: TransactionSpec | ((state: EditorState) => TransactionSpec | null), appended?: string) {
    const make = typeof change === 'function' ? change : () => change;
    if (typeof path !== 'string') {
      try {
        const spec = make(path.state);
        if (spec) path.dispatch(spec);
      } catch {
        // The editor was closed while the file was copied; the file stays in the attachments.
      }
      return;
    }
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
    const path = await saveAttachment(this.at(note).fs, blob);
    this.sizes.set(this.attached(note, path), blob.size);
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

  /** The address an image of the note on screen loads from: what its history shows of it. */
  resolveImage = (src: string): string | Promise<string> => this.resolveImageAt(this.onScreen, src);

  /**
   * The address an image of something at `home` loads from. On desktop the web view reads it from
   * its space's folder itself; in the browser it is read from storage the first time it shows.
   */
  private resolveImageAt(home: string, src: string): string | Promise<string> {
    if (!src.startsWith(`${ATTACHMENTS}/`)) return src;
    return this.imageOf(this.attached(home, src));
  }

  /** The address an attached image loads from, by its path in the app: Files shows it small. */
  imageOf = (path: string): string | Promise<string> => {
    if (isDesktop) return fileUrl(path);
    let url = this.images.get(path);
    if (!url) {
      url = this.fs.readBlob(path).then((blob) => URL.createObjectURL(blob));
      // An image that could not be read is tried again the next time.
      url.catch(() => this.images.delete(path));
      this.images.set(path, url);
    }
    return url;
  }

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
    const { fs, space } = this.at(path);
    const restored = await restoreAttachments(fs, [text]).catch(() => []);
    if (restored.length) {
      this.forgetMedia(restored.map((each) => inSpace(space, each)));
      await this.freshTrash();
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
    const { tabs, active, boards, boardLooks, keys, keysLooks, collections, collectionLooks, folderLooks } = this.snapshot;
    // Boards and keys files that are gone are forgotten.
    void saveWorkspace(this.personal, {
      tabs,
      active,
      boards: Object.fromEntries(Object.entries(boardLooks).filter(([path]) => path in boards)),
      keys: Object.fromEntries(Object.entries(keysLooks).filter(([path]) => path in keys)),
      collections: Object.fromEntries(Object.entries(collectionLooks).filter(([path]) => path in collections)),
      ...(this.welcomeClosed && { welcomeClosed: true }),
      ...(Object.keys(folderLooks).length > 0 && { folders: folderLooks }),
    });
  }

  /**
   * Puts the items of a folder in another order on this device; `key` is its path, a space's key
   * for its top, '' for the personal space's. By when they were made, the times not kept yet are
   * worked out and kept, once.
   */
  lookAtFolder(key: string, look: FolderLook) {
    const { [key]: _was, ...rest } = this.snapshot.folderLooks;
    this.set({ folderLooks: isDefaultLook(look) ? rest : { ...rest, [key]: look } });
    this.saveWorkspace();
    if (look.by === 'created') void this.guessCreatedIn(key);
  }

  /** The times of everything made in every space, read again from the files the devices keep them in. */
  private async readCreatedTimes() {
    const created: Record<string, number> = {};
    for (const [space, fs] of this.fs.all()) {
      for (const [path, time] of await readCreated(fs).catch(() => new Map<string, number>())) created[inSpace(space, path)] = time;
    }
    this.set({ created });
  }

  /**
   * Keeps when things were made, by path in the app: when their files were written, so that a
   * thing just made was made and last written at the same moment; or the time given.
   */
  private async madeNow(paths: string[], at?: Date) {
    const times: Record<string, number> = {};
    for (const path of paths) {
      const { fs, local } = this.at(path);
      const written = at ? undefined : (await fs.stat?.(local).catch(() => null))?.modified;
      const time = at?.getTime() ?? written ?? Date.now();
      await markCreated(fs, this.deviceId, { [local]: time }).catch(() => undefined);
      times[path.toLowerCase()] = time;
    }
    this.set({ created: { ...times, ...this.snapshot.created } });
  }

  /** A rename or a move in a space: what was made at `from` keeps its time at `to`, with what is under it. */
  private async carryMade(from: string, to: string) {
    const { fs, local } = this.at(from);
    await carryCreated(fs, this.deviceId, local, localPath(to)).catch(() => undefined);
    await this.readCreatedTimes();
  }

  /** Works out once when the things in a folder were made, where the app did not keep it, and keeps it. */
  private async guessCreatedIn(key: string) {
    const space = key === '' ? null : spaceOf(key);
    const top = space ? (this.snapshot.spaces.find((each) => each.id === space)?.tree ?? []) : this.snapshot.tree;
    const local = localPath(key);
    const nodes: TreeNode[] = [];
    const visit = (list: TreeNode[]) => {
      for (const node of list) {
        nodes.push(node);
        if (node.children) visit(node.children);
      }
    };
    visit(local === '' ? top : (findNode(top, key)?.children ?? []));
    const missing = nodes.filter((node) => this.snapshot.created[node.path.toLowerCase()] === undefined);
    if (missing.length === 0 || !this.deviceId) return;
    const fs = this.fs.of(space);
    const guessed = await guessCreated(fs, this.deviceId, missing.map((node) => {
      // A collection was made about when its oldest file was written.
      const written = this.snapshot.collections[node.path]?.written?.first ?? node.modified;
      return { path: localPath(node.path), ...(written !== undefined && { modified: written }) };
    })).catch(() => ({}));
    const times = Object.fromEntries(Object.entries(guessed).map(([path, time]) => [inSpace(space, path), time]));
    this.set({ created: { ...times, ...this.snapshot.created } });
  }

  /** Remembers how a board is looked at: as columns or a list, and which phase. */
  lookAtBoard(path: string, look: BoardLook) {
    this.set({ boardLooks: { ...this.snapshot.boardLooks, [path]: look } });
    this.saveWorkspace();
  }

  /** Remembers how a keys file is looked at: as a table or as its text. */
  lookAtKeys(path: string, look: KeysLook) {
    this.set({ keysLooks: { ...this.snapshot.keysLooks, [path]: look } });
    this.saveWorkspace();
  }

  /** Remembers how a collection's table is looked at: the view, the sort, the group and the columns. */
  lookAtCollection(dir: string, look: CollectionLook) {
    this.set({ collectionLooks: { ...this.snapshot.collectionLooks, [dir]: look } });
    this.saveWorkspace();
  }

  /** Changes a collection's schema (its views, for now) and writes its file. Returns a message when it cannot be written. */
  async changeSchema(dir: string, change: (schema: Schema) => Schema): Promise<string | null> {
    const collection = this.snapshot.collections[dir];
    if (!collection) return t('error.record');
    const schema = change(collection.schema);
    if (schema === collection.schema) return null;
    try {
      await this.saveSchemaAt(dir, schema);
    } catch (error) {
      return error instanceof Error ? error.message : t('error.record');
    }
    this.setCollection(dir, (current) => ({ ...current, schema }));
    return null;
  }

  /**
   * Writes what the Fields window changed: the schema, and the records that have a choice renamed,
   * each read with the new schema so that a value of a field taken out stays in its file. The
   * collection is read again, its records as the new schema reads them. Returns a message when it
   * cannot be written.
   */
  async saveFields(dir: string, schema: Schema, renames: ChoiceRenames): Promise<string | null> {
    const collection = this.snapshot.collections[dir];
    if (!collection) return t('error.record');
    await this.settle();
    try {
      await this.saveSchemaAt(dir, schema);
      if (Object.keys(renames).length > 0) {
        for (const { path } of collection.records) {
          const record = parseRecord(await this.fs.readText(path), schema, path);
          const values = renameChoices(record.values, renames);
          if (values === record.values) continue;
          await this.fs.writeText(path, serializeRecord({ ...record, values }, schema));
          // Open as a note too, it is read again when its tab is opened.
          this.disk.delete(path);
          this.states.delete(path);
        }
      }
    } catch (error) {
      return error instanceof Error ? error.message : t('error.record');
    }
    await this.reloadCollection(dir);
    return null;
  }

  /**
   * Writes an import into a collection: its schema with the fields and choices the import adds,
   * then the records it adds and the ones it changes. The collection is read again. Returns a
   * message when it cannot be written.
   */
  async importRecords(dir: string, plan: ImportPlan): Promise<string | null> {
    const collection = this.snapshot.collections[dir];
    if (!collection) return t('error.record');
    await this.settle();
    try {
      if (serializeSchema(plan.schema) !== serializeSchema(collection.schema)) await this.saveSchemaAt(dir, plan.schema);
      const { fs } = this.at(dir);
      const target = this.own({ ...collection, schema: plan.schema });
      for (const input of plan.added) {
        const record = await addCollectionRecord(fs, target, input);
        target.records = [...target.records, record];
      }
      for (const change of plan.updated) {
        const record = collection.records.find((r) => r.id === change.id);
        if (!record) continue;
        await updateCollectionRecord(fs, target.schema, { ...record, path: localPath(record.path) }, { values: change.values, ...(change.body !== undefined && { body: change.body }) });
        this.disk.delete(record.path);
        this.states.delete(record.path);
      }
    } catch (error) {
      await this.reloadCollection(dir);
      return error instanceof Error ? error.message : t('error.record');
    }
    await this.reloadCollection(dir);
    return null;
  }

  /**
   * Makes the collection a block of `dir`'s record screen looks for, which is not there, from the
   * template of its name and linked to `dir`. Numbered when its name is taken, the block points at
   * it. Returns a message when it cannot be made.
   */
  async createLinked(dir: string, target: string): Promise<string | null> {
    const collection = this.snapshot.collections[dir];
    if (!collection) return t('error.create');
    try {
      const { fs, space } = this.at(dir);
      const own = toSpace(space)(target);
      const made = own === null ? null : await createLinkedCollection(fs, this.own(collection), own);
      if (!made) return t('error.create');
      const shown = inSpace(space, made);
      if (shown !== target) await this.saveSchemaAt(dir, retargetLinks(collection.schema, target, shown));
    } catch (error) {
      return error instanceof Error ? error.message : t('error.create');
    }
    await this.refreshTree();
    return null;
  }

  /** The onboarding note was closed on this device; kept in the workspace. */
  private welcomeClosed = false;

  /** The onboarding note's text: a phone's says where things are on a phone. */
  private welcomeText(): string {
    return this.touch ? welcomePhone : welcomeComputer;
  }

  /** Opens the onboarding note, from Search: written again first if it is not there. */
  async openWelcome() {
    await ensureWelcome(this.personal, this.welcomeText());
    await this.open(WELCOME_NOTE);
  }

  /** What is on screen was seen now: Recent lists it first. The views over everything are not in it. */
  seen(id: string) {
    if (VIEWS.has(id)) return;
    this.setRecent(seenNow(this.snapshot.recent, id, Date.now()));
  }

  /** What moved or was renamed keeps its place in Recent under its new tab, open or not. */
  private moveRecent(from: string, to: string) {
    const recent = seenMoved(this.snapshot.recent, from, to);
    if (recent !== this.snapshot.recent) this.setRecent(recent);
  }

  private setRecent(recent: Seen[]) {
    this.set({ recent });
    saveRecent(recent);
  }

  /** A board's or a keys file's look goes with it when it moves. */
  private moveLook(from: string, to: string) {
    const { [from]: look, ...rest } = this.snapshot.boardLooks;
    if (look) this.set({ boardLooks: { ...rest, [to]: look } });
    const { [from]: keysLook, ...others } = this.snapshot.keysLooks;
    if (keysLook) this.set({ keysLooks: { ...others, [to]: keysLook } });
    // A folder keeps its order, and so does every folder in it.
    const folders = Object.entries(this.snapshot.folderLooks);
    if (folders.some(([key]) => key === from || key.startsWith(`${from}/`))) {
      this.set({ folderLooks: Object.fromEntries(folders.map(([key, value]) => [key === from || key.startsWith(`${from}/`) ? to + key.slice(from.length) : key, value])) });
    }
  }

  /** Desktop: asks for the notes folder and opens it. Open notes are saved and closed first. */
  async chooseFolder() {
    if (!this.parent || !(await chooseVaultFolder())) return;
    await this.reopen();
  }

  /** Desktop: goes back to the default folder and opens it. */
  async useDefaultFolder() {
    if (!this.parent) return;
    await useDefaultVaultFolder();
    await this.reopen();
  }

  private async reopen() {
    const parent = this.parent!;
    await this.flush();
    this.dispose();
    this.set({ tabs: [], tree: [], titles: {} });
    await this.start(parent);
  }

  /**
   * Who the user is: a name and an email, either free to be empty; the id is made with the
   * first start and does not change, but for signing in to a server (`takeAccount`). Kept in
   * the personal space, so that every device has it.
   */
  saveProfile(name: string, email: string) {
    const me = this.snapshot.me;
    if (!me) return;
    const { name: _n, email: _e, ...rest } = me;
    this.keepMe({ ...rest, ...(name.trim() && { name: name.trim() }), ...(email.trim() && { email: email.trim() }) });
  }

  /**
   * Signed in to a server, or set it up: this device takes the account's id, so that the person
   * is one in every space and what is given to them stays theirs (design/server.md, section 6);
   * Profile's name and email, where empty, are the account's.
   */
  takeAccount(account: { id?: string | undefined; name: string; email: string }) {
    const me = this.snapshot.me;
    if (!me) return;
    const next = fillMe(account.id && account.id !== me.id ? { ...me, id: account.id } : me, account.name, account.email);
    if (next !== me) this.keepMe(next);
  }

  private keepMe(me: Me) {
    this.set({ me, saved: false });
    this.taskWrites = this.taskWrites
      .then(() => saveMe(this.personal, me))
      .catch(() => undefined)
      .then(() => this.markSaved());
    // The spaces have the person as they are now.
    this.meetSpaces();
  }

  /** The name a card's timeline records for what is done here; none while the name is empty. */
  private get by(): string | undefined {
    return this.snapshot.me?.name;
  }

  /**
   * Picks up what changed outside the app: notes that were added, renamed or removed, and open
   * notes whose file was edited in another program.
   */
  async rescan(only?: string | null) {
    if (!this.snapshot.ready) return;
    await this.flush();
    for (const path of this.snapshot.tabs) {
      if (only !== undefined && (spaceOfTab(path) ?? PERSONAL) !== (only ?? PERSONAL)) continue;
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
    await this.refreshTree(only);
  }

  /** Writes every unsaved note, task list, board and keys file. */
  private async settle() {
    await this.flush();
    await this.taskWrites;
  }

  /** The readings of the tree asked for, one after another; the one waiting to begin, with the spaces it reads. */
  private refreshes: Promise<void> = Promise.resolve();
  private waitingRefresh: { spaces: 'all' | Set<string>; done: Promise<void> } | null = null;

  /**
   * Reads the trees again, with every task list, board, keys file and collection and the trash:
   * of one space, `only` (null for the personal one), after its sync turn, or of all of them.
   * Readings go one after another, each showing what it read; one asked for while another waits
   * to begin is taken into that one. While the app opens, its reading has what is there: the tree
   * is read again once it is done.
   */
  private refreshTree(only?: string | null): Promise<void> {
    if (this.opening) {
      this.refreshLater = true;
      return Promise.resolve();
    }
    const key = only === undefined ? null : (only ?? PERSONAL);
    const waiting = this.waitingRefresh;
    if (waiting) {
      if (key === null) waiting.spaces = 'all';
      else if (waiting.spaces !== 'all') waiting.spaces.add(key);
      return waiting.done;
    }
    const next: { spaces: 'all' | Set<string>; done: Promise<void> } = { spaces: key === null ? 'all' : new Set([key]), done: Promise.resolve() };
    next.done = this.refreshes.then(() => {
      this.waitingRefresh = null;
      return this.readAgain(next.spaces);
    });
    this.waitingRefresh = next;
    this.refreshes = next.done.catch(() => undefined);
    return next.done;
  }

  /** Reads the spaces again, `'all'` or those named, and shows them; the others stay as they are shown. */
  private async readAgain(spaces: 'all' | ReadonlySet<string>) {
    const reads = (key: string) => spaces === 'all' || spaces.has(key);
    const mine = (path: string) => reads(spaceOf(path) ?? PERSONAL);
    await this.settle();
    const edits = new Map(this.edits);
    const before = this.snapshot;
    const tree = reads(PERSONAL) ? await this.treeOf(this.personal) : before.tree;
    const views = await this.spaceViews(reads);
    const readNodes = [...(reads(PERSONAL) ? tree : []), ...views.filter((view) => reads(view.id)).flatMap((view) => view.tree)];
    const read = await this.readLists(readNodes, reads(PERSONAL));
    const trash = await this.readTrash(reads);
    const filters = reads(PERSONAL) ? await loadFilters(this.personal) : before.filters;
    const space = reads(PERSONAL) ? await loadSpace(this.personal) : before.space;
    const now = this.snapshot;
    // A list, a board or a keys file changed here while it was read stays as it is shown: it is
    // being written, and what was read is older. Those of the spaces not read again stay too.
    const fresh = <T>(got: Record<string, T>, shown: Record<string, T>) => ({
      ...Object.fromEntries(Object.entries(shown).filter(([path]) => !mine(path))),
      ...Object.fromEntries(Object.entries(got).map(([path, value]) => [path, path in shown && this.edits.get(path) !== edits.get(path) ? shown[path]! : value])),
    });
    const everything = [...tree, ...views.flatMap((view) => view.tree)];
    this.set({
      tree,
      spaces: views,
      titles: titlesOf(everything),
      tasks: fresh(read.tasks, now.tasks),
      sections: fresh(read.sections, now.sections),
      boards: fresh(read.boards, now.boards),
      keys: fresh(read.keys, now.keys),
      collections: freshenAll({ ...Object.fromEntries(Object.entries(now.collections).filter(([dir]) => !mine(dir))), ...read.collections }),
      trash: [...now.trash.filter((item) => !mine(item.path)), ...trash].sort((a, b) => b.deleted.localeCompare(a.deleted)),
      filters,
      space,
    });
    await this.recountFiles();
    // Times of things made on other devices come with their files.
    void this.readCreatedTimes();
  }

  /** A task list, a board or a keys file was changed here. */
  private edited(path: string) {
    this.edits.set(path, (this.edits.get(path) ?? 0) + 1);
  }

  /** The personal space's files, for sync; null until it is open and read. */
  get vault(): VaultFs | null {
    return this.snapshot.ready && !this.snapshot.reading.has(PERSONAL) ? this.personal : null;
  }

  /** Before a turn of sync: everything waiting is written, so that the turn takes it along. */
  beforeSync(): Promise<void> {
    return this.settle();
  }

  /**
   * After a turn of sync: tabs follow what moved on another device and close for what was
   * deleted there, and everything it changed is read again.
   */
  async afterSync(report: SyncReport, space: string | null = null) {
    if (!this.snapshot.ready) return;
    // The report has the space's own paths; the tabs have the app's.
    const app = fromSpace(space);
    for (const { from, to } of report.followed) {
      if (to.startsWith('.scrawl/trash/')) await this.detach(tabOf(app(from)));
      else await this.follow(app(from), app(to));
    }
    for (const path of report.removedHere) await this.detach(tabOf(app(path)));
    const changed = [report.downloaded, report.merged, report.conflicts, report.moved, report.removedHere].some((paths) => paths.length > 0);
    // Only this space changed: the others are not read again.
    if (changed) await this.rescan(space);
  }

  /** A file moved by sync: its tab and editing state go with it. */
  private async follow(from: string, to: string) {
    const state = this.states.get(from);
    if (state) {
      this.states.delete(from);
      this.states.set(to, state);
    }
    const onDisk = this.disk.get(from);
    if (onDisk !== undefined) {
      this.disk.delete(from);
      this.disk.set(to, onDisk);
    }
    const record = this.records.get(from);
    if (record !== undefined) {
      this.records.delete(from);
      this.records.set(to, record);
    }
    if (from.endsWith('.md')) {
      await this.moveHistory(from, to);
      this.versionedAt.delete(from);
    }
    this.moveLook(from, to);
    const [tab, target] = [tabOf(from), tabOf(to)];
    this.moveRecent(tab, target);
    const { tabs, active } = this.snapshot;
    if (!tabs.includes(tab)) return;
    this.set({ tabs: tabs.map((each) => (each === tab ? target : each)), active: active === tab ? target : active });
    this.saveWorkspace();
  }

  /** Reads Inbox and every other task list, every board, every keys file and every collection in the vault. */
  private async readLists(tree: TreeNode[], withInbox = true): Promise<Pick<Snapshot, 'tasks' | 'sections' | 'boards' | 'keys' | 'collections'>> {
    const paths = withInbox ? [INBOX_TASKS] : [];
    const boardPaths: string[] = [];
    const keysPaths: string[] = [];
    const collectionDirs: string[] = [];
    const visit = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'tasks') paths.push(node.path);
        else if (node.kind === 'board') boardPaths.push(node.path);
        else if (node.kind === 'keys') keysPaths.push(node.path);
        else if (node.kind === 'collection') collectionDirs.push(node.path);
        else if (node.kind === 'folder') visit(node.children ?? []);
      }
    };
    visit(tree);
    // The text read is kept, to tell later whether the file changed there since. A file that
    // cannot be read now, as it is being written, keeps what is shown of it: shown empty, it
    // would be written empty with the next change. One not shown yet is empty until it is read.
    const read = async (path: string) => {
      const text = await this.fs.readText(path).catch(() => null);
      if (text !== null) this.records.set(path, text);
      return text;
    };
    const { tasks, sections, boards: shownBoards, keys: shownKeys } = this.snapshot;
    const lists = await Promise.all(
      paths.map(async (path) => {
        const text = await read(path);
        return [path, text === null && path in tasks ? { tasks: tasks[path]!, sections: sections[path] ?? [] } : this.parseListAt(path, text ?? '')] as const;
      }),
    );
    const boards = await Promise.all(
      boardPaths.map(async (path) => {
        const text = await read(path);
        return [path, text === null && path in shownBoards ? shownBoards[path]! : this.parseBoardAt(path, text ?? '')] as const;
      }),
    );
    const keys = await Promise.all(keysPaths.map(async (path) => [path, (await read(path)) ?? shownKeys[path] ?? ''] as const));
    // A collection that cannot be read (its schema file gone meanwhile) is left out, not shown broken.
    const collections = await Promise.all(collectionDirs.map(async (dir) => [dir, await this.loadCollectionAt(dir).catch(() => null)] as const));
    const loaded = Object.fromEntries(collections.filter((entry): entry is readonly [string, Collection] => entry[1] !== null));
    return {
      tasks: Object.fromEntries(lists.map(([path, list]) => [path, list.tasks])),
      sections: Object.fromEntries(lists.map(([path, list]) => [path, list.sections])),
      boards: Object.fromEntries(boards),
      keys: Object.fromEntries(keys),
      collections: freshenAll(loaded),
    };
  }

  // ---------- collections ----------

  // A task list, a board or a collection holds the paths of its notes, cards and collections as
  // its space's own; in the app they carry the space. A link to another space is left out as it
  // is written, having no place in the file (see `spaces.ts` in core).

  private parseListAt(path: string, text: string): ReturnType<typeof parseList> {
    const list = parseList(text);
    return { ...list, tasks: rebaseTasks(list.tasks, fromSpace(spaceOf(path))) };
  }

  private serializeListAt(path: string, list: Parameters<typeof serializeList>[0]): string {
    return serializeList({ ...list, tasks: rebaseTasks(list.tasks, toSpace(spaceOf(path))) });
  }

  private parseBoardAt(path: string, text: string): Board {
    return rebaseBoard(parseBoard(text), fromSpace(spaceOf(path)));
  }

  private serializeBoardAt(path: string, board: Board): string {
    return serializeBoard(rebaseBoard(board, toSpace(spaceOf(path))));
  }

  /** A collection as its space's files have it: its own paths, its links to another space left out. */
  private own(collection: Collection): Collection {
    return rebaseCollection(collection, toSpace(spaceOf(collection.dir)));
  }

  private async loadCollectionAt(dir: string): Promise<Collection> {
    const { fs, space, local } = this.at(dir);
    return rebaseCollection(await loadCollection(fs, local), fromSpace(space));
  }

  private saveSchemaAt(dir: string, schema: Schema): Promise<void> {
    const { fs, space, local } = this.at(dir);
    return saveSchema(fs, local, rebaseSchema(schema, toSpace(space)));
  }

  /** Reads a collection again, after its files changed on disk. */
  private async reloadCollection(dir: string) {
    const loaded = await this.loadCollectionAt(dir).catch(() => null);
    if (!loaded || !(dir in this.snapshot.collections)) return;
    this.set({ collections: freshenAll({ ...this.snapshot.collections, [dir]: loaded }) });
  }

  /** Changes a collection as it is held; every link to its records shows their names as they are now. */
  private setCollection(dir: string, change: (collection: Collection) => Collection) {
    const current = this.snapshot.collections[dir];
    if (!current) return;
    this.set({ collections: freshenAll({ ...this.snapshot.collections, [dir]: change(current) }) });
  }

  /**
   * A collection's folder went from `from` to `to`: links in every collection point there now, its
   * records open as notes follow their files with their history, and its tab and look go along.
   */
  private async recollect(from: string, to: string) {
    await this.carryMade(from, to);
    const records = this.snapshot.collections[from]?.records ?? [];
    for (const record of records) {
      const target = `${to}${record.path.slice(from.length)}`;
      if (this.snapshot.tabs.includes(record.path)) await this.follow(record.path, target);
      else {
        await this.moveHistory(record.path, target);
        this.moveRecent(record.path, target);
      }
    }
    await this.retargetSchemas(from, to);
    // Boards' links and tasks about its records follow it too.
    for (const path of Object.keys(this.snapshot.boards)) this.changeBoard(path, (board) => retargetBoardLinks(board, from, to));
    for (const list of Object.keys(this.snapshot.tasks)) this.changeList(list, (current) => relinkTaskRecords(current, from, to));
    const { [from]: look, ...looks } = this.snapshot.collectionLooks;
    const [tab, target] = [collectionTab(from), collectionTab(to)];
    this.moveRecent(tab, target);
    const { tabs, active } = this.snapshot;
    this.set({
      collectionLooks: look ? { ...looks, [to]: look } : looks,
      tabs: tabs.map((each) => (each === tab ? target : each)),
      active: active === tab ? target : active,
    });
    await this.refreshTree();
    this.saveWorkspace();
  }

  /** The collection or the board at `from` went to `to`: links, linked-record blocks and rollups in every collection point there now. */
  private async retargetSchemas(from: string, to: string) {
    for (const [dir, collection] of Object.entries(this.snapshot.collections)) {
      const schema = retargetLinks(collection.schema, from, to);
      if (schema !== collection.schema) await this.saveSchemaAt(dir === from ? to : dir, schema).catch(() => undefined);
    }
  }

  /** Gives a collection a name; its folder is renamed. Returns a message when the name cannot be used. */
  async renameCollection(dir: string, name: string): Promise<string | null> {
    const done = await this.renamedCollection(dir, name);
    return 'error' in done ? done.error : null;
  }

  /** Renames a collection; returns its folder after, or why it cannot be. */
  private async renamedCollection(dir: string, name: string): Promise<{ path: string } | { error: string }> {
    await this.settle();
    try {
      const { fs, space, local } = this.at(dir);
      const target = inSpace(space, await renameCollectionDir(fs, local, name));
      if (target !== dir) await this.recollect(dir, target);
      return { path: target };
    } catch (error) {
      return { error: error instanceof Error ? error.message : t('error.rename') };
    }
  }

  /** Moves a collection's folder into `folder` of its space; a move to another space is not made here. */
  async moveCollection(dir: string, folder: string) {
    const source = this.at(dir);
    const into = this.at(folder);
    if (source.space !== into.space) return;
    await this.settle();
    const target = inSpace(source.space, await moveCollectionDir(source.fs, source.local, into.local));
    if (target !== dir) await this.recollect(dir, target);
  }

  /** Adds a record to a collection, as a file of its own named after its id. Returns a message when it cannot be made. */
  async addRecord(dir: string, input: NewRecord): Promise<string | null> {
    const collection = this.snapshot.collections[dir];
    if (!collection) return t('error.create');
    try {
      const { fs, space } = this.at(dir);
      const made = await addCollectionRecord(fs, this.own(collection), input);
      const record = { ...made, path: inSpace(space, made.path) };
      this.setCollection(dir, (current) => ({ ...current, records: [...current.records, record] }));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : t('error.create');
    }
  }

  /** Changes a record and writes its file, which stays where it is. Returns a message when it cannot be saved. */
  async updateRecord(dir: string, id: string, patch: RecordPatch): Promise<string | null> {
    const collection = this.snapshot.collections[dir];
    const record = collection?.records.find((r) => r.id === id);
    if (!collection || !record) return t('error.record');
    try {
      const { fs, space } = this.at(dir);
      const written = await updateCollectionRecord(fs, this.own(collection).schema, { ...record, path: localPath(record.path) }, patch);
      const next = { ...written, path: inSpace(space, written.path) };
      // Open as a note too, it is read again when its tab is opened.
      this.disk.delete(next.path);
      this.states.delete(next.path);
      this.setCollection(dir, (current) => ({ ...current, records: current.records.map((r) => (r.id === id ? next : r)) }));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : t('error.record');
    }
  }

  /** Moves a record's file to the trash, with the files only it used; the interface asks first. */
  async trashRecord(dir: string, record: CollectionRecord) {
    await this.settle();
    await this.detach(record.path);
    await this.trashWithFiles(record.path, false);
    this.setCollection(dir, (current) => ({ ...current, records: current.records.filter((r) => r.id !== record.id) }));
    await this.freshTrash();
  }

  /**
   * Moves an item or a folder to the trash, and with it the attached files only it used: they
   * come back with it. Its tabs are closed first, so that it is not counted as still using them.
   */
  private async trashWithFiles(path: string, folder: boolean) {
    const { fs, local } = this.at(path);
    const space = spaceOf(path);
    const moved = await trashWithFiles(fs, local, folder, () => this.openTexts(space));
    if (moved.length === 0) return;
    this.forgetMedia(moved.map((file) => inSpace(space, file)));
    await this.freshTrash();
  }

  /** Changes the text of a keys file, from its table or as text, and writes it a moment after the last change. */
  changeKeys(path: string, text: string) {
    const current = this.snapshot.keys[path];
    if (current === undefined || current === text) return;
    this.set({ keys: { ...this.snapshot.keys, [path]: text }, saved: false });
    this.edited(path);
    this.keysPending.add(path);
    window.clearTimeout(this.keysTimer);
    this.keysTimer = window.setTimeout(() => this.flushKeys(), SAVE_DELAY_MS);
  }

  /** Puts the keys files waiting to be written into the queue the task lists and boards are written by. */
  private flushKeys() {
    window.clearTimeout(this.keysTimer);
    for (const path of this.keysPending) {
      this.taskWrites = this.taskWrites.then(() => this.writeKeys(path)).catch(() => undefined);
    }
    this.keysPending.clear();
    this.taskWrites = this.taskWrites.then(() => this.markSaved());
  }

  /**
   * Writes a keys file as it is shown now. What sync or another program wrote to it since it was
   * read here is merged in line by line; where both changed the same lines, what was done here
   * is written. What came in is then shown too, on top of any change made meanwhile.
   */
  private async writeKeys(path: string) {
    const text = this.snapshot.keys[path];
    if (text === undefined) return;
    const known = this.records.get(path);
    let written = text;
    if (known !== undefined) {
      const disk = await this.fs.readText(path).catch(() => null);
      if (disk !== null && disk !== known && disk !== text) {
        const merged = mergeText(known, text, disk);
        if (merged.clean) written = merged.text;
      }
    }
    await this.fs.writeText(path, written);
    this.records.set(path, written);
    if (written === text) return;
    const now = this.snapshot.keys[path];
    if (now === undefined) return;
    this.set({ keys: { ...this.snapshot.keys, [path]: now === text ? written : mergeText(text, now, written).text } });
  }

  /** Applies a change to a board and saves it. Board files share the queue of task files. */
  private changeBoard(path: string, change: (board: Board) => Board) {
    const current = this.snapshot.boards[path];
    if (!current) return;
    // A link to another space has no place in the board's file; it is left out here already.
    const next = rebaseBoard(change(current), withinSpace(spaceOf(path)));
    if (next === current) return;
    // A card deleted takes the files only it used to the trash; one put back, by Undo, brings them.
    const before = attachmentsIn(JSON.stringify(current.cards));
    const after = attachmentsIn(JSON.stringify(next.cards));
    const gone = [...before].filter((src) => !after.has(src));
    const back = [...after].filter((src) => !before.has(src));
    if (gone.length || back.length) this.attachmentsChanged(path, gone, back);
    this.set({ boards: { ...this.snapshot.boards, [path]: next }, saved: false });
    this.edited(path);
    this.taskWrites = this.taskWrites
      .then(() => this.writeBoard(path))
      .catch(() => undefined)
      .then(() => {
        this.markSaved();
        void this.trashUnlinkedFiles();
      });
  }

  /**
   * Writes a task list or a board file. What sync or another program wrote to it since it was
   * read here is merged in, record by record, not written over. Returns what was written.
   */
  private async writeRecords(path: string, kind: 'tasks' | 'board', text: string): Promise<string> {
    const known = this.records.get(path);
    let written = text;
    // A file never read here, as one that could not be read, is merged with nothing in common:
    // what is in it stays, beside what is written.
    const disk = await this.fs.readText(path).catch(() => null);
    if (disk !== null && disk !== known && disk !== text) written = mergeFile(kind, known ?? '', text, disk).text;
    await this.fs.writeText(path, written);
    this.records.set(path, written);
    return written;
  }

  /** Writes a board as it is shown now; what came in from elsewhere is then shown too, on top of any change made meanwhile. */
  private async writeBoard(path: string) {
    const board = this.snapshot.boards[path];
    if (!board) return;
    const text = this.serializeBoardAt(path, board);
    const written = await this.writeRecords(path, 'board', text);
    if (written === text) return;
    const now = this.snapshot.boards[path];
    if (!now) return;
    const shown = now === board ? written : mergeFile('board', text, this.serializeBoardAt(path, now), written).text;
    this.set({ boards: { ...this.snapshot.boards, [path]: this.parseBoardAt(path, shown) } });
  }

  /** Writes a task list as it is shown now, as `writeBoard` does a board. */
  private async writeList(path: string) {
    if (!(path in this.snapshot.tasks)) return;
    const list = this.listAt(path);
    const text = this.serializeListAt(path, list);
    const written = await this.writeRecords(path, 'tasks', text);
    if (written === text) return;
    const now = this.listAt(path);
    const same = now.tasks === list.tasks && now.sections === list.sections;
    const next = this.parseListAt(path, same ? written : mergeFile('tasks', text, this.serializeListAt(path, now), written).text);
    this.set({ tasks: { ...this.snapshot.tasks, [path]: next.tasks }, sections: { ...this.snapshot.sections, [path]: next.sections } });
  }

  private listAt(path: string): TaskList {
    return { sections: this.snapshot.sections[path] ?? [], tasks: this.snapshot.tasks[path] ?? [] };
  }

  /** Applies a change to a task list, its sections or its tasks, and saves it. */
  private changeList(path: string, change: (list: TaskList) => TaskList) {
    const current = this.listAt(path);
    const changed = change(current);
    // A link to another space has no place in the list's file; it is left out here already.
    const tasks = rebaseTasks(changed.tasks, withinSpace(spaceOf(path)));
    const next = tasks === changed.tasks ? changed : { ...changed, tasks };
    if (next === current) return;
    // A task deleted takes the files only its description used to the trash; one put back, by Undo, brings them.
    if (next.tasks !== current.tasks) {
      const before = attachmentsIn(JSON.stringify(current.tasks));
      const after = attachmentsIn(JSON.stringify(next.tasks));
      const gone = [...before].filter((src) => !after.has(src));
      const back = [...after].filter((src) => !before.has(src));
      if (gone.length || back.length) this.attachmentsChanged(path, gone, back);
    }
    this.set({
      tasks: { ...this.snapshot.tasks, [path]: next.tasks },
      sections: { ...this.snapshot.sections, [path]: next.sections },
      saved: false,
    });
    this.edited(path);
    this.taskWrites = this.taskWrites
      .then(() => this.writeList(path))
      .catch(() => undefined)
      .then(() => {
        this.markSaved();
        void this.trashUnlinkedFiles();
      });
  }

  private changeTasks(path: string, change: (tasks: Task[]) => Task[]) {
    this.changeList(path, (list) => {
      const tasks = change(list.tasks);
      return tasks === list.tasks ? list : { ...list, tasks };
    });
  }

  /** Adds a section: at the end, or after the section `after` names, at the top for null. */
  addSection(list: string, name: string, after?: string | null) {
    this.changeList(list, (current) => addSection(current, name, undefined, after));
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

  /** Names the open space; a name of only spaces gives it back the name of its kind. */
  renameSpace(name: string) {
    const { name: _old, ...rest } = this.snapshot.space;
    const space: SpaceInfo = name.trim() ? { ...rest, name: name.trim() } : rest;
    this.set({ space, saved: false });
    this.taskWrites = this.taskWrites
      .then(() => saveSpace(this.personal, space))
      .catch(() => undefined)
      .then(() => this.markSaved());
  }

  private writeFilters(filters: TaskFilter[]) {
    this.set({ filters, saved: false });
    this.taskWrites = this.taskWrites
      .then(() => saveFilters(this.personal, filters))
      .catch(() => undefined)
      .then(() => this.markSaved());
  }

  /** Deletes a section with its tasks; the interface asks first. */
  removeSection(list: string, id: string) {
    this.changeList(list, (current) => removeSection(current, id));
  }

  addTask(list: string, input: NewTask) {
    const author = this.authorIn(list);
    this.changeTasks(list, (tasks) => addTask(tasks, { ...(author && { author }), ...input }));
  }

  /** Who makes a task or a card in a space with people: the user, by id and name. The personal space has only them. */
  private authorIn(path: string): PersonRef | undefined {
    const me = this.snapshot.me;
    return me && spaceOf(path) ? refOf(me) : undefined;
  }

  updateTask(list: string, id: string, patch: TaskPatch) {
    this.changeTasks(list, (tasks) => updateTask(tasks, id, patch));
  }

  setTaskDone(list: string, id: string, done: boolean) {
    this.changeTasks(list, (tasks) => setDone(tasks, id, done));
  }

  /** Completes a task with its subtasks; returns what reopens just the ones it completed. */
  completeTask(list: string, id: string): () => void {
    const before = new Set((this.snapshot.tasks[list] ?? []).filter((task) => !task.done).map((task) => task.id));
    this.setTaskDone(list, id, true);
    const closed = (this.snapshot.tasks[list] ?? []).filter((task) => task.done && before.has(task.id)).map((task) => task.id);
    return () => this.changeTasks(list, (tasks) => reopenTasks(tasks, closed));
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
      if (active && isNote(active)) {
        this.states.set(active, editor.view.state);
        this.scrolls.set(editor.view.state, editor.scrollPlace());
      }
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
        editor.setState(state, this.scrolls.get(state));
        // Source mode is one setting for the whole window, not per note.
        editor.setSourceMode(this.snapshot.source);
      } else {
        this.set({ active: id, tabs: openTabs, stats: null, format: null });
      }
      this.saveWorkspace();
    }
    // Deferred: the editor is still hidden when it replaces a view, and a hidden element cannot take focus.
    // Taking the focus does not scroll to the caret: the note shows where it was left, or its top.
    if (isNote(id) && this.focusOnOpen) window.setTimeout(() => this.editor?.view.contentDOM.focus({ preventScroll: true }));
    // On a phone a note with nothing in it opens to be written in: the keyboard held since the tap
    // goes to it. Anything else lets the keyboard go.
    else if (this.keeper) {
      const write = isNote(id) && editor.view.state.doc.toString().trim() === '';
      window.setTimeout(() => this.releaseKeyboard(write));
    }
  }

  /** Where each note left in its tab was scrolled to, by the state it was left with: a note read anew starts at its top. */
  private scrolls = new WeakMap<EditorState, ScrollPlace>();

  /** The hidden field that holds the keyboard on a phone from a tap until the note it opens is shown. */
  private keeper: HTMLInputElement | null = null;
  private keeperTimer = 0;

  /** On a phone, whether opening `id` is to write in it: a note with nothing in it yet. */
  opensToWrite(id: string): boolean {
    if (!this.touch || !isNote(id)) return false;
    const empty = (text: string) => text.trim() === '';
    if (id === this.snapshot.active && this.editor) return empty(this.editor.view.state.doc.toString());
    const state = this.states.get(id);
    if (state) return empty(state.doc.toString());
    const text = this.disk.get(id);
    if (text !== undefined) return empty(text);
    const find = (nodes: TreeNode[]): TreeNode | undefined => {
      for (const node of nodes) {
        if (node.path === id) return node;
        const found = find(node.children ?? []);
        if (found) return found;
      }
      return undefined;
    };
    return find(this.snapshot.tree)?.empty === true;
  }

  /**
   * A phone brings up the keyboard only for a field focused during a tap. Called in the tap that
   * opens or makes a note to write in: a hidden field takes the keyboard now and hands it to the
   * note once the note is shown; if nothing takes it in a moment, it goes away.
   */
  holdKeyboard() {
    if (!this.touch) return;
    if (!this.keeper) {
      const keeper = document.createElement('input');
      keeper.setAttribute('aria-hidden', 'true');
      keeper.tabIndex = -1;
      // 16 px, so that the phone does not zoom in on it.
      Object.assign(keeper.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', padding: '0', border: '0', opacity: '0', fontSize: '16px' });
      document.body.append(keeper);
      this.keeper = keeper;
      this.keeperTimer = window.setTimeout(() => this.releaseKeyboard(false), 4000);
    }
    this.keeper.focus({ preventScroll: true });
  }

  /**
   * Hands the held keyboard to the note on screen, or lets it go. The note may still be hidden for
   * a moment, as it is when a list was on screen before it: it is waited for, a few frames at most.
   */
  releaseKeyboard(toNote: boolean) {
    const keeper = this.keeper;
    if (!keeper) return;
    this.keeper = null;
    window.clearTimeout(this.keeperTimer);
    const done = () => {
      if (document.activeElement === keeper) keeper.blur();
      keeper.remove();
    };
    const focus = (tries: number) => {
      const view = this.editor?.view;
      if (view && view.dom.getClientRects().length === 0 && tries > 0) return void requestAnimationFrame(() => focus(tries - 1));
      view?.focus();
      done();
    };
    if (toNote) focus(30);
    else done();
  }

  // ---------- boards ----------

  /** Adds a card; returns its id, so that the next card typed can go after it. */
  addCard(board: string, input: NewCard): string {
    const id = crypto.randomUUID();
    const author = this.authorIn(board);
    this.changeBoard(board, (current) => addCard(current, { ...(author && { author }), ...input }, undefined, this.by, id));
    return id;
  }

  moveCard(board: string, id: string, place: CardPlace) {
    this.changeBoard(board, (current) => moveCard(current, id, place, undefined, this.by));
  }

  /** Deletes a card for good; the interface asks first. */
  removeCard(board: string, id: string) {
    this.changeBoard(board, (current) => removeCard(current, id));
  }

  /** Gives a board its own fields, its cards' choices renamed with them. */
  setBoardFields(board: string, fields: Field[], renames: ChoiceRenames) {
    this.changeBoard(board, (current) => setBoardFields(current, fields, renames));
  }

  updateCard(board: string, id: string, patch: CardPatch) {
    this.changeBoard(board, (current) => updateCard(current, id, patch));
  }

  /** Changes a card's subtasks, from the list as it is now. */
  changeCardSubtasks(board: string, id: string, change: (list: Subtask[]) => Subtask[]) {
    this.changeBoard(board, (current) => {
      const card = current.cards.find((c) => c.id === id);
      return card ? updateCard(current, id, { subtasks: change(card.subtasks ?? []) }) : current;
    });
  }

  /** Ticks off a card's subtask; returns what opens it again. */
  completeCardSubtask(board: string, id: string, subtask: string): () => void {
    this.changeCardSubtasks(board, id, (list) => updateSubtask(list, subtask, { done: true }));
    return () => this.changeCardSubtasks(board, id, (list) => updateSubtask(list, subtask, { done: false }));
  }

  /** Changes a record's subtasks, from the list as it is now, and writes its file. Returns a message when it cannot be saved. */
  changeRecordSubtasks(dir: string, id: string, change: (list: Subtask[]) => Subtask[]): Promise<string | null> {
    const record = this.snapshot.collections[dir]?.records.find((r) => r.id === id);
    if (!record) return Promise.resolve(t('error.record'));
    return this.updateRecord(dir, id, { subtasks: change(record.subtasks ?? []) });
  }

  /** Ticks off a record's subtask; returns what opens it again. */
  completeRecordSubtask(dir: string, id: string, subtask: string): () => void {
    void this.changeRecordSubtasks(dir, id, (list) => updateSubtask(list, subtask, { done: true }));
    return () => void this.changeRecordSubtasks(dir, id, (list) => updateSubtask(list, subtask, { done: false }));
  }

  /**
   * Moves a card to the end of a done column, the one given or else the first: ticked off from
   * Today. Returns what puts it back where it was.
   */
  finishCard(board: string, id: string, column?: string): () => void {
    const whole = this.snapshot.boards[board];
    const card = whole?.cards.find((c) => c.id === id);
    const back = card && { column: card.column, after: columnCards(whole!, card.column).filter((c) => c.order < card.order).pop()?.id ?? null };
    this.changeBoard(board, (current) =>
      column
        ? moveCard(current, id, { column, after: columnCards(current, column).filter((c) => c.id !== id).pop()?.id ?? null }, undefined, this.by)
        : moveCardToKind(current, id, 'done', undefined, this.by),
    );
    return () => back && this.moveCard(board, id, back);
  }

  addComment(board: string, id: string, text: string) {
    this.changeBoard(board, (current) => addComment(current, id, text, undefined, this.by));
  }

  editComment(board: string, id: string, comment: string, text: string) {
    this.changeBoard(board, (current) => editComment(current, id, comment, text));
  }

  removeComment(board: string, id: string, comment: string) {
    this.changeBoard(board, (current) => removeComment(current, id, comment));
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
    this.changeBoard(board, (current) => removeColumn(current, id, undefined, this.by));
  }

  addPhase(board: string, name: string) {
    this.changeBoard(board, (current) => addPhase(current, { name }));
  }

  renamePhase(board: string, id: string, name: string) {
    this.changeBoard(board, (current) => updatePhase(current, id, { name }));
  }

  updatePhase(board: string, id: string, patch: PhasePatch) {
    this.changeBoard(board, (current) => updatePhase(current, id, patch));
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

  /** Creates an empty scratch note in `folder`, at the top of the personal space without one, and opens it. */
  async newNote(folder = '') {
    const { fs, space, local } = this.at(folder);
    const path = inSpace(space, await createScratchNote(fs, new Date(), local));
    await this.madeNow([path]);
    await this.refreshTree();
    await this.open(path);
  }

  /**
   * Creates a note, a task list, a board or a keys file called `name` (a default name when it is
   * empty) in `folder`, which is made first when `newFolder` is set, and opens it. A board starts
   * from `template`. Returns a message when it cannot be made.
   */
  async create(
    kind: 'note' | 'tasks' | 'board' | 'keys' | 'collection',
    folder: string,
    name: string,
    newFolder: boolean,
    template: Template = 'software',
    collectionTemplate: CollectionTemplate = 'companies',
    links?: BoardLinks,
  ): Promise<string | null> {
    let path: string;
    try {
      // Made in the files of the folder's space, with its own paths: a board's links, a
      // collection's linked blocks are written as the space has them.
      const { fs, space, local } = this.at(folder);
      const target = newFolder ? await createFolder(fs, local) : local;
      if (newFolder) await this.madeNow([inSpace(space, target)]);
      const own = toSpace(space);
      const company = links && own(links.company);
      const contact = links && own(links.contact);
      const made =
        kind === 'note'
          ? await createNote(fs, target, name)
          : kind === 'tasks'
            ? await createTaskList(fs, target, name)
            : kind === 'keys'
              ? await createKeys(fs, target, name)
              : kind === 'collection'
                ? await createCollection(fs, target, name, collectionTemplate)
                : await createBoard(fs, target, name, template, company && contact ? { company, contact } : undefined);
      path = inSpace(space, made);
      await this.madeNow([path]);
    } catch (error) {
      return error instanceof Error ? error.message : t('error.create');
    }
    await this.refreshTree();
    await this.open(kind === 'collection' ? collectionTab(path) : tabOf(path));
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
    const next = this.neighborOnClose ? (rest[index] ?? rest[index - 1]) : undefined;
    if (next) await this.open(next);
    else {
      this.set({ stats: null, format: null });
      this.saveWorkspace();
    }
  }

  async close(path: string) {
    // The onboarding note, once closed, opens by itself no more on this device.
    if (path === WELCOME_NOTE) this.welcomeClosed = true;
    await this.flush();
    const state = path === this.snapshot.active ? this.editor?.view.state : this.states.get(path);
    // A note that was never named or written in leaves nothing behind, like an empty editor tab.
    const discard = isNote(path) && isScratchNote(path) && state?.doc.toString().trim() === '';
    if (discard) await this.fs.remove(path);
    await this.detach(path);
    if (discard) await this.refreshTree();
  }

  /** Moves a note, a task list or a board to the trash, with the files only it used. */
  async trash(path: string) {
    await this.settle();
    await this.detach(tabOf(path));
    await this.trashWithFiles(path, false);
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
    // A collection's own tab, when the folder is one.
    await this.detach(collectionTab(path));
    await this.trashWithFiles(path, true);
    await this.refreshTree();
  }

  /** Puts an item from the trash back where it was. */
  /** What a deleted item holds, read in the trash, for a look at it before it is put back. */
  trashedContent = (item: TrashItem): Promise<Trashed> => readTrashed(...this.trashAt(item));

  /** An image of a deleted note, as it shows where the note was. */
  imageFrom = (home: string, src: string): string | Promise<string> => this.resolveImageAt(home, src);

  async restore(item: TrashItem) {
    await restoreFromTrash(...this.trashAt(item));
    await this.refreshTree();
  }

  /** Deletes an item in the trash for good. */
  async deleteForever(item: TrashItem) {
    const [fs, local] = this.trashAt(item);
    await deleteFromTrash(fs, local, this.openTexts(spaceOf(item.from)));
    await this.refreshTree();
  }

  async emptyTrash() {
    for (const [space, fs] of this.fs.all()) await emptyTrash(fs, this.openTexts(space));
    await this.refreshTree();
  }

  /**
   * Every attached file of every space with where it is used, the latest first: paths as the app
   * has them, what was typed and not yet written counted.
   */
  async files(): Promise<FileRow[]> {
    await this.settle();
    const lists = await Promise.all(
      this.fs.all().map(async ([space, fs]) =>
        (await listFiles(fs).catch(() => [])).map(
          (file): FileRow => ({ ...file, path: inSpace(space, file.path), space, uses: file.uses.map((use) => ({ ...use, path: inSpace(space, use.path) })) }),
        ),
      ),
    );
    return lists.flat().sort((a, b) => (b.added ?? 0) - (a.added ?? 0) || a.name.localeCompare(b.name));
  }

  /**
   * Puts files in a space's Files, used by nothing: they stay until they are deleted. A file
   * keeps its name; an image pasted from the clipboard, which the browser calls just "image", is
   * named by the moment it came, as one put in a note is. Returns how many came in.
   */
  async uploadFiles(space: string | null, files: File[]): Promise<number> {
    const fs = this.fs.of(space);
    let count = 0;
    this.copying += files.length;
    this.set({ saved: false });
    for (const file of files) {
      try {
        const pasted = file.type.startsWith('image/') && /^image\.\w+$/i.test(file.name);
        const src = pasted ? await saveAttachment(fs, file) : await saveFile(fs, file);
        this.sizes.set(inSpace(space, src), file.size);
        count++;
      } catch {
        // A file that could not be copied is not there; the others go on.
      } finally {
        this.copying--;
        this.markSaved();
      }
    }
    await this.recountFiles();
    return count;
  }

  /** Opens an attached file: on desktop with the program the system uses for it, in the browser in a new tab. */
  async openAttached(path: string) {
    try {
      if (this.awayAt(path) && !(await this.download(path))) return;
      if (isDesktop) await openFileOnDesktop(path);
      else window.open(await this.mediaUrlOf(path), '_blank', 'noopener');
    } catch {
      // A file that is gone or cannot be opened simply does not open.
    }
  }

  /** Shows an attached file in its folder; on desktop only. */
  revealAttached(path: string) {
    if (isDesktop) void revealFileOnDesktop(path).catch(() => undefined);
  }

  /** An attached file's content, to download or share. */
  attachedBlob(path: string): Promise<Blob> {
    return this.fs.readBlob(path);
  }

  /** Every note's text now, here and in every space, for the search window; the trash's are not among them. */
  async noteTexts(): Promise<Map<string, string>> {
    const paths: string[] = [];
    const visit = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'note') paths.push(node.path);
        else if (node.kind === 'folder') visit(node.children ?? []);
      }
    };
    visit(this.snapshot.tree);
    for (const space of this.snapshot.spaces) visit(space.tree);
    return new Map(await Promise.all(paths.map(async (path) => [path, await this.currentText(path).catch(() => '')] as const)));
  }

  /** How many attached files a note links to now. */
  async noteFileCount(path: string): Promise<number> {
    return attachmentsIn(await this.currentText(path).catch(() => '')).size;
  }

  /**
   * A note's text now and the attached files it links to, by their address as the note has it,
   * for exporting it. A file left in the cloud is brought first; one that cannot be is left out.
   */
  async exportSource(path: string): Promise<{ text: string; files: Map<string, Blob> }> {
    const text = await this.currentText(path);
    const files = new Map<string, Blob>();
    for (const src of attachmentsIn(text)) {
      const at = this.attached(path, src);
      try {
        if (this.awayAt(at) && !(await this.download(at))) continue;
        files.set(src, await this.fs.readBlob(at));
      } catch {
        // Gone: it goes out by its name only.
      }
    }
    return { text, files };
  }

  /**
   * Opens a note at the words the search window found in it: marked there, brought to the middle
   * of the screen, the cursor before them. Once the note is drawn where it is shown, which on a
   * phone is a page sliding in.
   */
  async openAt(path: string, spans: [number, number][]) {
    await this.open(path);
    window.setTimeout(() => {
      const view = this.editor?.view;
      if (view && this.snapshot.active === path) showFound(view, spans);
    }, 60);
  }

  /** The text of a note or a record now: on screen, open behind, waiting to be written, or in its file. */
  private async currentText(path: string): Promise<string> {
    if (path === this.snapshot.active && this.editor) return this.editor.view.state.doc.toString();
    const state = this.states.get(path);
    if (state) return state.doc.toString();
    return this.pending.get(path) ?? (await this.fs.readText(path));
  }

  /** Puts `text` in a note or a record wherever it is: on screen, open behind, waiting, or only in its file. */
  private async putText(path: string, text: string) {
    const view = this.editor?.view;
    if (view && this.snapshot.active === path) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.files' });
      return;
    }
    const state = this.states.get(path);
    if (state) {
      this.states.set(path, state.update({ changes: { from: 0, to: state.doc.length, insert: text } }).state);
      this.queueSave(path, text);
      return;
    }
    if (this.pending.has(path)) return this.queueSave(path, text);
    await this.fs.writeText(path, text);
    if (this.disk.has(path)) this.disk.set(path, text);
  }

  /**
   * Deletes attached files: each is taken out of the notes, cards and records that use it and goes
   * to its space's trash. What is in the trash keeps its links, to bring the file back with it. A
   * note keeps its text from before as a version, whose restoring brings the file back too.
   * Returns what undoes it all.
   */
  async deleteFiles(files: FileRow[]): Promise<() => Promise<void>> {
    await this.settle();
    const texts = new Map<string, string>();
    const boards = new Map<string, Board>();
    const lists = new Map<string, TaskList>();
    const collections = new Set<string>();
    for (const file of files) {
      const src = localPath(file.path);
      for (const use of file.uses) {
        if (use.inTrash) continue;
        if (use.kind === 'card') {
          const board = this.snapshot.boards[use.path];
          if (!board) continue;
          if (!boards.has(use.path)) boards.set(use.path, board);
          this.changeBoard(use.path, (current) => {
            const text = serializeBoard(current);
            const dropped = dropFileFromBoard(text, src);
            return dropped === text ? current : parseBoard(dropped);
          });
          continue;
        }
        if (use.kind === 'task') {
          if (!(use.path in this.snapshot.tasks)) continue;
          if (!lists.has(use.path)) lists.set(use.path, this.listAt(use.path));
          this.changeList(use.path, (current) => {
            const text = serializeList(current);
            const dropped = dropFileFromTasks(text, src);
            return dropped === text ? current : parseList(dropped);
          });
          continue;
        }
        try {
          const before = await this.currentText(use.path);
          const after = dropFileFrom(use.path, before, src);
          if (after === before) continue;
          if (!texts.has(use.path)) {
            texts.set(use.path, before);
            if (use.kind === 'note') await this.keep(use.path, before, true);
          }
          await this.putText(use.path, after);
          if (use.kind === 'record') collections.add(dirname(use.path));
        } catch {
          // Gone meanwhile: nothing of it to change.
        }
      }
    }
    for (const file of files) {
      const { fs, local } = this.at(file.path);
      await trashItem(fs, local).catch(() => undefined);
    }
    this.forgetMedia(files.map((file) => file.path));
    this.editor?.refreshMedia();
    for (const dir of collections) await this.reloadCollection(dir);
    await this.freshTrash();
    return async () => {
      for (const [path, text] of texts) await this.putText(path, text).catch(() => undefined);
      for (const [path, board] of boards) this.changeBoard(path, () => board);
      for (const [path, list] of lists) this.changeList(path, () => list);
      // The files come back from the trash, as a text linking to them again brings them.
      for (const [space, fs] of this.fs.all()) {
        const mine = files.filter((file) => file.space === space).map((file) => localPath(file.path));
        if (mine.length > 0) await restoreAttachments(fs, mine).catch(() => []);
      }
      this.forgetMedia(files.map((file) => file.path));
      this.editor?.refreshMedia();
      for (const dir of collections) await this.reloadCollection(dir);
      await this.freshTrash();
    };
  }

  /**
   * Puts items of the trash back where they were, one after another. One already gone (a note
   * restored before it took its files along) is passed over. Returns how many came back.
   */
  async restoreMany(items: TrashItem[]): Promise<number> {
    let restored = 0;
    for (const item of items) {
      try {
        await restoreFromTrash(...this.trashAt(item));
        restored++;
      } catch {
        // Gone from the trash meanwhile.
      }
    }
    await this.refreshTree();
    return restored;
  }

  /** Deletes items of the trash for good, one after another; one already gone is passed over. */
  async deleteForeverMany(items: TrashItem[]) {
    for (const item of items) {
      const [fs, local] = this.trashAt(item);
      await deleteFromTrash(fs, local, this.openTexts(spaceOf(item.from))).catch(() => undefined);
    }
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
      await this.moveHistory(path, target);
      this.versionedAt.delete(path);
      // Tasks and cards made from the note link to it where it is now.
      for (const list of Object.keys(this.snapshot.tasks)) this.changeList(list, (current) => relinkNote(current, path, target));
      for (const board of Object.keys(this.snapshot.boards)) this.changeBoard(board, (current) => relinkBoardNote(current, path, target));
    }
    // Tasks made from cards of a board link to it where it is now, and rollups read from it there.
    if (path.endsWith(BOARD_EXT)) {
      for (const list of Object.keys(this.snapshot.tasks)) this.changeList(list, (current) => relinkBoard(current, path, target));
      if (target !== path) await this.retargetSchemas(path, target);
    }
    this.moveLook(path, target);
    await this.carryMade(path, target);
    const [from, to] = [tabOf(path), tabOf(target)];
    this.moveRecent(from, to);
    const { tabs, active } = this.snapshot;
    this.set({ tabs: tabs.map((tab) => (tab === from ? to : tab)), active: active === from ? to : active });
    await this.refreshTree();
    this.saveWorkspace();
  }

  /**
   * Moves a note, a task list, a board, a keys file or a collection into `folder`: of its own
   * space, or of another one, which is a copy there and the original in its own trash.
   */
  async move(path: string, folder: string) {
    if (dirname(path) === folder) return;
    const source = this.at(path);
    const into = this.at(folder);
    if (source.space !== into.space) return this.moveAcross(path, folder);
    if (path in this.snapshot.collections) return this.moveCollection(path, folder);
    await this.settle();
    await this.repath(path, inSpace(source.space, await moveItem(source.fs, source.local, into.local)));
  }

  /**
   * Moves a note, a task list, a board, a keys file or a collection to another space: it is
   * copied there with the files it links to, and goes to the trash of its own space, where it can
   * be restored. What it said about items of its old space is left out there; what in its old
   * space linked to it links to it in the trash, as to anything deleted. Its tab stays where it
   * is, showing it in its new place. Returns its path there.
   */
  private async moveAcross(path: string, folder: string): Promise<string> {
    await this.settle();
    const source = this.at(path);
    const into = this.at(folder);
    const collection = path in this.snapshot.collections;
    let local: string;
    try {
      local = await copyToSpace(source.fs, source.local, into.fs, into.local);
    } catch (error) {
      if (!(error instanceof AwayFilesError)) throw error;
      // Its files left in the cloud come first; without them it does not move.
      for (const file of error.paths) if (!(await this.download(inSpace(source.space, file)))) throw new Error(t('files.notHere'));
      local = await copyToSpace(source.fs, source.local, into.fs, into.local);
    }
    const copied = inSpace(into.space, local);
    // In its new space it was made when it was made in its old one.
    const made = this.snapshot.created[path.toLowerCase()];
    await this.madeNow([copied], made === undefined ? new Date() : new Date(made));
    if (collection) await trashFolder(source.fs, source.local);
    else await trashItem(source.fs, source.local);
    const [from, to] = collection ? [collectionTab(path), collectionTab(copied)] : [tabOf(path), tabOf(copied)];
    this.states.delete(path);
    this.disk.delete(path);
    this.moveLook(path, copied);
    this.moveRecent(from, to);
    const { tabs, active } = this.snapshot;
    this.set({ tabs: tabs.map((tab) => (tab === from ? to : tab)), ...(active === from && { active: null }) });
    await this.refreshTree();
    if (active === from) await this.open(to);
    this.saveWorkspace();
    return copied;
  }

  /** Moves a note, a task list or a board into a folder that is created for it, at the top of its space. Returns a message when the name cannot be used. */
  async moveToNewFolder(path: string, name: string): Promise<string | null> {
    try {
      const { fs, space } = this.at(path);
      const folder = inSpace(space, await createFolder(fs, name));
      await this.madeNow([folder]);
      await this.move(path, folder);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : t('error.createFolder');
    }
  }

  /** Gives a note, a task list, a board, a keys file or a collection a name. Returns a message when the name cannot be used. */
  async rename(path: string, name: string): Promise<string | null> {
    const done = await this.renamed(path, name);
    return 'error' in done ? done.error : null;
  }

  /** Gives an item a name; returns where it is after, or why the name cannot be used. */
  async renamed(path: string, name: string): Promise<{ path: string } | { error: string }> {
    if (path in this.snapshot.collections) return this.renamedCollection(path, name);
    await this.settle();
    try {
      const { fs, space, local } = this.at(path);
      const target = inSpace(space, await renameItem(fs, local, name));
      await this.repath(path, target);
      return { path: target };
    } catch (error) {
      return { error: error instanceof Error ? error.message : t('error.rename') };
    }
  }

  /** Creates a folder in `parent`, at the top of its space when it is one, of the personal space without one; returns a message when the name cannot be used. */
  async newFolder(name: string, parent = ''): Promise<string | null> {
    try {
      const { fs, space, local } = this.at(parent);
      await this.madeNow([inSpace(space, await createFolder(fs, name, local))]);
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

  /** Links what is selected, or changes or takes away the link at the cursor. On a phone the keyboard stays as it was. */
  setLink(url: string) {
    const view = this.editor?.view;
    if (!view || !this.snapshot.format) return;
    setLink(url)(view);
    if (this.focusOnOpen) view.focus();
  }

  setSource(source: boolean) {
    this.set({ source });
    this.editor?.setSourceMode(source);
    if (this.focusOnOpen) this.editor?.view.focus();
  }

  /** On a phone, what an empty note shows until something is written in it: Note, faint, as a notes app has it. */
  private emptyNote(): HTMLElement {
    const hint = document.createElement('span');
    hint.textContent = t('phone.notePlaceholder');
    return hint;
  }

  /** Puts the cursor at `pos` in the note on screen, without bringing up the keyboard: a link tapped, to edit it. */
  placeCursor(pos: number) {
    const view = this.editor?.view;
    if (!view) return;
    view.dispatch({ selection: { anchor: Math.min(pos + 1, view.state.doc.length) } });
  }

  /** Find and replace in the note on screen. */
  openFind() {
    const view = this.editor?.view;
    if (view && this.snapshot.format) openSearchPanel(view);
  }

  closeFind() {
    const view = this.editor?.view;
    if (view && searchPanelOpen(view.state)) closeSearchPanel(view);
  }

  /** An image from the device, put in the note on screen at the cursor. */
  pickImage() {
    const view = this.editor?.view;
    if (!view || !this.snapshot.format) return;
    const at = view.state.selection.main.head;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this.addFiles([file], at);
    });
    input.click();
  }
}
