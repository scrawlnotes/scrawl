import type { MessageKey } from '@scrawlnotes/i18n';
import type { ColumnKind } from '../board';
import type { Field, HomeTile, LayoutBlock, NumberFormat, Schema, View } from '../collection';
import type { PieceInfo } from './pieces';

// An app is a folder of collections, boards, notes and rules set up from ready templates that
// share their pieces: CRM and Sales one Companies, Sales and Stock one Products, every template
// that holds money one Payments (design/scrawl-apps.md). Nothing here writes; build.ts makes a
// plan of the files and install.ts writes it.

/** The file in an app's folder that says it is one: its templates and their answers. */
export const APP_FILE = '_app.json';

/** A record a template sets up gives its notes under this key, which no field can be called: a program's. */
export const RECORD_BODY = '#body';

/** The templates, in the order they are set up: the one before sets up what a shared piece starts with. */
export const TEMPLATE_IDS = ['crm', 'sales', 'support', 'appointments', 'projects', 'budget', 'stock', 'ecommerce', 'product', 'recruiting', 'assets', 'content', 'subscriptions', 'contracts', 'timeoff', 'goals', 'incidents', 'field', 'consulting', 'association', 'finance', 'home', 'health', 'recipes', 'travel', 'split', 'jobs', 'people', 'reading', 'sport', 'gym', 'habits'] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Who a template is for: a business or a person. An app is set up from one side only (design/more-apps.md 1). */
export type Audience = 'business' | 'personal';

/** The groups templates are listed in, of each side, in the order they are shown. */
export const TEMPLATE_GROUPS = { business: ['customers', 'money', 'work'], personal: ['home', 'health', 'life'] } as const;

/** The group a template is listed in: Customers, Money, Work for a business; Money and home, Health, Life for a person. */
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[Audience][number];

/** The side a group is of. */
export const audienceOf = (group: TemplateGroup): Audience => ((TEMPLATE_GROUPS.business as readonly string[]).includes(group) ? 'business' : 'personal');

/** A row of a rows answer: a value for each of its question's columns, by key. */
export interface AnswerRow {
  [column: string]: string | number;
}

/** An answer: a choice's value, yes or no, the choices or the items of a list, a line of text, the rows of a table. */
export type Answer = string | boolean | string[] | AnswerRow[];

export interface Answers {
  [key: string]: Answer;
}

/** How a question is asked: one choice, yes or no, several choices, a list to change, a line of text, rows of a few fields each. */
export type QuestionKind = 'choice' | 'yesno' | 'multi' | 'list' | 'text' | 'rows';

/**
 * A column of a rows question (design/more-apps.md 4.1): its key, what it is called, and what is
 * written in it: a line, a number, one of its options, or a day of the month; the first one the
 * row's name, a row without it left out.
 */
export interface QuestionColumn {
  key: string;
  label: MessageKey;
  type: 'text' | 'number' | 'choice' | 'day';
  /** A choice's options, as they are kept and shown. */
  options?: string[];
  /** Said in it while it is empty: "Amount". */
  placeholder?: MessageKey;
}

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
  /** Its default where the usual one does not fit, by the region of the device that asks: `TR`. */
  regional?: { [region: string]: Answer };
  /** Asked only when this holds; else its answer is its default, and the template reads it so. */
  when?: (asking: Asking) => boolean;
  /** The key of the question of the same template it hangs on: the wizard shows it under that one. */
  under?: string;
  /** The other template it is asked because of: the wizard says so above it. */
  because?: TemplateId;
  /** A line under it saying what the answer does. */
  help?: MessageKey;
  /** A list's button that adds an item: "Add a stage". */
  add?: MessageKey;
  /** A rows question's columns. */
  columns?: QuestionColumn[];
  /** What a list's items stand for, beside each, where something does: Won is done, the first warehouse the default. */
  hints?: (items: string[]) => (MessageKey | null)[];
}

export interface AppTemplate {
  id: TemplateId;
  /** Kept in `_app.json`, for a later version of the template to know what it set up. */
  version: number;
  group: TemplateGroup;
  name: MessageKey;
  /** Its name in a word, where another template's piece is said to be shared with it: "with Stock". */
  short: MessageKey;
  /** Its card's icon, by the name the app's icons go by. */
  icon: string;
  /** What it is for, in a line. */
  what: MessageKey;
  /**
   * A person's template goes in one app only with these, which share its data: Travel with Shared
   * expenses, Sport with Gym; with none, it is an app of its own (design/more-apps.md 1). A
   * business's goes with any of its side.
   */
  goesWith?: readonly TemplateId[];
  questions: Question[];
  /** Whether it holds money with these answers, for the app's currencies to be asked. */
  money: (answers: Answers) => boolean;
  /** The pieces it sets up, by role, with its answers and the templates set up with it. */
  pieces: (answers: Answers, app: Chosen) => string[];
  /**
   * Its module's menu in the app's tab (design/app-home.md 9): the roles of its screens, in their
   * order, those it sets up shown; a piece that is another's lines, or its About note, is not one.
   */
  menu: readonly MenuEntry[] | ((answers: Answers) => readonly MenuEntry[]);
  /** What its answers call its own pieces, where they name them: Memberships for Subscriptions. */
  names?: (answers: Answers, app: Chosen) => { [role: string]: Pick<PieceInfo, 'name' | 'singular' | 'about'> };
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
  /** The day it is set up, `YYYY-MM-DD`: this year's holidays are this year's. */
  readonly today: string;
  /** Whether the app has the piece, set up now or before. */
  hasPiece(role: string): boolean;
  /** The piece's path, for a link or a rollup. */
  path(role: string): string;
  /** The piece's name, as a rule names it: `add("Stock movements", …)`. */
  called(role: string): string;
  /** Adds a field to the piece, a collection or a board; one of the same key is kept as it is. */
  field(role: string, field: Field): void;
  /** Adds a block to the right of a collection's record screen, once. */
  /** `column`, from 1, puts it in a column of its own: a trip's bookings in the middle, its packing on the right. */
  block(role: string, block: LayoutBlock & { column?: number }): void;
  /** Adds a view to a collection as it is set up, once by its id, the one it opens on with `opens`; a collection there before keeps its own views. */
  view(role: string, view: View, opens?: boolean): void;
  /** The plain table's columns after the first, by key. */
  tableColumns(role: string, keys: string[]): void;
  /** What the collection's box on the app's Home says: a value beside each record, a total, sums. */
  homeTile(role: string, tile: HomeTile): void;
  /** The record window's fields in this order, by key, the others after them; the table keeps the fields' order. */
  formOrder(role: string, keys: string[]): void;
  /** A field at the top of another column of the record's window, from 1: a trip's kind over its packing. */
  place(role: string, key: string, column: number): void;
  /** A new record's window asks only these fields, its title and its stages; the rest once it is made. */
  newForm(role: string, keys: string[]): void;
  /** The record's window opens with its name as its title and this field's line under it. */
  head(role: string, sub: string, steps?: string): void;
  /** What each row says small under its name, and the field of its picture beside it: "TV · 2024 · Netflix" and a cover. */
  line(role: string, sub: string, cover?: string): void;
  /** The record's window keeps only what is attached to it, a receipt, or no notes at all. */
  notes(role: string, notes: 'attach' | false): void;
  /** Adds a rule to a collection's `_rules.js`, once by its name. */
  rule(role: string, chunk: RuleChunk): void;
  /** Adds a record to a collection as it is set up: a budget line, a warehouse. */
  record(role: string, values: { [key: string]: string | number | boolean | string[] }): void;
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

/** A screen of an app's menu as `_app.json` keeps it (design/app-home.md 8.1): its path in the app's folder, and the view it opens on, by its id. */
export interface MenuScreenFile {
  path: string;
  view?: string;
  /** What a screen that opens on a view is called: Books, Anime; else its piece's name. */
  name?: string;
}

/** A screen of a template's menu: a role, or a role opened on one of its views and called by its name (Reading's Books, Anime). */
export type MenuEntry = string | { role: string; view: string; name: string };

/** A module of an app's menu as `_app.json` keeps it: its name, the template it is of when it is one's, its screens in order. */
export interface MenuModuleFile {
  name: string;
  template?: TemplateId;
  screens: MenuScreenFile[];
}

/** An app's menu as the person set it with Edit menu (design/app-home.md 6, 8.1); without one, the templates' menu. */
export interface AppMenuFile {
  modules: MenuModuleFile[];
  /** The screens hidden, by path in the app's folder, `#` and its view after it for one that opens on a view: in the menu nowhere, their files where they are. */
  hidden?: string[];
  /** What Home shows: Today and the module cards, both unless false. */
  home?: { today?: boolean; cards?: boolean };
}

/**
 * `_app.json`: the app's name, its currencies and the templates it was set up with, with their
 * answers; its menu when the person set one, and its icon when it was given one (an app of no
 * template, design/app-home.md 5.5).
 */
export interface AppFile {
  version: 1;
  name: string;
  currencies: string[];
  templates: InstalledTemplate[];
  menu?: AppMenuFile;
  icon?: string;
}

/** A rule of a collection's `_rules.js`, added once by its name: the check's message, the button's or the onSave's name. */
export interface RuleChunk {
  kind: 'check' | 'action' | 'onSave' | 'onChange';
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
  /** What happens by itself in a few words each, for the wizard's summary. */
  glance: string[];
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
  /** The views it starts with: a calendar. */
  views: View[];
  /** The view it opens on, by its id. */
  defaultView?: string;
  /** The plain table's columns after the first. */
  columns?: string[];
  /** What its box on the app's Home says. */
  home?: HomeTile;
  /** Its window's fields in this order, the others after them: a transaction's amount first. */
  order?: string[];
  /** Fields in another column than the first, by key. */
  places?: { [key: string]: number };
  /** Its window's title the record's name with this line under it. */
  head?: { sub: string; steps?: string };
  line?: Schema['line'];
  /** Its window's notes: only what is attached, or none. */
  notes?: 'attach' | false;
  /** The fields a new record's window asks. */
  newForm?: string[];
  rules: RuleChunk[];
  /** The records it starts with. */
  records: { [key: string]: string | number | boolean | string[] }[];
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
  /** The same, a piece each: its name and what is added to it, "2 fields, 1 rule"; the About note's new section too. */
  added: { kind: Part['kind'] | 'note'; name: string; what: string }[];
  /** What was left as it was: a field of the same key and another type. */
  notes: string[];
  /** Why what is added would not work, said as what to change; set only when the plan was asked for anyway, and then it is not to be written. */
  blocked?: string[];
  /** What each template set up sets up, for the wizard's summary: in the order they are set up, a piece under the first that has it. */
  templates: TemplateSummary[];
  /** Set when the plan changes the answers of templates set up before (Edit app): `added` says what is added, this the rest. */
  edit?: AppEdit;
}

/** A piece and what changing answers does to it, in plain words: "Deals", "Proposal is now Quote; its 4 cards follow". */
export interface EditItem {
  kind: Part['kind'] | 'note' | 'app';
  name: string;
  what: string;
}

/** What changing answers does besides adding (design/edit-app.md 2): settings go, data stays. */
export interface AppEdit {
  /** No answer is changed: nothing is written. */
  same: boolean;
  /** The templates whose answers are changed. */
  templates: TemplateId[];
  /** What is changed in place: a column or a choice renamed, a record renamed, the About note's section. */
  changed: EditItem[];
  /** The settings the old answers brought that go: rules and buttons, views, a column or a choice nothing holds. */
  takenOff: EditItem[];
  /** What stays, and why: the data, and a setting the person changed. */
  kept: EditItem[];
  /** The app's name before, when it is named anew: its folder and its About note take the new one. */
  renamed?: string;
}

/** What a template sets up, as the wizard's summary says it. */
export interface TemplateSummary {
  id: TemplateId;
  title: string;
  /** Its pieces, each with the templates after it that share it, and how many records it starts with. */
  pieces: { kind: Part['kind']; name: string; with: TemplateId[]; records: number }[];
  /** The names of the buttons it adds. */
  buttons: string[];
  glance: string[];
}
