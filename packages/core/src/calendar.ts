import { timeOf } from './day';
import { addDays } from './tasks';

// The calendar's days and its boxes (design/calendar.md 3): a week from its Monday, and the things
// with a day and a time on a day's hours, from their start to their end, those at the same time
// side by side. What has a day alone is all day and is not laid out on the hours.

/** The Monday of the week `day` is in. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return addDays(day, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}

/** The seven days of the week `day` is in, from its Monday. */
export const weekDays = (day: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));

/** The minutes since midnight of a value's time, `14:30` is 870; null for a day alone. */
export function minutesOfDay(value: string): number | null {
  const time = timeOf(value);
  return time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null;
}

/** A thing with a day and a time to lay out: from `start` to `end`, or for so many `minutes` when it has no end. */
export interface Timed<T> {
  item: T;
  start: string;
  end?: string | null;
  minutes?: number | null;
}

/** A box on a day's hours: from and to, in minutes of the day, cut at the day's ends; its column among those at the same time, of so many. */
export interface DayBox<T> {
  item: T;
  from: number;
  to: number;
  col: number;
  cols: number;
}

/** How long a box with no end and no length is, in minutes. */
export const DEFAULT_LENGTH = 30;
/** The shortest a box is drawn, in minutes, so that it can be seen and caught. */
const SHORTEST = 15;

/**
 * The boxes of a day: each thing with a time that is on it, from its start, or the day's start when
 * it began before, to its end, or the day's end when it goes on after; those that overlap side by
 * side, each in the first column free when it starts, the columns shared by all that overlap.
 */
export function layoutDay<T>(things: readonly Timed<T>[], day: string): DayBox<T>[] {
  const boxes: DayBox<T>[] = [];
  for (const thing of things) {
    const startMinutes = minutesOfDay(thing.start);
    if (startMinutes === null) continue;
    const startDay = thing.start.slice(0, 10);
    const length = thing.minutes && thing.minutes > 0 ? thing.minutes : DEFAULT_LENGTH;
    const endValue = thing.end && minutesOfDay(thing.end) !== null ? thing.end : null;
    const endDay = endValue ? endValue.slice(0, 10) : startDay;
    const endMinutes = endValue ? minutesOfDay(endValue)! : startMinutes + length;
    // Not on this day: begun after it, or ended before it (an end at midnight is the day before's).
    if (startDay > day || endDay < day) continue;
    const from = startDay < day ? 0 : startMinutes;
    const to = endDay > day ? 1440 : Math.min(1440, endValue ? endMinutes : startMinutes + length);
    if (startDay < day && endDay === day && to === 0) continue;
    boxes.push({ item: thing.item, from, to: Math.max(to, from + SHORTEST), col: 0, cols: 1 });
  }
  boxes.sort((a, b) => a.from - b.from || b.to - a.to);
  // Those that overlap, directly or through another, share their columns.
  let group: DayBox<T>[] = [];
  let groupEnd = -1;
  const ends: number[] = [];
  const close = () => {
    for (const box of group) box.cols = ends.length;
    group = [];
    ends.length = 0;
  };
  for (const box of boxes) {
    if (box.from >= groupEnd) {
      close();
      groupEnd = -1;
    }
    let col = ends.findIndex((end) => end <= box.from);
    if (col < 0) col = ends.length;
    ends[col] = box.to;
    box.col = col;
    group.push(box);
    groupEnd = Math.max(groupEnd, box.to);
  }
  close();
  return boxes;
}

/** A day and minutes of it as a value with its time, `2026-10-22T14:30`; minutes past the day go on to the next. */
export function atMinutes(day: string, minutes: number): string {
  const whole = Math.round(minutes);
  const days = Math.floor(whole / 1440);
  const m = whole - days * 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${addDays(day, days)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Minutes between two values with their times; null when either has none. */
export function minutesBetween(start: string, end: string): number | null {
  const [a, b] = [minutesOfDay(start), minutesOfDay(end)];
  if (a === null || b === null) return null;
  const days = Math.round((Date.UTC(...ymd(end)) - Date.UTC(...ymd(start))) / 86_400_000);
  return days * 1440 + b - a;
}

const ymd = (value: string): [number, number, number] => {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number) as [number, number, number];
  return [y, m - 1, d];
};
