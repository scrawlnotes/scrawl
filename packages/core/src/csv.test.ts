import { describe, expect, it } from 'vitest';
import { type Collection, newSchema, type Record } from './collection';
import { collectionCsv, guessTargets, guessType, parseCsv, planImport, sheetDate, sheetNumber, sheetRows, toCsv } from './csv';

function record(id: string, values: Record['values'], body = ''): Record {
  const name = typeof values.name === 'string' ? values.name : '';
  return { id, path: `S/Companies/${id}.md`, name, code: '', values, extra: {}, body };
}

describe('CSV', () => {
  it('reads a file as a spreadsheet writes it, and writes one back', () => {
    expect(parseCsv('﻿Name,Notes\r\nAcme,"Met at the ""summit"", Berlin"\r\nGlobex,"two\nlines"\r\n\r\n')).toEqual([
      ['Name', 'Notes'],
      ['Acme', 'Met at the "summit", Berlin'],
      ['Globex', 'two\nlines'],
    ]);
    // Where a comma is the decimal mark, fields are apart by semicolons.
    expect(parseCsv('Name;Value\nAcme;12,5\n')).toEqual([['Name', 'Value'], ['Acme', '12,5']]);
    const rows = [['Name', 'Notes'], ['Acme', 'a "quote", and a comma'], [' padded ', 'x']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  const companies: Collection = {
    dir: 'S/Companies',
    schema: newSchema('companies', 'S'),
    records: [record('a1', { name: 'Acme Corp', status: 'active', tags: ['design', 'berlin'] }, 'Met at the summit.\n'), record('b2', { name: 'Globex' })],
  };

  it('writes a collection with its fields, rollups worked out, the notes last', () => {
    const rows = parseCsv(collectionCsv(companies, [companies], {}, 'Notes', '2026-10-09'));
    expect(rows[0]).toEqual(['Name', 'Website', 'Segment', 'Type', 'Owner', 'Status', 'Tags', 'Last contact', 'Notes']);
    expect(rows[1]).toEqual(['Acme Corp', '', '', '', '', 'active', 'design, berlin', '', 'Met at the summit.']);
    expect(rows).toHaveLength(3);
  });

  it('sends each column where its name says, and imports the rows', () => {
    const header = ['Company name', 'Status', 'Employees', 'Founded', 'Notes', 'id', 'Name'];
    const rows = [
      ['', 'churned', '1.200', '14.10.1999', 'Lost to a rival.', '7', 'Globex'],
      ['', 'won', '12,000', '2001-02-03', '', '8', 'Initech'],
    ];
    const targets = guessTargets(header, rows, companies.schema, 'Notes');
    expect(targets).toEqual([{ add: 'text' }, { field: 'status' }, { add: 'number' }, { add: 'date' }, { body: true }, { skip: true }, { field: 'name' }]);
    // Something's name goes to the name field when no column is called Name; another system's id goes nowhere.
    expect(guessTargets(['Company name', 'Internal id'], [], companies.schema, 'Notes')).toEqual([{ field: 'name' }, { skip: true }]);
    expect(guessType(['yes', 'No'])).toBe('checkbox');

    const plan = planImport(companies, header, rows, targets, 'update', {});
    // Globex is there: it changes; Initech is new.
    expect(plan.updated).toEqual([{ id: 'b2', values: { status: 'churned', employees: 1.2, founded: '1999-10-14', name: 'Globex' }, body: 'Lost to a rival.' }]);
    expect(plan.added).toEqual([{ values: { status: 'won', employees: 12000, founded: '2001-02-03', name: 'Initech' } }]);
    expect(plan.schema.fields.map((f) => f.key).slice(-3)).toEqual(['company_name', 'employees', 'founded']);
    expect(plan.schema.fields.find((f) => f.key === 'status')!.options).toEqual(['prospect', 'active', 'churned', 'won']);
    expect(planImport(companies, header, rows, targets, 'add', {}).added).toHaveLength(2);
  });

  it('finds the record a link points at by its name, and keeps what does not fit', () => {
    const people = newSchema('people', 'S');
    const collection: Collection = { dir: 'S/People', schema: people, records: [] };
    const header = ['Name', 'Company', 'Status'];
    const plan = planImport(collection, header, [['Lena', 'acme corp · CUS-0012', 'lead'], ['Jonas', 'Nobody Inc', '']], guessTargets(header, [], people, 'Notes'), 'add', {
      'S/Companies': companies.records,
    });
    expect(plan.added[0]!.values!.company).toEqual({ id: 'a1', name: 'Acme Corp' });
    expect(plan.added[1]!.values!.company).toEqual({ id: '', name: 'Nobody Inc' });
    const odd = planImport(companies, ['Name', 'Last contact', 'Status'], [['Acme Corp', '2026-01-01', 'active']], [{ field: 'name' }, { skip: true }, { field: 'status' }], 'update', {});
    expect(odd.updated[0]!.values).toEqual({ name: 'Acme Corp', status: 'active' });
  });
});

describe('Excel cells', () => {
  it('keeps a number to the digits Excel keeps, without its format', () => {
    expect(sheetNumber(0.1 + 0.2)).toBe('0.3');
    expect(sheetNumber(48000)).toBe('48000');
    expect(sheetNumber(0.15)).toBe('0.15');
    expect(sheetNumber(-1234567.891)).toBe('-1234567.891');
  });

  it('reads a day, a moment and a time of day from the days a workbook counts', () => {
    expect(sheetDate(46093)).toBe('2026-03-12');
    expect(sheetDate(46093 + 14.5 / 24)).toBe('2026-03-12 14:30');
    expect(sheetDate(46093 + (14.5 * 3600 + 5) / 86400)).toBe('2026-03-12 14:30:05');
    expect(sheetDate(0.75)).toBe('18:00');
    expect(sheetDate(46092.99999999)).toBe('2026-03-12');
    expect(sheetDate(1)).toBe('1900-01-01');
    expect(sheetDate(61)).toBe('1900-03-01');
    expect(sheetDate(46093 - 1462, true)).toBe('2026-03-12');
  });

  it('starts at the first row with anything in it, leaving out empty rows and the empty columns at either side', () => {
    const rows = [
      ['', '', '', ''],
      ['', 'Name', 'ARR', ''],
      ['', 'Acme', '48000', ''],
      ['', ' ', '', ''],
      ['', 'Globex'],
    ];
    expect(sheetRows(rows)).toEqual([
      ['Name', 'ARR'],
      ['Acme', '48000'],
      ['Globex', ''],
    ]);
    expect(sheetRows([['', ''], []])).toEqual([]);
  });
});
