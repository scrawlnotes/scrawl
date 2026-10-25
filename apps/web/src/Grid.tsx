import { type Field, type FieldValue, isComputed, isEmpty, isLink, isLinkable, type Link, linkTo, type Record, recordLabel, valueText, minutesOf } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { Chip, choiceOptions, type Option, OptionList } from './choices';
import { type ValueContext } from './Collection';
import { fieldChoices, LabelPop } from './labels';
import { DateTimeBox } from './TimeInputs';

// A table typed in as a sheet is, after the slice 3 views of design/mockups.html: a click picks
// a cell; typing, Enter, a second click or a double click edits it; a choice, a link or a day
// opens the form's own list under it; leaving it writes it, Esc leaves it as it was. The arrows
// and Tab move the cell picked. What is worked out is picked but never typed in; a record opens
// from its name. The collection's table and a record's linked records as a table both use it.

/** A cell of the table, by its record and its field. */
export interface CellAt {
  id: string;
  key: string;
}

/** Where a cell goes after it is written: down a row, along to the next or the one before. */
export type Then = 'down' | 'right' | 'left';

/** Whether a value written is the one the record has, as far as its file goes. */
function same(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Whether a field is typed in in a cell: not what is worked out, not the name, which opens the record. */
export const typedInCell = (field: Field) => !isComputed(field.type) && field.type !== 'name';

/**
 * The picking and the typing of an editable table. `rows` and `fields` are in the order shown,
 * for the arrows; `open` opens a record, `write` writes one value of it.
 */
export function useGrid({ rows, fields, open, opener, write }: {
  rows: Record[];
  fields: Field[];
  open: (record: Record) => void;
  /** A field whose cell opens its record, as a name's does: a line's first, its product or its move. */
  opener?: string;
  write: (record: Record, field: Field, value: FieldValue) => void;
}) {
  const [picked, setPicked] = useState<CellAt | null>(null);
  const [editing, setEditing] = useState<(CellAt & { typed?: string }) | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const focus = () => box.current?.focus({ preventScroll: true });
  // A record gone (deleted, or moved by sync) takes its cell with it.
  useEffect(() => {
    if (picked && !rows.some((r) => r.id === picked.id)) setPicked(null);
    if (editing && !rows.some((r) => r.id === editing.id)) setEditing(null);
  }, [rows, picked, editing]);

  const show = (at: CellAt) => requestAnimationFrame(() => box.current?.querySelector(`[data-cell="${CSS.escape(`${at.id}\u0000${at.key}`)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  const pick = (at: CellAt) => {
    setPicked(at);
    setEditing(null);
    focus();
    show(at);
  };
  const edit = (record: Record, field: Field, typed?: string) => {
    if (!typedInCell(field)) return field.type === 'name' && typed === undefined ? open(record) : undefined;
    setPicked({ id: record.id, key: field.key });
    // A tick has nothing to type: it turns.
    if (field.type === 'checkbox') return write(record, field, record.values[field.key] !== true);
    setEditing({ id: record.id, key: field.key, ...(typed !== undefined && { typed }) });
  };
  const move = (from: CellAt, rowsBy: number, colsBy: number) => {
    const r = rows.findIndex((x) => x.id === from.id);
    const c = fields.findIndex((f) => f.key === from.key);
    if (r < 0 || c < 0) return;
    const row = rows[Math.max(0, Math.min(rows.length - 1, r + rowsBy))]!;
    const field = fields[Math.max(0, Math.min(fields.length - 1, c + colsBy))]!;
    pick({ id: row.id, key: field.key });
  };
  /** What an editor gives back: the value to write, or undefined to leave the cell as it was. */
  const done = (record: Record, field: Field, value: FieldValue | undefined, then?: Then) => {
    setEditing(null);
    focus();
    if (value !== undefined && !same(value, record.values[field.key])) write(record, field, value);
    const at = { id: record.id, key: field.key };
    if (then === 'down') move(at, 1, 0);
    else if (then === 'right') move(at, 0, 1);
    else if (then === 'left') move(at, 0, -1);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !picked || event.target !== box.current) return;
    const record = rows.find((r) => r.id === picked.id);
    const field = fields.find((f) => f.key === picked.key);
    if (!record || !field) return;
    const steps: { [key: string]: [number, number] } = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    if (steps[event.key]) move(picked, ...steps[event.key]!);
    else if (event.key === 'Tab') move(picked, 0, event.shiftKey ? -1 : 1);
    else if (event.key === 'Enter') edit(record, field);
    else if (event.key === 'Escape') {
      // The first Esc lets go of the cell; the next one closes what the table is in.
      setPicked(null);
      event.stopPropagation();
    }
    else if (event.key === ' ' && field.type === 'checkbox') edit(record, field);
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && typedInCell(field) && field.type !== 'checkbox') edit(record, field, event.key);
    else return;
    event.preventDefault();
  };
  /** What a cell of the table takes: where it is, whether it is picked, and what a click does. */
  const cell = (record: Record, field: Field) => {
    const on = picked?.id === record.id && picked.key === field.key;
    return {
      'data-cell': `${record.id}\u0000${field.key}`,
      picked: on,
      editing: editing?.id === record.id && editing.key === field.key,
      onClick: (event: MouseEvent) => {
        // A link or an address in the cell does what it does; the record's name opens it.
        if ((event.target as HTMLElement).closest('a, .lnk-open')) return;
        if (field.type === 'name' || field.key === opener) return open(record);
        // A tick turns at the first click, as a box does; another cell is picked first, then typed in.
        if (field.type === 'checkbox') {
          pick({ id: record.id, key: field.key });
          return write(record, field, record.values[field.key] !== true);
        }
        if (on) edit(record, field);
        else pick({ id: record.id, key: field.key });
      },
      // Two clicks on a tick are two turns, not a third.
      onDoubleClick: () => field.type !== 'checkbox' && edit(record, field),
    };
  };
  return { box, picked, editing, cell, keyDown, done, clear: () => setPicked(null) };
}

// ---------- editing a cell ----------

/** The box a cell is typed in, by its field's type; it gives back the value to write, or undefined for none. */
export function CellEditor({ field, value, typed, ctx, onDone }: {
  field: Field;
  value: FieldValue | undefined;
  /** The key typed that began editing, which the text starts with. */
  typed?: string;
  ctx: ValueContext;
  onDone: (value: FieldValue | undefined, then?: Then) => void;
}) {
  if (field.type === 'select') return <ChoiceEditor field={field} value={typeof value === 'string' ? value : null} onDone={onDone} />;
  if (field.type === 'multi-select') return <ChoicesEditor field={field} value={Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []} used={ctx.used?.(field) ?? []} onDone={onDone} />;
  if (field.type === 'link') return <LinkEditor field={field} value={value} typed={typed} ctx={ctx} onDone={onDone} />;
  if (field.type === 'date' && field.time) return <DateTimeEditor field={field} value={value} onDone={onDone} />;
  return <TextEditor field={field} value={value} typed={typed} onDone={onDone} />;
}

/**
 * A day with its time in a cell: the day's box and the time's, as in the form. Enter writes it and
 * goes down, Tab along, Esc leaves it; leaving the cell writes it.
 */
function DateTimeEditor({ field, value, onDone }: { field: Field; value: FieldValue | undefined; onDone: (value: FieldValue | undefined, then?: Then) => void }) {
  const [held, setHeld] = useState<string | null>(typeof value === 'string' && value ? value : null);
  const ended = useRef(false);
  const end = (keep: boolean, then?: Then) => {
    if (ended.current) return;
    ended.current = true;
    onDone(keep ? held : undefined, then);
  };
  return (
    <span
      className="ce-dt"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) end(true);
      }}
    >
      <DateTimeBox
        label={field.label}
        value={held}
        autoFocus
        onChange={setHeld}
        onKeyDown={(event) => {
          if (event.key === 'Enter') end(true, 'down');
          else if (event.key === 'Escape') end(false);
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </span>
  );
}

/** A line typed in: text, a number, a day. Enter writes it and goes down, Tab along, Esc leaves it; leaving it writes it. */
function TextEditor({ field, value, typed, onDone }: { field: Field; value: FieldValue | undefined; typed?: string; onDone: (value: FieldValue | undefined, then?: Then) => void }) {
  const [text, setText] = useState(() => typed ?? (value === null || value === undefined ? '' : typeof value === 'number' ? String(value) : valueText(value)));
  const ended = useRef(false);
  const end = (keep: boolean, then?: Then) => {
    if (ended.current) return;
    ended.current = true;
    if (!keep) return onDone(undefined);
    const clean = text.trim();
    if (field.type === 'number') {
      // A duration is typed as minutes or as hours and minutes, 1:30.
      const n = field.format?.style === 'duration' ? (minutesOf(clean) ?? NaN) : Number(clean.replace(',', '.'));
      return onDone(clean === '' ? null : Number.isFinite(n) ? n : undefined, then);
    }
    onDone(field.type === 'date' || field.type === 'time' ? clean || null : text === '' ? null : text, then);
  };
  return (
    <input
      className="ce-in"
      autoFocus
      type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      autoComplete="off"
      spellCheck={false}
      aria-label={field.label}
      value={text}
      onFocus={(event) => {
        // What was there is chosen, to be typed over; a key that began it keeps the caret after it.
        if (typed === undefined && field.type !== 'date' && field.type !== 'time') event.currentTarget.select();
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => end(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') end(true, 'down');
        else if (event.key === 'Tab') end(true, event.shiftKey ? 'left' : 'right');
        else if (event.key === 'Escape') end(false);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}

/** A box that keeps the keyboard for a list opened under the cell. */
function ListBox({ anchor, keys, children, onKey }: {
  anchor: RefObject<HTMLSpanElement | null>;
  keys: RefObject<((event: KeyboardEvent) => void) | null>;
  children: ReactNode;
  onKey?: (event: KeyboardEvent<HTMLSpanElement>) => boolean;
}) {
  useEffect(() => anchor.current?.focus({ preventScroll: true }), [anchor]);
  return (
    <span
      ref={anchor}
      className="ce-box"
      tabIndex={0}
      onKeyDown={(event) => {
        if (onKey?.(event)) return;
        keys.current?.(event);
        event.stopPropagation();
      }}
    >
      {children}
      <span className="dd" aria-hidden="true">
        ▾
      </span>
    </span>
  );
}

/** One choice, from the field's choices in a list under the cell; picking one writes it. */
function ChoiceEditor({ field, value, onDone }: { field: Field; value: string | null; onDone: (value: FieldValue | undefined, then?: Then) => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const options: Option[] = [
    { value: null, label: t('collection.none'), chip: false },
    ...choiceOptions(field, field.options ?? []),
    ...(value && !field.options?.includes(value) ? choiceOptions(field, [value]) : []),
  ];
  return (
    <>
      <ListBox anchor={anchor} keys={keys}>
        {value ? <Chip text={value} color={field.colors?.[value]} /> : <span className="none">{t('collection.none')}</span>}
      </ListBox>
      <OptionList anchor={anchor} options={options} current={value ? [value] : []} label={field.label} keys={keys} onPick={(picked) => onDone(picked, 'down')} onClose={() => onDone(undefined)} />
    </>
  );
}

/**
 * Several choices: the cell's chips, and under it the picker tasks and cards have, with the
 * field's choices and what the other records hold; a word none of them is can be added. Closing it
 * writes what is picked.
 */
function ChoicesEditor({ field, value, used, onDone }: { field: Field; value: string[]; used: string[]; onDone: (value: FieldValue | undefined, then?: Then) => void }) {
  const [chosen, setChosen] = useState(value);
  const anchor = useRef<HTMLSpanElement>(null);
  const latest = useRef(chosen);
  latest.current = chosen;
  return (
    <>
      <span ref={anchor} className="ce-box">
        <span className="lbls">
          {chosen.length > 0 ? chosen.map((item) => <Chip key={item} text={item} color={field.colors?.[item]} />) : <span className="none">{t('collection.none')}</span>}
        </span>
      </span>
      <LabelPop
        anchor={anchor}
        path=""
        picked={chosen}
        known={fieldChoices(field, used)}
        edit={false}
        placeholder={t('collection.findOrAdd')}
        createText={(name) => t('collection.addTagNamed', { name })}
        onCreate={() => undefined}
        onChange={setChosen}
        onClose={() => onDone(latest.current)}
      />
    </>
  );
}

/** A link: a line to find a record of the field's collection by its name or code, the matches in a list under it; None takes the link off. */
function LinkEditor({ field, value, typed, ctx, onDone }: { field: Field; value: FieldValue | undefined; typed?: string; ctx: ValueContext; onDone: (value: FieldValue | undefined, then?: Then) => void }) {
  const links = (Array.isArray(value) ? value : value ? [value] : []).filter(isLink);
  const [query, setQuery] = useState(typed ?? '');
  const [chosen, setChosen] = useState<Link[]>(links);
  const anchor = useRef<HTMLSpanElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const into = field.collection ? ctx.collection(field.collection) : null;
  const target = field.collection && (!into || isLinkable(into.schema)) ? (ctx.records(field.collection) ?? []) : [];
  const q = query.trim().toLowerCase();
  const taken = new Set(chosen.map((l) => l.id));
  const found = target.filter((r) => (field.many || !taken.has(r.id)) && (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))).slice(0, 50);
  const options: Option[] = [
    ...(links.length > 0 && !field.many && !q ? [{ value: null, label: t('collection.none'), chip: false }] : []),
    ...found.map((r) => ({ value: r.id, label: recordLabel(r), chip: false })),
  ];
  const latest = useRef(chosen);
  latest.current = chosen;
  const pick = (id: string | null) => {
    if (id === null) return onDone(null, 'down');
    const record = found.find((r) => r.id === id);
    if (!record) return;
    if (!field.many) return onDone(linkTo(record), 'down');
    setChosen((now) => (now.some((l) => l.id === id) ? now.filter((l) => l.id !== id) : [...now, linkTo(record)]));
    setQuery('');
  };
  return (
    <>
      <span ref={anchor} className="ce-box ce-link">
        {field.many && chosen.map((link) => <span key={link.id} className="lnk-chip">{recordLabel(link)}</span>)}
        <input
          className="ce-in"
          autoFocus
          autoComplete="off"
          aria-label={field.label}
          placeholder={!field.many && links[0] ? recordLabel(links[0]) : t('collection.pickRecord')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            keys.current?.(event);
            event.stopPropagation();
          }}
        />
      </span>
      <OptionList anchor={anchor} options={options} current={chosen.map((l) => l.id)} label={field.label} keys={keys} width={260} onPick={pick} onClose={() => onDone(field.many ? latest.current : undefined)} />
    </>
  );
}
