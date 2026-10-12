import type { VaultFs } from './fs';
import type { Me } from './me';
import { mergeFields, mergeRecords } from './sync/merge-records';

// The people of a space: everyone who has opened it, by the id of their `me.json`, with the
// name and the email they had then and when they were last seen. A task or a card is given to
// one of them. Nobody is added by hand; a person without a name is in the list all the same,
// shown as Unnamed until they set one and open the space again. One can be made inactive, and
// is active again the next time they open the space.

const FILE = '.scrawl/people.json';

export interface Person {
  id: string;
  name?: string;
  email?: string;
  /** When they last opened the space, as an ISO time. */
  seen: string;
  active: boolean;
}

const clean = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

export function parsePeople(text: string): Person[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = data && typeof data === 'object' && !Array.isArray(data) ? (data as { people?: unknown }).people : null;
  if (!Array.isArray(list)) return [];
  const people: Person[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, email, seen, active } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim()) continue;
    people.push({
      id: id.trim(),
      ...(clean(name) && { name: clean(name) }),
      ...(clean(email) && { email: clean(email) }),
      seen: typeof seen === 'string' ? seen : '',
      active: active !== false,
    });
  }
  return people;
}

export const serializePeople = (people: Person[]) => `${JSON.stringify({ version: 1, people }, null, 2)}\n`;

export async function loadPeople(fs: VaultFs): Promise<Person[]> {
  try {
    return parsePeople(await fs.readText(FILE));
  } catch {
    return [];
  }
}

export const savePeople = (fs: VaultFs, people: Person[]) => fs.writeText(FILE, serializePeople(people));

/** The person as they are now, in the list: their row brought up to date, or added; opening makes one active again. */
export function withPerson(people: Person[], me: Me, now = new Date()): Person[] {
  const { name: _n, email: _e, ...keep } = people.find((p) => p.id === me.id) ?? { id: me.id, seen: '', active: true };
  const next: Person = { ...keep, ...(me.name && { name: me.name }), ...(me.email && { email: me.email }), seen: now.toISOString(), active: true };
  const rest = people.filter((p) => p.id !== me.id);
  return [...rest, next].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id));
}

/**
 * Whether the list already says this about the person, so that opening a space again writes
 * nothing new: the same name and email, active, and seen today. Being seen is written once a day
 * at most, so that opening the app does not change the space every time.
 */
export function samePerson(people: Person[], me: Me, now = new Date()): boolean {
  const found = people.find((p) => p.id === me.id);
  const seen = found?.seen ? new Date(found.seen) : null;
  const today = !!seen && !Number.isNaN(seen.getTime()) && seen.toDateString() === now.toDateString();
  return !!found && found.active && (found.name ?? '') === (me.name ?? '') && (found.email ?? '') === (me.email ?? '') && today;
}

export function setActive(people: Person[], id: string, active: boolean): Person[] {
  return people.map((p) => (p.id === id ? { ...p, active } : p));
}

/**
 * Someone a task or a card is given to, or who made it: a person of the space by the id of their
 * `me.json`, with the name they had then, so that it shows without the people being read. A name
 * alone is from before a space had people, or an agent's.
 */
export interface PersonRef {
  id?: string;
  name?: string;
}

/** A person as a task or a card has them; a name alone, as files had it before, is read as one. Undefined when it is no one. */
export function readPersonRef(raw: unknown): PersonRef | undefined {
  if (typeof raw === 'string') return clean(raw) ? { name: clean(raw)! } : undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { id, name } = raw as Record<string, unknown>;
  const ref: PersonRef = { ...(clean(id) && { id: clean(id) }), ...(clean(name) && { name: clean(name) }) };
  return ref.id || ref.name ? ref : undefined;
}

/** A person of the space as a task or a card is given to them. */
export const refOf = (person: Pick<Person, 'id' | 'name'>): PersonRef => ({ id: person.id, ...(person.name && { name: person.name }) });

/** What someone given a task is called now: their name among the people, else the name they were given with; none for Unnamed. */
export function refName(ref: PersonRef, people: Person[]): string | undefined {
  const found = ref.id ? people.find((person) => person.id === ref.id) : undefined;
  return found ? found.name : ref.name;
}

/** Whether a task or a card is given to the person with this id. */
export const isMine = (ref: PersonRef | null | undefined, me: string | undefined) => !!me && ref?.id === me;

/** The name a person is shown under; one without a name is Unnamed, which the interface words. */
export const personName = (person: Pick<Person, 'name'>, unnamed: string) => person.name ?? unnamed;

/** The list from three versions: by id, each person's fields as any record's, the later `seen` winning. */
export function mergePeople(base: string, local: string, remote: string): string {
  const merged = mergeRecords<Person>(parsePeople(base), parsePeople(local), parsePeople(remote), (p) => p.id, (was, mine, theirs) => mergeFields(was, mine, theirs, 'seen'));
  return serializePeople(merged);
}
