import { describe, expect, it } from 'vitest';
import { carryCreated, guessCreated, markCreated, readCreated } from './created';
import { MemoryFs } from './fs';
import { keepVersion } from './history';
import { DEFAULT_LOOK, sortedNodes } from './order';
import { loadWorkspace, saveWorkspace, type TreeNode } from './vault';

const node = (kind: TreeNode['kind'], name: string, modified: number, children?: TreeNode[]): TreeNode => ({
  kind,
  name,
  path: `Work/${name}`,
  modified,
  ...(children && { children }),
});
const names = (nodes: TreeNode[]) => nodes.map((each) => each.name);

describe('a folder’s order', () => {
  const items = [
    node('note', 'Brief.md', 300),
    node('tasks', 'Sprint.tasks.json', 100),
    node('folder', 'Old', 50, [node('note', 'Kept.md', 900)]),
    node('board', 'Roadmap.board.json', 200),
    node('note', 'Agenda 10.md', 400),
    node('note', 'Agenda 2.md', 150),
  ];
  const made: Record<string, number> = { 'Work/Brief.md': 10, 'Work/Agenda 10.md': 30, 'Work/Agenda 2.md': 20 };
  const created = (each: TreeNode) => made[each.path];

  it('goes by kind and then by name, as it always has', () => {
    expect(names(sortedNodes(items, DEFAULT_LOOK))).toEqual(['Sprint.tasks.json', 'Roadmap.board.json', 'Old', 'Agenda 2.md', 'Agenda 10.md', 'Brief.md']);
    expect(names(sortedNodes(items, { group: 'type', by: 'name', dir: 'desc' }))).toEqual(['Sprint.tasks.json', 'Roadmap.board.json', 'Old', 'Brief.md', 'Agenda 10.md', 'Agenda 2.md']);
  });

  it('goes by when things were last written, a folder by what is in it', () => {
    expect(names(sortedNodes(items, { group: 'none', by: 'modified', dir: 'desc' }, created))).toEqual(['Old', 'Agenda 10.md', 'Brief.md', 'Roadmap.board.json', 'Agenda 2.md', 'Sprint.tasks.json']);
  });

  it('goes by when things were made, what is not known by when it was written', () => {
    expect(names(sortedNodes(items, { group: 'none', by: 'created', dir: 'asc' }, created))).toEqual(['Old', 'Brief.md', 'Agenda 2.md', 'Agenda 10.md', 'Sprint.tasks.json', 'Roadmap.board.json']);
    expect(names(sortedNodes(items, { group: 'type', by: 'created', dir: 'desc' }, created))).toEqual(['Sprint.tasks.json', 'Roadmap.board.json', 'Old', 'Agenda 10.md', 'Agenda 2.md', 'Brief.md']);
  });

  it('is kept on the device by folder, the default left out', async () => {
    const fs = new MemoryFs();
    await saveWorkspace(fs, { tabs: [], active: null, boards: {}, keys: {}, collections: {}, folders: { Work: { group: 'none', by: 'modified', dir: 'desc' }, Bad: { group: 'x' } as never } });
    expect((await loadWorkspace(fs)).folders).toEqual({ Work: { group: 'none', by: 'modified', dir: 'desc' } });
  });
});

describe('when things were made', () => {
  it('is the earliest time any device wrote, and follows a rename or a move', async () => {
    const fs = new MemoryFs();
    await markCreated(fs, 'laptop', { 'Work/Plan.md': new Date(2026, 9, 1), Work: new Date(2026, 8, 1) });
    await markCreated(fs, 'phone', { 'work/plan.md': new Date(2026, 9, 2), 'Work/List.tasks.json': new Date(2026, 9, 3) });
    // A device does not write a time over the one it has.
    await markCreated(fs, 'laptop', { 'Work/Plan.md': new Date(2026, 9, 5) });
    let times = await readCreated(fs);
    expect(times.get('work/plan.md')).toBe(new Date(2026, 9, 1).getTime());
    expect(times.get('work/list.tasks.json')).toBe(new Date(2026, 9, 3).getTime());

    await carryCreated(fs, 'phone', 'Work', 'Clients/Work');
    times = await readCreated(fs);
    expect(times.get('clients/work')).toBe(new Date(2026, 8, 1).getTime());
    expect(times.get('clients/work/plan.md')).toBe(new Date(2026, 9, 1).getTime());
    expect(times.get('clients/work/list.tasks.json')).toBe(new Date(2026, 9, 3).getTime());
  });

  it('is worked out once for what was made before: a note’s name, its first version, else when it was written', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Inbox/2026-10-05 143207.md', 'scratch');
    await fs.writeText('Work/Call.md', 'now');
    await keepVersion(fs, 'Work/Call.md', 'before', { now: new Date(2026, 9, 3, 9, 0) });
    const guessed = await guessCreated(fs, 'laptop', [
      { path: 'Inbox/2026-10-05 143207.md', modified: Date.UTC(2026, 9, 10) },
      { path: 'Work/Call.md', modified: Date.UTC(2026, 9, 10) },
      { path: 'Work/Board.board.json', modified: 1000 },
    ]);
    expect(guessed).toEqual({
      'inbox/2026-10-05 143207.md': new Date(2026, 9, 5, 14, 32, 7).getTime(),
      'work/call.md': new Date(2026, 9, 3, 9, 0).getTime(),
      'work/board.board.json': 1000,
    });
    // Written down, it is not worked out again.
    expect(await guessCreated(fs, 'laptop', [{ path: 'Work/Call.md', modified: 5 }])).toEqual({});
    expect((await readCreated(fs)).get('work/call.md')).toBe(new Date(2026, 9, 3, 9, 0).getTime());
  });
});
