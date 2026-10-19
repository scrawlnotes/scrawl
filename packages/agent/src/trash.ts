import {
  BOARD_EXT,
  cardPiece,
  fold,
  isCollection,
  keyOf,
  listName,
  loadBoard,
  loadCollection,
  loadList,
  type Piece,
  recordTitle,
  removeCard,
  removeSection,
  removeTask,
  saveBoard,
  saveList,
  sectionPiece,
  TASK_LIST_EXT,
  taskPiece,
  trashPiece,
  trashWithFiles,
  dirname,
} from '@scrawlnotes/core';
import { pickCard } from './cards';
import { checkOpen, cleanPath, fileKind, Refusal } from './paths';
import { type Agent, type AgentSpace, exists, nowOf, pickAcross, pickPath, pickRecord } from './space';

// The trash: a note, a task list, a board, a folder or a collection; with `id`, one task of a list,
// one card of a board or one record of a collection; with `section`, a section of a list with its
// tasks. Nothing is deleted for good: the person restores it from Trash (design/agent-fixes.md 2).

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

const restores = 'The person can restore it from Trash.';

export async function trashTool(agent: Agent, args: { space?: string; path: string; id?: string; section?: string }) {
  const typed = checkOpen(cleanPath(args.path));
  if (!typed) throw new Refusal('What to trash? Give a path or a name');
  // Without its schema a collection's records are loose notes; the collection goes to the trash whole.
  if (fileKind(typed) === 'schema') {
    const folder = typed.split('/').slice(0, -1).join('/');
    throw new Refusal(`${typed} is a collection’s schema; to remove the collection, trash its folder${folder ? ` (${folder})` : ''}`, { path: typed, ...(folder && { folder }) });
  }
  if (args.id?.trim() || args.section?.trim()) return trashOne(agent, args);
  const { space, path } = await whereIs(agent, args.space, typed);
  const entry = (await exists(space.fs, path))!;
  // The attached files only it used go with it, as they do when the person deletes it.
  await trashWithFiles(space.fs, path, entry.kind === 'dir', () => [], nowOf(agent));
  const kind =
    entry.kind === 'dir'
      ? isCollection(await space.fs.list(path).catch(() => [])) ? 'collection' : 'folder'
      : path.endsWith(BOARD_EXT) ? 'board' : path.endsWith(TASK_LIST_EXT) ? 'tasks' : isCollection(await space.fs.list(dirname(path)).catch(() => [])) ? 'record' : 'note';
  return { data: { space: space.id, spaceName: space.name, trashed: path, kind, message: restores } };
}

/** What `typed` names: a file or a folder at that path, else a note, a list, a board, a collection or a folder by its name, in whichever space has it. */
async function whereIs(agent: Agent, spaceRef: string | undefined, typed: string): Promise<{ space: AgentSpace; path: string }> {
  try {
    return await pickPath(agent, spaceRef, typed);
  } catch (error) {
    if (!(error instanceof Refusal) || error.details.candidates) throw error;
    const { space, element } = await pickAcross(agent, spaceRef, typed, ['note', 'tasks', 'board', 'collection', 'folder'], 'note, list, board, collection or folder');
    return { space, path: element.path };
  }
}

/** One task, one section with its tasks, one card or one record: out of its list, board or collection, into the trash. */
async function trashOne(agent: Agent, args: { space?: string; path: string; id?: string; section?: string }) {
  const { space, element } = await pickAcross(agent, args.space, args.path, ['tasks', 'board', 'collection'], 'task list, board or collection');
  const where = { space: space.id, spaceName: space.name };
  const now = nowOf(agent);
  const done = (kind: string, title: string, trashed: string) => ({ data: { ...where, kind, title, from: element.path, trashed, message: restores } });
  if (element.kind === 'tasks') {
    const list = await loadList(space.fs, element.path);
    let piece: Piece | null;
    let next = list;
    if (args.section?.trim()) {
      if (args.id?.trim()) throw new Refusal('Give id for a task or section for a section, not both');
      const section = list.sections.find((s) => s.id === args.section) ?? list.sections.find((s) => same(s.name, args.section!));
      if (!section) throw new Refusal(`No section called ${args.section} in ${listName(element.path)}`, { sections: list.sections.map((s) => s.name) });
      piece = sectionPiece(list, section.id);
      next = removeSection(list, section.id);
    } else {
      const byId = list.tasks.find((t) => t.id === args.id);
      const byTitle = byId ? [byId] : list.tasks.filter((t) => same(t.title, args.id!));
      if (byTitle.length > 1) throw new Refusal(`More than one task is called ${args.id}; say which by id`, { candidates: byTitle.map((t) => ({ id: t.id, title: t.title })) });
      const task = byTitle[0];
      if (!task) throw new Refusal(`No task ${args.id} in ${listName(element.path)}`, { list: element.path });
      piece = taskPiece(list, task.id);
      next = { ...list, tasks: removeTask(list.tasks, task.id) };
    }
    const trashed = await trashPiece(space.fs, element.path, piece!, now);
    await saveList(space.fs, element.path, next);
    return done(piece!.kind, piece!.kind === 'section' ? piece!.section.name : piece!.tasks[0]!.title, trashed);
  }
  if (args.section?.trim()) throw new Refusal('A section is a task list’s; give the list as path');
  if (element.kind === 'board') {
    const board = await loadBoard(space.fs, element.path);
    const card = pickCard(board, args.id!);
    const trashed = await trashPiece(space.fs, element.path, cardPiece(board, card.id)!, now);
    await saveBoard(space.fs, element.path, removeCard(board, card.id));
    return { data: { ...done('card', card.title, trashed).data, key: keyOf(board, card) } };
  }
  // A record goes to the trash as its file, with the files only it used, as when the person deletes it.
  const collection = await loadCollection(space.fs, element.path);
  const record = pickRecord(collection, args.id!);
  await trashWithFiles(space.fs, record.path, false, () => [], now);
  return done('record', recordTitle(record), record.path);
}
