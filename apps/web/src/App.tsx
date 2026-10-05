import { dirname, INBOX, type TreeNode } from '@scrawlnotes/core';
import type { EditorStats } from '@scrawlnotes/editor';
import { type MouseEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ContextMenu, type MenuItem, MoveDialog, NewDialog, type NewKind, RenameDialog } from './dialogs';
import { FormatBar } from './FormatBar';
import { Icon } from './Icon';
import { iconOf, isNote, labelOf, placeholderOf } from './items';
import { Session } from './session';
import { Sidebar } from './Sidebar';
import { isDesktop } from './storage';

type Theme = 'dark' | 'light';
type OpenDialog = { kind: 'new' } | { kind: 'move'; path: string } | { kind: 'rename'; path: string } | null;

const count = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;

function position(stats: EditorStats): string {
  if (stats.selectedChars === 0) return `Ln ${stats.line}, Col ${stats.col}`;
  const selected = `${count(stats.selectedChars, 'character')} selected`;
  if (stats.cursors > 1) return `${count(stats.cursors, 'selection')}, ${selected}`;
  return stats.selectedLines > 1 ? `${count(stats.selectedLines, 'line')}, ${selected}` : selected;
}

function folderPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    out.push(node.path);
    folderPaths(node.children ?? [], out);
  }
  return out;
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [session] = useState(() => new Session());
  const { ready, needsFolder, folder, tree, tabs, active, titles, saved, stats, format, source } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const [theme, setTheme] = useState<Theme>('dark');
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // With nothing open the app asks what to create, until that is declined once.
  const [declined, setDeclined] = useState(false);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
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
  const create = (kind: NewKind) => {
    setDialog(null);
    if (kind === 'note') void session.newNote();
    else void session.newItem(kind);
  };

  const openMenu = (event: MouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, items });
  };
  const noteMenu = (event: MouseEvent, path: string) =>
    openMenu(event, [
      { label: 'Move to…', run: () => setDialog({ kind: 'move', path }) },
      { label: 'Rename', run: () => setDialog({ kind: 'rename', path }) },
      { label: 'Delete', run: () => void session.trash(path) },
    ]);
  const folderMenu = (event: MouseEvent, path: string) =>
    openMenu(event, [{ label: 'New note here', run: () => void session.newNote(path) }]);
  const closeMenu = useCallback(() => setMenu(null), []);

  return (
    <div className="app">
      {needsFolder && (
        <div className="welcome">
          <h1>Choose a folder for your notes</h1>
          <p>Notes are kept as plain Markdown files in a folder on this computer. Pick an empty folder, or one that already holds .md files.</p>
          <button type="button" onClick={() => void session.chooseFolder()}>
            Choose folder
          </button>
        </div>
      )}
      <Sidebar
        tree={tree}
        titles={titles}
        active={active}
        onOpen={(id) => void session.open(id)}
        onTrash={(path) => void session.trash(path)}
        onMove={(path, target) => void session.move(path, target)}
        onNewFolder={(name) => session.newFolder(name)}
        onNoteMenu={noteMenu}
        onFolderMenu={folderMenu}
      />
      <main className="main">
        <div className="tabs" role="tablist">
          {tabs.map((id) => (
            <div
              key={id}
              className={id === active ? 'tab on' : 'tab'}
              role="tab"
              aria-selected={id === active}
              onMouseDown={(event) => event.button === 1 && void session.close(id)}
              onContextMenu={(event) => isNote(id) && noteMenu(event, id)}
            >
              <button type="button" className="tab-title" onClick={() => void session.open(id)}>
                <Icon name={iconOf(id)} />
                <span>{labelOf(id, titles)}</span>
              </button>
              {/* The dot marks a note that has not been filed yet; it gives way to the close button on hover. */}
              <button
                type="button"
                className="tab-close"
                title={isDesktop ? 'Close (Ctrl+W)' : 'Close (Alt+W)'}
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
            title={isDesktop ? 'New… (Ctrl+N)' : 'New… (Alt+N)'}
            onClick={() => setDialog({ kind: 'new' })}
          >
            +
          </button>
        </div>
        <FormatBar format={format} onFormat={(action) => session.format(action)} onLink={(url) => session.setLink(url)} />
        <div className="editor" ref={host} hidden={!showingEditor} />
        {!showingEditor && (
          <section className="placeholder">
            {active ? (
              <>
                <h1>{labelOf(active, titles)}</h1>
                <p>{placeholderOf(active)}</p>
              </>
            ) : (
              empty && <p>Nothing is open. Press {isDesktop ? 'Ctrl+N' : 'Alt+N'} to create something.</p>
            )}
          </section>
        )}
        <footer className="status">
          {stats && <span>{position(stats)}</span>}
          {stats && <span>{count(stats.chars, 'character')}</span>}
          <span className="push">{!ready ? 'Opening…' : saved ? 'Saved' : 'Saving…'}</span>
          {folder && (
            <button type="button" title={`Notes folder: ${folder}. Click to change.`} onClick={() => void session.chooseFolder()}>
              {folder.split(/[\\/]/).pop()}
            </button>
          )}
          <button
            type="button"
            aria-pressed={source}
            title="Show the note as plain Markdown"
            onClick={() => session.setSource(!source)}
          >
            Markdown
          </button>
          <button type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </footer>
      </main>

      {showNew && <NewDialog onPick={create} onClose={closeDialog} />}
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
          name={titles[dialog.path] ?? ''}
          onRename={(name) => session.rename(dialog.path, name)}
          onClose={closeDialog}
        />
      )}
      {menu && <ContextMenu at={menu.at} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}
