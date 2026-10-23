import {
  addDays,
  childrenOf,
  depthOf,
  listName,
  MAX_DEPTH,
  parseCardRef,
  type Priority,
  progressOf,
  type Record as CollectionRecord,
  recordTitle,
  type Section,
  spaceOf,
  type Task,
  type TaskRecord,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type ReactNode, useRef, useState } from 'react';
import { type DescriptionHost, DescriptionField } from './Description';
import { listCrumb, type MenuHead, type MenuItem, placesShown, type TaskPlaceChoice } from './dialogs';
import { LabelChip, LabelSheet, useAtLabels } from './labels';
import { Icon, type IconName } from './Icon';
import { collectionLabel, listLabel, spaceLabel } from './items';
import { MonthGrid, useMonth } from './MonthGrid';
import { hasTaskActivity, TaskEntries } from './Activity';
import { NameOf, WhoOf } from './People';
import { ActionSheet, Sheet, SheetClose, useAdded } from './sheets';
import { dueClass, dueLabel, type TaskActions, TitleField } from './Tasks';

// Tasks on a phone, after the Phone tasks views of design/mockups.html: a task opens as a sheet
// with everything about it; its date, its record and the list a new task goes in are picked in
// sheets; + types a new task above the keyboard, with its date, priority and record as chips.

const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
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
    flag: priority,
    value: priority === current ? '✓' : undefined,
    run: () => pick(priority),
  }));

/**
 * A due date in a sheet: Today, Tomorrow, Next week and No date, each with its day, then the month
 * to pick any other. What is set is ticked.
 */
export function DateSheet({ label = t('tasks.date'), title, current, today, onPick, onClose }: {
  /** The sheet's name: Date, or the field's. */
  label?: string;
  /** What the date is for, under the sheet's name. */
  title: string;
  current: string | null;
  today: string;
  onPick: (day: string | null) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useMonth(current ?? today);
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
  return (
    <Sheet label={label} className="mb-create mb-date" onClose={onClose}>
      <div className="mb-sh">
        <b>{label}</b>
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
        <MonthGrid month={month} onMonth={setMonth} today={today} current={current} onPick={pick} />
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

/**
 * A list or a section of it, picked in a sheet, found by typing; the one chosen is ticked. Each
 * space's lists are under its name, the personal space's first with Inbox at their top, and a list
 * shows the folders it is in, so that two of the same name are told apart.
 */
export function PlaceSheet({ places, current, onPick, onClose }: {
  places: TaskPlaceChoice[];
  current: { list: string; section: string | null };
  onPick: (place: TaskPlaceChoice) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const shown = placesShown(places, typed);
  const groups = [...new Set(shown.map((place) => spaceOf(place.list)))].map((space) => ({ space, places: shown.filter((place) => spaceOf(place.list) === space) }));
  const row = (place: TaskPlaceChoice) => {
    const crumb = place.section === null ? listCrumb(place.list) : '';
    return (
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
          {place.section === null ? listName(place.list) : place.label}
          {crumb && <small>{crumb}</small>}
        </span>
        <Tick on={place.list === current.list && place.section === current.section} />
      </button>
    );
  };
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
        {groups.map((group) => (
          <div key={group.space ?? ''}>
            <div className="mb-cap">{spaceLabel(group.space)}</div>
            <div className="mb-group">{group.places.map(row)}</div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="mb-group">
            <p className="mb-fr none">{t('moveTask.none')}</p>
          </div>
        )}
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
/**
 * A section's name on a phone, new or to rename, in a sheet of its own: the name the whole width,
 * Cancel on the left and Add or Save on the right, over the keyboard.
 */
export function SectionSheet({ list, start, onSave, onClose }: { list: string; start: string | null; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(start ?? '');
  const title = start === null ? t('sections.new') : t('sections.rename');
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
  };
  return (
    <Sheet label={title} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{title}</b>
        <button type="button" className="ok" disabled={!name.trim() || name.trim() === start} onMouseDown={(event) => event.preventDefault()} onClick={() => save()}>
          {start === null ? t('phone.add') : t('sections.save')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group">
          <label className="mb-fr">
            <input className="in" autoFocus enterKeyHint="done" aria-label={t('sections.name')} placeholder={t('sections.name')} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
        <p className="mb-hint">{t('phone.sectionIn', { list: listLabel(list) })}</p>
      </form>
    </Sheet>
  );
}

export function QuickAdd({ initial, places, today, recordChoices, recordName, description: host, onAdd, onClose }: {
  initial: { list: string; section: string | null; due: string | null };
  places: TaskPlaceChoice[];
  today: string;
  recordChoices: () => { dir: string; records: CollectionRecord[] }[];
  recordName: (record: TaskRecord) => string;
  description: DescriptionHost;
  onAdd: (list: string, task: { title: string; description?: string; section: string | null; due: string | null; priority: Priority; record: TaskRecord | null; labels?: string[] }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState(initial.due);
  const [priority, setPriority] = useState<Priority>(4);
  const [record, setRecord] = useState<TaskRecord | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [place, setPlace] = useState({ list: initial.list, section: initial.section });
  const [picking, setPicking] = useState<'date' | 'priority' | 'labels' | 'record' | 'place' | null>(null);
  const added = useAdded();
  // The description's editor is made anew once a task is added, and for a list in another space.
  const [count, setCount] = useState(0);
  const titleField = useRef<HTMLTextAreaElement>(null);
  const at = useAtLabels({ path: place.list, field: titleField, value: title, onValue: setTitle, picked: labels, onPick: (name) => setLabels((now) => [...now, name]), inline: true });
  const add = (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim()) return;
    onAdd(place.list, { title, description: description.trim() || undefined, section: place.section, due, priority, record, ...(labels.length > 0 && { labels }) });
    setLabels([]);
    added.say(t('phone.addedTo', { name: title.trim(), place: placeLabel(places, place.list, place.section) }));
    setTitle('');
    setDescription('');
    setCount((n) => n + 1);
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
          {added.line}
          <TitleField
            ref={titleField}
            className="tt"
            aria-label={t('tasks.name')}
            placeholder={t('tasks.name')}
            autoFocus
            enterKeyHint="send"
            value={title}
            onChange={setTitle}
            onSelect={at.track}
            onKeyDown={(event) => {
              if (at.keyDown(event)) return;
              if (event.key === 'Enter') add();
            }}
          />
          {at.list}
          <DescriptionField
            key={`${spaceOf(place.list) ?? ''}:${count}`}
            home={place.list}
            value={description}
            hint={t('tasks.description')}
            host={host}
            onChange={setDescription}
          />
          <div className="mb-chips">
            {chip('calendar', due ? dueLabel(due, today) : t('tasks.date'), !!due, 'date', due ? dueClass(due, today) : undefined)}
            {chip('flag', priority === 4 ? t('tasks.priority') : priorityLabel(priority), priority !== 4, 'priority', `p${priority}`)}
            {chip('tag', labels.length > 0 ? labels.join(', ') : t('tasks.labels'), labels.length > 0, 'labels')}
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
      {picking === 'labels' && <LabelSheet path={place.list} about={title.trim() || undefined} labels={labels} onChange={setLabels} onClose={() => setPicking(null)} />}
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
  // Discard puts the description's editor back as the task has it.
  const [resets, setResets] = useState(0);
  const [adding, setAdding] = useState(subtask);
  const [newSub, setNewSub] = useState('');
  const [labeling, setLabeling] = useState(false);
  const titleField = useRef<HTMLTextAreaElement>(null);
  const labels = task.labels ?? [];
  const at = useAtLabels({ path: list, field: titleField, value: title, onValue: setTitle, picked: labels, onPick: (name) => actions.update(list, task.id, { labels: [...labels, name] }), inline: true });
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
    setResets((n) => n + 1);
  };
  const priorityMenu = () => actions.menu(NO_POINTER, priorityItems(task.priority, (priority) => actions.update(list, task.id, { priority })), head);
  // In a space with people a task is given to one of them; the personal space has only the user.
  const team = actions.people?.(list) ?? null;
  const more = () =>
    actions.menu(
      NO_POINTER,
      [
        ...(canNest ? [{ label: t('tasks.addSubtask'), icon: 'plus' as const, run: () => setAdding(true) }] : []),
        { label: t('tasks.dateMenu'), icon: 'calendar', run: () => actions.pickDate?.(list, task.id) },
        { label: t('tasks.priorityMenu'), icon: 'flag', run: priorityMenu },
        { label: t('tasks.labelsMenu'), icon: 'tag', run: () => setLabeling(true) },
        ...(team ? [{ label: t('tasks.assignMenu'), icon: 'person' as const, run: () => actions.pickAssignee?.(list, task.id) }] : []),
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
    <>
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
          onClick={() => {
            actions.setDone(list, task.id, !task.done);
            // Completed, it goes, as in a list: Task completed and Undo show over the page.
            if (!task.done) onClose();
          }}
        />
        <div className="tx">
          <TitleField ref={titleField} className="tt" aria-label={t('tasks.title')} value={title} onChange={setTitle} onSelect={at.track} onKeyDown={(event) => void at.keyDown(event)} />
          {at.list}
          <DescriptionField key={`${task.id}:${resets}`} home={list} value={description} hint={t('tasks.description')} host={actions.description} onChange={setDescription} />
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
            'tag',
            t('tasks.labels'),
            labels.length > 0 ? (
              <span className="lbls">
                {labels.map((name) => (
                  <LabelChip key={name} path={list} name={name} className="mb-lbl" />
                ))}
              </span>
            ) : (
              <span className="none">{t('phone.none')}</span>
            ),
            () => setLabeling(true),
          )}
          {team &&
            field(
              'person',
              t('tasks.assignee'),
              task.assignee ? (
                <>
                  <WhoOf who={task.assignee} people={team.people} />
                  <span className="tx">
                    <NameOf who={task.assignee} people={team.people} first />
                  </span>
                </>
              ) : (
                <span className="none">{t('people.nobody')}</span>
              ),
              () => actions.pickAssignee?.(list, task.id),
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
                    // A subtask is ticked where it is, in sight: no Undo over the sheet.
                    onClick={() => actions.setDone(list, child.id, !child.done, true)}
                  />
                  <button type="button" className="in" onClick={() => onOpen(child.id)}>
                    {child.title}
                  </button>
                </div>
              ))}
              {canNest &&
                (adding ? (
                  <form className="mb-fr add-sub" onSubmit={addSub}>
                    <TitleField
                      className="in"
                      autoFocus
                      enterKeyHint="send"
                      aria-label={t('tasks.subtaskName')}
                      placeholder={t('tasks.subtaskName')}
                      value={newSub}
                      onChange={setNewSub}
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
        {hasTaskActivity(task) && (
          <>
            <div className="mb-cap">{t('tasks.activity')}</div>
            <div className="mb-group mb-act tlog">
              <TaskEntries task={task} team={team} today={today} />
            </div>
          </>
        )}
      </div>
    </Sheet>
      {labeling && <LabelSheet path={list} about={task.title} labels={labels} onChange={(next) => actions.update(list, task.id, { labels: next })} onClose={() => setLabeling(false)} />}
    </>
  );
}
