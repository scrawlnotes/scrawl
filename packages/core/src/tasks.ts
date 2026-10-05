import { join, type VaultFs } from './fs';

/** Priority 1 is the highest; 4 means no priority was set. */
export type Priority = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
  /** Due day as `YYYY-MM-DD`, in the user's own calendar. */
  due: string | null;
  /** The task this one is a subtask of. */
  parent: string | null;
  /** Position among its siblings. */
  order: number;
  created: string;
  updated: string;
  completed: string | null;
  // Not used by the interface yet. They are part of the format now so that files written today
  // stay valid when sections, notes, labels, repeating tasks, reminders and sharing arrive.
  description?: string;
  section?: string | null;
  labels?: string[];
  recurrence?: string | null;
  reminder?: string | null;
  assignee?: string | null;
  author?: string | null;
  /** Path of the note the task was made from. */
  note?: string | null;
}

/** How deep subtasks may nest below a top-level task. */
export const MAX_DEPTH = 4;
const TASKS_FILE = 'tasks.json';

type Clock = () => Date;
const iso = (now: Clock) => now().toISOString();
const newId = () => crypto.randomUUID();

const pad = (n: number) => String(n).padStart(2, '0');

/** A day as `YYYY-MM-DD` in local time: "today" is the user's today, not UTC's. */
export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, count: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayOf(new Date(y, m - 1, d + count));
}

/** Reads a task file. Anything that is not a usable task is left out rather than failing the whole list. */
export function parseTasks(text: string): Task[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = (data as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(list)) return [];
  const tasks: Task[] = [];
  for (const raw of list as Partial<Task>[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') continue;
    tasks.push({
      // Unknown fields are kept, so a newer version's data survives being saved by an older one.
      ...raw,
      id: raw.id,
      title: raw.title,
      done: raw.done === true,
      priority: raw.priority === 1 || raw.priority === 2 || raw.priority === 3 ? raw.priority : 4,
      due: typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : null,
      parent: typeof raw.parent === 'string' ? raw.parent : null,
      order: typeof raw.order === 'number' ? raw.order : 0,
      created: typeof raw.created === 'string' ? raw.created : '',
      updated: typeof raw.updated === 'string' ? raw.updated : '',
      completed: typeof raw.completed === 'string' ? raw.completed : null,
    });
  }
  // A subtask whose parent is gone becomes a top-level task instead of disappearing.
  const ids = new Set(tasks.map((t) => t.id));
  return tasks.map((t) => (t.parent && !ids.has(t.parent) ? { ...t, parent: null } : t));
}

export function serializeTasks(tasks: Task[]): string {
  return `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`;
}

export async function loadTasks(fs: VaultFs, folder: string): Promise<Task[]> {
  try {
    return parseTasks(await fs.readText(join(folder, TASKS_FILE)));
  } catch {
    return [];
  }
}

export function saveTasks(fs: VaultFs, folder: string, tasks: Task[]): Promise<void> {
  return fs.writeText(join(folder, TASKS_FILE), serializeTasks(tasks));
}

/** The subtasks of `parent` (or the top-level tasks), in their order. */
export function childrenOf(tasks: Task[], parent: string | null): Task[] {
  return tasks.filter((t) => t.parent === parent).sort((a, b) => a.order - b.order);
}

/** How many levels a task sits below the top level. */
export function depthOf(tasks: Task[], id: string): number {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let depth = 0;
  for (let task = byId.get(id); task?.parent; task = byId.get(task.parent)) depth++;
  return depth;
}

function descendants(tasks: Task[], id: string): Set<string> {
  const out = new Set<string>();
  const visit = (parent: string) => {
    for (const child of tasks) {
      if (child.parent !== parent || out.has(child.id)) continue;
      out.add(child.id);
      visit(child.id);
    }
  };
  visit(id);
  return out;
}

export interface NewTask {
  title: string;
  parent?: string | null;
  due?: string | null;
  priority?: Priority;
}

/** Adds a task at the end of its siblings. A subtask deeper than `MAX_DEPTH` is not added. */
export function addTask(tasks: Task[], input: NewTask, now: Clock = () => new Date(), id: string = newId()): Task[] {
  const title = input.title.trim();
  const parent = input.parent ?? null;
  if (!title) return tasks;
  if (parent && (!tasks.some((t) => t.id === parent) || depthOf(tasks, parent) >= MAX_DEPTH)) return tasks;
  const siblings = childrenOf(tasks, parent);
  const stamp = iso(now);
  const task: Task = {
    id,
    title,
    done: false,
    priority: input.priority ?? 4,
    due: input.due ?? null,
    parent,
    order: (siblings[siblings.length - 1]?.order ?? -1) + 1,
    created: stamp,
    updated: stamp,
    completed: null,
  };
  return [...tasks, task];
}

export function updateTask(
  tasks: Task[],
  id: string,
  patch: Partial<Pick<Task, 'title' | 'due' | 'priority'>>,
  now: Clock = () => new Date(),
): Task[] {
  if (patch.title !== undefined && !patch.title.trim()) return tasks;
  const clean = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() };
  return tasks.map((t) => (t.id === id ? { ...t, ...clean, updated: iso(now) } : t));
}

/**
 * Completes or reopens a task. Completing a task completes its subtasks too; reopening one
 * reopens the tasks above it, since a finished task cannot have an open subtask.
 */
export function setDone(tasks: Task[], id: string, done: boolean, now: Clock = () => new Date()): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const affected = new Set([id]);
  if (done) for (const child of descendants(tasks, id)) affected.add(child);
  else for (let task = byId.get(id); task?.parent; task = byId.get(task.parent)) affected.add(task.parent);
  const stamp = iso(now);
  return tasks.map((t) =>
    affected.has(t.id) && t.done !== done ? { ...t, done, completed: done ? stamp : null, updated: stamp } : t,
  );
}

/** Removes a task together with its subtasks. */
export function removeTask(tasks: Task[], id: string): Task[] {
  const gone = descendants(tasks, id).add(id);
  return tasks.filter((t) => !gone.has(t.id));
}

/** How many of a task's direct subtasks are done. */
export function progressOf(tasks: Task[], id: string): { done: number; total: number } {
  const children = tasks.filter((t) => t.parent === id);
  return { done: children.filter((t) => t.done).length, total: children.length };
}

export const openCount = (tasks: Task[]) => tasks.filter((t) => !t.done).length;

/** An open task with a due day, and the folder its list belongs to. */
export interface DueTask {
  folder: string;
  task: Task;
}

function dueTasks(lists: Record<string, Task[]>): DueTask[] {
  return Object.entries(lists)
    .flatMap(([folder, tasks]) => tasks.filter((t) => !t.done && t.due).map((task) => ({ folder, task })))
    .sort((a, b) => a.task.due!.localeCompare(b.task.due!) || a.task.priority - b.task.priority);
}

/** What is due today across all lists, with what is already late kept apart. */
export function dueToday(lists: Record<string, Task[]>, today: string): { overdue: DueTask[]; today: DueTask[] } {
  const all = dueTasks(lists);
  return { overdue: all.filter((d) => d.task.due! < today), today: all.filter((d) => d.task.due === today) };
}

/** What is due after today across all lists, grouped by day in order. */
export function dueUpcoming(lists: Record<string, Task[]>, today: string): { day: string; tasks: DueTask[] }[] {
  const days = new Map<string, DueTask[]>();
  for (const due of dueTasks(lists)) {
    if (due.task.due! <= today) continue;
    days.set(due.task.due!, [...(days.get(due.task.due!) ?? []), due]);
  }
  return [...days].map(([day, tasks]) => ({ day, tasks }));
}
