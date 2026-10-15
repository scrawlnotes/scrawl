import {
  BOARD_EXT,
  COLLECTION_TEMPLATES,
  type CollectionTemplate,
  createBoard,
  createCollection,
  createFolder,
  createNote,
  createTaskList,
  keepVersion,
  TASK_LIST_EXT,
  type Template,
  trashFolder,
  trashItem,
} from '@scrawlnotes/core';
import { checkOpen, cleanPath, fileKind, Refusal } from './paths';
import { hashOf, MAX_TEXT } from './read';
import { type Agent, elementsOf, exists, nowOf, pickSpace } from './space';

// Writing: a file as it is, a new element, and the trash. A note the agent writes over keeps its
// earlier text as a version, every time; nothing is deleted for good.

export const BOARD_TEMPLATES: readonly Template[] = ['software', 'simple', 'issues', 'crm'];

export async function writeTool(agent: Agent, args: { space?: string; path: string; text: string; ifMatch?: string }) {
  const space = await pickSpace(agent, args.space);
  const path = checkOpen(cleanPath(args.path));
  if (!path) throw new Refusal('Which file? Give a path');
  if (args.text.length > MAX_TEXT) throw new Refusal('The text is larger than agents write (1 MB)', { path });
  const entry = await exists(space.fs, path);
  if (entry?.kind === 'dir') throw new Refusal(`${path} is a folder`, { path });
  const previous = entry ? await space.fs.readText(path) : null;
  if (args.ifMatch !== undefined) {
    const now = hashOf(previous ?? '');
    if (now !== args.ifMatch) throw new Refusal(`${path} changed since it was read; read it again`, { path, hash: now });
  }
  const kind = fileKind(path);
  // A server versions every write itself; its history folder is a device's own, and it refuses it.
  if (kind === 'note' && !space.versioned && previous?.trim() && previous !== args.text) await keepVersion(space.fs, path, previous, { now: nowOf(agent), always: true });
  await space.fs.writeText(path, args.text);
  return { data: { space: space.id, path, kind, hash: hashOf(args.text), created: !entry } };
}

export type CreateKind = 'note' | 'tasks' | 'board' | 'collection' | 'folder';

export async function createTool(agent: Agent, args: { space?: string; folder?: string; kind: CreateKind; name: string; template?: string; text?: string }) {
  const space = await pickSpace(agent, args.space);
  const folder = args.folder ? checkOpen(cleanPath(args.folder)) : '';
  if (folder) {
    const entry = await exists(space.fs, folder);
    if (entry?.kind !== 'dir') throw new Refusal(`No folder at ${folder}; create it first or give one that is there`, { folders: (await elementsOf(space.fs, ['folder'])).map((f) => f.path) });
  }
  const name = args.name.trim();
  if (!name && args.kind !== 'note') throw new Refusal(`A ${args.kind} needs a name`);
  let path: string;
  switch (args.kind) {
    case 'note':
      path = await createNote(space.fs, folder, name, nowOf(agent));
      if (args.text) await space.fs.writeText(path, args.text);
      break;
    case 'tasks':
      path = await createTaskList(space.fs, folder, name);
      break;
    case 'board': {
      const template = (args.template ?? 'simple') as Template;
      if (!BOARD_TEMPLATES.includes(template)) throw new Refusal(`No board template called ${args.template}`, { templates: BOARD_TEMPLATES });
      path = await createBoard(space.fs, folder, name, template);
      break;
    }
    case 'collection': {
      const template = (args.template ?? 'blank') as CollectionTemplate;
      if (!COLLECTION_TEMPLATES.includes(template)) throw new Refusal(`No collection template called ${args.template}`, { templates: COLLECTION_TEMPLATES });
      path = await createCollection(space.fs, folder, name, template);
      break;
    }
    case 'folder':
      path = await createFolder(space.fs, name, folder);
      break;
  }
  return { data: { space: space.id, path, kind: args.kind } };
}

export async function trashTool(agent: Agent, args: { space?: string; path: string }) {
  const space = await pickSpace(agent, args.space);
  const path = checkOpen(cleanPath(args.path));
  if (!path) throw new Refusal('What to trash? Give a path');
  const entry = await exists(space.fs, path);
  if (!entry) throw new Refusal(`Nothing is at ${path}`, { path });
  const now = nowOf(agent);
  if (entry.kind === 'dir') await trashFolder(space.fs, path, now);
  else await trashItem(space.fs, path, now);
  const kind = entry.kind === 'dir' ? 'folder' : path.endsWith(BOARD_EXT) ? 'board' : path.endsWith(TASK_LIST_EXT) ? 'tasks' : 'file';
  return { data: { space: space.id, trashed: path, kind } };
}
