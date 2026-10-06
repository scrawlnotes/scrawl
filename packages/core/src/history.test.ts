import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import { keepVersion, listVersions, moveHistory, pruneHistory } from './history';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute, 0);
const NOTE = 'Work/Plan.md';

async function texts(fs: MemoryFs, note = NOTE): Promise<string[]> {
  return Promise.all((await listVersions(fs, note)).map((v) => fs.readText(v.path)));
}

describe('history', () => {
  it('keeps a version at most every ten minutes', async () => {
    const fs = new MemoryFs();
    expect(await keepVersion(fs, NOTE, 'one', { now: at(6, 9, 0) })).toBe(true);
    expect(await keepVersion(fs, NOTE, 'two', { now: at(6, 9, 5) })).toBe(false);
    expect(await keepVersion(fs, NOTE, 'three', { now: at(6, 9, 10) })).toBe(true);
    expect(await texts(fs)).toEqual(['three', 'one']);
    expect((await listVersions(fs, NOTE)).map((v) => v.path)).toEqual([
      '.scrawl/history/Work/Plan.md/2026-10-06 091000.md',
      '.scrawl/history/Work/Plan.md/2026-10-06 090000.md',
    ]);
  });

  it('keeps a version within the ten minutes when asked to', async () => {
    const fs = new MemoryFs();
    await keepVersion(fs, NOTE, 'one', { now: at(6, 9, 0) });
    expect(await keepVersion(fs, NOTE, 'changed outside', { now: at(6, 9, 0), always: true })).toBe(true);
    expect(await texts(fs)).toEqual(['changed outside', 'one']);
  });

  it('never keeps an empty text or the same text twice', async () => {
    const fs = new MemoryFs();
    expect(await keepVersion(fs, NOTE, '  \n', { now: at(6, 9) })).toBe(false);
    await keepVersion(fs, NOTE, 'same', { now: at(6, 9) });
    expect(await keepVersion(fs, NOTE, 'same', { now: at(6, 12) })).toBe(false);
    expect(await texts(fs)).toEqual(['same']);
  });

  it('keeps every version of the last day, then one a day, for 60 days', async () => {
    const fs = new MemoryFs();
    // Two versions on Oct 1, one on Oct 3, two in the last day.
    for (const [time, text] of [
      [at(1, 9), 'oct 1 morning'],
      [at(1, 18), 'oct 1 evening'],
      [at(3, 12), 'oct 3'],
      [at(6, 8), 'today 8'],
    ] as const) {
      await keepVersion(fs, NOTE, text, { now: time });
    }
    await keepVersion(fs, NOTE, 'today 9', { now: at(6, 9) });
    expect(await texts(fs)).toEqual(['today 9', 'today 8', 'oct 3', 'oct 1 evening']);

    // 60 days after Oct 3, Oct 1 is gone but Oct 3 is still kept.
    await keepVersion(fs, NOTE, 'december', { now: new Date(2026, 11, 1, 12) });
    expect(await texts(fs)).toEqual(['december', 'today 9', 'oct 3']);
  });

  it('moves the history along with the note', async () => {
    const fs = new MemoryFs();
    await keepVersion(fs, NOTE, 'one', { now: at(6, 9) });
    await moveHistory(fs, NOTE, 'Home/Plan 2.md');
    expect(await texts(fs, 'Home/Plan 2.md')).toEqual(['one']);
    expect(await listVersions(fs, NOTE)).toEqual([]);
    // A note without history moves without error.
    await moveHistory(fs, 'Work/none.md', 'Home/none.md');
  });

  it('lets the history of notes that are gone run out', async () => {
    const fs = new MemoryFs();
    await keepVersion(fs, 'Old/gone.md', 'old', { now: at(1, 9) });
    await keepVersion(fs, NOTE, 'recent', { now: at(6, 9) });
    // On Dec 3 the Oct 1 version is past 60 days and the Oct 6 one is not.
    await pruneHistory(fs, new Date(2026, 11, 3));
    expect(await listVersions(fs, 'Old/gone.md')).toEqual([]);
    expect((await fs.list('.scrawl/history')).map((e) => e.name)).toEqual(['Work']);
    expect(await texts(fs)).toEqual(['recent']);
  });
});
