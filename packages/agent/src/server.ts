import { McpServer, type ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { cardsTool, commentTool, saveCardTool } from './cards';
import { GUIDE } from './guide';
import { readTool, searchTool, spacesTool, treeTool } from './read';
import { recordsTool, saveRecordTool } from './records';
import { answer } from './results';
import { type Agent, type Client } from './space';
import { saveTaskTool, tasksTool } from './tasks';
import { createTool, trashTool, writeTool } from './write';

// The MCP server: the fourteen tools and the guide, over whatever spaces a door gives it. The
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

/** The MCP server over the spaces `agent` gives, with every tool and the guide. */
export function buildServer(agent: Agent): McpServer {
  const server = new McpServer({ name: 'scrawl', version: VERSION }, { capabilities: { tools: {}, resources: {} } });
  const client = (ctx: ServerContext) => clientOf(server, agent, ctx);

  server.registerResource('guide', 'scrawl://guide', { title: 'Scrawl guide', description: 'How a Scrawl space is laid out, what each file holds, and how an agent behaves in it. Read it once.', mimeType: 'text/markdown' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE }],
  }));

  server.registerTool(
    'spaces',
    {
      title: 'Spaces',
      description: 'The spaces you can reach, with where each one lives, today’s date and the person’s name. Start here.',
      annotations: { readOnlyHint: true },
    },
    () => answer(() => spacesTool(agent)),
  );

  server.registerTool(
    'tree',
    {
      title: 'Tree',
      description: 'What is in a space: folders, notes, task lists, boards, collections, with their paths and names. With `kind`, only elements of that kind, as a flat list: every board at once.',
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
      description: 'The text of a file: a note, a record, a task list, a board or a collection’s schema, as it is. Keys files, .scrawl/ and attachments are closed.',
      inputSchema: z.object({ space, path: z.string().describe('The file’s path in the space.') }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => readTool(agent, args)),
  );

  server.registerTool(
    'write',
    {
      title: 'Write a file',
      description: 'Writes a file as it is, making folders as needed. A note’s earlier text is kept as a version. With `ifMatch` (the hash `read` gave), nothing is written when the file changed since. Prefer save_task, save_card and save_record for tasks, cards and records: they keep ids and order.',
      inputSchema: z.object({ space, path: z.string(), text: z.string(), ifMatch: z.string().optional().describe('The hash the file had when read; the write is refused when it changed.') }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args) => answer(() => writeTool(agent, args)),
  );

  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Finds anything by name or by text across the spaces: notes, tasks, cards, records, boards, collections, folders. Each hit says what it is and where.',
      inputSchema: z.object({ query: z.string(), space, limit: z.number().int().positive().optional() }),
      annotations: { readOnlyHint: true },
    },
    (args) => answer(() => searchTool(agent, args)),
  );

  server.registerTool(
    'create',
    {
      title: 'Create',
      description: 'Makes a note, a task list, a board, a collection or a folder, named and placed. Board templates: software, simple, issues, crm. Collection templates: companies, people, activities, feedback, payments, blank.',
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
      description: 'Sends a note, a task list, a board, a folder or a collection to the trash, where the person can restore it. Nothing is deleted for good.',
      inputSchema: z.object({ space, path: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args) => answer(() => trashTool(agent, args)),
  );

  server.registerTool(
    'records',
    {
      title: 'Records',
      description: 'The records of a collection, with formulas and rollups worked out and what does not fit the schema marked. `where` filters by field (key or label) with ops: contains, is, is-not, empty, not-empty, gt, lt, before, after, on, true, false.',
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
      description: 'Adds a record to a collection, or changes one given by `id` (or by name or code). Values by field key or label; a link takes the record’s name or code. A value that does not fit is written and marked, not refused.',
      inputSchema: z.object({
        space,
        collection: z.string(),
        id: z.string().optional().describe('The record to change: its id, name or code. Left out, a new record is added.'),
        values,
        body: z.string().optional().describe('The notes under the fields, markdown.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) => answer(() => saveRecordTool(agent, args)),
  );

  server.registerTool(
    'cards',
    {
      title: 'Cards',
      description: 'The cards of a board: the current phase’s open cards unless told otherwise. `column` is a name or a kind (backlog, active, review, done, dropped). One card with `brief: true` comes as a brief: what you need to take it on.',
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
      description: 'Adds a card to a board (in the current phase, first column), or changes one given by `id` (its key, number or id). `column` moves it: a column’s name or kind, so "review" is the review column. Written with your name on the card’s timeline.',
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
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => answer(() => saveCardTool(agent, client(ctx), args)),
  );

  server.registerTool(
    'comment',
    {
      title: 'Comment on a card',
      description: 'Writes a comment on a card’s timeline, with your name: where you say what you did and what is left.',
      inputSchema: z.object({ space, board: z.string(), card: z.string().describe('The card’s key, number or id.'), text: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args, ctx) => answer(() => commentTool(agent, client(ctx), args)),
  );

  server.registerTool(
    'tasks',
    {
      title: 'Tasks',
      description: 'Tasks of a list, or of every list by what is due: overdue, today, upcoming. Open tasks unless `done` says otherwise.',
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
      description: 'Adds a task to a list (the personal space’s Inbox when no list is given), or changes one given by `id`. `done` closes or reopens it. `record` ties it to a record, by the record’s name or code.',
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
