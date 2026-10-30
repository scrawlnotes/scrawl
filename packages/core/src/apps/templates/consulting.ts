import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition, View } from '../../collection';
import { calendar, checkbox, currencyField, day, dayAndTime, formula, link, nameField, number, person, rollup, select, symbolOf, text } from '../pieces';
import { byDueDay, companies, people } from '../shared';
import type { Answers, AppTemplate } from '../types';
import { clientRole, customerRole } from './sales';
import { periodSpan } from './subscriptions';

// Consulting (design/scrawl-apps.md 3.3), as Harvest and Toggl keep it: Track time with the hours
// or a timer that runs until Stop, a week of hours typed in a sheet, row by project; projects by
// client, their budget as a bar, flagged at 80% and red over it, what is left and what is not
// invoiced; a fixed fee's payments as steps, each in Today with Invoice when it falls due. Invoice
// takes the hours and expenses not invoiced yet onto an order of the client in Sales. Accounting
// and law firms keep their clients' filings that come again and again as deadlines, the next one
// written when one is done. Time entries are one piece with Project management's.

const MODELS = ['Fixed', 'Hourly', 'Retainer'];
/** What a fee is called on a project, by the answer: Harvest's Fixed fee. */
const FEES: { [model: string]: string } = { Fixed: 'Fixed fee', Hourly: 'Hourly', Retainer: 'Retainer' };
const DEADLINES = ['VAT return monthly', 'Annual accounts yearly'];
const CATEGORIES = ['Travel', 'Meals', 'Lodging', 'Supplies', 'Other'];

/** A deadline as the list says it: its name, and how often it comes from a word in it; monthly when it says none. */
export function deadlineOf(item: string): { name: string; repeats: string } {
  const words = item.trim();
  const repeats = /\b(year|yearly|annual|annually)\b/i.test(words) ? 'Yearly' : /\b(quarter|quarterly)\b/i.test(words) ? 'Quarterly' : 'Monthly';
  const name = words.replace(/\s*\b(monthly|quarterly|yearly|annually)\b\s*/i, ' ').trim();
  return { name: name || words, repeats };
}

/** How the answers say a client pays; all of them when none is picked. */
const modelsOf = (answers: Answers) => {
  const listed = (answers.models as string[] | undefined) ?? [];
  return listed.length > 0 ? listed : MODELS;
};

/** Minutes as a timer says them: "1 h 12 min", "40 min". */
const clock = (m: string) => `(${m} >= 60 ? text(round(${m} / 60 - 0.5)) + " h " + text(round(${m} - round(${m} / 60 - 0.5) * 60)) + " min" : text(round(${m})) + " min")`;

export const consulting: AppTemplate = {
  id: 'consulting',
  version: 2,
  group: 'customers',
  name: 'apps.consulting.name',
  short: 'apps.consulting.short',
  icon: 'share',
  what: 'apps.consulting.what',
  questions: [
    {
      key: 'models',
      kind: 'multi',
      label: 'apps.consulting.models',
      options: MODELS.map((value) => ({ value, label: `apps.consulting.model.${value.toLowerCase()}` as MessageKey })),
      default: MODELS,
    },
    { key: 'time', kind: 'yesno', label: 'apps.consulting.time', default: true },
    { key: 'deadlines', kind: 'yesno', label: 'apps.consulting.deadlines', default: false, help: 'apps.consulting.deadlinesHelp' },
    { key: 'deadlineList', kind: 'list', label: 'apps.consulting.deadlineList', default: DEADLINES, when: ({ answers }) => answers.deadlines === true, under: 'deadlines', help: 'apps.consulting.deadlineListHelp', add: 'apps.consulting.addDeadline' },
    {
      key: 'customers',
      kind: 'choice',
      label: 'apps.consulting.customers',
      options: [
        { value: 'companies', label: 'apps.consulting.customers.companies' },
        { value: 'people', label: 'apps.consulting.customers.people' },
      ],
      default: 'companies',
      when: ({ chosen }) => !chosen.has('crm'),
    },
    { key: 'payments', kind: 'yesno', label: 'apps.consulting.payments', default: true, when: ({ chosen }) => chosen.has('budget') && !chosen.has('sales'), because: 'budget' },
  ],
  money: () => true,
  pieces: (answers, app) => [
    clientRole(app, answers),
    'engagements',
    'deliverables',
    ...(answers.time !== false ? ['time-entries'] : []),
    'expenses',
    ...(modelsOf(answers).includes('Fixed') ? ['milestones'] : []),
    ...(answers.deadlines === true ? ['deadlines'] : []),
  ],
  names: (answers, app): { [role: string]: { name: string; singular?: string; about: string } } => ({
    ...(!app.has('projects') && { engagements: { name: 'Projects', singular: 'project', about: 'each piece of work for a client: how it is paid, its budget, its dates, and how much of it is used.' } }),
    ...(answers.time !== false && { 'time-entries': { name: 'Time entries', singular: 'time entry', about: 'the hours spent on each project, a timer while one runs, and whether they are invoiced.' } }),
    expenses: { name: 'Expenses', singular: 'expense', about: 'what was spent on a project, and whether it is invoiced.' },
  }),
  menu: (answers) => [
    { role: 'engagements', view: 'active', name: 'Projects' },
    ...(answers.time !== false ? [{ role: 'time-entries', view: 'week', name: 'Time' }] : []),
    'expenses',
    'deliverables',
    'deadlines',
    'companies',
    'people',
  ],
  build(app, answers) {
    const models = modelsOf(answers);
    const fees = [...models.map((m) => FEES[m]!), 'Non-billable'];
    const time = answers.time !== false;
    const deadlines = answers.deadlines === true;
    const fixed = models.includes('Fixed');
    const client = clientRole(app, answers);
    // Invoice writes an order in Sales when Sales keeps the same customers; else a payment in Budget.
    const toSales = app.has('sales') && app.hasPiece('orders') && customerRole(app) === client;
    const paid = !toSales && app.has('budget') && app.hasPiece('payments') && answers.payments !== false;
    const jobs = app.path('engagements');
    const own = app.format(true);
    const spent = app.path('expenses');
    const hours = time ? app.path('time-entries') : '';
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    companies(app);
    people(app);

    app.field('engagements', nameField());
    app.field('engagements', link('client', 'Client', app.path(client)));
    app.field('engagements', { ...select('fee_model', 'Fee', fees, { 'Fixed fee': 'purple', Hourly: 'teal', Retainer: 'blue', 'Non-billable': 'gray' }, fees[0]), chips: true });
    if (app.money.multi) app.field('engagements', currencyField(app));
    app.field('engagements', { ...number('rate', 'Rate', { format: own }), help: 'An hour of work, for its hours to be worth something', when: [{ field: 'fee_model', op: 'is-not', value: ['Non-billable'] }] });
    app.field('engagements', { ...number('budget', 'Budget', { format: own }), help: 'Left empty, no budget is followed' });
    if (models.includes('Retainer')) app.field('engagements', { ...formula('budget_said', 'Budget', `fee_model == "Retainer" && budget > 0 ? ${money('budget')} + " a month" : budget > 0 ? ${money('budget')} : ""`) });
    app.field('engagements', day('start', 'Start', true));
    app.field('engagements', day('end', 'End'));
    app.field('engagements', select('status', 'Status', ['Active', 'On hold', 'Done'], { Active: 'blue', 'On hold': 'yellow', Done: 'green' }, 'Active'));
    app.field('engagements', person('owner', 'Owner', true));
    const month: Condition[] = [{ field: 'this_month', op: 'true' }];
    if (time) {
      app.field('engagements', rollup('hours', 'Hours', hours, 'sum', 'hours'));
      app.field('engagements', rollup('time_amount', 'Time', hours, 'sum', 'amount', undefined, own));
      app.field('engagements', rollup('month_time', 'Time this month', hours, 'sum', 'amount', month, own));
      app.field('engagements', rollup('unbilled_time', 'Time not invoiced', hours, 'sum', 'amount', [{ field: 'billable', op: 'true' }, { field: 'billed', op: 'false' }], own));
    }
    app.field('engagements', rollup('expense_amount', 'Expenses', spent, 'sum', 'amount', undefined, own));
    app.field('engagements', rollup('month_expenses', 'Expenses this month', spent, 'sum', 'amount', month, own));
    app.field('engagements', rollup('unbilled_expenses', 'Expenses not invoiced', spent, 'sum', 'amount', [{ field: 'billable', op: 'true' }, { field: 'billed', op: 'false' }], own));
    app.field('engagements', formula('unbilled', 'Uninvoiced', time ? 'unbilled_time + unbilled_expenses' : 'unbilled_expenses', own));
    // What is spent of the budget: of a retainer this month's, else all of it.
    const all = time ? 'time_amount + expense_amount' : 'expense_amount';
    const thisMonth = time ? 'month_time + month_expenses' : 'month_expenses';
    app.field('engagements', formula('spent', 'Spent', models.includes('Retainer') ? `fee_model == "Retainer" ? ${thisMonth} : ${all}` : all, own));
    app.field('engagements', formula('used', 'Used', 'budget > 0 ? spent / budget : 0', { style: 'percent', decimals: 0, bar: true, warn: true }));
    app.field('engagements', formula('left', 'Remaining', 'budget > 0 ? budget - spent : 0', own));
    app.field(
      'engagements',
      formula('left_said', 'Remaining', `budget > 0 ? (left >= 0 ? ${money('left')} + " (" + text(round(left / budget * 100)) + "%)" : "−" + ${money('0 - left')} + " (" + text(round((spent - budget) / budget * 100)) + "% over)") : ""`),
    );
    app.field('engagements', formula('over', 'Over budget', 'budget > 0 && spent > budget'));
    app.field('engagements', formula('at_risk', 'At risk', 'budget > 0 && spent >= budget * 0.8'));
    // Its window's line: "Globex · 48 h · $6,200 of $8,000 · $1,800 left (22%) · $3,400 uninvoiced".
    app.field(
      'engagements',
      formula(
        'said',
        'Says',
        `(empty(client) ? fee_model : client.name)${time ? ' + " · " + text(round(hours, 1)) + " h"' : ''} + " · " + ${money('spent')} + (budget > 0 ? " of " + ${money('budget')} + " · " + (left >= 0 ? ${money('left')} + " left (" + text(round(left / budget * 100)) + "%)" : ${money('0 - left')} + " over") : " spent") + (unbilled > 0 ? " · " + ${money('unbilled')} + " uninvoiced" : "")`,
      ),
    );
    app.head('engagements', 'said');
    app.formOrder('engagements', ['client', 'fee_model', 'rate', 'budget', 'start', 'end', 'owner']);
    app.newForm('engagements', ['client', 'fee_model', 'rate', 'budget', 'start', 'end']);
    app.rule('engagements', { kind: 'check', name: 'Over its budget', src: 'check("budget", () => !over, `Over its budget: ${text(round(used * 100))}% used`)' });
    app.block('engagements', { block: 'actions', column: 1 });
    app.block(client, { block: 'linked', collection: jobs, style: 'list', title: app.called('engagements'), fields: ['status', 'unbilled'], sort: 'start', dir: 'desc', add: 'Project', column: 3 });

    // The list, Harvest's: by client, each with its budget as a bar; over it what is active, uninvoiced and over.
    const sums = [
      { label: 'active', conditions: [{ field: 'status', op: 'is' as const, value: ['Active'] }] },
      { label: 'uninvoiced', field: 'unbilled' },
      { label: 'over budget', conditions: [{ field: 'over', op: 'true' as const }], warn: true as const },
    ];
    const columns = ['fee_model', models.includes('Retainer') ? 'budget_said' : 'budget', 'spent', 'used', 'left_said', 'unbilled'];
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('engagements', { id, name, conditions, group: 'client', sort: { key: 'start', dir: 'desc' }, columns, sums, set: 'projects' }, id === 'active');
    tab('active', 'Active', [{ field: 'status', op: 'is-not', value: ['Done'] }]);
    tab('done', 'Done', [{ field: 'status', op: 'is', value: ['Done'] }]);
    app.view('engagements', { id: 'uninvoiced', name: 'Uninvoiced', conditions: [{ field: 'unbilled', op: 'gt', value: 0 }], sort: { key: 'unbilled', dir: 'desc' }, hidden: true });
    app.view('engagements', { id: 'at-risk', name: 'Budgets', conditions: [{ field: 'at_risk', op: 'true' }], sort: { key: 'used', dir: 'desc' }, hidden: true });
    app.homeTile('engagements', { off: true });
    app.homeTiles('engagements', [
      { view: 'uninvoiced', title: 'Uninvoiced', head: [{ label: '', field: 'unbilled' }], value: 'unbilled', empty: 'Everything is invoiced.' },
      { view: 'at-risk', title: 'Budgets', head: [{ label: 'over', conditions: [{ field: 'over', op: 'true' }], warn: true }, { label: 'at 80% or more' }], value: 'used', empty: 'No budget is near its end.' },
    ]);

    app.field('deliverables', nameField());
    app.field('deliverables', { ...link('engagement', app.called('engagements') === 'Projects' ? 'Project' : 'Engagement', jobs), required: true });
    app.field('deliverables', person('owner', 'Owner', true));
    app.field('deliverables', day('due', 'Due'));
    app.field('deliverables', select('status', 'Status', ['To do', 'In progress', 'Delivered'], { 'To do': 'gray', 'In progress': 'blue', Delivered: 'green' }, 'To do'));
    app.field('deliverables', formula('due_said', 'When', `empty(due) ? "" : status != "Delivered" && due < today() ? text(today() - due) + (today() - due == 1 ? " day late" : " days late") : monthname(due) + " " + text(monthday(due))`));
    app.view('deliverables', calendar({ start: 'due', color: 'status', upcoming: true, button: 'Delivered', words: ['engagement', 'owner'] }, [{ field: 'status', op: 'is-not', value: ['Delivered'] }]));
    app.rule('deliverables', { kind: 'action', name: 'Delivered', src: 'action("Delivered", { when: () => status != "Delivered", hint: "", done: () => name + " · delivered" }, () => {\n  status = "Delivered"\n})' });
    app.block('engagements', { block: 'linked', collection: app.path('deliverables'), style: 'list', title: 'Deliverables', fields: ['due_said', 'owner'], sort: 'due', where: [{ field: 'status', op: 'is-not', value: ['Delivered'] }], add: 'Deliverable', column: 2 });

    const project = app.called('engagements') === 'Projects' ? 'Project' : 'Engagement';
    if (time) {
      app.field('time-entries', { ...nameField('What'), optional: true, help: 'Left empty, Work' });
      app.field('time-entries', link('engagement', project, jobs));
      app.field('time-entries', person('person', 'Person', true));
      app.field('time-entries', day('date', 'Day', true));
      app.field('time-entries', { ...number('hours', 'Hours'), help: 'Left empty, a timer starts; Stop writes the hours' });
      app.field('time-entries', dayAndTime('started', 'Running since'));
      app.field('time-entries', checkbox('billable', 'Billable', true));
      app.field('time-entries', number('rate', 'Rate', { format: own }));
      if (app.money.multi) app.field('time-entries', currencyField(app));
      app.field('time-entries', formula('amount', 'Amount', 'billable ? (hours || 0) * (rate || 0) : 0', own));
      app.field('time-entries', checkbox('billed', 'Invoiced'));
      app.field('time-entries', formula('billable_hours', 'Billable hours', 'billable ? hours : 0'));
      app.field('time-entries', formula('this_month', 'This month', '!empty(date) && month(date) == month(today()) && year(date) == year(today())'));
      app.field('time-entries', formula('this_week', 'This week', '!empty(date) && week(date) == week(today())'));
      app.field('time-entries', formula('running_said', 'Running', `empty(started) ? "" : (empty(name) ? "Work" : name) + " · running " + ${clock('(now() - started)')}`));
      app.formOrder('time-entries', ['engagement', 'name', 'hours', 'date']);
      app.newForm('time-entries', ['engagement', 'name', 'hours', 'date']);
      app.rule('time-entries', {
        kind: 'onSave',
        name: 'From the project',
        src: `onSave("From the project", () => {
  if (empty(name)) name = "Work"
  if (!empty(engagement) && empty(old.engagement)) {
    if (empty(rate)) rate = engagement.rate
    billable = engagement.fee_model != "Non-billable"${app.money.multi ? '\n    if (empty(currency)) currency = engagement.currency' : ''}
  }
  if (empty(old.date) && empty(hours) && empty(started)) started = now()
})`,
      });
      app.rule('time-entries', {
        kind: 'action',
        name: 'Stop',
        src: `action("Stop", { when: () => !empty(started), hint: "", done: () => name + " · " + text(hours) + " h" }, () => {
  hours = round((hours || 0) + (now() - started) / 60, 2)
  started = null
})`,
      });
      app.view('time-entries', { id: 'week', name: 'Week', kind: 'sheet', sheet: { row: 'engagement', day: 'date', value: 'hours' }, conditions: [] }, true);
      app.view('time-entries', { id: 'all', name: 'All', conditions: [], sort: { key: 'date', dir: 'desc' }, columns: ['engagement', 'person', 'date', 'hours', 'amount', 'billed'] });
      // A timer running is in Today with Stop, and on Home.
      const running: View = { ...calendar({ start: 'started', upcoming: true, button: 'Stop', words: ['engagement', 'running_said'] }, [{ field: 'started', op: 'not-empty' }]), id: 'running', name: 'Running', hidden: true };
      app.view('time-entries', running);
      app.view('time-entries', { id: 'this-week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }], sort: { key: 'date', dir: 'desc' }, hidden: true });
      app.homeTile('time-entries', { off: true });
      app.homeTiles('time-entries', [
        { view: 'this-week', title: 'This week', head: [{ label: 'h', field: 'hours' }, { label: 'billable', field: 'billable_hours', per: 'hours' }], lines: [{ label: 'Billable', field: 'billable_hours' }, { label: 'Most on', field: 'hours', by: 'engagement' }, { label: 'Most by', field: 'hours', by: 'person' }] },
      ]);
      app.block('engagements', { block: 'linked', collection: hours, style: 'table', title: 'Hours', fields: ['date', 'person', 'hours', 'amount'], sort: 'date', dir: 'desc', sums: true, column: 2 });
      app.rule('engagements', {
        kind: 'action',
        name: 'Track time',
        src: `action("Track time", {
  when: () => status != "Done",
  hint: "",
  ask: {
    note: { label: "What", type: "text" },
    hours: { label: "Hours", type: "number", note: () => "Left empty, a timer starts; Stop writes the hours." },
    date: { label: "Day", type: "date", default: () => today() },
  },
  done: () => name + (empty(input.hours) ? " · timer started" : " · " + text(input.hours) + " h"),
}, () => {
  add("${app.called('time-entries')}", { name: empty(input.note) ? "Work" : input.note, engagement: this, hours: input.hours, date: empty(input.date) ? today() : input.date, billable: fee_model != "Non-billable", rate: rate, started: empty(input.hours) ? now() : null })
})`,
      });
    }

    app.field('expenses', nameField('What'));
    app.field('expenses', link('engagement', project, jobs));
    app.field('expenses', day('date', 'Day', true));
    app.field('expenses', { ...select('category', 'Category', CATEGORIES, { Travel: 'blue', Meals: 'orange', Lodging: 'purple', Supplies: 'teal', Other: 'gray' }), chips: true });
    app.field('expenses', number('amount', 'Amount', { required: true, format: own }));
    if (app.money.multi) app.field('expenses', currencyField(app));
    app.field('expenses', { ...checkbox('billable', 'Billable', true), help: "Left as it is, the project's: not for a non-billable one" });
    app.field('expenses', checkbox('billed', 'Invoiced'));
    app.field('expenses', formula('this_month', 'This month', '!empty(date) && month(date) == month(today()) && year(date) == year(today())'));
    app.notes('expenses', 'attach');
    app.newForm('expenses', ['engagement', 'date', 'category', 'amount', 'name']);
    app.rule('expenses', {
      kind: 'onSave',
      name: 'From the project',
      src: `onSave("From the project", () => {
  if (empty(name) && !empty(category)) name = category
  if (!empty(engagement) && empty(old.engagement) && engagement.fee_model == "Non-billable") billable = false${app.money.multi ? '\n  if (!empty(engagement) && empty(currency)) currency = engagement.currency' : ''}
})`,
    });
    app.homeTile('expenses', { off: true });
    app.homeTile('deliverables', { off: true });
    app.view('expenses', { id: 'all', name: 'All', conditions: [], sort: { key: 'date', dir: 'desc' }, columns: ['engagement', 'date', 'category', 'amount', 'billable', 'billed'] }, true);
    app.block('engagements', { block: 'linked', collection: spent, style: 'list', title: 'Expenses', fields: ['date', 'amount'], sort: 'date', dir: 'desc', add: 'Expense', column: 2 });

    // A fixed fee's payments, its steps: each falls due on its day, in Today with Invoice.
    if (fixed) {
      const steps = app.path('milestones');
      app.field('milestones', nameField('Payment'));
      app.field('milestones', link('engagement', project, jobs));
      app.field('milestones', number('amount', 'Amount', { format: own }));
      if (app.money.multi) app.field('milestones', currencyField(app));
      app.field('milestones', day('due', 'Due'));
      app.field('milestones', checkbox('billed', 'Invoiced'));
      app.view('milestones', calendar({ start: 'due', upcoming: true, button: 'Invoice', words: ['engagement', 'amount'] }, [{ field: 'billed', op: 'false' }]));
      app.block('engagements', { block: 'linked', collection: steps, style: 'table', title: 'Payments', fields: ['due', 'amount', 'billed'], sort: 'due', sums: true, add: 'Payment', column: 2, when: [{ field: 'fee_model', op: 'is', value: ['Fixed fee'] }] });
    }

    // Invoice: the hours and the expenses not invoiced yet, of a month or all, onto an order of the client, line by person, by task or one.
    const inRange = `(input.range == "All not invoiced" || (input.range == "This month" ? month(e.date) == month(today()) && year(e.date) == year(today()) : month(e.date) == month(today() - monthday(today())) && year(e.date) == year(today() - monthday(today()))))`;
    const picked = `
  const times = ${time ? `linked("${app.called('time-entries')}").filter((e) => e.billable && !e.billed && empty(e.started) && ${inRange})` : '[]'}
  const costs = linked("${app.called('expenses')}").filter((e) => input.expenses == "Billable ones" && e.billable && !e.billed && ${inRange})`;
    const sumOf = 'sum(times.map((e) => e.amount)) + sum(costs.map((e) => e.amount))';
    const lineAdd = toSales
      ? (order: string) => `
  for (const e of times) {
    const label = input.lines == "By person" ? name + " · " + e.person : input.lines == "By task" ? name + " · " + e.name : name
    const same = find("${app.called('order-lines')}", { order: ${order}, name: label })[0]
    if (empty(same) || same.unit_price != e.rate) add("${app.called('order-lines')}", { order: ${order}, name: label, quantity: e.hours, unit_price: e.rate })
    else update(same, { quantity: same.quantity + e.hours })
  }
  for (const e of costs) add("${app.called('order-lines')}", { order: ${order}, name: "Expense · " + e.name, quantity: 1, unit_price: e.amount })`
      : () => '';
    const writes = toSales
      ? `
  const made = add("${app.called('orders')}", { customer: client, engagement: this, status: "Delivered"${app.money.multi ? ', currency: currency' : ''} })${lineAdd('made')}`
      : paid
        ? `
  add("${app.called('payments')}", { name: name + " · " + text(today()), direction: "In", amount: ${sumOf}, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: today() + 30' : ''}, budget_line: find("${app.called('budget-lines')}", { name: "Consulting" })[0] })`
        : '';
    app.rule('engagements', {
      kind: 'action',
      name: 'Invoice',
      src: `action("Invoice", {
  when: () => unbilled > 0,
  hint: "",
  ask: {
    range: { label: "Hours from", type: "choice", options: ["This month", "Last month", "All not invoiced"], chips: true, default: "All not invoiced" },
    expenses: { label: "Expenses", type: "choice", options: ["Billable ones", "None"], chips: true, default: "Billable ones" },${
      toSales
        ? `
    lines: { label: "Lines", type: "choice", options: ["By person", "By task", "One line"], chips: true, default: "By person", note: () => ${toSales ? `"An order to invoice for " + (empty(client) ? "the client" : client.name) + " in ${app.called('orders')}; the hours and expenses are marked invoiced."` : '""'} },`
        : ''
    }
  },
  say: () => ${money('unbilled')} + " not invoiced",
  done: () => name + " · invoiced",
}, () => {${picked}${writes}
  for (const e of times) update(e, { billed: true })
  for (const e of costs) update(e, { billed: true })
})`,
    });
    if (fixed) {
      app.rule('milestones', {
        kind: 'action',
        name: 'Invoice',
        src: `action("Invoice", { when: () => !billed && amount > 0, hint: "", done: () => name + " · invoiced" }, () => {${
          toSales
            ? `
  const made = add("${app.called('orders')}", { customer: engagement.client, engagement: engagement, status: "Delivered" })
  add("${app.called('order-lines')}", { order: made, name: engagement.name + " · " + name, quantity: 1, unit_price: amount })`
            : paid
              ? `
  add("${app.called('payments')}", { name: engagement.name + " · " + name, direction: "In", amount: amount, status: "Invoiced"${byDueDay(app) ? ', due: today() + 30' : ''}, budget_line: find("${app.called('budget-lines')}", { name: "Consulting" })[0] })`
              : ''
        }
  billed = true
})`,
      });
    }
    app.rule('engagements', {
      kind: 'action',
      name: 'Expense',
      src: `action("Expense", {
  when: () => status != "Done",
  hint: "",
  ask: {
    category: { label: "Category", type: "choice", options: ${JSON.stringify(CATEGORIES)}, chips: true },
    amount: { label: "Amount", type: "number", required: true },
    date: { label: "Day", type: "date", default: () => today() },
    note: { label: "What", type: "text" },
  },
  done: () => name + " · expense added",
}, () => {
  add("${app.called('expenses')}", { name: empty(input.note) ? (empty(input.category) ? "Expense" : input.category) : input.note, engagement: this, category: input.category, amount: input.amount, date: empty(input.date) ? today() : input.date, billable: fee_model != "Non-billable" })
})`,
    });
    if (toSales) app.block('engagements', { block: 'linked', collection: app.path('orders'), style: 'list', title: 'Invoices', fields: ['state', 'total'], column: 2 });
    if (toSales) app.field('orders', link('engagement', project, jobs));
    if (paid) {
      app.record('budget-lines', { name: 'Consulting', type: 'Income' });
      app.field('payments', link('engagement', project, jobs));
      app.block('engagements', { block: 'linked', collection: app.path('payments'), style: 'list', title: 'Invoices', fields: ['amount', 'status'], column: 2 });
    }

    if (deadlines) {
      const items = ((answers.deadlineList as string[] | undefined) ?? DEADLINES).filter((d) => d.trim()).map(deadlineOf);
      const kinds = [...new Set(items.map((d) => d.name))];
      app.field('deadlines', nameField());
      app.field('deadlines', link('client', 'Client', app.path(client)));
      if (kinds.length > 0) app.field('deadlines', select('kind', 'Kind', kinds));
      app.field('deadlines', { ...day('due', 'Due'), required: true });
      app.field('deadlines', select('repeats', 'Repeats', ['Monthly', 'Quarterly', 'Yearly']));
      app.field('deadlines', select('status', 'Status', ['To do', 'Done'], { 'To do': 'gray', Done: 'green' }, 'To do'));
      app.view('deadlines', calendar({ start: 'due', color: 'client', upcoming: true }, [{ field: 'status', op: 'is', value: ['To do'] }]));
      app.block(client, { block: 'linked', collection: app.path('deadlines'), style: 'list', fields: ['due', 'status'], sort: 'due', column: 3 });
      const repeatOf = items.map((d) => `kind == ${JSON.stringify(d.name)} ? ${JSON.stringify(d.repeats)}`).join(' : ');
      app.rule('deadlines', {
        kind: 'onSave',
        name: 'The next one',
        src: `onSave("The next one", () => {
  if (empty(name) && !empty(client)) name = ${kinds.length > 0 ? '(empty(kind) ? "Deadline" : kind)' : '"Deadline"'} + " · " + client.name${
    kinds.length > 0
      ? `
  if (empty(repeats) && !empty(kind)) repeats = ${repeatOf} : null`
      : ''
  }
  if (status == "Done" && old.status != "Done" && !empty(repeats) && !empty(due)) {
    add("${app.called('deadlines')}", { name: name, client: client${kinds.length > 0 ? ', kind: kind' : ''}, due: due + ${periodSpan('repeats')}, repeats: repeats, status: "To do" })
  }
})`,
      });
    }

    const kindsText = deadlines ? ((answers.deadlineList as string[] | undefined) ?? DEADLINES).map((d) => deadlineOf(d).name) : [];
    const projects = app.called('engagements');
    app.about({
      title: 'Consulting',
      what: `Your clients and the work you do for them: each project, ${models.map((m) => FEES[m]!.toLowerCase()).join(', ')}, with its budget, what is delivered${time ? ', the hours' : ''} and the expenses, and what is invoiced${deadlines ? `; and what is due for each client again and again${kindsText.length > 0 ? `: ${kindsText.join(', ')}` : ''}` : ''}.`,
      pieces: ['engagements', ...(time ? ['time-entries'] : []), 'expenses', 'deliverables', ...(fixed ? ['milestones'] : []), ...(deadlines ? ['deadlines'] : []), client],
      glance: [
        ...(time ? ['Track time, or a timer that runs until Stop', 'A week of hours typed in a sheet'] : []),
        'Each project’s budget as a bar, flagged at 80%',
        ...(toSales ? ['Invoice puts what is not invoiced on an order in Sales'] : paid ? ['Invoice writes a payment'] : ['Invoice marks what was invoiced']),
        'Deliverables in Today and Upcoming',
        ...(fixed ? ['A fixed fee’s payment in Today with Invoice when it falls due'] : []),
        ...(deadlines ? ['A deadline done writes the next one'] : []),
      ],
      how: [
        `Add a project in ${projects} for a client: how it is paid, its rate, its budget and its dates.`,
        ...(time ? ['Press Track time on it, or on the Time screen, with the hours; or leave them empty to start a timer and press Stop when you are done. On the week, type the hours in the cells.'] : []),
        'Press Expense on it for what you spend; untick Billable for what the client does not pay.',
        ...(fixed ? ['For a fixed fee, add its payments with their days; press Invoice when one falls due.'] : []),
        'Press Invoice when you invoice the client: which hours, whether expenses go with them, and how the lines are written.',
        ...(deadlines ? ["Add each client's deadlines with their first day; set it Done when it is filed."] : []),
      ],
      auto: [
        ...(time ? ['A time entry takes the rate of its project, and is billable unless the project is non-billable.'] : []),
        `A project adds up ${time ? 'its hours, ' : ''}what is spent of its budget (of a retainer, this month's), what is left and what is not invoiced; at 80% its bar turns yellow, over it red.`,
        `Invoice ${toSales ? `adds an order to invoice in ${app.called('orders')} with the hours and expenses picked, then ` : paid ? `adds a payment of them to ${app.called('payments')}, then ` : ''}marks them invoiced.`,
        ...(deadlines ? ['A deadline takes how often it comes from its kind; when it is Done, the next one is added a month, a quarter or a year later.'] : []),
      ],
      work: ['Who takes on a project, and who agrees its budget.', 'When invoices go out.', ...(deadlines ? ['How far ahead of a deadline the work starts.'] : [])],
    });
  },
};
