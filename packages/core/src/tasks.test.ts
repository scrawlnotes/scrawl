import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import {
  addDays,
  addTask,
  childrenOf,
  dayOf,
  depthOf,
  dueToday,
  dueUpcoming,
  loadTasks,
  MAX_DEPTH,
  openCount,
  parseTasks,
  progressOf,
  removeTask,
  saveTasks,
  serializeTasks,
  setDone,
  type Task,
  updateTask,
} from './tasks';

const now = () => new Date('2026-10-05T12:00:00.000Z');

/** Builds a list from `[id, parent]` pairs, with ids that are easy to read in assertions. */
function list(...items: [id: string, parent?: string | null, extra?: Partial<Task>][]): Task[] {
  let tasks: Task[] = [];
  for (const [id, parent, extra] of items) {
    tasks = addTask(tasks, { title: id, parent }, now, id);
    if (extra) tasks = tasks.map((t) => (t.id === id ? { ...t, ...extra } : t));
  }
  return tasks;
}
const titles = (tasks: Task[]) => tasks.map((t) => t.id);

describe('days', () => {
  it('uses the local calendar day', () => {
    expect(dayOf(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('adding and editing', () => {
  it('adds tasks in order, each at the end of its siblings', () => {
    const tasks = list(['a'], ['b'], ['a1', 'a'], ['a2', 'a']);
    expect(titles(childrenOf(tasks, null))).toEqual(['a', 'b']);
    expect(titles(childrenOf(tasks, 'a'))).toEqual(['a1', 'a2']);
    expect(tasks[0]).toMatchObject({ done: false, priority: 4, due: null, parent: null, order: 0 });
  });

  it('ignores an empty title and a parent that does not exist', () => {
    expect(addTask([], { title: '   ' }, now)).toEqual([]);
    expect(addTask([], { title: 'x', parent: 'missing' }, now)).toEqual([]);
  });

  it('nests subtasks down to the depth limit and no further', () => {
    let tasks = list(['0']);
    for (let depth = 1; depth <= MAX_DEPTH + 1; depth++) {
      tasks = addTask(tasks, { title: String(depth), parent: String(depth - 1) }, now, String(depth));
    }
    expect(titles(tasks)).toEqual(['0', '1', '2', '3', '4']);
    expect(depthOf(tasks, '4')).toBe(MAX_DEPTH);
  });

  it('changes title, due day and priority, and keeps the old title when the new one is empty', () => {
    let tasks = list(['a']);
    tasks = updateTask(tasks, 'a', { title: ' Buy milk ', due: '2026-10-06', priority: 1 }, now);
    expect(tasks[0]).toMatchObject({ title: 'Buy milk', due: '2026-10-06', priority: 1 });
    expect(updateTask(tasks, 'a', { title: ' ' }, now)[0]!.title).toBe('Buy milk');
  });
});

describe('completing', () => {
  const tree = () => list(['a'], ['a1', 'a'], ['a1x', 'a1'], ['a2', 'a'], ['b']);
  const doneIds = (tasks: Task[]) => tasks.filter((t) => t.done).map((t) => t.id);

  it('completes a task with all its subtasks', () => {
    expect(doneIds(setDone(tree(), 'a', true, now))).toEqual(['a', 'a1', 'a1x', 'a2']);
  });

  it('completing a subtask leaves its parent open', () => {
    expect(doneIds(setDone(tree(), 'a1x', true, now))).toEqual(['a1x']);
  });

  it('reopening a subtask reopens the tasks above it', () => {
    const done = setDone(tree(), 'a', true, now);
    expect(doneIds(setDone(done, 'a1x', false, now))).toEqual(['a2']);
  });

  it('counts direct subtasks and open tasks', () => {
    const tasks = setDone(tree(), 'a1', true, now);
    expect(progressOf(tasks, 'a')).toEqual({ done: 1, total: 2 });
    expect(openCount(tasks)).toBe(3);
  });

  it('removes a task together with its subtasks', () => {
    expect(titles(removeTask(tree(), 'a'))).toEqual(['b']);
  });
});

describe('task file', () => {
  it('round-trips through its file', async () => {
    const fs = new MemoryFs();
    const tasks = list(['a'], ['a1', 'a']);
    await saveTasks(fs, 'Work/Sprint.tasks.json', tasks);
    expect(await fs.readText('Work/Sprint.tasks.json')).toBe(serializeTasks(tasks));
    expect(await loadTasks(fs, 'Work/Sprint.tasks.json')).toEqual(tasks);
    expect(await loadTasks(fs, 'Work/Other.tasks.json')).toEqual([]);
  });

  it('survives a broken file and broken entries', () => {
    expect(parseTasks('not json')).toEqual([]);
    expect(parseTasks('{"tasks": "nope"}')).toEqual([]);
    const tasks = parseTasks(
      JSON.stringify({ tasks: [null, { id: 'a' }, { id: 'b', title: 'ok', priority: 9, due: 'tomorrow', parent: 'gone' }] }),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: 'b', title: 'ok', priority: 4, due: null, parent: null, done: false });
  });

  it('keeps fields it does not know', () => {
    const text = JSON.stringify({ tasks: [{ id: 'a', title: 'x', section: 'Phase 1', future: { any: 1 } }] });
    expect(parseTasks(text)[0]).toMatchObject({ section: 'Phase 1', future: { any: 1 } });
  });
});

describe('due views', () => {
  const lists = {
    'Work/Tasks.tasks.json': list(
      ['late', null, { due: '2026-10-03' }],
      ['today-p3', null, { due: '2026-10-05', priority: 3 }],
      ['done-today', null, { due: '2026-10-05', done: true }],
      ['next', null, { due: '2026-10-09' }],
      ['undated'],
    ),
    'Home/Tasks.tasks.json': list(['today-p1', null, { due: '2026-10-05', priority: 1 }], ['tomorrow', null, { due: '2026-10-06' }]),
  };
  const ids = (due: { list: string; task: Task }[]) => due.map((d) => `${d.list.split('/')[0]}/${d.task.id}`);

  it('collects what is due today from every list, late tasks apart, by priority', () => {
    const { overdue, today } = dueToday(lists, '2026-10-05');
    expect(ids(overdue)).toEqual(['Work/late']);
    expect(ids(today)).toEqual(['Home/today-p1', 'Work/today-p3']);
  });

  it('groups what comes later by day', () => {
    expect(dueUpcoming(lists, '2026-10-05').map((g) => [g.day, ids(g.tasks)])).toEqual([
      ['2026-10-06', ['Home/tomorrow']],
      ['2026-10-09', ['Work/next']],
    ]);
  });
});
