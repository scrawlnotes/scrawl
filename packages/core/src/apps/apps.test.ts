import { t } from '@scrawlnotes/i18n';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../board';
import { addRecord, type Collection, createCollection, loadCollection, offeredOptions, optionName, parseSchema, type Record, serializeSchema, stepCounts, viewValues } from '../collection';
import { dueRecords, repeatCalendar } from '../calendar';
import { planSave, recordWith, type RuleSpaceNow } from '../run';
import { Computer } from '../compute';
import { MemoryFs } from '../fs';
import { settleSchema } from '../fields';
import { linksIn, resolveHref } from '../links';
import { APP_FILE, APP_ICONS, AppProblems, type FoundApp, planApp } from './build';
import { installApp, undoApp } from './install';
import { appIcon, type AppPiece, hiddenOnForm, homeOf, linesBlocks, menuEditOf, menuEntries, menuFileOf, menuOf, screenKey, showsLines, unplacedOf } from './menu';
import { PIECES } from './pieces';
import { jobOf } from './templates/home';
import { apartProblem, fitsWith, goTogether, readAnswers, TEMPLATES } from './questions';
import { findApp, readAppFile, readAppMenu, writeAppMenu } from './roles';
import { type Answers, audienceOf, TEMPLATE_GROUPS, TEMPLATE_IDS, type TemplateId } from './types';

let n = 0;
const ids = () => `id${++n}`;

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
    for (const group of groups) out.push(TEMPLATE_IDS.filter((id) => TEMPLATES[id].group === group));
    out.push(TEMPLATE_IDS.filter((id) => (groups as readonly string[]).includes(TEMPLATES[id].group)));
  }
  out.push(['finance', 'travel', 'split']);
  return out.filter((set) => (set.length > 1 ? apartProblem(set, new Set()) === null : set.length > 0));
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
  sport: { body: true, races: true },
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
  jobs: { stages: [] },
  people: { anniversaries: false, touch: 'off' },
  reading: { types: [], services: [], goal: 'none', quotes: false, lending: false, releases: false },
  habits: { habits: [], goals: false },
  sport: { sports: [], body: false, races: false },
  gym: { days: false, sets: false },
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
    expect(fields).toEqual(expect.arrayContaining(['name', 'industry', 'last_contact', 'open_value', 'won']));
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
      ['stock', ['Stock movements', 'Stock counts', 'Purchase orders', 'Purchase order lines']],
    ]);
    expect(plan.templates[1]!.pieces[0]).toMatchObject({ name: 'Products', with: ['stock'] });
    expect(plan.templates.find((s) => s.id === 'stock')!.buttons).toEqual(['Adjust', 'Apply', 'Reorder', 'Order', 'Receive', 'Cancel order']);
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
      activities: { start: 'when', color: 'type', upcoming: true, button: 'Done', words: ['with_said'], conditions: [{ field: 'done', op: 'false' }] },
      orders: { start: 'due', color: 'status', upcoming: true, button: 'Record payment', words: ['customer', 'state'], conditions: [{ field: 'status', op: 'is', value: ['Invoiced'] }] },
      payments: { start: 'due', color: 'direction', upcoming: true, button: 'Mark paid', auto: 'pays_itself', words: ['party', 'amount'], conditions: [{ field: 'status', op: 'is-not', value: ['Paid'] }] },
      // A project's last calendar: from its start to its end; before it, its update due, with Post update.
      projects: { start: 'start', end: 'end', color: 'status', upcoming: false, conditions: [{ field: 'status', op: 'is', value: ['Active', 'On hold'] }] },
      'project-milestones': { start: 'due', upcoming: true, button: 'Done', words: ['project'], conditions: [{ field: 'done', op: 'false' }] },
      'purchase-orders': { start: 'expected', color: 'status', upcoming: true, button: 'Receive', words: ['supplier', 'total'], conditions: [{ field: 'status', op: 'is', value: ['Ordered', 'Partially received'] }] },
      releases: { start: 'planned', color: 'status', upcoming: true, button: 'Ship', words: ['done_said'], conditions: [{ field: 'status', op: 'is', value: ['Planned'] }] },
      // An interview's last calendar: its time, in Today with Write feedback till it is written.
      interviews: { start: 'date', color: 'type', upcoming: true, button: 'Write feedback', words: ['position'], conditions: [{ field: 'done', op: 'false' }] },
      // An asset's last calendar: its warranty ending, in Upcoming; before it, coming back and its service, with their buttons.
      assets: { start: 'warranty', color: 'category', upcoming: true, words: ['supplier'], conditions: [{ field: 'status', op: 'is-not', value: ['Retired'] }] },
      // A piece's last calendar: its day with Publish; before it, sent for review, in Today with Approve. Its steps each with Done; campaigns are a timeline.
      content: { start: 'goes_out', color: 'channel', upcoming: true, button: 'Publish', words: ['where'], conditions: [{ field: 'status', op: 'is', value: ['Writing', 'Review', 'Scheduled'] }] },
      'content-steps': { start: 'due', upcoming: true, button: 'Done', words: ['piece'], conditions: [{ field: 'done', op: 'false' }] },
    });
    // Activities and interviews hold a time when one is given.
    const field = (role: string, key: string) =>
      plan.files.map((file) => (file.path.endsWith('_collection.json') ? parseSchema(file.text) : null)).find((schema) => schema?.role === role)!.fields.find((f) => f.key === key);
    expect(field('activities', 'when')).toMatchObject({ type: 'date', time: true });
    expect(field('interviews', 'date')).toMatchObject({ type: 'date', time: true });
    expect(field('maintenance', 'date')!.time).toBeUndefined();
  });

  it('sets up Appointments: a calendar it opens on, one for each in the team, and checks that mark what runs into another', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Studio', currencies: ['TRY'], templates: [{ id: 'appointments', answers: { for: 'both', by: 'team', staff: ['Ayşe', 'Mehmet'], services: ['Consultation 30', 'Massage 60', 'Tea'] } }] }, { ids }));
    const schema = parseSchema(await fs.readText('Studio/Appointments/_collection.json'));
    expect(schema.defaultView).toBe('calendar');
    const notCancelled = { field: 'status', op: 'is-not', value: ['Cancelled'] };
    expect(schema.views!.filter((v) => v.kind === 'calendar').map((v) => [v.name, v.calendar!.color, v.calendar!.lanes, v.calendar!.button, v.conditions])).toEqual([
      ['Calendar', 'staff', 'staff', 'Done', [notCancelled]],
      ['Ayşe', 'status', undefined, undefined, [{ field: 'staff', op: 'is', value: ['Ayşe'] }, notCancelled]],
      ['Mehmet', 'status', undefined, undefined, [{ field: 'staff', op: 'is', value: ['Mehmet'] }, notCancelled]],
      // The day before, whom to remind, with Reminded.
      ['To remind', 'staff', undefined, 'Reminded', [{ field: 'status', op: 'is', value: ['Booked'] }]],
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
    expect(orders.fields.find((f) => f.key === 'status')!.options).toEqual(['Quote', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Invoiced', 'Paid', 'Declined', 'Cancelled']);
    expect(orders.views!.filter((v) => v.kind === 'calendar').map((v) => [v.name, v.calendar!.start, v.calendar!.upcoming, v.calendar!.button])).toEqual([
      ['Due', 'due', true, 'Record payment'],
      ['To ship', 'ship_by', true, 'Ship'],
    ]);
    // Sales' tabs and E-commerce's are sets of their own, each with what is said over it.
    expect(orders.views!.filter((v) => v.set).map((v) => [v.set, v.name])).toEqual([
      ['sales', 'Quotes'],
      ['sales', 'Open'],
      ['sales', 'To invoice'],
      ['sales', 'Unpaid'],
      ['sales', 'Paid'],
      ['shipping', 'To ship'],
      ['shipping', 'Shipped'],
      ['shipping', 'Delivered'],
      ['shipping', 'Cancelled'],
    ]);
    expect(orders.views!.find((v) => v.id === 'to-ship')).toMatchObject({ chips: 'channel', sums: [{ label: 'to ship' }, { label: 'today' }, { label: 'late', warn: true }] });
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
    expect(field(orders, 'status').options).toEqual(['Quote', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Invoiced', 'Paid', 'Declined', 'Cancelled', 'Returned']);
    expect(field(orders, 'status').colors).toMatchObject({ Packed: 'teal', Shipped: 'pink' });
    expect(field(orders, 'remaining').formula).toBe('status != "Paid" && status != "Cancelled" && status != "Quote" && status != "Declined" ? total - commission - collected : 0');
    expect(plan.changed.find((c) => c.startsWith('Orders:'))).toMatch(/2 choices, 2 formulas worked out anew/);
    // A formula someone changed is theirs.
    const own = await setUp((schema) => (field(schema, 'remaining').formula = 'total - collected - 0'));
    expect(field(own.orders, 'remaining').formula).toBe('total - collected - 0');
  });

  it('sets up Subscriptions named as the answer says, its plans from the list, and Contracts on the day to cancel by', () => {
    const plan = planApp({ name: 'Gym', currencies: ['TRY'], templates: [{ id: 'subscriptions', answers: { sells: 'memberships', plans: ['Monthly', 'Student quarterly', 'Annual'], customers: 'people' } }, { id: 'contracts', answers: { kinds: ['lease', 'software'], notice: '60' } }] }, { ids });
    const schema = (path: string) => parseSchema(plan.files.find((f) => f.path === `${path}/_collection.json`)!.text);
    expect(plan.created.filter((c) => c.kind === 'collection').map((c) => c.path)).toEqual(['Gym/Companies', 'Gym/People', 'Gym/Plans', 'Gym/Memberships', 'Gym/Subscription history', 'Gym/Contracts', 'Gym/Contract history']);
    const members = schema('Gym/Memberships');
    expect(members.singular).toBe('membership');
    expect(members.fields.find((f) => f.key === 'customer')).toMatchObject({ label: 'Member', collection: 'Gym/People' });
    expect(members.fields.find((f) => f.key === 'status')!.options).toEqual(['Active', 'Non-renewing', 'Paused', 'Cancelled']);
    expect(members.views!.map((v) => [v.id, v.kind ?? 'table', v.calendar?.start ?? null])).toEqual([
      ['active', 'table', null],
      ['past-due', 'table', null],
      ['paused', 'table', null],
      ['cancelled', 'table', null],
      ['renewals', 'calendar', 'renews'],
      ['pauses', 'calendar', 'paused_until'],
      ['ends', 'calendar', 'renews'],
      ['week', 'table', null],
      ['all', 'table', null],
    ]);
    expect(members.views!.find((v) => v.id === 'renewals')!.calendar).toMatchObject({ button: 'Renew', auto: 'auto' });
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
    // Its tabs; the day to give notice by is worked out, in Today with Give notice; its end with Renew, by itself for one that renews by itself.
    expect(contracts.views!.map((v) => [v.id, v.kind ?? 'table', v.calendar ?? null])).toEqual([
      ['active', 'table', null],
      ['to-decide', 'table', null],
      ['ending', 'table', null],
      ['drafts', 'table', null],
      ['ended', 'table', null],
      ['notice', 'calendar', { start: 'cancel_by', color: 'type', upcoming: true, button: 'Give notice', words: ['notice_said'] }],
      ['renewals', 'calendar', { start: 'ends', color: 'type', upcoming: true, button: 'Renew', auto: 'renews_itself', words: ['amount_said'] }],
      ['ends', 'calendar', { start: 'ends', color: 'type', upcoming: false, button: 'End', auto: 'ends_itself' }],
    ]);
    expect(plan.templates.map((s) => [s.id, s.buttons])).toEqual([
      ['subscriptions', ['Renew', 'Change plan', 'Pause', 'Resume', 'Cancel membership', 'End', 'Reactivate']],
      ['contracts', ['Send for signature', 'Signed', 'Renew', 'Give notice', 'End']],
    ]);
  });

  it('sets up Time off with this year’s and next year’s holidays, Goals and Incidents, tied to the templates beside them', () => {
    // By the device's region: 14 days and Turkey's holidays in Turkey; 20 days and none elsewhere.
    expect(readAnswers(TEMPLATES.timeoff, new Set(['timeoff']), {}, 'TR').answers).toMatchObject({ allowance: '14', holidays: 'tr' });
    expect(readAnswers(TEMPLATES.timeoff, new Set(['timeoff']), {}, 'FR').answers).toMatchObject({ allowance: '20', holidays: 'none' });
    const plan = planApp(
      {
        name: 'Team',
        currencies: ['TRY'],
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
    // It opens on who is away, a row each; a request is in Today with Approve, an approved one on its days.
    expect(leave.views![0]).toMatchObject({ kind: 'timeline', timeline: { start: 'first', end: 'last', color: 'type', rows: 'employee' } });
    expect(leave.views!.filter((v) => v.kind === 'calendar').map((v) => [v.id, v.calendar])).toEqual([
      ['approvals', { start: 'requested_on', color: 'type', upcoming: 'today', button: 'Approve', words: ['when_said', 'left_said'] }],
      ['calendar', { start: 'first', end: 'last', color: 'type', upcoming: true, words: ['when_said'] }],
    ]);
    expect(schema('Team/Employees').fields.find((f) => f.key === 'allowance')!.default).toBe(20);
    const rules = (path: string) => plan.files.find((f) => f.path === `${path}/_rules.js`)!.text;
    // With Recruiting, the one hired is one of the team.
    expect(rules('Team/Positions')).toContain('add("Employees", { name: input.candidate.name, team: team, started: input.starts })');

    const goals = schema('Team/Goals');
    // A new goal starts and ends with this quarter; its check-in and its end come to Today with their buttons.
    expect(goals.fields.find((f) => f.key === 'starts')!.default).toBe('=today() - (monthday(today()) - 1) - months(month(today()) - 3 * round((month(today()) + 1) / 3) + 2)');
    expect(goals.views!.filter((v) => v.kind === 'calendar').map((v) => [v.id, v.calendar])).toEqual([
      ['checkins', { start: 'checkin_on', upcoming: 'today', button: 'Check in', words: ['checkin_words'] }],
      ['ends', { start: 'ends', upcoming: true, button: 'Close goal', words: ['checkin_words'] }],
    ]);
    const board = (path: string) => parseBoard(plan.files.find((f) => f.path === path)!.text);
    expect(board('Team/Roadmap.board.json').fields!.find((f) => f.key === 'goal')!.collection).toBe('Team/Goals');
    expect(schema('Team/Requests').fields.find((f) => f.key === 'incident')!.collection).toBe('Team/Incidents');
    expect(board('Team/Actions.board.json').columns.map((c) => c.name)).toEqual(['To do', 'Doing', 'Done', "Won't do"]);
    // An open incident in Today every day with Post update; one resolved, its review a few days on.
    expect(schema('Team/Incidents').views!.filter((v) => v.kind === 'calendar').map((v) => [v.id, v.calendar])).toEqual([
      ['ongoing', { start: 'started', color: 'severity', upcoming: 'today', button: 'Post update', words: ['said'] }],
      ['reviews', { start: 'review_on', color: 'severity', upcoming: true, button: 'Write review', words: ['when_said'] }],
      ['calendar', { start: 'started', end: 'ended', color: 'severity', upcoming: false }],
    ]);
    expect(plan.templates.filter((s) => ['timeoff', 'goals', 'incidents'].includes(s.id)).map((s) => [s.id, s.buttons])).toEqual([
      ['timeoff', ['Request leave', 'Approve', 'Reject', 'Cancel', 'Carry over']],
      ['goals', ['Check in', 'Close goal']],
      ['incidents', ['Post update', 'Write review', 'Close', 'Add action']],
    ]);
  });

  it('sets up Field service and Consulting on the pieces they share with the others', () => {
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
        ],
      },
      { ids },
    );
    const schema = (path: string) => parseSchema(plan.files.find((f) => f.path === `${path}/_collection.json`)!.text);
    const keys = (path: string) => schema(path).fields.map((f) => f.key);
    // One Time entries for a project and an engagement, one Expenses for a person and an engagement.
    expect(keys('Firm/Time entries')).toEqual(expect.arrayContaining(['project', 'engagement', 'billable', 'rate', 'amount', 'billed']));
    expect(keys('Firm/Expenses')).toEqual(expect.arrayContaining(['person', 'budget_line', 'status', 'engagement', 'billable', 'billed']));
    expect(schema('Firm/Jobs').views!.map((v) => v.name)).toEqual(['Today', 'Unscheduled', 'Scheduled', 'Late', 'To invoice', 'Done', 'Schedule', 'To start', 'In progress', 'Ali', 'Veli']);
    expect(schema('Firm/Jobs').views!.find((v) => v.id === 'schedule')!.calendar).toMatchObject({ start: 'start', lanes: 'technician' });
    expect(keys('Firm/Jobs')).toEqual(expect.arrayContaining(['order', 'total', 'checks', 'signature']));
    expect(plan.files.filter((f) => f.path.startsWith('Firm/Checklists/') && f.path.endsWith('.md'))).toHaveLength(19);
    expect(keys('Firm/Stock movements')).toContain('work_order');
    const deadlines = schema('Firm/Deadlines');
    expect(deadlines.fields.find((f) => f.key === 'kind')!.options).toEqual(['VAT return', 'Payroll']);
    expect(plan.files.find((f) => f.path === 'Firm/Deadlines/_rules.js')!.text).toContain('repeats = kind == "VAT return" ? "Monthly" : kind == "Payroll" ? "Monthly" : null');
    expect(plan.templates.filter((s) => ['field', 'consulting'].includes(s.id)).map((s) => [s.id, s.buttons])).toEqual([
      ['field', ['Book visit', 'Schedule', 'On my way', 'Start', 'Complete', 'Reschedule', 'Invoice']],
      ['consulting', ['Delivered', 'Stop', 'Track time', 'Invoice', 'Expense']],
    ]);
  });

  it('sets up Shared expenses with its people in its first group, Home, and with Travel on the trips', () => {
    const plan = planApp({ name: 'Flat', currencies: ['TRY'], templates: [{ id: 'split', answers: { people: ['Ayşe', 'Can'] } }] }, { ids });
    const records = (dir: string) => plan.files.filter((f) => f.path.startsWith(`Flat/${dir}/`) && f.path.endsWith('.md')).map((f) => f.text);
    const group = /id: (\w+)/.exec(records('Groups')[0]!)![1];
    // A record set up after another links to it by its name.
    expect(records('Members').map((t) => /group:\n\s+id: (\w+)\n\s+name: (.*)/.exec(t)!.slice(1))).toEqual([
      [group, 'Home'],
      [group, 'Home'],
    ]);
    const trip = planApp({ name: 'Away', currencies: ['TRY'], templates: [{ id: 'travel' }, { id: 'split' }] }, { ids });
    const collections = trip.created.filter((c) => c.kind === 'collection').map((c) => c.path);
    expect(collections).not.toContain('Away/Groups');
    expect(collections.filter((p) => p.startsWith('Away/Expenses'))).toEqual(['Away/Expenses']);
    const expenses = parseSchema(trip.files.find((f) => f.path === 'Away/Expenses/_collection.json')!.text);
    expect(expenses.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['trip', 'payer', 'between', 'total', 'booking']));
    // An expense's window in one column, its people with their shares under its fields; a trip's in three, headed by its days.
    const items = (s: typeof expenses) => s.layout!.columns.map((c) => c.sections.flatMap((x) => x.items));
    expect(items(expenses)).toHaveLength(1);
    expect(items(expenses)[0]).toContainEqual(expect.objectContaining({ block: 'linked', look: 'split', pick: 'between' }));
    const trips = parseSchema(trip.files.find((f) => f.path === 'Away/Trips/_collection.json')!.text);
    expect(trips.head).toEqual({ sub: 'dates' });
    const off = hiddenOnForm(trips);
    expect(items(trips).map((c) => c.filter((i) => !('field' in i) || (!off.has(i.field) && i.field !== 'name')).map((i) => ('field' in i ? i.field : 'collection' in i ? i.collection.split('/').pop() : i.block)))).toEqual([
      ['destination', 'first', 'last', 'budget', 'money', 'actions', 'subtasks'],
      ['Bookings', 'Places'],
      ['kind', 'Packing', 'Expenses', 'Members', 'Settlements'],
    ]);
    expect(trip.files.find((f) => f.path === 'Away/Trips/_rules.js')!.text).toContain('action("Settle up"');
  });

  it('sets up Job search with its stages in a bar, the ones it ends at after it, and counts at each', () => {
    const plan = planApp({ name: 'Jobs', currencies: ['TRY'], templates: [{ id: 'jobs' }] }, { ids });
    const applications = parseSchema(plan.files.find((f) => f.path === 'Jobs/Applications/_collection.json')!.text);
    const status = applications.fields.find((f) => f.key === 'status')!;
    expect([status.steps, applications.head]).toEqual([{ end: ['Accepted', 'Rejected'], no: ['Rejected'] }, { sub: 'said', steps: 'status' }]);
    expect(stepCounts(status, [{ values: { status: 'Saved' } }, { values: { status: 'Applied' } }, { values: { status: 'Applied' } }, { values: { status: 'Rejected' } }])).toEqual([
      ['Saved', 1],
      ['Applied', 2],
      ['Screening', 0],
      ['Interview', 0],
      ['Offer', 0],
    ]);
    expect(plan.created.map((c) => c.path)).not.toContain('Jobs/Companies');
  });

  it('sets up Reading and watching with the services of the region, this year with its goal, and a screen for each kind', async () => {
    expect(readAnswers(TEMPLATES.reading, new Set(['reading']), {}, 'TR').answers.services).toEqual(['Netflix', 'Disney+', 'Prime Video', 'Max', 'Exxen', 'TOD', 'Gain', 'Mubi', 'YouTube', 'Crunchyroll', 'Webtoon', 'Kindle', 'Paper']);
    expect(readAnswers(TEMPLATES.reading, new Set(['reading']), {}, 'US').answers.services).toContain('Hulu');
    const plan = planApp({ name: 'Shelf', templates: [{ id: 'reading', answers: { goal: '24' } }] }, { ids, today: '2026-10-23' });
    const year = plan.files.find((f) => f.path.startsWith('Shelf/Years/') && f.path.endsWith('.md'))!.text;
    expect([/name: (.*)/.exec(year)![1], /start: (.*)/.exec(year)![1], /target: (.*)/.exec(year)![1]]).toEqual(['"2026"', '2026-01-01', '24']);
    const library = parseSchema(plan.files.find((f) => f.path === 'Shelf/Library/_collection.json')!.text);
    // A view for each kind, its works by their status, what is over closed; +1 where it goes a part at a time.
    expect(library.views!.filter((v) => !v.hidden).map((v) => [v.name, v.button ?? null])).toEqual([
      ['Books', 'Update'],
      ['Films', null],
      ['Series', '+1'],
      ['Anime', '+1'],
      ['Manga', '+1'],
      ['Webtoons', '+1'],
      ['Podcasts', '+1'],
      ['Games', null],
    ]);
    expect(library.views!.find((v) => v.id === 'anime')).toMatchObject({ conditions: [{ field: 'type', op: 'is', value: ['Anime'] }], group: 'status', closed: ['Done', 'Dropped'] });
    expect(library.line).toEqual({ sub: 'line', cover: 'cover' });
    // The statuses in each kind's words; a film only to watch or watched.
    const status = library.fields.find((f) => f.key === 'status')!;
    expect([offeredOptions(status, { type: 'Anime' }).map((o) => optionName(status, o, { type: 'Anime' })), offeredOptions(status, { type: 'Film' }).map((o) => optionName(status, o, { type: 'Film' }))]).toEqual([
      ['Watching', 'Plan to watch', 'On hold', 'Completed', 'Dropped'],
      ['To watch', 'Watched'],
    ]);
    // Each kind a screen of the library on its view, called by its name; only the kinds chosen.
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Otaku', templates: [{ id: 'reading', answers: { types: ['Anime', 'Manga'] } }] }, { ids }));
    const found = (await findApp(fs, 'Otaku'))!;
    const screens = menuOf(found.app, 'Otaku', [...found.pieces].map(([role, p]) => ({ kind: p.kind, path: p.path, role })))[0]!.screens;
    expect(screens.map((s) => [s.name, screenKey(s)])).toEqual([
      ['Anime', 'Otaku/Library#anime'],
      ['Manga', 'Otaku/Library#manga'],
      ['Lists', 'Otaku/Lists'],
      ['Quotes', 'Otaku/Quotes'],
      ['Years', 'Otaku/Years'],
    ]);
    // A record made on the Anime screen is an anime.
    expect(viewValues(library.views!.find((v) => v.id === 'anime'), library)).toEqual({ type: 'Anime' });
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
    // With CRM, Health is refused; alone it is set up, and nothing of a business is added to it.
    expect(() => planApp({ name: 'A', templates: [{ id: 'crm' }, { id: 'health' }] })).toThrow('An app is set up from templates for a business or for a person, not both: crm for a business, health for a person. Set them up as two apps');
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Mine', templates: [{ id: 'health' }] }, { ids }));
    const found = (await findApp(fs, 'Mine'))!;
    expect(() => planApp({ name: '', templates: [{ id: 'support' }] }, { found })).toThrow(/support for a business, health for a person/);
    expect(() => planApp({ name: '', templates: [{ id: 'home', answers: { keeps: ['documents'] } }] }, { found, ids })).toThrow('Home shares no data with Health: set it up as its own app');
    // An app with no currencies takes the ones given with a template that keeps money; one that has them keeps its own.
    await installApp(fs, planApp({ name: 'Work', templates: [{ id: 'content' }] }, { ids }));
    const work = (await findApp(fs, 'Work'))!;
    expect(() => planApp({ name: '', templates: [{ id: 'budget' }] }, { found: work, ids })).toThrow(/Give the currencies/);
    const withMoney = planApp({ name: '', currencies: ['EUR', 'TRY'], templates: [{ id: 'budget' }] }, { found: work, ids });
    expect(withMoney.app.currencies).toEqual(['EUR', 'TRY']);
    expect(JSON.parse(withMoney.files.find((f) => f.path === `Work/${APP_FILE}`)!.text).currencies).toEqual(['EUR', 'TRY']);
    await installApp(fs, withMoney);
    const again = (await findApp(fs, 'Work'))!;
    expect(planApp({ name: '', currencies: ['USD'], templates: [{ id: 'projects' }] }, { found: again, ids }).app.currencies).toEqual(['EUR', 'TRY']);
  });

  it('keeps documents, and reminders for each home and car: how often from the reminder’s words, a ready one or Custom', () => {
    expect(['Boiler service every year', 'Water purifier filters every 6 months', 'Tyre change twice a year', 'Inspection every 2 years', 'Filters every 3 months', 'Plants monthly', 'Bins weekly', 'Descale every 10 days', 'Oil every 18 months', 'Gutters'].map(jobOf)).toEqual([
      { name: 'Boiler service', every: 'Yearly' },
      { name: 'Water purifier filters', every: 'Every 6 months' },
      { name: 'Tyre change', every: 'Every 6 months' },
      { name: 'Inspection', every: 'Every 2 years' },
      { name: 'Filters', every: 'Every 3 months' },
      { name: 'Plants', every: 'Monthly' },
      { name: 'Bins', every: 'Weekly' },
      { name: 'Descale', every: 'Custom', interval: 10, unit: 'Days' },
      { name: 'Oil', every: 'Custom', interval: 18, unit: 'Months' },
      { name: 'Gutters', every: 'Yearly' },
    ]);
    const plan = planApp({ name: 'Atlas', templates: [{ id: 'home', answers: { homes: ['Flat', 'Summer house'], cars: ['Golf', 'Vespa'], carJobs: ['Inspection every 2 years'] } }] }, { ids });
    const records = (dir: string) => plan.files.filter((f) => f.path.startsWith(`Atlas/${dir}/`) && !f.path.includes('/_'));
    expect(records('Homes')).toHaveLength(2);
    expect(records('Cars')).toHaveLength(2);
    // Four reminders at each home, one for each car: each linked to its own.
    const reminders = records('Reminders');
    expect(reminders).toHaveLength(10);
    expect(reminders.filter((f) => f.text.includes('Summer house'))).toHaveLength(4);
    expect(reminders.filter((f) => f.text.includes('Vespa') && f.text.includes('Every 2 years'))).toHaveLength(1);
    const schema = (dir: string) => parseSchema(plan.files.find((f) => f.path === `Atlas/${dir}/_collection.json`)!.text);
    // How often: a ready one, or Custom with how many of what, shown only then.
    expect(schema('Reminders').fields.map((f) => [f.key, f.when?.[0]?.value ?? null])).toEqual([
      ['name', null], ['home', null], ['car', null], ['next', null], ['every', null], ['interval', ['Custom']], ['unit', ['Custom']], ['remind', null], ['remind_on', null], ['last', null],
    ]);
    expect(schema('Reminders').fields.find((f) => f.key === 'every')!.options).toEqual(['Weekly', 'Monthly', 'Every 3 months', 'Every 6 months', 'Yearly', 'Every 2 years', 'Custom']);
    expect(schema('Cars').fields.map((f) => f.key)).toEqual(['name', 'plate', 'next']);
    // Documents are documents: a day they run out only when they do.
    const documents = schema('Documents');
    expect(documents.fields.map((f) => f.key)).toEqual(['name', 'home', 'car', 'expires', 'remind']);
    expect(documents.fields.find((f) => f.key === 'expires')!.required).toBeUndefined();
    // Only the cars: no homes, and their reminders.
    const cars = planApp({ name: 'Garage', templates: [{ id: 'home', answers: { keeps: ['vehicles'] } }] }, { ids });
    expect(cars.created.map((c) => c.path)).toEqual(['Garage/Cars', 'Garage/Reminders', 'Garage/About Garage.md']);
  });

  it('sets up a person’s templates in one app only with those they share data with', async () => {
    // Finance, Shared expenses and Travel go together; People and Reading; Sport and Gym; each of the others alone. A business's all together.
    expect(TEMPLATE_IDS.filter((id) => audienceOf(TEMPLATES[id].group) === 'personal' && TEMPLATE_IDS.some((other) => other !== id && goTogether(id, other)))).toEqual(['finance', 'travel', 'split', 'people', 'reading', 'sport', 'gym']);
    expect(goTogether('finance', 'travel')).toBe(false);
    expect(goTogether('crm', 'timeoff')).toBe(true);
    expect(goTogether('crm', 'gym')).toBe(false);
    // What may be picked: with none chosen, all; with Finance, Shared expenses; with both, Travel; with Habits, nothing more.
    const pickable = (chosen: TemplateId[]) => TEMPLATE_IDS.filter((id) => audienceOf(TEMPLATES[id].group) === 'personal' && !chosen.includes(id) && fitsWith(id, new Set(chosen)));
    expect(pickable(['finance'])).toEqual(['split']);
    expect(pickable(['finance', 'split'])).toEqual(['travel']);
    expect(pickable(['gym'])).toEqual(['sport']);
    expect(pickable(['habits'])).toEqual([]);
    // Templates set apart are refused, said by their short names.
    expect(() => planApp({ name: 'A', templates: [{ id: 'habits' }, { id: 'recipes' }] })).toThrow('Recipes and Habits share no data: set them up as separate apps');
    expect(() => planApp({ name: 'A', currencies: ['TRY'], templates: [{ id: 'finance' }, { id: 'travel' }, { id: 'gym' }] })).toThrow('Finance, Travel and Gym share no data: set them up as separate apps');
    expect(() => planApp({ name: 'A', currencies: ['TRY'], templates: [{ id: 'finance' }, { id: 'split' }, { id: 'habits' }] })).toThrow('Finance + Shared expenses and Habits share no data: set them up as separate apps');
    expect(planApp({ name: 'A', currencies: ['TRY'], templates: [{ id: 'finance' }, { id: 'split' }, { id: 'travel' }] }, { ids }).templates.map((s) => s.id)).toEqual(['finance', 'travel', 'split']);
    // Added to an app, one that goes with what is in it; an app set up mixed before keeps its templates, and may be added to.
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Fit', templates: [{ id: 'gym' }] }, { ids }));
    const fit = (await findApp(fs, 'Fit'))!;
    expect(planApp({ name: '', templates: [{ id: 'sport' }] }, { found: fit, ids }).templates.map((s) => s.id)).toEqual(['sport']);
    expect(() => planApp({ name: '', templates: [{ id: 'habits' }, { id: 'reading' }] }, { found: fit, ids })).toThrow('Reading and Habits share no data with Gym: set them up as their own apps');
    const mixed = { ...fit, app: { ...fit.app, templates: [...fit.app.templates, { id: 'habits' as const, version: 1, answers: {} }] } };
    expect(planApp({ name: '', templates: [{ id: 'sport' }] }, { found: mixed, ids }).templates.map((s) => s.id)).toEqual(['sport']);
    expect(() => planApp({ name: '', templates: [{ id: 'recipes' }] }, { found: mixed, ids })).toThrow('Recipes shares no data with Gym and Habits: set it up as its own app');
  });
});

describe('the menu of an app', () => {
  const piecesOf = (found: FoundApp): AppPiece[] => [...found.pieces].map(([role, p]) => ({ kind: p.kind, path: p.path, role }));

  it('has no line in any template’s menu, and only pieces there are', () => {
    for (const id of TEMPLATE_IDS) {
      for (const { role } of [MOST, LEAST].flatMap((answers) => menuEntries(TEMPLATES[id], answers[id] ?? {}))) {
        expect(PIECES[role], `${id}: ${role}`).toBeDefined();
        expect(PIECES[role]!.lines, `${id}: ${role}`).toBeUndefined();
      }
    }
  });

  it('gives each template a module of what it set up, its lines and its About note left out, with every answer turned on and off', async () => {
    for (const answers of [MOST, LEAST]) {
      for (const id of TEMPLATE_IDS) {
        const fs = new MemoryFs();
        await installApp(fs, planApp({ name: 'A', currencies: ['EUR'], templates: [{ id, answers: answers[id] }] }, { ids }));
        const found = (await findApp(fs, 'A'))!;
        const menu = menuOf(found.app, 'A', piecesOf(found));
        // Reading's kinds are screens of one collection, each on its view.
        const screens = [...new Set(menu.flatMap((m) => m.screens.map((s) => s.role!)))];
        const wanted = [...found.pieces.keys()].filter((role) => !PIECES[role]!.lines);
        expect(screens.slice().sort(), id).toEqual(wanted.sort());
        expect(menu.map((m) => m.name)).toEqual(screens.length > 0 ? [t(TEMPLATES[id].short)] : []);
      }
    }
  });

  it('shows a piece two templates set up in the module of each, by its name now', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Spare parts', currencies: ['EUR'], templates: [{ id: 'crm' }, { id: 'sales' }, { id: 'stock' }] }, { ids }));
    const found = (await findApp(fs, 'Spare parts'))!;
    const menu = menuOf(found.app, 'Spare parts', piecesOf(found));
    expect(menu.map((m) => [m.name, m.screens.map((s) => s.name)])).toEqual([
      ['CRM', ['Deals', 'Companies', 'People', 'Activities']],
      ['Sales', ['Orders', 'Payments', 'Products', 'Companies']],
      ['Stock', ['Products', 'Purchase orders', 'Stock counts', 'Companies']],
    ]);
    // Order lines and Purchase order lines are lines: in no module.
    expect(menu.flatMap((m) => m.screens.map((s) => s.name))).not.toContain('Order lines');
    // What a piece is called now is its name in the menu.
    const renamed = menuOf(found.app, 'Spare parts', piecesOf(found).map((p) => (p.role === 'companies' ? { ...p, path: 'Spare parts/Customers' } : p)));
    expect(renamed[1]!.screens.map((s) => s.name)).toEqual(['Orders', 'Payments', 'Products', 'Customers']);
  });
});

describe('the menu the person sets', () => {
  const piecesOf = (found: FoundApp): AppPiece[] => [...found.pieces].map(([role, p]) => ({ kind: p.kind, path: p.path, role }));
  const names = (modules: { name: string; screens: { name: string }[] }[]) => modules.map((m) => [m.name, m.screens.map((s) => s.name)]);

  it('is kept in _app.json and shown instead of the templates’, hidden screens left out, a view kept, Home as it says', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Spare parts', currencies: ['EUR'], templates: [{ id: 'crm' }, { id: 'sales' }] }, { ids }));
    let found = (await findApp(fs, 'Spare parts'))!;
    const edit = menuEditOf(found.app, 'Spare parts', piecesOf(found));
    expect(edit.home).toEqual({ today: true, cards: true });
    // Sales first and called Selling, Payments hidden, Orders opening on a view; no Today on Home.
    const [crm, sales] = edit.modules;
    const changed = {
      modules: [
        { ...sales!, name: 'Selling', screens: sales!.screens.map((s) => (s.name === 'Payments' ? { ...s, hidden: true } : s.name === 'Orders' ? { ...s, view: 'open' } : s)) },
        crm!,
      ],
      home: { today: false, cards: true },
    };
    const file = menuFileOf(changed, 'Spare parts');
    expect(file.hidden).toEqual(['Payments']);
    expect(file.home).toEqual({ today: false });
    expect(file.modules[0]!.screens[0]).toEqual({ path: 'Orders', view: 'open' });
    const before = await writeAppMenu(fs, 'Spare parts', file);
    expect(JSON.parse(before).menu).toBeUndefined();
    found = (await findApp(fs, 'Spare parts'))!;
    expect(found.app.menu).toEqual(file);
    const menu = menuOf(found.app, 'Spare parts', piecesOf(found));
    expect(names(menu)).toEqual([
      ['Selling', ['Orders', 'Products', 'Companies']],
      ['CRM', ['Deals', 'Companies', 'People', 'Activities']],
    ]);
    expect(menu[0]!.screens[0]).toMatchObject({ view: 'open' });
    expect(screenKey(menu[0]!.screens[0]!)).toBe('Spare parts/Orders#open');
    expect(homeOf(found.app)).toEqual({ today: false, cards: true });
    // The hidden screen is in Edit menu still, in its module, faint.
    expect(menuEditOf(found.app, 'Spare parts', piecesOf(found)).modules[0]!.screens.find((s) => s.name === 'Payments')?.hidden).toBe(true);
    // Reset to template: the templates' menu again.
    await writeAppMenu(fs, 'Spare parts', null);
    found = (await findApp(fs, 'Spare parts'))!;
    expect(found.app.menu).toBeUndefined();
    expect(names(menuOf(found.app, 'Spare parts', piecesOf(found)))[0]![0]).toBe('CRM');
  });

  it('keeps what a template sets up later at the end of its module, or of a module of its own; what the person made is in no menu until added', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Spare parts', currencies: ['EUR'], templates: [{ id: 'crm' }] }, { ids }));
    let found = (await findApp(fs, 'Spare parts'))!;
    const edit = menuEditOf(found.app, 'Spare parts', piecesOf(found));
    // People taken off CRM's menu by hiding it, then Sales added to the app.
    edit.modules[0]!.screens = edit.modules[0]!.screens.map((s) => (s.name === 'People' ? { ...s, hidden: true } : s));
    await writeAppMenu(fs, 'Spare parts', menuFileOf(edit, 'Spare parts'));
    found = (await findApp(fs, 'Spare parts'))!;
    await installApp(fs, planApp({ name: 'Spare parts', templates: [{ id: 'sales' }] }, { found, ids }));
    found = (await findApp(fs, 'Spare parts'))!;
    expect(found.app.menu?.hidden).toEqual(['People']);
    await createCollection(fs, 'Spare parts', 'Supplier prices', 'blank');
    const pieces = [...piecesOf(found), { kind: 'collection' as const, path: 'Spare parts/Supplier prices' }];
    expect(names(menuOf(found.app, 'Spare parts', pieces))).toEqual([
      ['CRM', ['Deals', 'Companies', 'Activities']],
      ['Sales', ['Orders', 'Payments', 'Products']],
    ]);
    const now = menuEditOf(found.app, 'Spare parts', pieces);
    expect(unplacedOf(now, pieces).map((p) => p.path)).toContain('Spare parts/Order lines');
    expect(unplacedOf(now, pieces, new Map([['Spare parts/Order lines', 'Spare parts/Orders']])).map((p) => p.path)).toEqual(['Spare parts/Supplier prices']);
  });

  it('sets up an app of no template with its menu, an icon of the app icons, and a template added to it at the end', async () => {
    const fs = new MemoryFs();
    expect(() => planApp({ name: 'Garden', templates: [] }, { ids })).toThrow(AppProblems);
    expect(() => planApp({ name: 'Garden', templates: [], menu: { modules: [{ name: '', screens: [] }] }, icon: 'rocket-ship' }, { ids })).toThrow(/icon is one of/);
    const plan = planApp({ name: 'Garden', templates: [], menu: { modules: [{ name: '', screens: [] }] }, icon: APP_ICONS[1] }, { ids });
    expect(plan.created).toEqual([]);
    expect(plan.dirs).toEqual(['Garden']);
    await installApp(fs, plan);
    let found = (await findApp(fs, 'Garden'))!;
    expect(found.app).toMatchObject({ name: 'Garden', templates: [], menu: { modules: [{ name: '', screens: [] }] } });
    expect(appIcon(found.app)).toBe(APP_ICONS[1]);
    expect(menuOf(found.app, 'Garden', [])).toEqual([]);
    // A screen the person made goes in its one module; a template added comes after it.
    await createCollection(fs, 'Garden', 'Plants', 'blank');
    await writeAppMenu(fs, 'Garden', { modules: [{ name: '', screens: [{ path: 'Plants' }] }] });
    found = (await findApp(fs, 'Garden'))!;
    await installApp(fs, planApp({ name: 'Garden', currencies: ['EUR'], templates: [{ id: 'finance' }] }, { found, ids }));
    found = (await findApp(fs, 'Garden'))!;
    const pieces = [...piecesOf(found), { kind: 'collection' as const, path: 'Garden/Plants' }];
    const menu = menuOf(found.app, 'Garden', pieces);
    expect(menu.map((m) => [m.name, m.screens[0]?.name])).toEqual([
      ['', 'Plants'],
      [t(TEMPLATES.finance.short), 'Transactions'],
    ]);
    expect(found.app.menu).toBeDefined();
  });

  it('shows an app of no template and no menu as the collections and boards in its folder by name, lines left out', async () => {
    const fs = new MemoryFs();
    await fs.mkdir('Garden');
    await fs.writeText('Garden/_app.json', JSON.stringify({ version: 1, name: 'Garden', currencies: [], templates: [], icon: 'leaf' }));
    const app = (await readAppFile(fs, 'Garden'))!;
    expect(app.icon).toBe('leaf');
    const pieces: AppPiece[] = [
      { kind: 'collection', path: 'Garden/Plants' },
      { kind: 'board', path: 'Garden/Jobs.board.json' },
      { kind: 'collection', path: 'Garden/Plant parts' },
    ];
    expect(names(menuOf(app, 'Garden', pieces, new Map([['Garden/Plant parts', 'Garden/Plants']])))).toEqual([['', ['Jobs', 'Plants']]]);
    expect(readAppMenu({ modules: [{ name: ' Main ', template: 'nope', screens: ['Plants/', { path: 'Jobs.board.json', view: 1 }, 3] }], hidden: ['x', 2], home: { today: false, cards: 'no' } })).toEqual({
      modules: [{ name: 'Main', screens: [{ path: 'Plants' }, { path: 'Jobs.board.json' }] }],
      hidden: ['x'],
      home: { today: false },
    });
  });
});

describe('what a new Gym starts with', () => {
  it('has the moves most used in a gym, each with its muscle group, and a program of three days, its items linked to them', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Gym', templates: [{ id: 'gym' }] }, { ids, today: '2026-10-25' }));
    const exercises = await loadCollection(fs, 'Gym/Exercises');
    expect(exercises.records).toHaveLength(72);
    expect(exercises.records.every((r) => typeof r.values.muscle === 'string')).toBe(true);
    expect(exercises.records.find((r) => r.name === 'Leg Press')?.values.muscle).toBe('Legs');
    const programs = await loadCollection(fs, 'Gym/Programs');
    expect(programs.records).toHaveLength(1);
    const [program] = programs.records;
    expect(program!.values).toMatchObject({ name: '3-Day Full Body', days: ['Mon', 'Wed', 'Fri'], from: '2026-10-25', duration: 60 });
    expect(program!.body).toContain('**Progression**');
    const items = await loadCollection(fs, 'Gym/Program items');
    expect(items.records).toHaveLength(20);
    const press = items.records.find((r) => r.name === 'Chest Press Machine')!;
    expect(press.values).toMatchObject({ part: 'Workout', order: 1, sets: 3, reps: 12, rest: 1.5, note: 'Push at chest height' });
    // Linked by id, as the app links: the program counts its items, the move is the one in Exercises.
    expect((press.values.exercise as { id: string }).id).toBe(exercises.records.find((r) => r.name === 'Chest Press Machine')!.id);
    expect((press.values.program as { id: string }).id).toBe(program!.id);
    const computer = new Computer([programs, items, exercises], {}, '2026-10-25');
    expect(computer.values('Gym/Programs', program!).items).toBe(20);
    // A Gym without program days has its program, with no days.
    const other = new MemoryFs();
    await installApp(other, planApp({ name: 'Gym', templates: [{ id: 'gym', answers: { days: false } }] }, { ids }));
    expect((await loadCollection(other, 'Gym/Programs')).records[0]!.values.days).toBeUndefined();
  });
});

describe('the fields kept off a record’s window', () => {
  it('are the template’s, as its mockup has them, until the layout says its own; and they are written and read back', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Gym', templates: [{ id: 'gym' }] }, { ids }));
    const workouts = await loadCollection(fs, 'Gym/Workouts');
    expect([...hiddenOnForm(workouts.schema)].sort()).toEqual(['all_moves', 'done_moves', 'moves', 'name', 'status', 'this_month', 'this_week']);
    expect([...hiddenOnForm((await loadCollection(fs, 'Gym/Program items')).schema)].sort()).toEqual(['name', 'order']);
    // Shown again, every one: the layout says so, and it stays when the schema is settled and read back.
    const shown = { ...workouts.schema, layout: { ...workouts.schema.layout!, hidden: [] } };
    const read = parseSchema(serializeSchema(settleSchema(shown)));
    expect(read.layout?.hidden).toEqual([]);
    expect(hiddenOnForm(read).size).toBe(0);
    const one = parseSchema(serializeSchema(settleSchema({ ...workouts.schema, layout: { ...workouts.schema.layout!, hidden: ['minutes'] } })));
    expect([...hiddenOnForm(one)]).toEqual(['minutes']);
  });
});

describe('the lines of a record', () => {
  it('are what its block says, else what the roles say: an order’s lines, never its payments or a product', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['EUR'], templates: [{ id: 'sales' }, { id: 'stock', answers: { purchasing: true } }] }, { ids }));
    const all: Collection[] = [];
    for (const name of ['Orders', 'Order lines', 'Payments', 'Products', 'Purchase orders', 'Purchase order lines']) all.push(await loadCollection(fs, `Atlas/${name}`));
    const at = (path: string) => all.find((c) => c.dir === path);
    const linesOf = (name: string) => linesBlocks(at(`Atlas/${name}`)!.schema, at).map(({ source }) => source.dir);
    expect(linesOf('Orders')).toEqual(['Atlas/Order lines']);
    expect(linesOf('Purchase orders')).toEqual(['Atlas/Purchase order lines']);
    expect(linesOf('Products')).toEqual([]);
    // Payments show in an order but are not its lines, unless its block says so; the block says when lines are not.
    const lines = { block: 'linked' as const, collection: 'Atlas/Order lines' };
    const payments = { block: 'linked' as const, collection: 'Atlas/Payments' };
    expect(showsLines(lines, 'orders', 'order-lines')).toBe(true);
    expect(showsLines({ ...lines, lines: false }, 'orders', 'order-lines')).toBe(false);
    expect(showsLines(payments, 'orders', 'payments')).toBe(false);
    expect(showsLines({ ...payments, lines: true }, 'orders', 'payments')).toBe(true);
    // Outside an app, no role: only the block says.
    expect(showsLines(lines, undefined, undefined)).toBe(false);
    expect(showsLines({ ...lines, lines: true }, undefined, undefined)).toBe(true);
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
    expect(plan.changed).toEqual(['Companies: 1 block on its screen', 'Goods: 16 fields, 2 blocks on its screen, 2 rules', 'Orders: 1 rule', 'Order lines: 1 field, 1 rule']);
    // The summary of what is added: a piece each, the About note's new section; what is set up, without what the app has.
    expect(plan.added.map((a) => `${a.name}: ${a.what}`)).toEqual([...plan.changed, 'About Atlas: a section at its end']);
    expect(plan.templates.map((s) => [s.id, s.pieces.map((p) => p.name)])).toEqual([['stock', ['Stock movements', 'Stock counts', 'Purchase orders', 'Purchase order lines']]]);
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

describe('editing an app', () => {
  /** Puts a card in a board's column, by the column's name. */
  const card = async (fs: MemoryFs, path: string, title: string, column: string) => {
    const board = JSON.parse(await fs.readText(path));
    const key = (board.cards ?? []).length + 1;
    board.cards = [...(board.cards ?? []), { id: `card${key}`, key, title, column: board.columns.find((c: { name: string }) => c.name === column).id, order: key }];
    await fs.writeText(path, JSON.stringify(board, null, 2));
  };
  const edit = async (fs: MemoryFs, templates: { id: string; answers?: Answers; renames?: { [q: string]: { [from: string]: string } } }[]) =>
    planApp({ name: '', templates }, { found: (await findApp(fs, 'Atlas', { records: true }))!, ids, edit: true });
  const said = (items: { name: string; what: string }[]) => items.map((i) => `${i.name}: ${i.what}`);

  it('changes the currencies and the name: amounts shown in the new one, a field the person changed kept, a second one filling the records in', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['USD'], templates: [{ id: 'finance' }] }, { ids }));
    const schemaOf = async (path: string) => parseSchema(await fs.readText(`Atlas/${path}/_collection.json`));
    // The person changes the opening balance's field: it is theirs.
    const accounts = JSON.parse(await fs.readText('Atlas/Accounts/_collection.json'));
    accounts.fields.find((f: { key: string }) => f.key === 'opening').label = 'Start';
    await fs.writeText('Atlas/Accounts/_collection.json', JSON.stringify(accounts, null, 2));
    const editTo = async (currencies: string[], name = 'Atlas') => planApp({ name, currencies, templates: [] }, { found: (await findApp(fs, 'Atlas', { records: true }))!, ids, edit: true });

    const tl = await editTo(['TRY']);
    expect(said(tl.edit!.changed)).toEqual(['Atlas: in TRY, was USD; amounts are not converted']);
    await installApp(fs, tl);
    expect((await schemaOf('Transactions')).fields.find((f) => f.key === 'amount')!.format).toMatchObject({ currency: 'TRY' });
    expect((await schemaOf('Categories')).fields.find((f) => f.key === 'shown')!.formula).toContain('₺');
    expect((await schemaOf('Accounts')).fields.find((f) => f.key === 'opening')).toMatchObject({ label: 'Start', format: { currency: 'USD' } });
    expect(JSON.parse(await fs.readText('Atlas/_app.json')).currencies).toEqual(['TRY']);
    expect((await editTo(['TRY'])).edit!.same).toBe(true);

    await installApp(fs, await editTo(['TRY', 'EUR']));
    expect((await schemaOf('Accounts')).fields.map((f) => f.key)).toContain('currency');
    const bank = await loadCollection(fs, 'Atlas/Accounts');
    expect(bank.records.map((r) => r.values.currency)).toEqual(['TRY', 'TRY', 'TRY']);

    const named = await editTo(['TRY', 'EUR'], 'Money');
    expect(named.edit!.renamed).toBe('Atlas');
    expect(said(named.edit!.changed)).toEqual(['Money: was Atlas; its folder and About note take the new name']);
    await installApp(fs, named);
    expect(await fs.readText('Atlas/About Atlas.md')).toMatch(/^# About Money/);
    expect(JSON.parse(await fs.readText('Atlas/_app.json')).name).toBe('Money');
  });

  it('renames a stage with its cards, adds one, takes off an empty one and keeps one a deal is in', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'crm' }] }, { ids }));
    await card(fs, 'Atlas/Deals.board.json', 'Lara Turizm', 'Meeting');
    await card(fs, 'Atlas/Deals.board.json', 'Atakule', 'Proposal');
    const plan = await edit(fs, [{ id: 'crm', answers: { stages: ['Lead', 'Quote', 'Negotiation', 'Won', 'Lost'] }, renames: { stages: { Proposal: 'Quote' } } }]);
    expect(said(plan.added)).toEqual(['Deals: a Negotiation column']);
    expect(said(plan.edit!.changed)).toEqual(['Deals: Proposal is now Quote; its card follows', 'About Atlas: its CRM section, with the new answers']);
    expect(said(plan.edit!.takenOff)).toEqual(['Deals: the Contacted column']);
    expect(said(plan.edit!.kept)).toEqual(['Deals: the Meeting column: 1 card is in it']);
    const done = await installApp(fs, plan);
    const board = parseBoard(await fs.readText('Atlas/Deals.board.json'));
    expect(board.columns.map((c) => c.name)).toEqual(['Lead', 'Meeting', 'Quote', 'Negotiation', 'Won', 'Lost']);
    expect(board.cards.find((c) => c.title === 'Atakule')!.column).toBe(board.columns.find((c) => c.name === 'Quote')!.id);
    expect(await fs.readText('Atlas/About Atlas.md')).toContain('**Negotiation:**');
    expect(JSON.parse(await fs.readText(`Atlas/${APP_FILE}`)).templates[0].answers.stages).toEqual(['Lead', 'Quote', 'Negotiation', 'Won', 'Lost']);
    await undoApp(fs, done);
    expect(parseBoard(await fs.readText('Atlas/Deals.board.json')).columns.map((c) => c.name)).toEqual(['Lead', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost']);
    expect(JSON.parse(await fs.readText(`Atlas/${APP_FILE}`)).templates[0].answers.stages).toContain('Proposal');
  });

  it('takes off the view and the rule an answer brought, keeps the records, and brings them back', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', templates: [{ id: 'sport', answers: { races: true } }] }, { ids }));
    const races = await loadCollection(fs, 'Atlas/Races');
    await addRecord(fs, races, { values: { name: 'Istanbul 10K', date: '2026-11-08' } });
    const off = await edit(fs, [{ id: 'sport', answers: { races: false } }]);
    expect(said(off.edit!.takenOff)).toEqual(['Races: the Calendar view', 'Races: the Coming view', 'Races: the Done view', 'Races: the Write result button']);
    expect(said(off.edit!.kept)).toEqual(['Races: with its record']);
    await installApp(fs, off);
    const schema = parseSchema(await fs.readText('Atlas/Races/_collection.json'));
    expect(schema.views ?? []).toEqual([]);
    expect(schema.fields.map((f) => f.key)).toContain('result');
    expect(await fs.readText('Atlas/Races/_rules.js')).not.toContain('Your time, and your place');
    expect((await loadCollection(fs, 'Atlas/Races')).records.map((r) => r.name)).toEqual(['Istanbul 10K']);
    // Turned on again, what was taken off comes back; the record is where it was.
    const on = await edit(fs, [{ id: 'sport', answers: { races: true } }]);
    expect(said(on.added)).toEqual(expect.arrayContaining(['Races: 1 rule', 'Races: the Calendar view', 'Races: the Coming view']));
    await installApp(fs, on);
    expect(parseSchema(await fs.readText('Atlas/Races/_collection.json')).views!.map((v) => v.name)).toEqual(['Calendar', 'Coming', 'Done']);
    expect(await fs.readText('Atlas/Races/_rules.js')).toContain('Your time, and your place');
  });

  it('keeps a view and a rule the person changed, and says so', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', templates: [{ id: 'sport', answers: { races: true } }] }, { ids }));
    const schema = JSON.parse(await fs.readText('Atlas/Races/_collection.json'));
    schema.views[0].name = 'My races';
    await fs.writeText('Atlas/Races/_collection.json', JSON.stringify(schema));
    const rules = await fs.readText('Atlas/Races/_rules.js');
    await fs.writeText('Atlas/Races/_rules.js', rules.replace('Your time', 'My time'));
    const plan = await edit(fs, [{ id: 'sport', answers: { races: false } }]);
    // What the person did not change goes; what they changed stays.
    expect(said(plan.edit!.takenOff)).toEqual(['Races: the Coming view', 'Races: the Done view']);
    expect(said(plan.edit!.kept)).toEqual(['Races: the Calendar view, changed by you', 'Races: Write result, changed by you', 'Races: as it is']);
  });

  it('renames a record an answer set up, with the links to it, and keeps one gone', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'stock', answers: { locations: true } }] }, { ids }));
    const locations = await loadCollection(fs, 'Atlas/Locations');
    const main = locations.records.find((r) => r.name === 'Main warehouse')!;
    // A collection that links to Locations, with a record linked to the main warehouse.
    const found = (await findApp(fs, 'Atlas'))!;
    const linking = [...found.pieces.values()].find((p) => p.kind === 'collection' && parseSchema(p.text).fields.some((f) => f.type === 'link' && f.collection === 'Atlas/Locations'))!;
    const key = parseSchema(linking.text).fields.find((f) => f.type === 'link' && f.collection === 'Atlas/Locations')!.key;
    await addRecord(fs, await loadCollection(fs, linking.path), { values: { [key]: { id: main.id, name: 'Main warehouse' } } });
    const plan = await edit(fs, [{ id: 'stock', answers: { locationList: ['Depot', 'Store Moda'] }, renames: { locationList: { 'Main warehouse': 'Depot' } } }]);
    expect(said(plan.edit!.changed)).toContain('Locations: Main warehouse is now Depot');
    expect(said(plan.edit!.kept)).toEqual(['Locations: Second warehouse, with what is in it']);
    expect(said(plan.added)).toContain('Locations: 1 record');
    await installApp(fs, plan);
    expect((await loadCollection(fs, 'Atlas/Locations')).records.map((r) => r.name).sort()).toEqual(['Depot', 'Second warehouse', 'Store Moda']);
    const linked = (await loadCollection(fs, linking.path)).records[0]!;
    expect(linked.values[key]).toEqual({ id: main.id, name: 'Depot' });
  });

  it('renames a choice with what holds it, and takes off one nothing holds', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'budget' }] }, { ids }));
    const lines = await loadCollection(fs, 'Atlas/Budget lines');
    await addRecord(fs, lines, { values: { name: 'Office', category: 'Rent' } });
    const plan = await edit(fs, [{ id: 'budget', answers: { categories: ['Office', 'Salaries', 'Marketing', 'Software', 'Travel'] }, renames: { categories: { Rent: 'Office' } } }]);
    expect(said(plan.edit!.changed)).toEqual(expect.arrayContaining(['Budget lines: Category: Rent is now Office; its record follows']));
    expect(said(plan.edit!.takenOff)).toEqual(expect.arrayContaining(['Budget lines: the Other choice of Category']));
    await installApp(fs, plan);
    const after = await loadCollection(fs, 'Atlas/Budget lines');
    expect(after.schema.fields.find((f) => f.key === 'category')!.options).toEqual(['Office', 'Salaries', 'Marketing', 'Software', 'Travel']);
    expect(after.records[0]!.values.category).toBe('Office');
  });

  it('writes nothing when no answer changes', async () => {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Atlas', currencies: ['TRY'], templates: [{ id: 'crm' }] }, { ids }));
    const plan = await edit(fs, [{ id: 'crm', answers: { deals: true } }]);
    expect(plan.edit!.same).toBe(true);
    expect(plan.files).toEqual([]);
    await expect(edit(fs, [{ id: 'sales', answers: {} }])).rejects.toThrow('sales is not in the app');
  });

  it('turns every template’s answers off and on again, each time a right app, an answer not given kept as it is', async () => {
    for (const id of TEMPLATE_IDS) {
      const fs = new MemoryFs();
      const most = given([id], MOST)[0]!;
      await installApp(fs, planApp({ name: 'Atlas', currencies: ['TRY'], templates: [most] }, { ids }));
      const least = given([id], LEAST)[0]!;
      await installApp(fs, await edit(fs, [{ id, answers: least.answers }]));
      await installApp(fs, await edit(fs, [{ id, answers: most.answers }]));
      expect(JSON.parse(await fs.readText(`Atlas/${APP_FILE}`)).templates[0].answers, id).toEqual(readAnswers(TEMPLATES[id], new Set([id]), { ...least.answers, ...most.answers }).answers);
    }
  });
});

describe('Gym', () => {
  async function gymApp(answers: Answers) {
    const fs = new MemoryFs();
    await installApp(fs, planApp({ name: 'Gym', templates: [{ id: 'gym', answers }] }, { ids }));
    const load = (dir: string) => loadCollection(fs, `Gym/${dir}`);
    const add = async (dir: string, values: Record['values']) => addRecord(fs, await load(dir), { values });
    const chest = await add('Exercises', { name: 'Chest press', muscle: 'Chest' });
    const walk = await add('Exercises', { name: 'Walk' });
    const program = await add('Programs', { name: 'Full body', days: ['Mon', 'Wed', 'Fri'], from: '2026-10-12', duration: 60 });
    const to = (r: Record) => ({ id: r.id, name: r.name });
    await add('Program items', { name: 'Walk', program: to(program), part: 'Warm-up', order: 1, exercise: to(walk), time: 5 });
    await add('Program items', { name: 'Chest press', program: to(program), part: 'Workout', order: 2, exercise: to(chest), sets: 3, reps: 12 });
    const space = async (): Promise<RuleSpaceNow> => ({ collections: await Promise.all(['Exercises', 'Programs', 'Program items', 'Workouts', 'Workout items'].map(load)), boards: {}, lists: {}, today: '2026-10-21' });
    return { fs, load, add, to, chest, program, space };
  }

  it('fills a workout from its program as the program is picked, each move ticked, its weight as the last time', async () => {
    const { add, to, chest, program, space, load } = await gymApp({});
    // Monday's workout, written before: the chest press at 42.5 kg, 3 × 12.
    const monday = await add('Workouts', { name: 'Full body · Mon', day: '2026-10-19', program: to(program), status: 'Done' });
    await add('Workout items', { name: 'Chest press', workout: to(monday), exercise: to(chest), part: 'Workout', done: true, sets: 3, reps: 12, kg: 42.5, day: '2026-10-19' });
    const workouts = await load('Workouts');
    const wednesday = recordWith(workouts, 'w2', { day: '2026-10-21', program: to(program), status: 'Done' });
    const ran = planSave('Gym/Workouts', wednesday, null, await space(), { field: 'program' });
    expect(ran.stops).toEqual([]);
    const lines = ran.after.changes.map((c) => ('values' in c ? c.values : {})).sort((x, y) => Number(x.order) - Number(y.order));
    expect(lines).toMatchObject([
      { name: 'Walk', part: 'Warm-up', done: true, day: '2026-10-21', time: 5, workout: { id: 'w2' } },
      { name: 'Chest press', part: 'Workout', done: true, sets: 3, reps: 12, kg: 42.5, last_time: '42.5 kg · 3 × 12' },
    ]);
    // Saved at once, its moves link to it by the name its onSave gives it.
    const saved = planSave('Gym/Workouts', wednesday, null, await space());
    expect(saved.values.name).toBe('Full body · 2026-10-21');
    expect(saved.after.changes.map((c) => ('values' in c ? c.values.workout : null))).toEqual([
      { id: 'w2', name: 'Full body · 2026-10-21' },
      { id: 'w2', name: 'Full body · 2026-10-21' },
    ]);
  });

  it('writes each set a line when asked, from the program’s sets', async () => {
    const { to, program, space, load } = await gymApp({ sets: true });
    const ran = planSave('Gym/Workouts', recordWith(await load('Workouts'), 'w1', { day: '2026-10-21', program: to(program) }), null, await space(), { field: 'program' });
    expect(ran.after.changes.map((c) => ('values' in c ? `${c.values.name} ${c.values.set}` : '')).sort()).toEqual(['Chest press 1', 'Chest press 2', 'Chest press 3', 'Walk 1']);
    const schema = parseSchema(await (await gymApp({ sets: true })).fs.readText('Gym/Workouts/_collection.json'));
    expect(JSON.stringify(schema.layout)).toContain('"group":["part","exercise"]');
  });

  it('brings a program’s days to Today and Upcoming, a day closed by its workout, one not gone to too', async () => {
    const { add, to, program, space } = await gymApp({});
    await add('Workouts', { name: 'Full body · Mon', day: '2026-10-19', program: to(program), status: 'Done' });
    await add('Workouts', { name: 'Full body · Wed', day: '2026-10-14', program: to(program), status: "Didn't go" });
    const s = await space();
    const due = dueRecords(s.collections, '2026-10-21', { until: '2026-10-23' });
    expect(due.map((d) => [d.day, d.late ?? false])).toEqual([
      ['2026-10-12', true],
      ['2026-10-16', true],
      ['2026-10-21', false],
      ['2026-10-23', false],
    ]);
    expect(due[0]!.view.calendar!.repeat).toMatchObject({ start: 'Start', skip: { label: "Didn't go", set: { status: "Didn't go" } } });
    // Its calendar shows every day of a week: gone to, not gone to, gone by unwritten, to come.
    const programs = s.collections.find((c) => c.dir === 'Gym/Programs')!;
    const view = programs.schema.views!.find((v) => v.kind === 'calendar')!;
    const days = repeatCalendar(programs, view, '2026-10-21', '2026-10-12', '2026-10-23', s.collections);
    expect(days.map((d) => [d.day, d.state, d.closedBy ? 'by' : ''])).toEqual([
      ['2026-10-12', 'late', ''],
      ['2026-10-14', 'skipped', 'by'],
      ['2026-10-16', 'late', ''],
      ['2026-10-19', 'done', 'by'],
      ['2026-10-21', 'open', ''],
      ['2026-10-23', 'open', ''],
    ]);
    // Without program days, nothing comes.
    const off = await gymApp({ days: false });
    expect(dueRecords((await off.space()).collections, '2026-10-21')).toEqual([]);
  });

  it('says how regular each move is in the last 4 weeks, and marks one done in less than 7 of 10', async () => {
    const { add, to, chest, program, space, load } = await gymApp({});
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
    for (const [n, done] of [[12, true], [14, false], [16, false], [19, true]] as const) {
      const w = await add('Workouts', { name: `W ${n}`, day: day(n), program: to(program), status: 'Done' });
      await add('Workout items', { name: 'Chest press', workout: to(w), exercise: to(chest), part: 'Workout', done, sets: 3, reps: 12, kg: 40 + n, day: day(n) });
    }
    const s = await space();
    const computer = new Computer(s.collections, {}, '2026-10-21');
    const exercises = await load('Exercises');
    const press = exercises.records.find((r) => r.name === 'Chest press')!;
    const values = computer.values('Gym/Exercises', press);
    expect([values.best_kg, values.last_done, values.last_4_weeks, values.regular]).toEqual([59, '2026-10-19', '2 of 4', 0.5]);
    expect(computer.checks('Gym/Exercises', press).map((p) => p.message)).toEqual(['Done in 2 of 4 of its workouts in the last 4 weeks']);
  });

  it('names its workouts Gym workouts beside Sport and training, sharing Exercises', () => {
    const plan = planApp({ name: 'Me', templates: [{ id: 'sport' }, { id: 'gym' }] }, { ids });
    const made = plan.created.map((c) => c.path);
    expect(made).toEqual(expect.arrayContaining(['Me/Workouts', 'Me/Exercises', 'Me/Gym workouts', 'Me/Workout items', 'Me/Programs']));
    expect(made.filter((p) => p === 'Me/Exercises')).toHaveLength(1);
  });
});
