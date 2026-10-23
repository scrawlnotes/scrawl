import { type Board, type Card, type CollectionTemplate, dueCards, dueToday, keyOf, recordTitle, type Seen, type Task, type TaskFilter, type Template } from '@scrawlnotes/core';
import { type MessageKey, t } from '@scrawlnotes/i18n';
import type { MouseEvent } from 'react';
import { KINDS, type NewKind } from './dialogs';
import { StillOpening } from './Loading';
import { Icon } from './Icon';
import { boardWhere, collectionWhere, collectionPathOf, folderLabel, folderOf, iconOf, listWhere, nameOf, pathOf, seenText, spaceWhere } from './items';
import { dueClass, dueLabel, type DueSubtask, placeOf as subtaskPlace, subtaskRefOf, type TaskActions } from './Tasks';

// The main area while nothing is open, on a computer and on the web (PLAN 4.1, the Start page of
// design/mockups.html), in place of Create opening by itself. Create's kinds are on top, Recent and
// Today under them; while no space has anything in it yet, the kinds say what each is for, and the
// templates and an agent to connect take Recent's and Today's place. A phone has its own Recent.

/** How many of Recent and of Today are shown. */
const RECENT_SHOWN = 10;
const TODAY_SHOWN = 5;

// A collection is a form designed for whatever is kept in it, and says so here.
const KIND_TEXT: Partial<Record<NewKind, MessageKey>> = { collection: 'start.collectionText' };

const BOARD_STARTS: { template: Template; label: MessageKey; text: MessageKey }[] = [
  { template: 'crm', label: 'create.crm', text: 'start.crmText' },
  { template: 'software', label: 'create.software', text: 'start.softwareText' },
  { template: 'issues', label: 'create.issues', text: 'start.issuesText' },
];
const COLLECTION_STARTS: { template: CollectionTemplate; label: MessageKey; text: MessageKey }[] = [
  { template: 'companies', label: 'create.companies', text: 'create.companiesText' },
  { template: 'people', label: 'create.people', text: 'create.peopleText' },
  { template: 'feedback', label: 'create.feedback', text: 'create.feedbackText' },
  { template: 'payments', label: 'create.payments', text: 'create.paymentsText' },
];

/** Where something opened is: its folder, or its space and folder when it is in another space; nothing for a filter. */
function placeOf(id: string): string {
  const path = pathOf(id) ?? collectionPathOf(id);
  if (path === null) return '';
  const where = spaceWhere(path);
  if (where) return where;
  const folder = folderOf(id);
  return folder === null ? '' : folderLabel(folder);
}

type Due = { list: string; task: Task } | { board: string; card: Card } | DueSubtask;

export function StartPage({ empty, recent, titles, filters, lists, boards, today, actions, onKind, onTemplate, onApp, onOpen, onOpenTask, onOpenToday, onAgents, still = null }: {
  /** No space has anything in it yet. */
  empty: boolean;
  /** What was on screen last on this device and is still there, the latest first. */
  recent: Seen[];
  titles: Record<string, string>;
  filters: TaskFilter[];
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  actions: TaskActions;
  /** Opens Create at the kind's second step. */
  onKind: (kind: NewKind) => void;
  /** Opens Create for a board or a collection with the template chosen. */
  onTemplate: (start: { kind: 'board'; template: Template } | { kind: 'collection'; template: CollectionTemplate }) => void;
  /** Opens New app at its templates. */
  onApp: () => void;
  onOpen: (id: string) => void;
  /** Opens a task's list with the task shown in it. */
  onOpenTask: (list: string, id: string) => void;
  onOpenToday: () => void;
  /** Opens Settings › Agents. */
  onAgents: () => void;
  /** The spaces still read as the app opens, said under Today. */
  still?: string | null;
}) {
  const now = Date.now();
  return (
    <section className="start" aria-label={t('start.title')}>
      <div className="start-in">
        <div>
          <h2 className="start-h">{t('start.create')}</h2>
          <div className={empty ? 'start-kinds' : 'start-kinds row'}>
            {KINDS.map((kind) => {
              const text = KIND_TEXT[kind.kind] ?? kind.text;
              return (
                <button key={kind.kind} type="button" className="start-kind" title={!empty && text ? t(text) : undefined} onClick={() => onKind(kind.kind)}>
                  <Icon name={kind.icon} />
                  <b>{t(kind.label)}</b>
                  {empty && text && <small>{t(text)}</small>}
                </button>
              );
            })}
          </div>
        </div>
        {empty ? (
          <>
            <div>
              <h2 className="start-h">{t('start.templates')}</h2>
              <div className="start-tpls">
                <div>
                  <button type="button" className="start-tpl" onClick={onApp}>
                    <Icon name="app" />
                    <b>{t('create.app')}</b>
                    <small>{t('start.appText')}</small>
                  </button>
                  {BOARD_STARTS.map((start) => (
                    <button key={start.template} type="button" className="start-tpl" onClick={() => onTemplate({ kind: 'board', template: start.template })}>
                      <Icon name="board" />
                      <b>{t(start.label)}</b>
                      <small>{t(start.text)}</small>
                    </button>
                  ))}
                </div>
                <div>
                  {COLLECTION_STARTS.map((start) => (
                    <button key={start.template} type="button" className="start-tpl" onClick={() => onTemplate({ kind: 'collection', template: start.template })}>
                      <Icon name="collection" />
                      <b>{t(start.label)}</b>
                      <small>{t(start.text)}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="start-agent">
              <Icon name="agent" />
              <div>
                <b>{t('start.agent')}</b>
                <small>{t('start.agentText')}</small>
              </div>
              <button type="button" className="st-btn" onClick={onAgents}>
                {t('start.agentSetUp')}
              </button>
            </div>
          </>
        ) : (
          <div className="start-cols">
            <div>
              <h2 className="start-h">{t('start.recent')}</h2>
              {recent.length === 0 ? (
                <p className="start-none">{t('start.nothingOpened')}</p>
              ) : (
                recent.slice(0, RECENT_SHOWN).map(({ id, at }) => (
                  <button key={id} type="button" className="start-row" onClick={() => onOpen(id)}>
                    <Icon name={iconOf(id)} />
                    <span className="nm">
                      {nameOf(id, titles, filters)}
                      <span className="pl">{placeOf(id)}</span>
                    </span>
                    <span className="when">{seenText(at, now)}</span>
                  </button>
                ))
              )}
            </div>
            <StartToday lists={lists} boards={boards} today={today} actions={actions} onOpenTask={onOpenTask} onOpenToday={onOpenToday} still={still} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Today's first few, as Today orders them: the late tasks, today's, then the cards, then the subtasks of cards and records; each finished from its box. */
function StartToday({ lists, boards, today, actions, onOpenTask, onOpenToday, still }: {
  still: string | null;
  lists: Record<string, Task[]>;
  boards: Record<string, Board>;
  today: string;
  actions: TaskActions;
  onOpenTask: (list: string, id: string) => void;
  onOpenToday: () => void;
}) {
  const tasks = dueToday(lists, today);
  const due: Due[] = [
    ...tasks.overdue,
    ...tasks.today,
    ...dueCards(boards).filter((d) => d.card.due! <= today),
    ...actions.dueSubtasks().filter((d) => d.subtask.due! <= today),
  ];
  // A card on a board with more than one done column asks which, under its box.
  const finishCard = (event: MouseEvent<HTMLButtonElement>, board: string, card: Card) => {
    const done = boards[board]?.columns.filter((column) => column.kind === 'done') ?? [];
    if (done.length < 2) return actions.finishCard(board, card.id);
    const box = event.currentTarget.getBoundingClientRect();
    const under = { clientX: box.left, clientY: box.bottom + 4, preventDefault: () => event.preventDefault() } as MouseEvent;
    actions.menu(
      under,
      done.map((column) => ({ label: t('board.moveToColumn', { column: column.name }), run: () => actions.finishCard(board, card.id, column.id) })),
    );
  };
  // A day is said only when it is past: the rest are today's.
  const lateDay = (day: string | null | undefined) => day && day < today && <span className={dueClass(day, today)}>{dueLabel(day, today)}</span>;
  return (
    <div>
      <h2 className="start-h">
        {t('tasks.today')}
        {due.length > 0 && <small>{due.length}</small>}
      </h2>
      {due.length === 0 && <p className="start-none">{t('tasks.nothingToday')}</p>}
      {due.slice(0, TODAY_SHOWN).map((item) =>
        'subtask' in item ? (
          <div key={`${subtaskPlace(item)}~${item.subtask.id}`} className="start-task">
            <button
              type="button"
              className={`cb p${item.subtask.priority}`}
              role="checkbox"
              aria-checked={false}
              aria-label={t('tasks.complete', { name: item.subtask.title })}
              onClick={() => actions.completeSubtask(subtaskRefOf(item))}
            />
            <button
              type="button"
              className="tx"
              onClick={() => ('board' in item ? actions.openCard(item.board, item.card.id) : actions.openRecord(item.collection, item.record.id))}
            >
              <span className="tt">{item.subtask.title}</span>
              <span className="meta">
                {lateDay(item.subtask.due)}
                <span>
                  <Icon name="subtask" />
                  {'board' in item ? `${boards[item.board] ? keyOf(boards[item.board]!, item.card) : ''} ${item.card.title}`.trim() : recordTitle(item.record)}
                </span>
                <span>{'board' in item ? boardWhere(item.board) : collectionWhere(item.collection)}</span>
              </span>
            </button>
          </div>
        ) : 'task' in item ? (
          <div key={`${item.list}/${item.task.id}`} className="start-task">
            <button
              type="button"
              className={`cb p${item.task.priority}`}
              role="checkbox"
              aria-checked={false}
              aria-label={t('tasks.complete', { name: item.task.title })}
              onClick={() => actions.setDone(item.list, item.task.id, true)}
            />
            <button type="button" className="tx" onClick={() => onOpenTask(item.list, item.task.id)}>
              <span className="tt">{item.task.title}</span>
              <span className="meta">
                {lateDay(item.task.due)}
                <span>{listWhere(item.list)}</span>
              </span>
            </button>
          </div>
        ) : (
          <div key={`${item.board}#${item.card.id}`} className="start-task">
            <button
              type="button"
              className={`cb sq p${item.card.priority}`}
              role="checkbox"
              aria-checked={false}
              aria-label={t('tasks.finishCard', { name: item.card.title })}
              onClick={(event) => finishCard(event, item.board, item.card)}
            />
            <button type="button" className="tx" onClick={() => actions.openCard(item.board, item.card.id)}>
              <span className="tt">
                <span className="key">{keyOf(boards[item.board]!, item.card)}</span>
                {item.card.title}
              </span>
              <span className="meta">
                {lateDay(item.card.due)}
                <span>{boardWhere(item.board)}</span>
              </span>
            </button>
          </div>
        ),
      )}
      <button type="button" className="start-more" onClick={onOpenToday}>
        {t('start.openToday')}
        <Icon name="chevron" />
      </button>
      <StillOpening text={still} />
    </div>
  );
}
