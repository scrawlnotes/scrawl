import { describe, expect, it } from 'vitest';
import { addCard, loadBoard, newBoard, saveBoard } from './board';
import { type Collection, type Field, loadCollection, type Record, saveSchema, type Schema, serializeRecord } from './collection';
import { Computer } from './compute';
import { MemoryFs } from './fs';
import { rulesProblems } from './rules';
import { actionsOf, actionState, askOf, planAction, planSave, planWords, RuleStop, savedWords, writePlan } from './run';
import { loadList, saveList } from './tasks';

const today = '2026-10-21';
const schema = (fields: Field[], singular?: string): Schema => ({ version: 2, template: 'blank', ...(singular && { singular }), fields: [{ key: 'name', label: 'Name', type: 'name' }, ...fields] });
function record(dir: string, id: string, name: string, values: Record['values'] = {}): Record {
  return { id, path: `${dir}/${id}.md`, name, code: '', values: { name, ...values }, extra: {}, body: '' };
}
const link = (id: string, name: string) => ({ id, name });

const RULES = `check("delivery", () => delivery >= start, "Delivery is before the start")

action("Start project", { when: () => status == "Offer", confirm: true, hint: "Only for an offer" }, () => {
  for (const name of ["Material", "Labour", "Transport"]) {
    add("Budget lines", { name, category: name, planned: contract * 0.3 })
  }
  const lines = find("Budget lines", { project: this })
  if (lines.length == 3) subtask("Site survey", { due: start + 3 })
  subtask("Order the cabin")
  task("Inbox", { title: \`Call \${name}\` })
  status = "Active"
})

action("Close project", { when: () => status == "Active" }, () => {
  for (const c of cards("Projects board", { project: this })) move(c, "Acceptance")
  const big = linked("Budget lines").filter((l) => l.planned > 500)
  for (const l of big) update(l, { planned: 500 })
  status = "Done"
})

action("Broken", () => {
  add("Budget lines", { name: "X", cost: 1 })
})
`;

function space() {
  const projects: Collection = {
    dir: 'Atlas/Projects',
    schema: schema(
      [
        { key: 'status', label: 'Status', type: 'select', options: ['Offer', 'Active', 'Done'] },
        { key: 'start', label: 'Start', type: 'date' },
        { key: 'delivery', label: 'Delivery', type: 'date' },
        { key: 'contract', label: 'Contract', type: 'number' },
      ],
      'project',
    ),
    records: [record('Atlas/Projects', 'p1', 'Antalya Hotel', { status: 'Offer', start: '2026-10-27', contract: 2400000 })],
    rules: RULES,
  };
  const lines: Collection = {
    dir: 'Atlas/Budget lines',
    schema: schema(
      [
        { key: 'project', label: 'Project', type: 'link', collection: 'Atlas/Projects' },
        { key: 'category', label: 'Category', type: 'select', options: ['Material', 'Labour', 'Transport'] },
        { key: 'planned', label: 'Planned', type: 'number' },
      ],
      'budget line',
    ),
    records: [],
  };
  let board = newBoard('Projects board', 'simple');
  board = { ...board, fields: [{ key: 'project', label: 'Project', type: 'link', collection: 'Atlas/Projects' }], columns: [...board.columns, { id: 'acc', name: 'Acceptance', kind: 'review' as const }] };
  board = addCard(board, { title: 'Survey', values: { project: link('p1', 'Antalya Hotel') } }, () => new Date(), undefined, 'c1');
  board = addCard(board, { title: 'Other job' }, () => new Date(), undefined, 'c2');
  return { collections: [projects, lines], boards: { 'Atlas/Projects board.board.json': board }, lists: { 'Inbox.tasks.json': [] }, today, me: 'Kaan' };
}

describe('buttons', () => {
  it('reads buttons and says what is wrong with them on their line', () => {
    const s = space();
    const where = {
      collections: s.collections.map((c) => ({ dir: c.dir, fields: c.schema.fields })),
      boards: Object.entries(s.boards).map(([path, b]) => ({ path, fields: b.fields ?? [], columns: b.columns.map((c) => c.name) })),
      lists: Object.keys(s.lists),
    };
    const scope = { fields: s.collections[0]!.schema.fields, dir: 'Atlas/Projects' };
    expect(actionsOf(RULES).map((a) => [a.name, a.confirm, a.hint])).toEqual([
      ['Start project', true, 'Only for an offer'],
      ['Close project', false, undefined],
      ['Broken', false, undefined],
    ]);
    const problems = rulesProblems(RULES, scope, where);
    expect(problems.map((p) => [p.line, p.message])).toEqual([[22, 'Budget lines has no field cost.']]);
    const wrong = (body: string) => rulesProblems(`action("A", () => {\n${body}\n})`, scope, where)[0]?.message;
    expect(wrong('add("Lines", { name: "x" })')).toMatch(/no collection called Lines/);
    expect(wrong('statuss = "Done"')).toMatch(/statuss/);
    expect(wrong('const x = 1\nx = 2')).toMatch(/const/);
    expect(wrong('while (true) {}')).toMatch(/while/);
    expect(wrong('card("Projects board", { title: "x", column: "Later" })')).toMatch(/no column called Later/);
    expect(wrong('task("Todo", { title: "x" })')).toMatch(/no task list called Todo/);
    expect(wrong('linked("Budget lines").sort()')).toMatch(/no sort/);
    expect(rulesProblems('action("A", () => {})\naction("a", () => {})', scope)[0]!.message).toMatch(/already/);
    expect(wrong('let x = 1\nx = 2\nfor (const l of linked("Budget lines")) update(l, { planned: l.planned * x })')).toBeUndefined();
  });

  it('works out what a button would do, writing nothing, seeing its own changes', () => {
    const s = space();
    const plan = planAction(RULES, 'Start project', 'Atlas/Projects', 'p1', s);
    expect(plan.confirm).toBe(true);
    expect(plan.changes.map((c) => c.kind)).toEqual(['add', 'add', 'add', 'subtask', 'subtask', 'task', 'update']);
    const added = plan.changes.filter((c) => c.kind === 'add');
    // Linked back to the project as + Add does, its values as their fields hold them.
    expect(added.map((c) => c.kind === 'add' && c.values)).toEqual(['Material', 'Labour', 'Transport'].map((name) => ({ name, category: name, planned: 720000, project: link('p1', 'Antalya Hotel') })));
    // The lines it added are found: so the survey has its day.
    expect(plan.changes[3]).toMatchObject({ kind: 'subtask', subtask: { title: 'Site survey', due: '2026-10-30' } });
    expect(plan.changes[5]).toMatchObject({ kind: 'task', list: 'Inbox.tasks.json', task: { title: 'Call Antalya Hotel', record: { collection: 'Atlas/Projects', id: 'p1' } } });
    expect(plan.changes[6]).toEqual({ kind: 'update', dir: 'Atlas/Projects', id: 'p1', values: { status: 'Active' } });
    expect(s.collections[1]!.records).toEqual([]);
    const words = planWords(plan, s);
    expect(words.ask).toEqual([
      { text: 'add 3 budget lines', names: 'Material, Labour, Transport' },
      { text: 'add 2 subtasks', names: 'Site survey, Order the cabin' },
      { text: 'add 1 task to Inbox', names: 'Call Antalya Hotel' },
      { text: 'change Status from Offer to Active' },
    ]);
    expect(words.done).toBe('Start project: 3 budget lines, 2 subtasks, 1 task, Status Active');
  });

  it('is faint when its condition does not hold, says why, and stops on the line that fails', () => {
    const s = space();
    const computer = new Computer(s.collections, s.boards, today);
    const p1 = s.collections[0]!.records[0]!;
    const close = actionsOf(RULES)[1]!;
    expect(actionState(RULES, actionsOf(RULES)[0]!, computer, 'Atlas/Projects', p1)).toEqual({ on: true });
    expect(actionState(RULES, close, computer, 'Atlas/Projects', p1)).toEqual({ on: false, hint: 'status == "Active"' });
    expect(() => planAction(RULES, 'Close project', 'Atlas/Projects', 'p1', s)).toThrow(RuleStop);
    try {
      planAction(RULES, 'Broken', 'Atlas/Projects', 'p1', s);
    } catch (error) {
      expect(error).toBeInstanceOf(RuleStop);
      expect((error as RuleStop).line).toBe(22);
      expect((error as RuleStop).message).toMatch(/no field cost/);
    }
  });

  it('moves cards and changes linked records', () => {
    const s = space();
    s.collections[0]!.records[0]!.values.status = 'Active';
    s.collections[1]!.records.push(record('Atlas/Budget lines', 'l1', 'Material', { project: link('p1', 'Antalya Hotel'), planned: 900 }), record('Atlas/Budget lines', 'l2', 'Labour', { project: link('p1', 'Antalya Hotel'), planned: 100 }));
    const plan = planAction(RULES, 'Close project', 'Atlas/Projects', 'p1', s);
    expect(plan.changes).toEqual([
      { kind: 'move', board: 'Atlas/Projects board.board.json', id: 'c1', column: 'acc' },
      { kind: 'update', dir: 'Atlas/Budget lines', id: 'l1', values: { planned: 500 } },
      { kind: 'update', dir: 'Atlas/Projects', id: 'p1', values: { status: 'Done' } },
    ]);
    expect(planWords(plan, s).ask.map((l) => l.text)).toEqual(['move 1 card to Acceptance', 'change 1 budget line', 'change Status from Active to Done']);
  });

  it('writes a plan at once and undoes it', async () => {
    const fs = new MemoryFs();
    const s = space();
    for (const c of s.collections) {
      await saveSchema(fs, c.dir, c.schema);
      for (const r of c.records) await fs.writeText(r.path, serializeRecord(r, c.schema));
    }
    await saveBoard(fs, 'Atlas/Projects board.board.json', s.boards['Atlas/Projects board.board.json']!);
    await saveList(fs, 'Inbox.tasks.json', { tasks: [], sections: [] });
    const loaded = await Promise.all(s.collections.map((c) => loadCollection(fs, c.dir)));
    const here = { ...s, collections: loaded.map((c, i) => ({ ...c, rules: s.collections[i]!.rules })) };
    const plan = planAction(RULES, 'Start project', 'Atlas/Projects', 'p1', here);
    const undo = await writePlan(fs, plan, here);
    const lines = await loadCollection(fs, 'Atlas/Budget lines');
    expect(lines.records.map((r) => r.name).sort()).toEqual(['Labour', 'Material', 'Transport']);
    const project = (await loadCollection(fs, 'Atlas/Projects')).records[0]!;
    expect(project.values.status).toBe('Active');
    expect(project.subtasks?.map((t) => t.title)).toEqual(['Site survey', 'Order the cabin']);
    expect((await loadList(fs, 'Inbox.tasks.json')).tasks.map((t) => t.title)).toEqual(['Call Antalya Hotel']);
    await undo();
    expect((await loadCollection(fs, 'Atlas/Budget lines')).records).toEqual([]);
    const back = (await loadCollection(fs, 'Atlas/Projects')).records[0]!;
    expect(back.values.status).toBe('Offer');
    expect(back.subtasks ?? []).toEqual([]);
    expect((await loadList(fs, 'Inbox.tasks.json')).tasks).toEqual([]);
    expect((await loadBoard(fs, 'Atlas/Projects board.board.json')).cards).toHaveLength(2);
  });
});

const SAVES = `
onSave("Kickoff card", () => {
  if (status == "Active" && old.status != "Active") card("Projects board", { title: \`\${name} kickoff\`, column: "Acceptance" })
})

onSave("Started", () => {
  if (status == "Active" && old.status != "Active") start = today()
})

onSave("Broken", () => {
  if (status == "Done") update(linked("Budget lines").find((l) => l.planned > 1000000000), { planned: 1 })
})
`;

describe('what runs on save', () => {
  const saving = () => {
    const s = space();
    s.collections[0]!.rules = RULES + SAVES;
    return s;
  };

  it('is checked where it is written, old a record of its own collection', () => {
    const s = saving();
    const scope = { fields: s.collections[0]!.schema.fields, dir: 'Atlas/Projects' };
    const where = { collections: s.collections.map((c) => ({ dir: c.dir, fields: c.schema.fields })), boards: [], lists: [] };
    expect(rulesProblems(SAVES, scope).map((p) => p.message)).toEqual([]);
    const wrong = (body: string) => rulesProblems(`onSave("A", () => {\n${body}\n})`, scope, where)[0]?.message;
    expect(wrong('if (old.statuss == "x") status = "Done"')).toMatch(/statuss/);
    expect(wrong('old = 1')).toMatch(/const/);
    expect(wrong('add("Lines", { name: "x" })')).toMatch(/no collection called Lines/);
    expect(rulesProblems('onSave("A", () => {})\nonSave("a", () => {})', scope)[0]!.message).toMatch(/already/);
  });

  it('sets the record’s fields with it, does the rest after it, each onSave seeing the ones before', () => {
    const s = saving();
    const p1 = s.collections[0]!.records[0]!;
    const run = planSave('Atlas/Projects', { ...p1, values: { ...p1.values, status: 'Active' } }, p1, s);
    expect(run.values).toMatchObject({ status: 'Active', start: today });
    expect(run.set).toEqual({ start: 'Started' });
    expect(run.after.changes).toMatchObject([{ kind: 'card', board: 'Atlas/Projects board.board.json', by: 'Kickoff card', card: { title: 'Antalya Hotel kickoff', column: 'acc' } }]);
    expect(run.stops).toEqual([]);
    expect(savedWords(run.after, s)).toBe('1 card added to Projects board');
    // Saved again while Active: old says it was, so nothing runs.
    const again = planSave('Atlas/Projects', { ...p1, values: { ...p1.values, status: 'Active' } }, { ...p1, values: { ...p1.values, status: 'Active' } }, s);
    expect(again.after.changes).toEqual([]);
    expect(again.set).toEqual({});
    // A new record's old has nothing in it.
    const made = planSave('Atlas/Projects', record('Atlas/Projects', 'p9', 'Bursa Mall', { status: 'Active' }), null, s);
    expect(made.after.changes.map((c) => c.kind)).toEqual(['card']);
    expect(made.values.start).toBe(today);
  });

  it('leaves out what stops, keeping the record as given and what the others did', () => {
    const s = saving();
    const p1 = s.collections[0]!.records[0]!;
    const run = planSave('Atlas/Projects', { ...p1, values: { ...p1.values, status: 'Done' } }, p1, s);
    expect(run.values.status).toBe('Done');
    expect(run.stops).toMatchObject([{ name: 'Broken', id: 'p1', line: 34 }]);
    expect(run.stops[0]!.message).toMatch(/takes a record/);
    expect(run.after.changes).toEqual([]);
  });

  it('runs nothing again for what it changes', () => {
    const s = saving();
    // A budget line saved puts its project to Active; the project's own onSaves do not run for that.
    s.collections[1]!.rules = 'onSave("Start the project", () => {\n  update(project, { status: "Active" })\n})';
    const line = record('Atlas/Budget lines', 'l1', 'Material', { project: link('p1', 'Antalya Hotel'), planned: 100 });
    const run = planSave('Atlas/Budget lines', line, null, s);
    expect(run.after.changes).toEqual([{ kind: 'update', dir: 'Atlas/Projects', id: 'p1', values: { status: 'Active' }, by: 'Start the project' }]);
    expect(run.stops).toEqual([]);
  });

  it('runs on the records a button changes, and its question says so under the onSave’s name', () => {
    const s = saving();
    const plan = planAction(RULES + SAVES, 'Start project', 'Atlas/Projects', 'p1', s);
    const card = plan.changes.find((c) => c.kind === 'card');
    expect(card).toMatchObject({ by: 'Kickoff card', card: { title: 'Antalya Hotel kickoff' } });
    // What it set on the record goes with the button's own change of it.
    expect(plan.changes.find((c) => c.kind === 'update' && c.id === 'p1')).toMatchObject({ values: { status: 'Active', start: today } });
    const words = planWords(plan, s);
    expect(words.ask.slice(-2)).toEqual([{ text: 'Then Kickoff card, as it is saved', head: true }, { text: 'add 1 card to Projects board', names: 'Antalya Hotel kickoff' }]);
    expect(words.done).toBe('Start project: 3 budget lines, 2 subtasks, 1 task, 1 card, Status Active, Start 2026-10-21');
  });
});

const ASKS = `action("Grow budget", {
  say: () => \`\${name} has a contract of \${contract}\`,
  ask: {
    share: { label: "Share", type: "number", default: () => 0.3, required: true, note: () => \`That is \${contract * input.share}\` },
    line: { label: "Line", type: "link", collection: "Budget lines", default: () => find("Budget lines")[0] },
    category: { label: "Category", type: "choice", options: ["Material", "Labour"] },
  },
}, () => {
  add("Budget lines", { name: input.category, category: input.category, planned: contract * input.share })
  if (!empty(input.line)) update(input.line, { planned: 0 })
})
`;

describe('a button that asks', () => {
  const asking = () => {
    const s = space();
    s.collections[0]!.rules = ASKS;
    return s;
  };
  const where = (s: ReturnType<typeof space>) => ({ collections: s.collections.map((c) => ({ dir: c.dir, fields: c.schema.fields })), boards: [], lists: [] });

  it('is read and checked: what it asks, and only that, is read as input', () => {
    const s = asking();
    const scope = { fields: s.collections[0]!.schema.fields, dir: 'Atlas/Projects' };
    expect(rulesProblems(ASKS, scope, where(s))).toEqual([]);
    expect(actionsOf(ASKS)[0]!.ask!.map((a) => [a.key, a.type, a.required])).toEqual([
      ['share', 'number', true],
      ['line', 'link', false],
      ['category', 'choice', false],
    ]);
    const wrong = (src: string) => rulesProblems(src, scope, where(s))[0]?.message;
    expect(wrong(ASKS.replace('contract * input.share })', 'contract * input.shar })'))).toBe('Grow budget asks no shar; it asks share, line and category.');
    expect(wrong('action("A", { ask: { x: { label: "X" } } }, () => {})')).toMatch(/type/);
    expect(wrong('action("A", { ask: { x: { type: "colour" } } }, () => {})')).toMatch(/number, text, date, time, choice, link, person, rows or tick/);
    expect(wrong('action("A", { ask: { x: { type: "choice" } } }, () => {})')).toMatch(/options/);
    expect(wrong('action("A", { ask: { x: { type: "link", collection: "Lines" } } }, () => {})')).toMatch(/no collection called Lines/);
    expect(wrong('action("A", { ask: { x: { type: "text", hint: "y" } } }, () => {})')).toMatch(/takes label, type/);
    expect(wrong('action("A", () => { status = input.x })')).toMatch(/input/);
  });

  it('says what it is about, gives its defaults and works its notes out with what was typed', () => {
    const s = asking();
    s.collections[1]!.records.push(record('Atlas/Budget lines', 'l1', 'Material', { project: link('p1', 'Antalya Hotel'), planned: 900 }));
    const asked = askOf(ASKS, 'Grow budget', 'Atlas/Projects', 'p1', s)!;
    expect(asked.say).toBe('Antalya Hotel has a contract of 2400000');
    expect(asked.questions.map((q) => [q.key, q.value, q.note ?? null])).toEqual([
      ['share', 0.3, 'That is 720000'],
      ['line', { id: 'l1', name: 'Material' }, null],
      ['category', null, null],
    ]);
    expect(asked.questions[1]!.collection).toBe('Atlas/Budget lines');
    expect(askOf(ASKS, 'Grow budget', 'Atlas/Projects', 'p1', s, { share: 0.5 })!.questions[0]).toMatchObject({ value: 0.5, note: 'That is 1200000' });
  });

  it('runs on what was given, and stops on a needed answer left empty', () => {
    const s = asking();
    s.collections[1]!.records.push(record('Atlas/Budget lines', 'l1', 'Material', { project: link('p1', 'Antalya Hotel'), planned: 900 }));
    const plan = planAction(ASKS, 'Grow budget', 'Atlas/Projects', 'p1', s, { share: 0.5, category: 'Labour', line: { id: 'l1', name: 'Material' } });
    expect(plan.changes).toMatchObject([
      { kind: 'add', dir: 'Atlas/Budget lines', values: { name: 'Labour', category: 'Labour', planned: 1200000 } },
      { kind: 'update', dir: 'Atlas/Budget lines', id: 'l1', values: { planned: 0 } },
    ]);
    // A question left out takes its default, as the window shows it; one given empty is still needed.
    expect(planAction(ASKS, 'Grow budget', 'Atlas/Projects', 'p1', s, { category: 'Labour' }).changes).toMatchObject([
      { kind: 'add', dir: 'Atlas/Budget lines', values: { name: 'Labour', planned: 720000 } },
      { kind: 'update', dir: 'Atlas/Budget lines', id: 'l1', values: { planned: 0 } },
    ]);
    expect(() => planAction(ASKS, 'Grow budget', 'Atlas/Projects', 'p1', s, { category: 'Labour', share: null })).toThrow('Share is needed.');
  });

  it('picks an item of a list by its place', () => {
    const s = space();
    s.collections[1]!.records.push(record('Atlas/Budget lines', 'l1', 'Material', { planned: 1 }), record('Atlas/Budget lines', 'l2', 'Labour', { planned: 2 }));
    s.collections[0]!.rules = 'action("Pick", () => {\n  const second = find("Budget lines")[1]\n  if (!empty(second)) update(second, { planned: 20 })\n  if (empty(find("Budget lines")[5])) status = "Done"\n})';
    expect(planAction(s.collections[0]!.rules, 'Pick', 'Atlas/Projects', 'p1', s).changes).toEqual([
      { kind: 'update', dir: 'Atlas/Budget lines', id: 'l2', values: { planned: 20 } },
      { kind: 'update', dir: 'Atlas/Projects', id: 'p1', values: { status: 'Done' } },
    ]);
    expect(rulesProblems('action("Pick", () => { const x = name[0] })', { fields: s.collections[0]!.schema.fields, dir: 'Atlas/Projects' })[0]?.message).toMatch(/not a list/);
  });
});

describe('what runs when a field changes', () => {
  const CHANGES = `onChange("program", "Fill from the program", () => {
  for (const i of find("Program items", { program: program })) {
    add("Workout items", { name: i.name, part: i.part, sets: number(i.sets), reps: number(i.reps), done: true })
  }
})

onSave("Its name", () => {
  if (empty(name)) name = program.name
})
`;
  function gym() {
    const programs: Collection = { dir: 'Gym/Programs', schema: schema([]), records: [record('Gym/Programs', 'p1', 'Full body'), record('Gym/Programs', 'p2', 'Legs')] };
    const items: Collection = {
      dir: 'Gym/Program items',
      schema: schema([
        { key: 'program', label: 'Program', type: 'link', collection: 'Gym/Programs' },
        { key: 'part', label: 'Part', type: 'select', options: ['Warm-up', 'Workout'] },
        { key: 'sets', label: 'Sets', type: 'text' },
        { key: 'reps', label: 'Reps', type: 'text' },
      ]),
      records: [
        record('Gym/Program items', 'i1', 'Walk', { program: link('p1', 'Full body'), part: 'Warm-up', reps: '' }),
        record('Gym/Program items', 'i2', 'Chest press', { program: link('p1', 'Full body'), part: 'Workout', sets: '3', reps: '8–12' }),
        record('Gym/Program items', 'i3', 'Leg press', { program: link('p2', 'Legs'), part: 'Workout', sets: '3', reps: '12' }),
      ],
    };
    const workouts: Collection = { dir: 'Gym/Workouts', schema: schema([{ key: 'program', label: 'Program', type: 'link', collection: 'Gym/Programs' }]), records: [], rules: CHANGES };
    const lines: Collection = {
      dir: 'Gym/Workout items',
      schema: schema([
        { key: 'workout', label: 'Workout', type: 'link', collection: 'Gym/Workouts' },
        { key: 'part', label: 'Part', type: 'select', options: ['Warm-up', 'Workout'] },
        { key: 'sets', label: 'Sets', type: 'number' },
        { key: 'reps', label: 'Reps', type: 'number' },
        { key: 'done', label: 'Done', type: 'checkbox' },
      ]),
      records: [],
    };
    return { collections: [programs, items, workouts, lines], boards: {}, lists: {}, today, me: 'Kaan' };
  }
  const workout = (program: string, name = '') => record('Gym/Workouts', 'w1', name, { program: link(program, program === 'p1' ? 'Full body' : 'Legs') });

  it('is checked where it is written: the field it watches is there', () => {
    const s = gym();
    const scope = { fields: s.collections[2]!.schema.fields, dir: 'Gym/Workouts' };
    const where = { collections: s.collections.map((c) => ({ dir: c.dir, fields: c.schema.fields })), boards: [], lists: [] };
    expect(rulesProblems(CHANGES, scope, where)).toEqual([]);
    expect(rulesProblems('onChange("programme", "A", () => {})', scope, where)[0]!.message).toMatch(/programme/);
    expect(rulesProblems('onChange("program", () => {})', scope, where)[0]!.message).toMatch(/its name/);
    expect(rulesProblems('onChange(program, "A", () => {})', scope, where)[0]!.message).toMatch(/the key of the field/);
  });

  it('runs as the form changes the field, alone, what it adds linked to the record and not written', () => {
    const s = gym();
    const run = planSave('Gym/Workouts', workout('p1'), null, s, { field: 'program' });
    expect(run.after.changes).toMatchObject([
      { kind: 'add', dir: 'Gym/Workout items', by: 'Fill from the program', values: { name: 'Walk', part: 'Warm-up', workout: { id: 'w1' }, done: true } },
      { kind: 'add', dir: 'Gym/Workout items', values: { name: 'Chest press', sets: 3, reps: 12, done: true } },
    ]);
    // The onSave waits for Save.
    expect(run.set).toEqual({});
    expect(run.values.name).toBe('');
  });

  it('runs on save when the field changed, before the onSaves; not when the form ran it, nor when the field is as it was', () => {
    const s = gym();
    const made = planSave('Gym/Workouts', workout('p2'), null, s);
    expect(made.after.changes.map((c) => ('values' in c ? c.values.name : ''))).toEqual(['Leg press']);
    expect(made.values.name).toBe('Legs');
    expect(planSave('Gym/Workouts', workout('p2'), null, s, { changes: false }).after.changes).toEqual([]);
    const was = workout('p2', 'Legs');
    expect(planSave('Gym/Workouts', { ...was, values: { ...was.values } }, was, s).after.changes).toEqual([]);
    expect(planSave('Gym/Workouts', workout('p1', 'Legs'), was, s).after.changes).toHaveLength(2);
  });
});
