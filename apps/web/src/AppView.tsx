import {
  APP_TEMPLATES,
  type AppFile,
  type AppLook,
  type AppModule,
  type AppScreen,
  type Board,
  type Card,
  type Collection,
  computerFor,
  type DueRecord,
  matchesConditions,
  recordProblems,
  recordTitle,
  sortRecords,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type MouseEvent, type ReactNode, useMemo } from 'react';
import { Icon, type IconName } from './Icon';
import { CardRow, RecordRow, recordKey, splitDueCards, type TaskActions } from './Tasks';

// An app is shown as an app, not as its files (design/app-home.md 5): its tab has its name, Home
// and its modules on top, a template each; under them the module's menu, its main screens; and the
// screen open, the collection or the board as it is anywhere else. With one template the screens
// are on top beside Home. Home says what is due today in the app and, for each module, its screens
// with how many records each holds and how many to check.

/** How many a screen holds, as Home says it: "12", "8 this month", "6 open"; and how many to check. */
interface Count {
  text: string;
  check: number;
}

/** The first records of a screen, for its box on the Home of an app of one template. */
interface Glance {
  count: Count;
  first: string[];
}

/** A screen's count and its first records: a collection by the view it opens on, a board by its open cards, a folder by its notes. */
function glanceOf(screen: AppScreen, collections: Record<string, Collection>, boards: Record<string, Board>, notes: Record<string, string[]>, today: string): Glance | null {
  if (screen.kind === 'board') {
    const board = boards[screen.path];
    if (!board) return null;
    const closed = new Set(board.columns.filter((c) => c.kind === 'done' || c.kind === 'dropped').map((c) => c.id));
    const open = board.cards.filter((card) => !closed.has(card.column));
    return { count: { text: t('app.open', { count: open.length }), check: 0 }, first: open.slice(0, 4).map((card: Card) => card.title) };
  }
  if (screen.kind === 'folder') {
    const names = notes[screen.path] ?? [];
    return { count: { text: String(names.length), check: 0 }, first: names.slice(0, 4) };
  }
  const collection = collections[screen.path];
  if (!collection) return null;
  const { schema } = collection;
  const all = Object.values(collections);
  const computer = computerFor(collection, all, boards, today);
  const rolled = computer.withValues(collection.dir) ?? collection;
  // The view it opens on, when it is a table: its records and its order; a calendar shows them all.
  const view = schema.views?.find((v) => v.id === schema.defaultView && v.kind !== 'calendar');
  const shown = view ? rolled.records.filter((r) => matchesConditions(r, schema, view.conditions, today)) : rolled.records;
  const sorted = view?.sort ? sortRecords(shown, schema, view.sort, today) : shown;
  const check = collection.records.filter((r) => recordProblems(r, schema).length + computer.checks(collection.dir, r).length > 0).length;
  return {
    count: { text: view ? t('app.inView', { count: shown.length, view: view.name.toLowerCase() }) : String(shown.length), check },
    first: sorted.slice(0, 4).map(recordTitle),
  };
}

/** The icon of a screen as the menu and Home show it. */
const screenIcon = (screen: AppScreen): IconName => (screen.kind === 'board' ? 'board' : screen.kind === 'folder' ? 'folder' : 'collection');

export function AppView({ folder, app, modules, look, onLook, collections, boards, notes, today, due, actions, screen: shownScreen, onOpen, onMenu }: {
  folder: string;
  /** Its `_app.json`, null while it is read. */
  app: AppFile | null;
  modules: AppModule[];
  look: AppLook;
  onLook: (look: AppLook) => void;
  collections: Record<string, Collection>;
  boards: Record<string, Board>;
  /** The names of the notes of its folders of notes, by the folder's path. */
  notes: Record<string, string[]>;
  today: string;
  /** What the calendars bring today and late, those of its collections. */
  due: DueRecord[];
  actions: TaskActions;
  /** The screen open: its collection's or its board's view. */
  screen: (screen: AppScreen) => ReactNode;
  /** A screen in a tab of its own, as Ctrl+click opens it. */
  onOpen: (screen: AppScreen) => void;
  /** The app's ··· menu. */
  onMenu: (event: MouseEvent) => void;
}) {
  const name = app?.name ?? folder.split('/').pop() ?? folder;
  const one = modules.length === 1;
  const icon = (one && (APP_TEMPLATES[modules[0]!.template].icon as IconName)) || 'app';
  // The screen open and its module: the one kept when it is still in the menu, else Home.
  const module = modules.find((m) => m.template === look.module && m.screens.some((s) => s.path === look.screen)) ?? modules.find((m) => m.screens.some((s) => s.path === look.screen));
  const open = module?.screens.find((s) => s.path === look.screen) ?? null;
  const pick = (event: MouseEvent, m: AppModule, s: AppScreen) => {
    if (event.ctrlKey || event.metaKey) return onOpen(s);
    onLook({ ...look, module: m.template, screen: s.path });
  };
  const home = () => onLook({ ...(look.files && { files: true }) });
  const tab = (key: string, label: string, on: boolean, run: (event: MouseEvent) => void) => (
    <button key={key} type="button" role="tab" aria-selected={on} className={on ? 'on' : undefined} onClick={run}>
      {label}
    </button>
  );
  return (
    <section className="app-view">
      <header className="app-top">
        <span className="app-name">
          <Icon name={icon} />
          {name}
        </span>
        <nav className="app-mods" role="tablist" aria-label={name}>
          {tab('home', t('app.home'), open === null, home)}
          {one
            ? modules[0]!.screens.map((s) => tab(s.path, s.name, open?.path === s.path, (event) => pick(event, modules[0]!, s)))
            : modules.map((m) => tab(m.template, m.name, module?.template === m.template && open !== null, (event) => pick(event, m, m.screens.find((s) => s.path === look.screen) ?? m.screens[0]!)))}
        </nav>
        <button type="button" className="app-more" title={t('side.more')} aria-label={t('side.more')} onClick={onMenu}>
          ···
        </button>
      </header>
      {!one && module && open && (
        <nav className="app-menu" role="tablist" aria-label={module.name}>
          {module.screens.map((s) => tab(s.path, s.name, s.path === open.path, (event) => pick(event, module, s)))}
        </nav>
      )}
      {open ? (
        <div className="app-screen">{shownScreen(open)}</div>
      ) : (
        <AppHome modules={modules} collections={collections} boards={boards} notes={notes} today={today} due={due} actions={actions} onPick={pick} />
      )}
    </section>
  );
}

/** An app's Home: what is due today in it, then each module's screens; with one module, its screens as boxes. */
function AppHome({ modules, collections, boards, notes, today, due, actions, onPick }: {
  modules: AppModule[];
  collections: Record<string, Collection>;
  boards: Record<string, Board>;
  notes: Record<string, string[]>;
  today: string;
  due: DueRecord[];
  actions: TaskActions;
  onPick: (event: MouseEvent, module: AppModule, screen: AppScreen) => void;
}) {
  const glances = useMemo(() => new Map(modules.flatMap((m) => m.screens).map((s) => [s.path, glanceOf(s, collections, boards, notes, today)] as const)), [modules, collections, boards, notes, today]);
  // Today: the records of today and those late, then the cards due today or late on its boards.
  const own = Object.fromEntries(Object.entries(boards).filter(([path]) => modules.some((m) => m.screens.some((s) => s.path === path))));
  const cards = splitDueCards(own, today);
  const dueCards = [...cards.overdue, ...cards.today];
  const records = [...due.filter((d) => d.late), ...due.filter((d) => !d.late && (d.day ?? today) === today)];
  const count = (s: AppScreen) => glances.get(s.path)?.count;
  const checks = (s: AppScreen) => {
    const n = count(s)?.check ?? 0;
    return n > 0 && <span className="warn">{t('collection.toCheck', { count: n })}</span>;
  };
  return (
    <div className="app-home">
      {records.length + dueCards.length > 0 && (
        <div className="tasks app-today">
          <div className="app-cap">
            {t('app.today')} <small>{records.length + dueCards.length}</small>
          </div>
          <div className="tl">
            {records.map((d) => (
              <RecordRow key={recordKey(d)} due={d} day={d.day ?? today} today={today} actions={actions} />
            ))}
            {dueCards.map((d) => (
              <CardRow key={`${d.board}#${d.card.id}`} board={d.board} whole={boards[d.board]!} card={d.card} today={today} actions={actions} />
            ))}
          </div>
        </div>
      )}
      {modules.length === 1 ? (
        <>
          <div className="app-cap">{t('app.screens')}</div>
          <div className="app-tiles">
            {modules[0]!.screens.map((s) => {
              const glance = glances.get(s.path);
              return (
                <button key={s.path} type="button" className="app-tile" onClick={(event) => onPick(event, modules[0]!, s)}>
                  <span className="h">
                    <Icon name={screenIcon(s)} />
                    {s.name}
                  </span>
                  <b>{glance?.count.text ?? '–'}</b>
                  {checks(s)}
                  {glance && glance.first.length > 0 && (
                    <span className="rs">
                      {glance.first.map((line, i) => (
                        <span key={i}>{line}</span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="app-cap">{t('app.modules')}</div>
          <div className="app-cards">
            {modules.map((m) => (
              <div key={m.template} className="app-card">
                <h4>
                  <Icon name={APP_TEMPLATES[m.template].icon as IconName} />
                  {m.name}
                  <small>{t('app.screenCount', { count: m.screens.length })}</small>
                </h4>
                {m.screens.map((s) => (
                  <button key={s.path} type="button" className="app-cr" onClick={(event) => onPick(event, m, s)}>
                    <Icon name={screenIcon(s)} />
                    <span className="t">{s.name}</span>
                    {checks(s)}
                    <span className="n">{count(s)?.text ?? '–'}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * An app's page on a phone (design/app-home.md 7): what is due today in it, then each module a
 * group of its screens with their counts, a tap opening the screen's page; its files at the end.
 */
export function PhoneAppHome({ modules, collections, boards, notes, today, due, actions, onScreen, about, onAbout, onFiles }: {
  modules: AppModule[];
  collections: Record<string, Collection>;
  boards: Record<string, Board>;
  notes: Record<string, string[]>;
  today: string;
  due: DueRecord[];
  actions: TaskActions;
  onScreen: (screen: AppScreen) => void;
  /** Its About note, which on a phone is a row of its page. */
  about: { path: string; name: string } | null;
  onAbout: (path: string) => void;
  onFiles: () => void;
}) {
  const glances = useMemo(() => new Map(modules.flatMap((m) => m.screens).map((s) => [s.path, glanceOf(s, collections, boards, notes, today)] as const)), [modules, collections, boards, notes, today]);
  const own = Object.fromEntries(Object.entries(boards).filter(([path]) => modules.some((m) => m.screens.some((s) => s.path === path))));
  const cards = splitDueCards(own, today);
  const dueCards = [...cards.overdue, ...cards.today];
  const records = [...due.filter((d) => d.late), ...due.filter((d) => !d.late && (d.day ?? today) === today)];
  const row = (s: AppScreen) => {
    const glance = glances.get(s.path);
    return (
      <button key={s.path} type="button" className="mb-row" onClick={() => onScreen(s)}>
        <Icon name={screenIcon(s)} />
        <span className="tx">
          <b>{s.name}</b>
          {glance && glance.count.check > 0 && <small className="warn">{t('collection.toCheck', { count: glance.count.check })}</small>}
        </span>
        <span className="ct">{glance?.count.text ?? ''}</span>
        <Icon name="chevron" />
      </button>
    );
  };
  return (
    <div className="mb-list mb-app">
      {records.length + dueCards.length > 0 && (
        <>
          <div className="mb-sec">
            {t('app.today')} <small>{records.length + dueCards.length}</small>
          </div>
          {records.map((d) => (
            <RecordRow key={recordKey(d)} due={d} day={d.day ?? today} today={today} actions={actions} />
          ))}
          {dueCards.map((d) => (
            <CardRow key={`${d.board}#${d.card.id}`} board={d.board} whole={boards[d.board]!} card={d.card} today={today} actions={actions} />
          ))}
        </>
      )}
      {modules.map((m) => (
        <div key={m.template}>
          <div className="mb-sec">{modules.length > 1 ? m.name : t('app.screens')}</div>
          {m.screens.map(row)}
        </div>
      ))}
      <div className="mb-sec" />
      {about && (
        <button type="button" className="mb-row" onClick={() => onAbout(about.path)}>
          <Icon name="note" />
          <span className="tx">
            <b>{about.name}</b>
          </span>
          <Icon name="chevron" />
        </button>
      )}
      <button type="button" className="mb-row" onClick={onFiles}>
        <Icon name="folder" />
        <span className="tx">
          <b>{t('app.files')}</b>
        </span>
        <Icon name="chevron" />
      </button>
    </div>
  );
}
