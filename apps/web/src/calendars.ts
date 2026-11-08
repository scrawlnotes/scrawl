import { type CalendarChoice, type CalendarEvent, eventsOn } from '@scrawlnotes/core';
import type { CalendarState } from './calendarAccount';
import { google } from './google';
import { outlook } from './outlook';
import { isDesktop, openUrlOnDesktop } from './storage';

// The calendar accounts together, Google's and Outlook's (design/outlook-calendar.md 11.1): their
// events in one list wherever Scrawl shows a day, each in its calendar's color, opening where it is.

/** In Settings' order: Google, then Outlook. */
export const CALENDAR_ACCOUNTS = [google, outlook] as const;

/** Both accounts as they stand, redrawn when either changes. */
export function useCalendarAccounts(): CalendarState[] {
  return [google.use(), outlook.use()];
}

/** The events of both accounts from `from` to `to`, both days included. */
export function useCalendarEvents(from: string, to: string): CalendarEvent[] {
  const fromGoogle = google.useEvents(from, to);
  const fromOutlook = outlook.useEvents(from, to);
  return fromGoogle.length === 0 ? fromOutlook : fromOutlook.length === 0 ? fromGoogle : [...fromOutlook, ...fromGoogle];
}

/** A day's events of both, in their order: all day first, then by their start. */
export const useCalendarDay = (day: string): CalendarEvent[] => eventsOn(useCalendarEvents(day, day), day);

/** The account an event is of. */
export const accountOf = (event: Pick<CalendarEvent, 'calendar'>) => (google.colorOf(event.calendar) ? google : outlook);

/** The color of an event's calendar. */
export const calendarColor = (event: Pick<CalendarEvent, 'calendar'>) => google.colorOf(event.calendar) ?? outlook.colorOf(event.calendar) ?? '#4f8ff7';

/** Opens an event where it is, in Outlook or in Google Calendar. */
export function openCalendarEvent(event: CalendarEvent) {
  if (!event.link) return;
  if (isDesktop) void openUrlOnDesktop(event.link);
  else window.open(event.link, '_blank', 'noopener');
}

/** The person's choice, from the personal space: which calendars show, of both accounts. */
export function setCalendarChoice(choice: CalendarChoice) {
  for (const account of CALENDAR_ACCOUNTS) account.setChoice(choice);
}

/**
 * Before the app is drawn, in the browser: a sign-in of either that came back is finished, or
 * Outlook's key renewed. False when the page is leaving.
 */
export async function prepareCalendars(): Promise<boolean> {
  return (await outlook.prepare()) && (await google.prepare());
}
