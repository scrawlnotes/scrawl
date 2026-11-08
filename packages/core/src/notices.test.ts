import { describe, expect, it } from 'vitest';
import { addCard, addComment, editComment, moveCardToKind, newBoard, remindCard, serializeBoard, updateCard } from './board';
import { noticesFrom, noticeWords, tellsPeople } from './notices';
import { addTask, remindTask, serializeList, updateTask } from './tasks';
import { parseItemLink, personLink } from './sync/chat';

const KAAN = { id: 'kaan', name: 'Kaan Arslan' };
const MERT = { id: 'mert', name: 'Mert Kaya' };
const AGENT = { id: 'kaan:laptop', name: 'Claude Code (Laptop)' };
const at = (minute: number) => () => new Date(Date.UTC(2026, 10, 9, 9, minute));
const PATH = 'Roadmap.board.json';
const LIST = 'Work/Tasks.tasks.json';

function board() {
  const made = newBoard('Roadmap', 'software', (() => {
    let n = 0;
    return () => `c${++n}`;
  })());
  return addCard(made, { title: 'Export a board as CSV', assignee: { id: 'mert', name: 'Mert Kaya' } }, at(0), KAAN, 'card1');
}
const notices = (before: string | null, after: string, writer = KAAN) => noticesFrom({ space: 'sp-1', path: before === null && after.includes('"tasks"') ? LIST : after.includes('"tasks"') ? LIST : PATH, before, after, writer });

describe('noticesFrom', () => {
  it('tells someone mentioned in a new comment, at the comment, with its words', () => {
    const was = board();
    const now = addComment(was, 'card1', `${personLink('Mert Kaya', 'mert')} can you check the headers?`, at(5), KAAN, 'cm1');
    const found = notices(serializeBoard(was), serializeBoard(now));
    expect(found).toEqual([
      {
        kind: 'mention',
        to: 'mert',
        by: KAAN,
        item: { kind: 'card', id: 'card1', title: 'Export a board as CSV', key: `${was.prefix}-1`, due: null },
        in: { comment: 'cm1' },
        text: '@Mert Kaya can you check the headers?',
        href: 'scrawl:item/card/sp-1/Roadmap.board.json?id=card1&comment=cm1',
      },
    ]);
    expect(parseItemLink(found[0]!.href)).toEqual({ kind: 'card', space: 'sp-1', path: PATH, id: 'card1', comment: 'cm1' });
  });

  it('tells only those newly mentioned when a comment is edited, and no one of their own words', () => {
    const was = addComment(board(), 'card1', `${personLink('Mert Kaya', 'mert')} look`, at(5), KAAN, 'cm1');
    const edited = editComment(was, 'card1', 'cm1', `${personLink('Mert Kaya', 'mert')} and ${personLink('Elif Demir', 'elif')} look`, at(6), KAAN);
    expect(notices(serializeBoard(was), serializeBoard(edited)).map((n) => n.to)).toEqual(['elif']);
    const own = addComment(board(), 'card1', `${personLink('Kaan Arslan', 'kaan')} note to self`, at(5), KAAN, 'cm2');
    expect(notices(serializeBoard(board()), serializeBoard(own))).toEqual([]);
  });

  it('tells someone newly mentioned in a description, the card opened', () => {
    const was = board();
    const now = updateCard(was, 'card1', { description: `Ask ${personLink('Elif Demir', 'elif')} for the order.` }, at(7), KAAN);
    const found = notices(serializeBoard(was), serializeBoard(now));
    expect(found.map((n) => [n.kind, n.to, n.in, n.href])).toEqual([['mention', 'elif', 'description', 'scrawl:item/card/sp-1/Roadmap.board.json?id=card1']]);
    // The same description written again tells no one.
    expect(notices(serializeBoard(now), serializeBoard(updateCard(now, 'card1', { title: 'Export as CSV' }, at(8), KAAN)))).toEqual([]);
  });

  it('tells whoever a card is given to, by whoever gave it, and not who took it back', () => {
    const was = board();
    const given = updateCard(was, 'card1', { assignee: { id: 'elif', name: 'Elif Demir' } }, at(9), AGENT);
    const found = notices(serializeBoard(was), serializeBoard(given), MERT);
    expect(found.map((n) => [n.kind, n.to, n.by.id])).toEqual([['assign', 'elif', 'kaan:laptop']]);
    expect(notices(serializeBoard(given), serializeBoard(updateCard(given, 'card1', { assignee: null }, at(10), KAAN)))).toEqual([]);
  });

  it('tells whoever a new card is given to', () => {
    const was = board();
    const now = addCard(was, { title: 'Undo a move', assignee: { id: 'elif', name: 'Elif Demir' } }, at(11), KAAN, 'card2');
    expect(notices(serializeBoard(was), serializeBoard(now)).map((n) => [n.kind, n.to, n.item.id])).toEqual([['assign', 'elif', 'card2']]);
  });

  it('tells no one of a file new to the place, nor of a file it cannot read', () => {
    expect(notices(null, serializeBoard(board()))).toEqual([]);
    expect(notices('{not json', serializeBoard(board()))).toEqual([]);
  });

  it('tells of a task given and mentioned in its description', () => {
    const was = addTask([], { title: 'Collect the feedback' }, at(0), 't1', KAAN);
    const now = updateTask(was, 't1', { assignee: { id: 'mert', name: 'Mert Kaya' }, description: `One line each. ${personLink('Elif Demir', 'elif')} has the notes.` }, at(3), KAAN);
    const found = notices(serializeList({ sections: [], tasks: was }), serializeList({ sections: [], tasks: now }));
    expect(found.map((n) => [n.kind, n.to, n.href])).toEqual([
      ['assign', 'mert', 'scrawl:item/task/sp-1/Work%2FTasks.tasks.json?id=t1'],
      ['mention', 'elif', 'scrawl:item/task/sp-1/Work%2FTasks.tasks.json?id=t1'],
    ]);
  });
});

describe('noticeWords', () => {
  it('says who did what to which, and under it the words or the title or where', () => {
    const was = board();
    const now = addComment(was, 'card1', `${personLink('Mert Kaya', 'mert')} can you check?`, at(5), KAAN, 'cm1');
    const [comment] = notices(serializeBoard(was), serializeBoard(now));
    expect(noticeWords(comment!, 'Roadmap · Scrawl')).toEqual({ title: `Kaan mentioned you on ${was.prefix}-1`, body: '@Mert Kaya can you check?' });
    const task = { kind: 'assign' as const, to: 'mert', by: AGENT, item: { kind: 'task' as const, id: 't1', title: 'Fix the login' }, href: '' };
    expect(noticeWords(task, 'Tasks · Scrawl', (id) => (id === 'kaan' ? 'Kaan Arslan' : undefined))).toEqual({ title: 'Claude Code (Laptop) · Kaan assigned you Fix the login', body: 'Tasks · Scrawl' });
  });
});

it('knows which files can tell someone', () => {
  expect([PATH, LIST, 'Notes/a.md', 'People/_collection.json'].map(tellsPeople)).toEqual([true, true, false, false]);
});

describe('reminders', () => {
  const given = () => updateCard(board(), 'card1', { due: '2026-11-10' }, at(1), KAAN);

  it('writes a reminder of a card given to someone else, once an hour, not to oneself nor of a finished card', () => {
    const was = given();
    const once = remindCard(was, 'card1', at(10), KAAN, 'r1');
    expect(once.cards[0]!.timeline.at(-1)).toMatchObject({ id: 'r1', kind: 'remind', to: { id: 'mert' }, byId: 'kaan' });
    // Within the hour, nothing; an hour on, again.
    expect(remindCard(once, 'card1', at(40), KAAN, 'r2')).toBe(once);
    expect(remindCard(once, 'card1', () => new Date(Date.UTC(2026, 10, 9, 10, 10)), KAAN, 'r3').cards[0]!.timeline.at(-1)!.id).toBe('r3');
    // Mert reminding himself, or anyone of a card given to no one or to an agent.
    expect(remindCard(was, 'card1', at(10), MERT)).toBe(was);
    const agents = updateCard(was, 'card1', { assignee: { id: 'kaan:laptop', name: 'Claude Code (Laptop)' } }, at(2), KAAN);
    expect(remindCard(agents, 'card1', at(10), MERT)).toBe(agents);
    const done = moveCardToKind(was, 'card1', 'done', at(3), KAAN);
    expect(remindCard(done, 'card1', at(10), KAAN)).toBe(done);
  });

  it('tells whoever was reminded, saying when it is due, and not of one written within the hour by hand', () => {
    const was = given();
    const once = remindCard(was, 'card1', at(10), KAAN, 'r1');
    const [notice] = notices(serializeBoard(was), serializeBoard(once));
    expect(notice).toMatchObject({ kind: 'remind', to: 'mert', by: KAAN, href: 'scrawl:item/card/sp-1/Roadmap.board.json?id=card1' });
    expect(noticeWords(notice!, 'Roadmap · Scrawl')).toEqual({ title: `Kaan reminded you about ${was.prefix}-1`, body: 'Export a board as CSV · Due Nov 10' });
    const byHand = { ...once, cards: once.cards.map((card) => ({ ...card, timeline: [...card.timeline, { id: 'r2', at: at(20)().toISOString(), by: 'Kaan Arslan', byId: 'kaan', kind: 'remind' as const, to: { id: 'mert', name: 'Mert Kaya' } }] })) };
    expect(notices(serializeBoard(once), serializeBoard(byHand))).toEqual([]);
  });

  it('reminds of a task given to someone else, not of a done one', () => {
    const was = updateTask(addTask([], { title: 'Collect the feedback' }, at(0), 't1', KAAN), 't1', { assignee: { id: 'mert', name: 'Mert Kaya' } }, at(1), KAAN);
    const now = remindTask(was, 't1', at(5), KAAN, 'r1');
    expect(notices(serializeList({ sections: [], tasks: was }), serializeList({ sections: [], tasks: now })).map((n) => [n.kind, n.to])).toEqual([['remind', 'mert']]);
    const done = updateTask(was, 't1', { done: true }, at(2), KAAN);
    expect(remindTask(done, 't1', at(5), KAAN)).toBe(done);
  });
});
