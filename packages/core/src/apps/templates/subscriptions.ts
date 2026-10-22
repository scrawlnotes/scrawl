import { calendar, currencyField, day, formula, inMain, link, nameField, number, type PieceInfo, rollup, select, text } from '../pieces';
import { byDueDay, companies, people } from '../shared';
import type { AppTemplate } from '../types';
import { clientRole } from './sales';

// Subscriptions and memberships (design/more-apps.md 3.1): what is sold by the month or the year,
// who is on it and when each renews. A software subscription, a gym's memberships and a
// maintenance agreement are the same pieces, named as the answer says. Renew moves the renewal
// a period on; with Budget it writes what comes in as a payment.

const PLANS = ['Basic monthly', 'Pro monthly', 'Pro yearly'];
const PERIODS = ['Monthly', 'Quarterly', 'Yearly'];

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

/** The words the answer gives: what one who pays is called, and one of their subscriptions and many. */
const WORDS: { [sells: string]: { customer: string; one: string; plural: string } } = {
  subscriptions: { customer: 'Customer', one: 'subscription', plural: 'subscriptions' },
  memberships: { customer: 'Member', one: 'membership', plural: 'memberships' },
  agreements: { customer: 'Customer', one: 'service agreement', plural: 'agreements' },
};

export const subscriptions: AppTemplate = {
  id: 'subscriptions',
  version: 1,
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
    { key: 'payments', kind: 'yesno', label: 'apps.subscriptions.payments', default: true, when: ({ chosen }) => chosen.has('budget'), because: 'budget' },
  ],
  money: () => true,
  pieces: (answers, app) => ['plans', 'subscriptions', clientRole(app, answers)],
  names: (answers): { [role: string]: Pick<PieceInfo, 'name' | 'singular' | 'about'> } => {
    if (answers.sells === 'memberships') return { subscriptions: { name: 'Memberships', singular: 'membership', about: 'who is a member on which plan, from when, and when it renews.' } };
    if (answers.sells === 'agreements') return { subscriptions: { name: 'Service agreements', singular: 'agreement', about: 'each service agreement: with whom, on which plan, from when, and when it renews.' } };
    return {};
  },
  build(app, answers) {
    const words = WORDS[answers.sells as string] ?? WORDS.subscriptions!;
    const trial = answers.trial === true;
    const paid = app.has('budget') && app.hasPiece('payments') && answers.payments !== false;
    const customer = clientRole(app, answers);
    const subs = app.path('subscriptions');
    const called = app.called('subscriptions');
    const main = app.format(false);
    const own = app.format(true);
    const span = periodSpan('period');
    const running = trial ? ['Trial', 'Active'] : ['Active'];
    companies(app);
    people(app);

    app.field('plans', nameField());
    app.field('plans', select('period', 'Period', PERIODS, {}, 'Monthly'));
    app.field('plans', number('price', 'Price', { format: main }));
    if (trial) app.field('plans', number('trial_days', 'Trial days', { default: 14 }));
    app.field('plans', rollup('active', 'Active', subs, 'count', undefined, [{ field: 'status', op: 'is', value: ['Active'] }]));
    app.field('plans', rollup('monthly_value', 'Monthly value', subs, 'sum', 'monthly_value', [{ field: 'status', op: 'is', value: ['Active'] }, ...inMain(app)], main));
    app.block('plans', { block: 'linked', collection: subs, style: 'table', fields: ['customer', 'status', 'renews'], sort: 'renews' });
    for (const item of (answers.plans as string[] | undefined) ?? PLANS) if (item.trim()) app.record('plans', planOf(item));

    app.field('subscriptions', nameField());
    app.field('subscriptions', link('customer', words.customer, app.path(customer)));
    app.field('subscriptions', link('plan', 'Plan', app.path('plans')));
    app.field('subscriptions', select('status', 'Status', [...running, 'Paused', 'Cancelled'], { Trial: 'blue', Active: 'green', Paused: 'orange', Cancelled: 'gray' }, running[0]));
    app.field('subscriptions', number('amount', 'Amount', { format: own }));
    if (app.money.multi) app.field('subscriptions', currencyField(app));
    app.field('subscriptions', select('period', 'Period', PERIODS));
    app.field('subscriptions', day('start', 'Start', true));
    app.field('subscriptions', day('renews', 'Renews on'));
    app.field('subscriptions', formula('monthly_value', 'Monthly value', `amount / ${periodMonths('period')}`, own));
    app.field('subscriptions', day('cancelled_on', 'Cancelled on'));
    app.field('subscriptions', text('reason', 'Why cancelled'));
    app.view('subscriptions', { id: 'active', name: 'Active', conditions: [{ field: 'status', op: 'is', value: ['Active'] }], sort: { key: 'renews', dir: 'asc' } });
    app.view('subscriptions', { id: 'cancelled', name: 'Cancelled', conditions: [{ field: 'status', op: 'is', value: ['Cancelled'] }], sort: { key: 'cancelled_on', dir: 'desc' } });
    app.view('subscriptions', calendar({ start: 'renews', color: 'plan', upcoming: true }, [{ field: 'status', op: 'is', value: running }]));

    app.field(customer, rollup(`active_${words.plural}`, `Active ${words.plural}`, subs, 'count', undefined, [{ field: 'status', op: 'is', value: ['Active'] }]));
    app.field(customer, rollup('monthly_value', 'Monthly value', subs, 'sum', 'monthly_value', [{ field: 'status', op: 'is', value: ['Active'] }, ...inMain(app)], main));
    app.block(customer, { block: 'linked', collection: subs, style: 'list', fields: ['plan', 'status', 'renews'], sort: 'renews' });

    app.rule('subscriptions', {
      kind: 'onSave',
      name: 'From the plan',
      src: `onSave("From the plan", () => {
  if (!empty(plan)) {
    if (empty(amount)) amount = plan.price
    if (empty(period)) period = plan.period
  }
  if (empty(name) && !empty(customer)) name = empty(plan) ? customer.name : customer.name + " · " + plan.name
  if (empty(renews) && !empty(start)) {
    ${trial ? `if (status == "Trial") renews = start + (empty(plan) || empty(plan.trial_days) ? 14 : plan.trial_days)\n    else renews = start + ${span}` : `renews = start + ${span}`}
  }
})`,
    });
    const isRunning = running.map((s) => `status == "${s}"`).join(' || ');
    app.rule('subscriptions', { kind: 'check', name: 'The renewal day has passed', src: `check("renews", () => !(${isRunning}) || empty(renews) || renews >= today(), "The renewal day has passed: renew it, or cancel it")` });
    const payment = paid
      ? `\n  add("${app.called('payments')}", { name: name + " · " + text(empty(renews) ? today() : renews), direction: "In", amount: amount, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: empty(renews) ? today() : renews' : ''}, budget_line: find("${app.called('budget-lines')}", { name: "${called}" })[0] })`
      : '';
    app.rule('subscriptions', {
      kind: 'action',
      name: 'Renew',
      src: `action("Renew", { when: () => ${isRunning}, hint: "Only a running one" }, () => {${payment}
  renews = (empty(renews) ? today() : renews) + ${span}
  status = "Active"
})`,
    });
    app.rule('subscriptions', { kind: 'action', name: 'Pause', src: 'action("Pause", { when: () => status == "Active", hint: "Only an active one" }, () => {\n  status = "Paused"\n})' });
    app.rule('subscriptions', { kind: 'action', name: 'Resume', src: 'action("Resume", { when: () => status == "Paused", hint: "Only a paused one" }, () => {\n  status = "Active"\n})' });
    app.rule('subscriptions', {
      kind: 'action',
      name: 'Cancel',
      src: `action("Cancel", {
  when: () => status != "Cancelled",
  hint: "It is cancelled",
  ask: { reason: { label: "Why?", type: "text" } },
}, () => {
  status = "Cancelled"
  cancelled_on = today()
  if (!empty(input.reason)) reason = input.reason
})`,
    });

    if (paid) {
      app.record('budget-lines', { name: called, type: 'Income' });
      app.field('payments', link('subscription', 'For', subs));
      app.block('subscriptions', { block: 'linked', collection: app.path('payments'), style: 'list', fields: ['amount', 'status'] });
    }

    const planNames = ((answers.plans as string[] | undefined) ?? PLANS).map((p) => p.trim()).filter(Boolean);
    const who = words.customer === 'Member' ? 'member' : 'customer';
    app.about({
      title: 'Subscriptions and memberships',
      what: `What you sell by the month or the year${planNames.length > 0 ? `: ${planNames.join(', ')}` : ''}; who is on each plan, when each renews, and what comes in each month.`,
      pieces: ['plans', 'subscriptions', customer],
      glance: ['Renewal days in Today and Upcoming', 'A renewal day passed is marked', 'Renew, Pause, Resume and Cancel on each', ...(paid ? ['A renewal is written as a payment'] : [])],
      how: [
        'Write each plan with its period and its price.',
        `Add a ${words.one} for each ${who}: their plan and the day it starts; the rest comes from the plan.`,
        `Press Renew when a period is paid${trial ? ', or when a trial becomes a paid one' : ''}; Pause and Resume when it stops for a while; Cancel when it ends.`,
        'The Active view adds up what comes in each month; Cancelled shows what was lost and why.',
      ],
      auto: [
        `A new one takes its amount and its period from its plan, its name from the ${who} and the plan, and its renewal day a period after it starts${trial ? ", or when the plan's trial ends" : ''}.`,
        'Its monthly value is its amount spread over the months of its period; each plan and each customer adds up the monthly value of the active ones.',
        'Renew moves the renewal day a period on; one whose renewal day has passed is marked until it is renewed or cancelled.',
        'Cancel asks why, and writes the day.',
        ...(paid ? [`Renew writes what comes in as a payment in ${app.called('payments')}, under the ${called} budget line.`] : []),
      ],
      work: ['Who renews them, and when in the month.', 'What we do when a payment does not come.', `How a ${who} cancels, and how long before.`],
    });
  },
};
