import { describe, expect, it } from 'vitest';
import { missingFields, newSchema, parseSchema, type Record, recordProblems, type Schema, serializeSchema, shownOnForm } from './collection';
import { defaultLayout, keyFor, renameChoices, settleSchema } from './fields';

describe('the Fields window', () => {
  it('makes a key for a new field from its name', () => {
    expect(keyFor('Next step', new Set())).toBe('next_step');
    expect(keyFor('Status', new Set(['status']))).toBe('status_2');
    expect(keyFor('Status', new Set(['status', 'status_2']))).toBe('status_3');
    expect(keyFor('', new Set())).toBe('field');
    expect(keyFor('ID', new Set())).toBe('id_2');
  });

  it('renames choices in the values that have them', () => {
    const values: Record['values'] = { status: 'churned', tags: ['old', 'berlin', 'new'], name: 'Acme' };
    const renamed = renameChoices(values, { status: { churned: 'lost' }, tags: { old: 'new' } });
    expect(renamed).toEqual({ status: 'lost', tags: ['new', 'berlin'], name: 'Acme' });
    expect(values.status).toBe('churned');
    expect(renameChoices(values, { status: { active: 'won' } })).toBe(values);
  });

  it('orders the fields as the screen reads them and leaves out a layout that is the default', () => {
    const schema = newSchema('companies');
    const layout = schema.layout!;
    // Website moved to the end of the first column.
    const items = layout.columns[0]!.sections[0]!.items.filter((i) => !('field' in i && i.field === 'website'));
    items.splice(items.length - 1, 0, { field: 'website' });
    const moved = settleSchema({ ...schema, layout: { columns: [{ ...layout.columns[0]!, sections: [{ items }] }, layout.columns[1]!] } });
    expect(moved.fields.map((f) => f.key)).toEqual(['name', 'segment', 'type', 'owner', 'status', 'tags', 'last_contact', 'website']);
    expect(moved.layout?.columns[0]?.width).toBeUndefined();
    expect(moved.layout?.columns[1]?.width).toBe(2);

    const blank: Schema = { ...newSchema('blank'), fields: [{ key: 'name', label: 'Name', type: 'name' }] };
    expect(settleSchema({ ...blank, layout: defaultLayout(blank.fields) }).layout).toBeUndefined();
    const linked = [{ block: 'linked' as const, collection: 'Activities' }];
    expect(settleSchema({ ...blank, layout: defaultLayout(blank.fields, linked) }, linked).layout).toBeUndefined();
    expect(settleSchema({ ...blank, layout: defaultLayout(blank.fields, linked) }).layout?.columns[0]?.sections).toHaveLength(3);
  });

  it('drops empty sections and columns, keeps the fields left unplaced, and renames choices in views', () => {
    const schema: Schema = {
      ...newSchema('blank'),
      fields: [
        { key: 'name', label: 'Name', type: 'name' },
        { key: 'status', label: 'Status', type: 'select', options: ['lost'] },
        { key: 'notes', label: 'Notes', type: 'text' },
      ],
      views: [{ id: 'v', name: 'Lost', conditions: [{ field: 'status', op: 'is', value: ['churned'] }] }],
      layout: {
        columns: [
          { width: 1, sections: [{ items: [] }, { items: [{ field: 'status' }, { field: 'name' }] }] },
          { width: 2, sections: [{ items: [] }] },
        ],
      },
    };
    const settled = settleSchema(schema, [], { status: { churned: 'lost' } });
    expect(settled.layout).toEqual({ columns: [{ sections: [{ items: [{ field: 'status' }, { field: 'name' }] }] }] });
    expect(settled.fields.map((f) => f.key)).toEqual(['status', 'name', 'notes']);
    expect(settled.views?.[0]?.conditions[0]?.value).toEqual(['lost']);
    // What it writes reads back as it is.
    expect(parseSchema(serializeSchema(settled))).toEqual(settled);
  });

  it('keeps a text that suggests what was written; on another type it is nothing', () => {
    const schema = parseSchema(JSON.stringify({ version: 2, fields: [{ key: 'doctor', label: 'Doctor', type: 'text', suggest: true }, { key: 'box', label: 'Box', type: 'number', suggest: true }] }));
    expect(schema.fields.map((f) => f.suggest)).toEqual([true, undefined]);
    expect(parseSchema(serializeSchema(schema)).fields[0]!.suggest).toBe(true);
  });

  it('shows a field on the form only when its conditions hold, its value kept (design/shown-when.md)', () => {
    const text = JSON.stringify({
      version: 2,
      fields: [
        { key: 'name', label: 'Name', type: 'name' },
        { key: 'type', label: 'Type', type: 'select', options: ['Passport', 'Warranty'] },
        { key: 'store', label: 'Store', type: 'text', required: true, when: [{ field: 'type', op: 'is', value: ['Warranty'] }] },
        { key: 'paid', label: 'Paid', type: 'checkbox' },
        { key: 'amount', label: 'Amount', type: 'number', when: [{ field: 'paid', op: 'true' }, { field: 'type', op: 'is', value: ['Warranty'] }, { op: 'nope' }] },
        { key: 'own', label: 'Own', type: 'text', when: [{ field: 'own', op: 'empty' }, { field: 'gone', op: 'not-empty' }] },
      ],
    });
    const schema = parseSchema(text);
    const field = (key: string) => schema.fields.find((f) => f.key === key)!;
    // A broken condition is left out; one on the field itself too; one on a field gone is kept, and holds.
    expect(field('amount').when).toEqual([{ field: 'paid', op: 'true' }, { field: 'type', op: 'is', value: ['Warranty'] }]);
    expect(field('own').when).toEqual([{ field: 'gone', op: 'not-empty' }]);
    const warranty = { values: { name: 'TV', type: 'Warranty' } };
    const passport = { values: { name: 'Passport', type: 'Passport', store: 'Teknosa' } };
    expect(shownOnForm(field('store'), warranty, schema)).toBe(true);
    expect(shownOnForm(field('store'), passport, schema)).toBe(false);
    expect(shownOnForm(field('amount'), warranty, schema)).toBe(false);
    expect(shownOnForm(field('amount'), { values: { ...warranty.values, paid: true } }, schema)).toBe(true);
    expect(shownOnForm(field('own'), passport, schema)).toBe(true);
    // A required field not shown is not asked for; shown, it is.
    expect(missingFields(passport.values, schema)).toEqual([]);
    expect(missingFields(warranty.values, schema)).toEqual(['store']);
    expect(recordProblems({ values: { name: 'Passport', type: 'Passport' }, extra: {} }, schema)).toEqual([]);
    // Written back as it was read.
    expect(parseSchema(serializeSchema(schema))).toEqual(schema);
    // Settled: a condition on a field gone goes with it, one on a choice renamed follows it.
    const settled = settleSchema(
      { ...schema, fields: schema.fields.filter((f) => f.key !== 'paid').map((f) => (f.key === 'type' ? { ...f, options: ['Passport', 'Guarantee'] } : f)) },
      [],
      { type: { Warranty: 'Guarantee' } },
    );
    expect(settled.fields.find((f) => f.key === 'store')!.when).toEqual([{ field: 'type', op: 'is', value: ['Guarantee'] }]);
    expect(settled.fields.find((f) => f.key === 'amount')!.when).toEqual([{ field: 'type', op: 'is', value: ['Guarantee'] }]);
    expect(settled.fields.find((f) => f.key === 'own')!.when).toBeUndefined();
  });

  it('keeps a linked table whose groups are alternatives, and the tick that sets a row apart (design/meal-plans.md)', () => {
    const items = (block: object) => parseSchema(JSON.stringify({ version: 2, fields: [{ key: 'name', label: 'Name', type: 'name' }], layout: { columns: [{ items: [block] }] } })).layout!.columns[0]!.sections[0]!.items;
    expect(items({ block: 'linked', collection: 'Day items', group: ['meal'], choose: true, apart: 'off_plan' })).toEqual([{ block: 'linked', collection: 'Day items', group: ['meal'], choose: true, apart: 'off_plan' }]);
    // Apart only with choose.
    expect(items({ block: 'linked', collection: 'Day items', apart: 'off_plan' })).toEqual([{ block: 'linked', collection: 'Day items' }]);
  });
});
