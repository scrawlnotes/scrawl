import {
  type Board,
  type Card,
  type CardPlace,
  type Column,
  type ColumnKind,
  COLUMN_KINDS,
  columnCards,
  currentPhase,
  keyOf,
  isFinished,
  type NewCard,
  type Phase,
  phaseProgress,
  reviewCount,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type DragEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { CardPanel, type CardPanelActions } from './CardPanel';
import type { MenuItem } from './dialogs';
import { Icon } from './Icon';
import { dueClass, dueLabel } from './Tasks';

/** What can be done on a board, at the path given. */
export interface BoardActions extends CardPanelActions {
  addCard: (board: string, input: NewCard) => void;
  moveCard: (board: string, id: string, place: CardPlace) => void;
  /** Asks first, then deletes the card. */
  removeCard: (board: string, card: Card) => void;
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
}

const DRAG_TYPE = 'application/x-scrawl-card';

/** Which phase's cards the columns show: one phase, or every card. */
type Shown = { phase: string } | { all: true };

/** A label's colour, the same every time it is seen: a hue from its letters. */
function labelHue(label: string): number {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}

/** A single line typed in place: Enter keeps it, Esc or leaving it empty drops it. */
function LineInput({ className, placeholder, initial = '', onDone, onCancel }: {
  className: string;
  placeholder: string;
  initial?: string;
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
  return (
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
}

/** The row a new card is typed into. Enter adds it and keeps the row for the next one. */
function CardComposer({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && title.trim()) {
      onAdd(title);
      setTitle('');
    } else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
  };
  return (
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
  );
}

function CardItem({ board, path, card, today, actions, onGrab, onRelease, showPhase, open }: {
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
}) {
  const comments = card.timeline.filter((entry) => entry.kind === 'comment').length;
  const noteTitle = card.note ? actions.noteTitle(card.note) : null;
  const phase = showPhase && card.phase ? board.phases.find((p) => p.id === card.phase) : undefined;
  const menu = (event: MouseEvent) =>
    actions.menu(event, [
      ...board.columns
        .filter((column) => column.id !== card.column)
        .map((column) => ({
          label: t('board.moveToColumn', { column: column.name }),
          run: () => actions.moveCard(path, card.id, { column: column.id, after: columnCards(board, column.id).pop()?.id ?? null }),
        })),
      { label: t('card.copyBrief'), run: () => actions.copyBrief(path, card.id) },
      { label: t('card.addToToday'), run: () => actions.addToToday(path, card.id) },
      { label: t('menu.delete'), run: () => actions.removeCard(path, card) },
    ]);
  return (
    <div
      className={open ? 'kc on' : 'kc'}
      data-card={card.id}
      draggable
      onDragStart={(event) => onGrab(event, card)}
      onDragEnd={onRelease}
      onContextMenu={menu}
    >
      <button type="button" className="kc-main" onClick={() => actions.openCard(path, card.id)}>
        <span className="key">{keyOf(board, card)}</span>
        <span className="kt">
          <i className={`dot p${card.priority}`} />
          <span>{card.title}</span>
        </span>
        {(card.due || card.labels?.length || comments > 0 || noteTitle !== null || phase || card.assignee) && (
          <span className="meta">
            {card.due && <span className={dueClass(card.due, today)}>{dueLabel(card.due, today)}</span>}
            {card.labels?.map((label) => (
              <span key={label} className="lbl" style={{ '--lh': labelHue(label) } as React.CSSProperties}>
                {label}
              </span>
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
            {card.assignee && <span className="who" title={card.assignee}>{card.assignee.slice(0, 1).toUpperCase()}</span>}
          </span>
        )}
      </button>
    </div>
  );
}

/** Where a dragged card would land: the gap at `index` among the cards shown in a column. */
interface Drop {
  column: string;
  index: number;
}

function ColumnBlock({ board, path, column, cards, shown, today, actions, drop, onGrab, onRelease, onDragOver, onDrop, openCard }: {
  board: Board;
  path: string;
  column: Column;
  openCard: string | null;
  /** The cards shown in the column, in order. */
  cards: Card[];
  shown: Shown;
  today: string;
  actions: BoardActions;
  drop: Drop | null;
  onGrab: (event: DragEvent<HTMLElement>, card: Card) => void;
  onRelease: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, column: Column) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const index = board.columns.findIndex((c) => c.id === column.id);
  const lastDone = column.kind === 'done' && board.columns.filter((c) => c.kind === 'done').length === 1;
  const menu = (event: MouseEvent) =>
    actions.menu(event, [
      { label: t('menu.rename'), run: () => setRenaming(true) },
      ...COLUMN_KINDS.map((kind) => ({
        label: `${kind === column.kind ? '● ' : '○ '}${t('board.kindOf', { kind: t(`board.kind.${kind}`) })}`,
        run: () => actions.setColumnKind(path, column.id, kind),
      })),
      { label: t('board.addColumnAfter'), run: () => actions.addColumn(path, t('board.newColumn'), 'active', column.id) },
      ...(index > 0 ? [{ label: t('board.moveLeft'), run: () => actions.moveColumn(path, column.id, index >= 2 ? board.columns[index - 2]!.id : null) }] : []),
      ...(index < board.columns.length - 1 ? [{ label: t('board.moveRight'), run: () => actions.moveColumn(path, column.id, board.columns[index + 1]!.id) }] : []),
      ...(lastDone || board.columns.length === 1 ? [] : [{ label: t('board.deleteColumn'), run: () => actions.removeColumn(path, column) }]),
    ]);
  const add = (title: string) => actions.addCard(path, { title, column: column.id, ...('phase' in shown && { phase: shown.phase }) });
  const items = cards.map((card) => (
    <CardItem
      key={card.id}
      board={board}
      path={path}
      card={card}
      today={today}
      actions={actions}
      onGrab={onGrab}
      onRelease={onRelease}
      showPhase={'all' in shown && board.phasesOn}
      open={card.id === openCard}
    />
  ));
  if (drop?.column === column.id) items.splice(drop.index, 0, <div key="drop" className="kc-drop" />);
  return (
    <div
      className={`colm kind-${column.kind}`}
      data-column={column.id}
      onDragOver={(event) => onDragOver(event, column)}
      onDrop={onDrop}
      onContextMenu={(event) => event.target === event.currentTarget && menu(event)}
    >
      <h3 onContextMenu={menu}>
        <i className="kind" />
        {renaming ? (
          <LineInput
            className="colm-edit"
            placeholder={t('board.columnName')}
            initial={column.name}
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
        <button type="button" className="more" title={t('board.columnMenu')} aria-label={t('board.columnMenu')} onClick={menu}>
          ···
        </button>
      </h3>
      <div className="colm-cards">{items}</div>
      {composing ? (
        <CardComposer onAdd={add} onClose={() => setComposing(false)} />
      ) : (
        <button type="button" className="qa" onClick={() => setComposing(true)}>
          {t('board.addCardRow')}
        </button>
      )}
    </div>
  );
}

/** The strip of phases above the columns: done ones ticked, the current one bold, the rest faint. */
function PhaseStrip({ board, path, shown, onShow, actions }: {
  board: Board;
  path: string;
  shown: Shown;
  onShow: (shown: Shown) => void;
  actions: BoardActions;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const menu = (event: MouseEvent, phase: Phase) => {
    const at = board.phases.findIndex((p) => p.id === phase.id);
    actions.menu(event, [
      { label: t('phase.edit'), run: () => actions.editPhase(path, phase) },
      { label: t('menu.rename'), run: () => setRenaming(phase.id) },
      ...(at > 0 ? [{ label: t('board.moveUp'), run: () => actions.movePhase(path, phase.id, at >= 2 ? board.phases[at - 2]!.id : null) }] : []),
      ...(at < board.phases.length - 1 ? [{ label: t('board.moveDown'), run: () => actions.movePhase(path, phase.id, board.phases[at + 1]!.id) }] : []),
      ...(phase.state === 'done'
        ? [{ label: t('board.reopenPhase'), run: () => actions.reopenPhase(path, phase.id) }]
        : [{ label: t('board.closePhase'), run: () => actions.closePhase(path, phase) }]),
      ...(phase.state === 'upcoming' ? [{ label: t('board.makeCurrent'), run: () => actions.reopenPhase(path, phase.id) }] : []),
      { label: t('menu.delete'), run: () => actions.removePhase(path, phase) },
    ]);
  };
  return (
    <div className="phases" role="tablist">
      {board.phases.map((phase) => {
        const { done, total } = phaseProgress(board, phase.id);
        const on = 'phase' in shown && shown.phase === phase.id;
        return renaming === phase.id ? (
          <LineInput
            key={phase.id}
            className="ph-edit"
            placeholder={t('board.phaseName')}
            initial={phase.name}
            onDone={(name) => {
              actions.renamePhase(path, phase.id, name);
              setRenaming(null);
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <button
            key={phase.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`ph ${phase.state}${on ? ' on' : ''}`}
            onClick={() => onShow({ phase: phase.id })}
            onContextMenu={(event) => menu(event, phase)}
          >
            {phase.state === 'done' && <span className="tick">✓</span>}
            <span>{phase.name}</span>
            <small>{t('board.progress', { done, total })}</small>
          </button>
        );
      })}
      {adding ? (
        <LineInput
          className="ph-edit"
          placeholder={t('board.phaseName')}
          onDone={(name) => {
            actions.addPhase(path, name);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="ph add" onClick={() => setAdding(true)}>
          {t('board.addPhase')}
        </button>
      )}
      <button type="button" role="tab" aria-selected={'all' in shown} className={`ph all${'all' in shown ? ' on' : ''}`} onClick={() => onShow({ all: true })}>
        {t('board.all')} · {board.cards.length}
      </button>
    </div>
  );
}

/** What the list is sorted by, and which way. */
interface Sort {
  field: 'key' | 'title' | 'status' | 'priority' | 'due' | 'assignee';
  desc: boolean;
}

/** Cards in a list's order: by the field asked, else by column then place; finished cards last. */
function sortCards(board: Board, cards: Card[], sort: Sort | null): Card[] {
  const columnAt = new Map(board.columns.map((c, i) => [c.id, i]));
  const rank = (card: Card) => (isFinished(board, card) ? 1 : 0);
  const value = (card: Card): string | number => {
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
        return (card.assignee ?? '\uffff').toLowerCase();
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
function BoardList({ board, path, today, actions, openCard, visible }: {
  board: Board;
  path: string;
  today: string;
  actions: BoardActions;
  openCard: string | null;
  visible: (card: Card) => boolean;
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  const toggle = (field: Sort['field']) =>
    setSort((now) => (now?.field === field ? (now.desc ? null : { field, desc: true }) : { field, desc: false }));
  const groups: { id: string | null; label: string; detail?: string; cards: Card[] }[] = board.phasesOn
    ? [
        ...board.phases.map((phase) => {
          const { done, total } = phaseProgress(board, phase.id);
          return { id: phase.id, label: phase.name, detail: t('board.progress', { done, total }), cards: board.cards.filter((c) => c.phase === phase.id) };
        }),
        { id: null, label: t('list.noPhase'), cards: board.cards.filter((c) => !c.phase || !board.phases.some((p) => p.id === c.phase)) },
      ]
    : [{ id: null, label: '', cards: board.cards }];
  const shown = groups.map((group) => ({ ...group, cards: sortCards(board, group.cards.filter(visible), sort) })).filter((g) => g.cards.length > 0);
  const head = (field: Sort['field']) => (
    <button type="button" role="columnheader" className={sort?.field === field ? 'sorted' : ''} onClick={() => toggle(field)}>
      {t(`list.${field}`)}
      {sort?.field === field && <span>{sort.desc ? ' ↑' : ' ↓'}</span>}
    </button>
  );
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
        <span className="tt">{card.title}</span>
        <span className={`st kind-${column?.kind ?? 'active'}`}>
          <i className="kind" />
          {column?.name}
        </span>
        <span className="pr">
          <i className={`dot p${card.priority}`} />
          {card.priority < 4 ? `p${card.priority}` : '–'}
        </span>
        <span className="lbls">
          {card.labels?.map((label) => (
            <span key={label} className="lbl" style={{ '--lh': labelHue(label) } as React.CSSProperties}>
              {label}
            </span>
          ))}
        </span>
        <span>{card.assignee && <span className="who" title={card.assignee}>{card.assignee.slice(0, 1).toUpperCase()}</span>}</span>
        <span className={card.due ? dueClass(card.due, today) : 'due'}>{card.due ? dueLabel(card.due, today) : ''}</span>
      </div>
    );
  };
  return (
    <div className="blist" role="table">
      <div className="lrow head" role="row">
        {head('key')}
        {head('title')}
        {head('status')}
        {head('priority')}
        <span role="columnheader">{t('list.labels')}</span>
        {head('assignee')}
        {head('due')}
      </div>
      {shown.map((group) => (
        <div key={group.id ?? 'none'}>
          {group.label && (
            <div className="lsec">
              {group.label}
              {group.detail && <small>{group.detail}</small>}
              {group.id !== null && board.phases.find((p) => p.id === group.id)?.doneWhen && (
                <span className="dw">{board.phases.find((p) => p.id === group.id)!.doneWhen}</span>
              )}
            </div>
          )}
          {group.cards.map(row)}
        </div>
      ))}
      {shown.length === 0 && <p className="task-empty">{t('list.empty')}</p>}
    </div>
  );
}

/**
 * A board: its columns with their cards, the phase strip above when phases are on, and the
 * open card in a panel on the right. The same cards read as a list too.
 */
export function BoardView({ path, board, name, today, actions, openCard, onCloseCard }: {
  path: string;
  board: Board;
  /** What the board is called. */
  name: string;
  today: string;
  actions: BoardActions;
  /** The card shown in the panel, by its id. */
  openCard: string | null;
  onCloseCard: () => void;
}) {
  const current = currentPhase(board);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [shown, setShown] = useState<Shown>(() => (board.phasesOn && current ? { phase: current.id } : { all: true }));
  // A phase that is gone, or phases turned off, shows everything.
  useEffect(() => {
    if ('phase' in shown && (!board.phasesOn || !board.phases.some((p) => p.id === shown.phase))) {
      setShown(board.phasesOn && current ? { phase: current.id } : { all: true });
    }
  }, [board, shown, current]);
  const columns = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ card: Card; element: HTMLElement } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const waiting = reviewCount(board);
  const shownPhase = 'phase' in shown ? board.phases.find((p) => p.id === shown.phase) : undefined;
  const visible = (card: Card) => ('all' in shown ? true : (card.phase ?? null) === shown.phase);
  const open = openCard !== null ? board.cards.find((card) => card.id === openCard) : undefined;

  // With a card open: Esc closes it, j and k go to the next or previous card in its column, a
  // number moves it to that column. Not while something is being typed.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
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
    setDrop(null);
  };
  const onGrab = (event: DragEvent<HTMLElement>, card: Card) => {
    const element = event.currentTarget;
    dragging.current = { card, element };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, card.id);
    // Lifted after the browser has taken its picture of the card.
    requestAnimationFrame(() => dragging.current?.element.classList.add('lifted'));
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>, column: Column) => {
    const d = dragging.current;
    if (!d) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    // The gap under the pointer: before the first card whose middle is below it.
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-card]')].filter((el) => el !== d.element);
    let index = cards.findIndex((el) => {
      const box = el.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    if (index < 0) index = cards.length;
    setDrop((now) => (now?.column === column.id && now.index === index ? now : { column: column.id, index }));
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || !drop) return;
    event.preventDefault();
    const others = columnCards(board, drop.column).filter((card) => card.id !== d.card.id && visible(card));
    const after = drop.index === 0 ? null : (others[drop.index - 1]?.id ?? null);
    actions.moveCard(path, d.card.id, { column: drop.column, after });
    release();
  };
  const boardMenu = (event: MouseEvent) =>
    actions.menu(event, [
      { label: board.phasesOn ? t('board.phasesOff') : t('board.phasesOn'), run: () => actions.setPhasesOn(path, !board.phasesOn) },
      { label: t('board.addColumn'), run: () => actions.addColumn(path, t('board.newColumn'), 'active') },
    ]);

  return (
    <div className="bwrap">
    <section className="bv">
      <header className="th">
        <b>{name}</b>
        <span className="vsw" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'board'} onClick={() => setView('board')}>
            {t('board.viewBoard')}
          </button>
          <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>
            {t('board.viewList')}
          </button>
        </span>
        {waiting > 0 && <span className="wait">{t('board.toReview', { count: waiting })}</span>}
        <button type="button" className="ghost" onClick={boardMenu}>
          {t('board.more')}
        </button>
      </header>
      {board.phasesOn && view === 'board' && <PhaseStrip board={board} path={path} shown={shown} onShow={setShown} actions={actions} />}
      {shownPhase?.doneWhen && view === 'board' && (
        <p className="donewhen">
          <b>{t('board.doneWhen')}</b>
          {shownPhase.doneWhen}
        </p>
      )}
      {view === 'list' && <BoardList board={board} path={path} today={today} actions={actions} openCard={openCard} visible={() => true} />}
      {view === 'board' && (
      <div
        ref={columns}
        className="board"
        onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setDrop(null)}
      >
        {board.columns.map((column) => (
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
            onDragOver={onDragOver}
            onDrop={onDrop}
            openCard={openCard}
          />
        ))}
        <button type="button" className="colm-add" onClick={() => actions.addColumn(path, t('board.newColumn'), 'active')}>
          {t('board.addColumnRow')}
        </button>
      </div>
      )}
    </section>
    {open && <CardPanel key={open.id} board={board} path={path} card={open} today={today} actions={actions} onClose={onCloseCard} />}
    </div>
  );
}
