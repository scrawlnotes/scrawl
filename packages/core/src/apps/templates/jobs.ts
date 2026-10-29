import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, dayAndTime, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { stageColumns, stageHints } from './crm';

// Job search (design/more-apps.md 4.6), as Huntr, Teal and Simplify keep one: each application its
// position, company and where, gone through its stages in a bar; its interviews and its to-dos in
// its window, those of a day in Today; one heard nothing from for a while comes to Today to follow up.

const STAGES = ['Saved', 'Applied', 'Screening', 'Interview', 'Offer', 'Accepted', 'Rejected'];
const TYPES = ['Phone screen', 'Technical', 'Culture', 'Panel', 'Final', 'Other'];
/** The sign of each kind of interview, beside it day by day. */
const ICONS = { 'Phone screen': '📞', Technical: '💻', Culture: '🤝', Panel: '👥', Final: '🏁', Other: '💬' };
/** What a new application has to do before it is sent (Teal's checklist). */
const STEPS = ['Tailor your resume', 'Write a cover letter', 'Find a referral', 'Apply'];
const FOLLOW = ['7', '14', '21'];

export const jobs: AppTemplate = {
  id: 'jobs',
  version: 2,
  group: 'life',
  name: 'apps.jobs.name',
  short: 'apps.jobs.short',
  icon: 'clip',
  what: 'apps.jobs.what',
  questions: [
    { key: 'stages', kind: 'list', label: 'apps.jobs.stages', default: STAGES, help: 'apps.jobs.stagesHelp', add: 'apps.jobs.addStage', hints: stageHints },
    { key: 'follow', kind: 'choice', label: 'apps.jobs.follow', options: FOLLOW.map((value) => ({ value, label: `apps.jobs.follow.${value}` as MessageKey })), default: '14' },
  ],
  money: () => true,
  pieces: () => ['applications', 'job-interviews'],
  menu: ['applications'],
  build(app, answers) {
    const listed = (answers.stages as string[] | undefined) ?? [];
    // A search needs its stages: none given, it has the usual ones.
    const stages = listed.length > 0 ? listed : STAGES;
    const kinds = stageColumns(stages);
    // The ones it stops at, after the line: done or dropped.
    const end = kinds.filter(([, kind]) => kind === 'done' || kind === 'dropped').map(([s]) => s);
    const no = kinds.filter(([, kind]) => kind === 'dropped').map(([s]) => s);
    const line = stages.filter((s) => !end.includes(s));
    // Before it is sent: the first stage when it waits (Saved); after it, the ones it is followed up in.
    const before = kinds[0]?.[1] === 'backlog' ? [stages[0]!] : [];
    const sent = line.filter((s) => !before.includes(s));
    const days = Number(FOLLOW.includes(String(answers.follow)) ? answers.follow : 14);
    const is = (list: string[]) => list.map((s) => `status == ${JSON.stringify(s)}`).join(' || ') || 'false';
    const interviews = app.called('job-interviews');
    const applied = app.path('applications');

    // An application: what, where, the post; its stages in a bar under its title.
    app.field('applications', nameField('Position'));
    app.field('applications', { ...text('company', 'Company'), suggest: true });
    app.field('applications', { ...text('location', 'Location'), suggest: true });
    app.field('applications', { key: 'post', label: 'Job post', type: 'url' });
    app.field('applications', { ...select('status', 'Stage', stages, { Saved: 'gray', Applied: 'blue', Screening: 'teal', Interview: 'purple', Offer: 'yellow', Accepted: 'green', Rejected: 'red' }, stages[0]), steps: { end, no } });
    app.field('applications', number('salary', 'Salary', { format: app.format(false) }));
    app.field('applications', text('contact', 'Contact'));
    app.field('applications', { key: 'contact_email', label: 'Contact email', type: 'email' });
    // Written by themselves: the day it was sent, the last news, the last follow-up.
    app.field('applications', day('applied', 'Applied'));
    app.field('applications', day('heard', 'Last heard'));
    app.field('applications', day('followed', 'Followed up'));
    app.field('applications', rollup('next_interview', 'Next interview', app.path('job-interviews'), 'min', 'coming'));
    app.field('applications', formula('since', 'Since', 'empty(applied) ? "" : today() - applied == 0 ? "today" : text(today() - applied) + (today() - applied == 1 ? " day" : " days")'));
    app.field('applications', formula('follow_on', 'Follow up on', `${is(sent)} ? (!empty(followed) && followed >= (empty(heard) ? applied : heard) ? followed + 7 : (empty(heard) ? applied : heard) + ${days}) : null`));
    app.field('applications', formula('said', 'Says', `(empty(company) ? "" : company) + (empty(location) ? "" : " · " + location) + (empty(applied) ? "" : " · applied " + (since == "today" ? "today" : since + " ago"))`));
    app.field('applications', formula('follow_said', 'Says', '"Follow up" + (empty(company) ? "" : " · " + company) + (empty(applied) ? "" : " · applied " + since + " ago")'));
    app.field(
      'applications',
      formula(
        'next_said',
        'Next',
        `!empty(next_interview) ? "Interview · " + weekday(next_interview) + " " + text(time(next_interview)) : !empty(follow_on) ? (follow_on <= today() ? "Follow up today" : "Follow up on " + text(monthday(follow_on)) + " " + monthname(follow_on)) : steps() > steps(true) ? text(steps(true)) + " of " + text(steps()) + " done" : ""`,
      ),
    );
    app.head('applications', 'said', 'status');
    app.formOrder('applications', ['name', 'company', 'location', 'post', 'salary', 'contact', 'contact_email']);
    // Simplify's Add a Custom Application: what, where, the post; the rest once it is made.
    app.newForm('applications', ['company', 'location', 'post']);
    app.view('applications', { id: 'active', name: 'Active', conditions: [{ field: 'status', op: 'is-not', value: end }], sort: { key: 'applied', dir: 'desc' }, columns: ['company', 'status', 'since', 'next_said'], counts: 'status' }, true);
    app.tableColumns('applications', ['company', 'status', 'since', 'next_said']);
    app.homeTile('applications', { counts: 'status' });
    // Heard nothing for a while: in Today with Followed up, a week on after it; late, in Overdue.
    app.view('applications', { ...calendar({ start: 'follow_on', color: 'status', upcoming: true, button: 'Followed up', words: ['follow_said'] }, [{ field: 'status', op: 'is', value: sent }]), hidden: true });
    app.rule('applications', { kind: 'action', name: 'Followed up', src: `action("Followed up", { when: () => ${is(sent)}, hint: "Only one sent and not over" }, () => {\n  followed = today()\n})` });
    app.rule('applications', {
      kind: 'onSave',
      name: 'Its days',
      src: `onSave("Its days", () => {
  if (status != old.status) heard = today()
  if (empty(applied) && !(${is(before)})) applied = today()${
    before.length > 0
      ? `
  if (empty(old.name) && ${is(before)}) {
${STEPS.map((s) => `    subtask(${JSON.stringify(s)})`).join('\n')}
  }`
      : ''
  }
})`,
    });
    // Its interviews day by day, as Teal keeps them in the job; its to-dos, ready for a new one.
    app.block('applications', { block: 'linked', collection: app.path('job-interviews'), look: 'days', time: 'when', icon: 'type', icons: ICONS, sub: 'with_said', sort: 'when', column: 2 });
    app.block('applications', { block: 'subtasks', title: 'To do', add: 'Add step', column: 2 });

    // An interview: when, what kind, with whom; in Today with its time, news of its application.
    app.field('job-interviews', { ...nameField(), optional: true });
    app.field('job-interviews', { ...link('application', 'Application', applied), required: true });
    app.field('job-interviews', { ...dayAndTime('when', 'When'), required: true });
    app.field('job-interviews', { ...select('type', 'Type', TYPES, { 'Phone screen': 'gray', Technical: 'blue', Culture: 'teal', Panel: 'purple', Final: 'green', Other: 'gray' }, TYPES[0]), chips: true });
    app.field('job-interviews', text('with', 'With'));
    app.field('job-interviews', formula('coming', 'Coming', 'when >= today() ? when : null'));
    app.field('job-interviews', formula('with_said', 'Says', 'empty(with) ? "" : "With " + with'));
    app.formOrder('job-interviews', ['when', 'type', 'with']);
    app.view('job-interviews', { ...calendar({ start: 'when', color: 'type', upcoming: true, words: ['with_said'] }), hidden: true });
    app.homeTile('job-interviews', { off: true });
    const earlier = line.slice(0, line.indexOf('Interview'));
    app.rule('job-interviews', {
      kind: 'onSave',
      name: 'Its application',
      src: `onSave("Its application", () => {
  if (empty(name) && !empty(application)) name = (empty(type) ? "Interview" : type) + " · " + application.name + (empty(application.company) ? "" : ", " + application.company)
  if (!empty(application) && !empty(when) && (empty(application.heard) || day(when) > application.heard)) update(application, { heard: day(when) })${
    stages.includes('Interview') && earlier.length > 0
      ? `
  if (!empty(application) && (${earlier.map((s) => `application.status == ${JSON.stringify(s)}`).join(' || ')})) update(application, { status: "Interview" })`
      : ''
  }
})`,
    });

    app.about({
      title: 'Job search',
      what: 'Each job you look at and apply for, how far it has gone, its interviews and when to follow up.',
      pieces: ['applications', 'job-interviews'],
      glance: ['How many are at each stage', 'Interviews in Today with their time', `Follow up after ${days} days with no news`],
      how: [
        'Add each job you look at: its position, the company, where, and the post; paste the post in its notes and attach your resume.',
        `Move it on in the bar under its title as it goes: ${stages.join(', ')}.`,
        'Add each interview in its window, with its time, its kind and with whom; write how it went in its notes.',
        'Tick its to-dos as you do them; give one a day to see it in Today.',
      ],
      auto: [
        `The day it is sent is written when it leaves ${before[0] ?? 'its first stage'}; each change of stage, and each interview, counts as news.`,
        `One sent and not over that you have heard nothing from for ${days} days comes to Today: press Followed up, and it comes again a week later.`,
        ...(stages.includes('Interview') ? ['An interview moves its application to Interview.'] : []),
        ...(before.length > 0 ? [`A new one at ${before[0]} has its to-dos ready: ${STEPS.join(', ')}.`] : []),
      ],
      work: ['How many applications a week.', 'What to write when following up.'],
    });
  },
};
