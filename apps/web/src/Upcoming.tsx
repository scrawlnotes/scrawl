import {
  addDays,
  type Board,
  type Card,
  dayRuns,
  dueCards,
  dueToday,
  dueUpcoming,
  INBOX_TASKS,
  keyOf,
  monthDays,
  type NewTask,
  type Task,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type ReactElement, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadUpcomingView, pageBox, pageWindow, saveUpcomingView, type UpcomingView } from './device';
import type { TaskPlaceChoice } from './dialogs';
import { StillOpening } from './Loading';
import { Icon } from './Icon';
import { dateWords, DatePop, TaskComposer } from './TaskComposer';
import {
  CardRow,
  type Dated,
  type DueSubtask,
  isSubtaskRef,
  placeOf,
  splitDueCards,
  splitDueSubtasks,
  SubtaskRow,
  subtaskRefOf,
  type TaskActions,
  TaskItem,
  TaskPage,
  toDate,
} from './Tasks';

// Upcoming on a computer, after the Upcoming mockups, in two views chosen in its header and kept
// on the device. List: what is late first, with Reschedule, then today, then only the days that
// have something, each with its tasks and cards and a row to add one on it; the free days between
// two of them are one faint line, which adds on the first of them. Calendar: the month, as many
// tasks a day as fit and +N more; a day opens in a small window, and a task dragged to another day
// takes that day.

interface Props {
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  actions: TaskActions;
  /** Every list and section, for the list a new task goes in. */
  places: TaskPlaceChoice[];
  onAdd: (list: string, task: NewTask) => void;
  /** What the status bar says about the view. */
  onStatus: (parts: string[] | null) => void;
  /** The spaces still read as the app opens, said under the days read so far. */
  still?: string | null;
}

/** A month as `YYYY-MM`, `by` months on. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(y, m - 1 + by, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const monthWords = (month: string) => toDate(`${month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

/** A day as it heads its tasks: `Today · Thu, Oct 15`, `Tomorrow · Fri, Oct 16`, else `Mon, Oct 19`. */
export function dayHeading(day: string, today: string): ReactNode {
  if (day !== today && day !== addDays(today, 1)) return dateWords(day, today);
  return (
    <>
      {day === today ? t('tasks.today') : t('day.tomorrow')} <span className="when">· {dateWords(day, today)}</span>
    </>
  );
}

/** The free days between two that have something, as their line says them: `2 free days · Sat 17 – Sun 18`. */
export function freeWords({ from, to, count }: { from: string; to: string; count: number }, today: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return t('tasks.freeDays', { count, from: freeDay(from, sameMonth, today), to: freeDay(to, sameMonth, today) });
}

/** A free day on its line: `Sat 17`, or the date when the free days run into another month. */
function freeDay(day: string, sameMonth: boolean, today: string): string {
  return sameMonth ? `${toDate(day).toLocaleDateString(locale(), { weekday: 'short' })} ${Number(day.slice(8))}` : dateWords(day, today);
}

/** A task in its list, a card on its board, or a subtask of a card or a record, on a day of the calendar. */
export type Entry = { list: string; task: Task } | { board: string; card: Card } | DueSubtask;

/** What a task, a card or a subtask is told apart by. */
const datedKey = (item: Dated) =>
  isSubtaskRef(item) ? `${'board' in item ? item.board : item.collection}~${item.id}~${item.subtask}` : 'list' in item ? `${item.list}/${item.id}` : `${item.board}#${item.id}`;

const datedOf = (entry: Entry): Dated => ('subtask' in entry ? subtaskRefOf(entry) : 'task' in entry ? { list: entry.list, id: entry.task.id } : { board: entry.board, id: entry.card.id });

export const entryKey = (entry: Entry) => datedKey(datedOf(entry));

/** An entry as the views over every list show it: a task's row, a card's, a subtask's. */
export function EntryRow({ entry, lists, boards, today, actions }: { entry: Entry; lists: Record<string, Task[]>; boards: Record<string, Board>; today: string; actions: TaskActions }) {
  if ('subtask' in entry) return <SubtaskRow due={entry} today={today} actions={actions} byDay />;
  if ('task' in entry) return <TaskItem list={entry.list} task={entry.task} tasks={lists[entry.list] ?? []} today={today} showDone={false} actions={actions} flat byDay />;
  return <CardRow board={entry.board} whole={boards[entry.board]!} card={entry.card} today={today} actions={actions} byDay />;
}

/**
 * Everything open with a day, by day: the tasks by priority, then the cards, then the subtasks of
 * cards and records; and the tasks, the cards and the subtasks apart, to count.
 */
export function datedByDay(lists: Record<string, Task[]>, boards: Record<string, Board>, today: string, subtasks: DueSubtask[]) {
  const due = dueToday(lists, today);
  const tasks = [...due.overdue, ...due.today, ...dueUpcoming(lists, today).flatMap((d) => d.tasks)];
  const cards = dueCards(boards);
  const byDay = new Map<string, Entry[]>();
  const put = (day: string, entry: Entry) => byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  for (const each of tasks) put(each.task.due!, each);
  for (const each of cards) put(each.card.due!, each);
  for (const each of subtasks) put(each.subtask.due!, each);
  return { tasks, cards, subtasks, byDay };
}

/** How many tasks and cards, said the status bar's way. */
const countWords = (tasks: number, cards: number) => [t('count.tasks', { count: tasks }), ...(cards > 0 ? [t('count.cards', { count: cards })] : [])];

/** The header's Add task, pressed: `asked` counts the presses, and a view opens adding at each new one. */
function useAsked(asked: number, open: () => void) {
  const seen = useRef(asked);
  useEffect(() => {
    if (asked === seen.current) return;
    seen.current = asked;
    open();
  }, [asked]);
}

export function Upcoming(props: Props) {
  const { today, onStatus } = props;
  const [view, setView] = useState<UpcomingView>(loadUpcomingView);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [asked, setAsked] = useState(0);
  const choose = (next: UpcomingView) => {
    setView(next);
    saveUpcomingView(next);
  };
  useEffect(() => () => onStatus(null), []);

  const header = (
    <>
      <span className="vsw" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => choose('list')}>
          {t('tasks.viewList')}
        </button>
        <button type="button" role="tab" aria-selected={view === 'calendar'} onClick={() => choose('calendar')}>
          {t('tasks.viewCalendar')}
        </button>
      </span>
      {view === 'calendar' && (
        <span className="up-month">
          <button type="button" aria-label={t('phone.previousMonth')} title={t('phone.previousMonth')} onClick={() => setMonth(shiftMonth(month, -1))}>
            <Icon name="back" />
          </button>
          <span className="mn">{monthWords(month)}</span>
          <button type="button" aria-label={t('phone.nextMonth')} title={t('phone.nextMonth')} onClick={() => setMonth(shiftMonth(month, 1))}>
            <Icon name="chevron" />
          </button>
        </span>
      )}
    </>
  );
  // Add task adds on tomorrow; on the calendar, in this month, where tomorrow always is.
  const add = () => {
    if (view === 'calendar') setMonth(today.slice(0, 7));
    setAsked(asked + 1);
  };
  return (
    <TaskPage title={t('tasks.upcoming')} extra={header} onAddClick={add} footer={<StillOpening text={props.still ?? null} />}>
      {view === 'list' ? <UpcomingList {...props} asked={asked} /> : <UpcomingCalendar {...props} month={month} asked={asked} />}
    </TaskPage>
  );
}

/** Adding, open where it was started: under the day `at`, or the free days it is one of; `n` tells one opening from the next. */
interface Adding {
  at: string;
  due: string;
  n: number;
}

function UpcomingList({ lists, boards, today, actions, places, onAdd, onStatus, asked }: Props & { asked: number }) {
  const [adding, setAdding] = useState<Adding | null>(null);
  const [rescheduling, setRescheduling] = useState<HTMLElement | null>(null);
  const tomorrow = addDays(today, 1);
  const due = dueToday(lists, today);
  const cards = splitDueCards(boards, today);
  const subtasks = splitDueSubtasks(actions.dueSubtasks(), today);
  const tasksOn = new Map(dueUpcoming(lists, today).map((d) => [d.day, d.tasks]));
  tasksOn.set(today, due.today);
  cards.later.set(today, cards.today);
  subtasks.later.set(today, subtasks.today);
  const busy = [...tasksOn, ...cards.later, ...subtasks.later].filter(([, on]) => on.length > 0).map(([day]) => day);
  const runs = dayRuns(busy, today);

  const open = (at: string, day: string) => setAdding({ at, due: day, n: (adding?.n ?? 0) + 1 });
  useAsked(asked, () => open(tomorrow, tomorrow));
  const taskCount =
    due.overdue.length + [...tasksOn.values()].reduce((sum, on) => sum + on.length, 0) + subtasks.overdue.length + [...subtasks.later.values()].reduce((sum, on) => sum + on.length, 0);
  const cardCount = cards.overdue.length + [...cards.later.values()].reduce((sum, on) => sum + on.length, 0);
  useEffect(() => onStatus(countWords(taskCount, cardCount)), [taskCount, cardCount]);

  const composer = adding && (
    <TaskComposer
      key={`composer:${adding.n}`}
      start={{ due: adding.due, list: INBOX_TASKS, section: null }}
      today={today}
      places={places}
      recordChoices={actions.recordChoices}
      recordName={actions.recordTitle}
      menu={actions.menu}
      onAdd={onAdd}
      onClose={() => setAdding(null)}
    />
  );
  // The adding row goes under its day, or the free days it is one of, or at the end.
  let placed = false;
  const place = (here: boolean) => {
    if (!here || !composer || placed) return [];
    placed = true;
    return [composer];
  };

  const item = ({ list, task }: { list: string; task: Task }) => (
    <TaskItem key={`${list}/${task.id}`} list={list} task={task} tasks={lists[list] ?? []} today={today} showDone={false} actions={actions} flat byDay />
  );
  const cardItem = ({ board, card }: { board: string; card: Card }) => (
    <CardRow key={`${board}#${card.id}`} board={board} whole={boards[board]!} card={card} today={today} actions={actions} byDay />
  );
  const subtaskItem = (d: DueSubtask) => <SubtaskRow key={`${placeOf(d)}~${d.subtask.id}`} due={d} today={today} actions={actions} byDay />;
  // One list of rows, so that the adding row keeps what is typed in it when a task added moves it.
  const rows: ReactElement[] = [];

  const late: Dated[] = [
    ...due.overdue.map(({ list, task }) => ({ list, id: task.id })),
    ...cards.overdue.map(({ board, card }) => ({ board, id: card.id })),
    ...subtasks.overdue.map(subtaskRefOf),
  ];
  if (late.length > 0) {
    rows.push(
      <div key="sec:late" className="sec">
        {t('tasks.overdue')} <small>{late.length}</small>
        <button type="button" className="resch" aria-haspopup="dialog" aria-expanded={!!rescheduling} onClick={(event) => setRescheduling(rescheduling ? null : event.currentTarget)}>
          {t('tasks.reschedule')}
        </button>
      </div>,
      ...due.overdue.map(item),
      ...cards.overdue.map(cardItem),
      ...subtasks.overdue.map(subtaskItem),
    );
  }

  for (const run of runs) {
    if ('free' in run) {
      const { from, to } = run.free;
      rows.push(
        <div key={`free:${from}`} className="up-gap">
          <span>{freeWords(run.free, today)}</span>
          <button type="button" className="plus" title={t('tasks.addOn', { day: dateWords(from, today) })} onClick={() => open(from, from)}>
            <Icon name="plus" />
            {t('tasks.add')}
          </button>
        </div>,
        ...place(!!adding && adding.at >= from && adding.at <= to),
      );
      continue;
    }
    const { day } = run;
    const dayTasks = tasksOn.get(day) ?? [];
    const dayCards = cards.later.get(day) ?? [];
    const daySubtasks = subtasks.later.get(day) ?? [];
    rows.push(
      <div key={`sec:${day}`} className="sec" data-day={day}>
        {dayHeading(day, today)} <small>{dayTasks.length + dayCards.length + daySubtasks.length}</small>
      </div>,
      ...dayTasks.map(item),
      ...dayCards.map(cardItem),
      ...daySubtasks.map(subtaskItem),
    );
    const here = place(adding?.at === day);
    rows.push(
      ...(here.length > 0
        ? here
        : [
            <button key={`add:${day}`} type="button" className="qa" onClick={() => open(day, day)}>
              {t('tasks.addRow')}
            </button>,
          ]),
    );
  }
  if (late.length === 0 && runs.length === 0 && !adding) {
    rows.push(
      <p key="empty" className="task-empty">
        {t('tasks.nothingLater')}
      </p>,
    );
  }
  rows.push(...place(true));

  return (
    <>
      {rows}
      {rescheduling && (
        <DatePop
          anchor={rescheduling}
          today={today}
          onPick={(day) => {
            setRescheduling(null);
            actions.reschedule(late, day);
          }}
          onClose={() => setRescheduling(null)}
        />
      )}
    </>
  );
}

/** A day of the calendar in its own window: `adding` it opens with a new task being typed; `n` tells one opening from the next. */
interface Opened {
  day: string;
  adding: boolean;
  n: number;
}

// A day's number is 17px high, each line under it 18px with 3px between, inside 4px above and below.
const NUMBER_HEIGHT = 17;
const LINE_HEIGHT = 21;
const CELL_PADDING = 8;

function UpcomingCalendar({ lists, boards, today, actions, places, onAdd, onStatus, month, asked }: Props & { month: string; asked: number }) {
  const grid = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(3);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [dragging, setDragging] = useState<{ item: Dated; from: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const days = monthDays(month);

  const { tasks, cards, subtasks, byDay } = datedByDay(lists, boards, today, actions.dueSubtasks());

  // As many lines as a day has room for, however tall the window is.
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () => {
      const cell = element.querySelector<HTMLElement>('.cd');
      if (cell) setFit(Math.max(1, Math.floor((cell.clientHeight - CELL_PADDING - NUMBER_HEIGHT) / LINE_HEIGHT)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const openDay = (day: string) => setOpened((was) => (was?.day === day ? was : { day, adding: false, n: (was?.n ?? 0) + 1 }));
  const addOn = (day: string) => setOpened((was) => ({ day, adding: true, n: (was?.n ?? 0) + 1 }));
  // Another month closes the day open in this one; Add task, which may come with this month again, opens tomorrow after.
  useEffect(() => setOpened(null), [month]);
  useAsked(asked, () => addOn(addDays(today, 1)));

  const inMonth = (day: string) => day.slice(0, 7) === month;
  const taskCount = tasks.filter((each) => inMonth(each.task.due!)).length + subtasks.filter((each) => inMonth(each.subtask.due!)).length;
  const cardCount = cards.filter((each) => inMonth(each.card.due!)).length;
  useEffect(
    () => onStatus(dragging ? [t('tasks.dropOnDay')] : [t('tasks.inMonth', { what: countWords(taskCount, cardCount).join(' · '), month: toDate(`${month}-01`).toLocaleDateString(locale(), { month: 'long' }) })]),
    [dragging, taskCount, cardCount, month],
  );

  const end = () => {
    setDragging(null);
    setDropOn(null);
  };
  const line = (entry: Entry, day: string) => {
    const isCard = 'card' in entry && !('subtask' in entry);
    const { title, priority } = 'subtask' in entry ? entry.subtask : 'task' in entry ? entry.task : entry.card;
    const item = datedOf(entry);
    const lifted = dragging && entryKey(entry) === datedKey(dragging.item);
    return (
      <button
        key={entryKey(entry)}
        type="button"
        draggable
        className={['cal-t', day < today && 'late', lifted && 'ghost'].filter(Boolean).join(' ')}
        style={priority < 4 ? ({ '--pc': `var(--sl-p${priority})` } as CSSProperties) : undefined}
        title={title}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', title);
          setDragging({ item, from: day });
        }}
        onDragEnd={end}
        onClick={(event) => {
          event.stopPropagation();
          openDay(day);
        }}
      >
        <i className={isCard ? 'sq' : undefined} />
        {isCard && boards[entry.board] && <span className="key">{keyOf(boards[entry.board]!, entry.card)}</span>}
        <span>{title}</span>
      </button>
    );
  };

  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
  return (
    <div className="up-cal">
      <div className="wd" aria-hidden="true">
        {weekdays.map((name, i) => (
          <span key={i}>{name}</span>
        ))}
      </div>
      <div ref={grid} className="grid">
        {days.map((day) => {
          const entries = byDay.get(day) ?? [];
          // A day with more than fits shows one line fewer, and how many more there are in its place.
          const shown = entries.length > fit ? entries.slice(0, fit - 1) : entries;
          const more = entries.length - shown.length;
          const className = [
            'cd',
            !inMonth(day) && 'out',
            entries.length > 0 && 'busy',
            day < today && 'past',
            day === today && 'today',
            opened?.day === day && 'on',
            dropOn === day && 'drop-on',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={day}
              className={className}
              data-day={day}
              onClick={() => openDay(day)}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (dropOn !== day) setDropOn(day);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropOn((was) => (was === day ? null : was));
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging && dragging.from !== day) actions.reschedule([dragging.item], day);
                end();
              }}
            >
              <button
                type="button"
                className="n"
                aria-label={t('tasks.openDay', { day: dateWords(day, today) })}
                onClick={(event) => {
                  event.stopPropagation();
                  openDay(day);
                }}
              >
                {Number(day.slice(8))}
              </button>
              {day >= today && (
                <button
                  type="button"
                  className="plus"
                  title={t('tasks.addOn', { day: dateWords(day, today) })}
                  aria-label={t('tasks.addOn', { day: dateWords(day, today) })}
                  onClick={(event) => {
                    event.stopPropagation();
                    addOn(day);
                  }}
                >
                  <Icon name="plus" />
                </button>
              )}
              {shown.map((entry) => line(entry, day))}
              {more > 0 && (
                <button
                  type="button"
                  className="cal-more"
                  onClick={(event) => {
                    event.stopPropagation();
                    openDay(day);
                  }}
                >
                  {t('tasks.moreOnDay', { count: more })}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {opened && (
        <DayWindow
          key={opened.day}
          grid={grid}
          opened={opened}
          entries={byDay.get(opened.day) ?? []}
          lists={lists}
          boards={boards}
          today={today}
          actions={actions}
          places={places}
          onAdd={onAdd}
          onAdding={(adding) => setOpened({ ...opened, adding, n: adding ? opened.n + 1 : opened.n })}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}

// Pickers and menus open from inside a day's window are over it, not away from it.
const OVER = '.menu, .pick-pop, .lbl-picker, .rpick';

/**
 * A day of the calendar in a small window beside it, after the Calendar, a day view of the
 * Upcoming mockups: its date and how many, its tasks and cards as they are in the list, and a row
 * to add one on it.
 */
function DayWindow({ grid, opened, entries, lists, boards, today, actions, places, onAdd, onAdding, onClose }: {
  grid: RefObject<HTMLDivElement | null>;
  opened: Opened;
  entries: Entry[];
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  actions: TaskActions;
  places: TaskPlaceChoice[];
  onAdd: (list: string, task: NewTask) => void;
  onAdding: (adding: boolean) => void;
  onClose: () => void;
}) {
  const { day } = opened;
  const pop = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const latest = useRef(onClose);
  latest.current = onClose;
  const width = 340;

  // Beside the day, on its right where there is room, else on its left; never off the window.
  useLayoutEffect(() => {
    const measure = () => {
      const cell = grid.current?.querySelector(`[data-day="${day}"]`);
      if (!cell || !pop.current) return;
      const box = pageBox(cell);
      const page = pageWindow();
      const height = pageBox(pop.current).height;
      let left = box.right + 6;
      if (left + width > page.width - 8) left = box.left - width - 6;
      left = Math.max(8, Math.min(left, page.width - width - 8));
      setPlace({ left, width, top: Math.max(8, Math.min(box.top, page.height - height - 8)), maxHeight: page.height - 16 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (pop.current) observer.observe(pop.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [day, grid]);
  useEffect(() => {
    if (!opened.adding) pop.current?.focus();
  }, []);
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Element;
      if (pop.current?.contains(target) || target.closest?.(OVER) || target.closest?.(`[data-day="${day}"]`)) return;
      latest.current();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [day]);

  return createPortal(
    <div
      ref={pop}
      className="pick-pop day-window"
      role="dialog"
      aria-label={dateWords(day, today)}
      tabIndex={-1}
      style={place ?? { opacity: 0, width }}
      onKeyDown={(event) => {
        // Escape leaves a field typed in first: the new task, or a task's name being changed.
        const target = event.target as HTMLElement;
        if (event.key !== 'Escape' || event.defaultPrevented || target.closest('input, textarea, [contenteditable]')) return;
        event.preventDefault();
        onClose();
      }}
    >
      <h4>
        <span>{dayHeading(day, today)}</span>
        {entries.length > 0 && <small>{entries.length}</small>}
        <button type="button" className="x" aria-label={t('dialog.close')} title={t('dialog.close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </h4>
      <div className="day-rows">
        {entries.map((entry) => (
          <EntryRow key={entryKey(entry)} entry={entry} lists={lists} boards={boards} today={today} actions={actions} />
        ))}
      </div>
      {opened.adding ? (
        <TaskComposer
          key={`composer:${opened.n}`}
          start={{ due: day, list: INBOX_TASKS, section: null }}
          today={today}
          places={places}
          recordChoices={actions.recordChoices}
          recordName={actions.recordTitle}
          menu={actions.menu}
          onAdd={onAdd}
          onClose={() => {
            onAdding(false);
            pop.current?.focus();
          }}
        />
      ) : (
        <button type="button" className="qa" onClick={() => onAdding(true)}>
          {t('tasks.addRow')}
        </button>
      )}
    </div>,
    document.body,
  );
}
