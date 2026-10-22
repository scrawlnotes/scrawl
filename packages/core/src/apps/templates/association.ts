import { calendar, checkbox, codeField, currencyField, day, formula, inMain, link, multi, nameField, number, rollup, select } from '../pieces';
import { people } from '../shared';
import type { AppTemplate } from '../types';

// Association and club: members, dues, donations (design/more-apps.md 3.8). Dues are asked for by
// period: Issue dues on a period writes each active member's; one not paid by its day is marked,
// and a member who misses more than one period lapses, active again once they pay. Donations come
// from people, for a campaign when there is one; with Budget, what is paid goes there.

const TYPES = ['Regular', 'Student', 'Honorary'];

export const association: AppTemplate = {
  id: 'association',
  version: 1,
  group: 'customers',
  name: 'apps.association.name',
  short: 'apps.association.short',
  icon: 'person',
  what: 'apps.association.what',
  questions: [
    {
      key: 'dues',
      kind: 'choice',
      label: 'apps.association.dues',
      options: [
        { value: 'monthly', label: 'apps.association.dues.monthly' },
        { value: 'yearly', label: 'apps.association.dues.yearly' },
        { value: 'none', label: 'apps.association.dues.none' },
      ],
      default: 'yearly',
      help: 'apps.association.duesHelp',
    },
    { key: 'types', kind: 'list', label: 'apps.association.types', default: TYPES, add: 'apps.association.addType' },
    { key: 'donations', kind: 'yesno', label: 'apps.association.donations', default: true },
    { key: 'campaigns', kind: 'yesno', label: 'apps.association.campaigns', default: false, when: ({ answers }) => answers.donations !== false, under: 'donations' },
    { key: 'payments', kind: 'yesno', label: 'apps.association.payments', default: true, when: ({ chosen, answers }) => chosen.has('budget') && (answers.dues !== 'none' || answers.donations !== false), because: 'budget' },
  ],
  money: () => true,
  pieces: (answers) => [
    'members',
    ...(answers.dues !== 'none' ? ['dues-periods', 'dues'] : []),
    ...(answers.donations !== false ? ['donations', 'people'] : []),
    ...(answers.donations !== false && answers.campaigns === true ? ['campaigns'] : []),
  ],
  build(app, answers) {
    const types = (answers.types as string[] | undefined) ?? TYPES;
    const dues = app.hasPiece('dues');
    const gifts = app.hasPiece('donations');
    const drives = gifts && answers.campaigns === true;
    const paid = app.has('budget') && app.hasPiece('payments') && answers.payments !== false;
    const main = app.format(false);
    const own = app.format(true);
    const members = app.path('members');
    const pay = paid ? app.called('payments') : '';
    const line = (name: string) => `find("${app.called('budget-lines')}", { name: "${name}" })[0]`;
    people(app);

    app.field('members', nameField());
    app.field('members', { key: 'email', label: 'Email', type: 'email' });
    app.field('members', { key: 'phone', label: 'Phone', type: 'phone' });
    if (types.length > 0) app.field('members', select('type', 'Membership', types, {}, types[0]));
    app.field('members', day('joined', 'Member since', true));
    app.field('members', select('status', 'Status', ['Active', 'Lapsed', 'Left'], { Active: 'green', Lapsed: 'orange', Left: 'gray' }, 'Active'));
    app.field('members', checkbox('volunteer', 'Volunteer'));
    app.field('members', multi('skills', 'Skills', []));

    if (dues) {
      const owed = app.path('dues');
      const called = app.called('dues');
      const yearly = answers.dues !== 'monthly';
      app.field('dues-periods', { ...nameField('Period'), default: yearly ? '=text(year(today()))' : '=text(year(today())) + "-" + (month(today()) < 10 ? "0" : "") + text(month(today()))' });
      app.field('dues-periods', number('amount', 'Amount', { format: main }));
      app.field('dues-periods', day('due', 'Due'));
      app.field('dues-periods', rollup('issued', 'Issued', owed, 'count'));
      app.field('dues-periods', rollup('collected', 'Collected', owed, 'sum', 'amount', [{ field: 'status', op: 'is', value: ['Paid'] }], main));
      app.field('dues-periods', rollup('waiting', 'Not paid', owed, 'count', undefined, [{ field: 'status', op: 'is', value: ['Due'] }]));
      app.block('dues-periods', { block: 'linked', collection: owed, style: 'table', fields: ['member', 'amount', 'status'], sums: true });

      app.field('dues', nameField());
      app.field('dues', { ...link('member', 'Member', members), required: true });
      app.field('dues', link('period', 'Period', app.path('dues-periods')));
      app.field('dues', number('amount', 'Amount', { format: own }));
      if (app.money.multi) app.field('dues', currencyField(app));
      app.field('dues', day('due', 'Due'));
      app.field('dues', select('status', 'Status', ['Due', 'Paid', 'Waived'], { Due: 'yellow', Paid: 'green', Waived: 'gray' }, 'Due'));
      app.field('dues', day('paid_on', 'Paid on'));
      app.field('dues', formula('late', 'Late', 'status == "Due" && due < today()'));
      app.view('dues', calendar({ start: 'due', color: 'status', upcoming: true }, [{ field: 'status', op: 'is', value: ['Due'] }]));
      app.rule('dues', { kind: 'check', name: 'Past its due day', src: 'check("due", () => status != "Due" || empty(due) || due >= today(), "Past its due day")' });

      app.field('members', rollup('dues_paid', 'Dues paid', owed, 'sum', 'amount', [{ field: 'status', op: 'is', value: ['Paid'] }, ...inMain(app)], main));
      app.field('members', rollup('dues_late', 'Dues late', owed, 'count', undefined, [{ field: 'late', op: 'true' }]));
      app.block('members', { block: 'linked', collection: owed, style: 'table', fields: ['period', 'amount', 'status'], sums: true });

      // A member who is late with one period when the next is issued lapses.
      app.rule('dues-periods', {
        kind: 'action',
        name: 'Issue dues',
        src: `action("Issue dues", {
  when: () => amount > 0,
  hint: "Write its amount first",
  say: () => "Dues of " + name + " for each active member who has none",
  confirm: true,
}, () => {
  for (const m of find("${app.called('members')}", { status: "Active" })) {
    if (find("${called}", { member: m, period: this }).length == 0) {
      if (m.dues_late > 0) update(m, { status: "Lapsed" })
      add("${called}", { name: m.name + " · " + name, member: m, period: this, amount: amount${app.money.multi ? `, currency: "${app.money.main}"` : ''}, due: due })
    }
  }
})`,
      });
      app.rule('dues', {
        kind: 'onSave',
        name: 'Paid',
        src: `onSave("Paid", () => {
  if (status == "Paid" && old.status != "Paid") {
    if (empty(paid_on)) paid_on = today()${
      paid
        ? `
    add("${pay}", { name: name, direction: "In", amount: amount, status: "Paid", paid_on: today()${app.money.multi ? ', currency: currency' : ''}, budget_line: ${line('Dues')} })`
        : ''
    }
    if (!empty(member) && member.status == "Lapsed" && member.dues_late == 0) update(member, { status: "Active" })
  }
})`,
      });
      if (paid) {
        app.record('budget-lines', { name: 'Dues', type: 'Income' });
        app.field('payments', link('due', 'Due', owed));
      }
    }

    if (gifts) {
      const given = app.path('donations');
      app.field('donations', { ...codeField('RCP-'), label: 'Receipt no' });
      app.field('donations', nameField());
      app.field('donations', { ...link('donor', 'Donor', app.path('people')), required: true });
      app.field('donations', number('amount', 'Amount', { required: true, format: own }));
      if (app.money.multi) app.field('donations', currencyField(app));
      app.field('donations', day('date', 'Date', true));
      if (drives) app.field('donations', link('campaign', 'Campaign', app.path('campaigns')));
      app.field('people', rollup('donated', 'Donated', given, 'sum', 'amount', inMain(app), main));
      app.block('people', { block: 'linked', collection: given, style: 'table', fields: ['date', 'amount'], sort: 'date', sums: true });
      app.rule('donations', {
        kind: 'onSave',
        name: 'Received',
        src: `onSave("Received", () => {
  if (empty(name) && !empty(donor)) name = donor.name + " · " + text(date)${
    paid
      ? `
  if (empty(old.amount) && linked("${pay}").length == 0) add("${pay}", { name: name, direction: "In", amount: amount, status: "Paid", paid_on: date${app.money.multi ? ', currency: currency' : ''}, budget_line: ${line('Donations')} })`
      : ''
  }
})`,
      });
      if (paid) {
        app.record('budget-lines', { name: 'Donations', type: 'Income' });
        app.field('payments', link('donation', 'Donation', given));
      }
      if (drives) {
        app.field('campaigns', nameField());
        app.field('campaigns', number('target', 'Target', { format: main }));
        app.field('campaigns', rollup('raised', 'Raised', given, 'sum', 'amount', inMain(app), main));
        app.field('campaigns', formula('reached', 'Reached', 'target > 0 ? raised / target : 0', { style: 'percent' }));
        app.field('campaigns', day('start', 'Start', true));
        app.field('campaigns', day('end', 'End'));
        app.view('campaigns', calendar({ start: 'start', end: 'end' }));
        app.block('campaigns', { block: 'linked', collection: given, style: 'table', fields: ['donor', 'date', 'amount'], sort: 'date', sums: true });
      }
    }

    const duesText = answers.dues === 'monthly' ? 'monthly dues' : 'yearly dues';
    app.about({
      title: 'Association and club',
      what: `Your members${types.length > 0 ? ` (${types.join(', ')})` : ''}${dues ? `, their ${duesText}` : ''}${gifts ? `, and the donations${drives ? ' to your campaigns' : ''}` : ''}.`,
      pieces: ['members', ...(dues ? ['dues-periods', 'dues'] : []), ...(gifts ? ['donations', 'people'] : []), ...(drives ? ['campaigns'] : [])],
      glance: [
        ...(dues ? ['Issue dues writes each active member’s', 'Dues past their day are marked', 'A member late more than a period lapses'] : []),
        ...(gifts ? ['A donor shows what they gave'] : []),
        ...(drives ? ['A campaign adds up what it raised'] : []),
        ...(paid ? ['What is paid goes to Payments'] : []),
      ],
      how: [
        'Add each member with their membership and since when; set them Left when they leave.',
        ...(dues ? [`Add a period, ${answers.dues === 'monthly' ? 'a month' : 'a year'}, with its amount and its due day, and press Issue dues on it.`, 'Set a due Paid when it is paid, or Waived when it is let go.'] : []),
        ...(gifts ? [`Add each donation with its donor${drives ? ' and its campaign' : ''}; its receipt number is written by itself.`] : []),
      ],
      auto: [
        ...(dues
          ? [
              'Issue dues asks first, then adds a due of the period for each active member who has none; a member who is still late with an earlier one is made Lapsed instead.',
              'A due not paid by its day is marked; a member shows what they paid and how many are late.',
              'When a due is Paid, its day is written; a lapsed member with nothing else late is Active again.',
            ]
          : []),
        ...(gifts ? [`A donation is named after its donor and its day, with a receipt number; a person adds up what they gave.`] : []),
        ...(drives ? ['A campaign adds up its donations and how much of its target it reached.'] : []),
        ...(paid ? [`A due paid and a donation are written as payments in ${app.called('payments')}, under the Dues and Donations budget lines.`] : []),
      ],
      work: ['Who keeps the members and the dues.', ...(dues ? ['When dues are asked for, and what is done when someone does not pay.'] : []), ...(gifts ? ['Who thanks a donor, and how.'] : [])],
    });
  },
};
