import { DUE_RULES, type FilterChoices, filterName, type Priority, type TaskFilter, type Template } from '@scrawlnotes/core';
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

export type NewKind = 'note' | 'tasks' | 'board' | 'filter';
export type ItemKind = Exclude<NewKind, 'filter'>;

const KINDS: { kind: NewKind; label: MessageKey; icon: IconName }[] = [
  { kind: 'note', label: 'create.note', icon: 'note' },
  { kind: 'tasks', label: 'create.tasks', icon: 'tasks' },
  { kind: 'board', label: 'create.board', icon: 'board' },
  { kind: 'filter', label: 'create.filter', icon: 'filter' },
];

/**
 * Creates a note, a task list or a board. The kind is chosen first; the item then gets a name,
 * which may be left empty, and a folder; a board also starts from a template.
 */
export function NewDialog({ folders, folder, onCreate, onFilter, onClose }: {
  /** Every folder, the inbox first. */
  folders: string[];
  /** The folder chosen to begin with. */
  folder: string;
  /** Returns a message when the item cannot be made. */
  onCreate: (kind: ItemKind, folder: FolderChoice, name: string, template: Template) => Promise<string | null>;
  /** A filter has a window of its own. */
  onFilter: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ItemKind | null>(null);
  if (kind) {
    return (
      <NewItemForm kind={kind} folders={folders} folder={folder} onCreate={onCreate} onBack={() => setKind(null)} onClose={onClose} />
    );
  }
  return <KindChoice onPick={(picked) => (picked === 'filter' ? onFilter() : setKind(picked))} onClose={onClose} />;
}

const TITLES: Record<ItemKind, MessageKey> = { note: 'create.newNote', tasks: 'create.newList', board: 'create.newBoard' };
const NAME_HINTS: Record<ItemKind, MessageKey> = { note: 'create.noteName', tasks: 'create.listName', board: 'create.boardName' };

/** The two ways a board can start: its columns by kind, and whether phases are on. */
const TEMPLATES: { template: Template; label: MessageKey; text: MessageKey; columns: string[] }[] = [
  { template: 'software', label: 'create.software', text: 'create.softwareText', columns: ['backlog', 'active', 'active', 'review', 'done'] },
  { template: 'simple', label: 'create.simple', text: 'create.simpleText', columns: ['active', 'active', 'done'] },
];

/** Asks what to create: press its number, or choose with the arrow keys or the mouse. */
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

/**
 * The second step of Create: a name, which may be left empty, the folder to put the item in,
 * and for a board the template it starts from.
 */
function NewItemForm({ kind, folders, folder, onCreate, onBack, onClose }: {
  kind: ItemKind;
  folders: string[];
  folder: string;
  onCreate: (kind: ItemKind, folder: FolderChoice, name: string, template: Template) => Promise<string | null>;
  onBack: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<Template>('software');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const picker = useFolderPicker(folders, folder);
  const title = t(TITLES[kind]);

  const create = async () => {
    const choice = picker.choiceAt(picker.selected);
    if (!choice || busy.current) return;
    busy.current = true;
    const failed = await onCreate(kind, choice, name, template);
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
          placeholder={t(NAME_HINTS[kind])}
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
      {kind === 'board' && (
        <div className="field templates-field">
          <span id="new-template-label">{t('create.template')}</span>
          <div className="templates" role="radiogroup" aria-labelledby="new-template-label">
            {TEMPLATES.map((item) => (
              <button
                key={item.template}
                type="button"
                role="radio"
                aria-checked={template === item.template}
                onClick={() => setTemplate(item.template)}
              >
                <b>{t(item.label)}</b>
                <span className="cols">
                  {item.columns.map((column, i) => (
                    <i key={i} className={column} />
                  ))}
                </span>
                <small>{t(item.text)}</small>
              </button>
            ))}
          </div>
          <p className="dialog-hint">{t('create.templateHint')}</p>
        </div>
      )}
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

/** One choice among a few, or one of several picked, shown as a row of chips. */
function Chips<T>({ label, items, picked, onPick, name }: {
  label: string;
  items: { value: T; label: string; dot?: string }[];
  picked: (value: T) => boolean;
  onPick: (value: T) => void;
  /** For a choice of one: radio buttons, else checkboxes. */
  name?: string;
}) {
  return (
    <div className="frow">
      <span>{label}</span>
      <div className="fchips" role={name ? 'radiogroup' : 'group'} aria-label={label}>
        {items.map((item) => (
          <button
            key={String(item.value)}
            type="button"
            role={name ? 'radio' : 'checkbox'}
            aria-checked={picked(item.value)}
            onClick={() => onPick(item.value)}
          >
            {item.dot && <i className={`dot ${item.dot}`} />}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Makes a filter or changes one, after the Filter edit view of design/mockups.html (direction
 * A). Every choice narrows what it shows; the count of open tasks follows them.
 */
export function FilterDialog({ filter, folders, count, onSave, onClose }: {
  /** The filter changed; null for a new one. */
  filter: TaskFilter | null;
  /** The top-level folders, the inbox first. */
  folders: string[];
  /** How many open tasks the choices would show. */
  count: (choices: FilterChoices) => number;
  onSave: (filter: TaskFilter) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(filter?.name ?? '');
  const [choices, setChoices] = useState<FilterChoices>(
    filter ?? { due: 'any', priorities: [], folders: [], text: '' },
  );
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const save = () =>
    onSave({ ...choices, id: filter?.id ?? crypto.randomUUID(), name: name.trim() || filterName(choices), text: choices.text.trim() });
  const shown = count(choices);
  return (
    <Dialog
      label={t('filter.title')}
      className="filter-dialog"
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          save();
        }
      }}
    >
      <h2>{t('filter.title')}</h2>
      <div className="frow">
        <span>{t('filter.name')}</span>
        <input aria-label={t('filter.name')} placeholder={filterName(choices)} autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <Chips
        label={t('filter.due')}
        name="due"
        items={DUE_RULES.map((rule) => ({ value: rule, label: t(`filter.due.${rule}`) }))}
        picked={(rule) => choices.due === rule}
        onPick={(due) => setChoices({ ...choices, due })}
      />
      <Chips<Priority>
        label={t('filter.priority')}
        items={([1, 2, 3, 4] as Priority[]).map((p) => ({ value: p, label: p === 4 ? t('filter.priorityNone') : `p${p}`, dot: p === 4 ? undefined : `p${p}` }))}
        picked={(p) => choices.priorities.includes(p)}
        onPick={(p) => setChoices({ ...choices, priorities: toggle(choices.priorities, p) })}
      />
      <Chips<string | null>
        label={t('filter.in')}
        items={[{ value: null, label: t('filter.allLists') }, ...folders.map((f) => ({ value: f, label: f }))]}
        picked={(f) => (f === null ? choices.folders.length === 0 : choices.folders.includes(f))}
        onPick={(f) => setChoices({ ...choices, folders: f === null ? [] : toggle(choices.folders, f) })}
      />
      <div className="frow">
        <span>{t('filter.contains')}</span>
        <input
          aria-label={t('filter.contains')}
          placeholder={t('filter.containsHint')}
          value={choices.text}
          onChange={(event) => setChoices({ ...choices, text: event.target.value })}
        />
      </div>
      <div className="dialog-actions filter-foot">
        <span className="count">{t('filter.matching', { count: shown })}</span>
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" onClick={save}>
          {t('filter.save')}
        </button>
      </div>
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

/**
 * Makes a task from a note: its title, from what was selected, and the list or section it goes
 * to. After the To task view of design/mockups.html (direction A).
 */
export function NewTaskDialog({ title, note, places, initial, onAdd, onClose }: {
  title: string;
  /** The name of the note it links back to. */
  note: string;
  places: TaskPlaceChoice[];
  /** The place picked at first. */
  initial: number;
  onAdd: (title: string, place: TaskPlaceChoice) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(title);
  const [index, setIndex] = useState(initial);
  // The note's name is underlined, wherever the sentence puts it.
  const linksBack = t('toTask.linksBack').split('{note}');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  const add = () => {
    const place = places[index];
    if (value.trim() && place) onAdd(value, place);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setIndex(Math.min(index + 1, places.length - 1));
    else if (event.key === 'ArrowUp') setIndex(Math.max(index - 1, 0));
    else if (event.key === 'Enter') add();
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label={t('toTask.title')} className="move-task" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('toTask.title')}</h2>
      <input
        aria-label={t('tasks.title')}
        placeholder={t('tasks.name')}
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className="links-back">
        {linksBack[0]}
        <u>{note}</u>
        {linksBack[1]}
      </p>
      <p className="choices-label">{t('toTask.addTo')}</p>
      <div ref={list} className="choices" role="listbox" aria-label={t('moveTask.places')}>
        {places.map((place, i) => (
          <button
            key={`${place.list}\n${place.section ?? ''}`}
            type="button"
            role="option"
            className={place.section === null ? undefined : 'sub'}
            aria-selected={i === index}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() => setIndex(i)}
            onDoubleClick={() => value.trim() && onAdd(value, place)}
          >
            {place.section === null && <Icon name="tasks" />}
            <span>{place.label}</span>
            {place.folder && <small>{place.folder}</small>}
          </button>
        ))}
      </div>
      <p className="dialog-hint">
        <kbd>Enter</kbd> {t('toTask.adds')} · <kbd>Esc</kbd> {t('toTask.cancels')}
      </p>
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
