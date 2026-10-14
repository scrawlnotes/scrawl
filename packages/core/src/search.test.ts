import { describe, expect, it } from 'vitest';
import { fold, type Findable, search, searchIndex } from './search';

const names = (found: { item: Findable }[]) => found.map((f) => f.item.name);
const find = (items: Findable[], query: string) => search(searchIndex(items), query);

describe('search', () => {
  it('finds by name first, the whole of what was typed best, then by text, in one list', () => {
    const items: Findable[] = [
      { kind: 'note', name: 'Client call, Oct 6', text: '# Client call, Oct 6\n\nThey asked whether Acme can start in November.' },
      { kind: 'record', name: 'Acme Corp', key: 'CUS-0012', text: 'Industry: Software' },
      { kind: 'note', name: 'Acme pilot kickoff', text: '# Acme pilot kickoff' },
      { kind: 'space', name: 'Acme' },
      { kind: 'task', name: 'Call Acme about the yearly plan' },
      { kind: 'note', name: 'Groceries', text: 'Milk' },
    ];
    expect(names(find(items, 'acme'))).toEqual(['Acme', 'Acme Corp', 'Acme pilot kickoff', 'Call Acme about the yearly plan', 'Client call, Oct 6']);
    const note = items[0]!.text!.indexOf('Acme');
    expect(find(items, 'acme')[4]!.line).toEqual({ text: 'They asked whether Acme can start in November.', marks: [[19, 23]], spans: [[note, note + 4]] });
    expect(find(items, '  ')).toEqual([]);
    expect(find(items, 'acme zebra')).toEqual([]);
  });

  it('finds what was typed where a word starts, not inside one', () => {
    const items: Findable[] = [
      { kind: 'note', name: 'Status report', text: 'All good' },
      { kind: 'note', name: 'Call notes', text: 'Ask Tulin about the order' },
      { kind: 'card', name: 'Pilot', key: 'DEA-12' },
    ];
    expect(names(find(items, 'tu'))).toEqual(['Call notes']);
    expect(find(items, 'tu')[0]!.line).toMatchObject({ text: 'Ask Tulin about the order', marks: [[4, 6]] });
    expect(names(find(items, 'atus'))).toEqual([]);
    expect(names(find(items, '12'))).toEqual(['Pilot']);
  });

  it('finds a field by its value, never by its label, and shows it with its label', () => {
    const items: Findable[] = [
      { kind: 'record', name: 'Hooli', fields: [['Status', 'prospect'], ['Owner', 'Tulin Kaya']], text: 'Met at the fair' },
      { kind: 'record', name: 'Initech', fields: [['Status', 'lost']] },
    ];
    expect(names(find(items, 'status'))).toEqual([]);
    expect(find(items, 'tul')[0]!.line).toEqual({ text: 'Owner: Tulin Kaya', marks: [[7, 10]], spans: [] });
    expect(find(items, 'hooli pros')[0]).toMatchObject({ inName: [[0, 5]], line: { text: 'Status: prospect', marks: [[8, 12]] } });
    // The text comes before a field with as many of the words.
    expect(find(items, 'fair')[0]!.line).toMatchObject({ text: 'Met at the fair', spans: [[11, 15]] });
  });

  it('needs every word, each in the name or else in the text; partly in the name comes before only in the text', () => {
    const items: Findable[] = [
      { kind: 'note', name: 'Standup 10-09', text: 'Acme wants the export first' },
      { kind: 'note', name: 'Acme pilot kickoff', text: 'We start with the export' },
      { kind: 'card', name: 'Export', key: 'SCR-4', text: 'For Acme' },
    ];
    expect(names(find(items, 'acme export'))).toEqual(['Acme pilot kickoff', 'Export', 'Standup 10-09']);
    expect(find(items, 'acme export')[1]).toMatchObject({ inName: [[0, 6]], line: { text: 'For Acme', marks: [[4, 8]] } });
  });

  it('finds a card by its key, the whole key above all', () => {
    const items: Findable[] = [
      { kind: 'card', name: 'Pilot for one portal', key: 'DEA-12' },
      { kind: 'card', name: 'Mentions DEA-12 in its name', key: 'DEA-3' },
      { kind: 'card', name: 'Second team', key: 'DEA-120' },
    ];
    const found = find(items, 'dea-12');
    expect(names(found)).toEqual(['Pilot for one portal', 'Second team', 'Mentions DEA-12 in its name']);
    expect(found[0]).toMatchObject({ inName: [], inKey: [[0, 6]] });
  });

  it('takes a letter with or without its accent, in either case; Turkish ı and İ as i', () => {
    expect(fold('İstanbul Şirketi ÇAĞRI ılık Café')).toBe('istanbul sirketi cagri ilik cafe');
    const items: Findable[] = [
      { kind: 'note', name: 'Şirket toplantısı', text: '' },
      { kind: 'note', name: 'Notes', text: 'Kahve: café au lait\nIğdır' },
    ];
    expect(names(find(items, 'sirket'))).toEqual(['Şirket toplantısı']);
    expect(find(items, 'TOPLANTISI')[0]!.inName).toEqual([[7, 17]]);
    expect(find(items, 'cafe')[0]!.line).toMatchObject({ text: 'Kahve: café au lait', marks: [[7, 11]] });
    expect(find(items, 'igdir')[0]!.line).toMatchObject({ text: 'Iğdır', marks: [[0, 5]], spans: [[20, 25]] });
  });

  it('puts what is done under what is not, as well found', () => {
    const items: Findable[] = [
      { kind: 'task', name: 'Renew the domain', done: true },
      { kind: 'task', name: 'Renew the passport' },
    ];
    expect(names(find(items, 'renew'))).toEqual(['Renew the passport', 'Renew the domain']);
  });

  it('shows the line with the most of the words, as it reads, without its Markdown marks', () => {
    const text = '# Plan\n\n- [ ] Ask **Acme** about [the plan](https://example.com/acme)\n- Acme again, and the export';
    const [found] = find([{ kind: 'note', name: 'Plan', text }], 'acme export');
    expect(found!.line).toEqual({
      text: 'Acme again, and the export',
      marks: [[0, 4], [20, 26]],
      spans: [[text.indexOf('Acme again'), text.indexOf('Acme again') + 4], [text.length - 6, text.length]],
    });
    const one = '- [ ] Ask **Acme** about [the export](https://example.com/acme)';
    const [first] = find([{ kind: 'note', name: 'Plan', text: one }], 'acme');
    // The word in where the link goes is not shown, nor marked in the note.
    expect(first!.line).toEqual({ text: 'Ask Acme about the export', marks: [[4, 8]], spans: [[12, 16]] });
  });

  it('cuts a long line before the words, at a space, and after', () => {
    const before = 'word '.repeat(30);
    const text = `${before}Acme ${'tail '.repeat(60)}`;
    const line = find([{ kind: 'note', name: 'Long', text }], 'acme')[0]!.line!;
    expect(line.text.startsWith('…')).toBe(true);
    expect(line.text.endsWith('…')).toBe(true);
    expect(line.text.slice(line.marks[0]![0], line.marks[0]![1])).toBe('Acme');
    expect(line.spans).toEqual([[before.length, before.length + 4]]);
  });
});
