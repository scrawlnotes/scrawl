import { INBOX, INBOX_TASKS, type TreeNode } from '@scrawlnotes/core';
import { type DragEvent, type FormEvent, type MouseEvent, type ReactNode, useState } from 'react';
import { Icon } from './Icon';
import { tabOf, tasksOf, TODAY, UPCOMING } from './items';

// A note or a task list being dragged onto a folder.
const ITEM_DRAG_TYPE = 'application/x-scrawl-item';

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
}

const countNotes = (node: TreeNode): number =>
  node.kind === 'note' ? 1 : (node.children ?? []).reduce((sum, child) => sum + countNotes(child), 0);

/** One tree: views over everything on top, then the inbox, then the folders with their task lists and notes. */
export function Sidebar({ tree, titles, active, counts, onOpen, onTrash, onMove, onNewFolder, onItemMenu, onFolderMenu }: Props) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

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

  const viewRow = (id: string, label: ReactNode, depth: number) => (
    <div key={id} className={`it d${depth}${id === active ? ' on' : ''}`}>
      <button type="button" className="it-main" onClick={() => onOpen(id)}>
        {label}
      </button>
      <span className="ct">{counts[id] || ''}</span>
    </div>
  );

  // A task list shows how many of its tasks are open where a note has its trash button.
  const itemRow = (node: TreeNode, depth: number) => {
    const tab = tabOf(node.path);
    const isList = node.kind === 'tasks';
    return (
      <div
        key={node.path}
        className={`it d${depth}${tab === active ? ' on' : ''}`}
        draggable
        onDragStart={(event) => event.dataTransfer.setData(ITEM_DRAG_TYPE, node.path)}
        onContextMenu={(event) => onItemMenu(event, node.path)}
      >
        <button type="button" className="it-main" onClick={() => onOpen(tab)}>
          <Icon name={isList ? 'tasks' : 'note'} />
          <span>{titles[node.path] ?? node.title}</span>
        </button>
        {isList ? (
          <span className="ct">{counts[tab] || ''}</span>
        ) : (
          <button type="button" className="it-action" title="Move to trash" onClick={() => onTrash(node.path)}>
            ×
          </button>
        )}
      </div>
    );
  };

  const children = (node: TreeNode, depth: number): ReactNode =>
    node.children?.map((child) => (child.kind === 'folder' ? folderRow(child, depth) : itemRow(child, depth)));

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
        {viewRow(TODAY, <span>Today</span>, 0)}
        {viewRow(UPCOMING, <span>Upcoming</span>, 0)}
        <div
          className={`it d0${dropTarget === INBOX ? ' drop' : ''}`}
          {...dropProps(INBOX)}
          onContextMenu={(event) => onFolderMenu(event, INBOX)}
        >
          <button type="button" className="it-main" aria-expanded={inboxOpen} onClick={() => toggle(INBOX)}>
            <span>Inbox</span>
          </button>
          <span className="ct">{(inbox && countNotes(inbox)) || ''}</span>
        </div>
        {inboxOpen &&
          viewRow(
            tasksOf(INBOX_TASKS),
            <>
              <Icon name="tasks" />
              <span>Tasks</span>
            </>,
            1,
          )}
        {inboxOpen && inbox && children(inbox, 1)}

        <div className="grp">
          <span>Folders</span>
          <button type="button" title="New folder" aria-label="New folder" onClick={() => setFolderName('')}>
            +
          </button>
        </div>
        {folderName !== null && (
          <form className="it-form" onSubmit={submitFolder}>
            <input
              id="new-folder-name"
              aria-label="Folder name"
              placeholder="Folder name"
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setFolderName(null)}
              onBlur={() => !folderName && setFolderName(null)}
            />
            {folderError && <p role="alert">{folderError}</p>}
          </form>
        )}
        {tree
          .filter((node) => node.path !== INBOX)
          .map((node) => (node.kind === 'folder' ? folderRow(node, 0) : itemRow(node, 0)))}
      </nav>
    </aside>
  );
}
