import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

/** A small window in the middle of the app. Esc or a click beside it closes it. */
function Dialog({ label, onClose, onKeyDown, children }: {
  label: string;
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Take the keyboard away from the editor, unless a field inside asked for it itself.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
  }, []);
  return (
    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          else onKeyDown?.(event);
        }}
      >
        {children}
      </div>
    </div>
  );
}

export type NewKind = 'note' | 'tasks' | 'board';

const KINDS: { kind: NewKind; label: string; icon: IconName }[] = [
  { kind: 'note', label: 'Note', icon: 'note' },
  { kind: 'tasks', label: 'Task list', icon: 'tasks' },
  { kind: 'board', label: 'Board', icon: 'board' },
];

/** Asks what to create: press 1, 2 or 3, or choose with the arrow keys or the mouse. */
export function NewDialog({ onPick, onClose }: { onPick: (kind: NewKind) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const onKey = (event: KeyboardEvent) => {
    const number = Number(event.key);
    if (number >= 1 && number <= KINDS.length) onPick(KINDS[number - 1]!.kind);
    else if (event.key === 'ArrowDown') setIndex((i) => (i + 1) % KINDS.length);
    else if (event.key === 'ArrowUp') setIndex((i) => (i + KINDS.length - 1) % KINDS.length);
    else if (event.key === 'Enter') onPick(KINDS[index]!.kind);
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label="Create" onClose={onClose} onKeyDown={onKey}>
      <h2>Create</h2>
      <div className="choices" role="listbox">
        {KINDS.map((item, i) => (
          <button
            key={item.kind}
            type="button"
            role="option"
            aria-selected={i === index}
            tabIndex={-1}
            onMouseEnter={() => setIndex(i)}
            onClick={() => onPick(item.kind)}
          >
            <kbd>{i + 1}</kbd>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** Picks the folder to move a note to. Typing filters the list and can name a new folder. */
export function MoveDialog({ folders, current, onMove, onCreate, onClose }: {
  folders: string[];
  current: string;
  onMove: (folder: string) => void;
  onCreate: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const typed = query.trim();
  const matches = folders.filter((f) => f !== current && f.toLowerCase().includes(typed.toLowerCase()));
  const canCreate = typed !== '' && !folders.some((f) => f.toLowerCase() === typed.toLowerCase());
  const count = matches.length + (canCreate ? 1 : 0);

  const pick = async (i: number) => {
    const folder = matches[i];
    if (folder !== undefined) onMove(folder);
    else if (canCreate) setError(await onCreate(typed));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, count - 1));
    else if (event.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
    else if (event.key === 'Enter') void pick(Math.min(index, count - 1));
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label="Move to" onClose={onClose} onKeyDown={onKey}>
      <h2>Move to</h2>
      <input
        id="move-folder"
        aria-label="Folder"
        placeholder="Type a folder name"
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
          setError(null);
        }}
      />
      <div className="choices" role="listbox">
        {matches.map((folder, i) => (
          <button key={folder} type="button" role="option" aria-selected={i === index} tabIndex={-1} onClick={() => void pick(i)}>
            <span>{folder}</span>
          </button>
        ))}
        {canCreate && (
          <button
            type="button"
            role="option"
            aria-selected={index >= matches.length}
            tabIndex={-1}
            onClick={() => void pick(matches.length)}
          >
            <span>Create folder “{typed}”</span>
          </button>
        )}
        {count === 0 && <p>No other folder yet. Type a name to create one.</p>}
      </div>
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}

/** Asks for a note's name. */
export function RenameDialog({ name, onRename, onClose }: {
  name: string;
  onRename: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const failed = await onRename(value);
    if (failed) setError(failed);
    else onClose();
  };
  return (
    <Dialog label="Rename" onClose={onClose}>
      <h2>Rename</h2>
      <form onSubmit={submit}>
        <input
          id="rename-note"
          aria-label="Note name"
          autoFocus
          value={value}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setValue(event.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Rename
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export interface MenuItem {
  label: string;
  run: () => void;
}

/** The menu of a right click, at the pointer. */
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector('button')?.focus();
    const close = (event: MouseEvent | globalThis.KeyboardEvent) => {
      if (event instanceof MouseEvent ? !menu.current?.contains(event.target as Node) : event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  return (
    <div ref={menu} className="menu" role="menu" style={{ left: at.x, top: at.y }}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
