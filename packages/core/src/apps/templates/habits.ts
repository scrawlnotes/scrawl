import { day, formula, link, multi, nameField, number, PERCENT, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Habits and goals (design/more-apps.md 4.9): a habit comes to Today on its days and is ticked there
// with one click, Undo putting it back; a day missed is gone, never piled up; its last days are a
// strip in its table and its month in its window, its streak worked out. A goal counts itself, by
// a number moved with Update or by its steps, and says whether it is on track for its day.

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const OFTEN = ['Every day', 'On some days', 'Times a week'];
const HABITS = ['Walk 30 minutes', 'Read 20 pages', 'Gym 3 times a week', 'Call mom on Sunday', 'In bed by 23:00'];
const NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * A habit as its words say how often (design/more-apps.md 4.9): "Gym 3 times a week", "Call mom on
 * Sunday", "Yoga on Mon, Wed and Fri"; with none, every day.
 */
export function habitOf(item: string): { name: string; often: string; days: string[]; times?: number } {
  const words = item.trim();
  const times = /^(.+?)\s+(\d+)\s*(?:times|x)\s*(?:a|per)\s*week$/i.exec(words);
  if (times) return { name: times[1]!.trim(), often: 'Times a week', days: WEEK, times: Math.max(1, Math.min(7, Number(times[2]))) };
  const on = /^(.+?)\s+on\s+(.+)$/i.exec(words);
  if (on) {
    const days = WEEK.filter((d, i) => on[2]!.toLowerCase().split(/[\s,]+|\band\b/).some((w) => w.length >= 3 && NAMES[i]!.startsWith(w.replace(/s$/, ''))));
    if (days.length > 0) return { name: on[1]!.trim(), often: 'On some days', days };
  }
  const every = /^(.+?)\s+every\s*day$/i.exec(words);
  return { name: (every ? every[1]! : words).trim(), often: 'Every day', days: WEEK };
}

export const habits: AppTemplate = {
  id: 'habits',
  version: 2,
  group: 'health',
  name: 'apps.habits.name',
  short: 'apps.habits.short',
  icon: 'check',
  what: 'apps.habits.what',
  questions: [
    { key: 'habits', kind: 'list', label: 'apps.habits.habits', default: HABITS, help: 'apps.habits.habitsHelp', add: 'apps.habits.addHabit' },
    { key: 'goals', kind: 'yesno', label: 'apps.habits.goals', default: true },
  ],
  money: () => false,
  pieces: (answers) => ['habits', 'habit-checkins', ...(answers.goals !== false ? ['personal-goals'] : [])],
  menu: ['habits', 'personal-goals'],
  build(app, answers) {
    const goals = app.hasPiece('personal-goals');
    const done = app.path('habit-checkins');
    const gray = (options: string[]) => Object.fromEntries(options.map((o) => [o, 'gray' as const]));

    // A habit: its name and how often; the days it comes on all seven unless some are picked.
    app.field('habits', nameField());
    app.field('habits', select('often', 'How often', OFTEN, gray(OFTEN), OFTEN[0]));
    app.field('habits', { ...multi('days', 'On', WEEK, gray(WEEK)), required: true, when: [{ field: 'often', op: 'is', value: ['On some days'] }] });
    app.field('habits', { ...number('times', 'Times a week', { default: 3 }), required: true, when: [{ field: 'often', op: 'is', value: ['Times a week'] }] });
    app.field('habits', day('since', 'Since', true));
    // What is worked out: the days it was done, its streak and best, this week, the last 30 days.
    app.field('habits', rollup('done_days', 'Done on', done, 'list', 'day'));
    app.field('habits', formula('per_week', 'A week', 'often == "Times a week" ? times : null'));
    app.field('habits', formula('streak', 'Streak days', 'streak(done_days, days, per_week)'));
    app.field('habits', formula('best', 'Best days', 'best(done_days, days, per_week)'));
    // A run in days, or in weeks with a number a week; none when it is none, the table saying –.
    const run = (key: string) => `text(${key}) + (empty(per_week) ? (${key} == 1 ? " day" : " days") : (${key} == 1 ? " week" : " weeks"))`;
    app.field('habits', formula('streak_text', 'Streak', `streak == 0 ? null : "🔥 " + ${run('streak')}`));
    app.field('habits', formula('best_text', 'Best', `best == 0 ? null : ${run('best')}`));
    app.field('habits', rollup('week_done', 'Done this week', done, 'count', undefined, [{ field: 'this_week', op: 'true' }]));
    app.field('habits', formula('this_week', 'This week', 'text(week_done) + " of " + text(often == "Times a week" ? times : days.length)'));
    app.field('habits', rollup('in_30', 'In 30 days', done, 'count', undefined, [{ field: 'in_30', op: 'true' }]));
    app.field('habits', formula('kept', '30 days', 'min(1, in_30 / ((often == "Times a week" ? times : days.length) * 30 / 7))', { style: 'percent', decimals: 0 }));
    app.field('habits', formula('today_says', 'Today', 'often == "Times a week" ? (times - week_done == 1 ? "1 more this week" : text(times - week_done) + " more this week") : streak > 0 ? "🔥 " + text(streak) + (streak == 1 ? " day" : " days") : this_week + " this week"'));
    app.tableColumns('habits', ['streak_text', 'this_week', 'kept']);
    // Its days: in Today only, Done the one button, a day missed gone, a week of enough days done; a strip of seven in the table.
    app.view('habits', {
      id: 'days',
      name: 'Calendar',
      kind: 'calendar',
      conditions: [],
      calendar: {
        start: 'since',
        upcoming: 'today',
        words: ['today_says'],
        repeat: { days: 'days', from: 'since', closedBy: { collection: done, link: 'habit', day: 'day' }, start: false, skip: { label: 'Done', set: {} }, late: false, perWeek: 'per_week', strip: 7 },
      },
    });
    app.block('habits', { block: 'days', fields: ['streak_text', 'best_text', 'in_30'] });
    // Every day and a number a week come on all seven days; picked days on those.
    app.rule('habits', { kind: 'onSave', name: 'Its days', src: `onSave("Its days", () => {\n  if (often != "On some days") days = [${WEEK.map((d) => JSON.stringify(d)).join(', ')}]\n})` });
    for (const item of (answers.habits as string[] | undefined) ?? HABITS) {
      if (!item.trim()) continue;
      const habit = habitOf(item);
      app.record('habits', { name: habit.name, often: habit.often, days: habit.days, ...(habit.times && { times: habit.times }) });
    }

    // A day a habit was done: written by Done, by a box of the strip or of the month, taken off by them too.
    app.field('habit-checkins', nameField());
    app.field('habit-checkins', { ...link('habit', 'Habit', app.path('habits')), required: true });
    app.field('habit-checkins', day('day', 'Day', true));
    app.field('habit-checkins', formula('this_week', 'This week', 'week(day) == week(today())'));
    app.field('habit-checkins', formula('in_30', 'In the last 30 days', 'today() - day < 30'));
    app.rule('habit-checkins', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  name = (empty(habit) ? "" : habit.name) + " · " + text(day)\n})' });

    if (goals) {
      // A goal by a number (books, kilos, money) or by its steps; how far it is and whether it is on track worked out.
      const byNumber = [{ field: 'measure', op: 'is' as const, value: ['Number'] }];
      app.field('personal-goals', nameField());
      app.field('personal-goals', select('measure', 'Measure', ['Number', 'Steps'], gray(['Number', 'Steps']), 'Number'));
      app.field('personal-goals', { ...text('unit', 'Unit'), when: byNumber });
      app.field('personal-goals', { ...number('start', 'Start', { default: 0 }), when: byNumber });
      app.field('personal-goals', { ...number('target', 'Target'), required: true, when: byNumber });
      app.field('personal-goals', day('since', 'Since', true));
      app.field('personal-goals', day('by', 'By'));
      app.field('personal-goals', { ...number('now', 'Now'), when: byNumber });
      app.field('personal-goals', formula('shown', 'Done', 'measure == "Steps" ? text(steps(true)) + " of " + text(steps()) + " steps" : text(abs((empty(now) ? start : now) - start)) + " of " + text(abs(target - start)) + (empty(unit) ? "" : " " + unit)'));
      app.field('personal-goals', formula('progress', 'Progress', 'measure == "Steps" ? (steps() == 0 ? 0 : steps(true) / steps()) : empty(target) || target == start ? 0 : min(1, max(0, ((empty(now) ? start : now) - start) / (target - start)))', { style: 'percent', bar: true, caption: 'shown' }));
      app.field('personal-goals', formula('expected', 'By now', 'empty(by) || by <= since ? null : min(1, max(0, (today() - since) / (by - since)))', PERCENT));
      app.field('personal-goals', { ...formula('status', 'Status', 'progress >= 1 ? "Done" : empty(expected) || progress >= expected - 0.05 ? "On track" : "Behind"'), colors: { 'On track': 'green', Behind: 'orange', Done: 'blue' } });
      app.block('personal-goals', { block: 'subtasks', title: 'Steps', add: 'Add step', when: [{ field: 'measure', op: 'is', value: ['Steps'] }] });
      const open = [{ field: 'status', op: 'is-not' as const, value: ['Done'] }];
      app.view('personal-goals', { id: 'open', name: 'Open', conditions: open, sort: { key: 'by', dir: 'asc' }, columns: ['progress', 'by', 'status'] }, true);
      app.tableColumns('personal-goals', ['progress', 'by', 'status']);
      app.view('personal-goals', { id: 'calendar', name: 'Calendar', kind: 'calendar', conditions: open, calendar: { start: 'by', color: 'status', upcoming: true } });
      app.rule('personal-goals', { kind: 'check', name: 'Past its day', src: 'check("by", () => empty(by) || by >= today() || progress >= 1, "Past its day")' });
      app.rule('personal-goals', {
        kind: 'action',
        name: 'Update',
        src: `action("Update", {
  when: () => measure == "Number",
  hint: "A goal by its steps moves as they are done",
  ask: { now: { label: "Now", type: "number", default: () => empty(now) ? start : now, required: true } },
}, () => {
  now = input.now
})`,
      });
    }

    const named = ((answers.habits as string[] | undefined) ?? HABITS).map((h) => habitOf(h).name).filter(Boolean);
    app.about({
      title: 'Habits and goals',
      what: `What you do again and again${named.length > 0 ? `: ${named.join(', ')}` : ''}, ticked in Today, and your streaks${goals ? '; and your goals, by a number or by their steps' : ''}.`,
      pieces: ['habits', 'habit-checkins', ...(goals ? ['personal-goals'] : [])],
      glance: ['Done in Today, one click', 'The last seven days, and your streak', ...(goals ? ['How far each goal is, and whether it is on track'] : [])],
      how: [
        'Give each habit how often: every day, on some days, or a number of times a week.',
        'Press Done on a habit in Today; a day forgotten is ticked in its table or its month.',
        ...(goals ? ['Add a goal with its target and its day, and press Update as you go; or give it steps, which come to Today on their days.'] : []),
      ],
      auto: [
        'A habit comes to Today on its days; a day missed is not kept. One a number of times a week comes each day until the week has as many.',
        'Its streak, its best, this week and the last 30 days are worked out from the days it was done.',
        ...(goals ? ['A goal says how far it is, and whether it is on track for its day; its day comes to Upcoming, and one past it and not done is marked.'] : []),
      ],
      work: ['When in the day you tick your habits.'],
    });
  },
};
