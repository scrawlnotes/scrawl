import { addDays, type CalendarEvent, dayIn, GoogleReader, GoogleWriter, RemoteOffline } from '@scrawlnotes/core';
import { invoke, readTokenAnswer, type TokenPost } from './cloud';
import { calendarAccount, type CalendarSource } from './calendarAccount';
import { isDesktop } from './storage';

// Google Calendar in Scrawl (design/outlook-calendar.md 11.1), apart from Google Drive's sign-in.
// Google gives a browser no lasting key without the web registration's secret, so in the browser
// the code is turned into a key, and the key renewed, by app.scrawlnotes.com's Worker
// (design/cloud.md 10.6); the desktop asks Google itself, with the desktop registration.

/** Reading; writing the "Scrawl" calendar is asked for when syncing first goes to Google (design/outlook-calendar.md 12). */
const SCOPES = ['calendar.calendarlist.readonly', 'calendar.events.readonly'].map((scope) => `https://www.googleapis.com/auth/${scope}`).join(' ');
const WRITE = 'https://www.googleapis.com/auth/calendar.app.created';
const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
/** The Worker's two addresses, `/token` and `/refresh`. */
const WORKER = 'https://app.scrawlnotes.com/google';
const WEB_CLIENT = '498960667148-tbn2glc3lolfqq8rcbf986bp8qqi0f4m.apps.googleusercontent.com';
/** The desktop registration; Google gives an installed app's secret to everyone who has the app, and does not count it as secret. */
const DESKTOP_CLIENT = '498960667148-mr6e8qpi7uarn0efrl90oklbcgkr0rij.apps.googleusercontent.com';
const DESKTOP_SECRET = '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';

/** On the desktop the shell posts to Google's token address, with the desktop registration. */
const fromShell: TokenPost = async (form) => {
  try {
    return await invoke('token_request', { url: TOKEN, form: { ...form, client_id: DESKTOP_CLIENT, client_secret: DESKTOP_SECRET } });
  } catch (error) {
    if (String(error).includes('offline')) throw new RemoteOffline();
    throw error;
  }
};

/** In the browser the Worker adds the web registration's ID and secret. */
const fromWorker: TokenPost = async (form) => {
  let response: Response;
  try {
    response = await fetch(`${WORKER}/${form.grant_type === 'refresh_token' ? 'refresh' : 'token'}`, { method: 'POST', body: new URLSearchParams(form) });
  } catch {
    throw new RemoteOffline();
  }
  return { status: response.status, body: await response.text() };
};

const store = calendarAccount({
  id: 'google',
  secret: 'google-calendar',
  authorizeUrl: (redirect, state, challenge, extra) => {
    return `${AUTHORIZE}?${new URLSearchParams({
      client_id: isDesktop ? DESKTOP_CLIENT : WEB_CLIENT,
      response_type: 'code',
      redirect_uri: redirect,
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      ...extra,
    })}`;
  },
  desktopRedirect: (port) => `http://127.0.0.1:${port}`,
  tokens: async (form) => readTokenAnswer(await (isDesktop ? fromShell : fromWorker)(form)),
  // Google gives the lasting key only when it asks for consent.
  connect: { prompt: 'consent' },
  renew: (email) => ({ prompt: 'consent', ...(email ? { login_hint: email } : {}) }),
  renewsByLeaving: false,
  reader: (token) => new GoogleReader({ token }),
  writer: (token, timeZone) => new GoogleWriter({ token }, timeZone),
  // Google adds it to what was granted before; a key from then on has both.
  write: { scope: WRITE, extra: (email) => ({ scope: `${SCOPES} ${WRITE}`, include_granted_scopes: 'true', prompt: 'consent', ...(email ? { login_hint: email } : {}) }) },
  fake: !isDesktop && import.meta.env.DEV && import.meta.env.VITE_GOOGLE !== 'real' ? fakeGoogle() : null,
});

export const google = {
  ...store,
  /** Disconnects on this device, and asks Google to forget the key; its answer is not waited for. */
  async disconnect(): Promise<string | null> {
    const key = await store.disconnect();
    if (key && key !== 'fake') void fetch(REVOKE, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ token: key }) }).catch(() => undefined);
    return key;
  },
};

// ---------- a stand-in while developing in the browser ----------

/** Google in memory, while developing in the browser: a family calendar, an unticked one and a shared one, and a week of events. */
function fakeGoogle(): CalendarSource {
  return {
    async me() {
      return { name: 'test@gmail.com', email: 'test@gmail.com' };
    },
    async calendars() {
      return [
        { id: 'test@gmail.com', name: 'test@gmail.com', color: '#039be5', own: true, shown: true },
        { id: 'family@group.calendar.google.com', name: 'Family', color: '#33b679', own: true, shown: true },
        { id: 'tr.turkish#holiday@group.v.calendar.google.com', name: 'Holidays in Turkey', color: '#0b8043', own: true, shown: true },
        { id: 'addressbook#contacts@group.v.calendar.google.com', name: 'Birthdays', color: '#7986cb', own: true, shown: false },
        { id: 'selin@gmail.com', name: 'Selin Arslan', color: '#e67c73', own: false, shown: false },
      ];
    },
    async events(calendar, from, to) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const today = dayIn(new Date());
      const out: CalendarEvent[] = [];
      const add = (day: string, title: string, start?: string, end?: string) => {
        if (day < from || day > to) return;
        out.push({ id: `${calendar}-${day}-${title}`, calendar, title, day, lastDay: day, link: 'https://calendar.google.com/calendar/', ...(start && end && { start: `${day}T${start}`, end: `${day}T${end}` }) });
      };
      for (let day = from; day <= to; day = addDays(day, 1)) {
        const weekday = new Date(`${day}T12:00:00`).getDay();
        const offset = Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
        if (calendar === 'family@group.calendar.google.com' && weekday >= 1 && weekday <= 5) add(day, 'School run', '08:00', '08:30');
        if (calendar === 'test@gmail.com' && offset === 0) add(day, 'Pilates', '19:00', '20:00');
        if (calendar === 'test@gmail.com' && offset === 2) add(day, 'Dentist', '17:00', '17:30');
        if (calendar === 'selin@gmail.com' && offset === 1) add(day, 'Selin: piano', '18:00', '19:00');
      }
      return out;
    },
  };
}
