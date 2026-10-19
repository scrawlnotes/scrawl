import { addDays, type Holds } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';

/** A name as it is quoted in messages. */
export const quote = (name: string) => t('quote', { name });

/** What a folder holds, as `2 notes, 1 task list`; empty when it holds nothing. */
export function contentsText(holds: Holds): string {
  return [
    holds.notes > 0 && t('count.notes', { count: holds.notes }),
    holds.lists > 0 && t('count.lists', { count: holds.lists }),
    holds.boards > 0 && t('count.boards', { count: holds.boards }),
    holds.keys > 0 && t('count.keyFiles', { count: holds.keys }),
    holds.collections > 0 && t('count.collections', { count: holds.collections }),
    holds.folders > 0 && t('count.folders', { count: holds.folders }),
  ]
    .filter(Boolean)
    .join(t('list.separator'));
}

const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** A day that has passed, the way people say it: Today, Yesterday, else a date. */
export function pastDayLabel(day: string, today: string): string {
  if (day === today) return t('day.today');
  if (day === addDays(today, -1)) return t('day.yesterday');
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), sameYear ? SHORT : { ...SHORT, year: 'numeric' });
}

/** The time of day of a moment, on a 24-hour clock: `14:41`. */
export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** When a note was last written, as the status bar says it: `Modified today, 22:31`, `Modified Oct 14, 12:55`. */
export function writtenText(at: number, now = new Date()): string {
  const when = new Date(at);
  const time = clockTime(when.toISOString());
  if (when.toDateString() === now.toDateString()) return t('status.modifiedToday', { time });
  const sameYear = when.getFullYear() === now.getFullYear();
  return t('status.modified', { day: when.toLocaleDateString(locale(), sameYear ? SHORT : { ...SHORT, year: 'numeric' }), time });
}
