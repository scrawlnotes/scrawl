import { t } from '@scrawlnotes/i18n';
import { BOARD_EXT, type Board, prefixFor, serializeBoard } from '../board';
import {
  COLLECTION_FILE,
  COLLECTION_TEMPLATES,
  type CollectionTemplate,
  defaultProblem,
  type Field,
  formulaProblem,
  type Layout,
  type LayoutBlock,
  type LayoutItem,
  newRecordId,
  RECORD_EXT,
  type Schema,
  serializeRecord,
  serializeSchema,
} from '../collection';
import { join } from '../fs';
import { fileNameOf } from '../names';
import { freePath } from '../paths';
import { RULES_FILE, rulesProblems, ruleSpaceOf } from '../rules';
import { aboutAdded, aboutName, aboutNote, partName } from './about';
import { PIECES, ROLES } from './pieces';
import { impliedBy, isTemplateId, readAnswers, readCurrencies, TEMPLATES } from './questions';
import {
  type AboutSection,
  type Answers,
  type AppDraft,
  type AppFile,
  type AppPlan,
  type BoardPart,
  type CollectionPart,
  type FolderPart,
  type Money,
  type Part,
  type PlannedFile,
  type RuleChunk,
  TEMPLATE_IDS,
  type TemplateId,
} from './types';

// From the templates chosen and their answers, the plan of an app: its folders and files, written
// by install.ts. Each template adds to the pieces in its turn; a shared piece is made once. Added
// to an app already set up, the plan is what the templates make with the new ones less what they
// made without them, put onto what is there: only added, nothing there changed or taken away.

export const APP_FILE = '_app.json';

/** Answers that are not answers, a template that is not one, a name or currencies missing: what the person or the agent is to put right. */
export class AppProblems extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

export interface AppInput {
  /** The app's name: its folder's, in `parent`. */
  name: string;
  currencies?: unknown;
  templates: { id: string; answers?: { [key: string]: unknown } }[];
}

/** A piece of an app as it is in the space, found by its role. */
export interface FoundPiece {
  kind: Part['kind'];
  path: string;
  /** A collection's schema or a board's file; empty for a folder. */
  text: string;
  /** A collection's rules file; null without one. */
  rules: string | null;
  /** A collection's records' names, or a folder's notes' names, lowercased. */
  names: string[];
}

/** An app as it is in the space: its `_app.json`, its pieces, its About note and the names taken in its folder. */
export interface FoundApp {
  folder: string;
  app: AppFile;
  pieces: Map<string, FoundPiece>;
  about: { path: string; text: string } | null;
  /** The lowercased paths in its folder. */
  taken: Set<string>;
}

const matchingTemplate = (role: string): CollectionTemplate => (COLLECTION_TEMPLATES.includes(role as CollectionTemplate) ? (role as CollectionTemplate) : 'blank');

function emptyPart(role: string, path: string): Part {
  const info = PIECES[role]!;
  if (info.kind === 'board') return { kind: 'board', role, path, about: info.about, columns: [], fields: [] };
  if (info.kind === 'folder') return { kind: 'folder', role, path, about: info.about, notes: [] };
  return { kind: 'collection', role, path, about: info.about, ...(info.singular && { singular: info.singular }), fields: [], blocks: [], rules: [], records: [] };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

class Draft implements AppDraft {
  readonly parts = new Map<string, Part>();
  readonly sections: { id: TemplateId; section: AboutSection }[] = [];
  private building: TemplateId | null = null;

  constructor(
    readonly title: string,
    readonly money: Money,
    private readonly chosen: ReadonlyMap<TemplateId, Answers>,
    paths: ReadonlyMap<string, string>,
    roles: ReadonlySet<string>,
  ) {
    for (const role of ROLES) if (roles.has(role)) this.parts.set(role, emptyPart(role, paths.get(role)!));
  }

  has = (id: TemplateId) => this.chosen.has(id);
  answers = (id: TemplateId) => this.chosen.get(id) ?? {};
  hasPiece = (role: string) => this.parts.has(role);

  private part<K extends Part['kind']>(role: string, kind?: K): Extract<Part, { kind: K }> {
    const part = this.parts.get(role);
    if (!part || (kind && part.kind !== kind)) throw new Error(`The ${this.building} template uses ${role}, which the app does not have as a ${kind ?? 'piece'}`);
    return part as Extract<Part, { kind: K }>;
  }

  path = (role: string) => this.part(role).path;
  called = (role: string) => partName(this.part(role));

  field(role: string, field: Field) {
    const part = this.part(role);
    if (part.kind === 'folder') throw new Error(`${role} is a folder`);
    if (!part.fields.some((f) => f.key === field.key)) part.fields.push(field);
  }

  block(role: string, block: LayoutBlock) {
    const part = this.part(role, 'collection');
    if (!part.blocks.some((b) => same(b, block))) part.blocks.push(block);
  }

  rule(role: string, chunk: RuleChunk) {
    const part = this.part(role, 'collection');
    if (!part.rules.some((r) => r.kind === chunk.kind && r.name === chunk.name)) part.rules.push(chunk);
  }

  record(role: string, values: { [key: string]: string | number | boolean }) {
    const part = this.part(role, 'collection');
    if (!part.records.some((r) => same(r, values))) part.records.push(values);
  }

  columns(role: string, columns: BoardPart['columns'], look: { phasesOn?: boolean; list?: boolean } = {}) {
    const part = this.part(role, 'board');
    if (part.columns.length > 0) return;
    part.columns = columns;
    if (look.phasesOn) part.phasesOn = true;
    if (look.list) part.list = true;
  }

  note(role: string, name: string, text: string) {
    const part = this.part(role, 'folder');
    if (!part.notes.some((n) => n.name === name)) part.notes.push({ name, text });
  }

  format(own: boolean) {
    if (!this.money.main) throw new Error(`The ${this.building} template holds money in an app with no currency`);
    return own && this.money.multi ? { style: 'currency' as const, currencyField: 'currency' } : { style: 'currency' as const, currency: this.money.main };
  }

  about(section: AboutSection) {
    this.sections.push({ id: this.building!, section });
  }

  run() {
    for (const id of TEMPLATE_IDS) {
      if (!this.chosen.has(id)) continue;
      this.building = id;
      TEMPLATES[id].build(this, this.chosen.get(id)!);
    }
    this.building = null;
  }
}

/** The roles the templates set up, in the order of ROLES. */
function rolesOf(chosen: ReadonlyMap<TemplateId, Answers>): Set<string> {
  const view = { has: (id: TemplateId) => chosen.has(id), answers: (id: TemplateId) => chosen.get(id) ?? {} };
  const roles = new Set<string>();
  for (const [id, answers] of chosen) for (const role of TEMPLATES[id].pieces(answers, view)) roles.add(role);
  return new Set(ROLES.filter((r) => roles.has(r)));
}

/** The templates with the ones their answers bring, in the order they are set up. */
function withImplied(answers: ReadonlyMap<TemplateId, Answers>): Map<TemplateId, Answers> {
  const all = new Map(answers);
  for (const id of impliedBy(all)) all.set(id, readAnswers(TEMPLATES[id], new Set([...all.keys(), id])).answers);
  return new Map(TEMPLATE_IDS.filter((id) => all.has(id)).map((id) => [id, all.get(id)!]));
}

/** A collection's record screen: its fields and its buttons on the left, then its notes; what links to it on the right. */
function layoutFor(fields: readonly Field[], blocks: readonly LayoutBlock[], actions: boolean): Layout | undefined {
  if (blocks.length === 0 && !actions) return undefined;
  const left: LayoutItem[] = [...fields.map((f) => ({ field: f.key })), ...(actions ? [{ block: 'actions' as const }] : []), { block: 'body' }];
  return { columns: blocks.length > 0 ? [{ width: 1, sections: [{ items: left }] }, { width: 2, sections: [{ items: [...blocks] }] }] : [{ sections: [{ items: left }] }] };
}

const rulesText = (name: string, chunks: readonly RuleChunk[]) => `// What ${name} checks and does, as the app set it up; change it as you need.\n\n${chunks.map((c) => c.src).join('\n\n')}\n`;

export interface PlanOptions {
  /** The folder the app's folder is made in; the app's own when adding to it. */
  parent?: string;
  /** The app as it is, to add templates to. */
  found?: FoundApp;
  /** Ids for a board's columns and the records it starts with; random ones otherwise. */
  ids?: () => string;
  /** The names taken in `parent`, lowercased, for a new app's folder. */
  taken?: ReadonlySet<string>;
}

/**
 * The plan of a new app, or of templates added to one already set up (`found`). Throws
 * AppProblems for what was given wrong: a template that is not one or is there already, a
 * question that is not one or an answer that is not, the name, the currencies.
 */
export function planApp(input: AppInput, { parent = '', found, ids, taken = new Set() }: PlanOptions = {}): AppPlan {
  const problems: string[] = [];
  const title = found ? found.app.name : fileNameOf(input.name ?? '').replace(/\s+/g, ' ').trim();
  if (!title || title.startsWith('.') || title.startsWith('_')) problems.push(t('apps.needsName'));
  const folder = found ? found.folder : join(parent, title);
  if (!found && title && taken.has(folder.toLowerCase())) problems.push(t('apps.nameTaken', { name: title }));

  const installed = new Map<TemplateId, Answers>((found?.app.templates ?? []).filter((x) => isTemplateId(x.id)).map((x) => [x.id, x.answers]));
  const fresh: TemplateId[] = [];
  for (const { id } of input.templates) {
    if (!isTemplateId(id)) problems.push(t('apps.noTemplate', { id: String(id), ids: TEMPLATE_IDS.join(', ') }));
    else if (installed.has(id)) problems.push(t('apps.alreadyThere', { id }));
    else if (!fresh.includes(id)) fresh.push(id);
  }
  if (fresh.length === 0 && problems.length === 0) problems.push(t('apps.needsTemplate', { ids: TEMPLATE_IDS.join(', ') }));
  const chosen = new Set<TemplateId>([...installed.keys(), ...fresh]);
  const given = new Map(input.templates.map((x) => [x.id, x.answers ?? {}]));
  const answers = new Map(installed);
  for (const id of fresh) {
    const read = readAnswers(TEMPLATES[id], chosen, given.get(id));
    problems.push(...read.problems);
    answers.set(id, read.answers);
  }
  const all = withImplied(answers);
  const base = withImplied(installed);

  const currencies = found ? found.app.currencies : readCurrencies(input.currencies ?? []);
  if (currencies === null) problems.push(t('apps.currencyCodes'));
  else if (currencies.length === 0 && [...all].some(([id, a]) => TEMPLATES[id].money(a))) problems.push(t('apps.needsCurrencies'));
  if (problems.length > 0) throw new AppProblems(problems);
  const money: Money = { currencies: currencies!, main: currencies![0] ?? '', multi: currencies!.length > 1 };

  // Each piece where it is, or at a free name in the app's folder.
  const roles = rolesOf(all);
  const paths = new Map<string, string>();
  const names = new Set(found?.taken ?? []);
  for (const [role, piece] of found?.pieces ?? []) paths.set(role, piece.path);
  for (const role of roles) {
    if (paths.has(role)) continue;
    const info = PIECES[role]!;
    const path = freePath(folder, fileNameOf(info.name), info.kind === 'board' ? BOARD_EXT : '', names);
    names.add(path.toLowerCase());
    paths.set(role, path);
  }
  const after = new Draft(title, money, all, paths, roles);
  after.run();
  const before = found ? new Draft(title, money, base, paths, rolesOf(base)) : null;
  before?.run();

  const newId = ids ?? (() => crypto.randomUUID());
  const recordId = ids ?? newRecordId;
  const plan: AppPlan = { folder, app: { version: 1, name: title, currencies: money.currencies, templates: [] }, dirs: found ? [] : [folder], files: [], created: [], changed: [], notes: [] };
  const file = (path: string, text: string, was: string | null = null) => plan.files.push({ path, text, before: was });
  const checks: { part: CollectionPart; fields: Field[]; rules: RuleChunk[] }[] = [];
  const final = new Map<string, { fields: readonly Field[] }>();
  const boards: { [path: string]: { fields?: readonly Field[]; columns: { name: string }[] } } = {};

  const seeds = (part: CollectionPart, schema: Schema, records: CollectionPart['records']) => {
    for (const values of records) {
      const id = recordId();
      const path = join(part.path, `${id}${RECORD_EXT}`);
      file(path, serializeRecord({ id, path, name: String(values.name ?? ''), code: '', values, extra: {}, body: '' }, schema));
    }
  };

  for (const role of roles) {
    const part = after.parts.get(role)!;
    const was = found?.pieces.get(role);
    const had = before?.parts.get(role);
    if (!was && had) continue; // Set up before and taken away since: not put back.
    if (!was) {
      // A piece of its own, written whole.
      plan.created.push({ kind: part.kind, path: part.path });
      if (part.kind === 'collection') {
        const layout = layoutFor(part.fields, part.blocks, part.rules.some((r) => r.kind === 'action'));
        const schema: Schema = { version: 2, template: matchingTemplate(role), ...(part.singular && { singular: part.singular }), role, fields: part.fields, ...(layout && { layout }) };
        plan.dirs.push(part.path);
        file(join(part.path, COLLECTION_FILE), serializeSchema(schema));
        if (part.rules.length > 0) file(join(part.path, RULES_FILE), rulesText(partName(part), part.rules));
        seeds(part, schema, part.records);
        final.set(part.path, schema);
        checks.push({ part, fields: part.fields, rules: part.rules });
      } else if (part.kind === 'board') {
        const board: Board = {
          prefix: prefixFor(partName(part)),
          nextKey: 1,
          phasesOn: part.phasesOn === true,
          ...(part.list && { view: 'list' as const }),
          columns: part.columns.map(([name, kind]) => ({ id: newId(), name, kind })),
          phases: [],
          ...(part.fields.length > 0 && { fields: part.fields }),
          role,
          cards: [],
        };
        file(part.path, serializeBoard(board));
        boards[part.path] = board;
      } else {
        plan.dirs.push(part.path);
        for (const note of part.notes) file(join(part.path, `${fileNameOf(note.name)}.md`), note.text);
      }
      continue;
    }

    // A piece that is there: what the new templates add to it, where it does not have it yet.
    const added: string[] = [];
    if (part.kind === 'collection') {
      const old = had?.kind === 'collection' ? had : null;
      const data = JSON.parse(was.text) as Schema & { [key: string]: unknown };
      data.fields = Array.isArray(data.fields) ? data.fields : [];
      const fields = part.fields.filter((f) => !old?.fields.some((o) => o.key === f.key));
      const put: Field[] = [];
      for (const field of fields) {
        const there = data.fields.find((f) => f.key === field.key);
        if (there) {
          if (there.type !== field.type) plan.notes.push(t('apps.keptField', { piece: partName(part), field: there.label ?? field.key }));
          continue;
        }
        data.fields.push(field);
        put.push(field);
      }
      const rules = part.rules.filter((r) => !old?.rules.some((o) => o.kind === r.kind && o.name === r.name) && !(was.rules ?? '').includes(JSON.stringify(r.name)));
      const actions = rules.some((r) => r.kind === 'action');
      const blocks = part.blocks.filter((b) => !old?.blocks.some((o) => same(o, b)));
      const layout = data.layout;
      const placed = (b: LayoutBlock) => layout?.columns.some((c) => c.sections.some((s) => s.items.some((i) => same(i, b) || ('block' in i && i.block === b.block && b.block !== 'linked'))));
      const newBlocks = blocks.filter((b) => !placed(b));
      if (layout) {
        const first = layout.columns[0]!.sections.at(-1)!;
        const body = first.items.findIndex((i) => 'block' in i && i.block === 'body');
        const items: LayoutItem[] = [...put.map((f) => ({ field: f.key })), ...(actions && !placed({ block: 'actions' }) ? [{ block: 'actions' as const }] : [])];
        first.items.splice(body >= 0 ? body : first.items.length, 0, ...items);
        if (newBlocks.length > 0) {
          if (layout.columns.length > 1) layout.columns.at(-1)!.sections.at(-1)!.items.push(...newBlocks);
          else layout.columns.push({ width: 2, sections: [{ items: newBlocks }] });
        }
      } else {
        const made = layoutFor(data.fields, newBlocks, actions);
        if (made) data.layout = made;
      }
      const seeded = part.records.filter((r) => !old?.records.some((o) => same(o, r)) && !was.names.includes(String(r.name ?? '').toLowerCase()));
      if (put.length > 0 || newBlocks.length > 0 || (actions && !layout)) file(join(part.path, COLLECTION_FILE), serializeSchema(data), was.text);
      if (rules.length > 0) {
        const text = was.rules?.trim() ? `${was.rules.replace(/\s*$/, '')}\n\n${rules.map((r) => r.src).join('\n\n')}\n` : rulesText(partName(part), rules);
        file(join(part.path, RULES_FILE), text, was.rules);
      }
      seeds(part, data, seeded);
      final.set(part.path, data);
      checks.push({ part, fields: put, rules });
      if (put.length > 0) added.push(t('apps.addedFields', { count: put.length }));
      if (newBlocks.length > 0) added.push(t('apps.addedBlocks', { count: newBlocks.length }));
      if (rules.length > 0) added.push(t('apps.addedRules', { count: rules.length }));
      if (seeded.length > 0) added.push(t('apps.addedRecords', { count: seeded.length }));
    } else if (part.kind === 'board') {
      const old = had?.kind === 'board' ? had : null;
      const data = JSON.parse(was.text) as Board;
      const fields = data.fields ?? [];
      const put: Field[] = [];
      for (const field of part.fields.filter((f) => !old?.fields.some((o) => o.key === f.key))) {
        const there = fields.find((f) => f.key === field.key);
        if (there) {
          if (there.type !== field.type) plan.notes.push(t('apps.keptField', { piece: partName(part), field: there.label ?? field.key }));
          continue;
        }
        fields.push(field);
        put.push(field);
      }
      if (put.length > 0) {
        file(part.path, `${JSON.stringify({ ...data, fields }, null, 2)}\n`, was.text);
        added.push(t('apps.addedFields', { count: put.length }));
      }
      boards[part.path] = { fields, columns: data.columns ?? [] };
    } else {
      const old = had?.kind === 'folder' ? had : null;
      const notes = part.notes.filter((n) => !old?.notes.some((o) => o.name === n.name) && !was.names.includes(`${fileNameOf(n.name)}.md`.toLowerCase()));
      for (const note of notes) file(join(part.path, `${fileNameOf(note.name)}.md`), note.text);
      if (notes.length > 0) added.push(t('apps.addedNotes', { count: notes.length }));
    }
    if (added.length > 0) plan.changed.push(`${partName(part)}: ${added.join(', ')}`);
  }
  // A piece the new templates do not set up, as it is: for links and rules to be checked against it.
  for (const piece of found?.pieces.values() ?? []) {
    if (piece.kind === 'collection' && !final.has(piece.path)) final.set(piece.path, JSON.parse(piece.text) as Schema);
    if (piece.kind === 'board' && !boards[piece.path]) boards[piece.path] = JSON.parse(piece.text) as Board;
  }

  // The About note: whole for a new app; for an app set up before, the new templates' sections at its end.
  const sections = after.sections.filter((s) => !before?.sections.some((b) => b.id === s.id));
  if (found?.about) {
    if (sections.length > 0) file(found.about.path, `${found.about.text.replace(/\s*$/, '')}\n\n${aboutAdded(sections, after.parts)}\n`, found.about.text);
  } else {
    const path = freePath(folder, fileNameOf(aboutName(title)), '.md', names);
    plan.created.push({ kind: 'note', path });
    file(path, aboutNote(title, found ? sections : after.sections, after.parts));
  }

  plan.app = {
    version: 1,
    name: title,
    currencies: money.currencies,
    templates: [...(found?.app.templates ?? []), ...fresh.map((id) => ({ id, version: TEMPLATES[id].version, answers: answers.get(id)! }))],
  };
  const appPath = join(folder, APP_FILE);
  file(appPath, `${JSON.stringify(plan.app, null, 2)}\n`, found ? JSON.stringify(found.app, null, 2) + '\n' : null);

  const wrong = problemsOf(checks, final, boards);
  // On an app set up before, what is there may keep what is added from working: a field of the same key and another type.
  if (wrong.length > 0 && found) throw new AppProblems([...plan.notes, ...wrong.map((what) => t('apps.wouldBreak', { what }))]);
  if (wrong.length > 0) throw new Error(`The app templates make a wrong app (${[...all.keys()].join(', ')}):\n${wrong.join('\n')}`);
  return plan;
}

/**
 * What is wrong with what the templates made: a formula or a default that cannot be worked out, a
 * link or a rollup to what is not there, a rule that does not read. Empty when it is all right;
 * anything else is a mistake of ours, never the person's.
 */
function problemsOf(checks: { part: CollectionPart; fields: Field[]; rules: RuleChunk[] }[], schemas: ReadonlyMap<string, { fields: readonly Field[] }>, boards: { [path: string]: { fields?: readonly Field[]; columns: { name: string }[] } }): string[] {
  const schemaOf = (path: string) => (schemas.get(path) as { fields: Field[] } | undefined) ?? (boards[path] ? { fields: (boards[path]!.fields ?? []) as Field[] } : undefined);
  const space = ruleSpaceOf([...schemas].map(([dir, schema]) => ({ dir, schema })), boards, []);
  const problems: string[] = [];
  for (const { part, fields, rules } of checks) {
    const schema = { fields: [...schemaOf(part.path)!.fields] };
    const at = (what: string) => problems.push(`${part.path}: ${what}`);
    for (const field of fields) {
      if (field.type === 'formula') {
        const wrong = formulaProblem(field.formula ?? '', schema, field.key, schemaOf);
        if (wrong) at(`${field.key}: ${wrong}`);
      }
      const wrong = defaultProblem(field, schema, schemaOf);
      if (wrong) at(`${field.key}: default: ${wrong}`);
      if (field.type === 'link' && !schemas.has(field.collection ?? '')) at(`${field.key} links to ${field.collection}, which is not there`);
      if (field.type === 'rollup') {
        const source = schemaOf(field.rollup?.from ?? '');
        if (!source) at(`${field.key} rolls up from ${field.rollup?.from}, which is not there`);
        else {
          if (field.rollup?.field && !source.fields.some((f) => f.key === field.rollup!.field)) at(`${field.key} rolls up ${field.rollup.field}, which ${field.rollup.from} does not have`);
          for (const c of field.rollup?.where ?? []) if (!source.fields.some((f) => f.key === c.field)) at(`${field.key}: ${field.rollup!.from} has no ${c.field}`);
        }
      }
    }
    if (rules.length > 0) for (const p of rulesProblems(rulesText(partName(part), rules), { fields: schema.fields, schemaOf, dir: part.path }, space)) at(`rules line ${p.line}: ${p.message}`);
  }
  return problems;
}

export type { PlannedFile };
