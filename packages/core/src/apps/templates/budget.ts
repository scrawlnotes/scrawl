import { currencyField, day, formula, inMain, link, nameField, number, PERCENT, person, rollup, select, text } from '../pieces';
import { byDueDay, companies, payments } from '../shared';
import type { AppTemplate } from '../types';
import { customerRole } from './sales';

const CATEGORIES = ['Rent', 'Salaries', 'Marketing', 'Software', 'Travel', 'Other'];
const EXPENSE_CATEGORIES = ['Travel', 'Meals', 'Supplies', 'Equipment', 'Other'];

/** The period a budget line starts in, as it is written: the year, or the year and the month. */
const PERIODS: { [answer: string]: string } = { yearly: '=text(year(today()))', monthly: '=text(year(today())) + "-" + text(month(today()))' };

export const budget: AppTemplate = {
  id: 'budget',
  version: 1,
  group: 'money',
  name: 'apps.budget.name',
  what: 'apps.budget.what',
  questions: [
    { key: 'categories', kind: 'list', label: 'apps.budget.categories', default: CATEGORIES },
    {
      key: 'periods',
      kind: 'choice',
      label: 'apps.budget.periods',
      options: [
        { value: 'none', label: 'apps.budget.periods.none' },
        { value: 'yearly', label: 'apps.budget.periods.yearly' },
        { value: 'monthly', label: 'apps.budget.periods.monthly' },
      ],
      default: 'none',
    },
    { key: 'due', kind: 'yesno', label: 'apps.budget.due', default: true },
    { key: 'expenses', kind: 'yesno', label: 'apps.budget.expenses', default: false },
    { key: 'expenseCategories', kind: 'list', label: 'apps.budget.expenseCategories', default: EXPENSE_CATEGORIES, when: ({ answers }) => answers.expenses === true },
    { key: 'expected', kind: 'yesno', label: 'apps.budget.expected', default: true, when: ({ chosen, answers }) => chosen.has('sales') && answers.due !== false },
  ],
  money: () => true,
  pieces: (answers) => ['budget-lines', 'payments', ...(answers.expenses === true ? ['expenses'] : [])],
  build(app, answers) {
    const categories = (answers.categories as string[] | undefined) ?? CATEGORIES;
    const expenses = answers.expenses === true;
    const projects = app.hasPiece('projects');
    const main = app.format(false);
    const payTo = app.path('payments');
    companies(app);
    payments(app);

    app.field('budget-lines', nameField());
    app.field('budget-lines', select('type', 'Type', ['Income', 'Expense'], { Income: 'green', Expense: 'red' }, 'Expense'));
    if (categories.length > 0) app.field('budget-lines', select('category', 'Category', categories));
    const period = PERIODS[answers.periods as string];
    if (period) app.field('budget-lines', { ...text('period', 'Period'), default: period });
    app.field('budget-lines', number('planned', 'Planned', { format: main }));
    if (projects) app.field('budget-lines', link('project', 'Project', app.path('projects')));
    app.field('budget-lines', rollup('actual', 'Actual', payTo, 'sum', 'amount', [{ field: 'status', op: 'is', value: ['Paid'] }, ...inMain(app)], main));
    app.field('budget-lines', formula('remaining', 'Remaining', 'planned - actual', main));
    app.field('budget-lines', formula('used', 'Used', 'planned > 0 ? actual / planned : 0', PERCENT));
    app.field('budget-lines', formula('state', 'State', 'actual > planned ? "Over" : "OK"'));
    app.block('budget-lines', { block: 'linked', collection: payTo, style: 'table', fields: ['date', 'amount', 'status'], sums: true });
    if (app.has('sales')) app.record('budget-lines', { name: 'Sales', type: 'Income' });

    if (categories.length > 0) app.field('payments', select('category', 'Category', categories));
    app.field('payments', link('budget_line', 'Budget line', app.path('budget-lines')));
    if (projects) {
      app.field('payments', link('project', 'Project', app.path('projects')));
      app.block('projects', { block: 'linked', collection: app.path('budget-lines'), style: 'table', fields: ['planned', 'actual', 'remaining'], sums: true });
      app.block('projects', { block: 'linked', collection: payTo, style: 'table', fields: ['direction', 'amount', 'status'], sums: true });
    }
    app.rule('payments', { kind: 'check', name: 'Pick the budget line', src: 'check("budget_line", () => direction != "Out" || !empty(budget_line), "Pick the budget line")' });
    app.rule('payments', {
      kind: 'action',
      name: 'Mark paid',
      src: `action("Mark paid", { when: () => status != "Paid", hint: "It is paid" }, () => {
  status = "Paid"
  if (empty(paid_on)) paid_on = today()
})`,
    });

    if (expenses) {
      const kinds = (answers.expenseCategories as string[] | undefined) ?? EXPENSE_CATEGORIES;
      app.field('expenses', nameField('Title'));
      app.field('expenses', person('person', 'Person', true));
      app.field('expenses', day('date', 'Date', true));
      app.field('expenses', number('amount', 'Amount', { required: true, format: app.format(true) }));
      if (app.money.multi) app.field('expenses', currencyField(app));
      if (kinds.length > 0) app.field('expenses', select('category', 'Category', kinds));
      app.field('expenses', link('budget_line', 'Budget line', app.path('budget-lines')));
      if (projects) app.field('expenses', link('project', 'Project', app.path('projects')));
      app.field('expenses', select('status', 'Status', ['Submitted', 'Approved', 'Rejected', 'Reimbursed'], { Submitted: 'blue', Approved: 'yellow', Rejected: 'red', Reimbursed: 'green' }, 'Submitted'));
      app.field('expenses', person('approved_by', 'Approved by'));
      app.field('expenses', text('reason', 'Reason rejected'));
      app.block('expenses', { block: 'linked', collection: payTo, style: 'list', fields: ['status', 'paid_on'] });
      app.field('payments', link('expense', 'Expense', app.path('expenses')));
      app.rule('expenses', {
        kind: 'check',
        name: 'Pick the budget line before it is approved',
        src: 'check("budget_line", () => status == "Submitted" || status == "Rejected" || !empty(budget_line), "Pick the budget line before it is approved")',
      });
      const also = [...(app.money.multi ? ['currency: currency'] : []), ...(projects ? ['project: project'] : [])];
      app.rule('expenses', {
        kind: 'action',
        name: 'Approve',
        src: `action("Approve", { when: () => status == "Submitted", hint: "Only a submitted expense" }, () => {
  status = "Approved"
  approved_by = me()
  add("${app.called('payments')}", { name: name, direction: "Out", amount: amount, status: "Planned", budget_line: budget_line${also.map((a) => `, ${a}`).join('')} })
})`,
      });
      app.rule('expenses', {
        kind: 'action',
        name: 'Reject',
        src: `action("Reject", {
  when: () => status == "Submitted",
  hint: "Only a submitted expense",
  ask: { reason: { label: "Reason", type: "text", required: true } },
}, () => {
  status = "Rejected"
  reason = input.reason
})`,
      });
      app.rule('payments', {
        kind: 'onSave',
        name: 'Expense reimbursed',
        src: `onSave("Expense reimbursed", () => {
  if (status == "Paid" && old.status != "Paid" && !empty(expense)) update(expense, { status: "Reimbursed" })
})`,
      });
    }

    const expected = app.has('sales') && byDueDay(app) && answers.expected !== false;
    if (expected) {
      const party = customerRole(app) === 'companies' && app.hasPiece('companies') ? ', company: customer' : '';
      app.rule('orders', {
        kind: 'onSave',
        name: 'Expected payment',
        src: `onSave("Expected payment", () => {
  if (status == "Invoiced" && old.status != "Invoiced" && linked("${app.called('payments')}").length == 0) {
    add("${app.called('payments')}", { name: code + " payment", direction: "In", amount: total, status: "Invoiced", due: due, budget_line: find("${app.called('budget-lines')}", { name: "Sales" })[0]${party} })
  }
  if (status == "Cancelled" && old.status != "Cancelled") {
    for (const p of linked("${app.called('payments')}")) {
      if (p.status != "Paid") remove(p)
    }
  }
})`,
      });
    }

    app.about({
      title: 'Budget and spending',
      what: 'What you plan to earn and spend, and the money that comes in and goes out, all in one place.',
      pieces: ['budget-lines', 'payments', ...(expenses ? ['expenses'] : [])],
      how: [
        `Add a budget line for each kind of income and spending${period ? ' and period' : ''}, with what you plan.`,
        `Add each payment to ${app.called('payments')}, linked to its budget line${byDueDay(app) ? ', with its due day' : ''}; press Mark paid once it is paid.`,
        ...(expenses ? [`Add your expenses to ${app.called('expenses')} with the receipt's photo in their notes; Approve or Reject them.`] : []),
      ],
      auto: [
        'A budget line adds up what was paid for it, and says what is left and when it is over.',
        'A payment out with no budget line is marked.',
        'When a payment is Paid, its day is written.',
        ...(byDueDay(app) ? ['A payment past its due day that is not paid is Overdue.'] : []),
        ...(expenses ? ['Approve writes who approved and adds the payment to the person; once it is paid, the expense is Reimbursed. Reject asks why.'] : []),
        ...(expected ? ['When an order is Invoiced, a payment waiting for its total is added, due on its due day; when an order is Cancelled, its unpaid payments are taken away.'] : []),
      ],
      work: ['Who may spend how much without asking.', ...(expenses ? ['Who approves expenses, and when they are paid back.'] : []), 'Who pays the bills, and on which days.'],
    });
  },
};
