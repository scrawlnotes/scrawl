import { type MessageKey, t } from '@scrawlnotes/i18n';
import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Icon, type IconName } from './Icon';

/** A small window in the middle of the app. Esc or a click beside it closes it. */
export function Dialog({ label, className, onClose, onEscape = onClose, onKeyDown, children }: {
  label: string;
  /** Added to the window's own class, for a window that is laid out differently. */
  className?: string;
  onClose: () => void;
  /** What Esc does, when it is not closing. */
  onEscape?: () => void;
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
        className={className ? `dialog ${className}` : 'dialog'}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onEscape();
          else onKeyDown?.(event);
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A folder picked from the list, or a name typed for a folder that does not exist yet. */
export interface FolderChoice {
  folder: string;
  create: boolean;
}

type FolderPicker = ReturnType<typeof useFolderPicker>;

/**
 * The folder list of Move to and Create: typing filters it, the arrow keys move through it, and
 * a name no folder has can be picked to create that folder.
 */
function useFolderPicker(folders: string[], initial?: string) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(() => Math.max(0, initial === undefined ? 0 : folders.indexOf(initial)));
  const typed = query.trim();
  const matches = folders.filter((f) => f.toLowerCase().includes(typed.toLowerCase()));
  const canCreate = typed !== '' && !folders.some((f) => f.toLowerCase() === typed.toLowerCase());
  const count = matches.length + (canCreate ? 1 : 0);
  const selected = Math.min(index, count - 1);
  const choiceAt = (i: number): FolderChoice | null =>
    i >= 0 && i < matches.length ? { folder: matches[i]!, create: false } : canCreate && i === matches.length ? { folder: typed, create: true } : null;
  return {
    query,
    typed,
    matches,
    canCreate,
    count,
    selected,
    choiceAt,
    filter: (value: string) => {
      setQuery(value);
      setIndex(0);
    },
    select: setIndex,
    /** Moves the selection for the arrow keys; returns whether the key was one of them. */
    step: (key: string) => {
      if (key === 'ArrowDown') setIndex(Math.min(selected + 1, count - 1));
      else if (key === 'ArrowUp') setIndex(Math.max(selected - 1, 0));
      else return false;
      return true;
    },
  };
}

// A click on the list must not take the keyboard away from the field typed into.
const keepFocus = (event: ReactMouseEvent) => event.preventDefault();

function FolderList({ picker, empty, onPick }: { picker: FolderPicker; empty: string; onPick: (index: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [picker.selected, picker.query]);
  return (
    <div ref={list} className="choices" role="listbox" aria-label={t('folders.label')}>
      {picker.matches.map((folder, i) => (
        <button
          key={folder}
          type="button"
          role="option"
          aria-selected={i === picker.selected}
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => onPick(i)}
        >
          <span>{folder}</span>
        </button>
      ))}
      {picker.canCreate && (
        <button
          type="button"
          role="option"
          aria-selected={picker.selected === picker.matches.length}
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => onPick(picker.matches.length)}
        >
          <span>{t('folders.create', { name: picker.typed })}</span>
        </button>
      )}
      {picker.count === 0 && <p>{empty}</p>}
    </div>
  );
}

export type NewKind = 'note' | 'tasks' | 'board';
type ItemKind = Exclude<NewKind, 'board'>;

const KINDS: { kind: NewKind; label: MessageKey; icon: IconName }[] = [
  { kind: 'note', label: 'create.note', icon: 'note' },
  { kind: 'tasks', label: 'create.tasks', icon: 'tasks' },
  { kind: 'board', label: 'create.board', icon: 'board' },
];

/**
 * Creates a note, a task list or a board. The kind is chosen first; a note or a task list then
 * gets a name, which may be left empty, and a folder.
 */
export function NewDialog({ folders, folder, onCreate, onBoard, onClose }: {
  /** Every folder, the inbox first. */
  folders: string[];
  /** The folder chosen to begin with. */
  folder: string;
  /** Returns a message when the item cannot be made. */
  onCreate: (kind: ItemKind, folder: FolderChoice, name: string) => Promise<string | null>;
  /** Boards have no name or folder to ask for yet. */
  onBoard: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ItemKind | null>(null);
  if (kind) {
    return (
      <NewItemForm kind={kind} folders={folders} folder={folder} onCreate={onCreate} onBack={() => setKind(null)} onClose={onClose} />
    );
  }
  return <KindChoice onPick={(picked) => (picked === 'board' ? onBoard() : setKind(picked))} onClose={onClose} />;
}

/** Asks what to create: press 1, 2 or 3, or choose with the arrow keys or the mouse. */
function KindChoice({ onPick, onClose }: { onPick: (kind: NewKind) => void; onClose: () => void }) {
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
    <Dialog label={t('create.title')} onClose={onClose} onKeyDown={onKey}>
      <h2>{t('create.title')}</h2>
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
            <span>{t(item.label)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** The second step of Create: a name, which may be left empty, and the folder to put the item in. */
function NewItemForm({ kind, folders, folder, onCreate, onBack, onClose }: {
  kind: ItemKind;
  folders: string[];
  folder: string;
  onCreate: (kind: ItemKind, folder: FolderChoice, name: string) => Promise<string | null>;
  onBack: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const picker = useFolderPicker(folders, folder);
  const title = kind === 'note' ? t('create.newNote') : t('create.newList');

  const create = async () => {
    const choice = picker.choiceAt(picker.selected);
    if (!choice || busy.current) return;
    busy.current = true;
    const failed = await onCreate(kind, choice, name);
    busy.current = false;
    setError(failed);
  };
  const onKey = (event: KeyboardEvent) => {
    if (picker.step(event.key)) event.preventDefault();
    // Enter on Back or Create is that button's own click.
    else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      void create();
    }
  };
  return (
    <Dialog label={title} onClose={onClose} onEscape={onBack} onKeyDown={onKey}>
      <h2>{title}</h2>
      <label className="field">
        <span>{t('create.name')}</span>
        <input
          id="new-name"
          autoFocus
          placeholder={kind === 'note' ? t('create.noteName') : t('create.listName')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </label>
      <label className="field">
        <span>{t('create.folder')}</span>
        <input
          id="new-folder"
          placeholder={t('create.findFolder')}
          value={picker.query}
          onChange={(event) => {
            picker.filter(event.target.value);
            setError(null);
          }}
        />
      </label>
      <div className="field-list">
        <FolderList picker={picker} empty={t('create.typeToCreate')} onPick={picker.select} />
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={onBack}>
          {t('dialog.back')}
        </button>
        <button type="button" className="primary" onClick={() => void create()}>
          {t('create.create')}
        </button>
      </div>
    </Dialog>
  );
}

/** Picks the folder to move a note or a task list to. Typing filters the list and can name a new folder. */
export function MoveDialog({ folders, current, onMove, onCreate, onClose }: {
  folders: string[];
  current: string;
  onMove: (folder: string) => void;
  onCreate: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const picker = useFolderPicker(folders.filter((f) => f !== current));

  const pick = async (i: number) => {
    const choice = picker.choiceAt(i);
    if (!choice) return;
    if (choice.create) setError(await onCreate(choice.folder));
    else onMove(choice.folder);
  };
  const onKey = (event: KeyboardEvent) => {
    if (picker.step(event.key)) event.preventDefault();
    else if (event.key === 'Enter') {
      event.preventDefault();
      void pick(picker.selected);
    }
  };
  return (
    <Dialog label={t('move.title')} onClose={onClose} onKeyDown={onKey}>
      <h2>{t('move.title')}</h2>
      <input
        id="move-folder"
        aria-label={t('move.folder')}
        placeholder={t('move.typeFolder')}
        autoFocus
        value={picker.query}
        onChange={(event) => {
          picker.filter(event.target.value);
          setError(null);
        }}
      />
      <FolderList picker={picker} empty={t('move.none')} onPick={(i) => void pick(i)} />
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}

/** A place a task can be moved to: a task list, at its top level, or a section of it. */
export interface TaskPlaceChoice {
  list: string;
  section: string | null;
  /** The list's name, or the section's. */
  label: string;
  /** For a list: the folder it is in. */
  folder?: string;
  /** The task is there now, so it is no place to move it to. */
  here: boolean;
}

/**
 * Moves a task to another list or section, after the Move task view of design/mockups.html
 * (direction A). Typing narrows the places by the name of a list, its folder or a section.
 */
export function MoveTaskDialog({ title, subtasks, places, onMove, onClose }: {
  title: string;
  subtasks: number;
  places: TaskPlaceChoice[];
  onMove: (place: TaskPlaceChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const typed = query.trim().toLowerCase();
  const has = (text?: string) => (text ?? '').toLowerCase().includes(typed);
  const listOf = (place: TaskPlaceChoice) => places.find((p) => p.list === place.list && p.section === null);
  // A section shows when it or its list matches; a list shows when it or one of its sections does.
  const matches = (place: TaskPlaceChoice) =>
    place.section === null
      ? has(place.label) || has(place.folder) || places.some((p) => p.list === place.list && has(p.label))
      : has(place.label) || has(listOf(place)?.label) || has(listOf(place)?.folder);
  const shown = places.filter(matches);
  const open = shown.filter((place) => !place.here);
  const selected = open[Math.min(index, open.length - 1)];
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setIndex(Math.min(open.indexOf(selected!) + 1, open.length - 1));
    else if (event.key === 'ArrowUp') setIndex(Math.max(open.indexOf(selected!) - 1, 0));
    else if (event.key === 'Enter' && selected) onMove(selected);
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label={t('move.title')} className="move-task" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('move.title')}</h2>
      <p className="move-what">
        {title}
        {subtasks > 0 && <small> {t('moveTask.withSubtasks', { subtasks: t('count.subtasks', { count: subtasks }) })}</small>}
      </p>
      <input
        aria-label={t('moveTask.search')}
        placeholder={t('moveTask.search')}
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
      />
      <div ref={list} className="choices" role="listbox" aria-label={t('moveTask.places')}>
        {shown.map((place) => (
          <button
            key={`${place.list}\n${place.section ?? ''}`}
            type="button"
            role="option"
            className={place.section === null ? undefined : 'sub'}
            aria-selected={place === selected}
            aria-disabled={place.here}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() => !place.here && onMove(place)}
          >
            {place.section === null && <Icon name="tasks" />}
            <span>{place.label}</span>
            {place.folder && <small>{place.folder}</small>}
            {place.here && <span className="here">✓ {t('moveTask.here')}</span>}
          </button>
        ))}
        {shown.length === 0 && <p>{t('moveTask.none')}</p>}
      </div>
    </Dialog>
  );
}

/** Asks for the name of a note or a task list. */
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
    <Dialog label={t('rename.title')} onClose={onClose}>
      <h2>{t('rename.title')}</h2>
      <form onSubmit={submit}>
        <input
          id="rename-item"
          aria-label={t('rename.name')}
          autoFocus
          value={value}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setValue(event.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="primary">
            {t('rename.title')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Asks before something is deleted. Enter confirms, Esc or Cancel leaves it be. */
export function ConfirmDialog({ title, message, action, onConfirm, onClose }: {
  title: string;
  message: string;
  /** The label of the confirming button. */
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const onKey = (event: KeyboardEvent) => {
    // Enter on Cancel is that button's own click.
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    onConfirm();
  };
  return (
    <Dialog label={title} onClose={onClose} onKeyDown={onKey}>
      <h2>{title}</h2>
      <p className="confirm">{message}</p>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" onClick={onConfirm}>
          {action}
        </button>
      </div>
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
  const [place, setPlace] = useState(at);
  // Near the right or bottom edge the menu opens to the left of or above the pointer, so it stays in the window.
  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    setPlace({
      x: at.x + box.width + margin > window.innerWidth ? Math.max(margin, at.x - box.width) : at.x,
      y: at.y + box.height + margin > window.innerHeight ? Math.max(margin, at.y - box.height) : at.y,
    });
  }, [at]);
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
    <div ref={menu} className="menu" role="menu" style={{ left: place.x, top: place.y }}>
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
