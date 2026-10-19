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
