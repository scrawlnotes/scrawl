import { addDays } from '@scrawlnotes/core';

/** A number with its unit, plural when it is not one: `1 note`, `3 notes`. */
export const count = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;

/** A name as it is quoted in messages. */
export const quote = (name: string) => `“${name}”`;

/** What a folder holds, as `2 notes, 1 task list`; empty when it holds nothing. */
export function contentsText(holds: { notes: number; lists: number; folders: number }): string {
  const parts: [number, string][] = [
    [holds.notes, 'note'],
    [holds.lists, 'task list'],
    [holds.folders, 'folder'],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, unit]) => count(n, unit))
    .join(', ');
}

const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** A day that has passed, the way people say it: Today, Yesterday, else a date. */
export function pastDayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', sameYear ? SHORT : { ...SHORT, year: 'numeric' });
}

/** The time of day of a moment, on a 24-hour clock: `14:41`. */
export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
