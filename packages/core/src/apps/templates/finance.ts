import { calendar, checkbox, currencyField, day, formula, inMain, link, nameField, number, rollup, select } from '../pieces';
import type { AppTemplate } from '../types';
import { periodSpan } from './subscriptions';

// Personal finance (design/more-apps.md 4.1): your accounts and what is in them, every bit of
// money in and out, a limit for each category in the month, and the bills that come again and
// again. Paid writes a bill as spent and moves it a period on.

const ACCOUNTS = ['Bank account', 'Credit card', 'Cash'];
const CATEGORIES = ['Groceries', 'Rent', 'Bills', 'Transport', 'Eating out', 'Health', 'Shopping', 'Fun', 'Other'];
const TYPES = ['Bank', 'Card', 'Cash', 'Savings'];

/** An account as the list says it: its name, and its type from a word in it; a bank account when it says none. */
export function accountOf(item: string): { name: string; type: string } {
  const name = item.trim();
  const type = /\bcard\b/i.test(name) ? 'Card' : /\bcash\b/i.test(name) ? 'Cash' : /\bsaving/i.test(name) ? 'Savings' : 'Bank';
  return { name, type };
}

export const finance: AppTemplate = {
  id: 'finance',
  version: 1,
  group: 'home',
  name: 'apps.finance.name',
  short: 'apps.finance.short',
  icon: 'stack',
  what: 'apps.finance.what',
  goesWith: ['split'],
  questions: [
    { key: 'accounts', kind: 'list', label: 'apps.finance.accounts', default: ACCOUNTS, help: 'apps.finance.accountsHelp', add: 'apps.finance.addAccount' },
    { key: 'categories', kind: 'list', label: 'apps.finance.categories', default: CATEGORIES, help: 'apps.finance.categoriesHelp', add: 'apps.finance.addCategory' },
    { key: 'bills', kind: 'yesno', label: 'apps.finance.bills', default: true, help: 'apps.finance.billsHelp' },
  ],
  money: () => true,
  pieces: (answers) => ['accounts', 'transactions', 'categories', ...(answers.bills !== false ? ['bills'] : [])],
  menu: ['transactions', 'accounts', 'bills', 'categories'],
  build(app, answers) {
    const bills = app.hasPiece('bills');
    const moves = app.path('transactions');
    const main = app.format(false);
    const own = app.format(true);
    const multi = app.money.multi;

    app.field('accounts', nameField());
    app.field('accounts', select('type', 'Type', TYPES, { Bank: 'blue', Card: 'purple', Cash: 'green', Savings: 'teal' }, 'Bank'));
    if (multi) app.field('accounts', currencyField(app));
    app.field('accounts', number('opening', 'Opening balance', { format: own }));
    app.field('accounts', rollup('money_in', 'In', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['In'] }], own));
    app.field('accounts', rollup('money_out', 'Out', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['Out'] }], own));
    app.field('accounts', formula('balance', 'Balance', '(opening || 0) + money_in - money_out', own));
    app.block('accounts', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'direction', 'amount', 'category'], sort: 'date' });
    for (const item of (answers.accounts as string[] | undefined) ?? ACCOUNTS) if (item.trim()) app.record('accounts', { ...accountOf(item), ...(multi && { currency: app.money.main }) });

    app.field('transactions', nameField('What'));
    app.field('transactions', { ...link('account', 'Account', app.path('accounts')), required: true });
    app.field('transactions', day('date', 'Date', true));
    app.field('transactions', number('amount', 'Amount', { required: true, format: own }));
    if (multi) app.field('transactions', currencyField(app));
    app.field('transactions', select('direction', 'Direction', ['In', 'Out'], { In: 'green', Out: 'red' }, 'Out'));
    app.field('transactions', link('category', 'Category', app.path('categories')));
    app.field('transactions', formula('this_month', 'This month', 'year(date) == year(today()) && month(date) == month(today())'));
    if (multi) app.rule('transactions', { kind: 'onSave', name: 'Currency of the account', src: 'onSave("Currency of the account", () => {\n  if (!empty(account) && empty(currency)) currency = account.currency\n})' });

    app.field('categories', nameField());
    app.field('categories', number('limit', 'Monthly limit', { format: main }));
    app.field('categories', rollup('spent', 'Spent this month', moves, 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['Out'] }, { field: 'this_month', op: 'true' }, ...inMain(app)], main));
    app.field('categories', formula('left', 'Left', 'limit - spent', main));
    app.block('categories', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'amount', 'account'], sort: 'date', sums: true });
    app.rule('categories', { kind: 'check', name: 'Over its limit', src: 'check("spent", () => empty(limit) || spent <= limit, `Over its limit by ${text(spent - limit)}`)' });
    for (const name of (answers.categories as string[] | undefined) ?? CATEGORIES) if (name.trim()) app.record('categories', { name: name.trim() });

    if (bills) {
      app.field('bills', nameField());
      app.field('bills', number('amount', 'Amount', { format: own }));
      if (multi) app.field('bills', currencyField(app));
      app.field('bills', select('period', 'Period', ['Monthly', 'Quarterly', 'Yearly'], {}, 'Monthly'));
      app.field('bills', { ...day('due', 'Next due'), required: true });
      app.field('bills', checkbox('autopay', 'Paid automatically'));
      app.field('bills', link('account', 'From', app.path('accounts')));
      app.field('bills', link('category', 'Category', app.path('categories')));
      app.field('transactions', link('bill', 'Bill', app.path('bills')));
      app.view('bills', calendar({ start: 'due', color: 'category', upcoming: true }));
      app.rule('bills', { kind: 'check', name: 'Past its due day', src: 'check("due", () => empty(due) || due >= today(), "Past its due day: press Paid once it is paid")' });
      app.rule('bills', {
        kind: 'action',
        name: 'Paid',
        src: `action("Paid", {
  ask: {
    amount: { label: "Amount", type: "number", default: () => amount, required: true },
    account: { label: "From", type: "link", collection: "${app.called('accounts')}", default: () => account, required: true },
  },
}, () => {
  add("${app.called('transactions')}", { name: name, account: input.account, amount: input.amount, direction: "Out", category: category${multi ? ', currency: currency' : ''} })
  due = due + ${periodSpan('period')}
})`,
      });
    }

    const accounts = ((answers.accounts as string[] | undefined) ?? ACCOUNTS).map((a) => a.trim()).filter(Boolean);
    app.about({
      title: 'Personal finance',
      what: `Your money${accounts.length > 0 ? ` in ${accounts.join(', ')}` : ''}: what comes in and goes out, a limit for each category in the month${bills ? ', and the bills you pay again and again' : ''}.`,
      pieces: ['accounts', 'transactions', 'categories', ...(bills ? ['bills'] : [])],
      glance: ['Each account’s balance', 'What each category spent this month', 'A category over its limit is marked', ...(bills ? ['Bills in Today and Upcoming', 'Paid writes it and moves it on'] : [])],
      how: [
        "Write each account's opening balance.",
        'Add what you spend and what comes in as a transaction, with its account and its category.',
        'Give a category its monthly limit, if you keep one.',
        ...(bills ? ['Add each bill with its next due day; press Paid when it is paid.'] : []),
      ],
      auto: [
        "An account's balance is its opening balance with what came in and less what went out.",
        "A category adds up what was spent on it this month and what is left of its limit; one over its limit is marked.",
        ...(bills ? ['Paid asks how much and from which account, writes it as spent, and moves the bill a period on; one past its due day is marked.'] : []),
      ],
      work: ['When you look at what you spent, and how often.', 'What you put aside each month.'],
    });
  },
};
