import { describe, expect, it } from 'vitest';
import { addCard, attachToCard, type Board, type Card, cardBrief, newBoard, parseBoard, removeCardFile, renameCardFile, restoreCardFile, serializeBoard } from './board';
import { dropFileFromBoard, fileUses, relinkFileIn } from './files';
import { MemoryFs } from './fs';
import { mergeFile } from './sync/merge-files';

// Files attached to a card: the Attachments under its description (design/card-attachments.html).

const at = (time: string) => () => new Date(`2026-11-27T${time}:00.000Z`);
const counter = (prefix: string) => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

function deal(): Board {
  return addCard(newBoard('Deals', 'simple', counter('col')), { title: 'Acme' }, at('10:00'), 'Eren', 'c1');
}
const card = (board: Board): Card => board.cards.find((c) => c.id === 'c1')!;

describe('files attached to a card', () => {
  it('come after the ones it has, and its timeline says so once for files attached together', () => {
    let board = attachToCard(deal(), 'c1', [{ path: '_attachments/offer.pdf', name: 'offer.pdf', size: 1200 }], at('10:20'), 'Eren', counter('f'));
    board = attachToCard(board, 'c1', [{ path: '_attachments/prices.xlsx', name: 'prices.xlsx' }], at('10:23'), 'Eren', counter('g'));
    expect(card(board).attachments).toEqual([
      { id: 'f1', at: '2026-11-27T10:20:00.000Z', by: 'Eren', path: '_attachments/offer.pdf', name: 'offer.pdf', size: 1200 },
      { id: 'g1', at: '2026-11-27T10:23:00.000Z', by: 'Eren', path: '_attachments/prices.xlsx', name: 'prices.xlsx' },
    ]);
    const attached = card(board).timeline.filter((e) => e.kind === 'attach');
    expect(attached).toMatchObject([{ kind: 'attach', files: ['offer.pdf', 'prices.xlsx'], at: '2026-11-27T10:23:00.000Z' }]);
    // Someone else, or much later, is an entry of its own.
    board = attachToCard(board, 'c1', [{ path: '_attachments/scan.png', name: 'scan.png' }], at('10:24'), 'Kaan');
    expect(card(board).timeline.filter((e) => e.kind === 'attach')).toHaveLength(2);
    expect(card(board).workedOn?.map((w) => w.name)).toEqual(['Eren', 'Kaan']);
  });

  it('are read back from the board file as they were written', () => {
    const board = attachToCard(deal(), 'c1', [{ path: '_attachments/offer.pdf', name: 'offer.pdf', size: 1200 }], at('10:20'), 'Eren', counter('f'));
    const back = parseBoard(serializeBoard(board));
    expect(card(back).attachments).toEqual(card(board).attachments);
    expect(card(back).timeline).toEqual(card(board).timeline);
    // One without its file or its name is left out; a field a newer version writes stays.
    const text = serializeBoard(board).replace('"size": 1200', '"size": 1200, "pages": 3');
    const raw = JSON.parse(text) as { cards: { attachments: unknown[] }[] };
    raw.cards[0]!.attachments.push({ id: 'x', at: '2026-11-27T10:21:00.000Z', name: 'no file' });
    expect(card(parseBoard(JSON.stringify(raw))).attachments).toEqual([{ ...card(board).attachments![0], pages: 3 }]);
  });

  it('take another name to show with, come off and are put back in their place', () => {
    let board = attachToCard(deal(), 'c1', [
      { path: '_attachments/a.pdf', name: 'a.pdf' },
      { path: '_attachments/b.pdf', name: 'b.pdf' },
    ], at('10:20'), 'Eren', counter('f'));
    board = renameCardFile(board, 'c1', 'f2', '  Contract v3.pdf ');
    expect(card(board).attachments!.map((f) => f.name)).toEqual(['a.pdf', 'Contract v3.pdf']);
    expect(renameCardFile(board, 'c1', 'f2', '   ')).toBe(board);
    const taken = card(board).attachments![0]!;
    const off = removeCardFile(board, 'c1', 'f1');
    expect(card(off).attachments!.map((f) => f.id)).toEqual(['f2']);
    expect(card(restoreCardFile(off, 'c1', taken, 0)).attachments!.map((f) => f.id)).toEqual(['f1', 'f2']);
    // The last one off leaves no list.
    expect(card(removeCardFile(off, 'c1', 'f2')).attachments).toBeUndefined();
    expect(cardBrief(board, card(board))).toContain('Attachments: a.pdf, Contract v3.pdf');
  });

  it('attached on two devices at once are all kept; one taken off on a device goes', () => {
    const base = attachToCard(deal(), 'c1', [{ path: '_attachments/a.pdf', name: 'a.pdf' }], at('10:20'), 'Eren', counter('f'));
    const mine = removeCardFile(attachToCard(base, 'c1', [{ path: '_attachments/b.pdf', name: 'b.pdf' }], at('10:30'), 'Eren', counter('m')), 'c1', 'f1', at('10:31'));
    const theirs = attachToCard(base, 'c1', [{ path: '_attachments/c.pdf', name: 'c.pdf' }], at('10:32'), 'Kaan', counter('t'));
    const out = parseBoard(mergeFile('board', serializeBoard(base), serializeBoard(mine), serializeBoard(theirs)).text);
    expect(card(out).attachments!.map((f) => f.name).sort()).toEqual(['b.pdf', 'c.pdf']);
  });

  it('count as a use of the file, follow it when it is renamed and go when it is deleted', async () => {
    const board = attachToCard(deal(), 'c1', [{ path: '_attachments/offer.pdf', name: 'offer.pdf' }, { path: '_attachments/Scan.png', name: 'Before the call' }], at('10:20'), 'Eren', counter('f'));
    const fs = new MemoryFs();
    await fs.writeText('Deals.board.json', serializeBoard(board));
    const uses = await fileUses(fs);
    expect(uses.get('_attachments/offer.pdf')).toMatchObject([{ kind: 'card', path: 'Deals.board.json', card: { id: 'c1', title: 'Acme' } }]);
    expect(uses.get('_attachments/scan.png')).toHaveLength(1);
    // Renamed: the path follows, and a name that was the file's own follows too.
    const renamed = card(parseBoard(relinkFileIn('Deals.board.json', serializeBoard(board), '_attachments/offer.pdf', '_attachments/Offer 2026.pdf'))).attachments!;
    expect(renamed.map((f) => [f.path, f.name])).toEqual([
      ['_attachments/Offer 2026.pdf', 'Offer 2026.pdf'],
      ['_attachments/Scan.png', 'Before the call'],
    ]);
    const kept = card(parseBoard(relinkFileIn('Deals.board.json', serializeBoard(board), '_attachments/scan.png', '_attachments/Call.png'))).attachments!;
    expect(kept[1]).toMatchObject({ path: '_attachments/Call.png', name: 'Before the call' });
    // Deleted in Files: it comes off the card.
    const dropped = card(parseBoard(dropFileFromBoard(serializeBoard(board), '_attachments/offer.pdf'))).attachments!;
    expect(dropped.map((f) => f.name)).toEqual(['Before the call']);
    const text = serializeBoard(board);
    expect(dropFileFromBoard(text, '_attachments/other.pdf')).toBe(text);
  });
});
