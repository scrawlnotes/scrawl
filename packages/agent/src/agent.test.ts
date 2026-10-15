import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createBoard, createCollection, createFolder, createNote, listVersions, loadBoard, loadList, loadCollection, MemoryFs, readTrash, saveMe } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { cardsTool, commentTool, saveCardTool } from './cards';
import { Refusal } from './paths';
import { readTool, searchTool, spacesTool, treeTool } from './read';
import { recordsTool, saveRecordTool } from './records';
import { buildServer } from './server';
import { type Agent, type AgentSpace, pickElement } from './space';
import { saveTaskTool, tasksTool } from './tasks';
import { createTool, trashTool, writeTool } from './write';

// The tools over a space in memory: what an agent does with a board, a collection, a task list
// and the files, and what it is refused. See design/agent.md, 10.

const NOW = new Date(2026, 9, 15, 10, 30);
const CLIENT = { name: 'Claude Code' };

function spaceOf(fs: MemoryFs, personal = true, name = 'Personal'): AgentSpace {
  return { id: personal ? 'personal' : 'sp-k7f3m2qa', name, where: 'this computer', personal, fs };
}

function agentOf(...spaces: AgentSpace[]): Agent {
  return { spaces: async () => spaces, person: async () => ({ id: 'me', name: 'Kaan' }), now: () => NOW };
}

/** A space with a board, companies with activities, a note and a task list, as a small startup keeps them. */
async function sample() {
  const fs = new MemoryFs();
  await saveMe(fs, { id: 'me', name: 'Kaan' });
  await createFolder(fs, 'Plans');
  const board = await createBoard(fs, 'Plans', 'Scrawl', 'software');
  await createFolder(fs, 'CRM');
  const companies = await createCollection(fs, 'CRM', 'Companies', 'companies');
  const activities = await createCollection(fs, 'CRM', 'Activities', 'activities');
  const note = await createNote(fs, 'Plans', 'Roadmap');
  await fs.writeText(note, '# Roadmap\n\nShip the agent in October.\n');
  const agent = agentOf(spaceOf(fs));
  return { fs, agent, board, companies, activities, note };
}

const refusal = async (promise: Promise<unknown>): Promise<Refusal> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Refusal) return error;
    throw error;
  }
  throw new Error('Expected a refusal');
};

describe('looking around', () => {
  it('tells the spaces, today and the person', async () => {
    const { agent } = await sample();
    expect((await spacesTool(agent)).data).toEqual({ today: '2026-10-15', person: 'Kaan', spaces: [{ id: 'personal', name: 'Personal', where: 'this computer', personal: true }] });
  });

  it('lists the tree, and every board at once with a kind', async () => {
    const { agent, board } = await sample();
    const tree = (await treeTool(agent, {})).data as { nodes: { path: string; kind: string }[] };
    expect(tree.nodes.map((n) => `${n.kind}:${n.path}`)).toEqual(['folder:CRM', 'folder:Plans']);
    const boards = (await treeTool(agent, { kind: 'board' })).data as { items: { path: string; title: string }[] };
    expect(boards.items).toEqual([{ path: board, kind: 'board', title: 'Scrawl' }]);
  });

  it('finds an element by name in any case, refuses two of one name with the candidates, and offers the nearest', async () => {
    const { fs, board } = await sample();
    expect((await pickElement(fs, 'scrawl', ['board'], 'board')).path).toBe(board);
    expect((await pickElement(fs, 'Plans/Scrawl', ['board'], 'board')).path).toBe(board);
    await createBoard(fs, '', 'Scrawl', 'simple');
    const twice = await refusal(pickElement(fs, 'Scrawl', ['board'], 'board'));
    expect(twice.message).toContain('More than one board');
    expect((twice.details.candidates as { path: string }[]).map((c) => c.path).sort()).toEqual([board, 'Scrawl.board.json']);
    const none = await refusal(pickElement(fs, 'Scrawl v2', ['board'], 'board'));
    expect((none.details.nearest as { path: string }[]).length).toBe(2);
  });

  it('reads a file with its hash and refuses keys files and the app folder', async () => {
    const { agent, note, fs } = await sample();
    const read = await readTool(agent, { space: 'Personal', path: note });
    expect(read.text).toContain('Ship the agent');
    expect(read.data.hash).toHaveLength(64);
    await fs.writeText('Secrets.env', 'API_KEY=x\n');
    expect((await refusal(readTool(agent, { path: 'Secrets.env' }))).message).toContain('Keys files');
    expect((await refusal(readTool(agent, { path: '.scrawl/me.json' }))).message).toContain('Scrawl’s own folder');
    expect((await refusal(readTool(agent, { path: '../x.md' }))).message).toContain('outside');
  });

  it('searches names and text across what there is', async () => {
    const { agent } = await sample();
    const found = (await searchTool(agent, { query: 'ship' })).data.found;
    expect(found.map((f) => [f.kind, f.title])).toEqual([['note', 'Roadmap']]);
    expect(found[0]!.line).toContain('Ship the agent');
  });
});

describe('writing files', () => {
  it('writes a note, keeps its earlier text as a version, and refuses a write when the file changed', async () => {
    const { agent, note, fs } = await sample();
    const first = await writeTool(agent, { path: note, text: '# Roadmap\n\nShip the agent in November.\n' });
    expect(first.data.created).toBe(false);
    expect((await listVersions(fs, note)).length).toBe(1);
    const stale = await refusal(writeTool(agent, { path: note, text: 'x', ifMatch: 'not the hash' }));
    expect(stale.message).toContain('changed');
    expect(stale.details.hash).toBe(first.data.hash);
    const made = await writeTool(agent, { path: 'Plans/New.md', text: 'New\n' });
    expect(made.data.created).toBe(true);
    expect((await refusal(writeTool(agent, { path: '_attachments/x.png', text: '' }))).message).toContain('attachment');
  });

  it('keeps no version beside a note in a space whose store versions everything itself', async () => {
    const { fs, note } = await sample();
    const agent = agentOf({ ...spaceOf(fs), versioned: true });
    await writeTool(agent, { path: note, text: '# Roadmap\n\nShip the agent in November.\n' });
    expect(await listVersions(fs, note)).toEqual([]);
    expect(await fs.readText(note)).toContain('November');
  });

  it('creates elements where they are asked for, and trashes to the trash', async () => {
    const { agent, fs } = await sample();
    const crm = await createTool(agent, { folder: 'CRM', kind: 'board', name: 'Deals', template: 'crm' });
    expect(crm.data.path).toBe('CRM/Deals.board.json');
    expect((await loadBoard(fs, crm.data.path)).columns.map((c) => c.kind)).toEqual(['backlog', 'active', 'active', 'active', 'done', 'dropped']);
    const people = await createTool(agent, { folder: 'CRM', kind: 'collection', name: 'People', template: 'people' });
    expect(people.data.path).toBe('CRM/People');
    expect((await refusal(createTool(agent, { folder: 'Nowhere', kind: 'note', name: 'x' }))).details.folders).toEqual(['CRM', 'Plans']);
    expect((await refusal(createTool(agent, { kind: 'board', name: 'x', template: 'kanban' }))).details.templates).toContain('crm');
    await trashTool(agent, { path: 'Plans/Roadmap.md' });
    expect((await readTrash(fs)).map((t) => t.from)).toEqual(['Plans/Roadmap.md']);
  });
});

describe('boards', () => {
  it('adds a card as the actor, moves it by its column kind, comments, and gives a brief', async () => {
    const { agent, fs, board } = await sample();
    const added = await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Write the MCP tools', description: 'Fourteen tools', priority: 2, due: '2026-10-20', labels: ['agent'] });
    expect(added.data.created).toBe(true);
    expect(added.data.card).toMatchObject({ key: 'SCR-1', column: { name: 'Backlog', kind: 'backlog' }, priority: 2, due: '2026-10-20', labels: ['agent'] });
    const moved = await saveCardTool(agent, CLIENT, { board, id: 'SCR-1', column: 'review' });
    expect(moved.data.card.column).toMatchObject({ name: 'Review', kind: 'review' });
    const commented = await commentTool(agent, CLIENT, { board: 'Scrawl', card: '1', text: 'Done, tests pass.' });
    expect(commented.data.card.comments).toEqual([{ at: NOW.toISOString(), by: 'Claude Code · Kaan', text: 'Done, tests pass.' }]);
    const saved = await loadBoard(fs, board);
    expect(saved.cards[0]!.author).toEqual({ name: 'Claude Code · Kaan' });
    expect(saved.cards[0]!.timeline.map((e) => [e.kind, e.by])).toEqual([['move', 'Claude Code · Kaan'], ['comment', 'Claude Code · Kaan']]);
    const brief = await cardsTool(agent, { board: 'Scrawl', card: 'SCR-1', brief: true });
    expect(brief.text).toContain('# SCR-1 Write the MCP tools');
    expect(brief.text).toContain('Column: Review');
    expect(brief.text).toContain('Done, tests pass.');
  });

  it('lists open cards of a column by kind, and refuses a column, a card and a day it does not know', async () => {
    const { agent } = await sample();
    await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'One' });
    await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Two', column: 'Todo' });
    await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Three', column: 'done' });
    const active = await cardsTool(agent, { board: 'Scrawl', column: 'active' });
    expect(active.data.cards.map((c) => c.title)).toEqual(['Two']);
    expect((await cardsTool(agent, { board: 'Scrawl' })).data.cards.map((c) => c.title)).toEqual(['One', 'Two']);
    expect((await cardsTool(agent, { board: 'Scrawl', open: false })).data.total).toBe(3);
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'x', column: 'Testing' }))).details.columns).toHaveLength(5);
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', id: 'SCR-9', title: 'x' }))).message).toContain('No card');
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'x', due: 'tomorrow' }))).message).toContain('YYYY-MM-DD');
  });
});

describe('collections', () => {
  it('adds records with values by label, links by name, marks what does not fit, and queries with conditions', async () => {
    const { agent, fs } = await sample();
    const acme = await saveRecordTool(agent, { collection: 'Companies', values: { Name: 'Acme Corp', Segment: 'SMB', Status: 'active', Website: 'https://acme.example' } });
    expect(acme.data.created).toBe(true);
    expect(acme.data.record).toMatchObject({ name: 'Acme Corp', values: { name: 'Acme Corp', segment: 'SMB', status: 'active' } });
    const odd = await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Globex', status: 'dormant' } });
    expect(odd.data.record.problems).toEqual([{ field: 'status', kind: 'choice', text: expect.stringContaining('dormant') }]);
    const meeting = await saveRecordTool(agent, { collection: 'CRM/Activities', values: { name: 'Kickoff', type: 'meeting', date: '2026-10-14', company: 'acme corp' }, body: 'Agreed on the pilot.\n' });
    expect(meeting.data.record.values.company).toEqual({ id: acme.data.record.id, name: 'Acme Corp' });
    const active = await recordsTool(agent, { collection: 'Companies', where: [{ field: 'Status', op: 'is', value: 'active' }] });
    expect(active.data.records.map((r) => r.name)).toEqual(['Acme Corp']);
    expect(active.data.records[0]!.values.last_contact).toBe('2026-10-14');
    const sorted = await recordsTool(agent, { collection: 'Companies', sort: { field: 'name', dir: 'desc' } });
    expect(sorted.data.records.map((r) => r.name)).toEqual(['Globex', 'Acme Corp']);
    const changed = await saveRecordTool(agent, { collection: 'Companies', id: 'Globex', values: { status: 'churned' } });
    expect(changed.data.created).toBe(false);
    expect(changed.data.record.problems).toBeUndefined();
    expect((await loadCollection(fs, 'CRM/Companies')).records.find((r) => r.name === 'Globex')!.values.status).toBe('churned');
  });

  it('refuses an unknown field, an unknown op, and a link that fits more than one record', async () => {
    const { agent } = await sample();
    await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme' } });
    await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme' } });
    expect((await refusal(saveRecordTool(agent, { collection: 'Companies', values: { Revenue: 1 } }))).message).toContain('No field called Revenue');
    expect((await refusal(recordsTool(agent, { collection: 'Companies', where: [{ field: 'name', op: 'like', value: 'A' }] }))).details.ops).toContain('contains');
    const twice = await refusal(saveRecordTool(agent, { collection: 'Activities', values: { name: 'Call', type: 'call', date: '2026-10-15', company: 'Acme' } }));
    expect(twice.message).toContain('More than one record is called Acme');
    expect((twice.details.candidates as unknown[]).length).toBe(2);
  });
});

describe('tasks', () => {
  it('adds to the Inbox with a record by name, lists what is due, closes, and names the list in a shared space', async () => {
    const { agent, fs } = await sample();
    await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme Corp' } });
    const added = await saveTaskTool(agent, CLIENT, { title: 'Call Acme about the pilot', due: '2026-10-15', priority: 1, record: 'Acme Corp' });
    expect(added.data.list).toBe('Inbox.tasks.json');
    expect(added.data.task).toMatchObject({ title: 'Call Acme about the pilot', due: '2026-10-15', priority: 1, record: { collection: 'CRM/Companies', name: 'Acme Corp' } });
    expect((await loadList(fs, 'Inbox.tasks.json')).tasks[0]!.author).toEqual({ name: 'Claude Code · Kaan' });
    await saveTaskTool(agent, CLIENT, { title: 'Later', due: '2026-10-20' });
    expect((await tasksTool(agent, { due: 'today' })).data.tasks.map((t) => t.title)).toEqual(['Call Acme about the pilot']);
    const done = await saveTaskTool(agent, CLIENT, { id: added.data.task.id, done: true });
    expect(done.data.task.done).toBe(true);
    expect((await tasksTool(agent, {})).data.tasks.map((t) => t.title)).toEqual(['Later']);
    const shared = agentOf(spaceOf(fs, false, 'Acme'));
    expect((await refusal(saveTaskTool(shared, CLIENT, { title: 'x' }))).message).toContain('Which list');
  });
});

describe('over MCP', () => {
  it('serves the tools and the guide to a client, and writes with the client’s name', async () => {
    const { agent, fs, board } = await sample();
    const server = buildServer(agent);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientSide);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(['cards', 'comment', 'create', 'read', 'records', 'save_card', 'save_record', 'save_task', 'search', 'spaces', 'tasks', 'trash', 'tree', 'write']);
    const guide = await client.readResource({ uri: 'scrawl://guide' });
    expect((guide.contents[0] as { text: string }).text).toContain('# Scrawl for agents');
    const spaces = await client.callTool({ name: 'spaces', arguments: {} });
    expect(spaces.structuredContent).toMatchObject({ today: '2026-10-15', person: 'Kaan' });
    const card = await client.callTool({ name: 'save_card', arguments: { board: 'Scrawl', title: 'From a client' } });
    expect(card.isError).toBeFalsy();
    expect((await loadBoard(fs, board)).cards[0]!.author).toEqual({ name: 'test-client · Kaan' });
    const refused = await client.callTool({ name: 'read', arguments: { path: 'Secrets.env' } });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toMatchObject({ error: expect.stringContaining('Keys files') });
    await client.close();
  });
});
