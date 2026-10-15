import { addDays, type Board, type Card, dayRuns, dueToday, dueUpcoming, INBOX_TASKS, type NewTask, type Task } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type ReactElement, type ReactNode, useState } from 'react';
import type { TaskPlaceChoice } from './dialogs';
import { Icon } from './Icon';
import { dateWords, DatePop, TaskComposer } from './TaskComposer';
import { CardRow, splitDueCards, type TaskActions, TaskItem, TaskPage, toDate } from './Tasks';

// Upcoming on a computer, after the List views of the Upcoming mockups: what is late first, with
// Reschedule, then today, then only the days that have something, each with its tasks and cards and
// a row to add one on it. The free days between two of them are one faint line, which adds on the
// first of them.

/** Adding, open where it was started: under the day `at`, or the free days it is one of; `n` tells one opening from the next. */
interface Adding {
  at: string;
  due: string;
  n: number;
}

/** A free day on its line: `Sat 17`, or the date when the free days run into another month. */
function freeDay(day: string, sameMonth: boolean, today: string): string {
  return sameMonth ? `${toDate(day).toLocaleDateString(locale(), { weekday: 'short' })} ${Number(day.slice(8))}` : dateWords(day, today);
}

export function Upcoming({ lists, boards, today, actions, places, onAdd }: {
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  actions: TaskActions;
  /** Every list and section, for the list a new task goes in. */
  places: TaskPlaceChoice[];
  onAdd: (list: string, task: NewTask) => void;
}) {
  const [adding, setAdding] = useState<Adding | null>(null);
  const [rescheduling, setRescheduling] = useState<HTMLElement | null>(null);
  const tomorrow = addDays(today, 1);
  const due = dueToday(lists, today);
  const cards = splitDueCards(boards, today);
  const tasksOn = new Map(dueUpcoming(lists, today).map((d) => [d.day, d.tasks]));
  tasksOn.set(today, due.today);
  cards.later.set(today, cards.today);
  const busy = [...tasksOn, ...cards.later].filter(([, on]) => on.length > 0).map(([day]) => day);
  const runs = dayRuns(busy, today);

  const open = (at: string, day: string) => setAdding({ at, due: day, n: (adding?.n ?? 0) + 1 });
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
  // One list of rows, so that the adding row keeps what is typed in it when a task added moves it.
  const rows: ReactElement[] = [];

  const late = [...due.overdue.map(({ list, task }) => ({ list, id: task.id })), ...cards.overdue.map(({ board, card }) => ({ board, id: card.id }))];
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
    );
  }

  for (const run of runs) {
    if ('free' in run) {
      const { from, to, count } = run.free;
      const sameMonth = from.slice(0, 7) === to.slice(0, 7);
      rows.push(
        <div key={`free:${from}`} className="up-gap">
          <span>{t('tasks.freeDays', { count, from: freeDay(from, sameMonth, today), to: freeDay(to, sameMonth, today) })}</span>
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
    const heading: ReactNode =
      day === today || day === tomorrow ? (
        <>
          {day === today ? t('tasks.today') : t('day.tomorrow')} <span className="when">· {dateWords(day, today)}</span>
        </>
      ) : (
        dateWords(day, today)
      );
    const dayTasks = tasksOn.get(day) ?? [];
    const dayCards = cards.later.get(day) ?? [];
    rows.push(
      <div key={`sec:${day}`} className="sec" data-day={day}>
        {heading} <small>{dayTasks.length + dayCards.length}</small>
      </div>,
      ...dayTasks.map(item),
      ...dayCards.map(cardItem),
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
    <TaskPage title={t('tasks.upcoming')} onAddClick={() => open(tomorrow, tomorrow)}>
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
    </TaskPage>
  );
}
