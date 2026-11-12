import { describe, expect, it } from 'vitest';

// Session reads `window` and `localStorage` as it is imported; nothing here draws.
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: globalThis,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
});

const { Session } = await import('./session');

describe('saving a note', () => {
  it('does not take its own save, still being written, for another program’s (no conflict copy)', async () => {
    const files = new Map([['Plan.md', 'One']]);
    let written!: () => void;
    const writing = new Promise<void>((done) => (written = done));
    let release!: () => void;
    const released = new Promise<void>((done) => (release = done));
    let slow = true;
    const copies: string[] = [];
    const s = new Session() as any;
    Object.assign(s, {
      fs: {
        readText: async (path: string) => files.get(path)!,
        // The first save lands on disk at once but its call comes back late, as over IPC.
        writeText: async (path: string, text: string) => {
          files.set(path, text);
          if (slow) {
            slow = false;
            written();
            await released;
          }
        },
      },
      keep: async () => {},
      conflictCopy: async (_: string, text: string) => void copies.push(text),
      readWritten: async () => {},
      trashUnlinkedFiles: async () => {},
      flushKeys: () => {},
      markSaved: () => {},
    });
    s.disk.set('Plan.md', 'One');

    s.pending.set('Plan.md', 'One two');
    const first = s.flush();
    await writing;
    // Typed on while the first save is being written; a rescan saves it.
    s.pending.set('Plan.md', 'One two three');
    const second = s.flush();
    release();
    await Promise.all([first, second]);

    expect(copies).toEqual([]);
    expect(files.get('Plan.md')).toBe('One two three');
  });
});
