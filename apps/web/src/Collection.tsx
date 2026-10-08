import {
  CODE_KEY,
  type Collection,
  type CollectionLook,
  evaluateFormula,
  collectionName,
  columnSum,
  type Condition,
  type ConditionOp,
  type Field,
  type FieldValue,
  fieldValueOf,
  GROUPABLE,
  groupRecords,
  isEmpty,
  isLink,
  type Layout,
  type Link,
  linkTo,
  matchesConditions,
  opsFor,
  opTakesValue,
  putView,
  recordLabel,
  type RecordGroup,
  removeView,
  type Schema,
  type View,
  layoutOf,
  matchesQuery,
  missingFields,
  NAME_KEY,
  type NewRecord,
  type Record,
  type RecordPatch,
  type RecordSort,
  sortRecords,
  unplacedFields,
  valueText,
} from '@scrawlnotes/core';
import type { ScrawlEditor } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { labelHue } from './CardPanel';
import type { MenuItem } from './dialogs';
import { Icon } from './Icon';
import { useNarrow } from './narrow';
import { quote } from './text';

// A collection, after the Collection views of design/mockups.html: one table of its records, a
// search box and Add record in its head. A record is one form in a modal, drawn from the
// schema's layout (columns of sections of fields, the body among them): every field is a box,
// what is typed is held as a draft, and Save writes it all at once, as one file. A new record is
// the same form empty, with Create. A choice opens a list under its box, as a card's status does.

export interface CollectionActions {
  /** Returns a message when the record cannot be made. */
  addRecord: (dir: string, input: NewRecord) => Promise<string | null>;
  updateRecord: (dir: string, id: string, patch: RecordPatch) => Promise<string | null>;
  /** Asks first, then moves the record's file to the trash. */
  removeRecord: (dir: string, record: Record) => void;
  /** Opens the record's file as a note, in a tab. */
  openNote: (path: string) => void;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  /** Asks before something is lost; `action` is what the confirming button says. */
  ask: (title: string, message: string, run: () => void, action: string) => void;
  /** An editor for the body, in `parent`; the host wires it to the vault's files. */
  editor: (parent: HTMLElement, doc: string, onChange: (doc: string) => void) => ScrawlEditor;
  /** The records of the collection at a path, for a link to pick from; null when there is no such collection. */
  records: (collection: string) => Record[] | null;
  /** Changes the collection's schema file, for its views. Returns a message when it cannot be written. */
  changeSchema: (dir: string, change: (schema: Schema) => Schema) => Promise<string | null>;
}

/** A table longer than this shows its first rows and a line for the rest. */
const MANY_ROWS = 20;
const SHOWN_FIRST = 15;
/** How close to the window's edge a list may come. */
const EDGE = 8;

/** How wide a column is, by its field's type; the name takes what is left. */
const WIDTHS: { [type in Field['type']]: string } = {
  text: '130px',
  number: '84px',
  date: '100px',
  select: '104px',
  'multi-select': '130px',
  checkbox: '56px',
  url: '150px',
  email: '160px',
  phone: '112px',
  person: '96px',
  link: '170px',
  formula: '96px',
};

/** The fields of the table: name first, code when any record has one, then the rest in the schema's order. */
function tableFields(collection: Collection): Field[] {
  const { fields } = collection.schema;
  const withCode = !!collection.schema.code || collection.records.some((r) => r.code);
  return fields.filter((f) => f.key !== CODE_KEY || withCode);
}

const fieldValue = (record: Record, field: Field): FieldValue | undefined =>
  field.key === NAME_KEY ? record.name : field.key === CODE_KEY ? record.code : record.values[field.key];

/** A choice as a chip, colored by its text as a card's labels are. */
function Chip({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <span className="lbl" style={{ '--lh': labelHue(text) } as CSSProperties}>
      {text}
      {children}
    </span>
  );
}

/** A value as the table shows it: text, a chip for a choice, chips for choices, a tick for a flag. */
function Cell({ field, value }: { field: Field; value: FieldValue | undefined }) {
  if (isEmpty(value)) return <span className="empty">–</span>;
  if (field.type === 'select') return <Chip text={valueText(value)} />;
  if (field.type === 'multi-select') {
    return (
      <span className="lbls">
        {(value as string[]).map((item) => (
          <Chip key={item} text={item} />
        ))}
      </span>
    );
  }
  if (field.type === 'checkbox') return <span className="tick">{value ? '✓' : ''}</span>;
  if (field.type === 'person') return <span className="who">{valueText(value)}</span>;
  if (field.type === 'link') {
    const links = (Array.isArray(value) ? value : [value]).filter(isLink);
    return (
      <span className="lnks">
        {links.map((link) => (
          <span key={link.id || link.name} className="lnk">
            {recordLabel(link)}
          </span>
        ))}
      </span>
    );
  }
  return <span className={field.type === 'number' ? 'num' : field.type === 'date' ? 'dt' : 'tt'}>{valueText(value)}</span>;
}

// ---------- choices ----------

interface Option {
  value: string | null;
  label: string;
  /** Shown as a chip, colored by its text; the empty choice and "add" are plain. */
  chip: boolean;
}

/** Keys the list handles while a box keeps the keyboard; the box passes them on. */
const LIST_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'];

/**
 * The choices of a field, under its box, or above it when there is more room there, as a card's
 * status list is. The arrow keys move through it, Enter picks, Esc closes. The box that opened it
 * keeps the keyboard and hands these keys over through `keys`.
 */
function OptionList({ anchor, options, current, label, keys, onPick, onClose }: {
  anchor: RefObject<HTMLElement | null>;
  options: Option[];
  /** The values chosen now, ticked. */
  current: string[];
  label: string;
  keys: RefObject<((event: KeyboardEvent) => void) | null>;
  onPick: (value: string | null) => void;
  onClose: () => void;
}) {
  const [at, setAt] = useState(() => Math.max(0, options.findIndex((o) => o.value !== null && current.includes(o.value))));
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ options, at, onPick, onClose });
  latest.current = { options, at, onPick, onClose };

  useLayoutEffect(() => {
    const measure = () => {
      const field = anchor.current?.getBoundingClientRect();
      const height = box.current?.offsetHeight ?? 0;
      if (!field) return;
      const below = window.innerHeight - field.bottom - EDGE - 4;
      const above = field.top - EDGE - 4;
      const width = Math.max(field.width, 220);
      const left = Math.max(EDGE, Math.min(field.left, window.innerWidth - width - EDGE));
      setPlace(below >= height || below >= above ? { left, width, top: field.bottom + 4 } : { left, width, bottom: window.innerHeight - field.top + 4 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, options.length]);

  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) latest.current.onClose();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor]);

  useEffect(() => {
    if (at > options.length - 1) setAt(Math.max(0, options.length - 1));
  }, [options.length, at]);

  useEffect(() => {
    keys.current = (event) => {
      const { options: now, at: here, onPick: pick, onClose: close } = latest.current;
      const last = now.length - 1;
      if (event.key === 'ArrowDown') setAt(here >= last ? 0 : here + 1);
      else if (event.key === 'ArrowUp') setAt(here <= 0 ? last : here - 1);
      else if (event.key === 'Enter') {
        const option = now[here];
        if (option) pick(option.value);
      } else if (event.key === 'Escape' || event.key === 'Tab') close();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    return () => {
      keys.current = null;
    };
  }, [keys]);

  return createPortal(
    <div ref={box} className="lbl-picker st-picker opt-list" role="listbox" aria-label={label} style={place ?? { opacity: 0 }}>
      {options.map((option, index) => {
        const on = option.value !== null && current.includes(option.value);
        return (
          <button
            key={option.value ?? '\u0000'}
            type="button"
            role="option"
            aria-selected={on}
            tabIndex={-1}
            className={index === at ? 'at' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => index !== at && setAt(index)}
            onClick={() => onPick(option.value)}
          >
            <span className="nm">{option.chip ? <Chip text={option.label} /> : <span className="none">{option.label}</span>}</span>
            <span className="tick">{on ? '✓' : ''}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** One choice of a select: the box shows it as a chip; a click opens the list of them. */
function SelectField({ field, value, onChange }: { field: Field; value: string | null; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const options: Option[] = [
    { value: null, label: t('collection.none'), chip: false },
    ...(field.options ?? []).map((o) => ({ value: o, label: o, chip: true })),
    // A value the options do not have, as another tool or an older schema wrote it, stays choosable.
    ...(value && !field.options?.includes(value) ? [{ value, label: value, chip: true }] : []),
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
        onKeyDown={(event) => {
          if (open && LIST_KEYS.includes(event.key)) keys.current?.(event);
          else if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="nm">{value ? <Chip text={value} /> : <span className="none">{t('collection.none')}</span>}</span>
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
 * The choices of a multi-select as chips in a box, with a line to type in; the list under it
 * shows the choices left, narrowed by what is typed. Enter or a click adds one; what is typed
 * that is no choice is added as it is, which is how tags come to be. Backspace on an empty line
 * takes the last chip off.
 */
function ChipsField({ field, value, onChange }: { field: Field; value: string[]; onChange: (value: string[]) => void }) {
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const q = typed.trim().toLowerCase();
  const left = (field.options ?? []).filter((o) => !value.includes(o) && (!q || o.toLowerCase().includes(q)));
  const known = left.some((o) => o.toLowerCase() === q) || value.some((v) => v.toLowerCase() === q);
  const options: Option[] = [
    ...left.map((o) => ({ value: o, label: o, chip: true })),
    ...(q && !known ? [{ value: typed.trim(), label: t('collection.addTagNamed', { name: typed.trim() }), chip: false }] : []),
  ];
  const add = (item: string | null) => {
    const clean = item?.trim() ?? '';
    if (clean && !value.includes(clean)) onChange([...value, clean]);
    setTyped('');
  };
  return (
    <>
      <div ref={box} className="chips" onClick={() => input.current?.focus()}>
        {value.map((item) => (
          <Chip key={item} text={item}>
            <button type="button" aria-label={t('collection.clear')} onClick={() => onChange(value.filter((v) => v !== item))}>
              ×
            </button>
          </Chip>
        ))}
        <input
          ref={input}
          id={`field-${field.key}`}
          aria-label={field.label}
          autoComplete="off"
          placeholder={t('collection.addTag')}
          value={typed}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            // Typed or pasted with commas, every complete part becomes a chip at once.
            const parts = event.target.value.split(',');
            if (parts.length > 1) {
              const added = parts.slice(0, -1).map((p) => p.trim()).filter((p, i, all) => p && !value.includes(p) && all.indexOf(p) === i);
              if (added.length > 0) onChange([...value, ...added]);
            }
            setTyped(parts[parts.length - 1]!);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !typed && value.length > 0) return onChange(value.slice(0, -1));
            if (open && options.length > 0 && LIST_KEYS.includes(event.key)) return keys.current?.(event);
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              add(typed);
            } else if (event.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      {open && options.length > 0 && (
        <OptionList anchor={box} options={options} current={[]} label={field.label} keys={keys} onPick={add} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * A link's box: the record it points at as a chip (several, when the field holds many), and a line
 * to find another by name or code in the collection the field points at; the list under it shows
 * what matches. A link whose record is gone keeps showing the name it had.
 */
function LinkField({ field, value, records, onChange }: {
  field: Field;
  value: Link | Link[] | null;
  records: CollectionActions['records'];
  onChange: (value: Link | Link[] | null) => void;
}) {
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const links = (Array.isArray(value) ? value : value ? [value] : []).filter(isLink);
  const target = field.collection ? records(field.collection) : null;
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
    if (!field.many) setOpen(false);
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
          <span key={link.id || link.name} className="lnk">
            {recordLabel(link)}
            <button type="button" aria-label={t('collection.clear')} onClick={() => remove(link)}>
              ×
            </button>
          </span>
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
        <p className="lnk-none">{target === null ? t('collection.noTarget', { name: field.collection ?? '' }) : t('collection.noRecords')}</p>
      )}
      {open && !full && options.length > 0 && (
        <OptionList anchor={box} options={options} current={[]} label={field.label} keys={keys} onPick={pick} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** The box a field is typed in, by its type. The value typed is held by the form. */
function FieldInput({ field, value, records, onChange }: { field: Field; value: FieldValue; records: CollectionActions['records']; onChange: (value: FieldValue) => void }) {
  const id = `field-${field.key}`;
  switch (field.type) {
    case 'link':
      return <LinkField field={field} value={isLink(value) || Array.isArray(value) ? (value as Link | Link[]) : null} records={records} onChange={onChange} />;
    case 'select':
      return <SelectField field={field} value={typeof value === 'string' && value ? value : null} onChange={onChange} />;
    case 'multi-select':
      return <ChipsField field={field} value={Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []} onChange={onChange} />;
    case 'checkbox':
      return (
        <label className="check">
          <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          <span>{valueText(value === true)}</span>
        </label>
      );
    case 'number':
      return (
        <input
          id={id}
          type="number"
          step="any"
          aria-label={field.label}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
      );
    case 'date':
      return <input id={id} type="date" aria-label={field.label} value={valueText(value)} onChange={(event) => onChange(event.target.value || null)} />;
    default:
      return (
        <input
          id={id}
          type={field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          aria-label={field.label}
          spellCheck={field.type === 'text'}
          value={valueText(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

/** The body of a record, in the live preview editor, as part of the form: what is typed goes to the draft. */
function NotesBlock({ text, editor, onChange }: { text: string; editor: CollectionActions['editor']; onChange: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const made = useRef<ScrawlEditor | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    made.current = editor(host.current!, text, (doc) => changed.current(doc));
    return () => {
      made.current?.destroy();
      made.current = null;
    };
    // Made once with the record's body; what is typed in it is the draft's body from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={text ? 'rm-notes' : 'rm-notes empty'} data-hint={t('collection.notesHint')} onClick={() => made.current?.view.focus()}>
      <div ref={host} />
    </div>
  );
}

/** What the form holds: the record as it is being typed. */
interface Draft {
  name: string;
  code: string;
  values: Record['values'];
  body: string;
}

const draftOf = (record: Record | null): Draft =>
  record ? { name: record.name, code: record.code, values: { ...record.values }, body: record.body } : { name: '', code: '', values: {}, body: '' };

/** Whether two drafts differ in anything that would be written. */
function differs(a: Draft, b: Draft): boolean {
  if (a.name !== b.name || a.code !== b.code || a.body !== b.body) return true;
  for (const key of new Set([...Object.keys(a.values), ...Object.keys(b.values)])) {
    const [x, y] = [a.values[key], b.values[key]];
    if (isEmpty(x) && isEmpty(y)) continue;
    if (JSON.stringify(x) !== JSON.stringify(y)) return true;
  }
  return false;
}

/** The screen of one record, or of a new one: one form, drawn from the schema's layout, saved as a whole. */
function RecordDialog({ collection, record, today, actions, onClose }: {
  collection: Collection;
  /** Null for a new record. */
  record: Record | null;
  today: string;
  actions: CollectionActions;
  onClose: () => void;
}) {
  const { dir, schema } = collection;
  const name = collectionName(dir);
  const fields = useMemo(() => new Map(schema.fields.map((f) => [f.key, f])), [schema]);
  const layout: Layout = layoutOf(schema);
  const unplaced = unplacedFields(schema);
  const [draft, setDraft] = useState<Draft>(() => draftOf(record));
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const isNew = record === null;
  const original = useMemo(() => draftOf(record), [record]);
  const dirty = differs(draft, original);

  const set = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setValue = (key: string, value: FieldValue) => {
    setError(null);
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: value } }));
  };

  const save = async () => {
    if (busy.current) return;
    const missing = missingFields(draft, schema);
    if (missing.length > 0) {
      const labels = missing.filter((k) => k !== NAME_KEY).map((k) => fields.get(k)?.label ?? k);
      setError(missing.includes(NAME_KEY) ? t('collection.nameNeeded') : t('collection.requiredMissing', { fields: labels.join(t('list.separator')) }));
      return;
    }
    busy.current = true;
    const patch = { name: draft.name, code: draft.code, values: draft.values, body: draft.body };
    const failed = isNew ? await actions.addRecord(dir, patch) : await actions.updateRecord(dir, record.id, patch);
    busy.current = false;
    if (failed) setError(failed);
    else onClose();
  };
  // Nothing typed is lost without asking.
  const leave = (then: () => void = onClose) => {
    if (!dirty) return then();
    actions.ask(t('collection.discardTitle'), t('collection.discardText', { name: quote(draft.name || t('collection.newRecordShort')) }), then, t('collection.discard'));
  };
  const menu = (event: MouseEvent) =>
    record && actions.menu(event, [{ label: t('menu.delete'), run: () => actions.removeRecord(dir, record) }]);

  const item = (key: string, index: number): ReactNode => {
    const field = fields.get(key);
    if (!field || field.key === NAME_KEY) return null;
    // A formula is worked out from what is typed; it is not typed itself.
    if (field.type === 'formula') {
      const worked = evaluateFormula(field.formula ?? '', draft.values, schema, today);
      return (
        <div key={`${key}-${index}`} className="prop">
          <span className="pl">{field.label}</span>
          <div className="pe">
            <span className={worked === null ? 'st-field formula none' : 'st-field formula'}>{worked === null ? '–' : valueText(worked)}</span>
          </div>
        </div>
      );
    }
    const value = field.key === CODE_KEY ? draft.code : (draft.values[field.key] ?? null);
    return (
      <div key={`${key}-${index}`} className="prop">
        <label className="pl" htmlFor={`field-${field.key}`}>
          {field.label}
          {field.required && <i title={t('collection.required')}>*</i>}
        </label>
        <div className="pe">
          <FieldInput field={field} value={value} records={actions.records} onChange={(next) => (field.key === CODE_KEY ? set({ code: valueText(next) }) : setValue(field.key, next))} />
        </div>
      </div>
    );
  };
  const body = (index: number): ReactNode => (
    <div key={`body-${index}`} className="prop prop-body">
      <span className="pl">{t('collection.body')}</span>
      <NotesBlock text={draft.body} editor={actions.editor} onChange={(text) => set({ body: text })} />
    </div>
  );
  const columns = layout.columns.map((column, c) => (
    <div key={c} className="rm-col" style={{ flex: column.width ?? 1 }}>
      {column.sections.map((section, s) => (
        <section key={s} className="rm-sec">
          {section.title && <h3>{section.title}</h3>}
          {section.items.map((entry, i) => ('field' in entry ? item(entry.field, i) : entry.block === 'body' ? body(i) : null))}
        </section>
      ))}
      {/* Fields the layout does not place are shown after the last column, so that none is lost. */}
      {c === layout.columns.length - 1 && unplaced.length > 0 && (
        <section className="rm-sec">
          <h3>{t('collection.moreFields')}</h3>
          {unplaced.map((field, i) => item(field.key, i))}
        </section>
      )}
    </div>
  ));

  return (
    <div
      className="backdrop card-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && leave()}
      onKeyDown={(event) => {
        // Esc closes an open list first; the form only when none is open.
        if (event.key !== 'Escape' || document.querySelector('.opt-list')) return;
        event.stopPropagation();
        leave();
      }}
    >
      <section className="rmod" role="dialog" aria-label={isNew ? t('collection.newRecord', { collection: name }) : record.name}>
        <div className="cp-head">
          <Icon name="collection" />
          <span className="where">{isNew ? t('collection.newRecord', { collection: name }) : name}</span>
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
          <div className="rm-title">
            <input
              id="record-name"
              autoFocus={isNew}
              placeholder={t('collection.name')}
              aria-label={t('collection.name')}
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), void save())}
            />
          </div>
          <div className="rm-cols">{columns}</div>
        </div>
        <div className="rm-foot">
          {error && <p role="alert">{error}</p>}
          <button type="button" onClick={() => leave()}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="primary" disabled={!isNew && !dirty} onClick={() => void save()}>
            {isNew ? t('collection.create') : t('collection.save')}
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------- views: filters, groups, columns ----------

/** A condition being typed: the field, what is asked of it, and the value when one is needed. */
function ConditionRow({ schema, condition, records, onChange, onRemove }: {
  schema: Schema;
  condition: Condition;
  records: CollectionActions['records'];
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const field = schema.fields.find((f) => f.key === condition.field) ?? schema.fields[0]!;
  const ops = opsFor(field.type);
  const fieldOptions: Option[] = schema.fields.filter((f) => f.type !== 'formula' || f.formula).map((f) => ({ value: f.key, label: f.label, chip: false }));
  const opOptions: Option[] = ops.map((op) => ({ value: op, label: t(`collection.op.${op}`), chip: false }));
  const takes = opTakesValue(condition.op);
  const value = condition.value;
  const choices = field.type === 'select' || field.type === 'multi-select' ? (field.options ?? []) : null;
  // A choice field compares with any of the choices picked; a link with any of the records picked, by name.
  const picked = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
  const choiceOptions: Option[] = (choices ?? []).map((o) => ({ value: o, label: o, chip: true }));
  const linkOptions: Option[] = field.type === 'link' && field.collection ? (records(field.collection) ?? []).map((r) => ({ value: r.name, label: recordLabel(r), chip: false })) : [];
  return (
    <div className="cond">
      <Picker options={fieldOptions} value={condition.field} label={t('collection.field')} onPick={(key) => {
        const next = schema.fields.find((f) => f.key === key);
        if (!next) return;
        const nextOps = opsFor(next.type);
        onChange({ field: next.key, op: nextOps.includes(condition.op) ? condition.op : nextOps[0]! });
      }} />
      <Picker options={opOptions} value={condition.op} label={t('collection.op')} onPick={(op) => onChange({ ...condition, op: op as ConditionOp, ...(opTakesValue(op as ConditionOp) && value !== undefined && { value }) })} />
      {takes && (choices || linkOptions.length > 0 ? (
        <MultiPicker options={choices ? choiceOptions : linkOptions} picked={picked} label={t('collection.value')} onChange={(next) => onChange({ ...condition, value: next })} />
      ) : field.type === 'number' || field.type === 'formula' ? (
        <input type="number" step="any" aria-label={t('collection.value')} value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value === '' ? undefined : Number(event.target.value) })} />
      ) : field.type === 'date' ? (
        <input type="date" aria-label={t('collection.value')} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value || undefined })} />
      ) : (
        <input type="text" aria-label={t('collection.value')} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value })} />
      ))}
      <button type="button" className="x" title={t('collection.removeCondition')} aria-label={t('collection.removeCondition')} onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

/** One choice from a list, as a box that opens the list under it. */
function Picker({ options, value, label, onPick, className }: { options: Option[]; value: string | null; label: string; onPick: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  // Nothing chosen shows the box's own label, not the empty choice's.
  const current = value === null ? undefined : options.find((o) => o.value === value);
  return (
    <>
      <button
        ref={box}
        type="button"
        className={className ? `st-field ${className}` : 'st-field'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (open && LIST_KEYS.includes(event.key)) keys.current?.(event);
          else if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="nm">{current ? (current.chip ? <Chip text={current.label} /> : current.label) : <span className="none">{label}</span>}</span>
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={value ? [value] : []}
          label={label}
          keys={keys}
          onPick={(picked) => {
            setOpen(false);
            if (picked !== null) onPick(picked);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Several choices from a list: the ones picked as chips in the box, the list stays open while picking. */
function MultiPicker({ options, picked, label, onChange }: { options: Option[]; picked: string[]; label: string; onChange: (picked: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  return (
    <>
      <button
        ref={box}
        type="button"
        className="st-field multi"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (open && LIST_KEYS.includes(event.key)) keys.current?.(event);
          else if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="nm">
          {picked.length === 0 ? (
            <span className="none">{label}</span>
          ) : (
            picked.map((p) => {
              const option = options.find((o) => o.value === p);
              return option?.chip ? <Chip key={p} text={p} /> : <span key={p} className="lnk">{option?.label ?? p}</span>;
            })
          )}
        </span>
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={picked}
          label={label}
          keys={keys}
          onPick={(value) => value !== null && onChange(picked.includes(value) ? picked.filter((p) => p !== value) : [...picked, value])}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The conditions of the table, edited in a window; Apply shows them, Save as view keeps them in the schema. */
function FilterDialog({ schema, conditions, count, records, view, onApply, onSave, onClose }: {
  schema: Schema;
  conditions: Condition[];
  /** How many records the conditions would show. */
  count: (conditions: Condition[]) => number;
  records: CollectionActions['records'];
  /** The saved view being edited, when one is. */
  view: View | null;
  onApply: (conditions: Condition[]) => void;
  /** Saves the conditions as a view: the one edited, or a new one by the name typed. */
  onSave: (conditions: Condition[], name: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Condition[]>(conditions);
  const [name, setName] = useState(view?.name ?? '');
  const [naming, setNaming] = useState(false);
  const first = schema.fields.find((f) => f.key !== NAME_KEY) ?? schema.fields[0]!;
  const add = () => setDraft([...draft, { field: first.key, op: opsFor(first.type)[0]! }]);
  const shown = count(draft);
  return (
    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog cfilter" role="dialog" aria-label={t('collection.filter')} tabIndex={-1} onKeyDown={(event) => event.key === 'Escape' && !document.querySelector('.opt-list') && onClose()}>
        <h2>{view ? view.name : t('collection.filter')}</h2>
        <p className="dialog-hint">{draft.length === 0 ? t('collection.noConditions') : t('collection.conditions')}</p>
        {draft.map((condition, i) => (
          <ConditionRow
            key={i}
            schema={schema}
            condition={condition}
            records={records}
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
}

export function CollectionView({ collection, today, look, onLook, actions, onStatus }: {
  collection: Collection;
  today: string;
  look: CollectionLook | undefined;
  onLook: (look: CollectionLook) => void;
  actions: CollectionActions;
  /** What the status bar says: the count and the order. Null once the view closes. */
  onStatus: (parts: string[] | null) => void;
}) {
  const { dir, schema, records } = collection;
  const name = collectionName(dir);
  const narrow = useNarrow();
  const [query, setQuery] = useState('');
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState<{ kind: 'new' } | { kind: 'record'; id: string } | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  // Conditions applied without being saved as a view, until the tab closes.
  const [adHoc, setAdHoc] = useState<Condition[]>([]);
  const views = schema.views ?? [];
  const view = views.find((v) => v.id === look?.view) ?? null;
  const state: TableState = view
    ? { conditions: view.conditions, sort: view.sort ?? { key: NAME_KEY, dir: 'asc' }, group: view.group ?? null, columns: view.columns ?? null }
    : { conditions: adHoc, sort: look?.sort ?? { key: NAME_KEY, dir: 'asc' }, group: look?.group ?? null, columns: look?.columns ?? null };
  const fieldsByKey = useMemo(() => new Map(schema.fields.map((f) => [f.key, f])), [schema]);
  const allFields = useMemo(() => tableFields(collection), [collection]);
  const fields = state.columns ? [schema.fields[0]!, ...state.columns.map((k) => fieldsByKey.get(k)).filter((f): f is Field => !!f && f.key !== NAME_KEY)] : allFields;
  const sortField = fieldsByKey.get(state.sort.key);

  // What the view says is changed on the view itself; the plain table's look is kept on this device.
  const change = (patch: Partial<Pick<TableState, 'sort' | 'group' | 'columns'>>) => {
    if (view) {
      const next: View = { ...view, ...(patch.sort && { sort: patch.sort }), ...(patch.group !== undefined && { group: patch.group }), ...(patch.columns !== undefined && { columns: patch.columns ?? undefined }) };
      if (patch.columns === null) delete next.columns;
      void actions.changeSchema(dir, (s) => putView(s, next));
    } else {
      onLook({ ...look, view: null, ...(patch.sort && { sort: patch.sort }), ...(patch.group !== undefined && { group: patch.group }), ...(patch.columns !== undefined && { columns: patch.columns ?? undefined }) });
    }
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
  const groups = useMemo(() => (state.group ? groupRecords(shown, schema, state.group, today) : null), [shown, schema, state.group, today]);
  const groupField = state.group ? fieldsByKey.get(state.group) : undefined;

  useEffect(() => {
    onStatus([
      state.conditions.length > 0 || query ? t('collection.matching', { count: shown.length }) : t('count.records', { count: records.length }),
      t('collection.sortedBy', { field: sortField?.label ?? state.sort.key }),
    ]);
  }, [records.length, shown.length, state.conditions.length, query, sortField, state.sort.key]);
  useEffect(() => () => onStatus(null), []);

  const opened = open?.kind === 'record' ? records.find((r) => r.id === open.id) : undefined;
  // The record on screen was deleted, or went with sync: its screen closes.
  useEffect(() => {
    if (open?.kind === 'record' && !opened) setOpen(null);
  }, [open, opened]);

  const sortBy = (key: string) => change({ sort: { key, dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc' } });
  const head = (field: Field) => {
    const on = state.sort.key === field.key;
    return (
      <button key={field.key} type="button" role="columnheader" className={on ? 'sorted' : undefined} aria-sort={on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} onClick={() => sortBy(field.key)}>
        {field.label}
        {on && (state.sort.dir === 'asc' ? ' ↑' : ' ↓')}
      </button>
    );
  };
  const grid = fields.map((f) => (f.key === NAME_KEY ? 'minmax(160px, 1fr)' : WIDTHS[f.type])).join(' ');
  const cellOf = (record: Record, field: Field) =>
    field.key === NAME_KEY ? <span className="tt name">{record.name}</span> : <Cell field={field} value={fieldValueOf(record, field, schema, today)} />;
  const row = (record: Record) => (
    <button key={record.id} type="button" role="row" className="crow" style={{ gridTemplateColumns: grid }} onClick={() => setOpen({ kind: 'record', id: record.id })}>
      {fields.map((field) => (
        <span key={field.key} role="cell">
          {cellOf(record, field)}
        </span>
      ))}
    </button>
  );
  const sums = fields.map((f) => columnSum(shown, schema, f.key, today));
  const hasSums = sums.some((v) => v !== null);
  const sumRow = (of: Record[], label: string) => (
    <div className="crow sum" role="row" style={{ gridTemplateColumns: grid }}>
      {fields.map((field, i) => (
        <span key={field.key} role="cell">
          {i === 0 ? <span className="tt">{label}</span> : sums[i] !== null ? <span className="num">{valueText(columnSum(of, schema, field.key, today))}</span> : null}
        </span>
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

  const phoneRow = (record: Record) => (
    <button key={record.id} type="button" className="prow" onClick={() => setOpen({ kind: 'record', id: record.id })}>
      <b>{record.name}</b>
      <small>
        {fields
          .filter((f) => f.key !== NAME_KEY && !isEmpty(fieldValueOf(record, f, schema, today)))
          .slice(0, 3)
          .map((f) => (
            <Cell key={f.key} field={f} value={fieldValueOf(record, f, schema, today)} />
          ))}
      </small>
    </button>
  );
  const groupHead = (group: RecordGroup) => (
    <button key={`g:${group.key}`} type="button" className={closed.has(group.key) ? 'lsec closed' : 'lsec'} aria-expanded={!closed.has(group.key)} onClick={() => toggle(group.key)}>
      <span className="chev">{closed.has(group.key) ? '▸' : '▾'}</span>
      {group.key === '' ? <span>{t('collection.noValue', { field: groupField?.label ?? '' })}</span> : groupField?.type === 'select' || groupField?.type === 'multi-select' ? <Chip text={group.label} /> : <span>{group.label}</span>}
      <small>{group.records.length}</small>
    </button>
  );

  const table = narrow ? (
    <div className="clist">
      {groups ? groups.flatMap((group) => [groupHead(group), ...(closed.has(group.key) ? [] : group.records.map(phoneRow))]) : rows.map(phoneRow)}
    </div>
  ) : (
    <div className="blist clist" role="table">
      <div className="crow head" role="row" style={{ gridTemplateColumns: grid }}>
        {fields.map(head)}
      </div>
      {groups
        ? groups.flatMap((group) => [groupHead(group), ...(closed.has(group.key) ? [] : [...group.records.map(row), ...(hasSums ? [<div key={`s:${group.key}`}>{sumRow(group.records, t('collection.sum'))}</div>] : [])])])
        : rows.map(row)}
      {hasSums && shown.length > 0 && sumRow(shown, groups ? t('collection.all') : t('collection.sum'))}
    </div>
  );

  const groupOptions: Option[] = [{ value: null, label: t('collection.noGroup'), chip: false }, ...schema.fields.filter((f) => GROUPABLE.includes(f.type)).map((f) => ({ value: f.key, label: f.label, chip: false }))];
  const columnOptions: Option[] = allFields.filter((f) => f.key !== NAME_KEY).map((f) => ({ value: f.key, label: f.label, chip: false }));
  const columnsPicked = fields.filter((f) => f.key !== NAME_KEY).map((f) => f.key);
  const viewMenu = (event: MouseEvent, v: View) =>
    actions.menu(event, [
      { label: t('collection.edit'), run: () => setFiltering(true) },
      { label: t('menu.delete'), run: () => actions.ask(t('delete.view'), t('delete.viewText', { name: quote(v.name) }), () => {
        void actions.changeSchema(dir, (s) => removeView(s, v.id));
        if (look?.view === v.id) pickView(null);
      }, t('delete.action')) },
    ]);

  return (
    <section className="bv collection-view">
      <header className="th">
        <b>{name}</b>
        <span className="count">{t('count.records', { count: records.length })}</span>
        <input
          type="search"
          className="search"
          aria-label={t('collection.search')}
          placeholder={t('collection.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
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
              {v.name}
            </button>
          ))}
        </span>
        <span className="tools">
          <button type="button" className={state.conditions.length > 0 ? 'ghost on' : 'ghost'} onClick={() => setFiltering(true)}>
            {state.conditions.length > 0 ? t('collection.filterCount', { count: state.conditions.length }) : t('collection.filter')}
          </button>
          <Picker className={state.group ? 'ghost on' : 'ghost'} options={groupOptions} value={state.group} label={state.group ? t('collection.groupBy', { field: groupField?.label ?? '' }) : t('collection.group')} onPick={(key) => change({ group: key })} />
          {!narrow && <ColumnsPicker options={columnOptions} picked={columnsPicked} onChange={(keys) => change({ columns: keys.length === columnOptions.length ? null : keys })} />}
          {view && (
            <button type="button" className="more" title={t('collection.viewMenu')} aria-label={t('collection.viewMenu')} onClick={(event) => viewMenu(event, view)}>
              ···
            </button>
          )}
        </span>
      </div>
      {table}
      {rows.length < shown.length && (
        <button type="button" className="lmore" onClick={() => setFull(true)}>
          {t('collection.showMore', { count: shown.length - rows.length })}
        </button>
      )}
      {records.length === 0 && <p className="cv-empty">{t('collection.empty')}</p>}
      {records.length > 0 && shown.length === 0 && <p className="cv-empty">{t('collection.noMatch')}</p>}
      {open?.kind === 'new' && <RecordDialog collection={collection} record={null} today={today} actions={actions} onClose={() => setOpen(null)} />}
      {opened && <RecordDialog key={opened.id} collection={collection} record={opened} today={today} actions={actions} onClose={() => setOpen(null)} />}
      {filtering && (
        <FilterDialog
          schema={schema}
          conditions={state.conditions}
          count={(conditions) => records.filter((r) => matchesConditions(r, schema, conditions, today)).length}
          records={actions.records}
          view={view}
          onApply={(conditions) => {
            if (view) void actions.changeSchema(dir, (s) => putView(s, { ...view, conditions }));
            else setAdHoc(conditions);
            setFiltering(false);
          }}
          onSave={(conditions, viewName) => {
            const saved: View = view ? { ...view, name: viewName, conditions } : { id: crypto.randomUUID(), name: viewName, conditions, sort: state.sort, ...(state.group && { group: state.group }), ...(state.columns && { columns: state.columns }) };
            void actions.changeSchema(dir, (s) => putView(s, saved)).then((failed) => !failed && pickView(saved.id));
            setAdHoc([]);
            setFiltering(false);
          }}
          onClose={() => setFiltering(false)}
        />
      )}
    </section>
  );
}

/** Which fields the table shows as columns: a list with a tick on each shown; the name is always there. */
function ColumnsPicker({ options, picked, onChange }: { options: Option[]; picked: string[]; onChange: (picked: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  return (
    <>
      <button ref={box} type="button" className="ghost" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(event) => open && LIST_KEYS.includes(event.key) && keys.current?.(event)}>
        {t('collection.columns')}
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={picked}
          label={t('collection.columns')}
          keys={keys}
          onPick={(value) => value !== null && onChange(picked.includes(value) ? picked.filter((p) => p !== value) : options.filter((o) => o.value === value || picked.includes(o.value!)).map((o) => o.value!))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** What the delete question says about a record. */
export const recordDeleteText = (record: Record) => t('delete.recordText', { name: quote(record.name) });
