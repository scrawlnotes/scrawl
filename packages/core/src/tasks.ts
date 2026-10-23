import { actorIn, type By, isObject, readStamp, readWorkedOn, refKey, type Stamp, stampOf, workedBy, type WorkedOn, writtenBy } from './activity';
import type { VaultFs } from './fs';
import { cleanLabels } from './labels';
import { type PersonRef, readPersonRef } from './people';

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
  /** Plain text under the title, line breaks kept. Left out of the file when there is none. */
  description?: string;
  /** The id of the section a top-level task is in; a subtask goes where its parent goes. */
  section?: string | null;
  /** Who it is given to, in a space with people; the personal space has none. */
  assignee?: PersonRef | null;
  /** Who made it, in a space with people. */
  author?: PersonRef | null;
  /** Its labels, the words its space's tasks and cards share (design/labels.md). Left out of the file when there is none. */
  labels?: string[];
  // Not used by the interface yet. They are part of the format now so that files written today
  // stay valid when repeating tasks and reminders arrive.
  recurrence?: string | null;
  reminder?: string | null;
  /** Path of the note the task was made from. */
  note?: string | null;
  /** The card the task was made from, as `cardRef` writes it. */
  card?: string | null;
  /** The record the task is about. */
  record?: TaskRecord | null;
  /** What mattered on it, one entry each, with who did it: who it was given to, done, opened again. Left out when there is nothing. */
  timeline?: TaskEntry[];
  /** Everyone who changed it, a person or an agent, once each, with when they last did. Left out when no one is known. */
  workedOn?: WorkedOn[];
}

/**
 * What mattered on a task (design/activity.md 1.2): who it was given to, done and opened again;
 * that it was made shows from its author. An entry of a kind a newer version writes is kept as
 * it is, and not shown.
 */
export type TaskEntry =
  | (Stamp & { kind: 'assign'; given?: PersonRef })
  | (Stamp & { kind: 'done' })
  | (Stamp & { kind: 'reopen' })
  | (Stamp & { kind: 'unknown'; raw: { [key: string]: unknown } });

/** A task's timeline as the file has it. */
function readTaskTimeline(list: unknown): TaskEntry[] {
  if (!Array.isArray(list)) return [];
  const out: TaskEntry[] = [];
  for (const raw of list) {
    const read = readStamp(raw);
    if (!read) continue;
    // Unknown fields are kept, so a newer version's data survives being saved by an older one.
    const { stamp, kind, rest } = read;
    if (kind === 'assign') {
      const { given, ...others } = rest;
      const ref = readPersonRef(given);
      out.push({ ...others, ...stamp, kind: 'assign', ...(ref && { given: ref }) });
    } else if (kind === 'done' || kind === 'reopen') {
      out.push({ ...rest, ...stamp, kind });
    } else {
      out.push({ ...stamp, kind: 'unknown', raw: kind === 'unknown' && isObject(rest.raw) ? rest.raw : (raw as { [key: string]: unknown }) });
    }
  }
  return out;
}

/**
 * A record a task is about: the path of its collection and its id, and its name and code as they
 * were when it was linked, so that they show without the record's file being read.
 */
export interface TaskRecord {
  collection: string;
  id: string;
  name: string;
  code?: string;
}

/** A record as a task file has it; null when it is not one. */
function readTaskRecord(raw: unknown): TaskRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { [key: string]: unknown };
  if (typeof r.collection !== 'string' || typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null;
  return { collection: r.collection, id: r.id, name: r.name, ...(typeof r.code === 'string' && r.code && { code: r.code }) };
}

/** A card as a task refers to it: the path of its board and its id. */
export const cardRef = (board: string, id: string) => `${board}#${id}`;

/** The board and card a task's `card` refers to; null when it is not one. */
export function parseCardRef(ref: string): { board: string; id: string } | null {
  const at = ref.lastIndexOf('#');
  return at > 0 && at < ref.length - 1 ? { board: ref.slice(0, at), id: ref.slice(at + 1) } : null;
}

/** How deep subtasks may nest below a top-level task. */
export const MAX_DEPTH = 4;
/** A task list is a file of its own: `<name>.tasks.json`; the personal space's own list is `Inbox.tasks.json` at its top. */
export const TASK_LIST_EXT = '.tasks.json';

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

/** A named part of a task list. A top-level task is in one, or in none and comes first. */
export interface Section {
  id: string;
  name: string;
  /** Folded: only its header shows. */
  collapsed?: boolean;
}

/** What a task list file holds. */
export interface TaskList {
  /** In the order they are shown. */
  sections: Section[];
  tasks: Task[];
}

/** Reads a task file. Anything that is not usable is left out rather than failing the whole list. */
export function parseList(text: string): TaskList {
  let data: { sections?: unknown; tasks?: unknown } | null;
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return { sections: [], tasks: [] };
  }
  return { sections: parseSections(data?.sections), tasks: parseTaskArray(data?.tasks) };
}

/** The tasks of a task file; see `parseList`. */
export const parseTasks = (text: string): Task[] => parseList(text).tasks;

function parseSections(list: unknown): Section[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const sections: Section[] = [];
  for (const raw of list as Partial<Section>[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || seen.has(raw.id)) continue;
    seen.add(raw.id);
    sections.push({ ...raw, id: raw.id, name: raw.name, collapsed: raw.collapsed === true || undefined });
  }
  return sections;
}

function parseTaskArray(list: unknown): Task[] {
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
      description: typeof raw.description === 'string' && raw.description.trim() ? raw.description : undefined,
      section: typeof raw.section === 'string' ? raw.section : undefined,
    });
    const task = tasks[tasks.length - 1]!;
    if (typeof raw.card !== 'string') delete task.card;
    const labels = Array.isArray(raw.labels) ? raw.labels.filter((label): label is string => typeof label === 'string' && label.trim() !== '') : [];
    if (labels.length > 0) task.labels = labels;
    else delete task.labels;
    const record = readTaskRecord(raw.record);
    if (record) task.record = record;
    else delete task.record;
    for (const key of ['assignee', 'author'] as const) {
      const ref = readPersonRef(raw[key]);
      if (ref) task[key] = ref;
      else delete task[key];
    }
    const timeline = readTaskTimeline(raw.timeline);
    if (timeline.length > 0) task.timeline = timeline;
    else delete task.timeline;
    const worked = readWorkedOn(raw.workedOn);
    if (worked.length > 0) task.workedOn = worked;
    else delete task.workedOn;
  }
  // A subtask whose parent is gone becomes a top-level task instead of disappearing.
  const ids = new Set(tasks.map((t) => t.id));
  return tasks.map((t) => (t.parent && !ids.has(t.parent) ? { ...t, parent: null } : t));
}

/** A task list as its file holds it. A list without sections leaves them out. */
export function serializeList({ sections, tasks }: TaskList): string {
  // A kind of entry this version does not know goes back as it came.
  const written = tasks.map((t) => (t.timeline?.some((e) => e.kind === 'unknown') ? { ...t, timeline: t.timeline.map((e) => (e.kind === 'unknown' ? e.raw : e)) } : t));
  return `${JSON.stringify({ version: 1, ...(sections.length > 0 && { sections }), tasks: written }, null, 2)}\n`;
}

export const serializeTasks = (tasks: Task[]): string => serializeList({ sections: [], tasks });

/** Reads the task list at `path`. A list whose file is missing is empty. */
export async function loadTasks(fs: VaultFs, path: string): Promise<Task[]> {
  try {
    return parseTasks(await fs.readText(path));
  } catch {
    return [];
  }
}

/** Reads the task list at `path`, sections included. A list whose file is missing is empty. */
export async function loadList(fs: VaultFs, path: string): Promise<TaskList> {
  try {
    return parseList(await fs.readText(path));
  } catch {
    return { sections: [], tasks: [] };
  }
}

export function saveList(fs: VaultFs, path: string, list: TaskList): Promise<void> {
  return fs.writeText(path, serializeList(list));
}

/**
 * The top-level tasks of a section, or of no section with `null`, in their order. A task whose
 * section is gone counts as in none.
 */
export function sectionTasks(list: TaskList, section: string | null): Task[] {
  const known = new Set(list.sections.map((s) => s.id));
  const of = (t: Task) => (t.section && known.has(t.section) ? t.section : null);
  return childrenOf(list.tasks, null).filter((t) => of(t) === section);
}

/**
 * Adds a section: at the end of the list, or after the section `after` names, at the top for null.
 * A name of only spaces adds none.
 */
export function addSection(list: TaskList, name: string, id: string = newId(), after?: string | null): TaskList {
  const clean = name.trim();
  if (!clean) return list;
  const added = { ...list, sections: [...list.sections, { id, name: clean }] };
  return after === undefined ? added : moveSection(added, id, after);
}

export function renameSection(list: TaskList, id: string, name: string): TaskList {
  const clean = name.trim();
  if (!clean) return list;
  return { ...list, sections: list.sections.map((s) => (s.id === id ? { ...s, name: clean } : s)) };
}

/** Folds a section, or unfolds it. An unfolded section leaves the flag out of the file. */
export function foldSection(list: TaskList, id: string, collapsed: boolean): TaskList {
  return { ...list, sections: list.sections.map((s) => (s.id === id ? { ...s, collapsed: collapsed || undefined } : s)) };
}

/** Moves a section, with its tasks, to just after `after`, or to the top with `null`. */
export function moveSection(list: TaskList, id: string, after: string | null): TaskList {
  const section = list.sections.find((s) => s.id === id);
  if (!section || after === id) return list;
  const rest = list.sections.filter((s) => s.id !== id);
  const at = after === null ? 0 : rest.findIndex((s) => s.id === after) + 1;
  if (after !== null && at === 0) return list;
  return { ...list, sections: [...rest.slice(0, at), section, ...rest.slice(at)] };
}

/** Where a task goes when it is moved: its new parent or section, and the sibling it follows. */
export interface TaskPlace {
  /** The task it becomes a subtask of; null for the top level. */
  parent: string | null;
  /** At the top level: the section it goes in, null for none. */
  section: string | null;
  /** The sibling it comes right after; null to come first. */
  after: string | null;
}

/** How many levels of subtasks a task has under it. */
function heightOf(tasks: Task[], id: string): number {
  const children = tasks.filter((t) => t.parent === id);
  return children.length === 0 ? 0 : 1 + Math.max(...children.map((c) => heightOf(tasks, c.id)));
}

/**
 * Moves a task, with its subtasks, to `place`. Nothing moves when the task would go into
 * itself or one of its subtasks, or its subtasks would go deeper than `MAX_DEPTH`.
 */
export function moveTask(list: TaskList, id: string, place: TaskPlace, now: Clock = () => new Date()): TaskList {
  const { tasks } = list;
  const task = tasks.find((t) => t.id === id);
  if (!task) return list;
  const { parent } = place;
  if (parent !== null && (parent === id || descendants(tasks, id).has(parent) || !tasks.some((t) => t.id === parent))) return list;
  const depth = parent === null ? 0 : depthOf(tasks, parent) + 1;
  if (depth + heightOf(tasks, id) > MAX_DEPTH) return list;
  const section = parent === null && list.sections.some((s) => s.id === place.section) ? place.section : null;
  const siblings = (parent === null ? sectionTasks(list, section) : childrenOf(tasks, parent)).filter((t) => t.id !== id);
  const at = place.after === null ? 0 : siblings.findIndex((t) => t.id === place.after) + 1;
  const ordered = [...siblings.slice(0, at), task, ...siblings.slice(at)];
  // Dropped where it already was: the file stays as it is.
  const before = parent === null ? sectionTasks(list, section) : childrenOf(tasks, parent);
  if (task.parent === parent && before.length === ordered.length && before.every((t, i) => t.id === ordered[i]!.id)) return list;
  const orderOf = new Map(ordered.map((t, i) => [t.id, i]));
  const stamp = iso(now);
  return {
    ...list,
    tasks: tasks.map((t) => {
      if (t.id === id) {
        const { section: _old, ...rest } = t;
        return { ...rest, parent, order: orderOf.get(id)!, updated: stamp, ...(section !== null && { section }) };
      }
      const order = orderOf.get(t.id);
      return order === undefined || order === t.order ? t : { ...t, order };
    }),
  };
}

/**
 * Moves a task, with its subtasks, from one list to the end of `section` in another, or of the
 * tasks in no section there, as a top-level task. Its date, priority and description go with it.
 */
export function moveTaskToList(
  from: TaskList,
  to: TaskList,
  id: string,
  section: string | null,
  now: Clock = () => new Date(),
): { from: TaskList; to: TaskList } {
  const task = from.tasks.find((t) => t.id === id);
  if (!task) return { from, to };
  const moving = descendants(from.tasks, id).add(id);
  const target = to.sections.some((s) => s.id === section) ? section : null;
  const last = sectionTasks(to, target).pop();
  const { section: _old, ...rest } = task;
  const moved: Task = { ...rest, parent: null, order: (last?.order ?? -1) + 1, updated: iso(now), ...(target !== null && { section: target }) };
  const subtasks = from.tasks.filter((t) => moving.has(t.id) && t.id !== id);
  return {
    from: { ...from, tasks: from.tasks.filter((t) => !moving.has(t.id)) },
    to: { ...to, tasks: [...to.tasks, moved, ...subtasks] },
  };
}

/** Points the tasks made from the note at `from` to the note's new path. */
export function relinkNote(list: TaskList, from: string, to: string): TaskList {
  if (!list.tasks.some((t) => t.note === from)) return list;
  return { ...list, tasks: list.tasks.map((t) => (t.note === from ? { ...t, note: to } : t)) };
}

/** Points the tasks made from cards of the board at `from` to the board's new path. */
export function relinkBoard(list: TaskList, from: string, to: string): TaskList {
  const prefix = `${from}#`;
  if (!list.tasks.some((t) => t.card?.startsWith(prefix))) return list;
  return { ...list, tasks: list.tasks.map((t) => (t.card?.startsWith(prefix) ? { ...t, card: `${to}#${t.card.slice(prefix.length)}` } : t)) };
}

/** Removes a section with its tasks and their subtasks, as Todoist does. */
export function removeSection(list: TaskList, id: string): TaskList {
  let tasks = list.tasks;
  for (const task of sectionTasks(list, id)) tasks = removeTask(tasks, task.id);
  return { sections: list.sections.filter((s) => s.id !== id), tasks };
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
  /** For a top-level task: the section it goes in. */
  section?: string | null;
  description?: string;
  /** The note it was made from. */
  note?: string | null;
  /** The card it was made from, as `cardRef` writes it. */
  card?: string | null;
  /** The record it is about. */
  record?: TaskRecord | null;
  due?: string | null;
  priority?: Priority;
  labels?: string[];
  assignee?: PersonRef | null;
  author?: PersonRef | null;
}

/**
 * Adds a task at the end of its siblings: the subtasks of its parent, or the top-level tasks of
 * its section. A subtask deeper than `MAX_DEPTH` is not added. Who adds it worked on it; given to
 * someone, its timeline says so.
 */
export function addTask(tasks: Task[], input: NewTask, now: Clock = () => new Date(), id: string = newId(), by?: By): Task[] {
  const title = input.title.trim();
  const parent = input.parent ?? null;
  const section = parent === null ? (input.section ?? null) : null;
  if (!title) return tasks;
  if (parent && (!tasks.some((t) => t.id === parent) || depthOf(tasks, parent) >= MAX_DEPTH)) return tasks;
  const siblings = childrenOf(tasks, parent).filter((t) => parent !== null || (t.section ?? null) === section);
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
    ...(section !== null && { section }),
    ...(input.description?.trim() && { description: input.description.trim() }),
    ...(input.note && { note: input.note }),
    ...(input.card && { card: input.card }),
    ...(input.record && { record: input.record }),
    ...(input.labels && cleanLabels(input.labels).length > 0 && { labels: cleanLabels(input.labels) }),
    ...(input.assignee && { assignee: input.assignee }),
    ...(input.author && { author: input.author }),
  };
  const actor = actorIn(by);
  if (input.assignee) task.timeline = [{ id: newId(), at: stamp, ...stampOf(actor), kind: 'assign', given: input.assignee }];
  return [...tasks, workedBy(task, actor, stamp)];
}

/** What can be changed of a task by editing it; a record or a note of null unlinks it, an assignee of null gives it to nobody. */
export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'due' | 'priority' | 'labels' | 'record' | 'assignee' | 'note'>>;

/**
 * Changes a task. An empty title keeps the old one. A description loses the blank lines and
 * spaces around it, and an empty one is removed; so are no labels and a record of null. Labels
 * are kept once each, whatever their case. Who changes it worked
 * on it; its timeline says who it is given to now.
 */
export function updateTask(tasks: Task[], id: string, patch: TaskPatch, now: Clock = () => new Date(), by?: By): Task[] {
  if (patch.title !== undefined && !patch.title.trim()) return tasks;
  const clean = { ...patch };
  if (clean.title !== undefined) clean.title = clean.title.trim();
  if (clean.description !== undefined) clean.description = clean.description.trim() || undefined;
  if (clean.labels !== undefined) clean.labels = cleanLabels(clean.labels);
  const actor = actorIn(by);
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const stamp = iso(now);
    const next: Task = { ...t, ...clean, updated: stamp };
    if (next.record === null || next.record === undefined) delete next.record;
    if (!next.labels?.length) delete next.labels;
    if (next.assignee === null || next.assignee === undefined) delete next.assignee;
    if (next.note === null || next.note === undefined) delete next.note;
    if (patch.assignee !== undefined && refKey(t.assignee) !== refKey(next.assignee)) {
      next.timeline = [...(next.timeline ?? []), { id: newId(), at: stamp, ...stampOf(actor), kind: 'assign', ...(next.assignee && { given: next.assignee }) }];
    }
    return workedBy(next, actor, stamp);
  });
}

/** The tasks of every list about the record `id` of the collection at `dir`, with their list's path: the open ones first, then by when they are due. */
export function recordTasks(lists: Record<string, Task[]>, dir: string, id: string): { list: string; task: Task }[] {
  const found: { list: string; task: Task }[] = [];
  for (const [list, tasks] of Object.entries(lists)) for (const task of tasks) if (task.record?.collection === dir && task.record.id === id) found.push({ list, task });
  return found.sort((a, b) => Number(a.task.done) - Number(b.task.done) || (a.task.due ?? '9999').localeCompare(b.task.due ?? '9999'));
}

/** Points the tasks about records of the collection at `from` to the collection at `to`, where it went. */
export function relinkTaskRecords(list: TaskList, from: string, to: string): TaskList {
  if (!list.tasks.some((t) => t.record?.collection === from)) return list;
  return { ...list, tasks: list.tasks.map((t) => (t.record?.collection === from ? { ...t, record: { ...t.record, collection: to } } : t)) };
}

/**
 * Completes or reopens a task. Completing a task completes its subtasks too; reopening one
 * reopens the tasks above it, since a finished task cannot have an open subtask. Each one that
 * changes says so on its timeline, and who did it worked on it.
 */
export function setDone(tasks: Task[], id: string, done: boolean, now: Clock = () => new Date(), by?: By): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const affected = new Set([id]);
  if (done) for (const child of descendants(tasks, id)) affected.add(child);
  else for (let task = byId.get(id); task?.parent; task = byId.get(task.parent)) affected.add(task.parent);
  const stamp = iso(now);
  const actor = actorIn(by);
  return tasks.map((t) =>
    affected.has(t.id) && t.done !== done
      ? workedBy({ ...t, done, completed: done ? stamp : null, updated: stamp, timeline: [...(t.timeline ?? []), { id: newId(), at: stamp, ...stampOf(actor), kind: done ? 'done' : 'reopen' }] }, actor, stamp)
      : t,
  );
}

/**
 * Opens again the tasks `ids` names, done ones only: completing them is undone, and so is the
 * entry it wrote when it is the last one, by the same actor; else the timeline says it was opened again.
 */
export function reopenTasks(tasks: Task[], ids: readonly string[], now: Clock = () => new Date(), by?: By): Task[] {
  const open = new Set(ids);
  const stamp = iso(now);
  const actor = actorIn(by);
  return tasks.map((t) => {
    if (!open.has(t.id) || !t.done) return t;
    const last = t.timeline?.at(-1);
    const timeline: TaskEntry[] = last?.kind === 'done' && writtenBy(last, actor) ? t.timeline!.slice(0, -1) : [...(t.timeline ?? []), { id: newId(), at: stamp, ...stampOf(actor), kind: 'reopen' }];
    const next: Task = { ...t, done: false, completed: null, updated: stamp, timeline };
    if (timeline.length === 0) delete next.timeline;
    return next;
  });
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

/** An open task with a due day, and the path of the list it is in. */
export interface DueTask {
  list: string;
  task: Task;
}

function dueTasks(lists: Record<string, Task[]>): DueTask[] {
  return Object.entries(lists)
    .flatMap(([list, tasks]) => tasks.filter((t) => !t.done && t.due).map((task) => ({ list, task })))
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

/** How many days `to` comes after `from`. */
export function daysApart(from: string, to: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * The 42 days a month shows as a calendar of six weeks starting on Monday: from the Monday on or
 * before its first day, with the end of the month before and the start of the one after. `month`
 * is `YYYY-MM`.
 */
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = addDays(`${month}-01`, -((new Date(y, m - 1, 1).getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** A day of Upcoming that has something, or the free days that come before the next such day. */
export type DayRun = { day: string } | { free: { from: string; to: string; count: number } };

/**
 * Upcoming's days from `today` on, in order: each day that has something, and before each the
 * free days since the last one, today's among them, as one run. Nothing comes after the last day.
 */
export function dayRuns(days: Iterable<string>, today: string): DayRun[] {
  const runs: DayRun[] = [];
  let next = today;
  for (const day of [...new Set(days)].filter((d) => d >= today).sort()) {
    if (day > next) runs.push({ free: { from: next, to: addDays(day, -1), count: daysApart(next, day) } });
    runs.push({ day });
    next = addDays(day, 1);
  }
  return runs;
}
