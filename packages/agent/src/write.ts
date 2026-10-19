import {
  COLLECTION_TEMPLATES,
  type CollectionTemplate,
  createBoard,
  createCollection,
  createFolder,
  createNote,
  createTaskList,
  dirname,
  fold,
  keepVersion,
  type Template,
  type VaultFs,
  markCreated,
} from '@scrawlnotes/core';
import { checkOpen, cleanPath, type FileKind, fileKind, Refusal } from './paths';
import { hashOf, MAX_TEXT } from './read';
import { checkFile } from './check';
import { type Agent, AGENT_DEVICE, type AgentSpace, clockOf, elementsOf, exists, filePathOf, foundPath, nowOf, pickPath, pickSpace } from './space';

// Writing: a file as it is, and a new element. A note the agent writes over keeps its
// earlier text as a version, every time; nothing is deleted for good.

export const BOARD_TEMPLATES: readonly Template[] = ['software', 'simple', 'issues', 'crm'];

/** The lists a schema, a board and a task list must have. The app reads a file without them as empty, and its next save loses what was there. */
const LISTS: Partial<Record<FileKind, string[]>> = { schema: ['fields'], board: ['columns', 'cards'], tasks: ['tasks'] };

/**
 * Refuses a schema, a board or a task list that is not JSON, lacks its lists or has what the app
 * cannot read, saying each thing that is wrong; returns what is written but worth saying.
 */
async function checkJson(fs: VaultFs, path: string, kind: FileKind, text: string): Promise<string[]> {
  const lists = LISTS[kind];
  if (!lists) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Refusal(`${path} is not JSON (${(error as Error).message}); nothing was written. Scrawl would read it as empty`, { path });
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Refusal(`${path} must be a JSON object; nothing was written`, { path });
  const missing = lists.filter((key) => !Array.isArray((data as { [key: string]: unknown })[key]));
  if (missing.length) throw new Refusal(`${path} needs ${missing.map((key) => `"${key}"`).join(' and ')} as a list; nothing was written. Read the file, change it and write all of it back`, { path, missing });
  const { problems, notes } = await checkFile(fs, kind, data as { [key: string]: unknown }, text);
  if (problems.length) throw new Refusal(`${path} was not written: ${problems.length === 1 ? 'one thing' : `${problems.length} things`} to mend, then write it again`, { path, problems });
  return notes;
}

/**
 * Where a file is written: the file that is there, in the space named or in whichever space has
 * it; a new one in the space named, or the only one. A new file is not put in a space guessed at.
 * A name with what a file name cannot hold is written with the look-alike the app gives it:
 * `Ne yapmalı？.md`.
 */
async function writePlace(agent: Agent, spaceRef: string | undefined, typed: string): Promise<{ space: AgentSpace; path: string }> {
  const spaces = await agent.spaces();
  if (!spaceRef?.trim() && spaces.length > 1) {
    try {
      return await pickPath(agent, undefined, typed);
    } catch (error) {
      if (error instanceof Refusal && error.details.candidates) throw error;
      throw new Refusal(`Which space? ${typed} is in none of them; to make it, name the space with space`, { spaces: spaces.map(({ id, name, where }) => ({ id, name, where })) });
    }
  }
  const space = await pickSpace(agent, spaceRef);
  return { space, path: (await foundPath(space.fs, typed)) ?? filePathOf(typed) };
}

export async function writeTool(agent: Agent, args: { space?: string; path: string; text: string; ifMatch?: string }) {
  const typed = checkOpen(cleanPath(args.path));
  if (!typed) throw new Refusal('Which file? Give a path');
  if (args.text.length > MAX_TEXT) throw new Refusal('The text is larger than agents write (1 MB)', { path: typed });
  const { space, path } = await writePlace(agent, args.space, typed);
  const kind = fileKind(path);
  if (kind === 'other') throw new Refusal(`Scrawl shows notes (.md), task lists (.tasks.json), boards (.board.json) and collections' schemas (_collection.json); ${path} is none of them and was not written`, { path });
  const notes = await checkJson(space.fs, path, kind, args.text);
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
  return { data: { space: space.id, path, kind, hash: hashOf(args.text), created: !entry, ...(notes.length > 0 && { notes }) } };
}

export type CreateKind = 'note' | 'tasks' | 'board' | 'collection' | 'folder';

/** Each kind as the agent reads it in a sentence. */
const KIND_WORDS: { [kind in CreateKind]: string } = { note: 'note', tasks: 'task list', board: 'board', collection: 'collection', folder: 'folder' };

export async function createTool(agent: Agent, args: { space?: string; folder?: string; kind: CreateKind; name: string; template?: string; text?: string; another?: boolean }) {
  const space = await pickSpace(agent, args.space);
  const folder = args.folder ? checkOpen(cleanPath(args.folder)) : '';
  if (folder) {
    const entry = await exists(space.fs, folder);
    if (entry?.kind !== 'dir') throw new Refusal(`No folder at ${folder}; create it first or give one that is there`, { folders: (await elementsOf(space.fs, ['folder'])).map((f) => f.path) });
  }
  const name = args.name.trim();
  const what = KIND_WORDS[args.kind];
  if (!name && args.kind !== 'note') throw new Refusal(`A ${what} needs a name`);
  // A cut-off call sent again must not make a second one, "Plan 2"; a folder is the one that is there.
  const same = name ? (await elementsOf(space.fs, [args.kind])).find((e) => dirname(e.path) === folder && fold(e.title) === fold(name)) : undefined;
  if (same && (!args.another || args.kind === 'folder')) {
    return {
      data: {
        space: space.id,
        path: same.path,
        kind: args.kind,
        created: false,
        exists: true,
        message:
          args.kind === 'folder'
            ? `A folder called ${name} is already there; nothing was made.`
            : `A ${what} called ${name} is already there (${same.path}); nothing was made. To change it, use its path; to make a second one, numbered, pass another: true.`,
      },
    };
  }
  let path: string;
  switch (args.kind) {
    case 'note':
      path = await createNote(space.fs, folder, name, clockOf(agent));
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
  // When it was made, kept as the app keeps it, for the order by Date created: when its file was written.
  const written = (await space.fs.stat?.(path).catch(() => null))?.modified;
  await markCreated(space.fs, AGENT_DEVICE, { [path]: written ?? nowOf(agent) }).catch(() => undefined);
  return { data: { space: space.id, path, kind: args.kind, created: true } };
}
