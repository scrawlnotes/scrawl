import { nameMatch, orderQuickNotes, type QuickOrder, type QuickSort, splitQuickNote, type TreeNode } from '@scrawlnotes/core';
import { copyText, type ScrawlViewer, visibleText } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type CSSProperties, type DragEvent, Fragment, type MouseEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Dialog, type MenuHead, type MenuItem } from './dialogs';
import { Icon } from './Icon';
import type { QuickOpened } from './session';
import { writtenText } from './text';
import { holdToDrag } from './touchDrag';

// Quick notes (design/quick-notes.md): a few lines each, seen at a glance as cards with what they
// say, as in Keep. Take a note… at the top opens in place to write a new one; a card opens in a
// window in the middle. Both have the note's own format bar and editor. On a phone the cards are a
// page of two columns, and a note opens as a page of its own (4).

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
  /** Find and replace in the note open. */
  find: () => void;
  /** A menu at the pointer, as the app draws its menus. */
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  /** On a phone, an action sheet with what it is about at its top. */
  sheet: (items: MenuItem[], head: MenuHead) => void;
  /** Says something for a moment. */
  say: (text: string) => void;
}

const CARD = 240;
const GAP = 14;
/** On a phone, the gap between the two columns of cards. */
const PHONE_GAP = 10;
/** How much nearer another place must be than its own for a card dragged to take it. */
const SETTLE = 16;

/** The ways the quick notes are put in order, as Keep has them, the one chosen ticked. */
export const quickSortItems = (sort: QuickSort, onSort: (sort: QuickSort) => void): MenuItem[] =>
  (['custom', 'created', 'modified'] as const).map((each) => ({
    label: t(each === 'custom' ? 'quick.sortCustom' : each === 'created' ? 'quick.sortCreated' : 'quick.sortModified'),
    icon: each === 'custom' ? 'quick' : each === 'created' ? 'calendar' : 'clock',
    checked: sort === each,
    run: () => onSort(each),
  }));

/** What a quick note's sheet says it is about: its title, or its first line. */
const headOf = (text: string, foot?: string): MenuHead => {
  const { title, body } = splitQuickNote(text);
  const first = body.split('\n').find((line) => line.trim() !== '') ?? '';
  return { icon: 'quick', title: title || first || t('create.quick'), sub: t('create.quick'), ...(foot && { foot }) };
};

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
  /** Where it stands among the cards of its section. */
  place: CSSProperties;
  actions: QuickActions;
  onOpen: (path: string) => void;
  onHeight: (path: string, height: number) => void;
  /** Taken to be dragged: where in it the pointer holds it, and the box of its section. */
  onDragStart: (path: string, grip: { x: number; y: number }, section: HTMLElement) => void;
  onDragEnd: () => void;
  /** On a phone: held and moved, it is dragged with the finger (touchDrag.ts), which says where it is. */
  phone?: { onMove: (x: number, y: number) => void; onDrop: () => void };
}

/**
 * A note as a card: its title, then its body as the editor draws it, cut where it is long. A link
 * or a recording in it works where it is; anywhere else a click opens the note. Hovered, it shows
 * its pin and its menu. On a phone, held and let go where it was its sheet opens; held and moved,
 * by hand, it is dragged.
 */
function QuickCard({ path, text, spans, pinned, away, dragging, draggable, place, actions, onOpen, onHeight, onDragStart, onDragEnd, phone }: CardProps) {
  const { title, body } = useMemo(() => splitQuickNote(text), [text]);
  const card = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ScrawlViewer | null>(null);
  const shown = useRef(body);
  const [menuOpen, setMenuOpen] = useState(false);
  // Cut where it is long: its end fades.
  const [long, setLong] = useState(false);

  // Drawn before it is measured below, so that it is placed by its whole height from the first.
  useLayoutEffect(() => {
    viewer.current = actions.viewer(path, host.current!, shown.current);
    return () => viewer.current?.destroy();
  }, [path]);
  useLayoutEffect(() => {
    if (body === shown.current) return;
    shown.current = body;
    viewer.current?.show(body);
  }, [body]);
  useEffect(() => viewer.current?.mark(spans.body), [spans.body, body]);

  // Its height places it in the shortest column; it changes as images come in. The cards below it
  // move before the page is drawn, so that none is drawn over another.
  useLayoutEffect(() => {
    const element = card.current!;
    const tell = () => {
      onHeight(path, element.offsetHeight);
      setLong(element.scrollHeight > element.clientHeight + 1);
    };
    tell();
    const watch = new ResizeObserver(() => flushSync(tell));
    watch.observe(element);
    // The body grows inside the card, which stops growing at its cut.
    if (host.current) watch.observe(host.current);
    return () => watch.disconnect();
  }, [path]);

  const copy = () => void (copyNote(text, viewer.current) && actions.say(t('quick.copied')));
  /** A phone's sheet: what is done with a card there, its pin first, as it has no button for it. */
  const sheet = () =>
    actions.sheet(
      [
        { label: t(pinned ? 'quick.unpin' : 'quick.pin'), icon: 'pin', run: () => actions.pin(path, !pinned) },
        { label: t('quick.copy'), icon: 'copy', run: copy },
        { label: t('menu.moveTo'), icon: 'move', run: () => actions.moveTo(path) },
        { label: t('menu.delete'), icon: 'trash', danger: true, run: () => actions.trash(path) },
      ],
      headOf(text),
    );
  const menu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (phone) return sheet();
    setMenuOpen(true);
    actions.menu(event, [
      { label: t('quick.copy'), icon: 'copy', run: copy },
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
  /** Taken to be dragged, the pointer at `x`, `y`. */
  const take = (x: number, y: number) => {
    const element = card.current!;
    const box = element.getBoundingClientRect();
    onDragStart(path, { x: x - box.left, y: y - box.top }, element.parentElement!);
  };

  return (
    <div
      ref={card}
      className={`qn-card${menuOpen ? ' menu-on' : ''}${long ? ' long' : ''}${away ? ' away' : ''}${dragging ? ' dragging' : ''}`}
      data-quick={path}
      style={place}
      draggable={!phone && draggable}
      onPointerDown={(event) => {
        if (!phone || (event.target as HTMLElement).closest('.cm-sl-link, button, audio')) return;
        holdToDrag(event, {
          element: card.current!,
          onLift: (x, y) => (draggable ? take(x, y) : undefined),
          onMove: (x, y) => draggable && phone.onMove(x, y),
          onDrop: () => (draggable ? phone.onDrop() : onDragEnd()),
          onCancel: onDragEnd,
          // Let go where it lifted: what can be done with it.
          onStill: () => {
            onDragEnd();
            sheet();
          },
        });
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        const link = target.closest<HTMLElement>('.cm-sl-link');
        if (link?.dataset.href) return actions.followLink(path, link.dataset.href);
        if (target.closest('button, audio, .cm-sl-media, .qn-cardbtn')) return;
        onOpen(path);
      }}
      // A phone's long press is the hold above, which opens the sheet.
      onContextMenu={phone ? (event) => event.preventDefault() : menu}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', title || body.slice(0, 80));
        take(event.clientX, event.clientY);
      }}
      onDragEnd={onDragEnd}
    >
      {title && (
        <b className="qn-ctitle">
          <Marked text={title} spans={spans.title} />
        </b>
      )}
      <div ref={host} className="qn-cbody" hidden={body === ''} />
      {!phone && (
        <>
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
        </>
      )}
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
  /** Asks to close it: Close, Escape or a click outside; on a phone, back. */
  onClose: () => void;
  /** On a phone, a page of its own: its bar has back, named after the page under it, the pin and ···. */
  phoneBack?: string;
}

/**
 * A quick note being written: the format bar, the title with the pin beside it, the note, and
 * Close. What is written is kept as it is typed; closing writes the rest. The cursor starts in the
 * note; a click on the title, or Enter there, moves it. On a phone it is a page: back, the pin and
 * ··· at its top, then the format bar, the title and the note.
 */
function QuickEditor({ path, pinned: pinnedAtFirst = false, modified, found, inWindow, bar, actions, onClose, phoneBack }: EditorProps) {
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
  // On a phone, its page's ···: as the window's, with Find, and when it was last written under it.
  const phoneMore = () => {
    if (!made || path === null) return;
    actions.sheet(
      [
        { label: t('quick.copy'), icon: 'copy', run: () => void (actions.copy(made.path) && actions.say(t('quick.copied'))) },
        { label: t('menu.moveTo'), icon: 'move', run: () => actions.moveTo(made.path) },
        { label: t('find.find'), icon: 'search', run: actions.find },
        {
          label: t('status.markdown'),
          icon: 'markdown',
          value: markdown ? t('phone.on') : t('phone.off'),
          run: () => {
            setMarkdown(!markdown);
            actions.markdown(!markdown);
          },
        },
        { label: t('menu.history'), icon: 'clock', run: () => actions.history(made.path) },
        { label: t('menu.delete'), icon: 'trash', danger: true, run: () => actions.trash(made.path) },
      ],
      { icon: 'quick', title: title || t('create.quick'), ...(title && { sub: t('create.quick') }), ...(modified !== undefined && { foot: writtenText(modified) }) },
    );
  };
  const titleField = (
    <input
      type="text"
      value={title}
      placeholder={t('quick.titleHint')}
      aria-label={t('quick.titleHint')}
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="next"
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
  );
  const pinLabel = t(pinned ? 'quick.unpin' : 'quick.pin');
  if (phoneBack !== undefined) {
    return (
      <div className="qn-ed phone">
        <div className="mb-nav">
          <button type="button" className="mb-back" aria-label={t('phone.back', { page: phoneBack })} onClick={onClose}>
            <Icon name="back" />
            <span>{phoneBack}</span>
          </button>
          <span className="qn-navgap" />
          <button type="button" className={pinned ? 'mb-ib qn-npin on' : 'mb-ib qn-npin'} aria-label={pinLabel} title={pinLabel} aria-pressed={pinned} onClick={pin}>
            <Icon name="pin" />
          </button>
          {path !== null && (
            <button type="button" className="mb-ib" aria-label={t('side.more')} title={t('side.more')} onClick={phoneMore}>
              <Icon name="more" />
            </button>
          )}
        </div>
        {bar}
        <div className="qn-mscroll">
          <div className="qn-title">{titleField}</div>
          <div ref={host} className="qn-body" />
        </div>
      </div>
    );
  }
  return (
    <div
      className={inWindow ? 'qn-ed win' : 'qn-ed'}
      // In place, Escape closes it as Close does; the window has its own. Not when the editor took
      // it first, to close its find bar.
      onKeyDown={(event) => !inWindow && event.key === 'Escape' && !event.defaultPrevented && onClose()}
    >
      {bar}
      <div className="qn-title">
        {titleField}
        <button type="button" className={pinned ? 'qn-pin on' : 'qn-pin'} title={pinLabel} aria-label={pinLabel} aria-pressed={pinned} onClick={pin}>
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

/** A quick note as a page of a phone, or a new one with `path` null: back closes it, writing what is in it. */
export function PhoneQuickNote({ path, found, back, modified, bar, actions, onBack }: { path: string | null; found?: [number, number][]; back: string; modified?: number; bar: ReactNode; actions: QuickActions; onBack: () => void }) {
  return <QuickEditor path={path} {...(found && { found })} {...(modified !== undefined && { modified })} inWindow={false} bar={bar} actions={actions} onClose={onBack} phoneBack={back} />;
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
  /** A phone's page of them: its title and Sort are the page's, the cards in two columns, + makes one. */
  phone?: boolean;
}

/**
 * The Quick notes tab: its name and how many, search and Sort, Take a note…, then the cards. On a
 * phone, the search and the cards, two columns of them.
 */
export function QuickNotes({ notes, texts, order, sort, created, open, bar, actions, onOpen, phone = false }: Props) {
  const [query, setQuery] = useState('');
  const [taking, setTaking] = useState(false);
  const taker = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(phone ? 2 : 3);
  const heights = useRef(new Map<string, number>());
  const [, relayout] = useState(0);
  // A card dragged: the order as it was taken, and as the cards stand now.
  const [drag, setDrag] = useState<{ path: string; start: string[]; shown: string[] } | null>(null);
  // What a finger's drag reads as it goes, between its moves.
  const dragNow = useRef(drag);
  dragNow.current = drag;
  // The card dragged: where in it the pointer holds it, and the box of its section.
  const held = useRef<{ grip: { x: number; y: number }; section: HTMLElement } | null>(null);

  // As many columns of cards as the width takes; a phone's two.
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element || phone) return;
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

  const gap = phone ? PHONE_GAP : GAP;
  const heightOf = (path: string) => heights.current.get(path) ?? 120;
  /** How many columns a section of `count` cards takes. */
  const columnsFor = (count: number) => (phone ? columns : Math.min(columns, count));

  const startDrag = (path: string, grip: { x: number; y: number }, section: HTMLElement) => {
    const start = [...sorted.pinned, ...sorted.others];
    held.current = { grip, section };
    setDrag({ path, start, shown: start });
  };
  /**
   * Where the card dragged stands, from the pointer alone: of the places in its section it could
   * take, as the others would make way, the one nearest where the pointer holds it. So the cards
   * stand the same for the same pointer wherever it has been, and do not move under one held
   * still; a place only a little nearer than its own does not take it, so that on the line
   * between two it does not go back and forth.
   */
  const placeDrag = (x: number, y: number) => {
    const now = dragNow.current;
    const hold = held.current;
    if (!now || !hold) return;
    const pinnedOne = pinnedSet.has(now.path);
    const section = now.shown.filter((path) => pinnedSet.has(path) === pinnedOne);
    const rest = section.filter((path) => path !== now.path);
    const here = section.indexOf(now.path);
    const box = hold.section.getBoundingClientRect();
    const want = { x: x - box.left - hold.grip.x, y: y - box.top - hold.grip.y };
    const wide = phone ? (box.width - gap) / 2 : CARD;
    // Before each of the others and after the last: where it would stand, those before it placed as they are.
    const sums = Array.from({ length: columnsFor(section.length) }, () => 0);
    let best = here;
    let nearest = Infinity;
    let own = Infinity;
    for (let at = 0; at <= rest.length; at++) {
      const column = sums.indexOf(Math.min(...sums));
      const far = Math.hypot(column * (wide + gap) - want.x, sums[column]! - want.y);
      if (far < nearest) {
        nearest = far;
        best = at;
      }
      if (at === here) own = far;
      const next = rest[at];
      if (next !== undefined) sums[sums.indexOf(Math.min(...sums))]! += heightOf(next) + gap;
    }
    if (best === here || nearest > own - SETTLE) return;
    const placed = [...rest.slice(0, best), now.path, ...rest.slice(best)];
    const others = now.shown.filter((path) => pinnedSet.has(path) !== pinnedOne);
    const moved = { ...now, shown: pinnedOne ? [...placed, ...others] : [...others, ...placed] };
    dragNow.current = moved;
    setDrag(moved);
  };
  /** The order as the cards stand, kept once the card is let go. */
  const dropDrag = () => {
    const now = dragNow.current;
    if (now) actions.order(now.shown);
    setDrag(null);
  };
  const touch = { onMove: placeDrag, onDrop: dropDrag };
  const width = (count: number) => (phone ? undefined : { width: count * CARD + (count - 1) * GAP });

  /**
   * The cards in columns, each in the shortest so far: their order reads row by row. They are all
   * in one box, each placed where it stands, so that a card moving to another column stays the same
   * card: the one dragged, and the one it is let go on, are those the browser holds.
   */
  const masonry = (list: string[]) => {
    const sums = Array.from({ length: columnsFor(list.length) }, () => 0);
    const places = new Map<string, CSSProperties>();
    for (const path of list) {
      const at = sums.indexOf(Math.min(...sums));
      // A phone's two columns share its width.
      const across = phone ? { left: at === 0 ? 0 : `calc(50% + ${gap / 2}px)`, width: `calc(50% - ${gap / 2}px)` } : { left: at * (CARD + GAP), width: CARD };
      places.set(path, { ...across, top: sums[at] });
      sums[at]! += heightOf(path) + gap;
    }
    // While one is dragged they stay in the page as they were taken; only where they stand changes.
    const inPage = drag ? [...list].sort((a, b) => drag.start.indexOf(a) - drag.start.indexOf(b)) : list;
    return (
      <div className={drag ? 'qn-grid sorting' : 'qn-grid'} style={{ ...width(columns), height: Math.max(0, ...sums) - gap }}>
        {inPage.map((path) => (
          <QuickCard
            key={path}
            path={path}
            text={texts[path] ?? ''}
            spans={matches.get(path) ?? { title: [], body: [] }}
            pinned={pinnedSet.has(path)}
            away={path === open}
            dragging={drag?.path === path}
            draggable={sort === 'custom' && !query.trim()}
            place={places.get(path)!}
            actions={actions}
            onOpen={onOpen}
            onHeight={onHeight}
            onDragStart={startDrag}
            onDragEnd={() => setDrag(null)}
            {...(phone && { phone: touch })}
          />
        ))}
      </div>
    );
  };

  const sortItems = quickSortItems(sort, actions.sort);
  const sortLabel = sortItems.find((item) => item.checked)?.label;
  const shownCount = pinned.length + others.length;
  const section = (label: string) =>
    phone ? (
      <div className="mb-sec">{label}</div>
    ) : (
      <div className="qn-sec" style={width(columns)}>
        {label}
      </div>
    );
  const search = (
    <label className={phone ? 'mb-searchbar' : 'qn-search'}>
      <Icon name="search" />
      <input
        type="search"
        enterKeyHint="search"
        value={query}
        placeholder={phone ? t('phone.search') : t('quick.search')}
        aria-label={t('quick.search')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
      />
    </label>
  );

  return (
    <div className={phone ? 'qn phone' : 'qn'}>
      {phone ? (
        notes.length > 0 && search
      ) : (
        <div className="qn-top">
          <b>{t('quick.title')}</b>
          {notes.length > 0 && <span className="count">{query.trim() ? t('quick.found', { count: shownCount, total: notes.length }) : t('quick.count', { count: notes.length })}</span>}
          {search}
          <button type="button" className="qn-sort" title={t('quick.sort')} onClick={(event) => actions.menu(event, sortItems)}>
            <Icon name="sort" />
            {sortLabel}
          </button>
        </div>
      )}
      <div className="qn-scroll">
        {!phone && (
          <div ref={taker} className="qn-taking">
            {taking ? (
              <QuickEditor path={null} inWindow={false} bar={bar} actions={actions} onClose={() => setTaking(false)} />
            ) : (
              <button type="button" className="qn-take" onClick={() => setTaking(true)}>
                {t('quick.takeNote')}
              </button>
            )}
          </div>
        )}
        <div
          ref={grid}
          className="qn-cards"
          // A card dropped anywhere among them, on another or between two, stays where it shows.
          onDragOver={(event) => {
            if (!drag) return;
            event.preventDefault();
            placeDrag(event.clientX, event.clientY);
          }}
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
                  {section(t('quick.pinned'))}
                  {masonry(pinned)}
                  {others.length > 0 && section(t('quick.others'))}
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
