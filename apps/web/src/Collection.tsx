import {
  type Board,
  boardName,
  calendarRecords,
  monthDays,
  calendarStarts,
  startingValues,
  boardsLinkingTo,
  cardValue,
  type ChoiceRenames,
  type Collection,
  type CollectionLook,
  collectionOf,
  type ColumnWidths,
  type DueRecord,
  addDays,
  type RepeatDay,
  type Computer,
  computerFor,
  actionsOf,
  actionState,
  changesInTable,
  planSave,
  recordWith,
  changesOf,
  type Change,
  groupLinked,
  localPath,
  newRecordId,
  type SaveRun,
  type RuleSpaceNow,
  savesOf,
  spaceOf,
  collectionName,
  columnSums,
  currencyOf,
  formatNumber,
  type Sum,
  type Condition,
  type ConditionOp,
  type Field,
  fieldHref,
  type FieldValue,
  fieldLabel,
  stepCounts,
  dayWords,
  fieldValueOf,
  GROUPABLE,
  groupRecords,
  faceFields,
  isComplete,
  isComputed,
  isEmpty,
  isFinished,
  keyOf,
  INBOX_TASKS,
  type NewTask,
  recordTasks,
  type Task,
  templateNamed,
  isLink,
  isLinkable,
  type Layout,
  type LayoutBlock,
  type LayoutItem,
  type Link,
  type LinkedBlock,
  linkedCards,
  linkedRecords,
  blockRecords,
  forMe,
  linkedSort,
  linesBlocks,
  showsLines,
  hiddenOnForm,
  linkedValues,
  linkFieldsTo,
  linkGone,
  linkingCollections,
  linkTo,
  matchesConditions,
  type OptionColor,
  optionColor,
  opsFor,
  opTakesValue,
  problemText,
  putView,
  rawText,
  recordLabel,
  type RecordProblem,
  recordProblems,
  recordTitle,
  type RecordGroup,
  removeView,
  type Schema,
  type View,
  layoutOf,
  matchesQuery,
  missingFields,
  nameField,
  type NewRecord,
  numberText,
  type Record,
  type RecordPatch,
  type RecordSort,
  shownOnForm,
  sortRecords,
  type Subtask,
  TODAY,
  unplacedFields,
  valueText,
  timeOf,
  offeredOptions,
  optionName,
  viewSumParts,
  viewValues,
} from '@scrawlnotes/core';
import type { ScrawlEditor } from '@scrawlnotes/editor';
import { locale, t } from '@scrawlnotes/i18n';
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CardPanel, type CardPanelActions } from './CardPanel';
import { CalendarNav, CalendarViewDialog, calendarStatus, CollectionCalendar, DaysMonth, firstRange, PhoneCollectionCalendar, repeatItems, useCalendarNav } from './CollectionCalendar';
import { boxKeys, Chip, choiceOptions, hueStyle, LIST_KEYS, MultiPicker, type Option, OptionList, Picker, useEscape } from './choices';
import { fieldChoices, LabelsField } from './labels';
import { FieldsDialog } from './Fields';
import { isPhone, onPage } from './device';
import type { MenuHead, MenuItem } from './dialogs';
import { AttachButton } from './Description';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import type { FormSave, StopNote } from './session';
import { collectionLabel } from './items';
import { useNarrow } from './narrow';
import { FilterSheet, LinkedTab as PhoneLinkedTab, PhoneCollectionList, ViewSheet } from './PhoneCollection';
import { Subtasks } from './Subtasks';
import { dueClass, dueLabel } from './Tasks';
import { DateTimeBox, DurationBox } from './TimeInputs';
import { quote } from './text';

// A collection, after the Collection views of design/mockups.html: one table of its records, a
// search box, Fields and Add record in its head. A record is one form in a modal, drawn from the
// schema's layout (columns of sections of fields, the body among them): every field is a box,
// what is typed is held as a draft, and Save writes it all at once, as one file. A new record is
// the same form empty, with Create. A choice opens a list under its box, as a card's status does.
// Fields opens the window that changes the fields and the layout (Fields.tsx).

export interface CollectionActions {
  /** Returns a message when the record cannot be made. From the form, `form` says the id it showed and what its onChanges added. */
  addRecord: (dir: string, input: NewRecord, form?: FormSave) => Promise<string | null>;
  updateRecord: (dir: string, id: string, patch: RecordPatch, form?: FormSave) => Promise<string | null>;
  /** What the onChanges of a field do as the form changes it, writing nothing; null when nothing watches it. */
  planChange?: (dir: string, id: string, values: Record['values'], old: Record | null, field: string) => SaveRun | null;
  /** What the onSaves of a collection make of a record not written yet, a new record's line; `old` null for a new one. */
  planSaved?: (dir: string, id: string, values: Record['values'], old: Record['values'] | null) => Record['values'];
  /** Writes values a calendar moved or stretched a record to, saying so with `text` and Undo. */
  moveRecord: (dir: string, id: string, values: Record['values'], text: string) => void;
  /** Asks first, then moves the record's file to the trash. */
  removeRecord: (dir: string, record: Record) => void;
  /** Runs a button of the collection's rules on a record as it is written: asks first when it says so; says what it did, with Undo, or where it stopped. */
  pressButton: (dir: string, id: string, name: string, given?: Record['values']) => void;
  /** Runs a button on each of the records in turn, those it may run on; says how many, with one Undo for all (View.all, Reorder all). */
  pressAll?: (dir: string, ids: string[], name: string) => void;
  /** A repeating calendar's day (design/gym.md 4.3): Start opens the record that closes it, the other button writes it closed. */
  startDay?: (due: DueRecord) => void;
  skipDay?: (due: DueRecord) => void;
  /** A day closed opened again: the record that closed it to the trash, with Undo (a habit's day ticked by mistake). */
  reopenDay?: (day: RepeatDay) => void;
  /** Opens a record of another collection over the screen: the workout that closed a program's day. */
  openRecord?: (dir: string, id: string) => void;
  /** Opens the record's file as a note, in a tab. */
  openNote: (path: string) => void;
  /** Opens a web page, a new mail or a call, outside the app. */
  openLink: (href: string) => void;
  /** On a phone an action sheet, with what it is about on top. */
  menu: (event: MouseEvent, items: MenuItem[], head?: MenuHead) => void;
  /** On a phone, opens a record as a page of its own. */
  show?: (dir: string, id: string) => void;
  /** On a phone, opens a new record's form, starting with `values`. */
  create?: (dir: string, values?: Record['values']) => void;
  /** Asks before something is lost; `action` is what the confirming button says. */
  ask: (title: string, message: string, run: () => void, action: string) => void;
  /** Says something that went wrong, as a notice at the foot of the window. */
  say?: (text: string) => void;
  /** An editor for the body of a record of the collection at `home`, in `parent`; the host wires it to the files of its space. */
  editor: (home: string, parent: HTMLElement, doc: string, onChange: (doc: string) => void) => ScrawlEditor;
  /** Copies files chosen with Attach into a record's notes, where the cursor is. */
  attach: (editor: ScrawlEditor, home: string, files: File[]) => void;
  /** The records of the collection at a path, for a link to pick from; null when there is no such collection. */
  records: (collection: string) => Record[] | null;
  /** The collection at a path, for the records that link to a record; null when there is none. */
  collection: (dir: string) => Collection | null;
  /** Every collection in the space. */
  collections: () => Collection[];
  /** Changes the collection's schema file, for its views. Returns a message when it cannot be written. */
  changeSchema: (dir: string, change: (schema: Schema) => Schema) => Promise<string | null>;
  /** Writes what the Fields window changed: the schema, the records whose choices were renamed, and the rules file when given. */
  saveFields: (dir: string, schema: Schema, renames: ChoiceRenames, rules?: string) => Promise<string | null>;
  /** Who uses the app: what a default of me() gives. */
  me?: () => string | undefined;
  /** Where the collection's rules last stopped on this device; null when they have not since they were saved. */
  lastStop?: (dir: string) => StopNote | null;
  /** Forgets where they last stopped. */
  clearStop?: (dir: string) => void;

  /** Makes the collection a block of `dir`'s record screen looks for, which is not there, linked to `dir`. Returns a message when it cannot. */
  createLinked: (dir: string, target: string) => Promise<string | null>;
  /** Every board, by path: the cards that link to a record. */
  boards: () => { [path: string]: Board };
  /** What a card opened over a record can do. */
  cardActions: CardPanelActions;
  /** Every task list's tasks, by path: the tasks about a record. */
  tasks: () => { [list: string]: Task[] };
  /** Adds a task to a list, as a list's own line does. */
  addTask: (list: string, input: NewTask) => void;
  setTaskDone: (list: string, id: string, done: boolean) => void;
}

/** A table longer than this shows its first rows and a line for the rest. */
const MANY_ROWS = 20;
const SHOWN_FIRST = 15;

// ---------- tables ----------

// Every table of records is one kind of table (the collection's, a record's linked records, its
// lines under its row): a column a field, each as wide as its values, a long text cut short; a row
// opens its record at a click, its ··· at its end, and the right click, the same menu: Open, the
// rules' buttons, Delete. Nothing is typed in a cell; only the fields the table is told to change
// are, a tick at a click, a choice from its list, a text in a box (`changesInTable`).

/** How wide the values of a type go before they are cut short; the others are as wide as what they hold. */
const MAX_WIDTH: Partial<{ [type in Field['type']]: number }> = {
  name: 280,
  text: 240,
  link: 200,
  lookup: 200,
  formula: 200,
  'multi-select': 220,
  url: 220,
  email: 220,
};
/** A column dragged narrower than this stops there. */
const MIN_WIDTH = 40;

/** A cell's box: its value on one line, cut short at its column's width, the one it was dragged to or its type's. */
const cellBox = (field: Field, width?: number): CSSProperties | undefined =>
  width ? { width, maxWidth: width } : MAX_WIDTH[field.type] ? { maxWidth: MAX_WIDTH[field.type] } : undefined;

/** What a value cut short says in full when pointed at. */
const cutText = (field: Field, value: FieldValue | undefined) => (MAX_WIDTH[field.type] && !isEmpty(value) ? valueText(value) : undefined);

/** A row's keys: Enter opens it, the arrows go to the row above or below it. */
function rowKeys(event: KeyboardEvent<HTMLTableRowElement>, open: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    open();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const rows = [...(event.currentTarget.closest('table')?.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr.rec') ?? [])];
  rows[rows.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
}

/**
 * A cell the table changes: a tick turns at a click, a choice is picked from its list under it.
 * Its clicks stay in it, the list's too: the row does not open.
 */
/** A text the table changes where it is (design/meal-plans.md 3): a box in the cell, written as it is left or Enter is pressed; Esc puts it back. */
function TextCell({ field, value, onChange }: { field: Field; value: string; onChange: (value: FieldValue) => void }) {
  const [typed, setTyped] = useState(value);
  useEffect(() => setTyped(value), [value]);
  const done = () => {
    const next = typed.trim();
    if (next !== value) onChange(next || null);
  };
  return (
    <input
      className="ttext"
      aria-label={field.label}
      placeholder={`${field.label}…`}
      value={typed}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={done}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setTyped(value);
      }}
    />
  );
}

/** A number the table changes where it is (design/scrawl-apps.md 3.6): what was counted, written as it is left or Enter is pressed; Esc puts it back, an empty box is nothing. */
function NumberCell({ field, value, onChange }: { field: Field; value: number | null; onChange: (value: FieldValue) => void }) {
  const [typed, setTyped] = useState(value === null ? '' : String(value));
  useEffect(() => setTyped(value === null ? '' : String(value)), [value]);
  const done = () => {
    const next = typed.trim() === '' ? null : Number(typed.replace(',', '.'));
    if (next !== null && !Number.isFinite(next)) return setTyped(value === null ? '' : String(value));
    if (next !== value) onChange(next);
  };
  return (
    <input
      className="ttext tnum"
      inputMode="decimal"
      aria-label={field.label}
      value={typed}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={done}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setTyped(value === null ? '' : String(value));
      }}
    />
  );
}

function ChangeCell({ field, value, onChange }: { field: Field; value: FieldValue | undefined; onChange: (value: FieldValue) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  if (field.type === 'checkbox') {
    const on = value === true;
    return (
      <button type="button" role="checkbox" aria-checked={on} aria-label={field.label} className={on ? 'tick cbx on' : 'tick cbx'} onClick={(event) => (event.stopPropagation(), onChange(!on))}>
        {on && <Icon name="check" />}
      </button>
    );
  }
  if (field.type === 'text') return <TextCell field={field} value={typeof value === 'string' ? value : ''} onChange={onChange} />;
  if (field.type === 'number') return <NumberCell field={field} value={typeof value === 'number' ? value : null} onChange={onChange} />;
  const now = typeof value === 'string' && value ? value : null;
  const options: Option[] = [
    ...(!field.required ? [{ value: null, label: t('collection.none'), chip: false }] : []),
    ...choiceOptions(field, field.options ?? []),
    ...(now && !field.options?.includes(now) ? choiceOptions(field, [now]) : []),
  ];
  return (
    <span className="tchange" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button ref={box} type="button" className="tchoice" aria-haspopup="listbox" aria-expanded={open} aria-label={field.label} onClick={() => setOpen(!open)} onKeyDown={boxKeys(open, setOpen, keys)}>
        {now ? <Chip text={now} color={optionColor(field, now)} /> : <span className="empty">–</span>}
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={now ? [now] : []}
          label={field.label}
          keys={keys}
          width={140}
          onPick={(picked) => {
            setOpen(false);
            if (picked !== now) onChange(picked);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/** The column of a collection with no fields yet: the records by what they are called, "Untitled". */
const TITLE: Field = { key: '\u0000title', label: '', type: 'name' };

/** The fields of the table, in the schema's order; the first stays at the left. A schema with none shows its records by title. */
const tableFields = (collection: Collection): Field[] =>
  collection.schema.fields.length > 0 ? collection.schema.fields : [{ ...TITLE, label: t('collection.recordColumn') }];

// ---------- values ----------

/**
 * A link as a chip: the record's name and code, struck through with "(deleted)" when the record
 * is gone. With `onOpen` the name is a button that opens the record.
 */
function LinkChip({ link, gone, onOpen, children }: { link: Link; gone: boolean; onOpen?: () => void; children?: ReactNode }) {
  return (
    <span className={gone ? 'lnk gone' : 'lnk'} title={gone ? t('collection.goneHint') : undefined}>
      {onOpen && !gone ? (
        <button
          type="button"
          className="ln"
          title={t('collection.openRecord')}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          {recordLabel(link)}
        </button>
      ) : (
        <span className="ln">{recordLabel(link)}</span>
      )}
      {gone && <small>{t('collection.gone')}</small>}
      {children}
    </span>
  );
}

/**
 * What a value needs from the collection to be shown: the records links point at, their
 * collections, a way to open an address, and, where a record can open over the screen, a way to
 * open the one a link points at.
 */
export interface ValueContext {
  records: CollectionActions['records'];
  collection: CollectionActions['collection'];
  openLink: (href: string) => void;
  openRecord?: (field: Field, link: Link) => void;
  /** What the other records, or the board's other cards, hold in a multi-select or a text that suggests: offered as it is typed. */
  used?: (field: Field) => string[];
  /** The record's values as the form holds them: a link's choices those of its group. */
  values?: Record['values'];
}

/** A link's records to pick from: with `within`, those of the record's group, all while it has none. */
export function choicesOf(field: Field, records: Record[], values: Record['values'] | undefined): Record[] {
  const group = field.within ? values?.[field.within] : null;
  const id = isLink(group) ? group.id : null;
  if (!id) return records;
  return records.filter((r) => {
    const held = r.values[field.within!];
    return (Array.isArray(held) ? held : [held]).some((l) => isLink(l) && l.id === id);
  });
}

/** The words a multi-select holds across records or cards, those held most first. */
export function usedValues(values: unknown[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    for (const held of Array.isArray(value) ? value : [value]) {
      const each = isLink(held) ? held.name : held;
      if (typeof each === 'string' && each.trim()) counts.set(each.trim(), (counts.get(each.trim()) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word]) => word);
}

const isAddress = (type: Field['type']) => type === 'url' || type === 'email' || type === 'phone';

/** A value as the table shows it: text, a chip for a choice, chips for choices, a tick for a flag, an address to open. */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A day whose year may be left out, a birthday (design/more-apps.md 4.7): its day and its month,
 * then its year if it is known. Written `1990-11-12`, or `--11-12` with no year.
 */
export function YearlessBox({ id, label, value, onChange, className }: { id?: string; label: string; value: FieldValue; onChange: (value: FieldValue) => void; className?: string }) {
  const text = typeof value === 'string' ? value : '';
  const yearless = text.startsWith('--');
  const [y, m, d] = yearless ? ['', text.slice(2, 4), text.slice(5, 7)] : text ? text.slice(0, 10).split('-') : ['', '', ''];
  const [year, setYear] = useState(y ?? '');
  useEffect(() => setYear(y ?? ''), [y]);
  const write = (day: string, month: string, yy: string) => {
    if (!day || !month) return onChange(null);
    const mm = month.padStart(2, '0');
    const dd = day.padStart(2, '0');
    onChange(/^\d{4}$/.test(yy) ? `${yy}-${mm}-${dd}` : `--${mm}-${dd}`);
  };
  const day = d ? String(Number(d)) : '';
  const month = m ? String(Number(m)) : '';
  return (
    <span className={className ?? 'yearless'} role="group" aria-label={label}>
      <select id={id} aria-label={t('collection.day')} value={day} onChange={(event) => write(event.target.value, month || '1', year)}>
        <option value="">–</option>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i} value={String(i + 1)}>
            {i + 1}
          </option>
        ))}
      </select>
      <select aria-label={t('collection.month')} value={month} onChange={(event) => write(day || '1', event.target.value, year)}>
        <option value="">–</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={String(i + 1)}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        aria-label={t('collection.year')}
        placeholder={t('collection.yearIfKnown')}
        value={year}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '');
          setYear(next);
          if (next === '' || next.length === 4) write(day, month, next);
        }}
      />
    </span>
  );
}

/**
 * A stepped choice on a form, as Teal shows a job's stages (design/more-apps.md 4.6): its steps in
 * a bar, those passed lit, the one it is at filled; the ones it ends at after them. A click picks one.
 */
export function StepsBar({ field, value, onChange, className }: { field: Field; value: FieldValue; onChange: (value: FieldValue) => void; className?: string }) {
  const end = new Set(field.steps?.end ?? []);
  const line = (field.options ?? []).filter((o) => !end.has(o));
  const at = typeof value === 'string' ? value : '';
  // Ended well, every step is passed; ended badly, none is lit.
  const reached = end.has(at) ? (field.steps?.no.includes(at) ? -1 : line.length) : line.indexOf(at);
  return (
    <span className={className ?? 'steps'} role="radiogroup" aria-label={field.label}>
      {(field.options ?? []).map((option) => {
        const i = line.indexOf(option);
        const cls = [end.has(option) && 'end', field.steps?.no.includes(option) && 'no', option === at ? 'on' : i >= 0 && i < reached ? 'past' : ''].filter(Boolean).join(' ');
        return (
          <button key={option} type="button" role="radio" aria-checked={option === at} className={cls || undefined} onClick={() => onChange(option)}>
            {option}
          </button>
        );
      })}
    </span>
  );
}

/** A stepped choice in a table, as Simplify lists a job: a dot for each step, those reached lit; one that ended badly red. */
export function StepsDots({ field, value }: { field: Field; value: FieldValue }) {
  const end = new Set(field.steps?.end ?? []);
  const line = (field.options ?? []).filter((o) => !end.has(o));
  const at = typeof value === 'string' ? value : '';
  const no = !!field.steps?.no.includes(at);
  const reached = end.has(at) ? (no ? -1 : line.length - 1) : line.indexOf(at);
  return (
    <span className={no ? 'dots no' : 'dots'} title={at} aria-label={at}>
      {line.map((step, i) => (
        <span key={step} className={i <= reached ? 'd on' : no && i === line.length - 1 ? 'd no' : 'd'} />
      ))}
    </span>
  );
}

/** How many are at each step, as Teal heads its list: "6 Saved · 7 Applied". */
/** The chips over a view (View.chips): All, then each value its records have, with how many; one picked shows only its records. */
export function ViewChips({ values, order, on, onPick }: { values: string[]; order: string[]; on: string | null; onPick: (value: string | null) => void }) {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const shown = [...order.filter((o) => counts.has(o)), ...[...counts.keys()].filter((k) => !order.includes(k))];
  return (
    <div className="view-chips" role="group">
      <button type="button" aria-pressed={!on} className={!on ? 'on' : undefined} onClick={() => onPick(null)}>
        {t('collection.all')}
        <small>{values.length}</small>
      </button>
      {shown.map((v) => (
        <button key={v} type="button" aria-pressed={on === v} className={on === v ? 'on' : undefined} onClick={() => onPick(on === v ? null : v)}>
          {v}
          <small>{counts.get(v)}</small>
        </button>
      ))}
    </div>
  );
}

export function StepStrip({ counts }: { counts: [string, number][] }) {
  return (
    <div className="step-strip">
      {counts.map(([step, count]) => (
        <span key={step}>
          <b>{count}</b>
          {step}
        </span>
      ))}
    </div>
  );
}

export function Cell({ field, value, ctx, values }: {
  field: Field;
  value: FieldValue | undefined;
  ctx: ValueContext;
  /** The record's values, for a number whose currency is one of its fields. */
  values?: Record['values'];
}) {
  if (field.signature) return typeof value === 'string' && value ? <Signature path={value} small /> : null;
  // A bar with nothing to measure still says what it says: an anime of no known length at "E1088".
  if (isEmpty(value) && field.format?.bar && field.format.caption && !isEmpty(values?.[field.format.caption] ?? null)) {
    return (
      <span className="pbar">
        <small>{valueText(values![field.format.caption]!)}</small>
      </span>
    );
  }
  if (isEmpty(value)) return <span className="empty">–</span>;
  if (field.type === 'select' && field.steps && !field.steps.chip) return <StepsDots field={field} value={value ?? null} />;
  if (field.type === 'select') return <Chip text={optionName(field, valueText(value), values)} color={optionColor(field, valueText(value))} />;
  if (field.type === 'multi-select') {
    return (
      <span className="lbls">
        {(value as string[]).map((item) => (
          <Chip key={item} text={optionName(field, item, values)} color={optionColor(field, item)} />
        ))}
      </span>
    );
  }
  // A tick as the Gym mockup draws it: a box, filled with its mark when ticked.
  if (field.type === 'checkbox') return <span className={value === true ? 'tick cbx on' : 'tick cbx'}>{value === true && <Icon name="check" />}</span>;
  if (field.type === 'person') return <span className="who">{valueText(value)}</span>;
  if (field.type === 'link') {
    const links = (Array.isArray(value) ? value : [value]).filter(isLink);
    const target = field.collection ? ctx.records(field.collection) : null;
    return (
      <span className="lnks">
        {links.map((link) => (
          <LinkChip key={link.id || link.name} link={link} gone={linkGone(link, target)} />
        ))}
      </span>
    );
  }
  const text = valueText(value);
  const href = isAddress(field.type) ? fieldHref(field.type, text) : null;
  if (href) {
    return (
      <a
        className="ct ext"
        href={href}
        onClick={(event) => {
          // The address opens; the record does not.
          event.preventDefault();
          event.stopPropagation();
          ctx.openLink(href);
        }}
      >
        {text}
      </a>
    );
  }
  // A percent as a bar, what it says beside it its caption's value (design/more-apps.md 4.9).
  if (typeof value === 'number' && field.format?.bar) {
    const caption = field.format.caption ? valueText(values?.[field.format.caption]) : '';
    return (
      <span className={['pbar', field.format.warn && 'budget', field.format.warn && (value > 1 ? 'over' : value >= 0.8 ? 'warn' : '')].filter(Boolean).join(' ')}>
        <span className="b">
          <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
        </span>
        <small>{caption || formatNumber(value, field.format)}</small>
      </span>
    );
  }
  if (typeof value === 'number') return <span className="num">{formatNumber(value, field.format, currencyOf(field.format, values))}</span>;
  // A day with its time shows its clock after it; one with no time, where the field has one, all day.
  // A birthday reads as a day: "12 Nov", "12 Nov 1990".
  if (field.type === 'date' && typeof value === 'string' && field.yearless) return <span className="ct dt">{dayWords(value)}</span>;
  if (field.type === 'date' && typeof value === 'string') {
    const time = timeOf(value);
    return (
      <span className="ct dt">
        {value.slice(0, 10)}
        {time ? <span className="tm">{time}</span> : field.time && <span className="allday">{t('collection.allDay')}</span>}
      </span>
    );
  }
  const kind = field.type === 'name' ? 'ct name' : field.type === 'code' ? 'ct code' : field.type === 'date' || field.type === 'time' || field.type === 'rollup' ? 'ct dt' : 'ct';
  return <span className={field.type === 'number' || field.type === 'formula' ? 'num' : kind}>{text}</span>;
}

/**
 * A value that does not fit its field, as the table shows it, in the accent, saying why when
 * pointed at: "required" where a required field is empty, the text the file has where it holds
 * what the field cannot, a choice that is not one of the field's with a ring.
 */
function Flagged({ problem, field, record, shown, value, ctx }: {
  problem: RecordProblem;
  field: Field;
  record: Record;
  /** The field as its value shows, and the value, for a check: the value in the accent, or what to do where it is empty. */
  shown: Field;
  value: FieldValue | undefined;
  ctx: ValueContext;
}) {
  const why = problemText(problem, field, record);
  if (problem.kind === 'check') {
    return isEmpty(value) ? (
      <span className="ct bad" title={why}>
        {why}
      </span>
    ) : (
      <span className="flagged val" title={why}>
        <Cell field={shown} value={value} ctx={ctx} values={record.values} />
      </span>
    );
  }
  if (problem.kind === 'choice') {
    const value = String(record.values[field.key]);
    return (
      <span className="flagged" title={why}>
        <Chip text={value} color={optionColor(field, value)} />
      </span>
    );
  }
  return (
    <span className="ct bad" title={why}>
      {problem.kind === 'missing' ? t('collection.required').toLowerCase() : rawText(record.extra[field.key])}
    </span>
  );
}

// ---------- choices ----------

/** One choice of a select: the box shows it as a chip; a click opens the list of them. */
function SelectField({ field, value, named, onChange }: { field: Field; value: string | null; named?: (option: string) => string; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const options: Option[] = [
    { value: null, label: t('collection.none'), chip: false },
    ...choiceOptions(field, field.options ?? []),
    // A value the options do not have, as another tool or an older schema wrote it, stays choosable.
    ...(value && !field.options?.includes(value) ? choiceOptions(field, [value]) : []),
  ].map((o) => (named && typeof o.value === 'string' ? { ...o, label: named(o.value) } : o));
  return (
    <>
      <button
        ref={box}
        id={`field-${field.key}`}
        type="button"
        className="st-field"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={field.label}
        onClick={() => setOpen(!open)}
        onKeyDown={boxKeys(open, setOpen, keys)}
      >
        <span className="nm">{value ? <Chip text={named ? named(value) : value} color={optionColor(field, value)} /> : <span className="none">{t('collection.none')}</span>}</span>
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={value ? [value] : []}
          label={field.label}
          keys={keys}
          onPick={(picked) => {
            setOpen(false);
            onChange(picked);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The choices of a multi-select as chips in a box; a click opens the picker tasks and cards have,
 * with the field's choices and what the other records hold, and a word none of them is can be
 * added, which is how tags come to be. The choices are changed in Fields, not here.
 */
function ChoicesField({ id, field, value, used, onChange }: { id: string; field: Field; value: string[]; used: string[]; onChange: (value: string[]) => void }) {
  return (
    <LabelsField
      id={id}
      path=""
      labels={value}
      known={fieldChoices(field, used)}
      edit={false}
      placeholder={t('collection.findOrAdd')}
      createText={(name) => t('collection.addTagNamed', { name })}
      onCreate={() => undefined}
      onChange={onChange}
    />
  );
}

/** How many of a link's records show as chips before "+ more". */
const CHIPS_SHOWN = 9;

/**
 * A link picked from chips (design/more-apps.md 4.1): its collection's records, the most used in
 * this collection first, a few and "+ more" for the rest; a click picks one, again takes it off.
 */
export function LinkChips({ field, value, ctx, onChange }: { field: Field; value: Link | Link[] | null; ctx: ValueContext; onChange: (value: Link | Link[] | null) => void }) {
  const [all, setAll] = useState(false);
  const target = choicesOf(field, field.collection ? (ctx.records(field.collection) ?? []) : [], ctx.values);
  const used = ctx.used?.(field) ?? [];
  const rank = (name: string) => (used.includes(name) ? used.indexOf(name) : used.length);
  // The most used first, the others by name.
  const sorted = target.slice().sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  const links = (Array.isArray(value) ? value : value ? [value] : []).filter(isLink);
  const chosen = new Set(links.map((l) => l.id));
  // A chosen one far down the list shows too.
  const shown = all ? sorted : [...sorted.slice(0, CHIPS_SHOWN), ...sorted.slice(CHIPS_SHOWN).filter((r) => chosen.has(r.id))];
  const pick = (record: Record) => {
    if (chosen.has(record.id)) return onChange(field.many ? links.filter((l) => l.id !== record.id) : null);
    onChange(field.many ? [...links, linkTo(record)] : linkTo(record));
  };
  return (
    <span className="lchips" role="group" aria-label={field.label}>
      {shown.map((record) => (
        <button key={record.id} type="button" className={chosen.has(record.id) ? 'on' : undefined} aria-pressed={chosen.has(record.id)} onClick={() => pick(record)}>
          <Chip text={recordLabel(record)} />
        </button>
      ))}
      {!all && sorted.length > shown.length && (
        <button type="button" className="more" onClick={() => setAll(true)}>
          {t('collection.moreChips', { count: sorted.length - shown.length })}
        </button>
      )}
    </span>
  );
}

/**
 * A link's box: the record it points at as a chip (several, when the field holds many), and a line
 * to find another by name or code in the collection the field points at; the list under it shows
 * what matches. A link whose record is gone keeps showing the name it had, marked as deleted.
 */
function LinkField({ field, value, autoFocus, ctx, onChange }: {
  field: Field;
  value: Link | Link[] | null;
  /** Where the form starts: its list opens at once, a new workout's programs. */
  autoFocus?: boolean;
  ctx: ValueContext;
  onChange: (value: Link | Link[] | null) => void;
}) {
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(!!autoFocus);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const links = (Array.isArray(value) ? value : value ? [value] : []).filter(isLink);
  // Its records show by their name or code; a collection with neither has nothing to pick by.
  const into = field.collection ? ctx.collection(field.collection) : null;
  const linkable = !into || isLinkable(into.schema);
  const target = field.collection && linkable ? choicesOf(field, ctx.records(field.collection) ?? [], ctx.values) : null;
  const q = typed.trim().toLowerCase();
  const chosen = new Set(links.map((l) => l.id));
  const found = (target ?? [])
    .filter((r) => !chosen.has(r.id) && (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)))
    .slice(0, 50);
  const options: Option[] = found.map((r) => ({ value: r.id, label: recordLabel(r), chip: false }));
  const pick = (id: string | null) => {
    const record = found.find((r) => r.id === id);
    if (!record) return;
    const link = linkTo(record);
    onChange(field.many ? [...links, link] : link);
    setTyped('');
    if (field.many) return;
    setOpen(false);
    // The line typed in goes away with a link chosen; the keyboard stays with the chip's button.
    requestAnimationFrame(() => box.current?.querySelector('button')?.focus());
  };
  const remove = (link: Link) => {
    const rest = links.filter((l) => l !== link);
    onChange(field.many ? rest : null);
  };
  const full = !field.many && links.length > 0;
  return (
    <>
      <div ref={box} className="chips lnkbox" onClick={() => input.current?.focus()}>
        {links.map((link) => (
          <LinkChip key={link.id || link.name} link={link} gone={linkGone(link, target)} onOpen={ctx.openRecord && link.id ? () => ctx.openRecord!(field, link) : undefined}>
            <button type="button" aria-label={t('collection.removeChoice', { name: link.name })} onClick={() => remove(link)}>
              ×
            </button>
          </LinkChip>
        ))}
        {!full && (
          <input
            ref={input}
            id={`field-${field.key}`}
            aria-label={field.label}
            autoFocus={autoFocus}
            autoComplete="off"
            placeholder={links.length > 0 ? t('collection.addTag') : t('collection.pickRecord')}
            value={typed}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setTyped(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !typed && links.length > 0) return remove(links[links.length - 1]!);
              if (open && options.length > 0 && LIST_KEYS.includes(event.key)) return keys.current?.(event);
              if (event.key === 'Escape') setOpen(false);
              else if (event.key === 'Enter') event.preventDefault();
            }}
          />
        )}
      </div>
      {open && !full && (target === null || options.length === 0) && (
        <p className="lnk-none">
          {!linkable
            ? t('collection.cannotLink', { name: collectionName(field.collection ?? '') })
            : target === null
              ? t('collection.noTarget', { name: field.collection ?? '' })
              : t('collection.noRecords')}
        </p>
      )}
      {open && !full && options.length > 0 && (
        <OptionList anchor={box} options={options} current={[]} label={field.label} keys={keys} onPick={pick} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * A text's box that offers, as it is typed, what the other records hold in it, the most written
 * first: a doctor written before. A word typed anew is kept as it is.
 */
function SuggestBox({ id, field, value, used, autoFocus, onChange, onEnter }: {
  id: string;
  field: Field;
  value: string;
  used: string[];
  autoFocus?: boolean;
  onChange: (value: FieldValue) => void;
  onEnter?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const q = value.trim().toLowerCase();
  const options: Option[] = used
    .filter((word) => word.toLowerCase() !== q && (!q || word.toLowerCase().includes(q)))
    .slice(0, 8)
    .map((word) => ({ value: word, label: word, chip: false }));
  return (
    <>
      <input
        ref={box}
        id={id}
        type="text"
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label={field.label}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (open && options.length > 0 && LIST_KEYS.includes(event.key)) return keys.current?.(event);
          if (event.key === 'Escape') setOpen(false);
          else if (onEnter && event.key === 'Enter') (event.preventDefault(), onEnter());
        }}
      />
      {open && options.length > 0 && (
        <OptionList
          anchor={box}
          options={options}
          current={[]}
          label={field.label}
          keys={keys}
          onPick={(word) => {
            if (word !== null) onChange(word);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * A number's box. With a format it shows the number as the table does (₺96.800) and turns into
 * the plain number when it is typed in, back again when left.
 */
function NumberBox({ id, field, value, currency, autoFocus, onChange, onEnter }: {
  id: string;
  field: Field;
  value: number | null;
  currency?: string;
  autoFocus?: boolean;
  onChange: (value: FieldValue) => void;
  onEnter?: () => void;
}) {
  const [typing, setTyping] = useState(!!autoFocus);
  const shown = !typing && field.format && value !== null;
  return (
    <input
      id={id}
      type={shown ? 'text' : 'number'}
      inputMode="decimal"
      step="any"
      autoFocus={autoFocus}
      aria-label={field.label}
      value={shown ? formatNumber(value, field.format, currency ?? currencyOf(field.format)) : (value ?? '')}
      onFocus={() => setTyping(true)}
      onBlur={() => setTyping(false)}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      onKeyDown={(event) => onEnter && event.key === 'Enter' && (event.preventDefault(), onEnter())}
    />
  );
}

/** What the button beside an address does, by the field's type. */
const OPEN_LABEL = { url: 'collection.openUrl', email: 'collection.writeEmail', phone: 'collection.call' } as const;

/** The box a field is typed in, by its type. The value typed is held by the form. */
export function FieldInput({ field, value, autoFocus, ctx, currency, onChange, onEnter }: {
  field: Field;
  value: FieldValue;
  /** The keyboard comes to the box when the form opens. */
  autoFocus?: boolean;
  ctx: ValueContext;
  /** The currency of a number written as money, when it is one of the record's fields. */
  currency?: string;
  onChange: (value: FieldValue) => void;
  /** Enter in a line of text: the name's saves the form. */
  onEnter?: () => void;
}) {
  const id = `field-${field.key}`;
  // A signature is shown as it was drawn; it is drawn only where a button asks for it (Complete).
  if (field.signature) return typeof value === 'string' && value ? <Signature path={value} /> : <span className="dim">—</span>;
  // A choice offers what the record's other choice lets it, by its own names: an anime's Watching (choicesBy).
  const offered = field.choicesBy ? { ...field, options: offeredOptions(field, ctx.values) } : field;
  const named = (option: string) => optionName(field, option, ctx.values);
  switch (field.type) {
    case 'link':
      if (field.chips) return <LinkChips field={field} value={isLink(value) || Array.isArray(value) ? (value as Link | Link[]) : null} ctx={ctx} onChange={onChange} />;
      return <LinkField field={field} value={isLink(value) || Array.isArray(value) ? (value as Link | Link[]) : null} autoFocus={autoFocus} ctx={ctx} onChange={onChange} />;
    case 'select':
      if (field.steps) return <StepsBar field={field} value={value} onChange={onChange} />;
      // A choice of a few side by side, one click picking it: Out, In, Transfer (design/more-apps.md 4.1).
      if (field.chips) {
        return (
          <span className="segs" role="radiogroup" aria-label={field.label}>
            {(offered.options ?? []).map((option) => (
              <button key={option} type="button" role="radio" aria-checked={value === option} className={value === option ? 'on' : undefined} onClick={() => onChange(option)}>
                {named(option)}
              </button>
            ))}
          </span>
        );
      }
      return <SelectField field={offered} value={typeof value === 'string' && value ? value : null} named={named} onChange={onChange} />;
    case 'multi-select':
      // A few chosen side by side, each click taking it or leaving it: a trip's kinds (design/more-apps.md 4.5).
      if (field.chips) {
        const on = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        return (
          <span className="segs many" role="group" aria-label={field.label}>
            {(offered.options ?? []).map((option) => (
              <button key={option} type="button" aria-pressed={on.includes(option)} className={on.includes(option) ? 'on' : undefined} onClick={() => onChange(on.includes(option) ? on.filter((o) => o !== option) : [...on, option])}>
                {named(option)}
              </button>
            ))}
          </span>
        );
      }
      return <ChoicesField id={id} field={offered} value={Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []} used={ctx.used?.(field) ?? []} onChange={onChange} />;
    case 'checkbox':
      return (
        <label className="check">
          <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          <span>{valueText(value === true)}</span>
        </label>
      );
    case 'number':
      if (field.format?.style === 'duration') return <DurationBox id={id} label={field.label} value={typeof value === 'number' ? value : null} autoFocus={autoFocus} onChange={onChange} onEnter={onEnter} />;
      return <NumberBox id={id} field={field} value={typeof value === 'number' ? value : null} currency={currency} autoFocus={autoFocus} onChange={onChange} onEnter={onEnter} />;
    case 'date':
      if (field.yearless) return <YearlessBox id={id} label={field.label} value={value} onChange={onChange} />;
      if (field.time) return <DateTimeBox id={id} label={field.label} value={typeof value === 'string' && value ? value : null} autoFocus={autoFocus} onChange={onChange} />;
      return <input id={id} type="date" autoFocus={autoFocus} aria-label={field.label} value={typeof value === 'string' ? value.slice(0, 10) : ''} onChange={(event) => onChange(event.target.value || null)} />;
    case 'time':
      return <input id={id} type="time" autoFocus={autoFocus} aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || null)} />;
    default: {
      const text = valueText(value);
      if ((field.type === 'text' || field.type === 'name') && field.suggest) return <SuggestBox id={id} field={field} value={text} used={ctx.used?.(field) ?? []} autoFocus={autoFocus} onChange={onChange} onEnter={onEnter} />;
      const input = (
        <input
          id={id}
          type={field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-label={field.label}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => onEnter && event.key === 'Enter' && (event.preventDefault(), onEnter())}
        />
      );
      if (field.type !== 'url' && field.type !== 'email' && field.type !== 'phone') return input;
      // An address that can be opened has a button for it at the end of its box.
      const href = fieldHref(field.type, text);
      return (
        <div className="addr">
          {input}
          {href && (
            <button type="button" className="go" title={t(OPEN_LABEL[field.type])} aria-label={t(OPEN_LABEL[field.type])} onClick={() => ctx.openLink(href)}>
              <Icon name="open" />
            </button>
          )}
        </div>
      );
    }
  }
}

/** The body of a record, in the live preview editor, as part of the form: what is typed goes to the draft. */
export function NotesBlock({ home, text, editor, attach, onChange, only }: {
  home: string;
  text: string;
  editor: CollectionActions['editor'];
  attach: CollectionActions['attach'];
  onChange: (text: string) => void;
  /** Only what is attached, a receipt: no box to write in until something is. */
  only?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const made = useRef<ScrawlEditor | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    made.current = editor(home, host.current!, text, (doc) => changed.current(doc));
    return () => {
      made.current?.destroy();
      made.current = null;
    };
    // Made once with the record's body; what is typed in it is the draft's body from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className={text ? 'rm-notes' : 'rm-notes empty'} hidden={only && !text} data-hint={t('collection.notesHint')} onClick={() => made.current?.view.focus()}>
        <div ref={host} />
      </div>
      <div className="rm-attach">
        <AttachButton onFiles={(files) => made.current && attach(made.current, home, files)} />
      </div>
    </>
  );
}

/** What the form holds: the record as it is being typed. */
export interface Draft {
  /** By field key, the name and the code among them. */
  values: Record['values'];
  body: string;
  subtasks: Subtask[];
}

export const draftOf = (record: Record | null, values: Record['values'] = {}): Draft =>
  record ? { values: { ...record.values }, body: record.body, subtasks: record.subtasks ?? [] } : { values: { ...values }, body: '', subtasks: [] };

/** Whether two drafts differ in anything that would be written. */
export function differs(a: Draft, b: Draft): boolean {
  if (a.body !== b.body) return true;
  if (JSON.stringify(a.subtasks) !== JSON.stringify(b.subtasks)) return true;
  for (const key of new Set([...Object.keys(a.values), ...Object.keys(b.values)])) {
    const [x, y] = [a.values[key], b.values[key]];
    if (isEmpty(x) && isEmpty(y)) continue;
    if (JSON.stringify(x) !== JSON.stringify(y)) return true;
  }
  return false;
}

/** The first lines of a record's body as plain words, for a timeline: no heading marks, no list marks. */
export function excerpt(body: string): string {
  return body
    .split('\n')
    .map((line) => line.replace(/^\s*(#+|[-*+]|\d+\.|>)\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

/** What a record of a collection is called, "activity" for Activities; "record" when the schema does not say. */
export const singularOf = (schema: Schema) => schema.singular ?? t('collection.recordSingular');

/**
 * The records of another collection that link to this one, under a head with how many there are
 * and a button that adds one already linked. A timeline shows each with its choice as a chip, who
 * and when, then its name and the first lines of its body, newest first; a list shows each by its
 * name with a field or two beside it. A row opens its record over this one. With none yet the head
 * stays, so that the first is added from here. A collection made on its own looks for the ones its
 * template keeps beside it; one that is not there is made from here, from the template of its name.
 */
function LinkedRecords({ block, dir, record, today, actions, drafts, hint, onOpen, onAdd, parent }: {
  block: LinkedBlock;
  /** The record's form, for a split between people: who it is for and how, as they are typed. */
  parent?: ParentForm;
  /** The collection of the record on screen. */
  dir: string;
  record: Record;
  today: string;
  actions: CollectionActions;
  /** In a form whose rules add rows as it is typed in: those rows, not written yet. */
  drafts?: LinkedDrafts;
  hint?: { title: string; text: string };
  onOpen: (source: Collection, record: Record) => void;
  /** A new linked record's window, with the values given: a group's, in a table. */
  onAdd: (source: Collection, values?: Record['values']) => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const making = useRef(false);
  const source = actions.collection(block.collection);
  const name = collectionName(block.collection);
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink };
  const head = (count: number | null) => (
    <div className="blk-h">
      <span>{block.title ?? name}</span>
      {count !== null && <small>{count}</small>}
      {source && !block.through && (
        <button type="button" className="addl" onClick={() => onAdd(source)}>
          {block.add ? t('collection.addNamed', { name: block.add }) : t('collection.addOne', { singular: singularOf(source.schema) })}
        </button>
      )}
    </div>
  );
  if (!source) {
    const makeable = templateNamed(name) !== null;
    const folder = collectionOf(block.collection);
    const make = async () => {
      if (making.current) return;
      making.current = true;
      setFailed(await actions.createLinked(dir, block.collection));
      making.current = false;
    };
    return (
      <div className="blk">
        <div className="blk-h">
          <span>{name}</span>
          {makeable && (
            <button type="button" className="addl" onClick={() => void make()}>
              {t('collection.createLinked', { name })}
            </button>
          )}
        </div>
        <p className="blk-none" role={failed ? 'alert' : undefined}>
          {failed ??
            (!makeable
              ? t('collection.noTarget', { name: block.collection })
              : folder
                ? t('collection.missing', { name, folder: collectionName(folder) })
                : t('collection.missingHere', { name }))}
        </p>
      </div>
    );
  }
  const { schema } = source;
  // A block with a look, days, a checklist or a split, is drawn as the table draws it.
  if (block.style === 'table' || block.look) return <LinkedTable block={block} source={source} dir={dir} record={record} today={today} actions={actions} drafts={drafts} hint={hint} onOpen={onOpen} onAdd={onAdd} parent={parent} />;
  // The linked records with what is worked out among their values, and their fields as those show.
  const computer = computerFor(source, actions.collections(), actions.boards(), today);
  const shownAs = computer.shown(source.dir);
  const records = blockRecords(block, source, dir, record, actions.collection(dir)?.schema)
    .map((r) => ({ ...r, values: computer.values(source.dir, r) }))
    .filter((r) => !block.where || matchesConditions(r, schema, block.where, today));
  const byKey = (key: string | undefined) => (key ? schema.fields.find((f) => f.key === key) : undefined);
  const day = byKey(block.sort)?.type === 'date' ? byKey(block.sort) : schema.fields.find((f) => f.type === 'date');
  const timeline = block.style ? block.style === 'timeline' : !!day;
  const rows = timeline
    ? sortRecords(records, schema, day ? { key: day.key, dir: 'desc' } : { key: nameField(schema)?.key ?? '', dir: 'asc' }, today)
    : sortRecords(records, schema, linkedSort(block, schema), today);
  if (rows.length === 0) {
    return (
      <div className="blk">
        {head(0)}
        <p className="blk-none">{t('collection.noLinked', { collection: name.toLowerCase() })}</p>
      </div>
    );
  }
  if (timeline) {
    const choice = schema.fields.find((f) => f.type === 'select');
    const who = schema.fields.find((f) => f.type === 'person');
    return (
      <div className="blk">
        {head(rows.length)}
        {rows.map((r) => {
          const kind = choice && r.values[choice.key];
          const when = day && r.values[day.key];
          const by = who && r.values[who.key];
          const text = excerpt(r.body);
          return (
            <button key={r.id} type="button" className="tle" onClick={() => onOpen(source, r)}>
              <span className="h">
                {typeof kind === 'string' && kind && <Chip text={kind} color={optionColor(choice, kind)} />}
                <b>{recordTitle(r)}</b>
                {typeof by === 'string' && by && <span className="by">{by}</span>}
                <span className="t">{typeof when === 'string' && when ? dueLabel(when, today) : ''}</span>
              </span>
              {text && <span className="tx">{text}</span>}
            </button>
          );
        })}
      </div>
    );
  }
  // A list row shows the fields the block names, else the first two filled in, leaving out the link back here.
  const back = new Set(linkFieldsTo(schema, dir).map((f) => f.key));
  const shown = (r: Record) =>
    (block.fields ? block.fields.map(byKey).filter((f): f is Field => !!f) : schema.fields.filter((f) => f.type !== 'name' && f.type !== 'code' && !back.has(f.key)))
      .filter((f) => !isEmpty(fieldValueOf(r, f, schema, today)))
      .slice(0, 2);
  return (
    <div className="blk">
      {head(rows.length)}
      {rows.map((r) => (
        <button key={r.id} type="button" className="lrec" onClick={() => onOpen(source, r)}>
          <span className="ln">
            {r.name && r.code && <span className="key">{r.code}</span>}
            {recordTitle(r)}
          </span>
          <span className="meta">
            {shown(r).map((f) => (
              <Cell key={f.key} field={shownAs.get(f.key) ?? f} value={fieldValueOf(r, f, schema, today)} ctx={ctx} values={r.values} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The form a block is in, as it is typed: its values and what sets one. */
interface ParentForm {
  values: Record['values'];
  set: (key: string, value: FieldValue) => void;
}

/** A head of a block as a list has it: its name, how many, + Add. */
function LookHead({ source, title, count, add, onAdd }: { source: Collection; title?: string; count: ReactNode; add?: string; onAdd?: () => void }) {
  return (
    <div className="blk-h">
      <span>{title ?? collectionName(source.dir)}</span>
      {count !== null && <small>{count}</small>}
      {onAdd && (
        <button type="button" className="addl" onClick={onAdd}>
          {add ? t('collection.addNamed', { name: add }) : t('collection.addShort')}
        </button>
      )}
    </div>
  );
}

/**
 * The rows day by day, as TripIt shows a trip (design/more-apps.md 4.5): a heading for each day,
 * then each row's time, its sign by its choice, its name and its second line; one that ends on
 * another day, a hotel, is there again on that day.
 */
function DayList({ block, source, rows, today, onOpen, onAdd }: { block: LinkedBlock; source: Collection; rows: Record[]; today: string; onOpen: (source: Collection, record: Record) => void; onAdd: () => void }) {
  const { schema } = source;
  const choice = block.icon ? schema.fields.find((f) => f.key === block.icon) : undefined;
  const at = block.time ?? block.sort;
  const entries = rows.flatMap((r) => {
    const start = at ? r.values[at] : null;
    const end = block.end ? r.values[block.end] : null;
    const kind = choice ? r.values[choice.key] : null;
    const said = (words: { [option: string]: string } | undefined) => (typeof kind === 'string' && words?.[kind]) || '';
    const first = { r, when: typeof start === 'string' ? start : '', said: said(block.startSaid) };
    // One that ends on another day, and says so then: a hotel's check out.
    const last = typeof end === 'string' && end.slice(0, 10) !== first.when.slice(0, 10) && said(block.endSaid) ? [{ r, when: end, said: said(block.endSaid) }] : [];
    return [first, ...last];
  });
  entries.sort((a, b) => (a.when || '9999').localeCompare(b.when || '9999'));
  const days = new Map<string, typeof entries>();
  for (const e of entries) days.set(e.when.slice(0, 10), [...(days.get(e.when.slice(0, 10)) ?? []), e]);
  return (
    <div className="blk look-days">
      <LookHead source={source} title={block.title} count={rows.length || null} add={block.button} onAdd={onAdd} />
      {rows.length === 0 && <p className="blk-none">{t('collection.noLinked', { collection: collectionName(source.dir).toLowerCase() })}</p>}
      {[...days].map(([day, list]) => (
        <div key={day || 'none'}>
          <div className="ld-day">{day ? new Date(`${day}T00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }) : t('collection.noDay')}</div>
          {list.map((e, i) => {
            const kind = choice ? e.r.values[choice.key] : null;
            const sign = typeof kind === 'string' ? block.icons?.[kind] : undefined;
            const sub = block.sub ? valueText(e.r.values[block.sub] ?? null) : '';
            return (
              <button key={`${e.r.id}-${i}`} type="button" className="ld-row" onClick={() => onOpen(source, e.r)} style={typeof kind === 'string' && kind ? hueStyle(choice ? optionColor(choice, kind) : undefined, kind) : undefined}>
                <span className="tm">{e.when.length > 10 ? e.when.slice(11, 16) : ''}</span>
                <span className="ic">{sign ?? ''}</span>
                <span className="tx">
                  <b>
                    {recordTitle(e.r)}
                    {e.said && <span className="said"> · {e.said}</span>}
                  </b>
                  {sub && <small>{sub}</small>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The width and height a signature is drawn in: its path is in these units. */
export const SIGN_BOX = { w: 300, h: 80 };

/** A signature drawn with a finger, as its path (Field.signature). */
export function Signature({ path, small }: { path: string; small?: boolean }) {
  return (
    <svg className={small ? 'sign small' : 'sign'} viewBox={`0 0 ${SIGN_BOX.w} ${SIGN_BOX.h}`} role="img" aria-label={t('collection.signature')}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A request's conversation, as Help Scout shows it (design/scrawl-apps.md 3.3): day by day, each
 * message in the color of its kind, who wrote it and when over what it says.
 */
function ThreadList({ block, source, rows, onOpen }: { block: LinkedBlock; source: Collection; rows: Record[]; onOpen: (source: Collection, record: Record) => void }) {
  const { schema } = source;
  const choice = block.icon ? schema.fields.find((f) => f.key === block.icon) : undefined;
  const at = block.time ?? block.sort;
  const when = (r: Record) => (at && typeof r.values[at] === 'string' ? (r.values[at] as string) : '');
  const sorted = [...rows].sort((a, b) => when(a).localeCompare(when(b)));
  const days = new Map<string, Record[]>();
  for (const r of sorted) days.set(when(r).slice(0, 10), [...(days.get(when(r).slice(0, 10)) ?? []), r]);
  return (
    <div className="blk look-thread">
      <div className="blk-h">
        <span>{block.title ?? collectionName(source.dir)}</span>
        {rows.length > 0 && <small>{rows.length}</small>}
      </div>
      {rows.length === 0 && <p className="blk-none">{t('collection.noLinked', { collection: collectionName(source.dir).toLowerCase() })}</p>}
      {[...days].map(([day, list]) => (
        <div key={day || 'none'}>
          <div className="ld-day">{day ? new Date(`${day}T00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }) : t('collection.noDay')}</div>
          {list.map((r) => {
            const kind = choice ? r.values[choice.key] : null;
            const by = block.person ? valueText(r.values[block.person] ?? null) : '';
            const text = block.sub ? valueText(r.values[block.sub] ?? null) : recordTitle(r);
            const time = when(r).length > 10 ? when(r).slice(11, 16) : '';
            return (
              <button key={r.id} type="button" className="lt-msg" onClick={() => onOpen(source, r)} style={typeof kind === 'string' && kind ? hueStyle(choice ? optionColor(choice, kind) : undefined, kind) : undefined}>
                <span className="h">
                  <b>{by || (typeof kind === 'string' ? kind : '')}</b>
                  <small>{[time, typeof kind === 'string' && by ? kind.toLowerCase() : ''].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="t">{text}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The rows as a checklist, as PackPoint has a packing list: in their groups, a round tick each and
 * its name, a ticked one done; what else the block names after it, faint.
 */
function CheckList({ block, source, groups, rows, ctx, today, tick, onTick, onOpen, onAdd }: {
  block: LinkedBlock;
  source: Collection;
  groups: ReturnType<typeof groupLinked>;
  rows: Record[];
  ctx: ValueContext;
  today: string;
  tick: Field | undefined;
  onTick: (record: Record, on: boolean) => void;
  onOpen: (source: Collection, record: Record) => void;
  onAdd: () => void;
}) {
  const { schema } = source;
  const ticked = (r: Record) => !!tick && r.values[tick.key] === true;
  const others = (block.fields ?? []).map((k) => schema.fields.find((f) => f.key === k)).filter((f): f is Field => !!f && f.type !== 'checkbox' && f.type !== 'name' && !(block.group ?? []).includes(f.key));
  const row = (r: Record, n: number) => (
    <div key={r.id} className={ticked(r) && block.done ? 'lc-row done' : 'lc-row'}>
      {tick ? (
        <button type="button" className={ticked(r) ? 'lc-tick on' : 'lc-tick'} role="checkbox" aria-checked={ticked(r)} aria-label={recordTitle(r)} onClick={() => onTick(r, !ticked(r))}>
          {ticked(r) && <Icon name="check" />}
        </button>
      ) : (
        block.numbered && <span className="lc-num">{n}</span>
      )}
      {block.time ? (
        stepLines(r)
      ) : (
        <>
          <button type="button" className="lc-name" onClick={() => onOpen(source, r)}>
            {recordTitle(r)}
          </button>
          {others.map((f) => {
            const value = fieldValueOf(r, f, schema, today);
            return isEmpty(value) ? null : (
              <span key={f.key} className="lc-meta">
                <Cell field={f} value={value} ctx={ctx} values={r.values} />
              </span>
            );
          })}
        </>
      )}
    </div>
  );
  // A planned step in two lines, as the CRM mockup has them: its name and what it is of ("· New
  // tower"), under it its day, "Fri, 30 Oct · 10:00", red when late, and the other fields.
  const stepLines = (r: Record) => {
    const at = r.values[block.time!];
    const when = typeof at === 'string' && at ? `${new Date(`${at.slice(0, 10)}T00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}${timeOf(at) ? ` · ${timeOf(at)}` : ''}` : '';
    const subField = schema.fields.find((f) => f.key === block.sub);
    const held = subField ? fieldValueOf(r, subField, schema, today) : null;
    const of = isLink(held) ? held.name : valueText(held);
    const rest = others.filter((f) => f.key !== block.time && f.key !== block.sub).map((f) => valueText(fieldValueOf(r, f, schema, today))).filter(Boolean);
    return (
      <button type="button" className="lc-name lc-step" onClick={() => onOpen(source, r)}>
        <span>
          {recordTitle(r)}
          {of && <span className="of"> · {of}</span>}
        </span>
        <small className={typeof at === 'string' && !ticked(r) && at.slice(0, 10) < today ? 'late' : undefined}>{[when, ...rest].filter(Boolean).join(' · ')}</small>
      </button>
    );
  };
  let n = 0;
  return (
    <div className="blk look-check">
      {/* Rows kept to those not ticked, a company's planned activities, are counted, not said how many are done. */}
      <LookHead source={source} title={block.title} count={tick && rows.length > 0 && !block.where?.some((c) => c.field === tick.key) ? t('collection.tickedOf', { ticked: rows.filter(ticked).length, count: rows.length }) : rows.length || null} add={block.button} onAdd={onAdd} />
      {groups.map((g) => (
        <div key={g.key}>
          {(block.group ?? []).length > 0 && <div className="lc-group">{g.label || t('collection.none')}</div>}
          {g.records.map((r) => row(r, ++n))}
        </div>
      ))}
    </div>
  );
}

/**
 * Who a record is for, as Tricount adds an expense (design/more-apps.md 4.11): each of its group
 * with a round tick and their share; by amounts the share is typed beside them, by parts their
 * parts are counted up and down; under them what is missing.
 */
function SplitList({ block, source, dir, rows, actions, parent, onWrite }: { block: LinkedBlock; source: Collection; dir: string; rows: Record[]; actions: CollectionActions; parent: ParentForm; onWrite: (record: Record, field: Field, value: FieldValue) => void }) {
  const { schema } = source;
  const pickField = block.pick ? actions.collection(dir)?.schema.fields.find((f) => f.key === block.pick) : undefined;
  const amount = block.amount ? schema.fields.find((f) => f.key === block.amount) : undefined;
  const parts = block.parts ? schema.fields.find((f) => f.key === block.parts) : undefined;
  const shown = block.fields?.[0] ? schema.fields.find((f) => f.key === block.fields![0]) : amount;
  const mode = block.mode ? parent.values[block.mode] : null;
  const byAmounts = typeof mode === 'string' && /amount/i.test(mode);
  const byParts = typeof mode === 'string' && /part|share/i.test(mode);
  const people = pickField?.collection ? choicesOf(pickField, actions.records(pickField.collection) ?? [], parent.values) : [];
  const picked = Array.isArray(parent.values[block.pick ?? '']) ? (parent.values[block.pick!] as Link[]) : [];
  const isPicked = (id: string) => picked.some((l) => l.id === id);
  const shareOf = (id: string) => rows.find((r) => [r.values[block.person ?? '']].flat().some((l) => isLink(l) && l.id === id));
  const toggle = (person: Record) => parent.set(block.pick!, isPicked(person.id) ? picked.filter((l) => l.id !== person.id) : [...picked, { id: person.id, name: person.name }]);
  const money = (n: number) => (shown?.format ? formatNumber(n, shown.format, currencyOf(shown.format)) : String(n));
  const total = block.total ? Number(parent.values[block.total] ?? 0) : 0;
  const given = rows.reduce((s, r) => s + (Number(r.values[amount?.key ?? ''] ?? 0) || 0), 0);
  const partsAll = rows.reduce((s, r) => s + (Number(r.values[parts?.key ?? ''] ?? 1) || 0), 0);
  return (
    <div className="blk look-split">
      <div className="ls-people">
        {people.map((p) => {
          const share = shareOf(p.id);
          const on = isPicked(p.id);
          // By parts, its share of the total as the parts are now: the record it is of may not be written yet.
          const value = share && byParts && parts && partsAll > 0 ? Math.round((total * Number(share.values[parts.key] ?? 1) * 100) / partsAll) / 100 : share && shown ? Number(share.values[shown.key] ?? 0) : 0;
          return (
            <div key={p.id} className={on ? 'ls-p' : 'ls-p off'}>
              <button type="button" className={on ? 'lc-tick on' : 'lc-tick'} role="checkbox" aria-checked={on} aria-label={p.name} onClick={() => toggle(p)}>
                {on && <Icon name="check" />}
              </button>
              <span className="nm">
                {p.name}
                {/* The one who paid it, said beside their name. */}
                {share && Number(share.values.paid ?? 0) > 0 && <small>{t('collection.paidIt')}</small>}
              </span>
              {on && share && byAmounts && amount ? (
                <input className="ls-in" type="number" inputMode="decimal" aria-label={p.name} value={String(share.values[amount.key] ?? '')} onChange={(event) => onWrite(share, amount, event.target.value === '' ? null : Number(event.target.value))} />
              ) : on && share && byParts && parts ? (
                <>
                  <span className="ls-parts">
                    <b>{Number(share.values[parts.key] ?? 1)}x</b>
                    <small>{money(value)}</small>
                  </span>
                  <span className="ls-step">
                    <button type="button" aria-label="−" onClick={() => onWrite(share, parts, Math.max(0, Number(share.values[parts.key] ?? 1) - 1))}>
                      −
                    </button>
                    <button type="button" aria-label="+" onClick={() => onWrite(share, parts, Number(share.values[parts.key] ?? 1) + 1)}>
                      +
                    </button>
                  </span>
                </>
              ) : (
                <span className="n">{on && share ? money(value) : ''}</span>
              )}
            </div>
          );
        })}
        {byAmounts && rows.length > 0 && Math.abs(given - total) >= 0.01 && (
          <div className="ls-tot bad">
            <span>{t('collection.splitOf', { given: money(given), total: money(total) })}</span>
            <b>{t('collection.splitMissing', { missing: money(Math.abs(total - given)) })}</b>
          </div>
        )}
        {byParts && rows.length > 0 && (
          <div className="ls-tot">
            <span>{t('collection.splitParts', { count: partsAll })}</span>
            <b>{money(total)}</b>
          </div>
        )}
      </div>
    </div>
  );
}

/** The fields a linked table shows when its block names none: the collection's, but the link back here, six at most. */
function linkedColumns(block: LinkedBlock, schema: Schema, dir: string, lines = false): Field[] {
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));
  const named = nameField(schema);
  // A record's lines show what their block says, no name before it: the product or the move is what a line is (design/app-home.md 4.2).
  if (lines && block.fields?.length) return block.fields.map((k) => byKey.get(k)).filter((f): f is Field => !!f);
  const back = new Set(linkFieldsTo(schema, dir).map((f) => f.key));
  const chosen = block.fields ? block.fields.map((k) => byKey.get(k)).filter((f): f is Field => !!f && f.type !== 'name') : schema.fields.filter((f) => f.type !== 'name' && !back.has(f.key)).slice(0, 5);
  return [...(named ? [named] : schema.fields.length > 0 ? [] : [TITLE]), ...chosen];
}

/** The collections with the rows a form added and has not written yet among their records, for its rollups: a new order's total its new lines'. */
export function withDrafts(all: Collection[], drafted: readonly Change[]): Collection[] {
  if (drafted.length === 0) return all;
  return all.map((c) => {
    const added = drafted.flatMap((d) => (d.kind === 'add' && d.dir === localPath(c.dir) && !c.records.some((r) => r.id === d.id) ? [recordWith(c, d.id, d.values)] : []));
    return added.length > 0 ? { ...c, records: [...c.records, ...added] } : c;
  });
}

/** The rows a form adds to a linked table as it is typed in (design/gym.md 4.1), not written until Save. */
export interface LinkedDrafts {
  /** The rows added to a collection, as records not written yet. */
  rows: (source: Collection) => Record[];
  /** A row changed: in its window, or a tick in the table. */
  write: (source: Collection, id: string, values: Record['values']) => void;
  /** A row added with + Add row. */
  add: (source: Collection, values: Record['values']) => void;
  /** A row taken out with Delete. */
  remove: (source: Collection, id: string) => void;
  /** The written rows the form's onChanges take out at Save: an expense's shares worked out again. */
  gone?: (source: Collection) => ReadonlySet<string>;
}

/**
 * Linked records as a table: a column for each field the block shows, the sums of its numbers
 * under it when the block says so, and + Add row, which opens a new one linked to the record. A
 * row opens its record over this one; its ··· and the right click, Open, its buttons, Delete. The
 * fields the block's `edit` names change where they are: a workout's moves ticked off. In groups
 * by one field or two when the block says so (design/gym.md 4.2): each group's heading says what
 * it is and how many, with Untick all where the table ticks, and + Add to it; a second level's
 * heading ticks its rows or unticks them. In a form whose rules add rows as it is typed in, those
 * rows are among the others, changed and opened as they are, written on Save.
 */
export function LinkedTable({ block, source, dir, record, today, actions, drafts, hint, onOpen, onAdd, parent }: {
  block: LinkedBlock;
  parent?: ParentForm;
  source: Collection;
  dir: string;
  record: Record;
  today: string;
  actions: CollectionActions;
  drafts?: LinkedDrafts;
  /** What an empty table says instead of that it is empty: a new workout's "Pick a program". */
  hint?: { title: string; text: string };
  /** A row not written yet opens in the window it was added in. */
  onOpen: (source: Collection, record: Record) => void;
  /** + Add opens the new row's window, the values given in it: the link back, a group's value. */
  onAdd: (source: Collection, values: Record['values']) => void;
}) {
  const { schema } = source;
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink };
  const computer = useMemo(() => computerFor(source, actions.collections(), actions.boards(), today), [source, actions, today]);
  const shownAs = computer.shown(source.dir);
  const asShown = (field: Field) => shownAs.get(field.key) ?? field;
  const recordSchema = actions.collection(dir)?.schema;
  const lines = showsLines(block, recordSchema?.role, schema.role);
  const columns = linkedColumns(block, schema, dir, lines);
  const changes = new Set(columns.filter((f) => changesInTable(f) && block.edit?.includes(f.key)).map((f) => f.key));
  // A row not written yet gives way to its record once it is: as the form is saved.
  const out = drafts?.gone?.(source);
  const written = blockRecords(block, source, dir, record, recordSchema).filter((r) => !out?.has(r.id));
  const unsaved = (drafts?.rows(source) ?? []).filter((r) => !written.some((w) => w.id === r.id));
  const isDraft = new Set(unsaved.map((r) => r.id));
  // Only the rows the block asks for: a company's planned activities apart from those done.
  const linked = [...written.map((r) => ({ ...r, values: computer.values(source.dir, r) })), ...unsaved.map((r) => ({ ...r, values: computer.draft(source.dir, null, r.values) }))].filter(
    (r) => !block.where || matchesConditions(r, schema, block.where, today),
  );
  const sorted = sortRecords(linked, schema, linkedSort(block, schema), today);
  const groups = groupLinked(sorted, schema, block.group ?? [], today);
  const rows = groups.flatMap((g) => (g.groups ? g.groups.flatMap((s) => s.records) : g.records));
  const lit = useLit(source);
  /** A cell changed: a row not written yet in the form, one written at once. */
  const write = (r: Record, field: Field, value: FieldValue) => {
    if (isDraft.has(r.id)) return drafts!.write(source, r.id, { [field.key]: value });
    lit.wrote(r.id, field.key, value);
    void actions.updateRecord(source.dir, r.id, { values: { [field.key]: value } }).then((failed) => failed && actions.say?.(failed));
  };
  const numeric = (field: Field) => asShown(field).type === 'number';
  // A tick the table changes, at the start of a row, is a narrow column with no heading: the block's says how many are done (the Gym mockup).
  const tickAt = (field: Field, i: number) => i === 0 && field.type === 'checkbox' && changes.has(field.key);
  const cellClass = (field: Field, i: number) => [i === 0 && 'c0', numeric(field) && 'r', tickAt(field, i) && 'tk'].filter(Boolean).join(' ') || undefined;
  const sums = block.sums ? columns.map((f) => (numeric(f) ? columnSums(rows, schema, f.key, today) : null)) : [];
  // The column that ticks a row off: how many are ticked, a row not ticked faint; where the table
  // changes it, a group's Untick all and a second level's tick.
  const tickColumn = columns.find((f) => f.type === 'checkbox');
  const tick = tickColumn && changes.has(tickColumn.key) ? tickColumn : undefined;
  const ticked = (r: Record) => r.values[tickColumn!.key] === true;
  const tickAll = (records: Record[], on: boolean) => records.filter((r) => ticked(r) !== on).forEach((r) => write(r, tick!, on));
  // A group's rows alternatives (design/meal-plans.md): one ticked picks the group; a row set apart, eaten off the plan, is not one of them.
  const apartField = block.choose && block.apart ? schema.fields.find((f) => f.key === block.apart && f.type === 'checkbox') : undefined;
  const isApart = (r: Record) => !!apartField && r.values[apartField.key] === true;
  const own = (of: Record[]) => of.filter((r) => !isApart(r));
  const alternative = (r: Record, of: Record[]) => !!block.choose && !isApart(r) && own(of).indexOf(r) > 0;
  // What was had in a row's place: its group picked too, and changed.
  const insteadField = block.choose && block.instead ? schema.fields.find((f) => f.key === block.instead) : undefined;
  const changed = (r: Record) => !!insteadField && !isEmpty(r.values[insteadField.key] ?? null);
  const picked = (r: Record) => ticked(r) || changed(r);
  const groupField = block.group?.[0] ? schema.fields.find((f) => f.key === block.group![0]) : undefined;
  const countOf = (of: Record[]) => {
    if (block.choose && tickColumn && of.length > 0) {
      const mine = own(of);
      return mine.some(changed) ? t('collection.changed') : mine.some(ticked) ? tickColumn.label.toLowerCase() : t('collection.toChoose', { count: mine.length });
    }
    return tickColumn && of.length > 0 ? t('collection.tickedOf', { ticked: of.filter(ticked).length, count: of.length }) : of.length;
  };
  // The block's: how many of its groups are picked, and how many rows stand apart.
  const blockCount = () => {
    if (!(block.choose && tickColumn && groupField && rows.length > 0)) return countOf(rows);
    const picking = groups.filter((g) => own(g.records).length > 0);
    const said = t('collection.ofGroups', { ticked: picking.filter((g) => own(g.records).some(picked)).length, count: picking.length, group: groupField.label.toLowerCase() });
    const apart = rows.filter(isApart).length;
    const swapped = rows.filter(changed).length;
    return [said, ...(apart > 0 && apartField ? [`${apart} ${apartField.label.toLowerCase()}`] : []), ...(swapped > 0 ? [t('collection.changedCount', { count: swapped })] : [])].join(' · ');
  };
  // + Add opens the row's window; + Add to a group starts it with the group's value.
  const startAdding = (group: { key: string; records: Record[] } | null) => {
    const first = block.group?.[0];
    onAdd(source, { ...(recordSchema ? linkedValues(schema, dir, record, recordSchema) : {}), ...(group && first ? { [first]: group.records[0]?.values[first] ?? null } : {}) });
  };
  const buttons = useMemo(() => actionsOf(source.rules), [source.rules]);
  // A row's menu: Open, its buttons once it is written, Delete; a row not written yet leaves the form.
  const rowMenu = (event: MouseEvent, r: Record) =>
    actions.menu(
      event,
      [
        { label: t('collection.open'), run: () => onOpen(source, r) },
        ...(isDraft.has(r.id)
          ? []
          : buttons.map((button, i) => {
              const state = actionState(source.rules ?? '', button, computer, source.dir, r);
              return { label: button.name, icon: 'play' as const, run: () => actions.pressButton(source.dir, r.id, button.name), ...(!state.on && { disabled: state.hint ?? '' }), ...(i === 0 && { apart: true }) };
            })),
        { label: t('menu.delete'), run: () => (isDraft.has(r.id) ? drafts!.remove(source, r.id) : actions.removeRecord(source.dir, r)), apart: true, danger: true },
      ],
      { icon: 'collection', title: recordTitle(r), sub: collectionName(source.dir) },
    );
  if (block.look === 'thread') return <ThreadList block={block} source={source} rows={rows} onOpen={onOpen} />;
  if (block.look === 'days') return <DayList block={block} source={source} rows={rows} today={today} onOpen={onOpen} onAdd={() => startAdding(null)} />;
  if (block.look === 'checklist') return <CheckList block={block} source={source} groups={groups} rows={rows} ctx={ctx} today={today} tick={tickColumn} onTick={(r, on) => tickColumn && write(r, tickColumn, on)} onOpen={onOpen} onAdd={() => startAdding(null)} />;
  if (block.look === 'split' && parent) return <SplitList block={block} source={source} dir={dir} rows={rows} actions={actions} parent={parent} onWrite={write} />;
  const span = columns.length + 1;
  const row = (r: Record, of: Record[] = rows) => (
    <tr
      key={r.id}
      className={['rec', isDraft.has(r.id) && 'draft', tickColumn && (block.done ? ticked(r) : !ticked(r)) && !block.choose && 'off'].filter(Boolean).join(' ')}
      tabIndex={0}
      onClick={() => onOpen(source, r)}
      onContextMenu={(event) => rowMenu(event, r)}
      onKeyDown={(event) => rowKeys(event, () => onOpen(source, r))}
    >
      {columns.map((field, i) => {
        const value = fieldValueOf(r, field, schema, today);
        return (
          <td key={field.key} className={[cellClass(field, i), lit.on(r.id, field.key) && 'lit'].filter(Boolean).join(' ') || undefined}>
            <div className="tc" style={cellBox(asShown(field))} title={cutText(asShown(field), value)}>
              {changes.has(field.key) ? (
                <ChangeCell field={field} value={r.values[field.key]} onChange={(next) => write(r, field, next)} />
              ) : field.key === TITLE.key || (lines && isLink(value)) ? (
                // A line's move or product is what the line is: its name, as the record's own.
                <span className="ct name">{field.key === TITLE.key ? recordTitle(r) : recordLabel(value as Link)}</span>
              ) : field.type === 'name' && block.choose ? (
                // An alternative says so before it; a row apart says what sets it apart after it.
                <span className="ct">
                  {alternative(r, of) && <span className="lor">{t('collection.or')}</span>}
                  <Cell field={asShown(field)} value={value} ctx={ctx} values={r.values} />
                  {isApart(r) && <span className="lapart">{apartField!.label}</span>}
                </span>
              ) : (
                <Cell field={asShown(field)} value={value} ctx={ctx} values={r.values} />
              )}
            </div>
          </td>
        );
      })}
      <td className="tend">
        <button type="button" className="rmore" title={t('collection.menu')} aria-label={t('collection.menu')} onClick={(event) => (event.stopPropagation(), rowMenu(event, r))}>
          ···
        </button>
      </td>
    </tr>
  );
  return (
    <div className="blk ltable">
      <div className="blk-h">
        <span>{block.title ?? collectionName(block.collection)}</span>
        <small>{blockCount()}</small>
      </div>
      <div className="ltable-scroll" hidden={rows.length === 0}>
        <table className="rtable" aria-label={collectionName(block.collection)}>
          <thead>
            <tr>
              {columns.map((field, i) => (
                <th key={field.key} className={cellClass(field, i)} aria-label={field.label}>
                  <div className="tc" style={cellBox(asShown(field))}>
                    {!tickAt(field, i) && field.label}
                  </div>
                </th>
              ))}
              <th className="tend" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              !block.group?.length ? (
                <Fragment key="all">{g.records.map((r) => row(r, g.records))}</Fragment>
              ) : (
                <Fragment key={g.key || '-'}>
                  <tr className="tgrp">
                    <td colSpan={span}>
                      <div className="gh">
                        <b>{g.label || t('collection.none')}</b>
                        <small>{countOf(g.records)}</small>
                        {tick && g.records.some(ticked) && (
                          <button type="button" className="gall" onClick={() => tickAll(g.records, false)}>
                            {t('collection.untickAll')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {g.groups
                    ? g.groups.map((s) => (
                        <Fragment key={s.key || '-'}>
                          <tr className="tgrp2">
                            <td colSpan={span}>
                              <div className="gh">
                                {tick && (
                                  <button type="button" role="checkbox" aria-checked={s.records.every(ticked)} className={s.records.every(ticked) ? 'tick cbx on' : 'tick cbx'} aria-label={s.label} onClick={() => tickAll(s.records, !s.records.every(ticked))}>
                                    {s.records.every(ticked) && <Icon name="check" />}
                                  </button>
                                )}
                                <b>{s.label || t('collection.none')}</b>
                              </div>
                            </td>
                          </tr>
                          {s.records.map((r) => row(r, s.records))}
                        </Fragment>
                      ))
                    : g.records.map((r) => row(r, g.records))}
                  <tr className="gadd">
                    <td colSpan={span}>
                      <button type="button" className="cadd" onClick={() => startAdding(g)}>
                        {t('collection.addTo', { group: g.label || t('collection.none') })}
                      </button>
                    </td>
                  </tr>
                </Fragment>
              ),
            )}
          </tbody>
          {block.sums && rows.length > 0 && (
            <tfoot>
              <tr className="sum">
                {columns.map((field, i) => (
                  <td key={field.key} className={cellClass(field, i)}>
                    {i === 0 ? (
                      <span className="ct">{t('collection.sum')}</span>
                    ) : sums[i] ? (
                      <span className={sums[i]!.length > 1 ? 'num split' : 'num'}>
                        {sums[i]!.map((s, j) => (
                          <span key={s.currency ?? j}>{formatNumber(s.value, field.format, s.currency)}</span>
                        ))}
                      </span>
                    ) : null}
                  </td>
                ))}
                <td className="tend" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length === 0 &&
        (hint ? (
          <div className="blk-hint">
            <b>{hint.title}</b>
            <span>{hint.text}</span>
          </div>
        ) : (
          <p className="blk-none">{t('collection.noLinked', { collection: collectionName(block.collection).toLowerCase() })}</p>
        ))}
      {/* In groups each group has its own + Add; with none yet, the table has it. */}
      {(!block.group?.length || rows.length === 0) && (
        <button type="button" className="cadd" onClick={() => startAdding(null)}>
          {block.add ? t('collection.addNamed', { name: block.add }) : t(lines ? 'collection.addLine' : 'collection.addRow')}
        </button>
      )}
    </div>
  );
}

/** How many finished tasks the block shows, after the open ones. */
const DONE_SHOWN = 5;

/**
 * The cards of every board whose links point at the record, and the tasks about it, after the
 * Record tasks view of design/mockups.html. A card shows its key and title, with its column (and
 * its board when more than one board links here) and its value, and opens over the record. A task
 * shows its title and when it is due, and is ticked off here. The finished ones come after the
 * open ones. + Add task makes a task about the record in Inbox.
 *
 * With `only`, a board's path, it is that board's cards under its name, each with its column and
 * the day it closes by, and + Add makes a card there linked to the record and opens it: a
 * company's Deals (design/scrawl-apps.md 3.1).
 */
function CardsBlock({ dir, record, only, today, actions, onOpen }: { dir: string; record: Record; only?: string; today: string; actions: CollectionActions; onOpen: (board: string, id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const boards = actions.boards();
  const found = linkedCards(boards, dir, record).filter((d) => !only || d.board === only);
  const several = !only && boardsLinkingTo(boards, dir).length > 1;
  const about = only ? [] : recordTasks(actions.tasks(), dir, record.id);
  const open = about.filter(({ task }) => !task.done);
  const done = about.filter(({ task }) => task.done).slice(0, DONE_SHOWN);
  const own = only ? boards[only] : undefined;
  const add = () => {
    if (!typed.trim()) return;
    if (own && only) {
      const back = (own.fields ?? []).find((f) => f.type === 'link' && f.collection === dir);
      const id = actions.cardActions.addCard(only, { title: typed.trim(), ...(back && { values: { [back.key]: back.many ? [linkTo(record)] : linkTo(record) } }) });
      setTyped('');
      setAdding(false);
      if (id) onOpen(only, id);
      return;
    }
    actions.addTask(INBOX_TASKS, { title: typed.trim(), record: { collection: dir, id: record.id, name: record.name, ...(record.code && { code: record.code }) } });
    setTyped('');
  };
  const taskRow = ({ list, task }: { list: string; task: Task }) => (
    <div key={`${list}#${task.id}`} className={task.done ? 'rtask done' : 'rtask'}>
      <button
        type="button"
        className={`cb p${task.priority}`}
        role="checkbox"
        aria-checked={task.done}
        aria-label={t(task.done ? 'tasks.reopen' : 'tasks.complete', { name: task.title })}
        onClick={() => actions.setTaskDone(list, task.id, !task.done)}
      />
      <span className="tt">{task.title}</span>
      {task.due && <small className={dueClass(task.due, today)}>{dueLabel(task.due, today)}</small>}
    </div>
  );
  return (
    <div className="blk">
      <div className="blk-h">
        <span>{only ? boardName(only) : t('collection.cards')}</span>
        <small>{found.length + about.length}</small>
        <button type="button" className="addl" onClick={() => setAdding(true)}>
          {only ? t('collection.addShort') : t('collection.addTask')}
        </button>
      </div>
      {found.length === 0 && about.length === 0 && !adding && <p className="blk-none">{only ? t('collection.noLinked', { collection: boardName(only).toLowerCase() }) : t('collection.noCards')}</p>}
      {found.map(({ board: path, card }) => {
        const board = boards[path]!;
        const column = board.columns.find((c) => c.id === card.column);
        const value = faceFields(board).find((f) => f.type === 'number');
        const amount = value ? cardValue(board, card, value) : null;
        return (
          <button key={`${path}#${card.id}`} type="button" className={isFinished(board, card) ? 'lrec done' : 'lrec'} onClick={() => onOpen(path, card.id)}>
            <span className="ln">
              {!only && <span className="key">{keyOf(board, card)}</span>}
              {card.title}
            </span>
            <span className="meta">
              <span>{several && column ? `${column.name} · ${boardName(path)}` : only && card.due && !isFinished(board, card) ? t('collection.closesBy', { column: column?.name ?? '', day: dueLabel(card.due, today) }) : column?.name}</span>
              {typeof amount === 'number' && <span className="num">{formatNumber(amount, value?.format, currencyOf(value?.format, card.values))}</span>}
            </span>
          </button>
        );
      })}
      {open.map(taskRow)}
      {adding && (
        <div className="rtask new">
          <span className="cb p4" aria-hidden="true" />
          <input
            autoFocus
            aria-label={only ? t('collection.cardName', { board: boardName(only) }) : t('collection.taskName')}
            placeholder={only ? t('collection.cardName', { board: boardName(only) }) : t('collection.taskName')}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              } else if (event.key === 'Escape') {
                // The line closes; the record stays.
                event.preventDefault();
                event.stopPropagation();
                setAdding(false);
                setTyped('');
              }
            }}
          />
          <button type="button" className="go" disabled={!typed.trim()} onClick={add}>
            {t('collection.add')}
          </button>
        </div>
      )}
      {done.map(taskRow)}
    </div>
  );
}

/**
 * The layout of a record's screen. A new record is one column of its fields and body. A record
 * with no layout of its own has, under its body, the records of every collection that links to its
 * collection, and the cards of every board that does. The buttons of its rules are where the
 * layout puts them, or at the top when it puts them nowhere.
 */
export function recordLayout(schema: Schema, dir: string, isNew: boolean, actions: Pick<CollectionActions, 'collections' | 'boards'>, buttons = false, drafts = false, lines: readonly LinkedBlock[] = []): Layout {
  const own = layoutOf(schema);
  if (isNew && own.new) {
    const asked = new Set(own.new);
    const items = own.columns.flatMap((c) => c.sections.flatMap((s) => s.items)).filter((item) => ('field' in item ? asked.has(item.field) : item.block === 'body'));
    return { columns: [{ sections: [{ items }] }] };
  }
  // A new record whose rules add rows as it is typed in (onChange) keeps its tables, to show them
  // before Create; one with lines keeps their blocks, its lines typed in before Create (design/app-home.md 4.2).
  if (isNew && (drafts || lines.length > 0)) {
    const kept = (item: LayoutItem) =>
      'field' in item || item.block === 'body' || item.block === 'subtasks' || (item.block === 'linked' && ((drafts && item.style === 'table') || lines.some((l) => l.collection === item.collection)));
    const columns = own.columns.map((column) => ({ ...column, sections: column.sections.map((section) => ({ ...section, items: section.items.filter(kept) })).filter((section) => section.items.length > 0) }));
    return { columns: columns.filter((column) => column.sections.length > 0) };
  }
  if (isNew) {
    const sections = own.columns.flatMap((column) =>
      column.sections.map((section) => ({ ...section, items: section.items.filter((item) => 'field' in item || item.block === 'body' || item.block === 'subtasks') })),
    );
    return { columns: [{ sections: sections.filter((section) => section.items.length > 0) }] };
  }
  const linked: LayoutBlock[] = schema.layout
    ? []
    : [
        ...linkingCollections(actions.collections(), dir).map((c): LinkedBlock => ({ block: 'linked', collection: c.dir })),
        ...(boardsLinkingTo(actions.boards(), dir).length > 0 ? [{ block: 'cards' } as const] : []),
      ];
  const layout = linked.length > 0 ? { columns: [{ sections: [...own.columns[0]!.sections, { items: linked }] }] } : own;
  const placed = layout.columns.some((c) => c.sections.some((s) => s.items.some((i) => 'block' in i && i.block === 'actions')));
  if (!buttons || placed) return layout;
  const [first, ...rest] = layout.columns;
  if (!first) return layout;
  const [section, ...others] = first.sections;
  return { columns: [{ ...first, sections: [{ ...section, items: [{ block: 'actions' }, ...(section?.items ?? [])] }, ...others] }, ...rest] };
}

/**
 * The cells of a collection's table its rules wrote as a cell's record was saved, lit for a
 * moment: `wrote` is told of each cell typed in, and the record is looked at as it comes back.
 */
function useLit(collection: Collection) {
  const wrote = useRef<{ id: string; key: string; value: FieldValue; values: Record['values'] } | null>(null);
  const [lit, setLit] = useState<{ id: string; keys: string[] } | null>(null);
  useEffect(() => {
    const was = wrote.current;
    const now = was && collection.records.find((r) => r.id === was.id);
    // Not back yet while the cell does not hold what was typed in it.
    if (!was || !now || valueText(now.values[was.key] ?? null) !== valueText(was.value)) return;
    wrote.current = null;
    const keys = collection.schema.fields.filter((f) => f.key !== was.key && !isComputed(f.type) && valueText(now.values[f.key] ?? null) !== valueText(was.values[f.key] ?? null)).map((f) => f.key);
    if (keys.length === 0) return;
    setLit({ id: now.id, keys });
    const timer = window.setTimeout(() => setLit(null), 1600);
    return () => window.clearTimeout(timer);
  }, [collection]);
  return {
    wrote: (id: string, key: string, value: FieldValue) => {
      const record = collection.records.find((r) => r.id === id);
      if (record && savesOf(collection.rules).length > 0) wrote.current = { id, key, value, values: record.values };
    },
    on: (id: string, key: string) => lit?.id === id && lit.keys.includes(key),
  };
}

/**
 * What a record's collection runs as it is saved, worked out on what the form holds, writing
 * nothing: the fields it would set to something else, each with the onSave that would. Empty
 * when it runs nothing on save.
 */
export function savePreview(
  collection: Collection,
  record: Record | null,
  values: Record['values'],
  actions: Pick<CollectionActions, 'collections' | 'boards' | 'tasks' | 'me'>,
  today: string,
): { key: string; by: string; value: FieldValue }[] {
  if (savesOf(collection.rules).length === 0) return [];
  const space = spaceOf(collection.dir);
  const here = (path: string) => spaceOf(path) === space;
  const me = actions.me?.();
  const world: RuleSpaceNow = {
    collections: actions.collections().filter((c) => here(c.dir)),
    boards: Object.fromEntries(Object.entries(actions.boards()).filter(([path]) => here(path))),
    lists: Object.fromEntries(Object.entries(actions.tasks()).filter(([path]) => here(path))),
    today,
    ...(me && { me }),
  };
  try {
    const run = planSave(collection.dir, record ? { ...record, values } : recordWith(collection, '', values), record, world);
    return Object.entries(run.set).flatMap(([key, by]) => {
      const value = run.values[key] ?? null;
      return valueText(value) === valueText(values[key] ?? null) ? [] : [{ key, by, value }];
    });
  } catch {
    return [];
  }
}

/** A record opened over another: one of a collection that links to it, or a new one already linked; or a card that links to it. */
/** What opens over a record's window: a linked record, a new one, a line not written yet (`draft`, its id when it is there), a card. */
type Over = { dir: string; id: string } | { dir: string; values: Record['values']; draft?: string | null } | { board: string; card: string };

/**
 * The screen of one record, or of a new one: one form, saved as a whole. A record is drawn from
 * the schema's layout, with the records that link to it where the layout puts them, or under
 * its body when the schema has none. A new one is a narrow form of its fields and its body, since
 * nothing links to it yet.
 */
export function RecordDialog({ collection, record, values, line, parent, today, actions, onClose }: {
  collection: Collection;
  /** Null for a new record. */
  record: Record | null;
  /** What a new record starts with: the links of the record it is added from. */
  values?: Record['values'];
  /**
   * A line of a record not written yet, added or changed in its own window: Add gives its values
   * back, nothing written; the record's Create writes it (design/app-home.md 4.2).
   */
  line?: { done: (values: Record['values']) => void; editing: boolean };
  /** The record it is a line of, by its collection: its link back is not asked, it is that record. */
  parent?: string;
  today: string;
  actions: CollectionActions;
  onClose: () => void;
}) {
  const { dir, schema } = collection;
  const name = collectionName(dir);
  const fields = useMemo(() => new Map(schema.fields.map((f) => [f.key, f])), [schema]);
  // Kept off the window: what its layout or its template says (worked out for the views, written by the rules), and a line's link back.
  const offForm = useMemo(() => new Set([...hiddenOnForm(schema), ...(parent ? linkFieldsTo(schema, parent).map((f) => f.key) : [])]), [schema, parent]);
  const unplaced = unplacedFields(schema).filter((f) => !offForm.has(f.key));
  // A new record starts with the values given (the links of the block it is added from), then its fields' defaults.
  const [given] = useState(() => (record ? values : computerFor(collection, actions.collections(), actions.boards(), today).defaults(collection.dir, values ?? {}, actions.me?.())));
  const [draft, setDraft] = useState<Draft>(() => draftOf(record, given));
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const busy = useRef(false);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const isNew = record === null;
  // The fields the collection's onChanges watch: changed in the form, what they add shows as rows not written yet (design/gym.md 4.1).
  const watched = useMemo(() => changesOf(collection.rules), [collection.rules]);
  // A new record has its id from the start, for those rows to link to it.
  const [newId] = useState(newRecordId);
  const id = record?.id ?? newId;
  const [drafted, setDrafted] = useState<Change[]>([]);
  // A new record's lines, an order's or a program's items, are typed in before Create, as rows not written yet (design/app-home.md 4.2).
  const lines = useMemo(() => (record || line ? [] : linesBlocks(schema, (path) => actions.collection(path) ?? undefined).map((l) => l.block)), [record, line, schema, actions]);
  // The collections of its lines, a saved record's too: one opened from here does not ask for its link back.
  const lineDirs = useMemo(() => new Set(linesBlocks(schema, (path) => actions.collection(path) ?? undefined).map((l) => l.source.dir)), [schema, actions]);
  const drafting = watched.length > 0 || lines.length > 0;
  const original = useMemo(() => draftOf(record, given), [record, given]);
  const dirty = differs(draft, original) || drafted.length > 0;
  // A form not typed in follows the record as it is written: after one of its buttons, or a change made elsewhere.
  const followed = useRef(original);
  useEffect(() => {
    const before = followed.current;
    followed.current = original;
    setDraft((d) => (differs(d, before) ? d : original));
  }, [original]);
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink, used: (field) => usedValues(collection.records.map((r) => r.values[field.key])), values: draft.values };
  const buttons = useMemo(() => actionsOf(collection.rules), [collection.rules]);

  const layout: Layout = useMemo(() => recordLayout(schema, dir, isNew, actions, buttons.length > 0, watched.length > 0, lines), [schema, isNew, dir, actions, buttons.length, watched.length, lines]);
  // The name, and the fields the layout does not place, go in the first column that has fields.
  const fieldColumn = Math.max(0, layout.columns.findIndex((column) => column.sections.some((section) => section.items.some((item) => 'field' in item))));

  // The keyboard comes into the window, so that Esc closes it before anything is clicked.
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
  }, []);

  const set = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setValue = (key: string, value: FieldValue) => {
    setError(null);
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: value } }));
    // A field an onChange watches: what it adds takes the place of what it added before, the fields it sets are set.
    const mine = new Set(watched.filter((w) => w.fields.includes(key)).map((w) => w.name));
    if (mine.size === 0 || !actions.planChange) return;
    const ran = actions.planChange(dir, id, { ...draft.values, [key]: value }, record, key);
    if (!ran) return;
    setDrafted((now) => [...now.filter((c) => !c.by || !mine.has(c.by)), ...ran.after.changes]);
    const set = Object.keys(ran.set).filter((k) => k !== key);
    if (set.length > 0) setDraft((d) => ({ ...d, values: { ...d.values, ...Object.fromEntries(set.map((k) => [k, ran.values[k] ?? null])) } }));
  };
  // A new record given a field an onChange watches, a program day's Start, has what it adds from the start.
  useEffect(() => {
    if (!isNew) return;
    for (const key of new Set(watched.flatMap((w) => w.fields))) if (!isEmpty(given?.[key] ?? null)) setValue(key, given![key]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** The rows the form adds to a linked table, not written until Save; typed in and added to there. */
  const drafts: LinkedDrafts | undefined = drafting
    ? {
          rows: (source) => drafted.flatMap((c) => (c.kind === 'add' && c.dir === localPath(source.dir) ? [recordWith(source, c.id, c.values)] : [])),
          // A row runs what its collection runs on save, as one written to a table: a line takes its product's price.
          write: (source, rowId, values) =>
            setDrafted((now) => now.map((c) => (c.kind === 'add' && c.id === rowId ? { ...c, values: actions.planSaved?.(source.dir, rowId, { ...c.values, ...values }, c.values) ?? { ...c.values, ...values } } : c))),
          add: (source, values) => {
            const rowId = newRecordId();
            setDrafted((now) => [...now, { kind: 'add', dir: localPath(source.dir), id: rowId, values: actions.planSaved?.(source.dir, rowId, values, null) ?? values }]);
          },
          remove: (_source, rowId) => setDrafted((now) => now.filter((c) => !(c.kind === 'add' && c.id === rowId))),
          gone: (source) => new Set(drafted.flatMap((c) => (c.kind === 'remove' && c.dir === localPath(source.dir) ? [c.id] : []))),
        }
    : undefined;

  // A new workout's items come from its program: until it is picked, its table says so, + Add under it.
  const source = isNew ? watched.flatMap((w) => w.fields).map((key) => fields.get(key)).find((f): f is Field => !!f && isEmpty(draft.values[f.key] ?? null)) : undefined;
  // A choice picked, a workout's program; else a value typed, an expense's amount, whose shares come as it is.
  const picked = (source?.type === 'link' || source?.type === 'select') && !source.chips;
  const pickFirst = source ? (picked ? { title: t('collection.pickFirst', { field: source.label.toLowerCase() }), text: t('collection.pickFirstText', { field: source.label.toLowerCase() }) } : { title: t('collection.typeFirst', { field: source.label }), text: t('collection.typeFirstText') }) : null;
  const named = nameField(schema);
  /** Writes the form; false when it cannot be, saying why. */
  const write = async (): Promise<boolean> => {
    if (busy.current) return false;
    // What the rules will write as it is saved, a name by its onSave, is not missing.
    const missing = missingFields(toBe, schema);
    if (missing.length > 0) {
      // A name kept off the form comes from what is on it, an item's from its exercise: what is missing there is said.
      const nameAsked = !!named && missing.includes(named.key) && !offForm.has(named.key);
      const said = missing.length > 1 ? missing.filter((k) => k !== named?.key) : missing;
      const labels = said.map((k) => fields.get(k)?.label ?? k);
      setError(nameAsked ? t('collection.nameNeeded') : t('collection.requiredMissing', { fields: labels.join(t('list.separator')) }));
      return false;
    }
    // A line not written yet goes back to the record's window, which writes it with the record.
    if (line) {
      line.done(draft.values);
      return true;
    }
    busy.current = true;
    const patch = { values: draft.values, body: draft.body, subtasks: draft.subtasks };
    // With onChanges, the form ran them as it was typed in: what they added is written with it, and they do not run again.
    const form: FormSave | undefined = drafting ? { id, drafted } : undefined;
    const failed = isNew ? await actions.addRecord(dir, patch, form) : await actions.updateRecord(dir, record.id, patch, form);
    busy.current = false;
    if (failed) setError(failed);
    else setDrafted([]);
    return !failed;
  };
  const save = async () => {
    if (await write()) onClose();
  };
  // A button runs on the record as it is written: what was typed is saved first.
  const press = async (button: string) => {
    if (!record || (dirty && !(await write()))) return;
    actions.pressButton(dir, record.id, button);
  };
  // A record there before, or a line already in the form, keeps what was typed as the window is left: no Save (as everywhere that saves on leaving).
  const kept = !isNew || !!line?.editing;
  // What was typed in a new one is not lost without asking.
  const leave = (then: () => void = onClose) => {
    if (!dirty) return then();
    if (kept) {
      void write().then((ok) => ok && then());
      return;
    }
    const typed = named && draft.values[named.key];
    actions.ask(t('collection.discardTitle'), t('collection.discardText', { name: quote(typeof typed === 'string' && typed.trim() ? typed.trim() : record ? recordTitle(record) : t('collection.newRecordShort')) }), then, t('collection.discard'));
  };
  const menu = (event: MouseEvent) =>
    record && actions.menu(event, [{ label: t('menu.delete'), run: () => actions.removeRecord(dir, record) }]);
  useEscape(backdrop, () => leave());

  // The record opened over this one, as it is now; it closes when it is gone.
  const overCollection = over && 'dir' in over ? actions.collection(over.dir) : null;
  const overRecord = over && 'id' in over ? (overCollection?.records.find((r) => r.id === over.id) ?? null) : null;
  const overBoard = over && 'board' in over ? actions.boards()[over.board] : undefined;
  const overCard = over && 'card' in over ? overBoard?.cards.find((c) => c.id === over.card) : undefined;
  const overGone = !!over && ('board' in over ? !overCard : !overCollection || ('id' in over && !overRecord));
  useEffect(() => {
    if (overGone) setOver(null);
  }, [overGone]);

  // A new record's first box has the keyboard.
  // A new record starts at the field its rows come from, its list open: a workout's program; else at its first.
  const placedFields = layout.columns.flatMap((c) => c.sections.flatMap((s) => s.items)).filter((i): i is { field: string } => 'field' in i);
  const firstKey = isNew ? (placedFields.find((i) => watched.some((w) => w.fields.includes(i.field))) ?? placedFields[0])?.field : undefined;
  // What is worked out (formulas, lookups, rollups) from what the form holds now; the rollups are the
  // record's, from what links to it, the rows typed in and not written yet among them: a new order's
  // total its new lines'.
  const linking = useMemo(() => withDrafts(actions.collections(), drafted), [actions, drafted]);
  const computer = useMemo(() => computerFor(collection, linking, actions.boards(), today), [collection, linking, actions, today]);
  // What the collection's rules will write in its own fields as it is saved, shown before Save: what
  // is worked out and checked is of the record as it will be.
  const willWrite = useMemo(() => savePreview(collection, record, draft.values, actions, today), [collection, record, draft.values, actions, today]);
  const toBe = willWrite.length > 0 ? { ...draft.values, ...Object.fromEntries(willWrite.map((w) => [w.key, w.value])) } : draft.values;
  const computed = computer.draft(dir, record ?? { id, name: '', path: '' }, toBe);
  const shownAs = computer.shown(dir);
  // What does not fit the schema, as the form holds it now: a record's, not a new one's, which is checked on Create;
  // and the checks of the collection's rules it fails, a new one's too, at their fields or above the form.
  const problems = [...(record ? recordProblems({ values: toBe, extra: record.extra }, schema) : []), ...computer.checks(dir, record ?? recordWith(collection, id, toBe), toBe)];
  const recordWide = problems.filter((p) => !p.field || !fields.has(p.field));
  // A field shown before another on its line, an expense's currency before its amount.
  const headSteps = schema.head?.steps ? fields.get(schema.head.steps) : undefined;
  const besideOf = (key: string) => schema.fields.find((f) => f.beside === key && shownOnForm(f, { values: toBe }, schema, today));
  const item = (key: string, index: number): ReactNode => {
    const field = fields.get(key);
    // Nor one whose Shown when does not hold as the form is now: Store but for a warranty (design/shown-when.md).
    // One kept off the window may still be asked as a record is made: what a customer wrote first (Layout.new).
    const asked = !record && !!schema.layout?.new?.includes(key);
    if (!field || (offForm.has(key) && !asked) || !shownOnForm(field, { values: toBe }, schema, today)) return null;
    // One shown beside another is on that one's line; the name is the window's title when it has a head.
    if (field.beside && fields.has(field.beside)) return null;
    if (schema.head && (field.type === 'name' || field.key === schema.head.steps)) return null;
    // A rate as a sentence (design/more-apps.md 4.5): 1 EUR = 37,10 ₺.
    if (field.rate) {
      const of = draft.values[field.rate.field];
      return (
        <div key={`${key}-${index}`} className="prop prate">
          <label className="rate" htmlFor={`field-${field.key}`}>
            <span>1 {typeof of === 'string' ? of : ''} =</span>
            <FieldInput field={field} value={draft.values[field.key] ?? null} ctx={ctx} onChange={(next) => setValue(field.key, next)} />
            <span>{field.rate.main}</span>
          </label>
          {field.help && <p className="phelp">{field.help}</p>}
        </div>
      );
    }
    const before = besideOf(key);
    // What is worked out is shown, not typed; a new record's only when it says something: what its lines add up to, a total.
    const problem = problems.find((p) => p.field === field.key);
    if (isComputed(field.type)) {
      const worked = computed[field.key];
      const fromLines = field.rollup && [...lineDirs].some((d) => localPath(d) === field.rollup!.from);
      if (isNew && !fromLines && (isEmpty(worked ?? null) || worked === 0 || worked === false)) return null;
      return (
        <div key={`${key}-${index}`} className={problem ? 'prop bad' : 'prop'}>
          <span className="pl">{fieldLabel(field, toBe)}</span>
          <div className="pe">
            <span className={isEmpty(worked) ? 'st-field formula none' : 'st-field formula'}>{isEmpty(worked) ? '–' : <Cell field={shownAs.get(field.key) ?? field} value={worked} ctx={ctx} values={computed} />}</span>
            {problem && <p className="pbad">{problem.message}</p>}
          </div>
        </div>
      );
    }
    const will = willWrite.find((w) => w.key === field.key);
    return (
      <div key={`${key}-${index}`} className={problem ? 'prop bad' : 'prop'}>
        <label className="pl" htmlFor={`field-${field.key}`}>
          {fieldLabel(field, toBe)}
          {(field.required || (field.type === 'name' && !field.optional)) && <i title={t('collection.required')}>*</i>}
        </label>
        <div className={will ? 'pe will' : before ? 'pe beside' : 'pe'}>
          {before && <FieldInput field={before} value={draft.values[before.key] ?? null} ctx={ctx} onChange={(next) => setValue(before.key, next)} />}
          <FieldInput
            field={field.labelBy ? { ...field, label: fieldLabel(field, toBe) } : field}
            value={will ? will.value : (draft.values[field.key] ?? null)}
            autoFocus={field.key === firstKey}
            ctx={ctx}
            currency={currencyOf(field.format, draft.values)}
            onChange={(next) => setValue(field.key, next)}
            onEnter={field.type === 'name' ? () => void save() : undefined}
          />
          {field.help && <p className="phelp">{field.help}</p>}
          {will && (
            <p className="pwill">
              <b>{will.by}</b> {t('run.writesThis')}
            </p>
          )}
          {problem && (record || problem.kind === 'check') && <p className="pbad">{problemText(problem, field, { values: toBe, extra: record?.extra ?? {} })}</p>}
        </div>
      </div>
    );
  };
  const body = (index: number, only = false): ReactNode => (
    <div key={`body-${index}`} className={only ? 'prop prop-body only' : 'prop prop-body'}>
      {!only && <span className="pl">{t('collection.body')}</span>}
      <NotesBlock home={collection.dir} text={draft.body} editor={actions.editor} attach={actions.attach} onChange={(text) => set({ body: text })} only={only} />
    </div>
  );
  const entry = (layoutItem: LayoutItem, index: number): ReactNode => {
    if ('field' in layoutItem) return item(layoutItem.field, index);
    if (layoutItem.block === 'body') return body(index, !!layoutItem.attach);
    if (layoutItem.block === 'note') {
      // A formula's sentence in a box: an order's profit (design/calendar.md 7).
      const said = valueText((computed as Record['values'])[layoutItem.of] ?? null);
      return said ? (
        <p key={`note-${index}`} className="rm-note">
          {said}
        </p>
      ) : null;
    }
    if (layoutItem.block === 'actions') {
      if (!record || buttons.length === 0) return null;
      const now = { ...record, values: draft.values };
      return (
        <div key={`actions-${index}`} className="rm-buttons" role="group" aria-label={t('run.buttons')}>
          {buttons.map((button) => {
            const state = actionState(collection.rules ?? '', button, computer, dir, now);
            // One that cannot run and says no why is not this record's: a book's Update on an anime.
            if (!state.on && !state.hint) return null;
            return (
              <span key={button.name} className="rbtn-tip">
                <button type="button" className={state.on ? 'rbtn' : 'rbtn off'} aria-disabled={!state.on} onClick={() => state.on && void press(button.name)}>
                  <Icon name="play" />
                  {button.name}
                </button>
                {state.hint && <span className="tip">{state.hint}</span>}
              </span>
            );
          })}
          {/* A phone and a mail filled in give Call and Email beside them, as on a phone (design/scrawl-apps.md 3.1). */}
          {(['phone', 'email'] as const).map((type) => {
            const field = schema.fields.find((f) => f.type === type && !isEmpty(draft.values[f.key]));
            const href = field ? fieldHref(type, valueText(draft.values[field.key] ?? null)) : null;
            return (
              href && (
                <button key={type} type="button" className="rbtn" onClick={() => actions.openLink(href)}>
                  <Icon name={type === 'phone' ? 'phone' : 'mail'} />
                  {t(type === 'phone' ? 'phone.call' : 'phone.mail')}
                </button>
              )
            );
          })}
        </div>
      );
    }
    if (layoutItem.block === 'linked' && (record || drafts)) {
      // A new record's table shows what its onChanges add, linked to the id it will have.
      const self = record ?? recordWith(collection, id, draft.values);
      return (
        <LinkedRecords
          key={`linked-${layoutItem.collection}-${index}`}
          block={!record && lines.some((l) => l.collection === layoutItem.collection) ? { ...layoutItem, style: 'table' } : layoutItem}
          dir={dir}
          record={self}
          today={today}
          actions={actions}
          drafts={drafts}
          hint={pickFirst ?? undefined}
          parent={{ values: { ...computed, ...draft.values }, set: setValue }}
          onOpen={(source, linked) => {
            const unsaved = drafted.find((c) => c.kind === 'add' && c.id === linked.id);
            setOver(unsaved && 'values' in unsaved ? { dir: source.dir, values: unsaved.values, draft: linked.id } : { dir: source.dir, id: linked.id });
          }}
          onAdd={(source, given) => setOver({ dir: source.dir, values: { ...linkedValues(source.schema, dir, self, schema), ...given }, ...(drafts && { draft: null }) })}
        />
      );
    }
    // A habit's month (design/more-apps.md 4.9): its days on its calendar that repeats, its streak over them.
    if (layoutItem.block === 'days') {
      const repeating = (schema.views ?? []).find((v) => v.kind === 'calendar' && v.calendar?.repeat);
      if (!record || !repeating) return null;
      const stats = (layoutItem.fields ?? []).flatMap((key) => {
        const field = schema.fields.find((f) => f.key === key);
        return field ? [{ label: field.label, value: valueText(computed[key] ?? null) || '–', ...(key === layoutItem.fields![0] && { hot: true }) }] : [];
      });
      return (
        <div key={`days-${index}`} className="blk">
          <DaysMonth collection={collection} record={record} view={repeating} stats={stats} today={today} actions={actions} />
        </div>
      );
    }
    if (layoutItem.block === 'cards' && record) {
      return <CardsBlock key={`cards-${index}`} dir={dir} record={record} only={layoutItem.board} today={today} actions={actions} onOpen={(board, card) => setOver({ board, card })} />;
    }
    if (layoutItem.block === 'subtasks') {
      return (
        <div key={`subtasks-${index}`} className="blk">
          <Subtasks
            list={draft.subtasks}
            change={(change) => {
              setError(null);
              setDraft((d) => ({ ...d, subtasks: change(d.subtasks) }));
            }}
            team={actions.cardActions.people?.(dir) ?? null}
            today={today}
            menu={actions.menu}
            place="record"
            {...(layoutItem.title && { title: layoutItem.title })}
            {...(layoutItem.add && { add: layoutItem.add })}
          />
        </div>
      );
    }
    return null;
  };
  // A block with conditions is there only while the form's values meet them; a column left with
  // nothing in it goes, and the window is as narrow as one column (a goal by a number has no steps).
  const here = (layoutItem: LayoutItem) => 'field' in layoutItem || shownOnForm(layoutItem, { values: draft.values }, schema, today);
  const shownColumns = layout.columns.map((column, c) => ({ column, c })).filter(({ column, c }) => c === fieldColumn || column.sections.some((s) => s.items.some(here)));
  const columns = shownColumns.map(({ column, c }) => (
    <div key={c} className="rm-col" style={{ flex: column.width ?? 1 }}>
      {column.sections.map((section, s) => (
        <section key={s} className="rm-sec">
          {section.title && <h3>{section.title}</h3>}
          {section.items.filter(here).map(entry)}
        </section>
      ))}
      {/* Fields the layout does not place are shown after the others, so that none is lost. */}
      {c === fieldColumn && unplaced.length > 0 && (
        <section className="rm-sec">
          <h3>{t('collection.moreFields')}</h3>
          {unplaced.map((field, i) => item(field.key, i))}
        </section>
      )}
    </div>
  ));
  const title = line?.editing
    ? recordTitle(recordWith(collection, id, draft.values)) || t('collection.newOne', { singular: singularOf(schema) })
    : isNew
      ? schema.singular
        ? t('collection.newOne', { singular: schema.singular })
        : t('collection.newRecord', { collection: name })
      : collectionLabel(dir);

  return (
    <div ref={backdrop} className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && leave()}>
      <section ref={panel} className={shownColumns.length > 1 ? 'rmod wide' : 'rmod'} role="dialog" aria-label={isNew ? title : recordTitle(record)} tabIndex={-1}>
        <div className="cp-head">
          <Icon name="collection" />
          {record?.code && <span className="key">{record.code}</span>}
          <span className="where">{title}</span>
          {record && (
            <>
              <button type="button" className="open" title={t('collection.openInTab')} aria-label={t('collection.openInTab')} onClick={() => leave(() => actions.openNote(record.path))}>
                <Icon name="open" />
              </button>
              <button type="button" className="more" title={t('collection.menu')} aria-label={t('collection.menu')} onClick={menu}>
                ···
              </button>
            </>
          )}
          <button type="button" className={record ? 'x' : 'x push'} title={t('dialog.close')} aria-label={t('dialog.close')} onClick={() => leave()}>
            ×
          </button>
        </div>
        <div className="rm-scroll">
          {recordWide.length > 0 && (
            <div className="rm-checks">
              {recordWide.map((p, i) => (
                <p key={i} className="pbad">
                  {p.message}
                </p>
              ))}
            </div>
          )}
          {schema.head && (
            <div className="rm-head">
              <input
                className="rm-title"
                aria-label={named?.label ?? t('collection.name')}
                placeholder={(named && !named.optional ? named.label : recordTitle(recordWith(collection, id, toBe))) || t('collection.newOne', { singular: singularOf(schema) })}
                value={named ? valueText(draft.values[named.key] ?? null) : ''}
                onChange={(event) => named && setValue(named.key, event.target.value)}
              />
              {!isEmpty(computed[schema.head.sub] ?? null) && <small>{valueText(computed[schema.head.sub] ?? null)}</small>}
              {headSteps && <StepsBar field={headSteps} value={draft.values[headSteps.key] ?? null} onChange={(next) => setValue(headSteps.key, next)} className="steps big" />}
            </div>
          )}
          <div className="rm-cols">{columns}</div>
        </div>
        <div className="rm-foot">
          {error ? (
            <p role="alert">{error}</p>
          ) : (
            isNew && <span className="hint">{line ? t('collection.lineHint') : t('collection.savedIn', { collection: name })}</span>
          )}
          {/* Cancel lets go of what was typed; a new one is made with its own button. */}
          <button type="button" onClick={() => (kept ? onClose() : leave())}>
            {t('dialog.cancel')}
          </button>
          {!kept && (
            <button type="button" className="primary" onClick={() => void save()}>
              {line ? t('collection.addRowButton') : t('collection.create')}
            </button>
          )}
        </div>
      </section>
      {over && 'board' in over && overBoard && overCard && (
        <CardPanel board={overBoard} path={over.board} card={overCard} today={today} actions={actions.cardActions} escape onClose={() => setOver(null)} />
      )}
      {over && !('board' in over) && overCollection && !overGone && (
        <RecordDialog
          key={'id' in over ? over.id : `new:${'dir' in over ? over.dir : ''}:${'draft' in over ? (over.draft ?? '') : ''}`}
          collection={overCollection}
          record={overRecord}
          values={'values' in over ? over.values : undefined}
          line={
            'draft' in over && drafts
              ? {
                  editing: !!over.draft,
                  done: (values) => (over.draft ? drafts.write(overCollection, over.draft, values) : drafts.add(overCollection, values)),
                }
              : undefined
          }
          parent={lineDirs.has(over.dir) ? dir : undefined}
          today={today}
          actions={actions}
          onClose={() => setOver(null)}
        />
      )}
    </div>
  );
}

// ---------- views: filters, groups, columns ----------

/**
 * A day's value in a condition: Today, which moves with the day, or a day picked. "A day…" opens
 * the device's own day picker, which sits under the box.
 */
export function DayValue({ value, todayHint = t('collection.todayHint'), none, onChange }: {
  value: string | undefined;
  /** What Today is said to be: a condition's moves with the day, a default's is the day a record is made. */
  todayHint?: string;
  /** What having no day is called, when it can be picked. */
  none?: string;
  onChange: (value: string | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const day = typeof value === 'string' && value !== TODAY ? value : '';
  const options: Option[] = [
    { value: TODAY, label: t('collection.today'), hint: todayHint, chip: false },
    { value: 'day', label: t('collection.aDay'), chip: false },
    ...(none ? [{ value: null, label: none, chip: false, apart: true }] : []),
  ];
  const pick = (picked: string | null) => {
    if (picked === TODAY) return onChange(TODAY);
    if (picked === null) return onChange(undefined);
    const box = input.current;
    if (!box) return;
    try {
      box.showPicker();
    } catch {
      box.focus();
    }
  };
  return (
    <span className="cv-day">
      <Picker className="cv" options={options} value={value === TODAY ? TODAY : day ? 'day' : null} text={value === TODAY ? t('collection.today') : day ? dayText(day) : undefined} label={t('collection.value')} onPick={pick} />
      <input ref={input} type="date" className="cv-pick" tabIndex={-1} aria-label={t('collection.aDay')} value={day} onChange={(event) => onChange(event.target.value || undefined)} />
    </span>
  );
}

/** A day as a condition shows it: Oct 12, 2026. */
const dayText = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** A condition being typed: the field, what is asked of it, and the value when one is needed. A worked-out field asks as what it shows (`shown`). */
export function ConditionRow({ schema, condition, records, shown, onChange, onRemove }: {
  schema: Pick<Schema, 'fields'>;
  condition: Condition;
  records: CollectionActions['records'];
  /** A field as its value shows: a formula with the type of what it gives. */
  shown?: (field: Field) => Field;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const raw = schema.fields.find((f) => f.key === condition.field) ?? schema.fields[0]!;
  const field = shown ? shown(raw) : raw;
  const ops = opsFor(field.type);
  const fieldOptions: Option[] = schema.fields.filter((f) => f.type !== 'formula' || f.formula).map((f) => ({ value: f.key, label: f.label, chip: false }));
  const opOptions: Option[] = ops.map((op) => ({ value: op, label: t(`collection.op.${op}`), chip: false }));
  const takes = opTakesValue(condition.op);
  const value = condition.value;
  const choices = field.type === 'select' || field.type === 'multi-select' ? (field.options ?? []) : null;
  // A choice field compares with any of the choices picked; a link with any of the records picked, by name.
  const picked = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
  const linkOptions: Option[] = field.type === 'link' && field.collection ? (records(field.collection) ?? []).map((r) => ({ value: r.name || r.code, label: recordLabel(r), chip: false })) : [];
  return (
    <div className="cond">
      <Picker options={fieldOptions} value={condition.field} label={t('collection.field')} onPick={(key) => {
        const next = schema.fields.find((f) => f.key === key);
        if (!next) return;
        const nextOps = opsFor((shown ? shown(next) : next).type);
        onChange({ field: next.key, op: nextOps.includes(condition.op) ? condition.op : nextOps[0]! });
      }} />
      <Picker options={opOptions} value={condition.op} label={t('collection.op')} onPick={(op) => op && onChange({ ...condition, op: op as ConditionOp, ...(opTakesValue(op as ConditionOp) && value !== undefined && { value }) })} />
      {takes ? (
        choices || linkOptions.length > 0 ? (
          <MultiPicker options={choices ? choiceOptions(field, choices) : linkOptions} picked={picked} label={t('collection.value')} onChange={(next) => onChange({ ...condition, value: next })} />
        ) : field.type === 'number' || field.type === 'formula' ? (
          <input type="number" step="any" className="cv" aria-label={t('collection.value')} placeholder={t('collection.value')} value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value === '' ? undefined : Number(event.target.value) })} />
        ) : field.type === 'date' ? (
          <DayValue value={typeof value === 'string' ? value : undefined} onChange={(day) => onChange({ ...condition, value: day })} />
        ) : field.type === 'time' ? (
          <input type="time" className="cv" aria-label={t('collection.value')} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value || undefined })} />
        ) : (
          <input type="text" className="cv" aria-label={t('collection.value')} placeholder={t('collection.value')} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value })} />
        )
      ) : (
        <span />
      )}
      <button type="button" className="x" title={t('collection.removeCondition')} aria-label={t('collection.removeCondition')} onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

/** The conditions of the table, edited in a window; Apply shows them, Save as view keeps them in the schema. */
function FilterDialog({ schema, first, conditions, count, records, showAs, view, naming: startNaming = false, onApply, onSave, onClose }: {
  schema: Schema;
  /** A field as its value shows: a formula with the type of what it gives. */
  showAs: (field: Field) => Field;
  /** The field a new condition starts on: the first column after the name. */
  first: Field;
  conditions: Condition[];
  /** How many records the conditions would show. */
  count: (conditions: Condition[]) => number;
  records: CollectionActions['records'];
  /** The saved view being edited, when one is. */
  view: View | null;
  /** Opens with the name of a new view asked for: a table view added from +. */
  naming?: boolean;
  onApply: (conditions: Condition[]) => void;
  /** Saves the conditions as a view: the one edited, or a new one by the name typed. */
  onSave: (conditions: Condition[], name: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Condition[]>(conditions);
  const [name, setName] = useState(view?.name ?? '');
  const [naming, setNaming] = useState(startNaming);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const add = () => setDraft([...draft, { field: first.key, op: opsFor(showAs(first).type)[0]! }]);
  useEscape(backdrop, onClose);
  const shown = count(draft);
  // The keyboard comes into the window, so that Esc closes it before anything is clicked.
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={backdrop} className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} className="dialog cfilter" role="dialog" aria-label={t('collection.filter')} tabIndex={-1}>
        <h2>{view ? view.name : t('collection.filter')}</h2>
        <p className="dialog-hint">{draft.length === 0 ? t('collection.noConditions') : t('collection.conditions')}</p>
        {draft.map((condition, i) => (
          <ConditionRow
            key={i}
            schema={schema}
            condition={condition}
            records={records}
            shown={showAs}
            onChange={(next) => setDraft(draft.map((c, j) => (j === i ? next : c)))}
            onRemove={() => setDraft(draft.filter((_, j) => j !== i))}
          />
        ))}
        <button type="button" className="cond-add" onClick={add}>
          {t('collection.addCondition')}
        </button>
        {naming && (
          <div className="frow">
            <span>{t('collection.viewName')}</span>
            <input autoFocus aria-label={t('collection.viewName')} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && name.trim() && (event.preventDefault(), onSave(draft, name.trim()))} />
          </div>
        )}
        <div className="dialog-actions filter-foot">
          <span className="count">{t('collection.matching', { count: shown })}</span>
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          {view || naming ? (
            <button type="button" disabled={!name.trim()} onClick={() => onSave(draft, name.trim())}>
              {t('collection.updateView')}
            </button>
          ) : (
            <button type="button" onClick={() => setNaming(true)}>
              {t('collection.saveView')}
            </button>
          )}
          <button type="button" className="primary" onClick={() => onApply(draft)}>
            {t('collection.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What the table shows: the plain table as remembered on this device, or a saved view. */
interface TableState {
  conditions: Condition[];
  sort: RecordSort;
  group: string | null;
  /** The field keys shown; null for every field. */
  columns: string[] | null;
  /** The columns' widths once one was dragged; null for widths that fit their values. */
  widths: ColumnWidths | null;
  /** The fields changed in the table; null for none. */
  edit: string[] | null;
}

type TablePatch = Partial<Pick<TableState, 'sort' | 'group' | 'columns' | 'widths' | 'edit'>>;

/** A view or the device's look with a change of the table: a key set to null is taken off. */
function patched<T extends { sort?: RecordSort; group?: string | null; columns?: string[]; widths?: ColumnWidths; edit?: string[] }>(base: T, patch: TablePatch): T {
  const next: T = { ...base };
  if (patch.sort) next.sort = patch.sort;
  if (patch.group !== undefined) next.group = patch.group;
  if (patch.columns !== undefined) {
    if (patch.columns === null) delete next.columns;
    else next.columns = patch.columns;
  }
  if (patch.widths !== undefined) {
    if (patch.widths === null) delete next.widths;
    else next.widths = patch.widths;
  }
  if (patch.edit !== undefined) {
    if (patch.edit === null) delete next.edit;
    else next.edit = patch.edit;
  }
  return next;
}

/** The value the Columns list gives to fitting the columns to their values again. */
const FIT = '\u0000fit';
/** Before a field's key in the Columns list, where it is changed in the table. */
const CHANGE = '\u0001';

/** On a phone, a menu opens from the bottom wherever it was asked for. */
const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

export function CollectionView({ collection, embedded, screen, today, look, onLook, actions, onStatus, fieldsAsked }: {
  collection: Collection;
  /** In an app's tab, whose menu says its name (design/app-home.md 5.3). */
  embedded?: boolean;
  /** The app's screen it is: one that opens on a view keeps to it, with no tabs of the others, by its own name (Reading's Anime). */
  screen?: { name: string; view?: string };
  today: string;
  look: CollectionLook | undefined;
  onLook: (look: CollectionLook) => void;
  actions: CollectionActions;
  /** What the status bar says: the count and the order. Null once the view closes. */
  onStatus: (parts: string[] | null) => void;
  /** On a phone, counts the times the page's menu asked for the Fields window. */
  fieldsAsked?: number;
}) {
  const { dir, schema } = collection;
  // The records with what is worked out among their values, for the table; a record opens as its file has it.
  const computer = useMemo(() => computerFor(collection, actions.collections(), actions.boards(), today), [collection, actions, today]);
  const rolled = useMemo(() => computer.withValues(collection.dir) ?? collection, [computer, collection]);
  // A worked-out field shows, sorts, groups and is asked about as what it gives.
  const shownAs = useMemo(() => computer.shown(collection.dir), [computer, collection.dir]);
  const asShown = (field: Field) => shownAs.get(field.key) ?? field;
  const records = rolled.records;
  const name = (screen?.view && screen.name) || collectionName(dir);
  const narrow = useNarrow();
  const [query, setQuery] = useState('');
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState<{ kind: 'new'; values?: Record['values'] } | { kind: 'record'; id: string } | null>(null);
  const [filtering, setFiltering] = useState(false);
  // A new table view from +, named in the filter's window; a Calendar view's window, for a new one or the one edited.
  const [newTable, setNewTable] = useState(false);
  const [calendaring, setCalendaring] = useState<{ view: View | null } | null>(null);
  const [designing, setDesigning] = useState(false);
  /** On a phone, the view's sheet: its sort, grouping, filter and the fields the list shows. */
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    if (fieldsAsked) setDesigning(true);
  }, [fieldsAsked]);
  // The groups closed by hand, for the view they were closed in; another view starts as it says.
  const [toggled, setToggled] = useState<{ view: string | null; closed: ReadonlySet<string> } | null>(null);
  // A record's lines, an order's, open under its row from the ▸ at its start, typed in where they
  // are (design/app-home.md 4.2); which are open is kept on this device. A line opens in its window.
  const lineBlocks = useMemo(() => linesBlocks(schema, (path) => actions.collection(path) ?? undefined), [schema, actions]);
  const linesOn = lineBlocks.length > 0 && look?.lines !== false;
  const openedLines = new Set(look?.opened ?? []);
  const showLines = (ids: string[], on: boolean) => onLook({ ...look, opened: on ? [...new Set([...openedLines, ...ids])] : [...openedLines].filter((id) => !ids.includes(id)) });
  // A line opened from under its row, or a new one added there, in its own window.
  const [line, setLine] = useState<{ dir: string; id: string } | { dir: string; values: Record['values'] } | null>(null);
  const lineCollection = line ? actions.collection(line.dir) : null;
  const lineRecord = line && 'id' in line ? (lineCollection?.records.find((r) => r.id === line.id) ?? null) : null;
  // Conditions applied without being saved as a view, until the tab closes.
  const [adHoc, setAdHoc] = useState<Condition[]>([]);
  const views = schema.views ?? [];
  // Until a view is chosen on this device, the one the schema opens on.
  // A screen opened on a view of a set has the set's views as its tabs, one picked kept until the screen closes (Sales' Quotes, Open, Unpaid).
  const screenView = screen?.view ? views.find((v) => v.id === screen.view) : undefined;
  const setViews = screenView?.set ? views.filter((v) => v.set === screenView.set) : null;
  const [setPicked, setSetPicked] = useState<string | null>(null);
  const view = views.find((v) => v.id === ((setViews && setPicked) || (screen?.view ?? (look?.view === undefined ? schema.defaultView : look.view)))) ?? null;
  const ownView = !!screen?.view && (view?.id === screen.view || !!setViews?.some((v) => v.id === view?.id));
  // The chip picked over the view, by the value it shows; none for all of them (an order's channel).
  const [chip, setChip] = useState<{ view: string; value: string } | null>(null);
  const chipField = view?.chips ? schema.fields.find((f) => f.key === view.chips) : undefined;
  const chipOn = chip && chip.view === view?.id ? chip.value : null;
  const closed = toggled && toggled.view === (view?.id ?? null) ? toggled.closed : new Set(view?.closed ?? []);
  // A record made here is what the view asks of it: an anime on the Anime screen (design/more-apps.md 4.8).
  const fresh = () => viewValues(view ?? undefined, schema);
  const calendarView = view?.kind === 'calendar' ? view : null;
  const nav = useCalendarNav(`${dir}#${view?.id ?? ''}`, calendarView ? firstRange(schema, calendarView) : 'week', today);
  const fieldsByKey = useMemo(() => new Map(schema.fields.map((f) => [f.key, f])), [schema]);
  // Records come by their name, else by the first field; a sort by a field taken out falls back to that too.
  const firstSort: RecordSort = { key: nameField(schema)?.key ?? schema.fields[0]?.key ?? '', dir: 'asc' };
  const sortOf = (sort: RecordSort | undefined) => (sort && fieldsByKey.has(sort.key) ? sort : firstSort);
  const state: TableState = view
    ? { conditions: view.conditions, sort: sortOf(view.sort), group: view.group ?? null, columns: view.columns ?? null, widths: view.widths ?? null, edit: view.edit ?? null }
    : { conditions: adHoc, sort: sortOf(look?.sort), group: look?.group ?? null, columns: look?.columns ?? schema.columns ?? null, widths: look?.widths ?? null, edit: look?.edit ?? null };
  const allFields = useMemo(() => tableFields(collection), [collection]);
  // Columns not picked are every field but those shown only sometimes, a warranty's Store, which Columns adds (design/shown-when.md 6).
  const fields = state.columns ? [allFields[0]!, ...state.columns.map((k) => fieldsByKey.get(k)).filter((f): f is Field => !!f && f.key !== allFields[0]!.key)] : allFields.filter((f, i) => i === 0 || !f.when);
  const sortField = fieldsByKey.get(state.sort.key);
  const applied = state.conditions.filter(isComplete);
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink, used: (field) => usedValues(collection.records.map((r) => r.values[field.key])) };
  const noFields = schema.fields.length === 0;
  // What does not fit the schema in each record, and the checks of the collection's rules it fails, by its id; a record with none is not in it.
  const problems = useMemo(
    () => new Map(collection.records.map((r) => [r.id, [...recordProblems(r, schema), ...computer.checks(dir, r)]] as const).filter(([, found]) => found.length > 0)),
    [collection.records, schema, computer, dir],
  );

  // What the view says is changed on the view itself; the plain table's look is kept on this device.
  const change = (patch: TablePatch) => {
    if (view) void actions.changeSchema(dir, (s) => putView(s, patched(view, patch)));
    else onLook(patched({ ...look, view: null }, patch));
  };
  const pickView = (id: string | null) => {
    onLook({ ...look, view: id });
    setFull(false);
  };

  const me = actions.me?.();
  // A condition on whoever looks, a request's Mine, is on their name.
  const viewed = useMemo(() => records.filter((r) => matchesConditions(r, schema, forMe(state.conditions, me), today)), [records, schema, state.conditions, today, me]);
  const chipOf = (r: Record) => (chipField ? valueText(r.values[chipField.key] ?? null) : '');
  const matching = useMemo(
    () => viewed.filter((r) => (!chipOn || chipOf(r) === chipOn) && matchesQuery(r, schema, query)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewed, schema, query, chipOn, chipField],
  );
  const shown = useMemo(() => sortRecords(matching, schema, state.sort, today), [matching, schema, state.sort, today]);
  const groups = useMemo(() => (state.group ? groupRecords(shown, schema, state.group, today, shownAs.get(state.group)) : null), [shown, schema, state.group, today, shownAs]);
  const groupField = state.group ? fieldsByKey.get(state.group) : undefined;

  // A habit's last days (design/more-apps.md 4.9): its calendar that repeats keeps a strip of them
  // in its tables, a box a day, after the name.
  const stripView = useMemo(() => (schema.views ?? []).find((v) => v.kind === 'calendar' && v.calendar?.repeat?.strip) ?? null, [schema.views]);
  const stripDays = useMemo(() => {
    const n = stripView?.calendar?.repeat?.strip ?? 0;
    return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
  }, [stripView, today]);
  const stripItems = useMemo(() => {
    const items = stripView ? repeatItems(rolled, rolled.records, stripView, stripDays, today, actions.collections(), true) : [];
    return new Map(items.map((item) => [`${item.record.id}/${item.day}`, item]));
  }, [stripView, rolled, stripDays, today, actions]);

  const calendarItems = useMemo(
    () =>
      !calendarView
        ? []
        : calendarView.calendar?.repeat
          ? repeatItems(rolled, matching, calendarView, nav.range === 'month' ? monthDays(nav.month) : nav.days, today, actions.collections())
          : calendarRecords({ ...rolled, records: matching }, { ...calendarView, conditions: [] }, today),
    [calendarView, rolled, matching, today, nav.range, nav.month, nav.days, actions],
  );
  // What the status bar says, written when its words change: what they come from is worked out
  // anew at each render, and writing it each time would render again, without end.
  const status = calendarView
    ? [calendarStatus(calendarItems, nav)]
    : [
        applied.length > 0 || query ? t('collection.matching', { count: shown.length }) : t('count.records', { count: records.length }),
        ...(problems.size > 0 ? [t('collection.toCheck', { count: problems.size })] : []),
        t('collection.sortedBy', { field: sortField?.label ?? state.sort.key }),
      ];
  const said = status.join('\u0000');
  useEffect(() => {
    onStatus(said.split('\u0000'));
  }, [said]);
  useEffect(() => () => onStatus(null), []);

  const opened = open?.kind === 'record' ? collection.records.find((r) => r.id === open.id) : undefined;
  // The record on screen was deleted, or went with sync: its screen closes.
  useEffect(() => {
    if (open?.kind === 'record' && !opened) setOpen(null);
  }, [open, opened]);

  // Whether the table is scrolled sideways, for the line beside the name that stays.
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  // A column being dragged wider or narrower, and the width it has while it is.
  const [dragged, setDragged] = useState<{ key: string; width: number } | null>(null);
  const widthOf = (field: Field) => (dragged?.key === field.key ? dragged.width : state.widths?.[field.key]);
  const boxOf = (field: Field) => cellBox(asShown(field), widthOf(field));

  // Dragging a column's edge: it follows the pointer from the width it has on screen, and when the
  // pointer lets go its width is kept as the sort is; the others stay as wide as their values.
  const resize = (event: PointerEvent<HTMLSpanElement>, field: Field) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const box = handle.parentElement?.querySelector<HTMLElement>('.tc');
    if (!box) return;
    const start = box.offsetWidth;
    const x = event.clientX;
    let latest = start;
    handle.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => {
      latest = Math.max(MIN_WIDTH, Math.round(start + onPage(e.clientX - x)));
      setDragged({ key: field.key, width: latest });
    };
    const done = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
      setDragged(null);
      if (latest !== start) change({ widths: { ...state.widths, [field.key]: latest } });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  };
  // A double click on the edge gives the column back the width of its values.
  const unsize = (key: string) => {
    if (!state.widths || !(key in state.widths)) return;
    const { [key]: _gone, ...rest } = state.widths;
    change({ widths: Object.keys(rest).length > 0 ? rest : null });
  };

  const openRecord = (id: string) => setOpen({ kind: 'record', id });
  // A tick or a choice changed in the table is written to its record's file; what goes wrong is said.
  const lit = useLit(collection);
  const writeCell = (record: Record, field: Field, value: FieldValue) => {
    lit.wrote(record.id, field.key, value);
    void actions.updateRecord(dir, record.id, { values: { [field.key]: value } }).then((failed) => failed && actions.say?.(failed));
  };
  // The fields the table changes: the view's, or the plain table's on this device.
  const changes = new Set(fields.filter((f) => changesInTable(f) && state.edit?.includes(f.key)).map((f) => f.key));
  const sortBy = (key: string) => change({ sort: { key, dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc' } });
  const isNumeric = (field: Field) => asShown(field).type === 'number';
  const cellClass = (field: Field, i: number) => [i === 0 && 'c0', isNumeric(field) && 'r'].filter(Boolean).join(' ') || undefined;
  const head = (field: Field, i: number) => {
    const on = state.sort.key === field.key;
    return (
      <th key={field.key} aria-sort={on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cellClass(field, i)}>
        <div className="tc" style={boxOf(field)}>
          <button type="button" className={on ? 'hs sorted' : 'hs'} onClick={() => sortBy(field.key)}>
            {field.label}
            {on && (state.sort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>
        </div>
        <span className="rz" aria-hidden="true" onPointerDown={(event) => resize(event, field)} onDoubleClick={() => unsize(field.key)} />
      </th>
    );
  };
  const cellOf = (record: Record, field: Field) => {
    if (field.key === TITLE.key) return <span className="ct name">{recordTitle(record)}</span>;
    if (changes.has(field.key)) return <ChangeCell field={field} value={record.values[field.key]} onChange={(value) => writeCell(record, field, value)} />;
    const problem = problems.get(record.id)?.find((p) => p.field === field.key);
    const value = fieldValueOf(record, field, schema, today);
    return problem ? (
      <Flagged problem={problem} field={field} record={record} shown={asShown(field)} value={value} ctx={ctx} />
    ) : (
      <Cell field={asShown(field)} value={value} ctx={ctx} values={record.values} />
    );
  };
  // A record with something to check has a dot at the start of its row, which stays when the table scrolls.
  const flag = (record: Record) => {
    const found = problems.get(record.id);
    if (!found) return null;
    const why = found.map((p) => problemText(p, fieldsByKey.get(p.field), record)).join(' ');
    return <span className="flag" title={t('collection.problems', { problems: why })} aria-label={t('collection.problems', { problems: why })} />;
  };
  // A row's menu, from its ··· at its end on the row pointed at, or the right click: Open, the
  // buttons of the rules, faint with why when they may not run now, and Delete.
  const buttons = useMemo(() => actionsOf(collection.rules), [collection.rules]);
  // The view's button on each row that can have it pressed now: +1 on an anime going on (design/more-apps.md 4.8).
  const viewButton = view?.button ? (buttons.find((b) => b.name === view.button) ?? null) : null;
  const rowButton = (record: Record) =>
    viewButton &&
    actionState(collection.rules ?? '', viewButton, computer, dir, record).on && (
      <button type="button" className={viewButton.name === '+1' ? 'rbtn one' : 'rbtn'} onClick={(event) => (event.stopPropagation(), actions.pressButton(dir, record.id, viewButton.name))}>
        {viewButton.name}
      </button>
    );
  // A ring at the start of a row instead, as a list of things to do has it: an activity's Done (View.ring).
  const ringed = !!viewButton && !!view?.ring;
  const ringOf = (record: Record) =>
    actionState(collection.rules ?? '', viewButton!, computer, dir, record).on ? (
      <button type="button" className="lc-tick" title={viewButton!.name} aria-label={`${viewButton!.name} · ${recordTitle(record)}`} onClick={(event) => (event.stopPropagation(), actions.pressButton(dir, record.id, viewButton!.name))} />
    ) : (
      <span className="lc-tick off" aria-hidden="true" />
    );
  // What a row says under its name, and its picture beside it (design/more-apps.md 4.8).
  const lineOf = (record: Record) => {
    if (!schema.line) return null;
    const cover = schema.line.cover ? valueText(record.values[schema.line.cover] ?? null) : '';
    return { sub: valueText(record.values[schema.line.sub] ?? null), cover: /^https?:\/\//.test(cover) ? cover : '' };
  };
  const rowMenu = (event: MouseEvent, record: Record) =>
    actions.menu(
      event,
      [
        { label: t('collection.open'), run: () => openRecord(record.id) },
        ...buttons.map((button, i) => {
          const state = actionState(collection.rules ?? '', button, computer, dir, record);
          return { label: button.name, icon: 'play' as const, run: () => actions.pressButton(dir, record.id, button.name), ...(!state.on && { disabled: state.hint ?? '' }), ...(i === 0 && { apart: true }) };
        }),
        { label: t('menu.delete'), run: () => actions.removeRecord(dir, record), apart: true, danger: true },
      ],
      { icon: 'collection', title: recordTitle(record), sub: collectionName(dir) },
    );
  // The strip's head: each day's weekday, today's last; a box: done ticked, today's ringed, one not
  // the record's day faint; a click ticks a day or takes the tick off, the row's record staying shut.
  const stripHead = stripView && (
    <th key="days-strip" className="dstrip">
      <div className="tc">
        <span className="days">
          {stripDays.map((day) => (
            <i key={day}>{new Date(`${day}T00:00`).toLocaleDateString(locale(), { weekday: 'narrow' })}</i>
          ))}
        </span>
      </div>
    </th>
  );
  // A box is a span that acts as a button: on a phone the row it is in is a button itself.
  const stripBoxes = (record: Record, days: string[]) => (
    <span className="days">
      {days.map((day) => {
        const item = stripItems.get(`${record.id}/${day}`);
        const done = item?.state === 'done' || item?.state === 'skipped';
        const label = new Date(`${day}T00:00`).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
        if (!item) return <i key={day} className={day === today ? 'off now' : 'off'} title={label} />;
        const press = (event: SyntheticEvent) => {
          event.stopPropagation();
          if (done) actions.reopenDay?.(item);
          else if (day <= today) actions.skipDay?.(item);
        };
        return (
          <span
            key={day}
            role="button"
            tabIndex={0}
            className={[done && 'on', day === today && 'now'].filter(Boolean).join(' ') || undefined}
            title={label}
            aria-label={label}
            aria-pressed={done}
            onClick={press}
            onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), press(event))}
          >
            {done && <Icon name="check" />}
          </span>
        );
      })}
    </span>
  );
  const stripCell = (record: Record) =>
    stripView && (
      <td key="days-strip" className="dstrip">
        <div className="tc">{stripBoxes(record, stripDays)}</div>
      </td>
    );
  // A record with several choices is in several groups: its row's key tells them apart. A click
  // on the row opens its record; ▸ at its start opens its lines under it.
  const span = fields.length + 1 + (stripView ? 1 : 0) + (viewButton ? 1 : 0);
  const row = (record: Record, group = '') => (
    <tr
      key={`${group}\u0000${record.id}`}
      className="rec"
      tabIndex={0}
      onClick={() => openRecord(record.id)}
      onContextMenu={(event) => rowMenu(event, record)}
      onKeyDown={(event) => rowKeys(event, () => openRecord(record.id))}
    >
      {fields.map((field, i) => [
        <td key={field.key} className={[cellClass(field, i), lit.on(record.id, field.key) && 'lit'].filter(Boolean).join(' ') || undefined}>
          {i === 0 && linesOn && (
            <button
              type="button"
              className={openedLines.has(record.id) ? 'rlines on' : 'rlines'}
              aria-expanded={openedLines.has(record.id)}
              title={t('collection.lines')}
              aria-label={t('collection.lines')}
              onClick={(event) => (event.stopPropagation(), showLines([record.id], !openedLines.has(record.id)))}
            >
              <Icon name="chevron" />
            </button>
          )}
          {i === 0 && flag(record)}
          <div className="tc" style={boxOf(field)} title={field.key === TITLE.key ? undefined : cutText(asShown(field), fieldValueOf(record, field, schema, today))}>
            {i === 0 && schema.line ? (
              <span className="cline">
                {lineOf(record)!.cover && <img src={lineOf(record)!.cover} alt="" loading="lazy" />}
                <span>
                  {cellOf(record, field)}
                  {lineOf(record)!.sub && <small>{lineOf(record)!.sub}</small>}
                </span>
              </span>
            ) : i === 0 && ringed ? (
              <span className="cline">
                {ringOf(record)}
                {cellOf(record, field)}
              </span>
            ) : (
              cellOf(record, field)
            )}
          </div>
        </td>,
        i === 0 && stripCell(record),
      ])}
      {viewButton && !ringed && <td className="tbtn">{rowButton(record)}</td>}
      <td className="tend">
        <button type="button" className="rmore" title={t('collection.menu')} aria-label={t('collection.menu')} onClick={(event) => (event.stopPropagation(), rowMenu(event, record))}>
          ···
        </button>
      </td>
    </tr>
  );
  // A record's row, and its lines under it when they are open.
  const withLines = (record: Record, group = '') =>
    linesOn && openedLines.has(record.id)
      ? [
          row(record, group),
          <tr key={`${group}\u0000${record.id}\u0000lines`} className="lines">
            <td colSpan={span}>
              <div className="clines">
                {lineBlocks.map(({ block, source }) => (
                  <LinkedTable key={block.collection} block={block} source={source} dir={dir} record={record} today={today} actions={actions} onOpen={(s, r) => setLine({ dir: s.dir, id: r.id })} onAdd={(s, values) => setLine({ dir: s.dir, values })} />
                ))}
              </div>
            </td>
          </tr>,
        ]
      : [row(record, group)];
  const sums = fields.map((f) => columnSums(shown, schema, f.key, today));
  // A view that says its sums over it has no row of them under it.
  const hasSums = !view?.sums && sums.some((v) => v !== null);
  // Money in each record's own currency is summed one currency a line, in the order of its choices.
  const sumText = (field: Field, of: Sum[] | null) => (
    <span className={of && of.length > 1 ? 'num split' : 'num'}>
      {(of ?? [{ value: 0 }]).map((s, j) => (
        <span key={s.currency ?? j}>{formatNumber(s.value, field.format, s.currency)}</span>
      ))}
    </span>
  );
  const sumRow = (of: Record[], label: string, key: string) => (
    <tr key={key} className="sum">
      {fields.map((field, i) => [
        <td key={field.key} className={cellClass(field, i)}>
          {i === 0 ? <span className="ct">{label}</span> : sums[i] !== null ? sumText(field, columnSums(of, schema, field.key, today)) : null}
        </td>,
        i === 0 && stripView && <td key="days-strip" className="dstrip" />,
      ])}
      {viewButton && !ringed && <td className="tbtn" />}
      <td className="tend" />
    </tr>
  );
  // A long plain table shows its first rows and a line for the rest; groups show all of theirs.
  const rows = groups || full || shown.length <= MANY_ROWS ? shown : shown.slice(0, SHOWN_FIRST);
  const toggle = (key: string) => {
    const next = new Set(closed);
    if (!next.delete(key)) next.add(key);
    setToggled({ view: view?.id ?? null, closed: next });
  };

  const phoneRow = (record: Record, group = '') => (
    <button key={`${group}\u0000${record.id}`} type="button" className="prow" onClick={() => openRecord(record.id)}>
      <b>
        {recordTitle(record)}
        {flag(record)}
      </b>
      <small>
        {fields
          .filter((f) => f.type !== 'name' && f.key !== TITLE.key && !isEmpty(fieldValueOf(record, f, schema, today)))
          .slice(0, 3)
          .map((f) => (
            <Cell key={f.key} field={asShown(f)} value={fieldValueOf(record, f, schema, today)} ctx={ctx} values={record.values} />
          ))}
      </small>
    </button>
  );
  const groupHead = (group: RecordGroup) => (
    <button key={`g\u0000${group.key}`} type="button" className={closed.has(group.key) ? 'lsec closed' : 'lsec'} aria-expanded={!closed.has(group.key)} onClick={() => toggle(group.key)}>
      <span className="chev">{closed.has(group.key) ? '▸' : '▾'}</span>
      {group.key === '' ? (
        <span>{t('collection.noValue', { field: groupField?.label ?? '' })}</span>
      ) : groupField?.type === 'select' || groupField?.type === 'multi-select' ? (
        <Chip text={optionName(groupField, group.key, group.records[0]?.values)} color={optionColor(groupField, group.key)} />
      ) : (
        <span>{group.label}</span>
      )}
      <small>{group.records.length}</small>
    </button>
  );
  const empty = noFields ? (
    <p className="cv-empty">{t('collection.noFields')}</p>
  ) : records.length === 0 ? <p className="cv-empty">{t('collection.empty')}</p> : shown.length === 0 ? <p className="cv-empty">{t('collection.noMatch')}</p> : null;
  const more = rows.length < shown.length && (
    <button type="button" className="lmore" onClick={() => setFull(true)}>
      {t('collection.showMore', { count: shown.length - rows.length })}
    </button>
  );
  // The rows in the order the table shows them, for the view's ··· that opens all their lines.
  const inOrder = groups ? groups.flatMap((group) => (closed.has(group.key) ? [] : group.records)) : rows;
  // + Add row opens the new record's window, as Add record does.
  const newRow = !noFields && (
    <tr className="add">
      <td colSpan={span}>
        <button type="button" className="cadd" onClick={() => setOpen({ kind: 'new', values: fresh() })}>
          {t('collection.addRow')}
        </button>
      </td>
    </tr>
  );

  const table = narrow ? (
    <div className="clist">
      {groups ? groups.flatMap((group) => [groupHead(group), ...(closed.has(group.key) ? [] : group.records.map((r) => phoneRow(r, group.key)))]) : rows.map((r) => phoneRow(r))}
      {more}
      {empty}
    </div>
  ) : (
    <div ref={scroller} className={scrolled ? 'blist clist scrolled' : 'blist clist'} onScroll={(event) => setScrolled(event.currentTarget.scrollLeft > 0)}>
      <table className="rtable cview" aria-label={name}>
        <thead>
          <tr>
            {fields.map((field, i) => [head(field, i), i === 0 && stripHead])}
            {viewButton && !ringed && <th className="tbtn" />}
            <th className="tend" />
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.flatMap((group) => [
                <tr key={`g\u0000${group.key}`} className="tgrp">
                  <td colSpan={span}>{groupHead(group)}</td>
                </tr>,
                ...(closed.has(group.key) ? [] : [...group.records.flatMap((r) => withLines(r, group.key)), ...(hasSums ? [sumRow(group.records, t('collection.sum'), `s\u0000${group.key}`)] : [])]),
              ])
            : rows.flatMap((r) => withLines(r))}
          {newRow}
        </tbody>
        {hasSums && shown.length > 0 && <tfoot>{sumRow(shown, groups ? t('collection.all') : t('collection.sum'), 'sum')}</tfoot>}
      </table>
      {more}
      {empty}
    </div>
  );

  const groupOptions: Option[] = [{ value: null, label: t('collection.noGroup'), chip: false }, ...schema.fields.filter((f) => GROUPABLE.includes(asShown(f).type)).map((f) => ({ value: f.key, label: f.label, chip: false }))];
  const columnOptions: Option[] = allFields.slice(1).map((f) => ({ value: f.key, label: f.label, chip: false }));
  const columnsPicked = fields.slice(1).map((f) => f.key);
  // The ticks and choices among the columns, which the table can change where they are.
  const changeOptions: Option[] = fields.filter(changesInTable).map((f) => ({ value: f.key, label: f.label, chip: false }));
  // A record's lines in the view's ··· menu (design/app-home.md 4.2): all open, all shut, and whether the rows have them.
  const linesItems: MenuItem[] =
    !narrow && !calendarView && lineBlocks.length > 0
      ? [
          ...(linesOn
            ? [
                { label: t('collection.linesOpenAll'), run: () => showLines(inOrder.map((r) => r.id), true) },
                { label: t('collection.linesCloseAll'), run: () => onLook({ ...look, opened: [] }) },
              ]
            : []),
          {
            label: t('collection.linesUnder'),
            checked: linesOn,
            run: () => {
              const { lines: _lines, ...rest } = look ?? {};
              onLook(linesOn ? { ...rest, lines: false } : rest);
            },
          },
        ]
      : [];
  const viewMenu = (event: MouseEvent, v: View | null) =>
    actions.menu(event, [
      ...(v?.id === view?.id ? linesItems : []),
      ...(v
        ? [
            { label: t('collection.edit'), run: () => (v.kind === 'calendar' ? setCalendaring({ view: v }) : setFiltering(true)), apart: v.id === view?.id && linesItems.length > 0 },
            { label: t('menu.delete'), run: () => actions.ask(t('delete.view'), t('delete.viewText', { name: quote(v.name) }), () => {
              void actions.changeSchema(dir, (s) => removeView(s, v.id));
              if (look?.view === v.id) pickView(null);
            }, t('delete.action')) },
          ]
        : []),
    ]);

  // The conditions applied: to the view, or to the plain table until it closes; or kept as a new view.
  const applyFilter = (conditions: Condition[]) => {
    if (view) void actions.changeSchema(dir, (s) => putView(s, { ...view, conditions }));
    else setAdHoc(conditions);
    setFiltering(false);
  };
  // + : a table view as the table is now, named in the filter's window; or a calendar's window.
  const addView = (event: MouseEvent) =>
    actions.menu(event, [
      { label: t('calendar.table'), icon: 'collection', run: () => setNewTable(true) },
      { label: t('calendar.calendar'), icon: 'calendar', run: () => setCalendaring({ view: null }), ...(calendarStarts(schema.fields).length === 0 && { disabled: t('calendar.needsDate') }) },
    ]);
  const saveNewTable = (conditions: Condition[], viewName: string) => {
    const table = calendarView ? { conditions: [] as Condition[], sort: sortOf(look?.sort), group: look?.group ?? null, columns: look?.columns ?? null, widths: look?.widths ?? null, edit: look?.edit ?? null } : state;
    const saved: View = { id: crypto.randomUUID(), name: viewName, conditions, sort: table.sort, ...(table.group && { group: table.group }), ...(table.columns && { columns: table.columns }), ...(table.widths && { widths: table.widths }), ...(table.edit && { edit: table.edit }) };
    void actions.changeSchema(dir, (s) => putView(s, saved)).then((failed) => !failed && pickView(saved.id));
    setNewTable(false);
  };
  const saveCalendar = (saved: View) => {
    void actions.changeSchema(dir, (s) => putView(s, saved)).then((failed) => !failed && pickView(saved.id));
    setCalendaring(null);
  };
  const saveFilter = (conditions: Condition[], viewName: string) => {
    const saved: View = view
      ? { ...view, name: viewName, conditions }
      : { id: crypto.randomUUID(), name: viewName, conditions, sort: state.sort, ...(state.group && { group: state.group }), ...(state.columns && { columns: state.columns }), ...(state.widths && { widths: state.widths }), ...(state.edit && { edit: state.edit }) };
    void actions.changeSchema(dir, (s) => putView(s, saved)).then((failed) => !failed && pickView(saved.id));
    setAdHoc([]);
    setFiltering(false);
  };
  const countFor = (conditions: Condition[]) => records.filter((r) => matchesConditions(r, schema, forMe(conditions, me), today)).length;

  if (isPhone()) {
    // A view held: its filter, or Delete.
    const phoneViewMenu = (v: View) =>
      actions.menu(
        NO_POINTER,
        [
          {
            label: t('phone.editFilter'),
            icon: 'filter',
            run: () => {
              pickView(v.id);
              setFiltering(true);
            },
          },
          {
            label: t('menu.delete'),
            icon: 'trash',
            danger: true,
            run: () =>
              actions.ask(t('delete.view'), t('delete.viewText', { name: quote(v.name) }), () => {
                void actions.changeSchema(dir, (s) => removeView(s, v.id));
                if (look?.view === v.id) pickView(null);
              }, t('delete.action')),
          },
        ],
        { icon: 'filter', title: v.name, sub: t('phone.viewOf', { collection: name }) },
      );
    return (
      <section className="bv collection-view mb-cv">
        <PhoneCollectionList
          name={name}
          count={
            view?.sums
              ? viewSumParts(view.sums, records, { fields: schema.fields.map(asShown) }, today).map((p) => p.text).join(' · ')
              : calendarView && nav.range !== 'month'
              ? new Date(`${nav.focus}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' })
              : ownView && !query
                ? t('count.records', { count: shown.length })
                : applied.length > 0 || query
                ? t('phone.matchOf', { count: shown.length, total: records.length })
                : t('count.records', { count: records.length })
          }
          schema={schema}
          today={today}
          fields={fields.slice(1).map(asShown)}
          records={records}
          shown={shown}
          groups={groups}
          groupField={groupField}
          closed={closed}
          filtered={applied.length > 0}
          problems={problems}
          query={query}
          views={setViews ?? views}
          view={view}
          own={ownView && !setViews}
          set={!!setViews}
          chips={
            chipField ? (
              <ViewChips values={viewed.map(chipOf)} order={chipField.options ?? (actions.records(chipField.collection ?? '') ?? []).map((r) => recordTitle(r))} on={chipOn} onPick={(value) => setChip(value && view ? { view: view.id, value } : null)} />
            ) : undefined
          }
          {...(viewButton && { button: rowButton })}
          onToggle={toggle}
          onQuery={setQuery}
          onPickView={(id) => (setViews ? setSetPicked(id) : pickView(id))}
          onViewMenu={phoneViewMenu}
          onViewSheet={() => setViewing(true)}
          onOpen={(record) => (actions.show ? actions.show(dir, record.id) : openRecord(record.id))}
          lines={
            linesOn
              ? {
                  counted: schema.fields.filter((f) => f.rollup?.fn === 'count' && lineBlocks.some(({ source }) => localPath(source.dir) === f.rollup!.from)).map((f) => f.key),
                  count: (record) => lineBlocks.reduce((n, { source }) => n + linkedRecords(source, dir, record).length, 0),
                  view: (record) => (
                    <>
                      {lineBlocks.map(({ block, source }) => (
                        <Fragment key={block.collection}>
                          <PhoneLinkedTab block={block} dir={dir} schema={schema} record={record} today={today} actions={actions} />
                          {linkedRecords(source, dir, record).length > 0 && actions.create && (
                            <button type="button" className="mb-addline" onClick={() => actions.create!(source.dir, linkedValues(source.schema, dir, record, schema))}>
                              {t('collection.addLine')}
                            </button>
                          )}
                        </Fragment>
                      ))}
                    </>
                  ),
                }
              : undefined
          }
          onAdd={() => {
            // On a calendar, a new record starts on the day shown.
            const values = calendarView ? startingValues(schema, calendarView.calendar!, nav.focus, null) : fresh();
            if (actions.create) actions.create(dir, values);
            else setOpen({ kind: 'new', values });
          }}
          onFields={() => setDesigning(true)}
          // A habit's last five days on its row, in place of its value on the right.
          {...(stripView && { strip: (record: Record) => stripBoxes(record, stripDays.slice(-5)) })}
          side={
            calendarView && (
              <div className="mb-seg" role="tablist">
                {(['day', 'month'] as const).map((range) => (
                  <button key={range} type="button" role="tab" aria-selected={range === 'month' ? nav.range === 'month' : nav.range !== 'month'} onClick={() => nav.choose(range)}>
                    {t(`calendar.${range}`)}
                  </button>
                ))}
              </div>
            )
          }
          body={
            calendarView && (
              <PhoneCollectionCalendar
                collection={rolled}
                records={matching}
                view={calendarView}
                nav={nav}
                today={today}
                actions={actions}
                onOpen={(id) => (actions.show ? actions.show(dir, id) : openRecord(id))}
              />
            )
          }
        />
        {open?.kind === 'new' && <RecordDialog collection={collection} record={null} values={open.values} today={today} actions={actions} onClose={() => setOpen(null)} />}
        {opened && <RecordDialog key={opened.id} collection={collection} record={opened} today={today} actions={actions} onClose={() => setOpen(null)} />}
        {designing && <FieldsDialog collection={collection} actions={actions} onClose={() => setDesigning(false)} />}
        {viewing && !filtering && (
          <ViewSheet
            viewName={view ? view.name : t('collection.all')}
            all={schema.fields.map(asShown)}
            optional={allFields.slice(1)}
            sort={state.sort}
            group={state.group}
            shown={columnsPicked}
            conditions={applied.length}
            onSort={(sort) => change({ sort })}
            onGroup={(key) => change({ group: key })}
            onShown={(keys) => change({ columns: keys.length === columnOptions.length ? null : keys })}
            onFilter={() => setFiltering(true)}
            onClose={() => setViewing(false)}
          />
        )}
        {filtering && (
          <FilterSheet
            schema={{ ...schema, fields: schema.fields.map(asShown) }}
            first={asShown(fields[1] ?? fields[0]!)}
            conditions={state.conditions}
            total={records.length}
            count={countFor}
            records={actions.records}
            view={view}
            onApply={applyFilter}
            onSave={saveFilter}
            onClose={() => setFiltering(false)}
          />
        )}
      </section>
    );
  }

  return (
    <section className="bv collection-view">
      <header className="th">
        {!embedded && <b>{name}</b>}
        {view?.sums ? (
          <span className="count sums">
            {viewSumParts(view.sums, records, { fields: schema.fields.map(asShown) }, today).map((p, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                <span className={p.warn ? 'warn' : undefined}>{p.text}</span>
              </Fragment>
            ))}
          </span>
        ) : (
          <span className="count">{t('count.records', { count: ownView ? matching.length : records.length })}</span>
        )}
        <label className="search">
          <Icon name="search" />
          <input type="search" spellCheck={false} aria-label={t('collection.search')} placeholder={t('collection.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="button" className="ghost" onClick={() => setDesigning(true)}>
          {t('collection.fields')}
        </button>
        {view?.all && actions.pressAll && matching.length > 0 && (
          <button type="button" className="ghost" onClick={() => actions.pressAll!(dir, matching.map((r) => r.id), view.all!)}>
            {t('run.allOf', { name: view.all })}
          </button>
        )}
        <button type="button" className="add" onClick={() => setOpen({ kind: 'new', values: fresh() })}>
          {t('collection.addRecord')}
        </button>
      </header>
      <div className="cbar">
        {/* A screen that opens on a view is that view: no tabs of the others (Reading's Anime). */}
        {setViews && (
          <span className="views" role="tablist">
            {setViews.map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={view?.id === v.id} onClick={() => setSetPicked(v.id)}>
                {v.name}
              </button>
            ))}
          </span>
        )}
        {!ownView && <span className="views" role="tablist">
          <button type="button" role="tab" aria-selected={!view} onClick={() => pickView(null)}>
            {t('collection.all')}
          </button>
          {/* A calendar kept for Today is not a tab. */}
          {views.filter((v) => !v.hidden || view?.id === v.id).map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view?.id === v.id} onClick={() => pickView(v.id)} onContextMenu={(event) => viewMenu(event, v)}>
              {v.kind === 'calendar' && <Icon name="calendar" />}
              {v.name}
            </button>
          ))}
          <button type="button" className="add-view" title={t('calendar.addView')} aria-label={t('calendar.addView')} onClick={addView}>
            <Icon name="plus" />
          </button>
        </span>}
        {/* With no fields there is nothing to filter, group or show as a column. */}
        <span className="tools" hidden={noFields}>
          {calendarView && <CalendarNav nav={nav} today={today} />}
          <button type="button" className={applied.length > 0 ? 'ghost on' : 'ghost'} onClick={() => setFiltering(true)}>
            {applied.length > 0 ? t('collection.filterCount', { count: applied.length }) : t('collection.filter')}
          </button>
          {!calendarView && <Picker
            className={state.group ? 'ghost on' : 'ghost'}
            options={groupOptions}
            value={state.group}
            label={t('collection.group')}
            text={state.group ? t('collection.groupBy', { field: groupField?.label ?? state.group }) : t('collection.group')}
            onPick={(key) => change({ group: key })}
          />}
          {!narrow && !calendarView && (
            <ColumnsPicker
              options={columnOptions}
              picked={columnsPicked}
              changeable={changeOptions}
              changed={[...changes]}
              sized={!!state.widths}
              onChange={(keys) => change({ columns: keys.length === columnOptions.length ? null : keys })}
              onChanged={(keys) => change({ edit: keys.length > 0 ? keys : null })}
              onFit={() => change({ widths: null })}
            />
          )}
          {(view || linesItems.length > 0) && (
            <button type="button" className="more" title={t('collection.viewMenu')} aria-label={t('collection.viewMenu')} onClick={(event) => viewMenu(event, view)}>
              ···
            </button>
          )}
        </span>
      </div>
      {view?.counts && (() => {
        const field = schema.fields.find((f) => f.key === view.counts && f.steps);
        return field ? <StepStrip counts={stepCounts(field, collection.records)} /> : null;
      })()}
      {chipField && (
        <ViewChips
          values={viewed.map(chipOf)}
          order={chipField.options ?? (actions.records(chipField.collection ?? '') ?? []).map((r) => recordTitle(r))}
          on={chipOn}
          onPick={(value) => setChip(value && view ? { view: view.id, value } : null)}
        />
      )}
      {calendarView ? (
        <CollectionCalendar
          collection={rolled}
          records={matching}
          view={calendarView}
          nav={nav}
          today={today}
          actions={actions}
          onOpen={(id) => setOpen({ kind: 'record', id })}
          onNew={(values) => setOpen({ kind: 'new', values })}
        />
      ) : view?.kind === 'sheet' && view.sheet ? (
        <Sheet collection={rolled} records={matching} view={view} today={today} actions={actions} onOpen={(id) => setOpen({ kind: 'record', id })} />
      ) : (
        table
      )}
      {open?.kind === 'new' && <RecordDialog collection={collection} record={null} values={open.values} today={today} actions={actions} onClose={() => setOpen(null)} />}
      {opened && <RecordDialog key={opened.id} collection={collection} record={opened} today={today} actions={actions} onClose={() => setOpen(null)} />}
      {lineCollection && line && (lineRecord || 'values' in line) && (
        <RecordDialog key={lineRecord?.id ?? `new:${line.dir}`} collection={lineCollection} record={lineRecord} values={'values' in line ? line.values : undefined} parent={dir} today={today} actions={actions} onClose={() => setLine(null)} />
      )}
      {designing && <FieldsDialog collection={collection} actions={actions} onClose={() => setDesigning(false)} />}
      {calendaring && (
        <CalendarViewDialog schema={schema} view={calendaring.view} showAs={asShown} records={actions.records} count={countFor} onSave={saveCalendar} onClose={() => setCalendaring(null)} />
      )}
      {newTable && (
        <FilterDialog
          schema={schema}
          first={fields[1] ?? fields[0]!}
          conditions={calendarView ? [] : state.conditions}
          count={countFor}
          records={actions.records}
          showAs={asShown}
          view={null}
          naming
          onApply={() => setNewTable(false)}
          onSave={saveNewTable}
          onClose={() => setNewTable(false)}
        />
      )}
      {filtering && (
        <FilterDialog
          schema={schema}
          first={fields[1] ?? fields[0]!}
          conditions={state.conditions}
          count={countFor}
          records={actions.records}
          showAs={asShown}
          view={view}
          onApply={applyFilter}
          onSave={saveFilter}
          onClose={() => setFiltering(false)}
        />
      )}
    </section>
  );
}

/**
 * Which fields the table shows as columns: a list with a tick on each shown; the name is always
 * there. Under them, the ticks and choices among them the table changes where they are, none
 * unless ticked. Once a column was dragged wider or narrower, the list ends with a way back to
 * columns as wide as their values.
 */
function ColumnsPicker({ options, picked, changeable, changed, sized, onChange, onChanged, onFit }: {
  options: Option[];
  picked: string[];
  changeable: Option[];
  changed: string[];
  sized: boolean;
  onChange: (picked: string[]) => void;
  onChanged: (changed: string[]) => void;
  onFit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const all: Option[] = [
    ...options,
    ...changeable.map((o, i) => ({ ...o, value: CHANGE + o.value, ...(i === 0 && { apart: true, head: t('collection.changedInTable') }) })),
    ...(sized ? [{ value: FIT, label: t('collection.fitWidth'), chip: false, apart: true }] : []),
  ];
  return (
    <>
      <button ref={box} type="button" className="ghost" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(event) => open && LIST_KEYS.includes(event.key) && keys.current?.(event)}>
        {t('collection.columns')}
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={all}
          current={[...picked, ...changed.map((k) => CHANGE + k)]}
          label={t('collection.columns')}
          keys={keys}
          onPick={(value) => {
            if (value === FIT) {
              setOpen(false);
              onFit();
            } else if (value?.startsWith(CHANGE)) {
              const key = value.slice(CHANGE.length);
              onChanged(changed.includes(key) ? changed.filter((k) => k !== key) : [...changed, key]);
            } else if (value !== null) onChange(picked.includes(value) ? picked.filter((p) => p !== value) : options.filter((o) => o.value === value || picked.includes(o.value!)).map((o) => o.value!));
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** What the delete question says about a record. */
/** What is said before a record goes to the trash, and its lines with it (design/app-home.md 4.2). */
export const recordDeleteText = (record: Record, lines = 0) =>
  lines > 0 ? t('delete.recordWithLines', { name: quote(recordTitle(record)), count: lines }) : t('delete.recordText', { name: quote(recordTitle(record)) });
