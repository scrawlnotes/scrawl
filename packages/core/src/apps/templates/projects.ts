import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition, View } from '../../collection';
import { calendar, checkbox, codeField, day, dayAndTime, formula, inMain, link, nameField, number, openCards, person, rollup, select, symbolOf, text } from '../pieces';
import type { AppTemplate } from '../types';

// Project management (design/scrawl-apps.md 3.4), as Linear and Asana keep it: each project's
// health with each update, its lead reminded in Today when one is due and the project marked when
// it is missing; its milestones with their days, the next one said on its row and in Today on its
// day; a timeline of them all, a bar each from start to end, dragged to move it. Start project
// writes the milestones of the answers between its start and its end; Close project asks how it
// ended and what to do with the cards still open.

const STEPS = ['Kickoff', 'Planning', 'Delivery', 'Review'];
const LINES = ['Material 40%', 'Labour 40%', 'Transport 10%'];
const HEALTH = ['On track', 'At risk', 'Off track'];
const HEALTH_COLORS = { 'On track': 'green', 'At risk': 'yellow', 'Off track': 'red' } as const;
/** Days between updates, by the answer. */
const EVERY: { [answer: string]: number } = { weekly: 7, biweekly: 14 };

/** A standard budget line as the list has it, "Material 40%": its name and its share of the contract; none without a share. */
export function budgetLine(item: string): { name: string; share: number } | null {
  const found = /^(.*?)[\s:]+(\d+(?:[.,]\d+)?)\s*%?$/.exec(item.trim());
  if (!found || !found[1]!.trim()) return item.trim() ? { name: item.trim(), share: 0 } : null;
  return { name: found[1]!.trim(), share: Number(found[2]!.replace(',', '.')) };
}

/** A day as a project says it: "Dec 15". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;
/** Days as a late one says them: "12 days late". */
const lateBy = (d: string) => `text(today() - ${d}) + (today() - ${d} == 1 ? " day late" : " days late")`;

export const projects: AppTemplate = {
  id: 'projects',
  version: 2,
  group: 'work',
  name: 'apps.projects.name',
  short: 'apps.projects.short',
  icon: 'board',
  what: 'apps.projects.what',
  questions: [
    {
      key: 'for',
      kind: 'choice',
      label: 'apps.projects.for',
      options: [
        { value: 'customers', label: 'apps.projects.for.customers' },
        { value: 'internal', label: 'apps.projects.for.internal' },
        { value: 'both', label: 'apps.projects.for.both' },
      ],
      default: 'both',
    },
    { key: 'time', kind: 'yesno', label: 'apps.projects.time', default: false },
    { key: 'steps', kind: 'list', label: 'apps.projects.steps', default: STEPS, help: 'apps.projects.stepsHelp', add: 'apps.projects.addStep' },
    {
      key: 'updates',
      kind: 'choice',
      label: 'apps.projects.updates',
      options: ['weekly', 'biweekly', 'none'].map((value) => ({ value, label: `apps.projects.updates.${value}` as MessageKey })),
      default: 'weekly',
      help: 'apps.projects.updatesHelp',
    },
    { key: 'budget', kind: 'yesno', label: 'apps.projects.budget', default: false, when: ({ chosen }) => !chosen.has('budget'), help: 'apps.projects.budgetHelp' },
    { key: 'lines', kind: 'list', label: 'apps.projects.lines', default: LINES, when: ({ chosen, answers }) => chosen.has('budget') || answers.budget === true, under: 'budget', help: 'apps.projects.linesHelp', add: 'apps.projects.addLine' },
  ],
  money: (answers) => answers.budget === true,
  pieces: (answers) => ['projects', 'work', 'project-updates', 'project-milestones', ...(answers.time === true ? ['time-entries'] : [])],
  menu: (answers) => [
    { role: 'projects', view: 'active', name: 'Projects' },
    { role: 'projects', view: 'timeline', name: 'Timeline' },
    'work',
    ...(answers.time === true ? [{ role: 'time-entries', view: 'week', name: 'Time' }] : []),
  ],
  build(app, answers) {
    const customers = answers.for !== 'internal';
    const billable = answers.for !== 'internal';
    const budget = app.has('budget');
    const time = answers.time === true;
    // With Consulting its time entries are kept as it keeps them; a project has its hours.
    const ownTime = time && !app.has('consulting');
    const every = EVERY[(answers.updates as string | undefined) ?? 'weekly'] ?? 0;
    const work = app.path('work');
    const called = app.called('work');
    const updates = app.called('project-updates');
    const milestones = app.called('project-milestones');
    const steps = ((answers.steps as string[] | undefined) ?? STEPS).map((s) => s.trim()).filter(Boolean);
    const lines = budget ? ((answers.lines as string[] | undefined) ?? LINES).map(budgetLine).filter((l) => l !== null) : [];
    const open: Condition = { field: 'status', op: 'is', value: ['Active', 'On hold'] };

    app.field('projects', nameField());
    app.field('projects', codeField('PRJ-'));
    if (customers) app.field('projects', app.hasPiece('companies') ? link('customer', 'Customer', app.path('companies')) : text('customer', 'Customer'));
    app.field('projects', select('status', 'Status', ['Planned', 'Active', 'On hold', 'Done', 'Cancelled'], { Planned: 'gray', Active: 'blue', 'On hold': 'yellow', Done: 'green', Cancelled: 'red' }, 'Planned'));
    app.field('projects', person('owner', 'Lead', true));
    app.field('projects', day('start', 'Start', true));
    app.field('projects', day('end', 'End'));
    app.field('projects', { ...select('health', 'Health', HEALTH, HEALTH_COLORS, 'On track'), chips: true, help: 'Set with each update' });
    if (budget) app.field('projects', number('contract', 'Contract', { format: app.format(false) }));
    app.field('projects', { key: 'cards', label: 'Cards', type: 'rollup', rollup: { from: work, fn: 'count' } });
    app.field('projects', openCards('open_cards', 'Open cards', work));
    app.field('projects', formula('progress_said', 'Cards done', 'cards > 0 ? text(cards - open_cards) + " of " + text(cards) : "No cards"'));
    app.field('projects', formula('progress', 'Progress', 'cards > 0 ? (cards - open_cards) / cards : 0', { style: 'percent', decimals: 0, bar: true, caption: 'progress_said', tone: { field: 'health', colors: HEALTH_COLORS } }));
    app.field('projects', formula('late', 'Late', '(status == "Active" || status == "On hold") && !empty(end) && end < today()'));
    // Its bar on the timeline: the health of one under way, else its status.
    app.field('projects', { ...formula('tone', 'Shown as', 'status == "Active" || status == "On hold" ? health : status'), colors: { ...HEALTH_COLORS, Planned: 'gray', Done: 'blue', Cancelled: 'gray' } });
    app.field('projects', formula('due_said', 'Due', `status == "Done" ? "Done" : status == "Cancelled" ? "Cancelled" : empty(end) ? "" : late ? ${lateBy('end')} : "Due " + ${short('end')}`));
    // The next milestone not done, written by the rules as one is added, moved or done.
    app.field('projects', text('next_ms', 'Next milestone'));
    app.field('projects', day('next_ms_day', 'Next milestone on'));
    app.field('projects', formula('next_said', 'Next milestone', `empty(next_ms) ? "" : next_ms + " · " + (empty(next_ms_day) ? "" : next_ms_day < today() ? ${lateBy('next_ms_day')} : ${short('next_ms_day')})`));
    app.field('projects', day('last_update', 'Last update'));
    app.field('projects', number('last_progress', 'Progress at the last update', { format: { style: 'percent' } }));
    app.field('projects', day('last_end', 'End at the last update'));
    if (every > 0) {
      app.field('projects', formula('update_on', 'Update due', `status == "Active" ? (empty(last_update) ? start : last_update) + ${every} : null`));
      // Linear's Update missing: a cycle and three days with none.
      app.field('projects', formula('update_missing', 'Update missing', `status == "Active" && !empty(update_on) && update_on + 3 < today()`));
      app.field('projects', formula('update_note', 'Update', `update_missing ? "No update for " + text(today() - (empty(last_update) ? start : last_update)) + " days" : ""`));
      app.field('projects', formula('update_said', 'Last update', `(empty(last_update) ? "no update yet" : update_missing ? "no update for " + text(today() - last_update) + " days" : "last " + ${short('last_update')}) + " · " + health + " · " + text(round(progress * 100)) + "%"`));
    }
    if (ownTime) app.field('projects', rollup('hours', 'Hours', app.path('time-entries'), 'sum', 'hours'));
    if (budget) {
      const main = app.format(false);
      app.field('projects', rollup('budget', 'Budget', app.path('budget-lines'), 'sum', 'planned', [{ field: 'type', op: 'is', value: ['Expense'] }], main));
      const paid = (direction: string) => [{ field: 'direction', op: 'is' as const, value: [direction] }, { field: 'status', op: 'is' as const, value: ['Paid'] }, ...inMain(app)];
      app.field('projects', rollup('spent', 'Spent', app.path('payments'), 'sum', 'amount', paid('Out'), main));
      app.field('projects', rollup('income', 'Income', app.path('payments'), 'sum', 'amount', paid('In'), main));
      app.field('projects', formula('remaining', 'Remaining', 'budget - spent', main));
      const sym = JSON.stringify(symbolOf(app.money.main));
      app.field('projects', formula('budget_said', 'Of the budget', `${sym} + amount(spent) + " of " + ${sym} + amount(budget)`));
      app.field('projects', formula('budget_used', 'Budget', 'budget > 0 ? spent / budget : null', { style: 'percent', decimals: 0, bar: true, caption: 'budget_said', warn: true }));
    }
    // Its window's line: "Active · On track · 7 of 12 cards · due Dec 15 (in 46 days) · next: Design review Nov 12".
    app.field(
      'projects',
      formula(
        'said',
        'Says',
        `status + (status == "Active" || status == "On hold" ? " · " + health : "") + (cards > 0 ? " · " + progress_said + " cards" : "") + (empty(end) || status == "Done" || status == "Cancelled" ? "" : late ? " · " + ${lateBy('end')} : " · due " + ${short('end')} + " (in " + text(end - today()) + (end - today() == 1 ? " day)" : " days)")) + (empty(next_ms) ? "" : " · next: " + next_ms + (empty(next_ms_day) ? "" : " " + ${short('next_ms_day')}))`,
      ),
    );
    app.head('projects', 'said');
    app.formOrder('projects', ['name', ...(customers ? ['customer'] : []), 'owner', 'start', 'end', ...(budget ? ['contract'] : []), 'status', 'health']);
    app.newForm('projects', ['name', ...(customers ? ['customer'] : []), 'owner', 'start', 'end', ...(budget ? ['contract'] : [])]);
    app.block('projects', { block: 'actions', column: 1 });
    if (budget) app.place('projects', 'budget_used', 1);
    app.block('projects', { block: 'linked', collection: app.path('project-updates'), style: 'timeline', title: 'Updates', fields: ['health', 'progress_note'], sort: 'day', fixed: true, column: 2 });
    app.block('projects', { block: 'linked', collection: app.path('project-milestones'), style: 'table', title: 'Milestones', fields: ['name', 'due', 'done'], edit: ['done'], sort: 'due', lines: true, column: 2 });
    app.block('projects', { block: 'cards', board: work, column: 2 });
    if (customers && app.hasPiece('companies')) app.block('companies', { block: 'linked', collection: app.path('projects'), style: 'list', fields: ['status', 'due_said'], column: 3 });
    app.rule('projects', { kind: 'check', name: 'The end is before the start', src: 'check("end", () => empty(end) || end >= start, "The end is before the start")' });

    // The tabs; over them what is active, at risk, late and missing its update.
    const sums = [
      { label: 'active', conditions: [{ field: 'status', op: 'is' as const, value: ['Active'] }] },
      { label: 'at risk', conditions: [open, { field: 'health', op: 'is' as const, value: ['At risk', 'Off track'] }], warn: true as const },
      { label: 'late', conditions: [{ field: 'late', op: 'true' as const }], warn: true as const },
      ...(every > 0 ? [{ label: 'update missing', one: 'update missing', conditions: [{ field: 'update_missing', op: 'true' as const }] }] : []),
    ];
    const columns = [...(customers ? ['customer'] : []), 'owner', 'health', ...(every > 0 ? ['update_note'] : []), 'progress', 'due_said', 'next_said'];
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('projects', { id, name, conditions, sort: { key: 'end', dir: 'asc' }, columns, sums, set: 'projects' }, id === 'active');
    tab('active', 'Active', [{ field: 'status', op: 'is', value: ['Active'] }]);
    tab('planned', 'Planned', [{ field: 'status', op: 'is', value: ['Planned'] }]);
    tab('on-hold', 'On hold', [{ field: 'status', op: 'is', value: ['On hold'] }]);
    tab('mine', 'Mine', [{ field: 'owner', op: 'is', value: ['me'] }, { field: 'status', op: 'is-not', value: ['Done', 'Cancelled'] }]);
    tab('done', 'Done', [{ field: 'status', op: 'is', value: ['Done', 'Cancelled'] }]);
    const timeline: View = {
      id: 'timeline',
      name: 'Timeline',
      kind: 'timeline',
      timeline: { start: 'start', end: 'end', color: 'tone', marks: { collection: app.path('project-milestones'), link: 'project', date: 'due', done: 'done' }, late: 'late' },
      conditions: [{ field: 'status', op: 'is-not', value: ['Cancelled'] }],
      columns: ['owner', 'progress_said'],
      hidden: true,
    };
    app.view('projects', timeline);
    // The lead's update in Today on its day, with Post update; one missing stays.
    if (every > 0) app.view('projects', { ...calendar({ start: 'update_on', upcoming: 'today', button: 'Post update', words: ['update_said'] }, [{ field: 'status', op: 'is', value: ['Active'] }]), id: 'updates', name: 'Updates due', hidden: true });
    app.view('projects', { ...calendar({ start: 'start', end: 'end', color: 'status', upcoming: false }, [open]), id: 'calendar', name: 'Calendar', hidden: true });

    app.field('project-updates', nameField('What happened'));
    app.field('project-updates', link('project', 'Project', app.path('projects')));
    app.field('project-updates', select('health', 'Health', HEALTH, HEALTH_COLORS));
    app.field('project-updates', day('day', 'Day', true));
    app.field('project-updates', person('by', 'By', true));
    app.field('project-updates', text('progress_note', 'Progress'));

    app.field('project-milestones', nameField());
    app.field('project-milestones', link('project', 'Project', app.path('projects')));
    app.field('project-milestones', day('due', 'Due'));
    app.field('project-milestones', checkbox('done', 'Done'));
    app.field('project-milestones', day('done_on', 'Done on'));
    // In Today on its day with Done; one not done stays.
    app.view('project-milestones', { ...calendar({ start: 'due', upcoming: true, button: 'Done', words: ['project'] }, [{ field: 'done', op: 'false' }]), id: 'due', name: 'Due', hidden: true });
    app.view('project-milestones', { id: 'week', name: 'This week', conditions: [{ field: 'done', op: 'false' }, { field: 'this_week', op: 'true' }], sort: { key: 'due', dir: 'asc' }, hidden: true });
    app.field('project-milestones', formula('this_week', 'This week', '!done && !empty(due) && due <= today() + 7'));
    app.field('project-milestones', formula('when_said', 'When', `empty(due) ? "" : done ? "done" : due < today() ? ${lateBy('due')} : due == today() ? "today" : ${short('due')}`));

    // The project's next milestone, worked out again whenever one is written.
    const next = (project: string) => `let next = null
  for (const m of find("${milestones}", { project: ${project} })) {
    if (!m.done && !empty(m.due) && (next == null || m.due < next.due)) next = m
  }
  update(${project}, { next_ms: next == null ? null : next.name, next_ms_day: next == null ? null : next.due })`;
    app.rule('project-milestones', {
      kind: 'onSave',
      name: 'The next one',
      src: `onSave("The next one", () => {
  if (done && empty(done_on)) done_on = today()
  if (!done) done_on = null
  if (!empty(project)) {
    ${next('project')}
  }
})`,
    });
    app.rule('project-milestones', {
      kind: 'action',
      name: 'Done',
      src: `action("Done", { when: () => !done, hint: "", done: () => name + " · done" }, () => {
  done = true
  done_on = today()
  if (!empty(project)) {
    ${next('project')}
  }
})`,
    });

    // Start project: Active, its milestones spread from its start to its end, its budget lines.
    const spread = steps.map((s, i) => `  add("${milestones}", { name: ${JSON.stringify(s)}, project: this, due: empty(end) ? start + ${7 * (i + 1)} : start + round((end - start) * ${i + 1} / ${steps.length}) })`);
    app.rule('projects', {
      kind: 'action',
      name: 'Start project',
      src: `action("Start project", { when: () => status == "Planned", hint: "Only a planned project starts", confirm: true, done: () => name + " · started" }, () => {
  status = "Active"
  if (empty(start)) start = today()
${[...spread, ...lines.map((l) => `  add("${app.called('budget-lines')}", { name: ${JSON.stringify(l.name)}, type: "Expense", planned: contract * ${l.share} / 100 })`)].join('\n')}${steps.length > 0 ? `\n  ${next('this')}` : ''}
})`,
    });
    // Post update: the health and what happened; what moved since the last one is added by itself.
    const moved = `text(round(progress * 100)) + "% done" + (empty(last_progress) ? "" : " (was " + text(round(last_progress * 100)) + "%)") + (!empty(last_end) && !empty(end) && end != last_end ? " · end moved to " + ${short('end')} : "") + (empty(next_ms) ? "" : " · " + next_said)`;
    app.rule('projects', {
      kind: 'action',
      name: 'Post update',
      src: `action("Post update", {
  when: () => status == "Active" || status == "On hold",
  hint: "",
  ask: {
    health: { label: "Health", type: "choice", options: ${JSON.stringify(HEALTH)}, chips: true, default: () => health, required: true },
    note: { label: "What happened", type: "text", lines: true, required: true, note: () => "Added by itself: " + ${moved} + "." },
  },
  done: () => name + " · update posted",
}, () => {
  add("${updates}", { name: input.note, project: this, health: input.health, day: today(), by: me(), progress_note: ${moved} })
  health = input.health
  last_update = today()
  last_progress = progress
  last_end = end
})`,
    });
    app.rule('projects', {
      kind: 'action',
      name: 'Close project',
      src: `action("Close project", {
  when: () => status == "Active" || status == "On hold" || status == "Planned",
  hint: "",
  ask: {
    ended: { label: "How it ended", type: "choice", options: ["Done", "Cancelled"], chips: true, default: "Done", required: true },
    cards: { label: "Cards still open", type: "choice", options: ["Move to Done", "Drop them"], chips: true, default: "Move to Done", note: () => open_cards == 0 ? "None is open." : text(open_cards) + (open_cards == 1 ? " card is" : " cards are") + " still open." },
    note: { label: "Last word", type: "text", lines: true, note: () => "It is the project's last update." },
  },
  done: () => name + (input.ended == "Done" ? " · done" : " · cancelled"),
}, () => {
  status = input.ended
  for (const c of cards("${called}", { project: this })) {
    if (c.column != "Done" && c.column != "Dropped") {
      if (input.cards == "Drop them") move(c, "Dropped")
      else move(c, "Done")
    }
  }
  if (!empty(input.note)) add("${updates}", { name: input.note, project: this, health: health, day: today(), by: me(), progress_note: input.ended == "Done" ? "Closed · done" : "Closed · cancelled" })
})`,
    });

    app.columns('work', [
      ['Backlog', 'backlog'],
      ['To do', 'active'],
      ['In progress', 'active'],
      ['Review', 'review'],
      ['Done', 'done'],
      ['Dropped', 'dropped'],
    ]);
    app.field('work', link('project', 'Project', app.path('projects')));

    if (time) app.field('time-entries', link('project', 'Project', app.path('projects')));
    if (ownTime) {
      app.field('time-entries', { ...nameField('What'), optional: true, help: 'Left empty, Work' });
      app.field('time-entries', person('person', 'Person', true));
      app.field('time-entries', day('date', 'Day', true));
      app.field('time-entries', { ...number('hours', 'Hours'), help: 'Left empty, a timer starts; Stop writes the hours' });
      app.field('time-entries', dayAndTime('started', 'Running since'));
      if (billable) app.field('time-entries', checkbox('billable', 'Billable', true));
      app.field('time-entries', formula('this_week', 'This week', '!empty(date) && week(date) == week(today())'));
      app.field('time-entries', formula('running_said', 'Running', '"running since " + text(started)'));
      app.formOrder('time-entries', ['project', 'name', 'hours', 'date']);
      app.newForm('time-entries', ['project', 'name', 'hours', 'date']);
      app.rule('time-entries', {
        kind: 'onSave',
        name: 'A timer',
        src: `onSave("A timer", () => {
  if (empty(name)) name = "Work"
  if (empty(old.date) && empty(hours) && empty(started)) started = now()
})`,
      });
      app.rule('time-entries', {
        kind: 'action',
        name: 'Stop',
        src: `action("Stop", { when: () => !empty(started), hint: "", done: () => name + " · " + text(hours) + " h" }, () => {
  hours = round((hours || 0) + (now() - started) / 60, 2)
  started = null
})`,
      });
      app.view('time-entries', { id: 'week', name: 'Week', kind: 'sheet', sheet: { row: 'project', day: 'date', value: 'hours' }, conditions: [] }, true);
      app.view('time-entries', { id: 'all', name: 'All', conditions: [], sort: { key: 'date', dir: 'desc' }, columns: ['project', 'person', 'date', 'hours'] });
      app.view('time-entries', { ...calendar({ start: 'started', upcoming: true, button: 'Stop', words: ['project'] }, [{ field: 'started', op: 'not-empty' }]), id: 'running', name: 'Running', hidden: true });
      app.view('time-entries', { id: 'this-week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }], sort: { key: 'date', dir: 'desc' }, hidden: true });
      app.homeTile('time-entries', { off: true });
      app.homeTiles('time-entries', [{ view: 'this-week', title: 'Hours this week', head: [{ label: 'h', field: 'hours' }], lines: [{ label: 'Most on', field: 'hours', by: 'project' }, { label: 'Most by', field: 'hours', by: 'person' }], empty: 'No hours this week.' }]);
      app.block('projects', { block: 'linked', collection: app.path('time-entries'), style: 'table', title: 'Time', fields: ['date', 'person', 'hours'], sort: 'date', dir: 'desc', sums: true, column: 2 });
      app.rule('projects', {
        kind: 'action',
        name: 'Track time',
        src: `action("Track time", {
  when: () => status == "Active" || status == "On hold",
  hint: "",
  ask: {
    note: { label: "What", type: "text" },
    hours: { label: "Hours", type: "number", note: () => "Left empty, a timer starts; Stop writes the hours." },
    date: { label: "Day", type: "date", default: () => today() },
  },
  done: () => name + (empty(input.hours) ? " · timer started" : " · " + text(input.hours) + " h"),
}, () => {
  add("${app.called('time-entries')}", { name: empty(input.note) ? "Work" : input.note, project: this, hours: input.hours, date: empty(input.date) ? today() : input.date, started: empty(input.hours) ? now() : null })
})`,
      });
    }

    // Home, Asana's portfolio: the projects at risk, late or missing their update; this week's milestones.
    app.homeTile('projects', { off: true });
    app.homeTile('project-updates', { off: true });
    app.homeTile('project-milestones', { off: true });
    app.view('projects', { id: 'attention', name: 'Needs attention', conditions: [open], sort: { key: 'end', dir: 'asc' }, hidden: true });
    app.homeTiles('projects', [
      {
        view: 'active',
        title: 'Projects',
        head: [{ label: 'active', conditions: [{ field: 'status', op: 'is', value: ['Active'] }] }, { label: 'at risk', conditions: [open, { field: 'health', op: 'is', value: ['At risk', 'Off track'] }], warn: true }],
        value: 'due_said',
        empty: 'No project under way.',
      },
    ]);
    app.homeTiles('project-milestones', [{ view: 'week', title: 'This week', head: [{ label: 'project-milestones', one: 'milestone' }], value: 'when_said', sub: 'project', empty: 'No milestone this week.' }]);

    app.about({
      title: 'Project management',
      what: `Your projects${customers ? ' and who they are for' : ''}: how each is going, its milestones, the work on it as cards${time ? ', the hours spent' : ''}${budget ? ', and its budget and spending' : ''}.`,
      pieces: ['projects', 'work', ...(time ? ['time-entries'] : [])],
      glance: ['Health, progress, the due day and the next milestone on each row', 'A timeline of them all, a bar dragged to move it', ...(every > 0 ? ['The lead posts an update when Today says'] : []), 'Milestones in Today on their day'],
      how: [
        `Add a project${customers ? ' with its customer' : ''}, its lead, its start and its end${budget ? ', and its contract' : ''}.`,
        `Press Start project when the work begins${steps.length > 0 ? `: its milestones, ${steps.join(', ')}, come with their days, to change in its window` : ''}.`,
        `Add the work as cards on ${called}, each linked to its project, and move them as they go.`,
        ...(every > 0 ? [`Press Post update ${every === 7 ? 'every week' : 'every two weeks'}: how it is going, and what happened.`] : []),
        ...(ownTime ? ['Press Track time for the hours, or to start a timer.'] : []),
        'Press Close project when it is over.',
      ],
      auto: [
        `Start project makes it Active${steps.length > 0 ? ` and adds its milestones, ${steps.join(', ')}, spread from its start to its end` : ''}${lines.length > 0 ? `, and budget lines of ${lines.map((l) => `${l.name} (${l.share}%)`).join(', ')} of the contract` : ''}; it asks first.`,
        'Progress is the share of its cards that are done; a project past its end that is not done is Late, hatched red on the timeline.',
        'Its next milestone not done is said on its row; a milestone comes to Today on its day with Done.',
        ...(every > 0 ? [`An active project's update comes to its lead's Today ${every} days after the last one; three days on, it is marked Update missing.`, 'Post update adds by itself how far it got since the last one and whether its end moved.'] : []),
        'Close project asks how it ended and whether the cards still open are done or dropped.',
        ...(ownTime ? ['A project adds up its hours; a timer running is in Today with Stop.'] : []),
        ...(budget ? ['A project adds up its budget lines and what was paid for it, its bar yellow from 80% and red over it.'] : []),
      ],
      work: ['Planned: agreed, not started. Active: being worked on. On hold: waiting for something. Done: delivered and closed.', 'Who leads a project, and who closes it.', ...(every > 0 ? ['When updates are written, and who reads them.'] : [])],
    });
  },
};
