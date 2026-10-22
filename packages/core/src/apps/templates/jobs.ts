import { calendar, dayAndTime, day, link, nameField, number, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { stageColumns, stageHints } from './crm';

// Job search (design/more-apps.md 4.6): where you applied, how each stands, the interviews and
// the next step, in Today and Upcoming; one you have heard nothing from for two weeks is marked
// to follow up.

const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Accepted'];

export const jobs: AppTemplate = {
  id: 'jobs',
  version: 1,
  group: 'life',
  name: 'apps.jobs.name',
  short: 'apps.jobs.short',
  icon: 'clip',
  what: 'apps.jobs.what',
  questions: [{ key: 'stages', kind: 'list', label: 'apps.jobs.stages', default: STAGES, help: 'apps.jobs.stagesHelp', add: 'apps.jobs.addStage', hints: stageHints }],
  money: () => true,
  pieces: () => ['employers', 'applications', 'job-interviews'],
  build(app, answers) {
    const listed = (answers.stages as string[] | undefined) ?? [];
    // A search needs its stages: none given, it has the usual ones.
    const stages = listed.length > 0 ? listed : STAGES;
    // The ones it is still going in: not the last ones, done or dropped.
    const open = stageColumns(stages).filter(([, kind]) => kind !== 'done' && kind !== 'dropped').map(([s]) => s);
    const applied = app.path('applications');

    app.field('employers', nameField());
    app.field('employers', { key: 'website', label: 'Website', type: 'url' });
    app.field('employers', text('note', 'Note'));
    app.block('employers', { block: 'linked', collection: applied, style: 'list', fields: ['status', 'applied'], sort: 'applied' });

    app.field('applications', nameField('Position'));
    app.field('applications', link('company', 'Company', app.path('employers')));
    app.field('applications', { key: 'post', label: 'Job post', type: 'url' });
    app.field('applications', day('applied', 'Applied', true));
    app.field('applications', select('status', 'Status', stages, { Applied: 'blue', Screening: 'teal', Interview: 'purple', Offer: 'yellow', Rejected: 'gray', Accepted: 'green' }, stages[0]));
    app.field('applications', number('salary', 'Salary', { format: app.format(false) }));
    app.field('applications', text('source', 'Source'));
    app.field('applications', day('heard', 'Last heard', true));
    app.field('applications', day('next', 'Next step'));
    app.view('applications', calendar({ start: 'next', color: 'status', upcoming: true }, [{ field: 'status', op: 'is', value: open }]));
    const going = open.map((s) => `status == ${JSON.stringify(s)}`).join(' || ') || 'false';
    app.rule('applications', { kind: 'check', name: 'Follow up', src: `check("heard", () => !(${going}) || empty(heard) || today() - heard <= 14, \`Follow up: nothing for \${text(today() - heard)} days\`)` });
    app.block('applications', { block: 'linked', collection: app.path('job-interviews'), style: 'list', fields: ['when', 'type'], sort: 'when' });

    app.field('job-interviews', nameField());
    app.field('job-interviews', { ...link('application', 'Application', applied), required: true });
    app.field('job-interviews', { ...dayAndTime('when', 'When'), required: true });
    app.field('job-interviews', select('type', 'Type', ['Phone', 'Video', 'On site', 'Technical', 'Final'], { Phone: 'gray', Video: 'blue', 'On site': 'purple', Technical: 'teal', Final: 'green' }));
    app.field('job-interviews', text('with', 'With'));
    app.field('job-interviews', text('note', 'Note'));
    app.view('job-interviews', calendar({ start: 'when', color: 'type', upcoming: true }));
    // An interview is news from them.
    app.rule('job-interviews', {
      kind: 'onSave',
      name: 'Heard from them',
      src: `onSave("Heard from them", () => {
  if (empty(name) && !empty(application)) name = (empty(type) ? "Interview" : type) + " · " + application.name
  if (!empty(application) && !empty(when) && (empty(application.heard) || day(when) > application.heard)) update(application, { heard: day(when) })
})`,
    });

    app.about({
      title: 'Job search',
      what: 'Where you applied, how each stands, the interviews and what is next.',
      pieces: ['applications', 'job-interviews', 'employers'],
      glance: ['Interviews and next steps in Today and Upcoming', 'Two weeks with no news is marked'],
      how: [
        'Add each job you apply for, with the company, the post and where you found it.',
        `Move it on as it goes: ${stages.join(', ')}; write the day you last heard from them, and the next step.`,
        'Add each interview with its time and with whom; write how it went in its notes.',
      ],
      auto: [
        'Interviews and next steps come to Today and Upcoming.',
        `An application still going (${open.join(', ')}) you have heard nothing from for 14 days is marked to follow up.`,
        'An interview counts as news: its day becomes the last heard of its application.',
      ],
      work: ['How many applications a week.', 'When to follow up, and how.'],
    });
  },
};
