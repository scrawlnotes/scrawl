import { describe, expect, it } from 'vitest';
import { MemoryFs, PART_SIZE } from './fs';
import { addTask, loadTasks, serializeTasks } from './tasks';
import {
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
  readTree,
  renameItem,
  restoreFromTrash,
  saveAttachment,
  saveFile,
  saveWorkspace,
  titleOf,
  trashFolder,
  trashItem,
} from './vault';

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

describe('vault', () => {
  it('creates scratch notes in the inbox without name clashes', async () => {
    const fs = new MemoryFs();
    expect(await createScratchNote(fs, at)).toBe('Inbox/2026-10-05 143207.md');
    expect(await createScratchNote(fs, at)).toBe('Inbox/2026-10-05 143207 2.md');
  });

  it('lists the inbox first, then task lists, folders and notes, and skips app folders', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox/a.md', 'first idea');
    await fs.writeText('Inbox/tasks.json', '{}');
    await fs.writeText('Work/plan.md', '# Plan');
    await fs.writeText('Work/Sprint.tasks.json', '{}');
    await fs.writeText('loose.md', 'loose note');
    await fs.writeText('.scrawl/workspace.json', '{}');
    await fs.writeText('_attachments/x.png', '');
    await fs.writeText('Work/data.json', '{}');
    await fs.mkdir('Empty');

    const tree = await readTree(fs);
    expect(tree.map((n) => n.path)).toEqual(['Inbox', 'Empty', 'Work', 'loose.md']);
    // The inbox's own list is not an item of the tree; the interface always shows it.
    expect(tree[0]!.children!.map((n) => n.path)).toEqual(['Inbox/a.md']);
    expect(tree[2]!.children).toEqual([
      { name: 'Sprint.tasks.json', path: 'Work/Sprint.tasks.json', kind: 'tasks', title: 'Sprint' },
      { name: 'plan.md', path: 'Work/plan.md', kind: 'note', title: 'plan' },
    ]);
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

  it("keeps the name Tasks for the inbox's own list", async () => {
    const fs = new MemoryFs();
    expect(listName(INBOX_TASKS)).toBe('Tasks');
    expect(await createTaskList(fs, 'Inbox', '')).toBe('Inbox/Tasks 2.tasks.json');
    expect(listName('Inbox/Tasks 2.tasks.json')).toBe('Tasks 2');
  });

  it('renames a note within its folder', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/2026-10-05 143207.md', 'text');
    await fs.writeText('Work/Plan.md', 'other');
    expect(await renameItem(fs, 'Work/2026-10-05 143207.md', 'Road/map?')).toBe('Work/Road map.md');
    expect(await renameItem(fs, 'Work/Road map.md', 'Plan')).toBe('Work/Plan 2.md');
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
    expect(await moveItem(fs, 'Home/Tasks.tasks.json', 'Work')).toBe('Work/Tasks 2.tasks.json');
    expect(await moveItem(fs, 'Work/Tasks.tasks.json', 'Inbox')).toBe('Inbox/Tasks 2.tasks.json');
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
        holds: { notes: 2, lists: 0, folders: 2 },
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

  it('sends items deleted before the trash kept an index to the inbox', async () => {
    const fs = new MemoryFs();
    await fs.writeText('.scrawl/trash/2026-10-01 090000 Grocery list.md', 'milk');
    const [item] = await readTrash(fs);
    expect(item).toMatchObject({ title: 'Grocery list', from: 'Inbox/Grocery list.md' });
    expect(item!.deleted).toBe(new Date(2026, 9, 1, 9, 0, 0).toISOString());
    expect(await restoreFromTrash(fs, item!)).toBe('Inbox/Grocery list.md');
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
    expect(await createFolder(new MemoryFs(), ' Work/Notes ')).toBe('Work Notes');
  });

  it('round-trips the workspace and survives a missing or broken file', async () => {
    const fs = new MemoryFs();
    expect(await loadWorkspace(fs)).toEqual({ tabs: [], active: null });
    await saveWorkspace(fs, { tabs: ['Inbox/a.md'], active: 'Inbox/a.md' });
    expect(await loadWorkspace(fs)).toEqual({ tabs: ['Inbox/a.md'], active: 'Inbox/a.md' });
    await fs.writeText('.scrawl/workspace.json', 'not json');
    expect(await loadWorkspace(fs)).toEqual({ tabs: [], active: null });
  });
});
