import type { Field } from '../../collection';
import { calendar, day, dayAndTime, nameField, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Health (design/more-apps.md 4.3): doctor's appointments, medications, test results and
// vaccinations, for you or for your family; appointments, the day to get more of a medication and
// the next vaccination come to Today and Upcoming.

export const health: AppTemplate = {
  id: 'health',
  version: 1,
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
  ],
  money: () => false,
  pieces: (answers) => ['visits', ...(answers.medications !== false ? ['medications'] : []), 'results', 'vaccinations'],
  menu: ['visits', 'medications', 'results', 'vaccinations'],
  build(app, answers) {
    const family = answers.for === 'family';
    const names = family ? ((answers.family as string[] | undefined) ?? []).map((n) => n.trim()).filter(Boolean) : [];
    const medications = app.hasPiece('medications');
    // With a family, whose each record is: one of them, or any name when none are listed.
    const whose = (role: string) => {
      if (!family) return;
      const field: Field = names.length > 0 ? select('person', 'For', names) : text('person', 'For');
      app.field(role, field);
    };

    app.field('visits', nameField('Title'));
    whose('visits');
    app.field('visits', text('doctor', 'Doctor'));
    app.field('visits', text('department', 'Department'));
    app.field('visits', { ...dayAndTime('when', 'When'), required: true });
    app.field('visits', text('place', 'Place'));
    app.field('visits', text('note', 'Note'));
    app.view('visits', calendar({ start: 'when', ...(family && { color: 'person' }), upcoming: true }));

    if (medications) {
      app.field('medications', nameField());
      whose('medications');
      app.field('medications', text('dose', 'Dose'));
      app.field('medications', text('when', 'When'));
      app.field('medications', day('start', 'Start', true));
      app.field('medications', day('end', 'End'));
      app.field('medications', day('refill', 'Get more by'));
      app.view('medications', calendar({ start: 'refill', ...(family && { color: 'person' }), upcoming: true }));
      app.rule('medications', { kind: 'check', name: 'Time to get more', src: 'check("refill", () => empty(refill) || refill >= today() || (!empty(end) && end < today()), "Time to get more")' });
    }

    app.field('results', nameField('Test'));
    whose('results');
    app.field('results', day('date', 'Date', true));
    app.field('results', text('result', 'Result'));

    app.field('vaccinations', nameField());
    whose('vaccinations');
    app.field('vaccinations', day('date', 'Date', true));
    app.field('vaccinations', day('next', 'Next'));
    app.view('vaccinations', calendar({ start: 'next', ...(family && { color: 'person' }), upcoming: true }));
    app.rule('vaccinations', { kind: 'check', name: 'Due', src: 'check("next", () => empty(next) || next >= today(), "Due")' });

    app.about({
      title: 'Health',
      what: `${family ? `Your family's health${names.length > 0 ? `, ${names.join(', ')}` : ''}` : 'Your health'}: doctor's appointments${medications ? ', medications' : ''}, test results and vaccinations.`,
      pieces: ['visits', ...(medications ? ['medications'] : []), 'results', 'vaccinations'],
      glance: ['Appointments in Today and Upcoming', ...(medications ? ['When to get more of a medication'] : []), 'The next vaccination', ...(family ? ['Whose each one is'] : [])],
      how: [
        `Add each appointment with the doctor, where and when${family ? ', and for whom' : ''}.`,
        ...(medications ? ['Add what is taken, how much and when, and the day to get more.'] : []),
        'Add test results with their papers in their notes.',
        'Add each vaccination, and the day of the next one.',
      ],
      auto: [
        'Appointments come to Today and Upcoming.',
        ...(medications ? ['The day to get more of a medication comes to Upcoming; once it has passed, and the medication is still taken, it is marked.'] : []),
        'The next vaccination comes to Upcoming; one past its day is marked.',
      ],
      work: ['Where the papers are kept.', "Who to call when someone is ill."],
    });
  },
};
