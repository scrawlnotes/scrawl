import { nameMatch, orderQuickNotes, type QuickOrder, type QuickSort, splitQuickNote, type TreeNode } from '@scrawlnotes/core';
import { copyText, type ScrawlViewer, visibleText } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type DragEvent, Fragment, type MouseEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog, type MenuItem } from './dialogs';
import { Icon } from './Icon';
import type { QuickOpened } from './session';
import { writtenText } from './text';

// Quick notes (design/quick-notes.md): a few lines each, seen at a glance as cards with what they
// say, as in Keep. Take a note… at the top opens in place to write a new one; a card opens in a
// window in the middle. Both have the note's own format bar and editor.

/** What the cards and the windows ask of the app. */
export interface QuickActions {
  /** The editor of a quick note, or of a new one with `path` null, in `parent`; at the words a search found in its file. */
  open: (path: string | null, parent: HTMLElement, onTitle: (title: string) => void, pinned: boolean, found?: [number, number][]) => Promise<QuickOpened>;
  /** Writes what the editor `id` opened holds and lets it go. */
  close: (id: number) => Promise<void>;
  title: (title: string) => void;
  pin: (path: string, on: boolean) => void;
  sort: (sort: QuickSort) => void;
  /** All the notes as they show after one was dragged, pinned ones first. */
  order: (shown: string[]) => void;
  /** Shows a note's body as the editor reads it, without editing, in `parent`. */
  viewer: (path: string, parent: HTMLElement, body: string) => ScrawlViewer;
  followLink: (path: string, href: string) => void;
  /** The note in the window on the clipboard, as it is now. */
  copy: (path: string) => boolean;
  moveTo: (path: string) => void;
  history: (path: string) => void;
  trash: (path: string) => void;
  markdown: (on: boolean) => void;
  /** A menu at the pointer, as the app draws its menus. */
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  /** Says something for a moment. */
  say: (text: string) => void;
}

const CARD = 240;
const GAP = 14;

/** A text as it shows, with the spans found in it marked. */
function Marked({ text, spans }: { text: string; spans: [number, number][] }) {
  if (spans.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [from, to] of spans) {
    if (from > at) parts.push(text.slice(at, from));
    parts.push(<mark key={from}>{text.slice(from, to)}</mark>);
    at = to;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Where what was typed is found in a note: in its title and in its body; null when not all of it is there. */
function found(text: string, query: string): { title: [number, number][]; body: [number, number][] } | null {
  const { title, body } = splitQuickNote(text);
  const both = `${title}\n${body}`;
  const spans = query.trim() ? nameMatch(both, query) : [];
  if (!spans) return null;
  const cut = title.length + 1;
  return {
    title: spans.filter(([from]) => from < title.length).map(([from, to]) => [from, Math.min(to, title.length)]),
    body: spans.filter(([from]) => from >= cut).map(([from, to]) => [from - cut, to - cut]),
  };
}

/** A note's whole text on the clipboard: as it reads, as HTML, and its Markdown. */
function copyNote(text: string, viewer: ScrawlViewer | null): boolean {
  const { title, body } = splitQuickNote(text);
  const read = viewer ? visibleText(viewer.view.state, 0, viewer.view.state.doc.length, true) : body;
  return copyText(title ? `${title}${read ? `\n\n${read}` : ''}` : read, text);
}

interface CardProps {
  path: string;
  text: string;
  spans: { title: [number, number][]; body: [number, number][] };
  pinned: boolean;
  /** Hidden while it is open in the window: it is there, being written. */
  away: boolean;
  dragging: boolean;
  draggable: boolean;
  actions: QuickActions;
  onOpen: (path: string) => void;
  onHeight: (path: string, height: number) => void;
  onDragStart: (path: string) => void;
  onDragOver: (path: string, before: boolean) => void;
  onDragEnd: () => void;
}

/**
 * A note as a card: its title, then its body as the editor draws it, cut where it is long. A link
 * or a recording in it works where it is; anywhere else a click opens the note. Hovered, it shows
 * its pin and its menu.
 */
function QuickCard({ path, text, spans, pinned, away, dragging, draggable, actions, onOpen, onHeight, onDragStart, onDragOver, onDragEnd }: CardProps) {
  const { title, body } = useMemo(() => splitQuickNote(text), [text]);
  const card = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ScrawlViewer | null>(null);
  const shown = useRef(body);
  const [menuOpen, setMenuOpen] = useState(false);
  // Cut where it is long: its end fades.
  const [long, setLong] = useState(false);

  useEffect(() => {
    viewer.current = actions.viewer(path, host.current!, shown.current);
    return () => viewer.current?.destroy();
  }, [path]);
  useEffect(() => {
    if (body === shown.current) return;
    shown.current = body;
    viewer.current?.show(body);
  }, [body]);
  useEffect(() => viewer.current?.mark(spans.body), [spans.body, body]);

  // Its height places it in the shortest column; it changes as images come in.
  useLayoutEffect(() => {
    const element = card.current!;
    const tell = () => {
      onHeight(path, element.offsetHeight);
      setLong(element.scrollHeight > element.clientHeight + 1);
    };
    tell();
    const watch = new ResizeObserver(tell);
    watch.observe(element);
    // The body grows inside the card, which stops growing at its cut.
    if (host.current) watch.observe(host.current);
    return () => watch.disconnect();
  }, [path]);

  const menu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(true);
    actions.menu(event, [
      { label: t('quick.copy'), icon: 'copy', run: () => void (copyNote(text, viewer.current) && actions.say(t('quick.copied'))) },
      { label: t('menu.moveTo'), icon: 'move', run: () => actions.moveTo(path) },
      { label: t('menu.history'), icon: 'clock', run: () => actions.history(path) },
      { label: t('menu.delete'), icon: 'trash', danger: true, apart: true, run: () => actions.trash(path) },
    ]);
  };
  // The menu marks its card while it is open; it closes with the next press anywhere.
  useEffect(() => {
    if (!menuOpen) return;
    const off = () => setMenuOpen(false);
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', off);
    return () => {
      window.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', off);
    };
  }, [menuOpen]);

  return (
    <div
      ref={card}
      className={`qn-card${menuOpen ? ' menu-on' : ''}${long ? ' long' : ''}${away ? ' away' : ''}${dragging ? ' dragging' : ''}`}
      draggable={draggable}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        const link = target.closest<HTMLElement>('.cm-sl-link');
        if (link?.dataset.href) return actions.followLink(path, link.dataset.href);
        if (target.closest('button, audio, .cm-sl-media, .qn-cardbtn')) return;
        onOpen(path);
      }}
      onContextMenu={menu}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', title || body.slice(0, 80));
        onDragStart(path);
      }}
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        const box = card.current!.getBoundingClientRect();
        onDragOver(path, event.clientY < box.top + box.height / 2);
      }}
      onDragEnd={onDragEnd}
    >
      {title && (
        <b className="qn-ctitle">
          <Marked text={title} spans={spans.title} />
        </b>
      )}
      <div ref={host} className="qn-cbody" hidden={body === ''} />
      <button
        type="button"
        className={`qn-cardbtn qn-cpin${pinned ? ' on' : ''}`}
        title={t(pinned ? 'quick.unpin' : 'quick.pin')}
        aria-label={t(pinned ? 'quick.unpin' : 'quick.pin')}
        aria-pressed={pinned}
        onClick={() => actions.pin(path, !pinned)}
      >
        <Icon name="pin" />
      </button>
      <button type="button" className="qn-cardbtn qn-cmore" title={t('side.more')} aria-label={t('side.more')} onClick={menu}>
        ···
      </button>
    </div>
  );
}

interface EditorProps {
  /** The note written in it; null for a new one. */
  path: string | null;
  /** A new one pinned from the start. */
  pinned?: boolean;
  /** When the note was last written, under it in the window. */
  modified?: number;
  /** The words a search found in its file, marked as it opens. */
  found?: [number, number][];
  /** In the window in the middle, rather than in place of Take a note…. */
  inWindow: boolean;
  /** The note's format bar, working on this editor while it is open. */
  bar: ReactNode;
  actions: QuickActions;
  /** Asks to close it: Close, Escape or a click outside. */
  onClose: () => void;
}

/**
 * A quick note being written: the format bar, the title with the pin beside it, the note, and
 * Close. What is written is kept as it is typed; closing writes the rest. The cursor starts in the
 * note; a click on the title, or Enter there, moves it.
 */
function QuickEditor({ path, pinned: pinnedAtFirst = false, modified, found, inWindow, bar, actions, onClose }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const opened = useRef<QuickOpened | null>(null);
  const [made, setMade] = useState<QuickOpened | null>(null);
  const [title, setTitle] = useState('');
  const [pinned, setPinned] = useState(pinnedAtFirst);
  const [markdown, setMarkdown] = useState(false);

  useEffect(() => {
    let live = true;
    void actions.open(path, host.current!, (text) => live && setTitle(text), pinnedAtFirst, found).then((done) => {
      if (!live) return void actions.close(done.id);
      opened.current = done;
      setMade(done);
      setTitle(done.title);
      setPinned(done.pinned);
    });
    return () => {
      live = false;
      if (opened.current) void actions.close(opened.current.id);
    };
  }, []);

  const toBody = () => host.current?.querySelector<HTMLElement>('.cm-content')?.focus();
  const pin = () => {
    if (!made) return;
    setPinned(!pinned);
    actions.pin(made.path, !pinned);
  };
  const more = (event: MouseEvent) => {
    if (!made || path === null) return;
    actions.menu(event, [
      { label: t('quick.copy'), icon: 'copy', run: () => void (actions.copy(made.path) && actions.say(t('quick.copied'))) },
      { label: t('menu.moveTo'), icon: 'move', run: () => actions.moveTo(made.path) },
      { label: t('menu.history'), icon: 'clock', run: () => actions.history(made.path) },
      {
        label: t('status.markdown'),
        icon: 'markdown',
        checked: markdown,
        run: () => {
          setMarkdown(!markdown);
          actions.markdown(!markdown);
        },
      },
      { label: t('menu.delete'), icon: 'trash', danger: true, apart: true, run: () => actions.trash(made.path) },
    ]);
  };
  return (
    <div
      className={inWindow ? 'qn-ed win' : 'qn-ed'}
      // In place, Escape closes it as Close does; the window has its own. Not when the editor took
      // it first, to close its find bar.
      onKeyDown={(event) => !inWindow && event.key === 'Escape' && !event.defaultPrevented && onClose()}
    >
      {bar}
      <div className="qn-title">
        <input
          type="text"
          value={title}
          placeholder={t('quick.titleHint')}
          aria-label={t('quick.titleHint')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setTitle(event.target.value);
            actions.title(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            toBody();
          }}
        />
        <button type="button" className={pinned ? 'qn-pin on' : 'qn-pin'} title={t(pinned ? 'quick.unpin' : 'quick.pin')} aria-label={t(pinned ? 'quick.unpin' : 'quick.pin')} aria-pressed={pinned} onClick={pin}>
          <Icon name="pin" />
        </button>
      </div>
      <div ref={host} className="qn-body" />
      <div className="qn-foot">
        {path !== null && modified !== undefined && <span>{writtenText(modified)}</span>}
        {path !== null && (
          <button type="button" className="qn-more" title={t('side.more')} aria-label={t('side.more')} onClick={more}>
            ···
          </button>
        )}
        <button type="button" className="qn-close" onClick={onClose}>
          {t('quick.close')}
        </button>
      </div>
    </div>
  );
}

/** A quick note open in the window in the middle: Escape and a click outside close it, as Close does. */
export function QuickWindow({ path, modified, found, bar, actions, onClose }: { path: string | null; modified?: number; found?: [number, number][]; bar: ReactNode; actions: QuickActions; onClose: () => void }) {
  return (
    <Dialog label={t('quick.title')} className="qn-window" onClose={onClose}>
      <QuickEditor path={path} modified={modified} {...(found && { found })} inWindow bar={bar} actions={actions} onClose={onClose} />
    </Dialog>
  );
}

interface Props {
  notes: TreeNode[];
  texts: Record<string, string>;
  order: QuickOrder;
  sort: QuickSort;
  /** When each item was made, by its path lowercased. */
  created: Record<string, number>;
  /** The note open in the window, if any. */
  open: string | null;
  /** The note's format bar, for Take a note… while it is open. */
  bar: ReactNode;
  actions: QuickActions;
  onOpen: (path: string) => void;
}

/** The Quick notes tab: its name and how many, search and Sort, Take a note…, then the cards. */
export function QuickNotes({ notes, texts, order, sort, created, open, bar, actions, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [taking, setTaking] = useState(false);
  const taker = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  const heights = useRef(new Map<string, number>());
  const [, relayout] = useState(0);
  const [drag, setDrag] = useState<{ path: string; shown: string[] } | null>(null);

  // As many columns of cards as the width takes.
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const fit = () => setColumns(Math.max(1, Math.floor((element.clientWidth + GAP) / (CARD + GAP))));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  // Take a note… closes with a click outside it, as with Close; not with one in a menu or a window it opened.
  useEffect(() => {
    if (!taking) return;
    const outside = (event: globalThis.MouseEvent) => {
      const target = event.target as Element;
      if (taker.current?.contains(target) || target.closest('.menu, .backdrop, .dialog, .sheet')) return;
      setTaking(false);
    };
    window.addEventListener('mousedown', outside);
    return () => window.removeEventListener('mousedown', outside);
  }, [taking]);

  const paths = notes.map((note) => note.path);
  const modified = new Map(notes.map((note) => [note.path, note.modified]));
  const sorted = orderQuickNotes(paths, order, sort, { created: (path) => created[path.toLowerCase()], modified: (path) => modified.get(path) });
  const matches = new Map<string, NonNullable<ReturnType<typeof found>>>();
  for (const path of paths) {
    const where = found(texts[path] ?? '', query);
    if (where) matches.set(path, where);
  }
  // While a card is dragged the cards stand where it would go.
  const all = drag?.shown ?? [...sorted.pinned, ...sorted.others];
  const pinnedSet = new Set(sorted.pinned);
  const pinned = all.filter((path) => pinnedSet.has(path) && matches.has(path));
  const others = all.filter((path) => !pinnedSet.has(path) && matches.has(path));

  const onHeight = (path: string, height: number) => {
    if (heights.current.get(path) === height) return;
    heights.current.set(path, height);
    relayout((n) => n + 1);
  };

  /** The cards in columns, each in the shortest so far: their order reads row by row. */
  const masonry = (list: string[]) => {
    const cols: string[][] = Array.from({ length: Math.min(columns, Math.max(1, list.length)) }, () => []);
    const sums = cols.map(() => 0);
    for (const path of list) {
      const at = sums.indexOf(Math.min(...sums));
      cols[at]!.push(path);
      sums[at]! += (heights.current.get(path) ?? 120) + GAP;
    }
    return (
      <div className="qn-grid" style={{ width: columns * CARD + (columns - 1) * GAP }}>
        {cols.map((col, index) => (
          <div className="qn-col" key={index}>
            {col.map((path) => (
              <QuickCard
                key={path}
                path={path}
                text={texts[path] ?? ''}
                spans={matches.get(path) ?? { title: [], body: [] }}
                pinned={pinnedSet.has(path)}
                away={path === open}
                dragging={drag?.path === path}
                draggable={sort === 'custom' && !query.trim()}
                actions={actions}
                onOpen={onOpen}
                onHeight={onHeight}
                onDragStart={(dragged) => setDrag({ path: dragged, shown: [...sorted.pinned, ...sorted.others] })}
                onDragOver={(over, before) => {
                  if (!drag || over === drag.path || pinnedSet.has(over) !== pinnedSet.has(drag.path)) return;
                  const rest = drag.shown.filter((each) => each !== drag.path);
                  const at = rest.indexOf(over) + (before ? 0 : 1);
                  const shown = [...rest.slice(0, at), drag.path, ...rest.slice(at)];
                  if (shown.join('\n') !== drag.shown.join('\n')) setDrag({ ...drag, shown });
                }}
                onDragEnd={() => setDrag(null)}
              />
            ))}
          </div>
        ))}
      </div>
    );
  };

  const sortItems: MenuItem[] = (['custom', 'created', 'modified'] as const).map((each) => ({
    label: t(each === 'custom' ? 'quick.sortCustom' : each === 'created' ? 'quick.sortCreated' : 'quick.sortModified'),
    checked: sort === each,
    run: () => actions.sort(each),
  }));
  const sortLabel = sortItems.find((item) => item.checked)?.label;
  const shownCount = pinned.length + others.length;

  return (
    <div className="qn">
      <div className="qn-top">
        <b>{t('quick.title')}</b>
        {notes.length > 0 && <span className="count">{query.trim() ? t('quick.found', { count: shownCount, total: notes.length }) : t('quick.count', { count: notes.length })}</span>}
        <label className="qn-search">
          <Icon name="search" />
          <input type="search" value={query} placeholder={t('quick.search')} aria-label={t('quick.search')} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && setQuery('')} />
        </label>
        <button type="button" className="qn-sort" title={t('quick.sort')} onClick={(event) => actions.menu(event, sortItems)}>
          <Icon name="sort" />
          {sortLabel}
        </button>
      </div>
      <div className="qn-scroll">
        <div ref={taker} className="qn-taking">
          {taking ? (
            <QuickEditor path={null} inWindow={false} bar={bar} actions={actions} onClose={() => setTaking(false)} />
          ) : (
            <button type="button" className="qn-take" onClick={() => setTaking(true)}>
              {t('quick.takeNote')}
            </button>
          )}
        </div>
        <div
          ref={grid}
          className="qn-cards"
          // A card dropped anywhere among them, on another or between two, stays where it shows.
          onDragOver={(event) => drag && event.preventDefault()}
          onDrop={(event) => {
            if (!drag) return;
            event.preventDefault();
            actions.order(drag.shown);
            setDrag(null);
          }}
        >
          {notes.length === 0 ? (
            <div className="qn-empty">
              <Icon name="quick" />
              <span>{t('quick.empty')}</span>
            </div>
          ) : shownCount === 0 ? (
            <p className="qn-none">{t('quick.noMatch')}</p>
          ) : (
            <>
              {pinned.length > 0 && (
                <Fragment>
                  <div className="qn-sec" style={{ width: columns * CARD + (columns - 1) * GAP }}>
                    {t('quick.pinned')}
                  </div>
                  {masonry(pinned)}
                  {others.length > 0 && (
                    <div className="qn-sec" style={{ width: columns * CARD + (columns - 1) * GAP }}>
                      {t('quick.others')}
                    </div>
                  )}
                </Fragment>
              )}
              {others.length > 0 && masonry(others)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
