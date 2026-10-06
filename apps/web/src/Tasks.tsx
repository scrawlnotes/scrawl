import {
  addDays,
  basename,
  childrenOf,
  depthOf,
  dirname,
  dueToday,
  dueUpcoming,
  INBOX_TASKS,
  listName,
  MAX_DEPTH,
  type NewTask,
  type Priority,
  progressOf,
  type Task,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useRef, useState } from 'react';
import type { MenuItem } from './dialogs';
import { Icon, type IconName } from './Icon';
import { listLabel } from './items';

/** What can be done to a task, in the list at the path given. */
export interface TaskActions {
  add: (list: string, input: NewTask) => void;
  update: (list: string, id: string, patch: Partial<Pick<Task, 'title' | 'due' | 'priority'>>) => void;
  setDone: (list: string, id: string, done: boolean) => void;
  remove: (list: string, id: string) => void;
  /** Opens a menu at the pointer. */
  menu: (event: MouseEvent, items: MenuItem[]) => void;
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
}

function TaskItem({ list, task, tasks, today, showDone, actions, flat }: ItemProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const datePicker = useRef<HTMLInputElement>(null);

  const children = flat ? [] : childrenOf(tasks, task.id).filter((child) => showDone || !child.done);
  const progress = progressOf(tasks, task.id);
  const canNest = !flat && depthOf(tasks, task.id) < MAX_DEPTH;

  const commitTitle = () => {
    if (editing !== null && editing.trim() && editing !== task.title) actions.update(list, task.id, { title: editing });
    setEditing(null);
  };
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

  return (
    <>
      <div className={task.done ? 'task done' : 'task'}>
        <button
          type="button"
          className={`cb p${task.priority}`}
          role="checkbox"
          aria-checked={task.done}
          aria-label={t(task.done ? 'tasks.reopen' : 'tasks.complete', { name: task.title })}
          onClick={() => actions.setDone(list, task.id, !task.done)}
        />
        <div className="task-body">
          {editing === null ? (
            <button type="button" className="tt" onClick={() => setEditing(task.title)}>
              {task.title}
            </button>
          ) : (
            <input
              className="tt-edit"
              aria-label={t('tasks.title')}
              autoFocus
              value={editing}
              onChange={(event) => setEditing(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitTitle();
                else if (event.key === 'Escape') setEditing(null);
              }}
            />
          )}
          {(task.due || progress.total > 0 || flat) && (
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
              {flat && <span>{listLabel(list)}</span>}
            </div>
          )}
        </div>
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
            <TaskItem key={child.id} list={list} task={child} tasks={tasks} today={today} showDone={showDone} actions={actions} />
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
function TaskPage({ title, detail, onAdd, footer, children }: {
  title: string;
  detail?: string;
  /** Without it the view cannot add tasks. */
  onAdd?: (title: string) => void;
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
        {onAdd && (
          <button type="button" className="add" onClick={() => setComposing(true)}>
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

/** One task list, with the folder it is in beside its name. */
export function TaskList({ list, tasks, today, actions }: { list: string; tasks: Task[]; today: string; actions: TaskActions }) {
  const [showDone, setShowDone] = useState(false);
  const top = childrenOf(tasks, null).filter((task) => showDone || !task.done);
  const completed = tasks.filter((task) => task.done).length;
  return (
    <TaskPage
      title={listName(list)}
      detail={basename(dirname(list))}
      onAdd={(title) => actions.add(list, { title })}
      footer={
        completed > 0 && (
          <button type="button" className="qa" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            {t(showDone ? 'tasks.hideCompleted' : 'tasks.showCompleted', { count: completed })}
          </button>
        )
      }
    >
      {top.map((task) => (
        <TaskItem key={task.id} list={list} task={task} tasks={tasks} today={today} showDone={showDone} actions={actions} />
      ))}
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
