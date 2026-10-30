import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition, View } from '../../collection';
import { calendar, checkbox, day, dayAndTime, formula, link, multi, nameField, number, person, rollup, select, text } from '../pieces';
import type { AnswerRow, AppTemplate } from '../types';

// Content calendar (design/scrawl-apps.md 3.10), as CoSchedule and Buffer keep it: a calendar of
// what goes out when, colored by its channel; each piece's steps worked out back from its day by
// its type, each in Today on its day; Send for review, Approve and Request changes; Publish on its
// day asks its link. Campaigns on a timeline, Plan content adding their pieces.

const CHANNELS = ['Blog', 'Newsletter', 'LinkedIn', 'X', 'Instagram', 'YouTube', 'Podcast'];
const CHANNEL_COLORS = { Blog: 'green', Newsletter: 'yellow', LinkedIn: 'blue', X: 'gray', Instagram: 'pink', YouTube: 'red', Podcast: 'purple' } as const;
const TYPES = ['Article', 'Post', 'Video', 'Newsletter'];
const STATUSES = ['Idea', 'Writing', 'Review', 'Scheduled', 'Published'];
/** The steps of each type, so many days before it goes out: CoSchedule's task templates. */
const STEPS: AnswerRow[] = [
  { name: 'Outline', type: 'Article', days: 7 },
  { name: 'Draft', type: 'Article', days: 5 },
  { name: 'Images', type: 'Article', days: 3 },
  { name: 'Review', type: 'Article', days: 2 },
  { name: 'Draft', type: 'Post', days: 3 },
  { name: 'Images', type: 'Post', days: 2 },
  { name: 'Review', type: 'Post', days: 1 },
  { name: 'Script', type: 'Video', days: 10 },
  { name: 'Shoot', type: 'Video', days: 6 },
  { name: 'Edit', type: 'Video', days: 3 },
  { name: 'Review', type: 'Video', days: 2 },
  { name: 'Draft', type: 'Newsletter', days: 3 },
  { name: 'Review', type: 'Newsletter', days: 1 },
];

/** A day as a piece says it: "Fri, Nov 6". */
const short = (d: string) => `weekday(${d}) + ", " + monthname(${d}) + " " + text(monthday(${d}))`;

export const content: AppTemplate = {
  id: 'content',
  version: 2,
  group: 'customers',
  name: 'apps.content.name',
  short: 'apps.content.short',
  icon: 'calendar',
  what: 'apps.content.what',
  questions: [
    {
      key: 'channels',
      kind: 'multi',
      label: 'apps.content.channels',
      options: CHANNELS.map((value) => ({ value, label: `apps.content.channel.${value.toLowerCase()}` as MessageKey })),
      default: CHANNELS.slice(0, 3),
    },
    {
      key: 'steps',
      kind: 'rows',
      label: 'apps.content.steps',
      default: STEPS,
      help: 'apps.content.stepsHelp',
      add: 'apps.content.addStep',
      columns: [
        { key: 'name', label: 'apps.content.rowStep', type: 'text' },
        { key: 'type', label: 'apps.content.rowType', type: 'choice', options: TYPES },
        { key: 'days', label: 'apps.content.rowDays', type: 'number', placeholder: 'apps.content.rowDaysEmpty' },
      ],
    },
    { key: 'campaigns', kind: 'yesno', label: 'apps.content.campaigns', default: false },
  ],
  money: () => false,
  pieces: (answers) => ['content', 'content-steps', ...(answers.campaigns === true ? ['campaigns'] : [])],
  menu: (answers) => [
    { role: 'content', view: 'calendar', name: 'Calendar' },
    { role: 'content', view: 'in-progress', name: 'Content' },
    ...(answers.campaigns === true ? [{ role: 'campaigns', view: 'timeline', name: 'Campaigns' }] : []),
  ],
  build(app, answers) {
    const channels = (answers.channels as string[] | undefined) ?? [];
    const rows = ((answers.steps as AnswerRow[] | undefined) ?? STEPS).filter((r) => String(r.name ?? '').trim() && TYPES.includes(String(r.type)));
    const campaigns = answers.campaigns === true;
    const releases = app.hasPiece('releases');
    const budget = campaigns && app.hasPiece('budget-lines');
    const pieces = app.path('content');
    const called = app.called('content');
    const steps = app.called('content-steps');
    const notOut: Condition = { field: 'status', op: 'is-not', value: ['Published'] };

    app.field('content', nameField('Title'));
    if (channels.length > 0) {
      app.field('content', { ...select('channel', 'Channel', channels, CHANNEL_COLORS), chips: true });
      if (channels.length > 1) app.field('content', { ...multi('also', 'Also on', channels, CHANNEL_COLORS), help: 'The same piece on other channels that day' });
    }
    app.field('content', { ...select('type', 'Type', TYPES, { Article: 'teal', Post: 'blue', Video: 'red', Newsletter: 'yellow' }, 'Post'), chips: true });
    app.field('content', { ...select('status', 'Status', STATUSES, { Idea: 'gray', Writing: 'blue', Review: 'yellow', Scheduled: 'purple', Published: 'green' }, 'Idea'), steps: { end: ['Published'], no: [], chip: true } });
    app.field('content', { ...dayAndTime('goes_out', 'Goes out'), help: 'Its steps are worked out back from this day' });
    app.field('content', person('owner', 'By', true));
    app.field('content', person('reviewer', 'Reviewer'));
    if (campaigns) app.field('content', link('campaign', 'Campaign', app.path('campaigns')));
    if (releases) app.field('content', link('release', 'Release', app.path('releases')));
    app.field('content', { ...text('changes', 'What to change'), when: [{ field: 'changes', op: 'not-empty' }] });
    app.field('content', { key: 'link', label: 'Link', type: 'url', when: [{ field: 'status', op: 'is', value: ['Published'] }] });
    app.field('content', { ...day('published_on', 'Published on'), when: [{ field: 'status', op: 'is', value: ['Published'] }] });
    app.field('content', day('review_on', 'Sent for review on'));
    app.field('content', rollup('step_count', 'Steps', app.path('content-steps'), 'count'));
    app.field('content', rollup('steps_done', 'Steps done', app.path('content-steps'), 'count', undefined, [{ field: 'done', op: 'true' }]));
    app.field('content', formula('steps_said', 'Steps', 'step_count == 0 ? "" : text(steps_done) + " of " + text(step_count)'));
    app.field('content', formula('out_said', 'Goes out', `empty(goes_out) ? "No day yet" : ${short('goes_out')}`));
    app.field('content', formula('this_week', 'This week', 'status != "Published" && !empty(goes_out) && day(goes_out) >= today() && day(goes_out) <= today() + 7'));
    app.field('content', formula('published_month', 'Published this month', 'status == "Published" && !empty(published_on) && month(published_on) == month(today()) && year(published_on) == year(today())'));
    app.field('content', formula('where', 'Channels', channels.length > 1 ? 'empty(channel) ? "" : channel + (empty(also) ? "" : ", " + text(also))' : channels.length > 0 ? 'empty(channel) ? "" : channel' : '""'));
    app.field('content', formula('review_said', 'Review', 'empty(owner) ? "sent for review" : "sent by " + text(owner)'));
    // Its window's line: "Review · LinkedIn, Instagram · goes out Fri, Nov 6 (in 7 days) · 3 of 4 steps".
    app.field(
      'content',
      formula(
        'said',
        'Says',
        `status + (where == "" ? "" : " · " + where) + (empty(goes_out) ? "" : status == "Published" ? " · out " + ${short('goes_out')} : " · goes out " + ${short('goes_out')} + (day(goes_out) < today() ? "" : day(goes_out) == today() ? " (today)" : " (in " + text(day(goes_out) - today()) + (day(goes_out) - today() == 1 ? " day)" : " days)"))) + (steps_said == "" ? "" : " · " + steps_said + " steps")`,
      ),
    );
    app.head('content', 'said', 'status');
    app.formOrder('content', ['name', ...(channels.length > 0 ? ['channel'] : []), ...(channels.length > 1 ? ['also'] : []), 'type', 'goes_out', 'owner', 'reviewer', ...(campaigns ? ['campaign'] : []), ...(releases ? ['release'] : []), 'status', 'changes', 'link']);
    app.newForm('content', ['name', ...(channels.length > 0 ? ['channel'] : []), 'type', 'goes_out', 'owner', ...(campaigns ? ['campaign'] : [])]);
    app.block('content', { block: 'actions', column: 1 });
    app.block('content', { block: 'linked', collection: app.path('content-steps'), style: 'table', title: 'Steps', fields: ['name', 'due', 'done'], edit: ['done'], sort: 'due', lines: true, column: 2 });

    // The calendar it opens on, by the day it goes out, in its channel's color; the tabs by stage.
    const sums = [
      { label: 'going out this week', conditions: [{ field: 'this_week', op: 'true' as const }] },
      { label: 'in review', conditions: [{ field: 'status', op: 'is' as const, value: ['Review'] }] },
    ];
    const columns = ['status', ...(channels.length > 0 ? ['where'] : []), 'out_said', 'steps_said', 'owner'];
    const cal: View = { ...calendar({ start: 'goes_out', ...(channels.length > 0 && { color: 'channel' }), upcoming: false }), id: 'calendar', name: 'Calendar', sums, set: 'content' };
    app.view('content', cal, true);
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('content', { id, name, conditions, sort: { key: 'goes_out', dir: 'asc' }, columns, sums, counts: 'status', set: 'content' });
    tab('ideas', 'Ideas', [{ field: 'status', op: 'is', value: ['Idea'] }]);
    tab('in-progress', 'In progress', [{ field: 'status', op: 'is', value: ['Writing', 'Review'] }]);
    tab('scheduled', 'Scheduled', [{ field: 'status', op: 'is', value: ['Scheduled'] }]);
    tab('published', 'Published', [{ field: 'status', op: 'is', value: ['Published'] }]);
    tab('mine', 'Mine', [{ field: 'owner', op: 'is', value: ['me'] }, notOut]);
    // In Today: a piece sent for review with Approve, first, as a record comes by its first calendar; its day with Publish.
    app.view('content', { ...calendar({ start: 'review_on', upcoming: 'today', button: 'Approve', words: ['review_said'] }, [{ field: 'status', op: 'is', value: ['Review'] }]), id: 'review', name: 'To review', hidden: true });
    app.view('content', { ...calendar({ start: 'goes_out', ...(channels.length > 0 && { color: 'channel' }), upcoming: true, button: 'Publish', words: ['where'] }, [{ field: 'status', op: 'is', value: ['Writing', 'Review', 'Scheduled'] }]), id: 'going-out', name: 'Going out', hidden: true });
    app.view('content', { id: 'week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }], sort: { key: 'goes_out', dir: 'asc' }, hidden: true });
    app.view('content', { id: 'to-review', name: 'In review', conditions: [{ field: 'status', op: 'is', value: ['Review'] }], sort: { key: 'review_on', dir: 'asc' }, hidden: true });
    app.view('content', { id: 'month', name: 'This month', conditions: [{ field: 'published_month', op: 'true' }], sort: { key: 'published_on', dir: 'desc' }, hidden: true });

    // A piece's steps, each so many days before it goes out; its day moved, they move with it.
    app.field('content-steps', nameField('Step'));
    app.field('content-steps', link('piece', 'Piece', pieces));
    app.field('content-steps', { ...number('days_before', 'Days before'), help: 'Its day is the day the piece goes out, less these' });
    app.field('content-steps', formula('due', 'Due', 'empty(piece) || empty(piece.goes_out) ? null : day(piece.goes_out) - (days_before || 0)'));
    app.field('content-steps', checkbox('done', 'Done'));
    app.field('content-steps', day('done_on', 'Done on'));
    app.view('content-steps', { ...calendar({ start: 'due', upcoming: true, button: 'Done', words: ['piece'] }, [{ field: 'done', op: 'false' }]), id: 'due', name: 'Due', hidden: true });
    app.rule('content-steps', { kind: 'onSave', name: 'Done on', src: 'onSave("Done on", () => {\n  if (done && empty(done_on)) done_on = today()\n  if (!done) done_on = null\n})' });
    app.rule('content-steps', { kind: 'action', name: 'Done', src: 'action("Done", { when: () => !done, hint: "", done: () => name + " · done" }, () => {\n  done = true\n  done_on = today()\n})' });

    const byType = TYPES.map((type) => {
      const own = rows.filter((r) => r.type === type);
      if (own.length === 0) return '';
      return `  if (type == "${type}") {\n${own.map((r) => `    add("${steps}", { name: ${JSON.stringify(String(r.name).trim())}, piece: this, days_before: ${Number(r.days) || 0} })`).join('\n')}\n  }`;
    }).filter(Boolean);
    if (byType.length > 0) {
      app.rule('content', {
        kind: 'onSave',
        name: 'Its steps',
        src: `onSave("Its steps", () => {
  if (step_count == 0 && !empty(type) && type != old.type && status != "Published") {
${byType.join('\n')}
  }
})`,
      });
    }
    app.rule('content', {
      kind: 'action',
      name: 'Send for review',
      src: `action("Send for review", {
  when: () => status == "Idea" || status == "Writing",
  hint: "",
  ask: { who: { label: "Reviewer", type: "person", default: () => reviewer, required: true } },
  done: () => name + " · sent for review",
}, () => {
  status = "Review"
  reviewer = input.who
  review_on = today()
  changes = null
})`,
    });
    app.rule('content', {
      kind: 'action',
      name: 'Approve',
      src: `action("Approve", { when: () => status == "Review", hint: "", done: () => name + " · approved" }, () => {
  status = "Scheduled"
  changes = null
})`,
    });
    app.rule('content', {
      kind: 'action',
      name: 'Request changes',
      src: `action("Request changes", {
  when: () => status == "Review",
  hint: "",
  ask: { what: { label: "What to change", type: "text", lines: true, required: true, note: () => "It goes back to Writing" + (empty(owner) ? "" : ", to " + text(owner)) + "." } },
  done: () => name + " · back to writing",
}, () => {
  status = "Writing"
  changes = input.what
  review_on = null
})`,
    });
    app.rule('content', {
      kind: 'action',
      name: 'Publish',
      src: `action("Publish", {
  when: () => status != "Published",
  hint: "",
  ask: {
    link: { label: "Link", type: "text", note: () => "Where it is out" },
    on: { label: "Out on", type: "date", default: () => today() },
  },
  done: () => name + " · published",
}, () => {
  status = "Published"
  if (!empty(input.link)) link = input.link
  published_on = empty(input.on) ? today() : input.on
  changes = null
})`,
    });

    if (campaigns) {
      app.field('campaigns', nameField());
      app.field('campaigns', text('goal', 'Goal'));
      app.field('campaigns', person('owner', 'Owner', true));
      app.field('campaigns', day('start', 'Start', true));
      app.field('campaigns', day('end', 'End'));
      app.field('campaigns', select('status', 'Status', ['Planned', 'Running', 'Done'], { Planned: 'gray', Running: 'blue', Done: 'green' }, 'Planned'));
      app.field('campaigns', rollup('pieces', 'Pieces', pieces, 'count'));
      app.field('campaigns', rollup('out', 'Out', pieces, 'count', undefined, [{ field: 'status', op: 'is', value: ['Published'] }]));
      app.field('campaigns', formula('out_said', 'Out', 'pieces == 0 ? "No pieces" : text(out) + " of " + text(pieces) + " out"'));
      app.field('campaigns', formula('late', 'Late', 'status != "Done" && !empty(end) && end < today()'));
      if (budget) {
        app.field('campaigns', link('budget_line', 'Budget line', app.path('budget-lines')));
        app.field('campaigns', { key: 'spent', label: 'Spent', type: 'lookup', lookup: { link: 'budget_line', field: 'actual' } });
      }
      app.block('campaigns', { block: 'actions', column: 1 });
      app.block('campaigns', { block: 'linked', collection: pieces, style: 'list', title: called, fields: ['out_said', 'status'], sort: 'goes_out', column: 2 });
      app.rule('campaigns', { kind: 'check', name: 'The end is before the start', src: 'check("end", () => empty(end) || end >= start, "The end is before the start")' });
      app.rule('campaigns', {
        kind: 'action',
        name: 'Plan content',
        src: `action("Plan content", {
  hint: "",
  ask: {
    title: { label: "Title", type: "text", required: true },${channels.length > 0 ? `\n    channel: { label: "Channel", type: "choice", options: ${JSON.stringify(channels)}, chips: true },` : ''}
    type: { label: "Type", type: "choice", options: ${JSON.stringify(TYPES)}, chips: true, default: "Post" },
    day: { label: "Goes out on", type: "date", time: true },
  },
  done: () => name + " · " + input.title + " planned",
}, () => {
  add("${called}", { name: input.title, ${channels.length > 0 ? 'channel: input.channel, ' : ''}type: input.type, goes_out: input.day, campaign: this, status: "Writing" })
  if (status == "Planned") status = "Running"
})`,
      });
      app.view('campaigns', { id: 'timeline', name: 'Timeline', kind: 'timeline', timeline: { start: 'start', end: 'end', color: 'status', marks: { collection: pieces, link: 'campaign', date: 'goes_out', done: 'out_flag' }, late: 'late' }, conditions: [], columns: ['owner', 'out_said'], set: 'campaigns' }, true);
      app.field('content', formula('out_flag', 'Out', 'status == "Published"'));
      app.view('campaigns', { id: 'running', name: 'Running', conditions: [{ field: 'status', op: 'is', value: ['Running'] }], sort: { key: 'start', dir: 'asc' }, columns: ['start', 'end', 'out_said', 'owner'], set: 'campaigns' });
      app.view('campaigns', { id: 'planned', name: 'Planned', conditions: [{ field: 'status', op: 'is', value: ['Planned'] }], sort: { key: 'start', dir: 'asc' }, columns: ['start', 'end', 'out_said', 'owner'], set: 'campaigns' });
      app.view('campaigns', { id: 'done', name: 'Done', conditions: [{ field: 'status', op: 'is', value: ['Done'] }], sort: { key: 'end', dir: 'desc' }, columns: ['start', 'end', 'out_said', 'owner'], set: 'campaigns' });
      app.homeTile('campaigns', { off: true });
    }
    if (releases) app.block('releases', { block: 'linked', collection: pieces, style: 'list', title: called, fields: ['out_said', 'status'], sort: 'goes_out', column: 2 });

    // Home: what goes out this week, what is in review, what went out this month and where.
    app.homeTile('content', { off: true });
    app.homeTile('content-steps', { off: true });
    app.homeTiles('content', [
      { view: 'week', title: 'This week', head: [{ label: 'going out' }], value: 'out_said', sub: 'where', empty: 'Nothing goes out this week.' },
      { view: 'to-review', title: 'In review', head: [{ label: '' }], value: 'review_said', empty: 'Nothing waits for review.' },
      {
        view: 'month',
        title: 'This month',
        head: [{ label: 'published' }],
        lines: channels.length > 0 ? channels.map((c) => ({ label: c, conditions: [{ field: 'channel', op: 'is' as const, value: [c] }] })) : [{ label: 'Published', conditions: [] }],
        empty: 'Nothing published this month.',
      },
    ]);

    const typed = TYPES.filter((t) => rows.some((r) => r.type === t));
    app.about({
      title: 'Content calendar',
      what: `What you will publish${channels.length > 0 ? ` on ${channels.join(', ')}` : ''}, when, and the steps before it${campaigns ? ', in campaigns' : ''}.`,
      pieces: ['content', ...(campaigns ? ['campaigns'] : [])],
      glance: ['A calendar of what goes out, by channel', 'Each piece’s steps back from its day, in Today', 'Send for review, Approve, Publish', ...(campaigns ? ['Campaigns on a timeline'] : [])],
      how: [
        `Add a piece with its${channels.length > 0 ? ' channel,' : ''} type and the day it goes out${typed.length > 0 ? `; its steps come by themselves` : ''}.`,
        'Tick each step as it is done, in its window or in Today.',
        'Press Send for review; the reviewer presses Approve, or Request changes with what to change.',
        'On its day, press Publish and paste its link.',
        ...(campaigns ? ['Add a campaign with its dates, and press Plan content on it to add its pieces.'] : []),
      ],
      auto: [
        ...(typed.length > 0 ? [`A new piece of type ${typed.join(', ')} gets that type's steps, each so many days before it goes out; moving its day moves them.`] : []),
        'A step comes to Today on its day with Done, and stays until it is done.',
        "A piece's day comes to Upcoming, and to Today with Publish; one sent for review comes to Today with Approve.",
        ...(campaigns ? ['Plan content adds a piece to the campaign, in Writing; a campaign counts its pieces and those out.'] : []),
        ...(budget ? ['A campaign shows what was paid on its budget line.'] : []),
        ...(releases ? ['A release shows the pieces that tell about it.'] : []),
      ],
      work: ['How often we publish on each channel.', 'Who reads a piece before it goes out.', 'When a piece is ready: its steps done and approved.'],
    });
  },
};
