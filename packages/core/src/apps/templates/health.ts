import type { Field } from '../../collection';
import { calendar, day, dayAndTime, formula, link, nameField, number, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { DONE, EVERY, jobOf, UNITS } from './home';

// Health (design/more-apps.md 4.3): what a person or a family needs to remember about health, with
// as little typed as can be. A medicine says when it runs out from its dose and its box, and comes
// to Today before it does; an appointment takes its place and phone from its doctor, and books the
// next; a check-up or a vaccine comes again by itself; a record is its file.

const OFTEN = ['Once a day', 'Twice a day', '3 times a day', 'As needed'];
const KINDS = ['Lab result', 'Report', 'Prescription', 'Imaging', 'Other'];
const CHECKUPS = ['Dentist every 6 months', 'General check-up every year', 'Eye exam every 2 years', 'Flu shot every year'];
const FOLLOW = ['In 2 weeks', 'In 1 month', 'In 3 months', 'In 6 months', 'In 1 year'];
/** A medicine comes to Today this many days before it runs out. */
const AHEAD = 5;

/** The items of a list answer, trimmed, the empty ones left out; its default when it was not given. */
const listOf = (answer: unknown, fallback: string[]) => ((answer as string[] | undefined) ?? fallback).map((item) => item.trim()).filter(Boolean);
const gray = (options: string[]) => Object.fromEntries(options.map((o) => [o, 'gray' as const]));

export const health: AppTemplate = {
  id: 'health',
  version: 2,
  group: 'health',
  name: 'apps.health.name',
  short: 'apps.health.short',
  icon: 'sun',
  what: 'apps.health.what',
  questions: [
    {
      key: 'for',
      kind: 'choice',
      label: 'apps.health.for',
      options: [
        { value: 'me', label: 'apps.health.for.me' },
        { value: 'family', label: 'apps.health.for.family' },
      ],
      default: 'me',
    },
    { key: 'family', kind: 'list', label: 'apps.health.family', default: [], when: ({ answers }) => answers.for === 'family', under: 'for', help: 'apps.health.familyHelp', add: 'apps.health.addPerson' },
    { key: 'medications', kind: 'yesno', label: 'apps.health.medications', default: true },
    { key: 'checkups', kind: 'list', label: 'apps.health.checkups', default: CHECKUPS, help: 'apps.health.checkupsHelp', add: 'apps.health.addCheckup' },
  ],
  money: () => false,
  pieces: (answers) => [...(answers.medications !== false ? ['medications'] : []), 'visits', 'checkups', 'results', 'doctors'],
  // A Health set up before keeps its Vaccinations in the menu.
  menu: ['medications', 'visits', 'checkups', 'results', 'doctors', 'vaccinations'],
  build(app, answers) {
    const family = answers.for === 'family';
    const names = family ? listOf(answers.family, []) : [];
    const medications = app.hasPiece('medications');
    const doctors = app.path('doctors');
    const visits = app.path('visits');
    const results = app.path('results');
    // With a family, whose each record is: one of them, or any name when none are listed; alone, no such field.
    const whose = (role: string) => {
      if (!family) return;
      const field: Field = names.length > 0 ? select('person', 'For', names) : text('person', 'For');
      app.field(role, field);
    };
    const byPerson = family ? { color: 'person' } : {};
    // What a row in Today says after its collection: whose it is, then its own words.
    const words = (...keys: string[]) => ({ words: [...(family ? ['person'] : []), ...keys] });

    // Doctors: written once; an appointment takes their place and phone.
    app.field('doctors', nameField());
    app.field('doctors', text('specialty', 'Specialty'));
    app.field('doctors', text('clinic', 'Clinic'));
    app.field('doctors', { key: 'phone', label: 'Phone', type: 'phone' });
    app.block('doctors', { block: 'linked', collection: visits, style: 'table', fields: ['name', 'when'], sort: 'when', dir: 'desc' });
    app.block('doctors', { block: 'linked', collection: results, style: 'table', fields: ['name', 'kind', 'date'], sort: 'date', dir: 'desc' });

    if (medications) {
      // A medicine: its dose, how often, how many in a box; when it runs out is worked out from them.
      app.field('medications', nameField());
      whose('medications');
      app.field('medications', text('dose', 'Dose'));
      app.field('medications', select('often', 'How often', OFTEN, gray(OFTEN), OFTEN[0]));
      app.field('medications', number('box', 'In a box'));
      app.field('medications', { ...day('since', 'Since', true), required: true });
      app.field('medications', select('status', 'Status', ['Taking', 'Stopped'], { Taking: 'green', Stopped: 'gray' }, 'Taking'));
      app.field('medications', formula('runs_out', 'Runs out', 'often == "As needed" || empty(box) ? null : since + round(box / (often == "Twice a day" ? 2 : often == "3 times a day" ? 3 : 1), 0)'));
      app.field('medications', formula('left', 'Left', 'empty(runs_out) ? null : runs_out < today() ? "Ran out" : runs_out == today() ? "Runs out today" : text(runs_out - today()) + (runs_out - today() == 1 ? " day left" : " days left")'));
      app.field('medications', formula('remind', 'Remind on', `empty(runs_out) ? null : runs_out - ${AHEAD}`));
      const taking = [{ field: 'status', op: 'is' as const, value: ['Taking'] }];
      app.view('medications', { id: 'taking', name: 'Taking', conditions: taking, columns: [...(family ? ['person'] : []), 'dose', 'often', 'runs_out', 'left'] }, true);
      app.view('medications', calendar({ start: 'remind', ...byPerson, upcoming: true, button: 'Refilled', ...words('left') }, taking));
      app.rule('medications', { kind: 'check', name: 'Runs out soon', src: `check("runs_out", () => empty(runs_out) || status != "Taking" || runs_out - today() > ${AHEAD}, "Runs out soon")` });
      app.rule('medications', { kind: 'action', name: 'Refilled', src: 'action("Refilled", { say: () => "A new box, counted from today" }, () => {\n  since = today()\n  status = "Taking"\n})' });
      app.rule('medications', { kind: 'action', name: 'Stopped', src: 'action("Stopped", { when: () => status != "Stopped", hint: "Stopped already" }, () => {\n  status = "Stopped"\n})' });
    }

    // Appointments: a doctor and a day; its place and phone the doctor's; named after the doctor.
    app.field('visits', nameField('Title'));
    app.field('visits', { ...link('doctor', 'Doctor', doctors), required: true });
    whose('visits');
    app.field('visits', { ...dayAndTime('when', 'When'), required: true });
    app.field('visits', { key: 'clinic', label: 'Clinic', type: 'lookup', lookup: { link: 'doctor', field: 'clinic' } });
    app.field('visits', { key: 'phone', label: 'Phone', type: 'lookup', lookup: { link: 'doctor', field: 'phone' } });
    // Its name is its doctor's: the table does not say the doctor twice.
    app.view('visits', { id: 'all', name: 'All', conditions: [], sort: { key: 'when', dir: 'desc' }, columns: [...(family ? ['person'] : []), 'when', 'clinic', 'phone'] });
    app.view('visits', calendar({ start: 'when', ...byPerson, upcoming: true, ...words('clinic') }));
    app.block('visits', { block: 'linked', collection: results, style: 'table', fields: ['name', 'kind', 'date'], sort: 'date' });
    app.rule('visits', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {\n  if (empty(name) && !empty(doctor)) name = doctor.name${family ? ' + (empty(person) ? "" : " · " + person)' : ''}\n})`,
    });
    // The next appointment with the same doctor and person, on the day picked.
    app.rule('visits', {
      kind: 'action',
      name: 'Book follow-up',
      src: `action("Book follow-up", {
  ask: { after: { label: "When", type: "choice", options: [${FOLLOW.map((f) => JSON.stringify(f)).join(', ')}], default: "In 6 months", required: true } },
}, () => {
  const from = day(when)
  let next = from + 14
  if (input.after == "In 1 month") next = from + months(1)
  else if (input.after == "In 3 months") next = from + months(3)
  else if (input.after == "In 6 months") next = from + months(6)
  else if (input.after == "In 1 year") next = from + years(1)
  add("${app.called('visits')}", { name: name, doctor: doctor, when: next${family ? ', person: person' : ''} })
})`,
    });

    // Check-ups: what comes again, a check or a vaccine, for each person; Done writes when the next one is.
    app.field('checkups', nameField());
    whose('checkups');
    app.field('checkups', select('every', 'Every', EVERY, gray(EVERY), 'Yearly'));
    const custom = { when: [{ field: 'every', op: 'is' as const, value: ['Custom'] }] };
    app.field('checkups', { ...number('interval', 'How many'), required: true, ...custom });
    app.field('checkups', { ...select('unit', 'Of', UNITS, gray(UNITS), 'Years'), ...custom });
    app.field('checkups', day('next', 'Next'));
    app.field('checkups', day('last', 'Last done'));
    app.view('checkups', calendar({ start: 'next', ...byPerson, upcoming: true, button: 'Done', ...words() }));
    app.rule('checkups', { kind: 'check', name: 'Overdue', src: 'check("next", () => empty(next) || next >= today(), "Overdue")' });
    app.rule('checkups', { kind: 'action', name: 'Done', src: DONE });
    for (const person of family && names.length > 0 ? names : [null]) {
      for (const item of listOf(answers.checkups, CHECKUPS)) app.record('checkups', { ...jobOf(item), ...(person && { person }) });
    }

    // Records: a result, a report, a prescription; its file in its notes.
    app.field('results', nameField());
    app.field('results', select('kind', 'Kind', KINDS, { 'Lab result': 'blue', Report: 'purple', Prescription: 'green', Imaging: 'teal', Other: 'gray' }, KINDS[0]));
    app.field('results', day('date', 'Date', true));
    whose('results');
    app.field('results', link('doctor', 'Doctor', doctors));
    app.field('results', link('visit', 'Appointment', visits));

    app.about({
      title: 'Health',
      what: `${family ? `Your family's health${names.length > 0 ? `, ${names.join(', ')}` : ''}` : 'Your health'}: ${medications ? 'medicines and when they run out, ' : ''}appointments, check-ups and vaccines that come again, and the records.`,
      pieces: [...(medications ? ['medications'] : []), 'visits', 'checkups', 'results', 'doctors'],
      glance: [...(medications ? ['When a medicine runs out, worked out'] : []), 'An appointment’s place from its doctor', 'Check-ups that come again', ...(family ? ['Whose each one is'] : [])],
      how: [
        ...(medications ? ['Add a medicine with its dose, how often and how many are in a box; press Refilled with a new box, Stopped when it is no longer taken.'] : []),
        `Write each doctor once in ${app.called('doctors')}; an appointment is its doctor and its day. After it, Book follow-up books the next.`,
        `Check-ups and vaccines are in ${app.called('checkups')}${family ? ', for each person' : ''}: press Done when one is done.`,
        'Add a result, a report or a prescription with its file in its notes.',
      ],
      auto: [
        ...(medications ? [`A medicine says when it runs out from its box and how often it is taken, and comes to Today ${AHEAD} days before; one about to run out is marked.`] : []),
        'An appointment takes its doctor’s clinic and phone, and its name; it comes to Today and Upcoming.',
        'Done writes today as a check-up’s last time and its next as often as Every says; one past its day is marked.',
      ],
      work: ['Where the papers are kept.', 'Who to call when someone is ill.'],
    });
  },
};
