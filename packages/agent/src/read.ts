import { createHash } from 'node:crypto';
import {
  boardName,
  cardValue,
  collectionName,
  displayTitle,
  type Findable,
  appPieces,
  listName,
  loadBoard,
  loadCollection,
  loadList,
  menuOf,
  readAppFile,
  readTree,
  recordTitle,
  search as searchCore,
  searchIndex,
  type TreeNode,
  valueText,
  type VaultFs,
} from '@scrawlnotes/core';
import { GUIDE } from './guide';
import { checkPart, partOf, PARTS } from './parts';
import { checkOpen, cleanPath, type FileKind, fileKind, Refusal } from './paths';
import { type Agent, type AgentSpace, agentsOf, type Client, type ElementKind, elementsOf, exists, peopleOf, pickPath, pickSpace, selfOf, todayOf } from './space';

// Looking around: the spaces, what is in one, a file's text, and finding anything by name or by
// text, as the sidebar and the search window do. Nothing here writes.

/** The most text a tool reads or writes at once. */
export const MAX_TEXT = 1024 * 1024;

/** The digest of a text, as the server tags a file's content. */
export const hashOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * The spaces, today and the person, and for the model the guide after them: many clients show it
 * nothing else of the server. The guide is in the structured content too, as a client that shows
 * only that (Claude Code does) would leave it out.
 */
export async function spacesTool(agent: Agent, client: Client = {}) {
  const [spaces, person, self] = await Promise.all([agent.spaces(), agent.person(), selfOf(agent, client)]);
  const data = {
    today: todayOf(agent),
    person: person?.name ?? null,
    // Who the agent is, as what it changes is written: known once it has written, as only that makes it.
    you: self && { id: self.id, name: self.name },
    // Who a card or a task can be given to: the space's people and its agents, by name.
    spaces: await Promise.all(
      spaces.map(async ({ id, name, where, personal, fs }) => {
        const agents = await agentsOf(fs);
        return { id, name, where, personal, people: await peopleOf(fs), ...(agents.length > 0 && { agents }) };
      }),
    ),
  };
  return { data: { ...data, guide: GUIDE }, text: `${JSON.stringify(data)}\n\n${GUIDE}` };
}

/** A node as the tree tool gives it: without what only the app's screen needs; an app's folder with its menu. */
interface NodeOut {
  name: string;
  path: string;
  kind: ElementKind;
  title?: string;
  /** An app's modules, as the person sees it (design/app-home.md 8.4): each one's name and the paths of its screens. */
  app?: { modules: { name: string; screens: string[] }[] };
  children?: NodeOut[];
}

async function nodeOut(fs: VaultFs, node: TreeNode): Promise<NodeOut> {
  const app = node.app ? await readAppFile(fs, node.path) : null;
  const around = app ? await appPieces(fs, node.path) : null;
  return {
    name: node.name,
    path: node.path,
    kind: node.kind,
    ...(node.title !== undefined && { title: node.title }),
    ...(app && around && { app: { modules: menuOf(app, node.path, around.pieces, around.lines).map((m) => ({ name: m.name, screens: m.screens.map((s) => s.path) })) } }),
    ...(node.children && { children: await Promise.all(node.children.map((child) => nodeOut(fs, child))) }),
  };
}

export async function treeTool(agent: Agent, args: { space?: string; folder?: string; kind?: ElementKind }) {
  // One kind in every space at once, each with its space: every board, wherever it is.
  const spaces = await agent.spaces();
  if (args.kind && !args.space?.trim() && !args.folder && spaces.length > 1) {
    const items = (await Promise.all(spaces.map(async (space) => (await elementsOf(space.fs, [args.kind!])).map((e) => ({ ...e, space: space.id, spaceName: space.name }))))).flat();
    return { data: { kind: args.kind, items } };
  }
  const space = await pickSpace(agent, args.space);
  const folder = args.folder ? checkOpen(cleanPath(args.folder)) : '';
  if (folder) {
    const entry = await exists(space.fs, folder);
    if (entry?.kind !== 'dir') throw new Refusal(`No folder at ${folder}`, { folders: (await elementsOf(space.fs, ['folder'])).map((f) => f.path) });
  }
  if (args.kind) {
    const items = (await elementsOf(space.fs, [args.kind])).filter((e) => !folder || e.path.startsWith(`${folder}/`));
    return { data: { space: space.id, folder, kind: args.kind, items } };
  }
  const nodes = await Promise.all((await readTree(space.fs, folder)).map((node) => nodeOut(space.fs, node)));
  return { data: { space: space.id, folder, nodes } };
}

/** A text's lines, without the empty one after its last line break. */
function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** What `read` gives: the file, a part of it or some of its lines, with the hash a write after it is checked against. */
type ReadOut = {
  space: string;
  path: string;
  kind: FileKind;
  /** The file's, or with `part` the part's. */
  hash: string;
  text: string;
  part?: string;
  size?: number;
  lineCount?: number;
  lines?: { from: number; to: number; total: number };
};

export async function readTool(agent: Agent, args: { space?: string; path: string; part?: string; lines?: { from: number; to?: number } }): Promise<{ data: ReadOut; text: string }> {
  const typed = checkOpen(cleanPath(args.path));
  const { space, path } = await pickPath(agent, args.space, typed);
  const entry = (await exists(space.fs, path))!;
  if (entry.kind === 'dir') throw new Refusal(`${path} is a folder; use tree to see what is in it`, { path });
  if (entry.size !== undefined && entry.size > MAX_TEXT) throw new Refusal(`${path} is larger than agents read (1 MB)`, { path, size: entry.size });
  const text = await space.fs.readText(path);
  if (text.length > MAX_TEXT) throw new Refusal(`${path} is larger than agents read (1 MB)`, { path });
  const kind = fileKind(path);
  const textual = kind === 'note' || kind === 'rules';
  if (args.part !== undefined && args.lines) throw new Refusal('Give part or lines, not both', { path });
  if (args.part !== undefined) {
    checkPart(kind, args.part, path);
    let data: { [key: string]: unknown };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new Refusal(`${path} is not JSON; read it without part`, { path });
    }
    const part = partOf(kind, data, args.part);
    return { data: { space: space.id, path, kind, part: args.part, hash: hashOf(part.text), text: part.text }, text: part.text };
  }
  if (args.lines) {
    if (!textual) throw new Refusal(`lines are for a note or a rules file; for ${path} give part`, { path, parts: Object.keys(PARTS[kind] ?? {}) });
    const all = linesOf(text);
    const { from } = args.lines;
    const to = Math.min(args.lines.to ?? all.length, all.length);
    if (!Number.isInteger(from) || from < 1) throw new Refusal('Lines count from 1', { path });
    if (from > all.length) throw new Refusal(`${path} has ${all.length === 1 ? 'one line' : `${all.length} lines`}`, { path, total: all.length });
    if (to < from) throw new Refusal('to comes after from', { path });
    const piece = all.slice(from - 1, to).join('\n');
    // The hash is the whole file's, for a write after it.
    return { data: { space: space.id, path, kind, hash: hashOf(text), lines: { from, to, total: all.length }, text: piece }, text: piece };
  }
  // The file in the structured content too: a client that shows only that would leave it out.
  return { data: { space: space.id, path, kind, hash: hashOf(text), size: text.length, ...(textual && { lineCount: linesOf(text).length }), text }, text };
}

/** Something to be found in a space, with where it is. */
interface Thing extends Findable {
  space: string;
  path: string;
  id?: string;
  where: string;
}

/** The fields whose values are read as text: not numbers, days, boxes or what is worked out. */
const UNREAD = new Set(['number', 'date', 'time', 'checkbox', 'formula', 'lookup', 'rollup', 'name', 'code']);

const joined = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** Everything in a space that can be found: elements by name, notes by text, tasks, cards and records. */
async function thingsOf(space: AgentSpace, today: string): Promise<Thing[]> {
  const { fs } = space;
  // The space itself, as a project is often one: "Klinitra" finds the space before what is in it.
  const things: Thing[] = [{ kind: 'space', name: space.name, space: space.id, path: '', where: space.where }];
  const elements = await elementsOf(fs);
  const trail = (path: string) => [space.name, ...path.split('/').slice(0, -1)].join(' › ');
  for (const element of elements) {
    const where = trail(element.path);
    if (element.kind === 'note') {
      const text = await fs.readText(element.path).catch(() => '');
      things.push({ kind: 'note', name: displayTitle(element.path, text), text, space: space.id, path: element.path, where });
    } else if (element.kind === 'tasks') {
      things.push({ kind: 'tasks', name: element.title, space: space.id, path: element.path, where });
      const list = await loadList(fs, element.path);
      for (const task of list.tasks) {
        things.push({ kind: 'task', name: task.title, text: task.description ?? '', done: task.done, space: space.id, path: element.path, id: task.id, where: joined(listName(element.path), task.due) });
      }
    } else if (element.kind === 'board') {
      things.push({ kind: 'board', name: element.title, space: space.id, path: element.path, where });
      const board = await loadBoard(fs, element.path);
      const columns = new Map(board.columns.map((c) => [c.id, c]));
      for (const card of board.cards) {
        const column = columns.get(card.column);
        const fields = (board.fields ?? [])
          .filter((f) => !UNREAD.has(f.type))
          .map((f): [string, string] => [f.label, valueText(cardValue(board, card, f, today))])
          .filter(([, value]) => value !== '');
        if (card.labels?.length) fields.push(['Labels', card.labels.join(', ')]);
        const comments = card.timeline.flatMap((entry) => (entry.kind === 'comment' ? [entry.text] : []));
        things.push({
          kind: 'card',
          name: card.title,
          key: `${board.prefix}-${card.key}`,
          text: [card.description ?? '', ...comments].filter(Boolean).join('\n'),
          fields,
          done: column?.kind === 'done' || column?.kind === 'dropped',
          space: space.id,
          path: element.path,
          id: card.id,
          where: joined(boardName(element.path), column?.name),
        });
      }
    } else if (element.kind === 'collection') {
      things.push({ kind: 'collection', name: element.title, space: space.id, path: element.path, where });
      const collection = await loadCollection(fs, element.path, undefined, true).catch(() => null);
      if (!collection) continue;
      for (const record of collection.records) {
        const fields = collection.schema.fields
          .filter((f) => !UNREAD.has(f.type))
          .map((f): [string, string] => [f.label, valueText(record.values[f.key])])
          .filter(([, value]) => value !== '');
        things.push({
          kind: 'record',
          name: recordTitle(record),
          key: record.name ? record.code : '',
          text: record.body,
          fields,
          space: space.id,
          path: record.path,
          id: record.id,
          where: joined(collectionName(element.path), where),
        });
      }
    } else if (element.kind === 'folder') {
      things.push({ kind: 'folder', name: element.title, space: space.id, path: element.path, where });
    }
  }
  return things;
}

export async function searchTool(agent: Agent, args: { query: string; space?: string; limit?: number }) {
  const query = args.query.trim();
  if (!query) throw new Refusal('What to search for? Give a query');
  const spaces = args.space ? [await pickSpace(agent, args.space)] : await agent.spaces();
  const today = todayOf(agent);
  const things = (await Promise.all(spaces.map((space) => thingsOf(space, today)))).flat();
  const found = searchCore(searchIndex(things), query).slice(0, args.limit ?? 30);
  const names = new Map(spaces.map((space) => [space.id, space.name]));
  return {
    data: {
      query,
      found: found.map(({ item, line }) => ({
        space: item.space,
        spaceName: names.get(item.space) ?? item.space,
        kind: item.kind,
        title: item.name,
        ...(item.key && { key: item.key }),
        path: item.path,
        ...(item.id && { id: item.id }),
        where: item.where,
        ...(line && { line: line.text }),
        // Where in a note, for read with lines.
        ...(item.kind === 'note' && line?.spans[0] && { lineNo: item.text!.slice(0, line.spans[0][0]).split('\n').length }),
      })),
    },
  };
}
