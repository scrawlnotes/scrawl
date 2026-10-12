import {
  addDays,
  childrenOf,
  depthOf,
  MAX_DEPTH,
  parseCardRef,
  type Priority,
  progressOf,
  type Record as CollectionRecord,
  recordTitle,
  type Section,
  type Task,
  type TaskRecord,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { MenuHead, MenuItem, TaskPlaceChoice } from './dialogs';
import { Icon, type IconName } from './Icon';
import { collectionLabel, listLabel } from './items';
import { ActionSheet, Sheet, SheetClose } from './sheets';
import { dueClass, dueLabel, type TaskActions } from './Tasks';

// Tasks on a phone, after the Phone tasks views of design/mockups.html: a task opens as a sheet
// with everything about it; its date, its record and the list a new task goes in are picked in
// sheets; + types a new task above the keyboard, with its date, priority and record as chips.

const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const dayOfDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** The next Monday after `today`. */
const nextWeek = (today: string) => addDays(today, (8 - toDate(today).getDay()) % 7 || 7);
const weekday = (day: string) => toDate(day).toLocaleDateString(locale(), { weekday: 'short' });
const shortDay = (day: string) => toDate(day).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/** A priority's flag in its colour, and how it reads. */
const priorityLabel = (priority: Priority) => (priority === 4 ? t('tasks.noPriority') : `p${priority}`);

/** The priorities as an action sheet, the one set ticked. */
export const priorityItems = (current: Priority, pick: (priority: Priority) => void): MenuItem[] =>
  ([1, 2, 3, 4] as Priority[]).map((priority) => ({
    label: priority === 4 ? t('tasks.noPriority') : t('tasks.priorityN', { n: priority }),
    icon: 'flag',
    className: `p${priority}`,
    value: priority === current ? '✓' : undefined,
    run: () => pick(priority),
  }));

/** A text field as tall as what is written in it. */
function Growing({ value, className, placeholder, label, onChange }: { value: string; className: string; placeholder?: string; label: string; onChange: (value: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={field} rows={1} className={className} aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
  );
}

/**
 * A due date in a sheet: Today, Tomorrow, Next week and No date, each with its day, then the month
 * to pick any other. What is set is ticked.
 */
export function DateSheet({ title, current, today, onPick, onClose }: {
  /** What the date is for, under the sheet's name. */
  title: string;
  current: string | null;
  today: string;
  onPick: (day: string | null) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(() => {
    const date = toDate(current ?? today);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const pick = (day: string | null) => {
    onPick(day);
    onClose();
  };
  const quick = (icon: IconName, label: string, day: string | null, side: string) => (
    <button key={label} type="button" className="mb-row" onClick={() => pick(day)}>
      <Icon name={icon} />
      <span className="tx">
        <b>{label}</b>
      </span>
      <span className="wd">{side}</span>
      <Tick on={current === day} />
    </button>
  );
  // A week starts on Monday.
  const blanks = (month.getDay() + 6) % 7;
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  const initials = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }));
  return (
    <Sheet label={t('tasks.date')} className="mb-create mb-date" onClose={onClose}>
      <div className="mb-sh">
        <b>{t('tasks.date')}</b>
        <small>{title}</small>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-kinds">
        {quick('sun', t('day.today'), today, weekday(today))}
        {quick('rise', t('day.tomorrow'), addDays(today, 1), weekday(addDays(today, 1)))}
        {quick('week', t('tasks.nextWeek'), nextWeek(today), shortDay(nextWeek(today)))}
        {quick('noDate', t('tasks.noDate'), null, '')}
      </div>
      <div className="mb-cal">
        <div className="mh">
          {month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
          <span>
            <button type="button" aria-label={t('phone.previousMonth')} onClick={() => shift(-1)}>
              <Icon name="back" />
            </button>
            <button type="button" aria-label={t('phone.nextMonth')} onClick={() => shift(1)}>
              <Icon name="chevron" />
            </button>
          </span>
        </div>
        <div className="g">
          {initials.map((initial, i) => (
            <span key={`w${i}`} className="w">
              {initial}
            </span>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length }, (_, i) => {
            const day = dayOfDate(new Date(month.getFullYear(), month.getMonth(), i + 1));
            const classes = [day < today && 'past', day === today && 'today', day === current && 'on'].filter(Boolean).join(' ');
            return (
              <button key={day} type="button" className={classes || undefined} onClick={() => pick(day)}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

/** The record a task is about, found by name or code in a sheet; No record takes it away. A link field's names it by its own name. */
export function RecordSheet({ title = t('tasks.record'), current, choices, onPick, onClose }: {
  title?: string;
  current: TaskRecord | null;
  choices: { dir: string; records: CollectionRecord[] }[];
  onPick: (record: TaskRecord | null) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const q = typed.trim().toLowerCase();
  const groups = choices
    .map((choice) => ({ dir: choice.dir, records: choice.records.filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)).slice(0, 30) }))
    .filter((group) => group.records.length > 0);
  const pick = (record: TaskRecord | null) => {
    onPick(record);
    onClose();
  };
  return (
    <Sheet label={title} className="mb-create" onClose={onClose}>
      <div className="mb-sh">
        <b>{title}</b>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-form">
        <label className="mb-search">
          <Icon name="search" />
          <input aria-label={t('tasks.findRecord')} placeholder={t('tasks.findRecord')} enterKeyHint="search" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
        {current && (
          <div className="mb-group">
            <button type="button" className="mb-fr pick" onClick={() => pick(null)}>
              <Icon name="close" />
              <span className="in">{t('tasks.noRecord')}</span>
            </button>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.dir}>
            <div className="mb-cap">{collectionLabel(group.dir)}</div>
            <div className="mb-group">
              {group.records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="mb-fr pick"
                  onClick={() => pick({ collection: group.dir, id: record.id, name: record.name, ...(record.code && { code: record.code }) })}
                >
                  <Icon name="collection" />
                  <span className="in">
                    {recordTitle(record)}
                    {record.name && record.code && <small>{record.code}</small>}
                  </span>
                  <Tick on={current?.collection === group.dir && current.id === record.id} />
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="mb-hint">{t('collection.noRecords')}</p>}
      </div>
    </Sheet>
  );
}

/** A list or a section of it, picked in a sheet, found by typing; the one chosen is ticked. */
export function PlaceSheet({ places, current, onPick, onClose }: {
  places: TaskPlaceChoice[];
  current: { list: string; section: string | null };
  onPick: (place: TaskPlaceChoice) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const q = typed.trim().toLowerCase();
  const has = (text?: string) => (text ?? '').toLowerCase().includes(q);
  const listOf = (place: TaskPlaceChoice) => places.find((p) => p.list === place.list && p.section === null);
  const shown = places.filter((place) =>
    place.section === null
      ? has(place.label) || has(place.folder) || places.some((p) => p.list === place.list && has(p.label))
      : has(place.label) || has(listOf(place)?.label) || has(listOf(place)?.folder),
  );
  return (
    <Sheet label={t('moveTask.places')} className="mb-create" onClose={onClose}>
      <div className="mb-sh">
        <b>{t('moveTask.places')}</b>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-form">
        <label className="mb-search">
          <Icon name="search" />
          <input aria-label={t('moveTask.search')} placeholder={t('moveTask.search')} enterKeyHint="search" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
        <div className="mb-group">
          {shown.map((place) => (
            <button
              key={`${place.list}\n${place.section ?? ''}`}
              type="button"
              className={place.section === null ? 'mb-fr pick' : 'mb-fr pick sub'}
              onClick={() => {
                onPick(place);
                onClose();
              }}
            >
              {place.section === null && <Icon name="tasks" />}
              <span className="in">
                {place.label}
                {place.folder && <small>{place.folder}</small>}
              </span>
              <Tick on={place.list === current.list && place.section === current.section} />
            </button>
          ))}
          {shown.length === 0 && <p className="mb-fr none">{t('moveTask.none')}</p>}
        </div>
      </div>
    </Sheet>
  );
}

/** Where a task goes, as its row says it: its list, and its section after it. */
function placeLabel(places: TaskPlaceChoice[], list: string, section: string | null): string {
  const name = listLabel(list);
  const sectionName = section ? places.find((p) => p.list === list && p.section === section)?.label : undefined;
  return sectionName ? `${name} · ${sectionName}` : name;
}

/**
 * + on a phone: a new task typed above the keyboard, its description under it, its date,
 * priority and record as chips, and at the foot where it goes and Add. It stays for the next one.
 */
export function QuickAdd({ initial, places, today, recordChoices, recordName, onAdd, onClose }: {
  initial: { list: string; section: string | null; due: string | null };
  places: TaskPlaceChoice[];
  today: string;
  recordChoices: () => { dir: string; records: CollectionRecord[] }[];
  recordName: (record: TaskRecord) => string;
  onAdd: (list: string, task: { title: string; description?: string; section: string | null; due: string | null; priority: Priority; record: TaskRecord | null }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState(initial.due);
  const [priority, setPriority] = useState<Priority>(4);
  const [record, setRecord] = useState<TaskRecord | null>(null);
  const [place, setPlace] = useState({ list: initial.list, section: initial.section });
  const [picking, setPicking] = useState<'date' | 'priority' | 'record' | 'place' | null>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const add = (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim()) return;
    onAdd(place.list, { title, description: description.trim() || undefined, section: place.section, due, priority, record });
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
      <Sheet label={t('tasks.add')} className="mb-qa" onClose={onClose}>
        <form onSubmit={add}>
          <input
            ref={titleField}
            className="tt"
            aria-label={t('tasks.name')}
            placeholder={t('tasks.name')}
            autoFocus
            enterKeyHint="send"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            className="ds"
            aria-label={t('tasks.description')}
            placeholder={t('tasks.description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="mb-chips">
            {chip('calendar', due ? dueLabel(due, today) : t('tasks.date'), !!due, 'date', due ? dueClass(due, today) : undefined)}
            {chip('flag', priority === 4 ? t('tasks.priority') : priorityLabel(priority), priority !== 4, 'priority', `p${priority}`)}
            {chip('collection', record ? recordName(record) : t('tasks.record'), !!record, 'record')}
          </div>
          <div className="foot">
            <button type="button" className="where" onClick={() => setPicking('place')}>
              <Icon name="tasks" />
              <span>{placeLabel(places, place.list, place.section)}</span>
              <Icon name="chevron" />
            </button>
            <button type="submit" className="addb" disabled={!title.trim()}>
              {t('phone.add')}
            </button>
          </div>
        </form>
      </Sheet>
      {picking === 'date' && <DateSheet title={title.trim() || t('tasks.name')} current={due} today={today} onPick={setDue} onClose={() => setPicking(null)} />}
      {picking === 'priority' && <ActionSheet head={{ icon: 'flag', title: t('tasks.priority') }} items={priorityItems(priority, setPriority)} onClose={() => setPicking(null)} />}
      {picking === 'record' && <RecordSheet current={record} choices={recordChoices()} onPick={setRecord} onClose={() => setPicking(null)} />}
      {picking === 'place' && (
        <PlaceSheet places={places} current={place} onPick={(chosen) => setPlace({ list: chosen.list, section: chosen.section })} onClose={() => setPicking(null)} />
      )}
    </>
  );
}

/**
 * A task as a sheet: where it is, which opens Move to; its name and description, written in
 * place, with Cancel and Save at the top while they are changed; its date, priority, record and
 * the note or card it came from; its subtasks and Add subtask. ··· has what its row's menu has.
 */
export function TaskSheet({ list, task, tasks, sections, today, actions, subtask, onOpen, onClose }: {
  list: string;
  task: Task;
  tasks: Task[];
  sections: Section[];
  today: string;
  actions: TaskActions;
  /** A new subtask is typed in it at once. */
  subtask: boolean;
  /** Opens another task of the list, a subtask, in its place. */
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [adding, setAdding] = useState(subtask);
  const [newSub, setNewSub] = useState('');
  const changed = (title.trim() && title !== task.title) || description.trim() !== (task.description ?? '');
  const children = childrenOf(tasks, task.id);
  const progress = progressOf(tasks, task.id);
  const canNest = depthOf(tasks, task.id) < MAX_DEPTH;
  const section = task.parent === null && task.section ? sections.find((s) => s.id === task.section) : undefined;
  const head: MenuHead = { icon: 'tasks', title: task.title, sub: t('phone.taskIn', { list: listLabel(list) }) };
  const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

  const save = () => {
    const patch: { title?: string; description?: string } = {};
    if (title.trim() && title !== task.title) patch.title = title;
    if (description.trim() !== (task.description ?? '')) patch.description = description;
    if (Object.keys(patch).length > 0) actions.update(list, task.id, patch);
  };
  const discard = () => {
    setTitle(task.title);
    setDescription(task.description ?? '');
  };
  const priorityMenu = () => actions.menu(NO_POINTER, priorityItems(task.priority, (priority) => actions.update(list, task.id, { priority })), head);
  const more = () =>
    actions.menu(
      NO_POINTER,
      [
        ...(canNest ? [{ label: t('tasks.addSubtask'), icon: 'plus' as const, run: () => setAdding(true) }] : []),
        { label: t('tasks.dateMenu'), icon: 'calendar', run: () => actions.pickDate?.(list, task.id) },
        { label: t('tasks.priorityMenu'), icon: 'flag', run: priorityMenu },
        { label: t('tasks.recordMenu'), icon: 'collection', run: () => actions.pickRecord?.(list, task.id) },
        { label: t('tasks.moveTo'), icon: 'move', run: () => actions.moveTo(list, task.id) },
        { label: t('tasks.delete'), icon: 'trash', danger: true, run: () => actions.remove(list, task.id) },
      ],
      head,
    );
  const addSub = (event?: FormEvent) => {
    event?.preventDefault();
    if (!newSub.trim()) return;
    actions.add(list, { title: newSub, parent: task.id });
    setNewSub('');
  };
  const field = (icon: IconName, label: string, value: ReactNode, run: () => void) => (
    <button type="button" className="mb-fr" onClick={run}>
      <Icon name={icon} />
      <span className="fl">{label}</span>
      <span className="val">{value}</span>
    </button>
  );
  const noteName = task.note ? actions.noteTitle(task.note) : null;
  const cardKey = task.card ? actions.cardLabel(task.card) : null;

  return (
    <Sheet label={task.title} className="mb-create mb-tsheet" onClose={onClose}>
      {changed ? (
        <div className="mb-sh three">
          <button type="button" className="cancel" onClick={discard}>
            {t('dialog.cancel')}
          </button>
          <span />
          <button type="button" className="ok" onClick={save}>
            {t('card.save')}
          </button>
        </div>
      ) : (
        <div className="mb-sh">
          <button type="button" className="mb-crumb" onClick={() => actions.moveTo(list, task.id)}>
            <Icon name="tasks" />
            <span>{listLabel(list)}</span>
            {section && (
              <>
                <Icon name="chevron" />
                <span>{section.name}</span>
              </>
            )}
          </button>
          <button type="button" className="mb-x dots" aria-label={t('tasks.more')} title={t('tasks.more')} onClick={more}>
            <Icon name="more" />
          </button>
          <SheetClose onClose={onClose} />
        </div>
      )}
      <div className="mb-tbig">
        <button
          type="button"
          className={`cb p${task.priority}`}
          role="checkbox"
          aria-checked={task.done}
          aria-label={t(task.done ? 'tasks.reopen' : 'tasks.complete', { name: task.title })}
          onClick={() => actions.setDone(list, task.id, !task.done)}
        />
        <div className="tx">
          <Growing className="tt" label={t('tasks.title')} value={title} onChange={setTitle} />
          <Growing className="ds" label={t('tasks.description')} placeholder={t('tasks.description')} value={description} onChange={setDescription} />
        </div>
      </div>
      <div className="mb-form">
        <div className="mb-group">
          {field(
            'calendar',
            t('tasks.date'),
            task.due ? <span className={dueClass(task.due, today)}>{dueLabel(task.due, today)}</span> : <span className="none">{t('phone.none')}</span>,
            () => actions.pickDate?.(list, task.id),
          )}
          {field(
            'flag',
            t('tasks.priority'),
            task.priority === 4 ? (
              <span className="none">{t('phone.none')}</span>
            ) : (
              <span className={`prio p${task.priority}`}>
                <Icon name="flag" />
                {priorityLabel(task.priority)}
              </span>
            ),
            priorityMenu,
          )}
          {field(
            'collection',
            t('tasks.record'),
            task.record ? actions.recordTitle(task.record) : <span className="none">{t('phone.none')}</span>,
            () => actions.pickRecord?.(list, task.id),
          )}
          {task.note &&
            field('note', t('phone.from'), <span className="lnk">{noteName ?? task.note}</span>, () => {
              if (noteName === null) return;
              onClose();
              actions.openNote(task.note!);
            })}
          {task.card &&
            field('board', t('phone.card'), <span className="lnk">{cardKey ?? '?'}</span>, () => {
              const ref = parseCardRef(task.card!);
              if (cardKey === null || !ref) return;
              onClose();
              actions.openCard(ref.board, ref.id);
            })}
        </div>
        {(children.length > 0 || canNest) && (
          <>
            <div className="mb-cap">{progress.total > 0 ? t('phone.subtasksDone', { done: progress.done, total: progress.total }) : t('phone.subtasks')}</div>
            <div className="mb-group">
              {children.map((child) => (
                <div key={child.id} className={child.done ? 'mb-fr sub done' : 'mb-fr sub'}>
                  <button
                    type="button"
                    className={`cb p${child.priority}`}
                    role="checkbox"
                    aria-checked={child.done}
                    aria-label={t(child.done ? 'tasks.reopen' : 'tasks.complete', { name: child.title })}
                    onClick={() => actions.setDone(list, child.id, !child.done)}
                  />
                  <button type="button" className="in" onClick={() => onOpen(child.id)}>
                    {child.title}
                  </button>
                </div>
              ))}
              {canNest &&
                (adding ? (
                  <form className="mb-fr add-sub" onSubmit={addSub}>
                    <input
                      className="in"
                      autoFocus
                      enterKeyHint="send"
                      aria-label={t('tasks.subtaskName')}
                      placeholder={t('tasks.subtaskName')}
                      value={newSub}
                      onChange={(event) => setNewSub(event.target.value)}
                    />
                    <button type="submit" className="go" disabled={!newSub.trim()}>
                      {t('phone.add')}
                    </button>
                  </form>
                ) : (
                  <button type="button" className="mb-fr add" onClick={() => setAdding(true)}>
                    <Icon name="plus" />
                    <span className="in">{t('tasks.addSubtask')}</span>
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
