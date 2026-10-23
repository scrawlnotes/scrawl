import {
  type Board,
  type Card,
  type CardPatch,
  cardValue,
  columnStatus,
  computerFor,
  dayOf,
  type Field,
  type FieldValue,
  isComputed,
  isEmpty,
  isLink,
  keyOf,
  type Link,
  formatNumber,
  currencyOf,
  type PersonRef,
  type Priority,
  type Subtask,
  type TimelineEntry,
  valueText,
  workerKey,
  workersOf,
} from '@scrawlnotes/core';
import type { ScrawlEditor, ScrawlViewer } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import {
  type CSSProperties,
  type FormEvent,
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Cell, type CollectionActions, FieldInput, RecordDialog, usedValues, type ValueContext } from './Collection';
import { isPhone, pageBox, pageWindow } from './device';
import type { MenuHead, MenuItem } from './dialogs';
import { useEscape } from './choices';
import { LabelChip, LabelSheet, LabelsField } from './labels';
import { AttachButton } from './Description';
import { Icon, type IconName } from './Icon';
import { boardLabel } from './items';
import { ActivityLine, GaveTo, when, Writer, writerOf, writerText } from './Activity';
import { assigneeLabel, NameOf, PersonPicker, type SpacePeople, WhoOf } from './People';
import { PeopleSheet } from './PhoneSpaces';
import { AssigneeSheet, KindMark, PhaseSheet, StatusSheet } from './PhoneBoard';
import { LinkSheet } from './PhoneCollection';
import { DateSheet, priorityItems } from './PhoneTasks';
import { Sheet } from './sheets';
import { StatusIcon } from './StatusIcon';
import { Subtasks } from './Subtasks';
import { dueClass, dueLabel } from './Tasks';
import { dateLabel } from './TimeInputs';
import { clockTime, pastDayLabel } from './text';

/** What the card panel does, on the board at the path given. */
export interface CardPanelActions {
  updateCard: (board: string, id: string, patch: CardPatch) => void;
  /** Changes a card's subtasks, from the list as it is when it is saved. */
  changeSubtasks: (board: string, id: string, change: (list: Subtask[]) => Subtask[]) => void;
  /** Ticks off a card's subtask, saying so with Undo. */
  completeSubtask: (board: string, id: string, subtask: string) => void;
  /** A subtask was taken off a card: says so, with Undo. */
  removedSubtask?: (undo: () => void) => void;
  moveToColumn: (board: string, id: string, column: string) => void;
  /** Asks first, then deletes the card. */
  removeCard: (board: string, card: Card) => void;
  addComment: (board: string, id: string, text: string) => void;
  editComment: (board: string, id: string, comment: string, text: string) => void;
  removeComment: (board: string, id: string, comment: string) => void;
  /** Puts the card as a Markdown brief on the clipboard. */
  copyBrief: (board: string, id: string) => void;
  /** Opens a menu at the pointer; on a phone an action sheet, `head` saying what it is about. */
  menu: (event: MouseEvent, items: MenuItem[], head?: MenuHead) => void;
  /** What the note at a path is called, or null when it is not there any more. */
  noteTitle: (path: string) => string | null;
  openNote: (path: string) => void;
  /** An editor for the description of a card of the board at `home`, in `parent`; the host wires it to the files of the board's space. */
  editor: (home: string, parent: HTMLElement, doc: string, onChange: (doc: string) => void, hint?: string) => ScrawlEditor;
  /** Copies files chosen with Attach into a description's editor, where its cursor is. */
  attach: (editor: ScrawlEditor, home: string, files: File[]) => void;
  /** A read-only view of Markdown, for comments on a card of the board at `home`. */
  viewer: (home: string, parent: HTMLElement, doc: string) => ScrawlViewer;
  /** The collections the board's link fields point at: their records to pick from, and a record to open over the card. */
  recordActions: CollectionActions;
  /** The people of the space a board is in, to give its cards to; null in the personal space, where a name is typed. */
  people?: (board: string) => SpacePeople | null;
}

/**
 * Who a card is given to in a space with people, after the Card assign view of
 * design/mockups.html: the person, or Nobody, in a field that opens the people of the space.
 */
function AssigneeField({ team, current, onPick }: { team: SpacePeople; current: PersonRef | null; onPick: (assignee: PersonRef | null) => void }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLButtonElement>(null);
  const name = current ? assigneeLabel(current, team.people) : null;
  return (
    <>
      <button ref={field} id="card-assignee" type="button" className={`st-field who-field${open ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={open} title={name ?? undefined} onClick={() => setOpen(!open)}>
        {current ? (
          <>
            <WhoOf who={current} people={team.people} />
            <span className="nm">
              <NameOf who={current} people={team.people} />
            </span>
          </>
        ) : (
          <span className="nm none">{t('people.nobody')}</span>
        )}
      </button>
      {open && field.current && (
        <PersonPicker
          anchor={field.current}
          team={team}
          current={current}
          onPick={(assignee) => {
            setOpen(false);
            field.current?.focus();
            onPick(assignee);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
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
  const latest = useRef({ value, onSave });
  latest.current = { value, onSave };
  const commit = () => {
    const typed = pending.current;
    pending.current = null;
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
        }}
        onEnter={commit}
      />
    </div>
  );
}

/** Shows Markdown in `parent`, read only. */
type Viewer = (parent: HTMLElement, doc: string) => ScrawlViewer;

/** Markdown as the editor shows it, without editing. */
function MarkdownView({ text, viewer }: { text: string; viewer: Viewer }) {
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
    </span>
  );
}

/**
 * A card's timeline, in one stream (design/activity.md 1.2): who made it, then only what
 * mattered, each on one short line with the face and the name of who did it: a move, who it was
 * given to, the subtasks ticked off; and the comments. An entry of a kind this version does not
 * know is not shown.
 */
function Timeline({ board, path, card, team, today, actions }: { board: Board; path: string; card: Card; team: SpacePeople | null; today: string; actions: CardPanelActions }) {
  const people = team?.people;
  const columnName = (id: string | null) => (id === null ? '' : (board.columns.find((c) => c.id === id)?.name ?? t('card.removedColumn')));
  const line = (key: string, who: PersonRef | null, what: ReactNode, at: string) => (
    <ActivityLine key={key} who={who} team={team} at={at} today={today}>
      {what}
    </ActivityLine>
  );
  const subtaskTitle = (id: string | undefined) => card.subtasks?.find((s) => s.id === id)?.title;
  return (
    <>
      {card.author && card.created && line('created', card.author, t('card.createdThis'), card.created)}
      {card.timeline.map((entry) => {
        const who = writerOf(entry);
        if (entry.kind === 'move') return line(entry.id, who, entry.from === null ? t('card.movedIn', { to: columnName(entry.to) }) : t('card.moved', { from: columnName(entry.from), to: columnName(entry.to) }), entry.at);
        if (entry.kind === 'assign') return line(entry.id, who, <GaveTo given={entry.given} team={team} />, entry.at);
        if (entry.kind === 'tick') {
          const one = entry.subtasks.length === 1 ? subtaskTitle(entry.subtasks[0]) : undefined;
          return line(entry.id, who, one ? t('card.tickedOne', { title: one }) : t('card.ticked', { count: entry.subtasks.length }), entry.at);
        }
        if (entry.kind === 'comment') {
          return (
            <Comment
              key={entry.id}
              entry={entry}
              who={<Writer who={who} team={team} />}
              whoText={writerText(who, team)}
              face={<WhoOf who={who ?? {}} people={people} />}
              today={today}
              menu={actions.menu}
              viewer={(parent, doc) => actions.viewer(path, parent, doc)}
              onEdit={(text) => actions.editComment(path, card.id, entry.id, text)}
              onRemove={() => actions.removeComment(path, card.id, entry.id)}
            />
          );
        }
        return null;
      })}
    </>
  );
}

/** Who worked on a card, under its fields: each once, the latest first, with when they last did. */
function WorkedOnList({ card, team, today }: { card: Card; team: SpacePeople | null; today: string }) {
  const workers = workersOf(card);
  if (workers.length === 0) return null;
  return (
    <div className="worked">
      <span className="wl">{t('card.workedOn')}</span>
      {workers.map((worker) => {
        const who = { ...(worker.id && { id: worker.id }), ...(worker.name && { name: worker.name }) };
        return (
          <div key={workerKey(worker)} className="wk" title={assigneeLabel(who, team?.people)}>
            <WhoOf who={who} people={team?.people} />
            <span className="nm">
              <NameOf who={who} people={team?.people} first />
            </span>
            <span className="t">{when(worker.at, today)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One comment on the timeline, with its menu: edit in place, or delete. */
function Comment({ entry, who, whoText, face, today, onEdit, onRemove, menu, viewer }: {
  entry: Extract<TimelineEntry, { kind: 'comment' }>;
  /** Who wrote it, as the timeline shows it. */
  who: ReactNode;
  /** The same in words, for its menu's head on a phone. */
  whoText: string;
  /** Their face. */
  face: ReactNode;
  today: string;
  onEdit: (text: string) => void;
  onRemove: () => void;
  menu: CardPanelActions['menu'];
  viewer: Viewer;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // On a phone, an action sheet with who wrote it and when.
  const open = (event: MouseEvent) =>
    menu(
      event,
      [
        { label: t('card.editComment'), icon: 'pen', run: () => setDraft(entry.text) },
        { label: t('menu.delete'), icon: 'trash', danger: true, run: onRemove },
      ],
      { icon: 'comment', title: whoText, sub: when(entry.at, today) },
    );
  const save = () => {
    if (draft?.trim()) onEdit(draft);
    setDraft(null);
  };
  return (
    <div className="tl-cm" onContextMenu={open}>
      <div className="h">
        {face}
        <b>{who}</b>
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
  // The board's own fields, a formula's and a lookup's worked out with the records they read.
  const computer = computerFor(null, records.collections(), { ...records.boards(), [path]: board }, today);
  const shownAs = computer.shown(path);
  const team = actions.people?.(path) ?? null;
  const ctx: ValueContext = {
    records: records.records,
    collection: records.collection,
    openLink: records.openLink,
    openRecord: (field: Field, link: Link) => field.collection && setOver({ dir: field.collection, id: link.id }),
    used: (field: Field) => usedValues(board.cards.map((each) => each.values?.[field.key])),
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
    editor.current = act.editor(at, parent, card.description ?? '', (doc) => {
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
        <AttachButton onFiles={(files) => editor.current && actions.attach(editor.current, path, files)} />
        <Subtasks
          list={card.subtasks ?? []}
          change={(change) => actions.changeSubtasks(path, card.id, change)}
          complete={(subtask) => actions.completeSubtask(path, card.id, subtask)}
          removed={actions.removedSubtask}
          team={team}
          today={today}
          menu={actions.menu}
          place="card"
        />
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
          <Timeline board={board} path={path} card={card} team={team} today={today} actions={actions} />
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
          <select id="card-priority" className={`prio p${card.priority}`} value={card.priority} onChange={(event) => update({ priority: Number(event.target.value) as Priority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p} className={`p${p}`}>
                {p === 4 ? t('tasks.noPriority') : t('tasks.priorityN', { n: p })}
              </option>
            ))}
          </select>
          <label htmlFor="card-labels">{t('card.labels')}</label>
          <LabelsField id="card-labels" path={path} labels={card.labels ?? []} onChange={(labels) => update({ labels })} />
          <label htmlFor="card-due">{t('card.due')}</label>
          <input id="card-due" type="date" value={card.due ?? ''} onChange={(event) => update({ due: event.target.value || null })} />
          <label htmlFor="card-assignee">{t('card.assignee')}</label>
          {team ? (
            <AssigneeField team={team} current={card.assignee ?? null} onPick={(assignee) => update({ assignee })} />
          ) : (
            <TextField
              id="card-assignee"
              label={t('card.assignee')}
              placeholder={t('card.unassigned')}
              value={card.assignee?.name ?? ''}
              onSave={(text) => update({ assignee: text.trim() ? { name: text.trim() } : null })}
            />
          )}
        </div>
        {/* The board's own fields, under the card's. */}
        {(board.fields ?? []).length > 0 && (
          <div className="own-fields">
            {board.fields!.map((field) => {
              const value = computer.cardValue(path, card, field);
              return (
                <div key={field.key} className="prop">
                  <label className="pl" htmlFor={`field-${field.key}`}>
                    {field.label}
                    {field.required && <i title={t('collection.required')}>*</i>}
                  </label>
                  <div className="pe">
                    {isComputed(field.type) ? (
                      <span className={isEmpty(value) ? 'st-field formula none' : 'st-field formula'}>{isEmpty(value) ? '–' : <Cell field={shownAs.get(field.key) ?? field} value={value} ctx={ctx} />}</span>
                    ) : (
                      <CardFieldBox field={field} value={value} ctx={ctx} onSave={(next) => update({ values: { [field.key]: next } })} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <WorkedOnList card={card} team={team} today={today} />
        </aside>
      </div>
    </section>
    {over && overCollection && overRecord && (
      <RecordDialog key={overRecord.id} collection={overCollection} record={overRecord} today={today} actions={records} onClose={() => setOver(null)} />
    )}
    </div>
  );
}

/** On a phone, a menu opens from the bottom wherever it was asked for. */
const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

/**
 * A card on a phone, as a page, after the Phone board views of design/mockups.html: its key and
 * board, its title written in place with Cancel and Save while it is changed, its fields as rows
 * whose values are picked in sheets, the board's own fields, its description in the note editor,
 * its timeline, and a comment box at the foot.
 */
export function PhoneCardPage({ board, path, card, today, actions }: {
  board: Board;
  path: string;
  card: Card;
  today: string;
  actions: CardPanelActions;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const timer = useRef(0);
  const unsaved = useRef<string | null>(null);
  const [title, setTitle] = useState(card.title);
  useEffect(() => setTitle(card.title), [card.title]);
  const [comment, setComment] = useState('');
  const [picking, setPicking] = useState<'status' | 'phase' | 'labels' | 'due' | 'assignee' | null>(null);
  /** A field of the board's typed in a sheet, or a link picked from its collection's records. */
  const [editing, setEditing] = useState<Field | null>(null);
  const [linking, setLinking] = useState<Field | null>(null);
  const [over, setOver] = useState<{ dir: string; id: string } | null>(null);
  const records = actions.recordActions;
  const computer = computerFor(null, records.collections(), { ...records.boards(), [path]: board }, today);
  // In a space with people a card is given to one of them; in the personal space a name is typed.
  const team = actions.people?.(path) ?? null;
  const workers = workersOf(card);
  const ctx: ValueContext = {
    records: records.records,
    collection: records.collection,
    openLink: records.openLink,
    openRecord: (field: Field, link: Link) => field.collection && (records.show ? records.show(field.collection, link.id) : setOver({ dir: field.collection, id: link.id })),
    used: (field: Field) => usedValues(board.cards.map((each) => each.values?.[field.key])),
  };
  const overCollection = over ? records.collection(over.dir) : null;
  const overRecord = over ? (overCollection?.records.find((r) => r.id === over.id) ?? null) : null;

  // The description is saved shortly after it is typed, and when the page goes.
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
    editor.current = act.editor(
      at,
      parent,
      card.description ?? '',
      (doc) => {
        unsaved.current = doc;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
      },
      t('phone.addDescription'),
    );
    return () => {
      flush();
      editor.current?.destroy();
      editor.current = null;
    };
    // The editor is made once per card; what is typed in it is saved as it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  const update = (patch: CardPatch) => actions.updateCard(path, card.id, patch);
  const column = board.columns.find((c) => c.id === card.column);
  const phase = card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  const noteTitle = card.note ? actions.noteTitle(card.note) : null;
  const columnName = (id: string | null) => (id === null ? '' : (board.columns.find((c) => c.id === id)?.name ?? t('card.removedColumn')));
  const send = () => {
    if (!comment.trim()) return;
    actions.addComment(path, card.id, comment);
    setComment('');
  };
  const none = <span className="none">{t('phone.none')}</span>;
  const setValue = (field: Field, value: FieldValue) => update({ values: { [field.key]: value } });
  // A board's field as a row: what is worked out only shows; a tick turns over; a choice is picked
  // from an action sheet, a record from its collection's; the rest is typed in a sheet.
  const fieldRow = (field: Field) => {
    const value = computer.cardValue(path, card, field);
    const links = (Array.isArray(value) ? value : [value]).filter(isLink);
    const shown = isEmpty(value) ? (
      none
    ) : field.type === 'checkbox' ? (
      <Icon name="check" />
    ) : (
      <span className={field.type === 'link' ? 'tx lnk' : 'tx'}>
        {typeof value === 'number'
          ? formatNumber(value, field.format, currencyOf(field.format, card.values))
          : links.length > 0
            ? links.map((link) => link.name || link.code).join(', ')
            : field.type === 'date' && typeof value === 'string'
              ? dateLabel(value, today)
              : valueText(value)}
      </span>
    );
    const label = (
      <>
        {field.label}
        {field.required && <i className="req">*</i>}
      </>
    );
    if (isComputed(field.type)) {
      return (
        <div key={field.key} className="mb-fr">
          <Icon name={FIELD_ICONS[field.type]} />
          <span className="fl">{label}</span>
          <span className="val">{shown}</span>
        </div>
      );
    }
    const open = () => {
      if (field.type === 'checkbox') return setValue(field, value !== true);
      if (field.type === 'link' && field.collection) return setLinking(field);
      if (field.type === 'select') {
        return actions.menu(
          NO_POINTER,
          [
            { label: t('collection.none'), icon: 'close', value: isEmpty(value) ? '✓' : undefined, run: () => setValue(field, null) },
            ...(field.options ?? []).map((option) => ({ label: option, icon: 'tag' as const, value: value === option ? '✓' : undefined, run: () => setValue(field, option) })),
          ],
          { icon: 'tag', title: field.label, sub: keyOf(board, card) },
        );
      }
      setEditing(field);
    };
    return <Fragment key={field.key}>{row(FIELD_ICONS[field.type], label, shown, open)}</Fragment>;
  };
  // A row that opens a list has its arrow, as the mockup has them: Status and Phase.
  const row = (icon: IconName, label: ReactNode, value: ReactNode, run: () => void, list = false) => (
    <button type="button" className="mb-fr" onClick={run}>
      <Icon name={icon} />
      <span className="fl">{label}</span>
      <span className="val">
        {value}
        {list && <Icon name="chevron" />}
      </span>
    </button>
  );

  return (
    <div className="mb-cpage">
      <div className="mb-cbody">
        <div className="mb-ckey">
          {keyOf(board, card)} · {path.slice(path.lastIndexOf('/') + 1).replace(/\.board\.json$/, '')}
        </div>
        <div className="mb-ctitle">
          <GrowingField value={title} label={t('card.title')} onChange={setTitle} />
        </div>
        {title !== card.title && (
          <div className="mb-cedit">
            <button type="button" onClick={() => setTitle(card.title)}>
              {t('dialog.cancel')}
            </button>
            <button type="button" className="primary" disabled={!title.trim()} onClick={() => update({ title })}>
              {t('card.save')}
            </button>
          </div>
        )}
        <div className="mb-form">
          <div className="mb-group">
            {row(
              'board',
              t('card.status'),
              column ? (
                <>
                  <KindMark kind={column.kind} />
                  <span className="tx">{column.name}</span>
                </>
              ) : (
                none
              ),
              () => setPicking('status'),
              true,
            )}
            {board.phasesOn && row('phase', t('card.phase'), phase ? <span className="tx">{phase.name}</span> : none, () => setPicking('phase'), true)}
            {row(
              'flag',
              t('card.priority'),
              card.priority === 4 ? (
                none
              ) : (
                <span className={`prio p${card.priority}`}>
                  <Icon name="flag" />p{card.priority}
                </span>
              ),
              () => actions.menu(NO_POINTER, priorityItems(card.priority, (priority) => update({ priority })), { icon: 'flag', title: t('card.priority') }),
            )}
            {row(
              'tag',
              t('card.labels'),
              card.labels?.length ? (
                <span className="lbls">
                  {card.labels.map((label) => (
                    <LabelChip key={label} path={path} name={label} className="mb-lbl" />
                  ))}
                </span>
              ) : (
                none
              ),
              () => setPicking('labels'),
            )}
            {row('calendar', t('card.due'), card.due ? <span className={dueClass(card.due, today)}>{dueLabel(card.due, today)}</span> : none, () => setPicking('due'))}
            {row(
              'person',
              t('card.assignee'),
              card.assignee ? (
                <>
                  <WhoOf who={card.assignee} people={team?.people} />
                  <span className="tx">
                    <NameOf who={card.assignee} people={team?.people} />
                  </span>
                </>
              ) : (
                <span className="none">{t('card.unassigned')}</span>
              ),
              () => setPicking('assignee'),
            )}
            {card.note &&
              row('note', t('phone.from'), <span className="lnk">{noteTitle ?? '?'}</span>, () => {
                if (noteTitle !== null) actions.openNote(card.note!);
              })}
            {(board.fields ?? []).map(fieldRow)}
          </div>
          {workers.length > 0 && (
            <>
              <div className="mb-cap">{t('card.workedOn')}</div>
              <div className="mb-group mb-worked">
                {workers.map((worker) => {
                  const who = { ...(worker.id && { id: worker.id }), ...(worker.name && { name: worker.name }) };
                  return (
                    <div key={workerKey(worker)} className="mb-fr">
                      <WhoOf who={who} people={team?.people} />
                      <span className="fl">
                        <NameOf who={who} people={team?.people} first />
                      </span>
                      <span className="val">{when(worker.at, today)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="mb-cap mb-cpad">{t('card.description')}</div>
        <div className="mb-cdesc" ref={host} />
        <div className="mb-cattach">
          <AttachButton onFiles={(files) => editor.current && actions.attach(editor.current, path, files)} />
        </div>
        <Subtasks
          list={card.subtasks ?? []}
          change={(change) => actions.changeSubtasks(path, card.id, change)}
          complete={(subtask) => actions.completeSubtask(path, card.id, subtask)}
          removed={actions.removedSubtask}
          team={team}
          today={today}
          menu={actions.menu}
          place="card"
        />
        {(card.timeline.length > 0 || card.author) && <div className="mb-cap mb-cpad">{t('card.timeline')}</div>}
        <div className="mb-ctl tlog">
          <Timeline board={board} path={path} card={card} team={team} today={today} actions={actions} />
        </div>
      </div>
      <div className="mb-compose">
        <GrowingField value={comment} label={t('card.comment')} placeholder={t('card.commentHint')} onChange={setComment} />
        <button type="button" className="go" disabled={!comment.trim()} onMouseDown={(event) => event.preventDefault()} onClick={send}>
          {t('card.comment')}
        </button>
      </div>
      {picking === 'status' && (
        <StatusSheet board={board} title={keyOf(board, card)} current={card.column} onPick={(id) => actions.moveToColumn(path, card.id, id)} onClose={() => setPicking(null)} />
      )}
      {picking === 'phase' && <PhaseSheet board={board} current={card.phase ?? null} onPick={(id) => update({ phase: id })} onClose={() => setPicking(null)} />}
      {picking === 'labels' && <LabelSheet path={path} about={card.title} labels={card.labels ?? []} onChange={(labels) => update({ labels })} onClose={() => setPicking(null)} />}
      {picking === 'due' && <DateSheet title={card.title} current={card.due} today={today} onPick={(due) => update({ due })} onClose={() => setPicking(null)} />}
      {picking === 'assignee' &&
        (team ? (
          <PeopleSheet about={card.title} team={team} current={card.assignee ?? null} onPick={(assignee) => update({ assignee })} onClose={() => setPicking(null)} />
        ) : (
          <AssigneeSheet value={card.assignee?.name ?? ''} onSave={(name) => update({ assignee: name ? { name } : null })} onClose={() => setPicking(null)} />
        ))}
      {editing && <FieldSheet field={editing} value={cardValue(board, card, editing, today)} ctx={ctx} onSave={(next) => setValue(editing, next)} onClose={() => setEditing(null)} />}
      {linking?.collection && (
        <LinkSheet
          field={linking}
          value={cardValue(board, card, linking, today)}
          records={records.records(linking.collection)}
          onChange={(value) => setValue(linking, value)}
          onOpen={
            records.show
              ? (link) => {
                  setLinking(null);
                  records.show!(linking.collection!, link.id);
                }
              : undefined
          }
          onClose={() => setLinking(null)}
        />
      )}
      {over && overCollection && overRecord && (
        <RecordDialog key={overRecord.id} collection={overCollection} record={overRecord} today={today} actions={records} onClose={() => setOver(null)} />
      )}
    </div>
  );
}

/** A field's icon on a phone, by its type. */
const FIELD_ICONS: { [type in Field['type']]: IconName } = {
  name: 'pen',
  code: 'hash',
  text: 'pen',
  number: 'hash',
  date: 'calendar',
  time: 'clock',
  select: 'tag',
  'multi-select': 'tag',
  checkbox: 'check',
  url: 'link',
  email: 'mail',
  phone: 'person',
  person: 'person',
  link: 'collection',
  formula: 'hash',
  lookup: 'collection',
  rollup: 'hash',
};

/** A field's value typed or picked in a sheet, with Cancel and Save at its top. */
function FieldSheet({ field, value, ctx, onSave, onClose }: {
  field: Field;
  value: FieldValue;
  ctx: ValueContext;
  onSave: (value: FieldValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FieldValue>(value);
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    onSave(draft);
    onClose();
  };
  return (
    <Sheet label={field.label} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{field.label}</b>
        <button type="button" className="ok" onClick={() => save()}>
          {t('card.save')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group mb-fieldin">
          <FieldInput field={field} value={draft} ctx={ctx} autoFocus onChange={setDraft} onEnter={() => save()} />
        </div>
      </form>
    </Sheet>
  );
}
