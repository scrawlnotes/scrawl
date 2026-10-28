import { calendar, checkbox, currencyField, day, formula, inMain, link, nameField, number, rollup, select, symbolOf } from '../pieces';
import type { AnswerRow, AppTemplate } from '../types';
import { EVERY, UNITS } from './home';

// Personal finance (design/more-apps.md 4.1): an amount and a tap to spend, the account the last
// one used; the month at a glance, day by day; a budget as bars; what comes again (a salary, the
// rent) written by itself on its day, what changes each time (electricity) in Today with Paid; one
// set up with no amount asked the first time it is paid.

const ACCOUNTS = ['Bank account', 'Credit card', 'Cash'];
const SPENDING = ['Groceries', 'Rent', 'Utilities', 'Transport', 'Fuel', 'Eating out', 'Coffee', 'Health', 'Clothes', 'Shopping', 'Subscriptions', 'Insurance', 'Education', 'Gifts', 'Travel', 'Fun', 'Sports', 'Kids', 'Pets', 'Home', 'Other'];
const INCOME = ['Salary', 'Freelance', 'Other income'];
const TYPES = ['Bank', 'Card', 'Cash', 'Savings'];
const EVERY_ROW = ['Monthly', 'Every 3 months', 'Every 6 months', 'Yearly', 'Weekly'];
/** What comes again, ready with no amount: a salary, the rent, the bills of a home. */
const RECURRING: AnswerRow[] = [
  { name: 'Salary', direction: 'In', every: 'Monthly', day: 15, category: 'Salary' },
  { name: 'Rent', direction: 'Out', every: 'Monthly', day: 1, category: 'Rent' },
  { name: 'Electricity', direction: 'Out', every: 'Monthly', day: 20, category: 'Utilities' },
  { name: 'Water', direction: 'Out', every: 'Monthly', day: 20, category: 'Utilities' },
  { name: 'Natural gas', direction: 'Out', every: 'Monthly', day: 20, category: 'Utilities' },
  { name: 'Internet', direction: 'Out', every: 'Monthly', day: 5, category: 'Utilities' },
  { name: 'Phone', direction: 'Out', every: 'Monthly', day: 10, category: 'Utilities' },
  { name: 'Building fee', direction: 'Out', every: 'Monthly', day: 5, category: 'Home' },
  { name: 'Streaming', direction: 'Out', every: 'Monthly', day: 12, category: 'Subscriptions' },
];
/** One whose amount changes each time, paid with Paid and never by itself. */
const varies = (name: string) => /electric|water|gas|elektrik|su\b|do[gğ]al ?gaz/i.test(name);

/** An account as the list says it: its name, and its type from a word in it; a bank account when it says none. */
export function accountOf(item: string): { name: string; type: string } {
  const name = item.trim();
  const type = /\bcard\b/i.test(name) ? 'Card' : /\bcash\b/i.test(name) ? 'Cash' : /\bsaving/i.test(name) ? 'Savings' : 'Bank';
  return { name, type };
}

/**
 * What comes again as a row of its table says it (design/more-apps.md 4.1): its name, amount, Out
 * or In, how often, its day of the month and its category; its next day that day from `today` on,
 * today for a weekly one or one with no day.
 */
export function recurringOf(row: AnswerRow, today: string): { name: string; amount?: number; direction: string; every: string; next: string; category?: string } {
  const name = String(row.name ?? '').trim();
  const every = typeof row.every === 'string' && EVERY_ROW.includes(row.every) ? row.every : 'Monthly';
  const [y, m] = today.split('-').map(Number) as [number, number];
  const at = (year: number, month: number, date: number) => new Date(Date.UTC(year, month - 1, Math.min(date, new Date(Date.UTC(year, month, 0)).getUTCDate()))).toISOString().slice(0, 10);
  const date = typeof row.day === 'number' ? row.day : undefined;
  const next = every === 'Weekly' || date === undefined ? today : at(y, m, date) >= today ? at(y, m, date) : at(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, date);
  const amount = typeof row.amount === 'number' ? row.amount : undefined;
  const category = typeof row.category === 'string' && row.category ? row.category : undefined;
  return { name, ...(amount !== undefined && { amount }), direction: row.direction === 'In' ? 'In' : 'Out', every, next, ...(category && { category }) };
}


export const finance: AppTemplate = {
  id: 'finance',
  version: 2,
  group: 'home',
  name: 'apps.finance.name',
  short: 'apps.finance.short',
  icon: 'stack',
  what: 'apps.finance.what',
  goesWith: ['split'],
  questions: [
    { key: 'accounts', kind: 'list', label: 'apps.finance.accounts', default: ACCOUNTS, help: 'apps.finance.accountsHelp', add: 'apps.finance.addAccount' },
    {
      key: 'recurring',
      kind: 'rows',
      label: 'apps.finance.recurring',
      default: RECURRING,
      help: 'apps.finance.recurringHelp',
      add: 'apps.finance.addRecurring',
      columns: [
        { key: 'name', label: 'apps.finance.rowName', type: 'text' },
        { key: 'amount', label: 'apps.finance.rowAmount', type: 'number', placeholder: 'apps.finance.rowAmountEmpty' },
        { key: 'direction', label: 'apps.finance.rowDirection', type: 'choice', options: ['Out', 'In'] },
        { key: 'every', label: 'apps.finance.rowEvery', type: 'choice', options: EVERY_ROW },
        { key: 'day', label: 'apps.finance.rowDay', type: 'day', placeholder: 'apps.finance.rowDayEmpty' },
        { key: 'category', label: 'apps.finance.rowCategory', type: 'choice', options: [...SPENDING, ...INCOME] },
      ],
    },
    { key: 'budget', kind: 'yesno', label: 'apps.finance.budget', default: true },
  ],
  money: () => true,
  pieces: () => ['accounts', 'transactions', 'categories', 'bills'],
  menu: ['transactions', 'accounts', 'categories', 'bills'],
  build(app, answers) {
    const moves = app.path('transactions');
    const accountsPath = app.path('accounts');
    const main = app.format(false);
    const own = app.format(true);
    const multi = app.money.multi;
    const budget = answers.budget !== false;
    const sym = symbolOf(app.money.main ?? '');
    const money = (expr: string) => `"${sym}" + text(round(abs(${expr})))`;
    const gray = (options: string[]) => Object.fromEntries(options.map((o) => [o, 'gray' as const]));
    const accountNames = ((answers.accounts as string[] | undefined) ?? ACCOUNTS).map((a) => a.trim()).filter(Boolean);
    const categories = [...SPENDING, ...INCOME];

    // Accounts: each balance its opening one, what came in and went out, what was moved to and from it.
    app.field('accounts', nameField());
    app.field('accounts', select('type', 'Type', TYPES, { Bank: 'blue', Card: 'purple', Cash: 'green', Savings: 'teal' }, 'Bank'));
    if (multi) app.field('accounts', currencyField(app));
    app.field('accounts', { ...number('opening', 'Opening balance', { format: own }), help: 'What was in it on the day you started' });
    app.field('accounts', { ...rollup('money_in', 'In', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['In'] }], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['In'] }], via: 'account' } });
    app.field('accounts', { ...rollup('money_out', 'Out', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['Out'] }], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Out'] }], via: 'account' } });
    app.field('accounts', { ...rollup('sent', 'Moved out', moves, 'sum', 'amount', [], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Transfer'] }], via: 'account' } });
    app.field('accounts', { ...rollup('received', 'Moved in', moves, 'sum', 'amount', [], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Transfer'] }], via: 'to' } });
    app.field('accounts', formula('balance', 'Balance', '(opening || 0) + money_in - money_out - sent + received', own));
    app.block('accounts', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'direction', 'amount', 'category'], sort: 'date', dir: 'desc' });
    app.tableColumns('accounts', ['type', 'balance']);
    app.homeTile('accounts', { value: 'balance', total: true });
    for (const item of accountNames) app.record('accounts', { ...accountOf(item), ...(multi && { currency: app.money.main }) });

    // Transactions: the amount first, Out, In or Transfer, a category tapped; a Description left empty is its category's name.
    app.field('transactions', { ...nameField('Description'), optional: true, help: 'Where or what it was for; left empty, its category’s name' });
    app.field('transactions', number('amount', 'Amount', { required: true, format: own }));
    if (multi) app.field('transactions', currencyField(app));
    app.field('transactions', { ...select('direction', 'Direction', ['Out', 'In', 'Transfer'], { Out: 'gray', In: 'green', Transfer: 'blue' }, 'Out'), chips: true });
    app.field('transactions', { ...link('category', 'Category', app.path('categories')), chips: true, when: [{ field: 'direction', op: 'is-not', value: ['Transfer'] }] });
    app.field('transactions', { ...link('account', 'Account', accountsPath), required: true, default: '=last("date")' });
    app.field('transactions', { ...link('to', 'To', accountsPath), required: true, when: [{ field: 'direction', op: 'is', value: ['Transfer'] }] });
    app.field('transactions', day('date', 'Date', true));
    app.field('transactions', link('recurring', 'Recurring', app.path('bills')));
    app.field('transactions', formula('this_month', 'This month', 'year(date) == year(today()) && month(date) == month(today())'));
    app.field('transactions', formula('signed', 'Amount', 'direction == "In" ? amount : direction == "Out" ? -amount : null', own));
    app.field('transactions', formula('in_amt', 'In', 'direction == "In" ? amount : 0', own));
    app.field('transactions', formula('out_amt', 'Out', 'direction == "Out" ? -amount : 0', own));
    app.field('transactions', formula('net', 'Net', 'direction == "In" ? amount : direction == "Out" ? -amount : 0', own));
    app.field('transactions', formula('says', 'Says', `(direction == "In" ? "+" : direction == "Out" ? "−" : "") + ${money('amount')} + (empty(account) ? "" : " · " + account.name)`));
    app.formOrder('transactions', ['amount', 'direction', 'category', 'account', 'to', 'date', 'name']);
    app.view('transactions', { id: 'month', name: 'This month', conditions: [{ field: 'this_month', op: 'true' }], sort: { key: 'date', dir: 'desc' }, group: 'date', columns: ['category', 'account', 'signed'] }, true);
    app.tableColumns('transactions', ['date', 'category', 'account', 'signed']);
    app.homeTile('transactions', { value: 'signed', totals: ['in_amt', 'out_amt', 'net'] });
    // What a recurring one wrote today is in Today, its amount said.
    app.view('transactions', { id: 'today', name: 'Recurring', kind: 'calendar', conditions: [{ field: 'recurring', op: 'not-empty' }], calendar: { start: 'date', upcoming: 'today', words: ['says'] } });
    app.rule('transactions', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {\n  if (empty(name)) name = direction == "Transfer" ? (empty(to) ? "Transfer" : "To " + to.name) : (empty(category) ? "" : category.name)\n})`,
    });
    // The first one, with none used before: the bank account.
    app.rule('transactions', { kind: 'onSave', name: 'Its account', src: `onSave("Its account", () => {
  if (empty(account)) account = find("${app.called('accounts')}", { type: "Bank" })[0] || find("${app.called('accounts')}")[0]
})` });
    if (multi) app.rule('transactions', { kind: 'onSave', name: 'Currency of the account', src: 'onSave("Currency of the account", () => {\n  if (!empty(account) && empty(currency)) currency = account.currency\n})' });

    // Categories: money out or in, each with what was spent on it this month; a bar where it has a limit.
    app.field('categories', nameField());
    app.field('categories', select('kind', 'Kind', ['Spending', 'Income'], { Spending: 'gray', Income: 'green' }, 'Spending'));
    app.field('categories', { ...rollup('spent', 'Spent this month', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['Out'] }, { field: 'this_month', op: 'true' }, ...inMain(app)], main), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Out'] }, { field: 'this_month', op: 'true' }, ...inMain(app)], via: 'category' } });
    app.block('categories', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'amount', 'account'], sort: 'date', dir: 'desc', sums: true });
    if (budget) {
      const spending = [{ field: 'kind', op: 'is' as const, value: ['Spending'] }];
      app.field('categories', { ...number('limit', 'Monthly limit', { format: main }), when: spending, help: 'What you mean to spend on it in a month; left empty, it has no budget' });
      app.field('categories', formula('left', 'Left', 'empty(limit) ? null : limit - spent', main));
      app.field('categories', formula('shown', 'Spent of limit', `empty(limit) ? null : ${money('spent')} + " of " + ${money('limit')}`));
      app.field('categories', formula('progress', 'Limit used', 'empty(limit) || limit == 0 ? null : spent / limit', { style: 'percent', bar: true, caption: 'shown' }));
      app.field('categories', { ...formula('status', 'Status', 'empty(limit) ? null : spent > limit ? "Over" : spent >= limit * 0.9 ? "Close" : "On track"'), colors: { 'On track': 'green', Close: 'orange', Over: 'red' } });
      app.homeTile('categories', { value: 'progress', filled: true, empty: 'Give a category a monthly limit to see it here.' });
      app.rule('categories', { kind: 'check', name: 'Over its limit', src: 'check("spent", () => empty(limit) || spent <= limit, "Over its limit")' });
    }
    const columns = ['kind', 'spent', ...(budget ? ['progress', 'left', 'status'] : [])];
    app.tableColumns('categories', columns);
    for (const name of categories) app.record('categories', { name, kind: INCOME.includes(name) ? 'Income' : 'Spending' });

    // Recurring: what comes in and goes out again and again; one paid automatically is written by itself on its day.
    const custom = { when: [{ field: 'every', op: 'is' as const, value: ['Custom'] }] };
    app.field('bills', nameField());
    app.field('bills', { ...number('amount', 'Amount', { format: own }), help: 'Left empty, it is asked the first time it is paid' });
    if (multi) app.field('bills', currencyField(app));
    app.field('bills', { ...select('direction', 'Direction', ['Out', 'In'], { Out: 'gray', In: 'green' }, 'Out'), chips: true });
    app.field('bills', select('every', 'Every', EVERY, gray(EVERY), 'Monthly'));
    app.field('bills', { ...number('interval', 'How many'), required: true, ...custom });
    app.field('bills', { ...select('unit', 'Of', UNITS, gray(UNITS), 'Months'), ...custom });
    app.field('bills', { ...day('next', 'Next', true), required: true, help: 'The day it comes next; it moves on by itself when paid' });
    app.field('bills', { ...link('account', 'Account', accountsPath), required: true });
    app.field('bills', { ...link('category', 'Category', app.path('categories')), chips: true });
    app.field('bills', { ...checkbox('auto', 'Paid automatically', true), help: 'Written by itself on its day once it has an amount; off for one that changes, as electricity, paid in Today with Paid' });
    // Written by itself: paid automatically, its amount known.
    app.field('bills', formula('writes', 'Writes itself', 'auto && !empty(amount)'));
    app.field('bills', formula('signed', 'Amount', 'empty(amount) ? null : direction == "In" ? amount : -amount', own));
    app.field('bills', formula('says', 'Says', `(empty(amount) ? "No amount yet" : (auto ? "" : "about ") + (direction == "In" ? "+" : "−") + ${money('amount')}) + (empty(account) ? "" : " · " + account.name)`));
    app.block('bills', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'amount', 'account'], sort: 'date', dir: 'desc' });
    app.view('bills', { id: 'all', name: 'By next', conditions: [], sort: { key: 'next', dir: 'asc' }, columns: ['signed', 'every', 'next', 'account', 'auto'] }, true);
    app.tableColumns('bills', ['signed', 'every', 'next', 'account', 'auto']);
    app.homeTile('bills', { value: 'signed', sub: 'next' });
    app.view('bills', calendar({ start: 'next', upcoming: true, button: 'Paid', auto: 'writes', words: ['says'] }));
    app.rule('bills', {
      kind: 'action',
      name: 'Paid',
      src: `action("Paid", {
  ask: {
    amount: { label: "Amount", type: "number", default: () => amount, required: true },
    account: { label: "Account", type: "link", collection: "${app.called('accounts')}", default: () => account, required: true },
  },
}, () => {
  // The amount it had none of, or the last one of one that changes, is the one asked next.
  if (empty(amount) || !auto) amount = input.amount
  add("${app.called('transactions')}", { name: name, account: input.account, amount: input.amount, direction: direction, category: category, date: next > today() ? today() : next${multi ? ', currency: currency' : ''} })
  const from = next
  if (every == "Weekly") next = from + 7
  else if (every == "Custom" && unit == "Days") next = from + interval
  else if (every == "Custom" && unit == "Weeks") next = from + interval * 7
  else if (every == "Custom") next = from + (unit == "Years" ? years(interval) : months(interval))
  else next = from + (every == "Monthly" ? months(1) : every == "Every 3 months" ? months(3) : every == "Every 6 months" ? months(6) : every == "Every 2 years" ? years(2) : years(1))
})`,
    });
    const firstAccount = accountNames[0];
    for (const row of (answers.recurring as AnswerRow[] | undefined) ?? []) {
      const one = recurringOf(row, app.today);
      if (!one.name) continue;
      const category = one.category && categories.includes(one.category) ? one.category : undefined;
      app.record('bills', {
        name: one.name,
        ...(one.amount !== undefined && { amount: one.amount }),
        direction: one.direction,
        every: one.every,
        next: one.next,
        auto: !varies(one.name),
        ...(firstAccount && { account: firstAccount }),
        ...(category && { category }),
        ...(multi && { currency: app.money.main }),
      });
    }

    app.about({
      title: 'Personal finance',
      what: `Your money${accountNames.length > 0 ? ` in ${accountNames.join(', ')}` : ''}: what comes in and goes out, month by month${budget ? ', a budget for each category' : ''}, and what comes again written by itself.`,
      pieces: ['transactions', 'accounts', 'categories', 'bills'],
      glance: ['This month’s in, out and net', 'Each account’s balance', ...(budget ? ['A bar for each category’s budget'] : []), 'What comes again, written on its day'],
      how: [
        'Add what you spend with its amount and a category; the account is the last one used, the day today.',
        'Move money between your accounts with Transfer, as a card paid from the bank.',
        ...(budget ? ['Give a category its monthly limit to see it as a bar.'] : []),
        `Add what comes again in ${app.called('bills')}: a salary or the rent is written by itself; one whose amount changes is in Today with Paid. One with no amount is asked the first time.`,
      ],
      auto: [
        "An account's balance is its opening balance with what came in, less what went out, and what was moved to and from it.",
        ...(budget ? ['A category says what was spent on it this month, how much is left, and whether it is on track, close or over.'] : []),
        'One paid automatically writes its transaction on its day and moves to the next; one past its day and not paid is in Overdue.',
      ],
      work: ['When you look at what you spent, and how often.', 'What you put aside each month.'],
    });
  },
};
