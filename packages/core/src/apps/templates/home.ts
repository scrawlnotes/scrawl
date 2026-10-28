import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Home, car and documents (design/more-apps.md 4.2): your homes and the things in them with their
// warranties, the papers that run out, your cars, and what is done again and again at home and for
// each car, a job each in Upkeep. Each comes to Today and Upcoming on its day; Done plans a job's
// next time.

const KEEPS = ['items', 'documents', 'vehicles', 'upkeep'];
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

/** What is kept, in its order: none chosen, the things you own. */
const keptOf = (answers: { keeps?: unknown }) => {
  const chosen = KEEPS.filter((k) => keepsOf(answers).includes(k));
  return chosen.length > 0 ? chosen : ['items'];
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
      when: ({ answers }) => keepsOf(answers).includes('items') || keepsOf(answers).includes('upkeep'),
      under: 'keeps',
      help: 'apps.home.homesHelp',
      add: 'apps.home.addHome',
    },
    { key: 'jobs', kind: 'list', label: 'apps.home.jobs', default: JOBS, when: ({ answers }) => keepsOf(answers).includes('upkeep'), under: 'keeps', help: 'apps.home.jobsHelp', add: 'apps.home.addJob' },
    { key: 'cars', kind: 'list', label: 'apps.home.cars', default: CARS, when: ({ answers }) => keepsOf(answers).includes('vehicles'), under: 'keeps', help: 'apps.home.carsHelp', add: 'apps.home.addCar' },
    { key: 'carJobs', kind: 'list', label: 'apps.home.carJobs', default: CAR_JOBS, when: ({ answers }) => keepsOf(answers).includes('vehicles'), under: 'keeps', help: 'apps.home.carJobsHelp', add: 'apps.home.addJob' },
  ],
  money: (answers) => keptOf(answers).includes('items'),
  pieces: (answers) => {
    const keeps = keptOf(answers);
    // The things and the jobs at home are kept by their home; a car's jobs are in Upkeep too.
    return [
      ...(keeps.includes('items') || keeps.includes('upkeep') ? ['homes'] : []),
      ...keeps.filter((k) => k !== 'upkeep'),
      ...(keeps.includes('upkeep') || keeps.includes('vehicles') ? ['upkeep'] : []),
    ];
  },
  menu: ['items', 'documents', 'vehicles', 'upkeep', 'homes'],
  build(app, answers) {
    const homes = app.hasPiece('homes');
    const items = app.hasPiece('items');
    const documents = app.hasPiece('documents');
    const vehicles = app.hasPiece('vehicles');
    const upkeep = app.hasPiece('upkeep');
    const homeJobs = keptOf(answers).includes('upkeep');
    const homeNames = listOf(answers.homes, HOMES);
    const carNames = listOf(answers.cars, CARS);
    // With one home, a thing or a job saved with none is that home's.
    const onlyHome = () => `const homes = find("${app.called('homes')}")\n    if (homes.length == 1) home = homes[0]`;

    if (homes) {
      app.field('homes', nameField());
      app.field('homes', text('address', 'Address'));
      for (const name of homeNames) app.record('homes', { name });
    }
    if (items) {
      app.field('items', nameField());
      if (homes) app.field('items', link('home', 'Home', app.path('homes')));
      app.field('items', text('room', 'Room'));
      app.field('items', day('bought', 'Bought'));
      app.field('items', number('price', 'Price', { format: app.format(false) }));
      app.field('items', day('warranty', 'Warranty until'));
      app.view('items', { ...calendar({ start: 'warranty', upcoming: true }), name: 'Warranties' });
      app.rule('items', { kind: 'check', name: 'Warranty over', src: 'check("warranty", () => empty(warranty) || warranty >= today(), "Its warranty is over")' });
      if (homes) app.rule('items', { kind: 'onSave', name: 'The only home', src: `onSave("The only home", () => {\n  if (empty(home)) {\n    ${onlyHome()}\n  }\n})` });
      if (homes) app.block('homes', { block: 'linked', collection: app.path('items'), style: 'table', fields: ['room', 'warranty'], sort: 'name' });
    }
    if (documents) {
      app.field('documents', nameField());
      app.field('documents', select('type', 'Type', ['ID', 'Passport', 'Driving licence', 'Insurance', 'Other'], { ID: 'blue', Passport: 'purple', 'Driving licence': 'teal', Insurance: 'orange', Other: 'gray' }));
      app.field('documents', text('number', 'No'));
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
      items && `the things you own${homeNames.length > 1 ? ' in each home' : ''} and their warranties`,
      documents && 'the papers that run out',
      vehicles && (carNames.length > 1 ? 'your cars and their jobs' : 'your car and its jobs'),
      homeJobs && 'what is done at home again and again',
    ].filter(Boolean) as string[];
    const said = kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : kept[0]!;
    app.about({
      title: 'Home, car and documents',
      what: `${said[0]!.toUpperCase()}${said.slice(1)}, each in Today and Upcoming on its day.`,
      pieces: ['homes', 'items', 'documents', 'vehicles', 'upkeep'].filter((r) => app.hasPiece(r)),
      glance: [
        ...(items ? ['Warranties that end, in Upcoming'] : []),
        ...(documents ? ['A month before a paper runs out'] : []),
        ...(upkeep ? ['The jobs at home and for the car, in Upcoming', 'Done plans a job’s next time'] : []),
      ],
      how: [
        ...(homes ? [`Each home is in ${app.called('homes')}; add another there, and give a thing or a job its home.`] : []),
        ...(items ? ['Add what you buy, with its price and until when its warranty runs; put its receipt in its notes.'] : []),
        ...(documents ? ['Add each paper with when it runs out.'] : []),
        ...(vehicles ? [`Each car is in ${app.called('vehicles')}, with its jobs in its window: give each its next day.`] : []),
        ...(homeJobs ? ['Give each job at home its next day.'] : []),
        ...(upkeep ? ['Press Done when a job is done.'] : []),
      ],
      auto: [
        ...(items ? ['A warranty comes to Upcoming on its last day; one that is over is marked.'] : []),
        ...(documents ? ['A paper comes to Today and Upcoming a month before it runs out; one that ran out is marked.'] : []),
        ...(upkeep ? ['A job comes to Today and Upcoming on its next day; one past its day is marked.', 'Done writes today as its last time, and its next time a month, a quarter, six months, a year or two years on.'] : []),
        ...(vehicles ? ['A car shows the first of its jobs’ days, and is marked when a job is past its day.'] : []),
        ...(homes ? ['With one home, a thing or a job saved with no home is that home’s.'] : []),
      ],
      work: ['Where the papers and the receipts are kept.', ...(upkeep ? ['Who does what at home and for the car.'] : [])],
    });
  },
};
