import { calendar, day, formula, link, nameField, number, PERCENT, person, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Goals (design/more-apps.md 3.4): from a sales target to a team's goals for the quarter. A goal
// is measured by its key results, each from where it started to where it should get; its
// progress is theirs, on average. Update writes a key result's new value and keeps it as a
// check-in. With Projects and Product development, a project and a roadmap card point at a goal.

/** The period a new goal starts in, as it is written: 2026 Q4, 2026 H2, 2026. */
const PERIODS: { [answer: string]: string } = {
  quarter: '=text(year(today())) + " Q" + text(round((month(today()) + 1) / 3))',
  half: '=text(year(today())) + (month(today()) <= 6 ? " H1" : " H2")',
  year: '=text(year(today()))',
};

export const goals: AppTemplate = {
  id: 'goals',
  version: 1,
  group: 'work',
  name: 'apps.goals.name',
  short: 'apps.goals.short',
  icon: 'flag',
  what: 'apps.goals.what',
  questions: [
    {
      key: 'period',
      kind: 'choice',
      label: 'apps.goals.period',
      options: [
        { value: 'quarter', label: 'apps.goals.period.quarter' },
        { value: 'half', label: 'apps.goals.period.half' },
        { value: 'year', label: 'apps.goals.period.year' },
      ],
      default: 'quarter',
    },
    { key: 'checkins', kind: 'yesno', label: 'apps.goals.checkins', default: true, help: 'apps.goals.checkinsHelp' },
  ],
  money: () => false,
  pieces: (answers) => ['goals', 'key-results', ...(answers.checkins !== false ? ['check-ins'] : [])],
  menu: ['goals'],
  build(app, answers) {
    const checkins = answers.checkins !== false;
    const results = app.path('key-results');
    const projects = app.hasPiece('projects');
    const roadmap = app.hasPiece('roadmap');

    app.field('goals', nameField());
    app.field('goals', { ...text('period', 'Period'), default: PERIODS[answers.period as string] ?? PERIODS.quarter });
    app.field('goals', person('owner', 'Owner', true));
    app.field('goals', day('due', 'Due'));
    app.field('goals', rollup('progress', 'Progress', results, 'avg', 'progress', undefined, PERCENT));
    app.field('goals', select('status', 'Status', ['On track', 'At risk', 'Off track', 'Done'], { 'On track': 'green', 'At risk': 'orange', 'Off track': 'red', Done: 'blue' }, 'On track'));
    if (projects) app.field('goals', link('project', 'Project', app.path('projects')));
    app.block('goals', { block: 'linked', collection: results, style: 'table', fields: ['start', 'target', 'current', 'progress'] });
    if (roadmap) {
      app.field('roadmap', link('goal', 'Goal', app.path('goals')));
      app.block('goals', { block: 'cards' });
    }
    if (projects) app.block('projects', { block: 'linked', collection: app.path('goals'), style: 'list', fields: ['progress', 'status'] });
    app.view('goals', calendar({ start: 'due', color: 'status', upcoming: true }, [{ field: 'status', op: 'is-not', value: ['Done'] }]));
    app.rule('goals', { kind: 'check', name: 'Past its due day', src: 'check("due", () => status == "Done" || empty(due) || due >= today(), "Past its due day")' });

    app.field('key-results', nameField());
    app.field('key-results', { ...link('goal', 'Goal', app.path('goals')), required: true });
    app.field('key-results', number('start', 'Start', { default: 0 }));
    app.field('key-results', number('target', 'Target'));
    app.field('key-results', number('current', 'Current'));
    app.field('key-results', text('unit', 'Unit'));
    // How far from where it started to where it should get, kept between none and all of it.
    app.field('key-results', formula('progress', 'Progress', 'target == start ? (current >= target ? 1 : 0) : max(0, min(1, (current - start) / (target - start)))', PERCENT));

    if (checkins) {
      const done = app.path('check-ins');
      app.field('check-ins', nameField());
      app.field('check-ins', { ...link('key_result', 'Key result', results), required: true });
      app.field('check-ins', day('date', 'Date', true));
      app.field('check-ins', number('value', 'Value'));
      app.field('check-ins', text('note', 'Note'));
      app.field('key-results', rollup('last_check_in', 'Last check-in', done, 'max', 'date'));
      app.block('key-results', { block: 'linked', collection: done, sort: 'date', style: 'timeline' });
      app.rule('key-results', {
        kind: 'action',
        name: 'Update',
        src: `action("Update", {
  ask: {
    value: { label: "Now", type: "number", default: () => current, required: true },
    note: { label: "What changed", type: "text" },
  },
}, () => {
  add("${app.called('check-ins')}", { name: text(input.value) + (empty(unit) ? "" : " " + unit), value: input.value, note: input.note, date: today() })
  current = input.value
})`,
      });
    }

    app.about({
      title: 'Goals',
      what: `Your goals for the ${answers.period === 'year' ? 'year' : answers.period === 'half' ? 'half year' : 'quarter'}, the key results that measure them${checkins ? ', and each update of them' : ''}.`,
      pieces: ['goals', 'key-results', ...(checkins ? ['check-ins'] : [])],
      glance: ["A goal's progress from its key results", 'Due days in Today and Upcoming', 'Past its due day is marked', ...(checkins ? ['Update keeps each new value'] : [])],
      how: [
        'Add a goal, with whose it is and by when.',
        'Add its key results: where each starts, where it should get, and its unit.',
        checkins ? 'When a key result moves, press Update on it and write what changed.' : 'When a key result moves, write its value in Current.',
        'Set the goal On track, At risk or Off track as you see it; Done when it is reached.',
      ],
      auto: [
        "A key result's progress is how far it is from its start to its target; a goal's is its key results', on average.",
        ...(checkins ? ['Update asks the new value and what changed, keeps them as a check-in of today, and writes the new value.'] : []),
        'A goal past its due day and not Done is marked.',
        ...(projects ? ['A project shows the goals that point at it.'] : []),
        ...(roadmap ? [`A goal shows the ${app.called('roadmap')} cards that point at it.`] : []),
      ],
      work: ['When goals are set, and who agrees them.', 'How often key results are updated.', 'When we look back at the goals of the period.'],
    });
  },
};
