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
  dayInToday,
  isEmpty,
  type DueRecord,
  matchesConditions,
  offeredOptions,
  optionName,
  viewValues,
  recordProblems,
  type Field,
  type FieldValue,
  type Record as CollectionRecord,
  recordTitle,
  screenKey,
  shownField,
  stepCounts,
  cardSum,
  cardValue,
  dayWords,
  faceFields,
  formatNumber,
  sortRecords,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type MouseEvent, type ReactNode, useMemo } from 'react';
import { Cell, StepStrip, type ValueContext } from './Collection';
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
  /** With the collection's Home setting: its first records with a value each, and sums in place of the count. */
  rows?: { name: string; sub: { field: Field; value: FieldValue } | null; value: { field: Field; value: FieldValue } | null; values: CollectionRecord['values'] }[];
  sums?: { field: Field; value: number; values: CollectionRecord['values'] }[];
  /** Said when it has no rows to show: "Give a category a monthly limit to see it here". */
  empty?: string;
  /** Its first record alone, large, its line under it: the next trip (design/more-apps.md 4.5). */
  big?: boolean;
  /** No box on Home: the packing list. */
  off?: boolean;
  /** How many are at each step of a field, as its line: "6 Saved · 7 Applied" (design/more-apps.md 4.6). */
  counts?: [string, number][];
  /** What the box is called when its Home setting lists a view: Gone quiet. */
  title?: string;
  /** A board of deals (Board.next): each open stage with how many and their sum, and the deals to close this month, a box of their own (design/scrawl-apps.md 3.1). */
  pipe?: { name: string; count: number; sum: string; share: number }[];
  closing?: { name: string; said: string }[];
  closingSum?: string;
}

/** A screen's count and its first records: a collection by the view it opens on, a board by its open cards, a folder by its notes; none for a note. */
function glanceOf(screen: AppScreen, collections: Record<string, Collection>, boards: Record<string, Board>, notes: Record<string, string[]>, today: string): Glance | null {
  if (screen.kind === 'board') {
    const board = boards[screen.path];
    if (!board) return null;
    const closed = new Set(board.columns.filter((c) => c.kind === 'done' || c.kind === 'dropped').map((c) => c.id));
    const open = board.cards.filter((card) => !closed.has(card.column));
    const glance: Glance = { count: { text: t('app.open', { count: open.length }), check: 0 }, first: open.slice(0, 4).map((card: Card) => card.title) };
    if (!board.next) return glance;
    // A pipeline as Pipedrive sums one: each open stage, how many and their value; what closes this month.
    const sumField = faceFields(board).find((f) => f.type === 'number');
    const money = (cards: Card[]) => {
      const sum = sumField ? cardSum(board, cards, sumField, today) : null;
      return { n: sum ?? 0, text: sum === null || !sumField ? '' : formatNumber(sum, sumField.format) };
    };
    const stages = board.columns.filter((c) => !closed.has(c.id)).map((c) => ({ column: c, cards: open.filter((card) => card.column === c.id) }));
    const top = Math.max(1, ...stages.map((s) => money(s.cards).n));
    const month = today.slice(0, 7);
    const closing = open.filter((card) => card.due?.slice(0, 7) === month).sort((a, b) => (a.due! < b.due! ? -1 : 1));
    const valueOf = (card: Card) => (sumField ? cardValue(board, card, sumField, today) : null);
    return {
      ...glance,
      count: { text: [t('app.open', { count: open.length }), money(open).text].filter(Boolean).join(' · '), check: 0 },
      pipe: stages.map((s) => ({ name: s.column.name, count: s.cards.length, sum: money(s.cards).text, share: money(s.cards).n / top })),
      closing: closing.slice(0, 4).map((card) => {
        const v = valueOf(card);
        return { name: card.title, said: [typeof v === 'number' && sumField ? formatNumber(v, sumField.format) : '', dayWords(card.due!)].filter(Boolean).join(' · ') };
      }),
      closingSum: [t('app.deals', { count: closing.length }), money(closing).text].filter(Boolean).join(' · '),
    };
  }
  if (screen.kind === 'note') return null;
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
  // The view it opens on, its menu's or its own, when it is a table: its records and its order; a calendar shows them all.
  // Its Home setting may list another view: a CRM's companies, those gone quiet.
  const homeView = schema.home?.view ? schema.views?.find((v) => v.id === schema.home!.view) : undefined;
  const view = homeView ?? schema.views?.find((v) => v.id === (screen.view ?? schema.defaultView) && v.kind !== 'calendar');
  const shown = view ? rolled.records.filter((r) => matchesConditions(r, schema, view.conditions, today)) : rolled.records;
  const sorted = view?.sort ? sortRecords(shown, schema, view.sort, today) : shown;
  const check = collection.records.filter((r) => recordProblems(r, schema).length + computer.checks(collection.dir, r).length > 0).length;
  // A view grouped by a choice, what is over closed, counts what is going on: "3 watching" (design/more-apps.md 4.8).
  // The first status the kind has: what a film is to watch, as it is never going on.
  const lead = view?.closed && view.group ? schema.fields.find((f) => f.key === view.group && f.type === 'select' && f.options?.length) : undefined;
  const kind = shown[0]?.values ?? viewValues(view, schema);
  const first = lead ? offeredOptions(lead, kind)[0] : undefined;
  const going = lead && first ? shown.filter((r) => r.values[lead.key] === first) : [];
  const glance: Glance = {
    count: {
      text: lead && first
        ? t('app.inView', { count: going.length, view: optionName(lead, first, kind).toLowerCase() })
        : view && view.conditions.length > 0
          ? t('app.inView', { count: shown.length, view: view.name.toLowerCase() })
          : String(shown.length),
      check,
    },
    first: sorted.slice(0, 4).map(recordTitle),
    ...(homeView && { title: homeView.name }),
  };
  // A box that says values (design/more-apps.md 4.1): a balance beside each account and their total, a month's sums.
  const home = schema.home;
  if (!home) return glance;
  if (home.off) return { ...glance, off: true };
  const stepped = home.counts ? schema.fields.find((f) => f.key === home.counts && f.steps) : undefined;
  if (stepped) return { ...glance, counts: stepCounts(stepped, collection.records) };
  const scope = { fields: schema.fields, schemaOf: (path: string) => collections[path]?.schema };
  const shownAs = (key: string | undefined) => {
    const field = key ? schema.fields.find((f) => f.key === key) : undefined;
    return field ? shownField(field, scope) : null;
  };
  const value = shownAs(home.value);
  const sub = shownAs(home.sub);
  const sum = (field: Field) => ({ field, value: shown.reduce((n, r) => n + (typeof r.values[field.key] === 'number' ? (r.values[field.key] as number) : 0), 0), values: shown[0]?.values ?? {} });
  // Only those with a value, as the categories given a limit.
  const listed = home.filled && value ? sorted.filter((r) => !isEmpty(r.values[value.key] ?? null)) : sorted;
  return {
    ...glance,
    ...(listed.length === 0 && home.empty && { first: [], empty: home.empty }),
    ...(home.first && { big: true }),
    rows: listed.slice(0, home.first ? 1 : 4).map((r) => ({ name: recordTitle(r), value: value ? { field: value, value: r.values[value.key] ?? null } : null, sub: sub ? { field: sub, value: r.values[sub.key] ?? null } : null, values: r.values })),
    ...(home.totals ? { sums: home.totals.map((key) => shownAs(key)).filter((f): f is Field => !!f).map(sum) } : value && home.total ? { sums: [sum(value)] } : {}),
  };
}

/** The icon of a screen as the menu and Home show it. */
const screenIcon = (screen: AppScreen): IconName => (screen.kind === 'board' ? 'board' : screen.kind === 'folder' ? 'folder' : screen.kind === 'note' ? 'note' : 'collection');
/** A module's name: the one module of an app of no template has none. */
const moduleName = (m: AppModule) => m.name || t('app.screens');
/** A module's icon on Home: its template's, else the app's. */
const moduleIcon = (m: AppModule): IconName => (m.template ? (APP_TEMPLATES[m.template].icon as IconName) : 'app');

export function AppView({ folder, app, icon, home: shows, modules, look, onLook, collections, boards, notes, today, due, actions, screen: shownScreen, onOpen, onAdd, onMenu }: {
  folder: string;
  /** Its `_app.json`, null while it is read. */
  app: AppFile | null;
  icon: IconName;
  /** What its Home shows: Today and the module cards. */
  home: { today: boolean; cards: boolean };
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
  /** A screen in a tab of its own, as Ctrl+click opens it; a note always. */
  onOpen: (screen: AppScreen) => void;
  /** Its menu has nothing: what makes a screen in it. */
  onAdd: (event: MouseEvent) => void;
  /** The app's ··· menu. */
  onMenu: (event: MouseEvent) => void;
}) {
  const name = app?.name ?? folder.split('/').pop() ?? folder;
  const one = modules.length === 1;
  // The screen open and its module: the one kept when it is still in the menu, else Home.
  // A screen given another view in Edit menu is the one kept still.
  const kept = (s: AppScreen) => screenKey(s) === look.screen || s.path === look.screen?.split('#')[0];
  const module = modules.find((m) => m.key === look.module && m.screens.some(kept)) ?? modules.find((m) => m.screens.some(kept));
  const open = module?.screens.find((s) => screenKey(s) === look.screen) ?? module?.screens.find(kept) ?? null;
  // A note of the menu opens in its own tab.
  const pick = (event: MouseEvent, m: AppModule, s: AppScreen) => {
    if (event.ctrlKey || event.metaKey || s.kind === 'note') return onOpen(s);
    onLook({ ...look, module: m.key, screen: screenKey(s) });
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
            ? modules[0]!.screens.map((s) => tab(screenKey(s), s.name, open !== null && screenKey(open) === screenKey(s), (event) => pick(event, modules[0]!, s)))
            : modules.map((m) => tab(m.key, moduleName(m), module?.key === m.key && open !== null, (event) => pick(event, m, m.screens.find((s) => screenKey(s) === look.screen && s.kind !== 'note') ?? m.screens.find((s) => s.kind !== 'note') ?? m.screens[0]!)))}
        </nav>
        <button type="button" className="app-more" title={t('side.more')} aria-label={t('side.more')} onClick={onMenu}>
          ···
        </button>
      </header>
      {!one && module && open && (
        <nav className="app-menu" role="tablist" aria-label={moduleName(module)}>
          {module.screens.map((s) => tab(screenKey(s), s.name, screenKey(s) === screenKey(open), (event) => pick(event, module, s)))}
        </nav>
      )}
      {open ? (
        <div className="app-screen">{shownScreen(open)}</div>
      ) : (
        <AppHome modules={modules} shows={shows} collections={collections} boards={boards} notes={notes} today={today} due={due} actions={actions} onPick={pick} onAdd={onAdd} />
      )}
    </section>
  );
}

/**
 * An app's Home: what is due today in it, then each module's screens; with one module, its screens
 * as boxes; each as Edit menu says. With nothing in its menu, how to add a screen.
 */
function AppHome({ modules, shows, collections, boards, notes, today, due, actions, onPick, onAdd }: {
  modules: AppModule[];
  shows: { today: boolean; cards: boolean };
  collections: Record<string, Collection>;
  boards: Record<string, Board>;
  notes: Record<string, string[]>;
  today: string;
  due: DueRecord[];
  actions: TaskActions;
  onPick: (event: MouseEvent, module: AppModule, screen: AppScreen) => void;
  onAdd: (event: MouseEvent) => void;
}) {
  const glances = useMemo(() => new Map(modules.flatMap((m) => m.screens).map((s) => [screenKey(s), glanceOf(s, collections, boards, notes, today)] as const)), [modules, collections, boards, notes, today]);
  // Today: the records of today and those late, then the cards due today or late on its boards.
  const own = Object.fromEntries(Object.entries(boards).filter(([path]) => modules.some((m) => m.screens.some((s) => s.path === path))));
  const cards = splitDueCards(own, today);
  const dueCards = [...cards.overdue, ...cards.today];
  // Today's: a repeating day today, or a record whose day is today or that began before and goes on.
  const records = [...due.filter((d) => d.late), ...due.filter((d) => !d.late && (d.day ?? dayInToday(d, today)) === today)];
  const count = (s: AppScreen) => glances.get(screenKey(s))?.count;
  // Values in a box are shown as the table shows them; nothing in one opens elsewhere.
  const tileCtx: ValueContext = { records: (dir) => collections[dir]?.records ?? null, collection: (dir) => collections[dir] ?? null, openLink: () => undefined };
  const checks = (s: AppScreen) => {
    const n = count(s)?.check ?? 0;
    return n > 0 && <span className="warn">{t('collection.toCheck', { count: n })}</span>;
  };
  if (modules.length === 0) {
    return (
      <div className="app-home">
        <div className="app-empty">
          <b>{t('app.addScreen')}</b>
          <p>{t('app.addScreenText')}</p>
          <button type="button" className="primary" onClick={onAdd}>
            <Icon name="plus" />
            {t('app.addScreen')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="app-home">
      {shows.today && records.length + dueCards.length > 0 && (
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
      {!shows.cards ? null : modules.length === 1 ? (
        <>
          <div className="app-cap">{t('app.screens')}</div>
          <div className="app-tiles">
            {modules[0]!.screens.map((s) => {
              const glance = glances.get(screenKey(s));
              if (glance?.off) return null;
              // A pipeline's own two boxes, as Pipedrive's: its stages with their sums, and what closes this month.
              if (glance?.pipe) {
                return [
                  <button key={screenKey(s)} type="button" className="app-tile" onClick={(event) => onPick(event, modules[0]!, s)}>
                    <span className="h">
                      <Icon name="board" />
                      {t('app.pipeline')}
                    </span>
                    <b>{glance.count.text}</b>
                    <span className="pipe">
                      {glance.pipe.map((stage) => (
                        <span key={stage.name}>
                          <span className="t">{stage.name}</span>
                          <span className="b">
                            <i style={{ width: `${Math.round(stage.share * 100)}%` }} />
                          </span>
                          <span className="n">{stage.count}</span>
                          <span className="v">{stage.sum}</span>
                        </span>
                      ))}
                    </span>
                  </button>,
                  <button key={`${screenKey(s)}#closing`} type="button" className="app-tile" onClick={(event) => onPick(event, modules[0]!, s)}>
                    <span className="h">
                      <Icon name="calendar" />
                      {t('app.closing')}
                    </span>
                    <b>{glance.closingSum}</b>
                    {glance.closing && glance.closing.length > 0 ? (
                      <span className="rs vals">
                        {glance.closing.map((row) => (
                          <span key={row.name}>
                            <span className="t">{row.name}</span>
                            <span className="faint">{row.said}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="rs">
                        <span className="faint">{t('app.noneClosing')}</span>
                      </span>
                    )}
                  </button>,
                ];
              }
              return (
                <button key={screenKey(s)} type="button" className="app-tile" onClick={(event) => onPick(event, modules[0]!, s)}>
                  <span className="h">
                    <Icon name={screenIcon(s)} />
                    {glance?.title ?? s.name}
                  </span>
                  {glance?.sums ? (
                    <span className="sums">
                      {glance.sums.map((each) => (
                        <span key={each.field.key}>
                          {glance.sums!.length > 1 && <small>{each.field.label}</small>}
                          <b>
                            <Cell field={each.field} value={each.value} ctx={tileCtx} values={each.values} />
                          </b>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <b>{glance?.count.text ?? '–'}</b>
                  )}
                  {checks(s)}
                  {glance?.counts ? (
                    <StepStrip counts={glance.counts} />
                  ) : glance?.big && glance.rows?.[0] ? (
                    <span className="big">
                      <b>{glance.rows[0].name}</b>
                      <small>
                        {[glance.rows[0].sub, glance.rows[0].value].filter((v): v is NonNullable<typeof v> => !!v && !isEmpty(v.value)).map((v, i) => (
                          <span key={i}>
                            <Cell field={v.field} value={v.value} ctx={tileCtx} values={glance.rows![0]!.values} />
                          </span>
                        ))}
                      </small>
                    </span>
                  ) : glance?.rows && glance.rows.length > 0 ? (
                    <span className="rs vals">
                      {glance.rows.map((row, i) => (
                        <span key={i}>
                          <span className="t">
                            {row.name}
                            {row.sub && !isEmpty(row.sub.value) && (
                              <small>
                                <Cell field={row.sub.field} value={row.sub.value} ctx={tileCtx} values={row.values} />
                              </small>
                            )}
                          </span>
                          {row.value && <Cell field={row.value.field} value={row.value.value} ctx={tileCtx} values={row.values} />}
                        </span>
                      ))}
                    </span>
                  ) : glance?.empty ? (
                    <span className="rs">
                      <span className="faint">{glance.empty}</span>
                    </span>
                  ) : (
                    glance &&
                    glance.first.length > 0 && (
                      <span className="rs">
                        {glance.first.map((line, i) => (
                          <span key={i}>{line}</span>
                        ))}
                      </span>
                    )
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
              <div key={m.key} className="app-card">
                <h4>
                  <Icon name={moduleIcon(m)} />
                  {moduleName(m)}
                  <small>{t('app.screenCount', { count: m.screens.length })}</small>
                </h4>
                {m.screens.map((s) => (
                  <button key={screenKey(s)} type="button" className="app-cr" onClick={(event) => onPick(event, m, s)}>
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
export function PhoneAppHome({ modules, shows, collections, boards, notes, today, due, actions, onScreen, onAdd, about, onAbout, onFiles }: {
  modules: AppModule[];
  shows: { today: boolean; cards: boolean };
  collections: Record<string, Collection>;
  boards: Record<string, Board>;
  notes: Record<string, string[]>;
  today: string;
  due: DueRecord[];
  actions: TaskActions;
  onScreen: (screen: AppScreen) => void;
  /** Its menu has nothing: what makes a screen in it. */
  onAdd: (event: MouseEvent) => void;
  /** Its About note, which on a phone is a row of its page. */
  about: { path: string; name: string } | null;
  onAbout: (path: string) => void;
  onFiles: () => void;
}) {
  const glances = useMemo(() => new Map(modules.flatMap((m) => m.screens).map((s) => [screenKey(s), glanceOf(s, collections, boards, notes, today)] as const)), [modules, collections, boards, notes, today]);
  const own = Object.fromEntries(Object.entries(boards).filter(([path]) => modules.some((m) => m.screens.some((s) => s.path === path))));
  const cards = splitDueCards(own, today);
  const dueCards = [...cards.overdue, ...cards.today];
  // Today's: a repeating day today, or a record whose day is today or that began before and goes on.
  const records = [...due.filter((d) => d.late), ...due.filter((d) => !d.late && (d.day ?? dayInToday(d, today)) === today)];
  const row = (s: AppScreen) => {
    const glance = glances.get(screenKey(s));
    return (
      <button key={screenKey(s)} type="button" className="mb-row" onClick={() => onScreen(s)}>
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
      {modules.length === 0 && (
        <div className="app-empty">
          <b>{t('app.addScreen')}</b>
          <p>{t('app.addScreenText')}</p>
          <button type="button" className="primary" onClick={onAdd}>
            <Icon name="plus" />
            {t('app.addScreen')}
          </button>
        </div>
      )}
      {shows.today && records.length + dueCards.length > 0 && (
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
        <div key={m.key}>
          <div className="mb-sec">{modules.length > 1 ? moduleName(m) : t('app.screens')}</div>
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
