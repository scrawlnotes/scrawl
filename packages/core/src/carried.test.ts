import { describe, expect, it } from 'vitest';
import { inOrderOf, readCarried, writeCarried } from './carried';
import { MemoryFs } from './fs';

const space = (id: string) => ({ id, name: id.toUpperCase(), source: { provider: 'server', account: 'kaan@example.com', place: { url: 'https://s.example.com', space: id } } });

describe('what the personal space carries', () => {
  it('is what the device that wrote last wrote, each device in its own file', async () => {
    const fs = new MemoryFs();
    expect(await readCarried(fs)).toBeNull();
    await writeCarried(fs, 'laptop', { spaces: [space('a'), space('b')], servers: [{ url: 'https://s.example.com', email: 'kaan@example.com' }] }, new Date(2026, 9, 19, 10));
    await writeCarried(fs, 'phone', { spaces: [space('b'), space('a')], servers: [] }, new Date(2026, 9, 19, 11));
    await writeCarried(fs, 'tablet', { spaces: [space('a')], servers: [] }, new Date(2026, 9, 19, 9));
    expect((await fs.list('.scrawl/settings')).map((file) => file.name).sort()).toEqual(['laptop.json', 'phone.json', 'tablet.json']);
    const latest = await readCarried(fs);
    expect(latest?.spaces.map((each) => each.id)).toEqual(['b', 'a']);
    expect(latest?.written).toBe(new Date(2026, 9, 19, 11).toISOString());
    // A file that is not one is passed over; nothing is written without a device.
    await fs.writeText('.scrawl/settings/broken.json', '{');
    await writeCarried(fs, '', { spaces: [], servers: [] }, new Date(2026, 9, 19, 12));
    expect((await readCarried(fs))?.spaces.map((each) => each.id)).toEqual(['b', 'a']);
  });

  it('keeps a device’s order where its spaces are, and the others where they were', () => {
    // c was removed from this device: it keeps its place; a and d swap, b is new here.
    expect(inOrderOf(['a', 'c', 'd'], ['d', 'a', 'b'])).toEqual(['d', 'c', 'a', 'b']);
    expect(inOrderOf([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(inOrderOf(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
