import {
  addTask,
  fold,
  INBOX_TASKS,
  listName,
  loadCollection,
  loadList,
  type NewTask,
  type Priority,
  saveList,
  serializeList,
  setDone,
  type Task,
  type TaskList,
  type TaskRecord,
  updateTask,
  type VaultFs,
} from '@scrawlnotes/core';
import { dayArg } from './cards';
import { Refusal } from './paths';
import { actorOf, type Agent, type Client, type Element, elementsOf, exists, nowOf, personRefOf, pickElement, pickRecord, pickSpace, todayOf } from './space';

// Tasks: what is due, the tasks of a list, adding and closing one. A task without a list goes to
// the personal space's Inbox, as Todoist's.

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

export async function tasksTool(agent: Agent, args: { space?: string; list?: string; due?: 'overdue' | 'today' | 'upcoming'; assignee?: string; done?: boolean | 'all' }) {
  const space = await pickSpace(agent, args.space);
  const lists: Element[] = args.list ? [await pickElement(space.fs, args.list, ['tasks'], 'task list')] : await elementsOf(space.fs, ['tasks']);
  const today = todayOf(agent);
  const out: ReturnType<typeof taskOut>[] = [];
  for (const list of lists) {
    const loaded = await loadList(space.fs, list.path);
    for (const task of loaded.tasks) {
      if (args.done !== 'all' && task.done !== (args.done ?? false)) continue;
      if (args.due === 'overdue' && !(task.due && task.due < today)) continue;
      if (args.due === 'today' && task.due !== today) continue;
      if (args.due === 'upcoming' && !(task.due && task.due > today)) continue;
      if (args.assignee && !(task.assignee && ((task.assignee.name && same(task.assignee.name, args.assignee)) || task.assignee.id === args.assignee))) continue;
      out.push(taskOut(list.path, loaded, task));
    }
  }
  out.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.priority - b.priority);
  return { data: { space: space.id, today, total: out.length, tasks: out } };
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
  section?: string;
  parent?: string;
  done?: boolean;
}

export async function saveTaskTool(agent: Agent, client: Client, args: TaskArgs) {
  const space = await pickSpace(agent, args.space);
  let path: string;
  if (args.list) path = (await pickElement(space.fs, args.list, ['tasks'], 'task list')).path;
  else if (space.personal) {
    path = INBOX_TASKS;
    if (!(await exists(space.fs, path))) await space.fs.writeText(path, serializeList({ sections: [], tasks: [] }));
  } else throw new Refusal('Which list? This space has no Inbox; name a task list', { lists: (await elementsOf(space.fs, ['tasks'])).map((l) => ({ title: l.title, path: l.path })) });
  const list = await loadList(space.fs, path);
  const now = nowOf(agent);
  const clock = () => now;
  const priority = args.priority === undefined ? undefined : ([1, 2, 3, 4].includes(args.priority) ? (args.priority as Priority) : undefined);
  if (args.priority !== undefined && priority === undefined) throw new Refusal('Priority is 1 (highest) to 4 (none)', { given: args.priority });
  const due = dayArg(args.due, 'Due');
  const assignee = args.assignee === undefined ? undefined : await personRefOf(space.fs, args.assignee);
  const record = args.record === undefined ? undefined : await recordRefOf(space.fs, args.record);
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
      },
      clock,
    );
  } else {
    const title = args.title?.trim();
    if (!title) throw new Refusal('A new task needs a title');
    const section = args.section ? (list.sections.find((s) => s.id === args.section) ?? list.sections.find((s) => same(s.name, args.section!))) : undefined;
    if (args.section && !section) throw new Refusal(`No section called ${args.section} in ${listName(path)}`, { sections: list.sections.map((s) => s.name) });
    if (args.parent && !tasks.some((t) => t.id === args.parent)) throw new Refusal(`No task ${args.parent} to put this one under`, { list: path });
    const by = actorOf(client, await agent.person());
    const input: NewTask = {
      title,
      ...(section && { section: section.id }),
      ...(args.parent && { parent: args.parent }),
      ...(args.description !== undefined && { description: args.description }),
      ...(due !== undefined && { due }),
      ...(priority !== undefined && { priority }),
      ...(assignee && { assignee }),
      ...(record && { record }),
      ...(by && { author: { name: by } }),
    };
    const before = tasks.length;
    tasks = addTask(tasks, input, clock);
    if (tasks.length === before) throw new Refusal('The task could not be added');
    id = tasks[tasks.length - 1]!.id;
    created = true;
  }
  if (args.done !== undefined) tasks = setDone(tasks, id, args.done, clock);
  const saved: TaskList = { ...list, tasks };
  await saveList(space.fs, path, saved);
  return { data: { space: space.id, list: path, created, task: taskOut(path, saved, tasks.find((t) => t.id === id)!) } };
}
