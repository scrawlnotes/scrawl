import { calendar, checkbox, currencyField, day, formula, inMain, link, nameField, number, rollup, select } from '../pieces';
import type { AppTemplate } from '../types';
import { EVERY, UNITS } from './home';

// Personal finance (design/more-apps.md 4.1): an amount and a tap to spend, the account the last
// one used; the month at a glance, day by day; a budget as bars; what comes again (a salary, the
// rent) written by itself on its day, what changes each time (electricity) in Today with Paid.

const ACCOUNTS = ['Bank account', 'Credit card', 'Cash'];
const SPENDING = ['Groceries', 'Rent', 'Utilities', 'Transport', 'Fuel', 'Eating out', 'Coffee', 'Health', 'Clothes', 'Shopping', 'Subscriptions', 'Insurance', 'Education', 'Gifts', 'Travel', 'Fun', 'Sports', 'Kids', 'Pets', 'Home', 'Other'];
const INCOME = ['Salary', 'Freelance', 'Other income'];
const TYPES = ['Bank', 'Card', 'Cash', 'Savings'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** An account as the list says it: its name, and its type from a word in it; a bank account when it says none. */
export function accountOf(item: string): { name: string; type: string } {
  const name = item.trim();
  const type = /\bcard\b/i.test(name) ? 'Card' : /\bcash\b/i.test(name) ? 'Cash' : /\bsaving/i.test(name) ? 'Savings' : 'Bank';
  return { name, type };
}

/** Whether a category is money in, by its name. */
const isIncome = (name: string) => /salary|freelance|income|bonus|wage|pension|dividend|maa[sş]/i.test(name);

/** The category a recurring one goes to, from its name: rent to Rent, a salary to Salary; none when its name says nothing. */
function categoryOf(name: string, categories: string[]): string | undefined {
  const guess = /salary|wage|maa[sş]/i.test(name) ? 'Salary' : /rent|kira/i.test(name) ? 'Rent' : /electric|water|gas|internet|phone|utilit|aidat|building fee/i.test(name) ? 'Utilities' : /netflix|spotify|youtube|disney|subscription|icloud/i.test(name) ? 'Subscriptions' : /insurance|sigorta/i.test(name) ? 'Insurance' : /gym|fitness/i.test(name) ? 'Sports' : undefined;
  return categories.find((c) => c.toLowerCase() === (guess ?? name).toLowerCase());
}

/**
 * What comes again as its words say it (design/more-apps.md 4.1): "Salary 50,000 on the 15th",
 * "Rent 20,000 on the 1st", "Car insurance 14,000 yearly on Mar 3", "Netflix 230 every 3 months";
 * monthly when it says no other, its next day the one it says from `today` on, else today.
 */
export function recurringOf(item: string, today: string): { name: string; amount?: number; every: string; next: string; direction: string } {
  const words = item.trim();
  const money = /(\d[\d.,]*)/.exec(words);
  const amount = money ? Number(money[1]!.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) : undefined;
  const name = (money ? words.slice(0, money.index) : words).replace(/\s+(on|every|yearly|monthly|weekly).*$/i, '').trim() || words;
  const every = /\byearly\b|\bevery year\b|\bannual/i.test(words) ? 'Yearly' : /\bweekly\b|\bevery week\b/i.test(words) ? 'Weekly' : /every 3 months|quarterly/i.test(words) ? 'Every 3 months' : /every 6 months/i.test(words) ? 'Every 6 months' : 'Monthly';
  const [y, m] = today.split('-').map(Number) as [number, number];
  const at = (year: number, month: number, date: number) => new Date(Date.UTC(year, month - 1, Math.min(date, new Date(Date.UTC(year, month, 0)).getUTCDate()))).toISOString().slice(0, 10);
  let next = today;
  const onMonth = /\bon\s+([a-z]{3})[a-z]*\.?\s+(\d{1,2})\b/i.exec(words);
  const onDay = /\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(words);
  if (onMonth && MONTHS.includes(onMonth[1]!.toLowerCase())) {
    const month = MONTHS.indexOf(onMonth[1]!.toLowerCase()) + 1;
    const date = Number(onMonth[2]);
    next = at(y, month, date) >= today ? at(y, month, date) : at(y + 1, month, date);
  } else if (onDay && every !== 'Weekly') {
    const date = Number(onDay[1]);
    next = at(y, m, date) >= today ? at(y, m, date) : at(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, date);
  }
  return { name, ...(amount !== undefined && Number.isFinite(amount) && { amount }), every, next, direction: isIncome(name) ? 'In' : 'Out' };
}

/** The sign of a currency as a person reads it: ₺, $, €. */
function symbolOf(currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
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
    { key: 'recurring', kind: 'list', label: 'apps.finance.recurring', default: [], help: 'apps.finance.recurringHelp', add: 'apps.finance.addRecurring' },
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
    app.field('accounts', number('opening', 'Opening balance', { format: own }));
    app.field('accounts', { ...rollup('money_in', 'In', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['In'] }], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['In'] }], via: 'account' } });
    app.field('accounts', { ...rollup('money_out', 'Out', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['Out'] }], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Out'] }], via: 'account' } });
    app.field('accounts', { ...rollup('sent', 'Moved out', moves, 'sum', 'amount', [], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Transfer'] }], via: 'account' } });
    app.field('accounts', { ...rollup('received', 'Moved in', moves, 'sum', 'amount', [], own), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Transfer'] }], via: 'to' } });
    app.field('accounts', formula('balance', 'Balance', '(opening || 0) + money_in - money_out - sent + received', own));
    app.block('accounts', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'direction', 'amount', 'category'], sort: 'date', dir: 'desc' });
    app.tableColumns('accounts', ['type', 'balance']);
    app.homeTile('accounts', { value: 'balance', total: true });
    for (const item of accountNames) app.record('accounts', { ...accountOf(item), ...(multi && { currency: app.money.main }) });

    // Transactions: the amount first, Out, In or Transfer, a category tapped; What left empty is its category's name.
    app.field('transactions', { ...nameField('What'), optional: true });
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

    // Categories: money out or in; a budget for the month as a bar.
    app.field('categories', nameField());
    app.field('categories', select('kind', 'Kind', ['Spending', 'Income'], { Spending: 'gray', Income: 'green' }, 'Spending'));
    app.field('categories', { ...rollup('spent', 'Spent this month', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['Out'] }, { field: 'this_month', op: 'true' }, ...inMain(app)], main), rollup: { from: moves, fn: 'sum', field: 'amount', where: [{ field: 'direction', op: 'is', value: ['Out'] }, { field: 'this_month', op: 'true' }, ...inMain(app)], via: 'category' } });
    app.block('categories', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'amount', 'account'], sort: 'date', dir: 'desc', sums: true });
    if (budget) {
      const spending = [{ field: 'kind', op: 'is' as const, value: ['Spending'] }];
      app.field('categories', { ...number('limit', 'Monthly limit', { format: main }), when: spending });
      app.field('categories', formula('left', 'Left', 'empty(limit) ? null : limit - spent', main));
      app.field('categories', formula('shown', 'Spent of limit', `empty(limit) ? null : ${money('spent')} + " of " + ${money('limit')}`));
      app.field('categories', formula('progress', 'This month', 'empty(limit) || limit == 0 ? null : spent / limit', { style: 'percent', bar: true, caption: 'shown' }));
      app.field('categories', { ...formula('status', 'Status', 'empty(limit) ? null : spent > limit ? "Over" : spent >= limit * 0.9 ? "Close" : "On track"'), colors: { 'On track': 'green', Close: 'orange', Over: 'red' } });
      app.view('categories', { id: 'budget', name: 'Budget', conditions: [...spending, { field: 'limit', op: 'not-empty' }], sort: { key: 'name', dir: 'asc' }, columns: ['progress', 'left', 'status'] }, true);
      app.homeTile('categories', { value: 'progress' });
      app.rule('categories', { kind: 'check', name: 'Over its limit', src: 'check("spent", () => empty(limit) || spent <= limit, "Over its limit")' });
    }
    app.tableColumns('categories', ['kind', ...(budget ? ['limit', 'spent'] : ['spent'])]);
    for (const name of categories) app.record('categories', { name, kind: INCOME.includes(name) ? 'Income' : 'Spending' });

    // Recurring: what comes in and goes out again and again; one paid automatically is written by itself on its day.
    const custom = { when: [{ field: 'every', op: 'is' as const, value: ['Custom'] }] };
    app.field('bills', nameField());
    app.field('bills', number('amount', 'Amount', { required: true, format: own }));
    if (multi) app.field('bills', currencyField(app));
    app.field('bills', { ...select('direction', 'Direction', ['Out', 'In'], { Out: 'gray', In: 'green' }, 'Out'), chips: true });
    app.field('bills', select('every', 'Every', EVERY, gray(EVERY), 'Monthly'));
    app.field('bills', { ...number('interval', 'How many'), required: true, ...custom });
    app.field('bills', { ...select('unit', 'Of', UNITS, gray(UNITS), 'Months'), ...custom });
    app.field('bills', { ...day('next', 'Next', true), required: true });
    app.field('bills', { ...link('account', 'Account', accountsPath), required: true });
    app.field('bills', { ...link('category', 'Category', app.path('categories')), chips: true });
    app.field('bills', checkbox('auto', 'Paid automatically', true));
    app.field('bills', formula('signed', 'Amount', 'direction == "In" ? amount : -amount', own));
    app.field('bills', formula('says', 'Says', `(auto ? "" : "about ") + (direction == "In" ? "+" : "−") + ${money('amount')} + (empty(account) ? "" : " · " + account.name)`));
    app.block('bills', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'amount', 'account'], sort: 'date', dir: 'desc' });
    app.view('bills', { id: 'all', name: 'By next', conditions: [], sort: { key: 'next', dir: 'asc' }, columns: ['amount', 'every', 'next', 'account', 'auto'] }, true);
    app.tableColumns('bills', ['amount', 'every', 'next', 'account', 'auto']);
    app.homeTile('bills', { value: 'signed', sub: 'next' });
    app.view('bills', calendar({ start: 'next', upcoming: true, button: 'Paid', auto: 'auto', words: ['says'] }));
    app.rule('bills', {
      kind: 'action',
      name: 'Paid',
      src: `action("Paid", {
  ask: {
    amount: { label: "Amount", type: "number", default: () => amount, required: true },
    account: { label: "Account", type: "link", collection: "${app.called('accounts')}", default: () => account, required: true },
  },
}, () => {
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
    for (const item of (answers.recurring as string[] | undefined) ?? []) {
      if (!item.trim()) continue;
      const one = recurringOf(item, app.today);
      const category = categoryOf(one.name, categories);
      app.record('bills', {
        name: one.name,
        ...(one.amount !== undefined && { amount: one.amount }),
        direction: one.direction,
        every: one.every,
        next: one.next,
        auto: true,
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
        `Add what comes again in ${app.called('bills')}: a salary or the rent is written by itself; one whose amount changes is in Today with Paid.`,
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
