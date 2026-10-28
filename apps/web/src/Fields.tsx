import {
  type Board,
  BOARD_EXT,
  boardName,
  boardsLinkingTo,
  type ChoiceRenames,
  type Collection,
  collectionName,
  COLLECTION_FILE,
  computerFor,
  type Condition,
  dayIn,
  type DefaultValue,
  defaultLayout,
  defaultProblem,
  type Field,
  FIELD_TYPES,
  type FieldType,
  FORMAT_STYLES,
  actionsOf,
  formatNumber,
  formulaInfo,
  isComplete,
  isComputed,
  isEmpty,
  isLinkable,
  type Kind,
  keyFor,
  type Layout,
  type LayoutBlock,
  type LayoutItem,
  type LinkedBlock,
  type LinkedStyle,
  linkFieldsTo,
  changesInTable,
  linkingCollections,
  showsLines,
  mixedCurrency,
  nameField,
  type NumberFormat,
  opsFor,
  opTakesValue,
  OPTION_COLORS,
  type OptionColor,
  parseSchema,
  type Record,
  ROLLUP_FNS,
  type RollupFn,
  RULES_FILE,
  type RuleProblem,
  rulesProblems,
  ruleSpaceOf,
  type Schema,
  type SchemaOf,
  schemasOf,
  serializeSchema,
  settleSchema,
  hiddenOnForm,
  shownField,
  SINGLE_TYPES,
  spaceOf,
  TODAY,
  valueText,
} from '@scrawlnotes/core';
import { createEnvEditor, createRulesEditor, type RulesEditor } from '@scrawlnotes/editor';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { holdToDrag } from './touchDrag';
import { createPortal } from 'react-dom';
import { boxKeys, hueStyle, LIST_KEYS, MultiPicker, type Option, OptionList, Picker, useEscape } from './choices';
import { ConditionRow, DayValue } from './Collection';
import { pageBox, pageWindow } from './device';
import { Icon } from './Icon';
import { boardLabel, collectionLabel } from './items';
import { useNarrow } from './narrow';
import { GRIP } from './Tasks';
import type { StopNote } from './session';
import { clockTime, quote } from './text';

// A collection's Fields window, after the Fields views of design/mockups.html: one window for the
// fields and the record screen, which fills it with its columns and sections as the record opens.
// A field or a block is changed where it is: a click opens it in place (its name, its type,
// whether it is required, its choices and their colors; a link's collection; a block's collection
// and how it shows) and it closes again. Dragged to move; + Add in a section puts a new one there.
// A field's default value and a number's format are set there too. Rules shows the collection's
// rules file as code, what is wrong under its line; Schema shows the same thing as the schema
// file. Everything changes one draft; Save writes it.

export interface FieldsActions {
  /** Every collection in the space. */
  collections: () => Collection[];
  /** Asks before something is lost; `action` is what the confirming button says. */
  ask: (title: string, message: string, run: () => void, action: string) => void;
  /** Writes the schema, and the records whose choices were renamed; with `rules`, the rules file too. Returns a message when it cannot. */
  saveFields: (dir: string, schema: Schema, renames: ChoiceRenames, rules?: string) => Promise<string | null>;
  /** Every board, by path: whether any links to the collection. */
  boards: () => { [path: string]: Board };
  /** Every task list, by path: what its buttons' rules may add a task to. */
  tasks: () => { readonly [list: string]: unknown };
  /** Who uses the app, for a default of `me()`. */
  me?: () => string | undefined;
  /** Where the collection's rules last stopped on this device; null when they have not since they were saved. */
  lastStop?: (dir: string) => StopNote | null;
  /** Forgets where they last stopped. */
  clearStop?: (dir: string) => void;
}

/** A choice as the window holds it: its name now, the one it had when the window opened, and its color. */
interface Choice {
  id: string;
  name: string;
  was?: string;
  color?: OptionColor;
}

/** A field as the window holds it. A field made here is `fresh`: its key follows its name until it is saved. */
interface DraftField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  choices: Choice[];
  collection: string;
  many: boolean;
  formula: string;
  rollup: { from: string; fn: RollupFn; field: string; open: boolean; where: Condition[]; via?: string };
  lookup: { link: string; field: string };
  /** A default given as the field's own value (Today and Me among them), or as a formula. */
  defaultMode: 'value' | 'formula';
  defaultValue: DefaultValue | null;
  defaultFormula: string;
  format: NumberFormat | null;
  /** A date that may hold a time too. */
  time: boolean;
  /** A text that offers what was written in it before. */
  suggest: boolean;
  /** A link picked from chips. */
  chips: boolean;
  /** The line under it on the form. */
  help: string;
  /** Shown on the record's form only when these hold (design/shown-when.md). */
  when: Condition[];
  fresh: boolean;
}

/** The currencies offered in the list; another is typed by its code. */
const CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP'];
/** The list's choice that turns it into a box for a currency's code. */
const OTHER_CURRENCY = '\u0000other';
const TODAY_DEFAULT = '=today()';
const ME_DEFAULT = '=me()';

/** A default as the window holds it: Today and Me are values, any other `=` a formula. */
function draftDefault(field: Field): Pick<DraftField, 'defaultMode' | 'defaultValue' | 'defaultFormula'> {
  const given = field.default;
  const bare = typeof given === 'string' ? given.replace(/\s/g, '') : '';
  const valued = (field.type === 'date' && bare === TODAY_DEFAULT) || (field.type === 'person' && bare === ME_DEFAULT);
  if (typeof given === 'string' && given.startsWith('=') && !valued) return { defaultMode: 'formula', defaultValue: null, defaultFormula: given.slice(1) };
  return { defaultMode: field.type === 'link' ? 'formula' : 'value', defaultValue: valued ? bare : (given ?? null), defaultFormula: '' };
}

/** What a rollup can be worked out from: a collection whose records link here, or a board whose cards do. */
interface RollupSource {
  value: string;
  label: string;
  /** What it is called in a sentence: "activities". */
  name: string;
  board: boolean;
  fields: Field[];
}

type Block = Exclude<LayoutItem, { field: string }>;

/** An element of the screen: a field, by the id the window gives it, or a block. */
type DraftItem = { id: string; field: string } | { id: string; block: Block };

interface DraftSection {
  id: string;
  title?: string;
  items: DraftItem[];
}

interface DraftColumn {
  id: string;
  width: number;
  sections: DraftSection[];
}

interface Draft {
  fields: DraftField[];
  columns: DraftColumn[];
  /** The fields kept off the record's window, by id: their eye shut (Layout.hidden). */
  hidden: ReadonlySet<string>;
}

/** A screen has three columns at most. */
const MAX_COLUMNS = 3;
const WIDTHS = [1, 2, 3];
const DRAG_TYPE = 'application/x-scrawl-field';

/** An id for a field, a choice, an element, a section or a column of the draft, which nothing else has. */
const newId = () => crypto.randomUUID();

const isChoice = (type: FieldType) => type === 'select' || type === 'multi-select';

/** The height of a row's middle on screen, where a dragged row goes before it or after. */
const middle = (row: HTMLElement) => {
  const box = row.getBoundingClientRect();
  return box.top + box.height / 2;
};

/**
 * The draft of a schema: its fields, and its screen as it opens, with `linked` (what a schema with
 * no layout shows under its body). Fields its layout does not place are in a section of their own,
 * "More fields", as the record shows them.
 */
function toDraft(schema: Schema, linked: LayoutBlock[]): Draft {
  const fields = draftFields(schema.fields);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const placed = new Set<string>();
  const layout = schema.layout ?? defaultLayout(schema.fields, linked);
  const columns = layout.columns.map(
    (column): DraftColumn => ({
      id: newId(),
      width: column.width ?? 1,
      sections: column.sections.map((section) => ({
        id: newId(),
        ...(section.title && { title: section.title }),
        items: section.items.flatMap((item): DraftItem[] => {
          if (!('field' in item)) return [{ id: newId(), block: item }];
          const field = byKey.get(item.field);
          if (!field || placed.has(field.key)) return [];
          placed.add(field.key);
          return [{ id: newId(), field: field.id }];
        }),
      })),
    }),
  );
  if (columns.length === 0) columns.push({ id: newId(), width: 1, sections: [{ id: newId(), items: [] }] });
  const left = fields.filter((f) => !placed.has(f.key));
  if (left.length > 0) {
    const at = Math.max(0, columns.findIndex((c) => c.sections.some((s) => s.items.some((i) => 'field' in i))));
    columns[at]!.sections.push({ id: newId(), title: t('collection.moreFields'), items: left.map((f) => ({ id: newId(), field: f.id })) });
  }
  const off = hiddenOnForm(schema);
  return { fields, columns, hidden: new Set(fields.filter((f) => off.has(f.key)).map((f) => f.id)) };
}

/** Fields as the window holds them, each with an id of its own and its choices with the names they had. */
function draftFields(fields: Field[]): DraftField[] {
  return fields.map(
    (f): DraftField => ({
      id: newId(),
      key: f.key,
      label: f.label,
      type: f.type,
      // A name is required unless it says it may be left empty.
      required: f.type === 'name' ? !f.optional : !!f.required,
      choices: (f.options ?? []).map((name) => ({ id: newId(), name, was: name, color: f.colors?.[name] })),
      collection: f.collection ?? '',
      many: !!f.many,
      formula: f.formula ?? '',
      rollup: { from: f.rollup?.from ?? '', fn: f.rollup?.fn ?? 'count', field: f.rollup?.field ?? '', open: !!f.rollup?.open, where: f.rollup?.where ?? [], ...(f.rollup?.via && { via: f.rollup.via }) },
      lookup: { link: f.lookup?.link ?? '', field: f.lookup?.field ?? '' },
      ...draftDefault(f),
      format: f.format ?? null,
      time: !!f.time,
      suggest: !!f.suggest,
      chips: !!f.chips,
      help: f.help ?? '',
      when: f.when ?? [],
      fresh: false,
    }),
  );
}

/** A field just made in the window: a line of text with no name yet, its key following its name. */
const freshField = (fields: DraftField[]): DraftField => ({
  id: newId(),
  key: keyFor('', new Set(fields.map((f) => f.key))),
  label: '',
  type: 'text',
  required: false,
  choices: [],
  collection: '',
  many: false,
  formula: '',
  rollup: { from: '', fn: 'count', field: '', open: false, where: [] },
  lookup: { link: '', field: '' },
  defaultMode: 'value',
  defaultValue: null,
  defaultFormula: '',
  format: null,
  time: false,
  suggest: false,
  chips: false,
  help: '',
  when: [],
  fresh: true,
});

/** A field's default as the schema holds it: its value, or `=` and its formula; none when empty or worked out. */
function defaultOf(f: DraftField): DefaultValue | undefined {
  if (isComputed(f.type)) return undefined;
  if (f.defaultMode === 'formula' || f.type === 'link') return f.defaultFormula.trim() ? `=${f.defaultFormula.trim()}` : undefined;
  const value = f.defaultValue;
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) return undefined;
  return value;
}

/** A field of the draft as the schema holds it. */
function toField(f: DraftField): Field {
  const names = [...new Set(f.choices.map((c) => c.name.trim()).filter(Boolean))];
  const colors = Object.fromEntries(f.choices.filter((c) => c.color && c.name.trim()).map((c) => [c.name.trim(), c.color!]));
  return {
    key: f.key,
    label: f.label.trim() || f.key,
    type: f.type,
    ...(isChoice(f.type) && { options: names }),
    ...(isChoice(f.type) && Object.keys(colors).length > 0 && { colors }),
    ...(f.required && f.type !== 'name' && !isComputed(f.type) && { required: true }),
    ...(f.type === 'link' && { collection: f.collection, ...(f.many && { many: true }) }),
    ...(f.type === 'formula' && { formula: f.formula }),
    ...(f.type === 'rollup' && {
      rollup: {
        from: f.rollup.from,
        fn: f.rollup.fn,
        ...(f.rollup.fn !== 'count' && f.rollup.field && { field: f.rollup.field }),
        ...(f.rollup.open && f.rollup.from.endsWith(BOARD_EXT) && { open: true }),
        ...(f.rollup.where.some(isComplete) && { where: f.rollup.where.filter(isComplete) }),
        // The link it goes through is kept as the schema gave it; the window does not change it.
        ...(f.rollup.via && { via: f.rollup.via }),
      },
    }),
    ...(f.type === 'lookup' && { lookup: { link: f.lookup.link, field: f.lookup.field } }),
    ...(defaultOf(f) !== undefined && { default: defaultOf(f) }),
    ...(f.format && (f.type === 'number' || isComputed(f.type)) && { format: f.format }),
    ...(f.time && f.type === 'date' && { time: true }),
    ...(f.suggest && (f.type === 'text' || f.type === 'name') && { suggest: true }),
    ...(f.type === 'name' && !f.required && { optional: true }),
    ...(f.chips && (f.type === 'link' || f.type === 'select') && { chips: true }),
    ...(f.help.trim() && { help: f.help.trim() }),
    ...(f.when.some(isComplete) && { when: f.when.filter(isComplete) }),
  };
}

/** The fields a field's Shown when can ask of: a choice, a tick, a link or a text of the same record, not itself. */
const WHEN_TYPES: readonly FieldType[] = ['select', 'multi-select', 'checkbox', 'link', 'text'];
const askable = (field: DraftField, fields: DraftField[]) => fields.filter((f) => f.id !== field.id && WHEN_TYPES.includes(f.type)).map(toField);

/** The draft as a schema, on top of `base` (its template, singular name and views). */
function toSchema(draft: Draft, base: Schema): Schema {
  const byId = new Map(draft.fields.map((f) => [f.id, f]));
  const layout: Layout = {
    columns: draft.columns.map((column) => ({
      width: column.width,
      sections: column.sections.map((section) => ({
        ...(section.title && { title: section.title }),
        items: section.items.flatMap((item): LayoutItem[] => {
          if ('block' in item) return [item.block];
          const field = byId.get(item.field);
          return field ? [{ field: field.key }] : [];
        }),
      })),
    })),
  };
  // The fields off the window are written when they are not the template's own.
  const off = draft.fields.filter((f) => draft.hidden.has(f.id)).map((f) => f.key);
  const usual = hiddenOnForm({ ...base, layout: undefined });
  if (off.length !== usual.size || off.some((k) => !usual.has(k))) layout.hidden = off;
  return { ...base, fields: draft.fields.map(toField), layout };
}

/** The choices renamed in the draft, by field: what each was called when the window opened, and what it is called now. */
function renamesOf(fields: DraftField[]): ChoiceRenames {
  const renames: ChoiceRenames = {};
  for (const field of fields) {
    if (field.fresh || !isChoice(field.type)) continue;
    for (const choice of field.choices) {
      const name = choice.name.trim();
      if (choice.was === undefined || !name || name === choice.was) continue;
      (renames[field.key] ??= {})[choice.was] = name;
    }
  }
  return renames;
}

/** Renames made one after the other as one: a choice renamed twice goes from its first name to its last. */
function compose(first: ChoiceRenames, then: ChoiceRenames): ChoiceRenames {
  const out: ChoiceRenames = {};
  for (const key of new Set([...Object.keys(first), ...Object.keys(then)])) {
    const [a, b] = [first[key] ?? {}, then[key] ?? {}];
    const names: { [from: string]: string } = {};
    for (const [from, to] of Object.entries(a)) names[from] = b[to] ?? to;
    for (const [from, to] of Object.entries(b)) if (!Object.values(a).includes(from) && !(from in names)) names[from] = to;
    for (const [from, to] of Object.entries(names)) if (from === to) delete names[from];
    if (Object.keys(names).length > 0) out[key] = names;
  }
  return out;
}

/** What is wrong with the text as JSON, or null. */
function textProblem(text: string): string | null {
  try {
    const raw: unknown = JSON.parse(text);
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? null : t('fields.badText', { message: '{ }' });
  } catch (error) {
    return t('fields.badText', { message: error instanceof Error ? error.message : '' });
  }
}

/** The draft with every section of every column changed by `change`. */
const withSections = (draft: Draft, change: (section: DraftSection) => DraftSection): Draft => ({
  ...draft,
  columns: draft.columns.map((column) => ({ ...column, sections: column.sections.map(change) })),
});

/** The draft with `item` taken out of where it is and put in `section` at `index`. */
function moveItem(draft: Draft, id: string, sectionId: string, index: number): Draft {
  let moving: DraftItem | undefined;
  let from: { section: string; index: number } | undefined;
  for (const column of draft.columns) {
    for (const section of column.sections) {
      const at = section.items.findIndex((i) => i.id === id);
      if (at >= 0) {
        moving = section.items[at];
        from = { section: section.id, index: at };
      }
    }
  }
  if (!moving || !from) return draft;
  // Its own gap is no move, and a place after it in its own section counts without it.
  const to = from.section === sectionId && from.index < index ? index - 1 : index;
  if (from.section === sectionId && from.index === to) return draft;
  const out = withSections(draft, (section) => ({ ...section, items: section.items.filter((i) => i.id !== id) }));
  return withSections(out, (section) => {
    if (section.id !== sectionId) return section;
    const items = [...section.items];
    items.splice(to, 0, moving!);
    return { ...section, items };
  });
}

/** The words a closed field shows of its type: "select", "link · Companies". */
function typeWords(field: DraftField): string {
  const type = t(`fields.type.${field.type}`).toLowerCase();
  if (field.type === 'link' && field.collection) return `${type} · ${collectionName(field.collection)}`;
  if (field.type === 'rollup' && field.rollup.from) return `${type} · ${field.rollup.from.endsWith(BOARD_EXT) ? boardName(field.rollup.from) : collectionName(field.rollup.from)}`;
  if (field.type === 'lookup' && field.lookup.link) return `${type} · ${field.lookup.link}`;
  if (field.type === 'date' && field.time) return t('fields.dateAndTime');
  if (field.type === 'number' && field.format?.style === 'duration') return `${type} · ${t('fields.style.duration').toLowerCase()}`;
  return type;
}

/** What a formula gives, in the words under its box: "Gives text". */
const givesWords = (kind: Kind) => t(`fields.gives.${typeof kind === 'string' ? kind : 'list' in kind ? 'list' : 'record'}`);

/** Keys or names as a sentence lists them: "spent and budget". */
const listed = (items: string[]) => new Intl.ListFormat(locale(), { type: 'conjunction' }).format(items);

/** A rollup's conditions in words: "direction is Out and due is before today". */
function conditionsWords(where: Condition[], fields: Field[]): string {
  return listed(
    where.filter(isComplete).map((c) => {
      const field = fields.find((f) => f.key === c.field);
      const value = c.value === TODAY ? t('collection.today').toLowerCase() : Array.isArray(c.value) ? new Intl.ListFormat(locale(), { type: 'disjunction' }).format(c.value) : String(c.value ?? '');
      return `${(field?.label ?? c.field).toLowerCase()} ${t(`collection.op.${c.op}`)}${opTakesValue(c.op) ? ` ${value}` : ''}`;
    }),
  );
}

/** What a block is called on the screen, and the line beside it; the buttons by the names the rules give them. */
function blockWords(block: Block, collections: Collection[], buttons: string[]): [string, string] {
  if (block.block === 'body') return [t('fields.addNotes'), t('fields.notesMeta')];
  if (block.block === 'cards') return [t('fields.cards'), t('fields.cardsMeta')];
  if (block.block === 'subtasks') return [t('subtasks.title'), t('fields.subtasksMeta')];
  if (block.block === 'actions') return [t('fields.buttons'), buttons.length > 0 ? buttons.join(', ') : t('fields.noButtons')];
  if (block.block === 'days') return [t('fields.days'), t('fields.daysMeta')];
  const source = collections.find((c) => c.dir === block.collection);
  const style = linkedStyle(block, source);
  const shown = (block.fields ?? []).map((key) => source?.schema.fields.find((f) => f.key === key)?.label.toLowerCase() ?? key);
  const meta = [t('fields.linked'), t(`fields.${style}`).toLowerCase(), ...(style === 'timeline' ? [t('fields.newestFirst')] : shown.length > 0 ? [shown.join(', ')] : [])];
  return [collectionName(block.collection), meta.join(' · ')];
}

/** How linked records show when the block does not say: as a timeline when they have a day. */
function linkedStyle(block: LinkedBlock, source: Collection | undefined): LinkedStyle {
  return block.style ?? (source?.schema.fields.some((f) => f.type === 'date') ? 'timeline' : 'list');
}

// ---------- the parts of a field ----------

/**
 * The type of a field as a box that opens the list of types under it, each saying what it is for;
 * Name and Code, which a collection has one of, are faint when another field is one.
 */
function TypeBox({ field, fields, types = FIELD_TYPES, onPick }: {
  field: DraftField;
  fields: DraftField[];
  /** The types to choose from. */
  types?: readonly FieldType[];
  onPick: (type: FieldType) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const options: Option[] = types.map((type) => {
    const taken = SINGLE_TYPES.includes(type) && fields.some((f) => f.id !== field.id && f.type === type);
    return { value: type, label: t(`fields.type.${type}`), hint: taken ? t('fields.taken') : t(`fields.about.${type}`), chip: false, disabled: taken, apart: type === 'text' };
  });
  return (
    <span className="ftype">
      <button
        ref={box}
        type="button"
        className="in sel"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('fields.type')}
        onClick={() => setOpen(!open)}
        onKeyDown={boxKeys(open, setOpen, keys)}
      >
        {t(`fields.type.${field.type}`)}
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={[field.type]}
          label={t('fields.type')}
          keys={keys}
          width={310}
          end
          className="ftypes"
          onPick={(type) => {
            setOpen(false);
            if (type) onPick(type as FieldType);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/** The colors a choice can have, under its dot: the nine by name, and "By its text". Esc or a click away closes it. */
function Palette({ anchor, current, name, onPick, onClose }: {
  anchor: HTMLElement;
  current: OptionColor | undefined;
  name: string;
  onPick: (color: OptionColor | undefined) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const dot = pageBox(anchor);
    const width = box.current?.offsetWidth ?? 220;
    setPlace({ top: dot.bottom + 6, left: Math.max(8, Math.min(dot.left - 8, pageWindow().width - width - 8)) });
  }, [anchor]);
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) close.current();
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close.current();
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [anchor]);
  return createPortal(
    <div ref={box} className="opt-list fpal" role="dialog" aria-label={t('fields.color', { name })} style={place ?? { opacity: 0 }}>
      {OPTION_COLORS.map((color) => (
        <button key={color} type="button" className={color === current ? 'sw on' : 'sw'} title={color} aria-label={color} aria-pressed={color === current} style={hueStyle(color, name)} onClick={() => onPick(color)} />
      ))}
      <button type="button" className={current ? 'sw-text' : 'sw-text on'} onClick={() => onPick(undefined)}>
        {t('fields.byText')}
      </button>
    </div>,
    document.body,
  );
}

/**
 * The choices of a select or a multi-select, in order: each with its color as a dot that opens
 * the colors, its name to type over, and a way to take it off; dragged to order them.
 */
function Choices({ field, onChange }: { field: DraftField; onChange: (choices: Choice[]) => void }) {
  const [coloring, setColoring] = useState<{ id: string; dot: HTMLElement } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ index: number; y: number } | null>(null);
  const dragging = useRef<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const change = (id: string, patch: Partial<Choice>) => onChange(field.choices.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const add = () => {
    const choice = { id: newId(), name: '' };
    setFresh(choice.id);
    onChange([...field.choices, choice]);
  };
  // The same as `drop`, for a finger letting go, which comes before the state is drawn.
  const dropping = useRef<{ index: number; y: number } | null>(null);
  /** The gap at height `y`, a pointer's or a finger's. */
  const overAt = (y: number) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-choice]') ?? [])];
    let index = rows.findIndex((row) => y < middle(row));
    if (index < 0) index = rows.length;
    const row = rows[Math.min(index, rows.length - 1)];
    const next = { index, y: !row ? 0 : index < rows.length ? row.offsetTop - 2 : row.offsetTop + row.offsetHeight + 1 };
    dropping.current = next;
    setDrop((now) => (now?.index === index ? now : next));
  };
  const over = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    event.preventDefault();
    event.stopPropagation();
    overAt(event.clientY);
  };
  const release = () => {
    dragging.current = null;
    dropping.current = null;
    setDrop(null);
    list.current?.querySelector('.lifted')?.classList.remove('lifted');
  };
  const land = () => {
    const id = dragging.current;
    const at = dropping.current;
    if (id && at) {
      const from = field.choices.findIndex((c) => c.id === id);
      const to = from < at.index ? at.index - 1 : at.index;
      if (from >= 0 && from !== to) {
        const next = field.choices.filter((c) => c.id !== id);
        next.splice(to, 0, field.choices[from]!);
        onChange(next);
      }
    }
    release();
  };
  const dropped = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current || !dropping.current) return;
    event.preventDefault();
    event.stopPropagation();
    land();
  };
  // A finger held on a choice's grip lifts it.
  const hold = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const row = event.currentTarget.closest<HTMLElement>('[data-choice]')!;
    holdToDrag(event, {
      element: row,
      onLift: (_x, y) => {
        dragging.current = id;
        row.classList.add('lifted');
        overAt(y);
      },
      onMove: (_x, y) => overAt(y),
      onDrop: land,
      onCancel: release,
    });
  };
  const colored = coloring ? field.choices.find((c) => c.id === coloring.id) : undefined;
  return (
    <div ref={list} className="fopts" onDragOver={over} onDrop={dropped} onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setDrop(null)}>
      {field.choices.map((choice) => (
        <div key={choice.id} data-choice={choice.id} className="fopt">
          <span
            className="grip"
            draggable
            onDragStart={(event) => {
              dragging.current = choice.id;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData(DRAG_TYPE, choice.id);
              event.stopPropagation();
            }}
            onDragEnd={release}
            onPointerDown={(event) => hold(event, choice.id)}
          >
            {GRIP}
          </span>
          <button
            type="button"
            className={coloring?.id === choice.id ? 'dot picking' : 'dot'}
            style={hueStyle(choice.color, choice.name)}
            title={t('fields.color', { name: choice.name })}
            aria-label={t('fields.color', { name: choice.name })}
            onClick={(event) => setColoring(coloring?.id === choice.id ? null : { id: choice.id, dot: event.currentTarget })}
          />
          <input
            className="on-name"
            aria-label={t('fields.choiceName')}
            placeholder={t('fields.newChoice')}
            autoFocus={choice.id === fresh}
            value={choice.name}
            onChange={(event) => change(choice.id, { name: event.target.value })}
            onKeyDown={(event) => {
              // Enter on the last choice starts another.
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (choice.id === field.choices[field.choices.length - 1]?.id && choice.name.trim()) add();
            }}
          />
          <button type="button" className="x" title={t('collection.removeChoice', { name: choice.name })} aria-label={t('collection.removeChoice', { name: choice.name })} onClick={() => onChange(field.choices.filter((c) => c.id !== choice.id))}>
            ×
          </button>
        </div>
      ))}
      {drop && <div className="fdrop" style={{ top: drop.y }} />}
      <button type="button" className="fopt-add" onClick={add}>
        {t('fields.addChoice')}
      </button>
      {coloring && colored && (
        <Palette
          anchor={coloring.dot}
          current={colored.color}
          name={colored.name}
          onPick={(color) => {
            change(colored.id, { color });
            setColoring(null);
          }}
          onClose={() => setColoring(null)}
        />
      )}
    </div>
  );
}

/** A field opened where it is: its name, type and key, whether it is required, then what its type needs. */
function FieldEditor({ field, fields, collections, types, sources = [], schemaOf, preview, onChange, onDelete }: {
  field: DraftField;
  fields: DraftField[];
  collections: Collection[];
  types?: readonly FieldType[];
  /** What a rollup can be worked out from. */
  sources?: RollupSource[];
  /** The fields of the other collections and boards, for a formula's dot, a lookup and a rollup's conditions. */
  schemaOf: SchemaOf;
  /** What a new record would get for a field's default, as text; a collection's fields have defaults, a board's do not. */
  preview?: (field: Field) => string | null;
  onChange: (patch: Partial<DraftField>) => void;
  onDelete: () => void;
}) {
  const rename = (label: string) => {
    if (!field.fresh) return onChange({ label });
    const taken = new Set(fields.filter((f) => f.id !== field.id).map((f) => f.key));
    onChange({ label, key: keyFor(label, taken) });
  };
  const retype = (type: FieldType) => onChange({ type, ...(type === 'name' && { required: true }) });
  const targets: Option[] = collections.filter((c) => isLinkable(c.schema)).map((c) => ({ value: c.dir, label: collectionLabel(c.dir), chip: false }));
  if (field.collection && !targets.some((o) => o.value === field.collection)) targets.push({ value: field.collection, label: collectionLabel(field.collection), chip: false });
  // What a formula gives and reads, or what is wrong with it.
  const info = field.type === 'formula' && field.formula.trim() ? formulaInfo(field.formula, { fields: fields.map(toField), self: field.key, schemaOf }) : null;
  const problem = info && 'problem' in info ? info.problem : null;
  // A number, or what is worked out giving one, takes a format.
  const numeric = field.type === 'number' || (isComputed(field.type) && shownField(toField(field), { fields: fields.map(toField), schemaOf }).type === 'number');
  // A lookup: the link it goes through, and the field of the linked record it shows.
  const links = fields.filter((f) => f.type === 'link' && f.collection);
  const through = links.find((f) => f.key === field.lookup.link);
  const target = through ? schemaOf(through.collection) : undefined;
  const looked = target?.fields.find((f) => f.key === field.lookup.field);
  const linkOptions: Option[] = links.map((f) => ({ value: f.key, label: t('fields.throughLink', { link: f.label.trim() || f.key, collection: collectionName(f.collection) }), chip: false }));
  const lookedOptions: Option[] = (target?.fields ?? []).map((f) => ({ value: f.key, label: f.label, chip: false }));
  // A rollup: where it is worked out from, what it does, and with which of their fields.
  const roll = field.rollup;
  const source = sources.find((o) => o.value === roll.from);
  const sourceOptions: Option[] = sources.map((o) => ({ value: o.value, label: o.label, chip: false }));
  if (roll.from && !source) sourceOptions.push({ value: roll.from, label: roll.from.endsWith(BOARD_EXT) ? boardLabel(roll.from) : collectionLabel(roll.from), chip: false });
  const fnOptions: Option[] = ROLLUP_FNS.map((fn) => ({ value: fn, label: t(`fields.fn.${fn}`), chip: false }));
  const counted = (source?.fields ?? []).filter((f) => f.type === 'number' || f.type === 'date' || isComputed(f.type));
  const ofOptions: Option[] = counted.map((f) => ({ value: f.key, label: f.label, chip: false }));
  const ofField = counted.find((f) => f.key === roll.field);
  const sourceName = source?.name.toLowerCase() ?? '';
  const said = !source
    ? null
    : roll.fn === 'count'
      ? t('fields.rollupCount', { source: sourceName })
      : ofField && t('fields.rollupOf', { fn: t(`fields.fn.${roll.fn}`).toLowerCase(), field: ofField.label.toLowerCase(), source: sourceName });
  const whereWords = source ? conditionsWords(roll.where, source.fields) : '';
  const rollNote = said && whereWords ? `${said.replace(/\.$/, '')}${t('fields.rollupWhere', { conditions: whereWords })}` : said;
  // Its conditions ask of the source's fields as they show; a link's records come from the collections at hand.
  const sourceShown = (f: Field) => (source ? shownField(f, { fields: source.fields, schemaOf }) : f);
  const recordsOf = (dir: string): Record[] | null => collections.find((c) => c.dir === dir)?.records ?? null;
  const firstAsked = source?.fields.find((f) => f.type !== 'name') ?? source?.fields[0];
  const setWhere = (where: Condition[]) => onChange({ rollup: { ...roll, where } });
  // Money in each record's own currency, summed with nothing keeping it to one.
  const mixed = field.type === 'rollup' ? mixedCurrency(toField(field), schemaOf) : null;
  return (
    <div className="fe">
      <div className="fe-top">
        <input className="in" aria-label={t('fields.fieldName')} placeholder={t('fields.fieldName')} autoFocus={field.fresh && !field.label} value={field.label} onChange={(event) => rename(event.target.value)} />
        <TypeBox field={field} fields={fields} types={types} onPick={retype} />
        <button type="button" className="fdel" title={t('fields.deleteField')} aria-label={t('fields.deleteField')} onClick={onDelete}>
          <Icon name="trash" />
        </button>
      </div>
      <div className="fe-row">
        {!isComputed(field.type) && (
          <label className="fcheck" title={field.type === 'name' && !field.required ? t('fields.nameOptional') : undefined}>
            <input type="checkbox" checked={field.required} onChange={(event) => onChange({ required: event.target.checked })} />
            {t('fields.required')}
          </label>
        )}
        {(field.type === 'link' || field.type === 'select') && (
          <label className="fcheck" title={t('fields.chipsHint')}>
            <input type="checkbox" checked={field.chips} onChange={(event) => onChange({ chips: event.target.checked })} />
            {t('fields.chips')}
          </label>
        )}
        {(field.type === 'text' || field.type === 'name') && (
          <label className="fcheck" title={t('fields.suggestHint')}>
            <input type="checkbox" checked={field.suggest} onChange={(event) => onChange({ suggest: event.target.checked })} />
            {t('fields.suggest')}
          </label>
        )}
        <span className="fkey" title={t('fields.key')}>
          {field.key}
        </span>
      </div>
      <div className="fe-row">
        <input className="in fhelp" aria-label={t('fields.help')} placeholder={t('fields.help')} value={field.help} onChange={(event) => onChange({ help: event.target.value })} />
      </div>
      {field.type === 'date' && (
        <>
          <div className="fe-row">
            <label className="fcheck">
              <input type="checkbox" checked={field.time} onChange={(event) => onChange({ time: event.target.checked })} />
              {t('fields.withTime')}
            </label>
          </div>
          {field.time && <p className="fi-note">{t('fields.withTimeHelp')}</p>}
        </>
      )}
      {isChoice(field.type) && (
        <>
          <Choices field={field} onChange={(choices) => onChange({ choices })} />
          {!field.fresh && field.choices.some((c) => c.was !== undefined) && <p className="fi-note">{t('fields.renameNote')}</p>}
        </>
      )}
      {field.type === 'link' && (
        <div className="fe-row">
          <span className="fe-name">{t('fields.linkTo')}</span>
          <Picker className="in" options={targets} value={field.collection || null} label={t('fields.pickCollection')} onPick={(dir) => dir && onChange({ collection: dir })} />
          <label className="fcheck">
            <input type="checkbox" checked={field.many} onChange={(event) => onChange({ many: event.target.checked })} />
            {t('fields.many')}
          </label>
        </div>
      )}
      {field.type === 'rollup' && (
        <>
          <div className="fe-row">
            <span className="fe-name">{t('fields.from')}</span>
            <Picker className="in" options={sourceOptions} value={roll.from || null} label={sources.length > 0 ? t('fields.from') : t('fields.nothingLinks')} onPick={(from) => from && onChange({ rollup: { ...roll, from, field: '' } })} />
          </div>
          <div className="fe-row">
            <span className="fe-name">{t('fields.fn')}</span>
            <Picker className="in" options={fnOptions} value={roll.fn} label={t('fields.fn')} onPick={(fn) => fn && onChange({ rollup: { ...roll, fn: fn as RollupFn } })} />
            {roll.fn !== 'count' && <Picker className="in" options={ofOptions} value={roll.field || null} label={t('fields.of')} onPick={(key) => key && onChange({ rollup: { ...roll, field: key } })} />}
          </div>
          {source?.board && (
            <label className="fcheck">
              <input type="checkbox" checked={roll.open} onChange={(event) => onChange({ rollup: { ...roll, open: event.target.checked } })} />
              {t('fields.openOnly')}
            </label>
          )}
          {source && firstAsked && (
            <div className="fe-row top">
              <span className="fe-name">{t('fields.where')}</span>
              <div className="fe-where">
                {roll.where.map((condition, i) => (
                  <ConditionRow
                    key={i}
                    schema={{ fields: source.fields }}
                    condition={condition}
                    records={recordsOf}
                    shown={sourceShown}
                    onChange={(next) => setWhere(roll.where.map((c, j) => (j === i ? next : c)))}
                    onRemove={() => setWhere(roll.where.filter((_, j) => j !== i))}
                  />
                ))}
                <button type="button" className="cond-add" onClick={() => setWhere([...roll.where, { field: firstAsked.key, op: opsFor(sourceShown(firstAsked).type)[0]! }])}>
                  {t('collection.addCondition')}
                </button>
              </div>
            </div>
          )}

        </>
      )}
      {field.type === 'lookup' && (
        <>
          <div className="fe-row">
            <span className="fe-name">{t('fields.through')}</span>
            <Picker className="in" options={linkOptions} value={through ? through.key : null} label={links.length > 0 ? t('fields.through') : t('fields.noLinks')} onPick={(key) => key && onChange({ lookup: { link: key, field: '' } })} />
          </div>
          <div className="fe-row">
            <span className="fe-name">{t('fields.shows')}</span>
            <Picker className="in" options={lookedOptions} value={looked ? looked.key : null} label={t('fields.shows')} onPick={(key) => key && onChange({ lookup: { ...field.lookup, field: key } })} />
          </div>
          {through && looked && (
            <p className="fi-note">{t('fields.lookupNote', { field: looked.label.toLowerCase(), link: (through.label.trim() || through.key).toLowerCase(), path: `${through.key}.${looked.key}` })}</p>
          )}
        </>
      )}
      {field.type === 'formula' && (
        <>
          <input className="in mono" aria-label={t('fields.type.formula')} spellCheck={false} autoComplete="off" placeholder="qty * price" value={field.formula} onChange={(event) => onChange({ formula: event.target.value })} />
          {problem ? (
            <p className="fi-note bad">{problem}</p>
          ) : (
            info &&
            'kind' in info && (
              <p className="fi-note">
                <b>{givesWords(info.kind)}</b>
                {info.reads.length > 0 && ` · ${t('fields.reads', { fields: listed(info.reads) })}`}
              </p>
            )
          )}
          <p className="fi-note">{t('fields.formulaHint')}</p>
        </>
      )}
      {preview && !isComputed(field.type) && <DefaultRow field={field} fields={fields} schemaOf={schemaOf} preview={preview} onChange={onChange} />}
      {preview && field.type !== 'name' && <WhenRow field={field} fields={fields} records={recordsOf} onChange={onChange} />}
      {numeric && <FormatRow field={field} fields={fields} onChange={onChange} />}
      {field.type === 'rollup' && rollNote && <p className="fi-note">{rollNote}</p>}
      {mixed && <p className="fi-note warn">{mixed}</p>}
    </div>
  );
}

/**
 * A field's Shown when (design/shown-when.md 2): the conditions of the record's other fields it is
 * on the form with, all of them; what it does, and that what is written in it stays.
 */
function WhenRow({ field, fields, records, onChange }: {
  field: DraftField;
  fields: DraftField[];
  records: (dir: string) => Record[] | null;
  onChange: (patch: Partial<DraftField>) => void;
}) {
  const asked = askable(field, fields);
  const keys = new Set(asked.map((f) => f.key));
  // A condition on a field gone, or one it cannot ask of, is said and goes on Save.
  const shown = field.when.filter((c) => keys.has(c.field));
  const gone = field.when.filter((c) => !keys.has(c.field));
  const setWhen = (when: Condition[]) => onChange({ when: [...when, ...gone] });
  const first = asked[0];
  if (!first && field.when.length === 0) return null;
  const words = conditionsWords(shown, asked);
  const name = field.label.trim() || t('fields.fieldName');
  return (
    <>
      <div className="fe-row top">
        <span className="fe-name">{t('fields.shownWhen')}</span>
        <div className="fe-where">
          {shown.map((condition, i) => (
            <ConditionRow
              key={i}
              schema={{ fields: asked }}
              condition={condition}
              records={records}
              onChange={(next) => setWhen(shown.map((c, j) => (j === i ? next : c)))}
              onRemove={() => setWhen(shown.filter((_, j) => j !== i))}
            />
          ))}
          {first && (
            <button type="button" className="cond-add" onClick={() => setWhen([...shown, { field: first.key, op: opsFor(first.type)[0]! }])}>
              {t('collection.addCondition')}
            </button>
          )}
        </div>
      </div>
      {words && <p className="fi-note">{t('fields.shownWhenNote', { field: name, conditions: words })}</p>}
      {words && <p className="fi-note">{t('fields.shownWhenKeeps', { field: name })}</p>}
      {gone.length > 0 && <p className="fi-note bad">{t('fields.shownWhenGone', { fields: listed(gone.map((c) => c.field)) })}</p>}
    </>
  );
}

/** A field's default: its own value (Today for a day, Me for a person), or a formula; what a new record gets, or what is wrong. */
function DefaultRow({ field, fields, schemaOf, preview, onChange }: {
  field: DraftField;
  fields: DraftField[];
  schemaOf: SchemaOf;
  preview: (field: Field) => string | null;
  onChange: (patch: Partial<DraftField>) => void;
}) {
  const formula = field.defaultMode === 'formula' || field.type === 'link';
  const own = toField(field);
  const problem = own.default !== undefined ? defaultProblem(own, { fields: fields.map(toField) }, schemaOf) : null;
  const gets = own.default !== undefined && !problem ? preview(own) : null;
  const value = field.defaultValue;
  const none: Option = { value: null, label: t('fields.noDefault'), chip: false };
  let box: ReactNode;
  if (formula) {
    box = <input className="in mono" aria-label={t('fields.default')} spellCheck={false} autoComplete="off" placeholder={field.type === 'date' ? 'start + 30' : 'next("PRJ-", 4)'} value={field.defaultFormula} onChange={(event) => onChange({ defaultFormula: event.target.value })} />;
  } else if (field.type === 'select' || field.type === 'multi-select') {
    const names = field.choices.map((c) => c.name.trim()).filter(Boolean);
    const picked = Array.isArray(value) ? (value[0] ?? null) : typeof value === 'string' ? value : null;
    box = <Picker className="in" options={[none, ...names.map((name) => ({ value: name, label: name, chip: true, color: field.choices.find((c) => c.name.trim() === name)?.color }))]} value={picked} label={t('fields.noDefault')} onPick={(name) => onChange({ defaultValue: name === null ? null : field.type === 'multi-select' ? [name] : name })} />;
  } else if (field.type === 'checkbox') {
    box = <Picker className="in" options={[none, { value: 'true', label: t('collection.yes'), chip: false }, { value: 'false', label: t('collection.no'), chip: false }]} value={typeof value === 'boolean' ? String(value) : null} label={t('fields.noDefault')} onPick={(v) => onChange({ defaultValue: v === null ? null : v === 'true' })} />;
  } else if (field.type === 'date') {
    box = <DayValue value={value === TODAY_DEFAULT ? TODAY : typeof value === 'string' ? value : undefined} todayHint={t('fields.todayMade')} none={t('fields.noDefault')} onChange={(v) => onChange({ defaultValue: v === TODAY ? TODAY_DEFAULT : (v ?? null) })} />;
  } else if (field.type === 'person') {
    box = <Picker className="in" options={[none, { value: ME_DEFAULT, label: t('fields.defaultMe'), hint: t('fields.defaultMeHint'), chip: false }]} value={value === ME_DEFAULT ? ME_DEFAULT : null} text={typeof value === 'string' && value !== ME_DEFAULT ? value : undefined} label={t('fields.noDefault')} onPick={(v) => onChange({ defaultValue: v })} />;
  } else if (field.type === 'time') {
    box = <input className="in" type="time" aria-label={t('fields.default')} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange({ defaultValue: event.target.value || null })} />;
  } else if (field.type === 'number') {
    box = <input className="in" type="number" aria-label={t('fields.default')} placeholder={t('fields.noDefault')} value={typeof value === 'number' ? value : ''} onChange={(event) => onChange({ defaultValue: event.target.value === '' ? null : Number(event.target.value) })} />;
  } else {
    box = <input className="in" aria-label={t('fields.default')} placeholder={t('fields.noDefault')} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange({ defaultValue: event.target.value })} />;
  }
  return (
    <>
      <div className="fe-row">
        <span className="fe-name">{t('fields.default')}</span>
        {field.type !== 'link' && (
          <span className="vsw" role="group" aria-label={t('fields.default')}>
            <button type="button" className={formula ? undefined : 'on'} aria-pressed={!formula} onClick={() => onChange({ defaultMode: 'value' })}>
              {t('fields.defaultValue')}
            </button>
            <button type="button" className={formula ? 'on' : undefined} aria-pressed={formula} onClick={() => onChange({ defaultMode: 'formula' })}>
              {t('fields.defaultFormula')}
            </button>
          </span>
        )}
        <span className="fe-val">{box}</span>
      </div>
      {problem ? <p className="fi-note bad">{problem}</p> : gets && <p className="fi-note"><b>{t('fields.defaultGets', { value: gets })}</b></p>}
      {own.default !== undefined && <p className="fi-note">{t('fields.defaultNote')}</p>}
      {formula && <p className="fi-note">{t('fields.defaultHint')}</p>}
    </>
  );
}

/** A number's format: plain, money or a share; money's currency, the field's or one each record holds; how many decimals. */
function FormatRow({ field, fields, onChange }: { field: DraftField; fields: DraftField[]; onChange: (patch: Partial<DraftField>) => void }) {
  const format = field.format;
  // Another currency is typed by its code, three letters.
  const [typing, setTyping] = useState(false);
  const set = (patch: Partial<NumberFormat>) => {
    const next: NumberFormat = { style: 'number', ...format, ...patch };
    if (next.style !== 'currency') {
      delete next.currency;
      delete next.currencyField;
    }
    if (next.decimals === undefined) delete next.decimals;
    onChange({ format: next.style === 'number' && next.decimals === undefined ? null : next });
  };
  const styles: Option[] = FORMAT_STYLES.map((style) => ({ value: style, label: t(`fields.style.${style}`), chip: false }));
  const names = (() => {
    try {
      return new Intl.DisplayNames([locale()], { type: 'currency' });
    } catch {
      return null;
    }
  })();
  const holders = fields.filter((f) => f.id !== field.id && (f.type === 'select' || f.type === 'text'));
  const named = (code: string) => (names?.of(code) && names.of(code) !== code ? `${code} · ${names.of(code)}` : code);
  const currencies: Option[] = [
    ...[...CURRENCIES, ...(format?.currency && !CURRENCIES.includes(format.currency) ? [format.currency] : [])].map((code) => ({ value: code, label: named(code), chip: false })),
    { value: OTHER_CURRENCY, label: t('fields.otherCurrency'), chip: false },
    ...holders.map((f, i) => ({ value: `field:${f.key}`, label: t('fields.fromField', { field: f.label.trim() || f.key }), chip: false, apart: i === 0 })),
  ];
  const held = format?.currencyField ? fields.find((f) => f.key === format.currencyField) : undefined;
  const currency = format?.currencyField ? `field:${format.currencyField}` : (format?.currency ?? null);
  // What a number looks like on this device: money in its currency, or in the first choice of the field holding one.
  const sampleCurrency = format?.currency ?? held?.choices.map((c) => c.name.trim()).find((c) => /^[A-Za-z]{3}$/.test(c))?.toUpperCase();
  const sample = format ? formatNumber(format.style === 'percent' ? 0.185 : format.style === 'duration' ? 90 : format.decimals ? 1240000.5 : 1240000, format, sampleCurrency) : null;
  return (
    <>
      <div className="fe-row">
        <span className="fe-name">{t('fields.format')}</span>
        <Picker className="in fe-fmt" options={styles} value={format?.style ?? 'number'} label={t('fields.format')} onPick={(style) => style && set({ style: style as NumberFormat['style'] })} />
        {format?.style === 'currency' &&
          (typing ? (
            <input
              className="in mono"
              aria-label={t('fields.currency')}
              placeholder="CHF"
              maxLength={3}
              autoFocus
              spellCheck={false}
              onBlur={() => setTyping(false)}
              onChange={(event) => {
                const code = event.target.value.trim().toUpperCase();
                if (/^[A-Z]{3}$/.test(code)) {
                  set({ currency: code, currencyField: undefined });
                  setTyping(false);
                }
              }}
            />
          ) : (
            <Picker
              className="in"
              options={currencies}
              value={currency}
              text={held ? t('fields.fromField', { field: held.label.trim() || held.key }) : undefined}
              label={t('fields.currency')}
              onPick={(v) => {
                if (v === OTHER_CURRENCY) setTyping(true);
                else if (v) set(v.startsWith('field:') ? { currencyField: v.slice(6), currency: undefined } : { currency: v, currencyField: undefined });
              }}
            />
          ))}
      </div>
      {format?.style !== 'duration' && (
      <div className="fe-row">
        <span className="fe-name">{t('fields.decimals')}</span>
        <span className="vsw" role="group" aria-label={t('fields.decimals')}>
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className={format?.decimals === n ? 'on' : undefined} aria-pressed={format?.decimals === n} onClick={() => set({ decimals: format?.decimals === n ? undefined : n })}>
              {n}
            </button>
          ))}
        </span>
      </div>
      )}
      {format?.style === 'duration' ? <p className="fi-note">{t('fields.durationHelp')}</p> : sample && <p className="fi-note">{t('fields.formatNote', { sample })}</p>}
    </>
  );
}

/**
 * A block opened where it is: linked records with their collection, how they show and in what
 * order; the notes and cards with a way off the screen; the buttons with where they are written.
 */
function BlockEditor({ block, dir, collections, buttons, onRules, onChange, onDelete }: {
  block: Block;
  dir: string;
  collections: Collection[];
  /** The names of the buttons the rules give, in their order. */
  buttons: string[];
  /** Opens the Rules tab. */
  onRules: () => void;
  onChange: (block: Block) => void;
  onDelete: () => void;
}) {
  const trash = (
    <button type="button" className="fdel" title={t('fields.removeBlock')} aria-label={t('fields.removeBlock')} onClick={onDelete}>
      <Icon name="trash" />
    </button>
  );
  if (block.block !== 'linked') {
    const [name, meta] = blockWords(block, collections, buttons);
    return (
      <div className="fe">
        <div className="fe-top">
          <b className="fe-name">{name}</b>
          <span className="fe-meta">{meta}</span>
          {trash}
        </div>
        {block.block === 'actions' && (
          <p className="fi-note">
            {t('fields.buttonsNote')}{' '}
            <button type="button" className="fe-link" onClick={onRules}>
              {t('fields.rules')}
            </button>
            : <code>action("Label", …)</code>.
          </p>
        )}
      </div>
    );
  }
  const source = collections.find((c) => c.dir === block.collection);
  const sources: Option[] = linkingCollections(collections, dir).map((c) => ({ value: c.dir, label: collectionLabel(c.dir), chip: false }));
  if (!sources.some((o) => o.value === block.collection)) sources.push({ value: block.collection, label: collectionLabel(block.collection), chip: false });
  const style = linkedStyle(block, source);
  const fields = source?.schema.fields ?? [];
  const days = fields.filter((f) => f.type === 'date');
  // A list or a table goes by a field, or by a day newest first: an exercise's workouts.
  const down = ':desc';
  const sorts: Option[] =
    style === 'timeline'
      ? days.map((f) => ({ value: f.key, label: t('fields.sortNewest', { field: f.label }), chip: false }))
      : fields
          .filter((f) => f.type !== 'formula')
          .flatMap((f) => [
            { value: f.key, label: t('fields.sortName', { field: f.label }), chip: false },
            ...(f.type === 'date' ? [{ value: f.key + down, label: t('fields.sortNewest', { field: f.label }), chip: false }] : []),
          ]);
  const picked = block.sort && style !== 'timeline' && block.dir === 'desc' ? block.sort + down : block.sort;
  const sort = picked && sorts.some((o) => o.value === picked) ? picked : ((style === 'timeline' ? days[0]?.key : (source && nameField(source.schema)?.key)) ?? null);
  const resort = (value: string) => {
    const { dir: _dir, ...rest } = block;
    onChange(value.endsWith(down) ? { ...rest, sort: value.slice(0, -down.length), dir: 'desc' } : { ...rest, sort: value });
  };
  const back = source ? linkFieldsTo(source.schema, dir).map((f) => f.label.toLowerCase()) : [];
  const lines = !!source && showsLines(block, collections.find((c) => c.dir === dir)?.schema.role, source.schema.role);
  const name = collectionName(block.collection);
  const note =
    back.length === 0
      ? t('fields.linkedNone', { collection: name })
      : t(style === 'timeline' ? 'fields.linkedTimeline' : style === 'table' ? 'fields.linkedTable' : 'fields.linkedList', { collection: name.toLowerCase(), field: back.join(' / ') });
  const restyle = (next: LinkedStyle) => {
    const { sort: _sort, dir: _dir, fields: _fields, sums: _sums, group: _group, edit: _edit, ...rest } = block;
    // A list and a table keep the fields they show, and the order; a table its sums, its groups and what it changes.
    const kept = next !== 'timeline' && style !== 'timeline';
    onChange({ ...rest, style: next, ...(kept && block.fields && { fields: block.fields }), ...(kept && block.sort && { sort: block.sort, ...(block.dir && { dir: block.dir }) }), ...(next === 'table' && block.sums && { sums: true }), ...(next === 'table' && block.group && { group: block.group }), ...(next === 'table' && block.edit && { edit: block.edit }) });
  };
  // A table's rows in groups by a field or two (design/gym.md 4.2): a choice, a link, a person or a tick.
  const groupable: Option[] = [{ value: '', label: t('fields.noGroup'), chip: false }, ...fields.filter((f) => ['select', 'link', 'person', 'checkbox'].includes(f.type) && !(source && linkFieldsTo(source.schema, dir).includes(f))).map((f) => ({ value: f.key, label: t('fields.groupBy', { field: f.label }), chip: false }))];
  const regroup = (level: 0 | 1, key: string | null) => {
    const { group: _group, ...rest } = block;
    const now = [...(block.group ?? [])];
    if (key) now[level] = key;
    else now.splice(level);
    const group = now.filter((k, i) => k && now.indexOf(k) === i).slice(0, 2);
    onChange(group.length > 0 ? { ...rest, group } : rest);
  };
  return (
    <div className="fe">
      <div className="fe-top">
        <b className="fe-name">{t('fields.linkedName')}</b>
        <Picker className="in" options={sources} value={block.collection} label={t('fields.addLinked')} onPick={(collection) => collection && onChange({ block: 'linked', collection, ...(block.style && { style: block.style }) })} />
        {trash}
      </div>
      <div className="fe-row">
        <span className="vsw" role="group">
          <button type="button" className={style === 'timeline' ? 'on' : undefined} aria-pressed={style === 'timeline'} onClick={() => restyle('timeline')}>
            {t('fields.timeline')}
          </button>
          <button type="button" className={style === 'list' ? 'on' : undefined} aria-pressed={style === 'list'} onClick={() => restyle('list')}>
            {t('fields.list')}
          </button>
          <button type="button" className={style === 'table' ? 'on' : undefined} aria-pressed={style === 'table'} onClick={() => restyle('table')}>
            {t('fields.table')}
          </button>
        </span>
        {sorts.length > 0 ? (
          <Picker className="in" options={sorts} value={sort} label={t('fields.order')} onPick={(key) => key && resort(key)} />
        ) : (
          style === 'timeline' && <span className="fe-meta">{t('fields.noDate')}</span>
        )}
      </div>
      {style !== 'timeline' && fields.length > 0 && (
        <div className="fe-row">
          <MultiPicker
            className="in"
            options={fields.filter((f) => f.type !== 'name').map((f) => ({ value: f.key, label: f.label, chip: false }))}
            picked={block.fields ?? []}
            label={t('fields.shown')}
            onChange={(picked) => {
              const { fields: _fields, ...rest } = block;
              onChange(picked.length > 0 ? { ...rest, fields: picked } : rest);
            }}
          />
        </div>
      )}
      {/* The ticks and choices the table changes where they are, a workout's moves ticked off; none unless picked. */}
      {style === 'table' && fields.some(changesInTable) && (
        <div className="fe-row">
          <span className="fe-name">{t('fields.edited')}</span>
          <MultiPicker
            className="in"
            options={fields.filter(changesInTable).map((f) => ({ value: f.key, label: f.label, chip: false }))}
            picked={(block.edit ?? []).filter((k) => fields.some((f) => f.key === k && changesInTable(f)))}
            label={t('fields.edited')}
            empty={t('collection.none')}
            onChange={(picked) => {
              const { edit: _edit, ...rest } = block;
              onChange(picked.length > 0 ? { ...rest, edit: picked } : rest);
            }}
          />
        </div>
      )}
      {style === 'table' && (
        <label className="fcheck">
          <input
            type="checkbox"
            checked={!!block.sums}
            onChange={(event) => {
              const { sums: _sums, ...rest } = block;
              onChange(event.target.checked ? { ...rest, sums: true } : rest);
            }}
          />
          {t('fields.sums')}
        </label>
      )}
      {/* Its records are the record's lines (design/app-home.md 4): typed in a new record's window before Create and under its row in the table. */}
      {source && (
        <label className="fcheck">
          <input type="checkbox" checked={lines} onChange={(event) => onChange({ ...block, lines: event.target.checked })} />
          {t('fields.lines')}
        </label>
      )}
      {style === 'table' && groupable.length > 1 && (
        <div className="fe-row">
          <Picker className="in" options={groupable} value={block.group?.[0] ?? ''} label={t('fields.grouped')} onPick={(key) => regroup(0, key || null)} />
          {block.group?.[0] && <Picker className="in" options={groupable.filter((o) => o.value !== block.group![0])} value={block.group[1] ?? ''} label={t('fields.groupedThen')} onPick={(key) => regroup(1, key || null)} />}
        </div>
      )}
      <p className="fi-note">{note}</p>
    </div>
  );
}

/** What + Add puts in a section. */
type Addition = 'field' | 'linked' | 'body' | 'cards' | 'subtasks' | 'actions';

/** The menu under a section's + Add: a field, the records of a collection that links here, the notes, the cards that link here, the record's own subtasks, its buttons. */
function AddMenu({ linking, notesPlaced, cardsPlaced, subtasksPlaced, buttonsPlaced, onAdd }: {
  linking: boolean;
  notesPlaced: boolean;
  cardsPlaced: boolean;
  subtasksPlaced: boolean;
  buttonsPlaced: boolean;
  onAdd: (what: Addition) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const options: Option[] = [
    { value: 'field', label: t('fields.addField'), hint: t('fields.addFieldHint'), chip: false },
    { value: 'linked', label: t('fields.addLinked'), hint: linking ? t('fields.addLinkedHint') : t('fields.noLinking'), chip: false, disabled: !linking },
    { value: 'body', label: t('fields.addNotes'), hint: notesPlaced ? t('fields.notesPlaced') : t('fields.notesHint'), chip: false, disabled: notesPlaced },
    { value: 'cards', label: t('fields.cards'), hint: cardsPlaced ? t('fields.notesPlaced') : t('fields.cardsHint'), chip: false, disabled: cardsPlaced },
    { value: 'subtasks', label: t('subtasks.title'), hint: subtasksPlaced ? t('fields.notesPlaced') : t('fields.subtasksHint'), chip: false, disabled: subtasksPlaced },
    { value: 'actions', label: t('fields.buttons'), hint: buttonsPlaced ? t('fields.notesPlaced') : t('fields.buttonsHint'), chip: false, disabled: buttonsPlaced },
  ];
  return (
    <>
      <button
        ref={box}
        type="button"
        className={open ? 'fadd open' : 'fadd'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => open && LIST_KEYS.includes(event.key) && keys.current?.(event)}
      >
        {t('fields.add')}
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={[]}
          label={t('fields.add')}
          keys={keys}
          width={280}
          className="fmenu"
          onPick={(what) => {
            setOpen(false);
            if (what) onAdd(what as Addition);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The schema file as text, with line numbers; what is typed is the draft. */
function SchemaText({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    const made = createEnvEditor({ parent: host.current!, doc: text, json: true, onChange: (doc) => changed.current(doc) });
    made.view.focus();
    return () => made.destroy();
    // Made once with the text of the draft; what is typed in it is the draft from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="ftext" ref={host} />;
}

/** When a rule stopped, as the note over the rules says it: "today, 14:32", "Oct 20, 09:15". */
function stopWhen(at: string): string {
  const time = clockTime(at);
  const when = new Date(at);
  if (when.toDateString() === new Date().toDateString()) return t('run.whenToday', { time });
  return t('run.whenDay', { day: when.toLocaleDateString(locale(), { month: 'short', day: 'numeric' }), time });
}

/** The rules file as code; what is wrong is said under its line; where a rule last stopped, over it, its line marked. */
function RulesText({ text, problems, stop, onClearStop, onChange }: { text: string; problems: RuleProblem[]; stop: StopNote | null; onClearStop: () => void; onChange: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<RulesEditor | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    const made = createRulesEditor({ parent: host.current!, doc: text, hint: t('fields.rulesHint'), onChange: (doc) => changed.current(doc) });
    editor.current = made;
    made.view.focus();
    return () => {
      editor.current = null;
      made.destroy();
    };
    // Made once with the rules as they are; what is typed in it is the draft from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const said = JSON.stringify(problems);
  useEffect(() => {
    editor.current?.setProblems(problems.map((p) => ({ at: p.at, message: p.message })));
    // Said again only when what is wrong changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [said]);
  useEffect(() => {
    editor.current?.setStop(stop?.line ?? null);
  }, [stop?.line]);
  return (
    <>
      {stop && (
        <div className="rules-stop" role="status">
          <span>
            <b>{t('run.stopped', { name: stop.name })}</b> {t('run.lastStop', { line: stop.line, record: stop.record, when: stopWhen(stop.at), message: stop.message })}
            <small>{t('run.lastStopNote', { record: stop.record })}</small>
          </span>
          <button type="button" className="x" title={t('notice.close')} aria-label={t('notice.close')} onClick={onClearStop}>
            ×
          </button>
        </div>
      )}
      <div className="ftext frules" ref={host} />
      <p className="fi-note fd-help">{t('fields.rulesHelp')}</p>
      <p className="fi-note fd-help">{t('fields.rulesActionHelp')}</p>
      <p className="fi-note fd-help">{t('fields.rulesAskHelp')}</p>
      <p className="fi-note fd-help">{t('fields.rulesSaveHelp')}</p>
    </>
  );
}

// ---------- the window ----------

export function FieldsDialog({ collection, actions, onClose }: { collection: Collection; actions: FieldsActions; onClose: () => void }) {
  const { dir, schema } = collection;
  const narrow = useNarrow();
  const collections = actions.collections();
  // A schema with no layout shows under its body what links to it; the window shows it so too.
  const [linked] = useState<LayoutBlock[]>(() =>
    schema.layout
      ? []
      : [
          ...linkingCollections(collections, dir).map((c): LayoutBlock => ({ block: 'linked', collection: c.dir })),
          ...(boardsLinkingTo(actions.boards(), dir).length > 0 ? [{ block: 'cards' } as const] : []),
        ],
  );
  const [start] = useState(() => toDraft(schema, linked));
  const [original] = useState(() => serializeSchema(settleSchema(toSchema(start, schema), linked)));
  const [draft, setDraft] = useState(start);
  const [view, setView] = useState<'design' | 'rules' | 'text'>('design');
  const [text, setText] = useState('');
  // The rules file as typed; written with the schema when it changed.
  const [rules, setRules] = useState(collection.rules ?? '');
  // Where they last stopped on this device, said over them.
  const [stop, setStop] = useState(() => actions.lastStop?.(dir) ?? null);
  // Choices renamed in Design before Text was opened: the records follow them on Save.
  const [carried, setCarried] = useState<ChoiceRenames>({});
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ section: string; index: number; y: number } | null>(null);
  const dragging = useRef<{ id: string; element: HTMLElement } | null>(null);
  // The same as `drop`, for a finger letting go, which comes before the state is drawn.
  const dropping = useRef<{ section: string; index: number; y: number } | null>(null);
  const busy = useRef(false);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

  const rulesChanged = rules !== (collection.rules ?? '');
  const dirty =
    rulesChanged ||
    (view !== 'text' ? serializeSchema(settleSchema(toSchema(draft, schema), linked)) !== original : textProblem(text) !== null || serializeSchema(settleSchema(parseSchema(text), linked)) !== original);
  const fieldsById = new Map(draft.fields.map((f) => [f.id, f]));
  const placed = (kind: Block['block']) => draft.columns.some((c) => c.sections.some((s) => s.items.some((i) => 'block' in i && i.block.block === kind)));
  const notesPlaced = placed('body');
  const cardsPlaced = placed('cards');
  const subtasksPlaced = placed('subtasks');
  const buttonsPlaced = placed('actions');
  const linking = linkingCollections(collections, dir);
  const unlinkable = !draft.fields.some((f) => f.type === 'name' || f.type === 'code');
  const boards = actions.boards();
  const sources: RollupSource[] = [
    ...linking.map((c) => ({ value: c.dir, label: collectionLabel(c.dir), name: collectionName(c.dir), board: false, fields: c.schema.fields })),
    ...boardsLinkingTo(boards, dir).map((path) => ({ value: path, label: boardLabel(path), name: boardName(path), board: true, fields: boards[path]!.fields ?? [] })),
  ];
  const schemaOf = schemasOf(collections, boards);
  // The rules checked against the fields as they are now; a file with a mistake is not written.
  // What its buttons name is looked for in the collection's own space.
  const here = (path: string) => spaceOf(path) === spaceOf(dir);
  const ruleSpace = ruleSpaceOf(
    collections.filter((c) => here(c.dir)),
    Object.fromEntries(Object.entries(boards).filter(([path]) => here(path))),
    Object.keys(actions.tasks()).filter(here),
  );
  const ruleProblems = rules.trim() ? rulesProblems(rules, { fields: (view === 'text' && textProblem(text) === null ? parseSchema(text) : toSchema(draft, schema)).fields, schemaOf, dir }, ruleSpace) : [];
  const buttons = actionsOf(rules).map((a) => a.name);
  const unruly = rulesChanged && ruleProblems.length > 0;
  /** What a new record gets for a field's default, as the draft has it. */
  const preview = (field: Field): string | null => {
    const shaped: Collection = { ...collection, schema: { ...toSchema(draft, schema), fields: draft.fields.map(toField) } };
    const value = computerFor(shaped, collections, boards, dayIn(new Date())).defaults(dir, {}, actions.me?.())[field.key];
    return isEmpty(value) ? null : valueText(value);
  };

  // The keyboard comes into the window, so that Esc closes it before anything is clicked.
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
  }, []);

  const change = (next: Draft) => {
    setError(null);
    setDraft(next);
  };
  const itemOf = (id: string | null) => {
    for (const column of draft.columns) for (const section of column.sections) for (const item of section.items) if (item.id === id) return item;
    return undefined;
  };
  // A field just made and closed without a name goes away again.
  const close = (then: string | null = null) => {
    const item = itemOf(open);
    const field = item && 'field' in item ? fieldsById.get(item.field) : undefined;
    if (item && field?.fresh && !field.label.trim()) {
      change({ ...withSections(draft, (s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) })), fields: draft.fields.filter((f) => f.id !== field.id) });
    }
    setOpen(then);
  };
  const removeItem = (item: DraftItem) => {
    const out = withSections(draft, (s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }));
    change('field' in item ? { ...out, fields: out.fields.filter((f) => f.id !== item.field) } : out);
    setOpen(null);
  };
  const changeField = (id: string, patch: Partial<DraftField>) => change({ ...draft, fields: draft.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const changeBlock = (id: string, block: Block) => change(withSections(draft, (s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { id, block } : i)) })));
  const add = (sectionId: string, what: Addition) => {
    const id = newId();
    let item: DraftItem;
    let fields = draft.fields;
    if (what === 'field') {
      const field = freshField(fields);
      fields = [...fields, field];
      item = { id, field: field.id };
    } else if (what === 'linked') {
      const placed = new Set(draft.columns.flatMap((c) => c.sections.flatMap((s) => s.items.flatMap((i) => ('block' in i && i.block.block === 'linked' ? [i.block.collection] : [])))));
      const source = linking.find((c) => !placed.has(c.dir)) ?? linking[0]!;
      item = { id, block: { block: 'linked', collection: source.dir } };
    } else item = { id, block: { block: what } };
    change({ ...withSections(draft, (s) => (s.id === sectionId ? { ...s, items: [...s.items, item] } : s)), fields });
    setOpen(what === 'field' || what === 'linked' ? id : null);
  };
  const setColumns = (columns: DraftColumn[]) => change({ ...draft, columns });
  const removeColumn = (index: number) => {
    // What was in it goes to the column beside it, at its end.
    const gone = draft.columns[index]!;
    const into = index > 0 ? index - 1 : 1;
    const kept = gone.sections.filter((s) => s.items.length > 0 || s.title);
    setColumns(draft.columns.map((c, i) => (i === into ? { ...c, sections: [...c.sections, ...kept] } : c)).filter((_, i) => i !== index));
  };

  // Dragging an element: the gap under the pointer, in the section it is over.
  const grab = (event: DragEvent<HTMLElement>, id: string) => {
    const element = event.currentTarget.closest<HTMLElement>('[data-item]')!;
    dragging.current = { id, element };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, id);
    requestAnimationFrame(() => dragging.current?.element.classList.add('lifted'));
  };
  const release = () => {
    dragging.current?.element.classList.remove('lifted');
    dragging.current = null;
    dropping.current = null;
    setDrop(null);
  };
  /** The gap in a section at height `y`, a pointer's or a finger's. */
  const overAt = (block: HTMLElement, y: number, sectionId: string) => {
    const items = [...block.querySelectorAll<HTMLElement>(':scope > [data-item]')];
    let index = items.findIndex((el) => y < middle(el));
    if (index < 0) index = items.length;
    const last = items[items.length - 1];
    const next = { section: sectionId, index, y: index < items.length ? items[index]!.offsetTop - 3 : last ? last.offsetTop + last.offsetHeight + 2 : 8 };
    dropping.current = next;
    setDrop((now) => (now?.section === sectionId && now.index === index ? now : next));
  };
  const over = (event: DragEvent<HTMLDivElement>, sectionId: string) => {
    if (!dragging.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    overAt(event.currentTarget, event.clientY, sectionId);
  };
  const land = () => {
    const d = dragging.current;
    const at = dropping.current;
    if (d && at) change(moveItem(draft, d.id, at.section, at.index));
    release();
  };
  const dropped = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current || !dropping.current) return;
    event.preventDefault();
    land();
  };
  /** A finger carrying an element: the section under it. */
  const find = (x: number, y: number) => {
    const block = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-section]');
    if (!block || !panel.current?.contains(block)) {
      dropping.current = null;
      setDrop(null);
      return;
    }
    overAt(block, y, block.dataset.section!);
  };
  const hold = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const element = event.currentTarget.closest<HTMLElement>('[data-item]')!;
    holdToDrag(event, {
      element,
      onLift: (x, y) => {
        dragging.current = { id, element };
        element.classList.add('lifted');
        find(x, y);
      },
      onMove: find,
      onDrop: land,
      onCancel: release,
    });
  };

  const switchTo = (next: 'design' | 'rules' | 'text') => {
    if (next === view) return;
    if (view === 'text') {
      const problem = textProblem(text);
      if (problem) return setError(problem);
      setDraft(toDraft(parseSchema(text), linked));
      setError(null);
    } else close();
    if (next === 'text') {
      setCarried(compose(carried, renamesOf(draft.fields)));
      setText(serializeSchema(settleSchema(toSchema(draft, schema), linked)));
    }
    setView(next);
  };

  const save = async () => {
    if (busy.current || unruly) return;
    let next: Schema;
    let renames: ChoiceRenames;
    if (view === 'text') {
      const problem = textProblem(text);
      if (problem) return setError(problem);
      next = parseSchema(text);
      renames = carried;
    } else {
      const placeOf = (field: DraftField) => draft.columns.flatMap((c) => c.sections.flatMap((s) => s.items)).find((i) => 'field' in i && i.field === field.id)?.id ?? null;
      const unnamed = draft.fields.find((f) => !f.label.trim());
      if (unnamed) {
        setOpen(placeOf(unnamed));
        return setError(t('fields.nameNeeded'));
      }
      const unlinked = draft.fields.find((f) => f.type === 'link' && !f.collection);
      if (unlinked) {
        setOpen(placeOf(unlinked));
        return setError(t('fields.linkNeeded', { field: unlinked.label.trim() }));
      }
      const unrolled = draft.fields.find((f) => f.type === 'rollup' && (!f.rollup.from || (f.rollup.fn !== 'count' && !f.rollup.field)));
      if (unrolled) {
        setOpen(placeOf(unrolled));
        return setError(t(unrolled.rollup.from ? 'fields.rollupFieldNeeded' : 'fields.rollupNeeded', { field: unrolled.label.trim() }));
      }
      const unlooked = draft.fields.find((f) => f.type === 'lookup' && (!f.lookup.link || !f.lookup.field));
      if (unlooked) {
        setOpen(placeOf(unlooked));
        return setError(t('fields.lookupNeeded', { field: unlooked.label.trim() }));
      }
      const uncurrencied = draft.fields.find((f) => f.format?.style === 'currency' && !f.format.currency && !f.format.currencyField);
      if (uncurrencied) {
        setView('design');
        setOpen(placeOf(uncurrencied));
        return setError(t('fields.currencyNeeded', { field: uncurrencied.label.trim() }));
      }
      next = toSchema(draft, schema);
      renames = compose(carried, renamesOf(draft.fields));
    }
    const settled = settleSchema(next, linked, renames);
    // Only the fields that still have choices have them renamed in the records.
    const kept = Object.fromEntries(Object.entries(renames).filter(([key]) => settled.fields.some((f) => f.key === key && isChoice(f.type))));
    busy.current = true;
    const failed = await actions.saveFields(dir, settled, kept, rulesChanged ? rules : undefined);
    busy.current = false;
    if (failed) setError(failed);
    else onClose();
  };
  // Nothing changed is lost without asking.
  const leave = () => {
    if (!dirty) return onClose();
    actions.ask(t('collection.discardTitle'), t('fields.discardText', { name: quote(collectionName(dir)) }), onClose, t('collection.discard'));
  };
  useEscape(backdrop, () => (open ? close() : leave()));

  const element = (item: DraftItem): ReactNode => {
    const isOpen = item.id === open;
    const field = 'field' in item ? fieldsById.get(item.field) : undefined;
    if ('field' in item && !field) return null;
    if (isOpen) {
      return (
        <div key={item.id} data-item={item.id} className={field?.fresh ? 'fitem edit fresh' : 'block' in item ? 'fitem fblk edit' : 'fitem edit'}>
          <span className="grip" draggable onDragStart={(event) => grab(event, item.id)} onDragEnd={release} onPointerDown={(event) => hold(event, item.id)}>
            {GRIP}
          </span>
          {field ? (
            <FieldEditor field={field} fields={draft.fields} collections={collections} sources={sources} schemaOf={schemaOf} preview={preview} onChange={(patch) => changeField(field.id, patch)} onDelete={() => removeItem(item)} />
          ) : (
            'block' in item && <BlockEditor block={item.block} dir={dir} collections={collections} buttons={buttons} onRules={() => setView('rules')} onChange={(block) => changeBlock(item.id, block)} onDelete={() => removeItem(item)} />
          )}
        </div>
      );
    }
    const pick = () => close(item.id);
    const shared = {
      'data-item': item.id,
      role: 'button',
      tabIndex: 0,
      draggable: true,
      onDragStart: (event: DragEvent<HTMLDivElement>) => grab(event, item.id),
      onDragEnd: release,
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => hold(event, item.id),
      onClick: pick,
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        pick();
      },
    };
    if (field) {
      // Its eye: shut, the field is kept off the record's window, in the table and the views still.
      const off = draft.hidden.has(field.id);
      return (
        <div key={item.id} className={off ? 'fitem off' : 'fitem'} {...shared}>
          <span className="grip">{GRIP}</span>
          <span className="fl">
            {field.label || t('fields.fieldName')}
            {(field.required || field.type === 'name') && <i title={t('collection.required')}>*</i>}
          </span>
          <small>{off ? t('fields.offRecord') : typeWords(field)}</small>
          {!off && field.when.some(isComplete) && <span className="fwhen">{conditionsWords(field.when, askable(field, draft.fields))}</span>}
          <button
            type="button"
            className="feye"
            title={t(off ? 'fields.showOnRecord' : 'fields.hideOnRecord')}
            aria-label={t(off ? 'fields.showOnRecord' : 'fields.hideOnRecord')}
            aria-pressed={off}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setDraft((d) => {
                const hidden = new Set(d.hidden);
                if (!hidden.delete(field.id)) hidden.add(field.id);
                return { ...d, hidden };
              });
            }}
          >
            <Icon name={off ? 'eyeOff' : 'eye'} />
          </button>
        </div>
      );
    }
    const [name, meta] = blockWords((item as { block: Block }).block, collections, buttons);
    return (
      <div key={item.id} className="fitem fblk" {...shared}>
        <span className="grip">{GRIP}</span>
        <span className="bl">
          <b>{name}</b>
          <small>{meta}</small>
        </span>
      </div>
    );
  };

  const columns = draft.columns.map((column, c) => (
    <div key={column.id} className="fcol" style={{ flex: narrow ? undefined : column.width }}>
      <div className="fcol-h">
        {t('fields.column', { n: c + 1 })}
        <span className="ratio" role="group" aria-label={t('fields.width', { n: c + 1 })}>
          {WIDTHS.map((width) => (
            <button key={width} type="button" className={column.width === width ? 'on' : undefined} aria-pressed={column.width === width} onClick={() => setColumns(draft.columns.map((each) => (each.id === column.id ? { ...each, width } : each)))}>
              {width}
            </button>
          ))}
        </span>
        {draft.columns.length > 1 && (
          <button type="button" className="x" title={t('fields.removeColumn')} aria-label={t('fields.removeColumn')} onClick={() => removeColumn(c)}>
            ×
          </button>
        )}
      </div>
      {column.sections.map((section) => (
        <div key={section.id} data-section={section.id} className={drop?.section === section.id ? 'fsec over' : 'fsec'} onDragOver={(event) => over(event, section.id)} onDrop={dropped} onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setDrop(null)}>
          {(section.title || (section.items.length === 0 && column.sections.length > 1)) && (
            <div className="fsec-h">
              {section.title && <span>{section.title}</span>}
              {section.items.length === 0 && column.sections.length > 1 && (
                <button type="button" className="x" title={t('fields.removeSection')} aria-label={t('fields.removeSection')} onClick={() => setColumns(draft.columns.map((each) => (each.id === column.id ? { ...each, sections: each.sections.filter((s) => s.id !== section.id) } : each)))}>
                  ×
                </button>
              )}
            </div>
          )}
          {section.items.map(element)}
          {drop?.section === section.id && <div className="fdrop" style={{ top: drop.y }} />}
          <AddMenu linking={linking.length > 0} notesPlaced={notesPlaced} cardsPlaced={cardsPlaced} subtasksPlaced={subtasksPlaced} buttonsPlaced={buttonsPlaced} onAdd={(what) => add(section.id, what)} />
        </div>
      ))}
      <button type="button" className="fsec-add" onClick={() => setColumns(draft.columns.map((each) => (each.id === column.id ? { ...each, sections: [...each.sections, { id: newId(), items: [] }] } : each)))}>
        {t('fields.addSection')}
      </button>
    </div>
  ));

  return (
    <div ref={backdrop} className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && leave()}>
      <section ref={panel} className="fdlg" role="dialog" aria-label={t('fields.title')} tabIndex={-1}>
        <div className="cp-head">
          <Icon name="collection" />
          <b>{t('fields.title')}</b>
          <span className="where">{collectionLabel(dir)}</span>
          <span className="vsw" role="group" aria-label={t('fields.views')}>
            <button type="button" className={view === 'design' ? 'on' : undefined} aria-pressed={view === 'design'} onClick={() => switchTo('design')}>
              {t('fields.design')}
            </button>
            <button type="button" className={view === 'rules' ? 'on' : undefined} aria-pressed={view === 'rules'} onClick={() => switchTo('rules')}>
              {t('fields.rules')}
            </button>
            <button type="button" className={view === 'text' ? 'on' : undefined} aria-pressed={view === 'text'} onClick={() => switchTo('text')}>
              {t('fields.text')}
            </button>
          </span>
          <button type="button" className="x" title={t('dialog.close')} aria-label={t('dialog.close')} onClick={leave}>
            ×
          </button>
        </div>
        {view === 'rules' ? (
          <RulesText
            text={rules}
            problems={ruleProblems}
            stop={stop}
            onClearStop={() => {
              actions.clearStop?.(dir);
              setStop(null);
            }}
            onChange={(next) => {
              setError(null);
              setRules(next);
            }}
          />
        ) : view === 'text' ? (
          <SchemaText
            text={text}
            onChange={(next) => {
              setError(null);
              setText(next);
            }}
          />
        ) : (
          <div
            className="fd-canvas"
            onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
              // A click beside the open element closes it; one in a list it opened does not.
              const target = event.target as HTMLElement;
              if (open && !target.closest('.fitem.edit, .opt-list, [data-item]')) close();
            }}
          >
            <p className="fd-say">{t('fields.say')}</p>
            {unlinkable && <p className="fd-say warn">{t('fields.unlinkable')}</p>}
            <div className="fcols">
              {columns}
              {draft.columns.length < MAX_COLUMNS && (
                <button type="button" className="fcol-add" onClick={() => setColumns([...draft.columns, { id: newId(), width: 1, sections: [{ id: newId(), items: [] }] }])}>
                  {t('fields.addColumn')}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="rm-foot">
          {error ? (
            <p role="alert">{error}</p>
          ) : unruly ? (
            <p role="alert">{t('fields.rulesFix', { line: ruleProblems[0]!.line })}</p>
          ) : (
            <span className="hint">{t('fields.savedIn', { file: `${collectionName(dir)}/${view === 'rules' ? RULES_FILE : COLLECTION_FILE}` })}</span>
          )}
          <button type="button" onClick={leave}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="primary" disabled={!dirty || unruly} onClick={() => void save()}>
            {t('collection.save')}
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------- a board's fields ----------

export interface BoardFieldsActions {
  /** Asks before something is lost; `action` is what the confirming button says. */
  ask: (title: string, message: string, run: () => void, action: string) => void;
  /** Writes the board's fields, its cards' choices renamed with them. */
  saveBoardFields: (board: string, fields: Field[], renames: ChoiceRenames) => void;
}

/** The types a board's field can be: a collection's but name and code, since a card has its own title and key, and rollup, since nothing links to a card. */
const BOARD_TYPES = FIELD_TYPES.filter((type) => !SINGLE_TYPES.includes(type) && type !== 'rollup');

/**
 * A board's Fields window, after the Deals fields view of design/mockups.html: what every card
 * has, then the board's own fields in the order a card shows them, each opened where it is with
 * the same parts as a collection's field. Dragged to order; + Add field puts a new one at the end.
 * Everything changes one draft; Save writes it.
 */
export function BoardFieldsDialog({ board, path, collections, actions, onClose }: {
  board: Board;
  path: string;
  /** The collections a link can point at. */
  collections: Collection[];
  actions: BoardFieldsActions;
  onClose: () => void;
}) {
  const [start] = useState(() => draftFields(board.fields ?? []));
  const [original] = useState(() => JSON.stringify(start.map(toField)));
  const [fields, setFields] = useState(start);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ index: number; y: number } | null>(null);
  const dragging = useRef<{ id: string; element: HTMLElement } | null>(null);
  // The same as `drop`, for a finger letting go, which comes before the state is drawn.
  const dropping = useRef<{ index: number; y: number } | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(fields.map(toField)) !== original;
  const name = boardName(path);
  const own = [t('card.status'), ...(board.phasesOn ? [t('card.phase')] : []), t('card.priority'), t('card.labels'), t('card.due'), t('card.assignee')];

  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
  }, []);

  const change = (next: DraftField[]) => {
    setError(null);
    setFields(next);
  };
  // A field just made and closed without a name goes away again.
  const close = (then: string | null = null) => {
    const field = fields.find((f) => f.id === open);
    if (field?.fresh && !field.label.trim()) change(fields.filter((f) => f.id !== field.id));
    setOpen(then);
  };
  const add = () => {
    const field = freshField(fields);
    change([...fields.filter((f) => !(f.id === open && f.fresh && !f.label.trim())), field]);
    setOpen(field.id);
  };

  const grab = (event: DragEvent<HTMLElement>, id: string) => {
    const element = event.currentTarget.closest<HTMLElement>('[data-item]')!;
    dragging.current = { id, element };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, id);
    requestAnimationFrame(() => dragging.current?.element.classList.add('lifted'));
  };
  const release = () => {
    dragging.current?.element.classList.remove('lifted');
    dragging.current = null;
    dropping.current = null;
    setDrop(null);
  };
  /** The gap at height `y`, a pointer's or a finger's. */
  const overAt = (y: number) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>(':scope > [data-item]') ?? [])];
    let index = items.findIndex((el) => y < middle(el));
    if (index < 0) index = items.length;
    const last = items[items.length - 1];
    const next = { index, y: index < items.length ? items[index]!.offsetTop - 3 : last ? last.offsetTop + last.offsetHeight + 2 : 8 };
    dropping.current = next;
    setDrop((now) => (now?.index === index ? now : next));
  };
  const over = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    overAt(event.clientY);
  };
  const land = () => {
    const d = dragging.current;
    const at = dropping.current;
    if (d && at) {
      const from = fields.findIndex((f) => f.id === d.id);
      const to = from < at.index ? at.index - 1 : at.index;
      if (from >= 0 && from !== to) {
        const next = fields.filter((f) => f.id !== d.id);
        next.splice(to, 0, fields[from]!);
        change(next);
      }
    }
    release();
  };
  const dropped = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current || !dropping.current) return;
    event.preventDefault();
    land();
  };
  const hold = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const element = event.currentTarget.closest<HTMLElement>('[data-item]')!;
    holdToDrag(event, {
      element,
      onLift: (_x, y) => {
        dragging.current = { id, element };
        element.classList.add('lifted');
        overAt(y);
      },
      onMove: (_x, y) => overAt(y),
      onDrop: land,
      onCancel: release,
    });
  };

  const save = () => {
    const unnamed = fields.find((f) => !f.label.trim());
    if (unnamed) {
      setOpen(unnamed.id);
      return setError(t('fields.nameNeeded'));
    }
    const unlinked = fields.find((f) => f.type === 'link' && !f.collection);
    if (unlinked) {
      setOpen(unlinked.id);
      return setError(t('fields.linkNeeded', { field: unlinked.label.trim() }));
    }
    const renames = Object.fromEntries(Object.entries(renamesOf(fields)).filter(([key]) => fields.some((f) => f.key === key && isChoice(f.type))));
    actions.saveBoardFields(path, fields.map(toField), renames);
    onClose();
  };
  const leave = () => {
    if (!dirty) return onClose();
    actions.ask(t('collection.discardTitle'), t('fields.discardText', { name: quote(name) }), onClose, t('collection.discard'));
  };
  useEscape(backdrop, () => (open ? close() : leave()));

  const item = (field: DraftField) => {
    if (field.id === open) {
      return (
        <div key={field.id} data-item={field.id} className={field.fresh ? 'fitem edit fresh' : 'fitem edit'}>
          <span className="grip" draggable onDragStart={(event) => grab(event, field.id)} onDragEnd={release} onPointerDown={(event) => hold(event, field.id)}>
            {GRIP}
          </span>
          <FieldEditor
            field={field}
            fields={fields}
            collections={collections}
            types={BOARD_TYPES}
            schemaOf={schemasOf(collections)}
            onChange={(patch) => change(fields.map((f) => (f.id === field.id ? { ...f, ...patch } : f)))}
            onDelete={() => {
              change(fields.filter((f) => f.id !== field.id));
              setOpen(null);
            }}
          />
        </div>
      );
    }
    const pick = () => close(field.id);
    return (
      <div
        key={field.id}
        data-item={field.id}
        className="fitem"
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(event) => grab(event, field.id)}
        onDragEnd={release}
        onPointerDown={(event) => hold(event, field.id)}
        onClick={pick}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          pick();
        }}
      >
        <span className="grip">{GRIP}</span>
        <span className="fl">
          {field.label || t('fields.fieldName')}
          {field.required && <i title={t('collection.required')}>*</i>}
        </span>
        <small>{typeWords(field)}</small>
      </div>
    );
  };

  return (
    <div ref={backdrop} className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && leave()}>
      <section ref={panel} className="fdlg narrow" role="dialog" aria-label={t('fields.title')} tabIndex={-1}>
        <div className="cp-head">
          <Icon name="board" />
          <b>{t('fields.title')}</b>
          <span className="where">{boardLabel(path)}</span>
          <button type="button" className="x push" title={t('dialog.close')} aria-label={t('dialog.close')} onClick={leave}>
            ×
          </button>
        </div>
        <div
          className="fd-canvas"
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            if (open && !target.closest('.fitem.edit, .opt-list, [data-item]')) close();
          }}
        >
          <p className="fd-say">{t('fields.boardSay')}</p>
          <p className="fbox-h">{t('fields.onEveryCard')}</p>
          <div className="fbuilt">
            {own.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <p className="fbox-h">{t('fields.thisBoard')}</p>
          <div ref={list} className={drop ? 'fsec over' : 'fsec'} onDragOver={over} onDrop={dropped} onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setDrop(null)}>
            {fields.map(item)}
            {fields.length === 0 && <p className="fi-note">{t('fields.noBoardFields')}</p>}
            {drop && <div className="fdrop" style={{ top: drop.y }} />}
            <button type="button" className="fadd" onClick={add}>
              {t('fields.addFieldRow')}
            </button>
          </div>
        </div>
        <div className="rm-foot">
          {error ? <p role="alert">{error}</p> : <span className="hint">{t('fields.savedIn', { file: `${name}${BOARD_EXT}` })}</span>}
          <button type="button" onClick={leave}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="primary" disabled={!dirty} onClick={save}>
            {t('collection.save')}
          </button>
        </div>
      </section>
    </div>
  );
}
