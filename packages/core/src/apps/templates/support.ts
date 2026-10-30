import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition } from '../../collection';
import { calendar, codeField, dayAndTime, formula, link, nameField, person, rollup, select, text } from '../pieces';
import { companies, feedback, people } from '../shared';
import type { AppTemplate } from '../types';

// Customer support (design/scrawl-apps.md 3.3), as Help Scout, Zendesk and Freshdesk keep it:
// requests by who has them, Mine, Unassigned, Waiting on customer and Solved, with how many are
// open, unassigned and late over them, each row saying when its reply is due or how late it is.
// A request's window has its conversation day by day in the middle; Reply writes what was said
// with a saved reply and sets how it stands after it, Customer wrote opens it again with its reply
// due. The mail itself is sent and read in the mail program; what was said is kept here.

const CHANNELS = ['email', 'phone', 'chat', 'web form', 'social'];

/** Whether the app keeps feedback: Support's answer, else Product development's. */
export const keepsFeedback = (app: { has(id: 'support' | 'product'): boolean; answers(id: 'support' | 'product'): { [key: string]: unknown } }) =>
  app.has('support') ? app.answers('support').feedback !== false : app.has('product') && app.answers('product').feedback !== false;

const REPLIES: [string, string][] = [
  ['We are on it', "Thanks for writing to us. We have your request and are looking into it; we will write again by [day].\n"],
  ['We need a few more details', 'Thanks for writing to us. To help you, we need a few more details:\n\n- What did you do just before it happened?\n- What did you expect, and what happened instead?\n- A screenshot, if you can.\n'],
  ['Closing this request', 'We have not heard from you for a while, so we are closing this request. Write to us any time and we will open it again.\n'],
];

/** How soon a request is answered, as asked: the hours to its reply, working days skipping the weekend. */
const DUES: { [answer: string]: { hours: number; working: boolean } } = {
  '4h': { hours: 4, working: false },
  '8h': { hours: 8, working: false },
  '1d': { hours: 24, working: true },
  '2d': { hours: 48, working: true },
};

const STATUSES = ['New', 'Open', 'Waiting on customer', 'Solved', 'Closed'];
const OPEN = ['New', 'Open'];
const KINDS = ['Customer', 'Us', 'Note'];

/** A span of minutes as a request says it: "40 min", "2 h", "3 days". */
const span = (minutes: string) => {
  const m = `(${minutes})`;
  return `(${m} < 60 ? text(round(${m})) + " min" : ${m} < 1440 ? text(round(${m} / 60)) + " h" : text(round(${m} / 1440)) + (round(${m} / 1440) == 1 ? " day" : " days"))`;
};

export const support: AppTemplate = {
  id: 'support',
  version: 2,
  group: 'customers',
  name: 'apps.support.name',
  short: 'apps.support.short',
  icon: 'comment',
  what: 'apps.support.what',
  questions: [
    {
      key: 'channels',
      kind: 'multi',
      label: 'apps.support.channels',
      options: CHANNELS.map((value) => ({ value, label: `apps.support.channel.${value === 'web form' ? 'web' : value}` as MessageKey })),
      default: ['email', 'phone', 'chat'],
    },
    {
      key: 'due',
      kind: 'choice',
      label: 'apps.support.due',
      options: Object.keys(DUES).map((value) => ({ value, label: `apps.support.due.${value}` as MessageKey })),
      default: '1d',
      help: 'apps.support.dueHelp',
    },
    { key: 'feedback', kind: 'yesno', label: 'apps.support.feedback', default: true },
    { key: 'replies', kind: 'yesno', label: 'apps.support.replies', default: true },
  ],
  money: () => false,
  pieces: (answers) => ['people', 'requests', 'messages', ...(answers.feedback !== false ? ['feedback'] : []), ...(answers.replies !== false ? ['saved-replies'] : [])],
  menu: [{ role: 'requests', view: 'mine', name: 'Requests' }, 'feedback', 'saved-replies', 'companies', 'people'],
  build(app, answers) {
    companies(app);
    people(app);
    const channels = [...((answers.channels as string[] | undefined) ?? []), ...(app.has('ecommerce') ? ['marketplace questions', 'reviews'] : [])];
    const ideas = answers.feedback !== false;
    const replies = answers.replies !== false;
    const due = DUES[typeof answers.due === 'string' ? answers.due : '1d'] ?? DUES['1d']!;
    const requests = app.path('requests');
    const said = app.path('messages');
    const firms = app.hasPiece('companies');

    app.field('requests', codeField('RQ-'));
    app.field('requests', nameField('Subject'));
    app.field('requests', link('person', 'Customer', app.path('people')));
    if (firms) app.field('requests', { ...link('company', 'Company', app.path('companies')), help: "Left empty, the customer's" });
    if (channels.length > 0) app.field('requests', select('channel', 'Channel', channels, { email: 'yellow', phone: 'blue', chat: 'green', 'web form': 'purple', social: 'pink', 'marketplace questions': 'orange', reviews: 'teal' }, channels[0]));
    app.field('requests', select('type', 'Type', ['Question', 'Problem', 'Request'], { Question: 'blue', Problem: 'red', Request: 'purple' }, 'Question'));
    app.field('requests', select('priority', 'Priority', ['Low', 'Normal', 'High', 'Urgent'], { Low: 'gray', Normal: 'blue', High: 'orange', Urgent: 'red' }, 'Normal'));
    app.field('requests', person('assignee', 'Assignee'));
    app.field('requests', { ...select('status', 'Status', STATUSES, { New: 'blue', Open: 'orange', 'Waiting on customer': 'gray', Solved: 'green', Closed: 'gray' }, 'New'), steps: { end: [], no: [], chip: true } });
    if (ideas) app.field('requests', { ...link('idea', 'Idea', app.path('feedback')), help: 'What the customer asks for, among the ideas' });
    // What the customer wrote first, asked as it is made: written as its first message.
    app.field('requests', text('message', 'What they wrote'));
    app.field('requests', { ...dayAndTime('asked', 'Asked'), default: '=now()' });
    app.field('requests', dayAndTime('reply_due', 'Reply due'));
    app.field('requests', dayAndTime('waiting_since', 'Waiting since'));
    app.field('requests', rollup('messages', 'Messages', said, 'count'));
    app.field('requests', formula('late', 'Late', `(${OPEN.map((s) => `status == "${s}"`).join(' || ')}) && !empty(reply_due) && reply_due < now()`));
    app.field('requests', formula('who', 'From', firms ? '(empty(company) ? "" : company.name) + (!empty(company) && !empty(person) ? " · " : "") + (empty(person) ? "" : person.name)' : 'empty(person) ? "" : person.name'));
    // What its row says of its reply: "Reply due in 3 h", "2 h late", "waiting 2 days".
    app.field(
      'requests',
      formula(
        'reply_said',
        'Reply',
        `late ? ${span('now() - reply_due')} + " late" : (${OPEN.map((s) => `status == "${s}"`).join(' || ')}) && !empty(reply_due) ? "Reply due in " + ${span('reply_due - now()')} : status == "Waiting on customer" && !empty(waiting_since) ? "waiting " + ${span('now() - waiting_since')} : ""`,
      ),
    );
    app.field('requests', formula('said', 'Says', `status + (empty(who) ? "" : " · " + who) + (reply_said == "" ? "" : " · " + (late ? "reply " + reply_said : reply_said)) + (empty(asked) ? "" : " · asked " + ${span('now() - asked')} + " ago")`));
    app.head('requests', 'said', 'status');
    app.formOrder('requests', ['person', ...(firms ? ['company'] : []), ...(channels.length > 0 ? ['channel'] : []), 'type', 'priority', 'assignee', 'message']);
    app.newForm('requests', ['person', ...(firms ? ['company'] : []), ...(channels.length > 0 ? ['channel'] : []), 'type', 'message']);
    app.block('requests', { block: 'actions', column: 2 });
    app.block('requests', { block: 'linked', collection: said, look: 'thread', lines: false, title: 'Conversation', time: 'at', sub: 'text', icon: 'kind', person: 'by', sort: 'at', column: 2, tab: 'Conversation' });
    if (firms) app.block('requests', { block: 'linked', collection: requests, through: 'company', style: 'list', title: 'Their requests', fields: ['status', 'reply_said'], sort: 'asked', dir: 'desc', column: 3, tab: 'Related' });
    if (ideas) app.place('requests', 'idea', 3);

    app.field('messages', { ...nameField('Message'), optional: true });
    app.field('messages', link('request', 'Request', requests));
    app.field('messages', select('kind', 'Kind', KINDS, { Customer: 'blue', Us: 'green', Note: 'yellow' }, 'Customer'));
    app.field('messages', text('by', 'By'));
    app.field('messages', { ...dayAndTime('at', 'At'), default: '=now()' });
    app.field('messages', text('text', 'Text'));

    // The reply is due so many hours after the customer wrote; a day of work skips the weekend.
    const dueFrom = (from: string) =>
      due.working
        ? `(weekday(${from} + hours(${due.hours})) == "Sat" ? ${from} + hours(${due.hours + 48}) : weekday(${from} + hours(${due.hours})) == "Sun" ? ${from} + hours(${due.hours + 24}) : ${from} + hours(${due.hours}))`
        : `${from} + hours(${due.hours})`;
    const add = (kind: string, words: string) => `add("${app.called('messages')}", { request: this, kind: "${kind}", by: ${words}, at: now(), text: input.text })`;
    app.rule('requests', {
      kind: 'onSave',
      name: 'Its reply',
      src: `onSave("Its reply", () => {${firms ? `
  if (empty(company) && !empty(person) && !empty(person.company)) company = person.company` : ''}
  if (empty(old.status) && empty(reply_due) && (${OPEN.map((s) => `status == "${s}"`).join(' || ')})) reply_due = ${dueFrom('(empty(asked) ? now() : asked)')}
  if (!empty(message)) {
    add("${app.called('messages')}", { request: this, kind: "Customer", by: empty(person) ? "Customer" : person.name, at: empty(asked) ? now() : asked, text: message })
    message = null
  }
  if (status == "Waiting on customer" && old.status != "Waiting on customer") waiting_since = now()
  if (status != "Waiting on customer") waiting_since = null
  if (status != "New" && status != "Open") reply_due = null
})`,
    });
    app.rule('requests', {
      kind: 'action',
      name: 'Reply',
      src: `action("Reply", {
  when: () => status != "Closed",
  hint: "",
  ask: {
    text: { label: "Reply", type: "text", lines: true, required: true${replies ? `, snippets: "${app.called('saved-replies')}"` : ''} },
    then: { label: "Then", type: "choice", options: ["Keep open", "Waiting on customer", "Solved"], chips: true, default: "Waiting on customer", note: () => "Send it from your mail; it is kept here, and the reply is no longer due." },
  },
  done: () => code + " · replied",
}, () => {
  ${add('Us', 'me()')}
  if (empty(assignee)) assignee = me()
  status = input.then == "Keep open" ? "Open" : input.then
  reply_due = null
})`,
    });
    app.rule('requests', {
      kind: 'action',
      name: 'Customer wrote',
      src: `action("Customer wrote", {
  hint: "",
  ask: {
    text: { label: "What they wrote", type: "text", lines: true, required: true },
  },
  done: () => code + " · open again",
}, () => {
  ${add('Customer', 'empty(person) ? "Customer" : person.name')}
  status = "Open"
  reply_due = ${dueFrom('now()')}
})`,
    });
    app.rule('requests', {
      kind: 'action',
      name: 'Note',
      src: `action("Note", {
  hint: "",
  ask: {
    text: { label: "Note", type: "text", lines: true, required: true, note: () => "Only your team sees it." },
  },
}, () => {
  ${add('Note', 'me()')}
})`,
    });
    app.rule('requests', { kind: 'action', name: 'Assign to me', src: 'action("Assign to me", { when: () => empty(assignee) && status != "Solved" && status != "Closed", hint: "" }, () => {\n  assignee = me()\n})' });

    // The tabs, Help Scout's: who has it, what waits for the customer, what is solved; over them how many are open, unassigned and late.
    const open: Condition = { field: 'status', op: 'is-not', value: ['Solved', 'Closed'] };
    const sums = [
      { label: 'open', one: 'open', conditions: [open] },
      { label: 'unassigned', one: 'unassigned', conditions: [open, { field: 'assignee', op: 'empty' as const }] },
      { label: 'late', one: 'late', conditions: [{ field: 'late', op: 'true' as const }], warn: true as const },
    ];
    const columns = ['name', ...(channels.length > 0 ? ['channel'] : []), 'who', 'status', 'reply_said', 'assignee'];
    const tab = (id: string, name: string, conditions: Condition[]) => app.view('requests', { id, name, conditions, sort: { key: 'reply_due', dir: 'asc' }, columns, sums, set: 'requests' }, id === 'mine');
    tab('mine', 'Mine', [open, { field: 'assignee', op: 'is', value: ['me'] }]);
    tab('unassigned', 'Unassigned', [open, { field: 'assignee', op: 'empty' }]);
    tab('waiting', 'Waiting on customer', [{ field: 'status', op: 'is', value: ['Waiting on customer'] }]);
    tab('solved', 'Solved', [{ field: 'status', op: 'is', value: ['Solved', 'Closed'] }]);
    app.view('requests', { id: 'open', name: 'Open', conditions: [open], sort: { key: 'reply_due', dir: 'asc' }, hidden: true });
    // A reply due comes to Today with Reply; one late stays in Overdue.
    app.view('requests', { ...calendar({ start: 'reply_due', color: 'priority', upcoming: true, button: 'Reply', words: ['who', 'reply_said'] }, [{ field: 'status', op: 'is', value: OPEN }]), id: 'due', name: 'Reply due', hidden: true });
    app.homeTile('requests', { off: true });
    app.homeTiles('requests', [
      { view: 'open', title: 'Requests', head: [{ label: 'open' }, { label: 'late', conditions: [{ field: 'late', op: 'true' }], warn: true }], value: 'reply_said', empty: 'No open requests.' },
      { view: 'waiting', title: 'Waiting on customer', value: 'reply_said', empty: 'Nothing waits for a customer.' },
    ]);

    for (const role of ['companies', 'people']) if (app.hasPiece(role)) app.block(role, { block: 'linked', collection: requests, style: 'list', title: 'Requests', fields: ['status', 'reply_said'], sort: 'asked', dir: 'desc', add: 'Request', column: 3 });
    if (ideas) {
      feedback(app);
      // An idea says how many requests ask for it and from whom: what is asked most.
      app.field('feedback', rollup('requests', 'Requests', requests, 'count'));
      app.field('feedback', rollup('customers', 'Customers', requests, 'list', firms ? 'company' : 'person'));
      app.field('feedback', formula('asked_said', 'Asked', 'requests == 1 ? "1 request" : text(requests) + " requests"'));
      app.view('feedback', { id: 'asked', name: 'Most asked', conditions: [{ field: 'requests', op: 'gt', value: 0 }], sort: { key: 'requests', dir: 'desc' }, columns: ['requests', 'customers', 'status'], hidden: true });
      if (!app.has('product')) app.homeTile('feedback', { off: true });
      app.homeTiles('feedback', [{ view: 'asked', title: 'Most asked', value: 'asked_said', empty: 'No idea is asked for yet.', of: 'support' }]);
      app.block('feedback', { block: 'linked', collection: requests, style: 'list', title: 'Requests', fields: ['who', 'status'], sort: 'asked', dir: 'desc' });
    }
    if (replies) for (const [name, words] of REPLIES) app.note('saved-replies', name, words);

    const dueSaid = `${due.hours < 24 ? `${due.hours} hours` : `${due.hours / 24} working day${due.hours > 24 ? 's' : ''}`}`;
    app.about({
      title: 'Customer support',
      what: `Every request a customer sends${channels.length > 0 ? ` by ${channels.join(', ')}` : ''}, what was said on it, and when its reply is due${ideas ? '; and what customers ask for, among your ideas' : ''}. The mail itself is sent and read in your mail program.`,
      pieces: ['requests', ...(ideas ? ['feedback'] : []), ...(replies ? ['saved-replies'] : [])],
      glance: ['Over the requests, how many are open, unassigned and late', `A reply is due ${dueSaid} after the customer writes`, 'A reply due comes to Today with Reply', 'Reply sets how it stands after it'],
      how: [
        `Add a request with what the customer wrote; pick the customer${firms ? ', and its company comes with them' : ''}.`,
        `Press Reply when you answer: write it${replies ? ' or pick a saved reply' : ''}, send it from your mail, and say whether you wait for the customer or it is solved.`,
        'Press Customer wrote when they write again; Note for what only your team should see.',
        ...(ideas ? [`When a customer asks for something new, pick the idea in ${app.called('feedback')}, or add one.`] : []),
      ],
      auto: [
        `A request's reply is due ${dueSaid} after the customer writes${due.working ? ', a weekend skipped' : ''}; while you wait for the customer it is not.`,
        'Reply writes what you said in the conversation, gives the request to you when it is no one’s, and sets it Waiting on customer, Solved or open.',
        'Customer wrote opens it again with its reply due.',
        ...(firms ? ['A request takes its customer’s company; it shows the company’s other requests.'] : []),
        ...(ideas ? ['An idea counts the requests that ask for it; the most asked are on Home.'] : []),
      ],
      work: ['Who looks at new requests, and how often.', `We answer within ${dueSaid}.`, 'A request is Closed a week after it is Solved, if the customer does not write again.'],
    });
  },
};
