import { type Found, INBOX_TASKS, inSpace, listName, spaceOf, type TaskFilter, type TreeNode, type Version } from '@scrawlnotes/core';
import { revealCursor } from '@scrawlnotes/editor';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, Fragment, type MouseEvent, type ReactNode, type TouchEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UpcomingView } from './device';
import { Icon, type IconName } from './Icon';
import { boardOf, collectionPathOf, collectionTab, countItems, FILES, filterOf, filterTab, folderLabel, folderOf, iconOf, isNote, nameOf, pathOf, seenText, spaceLabel, spaceWhere, tabOf, tasksOf, TODAY, TRASH, UPCOMING } from './items';
import type { SpaceView } from './session';
import { type Section, sectionValue, SettingsSection, settingsSections, type SettingsValues } from './Settings';
import { PhoneAgents } from './Agents';
import { PhoneLogs, useLogView } from './Logs';
import { Spin } from './Loading';
import { PhoneAddSpaceSheet, PhonePersonalPage, PhoneSpacePage, PhoneSpacesList, RemoveSpaceSheet, spacePlace } from './PhoneSpaces';
import { PhoneSyncList, PhoneSyncPage } from './PhoneSync';
import { PhoneServerPage, YouAre } from './ServerPeople';
import { hostOf, knownServers, pendingJoin } from './servers';
import { PhoneSearch, type SearchAction, type Thing } from './Search';
import { ActionSheet, Empty, useViewport } from './sheets';

// A phone has a layout of its own, after the Phone views of design/mockups.html: a tab bar with
// Recent, Browse, Today and Search at its foot, and in each of them a stack of pages. A page slides in from the
// right over the one it was opened from, and goes back by the button at its top, which says where
// it goes, or by a swipe from the left edge. What is open (a note, a list, a board, a keys file, a
// collection, a filter) is drawn once, by the app, and moved into the page that shows it. Nothing
// is opened or closed as a tab: what was opened last is Browse's Recent, and the app closes the
// rest of the tabs by itself.

/** The places of the tab bar. */
export type Place = 'recent' | 'browse' | 'today' | 'search';
const PLACES: Place[] = ['recent', 'browse', 'today', 'search'];

/**
 * What a page of a place shows: its first page, a folder, something open, the trash, the settings
 * or a section of them, a space, sync: with no `space` every space's, else one's, `named` by the
 * space when opened from every space's.
 */
type PageKind =
  | { kind: 'root' }
  | { kind: 'folder'; path: string }
  | { kind: 'item'; id: string }
  | { kind: 'trash' }
  | { kind: 'files' }
  | { kind: 'settings' }
  | { kind: 'section'; section: Section }
  | { kind: 'space'; id: string | null }
  | { kind: 'server'; url: string }
  | { kind: 'sync'; space?: string | null; named?: boolean }
  | { kind: 'history'; path: string }
  | { kind: 'version'; path: string; version: Version }
  | { kind: 'card'; board: string; id: string }
  | { kind: 'record'; dir: string; id: string };
/** A page, with the key it is drawn by. */
type Page = PageKind & { key: number };

/** A page's Select: its rows chosen together, and what the bar in the tab bar's place does with them. */
export interface PhoneChoice {
  choosing: boolean;
  count: number;
  /** Every row is chosen. */
  all: boolean;
  /** The page has anything to choose. */
  any: boolean;
  onStart: () => void;
  onAll: () => void;
  onDone: () => void;
  actions: { icon: IconName; label: string; danger?: boolean; run: () => void }[];
}

/** How long a page takes to slide in or out, as the stylesheet has it. */
const SLIDE_MS = 320;
/** A swipe back starts this close to the left edge. */
const EDGE = 24;
/** How far a page moves before a finger's move counts as a swipe, either way. */
const SLOP = 8;
/** How many of the things opened last Browse shows; the app keeps no more of them open. */
const RECENT = 10;
/** How long a finger rests on a row before its menu opens. */
const HOLD_MS = 450;

/** Something that happened, shown for a moment; `undo` takes it back; `action` is a button of its own, Share. */
export interface Notice {
  text: string;
  undo?: () => void;
  action?: { label: string; run: () => void };
}

export interface PhoneProps {
  ready: boolean;
  tabs: string[];
  active: string | null;
  titles: Record<string, string>;
  tree: TreeNode[];
  /** The spaces beside the personal one, each a section of Browse. */
  spaces: SpaceView[];
  filters: TaskFilter[];
  counts: Record<string, number>;
  /** Where the app draws what is open; moved into the page that shows it. */
  item: HTMLElement;
  /** Today or Upcoming. */
  dueView: (kind: 'today' | 'upcoming') => ReactNode;
  /** How Upcoming shows: its days, or the month. */
  upcomingView: UpcomingView;
  onUpcomingView: (view: UpcomingView) => void;
  /** Whether + adds to what is open: a task to a list. */
  canAdd: (id: string) => boolean;
  /** + on what is open, or on Today or Upcoming: a task, typed above the keyboard. */
  onAdd: (id: string) => void;
  trashView: ReactNode;
  /** The trash's Select: its rows chosen together, and what is done with them. */
  trashChoice: PhoneChoice;
  /** Files, a page from Browse beside the trash. */
  filesView: ReactNode;
  filesChoice: PhoneChoice;
  /** Whether Files is on screen: what it lists is read only then. */
  onFilesShown: (shown: boolean) => void;
  /**
   * Search, the fourth tab: what it finds, read while it is on screen (`onShown`); `onPick` opens
   * what was found, but a folder, which opens as a page here, and a space, which Browse shows.
   */
  search: { things: Thing[] | null; actions: SearchAction[]; onShown: (shown: boolean) => void; onPick: (found: Found<Thing>) => void; still: string | null };
  /** The spaces still read as the app opens: `''` for the personal one, the others by id. */
  reading: ReadonlySet<string>;
  /** A folder's page opened while the app opens: it is read before the others. */
  onWant: (paths: string[]) => void;
  /** How sync stands in a word, and whether something keeps it from going on. */
  syncWord: { text: string; bad: boolean };
  /** Asks for the personal space's sync page: back from signing in to connect it, its folder is chosen there. */
  syncAsked: boolean;
  onSyncShown: () => void;
  /** Something that happened, for a moment; with Undo, which `onUndo` does. */
  notice: Notice | null;
  onUndo: () => void;
  /** A new version waiting, with its Reload button. */
  update: ReactNode;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: (folder: string) => void;
  /** What the settings show and change; `open` asks for their page, at a section if one is given. */
  settings: { values: SettingsValues; open: { section?: Section } | null; onShown: () => void };
  onNewFolder: (name: string, parent: string) => Promise<string | null>;
  /** The menu of something open, or of a filter, as an action sheet; `page` when it comes from its page's ···. */
  onItemMenu: (id: string, page?: boolean) => void;
  /** A folder's menu; `addFolder` names a new folder in it. */
  onFolderMenu: (path: string, addFolder: () => void) => void;
  /** Whether a menu is open: a row held for it stays lifted until it closes. */
  menuOpen: boolean;
  /**
   * A note's history: `open` asks for its page over the note's; `list` draws the versions, `version`
   * one of them with Restore, which calls `done` once it is restored; `label` names a version.
   */
  history: {
    open: string | null;
    onShown: () => void;
    list: (path: string, pick: (version: Version | null) => void) => ReactNode;
    version: (path: string, version: Version, done: () => void) => ReactNode;
    label: (version: Version) => string;
  };
  /**
   * A card of a board, opened as a page over its board's: `open` is the card asked for, `view`
   * draws it, `label` names it, `onMenu` opens its menu, `onClosed` says its page went.
   */
  card: {
    open: { board: string; id: string } | null;
    view: (board: string, id: string) => ReactNode;
    label: (board: string, id: string) => string;
    onMenu: (board: string, id: string) => void;
    onClosed: () => void;
  };
  /**
   * A record of a collection, as a page: `open` asks for its page over the one on screen, `view`
   * draws it, `label` names it, `onMenu` opens its menu, `exists` tells whether it is still there,
   * and `leave` asks before its changes are lost, then goes on.
   */
  record: {
    open: { dir: string; id: string } | null;
    onShown: () => void;
    exists: (dir: string, id: string) => boolean;
    view: (dir: string, id: string) => ReactNode;
    label: (dir: string, id: string) => string;
    onMenu: (dir: string, id: string) => void;
    leave: (dir: string, id: string, then: () => void) => void;
  };
}

// Started from the clock, so that a page made after the module is loaded again never takes the key of one still on screen.
let pageKeys = Date.now();
const root = (): Page => ({ kind: 'root', key: ++pageKeys });
const views = new Set([TODAY, UPCOMING, TRASH, FILES]);
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

const folderName = folderLabel;

/** The things opened last, the latest first; what was never seen keeps the order it was opened in. */
const recentOf = (tabs: string[], seen: Record<string, number>): string[] =>
  tabs
    .filter(isItem)
    .map((id, index) => ({ id, at: seen[id] ?? 0, index }))
    .sort((a, b) => b.at - a.at || b.index - a.index)
    .slice(0, RECENT)
    .map((each) => each.id);

/**
 * A finger resting on a row: after a moment its menu opens, and the tap that ends it opens
 * nothing. A finger that moves is scrolling. A right click, or a long press where the phone
 * sends one, opens the menu too.
 */
export function useHold(onHold?: (row: HTMLElement) => void) {
  const at = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null);
  if (!onHold) return {};
  const stop = () => {
    if (at.current) window.clearTimeout(at.current.timer);
  };
  return {
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      const point = event.touches[0]!;
      const row = event.currentTarget;
      stop();
      at.current = {
        x: point.clientX,
        y: point.clientY,
        fired: false,
        timer: window.setTimeout(() => {
          if (at.current) at.current.fired = true;
          onHold(row);
        }, HOLD_MS),
      };
    },
    onTouchMove: (event: TouchEvent<HTMLElement>) => {
      const now = at.current;
      if (!now || now.fired) return;
      const point = event.touches[0]!;
      if (Math.hypot(point.clientX - now.x, point.clientY - now.y) > SLOP) {
        stop();
        at.current = null;
      }
    },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      stop();
      // The menu is open: the tap ends here.
      if (at.current?.fired) event.preventDefault();
      else at.current = null;
    },
    onTouchCancel: () => {
      stop();
      at.current = null;
    },
    onClickCapture: (event: MouseEvent) => {
      if (at.current?.fired) {
        event.preventDefault();
        event.stopPropagation();
      }
      at.current = null;
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      if (!at.current?.fired) onHold(event.currentTarget);
    },
  };
}

/** A row of a list: an icon, a name and a line under it, a count or a time, and an arrow. Held, it opens its menu. */
function Row({ icon, label, sub, right, folder, onClick, onHold }: {
  icon: IconName;
  label: string;
  sub?: ReactNode;
  right?: ReactNode;
  folder?: boolean;
  onClick: () => void;
  onHold?: (row: HTMLElement) => void;
}) {
  const hold = useHold(onHold);
  return (
    <button type="button" className={folder ? 'mb-row fold' : 'mb-row'} onClick={onClick} {...hold}>
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

/**
 * The bar at the top of a page: the way back, and the page's menu; or a word that does what the
 * page offers, Reorder; scrolled, the page's name. The phone's own ✓ above the keyboard puts the
 * keyboard away.
 */
function NavBar({ back, onBack, title, scrolled, onMenu, action, choose }: {
  back?: string;
  onBack?: () => void;
  title?: string;
  scrolled: boolean;
  onMenu?: (event: MouseEvent) => void;
  action?: { label: string; run: () => void };
  /** Rows being chosen: Select all on the left, how many in the middle, Done on the right. */
  choose?: { count: number; all: boolean; onAll: () => void; onDone: () => void };
}) {
  if (choose) {
    return (
      <div className={scrolled ? 'mb-nav bar' : 'mb-nav'}>
        <button type="button" className="mb-back plain" onClick={choose.onAll}>
          <span>{choose.all ? t('choose.deselectAll') : t('choose.selectAll')}</span>
        </button>
        <span className="mb-mid">{t('choose.selected', { count: choose.count })}</span>
        <button type="button" className="mb-done" onClick={choose.onDone}>
          {t('phone.done')}
        </button>
      </div>
    );
  }
  if (!back && !onMenu && !action) return null;
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
      {action && (
        <button type="button" className="mb-done" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/** A page's own frame: its bar, its large title, and what it holds, which scrolls under the bar. */
function PageFrame({ nav, title, sub, side, head, children }: {
  nav?: Omit<Parameters<typeof NavBar>[0], 'scrolled' | 'title'>;
  title?: string;
  sub?: ReactNode;
  /** Beside the title, a segmented choice of how the page shows. */
  side?: ReactNode;
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
          <header className={[nav ? 'mb-head' : 'mb-head root', side && 'split'].filter(Boolean).join(' ')}>
            {side ? (
              <>
                <div>
                  <h1>{title}</h1>
                  {sub && <small>{sub}</small>}
                </div>
                {side}
              </>
            ) : (
              <>
                <h1>{title}</h1>
                {sub && <small>{sub}</small>}
              </>
            )}
          </header>
        )}
        {head}
        {children}
      </div>
    </>
  );
}

/** A folder named where it will be, as in the sidebar: its icon, the name, Add and ×. */
export function FolderForm({ onAdd, onCancel }: { onAdd: (name: string) => Promise<string | null>; onCancel: () => void }) {
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

/** How long after the last change of the phone's height the keyboard is taken to have settled. */
const KEYBOARD_SETTLES_MS = 120;

export function Phone(props: PhoneProps) {
  const { ready, tabs, active, titles, tree, filters, counts, item } = props;
  // The app opens on its first place, Recent, with what was open last over it.
  const [place, setPlace] = useState<Place>('recent');
  const [stacks, setStacks] = useState<Record<Place, Page[]>>(() => ({ recent: [root()], browse: [root()], today: [root()], search: [root()] }));
  // What was typed in Search, kept while another tab is on screen.
  const [query, setQuery] = useState('');
  /** A page sliding in, by its key: it starts at the right edge. */
  const [entering, setEntering] = useState<number | null>(null);
  /** A page sliding out, still drawn until it is gone. */
  const [leaving, setLeaving] = useState<{ place: Place; page: Page } | null>(null);
  /** How far a finger has pulled the page on top to the right, going back. */
  const [pull, setPull] = useState<number | null>(null);
  const [due, setDue] = useState<'today' | 'upcoming'>('today');
  const [newFolderIn, setNewFolderIn] = useState<string | null>(null);
  // Settings › Spaces: reordering the spaces, adding one, a space's menu and the question before it leaves this phone.
  const [reordering, setReordering] = useState(false);
  // Settings › Logs: what is shown, and Copy in the page's bar.
  const logView = useLogView();
  // Opened with an invite link, Add space opens with it.
  const [addingSpace, setAddingSpace] = useState(() => !!pendingJoin());
  const [spaceMenu, setSpaceMenu] = useState<string | null>(null);
  const [removingSpace, setRemovingSpace] = useState<string | null>(null);
  const view = useViewport();
  const keyboard = view.keyboard;
  const [seen, setSeen] = useState(loadSeen);
  const [now, setNow] = useState(Date.now);
  /** A row held for its menu, lifted over the dimmed page while the menu is open: where it is and what it shows. */
  const [held, setHeld] = useState<{ box: DOMRect; html: string; className: string } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const holders = useRef(new Map<number, HTMLDivElement>());
  const lastActive = useRef<string | null>(null);
  const started = useRef(false);
  const stacksNow = useRef(stacks);
  stacksNow.current = stacks;

  const stack = stacks[place];
  const top = stack[stack.length - 1]!;
  // While the rows of the trash or of Files are chosen, what is done with them takes the tab bar's
  // place; leaving the page lets go of them. Files reads what it lists only while it is shown.
  const choice = top.kind === 'trash' ? props.trashChoice : top.kind === 'files' ? props.filesChoice : null;
  const choosing = !!choice?.choosing;
  useEffect(() => {
    if (top.kind !== 'trash' && props.trashChoice.choosing) props.trashChoice.onDone();
    if (top.kind !== 'files' && props.filesChoice.choosing) props.filesChoice.onDone();
    props.onFilesShown(top.kind === 'files');
  }, [top.kind]);
  // Search reads what it finds each time it comes on screen.
  const searchOnScreen = place === 'search' && top.kind === 'root';
  useEffect(() => {
    props.search.onShown(searchOnScreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOnScreen]);
  /** Opens what Search found: a folder as a page over Search, a space where Browse shows it; the rest as the app opens it. */
  const pickFound = (found: Found<Thing>) => {
    const target = found.item.target;
    if (target.kind === 'folder') return push({ kind: 'folder', path: target.path });
    if (target.kind === 'space') return setPlace('browse');
    // A page opens over Search here and now: what is open already would not open one by itself,
    // and a card opens over its board's page.
    if (target.kind === 'note') push({ kind: 'item', id: target.path });
    else if (target.kind === 'tab') push({ kind: 'item', id: target.id });
    else if (target.kind === 'card') push({ kind: 'item', id: boardOf(target.board) });
    props.search.onPick(found);
  };
  // Search's actions go where a phone has those places: Today and Upcoming are a tab, Files and the trash pages of Browse.
  const searchActions = props.search.actions.map((action): SearchAction => {
    if (action.id === 'today' || action.id === 'upcoming') {
      const kind = action.id;
      return { ...action, run: () => (setDue(kind), setPlace('today')) };
    }
    if (action.id === 'files' || action.id === 'trash') {
      const kind = action.id;
      return { ...action, run: () => (setPlace('browse'), setStacks((current) => ({ ...current, browse: [current.browse[0]!, { kind, key: ++pageKeys }] }))) };
    }
    return action;
  });

  const slideIn = (key: number) => {
    setEntering(key);
    // Drawn at the edge first, then let go: the stylesheet's transition slides it in.
    requestAnimationFrame(() => requestAnimationFrame(() => setEntering((now) => (now === key ? null : now))));
  };
  const push = (page: PageKind) => {
    if (page.kind === 'folder') props.onWant([page.path]);
    const added: Page = { ...page, key: ++pageKeys };
    setStacks((current) => ({ ...current, [place]: [...current[place], added] }));
    slideIn(added.key);
  };
  /** Goes on once every record's page among `pages`, the top first, has asked about its changes. */
  const leaveAll = (pages: Page[], then: () => void) => {
    const [first, ...rest] = pages;
    if (!first) return then();
    if (first.kind === 'record') props.record.leave(first.dir, first.id, () => leaveAll(rest, then));
    else leaveAll(rest, then);
  };
  const pop = () => {
    if (stack.length < 2) return;
    const going = top;
    leaveAll([going], () => {
      // A card's page going is the card closing.
      if (going.kind === 'card') props.card.onClosed();
      setLeaving({ place, page: going });
      setStacks((current) => ({ ...current, [place]: current[place].filter((page) => page.key !== going.key) }));
      window.setTimeout(() => setLeaving(null), SLIDE_MS);
    });
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

  // What is open beside the pages and the ten things opened last is closed: on a phone there are
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

  // The settings open as a page in Browse, at a section if one was asked for, over what Browse
  // shows; one already open is gone back to.
  const { open: settingsAsked, onShown } = props.settings;
  useEffect(() => {
    if (!settingsAsked) return;
    onShown();
    const current = stacksNow.current.browse;
    const at = current.findIndex((page) => page.kind === 'settings');
    const base: Page[] = at >= 0 ? current.slice(0, at + 1) : [...current, { kind: 'settings', key: ++pageKeys }];
    const next: Page[] = settingsAsked.section ? [...base, { kind: 'section', section: settingsAsked.section, key: ++pageKeys }] : base;
    setStacks((stacks) => ({ ...stacks, browse: next }));
    setPlace('browse');
    if (next[next.length - 1] !== current[current.length - 1]) slideIn(next[next.length - 1]!.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsAsked]);

  // Back from signing in to connect the personal space: its sync page opens in Browse, where its
  // folder is chosen; one already on top stays.
  const { syncAsked, onSyncShown } = props;
  useEffect(() => {
    if (!syncAsked) return;
    onSyncShown();
    const current = stacksNow.current.browse;
    const shown = current[current.length - 1]!;
    setPlace('browse');
    if (shown.kind === 'sync' && (shown.space === null || (shown.space === undefined && props.spaces.length === 0))) return;
    const added: Page = { kind: 'sync', space: null, key: ++pageKeys };
    setStacks((stacks) => ({ ...stacks, browse: [...stacks.browse, added] }));
    slideIn(added.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncAsked]);

  // A row held for its menu comes down when the menu closes, or at once when it has none.
  const menuOpen = useRef(props.menuOpen);
  menuOpen.current = props.menuOpen;
  useEffect(() => {
    if (!props.menuOpen) setHeld(null);
  }, [props.menuOpen]);
  /** Lifts a row held for its menu and opens the menu. */
  const holdFor = (open: () => void) => (row: HTMLElement) => {
    setHeld({ box: row.getBoundingClientRect(), html: row.innerHTML, className: row.className });
    open();
    window.setTimeout(() => !menuOpen.current && setHeld(null), 50);
  };
  // The personal space's own list, Inbox, has no menu.
  const itemHold = (id: string) => (id === tasksOf(INBOX_TASKS) ? undefined : holdFor(() => props.onItemMenu(id)));
  const folderHold = (path: string) =>
    holdFor(() =>
      props.onFolderMenu(path, () => {
        if (!(top.kind === 'folder' && top.path === path)) push({ kind: 'folder', path });
        setNewFolderIn(path);
      }),
    );

  // Recent's times keep up.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // The keyboard came up, or grew, over what is typed in: the cursor is brought above it, once the
  // keyboard has settled and the editor has taken its new height, which keeps its first line where
  // it was.
  useEffect(() => {
    if (!keyboard) return;
    const timer = window.setTimeout(() => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !(item.contains(focused) || stage.current?.contains(focused))) return;
      if (!revealCursor(focused) && focused.matches('input, textarea')) focused.scrollIntoView({ block: 'nearest' });
    }, KEYBOARD_SETTLES_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboard, view.height]);

  // A card opens as a page over its board's: once the board's page is on top, as it is when the
  // card was opened from elsewhere and the board opens first. A card closed elsewhere, or
  // deleted, takes its page with it.
  const cardOpen = props.card.open;
  const cardBefore = useRef(cardOpen);
  useEffect(() => {
    // Each time a card is asked for, even one already in a page below, is a new ask.
    const changed = cardBefore.current !== cardOpen;
    cardBefore.current = cardOpen;
    const pages = stacksNow.current[place];
    const shown = pages[pages.length - 1]!;
    if (!cardOpen) {
      // A card closed elsewhere, or deleted: its page on top goes.
      if (!changed || shown.kind !== 'card') return;
      setLeaving({ place, page: shown });
      window.setTimeout(() => setLeaving(null), SLIDE_MS);
      setStacks((current) => ({ ...current, [place]: current[place].filter((page) => page.key !== shown.key) }));
      return;
    }
    if (shown.kind === 'card') {
      // Another card asked for takes the page's place; one on screen in the other place stays.
      if (changed && (shown.board !== cardOpen.board || shown.id !== cardOpen.id)) {
        setStacks((current) => ({ ...current, [place]: [...current[place].slice(0, -1), { kind: 'card', board: cardOpen.board, id: cardOpen.id, key: ++pageKeys }] }));
      }
      return;
    }
    // A card opened from a record's page opens over it.
    if ((shown.kind === 'item' && shown.id === boardOf(cardOpen.board)) || (changed && shown.kind === 'record')) push({ kind: 'card', board: cardOpen.board, id: cardOpen.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardOpen, top.key]);

  // A record opens as a page over the one on screen; one already on top stays.
  const { open: recordAsked, onShown: recordShown } = props.record;
  useEffect(() => {
    if (!recordAsked) return;
    recordShown();
    const pages = stacksNow.current[place];
    const shown = pages[pages.length - 1]!;
    if (shown.kind === 'record' && shown.dir === recordAsked.dir && shown.id === recordAsked.id) return;
    push({ kind: 'record', dir: recordAsked.dir, id: recordAsked.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordAsked]);
  // A record deleted, or gone with sync, takes its page with it.
  const goneRecords = stack
    .filter((page) => page.kind === 'record' && !props.record.exists(page.dir, page.id))
    .map((page) => page.key)
    .join(' ');
  useEffect(() => {
    if (!goneRecords) return;
    const gone = new Set(goneRecords.split(' ').map(Number));
    const pages = stacksNow.current[place];
    const shown = pages[pages.length - 1]!;
    if (gone.has(shown.key)) {
      setLeaving({ place, page: shown });
      window.setTimeout(() => setLeaving(null), SLIDE_MS);
    }
    setStacks((current) => ({ ...current, [place]: current[place].filter((page) => !gone.has(page.key)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goneRecords]);

  // A note's history opens as a page over the note's.
  const { open: historyAsked, onShown: historyShown } = props.history;
  useEffect(() => {
    if (!historyAsked) return;
    historyShown();
    push({ kind: 'history', path: historyAsked });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyAsked]);
  /** Back from a version restored to the note, past the history. */
  const backToNote = () => {
    setStacks((current) => {
      const pages = current[place];
      const at = pages.findIndex((page) => page.kind === 'history');
      return at < 0 ? current : { ...current, [place]: pages.slice(0, at) };
    });
  };

  /** A tap on the place on screen goes back to its first page. */
  const choose = (next: Place) => {
    if (next !== place) return setPlace(next);
    if (stack.length < 2) return;
    leaveAll([...stack].reverse(), () => {
      if (stack.some((page) => page.kind === 'card')) props.card.onClosed();
      setStacks((current) => ({ ...current, [place]: [current[place][0]!] }));
    });
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
    if (page.kind === 'root') return of === 'today' ? t('side.today') : of === 'recent' ? t('phone.recent') : of === 'search' ? t('phone.search') : t('phone.browse');
    if (page.kind === 'folder') return folderName(page.path);
    if (page.kind === 'trash') return t('side.trash');
    if (page.kind === 'files') return t('side.files');
    if (page.kind === 'settings') return t('settings.title');
    if (page.kind === 'section') return t(settingsSections().find((each) => each.id === page.section)?.label ?? 'settings.title');
    if (page.kind === 'space') return page.id ? (props.spaces.find((space) => space.id === page.id)?.name ?? '') : (props.settings.values.spaceName ?? t('settings.personal'));
    if (page.kind === 'server') return hostOf(page.url);
    if (page.kind === 'sync') {
      if (!page.named) return t('phone.sync');
      return page.space ? (props.spaces.find((space) => space.id === page.space)?.name ?? '') : (props.settings.values.spaceName ?? t('settings.personal'));
    }
    if (page.kind === 'history') return t('history.title');
    if (page.kind === 'card') return props.card.label(page.board, page.id);
    if (page.kind === 'record') return props.record.label(page.dir, page.id);
    if (page.kind === 'version') return props.history.label(page.version);
    return nameOf(page.id, titles, filters);
  };

  const folders = folderPaths(tree);
  // The saved filters sit in their folders; one in none, or in a folder that is gone, at the personal space's top.
  const placeOf = (filter: TaskFilter) => (filter.folder && folders.has(filter.folder) ? filter.folder : '');

  /** Where something opened is: its folder, or its space's name at the top of one. */
  const whereOf = (id: string): ReactNode => {
    const filter = filterOf(id);
    if (filter !== null) {
      const found = filters.find((each) => each.id === filter);
      return found ? folderName(placeOf(found)) : '';
    }
    // Something of another space says the space before its folder: `Acme · Sales`.
    const where = spaceWhere(pathOf(id) ?? collectionPathOf(id) ?? '');
    if (where) return where;
    const folder = folderOf(id);
    return folder ? folderName(folder) : '';
  };

  /** Recent: the things opened last, the latest first, with where each is and when it was looked at. */
  const recentPage = () => {
    const recent = recentOf(tabs, seen);
    if (recent.length === 0) return <Empty icon="clock" title={t('phone.noRecent')} text={t('phone.noRecentText')} />;
    return (
      <div className="mb-list">
        {recent.map((id) => (
          <Row
            key={id}
            icon={iconOf(id)}
            label={nameOf(id, titles, filters)}
            sub={whereOf(id)}
            right={seen[id] ? seenText(seen[id]!, now) : ''}
            onClick={() => openItem(id)}
            onHold={itemHold(id)}
          />
        ))}
      </div>
    );
  };

  /** A row of Browse for a folder, or for something at a space's top. */
  const browseRow = (node: TreeNode) => {
    if (node.kind === 'folder') {
      return (
        <Row
          key={node.path}
          icon="folder"
          folder
          label={node.name}
          right={countItems(node) || ''}
          onClick={() => push({ kind: 'folder', path: node.path })}
          onHold={folderHold(node.path)}
        />
      );
    }
    const id = node.kind === 'collection' ? collectionTab(node.path) : tabOf(node.path);
    const counted = node.kind === 'tasks' || node.kind === 'board' || node.kind === 'collection';
    return (
      <Row
        key={node.path}
        icon={node.kind}
        label={titles[node.path] ?? node.title ?? node.name}
        right={counted ? counts[id] || '' : undefined}
        onClick={() => openItem(id)}
        onHold={itemHold(id)}
      />
    );
  };

  /** In a space or a folder not read yet, as the app opens. */
  const loadingRow = (
    <div className="mb-row loading">
      <Spin />
      <span className="tx">
        <b>{t('opening.loading')}</b>
      </span>
    </div>
  );

  /** A space's section of Browse: its name with a + for what can be made at its top, and what is there; turning while it is read. */
  const spaceSection = (key: string, name: string, parent: string, nodes: TreeNode[], reading: boolean, first?: ReactNode) => (
    <Fragment key={key}>
      <div className="mb-sec">
        <span>{name}</span>
        {reading && <Spin />}
        <button type="button" aria-label={t('create.title')} title={t('create.title')} onClick={() => props.onFolderMenu(parent, () => setNewFolderIn(parent))}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="mb-list">
        {newFolderIn === parent && <FolderForm onAdd={(folder) => props.onNewFolder(folder, parent)} onCancel={() => setNewFolderIn(null)} />}
        {first}
        {nodes.map(browseRow)}
        {reading && nodes.length === 0 && loadingRow}
      </div>
    </Fragment>
  );

  const syncRight = props.syncWord.bad ? (
    <span className="wn">
      <Icon name="warn" />
      {props.syncWord.text}
    </span>
  ) : (
    props.syncWord.text
  );

  const browsePage = () => {
    // The personal space's own list, Inbox, first, then its filters; it has no menu.
    const personalFirst = (
      <>
        <Row icon="tasks" label={listName(INBOX_TASKS)} right={counts[tasksOf(INBOX_TASKS)] || ''} onClick={() => openItem(tasksOf(INBOX_TASKS))} />
        {filters
          .filter((filter) => placeOf(filter) === '')
          .map((filter) => (
            <Row
              key={filter.id}
              icon="filter"
              label={filter.name}
              right={counts[filterTab(filter.id)] || ''}
              onClick={() => openItem(filterTab(filter.id))}
              onHold={itemHold(filterTab(filter.id))}
            />
          ))}
      </>
    );
    // After the Phone spaces view of design/mockups.html: each space is a section, the personal one
    // first, the others in the sidebar's order, each with what is at its top.
    return (
      <>
        {spaceSection(
          'personal',
          spaceLabel(null),
          '',
          tree.filter((node) => node.path !== INBOX_TASKS),
          props.reading.has(''),
          personalFirst,
        )}
        {props.spaces.map((space) => spaceSection(space.id, space.name, inSpace(space.id, ''), space.tree, props.reading.has(space.id)))}
        <div className="mb-list apart">
          <Row icon="clip" label={t('side.files')} right={counts[FILES] || ''} onClick={() => push({ kind: 'files' })} />
          <Row icon="trash" label={t('side.trash')} right={counts[TRASH] || ''} onClick={() => push({ kind: 'trash' })} />
          <Row icon="cloud" label={t('phone.sync')} right={syncRight} onClick={() => push({ kind: 'sync' })} />
          <Row icon="settings" label={t('side.settings')} onClick={() => push({ kind: 'settings' })} />
        </div>
      </>
    );
  };

  const folderPage = (path: string) => {
    const node = findFolder([...tree, ...props.spaces.flatMap((space) => space.tree)], path);
    const children = node?.children ?? [];
    const placed = filters.filter((filter) => placeOf(filter) === path);
    const rows = (
      <>
        {placed.map((filter) => (
          <Row
            key={filter.id}
            icon="filter"
            label={filter.name}
            right={counts[filterTab(filter.id)] || ''}
            onClick={() => openItem(filterTab(filter.id))}
            onHold={itemHold(filterTab(filter.id))}
          />
        ))}
        {children.map((child) => {
            if (child.kind === 'folder') {
              return (
                <Row
                  key={child.path}
                  icon="folder"
                  folder
                  label={child.name}
                  right={countItems(child) || ''}
                  onClick={() => push({ kind: 'folder', path: child.path })}
                  onHold={folderHold(child.path)}
                />
              );
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
                onHold={itemHold(id)}
              />
            );
          })}
      </>
    );
    const empty = placed.length === 0 && children.length === 0;
    if (node?.reading || (!node && props.reading.has(spaceOf(path) ?? ''))) return <div className="mb-list">{loadingRow}</div>;
    if (empty && newFolderIn !== path) {
      return <Empty icon="folder" title={t('phone.emptyFolder')} text={t('phone.emptyFolderText')} action={{ label: t('create.title'), run: () => props.onCreate(path) }} />;
    }
    return (
      <div className="mb-list">
        {newFolderIn === path && <FolderForm onAdd={(name) => props.onNewFolder(name, path)} onCancel={() => setNewFolderIn(null)} />}
        {rows}
      </div>
    );
  };

  const pageOf = (page: Page, of: Place, index: number, pages: Page[]) => {
    const below = pages[index - 1];
    const back = below ? titleOf(below, of) : undefined;
    const nav = below ? { back, onBack: pop } : undefined;
    if (page.kind === 'root' && of === 'recent') return <PageFrame title={titleOf(page, of)}>{recentPage()}</PageFrame>;
    if (page.kind === 'root' && of === 'browse') return <PageFrame title={titleOf(page, of)}>{browsePage()}</PageFrame>;
    if (page.kind === 'root' && of === 'search') {
      return (
        <PageFrame title={titleOf(page, of)}>
          <PhoneSearch things={props.search.things} actions={searchActions} query={query} onQuery={setQuery} onPick={pickFound} still={props.search.still} />
        </PageFrame>
      );
    }
    if (page.kind === 'root') {
      const day = new Date().toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' });
      return (
        <PageFrame
          title={due === 'today' ? t('side.today') : t('side.upcoming')}
          sub={due === 'today' ? day : undefined}
          side={
            due === 'upcoming' && (
              <div className="mb-seg" role="tablist">
                {(['list', 'calendar'] as const).map((view) => (
                  <button key={view} type="button" role="tab" aria-selected={props.upcomingView === view} onClick={() => props.onUpcomingView(view)}>
                    {view === 'list' ? t('tasks.viewList') : t('tasks.viewMonth')}
                  </button>
                ))}
              </div>
            )
          }
          head={
            <div className="mb-seg" role="tablist">
              {(['today', 'upcoming'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={due === kind}
                  onClick={() => setDue(kind)}
                >
                  {kind === 'today' ? t('side.today') : t('side.upcoming')}
                </button>
              ))}
            </div>
          }
        >
          <div className="mb-due">{props.dueView(due)}</div>
        </PageFrame>
      );
    }
    if (page.kind === 'folder') {
      return (
        <PageFrame title={titleOf(page, of)} nav={{ ...nav, onMenu: () => props.onFolderMenu(page.path, () => setNewFolderIn(page.path)) }}>
          {folderPage(page.path)}
        </PageFrame>
      );
    }
    if (page.kind === 'files') {
      const own = props.filesChoice;
      return (
        <PageFrame
          nav={
            own.choosing
              ? { choose: { count: own.count, all: own.all, onAll: own.onAll, onDone: own.onDone } }
              : { ...nav, ...(own.any && { action: { label: t('choose.select'), run: own.onStart } }) }
          }
        >
          {props.filesView}
        </PageFrame>
      );
    }
    if (page.kind === 'trash') {
      const own = props.trashChoice;
      return (
        <PageFrame
          nav={
            own.choosing
              ? { choose: { count: own.count, all: own.all, onAll: own.onAll, onDone: own.onDone } }
              : { ...nav, ...(own.any && { action: { label: t('choose.select'), run: own.onStart } }) }
          }
        >
          <div className="mb-legacy">{props.trashView}</div>
        </PageFrame>
      );
    }
    if (page.kind === 'settings') {
      return (
        <PageFrame title={titleOf(page, of)} nav={nav}>
          <div className="mb-list">
            {settingsSections().map((each) => (
              <Row
                key={each.id}
                icon={each.icon}
                label={t(each.label)}
                right={sectionValue(each.id, props.settings.values)}
                onClick={() => push({ kind: 'section', section: each.id })}
              />
            ))}
          </div>
        </PageFrame>
      );
    }
    if (page.kind === 'history') {
      return (
        <PageFrame title={titleOf(page, of)} sub={titles[page.path]} nav={nav}>
          {props.history.list(page.path, (version) => (version ? push({ kind: 'version', path: page.path, version }) : pop()))}
        </PageFrame>
      );
    }
    if (page.kind === 'record') {
      return (
        <>
          <NavBar {...nav} scrolled={false} onMenu={() => props.record.onMenu(page.dir, page.id)} />
          <div className="mb-holder mb-record-holder">{props.record.view(page.dir, page.id)}</div>
        </>
      );
    }
    if (page.kind === 'card') {
      return (
        <>
          <NavBar {...nav} scrolled={false} onMenu={() => props.card.onMenu(page.board, page.id)} />
          <div className="mb-holder mb-card-holder">{props.card.view(page.board, page.id)}</div>
        </>
      );
    }
    if (page.kind === 'version') {
      return (
        <>
          <NavBar {...nav} title={titleOf(page, of)} scrolled />
          <div className="mb-holder mb-version-page">{props.history.version(page.path, page.version, backToNote)}</div>
        </>
      );
    }
    if (page.kind === 'section' && page.section === 'spaces') {
      return (
        <PageFrame title={titleOf(page, of)} nav={{ ...nav, action: { label: reordering ? t('phone.done') : t('phone.reorder'), run: () => setReordering(!reordering) } }}>
          <PhoneSpacesList
            values={props.settings.values}
            reordering={reordering}
            onOpen={(id) => push({ kind: 'space', id })}
            onAdd={() => setAddingSpace(true)}
            onServer={(url) => push({ kind: 'server', url })}
          />
        </PageFrame>
      );
    }
    if (page.kind === 'section' && page.section === 'logs') {
      const copy = { label: t(logView.copied ? 'logs.copied' : 'logs.copy'), run: () => void logView.copy() };
      return (
        <PageFrame title={titleOf(page, of)} nav={{ ...nav, ...(logView.shown.length > 0 && { action: copy }) }}>
          <PhoneLogs view={logView} />
        </PageFrame>
      );
    }
    if (page.kind === 'section' && page.section === 'agents') {
      return (
        <PageFrame title={titleOf(page, of)} sub={t('agents.phoneAbout')} nav={nav}>
          <PhoneAgents onConnect={() => setAddingSpace(true)} />
        </PageFrame>
      );
    }
    if (page.kind === 'section') {
      return (
        <PageFrame title={titleOf(page, of)} nav={nav}>
          <div className="mb-settings">
            <SettingsSection section={page.section} {...props.settings.values} onSection={(section) => push({ kind: 'section', section })} />
          </div>
        </PageFrame>
      );
    }
    if (page.kind === 'space') {
      const space = page.id ? props.spaces.find((each) => each.id === page.id) : undefined;
      // The personal space is the device's own: its folder, its sync and this device's name.
      if (!page.id) {
        return (
          <PageFrame title={titleOf(page, of)} sub={t('settings.onlyYou')} nav={nav}>
            <PhonePersonalPage values={props.settings.values} onSync={() => push({ kind: 'sync', space: null })} />
          </PageFrame>
        );
      }
      if (!space) return <PageFrame title={titleOf(page, of)} nav={nav}>{null}</PageFrame>;
      return (
        <PageFrame title={space.name} sub={spacePlace(space)} nav={{ ...nav, onMenu: () => setSpaceMenu(space.id) }}>
          <PhoneSpacePage space={space} values={props.settings.values} onSync={() => push({ kind: 'sync', space: space.id })} />
        </PageFrame>
      );
    }
    if (page.kind === 'server') {
      const server = knownServers().find((each) => each.url === page.url);
      if (!server) return <PageFrame title={titleOf(page, of)} nav={nav}>{null}</PageFrame>;
      const { syncService } = props.settings.values;
      return (
        <PageFrame title={titleOf(page, of)} sub={<YouAre url={server.url} />} nav={nav}>
          <PhoneServerPage
            server={server}
            onDevice={props.spaces.map((space) => space.id)}
            onAgents={() => push({ kind: 'section', section: 'agents' })}
            onSignOut={() => {
              pop();
              void syncService.signOutOfServer(server.url);
            }}
          />
        </PageFrame>
      );
    }
    if (page.kind === 'sync') {
      const values = props.settings.values;
      // With more than one space, a row for each, Sync now turning every one; with one, its page.
      if (page.space === undefined && props.spaces.length > 0) {
        return (
          <PageFrame title={titleOf(page, of)} nav={{ ...nav, ...(values.sync.all.length > 0 && { action: { label: t('sync.syncNow'), run: () => values.syncService.syncNow() } }) }}>
            <PhoneSyncList sync={values.sync} spaces={props.spaces} personalName={values.spaceName ?? t('settings.personal')} onOpen={(space) => push({ kind: 'sync', space, named: true })} />
          </PageFrame>
        );
      }
      return (
        <PhoneSyncPage
          space={page.space ?? null}
          values={values}
          frame={(head, body) => (
            <PageFrame title={titleOf(page, of)} sub={head.sub} nav={{ ...nav, ...(head.action && { action: head.action }), ...(head.onMenu && { onMenu: head.onMenu }) }}>
              {body}
            </PageFrame>
          )}
        />
      );
    }
    // Something open: the app's drawing of it is moved in here while this page is on top.
    return (
      <>
        <NavBar
          {...nav}
          scrolled={false}
          onMenu={() => props.onItemMenu(page.id, true)}
        />
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
  // + adds what the page is for: on Today a task due today, on Upcoming one due tomorrow, or on the
  // day chosen in its month; in Browse and a folder Create for that folder; in a list a task.
  const fab =
    top.kind === 'root' && place === 'today'
      ? () => props.onAdd(due === 'today' ? TODAY : UPCOMING)
      : (top.kind === 'root' && place !== 'search') || top.kind === 'folder'
        ? () => props.onCreate(top.kind === 'folder' ? top.path : '')
        : top.kind === 'item' && props.canAdd(top.id)
          ? () => props.onAdd(top.id)
          : null;

  return (
    // The phone's own layout fills what the phone shows: with the keyboard up it ends on the keyboard.
    // A card's page has its comment box where the tab bar is.
    <div className={['mb', keyboard ? 'keyboard' : '', top.kind === 'card' ? 'card-page' : '', choosing ? 'choosing' : ''].filter(Boolean).join(' ')} style={{ top: view.top, height: view.height }}>
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
            <div className={props.notice.undo || props.notice.action ? 'mb-toast undo' : 'mb-toast'} role="status">
              <span>{props.notice.text}</span>
              {props.notice.undo && (
                <button type="button" onClick={props.onUndo}>
                  {t('notice.undo')}
                </button>
              )}
              {props.notice.action && (
                <button type="button" onClick={props.notice.action.run}>
                  {props.notice.action.label}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {spaceMenu && (
        <ActionSheet
          head={{ icon: 'space', title: props.spaces.find((space) => space.id === spaceMenu)?.name ?? '' }}
          items={[{ label: t('phone.removeFromPhone'), danger: true, run: () => setRemovingSpace(spaceMenu) }]}
          onClose={() => setSpaceMenu(null)}
        />
      )}
      {removingSpace &&
        (() => {
          const space = props.spaces.find((each) => each.id === removingSpace);
          return (
            space && (
              <RemoveSpaceSheet
                space={space}
                onRemove={(deleteFiles) => {
                  pop();
                  props.settings.values.onRemoveSpace(space.id, deleteFiles);
                }}
                onClose={() => setRemovingSpace(null)}
              />
            )
          );
        })()}
      {/* Add space, also when the page came back from Microsoft to choose the new space's folder. */}
      {(addingSpace || !!props.settings.values.addingAs) && (
        <PhoneAddSpaceSheet
          values={props.settings.values}
          onClose={() => setAddingSpace(false)}
        />
      )}
      {held &&
        createPortal(
          <div
            className={`mb-lifted ${held.className}`}
            style={{ top: held.box.top, left: held.box.left, width: held.box.width, height: held.box.height }}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: held.html }}
          />,
          document.body,
        )}
      {choice?.choosing && (
        <nav className="mb-selbar" aria-label={t('choose.selected', { count: choice.count })}>
          {choice.actions.map((action) => (
            <button key={action.label} type="button" className={action.danger ? 'danger' : undefined} disabled={choice.count === 0} onClick={action.run}>
              <Icon name={action.icon} />
              <span>{action.label}</span>
            </button>
          ))}
        </nav>
      )}
      <nav className="mb-tabbar" aria-label={t('phone.places')}>
        {PLACES.map((each) => (
          <button key={each} type="button" aria-current={each === place ? 'page' : undefined} onClick={() => choose(each)}>
            {each === 'today' ? <DayIcon /> : <Icon name={each === 'recent' ? 'clock' : each === 'search' ? 'search' : 'folder'} />}
            <span>{each === 'today' ? t('side.today') : each === 'recent' ? t('phone.recent') : each === 'search' ? t('phone.search') : t('phone.browse')}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
