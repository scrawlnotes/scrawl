import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import {
  createFolder,
  createScratchNote,
  displayTitle,
  loadWorkspace,
  moveNote,
  readTree,
  renameNote,
  saveAttachment,
  saveWorkspace,
  titleOf,
  trashNote,
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

  it('lists the inbox first, then folders, then notes, and skips app folders', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox/a.md', 'first idea');
    await fs.writeText('Work/plan.md', '# Plan');
    await fs.writeText('loose.md', 'loose note');
    await fs.writeText('.scrawl/workspace.json', '{}');
    await fs.writeText('_attachments/x.png', '');
    await fs.writeText('Work/data.json', '{}');
    await fs.mkdir('Empty');

    const tree = await readTree(fs);
    expect(tree.map((n) => n.path)).toEqual(['Inbox', 'Empty', 'Work', 'loose.md']);
    expect(tree[2]!.children).toEqual([{ name: 'plan.md', path: 'Work/plan.md', kind: 'note', title: 'plan' }]);
  });

  it('shows an unnamed note by its first line and a named note by its file name', () => {
    expect(displayTitle('Inbox/2026-10-05 143207.md', '# Call the dentist')).toBe('Call the dentist');
    expect(displayTitle('Work/2026-10-05 143207 2.md', 'moved but still unnamed')).toBe('moved but still unnamed');
    expect(displayTitle('Work/Meeting notes.md', '# Something else')).toBe('Meeting notes');
  });

  it('creates a scratch note in a given folder', async () => {
    expect(await createScratchNote(new MemoryFs(), at, 'Work')).toBe('Work/2026-10-05 143207.md');
  });

  it('renames a note within its folder', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Work/2026-10-05 143207.md', 'text');
    await fs.writeText('Work/Plan.md', 'other');
    expect(await renameNote(fs, 'Work/2026-10-05 143207.md', 'Road/map?')).toBe('Work/Road map.md');
    expect(await renameNote(fs, 'Work/Road map.md', 'Plan')).toBe('Work/Plan 2.md');
    expect(await renameNote(fs, 'Work/Plan.md', 'Plan.md')).toBe('Work/Plan.md');
    await expect(renameNote(fs, 'Work/Plan.md', '  ')).rejects.toThrow();
  });

  it('moves a note into a folder, numbering it when the name is taken', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox/a.md', 'one');
    await fs.writeText('Work/a.md', 'two');
    expect(await moveNote(fs, 'Inbox/a.md', 'Work')).toBe('Work/a 2.md');
    expect(await fs.readText('Work/a 2.md')).toBe('one');
    expect(await fs.list('Inbox')).toEqual([]);
  });

  it('keeps deleted notes in the trash', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox/a.md', 'keep me');
    await trashNote(fs, 'Inbox/a.md', at);
    expect(await fs.readText('.scrawl/trash/2026-10-05 143207 a.md')).toBe('keep me');
  });

  it('stores attachments under a time-based path without spaces', async () => {
    const fs = new MemoryFs();
    const image = new Blob(['x'], { type: 'image/png' });
    expect(await saveAttachment(fs, image, at)).toBe('_attachments/2026-10-05-143207.png');
    expect(await saveAttachment(fs, image, at)).toBe('_attachments/2026-10-05-143207-2.png');
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
