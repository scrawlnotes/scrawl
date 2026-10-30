import type { Condition, View } from '../../collection';
import { calendar, dayAndTime, formula, link, multi, nameField, number, rollup, select, symbolOf, text } from '../pieces';
import { people } from '../shared';
import type { AppTemplate } from '../types';

// Appointments and bookings (design/calendar.md 6), as Fresha and Acuity keep them: what is booked,
// for whom, when and with whom, on a calendar whose Day has a row for each in the team. Book on a
// customer says the free times; the day before, Today says whom to remind; Done asks when they come
// next and books it. A service is given by the one person or by a team, each with their hours; a
// resource, a room or a table, is booked by the hour. Two at the same time for the same person or
// the same room are marked, as one outside its person's hours or days; nothing is refused.

const SERVICES = ['Consultation 30', 'Follow-up 15'];
const RESOURCES = ['Room 1', 'Room 2'];
const STATUSES = ['Booked', 'Confirmed', 'Arrived', 'Done', 'No-show', 'Cancelled'];
const NEXT = ['In 1 week', 'In 2 weeks', 'In 4 weeks', 'In 6 weeks', 'Not now'];
/** The times Book looks at, in minutes from midnight: every half hour from 09:00 to 18:30. */
const SLOTS = Array.from({ length: 20 }, (_, i) => 540 + i * 30);
/** A day as an appointment says it: "Nov 13". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;
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
  version: 2,
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
    { key: 'remind', kind: 'yesno', label: 'apps.appointments.remind', default: true, help: 'apps.appointments.remindHelp' },
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
    const remind = answers.remind !== false;

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
    app.field('appointments', select('status', 'Status', STATUSES, { Booked: 'blue', Confirmed: 'teal', Arrived: 'yellow', Done: 'green', 'No-show': 'orange', Cancelled: 'gray' }, 'Booked'));
    if (fee) app.field('appointments', number('price', 'Price', { format: money }));
    app.field('appointments', text('note', 'Note'));
    app.field('appointments', formula('this_week', 'This week', 'week(start) == week(today())'));
    app.field('appointments', formula('this_month', 'This month', 'month(start) == month(today())'));
    // "13:00 · Massage 60 with Ayşe".
    const what = `${services ? '(empty(service) ? "" : " · " + service.name)' : '""'}${team ? ' + (empty(staff) ? "" : " with " + staff.name)' : ''}`;
    app.field('appointments', formula('what_said', 'What', `text(time(start)) + ${what}`));
    // Its line on the customer: "Done · $80".
    app.field('appointments', formula('said', 'Says', `status${fee ? ` + (empty(price) ? "" : " · " + ${JSON.stringify(symbolOf(app.money.main))} + amount(price))` : ''}`));
    if (remind) {
      app.field('appointments', formula('remind_on', 'Remind on', 'day(start) - 1'));
      app.field('appointments', formula('remind_said', 'Remind', `"tomorrow " + what_said + (empty(customer) || empty(customer.phone) ? "" : " · " + customer.phone)`));
    }
    app.formOrder('appointments', ['name', 'customer', ...(services ? ['service'] : []), ...(team ? ['staff'] : []), ...(resources ? ['resource'] : []), 'start', 'duration', 'status', ...(fee ? ['price'] : []), 'note']);

    // The calendar it opens on: the week, colored by whom with a team, else by how it stands; its Day a row for each of them.
    app.view('appointments', calendar({ start: 'start', duration: 'duration', color: team ? 'staff' : 'status', upcoming: true, button: 'Done', words: ['what_said'], ...(team && { lanes: 'staff' }) }, [{ field: 'status', op: 'is-not', value: ['Cancelled'] }]), true);
    staffNames.forEach((name, i) => {
      const own: View = { id: `staff-${i + 1}`, name, kind: 'calendar', calendar: { start: 'start', duration: 'duration', color: 'status', upcoming: false }, conditions: [{ field: 'staff', op: 'is', value: [name] }, { field: 'status', op: 'is-not', value: ['Cancelled'] }] };
      app.view('appointments', own);
    });
    // The day before, Today asks to remind them; Reminded is Confirmed.
    if (remind) app.view('appointments', { ...calendar({ start: 'remind_on', color: team ? 'staff' : 'status', upcoming: 'today', button: 'Reminded', words: ['remind_said'] }, [{ field: 'status', op: 'is', value: ['Booked'] }]), id: 'remind', name: 'To remind', hidden: true });
    const notCancelled: Condition = { field: 'status', op: 'is-not', value: ['Cancelled'] };
    app.view('appointments', { id: 'today', name: 'Today', conditions: [{ field: 'start', op: 'on', value: 'today' }, notCancelled], sort: { key: 'start', dir: 'asc' }, columns: ['customer', 'what_said', 'status'], hidden: true });
    app.view('appointments', { id: 'week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }, notCancelled], sort: { key: 'start', dir: 'asc' }, columns: ['customer', 'what_said', 'status'], hidden: true });
    app.view('appointments', { id: 'no-shows', name: 'No-shows', conditions: [{ field: 'status', op: 'is', value: ['No-show'] }, { field: 'this_month', op: 'true' }], sort: { key: 'start', dir: 'desc' }, columns: ['customer', 'start'], hidden: true });

    // A customer: their visits, their last and their next, and how often they did not come.
    const done: Condition = { field: 'status', op: 'is', value: ['Done'] };
    app.field('people', rollup('visits', 'Visits', booked, 'count', undefined, [done]));
    app.field('people', rollup('last_visit', 'Last visit', booked, 'max', 'start', [done]));
    app.field('people', rollup('next_visit', 'Next visit', booked, 'min', 'start', [{ field: 'status', op: 'is', value: ['Booked', 'Confirmed'] }, { field: 'start', op: 'after', value: 'today' }]));
    app.field('people', rollup('no_shows', 'No-shows', booked, 'count', undefined, [{ field: 'status', op: 'is', value: ['No-show'] }]));
    app.field('people', formula('visits_said', 'Visits', `text(visits) + (visits == 1 ? " visit" : " visits") + (empty(last_visit) ? "" : " · last " + ${short('last_visit')}) + (empty(next_visit) ? "" : " · next " + ${short('next_visit')}) + (no_shows > 0 ? " · " + text(no_shows) + (no_shows == 1 ? " no-show" : " no-shows") : "")`));
    if (!app.has('crm')) app.head('people', 'visits_said');
    app.block('people', { block: 'actions', column: 1 });
    app.block('people', { block: 'linked', collection: booked, look: 'days', title: 'Appointments', time: 'start', sub: 'said', sort: 'start', dir: 'desc', button: 'Book', column: 3 });
    if (team) app.block('staff', { block: 'linked', collection: booked, style: 'list', fields: ['start', 'status'], sort: 'start' });
    if (resources) app.block('resources', { block: 'linked', collection: booked, style: 'list', fields: ['start', 'status'], sort: 'start' });

    app.rule('appointments', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {
  if (empty(name) && !empty(customer)) name = customer.name${services ? ' + (empty(service) ? "" : " · " + service.name)' : ''}${services ? `
  if (!empty(service)) {
    if (empty(duration)) duration = service.duration${fee ? '\n    if (empty(price)) price = service.price' : ''}
  }` : ''}
})`,
    });
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
    if (remind) app.rule('appointments', { kind: 'action', name: 'Reminded', src: 'action("Reminded", { when: () => status == "Booked", hint: "Only a booked one", done: () => name + " · reminded" }, () => {\n  status = "Confirmed"\n})' });
    app.rule('appointments', { kind: 'action', name: 'Arrived', src: `action("Arrived", { when: () => (${open}) && day(start) == today(), hint: "Only one of today" }, () => {\n  status = "Arrived"\n})` });
    // Done asks the next visit, as Fresha rebooks: the same time and the same person, so many weeks on.
    const next = `start + (input.next == "In 1 week" ? 7 : input.next == "In 2 weeks" ? 14 : input.next == "In 4 weeks" ? 28 : 42)`;
    const taken = `find("${called}").find((a) => a != this && a.status != "Cancelled"${team ? ' && a.staff == staff' : ''} && a.start < ${next} + minutes(duration) && a.ends > ${next})`;
    app.rule('appointments', {
      kind: 'action',
      name: 'Done',
      src: `action("Done", {
  when: () => ${open} || status == "Arrived",
  hint: "Only a booked, a confirmed or an arrived one",
  ask: {
    next: { label: "Next visit", type: "choice", options: ${JSON.stringify(NEXT)}, chips: true, default: "Not now", note: () => input.next == "Not now" || empty(input.next) ? "" : weekday(${next}) + ", " + ${short(next)} + " · " + text(time(${next}))${team ? ' + (empty(staff) ? "" : " with " + staff.name)' : ''} + (empty(${taken}) ? " is free; it is booked." : " has " + ${taken}.name + "; it is booked and marked.") },
  },
  done: () => name + " · done",
}, () => {
  status = "Done"
  if (input.next != "Not now" && !empty(input.next)) {
    add("${called}", { name: name, customer: customer${services ? ', service: service' : ''}${team ? ', staff: staff' : ''}${resources ? ', resource: resource' : ''}, start: ${next}, duration: duration${fee ? ', price: price' : ''}, status: "Booked" })
  }
})`,
    });
    app.rule('appointments', { kind: 'action', name: 'No-show', src: `action("No-show", { when: () => (${open}) && start < now(), hint: "Only one whose time has come" }, () => {\n  status = "No-show"\n})` });
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

    // Book on a customer: the free times of that day for that length, with that person.
    const length = services ? '(empty(input.service) || empty(input.service.duration) ? 30 : input.service.duration)' : '60';
    const free = `[${SLOTS.join(', ')}].map((m) => day(input.when) + minutes(m)).filter((s) => s > now() && empty(find("${called}").find((a) => a.status != "Cancelled"${team ? ' && (empty(input.staff) || a.staff == input.staff)' : ''} && a.start < s + minutes(${length}) && a.ends > s))${team ? ` && (empty(input.staff) || ((empty(input.staff.days) || contains(input.staff.days, weekday(s))) && (empty(input.staff.from) || time(s) >= input.staff.from) && (empty(input.staff.until) || time(s + minutes(${length})) <= input.staff.until)))` : ''}).map((s) => text(time(s)))`;
    app.rule('people', {
      kind: 'action',
      name: 'Book',
      src: `action("Book", {
  ask: {${services ? `
    service: { label: "Service", type: "link", collection: "${app.called('services')}", chips: true, required: true },` : ''}${team ? `
    staff: { label: "With", type: "link", collection: "${app.called('staff')}", chips: true },` : ''}
    when: { label: "When", type: "date", time: true, default: () => today(), required: true, note: () => empty(input.when) ? "" : (empty(${free}) ? "Nothing free that day${team ? '; another day, or another person' : ''}." : "Free: " + text(${free})) },
  },
  done: () => name + " · booked",
}, () => {
  add("${called}", { name: name${services ? ' + " · " + input.service.name' : ''}, customer: this${services ? ', service: input.service' : ''}${team ? ', staff: input.staff' : ''}, start: input.when${services ? ', duration: input.service.duration' : ''}${fee && services ? ', price: input.service.price' : ''}, status: "Booked" })
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

    app.homeTile('appointments', { off: true });
    app.homeTile('people', { off: true });
    if (services) app.homeTile('services', { off: true });
    if (team) app.homeTile('staff', { off: true });
    if (resources) app.homeTile('resources', { off: true });
    app.homeTiles('appointments', [
      { view: 'today', title: 'Today', head: [{ label: '', conditions: [{ field: 'start', op: 'on', value: 'today' }, notCancelled] }, ...(fee ? [{ label: '', field: 'price', conditions: [{ field: 'start', op: 'on' as const, value: 'today' }, notCancelled] }] : [])], value: 'what_said', empty: 'Nothing booked today.' },
      {
        view: 'week',
        title: 'This week',
        head: [{ label: 'booked', conditions: [{ field: 'this_week', op: 'true' }, notCancelled] }],
        ...(staffNames.length > 0 && { lines: staffNames.map((name) => ({ label: name, conditions: [{ field: 'this_week', op: 'true' as const }, notCancelled, { field: 'staff', op: 'is' as const, value: [name] }] })) }),
        value: 'what_said',
        empty: 'Nothing booked this week.',
      },
      { view: 'no-shows', title: 'No-shows', head: [{ label: 'this month', conditions: [{ field: 'status', op: 'is', value: ['No-show'] }, { field: 'this_month', op: 'true' }] }], value: 'start', empty: 'Everyone came this month.' },
    ]);

    const serviceNames = ((answers.services as string[] | undefined) ?? SERVICES).map((s) => serviceOf(s).name);
    app.about({
      title: 'Appointments and bookings',
      what: `${services ? `Appointments for ${serviceNames.length > 0 ? serviceNames.join(', ') : 'your services'}` : 'Bookings'}${resources ? `${services ? ', and bookings' : ''} of your rooms and things` : ''}: who, when${team ? ' and with whom' : ''}, on a calendar.`,
      pieces: ['appointments', ...(services ? ['services'] : []), ...(team ? ['staff'] : []), ...(resources ? ['resources'] : []), 'people'],
      glance: [
        `A calendar of the week${team ? ', its Day a row for each in the team' : ''}`,
        "Today's appointments in Today with Done",
        'Done asks the next visit and books it',
        'Book says the free times',
        ...(remind ? ['Whom to remind the day before'] : []),
        ...(team || resources ? ['Two at the same time are marked'] : []),
        ...(paid ? ['A done one is written as a payment'] : []),
      ],
      how: [
        `Press Book on a customer: ${services ? 'the service, ' : ''}${team ? 'with whom, ' : ''}and when; it says the times free that day. Or drag over its hours on the calendar.`,
        `${remind ? 'The day before, Today lists whom to remind with their phone; press Reminded when they know. ' : ''}Press Arrived when they come, Done when it is over: it asks when they come next, and books it.`,
        'No-show when they did not come; Reschedule asks for the new time; Cancel asks why.',
        ...(team ? ['Each in the team has their own calendar beside the whole one; their hours and days are on their screen.'] : []),
      ],
      auto: [
        ...(services ? [`A new appointment takes its length${fee ? ' and its price' : ''} from its service, unless you write them.`] : []),
        `Book looks at every half hour of the day${team ? ' of that person, within their hours' : ''}, and says those nothing else is booked at.`,
        `Done books the next visit so many weeks on, at the same time${team ? ' with the same person' : ''}; one taken then is said, and marked.`,
        ...(remind ? ['A booked appointment is in Today the day before, with whom to remind and their phone; Reminded makes it Confirmed.'] : []),
        ...(team ? ['An appointment that runs into another of the same person, or is outside their hours or days, is marked; it is kept.'] : []),
        ...(resources ? ['A room or a thing booked twice at the same time is marked; it is kept.'] : []),
        'A customer shows their visits, their last and their next, and how many times they did not come.',
        ...(team ? ['Each in the team shows how many appointments they have today.'] : []),
        ...(paid ? [`When an appointment is Done, a payment of its price is added to ${app.called('payments')}, under the Appointments budget line.`] : []),
      ],
      work: ['How we take bookings: by phone, by message, at the desk.', 'How long before an appointment it can be cancelled.', 'What we do when someone does not come.'],
    });
  },
};

