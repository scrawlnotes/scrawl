import { describe, expect, it } from 'vitest';
import { GoogleReader, GoogleWriter, googleEventFrom } from './google-calendar';
import { isShown, NO_CHOICE } from './outlook';

const ISTANBUL = 'Europe/Istanbul';
const API = 'https://www.googleapis.com/calendar/v3';

describe('Google events', () => {
  it('takes a timed event in the clock, and an all-day one by its days', () => {
    const timed = googleEventFrom(
      { id: 'a', summary: ' School run ', htmlLink: 'https://calendar.google.com/a', start: { dateTime: '2026-11-09T08:00:00+03:00' }, end: { dateTime: '2026-11-09T05:30:00Z' } },
      'fam',
      ISTANBUL,
    );
    expect(timed).toEqual({ id: 'a', calendar: 'fam', title: 'School run', link: 'https://calendar.google.com/a', day: '2026-11-09', lastDay: '2026-11-09', start: '2026-11-09T08:00', end: '2026-11-09T08:30' });
    // From the 11th to the 13th: Google ends it on the 14th.
    const trip = googleEventFrom({ id: 'b', summary: 'Berlin', start: { date: '2026-11-11' }, end: { date: '2026-11-14' } }, 'me', ISTANBUL);
    expect(trip).toMatchObject({ day: '2026-11-11', lastDay: '2026-11-13' });
    expect(trip!.start).toBeUndefined();
  });

  it('ends one that ends at midnight on the day before', () => {
    const late = googleEventFrom({ id: 'c', start: { dateTime: '2026-11-09T22:00:00+03:00' }, end: { dateTime: '2026-11-10T00:00:00+03:00' } }, 'me', ISTANBUL);
    expect(late).toMatchObject({ title: '', day: '2026-11-09', lastDay: '2026-11-09', end: '2026-11-10T00:00' });
  });

  it('leaves out one cancelled, one the person declined, and one without its times', () => {
    const when = { start: { dateTime: '2026-11-09T10:00:00+03:00' }, end: { dateTime: '2026-11-09T11:00:00+03:00' } };
    expect(googleEventFrom({ id: 'd', status: 'cancelled', ...when }, 'me')).toBeNull();
    expect(googleEventFrom({ id: 'e', attendees: [{ responseStatus: 'accepted' }, { self: true, responseStatus: 'declined' }], ...when }, 'me')).toBeNull();
    expect(googleEventFrom({ id: 'f', attendees: [{ self: true, responseStatus: 'needsAction' }], ...when }, 'me', ISTANBUL)).not.toBeNull();
    expect(googleEventFrom({ id: 'g' }, 'me')).toBeNull();
  });
});

describe('Reading Google', () => {
  /** Google's answers by the start of their address. */
  function google(answers: Record<string, unknown>) {
    const asked: string[] = [];
    const fetch = (async (input: string) => {
      asked.push(input);
      const key = Object.keys(answers).find((start) => input.startsWith(start));
      return new Response(JSON.stringify(key ? answers[key] : {}), { status: key ? 200 : 404 });
    }) as typeof globalThis.fetch;
    return { reader: new GoogleReader({ fetch, token: async () => 'token' }), asked };
  }

  it('names the account by its primary calendar', async () => {
    expect(await google({ [`${API}/users/me/calendarList/primary`]: { id: 'kaan.arslan@gmail.com', summary: 'kaan.arslan@gmail.com' } }).reader.me()).toEqual({ name: 'kaan.arslan@gmail.com', email: 'kaan.arslan@gmail.com' });
    expect(await google({ [`${API}/users/me/calendarList/primary`]: { id: 'kaan.arslan@gmail.com', summary: 'Kaan Arslan' } }).reader.me()).toEqual({ name: 'Kaan Arslan', email: 'kaan.arslan@gmail.com' });
  });

  it('puts the primary calendar first, shows those ticked in Google, and tells a person’s from Google’s own', async () => {
    const list = `${API}/users/me/calendarList?`;
    const { reader, asked } = google({
      [`${list}minAccessRole=reader&maxResults=250&pageToken=2`]: {
        items: [{ id: 'selin@gmail.com', summary: 'selin@gmail.com', summaryOverride: 'Selin Arslan', backgroundColor: '#E67C73', accessRole: 'reader', selected: false }],
      },
      [list]: {
        items: [
          { id: 'family@group.calendar.google.com', summary: 'Family', backgroundColor: '#33b679', accessRole: 'owner', selected: true },
          { id: 'tr.turkish#holiday@group.v.calendar.google.com', summary: 'Holidays in Turkey', backgroundColor: '#0b8043', accessRole: 'reader', selected: true },
          { id: 'kaan.arslan@gmail.com', summary: 'Kaan Arslan', backgroundColor: '#039be5', accessRole: 'owner', selected: true, primary: true },
        ],
        nextPageToken: '2',
      },
    });
    const calendars = await reader.calendars();
    expect(calendars).toEqual([
      { id: 'kaan.arslan@gmail.com', name: 'Kaan Arslan', color: '#039be5', own: true, shown: true },
      { id: 'family@group.calendar.google.com', name: 'Family', color: '#33b679', own: true, shown: true },
      { id: 'tr.turkish#holiday@group.v.calendar.google.com', name: 'Holidays in Turkey', color: '#0b8043', own: true, shown: true },
      { id: 'selin@gmail.com', name: 'Selin Arslan', color: '#e67c73', own: false, shown: false },
    ]);
    expect(asked).toHaveLength(2);
    // Shown as Google shows it, till chosen otherwise.
    expect(calendars.map((calendar) => isShown(NO_CHOICE, calendar))).toEqual([true, true, true, false]);
    expect(isShown({ ...NO_CHOICE, show: { 'selin@gmail.com': true } }, calendars[3]!)).toBe(true);
  });

  it('reads a calendar’s days page by page, each repeat on its own, from the device’s midnight', async () => {
    const events = `${API}/calendars/${encodeURIComponent('kaan.arslan@gmail.com')}/events?`;
    const pilates = { id: 'a', summary: 'Pilates', start: { dateTime: '2026-11-09T19:00:00+03:00' }, end: { dateTime: '2026-11-09T20:00:00+03:00' } };
    // Each page by its token: the first without one, the second with the first's.
    const pages: Record<string, unknown> = {
      '': { items: [pilates, { id: 'b', status: 'cancelled' }], nextPageToken: 'next' },
      next: { items: [{ id: 'c', summary: 'Yoga', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } }] },
    };
    const asked: string[] = [];
    const reader = new GoogleReader({
      fetch: (async (input: string) => {
        asked.push(input);
        return new Response(JSON.stringify(pages[new URL(input).searchParams.get('pageToken') ?? '']));
      }) as typeof globalThis.fetch,
      token: async () => 'token',
    });
    const read = await reader.events('kaan.arslan@gmail.com', '2026-11-09', '2026-11-15', ISTANBUL);
    expect(read.map((e) => e.id)).toEqual(['a', 'c']);
    const [first, second] = asked.map((url) => new URL(url));
    expect(first!.href.startsWith(events)).toBe(true);
    expect(first!.searchParams.get('singleEvents')).toBe('true');
    expect(new Date(first!.searchParams.get('timeMin')!).getTime()).toBe(new Date('2026-11-09T00:00:00').getTime());
    expect(new Date(first!.searchParams.get('timeMax')!).getTime()).toBe(new Date('2026-11-16T00:00:00').getTime());
    expect(first!.searchParams.has('pageToken')).toBe(false);
    expect(second!.searchParams.get('pageToken')).toBe('next');
  });
});

describe('Writing to Google', () => {
  function google(status = 200, answer: unknown = {}) {
    const sent: { method: string; url: string; body: Record<string, unknown> | null }[] = [];
    const fetch = (async (input: string, init?: RequestInit) => {
      sent.push({ method: init?.method ?? 'GET', url: input, body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null });
      return new Response(JSON.stringify(answer), { status });
    }) as typeof globalThis.fetch;
    return { writer: new GoogleWriter({ fetch, token: async () => 'token' }, ISTANBUL), sent };
  }
  const work = { id: 'card:Roadmap.board.json#c1', title: 'ROA-12 Fix the login', day: '2026-11-09', done: false, where: 'Scrawl · Work › Roadmap' };

  it('writes a card all day with its id from the work, and a record with its time', async () => {
    const { writer, sent } = google();
    await writer.create('cal', work);
    await writer.create('cal', { ...work, id: 'record:Clinic/Appointments#r1', title: 'Ayşe Yılmaz', start: '2026-11-09T14:00', end: '2026-11-09T15:00' });
    expect(sent[0]!.url).toBe(`${API}/calendars/cal/events`);
    expect(sent[0]!.body).toMatchObject({ summary: 'ROA-12 Fix the login', description: 'Scrawl · Work › Roadmap', start: { date: '2026-11-09' }, end: { date: '2026-11-10' }, transparency: 'transparent' });
    expect(sent[0]!.body!.id).toMatch(/^[a-v0-9]{5,}$/);
    expect(JSON.parse((sent[0]!.body!.extendedProperties as { private: { scrawl: string } }).private.scrawl)).toEqual({ v: 1, id: work.id, title: work.title, day: work.day, done: false });
    expect(sent[1]!.body).toMatchObject({ start: { dateTime: '2026-11-09T14:00:00', timeZone: ISTANBUL }, end: { dateTime: '2026-11-09T15:00:00', timeZone: ISTANBUL }, transparency: 'opaque' });
  });

  it('takes a second making of the same work, and a removal of one already gone, as done', async () => {
    await expect(google(409).writer.create('cal', work)).resolves.toBeUndefined();
    await expect(google(410).writer.remove('cal', 'e1')).resolves.toBeUndefined();
    await expect(google(403, { error: { message: 'Insufficient Permission', errors: [{ reason: 'insufficientPermissions' }] } }).writer.create('cal', work)).rejects.toMatchObject({ status: 403, code: 'insufficientPermissions' });
  });

  it('reads the Scrawl calendar’s events with their bases', async () => {
    const base = JSON.stringify({ v: 1, id: work.id, title: work.title, day: work.day, done: false });
    const { writer } = google(200, { items: [{ id: 'e1', start: { date: '2026-11-09' }, extendedProperties: { private: { scrawl: base } } }, { id: 'e2', summary: 'Visit', start: { dateTime: '2026-11-10T09:00:00+03:00' }, end: { dateTime: '2026-11-10T10:00:00+03:00' } }] });
    expect(await writer.synced('cal', '2026-11-08', '2026-11-20')).toEqual([
      { eventId: 'e1', base: { v: 1, id: work.id, title: work.title, day: work.day, done: false }, title: '', day: '2026-11-09' },
      { eventId: 'e2', base: null, title: 'Visit', day: '2026-11-10', start: '2026-11-10T09:00', end: '2026-11-10T10:00' },
    ]);
  });
});
