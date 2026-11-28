import { describe, expect, it } from 'vitest';
import { addCard, addComment, newBoard, updateCard } from './board';
import { cardMentions, mergeSeen, parseSeen, seenPath, serializeSeen, taskMentions, withSeen } from './mentions';
import { personLink } from './sync/chat';
import { mergeKindOf } from './sync/merge-files';
import { addTask } from './tasks';

// Mentions (design/mentions.html): where a person is @mentioned in cards and tasks.

const at = (minute: number) => () => new Date(Date.UTC(2026, 10, 28, 9, minute));
const KAAN = { id: 'kaan', name: 'Kaan Arslan' };
const EREN = { id: 'eren', name: 'Eren Yılmaz' };
const kaan = personLink('Kaan Arslan', 'kaan');

function roadmap() {
  let board = newBoard('Roadmap', 'simple', ((n = 0) => () => `col${++n}`)());
  board = addCard(board, { title: 'Files from Deniz' }, at(0), EREN, 'c1');
  board = addComment(board, 'c1', `${kaan} the files came, can you look?`, at(5), EREN, 'cm1');
  board = addComment(board, 'c1', 'No mention here', at(6), EREN, 'cm2');
  board = addComment(board, 'c1', `Noted ${kaan}`, at(7), KAAN, 'cm3');
  board = updateCard(board, 'c1', { description: `First line\nNeeds ${kaan} to approve\nLast` }, at(8), EREN);
  return board;
}

describe('mentions', () => {
  it('finds a person in comments and in description lines, not in what they wrote themselves', () => {
    const board = roadmap();
    const found = cardMentions(board, 'kaan');
    expect(found.map((m) => [m.key.split(':').slice(0, 2).join(':'), m.in, m.by.name, m.text])).toEqual([
      ['c1:c', { comment: 'cm1' }, 'Eren Yılmaz', '@Kaan Arslan the files came, can you look?'],
      ['c1:d', 'description', 'Eren Yılmaz', 'Needs @Kaan Arslan to approve'],
    ]);
    expect(found[0]!.item).toEqual({ kind: 'card', id: 'c1', title: 'Files from Deniz', key: `${board.prefix}-1` });
    expect(found[0]!.at).toBe('2026-11-28T09:05:00.000Z');
    expect(cardMentions(board, 'mert')).toEqual([]);
  });

  it('keeps the key of a description line as long as the line is the same', () => {
    const board = roadmap();
    const key = cardMentions(board, 'kaan')[1]!.key;
    const edited = updateCard(board, 'c1', { description: `Added on top\nFirst line\nNeeds ${kaan} to approve\nLast` }, at(9), EREN);
    expect(cardMentions(edited, 'kaan')[1]!.key).toBe(key);
    const changed = updateCard(board, 'c1', { description: `Needs ${kaan} to approve today` }, at(9), EREN);
    expect(cardMentions(changed, 'kaan')[1]!.key).not.toBe(key);
  });

  it('finds a person in a task description, written by whoever changed it last', () => {
    const tasks = addTask([], { title: 'Call the supplier', description: `Ask ${kaan} first` }, at(1), 't1', EREN);
    expect(taskMentions(tasks, 'kaan')).toMatchObject([{ key: expect.stringMatching(/^t1:d:/), item: { kind: 'task', id: 't1', title: 'Call the supplier' }, in: 'description', by: { id: 'eren' }, text: 'Ask @Kaan Arslan first' }]);
  });

  it('keeps what was seen, merged from every device by the later time', () => {
    const found = cardMentions(roadmap(), 'kaan');
    const seen = withSeen({}, found.slice(0, 1), '2026-11-28T10:00:00.000Z');
    expect(withSeen(seen, found.slice(0, 1), '2026-11-28T11:00:00.000Z')).toBe(seen);
    expect(parseSeen(serializeSeen(seen))).toEqual(seen);
    expect(parseSeen('not json')).toEqual({});
    const merged = parseSeen(mergeSeen('', serializeSeen({ a: '2026-11-28T10:00:00.000Z' }), serializeSeen({ a: '2026-11-28T09:00:00.000Z', b: '2026-11-28T08:00:00.000Z' })));
    expect(merged).toEqual({ a: '2026-11-28T10:00:00.000Z', b: '2026-11-28T08:00:00.000Z' });
    expect(mergeKindOf(seenPath('kaan'))).toBe('seen');
  });
});
