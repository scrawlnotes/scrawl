import { t } from '@scrawlnotes/i18n';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { basename, type Entry, join, type VaultFs } from './fs';
import { freePath } from './paths';

// A collection is a folder with a schema file in it, `_collection.json`, and one Markdown file
// per record: the record's fields in YAML front matter, free text under it. A record is a note,
// so everything made for notes (the editor, history, the trash, line merging in sync) works on
// it, and an agent reads and writes it without learning a new format. The schema also holds the
// layout of the record screen: columns of sections of elements, which a template brings and the
// Fields window changes. See the Collection views of design/mockups.html and PLAN.md 4.6.

export const COLLECTION_FILE = '_collection.json';
export const RECORD_EXT = '.md';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox' | 'url' | 'email' | 'phone' | 'person' | 'link' | 'formula';

export const FIELD_TYPES: readonly FieldType[] = ['text', 'number', 'date', 'select', 'multi-select', 'checkbox', 'url', 'email', 'phone', 'person', 'link', 'formula'];

export interface Field {
  /** The key in the front matter: letters, digits and underscores. */
  key: string;
  label: string;
  type: FieldType;
  /** The choices of a select or a multi-select. */
  options?: string[];
  required?: boolean;
  /** A link's target: the path of the collection its records come from. */
  collection?: string;
  /** A link that holds several records. */
  many?: boolean;
  /** A formula's expression over the record's own fields: `qty * unit_price`, `today() - last_contact`. Not written to the file. */
  formula?: string;
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

/** Every schema has these two: the record's name, which is its title and its file name, and a code to find it by. */
export const NAME_KEY = 'name';
export const CODE_KEY = 'code';

/** An element of the record screen: a field, the body, the records of another collection that link here, or cards and tasks. */
export type LayoutItem =
  | { field: string }
  | { block: 'body' }
  | { block: 'linked'; collection: string; sort?: string; style?: 'list' | 'timeline' }
  | { block: 'cards' };

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

/** How a code is made for a record that has none: `PAY-0012`. */
export interface CodeRule {
  prefix: string;
  /** The number the next code gets. */
  next: number;
}

export type CollectionTemplate = 'companies' | 'people' | 'activities' | 'feedback' | 'payments' | 'blank';

export const COLLECTION_TEMPLATES: readonly CollectionTemplate[] = ['companies', 'people', 'activities', 'feedback', 'payments', 'blank'];

/** How records are sorted in the table: by a field key, `name` or `code`, up or down. */
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
}

export interface Schema {
  version: 1;
  template: CollectionTemplate;
  /** The saved views, in the order they were made. */
  views?: View[];
  /** The fields, name and code first; the order is the order of the table's columns. */
  fields: Field[];
  /** Set when codes are made by the collection rather than typed. */
  code?: CodeRule;
  /** The record screen; unset means one column of every field, then the body. */
  layout?: Layout;
}

/** A field's value as it is held: text, a number, a day, a choice, choices, a flag, a link or links, or nothing. */
export type FieldValue = string | number | boolean | string[] | Link | Link[] | null;

export interface Record {
  /** Stable, from the front matter; links from elsewhere use it. */
  id: string;
  /** The record's file. */
  path: string;
  name: string;
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

const FIXED: Field[] = [
  { key: NAME_KEY, label: 'Name', type: 'text', required: true },
  { key: CODE_KEY, label: 'Code', type: 'text' },
];

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
const TEMPLATE_FIELDS: { [template in CollectionTemplate]: Field[] } = {
  companies: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'segment', label: 'Segment', type: 'select', options: ['SMB', 'Mid-market', 'Enterprise'] },
    { key: 'type', label: 'Type', type: 'multi-select', options: ['customer', 'supplier', 'partner', 'investor'] },
    { key: 'owner', label: 'Owner', type: 'person' },
    { key: 'status', label: 'Status', type: 'select', options: ['prospect', 'active', 'churned'] },
    { key: 'tags', label: 'Tags', type: 'multi-select', options: [] },
  ],
  people: [
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'source', label: 'Source', type: 'select', options: ['referral', 'event', 'inbound', 'outbound'] },
    { key: 'status', label: 'Status', type: 'select', options: ['lead', 'active', 'inactive'] },
    { key: 'tags', label: 'Tags', type: 'multi-select', options: [] },
  ],
  activities: [
    { key: 'type', label: 'Type', type: 'select', options: ['note', 'call', 'meeting', 'email'], required: true },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'by', label: 'By', type: 'person' },
  ],
  feedback: [
    { key: 'source', label: 'Source', type: 'select', options: ['email', 'call', 'interview', 'social', 'support'] },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'area', label: 'Area', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['new', 'planned', 'done', 'declined'] },
  ],
  payments: [
    { key: 'direction', label: 'Direction', type: 'select', options: ['incoming', 'outgoing'], required: true },
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'TRY', 'GBP'] },
    { key: 'due', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['planned', 'invoiced', 'paid'] },
    { key: 'invoice_no', label: 'Invoice no', type: 'text' },
    { key: 'paid_on', label: 'Paid on', type: 'date' },
  ],
  blank: [],
};

/** The templates whose codes the collection makes itself. */
const TEMPLATE_CODES: Partial<{ [template in CollectionTemplate]: string }> = { payments: 'PAY' };

/**
 * A fresh schema from a template. Links point at the collection of that name in `folder`, where
 * the collection is made, so that People made beside Companies find it.
 */
export function newSchema(template: CollectionTemplate, folder = ''): Schema {
  const fields = [...FIXED, ...TEMPLATE_FIELDS[template]].map((f) => ({
    ...f,
    ...(f.options && { options: [...f.options] }),
    ...(f.collection !== undefined && { collection: join(folder, f.collection) }),
  }));
  const prefix = TEMPLATE_CODES[template];
  return { version: 1, template, fields, ...(prefix && { code: { prefix, next: 1 } }) };
}

// ---------- schema file ----------

const isRecord = (value: unknown): value is { [key: string]: unknown } => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

function readField(raw: unknown): Field | null {
  if (!isRecord(raw) || typeof raw.key !== 'string') return null;
  const key = cleanFieldKey(raw.key);
  if (!key) return null;
  const type = FIELD_TYPES.includes(raw.type as FieldType) ? (raw.type as FieldType) : 'text';
  const field: Field = { key, label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : key, type };
  if (type === 'select' || type === 'multi-select') field.options = strings(raw.options);
  if (type === 'link') {
    field.collection = typeof raw.collection === 'string' ? raw.collection.replace(/^\/+|\/+$/g, '') : '';
    if (raw.many === true) field.many = true;
  }
  if (type === 'formula') field.formula = typeof raw.formula === 'string' ? raw.formula : '';
  if (raw.required === true) field.required = true;
  return field;
}

function readItem(raw: unknown): LayoutItem | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.field === 'string') return { field: cleanFieldKey(raw.field) };
  if (raw.block === 'body' || raw.block === 'cards') return { block: raw.block };
  if (raw.block === 'linked' && typeof raw.collection === 'string') {
    return {
      block: 'linked',
      collection: raw.collection,
      ...(typeof raw.sort === 'string' && { sort: raw.sort }),
      ...((raw.style === 'list' || raw.style === 'timeline') && { style: raw.style }),
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
 * Reads a schema file. Name and code are always there, first, whatever the file says; a field
 * of an unknown type reads as text; a broken file reads as a blank schema, so the records can
 * still be opened.
 */
export function parseSchema(text: string): Schema {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  const data = isRecord(raw) ? raw : {};
  const read = (Array.isArray(data.fields) ? data.fields : []).map(readField).filter((f): f is Field => f !== null);
  const fields: Field[] = FIXED.map((fixed) => {
    const own = read.find((f) => f.key === fixed.key);
    return { ...fixed, ...(own && { label: own.label }) };
  });
  const seen = new Set(fields.map((f) => f.key));
  for (const field of read) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    fields.push(field);
  }
  const template: CollectionTemplate = COLLECTION_TEMPLATES.includes(data.template as CollectionTemplate) ? (data.template as CollectionTemplate) : 'blank';
  const schema: Schema = { version: 1, template, fields };
  if (isRecord(data.code) && typeof data.code.prefix === 'string' && data.code.prefix.trim()) {
    schema.code = { prefix: data.code.prefix.trim(), next: typeof data.code.next === 'number' && data.code.next > 0 ? Math.floor(data.code.next) : 1 };
  }
  const layout = readLayout(data.layout);
  if (layout) schema.layout = layout;
  const views = readViews(data.views, fields);
  if (views.length > 0) schema.views = views;
  return schema;
}

const isSort = (raw: unknown): raw is RecordSort => isRecord(raw) && typeof raw.key === 'string' && (raw.dir === 'asc' || raw.dir === 'desc');

function readCondition(raw: unknown, fields: Field[]): Condition | null {
  if (!isRecord(raw) || typeof raw.field !== 'string' || !CONDITION_OPS.includes(raw.op as ConditionOp)) return null;
  const key = cleanFieldKey(raw.field);
  if (!fields.some((f) => f.key === key)) return null;
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

/** The layout a schema shows with: its own, or one column of every field but the name, then the body. */
export function layoutOf(schema: Schema): Layout {
  if (schema.layout) return schema.layout;
  const items: LayoutItem[] = schema.fields.filter((f) => f.key !== NAME_KEY).map((f) => ({ field: f.key }));
  return { columns: [{ sections: [{ items }, { items: [{ block: 'body' }] }] }] };
}

/** The fields the layout does not place, which the screen shows at its end so that none is lost. */
export function unplacedFields(schema: Schema): Field[] {
  const placed = new Set<string>([NAME_KEY]);
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
function numberOf(field: Field, values: Record['values'], schema: Schema, today: string, depth: number): number | null {
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
    default:
      return null;
  }
}

/**
 * Works out a formula over a record's fields: numbers, the four operations, parentheses, field keys,
 * `today()`, and days taken from days. Null when it cannot be worked out: a field it needs is empty,
 * or the expression is not one. A formula is shown, never written to the file.
 */
export function evaluateFormula(expr: string, values: Record['values'], schema: Schema, today: string, depth = 0): number | null {
  const tokens = tokenize(expr.trim());
  if (!tokens || tokens.length === 0) return null;
  let i = 0;
  const peek = () => tokens[i];
  const takeOp = (op: string) => {
    const token = tokens[i];
    if (token?.kind === 'op' && token.value === op) {
      i++;
      return true;
    }
    return false;
  };
  const fail = Symbol('fail');
  const factor = (): number | typeof fail => {
    const token = tokens[i++];
    if (!token) return fail;
    if (token.kind === 'number') return token.value;
    if (token.kind === 'op' && token.value === '-') {
      const inner = factor();
      return inner === fail ? fail : -inner;
    }
    if (token.kind === 'op' && token.value === '(') {
      const inner = expression();
      return inner === fail || !takeOp(')') ? fail : inner;
    }
    if (token.kind === 'name') {
      if (takeOp('(')) {
        if (token.value !== 'today' || !takeOp(')')) return fail;
        const day = dayNumber(today);
        return day === null ? fail : day;
      }
      const field = schema.fields.find((f) => f.key === token.value);
      if (!field) return fail;
      const n = numberOf(field, values, schema, today, depth);
      return n === null ? fail : n;
    }
    return fail;
  };
  const term = (): number | typeof fail => {
    let left = factor();
    while (left !== fail) {
      const next = peek();
      if (next?.kind !== 'op' || (next.value !== '*' && next.value !== '/')) break;
      i++;
      const right = factor();
      if (right === fail) return fail;
      left = next.value === '*' ? left * right : right === 0 ? fail : left / right;
    }
    return left;
  };
  const expression = (): number | typeof fail => {
    let left = term();
    while (left !== fail) {
      const next = peek();
      if (next?.kind !== 'op' || (next.value !== '+' && next.value !== '-')) break;
      i++;
      const right = term();
      if (right === fail) return fail;
      left = next.value === '+' ? left + right : left - right;
    }
    return left;
  };
  const result = expression();
  return result === fail || i !== tokens.length || !Number.isFinite(result) ? null : result;
}

/** A record's value for a field, formulas worked out for `today`. */
export function fieldValueOf(record: Record, field: Field, schema: Schema, today: string): FieldValue | undefined {
  if (field.key === NAME_KEY) return record.name;
  if (field.key === CODE_KEY) return record.code;
  if (field.type === 'formula') return evaluateFormula(field.formula ?? '', record.values, schema, today);
  return record.values[field.key];
}

/** Whether a value counts as empty. */
export const isEmpty = (value: FieldValue | undefined) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

// ---------- record files ----------

/** What a record is called when its file has no name in it: its file name. */
export const recordName = (path: string) => basename(path).slice(0, -RECORD_EXT.length);

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

/** Reads a record's file. A file without an id gets none here; `loadRecords` gives it one and writes it. */
export function parseRecord(text: string, schema: Schema, path: string): Record {
  const { front, body } = splitFrontMatter(text);
  const values: Record['values'] = {};
  const extra: Record['extra'] = {};
  const known = new Map(schema.fields.map((f) => [f.key, f]));
  for (const [key, raw] of Object.entries(front)) {
    if (key === 'id') continue;
    const field = known.get(key);
    if (!field) {
      extra[key] = raw;
      continue;
    }
    const value = readValue(field.type, raw, field.many);
    if (value !== null) values[key] = value;
    else if (raw !== null && raw !== undefined) extra[key] = raw;
  }
  const name = typeof values[NAME_KEY] === 'string' && values[NAME_KEY].trim() ? values[NAME_KEY].trim() : recordName(path);
  const code = typeof values[CODE_KEY] === 'string' ? values[CODE_KEY].trim() : '';
  delete values[NAME_KEY];
  delete values[CODE_KEY];
  return { id: typeof front.id === 'string' ? front.id : '', path, name, code, values, extra, body };
}

/** The file of a record: its id, name and code, then its fields in the schema's order, then what the schema does not know, then the body. */
export function serializeRecord(record: Record, schema: Schema): string {
  const front: { [key: string]: unknown } = { id: record.id, [NAME_KEY]: record.name };
  if (record.code) front[CODE_KEY] = record.code;
  for (const field of schema.fields) {
    if (field.key === NAME_KEY || field.key === CODE_KEY) continue;
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
 * Reads a collection: its schema and every record, by name. A record file without an id (made
 * by another tool, or a note dropped into the folder) is given one and written back, so that
 * links to it hold; with `readOnly` it keeps its path as its id instead.
 */
export async function loadCollection(fs: VaultFs, dir: string, ids: () => string = () => crypto.randomUUID(), readOnly = false): Promise<Collection> {
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

/** What a new record is given: its name, its code when typed, its fields and its body. */
export interface NewRecord {
  name: string;
  code?: string;
  values?: Record['values'];
  body?: string;
}

/** A code from the collection's rule, padded to four digits: `PAY-0012`. */
export const makeCode = (rule: CodeRule) => `${rule.prefix}-${String(rule.next).padStart(4, '0')}`;

/** A record's file name: its name, which is what the file is called. */
function fileFor(name: string): string {
  const clean = cleanName(name);
  if (!clean || isHidden(clean)) throw new Error(t('error.name'));
  return clean;
}

/**
 * Adds a record to a collection: a file named after it, numbered when a record of that name is
 * there already. A code is made from the collection's rule when there is one and none was typed,
 * and the rule's count moves on. Returns the record and the schema as it is now.
 */
export async function addRecord(
  fs: VaultFs,
  collection: Collection,
  input: NewRecord,
  id: string = crypto.randomUUID(),
): Promise<{ record: Record; schema: Schema }> {
  const name = fileFor(input.name);
  let schema = collection.schema;
  let code = input.code?.trim() ?? '';
  if (!code && schema.code) {
    code = makeCode(schema.code);
    schema = { ...schema, code: { ...schema.code, next: schema.code.next + 1 } };
    await saveSchema(fs, collection.dir, schema);
  }
  const path = freePath(collection.dir, name, RECORD_EXT, await taken(fs, collection.dir));
  const record: Record = { id, path, name: input.name.trim(), code, values: { ...(input.values ?? {}) }, extra: {}, body: normalBody(input.body ?? '') };
  await fs.writeText(path, serializeRecord(record, schema));
  return { record, schema };
}

export type RecordPatch = Partial<Pick<Record, 'name' | 'code' | 'body'>> & { values?: Record['values'] };

/**
 * Changes a record and writes its file. A new name renames the file too, numbered when that
 * name is taken, so the record keeps being found by its name on disk. Returns the record as
 * written, at the path it has now.
 */
export async function updateRecord(fs: VaultFs, schema: Schema, record: Record, patch: RecordPatch): Promise<Record> {
  const next: Record = {
    ...record,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.code !== undefined && { code: patch.code.trim() }),
    ...(patch.body !== undefined && { body: normalBody(patch.body) }),
    values: patch.values ? { ...record.values, ...patch.values } : record.values,
  };
  for (const [key, value] of Object.entries(next.values)) if (isEmpty(value)) delete next.values[key];
  if (next.name !== record.name) {
    const dir = collectionOf(record.path);
    const wanted = join(dir, `${fileFor(next.name)}${RECORD_EXT}`);
    if (wanted.toLowerCase() !== record.path.toLowerCase()) {
      const names = await taken(fs, dir);
      names.delete(record.path.toLowerCase());
      next.path = freePath(dir, fileFor(next.name), RECORD_EXT, names);
    } else next.path = wanted;
  }
  await fs.writeText(next.path, serializeRecord(next, schema));
  if (next.path !== record.path) await fs.remove(record.path);
  return next;
}

// ---------- looking at records ----------

/** A record as a picker or a link shows it: its name, and its code when it has one. */
export const recordLabel = (record: { name: string; code?: string }) => (record.code ? `${record.name} · ${record.code}` : record.name);

const SEARCHED: readonly FieldType[] = ['text', 'select', 'multi-select', 'url', 'email', 'phone', 'person', 'link'];

// ---------- views: conditions, groups and sums ----------

/** The conditions a field of each type can take. */
export function opsFor(type: FieldType): ConditionOp[] {
  switch (type) {
    case 'number':
    case 'formula':
      return ['is', 'gt', 'lt', 'empty', 'not-empty'];
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

/** The names a value answers to in a condition: a choice, the choices, a link's name and code. */
function namesOf(value: FieldValue | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (isLink(value)) return [value.name, value.id, ...(value.code ? [value.code] : [])];
  if (Array.isArray(value)) return value.flatMap((v) => (isLink(v) ? [v.name, v.id, ...(v.code ? [v.code] : [])] : [v]));
  return [String(value)];
}

/** Whether one condition holds for a record. */
export function matchesCondition(record: Record, schema: Schema, condition: Condition, today: string): boolean {
  const field = schema.fields.find((f) => f.key === condition.field);
  if (!field) return true;
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
      return field.type === 'number' || field.type === 'formula' ? number !== null && number === n : !empty && has();
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
  if (!field || (field.type !== 'number' && field.type !== 'formula')) return null;
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

/** Whether a record matches what was typed in the search box: in its name, its code or a text-like field, case apart. */
export function matchesQuery(record: Record, schema: Schema, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (record.name.toLowerCase().includes(q) || record.code.toLowerCase().includes(q)) return true;
  return schema.fields.some((f) => SEARCHED.includes(f.type) && valueText(record.values[f.key]).toLowerCase().includes(q));
}

/** Records sorted; empty values go last either way, and records that tie keep their name order. Formulas sort by what they work out to for `today`. */
export function sortRecords(records: Record[], schema: Schema, sort: RecordSort, today = ''): Record[] {
  const field = schema.fields.find((f) => f.key === sort.key);
  const type = field?.type ?? 'text';
  const valueOf = (r: Record): FieldValue | undefined => (field ? fieldValueOf(r, field, schema, today) : sort.key === NAME_KEY ? r.name : sort.key === CODE_KEY ? r.code : r.values[sort.key]);
  const compare = (a: FieldValue, b: FieldValue): number => {
    if (type === 'number' || type === 'checkbox' || type === 'formula') return Number(a) - Number(b);
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

/** The required fields a record leaves empty, by key; the name is required always. */
export function missingFields(record: Pick<Record, 'name' | 'values'>, schema: Schema): string[] {
  const missing: string[] = [];
  if (!record.name.trim()) missing.push(NAME_KEY);
  for (const field of schema.fields) {
    if (field.key === NAME_KEY || field.key === CODE_KEY || !field.required) continue;
    if (isEmpty(record.values[field.key])) missing.push(field.key);
  }
  return missing;
}
