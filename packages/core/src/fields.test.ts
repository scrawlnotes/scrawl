import { describe, expect, it } from 'vitest';
import { newSchema, parseSchema, type Record, type Schema, serializeSchema } from './collection';
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
    expect(moved.fields.map((f) => f.key)).toEqual(['name', 'segment', 'type', 'owner', 'status', 'tags', 'website']);
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
});
