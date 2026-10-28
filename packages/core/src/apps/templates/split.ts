import { calendar, checkbox, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppDraft, AppTemplate } from '../types';

// Shared expenses (design/more-apps.md 4.11): a trip, a flat, a family. The amount, who paid and for
// whom picked from the people of the group; each one's share shown on the form as it is typed,
// equally, by amounts or by shares, the cents left over on the one who paid; balances from the
// shares, and Settle up writing who pays whom, each ticked Paid. One that comes again, the rent, is
// written by itself every month. With Travel a trip is the group; with Personal finance your own
// share is written as spent.

const CATEGORIES = ['Food', 'Home', 'Transport', 'Stay', 'Fun', 'Other'];
const CATEGORY_COLORS = { Food: 'orange', Home: 'purple', Transport: 'blue', Stay: 'teal', Fun: 'pink', Other: 'gray' } as const;
/** What is spent on a trip on (design/more-apps.md 4.5). */
export const TRIP_CATEGORIES = ['Transport', 'Stay', 'Food', 'Activities', 'Shopping', 'Other'];
export const TRIP_COLORS = { Transport: 'blue', Stay: 'purple', Food: 'orange', Activities: 'pink', Shopping: 'teal', Other: 'gray' } as const;

/** Whether Personal finance takes your own share. */
const mineOf = (app: AppDraft, answer: unknown) => app.has('finance') && app.hasPiece('transactions') && answer !== false;

/**
 * The rules' lines that write an expense's shares equally between `people`, the cents left over on
 * the one who paid, and your own share in Personal finance: what an expense's form shows as it is
 * typed, and what a booking with an amount writes (design/more-apps.md 4.5).
 */
export function equalShares(app: AppDraft, o: { expense: string; whole: string; people: string; payer: string; label: string; date: string; indent: string }): string {
  const shares = app.called('shares');
  const all = app.answers('split').methods === 'all';
  const mine = mineOf(app, app.answers('split').finance);
  const i = o.indent;
  return [
    `if (!empty(${o.payer}) && !empty(${o.people}) && ${o.whole} > 0) {`,
    `  let given = 0`,
    `  for (const p of ${o.people}) {`,
    `    given = given + round(${o.whole} / ${o.people}.length, 2)`,
    `  }`,
    `  const first = ${o.people}.includes(${o.payer}) ? ${o.payer} : ${o.people}[0]`,
    `  let myPart = 0`,
    `  for (const p of ${o.people}) {`,
    `    const part = round(${o.whole} / ${o.people}.length, 2) + (p == first ? round(${o.whole} - given, 2) : 0)`,
    `    add("${shares}", { name: ${o.label} + " · " + p.name, person: p, expense: ${o.expense}, ${all ? 'weight: 1, ' : ''}owes: part, paid: p == ${o.payer} ? ${o.whole} : 0 })`,
    ...(mine ? [`    if (p.me) myPart = part`] : []),
    `  }`,
    `  if (!${o.people}.includes(${o.payer})) add("${shares}", { name: ${o.label} + " · " + ${o.payer}.name, person: ${o.payer}, expense: ${o.expense}, owes: 0, paid: ${o.whole} })`,
    ...(mine
      ? [
          `  for (const t of find("${app.called('transactions')}", { shared: ${o.expense} })) remove(t)`,
          `  if (myPart > 0) add("${app.called('transactions')}", { name: ${o.label}, account: find("${app.called('accounts')}", { type: "Bank" })[0] || find("${app.called('accounts')}")[0], amount: myPart, direction: "Out", date: ${o.date}, shared: ${o.expense} })`,
        ]
      : []),
    `}`,
  ]
    .map((line) => i + line)
    .join('\n');
}

export const split: AppTemplate = {
  id: 'split',
  version: 2,
  group: 'life',
  name: 'apps.split.name',
  short: 'apps.split.short',
  icon: 'share',
  what: 'apps.split.what',
  goesWith: ['finance', 'travel'],
  questions: [
    { key: 'people', kind: 'list', label: 'apps.split.people', default: [], help: 'apps.split.peopleHelp', add: 'apps.split.addPerson' },
    {
      key: 'methods',
      kind: 'choice',
      label: 'apps.split.methods',
      options: [
        { value: 'equal', label: 'apps.split.methods.equal' },
        { value: 'all', label: 'apps.split.methods.all' },
      ],
      default: 'equal',
    },
    { key: 'abroad', kind: 'yesno', label: 'apps.split.abroad', default: false, help: 'apps.split.abroadHelp' },
    { key: 'finance', kind: 'yesno', label: 'apps.split.finance', default: true, when: ({ chosen }) => chosen.has('finance'), because: 'finance' },
  ],
  money: () => true,
  pieces: (_answers, app) => [app.has('travel') ? 'trips' : 'groups', 'group-members', 'spending', 'shares', 'settlements'],
  menu: ['spending', 'groups', 'trips'],
  build(app, answers) {
    const travel = app.has('travel') && app.hasPiece('trips');
    // A trip is the group with Travel: its link is the trip's.
    const groups = travel ? 'trips' : 'groups';
    const key = travel ? 'trip' : 'group';
    const all = answers.methods === 'all';
    const abroad = answers.abroad === true;
    const mine = mineOf(app, answers.finance);
    const members = app.called('group-members');
    const shares = app.called('shares');
    const settlements = app.called('settlements');
    const expenses = app.called('spending');
    const main = app.format(false);
    const sym = app.money.main ?? '';
    const money = (expr: string) => `${JSON.stringify(sym + ' ')} + text(round(${expr}, 2))`;
    const names = ((answers.people as string[] | undefined) ?? []).map((n) => n.trim()).filter(Boolean);

    if (!travel) {
      app.field('groups', nameField());
      app.field('groups', rollup('total', 'Spent', app.path('spending'), 'sum', 'total', undefined, main));
      app.record('groups', { name: 'Home' });
    }
    app.field(groups, rollup('members', 'People', app.path('group-members'), 'count'));
    app.field(groups, formula('each', 'Each, on average', `members > 0 ? ${travel ? 'spent' : 'total'} / members : 0`, main));
    app.field(groups, { ...rollup('to_settle', 'To settle', app.path('settlements'), 'list', 'said', [{ field: 'paid', op: 'false' }]), rollup: { from: app.path('settlements'), fn: 'list', field: 'said', where: [{ field: 'paid', op: 'false' }] } });
    app.block(groups, { block: 'linked', collection: app.path('group-members'), style: 'table', fields: ['name', 'paid', 'owes', 'balance'] });
    app.block(groups, { block: 'linked', collection: app.path('settlements'), style: 'table', fields: ['paid', 'from', 'to', 'amount'], edit: ['paid'], done: true });
    if (!travel) {
      app.block('groups', { block: 'linked', collection: app.path('spending'), style: 'table', fields: ['date', 'name', 'payer', 'amount'], sort: 'date', dir: 'desc', sums: true });
      app.homeTile('groups', { value: 'total', sub: 'to_settle' });
    }

    app.field('group-members', nameField());
    app.field('group-members', link(key, travel ? 'Trip' : 'Group', app.path(groups)));
    if (mine) app.field('group-members', checkbox('me', 'Me'));
    app.field('group-members', rollup('paid', 'Paid', app.path('shares'), 'sum', 'paid', undefined, main));
    app.field('group-members', rollup('owes', 'Share', app.path('shares'), 'sum', 'part', undefined, main));
    app.field('group-members', formula('balance', 'Balance', 'paid - owes', main));
    app.block('group-members', { block: 'linked', collection: app.path('shares'), style: 'table', fields: ['part', 'paid'], sums: true });
    for (const name of names) app.record('group-members', { name, ...(!travel && { group: 'Home' }) });

    // An expense: its amount first, who paid and for whom tapped from the people of its group.
    app.field('spending', { ...nameField('Description'), optional: true, help: 'Left empty, its category’s name' });
    app.field('spending', number('amount', 'Amount', { required: true, format: abroad ? { style: 'number', decimals: 2 } : main }));
    if (abroad) {
      app.field('spending', text('currency', 'Currency'));
      app.field('spending', { ...number('rate', 'Rate', { default: 1 }), help: 'What one of it is in the group’s money' });
    }
    app.field('spending', formula('total', abroad ? 'In the group’s currency' : 'Total', abroad ? 'amount * (rate || 1)' : 'amount', main));
    app.field('spending', { ...link('payer', 'Paid by', app.path('group-members')), required: true, chips: true, within: key, default: '=last("date")' });
    app.field('spending', { ...link('between', 'For whom', app.path('group-members'), true), chips: true, within: key, help: 'Left empty, all of them' });
    if (all) app.field('spending', { ...select('split', 'Split', ['Equally', 'By amounts', 'By shares'], {}, 'Equally'), chips: true });
    // On a trip, a trip's categories: transport, a stay, food.
    app.field('spending', { ...(travel ? select('category', 'Category', TRIP_CATEGORIES, TRIP_COLORS) : select('category', 'Category', CATEGORIES, CATEGORY_COLORS)), chips: true });
    if (travel && app.hasPiece('bookings')) app.field('spending', link('booking', 'Booking', app.path('bookings')));
    app.field('spending', {
      ...link(key, travel ? 'Trip' : 'Group', app.path(groups)),
      default: travel ? `=find("${app.called('trips')}").filter((t) => t.first <= today() && (empty(t.last) || t.last >= today()))[0] || last("date")` : `=last("date") || find("${app.called('groups')}")[0]`,
    });
    app.field('spending', day('date', 'Date', true));
    if (!travel) {
      app.field('spending', { ...select('repeats', 'Repeats', ['No', 'Weekly', 'Monthly'], {}, 'No'), chips: true });
      app.field('spending', { ...day('next', 'Next'), help: 'The day it is written again', when: [{ field: 'repeats', op: 'is-not', value: ['No'] }] });
      app.field('spending', formula('writes', 'Writes itself', 'repeats != "No" && !empty(next)'));
      app.field('spending', formula('says', 'Says', `${money('total')} + (empty(payer) ? "" : " · " + payer.name)`));
    }
    app.field('spending', rollup('shared', 'Shared', app.path('shares'), 'sum', 'part', undefined, main));
    app.block('spending', { block: 'linked', collection: app.path('shares'), style: 'table', fields: ['person', ...(all ? ['weight', 'owes', 'part'] : ['owes']), 'paid'], sums: true, edit: all ? ['owes', 'weight'] : [] });
    app.formOrder('spending', ['amount', 'currency', 'rate', 'payer', 'between', 'split', 'category', key, 'date', 'repeats', 'next', 'name']);
    app.tableColumns('spending', ['date', 'payer', 'between', 'total']);
    if (!travel) app.view('spending', { id: 'all', name: 'All', conditions: [], sort: { key: 'date', dir: 'desc' }, group: 'group' }, true);

    app.field('shares', nameField());
    app.field('shares', { ...link('person', 'Who', app.path('group-members')), required: true });
    app.field('shares', link('expense', 'Expense', app.path('spending')));
    app.field('shares', link('settlement', 'Settlement', app.path('settlements')));
    if (all) app.field('shares', number('weight', 'Shares', { default: 1 }));
    app.field('shares', number('owes', 'Share', { format: main, default: 0 }));
    // By shares, each one's part is the expense's total over its shares; else what is written.
    app.field('shares', formula('part', 'Comes to', all ? 'empty(expense) || expense.split != "By shares" || expense.weights == 0 ? owes : round(expense.total * (weight || 1) / expense.weights, 2)' : 'owes', main));
    app.field('shares', number('paid', 'Paid', { format: main, default: 0 }));
    if (all) app.field('spending', rollup('weights', 'Shares', app.path('shares'), 'sum', 'weight'));

    app.field('settlements', nameField());
    app.field('settlements', link(key, travel ? 'Trip' : 'Group', app.path(groups)));
    app.field('settlements', { ...link('from', 'From', app.path('group-members')), required: true });
    app.field('settlements', { ...link('to', 'To', app.path('group-members')), required: true });
    app.field('settlements', number('amount', 'Amount', { required: true, format: main }));
    app.field('settlements', checkbox('paid', 'Paid'));
    app.field('settlements', day('paid_on', 'Paid on'));
    app.field('settlements', formula('said', 'Says', `from.name + " → " + to.name + " " + ${money('amount')}`));
    app.view('settlements', { id: 'to-pay', name: 'To pay', conditions: [{ field: 'paid', op: 'false' }] }, true);

    // Each one's share as the amount, who paid or for whom changes: on the form as it is typed, and
    // as it is saved from anywhere else; equally to start with, by amounts or by shares written in its table.
    const whole = abroad ? 'round(amount * (empty(rate) ? 1 : rate), 2)' : 'amount';
    app.rule('spending', {
      kind: 'onChange',
      name: 'Shares',
      src: `onChange(["amount", "payer", "between", "${key}"${all ? ', "split"' : ''}${abroad ? ', "rate"' : ''}], "Shares", () => {
  if (empty(between) && !empty(${key})) between = find("${members}", { ${key}: ${key} })
  for (const s of linked("${shares}")) remove(s)
  const label = empty(name) ? (${travel ? 'true' : 'empty(category)'} ? "Expense" : ${travel ? '""' : 'category'}) : name
${equalShares(app, { expense: 'this', whole, people: 'between', payer: 'payer', label: 'label', date: 'date', indent: '  ' })}
})`,
    });
    app.rule('spending', { kind: 'onSave', name: 'Its name', src: `onSave("Its name", () => {\n  if (empty(name)) name = ${travel ? 'empty(category) ? "Expense" : category' : 'empty(category) ? "Expense" : category'}\n  if (empty(${key}) && !empty(payer)) ${key} = payer.${key}\n})` });
    app.rule('spending', { kind: 'check', name: 'The shares do not add up', src: `check("amount", () => empty(amount) || shared == 0 || abs(shared - total) < 0.01, \`The shares come to \${text(shared)}, not \${text(total)}\`)` });
    if (!travel) {
      // One that comes again: written anew on its next day, its shares as they are, then a month or a week on.
      app.rule('spending', {
        kind: 'onSave',
        name: 'Its next day',
        src: `onSave("Its next day", () => {
  if (repeats == "No") next = null
  else if (empty(next)) next = repeats == "Weekly" ? date + 7 : date + months(1)
})`,
      });
      app.rule('spending', {
        kind: 'action',
        name: 'Add again',
        src: `action("Add again", { when: () => repeats != "No" && !empty(next), hint: "Only one that repeats" }, () => {
  const e = add("${expenses}", { name: name, amount: amount, payer: payer, between: between, ${all ? 'split: split, ' : ''}category: category, group: group, date: next, repeats: "No"${abroad ? ', currency: currency, rate: rate' : ''} })
  for (const s of linked("${shares}")) add("${shares}", { name: s.name, person: s.person, expense: e, ${all ? 'weight: s.weight, ' : ''}owes: s.owes, paid: s.paid })${
    mine
      ? `
  for (const t of find("${app.called('transactions')}", { shared: this })) add("${app.called('transactions')}", { name: t.name, account: t.account, amount: t.amount, direction: "Out", date: next, shared: e })`
      : ''
  }
  next = repeats == "Weekly" ? next + 7 : next + months(1)
})`,
      });
      app.view('spending', calendar({ start: 'next', upcoming: true, button: 'Add again', auto: 'writes', words: ['says'] }, [{ field: 'repeats', op: 'is-not', value: ['No'] }]));
    }
    if (mine) app.field('transactions', link('shared', 'Shared expense', app.path('spending')));

    app.rule('settlements', {
      kind: 'onSave',
      name: 'Paid',
      src: `onSave("Paid", () => {
  if (paid && !old.paid) {
    if (empty(paid_on)) paid_on = today()
    add("${shares}", { name: from.name + " paid " + to.name, person: from, settlement: this, paid: amount, owes: 0 })
    add("${shares}", { name: to.name + " was paid by " + from.name, person: to, settlement: this, paid: 0, owes: amount })
  }
  if (!paid && old.paid) {
    paid_on = null
    for (const s of linked("${shares}")) remove(s)
  }
})`,
    });
    app.rule(groups, {
      kind: 'action',
      name: 'Settle up',
      src: `action("Settle up", { say: () => "Who pays whom, so that nobody owes anything", confirm: true }, () => {
  for (const s of find("${settlements}", { ${key}: this }).filter((s) => !s.paid)) remove(s)
  const people = find("${members}", { ${key}: this })
  const owed = people.filter((p) => p.balance > 0.004)
  let before = 0
  for (const d of people.filter((p) => p.balance < -0.004)) {
    const debt = -d.balance
    let upTo = 0
    for (const c of owed) {
      const part = min(before + debt, upTo + c.balance) - max(before, upTo)
      if (part > 0.004) add("${settlements}", { name: d.name + " → " + c.name, ${key}: this, from: d, to: c, amount: round(part, 2), paid: false })
      upTo = upTo + c.balance
    }
    before = before + debt
  }
})`,
    });
    // With Travel, a new trip takes the people it was set up with, each its own on it.
    if (travel) {
      app.rule('trips', {
        kind: 'onSave',
        name: 'Its people',
        src: `onSave("Its people", () => {
  if (empty(old.first) && linked("${members}").length == 0) {
    for (const p of find("${members}").filter((m) => empty(m.trip))) add("${members}", { name: p.name${mine ? ', me: p.me' : ''} })
  }
})`,
      });
    }
    app.rule('group-members', { kind: 'check', name: 'Owes', src: 'check("balance", () => balance > -0.005, `Owes ${text(-balance)}`)' });

    app.about({
      title: 'Shared expenses',
      what: `Who paid what${travel ? ' on each trip' : ' in each group'}${names.length > 0 ? `, between ${names.join(', ')}` : ''}, who owes whom, and settling up.`,
      pieces: [...(travel ? [] : ['groups']), 'group-members', 'spending', 'shares', 'settlements'],
      glance: ["Each one's share on the form as it is typed", 'Balances from the shares', 'Who pays whom, each ticked Paid', ...(travel ? [] : ['What comes again written every month']), ...(mine ? ['Your own share is written as spent'] : [])],
      how: [
        travel ? 'Add the people of a trip in its window.' : 'Add the people of a group in its window; Home is ready for the first.',
        `Add each expense: its amount, who paid and for whom; all of the ${travel ? 'trip' : 'group'} to start with${all ? ', equally, by amounts or by shares written in its table' : ''}.`,
        ...(travel ? [] : ['Set Repeats to Monthly on the rent: it is written again on its day.']),
        `Press Settle up on the ${travel ? 'trip' : 'group'}; tick Paid on each payment as it is made.`,
        'Keep this app in a shared space for everyone to add what they paid; else one keeps it for all.',
      ],
      auto: [
        `Each one's share is worked out as the expense is typed${abroad ? ', in the group’s currency at its rate' : ''}; the cents left over go to the one who paid.${all ? ' By shares, each one’s part is the total over the shares.' : ''}`,
        "Each one's balance is what they paid less their share: above nothing they are owed, below it they owe, and it is marked.",
        'Settle up takes back the payments not made yet and writes who pays whom how much, at most one fewer than the people in it; one ticked Paid counts in the balances.',
        ...(travel ? [] : ['One that repeats is written again on its next day with its shares, and said with Undo.']),
        ...(mine ? [`Your own share, the one ticked Me, is written as spent in ${app.called('transactions')}, from your bank account.`] : []),
      ],
      work: ['Who adds the expenses, and when.', 'When we settle up.'],
    });
  },
};
