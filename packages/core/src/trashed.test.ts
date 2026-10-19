import { describe, expect, it } from 'vitest';
import { addCard, saveBoard } from './board';
import { addRecord, createCollection, loadCollection } from './collection';
import { MemoryFs } from './fs';
import { addSection, addTask, saveList } from './tasks';
import { readTrashed } from './trashed';
import { createBoard, createFolder, createKeys, createNote, createTaskList, readTrash, trashFolder, trashItem } from './vault';
import { loadBoard } from './board';
import { loadList } from './tasks';

// What a deleted item holds, read where it lies in the trash, nothing put back and nothing written.

const at = new Date(2026, 9, 19, 14, 30);

async function trashed(fs: MemoryFs, title: string) {
  const item = (await readTrash(fs)).find((each) => each.title === title);
  if (!item) throw new Error(`${title} is not in the trash`);
  return readTrashed(fs, item);
}

describe('a deleted item read in the trash', () => {
  it('shows a note’s text, a list’s tasks and a board’s cards', async () => {
    const fs = new MemoryFs();
    await createFolder(fs, 'Plans');
    const note = await createNote(fs, 'Plans', 'Roadmap', at);
    await fs.writeText(note, '# Roadmap\n\nShip the agent.\n');
    const listPath = await createTaskList(fs, 'Plans', 'Work');
    let list = addSection(await loadList(fs, listPath), 'Later', 'sec-1');
    list = { ...list, tasks: addTask(list.tasks, { title: 'Call Ada', section: 'sec-1' }) };
    await saveList(fs, listPath, list);
    const boardPath = await createBoard(fs, 'Plans', 'Scrawl', 'simple');
    await saveBoard(fs, boardPath, addCard(await loadBoard(fs, boardPath), { title: 'Landing page' }));
    for (const path of [note, listPath, boardPath]) await trashItem(fs, path, at);

    expect(await trashed(fs, 'Roadmap')).toEqual({ kind: 'note', text: '# Roadmap\n\nShip the agent.\n' });
    const tasks = await trashed(fs, 'Work');
    expect(tasks.kind === 'tasks' && tasks.list.tasks.map((task) => [task.title, task.section])).toEqual([['Call Ada', 'sec-1']]);
    const board = await trashed(fs, 'Scrawl');
    expect(board.kind === 'board' && board.board.cards.map((card) => card.title)).toEqual(['Landing page']);
  });

  it('shows a keys file’s names and not its values', async () => {
    const fs = new MemoryFs();
    const path = await createKeys(fs, '', 'Production');
    await fs.writeText(path, '# Database\nDB_USER=admin\nDB_PASSWORD=s3cret\n');
    await trashItem(fs, path, at);
    const keys = await trashed(fs, 'Production');
    expect(keys).toEqual({ kind: 'keys', groups: [{ name: 'Database', keys: ['DB_USER', 'DB_PASSWORD'] }] });
    expect(JSON.stringify(keys)).not.toContain('s3cret');
  });

  it('shows a collection’s records and what a folder holds, its collection as one thing', async () => {
    const fs = new MemoryFs();
    await createFolder(fs, 'CRM');
    const dir = await createCollection(fs, 'CRM', 'Companies', 'companies');
    await addRecord(fs, await loadCollection(fs, dir), { values: { name: 'Acme Corp' } });
    await createFolder(fs, 'Notes', 'CRM');
    await createNote(fs, 'CRM/Notes', 'Meeting', at);
    await trashFolder(fs, 'CRM', at);

    const folder = await trashed(fs, 'CRM');
    expect(folder.kind === 'folder' && folder.entries).toEqual([
      { name: 'Companies', kind: 'collection', depth: 0 },
      { name: 'Notes', kind: 'folder', depth: 0 },
      { name: 'Meeting.md', kind: 'note', depth: 1 },
    ]);

    const fs2 = new MemoryFs();
    await createFolder(fs2, 'CRM');
    const dir2 = await createCollection(fs2, 'CRM', 'People', 'people');
    await addRecord(fs2, await loadCollection(fs2, dir2), { values: { name: 'Ada' } });
    await trashFolder(fs2, dir2, at);
    const collection = await trashed(fs2, 'People');
    expect(collection.kind === 'collection' && collection.collection.records.map((record) => record.name)).toEqual(['Ada']);
  });
});
