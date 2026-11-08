import { addDays } from './tasks';

// Scrawl's work in an outside calendar (design/outlook-calendar.md 2.2, 4.3, 12): what should be
// there, and what to do to make it so. Each event carries what Scrawl last wrote into it, its base,
// so every device sees the same base and no file keeps it. Outlook and Google only read, make,
// change and remove; the rules are here.

/** What Scrawl writes for one piece of work: all day when it has no time. */
export interface WantedEvent {
  /** The work's own id, the same on every device: `task:<list>#<id>`, `card:<board>#<id>`, … */
  id: string;
  title: string;
  /** The day it is on; with a time, its start and end, `YYYY-MM-DDTHH:MM`, in the device's clock. */
  day: string;
  start?: string;
  end?: string;
  done: boolean;
  /** Where it is, for the event's note: "Scrawl · Work › Roadmap". */
  where: string;
}

/** What an event says Scrawl last wrote into it. */
export interface EventBase {
  v: 1;
  id: string;
  title: string;
  day: string;
  start?: string;
  end?: string;
  done: boolean;
}

/** An event of the "Scrawl" calendar as the calendar has it now, with its base; none for one someone made there by hand. */
export interface SyncedEvent {
  /** The calendar's own id of the event. */
  eventId: string;
  base: EventBase | null;
  title: string;
  day: string;
  /** With a time, its start and end in the device's clock. */
  start?: string;
  end?: string;
}

/** A change made in the calendar to a piece of work, to be written in Scrawl; `start: null` takes its time off. */
export interface BackChange {
  id: string;
  title?: string;
  day?: string;
  start?: string | null;
  end?: string | null;
}

export interface CalendarPlan {
  create: WantedEvent[];
  update: { eventId: string; wanted: WantedEvent }[];
  remove: SyncedEvent[];
  /** Changes made in the calendar to work that did not change in Scrawl. */
  back: BackChange[];
  /** Work whose event this device saw and is not in the range now: removed, or moved out of it; asked of the calendar. */
  missing: { id: string; eventId: string }[];
}

/** The days the calendar is kept to: from yesterday, as far as Upcoming looks. */
export const syncRange = (today: string) => ({ from: addDays(today, -1), to: addDays(today, 62) });

/** The event's title: a finished one keeps its place with ✓ before it. */
export const eventTitle = (wanted: Pick<WantedEvent, 'title' | 'done'>) => (wanted.done ? `✓ ${wanted.title}` : wanted.title);

export const baseOf = (wanted: WantedEvent): EventBase => ({
  v: 1,
  id: wanted.id,
  title: wanted.title,
  day: wanted.day,
  ...(wanted.start && { start: wanted.start }),
  ...(wanted.end && { end: wanted.end }),
  done: wanted.done,
});

const same = (base: EventBase, wanted: WantedEvent) =>
  base.title === wanted.title && base.day === wanted.day && (base.start ?? '') === (wanted.start ?? '') && (base.end ?? '') === (wanted.end ?? '') && base.done === wanted.done;

/** A repeating record's day (its id ends in `@day`): one changed in the calendar does not come back (2.3). */
const oneDayOf = (id: string) => /#[^#]*@\d{4}-\d{2}-\d{2}$/.test(id);

/** The title as written, without the ✓ Scrawl puts before a finished one. */
const titleIn = (event: Pick<SyncedEvent, 'title'>) => event.title.replace(/^✓\s*/, '').trim();

/**
 * What the calendar changed of `base` (2.3): its title, its day, its time. A task or a card
 * (no time in Scrawl) takes only the day; null when nothing that comes back changed.
 */
export function changeOf(base: EventBase, event: Omit<SyncedEvent, 'eventId' | 'base'>): BackChange | null {
  const out: BackChange = { id: base.id };
  const title = titleIn(event);
  if (title && title !== base.title) out.title = title;
  if (event.day !== base.day) out.day = event.day;
  const timed = !!base.start;
  if (timed && !event.start) out.start = null;
  else if (timed && event.start && (event.start !== base.start || (event.end ?? '') !== (base.end ?? ''))) {
    out.start = event.start;
    out.end = event.end ?? null;
  }
  return Object.keys(out).length > 1 ? out : null;
}

/**
 * What to do so the calendar has `wanted`, given its `events` in the range and the work this
 * device saw there before (`seen`, the work's id to its event's). Scrawl's change goes over the
 * calendar's; one made only in the calendar comes back (`back`), but for a repeating record's
 * day, whose event is written over again. Seen work whose event is not in the range is asked
 * after (`missing`). Events Scrawl did not write, and those before the range, are left.
 */
export function planCalendar(wanted: readonly WantedEvent[], events: readonly SyncedEvent[], seen: ReadonlyMap<string, string>, today: string): CalendarPlan {
  const { from } = syncRange(today);
  const byWork = new Map<string, SyncedEvent>();
  const plan: CalendarPlan = { create: [], update: [], remove: [], back: [], missing: [] };
  for (const event of events) {
    if (!event.base) continue;
    // Two events of one piece of work (a retry made twice): the second goes.
    if (byWork.has(event.base.id)) plan.remove.push(event);
    else byWork.set(event.base.id, event);
  }
  const want = new Set(wanted.map((each) => each.id));
  for (const each of wanted) {
    const event = byWork.get(each.id);
    if (!event) {
      const was = seen.get(each.id);
      if (was) plan.missing.push({ id: each.id, eventId: was });
      else plan.create.push(each);
    } else if (!same(event.base!, each)) plan.update.push({ eventId: event.eventId, wanted: each });
    else {
      const change = changeOf(event.base!, event);
      if (change && oneDayOf(each.id)) plan.update.push({ eventId: event.eventId, wanted: each });
      else if (change) plan.back.push(change);
    }
  }
  for (const [id, event] of byWork) if (!want.has(id) && event.day >= from) plan.remove.push(event);
  return plan;
}

/** What an account does for the sync: Outlook's and Google's do the same with their own requests. */
export interface CalendarWriter {
  /** Makes the "Scrawl" calendar; its id. */
  makeCalendar(): Promise<string>;
  /** Whether the calendar is still there; one removed in the account is made again. */
  hasCalendar(calendar: string): Promise<boolean>;
  removeCalendar(calendar: string): Promise<void>;
  /** The calendar's events from `from` to `to`, both days included, with their bases. */
  synced(calendar: string, from: string, to: string): Promise<SyncedEvent[]>;
  /** One event wherever it is now; null for one removed. */
  find(calendar: string, eventId: string): Promise<SyncedEvent | null>;
  create(calendar: string, wanted: WantedEvent): Promise<void>;
  update(calendar: string, eventId: string, wanted: WantedEvent): Promise<void>;
  remove(calendar: string, eventId: string): Promise<void>;
}

/** A base as an event keeps it; null for one that is not Scrawl's. */
export function readBase(text: unknown): EventBase | null {
  if (typeof text !== 'string') return null;
  try {
    const base = JSON.parse(text) as Partial<EventBase>;
    return base.v === 1 && typeof base.id === 'string' && typeof base.title === 'string' && typeof base.day === 'string' ? (base as EventBase) : null;
  } catch {
    return null;
  }
}

/** A timed event's end: its own, or half an hour after its start. */
export function endOf(wanted: Pick<WantedEvent, 'start' | 'end'>): string {
  if (wanted.end) return wanted.end;
  const at = new Date(`${wanted.start!}:00`);
  at.setMinutes(at.getMinutes() + 30);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * The work this device has seen in the calendar after a turn, by its id to its event's: what is
 * there, less what was removed, either side. An event just made is learned at the next turn.
 */
export function seenAfter(plan: CalendarPlan, events: readonly SyncedEvent[], seen: ReadonlyMap<string, string>, gone: readonly string[] = []): Map<string, string> {
  const out = new Map(seen);
  for (const event of events) if (event.base) out.set(event.base.id, event.eventId);
  for (const event of plan.remove) if (event.base) out.delete(event.base.id);
  for (const id of gone) out.delete(id);
  return out;
}

/** A fixed word from a piece of work's id, for an event made twice to be one: lower letters a–v and digits, as Google's ids are. */
export function eventKey(id: string): string {
  // FNV-1a, four rounds with different seeds: 128 bits, enough to keep ids apart.
  let out = '';
  for (let round = 0; round < 4; round++) {
    let hash = 0x811c9dc5 ^ round;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    out += (hash >>> 0).toString(32).padStart(7, '0');
  }
  return `scr${out}`;
}
