import { type AccountCalendar, type CalendarAccount, type CalendarEvent, clockFromUtc } from './outlook';
import { Graph, type GraphOptions } from './sync/onedrive';
import { addDays } from './tasks';

// Google Calendar's calendars in Scrawl (design/outlook-calendar.md 11.1): the account's calendars
// and their events for some days, as Google has them, in the same shape as Outlook's. Nothing of
// Google is kept. Requests go as Graph's do: the key, one more try with a new key, waiting out a
// busy server.

const API = 'https://www.googleapis.com/calendar/v3';

/** Google's own calendars, holidays and birthdays, which are no one's: not "shared with you". */
const GOOGLES = '@group.v.calendar.google.com';

interface GoogleCalendar {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  accessRole?: string;
  selected?: boolean;
  primary?: boolean;
}

interface GoogleWhen {
  /** All day: the day, `YYYY-MM-DD`. */
  date?: string;
  /** With a time: a moment with its offset. */
  dateTime?: string;
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: GoogleWhen;
  end?: GoogleWhen;
  attendees?: { self?: boolean; responseStatus?: string }[];
}

/** An event as Google gives it, as Scrawl shows it; null for one cancelled, declined, or without its times. */
export function googleEventFrom(raw: GoogleEvent, calendar: string, timeZone?: string): CalendarEvent | null {
  if (raw.status === 'cancelled' || raw.attendees?.some((each) => each.self && each.responseStatus === 'declined')) return null;
  const base = { id: raw.id, calendar, title: raw.summary?.trim() ?? '', link: raw.htmlLink ?? '' };
  if (raw.start?.date && raw.end?.date) {
    // An all-day event ends on the day after its last.
    const day = raw.start.date;
    return { ...base, day, lastDay: raw.end.date > day ? addDays(raw.end.date, -1) : day };
  }
  if (!raw.start?.dateTime || !raw.end?.dateTime) return null;
  const clock = (moment: string) => clockFromUtc(new Date(moment).toISOString(), timeZone);
  const start = clock(raw.start.dateTime);
  const end = clock(raw.end.dateTime);
  // One that ends at midnight ends on the day before.
  const lastDay = end.endsWith('T00:00') && end.slice(0, 10) > start.slice(0, 10) ? addDays(end.slice(0, 10), -1) : end.slice(0, 10);
  return { ...base, day: start.slice(0, 10), lastDay, start, end };
}

/** A day's start in this device's clock, as Google's address wants it. */
const startOf = (day: string) => new Date(`${day}T00:00:00`).toISOString();

/** Reading a Google account's calendars and their events. */
export class GoogleReader {
  private readonly http: Graph;

  constructor(options: GraphOptions) {
    this.http = new Graph(options);
  }

  /** The account: its primary calendar is its address, and bears its name when the person gave it one. */
  async me(): Promise<CalendarAccount> {
    const primary = await this.http.json<GoogleCalendar>(`${API}/users/me/calendarList/primary`);
    return { name: primary.summaryOverride || primary.summary || primary.id, email: primary.id };
  }

  /** The calendars it can read, the primary first, then in Google's order; those ticked in Google show at first. */
  async calendars(): Promise<AccountCalendar[]> {
    const out: AccountCalendar[] = [];
    let page: string | undefined = '';
    while (page !== undefined) {
      const query = new URLSearchParams({ minAccessRole: 'reader', maxResults: '250', ...(page ? { pageToken: page } : {}) });
      const answer: { items?: GoogleCalendar[]; nextPageToken?: string } = await this.http.json(`${API}/users/me/calendarList?${query}`);
      for (const raw of answer.items ?? []) {
        const calendar = {
          id: raw.id,
          name: raw.summaryOverride || raw.summary || raw.id,
          color: /^#[0-9a-f]{6}$/i.test(raw.backgroundColor ?? '') ? raw.backgroundColor!.toLowerCase() : '#4f8ff7',
          own: raw.accessRole === 'owner' || raw.id.endsWith(GOOGLES),
          shown: raw.selected === true,
        };
        if (raw.primary) out.unshift(calendar);
        else out.push(calendar);
      }
      page = answer.nextPageToken;
    }
    return out;
  }

  /** The events of `calendar` from `from` to `to`, both days included, each repeat on its own. */
  async events(calendar: string, from: string, to: string, timeZone?: string): Promise<CalendarEvent[]> {
    const out: CalendarEvent[] = [];
    let page: string | undefined = '';
    while (page !== undefined) {
      const query = new URLSearchParams({
        timeMin: startOf(from),
        timeMax: startOf(addDays(to, 1)),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
        fields: 'items(id,status,summary,htmlLink,start,end,attendees(self,responseStatus)),nextPageToken',
        ...(page ? { pageToken: page } : {}),
      });
      const answer: { items?: GoogleEvent[]; nextPageToken?: string } = await this.http.json(`${API}/calendars/${encodeURIComponent(calendar)}/events?${query}`);
      for (const raw of answer.items ?? []) {
        const event = googleEventFrom(raw, calendar, timeZone);
        if (event) out.push(event);
      }
      page = answer.nextPageToken;
    }
    return out;
  }
}
