import { t } from '@scrawlnotes/i18n';
import {
  basename,
  boardName,
  type Card,
  cardBrief,
  cardRef,
  type CollectionTemplate,
  recordTitle,
  isLinkable,
  collectionCsv,
  parseCsv,
  collectionName,
  type Column,
  columnCards,
  addDays,
  dayOf,
  dirname,
  dueToday,
  filterTasks,
  filterFields,
  INBOX,
  inSpace,
  spaceOf,
  INBOX_TASKS,
  keyCount,
  keyOf,
  keysName,
  listName,
  openCardCount,
  openCount,
  parseCardRef,
  parseKeys,
  type Phase,
  phaseCards,
  dueCards,
  filterCards,
  removeSection,
  removeTask,
  type Section,
  type TaskFilter,
  type Template,
  type BoardLinks,
  type TrashItem,
  type TreeNode,
} from '@scrawlnotes/core';
import { type EditorStats, type LinkTap, sizeText } from '@scrawlnotes/editor';
import { type DragEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  ConfirmDialog,
  ContextMenu,
  FilterDialog,
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
  RenameDialog,
  type TaskPlaceChoice,
} from './dialogs';
import { type BoardActions, BoardView } from './Board';
import { FormatBar } from './FormatBar';
import { HistoryDialog, HistoryList, versionLabel, VersionView } from './History';
import { PhoneCardPage } from './CardPanel';
import { LinkActions, LinkSheet, PhoneFormatBar } from './PhoneNote';
import { DateSheet, QuickAdd, RecordSheet, TaskSheet } from './PhoneTasks';
import { Icon } from './Icon';
import { type KeysActions, KeysView } from './Keys';
import { type CollectionActions, CollectionView, RecordDialog, recordDeleteText } from './Collection';
import { PhoneNewRecord, PhoneRecordPage } from './PhoneCollection';
import { ImportDialog } from './Import';
import { folderLabel as folderLabelOf, setSpaceNames,
  boardLabel,
  boardOf,
  boardPathOf,
  collectionPathOf,
  collectionTab,
  filterOf,
  filterTab,
  folderOf,
  iconOf,
  isBoardPath,
  isKeysPath,
  isNote,
  isTaskListPath,
  keysPathOf,
  labelOf,
  listLabel,
  listOf,
  nameOf,
  pathOf,
  tasksOf,
  TODAY,
  TRASH,
  UPCOMING,
} from './items';
import { applySize, applyTheme, isPhone, loadMode, loadSize, loadTheme, type Mode, onSystemShade, saveMode, saveSize, saveTheme, shadeOfMode, systemShade } from './device';
import { Phone } from './Phone';
import { PhoneCreate } from './PhoneCreate';
import { Session, type SpaceView } from './session';
import { RemoveSpaceDialog, type Section as SettingsSection, Settings, type SettingsValues } from './Settings';
import { SyncService } from './sync';
import { reloadIntoUpdate, subscribeUpdate, updateReady } from './pwa';
import { SyncSheet, SyncStatus, syncWord } from './SyncViews';
import { Sidebar } from './Sidebar';
import { DueView, FilterView, type TaskActions, TaskList } from './Tasks';
import type { SpacePeople } from './People';
import { contentsText, quote } from './text';
import { TrashView } from './Trash';
import { Welcome } from './Welcome';
import { chooseSpaceFolder, isDesktop, openUrlOnDesktop, saveTextFile } from './storage';

type OpenDialog =
  // A folder's menu chooses the kind and the folder; Create alone leaves them to be chosen.
  | { kind: 'new'; start?: ItemKind; folder?: string }
  | { kind: 'phase'; board: string; phase: Phase }
  | { kind: 'move'; path: string }
  | { kind: 'rename'; path: string }
  | { kind: 'confirm'; title: string; message: string; action: string; danger: boolean; run: () => void }
  | { kind: 'removeSpace'; id: string }
  | { kind: 'history'; path: string }
  | { kind: 'moveTask'; list: string; id: string }
  | { kind: 'toTask'; note: string; title: string; description: string }
  | { kind: 'toCard'; note: string; title: string; description: string }
  | { kind: 'filter'; filter: TaskFilter | null; place?: string }
  | { kind: 'settings'; section?: SettingsSection; space?: string | null }
  | null;

// A tab being dragged to another place in the tab bar.
const TAB_DRAG_TYPE = 'application/x-scrawl-tab';

// Ctrl+N and Ctrl+W belong to the browser on the web, so Alt is used there.
const keys = (key: string) => `${isDesktop ? 'Ctrl' : 'Alt'}+${key}`;

function position(stats: EditorStats): string {
  if (stats.selectedChars === 0) return t('status.position', { line: stats.line, col: stats.col });
  const characters = t('count.characters', { count: stats.selectedChars });
  if (stats.cursors > 1) return t('status.selections', { selections: t('count.selections', { count: stats.cursors }), characters });
  if (stats.selectedLines > 1) return t('status.selectedLines', { lines: t('count.lines', { count: stats.selectedLines }), characters });
  return t('status.selected', { characters });
}

function folderPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    out.push(node.path);
    folderPaths(node.children ?? [], out);
  }
  return out;
}

/** The folders things can be made in: the inbox, the personal space's folders, then each space and its folders. */
function everyFolder(tree: TreeNode[], spaces: SpaceView[]): string[] {
  return [INBOX, ...folderPaths(tree).filter((path) => path !== INBOX), ...spaces.flatMap((space) => [inSpace(space.id, ''), ...folderPaths(space.tree)])];
}

/** The folders of one space, where something of it can be moved: a move to another space is not made by Move. */
function spaceFolders(space: string | null, tree: TreeNode[], spaces: SpaceView[]): string[] {
  if (!space) return folderPaths(tree);
  const nodes = spaces.find((each) => each.id === space)?.tree ?? [];
  return [inSpace(space, ''), ...folderPaths(nodes)];
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
  const [syncSheet, setSyncSheet] = useState(false);
  const [syncService] = useState(() => new SyncService(session));
  const sync = useSyncExternalStore(syncService.subscribe, syncService.getSnapshot);
  // Back from signing in in the browser: Settings opens at the space's sync, for its folder or what
  // went wrong; or at Spaces with Add space, to choose the new space's folder.
  useEffect(() => {
    if (sync.picking || sync.adding || sync.signInError) setDialog({ kind: 'settings', section: 'spaces' });
  }, [sync.picking, sync.adding, sync.signInError]);
  const update = useSyncExternalStore(subscribeUpdate, updateReady);
  const { ready, folder, defaultFolder, me, tree, spaces, tabs, active, titles, tasks, sections, boards, boardLooks, keys: keyFiles, keysLooks, collections, collectionLooks, filters, space, trash, saved, stats, format, source, recording, recordError } =
    useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  // A record open as a note is named in its tab by what the record is called; its file is named by its id.
  const tabTitles = useMemo(() => {
    const out = { ...titles };
    for (const collection of Object.values(collections)) for (const record of collection.records) out[record.path] = recordTitle(record);
    return out;
  }, [titles, collections]);
  // The mode and the theme chosen on this device, and the shade the device itself is in, for System.
  const [mode, setMode] = useState<Mode>(loadMode);
  const [theme, setTheme] = useState(loadTheme);
  const [sizes, setSizes] = useState(() => ({ phone: loadSize('phone'), computer: loadSize('computer') }));
  const [system, setSystem] = useState(systemShade);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // With nothing open the app asks what to create, until that is declined once.
  const [declined, setDeclined] = useState(false);
  // `target` is the sidebar row the menu was opened on, which stays marked while it is open.
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[]; target?: string; head?: MenuHead } | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  // On a narrow window the sidebar is a drawer, open or not.
  const [drawer, setDrawer] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  /** The card open in a panel beside its board's columns. */
  const [openCard, setOpenCard] = useState<{ board: string; id: string } | null>(null);
  // A record opened over whatever is on screen, from a task about it.
  const [recordOver, setRecordOver] = useState<{ dir: string; id: string } | null>(null);
  // On a phone a record opens as a page, asked for here; a new one is a form in a sheet; the
  // collection's page menu asks for its Fields. A record's page asks before its changes are lost.
  const [recordAsked, setRecordAsked] = useState<{ dir: string; id: string } | null>(null);
  const [newRecord, setNewRecord] = useState<{ dir: string; values?: Parameters<NonNullable<CollectionActions['create']>>[1] } | null>(null);
  const [collectionFields, setCollectionFields] = useState(0);
  const recordGuards = useRef(new Map<string, (then: () => void) => void>());
  /** What the status bar says about a view other than a note's: a keys file's counts, or its cursor. */
  const [viewStatus, setViewStatus] = useState<string[] | null>(null);
  /** Where a dragged tab would land: the gap before the tab at this index, or after the last one. */
  const [tabGap, setTabGap] = useState<number | null>(null);
  // Not before the first start has asked who the user is: nothing opens over that.
  const empty = ready && me !== null && tabs.length === 0;
  // A phone's Open says that nothing is open and offers Create itself.
  const showNew = dialog?.kind === 'new' || (!phone && empty && !declined && !dialog);
  const showingEditor = active !== null && isNote(active);

  useEffect(() => {
    void session.start(host.current!);
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

  useEffect(() => {
    if (!empty) setDeclined(false);
  }, [empty]);

  useEffect(() => {
    // Ctrl+N and Ctrl+W belong to the browser on the web, so Alt is used there.
    const onKey = (event: KeyboardEvent) => {
      const modifier = isDesktop ? (event.ctrlKey || event.metaKey) && !event.altKey : event.altKey && !event.ctrlKey;
      if (!modifier || event.shiftKey) return;
      if (event.code === 'KeyN') setDialog({ kind: 'new' });
      // The comma is a key of its own on some layouts (Turkish Q has it beside Enter), so it is
      // known by what it types too.
      else if (event.code === 'Comma' || event.key === ',') setDialog({ kind: 'settings' });
      else if (event.code === 'KeyW' && active) void session.close(active);
      else if (event.code === 'KeyT' && active && isNote(active)) startToTask();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, active]);

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

  // Something that happened, shown in the status bar for a moment.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    // Coming back to the window: another program may have changed the notes in the meantime.
    const onFocus = () => void session.rescan();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [session]);

  const closeDialog = () => {
    if (empty) setDeclined(true);
    setDialog(null);
  };
  // New things go to the folder of the tab on screen, or to the inbox.
  const newFolder = (active && folderOf(active)) || INBOX;
  // Or to the folder whose menu Create was opened from.
  const createIn = (dialog?.kind === 'new' && dialog.folder) || newFolder;
  const create = async (kind: ItemKind, choice: FolderChoice, name: string, template: Template, collectionTemplate: CollectionTemplate, links?: BoardLinks) => {
    // A new note is made to be written in: on a phone the keyboard stays for it.
    if (kind === 'note') session.holdKeyboard();
    const error = await session.create(kind, choice.folder, name, choice.create, template, collectionTemplate, links);
    if (!error) setDialog(null);
    else session.releaseKeyboard(false);
    return error;
  };

  // Nothing is deleted without asking first.
  const ask = (title: string, message: string, run: () => void, action = t('delete.action'), danger = true) =>
    setDialog({ kind: 'confirm', title, message, action, danger, run });
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
  const deleteTask = (list: string, id: string) => {
    const listTasks = tasks[list] ?? [];
    const task = listTasks.find((candidate) => candidate.id === id);
    if (!task) return;
    // A task goes together with its subtasks.
    const subtasks = listTasks.length - removeTask(listTasks, id).length - 1;
    const name = quote(task.title);
    const message =
      subtasks > 0
        ? t('delete.taskWithSubtasks', { name, subtasks: t('count.subtasks', { count: subtasks }) })
        : t('delete.taskText', { name });
    ask(t('delete.task'), message, () => session.removeTask(list, id));
  };
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
        folder: path === INBOX_TASKS ? INBOX : folderLabel(dirname(path)),
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

  // A filter's menu: change it, or delete it; its tasks stay where they are.
  const filterMenu = (event: MouseEvent, filter: TaskFilter) => openMenu(event, filterMenuItems(filter), filterTab(filter.id));
  const filterMenuItems = (filter: TaskFilter): MenuItem[] => [
    { label: t('filter.edit'), icon: 'filter', run: () => setDialog({ kind: 'filter', filter }) },
    {
      label: t('menu.delete'),
      icon: 'trash',
      danger: true,
      run: () => ask(t('delete.filter'), t('delete.filterText', { name: quote(filter.name) }), () => void session.removeFilter(filter.id)),
    },
  ];

  // A section goes together with its tasks, as in Todoist.
  const deleteSection = (list: string, section: Section) => {
    const whole = { sections: sections[list] ?? [], tasks: tasks[list] ?? [] };
    const count = whole.tasks.length - removeSection(whole, section.id).tasks.length;
    const name = quote(section.name);
    const message =
      count > 0 ? t('delete.sectionWithTasks', { name, tasks: t('count.tasks', { count }) }) : t('delete.sectionText', { name });
    ask(t('delete.section'), message, () => session.removeSection(list, section.id));
  };

  // A card, a column with cards, or a phase is not deleted without asking; closing a phase asks too.
  const deleteCard = (board: string, card: Card) =>
    ask(t('delete.card'), t('delete.cardText', { name: quote(card.title) }), () => session.removeCard(board, card.id));
  const deleteColumn = (board: string, column: Column) => {
    const total = boards[board]?.cards.filter((card) => card.column === column.id).length ?? 0;
    if (total === 0) return session.removeColumn(board, column.id);
    const message = t('delete.columnWithCards', { name: quote(column.name), cards: t('count.cards', { count: total }) });
    ask(t('delete.column'), message, () => session.removeColumn(board, column.id));
  };
  const deletePhase = (board: string, phase: Phase) =>
    ask(t('delete.phase'), t('delete.phaseText', { name: quote(phase.name) }), () => session.removePhase(board, phase.id));
  const closePhase = (board: string, phase: Phase) => {
    const whole = boards[board];
    if (!whole) return;
    const at = whole.phases.findIndex((p) => p.id === phase.id);
    const next = whole.phases.slice(at + 1).find((p) => p.state !== 'done');
    const left = phaseCards(whole, phase.id).filter((card) => {
      const kind = whole.columns.find((column) => column.id === card.column)?.kind;
      return kind !== 'done' && kind !== 'dropped';
    }).length;
    const name = quote(phase.name);
    const message =
      left === 0
        ? t('phase.closeText', { name })
        : next
          ? t('phase.closeLeftovers', { name, cards: t('count.cards', { count: left }), next: quote(next.name) })
          : t('phase.closeToBacklog', { name, cards: t('count.cards', { count: left }) });
    ask(t('phase.close'), message, () => session.closePhase(board, phase.id), t('phase.closeAction'), false);
  };

  const deleteForever = (item: TrashItem) =>
    ask(
      t('delete.forever'),
      t(item.kind === 'note' || item.kind === 'folder' ? 'delete.foreverWithFiles' : 'delete.foreverText', {
        name: quote(item.title),
      }),
      () => void session.deleteForever(item),
      t('delete.forever'),
    );
  const askEmptyTrash = () =>
    ask(t('delete.empty'), t('delete.emptyText', { count: trash.length }), () => void session.emptyTrash(), t('delete.empty'));

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
  useEffect(() => setSpaceNames(new Map(spaces.map((space) => [space.id, space.name]))), [spaces]);
  // A space's heading: a folder at its top, its settings, its place among the spaces, and the way
  // out of this device. The personal space stays first and stays, so it only has the first two.
  const spaceMenu = (event: MouseEvent, id: string | null, addFolder: () => void) => {
    const at = id ? spaces.findIndex((space) => space.id === id) : -1;
    const items: MenuItem[] = [
      { label: t('side.newFolder'), icon: 'folder', run: addFolder },
      { label: t('side.spaceSettings'), icon: 'settings', run: () => setDialog({ kind: 'settings', section: 'spaces', space: id }) },
    ];
    if (id) {
      items.push(
        { label: t('side.moveUp'), apart: true, run: () => void session.moveSpace(id, -1), ...(at === 0 && { disabled: t('side.first') }) },
        { label: t('side.moveDown'), run: () => void session.moveSpace(id, 1), ...(at === spaces.length - 1 && { disabled: t('side.last') }) },
        { label: t('side.removeSpace'), apart: true, run: () => askRemoveSpace(id) },
      );
    }
    openMenu(event, items, id ? `@${id}` : '@personal');
  };
  const askRemoveSpace = (id: string) => setDialog({ kind: 'removeSpace', id });
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
  const changeSpaceFolder = async (id: string) => {
    try {
      const to = await chooseSpaceFolder();
      if (!to) return;
      await syncService.forgetSpace(id);
      await session.moveSpaceCopy(id, to);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  // The menu of a note, a task list, a board, a keys file or a collection; the inbox's own list has none.
  const itemMenu = (event: MouseEvent, path: string) => path !== INBOX_TASKS && openMenu(event, itemMenuItems(path), path);
  const itemMenuItems = (path: string, history: (path: string) => void = (path) => void showHistory(path)): MenuItem[] => [
      { label: t('menu.moveTo'), icon: 'move', run: () => setDialog({ kind: 'move', path }) },
      { label: t('menu.rename'), icon: 'pen', run: () => setDialog({ kind: 'rename', path }) },
      // Only notes keep a history; a keys file keeps none, so that a password changed is gone.
      ...(isTaskListPath(path) || isBoardPath(path) || isKeysPath(path) || path in collections
        ? []
        : [{ label: t('menu.history'), icon: 'clock' as const, run: () => history(path) }]),
      // A collection goes out to a CSV file and comes in from one.
      ...(path in collections
        ? [
            { label: t('menu.exportCsv'), icon: 'export' as const, run: () => void exportCsv(path) },
            { label: t('menu.importCsv'), icon: 'import' as const, run: () => chooseCsv(path) },
          ]
        : []),
      { label: t('menu.delete'), icon: 'trash', danger: true, run: () => deleteItem(path) },
    ];
  /** On a phone a menu is an action sheet, with what it is about at its top. */
  const showSheet = (items: MenuItem[], head?: MenuHead) => setMenu({ at: { x: 0, y: 0 }, items, head });
  const folderLabel = (path: string) => (path === INBOX ? t('side.inbox') : folderLabelOf(path));
  /**
   * The menu of something open on a phone, from its page's ··· or from its row held, where it has
   * no tab and no status bar: what the sidebar's menu has, and on a note's page Markdown.
   */
  const phoneItemMenu = (id: string, page = false) => {
    const filter = filters.find((each) => each.id === filterOf(id));
    const icon = iconOf(id);
    const kinds = { note: 'create.note', tasks: 'create.tasks', board: 'create.board', keys: 'create.keys', collection: 'create.collection', filter: 'create.filter' } as const;
    const kind = t(kinds[icon as keyof typeof kinds] ?? 'create.note');
    const where = filter ? (filter.folder ?? INBOX) : (folderOf(id) ?? INBOX);
    const head: MenuHead = { icon, title: nameOf(id, tabTitles, filters), sub: t('phone.kindIn', { kind, folder: folderLabel(where) }) };
    if (filter) return showSheet(filterMenuItems(filter), head);
    const path = collectionPathOf(id) ?? pathOf(id);
    // A note's own page has Find and Markdown; its history opens as pages over it.
    const markdown: MenuItem[] = page && isNote(id)
      ? [
          { label: t('find.find'), icon: 'search', run: () => session.openFind() },
          { label: t('status.markdown'), icon: 'markdown', value: source ? t('phone.on') : t('phone.off'), run: () => session.setSource(!source) },
        ]
      : [];
    let items = path === null || path === INBOX_TASKS ? [] : itemMenuItems(path, setPhoneHistory);
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
    const parent = dirname(path);
    const sub = path === INBOX ? undefined : parent ? t('phone.kindIn', { kind: t('create.folder'), folder: folderLabel(parent) }) : t('create.folder');
    showSheet(folderMenuItems(path, addFolder), { icon: 'folder', title: folderLabel(path), sub });
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
  // A CSV file chosen for a collection opens the import window.
  const csvInput = useRef<HTMLInputElement>(null);
  const [csvFor, setCsvFor] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ dir: string; fileName: string; header: string[]; rows: string[][] } | null>(null);
  const chooseCsv = (dir: string) => {
    setCsvFor(dir);
    if (csvInput.current) {
      csvInput.current.value = '';
      csvInput.current.click();
    }
  };
  const readCsv = async (file: File) => {
    const dir = csvFor;
    if (!dir) return;
    const [header, ...rows] = parseCsv(await file.text());
    if (!header || rows.length === 0) return setNotice(t('import.empty'));
    setImporting({ dir, fileName: file.name, header, rows });
  };
  // The inbox is always there; it cannot be deleted. A new note shows at once, out from under the
  // drawer; anything else opens its Create or Filter window with the folder chosen, the drawer
  // closed so that what is made shows; a new folder is named in the sidebar, under the folder it goes in.
  const folderMenu = (event: MouseEvent, path: string, addFolder: () => void) => openMenu(event, folderMenuItems(path, addFolder), path);
  const folderMenuItems = (path: string, addFolder: () => void): MenuItem[] => {
    const createHere = (start: ItemKind) => () => {
      setDrawer(false);
      setDialog({ kind: 'new', start, folder: path });
    };
    return [
      {
        label: t('menu.newNoteHere'),
        icon: 'note',
        run: () => {
          setDrawer(false);
          session.holdKeyboard();
          void session.newNote(path);
        },
      },
      { label: t('menu.newListHere'), icon: 'tasks', run: createHere('tasks') },
      { label: t('menu.newBoardHere'), icon: 'board', run: createHere('board') },
      { label: t('menu.newKeysHere'), icon: 'keys', run: createHere('keys') },
      { label: t('menu.newCollectionHere'), icon: 'collection', run: createHere('collection') },
      {
        label: t('menu.newFilterHere'),
        icon: 'filter',
        run: () => {
          setDrawer(false);
          setDialog({ kind: 'filter', filter: null, place: path });
        },
      },
      ...(path === INBOX
        ? []
        : [
            { label: t('menu.newFolderHere'), icon: 'folder' as const, run: addFolder, apart: true },
            { label: t('menu.deleteFolder'), icon: 'trash' as const, danger: true, run: () => deleteFolder(path), apart: true },
          ]),
    ];
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  // An image, file or recording in a note has its right-click menu drawn like the others; on a
  // phone, where holding it opens it, it says what it is and how large.
  useEffect(() => {
    const icons = { open: 'open', reveal: 'folder', delete: 'trash' } as const;
    const kinds = { image: ['image', 'phone.image'], file: ['file', 'phone.file'], audio: ['audio', 'phone.recording'] } as const;
    session.showMenu = (at, actions, about) => {
      const items: MenuItem[] = actions.map((action) => ({ label: action.label, run: action.run, icon: icons[action.kind], danger: action.kind === 'delete' }));
      const head: MenuHead | undefined = about && {
        icon: kinds[about.kind][0],
        title: about.name,
        sub: [t(kinds[about.kind][1]), about.size === undefined ? '' : sizeText(about.size)].filter(Boolean).join(' · '),
      };
      setMenu({ at, items, head });
    };
    // A link tapped in a note, on a phone.
    session.linkTap = setLinkTap;
    return () => {
      session.showMenu = null;
      session.linkTap = null;
    };
  }, [session]);
  const [linkTap, setLinkTap] = useState<LinkTap | null>(null);
  const closeLinkTap = useCallback(() => setLinkTap(null), []);
  /** A link's address being changed, or a link being made, on a phone. */
  const [linkEdit, setLinkEdit] = useState<{ url: string; linked: boolean } | null>(null);
  /** The note whose history a phone is asked to show. */
  const [phoneHistory, setPhoneHistory] = useState<string | null>(null);
  const openHref = (href: string) => (isDesktop ? void openUrlOnDesktop(href).catch(() => undefined) : void window.open(href, '_blank', 'noopener'));

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
  const tabClass = (id: string, i: number) =>
    [
      'tab',
      id === active && 'on',
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
  const [taskPicker, setTaskPicker] = useState<{ kind: 'date' | 'record'; list: string; id: string } | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ list: string; section: string | null; due: string | null } | null>(null);
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
    if (id === UPCOMING) return setQuickAdd({ list: INBOX_TASKS, section: null, due: addDays(today, 1) });
    const list = listOf(id);
    if (list !== null) setQuickAdd({ list, section: null, due: null });
  };
  /** The people of the space a path is in, to give a task or a card to; none in the personal space, which is only you. */
  const peopleOf = (path: string): SpacePeople | null => {
    const space = spaces.find((each) => each.id === spaceOf(path));
    return space ? { name: space.name, people: space.people, ...(me && { me: me.id }) } : null;
  };
  const taskActions: TaskActions = {
    add: (target, input) => session.addTask(target, input),
    update: (target, id, change) => session.updateTask(target, id, change),
    setDone: (target, id, done) => session.setTaskDone(target, id, done),
    remove: deleteTask,
    menu: (event, items, head) => (phone ? showSheet(items, head) : openMenu(event, items)),
    ...(phone && {
      open: (list: string, id: string, subtask = false) => setTaskSheet({ list, id, subtask }),
      pickDate: (list: string, id: string) => setTaskPicker({ kind: 'date', list, id }),
      pickRecord: (list: string, id: string) => setTaskPicker({ kind: 'record', list, id }),
      quickAdd: (list: string, section: string | null, due?: string) => setQuickAdd({ list, section, due: due ?? null }),
    }),
    addSection: (list, name) => session.addSection(list, name),
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
    finishCard: (board, id, column) => session.finishCard(board, id, column),
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
    addRecord: (dir, input) => session.addRecord(dir, input),
    updateRecord: (dir, id, patch) => session.updateRecord(dir, id, patch),
    removeRecord: (dir, record) => ask(t('delete.record'), recordDeleteText(record), () => void session.trashRecord(dir, record)),
    openNote: (path) => void session.open(path),
    // The desktop app hands an address to the system; in a browser it opens beside the app.
    openLink: (href) => (isDesktop ? void openUrlOnDesktop(href).catch(() => undefined) : void window.open(href, '_blank', 'noopener')),
    menu: (event, items, head) => (phone ? showSheet(items, head) : openMenu(event, items)),
    ...(phone && {
      show: (dir: string, id: string) => setRecordAsked({ dir, id }),
      create: (dir: string, values?: Parameters<NonNullable<CollectionActions['create']>>[1]) => setNewRecord({ dir, values }),
    }),
    ask: (title, message, run, action) => ask(title, message, run, action),
    records: (dir) => collections[dir]?.records ?? null,
    collection: (dir) => collections[dir] ?? null,
    collections: () => Object.values(collections),
    changeSchema: (dir, change) => session.changeSchema(dir, change),
    saveFields: (dir, schema, renames) => session.saveFields(dir, schema, renames),
    createLinked: (dir, target) => session.createLinked(dir, target),
    boards: () => boards,
    tasks: () => tasks,
    addTask: (list, input) => session.addTask(list, input),
    setTaskDone: (list, id, done) => session.setTaskDone(list, id, done),
    // Made below, with the board's actions, which open records through these.
    get cardActions() {
      return boardActions;
    },
    editor: (home, parent, doc, onChange) => session.openEditor(home, parent, doc, onChange),
  };
  const boardActions: BoardActions = {
    addCard: (board, input) => session.addCard(board, input),
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
    addComment: (board, id, text) => session.addComment(board, id, text),
    editComment: (board, id, comment, text) => session.editComment(board, id, comment, text),
    removeComment: (board, id, comment) => session.removeComment(board, id, comment),
    copyBrief: (board, id) => void copyBrief(board, id),
    openCard: (board, id) => setOpenCard({ board, id }),
    editor: (home, parent, doc, onChange, hint) => session.openEditor(home, parent, doc, onChange, hint),
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
  const dueNow = dueToday(tasks, today);
  const dueCardsNow = dueCards(boards).filter((d) => d.card.due! <= today).length;
  const counts: Record<string, number> = { [TODAY]: dueNow.overdue.length + dueNow.today.length + dueCardsNow, [TRASH]: trash.length };
  for (const [list, listTasks] of Object.entries(tasks)) counts[tasksOf(list)] = openCount(listTasks);
  for (const [path, board] of Object.entries(boards)) counts[boardOf(path)] = openCardCount(board);
  for (const [dir, collection] of Object.entries(collections)) counts[collectionTab(dir)] = collection.records.length;
  for (const filter of filters) {
    counts[filterTab(filter.id)] =
      filterTasks(filter, tasks, today, me?.id).reduce((sum, group) => sum + group.tasks.length, 0) +
      filterCards(filter, boards, today, me?.id).reduce((sum, group) => sum + group.cards.length, 0);
  }
  const list = active ? listOf(active) : null;
  const boardPath = active ? boardPathOf(active) : null;
  const board = boardPath !== null ? boards[boardPath] : undefined;
  const keysPath = active ? keysPathOf(active) : null;
  const keysText = keysPath !== null ? keyFiles[keysPath] : undefined;
  const collectionPath = active ? collectionPathOf(active) : null;
  const collection = collectionPath !== null ? collections[collectionPath] : undefined;
  const isDueView = active === TODAY || active === UPCOMING;
  const filterId = active ? filterOf(active) : null;
  const activeFilter = filters.find((filter) => filter.id === filterId) ?? null;
  // Filters look in the top-level folders, with everything inside them; the inbox comes first.
  const topFolders = [INBOX, ...tree.filter((node) => node.kind === 'folder' && node.path !== INBOX).map((node) => node.path)];

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
        onLink={() => setLinkEdit({ url: format?.link?.url ?? '', linked: !!format?.link })}
        onImage={() => session.pickImage()}
        onRecord={() => void session.startRecording()}
        onStop={() => session.stopRecording()}
        onToTask={startToTask}
        onToCard={startToCard}
      />
    )}
    {showingEditor && !phone && (
      <FormatBar
        format={format}
        onFormat={(action) => session.format(action)}
        onLink={(url) => session.setLink(url)}
        recording={recording}
        recordError={recordError}
        onRecord={() => void session.startRecording()}
        onStop={() => session.stopRecording()}
        onToTask={startToTask}
        onToCard={startToCard}
        toTaskKeys={keys('T')}
      />
    )}
    <div className="editor" ref={host} hidden={!showingEditor} />
    {list !== null && <TaskList key={list} list={list} tasks={tasks[list] ?? []} sections={sections[list] ?? []} today={today} actions={taskActions} />}
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
    {!phone && isDueView && <DueView kind={active === TODAY ? 'today' : 'upcoming'} lists={tasks} boards={boards} today={today} actions={taskActions} />}
    {activeFilter && (
      <FilterView
        filter={activeFilter}
        lists={tasks}
        boards={boards}
        today={today}
        {...(me && { me: me.id })}
        actions={taskActions}
        onEdit={() => setDialog({ kind: 'filter', filter: activeFilter })}
      />
    )}
    {!phone && active === TRASH && (
      <TrashView
        items={trash}
        today={today}
        onRestore={(item) => void session.restore(item)}
        onDelete={deleteForever}
        onEmpty={askEmptyTrash}
      />
    )}
    {!phone && !showingEditor && list === null && !board && keysText === undefined && !collection && !isDueView && !activeFilter && active !== TRASH && (
      <section className="placeholder">
        {active ? (
          <>
            <h1>{labelOf(active, tabTitles, filters)}</h1>
            <p>{t('board.placeholder')}</p>
          </>
        ) : (
          empty && (
            <>
              <p>{t('empty.nothingOpen')}</p>
              <button type="button" className="primary" onClick={() => setDialog({ kind: 'new' })}>
                {t('empty.create')}
              </button>
            </>
          )
        )}
      </section>
    )}
    </>
  );

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
    me,
    onSaveProfile: (name, email) => session.saveProfile(name, email),
    spaceName: space.name,
    onRenameSpace: (name) => session.renameSpace(name),
    spaces,
    onRenameSpaceById: (id, name) => session.renameSpaceById(id, name),
    onAddSpace: (name, source, id) => session.addSpace(name, source, id),
    onRemoveSpace: (id, deleteFiles) => void removeSpace(id, deleteFiles),
    onMoveSpace: (id, by) => void session.moveSpace(id, by),
    onPersonActive: (space, person, active) => session.setPersonActive(space, person, active),
    onChangeSpaceFolder: isDesktop ? (id) => void changeSpaceFolder(id) : undefined,
    initialSpace: dialog?.kind === 'settings' ? dialog.space : undefined,
    addingAs: sync.adding,
    folder,
    defaultFolder,
    // A folder that holds a space, or is inside one, is refused with a word why.
    onChangeFolder: isDesktop ? () => void session.chooseFolder().catch((error: unknown) => setNotice(error instanceof Error ? error.message : t('error.spaceNests'))) : undefined,
    onUseDefaultFolder: isDesktop ? () => void session.useDefaultFolder() : undefined,
    sync,
    syncService,
  };

  return (
    <div className={phone ? 'app phone-app' : drawer ? 'app drawer-open' : 'app'}>
      {ready && !me && <Welcome onDone={(name, email) => session.saveProfile(name, email)} />}
      {phone ? (
        <>
          <Phone
            ready={ready}
            tabs={tabs}
            active={active}
            titles={tabTitles}
            tree={tree}
            filters={filters}
            counts={counts}
            item={itemLayer}
            dueView={(kind) => <DueView kind={kind} lists={tasks} boards={boards} today={today} actions={taskActions} bare />}
            canAdd={(id) => listOf(id) !== null || boardPathOf(id) !== null || (keysPathOf(id) !== null && keysLooks[keysPathOf(id)!]?.view !== 'text') || (collectionPathOf(id) !== null && (collections[collectionPathOf(id)!]?.schema.fields.length ?? 0) > 0)}
            onAdd={phoneAdd}
            trashView={<TrashView items={trash} today={today} onRestore={(item) => void session.restore(item)} onDelete={deleteForever} onEmpty={askEmptyTrash} />}
            syncWord={syncWord(sync)}
            notice={notice}
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
            onSync={() => (sync.connection ? setSyncSheet(true) : setDialog({ kind: 'settings', section: 'spaces' }))}
            settings={{
              values: settingsValues,
              open: dialog?.kind === 'settings' ? { section: dialog.section } : null,
              onShown: () => setDialog(null),
            }}
            onNewFolder={(name, parent) => session.newFolder(name, parent)}
            onItemMenu={phoneItemMenu}
            onFolderMenu={phoneFolderMenu}
            menuOpen={menu !== null}
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
            onDone={() => {
              session.closeFind();
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
                      run: () =>
                        ask(t('delete.card'), t('delete.cardText', { name: quote(card.title) }), () => {
                          setOpenCard(null);
                          void session.removeCard(board, id);
                        }),
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
              onOpen={() => openHref(linkTap.href)}
              onEdit={() => {
                session.placeCursor(linkTap.pos);
                setLinkEdit({ url: linkTap.href, linked: true });
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
          {taskPicker &&
            (() => {
              const task = tasks[taskPicker.list]?.find((each) => each.id === taskPicker.id);
              if (!task) return null;
              const close = () => setTaskPicker(null);
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
          {quickAdd && (
            <QuickAdd
              initial={quickAdd}
              places={allPlaces()}
              today={today}
              recordChoices={taskActions.recordChoices}
              recordName={taskActions.recordTitle}
              onAdd={(list, task) => session.addTask(list, task)}
              onClose={() => setQuickAdd(null)}
            />
          )}
          {linkEdit && (
            <LinkSheet
              url={linkEdit.url}
              linked={linkEdit.linked}
              onApply={(url) => {
                setLinkEdit(null);
                session.setLink(url);
              }}
              onClose={() => setLinkEdit(null)}
            />
          )}
          {syncSheet && (
            <SyncSheet
              sync={sync}
              onClose={() => setSyncSheet(false)}
              onSyncNow={(space) => syncService.syncNow(space)}
              onSettings={(space) => setDialog({ kind: 'settings', section: 'spaces', space })}
              onSignIn={() => (syncService.cloud().redirects ? void syncService.leaveToSignIn('again') : setDialog({ kind: 'settings', section: 'spaces' }))}
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
          onOpen={(id) => {
            setDrawer(false);
            void session.open(id);
          }}
          onTrash={deleteItem}
          onMove={(path, target) => void session.move(path, target)}
          onNewFolder={(name, parent) => session.newFolder(name, parent)}
          onItemMenu={itemMenu}
          onFolderMenu={folderMenu}
          filters={filters}
          onFilterMenu={filterMenu}
          menuTarget={menu?.target ?? null}
          spaces={spaces}
          personalName={space.name ?? t('settings.personal')}
          onSpaceMenu={spaceMenu}
          onSettings={() => {
            setDrawer(false);
            setDialog({ kind: 'settings' });
          }}
          settingsOpen={dialog?.kind === 'settings'}
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
                onDragStart={(event) => {
                  event.dataTransfer.setData(TAB_DRAG_TYPE, id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDraggedTab(id);
                }}
                onDragEnd={() => {
                  setDraggedTab(null);
                  setTabGap(null);
                }}
                onMouseDown={(event) => event.button === 1 && void session.close(id)}
                onContextMenu={(event) => {
                  const path = pathOf(id);
                  if (path) itemMenu(event, path);
                }}
              >
                <button type="button" className="tab-title" onClick={() => void session.open(id)}>
                  <Icon name={iconOf(id)} />
                  <span>{labelOf(id, tabTitles, filters)}</span>
                </button>
                {/* The dot marks a note that has not been filed yet; it gives way to the close button on hover. */}
                <button
                  type="button"
                  className="tab-close"
                  title={t('tab.close', { keys: keys('W') })}
                  onClick={() => void session.close(id)}
                >
                  {isNote(id) && dirname(id) === INBOX && <i className="tab-dot" />}
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
          <footer className="status">
            {stats && <span>{position(stats)}</span>}
            {stats && <span>{t('count.characters', { count: stats.chars })}</span>}
            {(keysText !== undefined || collection) && viewStatus?.map((part, i) => <span key={i}>{part}</span>)}
            {notice && (
              <span className="notice" role="status">
                {notice}
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
            <span className="push">{!ready ? t('status.opening') : saved ? t('status.saved') : t('status.saving')}</span>
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
              // In the browser the page goes to Microsoft and back; on the desktop it is done in Settings, which waits for the system browser.
              onSignIn={() => (syncService.cloud().redirects ? void syncService.leaveToSignIn('again') : setDialog({ kind: 'settings', section: 'spaces' }))}
              onOpenCopy={(path) => void session.open(path)}
            />
          </footer>
        </main>
        </>
      )}

      {showNew && phone && (
        <PhoneCreate
          key={dialog?.kind === 'new' ? `${dialog.start ?? ''}:${dialog.folder ?? ''}` : ''}
          start={(dialog?.kind === 'new' && dialog.start) || null}
          folders={everyFolder(tree, spaces)}
          folder={createIn}
          collections={Object.keys(collections)}
          onCreate={create}
          onFilter={() => setDialog({ kind: 'filter', filter: null, place: createIn })}
          onClose={closeDialog}
        />
      )}
      {showNew && !phone && (
        <NewDialog
          // Open already, as it is in an empty space, it starts again with what a folder's menu chose.
          key={dialog?.kind === 'new' ? `${dialog.start ?? ''}:${dialog.folder ?? ''}` : ''}
          start={(dialog?.kind === 'new' && dialog.start) || null}
          folders={everyFolder(tree, spaces)}
          folder={createIn}
          collections={Object.keys(collections)}
          onCreate={create}
          onFilter={() => setDialog({ kind: 'filter', filter: null, place: createIn })}
          onClose={closeDialog}
        />
      )}
      <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => event.target.files?.[0] && void readCsv(event.target.files[0])} />
      {importing && collections[importing.dir] && (
        <ImportDialog
          collection={collections[importing.dir]!}
          fileName={importing.fileName}
          header={importing.header}
          rows={importing.rows}
          targets={Object.fromEntries(Object.entries(collections).map(([dir, c]) => [dir, c.records]))}
          onChooseFile={() => chooseCsv(importing.dir)}
          onImport={(plan) => session.importRecords(importing.dir, plan)}
          onClose={() => setImporting(null)}
        />
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
      {dialog?.kind === 'settings' && !phone && <Settings {...settingsValues} initial={dialog.section} onClose={closeDialog} />}
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
      {dialog?.kind === 'filter' && (
        <FilterDialog
          filter={dialog.filter}
          folders={topFolders}
          places={[INBOX, ...folderPaths(tree).filter((path) => path !== INBOX)]}
          place={dialog.place ?? newFolder}
          count={(choices) =>
            filterTasks(choices, tasks, today, me?.id).reduce((sum, group) => sum + group.tasks.length, 0) +
            filterCards(choices, boards, today, me?.id).reduce((sum, group) => sum + group.cards.length, 0)
          }
          withPeople={spaces.length > 0}
          fields={(choices) => filterFields(choices, boards)}
          records={(dir) => collections[dir]?.records ?? null}
          onSave={(filter) => {
            session.saveFilter(filter);
            setDialog(null);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog
          folders={spaceFolders(spaceOf(dialog.path), tree, spaces)}
          current={dirname(dialog.path)}
          onMove={(target) => {
            void session.move(dialog.path, target);
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
      {dialog?.kind === 'rename' && (
        <RenameDialog
          name={
            isTaskListPath(dialog.path)
              ? listName(dialog.path)
              : isBoardPath(dialog.path)
                ? boardName(dialog.path)
                : isKeysPath(dialog.path)
                  ? keysName(dialog.path)
                  : dialog.path in collections
                    ? collectionName(dialog.path)
                    : (titles[dialog.path] ?? '')
          }
          onRename={(name) => session.rename(dialog.path, name)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          action={dialog.action}
          danger={dialog.danger}
          onConfirm={() => {
            setDialog(null);
            dialog.run();
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
          // A list in the note's own folder first, else the inbox's.
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
      {menu && <ContextMenu at={menu.at} items={menu.items} head={menu.head} onClose={closeMenu} />}
    </div>
  );
}
