import { type PersonRef, readPersonRef } from './people';
import type { Priority } from './tasks';

// A card's and a record's own subtasks: one level, in their order, each a small task with a
// title, a box, a priority, a day and in a space with people someone it is given to. A card keeps
// them in its board's file, a record in its front matter, one line each. Everything here is a
// pure function over the list; whoever holds it saves the result.

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
  /** Due day as `YYYY-MM-DD`. */
  due: string | null;
  /** Who it is given to, in a space with people. */
  assignee?: PersonRef | null;
  created: string;
  completed: string | null;
}

export interface NewSubtask {
  title: string;
  priority?: Priority;
  due?: string | null;
  assignee?: PersonRef | null;
}

/** What can be changed of a subtask. An empty title keeps the old one; a null assignee is removed. */
export type SubtaskPatch = Partial<Pick<Subtask, 'title' | 'done' | 'priority' | 'due' | 'assignee'>>;

type Clock = () => Date;
const newId = () => crypto.randomUUID();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The subtasks a file has; what is not usable is left out rather than failing the whole list. */
export function readSubtasks(raw: unknown): Subtask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Subtask[] = [];
  for (const item of raw as Partial<Subtask>[]) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const assignee = readPersonRef(item.assignee);
    out.push({
      id: item.id,
      title: item.title,
      done: item.done === true,
      priority: item.priority === 1 || item.priority === 2 || item.priority === 3 ? item.priority : 4,
      due: typeof item.due === 'string' && DAY.test(item.due) ? item.due : null,
      ...(assignee && { assignee }),
      created: typeof item.created === 'string' ? item.created : '',
      completed: typeof item.completed === 'string' ? item.completed : null,
    });
  }
  return out;
}

/** A subtask as a file keeps it: what is unset left out, so that a line stays short. */
export function writtenSubtask(subtask: Subtask): { [key: string]: unknown } {
  return {
    id: subtask.id,
    title: subtask.title,
    done: subtask.done,
    ...(subtask.priority !== 4 && { priority: subtask.priority }),
    ...(subtask.due && { due: subtask.due }),
    ...(subtask.assignee && { assignee: subtask.assignee }),
    created: subtask.created,
    ...(subtask.completed && { completed: subtask.completed }),
  };
}

/** Adds a subtask at the end. A title of only spaces adds none. */
export function addSubtask(list: Subtask[], input: NewSubtask, now: Clock = () => new Date(), id: string = newId()): Subtask[] {
  const title = input.title.trim();
  if (!title) return list;
  return [
    ...list,
    {
      id,
      title,
      done: false,
      priority: input.priority ?? 4,
      due: input.due ?? null,
      ...(input.assignee && { assignee: input.assignee }),
      created: now().toISOString(),
      completed: null,
    },
  ];
}

/** Changes a subtask; finishing it marks when, opening it again takes that away. */
export function updateSubtask(list: Subtask[], id: string, patch: SubtaskPatch, now: Clock = () => new Date()): Subtask[] {
  if (patch.title !== undefined && !patch.title.trim()) return list;
  return list.map((s) => {
    if (s.id !== id) return s;
    const next: Subtask = { ...s };
    if (patch.title !== undefined) next.title = patch.title.trim();
    if (patch.priority !== undefined) next.priority = patch.priority;
    if (patch.due !== undefined) next.due = patch.due;
    if (patch.assignee !== undefined) {
      if (patch.assignee) next.assignee = patch.assignee;
      else delete next.assignee;
    }
    if (patch.done !== undefined && patch.done !== s.done) {
      next.done = patch.done;
      next.completed = patch.done ? now().toISOString() : null;
    }
    return next;
  });
}

export const removeSubtask = (list: Subtask[], id: string): Subtask[] => list.filter((s) => s.id !== id);

/** Moves a subtask to just before `before`, or to the end with null. */
export function moveSubtask(list: Subtask[], id: string, before: string | null): Subtask[] {
  const subtask = list.find((s) => s.id === id);
  if (!subtask || before === id) return list;
  const rest = list.filter((s) => s.id !== id);
  const at = before === null ? rest.length : rest.findIndex((s) => s.id === before);
  if (at === -1) return list;
  return [...rest.slice(0, at), subtask, ...rest.slice(at)];
}

/** How many of the subtasks are done, of how many. */
export const subtaskProgress = (list: readonly Subtask[]) => ({ done: list.filter((s) => s.done).length, total: list.length });
