import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import { fillMe, loadMe, mergeMe, newMe, parseMe, saveMe, serializeMe, startMe } from './me';
import { mergeFields } from './sync/merge-records';

describe('me', () => {
  it('is nobody until the first start saved one', async () => {
    expect(await loadMe(new MemoryFs())).toBeNull();
  });

  it('is made with the first start, with no name or email, and kept after', async () => {
    const fs = new MemoryFs();
    const me = await startMe(fs);
    expect(me).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(await loadMe(fs)).toEqual(me);
    expect(await startMe(fs)).toEqual(me);
  });

  it('goes with the app to a personal folder that has no person, and not to one that has', async () => {
    const known = { id: 'a1', name: 'Kaan' };
    const empty = new MemoryFs();
    expect(await startMe(empty, known)).toEqual(known);
    expect(await loadMe(empty)).toEqual(known);
    const other = new MemoryFs();
    await saveMe(other, { id: 'b2', name: 'Kaan A.' });
    expect(await startMe(other, known)).toEqual({ id: 'b2', name: 'Kaan A.' });
  });

  it('takes a name and an email only where they were empty', () => {
    const empty = { id: 'a1' };
    expect(fillMe(empty, ' Kaan Arslan ', 'kaan@example.com')).toEqual({ id: 'a1', name: 'Kaan Arslan', email: 'kaan@example.com' });
    expect(fillMe({ id: 'a1', name: 'Kaan' }, 'Kaan Arslan', 'kaan@example.com')).toEqual({ id: 'a1', name: 'Kaan', email: 'kaan@example.com' });
    const whole = { id: 'a1', name: 'Kaan', email: 'kaan@outlook.com' };
    expect(fillMe(whole, 'Kaan Arslan', 'kaan@example.com')).toBe(whole);
    expect(fillMe(empty, '  ', '')).toBe(empty);
  });

  it('keeps the id, the name and the email in the personal space', async () => {
    const fs = new MemoryFs();
    const me = newMe('Kaan Arslan', 'kaan@example.com');
    await saveMe(fs, me);
    expect(await fs.readText('.scrawl/me.json')).toBe(serializeMe(me));
    expect(await loadMe(fs)).toEqual(me);
    expect(me.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lets the name and the email stay empty, but not the id', () => {
    expect(newMe('  ', '')).toEqual({ id: expect.any(String) });
    expect(parseMe('{ "id": "a1", "name": "  " }')).toEqual({ id: 'a1' });
    expect(parseMe('{ "name": "Kaan" }')).toBeNull();
    expect(parseMe('{')).toBeNull();
    expect(parseMe('[1]')).toBeNull();
  });

  it('keeps what a newer version wrote', () => {
    expect(parseMe('{ "version": 2, "id": "a1", "name": "Kaan", "avatar": "k.png" }')).toEqual({ id: 'a1', name: 'Kaan', avatar: 'k.png' });
  });

  it('merges two devices onto the id that was synced first', () => {
    const remote = { id: 'first', name: 'Kaan' };
    const local = { id: 'second', email: 'kaan@example.com' };
    expect(mergeMe(null, local, remote, mergeFields)).toEqual({ id: 'first', name: 'Kaan', email: 'kaan@example.com' });
    expect(mergeMe({ id: 'first' }, { id: 'first', name: 'Kaan A.' }, { id: 'first' }, mergeFields)).toEqual({ id: 'first', name: 'Kaan A.' });
    expect(mergeMe(null, local, null, mergeFields)).toEqual(local);
  });
});
