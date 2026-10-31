import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition } from '../../collection';
import { calendar, codeField, dayAndTime, formula, link, nameField, openCards, person, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Incidents and actions (design/more-apps.md 3.5), as incident.io, FireHydrant and SafetyCulture
// keep them: an outage, a quality problem, an accident or a near miss, a complaint that grew, a
// security breach. Reported in a few words, it is in Today every day with Post update until it is
// resolved, each update written on its timeline; resolved, its review comes to its owner's Today
// a few days on, and what is to be done so that it does not happen again is a card on Actions.
// With Support, a request may point at the incident it is part of, and opens again when it is resolved.

const TYPES = ['Outage', 'Quality', 'Safety', 'Complaint', 'Security'];
const TYPE_COLORS = { Outage: 'red', Quality: 'orange', Safety: 'yellow', Complaint: 'purple', Security: 'blue' } as const;
const STATUSES = ['Investigating', 'Fixing', 'Monitoring', 'Resolved', 'Closed'];
const STATUS_COLORS = { Reported: 'blue', Investigating: 'red', Fixing: 'orange', Monitoring: 'teal', Resolved: 'green', Closed: 'gray' } as const;
const REVIEW = ['2', '5', '10'];

/** Minutes as an incident says them: "40 min", "3 h 20 min", "2 days". */
const span = (minutes: string) => {
  const m = `(${minutes})`;
  return `(${m} < 60 ? text(round(${m})) + " min" : ${m} < 1440 ? text(round(${m} / 60 - 0.5)) + " h" + (round(${m} - 60 * round(${m} / 60 - 0.5)) == 0 ? "" : " " + text(round(${m} - 60 * round(${m} / 60 - 0.5))) + " min") : text(round(${m} / 1440)) + (round(${m} / 1440) == 1 ? " day" : " days"))`;
};

export const incidents: AppTemplate = {
  id: 'incidents',
  version: 3,
  group: 'work',
  name: 'apps.incidents.name',
  short: 'apps.incidents.short',
  icon: 'warn',
  what: 'apps.incidents.what',
  questions: [
    { key: 'types', kind: 'list', label: 'apps.incidents.types', default: TYPES, add: 'apps.incidents.addType' },
    { key: 'actions', kind: 'yesno', label: 'apps.incidents.actions', default: true, help: 'apps.incidents.actionsHelp' },
    {
      key: 'review',
      kind: 'choice',
      label: 'apps.incidents.review',
      options: REVIEW.map((value) => ({ value, label: `apps.incidents.review.${value}` as MessageKey })),
      default: '5',
      help: 'apps.incidents.reviewHelp',
    },
  ],
  money: () => false,
  pieces: (answers) => ['incidents', 'incident-updates', ...(answers.actions !== false ? ['actions'] : [])],
  menu: [{ role: 'incidents', view: 'open', name: 'Incidents' }, 'actions'],
  build(app, answers) {
    const types = (answers.types as string[] | undefined) ?? TYPES;
    const actions = app.hasPiece('actions');
    const requests = app.hasPiece('requests');
    const review = Number(answers.review ?? 5);
    const path = app.path('incidents');
    const updates = app.called('incident-updates');
    const open: Condition = { field: 'open', op: 'true' };
    const settled = 'status == "Resolved" || status == "Closed"';
    const after = [{ field: 'status', op: 'is' as const, value: ['Resolved', 'Closed'] }];

    app.field('incidents', nameField('What happened'));
    app.field('incidents', codeField('INC-'));
    if (types.length > 0) app.field('incidents', { ...select('type', 'Type', types, TYPE_COLORS), chips: true });
    app.field('incidents', { ...select('severity', 'Severity', ['Critical', 'Major', 'Minor'], { Critical: 'red', Major: 'orange', Minor: 'yellow' }, 'Major'), chips: true });
    app.field('incidents', { ...dayAndTime('started', 'Started'), default: '=now()', required: true });
    app.field('incidents', { ...dayAndTime('ended', 'Resolved'), when: after });
    app.field('incidents', { ...select('status', 'Status', STATUSES, STATUS_COLORS, STATUSES[0]), steps: { end: [], no: [], chip: true } });
    app.field('incidents', person('owner', 'Owner', true));
    app.field('incidents', { ...text('root_cause', 'Root cause'), when: after });
    app.field('incidents', { ...text('impact', 'Impact'), when: after });
    app.field('incidents', { ...text('learned', 'What we learned'), when: after });
    app.field('incidents', formula('open', 'Open', `!(${settled})`));
    app.field('incidents', formula('reviewed', 'Reviewed', '!empty(root_cause)'));
    app.field('incidents', formula('to_review', 'To review', 'status == "Resolved" && !reviewed'));
    app.field('incidents', formula('review_on', 'Review on', `to_review && !empty(ended) ? day(ended) + ${review} : null`));
    app.field('incidents', formula('this_month', 'This month', 'month(started) == month(today()) && year(started) == year(today())'));
    app.field('incidents', formula('minutes', 'Minutes', '(empty(ended) ? now() : ended) - started'));
    // "2 h 15 min so far", "Resolved in 3 h 20 min · review due".
    app.field(
      'incidents',
      formula(
        'when_said',
        'When',
        `(${settled}) ? (empty(ended) ? "Resolved" : "Resolved in " + ${span('minutes')}) + (to_review && !empty(review_on) ? (review_on <= today() ? " · review due" : " · review in " + text(review_on - today()) + (review_on - today() == 1 ? " day" : " days")) : "") : ${span('minutes')} + " so far"`,
      ),
    );
    if (requests) app.field('incidents', rollup('request_count', 'Requests', app.path('requests'), 'count'));
    if (actions) app.field('incidents', openCards('open_actions', 'Open actions', app.path('actions')));
    // "Fixing · Critical · 2 h 15 min so far · 5 requests".
    app.field('incidents', formula('said', 'Says', `status + " · " + severity + " · " + when_said${requests ? ' + (request_count > 0 ? " · " + text(request_count) + (request_count == 1 ? " request" : " requests") : "")' : ''}`));
    app.head('incidents', 'said', 'status');
    app.formOrder('incidents', ['name', ...(types.length > 0 ? ['type'] : []), 'severity', 'started', 'ended', 'status', 'owner', 'root_cause', 'impact', 'learned']);
    app.newForm('incidents', ['name', ...(types.length > 0 ? ['type'] : []), 'severity', 'started']);
    app.notes('incidents', 'attach');
    app.block('incidents', { block: 'actions', column: 2 });
    app.block('incidents', { block: 'linked', collection: app.path('incident-updates'), look: 'thread', lines: false, title: 'Timeline', time: 'at', sub: 'text', icon: 'status', person: 'by', sort: 'at', column: 2 });
    if (actions) app.block('incidents', { block: 'cards', board: app.path('actions'), column: 3 });
    if (requests) {
      app.field('requests', link('incident', 'Incident', path));
      app.block('incidents', { block: 'linked', collection: app.path('requests'), style: 'list', title: app.called('requests'), fields: ['status', 'who'], column: 3 });
    }

    // What happened while it lasted, one update after another.
    app.field('incident-updates', { ...nameField('Update'), optional: true });
    app.field('incident-updates', link('incident', 'Incident', path));
    app.field('incident-updates', select('status', 'Status', ['Reported', ...STATUSES], STATUS_COLORS, 'Reported'));
    app.field('incident-updates', text('by', 'By'));
    app.field('incident-updates', { ...dayAndTime('at', 'At'), default: '=now()' });
    app.field('incident-updates', text('text', 'Text'));
    const update = (status: string, words: string) => `add("${updates}", { incident: this, status: ${status}, by: me(), at: now(), text: ${words} })`;

    // Reported: its first line on its timeline, by whoever reported it.
    app.rule('incidents', { kind: 'onSave', name: 'Reported', src: `onSave("Reported", () => {\n  if (empty(old.started) && linked("${updates}").length == 0) ${update('"Reported"', 'name')}\n})` });
    app.rule('incidents', { kind: 'check', name: 'Closed without its review', src: 'check("root_cause", () => status != "Closed" || reviewed, "Closed without its review")' });
    // Resolved: when it ended, and the requests it caused open again for their reply.
    const resolve = `
  if (input.status == "Resolved") {
    if (empty(ended)) ended = now()${requests ? `
    for (const r of linked("${app.called('requests')}")) {
      if (r.status != "Closed") update(r, { status: "Open", reply_due: now() })
    }` : ''}
  }`;
    app.rule('incidents', {
      kind: 'action',
      name: 'Post update',
      src: `action("Post update", {
  when: () => !(${settled}),
  hint: "Only one not resolved",
  ask: {
    status: { label: "Status", type: "choice", options: [${['Investigating', 'Fixing', 'Monitoring', 'Resolved'].map((s) => JSON.stringify(s)).join(', ')}], chips: true, default: () => status, required: true },
    text: { label: "What's happening", type: "text", lines: true, required: true, note: () => input.status == "Resolved" ? "Writes when it ended${requests ? '; its requests open again for their reply' : ''}. Its review comes to Today in ${review} days." : "Written on its timeline; it stays in Today until it is resolved." },
  },
  done: () => name + " · " + input.status,
}, () => {
  status = input.status${resolve}
  ${update('input.status', 'input.text')}
})`,
    });
    app.rule('incidents', {
      kind: 'action',
      name: 'Write review',
      src: `action("Write review", {
  when: () => status == "Resolved",
  hint: "Once it is resolved",
  ask: {
    cause: { label: "Root cause", type: "text", lines: true, default: () => root_cause, required: true },
    impact: { label: "Impact", type: "text", lines: true, default: () => impact },
    learned: { label: "What we learned", type: "text", lines: true, default: () => learned, note: () => "${actions ? 'Add what is to be done on its window with + Add action. ' : ''}Then Close." },
  },
  done: () => name + " · review written",
}, () => {
  root_cause = input.cause
  impact = input.impact
  learned = input.learned
})`,
    });
    app.rule('incidents', {
      kind: 'action',
      name: 'Close',
      src: `action("Close", { when: () => status == "Resolved" && reviewed, hint: "Write its review first", done: () => name + " · closed" }, () => {
  status = "Closed"
  ${update('"Closed"', '"Closed"')}
})`,
    });

    if (actions) {
      app.columns('actions', [
        ['To do', 'active'],
        ['Doing', 'active'],
        ['Done', 'done'],
        ["Won't do", 'dropped'],
      ], { face: ['incident'] });
      app.field('actions', link('incident', 'Incident', path));
      app.rule('incidents', {
        kind: 'action',
        name: 'Add action',
        src: `action("Add action", {
  ask: {
    title: { label: "What is to be done", type: "text", required: true },
    who: { label: "Who", type: "person", default: () => owner },
    due: { label: "By when", type: "date", note: () => "A card on ${app.called('actions')}; its day comes to Today." },
  },
  done: () => input.title,
}, () => {
  card("${app.called('actions')}", { title: input.title, column: "To do", incident: this, assignee: input.who, due: input.due })
})`,
      });
    }

    // The tabs; over them what is open, how many critical, what is to review and the actions open.
    const sums = [
      { label: 'open', conditions: [open] },
      { label: 'critical', conditions: [open, { field: 'severity', op: 'is' as const, value: ['Critical'] }], warn: true as const },
      { label: 'reviews due', one: 'review due', conditions: [{ field: 'to_review', op: 'true' as const }] },
      ...(actions ? [{ label: 'actions open', one: 'action open', field: 'open_actions' }] : []),
    ];
    const columns = [...(types.length > 0 ? ['type'] : []), 'severity', 'status', 'when_said', 'owner', ...(actions ? ['open_actions'] : [])];
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('incidents', { id, name, conditions, sort: { key: 'started', dir: 'desc' }, columns, sums, set: 'incidents' }, id === 'open');
    tab('open', 'Open', [open]);
    tab('to-review', 'To review', [{ field: 'to_review', op: 'true' }]);
    tab('closed', 'Closed', [{ field: 'status', op: 'is', value: ['Closed'] }]);
    tab('all', 'All', []);
    // In Today: one open, every day with Post update; one resolved, its review a few days on with Write review.
    app.view('incidents', { ...calendar({ start: 'started', color: 'severity', upcoming: 'today', button: 'Post update', words: ['said'] }, [open]), id: 'ongoing', name: 'Ongoing', hidden: true });
    app.view('incidents', { ...calendar({ start: 'review_on', color: 'severity', upcoming: true, button: 'Write review', words: ['when_said'] }, [{ field: 'to_review', op: 'true' }]), id: 'reviews', name: 'Reviews', hidden: true });
    app.view('incidents', { ...calendar({ start: 'started', end: 'ended', color: 'severity', upcoming: false }), id: 'calendar', name: 'Calendar', hidden: true });
    app.view('incidents', { id: 'month', name: 'This month', conditions: [{ field: 'this_month', op: 'true' }], sort: { key: 'started', dir: 'desc' }, columns, hidden: true });

    app.homeTile('incidents', { off: true });
    app.homeTiles('incidents', [
      { view: 'open', title: 'Open now', head: [{ label: '', conditions: [open] }, { label: 'critical', conditions: [open, { field: 'severity', op: 'is', value: ['Critical'] }] }], value: 'when_said', empty: 'Nothing is open.' },
      {
        view: 'month',
        title: 'This month',
        head: [{ label: 'incidents', one: 'incident' }],
        lines: [
          ...['Critical', 'Major', 'Minor'].map((s) => ({ label: s, conditions: [{ field: 'severity', op: 'is' as const, value: [s] }] })),
          { label: 'Reviews due', conditions: [{ field: 'to_review', op: 'true' as const }] },
        ],
        empty: 'Nothing happened this month.',
      },
    ]);

    app.about({
      title: 'Incidents and actions',
      what: `What went wrong${types.length > 0 ? ` (${types.map((t) => t.toLowerCase()).join(', ')})` : ''}: how bad it is, what is being done while it lasts, why it happened${actions ? ', and what is done so that it does not happen again' : ''}.`,
      pieces: ['incidents', ...(actions ? ['actions'] : [])],
      glance: ['Report it in a few words', 'In Today every day with Post update while it lasts', 'Its timeline written by the updates', `Write review in Today ${review} days after it is resolved`, ...(actions ? ["Actions To do, Doing, Done and Won't do"] : []), ...(requests ? ['Its requests open again when it is resolved'] : [])],
      how: [
        'Report an incident as soon as it is noticed: what happened, its type and how bad; it starts now, with you as its owner. Put photos and files in its notes.',
        'Press Post update in Today as it goes: Investigating, Fixing, Monitoring, and Resolved when it is over.',
        `When Today asks, press Write review: its root cause, its impact and what we learned${actions ? '; add what is to be done with + Add action' : ''}. Then Close.`,
        ...(requests ? [`On a request in ${app.called('requests')}, pick the incident it is part of.`] : []),
      ],
      auto: [
        'An incident not resolved is in Today every day with Post update; each update is written on its timeline with who and when.',
        `Resolved writes when it ended and how long it took${requests ? `; the requests that point at it open again with their reply due` : ''}. Its review comes to its owner's Today ${review} days later and stays till it is written.`,
        'Close asks for its review first; one closed without it is marked.',
        ...(actions ? [`Add action puts a card on ${app.called('actions')} in To do, linked to the incident; its day comes to Today. An incident counts its open actions.`] : []),
        'Over the list, what is open, how many are critical, what is to review and the actions open.',
      ],
      work: ['Who is told when an incident starts, and how.', 'How bad is Critical, Major and Minor for us.', 'Who writes the review, and when we look back at it.'],
    });
  },
};
