import { describe, expect, it } from 'vitest';
import {
  endOfWeek,
  type FilterChoices,
  filterName,
  filterTasks,
  loadFilters,
  matchesFilter,
  parseFilters,
  saveFilters,
  serializeFilters,
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
    expect(matchesFilter({ ...all, folders: ['Inbox'] }, 'Inbox/tasks.json', t1, today)).toBe(true);
    expect(matchesFilter({ ...all, text: 'loan' }, list, t1, today)).toBe(true);
    expect(matchesFilter({ ...all, text: 'bank' }, list, t1, today)).toBe(true);
    expect(matchesFilter({ ...all, text: 'groceries' }, list, t1, today)).toBe(false);
  });

  it('groups what it shows by list, by due day with the undated last, then by priority', () => {
    const lists = {
      'Work/A.tasks.json': [task('later', { due: '2026-10-09' }), task('undated', { priority: 1 }), task('soon-p2', { due: today, priority: 2 }), task('soon-p1', { due: today, priority: 1 })],
      'Home/B.tasks.json': [task('done', { done: true })],
      'Inbox/tasks.json': [task('inbox')],
    };
    expect(filterTasks(all, lists, today).map((g) => [g.list, g.tasks.map((t) => t.id)])).toEqual([
      ['Work/A.tasks.json', ['soon-p1', 'soon-p2', 'later', 'undated']],
      ['Inbox/tasks.json', ['inbox']],
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
import { filterCards, filterFields } from './filters';

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
});
