import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createBoard, createCollection, createFolder, createNote, createTaskList, listVersions, loadBoard, loadList, loadCollection, loadSchema, MemoryFs, readTrash, restoreFromTrash, saveMe, savePeople, serializeBoard } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { cardsTool, commentTool, saveCardTool } from './cards';
import { BRIEF, GUIDE } from './guide';
import { Refusal } from './paths';
import { readTool, searchTool, spacesTool, treeTool } from './read';
import { recordsTool, saveRecordTool } from './records';
import { buildServer } from './server';
import { type Agent, type AgentSpace, exists, pickElement } from './space';
import { saveTaskTool, tasksTool } from './tasks';
import { moveTool } from './move';
import { trashTool } from './trash';
import { createTool, writeTool } from './write';

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
  it('tells the spaces, today and the person, and gives the model the whole guide after them', async () => {
    const { agent } = await sample();
    const spaces = await spacesTool(agent);
    const { guide, ...data } = spaces.data;
    expect(data).toEqual({ today: '2026-10-15', person: 'Kaan', spaces: [{ id: 'personal', name: 'Personal', where: 'this computer', personal: true, people: [] }] });
    // The guide comes after them as text, and in the structured content too.
    expect(spaces.text.startsWith(JSON.stringify(data))).toBe(true);
    expect(spaces.text).toContain(GUIDE);
    expect(guide).toBe(GUIDE);
  });

  it('briefs with the guide up to how a space is laid out, and points to the rest', () => {
    expect(GUIDE.startsWith(BRIEF.slice(0, BRIEF.indexOf('\n## The rest of the guide')))).toBe(true);
    expect(BRIEF).toContain('## What each tool is for');
    expect(BRIEF).toContain('## When a call is cut off');
    expect(BRIEF).not.toContain('## Collections');
    expect(BRIEF).toContain('`spaces` returns the whole guide');
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

  it('reads and writes a collection’s schema, and a blank collection gets its fields', async () => {
    const { agent, fs, companies } = await sample();
    const path = `${companies}/_collection.json`;
    const read = await readTool(agent, { path });
    expect(read.data.kind).toBe('schema');
    const schema = JSON.parse(read.text) as { fields: object[] };
    schema.fields.push({ key: 'region', label: 'Region', type: 'select', options: ['EMEA', 'Americas'] });
    await writeTool(agent, { path, text: JSON.stringify(schema), ifMatch: read.data.hash });
    expect((await loadSchema(fs, companies)).fields.map((f) => f.key)).toContain('region');
    const blank = await createTool(agent, { folder: 'CRM', kind: 'collection', name: 'Investors', template: 'blank' });
    const empty = await readTool(agent, { path: `${blank.data.path}/_collection.json` });
    const fields = [{ key: 'name', label: 'Name', type: 'name' }];
    await writeTool(agent, { path: `${blank.data.path}/_collection.json`, text: JSON.stringify({ ...JSON.parse(empty.text), fields }), ifMatch: empty.data.hash });
    expect((await loadSchema(fs, blank.data.path)).fields.map((f) => f.type)).toEqual(['name']);
    expect((await refusal(readTool(agent, { path: `${companies}/_attachments/logo.png` }))).message).toContain('attachment');
    expect((await refusal(readTool(agent, { path: '.scrawl/_collection.json' }))).message).toContain('Scrawl’s own folder');
    expect((await refusal(writeTool(agent, { path: '_attachments/_collection.json', text: '{ "fields": [] }' }))).message).toContain('attachment');
  });

  it('refuses a schema, a board or a task list that is not JSON or lacks its lists, and leaves the file as it was', async () => {
    const { agent, fs, companies, board } = await sample();
    const path = `${companies}/_collection.json`;
    const before = await fs.readText(path);
    expect((await refusal(writeTool(agent, { path, text: '{ "fields": [' }))).message).toContain('not JSON');
    expect((await refusal(writeTool(agent, { path, text: '[]' }))).message).toContain('JSON object');
    expect((await refusal(writeTool(agent, { path, text: '{ "version": 2 }' }))).details.missing).toEqual(['fields']);
    expect(await fs.readText(path)).toBe(before);
    expect((await refusal(writeTool(agent, { path: board, text: '{ "columns": [] }' }))).details.missing).toEqual(['cards']);
    expect((await refusal(writeTool(agent, { path: 'Plans/Launch.tasks.json', text: '' }))).message).toContain('not JSON');
    expect(await exists(fs, 'Plans/Launch.tasks.json')).toBeNull();
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
    const schema = await refusal(trashTool(agent, { path: 'CRM/People/_collection.json' }));
    expect(schema.message).toContain('trash its folder');
    expect(schema.details.folder).toBe('CRM/People');
    expect((await loadSchema(fs, 'CRM/People')).template).toBe('people');
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
    // A day that only looks like one is refused too, wherever a day is given.
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'x', due: '2026-02-30' }))).message).toContain('on the calendar');
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'x', subtasks: [{ title: 'y', due: '2026-13-01' }] }))).message).toContain('on the calendar');
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
    await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme' }, another: true });
    expect((await refusal(saveRecordTool(agent, { collection: 'Companies', values: { Revenue: 1 } }))).message).toContain('No field called Revenue');
    expect((await refusal(recordsTool(agent, { collection: 'Companies', where: [{ field: 'name', op: 'like', value: 'A' }] }))).details.ops).toContain('contains');
    const twice = await refusal(saveRecordTool(agent, { collection: 'Activities', values: { name: 'Call', type: 'call', date: '2026-10-15', company: 'Acme' } }));
    expect(twice.message).toContain('More than one record is called Acme');
    expect((twice.details.candidates as unknown[]).length).toBe(2);
  });
});

describe('subtasks', () => {
  it('adds a card with subtasks, ticks one off by its title, changes one by id, and does not add one twice', async () => {
    const { agent, fs, board } = await sample();
    const added = await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Landing page', subtasks: [{ title: 'Design' }, { title: 'Wire the form', due: '2026-10-20', priority: 2 }] });
    expect(added.data.card.subtasks).toEqual([
      { id: expect.any(String), title: 'Design', done: false, priority: 4, due: null },
      { id: expect.any(String), title: 'Wire the form', done: false, priority: 2, due: '2026-10-20' },
    ]);
    const formId = added.data.card.subtasks![1]!.id;
    const changed = await saveCardTool(agent, CLIENT, {
      board,
      id: 'SCR-1',
      subtasks: [{ id: 'design', done: true }, { id: formId, title: 'Wire the signup form' }, { title: 'Design' }, { title: 'Test it' }],
    });
    expect(changed.data.card.subtasks!.map((s) => [s.title, s.done])).toEqual([
      ['Design', true],
      ['Wire the signup form', false],
      ['Design', false],
      ['Test it', false],
    ]);
    // Sent again after a cut-off call: the open ones of those titles are changed, not added.
    const again = await saveCardTool(agent, CLIENT, { board, id: 'SCR-1', subtasks: [{ title: 'Design' }, { title: 'Test it', priority: 1 }] });
    expect(again.data.card.subtasks).toHaveLength(4);
    const removed = await saveCardTool(agent, CLIENT, { board, id: 'SCR-1', subtasks: [{ id: formId, remove: true }] });
    expect(removed.data.card.subtasks!.map((s) => s.title)).toEqual(['Design', 'Design', 'Test it']);
    expect((await loadBoard(fs, board)).cards[0]!.subtasks![0]!.completed).toBe(NOW.toISOString());
    expect((await refusal(saveCardTool(agent, CLIENT, { board, id: 'SCR-1', subtasks: [{ id: 'nothing' }] }))).message).toContain('No subtask');
    expect((await refusal(saveCardTool(agent, CLIENT, { board, id: 'SCR-1', subtasks: [{ id: 'design' }] }))).message).toContain('More than one subtask');
    expect((await cardsTool(agent, { board, card: 'SCR-1', brief: true })).text).toContain('## Subtasks\n\n- [x] Design\n- [ ] Design\n- [ ] Test it (p1)');
  });

  it('keeps a record’s subtasks in its front matter and changes them', async () => {
    const { agent, fs } = await sample();
    const acme = await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme Corp' }, subtasks: [{ title: 'Send the offer', due: '2026-10-16' }] });
    expect(acme.data.record.subtasks).toEqual([{ id: expect.any(String), title: 'Send the offer', done: false, priority: 4, due: '2026-10-16' }]);
    const done = await saveRecordTool(agent, { collection: 'Companies', id: 'Acme Corp', subtasks: [{ id: 'send the offer', done: true }] });
    expect(done.data.record.subtasks![0]).toMatchObject({ done: true, completed: NOW.toISOString() });
    const record = (await loadCollection(fs, 'CRM/Companies')).records[0]!;
    expect(record.subtasks).toHaveLength(1);
    expect(await fs.readText(record.path)).toContain('\nsubtasks:\n  - {"id":');
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
    // With more than one space, a task named by neither its space nor its list goes to the personal space's Inbox.
    const both = agentOf({ ...spaceOf(new MemoryFs(), false, 'Acme') }, spaceOf(fs));
    expect((await saveTaskTool(both, CLIENT, { title: 'Renew the domain' })).data).toMatchObject({ space: 'personal', list: 'Inbox.tasks.json' });
    expect((await refusal(saveTaskTool(both, CLIENT, { title: 'x', space: 'Acme' }))).message).toContain('Which list');
  });
});

describe('not twice', () => {
  it('returns the record, the card or the comment that is already there instead of adding it again, unless told another', async () => {
    const { agent, fs, board } = await sample();
    const acme = await saveRecordTool(agent, { collection: 'Companies', values: { Name: 'Acme Corp', Segment: 'SMB' } });
    const again = await saveRecordTool(agent, { collection: 'Companies', values: { Name: 'acme corp', Segment: 'Mid' } });
    expect(again.data).toMatchObject({ created: false, exists: true, message: expect.stringContaining(acme.data.record.id) });
    expect(again.data.record.values.segment).toBe('SMB');
    expect((await loadCollection(fs, 'CRM/Companies')).records.length).toBe(1);
    const second = await saveRecordTool(agent, { collection: 'Companies', values: { Name: 'Acme Corp' }, another: true });
    expect(second.data.created).toBe(true);
    const third = await refusal(saveRecordTool(agent, { collection: 'Companies', values: { Name: 'Acme Corp' } }));
    expect(third.message).toContain('More than one record is already called Acme Corp');

    const card = await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Write the tools' });
    const cardAgain = await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'write the tools', priority: 1 });
    expect(cardAgain.data).toMatchObject({ created: false, exists: true, card: { key: card.data.card.key, priority: 4 } });
    expect((await loadBoard(fs, board)).cards.length).toBe(1);
    await saveCardTool(agent, CLIENT, { board: 'Scrawl', id: card.data.card.key, column: 'done' });
    const afterDone = await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Write the tools' });
    expect(afterDone.data.created).toBe(true);
    expect((await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Write the tools', another: true })).data.created).toBe(true);

    const once = await commentTool(agent, CLIENT, { board: 'Scrawl', card: card.data.card.key, text: 'Done, left the tests.' });
    expect(once.data.written).toBe(true);
    const twice = await commentTool(agent, CLIENT, { board: 'Scrawl', card: card.data.card.key, text: 'Done, left the tests. ' });
    expect(twice.data.written).toBe(false);
    expect(twice.data.card.comments.length).toBe(1);
    const other = await commentTool(agent, { name: 'ChatGPT' }, { board: 'Scrawl', card: card.data.card.key, text: 'Done, left the tests.' });
    expect(other.data.written).toBe(true);
    expect(other.data.card.comments.length).toBe(2);
  });
});

describe('moving', () => {
  it('keeps the links of notes right: to what moved, and of what moved', async () => {
    const { agent, fs, note } = await sample();
    await writeTool(agent, { path: 'Plans/Links.md', text: 'See [Companies](../CRM/Companies) and [the roadmap](Roadmap.md).\n' });
    await writeTool(agent, { path: note, text: '# Roadmap\n\nFor [Companies](../CRM/Companies).\n' });
    const moved = await moveTool(agent, { path: 'Roadmap', folder: '' });
    expect(moved.data).toMatchObject({ to: 'Roadmap.md', links: 'The links of 2 notes point at it where it is now: Plans/Links.md, Roadmap.md' });
    expect(await fs.readText('Roadmap.md')).toContain('For [Companies](CRM/Companies).');
    await moveTool(agent, { path: 'Companies', name: 'Customers' });
    expect(await fs.readText('Plans/Links.md')).toBe('See [Companies](../CRM/Customers) and [the roadmap](../Roadmap.md).\n');
    expect(await fs.readText('Roadmap.md')).toContain('For [Companies](CRM/Customers).');
  });

  it('moves and renames a note, a board and a collection, and what points at them follows', async () => {
    const { agent, fs, note } = await sample();
    await writeTool(agent, { path: note, text: '# Roadmap\n\nShip in November.\n' });
    const acme = await saveRecordTool(agent, { collection: 'Companies', values: { Name: 'Acme Corp' } });
    await saveRecordTool(agent, { collection: 'Activities', values: { Name: 'Kickoff', type: 'meeting', date: '2026-10-14', company: 'Acme Corp' } });
    await saveTaskTool(agent, CLIENT, { title: 'Call Acme', record: 'Acme Corp' });
    const before = await loadSchema(fs, 'CRM/Companies');
    const pointing = before.fields.filter((f) => f.rollup?.from === 'CRM/Activities').map((f) => f.key);
    expect(pointing.length).toBeGreaterThan(0);

    const moved = await moveTool(agent, { path: 'Roadmap', folder: '' });
    expect(moved.data).toMatchObject({ kind: 'note', from: 'Plans/Roadmap.md', to: 'Roadmap.md', moved: true });
    expect((await listVersions(fs, 'Roadmap.md')).length).toBe(1);
    expect(await fs.readText('Roadmap.md')).toContain('November');

    const renamed = await moveTool(agent, { path: 'Scrawl', name: 'Scrawl v2' });
    expect(renamed.data.to).toBe('Plans/Scrawl v2.board.json');

    const customers = await moveTool(agent, { path: 'Companies', name: 'Customers' });
    expect(customers.data.to).toBe('CRM/Customers');
    expect((await loadSchema(fs, 'CRM/Activities')).fields.find((f) => f.key === 'company')!.collection).toBe('CRM/Customers');
    expect((await loadList(fs, 'Inbox.tasks.json')).tasks[0]!.record).toMatchObject({ collection: 'CRM/Customers', id: acme.data.record.id });

    const activities = await moveTool(agent, { path: 'Activities', folder: '' });
    expect(activities.data.to).toBe('Activities');
    const after = await loadSchema(fs, 'CRM/Customers');
    for (const key of pointing) expect(after.fields.find((f) => f.key === key)!.rollup!.from).toBe('Activities');
    expect((await recordsTool(agent, { collection: 'Customers' })).data.records[0]!.values.last_contact).toBe('2026-10-14');

    expect((await refusal(moveTool(agent, { path: 'Roadmap' }))).message).toContain('folder');
    expect((await refusal(moveTool(agent, { path: 'Roadmap', folder: 'Nowhere' }))).details.folders).toEqual(['CRM', 'Plans']);
    expect((await refusal(moveTool(agent, { path: 'Roadmap', folder: 'CRM/Customers' }))).message).toContain('collection');
    expect((await refusal(moveTool(agent, { path: 'Plans', name: 'Roadmaps' }))).message).toContain('Folders are not moved');
  });
});

// What came up when every tool was tried by hand on the server, 19 October (design/agent-fixes.md, 3).
describe('tried by hand', () => {
  it('does not add a task or make a note, a list or a folder again when the call is sent twice, unless told another', async () => {
    const { agent, fs } = await sample();
    await createTool(agent, { folder: 'Plans', kind: 'tasks', name: 'Launch' });
    const task = await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Write the post' });
    const again = await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'write the post ', priority: 1 });
    expect(again.data).toMatchObject({ created: false, exists: true, task: { id: task.data.task.id, priority: 4 } });
    // A subtask of that title is another task; so is one when the first is done.
    const sub = await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Write the post', parent: task.data.task.id });
    expect(sub.data.created).toBe(true);
    await saveTaskTool(agent, CLIENT, { list: 'Launch', id: task.data.task.id, done: true });
    expect((await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Write the post' })).data.created).toBe(true);
    expect((await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Write the post', another: true })).data.created).toBe(true);
    expect((await loadList(fs, 'Plans/Launch.tasks.json')).tasks.length).toBe(4);

    const note = await createTool(agent, { folder: 'Plans', kind: 'note', name: 'roadmap', text: 'Again' });
    expect(note.data).toMatchObject({ path: 'Plans/Roadmap.md', created: false, exists: true });
    expect(await fs.readText('Plans/Roadmap.md')).toContain('Ship the agent');
    expect((await createTool(agent, { folder: 'Plans', kind: 'note', name: 'Roadmap', another: true })).data).toMatchObject({ path: 'Plans/Roadmap 2.md', created: true });
    expect((await createTool(agent, { folder: 'Plans', kind: 'tasks', name: 'Launch' })).data.exists).toBe(true);
    expect((await createTool(agent, { kind: 'folder', name: 'plans' })).data).toMatchObject({ path: 'Plans', exists: true });
    expect((await refusal(createTool(agent, { kind: 'tasks', name: ' ' }))).message).toBe('A task list needs a name');
  });

  it('finds a person by a first or a last name, and refuses a name none of a space’s people has', async () => {
    const fs = new MemoryFs();
    await savePeople(fs, [
      { id: 'p1', name: 'Kaan Arslan', seen: '', active: true },
      { id: 'p2', name: 'Ayşe Yılmaz', seen: '', active: true },
      { id: 'p3', name: 'Ayşe Demir', seen: '', active: true },
    ]);
    await createTaskList(fs, '', 'Team');
    const agent = agentOf(spaceOf(fs, false, 'Team'));
    expect((await spacesTool(agent)).data.spaces[0]!.people).toEqual(['Kaan Arslan', 'Ayşe Yılmaz', 'Ayşe Demir']);
    const given = await saveTaskTool(agent, CLIENT, { list: 'Team', title: 'Plan the week', assignee: 'Kaan' });
    expect(given.data.task.assignee).toEqual({ id: 'p1', name: 'Kaan Arslan' });
    expect((await saveTaskTool(agent, CLIENT, { list: 'Team', id: given.data.task.id, assignee: 'yilmaz' })).data.task.assignee).toEqual({ id: 'p2', name: 'Ayşe Yılmaz' });
    expect((await refusal(saveTaskTool(agent, CLIENT, { list: 'Team', title: 'x', assignee: 'Ayşe' }))).details.candidates).toHaveLength(2);
    const nobody = await refusal(saveTaskTool(agent, CLIENT, { list: 'Team', title: 'x', assignee: 'Mehmet' }));
    expect(nobody.details.people).toEqual(['Kaan Arslan', 'Ayşe Yılmaz', 'Ayşe Demir']);
    // The personal space keeps a name as it is written.
    const { agent: mine } = await sample();
    expect((await saveTaskTool(mine, CLIENT, { title: 'Call', assignee: 'Mehmet' })).data.task.assignee).toEqual({ name: 'Mehmet' });
  });

  it('refuses a schema, a task list or a board the app could not read, saying each thing to mend', async () => {
    const { agent, fs, companies, board } = await sample();
    const path = `${companies}/_collection.json`;
    const before = await fs.readText(path);
    const fields = [
      { key: 'name', label: 'Name', type: 'name' },
      { key: 'name', label: 'Name again', type: 'text' },
      { key: 'other', label: 'Other name', type: 'name' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'Big Key', label: 'Big', type: 'text' },
      { key: 'double', label: 'Double', type: 'formula', formula: 'qty * ' },
      { key: 'total', label: 'Total', type: 'rollup', rollup: { from: 'CRM/Activities', fn: 'sum' } },
    ];
    const schema = await refusal(writeTool(agent, { path, text: JSON.stringify({ version: 2, fields }) }));
    expect(schema.details.problems).toEqual([
      'The key name is there twice; each field has its own',
      'amount has the type "money", which is none of name, code, text, number, date, time, select, multi-select, checkbox, url, email, phone, person, link, formula, lookup, rollup',
      'The key Big Key is not one: a key is lowercase letters, digits and _, like big_key',
      'total: a rollup with sum needs rollup.field, the field it works out',
      'There is more than one name field; a collection has one at most',
      expect.stringContaining('double: '),
    ]);
    expect(await fs.readText(path)).toBe(before);
    // What only points at something not made yet is written, and said.
    const ahead = await writeTool(agent, { path, text: JSON.stringify({ version: 2, fields: [{ key: 'name', label: 'Name', type: 'name' }, { key: 'owner', label: 'Owner', type: 'link', collection: 'CRM/People' }] }) });
    expect(ahead.data.notes).toEqual(['owner links to CRM/People, which is not a collection in this space yet']);
    // A lookup goes through a link field of the collection; a formula is checked in its language, with what it is done with.
    const looks = await refusal(
      writeTool(agent, {
        path,
        text: JSON.stringify({
          version: 2,
          fields: [
            { key: 'name', label: 'Name', type: 'name' },
            { key: 'segment', label: 'Segment', type: 'select', options: ['SMB'] },
            { key: 'via', label: 'Via', type: 'lookup', lookup: { link: 'segment', field: 'x' } },
            { key: 'none', label: 'None', type: 'lookup', lookup: {} },
            { key: 'odd', label: 'Odd', type: 'formula', formula: 'segment - 1' },
          ],
        }),
      }),
    );
    expect(looks.details.problems).toEqual([
      'via: lookup.link is segment, which is not a link field of this collection',
      'none is a lookup with no link: lookup.link is the key of a link field of this collection',
      "none: lookup.field is the key of the linked record's field it shows",
      'odd: segment is a choice, not a number; - takes numbers or days.',
    ]);

    const list = await refusal(writeTool(agent, { path: 'Plans/Launch.tasks.json', text: JSON.stringify({ sections: [{ id: 's1', name: 'Now' }], tasks: [{ id: 't1', title: 'One', parent: 'nope' }, { id: 't2', title: '' }, { id: 't3', title: 'Three', section: 's9', due: '2026-02-30' }] }) }));
    expect(list.details.problems).toEqual([
      'One is under nope, which is not a task in this list',
      'Task 2 needs an id and a title',
      'Three is in the section s9, which is not in "sections"',
      'Three is due "2026-02-30": a day on the calendar as YYYY-MM-DD, or null',
    ]);
    expect(await exists(fs, 'Plans/Launch.tasks.json')).toBeNull();

    const read = await readTool(agent, { path: board });
    const data = JSON.parse(read.text) as { columns: { id: string; name: string; kind: string }[]; phases?: unknown[]; cards: unknown[] };
    const broken = {
      ...data,
      columns: [...data.columns.filter((c) => c.kind !== 'done'), { id: 'x', name: 'Later', kind: 'someday' }],
      phases: [{ id: 'p1', name: 'One', state: 'current' }, { id: 'p2', name: 'Two', state: 'current' }],
      cards: [{ id: 'c1', title: 'Lost card', column: 'gone' }],
    };
    expect((await refusal(writeTool(agent, { path: board, text: JSON.stringify(broken), ifMatch: read.data.hash }))).details.problems).toEqual([
      'The column Later has the kind "someday", which is none of backlog, active, review, done, dropped',
      'A board keeps at least one done column',
      'More than one phase is current; one is, while any is open',
      'Lost card is in the column gone, which is not in "columns"; keep the column, or move the card first',
    ]);
    // Only what the app shows is written.
    expect((await refusal(writeTool(agent, { path: 'Plans/script.js', text: 'x' }))).message).toContain('none of them');
    expect(await exists(fs, 'Plans/script.js')).toBeNull();
  });

  it('writes a collection’s rules, refuses one with a mistake on its line, marks the records failing a check and gives a new record its defaults', async () => {
    const { agent, fs } = await sample();
    const dir = await createCollection(fs, 'CRM', 'Projects', 'blank');
    const schema = {
      version: 2,
      template: 'blank',
      fields: [
        { key: 'name', label: 'Name', type: 'name' },
        { key: 'code', label: 'Code', type: 'code', default: "=next('PRJ-', 4)" },
        { key: 'status', label: 'Status', type: 'select', options: ['Offer', 'Active'], default: 'Offer' },
        { key: 'start', label: 'Start', type: 'date', default: '=today()' },
        { key: 'delivery', label: 'Delivery', type: 'date' },
        { key: 'owner', label: 'Owner', type: 'person', default: '=me()' },
        { key: 'budget', label: 'Budget', type: 'number', format: { style: 'currency', currency: 'TRY', decimals: 0 } },
      ],
    };
    await writeTool(agent, { path: `${dir}/_collection.json`, text: JSON.stringify(schema) });
    // A default or a format the app could not read is refused, each said.
    const wrong = await refusal(
      writeTool(agent, {
        path: `${dir}/_collection.json`,
        text: JSON.stringify({
          ...schema,
          fields: [
            ...schema.fields.slice(0, 2),
            { key: 'status', label: 'Status', type: 'select', options: ['Offer'], default: 'Won' },
            { key: 'start', label: 'Start', type: 'date', default: '=next("S")' },
            { key: 'budget', label: 'Budget', type: 'number', format: { style: 'money', decimals: 7 } },
            { key: 'price', label: 'Price', type: 'text', format: { style: 'currency', currency: 'TRY' } },
          ],
        }),
      }),
    );
    expect(wrong.details.problems).toEqual([
      'budget: format.style is one of number, currency, percent, duration',
      'budget: format.decimals is 0 to 4',
      'price: format is for numbers, and for formulas, lookups and rollups giving one',
      'status: default: “Won” is not one of the choices of Status.',
      'start: default: This gives a text, which Start does not hold.',
    ]);

    const rules = `${dir}/_rules.js`;
    const bad = await refusal(writeTool(agent, { path: rules, text: 'check("delivery", () => delivery >= start, "Delivery is before the start")\ncheck("deliver", () => true, "x")\n' }));
    expect(bad.details.problems).toEqual(['Line 2: There is no field with the key deliver.']);
    expect(await exists(fs, rules)).toBeNull();
    expect((await refusal(writeTool(agent, { path: 'CRM/_rules.js', text: '' }))).details.problems).toEqual([expect.stringContaining('not a collection')]);
    const written = await writeTool(agent, { path: rules, text: 'check("delivery", () => delivery >= start, "Delivery is before the start")\n' });
    expect(written.data.kind).toBe('rules');
    expect((await readTool(agent, { path: rules })).data.kind).toBe('rules');

    const made = await saveRecordTool(agent, { collection: 'Projects', values: { name: 'Atakule Tower', delivery: '2026-10-01' } });
    expect(made.data.record.values).toMatchObject({ code: 'PRJ-0001', status: 'Offer', start: '2026-10-15', owner: 'Kaan' });
    expect(made.data.record.problems).toEqual([{ field: 'delivery', kind: 'check', text: 'Delivery is before the start' }]);
    // What is given stays, even empty; the next number follows the highest.
    const next = await saveRecordTool(agent, { collection: 'Projects', values: { name: 'Kadıköy Residence', status: 'Active', start: null } });
    expect(next.data.record.values).toEqual({ name: 'Kadıköy Residence', code: 'PRJ-0002', status: 'Active', owner: 'Kaan' });
    const listed = await recordsTool(agent, { collection: 'Projects' });
    expect(listed.data.fields.find((f) => f.key === 'budget')).toMatchObject({ format: { style: 'currency', currency: 'TRY', decimals: 0 } });
    expect(listed.data.fields.find((f) => f.key === 'code')).toMatchObject({ default: "=next('PRJ-', 4)" });
    expect(Object.fromEntries(listed.data.records.map((r) => [r.name, r.problems?.length ?? 0]))).toEqual({ 'Atakule Tower': 1, 'Kadıköy Residence': 0 });
  });

  it('presses a button of a collection’s rules on a record, writing what it does at once, and refuses one that stops', async () => {
    const { agent, fs } = await sample();
    const projects = await createCollection(fs, 'Ops', 'Projects', 'blank');
    const lines = await createCollection(fs, 'Ops', 'Budget lines', 'blank');
    const field = (key: string, type: string, more = {}) => ({ key, label: key[0]!.toUpperCase() + key.slice(1), type, ...more });
    await writeTool(agent, { path: `${projects}/_collection.json`, text: JSON.stringify({ version: 2, template: 'blank', singular: 'project', fields: [field('name', 'name'), field('status', 'select', { options: ['Offer', 'Active'] }), field('contract', 'number')] }) });
    await writeTool(agent, { path: `${lines}/_collection.json`, text: JSON.stringify({ version: 2, template: 'blank', singular: 'budget line', fields: [field('name', 'name'), field('project', 'link', { collection: projects }), field('planned', 'number')] }) });
    const rules = `${projects}/_rules.js`;
    // What a button names is looked for in the space: a collection that is not there is said on its line.
    const wrong = await refusal(writeTool(agent, { path: rules, text: 'action("Start", () => {\n  add("Lines", { name: "x" })\n})\n' }));
    expect(wrong.details.problems).toEqual(['Line 2: There is no collection called Lines in this space.']);
    await writeTool(agent, {
      path: rules,
      text: 'action("Start project", { when: () => status == "Offer", confirm: true }, () => {\n  for (const name of ["Material", "Labour"]) add("Budget lines", { name, planned: contract / 2 })\n  status = "Active"\n})\n',
    });
    await saveRecordTool(agent, { collection: 'Projects', values: { name: 'Antalya Hotel', status: 'Offer', contract: 1000 } });
    const pressed = await saveRecordTool(agent, { collection: 'Projects', id: 'Antalya Hotel', action: 'Start project' });
    expect(pressed.data.action).toEqual({ action: 'Start project', done: 'Start project: 2 budget lines, Status Active', changes: ['add 2 budget lines: Material, Labour', 'change Status from Offer to Active'] });
    expect(pressed.data.record.values.status).toBe('Active');
    const added = await loadCollection(fs, lines);
    expect(added.records.map((r) => [r.name, r.values.planned, (r.values.project as { name: string }).name]).sort()).toEqual([
      ['Labour', 500, 'Antalya Hotel'],
      ['Material', 500, 'Antalya Hotel'],
    ]);
    // Pressed again it does not run: its condition no longer holds, and nothing is written.
    const again = await refusal(saveRecordTool(agent, { collection: 'Projects', id: 'Antalya Hotel', action: 'Start project' }));
    expect(again.message).toMatch(/^Start project stopped/);
    expect(again.message).toContain('Nothing of it was written');
    expect((await loadCollection(fs, lines)).records).toHaveLength(2);
    expect((await refusal(saveRecordTool(agent, { collection: 'Projects', id: 'Antalya Hotel', action: 'Close' }))).message).toContain('no button called Close');
  });

  it('gives a button that asks its answers in input, a link by its record’s name', async () => {
    const { agent, fs } = await sample();
    const projects = await createCollection(fs, 'Ops', 'Projects', 'blank');
    const lines = await createCollection(fs, 'Ops', 'Budget lines', 'blank');
    await writeTool(agent, { path: `${projects}/_collection.json`, text: JSON.stringify({ version: 2, template: 'blank', fields: [{ key: 'name', label: 'Name', type: 'name' }, { key: 'contract', label: 'Contract', type: 'number' }] }) });
    await writeTool(agent, { path: `${lines}/_collection.json`, text: JSON.stringify({ version: 2, template: 'blank', fields: [{ key: 'name', label: 'Name', type: 'name' }, { key: 'project', label: 'Project', type: 'link', collection: projects }, { key: 'planned', label: 'Planned', type: 'number' }] }) });
    await writeTool(agent, {
      path: `${projects}/_rules.js`,
      text: [
        'action("Add a line", { ask: {',
        '  name: { label: "Name", type: "text", required: true },',
        '  share: { label: "Share", type: "number", default: () => 0.1 },',
        '  like: { label: "Like", type: "link", collection: "Budget lines" },',
        '} }, () => {',
        '  add("Budget lines", { name: input.name, planned: contract * input.share })',
        '  if (!empty(input.like)) update(input.like, { planned: 1 })',
        '})',
      ].join('\n'),
    });
    await saveRecordTool(agent, { collection: 'Projects', values: { name: 'Antalya Hotel', contract: 1000 } });
    await saveRecordTool(agent, { collection: 'Budget lines', values: { name: 'Material', project: 'Antalya Hotel', planned: 300 } });
    const pressed = await saveRecordTool(agent, { collection: 'Projects', id: 'Antalya Hotel', action: 'Add a line', input: { name: 'Labour', share: '0.5', like: 'Material' } });
    expect(pressed.data.action?.done).toBe('Add a line: 1 record, 1 record changed');
    const shown = (await loadCollection(fs, lines)).records.map((r) => [r.name, r.values.planned]).sort();
    expect(shown).toEqual([
      ['Labour', 500],
      ['Material', 1],
    ]);
    expect((await refusal(saveRecordTool(agent, { collection: 'Projects', id: 'Antalya Hotel', action: 'Add a line', input: { share: 1 } }))).message).toContain('Name is needed');
    expect((await refusal(saveRecordTool(agent, { collection: 'Projects', id: 'Antalya Hotel', action: 'Add a line', input: { name: 'X', colour: 'red' } }))).message).toBe('Add a line asks no colour; it asks name, share, like');
  });

  it('builds a small app as the guide says: linked collections, what is worked out, a board, rules, a button and what runs on save', async () => {
    const { agent, fs } = await sample();
    const folder = (await createTool(agent, { kind: 'folder', name: 'Operations' })).data.path;
    const made = async (name: string) => (await createTool(agent, { folder, kind: 'collection', name, template: 'blank' })).data.path;
    const [projects, lines, transactions] = [await made('Projects'), await made('Budget lines'), await made('Transactions')];
    const board = (await createTool(agent, { folder, kind: 'board', name: 'Projects board', template: 'simple' })).data.path;
    const money = { style: 'currency', currency: 'TRY', decimals: 0 };
    const out = [{ field: 'direction', op: 'is', value: ['Out'] }];
    const schemas: [string, object][] = [
      [
        transactions,
        {
          version: 2,
          template: 'blank',
          singular: 'transaction',
          fields: [
            { key: 'name', label: 'Name', type: 'name' },
            { key: 'project', label: 'Project', type: 'link', collection: projects },
            { key: 'line', label: 'Line', type: 'link', collection: lines },
            { key: 'direction', label: 'Direction', type: 'select', options: ['In', 'Out'], default: 'Out' },
            { key: 'amount', label: 'Amount', type: 'number', format: money },
            { key: 'due', label: 'Due', type: 'date' },
            { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Invoiced', 'Paid'], default: 'Planned' },
            { key: 'paid_on', label: 'Paid on', type: 'date' },
            { key: 'customer', label: 'Customer', type: 'lookup', lookup: { link: 'project', field: 'customer' } },
            { key: 'overdue', label: 'Overdue', type: 'formula', formula: 'status != "Paid" && due < today()' },
          ],
        },
      ],
      [
        lines,
        {
          version: 2,
          template: 'blank',
          singular: 'budget line',
          fields: [
            { key: 'name', label: 'Name', type: 'name' },
            { key: 'project', label: 'Project', type: 'link', collection: projects },
            { key: 'category', label: 'Category', type: 'select', options: ['Material', 'Labour', 'Transport'] },
            { key: 'planned', label: 'Planned', type: 'number', format: money },
            { key: 'actual', label: 'Actual', type: 'rollup', rollup: { from: transactions, fn: 'sum', field: 'amount', where: out }, format: money },
            { key: 'remaining', label: 'Remaining', type: 'formula', formula: 'planned - actual', format: money },
          ],
        },
      ],
      [
        projects,
        {
          version: 2,
          template: 'blank',
          singular: 'project',
          fields: [
            { key: 'name', label: 'Name', type: 'name' },
            { key: 'code', label: 'Code', type: 'code', default: "=next('PRJ-', 4)" },
            { key: 'customer', label: 'Customer', type: 'link', collection: 'CRM/Companies' },
            { key: 'status', label: 'Status', type: 'select', options: ['Offer', 'Active', 'Done'], default: 'Offer' },
            { key: 'start', label: 'Start', type: 'date', default: '=today()' },
            { key: 'delivery', label: 'Delivery', type: 'date' },
            { key: 'contract', label: 'Contract', type: 'number', format: money },
            { key: 'budget', label: 'Budget', type: 'rollup', rollup: { from: lines, fn: 'sum', field: 'planned' }, format: money },
            { key: 'spent', label: 'Spent', type: 'rollup', rollup: { from: transactions, fn: 'sum', field: 'amount', where: out }, format: money },
            { key: 'remaining', label: 'Remaining', type: 'formula', formula: 'budget - spent', format: money },
            { key: 'health', label: 'Health', type: 'formula', formula: 'spent > budget ? "Over budget" : "OK"' },
          ],
          layout: {
            columns: [
              { sections: [{ items: [{ block: 'actions' }, { field: 'name' }, { field: 'code' }, { field: 'customer' }, { field: 'status' }, { field: 'start' }, { field: 'delivery' }, { field: 'contract' }, { block: 'body' }, { block: 'subtasks' }] }] },
              {
                width: 2,
                sections: [
                  {
                    items: [
                      { block: 'linked', collection: lines, style: 'table', fields: ['category', 'planned', 'actual', 'remaining'], sums: true },
                      { block: 'linked', collection: transactions, style: 'table', fields: ['direction', 'amount', 'due', 'status'] },
                      { block: 'cards' },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    ];
    // Each collection's own fields and links first, then what is worked out from the others'.
    type Shape = { fields: { type: string }[]; layout?: unknown };
    for (const [dir, schema] of schemas) {
      const plain = { ...(schema as Shape), fields: (schema as Shape).fields.filter((f) => !['formula', 'lookup', 'rollup'].includes(f.type)), layout: undefined };
      await writeTool(agent, { path: `${dir}/_collection.json`, text: JSON.stringify(plain) });
    }
    for (const [dir, schema] of schemas) await writeTool(agent, { path: `${dir}/_collection.json`, text: JSON.stringify(schema) });
    const read = await readTool(agent, { path: board });
    const shaped = JSON.parse(read.data.text);
    shaped.columns = [
      { id: 'survey', name: 'Survey', kind: 'active' },
      { id: 'production', name: 'Production', kind: 'active' },
      { id: 'installation', name: 'Installation', kind: 'active' },
      { id: 'acceptance', name: 'Acceptance', kind: 'review' },
      { id: 'done', name: 'Done', kind: 'done' },
    ];
    shaped.fields = [{ key: 'project', label: 'Project', type: 'link', collection: projects }];
    await writeTool(agent, { path: board, text: JSON.stringify(shaped), ifMatch: read.data.hash });
    await writeTool(agent, {
      path: `${projects}/_rules.js`,
      text: [
        'check("delivery", () => delivery >= start, "Delivery is before the start")',
        '',
        'action("Start project", { when: () => status == "Offer", confirm: true }, () => {',
        '  for (const name of ["Material", "Labour", "Transport"]) add("Budget lines", { name, category: name, planned: contract * 0.3 })',
        '  subtask("Site survey", { due: start + 3 })',
        '  card("Projects board", { title: `${name} survey`, column: "Survey" })',
        '  status = "Active"',
        '})',
      ].join('\n'),
    });
    await writeTool(agent, {
      path: `${transactions}/_rules.js`,
      text: [
        'check("line", () => direction != "Out" || !empty(line), "Pick the budget line")',
        '',
        'onSave("Paid date", () => {',
        '  if (status == "Paid" && old.status != "Paid" && empty(paid_on)) paid_on = today()',
        '})',
      ].join('\n'),
    });

    await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Lara Turizm' } });
    const project = await saveRecordTool(agent, { collection: 'Projects', values: { name: 'Antalya Hotel', customer: 'Lara Turizm', contract: 1000000, delivery: '2027-04-30' } });
    expect(project.data.record.values).toMatchObject({ code: 'PRJ-0001', status: 'Offer', start: '2026-10-15' });
    const started = await saveRecordTool(agent, { collection: 'Projects', id: 'PRJ-0001', action: 'Start project' });
    expect(started.data.action?.done).toBe('Start project: 3 budget lines, 1 subtask, 1 card, Status Active');
    expect((await loadBoard(fs, board)).cards.map((c) => [c.title, c.column])).toEqual([['Antalya Hotel survey', 'survey']]);

    const paid = await saveRecordTool(agent, { collection: 'Transactions', values: { name: 'Cabin steel', project: 'Antalya Hotel', line: 'Material', amount: 120000, due: '2026-10-10', status: 'Invoiced' } });
    expect(paid.data.record.values).toMatchObject({ direction: 'Out', customer: { name: 'Lara Turizm' }, overdue: true });
    expect(paid.data.record.problems).toBeUndefined();
    const marked = await saveRecordTool(agent, { collection: 'Transactions', id: paid.data.record.id, values: { status: 'Paid' } });
    expect(marked.data.record.values).toMatchObject({ paid_on: '2026-10-15', overdue: false });
    const shown = (await recordsTool(agent, { collection: 'Projects' })).data.records[0]!;
    expect(shown.values).toMatchObject({ status: 'Active', budget: 900000, spent: 120000, remaining: 780000, health: 'OK' });
    const material = (await recordsTool(agent, { collection: 'Budget lines' })).data.records.find((r) => r.name === 'Material')!;
    expect(material.values).toMatchObject({ planned: 300000, actual: 120000, remaining: 180000 });
  });

  it('runs what a collection runs as a record is saved, saying what it did elsewhere and where it stopped', async () => {
    const { agent, fs } = await sample();
    const projects = await createCollection(fs, 'Ops', 'Projects', 'blank');
    const board = (await createTool(agent, { folder: 'Ops', kind: 'board', name: 'Projects board' })).data.path;
    const fields = [
      { key: 'name', label: 'Name', type: 'name' },
      { key: 'status', label: 'Status', type: 'select', options: ['Offer', 'Active'] },
      { key: 'started', label: 'Started', type: 'date' },
    ];
    await writeTool(agent, { path: `${projects}/_collection.json`, text: JSON.stringify({ version: 2, template: 'blank', singular: 'project', fields }) });
    await writeTool(agent, {
      path: `${projects}/_rules.js`,
      text: [
        'onSave("Kickoff card", () => {',
        '  if (status == "Active" && old.status != "Active") card("Projects board", { title: `${name} kickoff` })',
        '})',
        'onSave("Started", () => {',
        '  if (status == "Active" && empty(started)) started = today()',
        '})',
        'onSave("Broken", () => {',
        '  if (status == "Active") update(find("Projects", { name: "Nobody" }).find((p) => true), { status: "Offer" })',
        '})',
      ].join('\n'),
    });
    const made = await saveRecordTool(agent, { collection: 'Projects', values: { name: 'Antalya Hotel', status: 'Active' } });
    expect(made.data.record.values.started).toBe('2026-10-15');
    expect(made.data.onSave?.did).toBe('Kickoff card: 1 card added to Projects board');
    expect(made.data.onSave?.stopped).toEqual([expect.stringMatching(/^Broken stopped on line 8 of the rules: .*saved as given/)]);
    expect((await loadBoard(fs, board)).cards.map((c) => c.title)).toEqual(['Antalya Hotel kickoff']);
    // Saved again while Active: old says it was, so no second card.
    const again = await saveRecordTool(agent, { collection: 'Projects', id: 'Antalya Hotel', values: { status: 'Active' } });
    expect(again.data.onSave?.did).toBeUndefined();
    expect((await loadBoard(fs, board)).cards).toHaveLength(1);
  });

  it('moves a task to a section, under another task, to the top, or to another list, and refuses where it cannot go', async () => {
    const { agent, fs } = await sample();
    const launch = await createTool(agent, { folder: 'Plans', kind: 'tasks', name: 'Launch' });
    await fs.writeText(launch.data.path, JSON.stringify({ version: 1, sections: [{ id: 's1', name: 'This week' }], tasks: [] }));
    const post = await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Write the post' });
    const id = post.data.task.id;
    expect((await saveTaskTool(agent, CLIENT, { list: 'Launch', id, section: 'this week' })).data.task.section).toBe('This week');
    const other = await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Ship', section: 'This week' });
    const under = await saveTaskTool(agent, CLIENT, { list: 'Launch', id, parent: other.data.task.id });
    expect(under.data.task).toMatchObject({ parent: other.data.task.id });
    expect(under.data.task.section).toBeUndefined();
    expect((await saveTaskTool(agent, CLIENT, { list: 'Launch', id, parent: null })).data.task.parent).toBeUndefined();
    expect((await refusal(saveTaskTool(agent, CLIENT, { list: 'Launch', id: other.data.task.id, parent: other.data.task.id }))).message).toContain('cannot go there');
    expect((await refusal(saveTaskTool(agent, CLIENT, { list: 'Launch', id, title: '  ' }))).message).toContain('cannot be empty');
    // To another list, with its subtasks.
    await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Draft', parent: id });
    await createTool(agent, { folder: 'Plans', kind: 'tasks', name: 'Later' });
    const moved = await saveTaskTool(agent, CLIENT, { list: 'Launch', id, toList: 'Later' });
    expect(moved.data).toMatchObject({ list: 'Plans/Later.tasks.json', from: 'Plans/Launch.tasks.json' });
    expect((await loadList(fs, 'Plans/Later.tasks.json')).tasks.map((t) => t.title)).toEqual(['Write the post', 'Draft']);
    expect((await loadList(fs, 'Plans/Launch.tasks.json')).tasks.map((t) => t.title)).toEqual(['Ship']);
    // Five levels deep is as deep as it goes.
    let parent = other.data.task.id;
    for (let level = 1; level <= 4; level++) parent = (await saveTaskTool(agent, CLIENT, { list: 'Launch', title: `Level ${level}`, parent })).data.task.id;
    expect((await refusal(saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Too deep', parent }))).message).toContain('at most 4 levels');
  });

  it('ties a task and a card to a note, by its name, and unties them', async () => {
    const { agent, fs, board, note } = await sample();
    const task = await saveTaskTool(agent, CLIENT, { title: 'Read the roadmap', note: 'Roadmap' });
    expect(task.data.task.note).toBe(note);
    expect((await saveTaskTool(agent, CLIENT, { id: task.data.task.id, note: null })).data.task.note).toBeUndefined();
    const card = await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Plan October', note: 'Plans/Roadmap.md' });
    expect(card.data.card.note).toBe(note);
    expect((await cardsTool(agent, { board: 'Scrawl', card: card.data.card.key, brief: true })).data.brief).toContain('Ship the agent in October.');
    await saveCardTool(agent, CLIENT, { board: 'Scrawl', id: card.data.card.key, note: null });
    expect((await loadBoard(fs, board)).cards[0]!.note).toBeUndefined();
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', id: card.data.card.key, note: 'Nowhere' }))).message).toContain('No note is called Nowhere');
  });

  it('gives a code to one record only, and says what a card field holds when a value does not fit', async () => {
    const { agent } = await sample();
    const path = 'CRM/Companies/_collection.json';
    const read = await readTool(agent, { path });
    const schema = JSON.parse(read.text) as { fields: object[] };
    schema.fields.push({ key: 'code', label: 'Code', type: 'code' });
    await writeTool(agent, { path, text: JSON.stringify(schema), ifMatch: read.data.hash });
    await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme Corp', code: 'ACME' } });
    const beta = await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Beta', code: 'BETA' } });
    expect((await refusal(saveRecordTool(agent, { collection: 'Companies', id: beta.data.record.id, values: { code: 'acme' } }))).message).toContain('Acme Corp already has the code ACME');
    expect((await refusal(saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme Two', code: 'ACME' }, another: true }))).message).toContain('a code belongs to one record');
    await createTool(agent, { folder: 'CRM', kind: 'board', name: 'Deals', template: 'crm' });
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Deals', title: 'Acme', values: { value: 'four thousand' } }))).message).toBe('Value is a number, like 4900; "four thousand" does not fit');
  });

  it('takes a name as it was typed, with what a file name cannot hold, and says what is near when nothing is there', async () => {
    const { agent, fs } = await sample();
    const asked = await createTool(agent, { folder: 'Plans', kind: 'note', name: 'Ne yapmalı?', text: 'Sorular' });
    expect(asked.data.path).toBe('Plans/Ne yapmalı？.md');
    expect((await readTool(agent, { path: 'Plans/Ne yapmalı?.md' })).data).toMatchObject({ path: 'Plans/Ne yapmalı？.md', text: 'Sorular' });
    expect((await writeTool(agent, { path: 'Plans/Neden: kısa.md', text: 'x' })).data.path).toBe('Plans/Neden꞉ kısa.md');
    expect(await fs.readText('Plans/Neden꞉ kısa.md')).toBe('x');
    expect((await moveTool(agent, { path: 'Plans/Ne yapmalı?.md', name: 'Sorular' })).data.to).toBe('Plans/Sorular.md');
    expect((await refusal(readTool(agent, { path: 'Plans/Roadmp.md' }))).details.nearest).toBeUndefined();
    expect((await refusal(readTool(agent, { path: 'Plans/Road map.md' }))).details.nearest).toContain('Plans/Roadmap.md');
  });
});

// Less to go through to get a thing done (design/agent-fixes.md, 6).
describe('less to go through', () => {
  /** The personal space of `sample`, and a team's with a board called Roadmap; each has a list called Yapılacaklar. */
  async function two() {
    const { fs: mine, board } = await sample();
    const team = new MemoryFs();
    await createBoard(team, '', 'Roadmap', 'software');
    await createTaskList(team, '', 'Yapılacaklar');
    await createTaskList(mine, 'Plans', 'Yapılacaklar');
    return { mine, team, board, agent: agentOf(spaceOf(mine), spaceOf(team, false, 'Team')) };
  }

  it('finds a board, a list or a file by its name in whichever space has it, and asks which when two have it', async () => {
    const { agent, team } = await two();
    const added = await saveCardTool(agent, CLIENT, { board: 'Roadmap', title: 'Ship' });
    expect(added.data).toMatchObject({ space: 'sp-k7f3m2qa', spaceName: 'Team', board: 'Roadmap.board.json', created: true });
    expect((await loadBoard(team, 'Roadmap.board.json')).cards).toHaveLength(1);
    expect((await cardsTool(agent, { board: 'Scrawl' })).data).toMatchObject({ space: 'personal', board: 'Plans/Scrawl.board.json' });
    const both = await refusal(tasksTool(agent, { list: 'Yapılacaklar' }));
    expect((both.details.candidates as { spaceName: string }[]).map((c) => c.spaceName).sort()).toEqual(['Personal', 'Team']);
    expect((await readTool(agent, { path: 'Plans/Roadmap.md' })).data.space).toBe('personal');
    // What makes something new names its space.
    expect((await refusal(createTool(agent, { kind: 'note', name: 'x' }))).message).toContain('Which space?');
    expect((await refusal(writeTool(agent, { path: 'New.md', text: 'x' }))).message).toContain('Which space?');
    expect((await refusal(cardsTool(agent, { board: 'Nowhere' }))).message).toContain('in any space');
    const boards = (await treeTool(agent, { kind: 'board' })).data as { items: { path: string; spaceName: string }[] };
    expect(boards.items.map((b) => `${b.spaceName}:${b.path}`)).toEqual(['Personal:Plans/Scrawl.board.json', 'Team:Roadmap.board.json']);
  });

  it('lists cards short, with the open phases only, and one card or full: true in full', async () => {
    const { agent, fs, board } = await sample();
    await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'One', description: 'Long words', subtasks: [{ title: 'a' }, { title: 'b', done: true }] });
    const two = (await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Two' })).data.card;
    await commentTool(agent, CLIENT, { board: 'Scrawl', card: two.key, text: 'Started' });
    const listed = (await cardsTool(agent, { board: 'Scrawl' })).data;
    expect(listed.cards).toEqual([
      { key: 'SCR-1', title: 'One', column: 'Backlog', priority: 4, due: null, assignee: null, subtasks: '1/2' },
      { key: 'SCR-2', title: 'Two', column: 'Backlog', priority: 4, due: null, assignee: null, comments: 1 },
    ]);
    expect(listed.columns[0]).toEqual({ name: 'Backlog', kind: 'backlog' });
    expect((await cardsTool(agent, { board: 'Scrawl', full: true })).data.cards[0]).toMatchObject({ description: 'Long words' });
    expect((await cardsTool(agent, { board: 'Scrawl', card: 'SCR-2' })).data.cards[0]).toMatchObject({ comments: [{ text: 'Started' }] });
    const phased = { ...(await loadBoard(fs, board)), phases: [{ id: 'p1', name: 'Old', state: 'done' as const }, { id: 'p2', name: 'Now', state: 'current' as const }, { id: 'p3', name: 'Next', state: 'upcoming' as const }] };
    await fs.writeText(board, serializeBoard(phased));
    expect((await cardsTool(agent, { board: 'Scrawl' })).data).toMatchObject({ currentPhase: { name: 'Now' }, phases: [{ name: 'Now', state: 'current' }, { name: 'Next', state: 'upcoming' }], donePhases: 1 });
  });

  it('adds or changes many cards or tasks in one call, all of them or none, each once', async () => {
    const { agent, fs, board } = await sample();
    const many = await saveCardTool(agent, CLIENT, { board: 'Scrawl', items: [{ title: 'Write the post', due: '2026-10-20' }, { title: 'Call Acme', assignee: 'Kaan' }, { title: 'write the post' }] });
    expect(many.data).toMatchObject({ created: 2, changed: 0, exists: 1 });
    expect(many.data.cards.map((c) => [c.status, c.key])).toEqual([['created', 'SCR-1'], ['created', 'SCR-2'], ['exists', 'SCR-1']]);
    // Sent again after a cut-off call: nothing more.
    expect((await saveCardTool(agent, CLIENT, { board: 'Scrawl', items: [{ title: 'Write the post' }, { title: 'Call Acme' }] })).data).toMatchObject({ created: 0, exists: 2 });
    const before = await fs.readText(board);
    const refused = await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', items: [{ title: 'Fine' }, { title: 'Bad day', due: '2026-02-30' }] }));
    expect(refused.message).toContain('Item 2');
    expect(refused.details.item).toBe(2);
    expect(await fs.readText(board)).toBe(before);
    expect((await refusal(saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'x', items: [{ title: 'y' }] }))).message).toContain('inside each of items');
    await createTool(agent, { folder: 'Plans', kind: 'tasks', name: 'Launch' });
    const first = await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Draft' });
    const tasks = await saveTaskTool(agent, CLIENT, { list: 'Launch', items: [{ id: first.data.task.id, priority: 1 }, { title: 'Review' }, { title: 'Publish', due: '2026-10-21' }] });
    expect(tasks.data).toMatchObject({ created: 2, changed: 1, exists: 0 });
    expect((await loadList(fs, 'Plans/Launch.tasks.json')).tasks.map((t) => [t.title, t.priority])).toEqual([['Draft', 1], ['Review', 4], ['Publish', 4]]);
  });

  it('looks across every board and list by a day or a person, in every space', async () => {
    const { agent } = await two();
    await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Today here', due: '2026-10-15' });
    await saveCardTool(agent, CLIENT, { board: 'Roadmap', title: 'Today there', due: '2026-10-15', assignee: 'Kaan' });
    await saveCardTool(agent, CLIENT, { board: 'Roadmap', title: 'Later', due: '2026-10-30' });
    await saveTaskTool(agent, CLIENT, { space: 'Team', list: 'Yapılacaklar', title: 'Team task today', due: '2026-10-15' });
    await saveTaskTool(agent, CLIENT, { title: 'Inbox today', due: '2026-10-15' });
    expect((await cardsTool(agent, { due: 'today' })).data.cards.map((c) => [c.title, c.spaceName])).toEqual([
      ['Today here', 'Personal'],
      ['Today there', 'Team'],
    ]);
    expect((await cardsTool(agent, { assignee: 'me' })).data.cards.map((c) => c.title)).toEqual(['Today there']);
    expect((await refusal(cardsTool(agent, {}))).message).toContain('due, assignee or label');
    expect((await tasksTool(agent, { due: 'today' })).data.tasks.map((t) => [t.title, t.spaceName])).toEqual([
      ['Inbox today', 'Personal'],
      ['Team task today', 'Team'],
    ]);
    expect((await refusal(tasksTool(agent, {}))).message).toContain('give due or assignee');
  });

  it('finds a space by its name, says which space each hit is in, and offers only names that are near', async () => {
    const { agent, mine } = await two();
    expect((await searchTool(agent, { query: 'Team' })).data.found[0]).toMatchObject({ kind: 'space', title: 'Team', space: 'sp-k7f3m2qa', spaceName: 'Team' });
    expect((await searchTool(agent, { query: 'ship the agent' })).data.found[0]).toMatchObject({ kind: 'note', spaceName: 'Personal' });
    expect((await refusal(pickElement(mine, 'Zebra', ['board'], 'board'))).details.nearest).toBeUndefined();
  });
});

// One thing at a time to the trash, from which the person restores it (design/agent-fixes.md, 2).
describe('the trash, one thing at a time', () => {
  it('trashes a task with its subtasks, a section, a card or a record, takes a name for a path, and what it trashed comes back', async () => {
    const { agent, fs, board } = await sample();
    await createTool(agent, { folder: 'Plans', kind: 'tasks', name: 'Launch' });
    await fs.writeText('Plans/Launch.tasks.json', JSON.stringify({ version: 1, sections: [{ id: 's1', name: 'This week' }], tasks: [] }));
    const post = await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Write the post', section: 'This week' });
    await saveTaskTool(agent, CLIENT, { list: 'Launch', title: 'Draft', parent: post.data.task.id });
    const gone = await trashTool(agent, { path: 'Launch', id: 'write the post' });
    expect(gone.data).toMatchObject({ kind: 'task', title: 'Write the post', from: 'Plans/Launch.tasks.json', message: expect.stringContaining('restore') });
    expect((await loadList(fs, 'Plans/Launch.tasks.json')).tasks).toEqual([]);
    const [task] = await readTrash(fs);
    expect(task).toMatchObject({ kind: 'task', title: 'Write the post', count: 1 });
    await restoreFromTrash(fs, task!);
    expect((await loadList(fs, 'Plans/Launch.tasks.json')).tasks.map((t) => [t.title, t.section ?? null])).toEqual([['Write the post', 's1'], ['Draft', null]]);
    expect((await trashTool(agent, { path: 'Launch', section: 'this week' })).data).toMatchObject({ kind: 'section', title: 'This week' });
    expect((await loadList(fs, 'Plans/Launch.tasks.json')).tasks).toEqual([]);

    const card = await saveCardTool(agent, CLIENT, { board: 'Scrawl', title: 'Old idea' });
    expect((await trashTool(agent, { path: 'Scrawl', id: card.data.card.key })).data).toMatchObject({ kind: 'card', key: 'SCR-1', title: 'Old idea' });
    expect((await loadBoard(fs, board)).cards).toEqual([]);
    await saveRecordTool(agent, { collection: 'Companies', values: { name: 'Acme Corp' } });
    expect((await trashTool(agent, { path: 'Companies', id: 'acme corp' })).data).toMatchObject({ kind: 'record', title: 'Acme Corp' });
    expect((await loadCollection(fs, 'CRM/Companies')).records).toEqual([]);
    expect((await trashTool(agent, { path: 'Roadmap' })).data).toMatchObject({ trashed: 'Plans/Roadmap.md', kind: 'note' });
    expect((await readTrash(fs)).map((t) => t.kind).sort()).toEqual(['card', 'note', 'note', 'section']);
    expect((await refusal(trashTool(agent, { path: 'Launch', id: 'Nothing' }))).message).toContain('No task Nothing');
    expect((await refusal(trashTool(agent, { path: 'Scrawl', section: 'x' }))).message).toContain('task list’s');
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
    expect(tools.tools.map((t) => t.name).sort()).toEqual(['cards', 'comment', 'create', 'move', 'read', 'records', 'save_card', 'save_record', 'save_task', 'search', 'spaces', 'tasks', 'trash', 'tree', 'write']);
    const guide = await client.readResource({ uri: 'scrawl://guide' });
    expect((guide.contents[0] as { text: string }).text).toContain('# Scrawl for agents');
    expect(client.getInstructions()).toBe(BRIEF);
    const spaces = await client.callTool({ name: 'spaces', arguments: {} });
    // A client that shows only the structured content gets the guide and a file's text there too.
    expect(spaces.structuredContent).toMatchObject({ today: '2026-10-15', person: 'Kaan', guide: expect.stringContaining('## Collections') });
    expect((spaces.content as { text: string }[])[0]!.text).toContain('## Collections');
    const card = await client.callTool({ name: 'save_card', arguments: { board: 'Scrawl', title: 'From a client' } });
    expect(card.isError).toBeFalsy();
    expect((await loadBoard(fs, board)).cards[0]!.author).toEqual({ name: 'test-client · Kaan' });
    const refused = await client.callTool({ name: 'read', arguments: { path: 'Secrets.env' } });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toMatchObject({ error: expect.stringContaining('Keys files') });
    const schema = await client.callTool({ name: 'read', arguments: { path: 'CRM/Companies/_collection.json' } });
    expect(schema.isError).toBeFalsy();
    expect(schema.structuredContent).toMatchObject({ kind: 'schema', text: expect.stringContaining('"fields"') });
    // Many cards in one call, as a meeting's points.
    const many = await client.callTool({ name: 'save_card', arguments: { board: 'Scrawl', items: [{ title: 'Point one' }, { title: 'Point two', due: '2026-10-20' }] } });
    expect(many.isError).toBeFalsy();
    expect(many.structuredContent).toMatchObject({ created: 2, cards: [{ title: 'Point one' }, { title: 'Point two' }] });
    await client.close();
  });
});
