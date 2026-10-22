import { atMinutes, type DayBox, type Field, layoutDay, monthDays, type Timed } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hueStyle } from './choices';

// A day or a week of the calendar, after the Calendar mockups (design/calendar.md 3): the days'
// names, the all-day row, then the hours, scrolled to 07:00, today's column tinted and a line at
// the time it is. A thing with a day and a time is a box from its start to its end, in its
// source's color, those at the same time side by side. A box dragged takes the day and the time it
// is left at, its foot dragged its end; what that writes is the caller's, with its Undo. On a
// phone a day alone, its hours taller, swiped to the next day.

/** How tall an hour is, in pixels. */
export const HOUR = 44;
/** The hour the grid opens at. */
const OPENS_AT = 7;
/** What a drag moves by, in minutes. */
const STEP = 15;

/** A thing with a day and a time on the hours. */
export interface CalendarBox {
  key: string;
  title: string;
  /** What it is of and whose, said on a box wide enough: "Site visits · Kaan". */
  sub?: string;
  start: string;
  end?: string | null;
  /** How long it is with no end, in minutes. */
  minutes?: number | null;
  /** Its source's color, as CSS. */
  color: string;
  /** Moved and stretched by dragging; one that cannot be is only opened. */
  movable?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const snap = (minutes: number) => Math.round(minutes / STEP) * STEP;

/** The minutes of the day it is now, kept up each minute. */
function useNow(): number {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(read()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** A box being moved or stretched: where it is shown now, and whether it has gone anywhere. */
interface Dragging {
  key: string;
  mode: 'move' | 'resize';
  day: string;
  from: number;
  to: number;
  moved: boolean;
}

/**
 * The hours of one day or of a week. `allDay` gives each day's cell of the all-day row, its
 * `data-day` and what it does when clicked or dropped on its own; `boxes` are laid out on the hours.
 */
export function TimeGrid({ days, today, allDay, boxes, onOpen, onMove, onResize, onSlot, gridRef }: {
  days: string[];
  today: string;
  allDay: (day: string) => ReactNode;
  boxes: CalendarBox[];
  onOpen: (box: CalendarBox) => void;
  /** A box left at another day or time: its new start, its length kept. */
  onMove?: (box: CalendarBox, start: string) => void;
  /** A box's foot left lower or higher: its new end. */
  onResize?: (box: CalendarBox, end: string) => void;
  /** Empty hours dragged over, from and to in minutes of the day, or a half hour clicked: what to add there. */
  onSlot?: (day: string, from: number, to: number) => void;
  /** The grid, for a window opened beside a day. */
  gridRef?: RefObject<HTMLDivElement | null>;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const columns = useRef<HTMLDivElement>(null);
  const now = useNow();
  const [drag, setDrag] = useState<Dragging | null>(null);
  const [pick, setPick] = useState<{ day: string; from: number; to: number } | null>(null);
  const one = days.length === 1;
  const timed: Timed<CalendarBox>[] = boxes.map((box) => ({ item: box, start: box.start, end: box.end, minutes: box.minutes }));
  const laid = new Map(days.map((day) => [day, layoutDay(timed, day)]));

  // The hours open at the morning.
  useLayoutEffect(() => {
    // A little above the hour, so that its time shows whole.
    if (scroll.current) scroll.current.scrollTop = OPENS_AT * HOUR - 8;
  }, []);

  const begin = (event: ReactPointerEvent, laidBox: DayBox<CalendarBox>, day: string, mode: Dragging['mode']) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = laidBox.item;
    const startX = event.clientX;
    const startY = event.clientY;
    const length = laidBox.to - laidBox.from;
    const can = box.movable !== false && (mode === 'move' ? !!onMove : !!onResize);
    let current: Dragging = { key: box.key, mode, day, from: laidBox.from, to: laidBox.to, moved: false };
    const move = (e: PointerEvent) => {
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;
      if (!current.moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
      if (!can) return;
      const delta = snap((dy / HOUR) * 60);
      if (mode === 'resize') {
        current = { ...current, moved: true, to: Math.min(1440, Math.max(laidBox.from + STEP, laidBox.to + delta)) };
      } else {
        const area = columns.current?.getBoundingClientRect();
        const index = area ? Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - area.left) / area.width) * days.length))) : days.indexOf(day);
        const from = Math.max(0, Math.min(1440 - length, laidBox.from + delta));
        current = { ...current, moved: true, day: days[index]!, from, to: from + length };
      }
      setDrag(current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!current.moved) return onOpen(box);
      if (mode === 'resize') onResize?.(box, atMinutes(current.day, current.to));
      else if (current.day !== day || current.from !== laidBox.from) onMove?.(box, atMinutes(current.day, current.from));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Empty hours dragged over, by quarter hours, or a half hour clicked.
  const beginPick = (event: ReactPointerEvent, day: string) => {
    event.preventDefault();
    const top = event.currentTarget.getBoundingClientRect().top;
    const at = (y: number) => Math.max(0, Math.min(1440, ((y - top) / HOUR) * 60));
    const from = at(event.clientY);
    const startY = event.clientY;
    let moved = false;
    const range = (y: number) => {
      const [a, b] = [Math.min(from, at(y)), Math.max(from, at(y))];
      const start = Math.floor(a / STEP) * STEP;
      return { day, from: start, to: Math.max(Math.ceil(b / STEP) * STEP, start + STEP) };
    };
    const move = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientY - startY) < 4) return;
      moved = true;
      setPick(range(e.clientY));
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPick(null);
      if (!moved) {
        const half = Math.min(1410, Math.floor(from / 30) * 30);
        return onSlot?.(day, half, half + 30);
      }
      const picked = range(e.clientY);
      onSlot?.(day, picked.from, picked.to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const boxStyle = (from: number, to: number, col: number, cols: number, color: string): CSSProperties =>
    ({
      top: (from / 60) * HOUR,
      height: Math.max(14, ((to - from) / 60) * HOUR - 2),
      left: `calc(${(col * 100) / cols}% + 2px)`,
      width: `calc(${100 / cols}% - 4px)`,
      '--cc': color,
    }) as CSSProperties;

  const boxOf = (laidBox: DayBox<CalendarBox>, day: string) => {
    const box = laidBox.item;
    const short = ((laidBox.to - laidBox.from) / 60) * HOUR < 34;
    const lifted = drag?.key === box.key && drag.moved;
    return (
      <div
        key={box.key}
        className={['tg-box', short && 'short', lifted && 'ghost', box.movable !== false && onMove && 'movable'].filter(Boolean).join(' ')}
        style={boxStyle(laidBox.from, laidBox.to, laidBox.col, laidBox.cols, box.color)}
        title={`${box.title} · ${clock(laidBox.from)} – ${clock(laidBox.to)}`}
        role="button"
        tabIndex={0}
        onPointerDown={(event) => begin(event, laidBox, day, 'move')}
        onKeyDown={(event) => event.key === 'Enter' && onOpen(box)}
      >
        <b>{box.title}</b>
        <small>
          {clock(laidBox.from)}
          {!short && ` – ${clock(laidBox.to)}`}
        </small>
        {one && !short && box.sub && <small>{box.sub}</small>}
        {box.movable !== false && onResize && <span className="tg-foot" onPointerDown={(event) => begin(event, laidBox, day, 'resize')} />}
      </div>
    );
  };

  const dragged = drag?.moved ? boxes.find((b) => b.key === drag.key) : undefined;
  return (
    <div ref={gridRef} className={one ? 'tg one' : 'tg'}>
      {!one && (
        <div className="tg-row tg-heads" aria-hidden="true">
          <span className="g" />
          {days.map((day) => (
            <div key={day} className={['tg-dh', day === today && 'today', day < today && 'past'].filter(Boolean).join(' ')}>
              <small>{new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' })}</small>
              <b>{Number(day.slice(8))}</b>
            </div>
          ))}
        </div>
      )}
      <div className="tg-row tg-all">
        <span className="g">{t('collection.allDay')}</span>
        {days.map((day) => allDay(day))}
      </div>
      <div ref={scroll} className="tg-scroll">
        <div className="tg-grid" style={{ height: 24 * HOUR }}>
          <div className="tg-hours" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} style={{ top: (i + 1) * HOUR }}>
                {clock((i + 1) * 60)}
              </span>
            ))}
          </div>
          <div ref={columns} className="tg-cols" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => (
              <div
                key={day}
                className={['tg-col', day === today && 'today'].filter(Boolean).join(' ')}
                data-day={day}
                onPointerDown={(event) => onSlot && event.button === 0 && event.target === event.currentTarget && beginPick(event, day)}
              >
                {(laid.get(day) ?? []).map((laidBox) => boxOf(laidBox, day))}
                {dragged && drag!.day === day && (
                  <div className="tg-box lift" style={boxStyle(drag!.from, drag!.to, 0, 1, dragged.color)}>
                    <b>{dragged.title}</b>
                    <small>{`${clock(drag!.from)} – ${clock(drag!.to)}`}</small>
                    <span className="tg-tip">{`${new Date(`${drag!.day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })} · ${clock(drag!.from)} – ${clock(drag!.to)}`}</span>
                  </div>
                )}
                {pick?.day === day && (
                  <div className="tg-pick" style={{ top: (pick.from / 60) * HOUR, height: ((pick.to - pick.from) / 60) * HOUR }}>
                    <span>{`${clock(pick.from)} – ${clock(pick.to)}`}</span>
                  </div>
                )}
                {day === today && (
                  <div className="tg-now" style={{ top: (now / 60) * HOUR }}>
                    <i />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


/** How tall an hour is on a phone, in pixels. */
const PHONE_HOUR = 52;

/** How long a box is held before it moves, in milliseconds. */
const HOLD = 450;

/**
 * A day's hours on a phone, scrolled to the morning: the boxes of what has a time, and a line at
 * the time it is today; swiped to the next day or the one before. A box held and dragged takes
 * another time, or the day of the week's strip it is left on (`[data-day]` in `.mb-wstrip`),
 * which `onTarget` says while it is over one.
 */
export function PhoneHours({ day, today, boxes, onOpen, onSwipe, onMove, onTarget }: {
  day: string;
  today: string;
  boxes: CalendarBox[];
  onOpen: (box: CalendarBox) => void;
  onSwipe: (by: number) => void;
  onMove?: (box: CalendarBox, start: string) => void;
  onTarget?: (day: string | null) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [held, setHeld] = useState<{ key: string; day: string; from: number; to: number } | null>(null);
  // A box let go after it was held is not opened by the click that follows.
  const wasHeld = useRef(false);
  const now = useNow();
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = OPENS_AT * PHONE_HOUR - 8;
  }, [day]);
  const laid = layoutDay(boxes.map((box) => ({ item: box, start: box.start, end: box.end, minutes: box.minutes })), day);

  const hold = (event: ReactPointerEvent, box: DayBox<CalendarBox>) => {
    if (!onMove || box.item.movable === false) return;
    const [startX, startY] = [event.clientX, event.clientY];
    const length = box.to - box.from;
    let current: { key: string; day: string; from: number; to: number } | null = null;
    const timer = window.setTimeout(() => {
      current = { key: box.item.key, day, from: box.from, to: box.to };
      wasHeld.current = true;
      setHeld(current);
      navigator.vibrate?.(10);
    }, HOLD);
    // Held, the page does not scroll under the finger.
    const block = (e: TouchEvent) => current && e.cancelable && e.preventDefault();
    const move = (e: PointerEvent) => {
      if (!current) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) done();
        return;
      }
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.mb-wstrip [data-day]');
      // Over the strip it takes that day at the time it had; on the hours, another time of this day.
      const from = over ? current.from : Math.max(0, Math.min(1440 - length, box.from + snap(((e.clientY - startY) / PHONE_HOUR) * 60)));
      current = { ...current, day: over?.dataset.day ?? day, from, to: from + length };
      onTarget?.(over?.dataset.day ?? null);
      setHeld(current);
    };
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', done);
      window.removeEventListener('touchmove', block);
      setHeld(null);
      onTarget?.(null);
    };
    const up = () => {
      const was = current;
      done();
      if (was && (was.day !== day || was.from !== box.from)) onMove(box.item, atMinutes(was.day, was.from));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', done);
    window.addEventListener('touchmove', block, { passive: false });
  };

  const style = (from: number, to: number, col: number, cols: number, color: string) =>
    ({ top: (from / 60) * PHONE_HOUR, height: Math.max(18, ((to - from) / 60) * PHONE_HOUR - 3), left: `calc(${(col * 100) / cols}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, '--cc': color }) as CSSProperties;
  const lifted = held ? boxes.find((box) => box.key === held.key) : undefined;
  return (
    <div
      ref={scroll}
      className="mb-hours"
      onTouchStart={(event) => (touch.current = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY })}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start || held) return;
        const dx = event.changedTouches[0]!.clientX - start.x;
        const dy = event.changedTouches[0]!.clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 40) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      <div className="mb-hgrid" style={{ height: 24 * PHONE_HOUR }}>
        <div className="mb-hlabels" aria-hidden="true">
          {Array.from({ length: 23 }, (_, i) => (
            <span key={i} style={{ top: (i + 1) * PHONE_HOUR }}>
              {clock((i + 1) * 60)}
            </span>
          ))}
        </div>
        <div className="mb-hcol">
          {laid.map((box) => (
            <button
              key={box.item.key}
              type="button"
              className={[((box.to - box.from) / 60) * PHONE_HOUR < 40 ? 'tg-box short' : 'tg-box', held?.key === box.item.key && 'ghost'].filter(Boolean).join(' ')}
              style={style(box.from, box.to, box.col, box.cols, box.item.color)}
              onPointerDown={(event) => hold(event, box)}
              onContextMenu={(event) => onMove && event.preventDefault()}
              onClick={() => {
                if (wasHeld.current) return void (wasHeld.current = false);
                onOpen(box.item);
              }}
            >
              <b>{box.item.title}</b>
              <small>{`${clock(box.from)} – ${clock(box.to)}`}</small>
            </button>
          ))}
          {held && lifted && (
            <>
              <div className="tg-box lift" style={style(held.from, held.to, 0, 1, lifted.color)}>
                <b>{lifted.title}</b>
                <small>{`${clock(held.from)} – ${clock(held.to)}`}</small>
              </div>
              <span className="tg-tip mb-tip" style={{ top: (held.from / 60) * PHONE_HOUR - 30 }}>
                {`${new Date(`${held.day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })} · ${clock(held.from)} – ${clock(held.to)}`}
              </span>
            </>
          )}
          {day === today && (
            <div className="tg-now" style={{ top: (now / 60) * PHONE_HOUR }}>
              <i />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The color of what has none of its own: a record of a calendar colored by no field. */
export const PLAIN_COLOR = 'hsl(214 62% 62%)';

/** A record's color on a calendar: its choice's, as its chip has it, else the plain one. */
export function choiceColor(field: Field | null, choice: string | null): string {
  if (!field || !choice) return PLAIN_COLOR;
  const hue = hueStyle(field.colors?.[choice], choice) as { '--lh': number; '--ls': string };
  return `hsl(${hue['--lh']} ${hue['--ls']} 62%)`;
}

/** A thing on a day of a month: a task's or a card's priority and key, or a record's color and time. */
export interface MonthChip {
  key: string;
  title: string;
  /** A record's time, before its title. */
  time?: string | null;
  /** A record's color. */
  color?: string;
  priority?: number;
  /** A card's key, and its square tick. */
  cardKey?: string;
  late?: boolean;
  /** Dragged to another day; one that cannot be is only opened. */
  movable?: boolean;
  onOpen: () => void;
}

/** How tall a day's number and each line under it are, and the day's padding, in pixels. */
const NUMBER_HEIGHT = 17;
const LINE_HEIGHT = 21;
const CELL_PADDING = 8;

/** A chip of a month's day, or of the day's window. */
function MonthLine({ chip, lifted, onDragStart, onDragEnd }: { chip: MonthChip; lifted: boolean; onDragStart?: () => void; onDragEnd?: () => void }) {
  const style = chip.color ? ({ '--cc': chip.color } as CSSProperties) : chip.priority !== undefined && chip.priority < 4 ? ({ '--pc': `var(--sl-p${chip.priority})` } as CSSProperties) : undefined;
  return (
    <button
      type="button"
      draggable={!!onDragStart && chip.movable !== false}
      className={['cal-t', chip.color && 'rec', chip.time && 'timed', chip.late && 'late', lifted && 'ghost'].filter(Boolean).join(' ')}
      style={style}
      title={chip.title}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', chip.title);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.stopPropagation();
        chip.onOpen();
      }}
    >
      {chip.time ? <em>{chip.time}</em> : <i className={chip.cardKey || chip.color ? 'sq' : undefined} />}
      {chip.cardKey && <span className="key">{chip.cardKey}</span>}
      <span>{chip.title}</span>
    </button>
  );
}

/**
 * A month of a collection's or a board's calendar, after the Calendar mockups: each day's chips,
 * as many as fit and +N more, which opens the day's window with all of them; a chip dragged to
 * another day is left there. A day's number and its free part are the caller's to use.
 */
export function MonthCalendar({ month, today, chipsOf, onNumber, onDay, onMove }: {
  month: string;
  today: string;
  chipsOf: (day: string) => MonthChip[];
  /** A day's number clicked. */
  onNumber?: (day: string) => void;
  /** A day's free part clicked. */
  onDay?: (day: string) => void;
  onMove?: (chip: MonthChip, from: string, to: string) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(3);
  const [opened, setOpened] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ chip: MonthChip; from: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const days = monthDays(month);

  // As many lines as a day has room for, however tall the window is.
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () => {
      const cell = element.querySelector<HTMLElement>('.cd');
      if (cell) setFit(Math.max(1, Math.floor((cell.clientHeight - CELL_PADDING - NUMBER_HEIGHT) / LINE_HEIGHT)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setOpened(null), [month]);

  const end = () => {
    setDragging(null);
    setDropOn(null);
  };
  const line = (chip: MonthChip, day: string) => (
    <MonthLine
      key={chip.key}
      chip={chip}
      lifted={dragging?.chip.key === chip.key}
      onDragStart={onMove && chip.movable !== false ? () => setDragging({ chip, from: day }) : undefined}
      onDragEnd={end}
    />
  );
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
  return (
    <div className="up-cal">
      <div className="wd" aria-hidden="true">
        {weekdays.map((name, i) => (
          <span key={i}>{name}</span>
        ))}
      </div>
      <div ref={grid} className="grid">
        {days.map((day) => {
          const chips = chipsOf(day);
          // A day with more than fits shows one line fewer, and how many more there are in its place.
          const shown = chips.length > fit ? chips.slice(0, fit - 1) : chips;
          const more = chips.length - shown.length;
          const className = ['cd', day.slice(0, 7) !== month && 'out', chips.length > 0 && 'busy', day < today && 'past', day === today && 'today', opened === day && 'on', dropOn === day && 'drop-on']
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={day}
              className={className}
              data-day={day}
              onClick={() => onDay?.(day)}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (dropOn !== day) setDropOn(day);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropOn((was) => (was === day ? null : was));
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging && dragging.from !== day) onMove?.(dragging.chip, dragging.from, day);
                end();
              }}
            >
              <button
                type="button"
                className="n"
                onClick={(event) => {
                  event.stopPropagation();
                  if (onNumber) onNumber(day);
                  else onDay?.(day);
                }}
              >
                {Number(day.slice(8))}
              </button>
              {shown.map((chip) => line(chip, day))}
              {more > 0 && (
                <button
                  type="button"
                  className="cal-more"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpened(day);
                  }}
                >
                  {t('tasks.moreOnDay', { count: more })}
                </button>
              )}
              {opened === day && (
                <div className="cal-pop" onClick={(event) => event.stopPropagation()}>
                  <div className="cal-pop-h">
                    <b>{new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' })}</b>
                    <button type="button" aria-label={t('dialog.close')} onClick={() => setOpened(null)}>
                      ×
                    </button>
                  </div>
                  {chips.map((chip) => line(chip, day))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
