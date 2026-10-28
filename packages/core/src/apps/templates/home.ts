import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Home, car and documents (design/more-apps.md 4.2): the documents you keep, a manual or a passport,
// a day each runs out when it does; what is done again and again at each home and for each car, a
// reminder each with how often; your homes and cars, each with its reminders and documents. Each
// comes to Today and Upcoming on its day; Done plans a reminder's next time.

const KEEPS = ['documents', 'vehicles', 'upkeep'];
const HOMES = ['Home'];
const JOBS = ['Boiler service every year', 'Smoke alarm batteries every year', 'Air conditioner filters every 3 months', 'Water purifier filters every 6 months'];
const CARS = ['Car'];
const CAR_JOBS = ['Inspection every 2 years', 'Insurance every year', 'Service every year', 'Tyre change every 6 months'];
/** How often, as ready ones; Custom is a number of days, weeks, months or years. */
export const EVERY = ['Weekly', 'Monthly', 'Every 3 months', 'Every 6 months', 'Yearly', 'Every 2 years', 'Custom'];
export const UNITS = ['Days', 'Weeks', 'Months', 'Years'];
const REMIND = ['On the day', '1 week before', '1 month before'];

/** The ready ones by the words for them, the longer first: every 6 months before monthly. */
const OFTEN: [RegExp, string][] = [
  [/\b(every\s+6\s+months|every\s+six\s+months|twice\s+a\s+year|half[-\s]?yearly|semi[-\s]?annually)\b/i, 'Every 6 months'],
  [/\b(every\s+2\s+years|every\s+two\s+years|every\s+other\s+year|biennially)\b/i, 'Every 2 years'],
  [/\b(every\s+3\s+months|every\s+three\s+months|every\s+quarter|quarterly)\b/i, 'Every 3 months'],
  [/\b(every\s+(1\s+)?week|weekly)\b/i, 'Weekly'],
  [/\b(every\s+(1\s+)?month|monthly)\b/i, 'Monthly'],
  [/\b(every\s+(1\s+)?year|yearly|annually)\b/i, 'Yearly'],
];
/** Any other number of days, weeks, months or years: Custom. */
const CUSTOM = /\bevery\s+(\d+)\s+(day|week|month|year)s?\b/i;

/** A reminder as the list says it: its name, and how often from the words in it; yearly when it says none. */
export function jobOf(item: string): { name: string; every: string; interval?: number; unit?: string } {
  const words = item.trim();
  const cut = (found: RegExp) => words.replace(found, ' ').replace(/\s+/g, ' ').trim() || words;
  const ready = OFTEN.find(([pattern]) => pattern.test(words));
  if (ready) return { name: cut(ready[0]), every: ready[1] };
  const custom = words.match(CUSTOM);
  if (custom) return { name: cut(CUSTOM), every: 'Custom', interval: Number(custom[1]), unit: `${custom[2]![0]!.toUpperCase()}${custom[2]!.slice(1).toLowerCase()}s` };
  return { name: words, every: 'Yearly' };
}

/** Done: today its last time, its next as often as Every says, by its number and unit when Custom; days apart from months and years. */
export const DONE = `action("Done", () => {
  last = today()
  if (every == "Weekly") next = today() + 7
  else if (every == "Custom" && unit == "Days") next = today() + interval
  else if (every == "Custom" && unit == "Weeks") next = today() + interval * 7
  else if (every == "Custom") next = today() + (unit == "Years" ? years(interval) : months(interval))
  else next = today() + (every == "Monthly" ? months(1) : every == "Every 3 months" ? months(3) : every == "Every 6 months" ? months(6) : every == "Every 2 years" ? years(2) : years(1))
})`;

/** The items of a list answer, trimmed, the empty ones left out; its default when it was not given. */
const listOf = (answer: unknown, fallback: string[]) => ((answer as string[] | undefined) ?? fallback).map((item) => item.trim()).filter(Boolean);

const keepsOf = (answers: { keeps?: unknown }) => (Array.isArray(answers.keeps) ? (answers.keeps as string[]) : KEEPS);

/** What is kept, in its order: none chosen, the documents. */
const keptOf = (answers: { keeps?: unknown }) => {
  const chosen = KEEPS.filter((k) => keepsOf(answers).includes(k));
  return chosen.length > 0 ? chosen : ['documents'];
};

export const home: AppTemplate = {
  id: 'home',
  version: 3,
  group: 'home',
  name: 'apps.home.name',
  short: 'apps.home.short',
  icon: 'keys',
  what: 'apps.home.what',
  questions: [
    { key: 'keeps', kind: 'multi', label: 'apps.home.keeps', options: KEEPS.map((value) => ({ value, label: `apps.home.keep.${value}` as MessageKey })), default: KEEPS },
    { key: 'homes', kind: 'list', label: 'apps.home.homes', default: HOMES, when: ({ answers }) => keepsOf(answers).includes('upkeep'), under: 'keeps', help: 'apps.home.homesHelp', add: 'apps.home.addHome' },
    { key: 'jobs', kind: 'list', label: 'apps.home.jobs', default: JOBS, when: ({ answers }) => keepsOf(answers).includes('upkeep'), under: 'keeps', help: 'apps.home.jobsHelp', add: 'apps.home.addJob' },
    { key: 'cars', kind: 'list', label: 'apps.home.cars', default: CARS, when: ({ answers }) => keepsOf(answers).includes('vehicles'), under: 'keeps', help: 'apps.home.carsHelp', add: 'apps.home.addCar' },
    { key: 'carJobs', kind: 'list', label: 'apps.home.carJobs', default: CAR_JOBS, when: ({ answers }) => keepsOf(answers).includes('vehicles'), under: 'keeps', help: 'apps.home.carJobsHelp', add: 'apps.home.addJob' },
  ],
  money: () => false,
  pieces: (answers) => {
    const keeps = keptOf(answers);
    // The reminders at home are kept by their home; a car's are in Reminders too.
    return [
      ...(keeps.includes('upkeep') ? ['homes'] : []),
      ...keeps.filter((k) => k !== 'upkeep'),
      ...(keeps.includes('upkeep') || keeps.includes('vehicles') ? ['upkeep'] : []),
    ];
  },
  menu: ['upkeep', 'documents', 'vehicles', 'homes'],
  build(app, answers) {
    const homes = app.hasPiece('homes');
    const documents = app.hasPiece('documents');
    const vehicles = app.hasPiece('vehicles');
    const upkeep = app.hasPiece('upkeep');
    const homeJobs = keptOf(answers).includes('upkeep');
    const homeNames = listOf(answers.homes, HOMES);
    const carNames = listOf(answers.cars, CARS);
    // With one home, a reminder saved with neither a home nor a car is that home's.
    const onlyHome = () => `const homes = find("${app.called('homes')}")\n    if (homes.length == 1) home = homes[0]`;

    if (homes) {
      app.field('homes', nameField());
      app.field('homes', text('address', 'Address'));
      for (const name of homeNames) app.record('homes', { name });
    }
    if (vehicles) {
      app.field('vehicles', nameField());
      app.field('vehicles', text('plate', 'Plate'));
      for (const name of carNames) app.record('vehicles', { name });
    }
    if (documents) {
      // A document: a manual, a passport, a policy; the day it runs out when it does, its file in its notes.
      app.field('documents', nameField());
      if (homes) app.field('documents', link('home', 'Home', app.path('homes')));
      if (vehicles) app.field('documents', link('car', 'Car', app.path('vehicles')));
      app.field('documents', day('expires', 'Expires'));
      // A month before it runs out, to have time to renew it.
      app.field('documents', formula('remind', 'Remind on', 'expires - 30'));
      app.view('documents', calendar({ start: 'remind', upcoming: true }));
      app.rule('documents', { kind: 'check', name: 'Expired', src: 'check("expires", () => empty(expires) || expires >= today(), "Expired")' });
      if (homes) app.block('homes', { block: 'linked', collection: app.path('documents'), style: 'table', fields: ['expires'], sort: 'name' });
      if (vehicles) app.block('vehicles', { block: 'linked', collection: app.path('documents'), style: 'table', fields: ['expires'], sort: 'name' });
    }
    if (upkeep) {
      app.field('upkeep', nameField());
      if (homes) app.field('upkeep', link('home', 'Home', app.path('homes')));
      if (vehicles) app.field('upkeep', link('car', 'Car', app.path('vehicles')));
      app.field('upkeep', day('next', 'Next'));
      // How often is not how it stands: one color for all. Custom asks how many of what.
      app.field('upkeep', select('every', 'Every', EVERY, Object.fromEntries(EVERY.map((e) => [e, 'gray' as const])), 'Yearly'));
      const custom = { when: [{ field: 'every', op: 'is' as const, value: ['Custom'] }] };
      app.field('upkeep', { ...number('interval', 'How many'), required: true, ...custom });
      app.field('upkeep', { ...select('unit', 'Of', UNITS, Object.fromEntries(UNITS.map((u) => [u, 'gray' as const])), 'Months'), ...custom });
      app.field('upkeep', select('remind', 'Remind', REMIND, Object.fromEntries(REMIND.map((r) => [r, 'gray' as const])), 'On the day'));
      // The day it comes to Today and Upcoming: its next, or as long before it as Remind says.
      app.field('upkeep', formula('remind_on', 'Remind on', 'next - (remind == "1 week before" ? 7 : remind == "1 month before" ? 30 : 0)'));
      app.field('upkeep', day('last', 'Last done'));
      // Done is on its row in Today; one past its day stays in Overdue till it is done.
      app.view('upkeep', calendar({ start: 'remind_on', upcoming: true, button: 'Done' }));
      app.rule('upkeep', { kind: 'check', name: 'Overdue', src: 'check("next", () => empty(next) || next >= today(), "Overdue")' });
      app.rule('upkeep', { kind: 'action', name: 'Done', src: DONE });
      if (homes) app.rule('upkeep', { kind: 'onSave', name: 'The only home', src: `onSave("The only home", () => {\n  if (empty(home)${vehicles ? ' && empty(car)' : ''}) {\n    ${onlyHome()}\n  }\n})` });
      // With no homes kept, only cars, a reminder saved with no car is the only car's.
      else if (vehicles) app.rule('upkeep', { kind: 'onSave', name: 'The only car', src: `onSave("The only car", () => {
  if (empty(car)) {
    const cars = find("${app.called('vehicles')}")
    if (cars.length == 1) car = cars[0]
  }
})` });
      if (homes) app.block('homes', { block: 'linked', collection: app.path('upkeep'), style: 'table', fields: ['next', 'every', 'last'], sort: 'next' });
      if (vehicles) {
        // The first of its reminders' days; the car marked when one is past.
        app.field('vehicles', rollup('next', 'Next', app.path('upkeep'), 'min', 'next'));
        app.block('vehicles', { block: 'linked', collection: app.path('upkeep'), style: 'table', fields: ['next', 'every', 'last'], sort: 'next' });
        app.rule('vehicles', { kind: 'check', name: 'A reminder is due', src: 'check("next", () => empty(next) || next >= today(), "A reminder is past its day")' });
      }
      if (homes && homeJobs) for (const home of homeNames) for (const job of listOf(answers.jobs, JOBS)) app.record('upkeep', { ...jobOf(job), home });
      if (vehicles) for (const car of carNames) for (const job of listOf(answers.carJobs, CAR_JOBS)) app.record('upkeep', { ...jobOf(job), car });
    }

    const kept = [
      documents && 'your documents and when they run out',
      upkeep && `what is done again and again${homeJobs ? ' at home' : ''}${homeJobs && vehicles ? ' and' : ''}${vehicles ? (carNames.length > 1 ? ' for your cars' : ' for your car') : ''}`,
    ].filter(Boolean) as string[];
    const said = kept.join(', and ');
    app.about({
      title: 'Home, car and documents',
      what: `${said[0]!.toUpperCase()}${said.slice(1)}, each in Today and Upcoming on its day.`,
      pieces: ['upkeep', 'documents', 'vehicles', 'homes'].filter((r) => app.hasPiece(r)),
      glance: [
        ...(documents ? ['A month before a document runs out'] : []),
        ...(upkeep ? ['Reminders in Upcoming on their day', 'Done plans the next time'] : []),
      ],
      how: [
        ...(upkeep ? ['Give each reminder its next day and how often; press Done when it is done.'] : []),
        ...(documents ? ['Add each document, its file in its notes; give it the day it runs out when it does.'] : []),
        ...(homes ? [`Each home is in ${app.called('homes')}, with its reminders and documents.`] : []),
        ...(vehicles ? [`Each car is in ${app.called('vehicles')}, with its reminders and documents.`] : []),
      ],
      auto: [
        ...(upkeep ? ['A reminder comes to Today and Upcoming on its day, or a week or a month before as Remind says; one past its day is marked.', 'Done writes today as its last time, and its next as often as Every says.'] : []),
        ...(documents ? ['A document comes to Today and Upcoming a month before it runs out; one that ran out is marked.'] : []),
        ...(upkeep && vehicles ? ['A car shows the first of its reminders’ days, and is marked when one is past.'] : []),
        ...(upkeep && homes ? ['With one home, a reminder saved with no home or car is that home’s.'] : []),
      ],
      work: ['Where the papers are kept.', ...(upkeep ? ['Who does what at home and for the car.'] : [])],
    });
  },
};
