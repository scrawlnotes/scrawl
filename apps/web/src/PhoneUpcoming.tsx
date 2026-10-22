import { addDays, type Board, type Card, dayRuns, dueToday, dueUpcoming, INBOX_TASKS, keyOf, minutesOfDay, monthDays, movedValues, recordLabel, type Task, weekDays } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, Fragment, useState } from 'react';
import { type CalendarBox, choiceColor, PhoneHours } from './Calendar';
import { Icon } from './Icon';
import { StillOpening } from './Loading';
import { Empty } from './sheets';
import { dateWords } from './TaskComposer';
import { CardRow, type Dated, type DueSubtask, placeOf, RecordRow, recordKey, recordsByDay, splitDueCards, splitDueSubtasks, SubtaskRow, subtaskRefOf, type TaskActions, TaskItem, TaskPage } from './Tasks';
import { datedByDay, dayHeading, type Entry, entryKey, EntryRow, freeWords, monthWords } from './Upcoming';

// Upcoming on a phone, after the Phone views of the Upcoming and Calendar mockups, in three views
// chosen beside its title. List: what is late first, with Reschedule, then today, then only the
// days that have something, the free days between them in one faint line. Day: the week's strip,
// the day's tasks and cards, then its hours with what has a time; swiped to the next day. Month:
// the month with a dot under each day that has something, and under it the tasks of the day
// chosen, which + adds to.

/** What a phone's Upcoming shows. */
export type PhoneUpcomingView = 'list' | 'day' | 'month';

interface Props {
  view: PhoneUpcomingView;
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  actions: TaskActions;
  /** The day chosen in the month, which + adds to there. */
  day: string;
  onDay: (day: string) => void;
  /** The spaces still read as the app opens, said under the days read so far. */
  still?: string | null;
}

export function PhoneUpcoming(props: Props) {
  return props.view === 'month' ? <PhoneMonth {...props} /> : props.view === 'day' ? <PhoneDay {...props} /> : <PhoneDays {...props} />;
}

/** A day on a phone: its week's strip, a dot under each day that has something; the day's tasks and cards; its hours. */
function PhoneDay({ lists, boards, today, actions, day, onDay, still = null }: Props) {
  const { byDay, records } = datedByDay(lists, boards, today, actions.dueSubtasks(), actions.dueRecords());
  const [target, setTarget] = useState<string | null>(null);
  // What has a time is on the hours; the rest above them.
  const timed = records.filter((due) => minutesOfDay(due.start) !== null && due.start.slice(0, 10) === day);
  const entries = (byDay.get(day) ?? []).filter((entry) => !('calendar' in entry && timed.includes(entry.calendar)));
  const boxes: CalendarBox[] = timed.map((due) => ({
    key: `${due.collection}@${due.record.id}`,
    title: recordLabel(due.record) || t('collection.untitled'),
    start: due.start,
    end: due.end,
    minutes: due.minutes,
    color: choiceColor(due.colorField, due.choice),
    movable: !!movedValues(due.schema, due.view.calendar!, due, due.start),
  }));
  const move = (box: CalendarBox, start: string) => {
    const due = timed.find((each) => `${each.collection}@${each.record.id}` === box.key);
    const values = due && movedValues(due.schema, due.view.calendar!, due, start);
    if (due && values) actions.moveRecord(due.collection, due.record.id, values, t('calendar.moved', { name: box.title, when: `${dateWords(start.slice(0, 10), today)}, ${start.slice(11)}` }));
  };
  // A task opens as its sheet, a card on its board, a subtask in its card or its record.
  const open = (entry: Entry) => {
    if ('calendar' in entry) return actions.openRecord(entry.calendar.collection, entry.calendar.record.id);
    if ('subtask' in entry) return 'board' in entry ? actions.openCard(entry.board, entry.card.id) : actions.openRecord(entry.collection, entry.record.id);
    if ('task' in entry) return actions.open?.(entry.list, entry.task.id);
    actions.openCard(entry.board, entry.card.id);
  };
  const chip = (entry: Entry) => {
    if ('calendar' in entry) {
      return (
        <button key={entryKey(entry)} type="button" className="mb-chip rec" style={{ '--cc': choiceColor(entry.calendar.colorField, entry.calendar.choice) } as CSSProperties} onClick={() => open(entry)}>
          <i className="sq" />
          <span>{recordLabel(entry.calendar.record) || t('collection.untitled')}</span>
        </button>
      );
    }
    const isCard = 'card' in entry && !('subtask' in entry);
    const { title, priority } = 'subtask' in entry ? entry.subtask : 'task' in entry ? entry.task : entry.card;
    return (
      <button key={entryKey(entry)} type="button" className={day < today ? 'mb-chip late' : 'mb-chip'} style={priority < 4 ? ({ '--pc': `var(--sl-p${priority})` } as CSSProperties) : undefined} onClick={() => open(entry)}>
        <i className={isCard ? 'sq' : undefined} />
        {isCard && boards[entry.board] && <span className="key">{keyOf(boards[entry.board]!, entry.card)}</span>}
        <span>{title}</span>
      </button>
    );
  };
  return (
    <TaskPage title={t('tasks.upcoming')} bare footer={<StillOpening text={still} />}>
      <div className="mb-wstrip">
        {weekDays(day).map((each) => {
          const busy = byDay.has(each);
          return (
            <button key={each} type="button" data-day={each} className={[each === day && 'on', each === today && 'today', target === each && 'drop'].filter(Boolean).join(' ') || undefined} aria-pressed={each === day} aria-label={dateWords(each, today)} onClick={() => onDay(each)}>
              <small>{new Date(`${each}T12:00:00`).toLocaleDateString(locale(), { weekday: 'narrow' })}</small>
              <b>{Number(each.slice(8))}</b>
              <i className={busy ? undefined : 'no'} />
            </button>
          );
        })}
      </div>
      {entries.length > 0 && <div className="mb-allday">{entries.map(chip)}</div>}
      <PhoneHours day={day} today={today} boxes={boxes} onOpen={(box) => { const due = timed.find((each) => `${each.collection}@${each.record.id}` === box.key); if (due) actions.openRecord(due.collection, due.record.id); }} onSwipe={(by) => onDay(addDays(day, by))} onMove={move} onTarget={setTarget} />
    </TaskPage>
  );
}

function PhoneDays({ lists, boards, today, actions, still = null }: Props) {
  const due = dueToday(lists, today);
  const cards = splitDueCards(boards, today);
  const subtasks = splitDueSubtasks(actions.dueSubtasks(), today);
  const tasksOn = new Map(dueUpcoming(lists, today).map((d) => [d.day, d.tasks]));
  tasksOn.set(today, due.today);
  cards.later.set(today, cards.today);
  subtasks.later.set(today, subtasks.today);
  const recordsOn = recordsByDay(actions.dueRecords(), today);
  const busy = [...tasksOn, ...cards.later, ...subtasks.later, ...recordsOn].filter(([, on]) => on.length > 0).map(([day]) => day);
  const runs = dayRuns([...new Set(busy)], today);

  const item = ({ list, task }: { list: string; task: Task }) => (
    <TaskItem key={`${list}/${task.id}`} list={list} task={task} tasks={lists[list] ?? []} today={today} showDone={false} actions={actions} flat byDay />
  );
  const cardItem = ({ board, card }: { board: string; card: Card }) => (
    <CardRow key={`${board}#${card.id}`} board={board} whole={boards[board]!} card={card} today={today} actions={actions} byDay />
  );
  const subtaskItem = (d: DueSubtask) => <SubtaskRow key={`${placeOf(d)}~${d.subtask.id}`} due={d} today={today} actions={actions} byDay />;
  const late: Dated[] = [
    ...due.overdue.map(({ list, task }) => ({ list, id: task.id })),
    ...cards.overdue.map(({ board, card }) => ({ board, id: card.id })),
    ...subtasks.overdue.map(subtaskRefOf),
  ];
  const reschedule = () => actions.pickDay?.(t('tasks.rescheduleTitle', { count: late.length }), (day) => actions.reschedule(late, day));

  return (
    <TaskPage title={t('tasks.upcoming')} bare footer={<StillOpening text={still} />}>
      {late.length > 0 && (
        <>
          <div className="sec">
            {t('tasks.overdue')} <small>{late.length}</small>
            <button type="button" className="resch" onClick={reschedule}>
              {t('tasks.reschedule')}
            </button>
          </div>
          {due.overdue.map(item)}
          {cards.overdue.map(cardItem)}
          {subtasks.overdue.map(subtaskItem)}
        </>
      )}
      {runs.map((run) =>
        'free' in run ? (
          <div key={`free:${run.free.from}`} className="mb-gap">
            {freeWords(run.free, today)}
          </div>
        ) : (
          <Fragment key={run.day}>
            <div className="sec">
              {dayHeading(run.day, today)}{' '}
              <small>{(tasksOn.get(run.day)?.length ?? 0) + (cards.later.get(run.day)?.length ?? 0) + (subtasks.later.get(run.day)?.length ?? 0) + (recordsOn.get(run.day)?.length ?? 0)}</small>
            </div>
            {(tasksOn.get(run.day) ?? []).map(item)}
            {(cards.later.get(run.day) ?? []).map(cardItem)}
            {(subtasks.later.get(run.day) ?? []).map(subtaskItem)}
            {(recordsOn.get(run.day) ?? []).map((due) => (
              <RecordRow key={recordKey(due)} due={due} day={run.day} today={today} actions={actions} />
            ))}
          </Fragment>
        ),
      )}
      {late.length === 0 && runs.length === 0 && (
        <Empty
          icon="week"
          title={t('phone.emptyUpcoming')}
          text={t('phone.emptyUpcomingText')}
          action={{ label: t('tasks.add'), run: () => actions.quickAdd?.(INBOX_TASKS, null, addDays(today, 1)) }}
        />
      )}
    </TaskPage>
  );
}

function PhoneMonth({ lists, boards, today, actions, day, onDay, still = null }: Props) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const { byDay } = datedByDay(lists, boards, today, actions.dueSubtasks(), actions.dueRecords());
  const entries = byDay.get(day) ?? [];
  const shift = (by: number) => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const first = new Date(y, m - 1 + by, 1);
    setMonth(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`);
  };
  const initials = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }));
  const row = (entry: Entry) => <EntryRow key={entryKey(entry)} entry={entry} lists={lists} boards={boards} today={today} actions={actions} />;

  return (
    <TaskPage title={t('tasks.upcoming')} bare footer={<StillOpening text={still} />}>
      <div className="mb-month">
        <div className="mh">
          {monthWords(month)}
          <span>
            <button type="button" aria-label={t('phone.previousMonth')} onClick={() => shift(-1)}>
              <Icon name="back" />
            </button>
            <button type="button" aria-label={t('phone.nextMonth')} onClick={() => shift(1)}>
              <Icon name="chevron" />
            </button>
          </span>
        </div>
        <div className="wd" aria-hidden="true">
          {initials.map((initial, i) => (
            <span key={i}>{initial}</span>
          ))}
        </div>
        <div className="days">
          {monthDays(month).map((each) => {
            const busy = byDay.has(each);
            const className = [each.slice(0, 7) !== month && 'out', busy && 'busy', each === today && 'today', each === day && 'on'].filter(Boolean).join(' ');
            return (
              <button key={each} type="button" className={className || undefined} aria-pressed={each === day} aria-label={dateWords(each, today)} onClick={() => onDay(each)}>
                <b>{Number(each.slice(8))}</b>
                <i className={busy ? undefined : 'no'} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="sec">
        {dayHeading(day, today)} {entries.length > 0 && <small>{entries.length}</small>}
      </div>
      {entries.map(row)}
      {entries.length === 0 && (
        <>
          <p className="task-empty">{t('tasks.nothingOnDay')}</p>
          <button type="button" className="qa mb-addday" onClick={() => actions.quickAdd?.(INBOX_TASKS, null, day)}>
            <Icon name="plus" />
            {t('tasks.addOn', { day: dateWords(day, today) })}
          </button>
        </>
      )}
    </TaskPage>
  );
}
