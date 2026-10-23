import { describe, expect, it } from 'vitest';
import { addCard, type Board, newBoard, updateCard } from './board';
import { MemoryFs } from './fs';
import {
  autoColor,
  cleanLabels,
  colorLabel,
  labelColor,
  labelUses,
  loadLabels,
  parseLabels,
  relabelBoard,
  relabelKnown,
  relabelTasks,
  saveLabels,
  serializeLabels,
  withLabel,
} from './labels';
import { mergeFile, mergeKindOf } from './sync/merge-files';
import type { Task } from './tasks';

const task = (id: string, labels?: string[]): Task => ({
  id,
  title: id,
  done: false,
  priority: 4,
  due: null,
  parent: null,
  order: 0,
  created: '2026-10-23T10:00:00.000Z',
  updated: '2026-10-23T10:00:00.000Z',
  completed: null,
  ...(labels && { labels }),
});

function boardWith(...labels: string[][]): Board {
  let board = newBoard('Roadmap', 'software');
  for (const [i, each] of labels.entries()) {
    board = addCard(board, { title: `Card ${i}` });
    board = updateCard(board, board.cards.at(-1)!.id, { labels: each });
  }
  return board;
}

describe('cleanLabels', () => {
  it('trims, drops empty ones and keeps the first spelling of one label', () => {
    expect(cleanLabels([' bug ', '', 'Bug', 'waiting', 'BUG', '  '])).toEqual(['bug', 'waiting']);
  });
});

describe('a label’s color', () => {
  it('comes from its name, the same in any case, never gray', () => {
    expect(autoColor('Waiting')).toBe(autoColor('waiting'));
    for (const name of ['a', 'bug', 'call', 'errand', 'waiting', 'release', 'phone', 'feedback', 'later']) expect(autoColor(name)).not.toBe('gray');
  });

  it('is the one the space’s file gives it, when it gives one', () => {
    expect(labelColor('Bug', [{ name: 'bug', color: 'gray' }])).toBe('gray');
    expect(labelColor('call', [{ name: 'bug', color: 'gray' }])).toBe(autoColor('call'));
  });
});

describe('the space’s file', () => {
  it('reads labels, leaving out what is not one and one name twice, keeping what a newer version writes', () => {
    const text = JSON.stringify({ version: 1, labels: [{ name: 'bug', color: 'red', pinned: true }, { name: 'Bug' }, { name: '' }, { color: 'blue' }, { name: 'call', color: 'mauve' }, 7] });
    expect(parseLabels(text)).toEqual([{ name: 'bug', color: 'red', pinned: true }, { name: 'call' }]);
    expect(parseLabels('not json')).toEqual([]);
  });

  it('is written and read back; a space without one has none', async () => {
    const fs = new MemoryFs();
    expect(await loadLabels(fs)).toEqual([]);
    await saveLabels(fs, [{ name: 'waiting', color: 'orange' }]);
    expect(await loadLabels(fs)).toEqual([{ name: 'waiting', color: 'orange' }]);
  });

  it('is merged label by label when both sides changed it', () => {
    expect(mergeKindOf('.scrawl/labels.json')).toBe('labels');
    const base = serializeLabels([{ name: 'bug', color: 'red' }, { name: 'call', color: 'blue' }]);
    const local = serializeLabels([{ name: 'bug', color: 'pink' }, { name: 'call', color: 'blue' }, { name: 'waiting', color: 'orange' }]);
    const remote = serializeLabels([{ name: 'bug', color: 'red' }, { name: 'call', color: 'teal' }, { name: 'errand', color: 'yellow' }]);
    expect(parseLabels(mergeFile('labels', base, local, remote).text)).toEqual([
      { name: 'bug', color: 'pink' },
      { name: 'call', color: 'teal' },
      { name: 'errand', color: 'yellow' },
      { name: 'waiting', color: 'orange' },
    ]);
  });
});

describe('labelUses', () => {
  it('has every label of the file, the tasks and the cards, by name, with how many tasks and cards have it', () => {
    const uses = labelUses(
      [{ name: 'later', color: 'gray' }, { name: 'Bug', color: 'red' }],
      [[task('a', ['bug', 'call']), task('b', ['call'])], [task('c')]],
      [boardWith(['bug'], ['waiting', 'BUG'])],
    );
    expect(uses).toEqual([
      { name: 'Bug', color: 'red', tasks: 1, cards: 2 },
      { name: 'call', color: autoColor('call'), tasks: 2, cards: 0 },
      { name: 'later', color: 'gray', tasks: 0, cards: 0 },
      { name: 'waiting', color: autoColor('waiting'), tasks: 0, cards: 1 },
    ]);
  });
});

describe('the file as labels change', () => {
  it('gets a new label once, in the color its name gives it', () => {
    expect(withLabel([], ' waiting ')).toEqual([{ name: 'waiting', color: autoColor('waiting') }]);
    expect(withLabel([{ name: 'Waiting', color: 'gray' }], 'waiting')).toEqual([{ name: 'Waiting', color: 'gray' }]);
  });

  it('keeps a color picked, also for a label only used so far', () => {
    expect(colorLabel([{ name: 'bug', color: 'red' }], 'Bug', 'pink')).toEqual([{ name: 'bug', color: 'pink' }]);
    expect(colorLabel([], 'call', 'teal')).toEqual([{ name: 'call', color: 'teal' }]);
  });

  it('renames one in its color, joins one renamed to a label it has, and takes one away', () => {
    const known = [{ name: 'later', color: 'gray' as const }, { name: 'bug', color: 'red' as const }];
    expect(relabelKnown(known, 'later', 'someday')).toEqual([{ name: 'someday', color: 'gray' }, { name: 'bug', color: 'red' }]);
    expect(relabelKnown(known, 'later', 'Bug')).toEqual([{ name: 'bug', color: 'red' }]);
    expect(relabelKnown(known, 'bug', 'Bug')).toEqual([{ name: 'later', color: 'gray' }, { name: 'Bug', color: 'red' }]);
    expect(relabelKnown(known, 'call', 'phone')).toEqual([...known, { name: 'phone', color: autoColor('call') }]);
    expect(relabelKnown(known, 'Later', null)).toEqual([{ name: 'bug', color: 'red' }]);
  });
});

describe('relabelling tasks and cards', () => {
  it('renames a label on every task that has it, in any case, once each', () => {
    const tasks = [task('a', ['Call', 'waiting']), task('b', ['phone', 'call']), task('c', ['bug'])];
    const next = relabelTasks(tasks, 'call', 'phone');
    expect(next.map((t) => t.labels)).toEqual([['phone', 'waiting'], ['phone'], ['bug']]);
    expect(next[2]).toBe(tasks[2]);
    // Not working on them: when they changed and who worked on them stay.
    expect(next[0]!.updated).toBe(tasks[0]!.updated);
  });

  it('takes a label off, and the labels with it when it was the only one', () => {
    const next = relabelTasks([task('a', ['waiting']), task('b', ['waiting', 'call'])], 'Waiting', null);
    expect(next[0]).not.toHaveProperty('labels');
    expect(next[1]!.labels).toEqual(['call']);
  });

  it('gives back the same list and board when nothing has the label', () => {
    const tasks = [task('a', ['bug'])];
    expect(relabelTasks(tasks, 'call', 'phone')).toBe(tasks);
    const board = boardWith(['bug']);
    expect(relabelBoard(board, 'call', null)).toBe(board);
  });

  it('renames and takes off a label on a board’s cards', () => {
    const board = boardWith(['bug', 'waiting'], ['waiting'], ['call']);
    expect(relabelBoard(board, 'waiting', 'blocked').cards.map((c) => c.labels)).toEqual([['bug', 'blocked'], ['blocked'], ['call']]);
    expect(relabelBoard(board, 'WAITING', null).cards.map((c) => c.labels)).toEqual([['bug'], undefined, ['call']]);
  });
});
