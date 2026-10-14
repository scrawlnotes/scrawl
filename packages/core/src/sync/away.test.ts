import { describe, expect, it } from 'vitest';
import { listFiles } from '../files';
import { MemoryFs, type VaultFs } from '../fs';
import { AwayFilesError, copyToSpace, deleteFromTrash, emptyTrash, readTrash, restoreFromTrash, saveFile, sweepAttachments, trashItem } from '../vault';
import { readAway } from './away';
import { fetchAway, type SyncDevice, syncOnce } from './engine';
import { MemoryRemote } from './remote';

// Large attached files left on the other side on a device with a limit: the phone, while the
// laptop takes every file. See design/sync.md, section 10.

const LAPTOP: SyncDevice = { id: 'laptop-id', name: 'Laptop' };
const PHONE: SyncDevice = { id: 'phone-id', name: 'Phone' };
const now = () => new Date(2026, 9, 14, 15, 0);
const LIMIT = 1000;
const blob = (size: number, fill = 1) => new Blob([new Uint8Array(size).fill(fill)]);

function setup(hashes = false) {
  const remote = new MemoryRemote(hashes);
  const laptop = new MemoryFs();
  const phone = new MemoryFs();
  return {
    remote,
    laptop,
    phone,
    syncLaptop: () => syncOnce(laptop, remote, LAPTOP, { now, saveEveryMs: 0 }),
    syncPhone: (leaveOver: number | undefined = LIMIT) => syncOnce(phone, remote, PHONE, { now, saveEveryMs: 0, leaveOver }),
  };
}

const exists = (fs: VaultFs, path: string) => fs.readBlob(path).then(() => true, () => false);

/** A laptop with a site visit note, its large photo and a small one, synced; then the phone. */
async function siteVisit(hashes = false) {
  const s = setup(hashes);
  await s.laptop.writeText('Site visit.md', '![](_attachments/roof.png)\n![](_attachments/small.png)\n');
  await s.laptop.writeBlob('_attachments/roof.png', blob(4000));
  await s.laptop.writeBlob('_attachments/small.png', blob(200));
  await s.syncLaptop();
  const report = await s.syncPhone();
  return { ...s, report };
}

describe('files away', () => {
  it('leaves an attached file over the limit on the other side, and brings the rest', async () => {
    const { phone, remote, report } = await siteVisit();
    expect(report.left).toEqual(['_attachments/roof.png']);
    expect(await exists(phone, '_attachments/roof.png')).toBe(false);
    expect(await exists(phone, '_attachments/small.png')).toBe(true);
    expect(await phone.readText('Site visit.md')).toContain('roof.png');
    expect(await readAway(phone)).toEqual([{ path: '_attachments/roof.png', size: 4000 }]);
    expect((await listFiles(phone)).find((f) => f.name === 'roof.png')).toMatchObject({ away: true, size: 4000 });
    expect(remote.paths()).toContain('_attachments/roof.png');
  });

  it('never takes a file away for deleted: the next turns leave it on the other side', async () => {
    const { phone, remote, syncPhone } = await siteVisit();
    const calls = { ...remote.calls };
    const report = await syncPhone();
    expect(report.removedThere).toEqual([]);
    expect(report.left).toEqual([]);
    expect(remote.calls).toEqual(calls);
    expect(remote.paths()).toContain('_attachments/roof.png');
    expect(await readAway(phone)).toHaveLength(1);
  });

  it('brings everything that is not an attached file, however large', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = setup();
    await laptop.writeText('Long.md', 'x'.repeat(5000));
    await laptop.writeBlob('Scrawl/drawing.png', blob(5000));
    await syncLaptop();
    const report = await syncPhone();
    expect(report.left).toEqual([]);
    expect(await exists(phone, 'Long.md')).toBe(true);
    expect(await exists(phone, 'Scrawl/drawing.png')).toBe(true);
  });

  it('brings a file away when the limit goes up, or when it is asked for', async () => {
    const { phone, remote, syncPhone } = await siteVisit();
    expect(await fetchAway(phone, remote, PHONE, '_attachments/roof.png')).toBe(true);
    expect((await phone.readBlob('_attachments/roof.png')).size).toBe(4000);
    expect(await readAway(phone)).toEqual([]);
    const writes = remote.calls.write;
    const report = await syncPhone();
    expect(report.uploaded).toEqual([]);
    expect(remote.calls.write).toBe(writes);
    expect(await fetchAway(phone, remote, PHONE, '_attachments/roof.png')).toBe(false);

    const other = await siteVisit();
    const raised = await other.syncPhone(10_000);
    expect(raised.downloaded).toEqual(['_attachments/roof.png']);
    expect(await readAway(other.phone)).toEqual([]);
  });

  it('forgets a file away that went on the other side, and keeps it in the trash there as away', async () => {
    const { laptop, phone, syncLaptop, syncPhone } = await siteVisit();
    await laptop.writeText('Site visit.md', '![](_attachments/small.png)\n');
    expect(await sweepAttachments(laptop, () => [], now())).toBe(1);
    await syncLaptop();
    const report = await syncPhone();
    expect(report.removedHere).toEqual([]);
    expect(await readAway(phone)).toEqual([{ path: expect.stringMatching(/^\.scrawl\/trash\/.* roof\.png$/), size: 4000 }]);
    expect((await readTrash(phone)).map((item) => [item.title, item.kind, item.away])).toEqual([['roof.png', 'attachment', true]]);
  });

  it('moves a file away to the trash on the other side, back, and deletes it there for good', async () => {
    const { laptop, phone, remote, syncLaptop, syncPhone } = await siteVisit();
    // Deleted on the phone, where it is not: the trash has it at once, the other side with the next turn.
    await trashItem(phone, '_attachments/roof.png', now());
    const [item] = await readTrash(phone);
    expect(item).toMatchObject({ kind: 'attachment', title: 'roof.png', from: '_attachments/roof.png', away: true, size: 4000 });
    expect((await listFiles(phone)).map((f) => f.name)).toEqual(['small.png']);
    await syncPhone();
    expect(remote.paths()).toContain(item!.path);
    expect(remote.paths()).not.toContain('_attachments/roof.png');
    await syncLaptop();
    expect(await exists(laptop, '_attachments/roof.png')).toBe(false);
    expect(await exists(laptop, item!.path)).toBe(true);

    // Restored on the phone: back in the attachments there, and on the laptop.
    expect(await restoreFromTrash(phone, item!)).toBe('_attachments/roof.png');
    expect(await readTrash(phone)).toEqual([]);
    await syncPhone();
    expect(remote.paths()).toContain('_attachments/roof.png');
    await syncLaptop();
    expect(await exists(laptop, '_attachments/roof.png')).toBe(true);

    // Deleted for good from the phone's trash: gone there, and from the laptop.
    await trashItem(phone, '_attachments/roof.png', now());
    await syncPhone();
    await syncLaptop();
    const [again] = await readTrash(phone);
    await deleteFromTrash(phone, again!);
    expect(await readTrash(phone)).toEqual([]);
    await syncPhone();
    expect(remote.paths().filter((p) => p.includes('roof'))).toEqual([]);
    await syncLaptop();
    expect((await readTrash(laptop)).filter((i) => i.title === 'roof.png')).toEqual([]);
  });

  it('empties the trash of files away too', async () => {
    const { phone, remote, syncPhone } = await siteVisit();
    await trashItem(phone, '_attachments/roof.png', now());
    await syncPhone();
    await emptyTrash(phone);
    expect(await readTrash(phone)).toEqual([]);
    await syncPhone();
    expect(remote.paths().filter((p) => p.includes('roof'))).toEqual([]);
  });

  it('sweeps a file away that nothing uses into the trash, and deletes it with the last note that used it', async () => {
    const { phone, remote, syncPhone } = await siteVisit();
    await phone.writeText('Site visit.md', '![](_attachments/small.png)\n');
    expect(await sweepAttachments(phone, () => [], now())).toBe(1);
    expect((await readTrash(phone)).map((i) => [i.title, i.away])).toEqual([['roof.png', true]]);
    await syncPhone();
    expect(remote.paths().some((p) => p.startsWith('.scrawl/trash/') && p.endsWith('roof.png'))).toBe(true);
  });

  it('does not move a note to another space while a file it links to is away', async () => {
    const { phone, remote } = await siteVisit();
    const other = new MemoryFs();
    await expect(copyToSpace(phone, 'Site visit.md', other, '')).rejects.toEqual(new AwayFilesError(['_attachments/roof.png']));
    await fetchAway(phone, remote, PHONE, '_attachments/roof.png');
    expect(await copyToSpace(phone, 'Site visit.md', other, '')).toBe('Site visit.md');
    expect((await other.readBlob('_attachments/roof.png')).size).toBe(4000);
  });

  it('gives a new file a name no file away has', async () => {
    const { phone } = await siteVisit();
    expect(await saveFile(phone, new File(['new'], 'roof.png'))).toBe('_attachments/roof 2.png');
  });

  it('takes a file that came here where one is away as that file when its content is the same', async () => {
    const { phone, remote, syncPhone } = await siteVisit(true);
    await phone.writeBlob('_attachments/roof.png', blob(4000));
    const writes = remote.calls.write;
    const report = await syncPhone();
    expect(report.conflicts).toEqual([]);
    expect(remote.calls.write).toBe(writes);
    expect(await readAway(phone)).toEqual([]);
  });

  it('keeps another file that came where one is away beside it, and the one away stays away', async () => {
    const { phone, remote, syncPhone } = await siteVisit(true);
    await phone.writeBlob('_attachments/roof.png', blob(4000, 7));
    const report = await syncPhone();
    expect(report.conflicts).toEqual([expect.stringMatching(/^_attachments\/roof \(conflict, Phone, .*\)\.png$/)]);
    expect(await exists(phone, '_attachments/roof.png')).toBe(false);
    expect(await readAway(phone)).toEqual([{ path: '_attachments/roof.png', size: 4000 }]);
    expect(await (await remote.read('_attachments/roof.png')).arrayBuffer()).toEqual(await blob(4000).arrayBuffer());
  });
});
