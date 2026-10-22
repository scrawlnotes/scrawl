import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, codeField, day, dayAndTime, formula, link, multi, nameField, number, openCards, person, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { stageColumns, stageHints } from './crm';

const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
const SOURCES = ['Referral', 'LinkedIn', 'Job boards', 'Website', 'Agency'];
const STEPS = ['Contract signed', 'Equipment ready', 'Accounts opened', 'First week planned'];
const KINDS = ['Phone screen', 'Technical', 'Culture', 'Final'];

/** What each of the usual stages means; another stage is the team's to say. */
const MEANS: { [stage: string]: string } = {
  Applied: 'they sent their CV; nobody has looked at it yet.',
  Screening: 'we are reading their CV, and may call them.',
  Interview: 'interviews are set or held.',
  Offer: 'they have our offer.',
  Hired: 'they said yes; press Hire on their screen.',
  Rejected: 'it went no further; write why on the card.',
};

const sourceKey = (source: string) => `apps.recruiting.source.${source.toLowerCase().replace(/\s.*$/, '')}` as MessageKey;

export const recruiting: AppTemplate = {
  id: 'recruiting',
  version: 1,
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
  money: () => false,
  pieces: (answers) => ['positions', 'candidates', 'hiring', ...(answers.interviews !== false ? ['interviews'] : [])],
  build(app, answers) {
    const listed = (answers.stages as string[] | undefined) ?? [];
    // A board needs its stages: none given, it has the usual ones.
    const stages = listed.length > 0 ? listed : STAGES;
    const columns = stageColumns(stages);
    const hired = columns.find(([, kind]) => kind === 'done')![0];
    const sources = (answers.sources as string[] | undefined) ?? [];
    const interviews = answers.interviews !== false;
    const scores = interviews && answers.scores !== false;
    const steps = (answers.steps as string[] | undefined) ?? STEPS;
    const hiring = app.path('hiring');
    const board = app.called('hiring');

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
    app.field('positions', openCards('in_process', 'In process', hiring));
    app.field('positions', rollup('hired', 'Hired', app.path('candidates'), 'count'));
    app.field('positions', formula('left', 'Left to hire', 'openings - hired'));
    app.block('positions', { block: 'cards' });
    app.block('positions', { block: 'linked', collection: app.path('candidates'), style: 'list', fields: ['start'] });

    app.field('candidates', nameField());
    app.field('candidates', { key: 'email', label: 'Email', type: 'email' });
    app.field('candidates', { key: 'phone', label: 'Phone', type: 'phone' });
    app.field('candidates', { key: 'linkedin', label: 'LinkedIn', type: 'url' });
    if (sources.length > 0) app.field('candidates', select('source', 'Source', sources, { Referral: 'purple', LinkedIn: 'blue', 'Job boards': 'teal', Website: 'green', Agency: 'orange' }));
    app.field('candidates', multi('tags', 'Tags', []));
    app.field('candidates', link('hired_for', 'Hired for', app.path('positions')));
    app.field('candidates', day('start', 'Starts'));
    app.block('candidates', { block: 'cards' });
    if (steps.length > 0) app.block('candidates', { block: 'subtasks' });

    app.columns('hiring', columns);
    app.field('hiring', link('candidate', 'Candidate', app.path('candidates')));
    app.field('hiring', link('position', 'Position', app.path('positions')));

    app.rule('candidates', {
      kind: 'action',
      name: 'Add to position',
      src: `action("Add to position", {
  ask: { position: { label: "Position", type: "link", collection: "${app.called('positions')}", required: true } },
}, () => {
  card("${board}", { title: name, column: ${JSON.stringify(stages[0])}, candidate: this, position: input.position })
})`,
    });

    if (interviews) {
      const held = app.path('interviews');
      app.field('interviews', nameField('Title'));
      app.field('interviews', link('candidate', 'Candidate', app.path('candidates')));
      app.field('interviews', link('position', 'Position', app.path('positions')));
      app.field('interviews', dayAndTime('date', 'Date', true));
      app.field('interviews', select('type', 'Type', KINDS, { 'Phone screen': 'gray', Technical: 'blue', Culture: 'purple', Final: 'green' }));
      app.field('interviews', person('interviewer', 'Interviewer', true));
      app.view('interviews', calendar({ start: 'date', color: 'type', upcoming: true }));
      if (scores) {
        app.field('interviews', number('score', 'Score'));
        app.field('interviews', select('recommendation', 'Recommendation', ['Strong yes', 'Yes', 'No', 'Strong no'], { 'Strong yes': 'green', Yes: 'teal', No: 'orange', 'Strong no': 'red' }));
        app.rule('interviews', { kind: 'check', name: 'A score is from 1 to 5', src: 'check("score", () => empty(score) || (score >= 1 && score <= 5), "A score is from 1 to 5")' });
      }
      app.field('candidates', rollup('interview_count', 'Interviews', held, 'count'));
      if (scores) app.field('candidates', rollup('score', 'Average score', held, 'avg', 'score'));
      app.block('candidates', { block: 'linked', collection: held, sort: 'date', style: 'timeline' });
      app.block('positions', { block: 'linked', collection: held, style: 'list', fields: ['candidate', 'date', ...(scores ? ['recommendation'] : [])], sort: 'date' });
      app.rule('candidates', {
        kind: 'action',
        name: 'Schedule interview',
        src: `action("Schedule interview", {
  ask: {
    position: { label: "Position", type: "link", collection: "${app.called('positions')}" },
    date: { label: "Date", type: "date", time: true, default: () => today(), required: true },
    type: { label: "Type", type: "choice", options: [${KINDS.map((k) => JSON.stringify(k)).join(', ')}], default: "${KINDS[0]}", required: true },
  },
}, () => {
  add("${app.called('interviews')}", { name: input.type + " with " + name, candidate: this, position: input.position, date: input.date, type: input.type })
})`,
      });
    }

    app.rule('candidates', {
      kind: 'action',
      name: 'Hire',
      src: `action("Hire", {
  when: () => empty(hired_for),
  hint: "Hired already",
  ask: {
    position: { label: "Position", type: "link", collection: "${app.called('positions')}", required: true },
    start: { label: "Starts", type: "date", required: true },
  },
}, () => {
  hired_for = input.position
  start = input.start
  for (const c of cards("${board}", { candidate: this, position: input.position })) {
    if (c.column != ${JSON.stringify(hired)}) move(c, ${JSON.stringify(hired)})
  }
${steps.map((s) => `  subtask(${JSON.stringify(s)}, { due: input.start })`).join('\n')}${steps.length > 0 ? '\n' : ''}  if (input.position.hired + 1 >= input.position.openings) update(input.position, { status: "Filled" })
})`,
    });

    app.about({
      title: 'Recruiting',
      what: `The jobs you are hiring for, the people who applied${sources.length > 0 ? ` through ${sources.join(', ')}` : ''}, where each is on the way${interviews ? ', and their interviews' : ''}.`,
      pieces: ['positions', 'candidates', 'hiring', ...(interviews ? ['interviews'] : [])],
      glance: [`Hire moves the card to ${hired}${steps.length > 0 ? ' and adds the first steps' : ''}`, 'A position counts who applied and who was hired', ...(scores ? ['A candidate shows their average score'] : [])],
      how: [
        'Add a position, with how many people it needs.',
        `Add each candidate with their CV in their notes; press Add to position to put them on ${board}, and move their card as it goes.`,
        ...(interviews ? [`Press Schedule interview on their screen; write what you thought in the interview${scores ? ', with a score from 1 to 5 and a recommendation' : ''}.`] : []),
        'When they say yes, press Hire.',
      ],
      auto: [
        `Add to position adds a card for the candidate in ${stages[0]}, linked to the position.`,
        ...(interviews ? ['Schedule interview adds an interview on the day you give, by you.'] : []),
        `Hire writes the position and the day they start and moves their card to ${hired}${steps.length > 0 ? `; it adds ${steps.join(', ')} as their steps, due on the day they start` : ''}. When nobody is left to hire, the position is Filled.`,
        'A position counts the candidates on it, the ones still on their way and the ones hired.',
        ...(interviews ? [`A candidate counts their interviews${scores ? ' and shows their average score; a score that is not from 1 to 5 is marked' : ''}.`] : []),
      ],
      work: ['What each stage means:', ...stages.map((s) => `  - **${s}:** ${MEANS[s] ?? 'what it means for us.'}`), 'Who interviews, and who decides.', 'How an offer is made, and who signs it.'],
    });
  },
};
