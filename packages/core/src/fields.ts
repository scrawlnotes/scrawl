import {
  cleanFieldKey,
  type Field,
  type FieldValue,
  type Layout,
  type LayoutBlock,
  type LayoutItem,
  parseSchema,
  type Record,
  type Schema,
  serializeSchema,
  SUBTASKS_KEY,
} from './collection';

// What the Fields window needs to change a collection's schema: keys for new fields, choices
// renamed in the records that have them, and the schema as it is written, its fields in the order
// the record screen reads them. See the Fields views of design/mockups.html and PLAN.md 4.6.

/**
 * A key for a new field from its label: lower case, words joined by underscores, numbered when
 * taken; `field` for a label with no letters or digits. `id` and `subtasks` are the record's own and never a field's.
 */
export function keyFor(label: string, taken: ReadonlySet<string>): string {
  const base = cleanFieldKey(label) || 'field';
  let key = base;
  for (let n = 2; taken.has(key) || key === 'id' || key === SUBTASKS_KEY; n++) key = `${base}_${n}`;
  return key;
}

/** Choices renamed in the Fields window, by field key: each old name with its new one. */
export interface ChoiceRenames {
  [field: string]: { [from: string]: string };
}

/** A value with its choices renamed; the same value when none of them is. */
function renamed(value: FieldValue | undefined, names: { [from: string]: string }): FieldValue | undefined {
  if (typeof value === 'string') return names[value] ?? value;
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return value;
  const next = [...new Set((value as string[]).map((v) => names[v] ?? v))];
  return next.length === value.length && next.every((v, i) => v === value[i]) ? value : next;
}

/** A record's values with renamed choices; the same values when none of them changes. */
export function renameChoices(values: Record['values'], renames: ChoiceRenames): Record['values'] {
  let out = values;
  for (const [key, names] of Object.entries(renames)) {
    const next = renamed(values[key], names);
    if (next !== values[key] && next !== undefined) out = { ...out, [key]: next };
  }
  return out;
}

/** The views of a schema with renamed choices in their conditions. */
export function renameInViews(schema: Schema, renames: ChoiceRenames): Schema {
  if (!schema.views) return schema;
  const views = schema.views.map((view) => ({
    ...view,
    conditions: view.conditions.map((condition) => {
      const names = renames[condition.field];
      if (!names || condition.value === undefined || typeof condition.value === 'number') return condition;
      return { ...condition, value: renamed(condition.value, names) as string | string[] };
    }),
  }));
  return { ...schema, views };
}

/** The keys of the fields a layout places, in the order the screen reads them: column by column, top to bottom. */
function readingOrder(layout: Layout): string[] {
  return layout.columns.flatMap((column) => column.sections.flatMap((section) => section.items.flatMap((item) => ('field' in item ? [item.field] : []))));
}

/** The record screen a schema without a layout opens with: every field, the body, then what links to the collection (`linked`). */
export function defaultLayout(fields: Field[], linked: LayoutBlock[] = []): Layout {
  const sections = [{ items: fields.map((f): LayoutItem => ({ field: f.key })) }, { items: [{ block: 'body' } as LayoutItem] }];
  return { columns: [{ sections: linked.length > 0 ? [...sections, { items: linked }] : sections }] };
}

/** A layout as it is kept: no section with nothing in it and no title, no column with no section, widths of 1 left unsaid. */
function settleLayout(layout: Layout): Layout {
  const columns = layout.columns
    .map((column) => ({
      ...(column.width && column.width !== 1 && { width: column.width }),
      sections: column.sections.filter((s) => s.items.length > 0 || s.title).map((s) => ({ ...(s.title?.trim() && { title: s.title.trim() }), items: s.items })),
    }))
    .filter((column) => column.sections.length > 0);
  return { columns };
}

/**
 * A schema from the Fields window as it is written: its fields in the order the record screen reads
 * them, the ones it does not place after them; its layout left out when it is the screen a schema
 * without one opens with (`linked`, the blocks that one shows); choices renamed in its views; and
 * read back, so that what the file can hold is all it holds.
 */
export function settleSchema(schema: Schema, linked: LayoutBlock[] = [], renames: ChoiceRenames = {}): Schema {
  const layout = settleLayout(schema.layout ?? defaultLayout(schema.fields, linked));
  const order = readingOrder(layout);
  const rank = (f: Field) => (order.includes(f.key) ? order.indexOf(f.key) : order.length);
  const fields = schema.fields.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }) => f);
  const same = JSON.stringify(layout) === JSON.stringify(settleLayout(defaultLayout(fields, linked)));
  const { layout: _layout, ...rest } = renameInViews(schema, renames);
  return parseSchema(serializeSchema({ ...rest, fields, ...(!same && { layout }) }));
}
