import type { MessageKey } from '@scrawlnotes/i18n';
import { HOLIDAY_COUNTRIES, type HolidayCountry, publicHolidays } from '../holidays';
import { calendar, day, formula, link, nameField, number, person, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Time off and team (design/more-apps.md 3.3): the people, the leave they ask for and the public
// holidays. A leave's days are its working days less the holidays, worked out as it is saved; the
// first kind of leave is the one taken from the yearly allowance. One that runs into another of
// the same person, or goes past the days left, is marked, never refused.

const TYPES = ['Annual', 'Sick', 'Unpaid', 'Remote'];
const TYPE_COLORS = { Annual: 'blue', Sick: 'orange', Unpaid: 'gray', Remote: 'teal' } as const;
const ALLOWANCES = ['10', '14', '15', '20', '25', '30'];

export const timeoff: AppTemplate = {
  id: 'timeoff',
  version: 1,
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
  ],
  money: () => false,
  pieces: () => ['employees', 'leave-requests', 'holidays'],
  build(app, answers) {
    const listed = (answers.types as string[] | undefined) ?? [];
    // Leave needs its kinds: none given, it has the usual ones.
    const types = listed.length > 0 ? listed : TYPES;
    const counted = types[0]!;
    const allowance = Number(answers.allowance ?? 20);
    const approvals = answers.approvals !== false;
    const country = HOLIDAY_COUNTRIES.find((c) => c === answers.holidays) as HolidayCountry | undefined;
    const leave = app.path('leave-requests');
    const called = app.called('leave-requests');
    const employees = app.called('employees');

    app.field('employees', nameField());
    app.field('employees', { key: 'email', label: 'Email', type: 'email' });
    app.field('employees', { key: 'phone', label: 'Phone', type: 'phone' });
    app.field('employees', text('team', 'Team'));
    app.field('employees', link('manager', 'Manager', app.path('employees')));
    app.field('employees', day('started', 'Started'));
    app.field('employees', number('allowance', 'Leave a year', { default: allowance }));
    app.field('employees', rollup('used', 'Used this year', leave, 'sum', 'days', [{ field: 'type', op: 'is', value: [counted] }, { field: 'status', op: 'is', value: ['Approved'] }, { field: 'this_year', op: 'true' }]));
    app.field('employees', formula('left', 'Left', 'allowance - used'));
    app.block('employees', { block: 'linked', collection: leave, style: 'list', fields: ['type', 'first', 'days', 'status'], sort: 'first' });

    const statuses = approvals ? ['Requested', 'Approved', 'Rejected', 'Cancelled'] : ['Approved', 'Cancelled'];
    app.field('leave-requests', nameField('Title'));
    app.field('leave-requests', { ...link('employee', 'Employee', app.path('employees')), required: true });
    app.field('leave-requests', select('type', 'Type', types, TYPE_COLORS, counted));
    app.field('leave-requests', { ...day('first', 'First day'), required: true });
    app.field('leave-requests', day('last', 'Last day'));
    app.field('leave-requests', number('days', 'Days'));
    app.field('leave-requests', select('status', 'Status', statuses, { Requested: 'blue', Approved: 'green', Rejected: 'red', Cancelled: 'gray' }, statuses[0]));
    if (approvals) app.field('leave-requests', person('approved_by', 'Approved by'));
    app.field('leave-requests', text('note', 'Note'));
    app.field('leave-requests', formula('this_year', 'This year', 'year(first) == year(today())'));
    // Who is away, from their first day to their last: in Today and Upcoming.
    app.view('leave-requests', calendar({ start: 'first', end: 'last', color: 'type', upcoming: true }, [{ field: 'status', op: 'is', value: ['Approved'] }]));

    app.field('holidays', nameField());
    app.field('holidays', { ...day('day', 'Day'), required: true });
    app.view('holidays', calendar({ start: 'day', upcoming: false }));
    const year = Number(app.today.slice(0, 4));
    if (country) for (const y of [year, year + 1]) for (const h of publicHolidays(country, y)) app.record('holidays', { name: h.name, day: h.day });

    app.rule('leave-requests', {
      kind: 'onSave',
      name: 'Days',
      src: `onSave("Days", () => {
  if (empty(last)) last = first
  if (empty(name) && !empty(employee)) name = employee.name + " · " + type
  if (!empty(first) && !empty(last) && (empty(days) || first != old.first || last != old.last)) {
    days = workdays(first, last) - find("${app.called('holidays')}").filter((h) => h.day >= first && h.day <= last && weekday(h.day) != "Sat" && weekday(h.day) != "Sun").length
  }
})`,
    });
    const other = `find("${called}", { employee: employee }).find((r) => r != this && r.status != "Rejected" && r.status != "Cancelled" && r.first <= last && r.last >= first)`;
    const closed = 'status == "Rejected" || status == "Cancelled"';
    app.rule('leave-requests', { kind: 'check', name: 'Overlaps with', src: `check("first", () => ${closed} || empty(employee) || empty(first) || empty(last) || empty(${other}), \`Overlaps with \${${other}.name}\`)` });
    app.rule('leave-requests', {
      kind: 'check',
      name: 'More than the days left',
      src: `check("days", () => type != ${JSON.stringify(counted)} || ${closed} || !this_year || empty(employee) || empty(days) || (status == "Approved" ? employee.left >= 0 : days <= employee.left), \`More than the days left: \${text(employee.left)}\`)`,
    });
    if (approvals) {
      app.rule('leave-requests', { kind: 'action', name: 'Approve', src: 'action("Approve", { when: () => status == "Requested", hint: "Only a requested one" }, () => {\n  status = "Approved"\n  approved_by = me()\n})' });
      app.rule('leave-requests', {
        kind: 'action',
        name: 'Reject',
        src: `action("Reject", {
  when: () => status == "Requested",
  hint: "Only a requested one",
  ask: { reason: { label: "Why?", type: "text" } },
}, () => {
  status = "Rejected"
  if (!empty(input.reason)) note = input.reason
})`,
      });
    }

    // With Recruiting, the one hired is one of the team too.
    const hiring = app.hasPiece('candidates');
    if (hiring) {
      app.rule('candidates', {
        kind: 'onSave',
        name: 'To employees',
        src: `onSave("To employees", () => {
  if (!empty(hired_for) && empty(old.hired_for) && find("${employees}", { name: name }).length == 0) {
    add("${employees}", { name: name, email: email, phone: phone, team: hired_for.team, started: start })
  }
})`,
      });
    }

    app.about({
      title: 'Time off and team',
      what: `Your people, the leave they ask for${types.length > 0 ? ` (${types.join(', ')})` : ''} and who is away when; each has ${allowance} days a year of ${counted.toLowerCase()} leave unless their screen says otherwise.`,
      pieces: ['employees', 'leave-requests', 'holidays'],
      glance: ['Who is away, in Today and Upcoming', 'Days counted without weekends and holidays', 'Two at once, or more than the days left, are marked', ...(approvals ? ['Approve and Reject on each'] : []), ...(hiring ? ['The one hired is added to the team'] : [])],
      how: [
        'Add each of your people, with their team, their manager and the day they started.',
        `Add a leave request with its kind and its first and last day; ${approvals ? 'the manager presses Approve, or Reject saying why' : 'it is approved as it is written'}.`,
        `Add the days the company is closed to ${app.called('holidays')}${country ? '; the public holidays of this year and the next are there' : ''}.`,
      ],
      auto: [
        `A leave's days are its working days, Monday to Friday, less the holidays in it; written as it is saved, and again when its days change. A one-day leave needs only its first day.`,
        `Each of your people shows the ${counted.toLowerCase()} leave they used this year and the days left.`,
        'A leave that runs into another of the same person, or goes past the days left, is marked; it is kept.',
        ...(approvals ? ['Approve writes who approved it; Reject asks why.'] : []),
        'An approved leave is on the calendar from its first day to its last, and in Today and Upcoming.',
        ...(hiring ? [`When a candidate is hired, they are added to ${employees} with the day they start.`] : []),
      ],
      work: ['How far ahead leave is asked for.', 'Who approves leave, and who stands in for them.', 'What is done with the days left at the end of the year.'],
    });
  },
};
