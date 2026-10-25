import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));

const { TauriFs, wroteLately } = await import('./tauriFs');

describe('wroteLately', () => {
  it('takes a file this app wrote, the folders it is in, and nothing else', async () => {
    const root = 'C:/Spaces/Acme';
    await new TauriFs(root).writeText('.scrawl/sync-state.json', '{}');
    expect(wroteLately(root, '.scrawl/sync-state.json')).toBe(true);
    // Windows tells the folder changed too: it is this app's own write.
    expect(wroteLately(root, '.scrawl')).toBe(true);
    expect(wroteLately(root, '.scrawl/people.json')).toBe(false);
    expect(wroteLately(root, '.scrawlings')).toBe(false);
    expect(wroteLately(root, 'Roadmap.board.json')).toBe(false);
    expect(wroteLately('C:/Spaces/Other', '.scrawl')).toBe(false);
  });

  it('lets go of what was written a while ago', async () => {
    const root = 'C:/Spaces/Later';
    await new TauriFs(root).writeText('Inbox/a.md', 'a');
    const later = Date.now() + 5000;
    expect(wroteLately(root, 'Inbox/a.md', later)).toBe(false);
    expect(wroteLately(root, 'Inbox', later)).toBe(false);
  });
});
