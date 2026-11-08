import {
  type BackChange,
  type Board,
  type Collection,
  keyOf,
  movedValues,
  nameField,
  recordLabel,
  stretchedValues,
  type Subtask,
  type Task,
  updateSubtask,
} from '@scrawlnotes/core';
import type { Session } from './session';

// What the calendar changed comes back to Scrawl (design/outlook-calendar.md 2.3, 4.3): a task's or
// a card's title and day, a record's name, day and time, a subtask's title and day; work whose
// event was removed there goes to the trash. Written as the person, in one go, with one Undo.

export interface BackData {
  tasks: Record<string, Task[]>;
  boards: Record<string, Board>;
  collections: Record<string, Collection>;
}

/** The work an id names: `task:<list>#<id>`, `card:<board>#<id>[/<subtask>]`, `record:<dir>#<id>[/<subtask>]`. */
function parse(id: string): { kind: 'task' | 'card' | 'record'; path: string; item: string; subtask?: string } | null {
  const match = /^(task|card|record):(.+)#([^#/@]+)(?:\/([^#/@]+))?$/.exec(id);
  if (!match) return null;
  return { kind: match[1] as 'task' | 'card' | 'record', path: match[2]!, item: match[3]!, ...(match[4] && { subtask: match[4] }) };
}

/** The title as Scrawl keeps it: without the card's key before it, or the card's or record's name after a subtask's. */
const bare = (title: string, before: string | null, after: string | null) => {
  let out = title;
  if (before && out.startsWith(`${before} `)) out = out.slice(before.length + 1);
  if (after && out.endsWith(` · ${after}`)) out = out.slice(0, -(after.length + 3));
  return out.trim();
};

export interface BackResult {
  /** How many pieces of work changed. */
  count: number;
  /** Ids that could not be written in Scrawl: their events are written over with Scrawl's. */
  skipped: string[];
  undo: () => Promise<void>;
}

/** Writes `changes` and trashes `gone` in Scrawl, as of `data`; one undo for all of it. */
export async function writeBack(session: Session, data: BackData, changes: readonly BackChange[], gone: readonly string[]): Promise<BackResult> {
  const undos: (() => Promise<void> | void)[] = [];
  const skipped: string[] = [];
  let count = 0;
  const subtaskPatch = (change: BackChange, subtask: Subtask, after: string | null) => ({
    ...(change.title && { title: bare(change.title, null, after) }),
    ...(change.day && { due: change.day }),
    was: { title: subtask.title, due: subtask.due },
  });

  for (const change of changes) {
    const at = parse(change.id);
    if (!at) {
      skipped.push(change.id);
      continue;
    }
    if (at.kind === 'task') {
      const task = data.tasks[at.path]?.find((each) => each.id === at.item);
      if (!task) {
        skipped.push(change.id);
        continue;
      }
      session.updateTask(at.path, task.id, { ...(change.title && { title: change.title }), ...(change.day && { due: change.day }) });
      undos.push(() => session.updateTask(at.path, task.id, { title: task.title, due: task.due }));
      count++;
    } else if (at.kind === 'card') {
      const board = data.boards[at.path];
      const card = board?.cards.find((each) => each.id === at.item);
      if (!board || !card) {
        skipped.push(change.id);
        continue;
      }
      const key = keyOf(board, card);
      if (at.subtask) {
        const subtask = card.subtasks?.find((each) => each.id === at.subtask);
        if (!subtask) {
          skipped.push(change.id);
          continue;
        }
        const { was, ...patch } = subtaskPatch(change, subtask, key);
        session.changeCardSubtasks(at.path, card.id, (list) => updateSubtask(list, subtask.id, patch));
        undos.push(() => session.changeCardSubtasks(at.path, card.id, (list) => updateSubtask(list, subtask.id, was)));
      } else {
        session.updateCard(at.path, card.id, { ...(change.title && { title: bare(change.title, key, null) }), ...(change.day && { due: change.day }) });
        undos.push(() => session.updateCard(at.path, card.id, { title: card.title, due: card.due }));
      }
      count++;
    } else {
      const collection = data.collections[at.path];
      const record = collection?.records.find((each) => each.id === at.item);
      const settings = collection?.schema.views?.find((view) => view.kind === 'calendar' && view.calendar?.upcoming)?.calendar;
      if (!collection || !record) {
        skipped.push(change.id);
        continue;
      }
      if (at.subtask) {
        const subtask = record.subtasks?.find((each) => each.id === at.subtask);
        if (!subtask) {
          skipped.push(change.id);
          continue;
        }
        const { was, ...patch } = subtaskPatch(change, subtask, recordLabel(record));
        if (await session.changeRecordSubtasks(at.path, record.id, (list) => updateSubtask(list, subtask.id, patch))) {
          skipped.push(change.id);
          continue;
        }
        undos.push(() => void session.changeRecordSubtasks(at.path, record.id, (list) => updateSubtask(list, subtask.id, was)));
        count++;
        continue;
      }
      let values: Record<string, unknown> = {};
      // A name its rules write as the record is saved is theirs: the calendar's goes back to it.
      const name = nameField(collection.schema);
      if (change.title && name && !name.optional) values[name.key] = change.title;
      if (settings && (change.day || change.start !== undefined)) {
        const start = record.values[settings.start];
        const end = settings.end ? record.values[settings.end] : null;
        const item = { start: typeof start === 'string' ? start : '', end: typeof end === 'string' ? end : null };
        const time = item.start.length > 10 ? item.start.slice(10) : '';
        const to = change.start === null ? (change.day ?? item.start.slice(0, 10)) : (change.start ?? `${change.day}${time}`);
        values = { ...values, ...(movedValues(collection.schema, settings, item, to) ?? {}) };
        if (change.start && change.end) values = { ...values, ...(stretchedValues(collection.schema, settings, { start: to }, change.end) ?? {}) };
      }
      if (Object.keys(values).length === 0 || (await session.updateRecord(at.path, record.id, { values: values as typeof record.values }))) {
        skipped.push(change.id);
        continue;
      }
      const before = Object.fromEntries(Object.keys(values).map((field) => [field, record.values[field] ?? null]));
      undos.push(() => void session.updateRecord(at.path, record.id, { values: before as typeof record.values }));
      count++;
    }
  }

  for (const id of gone) {
    const at = parse(id);
    // A subtask has no trash: one removed in the calendar is made there again.
    if (!at || at.subtask) continue;
    if (at.kind === 'task' && data.tasks[at.path]?.some((each) => each.id === at.item)) undos.push(await session.removeTask(at.path, at.item));
    else if (at.kind === 'card' && data.boards[at.path]?.cards.some((each) => each.id === at.item)) undos.push(await session.removeCard(at.path, at.item));
    else if (at.kind === 'record') {
      const record = data.collections[at.path]?.records.find((each) => each.id === at.item);
      // A record goes to the Trash, and is put back from there.
      if (record) await session.trashRecord(at.path, record);
    } else continue;
    count++;
  }

  return {
    count,
    skipped,
    undo: async () => {
      for (const undo of undos.reverse()) await undo();
    },
  };
}
