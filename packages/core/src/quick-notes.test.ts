import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import {
  addQuickNote,
  dropQuickNote,
  isQuickNote,
  joinQuickNote,
  loadQuickOrder,
  orderQuickNotes,
  parseQuickOrder,
  pinQuickNote,
  placeQuickNotes,
  quickNotePath,
  saveQuickOrder,
  splitQuickNote,
  splitQuickTree,
} from './quick-notes';
import { displayTitle, type TreeNode } from './vault';

describe('quick notes', () => {
  it('writes the title as the first line, a heading, and reads it back', () => {
    expect(joinQuickNote('Building manager', 'Necati Bey\n0532 000 00 00')).toBe('# Building manager\n\nNecati Bey\n0532 000 00 00');
    expect(splitQuickNote('# Building manager\n\nNecati Bey\n0532 000 00 00')).toEqual({ title: 'Building manager', body: 'Necati Bey\n0532 000 00 00' });
    // Without a title the file is the body alone; a title alone is its line.
    expect(joinQuickNote('  ', 'Gökhan’s flat: C-16')).toBe('Gökhan’s flat: C-16');
    expect(splitQuickNote('Gökhan’s flat: C-16')).toEqual({ title: '', body: 'Gökhan’s flat: C-16' });
    expect(joinQuickNote('Tire pressure', '')).toBe('# Tire pressure');
    expect(splitQuickNote('# Tire pressure')).toEqual({ title: 'Tire pressure', body: '' });
    // Only a heading of the first level is a title.
    expect(splitQuickNote('## Later\nmilk')).toEqual({ title: '', body: '## Later\nmilk' });
  });

  it('keeps what Markdown would read in a title as it was typed', () => {
    const text = joinQuickNote('*Wi-Fi* [office] <5G>', 'body');
    expect(text).toBe('# \\*Wi-Fi\\* \\[office\\] \\<5G\\>\n\nbody');
    expect(splitQuickNote(text).title).toBe('*Wi-Fi* [office] <5G>');
    // The rest of the app names it by its title, as it does any note named by its first line.
    expect(displayTitle('Quick notes/2026-10-24 192301.md', text)).toBe('*Wi-Fi* [office] <5G>');
    expect(displayTitle('Quick notes/2026-10-24 192301.md', 'Ask Lena when the invoice is due')).toBe('Ask Lena when the invoice is due');
  });

  it('takes the folder out of the tree, leaving what else is kept in it', () => {
    const note = (path: string): TreeNode => ({ name: path.split('/').pop()!, path, kind: 'note', title: path });
    const notes = [note('Quick notes/2026-10-24 192301.md'), note('Quick notes/2026-10-22 081455.md')];
    const inbox: TreeNode = { name: 'Inbox.tasks.json', path: 'Inbox.tasks.json', kind: 'tasks' };
    const quick: TreeNode = { name: 'Quick notes', path: 'Quick notes', kind: 'folder', children: notes };
    expect(splitQuickTree([inbox, quick])).toEqual({ tree: [inbox], notes });
    const list: TreeNode = { name: 'Errands.tasks.json', path: 'Quick notes/Errands.tasks.json', kind: 'tasks' };
    expect(splitQuickTree([inbox, { ...quick, children: [list, ...notes] }])).toEqual({ tree: [inbox, { ...quick, children: [list] }], notes });
    // A folder of that name further down is the person's own.
    const deeper: TreeNode = { name: 'Quick notes', path: 'Home/Quick notes', kind: 'folder', children: [note('Home/Quick notes/a.md')] };
    expect(splitQuickTree([deeper])).toEqual({ tree: [deeper], notes: [] });
    expect(isQuickNote('Quick notes/2026-10-24 192301.md')).toBe(true);
    expect(isQuickNote('Home/Quick notes/a.md')).toBe(false);
    expect(isQuickNote('Quick notes/Errands.tasks.json')).toBe(false);
  });

  it('puts them in order by hand, a note not placed yet first, and pinned ones apart', () => {
    const paths = ['Quick notes/2026-10-20 101010.md', 'Quick notes/2026-10-22 081455.md', 'Quick notes/2026-10-24 192301.md', 'Quick notes/2026-10-23 120000.md'];
    const order = { order: ['2026-10-20 101010.md', '2026-10-24 192301.md', '2026-10-22 081455.md'], pinned: ['2026-10-22 081455.md'] };
    expect(orderQuickNotes(paths, order, 'custom')).toEqual({
      pinned: ['Quick notes/2026-10-22 081455.md'],
      others: ['Quick notes/2026-10-23 120000.md', 'Quick notes/2026-10-20 101010.md', 'Quick notes/2026-10-24 192301.md'],
    });
    // By when they were last changed, the latest first; one not known by its name.
    const modified = new Map([
      ['Quick notes/2026-10-20 101010.md', 500],
      ['Quick notes/2026-10-24 192301.md', 100],
      ['Quick notes/2026-10-23 120000.md', 300],
    ]);
    expect(orderQuickNotes(paths, order, 'modified', { modified: (path) => modified.get(path) }).others).toEqual([
      'Quick notes/2026-10-20 101010.md',
      'Quick notes/2026-10-23 120000.md',
      'Quick notes/2026-10-24 192301.md',
    ]);
    expect(orderQuickNotes(paths, order, 'created').others).toEqual(['Quick notes/2026-10-24 192301.md', 'Quick notes/2026-10-23 120000.md', 'Quick notes/2026-10-20 101010.md']);
  });

  it('adds a new note on top, pins, drops, and keeps the order as it shows after a drag', () => {
    const order = addQuickNote({ order: ['b.md', 'a.md'], pinned: [] }, 'c.md', true);
    expect(order).toEqual({ order: ['c.md', 'b.md', 'a.md'], pinned: ['c.md'] });
    expect(pinQuickNote(order, 'c.md', false).pinned).toEqual([]);
    expect(dropQuickNote(order, 'c.md')).toEqual({ order: ['b.md', 'a.md'], pinned: [] });
    expect(placeQuickNotes(order, ['Quick notes/c.md', 'Quick notes/a.md', 'Quick notes/b.md'])).toEqual({ order: ['c.md', 'a.md', 'b.md'], pinned: ['c.md'] });
  });

  it('keeps the order in its file, and names a new note after the moment', async () => {
    const fs = new MemoryFs();
    expect(await loadQuickOrder(fs)).toEqual({ order: [], pinned: [] });
    await saveQuickOrder(fs, { order: ['b.md', 'a.md'], pinned: ['a.md'] });
    expect(await loadQuickOrder(fs)).toEqual({ order: ['b.md', 'a.md'], pinned: ['a.md'] });
    expect(parseQuickOrder('{"order": ["a.md", "a.md", 3, ""]}')).toEqual({ order: ['a.md'], pinned: [] });
    const now = new Date(2026, 9, 24, 19, 23, 1);
    expect(await quickNotePath(fs, now)).toBe('Quick notes/2026-10-24 192301.md');
    await fs.writeText('Quick notes/2026-10-24 192301.md', 'x');
    expect(await quickNotePath(fs, now, new Set(['quick notes/2026-10-24 192301 2.md']))).toBe('Quick notes/2026-10-24 192301 3.md');
  });
});
