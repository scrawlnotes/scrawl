import { describe, expect, it } from 'vitest';
import {
  addRecord,
  columnSum,
  type Condition,
  evaluateFormula,
  fieldValueOf,
  groupRecords,
  matchesConditions,
  opsFor,
  opTakesValue,
  putView,
  removeView,
  type View,
  freshenLinks,
  linkTo,
  createCollection,
  layoutOf,
  loadCollection,
  makeCode,
  matchesQuery,
  missingFields,
  newSchema,
  parseRecord,
  parseSchema,
  readValue,
  type Record,
  recordLabel,
  serializeRecord,
  serializeSchema,
  sortRecords,
  splitFrontMatter,
  unplacedFields,
  valueText,
  updateRecord,
} from './collection';
import { MemoryFs } from './fs';

const ACME = `---
id: rec-1
name: Acme Corp
code: CUS-0012
website: acme.example.com
segment: Mid-market
type:
  - customer
  - partner
owner: Kaan
status: active
founded: 2019
---
Design agency in Berlin.

## Log
- 2026-10-08 call
`;

describe('schema', () => {
  it('starts from a template with name and code first', () => {
    const schema = newSchema('companies');
    expect(schema.fields.slice(0, 2).map((f) => f.key)).toEqual(['name', 'code']);
    expect(schema.fields.find((f) => f.key === 'status')?.options).toEqual(['prospect', 'active', 'churned']);
    expect(newSchema('blank').fields.map((f) => f.key)).toEqual(['name', 'code']);
  });

  it('reads a schema file, mending what it can', () => {
    const schema = parseSchema(
      JSON.stringify({
        template: 'companies',
        fields: [
          { key: 'Website URL', type: 'url' },
          { key: 'name', label: 'Company' },
          { key: 'score', type: 'rating' },
          { key: '', type: 'text' },
        ],
        code: { prefix: 'CUS', next: 13 },
        layout: { columns: [{ items: [{ field: 'website_url' }, { block: 'body' }] }, { width: 2, sections: [{ title: 'Links', items: [{ block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' }] }] }] },
      }),
    );
    expect(schema.fields.map((f) => [f.key, f.type, f.label])).toEqual([
      ['name', 'text', 'Company'],
      ['code', 'text', 'Code'],
      ['website_url', 'url', 'website_url'],
      ['score', 'text', 'score'],
    ]);
    expect(schema.code).toEqual({ prefix: 'CUS', next: 13 });
    expect(schema.layout).toEqual({
      columns: [
        { sections: [{ items: [{ field: 'website_url' }, { block: 'body' }] }] },
        { width: 2, sections: [{ title: 'Links', items: [{ block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' }] }] },
      ],
    });
    expect(parseSchema('not json').fields.map((f) => f.key)).toEqual(['name', 'code']);
    expect(parseSchema(serializeSchema(schema))).toEqual(schema);
  });

  it('lays out every field but the name, then the body, when the schema has no layout', () => {
    const schema = newSchema('companies');
    expect(layoutOf(schema).columns).toHaveLength(1);
    expect(layoutOf(schema).columns[0]!.sections.map((s) => s.items.length)).toEqual([schema.fields.length - 1, 1]);
    expect(unplacedFields(schema)).toEqual([]);
    const laid = { ...schema, layout: { columns: [{ sections: [{ items: [{ field: 'website' }] }] }] } };
    expect(unplacedFields(laid).map((f) => f.key)).toEqual(['code', 'segment', 'type', 'owner', 'status', 'tags']);
  });
});

describe('record files', () => {
  const schema = newSchema('companies');

  it('splits front matter from the body', () => {
    expect(splitFrontMatter('plain note')).toEqual({ front: {}, body: 'plain note', hadFront: false });
    expect(splitFrontMatter('---\n- a list\n---\nbody')).toMatchObject({ hadFront: false });
    expect(splitFrontMatter('---\nname: X\n---\n')).toEqual({ front: { name: 'X' }, body: '', hadFront: true });
  });

  it('reads a record, keeping what the schema does not know', () => {
    const record = parseRecord(ACME, schema, 'Companies/Acme Corp.md');
    expect(record).toMatchObject({ id: 'rec-1', name: 'Acme Corp', code: 'CUS-0012' });
    expect(record.values).toEqual({ website: 'acme.example.com', segment: 'Mid-market', type: ['customer', 'partner'], owner: 'Kaan', status: 'active' });
    expect(record.extra).toEqual({ founded: 2019 });
    expect(record.body).toBe('Design agency in Berlin.\n\n## Log\n- 2026-10-08 call\n');
  });

  it('writes a record the same way every time and reads it back', () => {
    const record = parseRecord(ACME, schema, 'Companies/Acme Corp.md');
    const text = serializeRecord(record, schema);
    expect(text.startsWith('---\nid: rec-1\nname: Acme Corp\ncode: CUS-0012\nwebsite: acme.example.com\n')).toBe(true);
    expect(text).toContain('\nfounded: 2019\n---\nDesign agency');
    expect(parseRecord(text, schema, record.path)).toEqual(record);
    // Empty values are left out of the file.
    const bare = serializeRecord({ ...record, code: '', values: { website: '', type: [] }, extra: {}, body: '' }, schema);
    expect(bare).toBe('---\nid: rec-1\nname: Acme Corp\n---\n');
  });

  it('takes a plain note as a record named after its file', () => {
    const record = parseRecord('Just a note.\n', schema, 'Companies/Globex.md');
    expect(record).toMatchObject({ id: '', name: 'Globex', code: '', values: {}, body: 'Just a note.\n' });
  });

  it('reads values by their field type', () => {
    expect(readValue('number', '42')).toBe(42);
    expect(readValue('number', 'x')).toBeNull();
    expect(readValue('checkbox', 'true')).toBe(true);
    expect(readValue('date', new Date('2026-10-08T10:00:00Z'))).toBe('2026-10-08');
    expect(readValue('date', '2026-10-08T10:00')).toBe('2026-10-08');
    expect(readValue('date', 'soon')).toBeNull();
    expect(readValue('multi-select', 'one')).toEqual(['one']);
    expect(readValue('text', 7)).toBe('7');
  });
});

describe('a collection in a vault', () => {
  it('is made from a template, numbered when its name is taken', async () => {
    const fs = new MemoryFs();
    expect(await createCollection(fs, 'Scrawl', 'Companies', 'companies')).toBe('Scrawl/Companies');
    expect(await createCollection(fs, 'Scrawl', 'Companies', 'blank')).toBe('Scrawl/Companies 2');
    expect(await createCollection(fs, 'Scrawl', '', 'blank')).toBe('Scrawl/Collection');
    const { schema } = await loadCollection(fs, 'Scrawl/Companies');
    expect(schema.template).toBe('companies');
  });

  it('gives a file without an id one, and writes it', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, '', 'Companies', 'companies');
    await fs.writeText(`${dir}/Globex.md`, 'From another tool.\n');
    await fs.writeText(`${dir}/Acme.md`, ACME);
    await fs.writeText(`${dir}/_notes.md`, 'hidden');
    let n = 0;
    const collection = await loadCollection(fs, dir, () => `id-${++n}`);
    expect(collection.records.map((r) => [r.name, r.id])).toEqual([
      ['Acme Corp', 'rec-1'],
      ['Globex', 'id-1'],
    ]);
    expect(await fs.readText(`${dir}/Globex.md`)).toBe('---\nid: id-1\nname: Globex\n---\nFrom another tool.\n');
    const readOnly = await loadCollection(new MemoryFs(), dir, () => 'x', true).catch(() => null);
    expect(readOnly).toBeNull();
  });

  it('adds records as files, codes made by the rule', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, '', 'Payments', 'blank');
    let collection = await loadCollection(fs, dir);
    collection = { ...collection, schema: { ...collection.schema, code: { prefix: 'PAY', next: 12 } } };
    const first = await addRecord(fs, collection, { name: 'Hosting / October', values: { amount: 120 } }, 'a');
    expect(first.record).toMatchObject({ id: 'a', path: 'Payments/Hosting October.md', code: 'PAY-0012', name: 'Hosting / October' });
    expect(first.schema.code).toEqual({ prefix: 'PAY', next: 13 });
    collection = { ...collection, schema: first.schema };
    const second = await addRecord(fs, collection, { name: 'Hosting / October', code: 'X-1' }, 'b');
    expect(second.record.path).toBe('Payments/Hosting October 2.md');
    expect(second.record.code).toBe('X-1');
    expect(second.schema.code?.next).toBe(13);
    expect((await loadCollection(fs, dir)).schema.code?.next).toBe(13);
    await expect(addRecord(fs, collection, { name: '  ' })).rejects.toThrow();
    expect(makeCode({ prefix: 'CUS', next: 7 })).toBe('CUS-0007');
  });

  it('changes a record, renaming its file with its name', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, '', 'Companies', 'companies');
    const collection = await loadCollection(fs, dir);
    const { record } = await addRecord(fs, collection, { name: 'Acme', values: { status: 'prospect', website: 'acme.example.com' } }, 'a');
    const changed = await updateRecord(fs, collection.schema, record, { name: 'Acme Corp', values: { website: '', status: 'active' }, body: 'Met at the summit.' });
    expect(changed).toMatchObject({ path: 'Companies/Acme Corp.md', name: 'Acme Corp', values: { status: 'active' }, body: 'Met at the summit.\n' });
    expect((await fs.list(dir)).map((e) => e.name).sort()).toEqual(['Acme Corp.md', '_collection.json']);
    expect(parseRecord(await fs.readText(changed.path), collection.schema, changed.path)).toEqual(changed);
    // Only the case of the name changed: the file keeps its place.
    const cased = await updateRecord(fs, collection.schema, changed, { name: 'ACME Corp' });
    expect(cased.path).toBe('Companies/ACME Corp.md');
    expect((await fs.list(dir)).map((e) => e.name).sort()).toEqual(['ACME Corp.md', '_collection.json']);
  });
});

describe('looking at records', () => {
  const schema = newSchema('companies');
  const make = (name: string, values: Record['values'], code = ''): Record => ({ id: name, path: `C/${name}.md`, name, code, values, extra: {}, body: '' });
  const records = [make('Globex', { status: 'active', website: 'globex.example.com' }), make('Acme', { status: 'prospect' }, 'CUS-1'), make('Initech', {})];

  it('labels a record by its name and code', () => {
    expect(recordLabel(records[1]!)).toBe('Acme · CUS-1');
    expect(recordLabel(records[0]!)).toBe('Globex');
  });

  it('finds records by name, code or a text field', () => {
    expect(records.filter((r) => matchesQuery(r, schema, 'cus-1')).map((r) => r.name)).toEqual(['Acme']);
    expect(records.filter((r) => matchesQuery(r, schema, 'globex.example')).map((r) => r.name)).toEqual(['Globex']);
    expect(records.filter((r) => matchesQuery(r, schema, 'ACTIVE')).map((r) => r.name)).toEqual(['Globex']);
    expect(records.filter((r) => matchesQuery(r, schema, '  ')).length).toBe(3);
  });

  it('sorts by a field, empty values last, ties by name', () => {
    expect(sortRecords(records, schema, { key: 'status', dir: 'asc' }).map((r) => r.name)).toEqual(['Globex', 'Acme', 'Initech']);
    expect(sortRecords(records, schema, { key: 'status', dir: 'desc' }).map((r) => r.name)).toEqual(['Acme', 'Globex', 'Initech']);
    expect(sortRecords(records, schema, { key: 'name', dir: 'desc' }).map((r) => r.name)).toEqual(['Initech', 'Globex', 'Acme']);
    expect(sortRecords(records, schema, { key: 'code', dir: 'asc' }).map((r) => r.name)).toEqual(['Acme', 'Globex', 'Initech']);
  });

  it('tells which required fields are empty', () => {
    const strict = { ...schema, fields: schema.fields.map((f) => (f.key === 'status' ? { ...f, required: true } : f)) };
    expect(missingFields({ name: ' ', values: {} }, strict)).toEqual(['name', 'status']);
    expect(missingFields({ name: 'Acme', values: { status: 'active' } }, strict)).toEqual([]);
  });
});

describe('links and the other templates', () => {
  it('starts every template with name and code, links pointing beside the collection', () => {
    const people = newSchema('people', 'Work');
    expect(people.fields.find((f) => f.key === 'company')).toEqual({ key: 'company', label: 'Company', type: 'link', collection: 'Work/Companies' });
    expect(newSchema('payments').code).toEqual({ prefix: 'PAY', next: 1 });
    expect(newSchema('activities').fields.map((f) => f.key)).toEqual(['name', 'code', 'type', 'date', 'company', 'person', 'by']);
    const schema = parseSchema(serializeSchema(people));
    expect(schema).toEqual(people);
    expect(parseSchema(JSON.stringify({ template: 'feedback', fields: [{ key: 'person', type: 'link', collection: '/Work/People/', many: true }] })).fields[2]).toEqual({
      key: 'person',
      label: 'person',
      type: 'link',
      collection: 'Work/People',
      many: true,
    });
  });

  it('reads and writes links as maps with the name and code they had', () => {
    const schema = newSchema('people', 'Work');
    const text = '---\nid: p1\nname: Lena Hartmann\ncompany:\n  id: c1\n  name: Acme Corp\n  code: CUS-0012\n---\n';
    const record = parseRecord(text, schema, 'Work/People/Lena Hartmann.md');
    expect(record.values.company).toEqual({ id: 'c1', name: 'Acme Corp', code: 'CUS-0012' });
    expect(serializeRecord(record, schema)).toBe(text);
    expect(valueText(record.values.company)).toBe('Acme Corp · CUS-0012');
    expect(matchesQuery(record, schema, 'cus-00')).toBe(true);
    // A link written by hand as a name alone still shows, with no id to follow.
    expect(parseRecord('---\nname: X\ncompany: Globex\n---\n', schema, 'Work/People/X.md').values.company).toEqual({ id: '', name: 'Globex' });
    const many = { ...schema, fields: schema.fields.map((f) => (f.key === 'company' ? { ...f, many: true } : f)) };
    expect(parseRecord(text, many, 'Work/People/Lena Hartmann.md').values.company).toEqual([{ id: 'c1', name: 'Acme Corp', code: 'CUS-0012' }]);
    expect(linkTo({ id: 'c1', name: 'Acme', code: '' })).toEqual({ id: 'c1', name: 'Acme' });
  });

  it('freshens the names of links from the records they point at', () => {
    const schema = newSchema('people', 'Work');
    const values = { company: { id: 'c1', name: 'Acme', code: 'CUS-0012' }, email: 'l@acme.example.com' };
    const same = freshenLinks(values, schema, () => undefined);
    expect(same).toBe(values);
    const fresh = freshenLinks(values, schema, (collection, id) => (collection === 'Work/Companies' && id === 'c1' ? { id, name: 'Acme Corp', code: 'CUS-0012' } : undefined));
    expect(fresh.company).toEqual({ id: 'c1', name: 'Acme Corp', code: 'CUS-0012' });
    expect(fresh.email).toBe('l@acme.example.com');
  });
});

describe('formulas, conditions, groups and sums', () => {
  const schema = {
    ...newSchema('blank'),
    fields: [
      ...newSchema('blank').fields,
      { key: 'qty', label: 'Qty', type: 'number' as const },
      { key: 'unit_price', label: 'Unit price', type: 'number' as const },
      { key: 'total', label: 'Total', type: 'formula' as const, formula: 'qty * unit_price' },
      { key: 'last_contact', label: 'Last contact', type: 'date' as const },
      { key: 'quiet', label: 'Quiet days', type: 'formula' as const, formula: 'today() - last_contact' },
      { key: 'status', label: 'Status', type: 'select' as const, options: ['active', 'prospect'] },
      { key: 'tags', label: 'Tags', type: 'multi-select' as const, options: [] },
      { key: 'paid', label: 'Paid', type: 'checkbox' as const },
    ],
  };
  const make = (name: string, values: Record['values']): Record => ({ id: name, path: `C/${name}.md`, name, code: '', values, extra: {}, body: '' });
  const today = '2026-10-08';
  const records = [
    make('Acme', { qty: 3, unit_price: 10.5, last_contact: '2026-10-01', status: 'active', tags: ['design', 'berlin'], paid: true }),
    make('Globex', { qty: 2, unit_price: 100, last_contact: '2026-09-08', status: 'prospect', tags: ['berlin'] }),
    make('Initech', { qty: 1, status: 'active' }),
  ];

  it('works out formulas, and tells when it cannot', () => {
    expect(evaluateFormula('qty * unit_price', records[0]!.values, schema, today)).toBe(31.5);
    expect(evaluateFormula('today() - last_contact', records[1]!.values, schema, today)).toBe(30);
    expect(evaluateFormula('(qty + 1) * 2 - -1', records[2]!.values, schema, today)).toBe(5);
    expect(evaluateFormula('qty * unit_price', records[2]!.values, schema, today)).toBeNull();
    expect(evaluateFormula('qty / 0', records[0]!.values, schema, today)).toBeNull();
    expect(evaluateFormula('qty +', records[0]!.values, schema, today)).toBeNull();
    expect(evaluateFormula('nothing * 2', records[0]!.values, schema, today)).toBeNull();
    expect(evaluateFormula('paid * 10', records[0]!.values, schema, today)).toBe(10);
    expect(fieldValueOf(records[0]!, schema.fields.find((f) => f.key === 'total')!, schema, today)).toBe(31.5);
    expect(valueText(31.5)).toBe('31.5');
    expect(valueText(1 / 3)).toBe('0.33');
  });

  it('matches conditions by field type', () => {
    const names = (conditions: Condition[]) => records.filter((r) => matchesConditions(r, schema, conditions, today)).map((r) => r.name);
    expect(names([{ field: 'status', op: 'is', value: 'active' }])).toEqual(['Acme', 'Initech']);
    expect(names([{ field: 'status', op: 'is', value: ['prospect'] }])).toEqual(['Globex']);
    expect(names([{ field: 'tags', op: 'is', value: 'berlin' }, { field: 'status', op: 'is-not', value: 'active' }])).toEqual(['Globex']);
    expect(names([{ field: 'total', op: 'gt', value: 50 }])).toEqual(['Globex']);
    expect(names([{ field: 'total', op: 'empty' }])).toEqual(['Initech']);
    expect(names([{ field: 'quiet', op: 'gt', value: '14' }])).toEqual(['Globex']);
    expect(names([{ field: 'last_contact', op: 'after', value: '2026-09-30' }])).toEqual(['Acme']);
    expect(names([{ field: 'last_contact', op: 'on', value: '2026-09-08' }])).toEqual(['Globex']);
    expect(names([{ field: 'paid', op: 'true' }])).toEqual(['Acme']);
    expect(names([{ field: 'paid', op: 'false' }])).toEqual(['Globex', 'Initech']);
    expect(names([{ field: 'name', op: 'contains', value: 'ni' }])).toEqual(['Initech']);
    expect(names([{ field: 'gone', op: 'is', value: 'x' }])).toHaveLength(3);
    expect(opsFor('date')).toEqual(['on', 'before', 'after', 'empty', 'not-empty']);
    expect(opTakesValue('empty')).toBe(false);
  });

  it('groups by a field, with the records without one last, and sums number columns', () => {
    const groups = groupRecords(records, schema, 'tags', today);
    expect(groups.map((g) => [g.label, g.records.map((r) => r.name)])).toEqual([
      ['berlin', ['Acme', 'Globex']],
      ['design', ['Acme']],
      ['', ['Initech']],
    ]);
    expect(groupRecords(records, schema, 'status', today).map((g) => g.key)).toEqual(['active', 'prospect']);
    expect(groupRecords(records, schema, 'qty', today)).toHaveLength(1);
    expect(columnSum(records, schema, 'total', today)).toBe(231.5);
    expect(columnSum(records, schema, 'qty', today)).toBe(6);
    expect(columnSum(records, schema, 'status', today)).toBeNull();
    expect(sortRecords(records, schema, { key: 'total', dir: 'desc' }, today).map((r) => r.name)).toEqual(['Globex', 'Acme', 'Initech']);
  });

  it('keeps views in the schema file', () => {
    const view: View = { id: 'v1', name: 'Berlin, active', conditions: [{ field: 'tags', op: 'is', value: ['berlin'] }, { field: 'status', op: 'is', value: 'active' }], sort: { key: 'total', dir: 'desc' }, group: 'status', columns: ['name', 'total'] };
    const withView = putView(schema, view);
    const read = parseSchema(serializeSchema(withView));
    expect(read.views).toEqual([view]);
    expect(read.fields.find((f) => f.key === 'total')).toEqual({ key: 'total', label: 'Total', type: 'formula', formula: 'qty * unit_price' });
    expect(putView(withView, { ...view, name: 'Renamed' }).views).toHaveLength(1);
    expect(removeView(withView, 'v1').views).toBeUndefined();
    // A view with a condition on a field that is gone keeps its other conditions.
    const broken = parseSchema(JSON.stringify({ fields: schema.fields, views: [{ id: 'v2', name: 'x', conditions: [{ field: 'gone', op: 'is', value: 'a' }, { field: 'status', op: 'is', value: 'active' }] }] }));
    expect(broken.views?.[0]?.conditions).toEqual([{ field: 'status', op: 'is', value: 'active' }]);
  });
});
