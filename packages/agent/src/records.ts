import {
  addRecord,
  type Board,
  type Collection,
  CONDITION_OPS,
  type Condition,
  type ConditionOp,
  type Field,
  type FieldValue,
  fieldValueOf,
  fold,
  isEmpty,
  type Link,
  linkTo,
  loadBoard,
  loadCollection,
  matchesConditions,
  problemText,
  readValue,
  type Record as CollectionRecord,
  recordProblems,
  type Schema,
  sortRecords,
  updateRecord,
  type VaultFs,
  withRollups,
} from '@scrawlnotes/core';
import { Refusal } from './paths';
import { type Agent, elementsOf, pickElement, pickRecord, pickSpace, todayOf } from './space';

// Collections: asking for records with conditions, and adding or changing one. A link is given
// by the name or the code of the record it points at; a value that does not fit its field is not
// refused but written and marked, as the app marks it. Formulas and rollups come worked out.

/** A field as the tools describe it. */
export function fieldOut(field: Field) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    ...(field.options && { options: field.options }),
    ...(field.required && { required: true }),
    ...(field.collection && { collection: field.collection }),
    ...(field.many && { many: true }),
    ...(field.formula && { formula: field.formula }),
    ...(field.rollup && { rollup: field.rollup }),
  };
}

/** The field `ref` names, by key or by label, in any case. */
export function pickField(fields: Field[], ref: string): Field {
  const wanted = fold(ref.trim());
  const found = fields.find((f) => fold(f.key) === wanted) ?? fields.find((f) => fold(f.label) === wanted);
  if (!found) throw new Refusal(`No field called ${ref}`, { fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) });
  return found;
}

/** A record as the tools give it: its values with formulas and rollups worked out, and what does not fit its schema. */
export function recordOut(record: CollectionRecord, schema: Schema, today: string) {
  const values: { [key: string]: FieldValue } = {};
  for (const field of schema.fields) {
    const value = fieldValueOf(record, field, schema, today);
    if (!isEmpty(value)) values[field.key] = value as FieldValue;
  }
  const problems = recordProblems(record, schema).map((problem) => {
    const field = schema.fields.find((f) => f.key === problem.field)!;
    return { field: problem.field, kind: problem.kind, text: problemText(problem, field, record) };
  });
  return {
    id: record.id,
    path: record.path,
    name: record.name,
    ...(record.code && { code: record.code }),
    values,
    ...(problems.length > 0 && { problems }),
    body: record.body,
  };
}

/** The other collections and the boards of a space, for rollups; read only. */
async function surroundings(fs: VaultFs, except: string): Promise<{ collections: Collection[]; boards: { [path: string]: Board } }> {
  const elements = await elementsOf(fs, ['collection', 'board']);
  const collections: Collection[] = [];
  const boards: { [path: string]: Board } = {};
  for (const element of elements) {
    if (element.kind === 'collection' && element.path !== except) {
      const collection = await loadCollection(fs, element.path, undefined, true).catch(() => null);
      if (collection) collections.push(collection);
    } else if (element.kind === 'board') boards[element.path] = await loadBoard(fs, element.path);
  }
  return { collections, boards };
}

/** A collection with its rollups worked out, when it has any. */
async function rolled(fs: VaultFs, collection: Collection, today: string): Promise<Collection> {
  if (!collection.schema.fields.some((f) => f.type === 'rollup')) return collection;
  const { collections, boards } = await surroundings(fs, collection.dir);
  return withRollups(collection, [collection, ...collections], boards, today);
}

export interface Where {
  field: string;
  op: string;
  value?: string | number | string[];
}

/** A condition as the agent wrote it, with the field by key or label and the op checked. */
function conditionOf(schema: Schema, where: Where): Condition {
  const field = pickField(schema.fields, where.field);
  if (!CONDITION_OPS.includes(where.op as ConditionOp)) throw new Refusal(`No condition op called ${where.op}`, { ops: CONDITION_OPS });
  return { field: field.key, op: where.op as ConditionOp, ...(where.value !== undefined && { value: where.value }) };
}

export async function recordsTool(agent: Agent, args: { space?: string; collection: string; where?: Where[]; sort?: { field: string; dir?: 'asc' | 'desc' }; limit?: number }) {
  const space = await pickSpace(agent, args.space);
  const element = await pickElement(space.fs, args.collection, ['collection'], 'collection');
  const today = todayOf(agent);
  const collection = await rolled(space.fs, await loadCollection(space.fs, element.path), today);
  const { schema } = collection;
  const conditions = (args.where ?? []).map((w) => conditionOf(schema, w));
  let records = collection.records.filter((r) => matchesConditions(r, schema, conditions, today));
  if (args.sort) records = sortRecords(records, schema, { key: pickField(schema.fields, args.sort.field).key, dir: args.sort.dir ?? 'asc' }, today);
  const limit = args.limit ?? 100;
  return {
    data: {
      space: space.id,
      collection: element.path,
      ...(schema.singular && { singular: schema.singular }),
      fields: schema.fields.map(fieldOut),
      total: records.length,
      records: records.slice(0, limit).map((r) => recordOut(r, schema, today)),
    },
  };
}

/** The links a value names: records of the field's collection, by name, code or id; refused when one is ambiguous. */
export async function resolveLinks(fs: VaultFs, field: Field, raw: unknown): Promise<Link | Link[] | null> {
  if (raw === null || raw === undefined || raw === '') return null;
  if (!field.collection) throw new Refusal(`The field ${field.label} has no collection to link to`);
  const target = await loadCollection(fs, field.collection).catch(() => null);
  if (!target) throw new Refusal(`The collection ${field.collection} that ${field.label} links to is not there`, { field: field.key });
  const refs = Array.isArray(raw) ? raw : [raw];
  const links: Link[] = [];
  for (const ref of refs) {
    if (typeof ref === 'string') links.push(linkTo(pickRecord(target, ref)));
    else if (ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'string') links.push(linkTo(pickRecord(target, (ref as { id: string }).id)));
    else throw new Refusal(`A link to ${field.label} is a record's name, code or id`, { field: field.key });
  }
  if (links.length === 0) return null;
  if (!field.many && links.length > 1) throw new Refusal(`${field.label} holds one record; ${links.length} were given`, { field: field.key });
  return field.many ? links : links[0]!;
}

/**
 * Values as the agent gave them, by field key or label, read as their fields hold them. What does
 * not fit its field goes to `extra`, to be written as it was and marked.
 */
export async function parseValues(fs: VaultFs, fields: Field[], given: { [key: string]: unknown }): Promise<{ values: { [key: string]: FieldValue }; extra: { [key: string]: unknown } }> {
  const values: { [key: string]: FieldValue } = {};
  const extra: { [key: string]: unknown } = {};
  for (const [name, raw] of Object.entries(given)) {
    const field = pickField(fields, name);
    if (field.type === 'formula' || field.type === 'rollup') throw new Refusal(`${field.label} is worked out, not written`, { field: field.key });
    if (field.type === 'link') {
      values[field.key] = await resolveLinks(fs, field, raw);
      continue;
    }
    if (raw === null || raw === undefined || raw === '') {
      values[field.key] = null;
      continue;
    }
    const value = readValue(field.type, raw, field.many);
    if (value === null) extra[field.key] = raw;
    else values[field.key] = value;
  }
  return { values, extra };
}

export async function saveRecordTool(agent: Agent, args: { space?: string; collection: string; id?: string; values?: { [key: string]: unknown }; body?: string }) {
  const space = await pickSpace(agent, args.space);
  const element = await pickElement(space.fs, args.collection, ['collection'], 'collection');
  const collection = await loadCollection(space.fs, element.path);
  const { schema } = collection;
  const { values, extra } = await parseValues(space.fs, schema.fields, args.values ?? {});
  let record: CollectionRecord;
  let created = false;
  if (args.id) {
    const found = pickRecord(collection, args.id);
    const kept = { ...found.extra };
    for (const key of Object.keys(values)) delete kept[key];
    record = await updateRecord(space.fs, schema, { ...found, extra: { ...kept, ...extra } }, { values, ...(args.body !== undefined && { body: args.body }) });
  } else {
    record = await addRecord(space.fs, collection, { values, ...(args.body !== undefined && { body: args.body }) });
    if (Object.keys(extra).length > 0) record = await updateRecord(space.fs, schema, { ...record, extra }, {});
    created = true;
  }
  const today = todayOf(agent);
  const shown = await rolled(space.fs, { ...collection, records: [record] }, today);
  return { data: { space: space.id, collection: element.path, created, record: recordOut(shown.records[0]!, schema, today) } };
}
