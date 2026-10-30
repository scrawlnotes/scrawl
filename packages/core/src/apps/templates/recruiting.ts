import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition } from '../../collection';
import { calendar, codeField, day, dayAndTime, formula, link, nameField, number, openCards, person, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { stageColumns, stageHints } from './crm';

// Recruiting (design/scrawl-apps.md 3.8), as Workable and Greenhouse keep it: a candidate is one
// card on Hiring, its position and source on its face with its next interview, or that it has
// none; Rejected asks why. The card's window has its position's Schedule interview, Make offer and
// Hire, the candidate given. An interview over comes to Today with Write feedback: a score, how it
// went and what was learned. A position counts its candidates at each stage and the ones hired.

const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
const SOURCES = ['Referral', 'LinkedIn', 'Job boards', 'Website', 'Agency'];
const STEPS = ['Contract signed', 'Equipment ready', 'Accounts opened', 'First week planned'];
const KINDS = ['Phone screen', 'Technical', 'Culture', 'Final'];
const VERDICTS = ['Definitely not', 'No', 'Yes', 'Strong yes'];
const ICONS = { 'Phone screen': '📞', Technical: '💻', Culture: '🤝', Final: '⭐' };
const REASONS = ['Not a fit', 'Took another offer', 'Withdrew', 'Salary', 'No answer'];

/** What each of the usual stages means; another stage is the team's to say. */
const MEANS: { [stage: string]: string } = {
  Applied: 'they sent their CV; nobody has looked at it yet.',
  Screening: 'we are reading their CV, and may call them.',
  Interview: 'interviews are set or held.',
  Offer: 'they have our offer.',
  Hired: 'they said yes; press Hire on their card.',
  Rejected: 'it went no further; it asks why.',
};

const sourceKey = (source: string) => `apps.recruiting.source.${source.toLowerCase().replace(/\s.*$/, '')}` as MessageKey;

export const recruiting: AppTemplate = {
  id: 'recruiting',
  version: 2,
  group: 'work',
  name: 'apps.recruiting.name',
  short: 'apps.recruiting.short',
  icon: 'clip',
  what: 'apps.recruiting.what',
  questions: [
    { key: 'stages', kind: 'list', label: 'apps.recruiting.stages', default: STAGES, help: 'apps.recruiting.stagesHelp', add: 'apps.recruiting.addStage', hints: stageHints },
    { key: 'sources', kind: 'multi', label: 'apps.recruiting.sources', options: SOURCES.map((value) => ({ value, label: sourceKey(value) })), default: SOURCES.slice(0, 4) },
    { key: 'interviews', kind: 'yesno', label: 'apps.recruiting.interviews', default: true },
    { key: 'scores', kind: 'yesno', label: 'apps.recruiting.scores', default: true, when: ({ answers }) => answers.interviews !== false, under: 'interviews' },
    { key: 'steps', kind: 'list', label: 'apps.recruiting.steps', default: STEPS, help: 'apps.recruiting.stepsHelp', add: 'apps.recruiting.addStep' },
  ],
  money: () => true,
  pieces: (answers) => ['positions', 'hiring', ...(answers.interviews !== false ? ['interviews'] : [])],
  menu: ['hiring', { role: 'positions', view: 'open', name: 'Positions' }, 'interviews'],
  build(app, answers) {
    const listed = (answers.stages as string[] | undefined) ?? [];
    // A board needs its stages: none given, it has the usual ones.
    const stages = listed.length > 0 ? listed : STAGES;
    const columns = stageColumns(stages);
    const hired = columns.find(([, kind]) => kind === 'done')![0];
    const open = columns.filter(([, kind]) => kind !== 'done' && kind !== 'dropped').map(([name]) => name);
    const offer = open.find((s) => /^offer/i.test(s));
    const sources = (answers.sources as string[] | undefined) ?? [];
    const interviews = answers.interviews !== false;
    const scores = interviews && answers.scores !== false;
    const steps = (answers.steps as string[] | undefined) ?? STEPS;
    const team = app.hasPiece('employees');
    const hiring = app.path('hiring');
    const board = app.called('hiring');
    const held = interviews ? app.path('interviews') : '';
    const money = app.format(false);

    // A position: how many it needs, and its candidates at each stage.
    app.field('positions', nameField('Title'));
    app.field('positions', codeField('POS-'));
    app.field('positions', text('team', 'Team'));
    app.field('positions', text('location', 'Location'));
    app.field('positions', select('type', 'Type', ['Full-time', 'Part-time', 'Contract', 'Intern'], { 'Full-time': 'blue', 'Part-time': 'teal', Contract: 'purple', Intern: 'yellow' }, 'Full-time'));
    app.field('positions', number('openings', 'Openings', { default: 1 }));
    app.field('positions', person('owner', 'Hiring manager', true));
    app.field('positions', select('status', 'Status', ['Open', 'On hold', 'Filled', 'Closed'], { Open: 'green', 'On hold': 'yellow', Filled: 'blue', Closed: 'gray' }, 'Open'));
    app.field('positions', day('opened', 'Opened', true));
    app.field('positions', { key: 'applicants', label: 'Applicants', type: 'rollup', rollup: { from: hiring, fn: 'count' } });
    app.field('positions', openCards('in_process', 'In the pipeline', hiring));
    app.field('positions', { key: 'hired', label: 'Hired', type: 'rollup', rollup: { from: hiring, fn: 'count', won: true } });
    app.field('positions', formula('left', 'Left to hire', 'openings - hired'));
    open.forEach((stage, i) => app.field('positions', { key: `at_${i + 1}`, label: stage, type: 'rollup', rollup: { from: hiring, fn: 'count', where: [{ field: 'column', op: 'is', value: [stage] }] } }));
    // "5 applied · 1 screening · 1 interview": the stages with someone at them.
    const at = (i: number) => `at_${i + 1}`;
    const pipeline = open
      .map((stage, i) => `${i > 0 ? `(${open.slice(0, i).map((_, j) => at(j)).join(' + ')} > 0 && ${at(i)} > 0 ? " · " : "") + ` : ''}(${at(i)} > 0 ? text(${at(i)}) + ${JSON.stringify(` ${stage.toLowerCase()}`)} : "")`)
      .join(' + ');
    app.field('positions', formula('pipeline_said', 'Pipeline', `${pipeline || '""'} + (hired > 0 ? (in_process > 0 ? " · " : "") + text(hired) + " hired" : "")`));
    app.field('positions', formula('hired_said', 'Hired', 'text(hired) + " of " + text(openings)'));
    app.field('positions', formula('open_said', 'Open', 'status == "Open" ? (empty(opened) ? "" : text(today() - opened) + (today() - opened == 1 ? " day" : " days")) : status'));
    app.field('positions', formula('said', 'Says', '(empty(team) ? "" : team + " · ") + text(openings) + (openings == 1 ? " opening" : " openings") + " · " + (empty(pipeline_said) ? "nobody yet" : pipeline_said)'));
    app.head('positions', 'said');
    app.newForm('positions', ['name', 'team', 'location', 'type', 'openings', 'owner']);
    app.block('positions', { block: 'cards', column: 2 });

    // The candidate is the card: how to reach them, where they came from, the offer and why not.
    app.columns('hiring', columns, {
      dropAsks: 'reason',
      face: ['position', ...(sources.length > 0 ? ['source'] : [])],
      ...(interviews && {
        next: { collection: held, day: 'date', done: 'done', say: 'type', none: 'No interview planned' },
        blocks: [{ block: 'linked', collection: held, look: 'days', title: 'Interviews', time: 'date', icon: 'type', icons: ICONS, sub: 'said', sort: 'date', dir: 'desc', button: 'Schedule interview' }],
      }),
      press: { link: 'position', buttons: [...(interviews ? ['Schedule interview'] : []), ...(offer ? ['Make offer'] : [])], card: 'candidate', won: 'Hire', lost: 'Reject' },
    });
    app.field('hiring', { ...link('position', 'Position', app.path('positions')), required: true });
    app.field('hiring', { key: 'email', label: 'Email', type: 'email' });
    app.field('hiring', { key: 'phone', label: 'Phone', type: 'phone' });
    app.field('hiring', { key: 'linkedin', label: 'LinkedIn', type: 'url' });
    if (sources.length > 0) app.field('hiring', select('source', 'Source', sources, { Referral: 'purple', LinkedIn: 'blue', 'Job boards': 'teal', Website: 'green', Agency: 'orange' }));
    if (offer) app.field('hiring', number('offer', 'Offer', { format: money }));
    app.field('hiring', day('starts', 'Starts'));
    app.field('hiring', select('reason', 'Rejected because', REASONS));

    const candidate = `candidate: { label: "Candidate", type: "link", collection: "${board}", within: "position", required: true }`;
    if (interviews) {
      app.field('interviews', nameField('Title'));
      app.field('interviews', link('candidate', 'Candidate', hiring));
      app.field('interviews', link('position', 'Position', app.path('positions')));
      app.field('interviews', { ...dayAndTime('date', 'When', true), required: true });
      app.field('interviews', select('type', 'Type', KINDS, { 'Phone screen': 'gray', Technical: 'blue', Culture: 'purple', Final: 'green' }, KINDS[0]));
      app.field('interviews', person('interviewer', 'Interviewer', true));
      app.field('interviews', { key: 'done', label: 'Feedback written', type: 'checkbox' });
      if (scores) {
        app.field('interviews', number('score', 'Score'));
        app.field('interviews', select('verdict', 'Overall', VERDICTS, { 'Definitely not': 'red', No: 'orange', Yes: 'teal', 'Strong yes': 'green' }));
        app.rule('interviews', { kind: 'check', name: 'A score is from 1 to 5', src: 'check("score", () => empty(score) || (score >= 1 && score <= 5), "A score is from 1 to 5")' });
      }
      app.field('interviews', text('takeaways', 'Key take-aways'));
      app.field('interviews', formula('coming', 'Coming', '!done && day(date) >= today()'));
      app.field('interviews', formula('due', 'Feedback due', '!done && date < now()'));
      // Its line on the candidate: "Mert Yılmaz · 4 · Strong yes · Clear on trade-offs".
      app.field('interviews', formula('said', 'Says', `(empty(interviewer) ? "" : interviewer)${scores ? ' + (empty(score) ? "" : " · " + text(score)) + (empty(verdict) ? "" : " · " + verdict)' : ''} + (empty(takeaways) ? (done ? "" : " · planned") : " · " + takeaways)`));
      app.formOrder('interviews', ['name', 'candidate', 'position', 'date', 'type', 'interviewer', ...(scores ? ['score', 'verdict'] : []), 'takeaways']);
      app.view('interviews', calendar({ start: 'date', color: 'type', upcoming: false }), true);
      // Its time in Today, and after it, late, till its feedback is written.
      app.view('interviews', { ...calendar({ start: 'date', color: 'type', upcoming: true, button: 'Write feedback', words: ['position'] }, [{ field: 'done', op: 'false' }]), id: 'feedback', name: 'Feedback', hidden: true });
      app.view('interviews', { id: 'week', name: 'Coming', conditions: [{ field: 'coming', op: 'true' }], sort: { key: 'date', dir: 'asc' }, columns: ['candidate', 'type', 'date'], hidden: true });
      app.view('interviews', { id: 'due', name: 'Feedback due', conditions: [{ field: 'due', op: 'true' }], sort: { key: 'date', dir: 'asc' }, columns: ['candidate', 'type', 'date'], hidden: true });
      app.rule('interviews', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(candidate)) name = type + " · " + candidate.name\n})' });
      app.rule('interviews', {
        kind: 'action',
        name: 'Write feedback',
        src: `action("Write feedback", {
  when: () => !done,
  hint: "Written already",
  ask: {${scores ? `
    score: { label: "Score", type: "choice", options: ["1", "2", "3", "4", "5"], chips: true, required: true },
    verdict: { label: "Overall", type: "choice", options: [${VERDICTS.map((v) => JSON.stringify(v)).join(', ')}], chips: true, required: true },` : ''}
    takeaways: { label: "Key take-aways", type: "text", lines: true },
  },
  done: () => name + " · feedback written",
}, () => {${scores ? `
  score = number(input.score)
  verdict = input.verdict` : ''}
  takeaways = input.takeaways
  done = true
})`,
      });
      app.rule('positions', {
        kind: 'action',
        name: 'Schedule interview',
        src: `action("Schedule interview", {
  when: () => status == "Open",
  hint: "Only an open position",
  ask: {
    ${candidate},
    type: { label: "Type", type: "choice", options: [${KINDS.map((k) => JSON.stringify(k)).join(', ')}], chips: true, default: "${KINDS[0]}", required: true },
    date: { label: "When", type: "date", time: true, default: () => today(), required: true },
    interviewer: { label: "Interviewer", type: "person", default: () => me() },
  },
  done: () => input.type + " · " + input.candidate.name,
}, () => {
  add("${app.called('interviews')}", { name: input.type + " · " + input.candidate.name, candidate: input.candidate, position: this, date: input.date, type: input.type, interviewer: input.interviewer })
})`,
      });
    }

    if (offer) {
      app.rule('positions', {
        kind: 'action',
        name: 'Make offer',
        src: `action("Make offer", {
  when: () => status == "Open",
  hint: "Only an open position",
  ask: {
    ${candidate},
    salary: { label: "Salary", type: "number" },
    starts: { label: "Starts", type: "date" },
    note: { label: "Note", type: "text", note: () => (empty(input.candidate) ? "They go" : input.candidate.name + " goes") + " to ${offer}; Hire asks only when they say yes." },
  },
  done: () => input.candidate.name + " · offer made",
}, () => {
  move(input.candidate, ${JSON.stringify(offer)}, { offer: input.salary, starts: input.starts })
})`,
      });
    }

    // Hire: to Hired with the day they start, its first steps on the position${team ? ', one of the team' : ''}; nobody left to hire, Filled.
    app.rule('positions', {
      kind: 'action',
      name: 'Hire',
      src: `action("Hire", {
  when: () => status == "Open",
  hint: "Only an open position",
  ask: {
    ${candidate},
    starts: { label: "Starts", type: "date", required: true, note: () => (empty(input.candidate) ? "They go" : input.candidate.name + " goes") + " to ${hired}${team ? ` and to ${app.called('employees')}` : ''}${steps.length > 0 ? `; ${steps.join(', ')} come as steps due that day` : ''}." + (hired + 1 >= openings ? " The position is filled." : "") },
  },
  done: () => input.candidate.name + " · hired",
}, () => {
  const full = hired + 1 >= openings
  move(input.candidate, ${JSON.stringify(hired)}, { starts: input.starts })
${steps.map((s) => `  subtask(${JSON.stringify(`${s} · `)} + input.candidate.name, { due: input.starts })`).join('\n')}${team ? `\n  if (find("${app.called('employees')}", { name: input.candidate.name }).length == 0) add("${app.called('employees')}", { name: input.candidate.name, team: team, started: input.starts })` : ''}
  if (full) status = "Filled"
})`,
    });

    // The tabs; over them what is open, who is in the pipeline${offer ? ' and the offers out' : ''}.
    const sums = [
      { label: 'open', conditions: [{ field: 'status', op: 'is' as const, value: ['Open'] }] },
      { label: 'in the pipeline', field: 'in_process' },
      ...(offer ? [{ label: 'offers out', field: `at_${open.indexOf(offer) + 1}` }] : []),
    ];
    const tab = (id: string, name: string, value: string) => app.view('positions', { id, name, conditions: [{ field: 'status', op: 'is', value: [value] } satisfies Condition], sort: { key: 'opened', dir: 'asc' }, columns: ['owner', 'pipeline_said', 'hired_said', 'open_said'], sums, set: 'positions' }, id === 'open');
    tab('open', 'Open', 'Open');
    tab('on-hold', 'On hold', 'On hold');
    tab('filled', 'Filled', 'Filled');
    tab('closed', 'Closed', 'Closed');

    app.homeTile('positions', { off: true });
    const tiles = [{ view: 'open', title: 'Open positions', head: [{ label: 'open', conditions: [{ field: 'status', op: 'is' as const, value: ['Open'] }] }, { label: 'in the pipeline', field: 'in_process' }], value: 'pipeline_said', empty: 'No open position.' }];
    app.homeTiles('positions', tiles);
    if (interviews) {
      app.homeTile('interviews', { off: true });
      app.homeTiles('interviews', [
        { view: 'week', title: 'Interviews', value: 'date', empty: 'No interview planned.' },
        { view: 'due', title: 'Feedback due', value: 'date', empty: 'All feedback is written.' },
      ]);
    }

    app.about({
      title: 'Recruiting',
      what: `The jobs you are hiring for and a card for each who applied${sources.length > 0 ? `, through ${sources.join(', ')}` : ''}, by stage${interviews ? ', with their interviews and what each interviewer thought' : ''}.`,
      pieces: ['positions', 'hiring', ...(interviews ? ['interviews'] : [])],
      glance: [
        ...(interviews ? ['Each card says its next interview, or that it has none'] : []),
        ...(scores ? ['Write feedback in Today after an interview'] : []),
        `Hire moves the card to ${hired}${steps.length > 0 ? ' and adds the first steps' : ''}`,
        'Rejected asks why',
        'A position counts its candidates at each stage',
      ],
      how: [
        'Add a position, with how many people it needs.',
        `Add each candidate as a card on ${board}, with their position and their CV in its description; move the card as it goes.`,
        ...(interviews ? ['Press Schedule interview on their card; after it, Today asks the interviewer to Write feedback.'] : []),
        ...(offer ? ['Press Make offer with the salary and the day they would start.'] : []),
        'When they say yes, press Hire; Reject asks why.',
      ],
      auto: [
        ...(interviews ? [`A card says its next interview; one with none planned is marked.`, `An interview is in Today at its time with Write feedback, and stays, late, till it is written${scores ? `: a score from 1 to 5, ${VERDICTS.join(', ')}, and the key take-aways` : ''}.`] : []),
        ...(offer ? [`Make offer moves the card to ${offer} with the salary and the day they start.`] : []),
        `Hire moves the card to ${hired} with the day they start${steps.length > 0 ? `; it adds ${steps.join(', ')} for them as steps of the position, due that day` : ''}${team ? `; they are added to ${app.called('employees')}` : ''}. When nobody is left to hire, the position is Filled.`,
        'A card moved to Rejected asks why.',
        'A position counts its candidates at each stage, the ones hired of the openings, and how long it is open.',
      ],
      work: ['What each stage means:', ...stages.map((s) => `  - **${s}:** ${MEANS[s] ?? 'what it means for us.'}`), 'Who interviews, and who decides.', 'How an offer is made, and who signs it.'],
    });
  },
};
