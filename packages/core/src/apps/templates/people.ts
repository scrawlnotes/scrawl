import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, formula, link, nameField, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// People and birthdays (design/more-apps.md 4.7), as hip, Dex and Garden keep them: the people close
// to you, their birthdays day by day, a year left out when it is not known; how often you wish to
// talk to each, and when it is time, in Today with Talked; on a birthday, Wished. The moments you
// talked day by day in a person's window.

const RELATIONS = ['Family', 'Friend', 'Partner', 'Colleague', 'Other'];
/** How often to keep in touch, as Garden and Dex ask it, with its days. */
const EVERY: [string, number][] = [
  ['Every week', 7],
  ['Every 2 weeks', 14],
  ['Every month', 30],
  ['Every 2 months', 61],
  ['Every 3 months', 91],
  ['Every 6 months', 182],
  ['Every year', 365],
];
const TYPES = ['Call', 'Visit', 'Message'];
const ICONS = { Call: '📞', Visit: '🏠', Message: '💬' };
const TOUCH = ['Every week', 'Every 2 weeks', 'Every month', 'Every 2 months', 'Every 3 months', 'off'];

/** "3rd", "9th", "21st": an anniversary's count. */
const ordinal = (n: string) => `text(${n}) + (${n} % 10 == 1 && ${n} % 100 != 11 ? "st" : ${n} % 10 == 2 && ${n} % 100 != 12 ? "nd" : ${n} % 10 == 3 && ${n} % 100 != 13 ? "rd" : "th")`;

export const people: AppTemplate = {
  id: 'people',
  version: 2,
  group: 'life',
  name: 'apps.people.name',
  short: 'apps.people.short',
  icon: 'person',
  what: 'apps.people.what',
  goesWith: ['reading'],
  questions: [
    { key: 'anniversaries', kind: 'yesno', label: 'apps.people.anniversaries', default: true },
    { key: 'touch', kind: 'choice', label: 'apps.people.touch', help: 'apps.people.touchHelp', options: TOUCH.map((value) => ({ value, label: `apps.people.touch.${value.toLowerCase().replace(/ /g, '-')}` as MessageKey })), default: 'Every month' },
  ],
  money: () => false,
  pieces: () => ['close-people', 'moments'],
  menu: ['close-people'],
  build(app, answers) {
    const anniversaries = answers.anniversaries !== false;
    const touch = typeof answers.touch === 'string' && answers.touch !== 'off' && EVERY.some(([e]) => e === answers.touch) ? answers.touch : null;
    const moments = app.path('moments');
    const called = app.called('moments');

    // A person: how you know them, their days, how to reach them, how often to talk.
    app.field('close-people', nameField());
    app.field('close-people', { ...select('relation', 'Relation', RELATIONS, { Family: 'purple', Friend: 'green', Partner: 'pink', Colleague: 'blue', Other: 'gray' }), chips: true });
    app.field('close-people', { ...day('birthday', 'Birthday'), yearless: true });
    if (anniversaries) app.field('close-people', { ...day('anniversary', 'Anniversary'), yearless: true });
    app.field('close-people', { key: 'phone', label: 'Phone', type: 'phone' });
    app.field('close-people', { key: 'email', label: 'Email', type: 'email' });
    app.field('close-people', { ...select('every', 'Keep in touch', EVERY.map(([e]) => e), {}, touch ?? undefined) });
    // Written by themselves: the last talk, the day it was wished.
    app.field('close-people', rollup('last', 'Last talked', moments, 'max', 'date'));
    app.field('close-people', day('wished', 'Wished'));
    // From the day after it was wished: wished today, it comes next year.
    const from = 'empty(wished) || wished < today() ? today() : wished + 1';
    app.field('close-people', formula('next_birthday', 'Next birthday', `empty(birthday) ? null : upcoming(birthday, ${from})`));
    app.field('close-people', formula('age', 'Turns', 'empty(birthday) || empty(year(birthday)) ? null : year(next_birthday) - year(birthday)'));
    if (anniversaries) {
      app.field('close-people', formula('next_anniversary', 'Next anniversary', `empty(anniversary) ? null : upcoming(anniversary, ${from})`));
      app.field('close-people', formula('years', 'Years', 'empty(anniversary) || empty(year(anniversary)) ? null : year(next_anniversary) - year(anniversary)'));
      app.field('close-people', formula('next', 'Next day', 'empty(next_anniversary) ? next_birthday : empty(next_birthday) ? next_anniversary : min(next_birthday, next_anniversary)'));
    } else app.field('close-people', formula('next', 'Next day', 'next_birthday'));
    const isBirthday = anniversaries ? 'next == next_birthday' : 'true';
    // "Turns 36 · 29 Oct", "12 Nov", "9th anniversary · 20 Nov".
    const occasion = `${isBirthday} ? (empty(age) ? "" : "Turns " + text(age) + " · ") : ${anniversaries ? `(empty(years) ? "Anniversary · " : ${ordinal('years')} + " anniversary · ")` : '""'}`;
    app.field('close-people', formula('day_said', 'Birthday', `empty(next) ? "" : (${occasion}) + text(monthday(next)) + " " + monthname(next)`));
    app.field('close-people', formula('when_said', 'When', 'empty(next) ? "" : next == today() ? "today" : next - today() == 1 ? "tomorrow" : "in " + text(next - today()) + " days"'));
    app.field('close-people', formula('month', 'Month', 'empty(next) ? "" : next == today() ? "Today" : next - today() == 1 ? "Tomorrow" : monthname(next) + " " + text(year(next))'));
    app.field('close-people', formula('wish_said', 'Says', `${isBirthday} ? (empty(age) ? "Birthday" : "Turns " + text(age) + " · Birthday") : ${anniversaries ? `(empty(years) ? "Anniversary" : ${ordinal('years')} + " anniversary")` : '""'}`));

    // Keeping in touch, as Garden counts it: when it is time, how late or how long left.
    const days = EVERY.map(([e, n]) => `every == ${JSON.stringify(e)} ? ${n}`).join(' : ') + ' : null';
    app.field('close-people', formula('every_days', 'Every (days)', `empty(every) ? null : ${days}`));
    app.field('close-people', formula('touch_on', 'Talk by', 'empty(every_days) || empty(last) ? null : last + every_days'));
    app.field(
      'close-people',
      formula(
        'touch_said',
        'Next',
        'empty(touch_on) ? "" : touch_on < today() ? text(today() - touch_on) + (today() - touch_on == 1 ? " day late" : " days late") : touch_on == today() ? "today" : touch_on - today() < 14 ? text(touch_on - today()) + (touch_on - today() == 1 ? " day left" : " days left") : touch_on - today() < 60 ? text(round((touch_on - today()) / 7)) + " weeks left" : text(round((touch_on - today()) / 30)) + " months left"',
      ),
    );
    app.field('close-people', formula('last_said', 'Says', 'empty(last) ? "Not talked yet" : "last talked " + (today() - last == 0 ? "today" : today() - last == 1 ? "yesterday" : text(today() - last) + " days ago")'));
    app.field(
      'close-people',
      formula('said', 'Says', `(empty(relation) ? "" : relation + " · ") + (empty(next_birthday) ? "" : "birthday on " + text(monthday(next_birthday)) + " " + monthname(next_birthday) + " · ") + last_said + (!empty(touch_on) && touch_on < today() ? " · " + touch_said : "")`),
    );
    app.head('close-people', 'said');
    app.formOrder('close-people', ['name', 'relation', 'birthday', 'anniversary', 'phone', 'email', 'every']);
    app.newForm('close-people', ['relation', 'birthday', 'phone', 'every']);

    app.view('close-people', { id: 'birthdays', name: 'Birthdays', conditions: [{ field: 'next', op: 'not-empty' }], sort: { key: 'next', dir: 'asc' }, group: 'month', columns: ['relation', 'day_said', 'when_said'] }, true);
    app.view('close-people', { id: 'keep-in-touch', name: 'Keep in touch', conditions: [{ field: 'every', op: 'not-empty' }], sort: { key: 'touch_on', dir: 'asc' }, columns: ['relation', 'every', 'touch_said', 'last'] });
    app.tableColumns('close-people', ['relation', 'day_said', 'touch_said']);
    app.homeTile('close-people', { sub: 'day_said', value: 'when_said' });
    // A birthday in Today with Wished, as hip ticks it; one who is due to talk to, with Talked.
    app.view('close-people', { ...calendar({ start: 'next', color: 'relation', upcoming: true, button: 'Wished', words: ['wish_said'] }), id: 'days', name: 'Days', hidden: true });
    app.view('close-people', { id: 'touch', name: 'Talk by', kind: 'calendar', conditions: [{ field: 'every', op: 'not-empty' }], calendar: { start: 'touch_on', color: 'relation', upcoming: 'today', button: 'Talked', words: ['last_said'] }, hidden: true });
    app.rule('close-people', {
      kind: 'action',
      name: 'Talked',
      src: `action("Talked", () => {\n  add("${called}", { person: this, date: today() })\n})`,
    });
    app.rule('close-people', {
      kind: 'action',
      name: 'Wished',
      src: `action("Wished", { when: () => !empty(next) && next <= today(), hint: "Only on their day" }, () => {\n  add("${called}", { person: this, date: today(), type: "Message", note: ${isBirthday} ? "Birthday wishes" : "Anniversary wishes" })\n  wished = today()\n})`,
    });
    // The moments day by day, as Dex shows a person's notes.
    app.block('close-people', { block: 'linked', collection: moments, look: 'days', time: 'date', icon: 'type', icons: ICONS, sub: 'note', sort: 'date', dir: 'desc', column: 2 });

    app.field('moments', { ...nameField(), optional: true });
    app.field('moments', { ...link('person', 'With', app.path('close-people')), required: true });
    app.field('moments', day('date', 'When', true));
    app.field('moments', { ...select('type', 'Type', TYPES, { Call: 'blue', Visit: 'green', Message: 'yellow' }), chips: true });
    app.field('moments', text('note', 'Note'));
    app.formOrder('moments', ['date', 'type', 'note']);
    app.homeTile('moments', { off: true });
    app.rule('moments', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(person)) name = (empty(type) ? "Talked" : type) + " with " + person.name\n})' });

    app.about({
      title: 'People and birthdays',
      what: `The people close to you: their birthdays${anniversaries ? ' and anniversaries' : ''} every year, and keeping in touch.`,
      pieces: ['close-people', 'moments'],
      glance: [`Birthdays${anniversaries ? ' and anniversaries' : ''} in Today, with Wished`, 'Who is due to talk to in Today, with Talked', 'The moments you talked, day by day'],
      how: [
        `Add the people close to you, with their birthday${anniversaries ? ' and anniversary' : ''}: the year only if you know it.`,
        `Say how often you wish to keep in touch with each${touch ? `; ${touch.toLowerCase()} to start with` : ''}.`,
        'When you have talked to someone, press Talked; add a moment to say how and what about.',
        'Write in their notes what you wish to remember: their family, what they like, a gift idea.',
      ],
      auto: [
        `A birthday${anniversaries ? ' or an anniversary' : ''} comes to Upcoming and to Today on its day, with the age they turn when the year is known; pressing Wished writes a message and moves it to next year.`,
        'Counted from the last time you talked, someone you have not talked to for longer than you wish comes to Today with Talked; late, they stay in Overdue.',
        "A person's last talk is the day of their last moment.",
      ],
      work: ['What you give on a birthday, and when you buy it.'],
    });
  },
};
