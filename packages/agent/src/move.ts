import {
  carryCreated,
  dirname,
  loadBoard,
  loadCollection,
  loadList,
  loadSchema,
  moveCollection,
  moveHistory,
  moveItem,
  relinkBoard,
  relinkBoardNote,
  relinkNote,
  relinkTaskRecords,
  renameCollection,
  renameItem,
  retargetBoardLinks,
  retargetLinks,
  saveBoard,
  saveList,
  saveSchema,
  type VaultFs,
} from '@scrawlnotes/core';
import { checkOpen, cleanPath, Refusal } from './paths';
import { type Agent, AGENT_DEVICE, type ElementKind, elementsOf, exists, pickElement, pickSpace } from './space';

// Moving and renaming: a note, a task list, a board or a collection goes into another folder, gets
// another name, or both; what points at it (tasks, cards, link fields, rollups) points at it where
// it is now, as the app does when a person drags or renames. Folders themselves are not moved.

const MOVABLE: ElementKind[] = ['note', 'tasks', 'board', 'collection'];

export async function moveTool(agent: Agent, args: { space?: string; path: string; folder?: string; name?: string }) {
  const space = await pickSpace(agent, args.space);
  const given = cleanPath(args.path);
  if (given && (await exists(space.fs, given))?.kind === 'dir' && !(await elementsOf(space.fs, ['collection'])).some((c) => c.path === given)) {
    throw new Refusal('Folders are not moved; move what is in them, each with its own move', { folder: given });
  }
  const element = await pickElement(space.fs, args.path, MOVABLE, 'note, task list, board or collection');
  checkOpen(element.path);
  const folder = args.folder === undefined ? undefined : checkOpen(cleanPath(args.folder));
  const name = args.name?.trim();
  if (folder === undefined && !name) throw new Refusal('Give `folder` to move it, `name` to rename it, or both', { path: element.path });
  if (folder !== undefined) {
    const entry = await exists(space.fs, folder);
    if (entry?.kind !== 'dir') throw new Refusal(`No folder at ${folder}; create it first or give one that is there`, { folders: (await elementsOf(space.fs, ['folder'])).map((f) => f.path) });
    const collections = await elementsOf(space.fs, ['collection']);
    if (collections.some((c) => folder === c.path || folder.startsWith(`${c.path}/`))) throw new Refusal(`${folder} is a collection; only its records go in it`, { folder });
    if (element.kind === 'collection' && folder.startsWith(`${element.path}/`)) throw new Refusal('A collection cannot be moved into itself', { path: element.path });
  }
  const from = element.path;
  let to = from;
  const fs = space.fs;
  if (element.kind === 'collection') {
    if (folder !== undefined && folder !== dirname(to)) to = await moveCollection(fs, to, folder);
    if (name) to = await renameCollection(fs, to, name);
  } else {
    if (folder !== undefined && folder !== dirname(to)) to = await moveItem(fs, to, folder);
    if (name) to = await renameItem(fs, to, name);
  }
  if (to !== from) {
    await relink(fs, element.kind, from, to, !space.versioned);
    await carryCreated(fs, AGENT_DEVICE, from, to).catch(() => undefined);
  }
  return { data: { space: space.id, kind: element.kind, from, to, moved: to !== from } };
}

/** What pointed at `from` points at `to`; a note's history goes along on a computer, where it is kept beside the note. */
async function relink(fs: VaultFs, kind: ElementKind, from: string, to: string, history: boolean): Promise<void> {
  if (history && kind === 'note') await moveHistory(fs, from, to).catch(() => undefined);
  if (history && kind === 'collection') {
    const { records } = await loadCollection(fs, to, undefined, true).catch(() => ({ records: [] }));
    for (const record of records) await moveHistory(fs, `${from}${record.path.slice(to.length)}`, record.path).catch(() => undefined);
  }
  const lists = kind === 'tasks' ? [] : await elementsOf(fs, ['tasks']);
  for (const list of lists) {
    const current = await loadList(fs, list.path);
    const changed = kind === 'note' ? relinkNote(current, from, to) : kind === 'board' ? relinkBoard(current, from, to) : relinkTaskRecords(current, from, to);
    if (changed !== current) await saveList(fs, list.path, changed);
  }
  if (kind === 'note' || kind === 'collection') {
    for (const board of await elementsOf(fs, ['board'])) {
      const current = await loadBoard(fs, board.path);
      const changed = kind === 'note' ? relinkBoardNote(current, from, to) : retargetBoardLinks(current, from, to);
      if (changed !== current) await saveBoard(fs, board.path, changed);
    }
  }
  if (kind === 'board' || kind === 'collection') {
    for (const collection of await elementsOf(fs, ['collection'])) {
      const current = await loadSchema(fs, collection.path);
      const changed = retargetLinks(current, from, to);
      if (changed !== current) await saveSchema(fs, collection.path, changed);
    }
  }
}
