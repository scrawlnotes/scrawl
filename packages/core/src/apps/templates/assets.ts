import { calendar, codeField, day, formula, link, nameField, number, person, rollup, select, text } from '../pieces';
import { locations } from '../shared';
import type { AppTemplate } from '../types';

const CATEGORIES = ['Computers', 'Phones', 'Furniture', 'Vehicles', 'Machines', 'Other'];
const PLACES = ['Head office', 'Warehouse'];

/** How often an asset is serviced, and the days to the next time. */
const EVERY: [string, number][] = [
  ['Monthly', 30],
  ['Every 3 months', 91],
  ['Every 6 months', 182],
  ['Yearly', 365],
];

export const assets: AppTemplate = {
  id: 'assets',
  version: 1,
  group: 'money',
  name: 'apps.assets.name',
  short: 'apps.assets.short',
  icon: 'laptop',
  what: 'apps.assets.what',
  questions: [
    { key: 'categories', kind: 'list', label: 'apps.assets.categories', default: CATEGORIES, add: 'apps.assets.addCategory' },
    { key: 'assign', kind: 'yesno', label: 'apps.assets.assign', default: true },
    { key: 'service', kind: 'yesno', label: 'apps.assets.service', default: true, help: 'apps.assets.serviceHelp' },
    { key: 'places', kind: 'yesno', label: 'apps.assets.places', default: false },
    { key: 'placeList', kind: 'list', label: 'apps.assets.placeList', default: PLACES, when: ({ answers }) => answers.places === true, under: 'places', help: 'apps.assets.placeListHelp', add: 'apps.assets.addPlace' },
    { key: 'costs', kind: 'yesno', label: 'apps.assets.costs', default: true, when: ({ chosen }) => chosen.has('budget'), because: 'budget' },
  ],
  money: () => true,
  pieces: (answers) => ['assets', 'maintenance', ...(answers.places === true ? ['locations'] : [])],
  menu: ['assets', 'maintenance', 'locations'],
  build(app, answers) {
    const categories = (answers.categories as string[] | undefined) ?? CATEGORIES;
    const assign = answers.assign !== false;
    const service = answers.service !== false;
    const places = answers.places === true;
    const costs = app.has('budget') && app.hasPiece('payments') && answers.costs !== false;
    const main = app.format(false);
    const done = app.path('maintenance');
    const jobs = app.called('maintenance');

    app.field('assets', codeField('AST-'));
    app.field('assets', nameField());
    if (categories.length > 0) app.field('assets', select('category', 'Category', categories));
    app.field('assets', text('serial', 'Serial no'));
    app.field('assets', select('status', 'Status', ['In use', 'In storage', 'In repair', 'Retired'], { 'In use': 'green', 'In storage': 'gray', 'In repair': 'orange', Retired: 'red' }, assign ? 'In storage' : 'In use'));
    if (assign) app.field('assets', person('holder', 'With'));
    if (places) app.field('assets', link('location', 'Location', app.path('locations')));
    const supplier = app.hasPiece('companies');
    app.field('assets', supplier ? link('supplier', 'Supplier', app.path('companies')) : text('supplier', 'Supplier'));
    app.field('assets', day('bought', 'Bought'));
    app.field('assets', number('cost', 'Cost', { format: main }));
    app.field('assets', day('warranty', 'Warranty until'));
    app.field('assets', formula('in_warranty', 'Under warranty', '!empty(warranty) && warranty >= today()'));
    app.field('assets', rollup('maintenance_cost', 'Maintenance cost', done, 'sum', 'cost', [{ field: 'status', op: 'is', value: ['Done'] }], main));
    if (service) {
      app.field('assets', select('interval', 'Serviced', EVERY.map(([e]) => e)));
      app.field('assets', rollup('last_service', 'Last service', done, 'max', 'date', [{ field: 'status', op: 'is', value: ['Done'] }]));
      app.field('assets', rollup('next_service', 'Next service', done, 'min', 'date', [{ field: 'status', op: 'is', value: ['Planned'] }]));
      app.rule('assets', { kind: 'check', name: 'Maintenance due', src: 'check("next_service", () => empty(next_service) || next_service >= today(), "Maintenance due")' });
    }
    app.block('assets', { block: 'linked', collection: done, style: 'table', fields: ['date', 'type', 'status', 'cost'], sort: 'date', sums: true });
    if (places) {
      locations(app);
      const stock = app.has('stock') && app.answers('stock').locations === true ? ((app.answers('stock').locationList as string[] | undefined) ?? []) : [];
      const there = new Set(stock.map((p) => p.toLowerCase()));
      for (const name of (answers.placeList as string[] | undefined) ?? PLACES) if (!there.has(name.toLowerCase())) app.record('locations', { name });
      app.block('locations', { block: 'linked', collection: app.path('assets'), style: 'list', fields: ['status'] });
    }
    if (supplier) app.block('companies', { block: 'linked', collection: app.path('assets'), style: 'list', fields: ['status'] });

    app.rule('assets', {
      kind: 'action',
      name: 'Log maintenance',
      src: `action("Log maintenance", {
  ask: {
    type: { label: "Type", type: "choice", options: ["Planned", "Repair", "Inspection"], default: "${service ? 'Planned' : 'Repair'}", required: true },
    cost: { label: "Cost", type: "number" },
    note: { label: "What was done", type: "text" },
  },
}, () => {
  add("${jobs}", { name: !empty(input.note) ? input.note : input.type == "Planned" ? "Service of " + name : input.type + " of " + name, type: input.type, status: "Done", date: today(), cost: input.cost })
})`,
    });
    if (assign) {
      app.rule('assets', { kind: 'check', name: 'A retired asset is with nobody', src: 'check("holder", () => status != "Retired" || empty(holder), "A retired asset is with nobody")' });
      app.rule('assets', {
        kind: 'action',
        name: 'Assign',
        src: `action("Assign", {
  when: () => status != "Retired",
  hint: "A retired asset is with nobody",
  ask: { to: { label: "To", type: "person", required: true } },
}, () => {
  holder = input.to
  status = "In use"
})`,
      });
      app.rule('assets', {
        kind: 'action',
        name: 'Return',
        src: `action("Return", { when: () => !empty(holder), hint: "It is with nobody" }, () => {
  holder = null
  status = "In storage"
})`,
      });
    }
    app.rule('assets', {
      kind: 'action',
      name: 'Retire',
      src: `action("Retire", { when: () => status != "Retired", hint: "It is retired", confirm: true }, () => {
  status = "Retired"${assign ? '\n  holder = null' : ''}
})`,
    });

    app.field('maintenance', nameField('Title'));
    app.field('maintenance', link('asset', 'Asset', app.path('assets')));
    app.field('maintenance', select('type', 'Type', ['Planned', 'Repair', 'Inspection'], { Planned: 'blue', Repair: 'orange', Inspection: 'purple' }));
    app.field('maintenance', day('date', 'Date', true));
    app.field('maintenance', select('status', 'Status', ['Planned', 'Done'], { Planned: 'gray', Done: 'green' }, 'Planned'));
    app.view('maintenance', calendar({ start: 'date', color: 'type', upcoming: true }, [{ field: 'status', op: 'is', value: ['Planned'] }]));
    app.field('maintenance', text('by', 'Done by'));
    app.field('maintenance', number('cost', 'Cost', { format: main }));
    if (service) {
      app.rule('maintenance', {
        kind: 'onSave',
        name: 'Next service',
        src: `onSave("Next service", () => {
  if (status == "Done" && old.status != "Done" && type == "Planned" && !empty(asset) && !empty(asset.interval)) {
    const days = ${EVERY.map(([e, d]) => `asset.interval == "${e}" ? ${d}`).join(' : ')} : 365
    if (find("${jobs}", { asset: asset, status: "Planned" }).length == 0) {
      add("${jobs}", { name: "Service of " + asset.name, asset: asset, type: "Planned", status: "Planned", date: date + days })
    }
  }
})`,
      });
    }
    if (costs) {
      const pay = app.called('payments');
      app.record('budget-lines', { name: 'Maintenance', type: 'Expense' });
      app.field('payments', link('maintenance', 'Maintenance', done));
      app.block('maintenance', { block: 'linked', collection: app.path('payments'), style: 'list', fields: ['status', 'paid_on'] });
      app.rule('maintenance', {
        kind: 'onSave',
        name: 'Maintenance cost',
        src: `onSave("Maintenance cost", () => {
  if (status == "Done" && old.status != "Done" && cost > 0 && linked("${pay}").length == 0) {
    add("${pay}", { name: name, direction: "Out", amount: cost, status: "Invoiced", budget_line: find("${app.called('budget-lines')}", { name: "Maintenance" })[0] })
  }
  if (status != "Done" && old.status == "Done") {
    for (const p of linked("${pay}")) {
      if (p.status != "Paid") remove(p)
    }
  }
})`,
      });
    }

    const placeNames = places ? ((answers.placeList as string[] | undefined) ?? PLACES) : [];
    app.about({
      title: 'Assets and maintenance',
      what: `What the company owns${assign ? ', who has it' : ''}${placeNames.length > 0 ? ` and where it is: ${placeNames.join(', ')}` : ''}, its maintenance and what it costs.`,
      pieces: ['assets', 'maintenance', ...(places ? ['locations'] : [])],
      glance: [...(assign ? ['Assign and Return say who has it'] : []), ...(service ? ['A service done plans the next', 'Maintenance due is marked'] : []), ...(costs ? ['Maintenance done adds its payment'] : [])],
      how: [
        `Add each asset with its category${supplier ? ', its supplier' : ''}, its cost and its warranty${service ? ', and how often it is serviced' : ''}.`,
        ...(assign ? ['Press Assign when you give it to someone, Return when it comes back.'] : []),
        'Press Log maintenance when it is serviced, repaired or checked, with what it cost.',
        'Press Retire when it is sold, thrown away or lost.',
      ],
      auto: [
        'Log maintenance adds a maintenance done today; an asset adds up what its maintenance cost.',
        'An asset is under warranty until the day its warranty ends.',
        ...(assign ? ['Assign asks who gets it and makes it In use; Return makes it In storage. A retired asset with someone is marked.'] : []),
        ...(service ? ['When a planned service is done and the asset says how often, the next one is planned that much later; an asset whose next service has passed is marked Maintenance due.'] : []),
        'Retire makes it Retired; it asks first.',
        ...(costs ? ['When maintenance with a cost is done, what is owed for it is added as a payment on the Maintenance budget line; taken back, the unpaid payment is taken away.'] : []),
      ],
      work: ['Who looks after the assets, and who may give them out.', 'How a broken asset is reported, and who repairs it.', ...(service ? ['When each kind of asset is serviced.'] : [])],
    });
  },
};
