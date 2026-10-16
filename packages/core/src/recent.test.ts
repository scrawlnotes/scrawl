import { describe, expect, it } from 'vitest';
import { parseRecent, RECENT_KEPT, seenMoved, seenNow, serializeRecent } from './recent';

describe('recent', () => {
  it('puts what was on screen first, once', () => {
    let recent = seenNow([], 'Scrawl/Plan.md', 1);
    recent = seenNow(recent, 'Sales/Deals.board.json', 2);
    recent = seenNow(recent, 'Scrawl/Plan.md', 3);
    expect(recent).toEqual([
      { id: 'Scrawl/Plan.md', at: 3 },
      { id: 'Sales/Deals.board.json', at: 2 },
    ]);
  });

  it('keeps no more than it can show and some to spare', () => {
    let recent: ReturnType<typeof seenNow> = [];
    for (let i = 0; i < RECENT_KEPT + 5; i++) recent = seenNow(recent, `Note ${i}.md`, i);
    expect(recent).toHaveLength(RECENT_KEPT);
    expect(recent[0]!.id).toBe(`Note ${RECENT_KEPT + 4}.md`);
  });

  it('follows what moves, in its place and with its moment', () => {
    const recent = [
      { id: 'Inbox note.md', at: 5 },
      { id: 'Scrawl/Plan.md', at: 4 },
    ];
    expect(seenMoved(recent, 'Scrawl/Plan.md', 'acme:Sales/Plan.md')).toEqual([
      { id: 'Inbox note.md', at: 5 },
      { id: 'acme:Sales/Plan.md', at: 4 },
    ]);
    // What it moved onto was seen before under that id: it is there once, with the moment that moved.
    expect(seenMoved(recent, 'Scrawl/Plan.md', 'Inbox note.md')).toEqual([{ id: 'Inbox note.md', at: 4 }]);
    // Something that was never seen leaves the list as it is.
    expect(seenMoved(recent, 'Other.md', 'Elsewhere.md')).toBe(recent);
  });

  it('reads back what it wrote, and nothing it cannot read', () => {
    const recent = seenNow(seenNow([], 'a.md', 1), 'b.md', 2);
    expect(parseRecent(serializeRecent(recent))).toEqual(recent);
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('{')).toEqual([]);
    expect(parseRecent('{"id":"a.md"}')).toEqual([]);
    expect(parseRecent('[{"id":"a.md","at":1},{"id":"","at":2},{"id":"b.md"},{"id":"a.md","at":3},null]')).toEqual([{ id: 'a.md', at: 1 }]);
    // Out of order, as another version may have written it: the latest first.
    expect(parseRecent('[{"id":"a.md","at":1},{"id":"b.md","at":9}]').map((seen) => seen.id)).toEqual(['b.md', 'a.md']);
  });
});
