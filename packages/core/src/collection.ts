import { t } from '@scrawlnotes/i18n';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { clockOf, dateOf, isClock, isDay, isDateTime, isYearless, timeOf, yearlessOf } from './day';
import { clockValue, dayValue, type Env, evaluate, formulaInfo, fromRuntime, type Kind, kindWords, type Node, parseExpression, type RV, type Scope, toRuntime } from './lang';
import { basename, type Entry, join, type VaultFs } from './fs';
import { fileNameOf, shownName } from './names';
import { freePath, moveTree } from './paths';
import { RULES_FILE, rulesPath } from './rules';
import { readSubtasks, type Subtask, writtenSubtask } from './subtasks';

// A collection is a folder with a schema file in it, `_collection.json`, and one Markdown file
// per record, named after the record's id: the record's fields in YAML front matter, free text
// under it. A record is a note, so everything made for notes (the editor, history, the trash,
// line merging in sync) works on it. A record's name and code are fields of their own types,
// one of each at most; what shows of a record elsewhere, in a link, comes from them. The schema
// also holds the layout of the record screen: columns of sections of elements, which a template
// brings and the Fields window changes. See the Collection views of design/mockups.html and
// PLAN.md 4.6.

export const COLLECTION_FILE = '_collection.json';
export const RECORD_EXT = '.md';

export type FieldType = 'name' | 'code' | 'text' | 'number' | 'date' | 'time' | 'select' | 'multi-select' | 'checkbox' | 'url' | 'email' | 'phone' | 'person' | 'link' | 'formula' | 'lookup' | 'rollup';

export const FIELD_TYPES: readonly FieldType[] = ['name', 'code', 'text', 'number', 'date', 'time', 'select', 'multi-select', 'checkbox', 'url', 'email', 'phone', 'person', 'link', 'formula', 'lookup', 'rollup'];

/** What a rollup does with what links to the record: counts it, adds it up, averages it, or takes its most or least. */
export type RollupFn = 'count' | 'sum' | 'avg' | 'max' | 'min' | 'list';

export const ROLLUP_FNS: readonly RollupFn[] = ['count', 'sum', 'avg', 'max', 'min', 'list'];

/**
 * A value worked out from what links to the record: the records of a collection or the cards of
 * a board (`from`, its path), counted, or a field of theirs added up or taken at its most or
 * least: a company's last contact, the latest day of its activities. Shown, never written.
 */
export interface Rollup {
  from: string;
  fn: RollupFn;
  /** The field of those records or cards; none to count them. */
  field?: string;
  /** For a board: its open cards only. */
  open?: boolean;
  /** For a board: its cards in a done column only, a company's deals won (design/scrawl-apps.md 3.1). */
  won?: boolean;
  /** Only those records or cards that meet these conditions, as the Filter window's: the transactions whose direction is Out. */
  where?: Condition[];
  /** The one link field of those records it goes through, when they have more than one to here: a transfer's To account, apart from its account (design/more-apps.md 4.1). */
  via?: string;
}

/** A field of the record a link field points at, shown as a field of this one: a transaction's customer, through its project. */
export interface Lookup {
  /** The key of this collection's link field. */
  link: string;
  /** The key of the field of the linked record. */
  field: string;
}

/** How a number is written: plain, as money or as a share; money in the field's currency, or in the one a field of the record holds; with so many decimals. */
export interface NumberFormat {
  /** A duration is minutes, a second a sixtieth of one, written as hours, minutes and seconds: 1 h 30 min, 90 s as 1 min 30 s. */
  style: 'number' | 'currency' | 'percent' | 'duration';
  /** The currency's code, `TRY`, for every record. */
  currency?: string;
  /** The key of the record's field that holds its currency's code, for a record each in its own. */
  currencyField?: string;
  /** 0 to 4; unset for as many as the number has, two at most, or the currency's own. */
  decimals?: number;
  /** A percent shown as a bar in the table (design/more-apps.md 4.9): a goal's progress. */
  bar?: true;
  /** The field whose value the bar says beside it, "7 of 24 books"; else the percent. */
  caption?: string;
  /** A bar of something used up, a budget: yellow from 80%, red over all of it (design/scrawl-apps.md 3.3). */
  warn?: true;
}

export const FORMAT_STYLES: readonly NumberFormat['style'][] = ['number', 'currency', 'percent', 'duration'];

/** A field's default value: one the field holds, or `=` and an expression worked out when a record is made (`=today()`, `=next("PRJ-", 4)`). */
export type DefaultValue = string | number | boolean | string[];

/** The types a schema has one field of at most: the record's name, and its code. */
export const SINGLE_TYPES: readonly FieldType[] = ['name', 'code'];

/** The colors a choice can be shown in, by name, so that a person or an agent writes them as words. */
export const OPTION_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;

export type OptionColor = (typeof OPTION_COLORS)[number];

export interface Field {
  /** The key in the front matter: letters, digits and underscores. */
  key: string;
  label: string;
  type: FieldType;
  /** The choices of a select or a multi-select. */
  options?: string[];
  /** The color of each choice that has one, by the choice; the others are colored by their text. */
  colors?: { [option: string]: OptionColor };
  required?: boolean;
  /**
   * Shown on the record's form only when these hold, all of them (design/shown-when.md): Store when
   * Type is Warranty. Its value stays when it is not shown; the table and the files keep it.
   */
  when?: Condition[];
  /** A text's or a name's box offers what the collection's other records hold in it as it is typed: a doctor written before. */
  suggest?: boolean;
  /** A day whose year may be left out, a birthday: written `--MM-DD` then (design/more-apps.md 4.7). */
  yearless?: boolean;
  /**
   * A choice gone through in order, as a job application's stages (design/more-apps.md 4.6): a bar
   * of its steps on the form, a line of dots in a table; `end` the options after the line, the
   * ones it stops at (Accepted, Rejected), `no` those of them that end it badly.
   */
  steps?: { end: string[]; no: string[]; chip?: true };
  /** Its label as another field's choice is: a booking's Starts, Departs for a flight and Check in for a hotel (design/more-apps.md 4.5). */
  labelBy?: { field: string; labels: { [option: string]: string } };
  /**
   * A choice's options as another field's choice is (design/more-apps.md 4.8): by its value, each
   * option offered and what it is called then; one not there is not offered. A work's status is
   * Watching for an anime and Reading for a book, a film only to watch or watched. A value with no
   * entry offers them all as they are.
   */
  choicesBy?: { field: string; by: { [value: string]: { [option: string]: string } } };
  /** Shown before this field on its line, the two as one: an expense's currency before its amount. */
  beside?: string;
  /** A rate said as a sentence, "1 EUR = 37,10 ₺": the field of the currency it is of, and the money it is in. */
  rate?: { field: string; main: string };
  /** A name that may be left empty, its rules writing it as the record is saved: a transaction's Description, its category's name (design/more-apps.md 4.1). */
  optional?: boolean;
  /** A line under it on the form saying what is written in it, where its name alone does not: "Left empty, the category's name". */
  help?: string;
  /** A link picked on the form from chips of its records, the most used first: a transaction's category; a choice picked from its options side by side: Out, In, Transfer. */
  chips?: boolean;
  /**
   * A link whose choices are those of the record's group: the key of a link field it and its
   * records both have, an expense's payer one of the people of its trip (design/more-apps.md 4.11).
   */
  within?: string;
  /** A link's target: the path of the collection its records come from. */
  collection?: string;
  /** A link that holds several records. */
  many?: boolean;
  /** A formula's expression over the record's own fields: `qty * unit_price`, `today() - last_contact`. Not written to the file. */
  formula?: string;
  /** A rollup's source and what it does. Not written to the record's file. */
  rollup?: Rollup;
  /** A lookup's link and field. Not written to the record's file. */
  lookup?: Lookup;
  /** What a new record starts with, as typed or worked out when it is made; written to its file as any value. Not for what is worked out. */
  default?: DefaultValue;
  /** How a number, or a formula, lookup or rollup giving one, is written. */
  format?: NumberFormat;
  /** A date that may hold a time too, `2026-10-22T14:30`; one with no time is all day. */
  time?: boolean;
  /** A text holding a signature drawn with a finger, as the path of its strokes (design/scrawl-apps.md 3.3): shown as it was drawn. */
  signature?: true;
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

/** The key the templates give their name field. */
export const NAME_KEY = 'name';

/**
 * An element of the record screen: a field, the body, the records of another collection that
 * link here, cards and tasks, or the record's own subtasks. Linked records are a list or a timeline, sorted by a field (a
 * timeline by its day, newest first), a list's rows showing the fields named.
 */
export type LayoutItem = { field: string } | (LayoutBlockKind & { when?: Condition[] });

/**
 * A block of the record screen. Any of them may have `when`, as a field's: it is there only while
 * the record's values meet those conditions, all of them (a goal's steps for a goal by its steps,
 * design/more-apps.md 4.9); a column all of whose blocks are away is away too.
 */
type LayoutBlockKind =
  /** The record's notes; with `attach`, only what is attached to it, a receipt or a ticket. */
  | { block: 'body'; attach?: boolean }
  | {
      block: 'linked';
      collection: string;
      sort?: string;
      dir?: 'desc';
      style?: LinkedStyle;
      fields?: string[];
      sums?: boolean;
      group?: string[];
      lines?: boolean;
      edit?: string[];
      /** A group's rows are alternatives, one of them picked: a meal's (design/meal-plans.md); "or" before the second on, a row not ticked not faint, a group picked or not. */
      choose?: boolean;
      /** A ticked row is done and struck through, as on a list (a trip's packing); else one not ticked is, as a move skipped. */
      done?: boolean;
      /** With `choose`, the tick that sets a row apart from the alternatives, said beside it and not counted: eaten off the plan. */
      apart?: string;
      /** With `choose`, the text that says what was had in a row's place: written, its group is picked too, and said changed (design/meal-plans.md 3). */
      instead?: string;
      /**
       * How the rows are shown besides a table (design/more-apps.md 4.5, 4.11): `days`, under a
       * heading for each day, a time, a sign and two lines, as TripIt; `checklist`, a round tick
       * and a name, in groups, as PackPoint; `split`, each of the record's group with a tick and
       * their share, as Tricount.
       */
      look?: LinkedLook;
      /** With `days`: the day and time it is by, the day it ends on, shown again on that day. */
      time?: string;
      end?: string;
      /** With `days`: the choice whose sign is beside a row, and the sign of each option. */
      icon?: string;
      icons?: { [option: string]: string };
      /** With `days`: the field of a row's second line; and what its title says on its first and last day, by its choice: check in, check out. */
      sub?: string;
      startSaid?: { [option: string]: string };
      endSaid?: { [option: string]: string };
      /** With `split`: the record's many-link of who it is for, each row's person, share and parts, and the record's choice of how it is split. */
      pick?: string;
      person?: string;
      amount?: string;
      parts?: string;
      mode?: string;
      /** With `checklist` and no tick: each row with its number, the places to see in order (Wanderlog). */
      numbered?: boolean;
      /** Only the rows that meet these: a company's activities planned, apart from those done (design/scrawl-apps.md 3.1). */
      where?: Condition[];
      /** With a look, what its heading says instead of the collection's name: People, Who pays whom. */
      title?: string;
      /** With `split`: the record's total the shares come to. */
      total?: string;
      /** On a card's window (Board.blocks): + Add presses this of its buttons (Board.press), a deal's Plan. */
      button?: string;
      /** On a phone, the tab it is in with the blocks of the same tab: a company's Activity, its planned and its history (design/scrawl-apps.md 3.1). */
      tab?: string;
      /** What its + Add is called: New quote on a customer, Quote on a deal (design/scrawl-apps.md 3.2). */
      add?: string;
      /** The records that link where this link field of the record points, the record left out: a request's company's other requests (design/scrawl-apps.md 3.3). */
      through?: string;
    }
  /** A formula's text said as a line in a box, not as a field: an order's profit, "₺1.240 · commission ₺248 → ₺412 profit" (design/calendar.md 7). */
  | { block: 'note'; of: string }
  /** The cards that link to the record and the tasks about it; with `board`, only that board's cards, under its name, + Add making one (a company's Deals). */
  | { block: 'cards'; board?: string; tab?: string }
  /** The record's subtasks; `title` and `add` call them by another name: a goal's Steps, Add step. */
  | { block: 'subtasks'; title?: string; add?: string }
  /** A record's month on its calendar that repeats, a day clicked done or not done; over it the values of `fields` (a habit's streak, design/more-apps.md 4.9). */
  | { block: 'days'; fields?: string[] }
  /** The buttons of the collection's rules (`action(…)` in _rules.js). */
  | { block: 'actions' };

/**
 * How a block shows the records that link to the record: newest first by a day, a list, or a table
 * whose rows open their records, the fields `edit` names changed in it (`changesInTable`), with its sums when `sums`, in groups by one field or two when `group`
 * (design/gym.md 4.2): a program's items by their part, a workout's sets by their exercise. A list
 * and a table go up by `sort`, down with `dir`: an exercise's workouts newest first. With
 * `lines` they are the record's lines (design/app-home.md 4): an order's, a program's items, typed
 * in a new record's window and under its row in the table; `false` says they are not, though their
 * role would.
 */
export type LinkedStyle = 'list' | 'timeline' | 'table';

/** How many of `records` are at each of a stepped field's steps, the ones it ends at left out: [["Saved", 6], ["Applied", 7]]. */
export function stepCounts(field: Field, records: readonly { values: Record['values'] }[]): [string, number][] {
  const end = new Set(field.steps?.end ?? []);
  return (field.options ?? []).filter((o) => !end.has(o)).map((o) => [o, records.filter((r) => r.values[field.key] === o).length]);
}

/** What a choice's options are called and which are offered as the record is (`choicesBy`): an anime's Watching; none for a value with no entry. */
const choicesFor = (field: Field, values: Record['values'] | undefined) => {
  const by = field.choicesBy && values ? values[field.choicesBy.field] : null;
  return typeof by === 'string' ? field.choicesBy!.by[by] : undefined;
};

/** The options a choice offers as the record is: an anime's five, a film's two (`choicesBy`). */
export function offeredOptions(field: Field, values: Record['values'] | undefined): string[] {
  const names = choicesFor(field, values);
  return (field.options ?? []).filter((o) => !names || o in names);
}

/** What an option is called as the record is: Watching for an anime's In progress (`choicesBy`). */
export const optionName = (field: Field, option: string, values: Record['values'] | undefined): string => choicesFor(field, values)?.[option] ?? option;

/** The values a record made in a view starts with, what its conditions ask of one choice: Type Anime on the Anime screen (design/more-apps.md 4.8). */
export function viewValues(view: View | undefined, schema: Schema): Record['values'] {
  const values: Record['values'] = {};
  for (const c of view?.conditions ?? []) {
    const field = schema.fields.find((f) => f.key === c.field);
    const one = Array.isArray(c.value) && c.value.length === 1 ? c.value[0]! : null;
    if (c.op === 'is' && one !== null && field && (field.type === 'select' || field.type === 'multi-select') && (field.options ?? []).includes(one)) values[field.key] = field.type === 'select' ? one : [one];
  }
  return values;
}

/** A field's label as the record is: a booking's Starts, Departs for a flight (`labelBy`). */
export function fieldLabel(field: Field, values: Record['values']): string {
  const by = field.labelBy ? values[field.labelBy.field] : null;
  return (typeof by === 'string' && field.labelBy!.labels[by]) || field.label;
}

/**
 * How a table of linked records looks instead: days, a checklist, a split between people; or a
 * thread, a request's messages day by day, each in the color of its `icon` choice, who wrote it
 * and when (`time`) over what it says (`sub`) (design/scrawl-apps.md 3.3).
 */
export type LinkedLook = 'days' | 'checklist' | 'split' | 'thread';

export type LinkedBlock = Extract<LayoutItem, { block: 'linked' }>;

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
  /**
   * The fields kept off the record's window, by key: worked out for the table and its views, or
   * written by the rules, a workout's name. They are in the table, the views and the files as any
   * other; Fields lists them with their eye shut. Without it, the template's (PieceInfo.hidden).
   */
  hidden?: string[];
  /** The fields a new record's window asks, the others after it is made: a job's company, where and its post (design/more-apps.md 4.6). */
  new?: string[];
}

export type CollectionTemplate = 'companies' | 'people' | 'activities' | 'feedback' | 'payments' | 'blank';

export const COLLECTION_TEMPLATES: readonly CollectionTemplate[] = ['companies', 'people', 'activities', 'feedback', 'payments', 'blank'];

/** How records are sorted in the table: by a field key, up or down. */
export interface RecordSort {
  key: string;
  dir: 'asc' | 'desc';
}

/** What a condition of a view asks of a field. */
export type ConditionOp = 'contains' | 'is' | 'is-not' | 'empty' | 'not-empty' | 'gt' | 'lt' | 'before' | 'after' | 'on' | 'true' | 'false';

export const CONDITION_OPS: readonly ConditionOp[] = ['contains', 'is', 'is-not', 'empty', 'not-empty', 'gt', 'lt', 'before', 'after', 'on', 'true', 'false'];

/** A day's condition's value that is always today: "due is before today". */
export const TODAY = 'today';

/** A person's condition's value that is always whoever looks: a request's Mine (design/scrawl-apps.md 3.3). */
export const ME = 'me';

/** The conditions with `me` as whoever looks, by their name; with no name, a condition on `me` holds for no one. */
export const forMe = (conditions: Condition[], name: string | undefined): Condition[] =>
  conditions.map((c) => (Array.isArray(c.value) && c.value.includes(ME) ? { ...c, value: c.value.map((v) => (v === ME ? (name ?? '\u0000') : v)) } : c));

export interface Condition {
  field: string;
  op: ConditionOp;
  /** What is compared with: text, a number, a day, or the choices any of which matches. */
  value?: string | number | string[];
}

/**
 * How a Calendar view lays its records out (design/calendar.md 4): the date field each starts on;
 * how long it is, by a field it ends on or a number field of minutes, else 30 minutes; the choice
 * field it is colored by; and whether its records show in Today and Upcoming.
 */
export interface CalendarSettings {
  start: string;
  end?: string;
  duration?: string;
  color?: string;
  /** Its records in Today and Upcoming; 'today', in Today only, the day it is (design/meal-plans.md 1). */
  upcoming: boolean | 'today';
  /** Its records come on weekdays rather than on a day of their own: a program on its days. */
  repeat?: RepeatSettings;
  /** The button of its rules each of its rows in Today and Upcoming has: Refilled, Done (design/more-apps.md 4.3). */
  button?: string;
  /** The fields its rows in Today and Upcoming say after the collection, in place of its first person and first link. */
  words?: string[];
  /**
   * A tick field, or a formula that is true: a record with it so has its `button` pressed by itself once its day has come,
   * when the app finds it so, with the button's answers as they come (a salary or a rent paid
   * automatically once it has an amount, design/more-apps.md 4.1).
   */
  auto?: string;
  /**
   * The link field whose records are the rows of its Day, a technician's day each, with a row for
   * those given to no one, and those with no day beside it to drag onto a row (design/scrawl-apps.md 3.3).
   */
  lanes?: string;
}

/**
 * A calendar whose records come on weekdays (design/gym.md 4.3): each on the days its `days` holds,
 * from its `from`, each day until a record of another collection closes it. Nothing is written for
 * a day; the days are worked out as they are read.
 */
export interface RepeatSettings {
  /** The multi-select of the weekdays a record comes on: Mon … Sun. */
  days: string;
  /** The date field it comes from; without one, from today. */
  from?: string;
  /** The date field it ends on, its last day; empty or without one, it goes on. */
  until?: string;
  /** What closes a day: a record of `collection` (its path) whose `link` is the record and whose `day` is that day. */
  closedBy: { collection: string; link: string; day: string };
  /** The button that opens a new record of `closedBy` for the day; false for none, `skip` then the day's one button, the day done (a habit's Done). */
  start?: string | false;
  /** The button that closes the day with a record of these values. */
  skip?: { label: string; set: { [key: string]: FieldValue } };
  /** False: a day gone by with nothing closing it is not kept as late; it is gone (a habit's day missed). */
  late?: false;
  /** The number field saying how many days of a week are enough: once that many are closed, its other days that week do not come (a habit three times a week). */
  perWeek?: string;
  /** The collection's tables show its last so many days after the name, a box each, a click closing a day or opening it again (a habit's week, design/more-apps.md 4.9). */
  strip?: number;
}

/** A saved way of looking at the records: a table, which records, in what order, grouped how, with which columns; or a calendar of them. */
export interface View {
  id: string;
  name: string;
  /** A calendar of the records, or a week's sheet of them; unset for a table. */
  kind?: 'calendar' | 'sheet';
  /** The sheet's settings, with `kind`. */
  sheet?: SheetSettings;
  /** The calendar's settings, with `kind`. */
  calendar?: CalendarSettings;
  conditions: Condition[];
  sort?: RecordSort;
  /** The field grouped by; null or unset for none. */
  group?: string | null;
  /** The fields shown as columns, in order; unset for every field. */
  columns?: string[];
  /** The columns' widths in pixels, by field key, once one was dragged; unset for widths that fit their values. */
  widths?: ColumnWidths;
  /** The fields changed in the table, by key (`changesInTable`); unset for none. */
  edit?: string[];
  /** Not a tab of the collection: a calendar kept for Today and Upcoming (design/more-apps.md 4.5). */
  hidden?: boolean;
  /** How many of its records are at each step of this field, over the table: "Saved 6 · Applied 7". */
  counts?: string;
  /** The groups that start closed, by their value, their count shown: what is finished and dropped (design/more-apps.md 4.8). */
  closed?: string[];
  /** The button of its rules each row has, where the record can have it pressed: +1 (design/more-apps.md 4.8). */
  button?: string;
  /** Its button is a round ring at the start of each row, as a list of things to do has it: a CRM's activities' Done. */
  ring?: true;
  /**
   * What is said over its table in one line (design/scrawl-apps.md 3.2), each part over the
   * collection's records: "₺85.110 to collect · ₺19.150 overdue · 3 low".
   */
  sums?: ViewSum[];
  /** The field whose values are chips over the table, each with its count, one picked shows only its records: an order's channel (design/calendar.md 7). */
  chips?: string;
  /** The views of the same set are the tabs of a screen that opens on one of them, and no All: Sales' Quotes, Open, To invoice (design/scrawl-apps.md 3.2). */
  set?: string;
  /** Its button pressed on each of its records in turn, from one button over the table: Reorder all (design/scrawl-apps.md 3.6). */
  all?: string;
}

/**
 * A week of the records as Harvest's timesheet has it (design/scrawl-apps.md 3.3): a row for each
 * record `row` links to, a column for each day by `day`, in each cell what their `value` comes to
 * that day, typed in it.
 */
export interface SheetSettings {
  row: string;
  day: string;
  value: string;
}

/**
 * A part of the line over a view: how many records meet its conditions, or, with `field`, what
 * their values of it add up to, then its label; `warn` says it in red. One that comes to nothing
 * is left out.
 */
export interface ViewSum {
  label: string;
  field?: string;
  conditions?: Condition[];
  warn?: true;
  /** What it says is the value of this field whose records come to most: the best customer. */
  by?: string;
  /** What it comes to over what `per` comes to, as a share: a margin, the profit over the sales. */
  per?: string;
  /** Its label when it counts one: "1 product". */
  one?: string;
}

/**
 * Whether a field can be changed in a table, where a row opens its record: a tick turns at a
 * click, a choice is picked from its list. A table changes the ones it is told to, none unless.
 */
export const changesInTable = (field: Field) => field.type === 'checkbox' || field.type === 'select' || field.type === 'text' || field.type === 'number';

/** Column widths in pixels, by field key. */
export interface ColumnWidths {
  [key: string]: number;
}

/** Reads column widths as a file wrote them: whole pixels, by known field keys. */
export function readWidths(raw: unknown, keys?: ReadonlySet<string>): ColumnWidths | undefined {
  if (!isRecord(raw)) return undefined;
  const widths: ColumnWidths = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (keys && !keys.has(key))) continue;
    widths[key] = Math.round(value);
  }
  return Object.keys(widths).length > 0 ? widths : undefined;
}

export interface Schema {
  /** 2 since a record's name and code are fields of their own types; a file of version 1 is read as one of 2. */
  version: 2;
  template: CollectionTemplate;
  /** What one record is called, `company` for Companies: "New company", "Add company". Unset says "record". */
  singular?: string;
  /** Which piece of an app it is (`companies`, `orders`…), as an app template set it up: what another template looks for to link to it, whatever it is called now. */
  role?: string;
  /** The saved views, in the order they were made. */
  views?: View[];
  /** The view it opens on, by its id, until another is chosen on a device: an app's calendar. */
  defaultView?: string;
  /** The plain table's columns after the first, until others are chosen on a device: a habit's streak, not its workings (design/more-apps.md 4.9). */
  columns?: string[];
  /** What its box on its app's Home says (design/more-apps.md 4.1). */
  home?: HomeTile;
  /** More boxes of it on its app's Home, each of a view: To collect, Quotes, This month (design/scrawl-apps.md 3.2). */
  homes?: HomeTile[];
  /** A record's window opens with its name as its title and the line of this field under it, "12–16 Nov · 5 days · in 14 days" (design/more-apps.md 4.5). */
  head?: { sub: string; steps?: string };
  /** A field said small under each record's name in the table and the list, "TV · 2024 · Netflix"; and one holding its picture's address, beside it (design/more-apps.md 4.8). */
  line?: { sub: string; cover?: string };
  /** The fields; their order is the order of the table's columns. */
  fields: Field[];
  /** The record screen; unset means one column of every field, then the body. */
  layout?: Layout;
}

/** A field's value as it is held: text, a number, a day, a choice, choices, a flag, a link or links, or nothing. */
export type FieldValue = string | number | boolean | string[] | Link | Link[] | null;

export interface Record {
  /** Stable, from the front matter; links from elsewhere use it, and a new record's file is named after it. */
  id: string;
  /** The record's file. */
  path: string;
  /** The value of the schema's name field, empty without one; kept beside the values for what shows the record elsewhere. */
  name: string;
  /** The value of the schema's code field, empty without one. */
  code: string;
  /** By field key; a field the file does not have is absent. */
  values: { [key: string]: FieldValue };
  /** Front matter the schema knows nothing about, kept as it was. */
  extra: { [key: string]: unknown };
  body: string;
  /** Its own subtasks, in their order, from the front matter's `subtasks`; left out when it has none. */
  subtasks?: Subtask[];
}

/** The key of a record's subtasks in its front matter, which no field takes. */
export const SUBTASKS_KEY = 'subtasks';

/** What a collection is called: its folder's name. */
export const collectionName = (dir: string) => shownName(basename(dir));

/** The collection a record's file is in. */
export const collectionOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** Whether a folder's entries make it a collection. */
export const isCollection = (entries: Entry[]) => entries.some((e) => e.kind === 'file' && e.name === COLLECTION_FILE);

/** The schema file of a collection. */
export const schemaPath = (dir: string) => join(dir, COLLECTION_FILE);

/** The schema's name field, when it has one. */
export const nameField = (schema: Pick<Schema, 'fields'>): Field | undefined => schema.fields.find((f) => f.type === 'name');

/** The schema's code field, when it has one. */
export const codeField = (schema: Pick<Schema, 'fields'>): Field | undefined => schema.fields.find((f) => f.type === 'code');

/** Whether another collection can link to this one's records: they show by their name or their code, so it needs one of them. */
export const isLinkable = (schema: Pick<Schema, 'fields'>) => !!nameField(schema) || !!codeField(schema);

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
// Their choices come colored by what they mean: what goes well is green, what is lost red, what
// waits gray or blue.
const NAME: Field = { key: NAME_KEY, label: 'Name', type: 'name' };

/** A company's or a person's last contact: the latest day of the activities that link to it. */
const LAST_CONTACT: Field = { key: 'last_contact', label: 'Last contact', type: 'rollup', rollup: { from: 'Activities', fn: 'max', field: 'date' } };

const TEMPLATE_FIELDS: { [template in CollectionTemplate]: Field[] } = {
  companies: [
    NAME,
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'segment', label: 'Segment', type: 'select', options: ['SMB', 'Mid-market', 'Enterprise'], colors: { SMB: 'teal', 'Mid-market': 'blue', Enterprise: 'purple' } },
    {
      key: 'type',
      label: 'Type',
      type: 'multi-select',
      options: ['customer', 'supplier', 'partner', 'investor'],
      colors: { customer: 'green', supplier: 'orange', partner: 'purple', investor: 'blue' },
    },
    { key: 'owner', label: 'Owner', type: 'person' },
    { key: 'status', label: 'Status', type: 'select', options: ['prospect', 'active', 'churned'], colors: { prospect: 'blue', active: 'green', churned: 'red' } },
    { key: 'tags', label: 'Tags', type: 'multi-select', options: [] },
    LAST_CONTACT,
  ],
  people: [
    NAME,
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'title', label: 'Title', type: 'text' },
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      options: ['referral', 'event', 'inbound', 'outbound'],
      colors: { referral: 'purple', event: 'orange', inbound: 'green', outbound: 'blue' },
    },
    { key: 'status', label: 'Status', type: 'select', options: ['lead', 'active', 'inactive'], colors: { lead: 'blue', active: 'green', inactive: 'gray' } },
    { key: 'tags', label: 'Tags', type: 'multi-select', options: [] },
    LAST_CONTACT,
  ],
  activities: [
    NAME,
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: ['note', 'call', 'meeting', 'email'],
      colors: { note: 'gray', call: 'blue', meeting: 'purple', email: 'yellow' },
      required: true,
    },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'by', label: 'By', type: 'person' },
  ],
  feedback: [
    NAME,
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      options: ['email', 'call', 'interview', 'social', 'support'],
      colors: { email: 'yellow', call: 'blue', interview: 'purple', social: 'pink', support: 'orange' },
    },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'area', label: 'Area', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['new', 'planned', 'done', 'declined'], colors: { new: 'blue', planned: 'yellow', done: 'green', declined: 'gray' } },
  ],
  payments: [
    NAME,
    { key: 'direction', label: 'Direction', type: 'select', options: ['incoming', 'outgoing'], colors: { incoming: 'green', outgoing: 'red' }, required: true },
    { key: 'company', label: 'Company', type: 'link', collection: 'Companies' },
    { key: 'person', label: 'Person', type: 'link', collection: 'People' },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'TRY', 'GBP'], colors: { USD: 'gray', EUR: 'gray', TRY: 'gray', GBP: 'gray' } },
    { key: 'due', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['planned', 'invoiced', 'paid'], colors: { planned: 'gray', invoiced: 'yellow', paid: 'green' } },
    { key: 'invoice_no', label: 'Invoice no', type: 'text' },
    { key: 'paid_on', label: 'Paid on', type: 'date' },
  ],
  blank: [],
};

/**
 * What a collection made from each template is called when it is given no name: the name the
 * other templates' links and blocks look for beside them.
 */
const TEMPLATE_NAMES: Partial<{ [template in CollectionTemplate]: string }> = {
  companies: 'Companies',
  people: 'People',
  activities: 'Activities',
  feedback: 'Feedback',
  payments: 'Payments',
};

/** The name a new collection of `template` gets when it is given none; Blank's is Collection. */
export const defaultCollectionName = (template: CollectionTemplate): string => TEMPLATE_NAMES[template] ?? t('collection.defaultName');

/** The template a collection of this name is made from, Activities' for Activities; null for a name no template goes by. */
export function templateNamed(name: string): CollectionTemplate | null {
  const wanted = name.toLowerCase();
  const found = Object.entries(TEMPLATE_NAMES).find(([, each]) => each.toLowerCase() === wanted);
  return found ? (found[0] as CollectionTemplate) : null;
}

/** What one record of each template is called; Blank's are records. */
const TEMPLATE_SINGULAR: Partial<{ [template in CollectionTemplate]: string }> = {
  companies: 'company',
  people: 'person',
  activities: 'activity',
  feedback: 'feedback',
  payments: 'payment',
};

/** An element of the record screen other than a field: the body, linked records, cards. */
export type LayoutBlock = Exclude<LayoutItem, { field: string }>;

/**
 * What links to a record, on the right of the record screens the templates bring: a company's
 * activities as a timeline, its people as a list and the cards that link to it (its deals), a
 * person's activities and cards. The fields and the notes are on the left; the other templates
 * keep the default screen, one column.
 */
const TEMPLATE_LINKED: Partial<{ [template in CollectionTemplate]: LayoutBlock[] }> = {
  companies: [
    { block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' },
    { block: 'linked', collection: 'People', style: 'list', fields: ['title'] },
    { block: 'cards' },
  ],
  people: [{ block: 'linked', collection: 'Activities', sort: 'date', style: 'timeline' }, { block: 'cards' }],
};

/**
 * A fresh schema from a template. Links point at the collection of that name in `folder`, where
 * the collection is made, so that People made beside Companies find it.
 */
export function newSchema(template: CollectionTemplate, folder = ''): Schema {
  const fields = TEMPLATE_FIELDS[template].map((f) => ({
    ...f,
    ...(f.options && { options: [...f.options] }),
    ...(f.colors && { colors: { ...f.colors } }),
    ...(f.collection !== undefined && { collection: join(folder, f.collection) }),
    ...(f.rollup && { rollup: { ...f.rollup, from: join(folder, f.rollup.from) } }),
  }));
  const singular = TEMPLATE_SINGULAR[template];
  const linked = TEMPLATE_LINKED[template];
  const layout: Layout | undefined = linked && {
    columns: [
      { width: 1, sections: [{ items: [...fields.map((f) => ({ field: f.key })), { block: 'body' as const }] }] },
      { width: 2, sections: [{ items: linked.map((block) => (block.block === 'linked' ? { ...block, collection: join(folder, block.collection) } : block)) }] },
    ],
  };
  return { version: 2, template, ...(singular && { singular }), fields, ...(layout && { layout }) };
}

// ---------- schema file ----------

const isRecord = (value: unknown): value is { [key: string]: unknown } => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** The colors of a field's choices as the file has them; a color by another name is left out. */
function readColors(raw: unknown): Field['colors'] {
  if (!isRecord(raw)) return undefined;
  const colors: NonNullable<Field['colors']> = {};
  for (const [option, color] of Object.entries(raw)) if (OPTION_COLORS.includes(color as OptionColor)) colors[option] = color as OptionColor;
  return Object.keys(colors).length > 0 ? colors : undefined;
}

/** The color a choice of a field is given, if the schema gives it one. */
export const optionColor = (field: Pick<Field, 'colors'> | undefined, option: string): OptionColor | undefined => field?.colors?.[option];

function readField(raw: unknown): Field | null {
  if (!isRecord(raw) || typeof raw.key !== 'string') return null;
  const key = cleanFieldKey(raw.key);
  if (!key) return null;
  const type = FIELD_TYPES.includes(raw.type as FieldType) ? (raw.type as FieldType) : 'text';
  const field: Field = { key, label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : key, type };
  if (type === 'select' || type === 'multi-select') {
    field.options = strings(raw.options);
    const colors = readColors(raw.colors);
    if (colors) field.colors = colors;
  }
  if (type === 'link') {
    field.collection = typeof raw.collection === 'string' ? raw.collection.replace(/^\/+|\/+$/g, '') : '';
    if (raw.many === true) field.many = true;
  }
  if (type === 'formula') {
    field.formula = typeof raw.formula === 'string' ? raw.formula : '';
    // A formula giving words may color them as a choice's: a goal's On track and Behind.
    const colors = readColors(raw.colors);
    if (colors) field.colors = colors;
  }
  if (type === 'date' && raw.time === true) field.time = true;
  if (type === 'rollup') {
    const r = isRecord(raw.rollup) ? raw.rollup : {};
    const fn = ROLLUP_FNS.includes(r.fn as RollupFn) ? (r.fn as RollupFn) : 'count';
    const key = typeof r.field === 'string' ? cleanFieldKey(r.field) : '';
    const where = (Array.isArray(r.where) ? r.where : []).map((c) => readCondition(c)).filter((c): c is Condition => c !== null);
    field.rollup = {
      from: typeof r.from === 'string' ? r.from.replace(/^\/+|\/+$/g, '') : '',
      fn,
      ...(key && fn !== 'count' && { field: key }),
      ...(r.open === true && { open: true }),
      ...(r.won === true && { won: true }),
      ...(where.length > 0 && { where }),
      ...(typeof r.via === 'string' && cleanFieldKey(r.via) && { via: cleanFieldKey(r.via) }),
    };
  }
  if (type === 'lookup') {
    const l = isRecord(raw.lookup) ? raw.lookup : {};
    field.lookup = { link: typeof l.link === 'string' ? cleanFieldKey(l.link) : '', field: typeof l.field === 'string' ? cleanFieldKey(l.field) : '' };
  }
  // A name is required by being the name; the others say so; what is worked out is never typed.
  if (raw.required === true && type !== 'name' && !isComputed(type)) field.required = true;
  const given = raw.default;
  if (!isComputed(type) && (typeof given === 'string' ? given !== '' : typeof given === 'number' ? Number.isFinite(given) : typeof given === 'boolean' || (Array.isArray(given) && given.every((v) => typeof v === 'string')))) {
    field.default = given as DefaultValue;
  }
  if (type === 'number' || isComputed(type)) {
    const format = readFormat(raw.format);
    if (format) field.format = format;
  }
  // A condition on a field gone stays as it was written: the field is shown, Fields says it is broken.
  const when = (Array.isArray(raw.when) ? raw.when : []).map((c) => readCondition(c)).filter((c): c is Condition => c !== null && c.field !== key);
  if (when.length > 0) field.when = when;
  if ((type === 'text' || type === 'name') && raw.suggest === true) field.suggest = true;
  if (type === 'date' && raw.yearless === true && raw.time !== true) field.yearless = true;
  if (type === 'select' && (raw.steps === true || isRecord(raw.steps))) {
    const given = isRecord(raw.steps) ? raw.steps : {};
    field.steps = { end: strings(given.end), no: strings(given.no), ...(given.chip === true && { chip: true }) };
  }
  if (type === 'name' && raw.optional === true) field.optional = true;
  if (typeof raw.help === 'string' && raw.help.trim()) field.help = raw.help.trim();
  if (isRecord(raw.choicesBy) && typeof raw.choicesBy.field === 'string' && isRecord(raw.choicesBy.by)) {
    const by = Object.fromEntries(
      Object.entries(raw.choicesBy.by)
        .filter((e): e is [string, { [key: string]: unknown }] => isRecord(e[1]))
        .map(([value, names]) => [value, Object.fromEntries(Object.entries(names).filter((n): n is [string, string] => typeof n[1] === 'string' && !!n[1].trim()))]),
    );
    if (Object.keys(by).length > 0) field.choicesBy = { field: cleanFieldKey(raw.choicesBy.field), by };
  }
  if (isRecord(raw.labelBy) && typeof raw.labelBy.field === 'string' && isRecord(raw.labelBy.labels)) {
    const labels = Object.fromEntries(Object.entries(raw.labelBy.labels).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1].trim()));
    if (Object.keys(labels).length > 0) field.labelBy = { field: cleanFieldKey(raw.labelBy.field), labels };
  }
  if (typeof raw.beside === 'string' && raw.beside.trim()) field.beside = cleanFieldKey(raw.beside);
  if (type === 'number' && isRecord(raw.rate) && typeof raw.rate.field === 'string' && typeof raw.rate.main === 'string') field.rate = { field: cleanFieldKey(raw.rate.field), main: raw.rate.main };
  if ((type === 'link' || type === 'select' || type === 'multi-select') && raw.chips === true) field.chips = true;
  if (type === 'text' && raw.signature === true) field.signature = true;
  if (type === 'link' && typeof raw.within === 'string' && raw.within.trim()) field.within = cleanFieldKey(raw.within);
  return field;
}

function readFormat(raw: unknown): NumberFormat | undefined {
  if (!isRecord(raw)) return undefined;
  const style = FORMAT_STYLES.includes(raw.style as NumberFormat['style']) ? (raw.style as NumberFormat['style']) : 'number';
  const format: NumberFormat = { style };
  if (style === 'currency') {
    const by = typeof raw.currencyField === 'string' ? cleanFieldKey(raw.currencyField) : '';
    if (by) format.currencyField = by;
    else if (typeof raw.currency === 'string' && /^[A-Za-z]{3}$/.test(raw.currency.trim())) format.currency = raw.currency.trim().toUpperCase();
  }
  if (typeof raw.decimals === 'number' && Number.isInteger(raw.decimals) && raw.decimals >= 0 && raw.decimals <= 4) format.decimals = raw.decimals;
  if (style === 'percent' && raw.bar === true) {
    format.bar = true;
    if (typeof raw.caption === 'string' && cleanFieldKey(raw.caption)) format.caption = cleanFieldKey(raw.caption);
    if (raw.warn === true) format.warn = true;
  }
  return format;
}

function readItem(raw: unknown): LayoutItem | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.field === 'string') return { field: cleanFieldKey(raw.field) };
  const block = readBlock(raw);
  if (!block) return null;
  const when = (Array.isArray(raw.when) ? raw.when : []).map((c) => readCondition(c)).filter((c): c is Condition => c !== null);
  return when.length > 0 ? { ...block, when } : block;
}

function readBlock(raw: { [key: string]: unknown }): LayoutBlockKind | null {
  if (raw.block === 'subtasks') {
    return { block: 'subtasks', ...(typeof raw.title === 'string' && raw.title.trim() && { title: raw.title.trim() }), ...(typeof raw.add === 'string' && raw.add.trim() && { add: raw.add.trim() }) };
  }
  if (raw.block === 'body') return { block: 'body', ...(raw.attach === true && { attach: true }) };
  if (raw.block === 'cards') return { block: 'cards', ...(typeof raw.board === 'string' && raw.board.trim() && { board: raw.board.trim() }), ...tabOf(raw) };
  if (raw.block === 'actions') return { block: 'actions' };
  if (raw.block === 'note' && typeof raw.of === 'string' && raw.of.trim()) return { block: 'note', of: cleanFieldKey(raw.of) };
  if (raw.block === 'days') {
    const fields = strings(raw.fields).map(cleanFieldKey).filter(Boolean);
    return { block: 'days', ...(fields.length > 0 && { fields }) };
  }
  if (raw.block === 'linked' && typeof raw.collection === 'string') {
    const fields = strings(raw.fields).map(cleanFieldKey).filter(Boolean);
    const group = strings(raw.group).map(cleanFieldKey).filter(Boolean).slice(0, 2);
    const changed = strings(raw.edit).map(cleanFieldKey).filter(Boolean);
    return {
      block: 'linked',
      collection: raw.collection.replace(/^\/+|\/+$/g, ''),
      ...(typeof raw.sort === 'string' && { sort: cleanFieldKey(raw.sort) }),
      ...(typeof raw.sort === 'string' && raw.dir === 'desc' && { dir: 'desc' as const }),
      ...((raw.style === 'list' || raw.style === 'timeline' || raw.style === 'table') && { style: raw.style }),
      ...(fields.length > 0 && { fields }),
      ...(raw.sums === true && { sums: true }),
      ...(group.length > 0 && { group }),
      ...(typeof raw.lines === 'boolean' && { lines: raw.lines }),
      ...(changed.length > 0 && { edit: changed }),
      ...(raw.choose === true && { choose: true }),
      ...(raw.done === true && { done: true }),
      ...(raw.choose === true && typeof raw.apart === 'string' && { apart: cleanFieldKey(raw.apart) }),
      ...(raw.choose === true && typeof raw.instead === 'string' && { instead: cleanFieldKey(raw.instead) }),
      ...(raw.numbered === true && { numbered: true }),
      ...(Array.isArray(raw.where) && { where: raw.where.map((c) => readCondition(c)).filter((c): c is Condition => c !== null) }),
      ...(typeof raw.title === 'string' && raw.title.trim() && { title: raw.title.trim() }),
      ...((raw.look === 'days' || raw.look === 'checklist' || raw.look === 'split' || raw.look === 'thread') && { look: raw.look }),
      ...keysOf(raw, ['time', 'end', 'icon', 'sub', 'pick', 'person', 'amount', 'parts', 'mode', 'total', 'through']),
      ...wordsOf(raw, ['icons', 'startSaid', 'endSaid']),
      ...(typeof raw.button === 'string' && raw.button.trim() && { button: raw.button.trim() }),
      ...(typeof raw.add === 'string' && raw.add.trim() && { add: raw.add.trim() }),
      ...tabOf(raw),
    };
  }
  return null;
}

/** The phone tab a block is in, when it says one. */
const tabOf = (raw: { [key: string]: unknown }) => (typeof raw.tab === 'string' && raw.tab.trim() ? { tab: raw.tab.trim() } : {});

/** A linked block as a board's file has it (Board.blocks); null for anything else. */
export function readLinkedBlock(raw: unknown): LinkedBlock | null {
  const block = isRecord(raw) ? readBlock(raw) : null;
  return block?.block === 'linked' ? block : null;
}

/** The field keys a block names, those of `names` given. */
function keysOf(raw: { [key: string]: unknown }, names: string[]): { [key: string]: string } {
  return Object.fromEntries(names.filter((n) => typeof raw[n] === 'string' && (raw[n] as string).trim()).map((n) => [n, cleanFieldKey(raw[n] as string)]));
}

/** The words a block says by a choice's option, those of `names` given. */
function wordsOf(raw: { [key: string]: unknown }, names: string[]): { [key: string]: { [option: string]: string } } {
  const out: { [key: string]: { [option: string]: string } } = {};
  for (const n of names) {
    const given = raw[n];
    if (!isRecord(given)) continue;
    const words = Object.fromEntries(Object.entries(given).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1]));
    if (Object.keys(words).length > 0) out[n] = words;
  }
  return out;
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
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((k): k is string => typeof k === 'string').map(cleanFieldKey).filter(Boolean) : undefined;
  const asked = Array.isArray(raw.new) ? raw.new.filter((k): k is string => typeof k === 'string').map(cleanFieldKey).filter(Boolean) : undefined;
  return columns.length > 0 ? { columns, ...(hidden && { hidden }), ...(asked?.length && { new: asked }) } : undefined;
}

/**
 * The fields of a schema file of version 1, when every schema had a name and a code as text
 * fields: those two are the name and code fields, and a schema without a name field gets one, as
 * it had; a layout that left the name out, since the screen drew it apart, has it at its start.
 */
function fromVersion1(fields: Field[], layout: Layout | undefined): { fields: Field[]; layout: Layout | undefined } {
  const typed = fields.map((f): Field => {
    if (f.key === NAME_KEY && f.type === 'text') {
      const { required: _required, ...rest } = f;
      return { ...rest, type: 'name' };
    }
    return f.key === 'code' && f.type === 'text' ? { ...f, type: 'code' } : f;
  });
  const named = nameField({ fields: typed }) ? typed : [{ ...NAME }, ...typed];
  const name = nameField({ fields: named })!;
  const placed = layout?.columns.some((c) => c.sections.some((s) => s.items.some((i) => 'field' in i && i.field === name.key)));
  if (!layout || placed) return { fields: named, layout };
  const [first, ...rest] = layout.columns;
  const [section, ...others] = first!.sections.length > 0 ? first!.sections : [{ items: [] }];
  return { fields: named, layout: { columns: [{ ...first!, sections: [{ ...section!, items: [{ field: name.key }, ...section!.items] }, ...others] }, ...rest] } };
}

/**
 * The fields a file lists: a key seen before is left out, a second name or code field reads as
 * text, as there is one of each at most. With `plain`, for a board, whose cards have a title and
 * a key of their own, a name or code field reads as text too.
 */
export function readFields(raw: unknown, plain = false): Field[] {
  const read = (Array.isArray(raw) ? raw : []).map(readField).filter((f): f is Field => f !== null);
  const seen = new Set<string>();
  const single = new Set<FieldType>();
  const fields: Field[] = [];
  for (const field of read) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    if (SINGLE_TYPES.includes(field.type) && (plain || single.has(field.type))) fields.push({ ...field, type: 'text' });
    else {
      single.add(field.type);
      fields.push(field);
    }
  }
  return fields;
}

/**
 * Reads a schema file. A field of an unknown type reads as text; a second name or code field
 * reads as text, as there is one of each at most; a broken file reads as a blank schema, so the
 * records can still be opened. A file of version 1 is read as one of version 2.
 */
export function parseSchema(text: string): Schema {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  const data = isRecord(raw) ? raw : {};
  let fields = readFields(data.fields);
  let layout = readLayout(data.layout);
  if (data.version !== 2) ({ fields, layout } = fromVersion1(fields, layout));
  const template: CollectionTemplate = COLLECTION_TEMPLATES.includes(data.template as CollectionTemplate) ? (data.template as CollectionTemplate) : 'blank';
  const schema: Schema = {
    version: 2,
    template,
    ...(typeof data.singular === 'string' && data.singular.trim() && { singular: data.singular.trim() }),
    ...(typeof data.role === 'string' && data.role.trim() && { role: data.role.trim() }),
    fields,
  };
  if (layout) schema.layout = layout;
  const views = readViews(data.views, fields);
  if (views.length > 0) schema.views = views;
  if (typeof data.defaultView === 'string' && views.some((v) => v.id === data.defaultView)) schema.defaultView = data.defaultView;
  const columns = strings(data.columns).map(cleanFieldKey).filter((k) => fields.some((f) => f.key === k));
  if (columns.length > 0) schema.columns = columns;
  const home = readHome(data.home, fields);
  if (home) schema.home = home;
  const homes = (Array.isArray(data.homes) ? data.homes : []).map((h) => readHome(h, fields)).filter((h): h is HomeTile => !!h);
  if (homes.length > 0) schema.homes = homes;
  const head = isRecord(data.head) && typeof data.head.sub === 'string' ? cleanFieldKey(data.head.sub) : '';
  // Its stages under its title, a job application's (design/more-apps.md 4.6).
  const stepsKey = isRecord(data.head) && typeof data.head.steps === 'string' ? cleanFieldKey(data.head.steps) : '';
  const steps = stepsKey ? fields.find((f) => f.key === stepsKey && f.steps) : undefined;
  if (head && fields.some((f) => f.key === head)) schema.head = { sub: head, ...(steps && { steps: steps.key }) };
  // What its rows say under their names, and their pictures (design/more-apps.md 4.8).
  const has = (key: unknown) => (typeof key === 'string' && fields.some((f) => f.key === cleanFieldKey(key)) ? cleanFieldKey(key) : '');
  const line = isRecord(data.line) ? { sub: has(data.line.sub), cover: has(data.line.cover) } : null;
  if (line?.sub) schema.line = { sub: line.sub, ...(line.cover && { cover: line.cover }) };
  return schema;
}

const isSort = (raw: unknown): raw is RecordSort => isRecord(raw) && typeof raw.key === 'string' && (raw.dir === 'asc' || raw.dir === 'desc');

/** A condition as a file has it; null when it is not one, or names a field `fields` does not have (any field without `fields`). */
export function readCondition(raw: unknown, fields?: Field[]): Condition | null {
  if (!isRecord(raw) || typeof raw.field !== 'string' || !CONDITION_OPS.includes(raw.op as ConditionOp)) return null;
  const key = cleanFieldKey(raw.field);
  if (!key || (fields && !fields.some((f) => f.key === key))) return null;
  const value = typeof raw.value === 'string' || typeof raw.value === 'number' ? raw.value : Array.isArray(raw.value) ? strings(raw.value) : undefined;
  return { field: key, op: raw.op as ConditionOp, ...(value !== undefined && { value }) };
}

/** The parts of a line over a view, or of a box on Home, as a file has them; a part naming a field not there is left out. */
function readSums(raw: unknown, fields: Field[]): ViewSum[] {
  const key = (v: unknown) => (typeof v === 'string' && fields.some((f) => f.key === cleanFieldKey(v)) ? cleanFieldKey(v) : '');
  return (Array.isArray(raw) ? raw : []).flatMap((s): ViewSum[] => {
    if (!isRecord(s) || typeof s.label !== 'string') return [];
    const field = key(s.field);
    if (s.field !== undefined && !field) return [];
    const where = (Array.isArray(s.conditions) ? s.conditions : []).map((c) => readCondition(c, fields)).filter((c): c is Condition => c !== null);
    return [{ label: s.label.trim(), ...(field && { field }), ...(where.length > 0 && { conditions: where }), ...(s.warn === true && { warn: true }), ...(key(s.by) && { by: key(s.by) }), ...(key(s.per) && { per: key(s.per) }), ...(typeof s.one === 'string' && s.one.trim() && { one: s.one.trim() }) }];
  });
}

/** The views of a schema file; a view with a broken condition keeps the rest of them. */
function readViews(raw: unknown, fields: Field[]): View[] {
  if (!Array.isArray(raw)) return [];
  const views: View[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.id || !item.name.trim()) continue;
    const conditions = (Array.isArray(item.conditions) ? item.conditions : []).map((c) => readCondition(c, fields)).filter((c): c is Condition => c !== null);
    const view: View = { id: item.id, name: item.name, conditions };
    if (item.kind === 'calendar') {
      const calendar = readCalendar(item.calendar, fields);
      // With no date field left to go by it is a table again.
      if (calendar) Object.assign(view, { kind: 'calendar', calendar });
    }
    if (item.kind === 'sheet' && isRecord(item.sheet)) {
      const of = (key: unknown, type: FieldType) => (typeof key === 'string' ? fields.find((f) => f.key === cleanFieldKey(key) && f.type === type)?.key : undefined);
      const [row, day, value] = [of(item.sheet.row, 'link'), of(item.sheet.day, 'date'), of(item.sheet.value, 'number')];
      if (row && day && value) Object.assign(view, { kind: 'sheet', sheet: { row, day, value } });
    }
    if (isSort(item.sort)) view.sort = { key: item.sort.key, dir: item.sort.dir };
    if (typeof item.group === 'string' && item.group) view.group = cleanFieldKey(item.group);
    if (Array.isArray(item.columns)) view.columns = strings(item.columns).map(cleanFieldKey).filter((k) => fields.some((f) => f.key === k));
    const widths = readWidths(item.widths, new Set(fields.map((f) => f.key)));
    if (widths) view.widths = widths;
    const changed = strings(item.edit).map(cleanFieldKey).filter((k) => fields.some((f) => f.key === k && changesInTable(f)));
    if (changed.length > 0) view.edit = changed;
    if (item.hidden === true) view.hidden = true;
    if (typeof item.counts === 'string' && item.counts.trim()) view.counts = cleanFieldKey(item.counts);
    const closed = strings(item.closed).filter((s) => s.trim());
    if (closed.length > 0) view.closed = closed;
    if (typeof item.button === 'string' && item.button.trim()) view.button = item.button.trim();
    if (view.button && item.ring === true) view.ring = true;
    const sums = readSums(item.sums, fields);
    if (sums.length > 0) view.sums = sums;
    if (typeof item.chips === 'string' && fields.some((f) => f.key === cleanFieldKey(item.chips as string) && (f.type === 'link' || f.type === 'select'))) view.chips = cleanFieldKey(item.chips);
    if (typeof item.set === 'string' && item.set.trim()) view.set = item.set.trim();
    if (typeof item.all === 'string' && item.all.trim()) view.all = item.all.trim();
    views.push(view);
  }
  return views;
}

/** The fields a calendar can be colored by: a choice, a linked record, a person; each of their values in a color of its own. */
export const COLOR_TYPES: readonly FieldType[] = ['select', 'link', 'person'];

/**
 * Whether a formula gives a day, as the record's own fields tell; with `maybe`, also one that may
 * and cannot be told here, reading a linked record's field.
 */
function givesDay(field: Field, fields: readonly Field[], maybe = false): boolean {
  if (field.type !== 'formula' || !field.formula) return false;
  const info = formulaInfo(field.formula, { fields, self: field.key });
  return !('problem' in info) && (info.kind === 'day' || (maybe && info.kind === 'any'));
}

/** The fields a calendar can start on: the dates, then the formulas that give a day, `birthday + years(1)`. */
export const calendarStarts = (fields: readonly Field[]) => [...fields.filter((f) => f.type === 'date'), ...fields.filter((f) => givesDay(f, fields))];

/**
 * A Calendar view's settings as its file has them: its start a date field or a formula that gives
 * a day, else the first of calendarStarts; its end a date or a field worked out, its length a number
 * or one worked out, its color a choice; one that names a field gone is without it. Null when
 * there is nothing to start on.
 */
function readCalendar(raw: unknown, fields: Field[]): CalendarSettings | null {
  const given = isRecord(raw) ? raw : {};
  const field = (key: unknown, fits: (f: Field) => boolean) => (typeof key === 'string' ? fields.find((f) => f.key === cleanFieldKey(key) && fits(f)) : undefined);
  const repeat = readRepeat(given.repeat, fields);
  // One that repeats starts on its weekdays, from its own day when it has one.
  const start = field(given.start, (f) => f.type === 'date' || givesDay(f, fields, true)) ?? (repeat ? undefined : calendarStarts(fields)[0]);
  if (!start && !repeat) return null;
  const end = start && field(given.end, (f) => f.type === 'date' || isComputed(f.type));
  const duration = end ? undefined : field(given.duration, (f) => f.type === 'number' || isComputed(f.type));
  const color = field(given.color, (f) => COLOR_TYPES.includes(f.type));
  return {
    start: start?.key ?? repeat?.from ?? '',
    ...(end && end.key !== start?.key && { end: end.key }),
    ...(duration && { duration: duration.key }),
    ...(color && { color: color.key }),
    upcoming: given.upcoming === 'today' ? 'today' : given.upcoming !== false,
    ...(repeat && { repeat }),
    ...(typeof given.button === 'string' && given.button.trim() && { button: given.button.trim() }),
    ...(typeof given.auto === 'string' && fields.some((f) => f.key === cleanFieldKey(given.auto as string) && (f.type === 'checkbox' || f.type === 'formula')) && { auto: cleanFieldKey(given.auto) }),
    ...(field(given.lanes, (f) => f.type === 'link' && !f.many) && { lanes: cleanFieldKey(given.lanes as string) }),
    ...(Array.isArray(given.words) && { words: given.words.filter((k): k is string => typeof k === 'string' && fields.some((f) => f.key === cleanFieldKey(k))).map(cleanFieldKey) }),
  };
}

/** A calendar's repeat as its file has it; null without one, or with no multi-select of days or nothing that closes a day. */
function readRepeat(raw: unknown, fields: Field[]): RepeatSettings | null {
  if (!isRecord(raw) || !isRecord(raw.closedBy)) return null;
  const days = typeof raw.days === 'string' ? fields.find((f) => f.key === cleanFieldKey(raw.days as string) && f.type === 'multi-select') : undefined;
  const from = typeof raw.from === 'string' ? fields.find((f) => f.key === cleanFieldKey(raw.from as string) && f.type === 'date') : undefined;
  const until = typeof raw.until === 'string' ? fields.find((f) => f.key === cleanFieldKey(raw.until as string) && f.type === 'date') : undefined;
  const { collection, link, day } = raw.closedBy;
  if (!days || typeof collection !== 'string' || typeof link !== 'string' || typeof day !== 'string') return null;
  const skip = isRecord(raw.skip) && typeof raw.skip.label === 'string' && raw.skip.label.trim() ? raw.skip : null;
  const set = skip && isRecord(skip.set) ? Object.fromEntries(Object.entries(skip.set).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))) : {};
  return {
    days: days.key,
    ...(from && { from: from.key }),
    ...(until && { until: until.key }),
    closedBy: { collection: collection.replace(/^\/+|\/+$/g, ''), link: cleanFieldKey(link), day: cleanFieldKey(day) },
    ...(typeof raw.start === 'string' && raw.start.trim() && { start: raw.start.trim() }),
    ...(raw.start === false && { start: false as const }),
    ...(raw.late === false && { late: false as const }),
    ...(typeof raw.strip === 'number' && Number.isInteger(raw.strip) && raw.strip >= 1 && raw.strip <= 14 && { strip: raw.strip }),
    ...(typeof raw.perWeek === 'string' && fields.some((f) => f.key === cleanFieldKey(raw.perWeek as string)) && { perWeek: cleanFieldKey(raw.perWeek as string) }),
    ...(skip && { skip: { label: (skip.label as string).trim(), set: set as { [key: string]: FieldValue } } }),
  };
}

/** Adds a view at the end, or replaces the one of the same id. */
export function putView(schema: Schema, view: View): Schema {
  const views = schema.views ?? [];
  const at = views.findIndex((v) => v.id === view.id);
  return { ...schema, views: at < 0 ? [...views, view] : views.map((v, i) => (i === at ? view : v)) };
}

export function removeView(schema: Schema, id: string): Schema {
  const views = (schema.views ?? []).filter((v) => v.id !== id);
  const { views: _old, defaultView, ...rest } = schema;
  return views.length > 0 ? { ...rest, views, ...(defaultView && defaultView !== id && { defaultView }) } : rest;
}

/**
 * A collection's box on its app's Home: beside each of its first records the value of `value`, and
 * `sub` faint after its name; in place of its count the sum of `value` with `total`, or the sums
 * of `totals`, each with its label (an account's balance and all of them; a month's in, out and
 * net). Of the records of the view it opens on.
 */
export interface HomeTile {
  value?: string;
  sub?: string;
  total?: boolean;
  totals?: string[];
  /** Only the records with a value: the categories given a limit (design/more-apps.md 4.1). */
  filled?: boolean;
  /** Said in the box when no record has one: "Give a category a monthly limit to see it here". */
  empty?: string;
  /** Only its first record, large, its `sub` under it: the next trip (design/more-apps.md 4.5). */
  first?: boolean;
  /** No box on Home: a list kept to pick from, the packing list. */
  off?: boolean;
  /** How many of its records are at each step of this field, as the box's line. */
  counts?: string;
  /** The view whose records the box lists, by its id, and whose name it has: a CRM's Gone quiet (design/scrawl-apps.md 3.1). */
  view?: string;
  /** What the box is called, in place of its view's or its screen's name: To collect. */
  title?: string;
  /** What it says beside its name, over its view's records: "₺85.110 · ₺19.150 overdue" (design/scrawl-apps.md 3.2). */
  head?: ViewSum[];
  /** Its lines in place of its records, each a label and what it comes to: To invoice, Collected, Best customer. */
  lines?: ViewSum[];
  /** A small table of days, Today, Yesterday and this month, each a row of what its records of that day by `date` come to (design/calendar.md 7). */
  periods?: { date: string; columns: ViewSum[] };
  /** The template whose module it is in on Home, of a piece several share: Sales' To collect, E-commerce's To ship. */
  of?: string;
}

function readHome(raw: unknown, fields: Field[]): HomeTile | undefined {
  if (!isRecord(raw)) return undefined;
  const known = (key: unknown) => (typeof key === 'string' && fields.some((f) => f.key === cleanFieldKey(key)) ? cleanFieldKey(key) : undefined);
  const value = known(raw.value);
  const sub = known(raw.sub);
  const totals = strings(raw.totals).map((k) => known(k)).filter((k): k is string => !!k);
  const empty = typeof raw.empty === 'string' && raw.empty.trim() ? raw.empty.trim() : undefined;
  const sums = (list: unknown) => readSums(list, fields);
  const periods = isRecord(raw.periods) && known(raw.periods.date) ? { date: known(raw.periods.date)!, columns: sums(raw.periods.columns) } : undefined;
  const home: HomeTile = {
    ...(value && { value }),
    ...(sub && { sub }),
    ...(value && raw.total === true && { total: true }),
    ...(totals.length > 0 && { totals }),
    ...(value && raw.filled === true && { filled: true }),
    ...(empty && { empty }),
    ...(raw.first === true && { first: true }),
    ...(raw.off === true && { off: true }),
    ...(known(raw.counts) && { counts: known(raw.counts)! }),
    ...(typeof raw.view === 'string' && raw.view.trim() && { view: raw.view.trim() }),
    ...(typeof raw.title === 'string' && raw.title.trim() && { title: raw.title.trim() }),
    ...(sums(raw.head).length > 0 && { head: sums(raw.head) }),
    ...(sums(raw.lines).length > 0 && { lines: sums(raw.lines) }),
    ...(periods && periods.columns.length > 0 && { periods }),
    ...(typeof raw.of === 'string' && raw.of.trim() && { of: raw.of.trim() }),
  };
  return Object.keys(home).length > 0 ? home : undefined;
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

/** The layout a schema shows with: its own, or one column of every field, then the body. */
export function layoutOf(schema: Schema): Layout {
  if (schema.layout) return schema.layout;
  const items: LayoutItem[] = schema.fields.map((f) => ({ field: f.key }));
  return { columns: [{ sections: [{ items }, { items: [{ block: 'body' }] }] }] };
}

/** The fields the layout does not place, which the screen shows at its end so that none is lost. */
export function unplacedFields(schema: Schema): Field[] {
  const placed = new Set<string>();
  for (const column of layoutOf(schema).columns) for (const section of column.sections) for (const item of section.items) if ('field' in item) placed.add(item.field);
  return schema.fields.filter((f) => !placed.has(f.key));
}

// ---------- values ----------

/** A link as a file wrote it: a map with an id; a bare string is taken as a name with no id, so that a hand-written link still shows. */
function readLink(raw: unknown): Link | null {
  if (isLink(raw)) return { id: raw.id, name: raw.name, ...(typeof raw.code === 'string' && raw.code && { code: raw.code }) };
  if (typeof raw === 'string' && raw.trim()) return { id: '', name: raw.trim() };
  return null;
}

/**
 * A front matter value as a field of `type` holds it; null when it does not fit. A link field that
 * holds `many` reads as a list; a date with `time` keeps the time it is given.
 */
export function readValue(type: FieldType, raw: unknown, many = false, time = false, yearless = false): FieldValue {
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
      // `yaml` reads a day as text; another tool may have written a time with it, kept where the field has one.
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
      // A birthday with no year: its day of the year.
      if (yearless) return yearlessOf(String(raw)) ?? dateOf(String(raw), time);
      return dateOf(String(raw), time);
    }
    case 'time':
      return typeof raw === 'string' || typeof raw === 'number' ? clockOf(String(raw)) : null;
    default:
      return typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : null;
  }
}

// ---------- numbers ----------

/** The language numbers are written in on this device: the browser's (unset), or one chosen in Settings. */
let numberLocale: string | undefined;
const formatters = new Map<string, Intl.NumberFormat>();

/** Writes numbers as this language does from now on: `tr-TR` for 1.234,56, `en-US` for 1,234.56; unset for the browser's. */
export function setNumberLocale(locale: string | undefined) {
  numberLocale = locale;
  formatters.clear();
}

function formatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let made = formatters.get(key);
  if (!made) {
    made = new Intl.NumberFormat(numberLocale, options);
    formatters.set(key, made);
  }
  return made;
}

/** A currency's code as a record or a format holds it, `TRY`; undefined for what is not one. */
export const currencyCode = (value: unknown): string | undefined => (typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim()) ? value.trim().toUpperCase() : undefined);

/** The currency a number of a record is in: its format's, or the one its record holds in the format's field. */
export const currencyOf = (format: NumberFormat | undefined, values?: { readonly [key: string]: unknown }): string | undefined =>
  format?.style !== 'currency' ? undefined : format.currencyField ? currencyCode(values?.[format.currencyField]) : format.currency;

/**
 * A number as the screen shows it, as this device writes numbers: grouped by thousands, two
 * decimals at most; with a format, as money with its currency's symbol (₺1.250,50 in Turkish,
 * ₺1,250.50 in English), as a share (0.18 as 18%), with so many decimals. Money whose currency is
 * not known is written as a number.
 */
export function formatNumber(n: number, format?: NumberFormat, currency?: string): string {
  const decimals = format?.decimals;
  const digits: Intl.NumberFormatOptions = decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : { maximumFractionDigits: 2 };
  if (format?.style === 'currency') {
    const code = currency ?? (format.currencyField ? undefined : format.currency);
    if (code) {
      try {
        return formatter({ style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', ...(decimals !== undefined && digits) }).format(n);
      } catch {
        // A code Intl does not know: written as a number.
      }
    }
  }
  if (format?.style === 'percent') return formatter({ style: 'percent', ...digits }).format(n);
  if (format?.style === 'duration') return durationText(n);
  return formatter(digits).format(n);
}

/** Minutes as hours, minutes and seconds: 45 min, 1 h, 1 h 30 min, 1 min 30 s, 30 s; less than none with a minus before. */
export function durationText(minutes: number): string {
  const all = Math.round(Math.abs(minutes) * 60);
  const [h, m, s] = [Math.floor(all / 3600), Math.floor(all / 60) % 60, all % 60];
  const text = [h ? t('duration.hours', { count: h }) : '', m || (!h && !s) ? t('duration.minutes', { count: m }) : '', s ? t('duration.seconds', { count: s }) : ''].filter(Boolean).join(' ');
  return minutes < 0 && all > 0 ? `−${text}` : text;
}

/** A duration as it is typed back in its box: whole minutes as their number, one with seconds in seconds, 90 s. */
export const durationTyped = (minutes: number) => (Number.isInteger(minutes) ? String(minutes) : t('duration.seconds', { count: Math.round(minutes * 60) }));

/** A number as the screen shows it, with no format of its own. */
export const numberText = (n: number) => formatNumber(n);

/** A value as the table and the search read it. */
export function valueText(value: FieldValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (isLink(value)) return recordLabel(value);
  if (Array.isArray(value)) return value.map((v) => (isLink(v) ? recordLabel(v) : v)).join(', ');
  if (typeof value === 'boolean') return t(value ? 'collection.yes' : 'collection.no');
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  // A day with its time reads as the day and the clock.
  if (timeOf(value)) return `${value.slice(0, 10)} ${value.slice(11)}`;
  return String(value);
}

// ---------- formulas ----------

/** Whether a field's value is worked out, never typed nor written: a formula, a lookup, a rollup. */
export const isComputed = (type: FieldType) => type === 'formula' || type === 'lookup' || type === 'rollup';

const parsed = new Map<string, Node | null>();

/** A formula as read, kept by its text, so that a table of a thousand records reads it once; null when it is not one. */
export function formulaNode(expr: string): Node | null {
  let node = parsed.get(expr);
  if (node === undefined) {
    try {
      node = parseExpression(expr);
    } catch {
      node = null;
    }
    if (parsed.size > 2000) parsed.clear();
    parsed.set(expr, node);
  }
  return node;
}

/**
 * A worked-out value as a record holds it, read back by the language: a day of a rollup or a
 * lookup is a day, a number a number. Only for what is worked out; a typed field is read by its type.
 */
function computedRuntime(value: FieldValue | undefined): RV {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return isDay(value) || isDateTime(value) || isYearless(value) ? dayValue(value) : isClock(value) ? clockValue(value) : value;
  if (isLink(value)) return { ref: true, dir: '', id: value.id, name: value.name, ...(value.code && { code: value.code }) };
  if (Array.isArray(value)) return (value as unknown[]).map((v) => (isLink(v) ? v.name : String(v)));
  return value;
}

/** A field of a record as a formula over the record's own fields reads it; a formula worked out in turn, at most eight deep. */
function ownRuntime(field: Field, values: Record['values'], schema: Pick<Schema, 'fields'>, today: string, depth: number): RV {
  if (field.type === 'formula') {
    const node = formulaNode(field.formula ?? '');
    if (!node || depth > 8) return null;
    return evaluate(node, ownEnv(values, schema, today, depth + 1));
  }
  return isComputed(field.type) ? computedRuntime(values[field.key]) : toRuntime(field, values[field.key]);
}

function ownEnv(values: Record['values'], schema: Pick<Schema, 'fields'>, today: string, depth: number): Env {
  return {
    today,
    field: (key) => {
      const field = schema.fields.find((f) => f.key === key);
      return field ? ownRuntime(field, values, schema, today, depth) : null;
    },
    // A linked record's field needs the other records: a Computer (compute.ts) works it out.
    member: () => null,
  };
}

/**
 * Works out a formula over a record's own fields, for `today`, as a record holds what it gives:
 * a number, a text, a day, yes or no. A linked record's field (`project.customer`) needs the other
 * records and is worked out by a Computer (compute.ts); here it gives nothing. Null when it
 * cannot be worked out: a field it needs is empty, or the expression is not one. A formula is
 * shown, never written to the file.
 */
export function evaluateFormula(expr: string, values: Record['values'], schema: Pick<Schema, 'fields'>, today: string): FieldValue {
  const node = formulaNode(expr);
  if (!node) return null;
  try {
    return fromRuntime(evaluate(node, ownEnv(values, schema, today, 0)));
  } catch {
    return null;
  }
}

/** Whether a kind is what a field of this type holds, for a default worked out. */
function fitsType(kind: Kind, field: Field): boolean {
  if (kind === 'any' || kind === 'null') return true;
  switch (field.type) {
    case 'number':
      return kind === 'number' || kind === 'bool';
    case 'date':
      return kind === 'day';
    case 'time':
      return kind === 'time';
    case 'checkbox':
      return kind === 'bool';
    case 'link':
      return typeof kind === 'object' && ('record' in kind || ('list' in kind && typeof kind.list === 'object' && 'record' in kind.list));
    case 'multi-select':
      return kind === 'text' || (typeof kind === 'object' && 'list' in kind && (kind.list === 'text' || kind.list === 'any'));
    default:
      return kind === 'text' || kind === 'number' || (typeof kind === 'object' && 'record' in kind);
  }
}

/**
 * What is wrong with a field's default value: a formula that cannot be worked out or gives what
 * the field does not hold; a value the field cannot hold, a choice that is not one of its own.
 */
export function defaultProblem(field: Field, schema: Pick<Schema, 'fields'>, schemaOf?: Scope['schemaOf'], ruleFn?: Scope['ruleFn']): string | null {
  const given = field.default;
  if (given === undefined || isComputed(field.type)) return null;
  if (typeof given === 'string' && given.startsWith('=')) {
    const info = formulaInfo(given.slice(1), { fields: schema.fields, schemaOf, self: field.key, use: 'default', ...(ruleFn && { ruleFn }) });
    if ('problem' in info) return info.problem;
    return fitsType(info.kind, field) ? null : t('fields.defaultKind', { what: kindWords(info.kind), field: field.label });
  }
  const options = field.options ?? [];
  switch (field.type) {
    case 'number':
      return typeof given === 'number' ? null : t('fields.defaultNumber');
    case 'checkbox':
      return typeof given === 'boolean' ? null : t('fields.defaultCheckbox');
    case 'date':
      return typeof given === 'string' && dateOf(given, field.time) === given ? null : t('fields.defaultDay');
    case 'time':
      return typeof given === 'string' && isClock(given) ? null : t('fields.defaultTime');
    case 'select':
      return typeof given === 'string' && options.includes(given) ? null : t('collection.problem.choice', { value: String(given), field: field.label });
    case 'multi-select': {
      const wrong = (Array.isArray(given) ? given : [String(given)]).find((v) => !options.includes(v));
      return wrong === undefined ? null : t('collection.problem.choice', { value: wrong, field: field.label });
    }
    case 'link':
      return t('fields.defaultLink');
    default:
      return typeof given === 'string' ? null : t('fields.defaultText');
  }
}

/**
 * Whether a rollup adds up money in more than one currency: a field whose records each hold their
 * own currency, summed with no condition keeping it to one. Says so, or null.
 */
export function mixedCurrency(field: Field, schemaOf: (path: string) => Pick<Schema, 'fields'> | undefined): string | null {
  const r = field.rollup;
  if (field.type !== 'rollup' || !r?.field || r.fn === 'count') return null;
  const source = schemaOf(r.from)?.fields;
  const summed = source?.find((f) => f.key === r.field);
  const by = summed?.format?.style === 'currency' ? summed.format.currencyField : undefined;
  if (!summed || !by) return null;
  const held = source!.find((f) => f.key === by);
  const one = (r.where ?? []).some((c) => c.field === by && c.op === 'is' && (Array.isArray(c.value) ? c.value.length === 1 : typeof c.value === 'string' && c.value !== ''));
  return one ? null : t('fields.mixedCurrency', { field: summed.label, currency: held?.label ?? by });
}

/**
 * What is wrong with a formula, said for the one typing it: it is not one, it reads a field that
 * is not there or itself (the formula of the field `key`), or a value of the wrong kind for what
 * is done with it. `schemaOf` gives the fields of other collections, for a linked record's
 * fields and for lookups. Null when it can be worked out.
 */
export function formulaProblem(expr: string, schema: Pick<Schema, 'fields'>, key?: string, schemaOf?: Scope['schemaOf']): string | null {
  const info = formulaInfo(expr, { fields: schema.fields, ...(key && { self: key }), ...(schemaOf && { schemaOf }) });
  return 'problem' in info ? info.problem : null;
}

/** A record's value for a field: what is worked out where it was (a Computer puts it among the values), else a formula over the record's own fields. */
export function fieldValueOf(record: Pick<Record, 'values'>, field: Field, schema: Pick<Schema, 'fields'>, today: string): FieldValue | undefined {
  if (isComputed(field.type) && !(field.key in record.values)) return field.type === 'formula' ? evaluateFormula(field.formula ?? '', record.values, schema, today) : undefined;
  return record.values[field.key];
}

/** Whether a value counts as empty. */
export const isEmpty = (value: FieldValue | undefined) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

/** The type a worked-out value shows as, from what it is: a number, a day, yes or no, links, choices, a text. */
export function typeOfValue(value: FieldValue | undefined): FieldType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'checkbox';
  if (isLink(value) || (Array.isArray(value) && value.length > 0 && isLink(value[0]))) return 'link';
  if (Array.isArray(value)) return 'multi-select';
  if (typeof value === 'string' && (isDay(value) || isDateTime(value))) return 'date';
  return typeof value === 'string' && isClock(value) ? 'time' : 'text';
}

// ---------- record files ----------

/** A record's file name without its extension. */
export const recordName = (path: string) => basename(path).slice(0, -RECORD_EXT.length);

/** A record id as the app makes them, which is also the file name of a record made since: ten letters and digits. */
const ID_NAME = /^[0-9a-z]{10}$/;

/** Whether a record's file is named after an id rather than by a person. */
export const namedById = (path: string) => ID_NAME.test(recordName(path));

/** A new record's id: ten random letters and digits, which no two devices make alike. */
export function newRecordId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** A record's name and code: the values of the schema's name and code fields, or empty. */
function identity(values: Record['values'], schema: Schema): Pick<Record, 'name' | 'code'> {
  const text = (field: Field | undefined) => {
    const value = field ? values[field.key] : undefined;
    return typeof value === 'string' ? value.trim() : '';
  };
  return { name: text(nameField(schema)), code: text(codeField(schema)) };
}

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

/**
 * Reads a record's file. A file without an id gets none here; `loadCollection` gives it one and
 * writes it. A file named by a person rather than by an id (made before records were named by
 * their ids, or a note dropped into the folder) that has no name in it is named after its file.
 */
export function parseRecord(text: string, schema: Schema, path: string): Record {
  const { front, body } = splitFrontMatter(text);
  return recordOf(front, body, schema, path);
}

/** A record from its file's front matter and body, as `parseRecord` reads them. */
function recordOf(front: { [key: string]: unknown }, body: string, schema: Schema, path: string): Record {
  const values: Record['values'] = {};
  const extra: Record['extra'] = {};
  const known = new Map(schema.fields.map((f) => [f.key, f]));
  let subtasks: Subtask[] = [];
  for (const [key, raw] of Object.entries(front)) {
    if (key === 'id') continue;
    const field = known.get(key);
    if (key === SUBTASKS_KEY && !field) {
      subtasks = readSubtasks(raw);
      continue;
    }
    // A value worked out on screen is not the file's; what the file has there is kept as it was.
    if (!field || isComputed(field.type)) {
      extra[key] = raw;
      continue;
    }
    const value = readValue(field.type, raw, field.many, field.time, field.yearless);
    if (value !== null) values[key] = value;
    else if (raw !== null && raw !== undefined) extra[key] = raw;
  }
  const named = nameField(schema);
  if (named && isEmpty(values[named.key]) && !namedById(path)) values[named.key] = recordName(path);
  return { id: typeof front.id === 'string' ? front.id : '', path, ...identity(values, schema), values, extra, body, ...(subtasks.length > 0 && { subtasks }) };
}

/** The file of a record: its id, then its fields in the schema's order, then what the schema does not know, then the body. */
export function serializeRecord(record: Record, schema: Schema): string {
  const front: { [key: string]: unknown } = { id: record.id };
  for (const field of schema.fields) {
    if (isComputed(field.type)) continue;
    const value = record.values[field.key];
    if (!isEmpty(value)) front[field.key] = value;
  }
  for (const [key, value] of Object.entries(record.extra)) if (!(key in front)) front[key] = value;
  const yaml = stringifyYaml(front, { lineWidth: 0 }).replace(/\n$/, '');
  // Each subtask on a line of its own, so that two devices that change two of them merge line by line.
  const subtasks = record.subtasks?.length && !(SUBTASKS_KEY in front) ? `\n${SUBTASKS_KEY}:${record.subtasks.map((s) => `\n  - ${JSON.stringify(writtenSubtask(s))}`).join('')}` : '';
  return `---\n${yaml}${subtasks}\n---\n${normalBody(record.body)}`;
}

const isHidden = (name: string) => name.startsWith('.') || name.startsWith('_');
const isRecordFile = (entry: Entry) => entry.kind === 'file' && entry.name.endsWith(RECORD_EXT) && !isHidden(entry.name);

export interface Collection {
  dir: string;
  schema: Schema;
  records: Record[];
  /** Its rules file (`_rules.js`) as written; unset when it has none. */
  rules?: string;
  /**
   * When its files, its schema and its records, were written on this device: the oldest, as near
   * as the files tell to when it was made, and the newest. A folder's own time is not kept
   * everywhere, nor does it change as a record does.
   */
  written?: { first: number; last: number };
}

// ---------- the index ----------

// A collection's records as last read, kept on the device in `.scrawl/index/`, one file per
// collection: each record file's front matter and body, with when it was written and its size.
// A file that has not changed since is not read again. It is never synced; a broken or missing
// index only means every file is read.

export const INDEX_DIR = '.scrawl/index';

interface IndexEntry {
  modified: number;
  size: number;
  front: { [key: string]: unknown };
  body: string;
}

type CollectionIndex = { [path: string]: IndexEntry };

/** Where a collection's index is kept. */
export const indexPath = (dir: string) => join(INDEX_DIR, `${encodeURIComponent(dir || '.')}.json`);

async function readIndex(fs: VaultFs, dir: string): Promise<CollectionIndex> {
  try {
    const data: unknown = JSON.parse(await fs.readText(indexPath(dir)));
    return isRecord(data) && data.version === 1 && isRecord(data.records) ? (data.records as CollectionIndex) : {};
  } catch {
    return {};
  }
}

/**
 * Reads a collection: its schema and every record. A record file without an id (made by another
 * tool, or a note dropped into the folder) is given one and written back, so that links to it
 * hold; it keeps its file name. With `readOnly` it keeps its path as its id instead, and the index
 * is left as it is. A record file that has not changed since the index was written is read from
 * the index.
 */
export async function loadCollection(fs: VaultFs, dir: string, ids: () => string = newRecordId, readOnly = false): Promise<Collection> {
  const schema = await loadSchema(fs, dir);
  const listed = await fs.list(dir);
  const entries = listed.filter(isRecordFile).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const times = listed.filter((file) => file.kind === 'file' && file.modified !== undefined).map((file) => file.modified!);
  const written = times.length > 0 ? { first: Math.min(...times), last: Math.max(...times) } : undefined;
  const index = await readIndex(fs, dir);
  const next: CollectionIndex = {};
  let changed = Object.keys(index).length !== entries.length;
  const records: Record[] = [];
  for (const entry of entries) {
    const known = index[entry.path];
    const fresh = known && entry.modified !== undefined && known.modified === entry.modified && known.size === entry.size;
    let front: { [key: string]: unknown };
    let body: string;
    if (fresh) ({ front, body } = known);
    else {
      ({ front, body } = splitFrontMatter(await fs.readText(entry.path)));
      changed = true;
    }
    const record = recordOf(front, body, schema, entry.path);
    if (!record.id) {
      if (readOnly) record.id = entry.path;
      else {
        record.id = ids();
        // Written again, the file is read again next time, with its id.
        await fs.writeText(entry.path, serializeRecord(record, schema));
        records.push(record);
        changed = true;
        continue;
      }
    }
    if (entry.modified !== undefined && entry.size !== undefined) next[entry.path] = { modified: entry.modified, size: entry.size, front, body };
    records.push(record);
  }
  if (changed && !readOnly) await fs.writeText(indexPath(dir), JSON.stringify({ version: 1, records: next })).catch(() => undefined);
  const rules = listed.some((e) => e.kind === 'file' && e.name === RULES_FILE) ? await fs.readText(rulesPath(dir)).catch(() => undefined) : undefined;
  return { dir, schema, records, ...(rules !== undefined && { rules }), ...(written && { written }) };
}

// ---------- making and changing ----------

/** A name typed, as a folder can be named: what a file name does not take turned into its look-alike (names.ts). */
const cleanName = (name: string) => fileNameOf(name).replace(/\s+/g, ' ').trim();

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
 * the schema of `template`; without a name it is called after its template. Returns its path.
 */
export async function createCollection(fs: VaultFs, folder: string, name: string, template: CollectionTemplate): Promise<string> {
  const clean = cleanName(name);
  if (clean && isHidden(clean)) throw new Error(t('error.name'));
  const dir = freePath(folder, clean || defaultCollectionName(template), '', await taken(fs, folder));
  await fs.mkdir(dir);
  await saveSchema(fs, dir, newSchema(template, folder));
  return dir;
}

/**
 * Makes the collection a block of `from`'s record screen looks for, at `target`, when it is not
 * there: a collection made on its own shows the ones its template keeps beside it, and those were
 * never made. It is made from the template its name goes by, and its links to records of the kind
 * `from` holds point at `from`, whatever it is called: Activities made for an old
 * Scrawl/Collection of companies link their company there. Numbered when the name is taken by a
 * folder that is not a collection. Returns its path; null when no template goes by its name.
 */
export async function createLinkedCollection(fs: VaultFs, from: Pick<Collection, 'dir' | 'schema'>, target: string): Promise<string | null> {
  const name = collectionName(target);
  const template = templateNamed(name);
  if (!template) return null;
  const folder = collectionOf(target);
  const own = TEMPLATE_NAMES[from.schema.template];
  const fresh = newSchema(template, folder);
  const schema = own ? retargetLinks(fresh, join(folder, own), from.dir) : fresh;
  const dir = freePath(folder, name, '', await taken(fs, folder));
  await fs.mkdir(dir);
  await saveSchema(fs, dir, schema);
  return dir;
}

/**
 * Moves a collection's folder to `target`, a path nothing else has, with every file in it. A
 * change in the case of the name alone goes by a hidden name first, since a folder cannot be
 * moved onto itself where names do not tell case apart.
 */
async function moveCollectionDir(fs: VaultFs, dir: string, target: string): Promise<void> {
  if (target === dir) return;
  let from = dir;
  if (target.toLowerCase() === dir.toLowerCase()) {
    from = freePath(collectionOf(dir), `.${basename(dir)}`, '', await taken(fs, collectionOf(dir)));
    await moveTree(fs, dir, from);
    await fs.remove(dir);
  }
  await moveTree(fs, from, target);
  await fs.remove(from);
}

/** Gives a collection a name of the user's choosing, in the folder it is in; numbered when the name is taken. Returns its new path. */
export async function renameCollection(fs: VaultFs, dir: string, name: string): Promise<string> {
  const clean = cleanName(name);
  if (!clean || isHidden(clean)) throw new Error(t('error.name'));
  const folder = collectionOf(dir);
  const names = await taken(fs, folder);
  // Changing only the case of the name is not a clash with itself.
  names.delete(dir.toLowerCase());
  const target = freePath(folder, clean, '', names);
  await moveCollectionDir(fs, dir, target);
  return target;
}

/** Moves a collection into `folder`, numbered when a folder there has its name. Returns its new path. */
export async function moveCollection(fs: VaultFs, dir: string, folder: string): Promise<string> {
  if (collectionOf(dir) === folder) return dir;
  const target = freePath(folder, basename(dir), '', await taken(fs, folder));
  await moveCollectionDir(fs, dir, target);
  return target;
}

/**
 * A schema whose links, linked-record blocks and rollups pointing at the collection or the board
 * at `from` point at `to`, where it went; the same schema when nothing in it points there.
 */
export function retargetLinks(schema: Schema, from: string, to: string): Schema {
  let changed = false;
  const fields = schema.fields.map((field) => {
    if (field.type === 'link' && field.collection === from) {
      changed = true;
      return { ...field, collection: to };
    }
    if (field.type === 'rollup' && field.rollup?.from === from) {
      changed = true;
      return { ...field, rollup: { ...field.rollup, from: to } };
    }
    return field;
  });
  const layout = schema.layout && {
    columns: schema.layout.columns.map((column) => ({
      ...column,
      sections: column.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (!('block' in item) || item.block !== 'linked' || item.collection !== from) return item;
          changed = true;
          return { ...item, collection: to };
        }),
      })),
    })),
  };
  return changed ? { ...schema, fields, ...(layout && { layout }) } : schema;
}

/** What a new record is given: its fields, its name and code among them, and its body. */
export interface NewRecord {
  values?: Record['values'];
  body?: string;
  /** Its subtasks, as the form made them, in their order. */
  subtasks?: Subtask[];
}

/** The values as a file keeps them: the empty ones left out. */
function filled(values: Record['values']): Record['values'] {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isEmpty(value)));
}

/**
 * Adds a record to a collection, as a file named after its id, which never changes: renaming the
 * record changes what is in the file, not where it is, and two records made on two devices never
 * meet in one file. Returns the record.
 */
export async function addRecord(fs: VaultFs, collection: Collection, input: NewRecord, id: string = newRecordId()): Promise<Record> {
  const names = await taken(fs, collection.dir);
  let path = join(collection.dir, `${id}${RECORD_EXT}`);
  while (names.has(path.toLowerCase())) {
    id = newRecordId();
    path = join(collection.dir, `${id}${RECORD_EXT}`);
  }
  const values = filled(input.values ?? {});
  const record: Record = { id, path, ...identity(values, collection.schema), values, extra: {}, body: normalBody(input.body ?? '') };
  if (input.subtasks?.length) record.subtasks = input.subtasks;
  await fs.writeText(path, serializeRecord(record, collection.schema));
  return record;
}

export type RecordPatch = Partial<Pick<Record, 'body' | 'subtasks'>> & { values?: Record['values'] };

/** Changes a record and writes its file, where it is. Returns the record as written. */
export async function updateRecord(fs: VaultFs, schema: Schema, record: Record, patch: RecordPatch): Promise<Record> {
  const values = filled(patch.values ? { ...record.values, ...patch.values } : record.values);
  const next: Record = { ...record, ...(patch.body !== undefined && { body: normalBody(patch.body) }), values, ...identity(values, schema) };
  if (patch.subtasks !== undefined) {
    if (patch.subtasks.length > 0) next.subtasks = patch.subtasks;
    else delete next.subtasks;
  }
  await fs.writeText(next.path, serializeRecord(next, schema));
  return next;
}

/** An open subtask with a due day, with its record and the folder of the record's collection. */
export interface DueRecordSubtask {
  collection: string;
  record: Record;
  subtask: Subtask;
}

/** The dated subtasks not done of every record, across collections by folder, by day then priority. */
export function dueRecordSubtasks(collections: { [dir: string]: Pick<Collection, 'records'> }): DueRecordSubtask[] {
  return Object.entries(collections)
    .flatMap(([dir, c]) => c.records.flatMap((record) => (record.subtasks ?? []).filter((s) => s.due && !s.done).map((subtask) => ({ collection: dir, record, subtask }))))
    .sort((a, b) => a.subtask.due!.localeCompare(b.subtask.due!) || a.subtask.priority - b.subtask.priority);
}

// ---------- looking at records ----------

/** A record as a picker or a link shows it: its name and code, either alone when it has only one, "Untitled" with neither. */
export const recordLabel = (record: { name: string; code?: string }) =>
  (record.name && record.code ? `${record.name} · ${record.code}` : record.name || record.code) || t('collection.untitled');

/**
 * Whether the record a link points at is gone: its collection is at hand (`records`) and has no
 * record of its id, or, for a link written by hand without one, of its name. A link into a
 * collection that is not here is not said to be gone; nothing is known of it.
 */
export function linkGone(link: Link, records: readonly Pick<Record, 'id' | 'name'>[] | null): boolean {
  if (records === null) return false;
  if (link.id) return !records.some((r) => r.id === link.id);
  const name = link.name.trim().toLowerCase();
  return !records.some((r) => r.name.trim().toLowerCase() === name);
}

/**
 * Where a web address, an email address or a phone number goes when it is opened: a web page, a
 * new mail, a call. A web address typed without its `https://` gets it; null for a value that is
 * none of these, or an address of another kind.
 */
export function fieldHref(type: FieldType, value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (type === 'url') {
    if (/^https?:\/\/\S+$/i.test(text)) return text;
    // Something else before a colon is another kind of address, not a web page.
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) || /\s/.test(text) || !text.includes('.')) return null;
    return `https://${text}`;
  }
  if (type === 'email') return /^[^\s@]+@[^\s@]+$/.test(text) ? `mailto:${text}` : null;
  if (type === 'phone') {
    const digits = text.replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 3 ? `tel:${digits}` : null;
  }
  return null;
}

const SEARCHED: readonly FieldType[] = ['name', 'code', 'text', 'select', 'multi-select', 'url', 'email', 'phone', 'person', 'link'];

// ---------- views: conditions, groups and sums ----------

/** The conditions a field of each type can take. */
export function opsFor(type: FieldType): ConditionOp[] {
  switch (type) {
    case 'number':
    case 'formula':
      return ['is', 'gt', 'lt', 'empty', 'not-empty'];
    case 'rollup':
      return ['is', 'gt', 'lt', 'before', 'after', 'empty', 'not-empty'];
    case 'date':
      return ['on', 'before', 'after', 'empty', 'not-empty'];
    case 'time':
      return ['is', 'before', 'after', 'empty', 'not-empty'];
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

/** Whether a condition says enough to ask anything: one that needs a value and has none yet asks nothing. */
export function isComplete(condition: Condition): boolean {
  if (!opTakesValue(condition.op)) return true;
  const { value } = condition;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim() !== '';
  return Array.isArray(value) && value.length > 0;
}

/** The names a value answers to in a condition: a choice, the choices, a link's name and code. */
function namesOf(value: FieldValue | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (isLink(value)) return [value.name, value.id, ...(value.code ? [value.code] : [])];
  if (Array.isArray(value)) return value.flatMap((v) => (isLink(v) ? [v.name, v.id, ...(v.code ? [v.code] : [])] : [v]));
  return [String(value)];
}

/**
 * The parts of the line over a view (View.sums), over records whose worked-out values are in them:
 * "₺85.110 to collect", "3 low"; a part that comes to nothing is left out.
 */
export function viewSumParts(sums: readonly ViewSum[], records: readonly Pick<Record, 'values'>[], schema: Pick<Schema, 'fields'>, today: string): { text: string; warn: boolean }[] {
  return sums.flatMap((s) => {
    const said = sumValue(s, records, schema, today);
    const label = said === '1' && !s.field && s.one ? s.one : s.label;
    return said === null ? [] : [{ text: label ? `${said} ${label}` : said, warn: !!s.warn }];
  });
}

/**
 * What one part comes to, written: a count, a sum in its field's format, a share of another sum,
 * or the value whose records come to most; null for nothing.
 */
export function sumValue(s: ViewSum, records: readonly Pick<Record, 'values'>[], schema: Pick<Schema, 'fields'>, today: string): string | null {
  const meeting = records.filter((r) => (s.conditions ?? []).every((c) => matchesCondition(r, schema, c, today)));
  const field = s.field ? schema.fields.find((f) => f.key === s.field) : undefined;
  const of = (rs: readonly Pick<Record, 'values'>[], f: Field | undefined) => (f ? rs.reduce((sum, r) => sum + (typeof r.values[f.key] === 'number' ? (r.values[f.key] as number) : 0), 0) : rs.length);
  if (s.by) {
    const totals = new Map<string, number>();
    for (const r of meeting) {
      const name = valueText(r.values[s.by] ?? null);
      if (name) totals.set(name, (totals.get(name) ?? 0) + of([r], field));
    }
    const best = [...totals].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }
  const total = of(meeting, field);
  if (s.per) {
    const whole = of(meeting, schema.fields.find((f) => f.key === s.per));
    return whole ? formatNumber(total / whole, { style: 'percent', decimals: 0 }) : null;
  }
  if (total === 0) return null;
  return field ? formatNumber(total, field.format) : String(total);
}

/** Whether one condition holds for a record. */
export function matchesCondition(record: Pick<Record, 'values'>, schema: Pick<Schema, 'fields'>, condition: Condition, today: string): boolean {
  const field = schema.fields.find((f) => f.key === condition.field);
  if (!field || !isComplete(condition)) return true;
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
  // A day with its time is on its day: before and after it by the day too. A time is compared as a time.
  const day = typeof value === 'string' ? (field.type === 'time' ? value : value.slice(0, 10)) : '';
  // A day's condition may ask about today, which moves with the day.
  const target = condition.value === TODAY ? today : typeof condition.value === 'string' ? condition.value : '';
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
      if (field.type === 'time') return !!day && day === target;
      return field.type === 'number' || typeof value === 'number' ? number !== null && number === n : !empty && has();
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
export function groupRecords(records: Record[], schema: Schema, key: string, today: string, shown?: Field): RecordGroup[] {
  const field = schema.fields.find((f) => f.key === key);
  // A worked-out field groups as what it shows: a lookup of a choice by its choices.
  const as = field && shown?.key === field.key ? shown : field;
  // A worked-out text groups as it says, in the order of the records: a birthday's month, Today and Tomorrow first.
  const said = !!field && field.type === 'formula' && !!as && !GROUPABLE.includes(as.type);
  if (!field || !as || (!GROUPABLE.includes(as.type) && !said)) return [{ key: '', label: '', records }];
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
    // A day with its time groups on its day.
    else if (as.type === 'date' && typeof value === 'string') add(value.slice(0, 10), value.slice(0, 10), record);
    else add(String(value), valueText(value), record);
  }
  if (said) return [...groups.values()].sort((a, b) => Number(a.key === '') - Number(b.key === ''));
  const order = as.options ?? [];
  const rank = (g: RecordGroup) => (g.key === '' ? Number.MAX_SAFE_INTEGER : order.includes(g.key) ? order.indexOf(g.key) : order.length);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
}

/** How a linked list or table is sorted: by its field, up or down by `dir`; by the name without one. */
export const linkedSort = (block: LinkedBlock, schema: Schema): RecordSort => ({ key: block.sort ?? nameField(schema)?.key ?? '', dir: (block.sort && block.dir) || 'asc' });

/** A group of a linked table, with the groups in it by its second field. */
export interface LinkedGroup extends RecordGroup {
  groups?: RecordGroup[];
}

/**
 * A linked table's records in groups (design/gym.md 4.2): by its first field as a collection groups
 * them, in each by its second in the order the records come, a workout's sets under each exercise
 * as the program has them; without a field, one group of all.
 */
export function groupLinked(records: Record[], schema: Schema, keys: readonly string[], today: string): LinkedGroup[] {
  const [first, second] = keys;
  if (!first) return [{ key: '', label: '', records }];
  return groupRecords(records, schema, first, today).map((g) => {
    if (!second) return g;
    const at = (inner: RecordGroup) => Math.min(...inner.records.map((r) => g.records.indexOf(r)));
    return { ...g, groups: groupRecords(g.records, schema, second, today).sort((a, b) => at(a) - at(b)) };
  });
}

/** A sum of money in one currency; no currency for numbers whose record has none. */
export interface Sum {
  value: number;
  currency?: string;
}

/**
 * A column's sum over records: one, or one for each currency when the field's records each hold
 * their own, in the order of the currency field's choices, then as met, those with none last;
 * null when the column is not one of numbers, or no record has a value.
 */
export function columnSums(records: Record[], schema: Schema, key: string, today: string): Sum[] | null {
  const field = schema.fields.find((f) => f.key === key);
  const by = field?.format?.style === 'currency' ? field.format.currencyField : undefined;
  if (!field || !by) {
    const sum = columnSum(records, schema, key, today);
    return sum === null ? null : [{ value: sum }];
  }
  if (field.type !== 'number' && !isComputed(field.type)) return null;
  const sums = new Map<string, number>();
  for (const record of records) {
    const value = fieldValueOf(record, field, schema, today);
    if (typeof value !== 'number') continue;
    const currency = currencyCode(record.values[by]) ?? '';
    sums.set(currency, (sums.get(currency) ?? 0) + value);
  }
  if (sums.size === 0) return null;
  const order = (schema.fields.find((f) => f.key === by)?.options ?? []).map((o) => o.toUpperCase());
  const rank = (c: string) => (c === '' ? Number.MAX_SAFE_INTEGER : order.includes(c) ? order.indexOf(c) : order.length);
  return [...sums].sort(([a], [b]) => rank(a) - rank(b)).map(([currency, value]) => ({ value, ...(currency && { currency }) }));
}

/** The sum of a number or formula column over records; null when the column is not one, is a percent, which does not add up, or no record has a value. */
export function columnSum(records: Record[], schema: Schema, key: string, today: string): number | null {
  const field = schema.fields.find((f) => f.key === key);
  if (!field || (field.type !== 'number' && !isComputed(field.type)) || field.format?.style === 'percent') return null;
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

/** Whether a record matches what was typed in the search box: in its name, its code or another text-like field, case apart. */
export function matchesQuery(record: Record, schema: Schema, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return schema.fields.some((f) => SEARCHED.includes(f.type) && valueText(record.values[f.key]).toLowerCase().includes(q));
}

/** Records sorted; empty values go last either way, and records that tie keep their name order. Formulas sort by what they work out to for `today`. */
export function sortRecords(records: Record[], schema: Schema, sort: RecordSort, today = ''): Record[] {
  const field = schema.fields.find((f) => f.key === sort.key);
  const type = field?.type ?? 'text';
  const valueOf = (r: Record): FieldValue | undefined => (field ? fieldValueOf(r, field, schema, today) : r.values[sort.key]);
  // A worked-out field sorts by what it gives: numbers as numbers, the rest as text.
  // A choice sorts in the order of its options, a work going on before one planned; one not among them after.
  const rank = (v: FieldValue) => {
    const i = field?.options?.indexOf(valueText(v)) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const compare = (a: FieldValue, b: FieldValue): number => {
    if (type === 'select' && field?.options?.length) return rank(a) - rank(b) || valueText(a).localeCompare(valueText(b));
    if ((typeof a === 'number' && typeof b === 'number') || (typeof a === 'boolean' && typeof b === 'boolean') || type === 'number' || type === 'checkbox') return Number(a) - Number(b);
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

// ---------- linked records ----------

/** The link fields of a schema that point at the collection at `dir`. */
export const linkFieldsTo = (schema: Schema, dir: string): Field[] => schema.fields.filter((f) => f.type === 'link' && f.collection === dir);

/** Whether a link field's value points at `record`: by its id, or by its name for a link written by hand without one. */
export function pointsAt(value: unknown, record: Pick<Record, 'id' | 'name'>): boolean {
  const links = (Array.isArray(value) ? (value as unknown[]) : [value]).filter(isLink);
  const name = record.name.trim().toLowerCase();
  return links.some((link) => (link.id ? link.id === record.id : link.name.trim().toLowerCase() === name));
}

/** The records of `source` that link to `record` of the collection at `dir`. */
export function linkedRecords(source: Collection, dir: string, record: Pick<Record, 'id' | 'name'>): Record[] {
  const fields = linkFieldsTo(source.schema, dir);
  return fields.length === 0 ? [] : source.records.filter((r) => fields.some((f) => pointsAt(r.values[f.key], record)));
}

/**
 * The records a linked block lists: those linking to the record; with `through`, those linking
 * where the record's link of that key points, the record left out (a request's company's requests).
 */
export function blockRecords(block: Pick<LinkedBlock, 'through'>, source: Collection, dir: string, record: Pick<Record, 'id' | 'name' | 'values'>, schema: Pick<Schema, 'fields'> | undefined): Record[] {
  if (!block.through) return linkedRecords(source, dir, record);
  const field = schema?.fields.find((f) => f.key === block.through && f.type === 'link');
  const value = record.values[block.through];
  const to = Array.isArray(value) ? value[0] : value;
  if (!field?.collection || !isLink(to)) return [];
  return linkedRecords(source, field.collection, to).filter((r) => r.id !== record.id);
}

/** The collections that have a link field pointing at the collection at `dir`. */
export const linkingCollections = (collections: Collection[], dir: string): Collection[] => collections.filter((c) => linkFieldsTo(c.schema, dir).length > 0);

/**
 * What a new record of `schema` holds when it is added from `record`, of the collection at `dir`
 * whose schema is `from`: every link field pointing there holds the record, and one pointing
 * where a link of the record points holds that link too, so that an activity added to a person
 * is also the activity of the person's company.
 */
export function linkedValues(schema: Schema, dir: string, record: Record, from: Schema): Record['values'] {
  const values: Record['values'] = {};
  for (const field of schema.fields) {
    if (field.type !== 'link' || !field.collection) continue;
    let link: Link | undefined;
    if (field.collection === dir) link = linkTo(record);
    else {
      const own = from.fields.find((f) => f.type === 'link' && f.collection === field.collection && !isEmpty(record.values[f.key]));
      const value = own ? record.values[own.key] : undefined;
      link = (Array.isArray(value) ? (value as unknown[]) : [value]).find(isLink);
    }
    if (link) values[field.key] = field.many ? [link] : link;
  }
  return values;
}

/**
 * Whether a field is on the record's form: with no condition, or when all of its conditions hold
 * (design/shown-when.md). A condition on a field the schema does not have holds, so the field shows.
 */
export function shownOnForm(field: Pick<Field, 'when'>, record: Pick<Record, 'values'>, schema: Pick<Schema, 'fields'>, today = ''): boolean {
  return !field.when || field.when.every((c) => matchesCondition(record, schema, c, today));
}

/** The fields a record leaves empty that it cannot, by key: the name, when the schema has one, and the fields that are required and shown. */
export function missingFields(values: Record['values'], schema: Schema): string[] {
  return schema.fields
    .filter((f) => ((f.type === 'name' && !f.optional) || (f.required && shownOnForm(f, { values }, schema))) && (typeof values[f.key] === 'string' ? !(values[f.key] as string).trim() : isEmpty(values[f.key])))
    .map((f) => f.key);
}

/**
 * What does not fit the schema in a record, by field: a name or a required field left empty
 * (`missing`), a value in the file its field cannot hold, kept in the file as it was (`mismatch`),
 * a select's value that is not one of its choices (`choice`). Such a record is not refused, since
 * its file may have come from elsewhere; it is marked.
 */
export interface RecordProblem {
  /** The field it is at; empty for one about the record as a whole. */
  field: string;
  /** `check`: a check of the collection's rules the record fails, saying what to do. */
  kind: 'missing' | 'mismatch' | 'choice' | 'check';
  /** What a check says. */
  message?: string;
}

export function recordProblems(record: Pick<Record, 'values' | 'extra'>, schema: Schema): RecordProblem[] {
  const problems: RecordProblem[] = [];
  for (const field of schema.fields) {
    if (isComputed(field.type)) continue;
    const value = record.values[field.key];
    if (isEmpty(value) && field.key in record.extra) problems.push({ field: field.key, kind: 'mismatch' });
    else if ((field.type === 'name' || (field.required && shownOnForm(field, record, schema))) && (typeof value === 'string' ? !value.trim() : isEmpty(value))) problems.push({ field: field.key, kind: 'missing' });
    else if (field.type === 'select' && typeof value === 'string' && value && !(field.options ?? []).includes(value)) problems.push({ field: field.key, kind: 'choice' });
  }
  return problems;
}

/** What is wrong with a field of a record, or with the record, said for the one looking at it. */
export function problemText(problem: RecordProblem, field: Field | undefined, record: Pick<Record, 'values' | 'extra'>): string {
  if (problem.kind === 'check' || !field) return problem.message ?? '';
  if (problem.kind === 'missing') return field.type === 'name' ? t('collection.nameNeeded') : t('collection.problem.missing', { field: field.label });
  if (problem.kind === 'choice') return t('collection.problem.choice', { value: String(record.values[field.key]), field: field.label });
  return t('collection.problem.mismatch', { value: rawText(record.extra[field.key]), type: t(`fields.type.${field.type}`).toLowerCase() });
}

/** A value of the file as it was written, as text: a list joined with commas, anything else as YAML would show it. */
export function rawText(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(rawText).join(', ');
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (isRecord(raw)) return JSON.stringify(raw);
  return String(raw);
}

/** What a record is called on its screen and in a question about it: its name, else its code, else "Untitled". */
export const recordTitle = (record: Pick<Record, 'name' | 'code'>) => record.name || record.code || t('collection.untitled');
