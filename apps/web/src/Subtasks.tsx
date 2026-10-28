import { addDays, addSubtask, moveSubtask, type PersonRef, type Priority, removeSubtask, type Subtask, type SubtaskPatch, subtaskProgress, updateSubtask } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type DragEvent, type FormEvent, type MouseEvent, type PointerEvent, useRef, useState } from 'react';
import { isPhone } from './device';
import type { MenuHead, MenuItem } from './dialogs';
import { Icon } from './Icon';
import { AssigneeChip, assigneeLabel, PersonPicker, type SpacePeople } from './People';
import { PeopleSheet } from './PhoneSpaces';
import { DateSheet, priorityItems } from './PhoneTasks';
import { Composer, dueClass, dueLabel, Grip, IconButton, nextWeek, TitleField } from './Tasks';
import { holdToDrag } from './touchDrag';

// A card's or a record's own subtasks, after the task rows of a list: one level, a box, the title,
// its day and who it is given to; each changed in place, dragged into another order, ticked off.
// The open ones come first in their order, the done ones under Show completed. A card saves them as
// they change; a record's form keeps them with the rest of what is typed, saved by its Save.

export interface SubtasksProps {
  list: Subtask[];
  /** Changes the list. */
  change: (fn: (list: Subtask[]) => Subtask[]) => void;
  /** Ticks one off where that is saved at once, saying so with Undo; without it ticking off is a change like the others. */
  complete?: (id: string) => void;
  /** Where taking one off is saved at once: says so, with what puts it back for Undo. */
  removed?: (undo: () => void) => void;
  /** The people of the space, to give a subtask to; null in the personal space, where none is given. */
  team: SpacePeople | null;
  today: string;
  /** Opens a menu at the pointer; on a phone an action sheet. */
  menu: (event: MouseEvent, items: MenuItem[], head?: MenuHead) => void;
  /** Where it is: a card panel's section, or an element of a record's screen. */
  place: 'card' | 'record';
  /** On a phone, in a sheet's form, whose parts are set in from its edges already. */
  inSheet?: boolean;
  /** What they are called where they are, and the line that adds one: a goal's Steps, + Add step. */
  title?: string;
  add?: string;
}

/** On a phone, a sheet opened for a subtask: its day or who it is given to. */
type Picking = { id: string; what: 'date' | 'person' };

const NO_POINTER = { preventDefault: () => undefined, clientX: 0, clientY: 0 } as unknown as MouseEvent;

export function Subtasks(props: SubtasksProps) {
  return isPhone() ? <PhoneSubtasks {...props} /> : <DesktopSubtasks {...props} />;
}

/** What each subtask's menu and buttons do, the same on a phone and a desktop. */
function useSubtaskActions({ change, complete, removed, today }: SubtasksProps) {
  const update = (id: string, patch: SubtaskPatch) => change((list) => updateSubtask(list, id, patch));
  const toggle = (subtask: Subtask) => (!subtask.done && complete ? complete(subtask.id) : update(subtask.id, { done: !subtask.done }));
  const remove = (id: string) => {
    let gone: { subtask: Subtask; at: number } | null = null;
    change((list) => {
      const at = list.findIndex((s) => s.id === id);
      if (at >= 0) gone = { subtask: list[at]!, at };
      return removeSubtask(list, id);
    });
    const taken = gone as { subtask: Subtask; at: number } | null;
    if (taken && removed) removed(() => change((list) => (list.some((s) => s.id === taken.subtask.id) ? list : [...list.slice(0, taken.at), taken.subtask, ...list.slice(taken.at)])));
  };
  const dateItems = (subtask: Subtask, pick: () => void): MenuItem[] => [
    { label: t('day.today'), run: () => update(subtask.id, { due: today }) },
    { label: t('day.tomorrow'), run: () => update(subtask.id, { due: addDays(today, 1) }) },
    { label: t('tasks.nextWeek'), run: () => update(subtask.id, { due: nextWeek(today) }) },
    { label: t('tasks.pickDate'), run: pick },
    ...(subtask.due ? [{ label: t('tasks.noDate'), run: () => update(subtask.id, { due: null }) }] : []),
  ];
  const priorities = (subtask: Subtask) => priorityItems(subtask.priority, (priority: Priority) => update(subtask.id, { priority }));
  return { update, toggle, remove, dateItems, priorities };
}

/** The count of a list's subtasks done, for the head of the list. */
function Progress({ list }: { list: Subtask[] }) {
  const { done, total } = subtaskProgress(list);
  if (total === 0) return null;
  return <small title={t('subtasks.progressTitle', { done, total })}>{t('subtasks.progress', { done, total })}</small>;
}

/** How many of a card's subtasks are done, on its face and its row: 2/5, with a tick once all are. */
export function SubtaskCount({ list }: { list: Subtask[] }) {
  const progress = subtaskProgress(list);
  return (
    <span className={progress.done === progress.total ? 'stk-count all' : 'stk-count'} title={t('subtasks.progressTitle', progress)}>
      <Icon name="subtask" />
      {t('subtasks.progress', progress)}
    </span>
  );
}

// ---------- desktop ----------

/** Where a dragged subtask would go: before this one, or at the end with null. */
type Drop = { before: string | null; line: string | null };

function DesktopSubtasks(props: SubtasksProps) {
  const { list, change, team, today, menu, place } = props;
  const act = useSubtaskActions(props);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [assigning, setAssigning] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const pickers = useRef(new Map<string, HTMLInputElement>());

  const open = list.filter((s) => !s.done);
  const done = list.filter((s) => s.done);

  const save = () => {
    if (!editing) return;
    if (editing.title.trim()) act.update(editing.id, { title: editing.title });
    setEditing(null);
  };
  const dateMenu = (event: MouseEvent, subtask: Subtask) => menu(event, act.dateItems(subtask, () => pickers.current.get(subtask.id)?.showPicker()));
  const priorityMenu = (event: MouseEvent, subtask: Subtask) => menu(event, act.priorities(subtask));
  const rowMenu = (event: MouseEvent, subtask: Subtask) => {
    const point = { clientX: event.clientX, clientY: event.clientY, preventDefault: () => undefined } as MouseEvent;
    const anchor = event.currentTarget as HTMLElement;
    menu(event, [
      { label: t('tasks.dateMenu'), run: () => dateMenu(point, subtask) },
      { label: t('tasks.priorityMenu'), run: () => priorityMenu(point, subtask) },
      ...(team ? [{ label: t('tasks.assignMenu'), run: () => setAssigning({ id: subtask.id, anchor }) }] : []),
      { label: t('tasks.delete'), run: () => act.remove(subtask.id) },
    ]);
  };

  // An open subtask is dragged by its handle among the open ones; where it would go shows as a line.
  const over = (event: DragEvent<HTMLElement>, index: number) => {
    if (!dragging) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    const before = after ? (open[index + 1]?.id ?? null) : open[index]!.id;
    setDrop({ before, line: after ? open[index]!.id : `^${open[index]!.id}` });
  };
  const dropHere = (event: DragEvent) => {
    event.preventDefault();
    if (dragging && drop) {
      const id = dragging;
      // Before the next open one; at the end of the open ones, before the first done one.
      const before = drop.before ?? done[0]?.id ?? null;
      change((current) => moveSubtask(current, id, before));
    }
    setDragging(null);
    setDrop(null);
  };

  const row = (subtask: Subtask, index: number) => {
    const isEditing = editing?.id === subtask.id;
    const lineClass = drop?.line === `^${subtask.id}` ? ' drop-above' : drop?.line === subtask.id ? ' drop-below' : '';
    const className = `task stk${subtask.done ? ' done' : ''}${isEditing ? ' editing' : ''}${dragging === subtask.id ? ' lifted' : ''}${lineClass}`;
    const meta = (subtask.due || subtask.assignee) && (
      <div className="meta">
        {subtask.due && (
          <button type="button" className={dueClass(subtask.due, today)} title={t('tasks.changeDate')} onClick={(event) => dateMenu(event, subtask)}>
            {dueLabel(subtask.due, today)}
          </button>
        )}
        {subtask.assignee && <AssigneeChip assignee={subtask.assignee} people={team?.people} />}
      </div>
    );
    return (
      <div
        key={subtask.id}
        className={className}
        onContextMenu={isEditing ? undefined : (event) => rowMenu(event, subtask)}
        onDragOver={subtask.done ? undefined : (event) => over(event, index)}
        onDrop={subtask.done ? undefined : dropHere}
        onBlur={isEditing ? (event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && save() : undefined}
      >
        {!subtask.done && !isEditing && (
          <Grip
            title={t('tasks.drag')}
            onGrab={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', subtask.title);
              setDragging(subtask.id);
            }}
            onRelease={() => {
              setDragging(null);
              setDrop(null);
            }}
          />
        )}
        <button
          type="button"
          className={`cb p${subtask.priority}`}
          role="checkbox"
          aria-checked={subtask.done}
          aria-label={t(subtask.done ? 'tasks.reopen' : 'tasks.complete', { name: subtask.title })}
          onClick={() => act.toggle(subtask)}
        />
        {isEditing ? (
          <>
            <div className="task-body">
              <TitleField
                className="tt-edit"
                aria-label={t('tasks.subtaskName')}
                autoFocus
                value={editing.title}
                onChange={(title) => setEditing({ id: subtask.id, title })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    save();
                  } else if (event.key === 'Escape') {
                    // The row closes; what it is in stays.
                    event.preventDefault();
                    event.stopPropagation();
                    setEditing(null);
                  }
                }}
              />
              {meta}
            </div>
            <div className="edit-foot">
              <button type="button" className="ghost" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing(null)}>
                {t('dialog.cancel')}
              </button>
            </div>
          </>
        ) : (
          <div className="task-body">
            <button type="button" className="tt" onClick={() => setEditing({ id: subtask.id, title: subtask.title })}>
              {subtask.title}
            </button>
            {meta}
          </div>
        )}
        <div className="task-actions">
          <IconButton icon="calendar" title={t('tasks.date')} onClick={(event) => dateMenu(event, subtask)} />
          <IconButton icon="flag" title={t('tasks.priority')} onClick={(event) => priorityMenu(event, subtask)} />
          {team && (
            <IconButton
              icon="person"
              title={t('tasks.assignee')}
              onClick={(event) => setAssigning(assigning ? null : { id: subtask.id, anchor: event.currentTarget as HTMLElement })}
            />
          )}
          <button type="button" className="task-more" title={t('tasks.more')} aria-label={t('tasks.more')} onClick={(event) => rowMenu(event, subtask)}>
            ···
          </button>
          <IconButton icon="trash" title={t('tasks.delete')} onClick={() => act.remove(subtask.id)} />
          <input
            ref={(element) => {
              if (element) pickers.current.set(subtask.id, element);
              else pickers.current.delete(subtask.id);
            }}
            className="date-picker"
            type="date"
            aria-label={t('tasks.dueDate')}
            tabIndex={-1}
            value={subtask.due ?? ''}
            onChange={(event) => act.update(subtask.id, { due: event.target.value || null })}
          />
        </div>
      </div>
    );
  };

  const assigned = assigning && list.find((s) => s.id === assigning.id);
  return (
    <div className={`subtasks on-${place}`}>
      {place === 'card' ? (
        <div className="cp-sec stk-head">
          {t('subtasks.title')}
          <Progress list={list} />
        </div>
      ) : (
        <div className="blk-h">
          <span>{props.title ?? t('subtasks.title')}</span>
          <Progress list={list} />
        </div>
      )}
      <div className="stk-rows" onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setDrop(null)}>
        {open.map(row)}
        {adding ? (
          <Composer
            placeholder={t('tasks.subtaskName')}
            addLabel={t('tasks.addSubtask')}
            onAdd={(title) => change((current) => addSubtask(current, { title }))}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="qa" onClick={() => setAdding(true)}>
            {props.add ?? t('subtasks.addRow')}
          </button>
        )}
        {done.length > 0 && (
          <button type="button" className="qa stk-done" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            {t(showDone ? 'tasks.hideCompleted' : 'tasks.showCompleted', { count: done.length })}
          </button>
        )}
        {showDone && done.map((s, i) => row(s, open.length + i))}
      </div>
      {assigning && assigned && team && (
        <PersonPicker
          anchor={assigning.anchor}
          team={team}
          current={assigned.assignee ?? null}
          onPick={(assignee: PersonRef | null) => {
            setAssigning(null);
            act.update(assigned.id, { assignee });
          }}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

// ---------- phone ----------

function PhoneSubtasks(props: SubtasksProps) {
  const { list, change, team, today, menu, inSheet } = props;
  const act = useSubtaskActions(props);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [carried, setCarried] = useState<{ id: string; before: string | null } | null>(null);
  const rows = useRef<HTMLDivElement>(null);
  const progress = subtaskProgress(list);
  const open = list.filter((s) => !s.done);
  const done = list.filter((s) => s.done);

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    change((current) => addSubtask(current, { title: typed }));
    setTyped('');
  };
  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (editing?.title.trim()) act.update(editing.id, { title: editing.title });
    setEditing(null);
  };
  // A tap on a subtask opens what can be done with it.
  const options = (subtask: Subtask) =>
    menu(
      NO_POINTER,
      [
        { label: t('menu.rename'), icon: 'pen', run: () => setEditing({ id: subtask.id, title: subtask.title }) },
        { label: t('tasks.date'), icon: 'calendar', value: subtask.due ? dueLabel(subtask.due, today) : undefined, run: () => setPicking({ id: subtask.id, what: 'date' }) },
        {
          label: t('tasks.priority'),
          icon: 'flag',
          value: subtask.priority < 4 ? `p${subtask.priority}` : undefined,
          run: () => menu(NO_POINTER, act.priorities(subtask), { icon: 'flag', title: t('tasks.priority') }),
        },
        ...(team
          ? [{ label: t('tasks.assignee'), icon: 'person' as const, value: subtask.assignee ? assigneeLabel(subtask.assignee, team.people) : undefined, run: () => setPicking({ id: subtask.id, what: 'person' }) }]
          : []),
        { label: t('tasks.delete'), icon: 'trash', danger: true, run: () => act.remove(subtask.id) },
      ],
      { icon: 'subtask', title: subtask.title },
    );

  // Held, an open subtask lifts and is carried among the open ones; let go where it was, its options open.
  const hold = (event: PointerEvent<HTMLElement>, subtask: Subtask) => {
    if (subtask.done || editing) return;
    let before: string | null = null;
    holdToDrag(event, {
      element: event.currentTarget,
      onLift: () => setCarried({ id: subtask.id, before: null }),
      onMove: (_x, y) => {
        const others = [...(rows.current?.querySelectorAll<HTMLElement>('[data-open]') ?? [])].filter((el) => el.dataset.open !== subtask.id);
        const next = others.find((el) => {
          const box = el.getBoundingClientRect();
          return y < box.top + box.height / 2;
        });
        before = next?.dataset.open ?? null;
        setCarried({ id: subtask.id, before });
      },
      onDrop: () => {
        change((current) => moveSubtask(current, subtask.id, before ?? done[0]?.id ?? null));
        setCarried(null);
      },
      onCancel: () => setCarried(null),
      onStill: () => {
        setCarried(null);
        options(subtask);
      },
    });
  };

  const row = (subtask: Subtask) =>
    editing?.id === subtask.id ? (
      <form key={subtask.id} className="mb-fr add-sub" onSubmit={rename}>
        <TitleField
          className="in"
          autoFocus
          enterKeyHint="done"
          aria-label={t('tasks.subtaskName')}
          value={editing.title}
          onChange={(title) => setEditing({ id: subtask.id, title })}
          onBlur={() => setEditing(null)}
        />
        <button type="submit" className="go" disabled={!editing.title.trim()} onMouseDown={(event) => event.preventDefault()}>
          {t('card.save')}
        </button>
      </form>
    ) : (
      <div
        key={subtask.id}
        data-open={subtask.done ? undefined : subtask.id}
        className={`mb-fr sub stk${subtask.done ? ' done' : ''}${carried?.id === subtask.id ? ' lifted' : ''}${carried && carried.id !== subtask.id && carried.before === subtask.id ? ' drop-above' : ''}`}
        onPointerDown={(event) => hold(event, subtask)}
      >
        <button
          type="button"
          className={`cb p${subtask.priority}`}
          role="checkbox"
          aria-checked={subtask.done}
          aria-label={t(subtask.done ? 'tasks.reopen' : 'tasks.complete', { name: subtask.title })}
          onClick={() => act.toggle(subtask)}
        />
        <button type="button" className="in" onClick={() => options(subtask)}>
          <span className="tx">{subtask.title}</span>
          {(subtask.due || subtask.assignee) && (
            <span className="meta">
              {subtask.due && <span className={dueClass(subtask.due, today)}>{dueLabel(subtask.due, today)}</span>}
              {subtask.assignee && <AssigneeChip assignee={subtask.assignee} people={team?.people} />}
            </span>
          )}
        </button>
      </div>
    );

  const picked = picking && list.find((s) => s.id === picking.id);
  const group = (
    <div ref={rows} className="mb-group mb-subtasks">
      {open.map(row)}
      {carried && carried.before === null && <div className="stk-end" />}
      {adding ? (
        <form className="mb-fr add-sub" onSubmit={add}>
          <TitleField
            className="in"
            autoFocus
            enterKeyHint="send"
            aria-label={t('tasks.subtaskName')}
            placeholder={t('tasks.subtaskName')}
            value={typed}
            onChange={setTyped}
            onBlur={() => !typed.trim() && setAdding(false)}
          />
          <button type="submit" className="go" disabled={!typed.trim()} onMouseDown={(event) => event.preventDefault()}>
            {t('phone.add')}
          </button>
        </form>
      ) : (
        <button type="button" className="mb-fr add" onClick={() => setAdding(true)}>
          <Icon name="plus" />
          <span className="in">{t('tasks.addSubtask')}</span>
        </button>
      )}
      {done.length > 0 && (
        <button type="button" className="mb-fr add stk-done" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
          <span className="in">{t(showDone ? 'tasks.hideCompleted' : 'tasks.showCompleted', { count: done.length })}</span>
        </button>
      )}
      {showDone && done.map(row)}
    </div>
  );
  return (
    <>
      <div className={inSheet ? 'mb-cap' : 'mb-cap mb-cpad'}>{props.title ? `${props.title}${progress.total > 0 ? ` · ${progress.done}/${progress.total}` : ''}` : progress.total > 0 ? t('phone.subtasksDone', { done: progress.done, total: progress.total }) : t('subtasks.title')}</div>
      {/* Set in from the page's edges as its fields are; a sheet's form is already. */}
      {inSheet ? group : <div className="mb-form mb-stk">{group}</div>}
      {picking?.what === 'date' && picked && (
        <DateSheet title={picked.title} current={picked.due} today={today} onPick={(due) => act.update(picked.id, { due })} onClose={() => setPicking(null)} />
      )}
      {picking?.what === 'person' && picked && team && (
        <PeopleSheet about={picked.title} team={team} current={picked.assignee ?? null} onPick={(assignee) => act.update(picked.id, { assignee })} onClose={() => setPicking(null)} />
      )}
    </>
  );
}
