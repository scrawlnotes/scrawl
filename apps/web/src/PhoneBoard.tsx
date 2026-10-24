import { type Board, type Card, columnCards, type Column, type NewCard, type Phase, phaseProgress, type Priority } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type CSSProperties, type FormEvent, useRef, useState } from 'react';
import { LabelSheet } from './labels';
import { Icon, type IconName } from './Icon';
import { DateSheet, priorityItems } from './PhoneTasks';
import { ActionSheet, Sheet, SheetClose, useAdded } from './sheets';
import { dueClass, dueLabel } from './Tasks';

// A board on a phone, after the Phone board views of design/mockups.html: its columns as tabs
// above one column at a time; a card's column, labels and phase picked in sheets; + types a card
// for the column on screen above the keyboard, with its priority, labels, due day and phase as
// chips.

/** A column's kind as a small square in its colour. */
export const KindMark = ({ kind }: { kind: Column['kind'] }) => <i className={`mb-k ${kind}`} aria-hidden="true" />;

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/** The columns as tabs, each with its kind and how many cards it shows; a tap goes to it. */
export function ColumnTabs({ columns, counts, current, onPick }: {
  columns: Column[];
  counts: Record<string, number>;
  current: number;
  onPick: (index: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  return (
    <div ref={strip} className="mb-ctabs" role="tablist">
      {columns.map((column, i) => (
        <button
          key={column.id}
          type="button"
          role="tab"
          aria-selected={i === current}
          className={i === current ? 'mb-ct on' : 'mb-ct'}
          ref={(element) => {
            // The tab of the column on screen stays in sight.
            if (element && i === current) element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }}
          onClick={() => onPick(i)}
        >
          <KindMark kind={column.kind} />
          {column.name}
          <small>{counts[column.id] ?? 0}</small>
        </button>
      ))}
    </div>
  );
}

/** A card's column, picked in a sheet: each column with its kind and count, the one it is in ticked. */
export function StatusSheet({ board, title, current, onPick, onClose }: {
  board: Board;
  /** What the column is picked for, beside the sheet's name: a card's key. */
  title: string;
  current: string;
  onPick: (column: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={t('card.status')} className="mb-create" onClose={onClose}>
      <div className="mb-sh">
        <b>{t('card.status')}</b>
        <small>{title}</small>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-form">
        <div className="mb-group">
          {board.columns.map((column) => (
            <button
              key={column.id}
              type="button"
              className="mb-fr pick"
              onClick={() => {
                if (column.id !== current) onPick(column.id);
                onClose();
              }}
            >
              <KindMark kind={column.kind} />
              <span className="in">
                {column.name}
                <small>{columnCards(board, column.id).length}</small>
              </span>
              <Tick on={column.id === current} />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** A card's phase, picked in a sheet: the open phases and the closed ones, and No phase. */
export function PhaseSheet({ board, current, onPick, onClose }: {
  board: Board;
  current: string | null;
  onPick: (phase: string | null) => void;
  onClose: () => void;
}) {
  const row = (phase: Phase | null) => (
    <button
      key={phase?.id ?? 'none'}
      type="button"
      className="mb-fr pick"
      onClick={() => {
        onPick(phase?.id ?? null);
        onClose();
      }}
    >
      <Icon name={phase?.state === 'done' ? 'check' : 'phase'} />
      <span className="in">
        {phase ? phase.name : t('list.noPhase')}
        {phase && <small>{t('board.progress', phaseProgress(board, phase.id))}</small>}
      </span>
      <Tick on={(phase?.id ?? null) === current} />
    </button>
  );
  return (
    <Sheet label={t('card.phase')} className="mb-create" onClose={onClose}>
      <div className="mb-sh">
        <b>{t('card.phase')}</b>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-form">
        <div className="mb-group">
          {board.phases.filter((phase) => phase.state !== 'done').map(row)}
          {row(null)}
        </div>
        {board.phases.some((phase) => phase.state === 'done') && (
          <>
            <div className="mb-cap">{t('board.closedList')}</div>
            <div className="mb-group">{board.phases.filter((phase) => phase.state === 'done').reverse().map(row)}</div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * + on a board: a card typed above the keyboard for the column on screen, its description under
 * it, its priority, labels, due day and phase as chips, and at the foot its column and Add. It
 * stays for the next one, as the columns' own add row does.
 */
export function CardQuickAdd({ board, path, column, phase, today, onAdd, onClose }: {
  board: Board;
  path: string;
  column: string;
  phase: string | null | undefined;
  today: string;
  onAdd: (card: NewCard) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(4);
  const [labels, setLabels] = useState<string[]>([]);
  const [due, setDue] = useState<string | null>(null);
  const [cardPhase, setCardPhase] = useState<string | null | undefined>(phase);
  const [where, setWhere] = useState(column);
  const [picking, setPicking] = useState<'priority' | 'labels' | 'due' | 'phase' | 'column' | null>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const added = useAdded();
  const shownColumn = board.columns.find((c) => c.id === where) ?? board.columns[0]!;
  const phaseName = cardPhase ? board.phases.find((p) => p.id === cardPhase)?.name : undefined;
  const add = (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title,
      column: shownColumn.id,
      ...(cardPhase !== undefined && { phase: cardPhase }),
      ...(description.trim() && { description }),
      ...(priority !== 4 && { priority }),
      ...(labels.length > 0 && { labels }),
      ...(due && { due }),
    });
    added.say(t('phone.addedTo', { name: title.trim(), place: shownColumn.name }));
    setTitle('');
    setDescription('');
    titleField.current?.focus();
  };
  const chip = (icon: IconName, label: string, set: boolean, kind: typeof picking, className?: string) => (
    <button type="button" className={['mb-chip', set && 'set', className].filter(Boolean).join(' ')} onClick={() => setPicking(kind)}>
      <Icon name={icon} />
      {label}
    </button>
  );
  return (
    <>
      <Sheet label={t('board.addCard')} className="mb-qa" toast={added.line} onClose={onClose}>
        <form onSubmit={add}>
          <input
            ref={titleField}
            className="tt"
            aria-label={t('board.cardName')}
            placeholder={t('board.cardName')}
            autoFocus
            enterKeyHint="send"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input className="ds" aria-label={t('tasks.description')} placeholder={t('tasks.description')} value={description} onChange={(event) => setDescription(event.target.value)} />
          <div className="mb-chips">
            {chip('flag', priority === 4 ? t('tasks.priority') : `p${priority}`, priority !== 4, 'priority', `p${priority}`)}
            {chip('tag', labels.length > 0 ? labels.join(', ') : t('card.labels'), labels.length > 0, 'labels')}
            {chip('calendar', due ? dueLabel(due, today) : t('card.due'), !!due, 'due', due ? dueClass(due, today) : undefined)}
            {board.phasesOn && chip('phase', phaseName ?? t('card.phase'), !!phaseName, 'phase')}
          </div>
          <div className="foot">
            <button type="button" className="where" onClick={() => setPicking('column')}>
              <KindMark kind={shownColumn.kind} />
              <span>{shownColumn.name}</span>
              <Icon name="chevron" />
            </button>
            <button type="submit" className="addb" disabled={!title.trim()}>
              {t('phone.add')}
            </button>
          </div>
        </form>
      </Sheet>
      {picking === 'priority' && (
        <ActionSheet head={{ icon: 'flag', title: t('tasks.priority') }} items={priorityItems(priority, setPriority)} onClose={() => setPicking(null)} />
      )}
      {picking === 'labels' && <LabelSheet path={path} about={title.trim() || undefined} labels={labels} onChange={setLabels} onClose={() => setPicking(null)} />}
      {picking === 'due' && <DateSheet title={title.trim() || t('board.cardName')} current={due} today={today} onPick={setDue} onClose={() => setPicking(null)} />}
      {picking === 'phase' && <PhaseSheet board={board} current={cardPhase ?? null} onPick={setCardPhase} onClose={() => setPicking(null)} />}
      {picking === 'column' && <StatusSheet board={board} title={t('board.addCard')} current={shownColumn.id} onPick={setWhere} onClose={() => setPicking(null)} />}
    </>
  );
}

/** What a card's hold opens on a phone, as its row of a list does: what it is and its actions. */
export const cardHead = (_board: Board, card: Card, key: string, boardName: string) => ({
  icon: 'board' as const,
  title: `${key} ${card.title}`,
  sub: t('phone.cardIn', { board: boardName }),
});

/** Who a card is on, typed in a sheet: Cancel, Save, and the name. Empty is nobody. */
export function AssigneeSheet({ value, onSave, onClose }: { value: string; onSave: (value: string | null) => void; onClose: () => void }) {
  const [name, setName] = useState(value);
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    onSave(name.trim() || null);
    onClose();
  };
  return (
    <Sheet label={t('card.assignee')} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('card.assignee')}</b>
        <button type="button" className="ok" onClick={() => save()}>
          {t('card.save')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group">
          <label className="mb-fr">
            <input className="in" autoFocus enterKeyHint="done" aria-label={t('card.assignee')} placeholder={t('card.unassigned')} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
      </form>
    </Sheet>
  );
}
