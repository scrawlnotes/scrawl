import {
  addDays,
  basename,
  childrenOf,
  depthOf,
  dirname,
  dueToday,
  dueUpcoming,
  filterTasks,
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
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import {
  type DragEvent,
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { MenuItem } from './dialogs';
import { Icon, type IconName } from './Icon';
import { listLabel } from './items';

/** What can be done to a task, in the list at the path given. */
export interface TaskActions {
  add: (list: string, input: NewTask) => void;
  update: (list: string, id: string, patch: TaskPatch) => void;
  setDone: (list: string, id: string, done: boolean) => void;
  remove: (list: string, id: string) => void;
  /** Opens a menu at the pointer. */
  menu: (event: MouseEvent, items: MenuItem[]) => void;
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
}

/** What a task row or a section header does when its grip is dragged. */
interface DragHandlers {
  grab: (event: DragEvent<HTMLElement>, what: { task: Task } | { section: Section }) => void;
  release: () => void;
}

const GRIP = (
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
function dueLabel(day: string, today: string): string {
  if (day === today) return t('day.today');
  if (day === addDays(today, 1)) return t('day.tomorrow');
  if (day === addDays(today, -1)) return t('day.yesterday');
  const date = toDate(day);
  if (day > today && day < addDays(today, 7)) return date.toLocaleDateString(locale(), WEEKDAY);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(locale(), sameYear ? SHORT : { ...SHORT, year: 'numeric' });
}

const dueClass = (day: string, today: string) => (day < today ? 'due late' : day === today ? 'due today' : 'due');

/** The next Monday after `today`. */
function nextWeek(today: string): string {
  const weekday = toDate(today).getDay();
  return addDays(today, (8 - weekday) % 7 || 7);
}

/** The row a new task is typed into. Enter adds it and keeps the row for the next one. */
function Composer({ placeholder, onAdd, onClose }: { placeholder: string; onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && title.trim()) {
      onAdd(title);
      setTitle('');
    } else if (event.key === 'Escape') onClose();
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

const SAVE_KEYS = /Mac|iPhone|iPad/.test(navigator.platform) ? ['⌘', 'Enter'] : ['Ctrl', 'Enter'];

/** "Ctrl + Enter saves · Esc cancels", with the keys drawn as keys in any language. */
function EditHint() {
  const keys = (names: string[]) =>
    names.map((name, i) => (
      <Fragment key={name}>
        {i > 0 && ' + '}
        <kbd>{name}</kbd>
      </Fragment>
    ));
  return (
    <span className="hint">
      {t('tasks.editHint')
        .split(/(\{save\}|\{cancel\})/)
        .map((part, i) => (
          <Fragment key={i}>{part === '{save}' ? keys(SAVE_KEYS) : part === '{cancel}' ? keys(['Esc']) : part}</Fragment>
        ))}
    </span>
  );
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

function TaskItem({ list, task, tasks, today, showDone, actions, flat, grouped, drag }: ItemProps) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const datePicker = useRef<HTMLInputElement>(null);

  const children = flat ? [] : childrenOf(tasks, task.id).filter((child) => showDone || !child.done);
  const progress = progressOf(tasks, task.id);
  const canNest = !flat && depthOf(tasks, task.id) < MAX_DEPTH;

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
  // Cancel keeps the focus in the fields, so pressing it is not leaving the editor, which saves.
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
  const meta = (task.due || progress.total > 0 || (flat && !grouped) || from) && (
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
      {flat && !grouped && <span>{listLabel(list)}</span>}
      {from}
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
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    save();
                  } else if (event.key === 'Escape') cancel();
                }}
              />
              {meta}
            </div>
            <div className="edit-foot">
              <EditHint />
              <button type="button" className="ghost" onMouseDown={keepFocus} onClick={cancel}>
                {t('dialog.cancel')}
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
          <IconButton icon="move" title={t('tasks.moveTo')} onClick={() => actions.moveTo(list, task.id)} />
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
function TaskPage({ title, detail, extra, onAdd, onAddClick, footer, children }: {
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
  children: ReactNode;
}) {
  const [composing, setComposing] = useState(false);
  return (
    <section className="tasks">
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
function taskDrop(container: HTMLElement, d: Dragging, event: DragEvent, list: List): Drop {
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
  const level = Math.max(min, Math.min(max, d.depth + Math.round((event.clientX - d.startX) / INDENT)));

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
  return { line: { top: edge - box.top, left: margin(container) + level * INDENT }, place: { parent, section, after } };
}

/** Where a dragged section would land: before the header under the pointer's half, or at the end. */
function sectionDrop(container: HTMLElement, d: Dragging, event: DragEvent): Drop {
  const box = container.getBoundingClientRect();
  const headers = dropRows(container, d).filter((row) => row.dataset.row === 'section');
  let index = headers.findIndex((row) => {
    const r = row.getBoundingClientRect();
    return event.clientY < r.top + r.height / 2;
  });
  if (index < 0) index = headers.length;
  const after = index > 0 ? headers[index - 1]!.dataset.id! : null;
  const top = index < headers.length ? headers[index]!.getBoundingClientRect().top - box.top : box.height;
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
    <div className="sec fold">
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
  const menu = (event: MouseEvent) =>
    actions.menu(event, [
      { label: t('menu.rename'), run: () => setRenaming(section.name) },
      {
        label: t('tasks.add'),
        run: () => {
          if (!open) actions.foldSection(list, section.id, false);
          setComposing(true);
        },
      },
      { label: t('sections.delete'), run: () => actions.removeSection(list, section) },
    ]);
  return (
    <div className="section">
      <div
        className={['sec fold', !open && 'closed', dropInto && 'drop-into'].filter(Boolean).join(' ')}
        data-row="section"
        data-id={section.id}
        data-collapsed={!open}
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
          {open ? '▾' : '▸'}
        </button>
        {renaming === null ? (
          <button type="button" className="sec-name" onClick={() => setRenaming(section.name)}>
            {section.name}
          </button>
        ) : (
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
        )}
        <small>{top.filter((task) => !task.done).length}</small>
        <button type="button" className="more" title={t('sections.menu')} aria-label={t('sections.menu')} onClick={menu}>
          ···
        </button>
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
            <button type="button" className="qa" onClick={() => setComposing(true)}>
              {t('tasks.addRow')}
            </button>
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

  const release = () => {
    dragging.current = null;
    setDrop(null);
    for (const lifted of rows.current?.querySelectorAll('.lifted') ?? []) lifted.classList.remove('lifted');
  };
  const drag: DragHandlers = {
    grab(event, what) {
      const handle = event.currentTarget;
      if ('task' in what) {
        const { task } = what;
        // The row and the subtasks under it are lifted; none of them is a place to drop it.
        const row = handle.closest<HTMLElement>('[data-row]')!;
        const subs = row.nextElementSibling?.classList.contains('subs') ? (row.nextElementSibling as HTMLElement) : null;
        const lifted = [row, ...(subs ? [subs] : [])];
        dragging.current = {
          kind: 'task',
          id: task.id,
          depth: depthOf(tasks, task.id),
          height: subtaskLevels(tasks, task.id),
          startX: event.clientX,
          lifted,
        };
        dragImage(event, task.title, `p${task.priority}`);
      } else {
        const block = handle.closest<HTMLElement>('.section')!;
        dragging.current = { kind: 'section', id: what.section.id, depth: 0, height: 0, startX: event.clientX, lifted: [block] };
        dragImage(event, what.section.name);
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DRAG_TYPE, dragging.current.id);
      // Lifted after the browser has taken its picture of the row.
      requestAnimationFrame(() => {
        for (const element of dragging.current?.lifted ?? []) element.classList.add('lifted');
      });
    },
    release,
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || !rows.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const next = d.kind === 'task' ? taskDrop(rows.current, d, event, whole) : sectionDrop(rows.current, d, event);
    setDrop((current) => (sameDrop(current, next) ? current : next));
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || !drop) return;
    event.preventDefault();
    if (d.kind === 'task' && drop.place) actions.moveTask(list, d.id, drop.place);
    if (d.kind === 'section' && drop.after !== undefined) actions.moveSection(list, d.id, drop.after);
    release();
  };

  const item = (task: Task) => (
    <TaskItem key={task.id} list={list} task={task} tasks={tasks} today={today} showDone={showDone} actions={actions} drag={drag} />
  );
  const completed = tasks.filter((task) => task.done).length;
  return (
    <TaskPage
      title={listName(list)}
      detail={basename(dirname(list))}
      onAddClick={() => setComposing(true)}
      footer={
        completed > 0 && (
          <button type="button" className="qa" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            {t(showDone ? 'tasks.hideCompleted' : 'tasks.showCompleted', { count: completed })}
          </button>
        )
      }
    >
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
          // With sections, each has its own add row; the header's button adds above them.
          sections.length === 0 && (
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
      {addingSection ? (
        <SectionComposer onAdd={(name) => actions.addSection(list, name)} onClose={() => setAddingSection(false)} />
      ) : (
        <button type="button" className="qa add-sec" onClick={() => setAddingSection(true)}>
          {t('sections.add')}
        </button>
      )}
    </TaskPage>
  );
}

/**
 * A saved filter: the open tasks of every list that match it, by the list they are in, after the
 * Filter view of design/mockups.html (direction A).
 */
export function FilterView({ filter, lists, today, actions, onEdit }: {
  filter: TaskFilter;
  lists: Record<string, Task[]>;
  today: string;
  actions: TaskActions;
  onEdit: () => void;
}) {
  const groups = filterTasks(filter, lists, today);
  const chips = [
    filter.due !== 'any' && t(`filter.due.${filter.due}`),
    ...[...filter.priorities].sort().map((p) => (p === 4 ? t('filter.noPriority') : `p${p}`)),
    ...(filter.folders.length > 0 ? filter.folders.map((f) => basename(f)) : [t('filter.allLists')]),
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
            {listLabel(list)} <small>{tasks.length}</small>
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
      {groups.length === 0 && <p className="task-empty">{t('filter.nothing')}</p>}
    </TaskPage>
  );
}

/** Today or Upcoming: what is due, from every task list. */
export function DueView({ kind, lists, today, actions }: {
  kind: 'today' | 'upcoming';
  lists: Record<string, Task[]>;
  today: string;
  actions: TaskActions;
}) {
  const item = ({ list, task }: { list: string; task: Task }) => (
    <TaskItem key={`${list}/${task.id}`} list={list} task={task} tasks={lists[list] ?? []} today={today} showDone={false} actions={actions} flat />
  );
  const section = (title: string, tasks: { list: string; task: Task }[]) =>
    tasks.length > 0 && (
      <div key={title}>
        <div className="sec">
          {title} <small>{tasks.length}</small>
        </div>
        {tasks.map(item)}
      </div>
    );

  if (kind === 'today') {
    const due = dueToday(lists, today);
    return (
      <TaskPage
        title={t('tasks.today')}
        detail={toDate(today).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })}
        onAdd={(title) => actions.add(INBOX_TASKS, { title, due: today })}
      >
        {section(t('tasks.overdue'), due.overdue)}
        {section(t('tasks.today'), due.today)}
        {due.overdue.length + due.today.length === 0 && <p className="task-empty">{t('tasks.nothingToday')}</p>}
      </TaskPage>
    );
  }

  const days = dueUpcoming(lists, today);
  return (
    <TaskPage title={t('tasks.upcoming')}>
      {days.map(({ day, tasks }) => section(`${dueLabel(day, today)} · ${toDate(day).toLocaleDateString(locale(), SHORT)}`, tasks))}
      {days.length === 0 && <p className="task-empty">{t('tasks.nothingLater')}</p>}
    </TaskPage>
  );
}
