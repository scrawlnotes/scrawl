import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, dayAndTime, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Sport and training (design/more-apps.md 4.10): each workout and the week's plan, Done writing a
// planned one as done; as asked, the sets of each exercise with its best, body measures from the
// first, and races and goals with their results. The plan and the races come to Today and
// Upcoming.

const SPORTS = ['Run', 'Gym', 'Swim', 'Cycle', 'Yoga', 'Team sport'];
const SPORT_COLORS = { Run: 'orange', Gym: 'blue', Swim: 'teal', Cycle: 'green', Yoga: 'purple', 'Team sport': 'pink', Other: 'gray' } as const;
const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body'];

export const sport: AppTemplate = {
  id: 'sport',
  version: 1,
  group: 'health',
  name: 'apps.sport.name',
  short: 'apps.sport.short',
  icon: 'rise',
  what: 'apps.sport.what',
  goesWith: ['gym'],
  questions: [
    { key: 'sports', kind: 'multi', label: 'apps.sport.sports', options: SPORTS.map((value) => ({ value, label: `apps.sport.sport.${value === 'Team sport' ? 'team' : value.toLowerCase()}` as MessageKey })), default: SPORTS },
    { key: 'sets', kind: 'yesno', label: 'apps.sport.sets', default: true, when: ({ answers }) => !Array.isArray(answers.sports) || (answers.sports as string[]).includes('Gym'), under: 'sports' },
    { key: 'body', kind: 'yesno', label: 'apps.sport.body', default: false },
    { key: 'races', kind: 'yesno', label: 'apps.sport.races', default: false },
  ],
  money: () => false,
  pieces: (answers) => {
    const sports = Array.isArray(answers.sports) ? (answers.sports as string[]) : SPORTS;
    const sets = sports.includes('Gym') && answers.sets !== false;
    return ['workouts', 'training-plan', ...(sets ? ['exercises', 'sets'] : []), ...(answers.body === true ? ['body-measures'] : []), ...(answers.races === true ? ['races'] : [])];
  },
  menu: ['workouts', 'training-plan', 'exercises', 'body-measures', 'races'],
  build(app, answers) {
    const chosen = (answers.sports as string[] | undefined) ?? SPORTS;
    const kinds = [...chosen, 'Other'];
    const sets = app.hasPiece('sets');
    const body = app.hasPiece('body-measures');
    const races = app.hasPiece('races');
    const done = app.path('workouts');

    app.field('workouts', nameField());
    app.field('workouts', { ...dayAndTime('when', 'When', true), required: true });
    app.field('workouts', select('type', 'Type', kinds, SPORT_COLORS, kinds[0]));
    app.field('workouts', number('minutes', 'Duration', { format: { style: 'duration' } }));
    app.field('workouts', number('km', 'Distance (km)'));
    app.field('workouts', number('effort', 'Effort (1–10)'));
    app.field('workouts', text('note', 'Note'));
    app.field('workouts', formula('this_week', 'This week', 'today() - day(when) < 7'));
    // The week's count, minutes and kilometres add up in its table.
    app.view('workouts', { id: 'this-week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }], sort: { key: 'when', dir: 'desc' } });
    app.rule('workouts', { kind: 'check', name: 'Effort is from 1 to 10', src: 'check("effort", () => empty(effort) || (effort >= 1 && effort <= 10), "Effort is from 1 to 10")' });
    app.rule('workouts', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name)) name = type + (empty(km) ? "" : " " + text(km) + " km")\n})' });

    app.field('training-plan', nameField());
    app.field('training-plan', { ...day('date', 'Day'), required: true });
    app.field('training-plan', select('type', 'Type', kinds, SPORT_COLORS, kinds[0]));
    app.field('training-plan', number('minutes', 'Duration', { format: { style: 'duration' } }));
    app.field('training-plan', select('status', 'Status', ['Planned', 'Done', 'Skipped'], { Planned: 'blue', Done: 'green', Skipped: 'gray' }, 'Planned'));
    app.field('training-plan', link('workout', 'Workout', done));
    app.view('training-plan', calendar({ start: 'date', color: 'type', upcoming: true }, [{ field: 'status', op: 'is', value: ['Planned'] }]));
    app.rule('training-plan', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name)) name = type\n})' });
    app.rule('training-plan', {
      kind: 'action',
      name: 'Done',
      src: `action("Done", { when: () => status == "Planned", hint: "Only a planned one" }, () => {
  workout = add("${app.called('workouts')}", { name: name, when: date, type: type, minutes: minutes })
  status = "Done"
})`,
    });

    if (sets) {
      const lifted = app.path('sets');
      app.field('exercises', nameField());
      app.field('exercises', select('muscle', 'Muscle group', MUSCLES, { Chest: 'red', Back: 'blue', Legs: 'green', Shoulders: 'orange', Arms: 'purple', Core: 'yellow', 'Full body': 'gray' }));
      app.field('exercises', rollup('best', 'Best (kg)', lifted, 'max', 'weight'));
      app.field('exercises', rollup('last', 'Last done', lifted, 'max', 'date'));
      app.block('exercises', { block: 'linked', collection: lifted, style: 'table', fields: ['date', 'weight', 'reps'], sort: 'date' });

      app.field('sets', nameField());
      app.field('sets', link('workout', 'Workout', done));
      app.field('sets', { ...link('exercise', 'Exercise', app.path('exercises')), required: true });
      app.field('sets', day('date', 'Day', true));
      app.field('sets', number('weight', 'Weight (kg)'));
      app.field('sets', number('reps', 'Reps'));
      app.block('workouts', { block: 'linked', collection: lifted, style: 'table', fields: ['exercise', 'weight', 'reps'] });
      app.rule('sets', {
        kind: 'onSave',
        name: 'Its name',
        src: 'onSave("Its name", () => {\n  if (!empty(workout) && date != day(workout.when)) date = day(workout.when)\n  if (empty(name) && !empty(exercise)) name = exercise.name + " " + text(weight) + " × " + text(reps)\n})',
      });
    }
    if (body) {
      const measures = app.called('body-measures');
      app.field('body-measures', nameField());
      app.field('body-measures', { ...day('date', 'Day', true), required: true });
      app.field('body-measures', number('weight', 'Weight (kg)'));
      app.field('body-measures', number('waist', 'Waist (cm)'));
      app.field('body-measures', number('fat', 'Body fat %'));
      app.field('body-measures', number('change', 'Since the first (kg)'));
      // How far from the first weight written, as it is saved.
      app.rule('body-measures', {
        kind: 'onSave',
        name: 'Since the first',
        src: `onSave("Since the first", () => {
  if (empty(name)) name = text(date)
  const weighed = find("${measures}").filter((b) => b != this && !empty(b.weight))
  const first = weighed.find((b) => b.date == min(weighed.map((w) => w.date)))
  if (!empty(weight) && !empty(first) && first.date < date) change = round(weight - first.weight, 1)
})`,
      });
    }
    if (races) {
      app.field('races', nameField());
      app.field('races', day('date', 'Day'));
      app.field('races', text('target', 'Aim'));
      app.field('races', text('result', 'Result'));
      app.view('races', calendar({ start: 'date', upcoming: true }));
      app.rule('races', { kind: 'check', name: 'Write the result', src: 'check("result", () => empty(date) || date >= today() || !empty(result), "Write how it went")' });
    }

    app.about({
      title: 'Sport and training',
      what: `Your workouts${chosen.length > 0 ? ` (${chosen.map((s) => s.toLowerCase()).join(', ')})` : ''} and the week's plan${sets ? ', the sets of each exercise and your best' : ''}${body ? ', body measures' : ''}${races ? ', and races and goals' : ''}.`,
      pieces: ['workouts', 'training-plan', ...(sets ? ['exercises', 'sets'] : []), ...(body ? ['body-measures'] : []), ...(races ? ['races'] : [])],
      glance: ["The day's plan in Today", 'Done writes a planned workout', 'The week adds up', ...(sets ? ['Each exercise’s best'] : []), ...(races ? ['Races in Upcoming'] : [])],
      how: [
        'Plan the week: what on which day, and how long.',
        'Press Done on a planned day when it is done, or add a workout as it was.',
        ...(sets ? ['Add the sets of a workout on its screen: the exercise, the weight and the reps.'] : []),
        ...(body ? ['Write your measures now and then.'] : []),
        ...(races ? ['Add a race or a goal with its day and your aim; write the result after.'] : []),
      ],
      auto: [
        'A planned day comes to Today and Upcoming; Done writes it as a workout of that day.',
        'The This week view adds up the workouts of the last 7 days, their minutes and their kilometres.',
        'An effort that is not from 1 to 10 is marked.',
        ...(sets ? ['An exercise shows your best weight and when you last did it; a set takes the day of its workout.'] : []),
        ...(body ? ['A measure says how far your weight is from the first one written.'] : []),
        ...(races ? ['A race past its day with no result is marked.'] : []),
      ],
      work: ['When you train in the week, and how you rest.'],
    });
  },
};
