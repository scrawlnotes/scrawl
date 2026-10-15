import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import {
  addDays,
  addSection,
  addTask,
  childrenOf,
  dayOf,
  dayRuns,
  daysApart,
  depthOf,
  dueToday,
  dueUpcoming,
  foldSection,
  loadList,
  loadTasks,
  moveSection,
  moveTask,
  moveTaskToList,
  MAX_DEPTH,
  openCount,
  parseList,
  parseTasks,
  progressOf,
  relinkNote,
  relinkBoard,
  removeSection,
  removeTask,
  renameSection,
  saveList,
  sectionTasks,
  serializeList,
  serializeTasks,
  reopenTasks,
  setDone,
  type Task,
  type TaskList,
  updateTask,
  cardRef,
  parseCardRef,
  recordTasks,
  relinkTaskRecords,
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

  it('undoes a completion: the ones it completed open again, one done before stays done', () => {
    const before = setDone(tree(), 'a2', true, now);
    const done = setDone(before, 'a', true, now);
    const closed = done.filter((t) => t.done && !before.find((b) => b.id === t.id)!.done).map((t) => t.id);
    const undone = reopenTasks(done, closed, now);
    expect(doneIds(undone)).toEqual(['a2']);
    expect(undone.find((t) => t.id === 'a')!.completed).toBeNull();
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

  it('gives a task to someone by id and name, and to nobody again', () => {
    let tasks = addTask([], { title: 'Call Lena', assignee: { id: 'p1', name: 'Lena' }, author: { id: 'p2', name: 'Kaan' } }, () => new Date(), 'a');
    expect(parseTasks(serializeTasks(tasks))[0]).toMatchObject({ assignee: { id: 'p1', name: 'Lena' }, author: { id: 'p2', name: 'Kaan' } });
    tasks = updateTask(tasks, 'a', { assignee: null });
    expect(tasks[0]).not.toHaveProperty('assignee');
    expect(parseTasks(JSON.stringify({ tasks: [{ id: 'b', title: 'Old', assignee: 'Kaan' }] }))[0]?.assignee).toEqual({ name: 'Kaan' });
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

  it('moves a task with its subtasks into another section, at the place given', () => {
    const list = moveTask(sample(), 'p0a', { parent: null, section: 's1', after: 'p1a' }, now);
    expect(titles(sectionTasks(list, 's0'))).toEqual(['p0 second']);
    expect(titles(sectionTasks(list, 's1'))).toEqual(['p1 first', 'p0 first']);
    expect(titles(childrenOf(list.tasks, 'p0a'))).toEqual(['under p0']);
    const first = moveTask(list, 'p0b', { parent: null, section: 's1', after: null }, now);
    expect(titles(sectionTasks(first, 's1'))).toEqual(['p0 second', 'p1 first', 'p0 first']);
    expect(titles(sectionTasks(moveTask(list, 'p1a', { parent: null, section: null, after: 'loose' }, now), null))).toEqual(['loose', 'p1 first']);
  });

  it('makes a task a subtask, and a subtask a top-level task without a section of its own', () => {
    let list = moveTask(sample(), 'loose', { parent: 'p0b', section: 's0', after: null }, now);
    expect(list.tasks.find((t) => t.id === 'loose')).toMatchObject({ parent: 'p0b' });
    expect(list.tasks.find((t) => t.id === 'loose')!.section).toBeUndefined();
    list = moveTask(list, 'p0a1', { parent: null, section: null, after: null }, now);
    expect(titles(sectionTasks(list, null))).toEqual(['under p0']);
  });

  it('does not move a task into itself, or its subtasks deeper than allowed', () => {
    const list = sample();
    expect(moveTask(list, 'p0a', { parent: 'p0a1', section: null, after: null }, now)).toBe(list);
    expect(moveTask(list, 'p0a', { parent: 'p0a', section: null, after: null }, now)).toBe(list);
    // A chain as deep as allowed cannot take a task that has a subtask of its own.
    let deep: TaskList = { sections: [], tasks: [] };
    let parent: string | null = null;
    for (let i = 0; i <= MAX_DEPTH; i++) {
      deep = { ...deep, tasks: addTask(deep.tasks, { title: `d${i}`, parent }, now, `d${i}`) };
      parent = `d${i}`;
    }
    deep = { ...deep, tasks: addTask(addTask(deep.tasks, { title: 'x' }, now, 'x'), { title: 'x1', parent: 'x' }, now, 'x1') };
    expect(moveTask(deep, 'x', { parent: `d${MAX_DEPTH - 1}`, section: null, after: null }, now)).toBe(deep);
    expect(moveTask(deep, 'x1', { parent: `d${MAX_DEPTH - 1}`, section: null, after: null }, now)).not.toBe(deep);
  });

  it('leaves the list as it is when a task is dropped where it was', () => {
    const list = sample();
    expect(moveTask(list, 'p0b', { parent: null, section: 's0', after: 'p0a' }, now)).toBe(list);
    expect(moveTask(list, 'p0a', { parent: null, section: 's0', after: null }, now)).toBe(list);
  });

  it('moves a task with its subtasks to another list, at the end of a section there', () => {
    const other: TaskList = addSection({ sections: [], tasks: addTask([], { title: 'there' }, now, 'there') }, 'Later', 'later');
    const withDetail = updateTask(sample().tasks, 'p0a', { due: '2026-10-09', priority: 2, description: 'kept' }, now);
    const { from, to } = moveTaskToList({ ...sample(), tasks: withDetail }, other, 'p0a', 'later', now);
    expect(titles(sectionTasks(from, 's0'))).toEqual(['p0 second']);
    expect(from.tasks.some((t) => t.id === 'p0a1')).toBe(false);
    expect(titles(sectionTasks(to, 'later'))).toEqual(['p0 first']);
    expect(titles(childrenOf(to.tasks, 'p0a'))).toEqual(['under p0']);
    expect(to.tasks.find((t) => t.id === 'p0a')).toMatchObject({ due: '2026-10-09', priority: 2, description: 'kept', parent: null });
    // A subtask becomes a top-level task; a section that is not there means none.
    const sub = moveTaskToList(sample(), other, 'p0a1', 'gone', now);
    expect(titles(sectionTasks(sub.to, null))).toEqual(['there', 'under p0']);
    expect(sub.to.tasks.find((t) => t.id === 'p0a1')!.section).toBeUndefined();
  });

  it('makes a task from a note, and follows the note when it moves', () => {
    const tasks = addTask([], { title: 'Ask first', description: '  on the remote \n', note: 'Scrawl/Sync.md' }, now, 't');
    expect(tasks[0]).toMatchObject({ title: 'Ask first', description: 'on the remote', note: 'Scrawl/Sync.md' });
    const list = relinkNote({ sections: [], tasks }, 'Scrawl/Sync.md', 'Scrawl/Sync engine.md');
    expect(list.tasks[0]!.note).toBe('Scrawl/Sync engine.md');
    expect(relinkNote(list, 'Other.md', 'Elsewhere.md')).toBe(list);
    expect(addTask([], { title: 'plain' }, now, 'p')[0]).not.toHaveProperty('note');
  });

  it('moves a section with its tasks', () => {
    const list = addSection(sample(), 'Phase 2', 's2');
    expect(moveSection(list, 's2', null).sections.map((s) => s.id)).toEqual(['s2', 's0', 's1']);
    expect(moveSection(list, 's0', 's1').sections.map((s) => s.id)).toEqual(['s1', 's0', 's2']);
    expect(moveSection(list, 's0', 'gone')).toBe(list);
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

describe('the days of Upcoming', () => {
  it('counts days apart across a month, a year and a change of the clocks', () => {
    expect(daysApart('2026-10-15', '2026-10-15')).toBe(0);
    expect(daysApart('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysApart('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysApart('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysApart('2026-10-20', '2026-10-15')).toBe(-5);
  });

  it('puts the free days before each day that has something in one run', () => {
    expect(dayRuns(['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-22'], '2026-10-15')).toEqual([
      { day: '2026-10-15' },
      { day: '2026-10-16' },
      { free: { from: '2026-10-17', to: '2026-10-18', count: 2 } },
      { day: '2026-10-19' },
      { day: '2026-10-20' },
      { free: { from: '2026-10-21', to: '2026-10-21', count: 1 } },
      { day: '2026-10-22' },
    ]);
  });

  it('starts the first run today when today is free, across the end of a month', () => {
    expect(dayRuns(['2026-11-02'], '2026-10-30')).toEqual([{ free: { from: '2026-10-30', to: '2026-11-01', count: 3 } }, { day: '2026-11-02' }]);
  });

  it('leaves out what is late, a day twice, and anything after the last day', () => {
    expect(dayRuns(['2026-10-17', '2026-10-13', '2026-10-17'], '2026-10-15')).toEqual([
      { free: { from: '2026-10-15', to: '2026-10-16', count: 2 } },
      { day: '2026-10-17' },
    ]);
    expect(dayRuns([], '2026-10-15')).toEqual([]);
  });
});

describe('cards a task was made from', () => {
  it('are referred to by board and id, and follow the board when it moves', () => {
    expect(parseCardRef(cardRef('Work/Plan.board.json', 'c1'))).toEqual({ board: 'Work/Plan.board.json', id: 'c1' });
    expect(parseCardRef('nothing')).toBeNull();
    expect(parseCardRef('x#')).toBeNull();
    let tasks = addTask([], { title: 'A', card: cardRef('Work/Plan.board.json', 'c1') }, now, 'A');
    tasks = addTask(tasks, { title: 'B' }, now, 'B');
    const list: TaskList = { sections: [], tasks };
    expect(relinkBoard(list, 'Other.board.json', 'x')).toBe(list);
    const moved = relinkBoard(list, 'Work/Plan.board.json', 'Done/Plan.board.json');
    expect(moved.tasks[0]!.card).toBe('Done/Plan.board.json#c1');
    expect(moved.tasks[1]).not.toHaveProperty('card');
    // A card reference that is not a string is dropped when the file is read.
    expect(parseTasks(JSON.stringify({ tasks: [{ id: 'k', title: 'T', card: 3 }] }))[0]).not.toHaveProperty('card');
    expect(parseTasks(serializeTasks(moved.tasks))).toEqual(moved.tasks);
  });
});

describe('a task about a record', () => {
  const acme = { collection: 'Scrawl/Companies', id: 'a1', name: 'Acme Corp', code: 'CUS-0012' };

  it('keeps the record through the file, and lets it go', () => {
    let tasks = addTask([], { title: 'Send the offer', record: acme }, undefined, 't1');
    tasks = addTask(tasks, { title: 'Renew domain' }, undefined, 't2');
    const read = parseList(serializeTasks(tasks)).tasks;
    expect(read[0]!.record).toEqual(acme);
    expect('record' in read[1]!).toBe(false);
    // A record written badly is no record.
    expect(parseTasks(JSON.stringify({ tasks: [{ id: 'x', title: 'x', record: { id: 'a1' } }] }))[0]!.record).toBeUndefined();
    const unlinked = updateTask(read, 't1', { record: null });
    expect('record' in unlinked[0]!).toBe(false);
    expect(updateTask(read, 't2', { record: acme })[1]!.record).toEqual(acme);
  });

  it('is found from the record, the open ones first, and follows its collection when it moves', () => {
    let inbox = addTask([], { title: 'Call Lena', record: acme, due: '2026-10-14' }, undefined, 't1');
    inbox = addTask(inbox, { title: 'Send the offer', record: acme, due: '2026-10-08' }, undefined, 't2');
    inbox = setDone(addTask(inbox, { title: 'Send the deck', record: acme }, undefined, 't3'), 't3', true);
    const other = addTask([], { title: 'Book the room', record: { ...acme, id: 'b2', name: 'Globex' } }, undefined, 't4');
    const found = recordTasks({ Inbox: inbox, 'Scrawl/Tasks': other }, 'Scrawl/Companies', 'a1');
    expect(found.map((f) => f.task.title)).toEqual(['Send the offer', 'Call Lena', 'Send the deck']);
    const moved = relinkTaskRecords({ sections: [], tasks: inbox }, 'Scrawl/Companies', 'Work/Companies');
    expect(moved.tasks.every((t) => t.record?.collection === 'Work/Companies')).toBe(true);
  });
});
