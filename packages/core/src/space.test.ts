import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import { loadSpace, parseSpace, saveSpace, serializeSpace } from './space';

describe('space', () => {
  it('has no settings until some are saved', async () => {
    expect(await loadSpace(new MemoryFs())).toEqual({});
  });

  it('keeps its name in the space', async () => {
    const fs = new MemoryFs();
    await saveSpace(fs, { name: 'Work' });
    expect(await fs.readText('.scrawl/space.json')).toBe(serializeSpace({ name: 'Work' }));
    expect(await loadSpace(fs)).toEqual({ name: 'Work' });
  });

  it('reads a broken or foreign file as no settings', () => {
    expect(parseSpace('{')).toEqual({});
    expect(parseSpace('[1, 2]')).toEqual({});
    expect(parseSpace('null')).toEqual({});
  });

  it('drops a name of only spaces and trims one with them', () => {
    expect(parseSpace('{ "name": "   " }')).toEqual({});
    expect(parseSpace('{ "name": "  Home  " }')).toEqual({ name: 'Home' });
  });

  it('keeps what a newer version wrote', () => {
    const space = parseSpace('{ "version": 2, "name": "Work", "prefix": "WRK" }');
    expect(space).toEqual({ name: 'Work', prefix: 'WRK' });
  });
});
