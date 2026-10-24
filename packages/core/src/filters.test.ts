import { describe, expect, it } from 'vitest';
import {
  asksAnything,
  choosesAnything,
  endOfWeek,
  type FilterChoices,
  filterName,
  filterTasks,
  GIVEN,
  loadFilters,
  matchesFilter,
  NO_CHOICES,
  parseFilters,
  readChoices,
  saveFilters,
  serializeFilters,
  taskMatches,
  taskPicks,
  addPresetFilters,
} from './filters';
import { MemoryFs } from './fs';
import { addTask, type Task, updateTask } from './tasks';

const now = () => new Date('2026-10-05T12:00:00.000Z');
// A Wednesday.
const today = '2026-10-07';
const all: FilterChoices = { due: 'any', priorities: [], folders: [], text: '' };

function task(id: string, extra: Partial<Task> = {}): Task {
  return { ...addTask([], { title: id }, now, id)[0]!, ...extra };
}

describe('filters', () => {
  it('ends the week on Sunday', () => {
    expect(endOfWeek('2026-10-05')).toBe('2026-10-11');
    expect(endOfWeek('2026-10-07')).toBe('2026-10-11');
    expect(endOfWeek('2026-10-11')).toBe('2026-10-11');
  });

  it('picks open tasks by when they are due, overdue ones counting as due by today', () => {
    const due = (d: string | null) => task('t', { due: d });
    const on = (rule: FilterChoices['due'], d: string | null) => matchesFilter({ ...all, due: rule }, 'Work/T.tasks.json', due(d), today);
    expect(on('overdue', '2026-10-06')).toBe(true);
    expect(on('overdue', today)).toBe(false);
    expect(on('today', '2026-10-01')).toBe(true);
    expect(on('today', '2026-10-08')).toBe(false);
    expect(on('week', '2026-10-11')).toBe(true);
    expect(on('week', '2026-10-12')).toBe(false);
    expect(on('next7', '2026-10-13')).toBe(true);
    expect(on('next7', '2026-10-14')).toBe(false);
    expect(on('none', null)).toBe(true);
    expect(on('none', today)).toBe(false);
    expect(matchesFilter(all, 'Work/T.tasks.json', task('done', { done: true }), today)).toBe(false);
  });

  it('picks by priority, by folder with the folders inside it, and by text in the title or description', () => {
    const list = 'Work/Client/Tasks.tasks.json';
    const t1 = { ...updateTask([task('Call the bank')], 'Call the bank', { priority: 1, description: 'About the LOAN' }, now)[0]! };
    expect(matchesFilter({ ...all, priorities: [1, 2] }, list, t1, today)).toBe(true);
    expect(matchesFilter({ ...all, priorities: [4] }, list, t1, today)).toBe(false);
    expect(matchesFilter({ ...all, folders: ['Work'] }, list, t1, today)).toBe(true);
    expect(matchesFilter({ ...all, folders: ['Home', 'Inbox'] }, list, t1, today)).toBe(false);
    // The personal space as a whole: its top and every folder in it, but no other space.
    expect(matchesFilter({ ...all, folders: [''] }, 'Inbox.tasks.json', t1, today)).toBe(true);
    expect(matchesFilter({ ...all, folders: [''] }, list, t1, today)).toBe(true);
    expect(matchesFilter({ ...all, folders: [''] }, '@sp-acmeacme/Sales/Leads.tasks.json', t1, today)).toBe(false);
    expect(matchesFilter({ ...all, folders: ['@sp-acmeacme'] }, '@sp-acmeacme/Sales/Leads.tasks.json', t1, today)).toBe(true);
    expect(matchesFilter({ ...all, text: 'loan' }, list, t1, today)).toBe(true);
    expect(matchesFilter({ ...all, text: 'bank' }, list, t1, today)).toBe(true);
    expect(matchesFilter({ ...all, text: 'groceries' }, list, t1, today)).toBe(false);
  });

  it('groups what it shows by list, by due day with the undated last, then by priority', () => {
    const lists = {
      'Work/A.tasks.json': [task('later', { due: '2026-10-09' }), task('undated', { priority: 1 }), task('soon-p2', { due: today, priority: 2 }), task('soon-p1', { due: today, priority: 1 })],
      'Home/B.tasks.json': [task('done', { done: true })],
      'Inbox.tasks.json': [task('inbox')],
    };
    expect(filterTasks(all, lists, today).map((g) => [g.list, g.tasks.map((t) => t.id)])).toEqual([
      ['Work/A.tasks.json', ['soon-p1', 'soon-p2', 'later', 'undated']],
      ['Inbox.tasks.json', ['inbox']],
    ]);
  });

  it('names a filter after what it picks', () => {
    expect(filterName({ ...all, due: 'week', priorities: [2, 1] })).toBe('This week · p1, p2');
    expect(filterName({ ...all, priorities: [4], folders: ['Work/Client'], text: ' loan ' })).toBe('No priority · Client · “loan”');
    expect(filterName(all)).toBe('All open tasks');
  });

  it('round-trips through its file and skips what it cannot use', async () => {
    const fs = new MemoryFs();
    const filters = [{ id: 'f', name: 'This week · p1', due: 'week' as const, priorities: [1 as const], folders: [], text: '' }];
    await saveFilters(fs, filters);
    expect(await loadFilters(fs)).toEqual(filters);
    expect(await loadFilters(new MemoryFs())).toEqual([]);
    const broken = JSON.stringify({ filters: [null, { id: 'x' }, { id: 'y', name: 'Y', due: 'someday', priorities: [1, 9], folders: [3, 'Work'], folder: 7 }] });
    expect(parseFilters(broken)).toEqual([{ id: 'y', name: 'Y', due: 'any', priorities: [1], folders: ['Work'], text: '' }]);
    // Where a filter sits goes with it; one in no folder sits in the inbox.
    const placed = [{ ...filters[0]!, folder: 'Work/Client' }];
    await saveFilters(fs, placed);
    expect(await loadFilters(fs)).toEqual(placed);
    expect(serializeFilters([])).toContain('"filters": []');
  });
});

import { addCard, moveCardToKind, newBoard, updateCard } from './board';
import { cardMatches, filterCards, filterFields } from './filters';

describe('filtering a list where it is (design/filters.md)', () => {
  const kaan = { id: 'u-kaan', name: 'Kaan' };
  const mert = { id: 'u-mert', name: 'Mert' };
  const claude = { id: 'a-claude', name: 'Claude Code' };

  it('takes a task with any one of the labels asked, whatever their case, done or not', () => {
    const bug = task('crash', { labels: ['Bug', 'phone'] });
    expect(taskMatches({ ...NO_CHOICES, labels: ['bug'] }, bug, today)).toBe(true);
    expect(taskMatches({ ...NO_CHOICES, labels: ['waiting', 'PHONE'] }, bug, today)).toBe(true);
    expect(taskMatches({ ...NO_CHOICES, labels: ['waiting'] }, bug, today)).toBe(false);
    expect(taskMatches({ ...NO_CHOICES, labels: ['bug'] }, task('none'), today)).toBe(false);
    // Unlike a saved filter, a list shows what is done when it is asked to.
    expect(taskMatches({ ...NO_CHOICES, labels: ['bug'] }, { ...bug, done: true }, today)).toBe(true);
  });

  it('takes a task by who it is given to: me, others, a person or an agent by id, or no one', () => {
    const mine = task('mine', { assignee: kaan });
    const his = task('his', { assignee: mert });
    const agents = task('agents', { assignee: claude });
    const nobodys = task('nobodys');
    const by = (assignees: string[]) => [mine, his, agents, nobodys].filter((each) => taskMatches({ ...NO_CHOICES, assignees }, each, today, kaan.id)).map((each) => each.id);
    expect(by([GIVEN.me])).toEqual(['mine']);
    expect(by([GIVEN.others])).toEqual(['his', 'agents']);
    expect(by([GIVEN.nobody])).toEqual(['nobodys']);
    expect(by([mert.id, claude.id])).toEqual(['his', 'agents']);
    expect(by([GIVEN.me, GIVEN.nobody])).toEqual(['mine', 'nobodys']);
    expect(by([])).toEqual(['mine', 'his', 'agents', 'nobodys']);
    // An older filter's mine is the user.
    expect(taskMatches({ ...NO_CHOICES, mine: true }, his, today, kaan.id)).toBe(false);
    // Asking for someone, a task given to them by name only is no one's to the user.
    expect(taskMatches({ ...NO_CHOICES, assignees: [GIVEN.others] }, task('named', { assignee: { name: 'Mina' } }), today, kaan.id)).toBe(true);
  });

  it('asks all its choices at once, the text with them', () => {
    const t1 = task('Fix the sync crash', { labels: ['bug'], priority: 1, due: '2026-10-06' });
    expect(taskMatches({ ...NO_CHOICES, labels: ['bug'], priorities: [1], due: 'overdue', text: 'SYNC' }, t1, today)).toBe(true);
    expect(taskMatches({ ...NO_CHOICES, labels: ['bug'], priorities: [2] }, t1, today)).toBe(false);
    expect(taskMatches({ ...NO_CHOICES, labels: ['bug'], text: 'editor' }, t1, today)).toBe(false);
    // A condition on a board's field takes no task.
    expect(taskMatches({ ...NO_CHOICES, fields: [{ field: 'estimate', op: 'gt', value: 3 }] }, t1, today)).toBe(false);
  });

  it('says whether choices ask anything', () => {
    expect(asksAnything(NO_CHOICES)).toBe(false);
    expect(asksAnything({ ...NO_CHOICES, text: '  ' })).toBe(false);
    expect(asksAnything({ ...NO_CHOICES, labels: [] })).toBe(false);
    expect(asksAnything({ ...NO_CHOICES, labels: ['bug'] })).toBe(true);
    expect(asksAnything({ ...NO_CHOICES, assignees: [GIVEN.nobody] })).toBe(true);
    expect(asksAnything({ ...NO_CHOICES, due: 'none' })).toBe(true);
    expect(asksAnything({ ...NO_CHOICES, text: 'loan' })).toBe(true);
    // A condition still without its value asks nothing, but is chosen: the look keeps it while it is picked.
    const picking = { ...NO_CHOICES, fields: [{ field: 'value', op: 'gt' as const }] };
    expect(asksAnything(picking)).toBe(false);
    expect(choosesAnything(picking)).toBe(true);
    expect(choosesAnything(NO_CHOICES)).toBe(false);
  });

  it('shows a matching subtask under its task, the task kept but not matching', () => {
    const tasks = [
      task('release'),
      task('notes', { parent: 'release', labels: ['bug'] }),
      task('upload', { parent: 'release' }),
      task('crash', { labels: ['bug'] }),
      task('steps', { parent: 'crash' }),
      task('other'),
    ];
    const picks = taskPicks(tasks, (each) => !!each.labels?.includes('bug'));
    expect(Object.fromEntries(picks)).toEqual({ release: false, notes: true, crash: true });
  });

  it('reads choices from a file, leaving out what is not one of them', () => {
    expect(readChoices(undefined)).toEqual(NO_CHOICES);
    expect(readChoices({ due: 'soon', priorities: [1, 7, '2'], labels: ['bug', '', 3, ' '], assignees: [GIVEN.me], text: 4 })).toEqual({
      due: 'any',
      priorities: [1],
      text: '',
      labels: ['bug'],
      assignees: [GIVEN.me],
    });
    expect(readChoices({ due: 'week', labels: [], mine: true })).toEqual({ due: 'week', priorities: [], text: '', mine: true });
  });

  it('keeps a saved filter’s labels and who it asks for through its file', () => {
    const filters = parseFilters(
      JSON.stringify({ filters: [{ id: 'f1', name: 'Bugs', due: 'any', priorities: [], folders: [], text: '', labels: ['bug'], assignees: [GIVEN.others], later: 'kept' }] }),
    );
    expect(filters).toEqual([{ id: 'f1', name: 'Bugs', due: 'any', priorities: [], folders: [], text: '', labels: ['bug'], assignees: [GIVEN.others], later: 'kept' }]);
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    expect(filterName({ ...all, labels: ['bug', 'waiting'], priorities: [1] })).toBe('bug, waiting · p1');
    expect(filterName({ ...all, labels: ['bug'], folders: ['@sp-acme'] }, () => 'Acme')).toBe('bug · Acme');
    expect(filterName({ ...all, assignees: [GIVEN.me, 'u-mert'] }, undefined, () => 'Mert')).toBe('Mine, Mert');
  });

  it('gives the ready filters once, each with its own id, and one deleted does not come back', async () => {
    const fs = new MemoryFs();
    const presets = await addPresetFilters(fs);
    expect(presets?.map((f) => [f.id, f.name])).toEqual([
      ['p1', 'Priority 1'],
      ['p2', 'Priority 2'],
      ['p3', 'Priority 3'],
      ['given-me', 'Given to me'],
      ['given-others', 'Given to others'],
      ['no-date', 'No date'],
    ]);
    expect(await loadFilters(fs)).toEqual(presets);
    // One deleted stays deleted: the file says they were given, and saving keeps that.
    await saveFilters(fs, presets!.slice(1));
    expect(await addPresetFilters(fs)).toBe(null);
    expect((await loadFilters(fs)).map((f) => f.id)).not.toContain('p1');
    const given = presets!.find((f) => f.id === 'given-others')!;
    expect(matchesFilter(given, 'Inbox.tasks.json', task('his', { assignee: { id: 'u-mert', name: 'Mert' } }), today, 'u-kaan')).toBe(true);
  });

  it('gives the ready filters to a file there before them, empty or with filters of its own, before those', async () => {
    const empty = new MemoryFs();
    await empty.writeText('.scrawl/filters.json', serializeFilters([]));
    expect((await addPresetFilters(empty))?.map((f) => f.id)).toEqual(['p1', 'p2', 'p3', 'given-me', 'given-others', 'no-date']);
    expect(await addPresetFilters(empty)).toBe(null);
    const own = new MemoryFs();
    const mine = { id: 'bugs', name: 'Bugs', due: 'any' as const, priorities: [], folders: [], text: '', labels: ['bug'] };
    await own.writeText('.scrawl/filters.json', serializeFilters([mine, { ...mine, id: 'p2', name: 'Urgent' }]));
    expect((await addPresetFilters(own))?.map((f) => f.name)).toEqual(['Priority 1', 'Priority 3', 'Given to me', 'Given to others', 'No date', 'Bugs', 'Urgent']);
  });
});

describe('filterCards', () => {
  it('shows the cards that match, not finished ones, by board', () => {
    let board = newBoard('Plan', 'software');
    board = addCard(board, { title: 'Soon', due: '2026-10-08', priority: 1 }, () => new Date('2026-10-07T12:00:00Z'), undefined, 'a');
    board = addCard(board, { title: 'Later', due: '2026-10-20' }, () => new Date('2026-10-07T12:00:00Z'), undefined, 'b');
    board = addCard(board, { title: 'Done soon', due: '2026-10-08' }, () => new Date('2026-10-07T12:00:00Z'), undefined, 'c');
    board = moveCardToKind(board, 'c', 'done');
    board = updateCard(board, 'b', { description: 'needle here' });
    const boards = { 'Work/Plan.board.json': board };
    const base = { due: 'any' as const, priorities: [], folders: [], text: '' };
    expect(filterCards(base, boards, '2026-10-07').map((g) => g.cards.map((c) => c.id))).toEqual([['a', 'b']]);
    expect(filterCards({ ...base, due: 'next7' }, boards, '2026-10-07')[0]!.cards.map((c) => c.id)).toEqual(['a']);
    expect(filterCards({ ...base, priorities: [1] }, boards, '2026-10-07')[0]!.cards.map((c) => c.id)).toEqual(['a']);
    expect(filterCards({ ...base, folders: ['Work'] }, boards, '2026-10-07')).toHaveLength(1);
    expect(filterCards({ ...base, folders: ['Home'] }, boards, '2026-10-07')).toHaveLength(0);
    expect(filterCards({ ...base, text: 'NEEDLE' }, boards, '2026-10-07')[0]!.cards.map((c) => c.id)).toEqual(['b']);
  });

  it('shows only what is given to the user, tasks and cards, by their id', () => {
    let board = newBoard('Plan', 'software');
    const at = () => new Date('2026-10-07T12:00:00Z');
    board = addCard(board, { title: 'Mine', assignee: { id: 'me', name: 'Kaan' } }, at, undefined, 'a');
    board = addCard(board, { title: 'Lena’s', assignee: { id: 'lena', name: 'Lena' } }, at, undefined, 'b');
    board = addCard(board, { title: 'By name', assignee: { name: 'Kaan' } }, at, undefined, 'c');
    const base = { due: 'any' as const, priorities: [], folders: [], text: '', mine: true as const };
    expect(filterCards(base, { 'Acme/Plan.board.json': board }, '2026-10-07', 'me')[0]!.cards.map((c) => c.id)).toEqual(['a']);
    expect(filterCards(base, { 'Acme/Plan.board.json': board }, '2026-10-07')).toHaveLength(0);
    const lists = { 'Acme/T.tasks.json': [task('mine', { assignee: { id: 'me' } }), task('theirs', { assignee: { id: 'lena' } }), task('nobody')] };
    expect(filterTasks(base, lists, '2026-10-07', 'me')[0]!.tasks.map((t) => t.id)).toEqual(['mine']);
    expect(filterName(base)).toBe('Mine');
    expect(parseFilters(serializeFilters([{ ...base, id: 'f', name: 'Mine' }]))[0]?.mine).toBe(true);
    expect(parseFilters(serializeFilters([{ ...all, id: 'g', name: 'All' }]))[0]).not.toHaveProperty('mine');
  });
});

describe("filters on boards' fields", () => {
  const deals = () => {
    let board = newBoard('Deals', 'crm', undefined, { company: 'Scrawl/Companies', contact: 'Scrawl/People' });
    board = addCard(board, { title: 'Pilot', values: { company: { id: 'a1', name: 'Acme Corp' }, value: 12000, next_step: '2026-10-09' } }, now, undefined, 'k1');
    board = addCard(board, { title: 'Annual plan', values: { company: { id: 'b2', name: 'Globex' }, value: 24000 } }, now, undefined, 'k2');
    return board;
  };

  it('show the cards whose fields match, and no tasks', () => {
    const boards = { 'Scrawl/Deals.board.json': deals(), 'Scrawl/Plan.board.json': newBoard('Plan', 'simple') };
    const acme: FilterChoices = { ...all, fields: [{ field: 'company', op: 'is', value: ['Acme Corp'] }] };
    expect(filterCards(acme, boards, today).flatMap((g) => g.cards.map((c) => c.title))).toEqual(['Pilot']);
    const big: FilterChoices = { ...all, fields: [{ field: 'value', op: 'gt', value: 10000 }, { field: 'next_step', op: 'before', value: '2026-10-15' }] };
    expect(filterCards(big, boards, today).flatMap((g) => g.cards.map((c) => c.title))).toEqual(['Pilot']);
    expect(matchesFilter(acme, 'Inbox', task('a'), today)).toBe(false);
    // A condition still without its value asks nothing.
    expect(matchesFilter({ ...all, fields: [{ field: 'company', op: 'is' }] }, 'Inbox', task('a'), today)).toBe(true);
    expect(filterFields({ folders: [] }, boards).map((f) => f.key)).toEqual(['company', 'contact', 'value', 'next_step']);
    expect(filterFields({ folders: ['Home'] }, boards)).toEqual([]);
    const read = parseFilters(serializeFilters([{ ...big, id: 'f', name: 'Big' }]))[0]!;
    expect(read.fields).toEqual(big.fields);
    expect('fields' in parseFilters(serializeFilters([{ ...all, id: 'g', name: 'All' }]))[0]!).toBe(false);
  });

  it('filter a board where it is: its fields, labels and who, finished cards too', () => {
    let board = deals();
    board = updateCard(board, 'k1', { labels: ['Pilot'], assignee: { id: 'u-mert', name: 'Mert' } }, now);
    board = moveCardToKind(board, 'k2', 'done', now);
    const titles = (choices: Parameters<typeof cardMatches>[0]) => board.cards.filter((card) => cardMatches(choices, board, card, today, 'u-kaan')).map((card) => card.title);
    expect(titles({ ...NO_CHOICES, fields: [{ field: 'value', op: 'gt', value: 20000 }] })).toEqual(['Annual plan']);
    expect(titles({ ...NO_CHOICES, labels: ['pilot'] })).toEqual(['Pilot']);
    expect(titles({ ...NO_CHOICES, assignees: [GIVEN.others] })).toEqual(['Pilot']);
    expect(titles({ ...NO_CHOICES, assignees: [GIVEN.nobody], text: 'plan' })).toEqual(['Annual plan']);
    // A field the board does not have leaves every card out.
    expect(titles({ ...NO_CHOICES, fields: [{ field: 'estimate', op: 'empty' }] })).toEqual([]);
  });
});
