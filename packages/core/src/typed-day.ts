// A day written in words, as Todoist reads it: in a task's name as it is typed ("Dentist fri"), and
// in a date picker's box ("dec 3"). English only, as the app is; days only, as tasks have no time.

import { isDay } from './day';
import { addDays } from './tasks';

/** A day found in a text: the day it means and where its words are, `from` to `to`. */
export interface TypedDay {
  day: string;
  from: number;
  to: number;
}

const MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';
const NUMBER = '\\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten';
const WORDS = ['a', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const pad = (n: number) => String(n).padStart(2, '0');
const weekdayOf = (day: string) => new Date(`${day}T12:00:00`).getDay();
const monthOf = (word: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(word.slice(0, 3).toLowerCase()) + 1;
const weekdayIndex = (word: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.slice(0, 3).toLowerCase());
const count = (word: string) => (/^\d/.test(word) ? Number(word) : Math.max(1, WORDS.indexOf(word.toLowerCase())));

/** The Monday after this week. */
const nextMonday = (today: string) => addDays(today, (8 - weekdayOf(today)) % 7 || 7);

/** `months` on from `day`, on the same day of the month, or the month's last when it has fewer. */
function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const first = new Date(y, m - 1 + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** A month and a day, in the year given, or else the next time it comes: this year's once it went by is next year's, Feb 29 the next leap year's. */
function onCalendar(month: number, date: number, year: string | undefined, today: string): string | null {
  const from = year ? Number(year) : Number(today.slice(0, 4));
  for (let y = from; y <= from + (year ? 0 : 4); y++) {
    const day = `${y}-${pad(month)}-${pad(date)}`;
    if (isDay(day) && (year || day >= today)) return day;
  }
  return null;
}

type Read = (match: RegExpExecArray, today: string) => string | null;

// Each way of writing a day; "on" before a weekday or a date goes with it, as "Call Ana on fri".
const RULES: [string, Read][] = [
  ['today', (_, today) => today],
  ['tomorrow', (_, today) => addDays(today, 1)],
  ['next week', (_, today) => nextMonday(today)],
  ['(?:this )?weekend', (_, today) => {
    const weekday = weekdayOf(today);
    return weekday === 0 ? today : addDays(today, 6 - weekday);
  }],
  ['next month', (_, today) => `${addMonths(today, 1).slice(0, 8)}01`],
  [`in (${NUMBER}) (days?|weeks?|months?)`, (m, today) => {
    const n = count(m[1]!);
    const unit = m[2]!.toLowerCase();
    return unit.startsWith('day') ? addDays(today, n) : unit.startsWith('week') ? addDays(today, 7 * n) : addMonths(today, n);
  }],
  [`next (${WEEKDAY})`, (m, today) => addDays(nextMonday(today), (weekdayIndex(m[1]!) + 6) % 7)],
  [`(?:on )?(${WEEKDAY})`, (m, today) => addDays(today, (weekdayIndex(m[1]!) - weekdayOf(today) + 7) % 7 || 7)],
  [`(?:on )?(${MONTH}) (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?`, (m, today) => onCalendar(monthOf(m[1]!), Number(m[2]), m[3], today)],
  [`(?:on )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTH})(?:,? (\\d{4}))?`, (m, today) => onCalendar(monthOf(m[2]!), Number(m[1]), m[3], today)],
  ['(\\d{4}-\\d{2}-\\d{2})', (m) => (isDay(m[1]!) ? m[1]! : null)],
];

// A rule's words stand alone: not inside a word ("Sunday" in "Sundays", "fri" in "fried"), nor before an apostrophe ("today's").
const PATTERNS = RULES.map(([words, read]) => [new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}'’])`, 'giu'), read] as const);

/** The first day written in `text`, the longest where two start at the same place; null when there is none. */
export function dayInText(text: string, today: string): TypedDay | null {
  let best: TypedDay | null = null;
  for (const [pattern, read] of PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const day = read(match, today);
      if (!day) continue;
      const found = { day, from: match.index, to: match.index + match[0].length };
      if (!best || found.from < best.from || (found.from === best.from && found.to > best.to)) best = found;
      break;
    }
  }
  return best;
}

/** The day `text` is, all of it: what a date box takes. */
export function dayOfWords(text: string, today: string): string | null {
  const typed = text.trim();
  const found = dayInText(typed, today);
  return found && found.from === 0 && found.to === typed.length ? found.day : null;
}

/** `text` without the words of the day found in it, as a task's name is added. */
export const withoutDay = (text: string, found: TypedDay): string => `${text.slice(0, found.from)} ${text.slice(found.to)}`.replace(/\s+/g, ' ').trim();
