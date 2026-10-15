import { McpServer, type ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { cardsTool, commentTool, saveCardTool } from './cards';
import { BRIEF, GUIDE } from './guide';
import { readTool, searchTool, spacesTool, treeTool } from './read';
import { recordsTool, saveRecordTool } from './records';
import { answer } from './results';
import { moveTool } from './move';
import { type Agent, type Client } from './space';
import { saveTaskTool, tasksTool } from './tasks';
import { createTool, trashTool, writeTool } from './write';

// The MCP server: the fifteen tools and the guide, over whatever spaces a door gives it. The
// same server runs over stdio on a computer and over HTTP on a Scrawl server. See design/agent.md.

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
  const known: { [key: string]: string } = { 'claude-code': 'Claude Code', 'claude-ai': 'Claude', 'claude': 'Claude', 'claude-desktop': 'Claude Desktop', 'chatgpt': 'ChatGPT', 'cursor': 'Cursor' };
  return known[name.toLowerCase()] ?? name;
}

const space = z.string().optional().describe('The space, by name or id. Needed only when there is more than one.');
const day = z.string().nullable().optional().describe('A day as YYYY-MM-DD; null for none.');
const values = z.record(z.string(), z.unknown()).optional().describe('Field values by field key or label. A link field takes a record’s name, code or id (or a list of them).');
const another = z.boolean().optional().describe('true to add it even though one with the same name is already there. Left out, the tool returns the one that exists instead of adding a second.');

/** The MCP server over the spaces `agent` gives, with every tool and the guide. */
export function buildServer(agent: Agent): McpServer {
  const server = new McpServer({ name: 'scrawl', version: VERSION }, { capabilities: { tools: {}, resources: {} }, instructions: BRIEF });
  const client = (ctx: ServerContext) => clientOf(server, agent, ctx);

  server.registerResource('guide', 'scrawl://guide', { title: 'Scrawl guide', description: 'How a Scrawl space is laid out, what each file holds, and how an agent behaves in it. The spaces tool returns it too.', mimeType: 'text/markdown' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE }],
  }));

  server.registerTool(
    'spaces',
    {
      title: 'Spaces',
      description: 'Start here, once. Lists the spaces you can reach (id, name, where it lives, whether it is the personal one), with today’s date and the person’s name, and then the guide: how to work in Scrawl and how each file is laid out (a collection’s schema, a board, a task list). Read the guide before anything else. When there is more than one space, pass its id as `space` to the other tools.',
      annotations: { readOnlyHint: true },
    },
    () => answer(() => spacesTool(agent)),
  );

  server.registerTool(
    'tree',
    {
      title: 'Tree',
      description: 'Lists what a space holds: folders, notes, task lists, boards and collections, each with its path and name. Give `kind` to get only one kind as a flat list (kind: "board" is every board at once). Use it to find the path of a thing before reading or changing it.',
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
      description: 'Returns one file as it is, with its hash: a note (markdown), a record (front matter and body), a task list or a board (JSON), or a collection’s schema (_collection.json). Use it to read a note, and before `write` when you change a schema or a board’s columns. Keys files, .scrawl/ and _attachments/ are closed.',
      inputSchema: z.object({ space, path: z.string().describe('The file’s path in the space.') }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => readTool(agent, args)),
  );

  server.registerTool(
    'write',
    {
      title: 'Write a file',
      description: 'Writes one file as it is, replacing what was there, making folders as needed. Use it for notes, and for what no other tool changes: a collection’s fields (its _collection.json) and a board’s columns and phases (its .board.json). Read the file first and pass its hash as `ifMatch`, so nothing is lost when it changed since. A schema, a board or a task list is written whole, as JSON: one that is not is refused. A note’s earlier text is kept. For tasks, cards and records use save_task, save_card and save_record instead: they keep ids and order.',
      inputSchema: z.object({ space, path: z.string(), text: z.string(), ifMatch: z.string().optional().describe('The hash the file had when read; the write is refused when it changed.') }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args) => answer(() => writeTool(agent, args)),
  );

  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Finds things by name or by words in their text, across every space: notes, tasks, cards, records, boards, collections, folders. Each hit says what it is and where it is (space and path). Use it when you do not know where something is.',
      inputSchema: z.object({ query: z.string(), space, limit: z.number().int().positive().optional() }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => searchTool(agent, args)),
  );

  server.registerTool(
    'create',
    {
      title: 'Create',
      description: 'Makes a new note, task list, board, collection or folder with a name, in `folder` (the top of the space when left out), and returns its path. Board templates: software, simple, issues, crm. Collection templates: companies, people, activities, feedback, payments, blank (no fields: then write its _collection.json). Look first with tree or search: do not make what is already there.',
      inputSchema: z.object({
        space,
        folder: z.string().optional().describe('The folder to make it in; the top of the space when left out.'),
        kind: z.enum(['note', 'tasks', 'board', 'collection', 'folder']),
        name: z.string(),
        template: z.string().optional().describe('For a board or a collection.'),
        text: z.string().optional().describe('For a note: its text.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) => answer(() => createTool(agent, args)),
  );

  server.registerTool(
    'trash',
    {
      title: 'Trash',
      description: 'Sends a note, a task list, a board, a folder or a collection to the trash, where the person can restore it; nothing is deleted for good. This is the only way to remove a file. A collection goes by its folder, not by its _collection.json. One task or one card is not trashed: close a task with save_task done: true, drop a card with save_card column: "dropped".',
      inputSchema: z.object({ space, path: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args) => answer(() => trashTool(agent, args)),
  );

  server.registerTool(
    'move',
    {
      title: 'Move or rename',
      description: 'Moves a note, a task list, a board or a collection into another folder (`folder`), gives it a new name (`name`), or both. Tasks, cards, link fields and rollups that point at it point at its new place. A name that is taken gets a number. Folders themselves are not moved: move what is in them. Records are not moved: they belong to their collection.',
      inputSchema: z.object({
        space,
        path: z.string().describe('What to move: its path, or its name when that is enough.'),
        folder: z.string().optional().describe('The folder to move it into; "" for the top of the space.'),
        name: z.string().optional().describe('Its new name, without extension.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    (args) => answer(() => moveTool(agent, args)),
  );

  server.registerTool(
    'records',
    {
      title: 'Records',
      description: 'Lists the records of a collection with their values, formulas and rollups worked out, and `problems` on values that do not fit the schema. `where` filters by field (key or label) with ops contains, is, is-not, empty, not-empty, gt, lt, before, after, on, true, false; `sort` orders; `limit` caps at 100 when left out. Use it before save_record to see what is there.',
      inputSchema: z.object({
        space,
        collection: z.string().describe('The collection, by name or path.'),
        where: z.array(z.object({ field: z.string(), op: z.string(), value: z.union([z.string(), z.number(), z.array(z.string())]).optional() })).optional(),
        sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']).optional() }).optional(),
        limit: z.number().int().positive().optional().describe('At most this many; 100 when left out.'),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => recordsTool(agent, args)),
  );

  server.registerTool(
    'save_record',
    {
      title: 'Save a record',
      description: 'Adds one record to a collection, or changes one when `id` is given (its id, name or code). Values are by field key or label; a link field takes the linked record’s name, code or id. A value that does not fit its field is written and marked in `problems`, not refused. Without `id`, a record with the same name or code is not added again: the tool returns it with exists: true; give its id to change it, or another: true to add a second one on purpose.',
      inputSchema: z.object({
        space,
        collection: z.string(),
        id: z.string().optional().describe('The record to change: its id, name or code. Left out, a new record is added.'),
        values,
        body: z.string().optional().describe('The notes under the fields, markdown.'),
        another,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) => answer(() => saveRecordTool(agent, args)),
  );

  server.registerTool(
    'cards',
    {
      title: 'Cards',
      description: 'Lists the cards of a board: the open cards of the current phase unless told otherwise. `column` picks a column by name or by kind (backlog, active, review, done, dropped); `phase` picks a phase by name, or "all"; open: false includes done and dropped cards. For one card give `card` (its key like SCR-12, its number or id); with brief: true it comes as one text with its description, linked note and phase: what you need to take it on.',
      inputSchema: z.object({
        space,
        board: z.string().describe('The board, by name or path.'),
        card: z.string().optional().describe('One card, by key (SCR-12), number or id.'),
        column: z.string().optional(),
        phase: z.string().optional().describe('A phase by name, or "all".'),
        assignee: z.string().optional(),
        label: z.string().optional(),
        open: z.boolean().optional().describe('Only cards not done or dropped; true when left out.'),
        brief: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => cardsTool(agent, args)),
  );

  server.registerTool(
    'save_card',
    {
      title: 'Save a card',
      description: 'Adds one card to a board (in the current phase, first column), or changes one when `id` is given (its key like SCR-12, its number or id). `column` moves it, by the column’s name or kind: "review" leaves it for the person to look at, "done" finishes it, "dropped" drops it. Written with your name on the card’s timeline. Without `id`, an open card with the same title is not added again: the tool returns it with exists: true; give its id to change it, or another: true to add a second one on purpose.',
      inputSchema: z.object({
        space,
        board: z.string(),
        id: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional().describe('Markdown; a checklist is `- [ ]` lines.'),
        column: z.string().optional(),
        phase: z.string().optional().describe('A phase by name; "none" for the general backlog.'),
        priority: z.number().int().min(1).max(4).optional().describe('1 highest, 4 none.'),
        due: day,
        labels: z.array(z.string()).optional(),
        assignee: z.string().nullable().optional().describe('A person’s name; null for nobody.'),
        values,
        another,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => answer(() => saveCardTool(agent, client(ctx), args)),
  );

  server.registerTool(
    'comment',
    {
      title: 'Comment on a card',
      description: 'Writes a comment on a card’s timeline with your name: say what you did and what is left. The same text sent again right after is not written twice.',
      inputSchema: z.object({ space, board: z.string(), card: z.string().describe('The card’s key, number or id.'), text: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => answer(() => commentTool(agent, client(ctx), args)),
  );

  server.registerTool(
    'tasks',
    {
      title: 'Tasks',
      description: 'Lists tasks: of one list (`list` by name or path), or of every list filtered by `due` (overdue, today, upcoming). Open tasks unless `done` says otherwise: true for finished ones, "all" for both. Use it before save_task to see what is there.',
      inputSchema: z.object({
        space,
        list: z.string().optional().describe('A task list by name or path; every list when left out.'),
        due: z.enum(['overdue', 'today', 'upcoming']).optional(),
        assignee: z.string().optional(),
        done: z.union([z.boolean(), z.literal('all')]).optional().describe('false (the default) for open tasks, true for done ones, "all" for both.'),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => tasksTool(agent, args)),
  );

  server.registerTool(
    'save_task',
    {
      title: 'Save a task',
      description: 'Adds one task to a list (the personal space’s Inbox when `list` is left out), or changes one when `id` is given. done: true closes it, false reopens it. `record` ties it to a record by the record’s name or code; `section` and `parent` place a new task. Written with your name as its author.',
      inputSchema: z.object({
        space,
        list: z.string().optional(),
        id: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        due: day,
        priority: z.number().int().min(1).max(4).optional(),
        assignee: z.string().nullable().optional(),
        record: z.union([z.string(), z.object({ collection: z.string(), record: z.string() })]).nullable().optional(),
        section: z.string().optional().describe('For a new task: the section it goes in, by name.'),
        parent: z.string().optional().describe('For a new subtask: its parent’s id.'),
        done: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => answer(() => saveTaskTool(agent, client(ctx), args)),
  );

  return server;
}
