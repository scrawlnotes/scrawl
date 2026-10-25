import type { View } from '../../collection';
import { calendar, dayAndTime, link, multi, nameField, number, rollup, select, text } from '../pieces';
import { people } from '../shared';
import type { AppTemplate } from '../types';

// Appointments and bookings (design/calendar.md 6): what is booked, for whom, when and with whom,
// on a calendar. A service is given by the one person or by a team, each with their hours; a
// resource, a room or a table, is booked by the hour. Two at the same time for the same person or
// the same room are marked, as one outside its person's hours or days; nothing is refused.

const SERVICES = ['Consultation 30', 'Follow-up 15'];
const RESOURCES = ['Room 1', 'Room 2'];
const STATUSES = ['Booked', 'Confirmed', 'Done', 'No-show', 'Cancelled'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WORKDAYS = DAYS.slice(0, 5);

/** A service as the list says it, its name then its minutes: "Consultation 30"; with no minutes, half an hour. */
export function serviceOf(item: string): { name: string; duration: number } {
  const found = /^(.*?)\s+(\d+)\s*(?:min(?:utes)?)?$/i.exec(item.trim());
  return found ? { name: found[1]!.trim(), duration: Number(found[2]) } : { name: item.trim(), duration: 30 };
}

/** The appointment of the same `by`, a person or a room, not cancelled, whose time runs into this one's. */
const clash = (collection: string, by: string) =>
  `find("${collection}", { ${by}: ${by} }).find((a) => a != this && a.status != "Cancelled" && a.start < ends && a.ends > start)`;

/** A check that two appointments of the same person or room do not run into each other, said with the other's name and time. */
const overlapCheck = (collection: string, by: string) => {
  const other = clash(collection, by);
  return `check("start", () => status == "Cancelled" || empty(${by}) || empty(ends) || empty(${other}), \`Overlaps with \${${other}.name}, \${text(time(${other}.start))}\`)`;
};

export const appointments: AppTemplate = {
  id: 'appointments',
  version: 1,
  group: 'customers',
  name: 'apps.appointments.name',
  short: 'apps.appointments.short',
  icon: 'clock',
  what: 'apps.appointments.what',
  questions: [
    {
      key: 'for',
      kind: 'choice',
      label: 'apps.appointments.for',
      options: [
        { value: 'services', label: 'apps.appointments.for.services' },
        { value: 'resources', label: 'apps.appointments.for.resources' },
        { value: 'both', label: 'apps.appointments.for.both' },
      ],
      default: 'services',
    },
    {
      key: 'by',
      kind: 'choice',
      label: 'apps.appointments.by',
      options: [
        { value: 'me', label: 'apps.appointments.by.me' },
        { value: 'team', label: 'apps.appointments.by.team' },
      ],
      default: 'me',
    },
    { key: 'staff', kind: 'list', label: 'apps.appointments.staff', default: [], when: ({ answers }) => answers.by === 'team', under: 'by', help: 'apps.appointments.staffHelp', add: 'apps.appointments.addStaff' },
    { key: 'services', kind: 'list', label: 'apps.appointments.services', default: SERVICES, when: ({ answers }) => answers.for !== 'resources', help: 'apps.appointments.servicesHelp', add: 'apps.appointments.addService' },
    { key: 'resources', kind: 'list', label: 'apps.appointments.resources', default: RESOURCES, when: ({ answers }) => answers.for === 'resources' || answers.for === 'both', add: 'apps.appointments.addResource' },
    { key: 'fee', kind: 'yesno', label: 'apps.appointments.fee', default: true },
    { key: 'payments', kind: 'yesno', label: 'apps.appointments.payments', default: true, when: ({ chosen, answers }) => chosen.has('budget') && answers.fee !== false, because: 'budget', under: 'fee' },
  ],
  money: (answers) => answers.fee !== false,
  pieces: (answers) => [
    'appointments',
    ...(answers.for !== 'resources' ? ['services'] : []),
    ...(answers.by === 'team' ? ['staff'] : []),
    ...(answers.for === 'resources' || answers.for === 'both' ? ['resources'] : []),
    'people',
  ],
  menu: ['appointments', 'people', 'services', 'staff', 'resources'],
  build(app, answers) {
    const services = app.hasPiece('services');
    const team = app.hasPiece('staff');
    const resources = app.hasPiece('resources');
    const fee = answers.fee !== false;
    const paid = fee && app.has('budget') && app.hasPiece('payments') && answers.payments !== false;
    const booked = app.path('appointments');
    const called = app.called('appointments');
    const staffNames = team ? ((answers.staff as string[] | undefined) ?? []).map((s) => s.trim()).filter(Boolean) : [];
    const money = fee ? app.format(false) : undefined;

    people(app);

    if (services) {
      app.field('services', nameField());
      app.field('services', number('duration', 'Duration', { format: { style: 'duration' }, default: 30 }));
      if (fee) app.field('services', number('price', 'Price', { format: money }));
      for (const item of (answers.services as string[] | undefined) ?? SERVICES) if (item.trim()) app.record('services', serviceOf(item));
    }
    if (team) {
      app.field('staff', nameField());
      app.field('staff', { key: 'phone', label: 'Phone', type: 'phone' });
      app.field('staff', { key: 'email', label: 'Email', type: 'email' });
      app.field('staff', { key: 'from', label: 'Works from', type: 'time', default: '09:00' });
      app.field('staff', { key: 'until', label: 'Works until', type: 'time', default: '18:00' });
      app.field('staff', { ...multi('days', 'Days', DAYS), default: WORKDAYS });
      app.field('staff', rollup('today', 'Today', booked, 'count', undefined, [{ field: 'start', op: 'on', value: 'today' }, { field: 'status', op: 'is-not', value: ['Cancelled'] }]));
      for (const name of staffNames) app.record('staff', { name, from: '09:00', until: '18:00', days: WORKDAYS });
      if (services) app.field('services', link('staff', 'Given by', app.path('staff'), true));
    }
    if (resources) {
      app.field('resources', nameField());
      app.field('resources', select('type', 'Type', ['room', 'table', 'vehicle', 'equipment'], { room: 'blue', table: 'teal', vehicle: 'purple', equipment: 'orange' }, 'room'));
      app.field('resources', number('capacity', 'Capacity'));
      for (const name of (answers.resources as string[] | undefined) ?? RESOURCES) if (name.trim()) app.record('resources', { name: name.trim() });
    }

    app.field('appointments', nameField('Title'));
    app.field('appointments', link('customer', 'Customer', app.path('people')));
    if (services) app.field('appointments', link('service', 'Service', app.path('services')));
    if (team) app.field('appointments', link('staff', 'With', app.path('staff')));
    if (resources) app.field('appointments', link('resource', 'Resource', app.path('resources')));
    app.field('appointments', { ...dayAndTime('start', 'Start'), required: true });
    // With no service to take its length from, an hour.
    app.field('appointments', number('duration', 'Duration', { format: { style: 'duration' }, ...(!services && { default: 60 }) }));
    app.field('appointments', { key: 'ends', label: 'Ends', type: 'formula', formula: 'start + minutes(duration)' });
    app.field('appointments', select('status', 'Status', STATUSES, { Booked: 'blue', Confirmed: 'teal', Done: 'green', 'No-show': 'orange', Cancelled: 'gray' }, 'Booked'));
    if (fee) app.field('appointments', number('price', 'Price', { format: money }));
    app.field('appointments', text('note', 'Note'));

    // The calendar it opens on, colored by whom with a team, else by how it stands; with a team, one for each of them too.
    app.view('appointments', calendar({ start: 'start', duration: 'duration', color: team ? 'staff' : 'status', upcoming: true }), true);
    staffNames.forEach((name, i) => {
      const own: View = { id: `staff-${i + 1}`, name, kind: 'calendar', calendar: { start: 'start', duration: 'duration', color: 'status', upcoming: false }, conditions: [{ field: 'staff', op: 'is', value: [name] }] };
      app.view('appointments', own);
    });

    app.field('people', rollup('last_appointment', 'Last appointment', booked, 'max', 'start'));
    app.field('people', rollup('appointment_count', 'Appointments', booked, 'count'));
    app.field('people', rollup('no_shows', 'No-shows', booked, 'count', undefined, [{ field: 'status', op: 'is', value: ['No-show'] }]));
    app.block('people', { block: 'linked', collection: booked, sort: 'start', style: 'timeline' });
    if (team) app.block('staff', { block: 'linked', collection: booked, style: 'list', fields: ['start', 'status'], sort: 'start' });
    if (resources) app.block('resources', { block: 'linked', collection: booked, style: 'list', fields: ['start', 'status'], sort: 'start' });

    if (services) {
      app.rule('appointments', {
        kind: 'onSave',
        name: 'From the service',
        src: `onSave("From the service", () => {
  if (!empty(service)) {
    if (empty(duration)) duration = service.duration${fee ? '\n    if (empty(price)) price = service.price' : ''}
  }
})`,
      });
    }
    if (team) {
      app.rule('appointments', { kind: 'check', name: 'Overlaps with', src: overlapCheck(called, 'staff') });
      app.rule('appointments', {
        kind: 'check',
        name: 'Outside the hours',
        src: 'check("start", () => empty(staff) || empty(staff.from) || empty(staff.until) || (time(start) >= staff.from && (empty(ends) || time(ends) <= staff.until)), `Outside ${staff.name}\'s hours, ${text(staff.from)} to ${text(staff.until)}`)',
      });
      app.rule('appointments', {
        kind: 'check',
        name: 'Not a working day',
        src: 'check("start", () => empty(staff) || empty(staff.days) || contains(staff.days, weekday(start)), `${staff.name} does not work on ${weekday(start)}`)',
      });
    }
    if (resources) app.rule('appointments', { kind: 'check', name: 'Booked at the same time', src: overlapCheck(called, 'resource') });

    const open = 'status == "Booked" || status == "Confirmed"';
    app.rule('appointments', { kind: 'action', name: 'Confirm', src: 'action("Confirm", { when: () => status == "Booked", hint: "Only a booked one" }, () => {\n  status = "Confirmed"\n})' });
    app.rule('appointments', { kind: 'action', name: 'Done', src: `action("Done", { when: () => ${open}, hint: "Only a booked or a confirmed one" }, () => {\n  status = "Done"\n})` });
    app.rule('appointments', { kind: 'action', name: 'No-show', src: `action("No-show", { when: () => ${open}, hint: "Only a booked or a confirmed one" }, () => {\n  status = "No-show"\n})` });
    app.rule('appointments', {
      kind: 'action',
      name: 'Cancel',
      src: `action("Cancel", {
  when: () => ${open},
  hint: "Only a booked or a confirmed one",
  ask: { reason: { label: "Why?", type: "text" } },
}, () => {
  status = "Cancelled"
  if (!empty(input.reason)) note = input.reason
})`,
    });
    app.rule('appointments', {
      kind: 'action',
      name: 'Reschedule',
      src: `action("Reschedule", {
  when: () => ${open},
  hint: "Only a booked or a confirmed one",
  ask: { start: { label: "New time", type: "date", time: true, default: () => start, required: true } },
}, () => {
  start = input.start
  status = "Booked"
})`,
    });

    if (paid) {
      const pay = app.called('payments');
      app.record('budget-lines', { name: 'Appointments', type: 'Income' });
      app.field('payments', link('appointment', 'Appointment', booked));
      app.block('appointments', { block: 'linked', collection: app.path('payments'), style: 'list', fields: ['amount', 'status'] });
      app.rule('appointments', {
        kind: 'onSave',
        name: 'Payment',
        src: `onSave("Payment", () => {
  if (status == "Done" && old.status != "Done" && price > 0 && linked("${pay}").length == 0) {
    add("${pay}", { name: name, direction: "In", amount: price, status: "Invoiced"${app.money.multi ? `, currency: "${app.money.main}"` : ''}, budget_line: find("${app.called('budget-lines')}", { name: "Appointments" })[0] })
  }
})`,
      });
    }

    const serviceNames = ((answers.services as string[] | undefined) ?? SERVICES).map((s) => serviceOf(s).name);
    app.about({
      title: 'Appointments and bookings',
      what: `${services ? `Appointments for ${serviceNames.length > 0 ? serviceNames.join(', ') : 'your services'}` : 'Bookings'}${resources ? `${services ? ', and bookings' : ''} of your rooms and things` : ''}: who, when${team ? ' and with whom' : ''}, on a calendar.`,
      pieces: ['appointments', ...(services ? ['services'] : []), ...(team ? ['staff'] : []), ...(resources ? ['resources'] : []), 'people'],
      glance: [
        'A calendar of the week, in Today and Upcoming',
        ...(team || resources ? ['Two at the same time are marked'] : []),
        'Confirm, Done, No-show, Cancel and Reschedule on each',
        ...(paid ? ['A done one is written as a payment'] : []),
      ],
      how: [
        `Add an appointment on the calendar: drag over its hours, or press Add record; pick the customer${services ? ' and the service' : ''}${team ? ', and who it is with' : ''}${resources ? ', and the room or the thing' : ''}.`,
        'Press Confirm when they say they will come, Done when it is over, No-show when they did not come.',
        'Reschedule asks for the new time; Cancel asks why.',
        ...(team ? ['Each in the team has their own calendar beside the whole one; their hours and days are on their screen.'] : []),
      ],
      auto: [
        ...(services ? [`A new appointment takes its length${fee ? ' and its price' : ''} from its service, unless you write them.`] : []),
        ...(team ? ['An appointment that runs into another of the same person, or is outside their hours or days, is marked; it is kept.'] : []),
        ...(resources ? ['A room or a thing booked twice at the same time is marked; it is kept.'] : []),
        'A customer shows their last appointment, how many they had and how many times they did not come.',
        ...(team ? ['Each in the team shows how many appointments they have today.'] : []),
        ...(paid ? [`When an appointment is Done, a payment of its price is added to ${app.called('payments')}, under the Appointments budget line.`] : []),
      ],
      work: ['How we take bookings: by phone, by message, at the desk.', 'How long before an appointment it can be cancelled.', 'What we do when someone does not come.'],
    });
  },
};

