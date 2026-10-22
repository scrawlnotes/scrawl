import { describe, expect, it } from 'vitest';
import { parseBoard } from '../board';
import { addRecord, type Collection, loadCollection, parseSchema } from '../collection';
import { Computer } from '../compute';
import { MemoryFs } from '../fs';
import { linksIn, resolveHref } from '../links';
import { APP_FILE, AppProblems, planApp } from './build';
import { installApp, undoApp } from './install';
import { TEMPLATES } from './questions';
import { findApp } from './roles';
import { type Answers, TEMPLATE_IDS, type TemplateId } from './types';

let n = 0;
const ids = () => `id${++n}`;

/** Every set of templates: 2047 of them, and the empty one left out. */
const sets = (): TemplateId[][] => {
  const out: TemplateId[][] = [];
  for (let mask = 1; mask < 1 << TEMPLATE_IDS.length; mask++) out.push(TEMPLATE_IDS.filter((_, i) => mask & (1 << i)));
  return out;
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
  product: { bugs: true, releases: true, phases: true, feedback: true },
  recruiting: { interviews: true, scores: true },
  assets: { assign: true, service: true, places: true, costs: true },
  content: { campaigns: true },
};
const LEAST: { [id in TemplateId]: Answers } = {
  crm: { customers: 'people', deals: false },
  sales: { sells: 'services', tax: false, discount: false, quotes: false },
  support: { channels: [], feedback: false, replies: false },
  appointments: { for: 'resources', by: 'me', resources: [], fee: false },
  projects: { for: 'internal', time: false, budget: false, steps: [] },
  budget: { periods: 'none', due: false, expenses: false, categories: [] },
  stock: { purchasing: false, locations: false, deduct: 'no' },
  product: { bugs: false, releases: false, phases: false, feedback: false },
  recruiting: { stages: [], sources: [], interviews: false, steps: [] },
  assets: { categories: [], assign: false, service: false, places: false, costs: false },
  content: { channels: [], stages: [], campaigns: false },
};

/** What a template asks of these, given only the questions it asks with this set. */
const given = (set: TemplateId[], all: { [id in TemplateId]: Answers }) =>
  set.map((id) => {
    const keys = TEMPLATES[id].questions.filter((q) => !q.when || q.when({ chosen: new Set(set), answers: all[id] })).map((q) => q.key);
    return { id, answers: Object.fromEntries(Object.entries(all[id]).filter(([k]) => keys.includes(k))) };
  });

describe('setting up an app', () => {
  it('makes a right app of every set of templates, with every answer turned on, off, and left as it is', () => {
    let made = 0;
    for (const set of sets()) {
      for (const answers of [MOST, LEAST, null]) {
        for (const currencies of [['TRY'], ['TRY', 'EUR']]) {
          const templates = answers ? given(set, answers) : set.map((id) => ({ id }));
          const plan = planApp({ name: 'Atlas', currencies, templates }, { ids });
          expect(plan.files.at(-1)!.path).toBe(`Atlas/${APP_FILE}`);
          made++;
        }
      }
    }
    expect(made).toBe(2047 * 6);
  }, 180_000);

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
