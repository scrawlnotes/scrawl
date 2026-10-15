import {
  BOARD_EXT,
  type Collection,
  type Entry,
  dayOf,
  dirname,
  fold,
  loadPeople,
  type PersonRef,
  type Record as CollectionRecord,
  readTree,
  refOf,
  TASK_LIST_EXT,
  type TreeNode,
  type VaultFs,
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
  /** The client, when the door knows it better than the protocol says: on the server, the OAuth client that signed in. */
  client?: Client;
}

/** The client that is calling, as it names itself: "Claude Code", "Claude", "ChatGPT", "Cursor". */
export interface Client {
  name?: string;
}

export const nowOf = (agent: Agent): Date => (agent.now ?? (() => new Date()))();

/** Today as `YYYY-MM-DD`, in the local calendar. */
export const todayOf = (agent: Agent): string => dayOf(nowOf(agent));

/** Who a change is written as: "Claude Code · Kaan"; the client alone when the person has no name. */
export function actorOf(client: Client, person: Person | null): string | undefined {
  const parts = [client.name?.trim(), person?.name?.trim()].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/** The items whose title has a word of `ref`, else all of them; at most twenty. */
function nearest<T extends { title: string }>(items: T[], ref: string): T[] {
  const words = fold(ref).split(/\s+/).filter(Boolean);
  const close = items.filter((item) => words.some((word) => fold(item.title).includes(word)));
  return (close.length > 0 ? close : items).slice(0, 20);
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

const titleOf = (node: TreeNode) => node.title ?? node.name;

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
  // A name alone is a name, not a path: `Scrawl` finds a board called Scrawl wherever it is, and two of them are two.
  const byPath = all.find((e) => e.path === wanted || same(e.path, wanted) || (wanted.includes('/') && same(bare(e.path, e.kind), wanted)));
  if (byPath) return byPath;
  const byTitle = all.filter((e) => same(e.title, wanted));
  if (byTitle.length === 1) return byTitle[0]!;
  if (byTitle.length > 1) throw new Refusal(`More than one ${what} is called ${ref}; say which by path`, { candidates: byTitle });
  const close = nearest(all, wanted);
  throw new Refusal(all.length === 0 ? `There is no ${what} in this space` : `No ${what} is called ${ref}`, { ...(close.length > 0 && { nearest: close }) });
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

/**
 * Who a name means in a space: the person of that name in the space's people, else the name as
 * it was typed, as the personal space has it. Null gives it to nobody.
 */
export async function personRefOf(fs: VaultFs, name: string | null | undefined): Promise<PersonRef | null> {
  if (name === null) return null;
  const clean = name?.trim();
  if (!clean) return null;
  const people = await loadPeople(fs).catch(() => []);
  const found = people.filter((p) => p.name && same(p.name, clean));
  if (found.length === 1) return refOf(found[0]!);
  if (found.length > 1) throw new Refusal(`More than one person is called ${clean}`, { candidates: found.map((p) => ({ id: p.id, name: p.name })) });
  return { name: clean };
}
