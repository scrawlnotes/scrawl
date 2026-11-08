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

/** An event of the "Scrawl" calendar, with its base; none for one someone made there by hand. */
export interface SyncedEvent {
  /** The calendar's own id of the event. */
  eventId: string;
  base: EventBase | null;
  /** The day it is on now, as the calendar has it. */
  day: string;
}

export interface CalendarPlan {
  create: WantedEvent[];
  update: { eventId: string; wanted: WantedEvent }[];
  remove: SyncedEvent[];
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

/**
 * What to do so the calendar has `wanted`, given its `events` in the range and the work this
 * device saw there before (`seen`). Scrawl's change goes over the calendar's. Work whose event
 * is gone though this device saw it was removed in the calendar: it is not made again (bringing
 * that back is slice 3's). Events Scrawl did not write, and those before the range, are left.
 */
export function planCalendar(wanted: readonly WantedEvent[], events: readonly SyncedEvent[], seen: ReadonlySet<string>, today: string): CalendarPlan {
  const { from } = syncRange(today);
  const byWork = new Map<string, SyncedEvent>();
  const plan: CalendarPlan = { create: [], update: [], remove: [] };
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
      if (!seen.has(each.id)) plan.create.push(each);
    } else if (!same(event.base!, each)) plan.update.push({ eventId: event.eventId, wanted: each });
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

/** The ids this device has seen in the calendar after a turn: those there, and those just made. */
export function seenAfter(plan: CalendarPlan, events: readonly SyncedEvent[], seen: ReadonlySet<string>): Set<string> {
  const out = new Set(seen);
  for (const event of events) if (event.base) out.add(event.base.id);
  for (const each of plan.create) out.add(each.id);
  for (const event of plan.remove) if (event.base) out.delete(event.base.id);
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
