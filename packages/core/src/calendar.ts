import { type CalendarSettings, type Collection, type Field, isComputed, matchesConditions, type Record, type Schema, type View } from './collection';
import { isDay, isDateTime, timeOf } from './day';
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

/** A record on a calendar: its day, or its day and time; its end or its length in minutes; the choice it is colored by. */
export interface CalendarRecord {
  record: Record;
  start: string;
  end: string | null;
  minutes: number | null;
  /** The value of the view's color field, and that field. */
  choice: string | null;
  colorField: Field | null;
}

/** A value of a date field as a day, or a day and a time; null for anything else. */
const dateValue = (value: unknown): string | null => (typeof value === 'string' && (isDay(value) || isDateTime(value)) ? value : null);

/**
 * The records of a Calendar view, `collection` with what is worked out among its values: those
 * that match its conditions and have a day to start on, each with its end or its length.
 */
export function calendarRecords(collection: Collection, view: View, today: string): CalendarRecord[] {
  const settings = view.calendar;
  if (!settings) return [];
  const colorField = settings.color ? (collection.schema.fields.find((f) => f.key === settings.color) ?? null) : null;
  const out: CalendarRecord[] = [];
  for (const record of collection.records) {
    const start = dateValue(record.values[settings.start]);
    if (!start || !matchesConditions(record, collection.schema, view.conditions, today)) continue;
    const end = settings.end ? dateValue(record.values[settings.end]) : null;
    const length = settings.duration ? record.values[settings.duration] : null;
    // A choice by itself; a linked record or a person by its name.
    const held = colorField ? record.values[colorField.key] : null;
    const first = Array.isArray(held) ? held[0] : held;
    const choice = typeof first === 'string' ? first : first && typeof first === 'object' && 'name' in first ? first.name : null;
    out.push({
      record,
      start,
      // An end before its start is no end.
      end: end && end > start ? end : null,
      minutes: typeof length === 'number' && length > 0 ? length : null,
      choice: typeof choice === 'string' && choice ? choice : null,
      colorField,
    });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** A record that a calendar brings to Today and Upcoming: of which collection, and by which view. */
export interface DueRecord extends CalendarRecord {
  collection: string;
  view: View;
  schema: Schema;
}

/** The last day a record is on: its end's, else its start's. */
export const lastDayOf = (item: Pick<CalendarRecord, 'start' | 'end'>) => (item.end ?? item.start).slice(0, 10);

/**
 * What the calendars that show in Today and Upcoming bring there, `collections` with what is
 * worked out among their values: their records from today on, and those that began before and go
 * on today; a record two calendars show comes once, by the first. By its day, those of a day with
 * no time first.
 */
export function dueRecords(collections: readonly Collection[], today: string): DueRecord[] {
  const out: DueRecord[] = [];
  const seen = new Set<string>();
  for (const collection of collections) {
    for (const view of collection.schema.views ?? []) {
      if (view.kind !== 'calendar' || !view.calendar?.upcoming) continue;
      for (const item of calendarRecords(collection, view, today)) {
        const key = `${collection.dir}/${item.record.id}`;
        if (seen.has(key) || lastDayOf(item) < today) continue;
        seen.add(key);
        out.push({ ...item, collection: collection.dir, view, schema: collection.schema });
      }
    }
  }
  return out.sort((a, b) => compareOnDay(a.start, b.start));
}

/** Two starts in a day's order: by the day, then one with no time first, then by the time. */
export function compareOnDay(a: string, b: string): number {
  const [dayA, dayB] = [a.slice(0, 10), b.slice(0, 10)];
  if (dayA !== dayB) return dayA < dayB ? -1 : 1;
  const [timeA, timeB] = [timeOf(a), timeOf(b)];
  if (!timeA || !timeB) return timeA ? 1 : timeB ? -1 : 0;
  return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
}

/** The day a due record is on in Today: its own, or today when it began before and goes on. */
export const dayInToday = (item: Pick<CalendarRecord, 'start' | 'end'>, today: string) => (item.start.slice(0, 10) < today ? today : item.start.slice(0, 10));

/** A field of the schema that is written, not worked out; null for one that is not there or is worked out. */
const written = (schema: Schema, key: string | undefined) => {
  const field = key ? schema.fields.find((f) => f.key === key) : undefined;
  return field && !isComputed(field.type) ? field : null;
};

/**
 * What a record's values become when it is moved to start at `start`, a day or a day and a time:
 * its start, and its end, when it is written, moved as much; a time given to a field that holds a
 * day alone is left out. Null when its start is worked out and cannot be written.
 */
export function movedValues(schema: Schema, settings: CalendarSettings, item: Pick<CalendarRecord, 'start' | 'end'>, start: string): Record['values'] | null {
  const field = written(schema, settings.start);
  if (!field) return null;
  const to = field.time ? start : start.slice(0, 10);
  const values: Record['values'] = { [field.key]: to };
  const end = written(schema, settings.end);
  if (end && item.end) {
    const shift = (minutesOfDay(to) ?? 0) - (minutesOfDay(item.start) ?? 0) + dayCount(item.start, to) * 1440;
    const moved = minutesOfDay(item.end) === null ? addDays(item.end, Math.round(shift / 1440)) : atMinutes(item.end.slice(0, 10), minutesOfDay(item.end)! + shift);
    values[end.key] = end.time ? moved : moved.slice(0, 10);
  }
  return values;
}

/** Days from one value's day to another's. */
const dayCount = (from: string, to: string) => Math.round((Date.UTC(...ymd(to)) - Date.UTC(...ymd(from))) / 86_400_000);

/**
 * What a record's values become when its foot is dragged to `end`, a day and a time: its length
 * in minutes, or its end, whichever the calendar goes by and is written. Null when neither can be.
 */
export function stretchedValues(schema: Schema, settings: CalendarSettings, item: Pick<CalendarRecord, 'start'>, end: string): Record['values'] | null {
  const minutes = minutesBetween(item.start, end);
  if (minutes === null || minutes <= 0) return null;
  const duration = written(schema, settings.duration);
  if (duration) return { [duration.key]: minutes };
  const field = written(schema, settings.end);
  if (field?.time) return { [field.key]: end };
  return null;
}

/** What a record added on a calendar starts with: its start, and its length or its end when the calendar has one written. */
export function startingValues(schema: Schema, settings: CalendarSettings, start: string, end: string | null): Record['values'] {
  const field = written(schema, settings.start);
  if (!field) return {};
  const values: Record['values'] = { [field.key]: field.time ? start : start.slice(0, 10) };
  if (end && minutesOfDay(start) !== null) Object.assign(values, stretchedValues(schema, settings, { start: values[field.key] as string }, end) ?? {});
  return values;
}
