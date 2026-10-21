import {
  BOARD_EXT,
  type ColumnKind,
  COLUMN_KINDS,
  CONDITION_OPS,
  type ConditionOp,
  cleanFieldKey,
  defaultProblem,
  dirname,
  type Field,
  FIELD_TYPES,
  type FieldType,
  FORMAT_STYLES,
  formulaProblem,
  isComputed,
  isDay,
  loadBoard,
  loadSchema,
  mixedCurrency,
  type NumberFormat,
  parseSchema,
  ROLLUP_FNS,
  type RollupFn,
  rulesProblems,
  schemaPath,
  type VaultFs,
} from '@scrawlnotes/core';
import { type FileKind } from './paths';
import { elementsOf } from './space';

// What is wrong with a schema, a task list or a board an agent writes whole, one thing at a time,
// so that it can mend them: the app would read such a file its own way, and its next save would
// lose what it could not read. What only points at something not made yet, a link to a collection
// or a rollup from a board, is said and written: a template makes such a schema too.

type Json = { [key: string]: unknown };

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const filled = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

export interface Checked {
  /** What keeps the file from being written. */
  problems: string[];
  /** What is written but worth saying. */
  notes: string[];
}

/** What must be mended before `data`, the file `text` read, is written as a file of `kind`, and what is only worth saying. */
export async function checkFile(fs: VaultFs, kind: FileKind, data: Json, text: string): Promise<Checked> {
  if (kind === 'schema') return checkSchema(fs, data, text);
  if (kind === 'tasks') return { problems: checkTasks(data), notes: [] };
  if (kind === 'board') return { problems: checkBoard(data), notes: [] };
  return { problems: [], notes: [] };
}

/** The space's collections and boards, and where the fields of each are found: for lookups, a formula's dot, a rollup's conditions, a rule's linked record. */
async function fieldsAround(fs: VaultFs): Promise<{ there: Set<string>; schemaOf: (path: string) => { fields: Field[] } | undefined }> {
  const elements = await elementsOf(fs, ['collection', 'board']);
  const fieldsAt = new Map<string, Field[]>();
  for (const element of elements) {
    try {
      fieldsAt.set(element.path, element.path.endsWith(BOARD_EXT) ? ((await loadBoard(fs, element.path)).fields ?? []) : (await loadSchema(fs, element.path)).fields);
    } catch {
      // A file that cannot be read says nothing of its fields.
    }
  }
  return { there: new Set(elements.map((e) => e.path)), schemaOf: (path) => (fieldsAt.has(path) ? { fields: fieldsAt.get(path)! } : undefined) };
}

/**
 * What is wrong with a collection's rules file, each with its line: one that is not beside a
 * schema, one that cannot be read, a check of a field that is not there or that cannot be worked out.
 */
export async function checkRules(fs: VaultFs, path: string, text: string): Promise<string[]> {
  const dir = dirname(path);
  const schema = await loadSchema(fs, dir).catch(() => null);
  if (!schema || (await fs.stat?.(schemaPath(dir))) === null) return [`A rules file goes in a collection's folder, beside its _collection.json; ${dir || 'this folder'} is not a collection`];
  const { schemaOf } = await fieldsAround(fs);
  return rulesProblems(text, { fields: schema.fields, schemaOf }).map((p) => `Line ${p.line}: ${p.message}`);
}

/** What is wrong with a number's format as written. */
function formatProblems(key: string, raw: unknown, type: unknown, keys: unknown[]): string[] {
  if (raw === undefined) return [];
  if (type !== 'number' && !isComputed(type as FieldType)) return [`${key}: format is for numbers, and for formulas, lookups and rollups giving one`];
  if (!isObject(raw)) return [`${key}: format is { style, currency or currencyField, decimals }`];
  const problems: string[] = [];
  if (!FORMAT_STYLES.includes(raw.style as NumberFormat['style'])) problems.push(`${key}: format.style is one of ${FORMAT_STYLES.join(', ')}`);
  if (raw.decimals !== undefined && !(typeof raw.decimals === 'number' && Number.isInteger(raw.decimals) && raw.decimals >= 0 && raw.decimals <= 4)) problems.push(`${key}: format.decimals is 0 to 4`);
  if (raw.style === 'currency') {
    if (raw.currencyField !== undefined) {
      if (!filled(raw.currencyField) || !keys.includes(raw.currencyField)) problems.push(`${key}: format.currencyField is the key of this collection's field that holds each record's currency code`);
    } else if (!(typeof raw.currency === 'string' && /^[A-Za-z]{3}$/.test(raw.currency))) problems.push(`${key}: a currency format takes currency, a code like TRY or EUR, or currencyField`);
  }
  return problems;
}

async function checkSchema(fs: VaultFs, data: Json, text: string): Promise<Checked> {
  const problems: string[] = [];
  const notes: string[] = [];
  const { there, schemaOf } = await fieldsAround(fs);
  const own = Array.isArray(data.fields) ? (data.fields as unknown[]).filter(isObject) : [];
  const keys = new Set<string>();
  let names = 0;
  let codes = 0;
  (data.fields as unknown[]).forEach((field, i) => {
    if (!isObject(field) || !filled(field.key)) return void problems.push(`Field ${i + 1} has no key`);
    const { key, type } = field;
    if (cleanFieldKey(key) !== key) problems.push(`The key ${key} is not one: a key is lowercase letters, digits and _, like ${cleanFieldKey(key) || 'segment'}`);
    if (keys.has(key)) problems.push(`The key ${key} is there twice; each field has its own`);
    keys.add(key);
    if (!FIELD_TYPES.includes(type as FieldType)) problems.push(`${key} has the type ${JSON.stringify(type)}, which is none of ${FIELD_TYPES.join(', ')}`);
    if (type === 'name') names++;
    if (type === 'code') codes++;
    problems.push(...formatProblems(key, field.format, type, own.map((f) => f.key)));
    if (field.default !== undefined) {
      if (isComputed(type as FieldType)) problems.push(`${key} is worked out and takes no default`);
      else if (!['string', 'number', 'boolean'].includes(typeof field.default) && !(Array.isArray(field.default) && field.default.every((v) => typeof v === 'string'))) {
        problems.push(`${key}: default is a value the field holds, or "=" and a formula: "=today()", "=next(\\"PRJ-\\", 4)"`);
      }
    }
    if ((type === 'select' || type === 'multi-select') && field.options !== undefined && !(Array.isArray(field.options) && field.options.every((o) => typeof o === 'string'))) {
      problems.push(`The options of ${key} are a list of words`);
    }
    if (type === 'link') {
      if (!filled(field.collection)) problems.push(`${key} is a link with no collection to link to`);
      else if (!there.has(field.collection)) notes.push(`${key} links to ${field.collection}, which is not a collection in this space yet`);
    }
    if (type === 'rollup') {
      const rollup = isObject(field.rollup) ? field.rollup : {};
      if (!filled(rollup.from)) problems.push(`${key} is a rollup with nothing to roll up from: rollup.from is a collection or a board`);
      else if (!there.has(rollup.from)) notes.push(`${key} rolls up from ${rollup.from}, which is not in this space yet`);
      if (!ROLLUP_FNS.includes(rollup.fn as RollupFn)) problems.push(`${key}: rollup.fn is one of ${ROLLUP_FNS.join(', ')}`);
      else if (rollup.fn !== 'count' && !filled(rollup.field)) problems.push(`${key}: a rollup with ${String(rollup.fn)} needs rollup.field, the field it works out`);
      const source = filled(rollup.from) ? schemaOf(rollup.from) : undefined;
      if (rollup.where !== undefined) {
        if (!Array.isArray(rollup.where)) problems.push(`${key}: rollup.where is a list of conditions, { field, op, value }`);
        else {
          rollup.where.forEach((c, j) => {
            if (!isObject(c) || !filled(c.field)) return void problems.push(`${key}: condition ${j + 1} of rollup.where needs a field, the key of a field of ${String(rollup.from)}`);
            if (!CONDITION_OPS.includes(c.op as ConditionOp)) problems.push(`${key}: the op of condition ${j + 1} is one of ${CONDITION_OPS.join(', ')}`);
            if (source && !source.fields.some((f) => f.key === c.field)) problems.push(`${key}: ${String(rollup.from)} has no field with the key ${c.field}`);
          });
        }
      }
    }
    if (type === 'lookup') {
      const lookup = isObject(field.lookup) ? field.lookup : {};
      const link = own.find((f) => f.key === lookup.link);
      if (!filled(lookup.link)) problems.push(`${key} is a lookup with no link: lookup.link is the key of a link field of this collection`);
      else if (!link || link.type !== 'link') problems.push(`${key}: lookup.link is ${lookup.link}, which is not a link field of this collection`);
      if (!filled(lookup.field)) problems.push(`${key}: lookup.field is the key of the linked record's field it shows`);
      else if (link && filled(link.collection)) {
        const target = schemaOf(link.collection);
        if (target && !target.fields.some((f) => f.key === lookup.field)) problems.push(`${key}: ${link.collection} has no field with the key ${lookup.field}`);
      }
    }
  });
  if (names > 1) problems.push('There is more than one name field; a collection has one at most');
  if (codes > 1) problems.push('There is more than one code field; a collection has one at most');
  const schema = parseSchema(text);
  for (const field of schema.fields) {
    const problem = field.type === 'formula' ? formulaProblem(field.formula ?? '', schema, field.key, schemaOf) : null;
    if (problem) problems.push(`${field.key}: ${problem}`);
    const wrong = defaultProblem(field, schema, schemaOf);
    if (wrong) problems.push(`${field.key}: default: ${wrong}`);
    const mixed = mixedCurrency(field, schemaOf);
    if (mixed) notes.push(`${field.key}: ${mixed}`);
  }
  return { problems, notes };
}

function checkTasks(data: Json): string[] {
  const problems: string[] = [];
  const sections = data.sections ?? [];
  if (!Array.isArray(sections)) return ['"sections" is a list'];
  const sectionIds = new Set<string>();
  sections.forEach((section, i) => {
    if (!isObject(section) || !filled(section.id) || !filled(section.name)) return void problems.push(`Section ${i + 1} needs an id and a name`);
    if (sectionIds.has(section.id)) problems.push(`The section id ${section.id} is there twice`);
    sectionIds.add(section.id);
  });
  const tasks = data.tasks as unknown[];
  const all = new Set(tasks.flatMap((task) => (isObject(task) && filled(task.id) ? [task.id] : [])));
  const ids = new Set<string>();
  tasks.forEach((task, i) => {
    if (!isObject(task) || !filled(task.id) || !filled(task.title)) return void problems.push(`Task ${i + 1} needs an id and a title`);
    const name = task.title;
    if (ids.has(task.id)) problems.push(`The task id ${task.id} is there twice (${name})`);
    ids.add(task.id);
    if (task.parent !== undefined && task.parent !== null && !(typeof task.parent === 'string' && all.has(task.parent))) problems.push(`${name} is under ${String(task.parent)}, which is not a task in this list`);
    if (task.section !== undefined && task.section !== null && !(typeof task.section === 'string' && sectionIds.has(task.section))) problems.push(`${name} is in the section ${String(task.section)}, which is not in "sections"`);
    if (task.due !== undefined && task.due !== null && !(typeof task.due === 'string' && isDay(task.due))) problems.push(`${name} is due ${JSON.stringify(task.due)}: a day on the calendar as YYYY-MM-DD, or null`);
    if (task.priority !== undefined && ![1, 2, 3, 4].includes(task.priority as number)) problems.push(`${name} has the priority ${JSON.stringify(task.priority)}: 1 (highest) to 4 (none)`);
  });
  return problems;
}

function checkBoard(data: Json): string[] {
  const problems: string[] = [];
  const columns = data.columns as unknown[];
  const columnIds = new Set<string>();
  columns.forEach((column, i) => {
    if (!isObject(column) || !filled(column.id) || !filled(column.name)) return void problems.push(`Column ${i + 1} needs an id and a name`);
    if (columnIds.has(column.id)) problems.push(`The column id ${column.id} is there twice (${column.name})`);
    columnIds.add(column.id);
    if (!COLUMN_KINDS.includes(column.kind as ColumnKind)) problems.push(`The column ${column.name} has the kind ${JSON.stringify(column.kind)}, which is none of ${COLUMN_KINDS.join(', ')}`);
  });
  if (!columns.some((column) => isObject(column) && column.kind === 'done')) problems.push('A board keeps at least one done column');
  const phases = data.phases ?? [];
  if (!Array.isArray(phases)) problems.push('"phases" is a list');
  else {
    const phaseIds = new Set<string>();
    let current = 0;
    phases.forEach((phase, i) => {
      if (!isObject(phase) || !filled(phase.id) || !filled(phase.name)) return void problems.push(`Phase ${i + 1} needs an id and a name`);
      if (phaseIds.has(phase.id)) problems.push(`The phase id ${phase.id} is there twice (${phase.name})`);
      phaseIds.add(phase.id);
      if (!['upcoming', 'current', 'done'].includes(phase.state as string)) problems.push(`The phase ${phase.name} has the state ${JSON.stringify(phase.state)}: upcoming, current or done`);
      if (phase.state === 'current') current++;
    });
    if (current > 1) problems.push('More than one phase is current; one is, while any is open');
  }
  const cardIds = new Set<string>();
  (data.cards as unknown[]).forEach((card, i) => {
    if (!isObject(card) || !filled(card.id) || !filled(card.title)) return void problems.push(`Card ${i + 1} needs an id and a title`);
    if (cardIds.has(card.id)) problems.push(`The card id ${card.id} is there twice (${card.title})`);
    cardIds.add(card.id);
    if (!(typeof card.column === 'string' && columnIds.has(card.column))) problems.push(`${card.title} is in the column ${String(card.column)}, which is not in "columns"; keep the column, or move the card first`);
  });
  return problems;
}
