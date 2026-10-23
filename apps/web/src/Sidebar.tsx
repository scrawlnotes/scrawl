import { DEFAULT_LOOK, dirname, droppedSpaces, type FolderLook, INBOX_TASKS, isUnder, type NodeTimes, inSpace, listName, localPath, shownName, sortedNodes, spaceOf, type TreeNode } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type CSSProperties, type DragEvent, type FormEvent, Fragment, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { LATEST_RELEASE } from './desktopUpdate';
import { cutShort, useHoverTip } from './HoverTip';
import { Icon, type IconName } from './Icon';
import { Spin } from './Loading';
import { collectionTab, countItems, FILES, FILTERS, pathOf, tabOf, tasksOf, TODAY, TRASH, UPCOMING } from './items';
import type { SpaceView } from './session';
import { isDesktop } from './storage';
import type { SpaceSyncView } from './sync';
import { percent, signInAsk, signInFresh } from './SyncViews';

// A note, a task list, a board, a keys file, a collection or a folder being dragged into a folder.
const ITEM_DRAG_TYPE = 'application/x-scrawl-item';
/** How long a closed folder is held over, while something is dragged, before it opens. */
const OPEN_WHILE_DRAGGING = 700;
/** A space's heading being dragged to another place among the spaces. */
const SPACE_DRAG_TYPE = 'application/x-scrawl-space';

/** A folder with more than this many items shows only its first `SHOWN`, and how many more there are. */
const MANY = 20;
const SHOWN = 15;
/** The folders shown in full on this device, by path; `''` is the top of the tree. */
const SHOWN_IN_FULL = 'scrawl.sideShownInFull';
/** The folders open on this device, by path; every other one is closed. */
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
  /** Something dropped on a folder, a space's heading or a row, which puts it in that row's folder. */
  onMove: (path: string, folder: string) => void;
  /** Makes a folder in `parent`, at the top for `''`; returns a message when it cannot. */
  onNewFolder: (name: string, parent: string) => Promise<string | null>;
  /** A right click on a note, a task list or a folder. */
  onItemMenu: (event: MouseEvent, path: string) => void;
  /** A folder's menu; on a right click `addFolder`, which starts naming a folder inside it, under its row, for its Add new. */
  onFolderMenu: (event: MouseEvent, path: string, addFolder?: () => void) => void;
  /** A folder's +: what can be made in it; `addFolder` starts naming a folder inside it, under its row. */
  onFolderAdd: (event: MouseEvent, path: string, addFolder: () => void) => void;
  /** Opens the settings; `settingsOpen` while they are open on any section but Spaces. */
  onSettings: () => void;
  settingsOpen: boolean;
  /** Opens the settings at Spaces, where each space's sync is; `syncOpen` while Spaces is on screen. */
  onSync: () => void;
  syncOpen: boolean;
  /** The row whose menu is open, by its path or its tab: it stays marked while the menu is open. */
  menuTarget: string | null;
  /** The spaces beside the personal one, each a heading with its tree under it. */
  spaces: SpaceView[];
  /** What the personal space is called, for its heading. */
  personalName: string;
  /** A space heading's menu of what to view and the rest; null is the personal space. On a right click `addFolder`, for its Add new. */
  onSpaceMenu: (event: MouseEvent, id: string | null, addFolder?: () => void) => void;
  /** Puts the spaces beside the personal one in this order, by id. */
  onOrderSpaces: (ids: string[]) => void;
  /** A space heading's +: what can be made at its top. `addFolder` starts naming a folder there. */
  onSpaceAdd: (event: MouseEvent, id: string | null, addFolder: () => void) => void;
  /** How the items of a folder are put in order, by its path; a space's top by its key, the personal one's by ''. */
  folderLooks: Record<string, FolderLook>;
  /** When the items were made and their files written, beside what the tree has. */
  times: NodeTimes;
  /** Opens the search window; `searchOpen` while it is open. */
  onSearch: () => void;
  searchOpen: boolean;
  /**
   * A folder or a space found by the search window, by its path or a space's key: the folders it
   * is in open, so does it, and its row is brought into sight and marked for a moment. With
   * `item`, something made or moved into the folder: the folder opens the same way, and the item's
   * row is brought into sight; a folder moved or renamed comes with where it was, `from`, and the
   * folders open in it stay open. `at` tells one ask from the next.
   */
  reveal: { path: string; item?: string; from?: string; at: number } | null;
  /** The spaces still read as the app opens: `''` for the personal one, the others by id. */
  reading: ReadonlySet<string>;
  /** Folders looked at, read first while the app opens: those open as it starts, and one opened. */
  onWant: (paths: string[]) => void;
  /** How each space's sync stands: one waiting for a sign-in says so inside it, one in its first turn how far it is. */
  syncs: readonly SpaceSyncView[];
  /** Signs in for a space waiting for it: to its server, or to OneDrive. */
  onSignIn: (unit: SpaceSyncView) => void;
}

/** The key a space's heading folds and marks under; the personal space's is `@personal`. */
const spaceKey = (id: string | null) => (id ? inSpace(id, '') : '@personal');
const FOLDED = 'scrawl.side.folded';

/** How far in a row is: each level of folders one step. */
const indent = (depth: number) => ({ '--d': depth }) as CSSProperties;


/** One tree: views over everything on top, then each space under its heading, the personal one first with its Inbox. */
export function Sidebar({
  tree,
  titles,
  active,
  counts,
  onOpen,
  onMove,
  onNewFolder,
  onItemMenu,
  onFolderMenu,
  onFolderAdd,
  onSettings,
  settingsOpen,
  onSync,
  syncOpen,
  menuTarget,
  spaces,
  personalName,
  onSpaceMenu,
  onSpaceAdd,
  onOrderSpaces,
  folderLooks,
  times,
  onSearch,
  searchOpen,
  reveal,
  reading,
  onWant,
  syncs,
  onSignIn,
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
  // The row found, marked for a moment once it is in sight.
  const [flash, setFlash] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  // The folder something dragged would go in, `''` for the personal space's top; its row is
  // marked, and so are the rows beside which it would go.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // What is being dragged among the rows: a folder does not go into itself, and nothing goes where it already is.
  const dragged = useRef<{ path: string } | null>(null);
  // A closed folder held over while something is dragged, which opens after a moment.
  const opening = useRef<{ path: string; timer: number } | null>(null);
  // A space dragged among the others: the heading it would go before or after, by its id, the
  // personal one's null (only after it: it stays first).
  const [spaceDrop, setSpaceDrop] = useState<{ id: string | null; after: boolean } | null>(null);
  // The folder a new folder is being named in, `''` for the top; null while none is.
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  // A row whose name is cut short says it in full once the pointer rests on it.
  const nameTip = useHoverTip();
  const pointedRow = useRef<Element | null>(null);
  const pointAt = (event: MouseEvent) => {
    const row = event.target instanceof Element ? event.target.closest('.it-main') : null;
    if (row === pointedRow.current) return;
    pointedRow.current = row;
    const label = row && [...row.children].reverse().find((child) => child.tagName === 'SPAN' && !child.classList.contains('chev'));
    if (row && label && cutShort(label)) nameTip.show(row, [label.textContent], label);
    else nameTip.hide();
  };
  const pointAway = () => {
    pointedRow.current = null;
    nameTip.hide();
  };

  const toggle = (path: string) => {
    if (!opened.has(path)) onWant([path]);
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      savePaths(OPENED, next);
      return next;
    });
  };
  // The folders open as the app starts are read before the others.
  useEffect(() => {
    if (opened.size > 0) onWant([...opened]);
    // Once, as the sidebar is first drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showInFull = (path: string, full: boolean) =>
    setShownInFull((current) => {
      const next = new Set(current);
      if (full) next.add(path);
      else next.delete(path);
      savePaths(SHOWN_IN_FULL, next);
      return next;
    });

  const marked = (key: string) => (key === menuTarget ? ' marked' : '') + (key === flash ? ' found' : '');

  // The row of something made or moved into a folder, brought into sight once its folder is open.
  const [sighted, setSighted] = useState<{ path: string; at: number } | null>(null);

  // A folder or a space found by the search window: its space unfolds, the folders it is in open
  // and so does it, and its row is marked for a moment once it is in sight. A folder something was
  // put in opens the same way, and the row of what was put there comes into sight.
  useEffect(() => {
    if (!reveal) return;
    // A folder moved or renamed: the folders open in it, and those shown in full, are where it is now.
    const { from, item } = reveal;
    if (from !== undefined && item !== undefined) {
      const follow = (paths: ReadonlySet<string>) => new Set([...paths].map((path) => (isUnder(path, from) ? item + path.slice(from.length) : path)));
      setOpened((current) => {
        const next = follow(current);
        savePaths(OPENED, next);
        return next;
      });
      setShownInFull((current) => {
        const next = follow(current);
        savePaths(SHOWN_IN_FULL, next);
        return next;
      });
    }
    const space = spaceOf(reveal.path);
    const key = spaceKey(space);
    if (folded.has(key)) toggleSpace(key);
    const parts = localPath(reveal.path).split('/').filter(Boolean);
    if (parts.length > 0) {
      onWant([reveal.path]);
      setOpened((current) => {
        const next = new Set(current);
        parts.forEach((_, index) => next.add(inSpace(space, parts.slice(0, index + 1).join('/'))));
        savePaths(OPENED, next);
        return next;
      });
    }
    if (reveal.item) return setSighted({ path: reveal.item, at: reveal.at });
    setFlash(parts.length > 0 ? reveal.path : key);
    const timer = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(timer);
    // Each ask once; the folds are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.at]);
  useEffect(() => {
    if (flash) nav.current?.querySelector(`[data-path="${CSS.escape(flash)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [flash]);
  useEffect(() => {
    if (sighted) nav.current?.querySelector(`[data-path="${CSS.escape(sighted.path)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sighted]);

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
  const rows = (key: string, items: TreeNode[], depth: number, spaced: boolean): ReactNode => {
    const nodes = sortedNodes(items, folderLooks[key] ?? DEFAULT_LOOK, times);
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
    const leadsTo = (node: TreeNode, path: string | undefined) => path !== undefined && (node.path === path || path.startsWith(`${node.path}/`));
    const found = (node: TreeNode) => leadsTo(node, flash ?? undefined) || leadsTo(node, sighted?.path);
    const shown = nodes.filter((node, index) => index < SHOWN || holdsActive(node) || found(node));
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

  const folderMenu = (event: MouseEvent, path: string) => onFolderMenu(event, path);
  const folderAdd = (event: MouseEvent, path: string) => onFolderAdd(event, path, () => startFolder(path));

  /** A space's or a folder's two buttons: how it is viewed and the rest, and + for what can be made in it. */
  const viewAndAdd = (menu: (event: MouseEvent) => void, add: (event: MouseEvent) => void) => (
    <>
      <button type="button" className="it-more it-icon" title={t('side.view')} aria-label={t('side.view')} onClick={menu}>
        <Icon name="tune" />
      </button>
      <button type="button" className="it-more it-icon" title={t('side.add')} aria-label={t('side.add')} onClick={add}>
        <Icon name="plus" />
      </button>
    </>
  );

  /** Opens a folder, as a closed one held over while something is dragged does; one open stays open. */
  const openFolder = (path: string) => {
    onWant([path]);
    setOpened((current) => {
      if (current.has(path)) return current;
      const next = new Set(current).add(path);
      savePaths(OPENED, next);
      return next;
    });
  };
  const stopOpening = () => {
    if (opening.current) window.clearTimeout(opening.current.timer);
    opening.current = null;
  };

  /** A row or a heading is dragged: a note, a list, a board, a keys file, a collection or a folder, by its path. */
  const dragProps = (path: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(ITEM_DRAG_TYPE, path);
      event.dataTransfer.effectAllowed = 'move';
      dragged.current = { path };
    },
    onDragEnd: () => {
      dragged.current = null;
      setDropTarget(null);
      stopOpening();
    },
  });

  /**
   * Whether what is dragged can go in `folder`: not where it already is, a folder not into itself
   * or a folder inside it. Something dragged from elsewhere, not known here, is let in, and the move
   * says why when it cannot be.
   */
  const canDrop = (folder: string, types: readonly string[]) => {
    const now = dragged.current;
    if (!types.includes(ITEM_DRAG_TYPE)) return false;
    return !now || (dirname(now.path) !== folder && !isUnder(folder, now.path));
  };

  // A folder, a space's heading or a row takes what is dropped on it into its folder: a row's
  // folder is the one it is in, a space's top for one at the top.
  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!canDrop(folder, event.dataTransfer.types)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDropTarget(null);
      stopOpening();
      if (!canDrop(folder, event.dataTransfer.types)) return;
      const path = event.dataTransfer.getData(ITEM_DRAG_TYPE);
      if (path) onMove(path, folder);
    },
  });

  /** A folder's row takes what is dropped on it, and opens when it is held over closed. */
  const folderDropProps = (path: string, open: boolean) => {
    const drop = dropProps(path);
    return {
      ...drop,
      onDragOver: (event: DragEvent) => {
        drop.onDragOver(event);
        const now = dragged.current;
        const into = !now || !isUnder(path, now.path);
        if (open || !into || opening.current?.path === path) return;
        stopOpening();
        const timer = window.setTimeout(() => {
          opening.current = null;
          openFolder(path);
        }, OPEN_WHILE_DRAGGING);
        opening.current = { path, timer };
      },
      onDragLeave: () => {
        drop.onDragLeave();
        if (opening.current?.path === path) stopOpening();
      },
    };
  };

  /** A row beside which what is dragged would go: in the folder that is marked. */
  const besideDrop = (folder: string) => (dropTarget === folder ? ' drop-in' : '');

  // On a touch screen, where there is no right click, a row's menu opens from its ··· button.
  const more = (onMenu: (event: MouseEvent) => void) => (
    <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={onMenu}>
      ···
    </button>
  );

  const viewRow = (id: string, label: ReactNode, depth: number, onMenu?: (event: MouseEvent) => void, drag?: { className: string } & Record<string, unknown>) => (
    <div key={id} {...drag} className={`it${id === active ? ' on' : ''}${marked(id)}${drag?.className ?? ''}`} style={indent(depth)} data-path={id} onContextMenu={onMenu}>
      <button type="button" className="it-main" onClick={() => onOpen(id)}>
        {label}
      </button>
      <span className="ct">{counts[id] || ''}</span>
      {onMenu && more(onMenu)}
    </div>
  );

  // Sync and Settings open the settings window; the one whose section is on screen is marked.
  const windowRow = (on: boolean, onClick: () => void, icon: IconName, label: string) => (
    <div className={`it${on ? ' on' : ''}`}>
      <button type="button" className="it-main" onClick={onClick}>
        <Icon name={icon} />
        <span>{label}</span>
      </button>
    </div>
  );

  // A task list, a board or a collection shows how many of its tasks, cards or records are open; deleting is in its menu.
  // It is dragged to another place, and what is dropped on it goes in its folder.
  const itemRow = (node: TreeNode, depth: number, spaced: boolean) => {
    const tab = node.kind === 'collection' ? collectionTab(node.path) : tabOf(node.path);
    const counted = node.kind === 'tasks' || node.kind === 'board' || node.kind === 'collection';
    const folder = dirname(node.path);
    return (
      <div
        key={node.path}
        className={`it${tab === active ? ' on' : ''}${marked(node.path)}${besideDrop(folder)}`}
        style={indent(depth)}
        data-path={node.path}
        {...dragProps(node.path)}
        {...dropProps(folder)}
        onContextMenu={(event) => onItemMenu(event, node.path)}
      >
        <button type="button" className="it-main" onClick={() => onOpen(tab)}>
          {spaced && <i className="it-pad" />}
          <Icon name={node.kind === 'folder' ? 'folder' : node.kind} />
          <span>{titles[node.path] ?? node.title}</span>
        </button>
        {counted && <span className="ct">{counts[tab] || ''}</span>}
        {node.path !== INBOX_TASKS && more((event) => onItemMenu(event, node.path))}
      </div>
    );
  };

  const children = (node: TreeNode, depth: number, spaced: boolean): ReactNode => rows(node.path, node.children ?? [], depth, spaced);

  // In a space or an open folder whose items are not read yet, as the app opens.
  const loadingRow = (depth: number) => (
    <div className="it loading" style={indent(depth)}>
      <span className="it-main">
        <i className="it-pad" />
        <Spin />
        <span>{t('opening.loading')}</span>
      </span>
    </div>
  );

  // A folder reads as one: an arrow big enough to hit, which turns as it opens, and its icon.
  const folderHead = (open: boolean, name: string) => (
    <>
      <span className={open ? 'chev open' : 'chev'}>
        <Icon name="chevron" />
      </span>
      <Icon name="folder" />
      <span>{name}</span>
    </>
  );

  // A folder being added in a folder is named at the top of what it holds.
  const folderRow = (node: TreeNode, depth: number): ReactNode => {
    const open = opened.has(node.path);
    return (
      <div key={node.path}>
        <div
          className={`it fold${node.path === dropTarget ? ' drop' : ''}${marked(node.path)}`}
          style={indent(depth)}
          data-path={node.path}
          {...dragProps(node.path)}
          {...folderDropProps(node.path, open)}
          onContextMenu={(event) => onFolderMenu(event, node.path, () => startFolder(node.path))}
        >
          <button type="button" className="it-main" aria-expanded={open} onClick={() => toggle(node.path)}>
            {folderHead(open, shownName(node.name))}
          </button>
          {!open && <span className="ct">{countItems(node) || ''}</span>}
          {viewAndAdd((event) => folderMenu(event, node.path), (event) => folderAdd(event, node.path))}
        </div>
        {open && addingIn === node.path && folderForm(depth + 1)}
        {open && children(node, depth + 1, true)}
        {open && node.reading && loadingRow(depth + 1)}
      </div>
    );
  };

  // The personal space: its own task list, Inbox, first, as Todoist's; then what is at its top,
  // folders and the rest.
  const personal = (depth: number) => (
    <>
      {viewRow(
        tasksOf(INBOX_TASKS),
        <>
          <i className="it-pad" />
          <Icon name="tasks" />
          <span>{listName(INBOX_TASKS)}</span>
        </>,
        depth,
        undefined,
        { ...dropProps(''), className: besideDrop('') },
      )}
      {rows(
        '',
        tree.filter((node) => node.path !== INBOX_TASKS),
        depth,
        true,
      )}
      {reading.has('') && tree.length === 0 && loadingRow(depth)}
    </>
  );

  /**
   * A space's heading takes another space dragged onto it before or after it, by the half it is
   * over; the personal space stays first, so one dropped on its heading goes after it.
   */
  const spaceDropProps = (id: string | null, items: ReturnType<typeof dropProps>) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(SPACE_DRAG_TYPE)) return items.onDragOver(event);
      event.preventDefault();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const after = id === null || event.clientY > box.top + box.height / 2;
      if (spaceDrop?.id !== id || spaceDrop.after !== after) setSpaceDrop({ id, after });
    },
    onDragLeave: () => {
      setSpaceDrop(null);
      items.onDragLeave();
    },
    onDrop: (event: DragEvent) => {
      const dragged = event.dataTransfer.getData(SPACE_DRAG_TYPE);
      if (!dragged) return items.onDrop(event);
      event.preventDefault();
      const at = spaceDrop;
      setSpaceDrop(null);
      if (!at) return;
      const now = spaces.map((space) => space.id);
      const ids = droppedSpaces(now, dragged, at.id, at.after);
      if (ids.join(' ') !== now.join(' ')) onOrderSpaces(ids);
    },
  });

  /** How a space's sync stands on this device; none for one that does not sync. */
  const syncOf = (id: string | null) => syncs.find((unit) => (unit.space ?? '') === (id ?? ''));
  /** A space in its first turn on this device, with nothing in it yet: it says how far the turn is. */
  const firstTurn = (unit: SpaceSyncView | undefined, empty: boolean) => !!unit && empty && unit.phase === 'syncing' && unit.syncedAt === null;

  // Inside a space waiting for a sign-in, first: it opens the sign-in (design/mockups.html,
  // Sunucuya giriş). The server is named over it, the sidebar being narrow.
  const signInRow = (unit: SpaceSyncView) => (
    <div className="it need" style={indent(1)}>
      <button type="button" className="it-main" title={signInAsk(unit)} onClick={() => onSignIn(unit)}>
        <i className="it-pad" />
        <Icon name="keys" />
        <span>{t(signInFresh(unit) ? 'side.signInToSync' : 'side.signInAgainToSync')}</span>
      </button>
    </div>
  );

  // Inside an empty space in its first turn here: how far it is, until what it holds is there.
  const firstTurnRow = (unit: SpaceSyncView) => (
    <div className="it loading" style={indent(1)}>
      <span className="it-main">
        <i className="it-pad" />
        <Spin />
        <span>{t('sync.syncingPct', { pct: percent(unit.turn?.progress.share ?? 0) })}</span>
      </span>
    </div>
  );

  // A space's heading: its name and its menu; it folds like a folder, and takes what is dropped on
  // it to its top. One beside the personal space is dragged to another place among the spaces.
  // It turns while it is read as the app opens, or in its first turn here; it is marked while it
  // waits for a sign-in.
  const spaceRow = (id: string | null, name: string, empty = false) => {
    const key = spaceKey(id);
    const top = id ? key : '';
    const open = !folded.has(key);
    const menu = (event: MouseEvent) => onSpaceMenu(event, id);
    const add = (event: MouseEvent) => onSpaceAdd(event, id, () => startFolder(top));
    const placed = spaceDrop?.id === id ? (spaceDrop.after ? ' drop-after' : ' drop-before') : '';
    const unit = syncOf(id);
    return (
      <div
        key={key}
        className={`it fold space${dropTarget === top ? ' drop' : ''}${placed}${marked(key)}`}
        style={indent(0)}
        data-path={key}
        {...spaceDropProps(id, dropProps(top))}
        {...(id && {
          draggable: true,
          onDragStart: (event: DragEvent) => {
            event.dataTransfer.setData(SPACE_DRAG_TYPE, id);
            event.dataTransfer.effectAllowed = 'move';
          },
          onDragEnd: () => setSpaceDrop(null),
        })}
        onContextMenu={(event) => onSpaceMenu(event, id, () => startFolder(top))}
      >
        <button type="button" className="it-main" aria-expanded={open} onClick={() => toggleSpace(key)}>
          <span className={open ? 'chev open' : 'chev'}>
            <Icon name="chevron" />
          </span>
          <Icon name="space" />
          <span>{name}</span>
        </button>
        {/* Turning until all of the space is read, as the app opens, or until its first turn ends; marked while it waits for a sign-in. */}
        {reading.has(id ?? '') || firstTurn(unit, empty) ? (
          <span className="ct reading">
            <Spin />
          </span>
        ) : (
          unit?.phase === 'signedOut' && (
            <span className="ct need" role="img" title={signInAsk(unit)} aria-label={signInAsk(unit)}>
              <Icon name="warn" />
            </span>
          )
        )}
        {/* What can be made at its top, and apart from it how it is viewed and the rest. */}
        {viewAndAdd(menu, add)}
      </div>
    );
  };

  return (
    <aside className="side">
      <nav ref={nav} className="tree" onMouseOver={pointAt} onMouseLeave={pointAway} onMouseDown={pointAway} onDragStart={pointAway} onScroll={pointAway}>
        {/* Search reads as a search box, over the rows: it opens the search window. */}
        <button type="button" className={`side-search${searchOpen ? ' on' : ''}`} title={t('side.searchTitle', { keys: 'Ctrl+K' })} onClick={onSearch}>
          <Icon name="search" />
          <span>{t('side.search')}</span>
        </button>
        {viewRow(TODAY, <span>{t('side.today')}</span>, 0)}
        {viewRow(UPCOMING, <span>{t('side.upcoming')}</span>, 0)}
        {viewRow(FILTERS, <span>{t('filters.title')}</span>, 0)}
        {spaceRow(null, personalName)}
        {!folded.has(spaceKey(null)) && syncOf(null)?.phase === 'signedOut' && signInRow(syncOf(null)!)}
        {!folded.has(spaceKey(null)) && addingIn === '' && folderForm(1)}
        {!folded.has(spaceKey(null)) && personal(1)}
        {spaces.map((space) => {
          const open = !folded.has(spaceKey(space.id));
          const unit = syncOf(space.id);
          const empty = space.tree.length === 0;
          return (
            <Fragment key={space.id}>
              {spaceRow(space.id, space.name, empty)}
              {open && unit?.phase === 'signedOut' && signInRow(unit)}
              {open && addingIn === spaceKey(space.id) && folderForm(1)}
              {open && rows(spaceKey(space.id), space.tree, 1, true)}
              {open && empty && (reading.has(space.id) ? loadingRow(1) : unit && firstTurn(unit, empty) && firstTurnRow(unit))}
            </Fragment>
          );
        })}
      </nav>
      {/* Files, the trash, sync and the settings stay at the foot of the sidebar, apart from the folders: a row each, named, as on a phone. In the browser, Downloads opens the desktop apps' latest release on GitHub. */}
      <div className="side-foot">
        {viewRow(
          FILES,
          <>
            <Icon name="clip" />
            <span>{t('side.files')}</span>
          </>,
          0,
        )}
        {viewRow(
          TRASH,
          <>
            <Icon name="trash" />
            <span>{t('side.trash')}</span>
          </>,
          0,
        )}
        {windowRow(syncOpen, onSync, 'cloud', t('phone.sync'))}
        {!isDesktop && windowRow(false, () => window.open(LATEST_RELEASE, '_blank', 'noopener'), 'download', t('side.downloads'))}
        {windowRow(settingsOpen, onSettings, 'cog', t('side.settings'))}
      </div>
      {nameTip.tip}
    </aside>
  );
}
