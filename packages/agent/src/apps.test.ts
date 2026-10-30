import { APP_TEMPLATES, type Answers, apartProblem, askOf, computerFor, goTogether, loadCollection, MemoryFs, parseBoard, saveMe, TEMPLATE_GROUPS, TEMPLATE_IDS, type TemplateId } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { checkFile, checkRules } from './check';
import { fileKind, Refusal } from './paths';
import { readTool, treeTool } from './read';
import { dueRecordsTool, recordsTool, ruleSpaceNow, saveRecordTool } from './records';
import type { Agent, AgentSpace } from './space';
import { createTool, writeTool } from './write';
import { saveCardTool } from './cards';

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
  appointments: { for: 'both', by: 'team', staff: ['Ayşe', 'Mehmet'], fee: true, payments: true },
  projects: { for: 'both', time: true, budget: true },
  budget: { due: true, expenses: true, expected: true },
  stock: { purchasing: true, locations: true, deduct: 'confirmed', payables: true },
  ecommerce: { returns: true, budget: true },
  product: { bugs: true, releases: true, phases: true, feedback: true },
  recruiting: { interviews: true, scores: true },
  assets: { assign: true, service: true, places: true, costs: true },
  content: { campaigns: true },
  subscriptions: { sells: 'memberships', trial: true, customers: 'people', payments: true },
  contracts: { notice: '60', seats: true },
  timeoff: { allowance: '25', holidays: 'gb', approvals: true },
  goals: { period: 'half', checkins: 'biweekly' },
  incidents: { actions: true },
  field: { technicians: ['Ali', 'Veli'], contracts: true, stock: true, invoice: true },
  consulting: { time: true, deadlines: true, customers: 'people', payments: true },
  finance: { recurring: [{ name: 'Salary', amount: 50000, direction: 'In', every: 'Monthly', day: 15, category: 'Salary' }, { name: 'Rent', amount: 20000, direction: 'Out', every: 'Monthly', day: 1, category: 'Rent' }], budget: true },
  home: { jobs: ['Gutters cleaned yearly'] },
  health: { for: 'family', family: ['Ayşe', 'Can'], medications: true },
  recipes: { shopping: true },
  travel: {},
  split: { people: ['Ayşe', 'Can', 'Deniz'], methods: 'all', finance: true },
  jobs: {},
  people: { anniversaries: true, touch: 'Every month' },
  reading: { goal: '24', quotes: true, lending: true, releases: true },
  habits: { goals: true },
  sport: { sets: true, body: true, races: true },
  gym: { days: true, sets: true },
};
const LEAST: { [id in TemplateId]: Answers } = {
  crm: { customers: 'people', deals: false },
  sales: { sells: 'services', tax: false, discount: false, quotes: false },
  support: { channels: [], feedback: false, replies: false },
  appointments: { for: 'resources', by: 'me', resources: [], fee: false },
  projects: { for: 'internal', time: false, budget: false, steps: [] },
  budget: { due: false, expenses: false, categories: [] },
  stock: { purchasing: false, locations: false, deduct: 'no' },
  ecommerce: { channels: [], carriers: [], returns: false, budget: false },
  product: { bugs: false, releases: false, phases: false, feedback: false },
  recruiting: { stages: [], sources: [], interviews: false, steps: [] },
  assets: { categories: [], assign: false, service: false, places: false, costs: false },
  content: { channels: [], steps: [], campaigns: false },
  subscriptions: { sells: 'agreements', plans: [], trial: false, customers: 'companies', payments: false },
  contracts: { kinds: [], notice: '0', seats: false },
  timeoff: { types: [], allowance: '10', holidays: 'none', approvals: false },
  goals: { period: 'year', checkins: 'none' },
  incidents: { types: [], actions: false },
  field: { jobs: [], contracts: false, stock: false, invoice: false },
  consulting: { models: [], time: false, deadlines: false, payments: false },
  finance: { accounts: [], recurring: [], budget: false },
  home: { keeps: [] },
  health: { for: 'me', medications: false },
  recipes: { meals: [], shopping: false },
  travel: { keeps: [] },
  split: { people: [], methods: 'equal', finance: false },
  jobs: { stages: [], follow: '7' },
  people: { anniversaries: false, touch: 'off' },
  reading: { types: [], services: [], goal: 'none', quotes: false, lending: false, releases: false },
  habits: { habits: [], goals: false },
  sport: { sports: [], body: false, races: false },
  gym: { days: false, sets: false },
};

/**
 * The sets of templates tried (design/more-apps.md 7): each alone, each with each other it goes
 * together with, each group's and each side's all together where they go in one app, and a
 * person's that do. Every set would be too many.
 */
const setsToTry = (): TemplateId[][] => {
  const out: TemplateId[][] = TEMPLATE_IDS.map((id) => [id]);
  TEMPLATE_IDS.forEach((a, i) => {
    for (const b of TEMPLATE_IDS.slice(i + 1)) if (goTogether(a, b)) out.push([a, b]);
  });
  for (const groups of Object.values(TEMPLATE_GROUPS)) {
    for (const group of groups) out.push(TEMPLATE_IDS.filter((id) => APP_TEMPLATES[id].group === group));
    out.push(TEMPLATE_IDS.filter((id) => (groups as readonly string[]).includes(APP_TEMPLATES[id].group)));
  }
  out.push(['finance', 'travel', 'split']);
  return out.filter((set) => (set.length > 1 ? apartProblem(set, new Set()) === null : set.length > 0));
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
  it('changes the answers of an app it has, renaming a stage with its deals, and adds a template it has not', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['crm'], currencies: ['TRY'] });
    const changed = await createTool(agent, { kind: 'app', name: 'Atlas', folder: 'Atlas', templates: ['crm'], answers: { crm: { stages: ['Lead', 'Contacted', 'Meeting', 'Quote', 'Won', 'Lost'] } }, renames: { crm: { stages: { Proposal: 'Quote' } } } });
    expect(changed.data).toMatchObject({ answered: ['crm'], changed: expect.arrayContaining(['Deals: Proposal is now Quote']) });
    const board = JSON.parse(((await readTool(agent, { path: 'Atlas/Deals.board.json' })).data as { text: string }).text);
    expect(board.columns.map((c: { name: string }) => c.name)).toContain('Quote');
    const same = await createTool(agent, { kind: 'app', name: 'Atlas', folder: 'Atlas', templates: ['crm'], answers: { crm: { deals: true } } });
    expect(same.data).toMatchObject({ message: 'Every answer is as it was; nothing was changed.' });
    const both = await createTool(agent, { kind: 'app', name: 'Atlas', folder: 'Atlas', templates: ['crm', 'sales'], answers: { crm: { deals: false } } });
    expect(both.data).toMatchObject({ answered: ['crm'], templates: ['crm', 'sales'] });
  });

  it('gives an app in the tree with its modules and their screens, as the person sees it', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Spare parts', templates: ['crm', 'sales'], currencies: ['TRY'] });
    const { nodes } = (await treeTool(agent, {})).data as { nodes: { path: string; app?: { modules: { name: string; screens: string[] }[] } }[] };
    expect(nodes.find((n) => n.path === 'Spare parts')?.app?.modules).toEqual([
      { name: 'CRM', screens: ['Spare parts/Deals.board.json', 'Spare parts/Companies', 'Spare parts/People', 'Spare parts/Activities'] },
      { name: 'Sales', screens: ['Spare parts/Orders', 'Spare parts/Payments', 'Spare parts/Products', 'Spare parts/Companies'] },
    ]);
    expect(nodes.find((n) => n.path === 'Inbox.tasks.json')?.app).toBeUndefined();
  });

  it('makes an app of no template, puts what is made in it into its menu, and changes an app’s menu', async () => {
    const { fs, agent } = await world();
    const made = await createTool(agent, { kind: 'app', name: 'Garden', icon: 'app' });
    expect(made.data).toMatchObject({ path: 'Garden', kind: 'app', created: true, templates: [] });
    expect((await refusal(createTool(agent, { kind: 'app', name: 'Yard', icon: 'rocket' }))).message).toMatch(/icon is one of/);
    expect((await createTool(agent, { kind: 'app', name: 'Garden' })).data).toMatchObject({ exists: true });
    // What is made with module comes into its one module; a collection made without it is in no menu.
    await createTool(agent, { folder: 'Garden', kind: 'collection', name: 'Plants', module: 'Main' });
    await createTool(agent, { folder: 'Garden', kind: 'board', name: 'Jobs', module: '' });
    await createTool(agent, { folder: 'Garden', kind: 'collection', name: 'Seeds' });
    expect((await refusal(createTool(agent, { folder: 'Plans', kind: 'note', name: 'x', module: 'Main' }))).message).toMatch(/No folder|not in an app/);
    expect((await refusal(createTool(agent, { folder: 'Garden', kind: 'tasks', name: 'x', module: 'Main' }))).message).toMatch(/module is for a collection/);
    const tree = async () => ((await treeTool(agent, {})).data as { nodes: { path: string; app?: { modules: { name: string; screens: string[] }[] } }[] }).nodes.find((n) => n.path === 'Garden')?.app?.modules;
    expect(await tree()).toEqual([{ name: '', screens: ['Garden/Plants', 'Garden/Jobs.board.json'] }]);
    // Its menu given: two modules, Seeds in the second, Jobs hidden.
    const changed = await createTool(agent, { kind: 'app', name: 'Garden', folder: 'Garden', menu: { modules: [{ name: 'Growing', screens: ['Garden/Plants', 'Jobs.board.json'] }, { name: 'Buying', screens: ['Seeds'] }], hidden: ['Jobs.board.json'] } });
    expect(changed.data).toMatchObject({ created: false, menu: [{ name: 'Growing', screens: ['Garden/Plants'] }, { name: 'Buying', screens: ['Garden/Seeds'] }] });
    expect(JSON.parse(await fs.readText('Garden/_app.json')).menu.modules[0].screens).toEqual([{ path: 'Plants' }, { path: 'Jobs.board.json' }]);
    expect((await refusal(createTool(agent, { kind: 'app', name: 'Garden', folder: 'Garden', menu: { modules: [{ name: 'X', screens: ['Weeds'] }] } }))).message).toMatch(/Not in Garden: Weeds/);
    await createTool(agent, { folder: 'Garden', kind: 'note', name: 'Watering', module: 'buying' });
    expect(await tree()).toEqual([
      { name: 'Growing', screens: ['Garden/Plants'] },
      { name: 'Buying', screens: ['Garden/Seeds', 'Garden/Watering.md'] },
    ]);
    expect((await refusal(createTool(agent, { folder: 'Garden', kind: 'collection', name: 'Tools', module: 'Selling' }))).message).toMatch(/no module called Selling/);
    // A template app's module named as its template keeps what the template sets up.
    await createTool(agent, { kind: 'app', name: 'Shop', templates: ['crm'], currencies: ['EUR'] });
    await createTool(agent, { kind: 'app', name: 'Shop', folder: 'Shop', menu: { modules: [{ name: 'CRM', screens: ['Companies', 'People'] }] } });
    expect(await fs.readText('Shop/_app.json')).toContain('"template": "crm"');
    expect(((await treeTool(agent, {})).data as { nodes: { path: string; app?: { modules: { screens: string[] }[] } }[] }).nodes.find((n) => n.path === 'Shop')?.app?.modules[0]!.screens).toEqual(['Shop/Companies', 'Shop/People', 'Shop/Deals.board.json', 'Shop/Activities']);
  });

  it('adds an order with its lines at once, each from its product, and says how many lines each order has', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['sales'], currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Atlas/Companies', values: { name: 'Lara Turizm' } });
    await saveRecordTool(agent, { collection: 'Atlas/Products', values: { name: 'Rail', price: 1000 } });
    await saveRecordTool(agent, { collection: 'Atlas/Products', values: { name: 'Bracket', price: 50 } });

    const order = await saveRecordTool(agent, { collection: 'Atlas/Orders', values: { customer: 'Lara Turizm' }, lines: [{ product: 'Rail', quantity: 2 }, { product: 'Bracket', quantity: 4, unit_price: 40 }] });
    expect(order.data.record.values).toMatchObject({ code: 'SO-0001', subtotal: 2160 });
    const { lines } = order.data as unknown as { lines: { collection: string; records: { name: string; values: { [key: string]: unknown } }[] } };
    expect(lines.collection).toBe('Atlas/Order lines');
    expect(lines.records.map((r) => [r.name, r.values.unit_price, (r.values.order as { code: string }).code])).toEqual([
      ['Rail', 1000, 'SO-0001'],
      ['Bracket', 40, 'SO-0001'],
    ]);

    await saveRecordTool(agent, { collection: 'Atlas/Orders', values: { customer: 'Lara Turizm' }, another: true });
    const listed = (await recordsTool(agent, { collection: 'Atlas/Orders' })).data as unknown as { lines: string[]; records: { code: string; lines: number }[] };
    expect(listed.lines).toEqual(['Atlas/Order lines']);
    expect(listed.records.map((r) => [r.code, r.lines]).sort()).toEqual([
      ['SO-0001', 2],
      ['SO-0002', 0],
    ]);

    // Lines come with a new record only, without their link to it; a collection without lines takes none.
    expect((await refusal(saveRecordTool(agent, { collection: 'Atlas/Orders', id: 'SO-0002', lines: [{ product: 'Rail' }] }))).message).toMatch(/lines come with a new record.*save_record in Atlas\/Order lines/);
    expect((await refusal(saveRecordTool(agent, { collection: 'Atlas/Orders', values: { customer: 'Lara Turizm' }, another: true, lines: [{ order: 'SO-0001', product: 'Rail' }] }))).message).toMatch(/Order of a line is the record it comes with/);
    expect((await refusal(saveRecordTool(agent, { collection: 'Atlas/Products', values: { name: 'Bolt' }, lines: [{ name: 'x' }] }))).message).toMatch(/have no lines/);
    expect((await recordsTool(agent, { collection: 'Atlas/Orders' })).data.total).toBe(2);
  });

  it('sets up each template, each two of a side and each group as files the checks of a write take', async () => {
    let apps = 0;
    const sets = setsToTry();
    for (const set of sets) {
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
    expect(apps).toBe(sets.length * 2);
  }, 1_800_000);

  it('runs a sale through: a quote on a deal accepted, its line from its product, invoiced on the customer’s terms, paid in two; stock reordered, received in two, adjusted and counted', async () => {
    const { agent } = await world();
    const made = await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['crm', 'sales', 'stock', 'budget'], currencies: ['TRY'] });
    expect(made.data).toMatchObject({ path: 'Atlas', kind: 'app', created: true, templates: ['crm', 'sales', 'stock', 'budget'] });
    expect((made.data as { made: string[] }).made).toEqual(expect.arrayContaining(['collection Atlas/Orders', 'collection Atlas/Stock counts', 'board Atlas/Deals.board.json', 'note Atlas/About Atlas.md']));
    const save = (collection: string, values: object, rest: object = {}) => saveRecordTool(agent, { collection: `Atlas/${collection}`, values: values as never, ...rest });
    const press = (collection: string, id: string, action: string, input?: object) => saveRecordTool(agent, { collection: `Atlas/${collection}`, id, action, ...(input && { input: input as never }) });
    const record = async (collection: string, name: string) => (await recordsTool(agent, { collection: `Atlas/${collection}` })).data.records.find((r) => r.name === name || r.values.code === name)!;

    await save('Companies', { name: 'Kone', type: ['Supplier'] });
    await save('Companies', { name: 'Lara Turizm', payment_terms: 'Net 15' });
    await save('Products', { name: 'Rail', price: 1000, tax_rate: 20, cost: 600, reorder_level: 10, supplier: 'Kone' });

    // Reorder twice: one draft order to Kone, its line once, ten rails to reach the level, at their cost.
    expect((await press('Products', 'PRD-0001', 'Reorder')).data.action?.done).toBe("Rail · on its supplier's draft order");
    await press('Products', 'PRD-0001', 'Reorder');
    const lines = (await recordsTool(agent, { collection: 'Atlas/Purchase order lines' })).data.records;
    expect(lines.map((l) => [l.name, l.values.quantity, l.values.unit_cost, (l.values.purchase_order as { code: string }).code])).toEqual([['Rail', 10, 600, 'PO-0001']]);
    // Ordered, the rails are on their way; received in two, what is short stays to come.
    const ordered = await press('Purchase orders', 'PO-0001', 'Order', { expected: '2026-10-28' });
    expect(ordered.data.record.values).toMatchObject({ status: 'Ordered', expected: '2026-10-28', arrives: 'Oct 28' });
    // Ordered, it is not low: what is on its way counts.
    expect((await record('Products', 'Rail')).values).toMatchObject({ stock: 0, on_order: 10 });
    expect((await record('Products', 'Rail')).values.stock_status).toBeUndefined();
    const part = await press('Purchase orders', 'PO-0001', 'Receive', { lines: [{ row: 'Rail', count: 6 }] });
    expect(part.data.record.values).toMatchObject({ status: 'Partially received', to_come: 4 });
    expect((await record('Products', 'Rail')).values).toMatchObject({ stock: 6, on_order: 4 });
    // With nothing given, what is still to come comes; Received, what is owed to Kone is written.
    const all = await press('Purchase orders', 'PO-0001', 'Receive');
    expect(all.data.record.values).toMatchObject({ status: 'Received', to_come: 0 });
    expect((await record('Products', 'Rail')).values).toMatchObject({ stock: 10, on_order: 0, stock_value: 6000 });
    const owed = (await recordsTool(agent, { collection: 'Atlas/Payments' })).data.records;
    expect(owed.map((p) => p.values)).toEqual([expect.objectContaining({ direction: 'Out', amount: 6000, status: 'Invoiced', company: expect.objectContaining({ name: 'Kone' }) })]);

    // A quote on a deal: its customer the deal's company, its terms the customer's.
    const deal = await saveCardTool(agent, {}, { board: 'Atlas/Deals', title: 'Hotel rails', values: { company: 'Lara Turizm', value: 3240 } });
    const quote = await save('Orders', { deal: 'Hotel rails' });
    expect(quote.data.record.values).toMatchObject({ code: 'SO-0001', status: 'Quote', date: '2026-10-21', valid_until: '2026-11-20', customer: expect.objectContaining({ name: 'Lara Turizm' }), payment_terms: 'Net 15' });
    const line = await save('Order lines', { order: 'SO-0001', product: 'Rail', quantity: 3, discount: 10 });
    expect(line.data.record.values).toMatchObject({ name: 'Rail', unit_price: 1000, tax_rate: 20, net: 2700, tax: 540, amount: 3240 });
    expect((await record('Orders', 'SO-0001')).values).toMatchObject({ subtotal: 2700, discount: 300, tax: 540, total: 3240, remaining: 0, state: 'Valid until Nov 20' });
    // Accept confirms it and wins its deal: the company is a customer; the rails are committed.
    const accepted = await press('Orders', 'SO-0001', 'Accept');
    expect(accepted.data.record.values).toMatchObject({ status: 'Confirmed', remaining: 3240 });
    expect((await save('Companies', {}, { id: 'Lara Turizm' })).data.record.values).toMatchObject({ type: ['Customer'], to_collect: 3240 });
    expect((await record('Products', 'Rail')).values).toMatchObject({ stock: 10, committed: 3, available: 7 });
    void deal;
    // Delivered, they go out of stock.
    await save('Orders', { status: 'Delivered' }, { id: 'SO-0001' });
    expect((await record('Products', 'Rail')).values).toMatchObject({ stock: 7, committed: 0, available: 7 });
    expect((await record('Orders', 'SO-0001')).values.state).toBe('To invoice');

    // Invoice: its number and day; due in 15 days, the customer's terms; Budget writes what is to come.
    const invoiced = await press('Orders', 'SO-0001', 'Invoice', { invoice_no: 'A-1001', invoiced_on: '2026-10-21' });
    expect(invoiced.data.record.values).toMatchObject({ status: 'Invoiced', invoice_no: 'A-1001', invoiced_on: '2026-10-21', due: '2026-11-05', state: 'Due Nov 5' });
    // A part paid leaves the rest open; the rest paid, it is Paid.
    const paid = await press('Orders', 'SO-0001', 'Record payment', { amount: 1000, method: 'Card' });
    expect(paid.data.record.values).toMatchObject({ collected: 1000, remaining: 2240, status: 'Invoiced' });
    const rest = await press('Orders', 'SO-0001', 'Record payment');
    expect(rest.data.record.values).toMatchObject({ remaining: 0, status: 'Paid' });
    expect((await record('Budget lines', 'Sales')).values.actual).toBe(3240);

    // Adjust: two damaged; below its reorder level it is low.
    const adjusted = await press('Products', 'PRD-0001', 'Adjust', { counted: 4, reason: 'Damaged' });
    expect(adjusted.data.record.values).toMatchObject({ stock: 4, stock_status: 'Low' });
    const damaged = (await recordsTool(agent, { collection: 'Atlas/Stock movements' })).data.records.find((m) => m.values.reason === 'Damaged')!;
    expect(damaged.values).toMatchObject({ name: 'Adjust · Damaged', direction: 'Out', type: 'adjustment', quantity: 3 });
    // A count lists every product with what there is; Apply writes what differs.
    const count = await save('Stock counts', {});
    const counted = (await recordsTool(agent, { collection: 'Atlas/Count lines' })).data.records;
    expect(counted.map((l) => [l.name, l.values.expected])).toEqual([['Rail', 4]]);
    await save('Count lines', { counted: 5 }, { id: counted[0]!.id });
    const applied = await press('Stock counts', count.data.record.id, 'Apply');
    expect(applied.data.record.values).toMatchObject({ status: 'Applied', differ: 1 });
    expect((await record('Products', 'Rail')).values.stock).toBe(5);
  });

  it('keeps stock by warehouse: a movement finds its stock level, a transfer moves it on', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Depot', templates: ['stock'], answers: { stock: { locations: true, purchasing: false } }, currencies: ['EUR'] });
    const locations = (await recordsTool(agent, { collection: 'Depot/Locations' })).data.records.map((r) => [r.name, r.values.is_default ?? false]);
    expect(locations.sort()).toEqual([['Main warehouse', true], ['Second warehouse', false]]);
    const cable = await saveRecordTool(agent, { collection: 'Depot/Products', values: { name: 'Cable' } });
    const moved = await saveRecordTool(agent, { collection: 'Depot/Stock movements', values: { product: 'Cable', location: 'Main warehouse', direction: 'In', type: 'purchase', quantity: 10 } });
    expect(moved.data.record.values.level).toMatchObject({ name: 'Cable · Main warehouse' });
    const level = (await recordsTool(agent, { collection: 'Depot/Stock levels' })).data.records[0]!;
    expect(level.values).toMatchObject({ stock: 10 });
    const sent = await saveRecordTool(agent, { collection: 'Depot/Products', id: cable.data.record.id, action: 'Transfer', input: { quantity: 4, from: 'Main warehouse', to: 'Second warehouse' } });
    expect(sent.data.record.values.stock).toBe(10);
    const levels = (await recordsTool(agent, { collection: 'Depot/Stock levels' })).data.records.map((r) => [r.name, r.values.stock]);
    expect(levels).toEqual(expect.arrayContaining([['Cable · Main warehouse', 6], ['Cable · Second warehouse', 4]]));
    // Adjust in a warehouse: what it has there is what was counted.
    await saveRecordTool(agent, { collection: 'Depot/Products', id: cable.data.record.id, action: 'Adjust', input: { counted: 3, location: 'Second warehouse' } });
    expect((await recordsTool(agent, { collection: 'Depot/Stock levels' })).data.records.map((r) => [r.name, r.values.stock])).toEqual(expect.arrayContaining([['Cable · Second warehouse', 3]]));
    // A movement with no warehouse is in the default one.
    const plain = await saveRecordTool(agent, { collection: 'Depot/Stock movements', values: { product: 'Cable', direction: 'Out', type: 'use', quantity: 1 } });
    expect(plain.data.record.values).toMatchObject({ location: { name: 'Main warehouse' }, level: { name: 'Cable · Main warehouse' } });
  });

  it('approves an expense onto its budget line, pays it back and rejects another with its reason; a bill that comes again writes the next', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Office', templates: ['budget'], answers: { budget: { expenses: true } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Office/Budget lines', values: { name: 'Travel', planned: 10000 } });
    const taxi = await saveRecordTool(agent, { collection: 'Office/Expenses', values: { name: 'Taxi', amount: 450 } });
    expect(taxi.data.record.values).toMatchObject({ status: 'Submitted', person: 'Kaan', date: '2026-10-21' });
    const approved = await saveRecordTool(agent, { collection: 'Office/Expenses', id: taxi.data.record.id, action: 'Approve', input: { line: 'Travel' } });
    expect(approved.data.record.values).toMatchObject({ status: 'Approved', approved_by: 'Kaan', budget_line: expect.objectContaining({ name: 'Travel' }) });
    const payment = (await recordsTool(agent, { collection: 'Office/Payments' })).data.records[0]!;
    expect(payment.values).toMatchObject({ name: 'Taxi · Kaan', direction: 'Out', amount: 450, status: 'Planned', party: 'Kaan', due: '2026-10-21' });
    await saveRecordTool(agent, { collection: 'Office/Payments', id: payment.id, action: 'Mark paid', input: { paid: 450, how: 'Card' } });
    expect((await recordsTool(agent, { collection: 'Office/Expenses' })).data.records[0]!.values.status).toBe('Reimbursed');
    expect((await recordsTool(agent, { collection: 'Office/Budget lines' })).data.records[0]!.values).toMatchObject({ actual: 450, remaining: 9550, actual_year: 450, over: false });
    const dinner = await saveRecordTool(agent, { collection: 'Office/Expenses', values: { name: 'Dinner', amount: 2000 } });
    const needed = await refusal(saveRecordTool(agent, { collection: 'Office/Expenses', id: dinner.data.record.id, action: 'Reject' }));
    expect(needed.message).toMatch(/Why/);
    const rejected = await saveRecordTool(agent, { collection: 'Office/Expenses', id: dinner.data.record.id, action: 'Reject', input: { reason: 'Not a work dinner' } });
    expect(rejected.data.record.values).toMatchObject({ status: 'Rejected', reason: 'Not a work dinner' });

    // A bill that comes again: paid in part, the rest left to pay; paid in full, the next one is added a month on.
    const rent = await saveRecordTool(agent, { collection: 'Office/Payments', values: { name: 'Office rent', direction: 'Out', amount: 4000, due: '2026-10-01', repeats: 'Monthly', budget_line: 'Travel', party: 'Kaya Emlak' } });
    expect(rent.data.record.values).toMatchObject({ overdue: true, due_said: 'Overdue 20 days' });
    await saveRecordTool(agent, { collection: 'Office/Payments', id: rent.data.record.id, action: 'Mark paid', input: { paid: 1000 } });
    await saveRecordTool(agent, { collection: 'Office/Payments', id: rent.data.record.id, action: 'Mark paid' }).catch(() => null);
    const rents = (await recordsTool(agent, { collection: 'Office/Payments', where: [{ field: 'name', op: 'is', value: 'Office rent' }] })).data.records.map((r) => [r.values.amount, r.values.status, r.values.due]);
    expect(rents).toEqual(expect.arrayContaining([[1000, 'Paid', '2026-10-01'], [3000, 'Planned', '2026-10-01'], [1000, 'Planned', '2026-11-01']]));
  });

  it('starts a project with its milestones and budget lines, posts its updates with what moved, and closes it with its open cards dropped', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Lifts', templates: ['projects'], answers: { projects: { budget: true, time: true } }, currencies: ['TRY'] });
    const project = await saveRecordTool(agent, { collection: 'Lifts/Projects', values: { name: 'Antalya Hotel', customer: 'Lara Turizm', contract: 1000000, start: '2026-10-21', end: '2027-01-29' } });
    expect(project.data.record.values).toMatchObject({ code: 'PRJ-0001', status: 'Planned', owner: 'Kaan', health: 'On track' });
    const read = async () => (await recordsTool(agent, { collection: 'Lifts/Projects' })).data.records[0]!.values;
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Lifts/Projects', id: 'PRJ-0001', action, ...(input && { input: input as never }) });
    // Its milestones spread over its hundred days; the next one said on its row.
    await press('Start project');
    expect(await read()).toMatchObject({ status: 'Active', budget: 900000, next_ms: 'Kickoff', next_ms_day: '2026-11-15', next_said: 'Kickoff · Nov 15', due_said: 'Due Jan 29' });
    const milestones = (await recordsTool(agent, { collection: 'Lifts/Milestones', sort: { field: 'due' } })).data.records;
    expect(milestones.map((m) => [m.name, m.values.due])).toEqual([
      ['Kickoff', '2026-11-15'],
      ['Planning', '2026-12-10'],
      ['Delivery', '2027-01-04'],
      ['Review', '2027-01-29'],
    ]);
    await saveCardTool(agent, {}, { board: 'Lifts/Work', title: 'Survey', column: 'Done', values: { project: 'Antalya Hotel' } });
    await saveCardTool(agent, {}, { board: 'Lifts/Work', title: 'Rails', values: { project: 'Antalya Hotel' } });
    expect(await read()).toMatchObject({ cards: 2, open_cards: 1, progress: 0.5, progress_said: '1 of 2' });
    // An update keeps the health and says by itself how far it got, and whether its end moved.
    await press('Post update', { health: 'At risk', note: 'The rails are late.' });
    expect(await read()).toMatchObject({ health: 'At risk', last_update: '2026-10-21', last_progress: 0.5, update_on: '2026-10-28' });
    await saveRecordTool(agent, { collection: 'Lifts/Projects', id: 'PRJ-0001', values: { end: '2027-02-12' } });
    await press('Post update', { health: 'On track', note: 'The rails came.' });
    const updates = (await recordsTool(agent, { collection: 'Lifts/Project updates' })).data.records.map((u) => [u.name, u.values.health, u.values.progress_note]);
    expect(updates).toEqual(
      expect.arrayContaining([
        ['The rails are late.', 'At risk', '50% done · Kickoff · Nov 15'],
        ['The rails came.', 'On track', '50% done (was 50%) · end moved to Feb 12 · Kickoff · Nov 15'],
      ]),
    );
    // A milestone done: the next one is said.
    await saveRecordTool(agent, { collection: 'Lifts/Milestones', id: milestones[0]!.id, action: 'Done' });
    expect(await read()).toMatchObject({ next_ms: 'Planning', next_said: 'Planning · Dec 10' });
    await press('Track time', { note: 'Survey', hours: 6 });
    expect(await read()).toMatchObject({ hours: 6 });
    // Closed, its card still open is dropped.
    const closed = await press('Close project', { ended: 'Done', cards: 'Drop them', note: 'Handed over.' });
    expect(closed.data.record.values).toMatchObject({ status: 'Done' });
    const board = JSON.parse(await fs.readText('Lifts/Work.board.json'));
    const column = (id: string) => board.columns.find((c: { id: string; name: string }) => c.id === id).name;
    expect(board.cards.map((c: { title: string; column: string }) => [c.title, column(c.column)])).toEqual([
      ['Survey', 'Done'],
      ['Rails', 'Dropped'],
    ]);
  });

  it('sells on a channel: shipped by the day its channel gives, what it earns and when it is paid out, items returned back into stock and paid back', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Shop', templates: ['sales', 'ecommerce', 'stock', 'budget'], currencies: ['TRY'], answers: { sales: { tax: false } } });
    await saveRecordTool(agent, { collection: 'Shop/Channels', id: 'Amazon', values: { commission: 0.2, fee: 5, payout_days: 7, ship_days: 2 } });
    await saveRecordTool(agent, { collection: 'Shop/Products', values: { name: 'Lamp', price: 100, cost: 40 } });
    const order = await saveRecordTool(agent, { collection: 'Shop/Orders', values: { channel: 'Amazon', marketplace_no: '1029', status: 'Confirmed', shipping_cost: 10 } });
    const id = order.data.record.id;
    const code = order.data.record.values.code as string;
    // Its day to ship is its channel's: two days on.
    expect(order.data.record.values).toMatchObject({ ship_by: '2026-10-23', to_ship: true, ship_said: 'Fri, Oct 23' });
    await saveRecordTool(agent, { collection: 'Shop/Order lines', values: { name: 'Lamp', order: code, product: 'Lamp', quantity: 2, unit_price: 100 } });
    const read = async () => (await recordsTool(agent, { collection: 'Shop/Orders' })).data.records.find((r) => r.id === id)!;
    // 200 less a commission of 20% and 5, the shipping and what the lamps cost.
    expect((await read()).values).toMatchObject({ total: 200, commission: 45, cost: 80, net_profit: 65, items: ['Lamp × 2'], profit_said: '₺200 · commission ₺45 · shipping ₺10 · cost ₺80 → ₺65 profit · 33%' });
    // Late, it says so.
    await saveRecordTool(agent, { collection: 'Shop/Orders', id, values: { ship_by: '2026-10-20' } });
    expect((await read()).values).toMatchObject({ ship_late: true, ship_said: '1 day late' });
    const shipped = await saveRecordTool(agent, { collection: 'Shop/Orders', id, action: 'Ship', input: { carrier: 'DHL', tracking: 'JD0001' } });
    expect(shipped.data.record.values).toMatchObject({ status: 'Shipped', carrier: 'DHL', tracking: 'JD0001', shipped_on: '2026-10-21', to_ship: false });
    await saveRecordTool(agent, { collection: 'Shop/Orders', id, values: { status: 'Delivered' } });
    expect((await read()).values).toMatchObject({ delivered_on: '2026-10-21', payout: 155, payout_said: 'Payout ₺155 on Oct 28, 7 days after it is delivered' });
    const payout = (await recordsTool(agent, { collection: 'Shop/Payments' })).data.records.find((p) => p.name === `${code} payout`)!;
    expect(payout.values).toMatchObject({ direction: 'In', amount: 155, status: 'Planned', due: '2026-10-28', order: { id } });
    // Paid, it leaves nothing to collect: the channel kept its commission.
    await saveRecordTool(agent, { collection: 'Shop/Payments', id: payout.id, values: { status: 'Paid' } });
    expect((await read()).values).toMatchObject({ collected: 155, remaining: 0 });
    // The lamps of a cancelled order are not sold.
    const cancelled = await saveRecordTool(agent, { collection: 'Shop/Orders', values: { channel: 'Amazon', status: 'Cancelled' } });
    await saveRecordTool(agent, { collection: 'Shop/Order lines', values: { name: 'Lamp', order: cancelled.data.record.values.code as string, product: 'Lamp', quantity: 5, unit_price: 100 } });
    expect((await recordsTool(agent, { collection: 'Shop/Products' })).data.records[0]!.values).toMatchObject({ sold: 2, profit: 120 });
    // Return: the items that come back and why; its refund from them.
    await saveRecordTool(agent, { collection: 'Shop/Orders', id, action: 'Return', input: { items: [{ row: 'Lamp', count: 1, why: 'Damaged' }] } });
    const back = (await recordsTool(agent, { collection: 'Shop/Returns' })).data.records[0]!;
    expect(back.values).toMatchObject({ name: 'Return of 1029', order: { id }, product: { name: 'Lamp' }, quantity: 1, reason: 'Damaged', refund: 100, status: 'Requested', channel: { name: 'Amazon' } });
    await saveRecordTool(agent, { collection: 'Shop/Returns', id: back.id, action: 'Received', input: { restock: true } });
    const moves = (await recordsTool(agent, { collection: 'Shop/Stock movements' })).data.records;
    expect(moves.filter((m) => m.values.type === 'return').map((m) => [m.values.direction, m.values.quantity])).toEqual([['In', 1]]);
    await saveRecordTool(agent, { collection: 'Shop/Returns', id: back.id, action: 'Refunded' });
    const refund = (await recordsTool(agent, { collection: 'Shop/Payments' })).data.records.find((p) => p.values.direction === 'Out')!;
    expect(refund.values).toMatchObject({ amount: 100, status: 'Paid', return: { id: back.id } });
  });

  it('books an appointment from its service, and writes it as a payment when it is done', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Clinic', templates: ['appointments', 'budget'], currencies: ['TRY'] });
    const visit = await saveRecordTool(agent, { collection: 'Clinic/Appointments', values: { name: 'Consultation with Can', start: '2026-10-22T10:00', service: 'Consultation', price: 500 } });
    expect(visit.data.record.values).toMatchObject({ duration: 30, status: 'Booked', ends: '2026-10-22T10:30' });
    const id = visit.data.record.id;
    expect((await saveRecordTool(agent, { collection: 'Clinic/Appointments', id, action: 'Confirm' })).data.record.values.status).toBe('Confirmed');
    const moved = await saveRecordTool(agent, { collection: 'Clinic/Appointments', id, action: 'Reschedule', input: { start: '2026-10-23T11:00' } });
    expect(moved.data.record.values).toMatchObject({ start: '2026-10-23T11:00', status: 'Booked' });
    await saveRecordTool(agent, { collection: 'Clinic/Appointments', id, action: 'Done' });
    const payments = (await recordsTool(agent, { collection: 'Clinic/Payments' })).data.records;
    expect(payments).toHaveLength(1);
    expect(payments[0]!.values).toMatchObject({ name: 'Consultation with Can', direction: 'In', amount: 500, status: 'Invoiced', appointment: { id }, budget_line: { name: 'Appointments' } });
  });

  it('books from a customer at a time it says is free, reminds them the day before, and books the next visit when one is done', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Studio', templates: ['appointments'], answers: { appointments: { by: 'team', staff: ['Ayşe'], services: ['Massage 60'] } }, currencies: ['TRY'] });
    const can = await saveRecordTool(agent, { collection: 'Studio/People', values: { name: 'Can Demir', phone: '+90 532 444 55 66' } });
    const canId = can.data.record.id;
    const ayse = (await recordsTool(agent, { collection: 'Studio/Staff' })).data.records[0]!;
    const massage = (await recordsTool(agent, { collection: 'Studio/Services' })).data.records[0]!;
    await saveRecordTool(agent, { collection: 'Studio/People', id: canId, action: 'Book', input: { service: 'Massage', staff: 'Ayşe', when: '2026-10-22T10:00' } });
    const booked = (await recordsTool(agent, { collection: 'Studio/Appointments' })).data.records[0]!;
    expect(booked).toMatchObject({ name: 'Can Demir · Massage', values: expect.objectContaining({ duration: 60, status: 'Booked', ends: '2026-10-22T11:00', remind_on: '2026-10-21', remind_said: 'tomorrow 10:00 · Massage with Ayşe · +90 532 444 55 66' }) });
    // Book says the times still free that day, the hour booked and those that would run into it gone.
    const asked = askOf(await fs.readText('Studio/People/_rules.js'), 'Book', 'Studio/People', canId, await ruleSpaceNow(fs, '2026-10-21', 'Kaan'), {
      service: { id: massage.id, name: 'Massage' },
      staff: { id: ayse.id, name: 'Ayşe' },
      when: '2026-10-22T09:00',
    })!;
    expect(asked.questions.find((q) => q.key === 'when')!.note).toBe('Free: 09:00, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00');
    // The day before, whom to remind, with Reminded.
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-21' })).data.records as { view: string; record: { name: string } }[];
    expect(due.filter((d) => d.view === 'To remind').map((d) => d.record.name)).toEqual(['Can Demir · Massage']);
    const press = (id: string, action: string, input?: object) => saveRecordTool(agent, { collection: 'Studio/Appointments', id, action, ...(input && { input: input as never }) });
    expect((await press(booked.id, 'Reminded')).data.record.values.status).toBe('Confirmed');
    // Done: the next visit two weeks on, the same time with the same person.
    await press(booked.id, 'Done', { next: 'In 2 weeks' });
    const all = (await recordsTool(agent, { collection: 'Studio/Appointments', sort: { field: 'start' } })).data.records;
    expect(all.map((r) => [r.name, r.values.start, r.values.status, (r.values.staff as { name: string }).name])).toEqual([
      ['Can Demir · Massage', '2026-10-22T10:00', 'Done', 'Ayşe'],
      ['Can Demir · Massage', '2026-11-05T10:00', 'Booked', 'Ayşe'],
    ]);
    const person = (await recordsTool(agent, { collection: 'Studio/People' })).data.records[0]!.values;
    expect(person).toMatchObject({ visits: 1, no_shows: 0, visits_said: '1 visit · last Oct 22 · next Nov 5' });
    // No-show only once its time has come.
    expect((await refusal(press(all[1]!.id, 'No-show'))).message).toMatch(/Only one whose time has come/);
  });

  it('keeps a membership on its plan: renewed a period on with its payment, past due when its day has passed, its plan changed, paused and cancelled at the end of its term', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Gym', templates: ['subscriptions', 'budget'], answers: { subscriptions: { sells: 'memberships', plans: ['Monthly', 'Yearly'], customers: 'people' } }, currencies: ['TRY'] });
    const plans = (await recordsTool(agent, { collection: 'Gym/Plans' })).data.records;
    const planId = (name: string) => plans.find((p) => p.name === name)!.id;
    await saveRecordTool(agent, { collection: 'Gym/Plans', id: planId('Monthly'), values: { price: 600 } });
    await saveRecordTool(agent, { collection: 'Gym/Plans', id: planId('Yearly'), values: { price: 6000 } });
    await saveRecordTool(agent, { collection: 'Gym/People', values: { name: 'Ayşe Yılmaz' } });
    await saveRecordTool(agent, { collection: 'Gym/People', values: { name: 'Can Demir' } });

    // A new one takes its amount, its period, its name and its renewal day from its plan.
    const ayse = await saveRecordTool(agent, { collection: 'Gym/Memberships', values: { customer: 'Ayşe Yılmaz', plan: 'Yearly', start: '2026-09-01' } });
    expect(ayse.data.record).toMatchObject({ name: 'Ayşe Yılmaz', values: expect.objectContaining({ amount: 6000, period: 'Yearly', renews: '2027-09-01', status: 'Active', monthly_value: 500, when_said: 'Renews Sep 1' }) });
    const id = ayse.data.record.id;
    const renewed = await saveRecordTool(agent, { collection: 'Gym/Memberships', id, action: 'Renew' });
    expect(renewed.data.record.values.renews).toBe('2028-09-01');
    const payments = (await recordsTool(agent, { collection: 'Gym/Payments' })).data.records;
    expect(payments.map((p) => p.values)).toEqual([expect.objectContaining({ direction: 'In', amount: 6000, status: 'Invoiced', due: '2027-09-01', budget_line: expect.objectContaining({ name: 'Memberships' }), subscription: expect.objectContaining({ id }) })]);
    expect((await recordsTool(agent, { collection: 'Gym/Plans', where: [{ field: 'name', op: 'is', value: 'Yearly' }] })).data.records[0]!.values).toMatchObject({ active: 1, monthly_value: 500 });

    // One whose renewal day has passed is past due; its plan changed now writes the change of the MRR.
    const can = await saveRecordTool(agent, { collection: 'Gym/Memberships', values: { customer: 'Can Demir', plan: 'Monthly', start: '2026-08-15' } });
    expect(can.data.record.values).toMatchObject({ renews: '2026-09-15', past_due: true, when_said: 'Past due 36 days' });
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Gym/Memberships', id: can.data.record.id, action, ...(input && { input: input as never }) });
    expect((await press('Change plan', { to: 'Yearly', from: 'Now' })).data.record.values).toMatchObject({ amount: 6000, period: 'Yearly', monthly_value: 500 });
    const paused = (await press('Pause', { until: '2026-12-01' })).data.record.values;
    expect(paused).toMatchObject({ status: 'Paused', paused_until: '2026-12-01', when_said: 'Paused until Dec 1' });
    expect((await press('Resume')).data.record.values).toMatchObject({ status: 'Active', renews: '2026-10-21' });
    const ending = await press('Cancel membership', { when: 'At end of term', why: 'Too expensive' });
    expect(ending.data.record.values).toMatchObject({ status: 'Non-renewing', cancelled_on: '2026-10-21', reason: 'Too expensive' });
    expect((await press('End')).data.record.values.status).toBe('Cancelled');
    const history = (await recordsTool(agent, { collection: 'Gym/Subscription history' })).data.records.filter((e) => e.values.subscription && (e.values.subscription as { id: string }).id === can.data.record.id).map((e) => [e.values.kind, e.values.mrr_change]);
    expect(history).toEqual(expect.arrayContaining([['New', 600], ['Downgrade', -100], ['Paused', -500], ['Resumed', 500], ['Cancelled', -500]]));
    expect((await recordsTool(agent, { collection: 'Gym/People', where: [{ field: 'name', op: 'is', value: 'Can Demir' }] })).data.records[0]!.values).toMatchObject({ active_memberships: 0 });
  });

  it('keeps contracts: signed from a draft, its notice day in Today, renewed by itself or for another price, given notice and its payment stopped', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Office', templates: ['contracts', 'budget'], currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Office/Companies', values: { name: 'Kule Gayrimenkul' } });
    await saveRecordTool(agent, { collection: 'Office/Companies', values: { name: 'Ofis Teknik' } });
    await saveRecordTool(agent, { collection: 'Office/Budget lines', values: { name: 'Maintenance', type: 'Expense', planned: 2000 } });
    const read = async (id: string) => (await recordsTool(agent, { collection: 'Office/Contracts' })).data.records.find((r) => r.id === id)!.values;
    const lease = await saveRecordTool(agent, { collection: 'Office/Contracts', values: { name: 'Office lease', party: 'Kule Gayrimenkul', type: 'Lease', start: '2026-01-01', ends: '2026-12-31', amount: 40000, period: 'Monthly' } });
    const leaseId = lease.data.record.id;
    // Its notice day is its end less 30 days, to decide within 60 days.
    expect(await read(leaseId)).toMatchObject({ status: 'Active', owner: 'Kaan', renews: 'By itself', term: '1 year', notice_days: 30, cancel_by: '2026-12-01', yearly: 480000, deciding: true, to_decide: true, when_said: 'Renews Dec 31 · notice by Dec 1' });
    const copier = await saveRecordTool(agent, { collection: 'Office/Contracts', values: { name: 'Copier service', party: 'Ofis Teknik', type: 'Service', start: '2025-11-11', ends: '2026-11-10', amount: 12000 } });
    const copierId = copier.data.record.id;
    // Its notice day gone by, it renews: nothing to decide.
    expect(await read(copierId)).toMatchObject({ period: 'Yearly', cancel_by: '2026-10-11', deciding: false, when_said: 'Renews Nov 10' });
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-12-31' })).data.records as { view: string; start: string; record: { name: string } }[];
    expect(due.filter((d) => d.view === 'Notice by').map((d) => [d.record.name, d.start])).toEqual([['Office lease', '2026-12-01']]);
    // Pressed by itself on its end day: another year at the same price.
    await saveRecordTool(agent, { collection: 'Office/Contracts', id: copierId, action: 'Renew' });
    expect(await read(copierId)).toMatchObject({ start: '2026-11-10', ends: '2027-11-10', cancel_by: '2027-10-11' });
    // Renewed by hand, for another price: its history says by how much.
    await saveRecordTool(agent, { collection: 'Office/Contracts', id: leaseId, action: 'Renew', input: { until: '2028-01-01', price: 42000 } });
    expect(await read(leaseId)).toMatchObject({ start: '2026-12-31', ends: '2028-01-01', amount: 42000, yearly: 504000 });
    const history = (await recordsTool(agent, { collection: 'Office/Contract history' })).data.records.map((e) => [e.name, e.values.kind, e.values.change ?? null]);
    expect(history).toEqual(expect.arrayContaining([['Renewed by itself to Nov 10, 2027', 'Renewed by itself', 0], ['Renewed to Jan 1, 2028', 'Renewed', 24000]]));
    // A draft out for signature, then signed: its cost a payment in Budget that comes again.
    const draft = await saveRecordTool(agent, { collection: 'Office/Contracts', values: { name: 'Lift maintenance', party: 'Ofis Teknik', type: 'Service', status: 'Draft', amount: 300, period: 'Monthly' } });
    const draftId = draft.data.record.id;
    await saveRecordTool(agent, { collection: 'Office/Contracts', id: draftId, action: 'Send for signature' });
    expect(await read(draftId)).toMatchObject({ status: 'Out for signature', sent_on: '2026-10-21', when_said: 'Sent today' });
    await saveRecordTool(agent, { collection: 'Office/Contracts', id: draftId, action: 'Signed', input: { on: '2026-10-21', starts: '2026-11-01', until: '2027-10-31', line: 'Maintenance' } });
    expect(await read(draftId)).toMatchObject({ status: 'Active', signed_on: '2026-10-21', start: '2026-11-01', ends: '2027-10-31' });
    const payment = async () => (await recordsTool(agent, { collection: 'Office/Payments' })).data.records.find((p) => p.name === 'Lift maintenance')!.values;
    expect(await payment()).toMatchObject({ direction: 'Out', amount: 300, due: '2026-11-01', repeats: 'Monthly', budget_line: { name: 'Maintenance' }, contract: { id: draftId } });
    // Given notice, it ends on its day by itself, and its payment comes no more.
    await saveRecordTool(agent, { collection: 'Office/Contracts', id: draftId, action: 'Give notice', input: { how: 'Letter' } });
    expect(await read(draftId)).toMatchObject({ status: 'Notice given', notice_on: '2026-10-21', notice_how: 'Letter', ends_itself: true, when_said: 'Ends Oct 31' });
    expect((await payment()).repeats ?? null).toBeNull();
    await saveRecordTool(agent, { collection: 'Office/Contracts', id: draftId, action: 'End' });
    expect(await read(draftId)).toMatchObject({ status: 'Ended', ended_on: '2026-10-21' });
  });

  it('keeps leave: its days without weekends and holidays, approved and counted, marked when it overlaps or goes past the days left, half a day asked, carried over', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Team', templates: ['timeoff'], answers: { timeoff: { holidays: 'tr' } } });
    expect((await recordsTool(agent, { collection: 'Team/Holidays' })).data.total).toBe(28);
    await saveRecordTool(agent, { collection: 'Team/Employees', values: { name: 'Ayşe Yılmaz', team: 'Platform' } });
    const leave = (values: object) => saveRecordTool(agent, { collection: 'Team/Leave requests', values: { employee: 'Ayşe Yılmaz', ...values } });

    // Monday to Friday, less Republic Day on the Thursday.
    const autumn = await leave({ first: '2026-10-26', last: '2026-10-30' });
    expect(autumn.data.record).toMatchObject({ name: 'Ayşe Yılmaz · Annual', values: expect.objectContaining({ type: 'Annual', days: 4, status: 'Requested' }) });
    const approved = await saveRecordTool(agent, { collection: 'Team/Leave requests', id: autumn.data.record.id, action: 'Approve' });
    expect(approved.data.record.values).toMatchObject({ status: 'Approved', approved_by: 'Kaan' });
    const ayse = async () => (await recordsTool(agent, { collection: 'Team/Employees', where: [{ field: 'name', op: 'is', value: 'Ayşe Yılmaz' }] })).data.records[0]!.values;
    
    expect(await ayse()).toMatchObject({ allowance: 20, used: 4, left: 16 });

    const oneDay = await leave({ first: '2026-10-29', type: 'Sick' });
    expect(oneDay.data.record.values).toMatchObject({ last: '2026-10-29', days: 0 });
    expect(oneDay.data.record.problems).toEqual([{ kind: 'check', field: 'first', text: 'Overlaps with Ayşe Yılmaz · Annual' }]);
    const rejected = await saveRecordTool(agent, { collection: 'Team/Leave requests', id: oneDay.data.record.id, action: 'Reject', input: { reason: 'A holiday anyway' } });
    expect(rejected.data.record.values).toMatchObject({ status: 'Rejected', note: 'A holiday anyway' });
    expect(rejected.data.record.problems).toBeUndefined();
    const long = await leave({ first: '2026-11-09', last: '2026-12-31' });
    expect(long.data.record.values.days).toBe(39);
    expect(long.data.record.problems).toEqual([{ kind: 'check', field: 'days', text: 'More than the days left: 16' }]);

    // Who is away, in Upcoming.
    const due = (await dueRecordsTool(agent, { from: '2026-10-26', to: '2026-10-30' })).data.records as { start: string; end: string; record: { name: string } }[];
    expect(due.map((d) => [d.record.name, d.start, d.end])).toEqual([['Ayşe Yılmaz · Annual', '2026-10-26', '2026-10-30']]);

    // Request leave on her screen: the morning of one day is half a day, said with what is left after.
    const ayseId = (await recordsTool(agent, { collection: 'Team/Employees' })).data.records[0]!.id;
    await saveRecordTool(agent, { collection: 'Team/Employees', id: ayseId, action: 'Request leave', input: { type: 'Annual', first: '2026-11-04', part: 'Morning' } });
    const morning = (await recordsTool(agent, { collection: 'Team/Leave requests' })).data.records.find((r) => r.values.first === '2026-11-04')!;
    expect(morning).toMatchObject({ name: 'Ayşe Yılmaz · Annual', values: expect.objectContaining({ last: '2026-11-04', part: 'Morning', days: 0.5, status: 'Requested', requested_on: '2026-10-21', when_said: 'Nov 4 · morning', left_said: '0.5 days · 15.5 left after' }) });
    expect(await ayse()).toMatchObject({ requested: 39.5, said: 'Platform · 16 days left of 20 · 39.5 requested · next away Oct 26' });
    // At the end of the year, what is left goes to the next, up to 5 days.
    await saveRecordTool(agent, { collection: 'Team/Employees', id: ayseId, action: 'Carry over' });
    expect(await ayse()).toMatchObject({ carried: 5, carried_for: 2027, allowed: 20 });
  });

  it('measures a goal by its key results and its project, works out whether it is on track, checks in every result at once and carries it over', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Plan', templates: ['projects', 'product', 'goals'] });
    const goal = await saveRecordTool(agent, { collection: 'Plan/Goals', values: { name: 'Grow revenue' } });
    const id = goal.data.record.id;
    const read = async () => (await recordsTool(agent, { collection: 'Plan/Goals' })).data.records.find((r) => r.id === id)!.values;
    // The quarter it is set in; 20 of its 91 days gone, nothing done: Behind.
    expect(await read()).toMatchObject({ starts: '2026-10-01', ends: '2026-12-31', period: '2026 Q4', owner: 'Kaan', status: 'Behind', checkin_on: '2026-10-08', checkin_due: true, checkin_said: 'Check-in due' });
    expect(((await read()).expected as number).toFixed(3)).toBe('0.220');
    await saveRecordTool(agent, { collection: 'Plan/Projects', values: { name: 'New site' } });
    await saveCardTool(agent, {}, { board: 'Plan/Work', title: 'Design', column: 'Done', values: { project: 'New site' } });
    await saveCardTool(agent, {}, { board: 'Plan/Work', title: 'Build', values: { project: 'New site' } });
    const kr = (values: object) => saveRecordTool(agent, { collection: 'Plan/Key results', values: { goal: 'Grow revenue', ...values } });
    await kr({ name: 'MRR', kind: 'Money', start: 11500, target: 15000, current: 12200 });
    await kr({ name: 'New customers', target: 12, current: 5, unit: 'customers' });
    await kr({ name: 'Pricing page live', kind: 'Done or not' });
    const site = await kr({ name: 'Site live', kind: "Project's progress", project: 'New site' });
    expect(site.data.record.values).toMatchObject({ progress: 0.5 });
    // On average 0.2, 0.42, 0 and 0.5: ahead of where it should be.
    expect(await read()).toMatchObject({ kr_count: 4, status: 'On track' });
    // Every key result at once: those not given stay; the owner says otherwise until the next check-in.
    await saveRecordTool(agent, { collection: 'Plan/Goals', id, action: 'Check in', input: { results: [{ row: 'MRR', count: 12900 }, { row: 'New customers', count: 7 }], status: 'At risk', note: 'Two deals slipped.' } });
    expect(await read()).toMatchObject({ call: 'At risk', status: 'At risk', last_check_in: '2026-10-21', checkin_on: '2026-10-28', checkin_due: false });
    const results = (await recordsTool(agent, { collection: 'Plan/Key results' })).data.records.map((r) => [r.name, r.values.current ?? null]);
    expect(results).toEqual(expect.arrayContaining([['MRR', 12900], ['New customers', 7], ['Pricing page live', 0]]));
    const checkIn = (await recordsTool(agent, { collection: 'Plan/Check-ins' })).data.records[0]!;
    expect(checkIn.values).toMatchObject({ status: 'At risk', note: 'Two deals slipped.', day: '2026-10-21' });
    expect(checkIn.name).toBe('At risk · 37%');
    expect(checkIn.values.changes).toMatch(/MRR .*12.200 → .*12.900/);
    expect(checkIn.values.changes).toContain('New customers 5 customers → 7 customers');
    // Closed incomplete, carried over to the next quarter with what is left.
    await saveRecordTool(agent, { collection: 'Plan/Goals', id, action: 'Close goal', input: { result: 'Incomplete', learned: 'Start sooner.', carry: true } });
    expect(await read()).toMatchObject({ result: 'Incomplete', status: 'Incomplete', closed_on: '2026-10-21' });
    const next = (await recordsTool(agent, { collection: 'Plan/Goals' })).data.records.find((r) => r.id !== id)!;
    expect(next.values).toMatchObject({ name: 'Grow revenue', starts: '2027-01-01', ends: '2027-03-31', period: '2027 Q1' });
    const carried = (await recordsTool(agent, { collection: 'Plan/Key results' })).data.records.filter((r) => (r.values.goal as { id: string }).id === next.id).map((r) => [r.name, r.values.start ?? null]);
    expect(carried).toEqual(expect.arrayContaining([['MRR', 12900], ['New customers', 7], ['Pricing page live', 0], ['Site live', 0]]));
    const roadmap = JSON.parse(await fs.readText('Plan/Roadmap.board.json'));
    expect(roadmap.fields.find((f: { key: string }) => f.key === 'goal')).toMatchObject({ type: 'link', collection: 'Plan/Goals' });
  });

  it('keeps an incident: resolved with its end, an action on the board, marked when closed without its root cause', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Ops', templates: ['support', 'incidents'] });
    const made = await saveRecordTool(agent, { collection: 'Ops/Incidents', values: { name: 'API down', type: 'Outage', started: '2026-10-21T00:00' } });
    expect(made.data.record.values).toMatchObject({ severity: 'Major', status: 'Open', owner: 'Kaan' });
    const id = made.data.record.id;
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Ops/Incidents', id, action, ...(input && { input: input as never }) });
    // Resolved now: today, at this device's time.
    const resolved = (await press('Resolve')).data.record.values;
    expect(resolved).toMatchObject({ status: 'Resolved', ended: expect.stringMatching(/^2026-10-21T\d\d:\d\d$/) });
    const ended = resolved.ended as string;
    expect(resolved.duration).toBe(Number(ended.slice(11, 13)) * 60 + Number(ended.slice(14, 16)));
    const acted = await press('Add action', { title: 'Alert on error rate', who: 'Kaan', due: '2026-10-28' });
    expect(acted.data.record.values.open_actions).toBe(1);
    const board = JSON.parse(await fs.readText('Ops/Actions.board.json'));
    expect(board.cards.map((c: { title: string; due: string; assignee: { name: string }; values: { incident: { id: string } } }) => [c.title, c.due, c.assignee.name, c.values.incident.id])).toEqual([['Alert on error rate', '2026-10-28', 'Kaan', id]]);
    const closed = await press('Close');
    expect(closed.data.record.problems).toEqual([{ kind: 'check', field: 'root_cause', text: 'Closed without its root cause' }]);
    const requests = JSON.parse(await fs.readText('Ops/Requests/_collection.json'));
    expect(requests.fields.find((f: { key: string }) => f.key === 'incident')).toMatchObject({ type: 'link', collection: 'Ops/Incidents' });
  });

  it('answers a request: its reply due, Reply and Customer wrote in its conversation, not due once solved', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Help', templates: ['crm', 'support'], answers: { support: { due: '4h' } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Help/Companies', values: { name: 'Acme' } });
    await saveRecordTool(agent, { collection: 'Help/People', values: { name: 'Ayşe Kaya', company: 'Acme' } });
    const made = await saveRecordTool(agent, { collection: 'Help/Requests', values: { name: 'Lift stops', person: 'Ayşe Kaya', channel: 'email', asked: '2026-10-21T09:00', message: 'It stopped between floors.' } });
    expect(made.data.record.values).toMatchObject({ code: 'RQ-0001', company: expect.objectContaining({ name: 'Acme' }), status: 'New', reply_due: '2026-10-21T13:00' });
    expect(made.data.record.values.message ?? null).toBeNull();
    const id = made.data.record.id;
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Help/Requests', id, action, ...(input && { input: input as never }) });
    const replied = (await press('Reply', { text: 'Ahmet is on his way.', then: 'Waiting on customer' })).data.record.values;
    expect(replied).toMatchObject({ status: 'Waiting on customer', assignee: 'Kaan' });
    expect(replied.reply_due ?? null).toBeNull();
    expect(replied.waiting_since).toMatch(/^2026-10-21T/);
    const wrote = (await press('Customer wrote', { text: 'It happened again.' })).data.record.values;
    expect(wrote).toMatchObject({ status: 'Open' });
    expect(wrote.waiting_since ?? null).toBeNull();
    expect(wrote.reply_due).toMatch(/^2026-10-21T/);
    await press('Note', { text: 'Ahmet is near after 11.' });
    const said = (await recordsTool(agent, { collection: 'Help/Messages' })).data.records.map((m) => [m.values.kind, m.values.by, m.values.text]);
    expect(said).toEqual(
      expect.arrayContaining([
        ['Customer', 'Ayşe Kaya', 'It stopped between floors.'],
        ['Us', 'Kaan', 'Ahmet is on his way.'],
        ['Customer', 'Ayşe Kaya', 'It happened again.'],
        ['Note', 'Kaan', 'Ahmet is near after 11.'],
      ]),
    );
    expect(said).toHaveLength(4);
    // Solved, its reply is not due.
    await saveRecordTool(agent, { collection: 'Help/Requests', id, values: { status: 'Solved' } });
    const solved = (await recordsTool(agent, { collection: 'Help/Requests' })).data.records[0]!.values;
    expect(solved.reply_due ?? null).toBeNull();
    expect(solved.late).toBe(false);
    const schema = JSON.parse((await readTool(agent, { path: 'Help/Requests/_collection.json' })).data.text);
    expect(schema.views.filter((v: { set?: string }) => v.set === 'requests').map((v: { name: string }) => v.name)).toEqual(['Mine', 'Unassigned', 'Waiting on customer', 'Solved']);
  });

  it('runs a job at a customer’s site: its checklist, scheduled, marked when it overlaps, completed with its labour and signature, parts out of stock, the next service planned, invoiced onto an order', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Lifts', templates: ['crm', 'sales', 'stock', 'field'], answers: { field: { technicians: ['Ali'] } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Lifts/Companies', values: { name: 'Atakule' } });
    await saveRecordTool(agent, { collection: 'Lifts/Products', values: { name: 'Door sensor', price: 100 } });
    await saveRecordTool(agent, { collection: 'Lifts/Stock movements', values: { product: 'Door sensor', direction: 'In', quantity: 10 } });
    const ali = (await recordsTool(agent, { collection: 'Lifts/Technicians' })).data.records[0]!;
    await saveRecordTool(agent, { collection: 'Lifts/Technicians', id: ali.id, values: { rate: 400 } });
    await saveRecordTool(agent, { collection: 'Lifts/Equipment', values: { name: 'Lift A', customer: 'Atakule', address: 'Çankaya', interval: 'Every 3 months' } });
    const job = await saveRecordTool(agent, { collection: 'Lifts/Jobs', values: { equipment: 'Lift A', type: 'Maintenance' } });
    expect(job.data.record).toMatchObject({ name: 'Maintenance · Lift A', values: expect.objectContaining({ code: 'WO-0001', customer: expect.objectContaining({ name: 'Atakule' }), address: 'Çankaya', status: 'Unscheduled' }) });
    const id = job.data.record.id;
    // It starts with the checklist of its type.
    expect((await recordsTool(agent, { collection: 'Lifts/Jobs' })).data.records[0]!.values).toMatchObject({ checks: 5, checked: 0 });
    const line = await saveRecordTool(agent, { collection: 'Lifts/Work order lines', values: { work_order: 'WO-0001', product: 'Door sensor', quantity: 2 } });
    expect(line.data.record.values).toMatchObject({ name: 'Door sensor', unit_price: 100, amount: 200 });
    const press = (action: string, input?: object, on = id) => saveRecordTool(agent, { collection: 'Lifts/Jobs', id: on, action, ...(input && { input: input as never }) });
    expect((await press('Schedule', { technician: 'Ali', start: '2026-10-22T09:00' })).data.record.values).toMatchObject({ status: 'Scheduled', start: '2026-10-22T09:00', ends: '2026-10-22T10:00', total: 200 });
    const other = await saveRecordTool(agent, { collection: 'Lifts/Jobs', values: { customer: 'Atakule', technician: 'Ali', start: '2026-10-22T09:30' } });
    expect(other.data.record).toMatchObject({ name: 'Repair · Atakule', values: expect.objectContaining({ status: 'Scheduled' }) });
    expect(other.data.record.problems).toEqual([{ kind: 'check', field: 'start', text: 'Overlaps with Maintenance · Lift A' }]);
    expect((await press('On my way')).data.record.values.on_way).toMatch(/^2026-10-21T/);
    expect((await press('Start')).data.record.values).toMatchObject({ status: 'In progress' });
    const done = (await press('Complete', { work_done: 'Door sensors changed', started_at: '2026-10-22T09:00', finished_at: '2026-10-22T10:30', signature: 'M0 0 L10 10', signed_by: 'Ayşe' })).data.record.values;
    expect(done).toMatchObject({ status: 'Done', work_done: 'Door sensors changed', hours: 1.5, signature: 'M0 0 L10 10', signed_by: 'Ayşe', total: 800 });
    expect((await recordsTool(agent, { collection: 'Lifts/Equipment' })).data.records[0]!.values).toMatchObject({ next_service: '2027-01-20' });
    const stockOf = async () => (await recordsTool(agent, { collection: 'Lifts/Products' })).data.records[0]!.values.stock;
    expect(await stockOf()).toBe(8);
    const invoiced = await press('Invoice');
    expect(invoiced.data.record.values).toMatchObject({ status: 'Invoiced', order: expect.objectContaining({ code: 'SO-0001' }) });
    const order = (await recordsTool(agent, { collection: 'Lifts/Orders' })).data.records[0]!;
    expect(order.values).toMatchObject({ status: 'Delivered', customer: expect.objectContaining({ name: 'Atakule' }), total: 800 });
    expect((await recordsTool(agent, { collection: 'Lifts/Order lines', sort: { field: 'amount' } })).data.records.map((l) => [l.name, l.values.quantity, l.values.amount])).toEqual([
      ['WO-0001 · Door sensor', 2, 200],
      ['WO-0001 · Labour · Ali', 1.5, 600],
    ]);
    // What went out of stock went out once; the customer's next job of the day goes on the same order.
    expect(await stockOf()).toBe(8);
    await press('Complete', { work_done: 'Checked', started_at: '2026-10-22T11:00', finished_at: '2026-10-22T11:30' }, other.data.record.id);
    expect((await press('Invoice', undefined, other.data.record.id)).data.record.values.order).toMatchObject({ code: 'SO-0001' });
    expect(await press('Invoice').catch((e: Error) => e)).toBeInstanceOf(Error);
  });

  it('keeps a project: its hours at its rate, a timer stopped, its expenses, marked over its budget, invoiced as a payment, and a deadline done writes the next one', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Firm', templates: ['consulting', 'budget'], answers: { consulting: { deadlines: true } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Firm/Companies', values: { name: 'Lara Turizm' } });
    const audit = await saveRecordTool(agent, { collection: 'Firm/Projects', values: { name: 'Audit 2026', client: 'Lara Turizm', fee_model: 'Hourly', rate: 1000, budget: 5000 } });
    const id = audit.data.record.id;
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Firm/Projects', id, action, ...(input && { input: input as never }) });
    await press('Track time', { hours: 3, note: 'Kickoff' });
    expect((await recordsTool(agent, { collection: 'Firm/Time entries' })).data.records[0]!.values).toMatchObject({ billable: true, rate: 1000, amount: 3000, date: '2026-10-21' });
    await saveRecordTool(agent, { collection: 'Firm/Expenses', values: { name: 'Travel', engagement: 'Audit 2026', amount: 500 } });
    const project = async () => (await recordsTool(agent, { collection: 'Firm/Projects' })).data.records[0]!;
    expect((await project()).values).toMatchObject({ hours: 3, unbilled: 3500, used: 0.7, left: 1500 });
    const over = await press('Track time', { hours: 2 });
    expect(over.data.record.values).toMatchObject({ hours: 5, unbilled: 5500, over: true });
    expect(over.data.record.problems).toEqual([{ kind: 'check', field: 'budget', text: 'Over its budget: 110% used' }]);
    // With no hours a timer starts; Stop writes them and it is no longer running.
    await press('Track time', { note: 'Call' });
    const running = (await recordsTool(agent, { collection: 'Firm/Time entries', where: [{ field: 'started', op: 'not-empty' }] })).data.records;
    expect(running.map((r) => r.name)).toEqual(['Call']);
    const stopped = (await saveRecordTool(agent, { collection: 'Firm/Time entries', id: running[0]!.id, action: 'Stop' })).data.record.values;
    expect(stopped.started ?? null).toBeNull();
    expect(typeof stopped.hours).toBe('number');
    expect((await press('Invoice', { range: 'All not invoiced', expenses: 'Billable ones' })).data.record.values.unbilled).toBe(0);
    const payments = (await recordsTool(agent, { collection: 'Firm/Payments' })).data.records;
    expect(payments.map((p) => p.values)).toEqual([expect.objectContaining({ direction: 'In', status: 'Invoiced', engagement: expect.objectContaining({ id }), budget_line: expect.objectContaining({ name: 'Consulting' }) })]);
    expect(payments[0]!.values.amount).toBeGreaterThanOrEqual(5500);
    expect((await recordsTool(agent, { collection: 'Firm/Time entries' })).data.records.every((r) => r.values.billed === true)).toBe(true);

    const vat = await saveRecordTool(agent, { collection: 'Firm/Deadlines', values: { client: 'Lara Turizm', kind: 'VAT return', due: '2026-10-26' } });
    expect(vat.data.record).toMatchObject({ name: 'VAT return · Lara Turizm', values: expect.objectContaining({ repeats: 'Monthly', status: 'To do' }) });
    await saveRecordTool(agent, { collection: 'Firm/Deadlines', id: vat.data.record.id, values: { status: 'Done' } });
    const next = (await recordsTool(agent, { collection: 'Firm/Deadlines', where: [{ field: 'status', op: 'is', value: 'To do' }] })).data.records;
    expect(next.map((r) => [r.name, r.values.due])).toEqual([['VAT return · Lara Turizm', '2026-11-26']]);
  });

  it('keeps personal money: what comes again set up as rows, a transaction by its amount and category, a transfer, a budget, one paid with what it asks left to its defaults', async () => {
    const { agent } = await world();
    // Wednesday 21 October: a salary on the 15th is next on November 15th, the rent on the 1st on November 1st.
    const recurringRows = [
      { name: 'Salary', amount: 50000, direction: 'In', every: 'Monthly', day: 15, category: 'Salary' },
      { name: 'Rent', amount: '20.000', direction: 'Out', every: 'Monthly', day: 1, category: 'Rent' },
      { name: 'Car insurance', amount: 14000, direction: 'Out', every: 'Yearly', day: 3, category: 'Insurance' },
      { name: 'Electricity', direction: 'Out', every: 'Monthly', day: 20, category: 'Utilities' },
      { name: '', amount: 5 },
    ];
    await createTool(agent, { kind: 'app', name: 'Money', templates: ['finance'], answers: { finance: { recurring: recurringRows } }, currencies: ['TRY'] });
    const recurring = (await recordsTool(agent, { collection: 'Money/Recurring', sort: { field: 'next' } })).data.records;
    // One with no amount, or one that changes as electricity, is not written by itself.
    expect(recurring.map((r) => [r.name, r.values.amount ?? null, r.values.direction, r.values.every, r.values.next, r.values.auto, r.values.writes, (r.values.account as { name: string }).name, (r.values.category as { name: string } | undefined)?.name ?? null])).toEqual([
      ['Rent', 20000, 'Out', 'Monthly', '2026-11-01', true, true, 'Bank account', 'Rent'],
      ['Car insurance', 14000, 'Out', 'Yearly', '2026-11-03', true, true, 'Bank account', 'Insurance'],
      ['Salary', 50000, 'In', 'Monthly', '2026-11-15', true, true, 'Bank account', 'Salary'],
      ['Electricity', null, 'Out', 'Monthly', '2026-11-20', false, false, 'Bank account', 'Utilities'],
    ]);
    const accounts = (await recordsTool(agent, { collection: 'Money/Accounts', sort: { field: 'name' } })).data.records;
    expect(accounts.map((a) => [a.name, a.values.type])).toEqual([
      ['Bank account', 'Bank'],
      ['Cash', 'Cash'],
      ['Credit card', 'Card'],
    ]);
    await saveRecordTool(agent, { collection: 'Money/Accounts', id: accounts[0]!.id, values: { opening: 10000 } });
    // An amount and a category: its name is the category's; the account is the one used last.
    const market = await saveRecordTool(agent, { collection: 'Money/Transactions', values: { account: 'Credit card', amount: 1500, category: 'Groceries' } });
    expect(market.data.record.name).toBe('Groceries');
    const coffee = await saveRecordTool(agent, { collection: 'Money/Transactions', values: { amount: 85, category: 'Coffee' } });
    expect(coffee.data.record.values.account).toMatchObject({ name: 'Credit card' });
    // A card paid from the bank: out of one, into the other.
    await saveRecordTool(agent, { collection: 'Money/Transactions', values: { amount: 1000, direction: 'Transfer', account: 'Bank account', to: 'Credit card' } });
    const balance = async (name: string) => (await recordsTool(agent, { collection: 'Money/Accounts', where: [{ field: 'name', op: 'is', value: name }] })).data.records[0]!.values.balance;
    expect([await balance('Bank account'), await balance('Credit card')]).toEqual([9000, -585]);
    // The budget: a bar of what is spent of the limit, and how it stands.
    const groceries = (await recordsTool(agent, { collection: 'Money/Categories', where: [{ field: 'name', op: 'is', value: 'Groceries' }] })).data.records[0]!;
    const limited = await saveRecordTool(agent, { collection: 'Money/Categories', id: groceries.id, values: { limit: 1600 } });
    expect(limited.data.record.values).toMatchObject({ spent: 1500, left: 100, shown: '₺1500 of ₺1600', status: 'Close' });
    // One with no amount yet, past its day: Paid asks it, writes it on its day, keeps it and moves a month on.
    const power = await saveRecordTool(agent, { collection: 'Money/Recurring', id: recurring.find((r) => r.name === 'Electricity')!.id, values: { next: '2026-10-20' } });
    expect(power.data.record.values.says).toBe('No amount yet · Bank account');
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-21' })).data.records as { record: { name: string }; late?: boolean }[];
    expect(due.map((d) => [d.record.name, !!d.late])).toEqual([['Electricity', true]]);
    const paid = await saveRecordTool(agent, { collection: 'Money/Recurring', id: power.data.record.id, action: 'Paid', input: { amount: 940 } });
    expect(paid.data.record.values).toMatchObject({ next: '2026-11-20', amount: 940, says: 'about −₺940 · Bank account' });
    const written = (await recordsTool(agent, { collection: 'Money/Transactions', where: [{ field: 'name', op: 'is', value: 'Electricity' }] })).data.records[0]!.values;
    expect(written).toMatchObject({ amount: 940, direction: 'Out', account: expect.objectContaining({ name: 'Bank account' }), category: expect.objectContaining({ name: 'Utilities' }), date: '2026-10-20', recurring: expect.objectContaining({ name: 'Electricity' }) });
  });

  it('keeps the home: reminders at home and for the car, each done planned again as often as it is, a document with no day it runs out', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Home', templates: ['home'] });
    const reminders = (await recordsTool(agent, { collection: 'Home/Reminders', sort: { field: 'name' } })).data.records;
    expect(reminders.map((j) => [j.name, j.values.every, ((j.values.home ?? j.values.car) as { name: string }).name])).toEqual([
      ['Air conditioner filters', 'Every 3 months', 'Home'],
      ['Boiler service', 'Yearly', 'Home'],
      ['Inspection', 'Every 2 years', 'Car'],
      ['Insurance', 'Yearly', 'Car'],
      ['Service', 'Yearly', 'Car'],
      ['Smoke alarm batteries', 'Yearly', 'Home'],
      ['Tyre change', 'Every 6 months', 'Car'],
      ['Water purifier filters', 'Every 6 months', 'Home'],
    ]);
    const id = (name: string) => reminders.find((j) => j.name === name)!.id;
    const boiler = await saveRecordTool(agent, { collection: 'Home/Reminders', id: id('Boiler service'), values: { next: '2026-10-01' } });
    expect(boiler.data.record.problems).toEqual([{ kind: 'check', field: 'next', text: 'Overdue' }]);
    const done = async (rid: string) => (await saveRecordTool(agent, { collection: 'Home/Reminders', id: rid, action: 'Done' })).data.record.values;
    expect(await done(id('Boiler service'))).toMatchObject({ last: '2026-10-21', next: '2027-10-21' });
    expect(await done(id('Air conditioner filters'))).toMatchObject({ next: '2027-01-21' });
    expect(await done(id('Inspection'))).toMatchObject({ next: '2028-10-21' });
    // Custom: how many days, weeks, months or years; asked for when it is not given.
    const descale = await saveRecordTool(agent, { collection: 'Home/Reminders', values: { name: 'Descale the kettle', every: 'Custom', unit: 'Days' } });
    expect(descale.data.record.problems).toEqual([expect.objectContaining({ kind: 'missing', field: 'interval' })]);
    expect(descale.data.record.values.home).toMatchObject({ name: 'Home' });
    await saveRecordTool(agent, { collection: 'Home/Reminders', id: descale.data.record.id, values: { interval: 10 } });
    expect(await done(descale.data.record.id)).toMatchObject({ next: '2026-10-31' });
    const bins = await saveRecordTool(agent, { collection: 'Home/Reminders', values: { name: 'Bins', every: 'Weekly' } });
    expect(await done(bins.data.record.id)).toMatchObject({ next: '2026-10-28' });
    // Remind a week before: it comes to Upcoming then.
    const wash = await saveRecordTool(agent, { collection: 'Home/Reminders', values: { name: 'Wash', car: 'Car', next: '2026-11-20', remind: '1 week before' } });
    expect(wash.data.record.values).toMatchObject({ remind_on: '2026-11-13' });
    expect(wash.data.record.values.home).toBeUndefined();
    // The car shows the first of its reminders' days, and is marked when one is past.
    await saveRecordTool(agent, { collection: 'Home/Reminders', id: id('Insurance'), values: { next: '2026-10-20' } });
    const car = (await recordsTool(agent, { collection: 'Home/Cars' })).data.records[0]!;
    expect(car.values.next).toBe('2026-10-20');
    expect(car.problems).toEqual([{ kind: 'check', field: 'next', text: 'A reminder is past its day' }]);
    // A document: a manual with no day it runs out; a passport a month before it does.
    const manual = await saveRecordTool(agent, { collection: 'Home/Documents', values: { name: 'Dishwasher manual', home: 'Home' } });
    expect(manual.data.record.problems).toBeUndefined();
    const passport = await saveRecordTool(agent, { collection: 'Home/Documents', values: { name: 'Passport', expires: '2026-12-15' } });
    expect(passport.data.record.values.remind).toBe('2026-11-15');
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-12-31' })).data.records as { start: string; record: { name: string } }[];
    // The insurance past its day stays, late, till Done.
    expect(due.map((d) => [d.record.name, d.start, !!(d as { late?: boolean }).late]).sort()).toEqual([
      ['Bins', '2026-10-28', false],
      ['Descale the kettle', '2026-10-31', false],
      ['Insurance', '2026-10-20', true],
      ['Passport', '2026-11-15', false],
      ['Wash', '2026-11-13', false],
    ]);
    // Only cars kept: a reminder saved with no car is the only car's.
    await createTool(agent, { kind: 'app', name: 'Garage', templates: ['home'], answers: { home: { keeps: ['vehicles'] } } });
    expect((await saveRecordTool(agent, { collection: 'Garage/Reminders', values: { name: 'Wash' } })).data.record.values.car).toMatchObject({ name: 'Car' });
  });

  it('keeps a family’s health: a medicine’s day it runs out, an appointment and its follow-up, check-ups for each person', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Health', templates: ['health'], answers: { health: { for: 'family', family: ['Ayşe', 'Can'], checkups: ['Dentist every 6 months', 'Tetanus every 10 years'] } } });
    // Check-ups are set up for each person, how often read from their words.
    const checkups = (await recordsTool(agent, { collection: 'Health/Check-ups', sort: { field: 'name' } })).data.records;
    expect(checkups.map((c) => [c.name, c.values.person, c.values.every, c.values.interval ?? null, c.values.unit ?? null]).sort()).toEqual([
      ['Dentist', 'Ayşe', 'Every 6 months', null, null],
      ['Dentist', 'Can', 'Every 6 months', null, null],
      ['Tetanus', 'Ayşe', 'Custom', 10, 'Years'],
      ['Tetanus', 'Can', 'Custom', 10, 'Years'],
    ]);
    const tetanus = checkups.find((c) => c.name === 'Tetanus')!;
    expect((await saveRecordTool(agent, { collection: 'Health/Check-ups', id: tetanus.id, action: 'Done' })).data.record.values).toMatchObject({ last: '2026-10-21', next: '2036-10-21' });
    const dentist = checkups.find((c) => c.name === 'Dentist')!;
    expect((await saveRecordTool(agent, { collection: 'Health/Check-ups', id: dentist.id, values: { next: '2026-10-01' } })).data.record.problems).toEqual([{ kind: 'check', field: 'next', text: 'Overdue' }]);
    // A medicine: 30 in a box, twice a day from the 10th, runs out on the 25th, and is in Today from the 20th.
    const pills = await saveRecordTool(agent, { collection: 'Health/Medicines', values: { name: 'Vitamin D', person: 'Ayşe', dose: '1000 IU', often: 'Twice a day', box: 30, since: '2026-10-10' } });
    expect(pills.data.record.values).toMatchObject({ runs_out: '2026-10-25', remind: '2026-10-20', left: '4 days left', status: 'Taking' });
    expect(pills.data.record.problems).toEqual([{ kind: 'check', field: 'runs_out', text: 'Runs out soon' }]);
    const refilled = await saveRecordTool(agent, { collection: 'Health/Medicines', id: pills.data.record.id, action: 'Refilled' });
    expect(refilled.data.record.values).toMatchObject({ since: '2026-10-21', runs_out: '2026-11-05' });
    expect(refilled.data.record.problems).toBeUndefined();
    const asNeeded = await saveRecordTool(agent, { collection: 'Health/Medicines', values: { name: 'Painkiller', person: 'Can', often: 'As needed', box: 20 } });
    expect(asNeeded.data.record.values.runs_out ?? null).toBeNull();
    expect((await saveRecordTool(agent, { collection: 'Health/Medicines', id: asNeeded.data.record.id, action: 'Stopped' })).data.record.values.status).toBe('Stopped');
    // An appointment: its name the doctor as it is said; its follow-up the same doctor, place and person. No Doctors.
    expect((await refusal(recordsTool(agent, { collection: 'Health/Doctors' }))).message).toMatch(/No collection is called Health.Doctors/);
    const visit = await saveRecordTool(agent, { collection: 'Health/Appointments', values: { name: 'Dr. Demir', person: 'Can', when: '2026-10-25T10:00', place: 'Smile Clinic' } });
    expect(visit.data.record.values).toMatchObject({ person: 'Can', place: 'Smile Clinic' });
    await saveRecordTool(agent, { collection: 'Health/Appointments', id: visit.data.record.id, action: 'Book follow-up', input: { after: 'In 6 months' } });
    const visits = (await recordsTool(agent, { collection: 'Health/Appointments', sort: { field: 'when' } })).data.records;
    expect(visits.map((v) => [v.name, v.values.person, String(v.values.when).slice(0, 10), v.values.place])).toEqual([
      ['Dr. Demir', 'Can', '2026-10-25', 'Smile Clinic'],
      ['Dr. Demir', 'Can', '2027-04-25', 'Smile Clinic'],
    ]);
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-11-30' })).data.records as { start: string; record: { name: string } }[];
    // The dentist past its day stays, late, till Done; the medicine comes five days before it runs out.
    expect(due.map((d) => [d.record.name, d.start.slice(0, 10), !!(d as { late?: boolean }).late]).sort()).toEqual([
      ['Dentist', '2026-10-01', true],
      ['Dr. Demir', '2026-10-25', false],
      ['Vitamin D', '2026-10-31', false],
    ]);
  });

  it('shares expenses: each one’s share with the cents on the payer, balances, Settle up, a payment ticked Paid, and split by shares and by amounts', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Flat', templates: ['split'], answers: { split: { people: ['Ayşe', 'Can', 'Deniz'], methods: 'all' } }, currencies: ['TRY'] });
    // Sums of cents carry a little of floating point; they are shown in the currency, as two decimals.
    const r = (n: unknown) => Math.round(Number(n) * 100) / 100;
    const members = async () => Object.fromEntries((await recordsTool(agent, { collection: 'Flat/Members' })).data.records.map((m) => [m.name, [r(m.values.paid), r(m.values.owes), r(m.values.balance)]]));
    const groceries = await saveRecordTool(agent, { collection: 'Flat/Expenses', values: { name: 'Groceries', amount: 100, payer: 'Ayşe' } });
    const written = (await recordsTool(agent, { collection: 'Flat/Expenses' })).data.records[0]!;
    expect([written.id, written.values, r(written.values.shared)]).toEqual([groceries.data.record.id, expect.objectContaining({ group: expect.objectContaining({ name: 'Home' }), split: 'Equally' }), 100]);
    expect((written.values.between as { name: string }[]).map((m) => m.name).sort()).toEqual(['Ayşe', 'Can', 'Deniz']);
    expect(await members()).toEqual({ Ayşe: [100, 33.34, 66.66], Can: [0, 33.33, -33.33], Deniz: [0, 33.33, -33.33] });
    await saveRecordTool(agent, { collection: 'Flat/Expenses', values: { name: 'Dinner', amount: 60, payer: 'Can', between: ['Can', 'Deniz'] } });
    expect(await members()).toEqual({ Ayşe: [100, 33.34, 66.66], Can: [60, 63.33, -3.33], Deniz: [0, 63.33, -63.33] });

    const flat = (await recordsTool(agent, { collection: 'Flat/Groups' })).data.records[0]!;
    expect([r(flat.values.total), flat.values.members]).toEqual([160, 3]);
    await saveRecordTool(agent, { collection: 'Flat/Groups', id: flat.id, action: 'Settle up' });
    const settlements = async () => (await recordsTool(agent, { collection: 'Flat/Settlements', sort: { field: 'amount' } })).data.records;
    expect((await settlements()).map((s) => [s.name, s.values.amount, s.values.paid])).toEqual([
      ['Can → Ayşe', 3.33, false],
      ['Deniz → Ayşe', 63.33, false],
    ]);
    // Deniz pays: their balance is nothing, and Settle up again leaves only what is not paid.
    await saveRecordTool(agent, { collection: 'Flat/Settlements', id: (await settlements())[1]!.id, values: { paid: true } });
    expect(await members()).toEqual({ Ayşe: [100, 96.67, 3.33], Can: [60, 63.33, -3.33], Deniz: [63.33, 63.33, 0] });
    await saveRecordTool(agent, { collection: 'Flat/Groups', id: flat.id, action: 'Settle up' });
    expect((await settlements()).map((s) => [s.name, s.values.amount, s.values.paid])).toEqual([
      ['Can → Ayşe', 3.33, false],
      ['Deniz → Ayşe', 63.33, true],
    ]);

    // By parts: one part each to start; Deniz takes two, and each one's part follows.
    await saveRecordTool(agent, { collection: 'Flat/Expenses', values: { name: 'Rent', amount: 900, payer: 'Ayşe', split: 'By parts' } });
    const rentShares = async () => (await recordsTool(agent, { collection: 'Flat/Shares', where: [{ field: 'expense', op: 'is', value: 'Rent' }], sort: { field: 'name' } })).data.records;
    expect((await rentShares()).map((s) => s.values.owes)).toEqual([300, 300, 300]);
    await saveRecordTool(agent, { collection: 'Flat/Shares', id: (await rentShares())[2]!.id, values: { weight: 2 } });
    expect((await rentShares()).map((s) => [s.name, s.values.part])).toEqual([
      ['Rent · Ayşe', 225],
      ['Rent · Can', 225],
      ['Rent · Deniz', 450],
    ]);
    // By amounts: equal to start; one written by hand that does not add up is marked.
    const taxi = await saveRecordTool(agent, { collection: 'Flat/Expenses', values: { name: 'Taxi', amount: 50, payer: 'Can', between: ['Can', 'Deniz'], split: 'By amounts' } });
    const canShare = (await recordsTool(agent, { collection: 'Flat/Shares', where: [{ field: 'name', op: 'is', value: 'Taxi · Can' }] })).data.records[0]!;
    await saveRecordTool(agent, { collection: 'Flat/Shares', id: canShare.id, values: { owes: 20 } });
    const marked = (await recordsTool(agent, { collection: 'Flat/Expenses', where: [{ field: 'name', op: 'is', value: 'Taxi' }] })).data.records[0]!;
    expect([marked.id, marked.problems]).toEqual([taxi.data.record.id, [{ kind: 'check', field: 'amount', text: 'The shares come to 45, not 50' }]]);
  });

  it('keeps a trip: named by itself, packed from the list by its kinds, a booking its expense, an expense in the trip on now at the rate used last, and what is left each day', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Away', templates: ['travel'], currencies: ['TRY', 'EUR'] });
    // Wednesday 21 October, on the trip.
    const trip = await saveRecordTool(agent, { collection: 'Away/Trips', values: { destination: 'Rome', first: '2026-10-20', last: '2026-10-24', budget: 10000, kind: ['Abroad'] } });
    expect(trip.data.record.name).toBe('Rome · Oct 2026');
    const packed = async () => (await recordsTool(agent, { collection: 'Away/Packing' })).data.records.map((p) => p.name);
    expect(await packed()).toEqual(expect.arrayContaining(['Passport', 'Toothbrush', 'Power adapter']));
    expect(await packed()).not.toContain('Swimsuit');
    // Another kind brings what it is taken on, nothing twice.
    await saveRecordTool(agent, { collection: 'Away/Trips', id: trip.data.record.id, values: { kind: ['Abroad', 'Beach'] } });
    expect(await packed()).toContain('Swimsuit');
    expect((await packed()).filter((p) => p === 'Passport')).toHaveLength(1);

    const flight = await saveRecordTool(agent, { collection: 'Away/Bookings', values: { trip: 'Rome · Oct 2026', type: 'Flight', flight_no: 'TK1325', from: 'IST', to: 'FCO', start: '2026-10-20T08:45', amount: 3000 } });
    expect(flight.data.record.name).toBe('IST → FCO');
    const expenses = async () => (await recordsTool(agent, { collection: 'Away/Expenses', sort: { field: 'amount' } })).data.records;
    expect((await expenses()).map((e) => [e.name, e.values.amount])).toEqual([['IST → FCO', 3000]]);
    // Its amount changed, its expense follows; not written twice.
    await saveRecordTool(agent, { collection: 'Away/Bookings', id: flight.data.record.id, values: { amount: 3200 } });
    expect((await expenses()).map((e) => e.values.amount)).toEqual([3200]);

    await saveRecordTool(agent, { collection: 'Away/Expenses', values: { name: 'Dinner', amount: 20, currency: 'EUR', rate: 37 } });
    const second = await saveRecordTool(agent, { collection: 'Away/Expenses', values: { name: 'Coffee', amount: 10, currency: 'EUR' } });
    expect(second.data.record).toMatchObject({ name: 'Coffee', values: expect.objectContaining({ rate: 37, trip: expect.objectContaining({ name: 'Rome · Oct 2026' }) }) });
    const rome = (await recordsTool(agent, { collection: 'Away/Trips' })).data.records[0]!;
    // 3200 + 740 + 370 spent; 5690 left for the 4 days from today to the last.
    expect(rome.values).toMatchObject({ spent: 4310, left: 5690, days_left: 4, per_day: 1423 });
  });

  it('shares a trip’s booking paid by one with all of the trip, and writes a shared rent again every month', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Away', templates: ['travel', 'split'], answers: { split: { people: ['Ayşe', 'Can'] } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Away/Trips', values: { destination: 'Rome', first: '2026-11-12', last: '2026-11-16' } });
    // A new trip takes the people the app was set up with.
    const hotel = await saveRecordTool(agent, { collection: 'Away/Bookings', values: { trip: 'Rome · Nov 2026', type: 'Hotel', name: 'Hotel Artemide', start: '2026-11-12T15:00', amount: 1000, paid_by: 'Can' } });
    const members = async () => Object.fromEntries((await recordsTool(agent, { collection: 'Away/Members' })).data.records.filter((m) => !!m.values.trip).map((m) => [m.name, [m.values.paid, m.values.owes, m.values.balance]]));
    const expense = (await recordsTool(agent, { collection: 'Away/Expenses' })).data.records[0]!;
    expect([expense.name, expense.values.amount, (expense.values.payer as { name: string }).name]).toEqual(['Hotel Artemide', 1000, 'Can']);
    expect(await members()).toEqual({ Ayşe: [0, 500, -500], Can: [1000, 500, 500] });
    await saveRecordTool(agent, { collection: 'Away/Bookings', id: hotel.data.record.id, values: { amount: 1200 } });
    expect(await members()).toEqual({ Ayşe: [0, 600, -600], Can: [1200, 600, 600] });

    const flat = await world();
    await createTool(flat.agent, { kind: 'app', name: 'Flat', templates: ['split'], answers: { split: { people: ['Ayşe', 'Can'] } }, currencies: ['TRY'] });
    const rent = await saveRecordTool(flat.agent, { collection: 'Flat/Expenses', values: { name: 'Rent', amount: 30000, payer: 'Ayşe', date: '2026-10-01', repeats: true } });
    expect(rent.data.record.values).toMatchObject({ group: expect.objectContaining({ name: 'Home' }), next: '2026-11-01' });
    await saveRecordTool(flat.agent, { collection: 'Flat/Expenses', id: rent.data.record.id, action: 'Add again' });
    const rents = (await recordsTool(flat.agent, { collection: 'Flat/Expenses', sort: { field: 'date' } })).data.records;
    expect(rents.map((r) => [r.name, r.values.date, r.values.repeats, r.values.next ?? null])).toEqual([
      ['Rent', '2026-10-01', true, '2026-12-01'],
      ['Rent', '2026-11-01', false, null],
    ]);
    const balance = Object.fromEntries((await recordsTool(flat.agent, { collection: 'Flat/Members' })).data.records.map((m) => [m.name, m.values.balance]));
    expect(balance).toEqual({ Ayşe: 30000, Can: -30000 });
  });

  it('shares a trip’s expenses with Travel, and writes your own share in Personal finance', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Trips', templates: ['finance', 'travel', 'split'], answers: { split: { people: ['Me', 'Can'] } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Trips/Trips', values: { name: 'Rome', first: '2026-11-05', last: '2026-11-09', budget: 1000 } });
    for (const m of (await recordsTool(agent, { collection: 'Trips/Members' })).data.records) if (m.values.trip && m.name === 'Me') await saveRecordTool(agent, { collection: 'Trips/Members', id: m.id, values: { me: true } });
    await saveRecordTool(agent, { collection: 'Trips/Expenses', values: { name: 'Hotel', amount: 400, payer: 'Can', trip: 'Rome' } });
    const rome = (await recordsTool(agent, { collection: 'Trips/Trips' })).data.records[0]!;
    expect(rome.values).toMatchObject({ spent: 400, left: 600, members: 2, each: 200 });
    await saveRecordTool(agent, { collection: 'Trips/Trips', id: rome.id, action: 'Settle up' });
    expect((await recordsTool(agent, { collection: 'Trips/Settlements' })).data.records.map((s) => [s.name, s.values.amount])).toEqual([['Me → Can', 200]]);
    const spent = (await recordsTool(agent, { collection: 'Trips/Transactions' })).data.records;
    expect(spent.map((t) => [t.name, t.values.amount, t.values.direction, (t.values.account as { name: string }).name])).toEqual([['Hotel', 200, 'Out', 'Bank account']]);
  });

  it('follows a plan to eat by, day by day, from recipes with their links, and writes the shopping list; follows a job search up', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Kitchen', templates: ['recipes'] });
    const menemen = await saveRecordTool(agent, { collection: 'Kitchen/Recipes', values: { name: 'Menemen', link: 'https://example.com/menemen', time: 20, serves: 2 } });
    expect(menemen.data.record.values.link).toBe('https://example.com/menemen');
    expect(menemen.data.record.problems).toEqual([{ kind: 'check', text: 'No ingredients yet' }]);
    await saveRecordTool(agent, { collection: 'Kitchen/Ingredients', values: { name: 'Eggs', recipe: 'Menemen', quantity: '4' } });
    await saveRecordTool(agent, { collection: 'Kitchen/Ingredients', values: { name: 'Tomatoes', recipe: 'Menemen', quantity: '3' } });
    await saveRecordTool(agent, { collection: 'Kitchen/Recipes', id: menemen.data.record.id, action: 'Add to shopping list' });
    expect((await recordsTool(agent, { collection: 'Kitchen/Shopping list', sort: { field: 'name' } })).data.records.map((i) => [i.name, i.values.quantity])).toEqual([
      ['Eggs', '4'],
      ['Tomatoes', '3'],
    ]);

    // A plan: saved, its days are written, Monday to Sunday; its items meal by meal, the ones of a meal alternatives, one of Wednesdays only.
    const plan = await saveRecordTool(agent, { collection: 'Kitchen/Plans', values: { name: 'Akdeniz', from: '2026-10-19', until: '2026-10-25' } });
    for (const values of [
      { name: '2 yumurta, peynir', plan: 'Akdeniz', meal: 'Breakfast', order: 1 },
      { name: 'Yulaf, süt, muz', plan: 'Akdeniz', meal: 'Breakfast', order: 2 },
      { plan: 'Akdeniz', meal: 'Lunch', recipe: 'Menemen', order: 1 },
      { name: 'Fırında balık', plan: 'Akdeniz', meal: 'Dinner', on: 'Wed', order: 1 },
      { name: 'Tavuk sote', plan: 'Akdeniz', meal: 'Dinner', order: 2 },
    ]) await saveRecordTool(agent, { collection: 'Kitchen/Plan items', values });
    const days = async () => (await recordsTool(agent, { collection: 'Kitchen/Days', sort: { field: 'day' } })).data.records;
    expect((await days()).map((d) => d.values.day)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    const itemsOn = async (day: string) => (await recordsTool(agent, { collection: 'Kitchen/Day items', where: [{ field: 'day', op: 'on', value: day }] })).data.records;
    expect((await itemsOn('2026-10-21')).map((i) => i.name).sort()).toEqual(['2 yumurta, peynir', 'Fırında balık', 'Menemen', 'Tavuk sote', 'Yulaf, süt, muz']);
    expect((await itemsOn('2026-10-22')).map((i) => i.name).sort()).toEqual(['2 yumurta, peynir', 'Menemen', 'Tavuk sote', 'Yulaf, süt, muz']);
    // From today on; today's day in Today, none of the days to come.
    const ahead = (await recordsTool(agent, { collection: 'Kitchen/Days', where: [{ field: 'ahead', op: 'true' }], sort: { field: 'day' } })).data.records;
    expect(ahead.map((d) => d.values.day)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    const planDue = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-31' })).data.records as { start: string; record: { name: string } }[];
    expect(planDue.filter((d) => d.record.name.startsWith('Akdeniz')).map((d) => d.start)).toEqual(['2026-10-21']);
    // Wednesday: the oats eaten; pizza instead of the chicken; the dinner's other alternative left as it is.
    const wed = await itemsOn('2026-10-21');
    await saveRecordTool(agent, { collection: 'Kitchen/Day items', id: wed.find((i) => i.name === 'Yulaf, süt, muz')!.id, values: { done: true } });
    await saveRecordTool(agent, { collection: 'Kitchen/Day items', id: wed.find((i) => i.name === 'Tavuk sote')!.id, values: { instead: 'Pizza' } });
    expect((await days()).find((d) => d.values.day === '2026-10-21')!.values).toMatchObject({ summary: '2 of 3', changed: 1 });
    // Thursday not followed.
    const thu = (await days()).find((d) => d.values.day === '2026-10-22')!;
    expect((await saveRecordTool(agent, { collection: 'Kitchen/Days', id: thu.id, action: "Didn't follow" })).data.record.values.status).toBe("Didn't follow");
    // An item changed: the days no one touched take it; Wednesday, ticked, and Thursday, not followed, stay as they were.
    const eggs = (await recordsTool(agent, { collection: 'Kitchen/Plan items', where: [{ field: 'name', op: 'is', value: '2 yumurta, peynir' }] })).data.records[0]!;
    await saveRecordTool(agent, { collection: 'Kitchen/Plan items', id: eggs.id, values: { name: '3 yumurta, peynir' } });
    expect((await itemsOn('2026-10-23')).map((i) => i.name)).toContain('3 yumurta, peynir');
    expect((await itemsOn('2026-10-21')).map((i) => i.name)).toContain('2 yumurta, peynir');
    expect((await itemsOn('2026-10-22')).map((i) => i.name)).toContain('2 yumurta, peynir');
    // Shorter: the last day goes; longer: a day comes.
    await saveRecordTool(agent, { collection: 'Kitchen/Plans', id: plan.data.record.id, values: { until: '2026-10-24' } });
    expect((await days()).map((d) => d.values.day).at(-1)).toBe('2026-10-24');
    await saveRecordTool(agent, { collection: 'Kitchen/Plans', id: plan.data.record.id, values: { until: '2026-10-26' } });
    expect((await days()).map((d) => d.values.day).slice(-2)).toEqual(['2026-10-25', '2026-10-26']);
    expect((await itemsOn('2026-10-26')).length).toBe(4);

    await createTool(agent, { kind: 'app', name: 'Jobs', templates: ['jobs'], currencies: ['TRY'] });
    // Saved with its to-dos ready; sent, its day written; nothing heard for two weeks, a follow-up in Today.
    const job = await saveRecordTool(agent, { collection: 'Jobs/Applications', values: { name: 'Backend developer', company: 'Acme', location: 'Remote' } });
    const saved = (await recordsTool(agent, { collection: 'Jobs/Applications' })).data.records[0]!;
    expect([saved.values.status, saved.values.applied ?? null, saved.subtasks?.map((s) => s.title)]).toEqual(['Saved', null, ['Tailor your resume', 'Write a cover letter', 'Find a referral', 'Apply']]);
    const sent = await saveRecordTool(agent, { collection: 'Jobs/Applications', id: job.data.record.id, values: { status: 'Applied' } });
    expect(sent.data.record.values).toMatchObject({ applied: '2026-10-21', heard: '2026-10-21', follow_on: '2026-11-04', said: 'Acme · Remote · applied today' });
    const followUps = async (to: string) => ((await dueRecordsTool(agent, { from: '2026-10-21', to })).data.records as { start: string; record: { name: string } }[]).filter((d) => d.record.name === 'Backend developer').map((d) => d.start);
    expect(await followUps('2026-11-30')).toEqual(['2026-11-04']);
    // An interview: news, the application at Interview, in Today with its time.
    const talk = await saveRecordTool(agent, { collection: 'Jobs/Interviews', values: { application: 'Backend developer', when: '2026-10-23T10:00', type: 'Technical' } });
    expect(talk.data.record.name).toBe('Technical · Backend developer, Acme');
    const now = (await recordsTool(agent, { collection: 'Jobs/Applications' })).data.records[0]!;
    expect(now.values).toMatchObject({ status: 'Interview', heard: '2026-10-23', follow_on: '2026-11-06', next_said: 'Interview · Fri 10:00' });
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-31' })).data.records as { record: { name: string } }[];
    expect(due.map((d) => d.record.name)).toContain('Technical · Backend developer, Acme');
    // Followed up: a week on.
    await saveRecordTool(agent, { collection: 'Jobs/Applications', id: job.data.record.id, action: 'Followed up' });
    expect((await recordsTool(agent, { collection: 'Jobs/Applications' })).data.records[0]!.values).toMatchObject({ followed: '2026-10-21', follow_on: '2026-11-06' });
  });

  it('keeps the people close to you: birthdays every year with or without their year, Wished on the day, and Talked when it is time', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Close', templates: ['people'] });
    // Wednesday 21 October. A birthday with its year turns an age; one without it is its day.
    const ayse = await saveRecordTool(agent, { collection: 'Close/People', values: { name: 'Ayşe', relation: 'Friend', birthday: '1990-11-03', anniversary: '2015-06-10' } });
    expect(ayse.data.record.values).toMatchObject({ every: 'Every month', next_birthday: '2026-11-03', age: 36, next: '2026-11-03', day_said: 'Turns 36 · 3 Nov', when_said: 'in 13 days', last_said: 'Not talked yet' });
    const can = await saveRecordTool(agent, { collection: 'Close/People', values: { name: 'Can', birthday: '11-12' } });
    expect(can.data.record.values).toMatchObject({ birthday: '--11-12', next: '2026-11-12', day_said: '12 Nov' });
    expect(can.data.record.values.age ?? null).toBeNull();
    // Talked a while ago: late; Talked today, a month on.
    expect((await saveRecordTool(agent, { collection: 'Close/Moments', values: { person: 'Ayşe', type: 'Call', date: '2026-09-01' } })).data.record.name).toBe('Call with Ayşe');
    const person = async (name: string) => (await recordsTool(agent, { collection: 'Close/People' })).data.records.find((r) => r.name === name)!;
    expect((await person('Ayşe')).values).toMatchObject({ last: '2026-09-01', touch_on: '2026-10-01', touch_said: '20 days late' });
    await saveRecordTool(agent, { collection: 'Close/People', id: ayse.data.record.id, action: 'Talked' });
    expect((await person('Ayşe')).values).toMatchObject({ last: '2026-10-21', touch_on: '2026-11-20', touch_said: '4 weeks left' });
    // On the day, Wished: a message written, and the birthday a year on.
    const deniz = await saveRecordTool(agent, { collection: 'Close/People', values: { name: 'Deniz', birthday: '--10-21' } });
    expect(deniz.data.record.values).toMatchObject({ next: '2026-10-21', when_said: 'today', wish_said: 'Birthday' });
    await saveRecordTool(agent, { collection: 'Close/People', id: deniz.data.record.id, action: 'Wished' });
    expect((await person('Deniz')).values).toMatchObject({ wished: '2026-10-21', next: '2027-10-21', last: '2026-10-21' });
    const due = (await dueRecordsTool(agent, { from: '2026-10-22', to: '2026-12-31' })).data.records as { start: string; record: { name: string } }[];
    expect(due.map((d) => [d.record.name, d.start])).toEqual(expect.arrayContaining([['Ayşe', '2026-11-03'], ['Can', '2026-11-12']]));
  });

  it('keeps reading and watching: +1 an episode, Watched in Today on its day, Update to the last page, the year, a friend’s pick, a lent book, what comes out', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Shelf', templates: ['people', 'reading'], answers: { reading: { goal: '24', lending: true } } });
    await saveRecordTool(agent, { collection: 'Shelf/People', values: { name: 'Ayşe' } });
    // An anime going on, out every Wednesday: +1 an episode, said as one; on its day in Today with Watched, the next one written by it.
    const anime = await saveRecordTool(agent, { collection: 'Shelf/Library', values: { name: 'Dandadan', type: 'Anime', total: 12, year: 2024, where: 'Netflix', status: 'In progress', airs: ['Wed'] } });
    expect(anime.data.record.values).toMatchObject({ status_said: 'Watching', line: '2024 · Netflix', next_episode: 'New episode today', note_said: 'New episode today' });
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-21' })).data.records as { view: string; record: { name: string } }[];
    expect(due.map((d) => [d.record.name, d.view])).toEqual([['Dandadan', 'New episodes']]);
    // Watched in Today writes the day in the log, From Today, and the episode with it.
    await saveRecordTool(agent, { collection: 'Shelf/Log', values: { item: 'Dandadan', date: '2026-10-21', amount: 1, aired: true } });
    expect((await recordsTool(agent, { collection: 'Shelf/Library', where: [{ field: 'name', op: 'is', value: 'Dandadan' }] })).data.records[0]!.values).toMatchObject({ done: 1, status: 'In progress' });
    expect((await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-21' })).data.records).toEqual([]);
    const plus = await saveRecordTool(agent, { collection: 'Shelf/Library', id: anime.data.record.id, action: '+1' });
    expect([plus.data.record.values.done, plus.data.record.values.progress_said, plus.data.action?.done]).toEqual([2, 'E2 / 12', 'Dandadan · episode 2 watched']);
    // A film is only to watch or watched.
    const film = await saveRecordTool(agent, { collection: 'Shelf/Library', values: { name: 'Perfect Days', type: 'Film', status: 'In progress' } });
    expect(film.data.record.values.status).toBe('Want');
    const dune = await saveRecordTool(agent, { collection: 'Shelf/Library', values: { name: 'Dune', type: 'Book', by: 'Frank Herbert', total: 600, recommended: 'Ayşe', where: 'Kindle' } });
    expect(dune.data.record.values).toMatchObject({ unit: 'pages', status: 'Want', line: 'Frank Herbert · 600 pages', note_said: 'Ayşe recommended', recommended: expect.objectContaining({ name: 'Ayşe' }) });
    const id = dune.data.record.id;
    const update = (now: number) => saveRecordTool(agent, { collection: 'Shelf/Library', id, action: 'Update', input: { now } });
    expect((await update(150)).data.record.values).toMatchObject({ done: 150, percent: 0.25, status: 'In progress', started: '2026-10-21' });
    expect((await update(600)).data.record.values).toMatchObject({ done: 600, status: 'Done', finished: '2026-10-21', read_in: expect.objectContaining({ name: '2026' }) });
    expect((await recordsTool(agent, { collection: 'Shelf/Log', where: [{ field: 'unit', op: 'is', value: 'pages' }], sort: { field: 'amount' } })).data.records.map((l) => [l.name, l.values.amount])).toEqual([
      ['Dune · 150 pages', 150],
      ['Dune · 450 pages', 450],
    ]);
    const year = (await recordsTool(agent, { collection: 'Shelf/Years' })).data.records[0]!;
    expect(year.values).toMatchObject({ name: '2026', target: 24, finished: 1, pages: 600, episodes: 2, streak: 1, days_now: 1, projected: 1, pace: 'Behind', said: '1 of 24 finished · behind' });
    const rated = await saveRecordTool(agent, { collection: 'Shelf/Library', id, values: { rating: 7 } });
    expect(rated.data.record.problems).toEqual([{ kind: 'check', field: 'rating', text: 'A score is from 1 to 5' }]);
    const lent = await saveRecordTool(agent, { collection: 'Shelf/Library', values: { name: 'Solaris', type: 'Book', lent_to: 'Can', lent_on: '2026-09-01', back_by: '2026-10-01' } });
    expect(lent.data.record.problems).toEqual([{ kind: 'check', field: 'back_by', text: 'Can has it since 2026-09-01' }]);
    await saveRecordTool(agent, { collection: 'Shelf/Library', values: { name: 'Dune: Part Three', type: 'Film', release: '2026-12-18' } });
    const coming = (await dueRecordsTool(agent, { from: '2026-10-22', to: '2026-12-31' })).data.records as { start: string; view: string; record: { name: string } }[];
    expect(coming.map((d) => [d.record.name, d.view, d.start])).toEqual([['Dune: Part Three', 'Coming out', '2026-12-18']]);
    expect((await saveRecordTool(agent, { collection: 'Shelf/Quotes', values: { name: 'Fear is the mind-killer.', item: 'Dune', where: 'p. 8' } })).data.record.values.item).toMatchObject({ name: 'Dune' });
  });

  it('ticks a habit in Today on its days, its streak worked out, and keeps workouts: a planned one done, sets and the best, the body since the first, a race', async () => {
    const { agent } = await world();
    // Habits and Sport share no data: two apps.
    await createTool(agent, { kind: 'app', name: 'Days', templates: ['habits'] });
    await createTool(agent, { kind: 'app', name: 'Me', templates: ['sport'], answers: { sport: { body: true, races: true } } });
    // How often each is, read from its words.
    const habits = (await recordsTool(agent, { collection: 'Days/Habits', sort: { field: 'name' } })).data.records;
    expect(habits.map((h) => [h.name, h.values.often, h.values.times ?? null, (h.values.days as string[]).length])).toEqual([
      ['Call mom', 'On some days', null, 1],
      ['Gym', 'Times a week', 3, 7],
      ['In bed by 23:00', 'Every day', null, 7],
      ['Read 20 pages', 'Every day', null, 7],
      ['Walk 30 minutes', 'Every day', null, 7],
    ]);
    // Wednesday 21 October: a habit done is a day in Check-ins; three days in a row a streak of three.
    for (const day of ['2026-10-19', '2026-10-20', '2026-10-21']) await saveRecordTool(agent, { collection: 'Days/Check-ins', values: { habit: 'Walk 30 minutes', day } });
    for (const day of ['2026-10-19', '2026-10-20']) await saveRecordTool(agent, { collection: 'Days/Check-ins', values: { habit: 'Gym', day } });
    const walk = (await recordsTool(agent, { collection: 'Days/Habits', where: [{ field: 'name', op: 'is', value: 'Walk 30 minutes' }] })).data.records[0]!;
    expect(walk.values).toMatchObject({ streak: 3, best: 3, streak_text: '🔥 3 days', this_week: '3 of 7', today_says: '🔥 3 days' });
    // Today has the habits of the day not done: Walk is done, Call mom is on Sundays; Gym says what is left this week.
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-21' })).data.records as { record: { name: string; values: { today_says: string } } }[];
    expect(due.map((d) => [d.record.name, d.record.values.today_says]).sort()).toEqual([
      ['Gym', '1 more this week'],
      ['In bed by 23:00', '0 of 7 this week'],
      ['Read 20 pages', '0 of 7 this week'],
    ]);
    // A third time this week: Gym does not come again till Monday.
    await saveRecordTool(agent, { collection: 'Days/Check-ins', values: { habit: 'Gym', day: '2026-10-21' } });
    const after = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-21' })).data.records as { record: { name: string } }[];
    expect(after.map((d) => d.record.name)).not.toContain('Gym');
    // A goal by a number: behind for its day, on track once updated.
    const books = await saveRecordTool(agent, { collection: 'Days/Goals', values: { name: 'Read 24 books', unit: 'books', target: 24, now: 7, since: '2026-01-01', by: '2026-12-31' } });
    expect(books.data.record.values).toMatchObject({ shown: '7 of 24 books', status: 'Behind' });
    const updated = await saveRecordTool(agent, { collection: 'Days/Goals', id: books.data.record.id, action: 'Update', input: { now: 20 } });
    expect(updated.data.record.values).toMatchObject({ now: 20, shown: '20 of 24 books', status: 'On track' });
    const late = await saveRecordTool(agent, { collection: 'Days/Goals', values: { name: 'Learn to swim', measure: 'Steps', by: '2026-09-30' } });
    expect(late.data.record.problems).toEqual([{ kind: 'check', field: 'by', text: 'Past its day' }]);
    expect(late.data.record.values).toMatchObject({ shown: '0 of 0 steps', progress: 0 });

    const planned = await saveRecordTool(agent, { collection: 'Me/Plan', values: { date: '2026-10-22', type: 'Run', minutes: 45 } });
    expect(planned.data.record.name).toBe('Run');
    const run = await saveRecordTool(agent, { collection: 'Me/Plan', id: planned.data.record.id, action: 'Done' });
    expect(run.data.record.values).toMatchObject({ status: 'Done', workout: expect.objectContaining({ name: 'Run' }) });
    const gym = await saveRecordTool(agent, { collection: 'Me/Workouts', values: { name: 'Push day', when: '2026-10-20T18:00', type: 'Gym', minutes: 60, effort: 12 } });
    expect(gym.data.record.problems).toEqual([{ kind: 'check', field: 'effort', text: 'Effort is from 1 to 10' }]);
    await saveRecordTool(agent, { collection: 'Me/Exercises', values: { name: 'Bench press', muscle: 'Chest' } });
    const set = await saveRecordTool(agent, { collection: 'Me/Sets', values: { workout: 'Push day', exercise: 'Bench press', weight: 80, reps: 5 } });
    expect(set.data.record).toMatchObject({ name: 'Bench press 80 × 5', values: expect.objectContaining({ date: '2026-10-20' }) });
    expect((await recordsTool(agent, { collection: 'Me/Exercises' })).data.records[0]!.values).toMatchObject({ best: 80, last: '2026-10-20' });
    expect((await recordsTool(agent, { collection: 'Me/Workouts', where: [{ field: 'this_week', op: 'true' }] })).data.total).toBe(2);
    await saveRecordTool(agent, { collection: 'Me/Body', values: { date: '2026-10-01', weight: 80 } });
    expect((await saveRecordTool(agent, { collection: 'Me/Body', values: { date: '2026-10-21', weight: 78.5 } })).data.record.values.change).toBe(-1.5);
    const race = await saveRecordTool(agent, { collection: 'Me/Races and goals', values: { name: '10K', date: '2026-10-12', target: 'Under 50 min' } });
    expect(race.data.record.problems).toEqual([{ kind: 'check', field: 'result', text: 'Write how it went' }]);
  });

  it('logs a meeting from a company with its next step, done in Today, a deal won making it a customer; and ships a release asking first when cards are open', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Studio', templates: ['crm', 'product'], currencies: ['TRY'] });
    const firm = await saveRecordTool(agent, { collection: 'Studio/Companies', values: { name: 'Lara Turizm', city: 'Antalya' } });
    const ayse = await saveRecordTool(agent, { collection: 'Studio/People', values: { name: 'Ayşe Kaya', company: 'Lara Turizm', title: 'Project Manager' } });
    // Log: what happened, and the next step; two activities, one done, one planned.
    const logged = await saveRecordTool(agent, {
      collection: 'Studio/Companies',
      id: firm.data.record.id,
      action: 'Log',
      input: { type: 'Meeting', when: '2026-10-21T14:00', with: 'Ayşe Kaya', said: 'They want 10% off', next_type: 'Email', next_what: 'Send the revised offer', next_when: '2026-10-23' },
    });
    expect(logged.data.action?.done).toBe('Logged · Lara Turizm');
    expect(logged.data.record.values).toMatchObject({ last_contact: '2026-10-21T14:00', said: 'Lead · Antalya · 1 person · last contact today' });
    const acts = (await recordsTool(agent, { collection: 'Studio/Activities', sort: { field: 'when' } })).data.records;
    expect(acts.map((a) => [a.name, a.values.done ?? false, a.values.bucket, a.values.with_said])).toEqual([
      ['Meeting with Ayşe Kaya', true, 'Done', 'Lara Turizm · Ayşe Kaya'],
      ['Send the revised offer', false, 'Planned', 'Lara Turizm · Ayşe Kaya'],
    ]);
    expect((await saveRecordTool(agent, { collection: 'Studio/People', id: ayse.data.record.id, values: {} })).data.record.values.said).toBe('Project Manager · Lara Turizm · last contact today');
    // On its day it is in Today with Done, which writes what was said.
    const due = (await dueRecordsTool(agent, { from: '2026-10-23', to: '2026-10-23' })).data.records as { view: string; record: { name: string } }[];
    expect(due.map((d) => d.record.name)).toEqual(['Send the revised offer']);
    const offer = acts[1]!;
    const doneIt = await saveRecordTool(agent, { collection: 'Studio/Activities', id: offer.id, action: 'Done', input: { said: 'Sent it' } });
    expect(doneIt.data.record.values).toMatchObject({ done: true, said: 'Sent it', bucket: 'Done' });
    // A deal won makes the company a customer; one lost says why.
    const deal = await saveCardTool(agent, {}, { board: 'Studio/Deals', title: 'Hotel lifts', values: { company: 'Lara Turizm', value: 16000 } });
    // Plan on the company about the deal: the activity is the deal's, picked by its title.
    await saveRecordTool(agent, { collection: 'Studio/Companies', id: firm.data.record.id, action: 'Plan', input: { type: 'Call', what: 'Call about the lifts', when: '2026-10-24', with: 'Ayşe Kaya', deal: 'Hotel lifts' } });
    const call = (await recordsTool(agent, { collection: 'Studio/Activities' })).data.records.find((a) => a.name === 'Call about the lifts')!;
    expect(call.values).toMatchObject({ deal: expect.objectContaining({ name: 'Hotel lifts' }), with_said: 'Lara Turizm · Hotel lifts' });
    await saveCardTool(agent, {}, { board: 'Studio/Deals', id: deal.data.card.key, column: 'Won' });
    // Won writes Customer in its Type.
    expect((await saveRecordTool(agent, { collection: 'Studio/Companies', id: firm.data.record.id, values: {} })).data.record.values).toMatchObject({ won: 1, stage: 'Customer', type: ['Customer'] });

  });

  it('builds the product: cards that say who asked, a bug reported from a request that opens it again when fixed, and Ship writing the notes and telling those who asked', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Studio', templates: ['crm', 'support', 'product'], currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Studio/Companies', values: { name: 'Acme' } });
    await saveRecordTool(agent, { collection: 'Studio/People', values: { name: 'Ayşe Kaya', company: 'Acme' } });
    await saveRecordTool(agent, { collection: 'Studio/Feedback', values: { name: 'Dark mode', company: 'Acme' } });
    for (const subject of ['Too bright at night', 'A dark theme?']) await saveRecordTool(agent, { collection: 'Studio/Requests', values: { name: subject, person: 'Ayşe Kaya', idea: 'Dark mode' } });
    const v24 = await saveRecordTool(agent, { collection: 'Studio/Releases', values: { name: '2.4', planned: '2026-10-21' } });
    await saveRecordTool(agent, { collection: 'Studio/Releases', values: { name: '2.5', planned: '2026-12-01' } });
    await saveCardTool(agent, {}, { board: 'Studio/Roadmap', title: 'Dark mode', column: 'Shipped', values: { type: 'feature', feedback: ['Dark mode'], release: '2.4' } });
    await saveCardTool(agent, {}, { board: 'Studio/Roadmap', title: 'Bulk edit', column: 'Shipped', values: { type: 'improvement', release: '2.4' } });
    await saveCardTool(agent, {}, { board: 'Studio/Roadmap', title: 'New editor', column: 'Now', values: { type: 'chore', release: '2.4' } });
    // The roadmap's columns, Now, Next and Later; a card says how many asked for it.
    const roadmap = JSON.parse(await fs.readText('Studio/Roadmap.board.json'));
    expect(roadmap.columns.map((c: { name: string }) => c.name)).toEqual(['Ideas', 'Later', 'Next', 'Now', 'Review', 'Shipped', "Won't do"]);
    expect(roadmap.face).toEqual(['type', 'asked_said', 'release']);
    const board = parseBoard(await fs.readText('Studio/Roadmap.board.json'));
    const computer = computerFor(null, [await loadCollection(fs, 'Studio/Feedback'), await loadCollection(fs, 'Studio/Requests')], { 'Studio/Roadmap.board.json': board }, '2026-10-21');
    const dark = board.cards.find((c) => c.title === 'Dark mode')!;
    expect(computer.cardValue('Studio/Roadmap.board.json', dark, board.fields!.find((f) => f.key === 'asked_said')!)).toBe('Asked by 2');

    // Report bug on a request: a card on Bugs; fixed, the request is open again with its reply due.
    const request = (await recordsTool(agent, { collection: 'Studio/Requests' })).data.records[0]!;
    await saveRecordTool(agent, { collection: 'Studio/Requests', id: request.id, values: { status: 'Solved' } });
    await saveRecordTool(agent, { collection: 'Studio/Requests', id: request.id, action: 'Report bug', input: { title: 'Glare in the editor', severity: 'minor' } });
    const bugs = JSON.parse(await fs.readText('Studio/Bugs.board.json'));
    expect(bugs.cards.map((c: { title: string; values: { severity: string; request: { id: string } } }) => [c.title, c.values.severity, c.values.request.id])).toEqual([['Glare in the editor', 'minor', request.id]]);
    await saveCardTool(agent, {}, { board: 'Studio/Bugs', id: String(bugs.cards[0].key), column: 'Fixed' });
    const reopened = (await recordsTool(agent, { collection: 'Studio/Requests' })).data.records.find((r) => r.id === request.id)!;
    expect(reopened.values).toMatchObject({ bug: 'Fixed', bug_said: 'Bug fixed', status: 'Open' });
    expect(reopened.values.reply_due).toMatch(/^2026-10-21T/);

    // Ship: the open card goes to Next with 2.5; the notes from the shipped cards; the feedback done; Acme told.
    const shipped = await saveRecordTool(agent, { collection: 'Studio/Releases', id: v24.data.record.id, action: 'Ship', input: { open: 'Move to the next release', tell: true } });
    expect(shipped.data.record.values).toMatchObject({ status: 'Released', shipped: '2026-10-21', notes: 'New\n- Dark mode\n\nImproved\n- Bulk edit' });
    const after = JSON.parse(await fs.readText('Studio/Roadmap.board.json'));
    const editor = after.cards.find((c: { title: string }) => c.title === 'New editor');
    expect([after.columns.find((c: { id: string }) => c.id === editor.column).name, editor.values.release.name]).toEqual(['Next', '2.5']);
    expect((await recordsTool(agent, { collection: 'Studio/Feedback' })).data.records[0]!.values.status).toBe('done');
    const told = (await recordsTool(agent, { collection: 'Studio/Activities' })).data.records.map((a) => [a.name, (a.values.company as { name: string }).name]);
    expect(told).toEqual([['Tell them: Dark mode is out in 2.4', 'Acme']]);
  });

  it('hires a candidate: a card on Hiring, interviewed with feedback written in Today, an offer made, hired with the first steps and on the team, the position filled', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Team', templates: ['recruiting', 'timeoff'], currencies: ['TRY'] });
    const backend = await saveRecordTool(agent, { collection: 'Team/Positions', values: { name: 'Backend developer', team: 'Platform' } });
    await saveCardTool(agent, {}, { board: 'Team/Hiring', title: 'Ayşe Yılmaz', values: { position: 'Backend developer', source: 'Referral', email: 'ayse@example.com' } });
    await saveCardTool(agent, {}, { board: 'Team/Hiring', title: 'Can Demir', column: 'Screening', values: { position: 'Backend developer' } });
    const position = async () => (await recordsTool(agent, { collection: 'Team/Positions' })).data.records[0]!.values;
    expect(await position()).toMatchObject({ code: 'POS-0001', status: 'Open', owner: 'Kaan', applicants: 2, in_process: 2, hired: 0, pipeline_said: '1 applied · 1 screening', hired_said: '0 of 1', open_said: '0 days' });
    const hiring = JSON.parse(await fs.readText('Team/Hiring.board.json'));
    expect(hiring.face).toEqual(['position', 'source']);
    expect(hiring.press).toEqual({ link: 'position', buttons: ['Schedule interview', 'Make offer'], card: 'candidate', won: 'Hire', lost: 'Reject' });
    const column = async (title: string) => {
      const b = JSON.parse(await fs.readText('Team/Hiring.board.json'));
      const card = b.cards.find((c: { title: string }) => c.title === title);
      return [b.columns.find((c: { id: string }) => c.id === card.column).name, card.values];
    };
    // The card's buttons are its position's, the card given.
    const press = (action: string, input: object) => saveRecordTool(agent, { collection: 'Team/Positions', id: backend.data.record.id, action, input: { candidate: 'Ayşe Yılmaz', ...input } as never });

    await press('Schedule interview', { type: 'Technical', date: '2026-10-21T10:00' });
    const interview = (await recordsTool(agent, { collection: 'Team/Interviews' })).data.records[0]!;
    expect(interview).toMatchObject({ name: 'Technical · Ayşe Yılmaz', values: expect.objectContaining({ date: '2026-10-21T10:00', interviewer: 'Kaan', candidate: expect.objectContaining({ name: 'Ayşe Yılmaz' }), position: expect.objectContaining({ name: 'Backend developer' }) }) });
    // Its time in Today with Write feedback, till it is written.
    const due = async () => ((await dueRecordsTool(agent, { from: '2026-10-21', to: '2026-10-21' })).data.records as { view: string; record: { name: string } }[]).filter((d) => d.view === 'Feedback').map((d) => d.record.name);
    expect(await due()).toEqual(['Technical · Ayşe Yılmaz']);
    const written = await saveRecordTool(agent, { collection: 'Team/Interviews', id: interview.id, action: 'Write feedback', input: { score: '4', verdict: 'Yes', takeaways: 'Solid on Postgres' } });
    expect(written.data.record.values).toMatchObject({ score: 4, verdict: 'Yes', takeaways: 'Solid on Postgres', done: true });
    expect(await due()).toEqual([]);

    await press('Make offer', { salary: 4800, starts: '2026-12-01' });
    expect(await column('Ayşe Yılmaz')).toEqual(['Offer', expect.objectContaining({ offer: 4800, starts: '2026-12-01' })]);
    expect(await position()).toMatchObject({ pipeline_said: '1 screening · 1 offer' });

    const hired = await press('Hire', { starts: '2026-12-01' });
    expect((await column('Ayşe Yılmaz'))[0]).toBe('Hired');
    expect(hired.data.record.values).toMatchObject({ status: 'Filled', hired: 1, in_process: 1, hired_said: '1 of 1', pipeline_said: '1 screening · 1 hired' });
    expect((hired.data.record as { subtasks: { title: string; due: string }[] }).subtasks.map((t) => [t.title, t.due])).toEqual([
      ['Contract signed · Ayşe Yılmaz', '2026-12-01'],
      ['Equipment ready · Ayşe Yılmaz', '2026-12-01'],
      ['Accounts opened · Ayşe Yılmaz', '2026-12-01'],
      ['First week planned · Ayşe Yılmaz', '2026-12-01'],
    ]);
    // With Time off, the one hired is one of the team.
    const team = (await recordsTool(agent, { collection: 'Team/Employees' })).data.records.map((r) => [r.name, r.values.team, r.values.started]);
    expect(team).toEqual([['Ayşe Yılmaz', 'Platform', '2026-12-01']]);
    expect((await refusal(press('Hire', { candidate: 'Can Demir', starts: '2026-12-01' }))).message).toMatch(/Only an open position/);
  });

  it("keeps an asset: checked out with a day to come back and in, its value today, serviced with the next planned and its cost on the budget, repaired, retired", async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Office', templates: ['budget', 'assets'], currencies: ['TRY'] });
    const mac = await saveRecordTool(agent, { collection: 'Office/Assets', values: { name: 'MacBook Pro', category: 'Computers', cost: 90000, bought: '2025-10-21', interval: 'Every 6 months', warranty: '2027-10-01' } });
    expect(mac.data.record.values).toMatchObject({ code: 'AST-0001', status: 'Available', life: 3, next_service: '2026-04-21', in_warranty: true });
    const id = mac.data.record.id;
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Office/Assets', id, action, ...(input && { input: input as never }) });
    // A year of its three: two thirds of what it cost.
    expect((await recordsTool(agent, { collection: 'Office/Assets' })).data.records[0]!.values.value).toBe(60000);
    const out = (await press('Check out', { to: 'Kaan', back: '2026-11-20' })).data.record.values;
    expect(out).toMatchObject({ holder: 'Kaan', status: 'In use', due_back: '2026-11-20', since: '2026-10-21', state: 'Due back Nov 20' });
    expect((await press('Check in', { came: 'Needs repair' })).data.record.values).toMatchObject({ status: 'In repair' });
    expect((await press('Back from repair', { cost: 1200, note: 'Battery' })).data.record.values).toMatchObject({ status: 'Available' });
    const serviced = await press('Service done', { cost: 1500 });
    expect(serviced.data.record.values).toMatchObject({ next_service: '2027-04-21' });
    const history = (await recordsTool(agent, { collection: 'Office/Maintenance' })).data.records.map((r) => [r.values.type, r.values.status, r.values.cost ?? null]);
    expect(history).toEqual(expect.arrayContaining([['Checked out', 'Done', null], ['Checked in', 'Done', null], ['Repair', 'Done', 1200], ['Service', 'Done', 1500]]));
    const owed = (await recordsTool(agent, { collection: 'Office/Payments' })).data.records.map((r) => [r.values.amount, r.values.direction, r.values.status, (r.values.budget_line as { name: string }).name]);
    expect(owed).toEqual(expect.arrayContaining([[1200, 'Out', 'Invoiced', 'Maintenance'], [1500, 'Out', 'Invoiced', 'Maintenance']]));
    expect((await press('Retire')).data.record.values).toMatchObject({ status: 'Retired' });
    expect(await press('Check out', { to: 'Kaan' }).catch((e: Error) => e)).toBeInstanceOf(Error);
  });

  it('plans content: its steps back from its day by its type, moved with it, reviewed and published; a campaign adding its pieces', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Marketing', templates: ['budget', 'product', 'content'], answers: { content: { campaigns: true } }, currencies: ['TRY'] });
    const piece = await saveRecordTool(agent, { collection: 'Marketing/Content', values: { name: 'Dark mode teaser', channel: 'LinkedIn', type: 'Article', goes_out: '2026-11-06T09:00' } });
    const id = piece.data.record.id;
    const read = async () => (await recordsTool(agent, { collection: 'Marketing/Content' })).data.records.find((r) => r.id === id)!.values;
    const steps = async () => (await recordsTool(agent, { collection: 'Marketing/Content steps', sort: { field: 'due' } })).data.records.filter((r) => (r.values.piece as { id: string }).id === id).map((r) => [r.name, r.values.due]);
    // An article's steps, each so many days before it goes out.
    expect(await steps()).toEqual([
      ['Outline', '2026-10-30'],
      ['Draft', '2026-11-01'],
      ['Images', '2026-11-03'],
      ['Review', '2026-11-04'],
    ]);
    expect(await read()).toMatchObject({ status: 'Idea', steps_said: '0 of 4', out_said: 'Fri, Nov 6' });
    // Its day moved a week, its steps move with it.
    await saveRecordTool(agent, { collection: 'Marketing/Content', id, values: { goes_out: '2026-11-13T09:00' } });
    expect((await steps())[0]).toEqual(['Outline', '2026-11-06']);
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Marketing/Content', id, action, ...(input && { input: input as never }) });
    await press('Send for review', { who: 'Kaan' });
    expect(await read()).toMatchObject({ status: 'Review', reviewer: 'Kaan', review_on: '2026-10-21' });
    await press('Request changes', { what: 'A shorter caption' });
    expect(await read()).toMatchObject({ status: 'Writing', changes: 'A shorter caption' });
    await press('Send for review', { who: 'Kaan' });
    await press('Approve');
    expect(await read()).toMatchObject({ status: 'Scheduled' });
    expect((await read()).changes ?? null).toBeNull();
    await press('Publish', { link: 'https://linkedin.com/p/1' });
    expect(await read()).toMatchObject({ status: 'Published', link: 'https://linkedin.com/p/1', published_on: '2026-10-21' });

    // A campaign plans its pieces, in Writing, with their steps; it counts those out.
    await saveRecordTool(agent, { collection: 'Marketing/Budget lines', values: { name: 'Launch ads', planned: 20000 } });
    const launch = await saveRecordTool(agent, { collection: 'Marketing/Campaigns', values: { name: 'Launch', start: '2026-11-01', end: '2026-11-30', budget_line: 'Launch ads' } });
    const planned = await saveRecordTool(agent, { collection: 'Marketing/Campaigns', id: launch.data.record.id, action: 'Plan content', input: { title: 'Launch post', channel: 'Blog', type: 'Post', day: '2026-11-05T10:00' } });
    expect(planned.data.record.values).toMatchObject({ status: 'Running', pieces: 1, out: 0, out_said: '0 of 1 out', spent: 0 });
    const post = (await recordsTool(agent, { collection: 'Marketing/Content' })).data.records.find((r) => r.name === 'Launch post')!;
    expect(post.values).toMatchObject({ status: 'Writing', channel: 'Blog', campaign: expect.objectContaining({ name: 'Launch' }), steps_said: '0 of 3' });
    const late = await saveRecordTool(agent, { collection: 'Marketing/Campaigns', id: launch.data.record.id, values: { end: '2026-10-01' } });
    expect(late.data.record.problems).toEqual([{ kind: 'check', field: 'end', text: 'The end is before the start' }]);
  });

  it('keeps one list of places for Stock and Assets', async () => {
    const { agent } = await world();
    await createTool(agent, {
      kind: 'app',
      name: 'Depot',
      templates: ['stock', 'assets'],
      answers: { stock: { locations: true, purchasing: false }, assets: { places: true, placeList: ['Main warehouse', 'Head office'] } },
      currencies: ['EUR'],
    });
    const places = (await recordsTool(agent, { collection: 'Depot/Locations' })).data.records.map((r) => r.name);
    expect(places.sort()).toEqual(['Head office', 'Main warehouse', 'Second warehouse']);
    const forklift = await saveRecordTool(agent, { collection: 'Depot/Assets', values: { name: 'Forklift', location: 'Main warehouse' } });
    expect(forklift.data.record.values).toMatchObject({ location: expect.objectContaining({ name: 'Main warehouse' }) });
  });

  it('keeps a day with its time, a time and a duration as their fields hold them', async () => {
    const { fs, agent } = await world();
    const schema = { version: 2, template: 'blank', fields: [
      { key: 'name', label: 'Name', type: 'name' },
      { key: 'starts', label: 'Starts', type: 'date', time: true },
      { key: 'duration', label: 'Duration', type: 'number', format: { style: 'duration' } },
      { key: 'ends', label: 'Ends', type: 'formula', formula: 'starts + minutes(duration)' },
      { key: 'arrival', label: 'Arrival window', type: 'time' },
      { key: 'next', label: 'Next visit', type: 'date' },
    ] };
    await fs.writeText('Visits/_collection.json', JSON.stringify(schema));
    const saved = await saveRecordTool(agent, { collection: 'Visits', values: { name: 'Planned maintenance', starts: '2026-10-22 14:30', duration: 90, arrival: '9:05', next: '2027-01-21T10:00' } });
    expect(saved.data.record.values).toMatchObject({ starts: '2026-10-22T14:30', ends: '2026-10-22T16:00', arrival: '09:05', next: '2027-01-21' });
    expect(saved.data.record.problems).toBeUndefined();
    const wrong = await saveRecordTool(agent, { collection: 'Visits', values: { name: 'Rope tension', arrival: 'noon' } });
    expect(wrong.data.record.problems?.[0]).toMatchObject({ field: 'arrival' });
  });

  it('adds a template to an app, says what it added, and refuses what is wrong', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['crm'], currencies: ['TRY'] });
    const again = await createTool(agent, { kind: 'app', name: 'Atlas', templates: ['crm'] });
    expect(again.data).toMatchObject({ exists: true, path: 'Atlas' });
    const added = await createTool(agent, { kind: 'app', folder: 'Atlas', name: '', templates: ['support', 'product'], answers: { product: { bugs: false } } });
    expect(added.data).toMatchObject({ created: false, templates: ['crm', 'support', 'product'], changed: ['Companies: 2 blocks on its screen', 'People: 2 blocks on its screen'] });
    expect((added.data as { made: string[] }).made).toEqual(['collection Atlas/Requests', 'collection Atlas/Messages', 'collection Atlas/Feedback', 'folder Atlas/Saved replies', 'board Atlas/Roadmap.board.json', 'collection Atlas/Releases']);
    const about = (await readTool(agent, { path: 'Atlas/About Atlas.md' })).data.text;
    expect(about).toMatch(/## CRM[\s\S]*## Customer support[\s\S]*## Product development/);
    const app = JSON.parse((await readTool(agent, { path: 'Atlas/_app.json' })).data.text);
    expect(app.templates.map((x: { id: string }) => x.id)).toEqual(['crm', 'support', 'product']);
    expect((await refusal(writeTool(agent, { path: 'Atlas/_app.json', text: '{}' }))).message).toMatch(/read, not written/);
    const wrong = await refusal(createTool(agent, { kind: 'app', name: 'Shop', templates: ['sales'], answers: { sales: { tax: 'yes' } } }));
    expect(wrong.details.problems).toEqual(['sales.tax: the answer is true or false', 'Give the currencies the app keeps money in, like TRY or EUR; the first is the main one']);
    // A template the app has is not set up again: its answers are taken, here the same as before.
    expect((await createTool(agent, { kind: 'app', folder: 'Atlas', name: '', templates: ['crm'] })).data).toMatchObject({ message: 'Every answer is as it was; nothing was changed.' });
  });

  it('says whom each template is for, and refuses an app of both sides', async () => {
    const { agent } = await world();
    const listed = (await refusal(createTool(agent, { kind: 'app', name: 'Home', templates: ['nope'] }))).details.templates as { id: string; audience: string }[];
    expect(listed.find((x) => x.id === 'crm')!.audience).toBe('business');
    expect(listed.find((x) => x.id === 'finance')!.audience).toBe('personal');
    const mixed = await refusal(createTool(agent, { kind: 'app', name: 'Home', templates: ['crm', 'finance'], currencies: ['TRY'] }));
    expect(mixed.details.problems).toEqual(['An app is set up from templates for a business or for a person, not both: crm for a business, finance for a person. Set them up as two apps']);
    // A person's templates go in one app only with those they share data with.
    const apart = await refusal(createTool(agent, { kind: 'app', name: 'Home', templates: ['habits', 'recipes'] }));
    expect(apart.details.problems).toEqual(['Recipes and Habits share no data: set them up as separate apps']);
    expect((await createTool(agent, { kind: 'app', name: 'Fit', templates: ['sport', 'gym'] })).data).toMatchObject({ templates: ['sport', 'gym'] });
  });

  it('adds a template that keeps money to an app that has no currencies, with the ones given', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Mine', templates: ['content'] });
    const none = await refusal(createTool(agent, { kind: 'app', folder: 'Mine', name: '', templates: ['budget'] }));
    expect(none.details.problems).toEqual(['Give the currencies the app keeps money in, like TRY or EUR; the first is the main one']);
    const added = await createTool(agent, { kind: 'app', folder: 'Mine', name: '', templates: ['budget'], currencies: ['TRY'] });
    expect(added.data).toMatchObject({ templates: ['content', 'budget'] });
    expect(JSON.parse((await readTool(agent, { path: 'Mine/_app.json' })).data.text).currencies).toEqual(['TRY']);
  });
});

