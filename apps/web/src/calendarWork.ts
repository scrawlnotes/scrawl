import {
  addDays,
  type Board,
  type CalendarChoice,
  type DueRecord,
  type DueRecordSubtask,
  isFinished,
  isUnder,
  keyOf,
  recordLabel,
  rowGoes,
  syncRange,
  type Task,
  type WantedEvent,
} from '@scrawlnotes/core';

// What of Scrawl goes to the outside calendar (design/outlook-calendar.md 2.1, 2.2, 12): the
// person's dated work from yesterday on, as far as Upcoming looks, each under the row it belongs
// to, an app's own things under the app's row, the rest under Tasks, Boards or Collections.

export interface CalendarWorkInput {
  /** The person's own task lists and boards, by path; records and their subtasks already theirs. */
  tasks: Record<string, Task[]>;
  boards: Record<string, Board>;
  records: readonly DueRecord[];
  recordSubtasks: readonly DueRecordSubtask[];
  /** The installed apps' folders. */
  apps: readonly string[];
  /** Where a path is, as the event's note says it: "Work › Roadmap". */
  placeOf(path: string): string;
}

const isDay = (value: string | null | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function calendarWork(input: CalendarWorkInput, choice: Pick<CalendarChoice, 'goes'>, today: string): WantedEvent[] {
  const { from, to } = syncRange(today);
  const inRange = (day: string) => day >= from && day <= to;
  const goes = (path: string, row: 'tasks' | 'boards' | 'collections') => {
    const app = input.apps.find((folder) => isUnder(path, folder));
    return rowGoes(choice, app ? { app } : row);
  };
  const where = (path: string) => `Scrawl · ${input.placeOf(path)}`;
  const out: WantedEvent[] = [];

  for (const [path, list] of Object.entries(input.tasks)) {
    if (!goes(path, 'tasks')) continue;
    for (const task of list) {
      if (isDay(task.due) && inRange(task.due)) out.push({ id: `task:${path}#${task.id}`, title: task.title, day: task.due, done: task.done, where: where(path) });
    }
  }

  for (const [path, board] of Object.entries(input.boards)) {
    if (!goes(path, 'boards')) continue;
    for (const card of board.cards) {
      const key = keyOf(board, card);
      const finished = isFinished(board, card);
      if (isDay(card.due) && inRange(card.due)) out.push({ id: `card:${path}#${card.id}`, title: `${key} ${card.title}`, day: card.due, done: finished, where: where(path) });
      for (const subtask of card.subtasks ?? []) {
        if (isDay(subtask.due) && inRange(subtask.due)) {
          out.push({ id: `card:${path}#${card.id}/${subtask.id}`, title: `${subtask.title} · ${key}`, day: subtask.due, done: subtask.done || finished, where: where(path) });
        }
      }
    }
  }

  for (const due of input.records) {
    if (!goes(due.collection, 'collections')) continue;
    const id = `record:${due.collection}#${due.record.id}${due.day ? `@${due.day}` : ''}`;
    const title = recordLabel(due.record);
    // A day a program comes on is that day, all day; a record with a time has its time.
    // shortcut: a record over several days goes on its first only; spread it over its days if asked.
    if (due.day) {
      if (inRange(due.day)) out.push({ id, title, day: due.day, done: false, where: where(due.collection) });
      continue;
    }
    const day = due.start.slice(0, 10);
    if (!inRange(day)) continue;
    const timed = due.start.length > 10;
    const end = timed && due.end && due.end.length > 10 && due.end.slice(0, 10) === day ? due.end.slice(0, 16) : undefined;
    out.push({ id, title, day, ...(timed && { start: due.start.slice(0, 16), ...(end && { end }) }), done: false, where: where(due.collection) });
  }

  for (const { collection, record, subtask } of input.recordSubtasks) {
    if (!isDay(subtask.due) || !inRange(subtask.due) || !goes(collection, 'collections')) continue;
    out.push({ id: `record:${collection}#${record.id}/${subtask.id}`, title: `${subtask.title} · ${recordLabel(record)}`, day: subtask.due, done: subtask.done, where: where(collection) });
  }
  return out;
}

/** The first day the records are looked for from: yesterday, so that its events stay. */
export const recordsFrom = (today: string) => addDays(today, -1);
