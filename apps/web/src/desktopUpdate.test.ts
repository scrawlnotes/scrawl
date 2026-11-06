import { beforeAll, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: { payload: unknown }) => void>();
vi.mock('@tauri-apps/api/event', () => ({ listen: (name: string, run: (event: { payload: unknown }) => void) => (handlers.set(name, run), Promise.resolve(() => undefined)) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: () => new Promise(() => undefined) }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => Promise.resolve('0.1.23') }));
vi.mock('./storage', () => ({ isDesktop: true }));

const { closeUpdate, downloadUpdate, openUpdate, startDesktopUpdates, useUpdateView } = await import('./desktopUpdate');
// The store's snapshot, read without React.
let view: ReturnType<typeof useUpdateView>;
vi.mock('react', () => ({ useSyncExternalStore: (_: unknown, get: () => unknown) => get() }));
const read = () => (view = useUpdateView());
const shell = (payload: unknown) => handlers.get('update')!({ payload });

describe('the desktop update window', () => {
  beforeAll(() => startDesktopUpdates());

  it('does not ask when a version is found: the window opens only from the sidebar', () => {
    shell({ state: 'available', version: '0.1.24' });
    expect(read()).toMatchObject({ ask: null, found: '0.1.24' });
    openUpdate();
    expect(read().ask).toBe('ask');
    closeUpdate();
    expect(read().ask).toBe(null);
  });

  it('downloads only on Update, and asks to restart when its window was closed', () => {
    void downloadUpdate();
    expect(read().ask).toBe('download');
    closeUpdate();
    shell({ state: 'downloading', version: '0.1.24', percent: 40 });
    expect(read()).toMatchObject({ ask: null, found: '0.1.24' });
    shell({ state: 'ready', version: '0.1.24' });
    expect(read().ask).toBe('ready');
    expect(view.status.state).toBe('ready');
  });
});
