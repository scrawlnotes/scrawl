import { durationText, durationTyped, minutesOf, timeOf } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { MonthGrid, useMonth } from './MonthGrid';
import { Sheet, SheetClose } from './sheets';
import { dueLabel } from './Tasks';

// A day with its time, a time of day and a duration, as they are typed and picked: on a computer a
// day's box with the time's beside it, which can be cleared to leave the day alone; on a phone a
// month, then the time on a switch, picked on a wheel (design/calendar.md 2).

/** A day, or a day with its time, as the screen says it: Today · 14:30, Thu, Oct 22. */
export function dateLabel(value: string, today: string): string {
  const time = timeOf(value);
  const day = dueLabel(value.slice(0, 10), today);
  return time ? `${day} · ${time}` : day;
}

/** A day and the time written together, or the day alone. */
const joined = (day: string, time: string | null) => (day ? (time ? `${day}T${time}` : day) : null);

/**
 * A day's box, and where the field has a time, the time's beside it, cleared with × to leave the
 * day alone; with no time, Add time. The time waits for a day.
 */
export function DateTimeBox({ id, label, value, autoFocus, onChange, onKeyDown }: {
  id?: string;
  label: string;
  value: string | null;
  autoFocus?: boolean;
  onChange: (value: string | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const day = value ? value.slice(0, 10) : '';
  const time = value ? timeOf(value) : null;
  const [adding, setAdding] = useState(false);
  const timeBox = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (adding) timeBox.current?.focus();
  }, [adding]);
  return (
    <span className="dtbox" onKeyDown={onKeyDown}>
      <input id={id} type="date" autoFocus={autoFocus} aria-label={label} value={day} onChange={(event) => onChange(joined(event.target.value, time))} />
      {time !== null || adding ? (
        <span className="dt-time">
          <input
            ref={timeBox}
            type="time"
            aria-label={t('collection.timeOf', { field: label })}
            disabled={!day}
            value={time ?? ''}
            onChange={(event) => onChange(joined(day, event.target.value || null))}
            onBlur={() => setAdding(false)}
          />
          <button type="button" className="x" title={t('collection.noTime')} aria-label={t('collection.noTime')} onClick={() => (setAdding(false), onChange(joined(day, null)))}>
            ×
          </button>
        </span>
      ) : (
        <button type="button" className="dt-add" disabled={!day} onClick={() => setAdding(true)}>
          <Icon name="clock" />
          {t('collection.addTime')}
        </button>
      )}
    </span>
  );
}

/** Minutes typed as 90, 1:30 or 1 h 30 min; how long it is shown beside them. */
export function DurationBox({ id, label, value, autoFocus, onChange, onEnter }: {
  id?: string;
  label: string;
  value: number | null;
  autoFocus?: boolean;
  onChange: (value: number | null) => void;
  onEnter?: () => void;
}) {
  // What is being typed, while it is; the minutes otherwise, or the seconds, 90 s, how long beside them when it says more.
  const [typed, setTyped] = useState<string | null>(null);
  const plain = value === null ? '' : durationTyped(value);
  return (
    <span className="durbox">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={label}
        value={typed ?? plain}
        onFocus={() => setTyped(plain)}
        onBlur={() => setTyped(null)}
        onChange={(event) => {
          setTyped(event.target.value);
          const minutes = minutesOf(event.target.value);
          if (!event.target.value.trim()) onChange(null);
          else if (minutes !== null) onChange(minutes);
        }}
        onKeyDown={(event) => onEnter && event.key === 'Enter' && (event.preventDefault(), onEnter())}
      />
      {value !== null && durationText(value) !== plain && <span className="unit">{durationText(value)}</span>}
    </span>
  );
}

const ROW = 34;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** The minutes a wheel offers, five by five, and the one written when it is not one of them. */
const minutesFor = (m: number) => [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), m])].sort((a, b) => a - b);
const two = (n: number) => String(n).padStart(2, '0');

/** One turning column of a wheel: the middle row is what is picked. */
function WheelColumn({ items, value, label, onPick }: { items: number[]; value: number; label: string; onPick: (value: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const at = items.indexOf(value);
    if (box.current && at >= 0 && Math.round(box.current.scrollTop / ROW) !== at) box.current.scrollTop = at * ROW;
  }, [items, value]);
  return (
    <div
      ref={box}
      className="tw-col"
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={() => {
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => {
          const at = Math.max(0, Math.min(items.length - 1, Math.round((box.current?.scrollTop ?? 0) / ROW)));
          if (items[at] !== value) onPick(items[at]!);
        }, 90);
      }}
      onKeyDown={(event) => {
        const at = items.indexOf(value);
        const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (!by) return;
        event.preventDefault();
        onPick(items[Math.max(0, Math.min(items.length - 1, at + by))]!);
      }}
    >
      {items.map((item) => (
        <button key={item} type="button" role="option" aria-selected={item === value} className={item === value ? 'on' : undefined} onClick={() => onPick(item)}>
          {two(item)}
        </button>
      ))}
    </div>
  );
}

/** A time picked on a wheel of hours and one of minutes, as a phone does. */
export function TimeWheel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [h, m] = [Number(value.slice(0, 2)), Number(value.slice(3, 5))];
  return (
    <div className="tw">
      <WheelColumn items={HOURS} value={h} label={t('collection.hours')} onPick={(next) => onChange(`${two(next)}:${two(m)}`)} />
      <span className="sep">:</span>
      <WheelColumn items={minutesFor(m)} value={m} label={t('collection.minutes')} onPick={(next) => onChange(`${two(h)}:${two(next)}`)} />
    </div>
  );
}

/**
 * A day with its time on a phone: the month, then Time on a switch, its wheel under it when on;
 * off, the day is all day. What is picked is written as it is picked.
 */
export function DateTimeSheet({ label, title, value, today, onChange, onClose }: {
  label: string;
  title: string;
  value: string | null;
  today: string;
  onChange: (value: string | null) => void;
  onClose: () => void;
}) {
  const day = value ? value.slice(0, 10) : null;
  const time = value ? timeOf(value) : null;
  const [month, setMonth] = useMonth(day ?? today);
  return (
    <Sheet label={label} className="mb-create mb-date" onClose={onClose}>
      <div className="mb-sh">
        <b>{label}</b>
        <small>{title}</small>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-cal">
        <MonthGrid month={month} onMonth={setMonth} today={today} current={day} onPick={(picked) => onChange(joined(picked, time))} />
      </div>
      <button type="button" className="mb-tmrow" aria-pressed={time !== null} disabled={!day} onClick={() => onChange(joined(day ?? today, time === null ? '09:00' : null))}>
        <Icon name="clock" />
        <b>{t('collection.time')}</b>
        {time !== null ? <span className="tm">{time}</span> : <span className="all">{t('collection.allDayLong')}</span>}
        <span className={time !== null ? 'mb-sw on' : 'mb-sw'} />
      </button>
      {time !== null && day && <TimeWheel value={time} onChange={(next) => onChange(joined(day, next))} />}
      {day && (
        <button type="button" className="mb-clear" onClick={() => (onChange(null), onClose())}>
          {t('phone.clearDate')}
        </button>
      )}
    </Sheet>
  );
}

/** A time of day alone on a phone: its wheel, and No time to clear it. */
export function TimeSheet({ label, title, value, onChange, onClose }: {
  label: string;
  title: string;
  value: string | null;
  onChange: (value: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={label} className="mb-create mb-date" onClose={onClose}>
      <div className="mb-sh">
        <b>{label}</b>
        <small>{title}</small>
        <SheetClose onClose={onClose} />
      </div>
      <TimeWheel value={value ?? '09:00'} onChange={onChange} />
      {value && (
        <button type="button" className="mb-clear" onClick={() => (onChange(null), onClose())}>
          {t('collection.noTime')}
        </button>
      )}
    </Sheet>
  );
}
