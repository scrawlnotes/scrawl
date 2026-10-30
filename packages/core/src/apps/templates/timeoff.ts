import type { MessageKey } from '@scrawlnotes/i18n';
import { HOLIDAY_COUNTRIES, type HolidayCountry, publicHolidays } from '../holidays';
import { calendar, day, formula, link, nameField, number, person, rollup, select, text } from '../pieces';
import type { Condition } from '../../collection';
import type { AppTemplate } from '../types';

// Time off and team (design/more-apps.md 3.3), as Timetastic and BambooHR keep it: the people,
// the leave they ask for and the public holidays. Request leave says the days and what is left
// after; a morning or an afternoon is half a day. A request comes to Today with Approve. Who's away
// is a row for each of the team, a bar for each leave. A leave's days are its working days less the
// holidays; the first kind is the one taken from the yearly allowance, and Carry over takes what is
// left into the next year. One that runs into another, or goes past the days left, is marked.

const TYPES = ['Annual', 'Sick', 'Unpaid', 'Remote'];
const TYPE_COLORS = { Annual: 'blue', Sick: 'orange', Unpaid: 'gray', Remote: 'teal' } as const;
const ALLOWANCES = ['10', '14', '15', '20', '25', '30'];
const PARTS = ['Full day', 'Morning', 'Afternoon'];
const CARRY = ['0', '5', '10', 'all'];
/** A day as a leave says it: "Nov 2". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;

export const timeoff: AppTemplate = {
  id: 'timeoff',
  version: 2,
  group: 'work',
  name: 'apps.timeoff.name',
  short: 'apps.timeoff.short',
  icon: 'week',
  what: 'apps.timeoff.what',
  questions: [
    { key: 'types', kind: 'list', label: 'apps.timeoff.types', default: TYPES, help: 'apps.timeoff.typesHelp', add: 'apps.timeoff.addType', hints: (items) => items.map((_, i) => (i === 0 ? 'apps.hint.allowance' : null)) },
    {
      key: 'allowance',
      kind: 'choice',
      label: 'apps.timeoff.allowance',
      options: ALLOWANCES.map((value) => ({ value, label: `apps.timeoff.allowance.${value}` as MessageKey })),
      default: '20',
      regional: { TR: '14' },
      help: 'apps.timeoff.allowanceHelp',
    },
    {
      key: 'holidays',
      kind: 'choice',
      label: 'apps.timeoff.holidays',
      options: ['none', ...HOLIDAY_COUNTRIES].map((value) => ({ value, label: `apps.timeoff.holidays.${value}` as MessageKey })),
      default: 'none',
      regional: { TR: 'tr', US: 'us', GB: 'gb', DE: 'de' },
      help: 'apps.timeoff.holidaysHelp',
    },
    { key: 'approvals', kind: 'yesno', label: 'apps.timeoff.approvals', default: true },
    {
      key: 'carry',
      kind: 'choice',
      label: 'apps.timeoff.carry',
      options: CARRY.map((value) => ({ value, label: `apps.timeoff.carry.${value}` as MessageKey })),
      default: '5',
      help: 'apps.timeoff.carryHelp',
    },
  ],
  money: () => false,
  pieces: () => ['employees', 'leave-requests', 'holidays'],
  menu: [{ role: 'leave-requests', view: 'away', name: "Who's away" }, { role: 'leave-requests', view: 'upcoming', name: 'Leave' }, { role: 'employees', view: 'all', name: 'Employees' }, 'holidays'],
  build(app, answers) {
    const listed = (answers.types as string[] | undefined) ?? [];
    // Leave needs its kinds: none given, it has the usual ones.
    const types = listed.length > 0 ? listed : TYPES;
    const counted = types[0]!;
    const allowance = Number(answers.allowance ?? 20);
    const approvals = answers.approvals !== false;
    const carry = answers.carry !== '0';
    const cap = answers.carry === 'all' ? null : Number(answers.carry ?? 5);
    const country = HOLIDAY_COUNTRIES.find((c) => c === answers.holidays) as HolidayCountry | undefined;
    const leave = app.path('leave-requests');
    const called = app.called('leave-requests');

    app.field('employees', nameField());
    app.field('employees', { key: 'email', label: 'Email', type: 'email' });
    app.field('employees', { key: 'phone', label: 'Phone', type: 'phone' });
    app.field('employees', text('team', 'Team'));
    app.field('employees', link('manager', 'Manager', app.path('employees')));
    app.field('employees', day('started', 'Started'));
    app.field('employees', number('allowance', 'Leave a year', { default: allowance }));
    if (carry) {
      app.field('employees', number('carried', 'Carried over'));
      app.field('employees', number('carried_for', 'Carried into'));
    }
    const counting = [{ field: 'type', op: 'is' as const, value: [counted] }, { field: 'this_year', op: 'true' as const }];
    app.field('employees', rollup('used', 'Used this year', leave, 'sum', 'days', [...counting, { field: 'status', op: 'is', value: ['Approved'] }]));
    app.field('employees', rollup('requested', 'Requested', leave, 'sum', 'days', [...counting, { field: 'status', op: 'is', value: ['Requested'] }]));
    app.field('employees', formula('allowed', 'This year', carry ? 'allowance + (carried_for == year(today()) && !empty(carried) ? carried : 0)' : 'allowance'));
    app.field('employees', formula('left', 'Left', 'allowed - used'));
    app.field('employees', formula('used_said', 'Used', 'text(used) + " of " + text(allowed)'));
    app.field('employees', formula('used_share', 'Used', 'allowed > 0 ? used / allowed : 0', { style: 'percent', decimals: 0, bar: true, caption: 'used_said', warn: true }));
    app.field('employees', rollup('next_away', 'Next away', leave, 'min', 'first', [{ field: 'status', op: 'is', value: ['Approved', 'Requested'] }, { field: 'first', op: 'after', value: 'today' }]));
    // "Platform · 11 days left of 16 · 3 requested · next away Nov 2".
    app.field(
      'employees',
      formula('said', 'Says', `(empty(team) ? "" : team + " · ") + text(left) + (left == 1 ? " day" : " days") + " left of " + text(allowed) + (requested > 0 ? " · " + text(requested) + " requested" : "") + (empty(next_away) ? "" : " · next away " + ${short('next_away')})`),
    );
    app.head('employees', 'said');
    app.formOrder('employees', ['name', 'team', 'manager', 'email', 'phone', 'started', 'allowance', ...(carry ? ['carried', 'carried_for'] : [])]);
    app.newForm('employees', ['name', 'team', 'manager', 'email', 'started', 'allowance']);
    app.block('employees', { block: 'actions', column: 1 });
    app.block('employees', { block: 'linked', collection: leave, style: 'list', title: 'Leave', fields: ['when_said', 'days', 'status'], sort: 'first', dir: 'desc', fixed: true, column: 2 });
    app.view('employees', { id: 'all', name: 'Employees', conditions: [], sort: { key: 'name', dir: 'asc' }, columns: ['team', 'manager', 'left', 'used_share'], ...(carry && { all: 'Carry over' }) }, true);

    const statuses = approvals ? ['Requested', 'Approved', 'Rejected', 'Cancelled'] : ['Approved', 'Cancelled'];
    app.field('leave-requests', nameField('Title'));
    app.field('leave-requests', { ...link('employee', 'Who', app.path('employees')), required: true });
    app.field('leave-requests', { ...select('type', 'Type', types, TYPE_COLORS, counted), chips: true });
    app.field('leave-requests', { ...day('first', 'First day'), required: true });
    app.field('leave-requests', day('last', 'Last day'));
    app.field('leave-requests', { ...select('part', 'One day only', PARTS, {}, PARTS[0]), chips: true });
    app.field('leave-requests', number('days', 'Days'));
    app.field('leave-requests', select('status', 'Status', statuses, { Requested: 'blue', Approved: 'green', Rejected: 'red', Cancelled: 'gray' }, statuses[0]));
    if (approvals) app.field('leave-requests', person('approved_by', 'Approved by'));
    app.field('leave-requests', day('requested_on', 'Asked on', true));
    app.field('leave-requests', text('note', 'Note'));
    app.field('leave-requests', formula('this_year', 'This year', 'year(first) == year(today())'));
    const live = '(status == "Approved" || status == "Requested")';
    app.field('leave-requests', formula('away_now', 'Away now', 'status == "Approved" && first <= today() && (empty(last) ? first : last) >= today()'));
    app.field('leave-requests', formula('coming', 'Coming', `${live} && first > today()`));
    app.field('leave-requests', formula('past', 'Past', `${live} && (empty(last) ? first : last) < today()`));
    // "Nov 2 – Nov 4", "Nov 4 · morning".
    app.field('leave-requests', formula('when_said', 'When', `empty(first) ? "" : ${short('first')} + (!empty(last) && last != first ? " – " + ${short('last')} : part == "Morning" ? " · morning" : part == "Afternoon" ? " · afternoon" : "")`));
    app.field('leave-requests', formula('left_said', 'Left', `text(days) + (days == 1 ? " day" : " days") + (type == ${JSON.stringify(counted)} && !empty(employee) ? " · " + text(employee.left - (status == "Requested" ? days : 0)) + " left after" : "")`));
    app.formOrder('leave-requests', ['employee', 'type', 'first', 'last', 'part', 'days', 'status', 'note']);
    app.newForm('leave-requests', ['employee', 'type', 'first', 'last', 'part', 'note']);

    // Who is away: a row each, a bar from their first day to their last.
    app.view('leave-requests', { id: 'away', name: "Who's away", kind: 'timeline', timeline: { start: 'first', end: 'last', color: 'type', rows: 'employee' }, conditions: [{ field: 'status', op: 'is', value: ['Approved', 'Requested'] }] }, true);
    const columns = ['employee', 'type', 'when_said', 'days', 'status'];
    const sums = [
      ...(approvals ? [{ label: 'to approve', conditions: [{ field: 'status', op: 'is' as const, value: ['Requested'] }], warn: true as const }] : []),
      { label: 'away now', conditions: [{ field: 'away_now', op: 'true' as const }] },
      { label: 'coming', conditions: [{ field: 'coming', op: 'true' as const }] },
    ];
    const tab = (id: string, name: string, conditions: Condition[], dir: 'asc' | 'desc' = 'asc') => app.view('leave-requests', { id, name, conditions, sort: { key: 'first', dir }, columns, sums, set: 'leave' });
    if (approvals) tab('to-approve', 'To approve', [{ field: 'status', op: 'is', value: ['Requested'] }]);
    tab('upcoming', 'Upcoming', [{ field: 'coming', op: 'true' }]);
    tab('away-now', 'Away now', [{ field: 'away_now', op: 'true' }]);
    tab('past', 'Past', [{ field: 'past', op: 'true' }], 'desc');
    // In Today: a request with Approve, from the day it was asked till it is; who is away, each day of it.
    if (approvals) app.view('leave-requests', { ...calendar({ start: 'requested_on', color: 'type', upcoming: 'today', button: 'Approve', words: ['when_said', 'left_said'] }, [{ field: 'status', op: 'is', value: ['Requested'] }]), id: 'approvals', name: 'To approve', hidden: true });
    app.view('leave-requests', { ...calendar({ start: 'first', end: 'last', color: 'type', upcoming: true, words: ['when_said'] }, [{ field: 'status', op: 'is', value: ['Approved'] }]), id: 'calendar', name: 'Calendar', hidden: true });

    app.field('holidays', nameField());
    app.field('holidays', { ...day('day', 'Day'), required: true });
    app.view('holidays', calendar({ start: 'day', upcoming: false }));
    app.view('holidays', { id: 'next', name: 'Coming', conditions: [{ field: 'day', op: 'after', value: 'today' }], sort: { key: 'day', dir: 'asc' }, columns: ['day'], hidden: true });
    const year = Number(app.today.slice(0, 4));
    if (country) for (const y of [year, year + 1]) for (const h of publicHolidays(country, y)) app.record('holidays', { name: h.name, day: h.day });

    const holidaysIn = (from: string, to: string) => `find("${app.called('holidays')}").filter((h) => h.day >= ${from} && h.day <= ${to} && weekday(h.day) != "Sat" && weekday(h.day) != "Sun").length`;
    app.rule('leave-requests', {
      kind: 'onSave',
      name: 'Days',
      src: `onSave("Days", () => {
  if (empty(last)) last = first
  if (empty(name) && !empty(employee)) name = employee.name + " · " + type
  if (last != first) part = "${PARTS[0]}"
  if (!empty(first) && !empty(last) && (empty(days) || first != old.first || last != old.last || part != old.part)) {
    days = part == "Morning" || part == "Afternoon" ? 0.5 : workdays(first, last) - ${holidaysIn('first', 'last')}
  }
})`,
    });
    // Two halves of the one day are not two at once.
    const other = `find("${called}", { employee: employee }).find((r) => r != this && r.status != "Rejected" && r.status != "Cancelled" && r.first <= last && r.last >= first && !(r.first == r.last && first == last && (r.part == "Morning" || r.part == "Afternoon") && (part == "Morning" || part == "Afternoon") && r.part != part))`;
    const closed = 'status == "Rejected" || status == "Cancelled"';
    app.rule('leave-requests', { kind: 'check', name: 'Overlaps with', src: `check("first", () => ${closed} || empty(employee) || empty(first) || empty(last) || empty(${other}), \`Overlaps with \${${other}.name}\`)` });
    app.rule('leave-requests', {
      kind: 'check',
      name: 'More than the days left',
      src: `check("days", () => type != ${JSON.stringify(counted)} || ${closed} || !this_year || empty(employee) || empty(days) || (status == "Approved" ? employee.left >= 0 : days <= employee.left), \`More than the days left: \${text(employee.left)}\`)`,
    });

    // Request leave on one of the team: how many days, and what is left after.
    const span = '(empty(input.last) ? input.first : input.last)';
    const one = '(empty(input.last) || input.last == input.first)';
    const asked = `(${one} && (input.part == "Morning" || input.part == "Afternoon") ? 0.5 : workdays(input.first, ${span}) - ${holidaysIn('input.first', span)})`;
    app.rule('employees', {
      kind: 'action',
      name: 'Request leave',
      src: `action("Request leave", {
  ask: {
    type: { label: "Type", type: "choice", options: [${types.map((x) => JSON.stringify(x)).join(', ')}], chips: true, default: ${JSON.stringify(counted)}, required: true },
    first: { label: "First day", type: "date", default: () => today(), required: true },
    last: { label: "Last day", type: "date" },
    part: { label: "One day only", type: "choice", options: [${PARTS.map((x) => JSON.stringify(x)).join(', ')}], chips: true, default: "${PARTS[0]}" },
    note: { label: "Note", type: "text", note: () => empty(input.first) ? "" : text(${asked}) + (${asked} == 1 ? " day" : " days") + (input.type == ${JSON.stringify(counted)} ? " · " + text(left - ${asked}) + " left after this" : "")${approvals ? ` + ". It goes to " + (empty(manager) ? "the manager" : manager.name) + " for approval."` : ''} },
  },
  done: () => name + " · " + input.type + " asked",
}, () => {
  add("${called}", { name: name + " · " + input.type, employee: this, type: input.type, first: input.first, last: ${span}, part: ${one} ? input.part : "${PARTS[0]}", note: input.note, status: "${statuses[0]}", requested_on: today() })
})`,
    });
    if (approvals) {
      app.rule('leave-requests', { kind: 'action', name: 'Approve', src: 'action("Approve", { when: () => status == "Requested", hint: "Only a requested one", done: () => name + " · approved" }, () => {\n  status = "Approved"\n  approved_by = me()\n})' });
      app.rule('leave-requests', {
        kind: 'action',
        name: 'Reject',
        src: `action("Reject", {
  when: () => status == "Requested",
  hint: "Only a requested one",
  ask: { reason: { label: "Why?", type: "text" } },
  done: () => name + " · rejected",
}, () => {
  status = "Rejected"
  if (!empty(input.reason)) note = input.reason
})`,
      });
    }
    app.rule('leave-requests', {
      kind: 'action',
      name: 'Cancel',
      src: `action("Cancel", { when: () => ${live} && (empty(last) ? first : last) >= today(), hint: "Only one still to come", done: () => name + " · cancelled" }, () => {\n  status = "Cancelled"\n})`,
    });
    // At the end of the year: what is left goes to the next, up to so many days.
    if (carry) {
      app.rule('employees', {
        kind: 'action',
        name: 'Carry over',
        src: `action("Carry over", {
  when: () => carried_for != year(today()) + 1,
  hint: "Carried over already",
  ask: { days: { label: "Days", type: "number", default: () => ${cap === null ? 'left' : `left > ${cap} ? ${cap} : left`}, note: () => "What is left of " + text(year(today())) + " goes to " + text(year(today()) + 1)${cap === null ? '' : ` + ", up to ${cap} days"`} + "." } },
  done: () => name + " · " + text(input.days) + " carried over",
}, () => {
  carried = input.days < 0 ? 0 : input.days
  carried_for = year(today()) + 1
})`,
      });
    }

    app.homeTile('employees', { off: true });
    app.homeTile('holidays', { off: true });
    app.homeTile('leave-requests', { off: true });
    app.homeTiles('leave-requests', [
      { view: 'away-now', title: 'Away', head: [{ label: 'today', conditions: [{ field: 'away_now', op: 'true' }] }, { label: 'coming', conditions: [{ field: 'coming', op: 'true' }] }], value: 'when_said', empty: 'Nobody is away.' },
      ...(approvals ? [{ view: 'to-approve', title: 'To approve', value: 'left_said', empty: 'Nothing to approve.' }] : []),
    ]);
    app.homeTiles('holidays', [{ view: 'next', title: 'Holidays', value: 'day', empty: 'No holiday ahead.' }]);

    app.about({
      title: 'Time off and team',
      what: `Your people, the leave they ask for${types.length > 0 ? ` (${types.join(', ')})` : ''} and who is away when; each has ${allowance} days a year of ${counted.toLowerCase()} leave unless their screen says otherwise.`,
      pieces: ['employees', 'leave-requests', 'holidays'],
      glance: [
        "Who's away, a row each",
        'Request leave says the days left after it',
        'Half days',
        ...(approvals ? ['Approve in Today'] : []),
        'Days counted without weekends and holidays',
        ...(carry ? ['Carry over at the end of the year'] : []),
      ],
      how: [
        'Add each of your people, with their team, their manager and the day they started.',
        `Press Request leave on their screen: its kind, its first and last day, or the morning or the afternoon of one; ${approvals ? 'it comes to Today with Approve, or Reject saying why' : 'it is approved as it is asked'}.`,
        `Add the days the company is closed to ${app.called('holidays')}${country ? '; the public holidays of this year and the next are there' : ''}.`,
        ...(carry ? [`At the end of the year, press Carry over on ${app.called('employees')}.`] : []),
      ],
      auto: [
        "A leave's days are its working days, Monday to Friday, less the holidays in it; a morning or an afternoon is half a day. Written as it is saved, and again when its days change.",
        `Each of your people shows the ${counted.toLowerCase()} leave they used this year of what they have, what is requested, and when they are next away.`,
        'A leave that runs into another of the same person, or goes past the days left, is marked; it is kept.',
        ...(approvals ? ['A request is in Today from the day it was asked till it is approved; Approve writes who approved it.'] : []),
        "Who's away has a row for each of your people, a bar for each leave; an approved one is in Today and Upcoming on its days.",
        ...(carry ? [`Carry over takes what is left into the next year${cap === null ? '' : `, up to ${cap} days`}.`] : []),
      ],
      work: ['How far ahead leave is asked for.', 'Who approves leave, and who stands in for them.'],
    });
  },
};
