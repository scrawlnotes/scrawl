import type { MessageKey } from '@scrawlnotes/i18n';
import type { ColumnKind } from '../board';
import type { Field, LayoutBlock, NumberFormat } from '../collection';

// An app is a folder of collections, boards, notes and rules set up from ready templates that
// share their pieces: CRM and Sales one Companies, Sales and Stock one Products, every template
// that holds money one Payments (design/scrawl-apps.md). Nothing here writes; build.ts makes a
// plan of the files and install.ts writes it.

/** The templates, in the order they are set up: the one before sets up what a shared piece starts with. */
export const TEMPLATE_IDS = ['crm', 'sales', 'support', 'projects', 'budget', 'stock', 'product'] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** The group a template is listed in. */
export type TemplateGroup = 'customers' | 'work' | 'money';

/** An answer: a choice's value, yes or no, the choices or the items of a list, a line of text. */
export type Answer = string | boolean | string[];

export interface Answers {
  [key: string]: Answer;
}

/** How a question is asked: one choice, yes or no, several choices, a list to change, a line of text. */
export type QuestionKind = 'choice' | 'yesno' | 'multi' | 'list' | 'text';

/** What a question is asked from: the templates chosen, the template's answers so far. */
export interface Asking {
  chosen: ReadonlySet<TemplateId>;
  answers: Answers;
}

export interface Question {
  /** The key its answer is kept by in `_app.json`. */
  key: string;
  kind: QuestionKind;
  /** The question, as the wizard and the agent's guide say it. */
  label: MessageKey;
  /** A choice's or a multi's options, by value, with what each says. */
  options?: { value: string; label: MessageKey }[];
  default: Answer;
  /** Asked only when this holds; else its answer is its default, and the template reads it so. */
  when?: (asking: Asking) => boolean;
}

export interface AppTemplate {
  id: TemplateId;
  /** Kept in `_app.json`, for a later version of the template to know what it set up. */
  version: number;
  group: TemplateGroup;
  name: MessageKey;
  /** What it is for, in a line. */
  what: MessageKey;
  questions: Question[];
  /** Whether it holds money with these answers, for the app's currencies to be asked. */
  money: (answers: Answers) => boolean;
  /** The pieces it sets up, by role, with its answers and the templates set up with it. */
  pieces: (answers: Answers, app: Chosen) => string[];
  /** Adds its fields, blocks, rules and records to the pieces, and its section to the About note. */
  build: (app: AppDraft, answers: Answers) => void;
}

/** The app's money: its currencies, the first the main one; with more than one, a record that holds money holds its currency. */
export interface Money {
  currencies: string[];
  main: string;
  multi: boolean;
}

/** The templates of the app and their answers, for what one sets up by another's. */
export interface Chosen {
  /** Whether a template is set up in the app, now or before, or brought by another's answer. */
  has(id: TemplateId): boolean;
  /** A template's answers, its defaults for what it was not asked. */
  answers(id: TemplateId): Answers;
}

/** The app as the templates build it, each adding to its pieces. */
export interface AppDraft extends Chosen {
  /** The app's name, its folder's. */
  readonly title: string;
  readonly money: Money;
  /** Whether the app has the piece, set up now or before. */
  hasPiece(role: string): boolean;
  /** The piece's path, for a link or a rollup. */
  path(role: string): string;
  /** The piece's name, as a rule names it: `add("Stock movements", …)`. */
  called(role: string): string;
  /** Adds a field to the piece, a collection or a board; one of the same key is kept as it is. */
  field(role: string, field: Field): void;
  /** Adds a block to the right of a collection's record screen, once. */
  block(role: string, block: LayoutBlock): void;
  /** Adds a rule to a collection's `_rules.js`, once by its name. */
  rule(role: string, chunk: RuleChunk): void;
  /** Adds a record to a collection as it is set up: a budget line, a warehouse. */
  record(role: string, values: { [key: string]: string | number | boolean }): void;
  /** A board's columns and how it is shown, when it is set up. */
  columns(role: string, columns: [string, ColumnKind][], look?: { phasesOn?: boolean; list?: boolean }): void;
  /** A note in a folder piece: a saved reply. */
  note(role: string, name: string, text: string): void;
  /** A money field's format: in the main currency, or, with more than one, in the one the record holds. */
  format(own: boolean): NumberFormat;
  about(section: AboutSection): void;
}

/** One template's answers as `_app.json` keeps them. */
export interface InstalledTemplate {
  id: TemplateId;
  version: number;
  answers: Answers;
}

/** `_app.json`: the app's name, its currencies and the templates it was set up with, with their answers. */
export interface AppFile {
  version: 1;
  name: string;
  currencies: string[];
  templates: InstalledTemplate[];
}

/** A rule of a collection's `_rules.js`, added once by its name: the check's message, the button's or the onSave's name. */
export interface RuleChunk {
  kind: 'check' | 'action' | 'onSave';
  name: string;
  src: string;
}

/** What the About note says of a template, built from what was set up. */
export interface AboutSection {
  title: string;
  /** What it's for: a sentence or two. */
  what: string;
  /** How to use it: short steps. */
  how: string[];
  /** What happens by itself: the rules and buttons in plain words. */
  auto: string[];
  /** How we work: the team's own ways, filled with the template's. */
  work: string[];
  /** What it set up, by role, for the list of what is in it; a piece another template set up is said there. */
  pieces: string[];
}

/** A collection of the app as it is being built. */
export interface CollectionPart {
  kind: 'collection';
  role: string;
  path: string;
  singular?: string;
  /** What it holds, said in the About note. */
  about: string;
  fields: Field[];
  /** The blocks on the right of its record screen. */
  blocks: LayoutBlock[];
  rules: RuleChunk[];
  /** The records it starts with. */
  records: { [key: string]: string | number | boolean }[];
  /** Set when it was there before: its files as they were. */
  was?: { schema: string; rules: string | null };
}

/** A board of the app as it is being built. */
export interface BoardPart {
  kind: 'board';
  role: string;
  path: string;
  about: string;
  columns: [string, ColumnKind][];
  fields: Field[];
  phasesOn?: boolean;
  list?: boolean;
  was?: { board: string };
}

/** A folder of notes: Saved replies. */
export interface FolderPart {
  kind: 'folder';
  role: string;
  path: string;
  about: string;
  notes: { name: string; text: string }[];
  was?: true;
}

export type Part = CollectionPart | BoardPart | FolderPart;

/** A file of the plan: what is written, and what was there before, null for a new one. */
export interface PlannedFile {
  path: string;
  text: string;
  before: string | null;
}

/** What setting up an app, or adding to one, will do: the folders and files, in the order they are written, and what is said of it. */
export interface AppPlan {
  folder: string;
  app: AppFile;
  /** The folders made, the app's own first. */
  dirs: string[];
  files: PlannedFile[];
  /** What is set up, by path: the collections, the boards, the folders and the About note. */
  created: { kind: 'collection' | 'board' | 'folder' | 'note'; path: string }[];
  /** What is added to what was there, in plain words: "Companies: 2 fields, 1 rule". */
  changed: string[];
  /** What was left as it was: a field of the same key and another type. */
  notes: string[];
}
