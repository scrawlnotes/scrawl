import type { VaultFs } from './fs';
import type { Me } from './me';
import { mergeFields, mergeRecords } from './sync/merge-records';

// The people of a space: everyone who has opened it, by the id of their `me.json`, with the
// name and the email they had then and when they were last seen. A task or a card is given to
// one of them. Nobody is added by hand; a person without a name is in the list all the same,
// shown as Unnamed until they set one and open the space again. One can be made inactive, and
// is active again the next time they open the space. An agent is one of them too, written the
// first time it changes something there (design/activity.md 2.3).

const FILE = '.scrawl/people.json';

export interface Person {
  id: string;
  name?: string;
  email?: string;
  /** When they last opened the space, as an ISO time; an agent, when it last changed something. */
  seen: string;
  active: boolean;
  /** An agent's: the client it is and where it runs. Whose agent it is, its id says. */
  agent?: AgentPlace;
}

/** What an agent is, beside its name: its client as it names itself, the computer it runs on, if one, and its person's name. */
export interface AgentPlace {
  client?: string;
  place?: string;
  /** Its person's name when it last wrote itself in: whose it is shows by it where the person is not among the space's people. */
  owner?: string;
}

const clean = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

function readAgentPlace(raw: unknown): AgentPlace | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { client, place, owner } = raw as Record<string, unknown>;
  return { ...(clean(client) && { client: clean(client) }), ...(clean(place) && { place: clean(place) }), ...(clean(owner) && { owner: clean(owner) }) };
}

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
    const { id, name, email, seen, active, agent, ...rest } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim()) continue;
    const place = readAgentPlace(agent);
    people.push({
      // Unknown fields are kept, so a newer version's data survives being saved by an older one.
      ...rest,
      id: id.trim(),
      ...(clean(name) && { name: clean(name) }),
      ...(clean(email) && { email: clean(email) }),
      seen: typeof seen === 'string' ? seen : '',
      active: active !== false,
      ...(place && { agent: place }),
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
  return !!found && found.active && (found.name ?? '') === (me.name ?? '') && (found.email ?? '') === (me.email ?? '') && seenToday(found, now);
}

/** Whether a row was seen on the day of `now`, in the local calendar. */
function seenToday(person: Person, now: Date): boolean {
  const seen = person.seen ? new Date(person.seen) : null;
  return !!seen && !Number.isNaN(seen.getTime()) && seen.toDateString() === now.toDateString();
}

/**
 * An agent as it writes itself into a space: its id, `<its person's id>:<its own>`, which tells
 * whose it is; its name; the client it is and the computer it runs on, if one.
 */
export interface AgentRow extends AgentPlace {
  id: string;
  name: string;
}

/** The id of a person's agent: theirs, a colon, and the agent's own. A person's id never has a colon. */
export const agentId = (person: string, own: string) => `${person}:${own}`;

/** Whether an id is an agent's rather than a person's. */
export const isAgentId = (id: string | undefined): boolean => !!id && id.includes(':');

/** The id of the person an agent is of; the id itself when it is a person's. */
export const ownerOf = (id: string): string => (isAgentId(id) ? id.slice(0, id.indexOf(':')) : id);

/** Whether a person of a space is an agent. */
export const isAgent = (person: Pick<Person, 'id'>) => isAgentId(person.id);

/** Whose an agent is, by name: its person's as the space's people have it now, else as the agent last wrote it. */
export function ownerName(agent: Pick<Person, 'id' | 'agent'>, people: Person[]): string | undefined {
  const owner = people.find((p) => p.id === ownerOf(agent.id) && !isAgent(p));
  return owner?.name ?? agent.agent?.owner;
}

/** The agent as it is now, in the list: its row brought up to date, or added; changing something makes it active again. */
export function withAgent(people: Person[], agent: AgentRow, now = new Date()): Person[] {
  const { name: _n, agent: _a, ...keep } = people.find((p) => p.id === agent.id) ?? { id: agent.id, seen: '', active: true };
  const place: AgentPlace = { ...(agent.client && { client: agent.client }), ...(agent.place && { place: agent.place }), ...(agent.owner && { owner: agent.owner }) };
  const next: Person = { ...keep, name: agent.name, agent: place, seen: now.toISOString(), active: true };
  const rest = people.filter((p) => p.id !== agent.id);
  return [...rest, next].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id));
}

/** Whether the list already says this about the agent, active and seen today: then its change writes nothing more. */
export function sameAgent(people: Person[], agent: AgentRow, now = new Date()): boolean {
  const found = people.find((p) => p.id === agent.id);
  return (
    !!found &&
    found.active &&
    found.name === agent.name &&
    (found.agent?.client ?? '') === (agent.client ?? '') &&
    (found.agent?.place ?? '') === (agent.place ?? '') &&
    (found.agent?.owner ?? '') === (agent.owner ?? '') &&
    seenToday(found, now)
  );
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
