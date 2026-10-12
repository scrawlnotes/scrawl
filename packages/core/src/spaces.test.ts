import { describe, expect, it } from 'vitest';
import { parseBoard } from './board';
import { createCollection, loadCollection } from './collection';
import { MemoryFs } from './fs';
import { keepVersion, listVersions } from './history';
import {
  foldersNest,
  fromSpace,
  inSpace,
  isSpaceId,
  localPath,
  MultiFs,
  newSpaceId,
  prefixTree,
  readSpaceEntries,
  rebaseBoard,
  rebaseCollection,
  rebaseFields,
  rebaseSchema,
  rebaseTasks,
  spaceOf,
  toSpace,
  withinSpace,
} from './spaces';
import { cardRef, type Task } from './tasks';
import { createBoard, readTree } from './vault';

const ACME = 'sp-k7f3m2qa';
const OTHER = 'sp-zz9yy8xx';

describe('spaces', () => {
  it('makes ids of one shape and tells them apart from a folder', () => {
    const id = newSpaceId();
    expect(isSpaceId(id)).toBe(true);
    expect(isSpaceId('acme')).toBe(false);
    expect(isSpaceId('sp-ABCDEFGH')).toBe(false);
    expect(spaceOf(`@${id}/Sales/x.md`)).toBe(id);
    expect(spaceOf(`@${id}`)).toBe(id);
    expect(spaceOf('@notes/x.md')).toBeNull();
    expect(spaceOf('Sales/x.md')).toBeNull();
  });

  it('puts a space in front of a path and takes it off', () => {
    expect(inSpace(ACME, 'Sales/x.md')).toBe(`@${ACME}/Sales/x.md`);
    expect(inSpace(ACME, '')).toBe(`@${ACME}`);
    expect(inSpace(null, 'Sales/x.md')).toBe('Sales/x.md');
    expect(localPath(`@${ACME}/Sales/x.md`)).toBe('Sales/x.md');
    expect(localPath(`@${ACME}`)).toBe('');
    expect(localPath('Sales/x.md')).toBe('Sales/x.md');
  });

  it('reads a space through the vaults of all, its paths carrying the space', async () => {
    const personal = new MemoryFs();
    const acme = new MemoryFs();
    await personal.writeText('Home/a.md', 'a');
    await acme.writeText('Sales/b.md', 'b');
    const all = new MultiFs(personal, new Map([[ACME, acme]]));
    expect(await all.readText('Home/a.md')).toBe('a');
    expect(await all.readText(`@${ACME}/Sales/b.md`)).toBe('b');
    expect((await all.list(`@${ACME}/Sales`)).map((e) => e.path)).toEqual([`@${ACME}/Sales/b.md`]);
    await all.writeText(`@${ACME}/Sales/c.md`, 'c');
    expect(await acme.readText('Sales/c.md')).toBe('c');
    await all.move(`@${ACME}/Sales/c.md`, `@${ACME}/c.md`);
    expect(await acme.readText('c.md')).toBe('c');
    await expect(all.move(`@${ACME}/c.md`, 'c.md')).rejects.toThrow();
    await expect(all.readText(`@${OTHER}/x.md`)).rejects.toThrow();
    expect(all.at(`@${ACME}/Sales/b.md`)).toMatchObject({ fs: acme, space: ACME, local: 'Sales/b.md' });
    expect(all.at('Home/a.md')).toMatchObject({ fs: personal, space: null, local: 'Home/a.md' });
    expect(all.all().map(([space]) => space)).toEqual([null, ACME]);
    expect(prefixTree(await readTree(acme), ACME).map((n) => [n.path, n.children?.map((c) => c.path)])).toEqual([
      [`@${ACME}/Sales`, [`@${ACME}/Sales/b.md`]],
      [`@${ACME}/c.md`, undefined],
    ]);
  });

  it('puts a space in front of the paths a task list holds, takes it off again, and leaves out a link to another space', () => {
    const tasks = [
      { id: 't1', title: 'a', note: 'Sales/x.md', card: cardRef('Sales/Deals.board.json', 'c1'), record: { collection: 'Sales/Companies', id: 'r1', name: 'Acme' } },
      { id: 't2', title: 'b' },
    ] as Task[];
    const shown = rebaseTasks(tasks, fromSpace(ACME));
    expect(shown[0]).toMatchObject({ note: `@${ACME}/Sales/x.md`, card: `@${ACME}/Sales/Deals.board.json#c1`, record: { collection: `@${ACME}/Sales/Companies` } });
    expect(shown[1]).toBe(tasks[1]);
    expect(rebaseTasks(shown, toSpace(ACME))).toEqual(tasks);
    // Moved into Acme from the personal space: its note stays behind, its other links too.
    const foreign = [{ id: 't3', title: 'c', note: 'Home/n.md', card: cardRef('Home/B.board.json', 'c2'), record: { collection: 'Home/People', id: 'r2', name: 'Kim' } }] as Task[];
    expect(rebaseTasks(foreign, toSpace(ACME))).toEqual([{ id: 't3', title: 'c' }]);
    expect(rebaseTasks(foreign, withinSpace(ACME))).toEqual([{ id: 't3', title: 'c' }]);
    // Nothing to change: the same list, so that nothing is written for it.
    expect(rebaseTasks(tasks, withinSpace(null))).toBe(tasks);
  });

  it('does the same for a board: its cards, phases and fields', () => {
    const board = parseBoard('');
    const own = {
      ...board,
      cards: [{ ...board.cards[0], id: 'c', note: 'x.md' }, { ...board.cards[0], id: 'd' }],
      phases: [{ id: 'p', name: 'P', state: 'current', note: 'p.md' }],
      fields: [
        { key: 'co', label: 'Co', type: 'link', collection: 'Companies' },
        { key: 'n', label: 'N', type: 'rollup', rollup: { from: 'Deals.board.json', fn: 'count' } },
      ],
    } as never as typeof board;
    const shown = rebaseBoard(own, fromSpace(ACME));
    expect(shown.cards[0]?.note).toBe(`@${ACME}/x.md`);
    expect(shown.cards[1]).toBe(own.cards[1]);
    expect(shown.phases[0]?.note).toBe(`@${ACME}/p.md`);
    expect(shown.fields?.map((f) => f.collection ?? f.rollup?.from)).toEqual([`@${ACME}/Companies`, `@${ACME}/Deals.board.json`]);
    expect(rebaseBoard(shown, toSpace(ACME))).toEqual(own);
    const crossed = rebaseBoard(shown, toSpace(OTHER));
    expect(crossed.cards[0]).not.toHaveProperty('note');
    expect(crossed.fields?.map((f) => f.collection ?? f.rollup?.from)).toEqual([undefined, undefined]);
    expect(rebaseBoard(own, withinSpace(null))).toBe(own);
    expect(rebaseFields([{ key: 'k' } as { key: string; collection?: string }], fromSpace(ACME))).toEqual([{ key: 'k' }]);
  });

  it('writes a new board and a new collection of a space with its own paths, and shows them with the space', async () => {
    const acme = new MemoryFs();
    const board = await createBoard(acme, 'Sales', 'Deals', 'crm');
    const written = await acme.readText(board);
    expect(written).toContain('Sales/Companies');
    expect(written).not.toContain('@sp-');
    expect(rebaseBoard(parseBoard(written), fromSpace(ACME)).fields?.map((f) => f.collection).filter(Boolean)).toEqual([`@${ACME}/Sales/Companies`, `@${ACME}/Sales/People`]);

    const dir = await createCollection(acme, 'Sales', 'Companies', 'companies');
    expect(await acme.readText(`${dir}/_collection.json`)).not.toContain('@sp-');
    const shown = rebaseCollection(await loadCollection(acme, dir), fromSpace(ACME));
    expect(shown.dir).toBe(`@${ACME}/Sales/Companies`);
    const blocks = shown.schema.layout?.columns.flatMap((c) => c.sections.flatMap((s) => s.items)).filter((i) => 'block' in i && i.block === 'linked');
    expect(blocks?.map((b) => ('collection' in b ? b.collection : ''))).toEqual([`@${ACME}/Sales/Activities`, `@${ACME}/Sales/People`]);
    // Its index is in the space's own folder.
    await acme.writeText(`${dir}/acme.md`, '---\nid: r1\nname: Acme Corp\n---\n');
    expect((await loadCollection(acme, dir)).records.length).toBe(1);
    expect((await acme.list('.scrawl/index')).length).toBe(1);
  });

  it('leaves out a linked-record block of another space and keeps the schema as it is when nothing changes', () => {
    const schema = {
      version: 2,
      template: 'blank',
      fields: [],
      layout: { columns: [{ sections: [{ items: [{ field: 'name' }, { block: 'linked', collection: `@${OTHER}/People` }, { block: 'linked', collection: `@${ACME}/Notes` }] }] }] },
    } as never as Parameters<typeof rebaseSchema>[0];
    const own = rebaseSchema(schema, toSpace(ACME));
    expect(own.layout?.columns[0]?.sections[0]?.items).toEqual([{ field: 'name' }, { block: 'linked', collection: 'Notes' }]);
    expect(rebaseSchema(own, withinSpace(null))).toBe(own);
  });

  it('keeps a note’s history in the folder of its own space', async () => {
    const personal = new MemoryFs();
    const acme = new MemoryFs();
    const all = new MultiFs(personal, new Map([[ACME, acme]]));
    const { fs, local } = all.at(`@${ACME}/Sales/x.md`);
    await keepVersion(fs, local, 'before', { always: true });
    expect((await listVersions(acme, 'Sales/x.md')).length).toBe(1);
    expect(await personal.list('.scrawl/history')).toEqual([]);
  });

  it('reads the spaces a device keeps, leaving out what is not one, or one twice', () => {
    expect(
      readSpaceEntries([
        { id: ACME, name: ' Acme ', folder: 'C:\\Data\\Acme', source: { provider: 'onedrive', account: 'kaan@outlook.com', place: { drive: 'd1', item: 'i1', path: '/Acme', bad: 3 } } },
        { id: ACME, name: 'Again' },
        { id: 'acme' },
        { id: OTHER, source: { provider: '', place: {} } },
        null,
      ]),
    ).toEqual([
      { id: ACME, name: 'Acme', folder: 'C:\\Data\\Acme', source: { provider: 'onedrive', account: 'kaan@outlook.com', place: { drive: 'd1', item: 'i1', path: '/Acme' } } },
      { id: OTHER },
    ]);
    expect(readSpaceEntries({})).toEqual([]);
  });

  it('tells when one folder is inside the other', () => {
    expect(foldersNest('C:\\Users\\kaan\\AppData\\Personal', 'c:/users/kaan/appdata/personal/')).toBe(true);
    expect(foldersNest('C:\\Data', 'C:\\Data\\Acme')).toBe(true);
    expect(foldersNest('C:\\Data\\Acme', 'C:\\Data')).toBe(true);
    expect(foldersNest('C:\\Data\\Personal', 'C:\\Data\\Personal 2')).toBe(false);
    expect(foldersNest('/home/kaan/Notes', '/home/kaan/notes')).toBe(false);
    expect(foldersNest('/home/kaan/Notes', '/home/kaan/Notes/Acme')).toBe(true);
    expect(foldersNest('', '/home')).toBe(false);
  });
});
