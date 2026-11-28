import { describe, expect, it } from 'vitest';
import { addCard, addComment, editComment, moveCardToKind, newBoard, parseBoard, remindCard, serializeBoard, setColumnNotify, updateCard } from './board';
import { dueWorkIn, dueWords, noticesFrom, noticeWords, tellsPeople } from './notices';
import { addTask, remindTask, serializeList, setDone, updateTask } from './tasks';
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
        said: '[@Mert Kaya](scrawl:person/mert) can you check the headers?',
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

describe('a column that tells people', () => {
  const ELIF = { id: 'elif', name: 'Elif Demir' };
  /** The board with its review column telling Mert and Elif. */
  const told = () => {
    const made = board();
    const review = made.columns.find((c) => c.kind === 'review')!;
    return { made: setColumnNotify(made, review.id, [MERT, ELIF, MERT, { name: 'No id' }]), review };
  };

  it('keeps who a column tells, each once and by id, and drops the list when no one is left', () => {
    const { made, review } = told();
    expect(made.columns.find((c) => c.id === review.id)!.notify).toEqual([MERT, ELIF]);
    const read = parseBoard(serializeBoard(made));
    expect(read.columns.find((c) => c.id === review.id)!.notify).toEqual([MERT, ELIF]);
    expect('notify' in setColumnNotify(made, review.id, []).columns.find((c) => c.id === review.id)!).toBe(false);
  });

  it('tells them of a card moved there by someone else, not the one who moved it, nor of a card that stays', () => {
    const { made } = told();
    const moved = moveCardToKind(made, 'card1', 'review', at(5), ELIF);
    const found = notices(serializeBoard(made), serializeBoard(moved), ELIF);
    expect(found.map((n) => [n.kind, n.to, n.by.id, n.column])).toEqual([['column', 'mert', 'elif', { name: 'Review', added: false }]]);
    expect(noticeWords(found[0]!, 'Roadmap')).toEqual({ title: `📋 ${made.prefix}-1 Export a board as CSV`, body: 'Elif moved it to Review' });
    // Edited where it is, it tells no one again.
    expect(notices(serializeBoard(moved), serializeBoard(updateCard(moved, 'card1', { title: 'Export as CSV' }, at(6), ELIF)), ELIF)).toEqual([]);
  });

  it('tells them of a card made there, and one given a card there hears of the giving alone', () => {
    const { made, review } = told();
    const added = addCard(made, { title: 'Undo a move', column: review.id, assignee: ELIF }, at(5), KAAN, 'card2');
    const found = notices(serializeBoard(made), serializeBoard(added));
    expect(found.map((n) => [n.kind, n.to])).toEqual([['assign', 'elif'], ['column', 'mert']]);
    expect(noticeWords(found[1]!, 'Roadmap')).toEqual({ title: `📋 ${made.prefix}-2 Undo a move`, body: 'Kaan added it to Review' });
  });

  it('tells no one of a column with no list', () => {
    const plain = board();
    expect(notices(serializeBoard(plain), serializeBoard(moveCardToKind(plain, 'card1', 'review', at(5), ELIF)), ELIF)).toEqual([]);
  });
});

describe('noticeWords', () => {
  it('says first what it is about, a card or a task, and under it who did what, the words and where', () => {
    const was = board();
    const now = addComment(was, 'card1', `${personLink('Mert Kaya', 'mert')} can you check?`, at(5), KAAN, 'cm1');
    const [comment] = notices(serializeBoard(was), serializeBoard(now));
    // The one told is not named again at the words' start.
    const names = (id: string) => ({ kaan: 'Kaan Arslan', mert: 'Mert Kaya' })[id];
    expect(noticeWords(comment!, 'Roadmap · Scrawl', names)).toEqual({ title: `📋 ${was.prefix}-1 Export a board as CSV`, body: 'Kaan mentioned you: can you check?' });
    expect(noticeWords({ ...comment!, text: undefined, in: 'description' }, 'Roadmap · Scrawl', names).body).toBe('Kaan mentioned you in the description · Roadmap · Scrawl');
    const task = { kind: 'assign' as const, to: 'mert', by: AGENT, item: { kind: 'task' as const, id: 't1', title: 'Fix the login' }, href: '' };
    expect(noticeWords(task, 'Inbox · Scrawl', (id) => (id === 'kaan' ? 'Kaan Arslan' : undefined))).toEqual({ title: '✅ Fix the login', body: 'Claude Code (Laptop) · Kaan gave it to you · Inbox · Scrawl' });
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
    expect(noticeWords(notice!, 'Roadmap · Scrawl')).toEqual({ title: `📋 ${was.prefix}-1 Export a board as CSV`, body: 'Kaan reminded you · Due Nov 10' });
    const byHand = { ...once, cards: once.cards.map((card) => ({ ...card, timeline: [...card.timeline, { id: 'r2', at: at(20)().toISOString(), by: 'Kaan Arslan', byId: 'kaan', kind: 'remind' as const, to: { id: 'mert', name: 'Mert Kaya' } }] })) };
    expect(notices(serializeBoard(once), serializeBoard(byHand))).toEqual([]);
  });

  it('reminds of a task given to someone else, not of a done one', () => {
    const was = updateTask(addTask([], { title: 'Collect the feedback' }, at(0), 't1', KAAN), 't1', { assignee: { id: 'mert', name: 'Mert Kaya' } }, at(1), KAAN);
    const now = remindTask(was, 't1', at(5), KAAN, 'r1');
    expect(notices(serializeList({ sections: [], tasks: was }), serializeList({ sections: [], tasks: now })).map((n) => [n.kind, n.to])).toEqual([['remind', 'mert']]);
    const done = setDone(was, 't1', true, at(2), KAAN);
    expect(remindTask(done, 't1', at(5), KAAN)).toBe(done);
  });
});

describe('the morning', () => {
  const DAYS = ['2026-11-09', '2026-11-10'];
  it("finds the person's work due today and tomorrow, as Today does, not what is finished", () => {
    let roadmap = addCard(board(), { title: 'Theirs, due today', due: '2026-11-09' }, at(0), KAAN, 'card2');
    roadmap = addCard(roadmap, { title: 'Mine by an agent, tomorrow', due: '2026-11-10', assignee: { id: 'kaan:laptop', name: 'Claude Code (Laptop)' } }, at(0), KAAN, 'card3');
    roadmap = addCard(roadmap, { title: 'Done today', due: '2026-11-09' }, at(0), KAAN, 'card4');
    roadmap = moveCardToKind(roadmap, 'card4', 'done', at(1), KAAN);
    roadmap = addCard(roadmap, { title: 'Next week', due: '2026-11-16' }, at(0), KAAN, 'card5');
    // card1 is Mert's; card2 no one's, made by Kaan.
    expect(dueWorkIn(PATH, serializeBoard(roadmap), 'kaan', DAYS)).toEqual([
      { name: `${roadmap.prefix}-2`, due: '2026-11-09' },
      { name: `${roadmap.prefix}-3`, due: '2026-11-10' },
    ]);
    // Given to Kaan: his, not Mert's.
    const tasks = addTask([], { title: 'Fix the login', due: '2026-11-09', assignee: { id: 'kaan', name: 'Kaan Arslan' } }, at(0), 't1', KAAN);
    expect(dueWorkIn(LIST, serializeList({ sections: [], tasks }), 'kaan', DAYS)).toEqual([{ name: 'Fix the login', due: '2026-11-09' }]);
    expect(dueWorkIn(LIST, serializeList({ sections: [], tasks }), 'mert', DAYS)).toEqual([]);
  });

  it('says how many today and tomorrow, and names the first', () => {
    const today = '2026-11-09';
    expect(dueWords([], today)).toBeNull();
    expect(dueWords([{ name: 'Fix the login', due: today }], today)).toEqual({ title: '📅 Today', body: '1 due today: Fix the login' });
    expect(dueWords([{ name: 'SCR-12', due: '2026-11-10' }], today)).toEqual({ title: '📅 Today', body: '1 due tomorrow: SCR-12' });
    expect(
      dueWords(
        [
          { name: 'Fix the login', due: today },
          { name: 'SCR-30', due: '2026-11-10' },
          { name: 'SCR-12', due: today },
          { name: 'Call the dentist', due: '2026-11-10' },
        ],
        today,
      ),
    ).toEqual({ title: '📅 Today', body: '2 due today, 2 due tomorrow: Fix the login, SCR-12 and 2 more' });
    expect(dueWords([{ name: 'A', due: today }, { name: 'B', due: today }, { name: 'C', due: today }], today)!.body).toBe('3 due today: A, B and C');
  });
});
