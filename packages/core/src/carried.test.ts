import { describe, expect, it } from 'vitest';
import { inOrderOf, readCarried, writeCarried } from './carried';
import { MemoryFs } from './fs';

const space = (id: string) => ({ id, name: id.toUpperCase(), source: { provider: 'server', account: 'kaan@example.com', place: { url: 'https://s.example.com', space: id } } });

describe('what the personal space carries', () => {
  it('is every space and server any device wrote, in the order of the latest, each device in its own file', async () => {
    const fs = new MemoryFs();
    expect(await readCarried(fs)).toBeNull();
    await writeCarried(fs, 'laptop', { spaces: [space('a'), space('b'), space('c')], servers: [{ url: 'https://s.example.com', email: 'kaan@example.com' }] }, new Date(2026, 9, 19, 10));
    // A new phone wrote later, before the laptop's file came: it has none of the laptop's.
    await writeCarried(fs, 'phone', { spaces: [space('d'), space('b'), space('a')], servers: [] }, new Date(2026, 9, 19, 11));
    await writeCarried(fs, 'tablet', { spaces: [space('a')], servers: [{ url: 'https://s.example.com', email: 'old@example.com' }, { url: 'https://t.example.com', email: 'kaan@example.com' }] }, new Date(2026, 9, 19, 9));
    expect((await fs.list('.scrawl/settings')).map((file) => file.name).sort()).toEqual(['laptop.json', 'phone.json', 'tablet.json']);
    const carried = await readCarried(fs);
    expect(carried?.spaces.map((each) => each.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(carried?.servers).toEqual([
      { url: 'https://s.example.com', email: 'kaan@example.com' },
      { url: 'https://t.example.com', email: 'kaan@example.com' },
    ]);
    expect(carried?.written).toBe(new Date(2026, 9, 19, 11).toISOString());
    // A file that is not one is passed over; nothing is written without a device.
    await fs.writeText('.scrawl/settings/broken.json', '{');
    await writeCarried(fs, '', { spaces: [], servers: [] }, new Date(2026, 9, 19, 12));
    expect((await readCarried(fs))?.spaces.map((each) => each.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('keeps a device’s order where its spaces are, and the others where they were', () => {
    // c was removed from this device: it keeps its place; a and d swap, b is new here.
    expect(inOrderOf(['a', 'c', 'd'], ['d', 'a', 'b'])).toEqual(['d', 'c', 'a', 'b']);
    expect(inOrderOf([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(inOrderOf(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
