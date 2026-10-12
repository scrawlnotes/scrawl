import {
  type Board,
  BOARD_EXT,
  boardName,
  boardsLinkingTo,
  type ChoiceRenames,
  type Collection,
  collectionName,
  COLLECTION_FILE,
  defaultLayout,
  type Field,
  FIELD_TYPES,
  type FieldType,
  formulaProblem,
  isLinkable,
  keyFor,
  type Layout,
  type LayoutBlock,
  type LayoutItem,
  type LinkedBlock,
  linkFieldsTo,
  linkingCollections,
  nameField,
  OPTION_COLORS,
  type OptionColor,
  parseSchema,
  ROLLUP_FNS,
  type RollupFn,
  type Schema,
  serializeSchema,
  settleSchema,
  SINGLE_TYPES,
} from '@scrawlnotes/core';
import { createEnvEditor } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { holdToDrag } from './touchDrag';
import { createPortal } from 'react-dom';
import { boxKeys, hueStyle, LIST_KEYS, MultiPicker, type Option, OptionList, Picker, useEscape } from './choices';
import { pageBox, pageWindow } from './device';
import { Icon } from './Icon';
import { boardLabel, collectionLabel } from './items';
import { useNarrow } from './narrow';
import { GRIP } from './Tasks';
import { quote } from './text';

// A collection's Fields window, after the Fields views of design/mockups.html: one window for the
// fields and the record screen, which fills it with its columns and sections as the record opens.
// A field or a block is changed where it is: a click opens it in place (its name, its type,
// whether it is required, its choices and their colors; a link's collection; a block's collection
// and how it shows) and it closes again. Dragged to move; + Add in a section puts a new one there.
// Text shows the same thing as the file. Everything changes one draft; Save writes it.

export interface FieldsActions {
  /** Every collection in the space. */
  collections: () => Collection[];
  /** Asks before something is lost; `action` is what the confirming button says. */
  ask: (title: string, message: string, run: () => void, action: string) => void;
  /** Writes the schema, and the records whose choices were renamed. Returns a message when it cannot. */
  saveFields: (dir: string, schema: Schema, renames: ChoiceRenames) => Promise<string | null>;
  /** Every board, by path: whether any links to the collection. */
  boards: () => { [path: string]: Board };
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
  rollup: { from: string; fn: RollupFn; field: string; open: boolean };
  fresh: boolean;
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
  return { fields, columns };
}

/** Fields as the window holds them, each with an id of its own and its choices with the names they had. */
function draftFields(fields: Field[]): DraftField[] {
  return fields.map(
    (f): DraftField => ({
      id: newId(),
      key: f.key,
      label: f.label,
      type: f.type,
      required: !!f.required,
      choices: (f.options ?? []).map((name) => ({ id: newId(), name, was: name, color: f.colors?.[name] })),
      collection: f.collection ?? '',
      many: !!f.many,
      formula: f.formula ?? '',
      rollup: { from: f.rollup?.from ?? '', fn: f.rollup?.fn ?? 'count', field: f.rollup?.field ?? '', open: !!f.rollup?.open },
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
  rollup: { from: '', fn: 'count', field: '', open: false },
  fresh: true,
});

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
    ...(f.required && f.type !== 'name' && f.type !== 'formula' && { required: true }),
    ...(f.type === 'link' && { collection: f.collection, ...(f.many && { many: true }) }),
    ...(f.type === 'formula' && { formula: f.formula }),
    ...(f.type === 'rollup' && {
      rollup: {
        from: f.rollup.from,
        fn: f.rollup.fn,
        ...(f.rollup.fn !== 'count' && f.rollup.field && { field: f.rollup.field }),
        ...(f.rollup.open && f.rollup.from.endsWith(BOARD_EXT) && { open: true }),
      },
    }),
  };
}

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
  return type;
}

/** What a block is called on the screen, and the line beside it. */
function blockWords(block: Block, collections: Collection[]): [string, string] {
  if (block.block === 'body') return [t('fields.addNotes'), t('fields.notesMeta')];
  if (block.block === 'cards') return [t('fields.cards'), t('fields.cardsMeta')];
  const source = collections.find((c) => c.dir === block.collection);
  const style = linkedStyle(block, source);
  const shown = (block.fields ?? []).map((key) => source?.schema.fields.find((f) => f.key === key)?.label.toLowerCase() ?? key);
  const meta = [t('fields.linked'), t(style === 'timeline' ? 'fields.timeline' : 'fields.list').toLowerCase(), ...(style === 'timeline' ? [t('fields.newestFirst')] : shown.length > 0 ? [shown.join(', ')] : [])];
  return [collectionName(block.collection), meta.join(' · ')];
}

/** How linked records show when the block does not say: as a timeline when they have a day. */
function linkedStyle(block: LinkedBlock, source: Collection | undefined): 'list' | 'timeline' {
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
function FieldEditor({ field, fields, collections, types, sources = [], onChange, onDelete }: {
  field: DraftField;
  fields: DraftField[];
  collections: Collection[];
  types?: readonly FieldType[];
  /** What a rollup can be worked out from. */
  sources?: RollupSource[];
  onChange: (patch: Partial<DraftField>) => void;
  onDelete: () => void;
}) {
  const rename = (label: string) => {
    if (!field.fresh) return onChange({ label });
    const taken = new Set(fields.filter((f) => f.id !== field.id).map((f) => f.key));
    onChange({ label, key: keyFor(label, taken) });
  };
  const retype = (type: FieldType) => onChange({ type, ...(type === 'name' && { required: false }) });
  const targets: Option[] = collections.filter((c) => isLinkable(c.schema)).map((c) => ({ value: c.dir, label: collectionLabel(c.dir), chip: false }));
  if (field.collection && !targets.some((o) => o.value === field.collection)) targets.push({ value: field.collection, label: collectionLabel(field.collection), chip: false });
  const problem = field.type === 'formula' ? formulaProblem(field.formula, { fields: fields.map(toField) }, field.key) : null;
  // A rollup: where it is worked out from, what it does, and with which of their fields.
  const roll = field.rollup;
  const source = sources.find((o) => o.value === roll.from);
  const sourceOptions: Option[] = sources.map((o) => ({ value: o.value, label: o.label, chip: false }));
  if (roll.from && !source) sourceOptions.push({ value: roll.from, label: roll.from.endsWith(BOARD_EXT) ? boardLabel(roll.from) : collectionLabel(roll.from), chip: false });
  const fnOptions: Option[] = ROLLUP_FNS.map((fn) => ({ value: fn, label: t(`fields.fn.${fn}`), chip: false }));
  const counted = (source?.fields ?? []).filter((f) => f.type === 'number' || f.type === 'date' || f.type === 'formula');
  const ofOptions: Option[] = counted.map((f) => ({ value: f.key, label: f.label, chip: false }));
  const ofField = counted.find((f) => f.key === roll.field);
  const sourceName = source?.name.toLowerCase() ?? '';
  const rollNote = !source
    ? null
    : roll.fn === 'count'
      ? t('fields.rollupCount', { source: sourceName })
      : ofField && t('fields.rollupOf', { fn: t(`fields.fn.${roll.fn}`).toLowerCase(), field: ofField.label.toLowerCase(), source: sourceName });
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
        {field.type !== 'formula' && field.type !== 'rollup' && (
          <label className="fcheck" title={field.type === 'name' ? t('fields.nameRequired') : undefined}>
            <input type="checkbox" checked={field.type === 'name' || field.required} disabled={field.type === 'name'} onChange={(event) => onChange({ required: event.target.checked })} />
            {t('fields.required')}
          </label>
        )}
        <span className="fkey" title={t('fields.key')}>
          {field.key}
        </span>
      </div>
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
          {rollNote && <p className="fi-note">{rollNote}</p>}
        </>
      )}
      {field.type === 'formula' && (
        <>
          <input className="in mono" aria-label={t('fields.type.formula')} spellCheck={false} autoComplete="off" placeholder="qty * price" value={field.formula} onChange={(event) => onChange({ formula: event.target.value })} />
          <p className={problem && field.formula.trim() ? 'fi-note bad' : 'fi-note'}>{problem && field.formula.trim() ? problem : t('fields.formulaHint')}</p>
        </>
      )}
    </div>
  );
}

/** A block opened where it is: linked records with their collection, how they show and in what order; the notes and cards with a way off the screen. */
function BlockEditor({ block, dir, collections, onChange, onDelete }: {
  block: Block;
  dir: string;
  collections: Collection[];
  onChange: (block: Block) => void;
  onDelete: () => void;
}) {
  const trash = (
    <button type="button" className="fdel" title={t('fields.removeBlock')} aria-label={t('fields.removeBlock')} onClick={onDelete}>
      <Icon name="trash" />
    </button>
  );
  if (block.block !== 'linked') {
    const [name, meta] = blockWords(block, collections);
    return (
      <div className="fe">
        <div className="fe-top">
          <b className="fe-name">{name}</b>
          <span className="fe-meta">{meta}</span>
          {trash}
        </div>
      </div>
    );
  }
  const source = collections.find((c) => c.dir === block.collection);
  const sources: Option[] = linkingCollections(collections, dir).map((c) => ({ value: c.dir, label: collectionLabel(c.dir), chip: false }));
  if (!sources.some((o) => o.value === block.collection)) sources.push({ value: block.collection, label: collectionLabel(block.collection), chip: false });
  const style = linkedStyle(block, source);
  const fields = source?.schema.fields ?? [];
  const days = fields.filter((f) => f.type === 'date');
  const sorts: Option[] =
    style === 'timeline'
      ? days.map((f) => ({ value: f.key, label: t('fields.sortNewest', { field: f.label }), chip: false }))
      : fields.filter((f) => f.type !== 'formula').map((f) => ({ value: f.key, label: t('fields.sortName', { field: f.label }), chip: false }));
  const sort = block.sort && sorts.some((o) => o.value === block.sort) ? block.sort : ((style === 'timeline' ? days[0]?.key : (source && nameField(source.schema)?.key)) ?? null);
  const back = source ? linkFieldsTo(source.schema, dir).map((f) => f.label.toLowerCase()) : [];
  const name = collectionName(block.collection);
  const note = back.length === 0 ? t('fields.linkedNone', { collection: name }) : t(style === 'timeline' ? 'fields.linkedTimeline' : 'fields.linkedList', { collection: name.toLowerCase(), field: back.join(' / ') });
  const restyle = (next: 'list' | 'timeline') => {
    const { sort: _sort, fields: _fields, ...rest } = block;
    onChange({ ...rest, style: next, ...(next === 'list' && block.fields && { fields: block.fields }) });
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
        </span>
        {sorts.length > 0 ? (
          <Picker className="in" options={sorts} value={sort} label={t('fields.order')} onPick={(key) => key && onChange({ ...block, sort: key })} />
        ) : (
          style === 'timeline' && <span className="fe-meta">{t('fields.noDate')}</span>
        )}
      </div>
      {style === 'list' && fields.length > 0 && (
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
      <p className="fi-note">{note}</p>
    </div>
  );
}

/** What + Add puts in a section. */
type Addition = 'field' | 'linked' | 'body' | 'cards';

/** The menu under a section's + Add: a field, the records of a collection that links here, the notes, the cards that link here. */
function AddMenu({ linking, notesPlaced, cardsPlaced, onAdd }: { linking: boolean; notesPlaced: boolean; cardsPlaced: boolean; onAdd: (what: Addition) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const options: Option[] = [
    { value: 'field', label: t('fields.addField'), hint: t('fields.addFieldHint'), chip: false },
    { value: 'linked', label: t('fields.addLinked'), hint: linking ? t('fields.addLinkedHint') : t('fields.noLinking'), chip: false, disabled: !linking },
    { value: 'body', label: t('fields.addNotes'), hint: notesPlaced ? t('fields.notesPlaced') : t('fields.notesHint'), chip: false, disabled: notesPlaced },
    { value: 'cards', label: t('fields.cards'), hint: cardsPlaced ? t('fields.notesPlaced') : t('fields.cardsHint'), chip: false, disabled: cardsPlaced },
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
  const [view, setView] = useState<'design' | 'text'>('design');
  const [text, setText] = useState('');
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

  const dirty = view === 'design' ? serializeSchema(settleSchema(toSchema(draft, schema), linked)) !== original : textProblem(text) !== null || serializeSchema(settleSchema(parseSchema(text), linked)) !== original;
  const fieldsById = new Map(draft.fields.map((f) => [f.id, f]));
  const placed = (kind: Block['block']) => draft.columns.some((c) => c.sections.some((s) => s.items.some((i) => 'block' in i && i.block.block === kind)));
  const notesPlaced = placed('body');
  const cardsPlaced = placed('cards');
  const linking = linkingCollections(collections, dir);
  const unlinkable = !draft.fields.some((f) => f.type === 'name' || f.type === 'code');
  const boards = actions.boards();
  const sources: RollupSource[] = [
    ...linking.map((c) => ({ value: c.dir, label: collectionLabel(c.dir), name: collectionName(c.dir), board: false, fields: c.schema.fields })),
    ...boardsLinkingTo(boards, dir).map((path) => ({ value: path, label: boardLabel(path), name: boardName(path), board: true, fields: boards[path]!.fields ?? [] })),
  ];

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

  const switchTo = (next: 'design' | 'text') => {
    if (next === view) return;
    if (next === 'text') {
      close();
      setCarried(compose(carried, renamesOf(draft.fields)));
      setText(serializeSchema(settleSchema(toSchema(draft, schema), linked)));
      setView('text');
      return;
    }
    const problem = textProblem(text);
    if (problem) return setError(problem);
    setDraft(toDraft(parseSchema(text), linked));
    setError(null);
    setView('design');
  };

  const save = async () => {
    if (busy.current) return;
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
      next = toSchema(draft, schema);
      renames = compose(carried, renamesOf(draft.fields));
    }
    const settled = settleSchema(next, linked, renames);
    // Only the fields that still have choices have them renamed in the records.
    const kept = Object.fromEntries(Object.entries(renames).filter(([key]) => settled.fields.some((f) => f.key === key && isChoice(f.type))));
    busy.current = true;
    const failed = await actions.saveFields(dir, settled, kept);
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
            <FieldEditor field={field} fields={draft.fields} collections={collections} sources={sources} onChange={(patch) => changeField(field.id, patch)} onDelete={() => removeItem(item)} />
          ) : (
            'block' in item && <BlockEditor block={item.block} dir={dir} collections={collections} onChange={(block) => changeBlock(item.id, block)} onDelete={() => removeItem(item)} />
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
      return (
        <div key={item.id} className="fitem" {...shared}>
          <span className="grip">{GRIP}</span>
          <span className="fl">
            {field.label || t('fields.fieldName')}
            {(field.required || field.type === 'name') && <i title={t('collection.required')}>*</i>}
          </span>
          <small>{typeWords(field)}</small>
        </div>
      );
    }
    const [name, meta] = blockWords((item as { block: Block }).block, collections);
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
          <AddMenu linking={linking.length > 0} notesPlaced={notesPlaced} cardsPlaced={cardsPlaced} onAdd={(what) => add(section.id, what)} />
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
            <button type="button" className={view === 'text' ? 'on' : undefined} aria-pressed={view === 'text'} onClick={() => switchTo('text')}>
              {t('fields.text')}
            </button>
          </span>
          <button type="button" className="x" title={t('dialog.close')} aria-label={t('dialog.close')} onClick={leave}>
            ×
          </button>
        </div>
        {view === 'text' ? (
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
          {error ? <p role="alert">{error}</p> : <span className="hint">{t('fields.savedIn', { file: `${collectionName(dir)}/${COLLECTION_FILE}` })}</span>}
          <button type="button" onClick={leave}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="primary" disabled={!dirty} onClick={() => void save()}>
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
