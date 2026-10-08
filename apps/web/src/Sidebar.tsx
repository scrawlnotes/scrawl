import { INBOX, INBOX_TASKS, type TaskFilter, type TreeNode } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type DragEvent, type FormEvent, type MouseEvent, type ReactNode, useState } from 'react';
import { Icon } from './Icon';
import { collectionTab, filterTab, pathOf, tabOf, tasksOf, TODAY, TRASH, UPCOMING } from './items';

// A note or a task list being dragged onto a folder.
const ITEM_DRAG_TYPE = 'application/x-scrawl-item';

/** A folder with more than this many items shows only its first `SHOWN`, and how many more there are. */
const MANY = 20;
const SHOWN = 15;
/** The folders shown in full on this device, by path; `''` is the top of the tree. */
const SHOWN_IN_FULL = 'scrawl.sideShownInFull';

function loadShownInFull(): ReadonlySet<string> {
  try {
    const kept = JSON.parse(localStorage.getItem(SHOWN_IN_FULL) ?? '[]') as unknown;
    return new Set(Array.isArray(kept) ? kept.filter((path): path is string => typeof path === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveShownInFull(paths: ReadonlySet<string>) {
  try {
    if (paths.size === 0) localStorage.removeItem(SHOWN_IN_FULL);
    else localStorage.setItem(SHOWN_IN_FULL, JSON.stringify([...paths]));
  } catch {
    // Not kept: it holds until the app closes.
  }
}

interface Props {
  tree: TreeNode[];
  titles: Record<string, string>;
  active: string | null;
  /** Open tasks behind a row, by the id of the tab the row opens. */
  counts: Record<string, number>;
  onOpen: (id: string) => void;
  onTrash: (path: string) => void;
  onMove: (path: string, folder: string) => void;
  onNewFolder: (name: string) => Promise<string | null>;
  /** A right click on a note, a task list or a folder. */
  onItemMenu: (event: MouseEvent, path: string) => void;
  onFolderMenu: (event: MouseEvent, path: string) => void;
  /** The saved filters, under Today and Upcoming. */
  filters: TaskFilter[];
  onFilterMenu: (event: MouseEvent, filter: TaskFilter) => void;
  /** Opens the settings; `settingsOpen` while they are open. */
  onSettings: () => void;
  settingsOpen: boolean;
}

const countNotes = (node: TreeNode): number =>
  node.kind === 'note' ? 1 : (node.children ?? []).reduce((sum, child) => sum + countNotes(child), 0);

/** One tree: views over everything on top, then the inbox, then the folders with their task lists and notes. */
export function Sidebar({
  tree,
  titles,
  active,
  counts,
  onOpen,
  onTrash,
  onMove,
  onNewFolder,
  onItemMenu,
  onFolderMenu,
  filters,
  onFilterMenu,
  onSettings,
  settingsOpen,
}: Props) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [shownInFull, setShownInFull] = useState(loadShownInFull);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const showInFull = (path: string, full: boolean) =>
    setShownInFull((current) => {
      const next = new Set(current);
      if (full) next.add(path);
      else next.delete(path);
      saveShownInFull(next);
      return next;
    });

  // The file of the tab on screen: never hidden among the items a long folder does not show.
  const activePath = active === null ? null : pathOf(active);
  const holdsActive = (node: TreeNode) =>
    activePath !== null && (node.path === activePath || (node.kind === 'folder' && activePath.startsWith(`${node.path}/`)));

  /**
   * The rows of a folder's items, or of the top of the tree. A long one shows its first items,
   * the one on screen if it is further down, and a row with how many more there are; shown in
   * full, it ends with a row to show less.
   */
  const rows = (key: string, nodes: TreeNode[], depth: number): ReactNode => {
    const row = (node: TreeNode) => (node.kind === 'folder' ? folderRow(node, depth) : itemRow(node, depth));
    if (nodes.length <= MANY) return nodes.map(row);
    if (shownInFull.has(key)) {
      return (
        <>
          {nodes.map(row)}
          <div className={`it more d${depth}`}>
            <button type="button" className="it-main" onClick={() => showInFull(key, false)}>
              <span>{t('side.showLess')}</span>
            </button>
          </div>
        </>
      );
    }
    const shown = nodes.filter((node, index) => index < SHOWN || holdsActive(node));
    return (
      <>
        {shown.map(row)}
        <div className={`it more d${depth}`}>
          <button type="button" className="it-main" onClick={() => showInFull(key, true)}>
            <span>{t('side.showMore', { count: nodes.length - shown.length })}</span>
          </button>
        </div>
      </>
    );
  };

  const submitFolder = async (event: FormEvent) => {
    event.preventDefault();
    const error = folderName?.trim() ? await onNewFolder(folderName) : null;
    setFolderError(error);
    if (!error) setFolderName(null);
  };

  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return;
      event.preventDefault();
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDropTarget(null);
      const path = event.dataTransfer.getData(ITEM_DRAG_TYPE);
      if (path) onMove(path, folder);
    },
  });

  // On a touch screen, where there is no right click, a row's menu opens from its ··· button.
  const more = (onMenu: (event: MouseEvent) => void) => (
    <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={onMenu}>
      ···
    </button>
  );

  const viewRow = (id: string, label: ReactNode, depth: number, onMenu?: (event: MouseEvent) => void) => (
    <div key={id} className={`it d${depth}${id === active ? ' on' : ''}`}>
      <button type="button" className="it-main" onClick={() => onOpen(id)}>
        {label}
      </button>
      <span className="ct">{counts[id] || ''}</span>
      {onMenu && more(onMenu)}
    </div>
  );

  // A task list or a board shows how many of its tasks or cards are open where a note has its trash button.
  const itemRow = (node: TreeNode, depth: number) => {
    const tab = node.kind === 'collection' ? collectionTab(node.path) : tabOf(node.path);
    const counted = node.kind === 'tasks' || node.kind === 'board' || node.kind === 'collection';
    return (
      <div
        key={node.path}
        className={`it d${depth}${tab === active ? ' on' : ''}`}
        // A collection is a folder; moving it is not done by dragging yet.
        draggable={node.kind !== 'collection'}
        onDragStart={(event) => event.dataTransfer.setData(ITEM_DRAG_TYPE, node.path)}
        onContextMenu={(event) => onItemMenu(event, node.path)}
      >
        <button type="button" className="it-main" onClick={() => onOpen(tab)}>
          <Icon name={node.kind === 'folder' ? 'folder' : node.kind} />
          <span>{titles[node.path] ?? node.title}</span>
        </button>
        {counted ? (
          <span className="ct">{counts[tab] || ''}</span>
        ) : (
          <button type="button" className="it-action" title={t('side.moveToTrash')} onClick={() => onTrash(node.path)}>
            ×
          </button>
        )}
        {node.path !== INBOX_TASKS && more((event) => onItemMenu(event, node.path))}
      </div>
    );
  };

  const children = (node: TreeNode, depth: number): ReactNode => rows(node.path, node.children ?? [], depth);

  const folderRow = (node: TreeNode, depth: number): ReactNode => {
    const open = !collapsed.has(node.path);
    return (
      <div key={node.path}>
        <div
          className={`it d${depth}${node.path === dropTarget ? ' drop' : ''}`}
          {...dropProps(node.path)}
          onContextMenu={(event) => onFolderMenu(event, node.path)}
        >
          <button type="button" className="it-main" aria-expanded={open} onClick={() => toggle(node.path)}>
            <span className="chev">{open ? '▾' : '▸'}</span>
            <span>{node.name}</span>
          </button>
          {!open && <span className="ct">{countNotes(node) || ''}</span>}
          {more((event) => onFolderMenu(event, node.path))}
        </div>
        {open && children(node, depth + 1)}
      </div>
    );
  };

  const inbox = tree.find((node) => node.path === INBOX);
  const inboxOpen = !collapsed.has(INBOX);

  return (
    <aside className="side">
      <nav className="tree">
        {viewRow(TODAY, <span>{t('side.today')}</span>, 0)}
        {viewRow(UPCOMING, <span>{t('side.upcoming')}</span>, 0)}
        {filters.map((filter) => (
          <div key={filter.id} onContextMenu={(event) => onFilterMenu(event, filter)}>
            {viewRow(
              filterTab(filter.id),
              <>
                <Icon name="filter" />
                <span>{filter.name}</span>
              </>,
              0,
              (event) => onFilterMenu(event, filter),
            )}
          </div>
        ))}
        <div
          className={`it d0${dropTarget === INBOX ? ' drop' : ''}`}
          {...dropProps(INBOX)}
          onContextMenu={(event) => onFolderMenu(event, INBOX)}
        >
          <button type="button" className="it-main" aria-expanded={inboxOpen} onClick={() => toggle(INBOX)}>
            <span>{t('side.inbox')}</span>
          </button>
          <span className="ct">{(inbox && countNotes(inbox)) || ''}</span>
          {more((event) => onFolderMenu(event, INBOX))}
        </div>
        {inboxOpen &&
          viewRow(
            tasksOf(INBOX_TASKS),
            <>
              <Icon name="tasks" />
              <span>{t('side.tasks')}</span>
            </>,
            1,
          )}
        {inboxOpen && inbox && children(inbox, 1)}

        <div className="grp">
          <span>{t('side.folders')}</span>
          <button type="button" title={t('side.newFolder')} aria-label={t('side.newFolder')} onClick={() => setFolderName('')}>
            +
          </button>
        </div>
        {folderName !== null && (
          <form className="it-form" onSubmit={submitFolder}>
            <input
              id="new-folder-name"
              aria-label={t('side.folderName')}
              placeholder={t('side.folderName')}
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setFolderName(null)}
              onBlur={() => !folderName && setFolderName(null)}
            />
            {folderError && <p role="alert">{folderError}</p>}
          </form>
        )}
        {rows(
          '',
          tree.filter((node) => node.path !== INBOX),
          0,
        )}
      </nav>
      {/* The trash stays at the foot of the sidebar, apart from the folders, with the settings beside it. */}
      <div className="side-foot">
        {viewRow(
          TRASH,
          <>
            <Icon name="trash" />
            <span>{t('side.trash')}</span>
          </>,
          0,
        )}
        <button
          type="button"
          className={`side-settings${settingsOpen ? ' on' : ''}`}
          title={t('side.settings')}
          aria-label={t('side.settings')}
          onClick={onSettings}
        >
          <Icon name="settings" />
        </button>
      </div>
    </aside>
  );
}
