import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, checkbox, currencyField, day, formula, inMain, link, nameField, number, PERCENT, person, rollup, select, text } from '../pieces';
import { byDueDay, companies, people } from '../shared';
import type { AppTemplate } from '../types';
import { clientRole } from './sales';
import { periodSpan } from './subscriptions';

// Consulting: clients and engagements (design/more-apps.md 3.7). Each engagement is paid fixed, by
// the hour or as a retainer, with a budget of hours and money; what is delivered, the hours and
// the expenses go on it, and Bill gathers what is not billed yet. Accounting and law firms keep
// their clients' filings that come again and again as deadlines, the next one written when one is
// done. Time entries are one piece with Project management's; Expenses with Budget's.

const MODELS = ['Fixed', 'Hourly', 'Retainer'];
const DEADLINES = ['VAT return monthly', 'Annual accounts yearly'];

/** A deadline as the list says it: its name, and how often it comes from a word in it; monthly when it says none. */
export function deadlineOf(item: string): { name: string; repeats: string } {
  const words = item.trim();
  const repeats = /\b(year|yearly|annual|annually)\b/i.test(words) ? 'Yearly' : /\b(quarter|quarterly)\b/i.test(words) ? 'Quarterly' : 'Monthly';
  const name = words.replace(/\s*\b(monthly|quarterly|yearly|annually)\b\s*/i, ' ').trim();
  return { name: name || words, repeats };
}

export const consulting: AppTemplate = {
  id: 'consulting',
  version: 1,
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
    { key: 'payments', kind: 'yesno', label: 'apps.consulting.payments', default: true, when: ({ chosen }) => chosen.has('budget'), because: 'budget' },
  ],
  money: () => true,
  pieces: (answers, app) => [
    clientRole(app, answers),
    'engagements',
    'deliverables',
    ...(answers.time !== false ? ['time-entries'] : []),
    'expenses',
    ...(answers.deadlines === true ? ['deadlines'] : []),
  ],
  names: (answers): { [role: string]: { name: string; singular?: string; about: string } } => ({
    ...(answers.time !== false && { 'time-entries': { name: 'Time entries', singular: 'time entry', about: 'the hours spent on each engagement or project, and whether they are billed.' } }),
    expenses: { name: 'Expenses', singular: 'expense', about: 'what was spent, on an engagement or by a person, and whether it is billed or paid back.' },
  }),
  build(app, answers) {
    const listed = (answers.models as string[] | undefined) ?? [];
    const models = listed.length > 0 ? listed : MODELS;
    const time = answers.time !== false;
    const deadlines = answers.deadlines === true;
    const paid = app.has('budget') && app.hasPiece('payments') && answers.payments !== false;
    const client = clientRole(app, answers);
    const jobs = app.path('engagements');
    const main = app.format(false);
    const own = app.format(true);
    const spent = app.path('expenses');
    companies(app);
    people(app);

    app.field('engagements', nameField());
    app.field('engagements', link('client', 'Client', app.path(client)));
    app.field('engagements', text('type', 'Type'));
    app.field('engagements', select('fee_model', 'Fee', models, { Fixed: 'blue', Hourly: 'teal', Retainer: 'purple' }, models[0]));
    if (app.money.multi) app.field('engagements', currencyField(app));
    if (models.includes('Hourly') || time) app.field('engagements', number('rate', 'Hourly rate', { format: own }));
    if (models.includes('Fixed') || models.includes('Retainer')) app.field('engagements', number('fee', models.includes('Retainer') && !models.includes('Fixed') ? 'Fee a month' : 'Fee', { format: own }));
    if (time) app.field('engagements', number('budget_hours', 'Budget hours'));
    app.field('engagements', number('budget', 'Budget', { format: own }));
    app.field('engagements', day('start', 'Start', true));
    app.field('engagements', day('end', 'End'));
    app.field('engagements', select('status', 'Status', ['Proposal', 'Active', 'On hold', 'Done'], { Proposal: 'gray', Active: 'blue', 'On hold': 'yellow', Done: 'green' }, 'Proposal'));
    app.field('engagements', person('owner', 'Owner', true));
    if (time) {
      const hours = app.path('time-entries');
      app.field('engagements', rollup('hours', 'Hours', hours, 'sum', 'hours'));
      app.field('engagements', rollup('time_amount', 'Time', hours, 'sum', 'amount', undefined, own));
      app.field('engagements', rollup('unbilled_time', 'Time not billed', hours, 'sum', 'amount', [{ field: 'billable', op: 'true' }, { field: 'billed', op: 'false' }], own));
    }
    app.field('engagements', rollup('expense_amount', 'Expenses', spent, 'sum', 'amount', undefined, own));
    app.field('engagements', rollup('unbilled_expenses', 'Expenses not billed', spent, 'sum', 'amount', [{ field: 'billable', op: 'true' }, { field: 'billed', op: 'false' }], own));
    app.field('engagements', formula('unbilled', 'Not billed', time ? 'unbilled_time + unbilled_expenses' : 'unbilled_expenses', own));
    // How much of its budget is used: of its money when it has one, else of its hours.
    const usedMoney = time ? 'time_amount + expense_amount' : 'expense_amount';
    app.field('engagements', formula('used', 'Budget used', time ? `budget > 0 ? (${usedMoney}) / budget : budget_hours > 0 ? hours / budget_hours : 0` : `budget > 0 ? ${usedMoney} / budget : 0`, PERCENT));
    app.rule('engagements', { kind: 'check', name: 'Over its budget', src: 'check("budget", () => used <= 1, `Over its budget: ${text(round(used * 100))}% used`)' });
    app.block(client, { block: 'linked', collection: jobs, style: 'list', fields: ['status', 'unbilled'], sort: 'start' });

    app.field('deliverables', nameField());
    app.field('deliverables', { ...link('engagement', 'Engagement', jobs), required: true });
    app.field('deliverables', person('owner', 'Owner', true));
    app.field('deliverables', day('due', 'Due'));
    app.field('deliverables', select('status', 'Status', ['To do', 'In progress', 'Delivered'], { 'To do': 'gray', 'In progress': 'blue', Delivered: 'green' }, 'To do'));
    app.view('deliverables', calendar({ start: 'due', color: 'status', upcoming: true }, [{ field: 'status', op: 'is-not', value: ['Delivered'] }]));
    app.block('engagements', { block: 'linked', collection: app.path('deliverables'), style: 'list', fields: ['due', 'status'], sort: 'due' });

    if (time) {
      const hours = app.path('time-entries');
      app.field('time-entries', nameField('Note'));
      app.field('time-entries', link('engagement', 'Engagement', jobs));
      app.field('time-entries', person('person', 'Person', true));
      app.field('time-entries', day('date', 'Date', true));
      app.field('time-entries', number('hours', 'Hours', { required: true }));
      app.field('time-entries', checkbox('billable', 'Billable', true));
      app.field('time-entries', number('rate', 'Rate', { format: own }));
      if (app.money.multi) app.field('time-entries', currencyField(app));
      app.field('time-entries', formula('amount', 'Amount', 'hours * (rate || 0)', own));
      app.field('time-entries', checkbox('billed', 'Billed'));
      app.rule('time-entries', {
        kind: 'onSave',
        name: 'Rate of the engagement',
        src: `onSave("Rate of the engagement", () => {
  if (!empty(engagement) && empty(rate)) rate = engagement.rate${app.money.multi ? '\n  if (!empty(engagement) && empty(currency)) currency = engagement.currency' : ''}
})`,
      });
      app.block('engagements', { block: 'linked', collection: hours, style: 'table', fields: ['date', 'person', 'hours', 'amount', 'billed'], sort: 'date', sums: true });
      app.rule('engagements', {
        kind: 'action',
        name: 'Log time',
        src: `action("Log time", {
  ask: {
    hours: { label: "Hours", type: "number", required: true },
    note: { label: "What was done", type: "text" },
    date: { label: "Day", type: "date", default: () => today(), required: true },
  },
}, () => {
  add("${app.called('time-entries')}", { name: empty(input.note) ? "Work" : input.note, engagement: this, hours: input.hours, date: input.date, billable: fee_model == "Hourly", rate: rate })
})`,
      });
    }

    app.field('expenses', nameField('Title'));
    app.field('expenses', link('engagement', 'Engagement', jobs));
    app.field('expenses', day('date', 'Date', true));
    app.field('expenses', number('amount', 'Amount', { required: true, format: own }));
    if (app.money.multi) app.field('expenses', currencyField(app));
    app.field('expenses', checkbox('billable', 'Billable', true));
    app.field('expenses', checkbox('billed', 'Billed'));
    app.block('engagements', { block: 'linked', collection: spent, style: 'table', fields: ['date', 'amount', 'billed'], sort: 'date', sums: true });

    const marks = [...(time ? [`  for (const e of linked("${app.called('time-entries')}").filter((e) => e.billable && !e.billed)) update(e, { billed: true })`] : []), `  for (const e of linked("${app.called('expenses')}").filter((e) => e.billable && !e.billed)) update(e, { billed: true })`];
    const payment = paid
      ? `\n  add("${app.called('payments')}", { name: name + " · " + text(today()), direction: "In", amount: unbilled, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: today() + 30' : ''}, budget_line: find("${app.called('budget-lines')}", { name: "Consulting" })[0] })`
      : '';
    app.rule('engagements', {
      kind: 'action',
      name: 'Bill',
      src: `action("Bill", { when: () => unbilled > 0, hint: "Nothing is left to bill", say: () => "Bill " + text(unbilled) + " of " + name, confirm: true }, () => {${payment}
${marks.join('\n')}
})`,
    });
    if (paid) {
      app.record('budget-lines', { name: 'Consulting', type: 'Income' });
      app.field('payments', link('engagement', 'Engagement', jobs));
      app.block('engagements', { block: 'linked', collection: app.path('payments'), style: 'list', fields: ['amount', 'status'] });
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
      app.block(client, { block: 'linked', collection: app.path('deadlines'), style: 'list', fields: ['due', 'status'], sort: 'due' });
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
    app.about({
      title: 'Consulting',
      what: `Your clients and the work you do for them: each engagement${models.length > 0 ? `, ${models.map((m) => m.toLowerCase()).join(', ')}` : ''}, what is delivered${time ? ', the hours' : ''} and the expenses, and what is billed${deadlines ? `; and what is due for each client again and again${kindsText.length > 0 ? `: ${kindsText.join(', ')}` : ''}` : ''}.`,
      pieces: ['engagements', 'deliverables', ...(time ? ['time-entries'] : []), 'expenses', ...(deadlines ? ['deadlines'] : []), client],
      glance: [
        'Deliverables in Today and Upcoming',
        ...(time ? ['Log time on each engagement'] : []),
        'Bill gathers what is not billed yet',
        'Over its budget is marked',
        ...(deadlines ? ['A deadline done writes the next one'] : []),
        ...(paid ? ['A bill is written as a payment'] : []),
      ],
      how: [
        `Add an engagement for a client: how it is paid${time ? ', its hourly rate' : ''}, its budget and its dates.`,
        'Add what is to be delivered, with whom and by when.',
        ...(time ? ['Press Log time on it when you work on it, or add time entries.'] : []),
        'Add the expenses of the engagement; untick Billable for the ones the client does not pay.',
        'Press Bill when you send the invoice.',
        ...(deadlines ? ["Add each client's deadlines with their first day; press Done, or set it Done, when it is filed."] : []),
      ],
      auto: [
        ...(time ? ['A time entry takes the rate of its engagement; Log time is billable when the engagement is paid by the hour.'] : []),
        `An engagement adds up its ${time ? 'hours, its time, ' : ''}expenses and what is not billed yet, and how much of its budget is used${time ? ', of its money, else of its hours' : ''}; one over its budget is marked.`,
        `Bill asks first, then marks the billable ${time ? 'time and ' : ''}expenses billed${paid ? `, and adds a payment of them to ${app.called('payments')} under the Consulting budget line` : ''}.`,
        ...(deadlines ? ['A deadline takes how often it comes from its kind; when it is Done, the next one is added a month, a quarter or a year later.'] : []),
      ],
      work: ['Who takes on an engagement, and who agrees its budget.', 'When invoices go out.', ...(deadlines ? ['How far ahead of a deadline the work starts.'] : [])],
    });
  },
};
