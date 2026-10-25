import { calendar, dayAndTime, formula, link, nameField, openCards, person, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Incidents and actions (design/more-apps.md 3.5): an outage, a quality problem, an accident or a
// near miss, a complaint that grew, a security breach; how bad, from when to when, why, and what
// is done so that it does not happen again, as cards on a board whose due days are in Upcoming.
// With Support, a request may point at the incident it is part of.

const TYPES = ['Outage', 'Quality', 'Safety', 'Complaint', 'Security'];
const TYPE_COLORS = { Outage: 'red', Quality: 'orange', Safety: 'yellow', Complaint: 'purple', Security: 'blue' } as const;

export const incidents: AppTemplate = {
  id: 'incidents',
  version: 1,
  group: 'work',
  name: 'apps.incidents.name',
  short: 'apps.incidents.short',
  icon: 'warn',
  what: 'apps.incidents.what',
  questions: [
    { key: 'types', kind: 'list', label: 'apps.incidents.types', default: TYPES, add: 'apps.incidents.addType' },
    { key: 'actions', kind: 'yesno', label: 'apps.incidents.actions', default: true, help: 'apps.incidents.actionsHelp' },
  ],
  money: () => false,
  pieces: (answers) => ['incidents', ...(answers.actions !== false ? ['actions'] : [])],
  menu: ['incidents', 'actions'],
  build(app, answers) {
    const types = (answers.types as string[] | undefined) ?? TYPES;
    const actions = app.hasPiece('actions');
    const requests = app.hasPiece('requests');
    const path = app.path('incidents');

    app.field('incidents', nameField('Title'));
    if (types.length > 0) app.field('incidents', select('type', 'Type', types, TYPE_COLORS));
    app.field('incidents', select('severity', 'Severity', ['Critical', 'Major', 'Minor'], { Critical: 'red', Major: 'orange', Minor: 'yellow' }, 'Major'));
    app.field('incidents', { ...dayAndTime('started', 'Started'), default: '=now()' });
    app.field('incidents', dayAndTime('ended', 'Ended'));
    app.field('incidents', formula('duration', 'Duration', 'ended - started', { style: 'duration' }));
    app.field('incidents', select('status', 'Status', ['Open', 'Investigating', 'Resolved', 'Closed'], { Open: 'red', Investigating: 'orange', Resolved: 'green', Closed: 'gray' }, 'Open'));
    app.field('incidents', person('owner', 'Owner', true));
    app.field('incidents', text('root_cause', 'Root cause'));
    // On the calendar from its start to its end, by how bad it was; not in Today.
    app.view('incidents', calendar({ start: 'started', end: 'ended', color: 'severity', upcoming: false }));

    if (actions) {
      app.columns('actions', [
        ['To do', 'active'],
        ['Doing', 'active'],
        ['Done', 'done'],
      ]);
      app.field('actions', link('incident', 'Incident', path));
      app.field('incidents', openCards('open_actions', 'Open actions', app.path('actions')));
    }
    if (requests) app.field('requests', link('incident', 'Incident', path));
    if (actions || requests) app.block('incidents', { block: 'cards' });

    app.rule('incidents', { kind: 'check', name: 'Closed without its root cause', src: 'check("root_cause", () => status != "Closed" || !empty(root_cause), "Closed without its root cause")' });
    app.rule('incidents', {
      kind: 'action',
      name: 'Resolve',
      src: `action("Resolve", { when: () => status == "Open" || status == "Investigating", hint: "Only an open one" }, () => {
  if (empty(ended)) ended = now()
  status = "Resolved"
})`,
    });
    app.rule('incidents', { kind: 'action', name: 'Close', src: 'action("Close", { when: () => status == "Resolved", hint: "Only a resolved one" }, () => {\n  status = "Closed"\n})' });
    if (actions) {
      app.rule('incidents', {
        kind: 'action',
        name: 'Add action',
        src: `action("Add action", {
  ask: {
    title: { label: "What is to be done", type: "text", required: true },
    who: { label: "Who", type: "person" },
    due: { label: "By when", type: "date" },
  },
}, () => {
  card("${app.called('actions')}", { title: input.title, column: "To do", incident: this, assignee: input.who, due: input.due })
})`,
      });
    }

    app.about({
      title: 'Incidents and actions',
      what: `What went wrong${types.length > 0 ? ` (${types.map((t) => t.toLowerCase()).join(', ')})` : ''}: how bad it was, from when to when, why${actions ? ', and what is done so that it does not happen again' : ''}.`,
      pieces: ['incidents', ...(actions ? ['actions'] : [])],
      glance: ['Resolve writes when it ended', 'Closed without its root cause is marked', ...(actions ? ['Add action puts a card on the board', 'The actions’ due days in Upcoming'] : []), ...(requests ? ['A request may point at its incident'] : [])],
      how: [
        'Add an incident as soon as it is noticed: what it is and how bad; it starts now unless you write another time.',
        'Set it Investigating while you look into it; press Resolve when it is over.',
        `Write its root cause and its report in its notes${actions ? '; press Add action for each thing to be done, with who and by when' : ''}.`,
        'Press Close when it is all done.',
        ...(requests ? [`On a ${app.called('requests')} card, pick the incident it is part of.`] : []),
      ],
      auto: [
        'Its duration is from its start to its end.',
        'Resolve writes the time it ended, unless it is written, and makes it Resolved.',
        'An incident closed without its root cause is marked.',
        ...(actions ? [`Add action adds a card to ${app.called('actions')} in To do, linked to the incident, with who and by when; its due day comes to Upcoming. An incident counts its open actions.`] : []),
        ...(requests ? [`An incident shows the ${app.called('requests')} cards that point at it.`] : []),
      ],
      work: ['Who is told when an incident starts, and how.', 'How bad is Critical, Major and Minor for us.', 'Who writes the report, and when we look back at it.'],
    });
  },
};
