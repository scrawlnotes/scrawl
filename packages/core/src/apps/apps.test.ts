import { describe, expect, it } from 'vitest';
import { parseBoard } from '../board';
import { addRecord, type Collection, loadCollection, parseSchema, serializeSchema } from '../collection';
import { Computer } from '../compute';
import { MemoryFs } from '../fs';
import { linksIn, resolveHref } from '../links';
import { APP_FILE, AppProblems, planApp } from './build';
import { installApp, undoApp } from './install';
import { readAnswers, TEMPLATES } from './questions';
import { findApp } from './roles';
import { type Answers, audienceOf, TEMPLATE_GROUPS, TEMPLATE_IDS, type TemplateId } from './types';

let n = 0;
const ids = () => `id${++n}`;

/**
 * The sets of templates tried (design/more-apps.md 7): each alone, each with each other of its
 * side, and each group's and each side's all together. Every set would be too many.
 */
const setsToTry = (): TemplateId[][] => {
  const sideOf = (id: TemplateId) => audienceOf(TEMPLATES[id].group);
  const out: TemplateId[][] = TEMPLATE_IDS.map((id) => [id]);
  TEMPLATE_IDS.forEach((a, i) => {
    for (const b of TEMPLATE_IDS.slice(i + 1)) if (sideOf(a) === sideOf(b)) out.push([a, b]);
  });
  for (const groups of Object.values(TEMPLATE_GROUPS)) {
    for (const group of groups) out.push(TEMPLATE_IDS.filter((id) => TEMPLATES[id].group === group));
    out.push(TEMPLATE_IDS.filter((id) => (groups as readonly string[]).includes(TEMPLATES[id].group)));
  }
  return out.filter((set) => set.length > 0);
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
  field: { technicians: ['Ali', 'Veli'], contracts: true, stock: true, invoice: true },
  consulting: { time: true, deadlines: true, customers: 'people', payments: true },
  association: { dues: 'monthly', donations: true, campaigns: true, payments: true },
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
  field: { jobs: [], contracts: false, stock: false, invoice: false },
  consulting: { models: [], time: false, deadlines: false, payments: false },
  association: { dues: 'none', types: [], donations: false },
};

/** What a template asks of these, given only the questions it asks with this set. */
const given = (set: TemplateId[], all: { [id in TemplateId]: Answers }) =>
  set.map((id) => {
    const keys = TEMPLATES[id].questions.filter((q) => !q.when || q.when({ chosen: new Set(set), answers: all[id] })).map((q) => q.key);
    return { id, answers: Object.fromEntries(Object.entries(all[id]).filter(([k]) => keys.includes(k))) };
  });

describe('setting up an app', () => {
  it('makes a right app of each template, each two of a side and each group, with every answer turned on, off, and left as it is', () => {
    let made = 0;
    const sets = setsToTry();
    for (const set of sets) {
      for (const answers of [MOST, LEAST, null]) {
        for (const currencies of [['TRY'], ['TRY', 'EUR']]) {
          const templates = answers ? given(set, answers) : set.map((id) => ({ id }));
          const plan = planApp({ name: 'Atlas', currencies, templates }, { ids });
          expect(plan.files.at(-1)!.path).toBe(`Atlas/${APP_FILE}`);
          made++;
        }
      }
    }
    expect(made).toBe(sets.length * 6);
  }, 600_000);

  it('sets up a shared piece once, for every template that uses it', () => {
    const plan = planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'crm' }, { id: 'sales' }, { id: 'stock' }, { id: 'support' }] }, { ids });
    const schemas = plan.files.filter((f) => f.path.endsWith('_collection.json'));
    const companies = schemas.filter((f) => parseSchema(f.text).role === 'companies');
    expect(companies).toHaveLength(1);
    const fields = parseSchema(companies[0]!.text).fields.map((f) => f.key);
    expect(fields).toEqual(expect.arrayContaining(['name', 'segment', 'last_contact', 'open_deals']));
    const products = parseSchema(schemas.find((f) => f.path === 'Atlas/Products/_collection.json')!.text);
    expect(products.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['price', 'tax_rate', 'cost', 'stock', 'supplier']));
    const orders = parseSchema(schemas.find((f) => f.path === 'Atlas/Orders/_collection.json')!.text);
    expect(orders.fields.find((f) => f.key === 'customer')!.collection).toBe('Atlas/Companies');
    expect(plan.created.map((c) => c.path)).toContain('Atlas/About Atlas.md');
    // The wizard's summary: a piece under the first template that has it, with the ones that share it.
    expect(plan.templates.map((s) => [s.id, s.pieces.map((p) => p.name)])).toEqual([
      ['crm', ['Companies', 'People', 'Activities', 'Deals']],
      ['sales', ['Products', 'Orders', 'Order lines', 'Payments']],
      ['support', ['Requests', 'Feedback', 'Saved replies']],
      ['stock', ['Stock movements', 'Purchase orders', 'Purchase order lines']],
    ]);
    expect(plan.templates[1]!.pieces[0]).toMatchObject({ name: 'Products', with: ['stock'] });
    expect(plan.templates.find((s) => s.id === 'stock')!.buttons).toEqual(['Correct stock', 'Reorder']);
  });

  it('sets up the calendars of design/calendar.md 5, with their days, colors and conditions', () => {
    const plan = planApp(
      {
        name: 'Atlas',
        currencies: ['TRY'],
        templates: [{ id: 'crm' }, { id: 'sales' }, { id: 'projects' }, { id: 'budget' }, { id: 'stock' }, { id: 'product', answers: { releases: true } }, { id: 'recruiting' }, { id: 'assets' }, { id: 'content', answers: { campaigns: true } }],
      },
      { ids },
    );
    const calendars = new Map(
      plan.files
        .filter((file) => file.path.endsWith('_collection.json'))
        .map((file) => parseSchema(file.text))
        .flatMap((schema) => (schema.views ?? []).filter((v) => v.kind === 'calendar').map((v) => [schema.role!, { ...v.calendar, conditions: v.conditions }] as const)),
    );
    expect(Object.fromEntries(calendars)).toEqual({
      activities: { start: 'date', color: 'type', upcoming: true, conditions: [] },
      orders: { start: 'due', color: 'status', upcoming: false, conditions: [{ field: 'status', op: 'is-not', value: ['Paid', 'Cancelled'] }] },
      payments: { start: 'due', color: 'direction', upcoming: true, conditions: [{ field: 'status', op: 'is-not', value: ['Paid'] }] },
      projects: { start: 'start', end: 'end', color: 'status', upcoming: false, conditions: [{ field: 'status', op: 'is-not', value: ['Done', 'Cancelled'] }] },
      'purchase-orders': { start: 'expected', color: 'status', upcoming: true, conditions: [{ field: 'status', op: 'is', value: ['Ordered'] }] },
      releases: { start: 'planned', color: 'status', upcoming: false, conditions: [{ field: 'status', op: 'is', value: ['Planned'] }] },
      interviews: { start: 'date', color: 'type', upcoming: true, conditions: [] },
      maintenance: { start: 'date', color: 'type', upcoming: true, conditions: [{ field: 'status', op: 'is', value: ['Planned'] }] },
      campaigns: { start: 'start', end: 'end', color: 'status', upcoming: false, conditions: [] },
    });
    // Activities and interviews hold a time when one is given.
    const field = (role: string, key: string) =>
      plan.files.map((file) => (file.path.endsWith('_collection.json') ? parseSchema(file.text) : null)).find((schema) => schema?.role === role)!.fields.find((f) => f.key === key);
    expect(field('activities', 'date')).toMatchObject({ type: 'date', time: true });
    expect(field('interviews', 'date')).toMatchObject({ type: 'date', time: true });
    expect(field('maintenance', 'date')!.time).toBeUndefined();
  });

  it('sets up Appointments: a calendar it opens on, one for each in the team, and checks that mark what runs into another', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Studio', currencies: ['TRY'], templates: [{ id: 'appointments', answers: { for: 'both', by: 'team', staff: ['Ayşe', 'Mehmet'], services: ['Consultation 30', 'Massage 60', 'Tea'] } }] }, { ids }));
    const schema = parseSchema(await fs.readText('Studio/Appointments/_collection.json'));
    expect(schema.defaultView).toBe('calendar');
    expect(schema.views!.map((v) => [v.name, v.calendar!.color, v.conditions])).toEqual([
      ['Calendar', 'staff', []],
      ['Ayşe', 'status', [{ field: 'staff', op: 'is', value: ['Ayşe'] }]],
      ['Mehmet', 'status', [{ field: 'staff', op: 'is', value: ['Mehmet'] }]],
    ]);
    const load = (dir: string) => loadCollection(fs, `Studio/${dir}`);
    expect((await load('Services')).records.map((r) => [r.name, r.values.duration]).sort()).toEqual([['Consultation', 30], ['Massage', 60], ['Tea', 30]]);
    const staff = await load('Staff');
    const ayse = staff.records.find((r) => r.name === 'Ayşe')!;
    expect(ayse.values).toMatchObject({ from: '09:00', until: '18:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] });
    const room = (await load('Resources')).records.find((r) => r.name === 'Room 1')!;
    let appointments: Collection = await load('Appointments');
    const book = async (name: string, start: string, duration: number, more: object = {}) => {
      const made = await addRecord(fs, appointments, { values: { name, start, duration, status: 'Booked', staff: { id: ayse.id, name: 'Ayşe' }, ...more } });
      appointments = await load('Appointments');
      return made.id;
    };
    const a = await book('Consultation with Can', '2026-10-22T14:30', 60);
    const b = await book('Massage with Ece', '2026-10-22T15:00', 30);
    const c = await book('Late one', '2026-10-22T17:30', 60);
    const d = await book('Sunday one', '2026-10-25T10:00', 30);
    const e = await book('In room 1', '2026-10-23T10:00', 60, { staff: null, resource: { id: room.id, name: 'Room 1' } });
    const f = await book('Also in room 1', '2026-10-23T10:30', 60, { staff: null, resource: { id: room.id, name: 'Room 1' } });
    const all = await Promise.all(['Appointments', 'Services', 'Staff', 'Resources', 'People'].map(load));
    const computer = new Computer(all, {}, '2026-10-21');
    const marked = (id: string) => computer.checks('Studio/Appointments', appointments.records.find((r) => r.id === id)!).map((p) => p.message);
    expect(marked(a)).toEqual(['Overlaps with Massage with Ece, 15:00']);
    expect(marked(b)).toEqual(['Overlaps with Consultation with Can, 14:30']);
    expect(marked(c)).toEqual(["Outside Ayşe's hours, 09:00 to 18:00"]);
    expect(marked(d)).toEqual(['Ayşe does not work on Sun']);
    expect(marked(e)).toEqual(['Overlaps with Also in room 1, 10:30']);
    expect(marked(f)).toEqual(['Overlaps with In room 1, 10:00']);
  });

  it('sets up E-commerce on Sales, its lists by the region, its statuses and its To ship calendar', () => {
    const lists = (region?: string) => {
      const { answers } = readAnswers(TEMPLATES.ecommerce, new Set(['ecommerce']), {}, region);
      return [answers.channels, answers.carriers];
    };
    expect(lists('TR')).toEqual([['Trendyol', 'Hepsiburada', 'Amazon', 'Own site'], ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo']]);
    expect(lists('DE')).toEqual([['Amazon', 'eBay', 'Etsy', 'Own site'], ['DHL', 'UPS', 'FedEx', 'DPD']]);
    expect(lists()).toEqual(lists('US'));
    const plan = planApp({ name: 'Shop', currencies: ['TRY'], templates: [{ id: 'ecommerce' }] }, { ids });
    expect(plan.templates.map((t) => t.id)).toEqual(['sales', 'ecommerce']);
    const orders = parseSchema(plan.files.find((file) => file.path === 'Shop/Orders/_collection.json')!.text);
    expect(orders.fields.find((f) => f.key === 'status')!.options).toEqual(['Quote', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Invoiced', 'Paid', 'Cancelled']);
    expect(orders.views!.map((v) => [v.name, v.calendar!.start, v.calendar!.upcoming])).toEqual([
      ['Calendar', 'due', false],
      ['To ship', 'ship_by', true],
    ]);
    expect(plan.files.some((file) => file.path === 'Shop/Channels/_collection.json')).toBe(true);
  });

  it('adds E-commerce to an app with Sales: the new choices of its orders, and a formula nobody changed', async () => {
    const setUp = async (change: (schema: ReturnType<typeof parseSchema>) => void) => {
      const fs = new MemoryFs();
      await installApp(fs, planApp({ name: 'Shop', currencies: ['TRY'], templates: [{ id: 'sales' }] }, { ids }));
      const path = 'Shop/Orders/_collection.json';
      const schema = parseSchema(await fs.readText(path));
      change(schema);
      await fs.writeText(path, serializeSchema(schema));
      const plan = planApp({ name: '', templates: [{ id: 'ecommerce' }] }, { found: (await findApp(fs, 'Shop'))!, ids });
      await installApp(fs, plan);
      return { plan, orders: parseSchema(await fs.readText(path)) };
    };
    const field = (schema: ReturnType<typeof parseSchema>, key: string) => schema.fields.find((f) => f.key === key)!;
    // A choice someone added stays where it is; the new ones come after the ones they follow.
    const { plan, orders } = await setUp((schema) => field(schema, 'status').options!.push('Returned'));
    expect(field(orders, 'status').options).toEqual(['Quote', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Invoiced', 'Paid', 'Cancelled', 'Returned']);
    expect(field(orders, 'status').colors).toMatchObject({ Packed: 'teal', Shipped: 'pink' });
    expect(field(orders, 'remaining').formula).toBe('total - commission - collected');
    expect(plan.changed.find((c) => c.startsWith('Orders:'))).toMatch(/2 choices, 1 formula worked out anew/);
    // A formula someone changed is theirs.
    const own = await setUp((schema) => (field(schema, 'remaining').formula = 'total - collected - 0'));
    expect(field(own.orders, 'remaining').formula).toBe('total - collected - 0');
  });

  it('sets up Subscriptions named as the answer says, its plans from the list, and Contracts on the day to cancel by', () => {
    const plan = planApp({ name: 'Gym', currencies: ['TRY'], templates: [{ id: 'subscriptions', answers: { sells: 'memberships', plans: ['Monthly', 'Student quarterly', 'Annual'], customers: 'people' } }, { id: 'contracts', answers: { kinds: ['lease', 'software'], notice: '60' } }] }, { ids });
    const schema = (path: string) => parseSchema(plan.files.find((f) => f.path === `${path}/_collection.json`)!.text);
    expect(plan.created.filter((c) => c.kind === 'collection').map((c) => c.path)).toEqual(['Gym/Companies', 'Gym/People', 'Gym/Plans', 'Gym/Memberships', 'Gym/Contracts']);
    const members = schema('Gym/Memberships');
    expect(members.singular).toBe('membership');
    expect(members.fields.find((f) => f.key === 'customer')).toMatchObject({ label: 'Member', collection: 'Gym/People' });
    expect(members.fields.find((f) => f.key === 'status')!.options).toEqual(['Active', 'Paused', 'Cancelled']);
    expect(members.views!.map((v) => [v.id, v.kind ?? 'table', v.calendar?.start ?? null])).toEqual([
      ['active', 'table', null],
      ['cancelled', 'table', null],
      ['calendar', 'calendar', 'renews'],
    ]);
    expect(schema('Gym/People').fields.map((f) => f.key)).toEqual(expect.arrayContaining(['active_memberships', 'monthly_value']));
    const plans = plan.files.filter((f) => f.path.startsWith('Gym/Plans/') && f.path.endsWith('.md')).map((f) => [/name: (.*)/.exec(f.text)![1], /period: (.*)/.exec(f.text)![1]]);
    expect(plans).toEqual([
      ['Monthly', 'Monthly'],
      ['Student quarterly', 'Quarterly'],
      ['Annual', 'Yearly'],
    ]);
    const contracts = schema('Gym/Contracts');
    expect(contracts.fields.find((f) => f.key === 'type')!.options).toEqual(['Lease', 'Software']);
    expect(contracts.fields.find((f) => f.key === 'notice_days')!.default).toBe(60);
    expect(contracts.fields.map((f) => f.key)).toContain('seats');
    // The day to cancel by is worked out, and its calendar goes by it.
    expect(contracts.views!.map((v) => [v.name, v.calendar])).toEqual([
      ['Cancel by', { start: 'cancel_by', color: 'type', upcoming: true }],
      ['Ends', { start: 'ends', color: 'type', upcoming: false }],
    ]);
    expect(plan.templates.map((s) => [s.id, s.buttons])).toEqual([
      ['subscriptions', ['Renew', 'Pause', 'Resume', 'Cancel']],
      ['contracts', ['Renew', 'End', 'Cancel']],
    ]);
  });

  it('sets up Time off with this year’s and next year’s holidays, Goals and Incidents, tied to the templates beside them', () => {
    // By the device's region: 14 days and Turkey's holidays in Turkey; 20 days and none elsewhere.
    expect(readAnswers(TEMPLATES.timeoff, new Set(['timeoff']), {}, 'TR').answers).toMatchObject({ allowance: '14', holidays: 'tr' });
    expect(readAnswers(TEMPLATES.timeoff, new Set(['timeoff']), {}, 'FR').answers).toMatchObject({ allowance: '20', holidays: 'none' });
    const plan = planApp(
      {
        name: 'Team',
        templates: [{ id: 'support' }, { id: 'product' }, { id: 'recruiting' }, { id: 'timeoff', answers: { holidays: 'tr' } }, { id: 'goals' }, { id: 'incidents' }],
      },
      { ids, today: '2026-10-22' },
    );
    const schema = (path: string) => parseSchema(plan.files.find((f) => f.path === `${path}/_collection.json`)!.text);
    const holidays = plan.files.filter((f) => f.path.startsWith('Team/Holidays/') && f.path.endsWith('.md'));
    expect(holidays).toHaveLength(28);
    expect(holidays.map((f) => /day: (.*)/.exec(f.text)![1]).filter((d) => d!.startsWith('2027-05'))).toEqual(['2027-05-01', '2027-05-16', '2027-05-17', '2027-05-18', '2027-05-19', '2027-05-19']);
    const leave = schema('Team/Leave requests');
    expect(leave.fields.find((f) => f.key === 'status')).toMatchObject({ options: ['Requested', 'Approved', 'Rejected', 'Cancelled'], default: 'Requested' });
    expect(leave.views![0]!.calendar).toEqual({ start: 'first', end: 'last', color: 'type', upcoming: true });
    expect(schema('Team/Employees').fields.find((f) => f.key === 'allowance')!.default).toBe(20);
    const rules = (path: string) => plan.files.find((f) => f.path === `${path}/_rules.js`)!.text;
    expect(rules('Team/Candidates')).toContain('onSave("To employees"');

    const goals = schema('Team/Goals');
    expect(goals.fields.find((f) => f.key === 'period')!.default).toBe('=text(year(today())) + " Q" + text(round((month(today()) + 1) / 3))');
    expect(goals.views![0]!.calendar).toEqual({ start: 'due', color: 'status', upcoming: true });
    const board = (path: string) => parseBoard(plan.files.find((f) => f.path === path)!.text);
    expect(board('Team/Roadmap.board.json').fields!.find((f) => f.key === 'goal')!.collection).toBe('Team/Goals');
    expect(board('Team/Requests.board.json').fields!.find((f) => f.key === 'incident')!.collection).toBe('Team/Incidents');
    expect(board('Team/Actions.board.json').columns.map((c) => c.name)).toEqual(['To do', 'Doing', 'Done']);
    expect(schema('Team/Incidents').views![0]!.calendar).toEqual({ start: 'started', end: 'ended', color: 'severity', upcoming: false });
    expect(plan.templates.filter((s) => ['timeoff', 'goals', 'incidents'].includes(s.id)).map((s) => [s.id, s.buttons])).toEqual([
      ['timeoff', ['Approve', 'Reject']],
      ['goals', ['Update']],
      ['incidents', ['Resolve', 'Close', 'Add action']],
    ]);
  });

  it('sets up Field service, Consulting and Association on the pieces they share with the others', () => {
    const plan = planApp(
      {
        name: 'Firm',
        currencies: ['TRY'],
        templates: [
          { id: 'sales' },
          { id: 'projects', answers: { time: true } },
          { id: 'budget', answers: { expenses: true } },
          { id: 'stock' },
          { id: 'content', answers: { campaigns: true } },
          { id: 'field', answers: { technicians: ['Ali', 'Veli'] } },
          { id: 'consulting', answers: { deadlines: true, deadlineList: ['VAT return monthly', 'Payroll'] } },
          { id: 'association', answers: { campaigns: true } },
        ],
      },
      { ids },
    );
    const schema = (path: string) => parseSchema(plan.files.find((f) => f.path === `${path}/_collection.json`)!.text);
    const keys = (path: string) => schema(path).fields.map((f) => f.key);
    // One Time entries for a project and an engagement, one Expenses for a person and an engagement, one Campaigns for content and donations.
    expect(keys('Firm/Time entries')).toEqual(expect.arrayContaining(['project', 'engagement', 'billable', 'rate', 'amount', 'billed']));
    expect(keys('Firm/Expenses')).toEqual(expect.arrayContaining(['person', 'budget_line', 'status', 'engagement', 'billable', 'billed']));
    expect(keys('Firm/Campaigns')).toEqual(expect.arrayContaining(['goal', 'pieces', 'target', 'raised', 'reached']));
    expect(plan.created.filter((c) => c.path.startsWith('Firm/Campaigns'))).toHaveLength(1);
    expect(schema('Firm/Work orders').views!.map((v) => v.name)).toEqual(['Calendar', 'Ali', 'Veli']);
    expect(keys('Firm/Work orders')).toEqual(expect.arrayContaining(['order', 'parts', 'total']));
    expect(keys('Firm/Stock movements')).toContain('work_order');
    const deadlines = schema('Firm/Deadlines');
    expect(deadlines.fields.find((f) => f.key === 'kind')!.options).toEqual(['VAT return', 'Payroll']);
    expect(plan.files.find((f) => f.path === 'Firm/Deadlines/_rules.js')!.text).toContain('repeats = kind == "VAT return" ? "Monthly" : kind == "Payroll" ? "Monthly" : null');
    expect(schema('Firm/Dues periods').fields.find((f) => f.key === 'name')!.default).toBe('=text(year(today()))');
    expect(plan.templates.filter((s) => ['field', 'consulting', 'association'].includes(s.id)).map((s) => [s.id, s.buttons])).toEqual([
      ['field', ['Schedule', 'Start', 'Done', 'Invoice']],
      ['consulting', ['Log time', 'Bill']],
      ['association', ['Issue dues']],
    ]);
  });

  it('says what is wrong with what it was given', () => {
    const wrong = (input: Parameters<typeof planApp>[0]) => {
      try {
        planApp(input);
      } catch (error) {
        return error instanceof AppProblems ? error.problems : [String(error)];
      }
      return [];
    };
    expect(wrong({ name: '', currencies: ['TRY'], templates: [{ id: 'crm' }] })).toEqual(['Give the app a name']);
    expect(wrong({ name: 'A', templates: [{ id: 'sales' }] })[0]).toMatch(/currencies/);
    expect(wrong({ name: 'A', currencies: ['TRY'], templates: [{ id: 'crm', answers: { customers: 'pets', color: 'red' } }] })).toEqual([
      'crm has no question color; its questions are customers, deals, stages',
      'crm.customers: the answer is one of companies, people',
    ]);
    expect(wrong({ name: 'A', templates: [{ id: 'hr' }] })[0]).toMatch(/no template hr/);
    expect(wrong({ name: 'A', templates: [{ id: 'support' }] })).toEqual([]);
  });

  it('sets up an app from the templates of one side, for a business or for a person', async () => {
    expect(TEMPLATE_IDS.filter((id) => !Object.values(TEMPLATE_GROUPS).some((groups) => (groups as readonly string[]).includes(TEMPLATES[id].group)))).toEqual([]);
    expect([audienceOf('money'), audienceOf('home')]).toEqual(['business', 'personal']);
    // Content taken as a person's for a while: with CRM it is refused, alone it is set up, and nothing of a business is added to it.
    const was = TEMPLATES.content.group;
    TEMPLATES.content.group = 'life';
    try {
      expect(() => planApp({ name: 'A', templates: [{ id: 'crm' }, { id: 'content' }] })).toThrow('An app is set up from templates for a business or for a person, not both: crm for a business, content for a person. Set them up as two apps');
      const fs = new MemoryFs();
      await installApp(fs, planApp({ name: 'Mine', templates: [{ id: 'content' }] }, { ids }));
      const found = (await findApp(fs, 'Mine'))!;
      expect(() => planApp({ name: '', templates: [{ id: 'support' }] }, { found })).toThrow(/support for a business, content for a person/);
    } finally {
      TEMPLATES.content.group = was;
    }
  });
});

describe('the About note', () => {
  it('says only what was set up', () => {
    const about = (stock: Answers) => planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'sales' }, { id: 'stock', answers: stock }] }, { ids }).files.find((f) => f.path === 'Atlas/About Atlas.md')!.text;
    expect(about({ deduct: 'delivered' })).toContain('When an order is Delivered, its products go out of stock');
    expect(about({ deduct: 'no' })).not.toContain('go out of stock');
    expect(about({ deduct: 'no', purchasing: false })).not.toContain('Purchase orders');
    expect(about({})).toMatch(/^# About Atlas\n\nAtlas is set up from Sales and invoicing and Stock and purchasing\./);
  });

  it('links each piece to what was set up', () => {
    const plan = planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'crm' }, { id: 'sales' }, { id: 'support' }, { id: 'stock', answers: { locations: true } }] }, { ids });
    const text = plan.files.find((f) => f.path === 'Atlas/About Atlas.md')!.text;
    const made = new Set(plan.created.map((c) => c.path));
    const targets = linksIn(text).map((l) => resolveHref('Atlas', l.href));
    expect(targets).toEqual(expect.arrayContaining(['Atlas/Companies', 'Atlas/Deals.board.json', 'Atlas/Order lines', 'Atlas/Saved replies', 'Atlas/Stock levels']));
    expect(targets.filter((p) => !made.has(p!))).toEqual([]);
    expect(text).toContain('- [Order lines](Order%20lines): what each order is for');
  });
});

describe('installing an app', () => {
  it('leaves nothing when a write falls halfway', async () => {
    const fs = new MemoryFs();
    const plan = planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'crm' }] }, { ids });
    let writes = 0;
    const falling = Object.assign(Object.create(fs) as MemoryFs, {
      writeText: async (path: string, text: string) => {
        if (++writes === 5) throw new Error('disk full');
        return fs.writeText(path, text);
      },
    });
    await expect(installApp(falling, plan)).rejects.toThrow('disk full');
    expect(await fs.list('')).toEqual([]);
  });

  it('keeps a field of the same key and another type as it is, and says so', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'sales' }] }, { ids }));
    const schema = JSON.parse(await fs.readText('Atlas/Products/_collection.json'));
    schema.fields.push({ key: 'cost', label: 'Cost', type: 'text' });
    await fs.writeText('Atlas/Products/_collection.json', JSON.stringify(schema));
    const found = (await findApp(fs, 'Atlas'))!;
    // A text Cost keeps what reads it as a number from working: nothing is added, and it says why.
    expect(() => planApp({ name: '', templates: [{ id: 'stock' }] }, { found, ids })).toThrow(
      new AppProblems(['Products has a Cost field of the type Text, and what is added reads it as Number. In Products, open Fields and change Cost to Number, then add the template again.']),
    );
    // For a summary, the same is said in the plan, which cannot be installed.
    const blocked = planApp({ name: '', templates: [{ id: 'stock' }] }, { found, ids, keepBlocked: true });
    expect(blocked.blocked).toEqual(['Products has a Cost field of the type Text, and what is added reads it as Number. In Products, open Fields and change Cost to Number, then add the template again.']);
    await expect(installApp(fs, blocked)).rejects.toThrow('In Products, open Fields');
    // One no rule reads as a number is only said.
    schema.fields = schema.fields.map((f: { key: string }) => (f.key === 'cost' ? { key: 'stock_status', label: 'Stock note', type: 'text' } : f));
    await fs.writeText('Atlas/Products/_collection.json', JSON.stringify(schema));
    const plan = planApp({ name: '', templates: [{ id: 'stock' }] }, { found: (await findApp(fs, 'Atlas'))!, ids });
    expect(plan.notes).toEqual(['Products has a Stock note of another type; it is kept as it is']);
  });

  it('writes the plan and takes it all back with Undo', async () => {
    const fs = new MemoryFs();
    const plan = planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'crm' }, { id: 'sales' }] }, { ids });
    const done = await installApp(fs, plan);
    expect(parseSchema(await fs.readText('Atlas/Orders/_collection.json')).role).toBe('orders');
    expect(parseBoard(await fs.readText('Atlas/Deals.board.json')).role).toBe('deals');
    const found = await findApp(fs, 'Atlas');
    expect([...found!.pieces.keys()].sort()).toEqual(['activities', 'companies', 'deals', 'order-lines', 'orders', 'payments', 'people', 'products']);
    await undoApp(fs, done);
    expect(await fs.list('Atlas')).toEqual([]);
  });

  it('adds a template to an app, finding its pieces where they are and what they are called', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'crm' }, { id: 'sales' }] }, { ids }));
    // The person renames Products and moves it, and changes a field and the rules of Orders.
    const products = await fs.readText('Atlas/Products/_collection.json');
    for (const entry of await fs.list('Atlas/Products')) await fs.move(entry.path, `Atlas/Shop/Goods/${entry.name}`);
    await fs.remove('Atlas/Products');
    expect(products).toContain('"role": "products"');
    const rules = await fs.readText('Atlas/Orders/_rules.js');
    await fs.writeText('Atlas/Orders/_rules.js', `${rules}\ncheck("due", () => due >= date, "Due before the order")\n`);
    const found = await findApp(fs, 'Atlas');
    expect(found!.pieces.get('products')!.path).toBe('Atlas/Shop/Goods');
    const plan = planApp({ name: '', templates: [{ id: 'stock' }] }, { found: found!, ids });
    expect(plan.changed).toEqual(['Companies: 2 blocks on its screen', 'Goods: 8 fields, 1 block on its screen, 3 rules', 'Orders: 1 rule', 'Order lines: 1 rule']);
    // The summary of what is added: a piece each, the About note's new section; what is set up, without what the app has.
    expect(plan.added.map((a) => `${a.name}: ${a.what}`)).toEqual([...plan.changed, 'About Atlas: a section at its end']);
    expect(plan.templates.map((s) => [s.id, s.pieces.map((p) => p.name)])).toEqual([['stock', ['Stock movements', 'Purchase orders', 'Purchase order lines']]]);
    const done = await installApp(fs, plan);
    const goods = parseSchema(await fs.readText('Atlas/Shop/Goods/_collection.json'));
    expect(goods.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['price', 'cost', 'stock']));
    const moves = parseSchema(await fs.readText('Atlas/Stock movements/_collection.json'));
    expect(moves.fields.find((f) => f.key === 'product')!.collection).toBe('Atlas/Shop/Goods');
    const orderRules = await fs.readText('Atlas/Orders/_rules.js');
    expect(orderRules).toContain('Due before the order');
    expect(orderRules.indexOf('onSave("Stock out"')).toBeGreaterThan(orderRules.indexOf('Due before the order'));
    expect(await fs.readText('Atlas/About Atlas.md')).toMatch(/## Stock and purchasing/);
    const app = JSON.parse(await fs.readText(`Atlas/${APP_FILE}`));
    expect(app.templates.map((x: { id: string }) => x.id)).toEqual(['crm', 'sales', 'stock']);
    // Added again, nothing is added twice.
    expect(() => planApp({ name: '', templates: [{ id: 'stock' }] }, { found: found!, ids })).not.toThrow();
    await undoApp(fs, done);
    expect(await fs.readText('Atlas/Orders/_rules.js')).not.toContain('Stock out');
    expect(parseSchema(await fs.readText('Atlas/Shop/Goods/_collection.json')).fields.map((f) => f.key)).not.toContain('cost');
    expect((await fs.list('Atlas')).map((e) => e.name)).not.toContain('Stock movements');
  });
});
