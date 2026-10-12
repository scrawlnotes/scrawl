import { basename, boardName, collectionName, INBOX, INBOX_TASKS, keysName, listName, type TaskFilter, type TreeNode } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type ReactNode, type TouchEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import {
  boardPathOf,
  collectionPathOf,
  collectionTab,
  filterOf,
  filterTab,
  folderOf,
  iconOf,
  isNote,
  keysPathOf,
  labelOf,
  listOf,
  tabOf,
  tasksOf,
  TODAY,
  TRASH,
  UPCOMING,
} from './items';

// A phone has a layout of its own, after the Phone views of design/mockups.html: a tab bar with
// Browse and Today at its foot, and in each of them a stack of pages. A page slides in from the
// right over the one it was opened from, and goes back by the button at its top, which says where
// it goes, or by a swipe from the left edge. What is open (a note, a list, a board, a keys file, a
// collection, a filter) is drawn once, by the app, and moved into the page that shows it. Nothing
// is opened or closed as a tab: what was opened last is Browse's Recent, and the app closes the
// rest of the tabs by itself.

/** The places of the tab bar. */
export type Place = 'browse' | 'today';
const PLACES: Place[] = ['browse', 'today'];

/** What a page of a place shows: its first page, a folder, something open, or the trash. */
type PageKind = { kind: 'root' } | { kind: 'folder'; path: string } | { kind: 'item'; id: string } | { kind: 'trash' };
/** A page, with the key it is drawn by. */
type Page = PageKind & { key: number };

/** How long a page takes to slide in or out, as the stylesheet has it. */
const SLIDE_MS = 320;
/** A swipe back starts this close to the left edge. */
const EDGE = 24;
/** How far a page moves before a finger's move counts as a swipe, either way. */
const SLOP = 8;
/** When the keyboard is up the window loses at least this much of its height. */
const KEYBOARD = 120;
/** How many of the things opened last Browse shows; the app keeps no more of them open. */
const RECENT = 5;

export interface PhoneProps {
  ready: boolean;
  tabs: string[];
  active: string | null;
  titles: Record<string, string>;
  tree: TreeNode[];
  filters: TaskFilter[];
  counts: Record<string, number>;
  /** Where the app draws what is open; moved into the page that shows it. */
  item: HTMLElement;
  /** Today or Upcoming; `adding` counts the presses of +, which open the add row. */
  dueView: (kind: 'today' | 'upcoming', adding: number) => ReactNode;
  trashView: ReactNode;
  /** How sync stands in a word or two. */
  syncWord: string;
  /** Something that happened, for a moment. */
  notice: string | null;
  /** A new version waiting, with its Reload button. */
  update: ReactNode;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: (folder: string) => void;
  onSync: () => void;
  onSettings: () => void;
  onNewFolder: (name: string, parent: string) => Promise<string | null>;
  onItemMenu: (event: MouseEvent, id: string) => void;
  onFolderMenu: (event: MouseEvent, path: string, addFolder: () => void) => void;
}

// Started from the clock, so that a page made after the module is loaded again never takes the key of one still on screen.
let pageKeys = Date.now();
const root = (): Page => ({ kind: 'root', key: ++pageKeys });
const views = new Set([TODAY, UPCOMING, TRASH]);
/** Whether a tab is something open, as opposed to a view the tab bar shows. */
const isItem = (id: string | null): id is string => id !== null && !views.has(id);

const SEEN = 'scrawl.phoneSeen';

/** When each thing open was last on screen, on this device: Recent lists the latest first. */
function loadSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(SEEN, JSON.stringify(seen));
  } catch {
    // Not kept; Recent falls back to the order things were opened in.
  }
}

/** When something was last on screen: now, minutes or hours today, a weekday this week, else a day. */
function seenText(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t('phone.now');
  if (minutes < 60) return t('phone.minutes', { count: minutes });
  const then = new Date(at);
  if (then.toDateString() === new Date(now).toDateString()) return t('phone.hours', { count: Math.floor(minutes / 60) });
  if (now - at < 6 * 86_400_000) return then.toLocaleDateString(locale(), { weekday: 'short' });
  return then.toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
}

const countNotes = (node: TreeNode): number =>
  node.kind === 'note' ? 1 : (node.children ?? []).reduce((sum, child) => sum + countNotes(child), 0);

function findFolder(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findFolder(node.children ?? [], path);
    if (found) return found;
  }
  return undefined;
}

function folderPaths(nodes: TreeNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    into.add(node.path);
    folderPaths(node.children ?? [], into);
  }
  return into;
}

const folderName = (path: string) => (path === INBOX ? t('side.inbox') : basename(path));

/** What something opened is called on a phone: its name alone, the folder it is in being under it. */
function nameOf(id: string, titles: Record<string, string>, filters: TaskFilter[]): string {
  const list = listOf(id);
  if (list !== null) return listName(list);
  const board = boardPathOf(id);
  if (board !== null) return boardName(board);
  const keys = keysPathOf(id);
  if (keys !== null) return keysName(keys);
  const collection = collectionPathOf(id);
  if (collection !== null) return collectionName(collection);
  return labelOf(id, titles, filters);
}

/** The things opened last, the latest first; what was never seen keeps the order it was opened in. */
const recentOf = (tabs: string[], seen: Record<string, number>): string[] =>
  tabs
    .filter(isItem)
    .map((id, index) => ({ id, at: seen[id] ?? 0, index }))
    .sort((a, b) => b.at - a.at || b.index - a.index)
    .slice(0, RECENT)
    .map((each) => each.id);

/** A row of a list: an icon, a name and a line under it, a count or a time, and an arrow. */
function Row({ icon, label, sub, right, folder, onClick }: {
  icon: IconName;
  label: string;
  sub?: ReactNode;
  right?: ReactNode;
  folder?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={folder ? 'mb-row fold' : 'mb-row'} onClick={onClick}>
      <Icon name={icon} />
      <span className="tx">
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      {right !== undefined && right !== '' && <span className="ct">{right}</span>}
      <Icon name="chevron" />
    </button>
  );
}

/** The bar at the top of a page: the way back, and the page's menu; scrolled, the page's name. */
function NavBar({ back, onBack, title, scrolled, onMenu }: {
  back?: string;
  onBack?: () => void;
  title?: string;
  scrolled: boolean;
  onMenu?: (event: MouseEvent) => void;
}) {
  if (!back && !onMenu) return null;
  return (
    <div className={scrolled ? 'mb-nav bar' : 'mb-nav'}>
      {back && (
        <button type="button" className="mb-back" aria-label={t('phone.back', { page: back })} onClick={onBack}>
          <Icon name="back" />
          <span>{back}</span>
        </button>
      )}
      {scrolled && title && <span className="mb-mid">{title}</span>}
      {onMenu && (
        <button type="button" className="mb-ib" aria-label={t('side.more')} title={t('side.more')} onClick={onMenu}>
          <Icon name="more" />
        </button>
      )}
    </div>
  );
}

/** A page's own frame: its bar, its large title, and what it holds, which scrolls under the bar. */
function PageFrame({ nav, title, sub, head, children }: {
  nav?: Omit<Parameters<typeof NavBar>[0], 'scrolled' | 'title'>;
  title?: string;
  sub?: ReactNode;
  /** More under the title, a segmented choice. */
  head?: ReactNode;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <>
      {nav && <NavBar {...nav} title={title} scrolled={scrolled} />}
      <div className="mb-body" onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 38)}>
        {title && (
          <header className={nav ? 'mb-head' : 'mb-head root'}>
            <h1>{title}</h1>
            {sub && <small>{sub}</small>}
          </header>
        )}
        {head}
        {children}
      </div>
    </>
  );
}

/** A folder named where it will be, as in the sidebar: its icon, the name, Add and ×. */
function FolderForm({ onAdd, onCancel }: { onAdd: (name: string) => Promise<string | null>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return onCancel();
    const problem = await onAdd(name);
    if (problem) setError(problem);
    else onCancel();
  };
  return (
    <form className="mb-form-row" onSubmit={submit}>
      <Icon name="folder" />
      <input
        aria-label={t('side.folderName')}
        placeholder={t('side.folderName')}
        autoFocus
        enterKeyHint="done"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="go">
        {t('side.addFolder')}
      </button>
      <button type="button" className="x" aria-label={t('dialog.cancel')} title={t('dialog.cancel')} onClick={onCancel}>
        <Icon name="close" />
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/** Today's icon: a calendar with the day of the month in it. */
function DayIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <text x="12" y="17.9" textAnchor="middle" fontSize="7.6" fontWeight="700" fill="currentColor" stroke="none">
        {new Date().getDate()}
      </text>
    </svg>
  );
}

export function Phone(props: PhoneProps) {
  const { ready, tabs, active, titles, tree, filters, counts, item } = props;
  const [place, setPlace] = useState<Place>('browse');
  const [stacks, setStacks] = useState<Record<Place, Page[]>>(() => ({ browse: [root()], today: [root()] }));
  /** A page sliding in, by its key: it starts at the right edge. */
  const [entering, setEntering] = useState<number | null>(null);
  /** A page sliding out, still drawn until it is gone. */
  const [leaving, setLeaving] = useState<{ place: Place; page: Page } | null>(null);
  /** How far a finger has pulled the page on top to the right, going back. */
  const [pull, setPull] = useState<number | null>(null);
  const [due, setDue] = useState<'today' | 'upcoming'>('today');
  const [adding, setAdding] = useState(0);
  const [newFolderIn, setNewFolderIn] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [seen, setSeen] = useState(loadSeen);
  const [now, setNow] = useState(Date.now);
  const stage = useRef<HTMLDivElement>(null);
  const holders = useRef(new Map<number, HTMLDivElement>());
  const lastActive = useRef<string | null>(null);
  const started = useRef(false);
  const stacksNow = useRef(stacks);
  stacksNow.current = stacks;

  const stack = stacks[place];
  const top = stack[stack.length - 1]!;

  const slideIn = (key: number) => {
    setEntering(key);
    // Drawn at the edge first, then let go: the stylesheet's transition slides it in.
    requestAnimationFrame(() => requestAnimationFrame(() => setEntering((now) => (now === key ? null : now))));
  };
  const push = (page: PageKind) => {
    const added: Page = { ...page, key: ++pageKeys };
    setStacks((current) => ({ ...current, [place]: [...current[place], added] }));
    slideIn(added.key);
  };
  const pop = () => {
    if (stack.length < 2) return;
    setLeaving({ place, page: top });
    setStacks((current) => ({ ...current, [place]: current[place].slice(0, -1) }));
    window.setTimeout(() => setLeaving(null), SLIDE_MS);
  };
  /** Opens something in a page of its own on the place on screen. */
  const openItem = (id: string) => {
    push({ kind: 'item', id });
    props.onOpen(id);
  };

  // What the app opens by itself (a link in a note, a task's note, what was just made) opens as a
  // page over the one on screen. What is renamed or moved keeps its page; what is closed loses it.
  useEffect(() => {
    if (!ready) return;
    const changed = lastActive.current !== active;
    // What was open last time opens as it was, without sliding in.
    const first = !started.current;
    started.current = true;
    lastActive.current = active;
    const current = stacksNow.current;
    const next = { ...current };
    let added: Page | null = null;
    const shown = next[place][next[place].length - 1]!;
    if (changed && isItem(active) && !(shown.kind === 'item' && shown.id === active)) {
      if (shown.kind === 'item' && !tabs.includes(shown.id)) next[place] = [...next[place].slice(0, -1), { ...shown, id: active }];
      else {
        added = { kind: 'item', id: active, key: ++pageKeys };
        next[place] = [...next[place], added];
      }
    }
    let gone: Page | null = null;
    for (const each of PLACES) {
      const kept = next[each].filter((page) => page.kind !== 'item' || tabs.includes(page.id));
      if (kept.length === next[each].length) continue;
      if (each === place && kept[kept.length - 1] !== next[each][next[each].length - 1]) gone = next[each][next[each].length - 1]!;
      next[each] = kept;
    }
    if (!added && !gone && next[place] === current[place] && PLACES.every((each) => next[each] === current[each])) return;
    setStacks(next);
    if (added && !first) slideIn(added.key);
    if (gone) {
      setLeaving({ place, page: gone });
      window.setTimeout(() => setLeaving(null), SLIDE_MS);
    }
    // Only what is open and what is on screen decide; the place is read as it is now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tabs, active]);

  // The page on top shows what is open: the app is told, and the drawing moves into it.
  useEffect(() => {
    if (top.kind !== 'item') return;
    if (active !== top.id) props.onOpen(top.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, top.key]);
  useLayoutEffect(() => {
    if (top.kind !== 'item') return;
    const holder = holders.current.get(top.key);
    if (holder && item.parentElement !== holder) holder.appendChild(item);
  });

  // What is on screen was seen now: Recent lists it first.
  useEffect(() => {
    if (top.kind !== 'item' || active !== top.id) return;
    const at = Date.now();
    setSeen((current) => {
      const next = { ...current, [top.id]: at };
      // What is no longer open is forgotten.
      for (const id of Object.keys(next)) if (!tabs.includes(id)) delete next[id];
      saveSeen(next);
      return next;
    });
  }, [top.key, active, tabs]);

  // What is open beside the pages and the five things opened last is closed: on a phone there are
  // no tabs to close it by. A view (Today, Upcoming, the trash) is not open on a phone.
  const closing = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    const kept = new Set(recentOf(tabs, seen));
    if (active) kept.add(active);
    for (const each of PLACES) for (const page of stacks[each]) if (page.kind === 'item') kept.add(page.id);
    for (const id of closing.current) if (!tabs.includes(id)) closing.current.delete(id);
    for (const id of tabs) {
      if (kept.has(id) || closing.current.has(id)) continue;
      closing.current.add(id);
      props.onClose(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tabs, active, seen, stacks]);

  // Recent's times keep up.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // With the keyboard up the tab bar and + are under it; the pages take the room.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () => setKeyboard(window.innerHeight - viewport.height > KEYBOARD);
    viewport.addEventListener('resize', measure);
    return () => viewport.removeEventListener('resize', measure);
  }, []);

  /** A tap on the place on screen goes back to its first page. */
  const choose = (next: Place) => {
    if (next !== place) return setPlace(next);
    if (stack.length > 1) setStacks((current) => ({ ...current, [place]: [current[place][0]!] }));
  };

  // ---------- going back with a swipe from the left edge ----------

  const swipe = useRef<{ x: number; y: number; way: 'across' | 'down' | null } | null>(null);
  const edgeStart = (event: TouchEvent) => {
    const point = event.touches[0]!;
    if (stack.length < 2 || leaving || point.clientX - (stage.current?.getBoundingClientRect().left ?? 0) > EDGE) return;
    swipe.current = { x: point.clientX, y: point.clientY, way: null };
  };
  const edgeMove = (event: TouchEvent) => {
    const at = swipe.current;
    if (!at) return;
    const point = event.touches[0]!;
    const x = point.clientX - at.x;
    const y = point.clientY - at.y;
    if (!at.way && Math.max(Math.abs(x), Math.abs(y)) > SLOP) at.way = x > Math.abs(y) ? 'across' : 'down';
    if (at.way === 'across') setPull(Math.max(0, x));
  };
  const edgeEnd = () => {
    const width = stage.current?.clientWidth ?? 375;
    if (swipe.current?.way === 'across' && pull !== null && pull > width * 0.33) pop();
    swipe.current = null;
    setPull(null);
  };

  // ---------- the pages ----------

  const titleOf = (page: Page, of: Place): string => {
    if (page.kind === 'root') return of === 'today' ? t('side.today') : t('phone.browse');
    if (page.kind === 'folder') return folderName(page.path);
    if (page.kind === 'trash') return t('side.trash');
    return nameOf(page.id, titles, filters);
  };

  const folders = folderPaths(tree);
  // The saved filters sit in their folders; one in none, or in a folder that is gone, in the inbox.
  const placeOf = (filter: TaskFilter) => (filter.folder && folders.has(filter.folder) && filter.folder !== INBOX ? filter.folder : INBOX);

  /** Where something opened is: its folder, or that a scratch note is not filed yet. */
  const whereOf = (id: string): ReactNode => {
    const filter = filterOf(id);
    if (filter !== null) {
      const found = filters.find((each) => each.id === filter);
      return found ? folderName(placeOf(found)) : '';
    }
    if (isNote(id) && folderOf(id) === INBOX) {
      return (
        <>
          <i className="dot" />
          {t('phone.notFiled')}
        </>
      );
    }
    const folder = folderOf(id);
    return folder ? folderName(folder) : '';
  };

  const browsePage = () => {
    const inbox = tree.find((node) => node.path === INBOX);
    const recent = recentOf(tabs, seen);
    return (
      <>
        {recent.length > 0 && (
          <>
            <div className="mb-sec">
              <span>{t('phone.recent')}</span>
            </div>
            <div className="mb-list">
              {recent.map((id) => (
                <Row key={id} icon={iconOf(id)} label={nameOf(id, titles, filters)} sub={whereOf(id)} right={seen[id] ? seenText(seen[id]!, now) : ''} onClick={() => openItem(id)} />
              ))}
            </div>
          </>
        )}
        <div className={recent.length > 0 ? 'mb-list apart' : 'mb-list'}>
          <Row icon="folder" folder label={t('side.inbox')} right={(inbox && countNotes(inbox)) || ''} onClick={() => push({ kind: 'folder', path: INBOX })} />
        </div>
        <div className="mb-sec">
          <span>{t('side.folders')}</span>
          <button type="button" aria-label={t('side.newFolder')} title={t('side.newFolder')} onClick={() => setNewFolderIn('')}>
            <Icon name="plus" />
          </button>
        </div>
        <div className="mb-list">
          {newFolderIn === '' && <FolderForm onAdd={(name) => props.onNewFolder(name, '')} onCancel={() => setNewFolderIn(null)} />}
          {tree
            .filter((node) => node.kind === 'folder' && node.path !== INBOX)
            .map((node) => (
              <Row key={node.path} icon="folder" folder label={node.name} right={countNotes(node) || ''} onClick={() => push({ kind: 'folder', path: node.path })} />
            ))}
        </div>
        <div className="mb-list apart">
          <Row icon="trash" label={t('side.trash')} right={counts[TRASH] || ''} onClick={() => push({ kind: 'trash' })} />
          <Row icon="cloud" label={t('phone.sync')} right={props.syncWord} onClick={props.onSync} />
          <Row icon="settings" label={t('side.settings')} onClick={props.onSettings} />
        </div>
      </>
    );
  };

  const folderPage = (path: string) => {
    const node = path === INBOX ? tree.find((each) => each.path === INBOX) : findFolder(tree, path);
    const children = node?.children ?? [];
    const placed = filters.filter((filter) => placeOf(filter) === path);
    const rows = (
      <>
        {path === INBOX && (
          <Row icon="tasks" label={t('side.tasks')} right={counts[tasksOf(INBOX_TASKS)] || ''} onClick={() => openItem(tasksOf(INBOX_TASKS))} />
        )}
        {placed.map((filter) => (
          <Row key={filter.id} icon="filter" label={filter.name} right={counts[filterTab(filter.id)] || ''} onClick={() => openItem(filterTab(filter.id))} />
        ))}
        {children
          .filter((child) => child.path !== INBOX_TASKS)
          .map((child) => {
            if (child.kind === 'folder') {
              return <Row key={child.path} icon="folder" folder label={child.name} right={countNotes(child) || ''} onClick={() => push({ kind: 'folder', path: child.path })} />;
            }
            const id = child.kind === 'collection' ? collectionTab(child.path) : tabOf(child.path);
            const counted = child.kind === 'tasks' || child.kind === 'board' || child.kind === 'collection';
            return (
              <Row
                key={child.path}
                icon={child.kind}
                label={titles[child.path] ?? child.title ?? child.name}
                right={counted ? counts[id] || '' : undefined}
                onClick={() => openItem(id)}
              />
            );
          })}
      </>
    );
    const empty = path !== INBOX && placed.length === 0 && children.length === 0;
    return (
      <div className="mb-list">
        {newFolderIn === path && <FolderForm onAdd={(name) => props.onNewFolder(name, path)} onCancel={() => setNewFolderIn(null)} />}
        {empty && newFolderIn !== path ? <p className="mb-none">{t('phone.nothingHere')}</p> : rows}
      </div>
    );
  };

  const pageOf = (page: Page, of: Place, index: number, pages: Page[]) => {
    const below = pages[index - 1];
    const back = below ? titleOf(below, of) : undefined;
    const nav = below ? { back, onBack: pop } : undefined;
    if (page.kind === 'root' && of === 'browse') return <PageFrame title={titleOf(page, of)}>{browsePage()}</PageFrame>;
    if (page.kind === 'root') {
      const day = new Date().toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' });
      return (
        <PageFrame
          title={due === 'today' ? t('side.today') : t('side.upcoming')}
          sub={due === 'today' ? day : undefined}
          head={
            <div className="mb-seg" role="tablist">
              {(['today', 'upcoming'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={due === kind}
                  onClick={() => {
                    setDue(kind);
                    setAdding(0);
                  }}
                >
                  {kind === 'today' ? t('side.today') : t('side.upcoming')}
                </button>
              ))}
            </div>
          }
        >
          <div className="mb-due">{props.dueView(due, adding)}</div>
        </PageFrame>
      );
    }
    if (page.kind === 'folder') {
      return (
        <PageFrame title={titleOf(page, of)} nav={{ ...nav, onMenu: (event) => props.onFolderMenu(event, page.path, () => setNewFolderIn(page.path)) }}>
          {folderPage(page.path)}
        </PageFrame>
      );
    }
    if (page.kind === 'trash') {
      return (
        <PageFrame nav={nav}>
          <div className="mb-legacy">{props.trashView}</div>
        </PageFrame>
      );
    }
    // Something open: the app's drawing of it is moved in here while this page is on top.
    return (
      <>
        <NavBar {...nav} scrolled={false} onMenu={(event) => props.onItemMenu(event, page.id)} />
        <div
          className="mb-holder"
          ref={(element) => {
            if (element) holders.current.set(page.key, element);
            else holders.current.delete(page.key);
          }}
        />
      </>
    );
  };

  const shownPages = leaving?.place === place ? [...stack, leaving.page] : stack;
  const fab =
    top.kind === 'root' || top.kind === 'folder'
      ? () => {
          if (place === 'today') {
            setDue('today');
            setAdding((n) => n + 1);
          } else props.onCreate(top.kind === 'folder' ? top.path : INBOX);
        }
      : null;

  return (
    <div className={keyboard ? 'mb keyboard' : 'mb'}>
      <div ref={stage} className="mb-stage" onTouchStartCapture={edgeStart} onTouchMoveCapture={edgeMove} onTouchEndCapture={edgeEnd} onTouchCancelCapture={edgeEnd}>
        {shownPages.map((page, index) => {
          const isLeaving = leaving?.page.key === page.key;
          const onTop = index === stack.length - 1 && !isLeaving;
          // Only the page on top and the one under it are drawn on screen; deeper ones keep their state.
          const depth = isLeaving ? 'leave' : onTop ? 'top' : index === stack.length - 2 ? 'under' : 'deep';
          const pulled = pull !== null && (onTop || depth === 'under');
          const width = stage.current?.clientWidth ?? 375;
          const style = pulled
            ? { transform: onTop ? `translateX(${pull}px)` : `translateX(${-30 + (30 * pull!) / width}%)`, transition: 'none' }
            : undefined;
          const classes = ['mb-page', depth, page.key === entering ? 'enter' : ''].filter(Boolean).join(' ');
          return (
            <section key={page.key} className={classes} style={style} aria-hidden={!onTop}>
              {pageOf(page, place, index, shownPages)}
            </section>
          );
        })}
      </div>
      {fab && (
        <button type="button" className="mb-fab" aria-label={t('phone.create')} title={t('phone.create')} onClick={fab}>
          <Icon name="plus" />
        </button>
      )}
      {(props.notice || props.update) && (
        <div className="mb-toasts">
          {props.update && <div className="mb-update">{props.update}</div>}
          {props.notice && (
            <div className="mb-toast" role="status">
              {props.notice}
            </div>
          )}
        </div>
      )}
      <nav className="mb-tabbar" aria-label={t('phone.places')}>
        {PLACES.map((each) => (
          <button key={each} type="button" aria-current={each === place ? 'page' : undefined} onClick={() => choose(each)}>
            {each === 'today' ? <DayIcon /> : <Icon name="folder" />}
            <span>{each === 'today' ? t('side.today') : t('phone.browse')}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
