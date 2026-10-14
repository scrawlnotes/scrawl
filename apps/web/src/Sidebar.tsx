import { INBOX, INBOX_TASKS, inSpace, spaceOf, type TaskFilter, type TreeNode } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type CSSProperties, type DragEvent, type FormEvent, Fragment, type MouseEvent, type ReactNode, useState } from 'react';
import { Icon } from './Icon';
import { collectionTab, countItems, filterTab, pathOf, tabOf, tasksOf, TODAY, TRASH, UPCOMING } from './items';
import type { SpaceView } from './session';

// A note or a task list being dragged onto a folder.
const ITEM_DRAG_TYPE = 'application/x-scrawl-item';

/** A folder with more than this many items shows only its first `SHOWN`, and how many more there are. */
const MANY = 20;
const SHOWN = 15;
/** The folders shown in full on this device, by path; `''` is the top of the tree. */
const SHOWN_IN_FULL = 'scrawl.sideShownInFull';
/** The folders open on this device, by path, with the inbox and the filters; every other one is closed. */
const OPENED = 'scrawl.sideOpen';

function loadPaths(key: string): ReadonlySet<string> {
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return new Set(Array.isArray(kept) ? kept.filter((path): path is string => typeof path === 'string') : []);
  } catch {
    return new Set();
  }
}

function savePaths(key: string, paths: ReadonlySet<string>) {
  try {
    if (paths.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify([...paths]));
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
  /** Makes a folder in `parent`, at the top for `''`; returns a message when it cannot. */
  onNewFolder: (name: string, parent: string) => Promise<string | null>;
  /** A right click on a note, a task list or a folder. */
  onItemMenu: (event: MouseEvent, path: string) => void;
  /** A folder's menu; `addFolder` starts naming a folder inside it, under its row. */
  onFolderMenu: (event: MouseEvent, path: string, addFolder: () => void) => void;
  /** The saved filters, under Today and Upcoming. */
  filters: TaskFilter[];
  onFilterMenu: (event: MouseEvent, filter: TaskFilter) => void;
  /** Opens the settings; `settingsOpen` while they are open. */
  onSettings: () => void;
  settingsOpen: boolean;
  /** The row whose menu is open, by its path or its tab: it stays marked while the menu is open. */
  menuTarget: string | null;
  /** The spaces beside the personal one, each a heading with its tree under it. */
  spaces: SpaceView[];
  /** What the personal space is called, for its heading when there are other spaces. */
  personalName: string;
  /** A space heading's menu; null is the personal space. `addFolder` starts naming a folder at the space's top. */
  onSpaceMenu: (event: MouseEvent, id: string | null, addFolder: () => void) => void;
}

/** The key a space's heading folds and marks under; the personal space's is `@personal`. */
const spaceKey = (id: string | null) => (id ? inSpace(id, '') : '@personal');
const FOLDED = 'scrawl.side.folded';

/** How far in a row is: each level of folders one step. */
const indent = (depth: number) => ({ '--d': depth }) as CSSProperties;

/** Every folder of the tree, by path. */
function folderPathsOf(nodes: TreeNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    into.add(node.path);
    folderPathsOf(node.children ?? [], into);
  }
  return into;
}

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
  menuTarget,
  spaces,
  personalName,
  onSpaceMenu,
}: Props) {
  // A folder starts closed; one opened stays open, on this device, until it is closed.
  const [opened, setOpened] = useState(() => loadPaths(OPENED));
  // A space's heading starts open; one folded stays folded, on this device, until it is opened.
  const [folded, setFolded] = useState(() => loadPaths(FOLDED));
  const toggleSpace = (key: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      savePaths(FOLDED, next);
      return next;
    });
  const [shownInFull, setShownInFull] = useState(() => loadPaths(SHOWN_IN_FULL));
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // The folder a new folder is being named in, `''` for the top; null while none is.
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  const toggle = (path: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      savePaths(OPENED, next);
      return next;
    });

  const showInFull = (path: string, full: boolean) =>
    setShownInFull((current) => {
      const next = new Set(current);
      if (full) next.add(path);
      else next.delete(path);
      savePaths(SHOWN_IN_FULL, next);
      return next;
    });

  const marked = (key: string) => (key === menuTarget ? ' marked' : '');

  // The file of the tab on screen: never hidden among the items a long folder does not show.
  const activePath = active === null ? null : pathOf(active);
  const holdsActive = (node: TreeNode) =>
    activePath !== null && (node.path === activePath || (node.kind === 'folder' && activePath.startsWith(`${node.path}/`)));

  /**
   * The rows of a folder's items, or of the top of the tree. A long one shows its first items,
   * the one on screen if it is further down, and a row with how many more there are; shown in
   * full, it ends with a row to show less. Under the folders, an item leaves room for a folder's
   * arrow, so that its icon lines up with theirs.
   */
  const rows = (key: string, nodes: TreeNode[], depth: number, spaced: boolean): ReactNode => {
    const row = (node: TreeNode) => (node.kind === 'folder' ? folderRow(node, depth) : itemRow(node, depth, spaced));
    const toggleRow = (full: boolean, label: string) => (
      <div className="it more" style={indent(depth)}>
        <button type="button" className="it-main" onClick={() => showInFull(key, full)}>
          {spaced && <i className="it-pad" />}
          <span>{label}</span>
        </button>
      </div>
    );
    if (nodes.length <= MANY) return nodes.map(row);
    if (shownInFull.has(key)) {
      return (
        <>
          {nodes.map(row)}
          {toggleRow(false, t('side.showLess'))}
        </>
      );
    }
    const shown = nodes.filter((node, index) => index < SHOWN || holdsActive(node));
    return (
      <>
        {shown.map(row)}
        {toggleRow(true, t('side.showMore', { count: nodes.length - shown.length }))}
      </>
    );
  };

  /** Starts naming a new folder in `parent`, `''` for the top; a closed folder opens for it. */
  const startFolder = (parent: string) => {
    if (parent === '' || parent === spaceKey(null) ? folded.has(spaceKey(null)) : spaceOf(parent) && parent === spaceKey(spaceOf(parent)) && folded.has(parent)) toggleSpace(parent === '' ? spaceKey(null) : parent);
    if (parent && !opened.has(parent) && parent !== spaceKey(spaceOf(parent))) toggle(parent);
    setAddingIn(parent);
    setFolderName('');
    setFolderError(null);
  };

  const stopFolder = () => {
    setAddingIn(null);
    setFolderError(null);
  };

  const submitFolder = async (event: FormEvent) => {
    event.preventDefault();
    const error = folderName.trim() && addingIn !== null ? await onNewFolder(folderName, addingIn) : null;
    if (error) setFolderError(error);
    else stopFolder();
  };

  /** The row a new folder is named in, where it will be: its icon, the name and the Add button. */
  const folderForm = (depth: number) => (
    <form className="it-form" style={indent(depth)} onSubmit={submitFolder}>
      <i className="it-pad" />
      <Icon name="folder" />
      <input
        id="new-folder-name"
        aria-label={t('side.folderName')}
        placeholder={t('side.folderName')}
        autoFocus
        value={folderName}
        onChange={(event) => setFolderName(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && stopFolder()}
        onBlur={() => !folderName && stopFolder()}
      />
      <button type="submit" className="it-add">
        {t('side.addFolder')}
      </button>
      <button type="button" className="it-cancel" title={t('dialog.cancel')} aria-label={t('dialog.cancel')} onClick={stopFolder}>
        ×
      </button>
      {folderError && <p role="alert">{folderError}</p>}
    </form>
  );

  const folderMenu = (event: MouseEvent, path: string) => onFolderMenu(event, path, () => startFolder(path));

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
    <div key={id} className={`it${id === active ? ' on' : ''}${marked(id)}`} style={indent(depth)} onContextMenu={onMenu}>
      <button type="button" className="it-main" onClick={() => onOpen(id)}>
        {label}
      </button>
      <span className="ct">{counts[id] || ''}</span>
      {onMenu && more(onMenu)}
    </div>
  );

  // A task list or a board shows how many of its tasks or cards are open where a note has its trash button.
  const itemRow = (node: TreeNode, depth: number, spaced: boolean) => {
    const tab = node.kind === 'collection' ? collectionTab(node.path) : tabOf(node.path);
    const counted = node.kind === 'tasks' || node.kind === 'board' || node.kind === 'collection';
    return (
      <div
        key={node.path}
        className={`it${tab === active ? ' on' : ''}${marked(node.path)}`}
        style={indent(depth)}
        draggable
        onDragStart={(event) => event.dataTransfer.setData(ITEM_DRAG_TYPE, node.path)}
        onContextMenu={(event) => onItemMenu(event, node.path)}
      >
        <button type="button" className="it-main" onClick={() => onOpen(tab)}>
          {spaced && <i className="it-pad" />}
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

  const children = (node: TreeNode, depth: number, spaced: boolean): ReactNode => rows(node.path, node.children ?? [], depth, spaced);

  // A folder reads as one: an arrow big enough to hit, which turns as it opens, and its icon. So does
  // the inbox, which holds things the same way.
  const folderHead = (open: boolean, name: string) => (
    <>
      <span className={open ? 'chev open' : 'chev'}>
        <Icon name="chevron" />
      </span>
      <Icon name="folder" />
      <span>{name}</span>
    </>
  );

  // The saved filters sit in their folders; one in none, or in a folder that is gone, in the inbox.
  const folderPaths = folderPathsOf(tree);
  const placeOf = (filter: TaskFilter) => (filter.folder && folderPaths.has(filter.folder) && filter.folder !== INBOX ? filter.folder : INBOX);
  const filterRows = (folder: string, depth: number) =>
    filters
      .filter((filter) => placeOf(filter) === folder)
      .map((filter) =>
        viewRow(
          filterTab(filter.id),
          <>
            <i className="it-pad" />
            <Icon name="filter" />
            <span>{filter.name}</span>
          </>,
          depth,
          (event) => onFilterMenu(event, filter),
        ),
      );

  // A folder being added in a folder is named at the top of what it holds; its filters come first.
  const folderRow = (node: TreeNode, depth: number): ReactNode => {
    const open = opened.has(node.path);
    return (
      <div key={node.path}>
        <div
          className={`it fold${node.path === dropTarget ? ' drop' : ''}${marked(node.path)}`}
          style={indent(depth)}
          {...dropProps(node.path)}
          onContextMenu={(event) => folderMenu(event, node.path)}
        >
          <button type="button" className="it-main" aria-expanded={open} onClick={() => toggle(node.path)}>
            {folderHead(open, node.name)}
          </button>
          {!open && <span className="ct">{countItems(node) || ''}</span>}
          {more((event) => folderMenu(event, node.path))}
        </div>
        {open && addingIn === node.path && folderForm(depth + 1)}
        {open && filterRows(node.path, depth + 1)}
        {open && children(node, depth + 1, true)}
      </div>
    );
  };

  const inbox = tree.find((node) => node.path === INBOX);
  const inboxOpen = opened.has(INBOX);

  // The personal space: the inbox, then the folders. With a heading of its own it is a step in,
  // and its folders follow the inbox as a space's do, a new one named under the heading.
  const personal = (depth: number) => (
    <>
      <div
        className={`it fold${dropTarget === INBOX ? ' drop' : ''}${marked(INBOX)}`}
        style={indent(depth)}
        {...dropProps(INBOX)}
        onContextMenu={(event) => folderMenu(event, INBOX)}
      >
        <button type="button" className="it-main" aria-expanded={inboxOpen} onClick={() => toggle(INBOX)}>
          {folderHead(inboxOpen, t('side.inbox'))}
        </button>
        <span className="ct">{(inbox && countItems(inbox)) || ''}</span>
        {more((event) => folderMenu(event, INBOX))}
      </div>
      {inboxOpen &&
        viewRow(
          tasksOf(INBOX_TASKS),
          <>
            <i className="it-pad" />
            <Icon name="tasks" />
            <span>{t('side.tasks')}</span>
          </>,
          depth + 1,
        )}
      {inboxOpen && filterRows(INBOX, depth + 1)}
      {inboxOpen && inbox && children(inbox, depth + 1, true)}

      {depth === 0 && (
        <div className="grp" style={indent(depth)}>
          <span>{t('side.folders')}</span>
          <button type="button" title={t('side.newFolder')} aria-label={t('side.newFolder')} onClick={() => startFolder('')}>
            +
          </button>
        </div>
      )}
      {depth === 0 && addingIn === '' && folderForm(depth)}
      {rows(
        '',
        tree.filter((node) => node.path !== INBOX),
        depth,
        true,
      )}
    </>
  );

  // A space's heading: its name and its menu; it folds like a folder.
  const spaceRow = (id: string | null, name: string) => {
    const key = spaceKey(id);
    const open = !folded.has(key);
    const menu = (event: MouseEvent) => onSpaceMenu(event, id, () => startFolder(id ? key : ''));
    return (
      <div key={key} className={`it fold space${marked(key)}`} style={indent(0)} onContextMenu={menu}>
        <button type="button" className="it-main" aria-expanded={open} onClick={() => toggleSpace(key)}>
          <span className={open ? 'chev open' : 'chev'}>
            <Icon name="chevron" />
          </span>
          <Icon name="space" />
          <span>{name}</span>
        </button>
        {more(menu)}
      </div>
    );
  };

  return (
    <aside className="side">
      <nav className="tree">
        {viewRow(TODAY, <span>{t('side.today')}</span>, 0)}
        {viewRow(UPCOMING, <span>{t('side.upcoming')}</span>, 0)}
        {spaces.length === 0 ? (
          personal(0)
        ) : (
          <>
            {spaceRow(null, personalName)}
            {!folded.has(spaceKey(null)) && addingIn === '' && folderForm(1)}
            {!folded.has(spaceKey(null)) && personal(1)}
            {spaces.map((space) => (
              <Fragment key={space.id}>
                {spaceRow(space.id, space.name)}
                {!folded.has(spaceKey(space.id)) && addingIn === spaceKey(space.id) && folderForm(1)}
                {!folded.has(spaceKey(space.id)) && rows(spaceKey(space.id), space.tree, 1, true)}
              </Fragment>
            ))}
          </>
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
