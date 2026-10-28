import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, formula, link, multi, nameField, number, PERCENT, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Reading and watching (design/more-apps.md 4.8), as it is kept: books, films, series, anime,
// manga, webtoons, podcasts and games; where to find each and its link, how far you are, a log of
// each day, a goal for the year and the days in a row, quotes, your own lists, what you lent and
// what comes out when. Update writes how far you got; at the last page or episode it is Done.

const TYPES = ['Book', 'Film', 'Series', 'Anime', 'Manga', 'Webtoon', 'Podcast', 'Game'];
const TYPE_COLORS = { Book: 'blue', Film: 'red', Series: 'purple', Anime: 'pink', Manga: 'orange', Webtoon: 'teal', Podcast: 'yellow', Game: 'green' } as const;
const STATUSES = ['Want', 'Up next', 'In progress', 'Paused', 'Done', 'Dropped'];
const SERVICES = ['Netflix', 'Max', 'Disney+', 'Prime Video', 'Apple TV+', 'Hulu', 'YouTube', 'Crunchyroll', 'Webtoon', 'Kindle', 'Paper'];
const SERVICES_TR = ['Netflix', 'Disney+', 'Prime Video', 'Max', 'Exxen', 'TOD', 'Gain', 'Mubi', 'YouTube', 'Crunchyroll', 'Webtoon', 'Kindle', 'Paper'];
const GOALS = ['none', '12', '24', '36', '52'];

/** What a work's progress is counted in, by its type. */
const UNIT = 'type == "Book" ? "pages" : type == "Manga" || type == "Webtoon" ? "chapters" : type == "Film" ? "minutes" : type == "Game" ? "hours" : "episodes"';

export const reading: AppTemplate = {
  id: 'reading',
  version: 1,
  group: 'life',
  name: 'apps.reading.name',
  short: 'apps.reading.short',
  icon: 'quote',
  what: 'apps.reading.what',
  goesWith: ['people'],
  questions: [
    { key: 'types', kind: 'multi', label: 'apps.reading.types', options: TYPES.map((value) => ({ value, label: `apps.reading.type.${value.toLowerCase()}` as MessageKey })), default: TYPES },
    { key: 'services', kind: 'list', label: 'apps.reading.services', default: SERVICES, regional: { TR: SERVICES_TR }, help: 'apps.reading.servicesHelp', add: 'apps.reading.addService' },
    { key: 'progress', kind: 'yesno', label: 'apps.reading.progress', default: true, help: 'apps.reading.progressHelp' },
    { key: 'goal', kind: 'choice', label: 'apps.reading.goal', options: GOALS.map((value) => ({ value, label: `apps.reading.goal.${value}` as MessageKey })), default: 'none' },
    { key: 'quotes', kind: 'yesno', label: 'apps.reading.quotes', default: true },
    { key: 'lending', kind: 'yesno', label: 'apps.reading.lending', default: false },
    { key: 'releases', kind: 'yesno', label: 'apps.reading.releases', default: true, help: 'apps.reading.releasesHelp' },
  ],
  money: () => false,
  pieces: (answers) => [
    'library',
    'reading-lists',
    ...(answers.progress !== false ? ['reading-log'] : []),
    ...(answers.progress !== false || (answers.goal ?? 'none') !== 'none' ? ['reading-years'] : []),
    ...(answers.quotes !== false ? ['quotes'] : []),
  ],
  menu: ['library', 'reading-lists', 'reading-years', 'quotes'],
  build(app, answers) {
    const listed = (answers.types as string[] | undefined) ?? [];
    const types = listed.length > 0 ? listed : TYPES;
    const services = (answers.services as string[] | undefined) ?? SERVICES;
    const progress = app.hasPiece('reading-log');
    const years = app.hasPiece('reading-years');
    const quotes = app.hasPiece('quotes');
    const lending = answers.lending === true;
    const releases = answers.releases !== false;
    const goal = Number(answers.goal) || 0;
    const library = app.path('library');
    const yearsCalled = years ? app.called('reading-years') : '';

    app.field('library', nameField('Title'));
    app.field('library', select('type', 'Type', types, TYPE_COLORS, types[0]));
    app.field('library', text('by', 'By'));
    app.field('library', number('year', 'Year'));
    app.field('library', multi('genres', 'Genres', []));
    app.field('library', app.hasPiece('close-people') ? link('recommended', 'Recommended by', app.path('close-people')) : text('recommended', 'Recommended by'));
    app.field('library', { key: 'info', label: 'Info', type: 'url' });
    if (services.length > 0) app.field('library', select('where', 'Where', services));
    app.field('library', { key: 'watch', label: 'Its link', type: 'url' });
    app.field('library', { key: 'cover', label: 'Cover', type: 'url' });
    app.field('library', select('status', 'Status', STATUSES, { Want: 'gray', 'Up next': 'blue', 'In progress': 'orange', Paused: 'yellow', Done: 'green', Dropped: 'red' }, 'Want'));
    app.field('library', number('rating', 'Rating (1–5)'));
    app.field('library', day('started', 'Started'));
    app.field('library', day('finished', 'Finished'));
    app.field('library', link('lists', 'Lists', app.path('reading-lists'), true));
    if (progress) {
      app.field('library', number('done', 'How far'));
      app.field('library', number('total', 'Of'));
      app.field('library', formula('unit', 'In', UNIT));
      app.field('library', formula('percent', 'Done', 'total > 0 ? min(1, (done || 0) / total) : 0', PERCENT));
    }
    app.field('library', formula('this_year', 'Finished this year', '!empty(finished) && year(finished) == year(today())'));
    if (years) app.field('library', link('read_in', 'Finished in', app.path('reading-years')));
    if (lending) {
      app.field('library', text('lent_to', 'Lent to'));
      app.field('library', day('lent_on', 'Lent on'));
      app.field('library', day('back_by', 'Back by'));
      app.view('library', { ...calendar({ start: 'back_by', upcoming: true }, [{ field: 'lent_to', op: 'not-empty' }]), id: 'lent', name: 'Lent' });
      app.rule('library', { kind: 'check', name: 'Not back', src: 'check("back_by", () => empty(lent_to) || empty(back_by) || back_by >= today(), `${lent_to} has it since ${text(lent_on)}`)' });
    }
    if (releases) {
      app.field('library', day('release', 'Comes out'));
      app.view('library', { ...calendar({ start: 'release', color: 'type', upcoming: true }), id: 'releases', name: 'Coming out' });
    }
    app.view('library', { id: 'up-next', name: 'Up next', conditions: [{ field: 'status', op: 'is', value: ['Up next'] }] });
    app.view('library', { id: 'in-progress', name: 'In progress', conditions: [{ field: 'status', op: 'is', value: ['In progress'] }], ...(progress && { sort: { key: 'percent', dir: 'desc' as const } }) });
    app.view('library', { id: 'this-year', name: 'Finished this year', conditions: [{ field: 'this_year', op: 'true' }], sort: { key: 'finished', dir: 'desc' } });
    app.view('library', { id: 'by-type', name: 'By type', conditions: [], group: 'type' });
    if (services.length > 0) app.view('library', { id: 'by-where', name: 'By where', conditions: [], group: 'where' });
    app.view('library', { ...calendar({ start: 'finished', color: 'type', upcoming: false }, [{ field: 'status', op: 'is', value: ['Done'] }]), id: 'finished', name: 'Finished' });
    app.rule('library', { kind: 'check', name: 'A rating is from 1 to 5', src: 'check("rating", () => empty(rating) || (rating >= 1 && rating <= 5), "A rating is from 1 to 5")' });
    app.rule('library', {
      kind: 'onSave',
      name: 'Its days',
      src: `onSave("Its days", () => {
  if (status == "In progress" && empty(started)) started = today()
  if (status == "Done" && empty(finished)) finished = today()${
    years
      ? `
  if (status == "Done" && !empty(finished) && (empty(read_in) || read_in.name != text(year(finished)))) {
    let y = find("${yearsCalled}", { name: text(year(finished)) })[0]
    const known = find("${yearsCalled}")[0]
    if (empty(y) && !empty(known)) y = add("${yearsCalled}", { name: text(year(finished)), start: known.start + years(year(finished) - year(known.start)) })
    if (!empty(y)) read_in = y
  }`
      : ''
  }
})`,
    });
    if (progress) {
      app.rule('library', {
        kind: 'action',
        name: 'Update',
        src: `action("Update", {
  say: () => name + ": how far now, in " + unit,
  ask: { now: { label: "Now at", type: "number", default: () => done, required: true } },
}, () => {
  add("${app.called('reading-log')}", { item: this, amount: input.now - (done || 0), date: today() })
  done = input.now
  if (status == "Want" || status == "Up next" || status == "Paused") status = "In progress"
  if (total > 0 && input.now >= total) status = "Done"
})`,
      });
    }

    app.field('reading-lists', nameField());
    app.field('reading-lists', text('note', 'Note'));
    app.field('reading-lists', rollup('works', 'Works', library, 'count'));
    app.block('reading-lists', { block: 'linked', collection: library, style: 'list', fields: ['type', 'status'] });

    if (progress) {
      app.field('reading-log', nameField());
      app.field('reading-log', { ...link('item', 'Work', library), required: true });
      app.field('reading-log', day('date', 'Day', true));
      app.field('reading-log', number('amount', 'How much'));
      app.field('reading-log', formula('unit', 'In', 'item.unit'));
      app.field('reading-log', formula('this_week', 'This week', 'today() - date < 7'));
      if (years) app.field('reading-log', link('year', 'Year', app.path('reading-years')));
      app.view('reading-log', { id: 'this-week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }], group: 'unit' });
      app.block('library', { block: 'linked', collection: app.path('reading-log'), style: 'table', fields: ['date', 'amount'], sort: 'date', sums: true });
      app.rule('reading-log', {
        kind: 'onSave',
        name: 'The day',
        src: `onSave("The day", () => {
  if (empty(name) && !empty(item)) name = item.name + " · " + text(amount) + " " + item.unit${
    years
      ? `
  if (empty(year)) year = find("${yearsCalled}", { name: text(year(date)) })[0]
  if (!empty(year) && empty(old.date)) {
    if (empty(year.last_day) || date - year.last_day > 1) update(year, { streak: 1, last_day: date })
    else if (date - year.last_day == 1) update(year, { streak: year.streak + 1, last_day: date })
  }`
      : ''
  }
})`,
      });
    }

    if (years) {
      const yearOf = app.today.slice(0, 4);
      app.field('reading-years', nameField('Year'));
      app.field('reading-years', day('start', 'From'));
      app.field('reading-years', number('target', 'Goal'));
      app.field('reading-years', rollup('finished', 'Finished', library, 'count', undefined, [{ field: 'status', op: 'is', value: ['Done'] }]));
      app.field('reading-years', formula('projected', 'At this pace', 'year(start) < year(today()) ? finished : round(finished * 365 / max(1, today() - start + 1))'));
      app.field('reading-years', formula('pace', 'Pace', 'empty(target) ? "" : projected >= target ? "On track" : "Behind"'));
      if (progress) {
        const log = app.path('reading-log');
        app.field('reading-years', rollup('pages', 'Pages', log, 'sum', 'amount', [{ field: 'unit', op: 'is', value: ['pages'] }]));
        app.field('reading-years', rollup('episodes', 'Episodes', log, 'sum', 'amount', [{ field: 'unit', op: 'is', value: ['episodes'] }]));
        app.field('reading-years', number('streak', 'Days in a row'));
        app.field('reading-years', day('last_day', 'Last day'));
        app.field('reading-years', formula('days_now', 'Days in a row now', 'empty(last_day) || today() - last_day > 1 ? 0 : streak'));
      }
      app.block('reading-years', { block: 'linked', collection: library, style: 'list', fields: ['type', 'rating', 'finished'], sort: 'finished' });
      app.record('reading-years', { name: yearOf, start: `${yearOf}-01-01`, ...(goal > 0 && { target: goal }) });
    }

    if (quotes) {
      app.field('quotes', nameField('Quote'));
      app.field('quotes', { ...link('item', 'From', library), required: true });
      app.field('quotes', text('where', 'Page or chapter'));
      app.field('quotes', multi('tags', 'Tags', []));
      app.block('library', { block: 'linked', collection: app.path('quotes'), style: 'list', fields: ['where'] });
    }

    app.about({
      title: 'Reading and watching',
      what: `What you read, watch and play${types.length > 0 ? ` (${types.map((t) => t.toLowerCase()).join(', ')})` : ''}: where to find each, ${progress ? 'how far you are, ' : ''}what is next and what you thought${goal > 0 ? `; a goal of ${goal} this year` : ''}.`,
      pieces: ['library', 'reading-lists', ...(progress ? ['reading-log'] : []), ...(years ? ['reading-years'] : []), ...(quotes ? ['quotes'] : [])],
      glance: [
        ...(progress ? ['Update writes how far you got', 'Done at the last page or episode'] : []),
        ...(years ? ['What you finished this year, and the pace'] : []),
        ...(progress ? ['Days in a row'] : []),
        ...(releases ? ['What comes out, in Upcoming'] : []),
        ...(lending ? ['What you lent, back by its day'] : []),
      ],
      how: [
        'Add what you want to read, watch or play: its title is enough; add who made it, its year and its info link (IMDb, Goodreads, MyAnimeList) as you like, and where to find it with its link.',
        'Set it Up next, In progress, Done or Dropped; rate it from 1 to 5 and write what you thought in its notes.',
        ...(progress ? ['Press Update as you go: write the page, the episode or the chapter you are at.'] : []),
        'Put it on your own lists: for the summer, award nominees, what a friend picked.',
        ...(quotes ? ['Keep the lines you like as quotes, with where they are.'] : []),
        ...(lending ? ['When you lend one, write to whom and when it should come back.'] : []),
        ...(releases ? ['For one not out yet, write the day it comes out.'] : []),
        'An agent can fill in the rest from its title: who made it, its year, its pages or episodes and its info link.',
      ],
      auto: [
        'It gets its start day when it is In progress, and its end day when it is Done.',
        ...(progress ? ['Update writes in the log how much you read or watched, and makes it In progress; at its last page or episode it is Done. Its progress is counted in pages, episodes, chapters, minutes or hours by its type.'] : []),
        ...(years ? [`Each year counts what you finished in it${progress ? ', its pages and its episodes, and your days in a row' : ''}, and at this pace how many by its end${goal > 0 ? `, against your goal of ${goal}` : ''}.`] : []),
        'A rating that is not from 1 to 5 is marked.',
        ...(lending ? ['What you lent comes to Upcoming on the day it should be back; one not back by then is marked.'] : []),
        ...(releases ? ['What comes out comes to Today and Upcoming on its day.'] : []),
      ],
      work: ['What you read or watch next, and how you choose.'],
    });
  },
};
