import { describe, expect, it } from 'vitest';
import { MemoryFs, type VaultFs } from '../fs';
import { type SyncDevice, syncOnce } from './engine';
import { FakeGraph } from './fake-graph';
import { OneDriveAccount, OneDriveRemote, oneDriveTakes, UPLOAD_PART } from './onedrive';
import { isSynced } from './paths';
import { quickXorHash } from './quickxor';
import { RemoteConflict, RemoteFolderGone, RemoteOffline, RemoteSignedOut } from './remote';

// The OneDrive adapter against a Graph in memory (design/cloud.md, section 11), and the engine
// through it.

const LAPTOP: SyncDevice = { id: 'laptop-id', name: 'Laptop' };
const PHONE: SyncDevice = { id: 'phone-id', name: 'Phone' };
const now = () => new Date(2026, 9, 7, 14, 32);

function setup() {
  const graph = new FakeGraph();
  const folder = graph.folder('Scrawl');
  const slept: number[] = [];
  const remoteOf = (fs: VaultFs) =>
    new OneDriveRemote({
      folder,
      fs,
      fetch: graph.fetch,
      token: async (fresh) => (fresh ? graph.token : 'token-1'),
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
  const laptop = new MemoryFs();
  const phone = new MemoryFs();
  const laptopRemote = remoteOf(laptop);
  const phoneRemote = remoteOf(phone);
  return {
    graph,
    folder,
    slept,
    laptop,
    phone,
    laptopRemote,
    syncLaptop: () => syncOnce(laptop, laptopRemote, LAPTOP, { now, saveEveryMs: 0 }),
    syncPhone: () => syncOnce(phone, phoneRemote, PHONE, { now, saveEveryMs: 0 }),
  };
}

async function contents(fs: VaultFs, dir = '', out: Record<string, string> = {}): Promise<Record<string, string>> {
  for (const entry of await fs.list(dir)) {
    if (!isSynced(entry.path)) continue;
    if (entry.kind === 'dir') await contents(fs, entry.path, out);
    else out[entry.path] = await fs.readText(entry.path);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Microsoft's C# sample for QuickXorHash, line by line, with its 64-bit cells as BigInt: the reference the fast one is held to. */
function referenceQuickXor(data: Uint8Array, chunks: number[]): string {
  const bitsInLastCell = 32;
  const shift = 11;
  const widthInBits = 160;
  const mask = (1n << 64n) - 1n;
  const cells = [0n, 0n, 0n];
  let lengthSoFar = 0n;
  let shiftSoFar = 0;
  const hashCore = (array: Uint8Array, ibStart: number, cbSize: number) => {
    let vectorArrayIndex = Math.floor(shiftSoFar / 64);
    let vectorOffset = shiftSoFar % 64;
    const iterations = Math.min(cbSize, widthInBits);
    for (let i = 0; i < iterations; i++) {
      const isLastCell = vectorArrayIndex === cells.length - 1;
      const bitsInVectorCell = isLastCell ? bitsInLastCell : 64;
      if (vectorOffset <= bitsInVectorCell - 8) {
        for (let j = ibStart + i; j < cbSize + ibStart; j += widthInBits) cells[vectorArrayIndex] = cells[vectorArrayIndex]! ^ ((BigInt(array[j]!) << BigInt(vectorOffset)) & mask);
      } else {
        const index1 = vectorArrayIndex;
        const index2 = isLastCell ? 0 : vectorArrayIndex + 1;
        const low = bitsInVectorCell - vectorOffset;
        let xoredByte = 0;
        for (let j = ibStart + i; j < cbSize + ibStart; j += widthInBits) xoredByte ^= array[j]!;
        cells[index1] = cells[index1]! ^ ((BigInt(xoredByte) << BigInt(vectorOffset)) & mask);
        cells[index2] = cells[index2]! ^ (BigInt(xoredByte) >> BigInt(low));
      }
      vectorOffset += shift;
      while (vectorOffset >= bitsInVectorCell) {
        vectorArrayIndex = isLastCell ? 0 : vectorArrayIndex + 1;
        vectorOffset -= bitsInVectorCell;
      }
    }
    shiftSoFar = (shiftSoFar + shift * (cbSize % widthInBits)) % widthInBits;
    lengthSoFar += BigInt(cbSize);
  };
  let at = 0;
  for (const size of chunks) {
    hashCore(data, at, size);
    at += size;
  }
  const rgb = new Uint8Array(20);
  const bytesOf = (value: bigint, count: number, into: number) => {
    for (let i = 0; i < count; i++) rgb[into + i] = Number((value >> BigInt(8 * i)) & 0xffn);
  };
  bytesOf(cells[0]!, 8, 0);
  bytesOf(cells[1]!, 8, 8);
  bytesOf(cells[2]!, 4, 16);
  for (let i = 0; i < 8; i++) rgb[12 + i] = rgb[12 + i]! ^ Number((lengthSoFar >> BigInt(8 * i)) & 0xffn);
  return btoa(String.fromCharCode(...rgb));
}

function randomBytes(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

describe('QuickXorHash', () => {
  it('gives the known digests', async () => {
    expect(await quickXorHash(new Blob([]))).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(await quickXorHash(new Blob(['J']))).toBe('SgAAAAAAAAAAAAAAAQAAAAAAAAA=');
    expect(await quickXorHash(new Blob([new Uint8Array([0xb5, 0xb4])]))).toBe('taAFAAAAAAAAAAAAAgAAAAAAAAA=');
  });

  it("agrees with Microsoft's sample at every length and however the sample is fed", async () => {
    for (const length of [1, 2, 7, 8, 19, 20, 21, 159, 160, 161, 319, 320, 321, 1000, 4097]) {
      const data = randomBytes(length, length);
      const mine = await quickXorHash(new Blob([data]));
      expect(mine).toBe(referenceQuickXor(data, [length]));
      // The sample fed in uneven pieces must not change its answer either.
      const pieces: number[] = [];
      for (let left = length, n = 1; left > 0; n = (n * 7 + 3) % 211) pieces.push(Math.min(left, n)), (left -= Math.min(left, n));
      expect(referenceQuickXor(data, pieces)).toBe(mine);
    }
  });

  it('reads a large file slice by slice to the same digest', async () => {
    const data = randomBytes(4 * 1024 * 1024 + 333, 9);
    expect(await quickXorHash(new Blob([data]))).toBe(referenceQuickXor(data, [data.length]));
  });
});

describe('OneDrive adapter', () => {
  it('reads the list of changes page by page, and from its cursor only what changed since', async () => {
    const { graph, laptopRemote } = setup();
    graph.pageSize = 2;
    for (const name of ['a', 'b', 'c', 'd', 'e']) await graph.put(`Scrawl/Notes/${name}.md`, name);
    const first = await laptopRemote.changes(null);
    expect(first.full).toBe(true);
    expect(first.changed.map((e) => e.path).sort()).toEqual(['Notes', 'Notes/a.md', 'Notes/b.md', 'Notes/c.md', 'Notes/d.md', 'Notes/e.md']);
    expect(graph.calls.delta).toBe(4);
    await graph.put('Scrawl/Notes/b.md', 'b, changed');
    const next = await laptopRemote.changes(first.cursor);
    expect(next.full).toBeUndefined();
    expect(next.changed).toEqual([expect.objectContaining({ path: 'Notes/b.md', kind: 'file' })]);
    expect(next.removed).toEqual([]);
  });

  it('builds paths from ids, and gives the same cursor and writes nothing when nothing changed', async () => {
    const { graph, laptop, laptopRemote } = setup();
    await graph.put('Scrawl/Work/Client/Brief.md', 'brief');
    await graph.put('Elsewhere/Other.md', 'not in the space');
    const first = await laptopRemote.changes(null);
    expect(first.changed.map((e) => e.path).sort()).toEqual(['Work', 'Work/Client', 'Work/Client/Brief.md']);
    const map = await laptop.readText('.scrawl/onedrive.json');
    const again = await laptopRemote.changes(first.cursor);
    expect(again).toEqual({ changed: [], removed: [], cursor: first.cursor });
    expect(await laptop.readText('.scrawl/onedrive.json')).toBe(map);
  });

  it('tells a renamed or moved folder as every file in it gone from the old path and there at the new one, with the same tags', async () => {
    const { graph, laptopRemote } = setup();
    await graph.put('Scrawl/Client/Brief.md', 'brief');
    await graph.put('Scrawl/Client/Notes/Call.md', 'call');
    const first = await laptopRemote.changes(null);
    const tags = Object.fromEntries(first.changed.flatMap((e) => (e.kind === 'file' ? [[e.path, e.tag]] : [])));
    graph.rename('Scrawl/Client', 'Clients');
    const next = await laptopRemote.changes(first.cursor);
    expect(next.removed.sort()).toEqual(['Client', 'Client/Brief.md', 'Client/Notes', 'Client/Notes/Call.md']);
    const files = next.changed.flatMap((e) => (e.kind === 'file' ? [[e.path, e.tag]] : []));
    expect(Object.fromEntries(files)).toEqual({ 'Clients/Brief.md': tags['Client/Brief.md'], 'Clients/Notes/Call.md': tags['Client/Notes/Call.md'] });
    // A folder moved out of the space is gone with everything in it.
    graph.moveTo('Scrawl/Clients', 'Elsewhere');
    const out = await laptopRemote.changes(next.cursor);
    expect(out.removed.sort()).toEqual(['Clients', 'Clients/Brief.md', 'Clients/Notes', 'Clients/Notes/Call.md']);
  });

  it('lists everything again, as a full listing, when its cursor is too old', async () => {
    const { graph, laptopRemote } = setup();
    await graph.put('Scrawl/a.md', 'a');
    const first = await laptopRemote.changes(null);
    graph.expireListings();
    await graph.put('Scrawl/b.md', 'b');
    const next = await laptopRemote.changes(first.cursor);
    expect(next.full).toBe(true);
    expect(next.changed.map((e) => e.path).sort()).toEqual(['a.md', 'b.md']);
  });

  it('lists again what changed since a cursor the engine kept, after a newer listing', async () => {
    const { graph, laptopRemote } = setup();
    await graph.put('Scrawl/a.md', 'a');
    const first = await laptopRemote.changes(null);
    await graph.put('Scrawl/a.md', 'a, changed');
    const second = await laptopRemote.changes(first.cursor);
    await graph.put('Scrawl/b.md', 'b');
    const again = await laptopRemote.changes(first.cursor);
    expect(again.full).toBeUndefined();
    expect(again.changed.map((e) => e.path).sort()).toEqual(['a.md', 'b.md']);
    expect(second.cursor).not.toBe(first.cursor);
  });

  it('refuses writes over a file that changed, and new files where one is, as conflicts', async () => {
    const { graph, laptopRemote } = setup();
    const sent = await laptopRemote.write('Plan.md', new Blob(['one']), null);
    expect(await graph.text('Scrawl/Plan.md')).toBe('one');
    await expect(laptopRemote.write('Plan.md', new Blob(['two']), null)).rejects.toBeInstanceOf(RemoteConflict);
    await graph.put('Scrawl/Plan.md', 'changed by another program');
    await expect(laptopRemote.write('Plan.md', new Blob(['two']), sent.tag)).rejects.toBeInstanceOf(RemoteConflict);
    await expect(laptopRemote.remove('Plan.md', sent.tag)).rejects.toBeInstanceOf(RemoteConflict);
    await expect(laptopRemote.move('Plan.md', 'Old/Plan.md', sent.tag)).rejects.toBeInstanceOf(RemoteConflict);
    await expect(laptopRemote.read('Gone.md')).rejects.toBeInstanceOf(RemoteConflict);
    expect(await graph.text('Scrawl/Plan.md')).toBe('changed by another program');
  });

  it('writes into folders it makes, moves into folders it makes, and gives digests OneDrive agrees with', async () => {
    const { graph, laptopRemote } = setup();
    const sent = await laptopRemote.write('Work/Client/Plan.md', new Blob(['plan']), null);
    expect(sent.hash).toBe(await laptopRemote.hashOf(new Blob(['plan'])));
    const moved = await laptopRemote.move('Work/Client/Plan.md', 'Archive/2026/Plan.md', sent.tag);
    expect(moved.tag).toBe(sent.tag);
    await laptopRemote.mkdir('Empty/Inner');
    await laptopRemote.mkdir('Empty/Inner');
    expect(graph.paths('Scrawl')).toEqual(['Archive/2026/Plan.md']);
    expect(await (await laptopRemote.read('Archive/2026/Plan.md')).text()).toBe('plan');
  });

  it('sends a large file in parts, and goes on from where the session stands when an answer is lost', async () => {
    const { graph, laptopRemote } = setup();
    const data = randomBytes(10 * 1024 * 1024 + 7, 3);
    graph.loseNextPartAnswer = true;
    const sent = await laptopRemote.write('_attachments/video.bin', new Blob([data]), null);
    expect(graph.calls.session).toBe(1);
    expect(graph.calls.part).toBe(Math.ceil(data.length / UPLOAD_PART));
    expect(sent.size).toBe(data.length);
    expect(sent.hash).toBe(await quickXorHash(new Blob([data])));
    const back = await laptopRemote.read('_attachments/video.bin');
    expect(back.size).toBe(data.length);
    expect(await quickXorHash(back)).toBe(sent.hash);
    await expect(laptopRemote.write('_attachments/video.bin', new Blob([data]), null)).rejects.toBeInstanceOf(RemoteConflict);
  });

  it('tells how much it read of the list, and how much of a large file went or came', async () => {
    const { graph, laptopRemote } = setup();
    graph.pageSize = 2;
    for (const name of ['a', 'b', 'c']) await graph.put(`Scrawl/${name}.md`, name);
    const listed: number[] = [];
    await laptopRemote.changes(null, (count) => listed.push(count));
    expect(listed).toEqual([2, 4]);
    const data = randomBytes(10 * 1024 * 1024 + 7, 5);
    const sent: number[] = [];
    await laptopRemote.write('_attachments/big.bin', new Blob([data]), null, (done) => sent.push(done));
    expect(sent).toEqual([UPLOAD_PART, 2 * UPLOAD_PART, data.length]);
    const came: number[] = [];
    const back = await laptopRemote.read('_attachments/big.bin', (done) => came.push(done));
    expect(back.size).toBe(data.length);
    expect(came.at(-1)).toBe(data.length);
    expect(came.every((done, i) => i === 0 || done > came[i - 1]!)).toBe(true);
  });

  it('asks for a new token once when one is refused, and waits as long as a busy OneDrive asks', async () => {
    const { graph, slept, laptopRemote } = setup();
    graph.token = 'token-2';
    graph.busy = 2;
    await laptopRemote.changes(null);
    expect(slept).toEqual([1000, 1000]);
    graph.token = 'token-3';
    const signedOut = new OneDriveRemote({ folder: 'x', fs: new MemoryFs(), fetch: graph.fetch, token: async () => 'token-2' });
    await expect(signedOut.changes(null)).rejects.toBeInstanceOf(RemoteSignedOut);
    graph.offline = 1;
    await expect(laptopRemote.read('a.md')).rejects.toBeInstanceOf(RemoteOffline);
  });

  it('tells when the space folder is gone', async () => {
    const { graph, laptopRemote } = setup();
    await graph.put('Scrawl/a.md', 'a');
    const first = await laptopRemote.changes(null);
    graph.remove('Scrawl');
    await expect(laptopRemote.changes(first.cursor)).rejects.toBeInstanceOf(RemoteFolderGone);
  });

  it('follows a work account through the whole drive, keeping to the folder', async () => {
    const { graph, laptopRemote } = setup();
    graph.driveType = 'business';
    await graph.put('Scrawl/a.md', 'a');
    await graph.put('Elsewhere/b.md', 'b');
    const first = await laptopRemote.changes(null);
    expect(first.changed.map((e) => e.path)).toEqual(['a.md']);
    graph.moveTo('Elsewhere/b.md', 'Scrawl');
    const next = await laptopRemote.changes(first.cursor);
    expect(next.changed.map((e) => e.path)).toEqual(['b.md']);
    graph.remove('Scrawl');
    await expect(laptopRemote.changes(next.cursor)).rejects.toBeInstanceOf(RemoteFolderGone);
  });

  it('takes only names OneDrive takes', () => {
    for (const name of ['Plan.md', 'Çalışma notları.md', '.scrawl', 'a.b.c']) expect(oneDriveTakes(name)).toBe(true);
    for (const name of ['What: now?.md', 'a|b', 'CON', 'con.txt', 'trailing.', ' lead', 'end ', '~$draft.docx', 'x_vti_y', 'desktop.ini', '.lock']) expect(oneDriveTakes(name)).toBe(false);
  });

  it('tells the account and its folders, and makes a folder or takes the one there', async () => {
    const { graph } = setup();
    graph.folder('Documents/Notes');
    const account = new OneDriveAccount({ fetch: graph.fetch, token: async () => graph.token });
    expect(await account.me()).toEqual({ name: 'Kaan Arslan', email: 'kaan@outlook.com' });
    expect((await account.folders(null)).map((f) => f.name)).toEqual(['Documents', 'Scrawl']);
    const documents = (await account.folders(null)).find((f) => f.name === 'Documents')!;
    expect((await account.folders(documents.id)).map((f) => f.name)).toEqual(['Notes']);
    const made = await account.createFolder(null, 'New');
    expect((await account.createFolder(null, 'new')).id).toBe(made.id);
  });
});

describe('sync through OneDrive', () => {
  it('brings two devices together, merges, moves without reading again, and deletes', async () => {
    const { graph, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Inbox/Plan.md', 'one\ntwo\nthree');
    await laptop.writeText('Work/Brief.md', 'brief');
    await syncLaptop();
    await syncPhone();
    expect(await contents(phone)).toEqual(await contents(laptop));

    await laptop.writeText('Inbox/Plan.md', 'ONE\ntwo\nthree');
    await phone.writeText('Inbox/Plan.md', 'one\ntwo\nTHREE');
    await syncLaptop();
    await syncPhone();
    await syncLaptop();
    for (const fs of [laptop, phone]) expect(await fs.readText('Inbox/Plan.md')).toBe('ONE\ntwo\nTHREE');

    // Renamed in OneDrive's own page: the phone moves its files, and reads nothing.
    graph.rename('Scrawl/Work', 'Clients');
    const downloads = graph.calls.download ?? 0;
    const report = await syncPhone();
    expect(report.moved).toEqual(['Clients/Brief.md']);
    expect(report.followed).toEqual([{ from: 'Work/Brief.md', to: 'Clients/Brief.md' }]);
    expect(graph.calls.download ?? 0).toBe(downloads);
    expect(Object.keys(await contents(phone))).toEqual(['Clients/Brief.md', 'Inbox/Plan.md']);

    await phone.remove('Inbox/Plan.md');
    await syncPhone();
    await syncLaptop();
    expect(Object.keys(await contents(laptop)).filter((p) => !p.startsWith('.scrawl/trash'))).toEqual(['Clients/Brief.md']);
    expect(graph.paths('Scrawl')).toEqual(['Clients/Brief.md']);
  });

  it('links a first sync of two full sides by digest, without reading files that are alike', async () => {
    const { graph, laptop, phone, syncLaptop, syncPhone } = setup();
    for (const fs of [laptop, phone]) {
      await fs.writeText('Inbox/Plan.md', 'plan');
      await fs.writeBlob('_attachments/scan.pdf', new Blob([randomBytes(5000, 1)]));
    }
    await syncLaptop();
    const report = await syncPhone();
    expect(report.downloaded).toEqual([]);
    expect(report.uploaded).toEqual([]);
    expect(graph.calls.download ?? 0).toBe(0);
  });

  it('keeps a name OneDrive does not take on the device, and tells it', async () => {
    const { graph, laptop, syncLaptop } = setup();
    await laptop.writeText('Inbox/What: now?.md', 'x');
    await laptop.writeText('Inbox/Plan.md', 'plan');
    const report = await syncLaptop();
    expect(report.refused).toEqual(['Inbox/What: now?.md']);
    expect(graph.paths('Scrawl')).toEqual(['Inbox/Plan.md']);
  });

  it('starts over from a full listing when its cursor is too old, losing and doubling nothing', async () => {
    const { graph, laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('a.md', 'a');
    await laptop.writeText('b.md', 'b');
    await syncLaptop();
    await syncPhone();
    graph.expireListings();
    graph.remove('Scrawl/b.md');
    await graph.put('Scrawl/c.md', 'c');
    const report = await syncPhone();
    expect(report.removedHere).toEqual(['b.md']);
    expect(report.downloaded).toEqual(['c.md']);
    expect(Object.keys(await contents(phone)).filter((p) => !p.startsWith('.scrawl/trash'))).toEqual(['a.md', 'c.md']);
  });
});
