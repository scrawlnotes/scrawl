import type { ColumnKind } from '../../board';
import { day, inMain, link, multi, number, openCards, person, rollup, select } from '../pieces';
import { companies, people } from '../shared';
import type { AppTemplate } from '../types';

/** A board's columns from a list of stages: Won and Lost as they say, else the first waits and the last is done. */
export function stageColumns(stages: string[]): [string, ColumnKind][] {
  const kinds: ColumnKind[] = stages.map((s) => (/^(won|done|closed)$/i.test(s) ? 'done' : /^(lost|dropped|cancell?ed)$/i.test(s) ? 'dropped' : 'active'));
  if (!kinds.includes('done')) kinds[kinds.lastIndexOf('active') >= 0 ? kinds.lastIndexOf('active') : kinds.length - 1] = 'done';
  if (kinds[0] === 'active' && kinds.length > 2) kinds[0] = 'backlog';
  return stages.map((s, i) => [s, kinds[i]!]);
}

const STAGES = ['Lead', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost'];

/** What each of the usual stages means; another stage is the team's to say. */
const MEANS: { [stage: string]: string } = {
  Lead: 'someone who may buy; nobody has talked to them yet.',
  Contacted: 'we talked to them and they want to hear more.',
  Meeting: 'a meeting is set or held.',
  Proposal: 'they have our offer.',
  Won: 'they said yes.',
  Lost: 'they said no; write why on the card.',
};

export const crm: AppTemplate = {
  id: 'crm',
  version: 1,
  group: 'customers',
  name: 'apps.crm.name',
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
    { key: 'stages', kind: 'list', label: 'apps.crm.stages', default: STAGES, when: ({ answers }) => answers.deals !== false },
  ],
  money: (answers) => answers.deals !== false,
  pieces: (answers) => [...(answers.customers === 'companies' ? ['companies'] : []), 'people', 'activities', ...(answers.deals !== false ? ['deals'] : [])],
  build(app, answers) {
    const deals = answers.deals !== false;
    const firms = app.hasPiece('companies') && answers.customers === 'companies';
    companies(app);
    people(app);
    const activities = app.path('activities');
    if (firms) {
      app.field('companies', select('segment', 'Segment', ['SMB', 'Mid-market', 'Enterprise'], { SMB: 'teal', 'Mid-market': 'blue', Enterprise: 'purple' }));
      app.field('companies', select('status', 'Status', ['prospect', 'active', 'churned'], { prospect: 'blue', active: 'green', churned: 'red' }, 'prospect'));
      app.field('companies', multi('tags', 'Tags', []));
      app.field('companies', rollup('last_contact', 'Last contact', activities, 'max', 'date'));
    }
    app.field('people', select('source', 'Source', ['referral', 'event', 'inbound', 'outbound'], { referral: 'purple', event: 'orange', inbound: 'green', outbound: 'blue' }));
    app.field('people', select('status', 'Status', ['lead', 'active', 'inactive'], { lead: 'blue', active: 'green', inactive: 'gray' }, 'lead'));
    app.field('people', multi('tags', 'Tags', []));
    app.field('people', rollup('last_contact', 'Last contact', activities, 'max', 'date'));

    app.field('activities', { key: 'name', label: 'Title', type: 'name' });
    app.field('activities', { ...select('type', 'Type', ['note', 'call', 'meeting', 'email'], { note: 'gray', call: 'blue', meeting: 'purple', email: 'yellow' }, 'note'), required: true });
    app.field('activities', { ...day('date', 'Date', true), required: true });
    if (firms) app.field('activities', link('company', 'Company', app.path('companies')));
    app.field('activities', link('person', 'Person', app.path('people')));
    app.field('activities', person('by', 'By', true));
    app.rule('activities', {
      kind: 'check',
      name: firms ? 'Link it to a company or a person' : 'Pick the person',
      src: firms
        ? 'check(null, () => !empty(company) || !empty(person), "Link it to a company or a person")'
        : 'check("person", () => !empty(person), "Pick the person")',
    });

    const holders = [...(firms ? ['companies'] : []), 'people'];
    for (const role of holders) {
      app.block(role, { block: 'linked', collection: activities, sort: 'date', style: 'timeline' });
      if (role === 'companies') app.block(role, { block: 'linked', collection: app.path('people'), style: 'list', fields: ['title'] });
      if (deals) app.block(role, { block: 'cards' });
      for (const [what, type] of [['call', 'call'], ['meeting', 'meeting']] as const) {
        const button = `Log a ${what}`;
        app.rule(role, {
          kind: 'action',
          name: button,
          src: `action("${button}", () => {
  add("${app.called('activities')}", { name: "${what === 'call' ? 'Call' : 'Meeting'} with " + name, type: "${type}", date: today() })
})`,
        });
      }
    }

    const stages = deals ? ((answers.stages as string[]) ?? STAGES) : [];
    if (deals) {
      app.columns('deals', stageColumns(stages));
      if (firms) app.field('deals', link('company', 'Company', app.path('companies')));
      app.field('deals', link('contact', 'Contact', app.path('people')));
      app.field('deals', number('value', 'Value', { format: app.format(true) }));
      if (app.money.multi) app.field('deals', { ...select('currency', 'Currency', app.money.currencies, {}, app.money.main) });
      app.field('deals', day('next_step', 'Next step'));
      if (firms) {
        const open = rollup('open_deals', 'Open deals', app.path('deals'), 'sum', 'value', inMain(app), app.format(false));
        app.field('companies', { ...open, rollup: { ...open.rollup!, open: true } });
      }
      if (firms) app.field('companies', openCards('deal_count', 'Deals open', app.path('deals')));
    }

    app.about({
      title: 'CRM',
      what: firms
        ? 'Who your customers are, the people you talk to there, every call and meeting, and the deals on their way.'
        : 'Who your customers are, every call and meeting with them, and the deals on their way.',
      pieces: [...(firms ? ['companies'] : []), 'people', 'activities', ...(deals ? ['deals'] : [])],
      how: [
        firms ? 'Add a company, then its people.' : 'Add a person.',
        'Press Log a call or Log a meeting on their screen after you talk; write what was said in the activity.',
        ...(deals ? [`Add a deal on ${app.called('deals')} and move it as it goes; link it to ${firms ? 'the company and ' : ''}the person.`] : []),
      ],
      auto: [
        `Log a call and Log a meeting add an activity for today, by you, linked to the ${firms ? 'company or ' : ''}person.`,
        firms ? 'An activity that links to no company and no person is marked.' : 'An activity that links to no person is marked.',
        'Last contact is the day of the latest activity.',
        ...(deals && firms ? ['A company shows the value of its open deals.'] : []),
      ],
      work: deals ? ['What each stage means:', ...stages.map((s) => `  - **${s}:** ${MEANS[s] ?? 'what it means for us.'}`), 'A deal moves on when the customer has done what the next stage needs.'] : ['Who looks after which customer, and how often we call them.'],
    });
  },
};

