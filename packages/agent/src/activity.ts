import { type Board, type Card, loadPeople, type PersonRef, type Person, type Task, type VaultFs, workersOf } from '@scrawlnotes/core';
import { nameIn } from './space';

// What mattered on a card or a task, as the tools give it (design/activity.md 5): who worked on
// it, the latest first, and its entries with who wrote each, all by name; an agent's with whose
// it is. A card's comments come on their own, not among these.

/** The most entries a card or a task gives of what mattered on it: the latest. */
export const ACTIVITY_SHOWN = 20;

/** Who is who in a space, its agents too: its people as the space has them, none when it has none. */
export type People = Person[];

export const peopleIn = (fs: VaultFs): Promise<People> => loadPeople(fs).catch(() => []);

/** One who wrote an entry, by name; nobody when the entry says no one. */
export function writerOf(entry: { by?: string; byId?: string }, people: People): string | undefined {
  return nameIn({ ...(entry.byId && { id: entry.byId }), ...(entry.by && { name: entry.by }) }, people) || undefined;
}

/** Who worked on it, the latest first, by name. */
export const workedOnNames = (item: Card | Task, people: People): string[] => workersOf(item).map((w) => nameIn(w, people));

/** Who worked on it, the latest first, by name, with when each last did. */
export const workedOnOut = (item: Card | Task, people: People) => workersOf(item).map((w) => ({ name: nameIn(w, people), at: w.at }));

interface Entry {
  at: string;
  by?: string;
  kind: string;
  [key: string]: unknown;
}

/** It was made, by its author when it has one: the first of what mattered on it. */
const createdOf = (item: { created: string; author?: PersonRef | null }, people: People): Entry => {
  const by = item.author && nameIn(item.author, people);
  return { at: item.created, ...(by && { by }), kind: 'created' };
};

/** The latest of the entries, in the order they were written. */
const latest = (entries: Entry[]): Entry[] => [...entries].sort((a, b) => a.at.localeCompare(b.at)).slice(-ACTIVITY_SHOWN);

/** What mattered on a card: made, moved from a column to another, given to someone, subtasks ticked. */
export function cardActivity(board: Board, card: Card, people: People): Entry[] {
  const column = (id: string | null) => (id ? (board.columns.find((c) => c.id === id)?.name ?? id) : null);
  const subtask = (id: string) => card.subtasks?.find((s) => s.id === id)?.title ?? id;
  const entries = [createdOf(card, people)];
  for (const entry of card.timeline) {
    const by = writerOf(entry, people);
    const head = { at: entry.at, ...(by && { by }) };
    if (entry.kind === 'move') entries.push({ ...head, kind: 'move', from: column(entry.from), to: column(entry.to) });
    else if (entry.kind === 'assign') entries.push({ ...head, kind: 'assign', given: entry.given ? nameIn(entry.given, people) : null });
    else if (entry.kind === 'tick') entries.push({ ...head, kind: 'tick', subtasks: entry.subtasks.map(subtask) });
  }
  return latest(entries);
}

/** What mattered on a task: made, given to someone, done, opened again. */
export function taskActivity(task: Task, people: People): Entry[] {
  const entries = [createdOf(task, people)];
  for (const entry of task.timeline ?? []) {
    const by = writerOf(entry, people);
    const head = { at: entry.at, ...(by && { by }) };
    if (entry.kind === 'assign') entries.push({ ...head, kind: 'assign', given: entry.given ? nameIn(entry.given, people) : null });
    else if (entry.kind === 'done' || entry.kind === 'reopen') entries.push({ ...head, kind: entry.kind });
  }
  return latest(entries);
}
