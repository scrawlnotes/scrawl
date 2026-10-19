import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createBoard, createCollection, createFolder, createNote, listVersions, loadBoard, loadList, loadCollection, loadSchema, MemoryFs, readTrash, saveMe } from '@scrawlnotes/core';
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
  it('tells the spaces, today and the person, and gives the model the whole guide after them', async () => {
    const { agent } = await sample();
    const spaces = await spacesTool(agent);
    const { guide, ...data } = spaces.data;
    expect(data).toEqual({ today: '2026-10-15', person: 'Kaan', spaces: [{ id: 'personal', name: 'Personal', where: 'this computer', personal: true }] });
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
    schema.fields.push({ key: 'segment', label: 'Segment', type: 'select', options: ['SMB', 'Enterprise'] });
    await writeTool(agent, { path, text: JSON.stringify(schema), ifMatch: read.data.hash });
    expect((await loadSchema(fs, companies)).fields.map((f) => f.key)).toContain('segment');
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
    expect((await refusal(moveTool(agent, { path: 'Plans', name: 'Roadmaps' }))).message).toContain('No note, task list, board or collection');
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
    await client.close();
  });
});
