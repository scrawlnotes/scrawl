import type { Condition } from '../../collection';
import { calendar, codeField, day, formula, link, nameField, number, person, rollup, select, symbolOf, text } from '../pieces';
import { locations } from '../shared';
import type { AppTemplate } from '../types';

// Assets and maintenance (design/scrawl-apps.md 3.9), as Snipe-IT and Asset Panda keep them: who
// has each and until when, what it is worth today, its warranty and its next service. Check out
// gives it to a person or a place with a day to come back, Check in asks how it came back; a day to
// come back, a service and a warranty ending come to Today and Upcoming. Its history, each check
// out and in, repair and service, is one list on its window; a repair's cost goes to the budget.

const CATEGORIES = ['Computers', 'Phones', 'Furniture', 'Vehicles', 'Machines', 'Other'];
const PLACES = ['Head office', 'Warehouse'];
/** How long each kind of asset lasts, in years: its value falls evenly over them. */
const LIFE: { [category: string]: number } = { Computers: 3, Phones: 3, Furniture: 7, Vehicles: 5, Machines: 10 };
const KINDS = ['Checked out', 'Checked in', 'Repair', 'Service', 'Inspection'];

/** How often an asset is serviced, and the days to the next time. */
const EVERY: [string, number][] = [
  ['Monthly', 30],
  ['Every 3 months', 91],
  ['Every 6 months', 182],
  ['Yearly', 365],
];

/** A day as an asset says it: "Nov 20". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;

export const assets: AppTemplate = {
  id: 'assets',
  version: 2,
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
  menu: [{ role: 'assets', view: 'in-use', name: 'Assets' }, 'maintenance', 'locations'],
  build(app, answers) {
    const categories = (answers.categories as string[] | undefined) ?? CATEGORIES;
    const assign = answers.assign !== false;
    const service = answers.service !== false;
    const places = answers.places === true;
    const costs = app.has('budget') && app.hasPiece('payments') && answers.costs !== false;
    const main = app.format(false);
    const log = app.path('maintenance');
    const jobs = app.called('maintenance');
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    const statuses = [...(assign ? ['In use'] : []), 'Available', 'In repair', 'Retired'];

    app.field('assets', codeField('AST-'));
    app.field('assets', nameField());
    if (categories.length > 0) app.field('assets', { ...select('category', 'Category', categories), chips: true });
    app.field('assets', text('serial', 'Serial no'));
    app.field('assets', select('status', 'Status', statuses, { 'In use': 'green', Available: 'blue', 'In repair': 'orange', Retired: 'gray' }, 'Available'));
    if (assign) {
      app.field('assets', person('holder', 'With'));
      app.field('assets', { ...day('due_back', 'Due back'), when: [{ field: 'status', op: 'is', value: ['In use'] }] });
    }
    app.field('assets', { ...day('since', 'Since'), help: 'When it was given out or sent to repair' });
    if (places) app.field('assets', link('location', 'Location', app.path('locations')));
    const supplier = app.hasPiece('companies');
    app.field('assets', supplier ? link('supplier', 'Supplier', app.path('companies')) : { ...text('supplier', 'Supplier'), suggest: true });
    app.field('assets', day('bought', 'Bought'));
    app.field('assets', number('cost', 'Cost', { format: main }));
    app.field('assets', { ...number('life', 'Lasts (years)'), help: "Its value falls evenly over these years; left empty, its category's" });
    app.field('assets', day('warranty', 'Warranty until'));
    if (service) {
      app.field('assets', select('interval', 'Serviced', EVERY.map(([e]) => e)));
      app.field('assets', { ...day('next_service', 'Next service'), when: [{ field: 'interval', op: 'not-empty' }] });
    }
    // What it is worth today, falling evenly over its life from what it cost.
    app.field('assets', formula('value', 'Value', 'empty(cost) ? 0 : empty(bought) || empty(life) || life <= 0 ? cost : max(0, round(cost * (1 - (today() - bought) / (life * 365)), 2))', main));
    app.field('assets', formula('in_warranty', 'Under warranty', '!empty(warranty) && warranty >= today()'));
    app.field('assets', formula('warranty_soon', 'Warranty ending', 'in_warranty && warranty <= today() + 30'));
    app.field('assets', rollup('maintenance_cost', 'Repairs and service', log, 'sum', 'cost', [{ field: 'status', op: 'is', value: ['Done'] }], main));
    if (assign) app.field('assets', formula('late_back', 'Late back', 'status == "In use" && !empty(due_back) && due_back < today()'));
    app.field('assets', formula('with_said', 'With', `${assign ? 'empty(holder) ? ' : ''}${places ? '(empty(location) ? "" : location.name)' : '""'}${assign ? ' : holder' : ''}`));
    app.field(
      'assets',
      formula(
        'state',
        'Says',
        `${assign ? `status == "In use" && !empty(due_back) ? "Due back " + ${short('due_back')} : ` : ''}status == "In repair" && !empty(since) ? "since " + ${short('since')} : ""`,
      ),
    );
    // Its window's line: "In use · Ayşe Kaya since Mar 4 · due back Nov 20 · $1,240 now ($1,800 bought) · under warranty".
    app.field(
      'assets',
      formula(
        'said',
        'Says',
        `status${assign ? ' + (status == "In use" && !empty(holder) ? " · " + holder + (empty(since) ? "" : " since " + ' + short('since') + ') : "")' : ''}${assign ? ` + (status == "In use" && !empty(due_back) ? " · due back " + ${short('due_back')} : "")` : ''} + (empty(cost) ? "" : " · " + ${money('value')} + " now (" + ${money('cost')} + " bought)") + (in_warranty ? " · under warranty" : "")`,
      ),
    );
    app.head('assets', 'said', 'status');
    app.formOrder('assets', [...(categories.length > 0 ? ['category'] : []), 'serial', 'bought', 'cost', 'supplier', 'warranty', 'life', ...(service ? ['interval', 'next_service'] : [])]);
    app.newForm('assets', [...(categories.length > 0 ? ['category'] : []), 'serial', 'bought', 'cost', 'supplier', 'warranty', ...(service ? ['interval'] : [])]);
    app.block('assets', { block: 'actions', column: 1 });
    app.block('assets', { block: 'linked', collection: log, style: 'timeline', title: 'History', sort: 'date', fixed: true, column: 2 });
    if (places) {
      locations(app);
      const stock = app.has('stock') && app.answers('stock').locations === true ? ((app.answers('stock').locationList as string[] | undefined) ?? []) : [];
      const there = new Set(stock.map((p) => p.toLowerCase()));
      for (const name of (answers.placeList as string[] | undefined) ?? PLACES) if (!there.has(name.toLowerCase())) app.record('locations', { name });
      app.block('locations', { block: 'linked', collection: app.path('assets'), style: 'list', title: 'Assets', fields: ['status'] });
    }
    if (supplier) app.block('companies', { block: 'linked', collection: app.path('assets'), style: 'list', title: 'Assets', fields: ['status'], column: 3 });

    // Each thing that happens to it is a line of its history.
    const write = (kind: string, said: string, extra = '') => `add("${jobs}", { name: ${said}, asset: this, type: "${kind}", status: "Done", date: today()${extra} })`;
    app.rule('assets', {
      kind: 'onSave',
      name: 'Its life',
      src: `onSave("Its life", () => {${assign ? '\n  if (empty(old.status) && status == "In use" && empty(holder)) status = "Available"' : ''}${categories.length > 0 ? `
  if (empty(life) && !empty(category)) life = ${Object.entries(LIFE).map(([c, y]) => `category == "${c}" ? ${y}`).join(' : ')} : null` : ''}${service ? `
  if (!empty(interval) && empty(next_service)) next_service = (empty(bought) ? today() : bought) + (${EVERY.map(([e, d]) => `interval == "${e}" ? ${d}`).join(' : ')} : 365)` : ''}
})`,
    });
    if (assign) {
      app.rule('assets', {
        kind: 'action',
        name: 'Check out',
        src: `action("Check out", {
  when: () => status == "Available",
  hint: "",
  ask: {
    to: { label: "To", type: "person", note: () => "${places ? 'Or a place below.' : ''}" },${places ? `\n    place: { label: "Or a place", type: "link", collection: "${app.called('locations')}" },` : ''}
    back: { label: "Due back", type: "date", note: () => "Left empty, it has no day to come back." },
    note: { label: "Note", type: "text" },
  },
  done: () => name + " · checked out",
}, () => {
  holder = input.to${places ? '\n  if (!empty(input.place)) location = input.place' : ''}
  due_back = input.back
  since = today()
  status = "In use"
  ${write('Checked out', `"Checked out to " + (empty(input.to) ? ${places ? '(empty(input.place) ? "" : input.place.name)' : '""'} : input.to)`, ', note: (empty(input.back) ? "no day to return" : "due back " + ' + short('input.back') + ') + (empty(input.note) ? "" : " · " + input.note)')}
})`,
      });
      app.rule('assets', {
        kind: 'action',
        name: 'Check in',
        src: `action("Check in", {
  when: () => status == "In use",
  hint: "",
  ask: {
    came: { label: "How it came back", type: "choice", options: ["Good", "Damaged", "Needs repair"], chips: true, default: "Good", note: () => "Needs repair sends it to In repair." },${places ? `\n    place: { label: "Put in", type: "link", collection: "${app.called('locations')}", default: () => location },` : ''}
    note: { label: "Note", type: "text" },
  },
  done: () => name + " · checked in",
}, () => {
  ${write('Checked in', '"Checked in from " + (empty(holder) ? "" : holder)', ', note: input.came + (empty(input.note) ? "" : " · " + input.note)')}
  holder = null
  due_back = null${places ? '\n  if (!empty(input.place)) location = input.place' : ''}
  status = input.came == "Needs repair" ? "In repair" : "Available"
  since = today()
})`,
      });
      app.rule('assets', { kind: 'check', name: 'A retired asset is with nobody', src: 'check("holder", () => status != "Retired" || empty(holder), "A retired asset is with nobody")' });
    }
    app.rule('assets', {
      kind: 'action',
      name: 'Send to repair',
      src: `action("Send to repair", {
  when: () => status != "In repair" && status != "Retired",
  hint: "",
  ask: { what: { label: "What is wrong", type: "text" } },
  done: () => name + " · in repair",
}, () => {
  add("${jobs}", { name: empty(input.what) ? "Repair" : "Repair · " + input.what, asset: this, type: "Repair", status: "Planned", date: today() })${assign ? '\n  holder = null\n  due_back = null' : ''}
  status = "In repair"
  since = today()
})`,
    });
    app.rule('assets', {
      kind: 'action',
      name: 'Back from repair',
      src: `action("Back from repair", {
  when: () => status == "In repair",
  hint: "",
  ask: {
    cost: { label: "Cost", type: "number" },
    note: { label: "What was done", type: "text" },
  },
  done: () => name + " · back from repair",
}, () => {
  const open = linked("${jobs}").filter((m) => m.type == "Repair" && m.status == "Planned")[0]
  if (empty(open)) ${write('Repair', '"Repair"', ', cost: input.cost, note: input.note')}
  else update(open, { status: "Done", date: today(), cost: input.cost, note: input.note })
  status = "Available"
  since = today()
})`,
    });
    if (service) {
      app.rule('assets', {
        kind: 'action',
        name: 'Service done',
        src: `action("Service done", {
  when: () => status != "Retired" && !empty(interval),
  hint: "",
  ask: {
    cost: { label: "Cost", type: "number" },
    note: { label: "What was done", type: "text" },
  },
  done: () => name + " · serviced, next " + ${short('next_service')},
}, () => {
  ${write('Service', '"Service"', ', cost: input.cost, note: input.note')}
  next_service = today() + (${EVERY.map(([e, d]) => `interval == "${e}" ? ${d}`).join(' : ')} : 365)
})`,
      });
    }
    app.rule('assets', {
      kind: 'action',
      name: 'Retire',
      src: `action("Retire", { when: () => status != "Retired", hint: "", confirm: true, done: () => name + " · retired" }, () => {
  status = "Retired"${assign ? '\n  holder = null\n  due_back = null' : ''}
})`,
    });

    // The tabs, Snipe-IT's: in use, available, in repair, due back, one's own, retired; over them how many, what they are worth, what is late and what warranty ends.
    const notRetired: Condition = { field: 'status', op: 'is-not', value: ['Retired'] };
    const sums = [
      { label: 'assets', one: 'asset', conditions: [notRetired] },
      { label: 'value', field: 'value', conditions: [notRetired] },
      ...(assign ? [{ label: 'due back', one: 'due back', conditions: [{ field: 'late_back', op: 'true' as const }], warn: true as const }] : []),
      { label: 'warranty ending', conditions: [{ field: 'warranty_soon', op: 'true' as const }] },
    ];
    const columns = ['name', ...(categories.length > 0 ? ['category'] : []), 'with_said', 'status', 'state', 'value'];
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('assets', { id, name, conditions, sort: { key: 'name', dir: 'asc' }, columns, sums, set: 'assets' }, id === (assign ? 'in-use' : 'available'));
    if (assign) tab('in-use', 'In use', [{ field: 'status', op: 'is', value: ['In use'] }]);
    tab('available', 'Available', [{ field: 'status', op: 'is', value: ['Available'] }]);
    tab('in-repair', 'In repair', [{ field: 'status', op: 'is', value: ['In repair'] }]);
    if (assign) {
      tab('due-back', 'Due back', [{ field: 'status', op: 'is', value: ['In use'] }, { field: 'due_back', op: 'not-empty' }]);
      tab('with-me', 'With me', [{ field: 'holder', op: 'is', value: ['me'] }]);
    }
    tab('retired', 'Retired', [{ field: 'status', op: 'is', value: ['Retired'] }]);
    // In Today on their day: coming back with Check in, a service with Service done; a warranty ending in Upcoming.
    if (assign) app.view('assets', { ...calendar({ start: 'due_back', color: 'category', upcoming: true, button: 'Check in', words: ['holder'] }, [{ field: 'status', op: 'is', value: ['In use'] }]), id: 'back', name: 'Coming back', hidden: true });
    if (service) app.view('assets', { ...calendar({ start: 'next_service', color: 'category', upcoming: true, button: 'Service done', words: ['interval'] }, [notRetired]), id: 'service', name: 'Service due', hidden: true });
    app.view('assets', { ...calendar({ start: 'warranty', color: 'category', upcoming: true, words: ['supplier'] }, [notRetired]), id: 'warranty', name: 'Warranty ends', hidden: true });
    app.view('assets', { id: 'all', name: 'All', conditions: [notRetired], sort: { key: 'value', dir: 'desc' }, hidden: true });
    app.view('assets', { id: 'coming', name: 'Coming up', conditions: [notRetired, ...(service ? [{ field: 'next_service', op: 'not-empty' as const }] : [{ field: 'warranty_soon', op: 'true' as const }])], sort: { key: service ? 'next_service' : 'warranty', dir: 'asc' }, hidden: true });
    app.homeTile('assets', { off: true });
    app.homeTiles('assets', [
      { view: 'all', title: 'Value', head: [{ label: 'now', field: 'value' }, { label: 'bought', field: 'cost' }], lines: [{ label: 'Most of it', field: 'value', by: 'category' }, { label: 'Repairs and service', field: 'maintenance_cost' }] },
      ...(assign ? [{ view: 'due-back', title: 'Due back', head: [{ label: 'late', conditions: [{ field: 'late_back', op: 'true' as const }], warn: true as const }], value: 'state', sub: 'holder', empty: 'Nothing is out with a day to come back.' }] : []),
      { view: 'coming', title: 'Coming up', value: service ? 'next_service' : 'warranty', empty: 'No service or warranty is coming up.' },
    ]);

    app.field('maintenance', nameField('What'));
    app.field('maintenance', link('asset', 'Asset', app.path('assets')));
    app.field('maintenance', select('type', 'Type', KINDS, { 'Checked out': 'green', 'Checked in': 'blue', Repair: 'orange', Service: 'purple', Inspection: 'purple' }));
    app.field('maintenance', day('date', 'Day', true));
    app.field('maintenance', select('status', 'Status', ['Planned', 'Done'], { Planned: 'gray', Done: 'green' }, 'Done'));
    app.field('maintenance', text('by', 'Done by'));
    app.field('maintenance', number('cost', 'Cost', { format: main }));
    app.field('maintenance', text('note', 'Note'));
    app.view('maintenance', { id: 'repairs', name: 'Repairs and service', conditions: [{ field: 'type', op: 'is', value: ['Repair', 'Service', 'Inspection'] }], sort: { key: 'date', dir: 'desc' }, columns: ['asset', 'type', 'date', 'status', 'cost'] }, true);
    app.homeTile('maintenance', { off: true });
    if (costs) {
      const pay = app.called('payments');
      app.record('budget-lines', { name: 'Maintenance', type: 'Expense' });
      app.field('payments', link('maintenance', 'Maintenance', log));
      app.block('maintenance', { block: 'linked', collection: app.path('payments'), style: 'list', fields: ['status', 'paid_on'] });
      app.rule('maintenance', {
        kind: 'onSave',
        name: 'Maintenance cost',
        src: `onSave("Maintenance cost", () => {
  if (status == "Done" && (old.status != "Done" || empty(old.cost)) && cost > 0 && linked("${pay}").length == 0) {
    add("${pay}", { name: name + (empty(asset) ? "" : " · " + asset.name), direction: "Out", amount: cost, status: "Invoiced", budget_line: find("${app.called('budget-lines')}", { name: "Maintenance" })[0] })
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
      what: `What the company owns${assign ? ', who has it and until when' : ''}${placeNames.length > 0 ? ` and where it is: ${placeNames.join(', ')}` : ''}, what it is worth today, its warranty, its repairs and service.`,
      pieces: ['assets', 'maintenance', ...(places ? ['locations'] : [])],
      glance: [
        ...(assign ? ['Check out with a day to come back, Check in asks how it came back'] : []),
        'Its value today, falling over its life',
        'Its history: who had it, repairs and service',
        ...(assign ? ['A day to come back in Today with Check in'] : []),
        ...(service ? ['A service due in Today with Service done'] : []),
        ...(costs ? ['A repair or service with a cost adds its payment'] : []),
      ],
      how: [
        `Add each asset with its category${supplier ? ', its supplier' : ''}, what it cost and when, and its warranty${service ? '; say how often it is serviced' : ''}.`,
        ...(assign ? ['Press Check out when you give it to someone, with the day it comes back; Check in when it does.'] : []),
        'Press Send to repair when it breaks, Back from repair with what it cost.',
        ...(service ? ['Press Service done when it is serviced, in Today on its day.'] : []),
        'Press Retire when it is sold, thrown away or lost.',
      ],
      auto: [
        "Its value falls evenly from what it cost over the years it lasts, its category's when it says none.",
        ...(assign ? ['Check out writes who has it, since when and until when; Check in, how it came back, and Needs repair sends it to In repair.'] : []),
        'Each check out and in, repair and service is written in its history.',
        ...(service ? ['Service done plans the next service as often as it says.'] : []),
        'A warranty ending comes to Upcoming.',
        ...(costs ? ['A repair or service with a cost adds what is owed as a payment on the Maintenance budget line.'] : []),
      ],
      work: ['Who looks after the assets, and who may give them out.', 'How a broken asset is reported, and who repairs it.', ...(service ? ['When each kind of asset is serviced.'] : [])],
    });
  },
};
