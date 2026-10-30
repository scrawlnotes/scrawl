import type { Condition } from '../../collection';
import { calendar, checkbox, currencyField, day, formula, inMain, link, nameField, number, type PieceInfo, rollup, select, symbolOf, text } from '../pieces';
import { byDueDay, companies, people } from '../shared';
import type { AppTemplate } from '../types';
import { clientRole, customerRole } from './sales';

// Subscriptions and memberships (design/more-apps.md 3.1), as Chargebee and Baremetrics keep them:
// MRR over the list, what renews this week and what is past due; a subscription's window says what
// it brings a month and since when, and its history, a plan changed, renewed, paused. Renew writes
// the renewal as an order to invoice with Sales, else as a payment with Budget, and comes to Today
// on its day, by itself for one paid by card; Change plan now or at the renewal; Pause until a day;
// Cancel now or at the end of its term, with why. A software subscription, a gym's memberships and
// a maintenance agreement are the same pieces, named as the answer says.

const PLANS = ['Basic monthly', 'Pro monthly', 'Pro yearly'];
const PERIODS = ['Monthly', 'Quarterly', 'Yearly'];
const REASONS = ['Too expensive', 'Not using it', 'Missing feature', 'Switched', 'Closed', 'Other'];
const KINDS = ['New', 'Trial', 'Renewed', 'Upgrade', 'Downgrade', 'Paused', 'Resumed', 'Cancelled', 'Reactivated'];

/** A plan as the list says it: its name, and its period from a word in it; monthly when it says none. */
export function planOf(item: string): { name: string; period: string } {
  const name = item.trim();
  const period = /\b(year|yearly|annual|annually)\b/i.test(name) ? 'Yearly' : /\b(quarter|quarterly)\b/i.test(name) ? 'Quarterly' : 'Monthly';
  return { name, period };
}

/** A period as a span a rule adds to a day: `renews + months(3)`. */
export const periodSpan = (field: string) => `(${field} == "Yearly" ? years(1) : ${field} == "Quarterly" ? months(3) : months(1))`;

/** The months in a period, as a formula divides by them. */
const periodMonths = (field: string) => `(${field} == "Yearly" ? 12 : ${field} == "Quarterly" ? 3 : 1)`;

/** A period as a price says it: "a year", "a quarter", "a month". */
const periodWord = (field: string) => `(${field} == "Yearly" ? "year" : ${field} == "Quarterly" ? "quarter" : "month")`;

/** A day as a subscription says it: "Mar 3". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;

/** The words the answer gives: what one who pays is called, and one of their subscriptions and many. */
const WORDS: { [sells: string]: { customer: string; one: string; plural: string } } = {
  subscriptions: { customer: 'Customer', one: 'subscription', plural: 'subscriptions' },
  memberships: { customer: 'Member', one: 'membership', plural: 'memberships' },
  agreements: { customer: 'Customer', one: 'service agreement', plural: 'agreements' },
};

export const subscriptions: AppTemplate = {
  id: 'subscriptions',
  version: 2,
  group: 'money',
  name: 'apps.subscriptions.name',
  short: 'apps.subscriptions.short',
  icon: 'restore',
  what: 'apps.subscriptions.what',
  questions: [
    {
      key: 'sells',
      kind: 'choice',
      label: 'apps.subscriptions.sells',
      options: [
        { value: 'subscriptions', label: 'apps.subscriptions.sells.subscriptions' },
        { value: 'memberships', label: 'apps.subscriptions.sells.memberships' },
        { value: 'agreements', label: 'apps.subscriptions.sells.agreements' },
      ],
      default: 'subscriptions',
      help: 'apps.subscriptions.sellsHelp',
    },
    { key: 'plans', kind: 'list', label: 'apps.subscriptions.plans', default: PLANS, help: 'apps.subscriptions.plansHelp', add: 'apps.subscriptions.addPlan' },
    { key: 'trial', kind: 'yesno', label: 'apps.subscriptions.trial', default: false, help: 'apps.subscriptions.trialHelp' },
    {
      key: 'customers',
      kind: 'choice',
      label: 'apps.subscriptions.customers',
      options: [
        { value: 'companies', label: 'apps.subscriptions.customers.companies' },
        { value: 'people', label: 'apps.subscriptions.customers.people' },
      ],
      default: 'companies',
      when: ({ chosen }) => !chosen.has('crm'),
    },
    { key: 'payments', kind: 'yesno', label: 'apps.subscriptions.payments', default: true, when: ({ chosen }) => chosen.has('budget') && !chosen.has('sales'), because: 'budget' },
  ],
  money: () => true,
  pieces: (answers, app) => ['plans', 'subscriptions', 'subscription-events', clientRole(app, answers)],
  names: (answers): { [role: string]: Pick<PieceInfo, 'name' | 'singular' | 'about'> } => {
    if (answers.sells === 'memberships') return { subscriptions: { name: 'Memberships', singular: 'membership', about: 'who is a member on which plan, from when, and when it renews.' } };
    if (answers.sells === 'agreements') return { subscriptions: { name: 'Service agreements', singular: 'agreement', about: 'each service agreement: with whom, on which plan, from when, and when it renews.' } };
    return {};
  },
  menu: [{ role: 'subscriptions', view: 'active', name: 'Subscriptions' }, 'plans', 'companies', 'people'],
  build(app, answers) {
    const words = WORDS[answers.sells as string] ?? WORDS.subscriptions!;
    const trial = answers.trial === true;
    const customer = clientRole(app, answers);
    // A renewal is an order to invoice when Sales keeps the same customers; else a payment with Budget.
    const toSales = app.has('sales') && app.hasPiece('orders') && customerRole(app) === customer;
    const paid = !toSales && app.has('budget') && app.hasPiece('payments') && answers.payments !== false;
    const subs = app.path('subscriptions');
    const called = app.called('subscriptions');
    const events = app.called('subscription-events');
    const main = app.format(false);
    const own = app.format(true);
    const span = periodSpan('period');
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    const live = ['Active', 'Non-renewing'];
    const statuses = [...(trial ? ['Trial'] : []), 'Active', 'Non-renewing', 'Paused', 'Cancelled'];
    const isLive: Condition = { field: 'status', op: 'is', value: live };
    const cancel = `Cancel ${words.one}`;
    companies(app);
    people(app);

    app.field('plans', nameField());
    app.field('plans', select('period', 'Period', PERIODS, {}, 'Monthly'));
    app.field('plans', number('price', 'Price', { format: main }));
    if (trial) app.field('plans', number('trial_days', 'Trial days', { default: 14 }));
    app.field('plans', rollup('active', 'Active', subs, 'count', undefined, [isLive]));
    app.field('plans', rollup('monthly_value', 'MRR', subs, 'sum', 'monthly_value', [isLive, ...inMain(app)], main));
    app.tableColumns('plans', ['period', 'price', 'active', 'monthly_value']);
    app.block('plans', { block: 'linked', collection: subs, style: 'list', title: called, fields: ['status', 'when_said'], sort: 'renews' });
    for (const item of (answers.plans as string[] | undefined) ?? PLANS) if (item.trim()) app.record('plans', planOf(item));

    app.field('subscriptions', { ...nameField(), optional: true, help: `Left empty, the ${words.customer.toLowerCase()}'s name` });
    app.field('subscriptions', link('customer', words.customer, app.path(customer)));
    app.field('subscriptions', { ...link('plan', 'Plan', app.path('plans')), chips: true });
    app.field('subscriptions', select('status', 'Status', statuses, { Trial: 'blue', Active: 'green', 'Non-renewing': 'yellow', Paused: 'gray', Cancelled: 'red' }, statuses[0]));
    app.field('subscriptions', { ...number('amount', 'Amount', { format: own }), help: "Left empty, the plan's price" });
    if (app.money.multi) app.field('subscriptions', currencyField(app));
    app.field('subscriptions', select('period', 'Period', PERIODS));
    app.field('subscriptions', day('start', 'Started', true));
    app.field('subscriptions', { ...day('renews', 'Renews on'), help: 'Left empty, a period after it started' });
    app.field('subscriptions', { ...checkbox('auto', 'Renews by itself'), help: 'Paid by card or direct debit: renewed on its day' });
    app.field('subscriptions', { ...day('paused_until', 'Paused until'), when: [{ field: 'status', op: 'is', value: ['Paused'] }] });
    app.field('subscriptions', { ...link('next_plan', 'Plan at renewal', app.path('plans')), when: [{ field: 'next_plan', op: 'not-empty' }] });
    app.field('subscriptions', { ...day('cancelled_on', 'Cancelled on'), when: [{ field: 'status', op: 'is', value: ['Non-renewing', 'Cancelled'] }] });
    app.field('subscriptions', { ...select('reason', 'Why cancelled', REASONS), when: [{ field: 'status', op: 'is', value: ['Non-renewing', 'Cancelled'] }] });
    app.field('subscriptions', formula('monthly_value', 'MRR', `amount / ${periodMonths('period')}`, own));
    app.field('subscriptions', formula('past_due', 'Past due', 'status == "Active" && !empty(renews) && renews < today()'));
    app.field('subscriptions', formula('new_month', 'New this month', '!empty(start) && month(start) == month(today()) && year(start) == year(today()) && (status == "Active" || status == "Non-renewing")'));
    app.field('subscriptions', formula('lost_month', 'Lost this month', 'status == "Cancelled" && !empty(cancelled_on) && month(cancelled_on) == month(today()) && year(cancelled_on) == year(today())'));
    app.field('subscriptions', formula('this_week', 'This week', '(status == "Active" || status == "Trial") && !empty(renews) && renews >= today() && renews <= today() + 7'));
    app.field('subscriptions', formula('amount_said', 'Price', `${money('amount')} + " / " + ${periodWord('period')}`));
    // What its row says of its day: "Renews Mar 3", "Past due 5 days", "Ends Nov 30", "Trial ends Nov 2".
    app.field(
      'subscriptions',
      formula(
        'when_said',
        'When',
        `empty(renews) ? "" : past_due ? "Past due " + text(today() - renews) + (today() - renews == 1 ? " day" : " days") : status == "Trial" ? "Trial ends " + ${short('renews')} : status == "Non-renewing" ? "Ends " + ${short('renews')} : status == "Paused" ? (empty(paused_until) ? "Paused" : "Paused until " + ${short('paused_until')}) : status == "Cancelled" ? (empty(cancelled_on) ? "Cancelled" : "Cancelled " + ${short('cancelled_on')}) : "Renews " + ${short('renews')}`,
      ),
    );
    // Its window's line: "Active · $588 a year ($49 MRR) · renews Mar 3 · customer since Jan 2025".
    app.field(
      'subscriptions',
      formula(
        'said',
        'Says',
        `status + (empty(amount) ? "" : " · " + ${money('amount')} + " a " + ${periodWord('period')} + " (" + ${money('monthly_value')} + " MRR)") + (when_said == "" ? "" : " · " + when_said) + (empty(start) ? "" : " · ${words.customer.toLowerCase()} since " + monthname(start) + " " + text(year(start)))`,
      ),
    );
    app.head('subscriptions', 'said');
    app.formOrder('subscriptions', ['customer', 'plan', 'amount', 'period', ...(app.money.multi ? ['currency'] : []), 'start', 'renews', 'auto']);
    app.newForm('subscriptions', ['customer', 'plan', 'start', 'auto']);
    app.block('subscriptions', { block: 'actions', column: 1 });
    app.block('subscriptions', { block: 'linked', collection: app.path('subscription-events'), style: 'timeline', title: 'History', sort: 'day', fixed: true, column: 2 });

    app.field('subscription-events', nameField('What'));
    app.field('subscription-events', link('subscription', words.one[0]!.toUpperCase() + words.one.slice(1), subs));
    app.field('subscription-events', select('kind', 'Kind', KINDS, { New: 'green', Trial: 'blue', Renewed: 'green', Upgrade: 'blue', Downgrade: 'orange', Paused: 'gray', Resumed: 'green', Cancelled: 'red', Reactivated: 'green' }));
    app.field('subscription-events', day('day', 'Day', true));
    app.field('subscription-events', number('mrr_change', 'MRR change', { format: main }));
    app.field('subscription-events', select('reason', 'Why', REASONS));
    app.field('subscription-events', text('note', 'Note'));
    app.field('subscription-events', formula('this_month', 'This month', '!empty(day) && month(day) == month(today()) && year(day) == year(today())'));

    // What happens to one is written in its history, with what it changes of the MRR.
    const event = (kind: string, said: string, change: string, extra = '') => `add("${events}", { name: ${said}, subscription: this, kind: ${kind}, day: today(), mrr_change: ${change}${extra} })`;
    app.rule('subscriptions', {
      kind: 'onSave',
      name: 'From the plan',
      src: `onSave("From the plan", () => {
  if (!empty(plan)) {
    if (empty(amount)) amount = plan.price
    if (empty(period)) period = plan.period
  }
  if (empty(name) && !empty(customer)) name = customer.name
  if (empty(renews) && !empty(start)) {
    ${trial ? `if (status == "Trial") renews = start + (empty(plan) || empty(plan.trial_days) ? 14 : plan.trial_days)\n    else renews = start + ${span}` : `renews = start + ${span}`}
  }
  if (empty(old.status) && !empty(status)) {
    ${event('status == "Trial" ? "Trial" : "New"', `(status == "Trial" ? "Trial · " : "Started · ") + (empty(plan) ? "" : plan.name)`, 'status == "Trial" ? 0 : monthly_value')}
  }
})`,
    });

    const renewal = toSales
      ? `
  const made = add("${app.called('orders')}", { customer: customer, status: "Delivered", subscription: this${app.money.multi ? ', currency: currency' : ''} })
  add("${app.called('order-lines')}", { order: made, name: (empty(plan) ? name : plan.name) + " · " + ${short('(empty(renews) ? today() : renews)')}, quantity: 1, unit_price: amount })`
      : paid
        ? `
  add("${app.called('payments')}", { name: name + " · " + text(empty(renews) ? today() : renews), direction: "In", amount: amount, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: empty(renews) ? today() : renews' : ''}, budget_line: find("${app.called('budget-lines')}", { name: "${called}" })[0], subscription: this })`
        : '';
    app.rule('subscriptions', {
      kind: 'action',
      name: 'Renew',
      src: `action("Renew", { when: () => status == "Active", hint: "", done: () => name + " · renewed to " + ${short('renews')} }, () => {
  if (!empty(next_plan)) {
    const was = monthly_value
    plan = next_plan
    amount = next_plan.price
    period = next_plan.period
    next_plan = null
    ${event(`amount / ${periodMonths('period')} >= was ? "Upgrade" : "Downgrade"`, '"Now " + plan.name', `amount / ${periodMonths('period')} - was`)}
  }${renewal}
  ${event('"Renewed"', `"Renewed · " + ${money('amount')}`, '0')}
  renews = (empty(renews) ? today() : renews) + ${span}
})`,
    });
    if (trial) {
      app.rule('subscriptions', {
        kind: 'action',
        name: 'Convert',
        src: `action("Convert", { when: () => status == "Trial", hint: "", done: () => name + " · now a paying one" }, () => {
  status = "Active"
  renews = today() + ${span}
  ${event('"New"', `"Converted · " + (empty(plan) ? "" : plan.name)`, 'monthly_value')}
})`,
      });
    }
    app.rule('subscriptions', {
      kind: 'action',
      name: 'Change plan',
      src: `action("Change plan", {
  when: () => status == "Active" || status == "Trial",
  hint: "",
  ask: {
    to: { label: "New plan", type: "link", collection: "${app.called('plans')}", chips: true, required: true },
    from: { label: "From", type: "choice", options: ["Now", "At renewal"], chips: true, default: "At renewal", note: () => empty(input.to) || empty(input.to.price) ? "" : ${money('input.to.price')} + " a " + ${periodWord('input.to.period')} + " · MRR " + ${money('monthly_value')} + " → " + ${money(`input.to.price / ${periodMonths('input.to.period')}`)} },
  },
  done: () => name + " · plan changed",
}, () => {
  if (input.from == "Now") {
    const was = monthly_value
    plan = input.to
    amount = input.to.price
    period = input.to.period
    next_plan = null
    add("${events}", { name: "Now " + input.to.name, subscription: this, kind: input.to.price / ${periodMonths('input.to.period')} >= was ? "Upgrade" : "Downgrade", day: today(), mrr_change: input.to.price / ${periodMonths('input.to.period')} - was })
  } else {
    next_plan = input.to
  }
})`,
    });
    app.rule('subscriptions', {
      kind: 'action',
      name: 'Pause',
      src: `action("Pause", {
  when: () => status == "Active",
  hint: "",
  ask: { until: { label: "Until", type: "date", note: () => "Left empty, until you resume it." } },
  done: () => name + " · paused",
}, () => {
  status = "Paused"
  paused_until = input.until
  ${event('"Paused"', '"Paused" + (empty(input.until) ? "" : " until " + ' + short('input.until') + ')', '0 - monthly_value')}
})`,
    });
    app.rule('subscriptions', {
      kind: 'action',
      name: 'Resume',
      src: `action("Resume", { when: () => status == "Paused", hint: "", done: () => name + " · resumed" }, () => {
  status = "Active"
  paused_until = null
  if (!empty(renews) && renews < today()) renews = today()
  ${event('"Resumed"', '"Resumed"', 'monthly_value')}
})`,
    });
    app.rule('subscriptions', {
      kind: 'action',
      name: cancel,
      src: `action("${cancel}", {
  when: () => status != "Cancelled" && status != "Non-renewing",
  hint: "",
  ask: {
    when: { label: "When", type: "choice", options: ["Now", "At end of term"], chips: true, default: "At end of term", note: () => input.when == "Now" ? "It ends today." : "It stays until " + (empty(renews) ? "its renewal" : ${short('renews')}) + ", Non-renewing; then Cancelled." },
    why: { label: "Why", type: "choice", options: ${JSON.stringify(REASONS)}, chips: true },
    note: { label: "Note", type: "text" },
  },
  done: () => name + (status == "Cancelled" ? " · cancelled" : " · ends " + ${short('renews')}),
}, () => {
  reason = input.why
  if (input.when == "Now" || status == "Trial" || status == "Paused" || empty(renews)) {
    ${event('"Cancelled"', '"Cancelled"', 'status == "Paused" || status == "Trial" ? 0 : 0 - monthly_value', ', reason: input.why, note: input.note')}
    status = "Cancelled"
    cancelled_on = today()
  } else {
    status = "Non-renewing"
    cancelled_on = renews
  }
})`,
    });
    app.rule('subscriptions', {
      kind: 'action',
      name: 'End',
      src: `action("End", { when: () => status == "Non-renewing", hint: "", done: () => name + " · ended" }, () => {
  ${event('"Cancelled"', '"Cancelled · end of term"', '0 - monthly_value', ', reason: reason')}
  status = "Cancelled"
})`,
    });
    app.rule('subscriptions', {
      kind: 'action',
      name: 'Reactivate',
      src: `action("Reactivate", { when: () => status == "Cancelled" || status == "Non-renewing", hint: "", done: () => name + " · active again" }, () => {
  if (status == "Cancelled") {
    ${event('"Reactivated"', '"Reactivated"', 'monthly_value')}
    if (empty(renews) || renews < today()) renews = today() + ${span}
  }
  status = "Active"
  cancelled_on = null
  reason = null
})`,
    });

    // The tabs, Chargebee's; over them the MRR, what is active, what renews this week and what is past due.
    const sums = [
      { label: 'MRR', field: 'monthly_value', conditions: [isLive] },
      { label: 'active', conditions: [isLive] },
      { label: 'renewing this week', conditions: [{ field: 'this_week', op: 'true' as const }] },
      { label: 'past due', conditions: [{ field: 'past_due', op: 'true' as const }], warn: true as const },
    ];
    const columns = ['plan', 'status', 'amount_said', 'when_said'];
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('subscriptions', { id, name, conditions, sort: { key: 'renews', dir: 'asc' }, columns, sums, set: 'subscriptions' }, id === 'active');
    tab('active', 'Active', [isLive]);
    if (trial) tab('trial', 'Trial', [{ field: 'status', op: 'is', value: ['Trial'] }]);
    tab('past-due', 'Past due', [{ field: 'past_due', op: 'true' }]);
    tab('paused', 'Paused', [{ field: 'status', op: 'is', value: ['Paused'] }]);
    tab('cancelled', 'Cancelled', [{ field: 'status', op: 'is', value: ['Cancelled'] }]);
    // In Today on their day: a renewal with Renew, by itself when it is paid by card; a trial ending with Convert; a pause ending with Resume; a term ending, by itself.
    app.view('subscriptions', { ...calendar({ start: 'renews', color: 'plan', upcoming: true, button: 'Renew', auto: 'auto', words: ['customer', 'amount_said'] }, [{ field: 'status', op: 'is', value: ['Active'] }]), id: 'renewals', name: 'Renewals', hidden: true });
    if (trial) app.view('subscriptions', { ...calendar({ start: 'renews', color: 'plan', upcoming: true, button: 'Convert', words: ['customer', 'amount_said'] }, [{ field: 'status', op: 'is', value: ['Trial'] }]), id: 'trials', name: 'Trials ending', hidden: true });
    app.view('subscriptions', { ...calendar({ start: 'paused_until', color: 'plan', upcoming: true, button: 'Resume', words: ['customer'] }, [{ field: 'status', op: 'is', value: ['Paused'] }]), id: 'pauses', name: 'Pauses ending', hidden: true });
    app.field('subscriptions', formula('ending', 'Ending', 'status == "Non-renewing"'));
    app.view('subscriptions', { ...calendar({ start: 'renews', color: 'plan', upcoming: false, button: 'End', auto: 'ending' }, [{ field: 'status', op: 'is', value: ['Non-renewing'] }]), id: 'ends', name: 'Ending', hidden: true });
    app.view('subscriptions', { id: 'week', name: 'Renewing this week', conditions: [{ field: 'this_week', op: 'true' }], sort: { key: 'renews', dir: 'asc' }, hidden: true });

    app.view('subscription-events', { id: 'month', name: 'This month', conditions: [{ field: 'this_month', op: 'true' }], sort: { key: 'day', dir: 'desc' }, hidden: true });
    app.homeTile('subscriptions', { off: true });
    app.homeTile('plans', { off: true });
    app.homeTile('subscription-events', { off: true });
    // Home, Baremetrics': the MRR, what came and went this month; the renewals of the week; who left and why.
    app.view('subscriptions', { id: 'all', name: 'All', conditions: [], sort: { key: 'renews', dir: 'asc' }, hidden: true });
    app.homeTiles('subscriptions', [
      {
        view: 'all',
        title: 'MRR',
        head: [{ label: '', field: 'monthly_value', conditions: [isLive] }],
        lines: [
          { label: 'New this month', field: 'monthly_value', conditions: [{ field: 'new_month', op: 'true' }] },
          { label: 'Cancelled this month', field: 'monthly_value', conditions: [{ field: 'lost_month', op: 'true' }], warn: true },
          { label: 'Past due', field: 'monthly_value', conditions: [{ field: 'past_due', op: 'true' }], warn: true },
        ],
      },
      { view: 'week', title: 'Renewals', head: [{ label: 'this week' }], value: 'when_said', sub: 'customer', empty: 'Nothing renews this week.' },
      { view: 'cancelled', title: 'Churn', lines: [{ label: 'Cancelled', conditions: [{ field: 'status', op: 'is', value: ['Cancelled'] }] }, { label: 'Most said', by: 'reason' }, { label: 'Past due', conditions: [{ field: 'past_due', op: 'true' }], warn: true }], empty: 'Nobody has left.' },
    ]);

    app.field(customer, rollup(`active_${words.plural}`, `Active ${words.plural}`, subs, 'count', undefined, [isLive]));
    app.field(customer, rollup('monthly_value', 'MRR', subs, 'sum', 'monthly_value', [isLive, ...inMain(app)], main));
    app.block(customer, { block: 'linked', collection: subs, style: 'list', title: called, fields: ['status', 'when_said'], sort: 'renews', add: words.one[0]!.toUpperCase() + words.one.slice(1), column: 3 });

    if (toSales) {
      app.field('orders', link('subscription', words.one[0]!.toUpperCase() + words.one.slice(1), subs));
      app.block('subscriptions', { block: 'linked', collection: app.path('orders'), style: 'list', title: 'Invoices', fields: ['state', 'total'], sort: 'date', dir: 'desc', fixed: true, column: 2 });
    }
    if (paid) {
      app.record('budget-lines', { name: called, type: 'Income' });
      app.field('payments', link('subscription', 'For', subs));
      app.block('subscriptions', { block: 'linked', collection: app.path('payments'), style: 'list', title: 'Payments', fields: ['amount', 'status'], fixed: true, column: 2 });
    }

    const planNames = ((answers.plans as string[] | undefined) ?? PLANS).map((p) => p.trim()).filter(Boolean);
    const who = words.customer === 'Member' ? 'member' : 'customer';
    app.about({
      title: 'Subscriptions and memberships',
      what: `What you sell by the month or the year${planNames.length > 0 ? `: ${planNames.join(', ')}` : ''}; who is on each plan, when each renews, and what comes in each month.`,
      pieces: ['plans', 'subscriptions', customer],
      glance: ['Over the list, the MRR and what is past due', 'A renewal comes to Today with Renew, by itself when paid by card', `Change plan, Pause, ${cancel} at the end of its term`, ...(toSales ? ['A renewal is an order to invoice'] : paid ? ['A renewal is written as a payment'] : [])],
      how: [
        'Write each plan with its period and its price.',
        `Add a ${words.one} for each ${who}: their plan and the day it starts; the rest comes from the plan. Tick Renews by itself when it is paid by card.`,
        `Press Renew when a period is paid${trial ? ', Convert when a trial becomes a paid one' : ''}; Change plan, now or at the renewal; Pause until a day; ${cancel} now or at the end of its term.`,
      ],
      auto: [
        `A new one takes its amount and its period from its plan, its name from the ${who}, and its renewal day a period after it starts${trial ? ", or when the plan's trial ends" : ''}.`,
        'Its MRR is its amount spread over the months of its period; each plan and each customer adds up the MRR of the active ones.',
        'Renew moves the renewal day a period on; one whose day has passed is Past due. One that renews by itself is renewed on its day.',
        'Cancelled at the end of its term, it stays Non-renewing until its renewal day and ends then.',
        'What happens to each, and what it changes of the MRR, is written in its history; Home adds up this month.',
        ...(toSales ? [`Renew adds an order to invoice in ${app.called('orders')} with its plan.`] : paid ? [`Renew writes what comes in as a payment in ${app.called('payments')}, under the ${called} budget line.`] : []),
      ],
      work: ['Who renews them, and when in the month.', 'What we do when a payment does not come.', `How a ${who} cancels, and how long before.`],
    });
  },
};
