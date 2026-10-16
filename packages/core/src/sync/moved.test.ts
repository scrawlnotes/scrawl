import { describe, expect, it } from 'vitest';
import { MemoryFs, type VaultFs } from '../fs';
import { type SyncDevice, syncOnce } from './engine';
import { clearLeftPlace, type MovedMark, movedPath, parseMoved, serializeMoved } from './moved';
import { MemoryRemote, RemoteMoved } from './remote';

// A personal space that moved on another device (design/spaces.md 3.2): its mark in the old place
// stops a device still syncing there before it does anything, and an old mark is gone past.

const PHONE: SyncDevice = { id: 'phone-id', name: 'Phone' };
const now = () => new Date(2026, 9, 16, 14, 0);
/** When the phone connected to the place it syncs with. */
const SINCE = Date.UTC(2026, 9, 1);
const MARK: MovedMark = {
  to: { provider: 'server', account: 'kaan@example.com', place: { url: 'https://kaan.scrawlnotes.com', space: 'sp-kaanmine' } },
  by: 'Laptop',
  at: Date.UTC(2026, 9, 16, 13, 0),
};

const run = (fs: VaultFs, remote: MemoryRemote, movedSince?: number) => syncOnce(fs, remote, PHONE, { now, saveEveryMs: 0, ...(movedSince !== undefined && { movedSince }) });
const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);

/** A phone and the place it syncs with, both holding two notes. */
async function synced() {
  const remote = new MemoryRemote();
  const phone = new MemoryFs();
  await phone.writeText('Home/Groceries.md', 'Milk\n');
  await phone.writeText('Inbox/Call the bank.md', 'About the card\n');
  await run(phone, remote, SINCE);
  return { remote, phone };
}

describe('a personal space that moved', () => {
  it('stops a device still syncing with the old place before it does anything, even with the copy there deleted', async () => {
    const { remote, phone } = await synced();
    // The laptop moved it, left its mark, and deleted the copy here.
    await remote.write(movedPath(MARK.at), new Blob([serializeMoved(MARK)]), null);
    await remote.remove('Home', null);
    await remote.remove('Inbox', null);
    await phone.writeText('Home/Groceries.md', 'Milk\nEggs\n');
    const stopped = await refusal(run(phone, remote, SINCE));
    expect(stopped).toBeInstanceOf(RemoteMoved);
    expect((stopped as RemoteMoved).mark).toEqual(MARK);
    // Nothing was done here, nor there.
    expect(await phone.readText('Home/Groceries.md')).toBe('Milk\nEggs\n');
    expect(await phone.readText('Inbox/Call the bank.md')).toBe('About the card\n');
    expect(await remote.text('Home/Groceries.md')).toBeNull();
    // It stops again on the next turn, until the phone follows.
    expect(await refusal(run(phone, remote, SINCE))).toBeInstanceOf(RemoteMoved);
  });

  it('goes past a mark from before the device connected, and never brings a mark here', async () => {
    const { remote, phone } = await synced();
    await remote.write(movedPath(SINCE - 1000), new Blob([serializeMoved({ ...MARK, at: SINCE - 1000 })]), null);
    await remote.write('Home/Plans.md', new Blob(['Paint the hall\n']), null);
    await run(phone, remote, SINCE);
    expect(await phone.readText('Home/Plans.md')).toBe('Paint the hall\n');
    expect((await phone.list('.scrawl')).map((entry) => entry.path)).not.toContain('.scrawl/moved');
  });

  it('looks for no mark in a shared space', async () => {
    const { remote, phone } = await synced();
    await remote.write(movedPath(MARK.at), new Blob([serializeMoved(MARK)]), null);
    expect(await refusal(run(phone, remote))).toBeNull();
  });

  it('moves from one place to another with the copy left deleted, and a device that follows loses nothing', async () => {
    const LAPTOP: SyncDevice = { id: 'laptop-id', name: 'Laptop' };
    const old = new MemoryRemote();
    const next = new MemoryRemote();
    const laptop = new MemoryFs();
    const phone = new MemoryFs();
    await laptop.writeText('Home/Groceries.md', 'Milk\n');
    await laptop.writeText('.scrawl/space.json', '{"name":"Personal"}\n');
    await syncOnce(laptop, old, LAPTOP, { now, saveEveryMs: 0, movedSince: 0 });
    await run(phone, old, SINCE);
    // The phone writes while the laptop moves.
    await phone.writeText('Home/Plans.md', 'Paint the hall\n');
    // The laptop: the mark first, then the new place from a fresh state, then the old copy goes.
    const at = Date.UTC(2026, 9, 16, 13, 0);
    await old.write(movedPath(at), new Blob([serializeMoved({ ...MARK, at })]), null);
    for (const path of ['.scrawl/sync-state.json', '.scrawl/sync-base']) await laptop.remove(path).catch(() => undefined);
    await syncOnce(laptop, next, LAPTOP, { now, saveEveryMs: 0, movedSince: at });
    await clearLeftPlace(old);
    expect(old.paths()).toEqual([movedPath(at)]);
    // The phone stops, its new note kept.
    const stopped = await refusal(run(phone, old, SINCE));
    expect((stopped as RemoteMoved).mark.at).toBe(at);
    expect(await phone.readText('Home/Plans.md')).toBe('Paint the hall\n');
    // It follows: the new place from a fresh state, what each has put together.
    for (const path of ['.scrawl/sync-state.json', '.scrawl/sync-base']) await phone.remove(path).catch(() => undefined);
    await run(phone, next, at);
    await syncOnce(laptop, next, LAPTOP, { now, saveEveryMs: 0, movedSince: at });
    expect(await laptop.readText('Home/Plans.md')).toBe('Paint the hall\n');
    expect(await phone.readText('Home/Groceries.md')).toBe('Milk\n');
    expect(next.paths().filter((path) => path.startsWith('.scrawl/moved'))).toEqual([]);
  });

  it('reads a mark as it was written, and nothing else as one', () => {
    expect(parseMoved(serializeMoved(MARK))).toEqual(MARK);
    expect(parseMoved('{"to": "somewhere", "at": 1}')).toBeNull();
    expect(parseMoved('not json')).toBeNull();
  });
});
