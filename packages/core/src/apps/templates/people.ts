import { calendar, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// People and birthdays (design/more-apps.md 4.7): the people close to you, a piece of their own
// apart from the CRM's; their next birthday, and anniversary as asked, every year in Today and
// Upcoming; the moments you talked, and someone you have not talked to for longer than you wish
// marked.

/** The next time a day comes round, this year or the next: a birthday, an anniversary. */
const nextOf = (field: string) => {
  const thisYear = `${field} + years(year(today()) - year(${field}))`;
  return `${thisYear} < today() ? ${field} + years(year(today()) - year(${field}) + 1) : ${thisYear}`;
};

export const people: AppTemplate = {
  id: 'people',
  version: 1,
  group: 'life',
  name: 'apps.people.name',
  short: 'apps.people.short',
  icon: 'person',
  what: 'apps.people.what',
  questions: [
    { key: 'anniversaries', kind: 'yesno', label: 'apps.people.anniversaries', default: true },
    { key: 'often', kind: 'yesno', label: 'apps.people.often', default: true, help: 'apps.people.oftenHelp' },
  ],
  money: () => false,
  pieces: () => ['close-people', 'moments'],
  menu: ['close-people'],
  build(app, answers) {
    const anniversaries = answers.anniversaries !== false;
    const often = answers.often !== false;
    const moments = app.path('moments');

    app.field('close-people', nameField());
    app.field('close-people', select('relation', 'Relation', ['Family', 'Friend', 'Partner', 'Colleague', 'Other'], { Family: 'purple', Friend: 'green', Partner: 'pink', Colleague: 'blue', Other: 'gray' }));
    app.field('close-people', day('birthday', 'Birthday'));
    if (anniversaries) app.field('close-people', day('anniversary', 'Anniversary'));
    app.field('close-people', { key: 'phone', label: 'Phone', type: 'phone' });
    if (often) app.field('close-people', number('often', 'Talk every (days)'));
    app.field('close-people', rollup('last', 'Last talked', moments, 'max', 'date'));
    app.field('close-people', formula('next_birthday', 'Next birthday', nextOf('birthday')));
    app.field('close-people', formula('age', 'Turns', 'year(next_birthday) - year(birthday)'));
    if (anniversaries) {
      app.field('close-people', formula('next_anniversary', 'Next anniversary', nextOf('anniversary')));
      // A person comes to Upcoming once: on the first of their days, saying which it is.
      app.field('close-people', formula('next', 'Next day', 'min(next_birthday, next_anniversary)'));
      app.field('close-people', formula('occasion', 'It is', 'empty(next) ? "" : next == next_birthday ? "Birthday" : "Anniversary"'));
      app.view('close-people', calendar({ start: 'next', color: 'relation', upcoming: true }));
    } else app.view('close-people', calendar({ start: 'next_birthday', color: 'relation', upcoming: true }));
    app.block('close-people', { block: 'linked', collection: moments, sort: 'date', style: 'timeline' });
    if (often) {
      app.rule('close-people', {
        kind: 'check',
        name: 'Not talked for a while',
        src: 'check("last", () => empty(often) || (!empty(last) && today() - last <= often), `${empty(last) ? "Not talked yet" : "Not talked for " + text(today() - last) + " days"}`)',
      });
    }

    app.field('moments', nameField());
    app.field('moments', { ...link('person', 'With', app.path('close-people')), required: true });
    app.field('moments', day('date', 'Date', true));
    app.field('moments', select('type', 'Type', ['Call', 'Visit', 'Message', 'Other'], { Call: 'blue', Visit: 'green', Message: 'yellow', Other: 'gray' }, 'Call'));
    app.field('moments', text('note', 'Note'));
    app.rule('moments', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(person)) name = type + " with " + person.name\n})' });

    app.about({
      title: 'People and birthdays',
      what: `The people close to you: their birthdays${anniversaries ? ' and anniversaries' : ''} every year, and when you last talked.`,
      pieces: ['close-people', 'moments'],
      glance: [`Birthdays${anniversaries ? ' and anniversaries' : ''} every year, in Today and Upcoming`, ...(often ? ['Someone not talked to for a while is marked'] : [])],
      how: [
        `Add the people close to you, with their birthday${anniversaries ? ' and anniversary' : ''}${often ? ', and how often you wish to talk' : ''}.`,
        'When you call, visit or write to someone, add a moment with them.',
      ],
      auto: [
        `A person's next birthday${anniversaries ? ' and anniversary' : ''} come round every year; ${anniversaries ? 'the first of them comes' : 'it comes'} to Today and Upcoming, and the age they turn is worked out.`,
        "A person's last talk is the day of their last moment.",
        ...(often ? ['Someone you have not talked to for longer than you wish, or not yet, is marked.'] : []),
      ],
      work: ['What you give on a birthday, and when you buy it.'],
    });
  },
};
