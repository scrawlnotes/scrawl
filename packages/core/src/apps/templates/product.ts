import { calendar, day, link, nameField, openCards, select, text } from '../pieces';
import { feedback } from '../shared';
import type { AppTemplate } from '../types';
import { keepsFeedback } from './support';

export const product: AppTemplate = {
  id: 'product',
  version: 1,
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
  menu: ['roadmap', 'bugs', 'feedback', 'releases'],
  build(app, answers) {
    const bugs = answers.bugs !== false;
    const releases = answers.releases !== false;
    const ideas = app.hasPiece('feedback') && keepsFeedback(app);
    const roadmap = app.path('roadmap');

    app.columns(
      'roadmap',
      [
        ['Backlog', 'backlog'],
        ['Todo', 'active'],
        ['Doing', 'active'],
        ['Review', 'review'],
        ['Done', 'done'],
      ],
      { phasesOn: answers.phases === true },
    );
    app.field('roadmap', select('type', 'Type', ['feature', 'improvement', 'chore', ...(bugs ? [] : ['bug'])], { feature: 'blue', improvement: 'teal', chore: 'gray', bug: 'red' }));
    app.field('roadmap', text('area', 'Area'));
    if (releases) app.field('roadmap', link('release', 'Release', app.path('releases')));
    if (ideas) {
      feedback(app);
      app.field('roadmap', link('feedback', 'Feedback', app.path('feedback'), true));
      app.block('feedback', { block: 'cards' });
    }

    if (bugs) {
      app.columns(
        'bugs',
        [
          ['New', 'backlog'],
          ['Confirmed', 'active'],
          ['Fixing', 'active'],
          ['Fixed', 'done'],
          ["Won't fix", 'dropped'],
        ],
        { list: true },
      );
      app.field('bugs', select('severity', 'Severity', ['critical', 'major', 'minor'], { critical: 'red', major: 'orange', minor: 'gray' }));
      if (releases) app.field('bugs', link('release', 'Release', app.path('releases')));
      app.field('bugs', app.hasPiece('people') ? link('reporter', 'Reported by', app.path('people')) : text('reporter', 'Reported by'));
    }

    if (releases) {
      app.field('releases', nameField('Version'));
      app.field('releases', day('planned', 'Planned'));
      app.field('releases', day('shipped', 'Shipped'));
      app.field('releases', select('status', 'Status', ['Planned', 'Released'], { Planned: 'blue', Released: 'green' }, 'Planned'));
      app.view('releases', calendar({ start: 'planned', color: 'status' }, [{ field: 'status', op: 'is', value: ['Planned'] }]));
      app.field('releases', openCards('open_cards', 'Open cards', roadmap));
      app.block('releases', { block: 'cards' });
      app.rule('releases', {
        kind: 'check',
        name: 'Released with open cards',
        src: 'check("status", () => status != "Released" || open_cards == 0, `Released with ${open_cards} open cards`)',
      });
      app.rule('releases', {
        kind: 'action',
        name: 'Ship',
        src: `action("Ship", {
  when: () => status != "Released",
  hint: "It is out",
  confirm: true,
  say: () => open_cards > 0 ? text(open_cards) + " cards are still open" : name + " is ready",
}, () => {
  status = "Released"
  shipped = today()
})`,
      });
    }

    app.about({
      title: 'Product development',
      what: `The work on your product from idea to release${bugs ? ', and the bugs found on the way' : ''}${ideas ? ', with what customers asked for' : ''}.`,
      pieces: ['roadmap', ...(bugs ? ['bugs'] : []), ...(releases ? ['releases'] : []), ...(ideas && !app.has('support') ? ['feedback'] : [])],
      glance: [...(releases ? ['Ship marks a release out'] : []), ...(ideas ? ['A feedback shows the cards that answer it'] : [])],
      how: [
        `Add each piece of work as a card on ${app.called('roadmap')} and move it as it goes${releases ? '; link it to the release it goes out in' : ''}.`,
        ...(bugs ? [`Add each bug to ${app.called('bugs')}, with how bad it is.`] : []),
        ...(ideas ? [`Link a card to the feedback it answers; the feedback shows its card.`] : []),
        ...(releases ? ['Press Ship on a release when it is out; write its release notes in its notes.'] : []),
      ],
      auto: [
        ...(releases ? ['A release counts its open cards; Ship makes it Released with today as its day, and asks first.', 'A release that is Released with open cards is marked.'] : []),
        ...(ideas ? ['A feedback shows the cards that answer it.'] : []),
      ],
      work: ['How a piece of work goes from an idea to a release.', 'Done means: built, checked by someone else and released.'],
    });
  },
};
