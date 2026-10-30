import type { Condition } from '../../collection';
import { checkbox, currencyField, day, formula, inMain, link, nameField, number, person, rollup, select, symbolOf, text } from '../pieces';
import { byDueDay, companies, payments } from '../shared';
import type { AppTemplate } from '../types';
import { customerRole } from './sales';
import { periodSpan } from './subscriptions';

// Budget and spending (design/scrawl-apps.md 3.5), as QuickBooks' Budget vs Actuals and Bills and
// Expensify keep them: each budget line what it plans a month against what was paid this month and
// this year, a bar of what is spent, yellow from 80% and red over it; what is to pay, overdue and to
// collect over the payments, each due one in Today with Mark paid, by itself when it pays itself,
// one that comes again writing the next; expenses with their receipt, approved onto a budget line
// and paid back.

const CATEGORIES = ['Rent', 'Salaries', 'Marketing', 'Software', 'Travel', 'Other'];
const EXPENSE_CATEGORIES = ['Travel', 'Meals', 'Supplies', 'Equipment', 'Other'];
const METHODS = ['Bank transfer', 'Card', 'Cash'];

/** A day as a payment says it: "Nov 3". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;

export const budget: AppTemplate = {
  id: 'budget',
  version: 2,
  group: 'money',
  name: 'apps.budget.name',
  short: 'apps.budget.short',
  icon: 'stack',
  what: 'apps.budget.what',
  questions: [
    { key: 'categories', kind: 'list', label: 'apps.budget.categories', default: CATEGORIES, add: 'apps.budget.addCategory' },
    { key: 'due', kind: 'yesno', label: 'apps.budget.due', default: true, help: 'apps.budget.dueHelp' },
    { key: 'expenses', kind: 'yesno', label: 'apps.budget.expenses', default: false },
    { key: 'expenseCategories', kind: 'list', label: 'apps.budget.expenseCategories', default: EXPENSE_CATEGORIES, when: ({ answers }) => answers.expenses === true, under: 'expenses', add: 'apps.budget.addCategory' },
    { key: 'expected', kind: 'yesno', label: 'apps.budget.expected', default: true, when: ({ chosen, answers }) => chosen.has('sales') && answers.due !== false, because: 'sales' },
  ],
  money: () => true,
  pieces: (answers) => ['budget-lines', 'payments', ...(answers.expenses === true ? ['expenses'] : [])],
  menu: (answers) => [
    { role: 'budget-lines', view: 'month', name: 'Budget' },
    { role: 'payments', view: 'to-pay', name: 'Bills and payments' },
    ...(answers.expenses === true ? [{ role: 'expenses', view: 'to-approve', name: 'Expenses' }] : []),
  ],
  build(app, answers) {
    const categories = (answers.categories as string[] | undefined) ?? CATEGORIES;
    const expenses = answers.expenses === true;
    const dated = byDueDay(app);
    const projects = app.hasPiece('projects');
    const main = app.format(false);
    const payTo = app.path('payments');
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    companies(app);
    payments(app);

    // A payment: to or from whom, how it comes again, and what its row says of its day.
    app.field('payments', { ...text('party', 'To or from'), suggest: true });
    if (categories.length > 0) app.field('payments', select('category', 'Category', categories));
    app.field('payments', { ...link('budget_line', 'Budget line', app.path('budget-lines')), chips: true });
    app.field('payments', { ...select('repeats', 'Comes again', ['Monthly', 'Quarterly', 'Yearly']), help: 'Rent, salaries, software: paid, the next one is added' });
    app.field('payments', { ...checkbox('pays_itself', 'Pays itself'), help: 'A direct debit or a standing order: marked paid on its day', when: [{ field: 'repeats', op: 'not-empty' }] });
    app.field('payments', formula('signed', 'In or out', 'direction == "In" ? amount : 0 - amount', main));
    app.field('payments', formula('this_month', 'Paid this month', 'status == "Paid" && !empty(paid_on) && month(paid_on) == month(today()) && year(paid_on) == year(today())'));
    app.field('payments', formula('this_year', 'Paid this year', 'status == "Paid" && !empty(paid_on) && year(paid_on) == year(today())'));
    if (dated) {
      app.field('payments', formula('due_week', 'Due this week', 'status != "Paid" && !empty(due) && due <= today() + 7'));
      app.field(
        'payments',
        formula(
          'due_said',
          'Due',
          `status == "Paid" ? (empty(paid_on) ? "Paid" : "Paid " + ${short('paid_on')}) : empty(due) ? "" : due < today() ? "Overdue " + text(today() - due) + (today() - due == 1 ? " day" : " days") : due == today() ? "Due today" : "Due " + ${short('due')}`,
        ),
      );
    }
    if (projects) app.field('payments', link('project', 'Project', app.path('projects')));
    app.rule('payments', { kind: 'check', name: 'Pick the budget line', src: 'check("budget_line", () => direction != "Out" || !empty(budget_line), "Pick the budget line")' });
    app.rule('payments', {
      kind: 'onSave',
      name: 'From the budget line',
      src: `onSave("From the budget line", () => {${categories.length > 0 ? '\n  if (empty(category) && !empty(budget_line) && !empty(budget_line.category)) category = budget_line.category' : ''}${app.hasPiece('companies') ? '\n  if (empty(party) && !empty(company)) party = company.name' : ''}
})`,
    });
    // Mark paid, QuickBooks': what came or went, on which day and how; a part leaves the rest to pay.
    app.rule('payments', {
      kind: 'action',
      name: 'Mark paid',
      src: `action("Mark paid", {
  when: () => status != "Paid",
  hint: "",
  ask: {
    paid: { label: "Amount", type: "number", default: () => amount, required: true },
    on: { label: "Paid on", type: "date", default: () => today() },
    how: { label: "How", type: "choice", options: ${JSON.stringify(METHODS)}, chips: true, default: () => empty(method) ? "Bank transfer" : method, note: () => empty(repeats) ? "" : repeats + ": the next one is added." },
  },
  done: () => name + " · paid",
}, () => {
  if (input.paid < amount) add("${app.called('payments')}", { name: name, direction: direction, amount: amount - input.paid, status: status, party: party, budget_line: budget_line${categories.length > 0 ? ', category: category' : ''}${dated ? ', due: due' : ''} })
  amount = input.paid
  paid_on = empty(input.on) ? today() : input.on
  method = input.how
  status = "Paid"
})`,
    });
    app.rule('payments', {
      kind: 'onSave',
      name: 'The next one',
      src: `onSave("The next one", () => {
  if (status == "Paid" && old.status != "Paid" && !empty(repeats)${dated ? ' && !empty(due)' : ''}) {
    add("${app.called('payments')}", { name: name, direction: direction, amount: amount, status: "Planned", party: party, budget_line: budget_line${categories.length > 0 ? ', category: category' : ''}, repeats: repeats, pays_itself: pays_itself${dated ? `, due: due + ${periodSpan('repeats')}` : ''} })
    repeats = null
  }
})`,
    });
    // The tabs, QuickBooks' Bills: what is to pay, overdue, to collect, paid; over them this week's, the late and what comes in.
    const open: Condition = { field: 'status', op: 'is-not', value: ['Paid'] };
    const out: Condition = { field: 'direction', op: 'is', value: ['Out'] };
    const comes: Condition = { field: 'direction', op: 'is', value: ['In'] };
    const sums = [
      ...(dated ? [{ label: 'to pay this week', field: 'amount', conditions: [out, { field: 'due_week', op: 'true' as const }] }] : [{ label: 'to pay', field: 'amount', conditions: [out, open] }]),
      ...(dated ? [{ label: 'overdue', field: 'amount', conditions: [out, { field: 'overdue', op: 'true' as const }], warn: true as const }] : []),
      { label: 'to collect', field: 'amount', conditions: [comes, open] },
    ];
    const columns = ['party', 'budget_line', ...(dated ? ['due_said'] : ['date']), 'amount'];
    const tab = (id: string, name: string, conditions: Condition[], sort: { key: string; dir: 'asc' | 'desc' }) => app.view('payments', { id, name, conditions, sort, columns, sums, set: 'payments' }, id === 'to-pay');
    const byDay = { key: dated ? 'due' : 'date', dir: 'asc' as const };
    tab('to-pay', 'To pay', [out, open], byDay);
    if (dated) tab('overdue', 'Overdue', [{ field: 'overdue', op: 'true' }], byDay);
    tab('to-collect', 'To collect', [comes, open], byDay);
    tab('paid', 'Paid', [{ field: 'status', op: 'is', value: ['Paid'] }], { key: 'paid_on', dir: 'desc' });
    app.view('payments', { id: 'month', name: 'Paid this month', conditions: [{ field: 'this_month', op: 'true' }], sort: { key: 'paid_on', dir: 'desc' }, hidden: true });

    // A budget line: what it plans a month against what was paid for it this month and this year.
    app.field('budget-lines', nameField());
    app.field('budget-lines', select('type', 'Type', ['Income', 'Expense'], { Income: 'green', Expense: 'red' }, 'Expense'));
    if (categories.length > 0) app.field('budget-lines', select('category', 'Category', categories));
    app.field('budget-lines', number('planned', 'Planned a month', { format: main }));
    if (projects) app.field('budget-lines', link('project', 'Project', app.path('projects')));
    const paidWhen = (key: string): Condition[] => [{ field: key, op: 'true' }, ...inMain(app)];
    app.field('budget-lines', rollup('actual', 'This month', payTo, 'sum', 'amount', paidWhen('this_month'), main));
    app.field('budget-lines', rollup('actual_year', 'This year', payTo, 'sum', 'amount', paidWhen('this_year'), main));
    app.field('budget-lines', formula('expense', 'Spent, not earned', 'type == "Expense"'));
    app.field('budget-lines', formula('planned_year', 'Planned this year', 'planned * 12', main));
    app.field('budget-lines', formula('remaining', 'Left', 'planned - actual', main));
    app.field('budget-lines', formula('remaining_year', 'Left this year', 'planned_year - actual_year', main));
    app.field('budget-lines', formula('used', 'Used', 'planned > 0 ? actual / planned : 0', { style: 'percent', decimals: 0, bar: true, warn: 'expense' }));
    app.field('budget-lines', formula('used_year', 'Used this year', 'planned_year > 0 ? actual_year / planned_year : 0', { style: 'percent', decimals: 0, bar: true, warn: 'expense' }));
    app.field('budget-lines', formula('over', 'Over budget', 'expense && planned > 0 && actual > planned'));
    app.field('budget-lines', formula('signed', 'Net this month', 'expense ? 0 - actual : actual', main));
    app.field('budget-lines', formula('state', 'State', 'over ? "Over" : "OK"'));
    app.block('budget-lines', { block: 'linked', collection: payTo, style: 'table', title: 'Payments', fields: ['party', ...(dated ? ['due_said'] : ['date']), 'amount', 'status'], sort: dated ? 'due' : 'date', dir: 'desc', sums: true });
    if (app.has('sales')) app.record('budget-lines', { name: 'Sales', type: 'Income' });
    // Budget vs Actuals, QuickBooks': income and expense in groups; over them what came in, went out, the net and what is over.
    const lineSums = (actual: string) => [
      { label: 'in', field: actual, conditions: [{ field: 'type', op: 'is' as const, value: ['Income'] }] },
      { label: 'out', field: actual, conditions: [{ field: 'type', op: 'is' as const, value: ['Expense'] }] },
      ...(actual === 'actual' ? [{ label: 'net', field: 'signed' }, { label: 'over budget', conditions: [{ field: 'over', op: 'true' as const }], warn: true as const }] : []),
    ];
    app.view('budget-lines', { id: 'month', name: 'This month', conditions: [], group: 'type', sort: { key: 'name', dir: 'asc' }, columns: ['planned', 'actual', 'used', 'remaining'], sums: lineSums('actual'), set: 'budget' }, true);
    app.view('budget-lines', { id: 'year', name: 'This year', conditions: [], group: 'type', sort: { key: 'name', dir: 'asc' }, columns: ['planned_year', 'actual_year', 'used_year', 'remaining_year'], sums: lineSums('actual_year'), set: 'budget' });
    app.view('budget-lines', { id: 'over', name: 'Over budget', conditions: [{ field: 'over', op: 'true' }], sort: { key: 'remaining', dir: 'asc' }, hidden: true });

    if (projects) {
      app.field('payments', link('project', 'Project', app.path('projects')));
      app.block('projects', { block: 'linked', collection: app.path('budget-lines'), style: 'table', fields: ['planned', 'actual', 'remaining'], sums: true });
      app.block('projects', { block: 'linked', collection: payTo, style: 'table', fields: ['direction', 'amount', 'status'], sums: true });
    }

    if (expenses) {
      const kinds = (answers.expenseCategories as string[] | undefined) ?? EXPENSE_CATEGORIES;
      app.field('expenses', nameField('What'));
      app.field('expenses', person('person', 'Who', true));
      app.field('expenses', day('date', 'Day', true));
      app.field('expenses', number('amount', 'Amount', { required: true, format: app.format(true) }));
      if (app.money.multi) app.field('expenses', currencyField(app));
      if (kinds.length > 0) app.field('expenses', { ...select('category', 'Category', kinds), chips: true });
      app.field('expenses', link('budget_line', 'Budget line', app.path('budget-lines')));
      if (projects) app.field('expenses', link('project', 'Project', app.path('projects')));
      app.field('expenses', select('status', 'Status', ['Submitted', 'Approved', 'Rejected', 'Reimbursed'], { Submitted: 'yellow', Approved: 'blue', Rejected: 'red', Reimbursed: 'green' }, 'Submitted'));
      app.field('expenses', { ...person('approved_by', 'Approved by'), when: [{ field: 'status', op: 'is', value: ['Approved', 'Reimbursed'] }] });
      app.field('expenses', { ...text('reason', 'Why rejected'), when: [{ field: 'status', op: 'is', value: ['Rejected'] }] });
      app.notes('expenses', 'attach');
      app.newForm('expenses', ['amount', ...(kinds.length > 0 ? ['category'] : []), 'date', 'name']);
      app.block('expenses', { block: 'actions', column: 1 });
      app.block('expenses', { block: 'linked', collection: payTo, style: 'list', title: 'Paid back', fields: ['status', 'paid_on'] });
      app.field('payments', link('expense', 'Expense', app.path('expenses')));
      const also = [...(app.money.multi ? ['currency: currency'] : []), ...(projects ? ['project: project'] : [])];
      app.rule('expenses', {
        kind: 'action',
        name: 'Approve',
        src: `action("Approve", {
  when: () => status == "Submitted",
  hint: "",
  ask: {
    line: { label: "Budget line", type: "link", collection: "${app.called('budget-lines')}", chips: true, default: () => budget_line, required: true, note: () => empty(input.line) ? "" : ${money('amount')} + " to pay back" + (empty(person) ? "" : " to " + person) + " goes to To pay · " + input.line.name + ": " + ${money('input.line.actual + amount')} + " of " + ${money('input.line.planned')} + " this month" },
  },
  done: () => name + " · approved",
}, () => {
  budget_line = input.line
  status = "Approved"
  approved_by = me()
  add("${app.called('payments')}", { name: empty(person) ? name : name + " · " + person, direction: "Out", amount: amount, status: "Planned", party: person, budget_line: input.line, expense: this${dated ? ', due: today()' : ''}${also.map((a) => `, ${a}`).join('')} })
})`,
      });
      app.rule('expenses', {
        kind: 'action',
        name: 'Reject',
        src: `action("Reject", {
  when: () => status == "Submitted",
  hint: "",
  ask: { reason: { label: "Why", type: "text", required: true } },
  done: () => name + " · rejected",
}, () => {
  status = "Rejected"
  reason = input.reason
})`,
      });
      app.rule('payments', {
        kind: 'onSave',
        name: 'Expense paid back',
        src: `onSave("Expense paid back", () => {
  if (status == "Paid" && old.status != "Paid" && !empty(expense)) update(expense, { status: "Reimbursed" })
})`,
      });
      // The tabs, Expensify's: one's own, to approve, to pay back, paid back, rejected.
      const exSums = [
        { label: 'to approve', conditions: [{ field: 'status', op: 'is' as const, value: ['Submitted'] }] },
        { label: '', field: 'amount', conditions: [{ field: 'status', op: 'is' as const, value: ['Submitted'] }] },
        { label: 'to pay back', field: 'amount', conditions: [{ field: 'status', op: 'is' as const, value: ['Approved'] }] },
      ];
      const exColumns = ['person', ...(kinds.length > 0 ? ['category'] : []), 'date', 'amount', 'status'];
      const exTab = (id: string, name: string, conditions: Condition[], button?: string) =>
        app.view('expenses', { id, name, conditions, sort: { key: 'date', dir: 'desc' }, columns: exColumns, sums: exSums, set: 'expenses', ...(button && { button }) }, id === 'to-approve');
      exTab('mine', 'Mine', [{ field: 'person', op: 'is', value: ['me'] }]);
      exTab('to-approve', 'To approve', [{ field: 'status', op: 'is', value: ['Submitted'] }], 'Approve');
      exTab('to-pay-back', 'To pay back', [{ field: 'status', op: 'is', value: ['Approved'] }]);
      exTab('paid-back', 'Paid back', [{ field: 'status', op: 'is', value: ['Reimbursed'] }]);
      exTab('rejected', 'Rejected', [{ field: 'status', op: 'is', value: ['Rejected'] }]);
      app.homeTile('expenses', { off: true });
      app.homeTiles('expenses', [{ view: 'to-approve', title: 'To approve', head: [{ label: '' }, { label: '', field: 'amount' }], value: 'amount', sub: 'person', empty: 'Nothing waits for approval.', of: 'budget' }]);
    }

    const expected = app.has('sales') && dated && answers.expected !== false;
    if (expected) {
      const party = customerRole(app) === 'companies' && app.hasPiece('companies') ? ', company: customer' : '';
      app.rule('orders', {
        kind: 'onSave',
        name: 'Expected payment',
        src: `onSave("Expected payment", () => {
  if (status == "Invoiced" && old.status != "Invoiced" && linked("${app.called('payments')}").length == 0) {
    add("${app.called('payments')}", { name: code + " payment", direction: "In", amount: total, status: "Invoiced", due: due, party: empty(customer) ? "" : customer.name, budget_line: find("${app.called('budget-lines')}", { name: "Sales" })[0]${party} })
  }
  if (status == "Cancelled" && old.status != "Cancelled") {
    for (const p of linked("${app.called('payments')}")) {
      if (p.status != "Paid") remove(p)
    }
  }
})`,
      });
    }

    app.homeTile('budget-lines', { off: true });
    app.homeTile('payments', { off: true });
    app.homeTiles('budget-lines', [{ view: 'over', title: 'Over budget', head: [{ label: 'over', warn: true }], value: 'remaining', empty: 'Every line is within its budget.', of: 'budget' }]);
    app.homeTiles('payments', [
      { view: 'month', title: 'This month', head: [{ label: 'net', field: 'signed' }], lines: [{ label: 'In', field: 'amount', conditions: [comes] }, { label: 'Out', field: 'amount', conditions: [out] }, { label: 'Most spent on', field: 'amount', conditions: [out], by: 'budget_line' }], of: 'budget' },
      { view: 'to-pay', title: 'To pay', head: dated ? [{ label: 'this week', field: 'amount', conditions: [{ field: 'due_week', op: 'true' }] }, { label: 'overdue', field: 'amount', conditions: [{ field: 'overdue', op: 'true' }], warn: true }] : [{ label: '', field: 'amount' }], value: dated ? 'due_said' : 'amount', sub: 'party', empty: 'Nothing to pay.', of: 'budget' },
    ]);

    app.about({
      title: 'Budget and spending',
      what: 'What you plan to earn and spend each month against what was paid, the bills to pay and the money to collect, all in one place.',
      pieces: ['budget-lines', 'payments', ...(expenses ? ['expenses'] : [])],
      glance: ['Each budget line against what was paid this month and this year', 'Over the payments, what is to pay this week, overdue and to collect', 'A payment due comes to Today with Mark paid', 'One that comes again writes the next', ...(expenses ? ['An approved expense goes to To pay'] : []), ...(expected ? ['An invoiced order adds the payment to collect'] : [])],
      how: [
        'Add a budget line for each kind of income and spending, with what you plan a month.',
        `Add each bill to ${app.called('payments')}, to whom and on which budget line${dated ? ', with its due day' : ''}; say how often it comes again; press Mark paid once it is paid, in Today on its day.`,
        ...(expenses ? [`Add your expenses to ${app.called('expenses')} with a photo of the receipt in their notes; Approve or Reject them.`] : []),
      ],
      auto: [
        'A budget line adds up what was paid for it this month and this year; at 80% of its plan its bar turns yellow, over it red.',
        'A payment out with no budget line is marked.',
        'Mark paid asks how much, when and how; a part paid leaves the rest to pay.',
        'A payment that comes again adds the next one when it is paid; one that pays itself is marked paid on its day.',
        ...(dated ? ['A payment past its due day that is not paid is Overdue.'] : []),
        ...(expenses ? ['Approve asks its budget line, writes who approved, and adds what is paid back to To pay; once it is paid, the expense is Reimbursed. Reject asks why.'] : []),
        ...(expected ? ['When an order is Invoiced, a payment waiting for its total is added, due on its due day; when an order is Cancelled, its unpaid payments are taken away.'] : []),
      ],
      work: ['Who may spend how much without asking.', ...(expenses ? ['Who approves expenses, and when they are paid back.'] : []), 'Who pays the bills, and on which days.'],
    });
  },
};
