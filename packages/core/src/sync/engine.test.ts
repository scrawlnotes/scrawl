import { describe, expect, it } from 'vitest';
import { type Card, parseBoard, serializeBoard } from '../board';
import { MemoryFs, type VaultFs } from '../fs';
import { parseList, serializeList, type Task } from '../tasks';
import { readTrash, trashFolder, trashItem } from '../vault';
import { type SyncDevice, syncOnce } from './engine';
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

/** A remote that does something else once, just before one kind of call: another device writing in between. */
function interrupted(remote: MemoryRemote, before: 'write' | 'remove', meanwhile: () => Promise<unknown>): RemoteStore {
  let done = false;
  const once = async () => {
    if (done) return;
    done = true;
    await meanwhile();
  };
  return {
    changes: (cursor) => remote.changes(cursor),
    read: (path) => remote.read(path),
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
    await laptop.writeText('Inbox/tasks.json', serializeList({ sections: [], tasks: [task('a')] }));
    await laptop.writeBlob('_attachments/photo.png', new Blob([new Uint8Array([1, 2, 3])]));
    await syncLaptop();
    expect(remote.paths()).toEqual(['Inbox/tasks.json', 'Scrawl/Plan.md', '_attachments/photo.png']);
    await syncPhone();
    expect(await contents(phone)).toEqual(await contents(laptop));
  });

  it('2. on a first sync of two full sides, links what is alike and merges what is not', async () => {
    const { remote, laptop, phone, syncLaptop, syncPhone } = setup();
    for (const fs of [laptop, phone]) await fs.writeText('Scrawl/Same.md', 'alike');
    await laptop.writeText('Scrawl/Plan.md', 'from the laptop');
    await phone.writeText('Scrawl/Plan.md', 'from the phone');
    await laptop.writeText('Inbox/tasks.json', serializeList({ sections: [], tasks: [task('a')] }));
    await phone.writeText('Inbox/tasks.json', serializeList({ sections: [], tasks: [task('b')] }));
    await syncLaptop();
    const writes = remote.calls.write;
    const report = await syncPhone();
    expect(report.uploaded).not.toContain('Scrawl/Same.md');
    expect(await phone.readText('Scrawl/Plan.md')).toBe('from the phone');
    expect(report.conflicts).toEqual(['Scrawl/Plan (conflict, Phone, 2026-10-07 1432).md']);
    expect(await phone.readText(report.conflicts[0]!)).toBe('from the laptop');
    expect(parseList(await phone.readText('Inbox/tasks.json')).tasks.map((t) => t.id).sort()).toEqual(['a', 'b']);
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
