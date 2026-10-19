import { t } from '@scrawlnotes/i18n';
import type { Board } from './board';
import type { Collection, Field, LayoutItem, Schema } from './collection';
import { type Entry, type PartsOptions, type VaultFs } from './fs';
import { cardRef, parseCardRef, type Task } from './tasks';
import type { TreeNode } from './vault';

// More than one space in the app. Each space is a whole root folder of its own; the personal
// one is the vault as it always was, its paths bare. Every other space has an id, and in the app
// its paths carry that id in front: `@sp-k7f3m2qa/Sales/x.md`. The files of a space never hold
// the prefix: what they say about each other (a task's note, a card's note, a link's collection)
// is a path inside the space, so that the folder reads the same wherever it is opened.
//
// One rule keeps the two apart: what reads or writes a space's files works in that space's own
// files and its own paths, and the app puts the prefix on what comes back. A link to another
// space has no way to be written in a space's file, so it is left out.

const ID = /^sp-[a-z0-9]{8}$/;
const PREFIX = /^@(sp-[a-z0-9]{8})(?:\/|$)/;

/** A new space's id, made once and kept with the space. */
export function newSpaceId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `sp-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

export const isSpaceId = (id: unknown): id is string => typeof id === 'string' && ID.test(id);

/** The id of the space a path is in; null in the personal space. */
export function spaceOf(path: string): string | null {
  return PREFIX.exec(path)?.[1] ?? null;
}

/** A path without its space, as the space's own files have it. */
export function localPath(path: string): string {
  const match = PREFIX.exec(path);
  return match ? path.slice(match[0].length) : path;
}

/** A path of a space's own, as the app has it; `''` is the space itself. */
export function inSpace(space: string | null, path: string): string {
  if (!space) return path;
  return path ? `@${space}/${path}` : `@${space}`;
}

/** The nodes of a space's tree, their paths in the space. */
export function prefixTree(nodes: TreeNode[], space: string): TreeNode[] {
  return nodes.map((node) => ({ ...node, path: inSpace(space, node.path), ...(node.children && { children: prefixTree(node.children, space) }) }));
}

/** What a path held in a file becomes; null leaves the link out. */
export type Rebase = (path: string) => string | null;

/** From the app to a space's files: a path of the space loses its prefix, a path of another space has no place there. */
export const toSpace =
  (space: string | null): Rebase =>
  (path) =>
    spaceOf(path) === space ? localPath(path) : null;

/** From a space's files to the app: its paths get the space in front. */
export const fromSpace =
  (space: string | null) =>
  (path: string): string =>
    inSpace(space, path);

/** Keeps what is in the space as it is and leaves out what is not: a link that may not cross into another space. */
export const withinSpace =
  (space: string | null): Rebase =>
  (path) =>
    spaceOf(path) === space ? path : null;

/** `rebase` on an optional path: unchanged when absent, gone when it has no place. */
function moved(path: string | null | undefined, rebase: Rebase): string | null | undefined {
  return path ? rebase(path) : path;
}

const rebaseCard = (ref: string, rebase: Rebase): string | null => {
  const parsed = parseCardRef(ref);
  if (!parsed) return ref;
  const board = rebase(parsed.board);
  return board === null ? null : cardRef(board, parsed.id);
};

/** A task list with the paths in it put through `rebase`: the tasks' notes, cards and records. The same list when none changes. */
export function rebaseTasks(tasks: Task[], rebase: Rebase): Task[] {
  let changed = false;
  const out = tasks.map((task) => {
    const note = moved(task.note, rebase);
    const card = task.card ? rebaseCard(task.card, rebase) : task.card;
    const collection = task.record ? rebase(task.record.collection) : undefined;
    if (note === task.note && card === task.card && (!task.record || collection === task.record.collection)) return task;
    changed = true;
    const { note: _n, card: _c, record: _r, ...rest } = task;
    return {
      ...rest,
      ...(note && { note }),
      ...(card && { card }),
      ...(task.record && collection && { record: { ...task.record, collection } }),
    };
  });
  return changed ? out : tasks;
}

/** Fields with their link targets and rollup sources put through `rebase`; a target with no place is left out. The same fields when none changes. */
export function rebaseFields<F extends Pick<Field, 'collection' | 'rollup'>>(fields: F[], rebase: Rebase): F[] {
  let changed = false;
  const out = fields.map((field) => {
    const collection = moved(field.collection, rebase);
    const from = field.rollup ? rebase(field.rollup.from) : undefined;
    if (collection === field.collection && (!field.rollup || from === field.rollup.from)) return field;
    changed = true;
    const { collection: _c, rollup: _r, ...rest } = field;
    return { ...rest, ...(collection && { collection }), ...(field.rollup && from && { rollup: { ...field.rollup, from } }) } as F;
  });
  return changed ? out : fields;
}

/** A board with the paths in it put through `rebase`: the cards' and the phases' notes, the fields' collections and rollups. The same board when none changes. */
export function rebaseBoard(board: Board, rebase: Rebase): Board {
  let changed = false;
  const cards = board.cards.map((card) => {
    const note = moved(card.note, rebase);
    if (note === card.note) return card;
    changed = true;
    const { note: _n, ...rest } = card;
    return { ...rest, ...(note && { note }) };
  });
  const phases = board.phases.map((phase) => {
    const note = moved(phase.note, rebase);
    if (note === phase.note) return phase;
    changed = true;
    const { note: _n, ...rest } = phase;
    return { ...rest, ...(note && { note }) };
  });
  const fields = board.fields && rebaseFields(board.fields, rebase);
  if (fields !== board.fields) changed = true;
  return changed ? { ...board, cards, phases, ...(fields && { fields }) } : board;
}

/** A schema with its links, rollups and linked-record blocks put through `rebase`; a block with no place is left out. The same schema when none changes. */
export function rebaseSchema(schema: Schema, rebase: Rebase): Schema {
  const fields = rebaseFields(schema.fields, rebase);
  let changed = fields !== schema.fields;
  const layout = schema.layout && {
    ...schema.layout,
    columns: schema.layout.columns.map((column) => ({
      ...column,
      sections: column.sections.map((section) => ({
        ...section,
        items: section.items.flatMap((item): LayoutItem[] => {
          if (!('block' in item) || item.block !== 'linked') return [item];
          const collection = rebase(item.collection);
          if (collection === item.collection) return [item];
          changed = true;
          return collection === null ? [] : [{ ...item, collection }];
        }),
      })),
    })),
  };
  return changed ? { ...schema, fields, ...(layout && { layout }) } : schema;
}

/**
 * A collection with its folder, its records' files and its schema's paths put through `rebase`:
 * from a space's files to the app, or back. Its own folder and files are always in its space;
 * only a link of its schema can have no place.
 */
export function rebaseCollection(collection: Collection, rebase: Rebase): Collection {
  const own = (path: string) => rebase(path) ?? path;
  return {
    ...collection,
    dir: own(collection.dir),
    schema: rebaseSchema(collection.schema, rebase),
    records: collection.records.map((record) => ({ ...record, path: own(record.path) })),
  };
}

/** A space's files, which space they are, and a path of the app as those files have it. */
export interface SpaceAt {
  fs: VaultFs;
  space: string | null;
  local: string;
}

/**
 * The vaults of every open space as one: a path with a space in front goes to that space's
 * vault, bare, and what comes back carries the space again; a bare path is the personal space's.
 * Plain reading and writing of a file by its path goes through here. Whatever works on a space's
 * files as a whole (history, index, trash, attachments, or anything that writes paths into a
 * file) takes `at` first and works in that space's own files and paths.
 */
export class MultiFs implements VaultFs {
  constructor(
    private readonly personal: VaultFs,
    private readonly spaces: ReadonlyMap<string, VaultFs>,
  ) {}

  /** The space a path is in, its files, and the path as they have it. */
  at(path: string): SpaceAt {
    const space = spaceOf(path);
    return { fs: this.of(space), space, local: localPath(path) };
  }

  /** The files of a space, or the personal one for null. */
  of(space: string | null): VaultFs {
    if (!space) return this.personal;
    const fs = this.spaces.get(space);
    if (!fs) throw new Error(t('error.spaceGone'));
    return fs;
  }

  /** Every open space with its files, the personal one first. */
  all(): [string | null, VaultFs][] {
    return [[null, this.personal], ...this.spaces];
  }

  async list(dir: string): Promise<Entry[]> {
    const { fs, space, local } = this.at(dir);
    const entries = await fs.list(local);
    return space ? entries.map((entry) => ({ ...entry, path: inSpace(space, entry.path) })) : entries;
  }

  async readText(path: string): Promise<string> {
    const { fs, local } = this.at(path);
    return fs.readText(local);
  }

  async writeText(path: string, text: string): Promise<void> {
    const { fs, local } = this.at(path);
    return fs.writeText(local, text);
  }

  async readBlob(path: string): Promise<Blob> {
    const { fs, local } = this.at(path);
    return fs.readBlob(local);
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    const { fs, local } = this.at(path);
    return fs.writeBlob(local, data);
  }

  async writeBlobInParts(path: string, data: Blob, options?: PartsOptions): Promise<void> {
    const { fs, local } = this.at(path);
    return fs.writeBlobInParts(local, data, options);
  }

  async move(from: string, to: string): Promise<void> {
    const source = this.at(from);
    const target = this.at(to);
    if (source.space !== target.space) throw new Error(t('error.otherSpace'));
    return source.fs.move(source.local, target.local);
  }

  async remove(path: string): Promise<void> {
    const { fs, local } = this.at(path);
    return fs.remove(local);
  }

  async mkdir(path: string): Promise<void> {
    const { fs, local } = this.at(path);
    return fs.mkdir(local);
  }
}

// ---------- the spaces of a device ----------

/**
 * Where a space lives in the cloud: the provider, and the folder there as that provider knows it
 * (for OneDrive the drive and the item, with a path for people to read). A new provider brings
 * its own place; nothing else in the app reads it.
 */
export interface SpaceSource {
  provider: string;
  /** The account, as the provider shows it. */
  account?: string;
  place: { [key: string]: string };
}

/** A space beside the personal one, as a device remembers it. The order of a list is the sidebar's. */
export interface SpaceEntry {
  id: string;
  /** What it was called when it was added, until its own `space.json` is read. */
  name?: string;
  /** Desktop: the folder of its copy on this device. In the browser the copy has a folder of its own in the browser's storage. */
  folder?: string;
  /** Where it lives in the cloud. */
  source?: SpaceSource;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

function readSource(value: unknown): SpaceSource | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { provider, account, place } = value as { [key: string]: unknown };
  if (!text(provider) || !place || typeof place !== 'object' || Array.isArray(place)) return undefined;
  const kept = Object.fromEntries(Object.entries(place).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  return { provider: text(provider)!, ...(text(account) && { account: text(account) }), place: kept };
}

/**
 * The spaces a device lists, read from what it kept: an entry without a proper id, or with the
 * id of one already listed (a copied folder added twice), is left out.
 */
export function readSpaceEntries(data: unknown): SpaceEntry[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const entries: SpaceEntry[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, folder, source } = item as { [key: string]: unknown };
    if (!isSpaceId(id) || seen.has(id)) continue;
    seen.add(id);
    const kept = readSource(source);
    entries.push({ id, ...(text(name) && { name: text(name) }), ...(text(folder) && { folder: text(folder) }), ...(kept && { source: kept }) });
  }
  return entries;
}

/** A folder path as written on Windows, macOS or Linux, in one spelling: forward slashes, no slash at the end, Windows' case folded. */
function folderKey(path: string): string {
  const slashed = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-zA-Z]:\//.test(slashed) || path.includes('\\') ? slashed.toLowerCase() : slashed;
}

/** Whether one folder is the other or inside it, either way round: two spaces may not be. */
export function foldersNest(a: string, b: string): boolean {
  const [x, y] = [folderKey(a), folderKey(b)];
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

/**
 * Whether a folder on a computer is inside OneDrive's, whose app syncs it too: on Windows a
 * folder `OneDrive`, or `OneDrive - <organization>` for a work account, on the way down to it; on
 * macOS one of `Library/CloudStorage/OneDrive-…`. Told by the path alone, the app running or not.
 */
export function inOneDrive(path: string): boolean {
  const parts = folderKey(path).toLowerCase().split('/');
  return parts.some((part, i) => part === 'onedrive' || part.startsWith('onedrive - ') || (part.startsWith('onedrive-') && parts[i - 1] === 'cloudstorage' && parts[i - 2] === 'library'));
}

/**
 * The spaces beside the personal one, by id, once `dragged` is dropped before or after the space
 * `target` names; null is the personal space, which stays first, so after it is the first place.
 */
export function droppedSpaces(ids: string[], dragged: string, target: string | null, after: boolean): string[] {
  if (target === dragged) return ids;
  const rest = ids.filter((id) => id !== dragged);
  const at = target === null ? 0 : rest.indexOf(target) + (after ? 1 : 0);
  if (target !== null && at < (after ? 1 : 0)) return ids;
  return [...rest.slice(0, at), dragged, ...rest.slice(at)];
}
