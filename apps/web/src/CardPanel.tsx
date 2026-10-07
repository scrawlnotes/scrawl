import { type Board, type Card, type CardPatch, dayOf, keyOf, type Priority, type TimelineEntry } from '@scrawlnotes/core';
import type { ScrawlEditor, ScrawlViewer } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
/** How many of the board's labels are offered at once while one is typed. */
const OFFERED_LABELS = 6;

/** A label's colour, the same every time it is seen: a hue from its letters. */
export function labelHue(label: string): number {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}

/** A label as a chip in its colour. */
function LabelChip({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <span className="lbl" style={{ '--lh': labelHue(label) } as CSSProperties}>
      {label}
      {children}
    </span>
  );
}

/**
 * The card's labels as chips, each with an × that takes it off, and a field at their end that
 * adds one with Enter or a comma. While it has focus the labels used elsewhere on the board are
 * offered, the most used first; the arrow keys and Enter, or a click, pick one.
 */
function LabelField({ board, labels, onChange }: { board: Board; labels: string[]; onChange: (labels: string[]) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const field = useRef<HTMLInputElement>(null);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const known = useMemo(() => {
    const uses = new Map<string, number>();
    for (const card of board.cards) for (const label of card.labels ?? []) uses.set(label, (uses.get(label) ?? 0) + 1);
    return [...uses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
  }, [board]);
  const query = text.trim().toLowerCase();
  const offered = open
    ? known.filter((label) => !labels.some((l) => same(l, label)) && label.toLowerCase().includes(query)).slice(0, OFFERED_LABELS)
    : [];

  const add = (typed: string[]) => {
    const next = [...labels];
    for (const raw of typed) {
      const clean = raw.trim();
      if (!clean || next.some((l) => same(l, clean))) continue;
      // A label the board already has keeps the way it is written there.
      next.push(known.find((l) => same(l, clean)) ?? clean);
    }
    if (next.length !== labels.length) onChange(next);
  };
  const type = (value: string) => {
    // A comma ends a label, also in pasted text: what comes before each one is added.
    const parts = value.split(',');
    if (parts.length > 1) add(parts.slice(0, -1));
    setText(parts[parts.length - 1]!);
    setAt(-1);
  };
  const pick = (label: string) => {
    add([label]);
    setText('');
    setAt(-1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const chosen = offered[at];
      if (chosen) pick(chosen);
      else if (text.trim()) pick(text);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (offered.length === 0) return;
      const last = offered.length - 1;
      setAt((current) => (event.key === 'ArrowDown' ? (current >= last ? 0 : current + 1) : current <= 0 ? last : current - 1));
    } else if (event.key === 'Backspace' && text === '' && labels.length > 0) {
      onChange(labels.slice(0, -1));
    } else if (event.key === 'Escape') {
      if (text || at >= 0) {
        setText('');
        setAt(-1);
      } else field.current?.blur();
    } else return;
    event.preventDefault();
  };

  return (
    <div className="lbl-pick">
      <div
        className="lbl-field"
        onMouseDown={(event) => {
          // A click beside the chips is a click in the field.
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          field.current?.focus();
        }}
      >
        {labels.map((label) => (
          <LabelChip key={label} label={label}>
            <button
              type="button"
              className="lbl-x"
              title={t('card.removeLabel', { label })}
              aria-label={t('card.removeLabel', { label })}
              onClick={() => onChange(labels.filter((l) => l !== label))}
            >
              ×
            </button>
          </LabelChip>
        ))}
        <input
          ref={field}
          id="card-labels"
          aria-label={t('card.labels')}
          aria-expanded={offered.length > 0}
          aria-controls="card-labels-offered"
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          placeholder={labels.length === 0 ? t('card.addLabel') : ''}
          value={text}
          onChange={(event) => type(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // What was typed and not added yet is kept.
            add([text]);
            setText('');
            setAt(-1);
            setOpen(false);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {offered.length > 0 && (
        <div className="lbl-menu" id="card-labels-offered" role="listbox" aria-label={t('card.boardLabels')}>
          {offered.map((label, index) => (
            <button
              key={label}
              type="button"
              role="option"
              aria-selected={index === at}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setAt(index)}
              onClick={() => pick(label)}
            >
              <LabelChip label={label} />
            </button>
          ))}
        </div>
      )}
    </div>
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
