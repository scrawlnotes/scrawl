import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import {
  addDays,
  addSection,
  addTask,
  childrenOf,
  dayOf,
  depthOf,
  dueToday,
  dueUpcoming,
  foldSection,
  loadList,
  loadTasks,
  MAX_DEPTH,
  openCount,
  parseList,
  parseTasks,
  progressOf,
  removeSection,
  removeTask,
  renameSection,
  saveList,
  sectionTasks,
  serializeList,
  serializeTasks,
  setDone,
  type Task,
  type TaskList,
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

  it('keeps a description with its line breaks, and leaves an empty one out of the file', () => {
    let tasks = updateTask(list(['a']), 'a', { description: '\n  Ask the owner first.\n  Else @scrawlnotes.\n\n' }, now);
    expect(tasks[0]!.description).toBe('Ask the owner first.\n  Else @scrawlnotes.');
    expect(parseTasks(serializeTasks(tasks))[0]!.description).toBe('Ask the owner first.\n  Else @scrawlnotes.');
    tasks = updateTask(tasks, 'a', { description: '  \n ' }, now);
    expect(tasks[0]!.description).toBeUndefined();
    expect(serializeTasks(tasks)).not.toContain('description');
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
    await saveList(fs, 'Work/Sprint.tasks.json', { sections: [], tasks });
    expect(await fs.readText('Work/Sprint.tasks.json')).toBe(serializeTasks(tasks));
    expect(await loadTasks(fs, 'Work/Sprint.tasks.json')).toEqual(tasks);
    expect(await loadTasks(fs, 'Work/Other.tasks.json')).toEqual([]);
    expect(await loadList(fs, 'Work/Other.tasks.json')).toEqual({ sections: [], tasks: [] });
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

describe('sections', () => {
  const titles = (tasks: Task[]) => tasks.map((t) => t.title);
  /** A list with two sections and tasks in none, in each and under one of them. */
  function sample(): TaskList {
    let list: TaskList = addSection(addSection({ sections: [], tasks: [] }, ' Phase 0 ', 's0'), 'Phase 1', 's1');
    let tasks = addTask(list.tasks, { title: 'loose' }, now, 'loose');
    tasks = addTask(tasks, { title: 'p0 first', section: 's0' }, now, 'p0a');
    tasks = addTask(tasks, { title: 'p1 first', section: 's1' }, now, 'p1a');
    tasks = addTask(tasks, { title: 'p0 second', section: 's0' }, now, 'p0b');
    tasks = addTask(tasks, { title: 'under p0', parent: 'p0a', section: 's1' }, now, 'p0a1');
    list = { ...list, tasks };
    return list;
  }

  it('puts each task at the end of its own section, and subtasks under their parent only', () => {
    const list = sample();
    expect(list.sections.map((s) => s.name)).toEqual(['Phase 0', 'Phase 1']);
    expect(titles(sectionTasks(list, null))).toEqual(['loose']);
    expect(titles(sectionTasks(list, 's0'))).toEqual(['p0 first', 'p0 second']);
    expect(titles(sectionTasks(list, 's1'))).toEqual(['p1 first']);
    expect(list.tasks.find((t) => t.id === 'p0a1')).toMatchObject({ parent: 'p0a' });
    expect(list.tasks.find((t) => t.id === 'p0a1')!.section).toBeUndefined();
  });

  it('round-trips sections through the file, and keeps a list without them as it was', () => {
    const list = foldSection(sample(), 's1', true);
    expect(parseList(serializeList(list))).toEqual(list);
    expect(serializeList({ sections: [], tasks: [] })).not.toContain('sections');
    expect(JSON.parse(serializeList(foldSection(list, 's1', false))).sections[1]).toEqual({ id: 's1', name: 'Phase 1' });
  });

  it('renames a section, and keeps the name when the new one is empty', () => {
    expect(renameSection(sample(), 's0', ' Design ').sections[0]!.name).toBe('Design');
    expect(renameSection(sample(), 's0', '  ').sections[0]!.name).toBe('Phase 0');
    expect(addSection(sample(), ' ').sections).toHaveLength(2);
  });

  it('deletes a section with its tasks and their subtasks', () => {
    const list = removeSection(sample(), 's0');
    expect(list.sections.map((s) => s.id)).toEqual(['s1']);
    expect(titles(list.tasks)).toEqual(['loose', 'p1 first']);
  });

  it('shows a task whose section is gone among the tasks in none', () => {
    const list = { ...sample(), sections: [] };
    expect(titles(sectionTasks(list, null))).toEqual(['loose', 'p0 first', 'p1 first', 'p0 second']);
  });

  it('skips broken sections', () => {
    const text = JSON.stringify({ sections: [{ id: 'a', name: 'A' }, { id: 'a', name: 'again' }, { name: 'no id' }, null], tasks: [] });
    expect(parseList(text).sections).toEqual([{ id: 'a', name: 'A' }]);
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
