import { checkbox, day, formula, link, multi, nameField, number, PERCENT, rollup, select, text } from '../pieces';
import { type AppTemplate, RECORD_BODY } from '../types';
import { EXERCISES, PROGRAM, PROGRAM_DAYS, PROGRAM_DURATION, PROGRAM_ITEMS, PROGRAM_NOTES } from './gym-seed';

// Gym (design/gym.md): programs written once, part by part; each workout picks one and its items
// come ticked, the weight from the last time; the days a program is on come to Today and Upcoming,
// one gone by unwritten stays in Overdue until it is started or not gone to; how regular each move
// is and its best. Sport and training stays as it is beside it, Exercises shared.

const PARTS = ['Warm-up', 'Workout', 'Cool-down', 'Cardio'];
const PART_COLORS = { 'Warm-up': 'yellow', Workout: 'blue', 'Cool-down': 'teal', Cardio: 'orange' } as const;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body'];
const MUSCLE_COLORS = { Chest: 'red', Back: 'blue', Legs: 'green', Shoulders: 'orange', Arms: 'purple', Core: 'yellow', 'Full body': 'gray' } as const;
const DIDNT = "Didn't go";

export const gym: AppTemplate = {
  id: 'gym',
  version: 1,
  group: 'health',
  name: 'apps.gym.name',
  short: 'apps.gym.short',
  icon: 'rise',
  what: 'apps.gym.what',
  goesWith: ['sport'],
  questions: [
    { key: 'days', kind: 'yesno', label: 'apps.gym.days', default: true, help: 'apps.gym.daysHelp' },
    { key: 'sets', kind: 'yesno', label: 'apps.gym.sets', default: false, help: 'apps.gym.setsHelp' },
  ],
  money: () => false,
  pieces: () => ['programs', 'program-items', 'gym-workouts', 'workout-items', 'exercises'],
  // Beside Sport and training, whose workouts are each a run or a swim, a workout here is a gym's.
  names: (_answers, app): { [role: string]: { name: string; singular: string; about: string } } =>
    app.has('sport') ? { 'gym-workouts': { name: 'Gym workouts', singular: 'gym workout', about: 'each time you went to the gym, or did not: its program and how long.' } } : {},
  menu: ['gym-workouts', 'programs', 'exercises'],
  build(app, answers) {
    const days = answers.days !== false;
    const sets = answers.sets === true;
    const items = app.path('workout-items');
    const workouts = app.path('gym-workouts');
    const programItems = app.called('program-items');
    const done = [{ field: 'done', op: 'true' as const }];
    // With each set a line, an item's first set stands for it.
    const once = sets ? [{ field: 'set', op: 'lt' as const, value: 2 }] : [];

    // Programs: their days, their note, their items part by part.
    app.field('programs', nameField());
    if (days) {
      app.field('programs', multi('days', 'Days', WEEKDAYS));
      app.field('programs', { ...day('from', 'From', true), required: true });
    }
    app.field('programs', number('duration', 'Duration', { format: { style: 'duration' } }));
    app.field('programs', rollup('items', 'Items', app.path('program-items'), 'count'));
    app.field('programs', rollup('done', 'Done', workouts, 'count', undefined, [{ field: 'status', op: 'is', value: ['Done'] }]));
    app.field('programs', rollup('last', 'Last', workouts, 'max', 'day', [{ field: 'status', op: 'is', value: ['Done'] }]));
    app.block('programs', { block: 'linked', collection: app.path('program-items'), style: 'table', fields: ['exercise', 'sets', 'reps', 'time', 'rest', 'note'], sort: 'order', group: ['part'] });
    if (days) {
      app.view('programs', {
        id: 'days',
        name: 'Program days',
        kind: 'calendar',
        calendar: {
          start: 'from',
          upcoming: true,
          repeat: { days: 'days', from: 'from', closedBy: { collection: workouts, link: 'program', day: 'day' }, start: 'Start', skip: { label: DIDNT, set: { status: DIDNT } } },
        },
        conditions: [],
      });
    }

    app.field('program-items', nameField());
    app.field('program-items', { ...link('program', 'Program', app.path('programs')), required: true });
    app.field('program-items', select('part', 'Part', PARTS, PART_COLORS, 'Workout'));
    app.field('program-items', number('order', 'Order'));
    app.field('program-items', { ...link('exercise', 'Exercise', app.path('exercises')), required: true });
    // Each a number, the time and the rest durations to the second: what a workout takes from it and counts with.
    app.field('program-items', number('sets', 'Sets'));
    app.field('program-items', number('reps', 'Reps'));
    app.field('program-items', number('time', 'Time', { format: { style: 'duration' } }));
    app.field('program-items', number('rest', 'Rest', { format: { style: 'duration' } }));
    app.field('program-items', text('note', 'Note'));
    app.rule('program-items', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(exercise)) name = exercise.name\n})' });

    // Workouts: the day, the program, gone or not; its items come ticked as the program is picked.
    app.field('gym-workouts', nameField());
    app.field('gym-workouts', { ...day('day', 'Day', true), required: true });
    app.field('gym-workouts', link('program', 'Program', app.path('programs')));
    app.field('gym-workouts', select('status', 'Status', ['Done', DIDNT], { Done: 'green', [DIDNT]: 'gray' }, 'Done'));
    app.field('gym-workouts', number('minutes', 'Duration', { format: { style: 'duration' } }));
    app.field('gym-workouts', rollup('done_moves', 'Moves done', items, 'count', undefined, [...done, { field: 'part', op: 'is', value: ['Workout'] }, ...once]));
    app.field('gym-workouts', rollup('all_moves', 'Moves in it', items, 'count', undefined, [{ field: 'part', op: 'is', value: ['Workout'] }, ...once]));
    app.field('gym-workouts', formula('moves', 'Moves', 'all_moves > 0 ? text(done_moves) + " of " + text(all_moves) : ""'));
    app.field('gym-workouts', formula('this_week', 'This week', 'today() - day < 7'));
    app.field('gym-workouts', formula('this_month', 'This month', 'month(day) == month(today()) && year(day) == year(today())'));
    app.view('gym-workouts', { id: 'this-month', name: 'This month', conditions: [{ field: 'this_month', op: 'true' }], sort: { key: 'day', dir: 'desc' } }, true);
    app.view('gym-workouts', { id: 'this-week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }], sort: { key: 'day', dir: 'desc' } });
    app.view('gym-workouts', { id: 'calendar', name: 'Calendar', kind: 'calendar', calendar: { start: 'day', color: 'status', upcoming: false }, conditions: [] });
    app.block('gym-workouts', {
      block: 'linked',
      collection: items,
      style: 'table',
      fields: sets ? ['done', 'exercise', 'set', 'reps', 'kg', 'last_time'] : ['done', 'exercise', 'sets', 'reps', 'kg', 'time', 'last_time'],
      sort: 'order',
      group: sets ? ['part', 'exercise'] : ['part'],
      // A move is ticked off where it is, at a click.
      edit: ['done'],
    });
    const called = app.called('workout-items');
    // The items of the program picked, each ticked, its weight as the last time it was done.
    const line = (extra: string) => `{ name: i.exercise.name, exercise: i.exercise, part: i.part, order: i.order, done: true, day: day, reps: i.reps, time: i.time${extra} }`;
    const fill = sets
      ? `onChange("program", "Fill from the program", () => {
  for (const i of find("${programItems}", { program: program })) {
    const before = find("${called}", { exercise: i.exercise, done: true }).filter((w) => w.day < day && w.set < 2)
    const last = before.filter((b) => b.day == max(before.map((w) => w.day)))
    const count = empty(i.sets) ? 1 : i.sets
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => n <= count)) {
      if (last.length > 0) add("${called}", ${line(', set: s, kg: last[0].kg, last_time: text(last[0].kg) + " kg × " + text(last[0].reps)')})
      else add("${called}", ${line(', set: s')})
    }
  }
})`
      : `onChange("program", "Fill from the program", () => {
  for (const i of find("${programItems}", { program: program })) {
    const before = find("${called}", { exercise: i.exercise, done: true }).filter((w) => w.day < day)
    const last = before.filter((b) => b.day == max(before.map((w) => w.day)))
    if (last.length > 0) add("${called}", ${line(', sets: i.sets, kg: last[0].kg, last_time: text(last[0].kg) + " kg · " + text(last[0].sets) + " × " + text(last[0].reps)')})
    else add("${called}", ${line(', sets: i.sets')})
  }
})`;
    app.rule('gym-workouts', { kind: 'onChange', name: 'Fill from the program', src: fill });
    app.rule('gym-workouts', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(program)) name = program.name + " · " + text(day)\n})' });
    app.rule('gym-workouts', {
      kind: 'check',
      name: 'Another workout of this program on this day',
      src: `check("day", () => empty(program) || find("${app.called('gym-workouts')}", { program: program, day: day }).length <= 1, "Another workout of this program on this day")`,
    });
    app.rule('gym-workouts', { kind: 'check', name: "Didn't go, but moves are ticked", src: `check("status", () => status != "${DIDNT}" || done_moves == 0, "Didn't go, but moves are ticked")` });

    app.field('workout-items', nameField());
    app.field('workout-items', { ...link('workout', 'Workout', workouts), required: true });
    app.field('workout-items', { ...link('exercise', 'Exercise', app.path('exercises')), required: true });
    app.field('workout-items', select('part', 'Part', PARTS, PART_COLORS, 'Workout'));
    app.field('workout-items', number('order', 'Order'));
    app.field('workout-items', checkbox('done', 'Done', true));
    if (sets) app.field('workout-items', number('set', 'Set'));
    else app.field('workout-items', number('sets', 'Sets'));
    app.field('workout-items', number('reps', 'Reps'));
    app.field('workout-items', number('kg', 'Kg'));
    app.field('workout-items', number('time', 'Time', { format: { style: 'duration' } }));
    app.field('workout-items', text('last_time', 'Last time'));
    app.field('workout-items', day('day', 'Day'));
    app.field('workout-items', formula('recent', 'Last 4 weeks', '!empty(day) && today() - day < 28'));
    app.rule('workout-items', {
      kind: 'onSave',
      name: 'Its day and name',
      src: 'onSave("Its day and name", () => {\n  if (!empty(workout) && day != workout.day) day = workout.day\n  if (empty(name) && !empty(exercise)) name = exercise.name\n})',
    });

    // Exercises: shared with Sport and training; how regular each is in the last four weeks, its best, its last day.
    app.field('exercises', nameField());
    app.field('exercises', select('muscle', 'Muscle group', MUSCLES, MUSCLE_COLORS));
    app.field('exercises', rollup('best_kg', 'Best (kg)', items, 'max', 'kg', done));
    app.field('exercises', rollup('last_done', 'Last done', items, 'max', 'day', done));
    app.field('exercises', rollup('done_4w', 'Done in 4 weeks', items, 'count', undefined, [...done, { field: 'recent', op: 'true' }, ...once]));
    app.field('exercises', rollup('in_4w', 'In 4 weeks', items, 'count', undefined, [{ field: 'recent', op: 'true' }, ...once]));
    app.field('exercises', formula('last_4_weeks', 'Last 4 weeks', 'in_4w > 0 ? text(done_4w) + " of " + text(in_4w) : ""'));
    app.field('exercises', formula('regular', 'Regular', 'in_4w > 0 ? done_4w / in_4w : 0', PERCENT));
    app.view('exercises', { id: 'weights', name: 'Weights', conditions: [{ field: 'best_kg', op: 'not-empty' }], columns: ['name', 'muscle', 'best_kg', 'last_done', 'last_4_weeks', 'regular'] });
    app.block('exercises', { block: 'linked', collection: items, style: 'table', fields: sets ? ['day', 'set', 'reps', 'kg'] : ['day', 'sets', 'reps', 'kg'], sort: 'day', dir: 'desc' });
    app.rule('exercises', { kind: 'check', name: 'Less than 7 of 10', src: 'check("regular", () => in_4w == 0 || regular >= 0.7, `Done in ${last_4_weeks} of its workouts in the last 4 weeks`)' });

    // What it starts with: the moves most used in a gym, and a program of three days a week, part by part (gym-seed.ts).
    for (const [name, muscle] of EXERCISES) app.record('exercises', { name, muscle });
    app.record('programs', { name: PROGRAM, ...(days && { days: PROGRAM_DAYS, from: app.today }), duration: PROGRAM_DURATION, [RECORD_BODY]: PROGRAM_NOTES });
    const order = new Map<string, number>();
    for (const item of PROGRAM_ITEMS) {
      order.set(item.part, (order.get(item.part) ?? 0) + 1);
      const { exercise, ...rest } = item;
      app.record('program-items', { name: exercise, program: PROGRAM, exercise, order: order.get(item.part)!, ...rest });
    }

    app.about({
      title: 'Gym',
      what: `Your gym programs, part by part, and each time you went${days ? ', your program days in Today' : ''}: how regular each move is, and your best${sets ? ', set by set' : ''}.`,
      pieces: ['programs', 'program-items', 'gym-workouts', 'workout-items', 'exercises'],
      glance: ['A workout’s items come ticked from its program', 'The weight from the last time', ...(days ? ['Program days in Today and Upcoming, the ones gone by in Overdue'] : []), 'How regular each move is, and its best'],
      how: [
        `It starts with the moves most used in a gym and a program, ${PROGRAM}: change it to yours, or write your own, its items part by part, each with its sets, reps, time and rest.`,
        days ? 'At the gym press Start on the program’s day; untick what you did not do, write what changed, Save.' : 'At the gym add a workout and pick its program; untick what you did not do, write what changed, Save.',
        ...(days ? ['On a day you did not go, press Didn’t go.'] : []),
      ],
      auto: [
        `Picking a workout’s program fills its items, ${sets ? 'each set a line' : 'each move a line'}, ticked, the weight as the last time.`,
        ...(days ? ['A program’s days come to Today and Upcoming; one gone by with no workout stays in Overdue.'] : []),
        'An exercise shows its best, its last day and how many of its workouts in the last 4 weeks it was done in; under 7 of 10 is marked.',
        'Two workouts of a program on one day are marked, and one you did not go to with moves ticked.',
      ],
      work: ['How your program goes up when a weight gets easy.'],
    });
  },
};
