import {
  addDays,
  type Board,
  type Person,
  type BoardLook,
  columnStatus,
  type ColumnStatus,
  type Card,
  type CardPlace,
  cardSum,
  computerFor,
  cardValue,
  type ChoiceRenames,
  type Column,
  type ColumnKind,
  COLUMN_KINDS,
  columnCards,
  currentPhase,
  faceFields,
  type Field,
  type FieldValue,
  isEmpty,
  isLink,
  keyOf,
  isAgentId,
  isFinished,
  type NewCard,
  type Phase,
  phaseCards,
  phaseProgress,
  formatNumber,
  currencyOf,
  reviewCount,
  valueText,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type DragEvent, Fragment, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNarrow } from './narrow';
import { StatusIcon } from './StatusIcon';
import { MonthCalendar, type MonthChip } from './Calendar';
import { CardPanel, type CardPanelActions } from './CardPanel';
import { assigneeLabel, CardWho, hasCardWho, initialOf, WhoOf } from './People';
import { Cell, type ValueContext } from './Collection';
import { BoardFieldsDialog } from './Fields';
import { isPhone, pageBox } from './device';
import type { MenuItem } from './dialogs';
import { Icon, type IconName } from './Icon';
import { CardQuickAdd, cardHead, ColumnTabs, KindMark, StatusSheet } from './PhoneBoard';
import { LabelChip } from './labels';
import { Empty, liftUntilTouch, Sheet, SheetClose } from './sheets';
import { dueClass, dueLabel } from './Tasks';
import { holdToDrag } from './touchDrag';
import { SubtaskCount } from './Subtasks';

/** What a board is called, from its path: its file's name without the extension. */
const titleOfBoard = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.board\.json$/, '');

/** On a phone, a menu opens from the bottom wherever it was asked for. */
const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

/** What can be done on a board, at the path given. */
export interface BoardActions extends CardPanelActions {
  /** Returns the new card's id. */
  addCard: (board: string, input: NewCard) => string;
  moveCard: (board: string, id: string, place: CardPlace) => void;
  /** Asks first, then deletes the card. */
  removeCard: (board: string, card: Card) => void;
  /** Gives a card another due day, saying so with Undo. */
  moveDue: (board: string, id: string, due: string) => void;
  /** Opens the card beside the columns. */
  openCard: (board: string, id: string) => void;
  addColumn: (board: string, name: string, kind: ColumnKind, after?: string) => void;
  renameColumn: (board: string, id: string, name: string) => void;
  setColumnKind: (board: string, id: string, kind: ColumnKind) => void;
  moveColumn: (board: string, id: string, after: string | null) => void;
  /** Asks first when the column has cards, then deletes it. */
  removeColumn: (board: string, column: Column) => void;
  addPhase: (board: string, name: string) => void;
  renamePhase: (board: string, id: string, name: string) => void;
  /** Opens the phase's window: its goal, when it is done, its note. */
  editPhase: (board: string, phase: Phase) => void;
  movePhase: (board: string, id: string, after: string | null) => void;
  /** Asks first, then closes the phase. */
  closePhase: (board: string, phase: Phase) => void;
  reopenPhase: (board: string, id: string) => void;
  /** Asks first, then deletes the phase; its cards stay. */
  removePhase: (board: string, phase: Phase) => void;
  setPhasesOn: (board: string, on: boolean) => void;
  /** Asks before something is lost; `action` is what the confirming button says. */
  ask: (title: string, message: string, run: () => void, action: string) => void;
  /** Writes the board's own fields, its cards' choices renamed with them. */
  saveBoardFields: (board: string, fields: Field[], renames: ChoiceRenames) => void;
}

const DRAG_TYPE = 'application/x-scrawl-card';
const COLUMN_DRAG_TYPE = 'application/x-scrawl-column';

/** Which phase's cards the columns show: one phase, the cards in none (null), or every card. */
type Shown = { phase: string | null } | { all: true };

/**
 * A single line typed in place: Enter or leaving it keeps it, Esc or leaving it empty drops it.
 * With `action` it has a button of that name beside it that keeps it too.
 */
function LineInput({ className, placeholder, initial = '', action, onDone, onCancel }: {
  className: string;
  placeholder: string;
  initial?: string;
  action?: string;
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const finished = useRef(false);
  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (keep && text.trim()) onDone(text);
    else onCancel();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') finish(true);
    else if (event.key === 'Escape') finish(false);
    else return;
    event.preventDefault();
  };
  const input = (
    <input
      className={className}
      aria-label={placeholder}
      placeholder={placeholder}
      autoFocus
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={onKey}
      onBlur={() => finish(true)}
    />
  );
  if (!action) return input;
  return (
    <span className="line-input">
      {input}
      <button
        type="button"
        className="line-ok"
        disabled={!text.trim()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => finish(true)}
      >
        {action}
      </button>
    </span>
  );
}

/** The row a new card is typed into. Add card, or Enter, adds it and keeps the row for the next one, as Trello does. */
function CardComposer({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const add = () => {
    if (!title.trim()) return;
    onAdd(title);
    setTitle('');
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') add();
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
  };
  // The buttons keep the focus in the field, so pressing them is not leaving it.
  const keepTyping = (event: MouseEvent) => event.preventDefault();
  return (
    <div className="kc-compose">
      <div className="kc composing">
        <input
          className="kc-edit"
          aria-label={t('board.cardName')}
          placeholder={t('board.cardName')}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={onKey}
          onBlur={() => !title.trim() && onClose()}
        />
      </div>
      <div className="kc-compose-actions">
        <button type="button" className="primary" disabled={!title.trim()} onMouseDown={keepTyping} onClick={add}>
          {t('board.addCard')}
        </button>
        <button type="button" className="x" title={t('dialog.cancel')} aria-label={t('dialog.cancel')} onMouseDown={keepTyping} onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}

/** The line a card is typed into in the list, under its group's header. Add, or Enter, adds it and keeps the line for the next one, as the board's columns do. */
function ListComposer({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const add = () => {
    if (!title.trim()) return;
    onAdd(title);
    setTitle('');
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') add();
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
  };
  // The buttons keep the focus in the field, so pressing them is not leaving it.
  const keepTyping = (event: MouseEvent) => event.preventDefault();
  return (
    <div className="lcomp">
      <input
        aria-label={t('board.cardName')}
        placeholder={t('board.cardName')}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKey}
        onBlur={() => !title.trim() && onClose()}
      />
      <button type="button" className="primary" disabled={!title.trim()} onMouseDown={keepTyping} onClick={add}>
        {t('board.add')}
      </button>
      <button type="button" onMouseDown={keepTyping} onClick={onClose}>
        {t('dialog.cancel')}
      </button>
    </div>
  );
}

/** A value as a card's face shows it: a link by its record's name alone (its code when it has no name), several by the first and how many more. */
function faceText(value: FieldValue): string {
  const links = (Array.isArray(value) ? value : [value]).filter(isLink);
  if (links.length === 0) return valueText(value);
  const first = links[0]!.name || links[0]!.code || '';
  return links.length > 1 ? `${first} +${links.length - 1}` : first;
}

function CardItem({ board, path, card, today, actions, onGrab, onRelease, onHold, onStatus, showPhase, open }: {
  board: Board;
  path: string;
  card: Card;
  today: string;
  /** Shown in the panel beside the columns. */
  open: boolean;
  /** In the view over every phase: the card says which one it is in. */
  showPhase: boolean;
  actions: BoardActions;
  onGrab: (event: DragEvent<HTMLElement>, card: Card) => void;
  onRelease: () => void;
  /** A finger held on the card, which lifts it after a moment; let go there, `still` is called. */
  onHold: (event: ReactPointerEvent<HTMLElement>, card: Card, still?: () => void) => void;
  /** On a phone: the card's column, picked in a sheet. */
  onStatus?: (card: Card) => void;
}) {
  const comments = card.timeline.filter((entry) => entry.kind === 'comment').length;
  // How many of its subtasks are done, beside its day.
  const subtasks = card.subtasks?.length ? <SubtaskCount list={card.subtasks} /> : null;
  const noteTitle = card.note ? actions.noteTitle(card.note) : null;
  const people = actions.people?.(path)?.people;
  const phase = showPhase && card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  // The board's first link and first number, a deal's company and value, as they are filled in.
  const face = faceFields(board)
    .map((field) => ({ field, value: cardValue(board, card, field, today) }))
    .filter(({ value }) => !isEmpty(value));
  const menu = (event: MouseEvent) =>
    actions.menu(event, [
      ...board.columns
        .filter((column) => column.id !== card.column)
        .map((column) => ({
          label: t('board.moveToColumn', { column: column.name }),
          run: () => actions.moveCard(path, card.id, { column: column.id, after: columnCards(board, column.id).pop()?.id ?? null }),
        })),
      { label: t('card.copyBrief'), run: () => actions.copyBrief(path, card.id) },
      { label: t('menu.delete'), run: () => actions.removeCard(path, card) },
    ]);
  if (isPhone()) {
    // Held and let go where it lifted: it stays lifted over the dim, with its actions.
    const held = (element: HTMLElement) => {
      liftUntilTouch(element);
      actions.menu(
        NO_POINTER,
        [
          { label: t('phone.statusMenu'), icon: 'board', run: () => onStatus?.(card) },
          { label: t('card.copyBrief'), icon: 'copy', run: () => actions.copyBrief(path, card.id) },
          { label: t('menu.delete'), icon: 'trash', danger: true, run: () => actions.removeCard(path, card) },
        ],
        cardHead(board, card, keyOf(board, card), titleOfBoard(path)),
      );
    };
    return (
      <div
        className="mb-kc"
        data-card={card.id}
        onPointerDown={(event) => {
          const element = event.currentTarget;
          onHold(event, card, () => held(element));
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <button type="button" className="kc-main" onClick={() => actions.openCard(path, card.id)}>
          <span className="top">
            <i className={`p${card.priority}`} />
            {keyOf(board, card)}
            {card.assignee && <span className={`mb-who${isAgentId(card.assignee.id) ? ' bot' : ''}`}>{initialOf(card.assignee, people)}</span>}
          </span>
          <b>{card.title}</b>
          {(card.due || subtasks || card.labels?.length || comments > 0 || phase || face.length > 0) && (
            <span className="meta">
              {card.due && (
                <span className={dueClass(card.due, today)}>
                  <Icon name="calendar" />
                  {dueLabel(card.due, today)}
                </span>
              )}
              {subtasks}
              {card.labels?.map((label) => <LabelChip key={label} path={path} name={label} className="mb-lbl" />)}
              {comments > 0 && (
                <span>
                  <Icon name="comment" />
                  {comments}
                </span>
              )}
              {phase && <span>{phase.name}</span>}
              {face.map(({ field, value }) =>
                typeof value === 'number' ? (
                  <span key={field.key} className="val">
                    {formatNumber(value, field.format, currencyOf(field.format, card.values))}
                  </span>
                ) : (
                  <span key={field.key} className="co">
                    <Icon name="collection" />
                    {faceText(value)}
                  </span>
                ),
              )}
            </span>
          )}
        </button>
      </div>
    );
  }
  return (
    <div
      className={open ? 'kc on' : 'kc'}
      data-card={card.id}
      draggable
      onDragStart={(event) => onGrab(event, card)}
      onDragEnd={onRelease}
      onPointerDown={(event) => onHold(event, card)}
      onContextMenu={menu}
    >
      <button type="button" className="kc-main" onClick={() => actions.openCard(path, card.id)}>
        <span className="key">{keyOf(board, card)}</span>
        <span className="kt">
          <i className={`dot p${card.priority}`} />
          <span>{card.title}</span>
        </span>
        {(card.due || subtasks || card.labels?.length || comments > 0 || noteTitle !== null || phase || face.length > 0 || hasCardWho(card)) && (
          <span className="meta">
            {card.due && <span className={dueClass(card.due, today)}>{dueLabel(card.due, today)}</span>}
            {subtasks}
            {card.labels?.map((label) => (
              <LabelChip key={label} path={path} name={label} />
            ))}
            {comments > 0 && (
              <span className="cm">
                <Icon name="comment" />
                {comments}
              </span>
            )}
            {card.note !== undefined && card.note !== null && (
              <span className={noteTitle === null ? 'from gone' : 'from'}>{t('tasks.from', { note: noteTitle ?? '?' })}</span>
            )}
            {phase && <span className="phase">{phase.name}</span>}
            {face.map(({ field, value }) =>
              typeof value === 'number' ? (
                <span key={field.key} className="val" title={field.label}>
                  {formatNumber(value, field.format, currencyOf(field.format, card.values))}
                </span>
              ) : (
                <span key={field.key} className="co" title={field.label}>
                  {faceText(value)}
                </span>
              ),
            )}
            <CardWho card={card} people={people} />
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * Where a dragged card would land: the gap at `index` among the cards shown in a column, after
 * the card `after` (none at the top), in the lane of a phase when the lanes are shown.
 */
interface Drop {
  column: string;
  lane: string | null | undefined;
  index: number;
  after: string | null;
}

/** Finished cards older than this many days fold away under the column's last recent card. */
const OLD_AFTER_DAYS = 7;

function ColumnBlock({ board, path, column, cards, shown, lane, today, actions, drop, onGrab, onRelease, onHold, onStatus, onAddHere, peek, onDragOver, onDrop, onGrabColumn, openCard }: {
  board: Board;
  path: string;
  column: Column;
  openCard: string | null;
  /** The cards shown in the column, in order. */
  cards: Card[];
  shown: Shown;
  /** In the lanes of the view over every phase: the phase of this lane, null for no phase. */
  lane?: string | null;
  today: string;
  actions: BoardActions;
  drop: Drop | null;
  onGrab: (event: DragEvent<HTMLElement>, card: Card) => void;
  onRelease: () => void;
  onHold: (event: ReactPointerEvent<HTMLElement>, card: Card, still?: () => void) => void;
  /** On a phone: a card's column, picked in a sheet. */
  onStatus?: (card: Card) => void;
  /** On a phone: a column beside the one on screen, its edge peeking in. */
  peek?: boolean;
  /** On a phone: + for this column, from its empty state. */
  onAddHere?: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, column: Column, lane: string | null | undefined) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  /** The column's header is dragged to another place; not in the lanes. */
  onGrabColumn?: (event: DragEvent<HTMLElement>, column: Column) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const inLane = lane !== undefined;
  const index = board.columns.findIndex((c) => c.id === column.id);
  const lastDone = column.kind === 'done' && board.columns.filter((c) => c.kind === 'done').length === 1;
  const phone = isPhone();
  const menu = (event: MouseEvent) =>
    actions.menu(
      event,
      [
        { label: t('menu.rename'), icon: 'pen', run: () => setRenaming(true) },
        ...COLUMN_KINDS.map((kind, i) => ({
          // On a phone the kind set is ticked; on a computer it has a dot.
          label: phone ? t('board.kindOf', { kind: t(`board.kind.${kind}`) }) : `${kind === column.kind ? '● ' : '○ '}${t('board.kindOf', { kind: t(`board.kind.${kind}`) })}`,
          value: phone && kind === column.kind ? '✓' : undefined,
          apart: i === 0,
          run: () => actions.setColumnKind(path, column.id, kind),
        })),
        { label: t('board.addColumnAfter'), icon: 'plus' as const, apart: true, run: () => actions.addColumn(path, t('board.newColumn'), 'active', column.id) },
        ...(index > 0 ? [{ label: t('board.moveLeft'), icon: 'back' as const, run: () => actions.moveColumn(path, column.id, index >= 2 ? board.columns[index - 2]!.id : null) }] : []),
        ...(index < board.columns.length - 1 ? [{ label: t('board.moveRight'), icon: 'chevron' as const, run: () => actions.moveColumn(path, column.id, board.columns[index + 1]!.id) }] : []),
        // The last done column stays, and its menu says why; a board's only column stays too.
        ...(board.columns.length === 1 && !lastDone
          ? []
          : [{ label: t('board.deleteColumn'), icon: 'trash' as const, danger: true, run: () => actions.removeColumn(path, column), ...(lastDone && { disabled: t('board.keepsDone') }) }]),
      ],
      { icon: 'board', title: column.name, sub: t('phone.columnIn', { board: titleOfBoard(path) }) },
    );
  const phase = inLane ? lane : 'phase' in shown ? shown.phase : undefined;
  const sumField = faceFields(board).find((field) => field.type === 'number');
  const sum = sumField ? cardSum(board, cards, sumField, today) : null;
  const add = (title: string) => actions.addCard(path, { title, column: column.id, ...(phase !== undefined && { phase }) });
  // In a done or dropped column, cards finished a while ago fold away until asked for.
  const finished = column.kind === 'done' || column.kind === 'dropped';
  const cutoff = addDays(today, -OLD_AFTER_DAYS);
  const isOld = (card: Card) => finished && (card.completed ?? card.updated).slice(0, 10) < cutoff;
  const recent = cards.filter((card) => !isOld(card));
  const old = cards.filter(isOld);
  const listed = showOld ? [...recent, ...old] : recent;
  const items = listed.map((card) => (
    <CardItem
      key={card.id}
      board={board}
      path={path}
      card={card}
      today={today}
      actions={actions}
      onGrab={onGrab}
      onRelease={onRelease}
      onHold={onHold}
      showPhase={!inLane && 'all' in shown && board.phasesOn}
      open={card.id === openCard}
      onStatus={onStatus}
    />
  ));
  if (drop?.column === column.id && drop.lane === lane) items.splice(drop.index, 0, <div key="drop" className="kc-drop" />);
  return (
    <div
      className={`colm kind-${column.kind}${inLane ? ' in-lane' : ''}${peek ? ' peek' : ''}`}
      data-column={column.id}
      // A finger finds the lane it is over here: none without lanes, empty for the cards in no phase.
      data-lane={lane === undefined ? undefined : (lane ?? '')}
      onDragOver={(event) => onDragOver(event, column, lane)}
      onDrop={onDrop}
      onContextMenu={(event) => event.target === event.currentTarget && menu(event)}
    >
      <h3
        onContextMenu={menu}
        draggable={!!onGrabColumn && !renaming}
        onDragStart={onGrabColumn ? (event) => onGrabColumn(event, column) : undefined}
        onDragEnd={onRelease}
        title={onGrabColumn ? t('board.dragColumn') : undefined}
      >
        {phone ? <KindMark kind={column.kind} /> : <StatusIcon status={columnStatus(board, column)} />}
        {renaming ? (
          <LineInput
            className="colm-edit"
            placeholder={t('board.columnName')}
            initial={column.name}
            action={t('phase.save')}
            onDone={(name) => {
              actions.renameColumn(path, column.id, name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button type="button" className="colm-name" onClick={() => setRenaming(true)}>
            {column.name}
          </button>
        )}
        <small>{cards.length}</small>
        {sum !== null && (
          <span className="sum" title={sumField!.label}>
            {formatNumber(sum, sumField!.format)}
          </span>
        )}
        {!inLane && (
          <button type="button" className="more" title={t('board.columnMenu')} aria-label={t('board.columnMenu')} onClick={menu}>
            ···
          </button>
        )}
      </h3>
      <div className="colm-cards">
        {phone && cards.length === 0 && (
          <Empty small icon="board" title={t('phone.emptyColumn')} text={t('phone.emptyColumnText')} action={onAddHere && { label: t('board.addCard'), run: onAddHere }} />
        )}
        {items}
      </div>
      {old.length > 0 && (
        <button type="button" className="fold" aria-expanded={showOld} onClick={() => setShowOld(!showOld)}>
          {showOld ? t('board.hideOlder', { count: old.length }) : t('board.olderCards', { count: old.length })}
        </button>
      )}
      {composing ? (
        <CardComposer onAdd={add} onClose={() => setComposing(false)} />
      ) : (
        !phone && (
          <button type="button" className="qa" onClick={() => setComposing(true)}>
            {t('board.addCardRow')}
          </button>
        )
      )}
    </div>
  );
}

const STRIP_GAP = 4;
const STRIP_PADDING = 32;

/**
 * The strip of phases above the columns, after the Phases views of design/mockups.html. Closed
 * phases fold into one chip at the start, its list newest first; a closed phase chosen takes the
 * chip's place. The open ones keep to one line: what does not fit goes into "+N more" at the end,
 * the chosen phase always in sight. On a phone the lists open as sheets, and New phase is in
 * the "+N" sheet when the strip has no room for it.
 */
function PhaseStrip({ board, path, shown, onShow, actions }: {
  board: Board;
  path: string;
  shown: Shown;
  onShow: (shown: Shown) => void;
  actions: BoardActions;
}) {
  const narrow = useNarrow();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [list, setList] = useState<'closed' | 'more' | null>(null);
  /** How many open phases fit on the line. */
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);
  const strip = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const closedChip = useRef<HTMLButtonElement>(null);
  const moreChip = useRef<HTMLButtonElement>(null);

  const closed = board.phases.filter((phase) => phase.state === 'done');
  const open = board.phases.filter((phase) => phase.state !== 'done');
  const chosen = 'phase' in shown ? shown.phase : null;
  const chosenClosed = closed.find((phase) => phase.id === chosen);
  const progressOf = (phase: Phase) => {
    const { done, total } = phaseProgress(board, phase.id);
    return t('board.progress', { done, total });
  };
  // The cards in no phase have a chip of their own while there are some, and while it is chosen.
  const unphased = phaseCards(board, null).length;
  const noneOn = 'phase' in shown && shown.phase === null;
  const noneChip = board.phases.length > 0 && (unphased > 0 || noneOn);
  const closedLabel = chosenClosed ? chosenClosed.name : narrow ? String(closed.length) : t('board.closedPhases', { count: closed.length });

  // Every chip is measured off screen; as many open phases as the line holds are shown.
  useLayoutEffect(() => {
    const box = strip.current;
    const marks = ruler.current;
    if (!box || !marks) return;
    const update = () => {
      const width = (role: string) => [...marks.querySelectorAll<HTMLElement>(`[data-role="${role}"]`)].reduce((sum, el) => sum + pageBox(el).width + STRIP_GAP, 0);
      const phases = [...marks.querySelectorAll<HTMLElement>('[data-role="phase"]')].map((el) => pageBox(el).width + STRIP_GAP);
      const room = box.clientWidth - STRIP_PADDING;
      const fixed = width('closed') + width('none') + width('all') + (chosen ? width('pmore') : 0);
      const all = phases.reduce((sum, w) => sum + w, 0);
      if (fixed + width('add') + all <= room) {
        setFit(phases.length);
        return;
      }
      // Not all fit: "+N more" takes a place, and on a phone New phase goes into its sheet.
      let left = room - fixed - width('more') - (narrow ? 0 : width('add'));
      let count = 0;
      for (const w of phases) {
        if (w > left) break;
        left -= w;
        count++;
      }
      setFit(count);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [board.phases, board.cards, narrow, closedLabel, renaming, chosen, noneChip]);

  // The chosen open phase is never folded away: it takes the last place that fits.
  let shownOpen = open.slice(0, fit);
  const chosenOpen = open.find((phase) => phase.id === chosen);
  if (chosenOpen && !shownOpen.includes(chosenOpen)) shownOpen = [...shownOpen.slice(0, Math.max(0, fit - 1)), chosenOpen];
  const hidden = open.filter((phase) => !shownOpen.includes(phase));
  const pick = (phase: Phase) => {
    setList(null);
    onShow({ phase: phase.id });
  };

  const phone = isPhone();
  const menu = (event: MouseEvent, phase: Phase, inList = false) => {
    const at = board.phases.findIndex((p) => p.id === phase.id);
    actions.menu(
      event,
      [
        { label: t('phase.edit'), icon: 'pen', run: () => actions.editPhase(path, phase) },
        // A phase in a list has no place to be renamed in: its window has the name. On a phone the
        // window is where it is renamed, always.
        ...(phone ? [] : [{ label: t('menu.rename'), run: () => (inList ? actions.editPhase(path, phase) : setRenaming(phase.id)) }]),
        ...(at > 0 ? [{ label: t('board.moveUp'), icon: 'up' as const, apart: true, run: () => actions.movePhase(path, phase.id, at >= 2 ? board.phases[at - 2]!.id : null) }] : []),
        ...(at < board.phases.length - 1 ? [{ label: t('board.moveDown'), icon: 'down' as const, apart: at === 0, run: () => actions.movePhase(path, phase.id, board.phases[at + 1]!.id) }] : []),
        ...(phase.state === 'done'
          ? [{ label: t('board.reopenPhase'), icon: 'restore' as const, apart: true, run: () => actions.reopenPhase(path, phase.id) }]
          : [{ label: t('board.closePhase'), icon: 'check' as const, apart: true, run: () => actions.closePhase(path, phase) }]),
        ...(phase.state === 'upcoming' ? [{ label: t('board.makeCurrent'), icon: 'phase' as const, run: () => actions.reopenPhase(path, phase.id) }] : []),
        { label: t('menu.delete'), icon: 'trash', danger: true, run: () => actions.removePhase(path, phase) },
      ],
      { icon: 'phase', title: phase.name, sub: progressOf(phase) },
    );
  };
  const allLabel = narrow ? t('board.all') : `${t('board.all')} · ${board.cards.length}`;
  return (
    <>
    <div ref={strip} className="phases" role="tablist">
      {closed.length > 0 && (
        <button
          ref={closedChip}
          type="button"
          className={`ph closed${chosenClosed ? ' on' : ''}${list === 'closed' ? ' pressed' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={list === 'closed'}
          onClick={() => setList(list === 'closed' ? null : 'closed')}
          onContextMenu={chosenClosed ? (event) => menu(event, chosenClosed) : undefined}
        >
          <span className="tick">✓</span>
          <span>{closedLabel}</span>
          {chosenClosed && <small>{progressOf(chosenClosed)}</small>}
          <span className="dd">▾</span>
        </button>
      )}
      {chosenClosed && <PhaseMore phase={chosenClosed} onMenu={menu} />}
      {shownOpen.map((phase) => {
        const { done, total } = phaseProgress(board, phase.id);
        const on = chosen === phase.id;
        return renaming === phase.id ? (
          <LineInput
            key={phase.id}
            className="ph-edit"
            placeholder={t('board.phaseName')}
            initial={phase.name}
            action={t('phase.save')}
            onDone={(name) => {
              actions.renamePhase(path, phase.id, name);
              setRenaming(null);
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <Fragment key={phase.id}>
            <button
              type="button"
              role="tab"
              aria-selected={on}
              className={`ph ${phase.state}${on ? ' on' : ''}`}
              onClick={() => onShow({ phase: phase.id })}
              onContextMenu={(event) => menu(event, phase)}
            >
              <span>{phase.name}</span>
              <small>{t('board.progress', { done, total })}</small>
            </button>
            {on && <PhaseMore phase={phase} onMenu={menu} />}
          </Fragment>
        );
      })}
      {hidden.length > 0 && (
        <button
          ref={moreChip}
          type="button"
          className={`ph more${list === 'more' ? ' pressed' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={list === 'more'}
          onClick={() => setList(list === 'more' ? null : 'more')}
        >
          <span>{narrow ? `+${hidden.length}` : t('board.morePhases', { count: hidden.length })}</span>
          <span className="dd">▾</span>
        </button>
      )}
      {!(narrow && hidden.length > 0) && !adding && (
        <button type="button" className="ph add" onClick={() => setAdding(true)}>
          {t('board.addPhase')}
        </button>
      )}
      {noneChip && (
        <button type="button" role="tab" aria-selected={noneOn} className={`ph none${noneOn ? ' on' : ''}`} onClick={() => onShow({ phase: null })}>
          <span>{t('list.noPhase')}</span>
          <small>{unphased}</small>
        </button>
      )}
      {/* On a phone, All shows only when there are phases to choose from. */}
      {!(phone && board.phases.length === 0) && (
        <button type="button" role="tab" aria-selected={'all' in shown} className={`ph all${'all' in shown ? ' on' : ''}`} onClick={() => onShow({ all: true })}>
          {allLabel}
        </button>
      )}
      {/* The chips as they would be, off screen, to tell how many fit. */}
      <div ref={ruler} className="ph-ruler" aria-hidden="true">
        {closed.length > 0 && (
          <span data-role="closed" className="ph closed">
            <span className="tick">✓</span>
            <span>{closedLabel}</span>
            {chosenClosed && <small>{progressOf(chosenClosed)}</small>}
            <span className="dd">▾</span>
          </span>
        )}
        {open.map((phase) => (
          <span key={phase.id} data-role="phase" className="ph">
            <span>{phase.name}</span>
            <small>{progressOf(phase)}</small>
          </span>
        ))}
        <span data-role="more" className="ph more">
          <span>{narrow ? `+${open.length}` : t('board.morePhases', { count: open.length })}</span>
          <span className="dd">▾</span>
        </span>
        <span data-role="add" className="ph add">
          {t('board.addPhase')}
        </span>
        <span data-role="pmore" className="ph-more">
          ···
        </span>
        {noneChip && (
          <span data-role="none" className="ph none">
            <span>{t('list.noPhase')}</span>
            <small>{unphased}</small>
          </span>
        )}
        <span data-role="all" className="ph all">
          {allLabel}
        </span>
      </div>
      {list && (
        <PhaseList
          title={list === 'closed' ? t('board.closedList') : t('board.upcomingList')}
          phases={list === 'closed' ? [...closed].reverse() : hidden}
          chosen={chosen}
          narrow={narrow}
          anchor={list === 'closed' ? closedChip.current : moreChip.current}
          progressOf={progressOf}
          onPick={pick}
          onMenu={(event, phase) => menu(event, phase, true)}
          onAdd={
            list === 'more' && narrow
              ? () => {
                  setList(null);
                  setAdding(true);
                }
              : undefined
          }
          onClose={() => setList(null)}
        />
      )}
    </div>
    {adding && (
      <div className="phases-add">
        <LineInput
          className="ph-edit"
          placeholder={t('board.phaseName')}
          action={t('board.add')}
          onDone={(name) => {
            actions.addPhase(path, name);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      </div>
    )}
    </>
  );
}

/** The chosen phase's menu, beside its chip: what a right click on the chip opens, for a touch too. */
function PhaseMore({ phase, onMenu }: { phase: Phase; onMenu: (event: MouseEvent, phase: Phase) => void }) {
  return (
    <button type="button" className="ph-more" title={t('board.phaseMenu')} aria-label={t('board.phaseMenu')} onClick={(event) => onMenu(event, phase)}>
      ···
    </button>
  );
}

/**
 * The phases a chip of the strip folds: the closed ones, or the open ones that do not fit. Under
 * the chip on a computer, a sheet from the bottom on a phone. A click shows the phase; its menu
 * opens from the row's ··· or a right click.
 */
function PhaseList({ title, phases, chosen, narrow, anchor, progressOf, onPick, onMenu, onAdd, onClose }: {
  title: string;
  phases: Phase[];
  chosen: string | null;
  narrow: boolean;
  anchor: HTMLElement | null;
  progressOf: (phase: Phase) => string;
  onPick: (phase: Phase) => void;
  onMenu: (event: MouseEvent, phase: Phase) => void;
  /** On a phone, the "+N" sheet ends with New phase. */
  onAdd?: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pull = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    // A click outside closes it; one on its chip toggles it there, and a right-click menu is drawn outside it.
    const onDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Element;
      if (box.current?.contains(target) || anchor?.contains(target) || target.closest?.('.menu, .ctx')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [anchor, onClose]);

  const rows = (
    <div className="ph-rows" role="listbox" aria-label={title}>
      {phases.map((phase) => (
        <div key={phase.id} className="ph-item">
          <button
            type="button"
            role="option"
            aria-selected={phase.id === chosen}
            className={`ph-row${phase.id === chosen ? ' on' : ''}`}
            onClick={() => onPick(phase)}
            onContextMenu={(event) => onMenu(event, phase)}
          >
            <span className="tick">{phase.state === 'done' ? '✓' : ''}</span>
            <span className="nm">{phase.name}</span>
            <small>{progressOf(phase)}</small>
          </button>
          <button type="button" className="ph-row-more" title={t('board.phaseMenu')} aria-label={t('board.phaseMenu')} onClick={(event) => onMenu(event, phase)}>
            ···
          </button>
        </div>
      ))}
      {onAdd && (
        <button type="button" className="ph-row new" onClick={onAdd}>
          <span className="tick" />
          <span className="nm">{t('board.newPhase')}</span>
        </button>
      )}
    </div>
  );

  // On a phone: a sheet of the phase's rows, each with its ··· where it has a menu.
  if (isPhone()) {
    return (
      <Sheet label={title} className="mb-create" onClose={onClose}>
        <div className="mb-sh">
          <b>{title}</b>
          <SheetClose onClose={onClose} />
        </div>
        <div className="mb-form">
          <div className="mb-group">
            {phases.map((phase) => (
              <div key={phase.id} className="mb-fr pick phase-row">
                <button type="button" className="in" onClick={() => onPick(phase)}>
                  {phase.state === 'done' && <span className="tk">✓</span>}
                  {phase.name}
                </button>
                <span className="val">{progressOf(phase)}</span>
                <button type="button" className="rm" aria-label={t('board.phaseMenu')} title={t('board.phaseMenu')} onClick={(event) => onMenu(event, phase)}>
                  <Icon name="more" />
                </button>
              </div>
            ))}
            {onAdd && (
              <button type="button" className="mb-fr pick add" onClick={onAdd}>
                <Icon name="plus" />
                <span className="in">{t('board.newPhase')}</span>
              </button>
            )}
          </div>
        </div>
      </Sheet>
    );
  }
  if (!narrow) {
    const left = anchor ? Math.max(0, Math.min(anchor.offsetLeft, (anchor.offsetParent?.clientWidth ?? 0) - 286)) : 16;
    return (
      <div ref={box} className="ph-list" style={{ left }}>
        <div className="ph-list-title">{title}</div>
        {rows}
      </div>
    );
  }
  return createPortal(
    <>
      <div className="sp-backdrop" onMouseDown={onClose} />
      <div ref={box} className="sp sheet ph-sheet" role="dialog" aria-label={title}>
        <span
          className="grab"
          aria-hidden="true"
          onPointerDown={(event) => (pull.current = event.clientY)}
          onPointerUp={(event) => {
            if (pull.current !== null && event.clientY - pull.current > 48) onClose();
            pull.current = null;
          }}
        />
        <div className="sp-head">
          <div className="sp-title">
            <b>{title}</b>
            <button type="button" className="x" title={t('panel.close')} aria-label={t('panel.close')} onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        {rows}
      </div>
    </>,
    document.body,
  );
}

/** What the list is sorted by, and which way. */
interface Sort {
  /** A card's own field, or one of the board's by `f:` and its key. */
  field: 'key' | 'title' | 'status' | 'priority' | 'due' | 'assignee' | `f:${string}`;
  desc: boolean;
}

/** How wide a column of the list is for a field of the board, by its type. */
const LIST_WIDTHS: { [type in Field['type']]: number } = {
  name: 140,
  code: 90,
  text: 140,
  number: 90,
  date: 96,
  time: 70,
  select: 110,
  'multi-select': 140,
  checkbox: 50,
  url: 150,
  email: 160,
  phone: 120,
  person: 90,
  link: 150,
  formula: 90,
  lookup: 140,
  rollup: 90,
};
/** The list's own columns: key, title, status, priority, labels, who, due. */
const LIST_COLUMNS = '58px minmax(160px, 1fr) 90px 60px 116px 40px 80px';
const LIST_LEAST = 640;

/** Cards in a list's order: by the field asked, else by column then place; finished cards last. Who has a card goes by their name among `people`. */
function sortCards(board: Board, cards: Card[], sort: Sort | null, people?: Person[], valueOf: (card: Card, field: Field) => FieldValue = (card, field) => cardValue(board, card, field)): Card[] {
  const columnAt = new Map(board.columns.map((c, i) => [c.id, i]));
  const rank = (card: Card) => (isFinished(board, card) ? 1 : 0);
  const own = sort?.field.startsWith('f:') ? board.fields?.find((f) => `f:${f.key}` === sort.field) : undefined;
  const value = (card: Card): string | number => {
    // A board's field: numbers as numbers, the rest by their text; the empty ones last.
    if (own) {
      const v = valueOf(card, own);
      if (isEmpty(v)) return own.type === 'number' || own.type === 'formula' ? Number.MAX_SAFE_INTEGER : '\uffff';
      return typeof v === 'number' ? v : valueText(v).toLowerCase();
    }
    switch (sort?.field) {
      case 'key':
        return card.key;
      case 'title':
        return card.title.toLowerCase();
      case 'priority':
        return card.priority;
      case 'due':
        return card.due ?? '9999';
      case 'assignee':
        return card.assignee ? assigneeLabel(card.assignee, people).toLowerCase() : '\uffff';
      default:
        return (columnAt.get(card.column) ?? 0) * 100000 + card.order;
    }
  };
  return [...cards].sort((a, b) => {
    if (!sort || sort.field === 'status') {
      const byRank = rank(a) - rank(b);
      if (byRank) return byRank;
    }
    const [x, y] = [value(a), value(b)];
    const order = x < y ? -1 : x > y ? 1 : a.order - b.order;
    return sort?.desc ? -order : order;
  });
}

/** The same cards as a table, grouped by phase, sorted by a click on a column header. */
/** A group of the list with more than this many cards shows its first `SHOWN_FIRST`, and a row for the rest. */
const MANY_ROWS = 20;
const SHOWN_FIRST = 15;

/** A group of the list: a phase's cards, or a status's when phases are off. */
interface ListGroup {
  id: string;
  label: string;
  detail?: string;
  doneWhen?: string;
  /** For a status: its icon. */
  status?: ColumnStatus;
  /** Its cards are finished (a done or dropped status, a closed phase): it starts closed. */
  finished?: boolean;
  cards: Card[];
}

/** A group's chevron: down while it is open. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chv${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 6l6 6-6 6" />
    </svg>
  );
}

/**
 * The board as a table, after the Issues views of design/mockups.html. With phases on, its cards
 * are grouped by phase; with them off, by status in the order of the columns. Every group opens
 * and closes with a click on its header, the finished ones closed at first, and has "+ Add card"
 * on the right of its header. A long group shows its first cards and a row for the rest. Which
 * groups are toggled and shown in full is kept with the board's look.
 */
function BoardList({ board, path, today, actions, openCard, visible, toggled, inFull, onToggle, onInFull }: {
  board: Board;
  path: string;
  today: string;
  actions: BoardActions;
  openCard: string | null;
  visible: (card: Card) => boolean;
  toggled: string[];
  inFull: string[];
  onToggle: (group: string) => void;
  onInFull: (group: string, full: boolean) => void;
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  const people = actions.people?.(path)?.people;
  /**
   * The group a card is being typed into, and the card added last from its line: the next goes
   * after it, and the line stays right under it.
   */
  const [adding, setAdding] = useState<{ group: string; after: string | null } | null>(null);
  const toggle = (field: Sort['field']) =>
    setSort((now) => (now?.field === field ? (now.desc ? null : { field, desc: true }) : { field, desc: false }));
  const groups: ListGroup[] = board.phasesOn
    ? [
        ...board.phases.map((phase) => {
          const { done, total } = phaseProgress(board, phase.id);
          return {
            id: phase.id,
            label: phase.name,
            detail: t('board.progress', { done, total }),
            doneWhen: phase.doneWhen,
            finished: phase.state === 'done',
            cards: board.cards.filter((c) => c.phase === phase.id),
          };
        }),
        { id: 'none', label: t('list.noPhase'), cards: board.cards.filter((c) => !c.phase || !board.phases.some((p) => p.id === c.phase)) },
      ]
    : board.columns.map((column) => ({
        id: column.id,
        label: column.name,
        status: columnStatus(board, column),
        finished: column.kind === 'done' || column.kind === 'dropped',
        cards: board.cards.filter((c) => c.column === column.id),
      }));
  // Every status and every phase shows, with no cards too, so that there is a place to add one;
  // the cards in no phase only when there are some.
  // The board's own fields, a formula's and a lookup's worked out with the records they read.
  const computer = computerFor(null, actions.recordActions.collections(), { ...actions.recordActions.boards(), [path]: board }, today);
  const shownAs = computer.shown(path);
  const valueOf = (card: Card, field: Field) => computer.cardValue(path, card, field);
  const shown = groups.map((group) => ({ ...group, cards: sortCards(board, group.cards.filter(visible), sort, people, valueOf) })).filter((g) => g.cards.length > 0 || g.id !== 'none');
  // A card typed into a status's group goes into that column; into a phase's, into that phase.
  // The first goes first in the group, each next one after the one before.
  const addTo = (group: ListGroup, title: string) => {
    const after = adding?.group === group.id ? adding.after : null;
    const id = actions.addCard(path, {
      title,
      first: true,
      ...(after && { after }),
      ...(group.status ? { column: group.id } : { phase: group.id === 'none' ? null : group.id }),
    });
    setAdding({ group: group.id, after: id });
  };
  const head = (field: Sort['field'], label = t(`list.${field as 'key'}`), className = '') => (
    <button key={field} type="button" role="columnheader" className={[sort?.field === field && 'sorted', className].filter(Boolean).join(' ')} onClick={() => toggle(field)}>
      {label}
      {sort?.field === field && <span>{sort.desc ? ' ↑' : ' ↓'}</span>}
    </button>
  );
  // The board's own fields as columns after the card's, wider than the window when they need to be.
  const own = board.fields ?? [];
  const isNumber = (field: Field) => (shownAs.get(field.key) ?? field).type === 'number';
  const grid = {
    '--lcols': [LIST_COLUMNS, ...own.map((f) => `${LIST_WIDTHS[f.type]}px`)].join(' '),
    '--lmin': `${LIST_LEAST + own.reduce((sum, f) => sum + LIST_WIDTHS[f.type] + 12, 0)}px`,
  } as React.CSSProperties;
  const ctx: ValueContext = { records: actions.recordActions.records, collection: actions.recordActions.collection, openLink: actions.recordActions.openLink };
  const listed = shown.flatMap((group) => group.cards);
  const sumOf = (field: Field) => {
    const numbers = listed.map((card) => valueOf(card, field)).filter((v): v is number => typeof v === 'number');
    return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) : null;
  };
  const sums = own.map((field) => (isNumber(field) ? sumOf(field) : null));
  const row = (card: Card) => {
    const column = board.columns.find((c) => c.id === card.column);
    const menu = (event: MouseEvent) =>
      actions.menu(event, [
        ...board.columns
          .filter((c) => c.id !== card.column)
          .map((c) => ({ label: t('board.moveToColumn', { column: c.name }), run: () => actions.moveToColumn(path, card.id, c.id) })),
        { label: t('menu.delete'), run: () => actions.removeCard(path, card) },
      ]);
    return (
      <div
        key={card.id}
        className={`lrow${isFinished(board, card) ? ' done' : ''}${card.id === openCard ? ' on' : ''}`}
        role="row"
        onClick={() => actions.openCard(path, card.id)}
        onContextMenu={menu}
      >
        <span className="key">{keyOf(board, card)}</span>
        <span className="tt">
          {card.title}
          {card.subtasks?.length ? <SubtaskCount list={card.subtasks} /> : null}
        </span>
        <span className="st">
          {column && <StatusIcon status={columnStatus(board, column)} />}
          {column?.name}
        </span>
        <span className="pr">
          <i className={`dot p${card.priority}`} />
          {card.priority < 4 ? `p${card.priority}` : '–'}
        </span>
        <span className="lbls">
          {card.labels?.map((label) => (
            <LabelChip key={label} path={path} name={label} />
          ))}
        </span>
        <span title={card.assignee ? assigneeLabel(card.assignee, people) : undefined}>{card.assignee && <WhoOf who={card.assignee} people={people} />}</span>
        <span className={card.due ? dueClass(card.due, today) : 'due'}>{card.due ? dueLabel(card.due, today) : ''}</span>
        {own.map((field) => (
          <span key={field.key} className={isNumber(field) ? 'own r' : 'own'}>
            <Cell field={shownAs.get(field.key) ?? field} value={valueOf(card, field)} ctx={ctx} />
          </span>
        ))}
      </div>
    );
  };
  return (
    <div className="blist" role="table" style={own.length > 0 ? grid : undefined}>
      <div className="lrow head" role="row">
        {head('key')}
        {head('title')}
        {head('status')}
        {head('priority')}
        <span role="columnheader">{t('list.labels')}</span>
        {head('assignee')}
        {head('due')}
        {own.map((field) => head(`f:${field.key}`, field.label, isNumber(field) ? 'r' : ''))}
      </div>
      {shown.map((group) => {
        const open = toggled.includes(group.id) ? group.finished === true : group.finished !== true;
        const many = group.cards.length > MANY_ROWS;
        const full = inFull.includes(group.id);
        const typing = open && adding?.group === group.id;
        // The cards just typed in are never hidden among a long group's rest, nor is the open card.
        const lastAdded = typing && adding.after ? group.cards.findIndex((card) => card.id === adding.after) : -1;
        const rows = !open
          ? group.cards.filter((card) => card.id === openCard)
          : many && !full
            ? group.cards.filter((card, index) => index < SHOWN_FIRST || index <= lastAdded || card.id === openCard)
            : group.cards;
        // The line a card is typed in: first in the group, then right under the card added last.
        const lines = rows.map(row);
        if (typing) {
          const at = adding.after ? rows.findIndex((card) => card.id === adding.after) + 1 : 0;
          lines.splice(at, 0, <ListComposer key="composer" onAdd={(title) => addTo(group, title)} onClose={() => setAdding(null)} />);
        }
        return (
          <div key={group.id}>
            <div className="lsec">
              <button type="button" className="lsec-main" aria-expanded={open} onClick={() => onToggle(group.id)}>
                <Chevron open={open} />
                {group.status && <StatusIcon status={group.status} />}
                <span className="nm">{group.label}</span>
                <small>{group.status ? group.cards.length : group.detail}</small>
                {group.doneWhen && <span className="dw">{group.doneWhen}</span>}
              </button>
              {/* While a card is typed, the line's own buttons do it. In a closed group, the group opens for it. */}
              {adding?.group !== group.id && (
                <button
                  type="button"
                  className="ladd"
                  onClick={() => {
                    if (!open) onToggle(group.id);
                    setAdding({ group: group.id, after: null });
                  }}
                >
                  {t('board.addCardRow')}
                </button>
              )}
            </div>
            {lines}
            {open && group.cards.length === 0 && !typing && <div className="lnone">{t('list.noCards')}</div>}
            {open && many && (
              <button type="button" className="lmore" onClick={() => onInFull(group.id, !full)}>
                {full ? t('list.showLess') : t('list.showMore', { count: group.cards.length - rows.length })}
              </button>
            )}
          </div>
        );
      })}
      {/* The board's numbers added up over the cards listed. */}
      {sums.some((sum) => sum !== null) && (
        <div className="lrow sum" role="row">
          <span />
          <span className="tt">{t('collection.sum')}</span>
          <span />
          <span />
          <span />
          <span />
          <span />
          {own.map((field, i) => (
            <span key={field.key} className="own r">
              {sums[i] !== null && sums[i] !== undefined ? <span className="num">{formatNumber(sums[i]!, field.format)}</span> : null}
            </span>
          ))}
        </div>
      )}
      {shown.length === 0 && <p className="task-empty">{t('list.empty')}</p>}
    </div>
  );
}

/** How long a finger rests on a row of the list on a phone before its actions open. */
const ROW_HOLD_MS = 450;

/**
 * The list on a phone, after the Phone board views of design/mockups.html: a card a row, its title
 * over its key, its status and what it is linked to, and on the right the board's number or the
 * day it is due. The bar above sorts it by a field picked from an action sheet, the one sorted by
 * picked again turning it around, and adds up the board's number, or counts the cards. A row
 * tapped opens its card; held, its actions.
 */
function PhoneBoardList({ board, path, today, actions, onStatus, onAdd }: {
  board: Board;
  path: string;
  today: string;
  actions: BoardActions;
  onStatus: (card: Card) => void;
  onAdd: () => void;
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  const pressed = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null);
  const own = board.fields ?? [];
  const computer = computerFor(null, actions.recordActions.collections(), { ...actions.recordActions.boards(), [path]: board }, today);
  const shownAs = computer.shown(path);
  const valueOf = (card: Card, field: Field) => computer.cardValue(path, card, field);
  const isNumber = (field: Field) => (shownAs.get(field.key) ?? field).type === 'number';
  const current = sort?.field ?? 'status';
  const sortedBy = current.startsWith('f:') ? own.find((field) => `f:${field.key}` === current) : undefined;
  // The number on the right: the one sorted by, else the board's first.
  const number = sortedBy && isNumber(sortedBy) ? sortedBy : own.find(isNumber);
  const link = own.find((field) => field.type === 'link');
  const cards = sortCards(board, board.cards, sort, undefined, valueOf);
  const numbers = number ? board.cards.map((card) => valueOf(card, number)).filter((v): v is number => typeof v === 'number') : [];
  const total = numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) : null;
  const fields: { field: Sort['field']; label: string; icon: IconName }[] = [
    { field: 'status', label: t('list.status'), icon: 'board' },
    { field: 'title', label: t('list.title'), icon: 'pen' },
    { field: 'priority', label: t('list.priority'), icon: 'flag' },
    { field: 'due', label: t('list.due'), icon: 'calendar' },
    { field: 'assignee', label: t('card.assignee'), icon: 'person' },
    ...own.map((field) => ({ field: `f:${field.key}` as const, label: field.label, icon: (isNumber(field) ? 'list' : 'collection') as IconName })),
  ];
  const label = fields.find((each) => each.field === current)?.label ?? t('list.status');
  // A number is sorted largest first; the rest from the start.
  const firstWay = (field: Sort['field']) => {
    const of = field.startsWith('f:') ? own.find((each) => `f:${each.key}` === field) : undefined;
    return of ? isNumber(of) : false;
  };
  const chooseSort = () =>
    actions.menu(
      NO_POINTER,
      fields.map(({ field, label: name, icon }) => ({
        label: name,
        icon,
        value: field === current ? '✓' : undefined,
        run: () => setSort(field === current ? { field, desc: !(sort?.desc ?? false) } : { field, desc: firstWay(field) }),
      })),
      { icon: 'list', title: t('phone.sortBy'), sub: t('count.cards', { count: board.cards.length }) },
    );
  const held = (element: HTMLElement, card: Card) => {
    liftUntilTouch(element);
    actions.menu(
      NO_POINTER,
      [
        { label: t('phone.statusMenu'), icon: 'board', run: () => onStatus(card) },
        { label: t('card.copyBrief'), icon: 'copy', run: () => actions.copyBrief(path, card.id) },
        { label: t('menu.delete'), icon: 'trash', danger: true, run: () => actions.removeCard(path, card) },
      ],
      cardHead(board, card, keyOf(board, card), titleOfBoard(path)),
    );
  };
  // A finger resting on a row: after a moment its actions open, and the tap that ends it opens nothing.
  const press = (event: ReactPointerEvent<HTMLElement>, card: Card) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const element = event.currentTarget;
    const at = { x: event.clientX, y: event.clientY, fired: false, timer: 0 };
    at.timer = window.setTimeout(() => {
      at.fired = true;
      held(element, card);
    }, ROW_HOLD_MS);
    pressed.current = at;
  };
  const letGo = () => {
    const at = pressed.current;
    if (at && !at.fired) {
      window.clearTimeout(at.timer);
      pressed.current = null;
    }
  };
  if (board.cards.length === 0) {
    return <Empty icon="board" title={t('phone.emptyBoard')} text={t('phone.emptyBoardText')} action={board.columns.length > 0 ? { label: t('board.addCard'), run: onAdd } : undefined} />;
  }
  return (
    <div className="mb-dlist">
      <div className="mb-sortbar">
        <button type="button" className="sb" onClick={chooseSort}>
          <Icon name={sort === null ? 'list' : sort.desc ? 'down' : 'up'} />
          {label}
        </button>
        <span className="tot">{total !== null ? formatNumber(total, number?.format) : t('count.cards', { count: board.cards.length })}</span>
      </div>
      {cards.map((card) => {
        const column = board.columns.find((each) => each.id === card.column);
        const linked = link ? cardValue(board, card, link, today) : null;
        const value = number ? valueOf(card, number) : null;
        return (
          <button
            key={card.id}
            type="button"
            className={isFinished(board, card) ? 'mb-drow done' : 'mb-drow'}
            onClick={() => actions.openCard(path, card.id)}
            onPointerDown={(event) => press(event, card)}
            onPointerMove={(event) => {
              const at = pressed.current;
              if (at && !at.fired && Math.hypot(event.clientX - at.x, event.clientY - at.y) > 8) letGo();
            }}
            onPointerUp={letGo}
            onPointerCancel={letGo}
            onClickCapture={(event) => {
              if (pressed.current?.fired) {
                event.preventDefault();
                event.stopPropagation();
              }
              pressed.current = null;
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              if (!pressed.current?.fired) held(event.currentTarget, card);
            }}
          >
            <span className="tx">
              <b>{card.title}</b>
              <small>
                <span className="key">{keyOf(board, card)}</span>
                {column && <KindMark kind={column.kind} />}
                <span className="in">
                  {column?.name}
                  {linked !== null && !isEmpty(linked) && ` · ${faceText(linked)}`}
                </span>
              </small>
            </span>
            {typeof value === 'number' ? (
              <span className="num">{formatNumber(value, number?.format, currencyOf(number?.format, card.values))}</span>
            ) : (
              card.due && <span className={`num ${dueClass(card.due, today)}`}>{dueLabel(card.due, today)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The phase a board shows at first: the one chosen last on this device while it is there, otherwise the current one. */
function firstShown(board: Board, look: BoardLook | undefined): Shown {
  if (look?.phase === null) return { all: true };
  if (look?.phase === '' && board.phasesOn) return { phase: null };
  if (typeof look?.phase === 'string' && board.phasesOn && board.phases.some((p) => p.id === look.phase)) return { phase: look.phase };
  const current = currentPhase(board);
  return board.phasesOn && current ? { phase: current.id } : { all: true };
}

/**
 * A board: its columns with their cards, the phase strip above when phases are on, and the
 * open card in a panel on the right. The same cards read as a list too. Columns or list, and
 * the phase chosen, are remembered on the device for each board.
 */
export function BoardView({ path, board, name, today, actions, look, onLook, onStatus, openCard, onCloseCard, adding, fieldsAsked }: {
  path: string;
  board: Board;
  /** What the board is called. */
  name: string;
  today: string;
  actions: BoardActions;
  /** How the board was last looked at on this device. */
  look: BoardLook | undefined;
  onLook: (look: BoardLook) => void;
  /** Says in the status bar what is shown: the phase with how much of it is done, and how many cards; null when it goes. */
  onStatus?: (parts: string[] | null) => void;
  /** The card shown in the panel, by its id. */
  openCard: string | null;
  onCloseCard: () => void;
  /** On a phone: counts the presses of +, each of which types a card for the column on screen. */
  adding?: number;
  /** On a phone: counts the times the page's menu asked for the Fields window. */
  fieldsAsked?: number;
}) {
  const phone = isPhone();
  const current = currentPhase(board);
  // A phone has the board and the list; a calendar chosen on a computer is the board there.
  const [view, setView] = useState<'board' | 'list' | 'calendar'>(() => { const was = look?.view ?? board.view ?? 'board'; return phone && was === 'calendar' ? 'board' : was; });
  const [month, setMonth] = useState(today.slice(0, 7));
  const [designing, setDesigning] = useState(false);
  const [shown, setShown] = useState<Shown>(() => firstShown(board, look));
  /** A phase chosen here is remembered; until one is, the board opens on its current phase. */
  const [phaseChosen, setPhaseChosen] = useState(look?.phase !== undefined);
  const [toggled, setToggled] = useState<string[]>(look?.toggled ?? []);
  const [inFull, setInFull] = useState<string[]>(look?.inFull ?? []);
  // The look as it is now, ahead of the next draw: two changes in a row must not keep a stale one.
  const latest = useRef({ view, shown, chosen: phaseChosen, toggled, inFull });
  latest.current = { view, shown, chosen: phaseChosen, toggled, inFull };
  const remember = (next: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...next };
    const { view: v, shown: s, chosen: c, toggled: g, inFull: f } = latest.current;
    onLook({ view: v, ...(c && { phase: 'all' in s ? null : (s.phase ?? '') }), ...(g.length > 0 && { toggled: g }), ...(f.length > 0 && { inFull: f }) });
  };
  const chooseView = (next: 'board' | 'list' | 'calendar') => {
    setView(next);
    remember({ view: next });
  };
  const choosePhase = (next: Shown) => {
    setShown(next);
    setPhaseChosen(true);
    remember({ shown: next, chosen: true });
  };
  const toggleIn = (list: string[], id: string, on: boolean) => (on ? [...list.filter((each) => each !== id), id] : list.filter((each) => each !== id));
  const toggleGroup = (group: string) => {
    const next = toggleIn(latest.current.toggled, group, !latest.current.toggled.includes(group));
    setToggled(next);
    remember({ toggled: next });
  };
  const showInFull = (group: string, full: boolean) => {
    const next = toggleIn(latest.current.inFull, group, full);
    setInFull(next);
    remember({ inFull: next });
  };
  // A phase that is gone, or phases turned off, shows everything.
  useEffect(() => {
    if ('phase' in shown && (!board.phasesOn || (shown.phase !== null && !board.phases.some((p) => p.id === shown.phase)))) {
      setShown(board.phasesOn && current ? { phase: current.id } : { all: true });
    }
  }, [board, shown, current]);
  const columns = useRef<HTMLDivElement>(null);
  // On a phone: the column on screen, the card whose column is being picked, and + typing a card.
  const [onScreen, setOnScreen] = useState(0);
  const [statusFor, setStatusFor] = useState<Card | null>(null);
  /** + typing a card: the column it goes in. */
  const [quickAdding, setQuickAdding] = useState<string | null>(null);
  useEffect(() => {
    if (adding) setQuickAdding(board.columns[Math.min(onScreen, board.columns.length - 1)]?.id ?? null);
    // Only a press of + opens it, for the column on screen then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding]);
  useEffect(() => {
    if (fieldsAsked) setDesigning(true);
  }, [fieldsAsked]);
  /** A column's place in the row of columns: its width and the gap after it. */
  const step = () => {
    const first = columns.current?.querySelector<HTMLElement>('[data-column]');
    return first ? first.offsetWidth + 10 : 1;
  };
  const goToColumn = (index: number) => columns.current?.scrollTo({ left: index * step(), behavior: 'smooth' });
  const dragging = useRef<{ card: Card; element: HTMLElement } | { column: Column; element: HTMLElement } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  // The same, for a finger letting go, which comes before the state is drawn.
  const dropping = useRef<Drop | null>(null);
  const root = useRef<HTMLElement>(null);
  /** Where a dragged column would land: the gap before the column at this index. */
  const [columnDrop, setColumnDrop] = useState<number | null>(null);
  const waiting = reviewCount(board);
  const shownPhase = 'phase' in shown ? board.phases.find((p) => p.id === shown.phase) : undefined;
  // Every phase as a lane across the columns, and a lane for cards in none when there are any.
  const unphased = phaseCards(board, null);
  const visible = (card: Card) => ('all' in shown ? true : shown.phase === null ? unphased.includes(card) : card.phase === shown.phase);
  // The status bar, after the mockups: "Phase 3 · 4/13 done · 13 cards", the cards being those shown.
  const statusPhase = board.phasesOn ? shownPhase : undefined;
  const shownCount = board.cards.filter(visible).length;
  const progress = statusPhase ? phaseProgress(board, statusPhase.id) : null;
  // On the calendar: the cards of the month, and those with no day.
  const dated = board.cards.filter((card) => card.due && !isFinished(board, card));
  const status = view === 'calendar' ? [
    t('tasks.inMonth', { what: t('count.cards', { count: dated.filter((card) => card.due!.slice(0, 7) === month).length }), month: new Date(`${month}-01T12:00:00`).toLocaleDateString(locale(), { month: 'long' }) }),
    t('calendar.noDay', { count: board.cards.filter((card) => !card.due && !isFinished(board, card)).length }),
  ] : [
    ...(statusPhase && progress ? [t('board.phaseStatus', { phase: statusPhase.name, done: progress.done, total: progress.total })] : []),
    ...(board.phasesOn && 'phase' in shown && shown.phase === null ? [t('card.noPhase')] : []),
    t('count.cards', { count: shownCount }),
  ];
  const statusKey = status.join('\u0000');
  useEffect(() => onStatus?.(status), [statusKey]);
  useEffect(() => () => onStatus?.(null), []);
  const open = openCard !== null ? board.cards.find((card) => card.id === openCard) : undefined;
  /** In All: whether the closed phases' lanes are unfolded. */
  const [closedLanes, setClosedLanes] = useState(false);
  const closedPhases = board.phases.filter((phase) => phase.state === 'done');
  const closedCards = board.cards.filter((card) => closedPhases.some((phase) => phase.id === card.phase)).length;
  // On a phone the lanes are not drawn: All shows every card in its column, saying its phase.
  const lanes =
    !phone && 'all' in shown && board.phasesOn && board.phases.length > 0
      ? [
          // The closed phases first, folded into one row until it is opened.
          ...[...closedPhases, ...board.phases.filter((phase) => phase.state !== 'done')].filter((phase) => closedLanes || phase.state !== 'done').map((phase) => {
            const { done, total } = phaseProgress(board, phase.id);
            return { id: phase.id as string | null, name: phase.name, detail: t('board.progress', { done, total }) };
          }),
          ...(unphased.length > 0 ? [{ id: null, name: t('list.noPhase'), detail: '' }] : []),
        ]
      : null;

  // With a card open: Esc closes it, j and k go to the next or previous card in its column, a
  // number moves it to that column. Not while something is being typed.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      // A window over the card (a record a link opens, a question) has the keys.
      if (event.defaultPrevented || document.querySelectorAll('.backdrop').length > 1) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        if (event.key === 'Escape' && target.closest('.cm-content')) target.blur();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') onCloseCard();
      else if (event.key === 'j' || event.key === 'k') {
        const cards = columnCards(board, open.column).filter(visible);
        const at = cards.findIndex((card) => card.id === open.id);
        const next = cards[at + (event.key === 'j' ? 1 : -1)];
        if (next) actions.openCard(path, next.id);
      } else if (/^[1-9]$/.test(event.key)) {
        const column = board.columns[Number(event.key) - 1];
        if (column && column.id !== open.column) actions.moveToColumn(path, open.id, column.id);
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const release = () => {
    dragging.current?.element.classList.remove('lifted');
    dragging.current = null;
    dropping.current = null;
    setDrop(null);
    setColumnDrop(null);
  };
  const onGrab = (event: DragEvent<HTMLElement>, card: Card) => {
    const element = event.currentTarget;
    dragging.current = { card, element };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, card.id);
    // Lifted after the browser has taken its picture of the card.
    requestAnimationFrame(() => dragging.current?.element.classList.add('lifted'));
  };
  const onGrabColumn = (event: DragEvent<HTMLElement>, column: Column) => {
    const element = event.currentTarget.closest<HTMLElement>('[data-column]')!;
    dragging.current = { column, element };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(COLUMN_DRAG_TYPE, column.id);
    event.stopPropagation();
    requestAnimationFrame(() => dragging.current?.element.classList.add('lifted'));
  };
  /** The gap in a column at height `y`: before the first card shown whose middle is below it. */
  const dropIn = (block: HTMLElement, y: number, column: string, lane: string | null | undefined) => {
    const d = dragging.current;
    if (!d || !('card' in d)) return;
    const cards = [...block.querySelectorAll<HTMLElement>('[data-card]')].filter((el) => el !== d.element);
    let index = cards.findIndex((el) => {
      const box = el.getBoundingClientRect();
      return y < box.top + box.height / 2;
    });
    if (index < 0) index = cards.length;
    const after = index === 0 ? null : (cards[index - 1]?.dataset.card ?? null);
    const next = { column, lane, index, after };
    dropping.current = next;
    setDrop((now) => (now?.column === column && now.lane === lane && now.index === index ? now : next));
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>, column: Column, lane: string | null | undefined) => {
    const d = dragging.current;
    if (!d || !('card' in d)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    dropIn(event.currentTarget, event.clientY, column.id, lane);
  };
  /**
   * A finger carrying a card: the column under it, or else the one it is level with, the nearest
   * by height; a column with few cards ends well above a finger that comes from a long one.
   */
  const overAt = (x: number, y: number) => {
    const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-column]');
    const level = (box: DOMRect) => (y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0);
    const block =
      under && root.current?.contains(under)
        ? under
        : [...(root.current?.querySelectorAll<HTMLElement>('[data-column]') ?? [])]
            .map((el) => ({ el, box: el.getBoundingClientRect() }))
            .filter(({ box }) => x >= box.left && x <= box.right)
            .sort((a, b) => level(a.box) - level(b.box))[0]?.el;
    if (!block) {
      dropping.current = null;
      setDrop(null);
      return;
    }
    const lane = block.dataset.lane;
    dropIn(block, y, block.dataset.column!, lane === undefined ? undefined : lane || null);
  };
  const land = () => {
    const d = dragging.current;
    const at = dropping.current;
    if (d && 'card' in d && at) {
      actions.moveCard(path, d.card.id, { column: at.column, after: at.after });
      // Dropped in another lane: the card changes phase too.
      if (at.lane !== undefined && (d.card.phase ?? null) !== at.lane) actions.updateCard(path, d.card.id, { phase: at.lane });
    }
    release();
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || !('card' in d) || !dropping.current) return;
    event.preventDefault();
    event.stopPropagation();
    land();
  };
  const onHold = (event: ReactPointerEvent<HTMLElement>, card: Card, still?: () => void) => {
    const element = event.currentTarget;
    holdToDrag(event, {
      element,
      onLift: (x, y) => {
        dragging.current = { card, element };
        element.classList.add('lifted');
        overAt(x, y);
      },
      onMove: overAt,
      onDrop: land,
      onCancel: release,
      // Let go where it lifted: its actions open instead.
      onStill: still
        ? () => {
            release();
            still();
          }
        : undefined,
    });
  };
  // A column dragged by its header lands in a gap between columns, picked by the pointer's x.
  const onColumnDragOver = (event: DragEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || !('column' in d)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const blocks = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-column]')].filter((el) => el !== d.element);
    let index = blocks.findIndex((el) => {
      const box = el.getBoundingClientRect();
      return event.clientX < box.left + box.width / 2;
    });
    if (index < 0) index = blocks.length;
    setColumnDrop((now) => (now === index ? now : index));
  };
  const onColumnDrop = (event: DragEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || !('column' in d) || columnDrop === null) return;
    event.preventDefault();
    const rest = board.columns.filter((c) => c.id !== d.column.id);
    actions.moveColumn(path, d.column.id, columnDrop === 0 ? null : (rest[columnDrop - 1]?.id ?? null));
    release();
  };
  const boardMenu = (event: MouseEvent) =>
    actions.menu(event, [
      { label: board.phasesOn ? t('board.phasesOff') : t('board.phasesOn'), run: () => actions.setPhasesOn(path, !board.phasesOn) },
      { label: t('board.addColumn'), run: () => actions.addColumn(path, t('board.newColumn'), 'active') },
    ]);

  const counts = Object.fromEntries(board.columns.map((column) => [column.id, columnCards(board, column.id).filter(visible).length]));
  return (
    <div className="bwrap">
    <section ref={root} className={phone ? 'bv mb-bv' : 'bv'}>
      {phone ? (
        <header className="mb-head split">
          <div>
            <h1>{name}</h1>
            {waiting > 0 && <small className="wait">{t('board.toReview', { count: waiting })}</small>}
          </div>
          <div className="mb-seg" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'board'} onClick={() => chooseView('board')}>
              {t('board.viewBoard')}
            </button>
            <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => chooseView('list')}>
              {t('board.viewList')}
            </button>
          </div>
        </header>
      ) : (
      <header className="th">
        <b>{name}</b>
        <span className="vsw" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'board'} onClick={() => chooseView('board')}>
            {t('board.viewBoard')}
          </button>
          <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => chooseView('list')}>
            {t('board.viewList')}
          </button>
          <button type="button" role="tab" aria-selected={view === 'calendar'} onClick={() => chooseView('calendar')}>
            {t('calendar.calendar')}
          </button>
        </span>
        {view === 'calendar' && <MonthNav month={month} today={today} onMonth={setMonth} />}
        {waiting > 0 && <span className="wait">{t('board.toReview', { count: waiting })}</span>}
        <button type="button" className="ghost" onClick={() => setDesigning(true)}>
          {t('collection.fields')}
        </button>
        <button type="button" className="ghost" onClick={boardMenu}>
          {t('board.more')}
        </button>
      </header>
      )}
      {designing && (
        <BoardFieldsDialog board={board} path={path} collections={actions.recordActions.collections()} actions={actions} onClose={() => setDesigning(false)} />
      )}
      {board.phasesOn && view === 'board' && <PhaseStrip board={board} path={path} shown={shown} onShow={choosePhase} actions={actions} />}
      {shownPhase?.doneWhen && view === 'board' && (
        <p className="donewhen">
          <b>{t('board.doneWhen')}</b>
          {shownPhase.doneWhen}
        </p>
      )}
      {phone && view === 'board' && <ColumnTabs columns={board.columns} counts={counts} current={onScreen} onPick={goToColumn} />}
      {view === 'calendar' && <BoardCalendar board={board} path={path} month={month} today={today} actions={actions} />}
      {view === 'list' && phone && (
        <PhoneBoardList
          board={board}
          path={path}
          today={today}
          actions={actions}
          onStatus={setStatusFor}
          onAdd={() => setQuickAdding(board.columns[Math.min(onScreen, board.columns.length - 1)]?.id ?? null)}
        />
      )}
      {view === 'list' && !phone && (
        <BoardList
          board={board}
          path={path}
          today={today}
          actions={actions}
          openCard={openCard}
          visible={() => true}
          toggled={toggled}
          inFull={inFull}
          onToggle={toggleGroup}
          onInFull={showInFull}
        />
      )}
      {view === 'board' && lanes && (
        <div className="board lanes" onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setDrop(null)}>
          {closedPhases.length > 0 && (
            <button type="button" className="lane-fold" aria-expanded={closedLanes} onClick={() => setClosedLanes(!closedLanes)}>
              <span className="chev">{closedLanes ? '▾' : '▸'}</span>
              <span className="tick">✓</span>
              <span>{t('board.closedLanes', { count: closedPhases.length })}</span>
              <small>· {t('count.cards', { count: closedCards })}</small>
            </button>
          )}
          {lanes.map((lane) => (
            <div key={lane.id ?? 'none'} className="lane">
              <div className="lane-head">
                <b>{lane.name}</b>
                {lane.detail && <small>{lane.detail}</small>}
              </div>
              <div className="lane-cols">
                {board.columns.map((column) => (
                  <ColumnBlock
                    key={column.id}
                    board={board}
                    path={path}
                    column={column}
                    cards={columnCards(board, column.id).filter((card) => (card.phase ?? null) === lane.id || (lane.id === null && !!card.phase && !board.phases.some((p) => p.id === card.phase)))}
                    shown={shown}
                    lane={lane.id}
                    today={today}
                    actions={actions}
                    drop={drop}
                    onGrab={onGrab}
                    onRelease={release}
                    onHold={onHold}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    openCard={openCard}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {view === 'board' && !lanes && (
      <div
        ref={columns}
        className="board"
        // On a phone the column on screen is the one scrolled to.
        onScroll={phone ? (event) => setOnScreen(Math.round(event.currentTarget.scrollLeft / step())) : undefined}
        onDragOver={onColumnDragOver}
        onDrop={onColumnDrop}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDrop(null);
          setColumnDrop(null);
        }}
      >
        {board.columns.flatMap((column, i) => [
          ...(columnDrop === i ? [<div key="column-drop" className="colm-drop" />] : []),
          <ColumnBlock
            key={column.id}
            board={board}
            path={path}
            column={column}
            cards={columnCards(board, column.id).filter(visible)}
            shown={shown}
            today={today}
            actions={actions}
            drop={drop}
            onGrab={onGrab}
            onRelease={release}
            onHold={onHold}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onGrabColumn={phone ? undefined : onGrabColumn}
            openCard={openCard}
            onStatus={setStatusFor}
            onAddHere={() => setQuickAdding(column.id)}
            peek={phone && i !== onScreen}
          />,
        ])}
        {columnDrop === board.columns.length && <div className="colm-drop" />}
        {!phone && (
          <button type="button" className="colm-add" onClick={() => actions.addColumn(path, t('board.newColumn'), 'active')}>
            {t('board.addColumnRow')}
          </button>
        )}
      </div>
      )}
    </section>
    {statusFor && (
      <StatusSheet
        board={board}
        title={keyOf(board, statusFor)}
        current={statusFor.column}
        onPick={(column) => actions.moveToColumn(path, statusFor.id, column)}
        onClose={() => setStatusFor(null)}
      />
    )}
    {quickAdding && board.columns.length > 0 && (
      <CardQuickAdd
        board={board}
        path={path}
        column={quickAdding}
        phase={'phase' in shown ? shown.phase : undefined}
        today={today}
        onAdd={(input) => actions.addCard(path, input)}
        onClose={() => setQuickAdding(null)}
      />
    )}
    {/* On a phone a card opens as a page of its own. */}
    {open && !phone && <CardPanel key={open.id} board={board} path={path} card={open} today={today} actions={actions} onClose={onCloseCard} />}
    </div>
  );
}

/** A month's Today, back and forth and its name, for a board's calendar. */
function MonthNav({ month, today, onMonth }: { month: string; today: string; onMonth: (month: string) => void }) {
  const shift = (by: number) => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const first = new Date(y, m - 1 + by, 1);
    onMonth(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <span className="up-month">
      <button type="button" className="up-today" onClick={() => onMonth(today.slice(0, 7))}>
        {t('day.today')}
      </button>
      <button type="button" aria-label={t('calendar.previous.month')} title={t('calendar.previous.month')} onClick={() => shift(-1)}>
        <Icon name="back" />
      </button>
      <button type="button" aria-label={t('calendar.next.month')} title={t('calendar.next.month')} onClick={() => shift(1)}>
        <Icon name="chevron" />
      </button>
      <span className="mn">{new Date(`${month}-01T12:00:00`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</span>
    </span>
  );
}

/**
 * A board's Calendar, after the Calendar mockups of stage 15 slice 3: the month, each open card on
 * its due day with its key, in its priority's color; dragged to another day it is due then, with
 * Undo. A card has no time, so the month is all there is.
 */
function BoardCalendar({ board, path, month, today, actions }: { board: Board; path: string; month: string; today: string; actions: BoardActions }) {
  const chipsOf = (day: string): MonthChip[] =>
    board.cards
      .filter((card) => card.due === day && !isFinished(board, card))
      .sort((a, b) => a.priority - b.priority)
      .map((card) => ({
        key: card.id,
        title: card.title,
        priority: card.priority,
        cardKey: keyOf(board, card),
        late: day < today,
        onOpen: () => actions.openCard(path, card.id),
      }));
  return <MonthCalendar month={month} today={today} chipsOf={chipsOf} onMove={(chip, _from, to) => actions.moveDue(path, chip.key, to)} />;
}
