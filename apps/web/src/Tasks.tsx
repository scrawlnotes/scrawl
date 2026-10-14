import {
  addDays,
  basename,
  type Board,
  type Card,
  childrenOf,
  dayOf,
  dueCards,
  depthOf,
  dirname,
  dueToday,
  dueUpcoming,
  filterCards,
  filterFields,
  filterTasks,
  opTakesValue,
  keyOf,
  parseCardRef,
  INBOX_TASKS,
  listName,
  MAX_DEPTH,
  type NewTask,
  type Priority,
  progressOf,
  type Section,
  sectionTasks,
  type Task,
  type TaskFilter,
  type TaskList as List,
  type TaskPatch,
  type TaskPlace,
  type TaskRecord,
  type Record as CollectionRecord,
  recordTitle,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { isPhone, onPage, pageBox, pageWindow } from './device';
import type { MenuHead, MenuItem } from './dialogs';
import { Icon, type IconName } from './Icon';
import { boardHeading, boardLabel, boardWhere, collectionLabel, folderLabel, listHeading, listLabel, listWhere } from './items';
import { AssigneeChip, firstName, PersonPicker, type SpacePeople } from './People';
import { Empty, liftUntilTouch } from './sheets';
import { holdToDrag, pressOnField } from './touchDrag';

/** What can be done to a task, in the list at the path given. */
export interface TaskActions {
  add: (list: string, input: NewTask) => void;
  update: (list: string, id: string, patch: TaskPatch) => void;
  /** Completes or reopens a task; a completion says so with Undo, unless it is `quiet`. */
  setDone: (list: string, id: string, done: boolean, quiet?: boolean) => void;
  remove: (list: string, id: string) => void;
  /** Opens a menu at the pointer; on a phone an action sheet, `head` saying what it is about. */
  menu: (event: MouseEvent, items: MenuItem[], head?: MenuHead) => void;
  addSection: (list: string, name: string) => void;
  renameSection: (list: string, id: string, name: string) => void;
  foldSection: (list: string, id: string, collapsed: boolean) => void;
  /** Asks first, then deletes the section with its tasks. */
  removeSection: (list: string, section: Section) => void;
  moveTask: (list: string, id: string, place: TaskPlace) => void;
  /** Asks where to, then moves the task to another list or section. */
  moveTo: (list: string, id: string) => void;
  /** What the note at a path is called, or null when it is not there any more. */
  noteTitle: (path: string) => string | null;
  openNote: (path: string) => void;
  moveSection: (list: string, id: string, after: string | null) => void;
  /** The key of the card a task was made from, or null when the card is gone. */
  cardLabel: (ref: string) => string | null;
  /** Opens a card in its board's tab. */
  openCard: (board: string, id: string) => void;
  /** Moves a card to a done column of its board: the one given, else the first. */
  finishCard: (board: string, id: string, column?: string) => void;
  /** The collections whose records a task can be about, those that show by a name or a code, with their records. */
  recordChoices: () => { dir: string; records: CollectionRecord[] }[];
  /** What a task's record is called now: its name or code, else what it was called when linked. */
  recordTitle: (record: TaskRecord) => string;
  /** Opens a record over the view. */
  openRecord: (collection: string, id: string) => void;
  /** The people of the space a list is in, to give its tasks to; null in the personal space, which is only you. */
  people?: (list: string) => SpacePeople | null;
  /** On a phone: opens a task as a sheet; `subtask` starts a new subtask in it. */
  open?: (list: string, id: string, subtask?: boolean) => void;
  /** On a phone: the date of a task, picked in a sheet. */
  pickDate?: (list: string, id: string) => void;
  /** On a phone: the record a task is about, picked in a sheet. */
  pickRecord?: (list: string, id: string) => void;
  /** On a phone: who a task is given to, picked among the people of its space in a sheet. */
  pickAssignee?: (list: string, id: string) => void;
  /** On a phone: a new task, typed above the keyboard, for a list or a section of it, due on `due` if given. */
  quickAdd?: (list: string, section: string | null, due?: string) => void;
  /** On a phone: a section's name in a sheet, a new section's for null. */
  nameSection?: (list: string, section: Section | null) => void;
  /** Gives the tasks one new day, all at once, with Undo: what is overdue, moved on. */
  reschedule: (tasks: { list: string; id: string }[], due: string | null) => void;
  /** On a phone: a day chosen in a sheet, about `title`. */
  pickDay?: (title: string, onPick: (due: string | null) => void) => void;
}

/** A row of the record picker: unlinking, or a record of a collection. */
type PickRow = { none: true } | { dir: string; record: CollectionRecord };

/**
 * The records a task can be about, under the button that opened it, after the Task record view
 * of design/mockups.html: found by name or code as it is typed, under the collection each is
 * in. The arrows move through them, Enter or a click links one, Esc closes. With a record linked,
 * the first row unlinks it.
 */
function RecordPicker({ anchor, current, choices, onPick, onClose }: {
  anchor: HTMLElement;
  current: TaskRecord | null;
  choices: { dir: string; records: CollectionRecord[] }[];
  onPick: (record: TaskRecord | null) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const q = typed.trim().toLowerCase();
  const groups = choices
    .map((c) => ({ dir: c.dir, records: c.records.filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)).slice(0, 8) }))
    .filter((g) => g.records.length > 0);
  const rows: PickRow[] = [...(current ? [{ none: true as const }] : []), ...groups.flatMap((g) => g.records.map((record) => ({ dir: g.dir, record })))];
  const pick = (row: PickRow | undefined) => {
    if (!row) return;
    if ('none' in row) return onPick(null);
    const { record, dir } = row;
    onPick({ collection: dir, id: record.id, name: record.name, ...(record.code && { code: record.code }) });
  };
  useLayoutEffect(() => {
    const button = pageBox(anchor);
    const width = 300;
    setPlace({ top: button.bottom + 4, left: Math.max(8, Math.min(button.right - width, pageWindow().width - width - 8)), width });
  }, [anchor]);
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) close.current();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor]);
  useEffect(() => {
    if (at > rows.length - 1) setAt(Math.max(0, rows.length - 1));
  }, [rows.length, at]);
  let index = -1;
  const row = (r: PickRow, label: ReactNode) => {
    index += 1;
    const i = index;
    return (
      <button
        key={'none' in r ? 'none' : `${r.dir}#${r.record.id}`}
        type="button"
        role="option"
        aria-selected={i === at}
        tabIndex={-1}
        className={i === at ? 'rr at' : 'rr'}
        onMouseDown={(event) => event.preventDefault()}
        onMouseMove={() => i !== at && setAt(i)}
        onClick={() => pick(r)}
      >
        {label}
      </button>
    );
  };
  return createPortal(
    <div ref={box} className="opt-list rpick" role="listbox" aria-label={t('tasks.record')} style={place ?? { opacity: 0 }}>
      <input
        autoFocus
        aria-label={t('tasks.findRecord')}
        placeholder={t('tasks.findRecord')}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setAt(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') setAt(at >= rows.length - 1 ? 0 : at + 1);
          else if (event.key === 'ArrowUp') setAt(at <= 0 ? rows.length - 1 : at - 1);
          else if (event.key === 'Enter') pick(rows[at]);
          else if (event.key === 'Escape') onClose();
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      {current && row({ none: true }, <span className="none">{t('tasks.noRecord')}</span>)}
      {groups.map((group) => (
        <div key={group.dir} className="rg-list">
          <div className="rg">{collectionLabel(group.dir)}</div>
          {group.records.map((record) =>
            row(
              { dir: group.dir, record },
              <>
                <b>{recordTitle(record)}</b>
                {record.name && record.code && <small>{record.code}</small>}
              </>,
            ),
          )}
        </div>
      ))}
      {groups.length === 0 && <p className="rnone">{t('collection.noRecords')}</p>}
    </div>,
    document.body,
  );
}

/** What a task row or a section header does when its grip is dragged. */
interface DragHandlers {
  grab: (event: DragEvent<HTMLElement>, what: { task: Task } | { section: Section }) => void;
  release: () => void;
  /** A finger held on the row, which lifts it after a moment; let go there without carrying it, `still` is called. */
  hold: (event: ReactPointerEvent<HTMLElement>, what: { task: Task } | { section: Section }, still?: () => void) => void;
}

export const GRIP = (
  <svg viewBox="0 0 10 14" aria-hidden="true">
    <circle cx="2.5" cy="2.5" r="1.3" />
    <circle cx="7.5" cy="2.5" r="1.3" />
    <circle cx="2.5" cy="7" r="1.3" />
    <circle cx="7.5" cy="7" r="1.3" />
    <circle cx="2.5" cy="11.5" r="1.3" />
    <circle cx="7.5" cy="11.5" r="1.3" />
  </svg>
);

/** The handle a row is dragged by; it shows when the row is hovered. */
function Grip({ title, onGrab, onRelease }: { title: string; onGrab: (event: DragEvent<HTMLElement>) => void; onRelease: () => void }) {
  return (
    <span className="grip" title={title} draggable onDragStart={onGrab} onDragEnd={onRelease}>
      {GRIP}
    </span>
  );
}

const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'long' };
const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** A due day the way people say it: Today, Tomorrow, a weekday within the week, else a date. */
export function dueLabel(day: string, today: string): string {
  if (day === today) return t('day.today');
  if (day === addDays(today, 1)) return t('day.tomorrow');
  if (day === addDays(today, -1)) return t('day.yesterday');
  const date = toDate(day);
  if (day > today && day < addDays(today, 7)) return date.toLocaleDateString(locale(), WEEKDAY);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(locale(), sameYear ? SHORT : { ...SHORT, year: 'numeric' });
}

export const dueClass = (day: string, today: string) => (day < today ? 'due late' : day === today ? 'due today' : 'due');

/** The next Monday after `today`. */
function nextWeek(today: string): string {
  const weekday = toDate(today).getDay();
  return addDays(today, (8 - weekday) % 7 || 7);
}

/** The buttons under a row being typed keep the focus in it, so pressing them is not leaving it. */
const keepTyping = (event: MouseEvent) => event.preventDefault();

/** The row a new task is typed into. Add task, or Enter, adds it and keeps the row for the next one. */
function Composer({ placeholder, onAdd, onClose }: { placeholder: string; onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const add = () => {
    if (!title.trim()) return;
    onAdd(title);
    setTitle('');
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') add();
    else if (event.key === 'Escape') onClose();
  };
  return (
    <div className="task composing">
      <span className="cb" />
      <input
        className="tt-edit"
        aria-label={placeholder}
        placeholder={placeholder}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKey}
        onBlur={() => !title.trim() && onClose()}
      />
      <div className="edit-foot">
        <button type="button" className="ghost" onMouseDown={keepTyping} onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!title.trim()} onMouseDown={keepTyping} onClick={add}>
          {t('tasks.add')}
        </button>
      </div>
    </div>
  );
}

/** A text field as tall as what is written in it. */
function GrowingField({ value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return <textarea ref={field} rows={2} value={value} {...props} />;
}

function IconButton({ icon, title, onClick }: { icon: IconName; title: string; onClick: (event: MouseEvent) => void }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

interface ItemProps {
  /** The path of the list the task is in. */
  list: string;
  task: Task;
  /** The whole list the task is in. */
  tasks: Task[];
  today: string;
  showDone: boolean;
  actions: TaskActions;
  /** In the views over all lists: the task alone, with the list it is in. */
  flat?: boolean;
  /** In a view that groups its tasks by list: the list is not named again. */
  grouped?: boolean;
  /** In a list, where tasks can be dragged to another place. */
  drag?: DragHandlers;
}

/** A task's title and description while they are edited. */
interface Draft {
  title: string;
  description: string;
}

/** A task: on a phone a row of its own, else the desktop's. */
function TaskItem(props: ItemProps) {
  return isPhone() ? <PhoneTaskItem {...props} /> : <DesktopTaskItem {...props} />;
}

/** On a phone, a menu opens from the bottom wherever it was asked for. */
const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;
/** How far a row is pulled right before letting go finishes the task. */
const DONE_PULL = 96;
/** How wide Date and More are, behind a row pulled left. */
const ACTIONS_WIDTH = 152;
/** How far a finger moves before it is scrolling or pulling a row rather than holding it. */
const TOUCH_SLOP = 8;
/** How long a finger rests on a row, where it cannot be dragged, before its actions open. */
const HOLD_MS = 450;

/**
 * A task on a phone, after the Phone tasks views of design/mockups.html: its box, its name, its
 * description and a line of what it has; its subtasks a step in. A tap opens it as a sheet.
 * Pulled right it is done; pulled left it shows Date and More. Held, it lifts: let go where it is,
 * its actions open; carried, it moves.
 */
function PhoneTaskItem({ list, task, tasks, today, showDone, actions, flat, grouped, drag }: ItemProps) {
  const row = useRef<HTMLDivElement>(null);
  /** How far a finger has pulled the row, while it does. */
  const [pull, setPull] = useState<number | null>(null);
  /** Pulled left and let go: Date and More stay out. */
  const [opened, setOpened] = useState(false);
  const touch = useRef<{ x: number; y: number; way: 'across' | 'down' | null; from: number; timer: number; held: boolean } | null>(null);
  /** The tap that ends a pull or a hold is not a tap on the row. */
  const swallow = useRef(false);

  const children = flat ? [] : childrenOf(tasks, task.id).filter((child) => showDone || !child.done);
  const progress = progressOf(tasks, task.id);
  const canNest = !flat && depthOf(tasks, task.id) < MAX_DEPTH;
  const head: MenuHead = { icon: 'tasks', title: task.title, sub: t('phone.taskIn', { list: listLabel(list) }) };

  const priorityMenu = () =>
    actions.menu(
      NO_POINTER,
      ([1, 2, 3, 4] as Priority[]).map((priority) => ({
        label: priority === 4 ? t('tasks.noPriority') : t('tasks.priorityN', { n: priority }),
        icon: 'flag' as const,
        className: `p${priority}`,
        value: priority === task.priority ? '✓' : undefined,
        run: () => actions.update(list, task.id, { priority }),
      })),
      head,
    );
  const more = () =>
    actions.menu(
      NO_POINTER,
      [
        ...(canNest ? [{ label: t('tasks.addSubtask'), icon: 'plus' as const, run: () => actions.open?.(list, task.id, true) }] : []),
        { label: t('tasks.dateMenu'), icon: 'calendar', run: () => actions.pickDate?.(list, task.id) },
        { label: t('tasks.priorityMenu'), icon: 'flag', run: priorityMenu },
        { label: t('tasks.recordMenu'), icon: 'collection', run: () => actions.pickRecord?.(list, task.id) },
        { label: t('tasks.moveTo'), icon: 'move', run: () => actions.moveTo(list, task.id) },
        { label: t('tasks.delete'), icon: 'trash', danger: true, run: () => actions.remove(list, task.id) },
      ],
      head,
    );
  /** Held and let go: the row lifts over the dim and its actions open. */
  const held = () => {
    if (row.current) liftUntilTouch(row.current);
    more();
  };

  // Out, Date and More go back in at a touch anywhere else.
  useEffect(() => {
    if (!opened) return;
    const away = (event: PointerEvent) => !row.current?.contains(event.target as Node) && setOpened(false);
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [opened]);

  const start = (event: ReactTouchEvent) => {
    if (event.touches.length > 1) return;
    const point = event.touches[0]!;
    swallow.current = false;
    // Where the row cannot be dragged, a finger resting on it opens its actions.
    const timer = drag
      ? 0
      : window.setTimeout(() => {
          if (!touch.current || touch.current.way) return;
          touch.current.held = true;
          swallow.current = true;
          held();
        }, HOLD_MS);
    touch.current = { x: point.clientX, y: point.clientY, way: null, from: opened ? -ACTIONS_WIDTH : 0, timer, held: false };
  };
  const move = (event: ReactTouchEvent) => {
    const at = touch.current;
    if (!at || at.held || row.current?.classList.contains('lifted')) return;
    const point = event.touches[0]!;
    const x = point.clientX - at.x;
    const y = point.clientY - at.y;
    if (!at.way && Math.max(Math.abs(x), Math.abs(y)) > TOUCH_SLOP) {
      at.way = Math.abs(x) > Math.abs(y) ? 'across' : 'down';
      window.clearTimeout(at.timer);
    }
    if (at.way !== 'across') return;
    swallow.current = true;
    setPull(Math.max(-ACTIONS_WIDTH * 1.4, Math.min(DONE_PULL * 1.6, at.from + x)));
  };
  const end = (event: ReactTouchEvent) => {
    const at = touch.current;
    touch.current = null;
    if (!at) return;
    window.clearTimeout(at.timer);
    if (at.held) event.preventDefault();
    if (at.way === 'across' && pull !== null) {
      if (pull > DONE_PULL) {
        setOpened(false);
        actions.setDone(list, task.id, !task.done);
      } else setOpened(pull < -ACTIONS_WIDTH / 2);
    }
    setPull(null);
  };
  const offset = pull ?? (opened ? -ACTIONS_WIDTH : 0);

  // What the task has, on a line under it: its date, its list in the views over all lists, how
  // many subtasks are done, its record, the note or card it came from.
  const noteName = task.note ? actions.noteTitle(task.note) : null;
  const cardKey = task.card ? actions.cardLabel(task.card) : null;
  const meta = [
    task.due && (
      <span key="due" className={dueClass(task.due, today)}>
        <Icon name="calendar" />
        {dueLabel(task.due, today)}
      </span>
    ),
    flat && !grouped && (
      <span key="list">
        <Icon name="tasks" />
        {listWhere(list)}
      </span>
    ),
    progress.total > 0 && <span key="progress">{t('tasks.progress', { done: progress.done, total: progress.total })}</span>,
    task.assignee && (
      <span key="who">
        <Icon name="person" />
        {firstName(task.assignee, actions.people?.(list)?.people)}
      </span>
    ),
    task.record && (
      <span key="record">
        <Icon name="collection" />
        {actions.recordTitle(task.record)}
      </span>
    ),
    noteName && (
      <span key="note">
        <Icon name="note" />
        {noteName}
      </span>
    ),
    cardKey && (
      <span key="card">
        <Icon name="board" />
        {cardKey}
      </span>
    ),
  ].filter(Boolean);

  return (
    <>
      <div
        ref={row}
        className={['mb-task', task.done && 'done', opened && 'opened', pull !== null && 'pulling'].filter(Boolean).join(' ')}
        data-row="task"
        data-id={task.id}
        data-depth={depthOf(tasks, task.id)}
        onPointerDown={drag ? (event) => !pressOnField(event) && drag.hold(event, { task }, held) : undefined}
        onContextMenu={(event) => {
          // A long press where the phone sends one; while it is dragged, the drag has it.
          event.preventDefault();
          if (!drag && !touch.current?.held) held();
        }}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        onTouchCancel={end}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest('.mb-swa')) return;
          if (swallow.current || opened) {
            event.preventDefault();
            event.stopPropagation();
            swallow.current = false;
            setOpened(false);
          }
        }}
      >
        <span className="mb-swa l" aria-hidden="true" style={{ width: Math.max(0, offset) }}>
          <span className={offset > DONE_PULL ? 'done on' : 'done'}>
            <Icon name="check" />
            {t(task.done ? 'phone.reopen' : 'phone.done')}
          </span>
        </span>
        <span className="mb-swa r" aria-hidden={!opened}>
          <button
            type="button"
            className="date"
            tabIndex={opened ? 0 : -1}
            onClick={() => {
              setOpened(false);
              actions.pickDate?.(list, task.id);
            }}
          >
            <Icon name="calendar" />
            {t('tasks.date')}
          </button>
          <button
            type="button"
            className="more"
            tabIndex={opened ? 0 : -1}
            onClick={() => {
              setOpened(false);
              more();
            }}
          >
            <Icon name="more" />
            {t('tasks.more')}
          </button>
        </span>
        <div className={pull === null ? 'slide' : 'slide moving'} style={offset ? { transform: `translateX(${offset}px)` } : undefined}>
          <button
            type="button"
            className={`cb p${task.priority}`}
            role="checkbox"
            aria-checked={task.done}
            aria-label={t(task.done ? 'tasks.reopen' : 'tasks.complete', { name: task.title })}
            onClick={() => actions.setDone(list, task.id, !task.done)}
          />
          <button type="button" className="tx" onClick={() => actions.open?.(list, task.id)}>
            <b>{task.title}</b>
            {task.description && <span className="desc">{task.description}</span>}
            {meta.length > 0 && <span className="meta">{meta}</span>}
          </button>
        </div>
      </div>
      {children.length > 0 && (
        <div className="subs">
          {children.map((child) => (
            <TaskItem key={child.id} list={list} task={child} tasks={tasks} today={today} showDone={showDone} actions={actions} drag={drag} />
          ))}
        </div>
      )}
    </>
  );
}

function DesktopTaskItem({ list, task, tasks, today, showDone, actions, flat, grouped, drag }: ItemProps) {
  const [editing, setEditing] = useState<Draft | null>(null);
  // The record button, while its list of records is open under it.
  const [picking, setPicking] = useState<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const datePicker = useRef<HTMLInputElement>(null);

  const children = flat ? [] : childrenOf(tasks, task.id).filter((child) => showDone || !child.done);
  const progress = progressOf(tasks, task.id);
  const canNest = !flat && depthOf(tasks, task.id) < MAX_DEPTH;

  // In a space with people a task is given to one of them, from the button that opened the list.
  const team = actions.people?.(list) ?? null;
  const [assigning, setAssigning] = useState<HTMLElement | null>(null);
  const startEditing = () => setEditing({ title: task.title, description: task.description ?? '' });
  const save = () => {
    if (!editing) return;
    const patch: TaskPatch = {};
    if (editing.title.trim() && editing.title !== task.title) patch.title = editing.title;
    if (editing.description.trim() !== (task.description ?? '')) patch.description = editing.description;
    if (Object.keys(patch).length > 0) actions.update(list, task.id, patch);
    setEditing(null);
  };
  const cancel = () => setEditing(null);
  // Cancel and Save keep the focus in the fields, so pressing them is not leaving the editor, which saves.
  const keepFocus = (event: MouseEvent) => event.preventDefault();
  const setDue = (due: string | null) => actions.update(list, task.id, { due });

  const dateMenu = (event: MouseEvent) =>
    actions.menu(event, [
      { label: t('day.today'), run: () => setDue(today) },
      { label: t('day.tomorrow'), run: () => setDue(addDays(today, 1)) },
      { label: t('tasks.nextWeek'), run: () => setDue(nextWeek(today)) },
      { label: t('tasks.pickDate'), run: () => datePicker.current?.showPicker() },
      ...(task.due ? [{ label: t('tasks.noDate'), run: () => setDue(null) }] : []),
    ]);
  // On a touch screen one button opens everything the row's buttons do. The date and priority
  // menus it leads to open where it was pressed.
  const moreMenu = (event: MouseEvent) => {
    const point = { clientX: event.clientX, clientY: event.clientY, preventDefault: () => undefined } as MouseEvent;
    // Where a touch screen shows only this button, the record is picked from here too, under it.
    const button = event.currentTarget as HTMLElement;
    actions.menu(event, [
      ...(canNest
        ? [
            {
              label: t('tasks.addSubtask'),
              run: () => {
                setOpen(true);
                setAdding(true);
              },
            },
          ]
        : []),
      { label: t('tasks.dateMenu'), run: () => dateMenu(point) },
      { label: t('tasks.priorityMenu'), run: () => priorityMenu(point) },
      ...(team ? [{ label: t('tasks.assignMenu'), run: () => setAssigning(button) }] : []),
      { label: t('tasks.recordMenu'), run: () => setPicking(button) },
      { label: t('tasks.moveTo'), run: () => actions.moveTo(list, task.id) },
      { label: t('tasks.delete'), run: () => actions.remove(list, task.id) },
    ]);
  };
  const priorityMenu = (event: MouseEvent) =>
    actions.menu(
      event,
      ([1, 2, 3, 4] as Priority[]).map((priority) => ({
        label: `${priority === task.priority ? '✓ ' : ''}${priority === 4 ? t('tasks.noPriority') : t('tasks.priorityN', { n: priority })}`,
        run: () => actions.update(list, task.id, { priority }),
      })),
    );

  // The note the task was made from: a link to it, or only its name once the note is gone.
  const noteName = task.note ? actions.noteTitle(task.note) : null;
  const from =
    task.note &&
    (noteName !== null ? (
      <button type="button" className="from" onClick={() => actions.openNote(task.note!)}>
        {t('tasks.from', { note: noteName })}
      </button>
    ) : (
      <span className="from gone">{t('tasks.from', { note: basename(task.note).replace(/\.md$/, '') })}</span>
    ));
  // The card the task was made from, by its key, or its reference once the card is gone.
  const cardKey = task.card ? actions.cardLabel(task.card) : null;
  const ref = task.card ? parseCardRef(task.card) : null;
  const fromCard =
    task.card &&
    (cardKey !== null && ref ? (
      <button type="button" className="from" onClick={() => actions.openCard(ref.board, ref.id)}>
        {t('tasks.fromCard', { card: cardKey })}
      </button>
    ) : (
      <span className="from gone">{t('tasks.fromCard', { card: '?' })}</span>
    ));
  // The record the task is about, by what it is called now; a click opens it.
  const about = task.record && (
    <button type="button" className="from rec" title={t('collection.openRecord')} onClick={() => actions.openRecord(task.record!.collection, task.record!.id)}>
      <Icon name="collection" />
      {actions.recordTitle(task.record)}
    </button>
  );
  const meta = (task.due || progress.total > 0 || (flat && !grouped) || task.assignee || from || fromCard || about) && (
    <div className="meta">
      {task.due && (
        <button type="button" className={dueClass(task.due, today)} title={t('tasks.changeDate')} onClick={dateMenu}>
          {dueLabel(task.due, today)}
        </button>
      )}
      {progress.total > 0 &&
        (flat ? (
          <span>{t('tasks.progress', { done: progress.done, total: progress.total })}</span>
        ) : (
          <button type="button" aria-expanded={open} title={t(open ? 'tasks.hideSubtasks' : 'tasks.showSubtasks')} onClick={() => setOpen(!open)}>
            {open ? '▾' : '▸'} {t('tasks.progress', { done: progress.done, total: progress.total })}
          </button>
        ))}
      {flat && !grouped && <span>{listWhere(list)}</span>}
      {task.assignee && <AssigneeChip assignee={task.assignee} people={team?.people} />}
      {from}
      {fromCard}
      {about}
    </div>
  );
  const className = ['task', task.done && 'done', editing && 'editing'].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={className}
        data-row="task"
        data-id={task.id}
        data-depth={depthOf(tasks, task.id)}
        onPointerDown={drag && !editing ? (event) => !pressOnField(event) && drag.hold(event, { task }) : undefined}
        onContextMenu={
          editing
            ? undefined
            : (event) =>
                actions.menu(event, [
                  { label: t('tasks.moveTo'), run: () => actions.moveTo(list, task.id) },
                  { label: t('tasks.delete'), run: () => actions.remove(list, task.id) },
                ])
        }
        // Leaving the editor, by a click elsewhere or by Tab, saves it.
        onBlur={editing ? (event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && save() : undefined}
      >
        {drag && !editing && <Grip title={t('tasks.drag')} onGrab={(event) => drag.grab(event, { task })} onRelease={drag.release} />}
        <button
          type="button"
          className={`cb p${task.priority}`}
          role="checkbox"
          aria-checked={task.done}
          aria-label={t(task.done ? 'tasks.reopen' : 'tasks.complete', { name: task.title })}
          onClick={() => actions.setDone(list, task.id, !task.done)}
        />
        {editing ? (
          <>
            <div className="task-body">
              <input
                className="tt-edit"
                aria-label={t('tasks.title')}
                autoFocus
                value={editing.title}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    save();
                  } else if (event.key === 'Escape') cancel();
                }}
              />
              <GrowingField
                className="desc-edit"
                aria-label={t('tasks.description')}
                placeholder={t('tasks.description')}
                value={editing.description}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') cancel();
                }}
              />
              {meta}
            </div>
            <div className="edit-foot">
              <button type="button" className="ghost" onMouseDown={keepFocus} onClick={cancel}>
                {t('dialog.cancel')}
              </button>
              <button type="button" className="primary" onMouseDown={keepFocus} onClick={save}>
                {t('card.save')}
              </button>
            </div>
          </>
        ) : (
          <div className="task-body">
            <button type="button" className="tt" onClick={startEditing}>
              {task.title}
            </button>
            {task.description && <div className="desc">{task.description}</div>}
            {meta}
          </div>
        )}
        <div className="task-actions">
          {canNest && (
            <IconButton
              icon="subtask"
              title={t('tasks.addSubtask')}
              onClick={() => {
                setOpen(true);
                setAdding(true);
              }}
            />
          )}
          <IconButton icon="calendar" title={t('tasks.date')} onClick={dateMenu} />
          <IconButton icon="flag" title={t('tasks.priority')} onClick={priorityMenu} />
          {team && <IconButton icon="person" title={t('tasks.assignee')} onClick={(event) => setAssigning(assigning ? null : (event.currentTarget as HTMLElement))} />}
          <IconButton icon="collection" title={t('tasks.record')} onClick={(event) => setPicking(picking ? null : (event.currentTarget as HTMLElement))} />
          <IconButton icon="move" title={t('tasks.moveTo')} onClick={() => actions.moveTo(list, task.id)} />
          <button type="button" className="task-more" title={t('tasks.more')} aria-label={t('tasks.more')} onClick={moreMenu}>
            ···
          </button>
          <IconButton icon="trash" title={t('tasks.delete')} onClick={() => actions.remove(list, task.id)} />
          <input
            ref={datePicker}
            className="date-picker"
            type="date"
            aria-label={t('tasks.dueDate')}
            tabIndex={-1}
            value={task.due ?? ''}
            onChange={(event) => setDue(event.target.value || null)}
          />
        </div>
      </div>
      {picking && (
        <RecordPicker
          anchor={picking}
          current={task.record ?? null}
          choices={actions.recordChoices()}
          onPick={(record) => {
            setPicking(null);
            actions.update(list, task.id, { record });
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {assigning && team && (
        <PersonPicker
          anchor={assigning}
          team={team}
          current={task.assignee ?? null}
          onPick={(assignee) => {
            setAssigning(null);
            actions.update(list, task.id, { assignee });
          }}
          onClose={() => setAssigning(null)}
        />
      )}
      {(children.length > 0 || adding) && open && (
        <div className="subs">
          {children.map((child) => (
            <TaskItem key={child.id} list={list} task={child} tasks={tasks} today={today} showDone={showDone} actions={actions} drag={drag} />
          ))}
          {adding && (
            <Composer placeholder={t('tasks.subtaskName')} onAdd={(title) => actions.add(list, { title, parent: task.id })} onClose={() => setAdding(false)} />
          )}
        </div>
      )}
    </>
  );
}

/** The header and list frame the task views share, with the add row at the end of the list. */
function TaskPage({ title, detail, extra, onAdd, onAddClick, footer, bare, adding, children }: {
  title: string;
  detail?: string;
  /** More in the header, after the detail. */
  extra?: ReactNode;
  /** Without it the view cannot add tasks. */
  onAdd?: (title: string) => void;
  /** Instead of `onAdd`: the header's Add task button only says it was pressed; the view adds the row itself. */
  onAddClick?: () => void;
  /** Shown under the add row. */
  footer?: ReactNode;
  /** Without the header: a phone's page has its own title, and its + adds. */
  bare?: boolean;
  /** Counts the times something outside asked for the add row, a phone's + button. */
  adding?: number;
  children: ReactNode;
}) {
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (adding) setComposing(true);
  }, [adding]);
  if (isPhone()) {
    return (
      <section className="tasks mb-tasks">
        {!bare && (
          <header className="mb-head">
            <h1>{title}</h1>
            {extra && <div className="mb-chips">{extra}</div>}
          </header>
        )}
        <div className="tl">
          {children}
          {footer}
        </div>
      </section>
    );
  }
  return (
    <section className="tasks">
      {!bare && (
        <header className="th">
          <b>{title}</b>
          {detail && <span>{detail}</span>}
          {extra}
          {(onAdd || onAddClick) && (
            <button type="button" className="add" onClick={onAddClick ?? (() => setComposing(true))}>
              {t('tasks.add')}
            </button>
          )}
        </header>
      )}
      <div className="tl">
        {children}
        {onAdd &&
          (composing ? (
            <Composer placeholder={t('tasks.name')} onAdd={onAdd} onClose={() => setComposing(false)} />
          ) : (
            <button type="button" className="qa" onClick={() => setComposing(true)}>
              {t('tasks.addRow')}
            </button>
          ))}
        {footer}
      </div>
    </section>
  );
}

const DRAG_TYPE = 'application/x-scrawl-task';
/** How far a subtask sits to the right of its parent; dragging that far right or left changes the level. */
const INDENT = 28;

/** A task or a section being dragged by its grip. */
interface Dragging {
  kind: 'task' | 'section';
  id: string;
  /** A task's level where it was picked up. */
  depth: number;
  /** How many levels of subtasks go with it. */
  height: number;
  startX: number;
  /** Its own rows, which are no place to drop it. */
  lifted: HTMLElement[];
}

/** Where a drag would land: the line that shows it, or the folded section it would go into. */
interface Drop {
  line?: { top: number; left: number };
  into?: string;
  /** For a task. */
  place?: TaskPlace;
  /** For a section: the one it would follow, null for the top. */
  after?: string | null;
}

const sameDrop = (a: Drop | null, b: Drop) =>
  a !== null &&
  a.line?.top === b.line?.top &&
  a.line?.left === b.line?.left &&
  a.into === b.into &&
  a.after === b.after &&
  a.place?.parent === b.place?.parent &&
  a.place?.section === b.place?.section &&
  a.place?.after === b.place?.after;

function subtaskLevels(tasks: Task[], id: string): number {
  const children = tasks.filter((t) => t.parent === id);
  return children.length === 0 ? 0 : 1 + Math.max(...children.map((child) => subtaskLevels(tasks, child.id)));
}

/** The picture that follows the pointer: the task's checkbox and title, or the section's name. */
function dragImage(event: DragEvent<HTMLElement>, label: string, checkbox?: string) {
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  if (checkbox) ghost.append(Object.assign(document.createElement('span'), { className: `cb ${checkbox}` }));
  ghost.append(label);
  document.body.append(ghost);
  event.dataTransfer.setDragImage(ghost, 14, 16);
  requestAnimationFrame(() => ghost.remove());
}

/** The rows a drag can land between, in order: task rows and section headers, not its own. */
function dropRows(container: HTMLElement, d: Dragging): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-row]')].filter(
    (row) => !d.lifted.some((lifted) => lifted === row || lifted.contains(row)),
  );
}

const depthOfRow = (row: HTMLElement) => Number(row.dataset.depth ?? 0);

/** Where the rows start inside the drop area, which reaches into the list's margin. */
const margin = (container: HTMLElement) => parseFloat(getComputedStyle(container).paddingLeft) || 0;

/**
 * Where a dragged task would land. The pointer's height picks the gap between two rows; how far
 * it moved right or left since the task was picked up picks the level, from the top level up to
 * one below the task above. A folded section's header takes the task in at its end.
 */
function taskDrop(container: HTMLElement, d: Dragging, event: { clientX: number; clientY: number }, list: List): Drop {
  const box = container.getBoundingClientRect();
  const rows = dropRows(container, d);
  const y = event.clientY;
  const folded = rows.find((row) => {
    if (row.dataset.row !== 'section' || row.dataset.collapsed !== 'true') return false;
    const r = row.getBoundingClientRect();
    return y >= r.top && y < r.bottom;
  });
  if (folded) {
    const section = folded.dataset.id!;
    const last = sectionTasks(list, section).filter((t) => t.id !== d.id).pop();
    return { into: section, place: { parent: null, section, after: last?.id ?? null } };
  }

  let index = rows.findIndex((row) => {
    const r = row.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  if (index < 0) index = rows.length;
  const above = rows.slice(0, index);
  const prev = above[above.length - 1];
  const next = rows[index];
  const prevTask = prev?.dataset.row === 'task' ? prev : null;
  const max = prevTask ? Math.min(depthOfRow(prevTask) + 1, MAX_DEPTH - d.height) : 0;
  const min = Math.min(next?.dataset.row === 'task' ? depthOfRow(next) : 0, max);
  const level = Math.max(min, Math.min(max, d.depth + Math.round(onPage(event.clientX - d.startX) / INDENT)));

  // Walking up from the gap: the first row at the level is the task it follows, the first one
  // above the level is its parent. A section header ends the walk.
  let parent: string | null = null;
  let after: string | null = null;
  for (let i = above.length - 1; i >= 0; i--) {
    const row = above[i]!;
    if (row.dataset.row === 'section') break;
    const depth = depthOfRow(row);
    if (depth === level && after === null) after = row.dataset.id!;
    if (depth < level) {
      parent = row.dataset.id!;
      break;
    }
  }
  const header = [...above].reverse().find((row) => row.dataset.row === 'section');
  const section = level === 0 ? (header?.dataset.id ?? null) : null;
  // Before a task the line is at its top. At the end of a section it is right under the section's
  // last row, above the section's add row, not at the next section's header.
  const edge =
    next?.dataset.row === 'task'
      ? next.getBoundingClientRect().top
      : (prev?.getBoundingClientRect().bottom ?? next?.getBoundingClientRect().top ?? box.top);
  return { line: { top: onPage(edge - box.top), left: margin(container) + level * INDENT }, place: { parent, section, after } };
}

/** Where a dragged section would land: before the header under the pointer's half, or at the end. */
function sectionDrop(container: HTMLElement, d: Dragging, event: { clientX: number; clientY: number }): Drop {
  const box = container.getBoundingClientRect();
  const headers = dropRows(container, d).filter((row) => row.dataset.row === 'section');
  let index = headers.findIndex((row) => {
    const r = row.getBoundingClientRect();
    return event.clientY < r.top + r.height / 2;
  });
  if (index < 0) index = headers.length;
  const after = index > 0 ? headers[index - 1]!.dataset.id! : null;
  const top = onPage(index < headers.length ? headers[index]!.getBoundingClientRect().top - box.top : box.height);
  return { line: { top, left: margin(container) }, after };
}

/** The row a new section's name is typed into. */
function SectionComposer({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const done = () => {
    if (name.trim()) onAdd(name);
    onClose();
  };
  return (
    <div className="sec fold composing">
      <span className="chev" aria-hidden="true">
        ▾
      </span>
      <input
        className="sec-edit"
        aria-label={t('sections.name')}
        placeholder={t('sections.name')}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={done}
        onKeyDown={(event) => {
          if (event.key === 'Enter') done();
          else if (event.key === 'Escape') onClose();
        }}
      />
      <div className="edit-foot">
        <button type="button" className="ghost" onMouseDown={keepTyping} onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!name.trim()} onMouseDown={keepTyping} onClick={done}>
          {t('sections.add')}
        </button>
      </div>
    </div>
  );
}

/**
 * A section of a list: its header, which folds it and offers its menu, then its tasks and the
 * row that adds one, after the Sections view of design/mockups.html (direction A).
 */
function SectionBlock({ list, section, top, item, actions, drag, dropInto }: {
  list: string;
  section: Section;
  /** Its top-level tasks, as far as they are shown. */
  top: Task[];
  item: (task: Task) => ReactNode;
  actions: TaskActions;
  drag: DragHandlers;
  /** A task dragged over the folded section would go in at its end. */
  dropInto: boolean;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const open = !section.collapsed;
  const rename = () => {
    if (renaming !== null) actions.renameSection(list, section.id, renaming);
    setRenaming(null);
  };
  const phone = isPhone();
  // On a phone the name is changed in a sheet.
  const startRenaming = () => (phone && actions.nameSection ? actions.nameSection(list, section) : setRenaming(section.name));
  const menu = (event: MouseEvent) =>
    actions.menu(
      event,
      [
        { label: t('menu.rename'), icon: 'pen', run: startRenaming },
        {
          label: t('tasks.add'),
          icon: 'plus',
          run: () => {
            if (!open) actions.foldSection(list, section.id, false);
            if (phone && actions.quickAdd) actions.quickAdd(list, section.id);
            else setComposing(true);
          },
        },
        { label: t('sections.delete'), icon: 'trash', danger: true, run: () => actions.removeSection(list, section) },
      ],
      { icon: 'tasks', title: section.name, sub: t('phone.sectionIn', { list: listLabel(list) }) },
    );
  return (
    <div className="section">
      <div
        className={['sec fold', phone && 'mb-tsec', !open && 'closed', dropInto && 'drop-into', renaming !== null && 'composing'].filter(Boolean).join(' ')}
        data-row="section"
        data-id={section.id}
        data-collapsed={!open}
        onPointerDown={renaming === null ? (event) => !pressOnField(event) && drag.hold(event, { section }) : undefined}
        onContextMenu={menu}
      >
        {renaming === null && <Grip title={t('sections.drag')} onGrab={(event) => drag.grab(event, { section })} onRelease={drag.release} />}
        <button
          type="button"
          className="chev"
          aria-expanded={open}
          aria-label={t(open ? 'sections.fold' : 'sections.unfold', { name: section.name })}
          onClick={() => actions.foldSection(list, section.id, open)}
        >
          {phone ? <Icon name="chevron" /> : open ? '▾' : '▸'}
        </button>
        {renaming === null ? (
          <button type="button" className="sec-name" onClick={startRenaming}>
            {section.name}
          </button>
        ) : (
          <>
            <input
              className="sec-edit"
              aria-label={t('sections.name')}
              autoFocus
              value={renaming}
              onChange={(event) => setRenaming(event.target.value)}
              onBlur={rename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') rename();
                else if (event.key === 'Escape') setRenaming(null);
              }}
            />
            <div className="edit-foot">
              <button type="button" className="ghost" onMouseDown={keepTyping} onClick={() => setRenaming(null)}>
                {t('dialog.cancel')}
              </button>
              <button type="button" className="primary" disabled={!renaming.trim()} onMouseDown={keepTyping} onClick={rename}>
                {t('sections.save')}
              </button>
            </div>
          </>
        )}
        {renaming === null && (
          <>
            <small>{top.filter((task) => !task.done).length}</small>
            <button type="button" className="more" title={t('sections.menu')} aria-label={t('sections.menu')} onClick={menu}>
              ···
            </button>
          </>
        )}
      </div>
      {open && (
        <>
          {top.map(item)}
          {composing ? (
            <Composer
              placeholder={t('tasks.name')}
              onAdd={(title) => actions.add(list, { title, section: section.id })}
              onClose={() => setComposing(false)}
            />
          ) : (
            !phone && (
              <button type="button" className="qa" onClick={() => setComposing(true)}>
                {t('tasks.addRow')}
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

/**
 * One task list, with the folder it is in beside its name. Tasks in no section come first,
 * without a header; then each section; then the row that adds a section.
 */
export function TaskList({ list, tasks, sections, today, actions }: {
  list: string;
  tasks: Task[];
  sections: Section[];
  today: string;
  actions: TaskActions;
}) {
  const [showDone, setShowDone] = useState(false);
  const [composing, setComposing] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const whole: List = { sections, tasks };
  const shown = (task: Task) => showDone || !task.done;
  const rows = useRef<HTMLDivElement>(null);
  const dragging = useRef<Dragging | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  // The same, for a finger letting go, which comes before the state is drawn.
  const dropping = useRef<Drop | null>(null);

  const release = () => {
    dragging.current = null;
    dropping.current = null;
    setDrop(null);
    for (const lifted of rows.current?.querySelectorAll('.lifted') ?? []) lifted.classList.remove('lifted');
  };
  /** Picks up a task or a section from an element of its row, the pointer or the finger at `x`. */
  const pickUp = (handle: HTMLElement, x: number, what: { task: Task } | { section: Section }) => {
    if ('task' in what) {
      const { task } = what;
      // The row and the subtasks under it are lifted; none of them is a place to drop it.
      const row = handle.closest<HTMLElement>('[data-row]')!;
      const subs = row.nextElementSibling?.classList.contains('subs') ? (row.nextElementSibling as HTMLElement) : null;
      const lifted = [row, ...(subs ? [subs] : [])];
      dragging.current = { kind: 'task', id: task.id, depth: depthOf(tasks, task.id), height: subtaskLevels(tasks, task.id), startX: x, lifted };
    } else {
      const block = handle.closest<HTMLElement>('.section')!;
      dragging.current = { kind: 'section', id: what.section.id, depth: 0, height: 0, startX: x, lifted: [block] };
    }
  };
  const lift = () => {
    for (const element of dragging.current?.lifted ?? []) element.classList.add('lifted');
  };
  /** Where it would land, the pointer or the finger here. */
  const over = (point: { clientX: number; clientY: number }) => {
    const d = dragging.current;
    if (!d || !rows.current) return;
    const next = d.kind === 'task' ? taskDrop(rows.current, d, point, whole) : sectionDrop(rows.current, d, point);
    dropping.current = next;
    setDrop((current) => (sameDrop(current, next) ? current : next));
  };
  const land = () => {
    const d = dragging.current;
    const at = dropping.current;
    if (d && at) {
      if (d.kind === 'task' && at.place) actions.moveTask(list, d.id, at.place);
      if (d.kind === 'section' && at.after !== undefined) actions.moveSection(list, d.id, at.after);
    }
    release();
  };
  const drag: DragHandlers = {
    grab(event, what) {
      pickUp(event.currentTarget, event.clientX, what);
      if ('task' in what) dragImage(event, what.task.title, `p${what.task.priority}`);
      else dragImage(event, what.section.name);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DRAG_TYPE, dragging.current!.id);
      // Lifted after the browser has taken its picture of the row.
      requestAnimationFrame(lift);
    },
    release,
    hold(event, what, still) {
      const row = event.currentTarget;
      holdToDrag(event, {
        element: row,
        onLift: (x, y) => {
          pickUp(row, x, what);
          lift();
          over({ clientX: x, clientY: y });
        },
        onMove: (x, y) => over({ clientX: x, clientY: y }),
        onDrop: land,
        onCancel: release,
        onStill: still
          ? () => {
              release();
              still();
            }
          : undefined,
      });
    },
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    over(event);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current || !dropping.current) return;
    event.preventDefault();
    land();
  };

  const item = (task: Task) => (
    <TaskItem key={task.id} list={list} task={task} tasks={tasks} today={today} showDone={showDone} actions={actions} drag={drag} />
  );
  const completed = tasks.filter((task) => task.done).length;
  return (
    <TaskPage
      title={listName(list)}
      detail={folderLabel(dirname(list))}
      onAddClick={() => setComposing(true)}
      footer={
        completed > 0 && (
          <button type="button" className="qa" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            {t(showDone ? 'tasks.hideCompleted' : 'tasks.showCompleted', { count: completed })}
          </button>
        )
      }
    >
      {isPhone() && sections.length === 0 && !tasks.some(shown) && (
        <Empty
          icon="tasks"
          title={t(completed > 0 ? 'phone.allDone' : 'phone.emptyList')}
          text={t(completed > 0 ? 'phone.allDoneText' : 'phone.emptyListText')}
          action={{ label: t('tasks.add'), run: () => actions.quickAdd?.(list, null) }}
        />
      )}
      <div
        ref={rows}
        className="rows"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setDrop(null)}
      >
        {sectionTasks(whole, null).filter(shown).map(item)}
        {composing ? (
          <Composer placeholder={t('tasks.name')} onAdd={(title) => actions.add(list, { title })} onClose={() => setComposing(false)} />
        ) : (
          // With sections, each has its own add row; the header's button adds above them. On a
          // phone + adds.
          sections.length === 0 &&
          !isPhone() && (
            <button type="button" className="qa" onClick={() => setComposing(true)}>
              {t('tasks.addRow')}
            </button>
          )
        )}
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            list={list}
            section={section}
            top={sectionTasks(whole, section.id).filter(shown)}
            item={item}
            actions={actions}
            drag={drag}
            dropInto={drop?.into === section.id}
          />
        ))}
        {drop?.line && <div className="drop-line" style={{ top: drop.line.top, left: drop.line.left }} />}
      </div>
      {/* On a phone + adds a task, and a section comes from the list's menu. */}
      {addingSection ? (
        <SectionComposer onAdd={(name) => actions.addSection(list, name)} onClose={() => setAddingSection(false)} />
      ) : (
        !isPhone() && (
          <button type="button" className="qa add-sec" onClick={() => setAddingSection(true)}>
            {t('sections.add')}
          </button>
        )
      )}
    </TaskPage>
  );
}

/**
 * A saved filter: the open tasks of every list that match it, by the list they are in, after the
 * Filter view of design/mockups.html (direction A).
 */
export function FilterView({ filter, lists, boards, today, me, actions, onEdit }: {
  filter: TaskFilter;
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  /** The user's id, for a filter of what is given to them. */
  me?: string;
  actions: TaskActions;
  onEdit: () => void;
}) {
  const groups = filterTasks(filter, lists, today, me);
  const cardGroups = filterCards(filter, boards, today, me);
  // A condition on a board's field as it reads: "Company is Acme Corp".
  const fields = filterFields(filter, boards);
  const asked = (filter.fields ?? []).flatMap((c) => {
    const field = fields.find((f) => f.key === c.field);
    if (!field) return [];
    const value = Array.isArray(c.value) ? c.value.join(', ') : c.value === undefined ? '' : String(c.value);
    return [`${field.label} ${t(`collection.op.${c.op}`)}${opTakesValue(c.op) ? ` ${value}` : ''}`];
  });
  const chips = [
    filter.due !== 'any' && t(`filter.due.${filter.due}`),
    ...[...filter.priorities].sort().map((p) => (p === 4 ? t('filter.noPriority') : `p${p}`)),
    ...(filter.folders.length > 0 ? filter.folders.map((f) => folderLabel(f)) : [t('filter.allLists')]),
    ...asked,
    filter.text.trim() && `“${filter.text.trim()}”`,
  ].filter(Boolean);
  return (
    <TaskPage
      title={filter.name}
      extra={
        <>
          {chips.map((chip, i) => (
            <span key={i} className="chip">
              {chip}
            </span>
          ))}
          <button type="button" className="ghost" onClick={onEdit}>
            {t('filter.edit')}
          </button>
        </>
      }
    >
      {groups.map(({ list, tasks }) => (
        <div key={list}>
          <div className="sec">
            {listHeading(list)} <small>{tasks.length}</small>
          </div>
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              list={list}
              task={task}
              tasks={lists[list] ?? []}
              today={today}
              showDone={false}
              actions={actions}
              flat
              grouped
            />
          ))}
        </div>
      ))}
      {cardGroups.map(({ board, cards }) => (
        <div key={board}>
          <div className="sec">
            {boardHeading(board)} <small>{cards.length}</small>
          </div>
          {cards.map((card) => (
            <CardRow key={card.id} board={board} whole={boards[board]!} card={card} today={today} actions={actions} grouped />
          ))}
        </div>
      ))}
      {groups.length + cardGroups.length === 0 &&
        (isPhone() ? <Empty icon="filter" title={t('phone.emptyFilter')} text={t('filter.nothing')} /> : <p className="task-empty">{t('filter.nothing')}</p>)}
    </TaskPage>
  );
}

/**
 * A card among tasks, in the views over everything: its key and title, with a square box that
 * moves it to its board's done column, or asks which one when the board has more than one. The
 * board is named unless the rows are grouped by it.
 */
function CardRow({ board, whole, card, today, actions, grouped }: {
  board: string;
  whole: Board;
  card: Card;
  today: string;
  actions: TaskActions;
  grouped?: boolean;
}) {
  const column = whole.columns.find((c) => c.id === card.column);
  const phase = card.phase ? whole.phases.find((p) => p.id === card.phase) : undefined;
  const doneColumns = whole.columns.filter((c) => c.kind === 'done');
  if (isPhone()) {
    const finishCard = () =>
      doneColumns.length < 2
        ? actions.finishCard(board, card.id)
        : actions.menu(
            NO_POINTER,
            doneColumns.map((done) => ({ label: t('board.moveToColumn', { column: done.name }), run: () => actions.finishCard(board, card.id, done.id) })),
            { icon: 'board', title: card.title, sub: boardLabel(board) },
          );
    return (
      <div className="mb-task card-row" data-row="card">
        <div className="slide">
          <button type="button" className={`cb sq p${card.priority}`} role="checkbox" aria-checked={false} aria-label={t('tasks.finishCard', { name: card.title })} onClick={finishCard} />
          <button type="button" className="tx" onClick={() => actions.openCard(board, card.id)}>
            <b>
              <span className="key">{keyOf(whole, card)}</span>
              {card.title}
            </b>
            <span className="meta">
              {card.due && (
                <span className={dueClass(card.due, today)}>
                  <Icon name="calendar" />
                  {dueLabel(card.due, today)}
                </span>
              )}
              {!grouped && (
                <span>
                  <Icon name="board" />
                  {boardWhere(board)}
                </span>
              )}
              {column && <span>{column.name}</span>}
              {phase && <span>{phase.name}</span>}
              {card.assignee && (
                <span>
                  <Icon name="person" />
                  {firstName(card.assignee, actions.people?.(board)?.people)}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>
    );
  }
  const finish = (event: MouseEvent<HTMLButtonElement>) => {
    if (doneColumns.length < 2) return actions.finishCard(board, card.id);
    // The menu opens under the box, also when the box is pressed from the keyboard.
    const box = event.currentTarget.getBoundingClientRect();
    const under = { clientX: box.left, clientY: box.bottom + 4, preventDefault: () => event.preventDefault() } as MouseEvent;
    actions.menu(
      under,
      doneColumns.map((column) => ({ label: t('board.moveToColumn', { column: column.name }), run: () => actions.finishCard(board, card.id, column.id) })),
    );
  };
  return (
    <div className="task card-row" data-row="card">
      <button
        type="button"
        className={`cb sq p${card.priority}`}
        role="checkbox"
        aria-checked={false}
        aria-haspopup={doneColumns.length > 1 ? 'menu' : undefined}
        aria-label={t('tasks.finishCard', { name: card.title })}
        onClick={finish}
      />
      <div className="task-body">
        <button type="button" className="tt card-title" onClick={() => actions.openCard(board, card.id)}>
          <span className="key">{keyOf(whole, card)}</span>
          {card.title}
        </button>
        <div className="meta">
          {card.due && <span className={dueClass(card.due, today)}>{dueLabel(card.due, today)}</span>}
          {!grouped && <span>{boardWhere(board)}</span>}
          {column && <span>{column.name}</span>}
          {phase && <span>{phase.name}</span>}
          {card.assignee && <AssigneeChip assignee={card.assignee} people={actions.people?.(board)?.people} />}
        </div>
      </div>
    </div>
  );
}

/** The dated cards of every board that are not finished: what is late, due today, and due later by day. */
function splitDueCards(boards: Record<string, Board>, today: string) {
  const all = dueCards(boards);
  const later = new Map<string, typeof all>();
  for (const due of all) {
    if (due.card.due! <= today) continue;
    later.set(due.card.due!, [...(later.get(due.card.due!) ?? []), due]);
  }
  return {
    overdue: all.filter((d) => d.card.due! < today),
    today: all.filter((d) => d.card.due === today),
    later,
  };
}

/** Today or Upcoming: what is due, from every task list and every board. */
export function DueView({ kind, lists, boards, today, actions, bare, adding, day, onDay }: {
  kind: 'today' | 'upcoming';
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  actions: TaskActions;
  /** On a phone's page, which has its own title. */
  bare?: boolean;
  /** Counts the presses of a phone's + button, which open the add row. */
  adding?: number;
  /** On a phone's Upcoming: the day chosen in the week, which + adds to. */
  day?: string;
  onDay?: (day: string) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const item = ({ list, task }: { list: string; task: Task }) => (
    <TaskItem key={`${list}/${task.id}`} list={list} task={task} tasks={lists[list] ?? []} today={today} showDone={false} actions={actions} flat />
  );
  const cardItem = ({ board, card }: { board: string; card: Card }, grouped?: boolean) => (
    <CardRow key={`${board}#${card.id}`} board={board} whole={boards[board]!} card={card} today={today} actions={actions} grouped={grouped} />
  );
  const section = (title: string, tasks: { list: string; task: Task }[], cards: { board: string; card: Card }[] = [], day?: string, action?: ReactNode) =>
    tasks.length + cards.length > 0 && (
      <div key={title} data-day={day}>
        <div className="sec">
          {title} <small>{tasks.length + cards.length}</small>
          {action}
        </div>
        {tasks.map(item)}
        {cards.map((due) => cardItem(due))}
      </div>
    );
  const cards = splitDueCards(boards, today);

  if (kind === 'today') {
    const due = dueToday(lists, today);
    // Cards come after the tasks, under the board they are on.
    const byBoard = new Map<string, { board: string; card: Card }[]>();
    for (const d of [...cards.overdue, ...cards.today]) byBoard.set(d.board, [...(byBoard.get(d.board) ?? []), d]);
    // What was completed today, from every list, the latest first: found again, and opened again with its box.
    const finished = Object.entries(lists)
      .flatMap(([list, tasks]) => tasks.filter((task) => task.done && task.completed && dayOf(new Date(task.completed)) === today).map((task) => ({ list, task })))
      .sort((a, b) => (a.task.completed! < b.task.completed! ? 1 : -1));
    const nothingDue = due.overdue.length + due.today.length + byBoard.size === 0;
    // What is overdue moves on to one day, all at once, as Todoist's Reschedule does.
    const late = due.overdue.map(({ list, task }) => ({ list, id: task.id }));
    const reschedule = (event: MouseEvent) => {
      const to = (day: string | null) => actions.reschedule(late, day);
      if (actions.pickDay) return actions.pickDay(t('tasks.rescheduleTitle', { count: late.length }), to);
      actions.menu(event, [
        { label: t('day.today'), run: () => to(today) },
        { label: t('day.tomorrow'), run: () => to(addDays(today, 1)) },
        { label: t('tasks.nextWeek'), run: () => to(nextWeek(today)) },
      ]);
    };
    return (
      <TaskPage
        title={t('tasks.today')}
        detail={toDate(today).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })}
        onAdd={(title) => actions.add(INBOX_TASKS, { title, due: today })}
        bare={bare}
        adding={adding}
        footer={
          finished.length > 0 && (
            <>
              <button type="button" className="qa" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                {t(showDone ? 'tasks.hideCompletedToday' : 'tasks.showCompletedToday', { count: finished.length })}
              </button>
              {showDone && finished.map(item)}
            </>
          )
        }
      >
        {section(
          t('tasks.overdue'),
          due.overdue,
          [],
          undefined,
          <button type="button" className="resch" onClick={reschedule}>
            {t('tasks.reschedule')}
          </button>,
        )}
        {section(t('tasks.today'), due.today)}
        {[...byBoard].map(([board, dues]) => (
          <div key={board}>
            <div className="sec">
              {boardHeading(board)} <small>{dues.length}</small>
            </div>
            {dues.map((d) => cardItem(d, true))}
          </div>
        ))}
        {nothingDue &&
          (isPhone() ? (
            <Empty
              icon="sun"
              title={t(finished.length > 0 ? 'phone.allDoneToday' : 'phone.emptyToday')}
              text={t(finished.length > 0 ? 'phone.allDoneTodayText' : 'phone.emptyTodayText')}
              action={{ label: t('tasks.add'), run: () => actions.quickAdd?.(INBOX_TASKS, null, today) }}
            />
          ) : (
            <p className="task-empty">{t('tasks.nothingToday')}</p>
          ))}
      </TaskPage>
    );
  }

  const days = dueUpcoming(lists, today);
  const allDays = [...new Set([...days.map((d) => d.day), ...cards.later.keys()])].sort();
  return (
    <TaskPage title={t('tasks.upcoming')} bare={bare}>
      {isPhone() && <WeekStrip today={today} busy={new Set(allDays)} chosen={day ?? addDays(today, 1)} onChoose={onDay} />}
      {allDays.map((day) =>
        section(
          `${dueLabel(day, today)} · ${toDate(day).toLocaleDateString(locale(), SHORT)}`,
          days.find((d) => d.day === day)?.tasks ?? [],
          cards.later.get(day) ?? [],
          day,
        ),
      )}
      {allDays.length === 0 &&
        (isPhone() ? (
          <Empty
            icon="week"
            title={t('phone.emptyUpcoming')}
            text={t('phone.emptyUpcomingText')}
            action={{ label: t('tasks.add'), run: () => actions.quickAdd?.(INBOX_TASKS, null, day ?? addDays(today, 1)) }}
          />
        ) : (
          <p className="task-empty">{t('tasks.nothingLater')}</p>
        ))}
    </TaskPage>
  );
}

/**
 * The week on top of Upcoming on a phone: seven days from today, today's number in the accent, a
 * dot under each that has something due. A tap chooses the day, which + adds to, and goes to its
 * tasks; tomorrow is chosen at first.
 */
function WeekStrip({ today, busy, chosen, onChoose }: { today: string; busy: Set<string>; chosen: string; onChoose?: (day: string) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const go = (day: string) => {
    onChoose?.(day);
    const found = strip.current?.parentElement?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    found?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  return (
    <div ref={strip} className="mb-week">
      {days.map((day) => (
        <button
          key={day}
          type="button"
          className={[day === today && 'today', day === chosen && 'on'].filter(Boolean).join(' ') || undefined}
          aria-pressed={day === chosen}
          onClick={() => go(day)}
        >
          {toDate(day).toLocaleDateString(locale(), { weekday: 'short' })}
          <b>{toDate(day).getDate()}</b>
          <i className={busy.has(day) ? undefined : 'no'} />
        </button>
      ))}
    </div>
  );
}
