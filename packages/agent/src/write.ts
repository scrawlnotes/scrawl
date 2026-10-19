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
  trashWithFiles,
  markCreated,
} from '@scrawlnotes/core';
import { checkOpen, cleanPath, type FileKind, fileKind, Refusal } from './paths';
import { hashOf, MAX_TEXT } from './read';
import { type Agent, AGENT_DEVICE, elementsOf, exists, nowOf, pickSpace } from './space';

// Writing: a file as it is, a new element, and the trash. A note the agent writes over keeps its
// earlier text as a version, every time; nothing is deleted for good.

export const BOARD_TEMPLATES: readonly Template[] = ['software', 'simple', 'issues', 'crm'];

/** The lists a schema, a board and a task list must have. The app reads a file without them as empty, and its next save loses what was there. */
const LISTS: Partial<Record<FileKind, string[]>> = { schema: ['fields'], board: ['columns', 'cards'], tasks: ['tasks'] };

/** Refuses a schema, a board or a task list that is not JSON or lacks its lists, saying what is wrong. */
function checkJson(path: string, kind: FileKind, text: string) {
  const lists = LISTS[kind];
  if (!lists) return;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Refusal(`${path} is not JSON (${(error as Error).message}); nothing was written. Scrawl would read it as empty`, { path });
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Refusal(`${path} must be a JSON object; nothing was written`, { path });
  const missing = lists.filter((key) => !Array.isArray((data as { [key: string]: unknown })[key]));
  if (missing.length) throw new Refusal(`${path} needs ${missing.map((key) => `"${key}"`).join(' and ')} as a list; nothing was written. Read the file, change it and write all of it back`, { path, missing });
}

export async function writeTool(agent: Agent, args: { space?: string; path: string; text: string; ifMatch?: string }) {
  const space = await pickSpace(agent, args.space);
  const path = checkOpen(cleanPath(args.path));
  if (!path) throw new Refusal('Which file? Give a path');
  if (args.text.length > MAX_TEXT) throw new Refusal('The text is larger than agents write (1 MB)', { path });
  const kind = fileKind(path);
  checkJson(path, kind, args.text);
  const entry = await exists(space.fs, path);
  if (entry?.kind === 'dir') throw new Refusal(`${path} is a folder`, { path });
  const previous = entry ? await space.fs.readText(path) : null;
  if (args.ifMatch !== undefined) {
    const now = hashOf(previous ?? '');
    if (now !== args.ifMatch) throw new Refusal(`${path} changed since it was read; read it again`, { path, hash: now });
  }
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
  // When it was made, kept as the app keeps it, for the order by Date created.
  await markCreated(space.fs, AGENT_DEVICE, { [path]: nowOf(agent) }).catch(() => undefined);
  return { data: { space: space.id, path, kind: args.kind } };
}

export async function trashTool(agent: Agent, args: { space?: string; path: string }) {
  const space = await pickSpace(agent, args.space);
  const path = checkOpen(cleanPath(args.path));
  if (!path) throw new Refusal('What to trash? Give a path');
  // Without its schema a collection's records are loose notes; the collection goes to the trash whole.
  if (fileKind(path) === 'schema') {
    const folder = path.split('/').slice(0, -1).join('/');
    throw new Refusal(`${path} is a collection’s schema; to remove the collection, trash its folder${folder ? ` (${folder})` : ''}`, { path, ...(folder && { folder }) });
  }
  const entry = await exists(space.fs, path);
  if (!entry) throw new Refusal(`Nothing is at ${path}`, { path });
  const now = nowOf(agent);
  // The attached files only it used go with it, as they do when the person deletes it.
  await trashWithFiles(space.fs, path, entry.kind === 'dir', () => [], now);
  const kind = entry.kind === 'dir' ? 'folder' : path.endsWith(BOARD_EXT) ? 'board' : path.endsWith(TASK_LIST_EXT) ? 'tasks' : 'file';
  return { data: { space: space.id, trashed: path, kind } };
}
