import { type Board, type Card, type CardPatch, dayOf, keyOf, type Priority, type TimelineEntry } from '@scrawlnotes/core';
import type { ScrawlEditor } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  /** What the note at a path is called, or null when it is not there any more. */
  noteTitle: (path: string) => string | null;
  openNote: (path: string) => void;
  /** An editor for the description, in `parent`; the host wires it to the vault's files. */
  editor: (parent: HTMLElement, doc: string, onChange: (doc: string) => void) => ScrawlEditor;
}

const SAVE_DELAY_MS = 400;
const PRIORITIES: Priority[] = [1, 2, 3, 4];

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
function Comment({ entry, today, onEdit, onRemove, menu }: {
  entry: Extract<TimelineEntry, { kind: 'comment' }>;
  today: string;
  onEdit: (text: string) => void;
  onRemove: () => void;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
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
        <p>{entry.text}</p>
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
      { label: t('menu.delete'), run: () => actions.removeCard(path, card) },
    ]);
  const send = () => {
    if (!comment.trim()) return;
    actions.addComment(path, card.id, comment);
    setComment('');
  };
  const columnName = (id: string | null) => (id === null ? '' : (board.columns.find((c) => c.id === id)?.name ?? t('card.removedColumn')));

  return (
    <aside className="cpanel" aria-label={keyOf(board, card)}>
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
        <TextField id="card-title" label={t('card.title')} value={card.title} onSave={(title) => update({ title })} />
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
          <TextField
            id="card-labels"
            label={t('card.labels')}
            placeholder={t('card.labelsHint')}
            value={card.labels?.join(', ') ?? ''}
            onSave={(text) => update({ labels: text.split(',').map((l) => l.trim()).filter(Boolean) })}
          />
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
      <div className="cp-foot">{t('card.keys', { n: board.columns.length })}</div>
    </aside>
  );
}
