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
  type Collection,
  fieldHref,
  isComplete,
  linkFieldsTo,
  linkGone,
  linkedRecords,
  linkedValues,
  linkingCollections,
  newRecordId,
  moveCollection,
  optionColor,
  readWidths,
  renameCollection,
  retargetLinks,
  layoutOf,
  loadCollection,
  matchesQuery,
  missingFields,
  newSchema,
  parseRecord,
  parseSchema,
  readValue,
  type Record,
  recordLabel,
  recordTitle,
  type Schema,
  serializeRecord,
  serializeSchema,
  sortRecords,
  splitFrontMatter,
  unplacedFields,
  valueText,
  updateRecord,
} from './collection';
import { MemoryFs } from './fs';
import { readTrash, trashItem } from './vault';

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

/** A schema with a code field after its name, as a person may add one. */
const withCode = (schema: Schema): Schema => ({ ...schema, fields: [schema.fields[0]!, { key: 'code', label: 'Code', type: 'code' }, ...schema.fields.slice(1)] });

describe('schema', () => {
  it('starts from a template with a name field first and no code; Blank with no fields', () => {
    const schema = newSchema('companies');
    expect(schema.version).toBe(2);
    expect(schema.fields[0]).toEqual({ key: 'name', label: 'Name', type: 'name' });
    expect(schema.fields.some((f) => f.type === 'code')).toBe(false);
    expect(schema.fields.find((f) => f.key === 'status')?.options).toEqual(['prospect', 'active', 'churned']);
    expect(newSchema('payments').fields.some((f) => f.type === 'code')).toBe(false);
    expect(newSchema('blank').fields).toEqual([]);
  });

  it('reads a schema file, mending what it can, with one name and one code at most', () => {
    const schema = parseSchema(
      JSON.stringify({
        version: 2,
        template: 'companies',
        fields: [
          { key: 'name', label: 'Company', type: 'name', required: true },
          { key: 'Website URL', type: 'url' },
          { key: 'title', label: 'Title', type: 'name' },
          { key: 'ref', label: 'Ref', type: 'code', required: true },
          { key: 'score', type: 'rating' },
          { key: '', type: 'text' },
        ],
        code: { prefix: 'CUS', next: 13 },
        layout: { columns: [{ items: [{ field: 'website_url' }, { block: 'body' }] }, { width: 2, sections: [{ title: 'Links', items: [{ block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' }] }] }] },
      }),
    );
    expect(schema.fields).toEqual([
      { key: 'name', label: 'Company', type: 'name' },
      { key: 'website_url', label: 'website_url', type: 'url' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'ref', label: 'Ref', type: 'code', required: true },
      { key: 'score', label: 'score', type: 'text' },
    ]);
    // A rule that made codes is gone; codes are typed.
    expect(schema).not.toHaveProperty('code');
    expect(schema.layout).toEqual({
      columns: [
        { sections: [{ items: [{ field: 'website_url' }, { block: 'body' }] }] },
        { width: 2, sections: [{ title: 'Links', items: [{ block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' }] }] },
      ],
    });
    expect(parseSchema(serializeSchema(schema))).toEqual(schema);
    expect(parseSchema(JSON.stringify({ version: 2, fields: [] })).fields).toEqual([]);
  });

  it('reads a schema file of version 1, when every schema had a name and a code, as one of version 2', () => {
    const old = parseSchema(
      JSON.stringify({
        version: 1,
        template: 'companies',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'code', label: 'Code', type: 'text' },
          { key: 'website', label: 'Website', type: 'url' },
        ],
        code: { prefix: 'CUS', next: 4 },
        layout: { columns: [{ width: 1, sections: [{ items: [{ field: 'code' }, { field: 'website' }, { block: 'body' }] }] }] },
        views: [{ id: 'v1', name: 'By name', conditions: [{ field: 'name', op: 'contains', value: 'a' }], sort: { key: 'name', dir: 'asc' } }],
      }),
    );
    expect(old.version).toBe(2);
    expect(old.fields).toEqual([
      { key: 'name', label: 'Name', type: 'name' },
      { key: 'code', label: 'Code', type: 'code' },
      { key: 'website', label: 'Website', type: 'url' },
    ]);
    expect(old).not.toHaveProperty('code');
    // The screen drew the name apart: the layout has it at its start now.
    expect(old.layout?.columns[0]?.sections[0]?.items).toEqual([{ field: 'name' }, { field: 'code' }, { field: 'website' }, { block: 'body' }]);
    expect(old.views?.[0]?.conditions).toEqual([{ field: 'name', op: 'contains', value: 'a' }]);
    // Without a version, or broken, a file is of version 1: it has a name, as every schema had.
    expect(parseSchema(JSON.stringify({ fields: [{ key: 'email', type: 'email' }] })).fields.map((f) => [f.key, f.type])).toEqual([['name', 'name'], ['email', 'email']]);
    expect(parseSchema('not json').fields).toEqual([{ key: 'name', label: 'Name', type: 'name' }]);
  });

  it('lays out every field, then the body, when the schema has no layout', () => {
    const schema = newSchema('feedback');
    expect(schema.layout).toBeUndefined();
    expect(layoutOf(schema).columns).toHaveLength(1);
    expect(layoutOf(schema).columns[0]!.sections.map((s) => s.items.length)).toEqual([schema.fields.length, 1]);
    expect(unplacedFields(schema)).toEqual([]);
    const laid = { ...schema, layout: { columns: [{ sections: [{ items: [{ field: 'source' }] }] }] } };
    expect(unplacedFields(laid).map((f) => f.key)).toEqual(['name', 'person', 'area', 'status']);
  });

  it('brings Companies and People their fields on the left and what links to them on the right', () => {
    const companies = newSchema('companies', 'Work');
    expect(companies.singular).toBe('company');
    expect(newSchema('blank').singular).toBeUndefined();
    expect(companies.layout?.columns.map((c) => c.width)).toEqual([1, 2]);
    expect(companies.layout?.columns[0]!.sections[0]!.items).toEqual([...companies.fields.map((f) => ({ field: f.key })), { block: 'body' }]);
    expect(companies.layout?.columns[1]!.sections[0]!.items).toEqual([
      { block: 'linked', collection: 'Work/Activities', sort: 'date', style: 'timeline' },
      { block: 'linked', collection: 'Work/People', style: 'list', fields: ['title'] },
    ]);
    expect(unplacedFields(companies)).toEqual([]);
    expect(newSchema('people').layout?.columns[1]!.sections[0]!.items).toEqual([{ block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' }]);
    expect(parseSchema(serializeSchema(companies))).toEqual(companies);
    expect(parseSchema(JSON.stringify({ version: 2, singular: '  deal ', layout: { columns: [{ items: [{ block: 'linked', collection: '/Work/Deals/', fields: ['Stage', 7] }] }] } }))).toMatchObject({
      singular: 'deal',
      layout: { columns: [{ sections: [{ items: [{ block: 'linked', collection: 'Work/Deals', fields: ['stage'] }] }] }] },
    });
  });
});

describe('record files', () => {
  const schema = withCode(newSchema('companies'));

  it('splits front matter from the body', () => {
    expect(splitFrontMatter('plain note')).toEqual({ front: {}, body: 'plain note', hadFront: false });
    expect(splitFrontMatter('---\n- a list\n---\nbody')).toMatchObject({ hadFront: false });
    expect(splitFrontMatter('---\nname: X\n---\n')).toEqual({ front: { name: 'X' }, body: '', hadFront: true });
  });

  it('reads a record, keeping what the schema does not know', () => {
    const record = parseRecord(ACME, schema, 'Companies/Acme Corp.md');
    expect(record).toMatchObject({ id: 'rec-1', name: 'Acme Corp', code: 'CUS-0012' });
    expect(record.values).toEqual({ name: 'Acme Corp', code: 'CUS-0012', website: 'acme.example.com', segment: 'Mid-market', type: ['customer', 'partner'], owner: 'Kaan', status: 'active' });
    // Without a code field the code is front matter the schema does not know.
    expect(parseRecord(ACME, newSchema('companies'), 'Companies/Acme Corp.md')).toMatchObject({ code: '', extra: { code: 'CUS-0012', founded: 2019 } });
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
    const bare = serializeRecord({ ...record, code: '', values: { name: 'Acme Corp', website: '', type: [] }, extra: {}, body: '' }, schema);
    expect(bare).toBe('---\nid: rec-1\nname: Acme Corp\n---\n');
  });

  it('takes a plain note as a record named after its file, but not a file named by an id', () => {
    const record = parseRecord('Just a note.\n', schema, 'Companies/Globex.md');
    expect(record).toMatchObject({ id: '', name: 'Globex', code: '', values: { name: 'Globex' }, body: 'Just a note.\n' });
    const unnamed = parseRecord('---\nid: k7f3m2qa01\n---\n', schema, 'Companies/k7f3m2qa01.md');
    expect(unnamed).toMatchObject({ name: '', code: '', values: {} });
    expect(recordTitle(unnamed)).toBe('Untitled');
    expect(recordTitle({ name: '', code: 'CUS-1' })).toBe('CUS-1');
    // Without a name field nothing is named after the file.
    expect(parseRecord('A line.\n', newSchema('blank'), 'Log/Monday.md')).toMatchObject({ name: '', values: {} });
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

  it('adds records as files named after their ids, and gives none a code', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, '', 'Payments', 'payments');
    const collection = await loadCollection(fs, dir);
    const first = await addRecord(fs, collection, { values: { name: 'Hosting / October', amount: 120, currency: '' } }, 'a1b2c3d4e5');
    expect(first).toMatchObject({ id: 'a1b2c3d4e5', path: 'Payments/a1b2c3d4e5.md', name: 'Hosting / October', code: '', values: { name: 'Hosting / October', amount: 120 } });
    expect(await fs.readText(first.path)).toBe('---\nid: a1b2c3d4e5\nname: Hosting / October\namount: 120\n---\n');
    // An id whose file is there already: the record gets another.
    const second = await addRecord(fs, collection, { values: { name: 'Hosting / October' } }, 'a1b2c3d4e5');
    expect(second.id).not.toBe('a1b2c3d4e5');
    expect(second.path).toBe(`Payments/${second.id}.md`);
    expect(newRecordId()).toMatch(/^[0-9a-z]{10}$/);
    expect((await loadCollection(fs, dir)).records.map((r) => [r.name, r.code])).toEqual([
      ['Hosting / October', ''],
      ['Hosting / October', ''],
    ]);
  });

  it('shows a record in the trash by its name, not by the id its file is named after', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, '', 'Companies', 'companies');
    const record = await addRecord(fs, await loadCollection(fs, dir), { values: { name: 'Globex' } }, 'globex0001');
    await trashItem(fs, record.path, new Date(2026, 9, 8, 22, 0, 0));
    expect((await readTrash(fs))[0]).toMatchObject({ kind: 'note', title: 'Globex', from: 'Companies/globex0001.md' });
  });

  it('changes a record where its file is, whatever its name becomes', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, '', 'Companies', 'companies');
    const collection = await loadCollection(fs, dir);
    const record = await addRecord(fs, collection, { values: { name: 'Acme', status: 'prospect', website: 'acme.example.com' } }, 'acme000001');
    const changed = await updateRecord(fs, collection.schema, record, { values: { name: 'Acme Corp', website: '', status: 'active' }, body: 'Met at the summit.' });
    expect(changed).toMatchObject({ path: 'Companies/acme000001.md', name: 'Acme Corp', values: { name: 'Acme Corp', status: 'active' }, body: 'Met at the summit.\n' });
    expect((await fs.list(dir)).map((e) => e.name).sort()).toEqual(['_collection.json', 'acme000001.md']);
    expect(parseRecord(await fs.readText(changed.path), collection.schema, changed.path)).toEqual(changed);
  });
});

describe('renaming and moving a collection', () => {
  it('renames the folder with every file in it, numbered when the name is taken', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, 'Scrawl', '', 'companies');
    await addRecord(fs, await loadCollection(fs, dir), { values: { name: 'Acme' } }, 'acme000001');
    await fs.mkdir('Scrawl/Taken');
    expect(await renameCollection(fs, dir, 'Taken')).toBe('Scrawl/Taken 2');
    expect((await fs.list('Scrawl')).map((e) => e.name).sort()).toEqual(['Taken', 'Taken 2']);
    expect((await fs.list('Scrawl/Taken 2')).map((e) => e.name).sort()).toEqual(['_collection.json', 'acme000001.md']);
    // Only the case of the name changed: it goes through a hidden name and keeps its files.
    expect(await renameCollection(fs, 'Scrawl/Taken 2', 'TAKEN 2')).toBe('Scrawl/TAKEN 2');
    expect((await fs.list('Scrawl')).map((e) => e.name).sort()).toEqual(['TAKEN 2', 'Taken']);
    expect((await loadCollection(fs, 'Scrawl/TAKEN 2')).records.map((r) => r.name)).toEqual(['Acme']);
    await expect(renameCollection(fs, 'Scrawl/TAKEN 2', ' / ')).rejects.toThrow();
  });

  it('moves the folder into another, and links follow it', async () => {
    const fs = new MemoryFs();
    const dir = await createCollection(fs, 'Scrawl', 'Companies', 'companies');
    expect(await moveCollection(fs, dir, 'Scrawl')).toBe(dir);
    const moved = await moveCollection(fs, dir, 'Work');
    expect(moved).toBe('Work/Companies');
    expect(await fs.list('Scrawl')).toEqual([]);
    expect((await loadCollection(fs, moved)).schema.template).toBe('companies');
    const people = newSchema('people', 'Scrawl');
    const withBlock = { ...people, layout: { columns: [{ sections: [{ items: [{ block: 'linked' as const, collection: 'Scrawl/Companies' }, { field: 'email' }] }] }] } };
    const next = retargetLinks(withBlock, 'Scrawl/Companies', moved);
    expect(next.fields.find((f) => f.key === 'company')?.collection).toBe('Work/Companies');
    expect(next.layout?.columns[0]?.sections[0]?.items[0]).toEqual({ block: 'linked', collection: 'Work/Companies' });
    expect(retargetLinks(people, 'Elsewhere/Companies', moved)).toBe(people);
  });
});

describe('looking at records', () => {
  const schema = withCode(newSchema('companies'));
  const make = (name: string, values: Record['values'], code = ''): Record => ({ id: name, path: `C/${name}.md`, name, code, values: { name, ...(code && { code }), ...values }, extra: {}, body: '' });
  const records = [make('Globex', { status: 'active', website: 'globex.example.com' }), make('Acme', { status: 'prospect' }, 'CUS-1'), make('Initech', {})];

  it('labels a record by its name and code', () => {
    expect(recordLabel(records[1]!)).toBe('Acme · CUS-1');
    expect(recordLabel(records[0]!)).toBe('Globex');
    expect(recordLabel({ name: '', code: 'CUS-1' })).toBe('CUS-1');
    expect(recordLabel({ name: '', code: '' })).toBe('Untitled');
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
    expect(missingFields({ name: ' ' }, strict)).toEqual(['name', 'status']);
    expect(missingFields({ name: 'Acme', status: 'active' }, strict)).toEqual([]);
    expect(missingFields({}, newSchema('blank'))).toEqual([]);
  });
});

describe('links and the other templates', () => {
  it('starts every template but Blank with a name, links pointing beside the collection', () => {
    const people = newSchema('people', 'Work');
    expect(people.fields.find((f) => f.key === 'company')).toEqual({ key: 'company', label: 'Company', type: 'link', collection: 'Work/Companies' });
    expect(newSchema('activities').fields.map((f) => f.key)).toEqual(['name', 'type', 'date', 'company', 'person', 'by']);
    const schema = parseSchema(serializeSchema(people));
    expect(schema).toEqual(people);
    expect(parseSchema(JSON.stringify({ version: 2, template: 'feedback', fields: [{ key: 'person', type: 'link', collection: '/Work/People/', many: true }] })).fields[0]).toEqual({
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

  it('tells a link whose record is gone', () => {
    const records = [{ id: 'c1', name: 'Acme Corp' }];
    expect(linkGone({ id: 'c1', name: 'Acme' }, records)).toBe(false);
    expect(linkGone({ id: 'c2', name: 'Globex' }, records)).toBe(true);
    expect(linkGone({ id: '', name: 'acme corp ' }, records)).toBe(false);
    expect(linkGone({ id: '', name: 'Globex' }, records)).toBe(true);
    // The collection it points into is not here: nothing is known of it.
    expect(linkGone({ id: 'c2', name: 'Globex' }, null)).toBe(false);
  });

  it('opens web addresses, mail addresses and phone numbers', () => {
    expect(fieldHref('url', 'acme.example.com')).toBe('https://acme.example.com');
    expect(fieldHref('url', ' https://acme.example.com/a?b=1 ')).toBe('https://acme.example.com/a?b=1');
    expect(fieldHref('url', 'javascript:alert(1)')).toBeNull();
    expect(fieldHref('url', 'not a site')).toBeNull();
    expect(fieldHref('email', 'lena@acme.example.com')).toBe('mailto:lena@acme.example.com');
    expect(fieldHref('email', 'lena')).toBeNull();
    expect(fieldHref('phone', '+49 (30) 123-45')).toBe('tel:+493012345');
    expect(fieldHref('phone', '-')).toBeNull();
    expect(fieldHref('text', 'acme.example.com')).toBeNull();
  });

  it('finds the records that link to a record, and fills a new one in from it', () => {
    const people = newSchema('people', 'Work');
    const activities = newSchema('activities', 'Work');
    const make = (name: string, values: Record['values'], path = `Work/X/${name}.md`): Record => ({ id: name, path, name, code: '', values, extra: {}, body: '' });
    const lena = make('Lena', { company: { id: 'acme', name: 'Acme Corp' } });
    const log: Collection = {
      dir: 'Work/Activities',
      schema: activities,
      records: [
        make('Pilot call', { person: { id: 'Lena', name: 'Lena' }, company: { id: 'acme', name: 'Acme Corp' } }),
        make('Demo', { company: { id: 'acme', name: 'Acme Corp' } }),
        make('Summit', { person: { id: '', name: 'lena' } }),
        make('Other', { person: { id: 'jonas', name: 'Jonas' } }),
      ],
    };
    expect(linkFieldsTo(activities, 'Work/People').map((f) => f.key)).toEqual(['person']);
    expect(linkedRecords(log, 'Work/People', lena).map((r) => r.name)).toEqual(['Pilot call', 'Summit']);
    expect(linkedRecords(log, 'Work/Companies', { id: 'acme', name: 'Acme Corp' }).map((r) => r.name)).toEqual(['Pilot call', 'Demo']);
    expect(linkedRecords(log, 'Work/Payments', lena)).toEqual([]);
    expect(linkingCollections([log, { dir: 'Work/People', schema: people, records: [] }], 'Work/Companies').map((c) => c.dir)).toEqual(['Work/Activities', 'Work/People']);
    // An activity added to Lena is hers, and her company's.
    expect(linkedValues(activities, 'Work/People', lena, people)).toEqual({ person: { id: 'Lena', name: 'Lena' }, company: { id: 'acme', name: 'Acme Corp' } });
    expect(linkedValues(activities, 'Work/Companies', make('Acme Corp', {}), newSchema('companies', 'Work'))).toEqual({ company: { id: 'Acme Corp', name: 'Acme Corp' } });
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
      { key: 'name', label: 'Name', type: 'name' as const },
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
  const make = (name: string, values: Record['values']): Record => ({ id: name, path: `C/${name}.md`, name, code: '', values: { name, ...values }, extra: {}, body: '' });
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
    // A condition still waiting for its value asks nothing.
    expect(names([{ field: 'name', op: 'contains' }, { field: 'status', op: 'is', value: [] }, { field: 'qty', op: 'gt', value: '' }])).toHaveLength(3);
    expect(isComplete({ field: 'name', op: 'contains', value: '  ' })).toBe(false);
    expect(isComplete({ field: 'qty', op: 'gt', value: 0 })).toBe(true);
    expect(isComplete({ field: 'qty', op: 'empty' })).toBe(true);
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
    const view: View = {
      id: 'v1',
      name: 'Berlin, active',
      conditions: [{ field: 'tags', op: 'is', value: ['berlin'] }, { field: 'status', op: 'is', value: 'active' }],
      sort: { key: 'total', dir: 'desc' },
      group: 'status',
      columns: ['name', 'total'],
      widths: { name: 260, total: 120 },
    };
    const withView = putView(schema, view);
    const read = parseSchema(serializeSchema(withView));
    expect(read.views).toEqual([view]);
    expect(read.fields.find((f) => f.key === 'total')).toEqual({ key: 'total', label: 'Total', type: 'formula', formula: 'qty * unit_price' });
    expect(putView(withView, { ...view, name: 'Renamed' }).views).toHaveLength(1);
    expect(removeView(withView, 'v1').views).toBeUndefined();
    // A view with a condition on a field that is gone keeps its other conditions.
    const broken = parseSchema(JSON.stringify({ fields: schema.fields, views: [{ id: 'v2', name: 'x', conditions: [{ field: 'gone', op: 'is', value: 'a' }, { field: 'status', op: 'is', value: 'active' }] }] }));
    expect(broken.views?.[0]?.conditions).toEqual([{ field: 'status', op: 'is', value: 'active' }]);
    expect(readWidths({ name: 240.4, total: 'wide', gone: 90, qty: -4 }, new Set(['name', 'total', 'qty']))).toEqual({ name: 240 });
    expect(readWidths({ qty: 0 })).toBeUndefined();
  });

  it('colors choices as the schema says, and leaves the rest to their text', () => {
    const companies = newSchema('companies');
    const status = companies.fields.find((f) => f.key === 'status');
    expect(optionColor(status, 'active')).toBe('green');
    expect(optionColor(status, 'churned')).toBe('red');
    expect(optionColor(companies.fields.find((f) => f.key === 'tags'), 'design')).toBeUndefined();
    expect(parseSchema(serializeSchema(companies))).toEqual(companies);
    const read = parseSchema(JSON.stringify({ version: 2, fields: [{ key: 'stage', type: 'select', options: ['a', 'b'], colors: { a: 'green', b: 'magenta' } }, { key: 'note', type: 'text', colors: { a: 'red' } }] }));
    expect(read.fields[0]).toEqual({ key: 'stage', label: 'stage', type: 'select', options: ['a', 'b'], colors: { a: 'green' } });
    expect(read.fields[1]).toEqual({ key: 'note', label: 'note', type: 'text' });
  });
});
