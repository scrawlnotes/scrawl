import { type CalendarSettings, type Collection, type Field, isComputed, matchesConditions, type Record, type Schema, type View } from './collection';
import { isDay, isDateTime, timeOf } from './day';
import { localPath, spaceOf } from './spaces';
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
  // One that repeats has no day of its own: its days are worked out for Today and Upcoming.
  if (!settings || settings.repeat) return [];
  const colorField = settings.color ? (collection.schema.fields.find((f) => f.key === settings.color) ?? null) : null;
  const out: CalendarRecord[] = [];
  for (const record of collection.records) {
    const start = dateValue(record.values[settings.start]);
    if (!start || !matchesConditions(record, collection.schema, view.conditions, today)) continue;
    const end = settings.end ? dateValue(record.values[settings.end]) : null;
    const length = settings.duration ? record.values[settings.duration] : null;
    const choice = choiceOf(record, colorField);
    out.push({
      record,
      start,
      // An end before its start is no end.
      end: end && end > start ? end : null,
      minutes: typeof length === 'number' && length > 0 ? length : null,
      choice,
      colorField,
    });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** What a record is colored by: a choice by itself; a linked record or a person by its name. */
function choiceOf(record: Record, colorField: Field | null): string | null {
  const held = colorField ? record.values[colorField.key] : null;
  const first = Array.isArray(held) ? held[0] : held;
  const choice = typeof first === 'string' ? first : first && typeof first === 'object' && 'name' in first ? first.name : null;
  return typeof choice === 'string' && choice ? choice : null;
}

/** A record that a calendar brings to Today and Upcoming: of which collection, and by which view. */
export interface DueRecord extends CalendarRecord {
  collection: string;
  view: View;
  schema: Schema;
  /** One of the days a repeating record comes on (design/gym.md 4.3), not closed yet, or the day of one whose calendar has a button, gone by: that day. */
  day?: string;
  /** That day went by with nothing closing it: it stays in Overdue. */
  late?: boolean;
}

/** The last day a record is on: its end's, else its start's. */
export const lastDayOf = (item: Pick<CalendarRecord, 'start' | 'end'>) => (item.end ?? item.start).slice(0, 10);

/**
 * What the calendars that show in Today and Upcoming bring there, `collections` with what is
 * worked out among their values: their records from today on, and those that began before and go
 * on today; one whose calendar has a button stays after its day, late, till the button moves it on
 * (a check-up not done); a record two calendars show comes once, by the first. By its day, those of a day with
 * no time first.
 */
export function dueRecords(collections: readonly Collection[], today: string, { all = collections, until = addDays(today, 62) }: DueOptions = {}): DueRecord[] {
  const out: DueRecord[] = [];
  const seen = new Set<string>();
  for (const collection of collections) {
    for (const view of collection.schema.views ?? []) {
      if (view.kind !== 'calendar' || !view.calendar?.upcoming) continue;
      if (view.calendar.repeat) {
        for (const item of repeatDays(collection, view, today, until, all)) {
          // One for Today only brings its days up to today, not those to come (a habit).
          if (view.calendar.upcoming === 'today' && item.day! > today) continue;
          const key = `${collection.dir}/${item.record.id}/${item.day}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(item);
        }
        continue;
      }
      // One for Today only comes on its day, not before it.
      const todayOnly = view.calendar.upcoming === 'today';
      const keeps = !!view.calendar.button;
      for (const item of calendarRecords(collection, view, today)) {
        const key = `${collection.dir}/${item.record.id}`;
        const gone = lastDayOf(item) < today;
        if (seen.has(key) || (gone && !keeps) || (todayOnly && item.start.slice(0, 10) > today)) continue;
        seen.add(key);
        out.push({ ...item, collection: collection.dir, view, schema: collection.schema, ...(gone && { day: item.start.slice(0, 10), late: true }) });
      }
    }
  }
  return out.sort((a, b) => compareOnDay(a.start, b.start));
}

export interface DueOptions {
  /** Every collection of the space, for the one that closes a repeating record's days. */
  all?: readonly Collection[];
  /** The last day a repeating record's days are worked out to. */
  until?: string;
}

/** The weekday a choice of a repeat's days stands for, 0 Sunday to 6 Saturday: by its name's first letters, else by its place among seven, Monday first. */
function weekdayOf(option: string, index: number, count: number): number | null {
  const named = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(option.trim().slice(0, 3).toLowerCase());
  if (named >= 0) return named;
  return count === 7 && index >= 0 ? (index + 1) % 7 : null;
}

const weekdayOfDay = (day: string) => {
  const [y, m, d] = ymd(day);
  return new Date(y, m, d).getDay();
};

/** The collection that closes a repeating record's days: at its path in the record's space. */
function closingCollection(dir: string, path: string, all: readonly Collection[]): Collection | undefined {
  const space = spaceOf(dir);
  return all.find((c) => spaceOf(c.dir) === space && localPath(c.dir) === localPath(path));
}

/**
 * A day a repeating record comes on, as its calendar shows it (design/gym.md 4.3): `open` from
 * today on, `late` gone by with nothing closing it, `done` closed by a record, `skipped` closed
 * by the other button's (its `skip` values, a workout not gone to); a closed day says by which.
 */
export interface RepeatDay extends DueRecord {
  day: string;
  state: 'open' | 'late' | 'done' | 'skipped';
  closedBy?: { collection: string; id: string };
}

/**
 * The days a repeating record comes on, closed or not, from `start` to `until`: each record that
 * matches the view's conditions, on each weekday it holds, from its own day (else today); with
 * `anyDay`, from `start`, a day before it began ticked as well (a habit's strip, design/more-apps.md
 * 4.9). What a repeating calendar shows on its days.
 */
export function repeatCalendar(collection: Collection, view: View, today: string, start: string, until: string, all: readonly Collection[], anyDay = false): RepeatDay[] {
  const repeat = view.calendar?.repeat;
  if (!repeat) return [];
  const { schema } = collection;
  const options = schema.fields.find((f) => f.key === repeat.days)?.options ?? [];
  const colorField = view.calendar!.color ? (schema.fields.find((f) => f.key === view.calendar!.color) ?? null) : null;
  // The days closed, by the record they close and the day, with the record that closes each.
  const closing = closingCollection(collection.dir, repeat.closedBy.collection, all);
  const closed = new Map<string, Record>();
  for (const r of closing?.records ?? []) {
    const day = dateValue(r.values[repeat.closedBy.day])?.slice(0, 10);
    const held = r.values[repeat.closedBy.link];
    for (const link of Array.isArray(held) ? held : [held]) if (day && link && typeof link === 'object' && 'id' in link && !closed.has(`${link.id}/${day}`)) closed.set(`${link.id}/${day}`, r);
  }
  // With no Start its one button closes the day done: nothing it writes is a day skipped.
  const skippedBy = (r: Record) => repeat.start !== false && !!repeat.skip && Object.entries(repeat.skip.set).every(([key, value]) => JSON.stringify(r.values[key] ?? null) === JSON.stringify(value));
  const out: RepeatDay[] = [];
  for (const record of collection.records) {
    if (!matchesConditions(record, schema, view.conditions, today)) continue;
    const held = record.values[repeat.days];
    const weekdays = new Set((Array.isArray(held) ? held : []).flatMap((v) => (typeof v === 'string' ? [weekdayOf(v, options.indexOf(v), options.length)] : [])).filter((w): w is number => w !== null));
    if (weekdays.size === 0) continue;
    const own = anyDay ? start : ((repeat.from ? dateValue(record.values[repeat.from])?.slice(0, 10) : null) ?? today);
    // A record with an end, a diet's last day, comes on none after it (design/meal-plans.md 4).
    const ends = repeat.until ? dateValue(record.values[repeat.until])?.slice(0, 10) : undefined;
    const last = ends && ends < until ? ends : until;
    const choice = choiceOf(record, colorField);
    for (let day = own > start ? own : start; day <= last; day = addDays(day, 1)) {
      if (!weekdays.has(weekdayOfDay(day))) continue;
      const by = closed.get(`${record.id}/${day}`);
      const state = by ? (skippedBy(by) ? 'skipped' : 'done') : day < today ? 'late' : 'open';
      out.push({
        record, start: day, end: null, minutes: null, choice, colorField, collection: collection.dir, view, schema, day, state,
        ...(state === 'late' && { late: true }),
        ...(by && closing && { closedBy: { collection: closing.dir, id: by.id } }),
      });
    }
  }
  return out;
}

/** The Monday of a day's week. */
export const weekOf = (day: string) => addDays(day, -((weekdayOfDay(day) + 6) % 7));

/**
 * The days a calendar that repeats brings to Today and Upcoming (design/gym.md 4.3): its days not
 * closed, from each record's own day to `until`; those before today are late, however many, unless
 * its repeat keeps none late (a habit's day missed is gone). With `perWeek`, a week that has as many
 * days closed as the record's number brings none of its other days (design/more-apps.md 4.9).
 */
export function repeatDays(collection: Collection, view: View, today: string, until: string, all: readonly Collection[]): DueRecord[] {
  const repeat = view.calendar?.repeat;
  const days = repeatCalendar(collection, view, today, repeat?.late === false || repeat?.perWeek ? weekOf(today) : '0000-01-01', until, all);
  const enough = (record: Record) => {
    const n = repeat?.perWeek ? record.values[repeat.perWeek] : null;
    return typeof n === 'number' && n > 0 ? n : null;
  };
  const closedIn = new Map<string, number>();
  for (const each of days) if (each.state === 'done' || each.state === 'skipped') closedIn.set(`${each.record.id}/${weekOf(each.day)}`, (closedIn.get(`${each.record.id}/${weekOf(each.day)}`) ?? 0) + 1);
  return days
    .filter((each) => each.state === 'open' || (each.state === 'late' && repeat?.late !== false))
    .filter((each) => {
      const n = enough(each.record);
      return n === null || (closedIn.get(`${each.record.id}/${weekOf(each.day)}`) ?? 0) < n;
    })
    .map(({ state: _state, closedBy: _closedBy, ...due }) => due);
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
