import { describe, expect, it } from 'vitest';
import { addCard, cardBrief, dueCardSubtasks, moveCardToKind, newBoard, parseBoard, serializeBoard, updateCard } from './board';
import { dueRecordSubtasks, newSchema, parseRecord, serializeRecord } from './collection';
import { keyFor } from './fields';
import { addSubtask, moveSubtask, readSubtasks, removeSubtask, type Subtask, subtaskProgress, updateSubtask } from './subtasks';
import { mergeFile } from './sync/merge-files';

const at = (iso: string) => () => new Date(iso);
const ids = (prefix: string) => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

/** A list of subtasks made one by one, with ids a, b, c… */
function made(...titles: string[]): Subtask[] {
  return titles.reduce<Subtask[]>((list, title, i) => addSubtask(list, { title }, at('2026-10-19T09:00:00.000Z'), String.fromCharCode(97 + i)), []);
}

describe('subtasks', () => {
  it('are added at the end, never with an empty title', () => {
    const list = made('Design', 'Wire the form');
    expect(list.map((s) => s.title)).toEqual(['Design', 'Wire the form']);
    expect(list[0]).toEqual({ id: 'a', title: 'Design', done: false, priority: 4, due: null, created: '2026-10-19T09:00:00.000Z', completed: null });
    expect(addSubtask(list, { title: '   ' })).toBe(list);
  });

  it('are finished and opened again, with when', () => {
    let list = made('Design');
    list = updateSubtask(list, 'a', { done: true }, at('2026-10-19T10:00:00.000Z'));
    expect(list[0]).toMatchObject({ done: true, completed: '2026-10-19T10:00:00.000Z' });
    expect(subtaskProgress(list)).toEqual({ done: 1, total: 1 });
    list = updateSubtask(list, 'a', { done: false });
    expect(list[0]).toMatchObject({ done: false, completed: null });
  });

  it('change their title, day, priority and who they are given to', () => {
    let list = made('Design');
    list = updateSubtask(list, 'a', { title: ' Draw it ', due: '2026-10-20', priority: 2, assignee: { id: 'p1', name: 'Ada' } });
    expect(list[0]).toMatchObject({ title: 'Draw it', due: '2026-10-20', priority: 2, assignee: { id: 'p1', name: 'Ada' } });
    expect(updateSubtask(list, 'a', { title: '' })).toBe(list);
    expect(updateSubtask(list, 'a', { assignee: null })[0]!.assignee).toBeUndefined();
  });

  it('move before another or to the end, and are removed', () => {
    const list = made('A', 'B', 'C');
    expect(moveSubtask(list, 'c', 'a').map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(moveSubtask(list, 'a', null).map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(moveSubtask(list, 'a', 'gone')).toBe(list);
    expect(removeSubtask(list, 'b').map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('are read leaving out what is not usable', () => {
    expect(readSubtasks([{ id: 'a', title: 'A', due: 'soon', priority: 9 }, { title: 'no id' }, { id: 'a', title: 'twice' }, 'text'])).toEqual([
      { id: 'a', title: 'A', done: false, priority: 4, due: null, created: '', completed: null },
    ]);
    expect(readSubtasks('nothing')).toEqual([]);
  });
});

describe("a card's subtasks", () => {
  const board = () => addCard(newBoard('Roadmap', 'software', ids('c')), { title: 'Landing page' }, at('2026-10-19T09:00:00.000Z'), undefined, 'k1');

  it('are kept in the board file, short, and read back', () => {
    const list = updateSubtask(made('Design', 'Test'), 'b', { due: '2026-10-21', priority: 1 });
    const next = updateCard(board(), 'k1', { subtasks: list });
    const text = serializeBoard(next);
    expect(JSON.parse(text).cards[0].subtasks[0]).toEqual({ id: 'a', title: 'Design', done: false, created: '2026-10-19T09:00:00.000Z' });
    expect(parseBoard(text).cards[0]!.subtasks).toEqual(list);
  });

  it('are left out of the file when there are none', () => {
    const next = updateCard(updateCard(board(), 'k1', { subtasks: made('A') }), 'k1', { subtasks: [] });
    expect(next.cards[0]!.subtasks).toBeUndefined();
    expect(serializeBoard(next)).not.toContain('subtasks');
  });

  it('come with a new card', () => {
    const next = addCard(newBoard('Roadmap', 'software', ids('c')), { title: 'Card', subtasks: [{ title: 'One' }, { title: ' ' }, { title: 'Two', due: '2026-10-22' }] });
    expect(next.cards[0]!.subtasks?.map((s) => [s.title, s.due])).toEqual([
      ['One', null],
      ['Two', '2026-10-22'],
    ]);
  });

  it('are in its brief', () => {
    const b = updateCard(board(), 'k1', { subtasks: updateSubtask(made('Design', 'Test'), 'a', { done: true }) });
    expect(cardBrief(b, b.cards[0]!)).toContain('## Subtasks\n\n- [x] Design\n- [ ] Test');
  });

  it('that have a day show across boards while the card is open', () => {
    const list = updateSubtask(updateSubtask(made('Late', 'Soon', 'None'), 'a', { due: '2026-10-25' }), 'b', { due: '2026-10-20' });
    let b = updateCard(board(), 'k1', { subtasks: list });
    expect(dueCardSubtasks({ 'R.board.json': b }).map((d) => d.subtask.title)).toEqual(['Soon', 'Late']);
    b = updateCard(b, 'k1', { subtasks: updateSubtask(list, 'b', { done: true }) });
    expect(dueCardSubtasks({ 'R.board.json': b }).map((d) => d.subtask.title)).toEqual(['Late']);
    b = moveCardToKind(b, 'k1', 'done');
    expect(dueCardSubtasks({ 'R.board.json': b })).toEqual([]);
  });

  it('merge one by one when two devices change them', () => {
    const base = updateCard(board(), 'k1', { subtasks: made('A', 'B') });
    const local = updateCard(base, 'k1', { subtasks: updateSubtask(addSubtask(base.cards[0]!.subtasks!, { title: 'Mine' }, undefined, 'm'), 'a', { done: true }) }, at('2026-10-19T10:00:00.000Z'));
    const remote = updateCard(base, 'k1', { subtasks: updateSubtask(addSubtask(base.cards[0]!.subtasks!, { title: 'Theirs' }, undefined, 't'), 'b', { title: 'B2' }) }, at('2026-10-19T11:00:00.000Z'));
    const one = mergeFile('board', serializeBoard(base), serializeBoard(local), serializeBoard(remote)).text;
    expect(mergeFile('board', serializeBoard(base), serializeBoard(remote), serializeBoard(local)).text).toBe(one);
    const subtasks = parseBoard(one).cards[0]!.subtasks!;
    expect(subtasks.map((s) => s.title).sort()).toEqual(['A', 'B2', 'Mine', 'Theirs']);
    expect(subtasks.find((s) => s.id === 'a')!.done).toBe(true);
  });
});

describe("a record's subtasks", () => {
  const schema = newSchema('feedback');
  const text = (subtasks: Subtask[]) => serializeRecord({ id: 'r1', path: 'Feedback/r1.md', name: 'Export', code: '', values: { name: 'Export' }, extra: {}, body: 'Notes\n', subtasks }, schema);

  it('are kept in the front matter, one line each, and read back', () => {
    const list = updateSubtask(made('Call "Ada"', 'Send it'), 'b', { due: '2026-10-20' });
    const file = text(list);
    expect(file).toContain('\nsubtasks:\n  - {"id":"a","title":"Call \\"Ada\\"","done":false,');
    expect(file.split('\n').filter((l) => l.startsWith('  - '))).toHaveLength(2);
    const record = parseRecord(file, schema, 'Feedback/r1.md');
    expect(record.subtasks).toEqual(list);
    expect(record.extra).toEqual({});
    expect(record.body).toBe('Notes\n');
  });

  it('are left out when there are none', () => {
    expect(text([])).not.toContain('subtasks');
    expect(parseRecord(text([]), schema, 'Feedback/r1.md').subtasks).toBeUndefined();
  });

  it('merge line by line when two devices change two of them', () => {
    const base = made('A', 'B', 'C');
    const local = text(updateSubtask(base, 'a', { done: true }, at('2026-10-19T10:00:00.000Z')));
    const remote = text(updateSubtask(base, 'c', { title: 'C2' }));
    const merged = mergeFile('text', text(base), local, remote);
    const subtasks = parseRecord(merged.text, schema, 'Feedback/r1.md').subtasks!;
    expect(subtasks.map((s) => [s.title, s.done])).toEqual([
      ['A', true],
      ['B', false],
      ['C2', false],
    ]);
  });

  it('that have a day show across collections', () => {
    const record = parseRecord(text(updateSubtask(made('A', 'B'), 'a', { due: '2026-10-20' })), schema, 'Feedback/r1.md');
    expect(dueRecordSubtasks({ Feedback: { records: [record] } }).map((d) => [d.collection, d.record.id, d.subtask.title])).toEqual([['Feedback', 'r1', 'A']]);
  });

  it('take a key no field gets', () => {
    expect(keyFor('Subtasks', new Set())).toBe('subtasks_2');
  });
});
