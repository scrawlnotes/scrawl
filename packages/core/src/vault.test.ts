import { describe, expect, it } from 'vitest';
import { MemoryFs, PART_SIZE } from './fs';
import { addCard, loadBoard, saveBoard } from './board';
import { addTask, loadTasks, serializeTasks } from './tasks';
import {
  boardName,
  createBoard,
  createKeys,
  createFolder,
  createNote,
  createScratchNote,
  createTaskList,
  deleteFromTrash,
  displayTitle,
  emptyTrash,
  INBOX_TASKS,
  isScratchNote,
  listName,
  loadWorkspace,
  moveItem,
  readTrash,
  loadNoteTitles,
  NOTE_TITLES,
  readFolder,
  saveNoteTitles,
  readTree,
  renameItem,
  restoreAttachments,
  restoreFromTrash,
  saveAttachment,
  saveFile,
  saveWorkspace,
  trashUnlinked,
  trashWithFiles,
  titleOf,
  trashFolder,
  trashItem,
  type TreeNode,
  WELCOME_NOTE,
} from './vault';
import { isSynced } from './sync/paths';

const at = new Date(2026, 9, 5, 14, 32, 7);

describe('titleOf', () => {
  it('uses the first line that has text', () => {
    expect(titleOf('\n\nstandup notes\nmore')).toBe('standup notes');
  });

  it('leaves Markdown syntax out', () => {
    expect(titleOf('# Sync **engine**: `open` questions')).toBe('Sync engine: open questions');
    expect(titleOf('- buy [milk](https://x.y)')).toBe('buy milk');
  });

  it('keeps characters that were typed literally', () => {
    expect(titleOf('find \\*.txt in \\_\\_init\\_\\_')).toBe('find *.txt in __init__');
    expect(titleOf('\\# not a heading')).toBe('# not a heading');
  });

  it('falls back to untitled', () => {
    expect(titleOf('  \n')).toBe('untitled');
  });
});

/** Tree nodes without when they were written, which a memory vault makes up. */
const unwritten = (nodes: TreeNode[]): TreeNode[] => JSON.parse(JSON.stringify(nodes, (key, value) => (key === 'modified' ? undefined : value)));

describe('vault', () => {
  it('creates scratch notes at the top of the space without name clashes', async () => {
    const fs = new MemoryFs();
    expect(await createScratchNote(fs, at)).toBe('2026-10-05 143207.md');
    expect(await createScratchNote(fs, at)).toBe('2026-10-05 143207 2.md');
  });

  it('lists task lists first, then folders and notes, and skips app folders', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox.tasks.json', '{}');
    // A folder called Inbox, from before there was none, is a folder like any other.
    await fs.writeText('Inbox/a.md', 'first idea');
    await fs.writeText('Work/plan.md', '# Plan');
    await fs.writeText('Work/Sprint.tasks.json', '{}');
    await fs.writeText('loose.md', 'loose note');
    await fs.writeText('.scrawl/workspace.json', '{}');
    await fs.writeText('_attachments/x.png', '');
    await fs.writeText('Work/data.json', '{}');
    await fs.mkdir('Empty');

    const tree = await readTree(fs);
    expect(tree.map((n) => n.path)).toEqual(['Inbox.tasks.json', 'Empty', 'Inbox', 'Work', 'loose.md']);
    expect(tree[0]).toMatchObject({ kind: 'tasks', title: 'Inbox' });
    expect(tree[2]!.children!.map((n) => n.path)).toEqual(['Inbox/a.md']);
    expect(unwritten(tree[3]!.children!)).toEqual([
      { name: 'Sprint.tasks.json', path: 'Work/Sprint.tasks.json', kind: 'tasks', title: 'Sprint' },
      { name: 'plan.md', path: 'Work/plan.md', kind: 'note', title: 'plan' },
    ]);
  });

  it('reads a folder at a time: the folders in it still to be read, how many notes it read, and a collection by its schema file alone', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox.tasks.json', '[]');
    await fs.writeText('plan.md', '# Plan');
    await fs.writeText('Work/notes.md', 'notes');
    await fs.writeText('Clients/_collection.json', '{}');
    await fs.writeText('Clients/Acme.md', '---\nid: a\n---\n');
    await fs.writeText('.scrawl/workspace.json', '{}');
    const listed: string[] = [];
    const list = fs.list.bind(fs);
    fs.list = (dir) => (listed.push(dir), list(dir));
    const read = await readFolder(fs, '', await fs.list(''));
    expect(read.nodes.map((n) => [n.kind, n.path, n.reading])).toEqual([
      ['tasks', 'Inbox.tasks.json', undefined],
      ['collection', 'Clients', undefined],
      ['folder', 'Work', true],
      ['note', 'plan.md', undefined],
    ]);
    expect(read.nodes[2]!.children).toEqual([]);
    expect(read.folders).toEqual([{ path: 'Work' }]);
    expect(read.read).toBe(1);
    // Neither the collection nor the folder was listed: the folder is, as it is read next.
    expect(listed).toEqual(['']);
    // Read whole, the same tree has every folder's items and none left to be read.
    expect(unwritten([(await readTree(fs))[2]!])[0]).toEqual({ name: 'Work', path: 'Work', kind: 'folder', children: [{ name: 'notes.md', path: 'Work/notes.md', kind: 'note', title: 'notes' }] });
  });

  it('names the notes that did not change from the titles kept, reads those that did, and keeps only those still there', async () => {
    const fs = new MemoryFs();
    await fs.writeText('2026-10-05 143207.md', '# First');
    await fs.writeText('Work/b.md', '');
    await fs.writeText('Work/c.md', 'c');
    const reads: string[] = [];
    const readText = fs.readText.bind(fs);
    fs.readText = (path) => (reads.push(path), readText(path));

    // Nothing kept yet: every note is read, and the titles are written.
    const first = await loadNoteTitles(fs);
    await readTree(fs, '', first);
    await saveNoteTitles(fs, first);
    expect(reads.filter((path) => path.endsWith('.md')).sort()).toEqual(['2026-10-05 143207.md', 'Work/b.md', 'Work/c.md']);

    // Again: none is read, the same tree, nothing written.
    reads.length = 0;
    const again = await loadNoteTitles(fs);
    const tree = await readTree(fs, '', again);
    expect(reads.filter((path) => path !== NOTE_TITLES)).toEqual([]);
    expect(tree.map((n) => [n.path, n.title])).toEqual([['Work', undefined], ['2026-10-05 143207.md', 'First']]);
    expect(tree[0]!.children!.map((n) => [n.path, n.empty])).toEqual([['Work/b.md', true], ['Work/c.md', undefined]]);
    expect(again.changed).toBe(false);

    // One changed and one gone: only the changed one is read, and the gone one is no longer kept.
    await fs.writeText('2026-10-05 143207.md', '# Renamed');
    await fs.remove('Work/c.md');
    reads.length = 0;
    const third = await loadNoteTitles(fs);
    expect((await readTree(fs, '', third)).find((n) => n.path === '2026-10-05 143207.md')?.title).toBe('Renamed');
    expect(reads.filter((path) => path !== NOTE_TITLES)).toEqual(['2026-10-05 143207.md']);
    expect(third.changed).toBe(true);
    await saveNoteTitles(fs, third);
    expect(Object.keys(JSON.parse(await readText(NOTE_TITLES)).notes).sort()).toEqual(['2026-10-05 143207.md', 'Work/b.md']);

    // Titles that cannot be read are none: every note is read again.
    await fs.writeText(NOTE_TITLES, 'not json');
    expect((await loadNoteTitles(fs)).get((await fs.list(''))[1]!)).toBeNull();
  });

  it('shows an unnamed note by its first line and a named note by its file name', () => {
    expect(displayTitle('Inbox/2026-10-05 143207.md', '# Call the dentist')).toBe('Call the dentist');
    expect(displayTitle('Work/2026-10-05 143207 2.md', 'moved but still unnamed')).toBe('moved but still unnamed');
    expect(displayTitle('Work/Meeting notes.md', '# Something else')).toBe('Meeting notes');
  });

  it('creates a scratch note in a given folder', async () => {
    expect(await createScratchNote(new MemoryFs(), at, 'Work')).toBe('Work/2026-10-05 143207.md');
  });

  it('creates a note under the name given, or a scratch note without one', async () => {
    const fs = new MemoryFs();
    expect(await createNote(fs, 'Work', '  ', at)).toBe('Work/2026-10-05 143207.md');
    expect(await createNote(fs, 'Work', 'Plan.md')).toBe('Work/Plan.md');
    expect(await createNote(fs, 'Work', 'plan')).toBe('Work/plan 2.md');
    await expect(createNote(fs, 'Work', '.hidden')).rejects.toThrow();
  });

  it('tells a scratch note from a named one', () => {
    expect(isScratchNote('Work/2026-10-05 143207 2.md')).toBe(true);
    expect(isScratchNote('Work/Plan.md')).toBe(false);
  });

  it('creates task lists, called Tasks when they have no name', async () => {
    const fs = new MemoryFs();
    const first = await createTaskList(fs, 'Work', '');
    expect(first).toBe('Work/Tasks.tasks.json');
    expect(await loadTasks(fs, first)).toEqual([]);
    expect(await createTaskList(fs, 'Work', ' ')).toBe('Work/Tasks 2.tasks.json');
    expect(await createTaskList(fs, 'Work', 'sprint.tasks.json')).toBe('Work/sprint.tasks.json');
    // A name that differs only in case is the same file on Windows.
    expect(await createTaskList(fs, 'Work', 'Sprint')).toBe('Work/Sprint 2.tasks.json');
  });

  it("keeps the personal space's own list, Inbox, at its top", async () => {
    const fs = new MemoryFs();
    expect(INBOX_TASKS).toBe('Inbox.tasks.json');
    expect(listName(INBOX_TASKS)).toBe('Inbox');
    // Made as any list is: a list called Inbox at the top is that list, a second one is another.
    expect(await createTaskList(fs, '', 'Inbox')).toBe(INBOX_TASKS);
    expect(await createTaskList(fs, '', 'Inbox')).toBe('Inbox 2.tasks.json');
  });

  it('creates boards from a template, called Board without a name, with keys after the name', async () => {
    const fs = new MemoryFs();
    expect(await createBoard(fs, 'Work', '', 'simple')).toBe('Work/Board.board.json');
    expect(await createBoard(fs, 'Work', '', 'simple')).toBe('Work/Board 2.board.json');
    expect(await createBoard(fs, 'Work', 'Client portal.board.json', 'software')).toBe('Work/Client portal.board.json');
    const simple = await loadBoard(fs, 'Work/Board.board.json');
    expect(simple.columns.map((c) => c.name)).toEqual(['Todo', 'Doing', 'Done']);
    expect(simple.prefix).toBe('BOA');
    const software = await loadBoard(fs, 'Work/Client portal.board.json');
    expect(software.columns).toHaveLength(5);
    expect(software.prefix).toBe('CP');
    expect(boardName('Work/Client portal.board.json')).toBe('Client portal');
    expect((await readTree(fs, 'Work')).map((n) => [n.kind, n.title])).toEqual([
      ['board', 'Board'],
      ['board', 'Board 2'],
      ['board', 'Client portal'],
    ]);
    await expect(createBoard(fs, 'Work', '.hidden', 'simple')).rejects.toThrow();
  });

  it('creates keys files, called Keys without a name, listed after boards and trashed with their count', async () => {
    const fs = new MemoryFs();
    expect(await createKeys(fs, 'Work', '')).toBe('Work/Keys.env');
    expect(await createKeys(fs, 'Work', 'Production.env')).toBe('Work/Production.env');
    expect(await fs.readText('Work/Production.env')).toBe('');
    await createBoard(fs, 'Work', 'Roadmap', 'simple');
    await fs.writeText('Work/plan.md', 'plan');
    await fs.mkdir('Work/meetings');
    // A file that is only `.env`, as other tools keep, is not one of the app's.
    await fs.writeText('Work/.env', 'A=1');
    expect((await readTree(fs, 'Work')).map((n) => [n.kind, n.title ?? n.name])).toEqual([
      ['board', 'Roadmap'],
      ['keys', 'Keys'],
      ['keys', 'Production'],
      ['folder', 'meetings'],
      ['note', 'plan'],
    ]);
    expect(await renameItem(fs, 'Work/Keys.env', 'Staging')).toBe('Work/Staging.env');
    await fs.writeText('Work/Production.env', '# DB\nHOST=a\nPASSWORD=b\n');
    await trashItem(fs, 'Work/Production.env', new Date(2026, 9, 5, 15, 0, 0));
    expect((await readTrash(fs))[0]).toMatchObject({ kind: 'keys', title: 'Production', keys: 2, from: 'Work/Production.env' });
  });

  it('renames and moves a board, keeping it a board', async () => {
    const fs = new MemoryFs();
    const path = await createBoard(fs, 'Work', 'Roadmap', 'software');
    expect(await renameItem(fs, path, 'Plan')).toBe('Work/Plan.board.json');
    await fs.mkdir('Done');
    expect(await moveItem(fs, 'Work/Plan.board.json', 'Done')).toBe('Done/Plan.board.json');
    expect((await loadBoard(fs, 'Done/Plan.board.json')).columns).toHaveLength(5);
  });

  it('renames a note within its folder', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/2026-10-05 143207.md', 'text');
    await fs.writeText('Work/Plan.md', 'other');
    // What a file name does not take is kept as its look-alike, and shown back as typed.
    expect(await renameItem(fs, 'Work/2026-10-05 143207.md', 'Road/map?')).toBe('Work/Road∕map？.md');
    expect(displayTitle('Work/Road∕map？.md', '')).toBe('Road/map?');
    expect(await renameItem(fs, 'Work/Road∕map？.md', 'Plan')).toBe('Work/Plan 2.md');
    expect(await renameItem(fs, 'Work/Plan.md', 'Plan.md')).toBe('Work/Plan.md');
    expect(await renameItem(fs, 'Work/Plan.md', 'plan')).toBe('Work/plan.md');
    await expect(renameItem(fs, 'Work/plan.md', '  ')).rejects.toThrow();
  });

  it('renames a task list and keeps it a task list', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/Tasks.tasks.json', '{}');
    expect(await renameItem(fs, 'Work/Tasks.tasks.json', 'Sprint 12')).toBe('Work/Sprint 12.tasks.json');
    expect(await renameItem(fs, 'Work/Sprint 12.tasks.json', 'Next.tasks.json')).toBe('Work/Next.tasks.json');
  });

  it('moves a note into a folder, numbering it when the name is taken', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox/a.md', 'one');
    await fs.writeText('Work/a.md', 'two');
    expect(await moveItem(fs, 'Inbox/a.md', 'Work')).toBe('Work/a 2.md');
    expect(await fs.readText('Work/a 2.md')).toBe('one');
    expect(await fs.list('Inbox')).toEqual([]);
  });

  it('moves a task list, numbering the name and not the extension', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Home/Tasks.tasks.json', 'home');
    await fs.writeText('Work/Tasks.tasks.json', 'work');
    await fs.writeText('Tasks.tasks.json', 'top');
    expect(await moveItem(fs, 'Home/Tasks.tasks.json', 'Work')).toBe('Work/Tasks 2.tasks.json');
    expect(await moveItem(fs, 'Work/Tasks.tasks.json', '')).toBe('Tasks 2.tasks.json');
  });

  it('keeps deleted notes and task lists in the trash', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox/a.md', 'keep me');
    await fs.writeText('Work/Sprint.tasks.json', 'and me');
    await trashItem(fs, 'Inbox/a.md', at);
    await trashItem(fs, 'Work/Sprint.tasks.json', at);
    expect(await fs.readText('.scrawl/trash/2026-10-05 143207 a.md')).toBe('keep me');
    expect(await fs.readText('.scrawl/trash/2026-10-05 143207 Sprint.tasks.json')).toBe('and me');
  });

  it('moves a folder to the trash with everything in it', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/plan.md', 'plan');
    await fs.writeText('Work/Sprint.tasks.json', 'tasks');
    await fs.writeText('Work/old/notes.md', 'old');
    await fs.writeText('Work/report.pdf', 'pdf');
    await fs.writeText('Home/keep.md', 'keep');
    await trashFolder(fs, 'Work', at);

    const trash = '.scrawl/trash/2026-10-05 143207 Work';
    expect(await fs.readText(`${trash}/plan.md`)).toBe('plan');
    expect(await fs.readText(`${trash}/Sprint.tasks.json`)).toBe('tasks');
    expect(await fs.readText(`${trash}/old/notes.md`)).toBe('old');
    expect(await fs.readText(`${trash}/report.pdf`)).toBe('pdf');
    expect((await readTree(fs)).map((n) => n.path)).toEqual(['Home']);
  });
});

describe('trash', () => {
  const later = new Date(2026, 9, 5, 15, 0, 0);

  it('takes a record’s lines with it, shows them with it, and brings them back or deletes them with it', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Shop/Orders/o1.md', '---\nid: o1\ncode: SO-0012\n---\n');
    await fs.writeText('Shop/Order lines/l1.md', '---\nid: l1\nname: Oil filter\n---\n');
    await fs.writeText('Shop/Order lines/l2.md', '---\nid: l2\nname: Timing belt\n---\n');
    await fs.writeText('Shop/Order lines/l3.md', '---\nid: l3\nname: Brake pads\n---\n');
    await trashWithFiles(fs, 'Shop/Orders/o1.md', false, () => [], later, { lines: ['Shop/Order lines/l1.md', 'Shop/Order lines/l2.md'] });
    const trash = await readTrash(fs);
    expect(trash.map((item) => [item.from, (item.lines ?? []).map((line) => line.from)])).toEqual([['Shop/Orders/o1.md', ['Shop/Order lines/l1.md', 'Shop/Order lines/l2.md']]]);
    await restoreFromTrash(fs, trash[0]!);
    expect(await fs.stat('Shop/Order lines/l1.md')).not.toBeNull();
    expect(await fs.stat('Shop/Order lines/l2.md')).not.toBeNull();
    expect(await readTrash(fs)).toEqual([]);
    await trashWithFiles(fs, 'Shop/Orders/o1.md', false, () => [], later, { lines: ['Shop/Order lines/l1.md'] });
    await deleteFromTrash(fs, (await readTrash(fs))[0]!);
    expect(await readTrash(fs)).toEqual([]);
    expect(await fs.stat('Shop/Order lines/l1.md')).toBeNull();
    expect(await fs.stat('Shop/Order lines/l3.md')).not.toBeNull();
  });

  it('lists what was deleted, the latest first, with where it was', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/2026-10-05 101010.md', '# Call the bank');
    await fs.writeText('Work/Sprint.tasks.json', serializeTasks(addTask(addTask([], { title: 'a' }), { title: 'b' })));
    await fs.writeText('Old/one.md', '1');
    await fs.writeText('Old/Inner/two.md', '2');
    await fs.mkdir('Old/Empty');
    await trashItem(fs, 'Work/2026-10-05 101010.md', at);
    await trashItem(fs, 'Work/Sprint.tasks.json', at);
    await trashFolder(fs, 'Old', later);

    expect(await readTrash(fs)).toEqual([
      {
        path: '.scrawl/trash/2026-10-05 150000 Old',
        kind: 'folder',
        title: 'Old',
        from: 'Old',
        deleted: later.toISOString(),
        holds: { notes: 2, lists: 0, boards: 0, keys: 0, collections: 0, folders: 2 },
      },
      {
        path: '.scrawl/trash/2026-10-05 143207 2026-10-05 101010.md',
        kind: 'note',
        title: 'Call the bank',
        from: 'Work/2026-10-05 101010.md',
        deleted: at.toISOString(),
      },
      {
        path: '.scrawl/trash/2026-10-05 143207 Sprint.tasks.json',
        kind: 'tasks',
        title: 'Sprint',
        from: 'Work/Sprint.tasks.json',
        deleted: at.toISOString(),
        tasks: 2,
      },
    ]);
  });

  it('lists a deleted board with how many cards it has, and a folder with its boards', async () => {
    const fs = new MemoryFs();
    const path = await createBoard(fs, 'Work', 'Roadmap', 'software');
    await saveBoard(fs, path, addCard(await loadBoard(fs, path), { title: 'One' }));
    await trashItem(fs, path, at);
    const [item] = await readTrash(fs);
    expect(item).toMatchObject({ kind: 'board', title: 'Roadmap', from: path, cards: 1 });
    expect(await restoreFromTrash(fs, item!)).toBe(path);
    await createBoard(fs, 'Work/sub', 'B', 'simple');
    await trashFolder(fs, 'Work', at);
    expect((await readTrash(fs))[0]).toMatchObject({ kind: 'folder', holds: { notes: 0, lists: 0, boards: 2, keys: 0, folders: 1 } });
  });

  it('never lets two deletions in the same second clash', async () => {
    const fs = new MemoryFs();
    await fs.writeText('A/plan.md', 'a');
    await fs.writeText('B/plan.md', 'b');
    await trashItem(fs, 'A/plan.md', at);
    await trashItem(fs, 'B/plan.md', at);
    expect((await readTrash(fs)).map((i) => [i.path, i.from])).toEqual([
      ['.scrawl/trash/2026-10-05 143207 plan.md', 'A/plan.md'],
      ['.scrawl/trash/2026-10-05 143207 plan 2.md', 'B/plan.md'],
    ]);
  });

  it('restores an item where it was, numbering it when the name is taken', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/plan.md', 'old');
    await trashItem(fs, 'Work/plan.md', at);
    await fs.writeText('Work/plan.md', 'new');
    const [item] = await readTrash(fs);
    expect(await restoreFromTrash(fs, item!)).toBe('Work/plan 2.md');
    expect(await fs.readText('Work/plan 2.md')).toBe('old');
    expect(await readTrash(fs)).toEqual([]);
  });

  it('restores a folder with everything in it, even when its place is gone', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/Old/one.md', '1');
    await fs.mkdir('Work/Old/Empty');
    await trashFolder(fs, 'Work/Old', at);
    await fs.remove('Work');
    const [item] = await readTrash(fs);
    expect(await restoreFromTrash(fs, item!)).toBe('Work/Old');
    expect(await fs.readText('Work/Old/one.md')).toBe('1');
    expect((await fs.list('Work/Old')).map((e) => e.name).sort()).toEqual(['Empty', 'one.md']);
  });

  it('sends items deleted before the trash kept an index back to the top of the space', async () => {
    const fs = new MemoryFs();
    await fs.writeText('.scrawl/trash/2026-10-01 090000 Grocery list.md', 'milk');
    const [item] = await readTrash(fs);
    expect(item).toMatchObject({ title: 'Grocery list', from: 'Grocery list.md' });
    expect(item!.deleted).toBe(new Date(2026, 9, 1, 9, 0, 0).toISOString());
    expect(await restoreFromTrash(fs, item!)).toBe('Grocery list.md');
  });

  it('deletes one item or everything for good', async () => {
    const fs = new MemoryFs();
    await fs.writeText('a.md', 'a');
    await fs.writeText('b.md', 'b');
    await trashItem(fs, 'a.md', at);
    await trashItem(fs, 'b.md', later);
    const [b] = await readTrash(fs);
    await deleteFromTrash(fs, b!);
    expect((await readTrash(fs)).map((i) => i.title)).toEqual(['a']);
    await emptyTrash(fs);
    expect(await readTrash(fs)).toEqual([]);
    expect(await fs.list('.scrawl/trash')).toEqual([]);
  });
});

describe('unused attachments', () => {
  const later = new Date(2026, 9, 6, 9, 30, 0);
  const files = async (fs: MemoryFs) => (await fs.list('_attachments')).map((e) => e.name).sort();

  it('go to the trash with the note, list, board or folder that used them, and come back with it', async () => {
    const fs = new MemoryFs();
    for (const name of ['photo.png', 'Scope v3 (final).pdf', 'shared.png', 'open.png', 'list.pdf', 'deep.png', 'loose.pdf']) {
      await fs.writeText(`_attachments/${name}`, 'data');
    }
    await fs.writeText('Work/call.md', '![](_attachments/photo.png)\n[Scope v3 \\(final\\)](_attachments/Scope%20v3%20%28final%29.pdf) ![](_attachments/shared.png) ![](_attachments/open.png)');
    await fs.writeText('Work/other.md', '![](_attachments/shared.png)');
    await fs.writeText('Work/Sprint.tasks.json', '{"tasks":[{"id":"1","title":"Read [it](_attachments/list.pdf)"}]}');
    await fs.writeText('Old/deep/note.md', '![](_attachments/deep.png)');
    // Another note uses one, and one is in a note not written yet: those stay.
    const unsaved = () => ['![](_attachments/open.png)'];
    expect(await trashWithFiles(fs, 'Work/call.md', false, unsaved, at)).toEqual(['_attachments/photo.png', '_attachments/Scope v3 (final).pdf']);
    expect(await trashWithFiles(fs, 'Work/Sprint.tasks.json', false, () => [], at)).toEqual(['_attachments/list.pdf']);
    expect(await trashWithFiles(fs, 'Old', true, () => [], at)).toEqual(['_attachments/deep.png']);
    // A file nothing ever used, put in Files, stays where it is.
    expect(await files(fs)).toEqual(['loose.pdf', 'open.png', 'shared.png']);

    // Each comes back with what used it.
    for (const kind of ['note', 'tasks', 'folder'] as const) await restoreFromTrash(fs, (await readTrash(fs)).find((i) => i.kind === kind)!);
    expect(await files(fs)).toEqual(['Scope v3 (final).pdf', 'deep.png', 'list.pdf', 'loose.pdf', 'open.png', 'photo.png', 'shared.png']);
    expect(await readTrash(fs)).toEqual([]);
  });

  it('are deleted for good from the trash with the item they went with, unless something else uses them', async () => {
    const fs = new MemoryFs();
    for (const name of ['mine.png', 'kept.png']) await fs.writeText(`_attachments/${name}`, 'x');
    await fs.writeText('Work/a.md', '![](_attachments/mine.png) ![](_attachments/kept.png)');
    await fs.writeText('Work/b.md', '![](_attachments/kept.png)');
    await trashWithFiles(fs, 'Work/a.md', false, () => [], at);
    // b goes later, kept.png with it; a deleted for good does not take kept.png, which b in the trash uses.
    await trashWithFiles(fs, 'Work/b.md', false, () => [], later);
    const a = (await readTrash(fs)).find((i) => i.from === 'Work/a.md')!;
    await deleteFromTrash(fs, a);
    expect((await readTrash(fs)).map((i) => i.title).sort()).toEqual(['b', 'kept.png']);
  });

  it('come back with an old version or a note from the trash that links to them', async () => {
    const fs = new MemoryFs();
    await fs.writeText('_attachments/a.png', 'a');
    await fs.writeText('_attachments/b.png', 'b');
    expect(await trashUnlinked(fs, ['_attachments/a.png', '_attachments/b.png'], () => [], at)).toHaveLength(2);
    expect(await files(fs)).toEqual([]);

    // An old version of a note is restored from its history.
    expect(await restoreAttachments(fs, ['![](_attachments/b.png)'])).toEqual(['_attachments/b.png']);
    expect(await files(fs)).toEqual(['b.png']);

    // A note in the trash whose file went meanwhile, as another device may leave it.
    await fs.writeText('Work/call.md', '![](_attachments/a.png)');
    await trashItem(fs, 'Work/call.md', later);
    const note = (await readTrash(fs)).find((i) => i.kind === 'note')!;
    expect(await restoreFromTrash(fs, note)).toBe('Work/call.md');
    expect(await files(fs)).toEqual(['a.png', 'b.png']);
    expect(await readTrash(fs)).toEqual([]);
  });

  it('go to the trash as soon as a note stops linking to them, unless another note links to them', async () => {
    const fs = new MemoryFs();
    for (const name of ['mine.png', 'shared.png', 'open.png', 'other.png']) await fs.writeText(`_attachments/${name}`, 'x');
    await fs.writeText('Work/a.md', 'nothing left');
    await fs.writeText('Work/b.md', '![](_attachments/shared.png)');
    const unsaved = () => ['![](_attachments/open.png)'];
    const paths = ['_attachments/mine.png', '_attachments/shared.png', '_attachments/open.png', '_attachments/gone.png'];
    expect(await trashUnlinked(fs, paths, unsaved, at)).toEqual(['_attachments/mine.png']);
    expect(await files(fs)).toEqual(['open.png', 'other.png', 'shared.png']);
    expect((await readTrash(fs)).map((i) => i.title)).toEqual(['mine.png']);
  });

  it('do not come back over another file that took their name', async () => {
    const fs = new MemoryFs();
    await fs.writeText('_attachments/scope.pdf', 'old');
    await trashUnlinked(fs, ['_attachments/scope.pdf'], () => [], at);
    await fs.writeText('_attachments/scope.pdf', 'new');
    expect(await restoreAttachments(fs, ['[scope](_attachments/scope.pdf)'])).toEqual([]);
    expect(await fs.readText('_attachments/scope.pdf')).toBe('new');
  });

  it('are deleted for good with the note that was the only one to link to them', async () => {
    const fs = new MemoryFs();
    for (const name of ['mine.png', 'shared.png', 'open.png']) await fs.writeText(`_attachments/${name}`, 'x');
    await fs.writeText('Work/a.md', '![](_attachments/mine.png) ![](_attachments/shared.png) ![](_attachments/open.png)');
    await fs.writeText('Work/b.md', '![](_attachments/shared.png)');
    await trashItem(fs, 'Work/a.md', at);
    const [note] = await readTrash(fs);
    await deleteFromTrash(fs, note!, ['![](_attachments/open.png)']);
    expect(await files(fs)).toEqual(['open.png', 'shared.png']);

    await fs.writeText('Work/c.md', '![](_attachments/open.png)');
    await trashFolder(fs, 'Work', later);
    await emptyTrash(fs);
    expect(await files(fs)).toEqual([]);
  });
});

describe('attachments, folders and the workspace', () => {
  it('stores attachments under a time-based path without spaces', async () => {
    const fs = new MemoryFs();
    const image = new Blob(['x'], { type: 'image/png' });
    expect(await saveAttachment(fs, image, at)).toBe('_attachments/2026-10-05-143207.png');
    expect(await saveAttachment(fs, image, at)).toBe('_attachments/2026-10-05-143207-2.png');
  });

  it('stores other files under their own name, and a recording as .webm', async () => {
    const fs = new MemoryFs();
    const pdf = new File(['%PDF'], 'Scope: v3.pdf', { type: 'application/pdf' });
    expect(await saveFile(fs, pdf)).toBe('_attachments/Scope v3.pdf');
    expect(await saveFile(fs, pdf)).toBe('_attachments/Scope v3 2.pdf');
    expect(await saveFile(fs, new File(['x'], '.env'))).toBe('_attachments/file .env');
    expect((await fs.list('_attachments')).find((e) => e.name === 'Scope v3.pdf')?.size).toBe(4);
    const voice = new Blob(['ogg'], { type: 'audio/webm;codecs=opus' });
    expect(await saveAttachment(fs, voice, at)).toBe('_attachments/2026-10-05-143207.webm');
  });

  it('copies a large file in parts, telling how far it got', async () => {
    const fs = new MemoryFs();
    const big = new File([new Uint8Array(PART_SIZE * 2 + 10)], 'big.bin');
    const progress: number[] = [];
    const path = await saveFile(fs, big, { onProgress: (written) => progress.push(written) });
    expect(progress).toEqual([PART_SIZE, PART_SIZE * 2, PART_SIZE * 2 + 10]);
    expect((await fs.readBlob(path)).size).toBe(big.size);
  });

  it('leaves nothing when a copy is stopped, and keeps a name taken while it is copied', async () => {
    const fs = new MemoryFs();
    const big = new File([new Uint8Array(PART_SIZE * 3)], 'big.bin');
    const stop = new AbortController();
    const first = saveFile(fs, big, { signal: stop.signal, onProgress: () => stop.abort() });
    // Started while the first is still being written, the second gets a name of its own.
    const second = saveFile(fs, new File(['x'], 'big.bin'));
    await expect(first).rejects.toThrow();
    expect(await second).toBe('_attachments/big 2.bin');
    expect((await fs.list('_attachments')).map((e) => e.name)).toEqual(['big 2.bin']);
  });

  it('rejects folder names that would be hidden', async () => {
    await expect(createFolder(new MemoryFs(), '.git')).rejects.toThrow();
    expect(await createFolder(new MemoryFs(), ' Work/Notes ')).toBe('Work∕Notes');
  });

  it('makes a folder inside another, as deep as wanted', async () => {
    const fs = new MemoryFs();
    await createFolder(fs, 'Scrawl');
    expect(await createFolder(fs, 'Clients', 'Scrawl')).toBe('Scrawl/Clients');
    expect(await createFolder(fs, 'Acme', 'Scrawl/Clients')).toBe('Scrawl/Clients/Acme');
    const tree = await readTree(fs);
    expect(tree[0]!.children![0]).toMatchObject({ path: 'Scrawl/Clients', kind: 'folder', children: [{ path: 'Scrawl/Clients/Acme', kind: 'folder' }] });
    await expect(createFolder(fs, '_assets', 'Scrawl')).rejects.toThrow();
  });

  it('round-trips the workspace and survives a missing or broken file', async () => {
    const fs = new MemoryFs();
    expect(await loadWorkspace(fs)).toEqual({ tabs: [], active: null, boards: {}, keys: {}, collections: {} });
    const boards = { 'Scrawl/Roadmap.board.json': { view: 'list' as const, phase: null }, 'Home/Renovation.board.json': { view: 'board' as const, phase: 'p2' }, 'Work/Plan.board.json': { view: 'list' as const }, 'Work/Issues.board.json': { view: 'board' as const, phase: '' } };
    const keys = { 'Scrawl/Production.env': { view: 'text' as const } };
    const collections = { 'Work/Companies': { view: null, sort: { key: 'status', dir: 'desc' as const }, group: 'status', columns: ['name', 'status'] } };
    await saveWorkspace(fs, { tabs: ['Inbox/a.md'], active: 'Inbox/a.md', boards, keys, collections });
    expect(await loadWorkspace(fs)).toEqual({ tabs: ['Inbox/a.md'], active: 'Inbox/a.md', boards, keys, collections });
    // A workspace written before boards and keys files were remembered still opens.
    await fs.writeText('.scrawl/workspace.json', '{"tabs":["Inbox/a.md"],"active":null}');
    expect(await loadWorkspace(fs)).toEqual({ tabs: ['Inbox/a.md'], active: null, boards: {}, keys: {}, collections: {} });
    await fs.writeText('.scrawl/workspace.json', 'not json');
    expect(await loadWorkspace(fs)).toEqual({ tabs: [], active: null, boards: {}, keys: {}, collections: {} });
  });

  it('keeps what a list is filtered by, not the text it was searched for nor a filter that asks nothing', async () => {
    const fs = new MemoryFs();
    const empty = { tabs: [], active: null, boards: {}, keys: {}, collections: {} };
    await saveWorkspace(fs, {
      ...empty,
      lists: {
        'Scrawl/Tasks.tasks.json': { filter: { due: 'any', priorities: [1], text: 'crash', labels: ['bug'] } },
        'Home/Chores.tasks.json': { filter: { due: 'any', priorities: [], text: 'only text' } },
      },
      labelLooks: { '@sp-acme/bug': { due: 'overdue', priorities: [], text: 'crash' }, waiting: { due: 'any', priorities: [], text: '' } },
    });
    expect(await loadWorkspace(fs)).toEqual({
      ...empty,
      lists: { 'Scrawl/Tasks.tasks.json': { filter: { due: 'any', priorities: [1], text: '', labels: ['bug'] } } },
      labelLooks: { '@sp-acme/bug': { due: 'overdue', priorities: [], text: '' } },
    });
  });

  it('keeps what a board is filtered by with how it is looked at', async () => {
    const fs = new MemoryFs();
    const empty = { tabs: [], active: null, keys: {}, collections: {} };
    const fields = [{ field: 'estimate', op: 'gt' as const, value: 3 }];
    await saveWorkspace(fs, {
      ...empty,
      boards: {
        'Scrawl/Roadmap.board.json': { view: 'list', filter: { due: 'any', priorities: [], text: 'csv', labels: ['board'], fields } },
        'Home/Plan.board.json': { view: 'board', filter: { due: 'any', priorities: [], text: 'only text' } },
      },
    });
    expect((await loadWorkspace(fs)).boards).toEqual({
      'Scrawl/Roadmap.board.json': { view: 'list', filter: { due: 'any', priorities: [], text: '', labels: ['board'], fields } },
      'Home/Plan.board.json': { view: 'board' },
    });
  });

  it('keeps the onboarding note on the device until it is closed', async () => {
    const fs = new MemoryFs();
    await fs.writeText(WELCOME_NOTE, '# Welcome to Scrawl\n');
    // It is not synced, and not in the tree.
    expect(isSynced(WELCOME_NOTE)).toBe(false);
    expect((await readTree(fs)).map((node) => node.path)).toEqual([]);
    // Closed, the workspace says so; a workspace from before the note says nothing, so it opens.
    expect((await loadWorkspace(fs)).welcomeClosed).toBeUndefined();
    await saveWorkspace(fs, { tabs: [], active: null, boards: {}, keys: {}, collections: {}, welcomeClosed: true });
    expect((await loadWorkspace(fs)).welcomeClosed).toBe(true);
  });
});

describe('collections in the vault', () => {
  it('lists a folder with a schema file as one item, and keeps it whole through the trash', async () => {
    const { createCollection } = await import('./collection');
    const fs = new MemoryFs();
    await fs.writeText('Work/plan.md', 'plan');
    const dir = await createCollection(fs, 'Work', 'Companies', 'companies');
    await fs.writeText(`${dir}/Acme.md`, '---\nid: a\nname: Acme\n---\n');
    await fs.writeText(`${dir}/_draft.md`, 'hidden');
    const tree = await readTree(fs);
    const work = tree.find((node) => node.path === 'Work');
    expect(work?.children?.map((node) => [node.kind, node.title ?? node.name])).toEqual([
      ['collection', 'Companies'],
      ['note', 'plan'],
    ]);
    expect(work?.children?.[0]?.children).toBeUndefined();

    await trashFolder(fs, dir, at);
    const [item] = await readTrash(fs);
    expect(item).toMatchObject({ kind: 'collection', title: 'Companies', from: dir, records: 1 });
    expect(await restoreFromTrash(fs, item!)).toBe(dir);
    expect((await fs.list(dir)).map((e) => e.name).sort()).toEqual(['Acme.md', '_collection.json', '_draft.md']);
    expect((await readTree(fs)).find((node) => node.path === 'Work')?.children?.[0]?.kind).toBe('collection');
  });
});

describe('between spaces', () => {
  it('copies a note with the files it links to, under a free name, relinked where a name was taken', async () => {
    const { copyToSpace } = await import('./vault');
    const from = new MemoryFs();
    const to = new MemoryFs();
    await from.writeText('_attachments/2026-10-13-101500.png', 'picture');
    await from.writeText('_attachments/Scope v3.pdf', 'scope');
    await from.writeText('_attachments/unused.png', 'other');
    await from.writeText('Sales/Pilot plan.md', '# Pilot\n\n![](_attachments/2026-10-13-101500.png)\n[Scope](_attachments/Scope%20v3.pdf)\n');
    await to.writeText('_attachments/Scope v3.pdf', 'someone else’s scope');
    await to.writeText('Clients/Pilot plan.md', 'there already');
    const path = await copyToSpace(from, 'Sales/Pilot plan.md', to, 'Clients');
    expect(path).toBe('Clients/Pilot plan 2.md');
    expect(await to.readText('_attachments/2026-10-13-101500.png')).toBe('picture');
    expect(await to.readText('_attachments/Scope v3 2.pdf')).toBe('scope');
    expect(await to.readText('_attachments/Scope v3.pdf')).toBe('someone else’s scope');
    expect(await to.stat('_attachments/unused.png')).toBeNull();
    expect(await to.readText(path)).toBe('# Pilot\n\n![](_attachments/2026-10-13-101500.png)\n[Scope](_attachments/Scope%20v3%202.pdf)\n');
    // The original stays, for the move to put in its own trash.
    expect(await from.readText('Sales/Pilot plan.md')).toContain('# Pilot');
  });

  it('copies from a disk that says listing a file is wrong, as Windows does', async () => {
    const { copyToSpace } = await import('./vault');
    const { createCollection } = await import('./collection');
    class Disk extends MemoryFs {
      override async list(dir: string) {
        if (await this.stat(dir)) throw new Error('The directory name is invalid. (os error 267)');
        return super.list(dir);
      }
    }
    const from = new Disk();
    const to = new MemoryFs();
    await from.writeText('Memduh Ev.md', 'A blok 5 numara');
    const dir = await createCollection(from, '', 'Companies', 'companies');
    expect(await copyToSpace(from, 'Memduh Ev.md', to, 'Homes')).toBe('Homes/Memduh Ev.md');
    expect(await to.readText('Homes/Memduh Ev.md')).toBe('A blok 5 numara');
    expect(await copyToSpace(from, dir, to, '')).toBe('Companies');
    expect((await to.list('Companies')).map((e) => e.name)).toContain('_collection.json');
  });

  it('leaves out what a task list or a board says about items of the space it came from', async () => {
    const { copyToSpace } = await import('./vault');
    const from = new MemoryFs();
    const to = new MemoryFs();
    const tasks = addTask([], { title: 'Call', note: 'Sales/Pilot plan.md', record: { collection: 'Companies', id: 'a', name: 'Acme' }, assignee: { id: 'p1', name: 'Lena' } }, () => at, 't');
    await from.writeText('Sales/Tasks.tasks.json', serializeTasks(tasks));
    let board = (await import('./board')).newBoard('Deals', 'crm');
    board = addCard(board, { title: 'Pilot', note: 'Sales/Pilot plan.md' }, () => at, 'Kaan', 'c');
    await saveBoard(from, 'Sales/Deals.board.json', board);
    await copyToSpace(from, 'Sales/Tasks.tasks.json', to, '');
    await copyToSpace(from, 'Sales/Deals.board.json', to, 'Pipeline');
    const [task] = await loadTasks(to, 'Tasks.tasks.json');
    expect(task).toMatchObject({ title: 'Call', assignee: { id: 'p1', name: 'Lena' } });
    expect(task).not.toHaveProperty('note');
    expect(task).not.toHaveProperty('record');
    const copied = await loadBoard(to, 'Pipeline/Deals.board.json');
    expect(copied.cards[0]).not.toHaveProperty('note');
    // A field still reads the collection it did, a folder of whichever space the board is in.
    expect(copied.fields?.find((field) => field.type === 'link')?.collection).toBe(board.fields?.find((field) => field.type === 'link')?.collection);
  });

  it('copies a collection whole, its schema and its records', async () => {
    const { copyToSpace } = await import('./vault');
    const { createCollection } = await import('./collection');
    const from = new MemoryFs();
    const to = new MemoryFs();
    const dir = await createCollection(from, 'Sales', 'Companies', 'companies');
    await from.writeText(`${dir}/a1.md`, '---\nid: a1\nname: Acme\n---\n');
    expect(await copyToSpace(from, dir, to, 'CRM')).toBe('CRM/Companies');
    expect((await to.list('CRM/Companies')).map((e) => e.name).sort()).toEqual(['_collection.json', 'a1.md']);
    expect(await to.readText('CRM/Companies/_collection.json')).toBe(await from.readText(`${dir}/_collection.json`));
  });

  it('copies a folder with everything in it, its links kept among what goes along', async () => {
    const { copyToSpace } = await import('./vault');
    const { createCollection, loadSchema } = await import('./collection');
    const from = new MemoryFs();
    const to = new MemoryFs();
    await from.writeText('_attachments/plan.png', 'picture');
    await from.writeText('Sales/Pilot plan.md', '# Pilot\n\n![](../_attachments/plan.png)\n[Notes](Deals/Notes.md)\n');
    await from.writeText('Sales/Deals/Notes.md', 'notes');
    await from.writeText('Elsewhere.md', 'not in it');
    await from.mkdir('Sales/Empty');
    const people = await createCollection(from, 'Sales', 'People', 'people');
    const companies = await createCollection(from, 'Sales', 'Companies', 'companies');
    const tasks = addTask(
      addTask([], { title: 'Call', note: 'Sales/Pilot plan.md', card: 'Sales/Deals.board.json#c', record: { collection: companies, id: 'a', name: 'Acme' } }, () => at, 't1'),
      { title: 'Read', note: 'Elsewhere.md', record: { collection: 'Other/Companies', id: 'b', name: 'Beta' } },
      () => at,
      't2',
    );
    await from.writeText('Sales/Tasks.tasks.json', serializeTasks(tasks));
    let board = (await import('./board')).newBoard('Deals', 'crm', undefined, { company: companies, contact: 'Other/People' });
    board = addCard(board, { title: 'Pilot', note: 'Sales/Pilot plan.md' }, () => at, 'Kaan', 'c');
    board = addCard(board, { title: 'Other', note: 'Elsewhere.md' }, () => at, 'Kaan', 'd');
    await saveBoard(from, 'Sales/Deals.board.json', board);
    await to.writeText('Clients/Sales/old.md', 'there already');

    expect(await copyToSpace(from, 'Sales', to, 'Clients')).toBe('Clients/Sales 2');
    expect(await to.readText('Clients/Sales 2/Pilot plan.md')).toBe(await from.readText('Sales/Pilot plan.md'));
    expect(await to.readText('Clients/Sales 2/Deals/Notes.md')).toBe('notes');
    expect(await to.readText('_attachments/plan.png')).toBe('picture');
    expect((await to.list('Clients/Sales 2')).find((e) => e.name === 'Empty')?.kind).toBe('dir');
    expect(await to.stat('Elsewhere.md')).toBeNull();
    // What points inside the folder points at the copy; what points out of it is left out.
    const [call, read] = await loadTasks(to, 'Clients/Sales 2/Tasks.tasks.json');
    expect(call).toMatchObject({ note: 'Clients/Sales 2/Pilot plan.md', card: 'Clients/Sales 2/Deals.board.json#c', record: { collection: 'Clients/Sales 2/Companies', id: 'a' } });
    expect(read).not.toHaveProperty('note');
    expect(read).not.toHaveProperty('record');
    const copied = await loadBoard(to, 'Clients/Sales 2/Deals.board.json');
    expect(copied.cards.map((card) => card.note)).toEqual(['Clients/Sales 2/Pilot plan.md', undefined]);
    expect(copied.fields?.filter((field) => field.type === 'link').map((field) => field.type === 'link' && field.collection)).toEqual(['Clients/Sales 2/Companies', 'Other/People']);
    // A collection's link to one that goes along points at it there.
    const schema = await loadSchema(to, 'Clients/Sales 2/People');
    expect(schema.fields.filter((field) => field.type === 'link').map((field) => field.type === 'link' && field.collection)).toEqual(['Clients/Sales 2/Companies']);
    expect(JSON.stringify(await loadSchema(to, 'Clients/Sales 2/Companies'))).not.toContain(`"${people}"`);
  });
});

describe('moving folders', () => {
  it('moves a folder with everything in it, empty folders too, numbered where its name is taken', async () => {
    const { moveFolder } = await import('./vault');
    const fs = new MemoryFs();
    await fs.writeText('Work/Plan.md', 'plan');
    await fs.writeText('Work/Deep/Tasks.tasks.json', serializeTasks([]));
    await fs.mkdir('Work/Empty');
    await fs.writeText('Archive/Work/old.md', 'there already');
    expect(await moveFolder(fs, 'Work', 'Archive')).toBe('Archive/Work 2');
    expect(await fs.readText('Archive/Work 2/Plan.md')).toBe('plan');
    expect(await fs.stat('Archive/Work 2/Deep/Tasks.tasks.json')).not.toBeNull();
    expect((await fs.list('Archive/Work 2')).find((e) => e.name === 'Empty')?.kind).toBe('dir');
    expect((await fs.list('')).map((e) => e.name)).not.toContain('Work');
    // To the top of the space, and where it already is.
    expect(await moveFolder(fs, 'Archive/Work 2', '')).toBe('Work 2');
    expect(await moveFolder(fs, 'Work 2', '')).toBe('Work 2');
  });

  it('does not move a folder into itself or a folder inside it', async () => {
    const { moveFolder } = await import('./vault');
    const fs = new MemoryFs();
    await fs.writeText('Work/Deep/Plan.md', 'plan');
    await expect(moveFolder(fs, 'Work', 'Work')).rejects.toThrow();
    await expect(moveFolder(fs, 'Work', 'Work/Deep')).rejects.toThrow();
    expect(await fs.readText('Work/Deep/Plan.md')).toBe('plan');
    // A folder whose name only starts the same is another folder.
    await fs.mkdir('Workshop');
    expect(await moveFolder(fs, 'Work', 'Workshop')).toBe('Workshop/Work');
  });

  it('renames a folder where it is, its case alone too, numbered where the name is taken', async () => {
    const { renameFolder } = await import('./vault');
    const fs = new MemoryFs();
    await fs.writeText('Clients/Acme/Plan.md', 'plan');
    await fs.mkdir('Clients/Beta');
    expect(await renameFolder(fs, 'Clients/Acme', 'Beta')).toBe('Clients/Beta 2');
    expect(await fs.readText('Clients/Beta 2/Plan.md')).toBe('plan');
    expect(await renameFolder(fs, 'Clients/Beta 2', 'beta 2')).toBe('Clients/beta 2');
    expect(await fs.readText('Clients/beta 2/Plan.md')).toBe('plan');
    await expect(renameFolder(fs, 'Clients/beta 2', '  ')).rejects.toThrow();
    await expect(renameFolder(fs, 'Clients/beta 2', '.hidden')).rejects.toThrow();
  });
});
