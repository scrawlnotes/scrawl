import { describe, expect, it } from 'vitest';
import { isAfter, newestOf, Updates } from './updates';

describe('the newest version out', () => {
  it('orders versions by their numbers, not as text', () => {
    expect(isAfter('0.2.10', '0.2.9')).toBe(true);
    expect(isAfter('0.3.0', '0.2.48')).toBe(true);
    expect(isAfter('0.2.48', '0.2.48')).toBe(false);
    expect(isAfter('0.2.9', '0.2.10')).toBe(false);
  });

  it('takes only whole versions from the image’s tags', () => {
    expect(newestOf(['edge', '0.1', 'latest', '0.2.9', '0.2.10', '0.2', 4, '0.2.10-rc'])).toBe('0.2.10');
    expect(newestOf(['latest', 'edge'])).toBeNull();
  });

  it('reads the tags with the key the registry gives, and keeps what it read when it cannot read again', async () => {
    const asked: string[] = [];
    let up = true;
    const fake = (async (url: string, init?: RequestInit) => {
      asked.push(url);
      if (!up) throw new Error('offline');
      if (url.includes('/token')) return new Response(JSON.stringify({ token: 'k' }));
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer k');
      return new Response(JSON.stringify({ tags: ['0.2.48', 'latest', '0.2.50', '0.2'] }));
    }) as typeof fetch;
    const updates = new Updates(fake);
    await updates.look();
    expect(updates.latest).toBe('0.2.50');
    expect(asked[1]).toContain('ghcr.io/v2/scrawlnotes/server/tags/list');
    up = false;
    await updates.look();
    expect(updates.latest).toBe('0.2.50');
  });
});
