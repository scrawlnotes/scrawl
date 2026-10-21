import { APP_TEMPLATES, type Answers, MemoryFs, saveMe, TEMPLATE_IDS, type TemplateId } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { checkFile, checkRules } from './check';
import { fileKind, Refusal } from './paths';
import { readTool } from './read';
import { recordsTool, saveRecordTool } from './records';
import type { Agent, AgentSpace } from './space';
import { createTool, writeTool } from './write';

const NOW = new Date(2026, 9, 21, 10, 30);

async function world() {
  const fs = new MemoryFs();
  await saveMe(fs, { id: 'me', name: 'Kaan' });
  const space: AgentSpace = { id: 'personal', name: 'Personal', where: 'this computer', personal: true, fs };
  const agent: Agent = { spaces: async () => [space], person: async () => ({ id: 'me', name: 'Kaan' }), now: () => NOW };
  return { fs, agent };
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

/** The answers that turn on what can be turned on, and the ones that turn it off. */
const MOST: { [id in TemplateId]: Answers } = {
  crm: { customers: 'companies', deals: true },
  sales: { sells: 'both', tax: true, taxIncluded: true, discount: true, quotes: true },
  support: { feedback: true, replies: true },
  projects: { for: 'both', time: true, budget: true },
  budget: { periods: 'monthly', due: true, expenses: true, expected: true },
  stock: { purchasing: true, locations: true, deduct: 'confirmed', payables: true },
  product: { bugs: true, releases: true, phases: true, feedback: true },
};
const LEAST: { [id in TemplateId]: Answers } = {
  crm: { customers: 'people', deals: false },
  sales: { sells: 'services', tax: false, discount: false, quotes: false },
  support: { channels: [], feedback: false, replies: false },
  projects: { for: 'internal', time: false, budget: false, steps: [] },
  budget: { periods: 'none', due: false, expenses: false, categories: [] },
  stock: { purchasing: false, locations: false, deduct: 'no' },
  product: { bugs: false, releases: false, phases: false, feedback: false },
};

/** What a template is asked with this set: only the questions it asks. */
const answersOf = (set: TemplateId[], all: { [id in TemplateId]: Answers }) =>
  Object.fromEntries(
    set.map((id) => {
      const keys = APP_TEMPLATES[id].questions.filter((q) => !q.when || q.when({ chosen: new Set(set), answers: all[id] })).map((q) => q.key);
      return [id, Object.fromEntries(Object.entries(all[id]).filter(([k]) => keys.includes(k)))];
    }),
  );

describe('apps', () => {
  it('sets up every set of templates as files the checks of a write take', async () => {
    let apps = 0;
    for (let mask = 1; mask < 1 << TEMPLATE_IDS.length; mask++) {
      const set = TEMPLATE_IDS.filter((_, i) => mask & (1 << i));
      for (const [all, currencies] of [
        [MOST, ['TRY', 'EUR']],
        [LEAST, ['TRY']],
      ] as const) {
        const { fs, agent } = await world();
        await createTool(agent, { kind: 'app', name: 'Atlas', templates: set, answers: answersOf(set, all), currencies: [...currencies] });
        const files: string[] = [];
        const walk = async (dir: string) => {
          for (const e of await fs.list(dir)) e.kind === 'dir' ? await walk(e.path) : files.push(e.path);
        };
        await walk('Atlas');
        for (const path of files) {
          const text = await fs.readText(path);
          const kind = fileKind(path);
          const problems =
            kind === 'rules' ? await checkRules(fs, path, text) : kind === 'schema' || kind === 'board' ? (await checkFile(fs, kind, JSON.parse(text), text)).problems : [];
          expect({ set, path, problems }).toEqual({ set, path, problems: [] });
        }
        apps++;
      }
    }
    expect(apps).toBe(254);
  }, 120_000);

  it('runs a sale through: a line from its product, the order adding up, stock out on delivery, the payment expected and recorded', async () => {
    const { fs, agent } = await world();
    const made = await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['crm', 'sales', 'stock', 'budget'], currencies: ['TRY'] });
    expect(made.data).toMatchObject({ path: 'Atlas', kind: 'app', created: true, templates: ['crm', 'sales', 'stock', 'budget'] });
    expect((made.data as { made: string[] }).made).toEqual(expect.arrayContaining(['collection Atlas/Orders', 'board Atlas/Deals.board.json', 'note Atlas/About Atlas.md']));
    const save = (collection: string, values: object, rest: object = {}) => saveRecordTool(agent, { collection: `Atlas/${collection}`, values: values as never, ...rest });
    const record = async (collection: string, name: string) => (await recordsTool(agent, { collection: `Atlas/${collection}` })).data.records.find((r) => r.name === name || r.values.code === name)!;

    await save('Companies', { name: 'Kone', type: ['supplier'] });
    await save('Companies', { name: 'Lara Turizm', type: ['customer'] });
    await save('Products', { name: 'Rail', price: 1000, tax_rate: 20, cost: 600, reorder_level: 5, supplier: 'Kone' });

    // Goods come in on a purchase order, and what is owed to the supplier is written.
    await save('Purchase orders', { supplier: 'Kone' });
    const poLine = await save('Purchase order lines', { purchase_order: 'PO-0001', product: 'Rail', quantity: 10 });
    expect(poLine.data.record.values).toMatchObject({ name: 'Rail', unit_cost: 600, amount: 6000 });
    const received = await save('Purchase orders', { status: 'Received' }, { id: 'PO-0001' });
    expect(received.data.onSave?.did).toBe("Receive: 1 movement added, 1 payment added");
    expect((await record('Products', 'Rail')).values).toMatchObject({ stock: 10, stock_value: 6000, stock_status: 'OK' });
    const owed = (await recordsTool(agent, { collection: 'Atlas/Payments' })).data.records;
    expect(owed.map((p) => p.values)).toEqual([expect.objectContaining({ direction: 'Out', amount: 6000, status: 'Invoiced', company: expect.objectContaining({ name: 'Kone' }) })]);

    // An order: its line takes the price and the tax from the product, with the discount.
    const order = await save('Orders', { customer: 'Lara Turizm', due: '2026-11-20' });
    expect(order.data.record.values).toMatchObject({ code: 'ORD-0001', status: 'Quote', date: '2026-10-21' });
    const line = await save('Order lines', { order: 'ORD-0001', product: 'Rail', quantity: 3, discount: 10 });
    expect(line.data.record.values).toMatchObject({ name: 'Rail', unit_price: 1000, tax_rate: 20, net: 2700, tax: 540, amount: 3240 });
    expect((await record('Orders', 'ORD-0001')).values).toMatchObject({ subtotal: 2700, discount: 300, tax: 540, total: 3240, remaining: 3240 });

    // Delivered, its products go out of stock; taken back, they come back.
    await save('Orders', { status: 'Confirmed' }, { id: 'ORD-0001' });
    expect((await record('Products', 'Rail')).values.stock).toBe(10);
    await save('Orders', { status: 'Delivered' }, { id: 'ORD-0001' });
    expect((await record('Products', 'Rail')).values.stock).toBe(7);
    await save('Orders', { status: 'Confirmed' }, { id: 'ORD-0001' });
    expect((await record('Products', 'Rail')).values.stock).toBe(10);
    await save('Orders', { status: 'Delivered' }, { id: 'ORD-0001' });

    // Invoiced, the payment to collect is added; a part paid leaves the rest waiting; all paid, the order is Paid.
    const invoiced = await save('Orders', { status: 'Invoiced', invoice_no: 'A-1001' }, { id: 'ORD-0001' });
    expect(invoiced.data.onSave?.did).toMatch(/1 payment/);
    const part = await saveRecordTool(agent, { collection: 'Atlas/Orders', id: 'ORD-0001', action: 'Record payment', input: { amount: 1000 } });
    expect(part.data.record.values).toMatchObject({ collected: 1000, remaining: 2240, status: 'Invoiced' });
    const incoming = (await recordsTool(agent, { collection: 'Atlas/Payments' })).data.records.filter((p) => p.values.direction === 'In');
    expect(incoming.map((p) => [p.values.amount, p.values.status, (p.values.budget_line as { name: string } | undefined)?.name])).toEqual(
      expect.arrayContaining([
        [1000, 'Paid', 'Sales'],
        [2240, 'Invoiced', 'Sales'],
      ]),
    );
    const rest = await saveRecordTool(agent, { collection: 'Atlas/Orders', id: 'ORD-0001', action: 'Record payment', input: { amount: 2240 } });
    expect(rest.data.record.values).toMatchObject({ remaining: 0, status: 'Paid' });
    expect((await record('Budget lines', 'Sales')).values.actual).toBe(3240);

    // A count: the difference goes in as an adjustment.
    const counted = await saveRecordTool(agent, { collection: 'Atlas/Products', id: 'PRD-0001', action: 'Correct stock', input: { total: 4 } });
    expect(counted.data.record.values).toMatchObject({ stock: 4, stock_status: 'Low' });
    expect(counted.data.record.problems).toEqual([{ kind: 'check', field: 'stock', text: 'Low: 4 left' }]);
  });

  it('keeps stock by warehouse: a movement finds its stock level, a transfer moves it on', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Depot', templates: ['stock'], answers: { stock: { locations: true, purchasing: false } }, currencies: ['EUR'] });
    const locations = (await recordsTool(agent, { collection: 'Depot/Locations' })).data.records.map((r) => [r.name, r.values.is_default ?? false]);
    expect(locations.sort()).toEqual([['Main warehouse', true], ['Second warehouse', false]]);
    await saveRecordTool(agent, { collection: 'Depot/Products', values: { name: 'Cable' } });
    const moved = await saveRecordTool(agent, { collection: 'Depot/Stock movements', values: { product: 'Cable', location: 'Main warehouse', direction: 'In', type: 'purchase', quantity: 10 } });
    expect(moved.data.record.values.level).toMatchObject({ name: 'Cable · Main warehouse' });
    const level = (await recordsTool(agent, { collection: 'Depot/Stock levels' })).data.records[0]!;
    expect(level.values).toMatchObject({ stock: 10 });
    const sent = await saveRecordTool(agent, { collection: 'Depot/Stock levels', id: level.id, action: 'Transfer', input: { quantity: 4, to: 'Second warehouse' } });
    expect(sent.data.record.values.stock).toBe(6);
    const levels = (await recordsTool(agent, { collection: 'Depot/Stock levels' })).data.records.map((r) => [r.name, r.values.stock]);
    expect(levels).toEqual(expect.arrayContaining([['Cable · Main warehouse', 6], ['Cable · Second warehouse', 4]]));
    expect((await recordsTool(agent, { collection: 'Depot/Products' })).data.records[0]!.values.stock).toBe(10);
    // A movement with no warehouse is in the default one.
    const plain = await saveRecordTool(agent, { collection: 'Depot/Stock movements', values: { product: 'Cable', direction: 'Out', type: 'use', quantity: 1 } });
    expect(plain.data.record.values).toMatchObject({ location: { name: 'Main warehouse' }, level: { name: 'Cable · Main warehouse' } });
  });

  it('approves an expense, pays it back and rejects another with its reason', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Office', templates: ['budget'], answers: { budget: { expenses: true } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Office/Budget lines', values: { name: 'Travel', planned: 10000 } });
    const taxi = await saveRecordTool(agent, { collection: 'Office/Expenses', values: { name: 'Taxi', amount: 450, budget_line: 'Travel' } });
    expect(taxi.data.record.values).toMatchObject({ status: 'Submitted', person: 'Kaan', date: '2026-10-21' });
    const approved = await saveRecordTool(agent, { collection: 'Office/Expenses', id: taxi.data.record.id, action: 'Approve' });
    expect(approved.data.record.values).toMatchObject({ status: 'Approved', approved_by: 'Kaan' });
    const payment = (await recordsTool(agent, { collection: 'Office/Payments' })).data.records[0]!;
    expect(payment.values).toMatchObject({ name: 'Taxi', direction: 'Out', amount: 450, status: 'Planned' });
    await saveRecordTool(agent, { collection: 'Office/Payments', id: payment.id, action: 'Mark paid' });
    expect((await recordsTool(agent, { collection: 'Office/Expenses' })).data.records[0]!.values.status).toBe('Reimbursed');
    expect((await recordsTool(agent, { collection: 'Office/Budget lines' })).data.records[0]!.values).toMatchObject({ actual: 450, remaining: 9550 });
    const dinner = await saveRecordTool(agent, { collection: 'Office/Expenses', values: { name: 'Dinner', amount: 2000 } });
    const needed = await refusal(saveRecordTool(agent, { collection: 'Office/Expenses', id: dinner.data.record.id, action: 'Reject' }));
    expect(needed.message).toMatch(/Reason/);
    const rejected = await saveRecordTool(agent, { collection: 'Office/Expenses', id: dinner.data.record.id, action: 'Reject', input: { reason: 'Not a work dinner' } });
    expect(rejected.data.record.values).toMatchObject({ status: 'Rejected', reason: 'Not a work dinner' });
  });

  it('starts and closes a project, with its cards and its budget lines', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Lifts', templates: ['projects'], answers: { projects: { budget: true, time: true } }, currencies: ['TRY'] });
    const project = await saveRecordTool(agent, { collection: 'Lifts/Projects', values: { name: 'Antalya Hotel', customer: 'Lara Turizm', contract: 1000000, end: '2027-04-30' } });
    expect(project.data.record.values).toMatchObject({ code: 'PRJ-0001', status: 'Planned', owner: 'Kaan' });
    const started = await saveRecordTool(agent, { collection: 'Lifts/Projects', id: 'PRJ-0001', action: 'Start project' });
    expect(started.data.action?.done).toBe('Start project: 3 budget lines, 4 cards, Status Active');
    expect(started.data.record.values).toMatchObject({ status: 'Active', budget: 900000, cards: 4, open_cards: 4, progress: 0 });
    await saveRecordTool(agent, { collection: 'Lifts/Time entries', values: { name: 'Survey', project: 'Antalya Hotel', hours: 6 } });
    const closed = await saveRecordTool(agent, { collection: 'Lifts/Projects', id: 'PRJ-0001', action: 'Close project' });
    expect(closed.data.record.values).toMatchObject({ status: 'Done', open_cards: 0, progress: 1, hours: 6, billable_hours: 6 });
    const board = JSON.parse(await fs.readText('Lifts/Work.board.json'));
    expect(board.cards.map((c: { title: string }) => c.title)).toEqual(['Antalya Hotel: Kickoff', 'Antalya Hotel: Planning', 'Antalya Hotel: Delivery', 'Antalya Hotel: Review']);
  });

  it('logs a call from a company, and ships a release asking first when cards are open', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Studio', templates: ['crm', 'product'], answers: { crm: { deals: false } } });
    const firm = await saveRecordTool(agent, { collection: 'Studio/Companies', values: { name: 'Lara Turizm' } });
    const called = await saveRecordTool(agent, { collection: 'Studio/Companies', id: firm.data.record.id, action: 'Log a call' });
    expect(called.data.record.values.last_contact).toBe('2026-10-21');
    const activity = (await recordsTool(agent, { collection: 'Studio/Activities' })).data.records[0]!;
    expect(activity.values).toMatchObject({ name: 'Call with Lara Turizm', type: 'call', by: 'Kaan', company: { name: 'Lara Turizm' } });

    const release = await saveRecordTool(agent, { collection: 'Studio/Releases', values: { name: '1.0' } });
    const board = JSON.parse(await fs.readText('Studio/Roadmap.board.json'));
    board.cards = [{ id: 'c1', key: 1, title: 'Sign in', column: board.columns[1].id, order: 0, priority: 4, due: null, created: '2026-10-21T10:00:00.000Z', updated: '2026-10-21T10:00:00.000Z', completed: null, timeline: [], values: { release: { id: release.data.record.id, name: '1.0' } } }];
    board.nextKey = 2;
    await fs.writeText('Studio/Roadmap.board.json', JSON.stringify(board));
    const shipped = await saveRecordTool(agent, { collection: 'Studio/Releases', id: release.data.record.id, action: 'Ship' });
    expect(shipped.data.record.values).toMatchObject({ status: 'Released', shipped: '2026-10-21', open_cards: 1 });
    expect(shipped.data.record.problems).toEqual([{ kind: 'check', field: 'status', text: 'Released with 1 open cards' }]);
  });

  it('adds a template to an app, says what it added, and refuses what is wrong', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['crm'], currencies: ['TRY'] });
    const again = await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['crm'] });
    expect(again.data).toMatchObject({ exists: true, path: 'Atlas' });
    const added = await createTool(agent, { kind: 'app', folder: 'Atlas', name: '', templates: ['support', 'product'], answers: { product: { bugs: false } } });
    expect(added.data).toMatchObject({ created: false, templates: ['crm', 'support', 'product'], changed: ['Companies: 1 block on its screen', 'People: 1 block on its screen'] });
    expect((added.data as { made: string[] }).made).toEqual(['board Atlas/Requests.board.json', 'collection Atlas/Feedback', 'folder Atlas/Saved replies', 'board Atlas/Roadmap.board.json', 'collection Atlas/Releases']);
    const about = (await readTool(agent, { path: 'Atlas/About Atlas.md' })).data.text;
    expect(about).toMatch(/## CRM[\s\S]*## Customer support[\s\S]*## Product development/);
    const app = JSON.parse((await readTool(agent, { path: 'Atlas/_app.json' })).data.text);
    expect(app.templates.map((x: { id: string }) => x.id)).toEqual(['crm', 'support', 'product']);
    expect((await refusal(writeTool(agent, { path: 'Atlas/_app.json', text: '{}' }))).message).toMatch(/read, not written/);
    const wrong = await refusal(createTool(agent, { kind: 'app', name: 'Shop', templates: ['sales'], answers: { sales: { tax: 'yes' } } }));
    expect(wrong.details.problems).toEqual(['sales.tax: the answer is true or false', 'Give the currencies the app keeps money in, like TRY or EUR; the first is the main one']);
    expect((await refusal(createTool(agent, { kind: 'app', folder: 'Atlas', name: '', templates: ['crm'] }))).details.problems).toEqual(['crm is in the app already']);
  });
});

