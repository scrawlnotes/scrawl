import { baseOf, type CalendarWriter, endOf, eventKey, eventTitle, readBase, type SyncedEvent, type WantedEvent } from './calendar-sync';
import type { VaultFs } from './fs';
import { mergeFields } from './sync/merge-records';
import { GRAPH, Graph, GraphError, type GraphOptions } from './sync/onedrive';
import { addDays } from './tasks';

// Outlook's calendars in Scrawl (design/outlook-calendar.md): the account's calendars, their events
// for some days as Outlook has them, and which calendars the person shows. Nothing of Outlook is
// kept; what is kept is the person's choice, in the personal space, for every device.

/** One of an account's calendars, Outlook's or Google's; `own` is false for one someone else shared. */
export interface AccountCalendar {
  id: string;
  name: string;
  /** `#rrggbb`, as the account draws it. */
  color: string;
  own: boolean;
  /** Whether it shows till chosen otherwise, where the account says (Google's ticked ones); else when it is `own`. */
  shown?: boolean;
}

/** An event in this device's clock. */
export interface CalendarEvent {
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

export interface CalendarAccount {
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
export function eventFrom(raw: GraphEvent, calendar: string, timeZone?: string): CalendarEvent | null {
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
export function eventsOn(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
  const on = events.filter((event) => event.day <= day && event.lastDay >= day);
  const timed = (event: CalendarEvent) => (event.start && event.day === day ? event.start : '');
  return on.sort((a, b) => timed(a).localeCompare(timed(b)) || a.title.localeCompare(b.title));
}

/** Whether an event shows with its time on `day`, rather than as all day. */
export const timedOn = (event: CalendarEvent, day: string): boolean => !!event.start && event.day === day;

/** Graph's address of a day's start in this device's clock, as UTC. */
const startOf = (day: string) => new Date(`${day}T00:00:00`).toISOString();

/** Reading the account's calendars and their events; Outlook's answers are not kept. */
export class OutlookReader {
  private readonly graph: Graph;

  constructor(options: GraphOptions) {
    this.graph = new Graph(options);
  }

  async me(): Promise<CalendarAccount> {
    const me = await this.graph.json<{ displayName?: string; mail?: string | null; userPrincipalName?: string }>(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`);
    const email = me.mail || me.userPrincipalName || '';
    return { name: me.displayName || email, email };
  }

  /** The account's calendars; one is its own when its owner is the account. */
  async calendars(account: CalendarAccount): Promise<AccountCalendar[]> {
    const out: AccountCalendar[] = [];
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
  async events(calendar: string, from: string, to: string): Promise<CalendarEvent[]> {
    const out: CalendarEvent[] = [];
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

/** Where an Outlook event keeps what Scrawl wrote into it (design/outlook-calendar.md 4.3). */
const BASE_PROPERTY = 'String {5b1f6c3e-8a2d-4e7b-9f40-3c6d1a8e2b57} Name ScrawlBase';

const SYNCED_SELECT = 'id,subject,start,end,isAllDay,isCancelled';
const SYNCED_EXPAND = `singleValueExtendedProperties($filter=id eq '${BASE_PROPERTY}')`;
type OutlookSyncedEvent = GraphEvent & { singleValueExtendedProperties?: { value?: string }[] };

/** An event of the Scrawl calendar as Outlook has it, its times asked in UTC, in the device's clock. */
function syncedOf(raw: OutlookSyncedEvent): SyncedEvent {
  const base = readBase(raw.singleValueExtendedProperties?.[0]?.value);
  const event = eventFrom(raw, '');
  if (!event) return { eventId: raw.id, base, title: raw.subject ?? '', day: (raw.start?.dateTime ?? '').slice(0, 10) };
  return { eventId: raw.id, base, title: event.title, day: event.day, ...(event.start && { start: event.start }), ...(event.end && { end: event.end }) };
}

/** Writing Scrawl's work to its "Scrawl" calendar in Outlook, in `timeZone`, the device's. */
export class OutlookWriter implements CalendarWriter {
  private readonly graph: Graph;

  constructor(
    options: GraphOptions,
    private readonly timeZone: string,
  ) {
    this.graph = new Graph(options);
  }

  private async send(method: string, url: string, body?: unknown, ok: number[] = []): Promise<Response> {
    const response = await this.graph.request(url, { method, ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok && !ok.includes(response.status)) {
      let message = response.statusText;
      try {
        message = ((await response.json()) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // Its status says enough.
      }
      throw new GraphError(response.status, '', `Outlook: ${response.status} ${message}`);
    }
    return response;
  }

  async makeCalendar(): Promise<string> {
    return ((await (await this.send('POST', `${GRAPH}/me/calendars`, { name: 'Scrawl' })).json()) as { id: string }).id;
  }

  async hasCalendar(calendar: string): Promise<boolean> {
    return (await this.send('GET', `${GRAPH}/me/calendars/${encodeURIComponent(calendar)}?$select=id`, undefined, [404])).ok;
  }

  async removeCalendar(calendar: string): Promise<void> {
    await this.send('DELETE', `${GRAPH}/me/calendars/${encodeURIComponent(calendar)}`, undefined, [404]);
  }

  async synced(calendar: string, from: string, to: string): Promise<SyncedEvent[]> {
    const out: SyncedEvent[] = [];
    const query = new URLSearchParams({
      startDateTime: new Date(`${from}T00:00:00`).toISOString(),
      endDateTime: new Date(`${addDays(to, 1)}T00:00:00`).toISOString(),
      $select: SYNCED_SELECT,
      $expand: SYNCED_EXPAND,
      $top: '200',
    });
    let url: string | undefined = `${GRAPH}/me/calendars/${encodeURIComponent(calendar)}/calendarView?${query}`;
    while (url) {
      const page: { value?: OutlookSyncedEvent[]; '@odata.nextLink'?: string } = await this.graph.json(url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
      for (const raw of page.value ?? []) out.push(syncedOf(raw));
      url = page['@odata.nextLink'];
    }
    return out;
  }

  async find(_calendar: string, eventId: string): Promise<SyncedEvent | null> {
    const response = await this.send('GET', `${GRAPH}/me/events/${encodeURIComponent(eventId)}?${new URLSearchParams({ $select: SYNCED_SELECT, $expand: SYNCED_EXPAND })}`, undefined, [404]);
    return response.ok ? syncedOf((await response.json()) as OutlookSyncedEvent) : null;
  }

  private body(wanted: WantedEvent) {
    const when = wanted.start
      ? { isAllDay: false, start: { dateTime: `${wanted.start}:00`, timeZone: this.timeZone }, end: { dateTime: `${endOf(wanted)}:00`, timeZone: this.timeZone } }
      : { isAllDay: true, start: { dateTime: `${wanted.day}T00:00:00`, timeZone: this.timeZone }, end: { dateTime: `${addDays(wanted.day, 1)}T00:00:00`, timeZone: this.timeZone } };
    return {
      subject: eventTitle(wanted),
      body: { contentType: 'text', content: wanted.where },
      ...when,
      showAs: wanted.start ? 'busy' : 'free',
      isReminderOn: false,
      singleValueExtendedProperties: [{ id: BASE_PROPERTY, value: JSON.stringify(baseOf(wanted)) }],
    };
  }

  async create(calendar: string, wanted: WantedEvent): Promise<void> {
    // The same transaction id for the same work: a retry does not make it twice.
    await this.send('POST', `${GRAPH}/me/calendars/${encodeURIComponent(calendar)}/events`, { ...this.body(wanted), transactionId: eventKey(wanted.id) });
  }

  async update(_calendar: string, eventId: string, wanted: WantedEvent): Promise<void> {
    await this.send('PATCH', `${GRAPH}/me/events/${encodeURIComponent(eventId)}`, this.body(wanted));
  }

  async remove(_calendar: string, eventId: string): Promise<void> {
    await this.send('DELETE', `${GRAPH}/me/events/${encodeURIComponent(eventId)}`, undefined, [404]);
  }
}

/** A calendar that is not there any more; its events are left out rather than stopping the others. */
export const isGone =(error: unknown) => error instanceof GraphError && (error.status === 404 || error.status === 403);

export const CALENDARS_FILE = '.scrawl/calendars.json';

/** Where Scrawl's work goes: the account by its kind and its address, and its "Scrawl" calendar's id there, null till it is made. */
export type CalendarProviderId = 'outlook' | 'google';

/** What goes to the calendar, by row (design/outlook-calendar.md 2.1): only what differs from how it starts. */
export interface CalendarGoes {
  tasks?: boolean;
  boards?: boolean;
  collections?: boolean;
  /** An installed app, by its folder's path, `@space/folder` for one in a space. */
  apps: Record<string, boolean>;
}

/**
 * What the person chose (design/outlook-calendar.md 4.4, 12): whether events show at all,
 * calendars shown against how they start, and whether their work goes to a calendar, which and what.
 */
export interface CalendarChoice {
  events: boolean;
  /** A calendar turned on or off; one not here shows as the account starts it. */
  show: Record<string, boolean>;
  sync: boolean;
  to: CalendarProviderId | null;
  account: string | null;
  calendar: string | null;
  goes: CalendarGoes;
}

export const NO_CHOICE: CalendarChoice = { events: true, show: {}, sync: false, to: null, account: null, calendar: null, goes: { apps: {} } };

/** Whether a row goes: as chosen, else Tasks and Boards do and the rest do not. */
export function rowGoes(choice: Pick<CalendarChoice, 'goes'>, row: 'tasks' | 'boards' | 'collections' | { app: string }): boolean {
  if (typeof row === 'object') return choice.goes.apps[row.app] ?? false;
  return choice.goes[row] ?? row !== 'collections';
}

const booleans = (value: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (value && typeof value === 'object') for (const [key, on] of Object.entries(value as Record<string, unknown>)) if (typeof on === 'boolean' && key) out[key] = on;
  return out;
};
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** Reads the choice; what is not one is left out. */
export function parseCalendarChoice(source: string): CalendarChoice {
  let data: Record<string, unknown> | null;
  try {
    data = JSON.parse(source) as Record<string, unknown>;
  } catch {
    return NO_CHOICE;
  }
  if (!data || typeof data !== 'object') return NO_CHOICE;
  const rows = (data.goes && typeof data.goes === 'object' ? data.goes : {}) as Record<string, unknown>;
  const goes: CalendarGoes = { apps: booleans(rows.apps) };
  for (const row of ['tasks', 'boards', 'collections'] as const) if (typeof rows[row] === 'boolean') goes[row] = rows[row] as boolean;
  return {
    events: data.events !== false,
    show: booleans(data.show),
    sync: data.sync === true,
    to: data.to === 'outlook' || data.to === 'google' ? data.to : null,
    account: text(data.account),
    calendar: text(data.calendar),
    goes,
  };
}

export function serializeCalendarChoice(choice: CalendarChoice): string {
  const { apps, ...rows } = choice.goes;
  const goes = { ...rows, ...(Object.keys(apps).length > 0 && { apps }) };
  return `${JSON.stringify(
    {
      version: 1,
      ...(!choice.events && { events: false }),
      ...(Object.keys(choice.show).length > 0 && { show: choice.show }),
      ...(choice.sync && { sync: true }),
      ...(choice.to && { to: choice.to }),
      ...(choice.account && { account: choice.account }),
      ...(choice.calendar && { calendar: choice.calendar }),
      ...(Object.keys(goes).length > 0 && { goes }),
    },
    null,
    2,
  )}\n`;
}

export async function loadCalendarChoice(fs: VaultFs): Promise<CalendarChoice> {
  try {
    return parseCalendarChoice(await fs.readText(CALENDARS_FILE));
  } catch {
    return NO_CHOICE;
  }
}

export const saveCalendarChoice = (fs: VaultFs, choice: CalendarChoice) => fs.writeText(CALENDARS_FILE, serializeCalendarChoice(choice));

/** Whether a calendar's events show: as chosen, else as the account shows it, else when it is the account's own. */
export const isShown = (choice: CalendarChoice, calendar: Pick<AccountCalendar, 'id' | 'own' | 'shown'>) => choice.show[calendar.id] ?? calendar.shown ?? calendar.own;

/** The choice from both sides of a sync, calendar by calendar and row by row. */
export function mergeCalendarChoice(base: string, local: string, remote: string): string {
  const [b, l, r] = [base, local, remote].map(parseCalendarChoice) as [CalendarChoice, CalendarChoice, CalendarChoice];
  const scalars = ({ events, sync, to, account, calendar, goes }: CalendarChoice) => ({ events, sync, to, account, calendar, tasks: goes.tasks, boards: goes.boards, collections: goes.collections });
  const merged = mergeFields(scalars(b), scalars(l), scalars(r));
  const goes: CalendarGoes = { apps: mergeFields(b.goes.apps, l.goes.apps, r.goes.apps) };
  for (const row of ['tasks', 'boards', 'collections'] as const) if (typeof merged[row] === 'boolean') goes[row] = merged[row];
  return serializeCalendarChoice({
    events: merged.events !== false,
    show: mergeFields(b.show, l.show, r.show),
    sync: merged.sync === true,
    to: merged.to ?? null,
    account: merged.account ?? null,
    calendar: merged.calendar ?? null,
    goes,
  });
}
