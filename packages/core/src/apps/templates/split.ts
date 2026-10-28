import { checkbox, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Shared expenses (design/more-apps.md 4.11): a trip, a flat, a family. Who paid what, split
// between whom; each one's share written as an expense is saved, the cents left over on the one
// who paid; balances from the shares, and Settle up writing who pays whom, at most one payment
// fewer than the people who are owed or owe. With Travel a trip is the group; with Personal
// finance your own share is written as spent.

const CATEGORIES = ['Food', 'Transport', 'Stay', 'Home', 'Fun', 'Other'];

export const split: AppTemplate = {
  id: 'split',
  version: 1,
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
  menu: ['spending', 'groups', 'trips', 'settlements'],
  build(app, answers) {
    const travel = app.has('travel') && app.hasPiece('trips');
    // A trip is the group with Travel: its link is the trip's.
    const groups = travel ? 'trips' : 'groups';
    const key = travel ? 'trip' : 'group';
    const all = answers.methods === 'all';
    const abroad = answers.abroad === true;
    const mine = app.has('finance') && app.hasPiece('transactions') && answers.finance !== false;
    const members = app.called('group-members');
    const shares = app.called('shares');
    const settlements = app.called('settlements');
    const main = app.format(false);
    const names = ((answers.people as string[] | undefined) ?? []).map((n) => n.trim()).filter(Boolean);

    if (!travel) {
      app.field('groups', nameField());
      app.field('groups', rollup('total', 'Spent', app.path('spending'), 'sum', 'total', undefined, main));
      app.record('groups', { name: app.title });
    }
    app.field(groups, rollup('members', 'People', app.path('group-members'), 'count'));
    app.field(groups, formula('each', 'Each, on average', `members > 0 ? ${travel ? 'spent' : 'total'} / members : 0`, main));
    app.block(groups, { block: 'linked', collection: app.path('group-members'), style: 'table', fields: ['paid', 'owes', 'balance'] });
    app.block(groups, { block: 'linked', collection: app.path('settlements'), style: 'table', fields: ['from', 'to', 'amount', 'status'] });

    app.field('group-members', nameField());
    app.field('group-members', link(key, travel ? 'Trip' : 'Group', app.path(groups)));
    if (mine) app.field('group-members', checkbox('me', 'Me'));
    app.field('group-members', rollup('paid', 'Paid', app.path('shares'), 'sum', 'paid', undefined, main));
    app.field('group-members', rollup('owes', 'Share', app.path('shares'), 'sum', 'owes', undefined, main));
    app.field('group-members', formula('balance', 'Balance', 'paid - owes', main));
    app.block('group-members', { block: 'linked', collection: app.path('shares'), style: 'table', fields: ['paid', 'owes'], sums: true });
    for (const name of names) app.record('group-members', { name, ...(!travel && { group: app.title }) });

    app.field('spending', nameField('What'));
    if (!travel) app.field('spending', link('group', 'Group', app.path('groups')));
    app.field('spending', day('date', 'Date', true));
    app.field('spending', number('amount', 'Amount', { required: true, format: abroad ? { style: 'number', decimals: 2 } : main }));
    if (abroad) {
      app.field('spending', text('currency', 'Currency'));
      app.field('spending', number('rate', 'Rate', { default: 1 }));
    }
    app.field('spending', formula('total', abroad ? 'In the group’s currency' : 'Total', abroad ? 'amount * (rate || 1)' : 'amount', main));
    app.field('spending', { ...link('payer', 'Paid by', app.path('group-members')), required: true });
    app.field('spending', link('between', 'Split between', app.path('group-members'), true));
    if (all) app.field('spending', select('split', 'Split', ['Equally', 'By amounts', 'By shares'], {}, 'Equally'));
    if (!travel) app.field('spending', select('category', 'Category', CATEGORIES));
    app.field('spending', rollup('shared', 'Shared', app.path('shares'), 'sum', 'owes', undefined, main));
    app.block('spending', { block: 'linked', collection: app.path('shares'), style: 'table', fields: ['person', ...(all ? ['weight'] : []), 'owes', 'paid'], sums: true });

    app.field('shares', nameField());
    app.field('shares', { ...link('person', 'Who', app.path('group-members')), required: true });
    app.field('shares', link('expense', 'Expense', app.path('spending')));
    app.field('shares', link('settlement', 'Settlement', app.path('settlements')));
    if (all) app.field('shares', number('weight', 'Shares', { default: 1 }));
    app.field('shares', number('owes', 'Their share', { format: main, default: 0 }));
    app.field('shares', number('paid', 'Paid', { format: main, default: 0 }));

    app.field('settlements', nameField());
    app.field('settlements', link(key, travel ? 'Trip' : 'Group', app.path(groups)));
    app.field('settlements', { ...link('from', 'From', app.path('group-members')), required: true });
    app.field('settlements', { ...link('to', 'To', app.path('group-members')), required: true });
    app.field('settlements', number('amount', 'Amount', { required: true, format: main }));
    app.field('settlements', select('status', 'Status', ['Suggested', 'Paid'], { Suggested: 'yellow', Paid: 'green' }, 'Suggested'));
    app.field('settlements', day('paid_on', 'Paid on'));
    app.view('settlements', { id: 'to-pay', name: 'To pay', conditions: [{ field: 'status', op: 'is', value: ['Suggested'] }] }, true);

    // Each one's share as the expense is saved: equally, or by their shares, the cents left over on
    // the one who paid; by amounts it starts equal and each is written in its table.
    const whole = abroad ? 'round(amount * (empty(rate) ? 1 : rate), 2)' : 'amount';
    const weight = all ? '(split == "By shares" && !empty(kept.find((k) => k.person == p)) ? (kept.find((k) => k.person == p).weight || 1) : 1)' : '1';
    app.rule('spending', {
      kind: 'onSave',
      name: 'Shares',
      src: `onSave("Shares", () => {
  if (empty(${key}) && !empty(payer)) ${key} = payer.${key}
  if (empty(between) && !empty(${key})) between = find("${members}", { ${key}: ${key} })
  if (!empty(payer) && between.length > 0 && amount > 0 && (empty(old.amount) || amount != old.amount || payer != old.payer || text(between) != text(old.between)${all ? ' || split != old.split' : ''}${abroad ? ' || rate != old.rate' : ''})) {
    const kept = linked("${shares}")
    const whole = ${whole}
    const weights = sum(between.map((p) => ${weight}))
    let given = 0
    for (const p of between) {
      given = given + round(whole * ${weight} / weights, 2)
    }
    const first = between.includes(payer) ? payer : between[0]
    let myPart = 0
    for (const p of between) {
      const part = round(whole * ${weight} / weights, 2) + (p == first ? round(whole - given, 2) : 0)
      add("${shares}", { name: name + " · " + p.name, person: p, expense: this, ${all ? `weight: ${weight}, ` : ''}owes: part, paid: p == payer ? whole : 0 })${mine ? '\n      if (p.me) myPart = part' : ''}
    }
    if (!between.includes(payer)) add("${shares}", { name: name + " · " + payer.name, person: payer, expense: this, owes: 0, paid: whole })
    for (const s of kept) remove(s)${
      mine
        ? `
    for (const t of linked("${app.called('transactions')}")) remove(t)
    if (myPart > 0) add("${app.called('transactions')}", { name: name, account: find("${app.called('accounts')}", { type: "Bank" })[0] || find("${app.called('accounts')}")[0], amount: myPart, direction: "Out", date: date })`
        : ''
    }
  }
})`,
    });
    app.rule('spending', { kind: 'check', name: 'The shares do not add up', src: `check("amount", () => empty(amount) || shared == 0 || abs(shared - total) < 0.01, \`The shares come to \${text(shared)}, not \${text(total)}\`)` });
    if (all) {
      app.rule('spending', {
        kind: 'action',
        name: 'Split again',
        src: `action("Split again", { when: () => split == "By shares", hint: "Only one split by shares" }, () => {
  const kept = linked("${shares}").filter((s) => between.includes(s.person))
  const weights = sum(kept.map((k) => k.weight || 1))
  let given = 0
  for (const k of kept) {
    given = given + round(total * (k.weight || 1) / weights, 2)
  }
  const first = kept.find((k) => k.person == payer) || kept[0]
  for (const k of kept) {
    update(k, { owes: round(total * (k.weight || 1) / weights, 2) + (k == first ? round(total - given, 2) : 0) })
  }
})`,
      });
    }
    if (mine) app.field('transactions', link('shared', 'Shared expense', app.path('spending')));

    app.rule('settlements', {
      kind: 'onSave',
      name: 'Paid',
      src: `onSave("Paid", () => {
  if (status == "Paid" && old.status != "Paid") {
    if (empty(paid_on)) paid_on = today()
    add("${shares}", { name: from.name + " paid " + to.name, person: from, settlement: this, paid: amount, owes: 0 })
    add("${shares}", { name: to.name + " was paid by " + from.name, person: to, settlement: this, paid: 0, owes: amount })
  }
  if (status != "Paid" && old.status == "Paid") {
    for (const s of linked("${shares}")) remove(s)
  }
})`,
    });
    app.rule(groups, {
      kind: 'action',
      name: 'Settle up',
      src: `action("Settle up", { say: () => "Who pays whom, so that nobody owes anything", confirm: true }, () => {
  for (const s of find("${settlements}", { ${key}: this }).filter((s) => s.status != "Paid")) remove(s)
  const people = find("${members}", { ${key}: this })
  const owed = people.filter((p) => p.balance > 0.004)
  let before = 0
  for (const d of people.filter((p) => p.balance < -0.004)) {
    const debt = -d.balance
    let upTo = 0
    for (const c of owed) {
      const part = min(before + debt, upTo + c.balance) - max(before, upTo)
      if (part > 0.004) add("${settlements}", { name: d.name + " → " + c.name, ${key}: this, from: d, to: c, amount: round(part, 2), status: "Suggested" })
      upTo = upTo + c.balance
    }
    before = before + debt
  }
})`,
    });
    app.rule('group-members', { kind: 'check', name: 'Owes', src: 'check("balance", () => balance > -0.005, `Owes ${text(-balance)}`)' });

    app.about({
      title: 'Shared expenses',
      what: `Who paid what${travel ? ' on each trip' : ' in each group'}${names.length > 0 ? `, between ${names.join(', ')}` : ''}, who owes whom, and settling up.`,
      pieces: [...(travel ? [] : ['groups']), 'group-members', 'spending', 'shares', 'settlements'],
      glance: ["Each one's share written as an expense is saved", 'Balances from the shares', 'Settle up says who pays whom', ...(mine ? ['Your own share is written as spent'] : [])],
      how: [
        travel ? 'Add the people of a trip to Members, each with the trip.' : 'Add a group, and its people to Members, each with the group.',
        `Add each expense: what for, how much, who paid${all ? ', and how it is split' : ''}; it is split between all of the ${travel ? 'trip' : 'group'} unless you pick some.`,
        ...(all ? ['To split by amounts, write each one’s share in the table on its screen; by shares, write each one’s shares there and press Split again.'] : []),
        `Press Settle up on the ${travel ? 'trip' : 'group'}; when a payment is made, set it Paid.`,
        'Keep this app in a shared space for everyone to add what they paid; else one keeps it for all.',
      ],
      auto: [
        `When an expense is saved, each one's share is written${abroad ? ', in the group’s currency at its rate' : ''}; the cents left over go to the one who paid. When its amount, who paid or who shares it changes, the shares are written again.`,
        "Each one's balance is what they paid less their share: above nothing they are owed, below it they owe, and it is marked.",
        `Settle up takes back the payments not made yet and writes who pays whom how much, at most one fewer than the people in it; a payment set Paid counts in the balances.`,
        ...(mine ? [`Your own share, the one ticked Me, is written as spent in ${app.called('transactions')}, from your bank account.`] : []),
      ],
      work: ['Who adds the expenses, and when.', 'When we settle up.'],
    });
  },
};
