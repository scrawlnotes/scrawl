import {
  COLLECTION_TEMPLATES,
  type ChoiceRenames,
  type CollectionTemplate,
  createBoard,
  createCollection,
  createFolder,
  createNote,
  createTaskList,
  dirname,
  fold,
  keepVersion,
  loadCollection,
  parseBoard,
  parseList,
  parseRecord,
  parseSchema,
  renameChoices,
  type Schema,
  serializeBoard,
  serializeList,
  serializeRecord,
  type Template,
  type VaultFs,
  markCreated,
  APP_FILE,
  basename,
} from '@scrawlnotes/core';
import { checkOpen, cleanPath, type FileKind, fileKind, Refusal } from './paths';
import { boardWithPart, checkPart, listWithSections, partOf, PARTS, renamedViews, schemaWithPart } from './parts';
import { hashOf, MAX_TEXT } from './read';
import { type AppArgs, createApp } from './apps';
import { checkFile, checkRules } from './check';
import { actorOf, type Agent, AGENT_DEVICE, type AgentSpace, type Client, clockOf, elementsOf, exists, filePathOf, foundPath, nowOf, pickPath, pickSpace } from './space';

// Writing: a file as it is, a part of one, changes in a note, and a new element. A note the agent
// writes over keeps its earlier text as a version, every time; nothing is deleted for good.

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

/** What `write` takes: the whole file as `text`, one part of it with `part`, changes as `edits`, or more at its end as `append`. */
export interface WriteArgs {
  space?: string;
  path: string;
  /** The whole file; with `part`, that part's JSON. */
  text?: string;
  /** One part of a board, a task list or a schema, written alone. */
  part?: string;
  /** Changes in a note or a rules file: each `find` there once, or every time with `all`. */
  edits?: { find: string; replace: string; all?: boolean }[];
  /** Text added at the end of a note or a rules file. */
  append?: string;
  /** Choices renamed in a select field, by its key: the cards and records holding the old name take the new one. */
  renames?: ChoiceRenames;
  /** Where the cards not finished of a phase written done go: an open phase's name, "none" or "stay"; the next open phase when left out. */
  unfinished?: string;
  ifMatch?: string;
}

/** What a write says: where, what, its hash now, and what it did beside. */
type Written = {
  space: string;
  path: string;
  kind: FileKind;
  /** The file's, or with `part` the part's. */
  hash: string;
  part?: string;
  created?: boolean;
  /** false when the file or the part was already as written. */
  written?: boolean;
  exists?: boolean;
  message?: string;
  /** How many places `edits` changed. */
  replaced?: number;
  size?: number;
  /** What the cards and records did, a line each. */
  followed?: string[];
  notes?: string[];
};

const thingsWord = (n: number) => (n === 1 ? 'one thing' : `${n} things`);

/** Refuses a rules file with a mistake, each with its line. */
async function checkRulesText(fs: VaultFs, path: string, text: string) {
  const problems = await checkRules(fs, path, text);
  if (problems.length) throw new Refusal(`${path} was not written: ${thingsWord(problems.length)} to mend, then write it again`, { path, problems });
}

/** Refuses a write when the file changed since it was read. */
function checkMatch(path: string, ifMatch: string | undefined, now: string) {
  if (ifMatch !== undefined && now !== ifMatch) throw new Refusal(`${path} changed since it was read; read it again`, { path, hash: now });
}

const tooLarge = (path: string) => new Refusal(`${path} would be larger than agents write (1 MB)`, { path });

export async function writeTool(agent: Agent, args: WriteArgs, client: Client = {}): Promise<{ data: Written }> {
  const typed = checkOpen(cleanPath(args.path));
  if (!typed) throw new Refusal('Which file? Give a path');
  const ways = (['text', 'edits', 'append'] as const).filter((way) => args[way] !== undefined);
  if (ways.length !== 1) throw new Refusal(ways.length === 0 ? 'What to write? Give the whole file as text, changes as edits, or what goes at its end as append' : `Give one of text, edits and append, not ${ways.join(' and ')}`, { path: typed });
  if (args.part !== undefined && args.text === undefined) throw new Refusal('part is written with text: the JSON of that part, as read with part', { path: typed });
  if ((args.text ?? args.append ?? '').length > MAX_TEXT) throw new Refusal('The text is larger than agents write (1 MB)', { path: typed });
  const { space, path } = await writePlace(agent, args.space, typed);
  const kind = fileKind(path);
  if (basename(path) === APP_FILE) throw new Refusal(`${APP_FILE} says which templates an app was set up from and with which answers; it is read, not written. To add a template, use create with kind app and the app as folder`, { path });
  if (kind === 'other') throw new Refusal(`Scrawl shows notes (.md), task lists (.tasks.json), boards (.board.json), collections' schemas (_collection.json) and rules (_rules.js); ${path} is none of them and was not written`, { path });
  if (args.renames && !(kind === 'schema' && (args.part === undefined || args.part === 'fields')) && !(kind === 'board' && args.part === 'fields')) {
    throw new Refusal('renames go with a schema written whole or with part "fields", or with a board\'s part "fields"', { path });
  }
  if (args.edits || args.append !== undefined) {
    if (kind !== 'note' && kind !== 'rules') throw new Refusal(`${args.edits ? 'edits' : 'append'} change a note or a rules file; write one part of ${path} with part and text, or all of it with text`, { path, parts: Object.keys(PARTS[kind] ?? {}) });
    return args.edits ? writeEdits(agent, space, path, kind, args.edits, args.ifMatch) : writeAppend(space, path, kind, args.append!, args.ifMatch);
  }
  if (args.part !== undefined) return writePart(agent, client, space, path, kind, { ...args, part: args.part, text: args.text! });
  return writeWhole(agent, space, path, kind, { ...args, text: args.text! });
}

/** The whole file as given; one as it already is is not written again. */
async function writeWhole(agent: Agent, space: AgentSpace, path: string, kind: FileKind, args: WriteArgs & { text: string }): Promise<{ data: Written }> {
  const notes = await checkJson(space.fs, path, kind, args.text);
  if (kind === 'rules') await checkRulesText(space.fs, path, args.text);
  const entry = await exists(space.fs, path);
  if (entry?.kind === 'dir') throw new Refusal(`${path} is a folder`, { path });
  const previous = entry ? await space.fs.readText(path) : null;
  // A cut-off call sent again finds its text written: nothing to do, whatever the hash it was read with.
  if (previous === args.text && !args.renames) return { data: { space: space.id, path, kind, hash: hashOf(args.text), created: false, written: false, message: `${path} is already as written; nothing changed.` } };
  checkMatch(path, args.ifMatch, hashOf(previous ?? ''));
  let text = args.text;
  if (args.renames) {
    if (previous === null) throw new Refusal('A new schema has no choices to rename; leave renames out', { path });
    text = `${JSON.stringify(renamedViews(JSON.parse(previous) as { [key: string]: unknown }, JSON.parse(text) as { [key: string]: unknown }, args.renames), null, 2)}\n`;
  }
  // A server versions every write itself; its history folder is a device's own, and it refuses it.
  if (kind === 'note' && !space.versioned && previous?.trim() && previous !== text) await keepVersion(space.fs, path, previous, { now: nowOf(agent), always: true });
  await space.fs.writeText(path, text);
  const renamed = args.renames ? await renameInRecords(space.fs, dirname(path), parseSchema(text), args.renames) : 0;
  return { data: { space: space.id, path, kind, hash: hashOf(text), created: !entry, ...(renamed > 0 && { followed: [`${recordsWord(renamed)} took the new names`] }), ...(notes.length > 0 && { notes }) } };
}

const recordsWord = (n: number) => (n === 1 ? '1 record' : `${n} records`);

/** The records of a collection whose values hold a renamed choice, written with the new name, as the app's Fields window does; how many. */
async function renameInRecords(fs: VaultFs, dir: string, schema: Schema, renames: ChoiceRenames): Promise<number> {
  let renamed = 0;
  for (const { path } of (await loadCollection(fs, dir, undefined, true)).records) {
    const record = parseRecord(await fs.readText(path), schema, path);
    const values = renameChoices(record.values, renames);
    if (values === record.values) continue;
    await fs.writeText(path, serializeRecord({ ...record, values }, schema));
    renamed++;
  }
  return renamed;
}

/**
 * One part of a board, a task list or a schema, the rest of the file as it is. `ifMatch` is the
 * part's hash: a card moved meanwhile does not stop a phase being written. The cards follow as
 * they do in the app.
 */
async function writePart(agent: Agent, client: Client, space: AgentSpace, path: string, kind: FileKind, args: WriteArgs & { part: string; text: string }): Promise<{ data: Written }> {
  const { part } = args;
  checkPart(kind, part, path);
  let value: unknown;
  try {
    value = JSON.parse(args.text);
  } catch (error) {
    throw new Refusal(`The text is not JSON (${(error as Error).message}); write ${part} as JSON, as read with part. Nothing was written`, { path, part });
  }
  const entry = await exists(space.fs, path);
  if (entry?.kind !== 'file') throw new Refusal(`No file at ${path}; make it with create first`, { path });
  const raw = await space.fs.readText(path);
  let data: { [key: string]: unknown };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Refusal(`${path} is not JSON; read it whole, mend it and write it whole with text`, { path });
  }
  const current = partOf(kind, data, part);
  if (current.text === JSON.stringify(value, null, 2) && !args.renames) return { data: { space: space.id, path, kind, part, hash: hashOf(current.text), written: false, message: `${part} is already as written; nothing changed.` } };
  checkMatch(path, args.ifMatch, hashOf(current.text));
  let text: string;
  let followed: string[] = [];
  if (kind === 'board') {
    const by = actorOf(client, await agent.person());
    const done = boardWithPart(parseBoard(raw), part, value, args.renames, nowOf(agent), by, args.unfinished);
    text = serializeBoard(done.board);
    followed = done.followed;
  } else if (kind === 'tasks') {
    text = serializeList(listWithSections(parseList(raw), value));
  } else {
    text = `${JSON.stringify(schemaWithPart(data, part, value, args.renames), null, 2)}\n`;
  }
  const notes = await checkJson(space.fs, path, kind, text);
  await space.fs.writeText(path, text);
  if (kind === 'schema' && args.renames) {
    const renamed = await renameInRecords(space.fs, dirname(path), parseSchema(text), args.renames);
    if (renamed > 0) followed.push(`${recordsWord(renamed)} took the new names`);
  }
  const written = partOf(kind, JSON.parse(text) as { [key: string]: unknown }, part);
  return { data: { space: space.id, path, kind, part, hash: hashOf(written.text), written: true, ...(followed.length > 0 && { followed }), ...(notes.length > 0 && { notes }) } };
}

/** `\n` as the file has its lines: `\r\n` in one written on Windows. */
const linedAs = (file: string) => (file.includes('\r\n') ? (text: string) => text.replace(/\r?\n/g, '\r\n') : (text: string) => text);

/** Changes in a note or a rules file, each where its `find` is: all written, or none. */
async function writeEdits(agent: Agent, space: AgentSpace, path: string, kind: FileKind, edits: NonNullable<WriteArgs['edits']>, ifMatch: string | undefined): Promise<{ data: Written }> {
  const entry = await exists(space.fs, path);
  if (entry?.kind !== 'file') throw new Refusal(`No file at ${path} to change; write it with text`, { path });
  const previous = await space.fs.readText(path);
  checkMatch(path, ifMatch, hashOf(previous));
  const lined = linedAs(previous);
  let text = previous;
  let replaced = 0;
  for (const [i, edit] of edits.entries()) {
    const find = lined(edit.find);
    const replace = lined(edit.replace);
    if (!find) throw new Refusal(`Edit ${i + 1} has nothing to find. Nothing was written`, { path, edit: i + 1 });
    const count = text.split(find).length - 1;
    if (count === 0) {
      const done = replace !== '' && text.includes(replace);
      throw new Refusal(`Edit ${i + 1}: its find is not in ${path}${done ? '; its replace is, so it may be written already: read the file' : '; read the file and copy the text as it is there'}. Nothing was written`, { path, edit: i + 1 });
    }
    if (count > 1 && !edit.all) throw new Refusal(`Edit ${i + 1}: its find is in ${path} ${count} times; give more of the text around it so that it is there once, or all: true to change every one. Nothing was written`, { path, edit: i + 1, found: count });
    text = edit.all ? text.split(find).join(replace) : text.replace(find, () => replace);
    replaced += edit.all ? count : 1;
  }
  if (text.length > MAX_TEXT) throw tooLarge(path);
  if (kind === 'rules') await checkRulesText(space.fs, path, text);
  if (kind === 'note' && !space.versioned && previous.trim() && previous !== text) await keepVersion(space.fs, path, previous, { now: nowOf(agent), always: true });
  await space.fs.writeText(path, text);
  return { data: { space: space.id, path, kind, hash: hashOf(text), replaced } };
}

/** Text added at the end of a note or a rules file, made when it is not there. Nothing is lost, so no version is kept. */
async function writeAppend(space: AgentSpace, path: string, kind: FileKind, append: string, ifMatch: string | undefined): Promise<{ data: Written }> {
  if (!append) throw new Refusal('append is empty; give the text to add', { path });
  const entry = await exists(space.fs, path);
  if (entry?.kind === 'dir') throw new Refusal(`${path} is a folder`, { path });
  const previous = entry ? await space.fs.readText(path) : '';
  checkMatch(path, ifMatch, hashOf(previous));
  const lined = linedAs(previous);
  const piece = lined(append);
  // A cut-off call sent again finds its piece at the end: it is not added twice.
  if (previous.endsWith(piece)) return { data: { space: space.id, path, kind, hash: hashOf(previous), written: false, exists: true, message: `${path} already ends with this text; it was not added again.` } };
  const text = previous + (previous && !previous.endsWith('\n') ? lined('\n') : '') + piece;
  if (text.length > MAX_TEXT) throw tooLarge(path);
  if (kind === 'rules') await checkRulesText(space.fs, path, text);
  await space.fs.writeText(path, text);
  return { data: { space: space.id, path, kind, hash: hashOf(text), created: !entry, size: text.length } };
}

export type CreateKind = 'note' | 'tasks' | 'board' | 'collection' | 'folder' | 'app';

/** Each kind as the agent reads it in a sentence. */
const KIND_WORDS: { [kind in CreateKind]: string } = { note: 'note', tasks: 'task list', board: 'board', collection: 'collection', folder: 'folder', app: 'app' };

export async function createTool(agent: Agent, args: { space?: string; folder?: string; kind: CreateKind; name: string; template?: string; text?: string; another?: boolean } & Omit<AppArgs, 'folder' | 'name'>) {
  const space = await pickSpace(agent, args.space);
  const folder = args.folder ? checkOpen(cleanPath(args.folder)) : '';
  if (folder) {
    const entry = await exists(space.fs, folder);
    if (entry?.kind !== 'dir') throw new Refusal(`No folder at ${folder}; create it first or give one that is there`, { folders: (await elementsOf(space.fs, ['folder'])).map((f) => f.path) });
  }
  if (args.kind === 'app') return createApp(agent, space, { ...args, folder });
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
