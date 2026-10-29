import type { MessageKey } from '@scrawlnotes/i18n';
import type { ColumnKind } from '../../board';
import type { Condition, LinkedBlock } from '../../collection';
import { calendar, dayAndTime, inMain, link, number, openCards, person, rollup, select, text } from '../pieces';
// A company's and a person's own fields come first from shared.ts; CRM adds what it keeps.
import { companies, people } from '../shared';
import type { AppTemplate } from '../types';

// CRM (design/scrawl-apps.md 3.1): the deals as Pipedrive keeps them, a column's total over it and
// each deal's next step on its card, Won and Lost, Lost asking why; a company and a person as
// HubSpot shows them, what they are on the left, what happened with them in the middle, what links
// to them on the right; Log writes what was said and plans the next step, which comes to Today.

/** A board's columns from a list of stages: Won and Lost as they say, else the first waits and the last is done. */
export function stageColumns(stages: string[]): [string, ColumnKind][] {
  const kinds: ColumnKind[] = stages.map((s) => (/^(won|done|closed|hired|published)$/i.test(s) ? 'done' : /^(lost|dropped|cancell?ed|rejected)$/i.test(s) ? 'dropped' : 'active'));
  if (!kinds.includes('done')) kinds[kinds.lastIndexOf('active') >= 0 ? kinds.lastIndexOf('active') : kinds.length - 1] = 'done';
  if (kinds[0] === 'active' && kinds.length > 2) kinds[0] = 'backlog';
  return stages.map((s, i) => [s, kinds[i]!]);
}

/** What a list of stages says beside each: the first waits, the done and the dropped ones. */
export const stageHints = (items: string[]) =>
  stageColumns(items).map(([, kind]) => (kind === 'backlog' ? 'apps.hint.waiting' : kind === 'done' ? 'apps.hint.done' : kind === 'dropped' ? 'apps.hint.dropped' : null) as MessageKey | null);

const STAGES = ['Lead', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost'];

/** What each of the usual stages means; another stage is the team's to say. */
const MEANS: { [stage: string]: string } = {
  Lead: 'someone who may buy; nobody has talked to them yet.',
  Contacted: 'we talked to them and they want to hear more.',
  Meeting: 'a meeting is set or held.',
  Proposal: 'they have our offer.',
  Won: 'they said yes.',
  Lost: 'they said no; it asks why.',
};

/** The kinds of activity, Pipedrive's, each with its sign day by day. */
const KINDS = ['Call', 'Meeting', 'Email', 'Note', 'Task'];
const KIND_COLORS = { Call: 'blue', Meeting: 'purple', Email: 'yellow', Note: 'gray', Task: 'teal' } as const;
const ICONS = { Call: '📞', Meeting: '👥', Email: '✉', Note: '📝', Task: '✓' };
const INDUSTRIES = [
  'Agriculture', 'Automotive', 'Construction', 'Consulting', 'Education', 'Energy', 'Finance', 'Food and drink', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'IT and software',
  'Legal', 'Logistics', 'Manufacturing', 'Marketing', 'Media', 'Non-profit', 'Real estate', 'Retail', 'Telecom', 'Textiles', 'Tourism', 'Wholesale',
];
const SIZES = ['1–10', '11–50', '51–200', '201–1000', '1000+'];
const SOURCES = ['Referral', 'Website', 'Event', 'Outbound', 'Partner'];
const REASONS = ['Price', 'Timing', 'Competitor', 'No budget', 'No response', 'Not a fit'];

/** "3 days ago", "today", "yesterday" for a day gone by. */
const ago = (day: string) => `today() - day(${day}) == 0 ? "today" : today() - day(${day}) == 1 ? "yesterday" : text(today() - day(${day})) + " days ago"`;

export const crm: AppTemplate = {
  id: 'crm',
  version: 2,
  group: 'customers',
  name: 'apps.crm.name',
  short: 'apps.crm.short',
  icon: 'person',
  what: 'apps.crm.what',
  questions: [
    {
      key: 'customers',
      kind: 'choice',
      label: 'apps.crm.customers',
      options: [
        { value: 'companies', label: 'apps.crm.customers.companies' },
        { value: 'people', label: 'apps.crm.customers.people' },
      ],
      default: 'companies',
    },
    { key: 'deals', kind: 'yesno', label: 'apps.crm.deals', default: true },
    {
      key: 'stages',
      kind: 'list',
      label: 'apps.crm.stages',
      default: STAGES,
      when: ({ answers }) => answers.deals !== false,
      under: 'deals',
      help: 'apps.crm.stagesHelp',
      add: 'apps.crm.addStage',
      hints: stageHints,
    },
  ],
  money: (answers) => answers.deals !== false,
  pieces: (answers) => [...(answers.customers === 'companies' ? ['companies'] : []), 'people', 'activities', ...(answers.deals !== false ? ['deals'] : [])],
  menu: ['deals', 'companies', 'people', 'activities'],
  build(app, answers) {
    const deals = answers.deals !== false;
    const firms = app.hasPiece('companies') && answers.customers === 'companies';
    companies(app);
    // A company's mail besides its phone: Call and Email on its page.
    if (firms) app.field('companies', { key: 'email', label: 'Email', type: 'email' });
    people(app);
    const activities = app.path('activities');
    const acts = app.called('activities');
    const done: Condition[] = [{ field: 'done', op: 'true' }];
    const open: Condition[] = [{ field: 'done', op: 'false' }];

    // An activity: what, its kind, when, with whom; done once it happened, planned until then.
    app.field('activities', { key: 'name', label: 'What', type: 'name', optional: true });
    app.field('activities', { ...select('type', 'Type', KINDS, KIND_COLORS, 'Call'), chips: true });
    app.field('activities', { ...dayAndTime('when', 'When', true), required: true });
    app.field('activities', { key: 'done', label: 'Done', type: 'checkbox' });
    app.field('activities', text('said', 'What was said'));
    if (firms) app.field('activities', link('company', 'Company', app.path('companies')));
    app.field('activities', { ...link('person', 'Person', app.path('people')), ...(firms && { within: 'company' }) });
    if (deals) app.field('activities', { ...link('deal', 'Deal', app.path('deals')), ...(firms && { within: 'company' }) });
    app.field('activities', person('by', 'By', true));
    // Where it stands, as Pipedrive's Activities groups them; who it is with, in one line.
    app.field('activities', { key: 'bucket', label: 'When', type: 'formula', formula: 'done ? "Done" : day(when) < today() ? "Overdue" : day(when) == today() ? "Today" : "Planned"' });
    const whom = deals ? '(!empty(deal) ? text(deal) : empty(person) ? "" : person.name)' : '(empty(person) ? "" : person.name)';
    const has = deals ? '(!empty(deal) || !empty(person))' : '!empty(person)';
    app.field(
      'activities',
      {
        key: 'with_said',
        label: 'With',
        type: 'formula',
        // The company, then the deal it is about, else the person: "Atlas Mekanik · Warehouse lifts".
        formula: firms ? `(empty(company) ? "" : company.name) + (!empty(company) && ${has} ? " · " : "") + ${whom}` : whom,
      },
    );
    // Its second line day by day: what was said, else whom it was with; and the deal it is about.
    app.field('activities', { key: 'sub', label: 'Says', type: 'formula', formula: deals ? 'empty(said) ? with_said : said + (empty(deal) ? "" : " · " + deal)' : 'empty(said) ? with_said : said' });
    app.formOrder('activities', ['type', 'name', 'when', ...(firms ? ['company'] : []), 'person', ...(deals ? ['deal'] : []), 'said', 'done']);
    app.view('activities', { id: 'todo', name: 'To do', conditions: open, sort: { key: 'when', dir: 'asc' }, group: 'bucket', columns: ['type', 'when', 'with_said'], button: 'Done', ring: true }, true);
    app.view('activities', { id: 'done', name: 'Done', conditions: done, sort: { key: 'when', dir: 'desc' }, columns: ['type', 'when', 'with_said', 'said'] });
    // What is planned comes to Today on its day with Done, a time to Upcoming too; a late one stays in Overdue.
    app.view('activities', { ...calendar({ start: 'when', color: 'type', upcoming: true, button: 'Done', words: ['with_said'] }, open), id: 'calendar', hidden: true });
    app.rule('activities', {
      kind: 'check',
      name: firms ? 'Link it to a company or a person' : 'Pick the person',
      src: firms ? 'check(null, () => !empty(company) || !empty(person), "Link it to a company or a person")' : 'check("person", () => !empty(person), "Pick the person")',
    });
    app.rule('activities', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {
  if (empty(name)) name = type + (!empty(person) ? " with " + person.name : ${firms ? '!empty(company) ? " with " + company.name : ' : ''}"")${
    firms
      ? `
  if (empty(company) && !empty(person) && !empty(person.company)) company = person.company`
      : ''
  }
})`,
    });
    // Done, from Today or its window: what was said, and the next step, as Log asks them.
    const next = `
  next_type: { label: "Type", type: "choice", options: ${JSON.stringify(KINDS.filter((k) => k !== 'Note'))}, chips: true, default: "Call", section: "Next step" },
  next_what: { label: "What", type: "text" },
  next_when: { label: "When", type: "date", time: true, chips: true },`;
    const plan = (company: string, person: string, deal: string) => `
  if (!empty(input.next_when) || !empty(input.next_what)) add("${acts}", { name: input.next_what, type: input.next_type, when: empty(input.next_when) ? today() + 1 : input.next_when, done: false${firms ? `, company: ${company}` : ''}, person: ${person}${deals ? `, deal: ${deal}` : ''} })`;
    app.rule('activities', {
      kind: 'action',
      name: 'Done',
      src: `action("Done", {
  when: () => !done,
  say: () => type + " · " + with_said,
  ask: {
  said: { label: "What was said", type: "text", lines: true },${next}
  },
  done: () => name + " done",
}, () => {
  done = true
  if (!empty(input.said)) said = input.said${plan(firms ? 'company' : '', 'person', 'deal')}
})`,
    });

    // Log, on a company and a person: what happened, and the next step, in one window.
    const holders = [...(firms ? ['companies'] : []), 'people'];
    const history: LinkedBlock = { block: 'linked', collection: activities, look: 'days', title: 'History', time: 'when', icon: 'type', icons: ICONS, sub: 'sub', sort: 'when', dir: 'desc', where: done };
    for (const role of holders) {
      const isFirm = role === 'companies';
      const company = isFirm ? 'this' : firms ? 'company' : '';
      const who = isFirm ? 'input.with' : 'this';
      const dealAsk = deals ? `
  deal: { label: "Deal", type: "link", collection: "${app.called('deals')}", within: "${isFirm ? 'company' : 'contact'}" },` : '';
      const dealSet = deals ? ', deal: input.deal' : '';
      app.rule(role, {
        kind: 'action',
        name: 'Log',
        src: `action("Log", {
  say: () => name,
  ask: {
  type: { label: "Type", type: "choice", options: ${JSON.stringify(KINDS.filter((k) => k !== 'Task'))}, chips: true, default: "Call" },
  when: { label: "When", type: "date", time: true, default: () => now() },${isFirm ? `
  with: { label: "With", type: "link", collection: "${app.called('people')}", within: "company" },` : ''}${dealAsk}
  said: { label: "What was said", type: "text", lines: true },${next}
  },
  done: () => "Logged · " + name,
}, () => {
  add("${acts}", { type: input.type, when: input.when, done: true, said: input.said${firms ? `, company: ${company}` : ''}, person: ${who}${dealSet} })${plan(company, who, 'input.deal')}
})`,
      });
      app.rule(role, {
        kind: 'action',
        name: 'Plan',
        src: `action("Plan", {
  say: () => name,
  ask: {
  type: { label: "Type", type: "choice", options: ${JSON.stringify(KINDS.filter((k) => k !== 'Note'))}, chips: true, default: "Call" },
  what: { label: "What", type: "text" },
  when: { label: "When", type: "date", time: true, required: true },${isFirm ? `
  with: { label: "With", type: "link", collection: "${app.called('people')}", within: "company" },` : ''}${dealAsk}
  },
  done: () => "Planned · " + name,
}, () => {
  add("${acts}", { name: input.what, type: input.type, when: input.when, done: false${firms ? `, company: ${company}` : ''}, person: ${who}${dealSet} })
})`,
      });
      // In the middle, as HubSpot has it: Log and Plan, what is planned, then what happened day by day.
      app.block(role, { block: 'actions', column: 2 });
      app.block(role, { block: 'linked', collection: activities, look: 'checklist', title: 'Planned', fields: ['done', 'when', 'type', ...(isFirm ? ['person'] : [])], time: 'when', ...(deals && { sub: 'deal' }), sort: 'when', where: open, column: 2, tab: 'Activity' });
      app.block(role, { ...history, column: 2, tab: 'Activity' });
      app.field(role, rollup('last_contact', 'Last contact', activities, 'max', 'when', done));
      app.field(role, { key: 'last_said', label: 'Last contact', type: 'formula', formula: `empty(last_contact) ? "" : "last contact " + (${ago('last_contact')})` });
    }

    if (firms) {
      // A company: where and what it is; its people, its deals and what other templates add on the right.
      app.field('companies', select('industry', 'Industry', INDUSTRIES));
      app.field('companies', select('size', 'Size', SIZES));
      app.field('companies', rollup('people_count', 'People', app.path('people'), 'count'));
      app.block('companies', { block: 'linked', collection: app.path('people'), style: 'list', fields: ['title'], column: 3, tab: 'Related' });
      if (deals) {
        const won = app.path('deals');
        app.field('companies', { key: 'won', label: 'Deals won', type: 'rollup', rollup: { from: won, fn: 'count', won: true } });
        const value = rollup('open_value', 'Open deals', won, 'sum', 'value', inMain(app), app.format(false));
        app.field('companies', { ...value, rollup: { ...value.rollup!, open: true } });
        app.field('companies', openCards('deal_count', 'Deals open', won));
      }
      const customer = deals ? 'won > 0 || contains(type, "Customer")' : 'contains(type, "Customer")';
      app.field('companies', { key: 'stage', label: 'Is', type: 'formula', formula: `${customer} ? "Customer" : contains(type, "Supplier") ? "Supplier" : contains(type, "Partner") ? "Partner" : ${deals ? 'deal_count > 0 ? "Prospect" : ' : ''}"Lead"` });
      app.field(
        'companies',
        {
          key: 'said',
          label: 'Says',
          type: 'formula',
          formula: `stage + (empty(city) ? "" : " · " + city) + (people_count > 0 ? " · " + text(people_count) + (people_count == 1 ? " person" : " people") : "")${app.has('sales') ? ' + (empty(sales_said) ? "" : " · " + sales_said)' : ''} + (empty(last_said) ? "" : " · " + last_said)`,
        },
      );
      app.field('companies', { key: 'quiet', label: 'Gone quiet', type: 'formula', formula: `${customer} && (empty(last_contact) || today() - day(last_contact) > 30)` });
      app.head('companies', 'said');
      app.formOrder('companies', ['name', 'website', 'phone', 'email', 'city', 'size', 'industry', 'type', 'owner']);
      app.newForm('companies', ['website', 'phone', 'city', 'industry']);
      app.tableColumns('companies', ['stage', 'city', ...(deals ? ['open_value'] : []), 'last_said']);
      app.view('companies', { id: 'customers', name: 'Customers', conditions: [{ field: 'stage', op: 'is', value: ['Customer'] }], sort: { key: 'name', dir: 'asc' }, columns: ['city', ...(deals ? ['open_value'] : []), 'last_said'] });
      app.view('companies', { id: 'quiet', name: 'Gone quiet', conditions: [{ field: 'quiet', op: 'true' }], sort: { key: 'last_contact', dir: 'asc' }, columns: ['city', 'last_said'] });
      // On Home, the customers gone quiet, how long each.
      app.homeTile('companies', { view: 'quiet', value: 'last_said', empty: 'Every customer was in touch in the last 30 days.' });
    }
    // Home has Today for what is planned, the pipeline and the customers gone quiet; no box of people or activities.
    app.homeTile('people', { off: true });
    app.homeTile('activities', { off: true });
    // A person: their job and company, and how to reach them.
    app.field(
      'people',
      {
        key: 'said',
        label: 'Says',
        type: 'formula',
        formula: `(empty(title) ? "" : title)${firms ? ' + (!empty(title) && !empty(company) ? " · " : "") + (empty(company) ? "" : company.name)' : ''} + (empty(last_said) ? "" : (empty(title)${firms ? ' && empty(company)' : ''} ? "" : " · ") + last_said)`,
      },
    );
    app.head('people', 'said');
    app.formOrder('people', ['name', ...(firms ? ['company'] : []), 'title', 'email', 'phone']);
    app.tableColumns('people', [...(firms ? ['company'] : []), 'title', 'email', 'last_said']);

    const stages = deals ? ((answers.stages as string[]) ?? STAGES) : [];
    if (deals) {
      // A deal: its card on its stage with its next step, the first of its activities planned; its
      // window has its next steps and its history; Lost asks why; Won makes its company a customer.
      app.columns('deals', stageColumns(stages), {
        next: { collection: activities, day: 'when', done: 'done' },
        dropAsks: 'lost_reason',
        blocks: [{ block: 'linked', collection: activities, look: 'checklist', title: 'Next steps', fields: ['done', 'when', 'type'], time: 'when', sort: 'when', where: open, button: 'Plan' }, { ...history, button: 'Log' }],
        // Log and Plan on a deal are its company's, or its contact's, the deal picked.
        press: firms ? { link: 'company', buttons: ['Log', 'Plan'], card: 'deal', fields: { with: 'contact' } } : { link: 'contact', buttons: ['Log', 'Plan'], card: 'deal' },
        ...(firms && { wins: { link: 'company', field: 'type', value: 'Customer' } }),
      });
      if (firms) app.field('deals', link('company', 'Company', app.path('companies')));
      app.field('deals', link('contact', 'Contact', app.path('people')));
      app.field('deals', number('value', 'Value', { format: app.format(true) }));
      if (app.money.multi) app.field('deals', { ...select('currency', 'Currency', app.money.currencies, {}, app.money.main) });
      app.field('deals', select('source', 'Source', SOURCES));
      app.field('deals', select('lost_reason', 'Lost because', REASONS));
      for (const role of holders) app.block(role, { block: 'cards', board: app.path('deals'), column: 3, tab: 'Related' });
    }

    app.about({
      title: 'CRM',
      what: firms
        ? 'Who your customers are, the people you talk to there, every call and meeting with what is next, and the deals on their way.'
        : 'Who your customers are, every call and meeting with them with what is next, and the deals on their way.',
      pieces: [...(firms ? ['companies'] : []), 'people', 'activities', ...(deals ? ['deals'] : [])],
      glance: ['Log writes what was said and plans the next step', 'What is planned comes to Today with Done', ...(deals ? ['Each deal shows its next step, or that it has none', 'Lost asks why'] : [])],
      how: [
        firms ? 'Add a company, then its people; a person picks their company as you type it.' : 'Add a person.',
        'After a call, a meeting or an email, press Log on the company or the person: what kind, what was said, and the next step with its day.',
        'Press Plan for a call or a meeting to come; on its day it is in Today, where Done asks what was said and what is next.',
        ...(deals
          ? [
              `Add a deal on ${app.called('deals')} with its company, contact and value; give it a day it should close by.`,
              'Log and Plan on the deal, or on its company, write its history and its next steps; a deal with no next step is marked.',
              'Move it on as it goes; Won and Lost close it, and Lost asks why.',
            ]
          : []),
      ],
      auto: [
        'An activity is named by its kind and whom it is with, and takes the company of its person.',
        'Last contact is the day of the latest activity done.',
        ...(firms ? ['A company that has won a deal is a customer, written in its Type; one with no contact for 30 days has gone quiet.'] : []),
        ...(deals ? ['A deal says its next step on its card: green when it is planned, red when it is late, a triangle when there is none.'] : []),
        `An activity ${firms ? 'with no company and no person' : 'with no person'} is marked.`,
      ],
      work: deals ? ['What each stage means:', ...stages.map((s) => `  - **${s}:** ${MEANS[s] ?? 'what it means for us.'}`), 'A deal moves on when the customer has done what the next stage needs.'] : ['Who looks after which customer, and how often we call them.'],
    });
  },
};
