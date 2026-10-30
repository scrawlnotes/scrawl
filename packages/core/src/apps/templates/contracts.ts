import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition } from '../../collection';
import { calendar, currencyField, day, formula, link, nameField, number, person, select, symbolOf, text } from '../pieces';
import { byDueDay, companies } from '../shared';
import type { AppTemplate } from '../types';

// Contracts and renewals (design/more-apps.md 3.2), as Tomorro, LawVu and PandaDoc keep them:
// leases, insurance, suppliers, software and the customers' own, from a draft out for signature to
// signed and active. One that renews by itself is renewed on its end day, its notice day in Today
// before then with Give notice; given, it ends by itself on that day. Renew asks how long and for
// how much, and its history says what each renewal did to the price. With Budget, what it costs is
// a payment that comes again, stopped when it is given notice.

const KINDS = ['customer', 'supplier', 'lease', 'insurance', 'software', 'service'];
const KIND_NAMES: { [kind: string]: string } = { customer: 'Customer', supplier: 'Supplier', lease: 'Lease', insurance: 'Insurance', software: 'Software', service: 'Service' };
const KIND_COLORS = { Customer: 'green', Supplier: 'orange', Lease: 'purple', Insurance: 'blue', Software: 'teal', Service: 'yellow' } as const;
const NOTICE = ['0', '15', '30', '60', '90'];
const STATUSES = ['Draft', 'Out for signature', 'Active', 'Notice given', 'Ended'];
const TERMS = ['1 month', '3 months', '1 year', '2 years', '3 years'];
const EVENTS = ['Sent', 'Signed', 'Renewed', 'Renewed by itself', 'Notice given', 'Ended'];

/** A term as a span a rule adds to a day. */
const termSpan = (f: string) => `(${f} == "1 month" ? months(1) : ${f} == "3 months" ? months(3) : ${f} == "2 years" ? years(2) : ${f} == "3 years" ? years(3) : years(1))`;
/** What a period's amount comes to in a year. */
const perYear = (f: string) => `(${f} == "Monthly" ? 12 : ${f} == "Quarterly" ? 4 : 1)`;
/** A day as a contract says it: "Nov 29". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;
/** A day with its year, as its history says it: "Nov 29, 2027". */
const long = (d: string) => `${short(d)} + ", " + text(year(${d}))`;

export const contracts: AppTemplate = {
  id: 'contracts',
  version: 2,
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
    { key: 'seats', kind: 'yesno', label: 'apps.contracts.seats', default: true, when: ({ answers }) => Array.isArray(answers.kinds) && (answers.kinds as string[]).includes('software'), under: 'kinds' },
  ],
  money: () => true,
  pieces: () => ['contracts', 'contract-events', 'companies'],
  menu: [{ role: 'contracts', view: 'active', name: 'Contracts' }, 'companies'],
  build(app, answers) {
    const kinds = ((answers.kinds as string[] | undefined) ?? KINDS).map((k) => KIND_NAMES[k]!).filter(Boolean);
    const notice = Number(answers.notice ?? 30);
    const seats = kinds.includes('Software') && answers.seats !== false;
    const contact = app.hasPiece('people');
    const paid = app.has('budget') && app.hasPiece('payments');
    const own = app.format(true);
    const main = app.format(false);
    const path = app.path('contracts');
    const events = app.called('contract-events');
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    const live: Condition = { field: 'status', op: 'is', value: ['Active', 'Notice given'] };
    const kind = kinds.length > 0 ? 'type' : '""';
    companies(app);

    app.field('contracts', nameField());
    app.field('contracts', link('party', 'With', app.path('companies')));
    if (contact) app.field('contracts', link('contact', 'Contact', app.path('people')));
    if (kinds.length > 0) app.field('contracts', { ...select('type', 'Type', kinds, KIND_COLORS), chips: true });
    app.field('contracts', person('owner', 'Owner', true));
    app.field('contracts', select('status', 'Status', STATUSES, { Draft: 'gray', 'Out for signature': 'blue', Active: 'green', 'Notice given': 'yellow', Ended: 'gray' }, 'Active'));
    app.field('contracts', day('start', 'Start'));
    app.field('contracts', day('ends', 'Ends'));
    app.field('contracts', { ...select('renews', 'Renews', ['By itself', 'No'], {}, 'By itself'), chips: true });
    const byItself = { field: 'renews', op: 'is' as const, value: ['By itself'] };
    app.field('contracts', { ...select('term', 'For another', TERMS, {}, '1 year'), when: [byItself], help: 'How long each renewal is' });
    app.field('contracts', { ...number('notice_days', 'Notice (days)', { default: notice }), when: [byItself] });
    app.field('contracts', formula('cancel_by', 'Notice by', 'renews == "By itself" && !empty(ends) ? ends - (notice_days || 0) : null'));
    app.field('contracts', number('amount', 'Amount', { format: own }));
    if (app.money.multi) app.field('contracts', currencyField(app));
    app.field('contracts', select('period', 'Period', ['Monthly', 'Quarterly', 'Yearly'], {}, 'Yearly'));
    app.field('contracts', formula('yearly', 'A year', `amount * ${perYear('period')}`, { ...own, decimals: 0 }));
    if (seats) app.field('contracts', { ...number('seats', 'Seats'), when: [{ field: 'type', op: 'is', value: ['Software'] }] });
    app.field('contracts', { ...day('sent_on', 'Sent on'), when: [{ field: 'status', op: 'is', value: ['Out for signature'] }] });
    app.field('contracts', day('signed_on', 'Signed on'));
    app.field('contracts', { ...day('notice_on', 'Notice given on'), when: [{ field: 'status', op: 'is', value: ['Notice given', 'Ended'] }] });
    app.field('contracts', { ...select('notice_how', 'Notice given by', ['Email', 'Letter', 'Portal']), when: [{ field: 'status', op: 'is', value: ['Notice given', 'Ended'] }] });
    app.field('contracts', { ...day('ended_on', 'Ended on'), when: [{ field: 'status', op: 'is', value: ['Ended'] }] });
    app.field('contracts', { ...text('why', 'Why it ended'), when: [{ field: 'status', op: 'is', value: ['Ended'] }] });
    app.field('contracts', formula('renews_itself', 'Renews on its day', 'status == "Active" && renews == "By itself"'));
    app.field('contracts', formula('ends_itself', 'Ends on its day', 'status == "Notice given"'));
    // Its notice day in Today until it has gone by: then it renews.
    app.field('contracts', formula('deciding', 'Notice still to give', 'renews_itself && !empty(cancel_by) && cancel_by >= today()'));
    app.field('contracts', formula('to_decide', 'To decide', 'deciding && cancel_by <= today() + 60'));
    app.field('contracts', formula('ending', 'Ending', '(status == "Notice given" || (status == "Active" && renews == "No")) && !empty(ends) && ends <= today() + 60'));
    app.field('contracts', formula('amount_said', 'Amount', `empty(amount) ? "" : ${money('amount')} + (period == "Monthly" ? " a month" : period == "Quarterly" ? " a quarter" : " a year")`));
    const noticeBy = `(cancel_by == today() ? "today" : ${short('cancel_by')})`;
    // What its row says of its days: "Renews Nov 29 · notice by today", "Ends Mar 31 · doesn't renew", "Sent 5 days ago".
    app.field(
      'contracts',
      formula(
        'when_said',
        'When',
        `status == "Draft" ? "Draft" : status == "Out for signature" ? (empty(sent_on) ? "Out for signature" : today() == sent_on ? "Sent today" : "Sent " + text(today() - sent_on) + (today() - sent_on == 1 ? " day ago" : " days ago")) : status == "Ended" ? (empty(ended_on) ? "Ended" : "Ended " + ${short('ended_on')}) : empty(ends) ? "" : status == "Notice given" ? "Ends " + ${short('ends')} : renews == "No" ? "Ends " + ${short('ends')} + " · doesn't renew" : "Renews " + ${short('ends')} + (deciding ? " · notice by " + ${noticeBy} : "")`,
      ),
    );
    app.field('contracts', formula('notice_said', 'Notice', `"renews " + (empty(ends) ? "" : ${short('ends')}) + (empty(amount) ? "" : " · " + amount_said) + " · notice by " + (empty(cancel_by) ? "" : ${noticeBy})`));
    // Its window's line: "Active · $14,400 a year · renews by itself Nov 29 · notice by today".
    app.field(
      'contracts',
      formula(
        'said',
        'Says',
        `status + (empty(amount) ? "" : " · " + ${money('yearly')} + " a year") + (empty(ends) || status == "Ended" ? "" : status == "Notice given" ? " · ends " + ${short('ends')} : renews == "No" ? " · ends " + ${short('ends')} + ", doesn't renew" : status == "Active" ? " · renews by itself " + ${short('ends')} + (deciding ? " · notice by " + ${noticeBy} + (cancel_by == today() ? "" : " (in " + text(cancel_by - today()) + (cancel_by - today() == 1 ? " day)" : " days)")) : "") : "")`,
      ),
    );
    app.head('contracts', 'said');
    app.formOrder('contracts', ['name', 'party', ...(contact ? ['contact'] : []), ...(kinds.length > 0 ? ['type'] : []), 'owner', 'status', 'start', 'ends', 'renews', 'term', 'notice_days', 'amount', ...(app.money.multi ? ['currency'] : []), 'period', ...(seats ? ['seats'] : [])]);
    app.newForm('contracts', ['name', 'party', ...(kinds.length > 0 ? ['type'] : []), 'status', 'start', 'ends', 'renews', 'term', 'notice_days', 'amount', 'period']);
    app.notes('contracts', 'attach');
    app.block('contracts', { block: 'actions', column: 1 });
    app.block('contracts', { block: 'linked', collection: app.path('contract-events'), style: 'timeline', title: 'History', fields: ['note'], sort: 'day', fixed: true, column: 2 });
    app.block('companies', { block: 'linked', collection: path, style: 'list', title: app.called('contracts'), fields: ['status', 'when_said'], sort: 'ends', column: 3 });
    if (contact) app.block('people', { block: 'linked', collection: path, style: 'list', title: app.called('contracts'), fields: ['status', 'when_said'], sort: 'ends', column: 3 });
    app.rule('contracts', { kind: 'check', name: 'The end is before the start', src: 'check("ends", () => empty(ends) || empty(start) || ends >= start, "The end is before the start")' });

    app.field('contract-events', nameField('What'));
    app.field('contract-events', link('contract', 'Contract', path));
    app.field('contract-events', select('kind', 'Kind', EVENTS, { Sent: 'blue', Signed: 'green', Renewed: 'green', 'Renewed by itself': 'green', 'Notice given': 'yellow', Ended: 'gray' }));
    app.field('contract-events', day('day', 'Day', true));
    app.field('contract-events', number('change', 'A year more', { format: main }));
    app.field('contract-events', text('note', 'Note'));
    const event = (kind: string, said: string, extra = '') => `add("${events}", { name: ${said}, contract: this, kind: ${kind}, day: today()${extra} })`;

    // With Budget, what it costs or brings is a payment that comes again, by its period.
    const payment = paid
      ? `
  if (!empty(amount)) add("${app.called('payments')}", { name: name, direction: ${kind} == "Customer" ? "In" : "Out", amount: amount, status: "Invoiced"${app.money.multi ? ', currency: currency' : ''}${byDueDay(app) ? ', due: start' : ''}, budget_line: input.line, repeats: period, party: empty(party) ? "" : party.name, contract: this })`
      : '';
    // Given notice or ended, its payment comes no more.
    const stop = paid ? `\n  for (const p of linked("${app.called('payments')}")) {\n    if (p.status != "Paid" && !empty(p.repeats)) update(p, { repeats: null })\n  }` : '';
    app.rule('contracts', {
      kind: 'action',
      name: 'Send for signature',
      src: `action("Send for signature", { when: () => status == "Draft", hint: "", done: () => name + " · out for signature" }, () => {
  status = "Out for signature"
  sent_on = today()
  ${event('"Sent"', '"Sent for signature"')}
})`,
    });
    app.rule('contracts', {
      kind: 'action',
      name: 'Signed',
      src: `action("Signed", {
  when: () => status == "Draft" || status == "Out for signature",
  hint: "",
  ask: {
    on: { label: "Signed on", type: "date", default: () => today(), required: true },
    starts: { label: "Starts", type: "date", default: () => empty(start) ? today() : start, required: true },
    until: { label: "Ends", type: "date", default: () => empty(ends) ? (empty(start) ? today() : start) + ${termSpan('term')} - 1 : ends },${paid ? `
    line: { label: "Budget line", type: "link", collection: "${app.called('budget-lines')}", chips: true, default: () => find("${app.called('budget-lines')}", { name: ${kind} })[0], note: () => empty(amount) ? "" : amount_said + (${kind} == "Customer" ? " to collect" : " to pay") + " from " + (empty(input.starts) ? "its start" : ${short('input.starts')}) + ", in Budget. Put the signed copy in its notes." },` : ''}
  },
  done: () => name + " · signed",
}, () => {
  status = "Active"
  signed_on = input.on
  start = input.starts
  ends = input.until
  ${event('"Signed"', `"Signed" + (empty(amount) ? "" : " · " + ${money('yearly')} + " a year")`)}${payment}
})`,
    });
    // Renew: until when and for how much; pressed on its end day by itself for one that renews by itself, as it was.
    app.rule('contracts', {
      kind: 'action',
      name: 'Renew',
      src: `action("Renew", {
  when: () => status == "Active",
  hint: "Only an active contract",
  ask: {
    until: { label: "Until", type: "date", default: () => (empty(ends) ? today() : ends) + ${termSpan('term')} },
    price: { label: "Amount", type: "number", default: () => amount, note: () => empty(input.price) || empty(amount) || input.price == amount ? "" : ${money('amount')} + " → " + ${money('input.price')} + ", " + (input.price > amount ? "+" : "") + text(round((input.price - amount) / amount * 100)) + "%" },
    note: { label: "Note", type: "text" },
  },
  done: () => name + " · renewed to " + ${long('ends')},
}, () => {
  const was = yearly
  const due = (empty(ends) ? today() : ends) + ${termSpan('term')}
  const to = empty(input.until) ? due : input.until
  // Another term at the same price of one that renews by itself is what it does by itself.
  const itself = renews == "By itself" && to == due && (empty(input.price) || input.price == amount)
  if (!empty(ends)) start = ends
  ends = to
  if (!empty(input.price)) amount = input.price
  const now = amount * ${perYear('period')}
  ${event('itself ? "Renewed by itself" : "Renewed"', `(itself ? "Renewed by itself to " : "Renewed to ") + ${long('to')}`, `, change: now - was, note: (now == was ? ${money('now')} + " a year" : ${money('was')} + " → " + ${money('now')} + " a year" + (was == 0 ? "" : " · " + (now > was ? "+" : "") + text(round((now - was) / was * 100)) + "%")) + (empty(input.note) ? "" : " · " + input.note)`)}
})`,
    });
    app.rule('contracts', {
      kind: 'action',
      name: 'Give notice',
      src: `action("Give notice", {
  when: () => status == "Active",
  hint: "Only an active contract",
  ask: {
    on: { label: "Given on", type: "date", default: () => today(), required: true },
    how: { label: "How", type: "choice", options: ["Email", "Letter", "Portal"], chips: true, default: "Email" },
    note: { label: "Note", type: "text", note: () => "It stays until " + (empty(ends) ? "its end" : ${short('ends')}) + ", Notice given; then it ends by itself.${paid ? ' Its payment in Budget comes no more.' : ''}" },
  },
  done: () => name + " · notice given, ends " + (empty(ends) ? "" : ${short('ends')}),
}, () => {
  status = "Notice given"
  notice_on = input.on
  notice_how = input.how
  ${event('"Notice given"', '"Notice given" + (empty(input.how) ? "" : " by " + input.how)', ', note: input.note')}${stop}
})`,
    });
    app.rule('contracts', {
      kind: 'action',
      name: 'End',
      src: `action("End", {
  when: () => status != "Ended",
  hint: "",
  ask: { why: { label: "Why", type: "text" } },
  done: () => name + " · ended",
}, () => {
  ended_on = status == "Notice given" && !empty(ends) && ends <= today() ? ends : today()
  status = "Ended"
  why = input.why
  ${event('"Ended"', '"Ended"', ', change: 0 - yearly, note: input.why')}${stop}
})`,
    });

    // The tabs; over them what is active and what it costs a year, what is to decide and what is ending.
    const sums = [
      { label: 'active', conditions: [live] },
      { label: 'a year', field: 'yearly', conditions: [live] },
      { label: 'to decide', conditions: [{ field: 'to_decide', op: 'true' as const }], warn: true as const },
      { label: 'ending', conditions: [{ field: 'ending', op: 'true' as const }] },
    ];
    const columns = ['party', ...(kinds.length > 0 ? ['type'] : []), 'status', 'amount_said', 'when_said'];
    const tab = (id: string, name: string, conditions: Condition[], key = 'ends') => app.view('contracts', { id, name, conditions, sort: { key, dir: 'asc' }, columns, sums, set: 'contracts' }, id === 'active');
    tab('active', 'Active', [live]);
    tab('to-decide', 'To decide', [{ field: 'to_decide', op: 'true' }], 'cancel_by');
    tab('ending', 'Ending', [{ field: 'ending', op: 'true' }]);
    tab('drafts', 'Drafts', [{ field: 'status', op: 'is', value: ['Draft', 'Out for signature'] }]);
    tab('ended', 'Ended', [{ field: 'status', op: 'is', value: ['Ended'] }]);
    // In Today: its notice day with Give notice; its end day with Renew, by itself for one that renews by itself; one given notice ends by itself.
    app.view('contracts', { ...calendar({ start: 'cancel_by', ...(kinds.length > 0 && { color: 'type' }), upcoming: true, button: 'Give notice', words: ['notice_said'] }, [{ field: 'deciding', op: 'true' }]), id: 'notice', name: 'Notice by', hidden: true });
    app.view('contracts', { ...calendar({ start: 'ends', ...(kinds.length > 0 && { color: 'type' }), upcoming: true, button: 'Renew', auto: 'renews_itself', words: ['amount_said'] }, [{ field: 'status', op: 'is', value: ['Active'] }]), id: 'renewals', name: 'Renewals', hidden: true });
    app.view('contracts', { ...calendar({ start: 'ends', ...(kinds.length > 0 && { color: 'type' }), upcoming: false, button: 'End', auto: 'ends_itself' }, [{ field: 'status', op: 'is', value: ['Notice given'] }]), id: 'ends', name: 'Ending', hidden: true });

    app.homeTile('contracts', { off: true });
    app.homeTile('contract-events', { off: true });
    app.homeTiles('contracts', [
      { view: 'to-decide', title: 'To decide', head: [{ label: 'in 60 days' }], value: 'when_said', empty: 'Nothing to decide for 60 days.' },
      { view: 'ending', title: 'Ending', head: [{ label: 'in 60 days' }], value: 'when_said', empty: 'Nothing ends for 60 days.' },
      {
        view: 'active',
        title: 'A year',
        head: [{ label: '', field: 'yearly', conditions: [live] }],
        lines: kinds.length > 0 ? kinds.map((k) => ({ label: k, field: 'yearly', conditions: [live, { field: 'type', op: 'is' as const, value: [k] }] })) : [{ label: 'Active', conditions: [live] }],
      },
    ]);

    if (paid) {
      app.field('payments', link('contract', 'Contract', path));
      app.block('contracts', { block: 'linked', collection: app.path('payments'), style: 'list', title: 'Payments', fields: ['amount', 'status'], fixed: true, column: 2 });
    }

    app.about({
      title: 'Contracts and renewals',
      what: `Your contracts${kinds.length > 0 ? `, ${kinds.map((k) => k.toLowerCase()).join(', ')}` : ''}: with whom, from when to when, what they cost, and by when to give notice.`,
      pieces: ['contracts', 'companies'],
      glance: ['Its notice day in Today with Give notice', 'One that renews by itself renewed on its day', 'Each renewal with what it did to the price', ...(paid ? ['What it costs a payment in Budget'] : [])],
      how: [
        `Add each contract with whom it is${contact ? ' and your contact there' : ''}, its start and its end, whether it renews by itself and its notice, and what it costs; put the signed copy in its notes.`,
        'A new one to sign starts as a Draft: Send for signature, then Signed when it comes back.',
        'On its notice day, Today asks: press Give notice to end it, or let it renew.',
        'Press Renew to renew it for longer or for another price; End to stop it now.',
      ],
      auto: [
        `Its notice day is its end less its notice${notice > 0 ? `, ${notice} days unless you write another` : ''}; it comes to Today and Upcoming until it has gone by.`,
        'One that renews by itself is renewed on its end day for another term at the same price; one given notice ends by itself that day.',
        'Each send, signature, renewal, notice and end is written in its history, a renewal with what it did to the price.',
        'Over the list, what is active, what it all costs a year, what is to decide and what is ending in 60 days.',
        ...(paid ? ['Signed writes what it costs, or brings, as a payment in Budget that comes again by its period; given notice or ended, it comes no more.'] : []),
      ],
      work: ['Who signs contracts, and who keeps them.', 'How long before its notice day we decide to renew one.', ...(seats ? ['Who asks for more seats, and who gives them.'] : [])],
    });
  },
};
