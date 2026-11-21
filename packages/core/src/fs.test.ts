import { describe, expect, it } from 'vitest';
import { MemoryFs, NfcFs } from './fs';

// design/unicode-names.md 3.1: a store that keeps names in NFD, as a file synced from another device can be.
const nfd = (text: string) => text.normalize('NFD');
const BOARD = 'İşler/Kaan İş Takibi.board.json';

async function setup() {
  const store = new MemoryFs();
  await store.writeText(nfd(BOARD), '{}');
  await store.writeText('Plan.md', 'plan');
  return { store, fs: new NfcFs(store) };
}

describe('NfcFs', () => {
  it('lists names in NFC and reaches a file kept in NFD by its NFC path', async () => {
    const { store, fs } = await setup();
    expect(nfd(BOARD)).not.toBe(BOARD);
    expect((await fs.list('')).map((e) => e.path).sort()).toEqual(['Plan.md', 'İşler']);
    expect(await fs.list('İşler')).toEqual([expect.objectContaining({ name: 'Kaan İş Takibi.board.json', path: BOARD, kind: 'file' })]);
    // Reached without listing first, and by the NFD path too.
    expect(await new NfcFs(store).readText(BOARD)).toBe('{}');
    expect(await fs.readText(nfd(BOARD))).toBe('{}');
    expect(await fs.stat!(BOARD)).toEqual(expect.objectContaining({ path: BOARD, kind: 'file' }));
    expect(await fs.readText('Plan.md')).toBe('plan');
  });

  it('writes over the file kept in NFD, and a new name in NFC', async () => {
    const { store, fs } = await setup();
    await fs.writeText(BOARD, '{"cards":[]}');
    await fs.writeText('İşler/Yeni İş.md', 'new');
    expect((await store.list(nfd('İşler'))).map((e) => e.name).sort()).toEqual([nfd('Kaan İş Takibi.board.json'), 'Yeni İş.md']);
    expect(await store.readText(nfd(BOARD))).toBe('{"cards":[]}');
    expect(await fs.readText('İşler/Yeni İş.md')).toBe('new');
  });

  it('moves and removes the file kept in NFD; a move to the same name in another form does nothing', async () => {
    const { store, fs } = await setup();
    await fs.move(BOARD, nfd(BOARD));
    expect(await store.readText(nfd(BOARD))).toBe('{}');
    await fs.move(BOARD, 'İşler/Takip.board.json');
    expect((await fs.list('İşler')).map((e) => e.path)).toEqual(['İşler/Takip.board.json']);
    await fs.writeText(BOARD, 'again');
    expect((await fs.list('İşler')).map((e) => e.name).sort()).toEqual(['Kaan İş Takibi.board.json', 'Takip.board.json']);
    await fs.remove('İşler');
    expect(await fs.list('')).toEqual([expect.objectContaining({ path: 'Plan.md' })]);
    expect(await store.list(nfd('İşler'))).toEqual([]);
  });
});
