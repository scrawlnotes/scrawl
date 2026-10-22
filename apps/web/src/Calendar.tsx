import { atMinutes, type DayBox, layoutDay, type Timed } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  /** An empty half hour clicked: what to add there. */
  onSlot?: (day: string, minutes: number) => void;
  /** The grid, for a window opened beside a day. */
  gridRef?: RefObject<HTMLDivElement | null>;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const columns = useRef<HTMLDivElement>(null);
  const now = useNow();
  const [drag, setDrag] = useState<Dragging | null>(null);
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
                onClick={(event) => {
                  if (!onSlot || event.target !== event.currentTarget) return;
                  const top = event.currentTarget.getBoundingClientRect().top;
                  onSlot(day, Math.floor((((event.clientY - top) / HOUR) * 60) / 30) * 30);
                }}
              >
                {(laid.get(day) ?? []).map((laidBox) => boxOf(laidBox, day))}
                {dragged && drag!.day === day && (
                  <div className="tg-box lift" style={boxStyle(drag!.from, drag!.to, 0, 1, dragged.color)}>
                    <b>{dragged.title}</b>
                    <small>{`${clock(drag!.from)} – ${clock(drag!.to)}`}</small>
                    <span className="tg-tip">{`${new Date(`${drag!.day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })} · ${clock(drag!.from)} – ${clock(drag!.to)}`}</span>
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

/** A day's hours on a phone, scrolled to the morning: the boxes of what has a time, a line at the time it is today; swiped to the next day or the one before. */
export function PhoneHours({ day, today, boxes, onOpen, onSwipe }: { day: string; today: string; boxes: CalendarBox[]; onOpen: (box: CalendarBox) => void; onSwipe: (by: number) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const now = useNow();
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = OPENS_AT * PHONE_HOUR - 8;
  }, [day]);
  const laid = layoutDay(boxes.map((box) => ({ item: box, start: box.start, end: box.end, minutes: box.minutes })), day);
  return (
    <div
      ref={scroll}
      className="mb-hours"
      onTouchStart={(event) => (touch.current = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY })}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
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
          {laid.map(({ item, from, to, col, cols }) => (
            <button
              key={item.key}
              type="button"
              className={((to - from) / 60) * PHONE_HOUR < 40 ? 'tg-box short' : 'tg-box'}
              style={{ top: (from / 60) * PHONE_HOUR, height: Math.max(18, ((to - from) / 60) * PHONE_HOUR - 3), left: `calc(${(col * 100) / cols}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, '--cc': item.color } as CSSProperties}
              onClick={() => onOpen(item)}
            >
              <b>{item.title}</b>
              <small>{`${clock(from)} – ${clock(to)}`}</small>
            </button>
          ))}
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
