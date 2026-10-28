import {
  boardName,
  boardsLinkingTo,
  cardValue,
  type Collection,
  collectionName,
  collectionOf,
  columnSums,
  currencyOf,
  formatNumber,
  computerFor,
  actionsOf,
  actionState,
  type Change,
  type Condition,
  type ConditionOp,
  faceFields,
  type Field,
  fieldHref,
  type FieldValue,
  fieldValueOf,
  GROUPABLE,
  INBOX_TASKS,
  isComputed,
  isEmpty,
  changesOf,
  hiddenOnForm,
  isFinished,
  isLink,
  keyOf,
  type Link,
  type LinkedBlock,
  linkedCards,
  linkedRecords,
  linkedSort,
  groupLinked,
  linkedValues,
  linesBlocks,
  linkFieldsTo,
  localPath,
  newRecordId,
  recordWith,
  linkTo,
  missingFields,
  nameField,
  numberText,
  opsFor,
  opTakesValue,
  optionColor,
  problemText,
  type Record as Entry,
  recordLabel,
  recordProblems,
  recordTasks,
  recordTitle,
  type RecordGroup,
  type RecordSort,
  type Schema,
  shownOnForm,
  sortRecords,
  type Task,
  templateNamed,
  TODAY,
  unplacedFields,
  valueText,
  type View,
  minutesOf,
  durationTyped,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Chip } from './choices';
import { type CollectionActions, type Draft, differs, draftOf, excerpt, NotesBlock, recordLayout, savePreview, singularOf, usedValues, type ValueContext, withDrafts } from './Collection';
import { fieldChoices, LabelSheet } from './labels';
import { Icon, type IconName } from './Icon';
import { Subtasks } from './Subtasks';
import { DateSheet } from './PhoneTasks';
import { Empty, Sheet, SheetClose } from './sheets';
import { dueClass, dueLabel } from './Tasks';
import { dateLabel, DateTimeSheet, TimeSheet } from './TimeInputs';
import { quote } from './text';

// A collection on a phone, after the Phone collection views of design/mockups.html. The table is a
// list: a record's name and two or three of its fields a row, under a search box and the views as
// chips; the sliders open the view's sort, grouping, filter and the fields the list shows. A record
// is a page: its name and code, buttons for its site, mail and phone, its fields as rows and its
// notes, and what links to it in tabs. A value is changed where it is: text in place, a choice, a
// link, a day or a person in a sheet; once something is changed the bar above has Cancel and Save,
// and the record is saved as one, as on the computer. A new record is one form in a sheet.

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/** On a phone, a menu opens from the bottom wherever it was asked for. */
const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

/** How long a finger rests on something before its menu opens. */
const HOLD_MS = 450;

/** How many finished tasks the cards tab shows, after the open ones. */
const DONE_SHOWN = 5;

/** The buttons an address gives a record's page: its icon and what it says. */
const ADDRESS = {
  url: { icon: 'globe', label: 'phone.website' },
  email: { icon: 'mail', label: 'phone.mail' },
  phone: { icon: 'phone', label: 'phone.call' },
} as const;

const isAddress = (type: Field['type']): type is keyof typeof ADDRESS => type in ADDRESS;
const isNumeric = (field: Field) => field.type === 'number' || field.type === 'formula' || (field.type === 'rollup' && (field.rollup?.fn === 'count' || field.rollup?.fn === 'sum'));
/** A day, or a day with its time, as a date field and a rollup of days hold it. */
const isDay = (value: FieldValue | undefined): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value);
/** What a formula or a rollup works out to, as a row shows it: a number in its field's format, a day, or its text. */
const workedText = (value: FieldValue, today: string, field?: Field, values?: Entry['values']) =>
  typeof value === 'number' ? formatNumber(value, field?.format, currencyOf(field?.format, values)) : isDay(value) ? dateLabel(value, today) : valueText(value);
/** Whether a field holds days: a date, or the latest or earliest of a rollup. */
const holdsDays = (field: Field) => field.type === 'date' || (field.type === 'rollup' && (field.rollup?.fn === 'max' || field.rollup?.fn === 'min'));

/** Whether two values are the same as far as a record's file goes. */
const same = (a: FieldValue | undefined, b: FieldValue | undefined) => (isEmpty(a) && isEmpty(b)) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A finger resting on something: after a moment its menu opens, and the tap that ends it does nothing else. A right click opens it too. */
function useHold() {
  const pressed = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null);
  const letGo = () => {
    const at = pressed.current;
    if (at && !at.fired) {
      window.clearTimeout(at.timer);
      pressed.current = null;
    }
  };
  return (onHold: () => void) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      const at = { x: event.clientX, y: event.clientY, fired: false, timer: 0 };
      at.timer = window.setTimeout(() => {
        at.fired = true;
        onHold();
      }, HOLD_MS);
      pressed.current = at;
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const at = pressed.current;
      if (at && !at.fired && Math.hypot(event.clientX - at.x, event.clientY - at.y) > 8) letGo();
    },
    onPointerUp: letGo,
    onPointerCancel: letGo,
    onClickCapture: (event: MouseEvent) => {
      if (pressed.current?.fired) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressed.current = null;
    },
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      if (!pressed.current?.fired) onHold();
    },
  });
}

// ---------- values ----------

/** A value as a row shows it: a choice as its chip, links by their names, a day as a day, a person with their initial. */
function ShownValue({ field, value, today }: { field: Field; value: FieldValue | undefined; today: string }) {
  if (isEmpty(value)) return null;
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
  if (field.type === 'person') {
    const text = valueText(value);
    return (
      <>
        <span className="mb-who">{text.slice(0, 1).toUpperCase()}</span>
        <span className="tx">{text}</span>
      </>
    );
  }
  if (field.type === 'link') {
    const links = (Array.isArray(value) ? value : [value]).filter(isLink);
    return <span className="tx">{links.map((link) => recordLabel(link)).join(', ')}</span>;
  }
  if (field.type === 'date' && typeof value === 'string') return <span className="tx">{dateLabel(value, today)}</span>;
  if (typeof value === 'number') return <span className="tx">{formatNumber(value, field.format)}</span>;
  return <span className="tx">{valueText(value)}</span>;
}

/** A value in the line under a record's name in the list: a choice as its chip, a tick by its field's name. */
function ListValue({ field, value, today, values }: { field: Field; value: FieldValue | undefined; today: string; values?: Entry['values'] }) {
  if (field.type === 'checkbox') return value === true ? <span>{field.label}</span> : null;
  if (field.type === 'select' || field.type === 'multi-select') return <ShownValue field={field} value={value} today={today} />;
  if (field.type === 'link') return <span>{(Array.isArray(value) ? value : [value]).filter(isLink).map((link) => recordLabel(link)).join(', ')}</span>;
  if (isDay(value)) return <span>{dateLabel(value, today)}</span>;
  if (typeof value === 'number') return <span>{formatNumber(value, field.format, currencyOf(field.format, values))}</span>;
  return <span>{valueText(value ?? null)}</span>;
}

// ---------- a record's fields as rows ----------

/**
 * A number typed in place: what is typed stays as it is typed, the value is kept once it is a
 * number. With a format (`shown`), it shows as the list does until it is typed in.
 */
function NumberBox({ value, label, autoFocus, shown, duration, onChange }: { value: number | null; label: string; autoFocus: boolean; shown?: string; duration?: boolean; onChange: (value: number | null) => void }) {
  // A duration with seconds is typed back in seconds, 90 s.
  const written = (n: number | null) => (n === null ? '' : duration ? durationTyped(n) : String(n));
  const [text, setText] = useState(written(value));
  const [typing, setTyping] = useState(autoFocus);
  // A duration is typed as minutes or as hours and minutes, 1:30.
  const read = (raw: string) => (raw.trim() === '' ? null : duration ? (minutesOf(raw) ?? NaN) : Number(raw.replace(',', '.')));
  useEffect(() => {
    const typed = read(text);
    if (typed !== value) setText(written(value));
    // Only a value changed from outside is written over what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="in r"
      inputMode="decimal"
      enterKeyHint="done"
      aria-label={label}
      value={!typing && shown !== undefined && value !== null ? shown : text}
      autoFocus={autoFocus}
      onFocus={() => setTyping(true)}
      onBlur={() => setTyping(false)}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const typed = read(raw);
        if (typed === null || Number.isFinite(typed)) onChange(typed);
      }}
    />
  );
}

/**
 * A field as a row: its name on the left, its value on the right. Text is typed in place, with a
 * button that opens an address; a choice, a link, a day or a person opens a sheet; a tick is a
 * switch; a formula or a rollup is worked out and only shows. A changed value is marked.
 */
function FieldRow({ field, value, values, worked, changed, bad, autoFocus, today, ctx, onChange, onPick }: {
  field: Field;
  value: FieldValue;
  /** The record's values, for a number in the currency one of them holds. */
  values: Entry['values'];
  /** What a formula or a rollup works out to. */
  worked: FieldValue;
  changed: boolean;
  bad: boolean;
  autoFocus: boolean;
  today: string;
  ctx: ValueContext;
  onChange: (value: FieldValue) => void;
  onPick: () => void;
}) {
  const classes = ['mb-fr', changed && 'changed', bad && 'bad'].filter(Boolean).join(' ');
  const label = (
    <span className="fl">
      {field.label}
      {(field.required || field.type === 'name') && <i className="req">*</i>}
    </span>
  );
  switch (field.type) {
    case 'formula':
    case 'lookup':
    case 'rollup':
      return (
        <div className={classes}>
          {label}
          <span className="val ro">{isEmpty(worked) ? '–' : workedText(worked, today, field, values)}</span>
        </div>
      );
    case 'checkbox':
      return (
        <button type="button" className={classes} role="switch" aria-checked={value === true} onClick={() => onChange(value !== true)}>
          {label}
          <span className={value === true ? 'mb-sw on' : 'mb-sw'} />
        </button>
      );
    case 'select':
    case 'multi-select':
    case 'link':
    case 'date':
    case 'time':
    case 'person': {
      const hint = field.type === 'multi-select' ? t('phone.addValue') : field.type === 'person' ? t('card.unassigned') : field.type === 'date' || field.type === 'time' ? t('phone.none') : t('phone.choose');
      return (
        <button type="button" className={classes} onClick={onPick}>
          {label}
          <span className="val">
            {isEmpty(value) ? <span className="none">{hint}</span> : <ShownValue field={field} value={value} today={today} />}
            <Icon name="chevron" />
          </span>
        </button>
      );
    }
    case 'number':
      return (
        <label className={classes}>
          {label}
          <NumberBox
            value={typeof value === 'number' ? value : null}
            label={field.label}
            autoFocus={autoFocus}
            shown={field.format && typeof value === 'number' ? formatNumber(value, field.format, currencyOf(field.format, values)) : undefined}
            duration={field.format?.style === 'duration'}
            onChange={onChange}
          />
        </label>
      );
    default: {
      const text = valueText(value);
      const href = isAddress(field.type) ? fieldHref(field.type, text) : null;
      const plain = field.type === 'url' || field.type === 'email';
      return (
        <label className={classes}>
          {label}
          <input
            className="in r"
            type={field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
            autoComplete="off"
            autoCapitalize={plain ? 'none' : undefined}
            spellCheck={field.type === 'text' || field.type === 'name'}
            enterKeyHint="done"
            aria-label={field.label}
            placeholder={field.type === 'url' ? 'example.com' : ''}
            value={text}
            autoFocus={autoFocus}
            onChange={(event) => onChange(event.target.value)}
          />
          {href && isAddress(field.type) && (
            <button type="button" className="go2" aria-label={t(ADDRESS[field.type].label)} title={t(ADDRESS[field.type].label)} onClick={() => ctx.openLink(href)}>
              <Icon name={field.type === 'url' ? 'open' : ADDRESS[field.type].icon} />
            </button>
          )}
        </label>
      );
    }
  }
}

/** The rows of a record's fields, in a group; a field whose value is picked in a sheet says so by `onPick`. */
function FieldRows({ schema, fields, values, rollups, original, problems, firstFocus, today, ctx, onChange, onPick }: {
  schema: Schema;
  fields: Field[];
  values: Entry['values'];
  /** What is worked out for the record from what is typed and what links to it: its formulas, lookups and rollups. */
  rollups: Entry['values'];
  /** The values as the file has them, for the changed ones to be marked; null for a new record. */
  original: Entry['values'] | null;
  problems: ReadonlySet<string>;
  /** The field that has the keyboard first. */
  firstFocus?: string;
  today: string;
  ctx: ValueContext;
  onChange: (key: string, value: FieldValue) => void;
  onPick: (field: Field) => void;
}) {
  return (
    <div className="mb-group wide">
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          value={values[field.key] ?? null}
          values={values}
          worked={isComputed(field.type) ? (rollups[field.key] ?? null) : null}
          changed={original !== null && !same(values[field.key], original[field.key])}
          bad={problems.has(field.key)}
          autoFocus={field.key === firstFocus}
          today={today}
          ctx={ctx}
          onChange={(next) => onChange(field.key, next)}
          onPick={() => onPick(field)}
        />
      ))}
    </div>
  );
}

/** A select's choices in a sheet, each as its chip, the one picked ticked; one is picked and the sheet closes. Several choices have the labels' sheet. */
function ChoiceSheet({ field, value, about, onChange, onClose }: { field: Field; value: FieldValue; about: string; onChange: (value: FieldValue) => void; onClose: () => void }) {
  const picked = typeof value === 'string' && value ? value : null;
  // A value the choices do not have, as another tool wrote it, stays there to be taken off.
  const options = [...(field.options ?? []), ...(picked && !field.options?.includes(picked) ? [picked] : [])];
  const pick = (option: string) => {
    onChange(picked === option ? null : option);
    onClose();
  };
  return (
    <Sheet label={field.label} className="mb-create" onClose={onClose}>
      <div className="mb-sh">
        <b>{field.label}</b>
        {about && <small>{about}</small>}
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-form">
        {options.length > 0 && (
          <div className="mb-group">
            {options.map((option) => (
              <button key={option} type="button" className="mb-fr pick" onClick={() => pick(option)}>
                <span className="in">
                  <Chip text={option} color={optionColor(field, option)} />
                </span>
                <Tick on={picked === option} />
              </button>
            ))}
          </div>
        )}
        {options.length === 0 && <p className="mb-hint">{t('phone.noChoices')}</p>}
      </div>
    </Sheet>
  );
}

/**
 * A link's records in a sheet, found by name or code; the one picked is ticked and has Open. One is
 * picked and the sheet closes, None takes it away; of several, each is turned on and off.
 */
export function LinkSheet({ field, value, records, onChange, onOpen, onClose }: {
  field: Field;
  value: FieldValue;
  /** The records of the collection the field points at; null when it is not here. */
  records: Entry[] | null;
  onChange: (value: FieldValue) => void;
  onOpen?: (link: Link) => void;
  onClose: () => void;
}) {
  const many = !!field.many;
  const links = (Array.isArray(value) ? value : value ? [value] : []).filter(isLink);
  const [typed, setTyped] = useState('');
  const q = typed.trim().toLowerCase();
  const found = (records ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)).slice(0, 50);
  const on = (record: Entry) => links.some((link) => link.id === record.id);
  const pick = (record: Entry) => {
    if (many) return onChange(on(record) ? links.filter((link) => link.id !== record.id) : [...links, linkTo(record)]);
    onChange(on(record) ? null : linkTo(record));
    onClose();
  };
  return (
    <Sheet label={field.label} className="mb-create mb-linksheet" onClose={onClose}>
      <div className="mb-sh three">
        {many ? (
          <span />
        ) : (
          <button type="button" className="cancel" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
        )}
        <b>{field.label}</b>
        {many ? (
          <button type="button" className="ok" onClick={onClose}>
            {t('phone.done')}
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="mb-form">
        <label className="mb-search">
          <Icon name="search" />
          <input aria-label={t('collection.pickRecord')} placeholder={t('collection.pickRecord')} enterKeyHint="search" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
        {found.length > 0 && (
          <div className="mb-group">
            {found.map((record) => (
              <div key={record.id} className="mb-fr pick lk">
                <button type="button" className="in" onClick={() => pick(record)}>
                  {recordTitle(record)}
                  {record.name && record.code && <small>{record.code}</small>}
                </button>
                <Tick on={on(record)} />
                {on(record) && onOpen && (
                  <button type="button" className="open" onClick={() => onOpen(linkTo(record))}>
                    {t('phone.open')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!many && links.length > 0 && (
          <div className="mb-group apart">
            <button
              type="button"
              className="mb-fr none"
              onClick={() => {
                onChange(null);
                onClose();
              }}
            >
              {t('collection.none')}
            </button>
          </div>
        )}
        {found.length === 0 && (
          <p className="mb-hint">{records === null ? t('collection.noTarget', { name: field.collection ?? '' }) : q ? t('collection.noMatch') : t('collection.noRecords')}</p>
        )}
      </div>
    </Sheet>
  );
}

/** A line typed in a sheet, for a person or a code; Done keeps it. */
function TextSheet({ label, value, placeholder, onSave, onClose }: { label: string; value: string; placeholder: string; onSave: (value: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    onSave(text.trim());
    onClose();
  };
  return (
    <Sheet label={label} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{label}</b>
        <button type="button" className="ok" onClick={() => save()}>
          {t('phone.done')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group">
          <label className="mb-fr">
            <input className="in" autoFocus enterKeyHint="done" aria-label={label} placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        </div>
      </form>
    </Sheet>
  );
}

/** The sheet a field's value is picked in, by its type. */
function FieldPicker({ field, value, about, today, ctx, onChange, onOpen, onClose }: {
  field: Field;
  value: FieldValue;
  /** What the value is of: the record's name. */
  about: string;
  today: string;
  ctx: ValueContext;
  onChange: (value: FieldValue) => void;
  onOpen?: (link: Link) => void;
  onClose: () => void;
}) {
  // Several choices are picked in the sheet tasks and cards have: the field's choices and what other records hold.
  if (field.type === 'multi-select') {
    return (
      <LabelSheet
        path=""
        title={field.label}
        about={about}
        labels={Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []}
        known={fieldChoices(field, ctx.used?.(field) ?? [])}
        edit={false}
        placeholder={t('collection.findOrAdd')}
        createText={(name) => t('collection.addTagNamed', { name })}
        onCreate={() => undefined}
        onChange={onChange}
        onClose={onClose}
      />
    );
  }
  if (field.type === 'select') return <ChoiceSheet field={field} value={value} about={about} onChange={onChange} onClose={onClose} />;
  if (field.type === 'link') return <LinkSheet field={field} value={value} records={field.collection ? ctx.records(field.collection) : null} onChange={onChange} onOpen={onOpen} onClose={onClose} />;
  if (field.type === 'date' && field.time) return <DateTimeSheet label={field.label} title={about} value={typeof value === 'string' && value ? value : null} today={today} onChange={onChange} onClose={onClose} />;
  if (field.type === 'date') {
    return <DateSheet label={field.label} title={about} current={typeof value === 'string' && value ? value.slice(0, 10) : null} today={today} onPick={(day) => onChange(day)} onClose={onClose} />;
  }
  if (field.type === 'time') return <TimeSheet label={field.label} title={about} value={typeof value === 'string' && value ? value : null} onChange={onChange} onClose={onClose} />;
  return <TextSheet label={field.label} value={valueText(value)} placeholder={field.type === 'person' ? t('card.unassigned') : field.label} onSave={(text) => onChange(text || null)} onClose={onClose} />;
}

/** A record's name, written in place, as tall as it needs. */
function NameBox({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return <textarea ref={box} rows={1} className="mb-rname" aria-label={label} placeholder={label} value={value} onChange={(event) => onChange(event.target.value.replace(/\n/g, ' '))} />;
}

/** The fields a record's form shows, in the layout's order, then the ones it does not place; not those kept off it (Layout.hidden). */
function formFields(schema: Schema, items: { field: string }[]): Field[] {
  const off = hiddenOnForm(schema);
  const keys = [...new Set([...items.map((item) => item.field), ...unplacedFields(schema).map((f) => f.key)])].filter((key) => !off.has(key));
  return keys.map((key) => schema.fields.find((f) => f.key === key)).filter((f): f is Field => !!f);
}

/** What is missing before a record can be written, as the form says it. */
function missingText(schema: Schema, values: Entry['values']): string | null {
  const missing = missingFields(values, schema);
  if (missing.length === 0) return null;
  const named = nameField(schema);
  // A name kept off the form comes from what is on it, an item's from its exercise: what is missing there is said.
  const off = hiddenOnForm(schema);
  if (named && missing.includes(named.key) && !off.has(named.key)) return t('collection.nameNeeded');
  const said = missing.length > 1 ? missing.filter((k) => k !== named?.key) : missing;
  return t('collection.requiredMissing', { fields: said.map((k) => schema.fields.find((f) => f.key === k)?.label ?? k).join(t('list.separator')) });
}

// ---------- a record as a page ----------

/**
 * A record as a page, after the Phone collection views: its name written in place and its code,
 * buttons for its site, mail and phone, then a tab of its fields and notes and a tab for each
 * block of what links to it. What is changed is held until Save in the bar above; Cancel puts it
 * back. Leaving with something changed asks first, through `guards`.
 */
export function PhoneRecordPage({ collection, record, today, actions, guards, onOpenCard }: {
  collection: Collection;
  record: Entry;
  today: string;
  actions: CollectionActions;
  /** How leaving the page asks first while something is changed, by the record. */
  guards: Map<string, (then: () => void) => void>;
  onOpenCard: (board: string, id: string) => void;
}) {
  const { dir, schema } = collection;
  const original = useMemo(() => draftOf(record), [record]);
  const [draft, setDraft] = useState<Draft>(original);
  /** Counts the times the notes start again from the record: after Cancel, or a change from elsewhere. */
  const [resets, setResets] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [picking, setPicking] = useState<Field | null>(null);
  const busy = useRef(false);
  const dirty = differs(draft, original);
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink, used: (field) => usedValues(collection.records.map((r) => r.values[field.key])) };

  // Changed elsewhere, or saved, while nothing is changed here: the page shows the record as it is.
  const dirtyNow = useRef(dirty);
  dirtyNow.current = dirty;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (dirtyNow.current) return;
    setDraft(original);
    setResets((n) => n + 1);
  }, [original]);

  const named = nameField(schema);
  const codeField = schema.fields.find((f) => f.type === 'code');
  const typedName = named ? valueText(draft.values[named.key] ?? null) : '';
  const title = typedName.trim() || recordTitle(record);
  const setValue = (key: string, value: FieldValue) => {
    setError(null);
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: value } }));
  };

  // Leaving with something changed asks first.
  const guardKey = `${dir}\u0000${record.id}`;
  useEffect(() => {
    if (!dirty) {
      guards.delete(guardKey);
      return;
    }
    guards.set(guardKey, (then) => actions.ask(t('collection.discardTitle'), t('collection.discardText', { name: quote(title) }), then, t('collection.discard')));
  });
  useEffect(() => () => void guards.delete(guardKey), [guards, guardKey]);

  const layout = recordLayout(schema, dir, false, actions);
  const items = layout.columns.flatMap((column) => column.sections.flatMap((section) => section.items));
  // What links here, each in a tab; the record's own subtasks are on the first, with its fields.
  const blocks = items.filter((item): item is LinkedBlock | { block: 'cards' } => 'block' in item && (item.block === 'linked' || item.block === 'cards'));
  const hasSubtasks = items.some((item) => 'block' in item && item.block === 'subtasks');
  // What is worked out from what the page holds now; the rollups are the record's, from what links to it.
  const computer = computerFor(collection, actions.collections(), actions.boards(), today);
  // What the collection's rules will write in its own fields as it is saved: shown in their rows, said under them;
  // what is worked out and checked is of the record as it will be.
  const willWrite = savePreview(collection, record, draft.values, actions, today);
  const willValues = willWrite.length > 0 ? { ...draft.values, ...Object.fromEntries(willWrite.map((w) => [w.key, w.value])) } : draft.values;
  const rollups = computer.draft(dir, record, willValues);
  // Not those whose Shown when does not hold as the page is now (design/shown-when.md).
  const rows = formFields(schema, items.filter((item): item is { field: string } => 'field' in item)).filter((f) => f.type !== 'name' && f.type !== 'code' && shownOnForm(f, { values: willValues }, schema, today));
  // What does not fit the schema, and the checks of the collection's rules the record fails as the page holds it.
  const found = [...recordProblems({ values: willValues, extra: record.extra }, schema), ...computer.checks(dir, record, willValues)];
  const problems = new Set(found.map((p) => p.field));
  const problemLines = found.map((p) => problemText(p, schema.fields.find((f) => f.key === p.field), { values: willValues, extra: record.extra }));
  const willLines = [...new Set(willWrite.map((w) => w.by))].map((by) =>
    t('run.willWrite', { name: by, fields: willWrite.filter((w) => w.by === by).map((w) => schema.fields.find((f) => f.key === w.key)?.label ?? w.key).join(t('list.separator')) }),
  );

  // A site, a mail and a phone each give a button under the name.
  const quick = (['url', 'phone', 'email'] as const).flatMap((type) => {
    const field = schema.fields.find((f) => f.type === type && !isEmpty(draft.values[f.key]));
    const href = field ? fieldHref(type, valueText(draft.values[field.key] ?? null)) : null;
    return href ? [{ type, href }] : [];
  });

  const boards = actions.boards();
  const tabOf = (block: LinkedBlock | { block: 'cards' }) => {
    if (block.block === 'cards') return { label: t('phone.cardsTab'), count: linkedCards(boards, dir, record).length + recordTasks(actions.tasks(), dir, record.id).length };
    const source = actions.collection(block.collection);
    return { label: collectionName(block.collection), count: source ? linkedRecords(source, dir, record).length : null };
  };
  const shownBlock = tab > 0 ? blocks[tab - 1] : undefined;
  const source = shownBlock?.block === 'linked' ? actions.collection(shownBlock.collection) : null;

  /** Writes the page; false when it cannot be, saying why. */
  const save = async (): Promise<boolean> => {
    if (busy.current) return false;
    const missing = missingText(schema, draft.values);
    if (missing) {
      setError(missing);
      setTab(0);
      return false;
    }
    busy.current = true;
    setError(null);
    const failed = await actions.updateRecord(dir, record.id, { values: draft.values, body: draft.body, subtasks: draft.subtasks });
    busy.current = false;
    if (failed) setError(failed);
    return !failed;
  };
  // The buttons of the collection's rules, under the name; one runs on the record as it is written, what was typed saved first.
  const buttons = actionsOf(collection.rules);
  const press = async (button: string) => {
    if (dirty && !(await save())) return;
    actions.pressButton(dir, record.id, button);
  };
  const cancel = () => {
    setDraft(original);
    setResets((n) => n + 1);
    setError(null);
  };

  return (
    <div className="mb-rpage">
      {dirty && (
        <div className="mb-nav mb-editbar">
          <button type="button" className="mb-tb plain" onClick={cancel}>
            {t('dialog.cancel')}
          </button>
          <span className="mb-mid">{title}</span>
          <button type="button" className="mb-tb" onMouseDown={(event) => event.preventDefault()} onClick={() => void save()}>
            {t('collection.save')}
          </button>
        </div>
      )}
      <div className="mb-rbody">
        <div className="mb-rhead">
          {named ? <NameBox value={typedName} label={named.label} onChange={(text) => setValue(named.key, text)} /> : <h2>{title}</h2>}
          {codeField && (
            <button type="button" className={isEmpty(draft.values[codeField.key]) ? 'code none' : 'code'} onClick={() => setPicking(codeField)}>
              {valueText(draft.values[codeField.key] ?? null) || codeField.label}
            </button>
          )}
        </div>
        {quick.length > 0 && (
          <div className="mb-qacts">
            {quick.map(({ type, href }) => (
              <button key={type} type="button" className="mb-qact" onClick={() => actions.openLink(href)}>
                <Icon name={ADDRESS[type].icon} />
                {t(ADDRESS[type].label)}
              </button>
            ))}
          </div>
        )}
        {blocks.length > 0 && (
          <div className="mb-ctabs mb-rtabs" role="tablist">
            {[{ label: t('phone.details'), count: null }, ...blocks.map(tabOf)].map((each, i) => (
              <button key={i} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'mb-ct on' : 'mb-ct'} onClick={() => setTab(i)}>
                {each.label}
                {each.count !== null && each.count > 0 && <small>{each.count}</small>}
              </button>
            ))}
          </div>
        )}
        {tab === 0 && (
          <>
            {buttons.length > 0 && (
              <div className="mb-rbuttons" role="group" aria-label={t('run.buttons')}>
                {buttons.map((button) => {
                  const state = actionState(collection.rules ?? '', button, computer, dir, { ...record, values: draft.values });
                  return (
                    <button
                      key={button.name}
                      type="button"
                      className={state.on ? 'mb-rbutton' : 'mb-rbutton off'}
                      aria-disabled={!state.on}
                      onClick={() => (state.on ? void press(button.name) : state.hint && actions.say?.(state.hint))}
                    >
                      {button.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mb-form mb-rform">
              {error && (
                <p className="mb-hint err" role="alert">
                  {error}
                </p>
              )}
              {rows.length > 0 && (
                <FieldRows
                  schema={schema}
                  fields={rows}
                  values={willValues}
                  rollups={rollups}
                  original={original.values}
                  problems={problems}
                  today={today}
                  ctx={ctx}
                  onChange={setValue}
                  onPick={setPicking}
                />
              )}
              {willLines.map((line) => (
                <p key={line} className="mb-hint">
                  {line}
                </p>
              ))}
              {problemLines.length > 0 && <p className="mb-hint err">{problemLines.join(' ')}</p>}
            </div>
            <div className="mb-cap mb-cpad">{t('collection.body')}</div>
            <div className="mb-notes">
              <NotesBlock key={resets} home={collection.dir} text={draft.body} editor={actions.editor} attach={actions.attach} onChange={(body) => setDraft((d) => ({ ...d, body }))} />
            </div>
            {hasSubtasks && (
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
            )}
          </>
        )}
        {shownBlock?.block === 'linked' && <LinkedTab block={shownBlock} dir={dir} schema={schema} record={record} today={today} actions={actions} />}
        {shownBlock?.block === 'cards' && <CardsTab dir={dir} record={record} today={today} actions={actions} onOpenCard={onOpenCard} />}
      </div>
      {source && actions.create && (
        <button type="button" className="mb-fab" aria-label={t('collection.newOne', { singular: singularOf(source.schema) })} title={t('collection.newOne', { singular: singularOf(source.schema) })} onClick={() => actions.create!(source.dir, linkedValues(source.schema, dir, record, schema))}>
          <Icon name="plus" />
        </button>
      )}
      {picking && (
        <FieldPicker
          field={picking}
          value={draft.values[picking.key] ?? null}
          about={title}
          today={today}
          ctx={ctx}
          onChange={(value) => setValue(picking.key, value)}
          onOpen={
            actions.show && picking.collection
              ? (link) => {
                  setPicking(null);
                  actions.show!(picking.collection!, link.id);
                }
              : undefined
          }
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/**
 * The records of another collection that link to this one, as a tab: a timeline shows each with its
 * choice as a chip, who and when, then its name and the first lines of its notes, newest first; a
 * list shows each by its name with a field or two under it. A row opens its record as a page. A
 * collection that is not there is made from here, from the template of its name.
 */
export function LinkedTab({ block, dir, schema: own, record, today, actions, drafts }: {
  block: LinkedBlock;
  dir: string;
  schema: Schema;
  record: Entry;
  today: string;
  actions: CollectionActions;
  /** A new record's rows, not written yet (a workout's items from its program): ticked and opened where the form holds them. */
  drafts?: { rows: Entry[]; tick: (row: Entry, on: boolean) => void; open: (row: Entry) => void };
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const making = useRef(false);
  const source = actions.collection(block.collection);
  const name = collectionName(block.collection);
  if (!source) {
    const folder = collectionOf(block.collection);
    const make = async () => {
      if (making.current) return;
      making.current = true;
      setFailed(await actions.createLinked(dir, block.collection));
      making.current = false;
    };
    return (
      <Empty
        small
        icon="collection"
        title={name}
        text={failed ?? (folder ? t('collection.missing', { name, folder: collectionName(folder) }) : t('collection.missingHere', { name }))}
        action={templateNamed(name) !== null ? { label: t('phone.createNamed', { name }), run: () => void make() } : undefined}
      />
    );
  }
  const { schema } = source;
  const open = (r: Entry) => (drafts ? drafts.open(r) : actions.show?.(source.dir, r.id));
  // The linked records with what is worked out among their values, their fields as those show.
  const computer = computerFor(source, actions.collections(), actions.boards(), today);
  const shownAs = computer.shown(source.dir);
  const records = drafts ? drafts.rows.map((r) => ({ ...r, values: computer.draft(source.dir, null, r.values) })) : linkedRecords(source, dir, record).map((r) => ({ ...r, values: computer.values(source.dir, r) }));
  const byKey = (key: string | undefined) => (key ? schema.fields.find((f) => f.key === key) : undefined);
  const day = byKey(block.sort)?.type === 'date' ? byKey(block.sort) : schema.fields.find((f) => f.type === 'date');
  const timeline = block.style ? block.style === 'timeline' : !!day;
  const rows = timeline
    ? sortRecords(records, schema, day ? { key: day.key, dir: 'desc' } : { key: nameField(schema)?.key ?? '', dir: 'asc' }, today)
    : sortRecords(records, schema, linkedSort(block, schema), today);
  if (rows.length === 0) {
    return (
      <Empty
        small
        icon="collection"
        title={t('collection.noLinked', { collection: name.toLowerCase() })}
        action={actions.create ? { label: t('collection.newOne', { singular: singularOf(schema) }), run: () => actions.create!(source.dir, linkedValues(schema, dir, record, own)) } : undefined}
      />
    );
  }
  if (timeline) {
    const choice = schema.fields.find((f) => f.type === 'select');
    const who = schema.fields.find((f) => f.type === 'person');
    return (
      <div className="mb-rlist">
        {rows.map((r) => {
          const kind = choice && r.values[choice.key];
          const when = day && r.values[day.key];
          const by = who && r.values[who.key];
          const text = excerpt(r.body);
          return (
            <button key={r.id} type="button" className="mb-act" onClick={() => open(r)}>
              <span className="h">
                {typeof kind === 'string' && kind && <Chip text={kind} color={optionColor(choice, kind)} />}
                <b>{recordTitle(r)}</b>
                {typeof by === 'string' && by && <span>· {by}</span>}
                <span className="t">{typeof when === 'string' && when ? dueLabel(when, today) : ''}</span>
              </span>
              {text && <span className="p">{text}</span>}
            </button>
          );
        })}
      </div>
    );
  }
  // A row shows the fields the block names, else the first two filled in, leaving out the link back here.
  const back = new Set(linkFieldsTo(schema, dir).map((f) => f.key));
  const named = block.fields ? block.fields.map(byKey).filter((f): f is Field => !!f) : schema.fields.filter((f) => f.type !== 'name' && f.type !== 'code' && !back.has(f.key));
  // A table is a list here: its first number on the right, summed under it when the block sums.
  const number = block.style === 'table' ? named.find((f) => (shownAs.get(f.key) ?? f).type === 'number') : undefined;
  // A value that says the row's title again, a workout item's exercise, is left out.
  const shown = (r: Entry) =>
    named
      .filter((f) => {
        const value = fieldValueOf(r, f, schema, today);
        return f !== number && f.type !== 'checkbox' && !isEmpty(value) && valueText(value) !== recordTitle(r);
      })
      .slice(0, 2);
  const sums = number && block.sums ? columnSums(rows, schema, number.key, today) : null;
  // A table in groups (design/gym.md 4.2) has a heading over each, and over each of its second.
  const grouped = block.style === 'table' && !!block.group?.length;
  const groups = groupLinked(rows, schema, grouped ? block.group! : [], today);
  const heading = (key: string, label: string, count: number | string | null, sub = false) => (
    <div key={`h-${sub ? 's' : 'g'}-${key}`} className={sub ? 'mb-sec mb-gsub' : 'mb-sec'}>
      {label || t('collection.none')}
      {count !== null && <small>{count}</small>}
    </div>
  );
  // A table that ticks a row off where it is (its block's edit, a workout's items) has its tick at the start of each row.
  const tick = block.style === 'table' ? named.find((f) => f.type === 'checkbox' && block.edit?.includes(f.key)) : undefined;
  const line = (r: Entry) => {
    const amount = number ? fieldValueOf(r, number, schema, today) : undefined;
    const on = tick ? r.values[tick.key] === true : false;
    const row = (
      <button key={r.id} type="button" className={tick && !on ? 'mb-cr off' : 'mb-cr'} onClick={() => open(r)}>
        <span className="tx">
          <b>{recordTitle(r)}</b>
          <small>
            {r.name && r.code && <span className="key">{r.code}</span>}
            {shown(r).map((f) => (
              <ListValue key={f.key} field={shownAs.get(f.key) ?? f} value={fieldValueOf(r, f, schema, today)} today={today} values={r.values} />
            ))}
          </small>
        </span>
        {typeof amount === 'number' && <span className="rt num">{formatNumber(amount, number!.format, currencyOf(number!.format, r.values))}</span>}
      </button>
    );
    if (!tick) return row;
    return (
      <div key={r.id} className="mb-tickrow">
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          aria-label={recordTitle(r)}
          className={on ? 'mb-tick on' : 'mb-tick'}
          onClick={() => (drafts ? drafts.tick(r, !on) : void actions.updateRecord(source.dir, r.id, { values: { [tick.key]: !on } }).then((failed) => failed && actions.say?.(failed)))}
        >
          {on && <Icon name="check" />}
        </button>
        {row}
      </div>
    );
  };
  return (
    <div className="mb-rlist">
      {grouped
        ? groups.flatMap((g) => [heading(g.key, g.label, tick ? t('phone.ofCount', { ticked: g.records.filter((r) => r.values[tick.key] === true).length, count: g.records.length }) : g.records.length), ...(g.groups ? g.groups.flatMap((s) => [heading(`${g.key}-${s.key}`, s.label, null, true), ...s.records.map(line)]) : g.records.map(line))])
        : rows.map(line)}
      {sums && (
        <div className="mb-sumrow">
          {t('phone.sumOf', { field: number!.label.toLowerCase() })}
          <b>{sums.map((s) => formatNumber(s.value, number!.format, s.currency)).join(' · ')}</b>
        </div>
      )}
    </div>
  );
}

/**
 * The cards of every board whose links point at the record, and the tasks about it, as a tab. A
 * card shows its title, its key and column (and board when more than one links here) and its
 * value, and opens as a page; a task is ticked off here. A line at the end adds a task about the
 * record to Inbox.
 */
function CardsTab({ dir, record, today, actions, onOpenCard }: { dir: string; record: Entry; today: string; actions: CollectionActions; onOpenCard: (board: string, id: string) => void }) {
  const [typed, setTyped] = useState('');
  const boards = actions.boards();
  const found = linkedCards(boards, dir, record);
  const several = boardsLinkingTo(boards, dir).length > 1;
  const about = recordTasks(actions.tasks(), dir, record.id);
  const open = about.filter(({ task }) => !task.done);
  const done = about.filter(({ task }) => task.done).slice(0, DONE_SHOWN);
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    actions.addTask(INBOX_TASKS, { title: typed.trim(), record: { collection: dir, id: record.id, name: record.name, ...(record.code && { code: record.code }) } });
    setTyped('');
  };
  const taskRow = ({ list, task }: { list: string; task: Task }) => (
    <div key={`${list}#${task.id}`} className={task.done ? 'mb-crtask done' : 'mb-crtask'}>
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
    <div className="mb-rlist">
      {found.length === 0 && about.length === 0 && <p className="mb-hint mb-rnone">{t('collection.noCards')}</p>}
      {found.map(({ board: path, card }) => {
        const board = boards[path]!;
        const column = board.columns.find((c) => c.id === card.column);
        const value = faceFields(board).find((f) => f.type === 'number');
        const amount = value ? cardValue(board, card, value) : null;
        return (
          <button key={`${path}#${card.id}`} type="button" className={isFinished(board, card) ? 'mb-cr done' : 'mb-cr'} onClick={() => onOpenCard(path, card.id)}>
            <span className="tx">
              <b>{card.title}</b>
              <small>
                <span className="key">{keyOf(board, card)}</span>
                <span>{several && column ? `${column.name} · ${boardName(path)}` : column?.name}</span>
              </small>
            </span>
            {typeof amount === 'number' && <span className="rt num">{formatNumber(amount, value?.format, currencyOf(value?.format, card.values))}</span>}
          </button>
        );
      })}
      {open.map(taskRow)}
      {done.map(taskRow)}
      <form className="mb-crtask new" onSubmit={add}>
        <span className="cb p4" aria-hidden="true" />
        <input enterKeyHint="done" aria-label={t('collection.taskName')} placeholder={t('collection.taskName')} value={typed} onChange={(event) => setTyped(event.target.value)} />
        <button type="submit" className="go" disabled={!typed.trim()}>
          {t('collection.add')}
        </button>
      </form>
    </div>
  );
}

// ---------- a new record ----------

/**
 * A new record as one form in a sheet, after the Phone collection more view: Cancel, its name and
 * Create at the top, its fields as rows, its notes, and where it is saved. `values` is what it
 * starts with: the link back to the record it is added from.
 */
export function PhoneNewRecord({ collection, values, today, actions, onClose }: {
  collection: Collection;
  values?: Entry['values'];
  today: string;
  actions: CollectionActions;
  onClose: () => void;
}) {
  const { dir, schema } = collection;
  // Its lines, an order's or a program's items, are added before Create and written with it (design/app-home.md 4.2),
  // and counted in its rollups before: a new order's total is its new lines'.
  const lineBlocks = useMemo(() => linesBlocks(schema, (path) => actions.collection(path) ?? undefined), [schema, actions]);
  const [newId] = useState(newRecordId);
  const [drafted, setDrafted] = useState<Change[]>([]);
  const linking = useMemo(() => withDrafts(actions.collections(), drafted), [actions, drafted]);
  const computer = computerFor(collection, linking, actions.boards(), today);
  const [line, setLine] = useState<{ source: Collection; block: LinkedBlock; id: string | null; values: Entry['values'] } | null>(null);
  // It starts with the values given (the links of the block it is added from), then its fields' defaults.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const original = useMemo(() => draftOf(null, computer.defaults(dir, values ?? {}, actions.me?.())), [values]);
  const [draft, setDraft] = useState<Draft>(original);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Field | null>(null);
  // A new workout starts at its program, its list open: the field an onChange watches, when it is a choice to pick.
  const from = useMemo(() => changesOf(collection.rules).map((c) => schema.fields.find((f) => f.key === c.field)).find((f): f is Field => !!f && (f.type === 'link' || f.type === 'select')) ?? null, [collection.rules, schema]);
  useEffect(() => {
    if (from && isEmpty(values?.[from.key] ?? null)) setPicking(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const busy = useRef(false);
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink, used: (field) => usedValues(collection.records.map((r) => r.values[field.key])) };
  // The checks of the collection's rules it fails as it is typed: said under the form, the fields marked.
  const checked = computer.checks(dir, recordWith(collection, newId, draft.values), draft.values);
  const layout = recordLayout(schema, dir, true, actions);
  const items = layout.columns.flatMap((column) => column.sections.flatMap((section) => section.items));
  // Nothing links to it yet but its lines: its other rollups have nothing to work out.
  const counted = new Set(lineBlocks.map(({ source }) => localPath(source.dir)));
  // What is worked out shows when it says something: a total of its lines, not an empty or a zero.
  const worked = computer.draft(dir, { id: newId, name: '', path: '' }, draft.values);
  const fields = formFields(schema, items.filter((item): item is { field: string } => 'field' in item)).filter(
    (f) =>
      (f.type !== 'rollup' || counted.has(f.rollup?.from ?? '')) &&
      !(f.type === 'formula' && (isEmpty(worked[f.key] ?? null) || worked[f.key] === 0 || worked[f.key] === false)) &&
      shownOnForm(f, { values: draft.values }, schema, today),
  );
  const title = t('collection.newOne', { singular: singularOf(schema) });
  const typedName = nameField(schema);
  // A field an onChange watches, a workout's program: what it adds comes into the form at once,
  // in the place of what it added before, and the fields it sets are set (design/gym.md 4.1).
  const watched = useMemo(() => changesOf(collection.rules), [collection.rules]);
  const setValue = (key: string, value: FieldValue) => {
    setError(null);
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: value } }));
    const mine = new Set(watched.filter((w) => w.field === key).map((w) => w.name));
    if (mine.size === 0 || !actions.planChange) return;
    const ran = actions.planChange(dir, newId, { ...draft.values, [key]: value }, null, key);
    if (!ran) return;
    setDrafted((now) => [...now.filter((c) => !c.by || !mine.has(c.by)), ...ran.after.changes]);
    const set = Object.keys(ran.set).filter((k) => k !== key);
    if (set.length > 0) setDraft((d) => ({ ...d, values: { ...d.values, ...Object.fromEntries(set.map((k) => [k, ran.values[k] ?? null])) } }));
  };
  // Opened with that field given, a program day's Start, it has what that adds from the start.
  useEffect(() => {
    for (const key of new Set(watched.map((w) => w.field))) if (!isEmpty(values?.[key] ?? null)) setValue(key, values![key]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const create = async () => {
    if (busy.current) return;
    // What its rules write as it is saved, a workout's name, is not missing.
    const will = savePreview(collection, null, draft.values, actions, today);
    const missing = missingText(schema, will.length > 0 ? { ...draft.values, ...Object.fromEntries(will.map((w) => [w.key, w.value])) } : draft.values);
    if (missing) return setError(missing);
    busy.current = true;
    // What its onChanges added is written with it, and they do not run again.
    const failed = await actions.addRecord(dir, { values: draft.values, body: draft.body, subtasks: draft.subtasks }, lineBlocks.length > 0 || watched.length > 0 ? { id: newId, drafted } : undefined);
    busy.current = false;
    if (failed) setError(failed);
    else onClose();
  };
  // Nothing typed is lost without asking.
  const leave = () => {
    if (!differs(draft, original) && drafted.length === 0) return onClose();
    const name = typedName ? valueText(draft.values[typedName.key] ?? null).trim() : '';
    actions.ask(t('collection.discardTitle'), t('collection.discardText', { name: quote(name || t('collection.newRecordShort')) }), onClose, t('collection.discard'));
  };
  const about = (typedName && valueText(draft.values[typedName.key] ?? null).trim()) || title;
  // Its rows come from a field, a workout's from its program: until it is given, its lines say so.
  const pickFirst = from && isEmpty(draft.values[from.key] ?? null) ? from : null;
  return (
    <>
      <Sheet label={title} className="mb-create mb-newrec" onClose={leave}>
        <div className="mb-sh three">
          <button type="button" className="cancel" onClick={leave}>
            {t('dialog.cancel')}
          </button>
          <b>{title}</b>
          <button type="button" className="ok" onMouseDown={(event) => event.preventDefault()} onClick={() => void create()}>
            {t('collection.create')}
          </button>
        </div>
        <div className="mb-form">
          {fields.length > 0 && (
            <FieldRows
              schema={schema}
              fields={fields}
              values={draft.values}
              rollups={computer.draft(dir, { id: newId, name: '', path: '' }, draft.values)}
              original={null}
              problems={new Set(checked.map((p) => p.field))}
              firstFocus={fields.find((f) => f.type !== 'formula' && f.type !== 'checkbox')?.key}
              today={today}
              ctx={ctx}
              onChange={setValue}
              onPick={setPicking}
            />
          )}
          {lineBlocks.map(({ block, source }) => {
            const rows = drafted.flatMap((c) => (c.kind === 'add' && c.dir === localPath(source.dir) ? [c] : []));
            const self = { id: newId, name: typedName ? valueText(draft.values[typedName.key] ?? null) : '', code: '' };
            return (
              <div key={block.collection} className="mb-newlines">
                <div className="mb-cap">
                  {collectionName(block.collection)} <small>{rows.length}</small>
                </div>
                {rows.length === 0 && pickFirst && (
                  <button type="button" className="mb-pickfirst" onClick={() => setPicking(pickFirst)}>
                    <b>{t('collection.pickFirst', { field: pickFirst.label.toLowerCase() })}</b>
                    <span>{t('collection.pickFirstText', { field: pickFirst.label.toLowerCase() })}</span>
                  </button>
                )}
                {/* As a written record's are: in their groups, each with its tick at its start (the Gym mockup's phone). */}
                {rows.length > 0 && (
                  <LinkedTab
                    block={{ ...block, style: 'table' }}
                    dir={dir}
                    schema={schema}
                    record={{ ...self, path: '', values: draft.values, extra: {}, body: '' }}
                    today={today}
                    actions={actions}
                    drafts={{
                      rows: rows.map((c) => recordWith(source, c.id, c.values)),
                      tick: (row, on) => {
                        const key = source.schema.fields.find((f) => f.type === 'checkbox' && block.fields?.includes(f.key))?.key;
                        if (key) setDrafted((now) => now.map((c) => (c.kind === 'add' && c.id === row.id ? { ...c, values: { ...c.values, [key]: on } } : c)));
                      },
                      // Its values as the form holds them, not what is worked out from them.
                      open: (row) => setLine({ source, block, id: row.id, values: rows.find((c) => c.id === row.id)?.values ?? row.values }),
                    }}
                  />
                )}
                <button type="button" className="mb-addline" onClick={() => setLine({ source, block, id: null, values: linkedValues(source.schema, dir, { ...self, path: '', values: draft.values, extra: {}, body: '' }, schema) })}>
                  {t('collection.addLine')}
                </button>
              </div>
            );
          })}
          <div className="mb-cap">{t('collection.body')}</div>
          <div className="mb-notes in-sheet">
            <NotesBlock home={collection.dir} text={draft.body} editor={actions.editor} attach={actions.attach} onChange={(body) => setDraft((d) => ({ ...d, body }))} />
          </div>
          {items.some((item) => 'block' in item && item.block === 'subtasks') && (
            <Subtasks
              list={draft.subtasks}
              change={(change) => setDraft((d) => ({ ...d, subtasks: change(d.subtasks) }))}
              team={actions.cardActions.people?.(dir) ?? null}
              today={today}
              menu={actions.menu}
              place="record"
              inSheet
            />
          )}
          {checked.length > 0 && <p className="mb-hint err">{checked.map((p) => p.message).join(' ')}</p>}
          <p className={error ? 'mb-hint err' : 'mb-hint'} role={error ? 'alert' : undefined}>
            {error ?? t('collection.savedIn', { collection: collectionName(dir) })}
          </p>
        </div>
      </Sheet>
      {picking && (
        <FieldPicker
          field={picking}
          value={draft.values[picking.key] ?? null}
          about={about}
          today={today}
          ctx={ctx}
          onChange={(value) => setValue(picking.key, value)}
          onClose={() => setPicking(null)}
        />
      )}
      {line && (
        <LineSheet
          source={line.source}
          block={line.block}
          dir={dir}
          values={line.values}
          known={line.id !== null}
          today={today}
          actions={actions}
          onDone={(values) => {
            const id = line.id;
            // What the lines' collection runs on save runs here, as on a line added on its own: its product's price.
            const lineId = id ?? newRecordId();
            const saved = actions.planSaved?.(line.source.dir, lineId, values, id ? line.values : null) ?? values;
            setDrafted((now) => (id ? now.map((c) => (c.kind === 'add' && c.id === id ? { ...c, values: saved } : c)) : [...now, { kind: 'add', dir: localPath(line.source.dir), id: lineId, values: saved }]));
            setLine(null);
          }}
          onRemove={() => {
            setDrafted((now) => now.filter((c) => !(c.kind === 'add' && c.id === line.id)));
            setLine(null);
          }}
          onClose={() => setLine(null)}
        />
      )}
    </>
  );
}

/**
 * A line of a new record typed in on a phone (design/app-home.md 4.2): the fields its block shows,
 * its link to the record set and not shown; Add puts it among the record's lines, written with it.
 */
function LineSheet({ source, block, dir, values, known, today, actions, onDone, onRemove, onClose }: {
  source: Collection;
  block: LinkedBlock;
  dir: string;
  values: Entry['values'];
  /** One added before: Done and Remove, not Add. */
  known: boolean;
  today: string;
  actions: CollectionActions;
  onDone: (values: Entry['values']) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { schema } = source;
  const computer = computerFor(source, actions.collections(), actions.boards(), today);
  // A new line starts with its link to the record, then its fields' defaults.
  const [draft, setDraft] = useState(() => (known ? values : computer.defaults(source.dir, values, actions.me?.())));
  const [picking, setPicking] = useState<Field | null>(null);
  const back = new Set(linkFieldsTo(schema, dir).map((f) => f.key));
  const named = nameField(schema);
  const keys = [...(named ? [named.key] : []), ...(block.fields ?? schema.fields.map((f) => f.key))];
  // Not those kept off its window: a workout item's name, which its move gives it.
  const off = hiddenOnForm(schema);
  const fields = [...new Set(keys)].flatMap((key) => schema.fields.filter((f) => f.key === key && !back.has(f.key) && f.type !== 'rollup' && !off.has(f.key)));
  const ctx: ValueContext = { records: actions.records, collection: actions.collection, openLink: actions.openLink, used: (field) => usedValues(source.records.map((r) => r.values[field.key])) };
  const typed = named ? valueText(values[named.key] ?? null) : '';
  const title = known && typed ? typed : t('collection.newOne', { singular: singularOf(schema) });
  return (
    <>
      <Sheet label={title} className="mb-create mb-newrec" onClose={onClose}>
        <div className="mb-sh three">
          <button type="button" className="cancel" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <b>{title}</b>
          <button type="button" className="ok" onMouseDown={(event) => event.preventDefault()} onClick={() => onDone(draft)}>
            {t(known ? 'phone.done' : 'collection.add')}
          </button>
        </div>
        <div className="mb-form">
          <FieldRows
            schema={schema}
            fields={fields}
            values={draft}
            rollups={computer.draft(source.dir, null, draft)}
            original={null}
            problems={new Set()}
            firstFocus={fields[0]?.key}
            today={today}
            ctx={ctx}
            onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
            onPick={setPicking}
          />
          {known && (
            <button type="button" className="mb-removeline" onClick={onRemove}>
              {t('collection.removeLine')}
            </button>
          )}
        </div>
      </Sheet>
      {picking && (
        <FieldPicker
          field={picking}
          value={draft[picking.key] ?? null}
          about={title}
          today={today}
          ctx={ctx}
          onChange={(value) => setDraft((d) => ({ ...d, [picking.key]: value }))}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

// ---------- the list ----------

/**
 * A collection on a phone: its name and how many records, a search box, the views as chips with
 * the sliders that open the view's sheet, and the records a row each: the name, under it two or
 * three of the fields the view shows, on the right its number or its day. Grouped, each group has
 * its head with how many and the number added up. A view held opens its menu.
 */
export function PhoneCollectionList({ name, count, schema, today, fields, records, shown, groups, groupField, closed, filtered, problems, query, views, view, onToggle, onQuery, onPickView, onViewMenu, onViewSheet, onOpen, onAdd, onFields, lines, side, body }: {
  /** Beside the name: a calendar's Day and Month. */
  side?: ReactNode;
  /** In place of the list: a calendar. */
  body?: ReactNode;
  name: string;
  count: string;
  schema: Schema;
  today: string;
  /** The fields the view shows, after the first. */
  fields: Field[];
  records: Entry[];
  shown: Entry[];
  groups: RecordGroup[] | null;
  groupField: Field | undefined;
  closed: ReadonlySet<string>;
  /** Whether conditions or a search narrow the list. */
  filtered: boolean;
  problems: ReadonlyMap<string, unknown>;
  query: string;
  views: View[];
  view: View | null;
  onToggle: (group: string) => void;
  onQuery: (query: string) => void;
  onPickView: (id: string | null) => void;
  onViewMenu: (view: View) => void;
  onViewSheet: () => void;
  onOpen: (record: Entry) => void;
  onAdd: () => void;
  onFields: () => void;
  /** A record's lines (design/app-home.md 4.2): the fields counting them, how many, and the view of them that opens under its row. */
  lines?: { counted: string[]; count: (record: Entry) => number; view: (record: Entry) => ReactNode };
}) {
  const hold = useHold();
  const [openLines, setOpenLines] = useState<ReadonlySet<string>>(() => new Set());
  const toggleLines = (id: string) =>
    setOpenLines((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const noFields = schema.fields.length === 0;
  // A field counting the lines, an order's Lines, is not said again beside the count on the right.
  const sub = fields.filter((f) => f.type !== 'name' && f.type !== 'code' && !lines?.counted.includes(f.key));
  // On the right: the view's first number, else its first day.
  const right = sub.find(isNumeric) ?? sub.find(holdsDays);
  const number = sub.find(isNumeric);
  const row = (record: Entry, group = '') => {
    const value = (field: Field) => fieldValueOf(record, field, schema, today);
    const at = right ? value(right) : null;
    const rest = sub.filter((f) => f !== right && !isEmpty(value(f)) && (f.type !== 'checkbox' || value(f) === true)).slice(0, 3);
    const main = (
      <button key={`${group}\u0000${record.id}`} type="button" className="mb-cr" onClick={() => onOpen(record)}>
        <span className="tx">
          <b>
            {recordTitle(record)}
            {problems.has(record.id) && <i className="flag" aria-label={t('collection.problems', { problems: '' })} />}
          </b>
          {rest.length > 0 && (
            <small>
              {rest.map((f) => (
                <ListValue key={f.key} field={f} value={value(f)} today={today} values={record.values} />
              ))}
            </small>
          )}
        </span>
        {right && !isEmpty(at) && (
          <span className={typeof at === 'number' ? 'rt num' : at === today ? 'rt today' : 'rt'}>{workedText(at ?? null, today, right, record.values)}</span>
        )}
      </button>
    );
    if (!lines) return main;
    const on = openLines.has(record.id);
    return (
      <div key={`${group}\u0000${record.id}`} className={on ? 'mb-crl on' : 'mb-crl'}>
        {main}
        <button type="button" className="mb-lc" aria-expanded={on} aria-label={t('collection.lines')} onClick={() => toggleLines(record.id)}>
          {lines.count(record)}
          <Icon name="chevron" />
        </button>
        {on && <div className="mb-lines">{lines.view(record)}</div>}
      </div>
    );
  };
  const groupHead = (group: RecordGroup) => {
    // Money in each record's own currency is summed one currency at a time.
    const sums = number ? columnSums(group.records, schema, number.key, today) : null;
    return (
      <button key={`g\u0000${group.key}`} type="button" className={closed.has(group.key) ? 'mb-sec mb-gsec closed' : 'mb-sec mb-gsec'} aria-expanded={!closed.has(group.key)} onClick={() => onToggle(group.key)}>
        <span>{group.key === '' ? t('collection.noValue', { field: groupField?.label ?? '' }) : group.label}</span>
        <small>{group.records.length}</small>
        {sums !== null && <span className="sum">{sums.map((s) => formatNumber(s.value, number?.format, s.currency)).join(' · ')}</span>}
      </button>
    );
  };
  return (
    <>
      {side ? (
        <header className="mb-head split">
          <div>
            <h1>{name}</h1>
            <small>{count}</small>
          </div>
          {side}
        </header>
      ) : (
        <header className="mb-head">
          <h1>{name}</h1>
          <small>{count}</small>
        </header>
      )}
      {!noFields && records.length > 0 && (
        <label className="mb-searchbar">
          <Icon name="search" />
          <input type="search" spellCheck={false} enterKeyHint="search" aria-label={t('collection.search')} placeholder={t('collection.search')} value={query} onChange={(event) => onQuery(event.target.value)} />
        </label>
      )}
      {!noFields && (
        <div className="mb-views">
          <div className="ch" role="tablist">
            <button type="button" role="tab" aria-selected={!view} className={view ? 'mb-view' : 'mb-view on'} onClick={() => onPickView(null)}>
              {t('collection.all')}
            </button>
            {views.map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={view?.id === v.id} className={view?.id === v.id ? 'mb-view on' : 'mb-view'} onClick={() => onPickView(v.id)} {...hold(() => onViewMenu(v))}>
                {v.kind === 'calendar' && <Icon name="calendar" />}
                {v.name}
              </button>
            ))}
          </div>
          <button type="button" className={filtered ? 'opt on' : 'opt'} aria-label={t('phone.view')} title={t('phone.view')} onClick={onViewSheet}>
            <Icon name="settings" />
          </button>
        </div>
      )}
      {body ?? <div className="mb-clist">
        {noFields ? (
          <Empty icon="collection" title={t('collection.noFields')} action={{ label: t('collection.fields'), run: onFields }} />
        ) : records.length === 0 ? (
          <Empty icon="collection" title={t('phone.noRecords')} text={t('phone.noRecordsText')} action={{ label: t('collection.addRecord'), run: onAdd }} />
        ) : shown.length === 0 ? (
          <p className="mb-none">{t('collection.noMatch')}</p>
        ) : groups ? (
          groups.flatMap((group) => [groupHead(group), ...(closed.has(group.key) ? [] : group.records.map((r) => row(r, group.key)))])
        ) : (
          shown.map((r) => row(r))
        )}
      </div>}
    </>
  );
}

// ---------- the view's sheets ----------

/** The head of a list picked inside a sheet: the way back to the sheet, and what is picked. */
function StepHead({ back, title, onBack }: { back: string; title: string; onBack: () => void }) {
  return (
    <div className="mb-sh three">
      <button type="button" className="cancel back" onClick={onBack}>
        <Icon name="back" />
        <span>{back}</span>
      </button>
      <b>{title}</b>
      <span />
    </div>
  );
}

/**
 * The view's sheet, after the Phone collection views view: its sort, its grouping and its filter,
 * each picked in a list of its own inside the sheet, then a switch for each field the list can show.
 */
export function ViewSheet({ viewName, all, optional, sort, group, shown, conditions, onSort, onGroup, onShown, onFilter, onClose }: {
  viewName: string;
  /** Every field of the collection. */
  all: Field[];
  /** The fields the list can show or hide: all but the first. */
  optional: Field[];
  sort: RecordSort;
  group: string | null;
  /** The keys of the optional fields shown. */
  shown: string[];
  /** How many conditions narrow the view. */
  conditions: number;
  onSort: (sort: RecordSort) => void;
  onGroup: (key: string | null) => void;
  onShown: (keys: string[]) => void;
  onFilter: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'sort' | 'group' | null>(null);
  const labelOf = (key: string) => all.find((f) => f.key === key)?.label ?? key;
  const arrow = (dir: RecordSort['dir']) => (dir === 'asc' ? '↑' : '↓');
  if (step === 'sort') {
    return (
      <Sheet label={t('phone.sort')} className="mb-create" onClose={onClose}>
        <StepHead back={t('phone.view')} title={t('phone.sort')} onBack={() => setStep(null)} />
        <div className="mb-form">
          <div className="mb-group">
            {all.map((field) => (
              <button
                key={field.key}
                type="button"
                className="mb-fr pick"
                onClick={() => {
                  onSort(field.key === sort.key ? { key: field.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: field.key, dir: 'asc' });
                  setStep(null);
                }}
              >
                <span className="in">{field.label}</span>
                {field.key === sort.key && <span className="val">{arrow(sort.dir)}</span>}
                <Tick on={field.key === sort.key} />
              </button>
            ))}
          </div>
          <p className="mb-hint">{t('phone.sortHint')}</p>
        </div>
      </Sheet>
    );
  }
  if (step === 'group') {
    const groupable = all.filter((f) => GROUPABLE.includes(f.type));
    return (
      <Sheet label={t('collection.group')} className="mb-create" onClose={onClose}>
        <StepHead back={t('phone.view')} title={t('collection.group')} onBack={() => setStep(null)} />
        <div className="mb-form">
          <div className="mb-group">
            {[null, ...groupable].map((field) => (
              <button
                key={field?.key ?? ''}
                type="button"
                className="mb-fr pick"
                onClick={() => {
                  onGroup(field?.key ?? null);
                  setStep(null);
                }}
              >
                <span className="in">{field ? field.label : t('collection.noGroup')}</span>
                <Tick on={(field?.key ?? null) === group} />
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    );
  }
  const toggle = (key: string) => onShown(shown.includes(key) ? shown.filter((k) => k !== key) : optional.filter((f) => f.key === key || shown.includes(f.key)).map((f) => f.key));
  return (
    <Sheet label={t('phone.view')} className="mb-create" onClose={onClose}>
      <div className="mb-sh">
        <b>{t('phone.view')}</b>
        <small>{viewName}</small>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-form">
        <div className="mb-group">
          <button type="button" className="mb-fr" onClick={() => setStep('sort')}>
            <span className="fl">{t('phone.sort')}</span>
            <span className="val">
              <span className="tx">
                {labelOf(sort.key)} {arrow(sort.dir)}
              </span>
              <Icon name="chevron" />
            </span>
          </button>
          <button type="button" className="mb-fr" onClick={() => setStep('group')}>
            <span className="fl">{t('collection.group')}</span>
            <span className="val">
              {group ? <span className="tx">{labelOf(group)}</span> : <span className="none">{t('phone.none')}</span>}
              <Icon name="chevron" />
            </span>
          </button>
          <button type="button" className="mb-fr" onClick={onFilter}>
            <span className="fl">{t('collection.filter')}</span>
            <span className="val">
              {conditions > 0 ? <span className="tx">{t('phone.conditions', { count: conditions })}</span> : <span className="none">{t('phone.none')}</span>}
              <Icon name="chevron" />
            </span>
          </button>
        </div>
        {optional.length > 0 && (
          <>
            <div className="mb-cap">{t('phone.shownInList')}</div>
            <div className="mb-group">
              {optional.map((field) => (
                <button key={field.key} type="button" className="mb-fr" role="switch" aria-checked={shown.includes(field.key)} onClick={() => toggle(field.key)}>
                  <span className="in">{field.label}</span>
                  <span className={shown.includes(field.key) ? 'mb-sw on' : 'mb-sw'} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The view's conditions in a sheet, after the Phone collection views view: each condition a group
 * of its field, what is asked of it and its value, the field and what is asked picked in lists of
 * their own, a choice or a link from its choices; Add condition, and how many records match at the
 * foot. Apply shows them; without a view they can be kept as a new one, by a name.
 */
export function FilterSheet({ schema, first, conditions, total, count, records, view, onApply, onSave, onClose }: {
  schema: Schema;
  /** The field a new condition starts on. */
  first: Field;
  conditions: Condition[];
  total: number;
  /** How many records the conditions would show. */
  count: (conditions: Condition[]) => number;
  records: CollectionActions['records'];
  /** The saved view the conditions are of, when they are. */
  view: View | null;
  onApply: (conditions: Condition[]) => void;
  onSave: (conditions: Condition[], name: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Condition[]>(conditions);
  const [step, setStep] = useState<{ kind: 'field' | 'op' | 'value'; index: number } | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const title = view ? view.name : t('collection.filter');
  const set = (index: number, next: Condition) => setDraft(draft.map((c, i) => (i === index ? next : c)));
  const fieldOf = (condition: Condition) => schema.fields.find((f) => f.key === condition.field) ?? schema.fields[0]!;
  const usable = schema.fields.filter((f) => f.type !== 'formula' || f.formula);
  const pickedOf = (condition: Condition) => (Array.isArray(condition.value) ? condition.value : typeof condition.value === 'string' && condition.value ? [condition.value] : []);
  // A choice field compares with any of the choices picked; a link with any of the records picked, by name.
  const choicesOf = (field: Field): { value: string; label: ReactNode }[] | null => {
    if (field.type === 'select' || field.type === 'multi-select') return (field.options ?? []).map((o) => ({ value: o, label: <Chip text={o} color={optionColor(field, o)} /> }));
    if (field.type === 'link' && field.collection) return (records(field.collection) ?? []).map((r) => ({ value: r.name || r.code, label: recordLabel(r) }));
    return null;
  };

  if (step) {
    const condition = draft[step.index]!;
    const field = fieldOf(condition);
    const back = () => setStep(null);
    if (step.kind === 'field') {
      return (
        <Sheet label={t('collection.field')} className="mb-create" onClose={onClose}>
          <StepHead back={title} title={t('collection.field')} onBack={back} />
          <div className="mb-form">
            <div className="mb-group">
              {usable.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="mb-fr pick"
                  onClick={() => {
                    const ops = opsFor(f.type);
                    set(step.index, { field: f.key, op: ops.includes(condition.op) ? condition.op : ops[0]! });
                    back();
                  }}
                >
                  <span className="in">{f.label}</span>
                  <Tick on={f.key === field.key} />
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      );
    }
    if (step.kind === 'op') {
      return (
        <Sheet label={t('collection.op')} className="mb-create" onClose={onClose}>
          <StepHead back={title} title={t('collection.op')} onBack={back} />
          <div className="mb-form">
            <div className="mb-group">
              {opsFor(field.type).map((op: ConditionOp) => (
                <button
                  key={op}
                  type="button"
                  className="mb-fr pick"
                  onClick={() => {
                    set(step.index, { ...condition, op, ...(opTakesValue(op) && condition.value !== undefined && { value: condition.value }) });
                    back();
                  }}
                >
                  <span className="in">{t(`collection.op.${op}`)}</span>
                  <Tick on={op === condition.op} />
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      );
    }
    const picked = pickedOf(condition);
    const choices = choicesOf(field) ?? [];
    return (
      <Sheet label={t('collection.value')} className="mb-create" onClose={onClose}>
        <StepHead back={title} title={field.label} onBack={back} />
        <div className="mb-form">
          {choices.length > 0 ? (
            <div className="mb-group">
              {choices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  className="mb-fr pick"
                  onClick={() => set(step.index, { ...condition, value: picked.includes(choice.value) ? picked.filter((p) => p !== choice.value) : [...picked, choice.value] })}
                >
                  <span className="in">{choice.label}</span>
                  <Tick on={picked.includes(choice.value)} />
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-hint">{field.type === 'link' ? t('collection.noRecords') : t('phone.noChoices')}</p>
          )}
        </div>
      </Sheet>
    );
  }

  const valueRow = (condition: Condition, index: number) => {
    const field = fieldOf(condition);
    const value = condition.value;
    const label = <span className="fl">{t('collection.value')}</span>;
    if (choicesOf(field)) {
      const picked = pickedOf(condition);
      return (
        <button type="button" className="mb-fr" onClick={() => setStep({ kind: 'value', index })}>
          {label}
          <span className="val">
            {picked.length === 0 ? (
              <span className="none">{t('phone.choose')}</span>
            ) : field.type === 'link' ? (
              <span className="tx">{picked.join(', ')}</span>
            ) : (
              <span className="lbls">
                {picked.map((p) => (
                  <Chip key={p} text={p} color={optionColor(field, p)} />
                ))}
              </span>
            )}
            <Icon name="chevron" />
          </span>
        </button>
      );
    }
    if (field.type === 'number' || field.type === 'formula') {
      return (
        <label className="mb-fr">
          {label}
          <input
            className="in r"
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={t('collection.value')}
            value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''}
            onChange={(event) => set(index, { ...condition, value: event.target.value === '' ? undefined : Number(event.target.value.replace(',', '.')) })}
          />
        </label>
      );
    }
    if (field.type === 'time') {
      return (
        <label className="mb-fr">
          {label}
          <input className="in r" type="time" aria-label={t('collection.value')} value={typeof value === 'string' ? value : ''} onChange={(event) => set(index, { ...condition, value: event.target.value || undefined })} />
        </label>
      );
    }
    if (field.type === 'date') {
      // Today moves with the day; a day picked stays.
      return (
        <>
          <label className="mb-fr">
            {label}
            <input className="in r" type="date" aria-label={t('collection.value')} value={typeof value === 'string' && value !== TODAY ? value : ''} onChange={(event) => set(index, { ...condition, value: event.target.value || undefined })} />
          </label>
          <button type="button" className="mb-fr pick" onClick={() => set(index, { ...condition, value: value === TODAY ? undefined : TODAY })}>
            <span className="in">
              {t('collection.today')} <small>{t('collection.todayHint')}</small>
            </span>
            <Tick on={value === TODAY} />
          </button>
        </>
      );
    }
    return (
      <label className="mb-fr">
        {label}
        <input className="in r" enterKeyHint="done" aria-label={t('collection.value')} placeholder={t('collection.value')} value={typeof value === 'string' ? value : ''} onChange={(event) => set(index, { ...condition, value: event.target.value })} />
      </label>
    );
  };

  return (
    <Sheet label={title} className="mb-create mb-filtersheet" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{title}</b>
        <button type="button" className="ok" onClick={() => onApply(draft)}>
          {t('collection.apply')}
        </button>
      </div>
      <div className="mb-form">
        {draft.map((condition, index) => {
          const field = fieldOf(condition);
          return (
            <div key={index}>
              <div className="mb-cap">
                {index === 0 ? t('phone.where') : t('phone.and')}
                <button type="button" className="rmv" onClick={() => setDraft(draft.filter((_, i) => i !== index))}>
                  {t('phone.remove')}
                </button>
              </div>
              <div className="mb-group">
                <button type="button" className="mb-fr" onClick={() => setStep({ kind: 'field', index })}>
                  <span className="fl">{t('collection.field')}</span>
                  <span className="val">
                    <span className="tx">{field.label}</span>
                    <Icon name="chevron" />
                  </span>
                </button>
                <button type="button" className="mb-fr" onClick={() => setStep({ kind: 'op', index })}>
                  <span className="fl">{t('collection.op')}</span>
                  <span className="val">
                    <span className="tx">{t(`collection.op.${condition.op}`)}</span>
                    <Icon name="chevron" />
                  </span>
                </button>
                {opTakesValue(condition.op) && valueRow(condition, index)}
              </div>
            </div>
          );
        })}
        <div className="mb-group apart">
          <button type="button" className="mb-fr add" onClick={() => setDraft([...draft, { field: first.key, op: opsFor(first.type)[0]! }])}>
            <Icon name="plus" />
            <span className="in">{t('phone.addCondition')}</span>
          </button>
        </div>
        <p className="mb-hint">{draft.length === 0 ? t('collection.noConditions') : t('phone.matchCount', { count: count(draft), total })}</p>
        {!view &&
          (naming ? (
            <div className="mb-group apart">
              <form
                className="mb-fr add-sub"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) onSave(draft, name.trim());
                }}
              >
                <input className="in" autoFocus enterKeyHint="done" aria-label={t('collection.viewName')} placeholder={t('collection.viewName')} value={name} onChange={(event) => setName(event.target.value)} />
                <button type="submit" className="go" disabled={!name.trim()}>
                  {t('collection.save')}
                </button>
              </form>
            </div>
          ) : (
            <div className="mb-group apart">
              <button type="button" className="mb-fr add" onClick={() => setNaming(true)}>
                <Icon name="filter" />
                <span className="in">{t('collection.saveView')}</span>
              </button>
            </div>
          ))}
      </div>
    </Sheet>
  );
}
