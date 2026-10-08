import { type Board } from './board';
import {
  type Collection,
  type Field,
  type FieldType,
  type FieldValue,
  fieldValueOf,
  isEmpty,
  isLink,
  linkTo,
  nameField,
  codeField,
  type NewRecord,
  type Record,
  recordLabel,
  type Schema,
} from './collection';
import { keyFor } from './fields';
import { withRollups } from './rollup';

// A collection as a CSV file and back, after the CSV views of design/mockups.html. Out: a column
// per field, the notes last, as the table shows the values. In: each column of the file goes to a
// field, a new field, the notes or nowhere; a row whose name matches a record updates it, the
// others are added. A value that does not fit its field goes into the file as it was, and is
// marked there as a hand-written one would be.

// ---------- the file ----------

/**
 * The rows of a CSV file: fields apart by commas, or by semicolons when the first line has more
 * of them (as a spreadsheet writes it where a comma is the decimal mark), quotes around a field
 * with either in it, doubled quotes for one. A byte order mark and the last empty line go.
 */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.slice(0, body.search(/\r?\n|$/));
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const sep = (outside.match(/;/g)?.length ?? 0) > (outside.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Rows as a CSV file: commas apart, quotes where a field needs them, lines ended as a spreadsheet does, and a byte order mark so that it reads the letters right. */
export function toCsv(rows: string[][]): string {
  const cell = (text: string) => (/[",\r\n;]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

// ---------- out ----------

/** A value as a CSV cell: a link by its record's name and code, choices joined with commas, a flag as yes or no, numbers as they are. */
function cellOf(value: FieldValue | undefined): string {
  if (isEmpty(value)) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (isLink(value)) return recordLabel(value);
  if (Array.isArray(value)) return value.map((v) => (isLink(v) ? recordLabel(v) : String(v))).join(', ');
  return String(value);
}

/** A collection as a CSV file: its fields' labels, then every record, formulas and rollups worked out, the notes last. */
export function collectionCsv(collection: Collection, collections: Collection[], boards: { [path: string]: Board }, notesLabel: string, today: string): string {
  const { schema, records } = withRollups(collection, collections, boards, today);
  const header = [...schema.fields.map((f) => f.label), notesLabel];
  const rows = records.map((r) => [...schema.fields.map((f) => cellOf(fieldValueOf(r, f, schema, today))), r.body.trim()]);
  return toCsv([header, ...rows]);
}

// ---------- in ----------

/** Where a column of the file goes: a field of the collection, a new field of a type, the notes, or nowhere. */
export type ColumnTarget = { field: string } | { add: FieldType } | { body: true } | { skip: true };

/** What an import does with the records already there: updates the ones whose name matches and adds the rest, or adds every row. */
export type ImportMode = 'update' | 'add';

/** The types a new field from a column can be. */
export const IMPORTED_TYPES: readonly FieldType[] = ['text', 'number', 'date', 'select', 'multi-select', 'checkbox', 'url', 'email', 'phone', 'person'];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DOTTED = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;

/** A number as people write it: `12000`, `12,000`, `12.000,50`, `1 200`. Null when it is not one. */
function numberOf(text: string): number | null {
  let t = text.replace(/[\s ]/g, '');
  if (!t) return null;
  const comma = t.lastIndexOf(',');
  const dot = t.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) t = comma > dot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  // Commas between groups of three group thousands (12,000); one comma otherwise is the decimal mark (12,5).
  else if (comma >= 0) t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** A day as people write it: `2026-10-14`, `14.10.2026`, `14/10/2026`. Null when it is not one. */
function dayOf(text: string): string | null {
  const t = text.trim();
  if (DAY.test(t)) return t;
  const m = DOTTED.exec(t);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), m[3]!];
  return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

/** The type a new field from a column takes: number, day or flag when every value is one, text otherwise. */
export function guessType(values: string[]): FieldType {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (filled.length === 0) return 'text';
  if (filled.every((v) => numberOf(v) !== null)) return 'number';
  if (filled.every((v) => dayOf(v) !== null)) return 'date';
  if (filled.every((v) => /^(yes|no|true|false)$/i.test(v))) return 'checkbox';
  return 'text';
}

const simple = (text: string) => text.trim().toLowerCase().replace(/[\s_-]+/g, ' ');

/**
 * Where each column of the file goes, as the import window starts: to the field whose label or
 * key is the column's name; to the name field for a column called something's name ("Company
 * name"), when none has the name itself; to the notes for Notes, Body or Description; nowhere for
 * an id ("Internal id"), which is another system's; and to a new field of the type its values
 * have otherwise.
 */
export function guessTargets(header: string[], rows: string[][], schema: Schema, notesLabel: string): ColumnTarget[] {
  const taken = new Set<string>();
  const usable = schema.fields.filter((f) => f.type !== 'formula' && f.type !== 'rollup');
  const exact = (n: string) => usable.find((f) => !taken.has(f.key) && (simple(f.label) === n || simple(f.key) === n));
  const names = header.map(simple);
  const named = nameField(schema);
  const nameTaken = !named || names.some((n) => n === simple(named.label) || n === simple(named.key));
  return header.map((name, i): ColumnTarget => {
    const n = names[i]!;
    const field = exact(n) ?? (named && !nameTaken && !taken.has(named.key) && n.endsWith(' name') ? named : undefined);
    if (field) {
      taken.add(field.key);
      return { field: field.key };
    }
    if ([simple(notesLabel), 'notes', 'note', 'body', 'description'].includes(n)) return { body: true };
    if (!n || n === 'id' || n.endsWith(' id')) return { skip: true };
    return { add: guessType(rows.map((r) => r[i] ?? '')) };
  });
}

/** A cell as a field of `field`'s type holds it; the text as it is when it does not fit, for the record to be marked. */
function valueOf(field: Field, text: string, targets: { [dir: string]: Record[] }): FieldValue {
  const t = text.trim();
  if (!t) return null;
  switch (field.type) {
    case 'number':
      return numberOf(t) ?? t;
    case 'date':
      return dayOf(t) ?? t;
    case 'checkbox':
      return /^(yes|true|1|x)$/i.test(t) ? true : /^(no|false|0)$/i.test(t) ? false : t;
    case 'multi-select':
      return [...new Set(t.split(/[,;]/).map((s) => s.trim()).filter(Boolean))];
    case 'link': {
      const records = field.collection ? (targets[field.collection] ?? []) : [];
      const names = field.many ? t.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [t];
      const links = names.map((name) => {
        // A cell exported as "Acme Corp · CUS-0012" finds its record too.
        const [label, code] = name.split(' · ');
        const found = records.find((r) => simple(r.name) === simple(label!) || (r.code && simple(r.code) === simple(code ?? label!)));
        return found ? linkTo(found) : { id: '', name };
      });
      return field.many ? links : links[0]!;
    }
    default:
      return t;
  }
}

/** What an import would do: the fields it adds, the records it adds and the ones it changes. */
export interface ImportPlan {
  schema: Schema;
  added: NewRecord[];
  updated: { id: string; values: Record['values']; body?: string }[];
}

/**
 * What importing the rows does with the collection: new fields for the columns sent to one, named
 * after the column; new choices for the values a choice field does not have yet; and for each row
 * a new record, or with `update` a change to the record whose name (else code) matches, an empty
 * cell leaving its field as it is.
 */
export function planImport(collection: Collection, header: string[], rows: string[][], columns: ColumnTarget[], mode: ImportMode, targets: { [dir: string]: Record[] }): ImportPlan {
  const fields = [...collection.schema.fields];
  const keys = new Set(fields.map((f) => f.key));
  const fieldOf = columns.map((target, i): Field | null => {
    if ('field' in target) return fields.find((f) => f.key === target.field) ?? null;
    if (!('add' in target)) return null;
    const label = header[i]!.trim() || `Column ${i + 1}`;
    const field: Field = { key: keyFor(label, keys), label, type: target.add, ...((target.add === 'select' || target.add === 'multi-select') && { options: [] }) };
    keys.add(field.key);
    fields.push(field);
    return field;
  });
  const bodyAt = columns.findIndex((target) => 'body' in target);
  // New choices, in the order they first come.
  for (const [i, field] of fieldOf.entries()) {
    if (!field || (field.type !== 'select' && field.type !== 'multi-select')) continue;
    const options = [...(field.options ?? [])];
    for (const row of rows) {
      const value = valueOf(field, row[i] ?? '', targets);
      for (const choice of Array.isArray(value) ? value : typeof value === 'string' ? [value] : []) if (typeof choice === 'string' && !options.includes(choice)) options.push(choice);
    }
    const at = fields.indexOf(field);
    fields[at] = { ...field, options };
    fieldOf[i] = fields[at]!;
  }
  const schema: Schema = { ...collection.schema, fields };
  const key = nameField(schema) ?? codeField(schema);
  const byKey = new Map(key && mode === 'update' ? collection.records.map((r) => [simple(String(r.values[key.key] ?? '')), r] as const).filter(([k]) => k) : []);
  const added: NewRecord[] = [];
  const updated: ImportPlan['updated'] = [];
  for (const row of rows) {
    const values: Record['values'] = {};
    fieldOf.forEach((field, i) => {
      if (!field) return;
      const value = valueOf(field, row[i] ?? '', targets);
      if (!isEmpty(value)) values[field.key] = value;
    });
    const body = bodyAt >= 0 ? (row[bodyAt] ?? '').trim() : '';
    const match = key ? byKey.get(simple(String(values[key.key] ?? ''))) : undefined;
    if (match) updated.push({ id: match.id, values, ...(body && { body }) });
    else added.push({ values, ...(body && { body }) });
  }
  return { schema, added, updated };
}

