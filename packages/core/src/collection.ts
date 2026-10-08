import { t } from '@scrawlnotes/i18n';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { basename, type Entry, join, type VaultFs } from './fs';
import { freePath, moveTree } from './paths';

// A collection is a folder with a schema file in it, `_collection.json`, and one Markdown file
// per record, named after the record's id: the record's fields in YAML front matter, free text
// under it. A record is a note, so everything made for notes (the editor, history, the trash,
// line merging in sync) works on it. A record's name and code are fields of their own types,
// one of each at most; what shows of a record elsewhere, in a link, comes from them. The schema
// also holds the layout of the record screen: columns of sections of elements, which a template
// brings and the Fields window changes. See the Collection views of design/mockups.html and
// PLAN.md 4.6.

export const COLLECTION_FILE = '_collection.json';
export const RECORD_EXT = '.md';

export type FieldType = 'name' | 'code' | 'text' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox' | 'url' | 'email' | 'phone' | 'person' | 'link' | 'formula' | 'rollup';

export const FIELD_TYPES: readonly FieldType[] = ['name', 'code', 'text', 'number', 'date', 'select', 'multi-select', 'checkbox', 'url', 'email', 'phone', 'person', 'link', 'formula', 'rollup'];

/** What a rollup does with what links to the record: counts it, adds it up, or takes its most or least. */
export type RollupFn = 'count' | 'sum' | 'max' | 'min';

export const ROLLUP_FNS: readonly RollupFn[] = ['count', 'sum', 'max', 'min'];

/**
 * A value worked out from what links to the record: the records of a collection or the cards of
 * a board (`from`, its path), counted, or a field of theirs added up or taken at its most or
 * least: a company's last contact, the latest day of its activities. Shown, never written.
 */
export interface Rollup {
  from: string;
  fn: RollupFn;
  /** The field of those records or cards; none to count them. */
  field?: string;
  /** For a board: its open cards only. */
  open?: boolean;
}

/** The types a schema has one field of at most: the record's name, and its code. */
export const SINGLE_TYPES: readonly FieldType[] = ['name', 'code'];

/** The colors a choice can be shown in, by name, so that a person or an agent writes them as words. */
export const OPTION_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;

export type OptionColor = (typeof OPTION_COLORS)[number];

export interface Field {
  /** The key in the front matter: letters, digits and underscores. */
  key: string;
  label: string;
  type: FieldType;
  /** The choices of a select or a multi-select. */
  options?: string[];
  /** The color of each choice that has one, by the choice; the others are colored by their text. */
  colors?: { [option: string]: OptionColor };
  required?: boolean;
  /** A link's target: the path of the collection its records come from. */
  collection?: string;
  /** A link that holds several records. */
  many?: boolean;
  /** A formula's expression over the record's own fields: `qty * unit_price`, `today() - last_contact`. Not written to the file. */
  formula?: string;
  /** A rollup's source and what it does. Not written to the record's file. */
  rollup?: Rollup;
}

/**
 * A link to a record of another collection, as a file holds it: the record's id, which is what
 * the link is, and its name and code as they were when the link was made, so that the name shows
 * without the other file being read, and still shows when that file is gone.
 */
export interface Link {
  id: string;
  name: string;
  code?: string;
}

export const isLink = (value: unknown): value is Link => isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';

/** A record as a link to it. */
export const linkTo = (record: Pick<Record, 'id' | 'name' | 'code'>): Link => ({ id: record.id, name: record.name, ...(record.code && { code: record.code }) });

/** The key the templates give their name field. */
export const NAME_KEY = 'name';

/**
 * An element of the record screen: a field, the body, the records of another collection that
 * link here, or cards and tasks. Linked records are a list or a timeline, sorted by a field (a
 * timeline by its day, newest first), a list's rows showing the fields named.
 */
export type LayoutItem =
  | { field: string }
  | { block: 'body' }
  | { block: 'linked'; collection: string; sort?: string; style?: 'list' | 'timeline'; fields?: string[] }
  | { block: 'cards' };

export type LinkedBlock = Extract<LayoutItem, { block: 'linked' }>;

export interface LayoutSection {
  title?: string;
  items: LayoutItem[];
}

export interface LayoutColumn {
  /** Its share of the width against the other columns; 1 when unset. */
  width?: number;
  sections: LayoutSection[];
}

export interface Layout {
  columns: LayoutColumn[];
}

export type CollectionTemplate = 'companies' | 'people' | 'activities' | 'feedback' | 'payments' | 'blank';

export const COLLECTION_TEMPLATES: readonly CollectionTemplate[] = ['companies', 'people', 'activities', 'feedback', 'payments', 'blank'];

/** How records are sorted in the table: by a field key, up or down. */
export interface RecordSort {
  key: string;
  dir: 'asc' | 'desc';
}

/** What a condition of a view asks of a field. */
export type ConditionOp = 'contains' | 'is' | 'is-not' | 'empty' | 'not-empty' | 'gt' | 'lt' | 'before' | 'after' | 'on' | 'true' | 'false';

export const CONDITION_OPS: readonly ConditionOp[] = ['contains', 'is', 'is-not', 'empty', 'not-empty', 'gt', 'lt', 'before', 'after', 'on', 'true', 'false'];

export interface Condition {
  field: string;
  op: ConditionOp;
  /** What is compared with: text, a number, a day, or the choices any of which matches. */
  value?: string | number | string[];
}

/** A saved way of looking at the table: which records, in what order, grouped how, with which columns. */
export interface View {
  id: string;
  name: string;
  conditions: Condition[];
  sort?: RecordSort;
  /** The field grouped by; null or unset for none. */
  group?: string | null;
  /** The fields shown as columns, in order; unset for every field. */
  columns?: string[];
  /** The columns' widths in pixels, by field key, once one was dragged; unset for widths that fit the window. */
  widths?: ColumnWidths;
}

/** Column widths in pixels, by field key. */
export interface ColumnWidths {
  [key: string]: number;
}

/** Reads column widths as a file wrote them: whole pixels, by known field keys. */
export function readWidths(raw: unknown, keys?: ReadonlySet<string>): ColumnWidths | undefined {
  if (!isRecord(raw)) return undefined;
  const widths: ColumnWidths = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (keys && !keys.has(key))) continue;
    widths[key] = Math.round(value);
  }
  return Object.keys(widths).length > 0 ? widths : undefined;
}

export interface Schema {
  /** 2 since a record's name and code are fields of their own types; a file of version 1 is read as one of 2. */
  version: 2;
  template: CollectionTemplate;
  /** What one record is called, `company` for Companies: "New company", "Add company". Unset says "record". */
  singular?: string;
  /** The saved views, in the order they were made. */
  views?: View[];
  /** The fields; their order is the order of the table's columns. */
  fields: Field[];
  /** The record screen; unset means one column of every field, then the body. */
  layout?: Layout;
}

/** A field's value as it is held: text, a number, a day, a choice, choices, a flag, a link or links, or nothing. */
export type FieldValue = string | number | boolean | string[] | Link | Link[] | null;

export interface Record {
  /** Stable, from the front matter; links from elsewhere use it, and a new record's file is named after it. */
  id: string;
  /** The record's file. */
  path: string;
  /** The value of the schema's name field, empty without one; kept beside the values for what shows the record elsewhere. */
  name: string;
  /** The value of the schema's code field, empty without one. */
  code: string;
  /** By field key; a field the file does not have is absent. */
  values: { [key: string]: FieldValue };
  /** Front matter the schema knows nothing about, kept as it was. */
  extra: { [key: string]: unknown };
  body: string;
}

/** What a collection is called: its folder's name. */
export const collectionName = (dir: string) => basename(dir);

/** The collection a record's file is in. */
export const collectionOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** Whether a folder's entries make it a collection. */
export const isCollection = (entries: Entry[]) => entries.some((e) => e.kind === 'file' && e.name === COLLECTION_FILE);

/** The schema file of a collection. */
export const schemaPath = (dir: string) => join(dir, COLLECTION_FILE);

/** The schema's name field, when it has one. */
export const nameField = (schema: Pick<Schema, 'fields'>): Field | undefined => schema.fields.find((f) => f.type === 'name');

/** The schema's code field, when it has one. */
export const codeField = (schema: Pick<Schema, 'fields'>): Field | undefined => schema.fields.find((f) => f.type === 'code');

/** Whether another collection can link to this one's records: they show by their name or their code, so it needs one of them. */
export const isLinkable = (schema: Pick<Schema, 'fields'>) => !!nameField(schema) || !!codeField(schema);

/** A key typed for a field, as a front matter key can be: lower case, words joined by underscores. */
export function cleanFieldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------- templates ----------

// The templates are the lists a startup keeps; a link in one points at the collection of that
// name beside it, made from its own template, whether it is there yet or not.
// Their choices come colored by what they mean: what goes well is green, what is lost red, what
// waits gray or blue.
const NAME: Field = { key: NAME_KEY, label: 'Name', type: 'name' };

/** A company's or a person's last contact: the latest day of the activities that link to it. */
const LAST_CONTACT: Field = { key: 'last_contact', label: 'Last contact', type: 'rollup', rollup: { from: 'Activities', fn: 'max', field: 'date' } };

const TEMPLATE_FIELDS: { [template in CollectionTemplate]: Field[] } = {
  companies: [
    NAME,
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'segment', label: 'Segment', type: 'select', options: ['SMB', 'Mid-market', 'Enterprise'], colors: { SMB: 'teal', 'Mid-market': 'blue', Enterprise: 'purple' } },
    {
      key: 'type',
      label: 'Type',
      type: 'multi-select',
      options: ['customer', 'supplier', 'partner', 'investor'],
      colors: { customer: 'green', supplier: 'orange', partner: 'purple', investor: 'blue' },
    },
    { key: 'owner', label: 'Owner', type: 'person' },
    { key: 'status', label: 'Status', type: 'select', options: ['prospect', 'active', 'churned'], colors: { prospect: 'blue', active: 'green', churned: 'red' } },
    { key: 'tags', label: 'Tags', type: 'multi-select', options: [] },
    LAST_CONTACT,
  ],
  people: [
    NAME,
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'title', label: 'Title', type: 'text' },
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      options: ['referral', 'event', 'inbound', 'outbound'],
      colors: { referral: 'purple', event: 'orange', inbound: 'green', outbound: 'blue' },
    },
    { key: 'status', label: 'Status', type: 'select', options: ['lead', 'active', 'inactive'], colors: { lead: 'blue', active: 'green', inactive: 'gray' } },
    { key: 'tags', label: 'Tags', type: 'multi-select', options: [] },
    LAST_CONTACT,
  ],
  activities: [
    NAME,
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: ['note', 'call', 'meeting', 'email'],
      colors: { note: 'gray', call: 'blue', meeting: 'purple', email: 'yellow' },
      required: true,
    },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'by', label: 'By', type: 'person' },
  ],
  feedback: [
    NAME,
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      options: ['email', 'call', 'interview', 'social', 'support'],
      colors: { email: 'yellow', call: 'blue', interview: 'purple', social: 'pink', support: 'orange' },
    },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'area', label: 'Area', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['new', 'planned', 'done', 'declined'], colors: { new: 'blue', planned: 'yellow', done: 'green', declined: 'gray' } },
  ],
  payments: [
    NAME,
    { key: 'direction', label: 'Direction', type: 'select', options: ['incoming', 'outgoing'], colors: { incoming: 'green', outgoing: 'red' }, required: true },
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'TRY', 'GBP'], colors: { USD: 'gray', EUR: 'gray', TRY: 'gray', GBP: 'gray' } },
    { key: 'due', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['planned', 'invoiced', 'paid'], colors: { planned: 'gray', invoiced: 'yellow', paid: 'green' } },
    { key: 'invoice_no', label: 'Invoice no', type: 'text' },
    { key: 'paid_on', label: 'Paid on', type: 'date' },
  ],
  blank: [],
};

/** What one record of each template is called; Blank's are records. */
const TEMPLATE_SINGULAR: Partial<{ [template in CollectionTemplate]: string }> = {
  companies: 'company',
  people: 'person',
  activities: 'activity',
  feedback: 'feedback',
  payments: 'payment',
};

/** An element of the record screen other than a field: the body, linked records, cards. */
export type LayoutBlock = Exclude<LayoutItem, { field: string }>;

/**
 * What links to a record, on the right of the record screens the templates bring: a company's
 * activities as a timeline, its people as a list and the cards that link to it (its deals), a
 * person's activities and cards. The fields and the notes are on the left; the other templates
 * keep the default screen, one column.
 */
const TEMPLATE_LINKED: Partial<{ [template in CollectionTemplate]: LayoutBlock[] }> = {
  companies: [
    { block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' },
    { block: 'linked', collection: 'People', style: 'list', fields: ['title'] },
    { block: 'cards' },
  ],
  people: [{ block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' }, { block: 'cards' }],
};

/**
 * A fresh schema from a template. Links point at the collection of that name in `folder`, where
 * the collection is made, so that People made beside Companies find it.
 */
export function newSchema(template: CollectionTemplate, folder = ''): Schema {
  const fields = TEMPLATE_FIELDS[template].map((f) => ({
    ...f,
    ...(f.options && { options: [...f.options] }),
    ...(f.colors && { colors: { ...f.colors } }),
    ...(f.collection !== undefined && { collection: join(folder, f.collection) }),
    ...(f.rollup && { rollup: { ...f.rollup, from: join(folder, f.rollup.from) } }),
  }));
  const singular = TEMPLATE_SINGULAR[template];
  const linked = TEMPLATE_LINKED[template];
  const layout: Layout | undefined = linked && {
    columns: [
      { width: 1, sections: [{ items: [...fields.map((f) => ({ field: f.key })), { block: 'body' as const }] }] },
      { width: 2, sections: [{ items: linked.map((block) => (block.block === 'linked' ? { ...block, collection: join(folder, block.collection) } : block)) }] },
    ],
  };
  return { version: 2, template, ...(singular && { singular }), fields, ...(layout && { layout }) };
}

// ---------- schema file ----------

const isRecord = (value: unknown): value is { [key: string]: unknown } => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** The colors of a field's choices as the file has them; a color by another name is left out. */
function readColors(raw: unknown): Field['colors'] {
  if (!isRecord(raw)) return undefined;
  const colors: NonNullable<Field['colors']> = {};
  for (const [option, color] of Object.entries(raw)) if (OPTION_COLORS.includes(color as OptionColor)) colors[option] = color as OptionColor;
  return Object.keys(colors).length > 0 ? colors : undefined;
}

/** The color a choice of a field is given, if the schema gives it one. */
export const optionColor = (field: Pick<Field, 'colors'> | undefined, option: string): OptionColor | undefined => field?.colors?.[option];

function readField(raw: unknown): Field | null {
  if (!isRecord(raw) || typeof raw.key !== 'string') return null;
  const key = cleanFieldKey(raw.key);
  if (!key) return null;
  const type = FIELD_TYPES.includes(raw.type as FieldType) ? (raw.type as FieldType) : 'text';
  const field: Field = { key, label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : key, type };
  if (type === 'select' || type === 'multi-select') {
    field.options = strings(raw.options);
    const colors = readColors(raw.colors);
    if (colors) field.colors = colors;
  }
  if (type === 'link') {
    field.collection = typeof raw.collection === 'string' ? raw.collection.replace(/^\/+|\/+$/g, '') : '';
    if (raw.many === true) field.many = true;
  }
  if (type === 'formula') field.formula = typeof raw.formula === 'string' ? raw.formula : '';
  if (type === 'rollup') {
    const r = isRecord(raw.rollup) ? raw.rollup : {};
    const fn = ROLLUP_FNS.includes(r.fn as RollupFn) ? (r.fn as RollupFn) : 'count';
    const key = typeof r.field === 'string' ? cleanFieldKey(r.field) : '';
    field.rollup = {
      from: typeof r.from === 'string' ? r.from.replace(/^\/+|\/+$/g, '') : '',
      fn,
      ...(key && fn !== 'count' && { field: key }),
      ...(r.open === true && { open: true }),
    };
  }
  // A name is required by being the name; the others say so.
  if (raw.required === true && type !== 'name') field.required = true;
  return field;
}

function readItem(raw: unknown): LayoutItem | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.field === 'string') return { field: cleanFieldKey(raw.field) };
  if (raw.block === 'body' || raw.block === 'cards') return { block: raw.block };
  if (raw.block === 'linked' && typeof raw.collection === 'string') {
    const fields = strings(raw.fields).map(cleanFieldKey).filter(Boolean);
    return {
      block: 'linked',
      collection: raw.collection.replace(/^\/+|\/+$/g, ''),
      ...(typeof raw.sort === 'string' && { sort: cleanFieldKey(raw.sort) }),
      ...((raw.style === 'list' || raw.style === 'timeline') && { style: raw.style }),
      ...(fields.length > 0 && { fields }),
    };
  }
  return null;
}

function readLayout(raw: unknown): Layout | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.columns)) return undefined;
  const columns: LayoutColumn[] = [];
  for (const column of raw.columns) {
    if (!isRecord(column)) continue;
    const sections: LayoutSection[] = [];
    // A column may list its items directly: that is one section without a title.
    const rawSections = Array.isArray(column.sections) ? column.sections : Array.isArray(column.items) ? [{ items: column.items }] : [];
    for (const section of rawSections) {
      if (!isRecord(section)) continue;
      const items = (Array.isArray(section.items) ? section.items : []).map(readItem).filter((i): i is LayoutItem => i !== null);
      sections.push({ ...(typeof section.title === 'string' && section.title.trim() && { title: section.title }), items });
    }
    const width = typeof column.width === 'number' && column.width > 0 ? column.width : undefined;
    columns.push({ ...(width && { width }), sections });
  }
  return columns.length > 0 ? { columns } : undefined;
}

/**
 * The fields of a schema file of version 1, when every schema had a name and a code as text
 * fields: those two are the name and code fields, and a schema without a name field gets one, as
 * it had; a layout that left the name out, since the screen drew it apart, has it at its start.
 */
function fromVersion1(fields: Field[], layout: Layout | undefined): { fields: Field[]; layout: Layout | undefined } {
  const typed = fields.map((f): Field => {
    if (f.key === NAME_KEY && f.type === 'text') {
      const { required: _required, ...rest } = f;
      return { ...rest, type: 'name' };
    }
    return f.key === 'code' && f.type === 'text' ? { ...f, type: 'code' } : f;
  });
  const named = nameField({ fields: typed }) ? typed : [{ ...NAME }, ...typed];
  const name = nameField({ fields: named })!;
  const placed = layout?.columns.some((c) => c.sections.some((s) => s.items.some((i) => 'field' in i && i.field === name.key)));
  if (!layout || placed) return { fields: named, layout };
  const [first, ...rest] = layout.columns;
  const [section, ...others] = first!.sections.length > 0 ? first!.sections : [{ items: [] }];
  return { fields: named, layout: { columns: [{ ...first!, sections: [{ ...section!, items: [{ field: name.key }, ...section!.items] }, ...others] }, ...rest] } };
}

/**
 * The fields a file lists: a key seen before is left out, a second name or code field reads as
 * text, as there is one of each at most. With `plain`, for a board, whose cards have a title and
 * a key of their own, a name or code field reads as text too.
 */
export function readFields(raw: unknown, plain = false): Field[] {
  const read = (Array.isArray(raw) ? raw : []).map(readField).filter((f): f is Field => f !== null);
  const seen = new Set<string>();
  const single = new Set<FieldType>();
  const fields: Field[] = [];
  for (const field of read) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    if (SINGLE_TYPES.includes(field.type) && (plain || single.has(field.type))) fields.push({ ...field, type: 'text' });
    else {
      single.add(field.type);
      fields.push(field);
    }
  }
  return fields;
}

/**
 * Reads a schema file. A field of an unknown type reads as text; a second name or code field
 * reads as text, as there is one of each at most; a broken file reads as a blank schema, so the
 * records can still be opened. A file of version 1 is read as one of version 2.
 */
export function parseSchema(text: string): Schema {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  const data = isRecord(raw) ? raw : {};
  let fields = readFields(data.fields);
  let layout = readLayout(data.layout);
  if (data.version !== 2) ({ fields, layout } = fromVersion1(fields, layout));
  const template: CollectionTemplate = COLLECTION_TEMPLATES.includes(data.template as CollectionTemplate) ? (data.template as CollectionTemplate) : 'blank';
  const schema: Schema = { version: 2, template, ...(typeof data.singular === 'string' && data.singular.trim() && { singular: data.singular.trim() }), fields };
  if (layout) schema.layout = layout;
  const views = readViews(data.views, fields);
  if (views.length > 0) schema.views = views;
  return schema;
}

const isSort = (raw: unknown): raw is RecordSort => isRecord(raw) && typeof raw.key === 'string' && (raw.dir === 'asc' || raw.dir === 'desc');

/** A condition as a file has it; null when it is not one, or names a field `fields` does not have (any field without `fields`). */
export function readCondition(raw: unknown, fields?: Field[]): Condition | null {
  if (!isRecord(raw) || typeof raw.field !== 'string' || !CONDITION_OPS.includes(raw.op as ConditionOp)) return null;
  const key = cleanFieldKey(raw.field);
  if (!key || (fields && !fields.some((f) => f.key === key))) return null;
  const value = typeof raw.value === 'string' || typeof raw.value === 'number' ? raw.value : Array.isArray(raw.value) ? strings(raw.value) : undefined;
  return { field: key, op: raw.op as ConditionOp, ...(value !== undefined && { value }) };
}

/** The views of a schema file; a view with a broken condition keeps the rest of them. */
function readViews(raw: unknown, fields: Field[]): View[] {
  if (!Array.isArray(raw)) return [];
  const views: View[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.id || !item.name.trim()) continue;
    const conditions = (Array.isArray(item.conditions) ? item.conditions : []).map((c) => readCondition(c, fields)).filter((c): c is Condition => c !== null);
    const view: View = { id: item.id, name: item.name, conditions };
    if (isSort(item.sort)) view.sort = { key: item.sort.key, dir: item.sort.dir };
    if (typeof item.group === 'string' && item.group) view.group = cleanFieldKey(item.group);
    if (Array.isArray(item.columns)) view.columns = strings(item.columns).map(cleanFieldKey).filter((k) => fields.some((f) => f.key === k));
    const widths = readWidths(item.widths, new Set(fields.map((f) => f.key)));
    if (widths) view.widths = widths;
    views.push(view);
  }
  return views;
}

/** Adds a view at the end, or replaces the one of the same id. */
export function putView(schema: Schema, view: View): Schema {
  const views = schema.views ?? [];
  const at = views.findIndex((v) => v.id === view.id);
  return { ...schema, views: at < 0 ? [...views, view] : views.map((v, i) => (i === at ? view : v)) };
}

export function removeView(schema: Schema, id: string): Schema {
  const views = (schema.views ?? []).filter((v) => v.id !== id);
  const { views: _old, ...rest } = schema;
  return views.length > 0 ? { ...rest, views } : rest;
}

export function serializeSchema(schema: Schema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

export async function loadSchema(fs: VaultFs, dir: string): Promise<Schema> {
  return parseSchema(await fs.readText(schemaPath(dir)));
}

export function saveSchema(fs: VaultFs, dir: string, schema: Schema): Promise<void> {
  return fs.writeText(schemaPath(dir), serializeSchema(schema));
}

/** The layout a schema shows with: its own, or one column of every field, then the body. */
export function layoutOf(schema: Schema): Layout {
  if (schema.layout) return schema.layout;
  const items: LayoutItem[] = schema.fields.map((f) => ({ field: f.key }));
  return { columns: [{ sections: [{ items }, { items: [{ block: 'body' }] }] }] };
}

/** The fields the layout does not place, which the screen shows at its end so that none is lost. */
export function unplacedFields(schema: Schema): Field[] {
  const placed = new Set<string>();
  for (const column of layoutOf(schema).columns) for (const section of column.sections) for (const item of section.items) if ('field' in item) placed.add(item.field);
  return schema.fields.filter((f) => !placed.has(f.key));
}

// ---------- values ----------

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A link as a file wrote it: a map with an id; a bare string is taken as a name with no id, so that a hand-written link still shows. */
function readLink(raw: unknown): Link | null {
  if (isLink(raw)) return { id: raw.id, name: raw.name, ...(typeof raw.code === 'string' && raw.code && { code: raw.code }) };
  if (typeof raw === 'string' && raw.trim()) return { id: '', name: raw.trim() };
  return null;
}

/** A front matter value as a field of `type` holds it; null when it does not fit. A link field that holds `many` reads as a list. */
export function readValue(type: FieldType, raw: unknown, many = false): FieldValue {
  if (raw === null || raw === undefined) return null;
  switch (type) {
    case 'link': {
      const links = (Array.isArray(raw) ? raw : [raw]).map(readLink).filter((l): l is Link => l !== null);
      if (links.length === 0) return null;
      return many ? links : links[0]!;
    }
    case 'number': {
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      const n = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    case 'checkbox':
      return typeof raw === 'boolean' ? raw : raw === 'true' ? true : raw === 'false' ? false : null;
    case 'multi-select':
      return Array.isArray(raw) ? raw.map(String).filter((s) => s.trim()) : typeof raw === 'string' && raw.trim() ? [raw] : null;
    case 'date': {
      // `yaml` reads a day as text; another tool may have written a time with it.
      const text = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim().slice(0, 10);
      return DAY.test(text) ? text : null;
    }
    default:
      return typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : null;
  }
}

/** A number as the screen shows it: grouped by thousands, two decimals at most. */
export const numberText = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** A value as the table and the search read it. */
export function valueText(value: FieldValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (isLink(value)) return recordLabel(value);
  if (Array.isArray(value)) return value.map((v) => (isLink(v) ? recordLabel(v) : v)).join(', ');
  if (typeof value === 'boolean') return t(value ? 'collection.yes' : 'collection.no');
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return String(value);
}

// ---------- formulas ----------

/** A day as a count of days, so that one day taken from another is a number of days. */
const dayNumber = (day: string): number | null => {
  if (!DAY.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

type Token = { kind: 'number'; value: number } | { kind: 'name'; value: string } | { kind: 'op'; value: string };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/(),]))/y;
  let at = 0;
  while (at < expr.length) {
    re.lastIndex = at;
    const m = re.exec(expr);
    if (!m) return null;
    if (m[1] !== undefined) tokens.push({ kind: 'number', value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ kind: 'name', value: m[2].toLowerCase() });
    else tokens.push({ kind: 'op', value: m[3]! });
    at = re.lastIndex;
    if (at === m.index) return null;
  }
  return tokens;
}

/** A field's value as a number for a formula: numbers as they are, days as day counts, flags as 1 and 0, formulas worked out. */
function numberOf(field: Field, values: Record['values'], schema: Pick<Schema, 'fields'>, today: string, depth: number): number | null {
  const value = values[field.key];
  switch (field.type) {
    case 'number':
      return typeof value === 'number' ? value : null;
    case 'date':
      return typeof value === 'string' ? dayNumber(value) : null;
    case 'checkbox':
      return value === true ? 1 : value === false ? 0 : null;
    case 'formula':
      return depth > 8 ? null : evaluateFormula(field.formula ?? '', values, schema, today, depth + 1);
    case 'rollup':
      return typeof value === 'number' ? value : typeof value === 'string' ? dayNumber(value) : null;
    default:
      return null;
  }
}

/** A formula read: a number, a field, today, a negation, or two parts joined by an operation. */
type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'field'; key: string }
  | { kind: 'today' }
  | { kind: 'neg'; of: FormulaNode }
  | { kind: 'op'; op: string; left: FormulaNode; right: FormulaNode };

/** Reads a formula: numbers, the four operations, parentheses, field keys and `today()`. Null when it is not one. */
function parseFormula(expr: string): FormulaNode | null {
  const tokens = tokenize(expr.trim());
  if (!tokens || tokens.length === 0) return null;
  let i = 0;
  const takeOp = (op: string) => {
    const token = tokens[i];
    if (token?.kind === 'op' && token.value === op) {
      i++;
      return true;
    }
    return false;
  };
  const factor = (): FormulaNode | null => {
    const token = tokens[i++];
    if (!token) return null;
    if (token.kind === 'number') return { kind: 'number', value: token.value };
    if (token.kind === 'op' && token.value === '-') {
      const inner = factor();
      return inner && { kind: 'neg', of: inner };
    }
    if (token.kind === 'op' && token.value === '(') {
      const inner = expression();
      return inner && takeOp(')') ? inner : null;
    }
    if (token.kind === 'name') {
      if (!takeOp('(')) return { kind: 'field', key: token.value };
      return token.value === 'today' && takeOp(')') ? { kind: 'today' } : null;
    }
    return null;
  };
  const joined = (part: () => FormulaNode | null, ops: string[]) => (): FormulaNode | null => {
    let left = part();
    while (left) {
      const next = tokens[i];
      if (next?.kind !== 'op' || !ops.includes(next.value)) break;
      i++;
      const right = part();
      if (!right) return null;
      left = { kind: 'op', op: next.value, left, right };
    }
    return left;
  };
  const term = joined(factor, ['*', '/']);
  const expression = joined(term, ['+', '-']);
  const node = expression();
  return node && i === tokens.length ? node : null;
}

/** The field keys a formula reads. */
function formulaKeys(node: FormulaNode): string[] {
  if (node.kind === 'field') return [node.key];
  if (node.kind === 'neg') return formulaKeys(node.of);
  if (node.kind === 'op') return [...formulaKeys(node.left), ...formulaKeys(node.right)];
  return [];
}

/**
 * Works out a formula over a record's fields: numbers, the four operations, parentheses, field keys,
 * `today()`, and days taken from days. Null when it cannot be worked out: a field it needs is empty,
 * or the expression is not one. A formula is shown, never written to the file.
 */
export function evaluateFormula(expr: string, values: Record['values'], schema: Pick<Schema, 'fields'>, today: string, depth = 0): number | null {
  const node = parseFormula(expr);
  if (!node) return null;
  const work = (n: FormulaNode): number | null => {
    switch (n.kind) {
      case 'number':
        return n.value;
      case 'today':
        return dayNumber(today);
      case 'field': {
        const field = schema.fields.find((f) => f.key === n.key);
        return field ? numberOf(field, values, schema, today, depth) : null;
      }
      case 'neg': {
        const inner = work(n.of);
        return inner === null ? null : -inner;
      }
      case 'op': {
        const [left, right] = [work(n.left), work(n.right)];
        if (left === null || right === null) return null;
        if (n.op === '+') return left + right;
        if (n.op === '-') return left - right;
        if (n.op === '*') return left * right;
        return right === 0 ? null : left / right;
      }
    }
  };
  const result = work(node);
  return result !== null && Number.isFinite(result) ? result : null;
}

/** The types a formula can read a number from. */
const COUNTED: readonly FieldType[] = ['number', 'date', 'checkbox', 'formula', 'rollup'];

/**
 * What is wrong with a formula, said for the one typing it: it is not one, or it reads a field that
 * is not there, one that holds no number, or itself (the formula of the field `key`). Null when it
 * can be worked out.
 */
export function formulaProblem(expr: string, schema: Pick<Schema, 'fields'>, key?: string): string | null {
  if (!expr.trim()) return t('fields.formulaEmpty');
  const node = parseFormula(expr);
  if (!node) return t('fields.formulaBroken');
  for (const name of formulaKeys(node)) {
    const field = schema.fields.find((f) => f.key === name);
    if (!field) return t('fields.formulaUnknown', { name });
    if (name === key) return t('fields.formulaSelf');
    if (!COUNTED.includes(field.type)) return t('fields.formulaNotNumber', { name: field.label });
  }
  return null;
}

/** A record's value for a field, formulas worked out for `today`. */
export function fieldValueOf(record: Pick<Record, 'values'>, field: Field, schema: Pick<Schema, 'fields'>, today: string): FieldValue | undefined {
  if (field.type === 'formula') return evaluateFormula(field.formula ?? '', record.values, schema, today);
  return record.values[field.key];
}

/** Whether a value counts as empty. */
export const isEmpty = (value: FieldValue | undefined) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

// ---------- record files ----------

/** A record's file name without its extension. */
export const recordName = (path: string) => basename(path).slice(0, -RECORD_EXT.length);

/** A record id as the app makes them, which is also the file name of a record made since: ten letters and digits. */
const ID_NAME = /^[0-9a-z]{10}$/;

/** Whether a record's file is named after an id rather than by a person. */
export const namedById = (path: string) => ID_NAME.test(recordName(path));

/** A new record's id: ten random letters and digits, which no two devices make alike. */
export function newRecordId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** A record's name and code: the values of the schema's name and code fields, or empty. */
function identity(values: Record['values'], schema: Schema): Pick<Record, 'name' | 'code'> {
  const text = (field: Field | undefined) => {
    const value = field ? values[field.key] : undefined;
    return typeof value === 'string' ? value.trim() : '';
  };
  return { name: text(nameField(schema)), code: text(codeField(schema)) };
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** The YAML front matter and the body of a note's text; no front matter means the whole text is body. */
export function splitFrontMatter(text: string): { front: { [key: string]: unknown }; body: string; hadFront: boolean } {
  const m = FRONT.exec(text);
  if (!m) return { front: {}, body: text, hadFront: false };
  let front: unknown;
  try {
    front = parseYaml(m[1]!);
  } catch {
    front = null;
  }
  // Front matter that is not a map (a list, broken YAML) is not fields; it stays in the body as it was.
  if (!isRecord(front)) return { front: {}, body: text, hadFront: false };
  return { front, body: text.slice(m[0].length), hadFront: true };
}

/**
 * Reads a record's file. A file without an id gets none here; `loadCollection` gives it one and
 * writes it. A file named by a person rather than by an id (made before records were named by
 * their ids, or a note dropped into the folder) that has no name in it is named after its file.
 */
export function parseRecord(text: string, schema: Schema, path: string): Record {
  const { front, body } = splitFrontMatter(text);
  const values: Record['values'] = {};
  const extra: Record['extra'] = {};
  const known = new Map(schema.fields.map((f) => [f.key, f]));
  for (const [key, raw] of Object.entries(front)) {
    if (key === 'id') continue;
    const field = known.get(key);
    // A value worked out on screen is not the file's; what the file has there is kept as it was.
    if (!field || field.type === 'formula' || field.type === 'rollup') {
      extra[key] = raw;
      continue;
    }
    const value = readValue(field.type, raw, field.many);
    if (value !== null) values[key] = value;
    else if (raw !== null && raw !== undefined) extra[key] = raw;
  }
  const named = nameField(schema);
  if (named && isEmpty(values[named.key]) && !namedById(path)) values[named.key] = recordName(path);
  return { id: typeof front.id === 'string' ? front.id : '', path, ...identity(values, schema), values, extra, body };
}

/** The file of a record: its id, then its fields in the schema's order, then what the schema does not know, then the body. */
export function serializeRecord(record: Record, schema: Schema): string {
  const front: { [key: string]: unknown } = { id: record.id };
  for (const field of schema.fields) {
    if (field.type === 'formula' || field.type === 'rollup') continue;
    const value = record.values[field.key];
    if (!isEmpty(value)) front[field.key] = value;
  }
  for (const [key, value] of Object.entries(record.extra)) if (!(key in front)) front[key] = value;
  const yaml = stringifyYaml(front, { lineWidth: 0 }).replace(/\n$/, '');
  return `---\n${yaml}\n---\n${normalBody(record.body)}`;
}

const isHidden = (name: string) => name.startsWith('.') || name.startsWith('_');
const isRecordFile = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith(RECORD_EXT) && !isHidden(entry.name);

export interface Collection {
  dir: string;
  schema: Schema;
  records: Record[];
}

/**
 * Reads a collection: its schema and every record. A record file without an id (made by another
 * tool, or a note dropped into the folder) is given one and written back, so that links to it
 * hold; it keeps its file name. With `readOnly` it keeps its path as its id instead.
 */
export async function loadCollection(fs: VaultFs, dir: string, ids: () => string = newRecordId, readOnly = false): Promise<Collection> {
  const schema = await loadSchema(fs, dir);
  const entries = (await fs.list(dir)).filter(isRecordFile).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const records: Record[] = [];
  for (const entry of entries) {
    const record = parseRecord(await fs.readText(entry.path), schema, entry.path);
    if (!record.id) {
      if (readOnly) record.id = entry.path;
      else {
        record.id = ids();
        await fs.writeText(entry.path, serializeRecord(record, schema));
      }
    }
    records.push(record);
  }
  return { dir, schema, records };
}

// ---------- making and changing ----------

const cleanName = (name: string) => name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

/** A body as the file holds it: no blank line at its start, one line end at its end when it has text. */
const normalBody = (body: string) => {
  const text = body.replace(/^\r?\n/, '');
  return text && !text.endsWith('\n') ? `${text}\n` : text;
};

/** The lowercased paths in `dir`, for `freePath`. */
async function taken(fs: VaultFs, dir: string): Promise<Set<string>> {
  return new Set((await fs.list(dir)).map((e) => e.path.toLowerCase()));
}

/**
 * Makes a collection folder called `name` in `folder`, numbered when the name is taken, with
 * the schema of `template`; without a name it is called Collection. Returns its path.
 */
export async function createCollection(fs: VaultFs, folder: string, name: string, template: CollectionTemplate): Promise<string> {
  const clean = cleanName(name);
  if (clean && isHidden(clean)) throw new Error(t('error.name'));
  const dir = freePath(folder, clean || t('collection.defaultName'), '', await taken(fs, folder));
  await fs.mkdir(dir);
  await saveSchema(fs, dir, newSchema(template, folder));
  return dir;
}

/**
 * Moves a collection's folder to `target`, a path nothing else has, with every file in it. A
 * change in the case of the name alone goes by a hidden name first, since a folder cannot be
 * moved onto itself where names do not tell case apart.
 */
async function moveCollectionDir(fs: VaultFs, dir: string, target: string): Promise<void> {
  if (target === dir) return;
  let from = dir;
  if (target.toLowerCase() === dir.toLowerCase()) {
    from = freePath(collectionOf(dir), `.${basename(dir)}`, '', await taken(fs, collectionOf(dir)));
    await moveTree(fs, dir, from);
    await fs.remove(dir);
  }
  await moveTree(fs, from, target);
  await fs.remove(from);
}

/** Gives a collection a name of the user's choosing, in the folder it is in; numbered when the name is taken. Returns its new path. */
export async function renameCollection(fs: VaultFs, dir: string, name: string): Promise<string> {
  const clean = cleanName(name);
  if (!clean || isHidden(clean)) throw new Error(t('error.name'));
  const folder = collectionOf(dir);
  const names = await taken(fs, folder);
  // Changing only the case of the name is not a clash with itself.
  names.delete(dir.toLowerCase());
  const target = freePath(folder, clean, '', names);
  await moveCollectionDir(fs, dir, target);
  return target;
}

/** Moves a collection into `folder`, numbered when a folder there has its name. Returns its new path. */
export async function moveCollection(fs: VaultFs, dir: string, folder: string): Promise<string> {
  if (collectionOf(dir) === folder) return dir;
  const target = freePath(folder, basename(dir), '', await taken(fs, folder));
  await moveCollectionDir(fs, dir, target);
  return target;
}

/**
 * A schema whose links and linked-record blocks pointing at the collection at `from` point at
 * `to`, where it went; the same schema when nothing in it points there.
 */
export function retargetLinks(schema: Schema, from: string, to: string): Schema {
  let changed = false;
  const fields = schema.fields.map((field) => {
    if (field.type !== 'link' || field.collection !== from) return field;
    changed = true;
    return { ...field, collection: to };
  });
  const layout = schema.layout && {
    columns: schema.layout.columns.map((column) => ({
      ...column,
      sections: column.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (!('block' in item) || item.block !== 'linked' || item.collection !== from) return item;
          changed = true;
          return { ...item, collection: to };
        }),
      })),
    })),
  };
  return changed ? { ...schema, fields, ...(layout && { layout }) } : schema;
}

/** What a new record is given: its fields, its name and code among them, and its body. */
export interface NewRecord {
  values?: Record['values'];
  body?: string;
}

/** The values as a file keeps them: the empty ones left out. */
function filled(values: Record['values']): Record['values'] {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isEmpty(value)));
}

/**
 * Adds a record to a collection, as a file named after its id, which never changes: renaming the
 * record changes what is in the file, not where it is, and two records made on two devices never
 * meet in one file. Returns the record.
 */
export async function addRecord(fs: VaultFs, collection: Collection, input: NewRecord, id: string = newRecordId()): Promise<Record> {
  const names = await taken(fs, collection.dir);
  let path = join(collection.dir, `${id}${RECORD_EXT}`);
  while (names.has(path.toLowerCase())) {
    id = newRecordId();
    path = join(collection.dir, `${id}${RECORD_EXT}`);
  }
  const values = filled(input.values ?? {});
  const record: Record = { id, path, ...identity(values, collection.schema), values, extra: {}, body: normalBody(input.body ?? '') };
  await fs.writeText(path, serializeRecord(record, collection.schema));
  return record;
}

export type RecordPatch = Partial<Pick<Record, 'body'>> & { values?: Record['values'] };

/** Changes a record and writes its file, where it is. Returns the record as written. */
export async function updateRecord(fs: VaultFs, schema: Schema, record: Record, patch: RecordPatch): Promise<Record> {
  const values = filled(patch.values ? { ...record.values, ...patch.values } : record.values);
  const next: Record = { ...record, ...(patch.body !== undefined && { body: normalBody(patch.body) }), values, ...identity(values, schema) };
  await fs.writeText(next.path, serializeRecord(next, schema));
  return next;
}

// ---------- looking at records ----------

/** A record as a picker or a link shows it: its name and code, either alone when it has only one, "Untitled" with neither. */
export const recordLabel = (record: { name: string; code?: string }) =>
  (record.name && record.code ? `${record.name} · ${record.code}` : record.name || record.code) || t('collection.untitled');

/**
 * Whether the record a link points at is gone: its collection is at hand (`records`) and has no
 * record of its id, or, for a link written by hand without one, of its name. A link into a
 * collection that is not here is not said to be gone; nothing is known of it.
 */
export function linkGone(link: Link, records: readonly Pick<Record, 'id' | 'name'>[] | null): boolean {
  if (records === null) return false;
  if (link.id) return !records.some((r) => r.id === link.id);
  const name = link.name.trim().toLowerCase();
  return !records.some((r) => r.name.trim().toLowerCase() === name);
}

/**
 * Where a web address, an email address or a phone number goes when it is opened: a web page, a
 * new mail, a call. A web address typed without its `https://` gets it; null for a value that is
 * none of these, or an address of another kind.
 */
export function fieldHref(type: FieldType, value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (type === 'url') {
    if (/^https?:\/\/\S+$/i.test(text)) return text;
    // Something else before a colon is another kind of address, not a web page.
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) || /\s/.test(text) || !text.includes('.')) return null;
    return `https://${text}`;
  }
  if (type === 'email') return /^[^\s@]+@[^\s@]+$/.test(text) ? `mailto:${text}` : null;
  if (type === 'phone') {
    const digits = text.replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 3 ? `tel:${digits}` : null;
  }
  return null;
}

const SEARCHED: readonly FieldType[] = ['name', 'code', 'text', 'select', 'multi-select', 'url', 'email', 'phone', 'person', 'link'];

// ---------- views: conditions, groups and sums ----------

/** The conditions a field of each type can take. */
export function opsFor(type: FieldType): ConditionOp[] {
  switch (type) {
    case 'number':
    case 'formula':
      return ['is', 'gt', 'lt', 'empty', 'not-empty'];
    case 'rollup':
      return ['is', 'gt', 'lt', 'before', 'after', 'empty', 'not-empty'];
    case 'date':
      return ['on', 'before', 'after', 'empty', 'not-empty'];
    case 'checkbox':
      return ['true', 'false'];
    case 'select':
    case 'multi-select':
    case 'link':
      return ['is', 'is-not', 'empty', 'not-empty'];
    default:
      return ['contains', 'is', 'is-not', 'empty', 'not-empty'];
  }
}

/** Whether a value needs to be typed or chosen for a condition. */
export const opTakesValue = (op: ConditionOp) => !['empty', 'not-empty', 'true', 'false'].includes(op);

/** Whether a condition says enough to ask anything: one that needs a value and has none yet asks nothing. */
export function isComplete(condition: Condition): boolean {
  if (!opTakesValue(condition.op)) return true;
  const { value } = condition;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim() !== '';
  return Array.isArray(value) && value.length > 0;
}

/** The names a value answers to in a condition: a choice, the choices, a link's name and code. */
function namesOf(value: FieldValue | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (isLink(value)) return [value.name, value.id, ...(value.code ? [value.code] : [])];
  if (Array.isArray(value)) return value.flatMap((v) => (isLink(v) ? [v.name, v.id, ...(v.code ? [v.code] : [])] : [v]));
  return [String(value)];
}

/** Whether one condition holds for a record. */
export function matchesCondition(record: Pick<Record, 'values'>, schema: Pick<Schema, 'fields'>, condition: Condition, today: string): boolean {
  const field = schema.fields.find((f) => f.key === condition.field);
  if (!field || !isComplete(condition)) return true;
  const value = fieldValueOf(record, field, schema, today);
  const empty = isEmpty(value);
  const wanted = Array.isArray(condition.value) ? condition.value : condition.value === undefined ? [] : [String(condition.value)];
  const lower = (s: string) => s.trim().toLowerCase();
  const has = () => {
    const names = namesOf(value).map(lower);
    return wanted.some((w) => names.includes(lower(w)));
  };
  const number = typeof value === 'number' ? value : null;
  const n = typeof condition.value === 'number' ? condition.value : Number(condition.value);
  const day = typeof value === 'string' ? value : '';
  const target = typeof condition.value === 'string' ? condition.value : '';
  switch (condition.op) {
    case 'empty':
      return empty;
    case 'not-empty':
      return !empty;
    case 'true':
      return value === true;
    case 'false':
      return value !== true;
    case 'contains':
      return !empty && wanted.length > 0 && wanted.some((w) => valueText(value).toLowerCase().includes(lower(w)));
    case 'is':
      return field.type === 'number' || field.type === 'formula' || typeof value === 'number' ? number !== null && number === n : !empty && has();
    case 'is-not':
      return empty || !has();
    case 'gt':
      return number !== null && Number.isFinite(n) && number > n;
    case 'lt':
      return number !== null && Number.isFinite(n) && number < n;
    case 'on':
      return !!day && day === target;
    case 'before':
      return !!day && !!target && day < target;
    case 'after':
      return !!day && !!target && day > target;
  }
}

/** Whether every condition holds. */
export const matchesConditions = (record: Record, schema: Schema, conditions: Condition[], today: string) =>
  conditions.every((c) => matchesCondition(record, schema, c, today));

/** The types the table can group by. */
export const GROUPABLE: readonly FieldType[] = ['select', 'multi-select', 'link', 'person', 'checkbox', 'date'];

export interface RecordGroup {
  /** What the group is: the choice, the link's name, the day; empty for the records without one. */
  key: string;
  label: string;
  records: Record[];
}

/**
 * The records in groups by a field, in the order of the field's options when it has them, else by
 * name; a record with several choices is in each of its groups; the records with none come last.
 */
export function groupRecords(records: Record[], schema: Schema, key: string, today: string): RecordGroup[] {
  const field = schema.fields.find((f) => f.key === key);
  if (!field || !GROUPABLE.includes(field.type)) return [{ key: '', label: '', records }];
  const groups = new Map<string, RecordGroup>();
  const add = (groupKey: string, label: string, record: Record) => {
    let group = groups.get(groupKey);
    if (!group) {
      group = { key: groupKey, label, records: [] };
      groups.set(groupKey, group);
    }
    group.records.push(record);
  };
  for (const record of records) {
    const value = fieldValueOf(record, field, schema, today);
    if (isEmpty(value)) add('', '', record);
    else if (isLink(value)) add(value.id || value.name, recordLabel(value), record);
    else if (Array.isArray(value)) for (const v of value) (isLink(v) ? add(v.id || v.name, recordLabel(v), record) : add(v, v, record));
    else add(String(value), valueText(value), record);
  }
  const order = field.options ?? [];
  const rank = (g: RecordGroup) => (g.key === '' ? Number.MAX_SAFE_INTEGER : order.includes(g.key) ? order.indexOf(g.key) : order.length);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
}

/** The sum of a number or formula column over records; null when the column is not one, or no record has a value. */
export function columnSum(records: Record[], schema: Schema, key: string, today: string): number | null {
  const field = schema.fields.find((f) => f.key === key);
  if (!field || (field.type !== 'number' && field.type !== 'formula' && field.type !== 'rollup')) return null;
  let sum = 0;
  let any = false;
  for (const record of records) {
    const value = fieldValueOf(record, field, schema, today);
    if (typeof value !== 'number') continue;
    sum += value;
    any = true;
  }
  return any ? sum : null;
}

/** Whether a record matches what was typed in the search box: in its name, its code or another text-like field, case apart. */
export function matchesQuery(record: Record, schema: Schema, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return schema.fields.some((f) => SEARCHED.includes(f.type) && valueText(record.values[f.key]).toLowerCase().includes(q));
}

/** Records sorted; empty values go last either way, and records that tie keep their name order. Formulas sort by what they work out to for `today`. */
export function sortRecords(records: Record[], schema: Schema, sort: RecordSort, today = ''): Record[] {
  const field = schema.fields.find((f) => f.key === sort.key);
  const type = field?.type ?? 'text';
  const valueOf = (r: Record): FieldValue | undefined => (field ? fieldValueOf(r, field, schema, today) : r.values[sort.key]);
  const compare = (a: FieldValue, b: FieldValue): number => {
    if (type === 'number' || type === 'checkbox' || type === 'formula' || (typeof a === 'number' && typeof b === 'number')) return Number(a) - Number(b);
    return valueText(a).localeCompare(valueText(b), undefined, { numeric: true, sensitivity: 'base' });
  };
  const byName = (a: Record, b: Record) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  return [...records].sort((a, b) => {
    const [va, vb] = [valueOf(a), valueOf(b)];
    const [ea, eb] = [isEmpty(va), isEmpty(vb)];
    if (ea !== eb) return ea ? 1 : -1;
    const order = ea ? 0 : compare(va as FieldValue, vb as FieldValue);
    return (sort.dir === 'asc' ? order : -order) || byName(a, b);
  });
}

/**
 * The links of a record with their names and codes as the records they point at have them now,
 * where those records are at hand (by collection path); a link to a record that is not there
 * keeps what it had. Returns the same values when nothing changed.
 */
export function freshenLinks(values: Record['values'], schema: Schema, lookup: (collection: string, id: string) => Pick<Record, 'id' | 'name' | 'code'> | undefined): Record['values'] {
  let out = values;
  const fresh = (field: Field, link: Link): Link => {
    const target = field.collection ? lookup(field.collection, link.id) : undefined;
    if (!target) return link;
    const next = linkTo(target);
    return next.name === link.name && (next.code ?? '') === (link.code ?? '') ? link : next;
  };
  for (const field of schema.fields) {
    if (field.type !== 'link') continue;
    const value = values[field.key];
    if (isLink(value)) {
      const next = fresh(field, value);
      if (next !== value) out = { ...out, [field.key]: next };
    } else if (Array.isArray(value)) {
      const links = value.filter(isLink);
      const next = links.map((l) => fresh(field, l));
      if (next.some((l, i) => l !== links[i])) out = { ...out, [field.key]: next };
    }
  }
  return out;
}

// ---------- linked records ----------

/** The link fields of a schema that point at the collection at `dir`. */
export const linkFieldsTo = (schema: Schema, dir: string): Field[] => schema.fields.filter((f) => f.type === 'link' && f.collection === dir);

/** Whether a link field's value points at `record`: by its id, or by its name for a link written by hand without one. */
export function pointsAt(value: unknown, record: Pick<Record, 'id' | 'name'>): boolean {
  const links = (Array.isArray(value) ? (value as unknown[]) : [value]).filter(isLink);
  const name = record.name.trim().toLowerCase();
  return links.some((link) => (link.id ? link.id === record.id : link.name.trim().toLowerCase() === name));
}

/** The records of `source` that link to `record` of the collection at `dir`. */
export function linkedRecords(source: Collection, dir: string, record: Pick<Record, 'id' | 'name'>): Record[] {
  const fields = linkFieldsTo(source.schema, dir);
  return fields.length === 0 ? [] : source.records.filter((r) => fields.some((f) => pointsAt(r.values[f.key], record)));
}

/** The collections that have a link field pointing at the collection at `dir`. */
export const linkingCollections = (collections: Collection[], dir: string): Collection[] => collections.filter((c) => linkFieldsTo(c.schema, dir).length > 0);

/**
 * What a new record of `schema` holds when it is added from `record`, of the collection at `dir`
 * whose schema is `from`: every link field pointing there holds the record, and one pointing
 * where a link of the record points holds that link too, so that an activity added to a person
 * is also the activity of the person's company.
 */
export function linkedValues(schema: Schema, dir: string, record: Record, from: Schema): Record['values'] {
  const values: Record['values'] = {};
  for (const field of schema.fields) {
    if (field.type !== 'link' || !field.collection) continue;
    let link: Link | undefined;
    if (field.collection === dir) link = linkTo(record);
    else {
      const own = from.fields.find((f) => f.type === 'link' && f.collection === field.collection && !isEmpty(record.values[f.key]));
      const value = own ? record.values[own.key] : undefined;
      link = (Array.isArray(value) ? (value as unknown[]) : [value]).find(isLink);
    }
    if (link) values[field.key] = field.many ? [link] : link;
  }
  return values;
}

/** The fields a record leaves empty that it cannot, by key: the name, when the schema has one, and the fields that are required. */
export function missingFields(values: Record['values'], schema: Schema): string[] {
  return schema.fields
    .filter((f) => (f.type === 'name' || f.required) && (typeof values[f.key] === 'string' ? !(values[f.key] as string).trim() : isEmpty(values[f.key])))
    .map((f) => f.key);
}

/**
 * What does not fit the schema in a record, by field: a name or a required field left empty
 * (`missing`), a value in the file its field cannot hold, kept in the file as it was (`mismatch`),
 * a select's value that is not one of its choices (`choice`). Such a record is not refused, since
 * its file may have come from elsewhere; it is marked.
 */
export interface RecordProblem {
  field: string;
  kind: 'missing' | 'mismatch' | 'choice';
}

export function recordProblems(record: Pick<Record, 'values' | 'extra'>, schema: Schema): RecordProblem[] {
  const problems: RecordProblem[] = [];
  for (const field of schema.fields) {
    if (field.type === 'formula' || field.type === 'rollup') continue;
    const value = record.values[field.key];
    if (isEmpty(value) && field.key in record.extra) problems.push({ field: field.key, kind: 'mismatch' });
    else if ((field.type === 'name' || field.required) && (typeof value === 'string' ? !value.trim() : isEmpty(value))) problems.push({ field: field.key, kind: 'missing' });
    else if (field.type === 'select' && typeof value === 'string' && value && !(field.options ?? []).includes(value)) problems.push({ field: field.key, kind: 'choice' });
  }
  return problems;
}

/** What is wrong with a field of a record, said for the one looking at it. */
export function problemText(problem: RecordProblem, field: Field, record: Pick<Record, 'values' | 'extra'>): string {
  if (problem.kind === 'missing') return field.type === 'name' ? t('collection.nameNeeded') : t('collection.problem.missing', { field: field.label });
  if (problem.kind === 'choice') return t('collection.problem.choice', { value: String(record.values[field.key]), field: field.label });
  return t('collection.problem.mismatch', { value: rawText(record.extra[field.key]), type: t(`fields.type.${field.type}`).toLowerCase() });
}

/** A value of the file as it was written, as text: a list joined with commas, anything else as YAML would show it. */
export function rawText(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(rawText).join(', ');
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (isRecord(raw)) return JSON.stringify(raw);
  return String(raw);
}

/** What a record is called on its screen and in a question about it: its name, else its code, else "Untitled". */
export const recordTitle = (record: Pick<Record, 'name' | 'code'>) => record.name || record.code || t('collection.untitled');
