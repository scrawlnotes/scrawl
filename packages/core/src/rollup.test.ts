import { describe, expect, it } from 'vitest';
import { addCard, moveCardToKind, newBoard } from './board';
import { type Collection, type Field, newSchema, parseRecord, parseSchema, type Record, serializeRecord, serializeSchema } from './collection';
import { rollupValue, withRollups } from './rollup';

const today = '2026-10-08';

function record(id: string, name: string, values: Record['values'] = {}): Record {
  return { id, path: `C/${id}.md`, name, code: '', values: { name, ...values }, extra: {}, body: '' };
}

describe('rollups', () => {
  const companies: Collection = { dir: 'S/Companies', schema: newSchema('companies', 'S'), records: [record('a1', 'Acme Corp'), record('b2', 'Globex')] };
  const activities: Collection = {
    dir: 'S/Activities',
    schema: newSchema('activities', 'S'),
    records: [
      record('x1', 'Call', { date: '2026-10-01', company: { id: 'a1', name: 'Acme Corp' } }),
      record('x2', 'Demo', { date: '2026-10-06', company: { id: 'a1', name: 'Acme Corp' } }),
      record('x3', 'Email', { date: '2026-09-20', company: { id: 'b2', name: 'Globex' } }),
    ],
  };
  let deals = newBoard('Deals', 'crm', undefined, { company: 'S/Companies', contact: 'S/People' });
  deals = addCard(deals, { title: 'Pilot', values: { company: { id: 'a1', name: 'Acme Corp' }, value: 12000 } }, undefined, undefined, 'k1');
  deals = addCard(deals, { title: 'Annual', values: { company: { id: 'a1', name: 'Acme Corp' }, value: 24000 } }, undefined, undefined, 'k2');
  deals = moveCardToKind(deals, 'k2', 'done');
  const boards = { 'S/Deals.board.json': deals };
  const all = [companies, activities];
  const field = (rollup: Field['rollup']): Field => ({ key: 'r', label: 'R', type: 'rollup', rollup });

  it("work out a company's last contact, and counts and sums of what links to it", () => {
    const lastContact = companies.schema.fields.find((f) => f.key === 'last_contact')!;
    expect(lastContact.rollup).toEqual({ from: 'S/Activities', fn: 'max', field: 'date' });
    expect(rollupValue(lastContact, companies.dir, companies.records[0]!, all, boards, today)).toBe('2026-10-06');
    expect(rollupValue(lastContact, companies.dir, companies.records[1]!, all, boards, today)).toBe('2026-09-20');
    expect(rollupValue(field({ from: 'S/Activities', fn: 'min', field: 'date' }), companies.dir, companies.records[0]!, all, boards, today)).toBe('2026-10-01');
    expect(rollupValue(field({ from: 'S/Activities', fn: 'count' }), companies.dir, companies.records[0]!, all, boards, today)).toBe(2);
    expect(rollupValue(field({ from: 'S/Deals.board.json', fn: 'sum', field: 'value' }), companies.dir, companies.records[0]!, all, boards, today)).toBe(36000);
    expect(rollupValue(field({ from: 'S/Deals.board.json', fn: 'count', open: true }), companies.dir, companies.records[0]!, all, boards, today)).toBe(1);
    expect(rollupValue(field({ from: 'S/Deals.board.json', fn: 'sum', field: 'value' }), companies.dir, companies.records[1]!, all, boards, today)).toBeNull();
    expect(rollupValue(field({ from: 'S/Nowhere', fn: 'count' }), companies.dir, companies.records[0]!, all, boards, today)).toBeNull();
  });

  it('are worked out for the table, and never read from nor written to a file', () => {
    const rolled = withRollups(companies, all, boards, today);
    expect(rolled.records[0]!.values.last_contact).toBe('2026-10-06');
    expect(withRollups(activities, all, boards, today)).toBe(activities);
    const read = parseRecord('---\nid: a1\nname: Acme Corp\nlast_contact: 2026-01-01\n---\n', companies.schema, 'C/a1.md');
    expect(read.values.last_contact).toBeUndefined();
    expect(read.extra.last_contact).toBe('2026-01-01');
    expect(serializeRecord({ ...read, values: { ...read.values, last_contact: '2026-10-06' } }, companies.schema)).toContain('last_contact: 2026-01-01');
    expect(parseSchema(serializeSchema(companies.schema))).toEqual(companies.schema);
  });
});
