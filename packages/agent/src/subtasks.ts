import { addSubtask, fold, type Priority, removeSubtask, type Subtask, type SubtaskPatch, updateSubtask } from '@scrawlnotes/core';
import { dayArg } from './cards';
import { Refusal } from './paths';
import { type AgentSpace, personRefOf } from './space';

// A card's and a record's own subtasks as save_card and save_record change them: each one asked
// for is changed when it is named, by its id or its title, and added when it is not. One sent again
// after a cut-off call is not added twice: an open subtask of that title is changed instead.

/** A subtask as the agent asks for it. */
export interface SubtaskArg {
  /** The subtask to change: its id or its title. Left out, one is added, unless an open one has the title. */
  id?: string;
  title?: string;
  done?: boolean;
  due?: string | null;
  priority?: number;
  assignee?: string | null;
  /** Takes it off the list. */
  remove?: boolean;
}

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/** A subtask as the tools give it. */
export const subtaskOut = (subtask: Subtask) => ({
  id: subtask.id,
  title: subtask.title,
  done: subtask.done,
  priority: subtask.priority,
  due: subtask.due,
  ...(subtask.assignee && { assignee: subtask.assignee }),
  ...(subtask.completed && { completed: subtask.completed }),
});

/** The subtask `ref` names: by id, else by its title when only one has it. */
function pickSubtask(list: Subtask[], ref: string): Subtask {
  const byId = list.find((s) => s.id === ref.trim());
  if (byId) return byId;
  const byTitle = list.filter((s) => same(s.title, ref));
  if (byTitle.length === 1) return byTitle[0]!;
  if (byTitle.length > 1) throw new Refusal(`More than one subtask is called ${ref}; say which by id`, { candidates: byTitle.map(subtaskOut) });
  throw new Refusal(`No subtask ${ref}`, { subtasks: list.map(subtaskOut) });
}

/** A list of subtasks with the changes the agent asked for, in their order. */
export async function applySubtasks(space: Pick<AgentSpace, 'fs' | 'personal'>, list: Subtask[], asked: SubtaskArg[], now: Date): Promise<Subtask[]> {
  const clock = () => now;
  let next = list;
  for (const arg of asked) {
    const priority = arg.priority === undefined ? undefined : ([1, 2, 3, 4].includes(arg.priority) ? (arg.priority as Priority) : undefined);
    if (arg.priority !== undefined && priority === undefined) throw new Refusal('A subtask’s priority is 1 (highest) to 4 (none)', { given: arg.priority });
    const due = dayArg(arg.due, 'A subtask’s due');
    const assignee = arg.assignee === undefined ? undefined : await personRefOf(space, arg.assignee);
    const found = arg.id ? pickSubtask(next, arg.id) : arg.title ? next.find((s) => !s.done && same(s.title, arg.title!)) : undefined;
    if (arg.remove) {
      if (found) next = removeSubtask(next, found.id);
      continue;
    }
    const patch: SubtaskPatch = {
      ...(arg.done !== undefined && { done: arg.done }),
      ...(priority !== undefined && { priority }),
      ...(due !== undefined && { due }),
      ...(assignee !== undefined && { assignee }),
    };
    if (found) {
      next = updateSubtask(next, found.id, { ...patch, ...(arg.id && arg.title !== undefined && { title: arg.title }) }, clock);
      continue;
    }
    const title = arg.title?.trim();
    if (!title) throw new Refusal('A new subtask needs a title');
    next = addSubtask(next, { title, ...(priority && { priority }), ...(due !== undefined && { due }), ...(assignee && { assignee }) }, clock);
    if (arg.done) next = updateSubtask(next, next[next.length - 1]!.id, { done: true }, clock);
  }
  return next;
}
