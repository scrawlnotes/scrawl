import { describe, expect, it } from 'vitest';
import { type Board, type Card, parseBoard, serializeBoard } from '../board';
import { parseList, type Section, serializeList, type Task } from '../tasks';
import { mergeFile, mergeKindOf, mergeText } from './merge-files';
import { mergeOrder } from './merge-records';

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: id, done: false, priority: 4, due: null, parent: null, order: 0, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', completed: null, ...extra };
}

const list = (tasks: Task[], sections: Section[] = []) => serializeList({ sections, tasks });

/** The merge of three versions, checked to come out the same whichever side is local. */
function merged(kind: Parameters<typeof mergeFile>[0], base: string, local: string, remote: string): string {
  const one = mergeFile(kind, base, local, remote);
  const other = mergeFile(kind, base, remote, local);
  expect(other.text).toBe(one.text);
  return one.text;
}

describe('which files merge', () => {
  it('knows notes, task lists, boards and the files of a space', () => {
    expect(mergeKindOf('Scrawl/Plan.md')).toBe('text');
    expect(mergeKindOf('Scrawl/Production.env')).toBe('text');
    expect(mergeKindOf('Scrawl/Work.tasks.json')).toBe('tasks');
    expect(mergeKindOf('Inbox.tasks.json')).toBe('tasks');
    expect(mergeKindOf('Scrawl/Roadmap.board.json')).toBe('board');
    expect(mergeKindOf('.scrawl/filters.json')).toBe('filters');
    expect(mergeKindOf('.scrawl/favorites.json')).toBe('favorites');
    expect(mergeKindOf('.scrawl/quick-notes.json')).toBe('quickNotes');
    expect(mergeKindOf('.scrawl/space.json')).toBe('space');
    expect(mergeKindOf('.scrawl/trash/index.json')).toBe('trash');
    expect(mergeKindOf('_attachments/photo.png')).toBeNull();
  });
});

describe('merging a note', () => {
  const base = 'one\ntwo\nthree\nfour\nfive';

  it('takes changes made on different lines from both sides', () => {
    expect(mergeText(base, 'ONE\ntwo\nthree\nfour\nfive', 'one\ntwo\nthree\nfour\nFIVE')).toEqual({ text: 'ONE\ntwo\nthree\nfour\nFIVE', clean: true });
  });

  it('keeps the local text when both sides changed the same line, and says so', () => {
    expect(mergeText(base, 'one\nTWO\nthree\nfour\nfive', 'one\nDeux\nthree\nfour\nfive')).toEqual({ text: 'one\nTWO\nthree\nfour\nfive', clean: false });
  });

  it('takes a change both sides made alike as one', () => {
    expect(mergeText(base, 'one\nTWO\nthree\nfour\nfive', 'one\nTWO\nthree\nfour\nfive').clean).toBe(true);
  });

  it('takes changes made on lines next to each other from both sides', () => {
    expect(mergeText(base, 'one\nTWO\nthree\nfour\nfive', 'one\ntwo\nTHREE\nfour\nfive')).toEqual({ text: 'one\nTWO\nTHREE\nfour\nfive', clean: true });
    expect(mergeText(base, 'one\nTWO\nthree\nfour\nfive', 'one\ntwo\nadded\nthree\nfour\nfive')).toEqual({ text: 'one\nTWO\nadded\nthree\nfour\nfive', clean: true });
  });

  it('keeps the lines both sides added at the same place, the other side’s first', () => {
    const notes = 'groceries\nmilk\n';
    expect(mergeText(notes, 'groceries\nmilk\nbread\n', 'groceries\nmilk\neggs\n')).toEqual({ text: 'groceries\nmilk\neggs\nbread\n', clean: true });
    expect(mergeText(notes, 'top\ngroceries\nmilk\n', 'call Lena\ngroceries\nmilk\n')).toEqual({ text: 'call Lena\ntop\ngroceries\nmilk\n', clean: true });
  });

  it('adds nothing twice when the other side has what was added here, and more', () => {
    const notes = 'groceries\nmilk\n';
    // What was sent from here got there, and more was typed here since.
    expect(mergeText(notes, 'groceries\nmilk\nbread\neggs\n', 'groceries\nmilk\nbread\n')).toEqual({ text: 'groceries\nmilk\nbread\neggs\n', clean: true });
    expect(mergeText(notes, 'groceries\nmilk\nbread\n', 'groceries\nmilk\nbread\neggs\n')).toEqual({ text: 'groceries\nmilk\nbread\neggs\n', clean: true });
  });

  it('merges the words of a line both sides changed in different places', () => {
    const line = 'Call the bank about the card on Monday';
    expect(mergeText(line, 'Call the bank about the new card on Monday', 'Call the bank about the card on Tuesday')).toEqual({
      text: 'Call the bank about the new card on Tuesday',
      clean: true,
    });
  });

  it('is not clean when both sides changed the same words', () => {
    expect(mergeText('Meet at five', 'Meet at six', 'Meet at seven').clean).toBe(false);
  });

  it('puts two whole notes side by side only as a conflict, with no base to go on', () => {
    expect(mergeText('', 'from the laptop\nmore', 'from the phone\nmore').clean).toBe(false);
  });
});

describe('merging a task list', () => {
  it('keeps tasks added on either side', () => {
    const base = list([task('a')]);
    const text = merged('tasks', base, list([task('a'), task('b', { order: 1 })]), list([task('a'), task('c', { order: 1 })]));
    expect(parseList(text).tasks.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('takes each field from the side that changed it', () => {
    const base = list([task('a')]);
    const local = list([task('a', { due: '2026-10-09', updated: '2026-10-02T10:00:00.000Z' })]);
    const remote = list([task('a', { priority: 1, updated: '2026-10-03T10:00:00.000Z' })]);
    const [a] = parseList(merged('tasks', base, local, remote)).tasks;
    expect(a).toMatchObject({ due: '2026-10-09', priority: 1, updated: '2026-10-03T10:00:00.000Z' });
  });

  it('takes a field changed on both sides from the side changed later', () => {
    const base = list([task('a')]);
    const local = list([task('a', { title: 'mine', updated: '2026-10-02T10:00:00.000Z' })]);
    const remote = list([task('a', { title: 'theirs', updated: '2026-10-03T10:00:00.000Z' })]);
    expect(parseList(merged('tasks', base, local, remote)).tasks[0]!.title).toBe('theirs');
  });

  it('settles a change at the same moment the same way on every device', () => {
    const base = list([task('a')]);
    const at = '2026-10-02T10:00:00.000Z';
    const text = merged('tasks', base, list([task('a', { title: 'mine', updated: at })]), list([task('a', { title: 'theirs', updated: at })]));
    expect(parseList(text).tasks[0]!.title).toBe('theirs');
  });

  it('keeps a task deleted on one side and changed on the other, and lets one deleted and unchanged go', () => {
    const base = list([task('a'), task('b', { order: 1 })]);
    const local = list([task('a', { title: 'changed', updated: '2026-10-02T10:00:00.000Z' })]);
    const remote = list([task('b', { order: 1 })]);
    expect(parseList(merged('tasks', base, local, remote)).tasks.map((t) => t.title)).toEqual(['changed']);
  });

  it('orders sections the same way on every device when both sides moved them', () => {
    const s = (id: string): Section => ({ id, name: id });
    const base = list([], [s('x'), s('y'), s('z')]);
    const text = merged('tasks', base, list([], [s('y'), s('x'), s('z')]), list([], [s('x'), s('z'), s('y')]));
    expect(parseList(text).sections.map((x) => x.id)).toEqual(['y', 'x', 'z']);
  });

  it('gives tasks that landed on one position positions of their own', () => {
    const base = list([task('a')]);
    const text = merged('tasks', base, list([task('a'), task('b', { order: 1 })]), list([task('a'), task('c', { order: 1 })]));
    const orders = parseList(text).tasks.map((t) => t.order).sort();
    expect(new Set(orders).size).toBe(3);
  });
});

describe('ordering a list', () => {
  it('takes the order of the side that changed it, with what the other added', () => {
    expect(mergeOrder(['a', 'b', 'c'], ['c', 'a', 'b'], ['a', 'b', 'x', 'c'])).toEqual(['c', 'a', 'b', 'x']);
  });
});

function card(id: string, key: number, extra: Partial<Card> = {}): Card {
  return { id, key, title: id, column: 'todo', order: 0, priority: 4, due: null, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', completed: null, timeline: [], ...extra };
}

function board(cards: Card[], extra: Partial<Board> = {}): string {
  return serializeBoard({
    prefix: 'SCR',
    nextKey: Math.max(1, ...cards.map((c) => c.key + 1)),
    phasesOn: false,
    columns: [
      { id: 'todo', name: 'Todo', kind: 'active' },
      { id: 'done', name: 'Done', kind: 'done' },
    ],
    phases: [],
    cards,
    ...extra,
  });
}

describe('merging a board', () => {
  it('keeps the comments of both sides, in the order they were made', () => {
    const base = board([card('a', 1)]);
    const mine = board([card('a', 1, { timeline: [{ id: 'm', at: '2026-10-02T10:00:00.000Z', kind: 'comment', text: 'from the laptop' }] })]);
    const theirs = board([card('a', 1, { timeline: [{ id: 't', at: '2026-10-02T09:00:00.000Z', kind: 'comment', text: 'from the phone' }] })]);
    const [a] = parseBoard(merged('board', base, mine, theirs)).cards;
    expect(a!.timeline.map((e) => e.id)).toEqual(['t', 'm']);
  });

  it('gives a later card that took the same key the next one, on every device', () => {
    const base = board([]);
    const mine = board([card('x', 1, { created: '2026-10-02T10:00:00.000Z' })]);
    const theirs = board([card('y', 1, { created: '2026-10-02T11:00:00.000Z' })]);
    const result = parseBoard(merged('board', base, mine, theirs));
    expect(result.cards.find((c) => c.id === 'x')!.key).toBe(1);
    expect(result.cards.find((c) => c.id === 'y')!.key).toBe(2);
    expect(result.nextKey).toBe(3);
  });

  it('settles a column renamed on both sides the same way on every device', () => {
    const base = board([]);
    const renamed = (name: string) => board([], { columns: [{ id: 'todo', name, kind: 'active' }, { id: 'done', name: 'Done', kind: 'done' }] });
    const result = parseBoard(merged('board', base, renamed('Next'), renamed('Soon')));
    expect(result.columns[0]!.name).toBe('Soon');
  });

  it('puts a card moved into a column the other side deleted into a column that is there', () => {
    const columns = [
      { id: 'todo', name: 'Todo', kind: 'active' as const },
      { id: 'later', name: 'Later', kind: 'backlog' as const },
      { id: 'done', name: 'Done', kind: 'done' as const },
    ];
    const base = board([card('a', 1)], { columns });
    const mine = board([card('a', 1, { column: 'later', updated: '2026-10-02T10:00:00.000Z' })], { columns });
    const theirs = board([card('a', 1)], { columns: columns.filter((c) => c.id !== 'later') });
    const result = parseBoard(merged('board', base, mine, theirs));
    expect(result.columns.map((c) => c.id)).not.toContain('later');
    expect(result.columns.map((c) => c.id)).toContain(result.cards[0]!.column);
  });

  it('keeps the board fields and the app piece one side added', () => {
    const fields = [{ key: 'amount', label: 'Amount', type: 'number' as const }];
    const base = board([]);
    const mine = board([], { fields, role: 'deals' });
    const theirs = board([card('a', 1)]);
    const result = parseBoard(merged('board', base, mine, theirs));
    expect(result.fields?.map((f) => f.key)).toEqual(['amount']);
    expect(result.role).toBe('deals');
    expect(result.cards).toHaveLength(1);
  });
});

describe('merging the files of a space', () => {
  it('merges saved filters by id and the trash index by name', () => {
    const filters = (names: string[]) => `${JSON.stringify({ version: 1, filters: names.map((name) => ({ id: name, name, due: 'any', priorities: [], folders: [], text: '' })) })}\n`;
    expect(JSON.parse(merged('filters', filters(['a']), filters(['a', 'b']), filters(['a', 'c']))).filters.map((f: { id: string }) => f.id).sort()).toEqual(['a', 'b', 'c']);
    const trash = (names: string[]) => `${JSON.stringify({ version: 1, items: names.map((name) => ({ name, from: `x/${name}`, deleted: '2026-10-02T10:00:00.000Z' })) })}\n`;
    expect(JSON.parse(merged('trash', trash([]), trash(['a.md']), trash(['b.md']))).items.map((r: { name: string }) => r.name).sort()).toEqual(['a.md', 'b.md']);
  });

  it('keeps that the ready filters were given when either side gave them', () => {
    const file = (presets: number) => `${JSON.stringify({ version: 1, ...(presets > 0 && { presets }), filters: [] })}\n`;
    expect(JSON.parse(merged('filters', file(0), file(1), file(0))).presets).toBe(1);
  });

  it('merges favorites by what each one is, keeping both sides\' and dropping the one taken off', () => {
    const favorites = (items: object[]) => `${JSON.stringify({ version: 1, favorites: items })}\n`;
    const base = favorites([{ item: 'Plan.md' }, { filter: 'p1' }]);
    const mine = favorites([{ item: 'Plan.md' }, { filter: 'p1' }, { label: 'bug', space: '@sp-abcdefgh' }]);
    const theirs = favorites([{ filter: 'p1' }, { item: 'Work.tasks.json' }]);
    expect(JSON.parse(merged('favorites', base, mine, theirs)).favorites).toEqual([{ filter: 'p1' }, { item: 'Work.tasks.json' }, { label: 'bug', space: '@sp-abcdefgh' }]);
  });

  it('merges the quick notes\' order from the side that reordered it, and a pin taken off on one side is off', () => {
    const order = (names: string[], pinned: string[]) => `${JSON.stringify({ version: 1, order: names, pinned })}\n`;
    const base = order(['c.md', 'b.md', 'a.md'], ['a.md', 'b.md']);
    // Here a new note came first and b was unpinned; there a was dragged to the top.
    const mine = order(['d.md', 'c.md', 'b.md', 'a.md'], ['a.md']);
    const theirs = order(['a.md', 'c.md', 'b.md'], ['a.md', 'b.md']);
    expect(JSON.parse(merged('quickNotes', base, mine, theirs))).toMatchObject({ order: ['d.md', 'a.md', 'c.md', 'b.md'], pinned: ['a.md'] });
    // A note moved away on one side is out of the order.
    expect(JSON.parse(merged('quickNotes', base, order(['c.md', 'a.md'], ['a.md', 'b.md']), theirs)).order).toEqual(['a.md', 'c.md']);
  });

  it('merges the settings of a space field by field', () => {
    const space = (name: string, prefix?: string) => `${JSON.stringify({ version: 1, name, ...(prefix && { prefix }) })}\n`;
    expect(JSON.parse(merged('space', space('Home'), space('Work'), space('Home', 'WRK')))).toMatchObject({ name: 'Work', prefix: 'WRK' });
  });
});
