import type { PersonRef } from './people';

// Who did what on a card or a task (design/activity.md): who changes it, a person or an agent,
// by name and id; the entries its timeline keeps, each with who wrote it; and everyone who worked
// on it, once each. A card's and a task's timelines keep entries of their own kinds over these.

/** Who changes a card or a task: the name its timeline is written with, and the id of the person or the agent when it is known (design/activity.md 3.1). */
export interface Actor {
  name?: string;
  id?: string;
}

/** Who, as what changes a board or a list takes it: a name alone, as before, or an actor. */
export type By = string | Actor | undefined;

/** The actor a `By` stands for; nobody when it is none. */
export const actorIn = (by: By): Actor => (typeof by === 'string' ? { name: by } : (by ?? {}));

/** When an entry of a timeline was written, and by whom: the name it was written with, and the id. */
export interface Stamp {
  id: string;
  at: string;
  by?: string;
  byId?: string;
}

/** Someone who changed a card or a task, a person or an agent, once each, with when they last did. */
export interface WorkedOn {
  id?: string;
  name?: string;
  at: string;
}

export const isObject = (raw: unknown): raw is { [key: string]: unknown } => typeof raw === 'object' && raw !== null && !Array.isArray(raw);

/** An entry's stamp as a file has it; null when it has no id or time. The rest of the entry beside it. */
export function readStamp(raw: unknown): { stamp: Stamp; kind: unknown; rest: { [key: string]: unknown } } | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.at !== 'string') return null;
  const { id, at, by, byId, kind, ...rest } = raw;
  return { stamp: { id: raw.id, at: raw.at, ...(typeof by === 'string' && { by }), ...(typeof byId === 'string' && { byId }) }, kind, rest };
}

/** Who worked on a card or a task, as the file has them: each with when, and an id or a name. */
export function readWorkedOn(list: unknown): WorkedOn[] {
  if (!Array.isArray(list)) return [];
  const out: WorkedOn[] = [];
  for (const raw of list) {
    if (!isObject(raw) || typeof raw.at !== 'string') continue;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : undefined;
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined;
    if (!id && !name) continue;
    const worker: WorkedOn = { ...(id && { id }), ...(name && { name }), at: raw.at };
    if (!out.some((w) => workerKey(w) === workerKey(worker))) out.push(worker);
  }
  return out;
}

/** Who a worker is, to find them again: their id, else their name. */
export const workerKey = (worker: { id?: string; name?: string }): string => worker.id ?? `name:${worker.name ?? ''}`;

/** Those who worked on a card or a task, the latest first. */
export const workersOf = (item: { workedOn?: WorkedOn[] }): WorkedOn[] => [...(item.workedOn ?? [])].sort((a, b) => b.at.localeCompare(a.at));

/** Who worked on it from three versions: everyone either side has, each at the later time. */
export function mergeWorkedOn(...lists: (WorkedOn[] | undefined)[]): WorkedOn[] {
  const merged = new Map<string, WorkedOn>();
  for (const worker of lists.flatMap((list) => list ?? [])) {
    const had = merged.get(workerKey(worker));
    if (!had || had.at < worker.at) merged.set(workerKey(worker), worker);
  }
  return [...merged.values()];
}

/** It with the actor among those who worked on it, at `stamp`; as it was when the actor is no one. */
export function workedBy<T extends { workedOn?: WorkedOn[] }>(item: T, actor: Actor, stamp: string): T {
  if (!actor.id && !actor.name) return item;
  const worker: WorkedOn = { ...(actor.id && { id: actor.id }), ...(actor.name && { name: actor.name }), at: stamp };
  return { ...item, workedOn: [...(item.workedOn ?? []).filter((w) => workerKey(w) !== workerKey(worker)), worker] };
}

/** What an entry of a timeline says of who wrote it. */
export const stampOf = (actor: Actor) => ({ ...(actor.name && { by: actor.name }), ...(actor.id && { byId: actor.id }) });

/** Whether an entry was written by the actor. */
export const writtenBy = (entry: Stamp, actor: Actor) => (actor.id ? entry.byId === actor.id : !entry.byId && entry.by === actor.name);

/** A person something is given to, to tell whether it changed: their id, else their name. */
export const refKey = (ref: PersonRef | null | undefined) => (ref ? (ref.id ?? `name:${ref.name ?? ''}`) : '');
