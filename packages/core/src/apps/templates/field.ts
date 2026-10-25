import type { MessageKey } from '@scrawlnotes/i18n';
import type { View } from '../../collection';
import { calendar, codeField, currencyField, day, dayAndTime, formula, link, multi, nameField, number, rollup, select, text } from '../pieces';
import { byDueDay, companies, people, products } from '../shared';
import type { AppTemplate } from '../types';
import { customerRole, lineFormat } from './sales';
import { movement } from './stock';

// Field service and work orders (design/more-apps.md 3.6): lifts, air conditioning, appliances,
// plumbing, maintenance firms. The equipment at each customer's site, the jobs on it, who goes
// when, the parts used and what was done. Done plans the next service of a unit serviced
// regularly; with Stock the parts go out of stock; Invoice writes an order with Sales, else a
// payment with Budget.

const JOBS = ['repair', 'maintenance', 'installation', 'inspection'];
const JOB_NAMES: { [job: string]: string } = { repair: 'Repair', maintenance: 'Maintenance', installation: 'Installation', inspection: 'Inspection' };
const JOB_COLORS = { Repair: 'red', Maintenance: 'blue', Installation: 'green', Inspection: 'purple' } as const;
const STATUSES = ['Open', 'Scheduled', 'In progress', 'Done', 'Cancelled'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** How often a unit is serviced, and the days to the next time. */
const EVERY: [string, number][] = [
  ['Monthly', 30],
  ['Every 3 months', 91],
  ['Every 6 months', 182],
  ['Yearly', 365],
];

export const field: AppTemplate = {
  id: 'field',
  version: 1,
  group: 'customers',
  name: 'apps.field.name',
  short: 'apps.field.short',
  icon: 'pen',
  what: 'apps.field.what',
  questions: [
    {
      key: 'jobs',
      kind: 'multi',
      label: 'apps.field.jobs',
      options: JOBS.map((value) => ({ value, label: `apps.field.job.${value}` as MessageKey })),
      default: JOBS,
    },
    { key: 'technicians', kind: 'list', label: 'apps.field.technicians', default: [], help: 'apps.field.techniciansHelp', add: 'apps.field.addTechnician' },
    { key: 'contracts', kind: 'yesno', label: 'apps.field.contracts', default: true, help: 'apps.field.contractsHelp' },
    { key: 'stock', kind: 'yesno', label: 'apps.field.stock', default: true, when: ({ chosen }) => chosen.has('stock'), because: 'stock' },
    { key: 'invoice', kind: 'yesno', label: 'apps.field.invoice', default: true, help: 'apps.field.invoiceHelp', when: ({ chosen }) => chosen.has('sales') || chosen.has('budget') },
  ],
  money: () => true,
  pieces: (_answers, app) => [customerRole(app), 'products', 'equipment', 'work-orders', 'work-order-lines', 'technicians'],
  menu: ['work-orders', 'equipment', 'companies', 'people', 'technicians', 'products'],
  build(app, answers) {
    const jobs = ((answers.jobs as string[] | undefined) ?? JOBS).map((j) => JOB_NAMES[j]!).filter(Boolean);
    const regular = answers.contracts !== false;
    const fromStock = app.has('stock') && app.hasPiece('stock-movements') && answers.stock !== false;
    const toSales = app.has('sales') && app.hasPiece('orders') && answers.invoice !== false;
    const toBudget = !toSales && app.has('budget') && app.hasPiece('payments') && answers.invoice !== false;
    const customer = customerRole(app);
    const names = ((answers.technicians as string[] | undefined) ?? []).map((s) => s.trim()).filter(Boolean);
    const orders = app.path('work-orders');
    const called = app.called('work-orders');
    const lines = app.path('work-order-lines');
    const own = app.format(true);
    const line = lineFormat(app);
    companies(app);
    people(app);
    products(app);

    app.field('technicians', nameField());
    app.field('technicians', { key: 'phone', label: 'Phone', type: 'phone' });
    app.field('technicians', { key: 'from', label: 'Works from', type: 'time', default: '08:00' });
    app.field('technicians', { key: 'until', label: 'Works until', type: 'time', default: '17:00' });
    app.field('technicians', { ...multi('days', 'Days', DAYS), default: DAYS.slice(0, 5) });
    app.field('technicians', rollup('today', 'Today', orders, 'count', undefined, [{ field: 'start', op: 'on', value: 'today' }, { field: 'status', op: 'is-not', value: ['Cancelled'] }]));
    app.block('technicians', { block: 'linked', collection: orders, style: 'list', fields: ['start', 'status'], sort: 'start' });
    for (const name of names) app.record('technicians', { name, from: '08:00', until: '17:00', days: DAYS.slice(0, 5) });

    app.field('equipment', nameField());
    app.field('equipment', link('customer', 'Customer', app.path(customer)));
    app.field('equipment', text('address', 'Address'));
    app.field('equipment', text('type', 'Type'));
    app.field('equipment', text('model', 'Brand and model'));
    app.field('equipment', text('serial', 'Serial no'));
    app.field('equipment', day('installed', 'Installed'));
    if (regular) {
      app.field('equipment', select('interval', 'Serviced', EVERY.map(([e]) => e)));
      app.field('equipment', day('next_service', 'Next service'));
      app.view('equipment', { ...calendar({ start: 'next_service', color: 'customer', upcoming: false }), name: 'Next service' });
      app.rule('equipment', { kind: 'check', name: 'Service due', src: 'check("next_service", () => empty(next_service) || next_service >= today(), "Service due")' });
    }
    app.field('equipment', rollup('last_job', 'Last job', orders, 'max', 'start', [{ field: 'status', op: 'is', value: ['Done'] }]));
    app.block('equipment', { block: 'linked', collection: orders, sort: 'start', style: 'timeline' });
    app.block(customer, { block: 'linked', collection: app.path('equipment'), style: 'list', fields: ['type', ...(regular ? ['next_service'] : [])] });

    app.field('work-orders', codeField('WO-'));
    app.field('work-orders', nameField('Title'));
    app.field('work-orders', link('customer', 'Customer', app.path(customer)));
    app.field('work-orders', link('equipment', 'Equipment', app.path('equipment')));
    if (jobs.length > 0) app.field('work-orders', select('type', 'Type', jobs, JOB_COLORS, jobs[0]));
    app.field('work-orders', link('technician', 'Technician', app.path('technicians')));
    app.field('work-orders', dayAndTime('start', 'Start'));
    app.field('work-orders', number('duration', 'Duration', { format: { style: 'duration' }, default: 60 }));
    app.field('work-orders', formula('ends', 'Ends', 'start + minutes(duration)'));
    app.field('work-orders', select('status', 'Status', STATUSES, { Open: 'gray', Scheduled: 'blue', 'In progress': 'orange', Done: 'green', Cancelled: 'red' }, 'Open'));
    app.field('work-orders', number('hours', 'Labour hours'));
    app.field('work-orders', text('work_done', 'What was done'));
    if (app.money.multi) app.field('work-orders', currencyField(app));
    app.field('work-orders', number('price', 'Labour', { format: own }));
    app.field('work-orders', rollup('parts', 'Parts', lines, 'sum', 'amount', undefined, own));
    app.field('work-orders', formula('total', 'Total', 'price + parts', own));
    app.block('work-orders', { block: 'linked', collection: lines, style: 'table', fields: ['product', 'quantity', 'unit_price', 'amount'], sums: true });
    app.block(customer, { block: 'linked', collection: orders, style: 'list', fields: ['start', 'status'], sort: 'start' });
    // The jobs by who goes, in Today and Upcoming; each technician's own beside it.
    app.view('work-orders', calendar({ start: 'start', duration: 'duration', color: 'technician', upcoming: true }, [{ field: 'status', op: 'is-not', value: ['Cancelled'] }]));
    names.forEach((name, i) => {
      const view: View = { id: `technician-${i + 1}`, name, kind: 'calendar', calendar: { start: 'start', duration: 'duration', color: 'status', upcoming: false }, conditions: [{ field: 'technician', op: 'is', value: [name] }] };
      app.view('work-orders', view);
    });

    app.field('work-order-lines', nameField('Item'));
    app.field('work-order-lines', link('work_order', 'Work order', orders));
    app.field('work-order-lines', link('product', 'Part', app.path('products')));
    app.field('work-order-lines', number('quantity', 'Quantity', { default: 1 }));
    app.field('work-order-lines', number('unit_price', 'Unit price', { format: line }));
    app.field('work-order-lines', formula('amount', 'Amount', 'quantity * unit_price', line));
    app.rule('work-order-lines', {
      kind: 'onSave',
      name: 'From the part',
      src: `onSave("From the part", () => {
  if (!empty(product)) {
    if (empty(name)) name = product.name
    if (empty(unit_price)) unit_price = product.price
  }
})`,
    });

    app.rule('work-orders', {
      kind: 'onSave',
      name: 'From the equipment',
      src: `onSave("From the equipment", () => {
  if (!empty(equipment) && empty(customer)) customer = equipment.customer
  if (empty(name)) name = ${jobs.length > 0 ? 'type + " · " + ' : ''}(empty(equipment) ? (empty(customer) ? "Job" : customer.name) : equipment.name)
})`,
    });
    const clash = `find("${called}", { technician: technician }).find((w) => w != this && w.status != "Cancelled" && w.start < ends && w.ends > start)`;
    app.rule('work-orders', { kind: 'check', name: 'Overlaps with', src: `check("start", () => status == "Cancelled" || empty(technician) || empty(start) || empty(ends) || empty(${clash}), \`Overlaps with \${${clash}.name}\`)` });
    const open = 'status == "Open" || status == "Scheduled"';
    app.rule('work-orders', {
      kind: 'action',
      name: 'Schedule',
      src: `action("Schedule", {
  when: () => ${open},
  hint: "Only an open or a scheduled one",
  ask: {
    technician: { label: "Technician", type: "link", collection: "${app.called('technicians')}", default: () => technician, required: true },
    start: { label: "When", type: "date", time: true, default: () => start, required: true },
  },
}, () => {
  technician = input.technician
  start = input.start
  status = "Scheduled"
})`,
    });
    app.rule('work-orders', { kind: 'action', name: 'Start', src: 'action("Start", { when: () => status == "Scheduled", hint: "Only a scheduled one" }, () => {\n  status = "In progress"\n})' });
    const next = regular
      ? `
  if (type == "Maintenance" && !empty(equipment) && !empty(equipment.interval)) {
    update(equipment, { next_service: today() + (${EVERY.map(([e, d]) => `equipment.interval == "${e}" ? ${d}`).join(' : ')} : 365) })
  }`
      : '';
    app.rule('work-orders', {
      kind: 'action',
      name: 'Done',
      src: `action("Done", {
  when: () => status == "Scheduled" || status == "In progress",
  hint: "Only a scheduled one, or one in progress",
  ask: {
    work_done: { label: "What was done", type: "text", required: true },
    hours: { label: "Labour hours", type: "number", default: () => hours },
  },
}, () => {
  work_done = input.work_done
  hours = input.hours
  status = "Done"${regular && jobs.includes('Maintenance') ? next : ''}
})`,
    });

    if (fromStock) {
      const places = app.hasPiece('locations') && app.hasPiece('stock-levels');
      app.field('stock-movements', link('work_order', 'Work order', orders));
      app.rule('work-orders', {
        kind: 'onSave',
        name: 'Parts out',
        src: `onSave("Parts out", () => {
  if (status == "Done" && old.status != "Done") {
    for (const line of linked("${app.called('work-order-lines')}")) {
      if (!empty(line.product)) {
${places ? `        const location = find("${app.called('locations')}", { is_default: true })[0]\n` : ''}${movement(app, '        ', 'product: line.product, direction: "Out", type: "use", quantity: line.quantity', 'line.product', places ? 'location' : null)}
      }
    }
  }
  if (status != "Done" && old.status == "Done") {
    for (const m of linked("${app.called('stock-movements')}")) {
      remove(m)
    }
  }
})`,
      });
    }
    if (toSales) {
      const sold = app.called('orders');
      const soldLines = app.called('order-lines');
      app.field('work-orders', link('order', 'Order', app.path('orders')));
      app.rule('work-orders', {
        kind: 'action',
        name: 'Invoice',
        src: `action("Invoice", { when: () => status == "Done" && empty(order), hint: "Only a done one, not invoiced yet" }, () => {
  const made = add("${sold}", { customer: customer, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: today() + 30' : ''} })
  if (price > 0) add("${soldLines}", { order: made, name: "Labour · " + name, quantity: 1, unit_price: price })
  for (const l of linked("${app.called('work-order-lines')}")) {
    add("${soldLines}", { order: made, name: l.name, quantity: l.quantity, unit_price: l.unit_price })
  }
  order = made
})`,
      });
    }
    if (toBudget) {
      const pay = app.called('payments');
      app.record('budget-lines', { name: 'Field service', type: 'Income' });
      app.field('payments', link('work_order', 'Work order', orders));
      app.field('work-orders', rollup('invoiced', 'Invoiced', app.path('payments'), 'count'));
      app.rule('work-orders', {
        kind: 'action',
        name: 'Invoice',
        src: `action("Invoice", { when: () => status == "Done" && invoiced == 0, hint: "Only a done one, not invoiced yet" }, () => {
  add("${pay}", { name: code + " · " + name, direction: "In", amount: total, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: today() + 30' : ''}, budget_line: find("${app.called('budget-lines')}", { name: "Field service" })[0] })
})`,
      });
    }

    app.about({
      title: 'Field service',
      what: `The equipment you look after at your customers' sites, the jobs on it${jobs.length > 0 ? ` (${jobs.map((j) => j.toLowerCase()).join(', ')})` : ''}, who goes when, the parts used and what was done.`,
      pieces: ['equipment', 'work-orders', 'work-order-lines', 'technicians', 'products'],
      glance: [
        'The jobs by technician, in Today and Upcoming',
        'Two jobs of a technician at once are marked',
        'Schedule, Start and Done on each job',
        ...(regular ? ['A service done plans the next', 'A unit past its service is marked'] : []),
        ...(fromStock ? ['The parts used go out of stock'] : []),
        ...(toSales || toBudget ? ['Invoice writes what to collect'] : []),
      ],
      how: [
        `Add each unit at a customer's site: where it is, what it is${regular ? ', and how often it is serviced' : ''}.`,
        'Add a work order for each job, for a unit or a customer; press Schedule to pick the technician and the time.',
        'The technician presses Start on the way, and Done when it is over, writing what was done and the hours; the service report and photos go in its notes.',
        'Add the parts used as lines on its screen; write the price of the labour.',
        ...(toSales || toBudget ? ['Press Invoice when it is done.'] : []),
      ],
      auto: [
        'A work order for a unit takes its customer from it, and its name from its type and the unit.',
        'A part takes its price from its product.',
        'Two jobs of the same technician at the same time are marked; they are kept.',
        ...(regular && jobs.includes('Maintenance') ? ['When maintenance is done and the unit says how often it is serviced, its next service is planned that much later; a unit past its next service is marked.'] : []),
        ...(fromStock ? ['When a job is Done, its parts go out of stock; taken back, they come back.'] : []),
        ...(toSales ? [`Invoice adds an Invoiced order in ${app.called('orders')} with the labour and the parts.`] : []),
        ...(toBudget ? [`Invoice adds a payment of its total to ${app.called('payments')}, under the Field service budget line.`] : []),
      ],
      work: ['How a call for a job comes in, and who takes it.', 'Who decides which technician goes.', 'What goes in a service report.'],
    });
  },
};
