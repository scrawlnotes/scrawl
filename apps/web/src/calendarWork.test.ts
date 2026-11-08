import { type Board, type DueRecord, NO_CHOICE, type Task } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { calendarWork } from './calendarWork';

// What goes to the outside calendar (design/outlook-calendar.md 2.1, 2.2): the person's dated
// work from yesterday on, under its row; an app's own under the app's.

const TODAY = '2026-11-09';
const task = (id: string, due: string | null, done = false) => ({ id, title: `Task ${id}`, due, done }) as Task;
const board = {
  prefix: 'ROA',
  columns: [
    { id: 'todo', name: 'Todo', kind: 'active' },
    { id: 'done', name: 'Done', kind: 'done' },
  ],
  cards: [
    { id: 'c1', key: 12, title: 'Fix the login', column: 'todo', due: TODAY, subtasks: [{ id: 's1', title: 'Write the test', done: false, due: '2026-11-10' }] },
    { id: 'c2', key: 13, title: 'Ship it', column: 'done', due: '2026-11-08' },
    { id: 'c3', key: 14, title: 'Long ago', column: 'todo', due: '2026-10-01' },
  ],
} as unknown as Board;
const record = (collection: string, start: string, end: string | null = null, day?: string) =>
  ({ collection, record: { id: 'r1', name: 'Ayşe Yılmaz', values: {} }, start, end, ...(day && { day }) }) as unknown as DueRecord;

const input = {
  tasks: { 'Tasks.tasks.json': [task('a', TODAY), task('b', '2026-11-08', true), task('c', null), task('d', '2027-03-01')], 'Gym/Plan.tasks.json': [task('g', TODAY)] },
  boards: { '@sp-1/Roadmap.board.json': board },
  records: [record('Clinic/Appointments', '2026-11-09T14:00', '2026-11-09T15:00'), record('Gym/Workouts', '2026-11-02', null, '2026-11-10')],
  recordSubtasks: [],
  apps: ['Clinic', 'Gym'],
  placeOf: (path: string) => path.replace(/\.(tasks|board)\.json$/, ''),
};

describe('What goes to the calendar', () => {
  it('sends tasks and cards, finished ones with ✓ to come, and leaves apps out till chosen', () => {
    const wanted = calendarWork(input, NO_CHOICE, TODAY);
    expect(wanted.map((w) => [w.id, w.title, w.day, w.done])).toEqual([
      ['task:Tasks.tasks.json#a', 'Task a', TODAY, false],
      ['task:Tasks.tasks.json#b', 'Task b', '2026-11-08', true],
      ['card:@sp-1/Roadmap.board.json#c1', 'ROA-12 Fix the login', TODAY, false],
      ['card:@sp-1/Roadmap.board.json#c1/s1', 'Write the test · ROA-12', '2026-11-10', false],
      ['card:@sp-1/Roadmap.board.json#c2', 'ROA-13 Ship it', '2026-11-08', true],
    ]);
    expect(wanted[0]!.where).toBe('Scrawl · Tasks');
  });

  it('sends an app’s own things under its row: a record with its time, a program’s day all day', () => {
    const wanted = calendarWork(input, { goes: { tasks: false, boards: false, apps: { Clinic: true, Gym: true } } }, TODAY);
    expect(wanted.map((w) => ({ id: w.id, day: w.day, start: w.start, end: w.end }))).toEqual([
      { id: 'task:Gym/Plan.tasks.json#g', day: TODAY, start: undefined, end: undefined },
      { id: 'record:Clinic/Appointments#r1', day: TODAY, start: '2026-11-09T14:00', end: '2026-11-09T15:00' },
      { id: 'record:Gym/Workouts#r1@2026-11-10', day: '2026-11-10', start: undefined, end: undefined },
    ]);
  });
});
