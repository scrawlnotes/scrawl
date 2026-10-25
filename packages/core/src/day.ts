// A day as the files write it, `YYYY-MM-DD`, checked against the calendar: what is written by
// hand, pasted, imported or sent by an agent can look like a day and not be one (2026-02-30).
// And the day and the clock in a person's time zone, for a server whose own is not theirs.

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `date` as a clock in `timeZone` (`Europe/Istanbul`) shows it, as a date in this device's own
 * time: for the day it is and for what is named by the moment, as a note never named. `date`
 * itself without a time zone, or with one that is none.
 */
export function wallClock(date: Date, timeZone?: string): Date {
  if (!timeZone) return date;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  } catch {
    return date;
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'), date.getMilliseconds());
}

/** The day it is at `date` in `timeZone`, as `YYYY-MM-DD`; in this device's own without one. */
export function dayIn(date: Date, timeZone?: string): string {
  const clock = wallClock(date, timeZone);
  return `${clock.getFullYear()}-${pad(clock.getMonth() + 1)}-${pad(clock.getDate())}`;
}

/** Whether `zone` is a time zone by its name, as `Europe/Istanbul`. */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone.trim() || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const leap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Whether `text` is a day on the calendar as `YYYY-MM-DD`: 2024-02-29 is, 2025-02-29, 2026-02-30 and 2026-13-01 are not. */
export function isDay(text: string): boolean {
  const m = DAY.exec(text);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const days = [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day <= days;
}

// A time of day is written `HH:mm`, and a day with its time `YYYY-MM-DDTHH:mm`: the clock on the
// wall, with no time zone, so that 14:30 is 14:30 for everyone who reads it.

const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:Z|[+-]\d{2}:?\d{2})?$/;

/** A time of day as `HH:mm`, from `9:05`, `09:05` or `09:05:30`; null when it is not one. */
export function clockOf(text: string): string | null {
  const m = CLOCK.exec(text.trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

/** Whether `text` is a time of day as the files write it, `HH:mm`. */
export const isClock = (text: string) => /^\d{2}:\d{2}$/.test(text) && clockOf(text) === text;

/** A day with its time as `YYYY-MM-DDTHH:mm`, from `2026-10-22T14:30`, `2026-10-22 14:30` or with seconds; null when it is not one. */
export function dateTimeOf(text: string): string | null {
  const m = DATE_TIME.exec(text.trim());
  if (!m || !isDay(m[1]!)) return null;
  const clock = clockOf(m[2]!);
  return clock ? `${m[1]}T${clock}` : null;
}

/** Whether `text` is a day with its time as the files write it, `YYYY-MM-DDTHH:mm`. */
export const isDateTime = (text: string) => dateTimeOf(text) === text;

/** A date's value as the files write it: a day, or with `time` a day with its time; null when it is neither. */
export function dateOf(text: string, time = false): string | null {
  const t = text.trim();
  if (isDay(t)) return t;
  const moment = dateTimeOf(t);
  if (!moment) return null;
  return time ? moment : moment.slice(0, 10);
}

/** The time of a date's value, `14:30`; null for a day alone. */
export const timeOf = (value: string): string | null => (value.length > 10 && value[10] === 'T' ? value.slice(11, 16) : null);

/** Minutes typed as a duration: `90`, `1.5`, `1:30`, `1 h 30 min`, `2h`, `90 s`, `1 min 30 s`; null when it is not one. Kept to the second. */
export function minutesOf(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const toSecond = (minutes: number) => Math.round(minutes * 60) / 60;
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return toSecond(Number(t.replace(',', '.')));
  const clock = /^(\d+):(\d{2})$/.exec(t);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const words = /^(?:(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?|s)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?|s)?)?)?$/.exec(t);
  if (words && (words[1] || words[2] || words[3])) return toSecond(Number((words[1] ?? '0').replace(',', '.')) * 60 + Number(words[2] ?? 0) + Number(words[3] ?? 0) / 60);
  return null;
}
