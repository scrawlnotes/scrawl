import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import {
  aboutName,
  APP_TEMPLATES,
  linesBlocks,
  linkedRecords,
  type AppFile,
  type AppPiece,
  type AppScreen,
  appIcon,
  homeOf,
  linesIn,
  type MenuEdit,
  menuEditOf,
  menuOf,
  PIECES,
  screenKey,
  asksAnything,
  assigneesOf,
  choosesAnything,
  type Favorite,
  favoriteKey,
  isFavorite,
  sameLabel,
  type FilterChoices,
  filterName,
  NO_CHOICES,
  type LabelUse,
  labelUses,
  type Record as CollectionRecord,
  basename,
  isUnder,
  shownName,
  DEFAULT_LOOK,
  foldersFirst,
  type FolderLook,
  type NodeTimes,
  isDefaultLook,
  BOARD_EXT,
  boardName,
  type Card,
  cardBrief,
  cardRef,
  type CollectionTemplate,
  recordTitle,
  RuleStop,
  isLinkable,
  collectionCsv,
  collectionSheet,
  parseCsv,
  collectionName,
  type Column,
  columnCards,
  addDays,
  dayOf,
  dirname,
  type FileUse,
  type Found,
  dueToday,
  dueUpcoming,
  filterTasks,
  filterFields,
  inSpace,
  spaceOf,
  INBOX_TASKS,
  itemChip,
  type ChipKind,
  type ChipRef,
  parseItemLink,
  keyCount,
  keyOf,
  keysName,
  listName,
  PieceHomeGone,
  localPath,
  nextOpenPhase,
  openCardCount,
  openCount,
  parseCardRef,
  parseKeys,
  type Phase,
  phaseCards,
  dueCards,
  dueCardSubtasks,
  dueRecords,
  dueRecordSubtasks,
  movedValues,
  withComputed,
  type Subtask,
  updateSubtask,
  filterCards,
  removeTask,
  type Section,
  type TaskFilter,
  type Template,
  type BoardLinks,
  type TrashItem,
  type TreeNode,
  QUICK_NOTES,
  WELCOME_NOTE,
  newRecordId,
  recordWith,
  type DueRecord,
} from '@scrawlnotes/core';
import { type EditorStats, type EditorView, type LinkTap, sizeText } from '@scrawlnotes/editor';
import { type DragEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  AskDialog,
  ButtonDialog,
  ClosePhaseDialog,
  ConfirmDialog,
  type ConfirmPlace,
  ContextMenu,
  type FolderChoice,
  type ItemKind,
  type MenuHead,
  type MenuItem,
  MoveDialog,
  PhaseDialog,
  MoveTaskDialog,
  NewCardDialog,
  NewDialog,
  NewTaskDialog,
  ExportDialog,
  RenameDialog,
  type TaskPlaceChoice,
} from './dialogs';
import { type BoardActions, boardPlace, BoardView } from './Board';
import { FormatBar } from './FormatBar';
import { cutShort, useHoverTip } from './HoverTip';
import { HistoryDialog, HistoryList, versionLabel, VersionView } from './History';
import { PhoneCardPage } from './CardPanel';
import { LinkActions, LinkSheet, PhoneFormatBar } from './PhoneNote';
import { DateSheet, QuickAdd, RecordSheet, SectionSheet, TaskSheet } from './PhoneTasks';
import { Icon, type IconName, isIconName } from './Icon';
import { type KeysActions, KeysView } from './Keys';
import { type CollectionActions, CollectionView, RecordDialog, recordDeleteText } from './Collection';
import { PhoneNewRecord, PhoneRecordPage } from './PhoneCollection';
import { ImportDialog } from './Import';
import { isSpreadsheet, readSheets, type Sheet, writeSheet } from './spreadsheet';
import { folderLabel, setSpaceNames,
  boardLabel,
  CHAT,
  appPathOf,
  appTab,
  boardOf,
  boardPathOf,
  collectionPathOf,
  collectionTab,
  filterOf,
  filterTab,
  FILTERS,
  folderOf,
  labelIn,
  labelOfTab,
  labelTab,
  NEW_FILTER,
  spaceLabel,
  splitLabel,
  iconOf,
  isBoardPath,
  isKeysPath,
  isNote,
  isTaskListPath,
  keysPathOf,
  labelOf,
  placeLabel,
  listLabel,
  listOf,
  nameOf,
  pathOf,
  pathTip,
  QUICK,
  tabOf,
  tasksOf,
  TODAY,
  TRASH,
  FILES,
  UPCOMING,
} from './items';
import { PhoneQuickNote, type QuickActions, QuickNotes, quickSortItems, QuickWindow } from './QuickNotes';
import { choiceHref, type LinkChoice, linkChoices } from './linkChoices';
import { addedCounts, counts as appCounts, editCounts, NewAppDialog } from './AppWizard';
import {
  applyNumbers,
  applySize,
  applyTheme,
  isPhone,
  loadMode,
  loadNumbers,
  loadSize,
  loadTheme,
  loadCalendarRange,
  loadUpcomingView,
  type Mode,
  type Numbers,
  onSystemShade,
  saveMode,
  saveNumbers,
  saveSize,
  saveTheme,
  saveCalendarRange,
  saveUpcomingView,
  shadeOfMode,
  systemShade,
} from './device';
import { type Notice, Phone } from './Phone';
import { PhoneCreate } from './PhoneCreate';
import { PeopleSheet } from './PhoneSpaces';
import { type ButtonRun, type FileRow, type RuleEvent, Session, type SpaceView } from './session';
import { RemoveSpaceDialog, type Section as SettingsSection, Settings, type SettingsValues } from './Settings';
import { StartPage } from './StartPage';
import { type SpaceSyncView, SyncService } from './sync';
import { reloadIntoUpdate, subscribeUpdate, updateReady } from './pwa';
import { restartIntoUpdate, useDesktopUpdate } from './desktopUpdate';
import { SyncStatus, syncWord, trayText } from './SyncViews';
import { startTray, trayStatus } from './tray';
import { startWatching } from './watch';
import { ConnectServerDialog, ConnectServerSheet } from './ServerConnect';
import { LoadingView, Spin, stillOpening } from './Loading';
import { AppView, PhoneAppHome } from './AppView';
import { AppMenuDialog } from './AppMenuDialog';
import { openingDrawn, openingFailed } from './opening';
import { pendingJoin } from './servers';
import { type FavoriteRow, Sidebar } from './Sidebar';
import type { Exported, ExportFormat } from './exporting';
import { type SearchAction, SearchWindow, type Target, type Thing, thingsOf } from './Search';
import { type Dated, dueLabel, type DueSubtask, FilterPage, isSubtaskRef, type SubtaskRef, type TaskActions, TaskList, TodayView } from './Tasks';
import { Upcoming } from './Upcoming';
import { type ChatLinks, type ChipState, ChatView } from './Chat';
import { store as chatStore, useChat } from './chatStore';
import { onNotificationClick, startNotifications } from './notify';
import type { Hit } from './messageSearch';
import { PhoneUpcoming } from './PhoneUpcoming';
import type { SpacePeople } from './People';
import { contentsText, quote, writtenText } from './text';
import { LabelDot, type Labels, LabelSheet, LabelsContext, LabelsWindow } from './labels';
import { type Choices, type FilterPlace, FilterSheet, type FilterStep, type FolderChoice as FilterFolder } from './FilterBar';
import { FiltersAndLabels, type LabelGroup, SaveFilterDialog } from './FiltersPage';
import { type TrashChoice, type TrashSpace, TrashView } from './Trash';
import { TrashPreviewDialog, TrashPreviewPage } from './TrashPreview';
import type { DescriptionHost } from './Description';
import { type FileActions, type FileSort, FilesView, fileTitle, Thumb, useIcon, useTitle, useWord } from './Files';
import { type AskOneDrive, chooseSpaceFolder, clipboardFilesOnDesktop, downloadBlob, isDesktop, isOnDisk, openUrlOnDesktop, saveFile, saveTextFile } from './storage';

type OpenDialog =
  // A folder's menu chooses the kind and the folder; Create alone leaves them to be chosen. The
  // start page's templates choose a board's or a collection's template too.
  // Made from an app (design/app-home.md 5.5), it goes into its folder and a module of its menu.
  | { kind: 'new'; start?: ItemKind; folder?: string; template?: Template | CollectionTemplate; app?: string }
  | { kind: 'newApp'; folder: string }
  | { kind: 'addToApp'; folder: string; app: AppFile }
  | { kind: 'editApp'; folder: string; app: AppFile }
  | { kind: 'editMenu'; folder: string }
  | { kind: 'phase'; board: string; phase: Phase }
  | { kind: 'move'; path: string }
  | { kind: 'rename'; path: string }
  // An attached file, from Files or from its bar in a note; `view` is the editor that bar is in.
  | { kind: 'renameFile'; path: string; view?: EditorView }
  | { kind: 'export'; path: string }
  | { kind: 'confirm'; title: string; message: string; action: string; danger: boolean; run: () => void; places?: ConfirmPlace[]; after?: string; brief?: string }
  | { kind: 'closePhase'; board: string; phase: Phase; left: number }
  | { kind: 'button'; run: ButtonRun; record: string }
  | { kind: 'askButton'; dir: string; id: string; name: string }
  | { kind: 'removeSpace'; id: string }
  | { kind: 'history'; path: string }
  | { kind: 'moveTask'; list: string; id: string }
  | { kind: 'toTask'; note: string; title: string; description: string }
  | { kind: 'toCard'; note: string; title: string; description: string }
  // From a message in Chat: `from` is where it is and who wrote it, its description links back to it.
  | { kind: 'chatTask'; from: string; title: string; description: string }
  | { kind: 'chatCard'; from: string; title: string; description: string }
  | { kind: 'renameFilter'; filter: TaskFilter }
  // What a new filter or a label's view picks, saved as a filter by a name; `from` is its tab.
  | { kind: 'saveFilter'; choices: FilterChoices; from: string }
  | { kind: 'settings'; section?: SettingsSection; space?: string | null }
  | null;

/**
 * What the search found, as a chip of a message points at it (design/chat.md, 3.7): a note, a
 * list, a board or a collection by its path in its space, a task, a card or a record by its id
 * too; null for what is in the personal space, which no one else sees, and for anything else.
 */
function itemOfTarget(target: Target): ChipRef | null {
  const ref = (kind: ChipKind, path: string, id?: string): ChipRef | null => {
    const space = spaceOf(path);
    return space ? { kind, space, path: localPath(path), ...(id && { id }) } : null;
  };
  switch (target.kind) {
    case 'note':
      return ref('note', target.path);
    case 'task':
      return ref('task', target.list, target.id);
    case 'card':
      return ref('card', target.board, target.id);
    case 'record':
      return ref('record', target.dir, target.id);
    case 'tab': {
      const list = listOf(target.id);
      if (list !== null) return ref('tasks', list);
      const board = boardPathOf(target.id);
      if (board !== null) return ref('board', board);
      const dir = collectionPathOf(target.id);
      return dir !== null ? ref('collection', dir) : null;
    }
    default:
      return null;
  }
}

/** A filter page (design/filters.md 4): a saved filter as it is changed here, a new one, or a label's view. */
interface FilterPageModel {
  title: string;
  /** A label's view: the label in its space. */
  label?: string;
  /** The saved filter shown. */
  saved?: TaskFilter;
  choices: FilterChoices;
  /** What it asks besides what is picked: a label's view its label in its space. */
  base?: Partial<FilterChoices>;
  onChange: (choices: FilterChoices) => void;
  /** A saved filter picks something else here than it was saved with. */
  changed?: boolean;
}

/** A filter over everything that asks nothing yet: a new one. */
const EVERYTHING: FilterChoices = { ...NO_CHOICES, folders: [] };

/** Whether two filters pick the same: a saved filter's page changed or not. */
const sameChoices = (a: FilterChoices, b: FilterChoices) => {
  const key = (c: FilterChoices) => JSON.stringify([c.due, [...c.priorities].sort(), c.text.trim(), c.labels ?? [], assigneesOf(c), c.fields ?? [], c.folders]);
  return key(a) === key(b);
};

// A tab being dragged to another place in the tab bar.
const TAB_DRAG_TYPE = 'application/x-scrawl-tab';
/** The files a collection imports: CSV and Excel. */
const IMPORTABLE = '.csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

/** A file's name and its extension, `Lease` and `.pdf`; a name with no dot after its first character has none. */
const nameAndExt = (name: string): [string, string] => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
};

// Ctrl+N and Ctrl+W belong to the browser on the web, so Alt is used there.
const keys = (key: string) => `${isDesktop ? 'Ctrl' : 'Alt'}+${key}`;
/** The system's file manager is Finder on a Mac. */
const onMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
/**
 * An item's menu on a computer, in groups: its star, its name and place, what it keeps and gives
 * out, then Delete. A phone's sheet keeps the items as they come.
 */
const ITEM_GROUPS: IconName[][] = [['star'], ['pen', 'move'], ['clock', 'export', 'import'], ['trash']];
const inGroups = (items: MenuItem[]): MenuItem[] => {
  const groups = ITEM_GROUPS.map((icons) => icons.flatMap((icon) => items.filter((item) => item.icon === icon)));
  // An item no group names goes with what it keeps and gives out, before Delete.
  groups[2]!.push(...items.filter((item) => !groups.flat().includes(item)));
  return groups.flatMap((group) => group.map((item, i) => ({ ...item, apart: i === 0 })));
};

function position(stats: EditorStats): string {
  if (stats.selectedChars === 0) return t('status.position', { line: stats.line, col: stats.col });
  const characters = t('count.characters', { count: stats.selectedChars });
  const words = t('count.words', { count: stats.selectedWords });
  if (stats.cursors > 1) return t('status.selections', { selections: t('count.selections', { count: stats.cursors }), words, characters });
  if (stats.selectedLines > 1) return t('status.selectedLines', { lines: t('count.lines', { count: stats.selectedLines }), words, characters });
  return t('status.selected', { words, characters });
}

function folderPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    out.push(node.path);
    folderPaths(node.children ?? [], out);
  }
  return out;
}

/** The places things can be made in or moved to: the personal space's top and its folders, then each space's top and its folders. */
function everyFolder(tree: TreeNode[], spaces: SpaceView[]): string[] {
  return ['', ...folderPaths(tree), ...spaces.flatMap((space) => [inSpace(space.id, ''), ...folderPaths(space.tree)])];
}

function findNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findNode(node.children ?? [], path);
    if (found) return found;
  }
  return undefined;
}

/** What a folder holds, all the way down, as "2 notes, 1 task list"; empty when it holds nothing. */
function contentsOf(folder: TreeNode): string {
  const totals = { note: 0, tasks: 0, board: 0, keys: 0, collection: 0, folder: 0 };
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      totals[node.kind]++;
      visit(node.children ?? []);
    }
  };
  visit(folder.children ?? []);
  return contentsText({ notes: totals.note, lists: totals.tasks, boards: totals.board, keys: totals.keys, collections: totals.collection, folders: totals.folder });
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  // A phone has a layout of its own (Phone.tsx); a computer, a tablet and a narrow window keep this one.
  const [phone] = useState(isPhone);
  const [session] = useState(() => {
    const made = new Session();
    if (phone) {
      made.focusOnOpen = false;
      made.neighborOnClose = false;
      made.touch = true;
    }
    return made;
  });
  /** On a phone, where what is open is drawn: moved into the page that shows it. */
  const [itemLayer] = useState(() => {
    const layer = document.createElement('div');
    layer.className = 'mb-item';
    return layer;
  });
  const [syncService] = useState(() => new SyncService(session));
  const sync = useSyncExternalStore(syncService.subscribe, syncService.getSnapshot);
  // On the desktop, the tray's icon and its line of sync; Quit there writes what was typed first.
  useEffect(() => startTray(() => session.beforeSync()), [session]);
  useEffect(() => trayStatus(trayText(sync.all)), [sync]);
  // On the desktop, what another program writes in the spaces' folders, an agent above all, syncs at once.
  useEffect(() => startWatching(session, syncService), [session, syncService]);
  /**
   * Signs in for a space waiting for it. A space on a server asks for its password; for OneDrive,
   * in the browser the page goes to Microsoft and back, and on the desktop it is done in
   * Settings, which waits for the system browser.
   */
  const signInFor = (unit?: SpaceSyncView) =>
    unit?.connection?.server
      ? syncService.askServerSignIn(unit.connection.server, unit.connection.account.email)
      : syncService.cloud().redirects
        ? void syncService.leaveToSignIn('again')
        : setDialog({ kind: 'settings', section: 'spaces' });
  /** On a phone: the personal space's sync page is asked for. */
  const [syncAsked, setSyncAsked] = useState(false);
  // Back from signing in in the browser: Settings opens at the space's sync, for its folder or what
  // went wrong, on a phone the personal space's sync page; or at Spaces with Add space, to choose
  // the new space's folder.
  useEffect(() => {
    if (phone && (sync.picking || sync.signInError)) setSyncAsked(true);
    else if (sync.picking || sync.adding || sync.signInError) setDialog({ kind: 'settings', section: 'spaces' });
  }, [sync.picking, sync.adding, sync.signInError]);
  // Opened from a server's page for an invite or a password link: Settings opens at Spaces, with
  // Add space joining with it.
  useEffect(() => {
    if (pendingJoin()) setDialog({ kind: 'settings', section: 'spaces' });
  }, []);
  const update = useSyncExternalStore(subscribeUpdate, updateReady);
  const desktopUpdate = useDesktopUpdate();
  const { ready, reading, folder, defaultFolder, me, tree, quick, quickOrder, quickSort, quickTexts, quickFormat, spaces, tabs, active, recent, titles, tasks, sections, boards, boardLooks, listLooks, labelLooks, folderLooks, created, keys: keyFiles, keysLooks, collections, collectionLooks, appLooks, filters, favorites, labels: spaceLabels, space, trash, fileCount, downloads, fileVersion, saved, stats, written, format, source, recording, recordError } =
    useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  // A record open as a note is named in its tab by what the record is called; its file is named by its id.
  // The onboarding note is not in the tree, which names the notes.
  const tabTitles = useMemo(() => {
    const out: Record<string, string> = { ...titles, [WELCOME_NOTE]: t('welcome.title') };
    for (const collection of Object.values(collections)) for (const record of collection.records) out[record.path] = recordTitle(record);
    return out;
  }, [titles, collections]);
  // What the note on screen can link to, offered as a link's address is typed.
  const noteLinks = useMemo(() => (active && isNote(active) ? linkChoices(tree, active) : []), [tree, active]);
  const noteHref = (choice: LinkChoice) => choiceHref(active ?? '', choice);
  // What a quick note can link to: the personal space's notes and items, from its folder.
  const quickLinks = useMemo(() => linkChoices(tree, `${QUICK_NOTES}/.md`), [tree]);
  // The mode and the theme chosen on this device, and the shade the device itself is in, for System.
  const [mode, setMode] = useState<Mode>(loadMode);
  const [numbers, setNumbers] = useState<Numbers>(loadNumbers);
  const [theme, setTheme] = useState(loadTheme);
  const [sizes, setSizes] = useState(() => ({ phone: loadSize('phone'), computer: loadSize('computer') }));
  const [system, setSystem] = useState(systemShade);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  /**
   * The quick note open in its window in the middle, with the words a search found in it; a new
   * one has no path yet (design/quick-notes.md 3.4). `made` tells two openings apart.
   */
  const [quickWindow, setQuickWindow] = useState<{ path: string | null; made: number; found?: [number, number][] } | null>(null);
  /** On a phone, a quick note's page asked for: a new one has no path (design/quick-notes.md 4). */
  const [phoneQuick, setPhoneQuick] = useState<{ path: string | null; found?: [number, number][]; at: number } | null>(null);
  /**
   * A new quick note in its window, over whatever is open: from Create, a + menu, the start page,
   * the search. On a phone, in a page of its own, the keyboard held for it from the tap.
   */
  const newQuick = () => {
    setDrawer(false);
    setDialog(null);
    if (phone) {
      session.holdKeyboard();
      return setPhoneQuick({ path: null, at: Date.now() });
    }
    setQuickWindow({ path: null, made: Date.now() });
  };
  // A quick note asked for anywhere, a search's, a task's note, Files', opens in its window; on a
  // phone in its page.
  useEffect(() => {
    session.showQuick = phone
      ? (path, found) => setPhoneQuick({ path, at: Date.now(), ...(found && { found }) })
      : (path, found) => setQuickWindow({ path, made: Date.now(), ...(found && { found }) });
  }, [session, phone]);
  // To task, History or Move to closing over the quick note's window gives it the keyboard back:
  // Escape closes it then, as before they opened.
  useEffect(() => {
    if (!dialog && quickWindow) session.focusQuick();
  }, [dialog]);
  /** Labels, asked for from a picker: the space a path is in. On a phone it opens as a page. */
  const [labelsOpen, setLabelsOpen] = useState<string | null>(null);
  // The labels of each space, worked out once for each change of its tasks, its cards or its file.
  const labelsApi = useMemo<Labels>(() => {
    const worked = new Map<string, LabelUse[]>();
    return {
      of: (path) => {
        const space = spaceOf(path);
        const key = space ?? '';
        let uses = worked.get(key);
        if (!uses) {
          const here = ([at]: [string, unknown]) => spaceOf(at) === space;
          uses = labelUses(spaceLabels[key] ?? [], Object.entries(tasks).filter(here).map(([, list]) => list), Object.entries(boards).filter(here).map(([, board]) => board));
          worked.set(key, uses);
        }
        return uses;
      },
      add: (path, name) => session.addLabel(path, name),
      color: (path, name, color) => session.colorLabel(path, name, color),
      relabel: (path, from, to) => session.relabel(path, from, to),
      edit: setLabelsOpen,
    };
  }, [session, tasks, boards, spaceLabels]);
  // `target` is the sidebar row the menu was opened on, which stays marked while it is open.
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[]; target?: string; head?: MenuHead } | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  // On a narrow window the sidebar is a drawer, open or not.
  const [drawer, setDrawer] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  /** The card open in a panel beside its board's columns. */
  const [openCard, setOpenCard] = useState<{ board: string; id: string } | null>(null);
  // Each app's `_app.json`, read as its tab opens; null when it is not one (design/app-home.md 5).
  const [appFiles, setAppFiles] = useState<Record<string, AppFile | null>>({});
  // A record opened over whatever is on screen, from a task about it.
  const [recordOver, setRecordOver] = useState<{ dir: string; id: string } | null>(null);
  // On a phone a record opens as a page, asked for here; a new one is a form in a sheet; the
  // collection's page menu asks for its Fields. A record's page asks before its changes are lost.
  const [recordAsked, setRecordAsked] = useState<{ dir: string; id: string } | null>(null);
  // A new record's window opened from outside its collection: a program day's Start (design/gym.md 4.3).
  const [recordNew, setRecordNew] = useState<{ dir: string; values: CollectionRecord['values'] } | null>(null);
  const [newRecord, setNewRecord] = useState<{ dir: string; values?: Parameters<NonNullable<CollectionActions['create']>>[1] } | null>(null);
  const [collectionFields, setCollectionFields] = useState(0);
  const recordGuards = useRef(new Map<string, (then: () => void) => void>());
  /** What the status bar says about a view other than a note's: a keys file's counts, or its cursor. */
  const [viewStatus, setViewStatus] = useState<string[] | null>(null);
  // Messaging on the servers signed in to that have it (design/chat.md): Chat shows when one does.
  const chat = useChat();
  useEffect(() => {
    chatStore.start();
    startNotifications();
  }, []);
  /** Where a dragged tab would land: the gap before the tab at this index, or after the last one. */
  const [tabGap, setTabGap] = useState<number | null>(null);
  // With nothing open, a computer shows the start page; a phone its own Recent.
  const empty = ready && tabs.length === 0;
  const showNew = dialog?.kind === 'new';
  const showingEditor = active !== null && isNote(active);

  // Opening that failed says why, with a way to try again, rather than opening for ever.
  const [openFailed, setOpenFailed] = useState<string | null>(null);
  useEffect(() => {
    openingDrawn();
    session.start(host.current!).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      openingFailed(reason);
      setOpenFailed(reason);
    });
    return () => session.dispose();
  }, [session]);

  useEffect(() => {
    syncService.start();
    return () => syncService.dispose();
  }, [syncService]);

  useEffect(() => onSystemShade(() => setSystem(systemShade())), []);

  useEffect(() => {
    applyTheme(theme, shadeOfMode(mode, system));
  }, [theme, mode, system]);

  // What is on screen was seen now, and what was there until now too: the start page's Recent
  // lists them first. A phone keeps its own.
  const seenBefore = useRef<string | null>(null);
  useEffect(() => {
    if (phone || !ready) return;
    if (seenBefore.current && seenBefore.current !== active) session.seen(seenBefore.current);
    if (active) session.seen(active);
    seenBefore.current = active;
  }, [session, phone, ready, active]);

  useEffect(() => {
    // Ctrl+N and Ctrl+W belong to the browser on the web, so Alt is used there. Ctrl+K opens the
    // search window in both, besides Search at the top of the sidebar.
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyK' && !isPhone()) {
        event.preventDefault();
        setSearching(true);
        return;
      }
      const modifier = isDesktop ? (event.ctrlKey || event.metaKey) && !event.altKey : event.altKey && !event.ctrlKey;
      if (!modifier || event.shiftKey) return;
      if (event.code === 'KeyN') setDialog({ kind: 'new' });
      // The comma is a key of its own on some layouts (Turkish Q has it beside Enter), so it is
      // known by what it types too.
      else if (event.code === 'Comma' || event.key === ',') setDialog({ kind: 'settings' });
      else if (event.code === 'KeyW' && active) void session.close(active);
      else if (event.code === 'KeyT' && ((active && isNote(active)) || quickWindow)) startToTask();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, active, quickWindow]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  // The tab on screen is never scrolled out of the tab bar.
  useEffect(() => {
    tabBar.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, tabs.length]);

  // Something that happened, shown in the status bar for a moment, on a phone over the page; with
  // Undo a little longer.
  const [notice, setShown] = useState<Notice | null>(null);
  const setNotice = (text: string | null) => setShown(text === null ? null : { text });
  const undoable = (text: string, undo: () => void) => setShown({ text, undo });
  useEffect(() => {
    if (!notice) return;
    if (notice.sticky) return;
    const timer = window.setTimeout(() => setShown(null), notice.action ? 10000 : notice.undo ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const undoNotice = () => {
    notice?.undo?.();
    setShown(null);
  };

  // Items of the trash chosen together, by path; on a phone while its Select is on. Leaving the
  // trash lets go of them.
  const [trashChosen, setTrashChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [trashChoosing, setTrashChoosing] = useState(false);
  const letGoOfTrash = () => {
    setTrashChosen(new Set());
    setTrashChoosing(false);
  };
  useEffect(() => {
    if (!phone && active !== TRASH) letGoOfTrash();
  }, [phone, active]);

  // Files: what it lists, read only while it is shown; its rows chosen together as the trash's.
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [filesShown, setFilesShown] = useState(false);
  const [filesChosen, setFilesChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [filesChoosing, setFilesChoosing] = useState(false);
  const letGoOfFiles = () => {
    setFilesChosen(new Set());
    setFilesChoosing(false);
  };
  const filesOnScreen = phone ? filesShown : active === FILES;
  useEffect(() => {
    if (!phone && active !== FILES) letGoOfFiles();
  }, [phone, active]);
  const [filesRead, setFilesRead] = useState(0);
  const readFilesAgain = () => setFilesRead((n) => n + 1);
  useEffect(() => {
    if (!filesOnScreen) return;
    let live = true;
    void session.files().then((list) => live && setFiles(list));
    return () => {
      live = false;
    };
  }, [filesOnScreen, fileCount, trash, tree, filesRead, fileVersion]);

  useEffect(() => {
    // Coming back to the window: another program may have changed the notes in the meantime.
    const onFocus = () => void session.rescan();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [session]);

  const closeDialog = () => setDialog(null);
  // New things go to the folder of the tab on screen, or to the top of the personal space.
  const newFolder = (active && folderOf(active)) ?? '';
  // Or to the folder or the space whose menu Create was opened from.
  const createIn = dialog?.kind === 'new' && dialog.folder !== undefined ? dialog.folder : newFolder;
  const create = async (kind: ItemKind, choice: FolderChoice, name: string, template: Template, collectionTemplate: CollectionTemplate, links?: BoardLinks, module?: string) => {
    // A new note is made to be written in: on a phone the keyboard stays for it.
    if (kind === 'note') session.holdKeyboard();
    // Made from an app: into the module chosen of its menu, then on screen in the app's tab; a note in its own.
    const inApp = dialog?.kind === 'new' ? dialog.app : undefined;
    const menu = inApp ? menuEditFor(inApp) : null;
    const then =
      inApp && menu && (kind === 'collection' || kind === 'board' || kind === 'note')
        ? async (path: string) => {
            const into = menu.modules.find((m) => m.key === module) ?? menu.modules[0];
            into?.screens.push({ kind, path, name: basename(path), hidden: false });
            await session.saveAppMenu(inApp, menu, []);
            void session.appAt(inApp).then((file) => setAppFiles((was) => ({ ...was, [inApp]: file })));
            if (kind === 'note') return void (await session.open(path));
            session.lookAtApp(inApp, { ...(appLooks[inApp]?.files && { files: true }), ...(into && { module: into.key }), screen: path });
            await session.open(appTab(inApp));
          }
        : undefined;
    const error = await session.create(kind, choice.folder, name, choice.create, template, collectionTemplate, links, then);
    if (!error) setDialog(null);
    else session.releaseKeyboard(false);
    return error;
  };

  // Nothing is deleted without asking first.
  const ask = (title: string, message: string, run: () => void, action = t('delete.action'), danger = true) =>
    setDialog({ kind: 'confirm', title, message, action, danger, run });

  // A button of a collection's rules: worked out first, asked about when it says so, then written
  // at once, its toast with Undo; one that stops writes nothing and says where until it is closed.
  const buttonStopped = (name: string, stop: RuleStop) =>
    setShown({
      title: t('run.stopped', { name }),
      text: stop.line > 0 ? t('run.stoppedAt', { line: stop.line, message: stop.message }) : t('run.stoppedWhy', { message: stop.message }),
      sticky: true,
      toast: true,
    });
  // What runs on save of the records a button changed and stopped is left out, the rest written: both said, until closed.
  const runButton = (run: ButtonRun) =>
    void session.runButton(run).then(
      (undo) => {
        const stop = run.plan.stops?.at(-1);
        if (!stop) return setShown({ text: run.done, undo: () => void undo(), toast: true });
        setShown({ title: t('run.stopped', { name: stop.name }), text: t('run.leftOut', { line: stop.line, message: stop.message, done: run.done }), undo: () => void undo(), sticky: true, toast: true });
      },
      (error: unknown) => buttonStopped(run.plan.action, new RuleStop(error instanceof Error ? error.message : t('error.record'), 0)),
    );
  // What a record's rules did elsewhere as it was saved, with Undo; where one stopped, until closed.
  const saveRuled = (event: RuleEvent) => {
    const undo = event.undo && (() => void event.undo!());
    const stop = event.stops.at(-1);
    if (!stop) return setShown({ text: event.done, ...(undo && { undo }), toast: true });
    const said = event.stops.length > 1 ? t('run.savesStopped', { count: event.stops.length }) : t('run.saveStoppedAt', { line: stop.line, message: stop.message, record: stop.record });
    setShown({ title: t('run.stopped', { name: stop.name }), text: event.done ? `${said} ${event.done}.` : said, ...(undo && { undo }), sticky: true, toast: true });
  };
  const pressButton = (dir: string, id: string, name: string) => {
    // One that asks opens its questions first; what it does is worked out there.
    if (session.askButton(dir, id, name)) return setDialog({ kind: 'askButton', dir, id, name });
    const run = session.planButton(dir, id, name);
    if (run instanceof RuleStop) return buttonStopped(name, run);
    const record = collections[dir]?.records.find((r) => r.id === id);
    if (run.plan.confirm) setDialog({ kind: 'button', run, record: record ? recordTitle(record) : name });
    else runButton(run);
  };
  const deleteItem = (path: string) => {
    if (path in collections) {
      const name = quote(collectionName(path));
      const total = collections[path]?.records.length ?? 0;
      const message =
        total > 0 ? t('delete.collectionWithRecords', { name, records: t('count.records', { count: total }) }) : t('delete.collectionText', { name });
      ask(t('delete.collection'), message, () => void session.trashFolder(path));
    } else if (isTaskListPath(path)) {
      const name = quote(listName(path));
      const total = tasks[path]?.length ?? 0;
      const message =
        total > 0 ? t('delete.listWithTasks', { name, tasks: t('count.tasks', { count: total }) }) : t('delete.listText', { name });
      ask(t('delete.list'), message, () => void session.trash(path));
    } else if (isBoardPath(path)) {
      const name = quote(boardName(path));
      const total = boards[path]?.cards.length ?? 0;
      const message =
        total > 0 ? t('delete.boardWithCards', { name, cards: t('count.cards', { count: total }) }) : t('delete.boardText', { name });
      ask(t('delete.board'), message, () => void session.trash(path));
    } else if (isKeysPath(path)) {
      const name = quote(keysName(path));
      const total = keyCount(parseKeys(keyFiles[path] ?? ''));
      const message =
        total > 0 ? t('delete.keysFileWithKeys', { name, keys: t('count.keys', { count: total }) }) : t('delete.keysFileText', { name });
      ask(t('delete.keysFile'), message, () => void session.trash(path));
    } else {
      const name = quote(titles[path] ?? t('note.untitled'));
      ask(t('delete.note'), t('delete.noteText', { name }), () => void session.trash(path));
    }
  };
  const deleteFolder = (path: string) => {
    const node = findNode(tree, path);
    const contents = node ? contentsOf(node) : '';
    const name = quote(basename(path));
    const message = contents ? t('delete.folderWithContents', { name, contents }) : t('delete.folderText', { name });
    ask(t('delete.folder'), message, () => void session.trashFolder(path));
  };
  // A task, a section or a card goes to the trash without asking, a task with its subtasks and a
  // section with its tasks; Undo brings it back at once, the trash later.
  /**
   * Puts an item of the trash back. A task, a section or a card whose list or board is in the trash
   * too asks to bring both back; one whose list or board is gone says so.
   */
  const restoreTrashed = (item: TrashItem) =>
    void session.restore(item).catch((error: unknown) => {
      if (!(error instanceof PieceHomeGone)) throw error;
      const name = quote(error.home.endsWith(BOARD_EXT) ? boardName(error.home) : listName(error.home));
      const what = quote(item.title);
      const home = error.inTrash;
      if (home) ask(t('trash.homeInTrash', { name }), t('trash.homeInTrashText', { item: what, name }), () => void session.restore(home).then(() => session.restore(item)), t('trash.restoreBoth'), false);
      else setNotice(t('trash.homeGone', { name, item: what }));
    });
  const toTrash = (removed: Promise<() => Promise<void>>) => void removed.then((undo) => undoable(t('trash.movedNotice'), () => void undo().catch(() => undefined)));
  const deleteTask = (list: string, id: string) => toTrash(session.removeTask(list, id));
  /**
   * Every list and every section of it, as places to move a task to. The one a top-level task is
   * in is marked; a subtask is in none of them, as moving it makes it a top-level task.
   */
  const taskPlaces = (list: string, id: string): TaskPlaceChoice[] => {
    const task = tasks[list]?.find((candidate) => candidate.id === id);
    const known = (sections[list] ?? []).some((section) => section.id === task?.section);
    const here = task?.parent === null ? (known ? task.section! : null) : undefined;
    // A task stays in its space: its links do not reach another one.
    return allPlaces((path, section) => path === list && here === section).filter((place) => spaceOf(place.list) === spaceOf(list));
  };
  /** Every list, at its top level and in each of its sections. */
  const allPlaces = (isHere: (list: string, section: string | null) => boolean = () => false): TaskPlaceChoice[] =>
    Object.keys(tasks).flatMap((path) => [
      {
        list: path,
        section: null,
        label: listName(path),
        folder: folderLabel(dirname(path)),
        here: isHere(path, null),
      },
      ...(sections[path] ?? []).map((section) => ({
        list: path,
        section: section.id,
        label: section.name,
        here: isHere(path, section.id),
      })),
    ]);

  // A task from the note on screen: what is selected, or the line the cursor is on.
  function startToTask() {
    const made = session.taskFromNote();
    if (made) setDialog({ kind: 'toTask', ...made });
  }
  // A card from the note on screen, the same way.
  function startToCard() {
    const made = session.taskFromNote();
    if (made) setDialog({ kind: 'toCard', ...made });
  }
  /** Opens a card in its board's tab, in the panel. */
  const showCard = (board: string, id: string) => {
    void session.open(boardOf(board));
    setOpenCard({ board, id });
  };

  // A filter's menu: rename it, or delete it; its tasks stay where they are. It is changed on its page.
  const filterMenu = (event: MouseEvent, filter: TaskFilter) => openMenu(event, filterMenuItems(filter), filterTab(filter.id));
  /**
   * What a tab would be starred as (design/filters.md 5): a note, a list, a board, a keys file or a
   * collection by its path, a filter, a label in its space; null for what is not starred: Inbox,
   * which is always at the top, the onboarding note, a record and a view.
   */
  const favoriteOf = (tab: string): Favorite | null => {
    const filter = filterOf(tab);
    if (filter !== null) return { filter };
    const label = labelOfTab(tab);
    if (label !== null) {
      const { space, name } = splitLabel(label);
      return { label: name, ...(space && { space: inSpace(space, '') }) };
    }
    const path = collectionPathOf(tab) ?? pathOf(tab);
    return path !== null && path !== INBOX_TASKS && path !== WELCOME_NOTE && !(dirname(path) in collections) ? { item: path } : null;
  };
  /** Add to favorites, or Remove from favorites for what is starred. */
  const starItem = (favorite: Favorite): MenuItem => {
    const on = isFavorite(favorites, favorite);
    return { label: t(on ? 'favorites.remove' : 'favorites.add'), icon: 'star', run: () => session.star(favorite, !on) };
  };
  const filterMenuItems = (filter: TaskFilter): MenuItem[] => [
    starItem({ filter: filter.id }),
    { label: t('menu.rename'), icon: 'pen', run: () => setDialog({ kind: 'renameFilter', filter }) },
    {
      label: t('menu.delete'),
      icon: 'trash',
      danger: true,
      apart: true,
      run: () => ask(t('delete.filter'), t('delete.filterText', { name: quote(filter.name) }), () => void session.removeFilter(filter.id)),
    },
  ];

  // A section goes together with its tasks, as in Todoist.
  const deleteSection = (list: string, section: Section) => toTrash(session.removeSection(list, section.id));

  // A column with cards, or a phase, is not deleted without asking; closing a phase asks too. A card goes to the trash.
  const deleteCard = (board: string, card: Card) => toTrash(session.removeCard(board, card.id));
  const deleteColumn = (board: string, column: Column) => {
    const total = boards[board]?.cards.filter((card) => card.column === column.id).length ?? 0;
    if (total === 0) return session.removeColumn(board, column.id);
    const message = t('delete.columnWithCards', { name: quote(column.name), cards: t('count.cards', { count: total }) });
    ask(t('delete.column'), message, () => session.removeColumn(board, column.id));
  };
  const deletePhase = (board: string, phase: Phase) =>
    ask(t('delete.phase'), t('delete.phaseText', { name: quote(phase.name) }), () => session.removePhase(board, phase.id));
  // Its cards not finished go where the window says: the next open phase is picked to begin with.
  const closePhase = (board: string, phase: Phase) => {
    const whole = boards[board];
    if (!whole) return;
    const left = phaseCards(whole, phase.id).filter((card) => {
      const kind = whole.columns.find((column) => column.id === card.column)?.kind;
      return kind !== 'done' && kind !== 'dropped';
    }).length;
    if (left > 0) return setDialog({ kind: 'closePhase', board, phase, left });
    ask(t('phase.close'), t('phase.closeText', { name: quote(phase.name) }), () => session.closePhase(board, phase.id, 'next'), t('phase.closeAction'), false);
  };

  const deleteForever = (item: TrashItem, then?: () => void) =>
    ask(
      t('delete.forever'),
      t(item.kind === 'note' || item.kind === 'folder' ? 'delete.foreverWithFiles' : 'delete.foreverText', {
        name: quote(item.title),
      }),
      () => {
        void session.deleteForever(item);
        then?.();
      },
      t('delete.forever'),
    );
  // A deleted item looked at before it is put back: a window on a computer, a page on a phone.
  const [trashOpen, setTrashOpen] = useState<TrashItem | null>(null);
  const trashShown = trashOpen && trash.some((item) => item.path === trashOpen.path) ? trashOpen : null;
  /** Where a file is used, opened: a note in its tab, a card on its board, a record over what is open. */
  const openUse = (use: FileUse) => {
    if (use.kind === 'card' && use.card) return showCard(use.path, use.card.id);
    // A task opens in its list, shown and marked there; on a phone as its sheet.
    if (use.kind === 'task' && use.task) {
      if (phone) return setTaskSheet({ list: use.path, id: use.task.id, subtask: false });
      void session.open(tasksOf(use.path));
      return setRevealTask({ list: use.path, id: use.task.id, at: Date.now() });
    }
    if (use.kind === 'record') {
      const dir = dirname(use.path);
      const record = collections[dir]?.records.find((each) => each.path === use.path);
      if (!record) return;
      return phone ? setRecordAsked({ dir, id: record.id }) : setRecordOver({ dir, id: record.id });
    }
    void session.open(use.path);
  };
  const spaceName = (id: string | null) => trashSpaces.find((each) => each.id === id)?.name ?? '';
  /** Asks before deleting files, saying where they are taken out of; then deletes them with Undo. */
  const askDeleteFiles = (rows: FileRow[]) => {
    if (rows.length === 0) return;
    const seen = new Set<string>();
    const places = rows
      .flatMap((file) => file.uses)
      .filter((use) => !use.inTrash && !seen.has(`${use.path} ${use.card?.id ?? ''}`) && seen.add(`${use.path} ${use.card?.id ?? ''}`));
    const one = rows.length === 1;
    const count = rows.length;
    const title = one ? t('files.deleteOne', { name: quote(fileTitle(rows[0]!)) }) : t('files.deleteMany', { count });
    const names = new Intl.ListFormat(locale(), { type: 'conjunction' }).format(places.map(useTitle));
    setDialog({
      kind: 'confirm',
      title,
      message: places.length > 0 ? t(one ? 'files.oneUsed' : 'files.manyUsed', { count: places.length }) : t('files.unusedGoes', { count }),
      places: places.map((use) => ({
        icon: useIcon(use),
        name: useTitle(use),
        sub: [useWord(use), use.kind === 'card' ? boardName(use.path) : use.kind === 'record' ? collectionName(dirname(use.path)) : use.kind === 'task' ? listName(use.path) : placeLabel(use.path)].filter(Boolean).join(' · '),
      })),
      after: places.length > 0 ? t('files.goesToTrash', { count }) : undefined,
      brief: places.length > 0 ? t('files.takenOut', { count, places: names }) : t('files.unusedGoes', { count }),
      action: t('files.deleteAction', { count }),
      danger: true,
      run: () => {
        letGoOfFiles();
        void session.deleteFiles(rows).then((undo) => {
          readFilesAgain();
          undoable(t('files.deletedNotice', { count }), () => void undo().then(readFilesAgain));
        });
      },
    });
  };
  const shareFiles = async (rows: FileRow[]) => {
    // A file left in the cloud is brought first; sharing it is then one more tap, as a phone shares only on a tap.
    const away = rows.filter((file) => file.away);
    if (away.length > 0) {
      for (const file of away) void session.download(file.path);
      return;
    }
    try {
      const shared = await Promise.all(rows.map(async (file) => new File([await session.attachedBlob(file.path)], file.name, { type: (await session.attachedBlob(file.path)).type })));
      if (navigator.canShare?.({ files: shared })) await navigator.share({ files: shared });
      else for (const file of shared) downloadBlob(file.name, file);
    } catch {
      // Shared nowhere: the share sheet was closed.
    }
  };
  const fileActions: FileActions = {
    open: (file) => void session.openAttached(file.path),
    fetch: (file) => void session.download(file.path),
    ...(isDesktop
      ? { reveal: (file) => session.revealAttached(file.path) }
      : { download: (file) => void session.attachedBlob(file.path).then((blob) => downloadBlob(file.name, blob), () => undefined) }),
    rename: (file) => setDialog({ kind: 'renameFile', path: file.path }),
    remove: askDeleteFiles,
    openUse,
    image: session.imageOf,
    menu: (file) =>
      showSheet(
        [
          ...file.uses.map(
            (use): MenuItem => ({ label: useTitle(use), icon: useIcon(use), value: use.inTrash ? t('files.inTrash') : useWord(use), run: () => !use.inTrash && openUse(use) }),
          ),
          { label: t('files.open'), icon: 'open', run: () => void session.openAttached(file.path), apart: file.uses.length > 0 },
          { label: t('files.share'), icon: 'share', run: () => void shareFiles([file]) },
          { label: t('files.rename'), icon: 'pen', run: () => setDialog({ kind: 'renameFile', path: file.path }) },
          { label: t('menu.delete'), icon: 'trash', danger: true, run: () => askDeleteFiles([file]) },
        ],
        { icon: 'file', title: fileTitle(file), sub: `${sizeText(file.size)}${trashSpaces.length > 1 ? ` · ${spaceName(file.space)}` : ''}`, picture: <Thumb file={file} image={session.imageOf} className="mb-thumb" /> },
      ),
    chooseSpace: (at, pick) => {
      if (trashSpaces.length === 1) return pick(null);
      const items = trashSpaces.map((each): MenuItem => ({ label: each.name, icon: 'space', run: () => pick(each.id) }));
      if (phone) showSheet(items, { icon: 'import', title: t('files.uploadTo') });
      else setMenu({ at, items });
    },
    upload: async (space, list) => {
      const count = await session.uploadFiles(space, list);
      if (count > 0) setNotice(t('files.uploaded', { count }));
      readFilesAgain();
      return count;
    },
    ...(isDesktop && { clipboardFiles: clipboardFilesOnDesktop }),
    chooseSort: (sort, onPick) => {
      const pick = (next: FileSort, label: string, icon: IconName): MenuItem => ({
        label,
        icon,
        ...(sort.key === next.key && { value: '✓' }),
        run: () => onPick(next),
      });
      showSheet([pick({ key: 'added', dir: 'desc' }, t('files.newest'), 'clock'), pick({ key: 'size', dir: 'desc' }, t('files.largest'), 'sort'), pick({ key: 'name', dir: 'asc' }, t('files.byName'), 'list')], {
        icon: 'sort',
        title: t('files.sort'),
        sub: t('files.title'),
      });
    },
  };
  const askEmptyTrash = () =>
    ask(t('delete.empty'), t('delete.emptyText', { count: trash.length }), () => void session.emptyTrash(), t('delete.empty'));
  const chosenTrash = trash.filter((item) => trashChosen.has(item.path));
  const trashChoice: TrashChoice = {
    chosen: trashChosen,
    choosing: trashChoosing,
    onChoose: (paths, on) =>
      setTrashChosen((was) => {
        const next = new Set(was);
        for (const path of paths) {
          if (on) next.add(path);
          else next.delete(path);
        }
        return next;
      }),
    onRestore: () => {
      if (chosenTrash.length === 0) return;
      letGoOfTrash();
      void session.restoreMany(chosenTrash).then((count) => count > 0 && setNotice(t('trash.restoredNotice', { count })));
    },
    onDelete: () => {
      const count = chosenTrash.length;
      if (count === 0) return;
      ask(
        t('delete.foreverMany', { count }),
        t('delete.foreverManyText', { count }),
        () => {
          letGoOfTrash();
          void session.deleteForeverMany(chosenTrash);
        },
        t('delete.forever'),
      );
    },
  };

  // The history window restores into the editor, so the note is opened first.
  const showHistory = async (path: string) => {
    await session.open(path);
    setDialog({ kind: 'history', path });
  };

  // A menu opened on a row of the sidebar opens under the row, so that it covers nothing of it.
  const openMenu = (event: MouseEvent, items: MenuItem[], target?: string) => {
    event.preventDefault();
    const row = event.currentTarget instanceof Element ? event.currentTarget.closest('.side .it') : null;
    const at = { x: event.clientX, y: row ? row.getBoundingClientRect().bottom + 2 : event.clientY };
    setMenu({ at, items, ...(row && target !== undefined && { target }) });
  };
  // The spaces' names, for the places a path is shown as words.
  useEffect(() => setSpaceNames(new Map(spaces.map((each) => [each.id, each.name])), space.name ?? ''), [spaces, space.name]);
  // A space's heading: what can be made at its top, as in a folder, its settings, its place among
  // the spaces, and the way out of this device. The personal space stays first and stays, so it
  // has no more than its settings.
  // Its +: what can be made at its top.
  const spaceAdd = (event: MouseEvent, id: string | null, addFolder: () => void) => openMenu(event, folderMenuItems(inSpace(id, ''), addFolder), id ? `@${id}` : '@personal');
  // Its other button: how its top is put in order, then its settings, its place and leaving this
  // device; a right click, `addFolder`, has Add new over them.
  const spaceMenu = (event: MouseEvent, id: string | null, addFolder?: () => void) => {
    const at = id ? spaces.findIndex((space) => space.id === id) : -1;
    const items: MenuItem[] = [
      ...orderItems(id ? inSpace(id, '') : ''),
      { label: t('side.spaceSettings'), icon: 'settings', apart: true, run: () => setDialog({ kind: 'settings', section: 'spaces', space: id }) },
    ];
    if (id) {
      items.push(
        { label: t('side.moveUp'), apart: true, run: () => void session.moveSpace(id, -1), ...(at === 0 && { disabled: t('side.first') }) },
        { label: t('side.moveDown'), run: () => void session.moveSpace(id, 1), ...(at === spaces.length - 1 && { disabled: t('side.last') }) },
        { label: t('side.removeSpace'), apart: true, run: () => askRemoveSpace(id) },
      );
    }
    openMenu(event, addFolder ? withAddNew(inSpace(id, ''), addFolder, items) : items, id ? `@${id}` : '@personal');
  };
  const askRemoveSpace = (id: string) => setDialog({ kind: 'removeSpace', id });
  /**
   * Moves something into a folder; to another space it is a copy there, the original in its own
   * trash, which is said. Returns why when it could not be moved.
   */
  const moveTo = async (path: string, folder: string): Promise<string | null> => {
    const [from, to] = [spaceOf(path), spaceOf(folder)];
    try {
      await session.move(path, folder);
    } catch (error) {
      return t('move.failed', { name: quote(nameOfItem(path) || basename(path)), error: error instanceof Error ? error.message : String(error) });
    }
    if (from === to) return null;
    const named = (id: string | null) => (id ? (spaces.find((each) => each.id === id)?.name ?? '') : (space.name ?? t('settings.personal')));
    setNotice(t('move.across', { space: named(to), from: named(from) }));
    return null;
  };
  /** Moves something dropped on a folder or chosen in Move to; why it could not be is said in the status bar. */
  const moveAndSay = (path: string, folder: string) => void moveTo(path, folder).then((error) => error && setNotice(error));
  /**
   * A space leaves this device: its sync stops first, a turn running ending before, so that no
   * turn sees its files go and takes that to the cloud; then its copy here may be deleted.
   */
  const removeSpace = async (id: string, deleteFiles: boolean) => {
    await syncService.forgetSpace(id);
    await session.removeSpace(id, deleteFiles);
  };
  /**
   * Desktop: a space's copy moves to another folder, an empty one. Its sync stops first, a turn
   * running ending before, so that no turn reads its files as they go; it starts again once the
   * space is opened where it is now. A folder that cannot take it is refused with a word why.
   */
  const changeSpaceFolder = async (id: string, ask: AskOneDrive) => {
    try {
      const to = await chooseSpaceFolder(ask);
      if (!to) return;
      await syncService.forgetSpace(id);
      await session.moveSpaceCopy(id, to);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  // The menu of a note, a task list, a board, a keys file or a collection; Inbox, the personal space's own list, has none.
  const itemMenu = (event: MouseEvent, path: string) => path !== INBOX_TASKS && openMenu(event, inGroups(itemMenuItems(path)), path);
  /**
   * A tab's menu, at the pointer, for the tab right-clicked, which stays marked while it is open:
   * closing it and the tabs beside it, where it is on this computer, then its item's own menu. A
   * view or a filter has the first group only.
   */
  const tabMenu = (event: MouseEvent, id: string) => {
    event.preventDefault();
    const at = tabs.indexOf(id);
    const path = collectionPathOf(id) ?? pathOf(id);
    const items: MenuItem[] = [
      { label: t('tab.closeOne'), run: () => void session.close(id) },
      { label: t('tab.closeOthers'), run: () => void session.closeOthers(id), ...(tabs.length === 1 && { disabled: '' }) },
      { label: t('tab.closeRight'), run: () => void session.closeToTheRight(id), ...(at === tabs.length - 1 && { disabled: '' }) },
      { label: t('tab.closeAll'), run: () => void session.closeAll() },
    ];
    if (path && isDesktop && isOnDisk(path)) items.push({ label: t(onMac ? 'tab.revealFinder' : 'tab.revealExplorer'), apart: true, run: () => session.revealAttached(path) });
    if (path && path !== INBOX_TASKS) items.push(...inGroups(itemMenuItems(path)));
    // A filter's and a label's tab are starred from here too.
    const starred = favoriteOf(id);
    if (starred && !('item' in starred)) items.push({ ...starItem(starred), apart: true });
    setMenu({ at: { x: event.clientX, y: event.clientY }, items, target: `tab:${id}` });
  };
  /** What an item or a folder is called, as the Rename window shows it. */
  const nameOfItem = (path: string) =>
    isTaskListPath(path)
      ? listName(path)
      : isBoardPath(path)
        ? boardName(path)
        : isKeysPath(path)
          ? keysName(path)
          : path in collections
            ? collectionName(path)
            : session.isFolder(path)
              ? shownName(basename(path))
              : (titles[path] ?? '');
  /** The places something can be moved to: not into itself, when it is a folder, nor a folder inside it. */
  const placesFor = (path: string) => everyFolder(tree, spaces).filter((folder) => !isUnder(folder, path));
  /** The Rename window's name and folder: the name first, then the move, where either changed. */
  const saveNameAndPlace = async (path: string, name: string, folder: FolderChoice): Promise<string | null> => {
    let at = path;
    if (name !== nameOfItem(path)) {
      const done = await session.renamed(path, name);
      if ('error' in done) return done.error;
      at = done.path;
    }
    if (folder.create) return session.moveToNewFolder(at, folder.folder);
    return folder.folder !== dirname(at) ? moveTo(at, folder.folder) : null;
  };
  /** A tab double-clicked is renamed as its menu's Rename does, a filter's too; a view has no name to change. */
  const renameTab = async (id: string) => {
    const filter = filters.find((each) => each.id === filterOf(id));
    const path = collectionPathOf(id) ?? pathOf(id);
    if (!filter && (!path || path === INBOX_TASKS || path === WELCOME_NOTE)) return;
    // A note opened by the clicks takes the focus a moment later; the window comes after that, so that its field keeps it.
    await session.open(id);
    window.setTimeout(() => setDialog(filter ? { kind: 'renameFilter', filter } : { kind: 'rename', path: path! }));
  };
  /** Whether the item is a note (a record is one too): not a task list, a board, a keys file or a collection. */
  const isNoteFile = (path: string) => !(isTaskListPath(path) || isBoardPath(path) || isKeysPath(path) || path in collections);
  // The onboarding note stays where it is, as it is called: it has its history and goes out, and is closed rather than deleted.
  const itemMenuItems = (path: string, history: (path: string) => void = (path) => void showHistory(path)): MenuItem[] => {
    const starred = favoriteOf(path in collections ? collectionTab(path) : tabOf(path));
    return [
      ...(starred ? [starItem(starred)] : []),
      ...(path === WELCOME_NOTE
        ? []
        : [
            { label: t('menu.moveTo'), icon: 'move' as const, run: () => setDialog({ kind: 'move', path }) },
            { label: t('menu.rename'), icon: 'pen' as const, run: () => setDialog({ kind: 'rename', path }) },
          ]),
      // Only notes keep a history; a keys file keeps none, so that a password changed is gone.
      ...(isNoteFile(path) ? [{ label: t('menu.history'), icon: 'clock' as const, run: () => history(path) }] : []),
      // A note goes out as a PDF, an HTML file or its Markdown; a record does not.
      ...(isNoteFile(path) && !(dirname(path) in collections) ? [{ label: t('menu.export'), icon: 'export' as const, run: () => setDialog({ kind: 'export', path }) }] : []),
      // A collection goes out to an Excel or a CSV file and comes in from either.
      ...(path in collections
        ? [
            { label: t('menu.exportExcel'), icon: 'export' as const, run: () => void exportExcel(path) },
            { label: t('menu.exportCsv'), icon: 'export' as const, run: () => void exportCsv(path) },
            { label: t('menu.import'), icon: 'import' as const, run: () => chooseImport(path) },
          ]
        : []),
      ...(path === WELCOME_NOTE ? [] : [{ label: t('menu.delete'), icon: 'trash' as const, danger: true, run: () => deleteItem(path) }]),
    ];
  };
  /** On a phone a menu is an action sheet, with what it is about at its top. */
  const showSheet = (items: MenuItem[], head?: MenuHead) => setMenu({ at: { x: 0, y: 0 }, items, head });
  /**
   * The menu of something open on a phone, from its page's ··· or from its row held, where it has
   * no tab and no status bar: what the sidebar's menu has, and on a note's page Markdown.
   */
  const phoneItemMenu = (id: string, page = false) => {
    const filter = filters.find((each) => each.id === filterOf(id));
    const icon = iconOf(id);
    const kinds = { note: 'create.note', tasks: 'create.tasks', board: 'create.board', keys: 'create.keys', collection: 'create.collection', filter: 'create.filter' } as const;
    const kind = t(kinds[icon as keyof typeof kinds] ?? 'create.note');
    const head: MenuHead = {
      icon,
      title: nameOf(id, tabTitles, filters),
      sub: t('phone.kindIn', { kind, folder: filter ? t('filters.title') : folderLabel(folderOf(id) ?? '') }),
      // A note's own page, where there is no status bar, says when it was last written under its menu.
      ...(page && id === active && written !== null && { foot: writtenText(written) }),
    };
    if (filter) return showSheet(filterMenuItems(filter), head);
    // A label's view, and its row held in Filters & Labels: its star.
    const label = labelOfTab(id);
    if (label !== null) {
      const { space: where, name } = splitLabel(label);
      return showSheet([starItem(favoriteOf(id)!)], { icon: 'tag', title: name, sub: t('phone.kindIn', { kind: t('filters.label'), folder: spaceLabel(where) }) });
    }
    const path = collectionPathOf(id) ?? pathOf(id);
    // A note's own page has Find and Markdown; its history opens as pages over it.
    const markdown: MenuItem[] = page && isNote(id)
      ? [
          { label: t('find.find'), icon: 'search', run: () => session.openFind() },
          { label: t('status.markdown'), icon: 'markdown', value: source ? t('phone.on') : t('phone.off'), run: () => session.setSource(!source) },
        ]
      : [];
    let items = path === null || path === INBOX_TASKS ? [] : itemMenuItems(path, setPhoneHistory);
    // A list's own page adds a section; + adds a task.
    if (page && path !== null && isTaskListPath(path)) markdown.push({ label: t('sections.add'), icon: 'plus', run: () => setSectionSheet({ list: path, section: null }) });
    const board = path !== null && page ? boards[path] : undefined;
    // A collection's own page has its Fields first, with its CSV, then where it is and its name.
    if (page && path !== null && path in collections) {
      const csv = items.filter((item) => item.icon === 'export' || item.icon === 'import');
      markdown.push({ label: t('collection.fields'), icon: 'settings', run: () => setCollectionFields((n) => n + 1) }, ...csv);
      items = items.filter((item) => !csv.includes(item));
    }
    if (board && path !== null) {
      markdown.push(
        { label: t('phone.fieldsMenu'), icon: 'settings', run: () => setBoardFields((n) => n + 1) },
        { label: t('phone.phases'), icon: 'phase', value: board.phasesOn ? t('phone.on') : t('phone.off'), run: () => session.setPhasesOn(path, !board.phasesOn) },
        { label: t('board.addColumn'), icon: 'plus', run: () => session.addColumn(path, t('board.newColumn'), 'active') },
      );
    }
    if (markdown.length + items.length === 0) return;
    // History and what follows it are apart from Markdown.
    showSheet([...markdown, ...items.map((item, i) => (i === 0 && markdown.length > 0 ? { ...item, apart: true } : item))], head);
  };
  /** A folder's menu on a phone, from its page's ··· or from its row held. */
  const phoneFolderMenu = (path: string, addFolder: () => void) => {
    if (nodeOf(path)?.app) return showSheet(appMenuItems(path, true), { icon: appIcons[path] ?? 'app', title: folderLabel(path), sub: t('create.app') });
    const parent = dirname(path);
    const top = localPath(path) === '';
    const sub = top ? undefined : parent ? t('phone.kindIn', { kind: t('create.folder'), folder: folderLabel(parent) }) : t('create.folder');
    // A space's top has its order on its own button; a folder has it in its menu.
    showSheet(top ? folderMenuItems(path, addFolder) : [...appItems(path), ...folderMenuItems(path, addFolder), ...placeItems(path, true), ...orderItems(path), folderDelete(path)], { icon: top ? 'space' : 'folder', title: folderLabel(path), sub });
  };
  // A collection as a CSV file, saved where the user says.
  const exportCsv = async (dir: string) => {
    const collection = collections[dir];
    if (!collection) return;
    const name = `${collectionName(dir)}.csv`;
    try {
      if (await saveTextFile(name, collectionCsv(collection, Object.values(collections), boards, t('collection.body'), today), 'text/csv', 'csv')) setNotice(t('import.exported', { name }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  // The same as an Excel file, each value a cell of its kind.
  const exportExcel = async (dir: string) => {
    const collection = collections[dir];
    if (!collection) return;
    const name = `${collectionName(dir)}.xlsx`;
    try {
      const blob = await writeSheet(collectionName(dir), collectionSheet(collection, Object.values(collections), boards, t('collection.body'), today));
      if (await saveFile(name, blob, 'xlsx')) setNotice(t('import.exported', { name }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  // A CSV or Excel file chosen for a collection opens the import window. An Excel file's sheets
  // come along, and the import starts at the first with rows in it.
  const importInput = useRef<HTMLInputElement>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ dir: string; fileName: string; header: string[]; rows: string[][]; sheets?: Sheet[]; sheet?: number } | null>(null);
  const chooseImport = (dir: string) => {
    setImportFor(dir);
    if (importInput.current) {
      importInput.current.value = '';
      importInput.current.click();
    }
  };
  const readImport = async (file: File) => {
    const dir = importFor;
    if (!dir) return;
    if (isSpreadsheet(file.name)) {
      let sheets: Sheet[];
      try {
        sheets = await readSheets(file);
      } catch {
        return setNotice(t('import.unreadable', { name: file.name }));
      }
      const sheet = sheets.findIndex((s) => s.rows.length > 0);
      if (sheet < 0) return setNotice(t('import.empty'));
      return setImporting({ dir, fileName: file.name, header: sheets[sheet]!.header, rows: sheets[sheet]!.rows, sheets, sheet });
    }
    const [header, ...rows] = parseCsv(await file.text());
    if (!header || rows.length === 0) return setNotice(t('import.empty'));
    setImporting({ dir, fileName: file.name, header, rows });
  };
  // When the items were made, as the app keeps it, and a collection's files written, for their order.
  const nodeTimes: NodeTimes = {
    created: (node) => created[node.path.toLowerCase()],
    written: (node) => (node.kind === 'collection' ? collections[node.path]?.written : undefined),
  };
  // A folder, as a space: its + for what can be made in it, and its other button for how its
  // items are put in order and deleting it; a right click, `addFolder`, has Add new over them.
  const folderAdd = (event: MouseEvent, path: string, addFolder: () => void) => openMenu(event, folderMenuItems(path, addFolder), path);
  const folderMenu = (event: MouseEvent, path: string, addFolder?: () => void) => {
    if (nodeOf(path)?.app) return appMenu(event, path);
    const items = [...appItems(path), ...placeItems(path, appItems(path).length > 0), ...orderItems(path), folderDelete(path)];
    openMenu(event, addFolder ? withAddNew(path, addFolder, items) : items, path);
  };
  // A folder goes elsewhere, with what is in it, or gets another name, as a note does.
  const placeItems = (path: string, apart: boolean): MenuItem[] => [
    { label: t('menu.moveTo'), icon: 'move', apart, run: () => setDialog({ kind: 'move', path }) },
    { label: t('menu.rename'), icon: 'pen', run: () => setDialog({ kind: 'rename', path }) },
  ];
  // An app's folder has Add to app first, the New app window with the app's templates there already; then Edit app, its answers to change.
  const appItems = (path: string): MenuItem[] =>
    [tree, ...spaces.map((s) => s.tree)].some((nodes) => findNode(nodes, path)?.app)
      ? [
          {
            label: t('menu.addToApp'),
            icon: 'app',
            run: () => {
              setDrawer(false);
              void session.appAt(path).then((app) => app && setDialog({ kind: 'addToApp', folder: path, app }));
            },
          },
          {
            label: t('menu.editApp'),
            icon: 'pen',
            run: () => {
              setDrawer(false);
              void session.appAt(path).then((app) => app && setDialog({ kind: 'editApp', folder: path, app }));
            },
          },
        ]
      : [];
  /**
   * An app's menu (design/app-home.md 3): its Home and its About note, adding to it and changing its
   * answers, its files shown in the sidebar or not, where it is and its name, deleting it.
   */
  const appMenu = (event: MouseEvent, path: string) => openMenu(event, appMenuItems(path), path);
  // On a phone the app's page has its About note and its files as rows: its sheet has neither, nor Home.
  const appMenuItems = (path: string, phone = false): MenuItem[] => {
    const look = appLooks[path] ?? {};
    const { files: _files, ...rest } = look;
    const about = aboutOf(path);
    const [add, ...edit] = appItems(path);
    const home: MenuItem = {
      label: t('menu.appHome'),
      icon: 'app',
      run: () => {
        session.lookAtApp(path, look.files ? { files: true } : {});
        void session.open(appTab(path));
      },
    };
    // Edit menu, and New for a screen made in it; Edit app only where there are templates' answers to change.
    const menuItems: MenuItem[] = [
      { label: t('menu.editMenu'), icon: 'menu', apart: !phone, run: () => (setDrawer(false), setDialog({ kind: 'editMenu', folder: path })) },
      { label: t('menu.newInApp'), icon: 'plus', run: () => undefined, items: newInAppItems(path) },
    ];
    const answered = (appFiles[path]?.templates.length ?? 1) > 0;
    return [
      ...(phone ? [] : [home, ...(about ? [{ label: about.name, icon: 'note' as const, run: () => void session.open(about.path) }] : [])]),
      ...(appFiles[path] ? menuItems : []),
      ...(add ? [add, ...(answered ? edit : [])] : []),
      ...(phone ? [] : [{ label: t(look.files ? 'menu.hideFiles' : 'menu.showFiles'), icon: 'folder' as const, apart: true, run: () => session.lookAtApp(path, look.files ? rest : { ...rest, files: true }) }]),
      ...placeItems(path, phone),
      { ...folderDelete(path), label: t('menu.deleteApp') },
    ];
  };
  /** What can be made in an app for its menu: a collection, a board or a note, in a module asked for in Create. */
  const newInAppItems = (path: string): MenuItem[] =>
    (['collection', 'board', 'note'] as const).map((kind) => ({
      label: t(`create.${kind}`),
      icon: kind,
      run: () => (setDrawer(false), setDialog({ kind: 'new', start: kind, folder: path, app: path })),
    }));
  /** An app's About note, at the top of its folder: its path and its name. */
  const aboutOf = (path: string) => {
    const node = nodeOf(path);
    const file = `${aboutName(appFiles[path]?.name ?? node?.name ?? '')}.md`.toLowerCase();
    const note = node?.children?.find((each) => each.kind === 'note' && each.name.toLowerCase() === file);
    return note ? { path: note.path, name: titles[note.path] ?? note.title ?? note.name.replace(/\.md$/, '') } : null;
  };
  const folderDelete = (path: string): MenuItem => ({ label: t('menu.deleteFolder'), icon: 'trash', danger: true, run: () => deleteFolder(path), apart: true });
  /**
   * How the items of a folder (by its path), or of a space's top (its key, '' for the personal
   * space), are put in order on this device: Group by and Sort by, each a menu of its own, and
   * Reset to defaults.
   */
  const orderItems = (key: string): MenuItem[] => {
    const look = folderLooks[key] ?? DEFAULT_LOOK;
    const set = (patch: Partial<FolderLook>) => () => session.lookAtFolder(key, { ...look, ...patch });
    const groups = { type: t('side.groupType'), none: t('side.groupNone') };
    const sorts = { name: t('side.byName'), created: t('side.byCreated'), modified: t('side.byModified') };
    return [
      {
        label: t('side.groupBy'),
        icon: 'list',
        value: groups[look.group],
        apart: true,
        run: () => undefined,
        items: [
          ...(['type', 'none'] as const).map((group) => ({ label: groups[group], checked: look.group === group, run: set({ group }) })),
          // Apart from the grouping: the folders on top, or among the rest.
          { label: t('side.foldersFirst'), checked: foldersFirst(look), apart: true, run: set({ foldersFirst: !foldersFirst(look) }) },
        ],
      },
      {
        label: t('side.sortBy'),
        icon: 'sort',
        value: sorts[look.by],
        run: () => undefined,
        items: [
          ...(['name', 'created', 'modified'] as const).map((by) => ({ label: sorts[by], checked: look.by === by, run: set({ by }) })),
          { label: t('side.ascending'), checked: look.dir === 'asc', apart: true, run: set({ dir: 'asc' }) },
          { label: t('side.descending'), checked: look.dir === 'desc', run: set({ dir: 'desc' }) },
        ],
      },
      { label: t('side.resetOrder'), icon: 'undo', run: () => session.lookAtFolder(key, DEFAULT_LOOK), ...(isDefaultLook(look) && { disabled: '' }) },
    ];
  };
  // What can be made in a folder, or at the top of a space. Each opens its Create window with the
  // folder chosen, a note too, the drawer closed so that what is made shows; a new folder is named
  // in the sidebar, under the folder it goes in. An app and a folder are each apart from the rest.
  // In a right click's Add new, `short`, they are named by what they are only.
  const folderMenuItems = (path: string, addFolder: () => void, short = false): MenuItem[] => {
    const createHere = (start: ItemKind) => () => {
      setDrawer(false);
      setDialog({ kind: 'new', start, folder: path });
    };
    const label = (here: MessageKey, named: MessageKey) => t(short ? named : here);
    return [
      // A quick note first and apart: it goes to the personal space from any folder, so it is not "here".
      { label: label('quick.new', 'create.quick'), icon: 'quick', run: newQuick },
      { label: label('menu.newNoteHere', 'menu.add.note'), icon: 'note', apart: true, run: createHere('note') },
      { label: label('menu.newListHere', 'menu.add.list'), icon: 'tasks', run: createHere('tasks') },
      { label: label('menu.newBoardHere', 'menu.add.board'), icon: 'board', run: createHere('board') },
      { label: label('menu.newKeysHere', 'menu.add.keys'), icon: 'keys', run: createHere('keys') },
      { label: label('menu.newCollectionHere', 'menu.add.collection'), icon: 'collection', run: createHere('collection') },
      {
        label: label('menu.newAppHere', 'menu.add.app'),
        icon: 'app',
        apart: true,
        run: () => {
          setDrawer(false);
          setDialog({ kind: 'newApp', folder: path });
        },
      },
      { label: label('menu.newFolderHere', 'menu.add.folder'), icon: 'folder', run: addFolder, apart: true },
    ];
  };
  /** A right click on a folder or a space's heading: Add new first, what can be made there as its own menu, then the rest of its menu. */
  const withAddNew = (path: string, addFolder: () => void, items: MenuItem[]): MenuItem[] => [
    { label: t('menu.addNew'), icon: 'plus', run: () => undefined, items: folderMenuItems(path, addFolder, true) },
    ...items.map((item, index) => (index === 0 ? { ...item, apart: true } : item)),
  ];
  const closeMenu = useCallback(() => setMenu(null), []);

  // An image, file or recording in a note has its right-click menu drawn like the others; on a
  // phone, where holding it opens it, it says what it is and how large.
  useEffect(() => {
    const icons = {
      open: 'open',
      reveal: 'folder',
      rename: 'pen',
      small: 'sizeSmall',
      medium: 'sizeMedium',
      full: 'sizeFull',
      delete: 'trash',
      note: 'calloutNote',
      tip: 'calloutTip',
      important: 'calloutImportant',
      warning: 'calloutWarning',
      caution: 'calloutCaution',
      removeCallout: 'callout',
    } as const;
    const calloutKinds: ReadonlySet<string> = new Set(['note', 'tip', 'important', 'warning', 'caution']);
    const kinds = { image: ['image', 'phone.image'], file: ['file', 'phone.file'], audio: ['audio', 'phone.recording'] } as const;
    session.showMenu = (at, actions, about) => {
      // An image's sizes are a group of their own, the one it is drawn at ticked; so is a callout's
      // kind, each in its colour on a phone, and Remove callout under them.
      const items: MenuItem[] = actions.map((action) => ({
        label: action.label,
        run: action.run,
        icon: icons[action.kind],
        danger: action.kind === 'delete',
        apart: action.kind === 'small' || action.kind === 'removeCallout',
        checked: action.on,
        className: calloutKinds.has(action.kind) ? `callout-kind callout-${action.kind}` : undefined,
        mark: calloutKinds.has(action.kind),
      }));
      const head: MenuHead | undefined = about && {
        icon: kinds[about.kind][0],
        title: about.name,
        sub: [t(kinds[about.kind][1]), about.size === undefined ? '' : sizeText(about.size)].filter(Boolean).join(' · '),
      };
      setMenu({ at, items, head });
    };
    // An attached file's Rename, in its bar or its menu in a note.
    session.askFileName = (path, view) => setDialog({ kind: 'renameFile', path, view });
    // A link tapped in a note, on a phone.
    session.linkTap = setLinkTap;
    session.say = (text) => setShown({ text });
    session.ruled = (event) => saveRuled(event);
    // What is made or moved into a folder is shown there: the folder opens in the sidebar.
    session.placed = (folder, item, from) => setRevealFolder({ path: folder, item, ...(from !== undefined && { from }), at: Date.now() });
    // A link inside the space opens what it points at: a folder in the sidebar, a file as Files opens it.
    session.openTarget = (target) => {
      if (target.kind === 'folder') {
        setDrawer(true);
        return setRevealFolder({ path: target.path, at: Date.now() });
      }
      if (target.kind === 'file') return void session.openAttached(target.path);
      void session.open(target.kind === 'collection' ? collectionTab(target.path) : tabOf(target.path));
    };
    return () => {
      session.showMenu = null;
      session.askFileName = null;
      session.linkTap = null;
      session.say = null;
      session.ruled = null;
      session.placed = null;
      session.openTarget = null;
    };
  }, [session]);
  const [linkTap, setLinkTap] = useState<LinkTap | null>(null);
  const closeLinkTap = useCallback(() => setLinkTap(null), []);
  /** A link's address being changed, or a link being made, on a phone. */
  const [linkEdit, setLinkEdit] = useState<{ url: string; linked: boolean } | null>(null);
  /** The note whose history a phone is asked to show. */
  const [phoneHistory, setPhoneHistory] = useState<string | null>(null);

  const onTabDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const boxes = [...tabBar.current!.querySelectorAll('.tab')].map((tab) => tab.getBoundingClientRect());
    const index = boxes.findIndex((box) => event.clientX < box.left + box.width / 2);
    setTabGap(index < 0 ? boxes.length : index);
  };
  const onTabDrop = (event: DragEvent) => {
    const id = event.dataTransfer.getData(TAB_DRAG_TYPE);
    if (!id || tabGap === null) return;
    event.preventDefault();
    session.moveTab(id, tabGap);
    setTabGap(null);
  };
  // No mark where the tab would not move: right before or after itself.
  const draggedFrom = draggedTab ? tabs.indexOf(draggedTab) : -1;
  const shownGap = tabGap !== null && tabGap !== draggedFrom && tabGap !== draggedFrom + 1 ? tabGap : null;
  // Once the pointer rests on a tab, it says its name in full when it is cut short and, with more
  // than one space, the way to what it shows under it: `Acme › Sales`.
  const tabTip = useHoverTip();
  const showTabTip = (event: MouseEvent<HTMLElement>, id: string) => {
    const label = event.currentTarget.querySelector('.tab-title span');
    const where = spaces.length > 0 ? pathTip(id, space.name ?? t('settings.personal')) : null;
    tabTip.show(event.currentTarget, [where || cutShort(label) ? labelOf(id, tabTitles, filters) : null, where], label ?? undefined);
  };
  const hideTabTip = tabTip.hide;
  const tabClass = (id: string, i: number) =>
    [
      'tab',
      id === active && 'on',
      menu?.target === `tab:${id}` && 'marked',
      id === draggedTab && 'dragging',
      shownGap === i && 'gap-before',
      shownGap === tabs.length && i === tabs.length - 1 && 'gap-after',
    ]
      .filter(Boolean)
      .join(' ');

  const today = dayOf(new Date());
  // On a phone a task opens as a sheet; its date and record are picked in sheets; + types a new
  // task above the keyboard.
  const [taskSheet, setTaskSheet] = useState<{ list: string; id: string; subtask: boolean } | null>(null);
  const [taskPicker, setTaskPicker] = useState<{ kind: 'date' | 'record' | 'assignee' | 'labels'; list: string; id: string } | null>(null);
  // On a phone, what a list or a board is filtered by, in a sheet: from the bar's button, or a chip's step.
  const [filterSheet, setFilterSheet] = useState<{ tab: string; step: FilterStep | null } | null>(null);
  // A filter being made, until it is saved; a saved filter changed on its page, until it is saved or put back.
  const [newFilter, setNewFilter] = useState<FilterChoices>(EVERYTHING);
  const [filterDrafts, setFilterDrafts] = useState<Record<string, FilterChoices>>({});
  const [quickAdd, setQuickAdd] = useState<{ list: string; section: string | null; due: string | null } | null>(null);
  // On a phone, how Upcoming shows, and the day chosen in its month, which + adds to there; tomorrow until one is chosen.
  const [upcomingView, setUpcomingView] = useState(loadUpcomingView);
  // A phone shows a day or the month; a week chosen on a computer is a day there.
  const [calendarRange, setCalendarRange] = useState(loadCalendarRange);
  const phoneUpcoming = upcomingView === 'list' ? 'list' : calendarRange === 'month' ? 'month' : 'day';
  const [upcomingDay, setUpcomingDay] = useState<string | null>(null);
  const upDay = upcomingDay ?? today;
  // On a phone a day for some tasks at once is chosen in a sheet: what is overdue, rescheduled.
  const [dayPicker, setDayPicker] = useState<{ title: string; onPick: (due: string | null) => void } | null>(null);
  // On a phone a section is named in a sheet: a new one from the list's menu, or one renamed.
  const [sectionSheet, setSectionSheet] = useState<{ list: string; section: Section | null } | null>(null);

  // Export (PLAN 4.7): how many files the note links to, for the window's Markdown, once read.
  const [exportFiles, setExportFiles] = useState<number | null>(null);
  const exportPath = dialog?.kind === 'export' ? dialog.path : null;
  useEffect(() => {
    setExportFiles(null);
    if (!exportPath) return;
    let live = true;
    void session.noteFileCount(exportPath).then((count) => live && setExportFiles(count));
    return () => {
      live = false;
    };
  }, [exportPath]);
  /** Makes the file and hands it over: on the desktop app to where it is saved, in a browser to the downloads, on a phone to its share sheet. */
  const runExport = async (path: string, format: ExportFormat) => {
    const name = tabTitles[path] ?? basename(path).replace(/\.md$/, '');
    setDialog(null);
    setNotice(t('export.making', { name }));
    try {
      const { exportNote } = await import('./exporting');
      const out = await exportNote(await session.exportSource(path), name, format);
      if (phone) return await shareExported(out);
      if (await saveFile(out.name, out.blob, out.extension)) setNotice(t('import.exported', { name: out.name }));
      else setNotice(null);
    } catch {
      setNotice(t('export.failed', { name }));
    }
  };
  const shareExported = async (out: Exported) => {
    const file = new File([out.blob], out.name, { type: out.blob.type });
    if (!navigator.canShare?.({ files: [file] })) {
      downloadBlob(out.name, out.blob);
      return setNotice(t('import.exported', { name: out.name }));
    }
    setNotice(null);
    const share = () => void navigator.share({ files: [file] }).catch(() => undefined);
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      // A phone opens its share sheet only right after a tap: a file that took a while to make is offered with Share.
      if (error instanceof DOMException && error.name === 'NotAllowedError') setShown({ text: t('export.ready', { name: out.name }), action: { label: t('export.share'), run: share } });
    }
  };

  // Searching everywhere (PLAN 4.2): the window on a computer, the Search tab on a phone. The
  // notes' texts and the attached files are read each time it opens; the rest is what the app has.
  const [searching, setSearching] = useState(false);
  const [searchRead, setSearchRead] = useState<{ texts: Map<string, string>; files: FileRow[] } | null>(null);
  const [searchShown, setSearchShown] = useState(false);
  // The search picking a note, a task or a card of a server's spaces, to go in a message there as a chip.
  const [chipPick, setChipPick] = useState<{ url: string; done: (chip: string | null) => void } | null>(null);
  const searchOn = phone ? searchShown : searching || chipPick !== null;
  useEffect(() => {
    if (!searchOn || !ready) return;
    let current = true;
    void Promise.all([session.noteTexts(), session.files()]).then(([texts, files]) => current && setSearchRead({ texts, files }));
    return () => {
      current = false;
    };
    // Opened while the app still reads, it reads again once all of it is read.
  }, [searchOn, ready, reading.size === 0]);
  const searchThings = useMemo<Thing[] | null>(
    () => (searchRead ? thingsOf({ tree, quick, spaces, titles: tabTitles, tasks, sections, boards, collections, filters, texts: searchRead.texts, files: searchRead.files, today }) : null),
    [searchRead, tree, quick, spaces, tabTitles, tasks, sections, boards, collections, filters, today],
  );
  // What the search offers at its foot: making something, the views, the settings, sync.
  const searchActions: SearchAction[] = [
    { id: 'quick', label: t('quick.new'), icon: 'quick', run: () => newQuick() },
    { id: 'note', label: t('create.newNote'), icon: 'note', first: true, run: () => setDialog({ kind: 'new', start: 'note' }) },
    { id: 'create', label: t('search.create'), icon: 'plus', first: true, run: () => setDialog({ kind: 'new' }) },
    { id: 'tasks', label: t('create.newList'), icon: 'tasks', run: () => setDialog({ kind: 'new', start: 'tasks' }) },
    { id: 'board', label: t('create.newBoard'), icon: 'board', run: () => setDialog({ kind: 'new', start: 'board' }) },
    { id: 'collection', label: t('create.newCollection'), icon: 'collection', run: () => setDialog({ kind: 'new', start: 'collection' }) },
    { id: 'today', label: t('side.today'), icon: 'calendar', run: () => void session.open(TODAY) },
    { id: 'upcoming', label: t('side.upcoming'), icon: 'calendar', run: () => void session.open(UPCOMING) },
    { id: 'files', label: t('side.files'), icon: 'clip', run: () => void session.open(FILES) },
    { id: 'trash', label: t('side.trash'), icon: 'trash', run: () => void session.open(TRASH) },
    { id: 'settings', label: t('side.settings'), icon: 'settings', run: () => setDialog({ kind: 'settings' }) },
    { id: 'sync', label: t('sync.syncNow'), icon: 'cloud', run: () => void syncService.syncNow() },
    // The onboarding note, once closed, is found again here.
    { id: 'welcome', label: t('welcome.title'), icon: 'note', run: () => void session.openWelcome() },
  ];
  // A task, a folder or a space found: brought into sight where it is, and marked. A folder
  // something was made or moved into opens to it.
  const [revealTask, setRevealTask] = useState<{ list: string; id: string; at: number } | null>(null);
  const [revealFolder, setRevealFolder] = useState<{ path: string; item?: string; from?: string; at: number } | null>(null);
  /** Opens what was found: a note at the words found in it, a task in its list, a card, a record, a file, a folder in the sidebar. */
  /** A message found in the search window: Chat opens at it; one in a conversation not on the list, archived or hidden, is read. */
  const openHit = (hit: Hit) => {
    setSearching(false);
    if (!chatStore.read().servers.find((each) => each.url === hit.url)?.chats.some((each) => each.id === hit.chat.id && !each.hidden)) chatStore.server(hit.url)?.visit(hit.chat);
    openScrawl.current(hit.href);
  };
  const openFound = (found: Found<Thing>) => {
    const target = found.item.target;
    setSearching(false);
    switch (target.kind) {
      case 'note':
        void (found.line ? session.openAt(target.path, found.line.spans) : session.open(target.path));
        return;
      case 'task':
        if (phone) return setTaskSheet({ list: target.list, id: target.id, subtask: target.subtask });
        void session.open(tasksOf(target.list));
        return setRevealTask({ list: target.list, id: target.id, at: Date.now() });
      case 'card':
        return showCard(target.board, target.id);
      case 'record':
        return phone ? setRecordAsked({ dir: target.dir, id: target.id }) : setRecordOver({ dir: target.dir, id: target.id });
      case 'file':
        return void session.openAttached(target.file.path);
      case 'tab':
        return void session.open(target.id);
      case 'folder':
        setDrawer(true);
        return setRevealFolder({ path: target.path, at: Date.now() });
      case 'space':
        setDrawer(true);
        return setRevealFolder({ path: inSpace(target.id, ''), at: Date.now() });
    }
  };
  // Chat's links (design/chat.md, 3.7): a chip opens what it points at in a space here, by its id
  // wherever a task, a card or a record went; a message's link opens Chat at it.
  const [chatGoTo, setChatGoTo] = useState<{ href: string; at: number } | null>(null);
  /** The spaces here that are on a server, which the chips of its messages can point into. */
  const spacesOn = (url: string) => spaces.filter((each) => each.source?.provider === 'server' && each.source.place.url === url).map((each) => each.id);
  /** How what a chip points at opens; or why it cannot. */
  const chipTarget = (href: string): Exclude<ChipState, 'here'> | (() => void) => {
    const item = parseItemLink(href);
    if (!item) return 'gone';
    // A space of a server one is in has its rooms in Chat, though it is not on this device.
    if (!spaces.some((each) => each.id === item.space)) return chat.servers.some((server) => server.chats.some((each) => each.space === item.space)) ? 'notHere' : 'noAccess';
    const path = inSpace(item.space, item.path);
    const holding = <T,>(all: Record<string, T>, has: (value: T) => boolean) =>
      all[path] !== undefined && has(all[path]) ? path : Object.keys(all).find((each) => spaceOf(each) === item.space && has(all[each]!));
    const id = item.id ?? '';
    switch (item.kind) {
      case 'note':
        return titles[path] !== undefined ? () => void session.open(path) : 'gone';
      case 'tasks':
        return tasks[path] ? () => void session.open(tasksOf(path)) : 'gone';
      case 'board':
        return boards[path] ? () => void session.open(boardOf(path)) : 'gone';
      case 'collection':
        return collections[path] ? () => void session.open(collectionTab(path)) : 'gone';
      case 'task': {
        const list = holding(tasks, (all) => all.some((task) => task.id === id));
        if (!list) return 'gone';
        return () => {
          if (phone) return setTaskSheet({ list, id, subtask: !!tasks[list]!.find((task) => task.id === id)!.parent });
          void session.open(tasksOf(list));
          setRevealTask({ list, id, at: Date.now() });
        };
      }
      case 'card': {
        const board = holding(boards, (one) => one.cards.some((card) => card.id === id));
        return board ? () => showCard(board, id) : 'gone';
      }
      case 'record': {
        const dir = holding(collections, (one) => one.records.some((record) => record.id === id));
        return dir ? () => (phone ? setRecordAsked({ dir, id }) : setRecordOver({ dir, id })) : 'gone';
      }
    }
  };
  /** A note, a list, a board or a collection of a server's space, dragged from the sidebar into a message there. */
  const chipOfPath = (url: string, path: string): string | null => {
    const space = spaceOf(path);
    if (!space || !spacesOn(url).includes(space)) return null;
    const kind: ChipKind | null = collections[path] ? 'collection' : isTaskListPath(path) ? 'tasks' : isBoardPath(path) ? 'board' : titles[path] !== undefined ? 'note' : null;
    if (!kind) return null;
    const name = kind === 'collection' ? collectionName(path) : kind === 'tasks' ? listName(path) : kind === 'board' ? boardName(path) : titles[path] || basename(path);
    const where = [spaces.find((each) => each.id === space)?.name, basename(localPath(dirname(path)))].filter(Boolean).join(' · ');
    return itemChip({ kind, space, path: localPath(path) }, name, where);
  };
  const chatLinks = useMemo<ChatLinks>(
    () => ({
      open: (href) => {
        const target = chipTarget(href);
        if (typeof target === 'function') return target();
        const space = chat.servers.flatMap((server) => server.chats).find((each) => each.space === parseItemLink(href)?.space)?.spaceName ?? '';
        setShown({ text: target === 'notHere' ? t('chat.notHereText', { space }) : target === 'noAccess' ? t('chat.noAccessText') : t('chat.goneText') });
      },
      stateOf: (href) => {
        const target = chipTarget(href);
        return typeof target === 'function' ? 'here' : target;
      },
      pick: (url) => new Promise((done) => setChipPick({ url, done })),
      chipOf: chipOfPath,
      toTask: (title, description, from) => setDialog({ kind: 'chatTask', title, description, from }),
      toCard: (title, description, from) => setDialog({ kind: 'chatCard', title, description, from }),
      say: (text) => setShown({ text }),
      // Invite people: a space's settings, where its invite link is; on a phone Settings › Spaces.
      invite: (space) => setDialog({ kind: 'settings', section: 'spaces', ...(space && spaces.some((each) => each.id === space) && { space }) }),
    }),
    [spaces, titles, tasks, boards, collections, phone, chat.servers],
  );
  /** What the search offers to pick from for a chip: what is in the spaces of the conversation's server. */
  const pickThings = useMemo(() => {
    if (!chipPick || !searchThings) return null;
    const allowed = new Set(spacesOn(chipPick.url));
    return searchThings.filter((thing) => {
      const item = itemOfTarget(thing.target);
      return item !== null && allowed.has(item.space);
    });
  }, [chipPick, searchThings]);
  const pickChip = (found: Found<Thing>) => {
    const item = itemOfTarget(found.item.target);
    const where = [...found.item.trail.slice(-2), found.item.aside].filter(Boolean).join(' · ');
    chipPick?.done(item ? itemChip(item, [found.item.key, found.item.name].filter(Boolean).join(' '), where) : null);
    setChipPick(null);
  };
  // A link to a message or a chip, in a note or a task's description, opens as it does in Chat.
  const openScrawl = useRef<(href: string) => void>(() => undefined);
  openScrawl.current = (href) => {
    if (!href.startsWith('scrawl:chat/')) return chatLinks.open(href);
    setChatGoTo({ href, at: Date.now() });
    // On a phone Chat is a tab of its own, which opens at the message.
    if (!phone) void session.open(CHAT);
  };
  useEffect(() => {
    session.openScrawl = (href) => openScrawl.current(href);
    // A notification clicked opens Chat at its message.
    const stop = onNotificationClick((href) => openScrawl.current(href));
    return () => {
      session.openScrawl = null;
      stop();
    };
  }, []);

  // On a phone + on a board types a card for the column on screen; the page's menu opens its Fields.
  const [boardAdding, setBoardAdding] = useState(0);
  const [boardFields, setBoardFields] = useState(0);
  // On a phone + in a keys file opens a new key's sheet.
  const [keysAdding, setKeysAdding] = useState(0);
  const phoneAdd = (id: string) => {
    if (boardPathOf(id) !== null) return setBoardAdding((n) => n + 1);
    if (keysPathOf(id) !== null) return setKeysAdding((n) => n + 1);
    const collectionDir = collectionPathOf(id);
    if (collectionDir !== null) return setNewRecord({ dir: collectionDir });
    if (id === TODAY) return setQuickAdd({ list: INBOX_TASKS, section: null, due: today });
    if (id === UPCOMING) return setQuickAdd({ list: INBOX_TASKS, section: null, due: upcomingView === 'calendar' ? upDay : addDays(today, 1) });
    const list = listOf(id);
    if (list !== null) setQuickAdd({ list, section: null, due: null });
  };
  /** The people of the space a path is in, to give a task or a card to; none in the personal space, which is only you. */
  const peopleOf = (path: string): SpacePeople | null => {
    const space = spaces.find((each) => each.id === spaceOf(path));
    return space ? { name: space.name, people: space.people, ...(me && { me: me.id }) } : null;
  };
  // The open subtasks with a day of every card and record, by day then priority, for Today and Upcoming.
  const dueSubtasksNow: DueSubtask[] = [...dueCardSubtasks(boards), ...dueRecordSubtasks(collections)].sort(
    (a, b) => a.subtask.due!.localeCompare(b.subtask.due!) || a.subtask.priority - b.subtask.priority,
  );
  // The records the calendars that show in Today and Upcoming bring there; only their collections are worked out.
  const dueRecordsNow = useMemo(() => {
    const all = Object.values(collections);
    const shown = all.filter((c) => c.schema.views?.some((v) => v.kind === 'calendar' && v.calendar?.upcoming));
    // A program's days two weeks on; what closes one is looked for among every collection.
    return dueRecords(
      shown.map((c) => withComputed(c, all, boards, today)),
      today,
      { all, until: addDays(today, 13) },
    );
  }, [collections, boards, today]);
  // An app's tab (design/app-home.md 5): its folder is read first.
  const appPath = active ? appPathOf(active) : null;
  const nodeOf = (path: string) => [tree, ...spaces.map((each) => each.tree)].map((nodes) => findNode(nodes, path)).find((node) => node !== undefined);
  useEffect(() => {
    if (appPath !== null) session.want([appPath]);
  }, [session, appPath]);
  // Every app's `_app.json` is read as the tree is, again after Add to app or Edit app: one of a
  // template has its template's icon in the sidebar and on its tab (design/app-home.md 3).
  const appFolders = useMemo(() => {
    const found: string[] = [];
    const walk = (nodes: TreeNode[]) => nodes.forEach((node) => (node.app ? found.push(node.path) : node.kind === 'folder' && walk(node.children ?? [])));
    [tree, ...spaces.map((each) => each.tree)].forEach(walk);
    return found;
  }, [tree, spaces]);
  useEffect(() => {
    for (const path of appFolders) void session.appAt(path).then((file) => setAppFiles((was) => ({ ...was, [path]: file })));
  }, [session, appFolders]);
  const appIcons = Object.fromEntries(
    appFolders.flatMap((path) => {
      const file = appFiles[path];
      const icon = file ? appIcon(file) : 'app';
      return [[path, isIconName(icon) ? icon : 'app']];
    }),
  ) as Record<string, IconName>;
  const tabIcon = (id: string) => appIcons[appPathOf(id) ?? ''] ?? iconOf(id);
  /** Changes the subtasks of a card or a record, from the list as it is now. */
  const changeSubtasksOf = (ref: SubtaskRef, change: (list: Subtask[]) => Subtask[]) =>
    'board' in ref ? session.changeCardSubtasks(ref.board, ref.id, change) : void session.changeRecordSubtasks(ref.collection, ref.id, change);
  // A task's description, a card's or a record's notes: the editor notes have, and Attach.
  const descriptionHost: DescriptionHost = {
    editor: (home, parent, doc, onChange, hint) => session.openEditor(home, parent, doc, onChange, hint),
    attach: (editor, home, files) => session.attachTo(editor, home, files),
  };
  // A record a calendar moved or stretched: its values written, said with Undo, which writes back what they were.
  const moveRecord = (dir: string, id: string, values: CollectionRecord['values'], text: string) => {
    const record = collections[dir]?.records.find((r) => r.id === id);
    if (!record) return;
    const before = Object.fromEntries(Object.keys(values).map((key) => [key, record.values[key] ?? null]));
    void session.updateRecord(dir, id, { values }).then((failed) => {
      if (failed) return setNotice(failed);
      undoable(text, () => void session.updateRecord(dir, id, { values: before }));
    });
  };
  /** A program day's record to close it with: of the collection that closes it, for its day, linked to the program; null when that collection is not there. */
  const closingOf = (due: DueRecord) => {
    const repeat = due.view.calendar?.repeat;
    const space = spaceOf(due.collection);
    const target = repeat && Object.values(collections).find((c) => spaceOf(c.dir) === space && localPath(c.dir) === localPath(repeat.closedBy.collection));
    if (!repeat || !target) return null;
    return { repeat, target, values: { [repeat.closedBy.day]: due.day!, [repeat.closedBy.link]: { id: due.record.id, name: recordTitle(due.record) } } };
  };
  const taskActions: TaskActions = {
    dueRecords: () => dueRecordsNow,
    moveRecord,
    // Start opens the new record of the day, its link set, so that what its rules fill comes with it.
    startDay: (due) => {
      const closing = closingOf(due);
      if (!closing) return setNotice(t('repeat.noCloser', { collection: due.view.calendar?.repeat?.closedBy.collection ?? '' }));
      if (phone) collectionActions.create?.(closing.target.dir, closing.values);
      else setRecordNew({ dir: closing.target.dir, values: closing.values });
    },
    // The other button writes the day closed at once, its rules' rows left out, with Undo.
    skipDay: (due) => {
      const closing = closingOf(due);
      if (!closing?.repeat.skip) return setNotice(t('repeat.noCloser', { collection: due.view.calendar?.repeat?.closedBy.collection ?? '' }));
      const { repeat, target, values } = closing;
      const id = newRecordId();
      const made = { ...values, ...repeat.skip!.set };
      void session.addRecord(target.dir, { values: made }, { id, drafted: [] }).then((failed) => {
        if (failed) return setNotice(failed);
        const day = new Date(`${due.day}T00:00`).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
        setShown({ text: t('repeat.skipped', { day, what: repeat.skip!.label }), undo: () => void session.trashRecord(target.dir, recordWith(target, id, made)), toast: true });
      });
    },
    description: descriptionHost,
    add: (target, input) => session.addTask(target, input),
    // A button in a notice does its work and the notice goes.
    notify: (text, action) => setShown({ text, ...(action && { action: { label: action.label, run: () => (action.run(), setShown(null)) } }) }),
    update: (target, id, change) => session.updateTask(target, id, change),
    setDone: (target, id, done, quiet) => {
      if (!done || quiet) return session.setTaskDone(target, id, done);
      undoable(t('tasks.completedNotice'), session.completeTask(target, id));
    },
    remove: deleteTask,
    menu: (event, items, head) => (phone ? showSheet(items, head) : openMenu(event, items)),
    ...(phone && {
      open: (list: string, id: string, subtask = false) => setTaskSheet({ list, id, subtask }),
      pickDate: (list: string, id: string) => setTaskPicker({ kind: 'date', list, id }),
      pickRecord: (list: string, id: string) => setTaskPicker({ kind: 'record', list, id }),
      pickAssignee: (list: string, id: string) => setTaskPicker({ kind: 'assignee', list, id }),
      pickLabels: (list: string, id: string) => setTaskPicker({ kind: 'labels', list, id }),
      pickFilter: (list: string, step: FilterStep | null = null) => setFilterSheet({ tab: tasksOf(list), step }),
      quickAdd: (list: string, section: string | null, due?: string) => setQuickAdd({ list, section, due: due ?? null }),
      nameSection: (list: string, section: Section | null) => setSectionSheet({ list, section }),
      pickDay: (title: string, onPick: (due: string | null) => void) => setDayPicker({ title, onPick }),
    }),
    reschedule: (items, due) => {
      const subtaskOf = (item: SubtaskRef) =>
        ('board' in item ? boards[item.board]?.cards.find((card) => card.id === item.id)?.subtasks : collections[item.collection]?.records.find((r) => r.id === item.id)?.subtasks)?.find(
          (s) => s.id === item.subtask,
        );
      // A record a calendar brings goes to the day, at the time it had.
      const recordOf = (item: { calendar: string; id: string }) => dueRecordsNow.find((due) => due.collection === item.calendar && due.record.id === item.id);
      const dueOf = (item: Dated) =>
        ('calendar' in item
          ? (recordOf(item)?.start.slice(0, 10) ?? null)
          : isSubtaskRef(item)
          ? subtaskOf(item)?.due
          : 'list' in item
            ? tasks[item.list]?.find((task) => task.id === item.id)?.due
            : boards[item.board]?.cards.find((card) => card.id === item.id)?.due) ?? null;
      const give = (item: Dated, day: string | null) => {
        if ('calendar' in item) {
          const due = recordOf(item);
          const values = due && day && movedValues(due.schema, due.view.calendar!, due, day + due.start.slice(10));
          if (values) void session.updateRecord(item.calendar, item.id, { values });
          return;
        }
        if (isSubtaskRef(item)) return changeSubtasksOf(item, (list) => updateSubtask(list, item.subtask, { due: day }));
        if ('list' in item) return session.updateTask(item.list, item.id, { due: day });
        session.updateCard(item.board, item.id, { due: day });
      };
      const before = items.map((item) => ({ item, due: dueOf(item) }));
      for (const item of items) give(item, due);
      undoable(t('tasks.rescheduledNotice', { count: items.length, day: due ? dueLabel(due, today) : t('tasks.noDate') }), () => {
        for (const was of before) give(was.item, was.due);
      });
    },
    addSection: (list, name, after) => session.addSection(list, name, after),
    renameSection: (list, id, name) => session.renameSection(list, id, name),
    foldSection: (list, id, collapsed) => session.foldSection(list, id, collapsed),
    removeSection: deleteSection,
    moveTask: (list, id, place) => session.moveTask(list, id, place),
    moveSection: (list, id, after) => session.moveSection(list, id, after),
    moveTo: (list, id) => setDialog({ kind: 'moveTask', list, id }),
    noteTitle: (path) => titles[path] ?? null,
    openNote: (path) => void session.open(path),
    cardLabel: (ref) => {
      const at = parseCardRef(ref);
      const whole = at && boards[at.board];
      const card = whole?.cards.find((candidate) => candidate.id === at?.id);
      return whole && card ? keyOf(whole, card) : null;
    },
    openCard: showCard,
    finishCard: (board, id, column) => {
      const whole = boards[board];
      const to = column ?? whole?.columns.find((c) => c.kind === 'done')?.id;
      undoable(t('board.finishedNotice', { column: whole?.columns.find((c) => c.id === to)?.name ?? '' }), session.finishCard(board, id, column));
    },
    recordChoices: () =>
      Object.values(collections)
        .filter((c) => isLinkable(c.schema))
        .map((c) => ({ dir: c.dir, records: c.records }))
        .sort((a, b) => a.dir.localeCompare(b.dir)),
    recordTitle: (record) => {
      const found = collections[record.collection]?.records.find((r) => r.id === record.id);
      return found ? recordTitle(found) : record.name || record.code || t('collection.untitled');
    },
    openRecord: (collection, id) => (phone ? setRecordAsked({ dir: collection, id }) : setRecordOver({ dir: collection, id })),
    people: peopleOf,
    dueSubtasks: () => dueSubtasksNow,
    completeSubtask: (ref) =>
      undoable(
        t('tasks.completedNotice'),
        'board' in ref ? session.completeCardSubtask(ref.board, ref.id, ref.subtask) : session.completeRecordSubtask(ref.collection, ref.id, ref.subtask),
      ),
  };
  // A card's brief: the card as Markdown, with the note it came from.
  const copyBrief = async (board: string, id: string) => {
    const whole = boards[board];
    const card = whole?.cards.find((candidate) => candidate.id === id);
    if (!whole || !card) return;
    const notes = card.note ? { [card.note]: await session.readNote(card.note) } : {};
    try {
      await navigator.clipboard.writeText(cardBrief(whole, card, notes));
      setNotice(t('card.briefCopied'));
    } catch {
      setNotice(t('error.clipboard'));
    }
  };
  const collectionActions: CollectionActions = {
    addRecord: (dir, input, form) => session.addRecord(dir, input, form),
    updateRecord: (dir, id, patch, form) => session.updateRecord(dir, id, patch, form),
    planChange: (dir, id, values, old, field) => session.planChange(dir, id, values, old, field),
    planSaved: (dir, id, values, old) => session.planSaved(dir, id, values, old),
    moveRecord,
    removeRecord: (dir, record) => {
      const own = collections[dir];
      const lines = own ? linesBlocks(own.schema, (path) => collections[path]).reduce((n, { source }) => n + linkedRecords(source, dir, record).length, 0) : 0;
      ask(t('delete.record'), recordDeleteText(record, lines), () => void session.trashRecord(dir, record));
    },
    pressButton,
    // A program's day on its calendar, as in Today: Start, Didn't go, and the workout that closed it.
    startDay: (due) => taskActions.startDay?.(due),
    skipDay: (due) => taskActions.skipDay?.(due),
    openRecord: (dir, id) => taskActions.openRecord(dir, id),
    openNote: (path) => void session.open(path),
    // The desktop app hands an address to the system; in a browser it opens beside the app.
    openLink: (href) => (isDesktop ? void openUrlOnDesktop(href).catch(() => undefined) : void window.open(href, '_blank', 'noopener')),
    menu: (event, items, head) => (phone ? showSheet(items, head) : openMenu(event, items)),
    ...(phone && {
      show: (dir: string, id: string) => setRecordAsked({ dir, id }),
      create: (dir: string, values?: Parameters<NonNullable<CollectionActions['create']>>[1]) => setNewRecord({ dir, values }),
    }),
    ask: (title, message, run, action) => ask(title, message, run, action),
    say: (text) => setNotice(text),
    records: (dir) => collections[dir]?.records ?? null,
    collection: (dir) => collections[dir] ?? null,
    collections: () => Object.values(collections),
    changeSchema: (dir, change) => session.changeSchema(dir, change),
    saveFields: (dir, schema, renames, rules) => session.saveFields(dir, schema, renames, rules),
    me: () => me?.name || undefined,
    lastStop: (dir) => session.lastStop(dir),
    clearStop: (dir) => session.clearStop(dir),
    createLinked: (dir, target) => session.createLinked(dir, target),
    boards: () => boards,
    tasks: () => tasks,
    addTask: (list, input) => session.addTask(list, input),
    setTaskDone: (list, id, done) => taskActions.setDone(list, id, done),
    // Made below, with the board's actions, which open records through these.
    get cardActions() {
      return boardActions;
    },
    editor: (home, parent, doc, onChange) => session.openEditor(home, parent, doc, onChange),
    attach: descriptionHost.attach,
  };
  const boardActions: BoardActions = {
    addCard: (board, input) => session.addCard(board, input),
    pickFilter: (board, step = null) => setFilterSheet({ tab: boardOf(board), step }),
    moveDue: (board, id, due) => taskActions.reschedule([{ board, id }], due),
    moveCard: (board, id, place) => session.moveCard(board, id, place),
    moveToColumn: (board, id, column) => {
      const whole = boards[board];
      if (whole) session.moveCard(board, id, { column, after: columnCards(whole, column).filter((c) => c.id !== id).pop()?.id ?? null });
    },
    removeCard: (board, card) => {
      if (openCard?.id === card.id) setOpenCard(null);
      deleteCard(board, card);
    },
    updateCard: (board, id, patch) => session.updateCard(board, id, patch),
    changeSubtasks: (board, id, change) => session.changeCardSubtasks(board, id, change),
    completeSubtask: (board, id, subtask) => undoable(t('tasks.completedNotice'), session.completeCardSubtask(board, id, subtask)),
    removedSubtask: (undo) => undoable(t('subtasks.deletedNotice'), undo),
    addComment: (board, id, text) => session.addComment(board, id, text),
    editComment: (board, id, comment, text) => session.editComment(board, id, comment, text),
    removeComment: (board, id, comment) => undoable(t('board.commentDeletedNotice'), session.removeComment(board, id, comment)),
    copyBrief: (board, id) => void copyBrief(board, id),
    openCard: (board, id) => setOpenCard({ board, id }),
    editor: (home, parent, doc, onChange, hint) => session.openEditor(home, parent, doc, onChange, hint),
    attach: descriptionHost.attach,
    viewer: (home, parent, doc) => session.openViewer(home, parent, doc),
    menu: (event, items, head) => (phone ? showSheet(items, head) : openMenu(event, items)),
    addColumn: (board, name, kind, after) => session.addColumn(board, name, kind, after),
    renameColumn: (board, id, name) => session.renameColumn(board, id, name),
    setColumnKind: (board, id, kind) => session.setColumnKind(board, id, kind),
    moveColumn: (board, id, after) => session.moveColumn(board, id, after),
    removeColumn: deleteColumn,
    addPhase: (board, name) => session.addPhase(board, name),
    renamePhase: (board, id, name) => session.renamePhase(board, id, name),
    editPhase: (board, phase) => setDialog({ kind: 'phase', board, phase }),
    movePhase: (board, id, after) => session.movePhase(board, id, after),
    closePhase,
    reopenPhase: (board, id) => session.reopenPhase(board, id),
    removePhase: deletePhase,
    setPhasesOn: (board, on) => session.setPhasesOn(board, on),
    noteTitle: (path) => titles[path] ?? null,
    openNote: (path) => void session.open(path),
    recordActions: collectionActions,
    people: peopleOf,
    ask: (title, message, run, action) => ask(title, message, run, action),
    saveBoardFields: (board, fields, renames) => session.setBoardFields(board, fields, renames),
  };
  const keysActions: KeysActions = {
    change: (path, text) => session.changeKeys(path, text),
    menu: (event, items, head) => (phone ? showSheet(items, head) : openMenu(event, items)),
    notice: setNotice,
    ask: (title, message, run) => ask(title, message, run),
  };
  // The trash goes by space when there is more than one, the personal space first.
  const trashSpaces: TrashSpace[] = [{ id: null, name: space.name ?? t('settings.personal') }, ...spaces.map((each) => ({ id: each.id, name: each.name }))];
  const allFiles = files ?? [];
  const chosenFiles = allFiles.filter((file) => filesChosen.has(file.path));
  const filesView = (
    <FilesView
      files={files}
      onScreen={filesOnScreen}
      today={today}
      spaces={trashSpaces}
      choice={{
        chosen: filesChosen,
        choosing: filesChoosing,
        onChoose: (paths, on) =>
          setFilesChosen((was) => {
            const next = new Set(was);
            for (const path of paths) {
              if (on) next.add(path);
              else next.delete(path);
            }
            return next;
          }),
        onDelete: () => askDeleteFiles(chosenFiles),
      }}
      actions={fileActions}
      downloads={downloads}
    />
  );
  const dueNow = dueToday(tasks, today);
  // Today counts what is late and due today, Upcoming what is due after it: neither counts what the other does.
  const cardDays = [...dueCards(boards).map((d) => d.card.due!), ...dueSubtasksNow.map((d) => d.subtask.due!)];
  const dueCardsNow = cardDays.filter((day) => day <= today).length;
  const dueLater = dueUpcoming(tasks, today).reduce((sum, d) => sum + d.tasks.length, 0) + cardDays.length - dueCardsNow;
  // A program's days count: today's and those gone by in Today, those to come in Upcoming (design/gym.md 4.3).
  const programDays = dueRecordsNow.filter((d) => d.day);
  const daysNow = programDays.filter((d) => d.day! <= today).length;
  const counts: Record<string, number> = { [TODAY]: dueNow.overdue.length + dueNow.today.length + dueCardsNow + daysNow, [UPCOMING]: dueLater + programDays.length - daysNow, [TRASH]: trash.length, [FILES]: fileCount, [CHAT]: chat.alerts, [QUICK]: quick.length };
  for (const [list, listTasks] of Object.entries(tasks)) counts[tasksOf(list)] = openCount(listTasks);
  for (const [path, board] of Object.entries(boards)) counts[boardOf(path)] = openCardCount(board);
  for (const [dir, collection] of Object.entries(collections)) counts[collectionTab(dir)] = collection.records.length;
  /** How many open tasks and unfinished cards a filter page shows. */
  const shownBy = (asked: FilterChoices) =>
    filterTasks(asked, tasks, today, me?.id).reduce((sum, group) => sum + group.tasks.length, 0) +
    filterCards(asked, boards, today, me?.id).reduce((sum, group) => sum + group.cards.length, 0);
  for (const filter of filters) counts[filterTab(filter.id)] = shownBy(filter);
  const list = active ? listOf(active) : null;
  const boardPath = active ? boardPathOf(active) : null;
  const board = boardPath !== null ? boards[boardPath] : undefined;
  const keysPath = active ? keysPathOf(active) : null;
  const keysText = keysPath !== null ? keyFiles[keysPath] : undefined;
  const collectionPath = active ? collectionPathOf(active) : null;
  const collection = collectionPath !== null ? collections[collectionPath] : undefined;
  // What is in the app's folder, found by the role each carries wherever it is: its collections, its
  // boards and its folders of notes; and its menu, worked out from them and its templates.
  const appFile = appPath !== null ? (appFiles[appPath] ?? null) : null;
  const piecesIn = (folder: string): AppPiece[] => [
    ...Object.values(collections).flatMap((c) => (c.dir !== folder && isUnder(c.dir, folder) ? [{ kind: 'collection' as const, path: c.dir, ...(c.schema.role && { role: c.schema.role }) }] : [])),
    ...Object.entries(boards).flatMap(([path, each]) => (isUnder(path, folder) ? [{ kind: 'board' as const, path, ...(each.role && { role: each.role }) }] : [])),
    ...(nodeOf(folder)?.children ?? []).flatMap((node): AppPiece[] => {
      if (node.kind === 'note') return [{ kind: 'note', path: node.path }];
      const role = node.kind === 'folder' ? Object.keys(PIECES).find((r) => PIECES[r]!.kind === 'folder' && PIECES[r]!.name.toLowerCase() === node.name.toLowerCase()) : undefined;
      return role ? [{ kind: 'folder' as const, path: node.path, role }] : [];
    }),
  ];
  // The collections that are another's lines, in no menu.
  const appLines = useMemo(() => linesIn(Object.values(collections)), [collections]);
  const modulesOf = (folder: string) => (appFiles[folder] ? menuOf(appFiles[folder]!, folder, piecesIn(folder), appLines) : []);
  const menuEditFor = (folder: string): MenuEdit | null => (appFiles[folder] ? menuEditOf(appFiles[folder]!, folder, piecesIn(folder), appLines) : null);
  // Made from an app: the modules of its menu to put it in.
  const newModules = dialog?.kind === 'new' && dialog.app ? menuEditFor(dialog.app)?.modules.map((m) => ({ key: m.key, name: m.name })) : undefined;
  // Worked out once, as Edit menu opens: what it starts from.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editMenu = useMemo(() => (dialog?.kind === 'editMenu' ? menuEditFor(dialog.folder) : null), [dialog]);
  // A screen opening on a view of its collection: the collection is looked at on that view.
  const lookAtScreen = (screen: AppScreen | undefined) => {
    if (screen?.kind === 'collection' && screen.view) session.lookAtCollection(screen.path, { ...collectionLooks[screen.path], view: screen.view });
  };
  const openScreen = (screen: AppScreen) => {
    lookAtScreen(screen);
    if (screen.kind === 'note') void session.open(screen.path);
    else if (screen.kind !== 'folder') void session.open(screen.kind === 'collection' ? collectionTab(screen.path) : boardOf(screen.path));
  };
  const appModules = appPath !== null ? modulesOf(appPath) : [];
  const notesIn = (folder: string) => (nodeOf(folder)?.children ?? []).filter((node) => node.kind === 'note');
  const notesOf = (folder: string) =>
    Object.fromEntries(piecesIn(folder).flatMap((p) => (p.kind === 'folder' ? [[p.path, notesIn(p.path).map((node) => tabTitles[node.path] ?? node.title ?? node.name.replace(/\.md$/, ''))]] : [])));
  const appNotes = appPath !== null ? notesOf(appPath) : {};
  // As the app opens, a tab whose task list, board, keys file or collection is not read yet shows
  // it is loading, rather than empty.
  const readingItem = (path: string | null, items: Record<string, unknown>) => path !== null && !(path in items) && reading.has(spaceOf(path) ?? '');
  const itemLoading = readingItem(list, tasks) || readingItem(boardPath, boards) || readingItem(keysPath, keyFiles) || readingItem(collectionPath, collections);
  const loadingName = list !== null ? listName(list) : boardPath !== null ? boardName(boardPath) : keysPath !== null ? keysName(keysPath) : collectionPath !== null ? collectionName(collectionPath) : '';
  const appScreen = (screen: AppScreen) => {
    if (screen.kind === 'folder') {
      return (
        <section className="app-notes">
          {notesIn(screen.path).map((node) => (
            <button key={node.path} type="button" onClick={() => void session.open(node.path)}>
              <Icon name="note" />
              <span>{tabTitles[node.path] ?? node.title ?? node.name.replace(/\.md$/, '')}</span>
            </button>
          ))}
        </section>
      );
    }
    if (screen.kind === 'board') {
      const shown = boards[screen.path];
      return shown ? (
        <BoardView
          key={screen.path}
          path={screen.path}
          board={shown}
          name={screen.name}
          embedded
          today={today}
          actions={boardActions}
          look={boardLooks[screen.path]}
          onLook={(look) => session.lookAtBoard(screen.path, look)}
          onStatus={setViewStatus}
          openCard={openCard?.board === screen.path ? openCard.id : null}
          onCloseCard={() => setOpenCard(null)}
          adding={boardAdding}
          fieldsAsked={boardFields}
        />
      ) : (
        <LoadingView name={screen.name} />
      );
    }
    const shown = collections[screen.path];
    return shown ? (
      <CollectionView
        key={screen.path}
        collection={shown}
        embedded
        today={today}
        look={collectionLooks[screen.path]}
        onLook={(look) => session.lookAtCollection(screen.path, look)}
        actions={collectionActions}
        onStatus={setViewStatus}
        fieldsAsked={collectionFields}
      />
    ) : (
      <LoadingView name={screen.name} />
    );
  };
  // And under what shows tasks, and in Search, the spaces still read.
  const still = stillOpening(reading, new Map([['', space.name ?? t('settings.personal')], ...spaces.map((each) => [each.id, each.name] as const)]));
  const isDueView = active === TODAY || active === UPCOMING;
  // Where a filter over everything can look: the personal space as a whole and its top folders, then every other space as a whole.
  const filterFolders: FilterFolder[] = ['', ...tree.filter((node) => node.kind === 'folder').map((node) => node.path), ...spaces.map((each) => inSpace(each.id, ''))].map(
    (value) => ({ value, text: folderLabel(value), space: value === '' || (spaceOf(value) !== null && localPath(value) === '') }),
  );
  // Every space's labels as one: the same name in two spaces is one label.
  const everyLabel = (): LabelUse[] => {
    const merged = new Map<string, LabelUse>();
    for (const path of ['', ...spaces.map((each) => inSpace(each.id, ''))]) {
      for (const use of labelsApi.of(path)) {
        const was = merged.get(use.name.toLowerCase());
        merged.set(use.name.toLowerCase(), was ? { ...was, tasks: was.tasks + use.tasks, cards: was.cards + use.cards } : use);
      }
    }
    return [...merged.values()];
  };
  // Everyone of every space, for what a filter over everything asks about who.
  const everyone: SpacePeople | null =
    spaces.length > 0 ? { name: '', people: [...new Map(spaces.flatMap((each) => each.people).map((person) => [person.id, person])).values()], ...(me && { me: me.id }) } : null;
  /** The filter page a tab shows, or null when it shows none. */
  const pageOf = (tab: string | null): FilterPageModel | null => {
    if (!tab) return null;
    const saved = filters.find((each) => each.id === filterOf(tab));
    if (saved) {
      const draft = filterDrafts[saved.id];
      return { title: saved.name, saved, choices: draft ?? saved, onChange: (next) => setFilterDrafts((was) => ({ ...was, [saved.id]: next })), changed: !!draft && !sameChoices(draft, saved) };
    }
    if (tab === NEW_FILTER) return { title: t('filters.new'), choices: newFilter, onChange: setNewFilter };
    const label = labelOfTab(tab);
    if (label === null) return null;
    const { space, name } = splitLabel(label);
    return { title: name, label, choices: { ...EVERYTHING, ...labelLooks[label] }, base: { labels: [name], folders: [inSpace(space, '')] }, onChange: (next) => session.lookAtLabel(label, next) };
  };
  /** What a filter page asks about: where it can look, every space's labels or a label's space's people, and the boards' fields. */
  const filterPlace = (page: FilterPageModel): FilterPlace => ({
    path: page.label ?? '',
    team: page.label ? peopleOf(page.label) : everyone,
    folders: filterFolders,
    ...(page.label ? { skip: ['labels', 'in'] } : { labels: everyLabel() }),
    fields: filterFields({ ...page.choices, ...page.base }, boards),
    used: (key) => [...new Set(Object.entries(boards).flatMap(([path, whole]) => boardPlace(path, whole, null).used!(key)))],
  });
  /** What keeps a filter page: Save for a saved filter changed, Save as filter for a new one or a label's view that picks something here. */
  const keepOf = (tab: string, page: FilterPageModel): { label: string; run: () => void } | null => {
    const { saved } = page;
    if (saved) {
      return page.changed
        ? {
            label: t('filters.save'),
            run: () => {
              session.saveFilter({ ...saved, ...page.choices, id: saved.id, name: saved.name });
              setFilterDrafts(({ [saved.id]: _done, ...rest }) => rest);
            },
          }
        : null;
    }
    const asked = { ...page.choices, ...page.base };
    return choosesAnything(page.choices) || page.choices.folders.length > 0 ? { label: t('filters.saveAs'), run: () => setDialog({ kind: 'saveFilter', choices: asked, from: tab }) } : null;
  };
  /** The end of a filter page's chips on a computer: Save as filter, or Revert and Save. */
  const filterEnd = (tab: string, page: FilterPageModel): ReactNode => {
    const keep = keepOf(tab, page);
    if (!keep) return null;
    return (
      <>
        {page.saved && (
          <button type="button" className="ghost" onClick={() => setFilterDrafts(({ [page.saved!.id]: _put, ...rest }) => rest)}>
            {t('filters.revert')}
          </button>
        )}
        <button type="button" className={page.saved ? 'primary' : 'ghost'} onClick={keep.run}>
          {keep.label}
        </button>
      </>
    );
  };
  /** What Filter's sheet filters on a phone, by the tab it was opened for: a list, a board or a filter page. */
  const sheetOf = (tab: string): { place: FilterPlace; about: string; choices: Choices; onChange: (choices: Choices) => void } | null => {
    const list = listOf(tab);
    if (list !== null) return { place: { path: list, team: peopleOf(list) }, about: listName(list), choices: listLooks[list]?.filter ?? NO_CHOICES, onChange: (filter) => session.lookAtList(list, { filter }) };
    const boardAt = boardPathOf(tab);
    if (boardAt !== null && boards[boardAt]) {
      return { place: boardPlace(boardAt, boards[boardAt], peopleOf(boardAt)), about: boardName(boardAt), choices: boardLooks[boardAt]?.filter ?? NO_CHOICES, onChange: (filter) => session.filterBoard(boardAt, filter) };
    }
    const page = pageOf(tab);
    return page ? { place: filterPlace(page), about: page.title, choices: page.choices, onChange: (next) => page.onChange({ ...next, folders: next.folders ?? [] }) } : null;
  };
  const filterPageOn = pageOf(active);
  /**
   * Favorites as the sidebar and Browse show them, in their order: what is in the trash or gone, a
   * filter deleted, a label nothing has, a space not on this device, is left out, and comes back
   * with it.
   */
  const favoriteRows: FavoriteRow[] = favorites.flatMap((favorite): FavoriteRow[] => {
    const key = favoriteKey(favorite);
    if ('filter' in favorite) {
      const filter = filters.find((each) => each.id === favorite.filter);
      const tab = filterTab(favorite.filter);
      return filter ? [{ key, tab, name: filter.name, icon: 'filter', count: counts[tab] ?? 0 }] : [];
    }
    if ('label' in favorite) {
      const where = spaceOf(favorite.space ?? '');
      if (where && !spaces.some((each) => each.id === where)) return [];
      const use = labelsApi.of(inSpace(where, '')).find((each) => sameLabel(each.name, favorite.label));
      if (!use) return [];
      const label = labelIn(where, use.name);
      const count = shownBy({ ...EVERYTHING, labels: [use.name], folders: [inSpace(where, '')] });
      return [{ key, tab: labelTab(label), name: use.name, icon: 'tag', dot: <LabelDot path={label} name={use.name} />, ...(where && { space: spaceLabel(where) }), count }];
    }
    const path = favorite.item;
    if (!(path in titles || path in tasks || path in boards || path in keyFiles || path in collections)) return [];
    const tab = path in collections ? collectionTab(path) : tabOf(path);
    const where = spaceOf(path);
    return [{ key, tab, name: nameOf(tab, tabTitles, filters), icon: iconOf(tab), ...(where && { space: spaceLabel(where) }), count: counts[tab] ?? 0 }];
  });
  /** A favorite's menu in the sidebar: its item's or its filter's, a label's Remove from favorites; its row stays marked. */
  const favoriteMenu = (event: MouseEvent, row: FavoriteRow) => {
    const filter = filters.find((each) => each.id === filterOf(row.tab));
    const path = collectionPathOf(row.tab) ?? pathOf(row.tab);
    const starred = favoriteOf(row.tab);
    const items = filter ? filterMenuItems(filter) : path !== null ? inGroups(itemMenuItems(path)) : starred ? [starItem(starred)] : [];
    openMenu(event, items, `fav:${row.key}`);
  };
  /** Favorites dragged into this order, by the keys of those shown; those not shown keep their places. */
  const orderFavorites = (keys: string[]) => {
    const byKey = new Map(favorites.map((each) => [favoriteKey(each), each]));
    const shown = new Set(keys);
    const next = keys.map((key) => byKey.get(key)!);
    let at = 0;
    session.orderFavorites(favorites.map((each) => (shown.has(favoriteKey(each)) ? next[at++]! : each)));
  };
  // Filters & Labels: each filter's count, and every space's labels under its name, the personal space's first.
  const filterCounts = Object.fromEntries(filters.map((filter) => [filter.id, counts[filterTab(filter.id)] ?? 0]));
  const labelGroups: LabelGroup[] = [
    { space: null, name: spaceLabel(null), path: '', labels: labelsApi.of('') },
    ...spaces.map((each) => ({ space: each.id, name: each.name, path: inSpace(each.id, ''), labels: labelsApi.of(inSpace(each.id, '')) })),
  ].filter((group, index, all) => group.labels.length > 0 || (index === 0 && all.every((each) => each.labels.length === 0)));
  /**
   * What the status bar says of a task view, after the mockups: a list's open tasks, with those due
   * today and those late; Today's and a filter's tasks and cards, with the late ones; Filters & Labels'
   * filters and labels; the trash's items.
   */
  const taskViewStatus = (): string[] | null => {
    const late = (day: string | null | undefined) => !!day && day < today;
    const besides = (dueToday: number, overdue: number) => [
      ...(dueToday > 0 ? [t('count.dueToday', { count: dueToday })] : []),
      ...(overdue > 0 ? [t('count.overdue', { count: overdue })] : []),
    ];
    const list = active ? listOf(active) : null;
    if (list !== null) {
      const open = (tasks[list] ?? []).filter((task) => !task.done);
      return [t('count.open', { count: open.length }), ...besides(open.filter((task) => task.due === today).length, open.filter((task) => late(task.due)).length)];
    }
    const counted = (taskCount: number, cardCount: number, overdue: number) => [
      t('count.tasks', { count: taskCount }),
      ...(cardCount > 0 ? [t('count.cards', { count: cardCount })] : []),
      ...besides(0, overdue),
    ];
    if (active === TODAY) {
      const cards = dueCards(boards).filter((d) => d.card.due! <= today);
      const subtasks = dueSubtasksNow.filter((d) => d.subtask.due! <= today);
      const overdue = dueNow.overdue.length + cards.filter((d) => late(d.card.due)).length + subtasks.filter((d) => late(d.subtask.due)).length;
      const records = dueRecordsNow.filter((d) => d.start.slice(0, 10) <= today).length;
      return [...counted(dueNow.overdue.length + dueNow.today.length + subtasks.length, cards.length, overdue), ...(records > 0 ? [t('count.records', { count: records })] : [])];
    }
    if (filterPageOn) {
      const asked = { ...filterPageOn.choices, ...filterPageOn.base };
      const found = filterTasks(asked, tasks, today, me?.id).flatMap((group) => group.tasks);
      const cards = filterCards(asked, boards, today, me?.id).flatMap((group) => group.cards);
      return counted(found.length, cards.length, found.filter((task) => late(task.due)).length + cards.filter((card) => late(card.due)).length);
    }
    if (active === FILTERS) return [t('count.filters', { count: filters.length }), t('count.labels', { count: labelGroups.reduce((sum, group) => sum + group.labels.length, 0) })];
    if (active === QUICK) return [t('quick.statusCount', { count: quick.length })];
    if (active === TRASH) return [t('count.items', { count: trash.length })];
    return null;
  };
  // A filtered list says how many of its tasks show instead.
  const taskStatus = active && listOf(active) !== null && viewStatus ? viewStatus : taskViewStatus();

  // The start page: nothing in any space yet, Inbox's own list and folders aside, makes it offer the
  // templates and an agent; Recent shows what is still there.
  const holdsItems = (nodes: TreeNode[]): boolean =>
    nodes.some((node) => (node.kind === 'folder' ? holdsItems(node.children ?? []) : node.path !== INBOX_TASKS));
  const nothingYet = reading.size === 0 && !holdsItems(tree) && spaces.every((each) => !holdsItems(each.tree)) && (tasks[INBOX_TASKS]?.length ?? 0) === 0;
  const stillThere = (id: string) => {
    if (id === FILTERS || id === NEW_FILTER || labelOfTab(id) !== null) return true;
    const filter = filterOf(id);
    if (filter !== null) return filters.some((each) => each.id === filter);
    const list = listOf(id);
    if (list !== null) return list in tasks;
    const board = boardPathOf(id);
    if (board !== null) return board in boards;
    const keysFile = keysPathOf(id);
    if (keysFile !== null) return keysFile in keyFiles;
    const dir = collectionPathOf(id);
    if (dir !== null) return dir in collections;
    return id in tabTitles;
  };

  // The quick note being written, in Take a note… or in its window, has the note's format bar: it
  // works on that editor while it is open (design/quick-notes.md 3.2, 3.4).
  const quickBar = (
    <FormatBar
      format={quickFormat}
      onFormat={(action) => session.format(action)}
      onLink={(url, text) => session.setLink(url, text)}
      linkChoices={quickLinks}
      linkHref={(choice) => choiceHref(`${QUICK_NOTES}/.md`, choice)}
      recording={recording}
      recordError={recordError}
      onRecord={() => void session.startRecording()}
      onStop={() => session.stopRecording()}
      onToTask={startToTask}
      onToCard={startToCard}
      toTaskKeys={keys('T')}
      onImage={() => session.pickImage()}
      onFind={() => session.openFind()}
      onCallout={(at) => session.calloutMenu(at)}
    />
  );
  const quickActions: QuickActions = {
    open: (path, parent, onTitle, pinned, found) => session.openQuickNote(path, parent, onTitle, pinned, found),
    close: (id) => session.closeQuickNote(id),
    title: (text) => session.quickTitle(text),
    pin: (path, on) => session.pinQuick(path, on),
    sort: (sort) => session.sortQuick(sort),
    order: (shown) => session.orderQuick(shown),
    viewer: (path, parent, body) => session.openViewer(path, parent, body),
    followLink: (path, href) => void session.followLink(path, href),
    copy: (path) => session.copyQuick(path),
    // What is open of it is written and closed first, so that it is not written back where it was.
    moveTo: (path) => {
      setQuickWindow(null);
      void session.finishQuick(path).then(() => setDialog({ kind: 'move', path }));
    },
    // The window, open or not, stays under it; a version restored goes into it. On a phone its
    // pages open over the note's page.
    history: (path) => (phone ? setPhoneHistory(path) : setDialog({ kind: 'history', path })),
    trash: (path) => {
      setQuickWindow(null);
      toTrash(session.finishQuick(path).then(() => session.trashQuick(path)));
    },
    markdown: (on) => session.setQuickSource(on),
    find: () => session.openFind(),
    menu: (event, items) => openMenu(event, items),
    sheet: (items, head) => showSheet(items, head),
    say: (text) => setNotice(text),
  };
  // On a phone, the quick note's page has the note's format bar at its top, as a note's page has.
  const quickPhoneBar = (
    <PhoneFormatBar
      format={quickFormat}
      recording={recording}
      recordError={recordError}
      onFormat={(action) => session.format(action)}
      onLink={() => setLinkEdit({ url: quickFormat?.link?.url ?? '', linked: !!quickFormat?.link && !quickFormat.link.bare })}
      onImage={() => session.pickImage()}
      onRecord={() => void session.startRecording()}
      onStop={() => session.stopRecording()}
      onToTask={startToTask}
      onToCard={startToCard}
      onCallout={(at) => session.calloutMenu(at)}
    />
  );

  // What is open: a note in the editor, or the view of a list, a board, a keys file, a collection,
  // a filter or the trash. On a computer it fills the main area under the tabs; on a phone it is
  // drawn into a layer that the page on top shows.
  const itemContent = (
    <>
    {/* On a phone the format bar is a row of icons at the top of the note. */}
    {showingEditor && phone && (
      <PhoneFormatBar
        format={format}
        recording={recording}
        recordError={recordError}
        onFormat={(action) => session.format(action)}
        onLink={() => setLinkEdit({ url: format?.link?.url ?? '', linked: !!format?.link && !format.link.bare })}
        onImage={() => session.pickImage()}
        onRecord={() => void session.startRecording()}
        onStop={() => session.stopRecording()}
        onToTask={startToTask}
        onToCard={startToCard}
        onCallout={(at) => session.calloutMenu(at)}
      />
    )}
    {showingEditor && !phone && (
      <FormatBar
        format={format}
        onFormat={(action) => session.format(action)}
        onLink={(url, text) => session.setLink(url, text)}
        linkChoices={noteLinks}
        linkHref={noteHref}
        recording={recording}
        recordError={recordError}
        onRecord={() => void session.startRecording()}
        onStop={() => session.stopRecording()}
        onToTask={startToTask}
        onToCard={startToCard}
        toTaskKeys={keys('T')}
        onImage={() => session.pickImage()}
        onFind={() => session.openFind()}
        onCallout={(at) => session.calloutMenu(at)}
      />
    )}
    <div className="editor" ref={host} hidden={!showingEditor} />
    {itemLoading && <LoadingView name={loadingName} />}
    {list !== null && !itemLoading && (
      <TaskList
        key={list}
        list={list}
        tasks={tasks[list] ?? []}
        sections={sections[list] ?? []}
        today={today}
        actions={taskActions}
        places={allPlaces()}
        reveal={revealTask?.list === list ? revealTask : null}
        look={listLooks[list]}
        onLook={(look) => session.lookAtList(list, look)}
        onStatus={setViewStatus}
      />
    )}
    {boardPath !== null && board && (
      <BoardView
        key={boardPath}
        path={boardPath}
        board={board}
        name={boardName(boardPath)}
        today={today}
        actions={boardActions}
        look={boardLooks[boardPath]}
        onLook={(look) => session.lookAtBoard(boardPath, look)}
        onStatus={setViewStatus}
        openCard={openCard?.board === boardPath ? openCard.id : null}
        onCloseCard={() => setOpenCard(null)}
        adding={boardAdding}
        fieldsAsked={boardFields}
      />
    )}
    {keysPath !== null && keysText !== undefined && (
      <KeysView
        key={keysPath}
        path={keysPath}
        name={keysName(keysPath)}
        text={keysText}
        look={keysLooks[keysPath]}
        onLook={(look) => session.lookAtKeys(keysPath, look)}
        actions={keysActions}
        onStatus={setViewStatus}
        adding={keysAdding}
      />
    )}
    {!phone && appPath !== null && (
      <AppView
        key={appPath}
        folder={appPath}
        app={appFile}
        icon={appIcons[appPath] ?? 'app'}
        home={appFile ? homeOf(appFile) : { today: true, cards: true }}
        modules={appModules}
        look={appLooks[appPath] ?? {}}
        onLook={(look) => {
          if (look.screen !== appLooks[appPath]?.screen) lookAtScreen(appModules.flatMap((m) => m.screens).find((s) => screenKey(s) === look.screen));
          session.lookAtApp(appPath, look);
        }}
        collections={collections}
        boards={boards}
        notes={appNotes}
        today={today}
        due={dueRecordsNow.filter((d) => isUnder(d.collection, appPath))}
        actions={taskActions}
        screen={appScreen}
        onOpen={openScreen}
        onAdd={(event) => openMenu(event, newInAppItems(appPath))}
        onMenu={(event) => appMenu(event, appPath)}
      />
    )}
    {collection && collectionPath !== null && (
      <CollectionView
        key={collectionPath}
        collection={collection}
        today={today}
        look={collectionLooks[collectionPath]}
        onLook={(look) => session.lookAtCollection(collectionPath, look)}
        actions={collectionActions}
        onStatus={setViewStatus}
        fieldsAsked={collectionFields}
      />
    )}
    {!phone && active === TODAY && <TodayView lists={tasks} boards={boards} today={today} actions={taskActions} still={still} />}
    {!phone && active === CHAT && <ChatView snapshot={chat} menu={openMenu} onStatus={setViewStatus} links={chatLinks} goTo={chatGoTo} />}
    {!phone && active === UPCOMING && (
      <Upcoming
        lists={tasks}
        boards={boards}
        today={today}
        actions={taskActions}
        places={allPlaces()}
        onAdd={(target, task) => {
          session.addTask(target, task);
          setNotice(t('phone.addedTo', { name: task.title.trim(), place: listLabel(target) }));
        }}
        onStatus={setViewStatus}
        still={still}
      />
    )}
    {active === FILTERS && (
      <FiltersAndLabels
        filters={filters}
        counts={filterCounts}
        groups={labelGroups}
        onOpenFilter={(filter) => void session.open(filterTab(filter.id))}
        labelCount={(group, name) => shownBy({ ...EVERYTHING, labels: [name], folders: [group.path] })}
        onOpenLabel={(group, name) => void session.open(labelTab(labelIn(group.space, name)))}
        onAdd={() => void session.open(NEW_FILTER)}
        onFilterMenu={filterMenu}
        onFilterHold={(filter) => phoneItemMenu(filterTab(filter.id))}
        onLabelHold={(group, name) => phoneItemMenu(labelTab(labelIn(group.space, name)))}
        starred={(favorite) => isFavorite(favorites, favorite)}
        onStar={(favorite) => session.star(favorite, !isFavorite(favorites, favorite))}
        onEditLabels={(group) => setLabelsOpen(group.path)}
      />
    )}
    {filterPageOn && active && (
      <FilterPage
        key={active}
        title={filterPageOn.title}
        lead={filterPageOn.label ? <LabelDot path={filterPageOn.label} name={filterPageOn.title} /> : undefined}
        {...(filterPageOn.label && { detail: spaceLabel(splitLabel(filterPageOn.label).space) })}
        place={filterPlace(filterPageOn)}
        choices={filterPageOn.choices}
        base={filterPageOn.base}
        onChange={filterPageOn.onChange}
        end={filterEnd(active, filterPageOn)}
        onSheet={(step) => setFilterSheet({ tab: active, step })}
        still={still}
        lists={tasks}
        boards={boards}
        today={today}
        {...(me && { me: me.id })}
        actions={taskActions}
      />
    )}
    {!phone && active === TRASH && (
      <TrashView
        items={trash}
        today={today}
        spaces={trashSpaces}
        choice={trashChoice}
        onOpen={setTrashOpen}
        onRestore={restoreTrashed}
        onDelete={deleteForever}
        onEmpty={askEmptyTrash}
      />
    )}
    {!phone && trashShown && (
      <TrashPreviewDialog
        item={trashShown}
        today={today}
        read={session.trashedContent}
        resolveImage={session.imageFrom}
        onRestore={() => {
          setTrashOpen(null);
          restoreTrashed(trashShown);
        }}
        onDelete={() => deleteForever(trashShown, () => setTrashOpen(null))}
        onClose={() => setTrashOpen(null)}
      />
    )}
    {!phone && active === FILES && filesView}
    {!phone && active === QUICK && (
      <QuickNotes
        notes={quick}
        texts={quickTexts}
        order={quickOrder}
        sort={quickSort}
        created={created}
        open={quickWindow?.path ?? null}
        bar={quickBar}
        actions={quickActions}
        onOpen={(path) => setQuickWindow({ path, made: Date.now() })}
      />
    )}
    {!phone && !showingEditor && !itemLoading && list === null && !board && keysText === undefined && !collection && appPath === null && !isDueView && !filterPageOn && active !== FILTERS && active !== TRASH && active !== FILES && active !== CHAT && active !== QUICK &&
      (active ? (
        <section className="placeholder">
          <h1>{labelOf(active, tabTitles, filters)}</h1>
          <p>{t('board.placeholder')}</p>
        </section>
      ) : (
        empty && (
          <StartPage
            empty={nothingYet}
            recent={recent.filter((seen) => stillThere(seen.id))}
            titles={tabTitles}
            filters={filters}
            lists={tasks}
            boards={boards}
            today={today}
            actions={taskActions}
            onKind={(kind) => (kind === 'quick' ? newQuick() : setDialog(kind === 'app' ? { kind: 'newApp', folder: createIn } : { kind: 'new', start: kind }))}
            onTemplate={(start) => setDialog({ kind: 'new', start: start.kind, template: start.template })}
            onApp={() => setDialog({ kind: 'newApp', folder: createIn })}
            onOpen={(id) => void (id === WELCOME_NOTE ? session.openWelcome() : session.open(id))}
            onOpenTask={(taskList, id) => {
              void session.open(tasksOf(taskList));
              setRevealTask({ list: taskList, id, at: Date.now() });
            }}
            onOpenToday={() => void session.open(TODAY)}
            onAgents={() => setDialog({ kind: 'settings', section: 'agents' })}
            still={still}
          />
        )
      ))}
    </>
  );

  // What is being typed is written first, then the update goes in and the new version opens.
  const restartUpdate = () =>
    void session
      .beforeSync()
      .then(isDesktop ? restartIntoUpdate : reloadIntoUpdate)
      .catch((error: unknown) => setNotice(t('status.updateFailed', { error: String(error) })));

  const settingsValues: SettingsValues = {
    mode,
    onMode: (choice) => {
      setMode(choice);
      saveMode(choice);
    },
    theme,
    onTheme: (id) => {
      setTheme(id);
      saveTheme(id);
    },
    system,
    sizes,
    onSize: (kind, size) => {
      setSizes({ ...sizes, [kind]: size });
      saveSize(kind, size);
      applySize();
    },
    numbers,
    onNumbers: (choice) => {
      saveNumbers(choice);
      applyNumbers(choice);
      // Every number on screen is written again the new way.
      setNumbers(choice);
    },
    me,
    onSaveProfile: (name, email) => session.saveProfile(name, email),
    spaceName: space.name,
    onRenameSpace: (name) => session.renameSpace(name),
    spaces,
    onRenameSpaceById: (id, name) => session.renameSpaceById(id, name),
    onAddSpace: (name, source, id, existing) => session.addSpace(name, source, id, existing),
    onRemoveSpace: (id, deleteFiles) => void removeSpace(id, deleteFiles),
    onMoveSpace: (id, by) => void session.moveSpace(id, by),
    onPersonActive: (space, person, active) => session.setPersonActive(space, person, active),
    computerAgents: () => session.computerAgents(),
    onRenameComputerAgent: (id, name) => session.renameComputerAgent(id, name),
    onChangeSpaceFolder: isDesktop ? (id, ask) => void changeSpaceFolder(id, ask) : undefined,
    initialSpace: dialog?.kind === 'settings' ? dialog.space : undefined,
    addingAs: sync.adding,
    folder,
    defaultFolder,
    // A folder that holds a space, or is inside one, is refused with a word why.
    onChangeFolder: isDesktop ? (ask) => void session.chooseFolder(ask).catch((error: unknown) => setNotice(error instanceof Error ? error.message : t('error.spaceNests'))) : undefined,
    onUseDefaultFolder: isDesktop ? () => void session.useDefaultFolder() : undefined,
    sync,
    syncService,
    onRestartUpdate: restartUpdate,
  };

  return (
    <LabelsContext.Provider value={labelsApi}>
    <div className={phone ? 'app phone-app' : drawer ? 'app drawer-open' : 'app'}>
      {phone ? (
        <>
          <Phone
            ready={ready}
            tabs={tabs}
            active={active}
            titles={tabTitles}
            tree={tree}
            spaces={spaces}
            filters={filters}
            counts={counts}
            item={itemLayer}
            dueView={(kind) =>
              kind === 'today' ? (
                <TodayView lists={tasks} boards={boards} today={today} actions={taskActions} bare still={still} />
              ) : (
                <PhoneUpcoming view={phoneUpcoming} lists={tasks} boards={boards} today={today} actions={taskActions} day={upDay} onDay={setUpcomingDay} still={still} />
              )
            }
            upcomingView={phoneUpcoming}
            upcomingDay={upDay}
            onUpcomingView={(view) => {
              const shown = view === 'list' ? 'list' : 'calendar';
              setUpcomingView(shown);
              saveUpcomingView(shown);
              if (view !== 'list') {
                setCalendarRange(view);
                saveCalendarRange(view);
              }
            }}
            canAdd={(id) => listOf(id) !== null || boardPathOf(id) !== null || (keysPathOf(id) !== null && keysLooks[keysPathOf(id)!]?.view !== 'text') || (collectionPathOf(id) !== null && (collections[collectionPathOf(id)!]?.schema.fields.length ?? 0) > 0)}
            onAdd={phoneAdd}
            trashView={<TrashView items={trash} today={today} spaces={trashSpaces} choice={trashChoice} onOpen={setTrashOpen} onRestore={restoreTrashed} onDelete={(item) => deleteForever(item)} onEmpty={askEmptyTrash} />}
            trashItem={{
              open: trashShown,
              onShown: () => setTrashOpen(null),
              view: (item, done) => (
                <TrashPreviewPage
                  item={item}
                  today={today}
                  read={session.trashedContent}
                  resolveImage={session.imageFrom}
                  onRestore={() => {
                    done();
                    restoreTrashed(item);
                  }}
                  onDelete={() => deleteForever(item, done)}
                />
              ),
            }}
            trashChoice={{
              choosing: trashChoosing,
              count: chosenTrash.length,
              all: trash.length > 0 && chosenTrash.length === trash.length,
              any: trash.length > 0,
              onStart: () => setTrashChoosing(true),
              onAll: () => setTrashChosen(chosenTrash.length === trash.length ? new Set() : new Set(trash.map((item) => item.path))),
              onDone: letGoOfTrash,
              actions: [
                { icon: 'restore', label: t('trash.restore'), run: trashChoice.onRestore },
                { icon: 'trash', label: t('menu.delete'), danger: true, run: trashChoice.onDelete },
              ],
            }}
            filesView={filesView}
            filesChoice={{
              choosing: filesChoosing,
              count: chosenFiles.length,
              all: allFiles.length > 0 && chosenFiles.length === allFiles.length,
              any: allFiles.length > 0,
              onStart: () => setFilesChoosing(true),
              onAll: () => setFilesChosen(chosenFiles.length === allFiles.length ? new Set() : new Set(allFiles.map((file) => file.path))),
              onDone: letGoOfFiles,
              actions: [
                { icon: 'share', label: t('files.share'), run: () => void shareFiles(chosenFiles) },
                { icon: 'trash', label: t('menu.delete'), danger: true, run: () => askDeleteFiles(chosenFiles) },
              ],
            }}
            onFilesShown={setFilesShown}
            search={{ things: searchThings, actions: searchActions, onShown: setSearchShown, onPick: openFound, still }}
            reading={reading}
            onWant={(paths) => session.want(paths)}
            syncs={sync.all}
            onSignIn={signInFor}
            syncWord={syncWord(sync)}
            syncAsked={syncAsked}
            labelsAsked={phone ? labelsOpen : null}
            onLabelsShown={() => setLabelsOpen(null)}
            onSyncShown={() => setSyncAsked(false)}
            notice={notice}
            onUndo={undoNotice}
            onCloseNotice={() => setShown(null)}
            update={
              update && (
                <>
                  <span>{t('status.updateReady')}</span>
                  {/* What is being typed is written first, then the page reloads into the new version. */}
                  <button type="button" onClick={() => void session.beforeSync().then(reloadIntoUpdate)}>
                    {t('status.reload')}
                  </button>
                </>
              )
            }
            onOpen={(id) => {
              // An empty note opens to be written in, with the keyboard up.
              if (session.opensToWrite(id)) session.holdKeyboard();
              void session.open(id);
            }}
            onClose={(id) => void session.close(id)}
            onCreate={(folder) => setDialog({ kind: 'new', folder })}
            settings={{
              values: settingsValues,
              open: dialog?.kind === 'settings' ? { section: dialog.section } : null,
              onShown: () => setDialog(null),
            }}
            onNewFolder={(name, parent) => session.newFolder(name, parent)}
            onItemMenu={phoneItemMenu}
            favorites={favoriteRows}
            itemFilter={(id) => {
              const target = sheetOf(id);
              return target && { on: asksAnything(target.choices), open: () => setFilterSheet({ tab: id, step: null }) };
            }}
            itemAction={(id) => {
              if (id === FILTERS) return { label: t('filters.add'), icon: 'plus', run: () => void session.open(NEW_FILTER) };
              const page = pageOf(id);
              return page && keepOf(id, page);
            }}
            onFolderMenu={phoneFolderMenu}
            apps={{
              icon: (path) => appIcons[path] ?? 'app',
              sub: (path) => {
                const modules = modulesOf(path);
                return (modules.length === 1 ? modules[0]!.screens : modules).map((each) => each.name || t('app.screens')).join(' · ');
              },
              view: (path, go) => (
                <PhoneAppHome
                  modules={modulesOf(path)}
                  shows={appFiles[path] ? homeOf(appFiles[path]!) : { today: true, cards: true }}
                  collections={collections}
                  boards={boards}
                  notes={notesOf(path)}
                  today={today}
                  due={dueRecordsNow.filter((d) => isUnder(d.collection, path))}
                  actions={taskActions}
                  onScreen={(screen) => {
                    lookAtScreen(screen);
                    if (screen.kind === 'folder') go.folder(screen.path);
                    else go.item(screen.kind === 'collection' ? collectionTab(screen.path) : screen.kind === 'note' ? screen.path : boardOf(screen.path));
                  }}
                  onAdd={() => showSheet(newInAppItems(path), { icon: appIcons[path] ?? 'app', title: folderLabel(path), sub: t('app.addScreen') })}
                  about={aboutOf(path)}
                  onAbout={(note) => go.item(note)}
                  onFiles={() => go.folder(path)}
                />
              ),
            }}
            movedFolder={revealFolder?.from !== undefined && revealFolder.item !== undefined ? { from: revealFolder.from, to: revealFolder.item, at: revealFolder.at } : null}
            onSpaceOrder={(key) => showSheet(orderItems(key), { icon: 'tune', title: key === '' ? (space.name ?? t('settings.personal')) : folderLabel(key) })}
            folderLooks={folderLooks}
            times={nodeTimes}
            menuOpen={menu !== null}
            quick={{
              count: quick.length,
              list: (open) => (
                <QuickNotes phone notes={quick} texts={quickTexts} order={quickOrder} sort={quickSort} created={created} open={null} bar={null} actions={quickActions} onOpen={open} />
              ),
              note: (page) => (
                <PhoneQuickNote
                  path={page.path}
                  {...(page.found && { found: page.found })}
                  back={page.back}
                  {...(page.path && { modified: quick.find((note) => note.path === page.path)?.modified })}
                  bar={quickPhoneBar}
                  // Moved or deleted from its page, the page goes first.
                  actions={{ ...quickActions, moveTo: (path) => (page.onBack(), quickActions.moveTo(path)), trash: (path) => (page.onBack(), quickActions.trash(path)) }}
                  onBack={page.onBack}
                />
              ),
              onSort: () => showSheet(quickSortItems(quickSort, (sort) => session.sortQuick(sort)), { icon: 'sort', title: t('quick.sort'), sub: t('quick.title') }),
              onNew: () => session.holdKeyboard(),
              open: phoneQuick,
              onShown: () => setPhoneQuick(null),
            }}
            history={{
              open: phoneHistory,
              onShown: () => setPhoneHistory(null),
              list: (path, pick) => <HistoryList path={path} today={today} source={session} onPick={pick} />,
              version: (path, version, done) => (
                <VersionView
                  version={version}
                  source={session}
                  onRestore={(text) => {
                    done();
                    void session.restoreVersion(path, text);
                  }}
                />
              ),
              label: (version) => versionLabel(version, today),
            }}
            card={{
              open: openCard,
              view: (board, id) => {
                const whole = boards[board];
                const card = whole?.cards.find((each) => each.id === id);
                return whole && card ? <PhoneCardPage key={id} board={whole} path={board} card={card} today={today} actions={boardActions} /> : null;
              },
              label: (board, id) => {
                const whole = boards[board];
                const card = whole?.cards.find((each) => each.id === id);
                return whole && card ? keyOf(whole, card) : '';
              },
              onMenu: (board, id) => {
                const whole = boards[board];
                const card = whole?.cards.find((each) => each.id === id);
                if (!whole || !card) return;
                showSheet(
                  [
                    { label: t('card.copyBrief'), icon: 'copy', run: () => void copyBrief(board, id) },
                    {
                      label: t('menu.delete'),
                      icon: 'trash',
                      danger: true,
                      // The page goes once the card is deleted, not when it is asked.
                      run: () => {
                        setOpenCard(null);
                        deleteCard(board, card);
                      },
                    },
                  ],
                  { icon: 'board', title: `${keyOf(whole, card)} ${card.title}`, sub: t('phone.cardIn', { board: boardName(board) }) },
                );
              },
              onClosed: () => setOpenCard(null),
            }}
            record={{
              open: recordAsked,
              onShown: () => setRecordAsked(null),
              exists: (dir, id) => !!collections[dir]?.records.some((r) => r.id === id),
              view: (dir, id) => {
                const collection = collections[dir];
                const record = collection?.records.find((r) => r.id === id);
                return collection && record ? (
                  <PhoneRecordPage
                    key={id}
                    collection={collection}
                    record={record}
                    today={today}
                    actions={collectionActions}
                    guards={recordGuards.current}
                    onOpenCard={(board, card) => setOpenCard({ board, id: card })}
                  />
                ) : null;
              },
              label: (dir, id) => {
                const record = collections[dir]?.records.find((r) => r.id === id);
                return record ? recordTitle(record) : '';
              },
              onMenu: (dir, id) => {
                const record = collections[dir]?.records.find((r) => r.id === id);
                if (!record) return;
                showSheet(
                  [
                    { label: t('phone.openAsNote'), icon: 'note', run: () => void session.open(record.path) },
                    { label: t('menu.delete'), icon: 'trash', danger: true, run: () => collectionActions.removeRecord(dir, record) },
                  ],
                  { icon: 'collection', title: recordTitle(record), sub: t('phone.recordIn', { collection: collectionName(dir) }) },
                );
              },
              leave: (dir, id, then) => {
                const guard = recordGuards.current.get(`${dir}\u0000${id}`);
                if (guard) guard(then);
                else then();
              },
            }}
            chat={{ links: chatLinks, menu: openMenu, goTo: chatGoTo }}
          />
          {newRecord && collections[newRecord.dir] && (
            <PhoneNewRecord
              key={newRecord.dir}
              collection={collections[newRecord.dir]!}
              values={newRecord.values}
              today={today}
              actions={collectionActions}
              onClose={() => setNewRecord(null)}
            />
          )}
          {createPortal(itemContent, itemLayer)}
          {linkTap && (
            <LinkActions
              link={linkTap}
              onOpen={() => session.openTapped(linkTap.href)}
              onEdit={() => {
                const link = session.placeCursor(linkTap.pos);
                setLinkEdit({ url: link?.url ?? linkTap.href, linked: !link?.bare });
              }}
              onCopy={() => void navigator.clipboard.writeText(linkTap.href).then(() => setNotice(t('phone.copied')), () => undefined)}
              onClose={closeLinkTap}
            />
          )}
          {taskSheet &&
            (() => {
              const task = tasks[taskSheet.list]?.find((each) => each.id === taskSheet.id);
              if (!task) return null;
              return (
                <TaskSheet
                  key={`${taskSheet.list}#${taskSheet.id}`}
                  list={taskSheet.list}
                  task={task}
                  tasks={tasks[taskSheet.list] ?? []}
                  sections={sections[taskSheet.list] ?? []}
                  today={today}
                  actions={taskActions}
                  subtask={taskSheet.subtask}
                  onOpen={(id) => setTaskSheet({ list: taskSheet.list, id, subtask: false })}
                  onClose={() => setTaskSheet(null)}
                />
              );
            })()}
          {filterSheet &&
            (() => {
              const { tab, step } = filterSheet;
              const target = sheetOf(tab);
              return (
                target && (
                  <FilterSheet
                    key={`${tab}#${step ?? ''}`}
                    place={target.place}
                    about={target.about}
                    start={step}
                    choices={target.choices}
                    onChange={target.onChange}
                    onClose={() => setFilterSheet(null)}
                  />
                )
              );
            })()}
          {taskPicker &&
            (() => {
              const task = tasks[taskPicker.list]?.find((each) => each.id === taskPicker.id);
              if (!task) return null;
              const close = () => setTaskPicker(null);
              const team = peopleOf(taskPicker.list);
              if (taskPicker.kind === 'labels') {
                return <LabelSheet path={taskPicker.list} about={task.title} labels={task.labels ?? []} onChange={(labels) => session.updateTask(taskPicker.list, task.id, { labels })} onClose={close} />;
              }
              if (taskPicker.kind === 'assignee') {
                return (
                  team && <PeopleSheet about={task.title} team={team} current={task.assignee ?? null} onPick={(assignee) => session.updateTask(taskPicker.list, task.id, { assignee })} onClose={close} />
                );
              }
              return taskPicker.kind === 'date' ? (
                <DateSheet title={task.title} current={task.due ?? null} today={today} onPick={(due) => session.updateTask(taskPicker.list, task.id, { due })} onClose={close} />
              ) : (
                <RecordSheet
                  current={task.record ?? null}
                  choices={taskActions.recordChoices()}
                  onPick={(record) => session.updateTask(taskPicker.list, task.id, { record })}
                  onClose={close}
                />
              );
            })()}
          {dayPicker && <DateSheet title={dayPicker.title} current={null} today={today} onPick={dayPicker.onPick} onClose={() => setDayPicker(null)} />}
          {sectionSheet && (
            <SectionSheet
              list={sectionSheet.list}
              start={sectionSheet.section?.name ?? null}
              onSave={(name) => (sectionSheet.section ? session.renameSection(sectionSheet.list, sectionSheet.section.id, name) : session.addSection(sectionSheet.list, name))}
              onClose={() => setSectionSheet(null)}
            />
          )}
          {quickAdd && (
            <QuickAdd
              initial={quickAdd}
              places={allPlaces()}
              today={today}
              recordChoices={taskActions.recordChoices}
              recordName={taskActions.recordTitle}
              description={descriptionHost}
              onAdd={(list, task) => session.addTask(list, task)}
              onClose={() => setQuickAdd(null)}
            />
          )}
          {linkEdit && (
            <LinkSheet
              url={linkEdit.url}
              linked={linkEdit.linked}
              choices={noteLinks}
              linkHref={noteHref}
              onApply={(url, text) => {
                setLinkEdit(null);
                session.setLink(url, text);
              }}
              onClose={() => setLinkEdit(null)}
            />
          )}
        </>
      ) : (
        <>
        <Sidebar
          tree={tree}
          titles={titles}
          active={active}
          counts={counts}
          chat={chat.servers.length > 0}
          onOpen={(id) => {
            setDrawer(false);
            void session.open(id);
          }}
          onMove={moveAndSay}
          onNewFolder={(name, parent) => session.newFolder(name, parent)}
          onItemMenu={itemMenu}
          appIcons={appIcons}
          appFiles={new Set(Object.entries(appLooks).flatMap(([path, look]) => (look.files ? [path] : [])))}
          onFolderMenu={folderMenu}
          onFolderAdd={folderAdd}
          menuTarget={menu?.target ?? null}
          spaces={spaces}
          personalName={space.name ?? t('settings.personal')}
          onSpaceMenu={spaceMenu}
          onSpaceAdd={spaceAdd}
          onOrderSpaces={(ids) => void session.orderSpaces(ids)}
          folderLooks={folderLooks}
          times={nodeTimes}
          onSettings={() => {
            setDrawer(false);
            setDialog({ kind: 'settings' });
          }}
          onSync={() => {
            setDrawer(false);
            setDialog({ kind: 'settings', section: 'spaces' });
          }}
          settingsOpen={dialog?.kind === 'settings' && dialog.section !== 'spaces'}
          syncOpen={dialog?.kind === 'settings' && dialog.section === 'spaces'}
          onSearch={() => setSearching(true)}
          searchOpen={searching}
          reveal={revealFolder}
          reading={reading}
          onWant={(paths) => session.want(paths)}
          syncs={sync.all}
          onSignIn={signInFor}
          favorites={favoriteRows}
          onFavoriteMenu={favoriteMenu}
          onOrderFavorites={orderFavorites}
        />
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
        <main className="main">
          <div
            ref={tabBar}
            className="tabs"
            role="tablist"
            onDragOver={onTabDragOver}
            onDrop={onTabDrop}
            onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setTabGap(null)}
            // A mouse wheel scrolls the tabs sideways when they do not fit.
            onWheel={(event) => {
              if (!event.shiftKey && event.deltaY) event.currentTarget.scrollLeft += event.deltaY;
            }}
          >
            <button type="button" className="tab-menu" title={t('side.open')} aria-label={t('side.open')} onClick={() => setDrawer(true)}>
              <Icon name="menu" />
            </button>
            {tabs.map((id, i) => (
              <div
                key={id}
                className={tabClass(id, i)}
                role="tab"
                aria-selected={id === active}
                draggable
                onMouseEnter={(event) => showTabTip(event, id)}
                onMouseLeave={hideTabTip}
                onDragStart={(event) => {
                  hideTabTip();
                  event.dataTransfer.setData(TAB_DRAG_TYPE, id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDraggedTab(id);
                }}
                onDragEnd={() => {
                  setDraggedTab(null);
                  setTabGap(null);
                }}
                onMouseDown={(event) => {
                  hideTabTip();
                  if (event.button === 1) void session.close(id);
                }}
                onContextMenu={(event) => {
                  hideTabTip();
                  tabMenu(event, id);
                }}
                onDoubleClick={(event) => !(event.target as Element).closest('.tab-close') && void renameTab(id)}
              >
                <button type="button" className="tab-title" onClick={() => void session.open(id)}>
                  <Icon name={tabIcon(id)} />
                  <span>{labelOf(id, tabTitles, filters)}</span>
                </button>
                {/* The dot marks a note that has not been filed yet; it gives way to the close button on hover. */}
                <button
                  type="button"
                  className="tab-close"
                  title={t('tab.close', { keys: keys('W') })}
                  onClick={() => void session.close(id)}
                >
                  <span>×</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="tab-new"
              title={t('tab.new', { keys: keys('N') })}
              onClick={() => setDialog({ kind: 'new' })}
            >
              +
            </button>
          </div>
          {itemContent}
          {tabTip.tip}
          <footer className="status">
            {stats && <span>{position(stats)}</span>}
            {stats && <span>{t('count.words', { count: stats.words })}</span>}
            {stats && <span>{t('count.characters', { count: stats.chars })}</span>}
            {stats && written !== null && <span>{writtenText(written)}</span>}
            {(keysText !== undefined || collection || active === UPCOMING || active === CHAT || boardPath !== null) && viewStatus?.map((part, i) => <span key={i}>{part}</span>)}
            {taskStatus?.map((part, i) => <span key={`task-${i}`}>{part}</span>)}
            {notice && !notice.toast && (
              <span className="notice" role="status">
                {notice.text}
                {notice.undo && (
                  <button type="button" onClick={undoNotice}>
                    {t('notice.undo')}
                  </button>
                )}
                {notice.action && (
                  <button type="button" onClick={notice.action.run}>
                    {notice.action.label}
                  </button>
                )}
              </span>
            )}
            {update && (
              <span className="update" role="status">
                {t('status.updateReady')}
                {/* What is being typed is written first, then the page reloads into the new version. */}
                <button type="button" onClick={() => void session.beforeSync().then(reloadIntoUpdate)}>
                  {t('status.reload')}
                </button>
              </span>
            )}
            {desktopUpdate.state === 'ready' && (
              <span className="update" role="status" title={t('status.updateTip', { version: desktopUpdate.version })}>
                {t('status.updateReady')}
                <button type="button" onClick={restartUpdate}>
                  {t('status.restart')}
                </button>
              </span>
            )}
            {openFailed && !ready ? (
              <span className="push update" role="alert">
                {t('status.openFailed', { error: openFailed })}
                <button type="button" onClick={() => window.location.reload()}>
                  {t('status.reload')}
                </button>
              </span>
            ) : (
              <span className="push">
                {/* Opening… while the app still reads; what is being saved is said first. */}
                {!ready || (saved && reading.size > 0) ? (
                  <span className="opening">
                    <Spin />
                    {t('status.opening')}
                  </span>
                ) : saved ? (
                  t('status.saved')
                ) : (
                  t('status.saving')
                )}
              </span>
            )}
            {showingEditor && (
              <button
                type="button"
                aria-pressed={source}
                title={t('status.markdownTitle')}
                onClick={() => session.setSource(!source)}
              >
                {t('status.markdown')}
              </button>
            )}
            <SyncStatus
              sync={sync}
              onSyncNow={(space) => syncService.syncNow(space)}
              onSettings={(space) => setDialog({ kind: 'settings', section: 'spaces', space })}
              onSignIn={signInFor}
              onUpdate={() => syncService.updateApp()}
              onOpenCopy={(path) => void session.open(path)}
            />
          </footer>
        </main>
        </>
      )}

      {/* Under every other window: To task, History and Move to open over it. */}
      {quickWindow && !phone && (
        <QuickWindow
          key={quickWindow.made}
          path={quickWindow.path}
          {...(quickWindow.found && { found: quickWindow.found })}
          modified={quickWindow.path ? quick.find((note) => note.path === quickWindow.path)?.modified : undefined}
          bar={quickBar}
          actions={quickActions}
          onClose={() => setQuickWindow(null)}
        />
      )}

      {showNew && phone && (
        <PhoneCreate
          key={dialog?.kind === 'new' ? `${dialog.start ?? ''}:${dialog.folder ?? ''}` : ''}
          start={(dialog?.kind === 'new' && dialog.start) || null}
          folders={everyFolder(tree, spaces)}
          folder={createIn}
          collections={Object.keys(collections)}
          modules={newModules}
          onCreate={create}
          onApp={() => setDialog({ kind: 'newApp', folder: createIn })}
          onQuick={newQuick}
          onClose={closeDialog}
        />
      )}
      {showNew && !phone && (
        <NewDialog
          // Open already, it starts again with what a folder's menu or the start page chose.
          key={dialog?.kind === 'new' ? `${dialog.start ?? ''}:${dialog.folder ?? ''}:${dialog.template ?? ''}` : ''}
          start={(dialog?.kind === 'new' && dialog.start) || null}
          template={(dialog?.kind === 'new' && dialog.template) || null}
          folders={everyFolder(tree, spaces)}
          folder={createIn}
          collections={Object.keys(collections)}
          modules={newModules}
          onCreate={create}
          onApp={() => setDialog({ kind: 'newApp', folder: createIn })}
          onQuick={newQuick}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'editMenu' && editMenu && (
        <AppMenuDialog
          name={appFiles[dialog.folder]?.name ?? folderLabel(dialog.folder)}
          start={editMenu}
          templates={(() => {
            const file = appFiles[dialog.folder]!;
            return file.menu && file.templates.length > 0 ? menuEditOf({ ...file, menu: undefined }, dialog.folder, piecesIn(dialog.folder), appLines) : null;
          })()}
          pieces={piecesIn(dialog.folder).filter((p) => (p.kind === 'collection' || p.kind === 'board') && !appLines.has(p.path))}
          lines={[...appLines].filter(([path]) => isUnder(path, dialog.folder)).map(([path, owner]) => ({ path, name: collectionName(path), owner: collectionName(owner) }))}
          views={(path) => (collections[path]?.schema.views ?? []).map((v) => ({ id: v.id, name: v.name }))}
          phone={phone}
          onMenu={(event, items) => openMenu(event, items)}
          onSave={async ({ edit, renames }) => {
            const folder = dialog.folder;
            const done = await session.saveAppMenu(folder, edit, renames);
            if ('error' in done) return done.error;
            setDialog(null);
            void session.appAt(folder).then((file) => setAppFiles((was) => ({ ...was, [folder]: file })));
            // The screen open, renamed, is open still.
            const look = appLooks[folder];
            const open = look?.screen?.split('#')[0];
            const now = open !== undefined ? done.moved.get(open) : undefined;
            if (look && now) session.lookAtApp(folder, { ...look, screen: look.screen!.replace(open!, now) });
            setShown({
              text: t('appMenu.saved'),
              undo: () => void done.undo().then(() => session.appAt(folder).then((file) => setAppFiles((was) => ({ ...was, [folder]: file })))),
              toast: true,
            });
            return null;
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'addToApp' && (
        <NewAppDialog
          folders={everyFolder(tree, spaces)}
          folder={dialog.folder}
          adding={dialog.app}
          onPlan={(input) => session.planAddToApp(dialog.folder, input.templates, input.currencies)}
          onCreate={async (plan) => {
            const done = await session.installAddToApp(plan, dialog.folder);
            if ('error' in done) return done.error;
            setDialog(null);
            const added = plan.templates.map((s) => s.title);
            setShown({ text: t('apps.added', { templates: new Intl.ListFormat(locale(), { type: 'conjunction' }).format(added), name: plan.app.name, what: addedCounts(plan) }), undo: () => void done.undo(), toast: true });
            return null;
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'editApp' && (
        <NewAppDialog
          folders={everyFolder(tree, spaces)}
          folder={dialog.folder}
          editing={dialog.app}
          onPlan={(input) => session.planEditApp(dialog.folder, input.templates, input.currencies)}
          onCreate={async (plan) => {
            const done = await session.installEditApp(plan, dialog.folder);
            if ('error' in done) return done.error;
            setDialog(null);
            setShown({ text: t('apps.edited', { name: plan.app.name, what: editCounts(plan) }), undo: () => void done.undo(), toast: true });
            return null;
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'newApp' && (
        <NewAppDialog
          folders={everyFolder(tree, spaces)}
          folder={dialog.folder}
          onPlan={(input, place) => session.planNewApp(input, place)}
          onCreate={async (plan, place) => {
            const done = await session.installNewApp(plan, place);
            if ('error' in done) return done.error;
            setDialog(null);
            setShown({ text: t('apps.setUp', { name: plan.app.name, what: appCounts(plan) }), undo: () => void done.undo(), toast: true });
            return null;
          }}
          onClose={closeDialog}
        />
      )}
      <input ref={importInput} type="file" accept={IMPORTABLE} hidden onChange={(event) => event.target.files?.[0] && void readImport(event.target.files[0])} />
      {importing && collections[importing.dir] && (
        <ImportDialog
          collection={collections[importing.dir]!}
          fileName={importing.fileName}
          header={importing.header}
          rows={importing.rows}
          sheets={importing.sheets?.map((s) => ({ name: s.name, rows: s.rows.length }))}
          sheet={importing.sheet}
          onPickSheet={(i) => {
            const picked = importing.sheets?.[i];
            if (picked) setImporting({ ...importing, sheet: i, header: picked.header, rows: picked.rows });
          }}
          targets={Object.fromEntries(Object.entries(collections).map(([dir, c]) => [dir, c.records]))}
          onChooseFile={() => chooseImport(importing.dir)}
          onImport={(plan) => session.importRecords(importing.dir, plan)}
          onClose={() => setImporting(null)}
        />
      )}
      {recordNew && collections[recordNew.dir] && (
        <RecordDialog collection={collections[recordNew.dir]!} record={null} values={recordNew.values} today={today} actions={collectionActions} onClose={() => setRecordNew(null)} />
      )}
      {recordOver && collections[recordOver.dir]?.records.some((r) => r.id === recordOver.id) && (
        <RecordDialog
          key={recordOver.id}
          collection={collections[recordOver.dir]!}
          record={collections[recordOver.dir]!.records.find((r) => r.id === recordOver.id)!}
          today={today}
          actions={collectionActions}
          onClose={() => setRecordOver(null)}
        />
      )}
      {/* On a phone the settings are pages in Browse. */}
      {dialog?.kind === 'settings' && !phone && (
        <Settings
          {...settingsValues}
          initial={dialog.section}
          onShown={(section) => setDialog((current) => (current?.kind === 'settings' ? { ...current, section } : current))}
          onClose={closeDialog}
        />
      )}
      {searching && !phone && <SearchWindow things={searchThings} actions={searchActions} onPick={openFound} onPickMessage={openHit} onClose={() => setSearching(false)} still={still} />}
      {chipPick && !phone && (
        <SearchWindow
          things={pickThings}
          actions={[]}
          onPick={pickChip}
          onClose={() => {
            chipPick.done(null);
            setChipPick(null);
          }}
          still={still}
          placeholder={t('chat.findItem')}
        />
      )}
      {dialog?.kind === 'removeSpace' &&
        (() => {
          const space = spaces.find((each) => each.id === dialog.id);
          return space && <RemoveSpaceDialog space={space} onRemove={(deleteFiles) => void removeSpace(space.id, deleteFiles)} onClose={closeDialog} />;
        })()}
      {dialog?.kind === 'phase' && (
        <PhaseDialog
          phase={dialog.phase}
          notes={Object.entries(titles)
            .map(([path, title]) => ({ path, title }))
            .sort((a, b) => a.title.localeCompare(b.title))}
          onSave={(patch) => {
            session.updatePhase(dialog.board, dialog.phase.id, patch);
            setDialog(null);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'renameFilter' && (
        <RenameDialog
          name={dialog.filter.name}
          onSave={async (name) => {
            if (name.trim()) session.saveFilter({ ...dialog.filter, name: name.trim() });
            return null;
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'saveFilter' && (
        <SaveFilterDialog
          // A name made of what it picks, until another is typed: "bug · Scrawl".
          name={filterName(dialog.choices, folderLabel, (id) => everyone?.people.find((person) => person.id === id)?.name ?? t('card.someone'))}
          onSave={(name, favorite) => {
            const from = dialog.from;
            const id = crypto.randomUUID();
            session.saveFilter({ ...dialog.choices, id, name });
            if (favorite) session.star({ filter: id }, true);
            // A new filter becomes the one saved; a label's view stays as it is.
            if (from === NEW_FILTER) {
              setNewFilter(EVERYTHING);
              void session.close(NEW_FILTER);
            }
            setDialog(null);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog
          folders={placesFor(dialog.path)}
          current={dirname(dialog.path)}
          onMove={(target) => {
            moveAndSay(dialog.path, target);
            setDialog(null);
          }}
          onCreate={async (name) => {
            const error = await session.moveToNewFolder(dialog.path, name);
            if (!error) setDialog(null);
            return error;
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'export' && (
        <ExportDialog name={tabTitles[dialog.path] ?? basename(dialog.path).replace(/\.md$/, '')} files={exportFiles} onPick={(format) => void runExport(dialog.path, format)} onClose={closeDialog} />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          name={nameOfItem(dialog.path)}
          folder={dirname(dialog.path)}
          folders={placesFor(dialog.path)}
          onSave={(name, folder) => saveNameAndPlace(dialog.path, name, folder)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'renameFile' && (
        <RenameDialog
          name={nameAndExt(basename(dialog.path))[0]}
          ext={nameAndExt(basename(dialog.path))[1]}
          onSave={async (name) => {
            const done = await session.renameFile(dialog.path, name, dialog.view);
            if ('error' in done) return done.error;
            readFilesAgain();
            return null;
          }}
          onClose={closeDialog}
        />
      )}
      {!phone && notice?.toast && (
        <div className={notice.sticky ? 'toast bad' : 'toast'} role={notice.sticky ? 'alert' : 'status'}>
          <span>
            {notice.title && <b>{notice.title}</b>} {notice.text}
          </span>
          {notice.undo && (
            <button type="button" className="undo" onClick={undoNotice}>
              {t('notice.undo')}
            </button>
          )}
          {notice.sticky && (
            <button type="button" className="x" aria-label={t('notice.close')} title={t('notice.close')} onClick={() => setShown(null)}>
              ×
            </button>
          )}
        </div>
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          places={dialog.places}
          after={dialog.after}
          brief={dialog.brief}
          action={dialog.action}
          danger={dialog.danger}
          onConfirm={() => {
            setDialog(null);
            dialog.run();
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'closePhase' && (
        <ClosePhaseDialog
          name={quote(dialog.phase.name)}
          cards={t('count.cards', { count: dialog.left })}
          phases={(boards[dialog.board]?.phases ?? []).filter((p) => p.id !== dialog.phase.id && p.state !== 'done')}
          next={boards[dialog.board] && nextOpenPhase(boards[dialog.board]!, dialog.phase.id)?.id}
          onConfirm={(leftovers) => {
            setDialog(null);
            session.closePhase(dialog.board, dialog.phase.id, leftovers);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'button' && (
        <ButtonDialog
          name={dialog.run.plan.action}
          record={dialog.record}
          lines={dialog.run.ask}
          onConfirm={() => {
            setDialog(null);
            runButton(dialog.run);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'askButton' && (
        <AskDialog
          name={dialog.name}
          ask={(given) => session.askButton(dialog.dir, dialog.id, dialog.name, given)}
          plan={(given) => session.planButton(dialog.dir, dialog.id, dialog.name, given)}
          ctx={{ records: collectionActions.records, collection: collectionActions.collection, openLink: collectionActions.openLink }}
          onRun={(run) => {
            setDialog(null);
            runButton(run);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'moveTask' &&
        (() => {
          const listTasks = tasks[dialog.list] ?? [];
          const task = listTasks.find((candidate) => candidate.id === dialog.id);
          if (!task) return null;
          return (
            <MoveTaskDialog
              title={task.title}
              subtasks={listTasks.length - removeTask(listTasks, task.id).length - 1}
              places={taskPlaces(dialog.list, task.id)}
              onMove={(place) => {
                session.moveTaskTo(dialog.list, task.id, place.list, place.section);
                setDialog(null);
              }}
              onClose={closeDialog}
            />
          );
        })()}
      {dialog?.kind === 'toTask' &&
        (() => {
          // The lists of the note's own space: a task links back to its note, and a link stays in its space.
          const places = allPlaces().filter((place) => spaceOf(place.list) === spaceOf(dialog.note));
          // A list in the note's own folder first, else Inbox.
          const near = places.findIndex((place) => place.section === null && dirname(place.list) === dirname(dialog.note));
          const inbox = places.findIndex((place) => place.list === INBOX_TASKS && place.section === null);
          return (
            <NewTaskDialog
              title={dialog.title}
              note={titles[dialog.note] ?? basename(dialog.note)}
              places={places}
              initial={near >= 0 ? near : Math.max(inbox, 0)}
              onAdd={(title, place) => {
                session.addTask(place.list, { title, description: dialog.description, section: place.section, note: dialog.note });
                setNotice(t('toTask.added', { list: listLabel(place.list) }));
                setDialog(null);
              }}
              onClose={closeDialog}
            />
          );
        })()}
      {dialog?.kind === 'toCard' &&
        (() => {
          // The boards of the note's own space, as for a task.
          const choices = Object.keys(boards)
            .filter((board) => spaceOf(board) === spaceOf(dialog.note))
            .sort()
            .map((board) => ({ board, label: boardName(board), folder: folderLabel(dirname(board)) }));
          // A board in the note's own folder first.
          const near = choices.findIndex((choice) => dirname(choice.board) === dirname(dialog.note));
          return (
            <NewCardDialog
              title={dialog.title}
              note={titles[dialog.note] ?? basename(dialog.note)}
              boards={choices}
              initial={Math.max(near, 0)}
              onAdd={(title, choice) => {
                session.addCard(choice.board, { title, description: dialog.description, note: dialog.note });
                setNotice(t('toCard.added', { board: boardLabel(choice.board) }));
                setDialog(null);
              }}
              onClose={closeDialog}
            />
          );
        })()}
      {dialog?.kind === 'chatTask' &&
        (() => {
          // Any list of any space; Inbox first.
          const places = allPlaces();
          const inbox = places.findIndex((place) => place.list === INBOX_TASKS && place.section === null);
          return (
            <NewTaskDialog
              title={dialog.title}
              note={dialog.from}
              places={places}
              initial={Math.max(inbox, 0)}
              onAdd={(title, place) => {
                session.addTask(place.list, { title, description: dialog.description, section: place.section });
                setNotice(t('toTask.added', { list: listLabel(place.list) }));
                setDialog(null);
              }}
              onClose={closeDialog}
            />
          );
        })()}
      {dialog?.kind === 'chatCard' && (
        <NewCardDialog
          title={dialog.title}
          note={dialog.from}
          boards={Object.keys(boards)
            .sort()
            .map((board) => ({ board, label: boardName(board), folder: folderLabel(dirname(board)) }))}
          initial={0}
          onAdd={(title, choice) => {
            session.addCard(choice.board, { title, description: dialog.description });
            setNotice(t('toCard.added', { board: boardLabel(choice.board) }));
            setDialog(null);
          }}
          onClose={closeDialog}
        />
      )}
      {/* A server whose key no longer works, asked to sign in to again by its spaces' sync. */}
      {sync.serverSignIn &&
        (phone ? (
          <ConnectServerSheet
            me={me}
            device={sync.device.name}
            again={sync.serverSignIn}
            onDone={(server) => {
              syncService.signedInToServer(server);
              syncService.doneServerSignIn(true);
            }}
            onClose={() => syncService.doneServerSignIn(false)}
          />
        ) : (
          <ConnectServerDialog
            me={me}
            device={sync.device.name}
            again={sync.serverSignIn}
            onDone={(server) => {
              syncService.signedInToServer(server);
              syncService.doneServerSignIn(true);
            }}
            onClose={() => syncService.doneServerSignIn(false)}
          />
        ))}
      {dialog?.kind === 'history' && (
        <HistoryDialog
          path={dialog.path}
          title={titles[dialog.path] ?? t('note.untitled')}
          current={session.textOf(dialog.path)}
          today={today}
          source={session}
          onRestore={(text) => {
            setDialog(null);
            void session.restoreVersion(dialog.path, text);
          }}
          onClose={closeDialog}
        />
      )}
      {labelsOpen !== null && !phone && <LabelsWindow path={labelsOpen} onClose={() => setLabelsOpen(null)} />}
      {menu && <ContextMenu at={menu.at} items={menu.items} head={menu.head} onClose={closeMenu} />}
    </div>
    </LabelsContext.Provider>
  );
}
