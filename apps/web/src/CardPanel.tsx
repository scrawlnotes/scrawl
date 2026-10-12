import {
  type Board,
  type Card,
  type CardPatch,
  cardValue,
  columnStatus,
  dayOf,
  type Field,
  type FieldValue,
  keyOf,
  type Link,
  numberText,
  type Priority,
  type TimelineEntry,
} from '@scrawlnotes/core';
import type { ScrawlEditor, ScrawlViewer } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { type CollectionActions, FieldInput, RecordDialog, type ValueContext } from './Collection';
import { pageBox, pageWindow } from './device';
import type { MenuItem } from './dialogs';
import { labelHue, useEscape } from './choices';
import { boardLabel } from './items';
import { StatusIcon } from './StatusIcon';
import { clockTime, pastDayLabel } from './text';

/** What the card panel does, on the board at the path given. */
export interface CardPanelActions {
  updateCard: (board: string, id: string, patch: CardPatch) => void;
  moveToColumn: (board: string, id: string, column: string) => void;
  /** Asks first, then deletes the card. */
  removeCard: (board: string, card: Card) => void;
  addComment: (board: string, id: string, text: string) => void;
  editComment: (board: string, id: string, comment: string, text: string) => void;
  removeComment: (board: string, id: string, comment: string) => void;
  /** Puts the card as a Markdown brief on the clipboard. */
  copyBrief: (board: string, id: string) => void;
  /** Makes a task due today in the inbox that links back to the card. */
  addToToday: (board: string, id: string) => void;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  /** What the note at a path is called, or null when it is not there any more. */
  noteTitle: (path: string) => string | null;
  openNote: (path: string) => void;
  /** An editor for the description, in `parent`; the host wires it to the vault's files. */
  editor: (parent: HTMLElement, doc: string, onChange: (doc: string) => void) => ScrawlEditor;
  /** A read-only view of Markdown, for comments. */
  viewer: (parent: HTMLElement, doc: string) => ScrawlViewer;
  /** The collections the board's link fields point at: their records to pick from, and a record to open over the card. */
  recordActions: CollectionActions;
}

/** The types typed as a line: kept when the box is left or Enter is pressed, not at every key. */
const TYPED: readonly Field['type'][] = ['text', 'number', 'url', 'email', 'phone', 'person'];

/**
 * A box for one of the board's own fields, as a record's form has it. A choice, a link, a day or
 * a tick is kept as soon as it is picked; a line of text when the box is left, when Enter is
 * pressed, or when the card closes.
 */
function CardFieldBox({ field, value, ctx, onSave }: { field: Field; value: FieldValue; ctx: ValueContext; onSave: (value: FieldValue) => void }) {
  const [draft, setDraft] = useState<FieldValue>(value);
  const pending = useRef<{ value: FieldValue } | null>(null);
  // Something typed and not saved yet: the field shows its Save.
  const [typing, setTyping] = useState(false);
  const latest = useRef({ value, onSave });
  latest.current = { value, onSave };
  const commit = () => {
    const typed = pending.current;
    pending.current = null;
    setTyping(false);
    if (typed && JSON.stringify(typed.value) !== JSON.stringify(latest.current.value)) latest.current.onSave(typed.value);
  };
  // A value changed elsewhere shows, unless something is being typed over it.
  useEffect(() => {
    if (!pending.current) setDraft(value);
  }, [value]);
  useEffect(() => () => commit(), []);
  if (!TYPED.includes(field.type)) return <FieldInput field={field} value={value} ctx={ctx} onChange={onSave} />;
  return (
    <div className="cfield" onBlur={commit}>
      <FieldInput
        field={field}
        value={draft}
        ctx={ctx}
        onChange={(next) => {
          pending.current = { value: next };
          setDraft(next);
          setTyping(true);
        }}
        onEnter={commit}
      />
      {typing && <SaveButton onSave={commit} />}
    </div>
  );
}

/** Markdown as the editor shows it, without editing. */
function MarkdownView({ text, viewer }: { text: string; viewer: CardPanelActions['viewer'] }) {
  const host = useRef<HTMLDivElement>(null);
  const shown = useRef<ScrawlViewer | null>(null);
  useEffect(() => {
    shown.current = viewer(host.current!, text);
    return () => {
      shown.current?.destroy();
      shown.current = null;
    };
    // Made once; the text is shown anew below when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    shown.current?.show(text);
  }, [text]);
  return <div className="md-view" ref={host} />;
}

const SAVE_DELAY_MS = 400;
const PRIORITIES: Priority[] = [1, 2, 3, 4];
/** How close to the window's edges the label picker may come. */
const EDGE = 8;

/** A label as a chip in its colour. */
function LabelChip({ label }: { label: string }) {
  return (
    <span className="lbl" style={{ '--lh': labelHue(label) } as CSSProperties}>
      {label}
    </span>
  );
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The card's labels as chips in a field like the others. A click on it, or Enter, opens the
 * picker under it, where labels are put on and taken off.
 */
function LabelField({ board, labels, onChange }: { board: Board; labels: string[]; onChange: (labels: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={field}
        id="card-labels"
        type="button"
        className="lbl-field"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {labels.length > 0 ? labels.map((label) => <LabelChip key={label} label={label} />) : <span className="lbl-empty">{t('card.addLabel')}</span>}
      </button>
      {open && (
        <LabelPicker
          anchor={field}
          board={board}
          labels={labels}
          onChange={onChange}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) field.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** The card's status, its icon beside it; a click opens the picker of every status under it. */
function StatusField({ board, current, onMove }: { board: Board; current: string; onMove: (column: string) => void }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLButtonElement>(null);
  const column = board.columns.find((c) => c.id === current);
  return (
    <>
      <button ref={field} id="card-status" type="button" className="st-field" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        {column && <StatusIcon status={columnStatus(board, column)} />}
        <span className="nm">{column?.name}</span>
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <StatusPicker
          anchor={field}
          board={board}
          current={current}
          onPick={(id) => {
            setOpen(false);
            field.current?.focus();
            if (id !== current) onMove(id);
          }}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) field.current?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * Every status of the board, in the order of its columns, with its icon and a tick on the one the
 * card is in; under the field, or above it when there is more room there. The arrow keys move
 * through it and Enter picks.
 */
function StatusPicker({ anchor, board, current, onPick, onClose }: {
  anchor: RefObject<HTMLButtonElement | null>;
  board: Board;
  current: string;
  onPick: (column: string) => void;
  onClose: (refocus: boolean) => void;
}) {
  const [at, setAt] = useState(() => Math.max(0, board.columns.findIndex((c) => c.id === current)));
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const field = anchor.current && pageBox(anchor.current);
      const height = box.current?.offsetHeight ?? 0;
      if (!field) return;
      const page = pageWindow();
      const below = page.height - field.bottom - EDGE - 4;
      const above = field.top - EDGE - 4;
      const width = Math.max(field.width, 220);
      const left = Math.max(EDGE, Math.min(field.left, page.width - width - EDGE));
      setPlace(below >= height || below >= above ? { left, width, top: field.bottom + 4 } : { left, width, bottom: page.height - field.top + 4 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor]);

  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) onClose(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = board.columns.length - 1;
    if (event.key === 'ArrowDown') setAt(at >= last ? 0 : at + 1);
    else if (event.key === 'ArrowUp') setAt(at <= 0 ? last : at - 1);
    else if (event.key === 'Enter') {
      const column = board.columns[at];
      if (column) onPick(column.id);
    } else if (event.key === 'Escape' || event.key === 'Tab') onClose(true);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <div ref={box} className="lbl-picker st-picker" role="listbox" aria-label={t('card.status')} tabIndex={-1} style={place ?? { opacity: 0 }} onKeyDown={onKeyDown}>
      {board.columns.map((column, index) => (
        <button
          key={column.id}
          type="button"
          role="option"
          aria-selected={column.id === current}
          tabIndex={-1}
          className={index === at ? 'at' : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={() => index !== at && setAt(index)}
          onClick={() => onPick(column.id)}
        >
          <StatusIcon status={columnStatus(board, column)} />
          <span className="nm">{column.name}</span>
          <span className="tick">{column.id === current ? '✓' : ''}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** A row of the picker: a label of the board, or a new one made from what is typed. */
type PickRow = { label: string; create?: true };

/**
 * The board's labels with a search above them, over everything else, under the field or above
 * it when there is more room there. The card's labels are ticked; a click or Enter ticks or
 * unticks one, and what is typed that no label is yet can be made one. The order is the one the
 * picker opened with, the card's labels first, so nothing moves while it is open.
 */
function LabelPicker({ anchor, board, labels, onChange, onClose }: {
  anchor: RefObject<HTMLButtonElement | null>;
  board: Board;
  labels: string[];
  onChange: (labels: string[]) => void;
  /** Closes the picker; with `true` the field gets the focus back. */
  onClose: (refocus: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(-1);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  /** How tall the picker is with every label in view, measured when it opens. */
  const natural = useRef(0);
  const [order, setOrder] = useState(() => {
    const uses = new Map<string, number>();
    for (const card of board.cards) for (const label of card.labels ?? []) uses.set(label, (uses.get(label) ?? 0) + 1);
    const rest = [...uses]
      .filter(([label]) => !labels.includes(label))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label]) => label);
    return [...labels, ...rest];
  });

  const typed = query.trim();
  const rows: PickRow[] = order.filter((label) => label.toLowerCase().includes(typed.toLowerCase())).map((label) => ({ label }));
  if (typed && !order.some((label) => same(label, typed))) rows.push({ label: typed, create: true });

  // Under the field, or above it when there is more room above; never past the window's edges.
  // Below, it hangs from the field and shrinks as the rows are filtered. Above, it keeps the
  // height it opened with, so that the search does not move while something is typed.
  useLayoutEffect(() => {
    if (!natural.current && box.current && list.current) {
      natural.current = box.current.offsetHeight - list.current.clientHeight + list.current.scrollHeight;
    }
    const measure = () => {
      const field = anchor.current && pageBox(anchor.current);
      if (!field) return;
      const page = pageWindow();
      const below = page.height - field.bottom - EDGE - 4;
      const above = field.top - EDGE - 4;
      const width = Math.max(field.width, 220);
      const left = Math.max(EDGE, Math.min(field.left, page.width - width - EDGE));
      setPlace(
        below >= Math.min(natural.current, 220) || below >= above
          ? { left, width, top: field.bottom + 4, maxHeight: below }
          : { left, width, bottom: page.height - field.top + 4, height: Math.min(natural.current, above) },
      );
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, labels]);

  // A press anywhere else closes it; a press on the field is the field's own toggle.
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) onClose(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor, onClose]);

  useEffect(() => {
    search.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    list.current?.querySelector('.at')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const choose = (row: PickRow) => {
    if (row.create) {
      onChange([...labels, row.label]);
      setOrder([...order, row.label]);
    } else {
      onChange(labels.includes(row.label) ? labels.filter((l) => l !== row.label) : [...labels, row.label]);
    }
    setQuery('');
    setAt(-1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (rows.length === 0) return;
      const last = rows.length - 1;
      setAt((current) => (event.key === 'ArrowDown' ? (current >= last ? 0 : current + 1) : current <= 0 ? last : current - 1));
    } else if (event.key === 'Enter') {
      const row = rows[at];
      if (row) choose(row);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      onClose(true);
    } else return;
    event.preventDefault();
  };

  return createPortal(
    <div
      ref={box}
      className="lbl-picker"
      role="dialog"
      aria-label={t('card.labels')}
      // Before it is placed it is measured where it is, unseen but able to take the focus.
      style={place ?? { opacity: 0 }}
    >
      <input
        ref={search}
        className="lbl-search"
        role="combobox"
        aria-label={t('card.findLabel')}
        aria-controls="card-label-rows"
        aria-expanded
        aria-activedescendant={at >= 0 ? `card-label-row-${at}` : undefined}
        autoComplete="off"
        placeholder={t('card.findLabel')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          // What is typed picks the first row, so Enter takes it.
          setAt(event.target.value.trim() ? 0 : -1);
        }}
        onKeyDown={onKeyDown}
      />
      <div ref={list} className="lbl-rows" id="card-label-rows" role="listbox" aria-multiselectable>
        {rows.map((row, index) => (
          <button
            key={row.create ? '\u0000create' : row.label}
            id={`card-label-row-${index}`}
            type="button"
            role="option"
            aria-selected={!row.create && labels.includes(row.label)}
            tabIndex={-1}
            className={index === at ? 'at' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => index !== at && setAt(index)}
            onClick={() => choose(row)}
          >
            {row.create ? (
              <>
                <span className="tick" aria-hidden="true">
                  +
                </span>
                <span className="lbl-new">{t('card.createLabel', { label: row.label })}</span>
              </>
            ) : (
              <>
                <span className="tick" aria-hidden="true">
                  {labels.includes(row.label) ? '✓' : ''}
                </span>
                <LabelChip label={row.label} />
              </>
            )}
          </button>
        ))}
        {rows.length === 0 && <p className="lbl-none">{t('card.noLabels')}</p>}
      </div>
    </div>,
    document.body,
  );
}

/** A moment on the timeline: the time of day today, else the day. */
function when(iso: string, today: string): string {
  const day = dayOf(new Date(iso));
  return day === today ? clockTime(iso) : pastDayLabel(day, today);
}

/** A text field as tall as what is written in it. */
function GrowingField({ value, onChange, onKeyDown, placeholder, autoFocus, label }: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  label: string;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={field}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

/** A line of text saved by its Save button while it is changed, and when it is left or Enter is pressed. */
function TextField({ id, label, value, placeholder, onSave }: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const save = () => {
    if (text !== value) onSave(text);
  };
  return (
    <span className="tfield">
      <input
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          else if (event.key === 'Escape') setText(value);
        }}
      />
      {text !== value && <SaveButton onSave={save} />}
    </span>
  );
}

/** The Save beside a field being typed in; it does not take the field's focus first. */
function SaveButton({ onSave }: { onSave: () => void }) {
  return (
    <button type="button" className="line-ok" onMouseDown={(event) => event.preventDefault()} onClick={onSave}>
      {t('card.save')}
    </button>
  );
}

/** One comment on the timeline, with its menu: edit in place, or delete. */
function Comment({ entry, today, onEdit, onRemove, menu, viewer }: {
  entry: Extract<TimelineEntry, { kind: 'comment' }>;
  today: string;
  onEdit: (text: string) => void;
  onRemove: () => void;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  viewer: CardPanelActions['viewer'];
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const open = (event: MouseEvent) =>
    menu(event, [
      { label: t('card.editComment'), run: () => setDraft(entry.text) },
      { label: t('menu.delete'), run: onRemove },
    ]);
  const save = () => {
    if (draft?.trim()) onEdit(draft);
    setDraft(null);
  };
  return (
    <div className="tl-cm" onContextMenu={open}>
      <div className="h">
        <b>{entry.by ?? t('card.someone')}</b>
        {entry.edited && <small>{t('card.edited')}</small>}
        <span className="t">{when(entry.at, today)}</span>
        <button type="button" className="more" title={t('tasks.more')} aria-label={t('tasks.more')} onClick={open}>
          ···
        </button>
      </div>
      {draft === null ? (
        <MarkdownView text={entry.text} viewer={viewer} />
      ) : (
        <>
          <GrowingField
            value={draft}
            label={t('card.editComment')}
            autoFocus
            onChange={setDraft}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              setDraft(null);
            }}
          />
          <div className="cp-actions">
            <button type="button" onClick={() => setDraft(null)}>
              {t('dialog.cancel')}
            </button>
            <button type="button" className="primary" onClick={save}>
              {t('card.save')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A card beside the columns: its title and fields, the description in the note editor, the
 * note it came from, and its timeline of moves and comments with a place to write one.
 */
export function CardPanel({ board, path, card, today, actions, escape = false, onClose }: {
  board: Board;
  path: string;
  card: Card;
  today: string;
  actions: CardPanelActions;
  /** Esc closes it: opened over a record, where no board handles the keys. */
  escape?: boolean;
  onClose: () => void;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEscape(backdrop, onClose, escape);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const timer = useRef(0);
  const unsaved = useRef<string | null>(null);
  const [comment, setComment] = useState('');
  // A record a link of the card points at, opened over it.
  const [over, setOver] = useState<{ dir: string; id: string } | null>(null);
  const noteTitle = card.note ? actions.noteTitle(card.note) : null;
  const records = actions.recordActions;
  const ctx: ValueContext = {
    records: records.records,
    collection: records.collection,
    openLink: records.openLink,
    openRecord: (field: Field, link: Link) => field.collection && setOver({ dir: field.collection, id: link.id }),
  };
  const overCollection = over ? records.collection(over.dir) : null;
  const overRecord = over ? (overCollection?.records.find((r) => r.id === over.id) ?? null) : null;

  // The description is saved shortly after it is typed, and when the panel closes or shows another card.
  const latest = useRef({ path, id: card.id, actions });
  latest.current = { path, id: card.id, actions };
  useEffect(() => {
    const parent = host.current!;
    const { path: at, id, actions: act } = latest.current;
    const flush = () => {
      window.clearTimeout(timer.current);
      if (unsaved.current === null) return;
      const text = unsaved.current;
      unsaved.current = null;
      act.updateCard(at, id, { description: text });
    };
    editor.current = act.editor(parent, card.description ?? '', (doc) => {
      unsaved.current = doc;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    });
    return () => {
      flush();
      editor.current?.destroy();
      editor.current = null;
    };
    // The editor is made once per card; what is typed in it is saved as it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  const update = (patch: CardPatch) => actions.updateCard(path, card.id, patch);
  const menu = (event: MouseEvent) =>
    actions.menu(event, [
      { label: t('card.copyBrief'), run: () => actions.copyBrief(path, card.id) },
      { label: t('card.addToToday'), run: () => actions.addToToday(path, card.id) },
      { label: t('menu.delete'), run: () => actions.removeCard(path, card) },
    ]);
  const send = () => {
    if (!comment.trim()) return;
    actions.addComment(path, card.id, comment);
    setComment('');
  };
  const columnName = (id: string | null) => (id === null ? '' : (board.columns.find((c) => c.id === id)?.name ?? t('card.removedColumn')));

  return (
    <div ref={backdrop} className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="cpanel" role="dialog" aria-label={keyOf(board, card)}>
      <div className="cp-head">
        <span className="key">{keyOf(board, card)}</span>
        <span className="where">{boardLabel(path)}</span>
        <button type="button" className="more" title={t('card.menu')} aria-label={t('card.menu')} onClick={menu}>
          ···
        </button>
        <button type="button" className="x" title={t('card.close')} aria-label={t('card.close')} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="cp-body">
        <div className="cp-main">
        <TextField id="card-title" label={t('card.title')} value={card.title} onSave={(title) => update({ title })} />
        <div className="cp-sec">{t('card.description')}</div>
        <div className="cp-desc" ref={host} />
        {card.note && (
          <p className="cp-links">
            {noteTitle === null ? (
              <span className="gone">{t('tasks.from', { note: '?' })}</span>
            ) : (
              <button type="button" className="link" onClick={() => actions.openNote(card.note!)}>
                {t('tasks.from', { note: noteTitle })}
              </button>
            )}
          </p>
        )}
        <div className="cp-sec">{t('card.timeline')}</div>
        <div className="tlog">
          {card.timeline.map((entry) =>
            entry.kind === 'move' ? (
              <div key={entry.id} className="tl-ev">
                <b>{entry.by ?? t('card.someone')}</b>
                <span>{entry.from === null ? t('card.movedIn', { to: columnName(entry.to) }) : t('card.moved', { from: columnName(entry.from), to: columnName(entry.to) })}</span>
                <span className="t">{when(entry.at, today)}</span>
              </div>
            ) : (
              <Comment
                key={entry.id}
                entry={entry}
                today={today}
                menu={actions.menu}
                viewer={actions.viewer}
                onEdit={(text) => actions.editComment(path, card.id, entry.id, text)}
                onRemove={() => actions.removeComment(path, card.id, entry.id)}
              />
            ),
          )}
          <div className="cp-new">
            <GrowingField
              value={comment}
              label={t('card.comment')}
              placeholder={t('card.commentHint')}
              onChange={setComment}
            />
            <div className="cp-actions">
              <button type="button" className="primary" disabled={!comment.trim()} onClick={send}>
                {t('card.comment')}
              </button>
            </div>
          </div>
        </div>
        </div>
        <aside className="cp-side">
        <div className="fields">
          <label htmlFor="card-status">{t('card.status')}</label>
          <StatusField board={board} current={card.column} onMove={(column) => actions.moveToColumn(path, card.id, column)} />
          {board.phasesOn && (
            <>
              <label htmlFor="card-phase">{t('card.phase')}</label>
              <select id="card-phase" value={card.phase ?? ''} onChange={(event) => update({ phase: event.target.value || null })}>
                <option value="">{t('card.noPhase')}</option>
                {board.phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <label htmlFor="card-priority">{t('card.priority')}</label>
          <select id="card-priority" value={card.priority} onChange={(event) => update({ priority: Number(event.target.value) as Priority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p === 4 ? t('tasks.noPriority') : t('tasks.priorityN', { n: p })}
              </option>
            ))}
          </select>
          <label htmlFor="card-labels">{t('card.labels')}</label>
          <LabelField board={board} labels={card.labels ?? []} onChange={(labels) => update({ labels })} />
          <label htmlFor="card-due">{t('card.due')}</label>
          <input id="card-due" type="date" value={card.due ?? ''} onChange={(event) => update({ due: event.target.value || null })} />
          <label htmlFor="card-assignee">{t('card.assignee')}</label>
          <TextField
            id="card-assignee"
            label={t('card.assignee')}
            placeholder={t('card.unassigned')}
            value={card.assignee ?? ''}
            onSave={(text) => update({ assignee: text.trim() || null })}
          />
        </div>
        {/* The board's own fields, under the card's. */}
        {(board.fields ?? []).length > 0 && (
          <div className="own-fields">
            {board.fields!.map((field) => {
              const value = cardValue(board, card, field, today);
              return (
                <div key={field.key} className="prop">
                  <label className="pl" htmlFor={`field-${field.key}`}>
                    {field.label}
                    {field.required && <i title={t('collection.required')}>*</i>}
                  </label>
                  <div className="pe">
                    {field.type === 'formula' ? (
                      <span className={typeof value === 'number' ? 'st-field formula' : 'st-field formula none'}>{typeof value === 'number' ? numberText(value) : '–'}</span>
                    ) : (
                      <CardFieldBox field={field} value={value} ctx={ctx} onSave={(next) => update({ values: { [field.key]: next } })} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </aside>
      </div>
    </section>
    {over && overCollection && overRecord && (
      <RecordDialog key={overRecord.id} collection={overCollection} record={overRecord} today={today} actions={records} onClose={() => setOver(null)} />
    )}
    </div>
  );
}
