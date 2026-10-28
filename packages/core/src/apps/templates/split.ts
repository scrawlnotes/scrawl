import { calendar, checkbox, currencyField, day, formula, link, nameField, number, rollup, select, symbolOf } from '../pieces';
import type { AppDraft, AppTemplate } from '../types';

// Shared expenses (design/more-apps.md 4.11), as Tricount adds an expense: its title, its amount,
// who paid and when, then each one of the group with a tick and their share, equally, by amounts
// or by parts, the cents left over on the one who paid. A group shows each one's balance, who pays
// whom ticked Paid and its expenses. The rent is written again every month. With Travel a trip is
// the group; with Personal finance your own share is written as spent.

/** Whether Personal finance takes your own share. */
const mineOf = (app: AppDraft, answer: unknown) => app.has('finance') && app.hasPiece('transactions') && answer !== false;

/**
 * An expense's own fields, alone on a trip or shared: its title, its amount, in another of the
 * app's currencies at the rate used last for it, said as "1 EUR = 37,10 ₺", and its day.
 */
export function expenseFields(app: AppDraft): void {
  const main = app.format(false);
  const multi = app.money.multi;
  const sym = app.money.main ?? '';
  app.field('spending', nameField('Title'));
  app.field('spending', number('amount', 'Amount', { required: true, format: multi ? app.format(true) : main }));
  if (multi) {
    app.field('spending', { ...currencyField(app), beside: 'amount' });
    app.field('spending', { ...number('rate', 'Rate', { default: 1 }), rate: { field: 'currency', main: symbolOf(sym) }, when: [{ field: 'currency', op: 'is-not', value: [sym] }] });
    app.rule('spending', {
      kind: 'onChange',
      name: 'Its rate',
      src: `onChange("currency", "Its rate", () => {
  const before = find("${app.called('spending')}", { currency: currency }).filter((e) => !empty(e.rate) && !empty(e.date))
  if (currency == ${JSON.stringify(sym)}) rate = 1
  else if (before.length > 0 && (empty(rate) || rate == 1 || rate == old.rate)) rate = before.filter((e) => e.date == max(before.map((b) => b.date)))[0].rate
})`,
    });
  }
  app.field('spending', formula('total', 'Total', multi ? `amount * (empty(rate) || currency == ${JSON.stringify(sym)} ? 1 : rate)` : 'amount', main));
  app.field('spending', day('date', 'When', true));
  app.field('spending', formula('this_month', 'This month', 'year(date) == year(today()) && month(date) == month(today())'));
  app.notes('spending', 'attach');
}

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
  version: 3,
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
    const multi = app.money.multi;
    const mine = mineOf(app, answers.finance);
    const members = app.called('group-members');
    const shares = app.called('shares');
    const settlements = app.called('settlements');
    const expenses = app.called('spending');
    const main = app.format(false);
    const sym = app.money.main ?? '';
    const money = (expr: string) => `${JSON.stringify(symbolOf(sym))} + text(round(${expr}, 2))`;
    const names = ((answers.people as string[] | undefined) ?? []).map((n) => n.trim()).filter(Boolean);
    // The people and who pays whom: on the left of a group's window, on the right of a trip's.
    const side = { column: travel ? 3 : 1 };

    if (!travel) {
      app.field('groups', nameField());
      app.field('groups', rollup('total', 'Spent', app.path('spending'), 'sum', 'total', undefined, main));
      app.field('groups', rollup('month', 'This month', app.path('spending'), 'sum', 'total', [{ field: 'this_month', op: 'true' }], main));
      app.record('groups', { name: 'Home' });
    }
    app.field(groups, rollup('members', 'People', app.path('group-members'), 'count'));
    app.field(groups, formula('each', 'Each, on average', `members > 0 ? ${travel ? 'spent' : 'total'} / members : 0`, main));
    app.field(groups, { ...rollup('to_settle', 'To settle', app.path('settlements'), 'list', 'said', [{ field: 'paid', op: 'false' }]), rollup: { from: app.path('settlements'), fn: 'list', field: 'said', where: [{ field: 'paid', op: 'false' }] } });
    // Each one's balance, who pays whom ticked as it is paid (Tricount, Splitwise).
    app.block(groups, { block: 'linked', collection: app.path('group-members'), look: 'checklist', title: 'People', fields: ['balance'], ...side });
    app.block(groups, { block: 'linked', collection: app.path('settlements'), look: 'checklist', title: 'Who pays whom', fields: ['paid', 'amount'], done: true, ...side });
    if (!travel) {
      app.field('groups', formula('said', 'Says', `text(members) + " people · " + ${money('month')} + " this month"`));
      app.head('groups', 'said');
      app.notes('groups', false);
      app.tableColumns('groups', ['members', 'month', 'to_settle']);
      app.block('groups', { block: 'linked', collection: app.path('spending'), look: 'checklist', fields: ['payer', 'total'], sort: 'date', dir: 'desc', column: 2 });
      app.homeTile('groups', { value: 'month', sub: 'to_settle' });
    }

    app.field('group-members', nameField());
    app.field('group-members', link(key, travel ? 'Trip' : 'Group', app.path(groups)));
    if (mine) app.field('group-members', checkbox('me', 'Me'));
    app.field('group-members', rollup('paid', 'Paid', app.path('shares'), 'sum', 'paid', undefined, main));
    app.field('group-members', rollup('owes', 'Share', app.path('shares'), 'sum', 'part', undefined, main));
    app.field('group-members', formula('balance', 'Balance', 'paid - owes', main));
    app.block('group-members', { block: 'linked', collection: app.path('shares'), look: 'checklist', fields: ['part', 'paid'] });
    for (const name of names) app.record('group-members', { name, ...(!travel && { group: 'Home' }) });

    // An expense: what, how much, who paid and when; then each one of the group with a tick and their share.
    expenseFields(app);
    app.field('spending', { ...link('payer', 'Paid by', app.path('group-members')), required: true, within: key, default: '=last("date")' });
    app.field('spending', { ...link('between', 'For whom', app.path('group-members'), true), within: key });
    app.field('spending', {
      ...link(key, travel ? 'Trip' : 'Group', app.path(groups)),
      default: travel ? `=find("${app.called('trips')}").filter((t) => !empty(t.first) && t.first <= today() && (empty(t.last) || t.last >= today()))[0] || last("date")` : `=last("date") || find("${app.called('groups')}")[0]`,
    });
    if (!travel) {
      app.field('spending', checkbox('repeats', 'Every month'));
      app.field('spending', { ...day('next', 'Next'), help: 'The day it is written again', when: [{ field: 'repeats', op: 'true' }] });
      app.field('spending', formula('writes', 'Writes itself', 'repeats && !empty(next)'));
      app.field('spending', formula('says', 'Says', `${money('total')} + (empty(payer) ? "" : " · " + payer.name)`));
    }
    // A booking's expense, with Travel: written by its booking.
    if (travel && app.hasPiece('bookings')) app.field('spending', link('booking', 'Booking', app.path('bookings')));
    if (all) app.field('spending', { ...select('split', 'For whom', ['Equally', 'By amounts', 'By parts'], {}, 'Equally'), chips: true });
    app.field('spending', rollup('shared', 'Shared', app.path('shares'), 'sum', 'part', undefined, main));
    app.block('spending', { block: 'linked', collection: app.path('shares'), look: 'split', pick: 'between', person: 'person', amount: 'owes', parts: 'weight', mode: 'split', total: 'total', fields: ['part'], column: 1 });
    app.formOrder('spending', ['name', 'amount', 'currency', 'rate', 'payer', 'date', key, 'repeats', 'next', 'split']);
    app.tableColumns('spending', ['date', 'payer', 'total']);
    // Its groups say what is spent on Home; a count of expenses says nothing.
    app.homeTile('spending', { off: true });
    if (!travel) app.view('spending', { id: 'all', name: 'All', conditions: [], sort: { key: 'date', dir: 'desc' }, group: 'group', columns: ['date', 'payer', 'total'] }, true);

    app.field('shares', nameField());
    app.field('shares', { ...link('person', 'Who', app.path('group-members')), required: true });
    app.field('shares', link('expense', 'Expense', app.path('spending')));
    app.field('shares', link('settlement', 'Settlement', app.path('settlements')));
    if (all) app.field('shares', number('weight', 'Parts', { default: 1 }));
    app.field('shares', number('owes', 'Share', { format: main, default: 0 }));
    // By parts, each one's share is the expense's total over its parts; else what is written.
    app.field('shares', formula('part', 'Comes to', all ? 'empty(expense) || expense.split != "By parts" || expense.weights == 0 ? owes : round(expense.total * (weight || 1) / expense.weights, 2)' : 'owes', main));
    app.field('shares', number('paid', 'Paid', { format: main, default: 0 }));
    if (all) app.field('spending', rollup('weights', 'Parts', app.path('shares'), 'sum', 'weight'));

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
    // as it is saved from anywhere else; equally to start with, by amounts or by parts beside each one.
    const whole = multi ? 'total' : 'amount';
    app.rule('spending', {
      kind: 'onChange',
      name: 'Shares',
      src: `onChange(["amount", "payer", "between", "${key}"${all ? ', "split"' : ''}${multi ? ', "currency", "rate"' : ''}], "Shares", () => {
  if (empty(between) && !empty(${key})) between = find("${members}", { ${key}: ${key} })
  for (const s of linked("${shares}")) remove(s)
  const label = empty(name) ? "Expense" : name
${equalShares(app, { expense: 'this', whole, people: 'between', payer: 'payer', label: 'label', date: 'date', indent: '  ' })}
})`,
    });
    app.rule('spending', { kind: 'onSave', name: 'Its group', src: `onSave("Its group", () => {\n  if (empty(${key}) && !empty(payer)) ${key} = payer.${key}\n})` });
    app.rule('spending', { kind: 'check', name: 'The shares do not add up', src: `check("amount", () => empty(amount) || shared == 0 || abs(shared - total) < 0.01, \`The shares come to \${text(shared)}, not \${text(total)}\`)` });
    if (!travel) {
      // The rent: written anew on its next day, its shares as they are, then a month on.
      app.rule('spending', {
        kind: 'onSave',
        name: 'Its next day',
        src: `onSave("Its next day", () => {
  if (!repeats) next = null
  else if (empty(next)) next = date + months(1)
})`,
      });
      app.rule('spending', {
        kind: 'action',
        name: 'Add again',
        src: `action("Add again", { when: () => repeats && !empty(next), hint: "Only one that comes every month" }, () => {
  const e = add("${expenses}", { name: name, amount: amount, payer: payer, between: between, ${all ? 'split: split, ' : ''}group: group, date: next, repeats: false${multi ? ', currency: currency, rate: rate' : ''} })
  for (const s of linked("${shares}")) add("${shares}", { name: s.name, person: s.person, expense: e, ${all ? 'weight: s.weight, ' : ''}owes: s.owes, paid: s.paid })${
    mine
      ? `
  for (const t of find("${app.called('transactions')}", { shared: this })) add("${app.called('transactions')}", { name: t.name, account: t.account, amount: t.amount, direction: "Out", date: next, shared: e })`
      : ''
  }
  next = next + months(1)
})`,
      });
      app.view('spending', { ...calendar({ start: 'next', upcoming: true, button: 'Add again', auto: 'writes', words: ['says'] }, [{ field: 'repeats', op: 'true' }]), hidden: true });
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
  if (empty(old.destination) && linked("${members}").length == 0) {
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
      glance: ["Each one's share beside their name as the expense is typed", 'Balances from the shares', 'Who pays whom, each ticked as it is paid', ...(travel ? [] : ['The rent written again every month']), ...(mine ? ['Your own share is written as spent'] : [])],
      how: [
        travel ? 'The people of a trip are those the app was set up with; add others in its window.' : 'Add the people of a group in its window; Home is ready for the first.',
        `Add each expense: its title, its amount, who paid and when; all of the ${travel ? 'trip' : 'group'} share it, untick who is not in it${all ? ', or split it by amounts or by parts beside each one' : ''}.`,
        ...(travel ? [] : ['Tick Every month on the rent: it is written again on its day.']),
        `Press Settle up on the ${travel ? 'trip' : 'group'}; tick each payment as it is made.`,
        'Keep this app in a shared space for everyone to add what they paid; else one keeps it for all.',
      ],
      auto: [
        `Each one's share is worked out as the expense is typed${multi ? ', in the main currency at its rate' : ''}; the cents left over go to the one who paid.${all ? ' By parts, each one’s share is the total over the parts.' : ''}`,
        "Each one's balance is what they paid less their share: above nothing they are owed, below it they owe, and it is marked.",
        'Settle up takes back the payments not made yet and writes who pays whom how much, at most one fewer than the people in it; one ticked counts in the balances.',
        ...(travel ? [] : ['One that comes every month is written again on its next day with its shares, and said with Undo.']),
        ...(mine ? [`Your own share, the one ticked Me, is written as spent in ${app.called('transactions')}, from your bank account.`] : []),
      ],
      work: ['Who adds the expenses, and when.', 'When we settle up.'],
    });
  },
};
