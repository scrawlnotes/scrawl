import {
  basename,
  BOARD_EXT,
  type Collection,
  type Entry,
  dayIn,
  dirname,
  fileNameOf,
  fold,
  loadPeople,
  type PersonRef,
  type Record as CollectionRecord,
  readTree,
  refOf,
  shownName,
  TASK_LIST_EXT,
  type TreeNode,
  type VaultFs,
  wallClock,
} from '@scrawlnotes/core';
import { Refusal } from './paths';

// The agent's view of what it may reach: spaces, each a file system of its own, and finding things
// in them by name the way a person does. One match is used; more than one is never guessed at,
// the candidates come back and the agent asks; none brings the nearest names. See design/agent.md, 4.

/** A space as the agent sees it: where it is, and its files. */
export interface AgentSpace {
  /** The space's id; `personal` for the personal space. */
  id: string;
  name: string;
  /** Where it lives, in words: "this computer", "OneDrive", a server's address. */
  where: string;
  personal: boolean;
  fs: VaultFs;
  /**
   * The store keeps every version of every file itself, as a server does: nothing is written
   * beside a note when it is written over. Without it, a note's earlier text is kept in the
   * space's history, as the app keeps it on a device.
   */
  versioned?: boolean;
}

/** The person the agent works for: the one signed in, or the owner of the vault. */
export interface Person {
  id?: string;
  name?: string;
}

/** What a door gives the tools: the spaces, the person and the clock. */
export interface Agent {
  spaces(): Promise<AgentSpace[]>;
  person(): Promise<Person | null>;
  now?: () => Date;
  /** The person's time zone, as `Europe/Istanbul`, when the door knows it: a server's own is not theirs. This computer's when left out. */
  timeZone?: string;
  /** The client, when the door knows it better than the protocol says: on the server, the OAuth client that signed in. */
  client?: Client;
}

/** The client that is calling, as it names itself: "Claude Code", "Claude", "ChatGPT", "Cursor". */
export interface Client {
  name?: string;
}

/** The name an agent writes the times of what it makes under, beside each device's own. */
export const AGENT_DEVICE = 'agent';

export const nowOf = (agent: Agent): Date => (agent.now ?? (() => new Date()))();

/** Today as `YYYY-MM-DD`, in the person's time zone, else in the local calendar. */
export const todayOf = (agent: Agent): string => dayIn(nowOf(agent), agent.timeZone);

/** Now as the person's clock shows it, for what is named by the moment, as a note never named. */
export const clockOf = (agent: Agent): Date => wallClock(nowOf(agent), agent.timeZone);

/** Who a change is written as: "Claude Code · Kaan"; the client alone when the person has no name. */
export function actorOf(client: Client, person: Person | null): string | undefined {
  const parts = [client.name?.trim(), person?.name?.trim()].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/** The items whose title has a word of `ref`; at most twenty, none when nothing is near. */
function nearest<T extends { title: string }>(items: T[], ref: string): T[] {
  const words = fold(ref).split(/\s+/).filter(Boolean);
  return items.filter((item) => words.some((word) => fold(item.title).includes(word))).slice(0, 20);
}

/** The space `ref` names, by id or name; the only one when there is one and nothing was named. */
export async function pickSpace(agent: Agent, ref?: string): Promise<AgentSpace> {
  const spaces = await agent.spaces();
  const listed = spaces.map((s) => ({ id: s.id, name: s.name, where: s.where }));
  if (spaces.length === 0) throw new Refusal('There is no space to look in');
  if (!ref?.trim()) {
    if (spaces.length === 1) return spaces[0]!;
    throw new Refusal('Which space? Name one with `space`', { spaces: listed });
  }
  const byId = spaces.filter((s) => s.id === ref.trim());
  if (byId.length === 1) return byId[0]!;
  const byName = spaces.filter((s) => same(s.name, ref));
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) throw new Refusal(`More than one space is called ${ref}; say which by id`, { candidates: byName.map((s) => ({ id: s.id, name: s.name, where: s.where })) });
  throw new Refusal(`No space is called ${ref}`, { spaces: listed });
}

export type ElementKind = TreeNode['kind'];

/** An element of a space as the tools list it: its path, what it is, and what it is called. */
export interface Element {
  path: string;
  kind: ElementKind;
  title: string;
}

/** What an element is called, a folder too, with what its file name holds as a look-alike shown as typed. */
const titleOf = (node: TreeNode) => node.title ?? shownName(node.name);

/** Every element of a space, folders walked, in the sidebar's order; only those of `kinds` when given. */
export async function elementsOf(fs: VaultFs, kinds?: ElementKind[]): Promise<Element[]> {
  const out: Element[] = [];
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (!kinds || kinds.includes(node.kind)) out.push({ path: node.path, kind: node.kind, title: titleOf(node) });
      if (node.children) visit(node.children);
    }
  };
  visit(await readTree(fs));
  return out;
}

/** A path as the agent typed it, with what a file name cannot hold as the look-alike the app gives it: `Ne yapmalı?.md` is `Ne yapmalı？.md`. */
export const filePathOf = (path: string) => path.split('/').map(fileNameOf).join('/');

/** The path of what is there, as it was typed or with its look-alikes; null when neither is there. */
export async function foundPath(fs: VaultFs, path: string): Promise<string | null> {
  if (await exists(fs, path)) return path;
  const typed = filePathOf(path);
  return typed !== path && (await exists(fs, typed)) ? typed : null;
}

/** The paths of what has a word of the name of one that is not there; at most ten, none when nothing is near. */
export async function nearestPaths(fs: VaultFs, path: string): Promise<string[]> {
  const words = fold(basename(path).replace(/\.(md|tasks\.json|board\.json)$/, ''))
    .split(/\s+/)
    .filter((word) => word.length > 1);
  return (await elementsOf(fs))
    .filter((e) => words.some((word) => fold(e.title).includes(word)))
    .slice(0, 10)
    .map((e) => e.path);
}

/** What is at `path`, or null: a file as `stat` gives it, a folder as its parent lists it. */
export async function exists(fs: VaultFs, path: string): Promise<Entry | null> {
  if (!path) return { name: '', path: '', kind: 'dir' };
  const file = fs.stat ? await fs.stat(path) : null;
  if (file) return file;
  const entries = await fs.list(dirname(path));
  return entries.find((e) => e.path === path) ?? null;
}

const EXT: { [kind in ElementKind]?: string } = { board: BOARD_EXT, tasks: TASK_LIST_EXT, note: '.md' };

/** The name part of a path for an element of `kind`: `Plans/Scrawl.board.json` → `Plans/Scrawl`. */
function bare(path: string, kind: ElementKind): string {
  const ext = EXT[kind];
  return ext && path.endsWith(ext) ? path.slice(0, -ext.length) : path;
}

/**
 * The element `ref` names among those of `kinds`: by its path, or by its name alone, in any case.
 * One match is used; more than one is refused with the candidates; none with the nearest names.
 */
export async function pickElement(fs: VaultFs, ref: string, kinds: ElementKind[], what: string): Promise<Element> {
  const wanted = ref.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!wanted) throw new Refusal(`Which ${what}? Give its name or path`);
  const all = await elementsOf(fs, kinds);
  const typed = filePathOf(wanted);
  // A name alone is a name, not a path: `Scrawl` finds a board called Scrawl wherever it is, and two of them are two.
  const atPath = (e: Element, path: string) => e.path === path || same(e.path, path) || (path.includes('/') && same(bare(e.path, e.kind), path));
  const byPath = all.find((e) => atPath(e, wanted) || atPath(e, typed));
  if (byPath) return byPath;
  const byTitle = all.filter((e) => same(e.title, wanted));
  if (byTitle.length === 1) return byTitle[0]!;
  if (byTitle.length > 1) throw new Refusal(`More than one ${what} is called ${ref}; say which by path`, { candidates: byTitle });
  const close = nearest(all, wanted);
  throw new Refusal(all.length === 0 ? `There is no ${what} in this space` : `No ${what} is called ${ref}`, { ...(close.length > 0 && { nearest: close }) });
}

/** An element found by its name or path, with the space it is in. */
export interface Found {
  space: AgentSpace;
  element: Element;
}

/** What a space is called beside its id, for what comes from more than one space. */
const spaceOf = (space: AgentSpace) => ({ space: space.id, spaceName: space.name });

/**
 * The element `ref` names among those of `kinds`: in the space `spaceRef` names, or, with none
 * named and more than one space, in whichever space has it, as `pickElement` finds it there. One
 * match is used; more than one, in one space or in several, is refused with the candidates and
 * their spaces; none with the nearest names of every space. What makes something new names its
 * space: this only finds what is there.
 */
export async function pickAcross(agent: Agent, spaceRef: string | undefined, ref: string, kinds: ElementKind[], what: string): Promise<Found> {
  const spaces = await agent.spaces();
  if (spaceRef?.trim() || spaces.length <= 1) {
    const space = await pickSpace(agent, spaceRef);
    return { space, element: await pickElement(space.fs, ref, kinds, what) };
  }
  if (!ref.trim()) throw new Refusal(`Which ${what}? Give its name or path`);
  const found: Found[] = [];
  const near: (Element & { space: string; spaceName: string })[] = [];
  for (const space of spaces) {
    try {
      found.push({ space, element: await pickElement(space.fs, ref, kinds, what) });
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      for (const element of (error.details.candidates as Element[] | undefined) ?? []) found.push({ space, element });
      for (const element of (error.details.nearest as Element[] | undefined) ?? []) near.push({ ...element, ...spaceOf(space) });
    }
  }
  if (found.length === 1) return found[0]!;
  if (found.length > 1) throw new Refusal(`More than one ${what} is called ${ref}; say which by its space and path`, { candidates: found.map(({ space, element }) => ({ ...element, ...spaceOf(space) })) });
  throw new Refusal(`No ${what} is called ${ref} in any space`, { ...(near.length > 0 && { nearest: near.slice(0, 20) }) });
}

/**
 * The space and the path of a file or a folder that is there: in the space `spaceRef` names, or,
 * with none named and more than one space, in the one space that has it. Refused with the spaces
 * when several have it, with the nearest paths when none does.
 */
export async function pickPath(agent: Agent, spaceRef: string | undefined, typed: string): Promise<{ space: AgentSpace; path: string }> {
  const spaces = await agent.spaces();
  const among = spaceRef?.trim() || spaces.length <= 1 ? [await pickSpace(agent, spaceRef)] : spaces;
  const found: { space: AgentSpace; path: string }[] = [];
  for (const space of among) {
    const path = await foundPath(space.fs, typed);
    if (path) found.push({ space, path });
  }
  if (found.length === 1) return found[0]!;
  if (found.length > 1) throw new Refusal(`${typed} is in more than one space; say which with space`, { candidates: found.map(({ space, path }) => ({ path, ...spaceOf(space) })) });
  const nearest = (await Promise.all(among.map(async (space) => (await nearestPaths(space.fs, typed)).map((path) => (among.length > 1 ? { path, ...spaceOf(space) } : path))))).flat();
  throw new Refusal(`Nothing is at ${typed}${among.length > 1 ? ' in any space' : ''}`, { path: typed, ...(nearest.length > 0 && { nearest: nearest.slice(0, 10) }) });
}

/** When something is due, as `tasks` and `cards` ask for it. */
export type Due = 'overdue' | 'today' | 'upcoming';

/** Whether a day is `due`, from `today`: before it, on it, or after it. */
export function dueIs(day: string | null | undefined, due: Due, today: string): boolean {
  if (!day) return false;
  return due === 'overdue' ? day < today : due === 'today' ? day === today : day > today;
}

/** Whether `assignee`, as an agent asked for it, is the one a task or a card is given to: `me` is the person. */
export function isAssignee(given: { id?: string; name?: string } | null | undefined, asked: string, person: Person | null): boolean {
  if (!given) return false;
  if (fold(asked.trim()) === 'me') return !!person && ((!!person.id && given.id === person.id) || (!!person.name && !!given.name && same(given.name, person.name)));
  return (!!given.name && same(given.name, asked)) || given.id === asked;
}

/** The note a task or a card is about, by path or name; null unlinks it. */
export async function noteRefOf(fs: VaultFs, ref: string | null | undefined): Promise<string | null | undefined> {
  if (ref === undefined || ref === null) return ref;
  if (!ref.trim()) return null;
  return (await pickElement(fs, ref, ['note'], 'note')).path;
}

/**
 * The record `ref` names in a collection: by id, else by name or code in any case. One match is
 * used; more than one is refused with the candidates; none with the nearest.
 */
export function pickRecord(collection: Collection, ref: string): CollectionRecord {
  const wanted = ref.trim();
  if (!wanted) throw new Refusal('Which record? Give its name, code or id');
  const byId = collection.records.find((r) => r.id === wanted);
  if (byId) return byId;
  const matches = collection.records.filter((r) => (r.name && same(r.name, wanted)) || (r.code && same(r.code, wanted)));
  const shown = (r: CollectionRecord) => ({ id: r.id, name: r.name, ...(r.code && { code: r.code }), path: r.path });
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new Refusal(`More than one record is called ${ref}; say which by id`, { candidates: matches.map(shown) });
  const close = nearest(
    collection.records.map((r) => ({ title: [r.name, r.code].filter(Boolean).join(' '), record: r })),
    wanted,
  );
  throw new Refusal(`No record is called ${ref} in ${collection.dir}`, { ...(close.length > 0 && { nearest: close.map((c) => shown(c.record)) }) });
}

/** The names of a space's people, those who still open it. */
export async function peopleOf(fs: VaultFs): Promise<string[]> {
  return (await loadPeople(fs).catch(() => [])).filter((p) => p.active && p.name).map((p) => p.name!);
}

/**
 * Who a name means in a space: the person of that name in the space's people, or the one person
 * a first or a last name fits ("Kaan" is Kaan Arslan). In a space that has people, a name that
 * fits none of them is refused with their names; the personal space, and one with no people yet,
 * keep the name as it was typed. Null gives it to nobody.
 */
export async function personRefOf(space: Pick<AgentSpace, 'fs' | 'personal'>, name: string | null | undefined): Promise<PersonRef | null> {
  if (name === null) return null;
  const clean = name?.trim();
  if (!clean) return null;
  const people = (await loadPeople(space.fs).catch(() => [])).filter((p) => p.name);
  const shown = (found: typeof people) => found.map((p) => ({ id: p.id, name: p.name }));
  const byId = people.find((p) => p.id === clean);
  if (byId) return refOf(byId);
  const whole = people.filter((p) => same(p.name!, clean));
  if (whole.length === 1) return refOf(whole[0]!);
  if (whole.length > 1) throw new Refusal(`More than one person is called ${clean}; say which by id`, { candidates: shown(whole) });
  const words = fold(clean).split(/\s+/);
  const part = people.filter((p) => {
    const theirs = fold(p.name!).split(/\s+/);
    return words.every((word) => theirs.includes(word));
  });
  if (part.length === 1) return refOf(part[0]!);
  if (part.length > 1) throw new Refusal(`More than one person is called ${clean}; give the whole name`, { candidates: shown(part) });
  if (space.personal || people.length === 0) return { name: clean };
  throw new Refusal(`No one called ${clean} is in this space; give the name of one of its people`, { people: people.map((p) => p.name) });
}
