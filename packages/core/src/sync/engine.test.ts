import { describe, expect, it } from 'vitest';
import { type Card, parseBoard, serializeBoard } from '../board';
import { type Entry, MemoryFs, type VaultFs } from '../fs';
import { parseList, serializeList, type Task } from '../tasks';
import { deleteFromTrash, emptyTrash, readTrash, restoreFromTrash, trashFolder, trashItem, trashPiece } from '../vault';
import { type SyncDevice, type SyncProgress, syncOnce } from './engine';
import { isSynced } from './paths';
import { MemoryRemote, type RemoteStore } from './remote';

// Two devices and a remote, as design/sync.md section 8 lists them.

const LAPTOP: SyncDevice = { id: 'laptop-id', name: 'Laptop' };
const PHONE: SyncDevice = { id: 'phone-id', name: 'Phone' };
const now = () => new Date(2026, 9, 7, 14, 32);

function setup(hashes = false) {
  const remote = new MemoryRemote(hashes);
  const laptop = new MemoryFs();
  const phone = new MemoryFs();
  const run = (fs: VaultFs, device: SyncDevice, store: RemoteStore = remote) => syncOnce(fs, store, device, { now, saveEveryMs: 0 });
  return { remote, laptop, phone, syncLaptop: (store?: RemoteStore) => run(laptop, LAPTOP, store), syncPhone: (store?: RemoteStore) => run(phone, PHONE, store) };
}

/** Every synced file of a device with its text, sorted by path. */
async function contents(fs: VaultFs, dir = '', out: Record<string, string> = {}): Promise<Record<string, string>> {
  for (const entry of await fs.list(dir)) {
    if (!isSynced(entry.path)) continue;
    if (entry.kind === 'dir') await contents(fs, entry.path, out);
    else out[entry.path] = await fs.readText(entry.path);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The tag the remote has for a file now, as another program working on it would read it. */
async function tagOf(remote: MemoryRemote, path: string): Promise<string> {
  const entry = (await remote.changes(null)).changed.find((e) => e.path === path);
  if (entry?.kind !== 'file') throw new Error(`Not on the remote: ${path}`);
  return entry.tag;
}

async function dirs(fs: VaultFs, dir = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.list(dir)) if (entry.kind === 'dir' && isSynced(entry.path)) out.push(entry.path, ...(await dirs(fs, entry.path)));
  return out.sort();
}

/** A remote that does something else once, just before one kind of call: another device, or the user, writing in between. */
function interrupted(remote: MemoryRemote, before: 'read' | 'write' | 'remove', meanwhile: () => Promise<unknown>): RemoteStore {
  let done = false;
  const once = async () => {
    if (done) return;
    done = true;
    await meanwhile();
  };
  return {
    changes: (cursor) => remote.changes(cursor),
    read: async (path) => {
      if (before === 'read') await once();
      return remote.read(path);
    },
    mkdir: (path) => remote.mkdir(path),
    write: async (path, data, ifMatch) => {
      if (before === 'write') await once();
      return remote.write(path, data, ifMatch);
    },
    move: (from, to, ifMatch) => remote.move(from, to, ifMatch),
    remove: async (path, ifMatch) => {
      if (before === 'remove') await once();
      return remote.remove(path, ifMatch);
    },
    hashOf: (data) => remote.hashOf(data),
  };
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: id, done: false, priority: 4, due: null, parent: null, order: 0, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', completed: null, ...extra };
}

describe('sync', () => {
  it('1. sends everything to an empty remote, and brings everything to an empty device', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', '# Plan');
    await laptop.writeText('Inbox.tasks.json', serializeList({ sections: [], tasks: [task('a')] }));
    await laptop.writeBlob('_attachments/photo.png', new Blob([new Uint8Array([1, 2, 3])]));
    await syncLaptop();
    expect(remote.paths()).toEqual(['Inbox.tasks.json', 'Scrawl/Plan.md', '_attachments/photo.png']);
    await syncPhone();
    expect(await contents(phone)).toEqual(await contents(laptop));
  });

  it('2. on a first sync of two full sides, links what is alike and merges what is not', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    for (const fs of [laptop, phone]) await fs.writeText('Scrawl/Same.md', 'alike');
    await laptop.writeText('Scrawl/Plan.md', 'from the laptop');
    await phone.writeText('Scrawl/Plan.md', 'from the phone');
    await laptop.writeText('Inbox.tasks.json', serializeList({ sections: [], tasks: [task('a')] }));
    await phone.writeText('Inbox.tasks.json', serializeList({ sections: [], tasks: [task('b')] }));
    await syncLaptop();
    const writes = remote.calls.write;
    const report = await syncPhone();
    expect(report.uploaded).not.toContain('Scrawl/Same.md');
    expect(await phone.readText('Scrawl/Plan.md')).toBe('from the phone');
    expect(report.conflicts).toEqual(['Scrawl/Plan (conflict, Phone, 2026-10-07 1432).md']);
    expect(await phone.readText(report.conflicts[0]!)).toBe('from the laptop');
    expect(parseList(await phone.readText('Inbox.tasks.json')).tasks.map((t) => t.id).sort()).toEqual(['a', 'b']);
    // The same file was not sent again: only the merged ones and the copy.
    expect(remote.calls.write - writes).toBe(3);
    await syncLaptop();
    expect(await contents(laptop)).toEqual(await contents(phone));
  });

  it('3. brings a change made on one side to the other', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'one');
    await syncLaptop();
    await syncPhone();
    await laptop.writeText('Scrawl/Plan.md', 'two');
    expect((await syncLaptop()).uploaded).toEqual(['Scrawl/Plan.md']);
    expect((await syncPhone()).downloaded).toEqual(['Scrawl/Plan.md']);
    expect(await phone.readText('Scrawl/Plan.md')).toBe('two');
    await phone.writeText('Scrawl/Plan.md', 'three');
    await syncPhone();
    await syncLaptop();
    expect(await laptop.readText('Scrawl/Plan.md')).toBe('three');
  });

  it('4. merges a note changed on different lines on two devices', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'one\ntwo\nthree\nfour');
    await syncLaptop();
    await syncPhone();
    await laptop.writeText('Scrawl/Plan.md', 'ONE\ntwo\nthree\nfour');
    await phone.writeText('Scrawl/Plan.md', 'one\ntwo\nthree\nFOUR');
    await syncLaptop();
    expect((await syncPhone()).merged).toEqual(['Scrawl/Plan.md']);
    await syncLaptop();
    for (const fs of [laptop, phone]) expect(await fs.readText('Scrawl/Plan.md')).toBe('ONE\ntwo\nthree\nFOUR');
  });

  it('5. keeps a note as this device has it and puts the other version beside it, losing nothing', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'one\ntwo');
    await syncLaptop();
    await syncPhone();
    await laptop.writeText('Scrawl/Plan.md', 'one\nlaptop');
    await phone.writeText('Scrawl/Plan.md', 'one\nphone');
    await syncLaptop();
    const report = await syncPhone();
    expect(await phone.readText('Scrawl/Plan.md')).toBe('one\nphone');
    expect(report.conflicts).toHaveLength(1);
    expect(await phone.readText(report.conflicts[0]!)).toBe('one\nlaptop');
    await syncLaptop();
    expect(await contents(laptop)).toEqual(await contents(phone));
    expect(remote.paths()).toHaveLength(2);
  });

  it('5. lets only one of two devices settling the same conflict at once write, and makes no copy twice', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'one\ntwo');
    await syncLaptop();
    await syncPhone();
    // A third device changes it, while the laptop and the phone change it too.
    await remote.write('Scrawl/Plan.md', new Blob(['one\ntablet']), await tagOf(remote, 'Scrawl/Plan.md'));
    await laptop.writeText('Scrawl/Plan.md', 'one\nlaptop');
    await phone.writeText('Scrawl/Plan.md', 'one\nphone');
    // The phone has listed the changes when the laptop settles the conflict and writes first.
    const first = await syncPhone(interrupted(remote, 'write', () => syncLaptop()));
    expect(first.skipped).toContain('Scrawl/Plan.md');
    expect(await phone.readText('Scrawl/Plan.md')).toBe('one\nphone');
    await syncPhone();
    await syncLaptop();
    const texts = Object.values(await contents(phone));
    expect(texts.sort()).toEqual(['one\nlaptop', 'one\nphone', 'one\ntablet']);
    expect(await contents(laptop)).toEqual(await contents(phone));
  });

  it('6. merges a task list changed on both sides, the same on both devices', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = setup();
    const path = 'Scrawl/Work.tasks.json';
    await laptop.writeText(path, serializeList({ sections: [], tasks: [task('a'), task('b', { order: 1 })] }));
    await syncLaptop();
    await syncPhone();
    await laptop.writeText(path, serializeList({ sections: [], tasks: [task('a', { due: '2026-10-09', updated: '2026-10-02T10:00:00.000Z' }), task('b', { order: 1, title: 'laptop', updated: '2026-10-02T10:00:00.000Z' })] }));
    await phone.writeText(path, serializeList({ sections: [], tasks: [task('a', { priority: 1, updated: '2026-10-03T10:00:00.000Z' }), task('b', { order: 1, title: 'phone', updated: '2026-10-03T10:00:00.000Z' })] }));
    await syncLaptop();
    await syncPhone();
    await syncLaptop();
    expect(await laptop.readText(path)).toBe(await phone.readText(path));
    const [a, b] = parseList(await laptop.readText(path)).tasks;
    expect(a).toMatchObject({ due: '2026-10-09', priority: 1 });
    expect(b!.title).toBe('phone');
  });

  it('7. lets a change win over a delete, either way round', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/A.md', 'a');
    await laptop.writeText('Scrawl/B.md', 'b');
    await syncLaptop();
    await syncPhone();
    await laptop.remove('Scrawl/A.md');
    await phone.writeText('Scrawl/A.md', 'a, changed');
    await laptop.writeText('Scrawl/B.md', 'b, changed');
    await phone.remove('Scrawl/B.md');
    await syncLaptop();
    await syncPhone();
    await syncLaptop();
    for (const fs of [laptop, phone]) {
      expect(await fs.readText('Scrawl/A.md')).toBe('a, changed');
      expect(await fs.readText('Scrawl/B.md')).toBe('b, changed');
    }
  });

  it('8. takes a delete made in the app to the other device as a move into its trash, with one item there', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'plan');
    await syncLaptop();
    await syncPhone();
    const writes = remote.calls.write;
    await trashItem(laptop, 'Scrawl/Plan.md', now());
    await syncLaptop();
    // Moved into the trash on the remote, not sent again: only the trash index is written.
    expect(remote.calls.write - writes).toBe(1);
    expect(remote.paths().some((p) => p.startsWith('.scrawl/trash/2026'))).toBe(true);
    await syncPhone();
    expect(await readTrash(phone)).toHaveLength(1);
    expect(await contents(phone)).toEqual(await contents(laptop));
  });

  it('17. removes a file deleted on the other side outright when its content came into the trash in the same turn', async () => {
    const { remote, laptop, syncLaptop } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'plan');
    await syncLaptop();
    // Another program deletes it and puts a copy in the trash.
    const tag = await tagOf(remote, 'Scrawl/Plan.md');
    await remote.write('.scrawl/trash/2026-10-07 143200 Plan.md', new Blob(['plan']), null);
    await remote.remove('Scrawl/Plan.md', tag);
    const report = await syncLaptop();
    expect(report.removedHere).toEqual(['Scrawl/Plan.md']);
    expect(Object.keys(await contents(laptop))).toEqual(['.scrawl/trash/2026-10-07 143200 Plan.md']);
  });

  it('9. puts a file deleted by another program into this device’s trash', async () => {
    const { remote, laptop, syncLaptop } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'plan');
    await syncLaptop();
    await remote.remove('Scrawl/Plan.md', await tagOf(remote, 'Scrawl/Plan.md'));
    await syncLaptop();
    const trash = await readTrash(laptop);
    expect(trash.map((item) => item.from)).toEqual(['Scrawl/Plan.md']);
  });

  it('10. moves a file instead of sending it again, renames in case only, knows NFC from NFD, and syncs empty folders', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeBlob('_attachments/big.bin', new Blob([new Uint8Array(1000)]));
    await laptop.writeText('Scrawl/plan.md', 'plan');
    await laptop.writeText('Scrawl/Çay.md', 'tea');
    await syncLaptop();
    await phone.writeText('Scrawl/Çay.md', 'tea');
    await syncPhone();
    expect(remote.paths().filter((p) => p.endsWith('ay.md'))).toHaveLength(1);
    const writes = remote.calls.write;
    await laptop.move('_attachments/big.bin', '_attachments/big2.bin');
    await laptop.move('Scrawl/plan.md', 'Scrawl/Plan.md');
    await laptop.mkdir('Empty');
    expect((await syncLaptop()).moved.sort()).toEqual(['Scrawl/Plan.md', '_attachments/big2.bin']);
    expect(remote.calls.write).toBe(writes);
    expect(remote.dirPaths()).toContain('Empty');
    const reads = remote.calls.read;
    await syncPhone();
    expect(remote.calls.read).toBe(reads);
    expect(Object.keys(await contents(phone))).toEqual(expect.arrayContaining(['Scrawl/Plan.md', '_attachments/big2.bin']));
    expect(await dirs(phone)).toContain('Empty');
  });

  it('11. keeps the comments made on both devices and gives a doubled key a new number, alike on both', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = setup();
    const path = 'Scrawl/Roadmap.board.json';
    const card = (id: string, key: number, extra: Partial<Card> = {}): Card => ({ id, key, title: id, column: 'todo', order: 0, priority: 4, due: null, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', completed: null, timeline: [], ...extra });
    const board = (cards: Card[]) => serializeBoard({ prefix: 'SCR', nextKey: Math.max(1, ...cards.map((c) => c.key + 1)), phasesOn: false, columns: [{ id: 'todo', name: 'Todo', kind: 'active' }, { id: 'done', name: 'Done', kind: 'done' }], phases: [], cards });
    await laptop.writeText(path, board([card('a', 1)]));
    await syncLaptop();
    await syncPhone();
    await laptop.writeText(path, board([card('a', 1, { timeline: [{ id: 'l', at: '2026-10-02T10:00:00.000Z', kind: 'comment', text: 'laptop' }] }), card('x', 2, { created: '2026-10-02T10:00:00.000Z' })]));
    await phone.writeText(path, board([card('a', 1, { timeline: [{ id: 'p', at: '2026-10-02T11:00:00.000Z', kind: 'comment', text: 'phone' }] }), card('y', 2, { created: '2026-10-02T11:00:00.000Z' })]));
    await syncLaptop();
    await syncPhone();
    await syncLaptop();
    expect(await laptop.readText(path)).toBe(await phone.readText(path));
    const merged = parseBoard(await phone.readText(path));
    expect(merged.cards.find((c) => c.id === 'a')!.timeline.map((e) => e.id)).toEqual(['l', 'p']);
    expect(merged.cards.find((c) => c.id === 'x')!.key).toBe(2);
    expect(merged.cards.find((c) => c.id === 'y')!.key).toBe(3);
  });

  it('12. writes nothing over a file the other side changed meanwhile, and merges it next turn', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'one\ntwo\nthree');
    await syncLaptop();
    await syncPhone();
    await phone.writeText('Scrawl/Plan.md', 'ONE\ntwo\nthree');
    await laptop.writeText('Scrawl/Plan.md', 'one\ntwo\nTHREE');
    const report = await syncLaptop(interrupted(remote, 'write', () => syncPhone()));
    expect(report.skipped).toEqual(['Scrawl/Plan.md']);
    expect(await remote.text('Scrawl/Plan.md')).toBe('ONE\ntwo\nthree');
    await syncLaptop();
    await syncPhone();
    for (const fs of [laptop, phone]) expect(await fs.readText('Scrawl/Plan.md')).toBe('ONE\ntwo\nTHREE');
  });

  it('13. goes on from where a turn was cut off, sending nothing twice', async () => {
    const { remote, laptop, syncLaptop } = setup();
    for (const name of ['a', 'b', 'c', 'd']) await laptop.writeText(`Scrawl/${name}.md`, name);
    let writes = 0;
    const failing: RemoteStore = {
      ...interrupted(remote, 'write', async () => undefined),
      write: async (path, data, ifMatch) => {
        const sent = await remote.write(path, data, ifMatch);
        // The second file reaches the remote, and the device goes away before it notes so.
        if (++writes === 2) throw new Error('connection lost');
        return sent;
      },
    };
    await expect(syncLaptop(failing)).rejects.toThrow('connection lost');
    const sent = remote.calls.write;
    const report = await syncLaptop();
    expect(report.uploaded.sort()).toEqual(['Scrawl/c.md', 'Scrawl/d.md']);
    expect(remote.calls.write - sent).toBe(2);
    expect(remote.paths()).toHaveLength(4);
  });

  it('14. never sends what stays on the device', async () => {
    const { remote, laptop, syncLaptop } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'plan');
    await laptop.writeText('.scrawl/history/Scrawl/Plan.md/2026-10-07 143200.md', 'old');
    await laptop.writeText('.scrawl/workspace.json', '{}');
    await laptop.writeText('Scrawl/.Plan.md.tmp', 'half');
    await laptop.writeText('Scrawl/desktop.ini', '[x]');
    await laptop.writeText('.scrawl/space.json', '{"version":1,"name":"Home"}');
    await syncLaptop();
    expect(remote.paths()).toEqual(['.scrawl/space.json', 'Scrawl/Plan.md']);
  });

  it('15. brings a folder deleted on one device back with the note changed in it on the other', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Client/Brief.md', 'brief');
    await laptop.writeText('Client/Notes.md', 'notes');
    await syncLaptop();
    await syncPhone();
    await trashFolder(laptop, 'Client', now());
    await phone.writeText('Client/Notes.md', 'notes, changed');
    await syncLaptop();
    await syncPhone();
    await syncLaptop();
    for (const fs of [laptop, phone]) {
      const files = Object.keys(await contents(fs));
      expect(files).toContain('Client/Notes.md');
      expect(files).not.toContain('Client/Brief.md');
      expect(await readTrash(fs)).toHaveLength(1);
    }
  });

  it('25. takes a folder deleted here while a turn runs away there and on the other device, and never brings it back', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Client/Brief.md', 'brief');
    await laptop.writeText('Plan.md', 'plan');
    await syncLaptop();
    await syncPhone();
    // On a disk a folder stays when what was in it goes, as it does not in memory.
    await phone.mkdir('Client');
    await phone.writeText('Plan.md', 'plan, changed');
    await syncPhone();
    // While the laptop brings the plan, the folder is deleted there.
    await syncLaptop(interrupted(remote, 'read', () => trashFolder(laptop, 'Client', now())));
    await syncLaptop();
    await syncPhone();
    await syncLaptop();
    expect(remote.dirPaths()).not.toContain('Client');
    expect((await remote.changes(null)).changed.some((entry) => entry.path === 'Client')).toBe(false);
    for (const fs of [laptop, phone]) {
      expect(await dirs(fs)).not.toContain('Client');
      expect(await readTrash(fs)).toHaveLength(1);
    }
  });

  it('16. links two sides that are alike without reading anything, where the remote gives digests', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup(true);
    for (const fs of [laptop, phone]) {
      await fs.writeText('Scrawl/Plan.md', 'plan');
      await fs.writeBlob('_attachments/big.bin', new Blob([new Uint8Array(1000)]));
    }
    await syncLaptop();
    const report = await syncPhone();
    expect(remote.calls.read).toBe(0);
    expect(report.downloaded).toEqual([]);
    expect(report.uploaded).toEqual([]);
  });

  it('18. writes nothing over a note saved here while the turn runs, and merges it next turn', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'one\ntwo\nthree');
    await syncLaptop();
    await syncPhone();
    await phone.writeText('Scrawl/Plan.md', 'ONE\ntwo\nthree');
    await syncPhone();
    // While the phone's change comes down, the note is saved on the laptop.
    const report = await syncLaptop(interrupted(remote, 'read', () => laptop.writeText('Scrawl/Plan.md', 'one\ntwo\nTHREE')));
    expect(report.skipped).toEqual(['Scrawl/Plan.md']);
    expect(await laptop.readText('Scrawl/Plan.md')).toBe('one\ntwo\nTHREE');
    await syncLaptop();
    await syncPhone();
    for (const fs of [laptop, phone]) expect(await fs.readText('Scrawl/Plan.md')).toBe('ONE\ntwo\nTHREE');
  });

  it('19. does not take away a note saved here while the turn runs, though it went on the other side', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/a.md', 'a');
    await laptop.writeText('Scrawl/b.md', 'b');
    await syncLaptop();
    await syncPhone();
    await phone.writeText('Scrawl/b.md', 'b, changed');
    await syncPhone();
    // Another program deletes the note there.
    await remote.remove('Scrawl/a.md', await tagOf(remote, 'Scrawl/a.md'));
    const report = await syncLaptop(interrupted(remote, 'read', () => laptop.writeText('Scrawl/a.md', 'a, changed')));
    expect(report.skipped).toEqual(['Scrawl/a.md']);
    expect(report.removedHere).toEqual([]);
    await syncLaptop();
    await syncPhone();
    for (const fs of [laptop, phone]) expect(await fs.readText('Scrawl/a.md')).toBe('a, changed');
  });

  it('20. takes what a listing of everything lacks as gone, when the remote could not tell what changed', async () => {
    const { remote, laptop, syncLaptop } = setup();
    await laptop.writeText('Scrawl/a.md', 'a');
    await laptop.writeText('Scrawl/b.md', 'b');
    await syncLaptop();
    await remote.remove('Scrawl/b.md', await tagOf(remote, 'Scrawl/b.md'));
    const forgetful: RemoteStore = { ...interrupted(remote, 'write', async () => undefined), changes: async () => ({ ...(await remote.changes(null)), full: true }) };
    const report = await syncLaptop(forgetful);
    expect(report.removedHere).toEqual(['Scrawl/b.md']);
    expect(report.downloaded).toEqual([]);
    expect(await laptop.stat('Scrawl/b.md')).toBeNull();
    expect(await laptop.readText('Scrawl/a.md')).toBe('a');
  });

  it('21. keeps a name the remote does not take on the device, and tells it', async () => {
    const { remote, laptop, syncLaptop } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'plan');
    await laptop.writeText('Scrawl/What: now?.md', 'x');
    const picky: RemoteStore = { ...interrupted(remote, 'write', async () => undefined), accepts: (path) => !/[:?]/.test(path) };
    const report = await syncLaptop(picky);
    expect(report.refused).toEqual(['Scrawl/What: now?.md']);
    expect(remote.paths()).toEqual(['Scrawl/Plan.md']);
    expect(await laptop.readText('Scrawl/What: now?.md')).toBe('x');
  });

  it('22. leaves a file gone from the remote between its listing and its reading for the next turn', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/a.md', 'a');
    await syncLaptop();
    const report = await syncPhone(interrupted(remote, 'read', async () => remote.remove('Scrawl/a.md', await tagOf(remote, 'Scrawl/a.md'))));
    expect(report.skipped).toEqual(['Scrawl/a.md']);
    await syncPhone();
    expect(await contents(phone)).toEqual({});
  });

  it('23. tells how a turn stands: its jobs in the order they go, how each ended, and a share that only grows', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('a.md', 'a');
    await laptop.writeText('b.md', 'b');
    await syncLaptop();
    await syncPhone();
    await phone.writeText('a.md', 'a, changed');
    await phone.writeText('c.md', 'c');
    await syncPhone();
    await laptop.writeText('d.md', 'd');
    await laptop.remove('b.md');
    await laptop.writeText('What: now?.md', 'x');
    const seen: SyncProgress[] = [];
    const picky: RemoteStore = { ...interrupted(remote, 'write', async () => undefined), accepts: (path) => !path.includes(':') };
    await syncOnce(laptop, picky, LAPTOP, { now, saveEveryMs: 0, onProgress: (p) => seen.push({ ...p, jobs: p.jobs.map((job) => ({ ...job })) }) });
    const last = seen.at(-1)!;
    expect(last.jobs.map((job) => [job.kind, job.path, job.state, job.result])).toEqual([
      ['name', 'What: now?.md', 'refused', undefined],
      ['down', 'a.md', 'done', 'brought'],
      ['down', 'c.md', 'done', 'brought'],
      ['up', 'd.md', 'done', 'sent'],
      ['removeThere', 'b.md', 'done', 'removedThere'],
    ]);
    expect(last.files).toEqual({ done: 4, total: 4 });
    expect([...new Set(seen.map((p) => p.stage))]).toEqual(['reading', 'checking', 'sending']);
    const shares = seen.map((p) => p.share);
    expect(shares.every((share, i) => share < 1 && (i === 0 || share >= shares[i - 1]!))).toBe(true);
    const planned = seen.find((p) => p.stage === 'sending')!;
    expect(planned.jobs.filter((job) => job.state === 'waiting')).toHaveLength(4);
  });

  it('24. tells a job left for the next turn, and where it changed', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Plan.md', 'one');
    await syncLaptop();
    await syncPhone();
    await phone.writeText('Plan.md', 'two');
    await syncPhone();
    let last: SyncProgress | null = null;
    await syncOnce(laptop, interrupted(remote, 'read', () => laptop.writeText('Plan.md', 'three')), LAPTOP, { now, saveEveryMs: 0, onProgress: (p) => (last = p) });
    expect(last!.jobs.map((job) => [job.path, job.state, job.reason])).toEqual([['Plan.md', 'skipped', 'here']]);
  });

  it('25. keeps the lines two devices added at the end of a note, with no copy beside it', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Scrawl/Scribbles.md', 'call the bank\n');
    await syncLaptop();
    await syncPhone();
    await phone.writeText('Scrawl/Scribbles.md', 'call the bank\nbuy milk\n');
    await syncPhone();
    await laptop.writeText('Scrawl/Scribbles.md', 'call the bank\nbook the dinner\n');
    const report = await syncLaptop();
    expect(report.conflicts).toEqual([]);
    expect(await laptop.readText('Scrawl/Scribbles.md')).toBe('call the bank\nbuy milk\nbook the dinner\n');
    await syncPhone();
    expect(await contents(phone)).toEqual(await contents(laptop));
    expect(remote.paths()).toEqual(['Scrawl/Scribbles.md']);
  });

  describe('26. reads everything again when the other side refuses a file its listing told nothing of', () => {
    /**
     * The phone's record of a note is behind what is there: after `there` is done to the remote,
     * the phone's cursor is moved past it while its record stays as it was.
     */
    async function behind(there: (sides: ReturnType<typeof setup>) => Promise<unknown>) {
      const sides = setup();
      const { remote, laptop, phone, syncLaptop, syncPhone } = sides;
      await laptop.writeText('Inbox/Note.md', 'one\ntwo\nthree\n');
      await syncLaptop();
      await syncPhone();
      await there(sides);
      const state = JSON.parse(await phone.readText('.scrawl/sync-state.json'));
      state.cursor = (await remote.changes(null)).cursor;
      await phone.writeText('.scrawl/sync-state.json', JSON.stringify(state));
      return sides;
    }
    const gone = ({ remote }: ReturnType<typeof setup>) => tagOf(remote, 'Inbox/Note.md').then((tag) => remote.remove('Inbox/Note.md', tag));

    it('deleted here and gone there: refused once, then forgotten', async () => {
      const { remote, phone, syncPhone } = await behind(gone);
      await trashItem(phone, 'Inbox/Note.md', now());
      expect((await syncPhone()).skipped).toContain('Inbox/Note.md');
      expect((await syncPhone()).skipped).toEqual([]);
      expect(remote.paths().filter((path) => path.startsWith('Inbox/'))).toEqual([]);
      expect((await readTrash(phone)).map((item) => item.title)).toEqual(['Note']);
      const calls = { ...remote.calls };
      expect(Object.values(await syncPhone()).every((list: unknown[]) => list.length === 0)).toBe(true);
      expect(remote.calls).toEqual(calls);
    });

    it('changed here and gone there: the change goes up', async () => {
      const { remote, phone, syncPhone } = await behind(gone);
      await phone.writeText('Inbox/Note.md', 'one\ntwo\nthree\nfour\n');
      expect((await syncPhone()).skipped).toEqual(['Inbox/Note.md']);
      const report = await syncPhone();
      expect(report.skipped).toEqual([]);
      expect(report.uploaded).toEqual(['Inbox/Note.md']);
      expect(await remote.text('Inbox/Note.md')).toBe('one\ntwo\nthree\nfour\n');
    });

    it('changed on both sides: merged', async () => {
      const { remote, laptop, phone, syncLaptop, syncPhone } = await behind(async (sides) => {
        await sides.laptop.writeText('Inbox/Note.md', 'ONE\ntwo\nthree\n');
        await sides.syncLaptop();
      });
      await phone.writeText('Inbox/Note.md', 'one\ntwo\nTHREE\n');
      expect((await syncPhone()).skipped).toEqual(['Inbox/Note.md']);
      expect((await syncPhone()).merged).toEqual(['Inbox/Note.md']);
      expect(await remote.text('Inbox/Note.md')).toBe('ONE\ntwo\nTHREE\n');
      await syncLaptop();
      expect(await contents(laptop)).toEqual(await contents(phone));
    });
  });

  describe('27. a device back after a long time: what was deleted meanwhile is not put in the trash again', () => {
    /** A device telling when its files were written as a disk does, in milliseconds, from the 7th of October on. */
    const onDisk = (fs: MemoryFs): VaultFs => {
      const clock = (entry: Entry | null) => (entry?.modified === undefined ? entry : { ...entry, modified: Date.UTC(2026, 9, 7) + entry.modified * 1000 });
      return new Proxy(fs, {
        get(target, prop) {
          if (prop === 'list') return async (dir: string) => (await target.list(dir)).map(clock);
          if (prop === 'stat') return async (path: string) => clock(await target.stat(path));
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };

    it('a folder deleted there after its notes changed: removed here outright, the trash holding one of it', async () => {
      const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
      await laptop.writeText('Scrawl/Plan.md', 'plan');
      await laptop.writeText('Scrawl/Deep/Notes.md', 'notes');
      await syncLaptop();
      await syncPhone();
      // While the laptop is away the phone changes a note, then deletes the folder.
      await phone.writeText('Scrawl/Plan.md', 'plan, later');
      await syncPhone();
      await trashFolder(phone, 'Scrawl', now());
      await syncPhone();
      // The note not changed follows its move into the trash; the one changed there is gone here.
      const report = await syncLaptop();
      expect(report.removedHere).toEqual(['Scrawl/Plan.md']);
      expect(report.uploaded).toEqual([]);
      expect((await readTrash(laptop)).map((item) => item.from)).toEqual(['Scrawl']);
      await syncPhone();
      expect(await contents(phone)).toEqual(await contents(laptop));
    });

    it('a note in a folder deleted before it was written, deleted by another program: still to this device’s trash', async () => {
      const { remote, laptop } = setup();
      const disk = onDisk(laptop);
      const sync = () => syncOnce(disk, remote, LAPTOP, { now, saveEveryMs: 0 });
      await laptop.writeText('Inbox/Old.md', 'old');
      await trashFolder(laptop, 'Inbox', new Date(2026, 9, 1));
      await laptop.writeText('Inbox/New.md', 'new');
      await sync();
      await remote.remove('Inbox/New.md', await tagOf(remote, 'Inbox/New.md'));
      await sync();
      expect((await readTrash(laptop)).map((item) => item.from).sort()).toEqual(['Inbox', 'Inbox/New.md']);
    });

    it('a list a task was deleted from, deleted by another program: still to this device’s trash', async () => {
      const { remote, laptop, syncLaptop } = setup();
      await laptop.writeText('Plans/Week.tasks.json', serializeList({ ...parseList(''), tasks: [task('a'), task('b')] }));
      await trashPiece(laptop, 'Plans/Week.tasks.json', { version: 1, kind: 'task', section: null, parent: null, after: null, tasks: [task('b')] }, now());
      await syncLaptop();
      await remote.remove('Plans/Week.tasks.json', await tagOf(remote, 'Plans/Week.tasks.json'));
      await syncLaptop();
      expect((await readTrash(laptop)).filter((item) => item.kind === 'tasks').map((item) => item.from)).toEqual(['Plans/Week.tasks.json']);
    });
  });

  describe('28. a file here alone, gone on the other side with no trace in its trash: in this device’s trash only', () => {
    /** The laptop has a note the remote lost with nothing in its trash: deleted for good there, or by another program. */
    async function leftHere() {
      const sides = setup();
      await sides.laptop.writeText('test/Note.md', 'test');
      await sides.syncLaptop();
      await sides.remote.remove('test/Note.md', await tagOf(sides.remote, 'test/Note.md'));
      const report = await sides.syncLaptop();
      return { ...sides, report };
    }
    const trashThere = (remote: MemoryRemote) => remote.paths().filter((p) => p.startsWith('.scrawl/trash/') && p !== '.scrawl/trash/index.json');

    it('goes to the trash here, is never sent up, and the other device does not see it', async () => {
      const { remote, laptop, phone, report, syncLaptop, syncPhone } = await leftHere();
      expect(report.removedHere).toEqual(['test/Note.md']);
      expect((await readTrash(laptop)).map((item) => [item.from, item.here])).toEqual([['test/Note.md', true]]);
      expect(trashThere(remote)).toEqual([]);
      // Only the trash's index goes up, with the row of where it was.
      expect((await syncLaptop()).uploaded).toEqual(['.scrawl/trash/index.json']);
      expect((await syncLaptop()).uploaded).toEqual([]);
      expect(trashThere(remote)).toEqual([]);
      await syncPhone();
      expect(await readTrash(phone)).toEqual([]);
    });

    it('restored, it is synced again', async () => {
      const { remote, laptop, syncLaptop } = await leftHere();
      const [item] = await readTrash(laptop);
      expect(await restoreFromTrash(laptop, item!)).toBe('test/Note.md');
      expect(await laptop.stat('.scrawl/trash-here.json')).toBeNull();
      expect((await syncLaptop()).uploaded).toContain('test/Note.md');
      expect(await remote.text('test/Note.md')).toBe('test');
    });

    it('deleted for good or with the trash emptied, it is forgotten here and nothing goes up', async () => {
      const { remote, laptop, syncLaptop } = await leftHere();
      const [item] = await readTrash(laptop);
      await deleteFromTrash(laptop, item!);
      expect(await laptop.stat('.scrawl/trash-here.json')).toBeNull();
      await syncLaptop();
      expect(trashThere(remote)).toEqual([]);

      const again = await leftHere();
      await emptyTrash(again.laptop);
      expect(await again.laptop.stat('.scrawl/trash-here.json')).toBeNull();
      expect((await again.syncLaptop()).uploaded).toEqual([]);
    });
  });

  describe('29. a folder with folders in it, deleted on one device: the other device’s empty folders do not bring it back', () => {
    const client = (path: string) => path === 'Client' || path.startsWith('Client/');

    it('they go with it, there and in the trash, deleted for good too', async () => {
      const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
      await laptop.writeText('Client/Brief.md', 'brief');
      await laptop.writeText('Client/2026/Notes.md', 'notes');
      await laptop.writeText('Client/2026/Q4/Plan.md', 'plan');
      await syncLaptop();
      await syncPhone();
      // On a disk the folders stay when what was in them goes, as they do not in memory.
      const onDisk = (root: string) => Promise.all(['', '/2026', '/2026/Q4'].map((dir) => phone.mkdir(`${root}${dir}`)));
      await onDisk('Client');
      await trashFolder(laptop, 'Client', now());
      await syncLaptop();
      await syncPhone();
      await syncLaptop();
      expect(remote.dirPaths().filter(client)).toEqual([]);
      for (const fs of [laptop, phone]) {
        expect((await dirs(fs)).filter(client)).toEqual([]);
        expect(await readTrash(fs)).toHaveLength(1);
      }
      // Deleted for good, its copy in the phone's trash leaving its folders there too.
      const [item] = await readTrash(laptop);
      await onDisk(item!.path);
      await deleteFromTrash(laptop, item!);
      await syncLaptop();
      await syncPhone();
      await syncLaptop();
      expect(remote.dirPaths().filter((path) => path.startsWith(item!.path))).toEqual([]);
      for (const fs of [laptop, phone]) expect(await readTrash(fs)).toEqual([]);
    });

    it('a folder made in it on the other device meanwhile keeps it, there too', async () => {
      const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
      await laptop.writeText('Client/2026/Notes.md', 'notes');
      await syncLaptop();
      await syncPhone();
      for (const dir of ['Client', 'Client/2026', 'Client/2026/Ideas']) await phone.mkdir(dir);
      await trashFolder(laptop, 'Client', now());
      await syncLaptop();
      await syncPhone();
      await syncLaptop();
      const kept = ['Client', 'Client/2026', 'Client/2026/Ideas'];
      expect(remote.dirPaths().filter(client)).toEqual(kept);
      for (const fs of [laptop, phone]) expect((await dirs(fs)).filter(client)).toEqual(kept);
    });
  });

  it('does nothing on a turn when nothing changed', async () => {
    const { remote, laptop, syncLaptop } = setup();
    await laptop.writeText('Scrawl/Plan.md', 'plan');
    await syncLaptop();
    const calls = { ...remote.calls };
    const report = await syncLaptop();
    expect(Object.values(report).every((list: string[]) => list.length === 0)).toBe(true);
    expect(remote.calls).toEqual(calls);
  });
});
