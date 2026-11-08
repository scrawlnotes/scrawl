import { addDays, type CalendarEvent, dayIn, OutlookReader, OutlookWriter } from '@scrawlnotes/core';
import { AUTHORITY, clientId, postFromPage, postFromShell, tokenRequest } from './cloud';
import { calendarAccount, type CalendarSource } from './calendarAccount';
import { isDesktop } from './storage';

// Outlook's calendar in Scrawl (design/outlook-calendar.md): Microsoft's sign-in for it, apart
// from OneDrive's, through the app's registration. In the browser its key lasts a day, and is
// renewed on opening as OneDrive's is (cloud.ts).

const SCOPES = 'Calendars.ReadWrite offline_access User.Read';
const post = isDesktop ? postFromShell : postFromPage;

export const outlook = calendarAccount({
  id: 'outlook',
  secret: 'outlook',
  authorizeUrl: (redirect, state, challenge, extra) =>
    `${AUTHORITY}/authorize?${new URLSearchParams({
      client_id: clientId(),
      response_type: 'code',
      redirect_uri: redirect,
      response_mode: 'query',
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...extra,
    })}`,
  desktopRedirect: (port) => `http://localhost:${port}`,
  tokens: (form) => tokenRequest(post, { ...form, scope: SCOPES }),
  connect: { prompt: 'select_account' },
  renew: (email) => ({ prompt: 'none', ...(email ? { login_hint: email } : {}) }),
  renewsByLeaving: true,
  reader: (token) => new OutlookReader({ token }),
  writer: (token, timeZone) => new OutlookWriter({ token }, timeZone),
  fake: !isDesktop && import.meta.env.DEV && import.meta.env.VITE_OUTLOOK !== 'real' ? fakeOutlook() : null,
});

// ---------- a stand-in while developing in the browser ----------

/**
 * Outlook in memory, while developing in the browser: the account's calendars, a shared one among
 * them, and a working week of events around today, so that the screens can be tried.
 */
function fakeOutlook(): CalendarSource {
  return {
    async me() {
      return { name: 'Test account', email: 'test@example.com' };
    },
    async calendars() {
      return [
        { id: 'cal', name: 'Calendar', color: '#4f8ff7', own: true },
        { id: 'bday', name: 'Birthdays', color: '#c77dd8', own: true },
        { id: 'hol', name: 'Holidays in Turkey', color: '#3fb27f', own: true },
        { id: 'mert', name: 'Mert Kaya', color: '#e0a35a', own: false },
      ];
    },
    async events(calendar, from, to) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const today = dayIn(new Date());
      const out: CalendarEvent[] = [];
      const at = (day: string, clock: string) => `${day}T${clock}`;
      const add = (day: string, title: string, start?: string, end?: string) => {
        if (day < from || day > to) return;
        out.push({ id: `${calendar}-${day}-${title}`, calendar, title, day, lastDay: day, link: 'https://outlook.live.com/calendar/', ...(start && end && { start: at(day, start), end: at(day, end) }) });
      };
      for (let day = from; day <= to; day = addDays(day, 1)) {
        const weekday = new Date(`${day}T12:00:00`).getDay();
        const offset = Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
        if (calendar === 'cal' && weekday >= 1 && weekday <= 5) add(day, 'Standup', '09:30', '10:00');
        if (calendar === 'cal' && offset === 0) {
          add(day, 'Acme demo', '11:00', '12:00');
          add(day, 'Lunch with Elif', '13:00', '14:00');
          add(day, 'Accountant', '16:00', '16:30');
        }
        if (calendar === 'cal' && offset === 1) add(day, 'Design review', '10:00', '11:00');
        if (calendar === 'cal' && offset === 3) {
          add(day, 'Quarterly planning', '10:00', '11:30');
          add(day, 'Lunch with the Acme team', '12:00', '13:00');
          add(day, 'Call with Atlas Lifts', '15:30', '16:00');
          add(day, 'Release sync', '16:30', '17:00');
          add(day, 'Gym with Can', '17:30', '18:30');
          add(day, 'Dinner with Selin', '18:30', '19:00');
        }
        if (calendar === 'bday' && offset === 2) add(day, 'Elif Demir’s birthday');
        if (calendar === 'mert' && offset === 1) add(day, 'Mert: dentist', '14:00', '15:00');
      }
      return out;
    },
  };
}
