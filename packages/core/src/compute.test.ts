import { describe, expect, it } from 'vitest';
import { addCard, newBoard } from './board';
import { type Collection, type Field, groupRecords, matchesConditions, parseRecord, parseSchema, type Record, type Schema, serializeRecord, serializeSchema, sortRecords } from './collection';
import { Computer, schemasOf, shownField, withComputed } from './compute';

const today = '2026-10-20';

function record(id: string, name: string, values: Record['values'] = {}): Record {
  return { id, path: `S/${id}.md`, name, code: '', values: { name, ...values }, extra: {}, body: '' };
}
const schema = (fields: Field[]): Schema => ({ version: 2, template: 'blank', fields: [{ key: 'name', label: 'Name', type: 'name' }, ...fields] });
const link = (id: string, name: string) => ({ id, name });

// A company that runs projects: its projects, their budget lines and their transactions.
const companies: Collection = {
  dir: 'S/Companies',
  schema: schema([{ key: 'segment', label: 'Segment', type: 'select', options: ['SMB', 'Enterprise'], colors: { Enterprise: 'purple' } }]),
  records: [record('c1', 'Ankara Holding', { segment: 'Enterprise' }), record('c2', 'Moda Yapı', { segment: 'SMB' })],
};
const projects: Collection = {
  dir: 'S/Projects',
  schema: schema([
    { key: 'customer', label: 'Customer', type: 'link', collection: 'S/Companies' },
    { key: 'start', label: 'Start', type: 'date' },
    { key: 'budget', label: 'Budget', type: 'rollup', rollup: { from: 'S/Budget lines', fn: 'sum', field: 'planned' } },
    { key: 'spent', label: 'Spent', type: 'rollup', rollup: { from: 'S/Transactions', fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Out'] }] } },
    { key: 'income', label: 'Income', type: 'rollup', rollup: { from: 'S/Transactions', fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['In'] }] } },
    { key: 'actual', label: 'Actual by lines', type: 'rollup', rollup: { from: 'S/Budget lines', fn: 'sum', field: 'actual' } },
    { key: 'remaining', label: 'Remaining', type: 'formula', formula: 'budget - spent' },
    { key: 'health', label: 'Health', type: 'formula', formula: 'spent > budget ? "Over budget" : "OK"' },
    { key: 'segment', label: 'Segment', type: 'lookup', lookup: { link: 'customer', field: 'segment' } },
    { key: 'rate', label: 'Rate', type: 'formula', formula: 'customer.segment == "Enterprise" ? 0.1 : 0' },
    { key: 'late', label: 'Late', type: 'rollup', rollup: { from: 'S/Transactions', fn: 'count', where: [{ field: 'status', op: 'is-not', value: ['Paid'] }, { field: 'due', op: 'before', value: 'today' }] } },
    { key: 'average', label: 'Average', type: 'rollup', rollup: { from: 'S/Transactions', fn: 'avg', field: 'amount' } },
    { key: 'last', label: 'Last due', type: 'rollup', rollup: { from: 'S/Transactions', fn: 'max', field: 'due' } },
    { key: 'open_cards', label: 'Open cards', type: 'rollup', rollup: { from: 'S/Projects.board.json', fn: 'count', open: true } },
    { key: 'big_cards', label: 'Big cards', type: 'rollup', rollup: { from: 'S/Projects.board.json', fn: 'sum', field: 'value', where: [{ field: 'value', op: 'gt', value: 1000 }] } },
  ]),
  records: [
    record('p1', 'Atakule Tower', { customer: link('c1', 'Ankara Holding'), start: '2026-09-01' }),
    record('p2', 'Kadıköy Residence', { customer: link('c2', 'Moda Yapı') }),
    record('p3', 'Antalya Hotel'),
  ],
};
const lines: Collection = {
  dir: 'S/Budget lines',
  schema: schema([
    { key: 'project', label: 'Project', type: 'link', collection: 'S/Projects' },
    { key: 'planned', label: 'Planned', type: 'number' },
    { key: 'actual', label: 'Actual', type: 'rollup', rollup: { from: 'S/Transactions', fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Out'] }] } },
    { key: 'left', label: 'Left', type: 'formula', formula: 'planned - actual' },
  ]),
  records: [
    record('l1', 'Material', { project: link('p1', 'Atakule Tower'), planned: 1000 }),
    record('l2', 'Labour', { project: link('p1', 'Atakule Tower'), planned: 500 }),
    record('l3', 'Material', { project: link('p2', 'Kadıköy Residence'), planned: 300 }),
  ],
};
const transactions: Collection = {
  dir: 'S/Transactions',
  schema: schema([
    { key: 'project', label: 'Project', type: 'link', collection: 'S/Projects' },
    { key: 'line', label: 'Line', type: 'link', collection: 'S/Budget lines' },
    { key: 'direction', label: 'Direction', type: 'select', options: ['In', 'Out'] },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'due', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Invoiced', 'Paid'] },
    { key: 'customer', label: 'Customer', type: 'lookup', lookup: { link: 'project', field: 'customer' } },
    { key: 'segment', label: 'Segment', type: 'formula', formula: 'project.customer.segment' },
  ]),
  records: [
    record('t1', 'Steel', { project: link('p1', 'Atakule Tower'), line: link('l1', 'Material'), direction: 'Out', amount: 800, due: '2026-10-12', status: 'Paid' }),
    record('t2', 'Crew', { project: link('p1', 'Atakule Tower'), line: link('l2', 'Labour'), direction: 'Out', amount: 400, due: '2026-10-17', status: 'Invoiced' }),
    record('t3', 'Instalment', { project: link('p1', 'Atakule Tower'), direction: 'In', amount: 2000, due: '2026-10-25', status: 'Invoiced' }),
    record('t4', 'Rails', { project: link('p2', 'Kadıköy Residence'), line: link('l3', 'Material'), direction: 'Out', amount: 350, due: '2026-10-09', status: 'Invoiced' }),
  ],
};
let projectsBoard = newBoard('Projects', 'simple');
projectsBoard = { ...projectsBoard, fields: [{ key: 'project', label: 'Project', type: 'link', collection: 'S/Projects' }, { key: 'value', label: 'Value', type: 'number' }, { key: 'segment', label: 'Segment', type: 'lookup', lookup: { link: 'project', field: 'segment' } }] };
projectsBoard = addCard(projectsBoard, { title: 'Survey', values: { project: link('p1', 'Atakule Tower'), value: 1200 } }, undefined, undefined, 'k1');
projectsBoard = addCard(projectsBoard, { title: 'Order the cabin', values: { project: link('p1', 'Atakule Tower'), value: 600 } }, undefined, undefined, 'k2');
const boards = { 'S/Projects.board.json': projectsBoard };
const all = [companies, projects, lines, transactions];

describe('what is worked out across a space', () => {
  const computer = new Computer(all, boards, today);
  const of = (c: Collection, id: string) => computer.values(c.dir, c.records.find((r) => r.id === id)!);

  it("works out a project's money from its lines and transactions", () => {
    const p1 = of(projects, 'p1');
    expect(p1.budget).toBe(1500);
    expect(p1.spent).toBe(1200);
    expect(p1.income).toBe(2000);
    expect(p1.remaining).toBe(300);
    expect(p1.health).toBe('OK');
    expect(p1.actual).toBe(1200);
    const p2 = of(projects, 'p2');
    expect([p2.budget, p2.spent, p2.remaining, p2.health]).toEqual([300, 350, -50, 'Over budget']);
    // Nothing links to a new project: its sums are 0, so what remains is worked out.
    const p3 = of(projects, 'p3');
    expect([p3.budget, p3.spent, p3.remaining, p3.average, p3.last]).toEqual([0, 0, 0, null, null]);
    expect(of(lines, 'l1')).toMatchObject({ actual: 800, left: 200 });
  });

  it('shows a linked record’s field: lookups, and a dot in a formula', () => {
    expect(of(projects, 'p1')).toMatchObject({ segment: 'Enterprise', rate: 0.1 });
    expect(of(projects, 'p2')).toMatchObject({ segment: 'SMB', rate: 0 });
    expect(of(projects, 'p3')).toMatchObject({ segment: null, rate: 0 });
    expect(of(transactions, 't1')).toMatchObject({ customer: { id: 'c1', name: 'Ankara Holding' }, segment: 'Enterprise' });
  });

  it('rolls up what meets conditions, today among them; averages; and the cards of a board', () => {
    expect(of(projects, 'p1')).toMatchObject({ late: 1, average: 3200 / 3, last: '2026-10-25', open_cards: 2, big_cards: 1200 });
    const card = projectsBoard.cards.find((c) => c.id === 'k1')!;
    expect(computer.cardValue('S/Projects.board.json', card, projectsBoard.fields![2]!)).toBe('Enterprise');
  });

  it('gives nothing for fields that read each other round, and says which', () => {
    const loop: Collection = { dir: 'S/Loop', schema: schema([{ key: 'a', label: 'A', type: 'formula', formula: 'b + 1' }, { key: 'b', label: 'B', type: 'formula', formula: 'a + 1' }]), records: [record('x', 'X')] };
    const c = new Computer([loop], {}, today);
    expect(c.values(loop.dir, loop.records[0]!)).toMatchObject({ a: null, b: null });
    expect([...c.round]).toEqual(expect.arrayContaining(['S/Loop#a']));
  });

  it('works out a record being written from what is typed', () => {
    const drafted = computer.draft(projects.dir, projects.records[0]!, { ...projects.records[0]!.values, customer: link('c2', 'Moda Yapı') });
    expect(drafted).toMatchObject({ segment: 'SMB', rate: 0, spent: 1200 });
    expect(computer.draft(projects.dir, null, { name: 'New' })).toMatchObject({ budget: 0, segment: null });
  });

  it('puts what is worked out among the values for the table, and never in the file', () => {
    const shown = withComputed(transactions, all, boards, today);
    expect(shown.records[0]!.values.segment).toBe('Enterprise');
    const sorted = sortRecords(withComputed(projects, all, boards, today).records, projects.schema, { key: 'health', dir: 'asc' }, today);
    expect(sorted.map((r) => r.values.health)).toEqual(['OK', 'OK', 'Over budget']);
    const rows = withComputed(projects, all, boards, today).records;
    expect(rows.filter((r) => matchesConditions(r, projects.schema, [{ field: 'health', op: 'is', value: 'Over budget' }], today)).map((r) => r.name)).toEqual(['Kadıköy Residence']);
    const segment = shownField(projects.schema.fields.find((f) => f.key === 'segment')!, { fields: projects.schema.fields, schemaOf: schemasOf(all, boards) });
    expect(segment).toMatchObject({ key: 'segment', label: 'Segment', type: 'select', options: ['SMB', 'Enterprise'], colors: { Enterprise: 'purple' } });
    expect(groupRecords(rows, projects.schema, 'segment', today, segment).map((g) => [g.key, g.records.length])).toEqual([['SMB', 1], ['Enterprise', 1], ['', 1]]);
    const written = serializeRecord(shown.records[0]!, transactions.schema);
    expect(written).not.toContain('Ankara');
    expect(parseRecord('---\nid: t9\nname: X\ncustomer: Someone\n---\n', transactions.schema, 'S/t9.md').extra.customer).toBe('Someone');
  });

  it('reads and writes lookups and rollup conditions in the schema', () => {
    expect(parseSchema(serializeSchema(projects.schema))).toEqual(projects.schema);
    const read = parseSchema(JSON.stringify({ version: 2, fields: [{ key: 'c', label: 'C', type: 'lookup', lookup: { link: 'Project', field: 'Customer' }, required: true }] }));
    expect(read.fields[0]).toEqual({ key: 'c', label: 'C', type: 'lookup', lookup: { link: 'project', field: 'customer' } });
  });

  it('tells what a worked-out field shows as', () => {
    const scope = { fields: projects.schema.fields, schemaOf: schemasOf(all, boards) };
    const type = (key: string) => shownField(projects.schema.fields.find((f) => f.key === key)!, scope).type;
    expect([type('remaining'), type('health'), type('last'), type('budget'), type('rate')]).toEqual(['number', 'text', 'date', 'number', 'number']);
  });

  it('works out five thousand records with ten worked-out fields quickly', () => {
    const many: Collection = { ...transactions, records: Array.from({ length: 5000 }, (_, i) => record(`m${i}`, `T${i}`, { project: link(`p${(i % 3) + 1}`, ''), direction: i % 2 ? 'In' : 'Out', amount: i, due: '2026-10-01', status: 'Paid' })) };
    const heavy: Collection = {
      ...projects,
      records: Array.from({ length: 300 }, (_, i) => record(`p${i + 1}`, `P${i}`)),
    };
    const started = performance.now();
    const shown = withComputed(heavy, [companies, heavy, lines, many], boards, today);
    withComputed(many, [companies, heavy, lines, many], boards, today);
    expect(shown.records[0]!.values.income).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
