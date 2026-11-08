import {
  addDays,
  type CalendarChoice,
  dayIn,
  eventsOn,
  isGone,
  isShown,
  NO_CHOICE,
  type OutlookAccount,
  type OutlookCalendar,
  type OutlookEvent,
  OutlookReader,
  RemoteSignedOut,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { useEffect, useSyncExternalStore } from 'react';
import { AUTHORITY, clientId, invoke, pkce, postFromPage, postFromShell, randomText, readJson, type TokenAnswer, tokenRequest } from './cloud';
import { isDesktop, openUrlOnDesktop } from './storage';

// Outlook's calendar in Scrawl (design/outlook-calendar.md), slice 1: a sign-in of its own, apart
// from OneDrive's, and the events of the calendars the person shows, read from Outlook when they
// are drawn and never kept. On the desktop the key is in the credential store; in the browser it
// lasts a day, and is renewed on opening as OneDrive's is (cloud.ts).

const SCOPES = 'Calendars.ReadWrite offline_access User.Read';
const SECRET = 'outlook';
/** On this device: the account connected, for its name and its email. */
const ACCOUNT = 'scrawl.outlookAccount';
/** In the browser: the key and when it was given, and a sign-in waiting for the page to come back. */
const BROWSER_KEY = 'scrawl.outlookKey';
const PENDING = 'scrawl.outlookSignIn';
const RENEWED = 'scrawl.outlookRenewed';
const RENEW_AFTER_MS = 20 * 60 * 60 * 1000;
/** Events are read again after this long, and when the window comes back. */
const FRESH_MS = 5 * 60 * 1000;

/** Whether Outlook is connected here, and whether it wants its sign-in again. */
export type OutlookStatus = 'off' | 'on' | 'signin';

interface Source {
  me(): Promise<OutlookAccount>;
  calendars(account: OutlookAccount): Promise<OutlookCalendar[]>;
  events(calendar: string, from: string, to: string): Promise<OutlookEvent[]>;
}

// ---------- the key ----------

let access: { token: string; until: number } | null = null;
let asking: Promise<string> | null = null;

async function keptKey(): Promise<string | null> {
  if (isDesktop) return invoke<string | null>('secret_get', { name: SECRET });
  return readJson<{ key: string }>(localStorage, BROWSER_KEY)?.key ?? null;
}

async function keepKey(key: string, fresh: boolean) {
  if (isDesktop) return invoke('secret_set', { name: SECRET, value: key });
  // A renewed key ends when the first one does, a day after the sign-in.
  const since = fresh ? Date.now() : (readJson<{ since: number }>(localStorage, BROWSER_KEY)?.since ?? Date.now());
  try {
    localStorage.setItem(BROWSER_KEY, JSON.stringify({ key, since }));
  } catch {
    // Not kept: the next reading asks to sign in again.
  }
}

async function forgetKey() {
  access = null;
  if (isDesktop) await invoke('secret_delete', { name: SECRET }).catch(() => undefined);
  else localStorage.removeItem(BROWSER_KEY);
}

const post = isDesktop ? postFromShell : postFromPage;

function keepAccess(answer: TokenAnswer & { access_token: string }) {
  access = { token: answer.access_token, until: Date.now() + ((answer.expires_in ?? 3600) - 60) * 1000 };
}

async function renew(): Promise<string> {
  const key = await keptKey();
  if (!key) throw new RemoteSignedOut();
  const answer = await tokenRequest(post, { grant_type: 'refresh_token', refresh_token: key, scope: SCOPES });
  if (answer.refresh_token && answer.refresh_token !== key) await keepKey(answer.refresh_token, false);
  keepAccess(answer);
  return answer.access_token;
}

function token(fresh: boolean): Promise<string> {
  if (!fresh && access && Date.now() < access.until) return Promise.resolve(access.token);
  asking ??= renew().finally(() => {
    asking = null;
  });
  return asking;
}

/** Takes the tokens a sign-in brought, and the account they are for. */
async function signedInWith(answer: TokenAnswer & { access_token: string }) {
  if (!answer.refresh_token) throw new Error(t('outlook.noKey'));
  await keepKey(answer.refresh_token, true);
  keepAccess(answer);
  const account = await source().me();
  localStorage.setItem(ACCOUNT, JSON.stringify(account));
  state = { ...state, status: 'on', account, calendars: null, error: null };
  cache.clear();
  changed();
  void loadCalendars();
}

function authorizeUrl(redirect: string, state: string, challenge: string, extra: Record<string, string>) {
  return `${AUTHORITY}/authorize?${new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: redirect,
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...extra,
  })}`;
}

interface Pending {
  verifier: string;
  state: string;
  intent: 'connect' | 'renew';
  redirect: string;
}

/** In the browser: takes the page to Microsoft; it comes back to `prepareOutlook`. */
async function leave(intent: Pending['intent'], email?: string): Promise<boolean> {
  const { verifier, challenge } = await pkce();
  const at = randomText(16);
  const redirect = `${window.location.origin}/`;
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state: at, intent, redirect } satisfies Pending));
  } catch {
    return false;
  }
  window.location.assign(authorizeUrl(redirect, at, challenge, intent === 'renew' ? { prompt: 'none', ...(email && { login_hint: email }) } : { prompt: 'select_account' }));
  return true;
}

/** On the desktop: the system browser, and the answer caught on this computer. */
async function signInOnDesktop() {
  const { verifier, challenge } = await pkce();
  const at = randomText(16);
  const port = await invoke<number>('oauth_listen');
  const redirect = `http://localhost:${port}`;
  await invoke('open_url', { url: authorizeUrl(redirect, at, challenge, { prompt: 'select_account' }) });
  const code = await invoke<string>('oauth_wait', { port, state: at, pages: { done: t('outlook.browserDone'), failed: t('cloud.browserFailed') } });
  await signedInWith(await tokenRequest(post, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, scope: SCOPES }));
}

/**
 * Before the app is drawn, in the browser, and before OneDrive's own: a sign-in that went to
 * Microsoft for Outlook and came back is finished; or a key getting old is renewed, the page
 * leaving for it, once a session and only online. Returns false when the page is leaving.
 */
export async function prepareOutlook(): Promise<boolean> {
  if (isDesktop || fake) return true;
  const params = new URLSearchParams(window.location.search);
  const pending = readJson<Pending>(sessionStorage, PENDING);
  if (pending && (params.has('code') || params.has('error')) && params.get('state') === pending.state) {
    sessionStorage.removeItem(PENDING);
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    const code = params.get('code');
    if (code) {
      void tokenRequest(post, { grant_type: 'authorization_code', code, redirect_uri: pending.redirect, code_verifier: pending.verifier, scope: SCOPES })
        .then(signedInWith)
        .catch((error: unknown) => fail(error));
    } else if (pending.intent === 'renew') {
      state = { ...state, status: 'signin' };
    } else {
      state = { ...state, error: params.get('error_description')?.split('\n')[0] || params.get('error') };
    }
    return true;
  }
  const since = readJson<{ since: number }>(localStorage, BROWSER_KEY)?.since ?? null;
  if (since === null || !navigator.onLine || Date.now() - since < RENEW_AFTER_MS) return true;
  try {
    if (sessionStorage.getItem(RENEWED) !== null) return true;
    sessionStorage.setItem(RENEWED, '1');
  } catch {
    return true;
  }
  return !(await leave('renew', state.account?.email));
}

// ---------- what is shown ----------

interface State {
  status: OutlookStatus;
  account: OutlookAccount | null;
  /** The account's calendars, null till read. */
  calendars: OutlookCalendar[] | null;
  choice: CalendarChoice;
  /** Why the last sign-in did not go through. */
  error: string | null;
  connecting: boolean;
  /** Changes whenever events come in, for those drawing them. */
  version: number;
}

const fake = !isDesktop && import.meta.env.DEV && import.meta.env.VITE_OUTLOOK !== 'real';

function keptAccount(): OutlookAccount | null {
  try {
    return readJson<OutlookAccount>(localStorage, ACCOUNT);
  } catch {
    return null;
  }
}

let state: State = (() => {
  const account = keptAccount();
  return { status: account ? 'on' : 'off', account, calendars: null, choice: NO_CHOICE, error: null, connecting: false, version: 0 };
})();
const listeners = new Set<() => void>();

function changed() {
  state = { ...state, version: state.version + 1 };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let reader: Source | null = null;
function source(): Source {
  reader ??= fake ? new FakeOutlook() : new OutlookReader({ token });
  return reader;
}

function fail(error: unknown) {
  if (error instanceof RemoteSignedOut) state = { ...state, status: 'signin' };
  else state = { ...state, error: error instanceof Error ? error.message : String(error) };
  changed();
}

async function loadCalendars() {
  if (state.status !== 'on' || !state.account) return;
  try {
    state = { ...state, calendars: await source().calendars(state.account) };
    changed();
    for (const month of wanted.keys()) void loadMonth(month);
  } catch (error) {
    fail(error);
  }
}

/** The events of a calendar in a month, `YYYY-MM`, and when they were read. */
const cache = new Map<string, { at: number; events: OutlookEvent[] }>();
const reading = new Set<string>();
/** The months drawn somewhere now, by how many. */
const wanted = new Map<string, number>();

const monthStart = (month: string) => `${month}-01`;
const monthEnd = (month: string) => addDays(`${nextMonth(month)}-01`, -1);
function nextMonth(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
function monthsOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = nextMonth(month)) out.push(month);
  return out;
}

const shownCalendars = () => (state.choice.events ? (state.calendars ?? []).filter((calendar) => isShown(state.choice, calendar)) : []);

async function loadMonth(month: string, again = false) {
  if (state.status !== 'on') return;
  await Promise.all(
    shownCalendars().map(async (calendar) => {
      const key = `${calendar.id}|${month}`;
      const kept = cache.get(key);
      if (reading.has(key) || (!again && kept && Date.now() - kept.at < FRESH_MS)) return;
      reading.add(key);
      try {
        cache.set(key, { at: Date.now(), events: await source().events(calendar.id, monthStart(month), monthEnd(month)) });
        changed();
      } catch (error) {
        if (isGone(error)) cache.set(key, { at: Date.now(), events: [] });
        else if (error instanceof RemoteSignedOut) fail(error);
        // Offline or busy: what was read stays shown, and is asked again later.
      } finally {
        reading.delete(key);
      }
    }),
  );
}

/** Reads again what is drawn now: every five minutes while the window is seen, and when it comes back. */
function refresh() {
  if (state.status !== 'on' || document.visibilityState !== 'visible') return;
  for (const month of wanted.keys()) void loadMonth(month);
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.setInterval(refresh, FRESH_MS);
}

/** The person's choice, from the personal space, as the app has it: what to show follows it. */
export function setOutlookChoice(choice: CalendarChoice) {
  if (choice === state.choice) return;
  state = { ...state, choice };
  changed();
  for (const month of wanted.keys()) void loadMonth(month);
}

export function useOutlook(): State {
  return useSyncExternalStore(subscribe, () => state);
}

/** How Outlook stands now, outside of drawing. */
export const outlookSnapshot = (): State => state;

/**
 * The events of the calendars shown, from `from` to `to`, both days included: those read, while
 * the rest come in. Reads the months it covers when they are not read yet, or are old.
 */
export function useOutlookEvents(from: string, to: string): OutlookEvent[] {
  const now = useOutlook();
  const months = monthsOf(from, to).join(',');
  useEffect(() => {
    const list = months.split(',');
    for (const month of list) wanted.set(month, (wanted.get(month) ?? 0) + 1);
    if (state.status === 'on' && state.calendars === null) void loadCalendars();
    for (const month of list) void loadMonth(month);
    return () => {
      for (const month of list) {
        const left = (wanted.get(month) ?? 1) - 1;
        if (left > 0) wanted.set(month, left);
        else wanted.delete(month);
      }
    };
  }, [months, now.status, now.calendars, now.choice]);
  if (now.status !== 'on') return [];
  const out: OutlookEvent[] = [];
  const seen = new Set<string>();
  for (const calendar of shownCalendars()) {
    for (const month of monthsOf(from, to)) {
      for (const event of cache.get(`${calendar.id}|${month}`)?.events ?? []) {
        // An event over two months is read with both.
        if (event.lastDay < from || event.day > to || seen.has(`${calendar.id}|${event.id}|${event.day}`)) continue;
        seen.add(`${calendar.id}|${event.id}|${event.day}`);
        out.push(event);
      }
    }
  }
  return out;
}

/** A day's events, in their order: all day first, then by their start. */
export function useOutlookDay(day: string): OutlookEvent[] {
  return eventsOn(useOutlookEvents(day, day), day);
}

/** The color of an event's calendar. */
export const outlookColor = (event: Pick<OutlookEvent, 'calendar'>) => state.calendars?.find((calendar) => calendar.id === event.calendar)?.color ?? '#4f8ff7';

/** Opens an event in Outlook. */
export function openOutlookEvent(event: OutlookEvent) {
  if (!event.link) return;
  if (isDesktop) void openUrlOnDesktop(event.link);
  else window.open(event.link, '_blank', 'noopener');
}

/** Connects Outlook: on the desktop it waits for the system browser; in the browser the page goes to Microsoft and back. */
export async function connectOutlook(): Promise<void> {
  if (state.connecting) return;
  state = { ...state, connecting: true, error: null };
  changed();
  try {
    if (fake) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await signedInWith({ access_token: 'fake', refresh_token: 'fake', expires_in: 3600 });
    } else if (isDesktop) await signInOnDesktop();
    else await leave('connect');
  } catch (error) {
    fail(error);
  } finally {
    state = { ...state, connecting: false };
    changed();
  }
}

/** Disconnects Outlook on this device: the key and the account are forgotten, nothing else. */
export async function disconnectOutlook(): Promise<void> {
  await forgetKey();
  localStorage.removeItem(ACCOUNT);
  cache.clear();
  state = { ...state, status: 'off', account: null, calendars: null, error: null };
  changed();
}

// ---------- a stand-in while developing in the browser ----------

/**
 * Outlook in memory, while developing in the browser: the account's calendars, a shared one among
 * them, and a working week of events around today, so that the screens can be tried.
 */
class FakeOutlook implements Source {
  async me() {
    return { name: 'Test account', email: 'test@example.com' };
  }

  async calendars() {
    return [
      { id: 'cal', name: 'Calendar', color: '#4f8ff7', own: true },
      { id: 'bday', name: 'Birthdays', color: '#c77dd8', own: true },
      { id: 'hol', name: 'Holidays in Turkey', color: '#3fb27f', own: true },
      { id: 'mert', name: 'Mert Kaya', color: '#e0a35a', own: false },
    ];
  }

  async events(calendar: string, from: string, to: string) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const today = dayIn(new Date());
    const out: OutlookEvent[] = [];
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
  }
}
