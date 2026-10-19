import { describe, expect, it } from 'vitest';
import { addCard, addPhase, columnCards, loadBoard, newBoard, removeCard, saveBoard } from './board';
import { MemoryFs } from './fs';
import { cardPiece, parsePiece, putBackCard, putBackTasks, sectionPiece, serializePiece, taskPiece } from './pieces';
import { addSection, addTask, loadList, removeSection, removeTask, saveList, sectionTasks, type TaskList } from './tasks';
import { readTrashed } from './trashed';
import { deleteFromTrash, PieceHomeGone, readTrash, relinkTrash, restoreFromTrash, trashItem, trashPiece } from './vault';

const now = () => new Date('2026-10-19T10:00:00Z');
const ids = (list: TaskList) => list.tasks.map((t) => t.id);

/** A list with a section, three tasks in it, a subtask under the second, and one task in no section. */
function sample(): TaskList {
  let list: TaskList = addSection({ sections: [], tasks: [] }, 'This week', 's1');
  list = { ...list, tasks: addTask(list.tasks, { title: 'Loose' }, now, 't0') };
  list = { ...list, tasks: addTask(list.tasks, { title: 'One', section: 's1' }, now, 't1') };
  list = { ...list, tasks: addTask(list.tasks, { title: 'Two', section: 's1' }, now, 't2') };
  list = { ...list, tasks: addTask(list.tasks, { title: 'Three', section: 's1' }, now, 't3') };
  list = { ...list, tasks: addTask(list.tasks, { title: 'Under two', parent: 't2' }, now, 't2a') };
  return list;
}

describe('a deleted task, section or card', () => {
  it('goes back where it was, with its subtasks and ids, and once only', () => {
    const list = sample();
    const piece = taskPiece(list, 't2')!;
    expect(piece).toMatchObject({ kind: 'task', section: { id: 's1', name: 'This week' }, parent: null, after: 't1' });
    expect(piece.tasks.map((t) => t.id)).toEqual(['t2', 't2a']);
    const without = { ...list, tasks: removeTask(list.tasks, 't2') };
    const back = putBackTasks(without, parsePiece(serializePiece(piece)) as typeof piece, now);
    expect(sectionTasks(back, 's1').map((t) => t.title)).toEqual(['One', 'Two', 'Three']);
    expect(back.tasks.find((t) => t.id === 't2a')!.parent).toBe('t2');
    expect(putBackTasks(back, piece, now)).toBe(back);
    // Its section gone, it comes back with no section, at the end of those.
    const noSection = removeSection(without, 's1');
    expect(sectionTasks(putBackTasks(noSection, piece, now), null).map((t) => t.title)).toEqual(['Loose', 'Two']);
  });

  it('puts a section back with its tasks after the section before it', () => {
    let list = addSection(sample(), 'Later', 's2');
    const piece = sectionPiece(list, 's1')!;
    expect(piece.tasks.map((t) => t.id)).toEqual(['t1', 't2', 't2a', 't3']);
    list = removeSection(list, 's1');
    expect(list.sections.map((s) => s.id)).toEqual(['s2']);
    const back = putBackTasks(list, piece, now);
    expect(back.sections.map((s) => s.name)).toEqual(['This week', 'Later']);
    expect(ids(back).sort()).toEqual(['t0', 't1', 't2', 't2a', 't3']);
  });

  it('puts a card back in its column, its phase and its place, with its key; a column renamed or gone is found or left', () => {
    let board = addPhase(newBoard('Plans', 'software', (() => { let n = 0; return () => `c${++n}`; })()), { name: 'Now' }, 'p1');
    for (const [i, title] of ['A', 'B', 'C'].entries()) board = addCard(board, { title, column: 'c2', phase: 'p1' }, now, undefined, `k${i}`);
    const piece = cardPiece(board, 'k1')!;
    expect(piece).toMatchObject({ column: { id: 'c2', name: 'Todo' }, phase: { id: 'p1', name: 'Now' }, after: 'k0' });
    const without = removeCard(board, 'k1');
    const back = putBackCard(without, parsePiece(serializePiece(piece)) as typeof piece, now);
    expect(columnCards(back, 'c2').map((c) => c.title)).toEqual(['A', 'B', 'C']);
    expect(back.cards.find((c) => c.id === 'k1')).toMatchObject({ key: 2, phase: 'p1' });
    expect(putBackCard(back, piece, now)).toBe(back);
    // The column renamed: found by its id; gone, the card goes to the first column, in no phase once the phase is gone too.
    const gone = { ...without, columns: without.columns.filter((c) => c.id !== 'c2'), phases: [] };
    expect(putBackCard(gone, piece, now).cards.find((c) => c.id === 'k1')).toMatchObject({ column: 'c1' });
    expect(putBackCard(gone, piece, now).cards.find((c) => c.id === 'k1')!.phase).toBeUndefined();
  });
});

describe('the trash of tasks, sections and cards', () => {
  it('keeps them with their title and count, puts them back on the files, and deletes them for good with the files only they used', async () => {
    const fs = new MemoryFs();
    const list = sample();
    await saveList(fs, 'Plans/Week.tasks.json', list);
    const piece = taskPiece(list, 't2')!;
    await trashPiece(fs, 'Plans/Week.tasks.json', piece, now());
    await saveList(fs, 'Plans/Week.tasks.json', { ...list, tasks: removeTask(list.tasks, 't2') });
    const [item] = await readTrash(fs);
    expect(item).toMatchObject({ kind: 'task', title: 'Two', from: 'Plans/Week.tasks.json', count: 1 });
    expect(await readTrashed(fs, item!)).toMatchObject({ kind: 'piece', piece: { kind: 'task' } });
    expect(await restoreFromTrash(fs, item!)).toBe('Plans/Week.tasks.json');
    expect(sectionTasks(await loadList(fs, 'Plans/Week.tasks.json'), 's1').map((t) => t.title)).toEqual(['One', 'Two', 'Three']);
    expect(await readTrash(fs)).toEqual([]);

    // A card with a picture: the picture stays while the card is in the trash, and goes with it for good.
    let board = addCard(newBoard('Plans', 'simple'), { title: 'Shot', description: '![](_attachments/shot.png)' }, now, undefined, 'k1');
    await fs.writeBlob('_attachments/shot.png', new Blob(['x']));
    await trashPiece(fs, 'Plans.board.json', cardPiece(board, 'k1')!, now());
    board = removeCard(board, 'k1');
    await saveBoard(fs, 'Plans.board.json', board);
    const [card] = await readTrash(fs);
    expect(card).toMatchObject({ kind: 'card', title: 'Shot' });
    expect(await fs.stat?.('_attachments/shot.png')).toBeTruthy();
    await deleteFromTrash(fs, card!);
    expect(await fs.stat?.('_attachments/shot.png')).toBeFalsy();
    expect((await loadBoard(fs, 'Plans.board.json')).cards).toEqual([]);
  });

  it('follows its list when the list moves, and says so when the list is in the trash or gone', async () => {
    const fs = new MemoryFs();
    const list = sample();
    await saveList(fs, 'Week.tasks.json', list);
    await trashPiece(fs, 'Week.tasks.json', taskPiece(list, 't1')!, now());
    await fs.move('Week.tasks.json', 'Plans/Week.tasks.json');
    await relinkTrash(fs, 'Week.tasks.json', 'Plans/Week.tasks.json');
    expect((await readTrash(fs))[0]!.from).toBe('Plans/Week.tasks.json');
    await trashItem(fs, 'Plans/Week.tasks.json', new Date('2026-10-19T11:00:00Z'));
    const task = (await readTrash(fs)).find((t) => t.kind === 'task')!;
    const inTrash = await restoreFromTrash(fs, task).catch((error: unknown) => error);
    expect(inTrash).toBeInstanceOf(PieceHomeGone);
    expect((inTrash as PieceHomeGone).inTrash).toMatchObject({ kind: 'tasks', from: 'Plans/Week.tasks.json' });
    await deleteFromTrash(fs, (inTrash as PieceHomeGone).inTrash!);
    expect(((await restoreFromTrash(fs, task).catch((error: unknown) => error)) as PieceHomeGone).inTrash).toBeNull();
  });
});
