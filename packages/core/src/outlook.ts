import type { VaultFs } from './fs';
import { mergeFields } from './sync/merge-records';
import { GRAPH, Graph, GraphError, type GraphOptions } from './sync/onedrive';
import { addDays } from './tasks';

// Outlook's calendars in Scrawl (design/outlook-calendar.md): the account's calendars, their events
// for some days as Outlook has them, and which calendars the person shows. Nothing of Outlook is
// kept; what is kept is the person's choice, in the personal space, for every device.

/** One of the account's calendars; `own` is false for one someone else shared. */
export interface OutlookCalendar {
  id: string;
  name: string;
  /** `#rrggbb`, as Outlook draws it. */
  color: string;
  own: boolean;
}

/** An event in this device's clock. */
export interface OutlookEvent {
  id: string;
  calendar: string;
  /** Its subject; empty when it has none. */
  title: string;
  /** The day it starts, `YYYY-MM-DD`. */
  day: string;
  /** The last day it is on, `day` itself for most. */
  lastDay: string;
  /** With a time: its start and its end, `YYYY-MM-DDTHH:MM`. None for one all day. */
  start?: string;
  end?: string;
  /** Where Outlook opens it. */
  link: string;
}

export interface OutlookAccount {
  name: string;
  email: string;
}

/** Outlook's own colors, for a calendar without a color of its own. */
const COLORS: Record<string, string> = {
  lightBlue: '#4f8ff7',
  lightGreen: '#3fb27f',
  lightOrange: '#e0a35a',
  lightGray: '#9aa0a6',
  lightYellow: '#e0c23a',
  lightTeal: '#2fb5b0',
  lightPink: '#e57399',
  lightBrown: '#b98a5e',
  lightRed: '#e25c5c',
  maxColor: '#4f8ff7',
  auto: '#4f8ff7',
};

interface GraphCalendar {
  id: string;
  name?: string;
  hexColor?: string;
  color?: string;
  owner?: { name?: string; address?: string };
}

interface GraphEvent {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  webLink?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A moment Graph gives in UTC (`2026-11-09T06:30:00.0000000`), in the clock of `timeZone`, or of this device without one. */
export function clockFromUtc(utc: string, timeZone?: string): string {
  const moment = new Date(`${utc.slice(0, 19)}Z`);
  const at = timeZone
    ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(moment)
    : null;
  if (at) {
    const part = (type: Intl.DateTimeFormatPartTypes) => at.find((p) => p.type === type)?.value ?? '00';
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  }
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}T${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}

/** An event as Graph gives it, in UTC, as Scrawl shows it; null for one cancelled or without its times. */
export function eventFrom(raw: GraphEvent, calendar: string, timeZone?: string): OutlookEvent | null {
  const from = raw.start?.dateTime;
  const to = raw.end?.dateTime;
  if (raw.isCancelled || !from || !to) return null;
  const base = { id: raw.id, calendar, title: raw.subject?.trim() ?? '', link: raw.webLink ?? '' };
  if (raw.isAllDay) {
    // An all-day event's days are the calendar's, not moments: its end is the day after its last.
    const day = from.slice(0, 10);
    const after = to.slice(0, 10);
    return { ...base, day, lastDay: after > day ? addDays(after, -1) : day };
  }
  const start = clockFromUtc(from, timeZone);
  const end = clockFromUtc(to, timeZone);
  // One that ends at midnight ends on the day before.
  const lastDay = end.endsWith('T00:00') && end.slice(0, 10) > start.slice(0, 10) ? addDays(end.slice(0, 10), -1) : end.slice(0, 10);
  return { ...base, day: start.slice(0, 10), lastDay, start, end };
}

/**
 * The events on `day`: those all day, or going on from another day, first, then by when they
 * start. On a day after its first, one with a time is shown as all day.
 */
export function eventsOn(events: readonly OutlookEvent[], day: string): OutlookEvent[] {
  const on = events.filter((event) => event.day <= day && event.lastDay >= day);
  const timed = (event: OutlookEvent) => (event.start && event.day === day ? event.start : '');
  return on.sort((a, b) => timed(a).localeCompare(timed(b)) || a.title.localeCompare(b.title));
}

/** Whether an event shows with its time on `day`, rather than as all day. */
export const timedOn = (event: OutlookEvent, day: string): boolean => !!event.start && event.day === day;

/** Graph's address of a day's start in this device's clock, as UTC. */
const startOf = (day: string) => new Date(`${day}T00:00:00`).toISOString();

/** Reading the account's calendars and their events; Outlook's answers are not kept. */
export class OutlookReader {
  private readonly graph: Graph;

  constructor(options: GraphOptions) {
    this.graph = new Graph(options);
  }

  async me(): Promise<OutlookAccount> {
    const me = await this.graph.json<{ displayName?: string; mail?: string | null; userPrincipalName?: string }>(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`);
    const email = me.mail || me.userPrincipalName || '';
    return { name: me.displayName || email, email };
  }

  /** The account's calendars; one is its own when its owner is the account. */
  async calendars(account: OutlookAccount): Promise<OutlookCalendar[]> {
    const out: OutlookCalendar[] = [];
    let url: string | undefined = `${GRAPH}/me/calendars?$select=id,name,hexColor,color,owner&$top=100`;
    while (url) {
      const page: { value?: GraphCalendar[]; '@odata.nextLink'?: string } = await this.graph.json(url);
      for (const raw of page.value ?? []) {
        const owner = raw.owner;
        const own = !owner?.address || owner.address.toLowerCase() === account.email.toLowerCase() || (!!owner.name && owner.name === account.name);
        out.push({ id: raw.id, name: raw.name ?? '', color: /^#[0-9a-f]{6}$/i.test(raw.hexColor ?? '') ? raw.hexColor!.toLowerCase() : (COLORS[raw.color ?? ''] ?? COLORS.auto!), own });
      }
      url = page['@odata.nextLink'];
    }
    return out;
  }

  /** The events of `calendar` from `from` to `to`, both days included. */
  async events(calendar: string, from: string, to: string): Promise<OutlookEvent[]> {
    const out: OutlookEvent[] = [];
    const query = new URLSearchParams({
      startDateTime: startOf(from),
      endDateTime: startOf(addDays(to, 1)),
      $select: 'id,subject,isAllDay,isCancelled,webLink,start,end',
      $top: '200',
    });
    let url: string | undefined = `${GRAPH}/me/calendars/${encodeURIComponent(calendar)}/calendarView?${query}`;
    while (url) {
      const page: { value?: GraphEvent[]; '@odata.nextLink'?: string } = await this.graph.json(url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
      for (const raw of page.value ?? []) {
        const event = eventFrom(raw, calendar);
        if (event) out.push(event);
      }
      url = page['@odata.nextLink'];
    }
    return out;
  }
}

/** A calendar that is not there any more; its events are left out rather than stopping the others. */
export const isGone = (error: unknown) => error instanceof GraphError && (error.status === 404 || error.status === 403);

export const CALENDARS_FILE = '.scrawl/calendars.json';

/** What the person chose of Outlook's calendars: whether events show at all, and calendars shown against how they start. */
export interface CalendarChoice {
  events: boolean;
  /** A calendar turned on or off; one not here shows when it is the account's own. */
  show: Record<string, boolean>;
}

export const NO_CHOICE: CalendarChoice = { events: true, show: {} };

/** Reads the choice; what is not one is left out. */
export function parseCalendarChoice(text: string): CalendarChoice {
  let data: Record<string, unknown> | null;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NO_CHOICE;
  }
  const show: Record<string, boolean> = {};
  if (data?.show && typeof data.show === 'object') {
    for (const [id, on] of Object.entries(data.show as Record<string, unknown>)) if (typeof on === 'boolean' && id) show[id] = on;
  }
  return { events: data?.events !== false, show };
}

export const serializeCalendarChoice = (choice: CalendarChoice) =>
  `${JSON.stringify({ version: 1, ...(!choice.events && { events: false }), ...(Object.keys(choice.show).length > 0 && { show: choice.show }) }, null, 2)}\n`;

export async function loadCalendarChoice(fs: VaultFs): Promise<CalendarChoice> {
  try {
    return parseCalendarChoice(await fs.readText(CALENDARS_FILE));
  } catch {
    return NO_CHOICE;
  }
}

export const saveCalendarChoice = (fs: VaultFs, choice: CalendarChoice) => fs.writeText(CALENDARS_FILE, serializeCalendarChoice(choice));

/** Whether a calendar's events show: as chosen, else when it is the account's own. */
export const isShown = (choice: CalendarChoice, calendar: Pick<OutlookCalendar, 'id' | 'own'>) => choice.show[calendar.id] ?? calendar.own;

/** The choice from both sides of a sync, calendar by calendar. */
export function mergeCalendarChoice(base: string, local: string, remote: string): string {
  const [b, l, r] = [base, local, remote].map(parseCalendarChoice) as [CalendarChoice, CalendarChoice, CalendarChoice];
  const merged = mergeFields({ events: b.events }, { events: l.events }, { events: r.events });
  return serializeCalendarChoice({ events: merged.events, show: mergeFields(b.show, l.show, r.show) });
}
