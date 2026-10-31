import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition } from '../../collection';
import { calendar, day, formula, link, multi, nameField, number, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Sport and training (design/more-apps.md 4.10), as Strava, TrainingPeaks and Runna keep it: runs,
// rides, swims and the rest; the gym's sets are Gym's. A weekly plan is written once, its days come
// to Today with Done, which opens the workout with the plan's values, and Skip; a day gone by is not
// kept. Workouts by the week with their totals, the pace worked out by the sport, and how close each
// came to its plan, in TrainingPeaks' colors. Races with their aim, their result asked after the day.

const SPORTS = ['Run', 'Cycle', 'Swim', 'Walk', 'Yoga', 'Team sport'];
const SPORT_COLORS = { Run: 'orange', Cycle: 'green', Swim: 'teal', Walk: 'purple', Yoga: 'pink', 'Team sport': 'blue', Other: 'gray' } as const;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FITS = { 'On plan': 'green', Short: 'yellow', Long: 'yellow', 'Far off': 'orange', 'Not planned': 'gray' } as const;
/** The sports a distance is kept for. */
const DISTANCE = ['Run', 'Cycle', 'Swim', 'Walk'];

/** Seconds as a clock, "5:09". */
const clock = (sec: string) => `(text(round(${sec} / 60 - 0.5)) + ":" + (${sec} - 60 * round(${sec} / 60 - 0.5) < 10 ? "0" : "") + text(${sec} - 60 * round(${sec} / 60 - 0.5)))`;
/** A day as a week's head says it: "Oct 19". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;

export const sport: AppTemplate = {
  id: 'sport',
  version: 2,
  group: 'health',
  name: 'apps.sport.name',
  short: 'apps.sport.short',
  icon: 'rise',
  what: 'apps.sport.what',
  goesWith: ['gym'],
  questions: [
    { key: 'sports', kind: 'multi', label: 'apps.sport.sports', options: SPORTS.map((value) => ({ value, label: `apps.sport.sport.${value === 'Team sport' ? 'team' : value.toLowerCase()}` as MessageKey })), default: SPORTS.slice(0, 4) },
    { key: 'races', kind: 'yesno', label: 'apps.sport.races', default: true },
    { key: 'body', kind: 'yesno', label: 'apps.sport.body', default: false },
  ],
  money: () => false,
  pieces: (answers) => ['workouts', 'training-plan', ...(answers.races !== false ? ['races'] : []), ...(answers.body === true ? ['body-measures'] : [])],
  menu: [{ role: 'workouts', view: 'all', name: 'Workouts' }, { role: 'training-plan', view: 'ongoing', name: 'Weekly plan' }, 'races', 'body-measures'],
  build(app, answers) {
    const chosen = ((answers.sports as string[] | undefined) ?? SPORTS.slice(0, 4)).filter((s) => SPORTS.includes(s));
    const kinds = [...chosen, 'Other'];
    const races = app.hasPiece('races');
    const body = app.hasPiece('body-measures');
    const workouts = app.path('workouts');
    const plan = app.path('training-plan');
    const distanced = chosen.filter((s) => DISTANCE.includes(s));

    // A weekly plan: on which days, how long or how far, from when until when.
    app.field('training-plan', nameField());
    app.field('training-plan', { ...select('sport', 'Sport', kinds, SPORT_COLORS, kinds[0]), chips: true });
    app.field('training-plan', { ...multi('days', 'Days', WEEKDAYS), chips: true, required: true });
    app.field('training-plan', number('minutes', 'Duration', { format: { style: 'duration' } }));
    app.field('training-plan', number('km', 'Distance (km)'));
    app.field('training-plan', { ...day('from', 'From', true), required: true });
    app.field('training-plan', day('until', 'Until'));
    app.field('training-plan', formula('ongoing', 'Ongoing', 'empty(until) || until >= today()'));
    // "45 min", "2 h · 55 km".
    app.field('training-plan', formula('each_said', 'Each', '(empty(minutes) ? "" : minutes >= 60 ? text(round(minutes / 60 - 0.5)) + " h" + (minutes - 60 * round(minutes / 60 - 0.5) == 0 ? "" : " " + text(minutes - 60 * round(minutes / 60 - 0.5)) + " min") : text(minutes) + " min") + (!empty(minutes) && !empty(km) ? " · " : "") + (empty(km) ? "" : text(km) + " km")'));
    app.field('training-plan', formula('until_said', 'Until', 'empty(until) ? "Ongoing" : until < today() ? "Ended " + ' + short('until') + ' : ' + short('until')));
    app.formOrder('training-plan', ['name', 'sport', 'days', 'minutes', 'km', 'from', 'until']);
    app.rule('training-plan', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name)) name = sport\n})' });
    // Its days in Today with Done, which opens the workout, and Skip; a day gone by is not kept.
    app.view('training-plan', {
      id: 'days',
      name: 'Plan days',
      kind: 'calendar',
      calendar: {
        start: 'from',
        color: 'sport',
        upcoming: true,
        words: ['each_said'],
        repeat: { days: 'days', from: 'from', until: 'until', closedBy: { collection: workouts, link: 'plan', day: 'day' }, start: 'Done', skip: { label: 'Skip', set: { status: 'Skipped' } }, late: false },
      },
      conditions: [],
      hidden: true,
    });
    const planTab = (id: string, name: string, conditions: Condition[]) => app.view('training-plan', { id, name, conditions, sort: { key: 'from', dir: 'asc' }, columns: ['sport', 'days', 'each_said', 'until_said'], set: 'plan' }, id === 'ongoing');
    planTab('ongoing', 'Ongoing', [{ field: 'ongoing', op: 'true' }]);
    planTab('ended', 'Ended', [{ field: 'ongoing', op: 'false' }]);

    // A workout: when, what, how long and how far; the pace and the fit to its plan worked out.
    app.field('workouts', nameField());
    app.field('workouts', { ...day('day', 'Day', true), required: true });
    app.field('workouts', { key: 'time', label: 'Time', type: 'time' });
    app.field('workouts', { ...select('sport', 'Sport', kinds, SPORT_COLORS, kinds[0]), chips: true });
    app.field('workouts', number('minutes', 'Duration', { format: { style: 'duration' } }));
    app.field('workouts', { ...number('km', 'Distance (km)'), when: [{ field: 'sport', op: 'is', value: [...DISTANCE, 'Other'] }] });
    app.field('workouts', number('effort', 'Effort (1–10)'));
    app.field('workouts', text('note', 'Note'));
    app.field('workouts', link('plan', 'Plan', plan));
    app.field('workouts', { ...select('status', 'Status', ['Done', 'Skipped'], { Done: 'green', Skipped: 'gray' }, 'Done'), when: [{ field: 'plan', op: 'not-empty' }] });
    const per = 'round(minutes * 60 / km)';
    app.field(
      'workouts',
      formula(
        'pace',
        'Pace',
        `empty(minutes) || empty(km) || km == 0 || minutes == 0 ? "" : sport == "Run" || sport == "Walk" ? ${clock(per)} + " /km" : sport == "Swim" ? ${clock('round(minutes * 6 / km)')} + " /100 m" : sport == "Cycle" ? text(round(km / minutes * 60, 1)) + " km/h" : ""`,
      ),
    );
    // How close it came to its plan, as TrainingPeaks colors it: within a fifth On plan.
    const ratio = '(!empty(plan.km) && !empty(km) ? km / plan.km : empty(minutes) || empty(plan.minutes) ? 1 : minutes / plan.minutes)';
    app.field('workouts', { ...formula('fit', 'Plan', `empty(plan) ? "Not planned" : ${ratio} >= 0.8 && ${ratio} <= 1.2 ? "On plan" : ${ratio} >= 0.5 && ${ratio} < 0.8 ? "Short" : ${ratio} > 1.2 && ${ratio} <= 1.5 ? "Long" : "Far off"`), colors: FITS });
    app.field('workouts', formula('this_week', 'This week', 'week(day) == week(today())'));
    app.field('workouts', formula('this_month', 'This month', 'month(day) == month(today()) && year(day) == year(today())'));
    app.field('workouts', formula('this_year', 'This year', 'year(day) == year(today())'));
    // "This week", "Oct 19 – Oct 25": the weeks the list is in.
    app.field('workouts', formula('week_said', 'Week', `this_week ? "This week" : ${short('week(day)')} + " – " + ${short('week(day) + 6')}`));
    // Its window's line: "5:09 /km · 17% longer than planned".
    app.field(
      'workouts',
      formula(
        'said',
        'Says',
        `pace + (empty(plan) ? "" : (pace == "" ? "" : " · ") + (round(${ratio} * 100) == 100 ? "as planned" : text(round(abs(${ratio} - 1) * 100)) + "% " + (${ratio} > 1 ? "longer" : "shorter") + " than planned") + (fit == "On plan" ? ", on plan" : ""))`,
      ),
    );
    app.head('workouts', 'said');
    app.formOrder('workouts', ['name', 'day', 'time', 'sport', 'minutes', 'km', 'effort', 'note']);
    app.newForm('workouts', ['day', 'time', 'sport', 'minutes', 'km', 'effort', 'note']);
    app.rule('workouts', { kind: 'check', name: 'Effort is from 1 to 10', src: 'check("effort", () => empty(effort) || (effort >= 1 && effort <= 10), "Effort is from 1 to 10")' });
    app.rule('workouts', {
      kind: 'onChange',
      name: 'Fill from the plan',
      src: `onChange("plan", "Fill from the plan", () => {
  if (!empty(plan)) {
    sport = plan.sport
    if (empty(minutes)) minutes = plan.minutes
    if (empty(km)) km = plan.km
  }
})`,
    });
    app.rule('workouts', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name)) name = empty(plan) ? sport : plan.name\n})' });
    const done: Condition = { field: 'status', op: 'is-not', value: ['Skipped'] };
    const sums = [
      { label: 'this week', field: 'minutes', conditions: [done, { field: 'this_week', op: 'true' as const }] },
      ...(distanced.length > 0 ? [{ label: 'km this week', field: 'km', conditions: [done, { field: 'this_week', op: 'true' as const }] }, { label: 'km this year', field: 'km', conditions: [done, { field: 'this_year', op: 'true' as const }] }] : []),
    ];
    const groupSums = [{ label: 'workouts', one: 'workout' }, { label: '', field: 'minutes' }, ...(distanced.length > 0 ? [{ label: 'km', field: 'km' }] : [])];
    const tab = (id: string, name: string, more: Condition[]) =>
      app.view('workouts', { id, name, conditions: [done, ...more], sort: { key: 'day', dir: 'desc' }, group: 'week_said', groupSums, chips: 'sport', columns: ['day', 'time', 'sport', 'minutes', ...(distanced.length > 0 ? ['km', 'pace'] : []), 'fit'], sums, set: 'workouts' }, id === 'all');
    tab('this-week', 'This week', [{ field: 'this_week', op: 'true' }]);
    tab('this-month', 'This month', [{ field: 'this_month', op: 'true' }]);
    tab('all', 'All', []);

    if (races) {
      app.field('races', nameField());
      app.field('races', { ...day('date', 'Day'), required: true });
      app.field('races', { ...select('sport', 'Sport', kinds, SPORT_COLORS, kinds[0]), chips: true });
      app.field('races', number('km', 'Distance (km)'));
      app.field('races', text('aim', 'Aim'));
      app.field('races', text('result', 'Result'));
      app.field('races', formula('coming', 'Coming', 'date >= today()'));
      app.field('races', formula('when_said', 'When', 'date == today() ? "today" : date > today() ? "in " + text(date - today()) + (date - today() == 1 ? " day" : " days") : ' + short('date')));
      app.formOrder('races', ['name', 'date', 'sport', 'km', 'aim', 'result']);
      app.view('races', calendar({ start: 'date', color: 'sport', upcoming: true, button: 'Write result', words: ['aim'] }, [{ field: 'result', op: 'empty' }]), true);
      const raceTab = (id: string, name: string, coming: boolean) => app.view('races', { id, name, conditions: [{ field: 'coming', op: coming ? 'true' : 'false' }], sort: { key: 'date', dir: coming ? 'asc' : 'desc' }, columns: ['date', 'when_said', 'sport', 'km', 'aim', 'result'], set: 'races' });
      raceTab('coming', 'Coming', true);
      raceTab('done', 'Done', false);
      app.rule('races', {
        kind: 'action',
        name: 'Write result',
        src: `action("Write result", {
  when: () => date <= today(),
  hint: "On its day",
  ask: { result: { label: "Result", type: "text", default: () => result, required: true, note: () => empty(aim) ? "Your time, and your place if you like: 1:47:32 · 412th." : "Your aim was " + aim + "." } },
  done: () => name + " · " + input.result,
}, () => {
  result = input.result
})`,
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

    app.homeTile('workouts', { off: true });
    app.homeTile('training-plan', { off: true });
    const line = (s: string) => ({ label: s, field: DISTANCE.includes(s) ? 'km' : 'minutes', conditions: [{ field: 'sport', op: 'is' as const, value: [s] }] });
    app.homeTiles('workouts', [
      { view: 'this-week', title: 'This week', head: [{ label: '', field: 'minutes' }, ...(distanced.length > 0 ? [{ label: 'km', field: 'km' }] : [])], lines: chosen.map(line), empty: 'No workout this week yet.' },
      ...(distanced.length > 0 ? [{ view: 'this-year', title: 'This year', head: [{ label: 'km', field: 'km' }], lines: distanced.map((s) => ({ label: s, field: 'km', conditions: [{ field: 'sport', op: 'is' as const, value: [s] }] })), empty: 'No workout this year yet.' }] : []),
    ]);
    app.view('workouts', { id: 'this-year', name: 'This year', conditions: [done, { field: 'this_year', op: 'true' }], sort: { key: 'day', dir: 'desc' }, hidden: true });
    if (races) {
      app.homeTile('races', { off: true });
      app.homeTiles('races', [{ view: 'coming', title: 'Next race', first: true, value: 'when_said', sub: 'aim', empty: 'No race ahead.' }]);
    }

    app.about({
      title: 'Sport and training',
      what: `Your workouts${chosen.length > 0 ? ` (${chosen.map((s) => s.toLowerCase()).join(', ')})` : ''} and your weekly plan${races ? ', and races with their aim and result' : ''}${body ? ', and body measures' : ''}. The gym's sets are kept in Gym.`,
      pieces: ['workouts', 'training-plan', ...(races ? ['races'] : []), ...(body ? ['body-measures'] : [])],
      glance: ["The plan's days in Today with Done and Skip", 'Done opens the workout with the plan filled in', 'Workouts by the week with their totals', 'Pace worked out by the sport', 'How close each came to its plan', ...(races ? ['Write result after a race'] : [])],
      how: [
        'Write your weekly plan once: the sport, its days, how long or how far, from when.',
        'On its day, press Done in Today: change what was different and save; press Skip if you did not go.',
        'Add a workout that was not planned with Add workout.',
        ...(races ? ['Add a race with its day and your aim; after it, Today asks its result.'] : []),
        ...(body ? ['Write your measures now and then.'] : []),
      ],
      auto: [
        "A plan's days come to Today and Upcoming; a day gone by without a workout is not kept.",
        'Done opens the workout of the day with its sport, its duration and its distance from the plan.',
        'Pace is worked out by the sport: per kilometre running and walking, per 100 m swimming, km/h cycling.',
        "A planned workout is On plan within a fifth of its plan's distance, else its duration; Short or Long within a half; Far off beyond.",
        'The list goes by the week, each with how many, how long and how far.',
        ...(races ? ['A race past its day with no result stays in Today with Write result.'] : []),
        ...(body ? ['A measure says how far your weight is from the first one written.'] : []),
      ],
      work: ['When you train in the week, and how you rest.'],
    });
  },
};
