import { calendar, checkbox, codeField, day, formula, inMain, link, nameField, number, openCards, PERCENT, person, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

const STEPS = ['Kickoff', 'Planning', 'Delivery', 'Review'];
const LINES = ['Material 40%', 'Labour 40%', 'Transport 10%'];

/** A standard budget line as the list has it, "Material 40%": its name and its share of the contract; none without a share. */
export function budgetLine(item: string): { name: string; share: number } | null {
  const found = /^(.*?)[\s:]+(\d+(?:[.,]\d+)?)\s*%?$/.exec(item.trim());
  if (!found || !found[1]!.trim()) return item.trim() ? { name: item.trim(), share: 0 } : null;
  return { name: found[1]!.trim(), share: Number(found[2]!.replace(',', '.')) };
}

export const projects: AppTemplate = {
  id: 'projects',
  version: 1,
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
    { key: 'budget', kind: 'yesno', label: 'apps.projects.budget', default: false, when: ({ chosen }) => !chosen.has('budget'), help: 'apps.projects.budgetHelp' },
    { key: 'lines', kind: 'list', label: 'apps.projects.lines', default: LINES, when: ({ chosen, answers }) => chosen.has('budget') || answers.budget === true, under: 'budget', help: 'apps.projects.linesHelp', add: 'apps.projects.addLine' },
  ],
  money: (answers) => answers.budget === true,
  pieces: (answers) => ['projects', 'work', ...(answers.time === true ? ['time-entries'] : [])],
  build(app, answers) {
    const customers = answers.for !== 'internal';
    const billable = answers.for !== 'internal';
    const budget = app.has('budget');
    const time = answers.time === true;
    const work = app.path('work');
    const steps = (answers.steps as string[] | undefined) ?? STEPS;
    const lines = budget ? ((answers.lines as string[] | undefined) ?? LINES).map(budgetLine).filter((l) => l !== null) : [];

    app.field('projects', nameField());
    app.field('projects', codeField('PRJ-'));
    if (customers) app.field('projects', app.hasPiece('companies') ? link('customer', 'Customer', app.path('companies')) : text('customer', 'Customer'));
    app.field('projects', select('status', 'Status', ['Planned', 'Active', 'On hold', 'Done', 'Cancelled'], { Planned: 'gray', Active: 'blue', 'On hold': 'yellow', Done: 'green', Cancelled: 'red' }, 'Planned'));
    app.field('projects', person('owner', 'Owner', true));
    app.field('projects', day('start', 'Start', true));
    app.field('projects', day('end', 'End'));
    app.view('projects', calendar({ start: 'start', end: 'end', color: 'status' }, [{ field: 'status', op: 'is-not', value: ['Done', 'Cancelled'] }]));
    if (budget) app.field('projects', number('contract', 'Contract', { format: app.format(false) }));
    app.field('projects', { key: 'cards', label: 'Cards', type: 'rollup', rollup: { from: work, fn: 'count' } });
    app.field('projects', openCards('open_cards', 'Open cards', work));
    app.field('projects', formula('progress', 'Progress', 'cards > 0 ? (cards - open_cards) / cards : 0', PERCENT));
    app.field('projects', formula('late', 'Late', 'status != "Done" && status != "Cancelled" && end < today()'));
    if (time) {
      app.field('projects', rollup('hours', 'Hours', app.path('time-entries'), 'sum', 'hours'));
      if (billable) app.field('projects', rollup('billable_hours', 'Billable hours', app.path('time-entries'), 'sum', 'hours', [{ field: 'billable', op: 'true' }]));
    }
    if (budget) {
      const main = app.format(false);
      app.field('projects', rollup('budget', 'Budget', app.path('budget-lines'), 'sum', 'planned', [{ field: 'type', op: 'is', value: ['Expense'] }], main));
      const paid = (direction: string) => [{ field: 'direction', op: 'is' as const, value: [direction] }, { field: 'status', op: 'is' as const, value: ['Paid'] }, ...inMain(app)];
      app.field('projects', rollup('spent', 'Spent', app.path('payments'), 'sum', 'amount', paid('Out'), main));
      app.field('projects', rollup('income', 'Income', app.path('payments'), 'sum', 'amount', paid('In'), main));
      app.field('projects', formula('remaining', 'Remaining', 'budget - spent', main));
      app.field('projects', formula('health', 'Health', 'spent > budget ? "Over budget" : "OK"'));
    }
    app.block('projects', { block: 'cards' });
    if (time) app.block('projects', { block: 'linked', collection: app.path('time-entries'), style: 'table', fields: ['date', 'person', 'hours', ...(billable ? ['billable'] : [])], sums: true });
    if (customers && app.hasPiece('companies')) app.block('companies', { block: 'linked', collection: app.path('projects'), style: 'list', fields: ['status'] });

    app.rule('projects', { kind: 'check', name: 'The end is before the start', src: 'check("end", () => end >= start, "The end is before the start")' });
    const started = [
      '  status = "Active"',
      ...steps.map((s) => `  card("${app.called('work')}", { title: name + ": " + ${JSON.stringify(s)}, column: "To do" })`),
      ...lines.map((l) => `  add("${app.called('budget-lines')}", { name: ${JSON.stringify(l.name)}, type: "Expense", planned: contract * ${l.share} / 100 })`),
    ];
    app.rule('projects', {
      kind: 'action',
      name: 'Start project',
      src: `action("Start project", { when: () => status == "Planned", hint: "Only a planned project starts", confirm: true }, () => {
${started.join('\n')}
})`,
    });
    app.rule('projects', {
      kind: 'action',
      name: 'Close project',
      src: `action("Close project", { when: () => status == "Active" || status == "On hold", hint: "Only an active project closes", confirm: true }, () => {
  status = "Done"
  for (const c of cards("${app.called('work')}", { project: this })) {
    if (c.column != "Done") move(c, "Done")
  }
})`,
    });

    app.columns('work', [
      ['Backlog', 'backlog'],
      ['To do', 'active'],
      ['In progress', 'active'],
      ['Review', 'review'],
      ['Done', 'done'],
    ]);
    app.field('work', link('project', 'Project', app.path('projects')));

    if (time) {
      app.field('time-entries', nameField('Note'));
      app.field('time-entries', link('project', 'Project', app.path('projects')));
      app.field('time-entries', person('person', 'Person', true));
      app.field('time-entries', day('date', 'Date', true));
      app.field('time-entries', number('hours', 'Hours', { required: true }));
      if (billable) app.field('time-entries', checkbox('billable', 'Billable', true));
    }

    app.about({
      title: 'Project management',
      what: `Your projects${customers ? ' and who they are for' : ''}, the work on each as cards${time ? ', the hours spent' : ''}${budget ? ', and their budget and spending' : ''}.`,
      pieces: ['projects', 'work', ...(time ? ['time-entries'] : [])],
      glance: [`Start project adds its cards${lines.length > 0 ? ' and budget lines' : ''}`, 'Progress from the cards that are done', ...(time ? ['A project adds up its hours'] : [])],
      how: [
        `Add a project${customers ? ' with its customer' : ''}, its start and its end${budget ? ', and its contract' : ''}.`,
        'Press Start project when the work begins.',
        `Add the work as cards on ${app.called('work')}, each linked to its project, and move them as they go.`,
        ...(time ? ['Log your hours on the project\'s screen.'] : []),
        'Press Close project when it is done.',
      ],
      auto: [
        `Start project makes it Active${steps.length > 0 ? ` and adds a card for each of ${steps.join(', ')}` : ''}${lines.length > 0 ? `, and budget lines of ${lines.map((l) => `${l.name} (${l.share}%)`).join(', ')} of the contract` : ''}; it asks first.`,
        'Close project makes it Done and moves its open cards to Done; it asks first.',
        'Progress is the share of its cards that are done; a project past its end that is not done is Late.',
        'A project that ends before it starts is marked.',
        ...(time ? ['A project adds up its hours.'] : []),
        ...(budget ? ['A project adds up its budget lines and what was paid for it, and says when it is over budget.'] : []),
      ],
      work: ['Planned: agreed, not started. Active: being worked on. On hold: waiting for something. Done: delivered and closed.', 'Who starts a project and who closes it.'],
    });
  },
};
