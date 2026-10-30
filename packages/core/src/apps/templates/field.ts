import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition, View } from '../../collection';
import { calendar, checkbox, codeField, currencyField, day, dayAndTime, formula, link, multi, nameField, number, rollup, select, text } from '../pieces';
import { byDueDay, companies, people, products } from '../shared';
import type { AppTemplate } from '../types';
import { customerRole, lineFormat } from './sales';
import { movement } from './stock';

// Field service (design/scrawl-apps.md 3.3), as Jobber and Housecall Pro keep it: jobs by Today,
// Unscheduled, Scheduled, Late, To invoice and Done, with how many over them; a day of each
// technician on a row, the jobs not scheduled beside it to drag onto one. A job has On my way,
// Start and Complete, its checklist from its type, its parts, photos and the customer's signature;
// Complete writes the hours from Start, the labour as a line, and the parts go out of stock.
// Invoice writes the job on an order of its customer in Sales; equipment serviced regularly comes
// to Today with Book visit, and a service done plans the next.

const JOBS = ['repair', 'maintenance', 'installation', 'inspection'];
const JOB_NAMES: { [job: string]: string } = { repair: 'Repair', maintenance: 'Maintenance', installation: 'Installation', inspection: 'Inspection' };
const JOB_COLORS = { Repair: 'red', Maintenance: 'blue', Installation: 'green', Inspection: 'purple' } as const;
const STATUSES = ['Unscheduled', 'Scheduled', 'In progress', 'Done', 'Invoiced', 'Cancelled'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** What is checked on each kind of job, ready to change: a job of the kind starts with it. */
const CHECKS: { [job: string]: string[] } = {
  Repair: ['Check the fault the customer reported', 'Check the safety devices', 'Fix it and test it', 'Clean up the site', 'Tell the customer what was done'],
  Maintenance: ['Check and lubricate the moving parts', 'Check the safety devices', 'Read the error log', 'Test a full run', 'Tell the customer what was done'],
  Installation: ['Check the site is ready', 'Install and connect it', 'Test every function', 'Show the customer how it works', 'Clean up the site'],
  Inspection: ['Check it against the inspection list', 'Test the safety devices', 'Write down what needs repair', 'Tell the customer the result'],
};

/** How often a unit is serviced, and the days to the next time. */
const EVERY: [string, number][] = [
  ['Monthly', 30],
  ['Every 3 months', 91],
  ['Every 6 months', 182],
  ['Yearly', 365],
];

/** A day and its time as a job says it: "Today 11:00", "Yesterday 16:00", "Nov 3 10:00". */
const when = (d: string) =>
  `(empty(${d}) ? "" : (day(${d}) == today() ? "Today" : day(${d}) == today() - 1 ? "Yesterday" : day(${d}) == today() + 1 ? "Tomorrow" : monthname(${d}) + " " + text(monthday(${d}))) + " " + text(time(${d})))`;

export const field: AppTemplate = {
  id: 'field',
  version: 2,
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
  pieces: (_answers, app) => [customerRole(app), 'products', 'equipment', 'work-orders', 'work-order-lines', 'job-checks', 'checklists', 'technicians'],
  names: () => ({ 'work-orders': { name: 'Jobs', singular: 'job', about: "each job at a customer's site: what it is, who goes when, what was checked, the parts used, and what was done." } }),
  menu: [{ role: 'work-orders', view: 'today', name: 'Jobs' }, { role: 'work-orders', view: 'schedule', name: 'Schedule' }, 'equipment', 'technicians', 'checklists', 'companies', 'people', 'products'],
  build(app, answers) {
    const jobs = ((answers.jobs as string[] | undefined) ?? JOBS).map((j) => JOB_NAMES[j]!).filter(Boolean);
    const regular = answers.contracts !== false;
    const fromStock = app.has('stock') && app.hasPiece('stock-movements') && answers.stock !== false;
    const toSales = app.has('sales') && app.hasPiece('orders') && answers.invoice !== false;
    const toBudget = !toSales && app.has('budget') && app.hasPiece('payments') && answers.invoice !== false;
    const invoiced = toSales || toBudget;
    const customer = customerRole(app);
    const names = ((answers.technicians as string[] | undefined) ?? []).map((s) => s.trim()).filter(Boolean);
    const orders = app.path('work-orders');
    const lines = app.path('work-order-lines');
    const checks = app.path('job-checks');
    const own = app.format(true);
    const line = lineFormat(app);
    const statuses = invoiced ? STATUSES : STATUSES.filter((s) => s !== 'Invoiced');
    companies(app);
    people(app);
    products(app);

    app.field('technicians', nameField());
    app.field('technicians', { key: 'phone', label: 'Phone', type: 'phone' });
    app.field('technicians', number('rate', 'Hourly rate', { format: app.format(false), help: 'What an hour of their work is charged; Complete writes it as the labour' }));
    app.field('technicians', { key: 'from', label: 'Works from', type: 'time', default: '08:00' });
    app.field('technicians', { key: 'until', label: 'Works until', type: 'time', default: '17:00' });
    app.field('technicians', { ...multi('days', 'Days', DAYS), default: DAYS.slice(0, 5) });
    app.field('technicians', rollup('today', 'Today', orders, 'count', undefined, [{ field: 'start', op: 'on', value: 'today' }, { field: 'status', op: 'is-not', value: ['Cancelled'] }]));
    app.block('technicians', { block: 'linked', collection: orders, style: 'list', title: 'Jobs', fields: ['when_said', 'status'], sort: 'start', dir: 'desc' });
    app.homeTile('technicians', { off: true });
    app.homeTile('checklists', { off: true });
    for (const name of names) app.record('technicians', { name, from: '08:00', until: '17:00', days: DAYS.slice(0, 5) });

    app.field('equipment', nameField());
    app.field('equipment', link('customer', 'Customer', app.path(customer)));
    app.field('equipment', text('address', 'Address'));
    app.field('equipment', { ...text('type', 'Type'), suggest: true });
    app.field('equipment', { ...text('model', 'Brand and model'), suggest: true });
    app.field('equipment', text('serial', 'Serial no'));
    app.field('equipment', day('installed', 'Installed'));
    if (regular) {
      app.field('equipment', select('interval', 'Serviced', EVERY.map(([e]) => e)));
      app.field('equipment', day('next_service', 'Next service'));
      app.field('equipment', rollup('booked', 'Booked', orders, 'count', undefined, [{ field: 'type', op: 'is', value: ['Maintenance'] }, { field: 'status', op: 'is', value: ['Unscheduled', 'Scheduled', 'In progress'] }]));
      app.field('equipment', formula('next_said', 'Next', `empty(next_service) ? "" : next_service < today() ? "service " + text(today() - next_service) + " days late" : "service " + monthname(next_service) + " " + text(monthday(next_service))`));
      app.rule('equipment', { kind: 'check', name: 'Service due', src: 'check("next_service", () => empty(next_service) || next_service >= today(), "Service due")' });
      // Its service comes to Today with Book visit, which adds a maintenance job not scheduled yet.
      app.view('equipment', { ...calendar({ start: 'next_service', color: 'customer', upcoming: true, button: 'Book visit', words: ['customer', 'interval'] }, [{ field: 'interval', op: 'not-empty' }]), id: 'due', name: 'Service due' });
      app.homeTile('equipment', { off: true });
      app.rule('equipment', {
        kind: 'action',
        name: 'Book visit',
        src: `action("Book visit", {
  when: () => booked == 0,
  hint: "",
  ask: {
    start: { label: "When", type: "date", time: true, note: () => "Left empty, it waits in Unscheduled." },
    technician: { label: "Technician", type: "link", collection: "${app.called('technicians')}" },
  },
  done: () => name + " · visit booked",
}, () => {
  add("${app.called('work-orders')}", { equipment: this, customer: customer, type: "Maintenance", address: address, start: input.start, technician: input.technician, status: empty(input.start) ? "Unscheduled" : "Scheduled" })
})`,
      });
      app.homeTiles('equipment', [{ view: 'due', title: 'Service due', value: 'next_said', sub: 'customer', empty: 'No service is due.' }]);
    }
    const every = EVERY.map(([e]) => `interval == "${e}" ? "${e.toLowerCase()}"`).join(' : ');
    app.field('equipment', formula('said', 'Says', `(empty(type) ? "" : type + " · ") + (empty(customer) ? "" : customer.name)${regular ? ` + (empty(interval) ? "" : " · serviced " + (${every} : interval)) + (empty(next_service) ? "" : " · next " + monthname(next_service) + " " + text(monthday(next_service)))` : ''}`));
    app.head('equipment', 'said');
    app.block('equipment', { block: 'actions', column: 1 });
    app.block('equipment', { block: 'linked', collection: orders, sort: 'start', style: 'timeline', title: 'Jobs', add: 'Job', column: 2 });
    app.block(customer, { block: 'linked', collection: app.path('equipment'), style: 'list', title: 'Equipment', fields: regular ? ['next_said'] : ['type'], column: 3 });

    app.field('work-orders', codeField('WO-'));
    app.field('work-orders', { ...nameField('Title'), optional: true, help: 'Left empty, its type and the equipment' });
    app.field('work-orders', link('customer', 'Customer', app.path(customer)));
    app.field('work-orders', link('equipment', 'Equipment', app.path('equipment')));
    app.field('work-orders', { ...text('address', 'Address'), help: "Left empty, the equipment's" });
    if (jobs.length > 0) app.field('work-orders', { ...select('type', 'Type', jobs, JOB_COLORS, jobs[0]), chips: true });
    app.field('work-orders', link('technician', 'Technician', app.path('technicians')));
    app.field('work-orders', { ...dayAndTime('start', 'When'), help: 'Left empty, it waits in Unscheduled' });
    app.field('work-orders', number('duration', 'Takes', { format: { style: 'duration' }, default: 60 }));
    app.field('work-orders', formula('ends', 'Ends', 'start + minutes(duration)'));
    app.field('work-orders', { ...select('status', 'Status', statuses, { Unscheduled: 'gray', Scheduled: 'blue', 'In progress': 'orange', Done: 'green', Invoiced: 'purple', Cancelled: 'red' }, 'Unscheduled'), steps: { end: ['Cancelled'], no: ['Cancelled'], chip: true } });
    const begun = [{ field: 'status', op: 'is' as const, value: ['In progress', 'Done', 'Invoiced'] }];
    app.field('work-orders', dayAndTime('on_way', 'On the way'));
    app.field('work-orders', { ...dayAndTime('started_at', 'Started'), when: begun });
    app.field('work-orders', { ...dayAndTime('finished_at', 'Finished'), when: [{ field: 'status', op: 'is', value: ['Done', 'Invoiced'] }] });
    app.field('work-orders', formula('hours', 'Hours', '!empty(started_at) && !empty(finished_at) ? round((finished_at - started_at) / 60, 2) : 0'));
    app.field('work-orders', { ...text('work_done', 'What was done'), when: [{ field: 'status', op: 'is', value: ['Done', 'Invoiced'] }] });
    app.field('work-orders', { ...text('signature', 'Signature'), signature: true, when: [{ field: 'signature', op: 'not-empty' }] });
    app.field('work-orders', { ...text('signed_by', 'Signed by'), when: [{ field: 'signature', op: 'not-empty' }] });
    if (app.money.multi) app.field('work-orders', currencyField(app));
    app.field('work-orders', rollup('total', 'Total', lines, 'sum', 'amount', undefined, own));
    app.field('work-orders', rollup('checks', 'Checks', checks, 'count'));
    app.field('work-orders', rollup('checked', 'Checked', checks, 'count', undefined, [{ field: 'done', op: 'true' }]));
    app.field('work-orders', formula('late', 'Late', 'status == "Scheduled" && !empty(start) && day(start) < today()'));
    app.field('work-orders', formula('when_said', 'When', when('start')));
    // Its window's line: "Scheduled · Today 11:00 · Ahmet · Acme Lojistik, Beşiktaş · from RQ-0142".
    const request = app.hasPiece('requests');
    app.field(
      'work-orders',
      formula(
        'said',
        'Says',
        `status + (empty(start) ? "" : " · " + when_said) + (late ? " · late" : "") + (empty(technician) ? "" : " · " + technician.name) + (empty(on_way) || status != "Scheduled" ? "" : " · on the way since " + text(time(on_way))) + (empty(customer) ? "" : " · " + customer.name) + (empty(address) ? "" : ", " + address)${request ? ' + (empty(request) ? "" : " · from " + request.code)' : ''}`,
      ),
    );
    app.head('work-orders', 'said', 'status');
    app.formOrder('work-orders', ['customer', 'equipment', 'address', 'type', 'technician', 'start', 'duration', ...(request ? ['request'] : []), 'started_at', 'finished_at', 'work_done', 'signature', 'signed_by']);
    app.newForm('work-orders', ['customer', 'equipment', 'type', 'technician', 'start', 'duration']);
    app.block('work-orders', { block: 'actions', column: 1 });
    app.block('work-orders', { block: 'linked', collection: checks, look: 'checklist', lines: false, title: 'Checklist', fields: ['done'], edit: ['done'], sort: 'order', column: 2, tab: 'Job' });
    app.block('work-orders', { block: 'linked', collection: lines, style: 'table', title: 'Parts and labour', fields: ['product', 'quantity', 'unit_price', 'amount'], sums: true, column: 2, tab: 'Job' });
    app.block(customer, { block: 'linked', collection: orders, style: 'list', title: 'Jobs', fields: ['when_said', 'status'], sort: 'start', dir: 'desc', add: 'Job', column: 3 });
    if (request) {
      app.field('work-orders', link('request', 'Request', app.path('requests')));
      app.field('requests', link('equipment', 'Equipment', app.path('equipment')));
      app.block('requests', { block: 'linked', collection: orders, style: 'list', title: 'Jobs', fields: ['when_said', 'status'], add: 'Job', column: 3, tab: 'Related' });
    }

    // The tabs, Jobber's: today, what waits for a day, what is late, what is to invoice; over them how many and how much.
    const notOver: Condition = { field: 'status', op: 'is-not', value: ['Cancelled'] };
    const sums = [
      { label: 'today', conditions: [{ field: 'start', op: 'on' as const, value: 'today' }, notOver] },
      { label: 'unscheduled', conditions: [{ field: 'status', op: 'is' as const, value: ['Unscheduled'] }] },
      { label: 'late', conditions: [{ field: 'late', op: 'true' as const }], warn: true as const },
      ...(invoiced ? [{ label: 'to invoice', field: 'total', conditions: [{ field: 'status', op: 'is' as const, value: ['Done'] }] }] : []),
    ];
    const columns = ['name', 'customer', 'when_said', 'technician', 'status', 'total'];
    const tab = (id: string, name: string, conditions: Condition[], extra: Partial<View> = {}) =>
      app.view('work-orders', { id, name, conditions, sort: { key: 'start', dir: 'asc' }, columns, sums, set: 'jobs', ...extra }, id === 'today');
    tab('today', 'Today', [{ field: 'start', op: 'on', value: 'today' }, notOver]);
    tab('unscheduled', 'Unscheduled', [{ field: 'status', op: 'is', value: ['Unscheduled'] }]);
    tab('scheduled', 'Scheduled', [{ field: 'status', op: 'is', value: ['Scheduled'] }]);
    tab('late', 'Late', [{ field: 'late', op: 'true' }]);
    if (invoiced) tab('to-invoice', 'To invoice', [{ field: 'status', op: 'is', value: ['Done'] }], { all: 'Invoice' });
    tab('done', 'Done', [{ field: 'status', op: 'is', value: ['Done', 'Invoiced'] }], { sort: { key: 'start', dir: 'desc' } });
    // The day of each technician on a row; the jobs with no day beside it.
    app.view('work-orders', { ...calendar({ start: 'start', duration: 'duration', color: 'type', lanes: 'technician', upcoming: false }, [notOver]), id: 'schedule', name: 'Schedule' });
    // In Today and Upcoming: a job scheduled with Start, one started with Complete.
    app.view('work-orders', { ...calendar({ start: 'start', duration: 'duration', color: 'type', upcoming: true, button: 'Start', words: ['customer', 'technician'] }, [{ field: 'status', op: 'is', value: ['Scheduled'] }]), id: 'to-start', name: 'To start', hidden: true });
    app.view('work-orders', { ...calendar({ start: 'start', duration: 'duration', color: 'type', upcoming: true, button: 'Complete', words: ['customer', 'technician'] }, [{ field: 'status', op: 'is', value: ['In progress'] }]), id: 'in-progress', name: 'In progress', hidden: true });
    names.forEach((name, i) => {
      app.view('work-orders', { id: `technician-${i + 1}`, name, kind: 'calendar', calendar: { start: 'start', duration: 'duration', color: 'status', upcoming: false }, conditions: [{ field: 'technician', op: 'is', value: [name] }], hidden: true });
    });
    app.homeTile('work-orders', { off: true });
    app.homeTiles('work-orders', [
      { view: 'today', title: 'Today', head: [{ label: 'jobs', one: 'job' }, { label: 'late', conditions: [{ field: 'late', op: 'true' }], warn: true }], value: 'when_said', sub: 'technician', empty: 'No jobs today.' },
      { view: 'unscheduled', title: 'To schedule', head: [{ label: 'unscheduled' }], value: 'type', sub: 'customer', empty: 'Every job has its day.' },
      ...(invoiced ? [{ view: 'to-invoice', title: 'To invoice', head: [{ label: '', field: 'total' }, { label: 'jobs', one: 'job' }], value: 'total', sub: 'customer', empty: 'Nothing to invoice.' }] : []),
    ]);

    app.field('work-order-lines', nameField('Item'));
    app.field('work-order-lines', link('work_order', 'Job', orders));
    app.field('work-order-lines', link('product', 'Part', app.path('products')));
    app.field('work-order-lines', number('quantity', 'Quantity', { default: 1 }));
    app.field('work-order-lines', number('unit_price', 'Price', { format: line }));
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

    app.field('job-checks', nameField('Item'));
    app.field('job-checks', link('work_order', 'Job', orders));
    app.field('job-checks', checkbox('done', 'Done'));
    app.field('job-checks', number('order', 'Order'));
    app.field('checklists', nameField('Item'));
    if (jobs.length > 0) app.field('checklists', select('type', 'Type', jobs, JOB_COLORS));
    app.field('checklists', { ...number('order', 'Order'), help: 'Where it comes on the list' });
    app.view('checklists', { id: 'by-type', name: 'By type', conditions: [], group: 'type', sort: { key: 'order', dir: 'asc' } }, true);
    for (const job of jobs) (CHECKS[job] ?? []).forEach((item, i) => app.record('checklists', { name: item, type: job, order: i + 1 }));

    app.rule('work-orders', {
      kind: 'onSave',
      name: 'From the equipment',
      src: `onSave("From the equipment", () => {
  if (!empty(equipment) && empty(customer)) customer = equipment.customer
  if (!empty(equipment) && empty(address)) address = equipment.address
  if (empty(name)) name = ${jobs.length > 0 ? 'type + " · " + ' : ''}(empty(equipment) ? (empty(customer) ? "Job" : customer.name) : equipment.name)
  if (status == "Unscheduled" && !empty(start)) status = "Scheduled"
  if (status == "Scheduled" && empty(start)) status = "Unscheduled"${
    jobs.length > 0
      ? `
  if (!empty(type) && linked("${app.called('job-checks')}").length == 0) {
    for (const c of find("${app.called('checklists')}", { type: type })) add("${app.called('job-checks')}", { work_order: this, name: c.name, order: c.order })
  }`
      : ''
  }
})`,
    });
    const called = app.called('work-orders');
    const clash = `find("${called}", { technician: technician }).find((w) => w != this && w.status != "Cancelled" && w.start < ends && w.ends > start)`;
    app.rule('work-orders', { kind: 'check', name: 'Overlaps with', src: `check("start", () => status == "Cancelled" || empty(technician) || empty(start) || empty(ends) || empty(${clash}), \`Overlaps with \${${clash}.name}\`)` });
    const schedule = (name: string, from: string) => ({
      kind: 'action' as const,
      name,
      src: `action("${name}", {
  when: () => status == "${from}",
  hint: "",
  ask: {
    technician: { label: "Technician", type: "link", collection: "${app.called('technicians')}", default: () => technician, required: true },
    start: { label: "When", type: "date", time: true, default: () => start, required: true },
  },
  done: () => name + " · " + when_said,
}, () => {
  technician = input.technician
  start = input.start
  status = "Scheduled"
  on_way = null
})`,
    });
    app.rule('work-orders', schedule('Schedule', 'Unscheduled'));
    app.rule('work-orders', { kind: 'action', name: 'On my way', src: 'action("On my way", { when: () => status == "Scheduled" && empty(on_way), hint: "", done: () => name + " · on the way" }, () => {\n  on_way = now()\n})' });
    app.rule('work-orders', { kind: 'action', name: 'Start', src: 'action("Start", { when: () => status == "Scheduled", hint: "", done: () => name + " · started" }, () => {\n  started_at = now()\n  status = "In progress"\n})' });
    const next = regular
      ? `
  if (type == "Maintenance" && !empty(equipment) && !empty(equipment.interval)) {
    update(equipment, { next_service: today() + (${EVERY.map(([e, d]) => `equipment.interval == "${e}" ? ${d}`).join(' : ')} : 365) })
  }`
      : '';
    app.rule('work-orders', {
      kind: 'action',
      name: 'Complete',
      src: `action("Complete", {
  when: () => status == "Scheduled" || status == "In progress",
  hint: "",
  say: () => checks > checked ? text(checks - checked) + " of " + text(checks) + " checklist items are not ticked. You can complete it anyway." : name,
  ask: {
    work_done: { label: "What was done", type: "text", lines: true, required: true },
    started_at: { label: "Started", type: "date", time: true, default: () => empty(started_at) ? now() : started_at },
    finished_at: { label: "Finished", type: "date", time: true, default: () => now() },
    signature: { label: "Customer's signature", type: "signature" },
    signed_by: { label: "Signed by", type: "text", default: () => empty(customer) ? "" : customer.name },
  },
  done: () => name + " · done",
}, () => {
  work_done = input.work_done
  started_at = empty(input.started_at) ? now() : input.started_at
  finished_at = empty(input.finished_at) ? now() : input.finished_at
  if (!empty(input.signature)) {
    signature = input.signature
    signed_by = input.signed_by
  }
  status = "Done"
  const worked = round((finished_at - started_at) / 60, 2)
  if (!empty(technician) && technician.rate > 0 && worked > 0) add("${app.called('work-order-lines')}", { work_order: this, name: "Labour · " + technician.name, quantity: worked, unit_price: technician.rate })${regular && jobs.includes('Maintenance') ? next : ''}
})`,
    });
    app.rule('work-orders', schedule('Reschedule', 'Scheduled'));

    if (fromStock) {
      const places = app.hasPiece('locations') && app.hasPiece('stock-levels');
      app.field('stock-movements', link('work_order', 'Job', orders));
      app.rule('work-orders', {
        kind: 'onSave',
        name: 'Parts out',
        src: `onSave("Parts out", () => {
  const done = status == "Done" || status == "Invoiced"
  const was = old.status == "Done" || old.status == "Invoiced"
  if (done && !was) {
    for (const line of linked("${app.called('work-order-lines')}")) {
      if (!empty(line.product)) {
${places ? `        const location = find("${app.called('locations')}", { is_default: true })[0]\n` : ''}${movement(app, '        ', 'product: line.product, direction: "Out", type: "use", quantity: line.quantity', 'line.product', places ? 'location' : null)}
      }
    }
  }
  if (!done && was) {
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
      // Invoice puts the job on its customer's order of the day, Invoice all each job of a customer on one.
      app.rule('work-orders', {
        kind: 'action',
        name: 'Invoice',
        src: `action("Invoice", { when: () => status == "Done" && empty(order), hint: "", done: () => name + " · on " + order.code }, () => {
  const open = find("${sold}", { customer: customer, status: "Delivered" }).filter((o) => o.date == today())[0]
  const made = empty(open) ? add("${sold}", { customer: customer, status: "Delivered"${app.money.multi ? ', currency: currency' : ''} }) : open
  for (const l of linked("${app.called('work-order-lines')}")) {
    add("${soldLines}", { order: made, name: code + " · " + l.name, quantity: l.quantity, unit_price: l.unit_price })
  }
  order = made
  status = "Invoiced"
})`,
      });
    }
    if (toBudget) {
      const pay = app.called('payments');
      app.record('budget-lines', { name: 'Field service', type: 'Income' });
      app.field('payments', link('work_order', 'Job', orders));
      app.rule('work-orders', {
        kind: 'action',
        name: 'Invoice',
        src: `action("Invoice", { when: () => status == "Done", hint: "", done: () => name + " · invoiced" }, () => {
  add("${pay}", { name: code + " · " + name, direction: "In", amount: total, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: today() + 30' : ''}, budget_line: find("${app.called('budget-lines')}", { name: "Field service" })[0] })
  status = "Invoiced"
})`,
      });
    }

    app.about({
      title: 'Field service',
      what: `The equipment you look after at your customers' sites, the jobs on it${jobs.length > 0 ? ` (${jobs.map((j) => j.toLowerCase()).join(', ')})` : ''}, who goes when, what was checked, the parts used and what was done.`,
      pieces: ['work-orders', 'equipment', 'technicians', 'checklists', 'work-order-lines', 'products'],
      glance: [
        'Over the jobs, how many are today, unscheduled and late',
        'Schedule: each technician’s day on a row; drag a job onto one',
        'On my way, Start and Complete on each job; Today has them',
        'A job starts with its checklist',
        ...(regular ? ['A unit’s service comes to Today with Book visit; one done plans the next'] : []),
        ...(fromStock ? ['The parts used go out of stock'] : []),
        ...(toSales ? ['Invoice puts the job on its customer’s order in Sales'] : toBudget ? ['Invoice writes what to collect'] : []),
      ],
      how: [
        `Add a job for a unit or a customer: what kind, who goes and when; leave When empty and it waits in Unscheduled.`,
        'On Schedule, drag a job onto a technician’s row at its hour.',
        'The technician presses On my way, Start when they get there, ticks the checklist, adds the parts, takes photos, and presses Complete: what was done and the customer’s signature.',
        ...(invoiced ? ['Press Invoice on a job done, or Invoice all over To invoice.'] : []),
      ],
      auto: [
        'A job for a unit takes its customer and address from it, and its name from its type and the unit; with a day it is Scheduled.',
        `A job starts with the checklist of its type, from ${app.called('checklists')}.`,
        'A part takes its price from its product.',
        'Two jobs of the same technician at the same time are marked; they are kept.',
        'Complete writes when it started and ended; the hours times the technician’s rate are written as the labour.',
        ...(regular && jobs.includes('Maintenance') ? ['When maintenance is done and the unit says how often it is serviced, its next service is planned that much later; Book visit adds a maintenance job for it.'] : []),
        ...(fromStock ? ['When a job is done, its parts go out of stock; taken back, they come back.'] : []),
        ...(toSales ? [`Invoice adds the job's parts and labour to its customer's order of the day in ${app.called('orders')}, to invoice there.`] : []),
        ...(toBudget ? [`Invoice adds a payment of its total to ${app.called('payments')}, under the Field service budget line.`] : []),
      ],
      work: ['How a call for a job comes in, and who takes it.', 'Who decides which technician goes.', 'What goes in a service report.'],
    });
  },
};
