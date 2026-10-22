import { APP_TEMPLATES, type Answers, audienceOf, MemoryFs, saveMe, TEMPLATE_GROUPS, TEMPLATE_IDS, type TemplateId } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { checkFile, checkRules } from './check';
import { fileKind, Refusal } from './paths';
import { readTool } from './read';
import { dueRecordsTool, recordsTool, saveRecordTool } from './records';
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
  appointments: { for: 'both', by: 'team', staff: ['Ayşe', 'Mehmet'], fee: true, payments: true },
  projects: { for: 'both', time: true, budget: true },
  budget: { periods: 'monthly', due: true, expenses: true, expected: true },
  stock: { purchasing: true, locations: true, deduct: 'confirmed', payables: true },
  ecommerce: { returns: true, budget: true },
  product: { bugs: true, releases: true, phases: true, feedback: true },
  recruiting: { interviews: true, scores: true },
  assets: { assign: true, service: true, places: true, costs: true },
  content: { campaigns: true },
  subscriptions: { sells: 'memberships', trial: true, customers: 'people', payments: true },
  contracts: { notice: '60', seats: true },
  timeoff: { allowance: '25', holidays: 'gb', approvals: true },
  goals: { period: 'half', checkins: true },
  incidents: { actions: true },
};
const LEAST: { [id in TemplateId]: Answers } = {
  crm: { customers: 'people', deals: false },
  sales: { sells: 'services', tax: false, discount: false, quotes: false },
  support: { channels: [], feedback: false, replies: false },
  appointments: { for: 'resources', by: 'me', resources: [], fee: false },
  projects: { for: 'internal', time: false, budget: false, steps: [] },
  budget: { periods: 'none', due: false, expenses: false, categories: [] },
  stock: { purchasing: false, locations: false, deduct: 'no' },
  ecommerce: { channels: [], carriers: [], returns: false, budget: false },
  product: { bugs: false, releases: false, phases: false, feedback: false },
  recruiting: { stages: [], sources: [], interviews: false, steps: [] },
  assets: { categories: [], assign: false, service: false, places: false, costs: false },
  content: { channels: [], stages: [], campaigns: false },
  subscriptions: { sells: 'agreements', plans: [], trial: false, customers: 'companies', payments: false },
  contracts: { kinds: [], notice: '0', seats: false },
  timeoff: { types: [], allowance: '10', holidays: 'none', approvals: false },
  goals: { period: 'year', checkins: false },
  incidents: { types: [], actions: false },
};

/**
 * The sets of templates tried (design/more-apps.md 7): each alone, each with each other of its
 * side, and each group's and each side's all together. Every set would be too many.
 */
const setsToTry = (): TemplateId[][] => {
  const sideOf = (id: TemplateId) => audienceOf(APP_TEMPLATES[id].group);
  const out: TemplateId[][] = TEMPLATE_IDS.map((id) => [id]);
  TEMPLATE_IDS.forEach((a, i) => {
    for (const b of TEMPLATE_IDS.slice(i + 1)) if (sideOf(a) === sideOf(b)) out.push([a, b]);
  });
  for (const groups of Object.values(TEMPLATE_GROUPS)) {
    for (const group of groups) out.push(TEMPLATE_IDS.filter((id) => APP_TEMPLATES[id].group === group));
    out.push(TEMPLATE_IDS.filter((id) => (groups as readonly string[]).includes(APP_TEMPLATES[id].group)));
  }
  return out.filter((set) => set.length > 0);
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

  it('sells on a channel: what an order earns, its shipping and payout, a return back into stock and paid back', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Shop', templates: ['sales', 'ecommerce', 'stock', 'budget'], currencies: ['TRY'], answers: { sales: { tax: false } } });
    await saveRecordTool(agent, { collection: 'Shop/Channels', id: 'Amazon', values: { commission: 0.2, fee: 5, payout_days: 7 } });
    await saveRecordTool(agent, { collection: 'Shop/Products', values: { name: 'Lamp', price: 100, cost: 40 } });
    const order = await saveRecordTool(agent, { collection: 'Shop/Orders', values: { channel: 'Amazon', status: 'Confirmed', ship_by: '2026-10-20', shipping_cost: 10 } });
    const id = order.data.record.id;
    const code = order.data.record.values.code as string;
    await saveRecordTool(agent, { collection: 'Shop/Order lines', values: { name: 'Lamp', order: code, product: 'Lamp', quantity: 2, unit_price: 100 } });
    const read = async () => (await recordsTool(agent, { collection: 'Shop/Orders' })).data.records.find((r) => r.id === id)!;
    // 200 less a commission of 20% and 5, the shipping and what the lamps cost.
    expect((await read()).values).toMatchObject({ total: 200, commission: 45, cost: 80, net_profit: 65 });
    expect((await read()).problems).toEqual([expect.objectContaining({ field: 'ship_by', text: 'Late to ship' })]);
    const shipped = await saveRecordTool(agent, { collection: 'Shop/Orders', id, action: 'Ship', input: { carrier: 'DHL', tracking: 'JD0001' } });
    expect(shipped.data.record.values).toMatchObject({ status: 'Shipped', carrier: 'DHL', tracking: 'JD0001' });
    expect((await read()).problems ?? []).toEqual([]);
    await saveRecordTool(agent, { collection: 'Shop/Orders', id, values: { status: 'Delivered' } });
    const payout = (await recordsTool(agent, { collection: 'Shop/Payments' })).data.records.find((p) => p.name === `${code} payout`)!;
    expect(payout.values).toMatchObject({ direction: 'In', amount: 155, status: 'Planned', due: '2026-10-28', order: { id } });
    // Paid, it leaves nothing to collect: the channel kept its commission.
    await saveRecordTool(agent, { collection: 'Shop/Payments', id: payout.id, values: { status: 'Paid' } });
    expect((await read()).values).toMatchObject({ collected: 155, remaining: 0 });
    // The lamps of a cancelled order are not sold.
    const cancelled = await saveRecordTool(agent, { collection: 'Shop/Orders', values: { channel: 'Amazon', status: 'Cancelled' } });
    await saveRecordTool(agent, { collection: 'Shop/Order lines', values: { name: 'Lamp', order: cancelled.data.record.values.code as string, product: 'Lamp', quantity: 5, unit_price: 100 } });
    expect((await recordsTool(agent, { collection: 'Shop/Products' })).data.records[0]!.values).toMatchObject({ sold: 2, profit: 120 });
    await saveRecordTool(agent, { collection: 'Shop/Orders', id, action: 'Return', input: { product: 'Lamp', quantity: 1, reason: 'Damaged' } });
    const back = (await recordsTool(agent, { collection: 'Shop/Returns' })).data.records[0]!;
    expect(back.values).toMatchObject({ name: `Return of ${code}`, order: { id }, quantity: 1, status: 'Requested', channel: { name: 'Amazon' } });
    await saveRecordTool(agent, { collection: 'Shop/Returns', id: back.id, values: { status: 'Received' } });
    const moves = (await recordsTool(agent, { collection: 'Shop/Stock movements' })).data.records;
    expect(moves.filter((m) => m.values.type === 'return').map((m) => [m.values.direction, m.values.quantity])).toEqual([['In', 1]]);
    await saveRecordTool(agent, { collection: 'Shop/Returns', id: back.id, values: { status: 'Refunded', refund: 100 } });
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

  it('keeps a membership on its plan: renewed a period on with its payment, marked when its day has passed, paused and cancelled', async () => {
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
    expect(ayse.data.record).toMatchObject({ name: 'Ayşe Yılmaz · Yearly', values: expect.objectContaining({ amount: 6000, period: 'Yearly', renews: '2027-09-01', status: 'Active', monthly_value: 500 }) });
    const id = ayse.data.record.id;
    const renewed = await saveRecordTool(agent, { collection: 'Gym/Memberships', id, action: 'Renew' });
    expect(renewed.data.record.values.renews).toBe('2028-09-01');
    const payments = (await recordsTool(agent, { collection: 'Gym/Payments' })).data.records;
    expect(payments.map((p) => p.values)).toEqual([expect.objectContaining({ direction: 'In', amount: 6000, status: 'Invoiced', due: '2027-09-01', budget_line: expect.objectContaining({ name: 'Memberships' }), subscription: expect.objectContaining({ id }) })]);
    expect((await recordsTool(agent, { collection: 'Gym/Plans', where: [{ field: 'name', op: 'is', value: 'Yearly' }] })).data.records[0]!.values).toMatchObject({ active: 1, monthly_value: 500 });

    // One whose renewal day has passed is marked until it is renewed, paused or cancelled.
    const can = await saveRecordTool(agent, { collection: 'Gym/Memberships', values: { customer: 'Can Demir', plan: 'Monthly', start: '2026-08-15' } });
    expect(can.data.record.values.renews).toBe('2026-09-15');
    expect(can.data.record.problems).toEqual([{ kind: 'check', field: 'renews', text: 'The renewal day has passed: renew it, or cancel it' }]);
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Gym/Memberships', id: can.data.record.id, action, ...(input && { input: input as never }) });
    const paused = (await press('Pause')).data.record;
    expect([paused.values.status, paused.problems]).toEqual(['Paused', undefined]);
    expect((await press('Resume')).data.record.values.status).toBe('Active');
    const cancelled = await press('Cancel', { reason: 'Moved away' });
    expect(cancelled.data.record.values).toMatchObject({ status: 'Cancelled', cancelled_on: '2026-10-21', reason: 'Moved away' });
    expect((await recordsTool(agent, { collection: 'Gym/People', where: [{ field: 'name', op: 'is', value: 'Can Demir' }] })).data.records[0]!.values).toMatchObject({ active_memberships: 0 });
  });

  it('keeps contracts: the day to cancel by in Upcoming, marked when notice passed on one that renews, renewed a period on', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Office', templates: ['contracts'], currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Office/Companies', values: { name: 'Kule Gayrimenkul' } });
    await saveRecordTool(agent, { collection: 'Office/Companies', values: { name: 'Ofis Teknik' } });
    const lease = await saveRecordTool(agent, { collection: 'Office/Contracts', values: { name: 'Office lease', party: 'Kule Gayrimenkul', type: 'Lease', start: '2026-01-01', ends: '2026-12-31', amount: 40000, period: 'Monthly' } });
    expect(lease.data.record.values).toMatchObject({ status: 'Active', owner: 'Kaan', auto_renews: true, notice_days: 30, cancel_by: '2026-12-01', yearly: 480000 });
    expect(lease.data.record.problems).toBeUndefined();
    const copier = await saveRecordTool(agent, { collection: 'Office/Contracts', values: { name: 'Copier service', party: 'Ofis Teknik', type: 'Service', start: '2025-11-11', ends: '2026-11-10', amount: 12000 } });
    expect(copier.data.record.values).toMatchObject({ period: 'Yearly', cancel_by: '2026-10-11' });
    expect(copier.data.record.problems).toEqual([{ kind: 'check', field: 'cancel_by', text: 'Notice passed; it renews' }]);
    const renewed = await saveRecordTool(agent, { collection: 'Office/Contracts', id: copier.data.record.id, action: 'Renew' });
    expect(renewed.data.record.values).toMatchObject({ start: '2026-11-11', ends: '2027-11-10', cancel_by: '2027-10-11' });
    expect(renewed.data.record.problems).toBeUndefined();
    // Upcoming brings the day to cancel by; it is worked out, and stays as it is.
    const due = (await dueRecordsTool(agent, { from: '2026-10-21', to: '2027-12-31' })).data.records as { view: string; start: string; record: { name: string } }[];
    expect(due.map((d) => [d.record.name, d.view, d.start])).toEqual([
      ['Office lease', 'Cancel by', '2026-12-01'],
      ['Copier service', 'Cancel by', '2027-10-11'],
    ]);
    const ended = await saveRecordTool(agent, { collection: 'Office/Contracts', id: lease.data.record.id, action: 'End' });
    expect(ended.data.record.values.status).toBe('Ended');
  });

  it('keeps leave: its days without weekends and holidays, approved and counted, marked when it overlaps or goes past the days left, and the one hired on the team', async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Team', templates: ['recruiting', 'timeoff'], answers: { timeoff: { holidays: 'tr' } } });
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

    // The one hired is added to the team.
    await saveRecordTool(agent, { collection: 'Team/Positions', values: { name: 'Backend developer', team: 'Platform' } });
    const can = await saveRecordTool(agent, { collection: 'Team/Candidates', values: { name: 'Can Demir', email: 'can@example.com' } });
    await saveRecordTool(agent, { collection: 'Team/Candidates', id: can.data.record.id, action: 'Hire', input: { position: 'Backend developer', start: '2026-11-02' } });
    const team = (await recordsTool(agent, { collection: 'Team/Employees', sort: { field: 'name' } })).data.records.map((r) => [r.name, r.values.team, r.values.started, r.values.email]);
    expect(team).toEqual([
      ['Ayşe Yılmaz', 'Platform', undefined, undefined],
      ['Can Demir', 'Platform', '2026-11-02', 'can@example.com'],
    ]);
  });

  it('measures a goal by its key results, updated with a check-in, and marks one past its due day', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Plan', templates: ['product', 'goals'] });
    const goal = await saveRecordTool(agent, { collection: 'Plan/Goals', values: { name: 'Grow revenue', due: '2026-12-31' } });
    expect(goal.data.record.values).toMatchObject({ period: '2026 Q4', owner: 'Kaan', status: 'On track' });
    const kr = await saveRecordTool(agent, { collection: 'Plan/Key results', values: { name: 'Monthly revenue', goal: 'Grow revenue', target: 100000, current: 10000, unit: 'TRY' } });
    expect(kr.data.record.values).toMatchObject({ start: 0, progress: 0.1 });
    const updated = await saveRecordTool(agent, { collection: 'Plan/Key results', id: kr.data.record.id, action: 'Update', input: { value: 25000, note: 'Two new customers' } });
    expect(updated.data.record.values).toMatchObject({ current: 25000, progress: 0.25, last_check_in: '2026-10-21' });
    expect((await recordsTool(agent, { collection: 'Plan/Check-ins' })).data.records.map((r) => [r.name, r.values.value, r.values.note])).toEqual([['25000 TRY', 25000, 'Two new customers']]);
    expect((await recordsTool(agent, { collection: 'Plan/Goals' })).data.records[0]!.values.progress).toBe(0.25);
    const late = await saveRecordTool(agent, { collection: 'Plan/Goals', values: { name: 'Ship the beta', due: '2026-10-01' } });
    expect(late.data.record.problems).toEqual([{ kind: 'check', field: 'due', text: 'Past its due day' }]);
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
    const requests = JSON.parse(await fs.readText('Ops/Requests.board.json'));
    expect(requests.fields.find((f: { key: string }) => f.key === 'incident')).toMatchObject({ type: 'link', collection: 'Ops/Incidents' });
  });

  it('logs a call from a company, and ships a release asking first when cards are open', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Studio', templates: ['crm', 'product'], answers: { crm: { deals: false } } });
    const firm = await saveRecordTool(agent, { collection: 'Studio/Companies', values: { name: 'Lara Turizm' } });
    const called = await saveRecordTool(agent, { collection: 'Studio/Companies', id: firm.data.record.id, action: 'Log a call' });
    // A call logged is now: its day and its time.
    expect(called.data.record.values.last_contact).toMatch(/^2026-10-21T\d\d:\d\d$/);
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

  it('hires a candidate: on the board, interviewed and scored, hired with the first steps, the position filled', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Team', templates: ['recruiting'] });
    await saveRecordTool(agent, { collection: 'Team/Positions', values: { name: 'Backend developer', team: 'Platform' } });
    const ayse = await saveRecordTool(agent, { collection: 'Team/Candidates', values: { name: 'Ayşe Yılmaz', source: 'Referral' } });
    const id = ayse.data.record.id;
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Team/Candidates', id, action, ...(input && { input: input as never }) });
    await press('Add to position', { position: 'Backend developer' });
    const board = async () => JSON.parse(await fs.readText('Team/Hiring.board.json'));
    const column = async () => {
      const b = await board();
      return b.columns.find((c: { id: string }) => c.id === b.cards[0].column).name;
    };
    expect((await board()).cards.map((c: { title: string; values: object }) => [c.title, c.values])).toEqual([
      ['Ayşe Yılmaz', { candidate: expect.objectContaining({ name: 'Ayşe Yılmaz' }), position: expect.objectContaining({ name: 'Backend developer' }) }],
    ]);
    expect(await column()).toBe('Applied');
    const position = async () => (await recordsTool(agent, { collection: 'Team/Positions' })).data.records[0]!.values;
    expect(await position()).toMatchObject({ code: 'POS-0001', status: 'Open', openings: 1, applicants: 1, in_process: 1, hired: 0, left: 1, owner: 'Kaan' });

    await press('Schedule interview', { position: 'Backend developer', date: '2026-10-23', type: 'Technical' });
    const interview = (await recordsTool(agent, { collection: 'Team/Interviews' })).data.records[0]!;
    expect(interview).toMatchObject({ name: 'Technical with Ayşe Yılmaz', values: expect.objectContaining({ date: '2026-10-23', interviewer: 'Kaan', candidate: expect.objectContaining({ name: 'Ayşe Yılmaz' }) }) });
    const scored = await saveRecordTool(agent, { collection: 'Team/Interviews', id: interview.id, values: { score: 7 } });
    expect(scored.data.record.problems).toEqual([{ kind: 'check', field: 'score', text: 'A score is from 1 to 5' }]);
    await saveRecordTool(agent, { collection: 'Team/Interviews', id: interview.id, values: { score: 4, recommendation: 'Yes' } });

    const hired = await press('Hire', { position: 'Backend developer', start: '2026-11-02' });
    expect(hired.data.record.values).toMatchObject({ hired_for: expect.objectContaining({ name: 'Backend developer' }), start: '2026-11-02', interview_count: 1, score: 4 });
    expect((hired.data.record as { subtasks: { title: string; due: string }[] }).subtasks.map((t) => [t.title, t.due])).toEqual([
      ['Contract signed', '2026-11-02'],
      ['Equipment ready', '2026-11-02'],
      ['Accounts opened', '2026-11-02'],
      ['First week planned', '2026-11-02'],
    ]);
    expect(await column()).toBe('Hired');
    expect(await position()).toMatchObject({ status: 'Filled', applicants: 1, in_process: 0, hired: 1, left: 0 });
    expect((await refusal(press('Hire', { position: 'Backend developer', start: '2026-11-02' }))).message).toMatch(/Hired already/);
  });

  it("keeps an asset: given and taken back, serviced with the next one planned and its cost on the budget, retired", async () => {
    const { agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Office', templates: ['budget', 'assets'], currencies: ['TRY'] });
    const mac = await saveRecordTool(agent, { collection: 'Office/Assets', values: { name: 'MacBook Pro', category: 'Computers', cost: 90000, interval: 'Every 6 months', warranty: '2027-10-01' } });
    expect(mac.data.record.values).toMatchObject({ code: 'AST-0001', status: 'In storage', in_warranty: true, maintenance_cost: 0 });
    const id = mac.data.record.id;
    const press = (action: string, input?: object) => saveRecordTool(agent, { collection: 'Office/Assets', id, action, ...(input && { input: input as never }) });
    expect((await press('Assign', { to: 'Kaan' })).data.record.values).toMatchObject({ holder: 'Kaan', status: 'In use' });

    const serviced = await press('Log maintenance', { type: 'Planned', cost: 1500 });
    expect(serviced.data.record.values).toMatchObject({ last_service: '2026-10-21', next_service: '2027-04-21', maintenance_cost: 1500 });
    const jobs = (await recordsTool(agent, { collection: 'Office/Maintenance' })).data.records.map((r) => [r.name, r.values.status, r.values.date]);
    expect(jobs).toEqual(expect.arrayContaining([['Service of MacBook Pro', 'Done', '2026-10-21'], ['Service of MacBook Pro', 'Planned', '2027-04-21']]));
    const owed = (await recordsTool(agent, { collection: 'Office/Payments' })).data.records.map((r) => r.values);
    expect(owed).toEqual([expect.objectContaining({ name: 'Service of MacBook Pro', direction: 'Out', amount: 1500, status: 'Invoiced', budget_line: expect.objectContaining({ name: 'Maintenance' }) })]);

    expect((await press('Return')).data.record.values).toMatchObject({ status: 'In storage' });
    expect((await refusal(press('Return'))).message).toMatch(/It is with nobody/);
    expect((await press('Retire')).data.record.values).toMatchObject({ status: 'Retired' });
    expect((await refusal(press('Assign', { to: 'Kaan' }))).message).toMatch(/A retired asset is with nobody/);
  });

  it('plans a campaign: a card on its day, counted by the campaign, linked to a release and a budget line', async () => {
    const { fs, agent } = await world();
    await createTool(agent, { kind: 'app', name: 'Marketing', templates: ['budget', 'product', 'content'], answers: { content: { campaigns: true } }, currencies: ['TRY'] });
    await saveRecordTool(agent, { collection: 'Marketing/Budget lines', values: { name: 'Launch ads', planned: 20000 } });
    const launch = await saveRecordTool(agent, { collection: 'Marketing/Campaigns', values: { name: 'Launch', start: '2026-11-01', end: '2026-11-30', budget_line: 'Launch ads' } });
    const planned = await saveRecordTool(agent, { collection: 'Marketing/Campaigns', id: launch.data.record.id, action: 'Plan content', input: { title: 'Launch post', channel: 'Blog', day: '2026-11-05' } });
    expect(planned.data.record.values).toMatchObject({ pieces: 1, published: 0, spent: 0 });
    const board = JSON.parse(await fs.readText('Marketing/Content.board.json'));
    expect(board.columns.map((c: { name: string; kind: string }) => [c.name, c.kind])).toEqual([
      ['Ideas', 'backlog'],
      ['Writing', 'active'],
      ['Review', 'active'],
      ['Scheduled', 'active'],
      ['Published', 'done'],
    ]);
    expect(board.cards.map((c: { title: string; due: string; values: object }) => [c.title, c.due, c.values])).toEqual([
      ['Launch post', '2026-11-05', { campaign: expect.objectContaining({ name: 'Launch' }), channel: 'Blog' }],
    ]);
    expect(board.fields.map((f: { key: string }) => f.key)).toEqual(['channel', 'type', 'link', 'release', 'campaign']);
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

  it('says whom each template is for, and refuses an app of both sides', async () => {
    const { agent } = await world();
    const listed = (await refusal(createTool(agent, { kind: 'app', name: 'Home', templates: [] }))).details.templates as { id: string; audience: string }[];
    expect(listed.find((x) => x.id === 'crm')!.audience).toBe('business');
    // Content taken as a person's for a while.
    const was = APP_TEMPLATES.content.group;
    APP_TEMPLATES.content.group = 'life';
    try {
      const mixed = await refusal(createTool(agent, { kind: 'app', name: 'Home', templates: ['crm', 'content'], currencies: ['TRY'] }));
      expect(mixed.details.problems).toEqual(['An app is set up from templates for a business or for a person, not both: crm for a business, content for a person. Set them up as two apps']);
    } finally {
      APP_TEMPLATES.content.group = was;
    }
  });
});

