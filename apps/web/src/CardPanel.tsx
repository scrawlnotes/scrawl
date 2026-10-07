import { type Board, type Card, type CardPatch, dayOf, keyOf, type Priority, type TimelineEntry } from '@scrawlnotes/core';
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
import type { MenuItem } from './dialogs';
import { boardLabel } from './items';
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

/** A label's colour, the same every time it is seen: a hue from its letters. */
export function labelHue(label: string): number {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}

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
      const field = anchor.current?.getBoundingClientRect();
      if (!field) return;
      const below = window.innerHeight - field.bottom - EDGE - 4;
      const above = field.top - EDGE - 4;
      const width = Math.max(field.width, 220);
      const left = Math.max(EDGE, Math.min(field.left, window.innerWidth - width - EDGE));
      setPlace(
        below >= Math.min(natural.current, 220) || below >= above
          ? { left, width, top: field.bottom + 4, maxHeight: below }
          : { left, width, bottom: window.innerHeight - field.top + 4, height: Math.min(natural.current, above) },
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

/** A line of text saved when it is left or Enter is pressed. */
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
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) save();
              else if (event.key === 'Escape') setDraft(null);
              else return;
              event.preventDefault();
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
export function CardPanel({ board, path, card, today, actions, onClose }: {
  board: Board;
  path: string;
  card: Card;
  today: string;
  actions: CardPanelActions;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const timer = useRef(0);
  const unsaved = useRef<string | null>(null);
  const [comment, setComment] = useState('');
  const noteTitle = card.note ? actions.noteTitle(card.note) : null;

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
    <div className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
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
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            {comment.trim() && (
              <div className="cp-actions">
                <button type="button" className="primary" onClick={send}>
                  {t('card.comment')}
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
        <aside className="cp-side">
        <div className="fields">
          <label htmlFor="card-status">{t('card.status')}</label>
          <select id="card-status" value={card.column} onChange={(event) => actions.moveToColumn(path, card.id, event.target.value)}>
            {board.columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
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
        </aside>
      </div>
      <div className="cp-foot">{t('card.keys', { n: board.columns.length })}</div>
    </section>
    </div>
  );
}
