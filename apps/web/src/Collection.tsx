import {
  CODE_KEY,
  type Collection,
  type CollectionLook,
  type ColumnWidths,
  evaluateFormula,
  collectionName,
  columnSum,
  type Condition,
  type ConditionOp,
  type Field,
  fieldHref,
  type FieldValue,
  fieldValueOf,
  GROUPABLE,
  groupRecords,
  isComplete,
  isEmpty,
  isLink,
  type Layout,
  type Link,
  linkGone,
  linkTo,
  makeCode,
  matchesConditions,
  type OptionColor,
  optionColor,
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
  type PointerEvent,
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
  /** Opens a web page, a new mail or a call, outside the app. */
  openLink: (href: string) => void;
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

// ---------- column widths ----------

/**
 * How wide a column is, by its field's type, in pixels: the narrowest it is made to fit the
 * window, and the width it has when there is room; the name is widest, the code narrow.
 */
const WIDTHS: { [type in Field['type']]: [number, number] } = {
  text: [100, 160],
  number: [76, 110],
  date: [92, 116],
  select: [92, 132],
  'multi-select': [110, 176],
  checkbox: [56, 80],
  url: [120, 184],
  email: [130, 200],
  phone: [104, 140],
  person: [84, 124],
  link: [120, 184],
  formula: [76, 110],
};
const NAME_WIDTHS: [number, number] = [160, 240];
const CODE_WIDTHS: [number, number] = [80, 112];
/** A column dragged narrower than this stops there. */
const MIN_WIDTH = 56;
/** The room between two columns. */
const GAP = 12;
/** The room left and right of the rows, inside the table's scrolling box; the first and last cells pad their text by as much again. */
const SIDES = 8;
/** How much a column other than the name grows to fill a wide window: half its width again at most. */
const GROW = 0.5;

const widthsOf = (field: Field) => (field.key === NAME_KEY ? NAME_WIDTHS : field.key === CODE_KEY ? CODE_WIDTHS : WIDTHS[field.type]);

/**
 * The widths of the columns. Ones dragged keep the width they were left at, the others have
 * theirs. With none dragged they fill `room`: in a wide window every other column grows by up to
 * half again and the name takes what is left; in a narrow one they all give up the same share of
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
  // The name takes what is left, the rounding of the others too.
  widths[0] = room - total(widths, 1);
  return widths;
}

/** The fields of the table: name first, code when any record has one, then the rest in the schema's order. */
function tableFields(collection: Collection): Field[] {
  const { fields } = collection.schema;
  const withCode = !!collection.schema.code || collection.records.some((r) => r.code);
  return fields.filter((f) => f.key !== CODE_KEY || withCode);
}

// ---------- values ----------

/** Each color of a choice as a hue and a saturation. */
const HUES: { [color in OptionColor]: [number, number] } = {
  gray: [220, 8],
  red: [2, 70],
  orange: [26, 75],
  yellow: [44, 75],
  green: [140, 45],
  teal: [174, 50],
  blue: [214, 70],
  purple: [268, 55],
  pink: [328, 60],
};

/** A choice as a chip, in the color the schema gives it, else colored by its text as a card's labels are. */
function Chip({ text, color, children }: { text: string; color?: OptionColor; children?: ReactNode }) {
  const [hue, saturation] = color ? HUES[color] : [labelHue(text), 60];
  return (
    <span className="lbl" style={{ '--lh': hue, '--ls': `${saturation}%` } as CSSProperties}>
      {text}
      {children}
    </span>
  );
}

/** A link as a chip: the record's name and code, struck through with "(deleted)" when the record is gone. */
function LinkChip({ link, gone, children }: { link: Link; gone: boolean; children?: ReactNode }) {
  return (
    <span className={gone ? 'lnk gone' : 'lnk'} title={gone ? t('collection.goneHint') : undefined}>
      <span className="ln">{recordLabel(link)}</span>
      {gone && <small>{t('collection.gone')}</small>}
      {children}
    </span>
  );
}

/** What a value needs from the collection to be shown: the records links point at, and a way to open an address. */
interface ValueContext {
  records: CollectionActions['records'];
  openLink: (href: string) => void;
}

const isAddress = (type: Field['type']) => type === 'url' || type === 'email' || type === 'phone';

/** A value as the table shows it: text, a chip for a choice, chips for choices, a tick for a flag, an address to open. */
function Cell({ field, value, ctx }: { field: Field; value: FieldValue | undefined; ctx: ValueContext }) {
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
  return <span className={field.type === 'number' || field.type === 'formula' ? 'num' : field.type === 'date' ? 'ct dt' : 'ct'}>{text}</span>;
}

// ---------- choices ----------

interface Option {
  value: string | null;
  label: string;
  /** Shown as a chip, colored by its text unless `color` says; the empty choice and "add" are plain. */
  chip: boolean;
  color?: OptionColor;
  /** A line above it, apart from the choices before it. */
  apart?: boolean;
}

/** The choices of a field as options, in the colors the schema gives them. */
const choiceOptions = (field: Field, values: string[]): Option[] => values.map((o) => ({ value: o, label: o, chip: true, color: optionColor(field, o) }));

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
            className={[index === at && 'at', option.apart && 'apart'].filter(Boolean).join(' ') || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => index !== at && setAt(index)}
            onClick={() => onPick(option.value)}
          >
            <span className="nm">{option.chip ? <Chip text={option.label} color={option.color} /> : <span className={option.value === null ? 'none' : undefined}>{option.label}</span>}</span>
            <span className="tick">{on ? '✓' : ''}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** What a box that opens a list does with the keys: the list's while it is open, opening it while it is not. */
function boxKeys(open: boolean, setOpen: (open: boolean) => void, keys: RefObject<((event: KeyboardEvent) => void) | null>) {
  return (event: KeyboardEvent) => {
    if (open && LIST_KEYS.includes(event.key)) keys.current?.(event);
    else if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setOpen(true);
    }
  };
}

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
    ...choiceOptions(field, left),
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
          <Chip key={item} text={item} color={optionColor(field, item)}>
            <button type="button" aria-label={t('collection.removeChoice', { name: item })} onClick={() => onChange(value.filter((v) => v !== item))}>
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
 * what matches. A link whose record is gone keeps showing the name it had, marked as deleted.
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
          <LinkChip key={link.id || link.name} link={link} gone={linkGone(link, target)}>
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
        <p className="lnk-none">{target === null ? t('collection.noTarget', { name: field.collection ?? '' }) : t('collection.noRecords')}</p>
      )}
      {open && !full && options.length > 0 && (
        <OptionList anchor={box} options={options} current={[]} label={field.label} keys={keys} onPick={pick} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** What the button beside an address does, by the field's type. */
const OPEN_LABEL = { url: 'collection.openUrl', email: 'collection.writeEmail', phone: 'collection.call' } as const;

/** The box a field is typed in, by its type. The value typed is held by the form. */
function FieldInput({ field, value, placeholder, ctx, onChange }: {
  field: Field;
  value: FieldValue;
  placeholder?: string;
  ctx: ValueContext;
  onChange: (value: FieldValue) => void;
}) {
  const id = `field-${field.key}`;
  switch (field.type) {
    case 'link':
      return <LinkField field={field} value={isLink(value) || Array.isArray(value) ? (value as Link | Link[]) : null} records={ctx.records} onChange={onChange} />;
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
    default: {
      const text = valueText(value);
      const input = (
        <input
          id={id}
          type={field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          aria-label={field.label}
          spellCheck={field.type === 'text'}
          placeholder={placeholder}
          value={text}
          onChange={(event) => onChange(event.target.value)}
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

/**
 * Esc closes the window `within` holds wherever the keyboard is, in the window or nowhere after
 * what had it went away; not while a list is open, which Esc closes first, nor from a window over it.
 */
function useEscape(within: RefObject<HTMLElement | null>, onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.opt-list')) return;
      const over = event.target instanceof Element ? event.target.closest('.backdrop') : null;
      if (over && over !== within.current) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [within]);
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
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const isNew = record === null;
  const original = useMemo(() => draftOf(record), [record]);
  const dirty = differs(draft, original);
  const ctx: ValueContext = { records: actions.records, openLink: actions.openLink };

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
  useEscape(backdrop, () => leave());

  // The name is the first box, as every field is one; the record is named after it, and its file too.
  const nameField = (
    <div className="prop">
      <label className="pl" htmlFor="record-name">
        {fields.get(NAME_KEY)?.label ?? t('collection.name')}
        <i title={t('collection.required')}>*</i>
      </label>
      <div className="pe">
        <input
          id="record-name"
          autoFocus={isNew}
          autoComplete="off"
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), void save())}
        />
      </div>
    </div>
  );
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
    const isCode = field.key === CODE_KEY;
    const value = isCode ? draft.code : (draft.values[field.key] ?? null);
    // A code the collection makes shows the one a new record will get.
    const placeholder = isCode && isNew && schema.code ? t('collection.codeAuto', { code: makeCode(schema.code) }) : undefined;
    return (
      <div key={`${key}-${index}`} className="prop">
        <label className="pl" htmlFor={`field-${field.key}`}>
          {field.label}
          {field.required && <i title={t('collection.required')}>*</i>}
        </label>
        <div className="pe">
          <FieldInput field={field} value={value} placeholder={placeholder} ctx={ctx} onChange={(next) => (isCode ? set({ code: valueText(next) }) : setValue(field.key, next))} />
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
    <div ref={backdrop} className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && leave()}>
      <section
        ref={panel}
        className={layout.columns.length > 1 ? 'rmod wide' : 'rmod'}
        role="dialog"
        aria-label={isNew ? t('collection.newRecord', { collection: name }) : record.name}
        tabIndex={-1}
      >
        <div className="cp-head">
          <Icon name="collection" />
          {record?.code && <span className="key">{record.code}</span>}
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
          <div className="rm-name">{nameField}</div>
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
  const linkOptions: Option[] = field.type === 'link' && field.collection ? (records(field.collection) ?? []).map((r) => ({ value: r.name, label: recordLabel(r), chip: false })) : [];
  return (
    <div className="cond">
      <Picker options={fieldOptions} value={condition.field} label={t('collection.field')} onPick={(key) => {
        const next = schema.fields.find((f) => f.key === key);
        if (!next) return;
        const nextOps = opsFor(next.type);
        onChange({ field: next.key, op: nextOps.includes(condition.op) ? condition.op : nextOps[0]! });
      }} />
      <Picker options={opOptions} value={condition.op} label={t('collection.op')} onPick={(op) => op && onChange({ ...condition, op: op as ConditionOp, ...(opTakesValue(op as ConditionOp) && value !== undefined && { value }) })} />
      {takes ? (
        choices || linkOptions.length > 0 ? (
          <MultiPicker options={choices ? choiceOptions(field, choices) : linkOptions} picked={picked} label={t('collection.value')} onChange={(next) => onChange({ ...condition, value: next })} />
        ) : field.type === 'number' || field.type === 'formula' ? (
          <input type="number" step="any" className="cv" aria-label={t('collection.value')} placeholder={t('collection.value')} value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value === '' ? undefined : Number(event.target.value) })} />
        ) : field.type === 'date' ? (
          <input type="date" className="cv" aria-label={t('collection.value')} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value || undefined })} />
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

/** One choice from a list, as a box that opens the list under it; the box shows the choice, or `text` when it is given. */
function Picker({ options, value, label, text, onPick, className }: {
  options: Option[];
  value: string | null;
  label: string;
  text?: string;
  /** Null for the empty choice, where the list has one. */
  onPick: (value: string | null) => void;
  className?: string;
}) {
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
        onKeyDown={boxKeys(open, setOpen, keys)}
      >
        <span className="nm">{text ?? (current ? (current.chip ? <Chip text={current.label} color={current.color} /> : current.label) : <span className="none">{label}</span>)}</span>
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
            onPick(picked);
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
        onKeyDown={boxKeys(open, setOpen, keys)}
      >
        <span className="nm">
          {picked.length === 0 ? (
            <span className="none">{label}</span>
          ) : (
            picked.map((p) => {
              const option = options.find((o) => o.value === p);
              return option?.chip ? <Chip key={p} text={p} color={option.color} /> : <span key={p} className="lnk">{option?.label ?? p}</span>;
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
function FilterDialog({ schema, first, conditions, count, records, view, onApply, onSave, onClose }: {
  schema: Schema;
  /** The field a new condition starts on: the first column after the name. */
  first: Field;
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
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const add = () => setDraft([...draft, { field: first.key, op: opsFor(first.type)[0]! }]);
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
    ? { conditions: view.conditions, sort: view.sort ?? { key: NAME_KEY, dir: 'asc' }, group: view.group ?? null, columns: view.columns ?? null, widths: view.widths ?? null }
    : { conditions: adHoc, sort: look?.sort ?? { key: NAME_KEY, dir: 'asc' }, group: look?.group ?? null, columns: look?.columns ?? null, widths: look?.widths ?? null };
  const fieldsByKey = useMemo(() => new Map(schema.fields.map((f) => [f.key, f])), [schema]);
  const allFields = useMemo(() => tableFields(collection), [collection]);
  const fields = state.columns ? [schema.fields[0]!, ...state.columns.map((k) => fieldsByKey.get(k)).filter((f): f is Field => !!f && f.key !== NAME_KEY)] : allFields;
  const sortField = fieldsByKey.get(state.sort.key);
  const applied = state.conditions.filter(isComplete);
  const ctx: ValueContext = { records: actions.records, openLink: actions.openLink };

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
  const groups = useMemo(() => (state.group ? groupRecords(shown, schema, state.group, today) : null), [shown, schema, state.group, today]);
  const groupField = state.group ? fieldsByKey.get(state.group) : undefined;

  useEffect(() => {
    onStatus([
      applied.length > 0 || query ? t('collection.matching', { count: shown.length }) : t('count.records', { count: records.length }),
      t('collection.sortedBy', { field: sortField?.label ?? state.sort.key }),
    ]);
  }, [records.length, shown.length, applied.length, query, sortField, state.sort.key]);
  useEffect(() => () => onStatus(null), []);

  const opened = open?.kind === 'record' ? records.find((r) => r.id === open.id) : undefined;
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
      const width = Math.max(MIN_WIDTH, Math.round(start[index]! + e.clientX - x));
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
  const sortBy = (key: string) => change({ sort: { key, dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc' } });
  const isNumeric = (field: Field) => field.type === 'number' || field.type === 'formula';
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
  const cellOf = (record: Record, field: Field) =>
    field.key === NAME_KEY ? <span className="ct name">{record.name}</span> : <Cell field={field} value={fieldValueOf(record, field, schema, today)} ctx={ctx} />;
  // A record with several choices is in several groups: its row's key tells them apart.
  const row = (record: Record, group = '') => (
    <div
      key={`${group}\u0000${record.id}`}
      role="row"
      tabIndex={0}
      className="crow"
      onClick={() => openRecord(record.id)}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault();
          openRecord(record.id);
        }
      }}
    >
      {fields.map((field, i) => (
        <div key={field.key} role="cell" className={cellClass(field, i)}>
          {cellOf(record, field)}
        </div>
      ))}
    </div>
  );
  const sums = fields.map((f) => columnSum(shown, schema, f.key, today));
  const hasSums = sums.some((v) => v !== null);
  const sumRow = (of: Record[], label: string, key: string) => (
    <div key={key} className="crow sum" role="row">
      {fields.map((field, i) => (
        <div key={field.key} role="cell" className={cellClass(field, i)}>
          {i === 0 ? <span className="ct">{label}</span> : sums[i] !== null ? <span className="num">{valueText(columnSum(of, schema, field.key, today))}</span> : null}
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
      <b>{record.name}</b>
      <small>
        {fields
          .filter((f) => f.key !== NAME_KEY && !isEmpty(fieldValueOf(record, f, schema, today)))
          .slice(0, 3)
          .map((f) => (
            <Cell key={f.key} field={f} value={fieldValueOf(record, f, schema, today)} ctx={ctx} />
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
  const empty =
    records.length === 0 ? <p className="cv-empty">{t('collection.empty')}</p> : shown.length === 0 ? <p className="cv-empty">{t('collection.noMatch')}</p> : null;
  const more = rows.length < shown.length && (
    <button type="button" className="lmore" onClick={() => setFull(true)}>
      {t('collection.showMore', { count: shown.length - rows.length })}
    </button>
  );

  const table = narrow ? (
    <div className="clist">
      {groups ? groups.flatMap((group) => [groupHead(group), ...(closed.has(group.key) ? [] : group.records.map((r) => phoneRow(r, group.key)))]) : rows.map((r) => phoneRow(r))}
      {more}
      {empty}
    </div>
  ) : (
    <div ref={scroller} className={scrolled ? 'blist clist scrolled' : 'blist clist'} onScroll={(event) => setScrolled(event.currentTarget.scrollLeft > 0)}>
      <div className="ctable" role="table" aria-label={name} style={{ '--grid': widths.map((w) => `${w}px`).join(' '), minWidth: tableWidth } as CSSProperties}>
        <div className="crow head" role="row">
          {fields.map(head)}
        </div>
        {groups
          ? groups.flatMap((group) => [
              groupHead(group),
              ...(closed.has(group.key) ? [] : [...group.records.map((r) => row(r, group.key)), ...(hasSums ? [sumRow(group.records, t('collection.sum'), `s\u0000${group.key}`)] : [])]),
            ])
          : rows.map((r) => row(r))}
        {hasSums && shown.length > 0 && sumRow(shown, groups ? t('collection.all') : t('collection.sum'), 'sum')}
      </div>
      {more}
      {empty}
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
        <label className="search">
          <Icon name="search" />
          <input type="search" spellCheck={false} aria-label={t('collection.search')} placeholder={t('collection.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
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
          <button type="button" className={applied.length > 0 ? 'ghost on' : 'ghost'} onClick={() => setFiltering(true)}>
            {applied.length > 0 ? t('collection.filterCount', { count: applied.length }) : t('collection.filter')}
          </button>
          <Picker
            className={state.group ? 'ghost on' : 'ghost'}
            options={groupOptions}
            value={state.group}
            label={t('collection.group')}
            text={state.group ? t('collection.groupBy', { field: groupField?.label ?? state.group }) : t('collection.group')}
            onPick={(key) => change({ group: key })}
          />
          {!narrow && (
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
      {table}
      {open?.kind === 'new' && <RecordDialog collection={collection} record={null} today={today} actions={actions} onClose={() => setOpen(null)} />}
      {opened && <RecordDialog key={opened.id} collection={collection} record={opened} today={today} actions={actions} onClose={() => setOpen(null)} />}
      {filtering && (
        <FilterDialog
          schema={schema}
          first={fields[1] ?? fields[0]!}
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
            const saved: View = view
              ? { ...view, name: viewName, conditions }
              : { id: crypto.randomUUID(), name: viewName, conditions, sort: state.sort, ...(state.group && { group: state.group }), ...(state.columns && { columns: state.columns }), ...(state.widths && { widths: state.widths }) };
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
export const recordDeleteText = (record: Record) => t('delete.recordText', { name: quote(record.name) });
