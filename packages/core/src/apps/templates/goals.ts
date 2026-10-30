import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition } from '../../collection';
import { calendar, day, formula, link, nameField, number, person, rollup, select, symbolOf, text } from '../pieces';
import type { AppTemplate } from '../types';

// Goals (design/more-apps.md 3.4), as Viva Goals, Lattice and Perdoo keep them: a goal is measured
// by its key results, each from where it started to where it should get, or by the goals that are
// part of it; how far it should be by now is a line on its bar, and its status is worked out from
// the two, Behind up to a quarter short, At risk beyond. Check in asks every key result's value at
// once, how it is going and what changed, and comes to the owner's Today on its day; at its end,
// Close goal asks Complete or Incomplete, what was learned, and carries what is left over.

/** The first day of the period a new goal starts in, by the answer: this quarter's, this half's, this year's. */
const FIRSTS: { [answer: string]: string } = {
  quarter: 'today() - (monthday(today()) - 1) - months(month(today()) - 3 * round((month(today()) + 1) / 3) + 2)',
  half: 'today() - (monthday(today()) - 1) - months(month(today()) - (month(today()) <= 6 ? 1 : 7))',
  year: 'today() - (monthday(today()) - 1) - months(month(today()) - 1)',
};
/** A period as a span a rule or a default adds to a day. */
const SPANS: { [answer: string]: string } = { quarter: 'months(3)', half: 'months(6)', year: 'years(1)' };
/** A period as its goals say it: 2026 Q4, 2026 H2, 2026. */
const NAMES: { [answer: string]: string } = {
  quarter: 'text(year(starts)) + " Q" + text(round((month(starts) + 1) / 3))',
  half: 'text(year(starts)) + (month(starts) <= 6 ? " H1" : " H2")',
  year: 'text(year(starts))',
};
/** Days between check-ins, by the answer. */
const EVERY: { [answer: string]: number } = { weekly: 7, biweekly: 14, monthly: 30 };
const STATUS_COLORS = { 'On track': 'green', Behind: 'yellow', 'At risk': 'orange', Done: 'blue', Complete: 'green', Incomplete: 'yellow' } as const;
const KINDS = ['Number', 'Percent', 'Money', 'Done or not'];

/** A day as a goal says it: "Dec 31". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;
/** A share as a goal says it: "24%". */
const pct = (x: string) => `text(round(${x} * 100)) + "%"`;

export const goals: AppTemplate = {
  id: 'goals',
  version: 2,
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
    {
      key: 'checkins',
      kind: 'choice',
      label: 'apps.goals.checkins',
      options: ['weekly', 'biweekly', 'monthly', 'none'].map((value) => ({ value, label: `apps.goals.checkins.${value}` as MessageKey })),
      default: 'weekly',
      help: 'apps.goals.checkinsHelp',
    },
  ],
  money: () => false,
  pieces: () => ['goals', 'key-results', 'check-ins'],
  menu: [{ role: 'goals', view: 'this-period', name: 'Goals' }],
  build(app, answers) {
    const period = (answers.period as string | undefined) ?? 'quarter';
    const first = FIRSTS[period] ?? FIRSTS.quarter!;
    const span = SPANS[period] ?? SPANS.quarter!;
    const every = EVERY[(answers.checkins as string | undefined) ?? 'weekly'] ?? 0;
    const path = app.path('goals');
    const results = app.path('key-results');
    const krs = app.called('key-results');
    const checkIns = app.called('check-ins');
    const projects = app.hasPiece('projects');
    const roadmap = app.hasPiece('roadmap');
    const sym = JSON.stringify(symbolOf(app.money.main));
    const kinds = [...KINDS, ...(projects ? ["Project's progress"] : [])];
    const open: Condition = { field: 'result', op: 'empty' };

    app.field('goals', nameField());
    app.field('goals', person('owner', 'Owner', true));
    app.field('goals', { ...link('part_of', 'Part of', path), help: 'A goal of the company or the team this one is part of' });
    app.field('goals', { ...day('starts', 'Starts'), default: `=${first}` });
    app.field('goals', { ...day('ends', 'Ends'), default: `=(${first}) + ${span} - 1` });
    app.field('goals', formula('period', 'Period', NAMES[period] ?? NAMES.quarter!));
    app.field('goals', rollup('kr_progress', 'Key results done', results, 'avg', 'progress'));
    app.field('goals', rollup('kr_count', 'Key results', results, 'count'));
    app.field('goals', rollup('sub_progress', 'Its goals done', path, 'avg', 'progress'));
    app.field('goals', rollup('sub_count', 'Its goals', path, 'count'));
    // How far it should be by now: the share of its period gone by, Viva Goals' grey line.
    app.field('goals', formula('expected', 'Expected by now', 'empty(starts) || empty(ends) || ends <= starts ? null : min(1, max(0, (today() - starts) / (ends - starts)))', { style: 'percent' }));
    // Its key results' progress on average, or, with none, the goals that are part of it (Perdoo).
    app.field('goals', formula('progress', 'Progress', 'kr_count > 0 ? kr_progress : sub_count > 0 ? sub_progress : 0', { style: 'percent', decimals: 0, bar: true, mark: 'expected', tone: { field: 'status', colors: STATUS_COLORS } }));
    app.field('goals', formula('worked', 'Worked out', 'progress >= 1 ? "Done" : empty(expected) || expected - progress <= 0 ? "On track" : expected - progress > 0.25 ? "At risk" : "Behind"'));
    app.field('goals', select('call', 'Owner says', ['On track', 'Behind', 'At risk'], STATUS_COLORS));
    app.field('goals', { ...select('result', 'Ended', ['Complete', 'Incomplete'], STATUS_COLORS), when: [{ field: 'result', op: 'not-empty' }] });
    app.field('goals', { ...text('learned', 'What we learned'), when: [{ field: 'result', op: 'not-empty' }] });
    app.field('goals', { ...day('closed_on', 'Closed on'), when: [{ field: 'result', op: 'not-empty' }] });
    app.field('goals', { ...formula('status', 'Status', '!empty(result) ? result : !empty(call) ? call : worked'), colors: STATUS_COLORS });
    app.field('goals', rollup('last_check_in', 'Last check-in', app.path('check-ins'), 'max', 'day'));
    if (every > 0) {
      app.field('goals', formula('checkin_on', 'Check-in due', `empty(result) ? (empty(last_check_in) ? starts : last_check_in) + ${every} : null`));
      app.field('goals', formula('checkin_due', 'Check-in due', 'empty(result) && !empty(checkin_on) && checkin_on <= today()'));
    }
    app.field('goals', formula('checkin_said', 'Check-in', `!empty(result) ? "Closed" : ${every > 0 ? 'checkin_due ? "Check-in due" : ' : ''}empty(last_check_in) ? "" : ${short('last_check_in')}`));
    app.field('goals', formula('checkin_words', 'Last check-in', `(empty(last_check_in) ? "no check-in yet" : "last " + ${short('last_check_in')}) + " · " + status + " · " + ${pct('progress')}`));
    app.field('goals', formula('counted', 'One', '1'));
    // Its window's line: "Behind · 24% · expected 33% by now · 2026 Q4 · ends Dec 31 (in 62 days) · Ahmet Yılmaz".
    app.field(
      'goals',
      formula(
        'said',
        'Says',
        `status + " · " + ${pct('progress')} + (empty(expected) || !empty(result) ? "" : " · expected " + ${pct('expected')} + " by now") + " · " + period + (empty(ends) || !empty(result) ? "" : ends < today() ? " · ended " + ${short('ends')} : " · ends " + ${short('ends')} + " (in " + text(ends - today()) + (ends - today() == 1 ? " day)" : " days)")) + (empty(owner) ? "" : " · " + text(owner))`,
      ),
    );
    app.head('goals', 'said');
    app.formOrder('goals', ['name', 'owner', 'part_of', 'starts', 'ends']);
    app.newForm('goals', ['name', 'owner', 'part_of', 'starts', 'ends']);
    app.block('goals', { block: 'actions', column: 1 });
    app.block('goals', { block: 'linked', collection: results, style: 'table', title: 'Key results', fields: ['name', 'value_said', 'progress'], lines: true, column: 1 });
    app.block('goals', { block: 'linked', collection: path, style: 'list', title: 'Part of it', fields: ['owner', 'status', 'progress'], add: 'Goal', column: 2 });
    app.block('goals', { block: 'linked', collection: app.path('check-ins'), style: 'timeline', title: 'Check-ins', fields: ['changes', 'note'], sort: 'day', fixed: true, column: 2 });
    if (projects) app.field('projects', link('goal', 'Goal', path));
    if (roadmap) {
      app.field('roadmap', link('goal', 'Goal', path));
      app.block('goals', { block: 'cards', board: app.path('roadmap'), column: 2 });
    }

    // A key result's value as it is said: "$12,400", "2.8%", "5 customers".
    const said = (k: string, x: string) => `(${k}kind == "Money" ? ${sym} + amount(${x}) : ${k}kind == "Percent" ? text(${x}) + "%" : text(${x}) + (empty(${k}unit) ? "" : " " + ${k}unit))`;
    const measured = { field: 'kind', op: 'is' as const, value: ['Number', 'Percent', 'Money'] };
    app.field('key-results', nameField());
    app.field('key-results', { ...link('goal', 'Goal', path), required: true });
    app.field('key-results', { ...select('kind', 'Measured by', kinds, { Number: 'blue', Percent: 'teal', Money: 'green', 'Done or not': 'purple', "Project's progress": 'orange' }, 'Number'), chips: true });
    app.field('key-results', { ...number('start', 'Start', { default: 0 }), when: [measured] });
    app.field('key-results', { ...number('target', 'Target'), when: [measured] });
    app.field('key-results', { ...number('current', 'Now', { default: 0 }), when: [{ field: 'kind', op: 'is-not', value: ["Project's progress"] }], help: 'Done or not: 1 when it is done' });
    app.field('key-results', { ...text('unit', 'Unit'), when: [{ field: 'kind', op: 'is', value: ['Number'] }], help: 'What it counts: customers, signups' });
    if (projects) app.field('key-results', { ...link('project', 'Project', app.path('projects')), when: [{ field: 'kind', op: 'is', value: ["Project's progress"] }] });
    app.field('key-results', formula('expected', 'Expected by now', 'goal.expected', { style: 'percent' }));
    // How far from where it started to where it should get, kept between none and all of it.
    app.field(
      'key-results',
      formula(
        'progress',
        'Progress',
        `${projects ? 'kind == "Project\'s progress" ? (empty(project) ? 0 : project.progress) : ' : ''}kind == "Done or not" ? (current >= 1 ? 1 : 0) : empty(target) ? 0 : target == start ? (current >= target ? 1 : 0) : max(0, min(1, (current - start) / (target - start)))`,
        { style: 'percent', decimals: 0, bar: true, mark: 'expected', tone: { field: 'tone', colors: { 'On track': 'green', Behind: 'yellow' } } },
      ),
    );
    app.field('key-results', formula('tone', 'Going', 'progress >= (empty(expected) ? 0 : expected) ? "On track" : "Behind"'));
    app.field('key-results', formula('now_said', 'Now', `kind == "Done or not" ? (current >= 1 ? "Done" : "Not yet") : ${projects ? `kind == "Project's progress" ? ${pct('progress')} : ` : ''}${said('', 'current')}`));
    app.field('key-results', formula('value_said', 'Where it is', `kind == "Done or not" ? (current >= 1 ? "Done" : "Not yet") : ${projects ? `kind == "Project's progress" ? (empty(project) ? "" : project.name + " · " + ${pct('progress')}) : ` : ''}(kind == "Number" ? text(current) + " of " + text(target) + (empty(unit) ? "" : " " + unit) + " · from " + text(start) : ${said('', 'current')} + " of " + ${said('', 'target')} + " · from " + ${said('', 'start')})`));
    app.formOrder('key-results', ['name', 'goal', 'kind', 'start', 'target', 'current', 'unit', ...(projects ? ['project'] : [])]);

    app.field('check-ins', nameField('How it is going'));
    app.field('check-ins', { ...link('goal', 'Goal', path), required: true });
    app.field('check-ins', day('day', 'Day', true));
    app.field('check-ins', select('status', 'Status', ['On track', 'Behind', 'At risk'], STATUS_COLORS));
    app.field('check-ins', number('progress', 'Progress', { format: { style: 'percent' } }));
    app.field('check-ins', text('changes', 'What moved'));
    app.field('check-ins', text('note', 'What changed'));
    app.field('check-ins', person('by', 'By', true));

    // Check in: every key result's value at once, how it is going and what changed (Perdoo's check-in).
    const progressOf = (k: string, v: string) =>
      `(${projects ? `${k}.kind == "Project's progress" ? ${k}.progress : ` : ''}${k}.kind == "Done or not" ? (${v} >= 1 ? 1 : 0) : empty(${k}.target) ? 0 : ${k}.target == ${k}.start ? (${v} >= ${k}.target ? 1 : 0) : max(0, min(1, (${v} - ${k}.start) / (${k}.target - ${k}.start))))`;
    app.rule('goals', {
      kind: 'action',
      name: 'Check in',
      src: `action("Check in", {
  when: () => empty(result),
  hint: "Only a goal not closed",
  ask: {
    results: { label: "Now", type: "rows", collection: "${krs}", show: { now_said: "Was" }, from: "current", keep: true },
    status: { label: "How is it going", type: "choice", options: ["On track", "Behind", "At risk"], chips: true, default: () => worked == "Done" ? "On track" : worked, note: () => "Worked out: " + worked + ", " + ${pct('progress')} + (empty(expected) ? "" : " · " + ${pct('expected')} + " expected by now") + ". Pick another if you know better; it stays until the next check-in." },
    note: { label: "What changed", type: "text", lines: true },
  },
  done: () => name + " · checked in",
}, () => {
  let moved = ""
  let total = 0
  let n = 0
  if (!empty(input.results)) {
    for (const r of input.results) {
      const k = r.row
      let v = k.current
      if (${projects ? `k.kind != "Project's progress" && ` : ''}r.count != k.current) {
        moved = moved + (moved == "" ? "" : " · ") + k.name + " " + k.now_said + " → " + ${said('k.', 'r.count')}
        update(k, { current: r.count })
        v = r.count
      }
      total = total + ${progressOf('k', 'v')}
      n = n + 1
    }
  }
  const now = n > 0 ? total / n : progress
  call = input.status == worked ? null : input.status
  add("${checkIns}", { name: input.status + " · " + ${pct('now')}, goal: this, day: today(), status: input.status, progress: now, changes: moved, note: input.note, by: me() })
})`,
    });
    // Close goal: Lattice's Complete or Incomplete, what was learned; what is left carried to the next period.
    app.rule('goals', {
      kind: 'action',
      name: 'Close goal',
      src: `action("Close goal", {
  when: () => empty(result),
  hint: "",
  ask: {
    result: { label: "How it ended", type: "choice", options: ["Complete", "Incomplete"], chips: true, default: () => progress >= 1 ? "Complete" : "Incomplete", required: true, note: () => period + " · " + ${pct('progress')} },
    learned: { label: "What we learned", type: "text", lines: true },
    carry: { label: "Carry over to the next period, with the key results not reached", type: "tick" },
  },
  done: () => name + " · closed" + (input.carry ? " and carried over" : ""),
}, () => {
  result = input.result
  learned = input.learned
  closed_on = today()
  if (input.carry) {
    const next = add("${app.called('goals')}", { name: name, owner: owner, part_of: part_of, starts: ends + 1, ends: ends + 1 + ${span} - 1 })
    for (const k of linked("${krs}")) {
      if (k.progress < 1) add("${krs}", { name: k.name, goal: next, kind: k.kind, start: k.current, target: k.target, current: k.current, unit: k.unit${projects ? ', project: k.project' : ''} })
    }
  }
})`,
    });

    // The tabs; over them how much of the period is gone, how far the goals are and what is behind.
    const sums = [
      { label: 'of the period gone', field: 'expected', per: 'counted', conditions: [open] },
      { label: 'goals', one: 'goal', conditions: [open] },
      { label: 'on average', field: 'progress', per: 'counted', conditions: [open] },
      { label: 'behind', conditions: [open, { field: 'status', op: 'is' as const, value: ['Behind'] }], warn: true as const },
      { label: 'at risk', conditions: [open, { field: 'status', op: 'is' as const, value: ['At risk'] }], warn: true as const },
      ...(every > 0 ? [{ label: 'check-ins due', one: 'check-in due', conditions: [{ field: 'checkin_due', op: 'true' as const }] }] : []),
    ];
    const columns = ['owner', 'part_of', 'progress', 'status', 'checkin_said'];
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('goals', { id, name, conditions, sort: { key: 'ends', dir: 'asc' }, columns, sums, set: 'goals' }, id === 'this-period');
    tab('this-period', 'This period', [open]);
    tab('mine', 'Mine', [open, { field: 'owner', op: 'is', value: ['me'] }]);
    tab('behind', 'Behind', [open, { field: 'status', op: 'is', value: ['Behind', 'At risk'] }]);
    tab('closed', 'Closed', [{ field: 'result', op: 'not-empty' }]);
    // In the owner's Today: a check-in on its day with Check in; the goal's end with Close goal.
    if (every > 0) app.view('goals', { ...calendar({ start: 'checkin_on', upcoming: 'today', button: 'Check in', words: ['checkin_words'] }, [open]), id: 'checkins', name: 'Check-ins', hidden: true });
    app.view('goals', { ...calendar({ start: 'ends', upcoming: true, button: 'Close goal', words: ['checkin_words'] }, [open]), id: 'ends', name: 'Ending', hidden: true });
    if (every > 0) app.view('goals', { id: 'due', name: 'Check-ins due', conditions: [{ field: 'checkin_due', op: 'true' }], sort: { key: 'checkin_on', dir: 'asc' }, hidden: true });

    app.homeTile('goals', { off: true });
    app.homeTile('key-results', { off: true });
    app.homeTile('check-ins', { off: true });
    app.homeTiles('goals', [
      {
        view: 'this-period',
        title: 'This period',
        head: [{ label: 'on average', field: 'progress', per: 'counted', conditions: [open] }, { label: 'gone', field: 'expected', per: 'counted', conditions: [open] }],
        lines: [
          { label: 'On track', conditions: [open, { field: 'status', op: 'is', value: ['On track', 'Done'] }] },
          { label: 'Behind', conditions: [open, { field: 'status', op: 'is', value: ['Behind'] }] },
          { label: 'At risk', conditions: [open, { field: 'status', op: 'is', value: ['At risk'] }], warn: true },
        ],
        empty: 'No goal for this period yet.',
      },
      ...(every > 0 ? [{ view: 'due', title: 'Check-ins due', head: [{ label: '' }], value: 'owner', empty: 'Every goal is checked in.' }] : []),
      { view: 'closed', title: 'Closed', lines: [{ label: 'Complete', conditions: [{ field: 'result', op: 'is' as const, value: ['Complete'] }] }, { label: 'Incomplete', conditions: [{ field: 'result', op: 'is' as const, value: ['Incomplete'] }] }], empty: 'No goal closed yet.' },
    ]);

    const length = period === 'year' ? 'year' : period === 'half' ? 'half year' : 'quarter';
    app.about({
      title: 'Goals',
      what: `Your goals for the ${length}, the key results that measure them, and each check-in.`,
      pieces: ['goals', 'key-results', 'check-ins'],
      glance: ['How far each goal is, and how far it should be by now', 'On track, Behind or At risk, worked out', ...(every > 0 ? ['A check-in in the owner’s Today on its day'] : []), 'Close goal at its end, what is left carried over'],
      how: [
        'Add a goal, whose it is, and the goal it is part of, if any.',
        `Add its key results in its window: what each is measured by, where it starts and where it should get${projects ? ", or the project whose progress it is" : ''}.`,
        `Press Check in${every > 0 ? ` when Today says, every ${every === 7 ? 'week' : every === 14 ? 'two weeks' : 'month'}` : ''}: each key result's value now, how it is going and what changed.`,
        'At its end, press Close goal: Complete or Incomplete, what you learned, and whether what is left carries over.',
      ],
      auto: [
        `A new goal starts and ends with the ${length} it is set in.`,
        "A key result's progress is how far it is from its start to its target; a goal's is its key results' on average, or, with none, the goals that are part of it.",
        'How far it should be by now is the share of its period gone by, a line on its bar; a goal short of it is Behind, a quarter short At risk. The owner can say otherwise at a check-in, until the next one.',
        ...(every > 0 ? [`A goal's check-in comes to its owner's Today ${every} days after the last one.`] : []),
        'Check in writes each value that moved, from what to what, in its history.',
        'Close goal comes to Today on its last day; carried over, it starts again in the next period with the key results not reached, from where they got to.',
        ...(projects ? ["A key result measured by a project's progress takes it from the project's cards."] : []),
        ...(roadmap ? [`A goal shows the ${app.called('roadmap')} cards that point at it.`] : []),
      ],
      work: ['When goals are set, and who agrees them.', 'Who checks in, and who reads the check-ins.', 'When we look back at the goals of the period.'],
    });
  },
};
