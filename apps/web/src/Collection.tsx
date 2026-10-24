import {
  type Board,
  boardName,
  calendarRecords,
  calendarStarts,
  startingValues,
  boardsLinkingTo,
  cardValue,
  type ChoiceRenames,
  type Collection,
  type CollectionLook,
  collectionOf,
  type ColumnWidths,
  type Computer,
  computerFor,
  actionsOf,
  actionState,
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
  sortRecords,
  type Subtask,
  TODAY,
  unplacedFields,
  valueText,
  timeOf,
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
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CardPanel, type CardPanelActions } from './CardPanel';
import { CalendarNav, CalendarViewDialog, calendarStatus, CollectionCalendar, firstRange, PhoneCollectionCalendar, useCalendarNav } from './CollectionCalendar';
import { boxKeys, Chip, choiceOptions, LIST_KEYS, MultiPicker, type Option, OptionList, Picker, useEscape } from './choices';
import { fieldChoices, LabelsField } from './labels';
import { FieldsDialog } from './Fields';
import { CellEditor, useGrid } from './Grid';
import { isPhone, onPage } from './device';
import type { MenuHead, MenuItem } from './dialogs';
import { AttachButton } from './Description';
import { Icon } from './Icon';
import type { FormSave, StopNote } from './session';
import { collectionLabel } from './items';
import { useNarrow } from './narrow';
import { FilterSheet, PhoneCollectionList, ViewSheet } from './PhoneCollection';
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
  /** Writes values a calendar moved or stretched a record to, saying so with `text` and Undo. */
  moveRecord: (dir: string, id: string, values: Record['values'], text: string) => void;
  /** Asks first, then moves the record's file to the trash. */
  removeRecord: (dir: string, record: Record) => void;
  /** Runs a button of the collection's rules on a record as it is written: asks first when it says so; says what it did, with Undo, or where it stopped. */
  pressButton: (dir: string, id: string, name: string) => void;
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

// ---------- column widths ----------

/**
 * How wide a column is, by its field's type, in pixels: the narrowest it is made to fit the
 * window, and the width it has when there is room; the name is widest, the code narrow.
 */
const WIDTHS: { [type in Field['type']]: [number, number] } = {
  text: [100, 160],
  number: [76, 110],
  date: [92, 136],
  time: [64, 80],
  select: [92, 132],
  'multi-select': [110, 176],
  checkbox: [56, 80],
  url: [120, 184],
  email: [130, 200],
  phone: [104, 140],
  person: [84, 124],
  link: [120, 184],
  formula: [76, 110],
  lookup: [100, 160],
  rollup: [92, 120],
  name: [160, 240],
  code: [80, 112],
};
/** A column dragged narrower than this stops there. */
const MIN_WIDTH = 56;
/** The room between two columns. */
const GAP = 12;
/** The room left and right of the rows, inside the table's scrolling box; the first and last cells pad their text by as much again. */
const SIDES = 8;
/** How much a column other than the first grows to fill a wide window: half its width again at most. */
const GROW = 0.5;

/** A day with its time is wider: the day and the clock, or the boxes of both while it is typed. */
const DATE_TIME: [number, number] = [180, 244];

const widthsOf = (field: Field) => (field.type === 'date' && field.time ? DATE_TIME : WIDTHS[field.type]);

/**
 * The widths of the columns. Ones dragged keep the width they were left at, the others have
 * theirs. With none dragged they fill `room`: in a wide window every other column grows by up to
 * half again and the first takes what is left; in a narrow one they all give up the same share of
 * what they can give, down to the narrowest each is made; only below that does the table scroll.
 */
function columnWidths(fields: Field[], saved: ColumnWidths | undefined, room: number): number[] {
  if (saved) return fields.map((f) => saved[f.key] ?? widthsOf(f)[1]);
  const least = fields.map((f) => widthsOf(f)[0]);
  const base = fields.map((f) => widthsOf(f)[1]);
  const total = (widths: number[], from = 0) => widths.reduce((sum, w, i) => (i < from ? sum : sum + w), 0);
  let widths: number[];
  if (room >= total(base)) {
    const others = total(base, 1);
    const grow = others > 0 ? Math.min(room - total(base), others * GROW) / others : 0;
    widths = base.map((w, i) => (i === 0 ? w : Math.floor(w * (1 + grow))));
  } else if (room > total(least)) {
    const share = (room - total(least)) / (total(base) - total(least));
    widths = base.map((w, i) => Math.floor(least[i]! + (w - least[i]!) * share));
  } else return least;
  // The first column takes what is left, the rounding of the others too.
  widths[0] = room - total(widths, 1);
  return widths;
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
  /** What the other records, or the board's other cards, hold in a multi-select: offered beside its choices. */
  used?: (field: Field) => string[];
}

/** The words a multi-select holds across records or cards, those held most first. */
export function usedValues(values: unknown[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) if (Array.isArray(value)) for (const each of value) if (typeof each === 'string' && each.trim()) counts.set(each, (counts.get(each) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word]) => word);
}

const isAddress = (type: Field['type']) => type === 'url' || type === 'email' || type === 'phone';

/** A value as the table shows it: text, a chip for a choice, chips for choices, a tick for a flag, an address to open. */
export function Cell({ field, value, ctx, values }: {
  field: Field;
  value: FieldValue | undefined;
  ctx: ValueContext;
  /** The record's values, for a number whose currency is one of its fields. */
  values?: Record['values'];
}) {
  if (isEmpty(value)) return <span className="empty">–</span>;
  if (field.type === 'select') return <Chip text={valueText(value)} color={optionColor(field, valueText(value))} />;
  if (field.type === 'multi-select') {
    return (
      <span className="lbls">
        {(value as string[]).map((item) => (
          <Chip key={item} text={item} color={optionColor(field, item)} />
        ))}
      </span>
    );
  }
  if (field.type === 'checkbox') return <span className="tick">{value ? '✓' : ''}</span>;
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
  if (typeof value === 'number') return <span className="num">{formatNumber(value, field.format, currencyOf(field.format, values))}</span>;
  // A day with its time shows its clock after it; one with no time, where the field has one, all day.
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
function SelectField({ field, value, onChange }: { field: Field; value: string | null; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const options: Option[] = [
    { value: null, label: t('collection.none'), chip: false },
    ...choiceOptions(field, field.options ?? []),
    // A value the options do not have, as another tool or an older schema wrote it, stays choosable.
    ...(value && !field.options?.includes(value) ? choiceOptions(field, [value]) : []),
  ];
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
        <span className="nm">{value ? <Chip text={value} color={optionColor(field, value)} /> : <span className="none">{t('collection.none')}</span>}</span>
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

/**
 * A link's box: the record it points at as a chip (several, when the field holds many), and a line
 * to find another by name or code in the collection the field points at; the list under it shows
 * what matches. A link whose record is gone keeps showing the name it had, marked as deleted.
 */
function LinkField({ field, value, ctx, onChange }: {
  field: Field;
  value: Link | Link[] | null;
  ctx: ValueContext;
  onChange: (value: Link | Link[] | null) => void;
}) {
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const links = (Array.isArray(value) ? value : value ? [value] : []).filter(isLink);
  // Its records show by their name or code; a collection with neither has nothing to pick by.
  const into = field.collection ? ctx.collection(field.collection) : null;
  const linkable = !into || isLinkable(into.schema);
  const target = field.collection && linkable ? ctx.records(field.collection) : null;
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
  switch (field.type) {
    case 'link':
      return <LinkField field={field} value={isLink(value) || Array.isArray(value) ? (value as Link | Link[]) : null} ctx={ctx} onChange={onChange} />;
    case 'select':
      return <SelectField field={field} value={typeof value === 'string' && value ? value : null} onChange={onChange} />;
    case 'multi-select':
      return <ChoicesField id={id} field={field} value={Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []} used={ctx.used?.(field) ?? []} onChange={onChange} />;
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
      if (field.time) return <DateTimeBox id={id} label={field.label} value={typeof value === 'string' && value ? value : null} autoFocus={autoFocus} onChange={onChange} />;
      return <input id={id} type="date" autoFocus={autoFocus} aria-label={field.label} value={typeof value === 'string' ? value.slice(0, 10) : ''} onChange={(event) => onChange(event.target.value || null)} />;
    case 'time':
      return <input id={id} type="time" autoFocus={autoFocus} aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || null)} />;
    default: {
      const text = valueText(value);
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
export function NotesBlock({ home, text, editor, attach, onChange }: {
  home: string;
  text: string;
  editor: CollectionActions['editor'];
  attach: CollectionActions['attach'];
  onChange: (text: string) => void;
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
      <div className={text ? 'rm-notes' : 'rm-notes empty'} data-hint={t('collection.notesHint')} onClick={() => made.current?.view.focus()}>
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
function LinkedRecords({ block, dir, record, today, actions, drafts, onOpen, onAdd }: {
  block: LinkedBlock;
  /** The collection of the record on screen. */
  dir: string;
  record: Record;
  today: string;
  actions: CollectionActions;
  /** In a form whose rules add rows as it is typed in: those rows, not written yet. */
  drafts?: LinkedDrafts;
  onOpen: (source: Collection, record: Record) => void;
  onAdd: (source: Collection) => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const making = useRef(false);
  const source = actions.collection(block.collection);
  const name = collectionName(block.collection);
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink };
  const head = (count: number | null) => (
    <div className="blk-h">
      <span>{name}</span>
      {count !== null && <small>{count}</small>}
      {source && (
        <button type="button" className="addl" onClick={() => onAdd(source)}>
          {t('collection.addOne', { singular: singularOf(source.schema) })}
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
  if (block.style === 'table') return <LinkedTable block={block} source={source} dir={dir} record={record} today={today} actions={actions} drafts={drafts} onOpen={onOpen} />;
  // The linked records with what is worked out among their values, and their fields as those show.
  const computer = computerFor(source, actions.collections(), actions.boards(), today);
  const shownAs = computer.shown(source.dir);
  const records = linkedRecords(source, dir, record).map((r) => ({ ...r, values: computer.values(source.dir, r) }));
  const byKey = (key: string | undefined) => (key ? schema.fields.find((f) => f.key === key) : undefined);
  const day = byKey(block.sort)?.type === 'date' ? byKey(block.sort) : schema.fields.find((f) => f.type === 'date');
  const timeline = block.style ? block.style === 'timeline' : !!day;
  const rows = timeline
    ? sortRecords(records, schema, day ? { key: day.key, dir: 'desc' } : { key: nameField(schema)?.key ?? '', dir: 'asc' }, today)
    : sortRecords(records, schema, { key: block.sort ?? nameField(schema)?.key ?? '', dir: 'asc' }, today);
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

/**
 * The row + Add row opens at the foot of a table, after the slice 3 views of design/mockups.html:
 * a box for each field the table shows, the defaults in them, what is worked out shown faint.
 * Add writes the record (faint while it has no name), Cancel and Esc close the row.
 */
function NewRow({ fields, schema, values, computed, shown, cellClass, ctx, width, error, onChange, onAdd, onCancel }: {
  fields: Field[];
  schema: Schema;
  values: Record['values'];
  /** What is worked out from them. */
  computed: Record['values'];
  shown: (field: Field) => Field;
  cellClass: (field: Field, i: number) => string | undefined;
  ctx: ValueContext;
  /** How wide the line with Add is: as the table shows, so that its buttons stay in sight when the table is wider. */
  width?: number;
  error: string | null;
  onChange: (values: Record['values']) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const named = nameField(schema);
  const nameless = !!named && !valueText(values[named.key] ?? null).trim();
  const first = fields.find((f) => f.key !== TITLE.key && !isComputed(f.type))?.key;
  return (
    <>
      <div
        className="crow new"
        role="row"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          event.stopPropagation();
          onCancel();
        }}
      >
        {fields.map((field, i) => (
          <div key={field.key} role="cell" className={[cellClass(field, i), isComputed(field.type) && 'calc'].filter(Boolean).join(' ') || undefined}>
            {field.key === TITLE.key ? (
              <span className="empty">–</span>
            ) : isComputed(field.type) ? (
              <Cell field={shown(field)} value={computed[field.key]} ctx={ctx} values={computed} />
            ) : (
              <FieldInput
                field={field}
                value={values[field.key] ?? null}
                autoFocus={field.key === first}
                ctx={ctx}
                currency={currencyOf(field.format, values)}
                onChange={(next) => onChange({ ...values, [field.key]: next })}
                onEnter={field.type === 'name' && !nameless ? onAdd : undefined}
              />
            )}
          </div>
        ))}
      </div>
      <div className="cadd-acts" style={width ? { width } : undefined}>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={onCancel}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={nameless} onClick={onAdd}>
          {t('collection.addRowButton')}
        </button>
      </div>
    </>
  );
}

/**
 * A table's + Add row: the values of the row being added, the defaults first; Add writes it and
 * opens the next one at once, with the defaults again (the next number counting the one added).
 */
function useAdding({ computer, dir, schema, given, me, add }: {
  computer: Computer;
  dir: string;
  schema: Schema;
  /** What a new row starts with before the defaults: the links of a linked block. */
  given: () => Record['values'];
  me?: string;
  add: (values: Record['values']) => Promise<string | null>;
}) {
  const [values, setValues] = useState<Record['values'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const again = useRef(false);
  const busy = useRef(false);
  const start = () => {
    setError(null);
    setValues(computer.defaults(dir, given(), me));
  };
  // The record added comes into the collection; the next row counts it.
  useEffect(() => {
    if (!again.current) return;
    again.current = false;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computer]);
  const write = async () => {
    if (!values || busy.current) return;
    const missing = missingFields(values, schema).filter((key) => key !== nameField(schema)?.key);
    if (missing.length > 0) return setError(t('collection.requiredMissing', { fields: missing.map((k) => schema.fields.find((f) => f.key === k)?.label ?? k).join(t('list.separator')) }));
    busy.current = true;
    const failed = await add(values);
    busy.current = false;
    if (failed) return setError(failed);
    again.current = true;
    setValues(null);
  };
  return { values, error, start, write, change: (next: Record['values']) => (setError(null), setValues(next)), cancel: () => setValues(null) };
}

/** The fields a linked table shows when its block names none: the collection's, but the link back here, six at most. */
function linkedColumns(block: LinkedBlock, schema: Schema, dir: string): Field[] {
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));
  const named = nameField(schema);
  const back = new Set(linkFieldsTo(schema, dir).map((f) => f.key));
  const chosen = block.fields ? block.fields.map((k) => byKey.get(k)).filter((f): f is Field => !!f && f.type !== 'name') : schema.fields.filter((f) => f.type !== 'name' && !back.has(f.key)).slice(0, 5);
  return [...(named ? [named] : schema.fields.length > 0 ? [] : [TITLE]), ...chosen];
}

/** The rows a form adds to a linked table as it is typed in (design/gym.md 4.1), not written until Save. */
interface LinkedDrafts {
  /** The rows added to a collection, as records not written yet. */
  rows: (source: Collection) => Record[];
  /** A row typed in. */
  write: (id: string, values: Record['values']) => void;
  /** A row added with + Add row. */
  add: (source: Collection, values: Record['values']) => void;
}

/**
 * Linked records as a table, after the slice 3 views of design/mockups.html: a column for each
 * field the block shows, its cells typed in as the collection's table's are, the sums of its
 * numbers under it when the block says so, and + Add row, which adds one linked to the record.
 * A record opens over this one from the button at the start of its row, or from its name. In
 * groups by one field or two when the block says so (design/gym.md 4.2): each group's heading
 * says what it is and how many, with Untick all where a column ticks, and + Add to it; a second
 * level's heading ticks its rows or unticks them. In a form whose rules add rows as it is typed in,
 * those rows are among the others, typed in and added to as they are, written on Save.
 */
function LinkedTable({ block, source, dir, record, today, actions, drafts, onOpen }: {
  block: LinkedBlock;
  source: Collection;
  dir: string;
  record: Record;
  today: string;
  actions: CollectionActions;
  drafts?: LinkedDrafts;
  onOpen: (source: Collection, record: Record) => void;
}) {
  const { schema } = source;
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink };
  const computer = useMemo(() => computerFor(source, actions.collections(), actions.boards(), today), [source, actions, today]);
  const shownAs = computer.shown(source.dir);
  const asShown = (field: Field) => shownAs.get(field.key) ?? field;
  const columns = linkedColumns(block, schema, dir);
  const unsaved = drafts?.rows(source) ?? [];
  const isDraft = new Set(unsaved.map((r) => r.id));
  const linked = [...linkedRecords(source, dir, record).map((r) => ({ ...r, values: computer.values(source.dir, r) })), ...unsaved.map((r) => ({ ...r, values: computer.draft(source.dir, null, r.values) }))];
  const sorted = sortRecords(linked, schema, { key: block.sort ?? nameField(schema)?.key ?? '', dir: 'asc' }, today);
  const groups = groupLinked(sorted, schema, block.group ?? [], today);
  // The rows in the order they are shown, group by group, for the keyboard to go through.
  const rows = groups.flatMap((g) => (g.groups ? g.groups.flatMap((s) => s.records) : g.records));
  const recordSchema = actions.collection(dir)?.schema;
  // + Add to a group starts the row with the group's value.
  const into = useRef<{ key: string; values: Record['values'] } | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const adding = useAdding({
    computer,
    dir: source.dir,
    schema,
    given: () => ({ ...(recordSchema ? linkedValues(schema, dir, record, recordSchema) : {}), ...(into.current?.values ?? {}) }),
    me: actions.me?.(),
    add: async (values) => {
      if (!drafts) return actions.addRecord(source.dir, { values });
      drafts.add(source, values);
      return null;
    },
  });
  const lit = useLit(source);
  /** A cell typed in: a row not written yet in the form, one written at once. */
  const write = (r: Record, field: Field, value: FieldValue) => {
    if (isDraft.has(r.id)) return drafts!.write(r.id, { [field.key]: value });
    lit.wrote(r.id, field.key, value);
    void actions.updateRecord(source.dir, r.id, { values: { [field.key]: value } }).then((failed) => failed && actions.say?.(failed));
  };
  const grid = useGrid({ rows, fields: columns, open: (r) => !isDraft.has(r.id) && onOpen(source, r), write });
  const numeric = (field: Field) => asShown(field).type === 'number';
  const cellClass = (field: Field, i: number) => [i === 0 && 'c0', numeric(field) && 'r'].filter(Boolean).join(' ') || undefined;
  const widths = columns.map((f) => WIDTHS[asShown(f).type][0]);
  const sums = block.sums ? columns.map((f) => (numeric(f) ? columnSums(rows, schema, f.key, today) : null)) : [];
  // The column that ticks a row off, for a group's Untick all and its rows' tick.
  const tick = columns.find((f) => f.type === 'checkbox');
  const ticked = (r: Record) => r.values[tick!.key] === true;
  const tickAll = (records: Record[], on: boolean) => records.filter((r) => ticked(r) !== on).forEach((r) => write(r, tick!, on));
  const startAdding = (group: { key: string; records: Record[] } | null) => {
    grid.clear();
    const first = block.group?.[0];
    into.current = group && first ? { key: group.key, values: { [first]: group.records[0]?.values[first] ?? null } } : null;
    setAddingTo(group?.key ?? null);
    adding.start();
  };
  const newRow = (
    <NewRow
      fields={columns}
      schema={schema}
      values={adding.values ?? {}}
      computed={computer.draft(source.dir, null, adding.values ?? {})}
      shown={asShown}
      cellClass={cellClass}
      ctx={ctx}
      error={adding.error}
      onChange={adding.change}
      onAdd={() => void adding.write()}
      onCancel={adding.cancel}
    />
  );
  const row = (r: Record) => (
    <div key={r.id} role="row" className={['crow', grid.picked?.id === r.id && 'on', isDraft.has(r.id) && 'draft', tick && !ticked(r) && 'off'].filter(Boolean).join(' ')}>
      {columns.map((field, i) => {
        const c = grid.cell(r, field);
        return (
          <div
            key={field.key}
            role="cell"
            data-cell={c['data-cell']}
            className={[cellClass(field, i), c.picked && 'pk', c.editing && 'ed', isComputed(field.type) && 'calc', field.type === 'name' && !isDraft.has(r.id) && 'opens', lit.on(r.id, field.key) && 'lit'].filter(Boolean).join(' ') || undefined}
            onClick={c.onClick}
            onDoubleClick={c.onDoubleClick}
          >
            {i === 0 && !isDraft.has(r.id) && (
              <button type="button" className="ropen" title={t('collection.openRecord')} aria-label={t('collection.openRecord')} onClick={(event) => (event.stopPropagation(), onOpen(source, r))}>
                <Icon name="open" />
              </button>
            )}
            {c.editing ? (
              <CellEditor field={field} value={r.values[field.key]} typed={grid.editing?.typed} ctx={ctx} onDone={(value, then) => grid.done(r, field, value, then)} />
            ) : field.key === TITLE.key ? (
              <span className="ct name">{recordTitle(r)}</span>
            ) : (
              <Cell field={asShown(field)} value={fieldValueOf(r, field, schema, today)} ctx={ctx} values={r.values} />
            )}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="blk ltable">
      <div className="blk-h">
        <span>{collectionName(block.collection)}</span>
        <small>{tick && rows.length > 0 ? t('collection.tickedOf', { ticked: rows.filter(ticked).length, count: rows.length }) : rows.length}</small>
      </div>
      <div className="ltable-scroll">
        <div ref={grid.box} className="ctable" role="table" aria-label={collectionName(block.collection)} tabIndex={0} onKeyDown={grid.keyDown} style={{ '--grid': [`minmax(${widths[0]}px, 1fr)`, ...widths.slice(1).map((w) => `${w}px`)].join(' ') } as CSSProperties}>
          <div className="crow head" role="row">
            {columns.map((field, i) => (
              <div key={field.key} role="columnheader" className={cellClass(field, i)}>
                <span className="hs">{field.label}</span>
              </div>
            ))}
          </div>
          {groups.map((g) =>
            !block.group?.length ? (
              <Fragment key="all">{g.records.map(row)}</Fragment>
            ) : (
              <Fragment key={g.key || '-'}>
                <div role="row" className="crow grp">
                  <div role="cell" className="gh">
                    <b>{g.label || t('collection.none')}</b>
                    <small>{g.records.length}</small>
                    {tick && g.records.some(ticked) && (
                      <button type="button" className="gall" onClick={() => tickAll(g.records, false)}>
                        {t('collection.untickAll')}
                      </button>
                    )}
                  </div>
                </div>
                {g.groups
                  ? g.groups.map((s) => (
                      <Fragment key={s.key || '-'}>
                        <div role="row" className="crow grp2">
                          <div role="cell" className="gh">
                            {tick && (
                              <button type="button" role="checkbox" aria-checked={s.records.every(ticked)} className={s.records.every(ticked) ? 'gtick on' : 'gtick'} aria-label={s.label} onClick={() => tickAll(s.records, !s.records.every(ticked))}>
                                {s.records.every(ticked) && <Icon name="check" />}
                              </button>
                            )}
                            <b>{s.label || t('collection.none')}</b>
                          </div>
                        </div>
                        {s.records.map(row)}
                      </Fragment>
                    ))
                  : g.records.map(row)}
                {adding.values && addingTo === g.key && newRow}
                {!adding.values && (
                  <button type="button" className="cadd gadd" onClick={() => startAdding(g)}>
                    {t('collection.addTo', { group: g.label || t('collection.none') })}
                  </button>
                )}
              </Fragment>
            ),
          )}
          {adding.values && addingTo === null && newRow}
          {block.sums && rows.length > 0 && (
            <div className="crow sum" role="row">
              {columns.map((field, i) => (
                <div key={field.key} role="cell" className={cellClass(field, i)}>
                  {i === 0 ? (
                    <span className="ct">{t('collection.sum')}</span>
                  ) : sums[i] ? (
                    <span className={sums[i]!.length > 1 ? 'num split' : 'num'}>
                      {sums[i]!.map((s, j) => (
                        <span key={s.currency ?? j}>{formatNumber(s.value, field.format, s.currency)}</span>
                      ))}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {rows.length === 0 && !adding.values && <p className="blk-none">{t('collection.noLinked', { collection: collectionName(block.collection).toLowerCase() })}</p>}
      {!adding.values && !block.group?.length && (
        <button type="button" className="cadd" onClick={() => startAdding(null)}>
          {t('collection.addRow')}
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
 */
function CardsBlock({ dir, record, today, actions, onOpen }: { dir: string; record: Record; today: string; actions: CollectionActions; onOpen: (board: string, id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const boards = actions.boards();
  const found = linkedCards(boards, dir, record);
  const several = boardsLinkingTo(boards, dir).length > 1;
  const about = recordTasks(actions.tasks(), dir, record.id);
  const open = about.filter(({ task }) => !task.done);
  const done = about.filter(({ task }) => task.done).slice(0, DONE_SHOWN);
  const add = () => {
    if (!typed.trim()) return;
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
        <span>{t('collection.cards')}</span>
        <small>{found.length + about.length}</small>
        <button type="button" className="addl" onClick={() => setAdding(true)}>
          {t('collection.addTask')}
        </button>
      </div>
      {found.length === 0 && about.length === 0 && !adding && <p className="blk-none">{t('collection.noCards')}</p>}
      {found.map(({ board: path, card }) => {
        const board = boards[path]!;
        const column = board.columns.find((c) => c.id === card.column);
        const value = faceFields(board).find((f) => f.type === 'number');
        const amount = value ? cardValue(board, card, value) : null;
        return (
          <button key={`${path}#${card.id}`} type="button" className={isFinished(board, card) ? 'lrec done' : 'lrec'} onClick={() => onOpen(path, card.id)}>
            <span className="ln">
              <span className="key">{keyOf(board, card)}</span>
              {card.title}
            </span>
            <span className="meta">
              <span>{several && column ? `${column.name} · ${boardName(path)}` : column?.name}</span>
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
            aria-label={t('collection.taskName')}
            placeholder={t('collection.taskName')}
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
export function recordLayout(schema: Schema, dir: string, isNew: boolean, actions: Pick<CollectionActions, 'collections' | 'boards'>, buttons = false, drafts = false): Layout {
  const own = layoutOf(schema);
  // A new record whose rules add rows as it is typed in (onChange) keeps its tables, to show them before Create.
  if (isNew && drafts) {
    const kept = (item: LayoutItem) => 'field' in item || item.block === 'body' || item.block === 'subtasks' || (item.block === 'linked' && item.style === 'table');
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
type Over = { dir: string; id: string } | { dir: string; values: Record['values'] } | { board: string; card: string };

/**
 * The screen of one record, or of a new one: one form, saved as a whole. A record is drawn from
 * the schema's layout, with the records that link to it where the layout puts them, or under
 * its body when the schema has none. A new one is a narrow form of its fields and its body, since
 * nothing links to it yet.
 */
export function RecordDialog({ collection, record, values, today, actions, onClose }: {
  collection: Collection;
  /** Null for a new record. */
  record: Record | null;
  /** What a new record starts with: the links of the record it is added from. */
  values?: Record['values'];
  today: string;
  actions: CollectionActions;
  onClose: () => void;
}) {
  const { dir, schema } = collection;
  const name = collectionName(dir);
  const fields = useMemo(() => new Map(schema.fields.map((f) => [f.key, f])), [schema]);
  const unplaced = unplacedFields(schema);
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
  const original = useMemo(() => draftOf(record, given), [record, given]);
  const dirty = differs(draft, original) || drafted.length > 0;
  // A form not typed in follows the record as it is written: after one of its buttons, or a change made elsewhere.
  const followed = useRef(original);
  useEffect(() => {
    const before = followed.current;
    followed.current = original;
    setDraft((d) => (differs(d, before) ? d : original));
  }, [original]);
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink, used: (field) => usedValues(collection.records.map((r) => r.values[field.key])) };
  const buttons = useMemo(() => actionsOf(collection.rules), [collection.rules]);

  const layout: Layout = useMemo(() => recordLayout(schema, dir, isNew, actions, buttons.length > 0, watched.length > 0), [schema, isNew, dir, actions, buttons.length, watched.length]);
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
    const mine = new Set(watched.filter((w) => w.field === key).map((w) => w.name));
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
    for (const key of new Set(watched.map((w) => w.field))) if (!isEmpty(given?.[key] ?? null)) setValue(key, given![key]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** The rows the form adds to a linked table, not written until Save; typed in and added to there. */
  const drafts: LinkedDrafts | undefined =
    watched.length > 0
      ? {
          rows: (source) => drafted.flatMap((c) => (c.kind === 'add' && c.dir === localPath(source.dir) ? [recordWith(source, c.id, c.values)] : [])),
          write: (rowId, values) => setDrafted((now) => now.map((c) => (c.kind === 'add' && c.id === rowId ? { ...c, values: { ...c.values, ...values } } : c))),
          add: (source, values) => setDrafted((now) => [...now, { kind: 'add', dir: localPath(source.dir), id: newRecordId(), values }]),
        }
      : undefined;

  const named = nameField(schema);
  /** Writes the form; false when it cannot be, saying why. */
  const write = async (): Promise<boolean> => {
    if (busy.current) return false;
    const missing = missingFields(draft.values, schema);
    if (missing.length > 0) {
      const labels = missing.filter((k) => k !== named?.key).map((k) => fields.get(k)?.label ?? k);
      setError(named && missing.includes(named.key) ? t('collection.nameNeeded') : t('collection.requiredMissing', { fields: labels.join(t('list.separator')) }));
      return false;
    }
    busy.current = true;
    const patch = { values: draft.values, body: draft.body, subtasks: draft.subtasks };
    // With onChanges, the form ran them as it was typed in: what they added is written with it, and they do not run again.
    const form: FormSave | undefined = watched.length > 0 ? { id, drafted } : undefined;
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
  // Nothing typed is lost without asking.
  const leave = (then: () => void = onClose) => {
    if (!dirty) return then();
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
  const firstKey = isNew ? layout.columns.flatMap((c) => c.sections.flatMap((s) => s.items)).find((i): i is { field: string } => 'field' in i)?.field : undefined;
  // What is worked out (formulas, lookups, rollups) from what the form holds now; the rollups are the record's, from what links to it.
  const computer = useMemo(() => computerFor(collection, actions.collections(), actions.boards(), today), [collection, actions, today]);
  // What the collection's rules will write in its own fields as it is saved, shown before Save: what
  // is worked out and checked is of the record as it will be.
  const willWrite = useMemo(() => savePreview(collection, record, draft.values, actions, today), [collection, record, draft.values, actions, today]);
  const toBe = willWrite.length > 0 ? { ...draft.values, ...Object.fromEntries(willWrite.map((w) => [w.key, w.value])) } : draft.values;
  const computed = computer.draft(dir, record, toBe);
  const shownAs = computer.shown(dir);
  // What does not fit the schema, as the form holds it now: a record's, not a new one's, which is checked on Create;
  // and the checks of the collection's rules it fails, a new one's too, at their fields or above the form.
  const problems = [...(record ? recordProblems({ values: toBe, extra: record.extra }, schema) : []), ...computer.checks(dir, record, toBe)];
  const recordWide = problems.filter((p) => !p.field || !fields.has(p.field));
  const item = (key: string, index: number): ReactNode => {
    const field = fields.get(key);
    if (!field) return null;
    // What is worked out is shown, not typed.
    const problem = problems.find((p) => p.field === field.key);
    if (isComputed(field.type)) {
      const worked = computed[field.key];
      return (
        <div key={`${key}-${index}`} className={problem ? 'prop bad' : 'prop'}>
          <span className="pl">{field.label}</span>
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
          {field.label}
          {(field.required || field.type === 'name') && <i title={t('collection.required')}>*</i>}
        </label>
        <div className={will ? 'pe will' : 'pe'}>
          <FieldInput
            field={field}
            value={will ? will.value : (draft.values[field.key] ?? null)}
            autoFocus={field.key === firstKey}
            ctx={ctx}
            currency={currencyOf(field.format, draft.values)}
            onChange={(next) => setValue(field.key, next)}
            onEnter={field.type === 'name' ? () => void save() : undefined}
          />
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
  const body = (index: number): ReactNode => (
    <div key={`body-${index}`} className="prop prop-body">
      <span className="pl">{t('collection.body')}</span>
      <NotesBlock home={collection.dir} text={draft.body} editor={actions.editor} attach={actions.attach} onChange={(text) => set({ body: text })} />
    </div>
  );
  const entry = (layoutItem: LayoutItem, index: number): ReactNode => {
    if ('field' in layoutItem) return item(layoutItem.field, index);
    if (layoutItem.block === 'body') return body(index);
    if (layoutItem.block === 'actions') {
      if (!record || buttons.length === 0) return null;
      const now = { ...record, values: draft.values };
      return (
        <div key={`actions-${index}`} className="rm-buttons" role="group" aria-label={t('run.buttons')}>
          {buttons.map((button) => {
            const state = actionState(collection.rules ?? '', button, computer, dir, now);
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
        </div>
      );
    }
    if (layoutItem.block === 'linked' && (record || drafts)) {
      // A new record's table shows what its onChanges add, linked to the id it will have.
      const self = record ?? recordWith(collection, id, draft.values);
      return (
        <LinkedRecords
          key={`linked-${layoutItem.collection}-${index}`}
          block={layoutItem}
          dir={dir}
          record={self}
          today={today}
          actions={actions}
          drafts={drafts}
          onOpen={(source, linked) => setOver({ dir: source.dir, id: linked.id })}
          onAdd={(source) => setOver({ dir: source.dir, values: linkedValues(source.schema, dir, self, schema) })}
        />
      );
    }
    if (layoutItem.block === 'cards' && record) {
      return <CardsBlock key={`cards-${index}`} dir={dir} record={record} today={today} actions={actions} onOpen={(board, card) => setOver({ board, card })} />;
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
          />
        </div>
      );
    }
    return null;
  };
  const columns = layout.columns.map((column, c) => (
    <div key={c} className="rm-col" style={{ flex: column.width ?? 1 }}>
      {column.sections.map((section, s) => (
        <section key={s} className="rm-sec">
          {section.title && <h3>{section.title}</h3>}
          {section.items.map(entry)}
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
  const title = isNew ? (schema.singular ? t('collection.newOne', { singular: schema.singular }) : t('collection.newRecord', { collection: name })) : collectionLabel(dir);

  return (
    <div ref={backdrop} className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && leave()}>
      <section ref={panel} className={layout.columns.length > 1 ? 'rmod wide' : 'rmod'} role="dialog" aria-label={isNew ? title : recordTitle(record)} tabIndex={-1}>
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
          <div className="rm-cols">{columns}</div>
        </div>
        <div className="rm-foot">
          {error ? (
            <p role="alert">{error}</p>
          ) : (
            isNew && (
              <span className="hint">{t('collection.savedIn', { collection: name })}</span>
            )
          )}
          <button type="button" onClick={() => leave()}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="primary" disabled={!isNew && !dirty} onClick={() => void save()}>
            {isNew ? t('collection.create') : t('collection.save')}
          </button>
        </div>
      </section>
      {over && 'board' in over && overBoard && overCard && (
        <CardPanel board={overBoard} path={over.board} card={overCard} today={today} actions={actions.cardActions} escape onClose={() => setOver(null)} />
      )}
      {over && !('board' in over) && overCollection && !overGone && (
        <RecordDialog
          key={'id' in over ? over.id : `new:${'dir' in over ? over.dir : ''}`}
          collection={overCollection}
          record={overRecord}
          values={'values' in over ? over.values : undefined}
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
  /** The columns' widths once one was dragged; null for widths that fit the window. */
  widths: ColumnWidths | null;
}

type TablePatch = Partial<Pick<TableState, 'sort' | 'group' | 'columns' | 'widths'>>;

/** A view or the device's look with a change of the table: a key set to null is taken off. */
function patched<T extends { sort?: RecordSort; group?: string | null; columns?: string[]; widths?: ColumnWidths }>(base: T, patch: TablePatch): T {
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
  return next;
}

/** The value the Columns list gives to fitting the columns to the window again. */
const FIT = '\u0000fit';

/** On a phone, a menu opens from the bottom wherever it was asked for. */
const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

export function CollectionView({ collection, today, look, onLook, actions, onStatus, fieldsAsked }: {
  collection: Collection;
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
  const name = collectionName(dir);
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
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  // Conditions applied without being saved as a view, until the tab closes.
  const [adHoc, setAdHoc] = useState<Condition[]>([]);
  const views = schema.views ?? [];
  // Until a view is chosen on this device, the one the schema opens on.
  const view = views.find((v) => v.id === (look?.view === undefined ? schema.defaultView : look.view)) ?? null;
  const calendarView = view?.kind === 'calendar' ? view : null;
  const nav = useCalendarNav(`${dir}#${view?.id ?? ''}`, calendarView ? firstRange(schema, calendarView) : 'week', today);
  const fieldsByKey = useMemo(() => new Map(schema.fields.map((f) => [f.key, f])), [schema]);
  // Records come by their name, else by the first field; a sort by a field taken out falls back to that too.
  const firstSort: RecordSort = { key: nameField(schema)?.key ?? schema.fields[0]?.key ?? '', dir: 'asc' };
  const sortOf = (sort: RecordSort | undefined) => (sort && fieldsByKey.has(sort.key) ? sort : firstSort);
  const state: TableState = view
    ? { conditions: view.conditions, sort: sortOf(view.sort), group: view.group ?? null, columns: view.columns ?? null, widths: view.widths ?? null }
    : { conditions: adHoc, sort: sortOf(look?.sort), group: look?.group ?? null, columns: look?.columns ?? null, widths: look?.widths ?? null };
  const allFields = useMemo(() => tableFields(collection), [collection]);
  const fields = state.columns ? [allFields[0]!, ...state.columns.map((k) => fieldsByKey.get(k)).filter((f): f is Field => !!f && f.key !== allFields[0]!.key)] : allFields;
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

  const matching = useMemo(
    () => records.filter((r) => matchesConditions(r, schema, state.conditions, today) && matchesQuery(r, schema, query)),
    [records, schema, state.conditions, query, today],
  );
  const shown = useMemo(() => sortRecords(matching, schema, state.sort, today), [matching, schema, state.sort, today]);
  const groups = useMemo(() => (state.group ? groupRecords(shown, schema, state.group, today, shownAs.get(state.group)) : null), [shown, schema, state.group, today, shownAs]);
  const groupField = state.group ? fieldsByKey.get(state.group) : undefined;

  const calendarItems = useMemo(() => (calendarView ? calendarRecords({ ...rolled, records: matching }, { ...calendarView, conditions: [] }, today) : []), [calendarView, rolled, matching, today]);
  useEffect(() => {
    if (calendarView) return onStatus([calendarStatus(calendarItems, nav)]);
    onStatus([
      applied.length > 0 || query ? t('collection.matching', { count: shown.length }) : t('count.records', { count: records.length }),
      ...(problems.size > 0 ? [t('collection.toCheck', { count: problems.size })] : []),
      t('collection.sortedBy', { field: sortField?.label ?? state.sort.key }),
    ]);
  }, [records.length, shown.length, applied.length, query, sortField, state.sort.key, problems.size, calendarView, calendarItems, nav.range, nav.focus]);
  useEffect(() => () => onStatus(null), []);

  const opened = open?.kind === 'record' ? collection.records.find((r) => r.id === open.id) : undefined;
  // The record on screen was deleted, or went with sync: its screen closes.
  useEffect(() => {
    if (open?.kind === 'record' && !opened) setOpen(null);
  }, [open, opened]);

  // The table's width, measured, for columns that fill it; and whether it is scrolled sideways,
  // for the line beside the name that stays.
  const scroller = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const measure = () => setSpace(box.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [narrow]);
  const room = space - 2 * SIDES - GAP * (fields.length - 1);
  // A column being dragged wider or narrower: the widths of every column as they are while it is.
  const [dragged, setDragged] = useState<number[] | null>(null);
  const widths = dragged ?? columnWidths(fields, state.widths ?? undefined, room);
  const tableWidth = widths.reduce((sum, w) => sum + w, 0) + GAP * (fields.length - 1) + 2 * SIDES;

  // Dragging a column's edge: every column keeps the width it has on screen, this one follows the
  // pointer, and when the pointer lets go the widths are kept as the sort is.
  const resize = (event: PointerEvent<HTMLSpanElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const start = widths;
    const x = event.clientX;
    let latest = start;
    handle.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => {
      const width = Math.max(MIN_WIDTH, Math.round(start[index]! + onPage(e.clientX - x)));
      latest = start.map((w, i) => (i === index ? width : w));
      setDragged(latest);
    };
    const done = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
      setDragged(null);
      if (latest !== start) change({ widths: Object.fromEntries(fields.map((f, i) => [f.key, latest[i]!])) });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  };
  // A double click on the edge gives the column back the width it starts with.
  const unsize = (key: string) => {
    if (!state.widths || !(key in state.widths)) return;
    const { [key]: _gone, ...rest } = state.widths;
    change({ widths: Object.keys(rest).length > 0 ? rest : null });
  };

  const openRecord = (id: string) => setOpen({ kind: 'record', id });
  // A value typed in a cell is written to its record's file; what goes wrong is said.
  const lit = useLit(collection);
  const writeCell = (record: Record, field: Field, value: FieldValue) => {
    lit.wrote(record.id, field.key, value);
    void actions.updateRecord(dir, record.id, { values: { [field.key]: value } }).then((failed) => failed && actions.say?.(failed));
  };
  const adding = useAdding({ computer, dir, schema, given: () => ({}), me: actions.me?.(), add: (values) => actions.addRecord(dir, { values }) });
  const sortBy = (key: string) => change({ sort: { key, dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc' } });
  const isNumeric = (field: Field) => asShown(field).type === 'number';
  const cellClass = (field: Field, i: number) => [i === 0 && 'c0', isNumeric(field) && 'r'].filter(Boolean).join(' ') || undefined;
  const head = (field: Field, i: number) => {
    const on = state.sort.key === field.key;
    return (
      <div key={field.key} role="columnheader" aria-sort={on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cellClass(field, i)}>
        <button type="button" className={on ? 'hs sorted' : 'hs'} onClick={() => sortBy(field.key)}>
          {field.label}
          {on && (state.sort.dir === 'asc' ? ' ↑' : ' ↓')}
        </button>
        <span className="rz" aria-hidden="true" onPointerDown={(event) => resize(event, i)} onDoubleClick={() => unsize(field.key)} />
      </div>
    );
  };
  const cellOf = (record: Record, field: Field) => {
    if (field.key === TITLE.key) return <span className="ct name">{recordTitle(record)}</span>;
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
  // A row's ···, at its end on the row pointed at or picked: Open, the buttons of the rules, faint
  // with why when they may not run now, and Delete.
  const buttons = useMemo(() => actionsOf(collection.rules), [collection.rules]);
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
  // A record with several choices is in several groups: its row's key tells them apart. A cell is
  // picked and typed in as a sheet's; the record opens from the button at the start of the row,
  // shown on the row pointed at or picked, and from its name.
  const row = (record: Record, group = '') => (
    <div key={`${group}\u0000${record.id}`} role="row" className={grid.picked?.id === record.id ? 'crow on' : 'crow'}>
      {fields.map((field, i) => {
        const c = grid.cell(record, field);
        return (
          <div
            key={field.key}
            role="cell"
            data-cell={c['data-cell']}
            className={[cellClass(field, i), c.picked && 'pk', c.editing && 'ed', isComputed(field.type) && 'calc', field.type === 'name' && 'opens', lit.on(record.id, field.key) && 'lit'].filter(Boolean).join(' ') || undefined}
            onClick={c.onClick}
            onDoubleClick={c.onDoubleClick}
          >
            {i === 0 && (
              <>
                <button type="button" className="ropen" title={t('collection.openRecord')} aria-label={t('collection.openRecord')} onClick={(event) => (event.stopPropagation(), openRecord(record.id))}>
                  <Icon name="open" />
                </button>
                {flag(record)}
              </>
            )}
            {c.editing ? <CellEditor field={field} value={record.values[field.key]} typed={grid.editing?.typed} ctx={ctx} onDone={(value, then) => grid.done(record, field, value, then)} /> : cellOf(record, field)}
          </div>
        );
      })}
      <button type="button" className="rmore" title={t('collection.menu')} aria-label={t('collection.menu')} onClick={(event) => rowMenu(event, record)}>
        ···
      </button>
    </div>
  );
  const sums = fields.map((f) => columnSums(shown, schema, f.key, today));
  const hasSums = sums.some((v) => v !== null);
  // Money in each record's own currency is summed one currency a line, in the order of its choices.
  const sumText = (field: Field, of: Sum[] | null) => (
    <span className={of && of.length > 1 ? 'num split' : 'num'}>
      {(of ?? [{ value: 0 }]).map((s, j) => (
        <span key={s.currency ?? j}>{formatNumber(s.value, field.format, s.currency)}</span>
      ))}
    </span>
  );
  const sumRow = (of: Record[], label: string, key: string) => (
    <div key={key} className="crow sum" role="row">
      {fields.map((field, i) => (
        <div key={field.key} role="cell" className={cellClass(field, i)}>
          {i === 0 ? <span className="ct">{label}</span> : sums[i] !== null ? sumText(field, columnSums(of, schema, field.key, today)) : null}
        </div>
      ))}
    </div>
  );
  // A long plain table shows its first rows and a line for the rest; groups show all of theirs.
  const rows = groups || full || shown.length <= MANY_ROWS ? shown : shown.slice(0, SHOWN_FIRST);
  const toggle = (key: string) =>
    setClosed((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });

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
        <Chip text={group.label} color={optionColor(groupField, group.key)} />
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
  // The rows in the order the table shows them, for the arrows that move the cell picked.
  const inOrder = groups ? groups.flatMap((group) => (closed.has(group.key) ? [] : group.records)) : rows;
  const grid = useGrid({ rows: inOrder, fields, open: (record) => openRecord(record.id), write: writeCell });
  const newRow = adding.values ? (
    <NewRow
      fields={fields}
      schema={schema}
      values={adding.values}
      computed={computer.draft(dir, null, adding.values)}
      shown={asShown}
      cellClass={cellClass}
      ctx={ctx}
      width={space > 0 ? space - 2 * SIDES : undefined}
      error={adding.error}
      onChange={adding.change}
      onAdd={() => void adding.write()}
      onCancel={adding.cancel}
    />
  ) : (
    !noFields && (
      <button
        type="button"
        className="cadd"
        onClick={() => {
          grid.clear();
          adding.start();
        }}
      >
        {t('collection.addRow')}
      </button>
    )
  );

  const table = narrow ? (
    <div className="clist">
      {groups ? groups.flatMap((group) => [groupHead(group), ...(closed.has(group.key) ? [] : group.records.map((r) => phoneRow(r, group.key)))]) : rows.map((r) => phoneRow(r))}
      {more}
      {empty}
    </div>
  ) : (
    <div ref={scroller} className={scrolled ? 'blist clist scrolled' : 'blist clist'} onScroll={(event) => setScrolled(event.currentTarget.scrollLeft > 0)}>
      <div ref={grid.box} className="ctable" role="table" aria-label={name} tabIndex={0} onKeyDown={grid.keyDown} style={{ '--grid': widths.map((w) => `${w}px`).join(' '), minWidth: tableWidth } as CSSProperties}>
        <div className="crow head" role="row">
          {fields.map(head)}
        </div>
        {groups
          ? groups.flatMap((group) => [
              groupHead(group),
              ...(closed.has(group.key) ? [] : [...group.records.map((r) => row(r, group.key)), ...(hasSums ? [sumRow(group.records, t('collection.sum'), `s\u0000${group.key}`)] : [])]),
            ])
          : rows.map((r) => row(r))}
        {newRow}
        {hasSums && shown.length > 0 && sumRow(shown, groups ? t('collection.all') : t('collection.sum'), 'sum')}
      </div>
      {more}
      {empty}
    </div>
  );

  const groupOptions: Option[] = [{ value: null, label: t('collection.noGroup'), chip: false }, ...schema.fields.filter((f) => GROUPABLE.includes(asShown(f).type)).map((f) => ({ value: f.key, label: f.label, chip: false }))];
  const columnOptions: Option[] = allFields.slice(1).map((f) => ({ value: f.key, label: f.label, chip: false }));
  const columnsPicked = fields.slice(1).map((f) => f.key);
  const viewMenu = (event: MouseEvent, v: View) =>
    actions.menu(event, [
      { label: t('collection.edit'), run: () => (v.kind === 'calendar' ? setCalendaring({ view: v }) : setFiltering(true)) },
      { label: t('menu.delete'), run: () => actions.ask(t('delete.view'), t('delete.viewText', { name: quote(v.name) }), () => {
        void actions.changeSchema(dir, (s) => removeView(s, v.id));
        if (look?.view === v.id) pickView(null);
      }, t('delete.action')) },
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
    const table = calendarView ? { conditions: [] as Condition[], sort: sortOf(look?.sort), group: look?.group ?? null, columns: look?.columns ?? null, widths: look?.widths ?? null } : state;
    const saved: View = { id: crypto.randomUUID(), name: viewName, conditions, sort: table.sort, ...(table.group && { group: table.group }), ...(table.columns && { columns: table.columns }), ...(table.widths && { widths: table.widths }) };
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
      : { id: crypto.randomUUID(), name: viewName, conditions, sort: state.sort, ...(state.group && { group: state.group }), ...(state.columns && { columns: state.columns }), ...(state.widths && { widths: state.widths }) };
    void actions.changeSchema(dir, (s) => putView(s, saved)).then((failed) => !failed && pickView(saved.id));
    setAdHoc([]);
    setFiltering(false);
  };
  const countFor = (conditions: Condition[]) => records.filter((r) => matchesConditions(r, schema, conditions, today)).length;

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
            calendarView && nav.range !== 'month'
              ? new Date(`${nav.focus}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' })
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
          views={views}
          view={view}
          onToggle={toggle}
          onQuery={setQuery}
          onPickView={pickView}
          onViewMenu={phoneViewMenu}
          onViewSheet={() => setViewing(true)}
          onOpen={(record) => (actions.show ? actions.show(dir, record.id) : openRecord(record.id))}
          onAdd={() => {
            // On a calendar, a new record starts on the day shown.
            const values = calendarView ? startingValues(schema, calendarView.calendar!, nav.focus, null) : undefined;
            if (actions.create) actions.create(dir, values);
            else setOpen({ kind: 'new', values });
          }}
          onFields={() => setDesigning(true)}
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
        <b>{name}</b>
        <span className="count">{t('count.records', { count: records.length })}</span>
        <label className="search">
          <Icon name="search" />
          <input type="search" spellCheck={false} aria-label={t('collection.search')} placeholder={t('collection.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="button" className="ghost" onClick={() => setDesigning(true)}>
          {t('collection.fields')}
        </button>
        <button type="button" className="add" onClick={() => setOpen({ kind: 'new' })}>
          {t('collection.addRecord')}
        </button>
      </header>
      <div className="cbar">
        <span className="views" role="tablist">
          <button type="button" role="tab" aria-selected={!view} onClick={() => pickView(null)}>
            {t('collection.all')}
          </button>
          {views.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view?.id === v.id} onClick={() => pickView(v.id)} onContextMenu={(event) => viewMenu(event, v)}>
              {v.kind === 'calendar' && <Icon name="calendar" />}
              {v.name}
            </button>
          ))}
          <button type="button" className="add-view" title={t('calendar.addView')} aria-label={t('calendar.addView')} onClick={addView}>
            <Icon name="plus" />
          </button>
        </span>
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
              sized={!!state.widths}
              onChange={(keys) => change({ columns: keys.length === columnOptions.length ? null : keys })}
              onFit={() => change({ widths: null })}
            />
          )}
          {view && (
            <button type="button" className="more" title={t('collection.viewMenu')} aria-label={t('collection.viewMenu')} onClick={(event) => viewMenu(event, view)}>
              ···
            </button>
          )}
        </span>
      </div>
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
      ) : (
        table
      )}
      {open?.kind === 'new' && <RecordDialog collection={collection} record={null} values={open.values} today={today} actions={actions} onClose={() => setOpen(null)} />}
      {opened && <RecordDialog key={opened.id} collection={collection} record={opened} today={today} actions={actions} onClose={() => setOpen(null)} />}
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
 * there. Once a column was dragged wider or narrower, the list ends with a way back to columns
 * that fit the window.
 */
function ColumnsPicker({ options, picked, sized, onChange, onFit }: {
  options: Option[];
  picked: string[];
  sized: boolean;
  onChange: (picked: string[]) => void;
  onFit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const all: Option[] = sized ? [...options, { value: FIT, label: t('collection.fitWidth'), chip: false, apart: true }] : options;
  return (
    <>
      <button ref={box} type="button" className="ghost" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(event) => open && LIST_KEYS.includes(event.key) && keys.current?.(event)}>
        {t('collection.columns')}
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={all}
          current={picked}
          label={t('collection.columns')}
          keys={keys}
          onPick={(value) => {
            if (value === FIT) {
              setOpen(false);
              onFit();
            } else if (value !== null) onChange(picked.includes(value) ? picked.filter((p) => p !== value) : options.filter((o) => o.value === value || picked.includes(o.value!)).map((o) => o.value!));
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** What the delete question says about a record. */
export const recordDeleteText = (record: Record) => t('delete.recordText', { name: quote(recordTitle(record)) });
