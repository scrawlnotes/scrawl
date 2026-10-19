import {
  addTask,
  childrenOf,
  depthOf,
  fold,
  INBOX_TASKS,
  listName,
  loadCollection,
  loadList,
  MAX_DEPTH,
  moveTask,
  moveTaskToList,
  type NewTask,
  type Priority,
  saveList,
  sectionTasks,
  serializeList,
  setDone,
  type Task,
  type TaskList,
  type TaskRecord,
  updateTask,
  type VaultFs,
} from '@scrawlnotes/core';
import { checkItems, dayArg } from './cards';
import { Refusal } from './paths';
import { actorOf, type Agent, type AgentSpace, type Client, type Due, dueIs, type Element, elementsOf, exists, isAssignee, noteRefOf, nowOf, personRefOf, pickAcross, pickElement, pickRecord, pickSpace, todayOf } from './space';

// Tasks: what is due, the tasks of a list, adding, moving and closing one. A task without a list
// goes to the personal space's Inbox, as Todoist's.

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/** A task as the tools give it. */
export function taskOut(list: string, tasks: TaskList, task: Task) {
  const section = task.section ? tasks.sections.find((s) => s.id === task.section) : undefined;
  return {
    id: task.id,
    list,
    listName: listName(list),
    title: task.title,
    done: task.done,
    due: task.due,
    priority: task.priority,
    ...(task.description && { description: task.description }),
    ...(section && { section: section.name }),
    ...(task.parent && { parent: task.parent }),
    assignee: task.assignee ?? null,
    ...(task.record && { record: task.record }),
    ...(task.note && { note: task.note }),
    ...(task.card && { card: task.card }),
    created: task.created,
    updated: task.updated,
    completed: task.completed,
  };
}

export async function tasksTool(agent: Agent, args: { space?: string; list?: string; due?: Due; assignee?: string; done?: boolean | 'all' }) {
  const spaces = await agent.spaces();
  // With no list and no space named, a day or a person looks in every space: what is due today, wherever it is.
  const across = !args.list && !args.space?.trim() && spaces.length > 1;
  let places: { space: AgentSpace; lists: Element[] }[];
  if (args.list) {
    const { space, element } = await pickAcross(agent, args.space, args.list, ['tasks'], 'task list');
    places = [{ space, lists: [element] }];
  } else if (across) {
    if (!args.due && !args.assignee) throw new Refusal('Which space? Name one with `space`, or give due or assignee to look in every space', { spaces: spaces.map(({ id, name, where }) => ({ id, name, where })) });
    places = await Promise.all(spaces.map(async (space) => ({ space, lists: await elementsOf(space.fs, ['tasks']) })));
  } else {
    const space = await pickSpace(agent, args.space);
    places = [{ space, lists: await elementsOf(space.fs, ['tasks']) }];
  }
  const today = todayOf(agent);
  const person = args.assignee ? await agent.person() : null;
  const out: (ReturnType<typeof taskOut> & { space?: string; spaceName?: string })[] = [];
  for (const { space, lists } of places) {
    for (const list of lists) {
      const loaded = await loadList(space.fs, list.path);
      for (const task of loaded.tasks) {
        if (args.done !== 'all' && task.done !== (args.done ?? false)) continue;
        if (args.due && !dueIs(task.due, args.due, today)) continue;
        if (args.assignee && !isAssignee(task.assignee, args.assignee, person)) continue;
        out.push({ ...taskOut(list.path, loaded, task), ...(across && { space: space.id, spaceName: space.name }) });
      }
    }
  }
  out.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.priority - b.priority);
  return { data: { ...(!across && { space: places[0]!.space.id }), today, total: out.length, tasks: out } };
}

/** The record a task is about, as the agent named it: by name, code or id across the space's collections, or in one collection. */
async function recordRefOf(fs: VaultFs, ref: string | { collection: string; record: string } | null): Promise<TaskRecord | null> {
  if (ref === null) return null;
  if (typeof ref !== 'string') {
    const element = await pickElement(fs, ref.collection, ['collection'], 'collection');
    const collection = await loadCollection(fs, element.path);
    const record = pickRecord(collection, ref.record);
    return { collection: element.path, id: record.id, name: record.name, ...(record.code && { code: record.code }) };
  }
  const wanted = ref.trim();
  if (!wanted) return null;
  const found: TaskRecord[] = [];
  for (const element of await elementsOf(fs, ['collection'])) {
    const collection = await loadCollection(fs, element.path).catch(() => null);
    if (!collection) continue;
    for (const record of collection.records) {
      if (record.id === wanted || (record.name && same(record.name, wanted)) || (record.code && same(record.code, wanted))) {
        found.push({ collection: element.path, id: record.id, name: record.name, ...(record.code && { code: record.code }) });
      }
    }
  }
  if (found.length === 1) return found[0]!;
  if (found.length > 1) throw new Refusal(`More than one record is called ${ref}; say which with its collection`, { candidates: found });
  throw new Refusal(`No record is called ${ref} in this space`);
}

export interface TaskArgs {
  space?: string;
  list?: string;
  id?: string;
  title?: string;
  description?: string;
  due?: string | null;
  priority?: number;
  assignee?: string | null;
  record?: string | { collection: string; record: string } | null;
  /** The note it is about, by path or name; null unlinks it. */
  note?: string | null;
  /** The section it goes in, by name or id; null for none. */
  section?: string | null;
  /** The task it goes under, by id; null for the top level. */
  parent?: string | null;
  /** Another list to move a task that is there to, by name or path. */
  toList?: string;
  done?: boolean;
  /** Add it even though an open task with its title is there already. */
  another?: boolean;
  /** Many tasks at once in the list, each with the fields of one: all written, or none. */
  items?: TaskItem[];
}

const DEEPEST = `subtasks go at most ${MAX_DEPTH} levels below a top-level task`;

/** The section `ref` names in a list, by id or name; null for none. */
function sectionOf(list: TaskList, path: string, ref: string | null): string | null {
  if (ref === null || !ref.trim()) return null;
  const section = list.sections.find((s) => s.id === ref) ?? list.sections.find((s) => same(s.name, ref));
  if (!section) throw new Refusal(`No section called ${ref} in ${listName(path)}`, { sections: list.sections.map((s) => s.name) });
  return section.id;
}

/**
 * A task that is there put where the agent asked, at the end of its new siblings: under `parent`
 * (null for the top level), or at the top level in `section`. Refused where it cannot go.
 */
function placeTask(list: TaskList, path: string, id: string, parentArg: string | null | undefined, sectionArg: string | null | undefined, clock: () => Date): TaskList {
  const task = list.tasks.find((t) => t.id === id)!;
  const parent = parentArg !== undefined ? parentArg : sectionArg !== undefined ? null : task.parent;
  if (parent !== null && !list.tasks.some((t) => t.id === parent)) throw new Refusal(`No task ${parent} to put this one under`, { list: path });
  const section = parent !== null ? null : sectionArg !== undefined ? sectionOf(list, path, sectionArg) : task.parent === null ? (task.section ?? null) : null;
  const siblings = (parent === null ? sectionTasks(list, section) : childrenOf(list.tasks, parent)).filter((t) => t.id !== id);
  const moved = moveTask(list, id, { parent, section, after: siblings[siblings.length - 1]?.id ?? null }, clock);
  const placed = moved.tasks.find((t) => t.id === id)!;
  if (placed.parent !== parent || (parent === null && (placed.section ?? null) !== section)) {
    throw new Refusal(`${task.title} cannot go there: a task does not go under itself or its own subtasks, and ${DEEPEST}`, { id });
  }
  return moved;
}

/** Where a new task with neither a space nor a list goes: the personal space, when the agent reaches it. */
async function inboxSpace(agent: Agent, ref?: string): Promise<AgentSpace> {
  if (!ref?.trim()) {
    const personal = (await agent.spaces()).find((each) => each.personal);
    if (personal) return personal;
  }
  return pickSpace(agent, ref);
}


/** One task of many, as `items` gives it: what one task takes, but the list. */
export type TaskItem = Omit<TaskArgs, 'space' | 'list' | 'items' | 'toList'>;

/** What one task's turn did: the list as it is now, the task, and whether it was added, changed or already there. */
interface TaskDone {
  list: TaskList;
  id: string;
  status: 'created' | 'changed' | 'exists';
  message?: string;
}

/** One task added or changed, or, with `items`, many in one list in one go. */
export function saveTaskTool(agent: Agent, client: Client, args: TaskArgs & { items: TaskItem[] }): ReturnType<typeof saveTasks>;
export function saveTaskTool(agent: Agent, client: Client, args: TaskArgs & { items?: undefined }): ReturnType<typeof saveTask>;
export function saveTaskTool(agent: Agent, client: Client, args: TaskArgs): ReturnType<typeof saveTask> | ReturnType<typeof saveTasks>;
export function saveTaskTool(agent: Agent, client: Client, args: TaskArgs) {
  return args.items ? saveTasks(agent, client, { ...args, items: args.items }) : saveTask(agent, client, args);
}

/** The list a task or tasks go in: the one named, in whichever space has it, or the personal space's Inbox; with the clock and the actor. */
async function taskPlace(agent: Agent, client: Client, args: TaskArgs) {
  let space: AgentSpace;
  let path: string;
  if (args.list) {
    const found = await pickAcross(agent, args.space, args.list, ['tasks'], 'task list');
    space = found.space;
    path = found.element.path;
  } else {
    space = args.id ? await pickSpace(agent, args.space) : await inboxSpace(agent, args.space);
    if (!space.personal) throw new Refusal('Which list? This space has no Inbox; name a task list', { lists: (await elementsOf(space.fs, ['tasks'])).map((l) => ({ title: l.title, path: l.path })) });
    path = INBOX_TASKS;
    if (!(await exists(space.fs, path))) await space.fs.writeText(path, serializeList({ sections: [], tasks: [] }));
  }
  const now = nowOf(agent);
  return { space, path, list: await loadList(space.fs, path), clock: () => now, by: actorOf(client, await agent.person()) };
}

async function saveTask(agent: Agent, client: Client, args: TaskArgs) {
  const { space, path, list, clock, by } = await taskPlace(agent, client, args);
  if (args.toList && !args.id) throw new Refusal('toList moves a task that is there; to add a task to another list, give that list as list');
  const target = args.toList ? await pickElement(space.fs, args.toList, ['tasks'], 'task list') : undefined;
  const elsewhere = target && target.path !== path ? target.path : undefined;
  if (elsewhere && args.parent) throw new Refusal('A task moved to another list goes at its top level; move it first, then give parent');
  const step = await applyTask(space, list, path, args, clock, by, !elsewhere);
  const where = { space: space.id, spaceName: space.name };
  if (step.status === 'exists') return { data: { ...where, list: path, created: false, exists: true, message: step.message, task: taskOut(path, list, list.tasks.find((t) => t.id === step.id)!) } };
  const created = step.status === 'created';
  if (elsewhere) {
    const to = await loadList(space.fs, elsewhere);
    const moved = moveTaskToList(step.list, to, step.id, sectionOf(to, elsewhere, args.section ?? null), clock);
    await saveList(space.fs, path, moved.from);
    await saveList(space.fs, elsewhere, moved.to);
    return { data: { ...where, list: elsewhere, from: path, created, task: taskOut(elsewhere, moved.to, moved.to.tasks.find((t) => t.id === step.id)!) } };
  }
  await saveList(space.fs, path, step.list);
  return { data: { ...where, list: path, created, task: taskOut(path, step.list, step.list.tasks.find((t) => t.id === step.id)!) } };
}

async function saveTasks(agent: Agent, client: Client, args: TaskArgs & { items: TaskItem[] }) {
  checkItems(args, args.items, 'task');
  const { space, path, clock, by, ...place } = await taskPlace(agent, client, args);
  let { list } = place;
  // Every task is checked and laid in the list before anything is written: one refused, none written.
  const done: TaskDone[] = [];
  for (const [i, item] of args.items.entries()) {
    try {
      if ((item as TaskArgs).toList) throw new Refusal('toList moves one task at a time, without items');
      const step = await applyTask(space, list, path, item, clock, by, true);
      list = step.list;
      done.push(step);
    } catch (error) {
      if (error instanceof Refusal) throw new Refusal(`Item ${i + 1}: ${error.message}; nothing was written`, { item: i + 1, ...error.details });
      throw error;
    }
  }
  if (done.some((step) => step.status !== 'exists')) await saveList(space.fs, path, list);
  const count = (status: TaskDone['status']) => done.filter((step) => step.status === status).length;
  return {
    data: {
      space: space.id,
      spaceName: space.name,
      list: path,
      created: count('created'),
      changed: count('changed'),
      exists: count('exists'),
      tasks: done.map((step) => ({ status: step.status, ...taskOut(path, list, list.tasks.find((t) => t.id === step.id)!) })),
    },
  };
}

/** One task added to `list` or changed in it, as `args` asks, placed where it asks when `place`; the list is not written. */
async function applyTask(space: AgentSpace, list: TaskList, path: string, args: TaskItem, clock: () => Date, by: string | undefined, place: boolean): Promise<TaskDone> {
  const priority = args.priority === undefined ? undefined : ([1, 2, 3, 4].includes(args.priority) ? (args.priority as Priority) : undefined);
  if (args.priority !== undefined && priority === undefined) throw new Refusal('Priority is 1 (highest) to 4 (none)', { given: args.priority });
  const due = dayArg(args.due, 'Due');
  const assignee = args.assignee === undefined ? undefined : await personRefOf(space, args.assignee);
  const record = args.record === undefined ? undefined : await recordRefOf(space.fs, args.record);
  const note = await noteRefOf(space.fs, args.note);
  let tasks = list.tasks;
  let id: string;
  let created = false;
  if (args.id) {
    const found = tasks.find((t) => t.id === args.id) ?? tasks.filter((t) => same(t.title, args.id!));
    const task = Array.isArray(found) ? (found.length === 1 ? found[0] : undefined) : found;
    if (!task) {
      if (Array.isArray(found) && found.length > 1) throw new Refusal(`More than one task is called ${args.id}; say which by id`, { candidates: found.map((t) => ({ id: t.id, title: t.title })) });
      throw new Refusal(`No task ${args.id} in ${listName(path)}`, { list: path });
    }
    if (args.title !== undefined && !args.title.trim()) throw new Refusal('A task’s title cannot be empty; leave title out to keep it', { id: task.id });
    id = task.id;
    tasks = updateTask(
      tasks,
      id,
      {
        ...(args.title !== undefined && { title: args.title }),
        ...(args.description !== undefined && { description: args.description }),
        ...(due !== undefined && { due }),
        ...(priority !== undefined && { priority }),
        ...(assignee !== undefined && { assignee }),
        ...(record !== undefined && { record }),
        ...(note !== undefined && { note }),
      },
      clock,
    );
  } else {
    const title = args.title?.trim();
    if (!title) throw new Refusal('A new task needs a title');
    const parent = args.parent ?? null;
    const section = parent === null ? sectionOf(list, path, args.section ?? null) : null;
    if (parent !== null && !tasks.some((t) => t.id === parent)) throw new Refusal(`No task ${parent} to put this one under`, { list: path });
    if (parent !== null && depthOf(tasks, parent) >= MAX_DEPTH) throw new Refusal(`${title} cannot go under that task: ${DEEPEST}`, { parent });
    // A cut-off call sent again must not add the task twice; a list rarely means to hold two open tasks of one title in one place.
    const twins = args.another ? [] : tasks.filter((t) => !t.done && t.parent === parent && same(t.title, title));
    if (twins.length > 1) throw new Refusal(`More than one open task is already called ${title} here; nothing was added. Give id to change one of them, or another: true to add one more`, { candidates: twins.map((t) => ({ id: t.id, title: t.title })) });
    if (twins.length === 1) {
      const found = twins[0]!;
      const message = `An open task called ${title} is already in ${listName(path)}; nothing was added. To change it, give its id ${found.id}; to add a second one with this title on purpose, pass another: true.`;
      return { list, id: found.id, status: 'exists', message };
    }
    const input: NewTask = {
      title,
      ...(section !== null && { section }),
      ...(parent !== null && { parent }),
      ...(args.description !== undefined && { description: args.description }),
      ...(due !== undefined && { due }),
      ...(priority !== undefined && { priority }),
      ...(assignee && { assignee }),
      ...(record && { record }),
      ...(note && { note }),
      ...(by && { author: { name: by } }),
    };
    const before = tasks.length;
    tasks = addTask(tasks, input, clock);
    if (tasks.length === before) throw new Refusal('The task could not be added');
    id = tasks[tasks.length - 1]!.id;
    created = true;
  }
  if (args.done !== undefined) tasks = setDone(tasks, id, args.done, clock);
  let next: TaskList = { ...list, tasks };
  if (!created && place && (args.parent !== undefined || args.section !== undefined)) next = placeTask(next, path, id, args.parent, args.section, clock);
  return { list: next, id, status: created ? 'created' : 'changed' };
}
