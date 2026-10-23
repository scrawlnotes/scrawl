import { describe, expect, it } from 'vitest';
import { addCard, addComment, newBoard, parseBoard, serializeBoard } from './board';
import { addRecord, createCollection, loadCollection } from './collection';
import { dropFile, dropFileFrom, dropFileFromBoard, listFiles, relinkFile, relinkFileIn, relinkFileInTrash } from './files';
import { MemoryFs } from './fs';
import { cardPiece, parsePiece, taskPiece } from './pieces';
import { addTask, parseList, serializeList } from './tasks';
import { readTrash, renameAttachment, trashFolder, trashItem, trashPiece } from './vault';

const blob = (size: number) => new Blob([new Uint8Array(size)]);
let ids = 0;
const id = () => `id${++ids}`;
const at = () => new Date(2026, 9, 14, 10, 0);

/** A sync state as a turn leaves it, with these files on the other side and not here. */
const awayState = (files: { path: string; size: number }[]) =>
  JSON.stringify({
    version: 1,
    device: 'phone',
    cursor: '1',
    files: Object.fromEntries(files.map((f) => [f.path.toLowerCase(), { path: f.path, tag: 't1', size: f.size, hash: '', away: true }])),
    dirs: {},
  });

describe('files', () => {
  it('are used by a task whose description links to them, and leave it when they are deleted', async () => {
    const fs = new MemoryFs();
    await fs.writeBlob('_attachments/2026-10-19-101500.png', blob(300));
    await fs.writeBlob('_attachments/quote.pdf', blob(40));
    let tasks = addTask([], { title: 'Send the quote', description: 'Screen:\n![](_attachments/2026-10-19-101500.png)\n[quote.pdf](_attachments/quote.pdf)' }, at, 't1');
    tasks = addTask(tasks, { title: 'Call back' }, at, 't2');
    const text = serializeList({ sections: [], tasks });
    await fs.writeText('Work/Sales.tasks.json', text);
    const files = await listFiles(fs);
    expect(files.find((f) => f.name === 'quote.pdf')!.uses).toEqual([
      { kind: 'task', path: 'Work/Sales.tasks.json', title: 'Send the quote', task: { id: 't1', list: 'Sales' }, inTrash: false },
    ]);
    // The file deleted, its link leaves the description; the rest of it stays.
    const dropped = parseList(dropFileFrom('Work/Sales.tasks.json', text, '_attachments/quote.pdf'));
    expect(dropped.tasks.find((task) => task.id === 't1')!.description).toBe('Screen:\n![](_attachments/2026-10-19-101500.png)');
    expect(dropFileFrom('Work/Sales.tasks.json', text, '_attachments/other.pdf')).toBe(text);
  });

  it('lists every attached file with where it is used: notes, cards, records, and notes in the trash', async () => {
    const fs = new MemoryFs();
    await fs.writeBlob('_attachments/2026-10-06-143207.png', blob(1200));
    await fs.writeBlob('_attachments/scope v3.pdf', blob(2400));
    await fs.writeBlob('_attachments/2026-09-28-170500.png', blob(880));
    await fs.writeBlob('_attachments/unused.zip', blob(10));
    await fs.writeText('Work/Client call.md', '# Client call\n\n![](_attachments/2026-10-06-143207.png)\n\n[scope v3.pdf](<_attachments/scope v3.pdf>)\n');
    let board = newBoard('Roadmap', 'simple', id);
    board = addCard(board, { title: 'Pilot offer', description: 'See ![](_attachments/2026-10-06-143207.png)' }, at, undefined, 'c1');
    board = addComment(board, 'c1', 'The scope: [scope](_attachments/scope%20v3.pdf)', at, undefined, 'm1');
    await fs.writeText('Work/Roadmap.board.json', serializeBoard(board));
    const companies = await createCollection(fs, 'Work', 'Companies', 'companies');
    await addRecord(fs, await loadCollection(fs, companies), { values: { name: 'Acme Corp' }, body: 'Signed: [scope](_attachments/scope%20v3.pdf)' }, 'acme');
    await fs.writeText('Work/Meeting notes.md', 'Old\n![](_attachments/2026-09-28-170500.png)\n');
    await trashItem(fs, 'Work/Meeting notes.md');

    const files = await listFiles(fs);
    // Those named by the moment they came, the latest first; then the others by when they were written.
    expect(files.slice(0, 2).map((f) => f.name)).toEqual(['2026-10-06-143207.png', '2026-09-28-170500.png']);
    expect(files).toHaveLength(4);
    const image = files.find((f) => f.name === '2026-10-06-143207.png')!;
    expect(image).toMatchObject({ size: 1200, named: true, away: false, added: new Date(2026, 9, 6, 14, 32, 7).getTime() });
    expect(image.uses.map((u) => [u.kind, u.title, u.inTrash])).toEqual([
      ['note', 'Client call', false],
      ['card', 'ROA-1', false],
    ]);
    expect(image.uses[1]!.card).toEqual({ id: 'c1', title: 'Pilot offer' });
    const pdf = files.find((f) => f.name === 'scope v3.pdf')!;
    expect(pdf.named).toBe(false);
    expect(pdf.uses.map((u) => [u.kind, u.title]).sort()).toEqual([
      ['card', 'ROA-1'],
      ['note', 'Client call'],
      ['record', 'Acme Corp'],
    ]);
    const old = files.find((f) => f.name === '2026-09-28-170500.png')!;
    expect(old.uses).toEqual([{ kind: 'note', path: expect.stringMatching(/^\.scrawl\/trash\//), title: 'Meeting notes', inTrash: true }]);
    expect(files.find((f) => f.name === 'unused.zip')!.uses).toEqual([]);
  });

  it('lists the files left on the other side, not downloaded, with their size there', async () => {
    const fs = new MemoryFs();
    await fs.writeBlob('_attachments/small.png', blob(5));
    await fs.writeText('.scrawl/sync-state.json', awayState([{ path: '_attachments/M24-stelora.png', size: 42_900_000 }]));
    await fs.writeText('Site visit.md', '![](_attachments/M24-stelora.png)\n');
    const files = await listFiles(fs);
    expect(files.find((f) => f.name === 'M24-stelora.png')).toMatchObject({ away: true, size: 42_900_000, uses: [{ kind: 'note', title: 'Site visit' }] });
    expect(files.find((f) => f.name === 'small.png')).toMatchObject({ away: false });
  });

  it('takes a file out of a note: its links and images, and the lines they leave empty', () => {
    const text = 'Photos:\n![](_attachments/a.png)\nSee [the scope](<_attachments/scope v3.pdf>) and ![x](_attachments/b.png).\n[scope](_attachments/scope%20v3.pdf "Scope")\nEnd';
    expect(dropFile(text, '_attachments/scope v3.pdf')).toBe('Photos:\n![](_attachments/a.png)\nSee  and ![x](_attachments/b.png).\nEnd');
    expect(dropFile(text, '_attachments/A.PNG')).toBe('Photos:\nSee [the scope](<_attachments/scope v3.pdf>) and ![x](_attachments/b.png).\n[scope](_attachments/scope%20v3.pdf "Scope")\nEnd');
    expect(dropFile(text, '_attachments/none.png')).toBe(text);
  });

  it('takes a file out of a board: card descriptions and comments', () => {
    let board = newBoard('Deals', 'simple', id);
    board = addCard(board, { title: 'Acme', description: 'Offer:\n[offer](_attachments/offer.pdf)\nThanks' }, at, undefined, 'c1');
    board = addComment(board, 'c1', '[offer](_attachments/offer.pdf)', at, undefined, 'm1');
    const out = parseBoard(dropFileFromBoard(serializeBoard(board), '_attachments/offer.pdf'));
    expect(out.cards[0]!.description).toBe('Offer:\nThanks');
    expect(out.cards[0]!.timeline.filter((e) => e.kind === 'comment')).toEqual([]);
    const text = serializeBoard(board);
    expect(dropFileFromBoard(text, '_attachments/other.pdf')).toBe(text);
  });

  it('renamed, are pointed at by their new name in a note; a link showing the old name shows the new one', () => {
    const text = [
      'Photos:',
      '![](_attachments/2026-10-06-143207.png)',
      'See [scope v3.pdf](<_attachments/scope v3.pdf>) and [the scope](_attachments/scope%20v3.pdf "Scope").',
      '`[scope v3.pdf](_attachments/scope%20v3.pdf)`',
      '[my\\_list.pdf](_attachments/my_list.pdf) [other](_attachments/other.pdf)',
    ].join('\n');
    expect(relinkFile(text, '_attachments/scope v3.pdf', '_attachments/Scope (final).pdf').split('\n')).toEqual([
      'Photos:',
      '![](_attachments/2026-10-06-143207.png)',
      'See [Scope (final).pdf](<_attachments/Scope (final).pdf>) and [the scope](_attachments/Scope%20%28final%29.pdf "Scope").',
      // Code is shown as it is written, not as a link.
      '`[scope v3.pdf](_attachments/scope%20v3.pdf)`',
      '[my\\_list.pdf](_attachments/my_list.pdf) [other](_attachments/other.pdf)',
    ]);
    expect(relinkFile(text, '_attachments/2026-10-06-143207.PNG', '_attachments/Whiteboard.png').split('\n')[1]).toBe('![](_attachments/Whiteboard.png)');
    expect(relinkFile(text, '_attachments/my_list.pdf', '_attachments/new_list.pdf').split('\n')[4]).toBe('[new\\_list.pdf](_attachments/new_list.pdf) [other](_attachments/other.pdf)');
    expect(relinkFile(text, '_attachments/none.pdf', '_attachments/x.pdf')).toBe(text);
  });

  it('renamed, are pointed at by their new name in cards, tasks and records', () => {
    let board = newBoard('Deals', 'simple', id);
    board = addCard(board, { title: 'Acme', description: 'Offer:\n[offer.pdf](_attachments/offer.pdf)' }, at, undefined, 'c1');
    board = addComment(board, 'c1', 'See ![](_attachments/offer.pdf)', at, undefined, 'm1');
    board = addCard(board, { title: 'Globex' }, at, undefined, 'c2');
    const out = parseBoard(relinkFileIn('Deals.board.json', serializeBoard(board), '_attachments/offer.pdf', '_attachments/Offer 2026.pdf'));
    expect(out.cards.find((c) => c.id === 'c1')!.description).toBe('Offer:\n[Offer 2026.pdf](_attachments/Offer%202026.pdf)');
    expect(out.cards.find((c) => c.id === 'c1')!.timeline.find((e) => e.kind === 'comment')).toMatchObject({ text: 'See ![](_attachments/Offer%202026.pdf)' });
    expect(out.cards.find((c) => c.id === 'c2')).toEqual(board.cards.find((c) => c.id === 'c2'));
    expect(relinkFileIn('Deals.board.json', serializeBoard(board), '_attachments/other.pdf', '_attachments/x.pdf')).toBe(serializeBoard(board));

    const tasks = addTask([], { title: 'Send the quote', description: '[quote.pdf](_attachments/quote.pdf)' }, at, 't1');
    const list = serializeList({ sections: [], tasks });
    expect(parseList(relinkFileIn('Sales.tasks.json', list, '_attachments/quote.pdf', '_attachments/Quote 12.pdf')).tasks[0]!.description).toBe('[Quote 12.pdf](_attachments/Quote%2012.pdf)');

    const record = '---\nid: r1\nname: Acme\n---\n[lease.pdf](_attachments/lease.pdf)\n';
    expect(relinkFileIn('People/r1.md', record, '_attachments/lease.pdf', '_attachments/Lease 2026.pdf')).toBe('---\nid: r1\nname: Acme\n---\n[Lease 2026.pdf](_attachments/Lease%202026.pdf)\n');
  });

  it('get another name, their extension kept, a name taken refused; one left on the other side is renamed there', async () => {
    const fs = new MemoryFs();
    await fs.writeBlob('_attachments/scan.pdf', blob(30));
    await fs.writeBlob('_attachments/taken.pdf', blob(10));
    await expect(renameAttachment(fs, '_attachments/scan.pdf', 'Taken')).rejects.toThrow('Taken.pdf');
    await expect(renameAttachment(fs, '_attachments/scan.pdf', '  ')).rejects.toThrow();
    // The extension typed is left off; another is part of the name.
    expect(await renameAttachment(fs, '_attachments/scan.pdf', 'Lease.pdf')).toBe('_attachments/Lease.pdf');
    expect(await renameAttachment(fs, '_attachments/Lease.pdf', 'lease')).toBe('_attachments/lease.pdf');
    expect(await renameAttachment(fs, '_attachments/lease.pdf', 'lease')).toBe('_attachments/lease.pdf');
    expect(await renameAttachment(fs, '_attachments/lease.pdf', 'lease.docx')).toBe('_attachments/lease.docx.pdf');
    expect((await fs.readBlob('_attachments/lease.docx.pdf')).size).toBe(30);

    await fs.writeText('.scrawl/sync-state.json', awayState([{ path: '_attachments/M24-stelora.png', size: 42_900_000 }]));
    expect(await renameAttachment(fs, '_attachments/M24-stelora.png', 'Site plan')).toBe('_attachments/Site plan.png');
    expect((await listFiles(fs)).find((f) => f.away)).toMatchObject({ name: 'Site plan.png', size: 42_900_000 });
  });

  it('renamed, are pointed at by their new name in the trash: notes, folders, cards and tasks', async () => {
    const fs = new MemoryFs();
    const link = '[scan.pdf](_attachments/scan.pdf)';
    await fs.writeText('Old.md', `${link}\n`);
    await fs.writeText('Old folder/Inside.md', `${link}\n`);
    await trashItem(fs, 'Old.md', at());
    await trashFolder(fs, 'Old folder', at());
    let board = newBoard('Deals', 'simple', id);
    board = addCard(board, { title: 'Acme', description: link }, at, undefined, 'c1');
    await trashPiece(fs, 'Deals.board.json', cardPiece(board, 'c1')!, at());
    const tasks = addTask([], { title: 'Sign', description: link }, at, 't1');
    await trashPiece(fs, 'Sales.tasks.json', taskPiece({ sections: [], tasks }, 't1')!, at());

    await relinkFileInTrash(fs, '_attachments/scan.pdf', '_attachments/Lease.pdf');
    const now = '[Lease.pdf](_attachments/Lease.pdf)';
    const trash = await readTrash(fs);
    expect(await fs.readText(trash.find((i) => i.kind === 'note')!.path)).toBe(`${now}\n`);
    expect(await fs.readText(`${trash.find((i) => i.kind === 'folder')!.path}/Inside.md`)).toBe(`${now}\n`);
    const card = parsePiece(await fs.readText(trash.find((i) => i.kind === 'card')!.path));
    expect(card?.kind === 'card' && card.card.description).toBe(now);
    const task = parsePiece(await fs.readText(trash.find((i) => i.kind === 'task')!.path));
    expect(task?.kind === 'task' && task.tasks[0]!.description).toBe(now);
  });
});
