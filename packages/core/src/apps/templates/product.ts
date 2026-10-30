import { calendar, day, formula, link, nameField, openCards, select, text } from '../pieces';
import { feedback } from '../shared';
import type { AppTemplate } from '../types';
import { keepsFeedback } from './support';

// Product development (design/scrawl-apps.md 3.7), as Productboard, Linear and Canny keep it: the
// roadmap's Ideas, Later, Next and Now as columns, each card saying how many asked for it; a bug
// reported from a support request, the request opened again when it is fixed; a release in Today
// on its day, Ship writing its notes from its cards under New, Improved and Fixed, the feedback
// they answer done, and, with the CRM, an activity to tell each company that asked.

/** A day as a release says it: "Nov 20". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;

export const product: AppTemplate = {
  id: 'product',
  version: 2,
  group: 'work',
  name: 'apps.product.name',
  short: 'apps.product.short',
  icon: 'flag',
  what: 'apps.product.what',
  questions: [
    { key: 'bugs', kind: 'yesno', label: 'apps.product.bugs', default: true },
    { key: 'releases', kind: 'yesno', label: 'apps.product.releases', default: true },
    { key: 'phases', kind: 'yesno', label: 'apps.product.phases', default: false },
    { key: 'feedback', kind: 'yesno', label: 'apps.product.feedback', default: true, when: ({ chosen }) => !chosen.has('support') },
  ],
  money: () => false,
  pieces: (answers, app) => [
    'roadmap',
    ...(answers.bugs !== false ? ['bugs'] : []),
    ...(answers.releases !== false ? ['releases'] : []),
    ...(keepsFeedback(app) ? ['feedback'] : []),
  ],
  menu: (answers) => ['roadmap', 'bugs', ...(answers.releases !== false ? [{ role: 'releases', view: 'planned', name: 'Releases' }] : []), 'feedback'],
  build(app, answers) {
    const bugs = answers.bugs !== false;
    const releases = answers.releases !== false;
    const ideas = app.hasPiece('feedback') && keepsFeedback(app);
    // With Support, an idea counts the requests that ask for it.
    const asks = ideas && app.has('support');
    const requests = bugs && app.hasPiece('requests');
    const tell = ideas && app.hasPiece('activities') && app.hasPiece('companies');
    const roadmap = app.called('roadmap');

    app.field('roadmap', { ...select('type', 'Type', ['feature', 'improvement', 'chore', ...(bugs ? [] : ['bug'])], { feature: 'blue', improvement: 'teal', chore: 'gray', bug: 'red' }, 'feature'), chips: true });
    app.field('roadmap', text('area', 'Area'));
    if (releases) app.field('roadmap', link('release', 'Release', app.path('releases')));
    if (ideas) {
      feedback(app);
      app.field('roadmap', link('feedback', 'Feedback', app.path('feedback'), true));
      if (asks) app.field('roadmap', { key: 'asks', label: 'Requests', type: 'lookup', lookup: { link: 'feedback', field: 'requests' } });
      app.field('roadmap', formula('asked', 'Asked by', asks ? 'empty(asks) ? 0 : sum(asks)' : 'empty(feedback) ? 0 : feedback.length'));
      app.field('roadmap', formula('asked_said', 'Asked', 'asked > 0 ? "Asked by " + text(asked) : ""'));
      app.block('feedback', { block: 'cards' });
    }
    app.field('roadmap', text('why_not', "Why we won't do it"));
    app.columns(
      'roadmap',
      [
        ['Ideas', 'backlog'],
        ['Later', 'backlog'],
        ['Next', 'backlog'],
        ['Now', 'active'],
        ['Review', 'review'],
        ['Shipped', 'done'],
        ["Won't do", 'dropped'],
      ],
      { phasesOn: answers.phases === true, dropAsks: 'why_not', face: ['type', ...(ideas ? ['asked_said'] : []), ...(releases ? ['release'] : [])] },
    );

    if (bugs) {
      app.field('bugs', { ...select('severity', 'Severity', ['critical', 'major', 'minor'], { critical: 'red', major: 'orange', minor: 'gray' }, 'major'), chips: true });
      if (releases) app.field('bugs', link('release', 'Release', app.path('releases')));
      app.field('bugs', app.hasPiece('people') ? link('reporter', 'Reported by', app.path('people')) : text('reporter', 'Reported by'));
      if (requests) app.field('bugs', link('request', 'Request', app.path('requests')));
      app.field('bugs', text('why_not', "Why we won't fix it"));
      app.columns(
        'bugs',
        [
          ['New', 'backlog'],
          ['Confirmed', 'active'],
          ['Fixing', 'active'],
          ['Fixed', 'done'],
          ["Won't fix", 'dropped'],
        ],
        // A bug fixed opens again the request it came from (Linear's triage, Help Scout's follow-up).
        { list: true, dropAsks: 'why_not', face: ['severity', ...(requests ? ['request'] : []), ...(releases ? ['release'] : [])], ...(requests && { wins: { link: 'request', field: 'bug', value: 'Fixed' } }) },
      );
      if (requests) {
        // Report bug on a request; the bug fixed, the request is open again with its reply due now.
        app.field('requests', { ...select('bug', 'Bug', ['Reported', 'Fixed'], { Reported: 'orange', Fixed: 'green' }), when: [{ field: 'bug', op: 'not-empty' }] });
        app.field('requests', formula('bug_said', 'Bug', 'bug == "Fixed" ? "Bug fixed" : bug == "Reported" ? "Bug reported" : ""'));
        app.rule('requests', {
          kind: 'onSave',
          name: 'Bug fixed',
          src: `onSave("Bug fixed", () => {
  if (bug == "Fixed" && old.bug != "Fixed") {
    status = "Open"
    reply_due = now()
  }
})`,
        });
        app.rule('requests', {
          kind: 'action',
          name: 'Report bug',
          src: `action("Report bug", {
  when: () => empty(bug),
  hint: "",
  ask: {
    title: { label: "Title", type: "text", default: () => name, required: true },
    severity: { label: "Severity", type: "choice", options: ["critical", "major", "minor"], chips: true, default: "major", note: () => "A card on ${app.called('bugs')}, linked to this request. When it is Fixed, the request opens again, saying Bug fixed." },
  },
  done: () => code + " · bug reported",
}, () => {
  card("${app.called('bugs')}", { title: input.title, severity: input.severity, request: this })
  bug = "Reported"
})`,
        });
      }
    }

    if (releases) {
      const board = app.path('roadmap');
      app.field('releases', nameField('Version'));
      app.field('releases', day('planned', 'Planned'));
      app.field('releases', { ...day('shipped', 'Shipped'), when: [{ field: 'status', op: 'is', value: ['Released'] }] });
      app.field('releases', select('status', 'Status', ['Planned', 'Released'], { Planned: 'blue', Released: 'green' }, 'Planned'));
      app.field('releases', { key: 'cards', label: 'Cards', type: 'rollup', rollup: { from: board, fn: 'count' } });
      app.field('releases', openCards('open_cards', 'Open cards', board));
      app.field('releases', formula('done_said', 'Done', 'cards == 0 ? "No cards" : text(cards - open_cards) + " of " + text(cards) + " cards done"'));
      app.field('releases', { ...text('notes', 'Release notes'), help: 'Written by Ship from its cards; change it as you like' });
      app.field('releases', formula('when_said', 'When', `status == "Released" ? (empty(shipped) ? "Shipped" : "Shipped " + ${short('shipped')}) : empty(planned) ? "No day yet" : planned < today() ? text(today() - planned) + " days late" : planned == today() ? "Today" : ${short('planned')}`));
      // Its window's line: "Planned · Nov 20 (in 21 days) · 5 of 8 cards done".
      app.field(
        'releases',
        formula('said', 'Says', `status + " · " + (status == "Released" ? when_said : empty(planned) ? "no day yet" : ${short('planned')} + (planned < today() ? " · " + when_said : planned == today() ? " · today" : " (in " + text(planned - today()) + (planned - today() == 1 ? " day)" : " days)"))) + " · " + done_said`),
      );
      app.head('releases', 'said');
      app.formOrder('releases', ['name', 'planned', 'status', 'shipped', 'notes']);
      app.newForm('releases', ['name', 'planned']);
      app.block('releases', { block: 'actions', column: 1 });
      app.block('releases', { block: 'cards', column: 2 });
      app.view('releases', { id: 'planned', name: 'Planned', conditions: [{ field: 'status', op: 'is', value: ['Planned'] }], sort: { key: 'planned', dir: 'asc' }, columns: ['when_said', 'done_said'], set: 'releases' }, true);
      app.view('releases', { id: 'released', name: 'Released', conditions: [{ field: 'status', op: 'is', value: ['Released'] }], sort: { key: 'shipped', dir: 'desc' }, columns: ['when_said', 'done_said'], set: 'releases' });
      // Its day in Upcoming, in Today with Ship.
      app.view('releases', { ...calendar({ start: 'planned', color: 'status', upcoming: true, button: 'Ship', words: ['done_said'] }, [{ field: 'status', op: 'is', value: ['Planned'] }]), id: 'days', name: 'Days', hidden: true });
      app.rule('releases', {
        kind: 'check',
        name: 'Released with open cards',
        src: 'check("status", () => status != "Released" || open_cards == 0, `Released with ${open_cards} open cards`)',
      });
      const line = (list: string) => `${list} = ${list} + (${list} == "" ? "" : "\\n") + "- " + c.title`;
      const told = tell
        ? `
          if (input.tell && !empty(f.company)) add("${app.called('activities')}", { name: "Tell them: " + c.title + " is out in " + name, type: "Email", when: today(), company: f.company })`
        : '';
      app.rule('releases', {
        kind: 'action',
        name: 'Ship',
        src: `action("Ship", {
  when: () => status != "Released",
  hint: "It is out",
  ask: {
    open: { label: "Cards still open", type: "choice", options: ["Move to the next release", "Ship with it"], chips: true, default: "Move to the next release", note: () => open_cards == 0 ? "Every card is done." : text(open_cards) + (open_cards == 1 ? " card is" : " cards are") + " still open." },${tell ? `
    tell: { label: "Tell those who asked, an activity each in Today", type: "tick", default: true },` : ''}
  },
  done: () => name + " · shipped",
}, () => {
  let next = null
  for (const r of find("${app.called('releases')}", { status: "Planned" })) {
    if (r.name != name && (next == null || (!empty(r.planned) && (empty(next.planned) || r.planned < next.planned)))) next = r
  }
  let added = ""
  let improved = ""
  let fixed = ""
  for (const c of cards("${roadmap}", { release: this })) {
    if (c.column == "Shipped") {
      if (c.type == "improvement") ${line('improved')}
      else if (c.type == "bug") ${line('fixed')}
      else if (c.type != "chore") ${line('added')}${ideas ? `
      if (!empty(c.feedback)) {
        for (const f of c.feedback) {
          update(f, { status: "done" })${told}
        }
      }` : ''}
    } else if (c.column != "Won't do" && input.open != "Ship with it") {
      move(c, "Next", { release: next })
    }
  }${bugs ? `
  for (const c of cards("${app.called('bugs')}", { release: this, column: "Fixed" })) {
    ${line('fixed')}
  }` : ''}
  let written = added == "" ? "" : "New\\n" + added
  if (improved != "") written = written + (written == "" ? "" : "\\n\\n") + "Improved\\n" + improved
  if (fixed != "") written = written + (written == "" ? "" : "\\n\\n") + "Fixed\\n" + fixed
  notes = written
  status = "Released"
  shipped = today()
})`,
      });
      app.homeTile('releases', { off: true });
      app.homeTiles('releases', [{ view: 'planned', title: 'Next release', value: 'when_said', sub: 'done_said', first: true, empty: 'No release planned.' }]);
    }

    app.about({
      title: 'Product development',
      what: `The work on your product from idea to release${bugs ? ', and the bugs found on the way' : ''}${ideas ? ', with what customers asked for' : ''}.`,
      pieces: ['roadmap', ...(bugs ? ['bugs'] : []), ...(releases ? ['releases'] : []), ...(ideas && !app.has('support') ? ['feedback'] : [])],
      glance: ['Ideas, Later, Next and Now on the roadmap', ...(ideas ? ['Each card says how many asked for it'] : []), ...(requests ? ['A bug fixed opens its request again'] : []), ...(releases ? ['Ship writes the release notes'] : [])],
      how: [
        `Add each piece of work as a card on ${roadmap}: an idea in Ideas, then Later, Next and Now as you plan it${releases ? '; link it to the release it goes out in' : ''}.`,
        ...(ideas ? ['Link a card to the feedback it answers; it says how many asked for it.'] : []),
        ...(bugs ? [`Add each bug to ${app.called('bugs')} with how bad it is${requests ? `, or press Report bug on a request in ${app.called('requests')}` : ''}.`] : []),
        ...(releases ? ["Press Ship on a release when it is out, in Today on its day; its notes are written for you."] : []),
      ],
      auto: [
        `A card dropped in Won't do asks why.`,
        ...(ideas ? [asks ? "A card adds up the requests of the feedback it answers: Asked by 12." : 'A card counts the feedback it answers: Asked by 3.'] : []),
        ...(requests ? ['A bug moved to Fixed opens its request again, saying Bug fixed.'] : []),
        ...(releases
          ? [
              'A release counts its cards and those done; its day comes to Upcoming, and to Today with Ship.',
              `Ship asks what to do with the cards still open, moving them to Next with the next release; it writes the release notes from the shipped cards under New, Improved and Fixed${ideas ? ', marks the feedback they answer done' : ''}${tell ? ', and plans an activity to tell each company that asked' : ''}.`,
              'A release that is Released with open cards is marked.',
            ]
          : []),
      ],
      work: ['How a piece of work goes from an idea to Now.', 'Done means: built, checked by someone else and released.'],
    });
  },
};
