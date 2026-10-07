import { t } from '@scrawlnotes/i18n';
import {
  basename,
  dayOf,
  dirname,
  dueToday,
  INBOX,
  INBOX_TASKS,
  listName,
  openCount,
  removeSection,
  removeTask,
  type Section,
  type TrashItem,
  type TreeNode,
} from '@scrawlnotes/core';
import type { EditorStats } from '@scrawlnotes/editor';
import { type DragEvent, type MouseEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ConfirmDialog, ContextMenu, type FolderChoice, type MenuItem, MoveDialog, NewDialog, RenameDialog } from './dialogs';
import { FormatBar } from './FormatBar';
import { HistoryDialog } from './History';
import { Icon } from './Icon';
import {
  folderOf,
  iconOf,
  isNote,
  isTaskListPath,
  labelOf,
  listOf,
  tasksOf,
  TODAY,
  TRASH,
  UPCOMING,
} from './items';
import { Session } from './session';
import { Sidebar } from './Sidebar';
import { DueView, type TaskActions, TaskList } from './Tasks';
import { contentsText, quote } from './text';
import { TrashView } from './Trash';
import { isDesktop } from './storage';

type Theme = 'dark' | 'light';
type OpenDialog =
  | { kind: 'new' }
  | { kind: 'move'; path: string }
  | { kind: 'rename'; path: string }
  | { kind: 'confirm'; title: string; message: string; action: string; run: () => void }
  | { kind: 'history'; path: string }
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
  const totals = { note: 0, tasks: 0, folder: 0 };
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      totals[node.kind]++;
      visit(node.children ?? []);
    }
  };
  visit(folder.children ?? []);
  return contentsText({ notes: totals.note, lists: totals.tasks, folders: totals.folder });
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [session] = useState(() => new Session());
  const { ready, needsFolder, folder, tree, tabs, active, titles, tasks, sections, trash, saved, stats, format, source, recording, recordError } =
    useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const [theme, setTheme] = useState<Theme>('dark');
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // With nothing open the app asks what to create, until that is declined once.
  const [declined, setDeclined] = useState(false);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
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
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!empty) setDeclined(false);
  }, [empty]);

  useEffect(() => {
    // Ctrl+N and Ctrl+W belong to the browser on the web, so Alt is used there.
    const onKey = (event: KeyboardEvent) => {
      const modifier = isDesktop ? (event.ctrlKey || event.metaKey) && !event.altKey : event.altKey && !event.ctrlKey;
      if (!modifier || event.shiftKey) return;
      if (event.code === 'KeyN') setDialog({ kind: 'new' });
      else if (event.code === 'KeyW' && active) void session.close(active);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, active]);

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
  const create = async (kind: 'note' | 'tasks', choice: FolderChoice, name: string) => {
    const error = await session.create(kind, choice.folder, name, choice.create);
    if (!error) setDialog(null);
    return error;
  };
  const openBoard = () => {
    setDialog(null);
    void session.openBoard(newFolder);
  };

  // Nothing is deleted without asking first.
  const ask = (title: string, message: string, run: () => void, action = t('delete.action')) =>
    setDialog({ kind: 'confirm', title, message, action, run });
  const deleteItem = (path: string) => {
    if (isTaskListPath(path)) {
      const name = quote(listName(path));
      const total = tasks[path]?.length ?? 0;
      const message =
        total > 0 ? t('delete.listWithTasks', { name, tasks: t('count.tasks', { count: total }) }) : t('delete.listText', { name });
      ask(t('delete.list'), message, () => void session.trash(path));
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
  // A section goes together with its tasks, as in Todoist.
  const deleteSection = (list: string, section: Section) => {
    const whole = { sections: sections[list] ?? [], tasks: tasks[list] ?? [] };
    const count = whole.tasks.length - removeSection(whole, section.id).tasks.length;
    const name = quote(section.name);
    const message =
      count > 0 ? t('delete.sectionWithTasks', { name, tasks: t('count.tasks', { count }) }) : t('delete.sectionText', { name });
    ask(t('delete.section'), message, () => session.removeSection(list, section.id));
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
  // The menu of a note or a task list; the inbox's own list has none.
  const itemMenu = (event: MouseEvent, path: string) =>
    path !== INBOX_TASKS &&
    openMenu(event, [
      { label: t('menu.moveTo'), run: () => setDialog({ kind: 'move', path }) },
      { label: t('menu.rename'), run: () => setDialog({ kind: 'rename', path }) },
      ...(isTaskListPath(path) ? [] : [{ label: t('menu.history'), run: () => void showHistory(path) }]),
      { label: t('menu.delete'), run: () => deleteItem(path) },
    ]);
  // The inbox is always there; it cannot be deleted.
  const folderMenu = (event: MouseEvent, path: string) =>
    openMenu(event, [
      { label: t('menu.newNoteHere'), run: () => void session.newNote(path) },
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
  };
  const dueNow = dueToday(tasks, today);
  const counts: Record<string, number> = { [TODAY]: dueNow.overdue.length + dueNow.today.length, [TRASH]: trash.length };
  for (const [list, listTasks] of Object.entries(tasks)) counts[tasksOf(list)] = openCount(listTasks);
  const list = active ? listOf(active) : null;
  const isDueView = active === TODAY || active === UPCOMING;

  return (
    <div className="app">
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
        onOpen={(id) => void session.open(id)}
        onTrash={deleteItem}
        onMove={(path, target) => void session.move(path, target)}
        onNewFolder={(name) => session.newFolder(name)}
        onItemMenu={itemMenu}
        onFolderMenu={folderMenu}
      />
      <main className="main">
        <div
          ref={tabBar}
          className="tabs"
          role="tablist"
          onDragOver={onTabDragOver}
          onDrop={onTabDrop}
          onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setTabGap(null)}
        >
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
                const path = isNote(id) ? id : listOf(id);
                if (path) itemMenu(event, path);
              }}
            >
              <button type="button" className="tab-title" onClick={() => void session.open(id)}>
                <Icon name={iconOf(id)} />
                <span>{labelOf(id, titles)}</span>
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
          />
        )}
        <div className="editor" ref={host} hidden={!showingEditor} />
        {list !== null && <TaskList key={list} list={list} tasks={tasks[list] ?? []} sections={sections[list] ?? []} today={today} actions={taskActions} />}
        {isDueView && <DueView kind={active === TODAY ? 'today' : 'upcoming'} lists={tasks} today={today} actions={taskActions} />}
        {active === TRASH && (
          <TrashView
            items={trash}
            today={today}
            onRestore={(item) => void session.restore(item)}
            onDelete={deleteForever}
            onEmpty={askEmptyTrash}
          />
        )}
        {!showingEditor && list === null && !isDueView && active !== TRASH && (
          <section className="placeholder">
            {active ? (
              <>
                <h1>{labelOf(active, titles)}</h1>
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
          <span className="push">{!ready ? t('status.opening') : saved ? t('status.saved') : t('status.saving')}</span>
          {folder && (
            <button type="button" title={t('status.folder', { folder })} onClick={() => void session.chooseFolder()}>
              {folder.split(/[\\/]/).pop()}
            </button>
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
          <button type="button" onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? t('status.light') : t('status.dark')}
          </button>
        </footer>
      </main>

      {showNew && (
        <NewDialog
          folders={[INBOX, ...folderPaths(tree).filter((path) => path !== INBOX)]}
          folder={newFolder}
          onCreate={create}
          onBoard={openBoard}
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
          name={isTaskListPath(dialog.path) ? listName(dialog.path) : (titles[dialog.path] ?? '')}
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
