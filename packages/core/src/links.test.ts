import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import { applyChanges, hrefTo, isInsideHref, linksIn, relinkNotes, relinkText, resolveHref } from './links';

describe('links inside a space', () => {
  it('tells a path from a web address, a mail address and a place in the note', () => {
    expect(['Deals.board.json', '../Plans/Roadmap.md', 'Order%20lines'].map(isInsideHref)).toEqual([true, true, true]);
    expect(['https://scrawlnotes.com', 'mailto:kaan@example.com', '#top', '//cdn', ''].map(isInsideHref)).toEqual([false, false, false, false, false]);
  });

  it('reads a link from the note’s folder, attached files from the top', () => {
    expect(resolveHref('Atlas', 'Deals.board.json')).toBe('Atlas/Deals.board.json');
    expect(resolveHref('Atlas/Sub', '../Order%20lines')).toBe('Atlas/Order lines');
    expect(resolveHref('Atlas', '<Order lines>')).toBe('Atlas/Order lines');
    expect(resolveHref('Atlas', './Plans/Q4.md#goals')).toBe('Atlas/Plans/Q4.md');
    expect(resolveHref('Atlas', '_attachments/a.png')).toBe('_attachments/a.png');
    expect(resolveHref('', '../x.md')).toBeNull();
  });

  it('writes a link from the note’s folder, escaping what Markdown would read otherwise', () => {
    expect(hrefTo('Atlas', 'Atlas/Order lines')).toBe('Order%20lines');
    expect(hrefTo('Atlas/Sub', 'Plans/Roadmap (Q4).md')).toBe('../../Plans/Roadmap%20%28Q4%29.md');
    expect(hrefTo('', 'Müşteriler/Şirketler')).toBe('Müşteriler/Şirketler');
    expect(resolveHref('Atlas/Sub', hrefTo('Atlas/Sub', 'Plans/Roadmap (Q4).md'))).toBe('Plans/Roadmap (Q4).md');
  });

  it('finds links and images outside code', () => {
    const text = 'See [Deals](Deals.board.json) and ![x](_attachments/x.png "x").\n\n`[no](No.md)`\n\n```\n[no](No.md)\n```\n[A [b]](<A b.md>)\n';
    expect(linksIn(text).map((l) => l.href)).toEqual(['Deals.board.json', '_attachments/x.png', '<A b.md>']);
  });
});

describe('links after a move', () => {
  it('points a link at what moved, and writes a moved note’s links from its new place', () => {
    const moved = (p: string) => (p === 'Atlas/Companies' ? 'Atlas/CRM/Customers' : null);
    const text = '[Companies](Companies) [Deals](Deals.board.json) [web](https://x.com)';
    expect(applyChanges(text, relinkText(text, 'Atlas', 'Atlas', moved))).toBe('[Companies](CRM/Customers) [Deals](Deals.board.json) [web](https://x.com)');
    // The note moved into Atlas/Notes: its links are written from there.
    expect(applyChanges(text, relinkText(text, 'Atlas', 'Atlas/Notes', moved))).toBe('[Companies](../CRM/Customers) [Deals](../Deals.board.json) [web](https://x.com)');
    expect(relinkText('[Gone](Nowhere.md)', 'Atlas', 'Atlas', moved)).toEqual([]);
  });

  it('changes the notes of the space that link to what moved, records’ notes too, and only those', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Atlas/About Atlas.md', '[Companies](Companies), [Plan](../Plans/Roadmap.md)\n');
    await fs.writeText('Atlas/Companies/r1.md', '---\nid: r1\n---\nSee [the plan](../../Plans/Roadmap.md).\n');
    await fs.writeText('Notes/Other.md', 'Nothing to change [here](Here.md).\n');
    await fs.writeText('Plans/Road map.md', '# Roadmap\n');
    await fs.remove('Plans/Roadmap.md').catch(() => undefined);
    // Roadmap.md was renamed to "Road map.md".
    const changed = await relinkNotes(fs, [{ from: 'Plans/Roadmap.md', to: 'Plans/Road map.md' }]);
    expect(changed.sort()).toEqual(['Atlas/About Atlas.md', 'Atlas/Companies/r1.md']);
    expect(await fs.readText('Atlas/About Atlas.md')).toBe('[Companies](Companies), [Plan](../Plans/Road%20map.md)\n');
    expect(await fs.readText('Atlas/Companies/r1.md')).toContain('[the plan](../../Plans/Road%20map.md)');
  });

  it('keeps the links of a folder moved with its notes', async () => {
    const fs = new MemoryFs();
    await fs.writeText('Sales/About.md', '[Orders](Orders) [Plan](../Plans/Q4.md)\n');
    await fs.writeText('Sales/Orders/_collection.json', '{}');
    // Sales moved into Work: a link inside it still points inside it; one outside goes up once more.
    const moves = [{ from: 'Sales', to: 'Work/Sales' }];
    await fs.writeText('Work/Sales/About.md', await fs.readText('Sales/About.md'));
    await fs.remove('Sales/About.md');
    await relinkNotes(fs, moves);
    expect(await fs.readText('Work/Sales/About.md')).toBe('[Orders](Orders) [Plan](../../Plans/Q4.md)\n');
  });
});
