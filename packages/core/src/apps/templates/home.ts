import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, formula, nameField, number, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { periodSpan } from './subscriptions';

// Home, car and documents (design/more-apps.md 4.2): the things you own and their warranties, the
// papers that run out, the car's inspection, insurance and service, and what is done at home again
// and again. Each comes to Today and Upcoming on its day; Done plans a job's next time.

const KEEPS = ['items', 'documents', 'vehicles', 'upkeep'];
const JOBS = ['Boiler service yearly', 'Smoke alarm batteries yearly', 'Air conditioner filters quarterly'];
const EVERY = ['Monthly', 'Quarterly', 'Yearly'];

/** A job as the list says it: its name, and how often from a word in it; yearly when it says none. */
export function jobOf(item: string): { name: string; every: string } {
  const words = item.trim();
  const every = /\b(month|monthly)\b/i.test(words) ? 'Monthly' : /\b(quarter|quarterly)\b/i.test(words) ? 'Quarterly' : 'Yearly';
  const name = words.replace(/\s*\b(monthly|quarterly|yearly|annually)\b\s*/i, ' ').trim();
  return { name: name || words, every };
}

export const home: AppTemplate = {
  id: 'home',
  version: 1,
  group: 'home',
  name: 'apps.home.name',
  short: 'apps.home.short',
  icon: 'keys',
  what: 'apps.home.what',
  questions: [
    { key: 'keeps', kind: 'multi', label: 'apps.home.keeps', options: KEEPS.map((value) => ({ value, label: `apps.home.keep.${value}` as MessageKey })), default: KEEPS },
    { key: 'jobs', kind: 'list', label: 'apps.home.jobs', default: JOBS, when: ({ answers }) => Array.isArray(answers.keeps) && answers.keeps.includes('upkeep'), under: 'keeps', help: 'apps.home.jobsHelp', add: 'apps.home.addJob' },
  ],
  money: (answers) => !Array.isArray(answers.keeps) || answers.keeps.includes('items'),
  pieces: (answers) => {
    const keeps = Array.isArray(answers.keeps) ? answers.keeps : KEEPS;
    // Something to keep: none chosen, the things you own.
    return KEEPS.filter((k) => keeps.includes(k)).length > 0 ? KEEPS.filter((k) => keeps.includes(k)) : ['items'];
  },
  menu: ['items', 'documents', 'vehicles', 'upkeep'],
  build(app, answers) {
    const items = app.hasPiece('items');
    const documents = app.hasPiece('documents');
    const vehicles = app.hasPiece('vehicles');
    const upkeep = app.hasPiece('upkeep');

    if (items) {
      app.field('items', nameField());
      app.field('items', text('room', 'Room'));
      app.field('items', day('bought', 'Bought'));
      app.field('items', number('price', 'Price', { format: app.format(false) }));
      app.field('items', day('warranty', 'Warranty until'));
      app.view('items', { ...calendar({ start: 'warranty', upcoming: true }), name: 'Warranties' });
      app.rule('items', { kind: 'check', name: 'Warranty over', src: 'check("warranty", () => empty(warranty) || warranty >= today(), "Its warranty is over")' });
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
    if (vehicles) {
      app.field('vehicles', nameField());
      app.field('vehicles', text('plate', 'Plate'));
      app.field('vehicles', day('inspection', 'Inspection due'));
      app.field('vehicles', day('insurance', 'Insurance until'));
      app.field('vehicles', day('service', 'Service due'));
      app.field('vehicles', number('km', 'Kilometres'));
      // The first of its days, and which it is: a vehicle comes to Upcoming once, on that day.
      app.field('vehicles', formula('next', 'Next', 'min(inspection, insurance, service)'));
      app.field('vehicles', formula('next_for', 'Next is', 'next == inspection ? "Inspection" : next == insurance ? "Insurance" : next == service ? "Service" : ""'));
      app.view('vehicles', calendar({ start: 'next', upcoming: true }));
      app.rule('vehicles', { kind: 'check', name: 'Is due', src: 'check("next", () => empty(next) || next >= today(), `${next_for} is due`)' });
    }
    if (upkeep) {
      app.field('upkeep', nameField());
      app.field('upkeep', select('every', 'Every', EVERY, {}, 'Yearly'));
      app.field('upkeep', day('next', 'Next'));
      app.field('upkeep', day('last', 'Last done'));
      app.view('upkeep', calendar({ start: 'next', upcoming: true }));
      app.rule('upkeep', { kind: 'check', name: 'Overdue', src: 'check("next", () => empty(next) || next >= today(), "Overdue")' });
      app.rule('upkeep', {
        kind: 'action',
        name: 'Done',
        src: `action("Done", () => {
  last = today()
  next = today() + ${periodSpan('every')}
})`,
      });
      for (const item of (answers.jobs as string[] | undefined) ?? JOBS) if (item.trim()) app.record('upkeep', jobOf(item));
    }

    const kept = [items && 'the things you own and their warranties', documents && 'the papers that run out', vehicles && "your car's inspection, insurance and service", upkeep && 'what is done at home again and again'].filter(Boolean) as string[];
    const said = kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : kept[0]!;
    app.about({
      title: 'Home, car and documents',
      what: `${said[0]!.toUpperCase()}${said.slice(1)}, each in Today and Upcoming on its day.`,
      pieces: ['items', 'documents', 'vehicles', 'upkeep'].filter((r) => app.hasPiece(r)),
      glance: [
        ...(items ? ['Warranties that end, in Upcoming'] : []),
        ...(documents ? ['A month before a paper runs out'] : []),
        ...(vehicles ? ["The car's next day, in Upcoming"] : []),
        ...(upkeep ? ['Done plans a job’s next time'] : []),
      ],
      how: [
        ...(items ? ['Add what you buy, with its price and until when its warranty runs; put its receipt in its notes.'] : []),
        ...(documents ? ['Add each paper with when it runs out.'] : []),
        ...(vehicles ? ['Add your car with its inspection, insurance and service days; write the new day when each is done.'] : []),
        ...(upkeep ? ['Give each job at home its next day; press Done when it is done.'] : []),
      ],
      auto: [
        ...(items ? ['A warranty comes to Upcoming on its last day; one that is over is marked.'] : []),
        ...(documents ? ['A paper comes to Today and Upcoming a month before it runs out; one that ran out is marked.'] : []),
        ...(vehicles ? ['A car comes to Upcoming on the first of its days, saying which it is; one that is due is marked.'] : []),
        ...(upkeep ? ['Done writes today as its last time, and its next time a month, a quarter or a year on; one past its day is marked.'] : []),
      ],
      work: ['Where the papers and the receipts are kept.', ...(upkeep ? ['Who does what at home.'] : [])],
    });
  },
};
