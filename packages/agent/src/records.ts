import {
  type AskAnswers,
  type RowAnswer,
  addDays,
  calendarStarts,
  dayInToday,
  dueRecords,
  isDay,
  addRecord,
  type Board,
  BOARD_EXT,
  cardRecord,
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
  isLink,
  type Link,
  linkFieldsTo,
  linkTo,
  linkedRecords,
  linkedValues,
  linesBlocks,
  actionsOf,
  type ActionRule,
  clockOf,
  dateOf,
  loadBoard,
  loadCollection,
  loadList,
  pathNamed,
  newRecordId,
  planAction,
  planSave,
  planWords,
  recordWith,
  type RuleSpaceNow,
  RuleStop,
  savedWords,
  savesOf,
  changesOf,
  type SaveRun,
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
import { type Agent, elementsOf, nowOf, pickAcross, pickRecord, pickSpace, todayOf } from './space';
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
    ...(field.when && { when: field.when }),
    ...(field.suggest && { suggest: true }),
    ...(field.help && { help: field.help }),
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

/** What an agent gave for what a button asks, each answer as its question takes it: a link by its record's name, code or id. */
function answersFor(action: ActionRule | undefined, input: { [key: string]: unknown } | undefined, world: RuleSpaceNow, dir: string, recordId = ''): AskAnswers {
  const asks = action?.ask ?? [];
  const unknown = Object.keys(input ?? {}).filter((key) => !asks.some((a) => a.key === key));
  if (unknown.length > 0) throw new Refusal(asks.length > 0 ? `${action!.name} asks no ${unknown.join(', ')}; it asks ${asks.map((a) => a.key).join(', ')}` : `${action?.name ?? 'The button'} asks nothing; leave input out`);
  const out: AskAnswers = {};
  for (const a of asks) {
    const raw = input?.[a.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (a.type === 'rows') {
      // Rows by their name, their product's name, their code or id, each with its number: those left out come to 0.
      const path = pathNamed(world.collections.map((c) => c.dir), a.collection!, dir);
      const source = world.collections.find((c) => c.dir === path);
      const record = world.collections.find((c) => c.dir === dir)?.records.find((r) => r.id === recordId);
      if (!source || !record) throw new Refusal(`There is no collection called ${a.collection} for ${a.key}`);
      const rows = linkedRecords(source, dir, record);
      if (!Array.isArray(raw)) throw new Refusal(`${a.key} takes its rows as a list: [{ "row": "${rows[0]?.name ?? 'Rail'}", "count": 6 }]`);
      const given = new Map<string, { count: number; why: string | null }>();
      for (const item of raw as unknown[]) {
        const each = (item ?? {}) as { row?: unknown; count?: unknown; why?: unknown };
        const said = String(each.row ?? '').trim().toLowerCase();
        const row = rows.find((r) => r.id === each.row || r.name.toLowerCase() === said || r.code.toLowerCase() === said || Object.values(r.values).some((v) => isLink(v) && v.name.toLowerCase() === said));
        if (!row) throw new Refusal(`${a.key} has no row ${String(each.row)}; its rows are ${rows.map((r) => r.name).join(', ')}`);
        const count = typeof each.count === 'number' ? each.count : Number(each.count);
        if (!Number.isFinite(count) || count < 0) throw new Refusal(`${a.key} takes a count of 0 or more for each row`);
        if (each.why !== undefined && each.why !== null && !a.why?.options.includes(String(each.why))) throw new Refusal(`why is one of ${(a.why?.options ?? []).join(', ')}`);
        given.set(row.id, { count, why: each.why === undefined || each.why === null ? null : String(each.why) });
      }
      out[a.key] = rows.map((r): RowAnswer => ({ id: r.id, count: given.get(r.id)?.count ?? 0, ...(a.why && { why: given.get(r.id)?.why ?? null }) }));
      continue;
    }
    if (a.type === 'tick') {
      out[a.key] = raw === true || raw === 'true';
      continue;
    }
    if (a.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new Refusal(`${a.key} takes a number`);
      out[a.key] = n;
    } else if (a.type === 'choice') {
      if (!a.options!.includes(String(raw))) throw new Refusal(`${a.key} is one of ${a.options!.join(', ')}`);
      out[a.key] = String(raw);
    } else if (a.type === 'date') {
      const day = dateOf(String(raw), a.time);
      if (!day) throw new Refusal(a.time ? `${a.key} takes a day as YYYY-MM-DD, or with its time as YYYY-MM-DDTHH:mm` : `${a.key} takes a day as YYYY-MM-DD`);
      out[a.key] = day;
    } else if (a.type === 'time') {
      const clock = clockOf(String(raw));
      if (!clock) throw new Refusal(`${a.key} takes a time as HH:mm`);
      out[a.key] = clock;
    } else if (a.type === 'link') {
      const path = pathNamed([...world.collections.map((c) => c.dir), ...Object.keys(world.boards)], a.collection!, dir);
      const board = path ? world.boards[path] : undefined;
      const collection = board ? cardsAsCollection(path!, board) : world.collections.find((c) => c.dir === path);
      if (!collection) throw new Refusal(`There is no collection called ${a.collection} for ${a.key}`);
      out[a.key] = linkTo(pickRecord(collection, String(raw)));
    } else out[a.key] = String(raw);
  }
  return out;
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

/** Days asked for: from and to, each a day or left open; `due` today or upcoming as tasks have it. */
export interface DayRange {
  from?: string;
  to?: string;
  due?: 'today' | 'upcoming';
}

/** The days a range asks for, checked; null when it asks for none. */
function daysOf(args: DayRange, today: string): { from?: string; to?: string } | null {
  for (const day of [args.from, args.to]) if (day !== undefined && !isDay(day)) throw new Refusal(`${day} is not a day: write it as YYYY-MM-DD`);
  if (args.due === 'today') return { from: today, to: today };
  if (args.due === 'upcoming') return { from: addDays(today, 1), ...(args.to && { to: args.to }) };
  if (args.from === undefined && args.to === undefined) return null;
  return { ...(args.from && { from: args.from }), ...(args.to && { to: args.to }) };
}

const within = (day: string, days: { from?: string; to?: string }) => (!days.from || day >= days.from) && (!days.to || day <= days.to);

/** The field a collection's records are on a day by: the one its first Calendar view goes by, else its first date field. */
function dayField(schema: Schema): string | null {
  return schema.views?.find((v) => v.kind === 'calendar')?.calendar?.start ?? calendarStarts(schema.fields)[0]?.key ?? null;
}

export async function recordsTool(agent: Agent, args: { space?: string; collection: string; where?: Where[]; sort?: { field: string; dir?: 'asc' | 'desc' }; limit?: number } & DayRange) {
  const { space, element } = await pickAcross(agent, args.space, args.collection, ['collection'], 'collection');
  const today = todayOf(agent);
  const around = await surroundings(space.fs, element.path);
  const computer = new Computer([await loadCollection(space.fs, element.path), ...around.collections], around.boards, today);
  const collection = computer.withValues(element.path)!;
  const { schema } = collection;
  // A record's lines, an order's (design/app-home.md 4): where they are, and how many each record has.
  const lines = linesBlocks(schema, (path) => around.collections.find((c) => c.dir === path));
  const conditions = (args.where ?? []).map((w) => conditionOf(schema, w));
  let records = collection.records.filter((r) => matchesConditions(r, schema, conditions, today));
  const days = daysOf(args, today);
  if (days) {
    const key = dayField(schema);
    if (!key) throw new Refusal(`${element.path} has no date field to go by`);
    records = records.filter((r) => typeof r.values[key] === 'string' && within((r.values[key] as string).slice(0, 10), days));
  }
  if (args.sort) records = sortRecords(records, schema, { key: pickField(schema.fields, args.sort.field).key, dir: args.sort.dir ?? 'asc' }, today);
  const limit = args.limit ?? 100;
  return {
    data: {
      space: space.id,
      collection: element.path,
      ...(schema.singular && { singular: schema.singular }),
      fields: schema.fields.map(fieldOut),
      ...(lines.length > 0 && { lines: lines.map(({ source }) => source.dir) }),
      total: records.length,
      records: records.slice(0, limit).map((r) => ({
        ...recordOut(r, schema, today, computer.checks(element.path, r)),
        ...(lines.length > 0 && { lines: lines.reduce((n, { source }) => n + linkedRecords(source, element.path, r).length, 0) }),
      })),
    },
  };
}

/**
 * The links a value names: records of the field's collection, by name, code or id; refused when one
 * is ambiguous. With `within`, those of the record's group (`group`, its id) first: Can of this trip.
 */
/** A board's cards as a collection's records, for a link to pick one by its title or key. */
const cardsAsCollection = (path: string, board: Board): Collection => ({ dir: path, schema: { version: 2, template: 'blank', fields: [] }, records: board.cards.map((card) => cardRecord(path, board, card)) });

export async function resolveLinks(fs: VaultFs, field: Field, raw: unknown, group?: string): Promise<Link | Link[] | null> {
  if (raw === null || raw === undefined || raw === '') return null;
  if (!field.collection) throw new Refusal(`The field ${field.label} has no collection to link to`);
  // A link to a board points at its cards, by their title or key: an activity's deal (design/scrawl-apps.md 3.1).
  const all = field.collection.endsWith(BOARD_EXT) ? await loadBoard(fs, field.collection).then((board) => cardsAsCollection(field.collection!, board), () => null) : await loadCollection(fs, field.collection).catch(() => null);
  if (!all) throw new Refusal(`The collection ${field.collection} that ${field.label} links to is not there`, { field: field.key });
  const own = field.within && group ? all.records.filter((r) => [r.values[field.within!]].flat().some((l: unknown) => isLink(l) && l.id === group)) : [];
  const target = own.length > 0 ? { ...all, records: own } : all;
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
export async function parseValues(fs: VaultFs, fields: Field[], given: { [key: string]: unknown }, base: { [key: string]: FieldValue } = {}): Promise<{ values: { [key: string]: FieldValue }; extra: { [key: string]: unknown } }> {
  const values: { [key: string]: FieldValue } = {};
  const extra: { [key: string]: unknown } = {};
  // A link of the record's group after the group's own: who paid, of the trip given or held.
  const entries = Object.entries(given).map(([name, raw]) => ({ field: pickField(fields, name), raw }));
  entries.sort((a, b) => Number(!!a.field.within) - Number(!!b.field.within));
  for (const { field, raw } of entries) {
    if (isComputed(field.type)) throw new Refusal(`${field.label} is worked out, not written`, { field: field.key });
    if (field.type === 'link') {
      const group = field.within ? (values[field.within] ?? base[field.within] ?? null) : null;
      values[field.key] = await resolveLinks(fs, field, raw, isLink(group) ? group.id : undefined);
      continue;
    }
    if (raw === null || raw === undefined || raw === '') {
      values[field.key] = null;
      continue;
    }
    const value = readValue(field.type, raw, field.many, field.time, field.yearless);
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

export async function saveRecordTool(agent: Agent, args: { space?: string; collection: string; id?: string; values?: { [key: string]: unknown }; body?: string; subtasks?: SubtaskArg[]; lines?: { [key: string]: unknown }[]; another?: boolean; action?: string; input?: { [key: string]: unknown } }) {
  const { space, element } = await pickAcross(agent, args.space, args.collection, ['collection'], 'collection');
  const collection = await loadCollection(space.fs, element.path);
  const { schema } = collection;
  const { values, extra } = await parseValues(space.fs, schema.fields, args.values ?? {}, args.id ? pickRecord(collection, args.id).values : {});
  const today = todayOf(agent);
  const around = await surroundings(space.fs, element.path);
  const computer = new Computer([collection, ...around.collections], around.boards, today);
  const lines = args.lines ? await linesFor(space.fs, collection, around.collections, args.lines, !!args.id) : null;
  let record: CollectionRecord;
  let created = false;
  // What the collection runs as a record is saved runs before it is written, as in the app.
  const me = (await agent.person())?.name || undefined;
  const saving = savesOf(collection.rules).length > 0 || changesOf(collection.rules).length > 0;
  let ran: SaveRun | null = null;
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
    if (saving && (given || !args.action)) ran = planSave(element.path, { ...found, values: { ...found.values, ...values } }, found, await ruleSpaceNow(space.fs, today, me));
    record = given || !args.action ? await updateRecord(space.fs, schema, { ...found, extra: { ...kept, ...extra } }, { values: ran ? ran.values : values, ...(args.body !== undefined && { body: args.body }), ...(subtasks && { subtasks }) }) : found;
  } else {
    const holder = codeHolder(undefined);
    if (holder) throw new Refusal(`${holder.name || holder.id} already has the code ${holder.code}; a code belongs to one record`, { record: { id: holder.id, name: holder.name, code: holder.code } });
    const subtasks = args.subtasks ? await applySubtasks(space, [], args.subtasks, nowOf(agent)) : undefined;
    // The fields not given take their defaults, a later one reading what is given; what is given, even empty, stays.
    const made = computer.defaults(element.path, Object.fromEntries(Object.entries(values).filter(([, v]) => !isEmpty(v))), me);
    for (const key of Object.keys(values)) made[key] = values[key]!;
    for (const key of Object.keys(extra)) delete made[key];
    const id = newRecordId();
    if (saving) ran = planSave(element.path, recordWith(collection, id, made), null, await ruleSpaceNow(space.fs, today, me));
    record = await addRecord(space.fs, collection, { values: ran ? ran.values : made, ...(args.body !== undefined && { body: args.body }), ...(subtasks?.length && { subtasks }) }, id);
    if (Object.keys(extra).length > 0) record = await updateRecord(space.fs, schema, { ...record, extra }, {});
    created = true;
  }
  // Its lines come right after it, each holding it, before what the rules do elsewhere: as the app's new record writes them.
  const written: CollectionRecord[] = [];
  const lineStops: string[] = [];
  if (lines) {
    const { source } = lines;
    const world = savesOf(source.rules).length > 0 || changesOf(source.rules).length > 0 ? await ruleSpaceNow(space.fs, today, me) : null;
    for (const line of lines.lines) {
      const given = { ...linkedValues(source.schema, element.path, record, schema), ...Object.fromEntries(Object.entries(line.values).filter(([, v]) => !isEmpty(v))) };
      const made = computer.defaults(source.dir, given, me);
      for (const key of Object.keys(line.values)) made[key] = line.values[key]!;
      for (const key of Object.keys(line.extra)) delete made[key];
      // What its collection runs on save runs on it, as on a line added on its own: its product's name and price.
      const id = newRecordId();
      const saved = world ? planSave(source.dir, recordWith(source, id, made), null, world) : null;
      let added = await addRecord(space.fs, source, { values: saved ? saved.values : made }, id);
      if (Object.keys(line.extra).length > 0) added = await updateRecord(space.fs, source.schema, { ...added, extra: line.extra }, {});
      if (saved && saved.after.changes.length > 0) await writePlan(space.fs, saved.after, world!, () => nowOf(agent), me);
      lineStops.push(...(saved?.stops ?? []).map((s) => `${s.name} stopped on line ${s.line} of the rules of ${source.dir}: ${s.message} The line was saved as given; what it does was left out.`));
      written.push(added);
    }
  }
  // What the rules did elsewhere is written right after the record, the space read again for it.
  let onSave: { did?: string; stopped?: string[] } | undefined;
  if (ran && (ran.after.changes.length > 0 || ran.stops.length > 0)) {
    const world = await ruleSpaceNow(space.fs, today, me);
    if (ran.after.changes.length > 0) await writePlan(space.fs, ran.after, world, () => nowOf(agent), me);
    const did = savedWords(ran.after, world);
    const stopped = ran.stops.map((s) => `${s.name} stopped on line ${s.line} of the rules: ${s.message} The record was saved as given; what it does was left out.`);
    onSave = { ...(did && { did }), ...(stopped.length > 0 && { stopped }) };
  }
  if (lineStops.length > 0) onSave = { ...onSave, stopped: [...(onSave?.stopped ?? []), ...lineStops] };
  if (args.action) {
    // The button runs on the record as written, as in the app; what it does is written at once.
    const world = await ruleSpaceNow(space.fs, today, me);
    const home = world.collections.find((c) => c.dir === element.path);
    let pressed: { action: string; done: string; changes: string[]; stopped?: string[] };
    try {
      if (!home?.rules) throw new RuleStop(`There is no button called ${args.action} in the rules of ${element.path}.`, 0);
      const answers = answersFor(actionsOf(home.rules).find((a) => a.name === args.action), args.input, world, element.path, record.id);
      const plan = planAction(home.rules, args.action, element.path, record.id, world, answers);
      const words = planWords(plan, world);
      await writePlan(space.fs, plan, world, () => nowOf(agent), me);
      const stopped = (plan.stops ?? []).map((s) => `${s.name} stopped on line ${s.line} of the rules: ${s.message} What it does was left out.`);
      pressed = { action: plan.action, done: words.done, changes: words.ask.map((line) => (line.head ? line.text.toUpperCase() : line.names ? `${line.text}: ${line.names}` : line.text)), ...(stopped.length > 0 && { stopped }) };
    } catch (error) {
      if (!(error instanceof RuleStop)) throw error;
      const saved = created ? ` The record was added (${record.id}).` : '';
      throw new Refusal(`${args.action} stopped${error.line > 0 ? ` on line ${error.line} of the rules` : ''}: ${error.message} Nothing of it was written.${saved}`);
    }
    const now = await loadCollection(space.fs, element.path);
    const written = now.records.find((r) => r.id === record.id) ?? record;
    // The boards as the button left them too: a card it added counts in a rollup.
    const { collections, boards } = await surroundings(space.fs, element.path);
    const after = new Computer([now, ...collections], boards, today);
    return { data: { space: space.id, collection: element.path, created, onSave, action: pressed, record: recordsOut(after, now, [written], today)[0]! } };
  }
  // Worked out again with the record as written, and its lines, for what links to it and what it reads.
  const others = around.collections.map((c) => (lines && c.dir === lines.source.dir ? { ...c, records: [...c.records, ...written] } : c));
  const after = new Computer([{ ...collection, records: [...collection.records.filter((r) => r.id !== record.id), record] }, ...others], around.boards, today);
  const linesOut = lines ? { lines: { collection: lines.source.dir, records: recordsOut(after, lines.source, written, today) } } : {};
  return { data: { space: space.id, collection: element.path, created, onSave, record: recordsOut(after, collection, [record], today)[0]!, ...linesOut } };
}

/**
 * A new record's lines as the agent gave them, read before anything is written (design/app-home.md
 * 4): each by field key or label, the link to the record left out, since it is the record.
 */
async function linesFor(fs: VaultFs, collection: Collection, collections: Collection[], given: { [key: string]: unknown }[], changing: boolean) {
  const blocks = linesBlocks(collection.schema, (path) => collections.find((c) => c.dir === path));
  if (blocks.length === 0) throw new Refusal(`The records of ${collection.dir} have no lines; nothing was written`);
  if (blocks.length > 1) throw new Refusal(`The records of ${collection.dir} have lines in more than one collection; nothing was written. Add the record, then each line with save_record in its collection`, { lines: blocks.map(({ source }) => source.dir) });
  const { source } = blocks[0]!;
  const back = linkFieldsTo(source.schema, collection.dir);
  if (changing) throw new Refusal(`lines come with a new record; nothing was written. To add a line to it, use save_record in ${source.dir} with ${back[0]?.label ?? 'its link'} holding the record`);
  const lines: { values: { [key: string]: FieldValue }; extra: { [key: string]: unknown } }[] = [];
  for (const line of given) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new Refusal('A line is its values by field key or label; nothing was written');
    for (const name of Object.keys(line)) {
      const field = pickField(source.schema.fields, name);
      if (back.includes(field)) throw new Refusal(`${field.label} of a line is the record it comes with; leave it out. Nothing was written`, { field: field.key });
    }
    lines.push(await parseValues(fs, source.schema.fields, line));
  }
  return { source, lines };
}

/**
 * What the calendars that show in Today and Upcoming bring there, with no collection named: in the
 * space named, else in every space; today's, those of the days asked for, or from today on. Each
 * record with its collection, the view that brings it, its start, and its end or its length.
 */
export async function dueRecordsTool(agent: Agent, args: { space?: string; limit?: number } & DayRange) {
  const spaces = args.space?.trim() ? [await pickSpace(agent, args.space)] : await agent.spaces();
  const across = spaces.length > 1;
  const today = todayOf(agent);
  const days = daysOf(args, today) ?? { from: today };
  const out: object[] = [];
  for (const space of spaces) {
    const { collections, boards } = await ruleSpaceNow(space.fs, today, undefined);
    const shown = collections.filter((c) => c.schema.views?.some((v) => v.kind === 'calendar' && v.calendar?.upcoming));
    if (shown.length === 0) continue;
    const computer = new Computer(collections, boards, today);
    // A program's days (design/gym.md 4.3) are worked out to the last day asked for; one gone by with nothing closing it is late, said with its day.
    for (const due of dueRecords(
      shown.map((c) => computer.withValues(c.dir)!),
      today,
      { all: collections, ...(days.to && { until: days.to }) },
    )) {
      if (!within(dayInToday(due, today), days)) continue;
      out.push({
        ...(across && { space: space.id, spaceName: space.name }),
        collection: due.collection,
        view: due.view.name,
        start: due.start,
        ...(due.end && { end: due.end }),
        ...(due.minutes && { minutes: due.minutes }),
        ...(due.day && { day: due.day, ...(due.late && { late: true }) }),
        record: recordOut(due.record, due.schema, today, computer.checks(due.collection, due.record)),
      });
    }
  }
  const limit = args.limit ?? 100;
  return { data: { today, total: out.length, records: out.slice(0, limit) } };
}
