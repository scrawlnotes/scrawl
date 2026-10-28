import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Home, car and documents (design/more-apps.md 4.2): what runs out, papers and warranties alike,
// each type with its own fields (design/shown-when.md 6); your homes and cars, and what is done again
// and again at each home and for each car, a job each in Upkeep. Each comes to Today and Upcoming on
// its day; Done plans a job's next time.

const KEEPS = ['documents', 'vehicles', 'upkeep'];
const TYPES = ['ID', 'Passport', 'Driving licence', 'Insurance', 'Warranty', 'Other'];
const HOMES = ['Home'];
const JOBS = ['Boiler service yearly', 'Smoke alarm batteries yearly', 'Air conditioner filters quarterly', 'Water purifier filters every 6 months'];
const CARS = ['Car'];
const CAR_JOBS = ['Inspection every 2 years', 'Insurance yearly', 'Service yearly', 'Tyre change every 6 months'];
const EVERY = ['Monthly', 'Quarterly', 'Every 6 months', 'Yearly', 'Every 2 years'];

/** How often a job is, by the words its name has for it, the longer first: every 6 months before monthly. */
const OFTEN: [RegExp, string][] = [
  [/\b(every\s+6\s+months|every\s+six\s+months|twice\s+a\s+year|half[-\s]?yearly|semi[-\s]?annually)\b/i, 'Every 6 months'],
  [/\b(every\s+2\s+years|every\s+two\s+years|every\s+other\s+year|biennially)\b/i, 'Every 2 years'],
  [/\b(every\s+3\s+months|every\s+quarter|quarterly)\b/i, 'Quarterly'],
  [/\b(every\s+month|monthly)\b/i, 'Monthly'],
  [/\b(every\s+year|yearly|annually)\b/i, 'Yearly'],
];

/** A job as the list says it: its name, and how often from the words in it; yearly when it says none. */
export function jobOf(item: string): { name: string; every: string } {
  const words = item.trim();
  const found = OFTEN.find(([pattern]) => pattern.test(words));
  const name = found ? words.replace(found[0], ' ').replace(/\s+/g, ' ').trim() : words;
  return { name: name || words, every: found?.[1] ?? 'Yearly' };
}

/** The time to a job's next, by its Every. */
const everySpan = (field: string) =>
  `(${field} == "Monthly" ? months(1) : ${field} == "Quarterly" ? months(3) : ${field} == "Every 6 months" ? months(6) : ${field} == "Every 2 years" ? years(2) : years(1))`;

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
  version: 2,
  group: 'home',
  name: 'apps.home.name',
  short: 'apps.home.short',
  icon: 'keys',
  what: 'apps.home.what',
  questions: [
    { key: 'keeps', kind: 'multi', label: 'apps.home.keeps', options: KEEPS.map((value) => ({ value, label: `apps.home.keep.${value}` as MessageKey })), default: KEEPS },
    {
      key: 'homes',
      kind: 'list',
      label: 'apps.home.homes',
      default: HOMES,
      when: ({ answers }) => keepsOf(answers).includes('upkeep'),
      under: 'keeps',
      help: 'apps.home.homesHelp',
      add: 'apps.home.addHome',
    },
    { key: 'jobs', kind: 'list', label: 'apps.home.jobs', default: JOBS, when: ({ answers }) => keepsOf(answers).includes('upkeep'), under: 'keeps', help: 'apps.home.jobsHelp', add: 'apps.home.addJob' },
    { key: 'cars', kind: 'list', label: 'apps.home.cars', default: CARS, when: ({ answers }) => keepsOf(answers).includes('vehicles'), under: 'keeps', help: 'apps.home.carsHelp', add: 'apps.home.addCar' },
    { key: 'carJobs', kind: 'list', label: 'apps.home.carJobs', default: CAR_JOBS, when: ({ answers }) => keepsOf(answers).includes('vehicles'), under: 'keeps', help: 'apps.home.carJobsHelp', add: 'apps.home.addJob' },
  ],
  money: () => false,
  pieces: (answers) => {
    const keeps = keptOf(answers);
    // The jobs at home are kept by their home; a car's jobs are in Upkeep too.
    return [
      ...(keeps.includes('upkeep') ? ['homes'] : []),
      ...keeps.filter((k) => k !== 'upkeep'),
      ...(keeps.includes('upkeep') || keeps.includes('vehicles') ? ['upkeep'] : []),
    ];
  },
  menu: ['documents', 'vehicles', 'upkeep', 'homes'],
  build(app, answers) {
    const homes = app.hasPiece('homes');
    const documents = app.hasPiece('documents');
    const vehicles = app.hasPiece('vehicles');
    const upkeep = app.hasPiece('upkeep');
    const homeJobs = keptOf(answers).includes('upkeep');
    const homeNames = listOf(answers.homes, HOMES);
    const carNames = listOf(answers.cars, CARS);
    // With one home, a job saved with none is that home's.
    const onlyHome = () => `const homes = find("${app.called('homes')}")\n    if (homes.length == 1) home = homes[0]`;

    if (homes) {
      app.field('homes', nameField());
      app.field('homes', text('address', 'Address'));
      for (const name of homeNames) app.record('homes', { name });
    }
    if (documents) {
      app.field('documents', nameField());
      app.field('documents', select('type', 'Type', TYPES, { ID: 'blue', Passport: 'purple', 'Driving licence': 'teal', Insurance: 'orange', Warranty: 'green', Other: 'gray' }));
      // A warranty's store and day bought, an insurance's insurer: on the form for that type only.
      const of = (type: string) => ({ when: [{ field: 'type', op: 'is' as const, value: [type] }] });
      app.field('documents', { ...text('store', 'Store'), ...of('Warranty') });
      app.field('documents', { ...day('bought', 'Bought'), ...of('Warranty') });
      app.field('documents', { ...text('insurer', 'Insurer'), ...of('Insurance') });
      app.field('documents', { ...day('expires', 'Expires'), required: true });
      // A month before it runs out, to have time to renew it.
      app.field('documents', formula('remind', 'Remind on', 'expires - 30'));
      app.view('documents', calendar({ start: 'remind', color: 'type', upcoming: true }));
      app.rule('documents', { kind: 'check', name: 'Expired', src: 'check("expires", () => empty(expires) || expires >= today(), "Expired")' });
    }
    if (upkeep) {
      app.field('upkeep', nameField());
      if (homes && homeJobs) app.field('upkeep', link('home', 'Home', app.path('homes')));
      if (vehicles) app.field('upkeep', link('vehicle', 'Car', app.path('vehicles')));
      // How often is not how it stands: one color for all.
      app.field('upkeep', select('every', 'Every', EVERY, Object.fromEntries(EVERY.map((e) => [e, 'gray' as const])), 'Yearly'));
      app.field('upkeep', day('next', 'Next'));
      app.field('upkeep', day('last', 'Last done'));
      app.view('upkeep', calendar({ start: 'next', upcoming: true }));
      app.rule('upkeep', { kind: 'check', name: 'Overdue', src: 'check("next", () => empty(next) || next >= today(), "Overdue")' });
      app.rule('upkeep', {
        kind: 'action',
        name: 'Done',
        src: `action("Done", () => {
  last = today()
  next = today() + ${everySpan('every')}
})`,
      });
      // A job saved with neither a home nor a car is the only home's; a car's is added from its car.
      if (homes && homeJobs) app.rule('upkeep', { kind: 'onSave', name: 'The only home', src: `onSave("The only home", () => {\n  if (empty(home)${vehicles ? ' && empty(vehicle)' : ''}) {\n    ${onlyHome()}\n  }\n})` });
      // With no homes kept, only cars, a job saved with no car is the only car's.
      else if (vehicles) app.rule('upkeep', { kind: 'onSave', name: 'The only car', src: `onSave("The only car", () => {
  if (empty(vehicle)) {
    const cars = find("${app.called('vehicles')}")
    if (cars.length == 1) vehicle = cars[0]
  }
})` });
      if (homes && homeJobs) app.block('homes', { block: 'linked', collection: app.path('upkeep'), style: 'table', fields: ['every', 'next', 'last'], sort: 'next' });
    }
    if (vehicles) {
      app.field('vehicles', nameField());
      app.field('vehicles', text('plate', 'Plate'));
      app.field('vehicles', number('km', 'Kilometres'));
      // The first of its jobs' days: a car comes to Upkeep's calendar by its jobs, and is marked when one is past.
      app.field('vehicles', rollup('next', 'Next', app.path('upkeep'), 'min', 'next'));
      app.block('vehicles', { block: 'linked', collection: app.path('upkeep'), style: 'table', fields: ['every', 'next', 'last'], sort: 'next' });
      app.rule('vehicles', { kind: 'check', name: 'A job is due', src: 'check("next", () => empty(next) || next >= today(), "A job is past its day")' });
      for (const name of carNames) app.record('vehicles', { name });
    }
    if (upkeep) {
      if (homes && homeJobs) for (const home of homeNames) for (const job of listOf(answers.jobs, JOBS)) app.record('upkeep', { ...jobOf(job), home });
      if (vehicles) for (const car of carNames) for (const job of listOf(answers.carJobs, CAR_JOBS)) app.record('upkeep', { ...jobOf(job), vehicle: car });
    }

    const kept = [
      documents && 'papers and warranties that run out',
      vehicles && (carNames.length > 1 ? 'your cars and their jobs' : 'your car and its jobs'),
      homeJobs && 'what is done at home again and again',
    ].filter(Boolean) as string[];
    const said = kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : kept[0]!;
    app.about({
      title: 'Home, car and documents',
      what: `${said[0]!.toUpperCase()}${said.slice(1)}, each in Today and Upcoming on its day.`,
      pieces: ['homes', 'documents', 'vehicles', 'upkeep'].filter((r) => app.hasPiece(r)),
      glance: [
        ...(documents ? ['A month before a paper or a warranty runs out'] : []),
        ...(upkeep ? ['The jobs at home and for the car, in Upcoming', 'Done plans a job’s next time'] : []),
      ],
      how: [
        ...(homes ? [`Each home is in ${app.called('homes')}; add another there, and give a job its home.`] : []),
        ...(documents ? ['Add each paper with when it runs out; a warranty as a document of its own type, with where it was bought, its receipt and card in its notes.'] : []),
        ...(vehicles ? [`Each car is in ${app.called('vehicles')}, with its jobs in its window: give each its next day.`] : []),
        ...(homeJobs ? ['Give each job at home its next day.'] : []),
        ...(upkeep ? ['Press Done when a job is done.'] : []),
      ],
      auto: [
        ...(documents ? ['A paper or a warranty comes to Today and Upcoming a month before it runs out; one that ran out is marked.', 'A warranty asks for its store and the day it was bought, an insurance for its insurer.'] : []),
        ...(upkeep ? ['A job comes to Today and Upcoming on its next day; one past its day is marked.', 'Done writes today as its last time, and its next time a month, a quarter, six months, a year or two years on.'] : []),
        ...(vehicles ? ['A car shows the first of its jobs’ days, and is marked when a job is past its day.'] : []),
        ...(homes ? ['With one home, a job saved with no home is that home’s.'] : []),
      ],
      work: ['Where the papers and the receipts are kept.', ...(upkeep ? ['Who does what at home and for the car.'] : [])],
    });
  },
};
