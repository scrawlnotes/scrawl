import { describe, expect, it } from 'vitest';
import { type Collection, columnSums, defaultProblem, type Field, formatNumber, loadCollection, mixedCurrency, parseSchema, problemText, type Record, saveSchema, type Schema, serializeSchema, setNumberLocale } from './collection';
import { Computer, nextNumber, schemasOf } from './compute';
import { collectionSheet, excelFormat } from './csv';
import { MemoryFs } from './fs';
import { lineAt, parseRules, rulesPath, rulesProblems } from './rules';
import { mergeKindOf } from './sync/merge-files';

const today = '2026-10-21';

function record(id: string, name: string, values: Record['values'] = {}): Record {
  return { id, path: `S/${id}.md`, name, code: '', values: { name, ...values }, extra: {}, body: '' };
}
const schema = (fields: Field[]): Schema => ({ version: 2, template: 'blank', fields: [{ key: 'name', label: 'Name', type: 'name' }, ...fields] });
const link = (id: string, name: string) => ({ id, name });

const RULES = `// What a transaction must be.
check("line", () => direction != "Out" || !empty(line), "Pick the budget line")
check("due", () => due >= date, \`Due is before \${text(date)}\`);
/* The record as a whole. */
check(null, () => direction != "In" || empty(line), "Money coming in has no budget line")
`;

const projects: Collection = {
  dir: 'S/Projects',
  schema: schema([
    { key: 'code', label: 'Code', type: 'code', default: '=next("PRJ-", 4)' },
    { key: 'status', label: 'Status', type: 'select', options: ['Offer', 'Active'], default: 'Offer' },
    { key: 'start', label: 'Start', type: 'date', default: '=today()' },
    { key: 'currency', label: 'Currency', type: 'select', options: ['TRY', 'EUR'], default: 'TRY' },
    { key: 'owner', label: 'Owner', type: 'person', default: '=me()' },
  ]),
  records: [record('p1', 'Atakule Tower', { code: 'PRJ-0014' }), record('p2', 'Kadıköy Residence', { code: 'PRJ-0009' }), record('p3', 'Old', { code: 'OLD-0099' })],
};
const transactions: Collection = {
  dir: 'S/Transactions',
  schema: schema([
    { key: 'project', label: 'Project', type: 'link', collection: 'S/Projects' },
    { key: 'line', label: 'Line', type: 'text' },
    { key: 'direction', label: 'Direction', type: 'select', options: ['In', 'Out'], default: 'Out' },
    { key: 'currency', label: 'Currency', type: 'select', options: ['TRY', 'EUR', 'USD'], default: '=project.currency' },
    { key: 'amount', label: 'Amount', type: 'number', format: { style: 'currency', currencyField: 'currency', decimals: 2 } },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'due', label: 'Due', type: 'date' },
  ]),
  records: [
    record('t1', 'Guide rails', { direction: 'Out', amount: 96800, currency: 'TRY', date: '2026-10-02', due: '2026-10-09' }),
    record('t2', 'Door operators', { direction: 'Out', line: 'Material', amount: 18600, currency: 'EUR', date: '2026-10-05', due: '2026-10-01' }),
    record('t3', 'Down payment', { direction: 'In', line: 'Material', amount: 294000, currency: 'TRY' }),
    record('t4', 'Buffers', { direction: 'Out', line: 'Material', amount: 4200, currency: 'EUR' }),
    record('t5', 'Cables', { direction: 'Out', line: 'Material', amount: 1000 }),
  ],
  rules: RULES,
};

describe('rules', () => {
  it('reads checks and says on its line what is wrong with a rules file', () => {
    const rules = parseRules(RULES);
    expect(rules.checks.map((c) => c.field)).toEqual(['line', 'due', null]);
    expect(parseRules('').checks).toEqual([]);
    const scope = { fields: transactions.schema.fields };
    expect(rulesProblems(RULES, scope)).toEqual([]);
    // What cannot be read stops the file, on its line; a check that can is checked against the fields.
    const unread = rulesProblems('check("line", () => true, "x")\nonSave("Paid", () => 1)', scope);
    expect(unread).toHaveLength(1);
    expect(unread[0]!.line).toBe(2);
    expect(unread[0]!.message).toMatch(/check\(…\)/);
    expect(rulesProblems('check(line, () => true, "x")', scope)[0]!.message).toMatch(/key of the field/);
    expect(rulesProblems('check("line", direction == "In", "x")', scope)[0]!.message).toMatch(/\(\) =>/);
    expect(rulesProblems('check("line", () => true, 3)', scope)[0]!.message).toMatch(/what to say/);
    expect(rulesProblems('check("line", () => true, "x"', scope)[0]!.message).toMatch(/not a formula yet|not expected/);
    expect(rulesProblems('/* open', scope)[0]!.message).toMatch(/comment/);
    const wrong = rulesProblems('check("line", () => true, "x")\n\ncheck("due", () => due >= dat, "x")\ncheck("paid", () => true, "x")\ncheck("due", () => direction - 1, "x")', scope);
    expect(wrong.map((p) => p.line)).toEqual([3, 4, 5]);
    expect(wrong[0]!.message).toMatch(/dat/);
    expect(wrong[1]!.message).toMatch(/paid/);
    expect(wrong[2]!.message).toMatch(/choice/);
    expect(lineAt('a\nb\nc', 4)).toBe(3);
    // A rule may ask the next number and who looks; a formula may not.
    expect(rulesProblems('check(null, () => me() != "", "x")', scope)).toEqual([]);
  });

  it('marks a record that fails a check at its field, or as a whole, and not one whose check gives nothing', () => {
    const computer = new Computer([projects, transactions], {}, today);
    const at = (id: string) => computer.checks(transactions.dir, transactions.records.find((r) => r.id === id)!);
    expect(at('t1')).toEqual([{ field: 'line', kind: 'check', message: 'Pick the budget line' }]);
    expect(at('t2')).toEqual([{ field: 'due', kind: 'check', message: 'Due is before 2026-10-05' }]);
    expect(at('t3')).toEqual([{ field: '', kind: 'check', message: 'Money coming in has no budget line' }]);
    // No days yet: the check gives nothing, which is not a failure.
    expect(at('t4')).toEqual([]);
    // As a form holds it, not saved yet.
    expect(computer.checks(transactions.dir, transactions.records[0]!, { direction: 'Out', line: 'Labour' })).toEqual([]);
    expect(computer.checks(transactions.dir, null, { direction: 'Out' })).toEqual([{ field: 'line', kind: 'check', message: 'Pick the budget line' }]);
    expect(problemText(at('t3')[0]!, undefined, transactions.records[2]!)).toBe('Money coming in has no budget line');
    // A file that cannot be read marks nothing until it is put right.
    const broken = new Computer([{ ...transactions, rules: 'check("line", () =>' }], {}, today);
    expect(broken.checks(transactions.dir, transactions.records[0]!)).toEqual([]);
  });

  it('is read with its collection and merged by lines as a note is', async () => {
    const fs = new MemoryFs();
    await saveSchema(fs, 'S/Transactions', transactions.schema);
    expect((await loadCollection(fs, 'S/Transactions')).rules).toBeUndefined();
    await fs.writeText(rulesPath('S/Transactions'), RULES);
    expect((await loadCollection(fs, 'S/Transactions')).rules).toBe(RULES);
    expect(mergeKindOf('Work/Transactions/_rules.js')).toBe('text');
    expect(mergeKindOf('Work/Transactions/rules.js')).toBeNull();
  });
});

describe('default values', () => {
  it('fills a new record: values, today, who makes it, the next number, a linked record’s field', () => {
    const computer = new Computer([projects, transactions], {}, today);
    expect(computer.defaults(projects.dir, {}, 'Kaan')).toEqual({ code: 'PRJ-0015', status: 'Offer', start: today, currency: 'TRY', owner: 'Kaan' });
    // What is given stays; a link given first is read by a default after it.
    const euro = new Computer([{ ...projects, records: [...projects.records, record('p4', 'Milan', { currency: 'EUR' })] }, transactions], {}, today);
    expect(euro.defaults(transactions.dir, { project: link('p4', 'Milan') })).toEqual({ project: link('p4', 'Milan'), direction: 'Out', currency: 'EUR' });
    expect(computer.defaults(projects.dir, { status: 'Active' }).status).toBe('Active');
    expect(nextNumber([], 'PRJ-', 4)).toBe('PRJ-0001');
    expect(nextNumber(['prj-7', 'PRJ-0012', 'X-99', 3], 'PRJ-', 2)).toBe('PRJ-13');
  });

  it('are kept in the schema and checked', () => {
    const read = parseSchema(serializeSchema(projects.schema));
    expect(read.fields.find((f) => f.key === 'code')!.default).toBe('=next("PRJ-", 4)');
    expect(read.fields.find((f) => f.key === 'status')!.default).toBe('Offer');
    // What is worked out takes none.
    expect(parseSchema(JSON.stringify({ version: 2, fields: [{ key: 'f', type: 'formula', formula: '1', default: 2 }] })).fields[0]!.default).toBeUndefined();
    const fields = projects.schema;
    const problem = (field: Field) => defaultProblem(field, fields, schemasOf([projects, transactions]));
    for (const field of projects.schema.fields) expect(problem(field)).toBeNull();
    expect(problem({ key: 'status', label: 'Status', type: 'select', options: ['Offer'], default: 'Won' })).toMatch(/Won/);
    expect(problem({ key: 'start', label: 'Start', type: 'date', default: 'tomorrow' })).toMatch(/YYYY-MM-DD/);
    expect(problem({ key: 'start', label: 'Start', type: 'date', default: '="x"' })).toMatch(/a text/);
    expect(problem({ key: 'n', label: 'N', type: 'number', default: '=nope' })).toMatch(/nope/);
    expect(defaultProblem({ key: 'n', label: 'N', type: 'formula', formula: 'next("A")' }, fields)).toBeNull();
  });
});

describe('the number format', () => {
  it('writes numbers as the device’s language does, money with its symbol', () => {
    try {
      setNumberLocale('tr-TR');
      expect(formatNumber(1240000, { style: 'currency', currency: 'TRY', decimals: 0 })).toBe('₺1.240.000');
      expect(formatNumber(18600, { style: 'currency', currencyField: 'currency', decimals: 2 }, 'EUR')).toBe('€18.600,00');
      expect(formatNumber(1250.5)).toBe('1.250,5');
      setNumberLocale('en-US');
      expect(formatNumber(1250.5, { style: 'currency', currency: 'TRY', decimals: 2 })).toBe('₺1,250.50');
      expect(formatNumber(0.18, { style: 'percent' })).toBe('18%');
      expect(formatNumber(2.345, { style: 'number', decimals: 1 })).toBe('2.3');
      // Money whose currency is not known is a number.
      expect(formatNumber(1000, { style: 'currency', currencyField: 'currency' })).toBe('1,000');
    } finally {
      setNumberLocale(undefined);
    }
  });

  it('is kept in the schema; a sum of money in records’ own currencies is one for each', () => {
    const read = parseSchema(serializeSchema(transactions.schema));
    expect(read.fields.find((f) => f.key === 'amount')!.format).toEqual({ style: 'currency', currencyField: 'currency', decimals: 2 });
    const odd = parseSchema(JSON.stringify({ version: 2, fields: [{ key: 'a', type: 'number', format: { style: 'currency', currency: 'try', decimals: 9 } }, { key: 'b', type: 'text', format: { style: 'percent' } }] }));
    expect(odd.fields[0]!.format).toEqual({ style: 'currency', currency: 'TRY' });
    expect(odd.fields[1]!.format).toBeUndefined();
    expect(columnSums(transactions.records, transactions.schema, 'amount', today)).toEqual([
      { value: 390800, currency: 'TRY' },
      { value: 22800, currency: 'EUR' },
      { value: 1000 },
    ]);
    expect(columnSums(projects.records, projects.schema, 'name', today)).toBeNull();
  });

  it('goes to Excel as a number in its format', () => {
    expect(excelFormat({ style: 'currency', currency: 'TRY', decimals: 0 })).toBe('"₺"#,##0');
    expect(excelFormat({ style: 'currency', currencyField: 'currency' }, 'EUR')).toBe('"€"#,##0.00');
    expect(excelFormat({ style: 'percent', decimals: 1 })).toBe('0.0%');
    expect(excelFormat({ style: 'number' }, undefined, 2.5)).toBe('#,##0.00');
    expect(excelFormat({ style: 'currency', currencyField: 'currency' }, undefined, 1000)).toBe('#,##0');
    const rows = collectionSheet(transactions, [projects, transactions], {}, 'Notes', today);
    expect(rows[1]![5]).toEqual({ number: 96800, format: '"₺"#,##0.00' });
    expect(rows[2]![5]).toEqual({ number: 18600, format: '"€"#,##0.00' });
  });

  it('warns of a rollup that adds currencies together, until a condition keeps it to one', () => {
    const of = schemasOf([projects, transactions]);
    const spent: Field = { key: 'spent', label: 'Spent', type: 'rollup', rollup: { from: 'S/Transactions', fn: 'sum', field: 'amount' } };
    expect(mixedCurrency(spent, of)).toMatch(/Amount.*Currency/);
    expect(mixedCurrency({ ...spent, rollup: { ...spent.rollup!, where: [{ field: 'currency', op: 'is', value: ['EUR'] }] } }, of)).toBeNull();
    expect(mixedCurrency({ ...spent, rollup: { ...spent.rollup!, where: [{ field: 'currency', op: 'is', value: ['EUR', 'TRY'] }] } }, of)).toMatch(/Amount/);
    expect(mixedCurrency({ ...spent, rollup: { ...spent.rollup!, fn: 'count' } }, of)).toBeNull();
  });
});
