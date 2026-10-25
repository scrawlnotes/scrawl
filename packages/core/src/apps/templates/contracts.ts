import type { MessageKey } from '@scrawlnotes/i18n';
import type { View } from '../../collection';
import { calendar, checkbox, currencyField, day, formula, link, nameField, number, person, select } from '../pieces';
import { companies } from '../shared';
import type { AppTemplate } from '../types';
import { periodSpan } from './subscriptions';

// Contracts and renewals (design/more-apps.md 3.2): leases, insurance, suppliers, software and the
// customers' own; when each ends, and by when notice is given. The day to cancel by is worked
// out from its end, and a calendar of it brings each to Today and Upcoming in time; one that
// renews by itself and is past that day is marked.

const KINDS = ['customer', 'supplier', 'lease', 'insurance', 'software', 'service'];
const KIND_NAMES: { [kind: string]: string } = { customer: 'Customer', supplier: 'Supplier', lease: 'Lease', insurance: 'Insurance', software: 'Software', service: 'Service' };
const KIND_COLORS = { Customer: 'green', Supplier: 'orange', Lease: 'purple', Insurance: 'blue', Software: 'teal', Service: 'yellow' } as const;
const NOTICE = ['0', '15', '30', '60', '90'];

export const contracts: AppTemplate = {
  id: 'contracts',
  version: 1,
  group: 'work',
  name: 'apps.contracts.name',
  short: 'apps.contracts.short',
  icon: 'file',
  what: 'apps.contracts.what',
  questions: [
    {
      key: 'kinds',
      kind: 'multi',
      label: 'apps.contracts.kinds',
      options: KINDS.map((value) => ({ value, label: `apps.contracts.kind.${value}` as MessageKey })),
      default: KINDS,
    },
    {
      key: 'notice',
      kind: 'choice',
      label: 'apps.contracts.notice',
      options: NOTICE.map((value) => ({ value, label: `apps.contracts.notice.${value}` as MessageKey })),
      default: '30',
      help: 'apps.contracts.noticeHelp',
    },
    { key: 'seats', kind: 'yesno', label: 'apps.contracts.seats', default: true, when: ({ answers }) => Array.isArray(answers.kinds) && answers.kinds.includes('software'), under: 'kinds' },
  ],
  money: () => true,
  pieces: () => ['contracts', 'companies'],
  menu: ['contracts', 'companies'],
  build(app, answers) {
    const kinds = ((answers.kinds as string[] | undefined) ?? KINDS).map((k) => KIND_NAMES[k]!).filter(Boolean);
    const notice = Number(answers.notice ?? 30);
    const seats = kinds.includes('Software') && answers.seats !== false;
    const contact = app.hasPiece('people');
    const own = app.format(true);
    const span = periodSpan('period');
    const path = app.path('contracts');
    companies(app);

    app.field('contracts', nameField());
    app.field('contracts', link('party', 'With', app.path('companies')));
    if (contact) app.field('contracts', link('contact', 'Contact', app.path('people')));
    if (kinds.length > 0) app.field('contracts', select('type', 'Type', kinds, KIND_COLORS));
    app.field('contracts', person('owner', 'Owner', true));
    app.field('contracts', select('status', 'Status', ['Draft', 'Active', 'Ended', 'Cancelled'], { Draft: 'gray', Active: 'green', Ended: 'blue', Cancelled: 'red' }, 'Active'));
    app.field('contracts', day('start', 'Start'));
    app.field('contracts', day('ends', 'Ends'));
    app.field('contracts', checkbox('auto_renews', 'Renews by itself', true));
    app.field('contracts', number('notice_days', 'Notice (days)', { default: notice }));
    app.field('contracts', formula('cancel_by', 'Cancel by', 'ends - (notice_days || 0)'));
    app.field('contracts', number('amount', 'Amount', { format: own }));
    if (app.money.multi) app.field('contracts', currencyField(app));
    app.field('contracts', select('period', 'Period', ['Monthly', 'Quarterly', 'Yearly'], {}, 'Yearly'));
    app.field('contracts', formula('yearly', 'Yearly amount', 'amount * (period == "Monthly" ? 12 : period == "Quarterly" ? 4 : 1)', own));
    if (seats) app.field('contracts', number('seats', 'Seats'));

    // Cancel by brings each to Today and Upcoming; when each ends is a calendar of its own.
    const active = [{ field: 'status', op: 'is' as const, value: ['Active'] }];
    app.view('contracts', { ...calendar({ start: 'cancel_by', ...(kinds.length > 0 && { color: 'type' }), upcoming: true }, active), name: 'Cancel by' });
    const ends: View = { id: 'ends', name: 'Ends', kind: 'calendar', calendar: { start: 'ends', ...(kinds.length > 0 && { color: 'type' }), upcoming: false }, conditions: active };
    app.view('contracts', ends);

    app.block('companies', { block: 'linked', collection: path, style: 'list', fields: ['status', 'ends'], sort: 'ends' });
    if (contact) app.block('people', { block: 'linked', collection: path, style: 'list', fields: ['status', 'ends'], sort: 'ends' });

    app.rule('contracts', { kind: 'check', name: 'Notice passed; it renews', src: 'check("cancel_by", () => status != "Active" || !auto_renews || empty(cancel_by) || cancel_by >= today(), "Notice passed; it renews")' });
    app.rule('contracts', {
      kind: 'action',
      name: 'Renew',
      src: `action("Renew", { when: () => status == "Active" || status == "Ended", hint: "Only an active or an ended one" }, () => {
  if (!empty(start)) start = start + ${span}
  if (!empty(ends)) ends = ends + ${span}
  status = "Active"
})`,
    });
    app.rule('contracts', { kind: 'action', name: 'End', src: 'action("End", { when: () => status == "Active", hint: "Only an active one" }, () => {\n  status = "Ended"\n})' });
    app.rule('contracts', { kind: 'action', name: 'Cancel', src: 'action("Cancel", { when: () => status == "Active" || status == "Draft", hint: "Only a draft or an active one", confirm: true }, () => {\n  status = "Cancelled"\n})' });

    app.about({
      title: 'Contracts and renewals',
      what: `Your contracts${kinds.length > 0 ? `, ${kinds.map((k) => k.toLowerCase()).join(', ')}` : ''}: with whom, from when to when, what they cost, and by when to give notice.`,
      pieces: ['contracts', 'companies'],
      glance: ['The day to cancel by in Today and Upcoming', 'Notice passed on one that renews is marked', 'Renew, End and Cancel on each'],
      how: [
        `Add each contract with whom it is${contact ? ' and your contact there' : ''}, its start and its end, its notice and what it costs; put the signed copy in its notes.`,
        'Before its Cancel by day, decide: let it renew, or give notice and press End when it is over.',
        'Press Renew when it goes on for another period; Cancel when it stops before its end.',
      ],
      auto: [
        `Cancel by is its end less its notice${notice > 0 ? `, ${notice} days unless you write another` : ''}; the active ones come to Today and Upcoming on that day.`,
        'One that renews by itself and is past its Cancel by day is marked: it renews unless you have given notice.',
        'Its yearly amount is what it costs a year, by its period.',
        'Renew moves its start and its end a period on, by its period.',
      ],
      work: ['Who signs contracts, and who keeps them.', 'How long before a contract ends we decide to renew it.', ...(seats ? ['Who asks for more seats, and who gives them.'] : [])],
    });
  },
};
