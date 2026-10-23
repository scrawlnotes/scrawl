import { describe, expect, it } from 'vitest';
import {
  addCard,
  addColumn,
  addComment,
  addPhase,
  type Board,
  boardsLinkingTo,
  cardBrief,
  cardSum,
  cardValue,
  closePhase,
  columnCards,
  columnStatus,
  currentPhase,
  dueCards,
  editComment,
  faceFields,
  firstColumn,
  isFinished,
  keyOf,
  linkedCards,
  loadBoard,
  moveCard,
  moveCardToKind,
  moveColumn,
  movePhase,
  newBoard,
  nextOpenPhase,
  openCardCount,
  parseBoard,
  phaseBrief,
  phaseCanClose,
  phaseCards,
  phaseProgress,
  prefixFor,
  relinkBoardNote,
  removeCard,
  removeColumn,
  removeComment,
  removePhase,
  renameColumn,
  reopenPhase,
  reviewCount,
  saveBoard,
  serializeBoard,
  setBoardFields,
  setColumnKind,
  setPhasesOn,
  updateCard,
  updatePhase,
} from './board';
import { MemoryFs } from './fs';

const now = () => new Date('2026-10-07T12:00:00.000Z');
const later = () => new Date('2026-10-07T13:00:00.000Z');

/** Ids that read well in assertions: `c1`, `c2`… for columns, then whatever is asked. */
function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** A software board whose columns are `c1`…`c5` and whose cards are added by title. */
function software(...titles: string[]): Board {
  let board = newBoard('Roadmap', 'software', ids('c'));
  for (const title of titles) board = addCard(board, { title }, now, 'kaan', title);
  return board;
}
const col = (board: Board, name: string) => board.columns.find((c) => c.name === name)!.id;
const card = (board: Board, id: string) => board.cards.find((c) => c.id === id)!;

describe('templates', () => {
  it('software starts with five columns and phases on', () => {
    const board = newBoard('Roadmap', 'software', ids('c'));
    expect(board.columns.map((c) => `${c.name}:${c.kind}`)).toEqual(['Backlog:backlog', 'Todo:active', 'Doing:active', 'Review:review', 'Done:done']);
    expect(board.phasesOn).toBe(true);
    expect(board.prefix).toBe('ROA');
    expect(board.nextKey).toBe(1);
  });

  it('simple starts with three columns and phases off', () => {
    const board = newBoard('Customers', 'simple', ids('c'));
    expect(board.columns.map((c) => c.name)).toEqual(['Todo', 'Doing', 'Done']);
    expect(board.phasesOn).toBe(false);
  });

  it('issue tracking starts with the statuses Linear has, phases off, opening as a list, a new issue in Backlog', () => {
    let board = newBoard('Issues', 'issues', ids('c'));
    expect(board.columns.map((c) => `${c.name}:${c.kind}`)).toEqual(['Backlog:backlog', 'Todo:active', 'In Progress:active', 'Done:done', 'Canceled:dropped', 'Duplicate:dropped']);
    expect(board.phasesOn).toBe(false);
    expect(board.view).toBe('list');
    expect(board.prefix).toBe('ISS');
    expect(parseBoard(serializeBoard(board)).view).toBe('list');
    board = addCard(board, { title: 'Card panel loses focus after a comment' }, now, undefined, 'k1');
    expect(board.cards[0]!.column).toBe(board.columns[0]!.id);
    expect(newBoard('Plan', 'simple', ids('c')).view).toBeUndefined();
    // Added from the top of a list, a card goes first in its column.
    board = addCard(board, { title: 'Crash when a board is renamed', first: true }, now, undefined, 'k2');
    expect(columnCards(board, board.columns[0]!.id).map((c) => c.id)).toEqual(['k2', 'k1']);
    // Typed one after another, cards go each after the one before, in the order typed.
    board = addCard(board, { title: 'Tabs lose their order', first: true, after: 'k2' }, now, undefined, 'k3');
    board = addCard(board, { title: 'Trash forgets the folder', first: true, after: 'k3' }, now, undefined, 'k4');
    expect(columnCards(board, board.columns[0]!.id).map((c) => c.id)).toEqual(['k2', 'k3', 'k4', 'k1']);
    // A card that is not in the column any more is no place to go after: first, as asked.
    board = addCard(board, { title: 'Sync stops offline', first: true, after: 'gone' }, now, undefined, 'k5');
    expect(columnCards(board, board.columns[0]!.id)[0]!.id).toBe('k5');
  });

  it('tells the status of each column: the first active one not started, the later ones started', () => {
    const software = newBoard('Roadmap', 'software', ids('c'));
    expect(software.columns.map((c) => columnStatus(software, c))).toEqual(['backlog', 'todo', 'started', 'review', 'done']);
    const issues = newBoard('Issues', 'issues', ids('c'));
    expect(issues.columns.map((c) => columnStatus(issues, c))).toEqual(['backlog', 'todo', 'started', 'done', 'dropped', 'dropped']);
  });

  it('makes a key prefix from the name', () => {
    expect(prefixFor('Roadmap')).toBe('ROA');
    expect(prefixFor('Client portal')).toBe('CP');
    expect(prefixFor('Müşteri takibi')).toBe('MT');
    expect(prefixFor('ab')).toBe('AB');
    expect(prefixFor('---')).toBe('BRD');
  });
});

describe('file format', () => {
  it('survives a round trip', () => {
    let board = software('One', 'Two');
    board = addPhase(board, { name: 'Phase 1', doneWhen: 'Both cards done' }, 'p1');
    board = addComment(board, 'One', 'A comment', now, 'claude', 'e1');
    board = moveCard(board, 'One', { column: col(board, 'Doing'), after: null }, later, 'claude');
    expect(parseBoard(serializeBoard(board))).toEqual(board);
  });

  it('leaves phases out of the file when there are none', () => {
    expect(serializeBoard(software())).not.toContain('"phases"');
    expect(serializeBoard(addPhase(software(), { name: 'P' }))).toContain('"phases"');
  });

  it('keeps fields it does not know', () => {
    const text = JSON.stringify({ prefix: 'X', columns: [{ id: 'a', name: 'A', kind: 'done', colour: 'red' }], cards: [{ id: 'k', title: 'T', column: 'a', sprint: 3 }] });
    const board = parseBoard(text);
    expect((board.columns[0] as { colour?: string }).colour).toBe('red');
    expect((board.cards[0] as { sprint?: number }).sprint).toBe(3);
    expect(parseBoard(serializeBoard(board))).toEqual(board);
  });

  it('repairs what it reads', () => {
    const text = JSON.stringify({
      prefix: ' ',
      nextKey: 2,
      columns: [{ id: 'a', name: 'A', kind: 'odd' }, { id: 'a', name: 'Twice' }, { id: 'b', name: 'B', kind: 'done' }],
      phases: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2', state: 'upcoming' }],
      cards: [
        { id: 'k1', title: 'Gone column', column: 'zzz', key: 7, priority: 9, due: 'tomorrow', labels: ['x', 4] },
        { id: 'k2', title: 'No key', column: 'b', timeline: [{ id: 't', at: 'x', kind: 'move', to: 'b' }, { kind: 'comment' }] },
        { title: 'No id' },
      ],
    });
    const board = parseBoard(text);
    expect(board.prefix).toBe('BRD');
    expect(board.columns.map((c) => `${c.id}:${c.kind}`)).toEqual(['a:active', 'b:done']);
    // The first open phase is current when none is marked.
    expect(board.phases.map((p) => p.state)).toEqual(['current', 'upcoming']);
    expect(board.cards.map((c) => c.id)).toEqual(['k1', 'k2']);
    expect(card(board, 'k1')).toMatchObject({ column: 'a', key: 7, priority: 4, due: null, labels: ['x'] });
    expect(card(board, 'k2')).toMatchObject({ key: 8, timeline: [{ id: 't', at: 'x', kind: 'move', from: null, to: 'b' }] });
    // The next key follows the highest one in use.
    expect(board.nextKey).toBe(9);
  });

  it('reads who a card is given to by id and name, and a name alone as files had it', () => {
    const text = JSON.stringify({
      columns: [{ id: 'a', name: 'A' }],
      cards: [
        { id: 'k1', title: 'Person', column: 'a', assignee: { id: 'p1', name: 'Lena', extra: 1 }, author: { id: 'p2' } },
        { id: 'k2', title: 'Old', column: 'a', assignee: ' claude ', author: 'kaan' },
        { id: 'k3', title: 'Nobody', column: 'a', assignee: { id: ' ' }, author: 4 },
      ],
    });
    const board = parseBoard(text);
    expect(card(board, 'k1')).toMatchObject({ assignee: { id: 'p1', name: 'Lena' }, author: { id: 'p2' } });
    expect(card(board, 'k2')).toMatchObject({ assignee: { name: 'claude' }, author: { name: 'kaan' } });
    expect(card(board, 'k3')).not.toHaveProperty('assignee');
    expect(card(board, 'k3')).not.toHaveProperty('author');
  });

  it('is empty when the file is missing or broken', () => {
    expect(parseBoard('not json')).toEqual({ prefix: 'BRD', nextKey: 1, phasesOn: false, columns: [], phases: [], cards: [] });
  });

  it('loads and saves through the vault', async () => {
    const fs = new MemoryFs();
    const board = software('One');
    await saveBoard(fs, 'Work/Roadmap.board.json', board);
    expect(await loadBoard(fs, 'Work/Roadmap.board.json')).toEqual(board);
    expect((await loadBoard(fs, 'nowhere.board.json')).cards).toEqual([]);
  });
});

describe('cards', () => {
  it('land in the first column with the next key, in order', () => {
    const board = software('One', 'Two');
    expect(board.cards.map((c) => [keyOf(board, c), c.column, c.order])).toEqual([['ROA-1', 'c1', 0], ['ROA-2', 'c1', 1]]);
    expect(board.nextKey).toBe(3);
    expect(card(board, 'One')).toMatchObject({ author: { name: 'kaan' }, priority: 4, due: null, completed: null, timeline: [] });
  });

  it('join the current phase when phases are on', () => {
    let board = addPhase(software(), { name: 'P1' }, 'p1');
    board = addPhase(board, { name: 'P2' }, 'p2');
    board = addCard(board, { title: 'A' }, now, undefined, 'A');
    expect(card(board, 'A').phase).toBe('p1');
    board = addCard(setPhasesOn(board, false), { title: 'B' }, now, undefined, 'B');
    expect(card(board, 'B').phase).toBeUndefined();
    board = addCard(board, { title: 'C', phase: 'p2' }, now, undefined, 'C');
    expect(card(board, 'C').phase).toBe('p2');
  });

  it('can start in a chosen column, and nowhere with a blank title', () => {
    let board = software();
    board = addCard(board, { title: 'Later', column: 'c5' }, now, undefined, 'Later');
    expect(card(board, 'Later')).toMatchObject({ column: 'c5', completed: now().toISOString() });
    expect(addCard(board, { title: '  ' }, now)).toBe(board);
    expect(addCard(board, { title: 'Odd', column: 'nope' }, now, undefined, 'Odd').cards.find((c) => c.id === 'Odd')?.column).toBe('c1');
  });

  it('are edited field by field', () => {
    let board = software('One');
    board = updateCard(board, 'One', { title: ' New ', description: ' text ', labels: [' a ', 'a', 'b'], assignee: { name: 'claude' }, priority: 1, due: '2026-10-09' }, later);
    expect(card(board, 'One')).toMatchObject({ title: 'New', description: 'text', labels: ['a', 'b'], assignee: { name: 'claude' }, priority: 1, due: '2026-10-09', updated: later().toISOString() });
    board = updateCard(board, 'One', { description: '', labels: [], assignee: null, due: null });
    expect(card(board, 'One')).not.toHaveProperty('description');
    expect(card(board, 'One')).not.toHaveProperty('labels');
    expect(card(board, 'One')).not.toHaveProperty('assignee');
    expect(card(board, 'One').due).toBeNull();
    expect(updateCard(board, 'One', { title: '' })).toBe(board);
    expect(updateCard(board, 'One', { phase: 'nope' }).cards[0]).not.toHaveProperty('phase');
  });

  it('move within a column and between columns, writing the move down', () => {
    let board = software('One', 'Two', 'Three');
    board = moveCard(board, 'Three', { column: 'c1', after: null }, later);
    expect(columnCards(board, 'c1').map((c) => c.id)).toEqual(['Three', 'One', 'Two']);
    expect(card(board, 'Three').timeline).toEqual([]);
    board = moveCard(board, 'One', { column: 'c3', after: null }, later, 'claude');
    expect(columnCards(board, 'c1').map((c) => c.id)).toEqual(['Three', 'Two']);
    expect(card(board, 'One')).toMatchObject({ column: 'c3', order: 0, updated: later().toISOString() });
    expect(card(board, 'One').timeline).toMatchObject([{ kind: 'move', from: 'c1', to: 'c3', by: 'claude', at: later().toISOString() }]);
    // Dropped where it was: nothing changes.
    expect(moveCard(board, 'Two', { column: 'c1', after: 'Three' })).toBe(board);
    expect(moveCard(board, 'Two', { column: 'nope', after: null })).toBe(board);
  });

  it('are completed when they enter a done column and not when they leave it', () => {
    let board = software('One');
    board = moveCard(board, 'One', { column: 'c5', after: null }, later);
    expect(card(board, 'One').completed).toBe(later().toISOString());
    expect(isFinished(board, card(board, 'One'))).toBe(true);
    board = moveCard(board, 'One', { column: 'c2', after: null }, later);
    expect(card(board, 'One').completed).toBeNull();
  });

  it('move to the first column of a kind', () => {
    let board = software('One', 'Two');
    board = moveCardToKind(board, 'One', 'review', later, 'claude');
    expect(card(board, 'One').column).toBe('c4');
    expect(reviewCount(board)).toBe(1);
    board = moveCardToKind(board, 'Two', 'review', later);
    expect(columnCards(board, 'c4').map((c) => c.id)).toEqual(['One', 'Two']);
    expect(moveCardToKind(board, 'One', 'dropped')).toBe(board);
  });

  it('are removed, and relinked when their note moves', () => {
    let board = addCard(software(), { title: 'A', note: 'Work/a.md' }, now, undefined, 'A');
    expect(relinkBoardNote(board, 'Work/b.md', 'x')).toBe(board);
    board = relinkBoardNote(board, 'Work/a.md', 'Done/a.md');
    expect(card(board, 'A').note).toBe('Done/a.md');
    // A phase's note follows it too, and a card's with it.
    board = addPhase(board, { name: 'P1', note: 'Done/a.md' }, 'p1');
    board = addPhase(board, { name: 'P2', note: 'Other.md' }, 'p2');
    board = relinkBoardNote(board, 'Done/a.md', 'Plans/a.md');
    expect(board.phases.map((p) => p.note)).toEqual(['Plans/a.md', 'Other.md']);
    expect(card(board, 'A').note).toBe('Plans/a.md');
    expect(relinkBoardNote(board, 'Done/a.md', 'x')).toBe(board);
    expect(removeCard(board, 'A').cards).toEqual([]);
    expect(removeCard(board, 'nope')).toBe(board);
  });
});

describe('comments', () => {
  it('are added, edited and removed on the timeline', () => {
    let board = software('One');
    board = addComment(board, 'One', ' Hello ', now, 'claude', 'e1');
    expect(card(board, 'One').timeline).toEqual([{ id: 'e1', at: now().toISOString(), by: 'claude', kind: 'comment', text: 'Hello' }]);
    expect(addComment(board, 'One', '  ', now)).toBe(board);
    board = editComment(board, 'One', 'e1', 'Hello again', later);
    expect(card(board, 'One').timeline[0]).toMatchObject({ text: 'Hello again', edited: later().toISOString() });
    expect(editComment(board, 'One', 'e1', '')).toBe(board);
    board = removeComment(board, 'One', 'e1');
    expect(card(board, 'One').timeline).toEqual([]);
    expect(removeComment(board, 'One', 'e1')).toBe(board);
  });
});

describe('columns', () => {
  it('are added after another or at the end, renamed and reordered', () => {
    let board = software();
    board = addColumn(board, 'Test', 'active', 'c3', 'c6');
    expect(board.columns.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c6', 'c4', 'c5']);
    board = addColumn(board, 'Lost', 'dropped', undefined, 'c7');
    expect(board.columns.at(-1)).toEqual({ id: 'c7', name: 'Lost', kind: 'dropped' });
    expect(addColumn(board, ' ', 'active')).toBe(board);
    expect(renameColumn(board, 'c6', 'QA').columns.find((c) => c.id === 'c6')?.name).toBe('QA');
    expect(moveColumn(board, 'c7', null).columns[0]?.id).toBe('c7');
    expect(moveColumn(board, 'c1', 'c5').columns.map((c) => c.id)).toEqual(['c2', 'c3', 'c6', 'c4', 'c5', 'c1', 'c7']);
    expect(moveColumn(board, 'c1', 'nope')).toBe(board);
  });

  it('change kind, except the last done column', () => {
    let board = software('One');
    board = moveCard(board, 'One', { column: 'c5', after: null }, now);
    expect(setColumnKind(board, 'c5', 'dropped')).toBe(board);
    board = addColumn(board, 'Shipped', 'done', undefined, 'c6');
    board = setColumnKind(board, 'c5', 'dropped', later);
    expect(board.columns.find((c) => c.id === 'c5')?.kind).toBe('dropped');
    expect(card(board, 'One').completed).toBeNull();
    board = setColumnKind(board, 'c5', 'done', later);
    expect(card(board, 'One').completed).toBe(later().toISOString());
  });

  it('are removed with their cards moved to the first column, except the last done one', () => {
    let board = software('One', 'Two');
    board = moveCard(board, 'Two', { column: 'c2', after: null }, now);
    expect(removeColumn(board, 'c5')).toBe(board);
    board = removeColumn(board, 'c2', later, 'kaan');
    expect(board.columns.map((c) => c.id)).toEqual(['c1', 'c3', 'c4', 'c5']);
    expect(columnCards(board, 'c1').map((c) => c.id)).toEqual(['One', 'Two']);
    expect(card(board, 'Two').timeline.at(-1)).toMatchObject({ kind: 'move', from: 'c2', to: 'c1', by: 'kaan' });
    expect(firstColumn(board, 'active')?.id).toBe('c3');
  });
});

describe('phases', () => {
  it('keep exactly one current while any is open', () => {
    let board = software();
    expect(currentPhase(board)).toBeUndefined();
    board = addPhase(board, { name: 'P1', goal: ' why ', doneWhen: '', note: 'Work/plan.md' }, 'p1');
    expect(board.phases).toEqual([{ id: 'p1', name: 'P1', state: 'current', goal: 'why', note: 'Work/plan.md' }]);
    board = addPhase(board, { name: 'P2' }, 'p2');
    expect(board.phases.map((p) => p.state)).toEqual(['current', 'upcoming']);
    expect(addPhase(board, { name: ' ' })).toBe(board);
    board = reopenPhase(board, 'p2');
    expect(board.phases.map((p) => p.state)).toEqual(['upcoming', 'current']);
    board = removePhase(board, 'p2');
    expect(board.phases.map((p) => p.state)).toEqual(['current']);
  });

  it('are edited and reordered', () => {
    let board = addPhase(addPhase(software(), { name: 'P1' }, 'p1'), { name: 'P2' }, 'p2');
    board = updatePhase(board, 'p1', { name: ' One ', doneWhen: ' when ', note: null });
    expect(board.phases[0]).toMatchObject({ name: 'One', doneWhen: 'when' });
    expect(board.phases[0]).not.toHaveProperty('note');
    expect(updatePhase(board, 'p1', { name: '' })).toBe(board);
    expect(movePhase(board, 'p2', null).phases.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('count their cards, dropped ones aside', () => {
    let board = addPhase(software('A', 'B', 'C'), { name: 'P1' }, 'p1');
    board = addColumn(board, 'Lost', 'dropped', undefined, 'c6');
    board = updateCard(board, 'A', { phase: 'p1' });
    board = updateCard(board, 'B', { phase: 'p1' });
    board = updateCard(board, 'C', { phase: 'p1' });
    expect(phaseCards(board, 'p1').map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(phaseCards(board, null)).toEqual([]);
    board = moveCard(board, 'A', { column: 'c5', after: null }, now);
    board = moveCard(board, 'B', { column: 'c6', after: null }, now);
    expect(phaseProgress(board, 'p1')).toEqual({ done: 1, total: 2 });
    expect(phaseCanClose(board, 'p1')).toBe(false);
    board = moveCard(board, 'C', { column: 'c5', after: null }, now);
    expect(phaseCanClose(board, 'p1')).toBe(true);
    expect(openCardCount(board)).toBe(0);
  });

  it('close with leftovers going to the next phase or to no phase', () => {
    let board = addPhase(addPhase(software('A', 'B'), { name: 'P1' }, 'p1'), { name: 'P2' }, 'p2');
    board = updateCard(board, 'A', { phase: 'p1' });
    board = updateCard(board, 'B', { phase: 'p1' });
    board = moveCard(board, 'A', { column: 'c5', after: null }, now);
    const toNext = closePhase(board, 'p1', 'next', later);
    expect(toNext.phases.map((p) => p.state)).toEqual(['done', 'current']);
    expect(card(toNext, 'A').phase).toBe('p1');
    expect(card(toNext, 'B')).toMatchObject({ phase: 'p2', updated: later().toISOString() });
    const toBacklog = closePhase(board, 'p1', 'backlog', later);
    expect(card(toBacklog, 'B')).not.toHaveProperty('phase');
    const staying = closePhase(board, 'p1', 'stay', later);
    expect(staying.phases.map((p) => p.state)).toEqual(['done', 'current']);
    expect(staying.cards).toBe(board.cards);
    expect(closePhase(toNext, 'p1', 'next')).toBe(toNext);
    // The last phase closes too; nothing is current then.
    const last = closePhase(toNext, 'p2', 'next');
    expect(last.phases.map((p) => p.state)).toEqual(['done', 'done']);
    expect(currentPhase(last)).toBeUndefined();
  });

  it('close with leftovers going to a phase picked, the first open one when none comes after', () => {
    let board = addPhase(addPhase(addPhase(software('A'), { name: 'P1' }, 'p1'), { name: 'P2' }, 'p2'), { name: 'P3' }, 'p3');
    board = updateCard(board, 'A', { phase: 'p2' });
    expect(nextOpenPhase(board, 'p2')?.id).toBe('p3');
    expect(card(closePhase(board, 'p2', { phase: 'p1' }), 'A').phase).toBe('p1');
    // A phase that is done, or the one closing, is none to go to.
    expect(card(closePhase(board, 'p2', { phase: 'p2' }), 'A')).not.toHaveProperty('phase');
    const p3done = closePhase(board, 'p3', 'stay');
    expect(card(closePhase(p3done, 'p2', { phase: 'p3' }), 'A')).not.toHaveProperty('phase');
    expect(nextOpenPhase(p3done, 'p2')?.id).toBe('p1');
    expect(card(closePhase(p3done, 'p2', 'next'), 'A').phase).toBe('p1');
  });

  it('lose their cards to no phase when removed', () => {
    let board = addPhase(software('A'), { name: 'P1' }, 'p1');
    board = updateCard(board, 'A', { phase: 'p1' });
    board = removePhase(board, 'p1');
    expect(card(board, 'A')).not.toHaveProperty('phase');
    expect(removePhase(board, 'p1')).toBe(board);
  });
});

describe('across boards', () => {
  it('lists dated cards that are not finished, by day then priority', () => {
    let a = software('A1', 'A2', 'A3');
    a = updateCard(a, 'A1', { due: '2026-10-09', priority: 3 });
    a = updateCard(a, 'A2', { due: '2026-10-09', priority: 1 });
    a = updateCard(a, 'A3', { due: '2026-10-08' });
    a = moveCard(a, 'A3', { column: 'c5', after: null }, now);
    let b = newBoard('Other', 'simple', ids('c'));
    b = addCard(b, { title: 'B1', due: '2026-10-08' }, now, undefined, 'B1');
    expect(dueCards({ 'Work/Roadmap.board.json': a, 'Other.board.json': b }).map((d) => `${d.board}:${d.card.id}`)).toEqual([
      'Other.board.json:B1',
      'Work/Roadmap.board.json:A2',
      'Work/Roadmap.board.json:A1',
    ]);
  });
});

describe('briefs', () => {
  it('write a card for a person or an agent', () => {
    let board = addPhase(software(), { name: 'Phase 3: Board' }, 'p1');
    board = addCard(board, { title: 'Phase strip', description: 'Ticks and bold.\n', priority: 1, due: '2026-10-09', labels: ['board'], assignee: { name: 'claude' }, note: 'Work/Board notes.md' }, now, 'kaan', 'A');
    board = moveCard(board, 'A', { column: 'c4', after: null }, now, 'claude');
    board = addComment(board, 'A', 'Strip is in.', later, 'claude');
    expect(cardBrief(board, card(board, 'A'), { 'Work/Board notes.md': 'The note.\n' })).toBe(
      [
        '# ROA-1 Phase strip',
        '',
        '- Status: Review',
        '- Phase: Phase 3: Board',
        '- Priority: p1',
        '- Due: 2026-10-09',
        '- Labels: board',
        '- Assignee: claude',
        '',
        'Ticks and bold.',
        '',
        '## Comments',
        '',
        '**claude**, 2026-10-07 13:00:',
        '',
        'Strip is in.',
        '',
        '## From the note Work/Board notes.md',
        '',
        'The note.',
        '',
      ].join('\n'),
    );
  });

  it('write a phase with its cards by column', () => {
    let board = addPhase(software(), { name: 'Phase 3', goal: 'A board.', doneWhen: 'It runs Scrawl.' }, 'p1');
    board = addCard(board, { title: 'One', priority: 2 }, now, undefined, 'One');
    board = addCard(board, { title: 'Two', column: 'c5' }, now, undefined, 'Two');
    expect(phaseBrief(board, board.phases[0]!)).toBe(
      ['# Phase 3', '', 'A board.', '', 'Done when: It runs Scrawl.', '', '## Cards (1/2 done)', '', '### Backlog', '', '- ROA-1 One (p2)', '', '### Done', '', '- ROA-2 Two', ''].join('\n'),
    );
  });
});

describe("a board's own fields", () => {
  const crm = () => newBoard('Deals', 'crm', ids('c'), { company: 'Scrawl/Companies', contact: 'Scrawl/People' });

  it('come with the CRM template, its columns as a CRM keeps deals', () => {
    const board = crm();
    expect(board.columns.map((c) => `${c.name}:${c.kind}`)).toEqual(['Lead:backlog', 'Contacted:active', 'Meeting:active', 'Proposal:active', 'Won:done', 'Lost:dropped']);
    expect(board.phasesOn).toBe(false);
    expect(board.fields?.map((f) => `${f.key}:${f.type}:${f.collection ?? ''}`)).toEqual(['company:link:Scrawl/Companies', 'contact:link:Scrawl/People', 'value:number:', 'next_step:date:']);
    expect(newBoard('Plan', 'simple', ids('c')).fields).toBeUndefined();
  });

  it('keep their values on the card, read as their types hold them, through the file', () => {
    let board = addCard(crm(), { title: 'Pilot', values: { company: { id: 'a1', name: 'Acme Corp', code: 'CUS-0012' }, value: 12000, contact: null } }, now, undefined, 'k1');
    board = addCard(board, { title: 'Annual plan' }, now, undefined, 'k2');
    board = updateCard(board, 'k2', { values: { value: 24000, next_step: '2026-10-14' } }, now);
    const read = parseBoard(serializeBoard(board));
    const [pilot, plan] = read.cards;
    expect(pilot!.values).toEqual({ company: { id: 'a1', name: 'Acme Corp', code: 'CUS-0012' }, value: 12000 });
    const field = (key: string) => read.fields!.find((f) => f.key === key)!;
    expect(cardValue(read, pilot!, field('company'))).toEqual({ id: 'a1', name: 'Acme Corp', code: 'CUS-0012' });
    expect(cardValue(read, plan!, field('next_step'))).toBe('2026-10-14');
    expect(cardSum(read, read.cards, field('value'))).toBe(36000);
    expect(faceFields(read).map((f) => f.key)).toEqual(['company', 'value']);
    // Emptied, a value goes; with none left, so do the card's values.
    const cleared = updateCard(read, 'k2', { values: { value: null, next_step: null } }, now);
    expect(cleared.cards.find((c) => c.id === 'k2')!.values).toBeUndefined();
    expect(cardBrief(read, pilot!)).toContain('- Company: Acme Corp · CUS-0012\n- Value: 12000');
  });

  it('find the cards that link to a record, on every board, the open ones first', () => {
    let deals = addCard(crm(), { title: 'Old deal', column: 'c5', values: { company: { id: 'a1', name: 'Acme Corp' } } }, now, undefined, 'k1');
    deals = addCard(deals, { title: 'Pilot', values: { company: { id: 'a1', name: 'Acme Corp' } } }, later, undefined, 'k2');
    deals = addCard(deals, { title: 'Other', values: { company: { id: 'b2', name: 'Globex' } } }, later, undefined, 'k3');
    // A link written by hand, by the record's name.
    deals = addCard(deals, { title: 'By name', values: { contact: { id: '', name: 'Acme Corp' } } }, later, undefined, 'k4');
    const plan = newBoard('Plan', 'simple', ids('p'));
    const boards = { 'Scrawl/Deals.board.json': deals, 'Scrawl/Plan.board.json': plan };
    expect(boardsLinkingTo(boards, 'Scrawl/Companies')).toEqual(['Scrawl/Deals.board.json']);
    expect(linkedCards(boards, 'Scrawl/Companies', { id: 'a1', name: 'Acme Corp' }).map((d) => d.card.title)).toEqual(['Pilot', 'Old deal']);
    expect(linkedCards(boards, 'Scrawl/People', { id: 'p9', name: 'acme corp' }).map((d) => d.card.title)).toEqual(['By name']);
  });

  it('change in one go: renamed choices follow on the cards, a value whose field is gone stays', () => {
    let board = setBoardFields(crm(), [...crm().fields!, { key: 'stage', label: 'Stage', type: 'select', options: ['warm', 'cold'] }]);
    board = addCard(board, { title: 'Pilot', values: { stage: 'warm', value: 5 } }, now, undefined, 'k1');
    const next = setBoardFields(board, [{ key: 'stage', label: 'Stage', type: 'select', options: ['hot', 'cold'] }], { stage: { warm: 'hot' } });
    expect(next.fields!.map((f) => f.key)).toEqual(['stage']);
    expect(next.cards[0]!.values).toEqual({ stage: 'hot', value: 5 });
    expect(setBoardFields(next, []).fields).toBeUndefined();
    // A name or code field written by hand reads as text: a card has its own title and key.
    expect(parseBoard(JSON.stringify({ fields: [{ key: 'name', label: 'Name', type: 'name' }] })).fields![0]!.type).toBe('text');
  });
});
