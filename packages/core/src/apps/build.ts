import { type MessageKey, t } from '@scrawlnotes/i18n';
import { BOARD_EXT, type Board, prefixFor, serializeBoard } from '../board';
import {
  COLLECTION_FILE,
  COLLECTION_TEMPLATES,
  type CollectionTemplate,
  defaultProblem,
  type Field,
  type HomeTile,
  formulaProblem,
  type Layout,
  type LayoutBlock,
  type LayoutItem,
  nameField,
  newRecordId,
  parseSchema,
  RECORD_EXT,
  type Record as CollectionRecord,
  type Schema,
  type View,
  serializeRecord,
  serializeSchema,
} from '../collection';
import { dayIn } from '../day';
import { type ChoiceRenames, renameChoices, renameInViews } from '../fields';
import { basename, dirname, join } from '../fs';
import { fileNameOf } from '../names';
import { freePath } from '../paths';
import { RULES_FILE, rulesProblems, ruleSpaceOf } from '../rules';
import { aboutAdded, aboutName, aboutNote, aboutSection, listed, partName } from './about';
import { PIECES, type PieceInfo, ROLES } from './pieces';
import { apartProblem, impliedBy, isTemplateId, readAnswers, readCurrencies, TEMPLATES } from './questions';
import {
  type AboutSection,
  type Answers,
  type AppDraft,
  type AppFile,
  type AppMenuFile,
  type AppPlan,
  type Audience,
  audienceOf,
  type BoardPart,
  type CollectionPart,
  type EditItem,
  type FolderPart,
  type Money,
  type Part,
  type PlannedFile,
  type RuleChunk,
  APP_FILE,
  RECORD_BODY,
  TEMPLATE_IDS,
  type TemplateId,
  type TemplateSummary,
} from './types';

// From the templates chosen and their answers, the plan of an app: its folders and files, written
// by install.ts. Each template adds to the pieces in its turn; a shared piece is made once. Added
// to an app already set up, the plan is what the templates make with the new ones less what they
// made without them, put onto what is there: only added, nothing there changed or taken away.

export { APP_FILE };

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
  /** Editing an app, `renames` says the items of a list answer typed anew, by the question: `{ stages: { Proposal: "Quote" } }`. */
  templates: { id: string; answers?: { [key: string]: unknown }; renames?: { [question: string]: { [from: string]: string } } }[];
  /** An app of no template (design/app-home.md 5.5): its menu, which it is set up with instead. */
  menu?: AppMenuFile;
  /** Its icon, one of the templates' icons or the app's. */
  icon?: string;
}

/** The icons an app may be given: the templates' and the app's own. */
export const APP_ICONS: readonly string[] = ['app', ...new Set(TEMPLATE_IDS.map((id) => TEMPLATES[id].icon))];

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
  /** The records of its collections with their files' text, by the collection's path: read for an edit, which renames choices and records. */
  records?: Map<string, { record: CollectionRecord; text: string }[]>;
}

const matchingTemplate = (role: string): CollectionTemplate => (COLLECTION_TEMPLATES.includes(role as CollectionTemplate) ? (role as CollectionTemplate) : 'blank');

function emptyPart(info: PieceInfo, role: string, path: string): Part {
  if (info.kind === 'board') return { kind: 'board', role, path, about: info.about, columns: [], fields: [] };
  if (info.kind === 'folder') return { kind: 'folder', role, path, about: info.about, notes: [] };
  return { kind: 'collection', role, path, about: info.about, ...(info.singular && { singular: info.singular }), fields: [], blocks: [], views: [], rules: [], records: [] };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

class Draft implements AppDraft {
  readonly parts = new Map<string, Part>();
  readonly sections: { id: TemplateId; section: AboutSection }[] = [];
  /** The buttons each template adds, by their names. */
  readonly buttons = new Map<TemplateId, string[]>();
  private building: TemplateId | null = null;

  constructor(
    readonly title: string,
    readonly money: Money,
    readonly today: string,
    private readonly chosen: ReadonlyMap<TemplateId, Answers>,
    paths: ReadonlyMap<string, string>,
    roles: ReadonlySet<string>,
  ) {
    const infoOf = piecesNamed(chosen);
    for (const role of ROLES) if (roles.has(role)) this.parts.set(role, emptyPart(infoOf(role), role, paths.get(role)!));
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

  view(role: string, view: View, opens = false) {
    const part = this.part(role, 'collection');
    if (!part.views.some((v) => v.id === view.id)) part.views.push(view);
    if (opens) part.defaultView = view.id;
  }

  tableColumns(role: string, keys: string[]) {
    this.part(role, 'collection').columns = keys;
  }

  homeTile(role: string, tile: HomeTile) {
    this.part(role, 'collection').home = tile;
  }

  formOrder(role: string, keys: string[]) {
    this.part(role, 'collection').order = keys;
  }

  rule(role: string, chunk: RuleChunk) {
    const part = this.part(role, 'collection');
    if (!part.rules.some((r) => r.kind === chunk.kind && r.name === chunk.name)) part.rules.push(chunk);
    if (chunk.kind === 'action' && this.building) {
      const own = this.buttons.get(this.building) ?? [];
      if (!own.includes(chunk.name)) this.buttons.set(this.building, [...own, chunk.name]);
    }
  }

  record(role: string, values: { [key: string]: string | number | boolean | string[] }) {
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

/** What each piece is called and holds: as PIECES says, or as a template's answers name it, Memberships for Subscriptions. */
function piecesNamed(chosen: ReadonlyMap<TemplateId, Answers>): (role: string) => PieceInfo {
  const named = new Map<string, Partial<PieceInfo>>();
  const app = { has: (id: TemplateId) => chosen.has(id), answers: (id: TemplateId) => chosen.get(id) ?? {} };
  for (const [id, answers] of chosen) for (const [role, info] of Object.entries(TEMPLATES[id].names?.(answers, app) ?? {})) named.set(role, info);
  return (role) => ({ ...PIECES[role]!, ...named.get(role) });
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
function layoutFor(fields: readonly Field[], blocks: readonly LayoutBlock[], actions: boolean, order?: readonly string[]): Layout | undefined {
  if (blocks.length === 0 && !actions && !order) return undefined;
  const rank = (f: Field) => (order?.includes(f.key) ? order.indexOf(f.key) : (order?.length ?? 0));
  const ordered = order ? fields.slice().sort((a, b) => rank(a) - rank(b)) : fields;
  const left: LayoutItem[] = [...ordered.map((f) => ({ field: f.key })), ...(actions ? [{ block: 'actions' as const }] : []), { block: 'body' }];
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
  /** The day it is set up; this device's today when not given. */
  today?: string;
  /** The names taken in `parent`, lowercased, for a new app's folder. */
  taken?: ReadonlySet<string>;
  /** Added to an app, what would not work with what is there is said in the plan's `blocked` rather than thrown: for a summary to show it. */
  keepBlocked?: boolean;
  /** The templates given are the app's own, their answers changed (Edit app, design/edit-app.md); `found` should hold its records. */
  edit?: boolean;
}

/**
 * The plan of a new app, or of templates added to one already set up (`found`). Throws
 * AppProblems for what was given wrong: a template that is not one or is there already, a
 * question that is not one or an answer that is not, the name, the currencies.
 */
export function planApp(input: AppInput, { parent = '', found, ids, taken = new Set(), keepBlocked = false, edit = false, today = dayIn(new Date()) }: PlanOptions = {}): AppPlan {
  const problems: string[] = [];
  if (edit && !found) throw new Error('An app is edited where it is found');
  const title = found ? found.app.name : fileNameOf(input.name ?? '').replace(/\s+/g, ' ').trim();
  if (!title || title.startsWith('.') || title.startsWith('_')) problems.push(t('apps.needsName'));
  const folder = found ? found.folder : join(parent, title);
  if (!found && title && taken.has(folder.toLowerCase())) problems.push(t('apps.nameTaken', { name: title }));

  const installed = new Map<TemplateId, Answers>((found?.app.templates ?? []).filter((x) => isTemplateId(x.id)).map((x) => [x.id, x.answers]));
  const fresh: TemplateId[] = [];
  // Editing, the templates given are the app's own, with their answers changed.
  const edited: TemplateId[] = [];
  for (const { id } of input.templates) {
    if (!isTemplateId(id)) problems.push(t('apps.noTemplate', { id: String(id), ids: TEMPLATE_IDS.join(', ') }));
    else if (edit) {
      if (!installed.has(id)) problems.push(t('apps.notInApp', { id, ids: [...installed.keys()].join(', ') }));
      else if (!edited.includes(id)) edited.push(id);
    } else if (installed.has(id)) problems.push(t('apps.alreadyThere', { id }));
    else if (!fresh.includes(id)) fresh.push(id);
  }
  if (input.icon !== undefined && !APP_ICONS.includes(input.icon)) problems.push(t('apps.noIcon', { icons: APP_ICONS.join(', ') }));
  // An app of no template is its folder and its file, its menu in it; screens are added to it later (design/app-home.md 5.5).
  if (!found && input.templates.length === 0 && input.menu) {
    const currencies = readCurrencies(input.currencies ?? []);
    if (currencies === null) problems.push(t('apps.currencyCodes'));
    if (problems.length > 0) throw new AppProblems(problems);
    const app: AppFile = { version: 1, name: title, currencies: currencies!, templates: [], menu: input.menu, ...(input.icon && { icon: input.icon }) };
    const files = [{ path: join(folder, APP_FILE), text: `${JSON.stringify(app, null, 2)}\n`, before: null }];
    return { folder, app, dirs: [folder], files, created: [], changed: [], added: [], notes: [], templates: [] };
  }
  if (!edit && fresh.length === 0 && problems.length === 0) problems.push(t('apps.needsTemplate', { ids: TEMPLATE_IDS.join(', ') }));
  const chosen = new Set<TemplateId>([...installed.keys(), ...fresh]);
  // One side only: a business's pieces and a person's are not linked, and are mostly kept apart.
  const side = (audience: Audience) => [...chosen].filter((id) => audienceOf(TEMPLATES[id].group) === audience);
  if (side('business').length > 0 && side('personal').length > 0) problems.push(t('apps.oneSide', { business: side('business').join(', '), personal: side('personal').join(', ') }));
  // A person's templates only with those they share data with; what was set up before stays as it is.
  else if (fresh.length > 0) {
    const apart = apartProblem(fresh, new Set(installed.keys()));
    if (apart) problems.push(apart);
  }
  const given = new Map(input.templates.map((x) => [x.id, x.answers ?? {}]));
  const answers = new Map(installed);
  for (const id of fresh) {
    const read = readAnswers(TEMPLATES[id], chosen, given.get(id));
    problems.push(...read.problems);
    answers.set(id, read.answers);
  }
  // An answer not given is the one it has; an answer to a question the template no longer asks is let go.
  const keys = (id: TemplateId) => TEMPLATES[id].questions.map((q) => q.key);
  const changedIds: TemplateId[] = [];
  for (const id of edited) {
    const had = Object.fromEntries(Object.entries(installed.get(id)!).filter(([key]) => keys(id).includes(key)));
    const read = readAnswers(TEMPLATES[id], chosen, { ...had, ...given.get(id) });
    problems.push(...read.problems);
    answers.set(id, read.answers);
    if (!same(read.answers, readAnswers(TEMPLATES[id], chosen, had).answers)) changedIds.push(id);
  }
  // The items of a list answer typed anew, each old one with its new one: a column, a choice, a record follows.
  const renames = new Map<string, string>();
  for (const x of input.templates) {
    if (!isTemplateId(x.id) || !changedIds.includes(x.id)) continue;
    for (const [key, names] of Object.entries(x.renames ?? {})) {
      const now = answers.get(x.id)![key];
      const was = installed.get(x.id)![key];
      for (const [from, to] of Object.entries(names ?? {})) {
        if (Array.isArray(was) && was.includes(from) && Array.isArray(now) && now.includes(to) && !now.includes(from)) renames.set(from, to);
      }
    }
  }
  const all = withImplied(answers);
  const base = withImplied(installed);

  // An app keeps the currencies it has; one with none takes those given when a template added to it holds money.
  const currencies = found?.app.currencies.length ? found.app.currencies : readCurrencies(input.currencies ?? []);
  if (currencies === null) problems.push(t('apps.currencyCodes'));
  else if (currencies.length === 0 && [...all].some(([id, a]) => TEMPLATES[id].money(a))) problems.push(t('apps.needsCurrencies'));
  if (problems.length > 0) throw new AppProblems(problems);
  const money: Money = { currencies: currencies!, main: currencies![0] ?? '', multi: currencies!.length > 1 };
  // Every answer as it was: nothing to write.
  if (edit && changedIds.length === 0) {
    return { folder, app: found!.app, dirs: [], files: [], created: [], changed: [], added: [], notes: [], templates: [], edit: { same: true, templates: [], changed: [], takenOff: [], kept: [] } };
  }

  // Each piece where it is, or at a free name in the app's folder.
  const roles = rolesOf(all);
  const paths = new Map<string, string>();
  const names = new Set(found?.taken ?? []);
  for (const [role, piece] of found?.pieces ?? []) paths.set(role, piece.path);
  const infoOf = piecesNamed(all);
  for (const role of roles) {
    if (paths.has(role)) continue;
    const info = infoOf(role);
    const path = freePath(folder, fileNameOf(info.name), info.kind === 'board' ? BOARD_EXT : '', names);
    names.add(path.toLowerCase());
    paths.set(role, path);
  }
  const after = new Draft(title, money, today, all, paths, roles);
  after.run();
  // A piece only the old answers bring, and no longer there, is given a path for them to be worked out with.
  const baseRoles = rolesOf(base);
  for (const role of baseRoles) if (!paths.has(role)) paths.set(role, freePath(folder, fileNameOf(piecesNamed(base)(role).name), piecesNamed(base)(role).kind === 'board' ? BOARD_EXT : '', new Set(names)));
  const before = found ? new Draft(title, money, today, base, paths, baseRoles) : null;
  before?.run();

  const newId = ids ?? (() => crypto.randomUUID());
  const recordId = ids ?? newRecordId;
  const plan: AppPlan = { folder, app: { version: 1, name: title, currencies: money.currencies, templates: [] }, dirs: found ? [] : [folder], files: [], created: [], changed: [], added: [], notes: [], templates: [] };
  // A field there of the same key and another type, kept as it is: what is added may read it.
  const kept: { piece: string; label: string; key: string; has: string; wants: string }[] = [];
  const keep = (part: Part, there: Field, field: Field) => {
    plan.notes.push(t('apps.keptField', { piece: partName(part), field: there.label ?? field.key }));
    kept.push({ piece: partName(part), label: there.label ?? field.key, key: field.key, has: there.type, wants: field.type });
  };
  // A file written twice, added to and then edited, is written once with what it was before both.
  const file = (path: string, text: string, was: string | null = null) => {
    const twice = plan.files.find((f) => f.path === path);
    if (twice) twice.text = text;
    else plan.files.push({ path, text, before: was });
  };
  const checks: { part: CollectionPart; fields: Field[]; rules: RuleChunk[] }[] = [];
  const final = new Map<string, { fields: readonly Field[] }>();
  const boards: { [path: string]: { fields?: readonly Field[]; columns: { name: string }[] } } = {};

  // The records set up so far, by collection and lowercased name: one set up after may link to one by its name, a member to its group.
  const seeded = new Map<string, Map<string, string>>();
  const seeds = (part: CollectionPart, schema: Schema, records: CollectionPart['records']) => {
    const named = seeded.get(part.path) ?? new Map<string, string>();
    seeded.set(part.path, named);
    for (const { [RECORD_BODY]: body, ...given } of records) {
      const id = recordId();
      const path = join(part.path, `${id}${RECORD_EXT}`);
      const values = Object.fromEntries(
        Object.entries(given).map(([key, value]) => {
          const field = schema.fields.find((f) => f.key === key);
          const to = field?.type === 'link' && typeof value === 'string' ? seeded.get(field.collection ?? '')?.get(value.toLowerCase()) : undefined;
          return [key, to && typeof value === 'string' ? { id: to, name: value } : value];
        }),
      );
      named.set(String(given.name ?? '').toLowerCase(), id);
      file(path, serializeRecord({ id, path, name: String(given.name ?? ''), code: '', values, extra: {}, body: typeof body === 'string' ? body : '' }, schema));
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
        const layout = layoutFor(part.fields, part.blocks, part.rules.some((r) => r.kind === 'action'), part.order);
        const schema: Schema = { version: 2, template: matchingTemplate(role), ...(part.singular && { singular: part.singular }), role, ...(part.views.length > 0 && { views: part.views }), ...(part.defaultView && { defaultView: part.defaultView }), ...(part.columns && { columns: part.columns }), ...(part.home && { home: part.home }), fields: part.fields, ...(layout && { layout }) };
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
          if (there.type !== field.type) keep(part, there, field);
          continue;
        }
        data.fields.push(field);
        put.push(field);
      }
      // A field there before: the choices the new templates bring are added to it, each after the one
      // it follows in the template; a formula they write anew takes the place of the one the template
      // wrote, when nobody changed it. What the person changed or added stays.
      let choices = 0;
      const rewritten: Field[] = [];
      for (const field of part.fields) {
        const before = old?.fields.find((o) => o.key === field.key);
        const there = data.fields.find((f) => f.key === field.key);
        if (!before || !there || there.type !== field.type) continue;
        if ((field.type === 'select' || field.type === 'multi-select') && field.options) {
          const options = [...(there.options ?? [])];
          const fresh = field.options.filter((o) => !(before.options ?? []).includes(o) && !options.includes(o));
          for (const option of fresh) {
            const after = field.options.slice(0, field.options.indexOf(option)).reverse().find((o) => options.includes(o));
            options.splice(after ? options.indexOf(after) + 1 : options.length, 0, option);
            if (field.colors?.[option]) there.colors = { ...there.colors, [option]: field.colors[option] };
          }
          there.options = options;
          choices += fresh.length;
        }
        if (field.type === 'formula' && field.formula !== before.formula && there.formula === before.formula) {
          there.formula = field.formula;
          rewritten.push(there);
        }
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
      // A record an edit renames (Main warehouse to Depot) is not set up again under its new name.
      const renamedTo = (name: string) => [...renames].some(([from, to]) => to.toLowerCase() === name && was.names.includes(from.toLowerCase()));
      const seeded = part.records.filter((r) => !old?.records.some((o) => same(o, r)) && !was.names.includes(String(r.name ?? '').toLowerCase()) && !renamedTo(String(r.name ?? '').toLowerCase()));
      if (put.length > 0 || newBlocks.length > 0 || choices > 0 || rewritten.length > 0 || (actions && !layout)) file(join(part.path, COLLECTION_FILE), serializeSchema(data), was.text);
      if (rules.length > 0) {
        const text = was.rules?.trim() ? `${was.rules.replace(/\s*$/, '')}\n\n${rules.map((r) => r.src).join('\n\n')}\n` : rulesText(partName(part), rules);
        file(join(part.path, RULES_FILE), text, was.rules);
      }
      seeds(part, data, seeded);
      final.set(part.path, data);
      checks.push({ part, fields: [...put, ...rewritten], rules });
      if (put.length > 0) added.push(t('apps.addedFields', { count: put.length }));
      if (choices > 0) added.push(t('apps.addedChoices', { count: choices }));
      if (rewritten.length > 0) added.push(t('apps.changedFormulas', { count: rewritten.length }));
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
          if (there.type !== field.type) keep(part, there, field);
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
    if (added.length > 0) {
      plan.changed.push(`${partName(part)}: ${added.join(', ')}`);
      plan.added.push({ kind: part.kind, name: partName(part), what: added.join(', ') });
    }
  }
  // A piece the new templates do not set up, as it is: for links and rules to be checked against it.
  for (const piece of found?.pieces.values() ?? []) {
    if (piece.kind === 'collection' && !final.has(piece.path)) final.set(piece.path, JSON.parse(piece.text) as Schema);
    if (piece.kind === 'board' && !boards[piece.path]) boards[piece.path] = JSON.parse(piece.text) as Board;
  }

  // Editing, what the old answers brought and the new do not: settings go, the data stays (design/edit-app.md 2).
  if (edit) {
    plan.edit = { same: false, templates: changedIds, changed: [], takenOff: [], kept: [] };
    editPieces({ found: found!, before: before!, after, renames, schemas: final as Map<string, Schema>, plan, file, newId });
  }

  // The About note: whole for a new app; for an app set up before, the new templates' sections at its end.
  const sections = after.sections.filter((s) => !before?.sections.some((b) => b.id === s.id));
  if (found?.about) {
    if (sections.length > 0) {
      file(found.about.path, `${found.about.text.replace(/\s*$/, '')}\n\n${aboutAdded(found.about.path, sections, after.parts)}\n`, found.about.text);
      plan.added.push({ kind: 'note', name: basename(found.about.path).replace(/\.md$/, ''), what: t('apps.aboutSection') });
    }
    if (edit) editAbout(found.about, changedIds, before!, after, plan, file);
  } else if (!edit) {
    const path = freePath(folder, fileNameOf(aboutName(title)), '.md', names);
    plan.created.push({ kind: 'note', path });
    file(path, aboutNote(path, title, found ? sections : after.sections, after.parts));
  }

  plan.templates = summaries(sections, after, new Set(found?.pieces.keys() ?? []));
  plan.app = {
    version: 1,
    name: title,
    currencies: money.currencies,
    templates: [
      ...(found?.app.templates ?? []).map((x) => (changedIds.includes(x.id) ? { ...x, answers: answers.get(x.id)! } : x)),
      ...fresh.map((id) => ({ id, version: TEMPLATES[id].version, answers: answers.get(id)! })),
    ],
    // Its menu as the person set it stays: what is added comes at the end of its template's module (menuOf).
    ...(found?.app.menu && { menu: found.app.menu }),
    ...(found?.app.icon && { icon: found.app.icon }),
  };
  const appPath = join(folder, APP_FILE);
  file(appPath, `${JSON.stringify(plan.app, null, 2)}\n`, found ? JSON.stringify(found.app, null, 2) + '\n' : null);

  const wrong = problemsOf(checks, final, boards);
  // On an app set up before, what is there may keep what is added from working: a field of the same key and another type.
  if (wrong.length > 0 && found) {
    // Said as what to change: the field kept as it is that what is added reads, else what does not work.
    const reads = kept.filter((k) => wrong.some((w) => new RegExp(`\\b${k.key}\\b`).test(w)));
    const type = (of: string) => t(`fields.type.${of}` as MessageKey);
    const said = reads.length > 0 ? reads.map((k) => t('apps.keptBreaks', { piece: k.piece, field: k.label, has: type(k.has), wants: type(k.wants) })) : wrong.map((what) => t('apps.wouldBreak', { what }));
    if (!keepBlocked) throw new AppProblems(said);
    plan.blocked = said;
  } else if (wrong.length > 0) throw new Error(`The app templates make a wrong app (${[...all.keys()].join(', ')}):\n${wrong.join('\n')}`);
  return plan;
}

interface EditContext {
  found: FoundApp;
  /** What the old answers make, and the new. */
  before: Draft;
  after: Draft;
  /** Items of a list answer typed anew: a column, a choice or a record of that name follows. */
  renames: ReadonlyMap<string, string>;
  /** The collections' schemas as the plan leaves them, by path, to be changed further. */
  schemas: Map<string, Schema>;
  plan: AppPlan;
  file: (path: string, text: string, was?: string | null) => void;
  newId: () => string;
}

/** A rename in words, with what follows it when something does: "Proposal is now Quote; its 4 cards follow". */
const followed = (renamed: string, follow: string, count: number) => (count > 0 ? `${renamed}; ${follow}` : renamed);

/** Whether a value holds a choice. */
const holds = (value: unknown, choice: string) => value === choice || (Array.isArray(value) && value.includes(choice));

/** A rules file without one of the rules the app wrote in it, the lines around it closed up. */
const withoutRule = (text: string, src: string) => `${text.replace(src, '').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '')}\n`;

/**
 * What an edit does besides adding: on each piece the old answers brought, the rules, buttons and
 * views they wrote and the new do not are taken off where nobody changed them; a column or a choice
 * typed anew is renamed with what holds it, one gone is taken off where nothing holds it; a record
 * set up by an answer and typed anew is renamed, with the links to it. Fields and records stay.
 */
function editPieces({ found, before, after, renames, schemas, plan, file, newId }: EditContext) {
  const edit = plan.edit!;
  // What a file is now: as the plan writes it, else as it is.
  const textOf = (path: string, was: string | null) => plan.files.find((f) => f.path === path)?.text ?? was;
  const records = [...(found.records ?? new Map<string, { record: CollectionRecord; text: string }[]>()).entries()].flatMap(([dir, list]) => list.map((r) => ({ dir, record: r.record, text: r.text, changed: false })));
  const renamedIds = new Map<string, string>();

  for (const [role, piece] of found.pieces) {
    const now = after.parts.get(role);
    // A piece the old answers did not bring, kept from before them: it takes what the new bring, its board's columns as they are.
    const fresh = !before.parts.has(role);
    const was = before.parts.get(role) ?? (now ? ({ ...now, fields: [], blocks: [], views: [], rules: [], records: [], columns: [], notes: [] } as unknown as Part) : undefined);
    if (!was || was.kind !== piece.kind) continue;
    const name = partName({ ...was, path: piece.path } as Part);

    if (piece.kind === 'collection' && was.kind === 'collection') {
      const at = now?.kind === 'collection' ? now : null;
      const schema = schemas.get(piece.path) ?? (JSON.parse(piece.text) as Schema);
      const own = records.filter((r) => r.dir === piece.path);
      let touched = false;
      // A view compared as it is written: what the template makes, read back from a schema.
      const written = (v: View) => JSON.stringify(parseSchema(JSON.stringify({ version: 2, fields: schema.fields, views: [v] })).views?.[0] ?? null);

      // Views: the old answers' go where they are as written; the new answers' come.
      for (const v of was.views) {
        if (at?.views.some((o) => o.id === v.id)) continue;
        const there = (schema.views ?? []).find((o) => o.id === v.id);
        if (!there) continue;
        if (written(there) === written(v)) {
          schema.views = schema.views!.filter((o) => o !== there);
          if (schema.defaultView === v.id) delete schema.defaultView;
          touched = true;
          edit.takenOff.push({ kind: 'collection', name, what: t('apps.edit.viewOff', { view: v.name }) });
        } else edit.kept.push({ kind: 'collection', name, what: t('apps.edit.viewYours', { view: v.name }) });
      }
      for (const v of at?.views ?? []) {
        if (was.views.some((o) => o.id === v.id) || (schema.views ?? []).some((o) => o.id === v.id)) continue;
        schema.views = [...(schema.views ?? []), v];
        if (at!.defaultView === v.id && (schema.defaultView ?? null) === (was.defaultView ?? null)) schema.defaultView = v.id;
        touched = true;
        plan.added.push({ kind: 'collection', name, what: t('apps.edit.viewOn', { view: v.name }) });
      }

      // Choices: one typed anew is renamed, in the records and the views too; one gone goes where nothing holds it.
      const choices: ChoiceRenames = {};
      for (const old of was.fields) {
        if (old.type !== 'select' && old.type !== 'multi-select') continue;
        const field = at?.fields.find((f) => f.key === old.key && f.type === old.type);
        const there = schema.fields.find((f) => f.key === old.key && f.type === old.type);
        if (!field || !there) continue;
        for (const option of old.options ?? []) {
          if (field.options?.includes(option) || !there.options?.includes(option)) continue;
          const label = there.label ?? there.key;
          const count = found.records ? own.filter((r) => holds(r.record.values[old.key], option)).length : null;
          const to = renames.get(option);
          if (to && field.options?.includes(to)) {
            const options = there.options.filter((o) => o !== to);
            options[options.indexOf(option)] = to;
            there.options = options;
            if (there.colors?.[option]) {
              const { [option]: color, ...rest } = there.colors;
              there.colors = { ...rest, [to]: color! };
            }
            (choices[old.key] ??= {})[option] = to;
            touched = true;
            edit.changed.push({ kind: 'collection', name, what: followed(t('apps.edit.choiceRenamed', { field: label, from: option, to }), t('apps.edit.recordsFollow', { count: count ?? 0 }), count ?? 0) });
          } else if (count === 0) {
            there.options = there.options.filter((o) => o !== option);
            if (there.colors?.[option]) {
              const { [option]: _, ...rest } = there.colors;
              there.colors = rest;
            }
            touched = true;
            edit.takenOff.push({ kind: 'collection', name, what: t('apps.edit.choiceOff', { field: label, choice: option }) });
          } else edit.kept.push({ kind: 'collection', name, what: t('apps.edit.choiceKept', { field: label, choice: option, count: count ?? 1 }) });
        }
      }
      if (Object.keys(choices).length > 0) {
        schema.views = renameInViews(schema, choices).views;
        for (const r of own) {
          const values = renameChoices(r.record.values, choices);
          if (values !== r.record.values) Object.assign(r, { record: { ...r.record, values }, changed: true });
        }
      }

      // Rules and buttons the old answers wrote: taken off as they were written, kept where changed.
      const rulesPath = join(piece.path, RULES_FILE);
      let rules = textOf(rulesPath, piece.rules);
      const rulesWere = rules;
      for (const r of rules ? was.rules : []) {
        if (at?.rules.some((o) => o.kind === r.kind && o.name === r.name)) continue;
        if (rules!.includes(r.src)) {
          rules = withoutRule(rules!, r.src);
          edit.takenOff.push({ kind: 'collection', name, what: t(r.kind === 'action' ? 'apps.edit.buttonOff' : 'apps.edit.ruleOff', { rule: r.name }) });
        } else if (rules!.includes(r.src.match(/^\w+\("[^"]*"/)?.[0] ?? JSON.stringify(r.name))) edit.kept.push({ kind: 'collection', name, what: t('apps.edit.ruleYours', { rule: r.name }) });
      }
      if (rules !== rulesWere) file(rulesPath, rules!, piece.rules);

      // A record an answer set up and typed anew is renamed; one gone stays.
      for (const seed of at ? was.records : []) {
        const from = String(seed.name ?? '');
        if (!from || at!.records.some((r) => String(r.name ?? '').toLowerCase() === from.toLowerCase())) continue;
        const r = own.find((o) => o.record.name.toLowerCase() === from.toLowerCase());
        if (!r) continue;
        const to = renames.get(from);
        if (to && at!.records.some((o) => String(o.name ?? '') === to) && !own.some((o) => o.record.name.toLowerCase() === to.toLowerCase())) {
          const key = nameField(schema)?.key;
          Object.assign(r, { record: { ...r.record, name: to, values: key ? { ...r.record.values, [key]: to } : r.record.values }, changed: true });
          renamedIds.set(r.record.id, to);
          edit.changed.push({ kind: 'collection', name, what: t('apps.edit.recordRenamed', { from, to }) });
        } else edit.kept.push({ kind: 'collection', name, what: t('apps.edit.recordKept', { record: r.record.name }) });
      }

      // Fields the old answers brought: they stay, with what is in them.
      const left = at ? was.fields.filter((f) => !at.fields.some((o) => o.key === f.key)).flatMap((f) => schema.fields.filter((o) => o.key === f.key).map((o) => o.label ?? o.key)) : [];
      if (left.length > 0) edit.kept.push({ kind: 'collection', name, what: t('apps.edit.fieldsKept', { fields: listed(left), count: left.length }) });
      if (!at) edit.kept.push({ kind: 'collection', name, what: own.length > 0 ? t('apps.edit.collectionKept', { count: own.length }) : t('apps.edit.asItIs') });
      if (touched) file(join(piece.path, COLLECTION_FILE), serializeSchema(schema), piece.text);
    } else if (piece.kind === 'board' && was.kind === 'board') {
      const at = now?.kind === 'board' ? now : null;
      const data = JSON.parse(textOf(piece.path, piece.text)!) as Board;
      const columns = data.columns ?? [];
      const cards = data.cards ?? [];
      let touched = false;
      const inColumn = (id: string) => cards.filter((c) => c.column === id).length;
      const olds = was.columns.map(([n]) => n);
      const news = at?.columns.map(([n]) => n) ?? olds;
      if (at && !fresh && !same(olds, news)) {
        for (const column of [...columns]) {
          if (!olds.includes(column.name) || news.includes(column.name)) continue;
          const to = renames.get(column.name);
          const count = inColumn(column.id);
          // A board keeps a column for what is done.
          const last = column.kind === 'done' && columns.filter((c) => c.kind === 'done').length === 1;
          if (to && news.includes(to) && !columns.some((c) => c.name === to)) {
            edit.changed.push({ kind: 'board', name, what: followed(t('apps.edit.columnRenamed', { from: column.name, to }), t('apps.edit.cardsFollow', { count }), count) });
            column.name = to;
            touched = true;
          } else if (count === 0 && !last) {
            columns.splice(columns.indexOf(column), 1);
            touched = true;
            edit.takenOff.push({ kind: 'board', name, what: t('apps.edit.columnOff', { column: column.name }) });
          } else edit.kept.push({ kind: 'board', name, what: t('apps.edit.columnKept', { column: column.name, count }) });
        }
        at.columns.forEach(([n, kind], i) => {
          // One the person took off before is not put back.
          if (columns.some((c) => c.name === n) || olds.includes(n)) return;
          const prev = at.columns.slice(0, i).reverse().find(([p]) => columns.some((c) => c.name === p));
          columns.splice(prev ? columns.findIndex((c) => c.name === prev[0]) + 1 : 0, 0, { id: newId(), name: n, kind });
          touched = true;
          plan.added.push({ kind: 'board', name, what: t('apps.edit.columnOn', { column: n }) });
        });
      }
      if (!at) edit.kept.push({ kind: 'board', name, what: cards.length > 0 ? t('apps.edit.boardKept', { count: cards.length }) : t('apps.edit.asItIs') });
      if (touched) file(piece.path, `${JSON.stringify({ ...data, columns }, null, 2)}\n`, piece.text);
    } else if (!now) edit.kept.push({ kind: piece.kind, name, what: t('apps.edit.asItIs') });
  }

  // A record renamed: the links to it say its new name.
  if (renamedIds.size > 0) {
    for (const r of records) {
      let values = r.record.values;
      for (const [key, value] of Object.entries(values)) {
        const link = (v: unknown) => (v && typeof v === 'object' && 'id' in v && renamedIds.has((v as { id: string }).id) ? { ...(v as object), name: renamedIds.get((v as { id: string }).id)! } : v);
        const next = Array.isArray(value) ? value.map(link) : link(value);
        if (JSON.stringify(next) !== JSON.stringify(value)) values = { ...values, [key]: next as CollectionRecord['values'][string] };
      }
      if (values !== r.record.values) Object.assign(r, { record: { ...r.record, values }, changed: true });
    }
  }
  for (const r of records) if (r.changed && schemas.has(r.dir)) file(r.record.path, serializeRecord(r.record, schemas.get(r.dir)!), r.text);
}

/** The About note's section of each template whose answers changed, written anew where it is as the app wrote it; else kept. */
function editAbout(about: { path: string; text: string }, ids: TemplateId[], before: Draft, after: Draft, plan: AppPlan, file: EditContext['file']) {
  const name = basename(about.path).replace(/\.md$/, '');
  // Each piece is said to be set up with the first template that has it, as the note was written; a section added later says none.
  const fromOf = (sections: Draft['sections']) => {
    const from = new Map<string, string>();
    for (const { section } of sections) for (const role of section.pieces) if (!from.has(role)) from.set(role, section.title);
    return from;
  };
  let text = plan.files.find((f) => f.path === about.path)?.text ?? about.text;
  for (const id of ids) {
    const old = before.sections.find((s) => s.id === id)?.section;
    const now = after.sections.find((s) => s.id === id)?.section;
    if (!old || !now) continue;
    const ways: [Map<string, string>, Map<string, string>][] = [[fromOf(before.sections), fromOf(after.sections)], [new Map(), new Map()]];
    const way = ways.find(([from]) => text.includes(aboutSection(old, before.parts, from, dirname(about.path))));
    if (!way) {
      plan.edit!.kept.push({ kind: 'note', name, what: t('apps.edit.aboutYours', { section: now.title }) });
      continue;
    }
    const was = aboutSection(old, before.parts, way[0], dirname(about.path));
    const next = aboutSection(now, after.parts, way[1], dirname(about.path));
    if (was === next) continue;
    text = text.replace(was, next);
    plan.edit!.changed.push({ kind: 'note', name, what: t('apps.edit.aboutSection', { section: now.title }) });
  }
  if (text !== (plan.files.find((f) => f.path === about.path)?.text ?? about.text)) file(about.path, text, about.text);
}

/** What each template sets up, for the wizard's summary: a piece under the first template that has it, with the ones after it that share it. */
function summaries(sections: { id: TemplateId; section: AboutSection }[], draft: Draft, there: ReadonlySet<string>): TemplateSummary[] {
  // A piece the app has already is not set up again.
  const said = new Set<string>(there);
  return sections.map(({ id, section }) => ({
    id,
    title: section.title,
    pieces: section.pieces.flatMap((role) => {
      const part = draft.parts.get(role);
      if (!part || said.has(role)) return [];
      said.add(role);
      const others = sections.filter((s) => s.id !== id && s.section.pieces.includes(role)).map((s) => s.id);
      return [{ kind: part.kind, name: partName(part), with: others, records: part.kind === 'collection' ? part.records.length : 0 }];
    }),
    buttons: draft.buttons.get(id) ?? [],
    glance: section.glance,
  }));
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
