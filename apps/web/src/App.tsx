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
  collectionName,
  type Column,
  columnCards,
  dayOf,
  dirname,
  dueToday,
  filterTasks,
  filterFields,
  INBOX,
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
import type { EditorStats } from '@scrawlnotes/editor';
import { type DragEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ConfirmDialog,
  ContextMenu,
  FilterDialog,
  type FolderChoice,
  type ItemKind,
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
import { HistoryDialog } from './History';
import { Icon } from './Icon';
import { type KeysActions, KeysView } from './Keys';
import { type CollectionActions, CollectionView, RecordDialog, recordDeleteText } from './Collection';
import {
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
  pathOf,
  tasksOf,
  TODAY,
  TRASH,
  UPCOMING,
} from './items';
import { applyTheme, loadMode, loadTheme, type Mode, onSystemShade, saveMode, saveTheme, shadeOfMode, systemShade } from './device';
import { Session } from './session';
import { type Section as SettingsSection, Settings } from './Settings';
import { SyncService } from './sync';
import { SyncStatus } from './SyncViews';
import { Sidebar } from './Sidebar';
import { DueView, FilterView, type TaskActions, TaskList } from './Tasks';
import { contentsText, quote } from './text';
import { TrashView } from './Trash';
import { isDesktop, openUrlOnDesktop } from './storage';

type OpenDialog =
  | { kind: 'new' }
  | { kind: 'phase'; board: string; phase: Phase }
  | { kind: 'move'; path: string }
  | { kind: 'rename'; path: string }
  | { kind: 'confirm'; title: string; message: string; action: string; run: () => void }
  | { kind: 'history'; path: string }
  | { kind: 'moveTask'; list: string; id: string }
  | { kind: 'toTask'; note: string; title: string; description: string }
  | { kind: 'toCard'; note: string; title: string; description: string }
  | { kind: 'filter'; filter: TaskFilter | null }
  | { kind: 'settings'; section?: SettingsSection }
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
  const [session] = useState(() => new Session());
  const [syncService] = useState(() => new SyncService(session));
  const sync = useSyncExternalStore(syncService.subscribe, syncService.getSnapshot);
  const { ready, needsFolder, folder, tree, tabs, active, titles, tasks, sections, boards, boardLooks, keys: keyFiles, keysLooks, collections, collectionLooks, filters, space, trash, saved, stats, format, source, recording, recordError } =
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
  const [system, setSystem] = useState(systemShade);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // With nothing open the app asks what to create, until that is declined once.
  const [declined, setDeclined] = useState(false);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  // On a narrow window the sidebar is a drawer, open or not.
  const [drawer, setDrawer] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  /** The card open in a panel beside its board's columns. */
  const [openCard, setOpenCard] = useState<{ board: string; id: string } | null>(null);
  // A record opened over whatever is on screen, from a task about it.
  const [recordOver, setRecordOver] = useState<{ dir: string; id: string } | null>(null);
  /** What the status bar says about a view other than a note's: a keys file's counts, or its cursor. */
  const [viewStatus, setViewStatus] = useState<string[] | null>(null);
  /** Where a dragged tab would land: the gap before the tab at this index, or after the last one. */
  const [tabGap, setTabGap] = useState<number | null>(null);
  const empty = ready && !needsFolder && tabs.length === 0;
  const showNew = dialog?.kind === 'new' || (empty && !declined && !dialog);
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
  const create = async (kind: ItemKind, choice: FolderChoice, name: string, template: Template, collectionTemplate: CollectionTemplate, links?: BoardLinks) => {
    const error = await session.create(kind, choice.folder, name, choice.create, template, collectionTemplate, links);
    if (!error) setDialog(null);
    return error;
  };

  // Nothing is deleted without asking first.
  const ask = (title: string, message: string, run: () => void, action = t('delete.action')) =>
    setDialog({ kind: 'confirm', title, message, action, run });
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
    return allPlaces((path, section) => path === list && here === section);
  };
  /** Every list, at its top level and in each of its sections. */
  const allPlaces = (isHere: (list: string, section: string | null) => boolean = () => false): TaskPlaceChoice[] =>
    Object.keys(tasks).flatMap((path) => [
      {
        list: path,
        section: null,
        label: listName(path),
        folder: path === INBOX_TASKS ? INBOX : basename(dirname(path)),
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
  const filterMenu = (event: MouseEvent, filter: TaskFilter) =>
    openMenu(event, [
      { label: t('filter.edit'), run: () => setDialog({ kind: 'filter', filter }) },
      {
        label: t('menu.delete'),
        run: () =>
          ask(t('delete.filter'), t('delete.filterText', { name: quote(filter.name) }), () => void session.removeFilter(filter.id)),
      },
    ]);

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
    ask(t('phase.close'), message, () => session.closePhase(board, phase.id), t('phase.closeAction'));
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

  const openMenu = (event: MouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, items });
  };
  // The menu of a note, a task list, a board, a keys file or a collection; the inbox's own list has none.
  const itemMenu = (event: MouseEvent, path: string) =>
    path !== INBOX_TASKS &&
    openMenu(event, [
      { label: t('menu.moveTo'), run: () => setDialog({ kind: 'move', path }) },
      { label: t('menu.rename'), run: () => setDialog({ kind: 'rename', path }) },
      // Only notes keep a history; a keys file keeps none, so that a password changed is gone.
      ...(isTaskListPath(path) || isBoardPath(path) || isKeysPath(path) || path in collections
        ? []
        : [{ label: t('menu.history'), run: () => void showHistory(path) }]),
      { label: t('menu.delete'), run: () => deleteItem(path) },
    ]);
  // The inbox is always there; it cannot be deleted. A new note shows at once, out from under the drawer.
  const folderMenu = (event: MouseEvent, path: string) =>
    openMenu(event, [
      {
        label: t('menu.newNoteHere'),
        run: () => {
          setDrawer(false);
          void session.newNote(path);
        },
      },
      ...(path === INBOX ? [] : [{ label: t('menu.deleteFolder'), run: () => deleteFolder(path) }]),
    ]);
  const closeMenu = useCallback(() => setMenu(null), []);

  // An image, file or recording in a note has its right-click menu drawn like the others.
  useEffect(() => {
    session.showMenu = (at, items) => setMenu({ at, items });
    return () => {
      session.showMenu = null;
    };
  }, [session]);

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
  const taskActions: TaskActions = {
    add: (target, input) => session.addTask(target, input),
    update: (target, id, change) => session.updateTask(target, id, change),
    setDone: (target, id, done) => session.setTaskDone(target, id, done),
    remove: deleteTask,
    menu: openMenu,
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
    openRecord: (collection, id) => setRecordOver({ dir: collection, id }),
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
    menu: openMenu,
    ask: (title, message, run, action) => ask(title, message, run, action),
    records: (dir) => collections[dir]?.records ?? null,
    collection: (dir) => collections[dir] ?? null,
    collections: () => Object.values(collections),
    changeSchema: (dir, change) => session.changeSchema(dir, change),
    saveFields: (dir, schema, renames) => session.saveFields(dir, schema, renames),
    boards: () => boards,
    tasks: () => tasks,
    addTask: (list, input) => session.addTask(list, input),
    setTaskDone: (list, id, done) => session.setTaskDone(list, id, done),
    // Made below, with the board's actions, which open records through these.
    get cardActions() {
      return boardActions;
    },
    editor: (parent, doc, onChange) => session.openEditor(parent, doc, onChange),
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
    addToToday: (board, id) => {
      const card = boards[board]?.cards.find((candidate) => candidate.id === id);
      if (!card) return;
      session.addTask(INBOX_TASKS, { title: card.title, due: today, card: cardRef(board, id) });
      setNotice(t('card.addedToToday'));
    },
    editor: (parent, doc, onChange) => session.openEditor(parent, doc, onChange),
    viewer: (parent, doc) => session.openViewer(parent, doc),
    menu: openMenu,
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
    ask: (title, message, run, action) => ask(title, message, run, action),
    saveBoardFields: (board, fields, renames) => session.setBoardFields(board, fields, renames),
  };
  const keysActions: KeysActions = {
    change: (path, text) => session.changeKeys(path, text),
    menu: openMenu,
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
      filterTasks(filter, tasks, today).reduce((sum, group) => sum + group.tasks.length, 0) +
      filterCards(filter, boards, today).reduce((sum, group) => sum + group.cards.length, 0);
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

  return (
    <div className={drawer ? 'app drawer-open' : 'app'}>
      {needsFolder && (
        <div className="welcome">
          <h1>{t('welcome.title')}</h1>
          <p>{t('welcome.text')}</p>
          <button type="button" onClick={() => void session.chooseFolder()}>
            {t('welcome.choose')}
          </button>
        </div>
      )}
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
        onNewFolder={(name) => session.newFolder(name)}
        onItemMenu={itemMenu}
        onFolderMenu={folderMenu}
        filters={filters}
        onFilterMenu={filterMenu}
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
        {showingEditor && (
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
          />
        )}
        {isDueView && <DueView kind={active === TODAY ? 'today' : 'upcoming'} lists={tasks} boards={boards} today={today} actions={taskActions} />}
        {activeFilter && (
          <FilterView
            filter={activeFilter}
            lists={tasks}
            boards={boards}
            today={today}
            actions={taskActions}
            onEdit={() => setDialog({ kind: 'filter', filter: activeFilter })}
          />
        )}
        {active === TRASH && (
          <TrashView
            items={trash}
            today={today}
            onRestore={(item) => void session.restore(item)}
            onDelete={deleteForever}
            onEmpty={askEmptyTrash}
          />
        )}
        {!showingEditor && list === null && !board && keysText === undefined && !collection && !isDueView && !activeFilter && active !== TRASH && (
          <section className="placeholder">
            {active ? (
              <>
                <h1>{labelOf(active, tabTitles, filters)}</h1>
                <p>{t('board.placeholder')}</p>
              </>
            ) : (
              empty && <p>{t('empty.nothingOpen', { keys: keys('N') })}</p>
            )}
          </section>
        )}
        <footer className="status">
          {stats && <span>{position(stats)}</span>}
          {stats && <span>{t('count.characters', { count: stats.chars })}</span>}
          {(keysText !== undefined || collection) && viewStatus?.map((part, i) => <span key={i}>{part}</span>)}
          {notice && (
            <span className="notice" role="status">
              {notice}
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
            onSyncNow={() => syncService.syncNow()}
            onSettings={() => setDialog({ kind: 'settings', section: 'spaces' })}
            onOpenCopy={(path) => void session.open(path)}
          />
        </footer>
      </main>

      {showNew && (
        <NewDialog
          folders={[INBOX, ...folderPaths(tree).filter((path) => path !== INBOX)]}
          folder={newFolder}
          collections={Object.keys(collections)}
          onCreate={create}
          onFilter={() => setDialog({ kind: 'filter', filter: null })}
          onClose={closeDialog}
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
      {dialog?.kind === 'settings' && (
        <Settings
          mode={mode}
          onMode={(choice) => {
            setMode(choice);
            saveMode(choice);
          }}
          theme={theme}
          onTheme={(id) => {
            setTheme(id);
            saveTheme(id);
          }}
          system={system}
          spaceName={space.name}
          onRenameSpace={(name) => session.renameSpace(name)}
          folder={folder}
          onChangeFolder={isDesktop ? () => void session.chooseFolder() : undefined}
          sync={sync}
          syncService={syncService}
          initial={dialog.section}
          onClose={closeDialog}
        />
      )}
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
          count={(choices) =>
            filterTasks(choices, tasks, today).reduce((sum, group) => sum + group.tasks.length, 0) +
            filterCards(choices, boards, today).reduce((sum, group) => sum + group.cards.length, 0)
          }
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
          folders={folderPaths(tree)}
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
          const places = allPlaces();
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
          const choices = Object.keys(boards)
            .sort()
            .map((board) => ({ board, label: boardName(board), folder: basename(dirname(board)) }));
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
      {menu && <ContextMenu at={menu.at} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}
