import { McpServer, type ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { cardsTool, commentTool, MAX_ITEMS, saveCardTool } from './cards';
import { messagesTool, sendMessageTool } from './chat';
import { BRIEF, GUIDE } from './guide';
import { readTool, searchTool, spacesTool, treeTool } from './read';
import { dueRecordsTool, recordsTool, saveRecordTool } from './records';
import { answer } from './results';
import { moveTool } from './move';
import { type Agent, type Client, meet } from './space';
import { saveTaskTool, tasksTool } from './tasks';
import { trashTool } from './trash';
import { createTool, writeTool } from './write';

// The MCP server: the fifteen tools and the guide, over whatever spaces a door gives it, and on a
// Scrawl server the two of messaging. The same server runs over stdio on a computer and over HTTP
// on a Scrawl server. See design/agent.md and design/chat.md, 9.

export const VERSION = '0.1.0';

/** The client as it names itself with each request (2026-07-28), at the start of an older connection, or as the door knows it. */
function clientOf(server: McpServer, agent: Agent, ctx: ServerContext): Client {
  const envelope = ctx.mcpReq.envelope as { clientInfo?: { name?: string } } | undefined;
  const meta = ctx.mcpReq._meta as { [key: string]: unknown } | undefined;
  const fromMeta = meta?.['io.modelcontextprotocol/clientInfo'] as { name?: string } | undefined;
  const legacy = server.server.getClientVersion();
  const name = envelope?.clientInfo?.name ?? fromMeta?.name ?? legacy?.name ?? agent.client?.name;
  return name ? { name: pretty(name) } : {};
}

/** A client's name as people write it: `claude-code` is Claude Code. */
function pretty(name: string): string {
  const known: { [key: string]: string } = { 'claude-code': 'Claude Code', 'claude-ai': 'Claude', 'claude': 'Claude', 'claude-desktop': 'Claude Desktop', 'chatgpt': 'ChatGPT', 'cursor': 'Cursor', 'antigravity': 'Antigravity' };
  return known[name.toLowerCase()] ?? name;
}

const space = z.string().optional().describe('The space, by name or id; only that space is looked in. Left out, what is named is looked for in every space, and the one that has it is used.');
const spaceToMake = z.string().optional().describe('The space to make it in, by name or id. Needed when there is more than one.');
const day = z.string().nullable().optional().describe('A day as YYYY-MM-DD; null for none.');
const values = z.record(z.string(), z.unknown()).optional().describe('Field values by field key or label. A link field takes a record’s name, code or id (or a list of them).');
const subtasks = z
  .array(
    z.object({
      id: z.string().optional().describe('The subtask to change: its id or its title. Left out, it is added, unless an open one has the title.'),
      title: z.string().optional(),
      done: z.boolean().optional(),
      due: z.string().nullable().optional().describe('A day as YYYY-MM-DD; null for none.'),
      priority: z.number().int().min(1).max(4).optional(),
      assignee: z.string().nullable().optional().describe('Who it is given to, as for the card: a name, "me", "self"; null for nobody.'),
      remove: z.boolean().optional().describe('true takes it off the list.'),
    }),
  )
  .optional()
  .describe('Subtasks to add, change, tick off (done: true) or take off (remove: true); the others stay as they are. One level, in the order added.');
const another = z.boolean().optional().describe('true to add it even though one with the same name is already there. Left out, the tool returns the one that exists instead of adding a second.');
const by = z.string().optional().describe('Who worked on it, as its workedOn has them: "self" for you, "me" for the person, or a person’s or an agent’s name. With by or since, what is done comes too.');
const since = z.string().optional().describe('A day as YYYY-MM-DD: worked on since that day, by `by` when given, else by anyone.');

/** The MCP server over the spaces `agent` gives, with every tool and the guide. */
export function buildServer(agent: Agent): McpServer {
  const server = new McpServer({ name: 'scrawl', version: VERSION }, { capabilities: { tools: {}, resources: {} }, instructions: BRIEF });
  const client = (ctx: ServerContext) => clientOf(server, agent, ctx);
  // What changes a space writes the agent into its people, once a day (design/activity.md 2.3).
  const writing = (ctx: ServerContext, run: () => Promise<{ data: { [key: string]: unknown }; text?: string }>) =>
    answer(async () => {
      const done = await run();
      await meet(agent, client(ctx), done.data.space);
      return done;
    });

  // Messaging, where the door has it: a Scrawl server's conversations.
  if (agent.chat) {
    server.registerTool(
      'messages',
      {
        title: 'Messages',
        description:
          'The conversations of the Scrawl server: rooms and direct messages, as the person sees them. With nothing given, every conversation with how many messages the person has not read. With `in`, a conversation’s latest messages (`limit`, 30 when left out), or the first ones since a day (`since`). With `query`, `from` or `has`, the messages found, the newest first, everywhere or in `in` only. Each message has who wrote it, when, its Markdown, what it answers and its files’ names, types and sizes. Reading marks nothing read.',
        inputSchema: z.object({
          in: z.string().optional().describe('A conversation: a room by name (#dev or dev), a person for your direct message with them, or its id.'),
          space: z.string().optional().describe('The space of the room `in` names, when more than one space has a room by that name.'),
          query: z.string().optional().describe('Words to find: each where a word starts, with or without accents.'),
          from: z.string().optional().describe('Who wrote it, by name; "me" for the person.'),
          has: z.enum(['photos', 'files', 'voice', 'code', 'links']).optional(),
          since: z.string().optional().describe('A day as YYYY-MM-DD: what was written that day and after.'),
          limit: z.number().int().min(1).max(100).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => answer(() => messagesTool(agent, args)),
    );

    server.registerTool(
      'send_message',
      {
        title: 'Send a message',
        description:
          'Writes a message, as you, in a room or to a person: their direct message, opened when there is none. Markdown; @Name mentions someone in the conversation and @room everyone in a room. `replyTo` answers a message, quoting it. Words only: no files. Write when something is done that someone waits for, or to ask what you cannot find out; see the guide’s Messages.',
        inputSchema: z.object({
          to: z.string().describe('A room by name (#dev or dev), a person by name, or a conversation’s id.'),
          text: z.string().describe('The message, Markdown.'),
          replyTo: z.string().optional().describe('The id of the message it answers, from messages.'),
          space: z.string().optional().describe('The space of the room `to` names, when more than one space has a room by that name.'),
        }),
      },
      (args, ctx) => writing(ctx, () => sendMessageTool(agent, args, client(ctx))),
    );
  }

  server.registerResource('guide', 'scrawl://guide', { title: 'Scrawl guide', description: 'How a Scrawl space is laid out, what each file holds, and how an agent behaves in it. The spaces tool returns it too.', mimeType: 'text/markdown' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE }],
  }));

  server.registerTool(
    'spaces',
    {
      title: 'Spaces',
      description: 'Start here, once. Lists the spaces you can reach (id, name, where it lives, whether it is the personal one, its people and its agents by name), with today’s date, the person’s name and who you are (`you`, once you have written), and then the guide: how to work in Scrawl and how each file is laid out (a collection’s schema, a board, a task list). Read the guide before anything else. The other tools find a board, a list, a collection or a file by its name in every space; give `space` to look in one, and to make something new when there is more than one.',
      annotations: { readOnlyHint: true },
    },
    (ctx) => answer(() => spacesTool(agent, client(ctx))),
  );

  server.registerTool(
    'tree',
    {
      title: 'Tree',
      description: 'Lists what a space holds: folders, notes, task lists, boards and collections, each with its path and name. Give `kind` to get only one kind as a flat list (kind: "board" is every board at once); with `kind` and no `space`, every space’s, each item with its space. Use it to find the path of a thing before reading or changing it.',
      inputSchema: z.object({
        space,
        folder: z.string().optional().describe('A folder to look in; the whole space when left out.'),
        kind: z.enum(['note', 'tasks', 'board', 'keys', 'collection', 'folder']).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => treeTool(agent, args)),
  );

  server.registerTool(
    'read',
    {
      title: 'Read a file',
      description: 'Returns one file as it is, with its hash: a note (markdown), a record (front matter and body), a task list or a board (JSON), or a collection’s schema (_collection.json). With `part`, one part of a board, a task list or a schema alone, with its own hash: a board’s phases or columns without its cards, a list’s sections without its tasks, a schema’s fields or views; read it so before `write` with the same `part`. With `lines`, some lines of a long note. Keys files, .scrawl/ and _attachments/ are closed.',
      inputSchema: z.object({
        space,
        path: z.string().describe('The file’s path in the space.'),
        part: z.string().optional().describe('One part read alone: of a board columns, phases, fields, phasesOn, prefix or view; of a task list sections; of a schema fields, layout, views, defaultView or singular.'),
        lines: z
          .object({ from: z.number().int().min(1), to: z.number().int().min(1).optional() })
          .optional()
          .describe('For a note or a rules file: only these lines, counted from 1, both included; to left out reads to the end. The hash is still the whole file’s, for a write after it.'),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => readTool(agent, args)),
  );

  server.registerTool(
    'write',
    {
      title: 'Write a file',
      description: 'Writes a file, making folders as needed, in one of four ways: `text` writes the whole file, replacing what was there; `part` with `text` writes one part of a board, a task list or a schema alone (its phases, its columns, its sections, its views), the rest of the file staying as it is; `edits` changes a note or a rules file where each `find` is; `append` adds to the end of one, so a long note is written a piece at a time. Use it for notes, and for what no other tool changes: a collection’s fields and views, a board’s columns and phases, a list’s sections. For a board or a list write the part you change, never the whole file: read it with the same `part` first and pass its hash as `ifMatch`, so nothing is lost when it changed since. A new column, phase or section needs no id. When a part takes a column or a phase away, or sets a phase done, the cards follow as in the app (to the first column; to no phase; a done phase’s cards not finished to the next open phase, or where `unfinished` says) and `followed` says where. A schema, a board or a task list the app could not read (a key twice, a type that is none, a column kind that is none, no done column, a task without an id) is refused with each thing to mend. Only notes (.md), task lists, boards, schemas and rules are written. A note’s earlier text is kept. For tasks, cards and records use save_task, save_card and save_record instead: they keep ids and order.',
      inputSchema: z.object({
        space: z.string().optional().describe('The space, by name or id. Left out, a file that is there is found in whichever space has it; a new one needs the space when there is more than one.'),
        path: z.string(),
        text: z.string().optional().describe('The whole file; with part, the JSON of that part.'),
        part: z.string().optional().describe('One part written alone with text: of a board columns, phases, fields, phasesOn, prefix or view; of a task list sections; of a schema fields, layout, views, defaultView or singular.'),
        edits: z
          .array(z.object({ find: z.string().min(1).describe('Text as it is in the file, there once.'), replace: z.string(), all: z.boolean().optional().describe('true changes every place find is.') }))
          .min(1)
          .max(50)
          .optional()
          .describe('Changes in a note or a rules file, in their order: each find is replaced by its replace. All are written, or none when a find is not there, or is there more than once without all.'),
        append: z.string().optional().describe('Text added at the end of a note or a rules file, which is made when it is not there.'),
        renames: z
          .record(z.string(), z.record(z.string(), z.string()))
          .optional()
          .describe('With a schema, or a board’s part "fields": choices renamed in a select field, by the field’s key, { "status": { "Lead": "Prospect" } }, the new name in its options; the cards and records holding the old name take the new one.'),
        unfinished: z
          .string()
          .optional()
          .describe('With a board’s part "phases" that sets a phase done: where its cards not finished go, an open phase’s name, "none" for no phase, or "stay" to keep them in it. Left out, they go to the next open phase, as the app does when its Close phase window is left as it opens.'),
        ifMatch: z.string().optional().describe('The hash the file, or with part the part, had when read; the write is refused when it changed.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args, ctx) => writing(ctx, () => writeTool(agent, args, client(ctx))),
  );

  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Finds things by name or by words in their text, across every space: the spaces themselves, notes, tasks, cards, records, boards, collections, folders. Each hit says what it is and where it is (its space by id and name, and its path; in a note, the number of the line, `lineNo`, for read with lines). Use it when you do not know where something is.',
      inputSchema: z.object({ query: z.string(), space, limit: z.number().int().positive().optional() }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => searchTool(agent, args)),
  );

  server.registerTool(
    'create',
    {
      title: 'Create',
      description: 'Makes a new note, task list, board, collection or folder with a name, in `folder` (the top of the space when left out), and returns its path. Board templates: software, simple, issues, crm. Collection templates: companies, people, activities, feedback, payments, blank (no fields: then write its _collection.json). With kind app, sets up an app from `templates` (crm, sales, support, projects, budget, stock, product) in a folder of its name: their collections, boards, rules and an About note, each template with its `answers`, the ones not given taking their defaults; when `folder` is an app already, the templates are added to it. The guide\'s Apps says each template\'s questions. One of that kind and name already in the folder is not made again: the tool returns it with exists: true; another: true makes a second one, numbered.',
      inputSchema: z.object({
        space: spaceToMake,
        folder: z.string().optional().describe('The folder to make it in; the top of the space when left out.'),
        kind: z.enum(['note', 'tasks', 'board', 'collection', 'folder', 'app']),
        name: z.string(),
        template: z.string().optional().describe('For a board or a collection.'),
        text: z.string().optional().describe('For a note: its text.'),
        another: z.boolean().optional().describe('true to make a second one, numbered, when one with this name is already there. Left out, the tool returns the one that exists.'),
        templates: z.array(z.string()).optional().describe('For an app: the templates it is set up from, or added to it.'),
        answers: z.record(z.string(), z.record(z.string(), z.unknown())).optional().describe('For an app: by template, the answers to its questions, { "sales": { "tax": true, "quotes": false } }.'),
        currencies: z.array(z.string()).optional().describe('For a new app that keeps money: the codes of its currencies, the main one first, ["TRY", "EUR"].'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => writing(ctx, () => createTool(agent, args)),
  );

  server.registerTool(
    'trash',
    {
      title: 'Trash',
      description: 'Sends something to the trash, where the person can restore it; nothing is deleted for good. A note, a task list, a board, a folder or a collection by its path or its name (a collection by its folder, not its _collection.json); with `id`, one task of the list, one card of the board (its key like SCR-12) or one record of the collection given as path; with `section`, a section of the list with its tasks. Trash what should not be there at all, a mistake or a copy; work that is finished or given up is closed instead: a task with save_task done: true, a card with save_card column "done" or "dropped".',
      inputSchema: z.object({
        space,
        path: z.string().describe('What to trash, or the list, board or collection that holds it: its path or its name.'),
        id: z.string().optional().describe('One task (its id or title), one card (its key, number or id) or one record (its id, name or code) of what path names.'),
        section: z.string().optional().describe('A section of the list path names, by name: it goes with its tasks.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args, ctx) => writing(ctx, () => trashTool(agent, args)),
  );

  server.registerTool(
    'move',
    {
      title: 'Move or rename',
      description: 'Moves a note, a task list, a board, a collection or a folder with everything in it into another folder (`folder`), gives it a new name (`name`), or both. Tasks, cards, link fields, rollups and the links of notes that point at it, or at what is in it, point at its new place. A name that is taken gets a number. A folder does not go into itself or a folder inside it. Records are not moved: they belong to their collection.',
      inputSchema: z.object({
        space,
        path: z.string().describe('What to move, a folder too: its path, or its name when that is enough.'),
        folder: z.string().optional().describe('The folder to move it into; "" for the top of the space.'),
        name: z.string().optional().describe('Its new name, without extension.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    (args, ctx) => writing(ctx, () => moveTool(agent, args)),
  );

  server.registerTool(
    'records',
    {
      title: 'Records',
      description: 'Lists the records of a collection with their values, formulas and rollups worked out, and `problems` on values that do not fit the schema. `where` filters by field (key or label) with ops contains, is, is-not, empty, not-empty, gt, lt, before, after, on, true, false; `sort` orders; `limit` caps at 100 when left out. `from` and `to` (YYYY-MM-DD), or `due`, keep the records on those days, by the field its calendar goes by. With no collection, gives what the calendars that show in Today and Upcoming bring there, today\'s with `due: "today"`, in every space unless one is named: what is on today, with the tasks and cards. Use it before save_record to see what is there.',
      inputSchema: z.object({
        space,
        collection: z.string().optional().describe('The collection, by name or path. Left out with due, from or to: the records the calendars bring to Today and Upcoming.'),
        from: z.string().optional().describe('The first day, YYYY-MM-DD.'),
        to: z.string().optional().describe('The last day, YYYY-MM-DD.'),
        due: z.enum(['today', 'upcoming']).optional().describe('Today, or after today.'),
        where: z.array(z.object({ field: z.string(), op: z.string(), value: z.union([z.string(), z.number(), z.array(z.string())]).optional() })).optional(),
        sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']).optional() }).optional(),
        limit: z.number().int().positive().optional().describe('At most this many; 100 when left out.'),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => (args.collection ? recordsTool(agent, { ...args, collection: args.collection }) : dueRecordsTool(agent, args))),
  );

  server.registerTool(
    'save_record',
    {
      title: 'Save a record',
      description: 'Adds one record to a collection, or changes one when `id` is given (its id, name or code). Values are by field key or label; a link field takes the linked record’s name, code or id. A value that does not fit its field is written and marked in `problems`, not refused. Without `id`, a record with the same name or code is not added again: the tool returns it with exists: true; give its id to change it, or another: true to add a second one on purpose. `action` presses a button of the collection’s rules (an action() in its _rules.js) on the record, after the values are written: what it adds and changes is written at once and said back in `action`; a button that stops writes nothing and says the line and why. What the collection runs as a record is saved (an onSave() in its _rules.js) runs here too; what it did elsewhere, or where it stopped, comes back in `onSave`.',
      inputSchema: z.object({
        space,
        collection: z.string(),
        id: z.string().optional().describe('The record to change: its id, name or code. Left out, a new record is added.'),
        values,
        body: z.string().optional().describe('The notes under the fields, markdown.'),
        subtasks,
        another,
        action: z.string().optional().describe('A button of the collection’s rules to press on the record, by its label: "Start project".'),
        input: z.record(z.string(), z.unknown()).optional().describe('With action: the answers to what the button asks, by its questions’ keys: { "total": 11 }; a link by the record’s name, code or id.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => writing(ctx, () => saveRecordTool(agent, args)),
  );

  server.registerTool(
    'cards',
    {
      title: 'Cards',
      description: 'Lists the cards of a board, short: key, title, column, phase, priority, due, labels, assignee, values, how many subtasks are ticked and how many comments. The open cards of the current phase unless told otherwise. `column` picks a column by name or by kind (backlog, active, review, done, dropped); `phase` picks a phase by name, or "all"; open: false includes done and dropped cards. For one card give `card` (its key like SCR-12, its number or id): it comes in full, and with brief: true as one text with its description, linked note and phase: what you need to take it on. full: true gives every card in full. Without `board`, `due`, `assignee`, `label`, `by` or `since` looks across every board (of `space`, or of every space), each card with its board and space: "what is due today" is due: "today". assignee: "me" is the person, "self" what is given to you. `by` and `since` find who worked on what: by: "self" with since yesterday is what you did since. A short card says who worked on it, by name; a card in full gives `workedOn` with when, and `activity`: what mattered on it, made, moved, given and ticked, with who did each.',
      inputSchema: z.object({
        space,
        board: z.string().optional().describe('The board, by name or path. Left out with due, assignee, label, by or since: every board.'),
        card: z.string().optional().describe('One card, by key (SCR-12), number or id.'),
        column: z.string().optional(),
        phase: z.string().optional().describe('A phase by name, or "all".'),
        assignee: z.string().optional().describe('A person’s or an agent’s name; "me" for the person, "self" for you.'),
        label: z.string().optional(),
        due: z.enum(['overdue', 'today', 'upcoming']).optional(),
        by,
        since,
        open: z.boolean().optional().describe('Only cards not done or dropped; true when left out, but with by or since.'),
        brief: z.boolean().optional(),
        full: z.boolean().optional().describe('Each card with its description, subtasks and comments.'),
      }),
      annotations: { readOnlyHint: true },
    },
    (args, ctx) => answer(() => cardsTool(agent, args, client(ctx))),
  );

  const cardFields = {
    id: z.string().optional().describe('The card to change: its key like SCR-12, its number or id. Left out, a card is added.'),
    title: z.string().optional(),
    description: z.string().optional().describe('Markdown. For steps to tick off use subtasks.'),
    column: z.string().optional(),
    phase: z.string().optional().describe('A phase by name; "none" for the general backlog.'),
    priority: z.number().int().min(1).max(4).optional().describe('1 highest, 4 none.'),
    due: day,
    labels: z.array(z.string()).optional(),
    assignee: z.string().nullable().optional().describe('A person or an agent of the space by name (a first or a last name is enough when only one person has it; an agent by its name, or with whose it is: "Claude Code · Mert"); "me" for the person, "self" for you; null for nobody.'),
    values,
    note: z.string().nullable().optional().describe('The note it is about, by path or name; null unlinks it.'),
    subtasks,
    after: z.string().optional().describe('The card it goes right after in its column, by key (SCR-12); "top" for the first place. Left out, a card moved to another column goes at its end.'),
    another,
  };

  server.registerTool(
    'save_card',
    {
      title: 'Save a card',
      description: 'Adds one card to a board (in the current phase, first column), or changes one when `id` is given (its key like SCR-12, its number or id). `column` moves it, by the column’s name or kind: "review" leaves it for the person to look at, "done" finishes it, "dropped" drops it; `after` puts it right after another card of its column, or at the top. Many cards at once go in `items`, each with the fields of one: a meeting’s points in one call, tied to its note with `note`; all are written, or none when one is refused. Written with your name on the card’s timeline. Without `id`, an open card with the same title is not added again: the tool returns it with exists: true; give its id to change it, or another: true to add a second one on purpose.',
      inputSchema: z.object({
        space,
        board: z.string(),
        ...cardFields,
        items: z.array(z.object(cardFields)).min(1).max(MAX_ITEMS).optional().describe(`Up to ${MAX_ITEMS} cards to add or change on the board in one go, each with the fields of one card; give them here instead of at the top.`),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => writing(ctx, () => saveCardTool(agent, client(ctx), args)),
  );

  server.registerTool(
    'comment',
    {
      title: 'Comment on a card',
      description: 'Writes a comment on a card’s timeline with your name: say what you did and what is left. The same text sent again right after is not written twice.',
      inputSchema: z.object({ space, board: z.string(), card: z.string().describe('The card’s key, number or id.'), text: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => writing(ctx, () => commentTool(agent, client(ctx), args)),
  );

  server.registerTool(
    'tasks',
    {
      title: 'Tasks',
      description: 'Lists tasks: of one list (`list` by name or path), or of every list filtered by `due` (overdue, today, upcoming), `assignee` or `label`; with neither `list` nor `space`, those of every space, each task with its space. Open tasks unless `done` says otherwise: true for finished ones, "all" for both. assignee: "me" is the person, "self" what is given to you. `by` and `since` find who worked on what, in every list and space too: by: "self" with since yesterday is what you did since. Each task says who worked on it, by name; full: true gives `workedOn` with when, and `activity`: what mattered on it, made, given, done and opened again, with who did each. Use it before save_task to see what is there.',
      inputSchema: z.object({
        space,
        list: z.string().optional().describe('A task list by name or path; every list when left out.'),
        due: z.enum(['overdue', 'today', 'upcoming']).optional(),
        assignee: z.string().optional().describe('A person’s or an agent’s name; "me" for the person, "self" for you.'),
        label: z.string().optional().describe('Only the tasks with this label, in any case.'),
        by,
        since,
        done: z.union([z.boolean(), z.literal('all')]).optional().describe('false (the default) for open tasks, true for done ones, "all" for both; "all" with by or since.'),
        full: z.boolean().optional().describe('Each task with when each who worked on it did, and what mattered on it.'),
      }),
      annotations: { readOnlyHint: true },
    },
    (args, ctx) => answer(() => tasksTool(agent, args, client(ctx))),
  );

  const taskFields = {
    id: z.string().optional().describe('The task to change: its id or title. Left out, a task is added.'),
    title: z.string().optional(),
    description: z.string().optional(),
    due: day,
    priority: z.number().int().min(1).max(4).optional(),
    labels: z.array(z.string()).optional().describe('All its labels: they replace what it has; [] takes them off. A space’s tasks and cards share their labels: use the ones there before making new ones.'),
    assignee: z.string().nullable().optional().describe('A person or an agent of the space by name (a first or a last name is enough when only one person has it; an agent by its name, or with whose it is: "Claude Code · Mert"); "me" for the person, "self" for you; null for nobody.'),
    record: z.union([z.string(), z.object({ collection: z.string(), record: z.string() })]).nullable().optional(),
    note: z.string().nullable().optional().describe('The note it is about, by path or name; null unlinks it.'),
    section: z.string().nullable().optional().describe('The section it goes in, by name; null for none.'),
    parent: z.string().nullable().optional().describe('The task it goes under, by id; null for the top level.'),
    after: z.string().optional().describe('The task it goes right after, under the same parent or in the same section, by id or title; "top" for the first place. Left out, a moved task goes at the end.'),
    done: z.boolean().optional(),
    another,
  };

  server.registerTool(
    'save_task',
    {
      title: 'Save a task',
      description: 'Adds one task to a list (the personal space’s Inbox when `list` is left out), or changes one when `id` is given (its id or title). done: true closes it, and its open subtasks with it, as the app does (`followed` names them); false reopens it. `record` ties it to a record by the record’s name or code, `note` to a note. `section` and `parent` place it, a new one or one that is there, and `after` right after another task there, or at the top; `toList` moves one that is there to another list. Many tasks at once go in `items`, each with the fields of one; all are written, or none when one is refused. Without `id`, an open task with the same title in the same place is not added again: the tool returns it with exists: true; another: true adds a second one. Written with your name as its author.',
      inputSchema: z.object({
        space,
        list: z.string().optional(),
        ...taskFields,
        toList: z.string().optional().describe('For a task that is there: another list to move it to, with its subtasks, by name or path.'),
        items: z.array(z.object(taskFields)).min(1).max(MAX_ITEMS).optional().describe(`Up to ${MAX_ITEMS} tasks to add or change in the list in one go, each with the fields of one task; give them here instead of at the top.`),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => writing(ctx, () => saveTaskTool(agent, client(ctx), args)),
  );

  return server;
}
