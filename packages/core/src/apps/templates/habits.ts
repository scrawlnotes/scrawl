import { calendar, day, formula, link, nameField, number, PERCENT, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Habits and goals (design/more-apps.md 4.9): what you do every day or every week, ticked once a
// day with Done today, how you kept it in the last seven days; and your own goals by their day.

const HABITS = ['Walk 30 minutes', 'Read 20 pages', 'Drink 2 litres of water', 'In bed by 23:00'];

export const habits: AppTemplate = {
  id: 'habits',
  version: 1,
  group: 'health',
  name: 'apps.habits.name',
  short: 'apps.habits.short',
  icon: 'check',
  what: 'apps.habits.what',
  questions: [
    { key: 'habits', kind: 'list', label: 'apps.habits.habits', default: HABITS, add: 'apps.habits.addHabit' },
    { key: 'goals', kind: 'yesno', label: 'apps.habits.goals', default: true },
  ],
  money: () => false,
  pieces: (answers) => ['habits', 'habit-checkins', ...(answers.goals !== false ? ['personal-goals'] : [])],
  menu: ['habits', 'personal-goals'],
  build(app, answers) {
    const goals = app.hasPiece('personal-goals');
    const done = app.path('habit-checkins');

    app.field('habits', nameField());
    app.field('habits', select('often', 'How often', ['Daily', 'Weekly'], { Daily: 'blue', Weekly: 'purple' }, 'Daily'));
    app.field('habits', number('target', 'Times a week', { default: 7 }));
    app.field('habits', rollup('last_7', 'Last 7 days', done, 'count', undefined, [{ field: 'this_week', op: 'true' }]));
    app.field('habits', rollup('today', 'Done today', done, 'count', undefined, [{ field: 'date', op: 'on', value: 'today' }]));
    app.field('habits', formula('kept', 'Kept', 'target > 0 ? min(1, last_7 / target) : 0', PERCENT));
    app.block('habits', { block: 'linked', collection: done, style: 'list', fields: ['date'], sort: 'date' });
    app.rule('habits', { kind: 'check', name: 'Behind this week', src: 'check("last_7", () => empty(target) || last_7 >= target || (often == "Daily" && last_7 + 1 >= target && today == 0), `${text(last_7)} of ${text(target)} in the last 7 days`)' });
    app.rule('habits', {
      kind: 'action',
      name: 'Done today',
      src: `action("Done today", { when: () => today == 0, hint: "Done today already" }, () => {
  add("${app.called('habit-checkins')}", { name: name + " · " + text(today()), habit: this, date: today() })
})`,
    });
    for (const name of (answers.habits as string[] | undefined) ?? HABITS) if (name.trim()) app.record('habits', { name: name.trim(), often: 'Daily', target: 7 });

    app.field('habit-checkins', nameField());
    app.field('habit-checkins', { ...link('habit', 'Habit', app.path('habits')), required: true });
    app.field('habit-checkins', day('date', 'Day', true));
    app.field('habit-checkins', formula('this_week', 'In the last 7 days', 'today() - date < 7'));

    if (goals) {
      app.field('personal-goals', nameField());
      app.field('personal-goals', day('due', 'By'));
      app.field('personal-goals', number('progress', 'Progress', { format: PERCENT }));
      app.field('personal-goals', select('status', 'Status', ['Not started', 'On track', 'At risk', 'Done'], { 'Not started': 'gray', 'On track': 'green', 'At risk': 'orange', Done: 'blue' }, 'Not started'));
      app.field('personal-goals', text('note', 'Note'));
      app.view('personal-goals', calendar({ start: 'due', color: 'status', upcoming: true }, [{ field: 'status', op: 'is-not', value: ['Done'] }]));
      app.rule('personal-goals', { kind: 'check', name: 'Past its day', src: 'check("due", () => status == "Done" || empty(due) || due >= today(), "Past its day")' });
    }

    const named = ((answers.habits as string[] | undefined) ?? HABITS).map((h) => h.trim()).filter(Boolean);
    app.about({
      title: 'Habits and goals',
      what: `What you do every day or every week${named.length > 0 ? `: ${named.join(', ')}` : ''}, and how you kept it${goals ? '; and your own goals' : ''}.`,
      pieces: ['habits', 'habit-checkins', ...(goals ? ['personal-goals'] : [])],
      glance: ['Done today, once a day', 'How each was kept in the last 7 days', 'A habit behind is marked', ...(goals ? ['Goals by their day, in Upcoming'] : [])],
      how: [
        'Give each habit how often: daily, or a few times a week.',
        'Press Done today on a habit when you did it.',
        ...(goals ? ['Add your goals with their day; write how far you are as you go.'] : []),
      ],
      auto: [
        'Done today writes today once; a habit counts its days in the last 7, and how much of its target that is.',
        'A habit that cannot reach its target in the last 7 days is marked; a daily one you have not done today counts as one still to do.',
        ...(goals ? ['A goal comes to Upcoming on its day; one past its day and not Done is marked.'] : []),
      ],
      work: ['When in the day you tick your habits.'],
    });
  },
};
