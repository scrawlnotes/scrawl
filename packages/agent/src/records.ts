import {
  addRecord,
  type Board,
  type Collection,
  Computer,
  CONDITION_OPS,
  type Condition,
  type ConditionOp,
  type Field,
  type FieldValue,
  fieldValueOf,
  fold,
  isComputed,
  isEmpty,
  type Link,
  linkTo,
  loadBoard,
  loadCollection,
  loadList,
  planAction,
  planWords,
  type RuleSpaceNow,
  RuleStop,
  type Task,
  writePlan,
  matchesConditions,
  problemText,
  readValue,
  type Record as CollectionRecord,
  type RecordProblem,
  recordProblems,
  type Schema,
  sortRecords,
  updateRecord,
  type VaultFs,
} from '@scrawlnotes/core';
import { Refusal } from './paths';
import { type Agent, elementsOf, nowOf, pickAcross, pickRecord, todayOf } from './space';
import { applySubtasks, type SubtaskArg, subtaskOut } from './subtasks';

// Collections: asking for records with conditions, and adding or changing one. A link is given
// by the name or the code of the record it points at; a value that does not fit its field is not
// refused but written and marked, as the app marks it, and so is a record failing a check of its
// collection's rules. Formulas and rollups come worked out; a new record gets the defaults of the
// fields not given.

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
    ...(field.lookup && { lookup: field.lookup }),
    ...(field.default !== undefined && { default: field.default }),
    ...(field.format && { format: field.format }),
  };
}

/** The field `ref` names, by key or by label, in any case. */
export function pickField(fields: Field[], ref: string): Field {
  const wanted = fold(ref.trim());
  const found = fields.find((f) => fold(f.key) === wanted) ?? fields.find((f) => fold(f.label) === wanted);
  if (!found) throw new Refusal(`No field called ${ref}`, { fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) });
  return found;
}

/** A record as the tools give it: its values with what is worked out (formulas, lookups, rollups) worked out, what does not fit its schema and the checks it fails. */
export function recordOut(record: CollectionRecord, schema: Schema, today: string, checks: RecordProblem[] = []) {
  const values: { [key: string]: FieldValue } = {};
  for (const field of schema.fields) {
    const value = fieldValueOf(record, field, schema, today);
    if (!isEmpty(value)) values[field.key] = value as FieldValue;
  }
  const problems = [...recordProblems(record, schema), ...checks].map((problem) => {
    const field = schema.fields.find((f) => f.key === problem.field);
    return { ...(problem.field && { field: problem.field }), kind: problem.kind, text: problemText(problem, field, record) };
  });
  return {
    id: record.id,
    path: record.path,
    name: record.name,
    ...(record.code && { code: record.code }),
    values,
    ...(problems.length > 0 && { problems }),
    ...(record.subtasks?.length && { subtasks: record.subtasks.map(subtaskOut) }),
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

/** The space as a button sees it: every collection with its rules, every board, every task list. */
async function ruleSpaceNow(fs: VaultFs, today: string, me: string | undefined): Promise<RuleSpaceNow> {
  const collections: Collection[] = [];
  const boards: { [path: string]: Board } = {};
  const lists: { [path: string]: Task[] } = {};
  for (const element of await elementsOf(fs, ['collection', 'board', 'tasks'])) {
    if (element.kind === 'collection') {
      const collection = await loadCollection(fs, element.path, undefined, true).catch(() => null);
      if (collection) collections.push(collection);
    } else if (element.kind === 'board') {
      const board = await loadBoard(fs, element.path).catch(() => null);
      if (board) boards[element.path] = board;
    } else lists[element.path] = (await loadList(fs, element.path).catch(() => null))?.tasks ?? [];
  }
  return { collections, boards, lists, today, ...(me && { me }) };
}

/** What works out a collection's records with the space around it: formulas (which may read a linked record's field), lookups, rollups, its checks, a new record's defaults. */
async function computerAround(fs: VaultFs, collection: Collection, today: string): Promise<Computer> {
  const { collections, boards } = await surroundings(fs, collection.dir);
  return new Computer([collection, ...collections], boards, today);
}

/** Records as the tools give them, each with what is worked out and the checks it fails. */
function recordsOut(computer: Computer, collection: Collection, records: CollectionRecord[], today: string) {
  return records.map((r) => recordOut({ ...r, values: computer.values(collection.dir, r) }, collection.schema, today, computer.checks(collection.dir, r)));
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
  const { space, element } = await pickAcross(agent, args.space, args.collection, ['collection'], 'collection');
  const today = todayOf(agent);
  const computer = await computerAround(space.fs, await loadCollection(space.fs, element.path), today);
  const collection = computer.withValues(element.path)!;
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
      records: records.slice(0, limit).map((r) => recordOut(r, schema, today, computer.checks(element.path, r))),
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
    if (isComputed(field.type)) throw new Refusal(`${field.label} is worked out, not written`, { field: field.key });
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

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/**
 * The records already called what a new one would be called, by name or by code: a cut-off call
 * sent again must not add a second Acme Corp, and a person's list rarely means to hold two.
 */
function twinsOf(collection: Collection, values: { [key: string]: FieldValue }): { what: string; records: CollectionRecord[] } | null {
  for (const type of ['name', 'code'] as const) {
    const field = collection.schema.fields.find((f) => f.type === type);
    const wanted = field ? values[field.key] : undefined;
    if (typeof wanted !== 'string' || !wanted.trim()) continue;
    const records = collection.records.filter((r) => (type === 'name' ? r.name && same(r.name, wanted) : r.code && same(r.code, wanted)));
    if (records.length > 0) return { what: wanted.trim(), records };
  }
  return null;
}

export async function saveRecordTool(agent: Agent, args: { space?: string; collection: string; id?: string; values?: { [key: string]: unknown }; body?: string; subtasks?: SubtaskArg[]; another?: boolean; action?: string }) {
  const { space, element } = await pickAcross(agent, args.space, args.collection, ['collection'], 'collection');
  const collection = await loadCollection(space.fs, element.path);
  const { schema } = collection;
  const { values, extra } = await parseValues(space.fs, schema.fields, args.values ?? {});
  const today = todayOf(agent);
  const around = await surroundings(space.fs, element.path);
  const computer = new Computer([collection, ...around.collections], around.boards, today);
  let record: CollectionRecord;
  let created = false;
  const twins = args.id || args.another ? null : twinsOf(collection, values);
  if (twins) {
    const shown = (r: CollectionRecord) => ({ id: r.id, name: r.name, ...(r.code && { code: r.code }), path: r.path });
    if (twins.records.length > 1) throw new Refusal(`More than one record is already called ${twins.what}; nothing was added. Give id to change one of them, or another: true to add one more`, { candidates: twins.records.map(shown) });
    const found = twins.records[0]!;
    return {
      data: {
        space: space.id,
        collection: element.path,
        created: false,
        exists: true,
        message: `A record called ${twins.what} is already there; nothing was added. To change it, give its id ${found.id}; to add a second one with this name on purpose, pass another: true.`,
        record: recordsOut(computer, collection, [found], today)[0]!,
      },
    };
  }
  // A code says which record it is: two records with one code make a link by code ambiguous.
  const codeField = schema.fields.find((f) => f.type === 'code');
  const code = codeField ? values[codeField.key] : undefined;
  const codeHolder = (self: string | undefined) => (typeof code === 'string' && code.trim() ? collection.records.find((r) => r.id !== self && r.code && same(r.code, code)) : undefined);
  if (args.id) {
    const found = pickRecord(collection, args.id);
    const holder = codeHolder(found.id);
    if (holder) throw new Refusal(`${holder.name || holder.id} already has the code ${holder.code}; a code belongs to one record`, { record: { id: holder.id, name: holder.name, code: holder.code } });
    const kept = { ...found.extra };
    for (const key of Object.keys(values)) delete kept[key];
    const subtasks = args.subtasks ? await applySubtasks(space, found.subtasks ?? [], args.subtasks, nowOf(agent)) : undefined;
    // A button pressed on a record as it is writes nothing of the record's own first.
    const given = Object.keys(values).length > 0 || Object.keys(extra).length > 0 || args.body !== undefined || !!subtasks;
    record = given || !args.action ? await updateRecord(space.fs, schema, { ...found, extra: { ...kept, ...extra } }, { values, ...(args.body !== undefined && { body: args.body }), ...(subtasks && { subtasks }) }) : found;
  } else {
    const holder = codeHolder(undefined);
    if (holder) throw new Refusal(`${holder.name || holder.id} already has the code ${holder.code}; a code belongs to one record`, { record: { id: holder.id, name: holder.name, code: holder.code } });
    const subtasks = args.subtasks ? await applySubtasks(space, [], args.subtasks, nowOf(agent)) : undefined;
    // The fields not given take their defaults, a later one reading what is given; what is given, even empty, stays.
    const made = computer.defaults(element.path, Object.fromEntries(Object.entries(values).filter(([, v]) => !isEmpty(v))), (await agent.person())?.name || undefined);
    for (const key of Object.keys(values)) made[key] = values[key]!;
    for (const key of Object.keys(extra)) delete made[key];
    record = await addRecord(space.fs, collection, { values: made, ...(args.body !== undefined && { body: args.body }), ...(subtasks?.length && { subtasks }) });
    if (Object.keys(extra).length > 0) record = await updateRecord(space.fs, schema, { ...record, extra }, {});
    created = true;
  }
  if (args.action) {
    // The button runs on the record as written, as in the app; what it does is written at once.
    const me = (await agent.person())?.name || undefined;
    const world = await ruleSpaceNow(space.fs, today, me);
    const home = world.collections.find((c) => c.dir === element.path);
    let ran: { action: string; done: string; changes: string[] };
    try {
      if (!home?.rules) throw new RuleStop(`There is no button called ${args.action} in the rules of ${element.path}.`, 0);
      const plan = planAction(home.rules, args.action, element.path, record.id, world);
      const words = planWords(plan, world);
      await writePlan(space.fs, plan, world, () => nowOf(agent), me);
      ran = { action: plan.action, done: words.done, changes: words.ask.map((line) => (line.names ? `${line.text}: ${line.names}` : line.text)) };
    } catch (error) {
      if (!(error instanceof RuleStop)) throw error;
      const saved = created ? ` The record was added (${record.id}).` : '';
      throw new Refusal(`${args.action} stopped${error.line > 0 ? ` on line ${error.line} of the rules` : ''}: ${error.message} Nothing of it was written.${saved}`);
    }
    const now = await loadCollection(space.fs, element.path);
    const written = now.records.find((r) => r.id === record.id) ?? record;
    const { collections } = await surroundings(space.fs, element.path);
    const after = new Computer([now, ...collections], around.boards, today);
    return { data: { space: space.id, collection: element.path, created, action: ran, record: recordsOut(after, now, [written], today)[0]! } };
  }
  // Worked out again with the record as written, for what links to it and what it reads.
  const after = new Computer([{ ...collection, records: [...collection.records.filter((r) => r.id !== record.id), record] }, ...around.collections], around.boards, today);
  return { data: { space: space.id, collection: element.path, created, record: recordsOut(after, collection, [record], today)[0]! } };
}
