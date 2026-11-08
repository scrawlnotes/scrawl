import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import {
  CALENDARS_FILE,
  clockFromUtc,
  eventFrom,
  eventsOn,
  isShown,
  loadCalendarChoice,
  mergeCalendarChoice,
  type OutlookEvent,
  OutlookReader,
  parseCalendarChoice,
  saveCalendarChoice,
  serializeCalendarChoice,
  timedOn,
} from './outlook';
import { mergeKindOf } from './sync/merge-files';

const ISTANBUL = 'Europe/Istanbul';

describe('Outlook events', () => {
  it('reads a moment Graph gives in UTC in a clock of its own', () => {
    expect(clockFromUtc('2026-11-09T06:30:00.0000000', ISTANBUL)).toBe('2026-11-09T09:30');
    expect(clockFromUtc('2026-11-09T22:15:00.0000000', ISTANBUL)).toBe('2026-11-10T01:15');
  });

  it('takes a timed event in the clock, and an all-day one by its days', () => {
    const timed = eventFrom({ id: 'a', subject: ' Standup ', start: { dateTime: '2026-11-09T06:30:00.0000000' }, end: { dateTime: '2026-11-09T07:00:00.0000000' }, webLink: 'https://outlook/a' }, 'cal', ISTANBUL);
    expect(timed).toEqual({ id: 'a', calendar: 'cal', title: 'Standup', link: 'https://outlook/a', day: '2026-11-09', lastDay: '2026-11-09', start: '2026-11-09T09:30', end: '2026-11-09T10:00' });
    // All day from the 11th to the 13th: Graph ends it on the 14th, at its start.
    const trip = eventFrom({ id: 'b', subject: 'Berlin', isAllDay: true, start: { dateTime: '2026-11-11T00:00:00.0000000' }, end: { dateTime: '2026-11-14T00:00:00.0000000' } }, 'cal', ISTANBUL);
    expect(trip).toMatchObject({ day: '2026-11-11', lastDay: '2026-11-13' });
    expect(trip!.start).toBeUndefined();
  });

  it('ends one that ends at midnight on the day before, and leaves a cancelled one out', () => {
    const late = eventFrom({ id: 'c', subject: 'Release', start: { dateTime: '2026-11-09T19:00:00' }, end: { dateTime: '2026-11-09T21:00:00' } }, 'cal', ISTANBUL);
    expect(late).toMatchObject({ day: '2026-11-09', lastDay: '2026-11-09', end: '2026-11-10T00:00' });
    expect(eventFrom({ id: 'd', isCancelled: true, start: { dateTime: '2026-11-09T06:30:00' }, end: { dateTime: '2026-11-09T07:00:00' } }, 'cal')).toBeNull();
    expect(eventFrom({ id: 'e', subject: 'No times' }, 'cal')).toBeNull();
  });

  it('gives a day its events: all day and going on first, then by their start', () => {
    const event = (id: string, day: string, lastDay: string, start?: string): OutlookEvent => ({ id, calendar: 'cal', title: id, day, lastDay, link: '', ...(start && { start, end: start }) });
    const events = [
      event('lunch', '2026-11-09', '2026-11-09', '2026-11-09T13:00'),
      event('standup', '2026-11-09', '2026-11-09', '2026-11-09T09:30'),
      event('night shift', '2026-11-08', '2026-11-09', '2026-11-08T22:00'),
      event('birthday', '2026-11-09', '2026-11-09'),
      event('tomorrow', '2026-11-10', '2026-11-10', '2026-11-10T09:30'),
    ];
    const on = eventsOn(events, '2026-11-09');
    expect(on.map((e) => e.id)).toEqual(['birthday', 'night shift', 'standup', 'lunch']);
    expect(on.map((e) => timedOn(e, '2026-11-09'))).toEqual([false, false, true, true]);
  });
});

describe('Reading Outlook', () => {
  /** Graph's answers by the start of their address. */
  function graph(answers: Record<string, unknown>) {
    const asked: { url: string; prefer: string | null }[] = [];
    const fetch = (async (input: string, init?: RequestInit) => {
      asked.push({ url: input, prefer: new Headers(init?.headers).get('Prefer') });
      const key = Object.keys(answers).find((start) => input.startsWith(start));
      return new Response(JSON.stringify(key ? answers[key] : {}), { status: key ? 200 : 404 });
    }) as typeof globalThis.fetch;
    return { reader: new OutlookReader({ fetch, token: async () => 'token' }), asked };
  }

  it('tells the account’s own calendars from those shared with it, with their colors', async () => {
    const { reader } = graph({
      'https://graph.microsoft.com/v1.0/me?': { displayName: 'Kaan Arslan', mail: null, userPrincipalName: 'kaanarslan@outlook.com' },
      'https://graph.microsoft.com/v1.0/me/calendars?': {
        value: [
          { id: 'cal', name: 'Calendar', hexColor: '#4F8FF7', owner: { name: 'Kaan Arslan', address: 'outlook_12AB@outlook.com' } },
          { id: 'bday', name: 'Birthdays', hexColor: '', color: 'lightPink', owner: { name: 'Kaan Arslan', address: 'KaanArslan@outlook.com' } },
          { id: 'mert', name: 'Mert Kaya', color: 'auto', owner: { name: 'Mert Kaya', address: 'mert@acme.com' } },
        ],
      },
    });
    const me = await reader.me();
    expect(me).toEqual({ name: 'Kaan Arslan', email: 'kaanarslan@outlook.com' });
    expect(await reader.calendars(me)).toEqual([
      { id: 'cal', name: 'Calendar', color: '#4f8ff7', own: true },
      { id: 'bday', name: 'Birthdays', color: '#e57399', own: true },
      { id: 'mert', name: 'Mert Kaya', color: '#4f8ff7', own: false },
    ]);
  });

  it('reads a calendar’s days page by page, in UTC, leaving the cancelled out', async () => {
    const view = 'https://graph.microsoft.com/v1.0/me/calendars/cal/calendarView';
    const { reader, asked } = graph({
      [`${view}?`]: {
        value: [{ id: 'a', subject: 'Standup', start: { dateTime: '2026-11-09T06:30:00' }, end: { dateTime: '2026-11-09T07:00:00' } }],
        '@odata.nextLink': `${view}/next`,
      },
      [`${view}/next`]: { value: [{ id: 'b', subject: 'Gone', isCancelled: true, start: { dateTime: '2026-11-09T08:00:00' }, end: { dateTime: '2026-11-09T09:00:00' } }] },
    });
    const events = await reader.events('cal', '2026-11-09', '2026-11-15');
    expect(events.map((e) => e.id)).toEqual(['a']);
    expect(asked.map((a) => a.prefer)).toEqual(['outlook.timezone="UTC"', 'outlook.timezone="UTC"']);
    const first = new URL(asked[0]!.url);
    expect(new Date(first.searchParams.get('startDateTime')!).getTime()).toBe(new Date('2026-11-09T00:00:00').getTime());
    expect(new Date(first.searchParams.get('endDateTime')!).getTime()).toBe(new Date('2026-11-16T00:00:00').getTime());
  });
});

describe('The choice of calendars', () => {
  it('shows the account’s own calendars and not a shared one, till chosen otherwise', () => {
    const choice = parseCalendarChoice('{"version":1,"show":{"bday":false,"mert":true,"bad":"yes"}}');
    expect(choice).toEqual({ events: true, show: { bday: false, mert: true } });
    expect(isShown(choice, { id: 'cal', own: true })).toBe(true);
    expect(isShown(choice, { id: 'bday', own: true })).toBe(false);
    expect(isShown(choice, { id: 'mert', own: false })).toBe(true);
    expect(isShown(choice, { id: 'elif', own: false })).toBe(false);
  });

  it('writes only what was chosen, and reads none from nothing', async () => {
    expect(serializeCalendarChoice({ events: true, show: {} })).toBe('{\n  "version": 1\n}\n');
    const fs = new MemoryFs();
    expect(await loadCalendarChoice(fs)).toEqual({ events: true, show: {} });
    await saveCalendarChoice(fs, { events: false, show: { mert: true } });
    expect(await loadCalendarChoice(fs)).toEqual({ events: false, show: { mert: true } });
    expect(parseCalendarChoice('not json')).toEqual({ events: true, show: {} });
  });

  it('keeps calendars chosen on two devices, each its own', () => {
    expect(mergeKindOf(CALENDARS_FILE)).toBe('calendars');
    const base = serializeCalendarChoice({ events: true, show: {} });
    const mine = serializeCalendarChoice({ events: true, show: { bday: false } });
    const theirs = serializeCalendarChoice({ events: false, show: { mert: true } });
    expect(parseCalendarChoice(mergeCalendarChoice(base, mine, theirs))).toEqual({ events: false, show: { bday: false, mert: true } });
  });
});
