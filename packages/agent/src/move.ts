import {
  carryCreated,
  dirname,
  isUnder,
  loadBoard,
  loadList,
  loadSchema,
  moveCollection,
  moveFolder,
  moveHistory,
  moveItem,
  relinkBoard,
  relinkBoardNote,
  relinkNote,
  relinkNotes,
  relinkTaskRecords,
  relinkTrash,
  renameCollection,
  renameFolder,
  renameItem,
  retargetBoardLinks,
  retargetLinks,
  saveBoard,
  saveList,
  saveSchema,
  type VaultFs,
} from '@scrawlnotes/core';
import { checkOpen, cleanPath, Refusal } from './paths';
import { type Agent, AGENT_DEVICE, type ElementKind, elementsOf, exists, pickAcross } from './space';

// Moving and renaming: a note, a task list, a board, a collection or a folder with everything in
// it goes into another folder, gets another name, or both; what points at it, and at what is in it
// (tasks, cards, link fields, rollups, the links of notes), points at it where it is now, as the
// app does when a person drags or renames.

const MOVABLE: ElementKind[] = ['note', 'tasks', 'board', 'collection', 'folder'];

/** One thing that moved: what it is, where it was and where it is. */
interface Moved {
  kind: ElementKind;
  from: string;
  to: string;
}

export async function moveTool(agent: Agent, args: { space?: string; path: string; folder?: string; name?: string }) {
  const { space, element } = await pickAcross(agent, args.space, args.path, MOVABLE, 'note, task list, board, collection or folder');
  checkOpen(element.path);
  const folder = args.folder === undefined ? undefined : checkOpen(cleanPath(args.folder));
  const name = args.name?.trim();
  if (folder === undefined && !name) throw new Refusal('Give `folder` to move it, `name` to rename it, or both', { path: element.path });
  if (folder !== undefined) {
    const entry = await exists(space.fs, folder);
    if (entry?.kind !== 'dir') throw new Refusal(`No folder at ${folder}; create it first or give one that is there`, { folders: (await elementsOf(space.fs, ['folder'])).map((f) => f.path) });
    const collections = await elementsOf(space.fs, ['collection']);
    if (collections.some((c) => isUnder(folder, c.path))) throw new Refusal(`${folder} is a collection; only its records go in it`, { folder });
    if ((element.kind === 'collection' || element.kind === 'folder') && isUnder(folder, element.path)) throw new Refusal(`A ${element.kind} cannot be moved into itself or a folder inside it`, { path: element.path });
  }
  const from = element.path;
  let to = from;
  const fs = space.fs;
  if (element.kind === 'folder') {
    if (folder !== undefined && folder !== dirname(to)) to = await moveFolder(fs, to, folder);
    if (name) to = await renameFolder(fs, to, name);
  } else if (element.kind === 'collection') {
    if (folder !== undefined && folder !== dirname(to)) to = await moveCollection(fs, to, folder);
    if (name) to = await renameCollection(fs, to, name);
  } else {
    if (folder !== undefined && folder !== dirname(to)) to = await moveItem(fs, to, folder);
    if (name) to = await renameItem(fs, to, name);
  }
  let links: string[] = [];
  if (to !== from) {
    // A folder's things moved with it, each where it was under the folder.
    const moves: Moved[] =
      element.kind === 'folder'
        ? (await elementsOf(fs)).filter((each) => each.kind !== 'folder' && isUnder(each.path, to)).map((each) => ({ kind: each.kind, from: from + each.path.slice(to.length), to: each.path }))
        : [{ kind: element.kind, from, to }];
    links = await relink(fs, moves, { from, to }, !space.versioned);
    await carryCreated(fs, AGENT_DEVICE, from, to).catch(() => undefined);
  }
  return { data: { space: space.id, kind: element.kind, from, to, moved: to !== from, ...(links.length > 0 && { links: `The links of ${links.length === 1 ? 'a note' : `${links.length} notes`} point at it where it is now: ${links.join(', ')}` }) } };
}

/**
 * What pointed at what moved points at it where it is now, the links of notes too, which it
 * returns. `whole` is what was moved: the thing, or the folder it moved in. The history of its
 * notes, a collection's records among them, goes along on a computer, where it is kept beside them.
 */
async function relink(fs: VaultFs, moves: Moved[], whole: { from: string; to: string }, history: boolean): Promise<string[]> {
  if (history) await moveHistory(fs, whole.from, whole.to).catch(() => undefined);
  const kinds = new Set(moves.map((m) => m.kind));
  if (kinds.has('note') || kinds.has('board') || kinds.has('collection')) {
    for (const list of await elementsOf(fs, ['tasks'])) {
      const current = await loadList(fs, list.path);
      const changed = moves.reduce(
        (each, m) => (m.kind === 'note' ? relinkNote(each, m.from, m.to) : m.kind === 'board' ? relinkBoard(each, m.from, m.to) : m.kind === 'collection' ? relinkTaskRecords(each, m.from, m.to) : each),
        current,
      );
      if (changed !== current) await saveList(fs, list.path, changed);
    }
  }
  if (kinds.has('note') || kinds.has('collection')) {
    for (const board of await elementsOf(fs, ['board'])) {
      const current = await loadBoard(fs, board.path);
      const changed = moves.reduce((each, m) => (m.kind === 'note' ? relinkBoardNote(each, m.from, m.to) : m.kind === 'collection' ? retargetBoardLinks(each, m.from, m.to) : each), current);
      if (changed !== current) await saveBoard(fs, board.path, changed);
    }
  }
  // What was deleted from a list or a board goes back to it where it is now.
  for (const m of moves) if (m.kind === 'tasks' || m.kind === 'board') await relinkTrash(fs, m.from, m.to);
  if (kinds.has('board') || kinds.has('collection')) {
    for (const collection of await elementsOf(fs, ['collection'])) {
      const current = await loadSchema(fs, collection.path);
      const changed = moves.reduce((each, m) => (m.kind === 'board' || m.kind === 'collection' ? retargetLinks(each, m.from, m.to) : each), current);
      if (changed !== current) await saveSchema(fs, collection.path, changed);
    }
  }
  // A note that links to what moved, and the links of what moved when it is a note or holds notes.
  return relinkNotes(fs, [whole]);
}
