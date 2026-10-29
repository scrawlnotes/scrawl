import type { MessageKey } from '@scrawlnotes/i18n';
import type { Condition, Field } from '../../collection';
import { calendar, day, formula, link, multi, nameField, number, PERCENT, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Reading and watching (design/more-apps.md 4.8), as Sequel, MyAnimeList and StoryGraph keep one:
// each kind its own screen, the works of one collection by their kind; statuses in each kind's
// words, Watching for an anime and Reading for a book; how far in pages, episodes or chapters, +1 a
// click, Update a page; the days a new episode comes out in Today; a goal for the year.

const TYPES = ['Book', 'Film', 'Series', 'Anime', 'Manga', 'Webtoon', 'Podcast', 'Game'];
const TYPE_COLORS = { Book: 'blue', Film: 'red', Series: 'purple', Anime: 'pink', Manga: 'orange', Webtoon: 'teal', Podcast: 'yellow', Game: 'green' } as const;
/** Each kind's screen: its name and its id. */
const SCREENS: { [type: string]: [string, string] } = {
  Book: ['Books', 'books'],
  Film: ['Films', 'films'],
  Series: ['Series', 'series'],
  Anime: ['Anime', 'anime'],
  Manga: ['Manga', 'manga'],
  Webtoon: ['Webtoons', 'webtoons'],
  Podcast: ['Podcasts', 'podcasts'],
  Game: ['Games', 'games'],
};
/** In the order a screen's groups come: what is going on first, what is over last. */
const STATUSES = ['In progress', 'Want', 'Paused', 'Done', 'Dropped'];
const STATUS_COLORS = { 'In progress': 'orange', Want: 'gray', Paused: 'yellow', Done: 'green', Dropped: 'red' } as const;
const READ = { 'In progress': 'Reading', Want: 'Plan to read', Paused: 'On hold', Done: 'Completed', Dropped: 'Dropped' };
const WATCH = { 'In progress': 'Watching', Want: 'Plan to watch', Paused: 'On hold', Done: 'Completed', Dropped: 'Dropped' };
/** Each kind's words for the statuses, as MyAnimeList, StoryGraph and Sequel say them; a film is only to watch or watched. */
const WORDS: { [type: string]: { [status: string]: string } } = {
  Book: READ,
  Manga: READ,
  Webtoon: READ,
  Series: WATCH,
  Anime: WATCH,
  Podcast: { 'In progress': 'Listening', Want: 'Plan to listen', Paused: 'On hold', Done: 'Completed', Dropped: 'Dropped' },
  Film: { Want: 'To watch', Done: 'Watched' },
  Game: { 'In progress': 'Playing', Want: 'Wishlist', Paused: 'On hold', Done: 'Played', Dropped: 'Dropped' },
};
/** The genres each kind comes with, enough to find the one looked for. */
const GENRES: { [type: string]: string[] } = {
  Book: ['Fiction', 'Non-fiction', 'Classic', 'Fantasy', 'Science fiction', 'Mystery', 'Thriller', 'Horror', 'Romance', 'Historical', 'Literary', 'Biography', 'Memoir', 'History', 'Science', 'Philosophy', 'Psychology', 'Business', 'Self-help', 'Poetry', 'Essays', 'Young adult', 'Children'],
  Film: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Historical', 'Horror', 'Musical', 'Mystery', 'Romance', 'Science fiction', 'Thriller', 'War', 'Western'],
  Series: ['Action', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Fantasy', 'Historical', 'Horror', 'Mystery', 'Reality', 'Romance', 'Science fiction', 'Sitcom', 'Thriller'],
  Anime: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Isekai', 'Mecha', 'Mystery', 'Psychological', 'Romance', 'Science fiction', 'Seinen', 'Shoujo', 'Shounen', 'Slice of life', 'Sports', 'Supernatural', 'Thriller'],
  Manga: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Isekai', 'Josei', 'Mystery', 'Psychological', 'Romance', 'Seinen', 'Shoujo', 'Shounen', 'Slice of life', 'Sports', 'Supernatural'],
  Webtoon: ['Action', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Romance', 'Slice of life', 'Superhero', 'Supernatural', 'Thriller'],
  Podcast: ['Comedy', 'Culture', 'Education', 'History', 'Interviews', 'News', 'Science', 'Society', 'Sports', 'Technology', 'True crime'],
  Game: ['Action', 'Adventure', 'Fighting', 'Platformer', 'Puzzle', 'Racing', 'Roguelike', 'RPG', 'Shooter', 'Simulation', 'Sports', 'Strategy', 'Survival'],
};
const SERVICES = ['Netflix', 'Max', 'Disney+', 'Prime Video', 'Apple TV+', 'Hulu', 'YouTube', 'Crunchyroll', 'Webtoon', 'Kindle', 'Paper'];
const SERVICES_TR = ['Netflix', 'Disney+', 'Prime Video', 'Max', 'Exxen', 'TOD', 'Gain', 'Mubi', 'YouTube', 'Crunchyroll', 'Webtoon', 'Kindle', 'Paper'];
const GOALS = ['none', '12', '24', '36', '52'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The kinds that go a part at a time, +1 a click: an episode, a chapter. */
const PARTS = ['Series', 'Anime', 'Manga', 'Webtoon', 'Podcast'];
/** The kinds that come out a part a week while they are going on. */
const WEEKLY = ['Series', 'Anime', 'Manga', 'Webtoon', 'Podcast'];
const READS = ['Manga', 'Webtoon'];
const is = (types: string[]): Condition[] => [{ field: 'type', op: 'is', value: types }];
const isText = (types: string[]) => types.map((t) => `type == ${JSON.stringify(t)}`).join(' || ') || 'false';
/** A field's label by the kind: Pages for a book, Episodes for an anime. */
const by = (labels: { [type: string]: string }): Pick<Field, 'labelBy'> => ({ labelBy: { field: 'type', labels } });
const each = (types: string[], label: string) => Object.fromEntries(types.map((t) => [t, label]));

export const reading: AppTemplate = {
  id: 'reading',
  version: 2,
  group: 'life',
  name: 'apps.reading.name',
  short: 'apps.reading.short',
  icon: 'quote',
  what: 'apps.reading.what',
  goesWith: ['people'],
  questions: [
    { key: 'types', kind: 'multi', label: 'apps.reading.types', options: TYPES.map((value) => ({ value, label: `apps.reading.type.${value.toLowerCase()}` as MessageKey })), default: TYPES },
    { key: 'services', kind: 'list', label: 'apps.reading.services', default: SERVICES, regional: { TR: SERVICES_TR }, help: 'apps.reading.servicesHelp', add: 'apps.reading.addService' },
    { key: 'goal', kind: 'choice', label: 'apps.reading.goal', options: GOALS.map((value) => ({ value, label: `apps.reading.goal.${value}` as MessageKey })), default: 'none' },
    { key: 'quotes', kind: 'yesno', label: 'apps.reading.quotes', default: true },
    { key: 'lending', kind: 'yesno', label: 'apps.reading.lending', default: false },
    { key: 'releases', kind: 'yesno', label: 'apps.reading.releases', default: true, help: 'apps.reading.releasesHelp' },
  ],
  money: () => false,
  pieces: (answers) => ['library', 'reading-lists', 'reading-log', 'reading-years', ...(answers.quotes !== false ? ['quotes'] : [])],
  // Each kind chosen is a screen of the library, in the order of the kinds.
  menu: (answers) => [...typesOf(answers).map((type) => ({ role: 'library', view: SCREENS[type]![1], name: SCREENS[type]![0] })), 'reading-lists', 'quotes', 'reading-years'],
  build(app, answers) {
    const types = typesOf(answers);
    const services = (answers.services as string[] | undefined) ?? SERVICES;
    const quotes = app.hasPiece('quotes');
    const lending = answers.lending === true;
    const releases = answers.releases !== false;
    const goal = Number(answers.goal) || 0;
    const library = app.path('library');
    const log = app.called('reading-log');
    const years = app.called('reading-years');
    const parts = types.filter((t) => PARTS.includes(t));
    const weekly = types.filter((t) => WEEKLY.includes(t));
    const words = Object.fromEntries(types.map((t) => [t, WORDS[t]!]));
    const genres = [...new Set(types.flatMap((t) => GENRES[t]!))].sort();

    app.field('library', nameField('Title'));
    app.field('library', select('type', 'Type', types, TYPE_COLORS, types[0]));
    app.field('library', { ...select('status', 'Status', STATUSES, STATUS_COLORS, 'Want'), choicesBy: { field: 'type', by: words } });
    app.field('library', { ...text('by', 'By'), suggest: true, ...by({ Book: 'Author', Manga: 'Author', Webtoon: 'Author', Film: 'Director', Series: 'Created by', Anime: 'Studio', Podcast: 'Host', Game: 'Developer' }) });
    app.field('library', number('year', 'Year'));
    // How far: a page, an episode, a chapter; of how many. A film and a game have none.
    const counted = types.filter((t) => t !== 'Film' && t !== 'Game');
    app.field('library', { ...number('season', 'Season'), when: is(['Series']) });
    app.field('library', { ...number('done', 'At'), when: is(counted), ...by({ Book: 'Page', ...each(['Series', 'Anime', 'Podcast'], 'Episode'), ...each(READS, 'Chapter') }) });
    app.field('library', { ...number('total', 'Of'), when: is(counted), ...by({ Book: 'Pages', ...each(['Series', 'Anime', 'Podcast'], 'Episodes'), ...each(READS, 'Chapters') }) });
    app.field('library', { ...number('volume', 'Volume'), when: is(['Manga']) });
    app.field('library', { ...number('volumes', 'Volumes'), when: is(['Manga']) });
    app.field('library', { ...number('runtime', 'Runtime', { format: { style: 'duration' } }), when: is(['Film']), help: 'In minutes' });
    app.field('library', { ...text('platform', 'Platform'), suggest: true, when: is(['Game']) });
    app.field('library', { ...number('hours', 'Hours to beat'), when: is(['Game']) });
    app.field('library', { ...number('rating', 'Score'), help: 'From 1 to 5' });
    app.field('library', { ...multi('genres', 'Genres', genres), chips: true, choicesBy: { field: 'type', by: Object.fromEntries(types.map((t) => [t, Object.fromEntries(GENRES[t]!.map((g) => [g, g]))])) } });
    if (services.length > 0) app.field('library', select('where', 'Where', services));
    app.field('library', { key: 'watch', label: 'Its link', type: 'url' });
    app.field('library', { key: 'info', label: 'Info', type: 'url', help: 'IMDb, Goodreads, MyAnimeList or another page' });
    app.field('library', { key: 'cover', label: 'Cover', type: 'url' });
    app.field('library', app.hasPiece('close-people') ? link('recommended', 'Recommended by', app.path('close-people')) : { ...text('recommended', 'Recommended by'), suggest: true });
    if (weekly.length > 0) {
      app.field('library', {
        ...multi('airs', 'New episode every', WEEK),
        chips: true,
        when: is(weekly),
        ...by(each(READS, 'New chapter every')),
        help: 'While it is coming out: that day it comes to Today. Left empty, it does not.',
      });
    }
    app.field('library', link('lists', 'Lists', app.path('reading-lists'), true));
    // Written by themselves: the days it was started and finished, the year it counts in.
    app.field('library', day('started', 'Started'));
    app.field('library', day('finished', 'Finished'));
    app.field('library', link('read_in', 'Finished in', app.path('reading-years')));
    if (lending) {
      app.field('library', { ...text('lent_to', 'Lent to'), when: is(['Book', 'Manga']) });
      app.field('library', { ...day('lent_on', 'Lent on'), when: is(['Book', 'Manga']) });
      app.field('library', { ...day('back_by', 'Back by'), when: is(['Book', 'Manga']) });
    }
    if (releases) app.field('library', day('release', 'Comes out'));

    // What its rows and its window say, in its kind's words: "E6 / 12", "p. 212 / 476", "Ch. 254 / 374 · Vol. 22 / 42".
    app.field('library', formula('unit', 'In', 'type == "Book" ? "pages" : type == "Manga" || type == "Webtoon" ? "chapters" : type == "Film" ? "minutes" : type == "Game" ? "hours" : "episodes"'));
    app.field('library', formula('status_said', 'Status', wordsOf(words, (w) => w)));
    app.field(
      'library',
      formula(
        'progress_said',
        'How far',
        `type == "Film" || type == "Game" ? "" : status == "Want" ? (total > 0 ? text(total) + " " + unit : "") : (type == "Book" ? "p. " : type == "Manga" || type == "Webtoon" ? "Ch. " : (type == "Series" && season > 0 ? "S" + text(season) + " · " : "") + "E") + text(done || 0) + (total > 0 ? " / " + text(total) : "") + (type == "Manga" && volumes > 0 ? " · Vol. " + text(volume || 0) + " / " + text(volumes) : "")`,
      ),
    );
    app.field('library', formula('percent', 'Progress',`status == "Want" || !(total > 0) || type == "Film" || type == "Game" ? null : min(1, (done || 0) / total)`, { ...PERCENT, bar: true, caption: 'progress_said' }));
    if (weekly.length > 0) {
      // One day is said whole, "Every Sunday"; more as the choice has them, "Every Wed, Sun".
      const one = WEEK.map((d, i) => `text(airs) == "${d}" ? "Every ${WEEKDAYS[i]}"`).join(' : ');
      // Today's is new until something of it is written today.
      app.field('library', rollup('last_seen', 'Last read or watched', app.path('reading-log'), 'max', 'date'));
      app.field('library', formula('next_episode', 'Next out', `empty(airs) || status != "In progress" ? "" : contains(airs, weekday(today())) && last_seen != today() ? "New " + (type == "Manga" || type == "Webtoon" ? "chapter" : "episode") + " today" : ${one} : "Every " + text(airs)`));
      // In Today: "E7 out", "Ch. 161 out".
      app.field('library', formula('out_said', 'Out', `(type == "Manga" || type == "Webtoon" ? "Ch. " : "E") + text((done || 0) + 1) + " out"`));
    }
    const recommended = app.hasPiece('close-people') ? 'recommended.name' : 'recommended';
    app.field(
      'library',
      formula(
        'note_said',
        'Note',
        `status == "In progress" && ${weekly.length > 0 ? '!empty(next_episode)' : 'false'} ? ${weekly.length > 0 ? 'next_episode' : '""'} : status == "In progress" && total > 0 && (${isText(parts)}) ? text(total - (done || 0)) + " to go" : status == "In progress" && !empty(started) ? "since " + text(monthday(started)) + " " + monthname(started) : status == "Want" && !empty(recommended) ? ${recommended} + " recommended"${releases ? ' : status == "Want" && !empty(release) && release > today() ? "comes out " + text(monthday(release)) + " " + monthname(release)' : ''} : ""`,
      ),
    );
    // Under its name in the table: who made it and how long, or its year and where.
    const pages = 'total > 0 ? text(total) + " pages" : ""';
    const where = services.length > 0 ? 'where' : '""';
    app.field(
      'library',
      formula(
        'line',
        'Says',
        `type == "Book" ? ${two('by', pages)} : type == "Manga" || type == "Webtoon" ? ${two('by', where)} : type == "Film" ? ${two(two('by', 'text(year)'), 'empty(runtime) ? "" : text(runtime) + " min"')} : type == "Game" ? ${two('platform', 'empty(hours) ? "" : text(hours) + " h to beat"')} : ${two('text(year)', where)}`,
      ),
    );
    // Under its title in its window: "Anime · 2023 · 28 episodes · Crunchyroll · watching since 2 Oct".
    const since = (day: string) => `text(monthday(${day})) + " " + monthname(${day})`;
    app.field(
      'library',
      formula(
        'said',
        'Says',
        `type${and('text(year)')}${and('total > 0 ? text(total) + " " + unit : ""')}${services.length > 0 ? and('where') : ''}${and(`status == "In progress" && !empty(started) ? status_lower + " since " + ${since('started')} : status == "Done" && !empty(finished) ? status_lower + " " + ${since('finished')} : ""`)}`,
      ),
    );
    app.field('library', formula('status_lower', 'Status', wordsOf(words, (w) => w.toLowerCase())));
    app.field('library', formula('this_year', 'Finished this year', '!empty(finished) && year(finished) == year(today())'));
    app.head('library', 'said');
    app.line('library', 'line', 'cover');
    app.formOrder('library', ['name', 'type', 'status', 'by', 'year', 'season', 'done', 'total', 'volume', 'volumes', 'runtime', 'platform', 'hours', 'rating', 'genres', 'where', 'watch', 'info', 'airs', 'recommended']);
    app.newForm('library', ['total', 'where', 'status', 'airs', 'recommended']);

    // A screen for each kind: its works by their status, what is over closed; +1 or Update on each row.
    for (const type of types) {
      const [name, id] = SCREENS[type]!;
      const button = PARTS.includes(type) ? '+1' : type === 'Book' ? 'Update' : undefined;
      const columns = (type === 'Film' ? ['where', 'rating', 'recommended'] : type === 'Game' ? ['platform', 'rating', 'note_said'] : ['percent', 'rating', 'note_said']).filter((k) => k !== 'where' || services.length > 0);
      app.view('library', { id, name, conditions: is([type]), sort: { key: 'status', dir: 'asc' }, group: 'status', closed: ['Done', 'Dropped'], columns, ...(button && { button }) }, type === types[0]);
    }
    app.tableColumns('library', ['type', 'percent', 'rating', 'note_said']);
    app.homeTile('library', { value: 'progress_said' });
    if (lending && types.some((t) => t === 'Book' || t === 'Manga')) {
      app.view('library', { ...calendar({ start: 'back_by', upcoming: true }, [{ field: 'lent_to', op: 'not-empty' }]), id: 'lent', name: 'Lent', hidden: true });
      app.rule('library', { kind: 'check', name: 'Not back', src: 'check("back_by", () => empty(lent_to) || empty(back_by) || back_by >= today(), `${lent_to} has it since ${text(lent_on)}`)' });
    }
    if (releases) app.view('library', { ...calendar({ start: 'release', color: 'type', upcoming: true }), id: 'releases', name: 'Coming out', hidden: true });
    // A new episode on its days: in Today with Watched, or Read for a chapter; a day missed is gone.
    const airing = (types: string[], label: string, id: string) => {
      if (types.length === 0) return;
      app.view('library', {
        id,
        name: 'New episodes',
        kind: 'calendar',
        hidden: true,
        conditions: [...is(types), { field: 'status', op: 'is', value: ['In progress'] }, { field: 'airs', op: 'not-empty' }],
        calendar: {
          start: 'started',
          upcoming: 'today',
          words: ['out_said', where === '""' ? 'progress_said' : 'where'],
          repeat: { days: 'airs', closedBy: { collection: app.path('reading-log'), link: 'item', day: 'date' }, start: false, skip: { label, set: { amount: 1, aired: true } }, late: false },
        },
      });
    };
    airing(weekly.filter((t) => !READS.includes(t)), 'Watched', 'airing');
    airing(weekly.filter((t) => READS.includes(t)), 'Read', 'airing-read');
    app.rule('library', { kind: 'check', name: 'A score is from 1 to 5', src: 'check("rating", () => empty(rating) || (rating >= 1 && rating <= 5), "A score is from 1 to 5")' });
    app.rule('library', {
      kind: 'onSave',
      name: 'Its days',
      src: `onSave("Its days", () => {
  if (type == "Film" && status != "Want" && status != "Done") status = old.status == "Done" ? "Done" : "Want"
  if (status == "In progress" && empty(started)) started = today()
  if (status == "Done" && empty(finished)) finished = today()
  if (status != "Done") finished = null
  if (total > 0 && done > total) done = total
  if (status == "Done" && !empty(finished) && (empty(read_in) || read_in.name != text(year(finished)))) {
    let y = find("${years}", { name: text(year(finished)) })[0]
    const known = find("${years}")[0]
    if (empty(y) && !empty(known)) y = add("${years}", { name: text(year(finished)), start: known.start + years(year(finished) - year(known.start)) })
    if (!empty(y)) read_in = y
  }
})`,
    });
    // +1: an episode or a chapter, written in the log; the last one finishes it.
    if (parts.length > 0) {
      app.rule('library', {
        kind: 'action',
        name: '+1',
        src: `action("+1", {
  when: () => (${isText(parts)}) && status != "Done" && status != "Dropped" && !(total > 0 && done >= total),
  done: () => name + " · " + (type == "Manga" || type == "Webtoon" ? "chapter " : "episode ") + text(done) + (type == "Manga" || type == "Webtoon" ? " read" : " watched"),
}, () => {
  done = (done || 0) + 1
  add("${log}", { item: this, amount: 1, date: today() })
  if (status != "In progress") status = "In progress"
  if (total > 0 && done >= total) status = "Done"
})`,
      });
    }
    if (types.includes('Book')) {
      app.rule('library', {
        kind: 'action',
        name: 'Update',
        src: `action("Update", {
  when: () => type == "Book" && status != "Done" && status != "Dropped",
  say: () => name + ": the page you are at",
  ask: { now: { label: "Page", type: "number", default: () => done, required: true } },
}, () => {
  if (input.now > (done || 0)) add("${log}", { item: this, amount: input.now - (done || 0), date: today() })
  done = input.now
  if (status != "In progress") status = "In progress"
  if (total > 0 && input.now >= total) status = "Done"
})`,
      });
    }

    // The log: what was read or watched each day, written by +1, Update and Watched.
    app.field('reading-log', nameField());
    app.field('reading-log', { ...link('item', 'Work', library), required: true });
    app.field('reading-log', day('date', 'Day', true));
    app.field('reading-log', number('amount', 'How much'));
    app.field('reading-log', { key: 'aired', label: 'From Today', type: 'checkbox' });
    app.field('reading-log', formula('unit', 'In', 'item.unit'));
    app.field('reading-log', formula('this_week', 'This week', 'today() - date < 7'));
    app.field('reading-log', link('year', 'Year', app.path('reading-years')));
    // On the right, as MyAnimeList has it: how far, +1 beside it, then the days it was read or watched.
    for (const key of ['season', 'done', 'volume']) app.place('library', key, 2);
    app.block('library', { block: 'actions', column: 2 });
    // Written by the buttons, not typed in: no ▸ under each row, no lines to add to a new one.
    app.block('library', { block: 'linked', collection: app.path('reading-log'), style: 'list', title: 'Log', fields: ['date', 'amount'], sort: 'date', column: 2, lines: false });
    app.rule('reading-log', {
      kind: 'onSave',
      name: 'The day',
      src: `onSave("The day", () => {
  if (aired && empty(old.date) && !empty(item)) {
    update(item, { done: (item.done || 0) + amount, status: item.total > 0 && (item.done || 0) + amount >= item.total ? "Done" : "In progress" })
  }
  if (empty(name) && !empty(item)) name = item.name + " · " + text(amount) + " " + (amount == 1 ? (item.unit == "pages" ? "page" : item.unit == "chapters" ? "chapter" : item.unit == "minutes" ? "minute" : item.unit == "hours" ? "hour" : "episode") : item.unit)
  if (empty(year)) year = find("${years}", { name: text(year(date)) })[0]
  if (!empty(year) && empty(old.date)) {
    if (empty(year.last_day) || date - year.last_day > 1) update(year, { streak: 1, last_day: date })
    else if (date - year.last_day == 1) update(year, { streak: year.streak + 1, last_day: date })
  }
})`,
    });

    app.field('reading-lists', nameField());
    app.field('reading-lists', text('note', 'Note'));
    app.field('reading-lists', rollup('works', 'Works', library, 'count'));
    app.block('reading-lists', { block: 'linked', collection: library, style: 'list', fields: ['type', 'status'] });

    const yearOf = app.today.slice(0, 4);
    app.field('reading-years', nameField('Year'));
    app.field('reading-years', day('start', 'From'));
    app.field('reading-years', number('target', 'Goal'));
    app.field('reading-years', rollup('finished', 'Finished', library, 'count', undefined, [{ field: 'status', op: 'is', value: ['Done'] }]));
    app.field('reading-years', formula('projected', 'At this pace', 'year(start) < year(today()) ? finished : round(finished * 365 / max(1, today() - start + 1))'));
    app.field('reading-years', formula('pace', 'Pace', 'empty(target) ? "" : projected >= target ? "On track" : "Behind"'));
    app.field('reading-years', rollup('pages', 'Pages', app.path('reading-log'), 'sum', 'amount', [{ field: 'unit', op: 'is', value: ['pages'] }]));
    app.field('reading-years', rollup('episodes', 'Episodes', app.path('reading-log'), 'sum', 'amount', [{ field: 'unit', op: 'is', value: ['episodes'] }]));
    app.field('reading-years', number('streak', 'Days in a row'));
    app.field('reading-years', day('last_day', 'Last day'));
    app.field('reading-years', formula('days_now', 'Days in a row now', 'empty(last_day) || today() - last_day > 1 ? 0 : streak'));
    app.field('reading-years', formula('said', 'Says', 'text(finished) + (empty(target) ? " finished" : " of " + text(target) + " finished") + (pace == "On track" ? " · on track" : pace == "Behind" ? " · behind" : "")'));
    app.block('reading-years', { block: 'linked', collection: library, style: 'list', fields: ['type', 'rating', 'finished'], sort: 'finished' });
    app.homeTile('reading-years', { value: 'said' });
    app.record('reading-years', { name: yearOf, start: `${yearOf}-01-01`, ...(goal > 0 && { target: goal }) });

    if (quotes) {
      app.field('quotes', nameField('Quote'));
      app.field('quotes', { ...link('item', 'From', library), required: true });
      app.field('quotes', text('where', 'Page or chapter'));
      app.field('quotes', multi('tags', 'Tags', []));
      app.block('library', { block: 'linked', collection: app.path('quotes'), style: 'list', fields: ['where'], column: 2 });
    }

    const screens = types.map((t) => SCREENS[t]![0]);
    app.about({
      title: 'Reading and watching',
      what: `What you read, watch and play, each kind on its own screen (${screens.join(', ')}): where to find each, how far you are, what is next and what you thought${goal > 0 ? `; a goal of ${goal} this year` : ''}.`,
      pieces: ['library', 'reading-lists', 'reading-log', 'reading-years', ...(quotes ? ['quotes'] : [])],
      glance: [
        'Each kind its own screen, in its own words',
        ...(parts.length > 0 ? ['+1 writes an episode or a chapter'] : []),
        ...(types.includes('Book') ? ['Update writes the page you are at'] : []),
        ...(weekly.length > 0 ? ['A new episode in Today on its day'] : []),
        'What you finished this year, and the pace',
        ...(releases ? ['What comes out, in Upcoming'] : []),
        ...(lending ? ['What you lent, back by its day'] : []),
      ],
      how: [
        `Add what you want to read, watch or play on its kind's screen (${screens.join(', ')}): its title is enough, and it is of that kind.`,
        'It starts as one you plan to; set it going, on hold, finished or dropped, each in its kind\'s words; score it from 1 to 5 and write what you thought in its notes.',
        ...(parts.length > 0 ? ['Press +1 as you watch an episode or read a chapter; the last one finishes it.'] : []),
        ...(types.includes('Book') ? ['Press Update on a book to write the page you are at.'] : []),
        ...(weekly.length > 0 ? ['For one still coming out, pick the days a new episode or chapter comes: that day it is in Today with Watched or Read.'] : []),
        'Put it on your own lists: for the summer, award nominees, what a friend picked.',
        ...(quotes ? ['Keep the lines you like as quotes, with where they are.'] : []),
        ...(lending ? ['When you lend a book, write to whom and when it should come back.'] : []),
        ...(releases ? ['For one not out yet, write the day it comes out.'] : []),
        'An agent can fill in the rest from its title: who made it, its year, its pages or episodes and its info link.',
      ],
      auto: [
        'It gets its start day when it is going, and its end day when it is finished.',
        'Each +1, Update and Watched is written in the log, day by day in its window; at its last page, episode or chapter it is finished.',
        `Each year counts what you finished in it, its pages and its episodes, and your days in a row, and at this pace how many by its end${goal > 0 ? `, against your goal of ${goal}` : ''}.`,
        'A score that is not from 1 to 5 is marked.',
        ...(lending ? ['What you lent comes to Upcoming on the day it should be back; one not back by then is marked.'] : []),
        ...(releases ? ['What comes out comes to Today and Upcoming on its day.'] : []),
      ],
      work: ['What you read or watch next, and how you choose.'],
    });
  },
};

/** Two texts of a formula with a dot between them, either left out when it is empty. */
const two = (a: string, b: string) => `(empty(${a}) ? (${b}) : empty(${b}) ? (${a}) : (${a}) + " · " + (${b}))`;

/** A text after the one before it with a dot, nothing when it is empty. */
const and = (x: string) => ` + (empty(${x}) ? "" : " · " + (${x}))`;

/** A work's status in its kind's words, as `say` writes them: Watching for an anime's In progress. */
function wordsOf(words: { [type: string]: { [status: string]: string } }, say: (w: string) => string): string {
  const ofType = (names: { [status: string]: string }) => `${Object.entries(names).map(([s, w]) => `status == ${JSON.stringify(s)} ? ${JSON.stringify(say(w))}`).join(' : ')} : status`;
  return `${Object.entries(words).map(([type, names]) => `type == ${JSON.stringify(type)} ? (${ofType(names)})`).join(' : ')} : status`;
}

/** The kinds chosen; none chosen, all of them. */
function typesOf(answers: { [key: string]: unknown }): string[] {
  const listed = ((answers.types as string[] | undefined) ?? []).filter((t) => TYPES.includes(t));
  return listed.length > 0 ? TYPES.filter((t) => listed.includes(t)) : TYPES;
}
