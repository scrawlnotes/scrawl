import {
  type AccountCalendar,
  addDays,
  baseOf,
  eventTitle,
  type SyncedEvent,
  type WantedEvent,
  type CalendarAccount,
  type CalendarChoice,
  type CalendarEvent,
  type CalendarWriter,
  isGone,
  isShown,
  NO_CHOICE,
  RemoteSignedOut,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { useEffect, useSyncExternalStore } from 'react';
import { invoke, pkce, randomText, readJson, type TokenAnswer } from './cloud';
import { isDesktop } from './storage';

// A calendar account in Scrawl, Outlook's or Google's (design/outlook-calendar.md 4, 11.1): a
// sign-in of its own, apart from OneDrive's and Drive's, and the events of the calendars the person
// shows, read when they are drawn and never kept. On the desktop the key is in the credential
// store; in the browser in this browser's storage. Outlook and Google differ only in what
// `CalendarProvider` gives.

/** Events are read again after this long, and when the window comes back. */
const FRESH_MS = 5 * 60 * 1000;
/** For a key that ends a day after its sign-in: renewed by signing in again after this long. */
const RENEW_AFTER_MS = 20 * 60 * 60 * 1000;

/** Whether the account is connected here, and whether it wants its sign-in again. */
export type CalendarStatus = 'off' | 'on' | 'signin';

export interface CalendarSource {
  me(): Promise<CalendarAccount>;
  calendars(account: CalendarAccount): Promise<AccountCalendar[]>;
  events(calendar: string, from: string, to: string): Promise<CalendarEvent[]>;
}

type Tokens = TokenAnswer & { access_token: string };

export interface CalendarProvider {
  /** Its storage names and its words: `outlook.*`, `google.*`. */
  id: 'outlook' | 'google';
  /** The key's name in the desktop's credential store. */
  secret: string;
  /** Where the sign-in starts, coming back to `redirect`. */
  authorizeUrl(redirect: string, state: string, challenge: string, extra: Record<string, string>): string;
  /** The address the desktop's listener on `port` takes the answer at. */
  desktopRedirect(port: number): string;
  /** Asks for tokens: for a code, or with the key. */
  tokens(form: Record<string, string>): Promise<Tokens>;
  /** What a first sign-in adds to the address, and one that renews it. */
  connect: Record<string, string>;
  renew(email?: string): Record<string, string>;
  /** In the browser, whether the key lasts a day only and is renewed by signing in again (Microsoft's). */
  renewsByLeaving: boolean;
  reader(token: (fresh: boolean) => Promise<string>): CalendarSource;
  /** Writing Scrawl's work to its "Scrawl" calendar there, in the device's zone. */
  writer(token: (fresh: boolean) => Promise<string>, timeZone: string): CalendarWriter;
  /** The permission writing needs beyond reading, asked for when syncing first goes there (Google's); none when reading's covers it. */
  write?: { scope: string; extra(email?: string): Record<string, string> };
  /** A stand-in, while developing in the browser; none for the real account. */
  fake: CalendarSource | null;
}

interface Pending {
  verifier: string;
  state: string;
  intent: 'connect' | 'renew';
  redirect: string;
}

export interface CalendarState {
  id: CalendarProvider['id'];
  status: CalendarStatus;
  account: CalendarAccount | null;
  /** The account's calendars, null till read. */
  calendars: AccountCalendar[] | null;
  choice: CalendarChoice;
  /** Why the last sign-in did not go through. */
  error: string | null;
  connecting: boolean;
  /** Changes whenever events come in, for those drawing them. */
  version: number;
}

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

export type CalendarAccountStore = ReturnType<typeof calendarAccount>;

export function calendarAccount(p: CalendarProvider) {
  /** On this device: the account connected, for its name and its email. */
  const ACCOUNT = `scrawl.${p.id}Account`;
  /** In the browser: the key and when it was given, and a sign-in waiting for the page to come back. */
  const BROWSER_KEY = `scrawl.${p.id}Key`;
  const PENDING = `scrawl.${p.id}SignIn`;
  const RENEWED = `scrawl.${p.id}Renewed`;
  /** What the account granted, as its answers say (Google's), for whether it may write. */
  const SCOPES = `scrawl.${p.id}Scopes`;
  const fake = p.fake;

  // ---------- the key ----------

  let access: { token: string; until: number } | null = null;
  let asking: Promise<string> | null = null;

  async function keptKey(): Promise<string | null> {
    if (isDesktop) return invoke<string | null>('secret_get', { name: p.secret });
    return readJson<{ key: string }>(localStorage, BROWSER_KEY)?.key ?? null;
  }

  async function keepKey(key: string, fresh: boolean) {
    if (isDesktop) return invoke('secret_set', { name: p.secret, value: key });
    // A renewed key ends when the first one does, a day after the sign-in, where keys do.
    const since = fresh ? Date.now() : (readJson<{ since: number }>(localStorage, BROWSER_KEY)?.since ?? Date.now());
    try {
      localStorage.setItem(BROWSER_KEY, JSON.stringify({ key, since }));
    } catch {
      // Not kept: the next reading asks to sign in again.
    }
  }

  async function forgetKey() {
    access = null;
    if (isDesktop) await invoke('secret_delete', { name: p.secret }).catch(() => undefined);
    else localStorage.removeItem(BROWSER_KEY);
  }

  function keepAccess(answer: Tokens) {
    access = { token: answer.access_token, until: Date.now() + ((answer.expires_in ?? 3600) - 60) * 1000 };
    try {
      if (answer.scope) localStorage.setItem(SCOPES, answer.scope);
    } catch {
      // Not kept: writing is asked for again.
    }
  }

  /** Whether the account lets Scrawl write its "Scrawl" calendar. */
  const canWrite = () => !!fake || !p.write || (localStorage.getItem(SCOPES) ?? '').split(' ').includes(p.write.scope);

  async function renew(): Promise<string> {
    const key = await keptKey();
    if (!key) throw new RemoteSignedOut();
    const answer = await p.tokens({ grant_type: 'refresh_token', refresh_token: key });
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
  async function signedInWith(answer: Tokens) {
    if (!answer.refresh_token) throw new Error(t(`${p.id}.noKey`));
    await keepKey(answer.refresh_token, true);
    keepAccess(answer);
    const account = await source().me();
    localStorage.setItem(ACCOUNT, JSON.stringify(account));
    state = { ...state, status: 'on', account, calendars: null, error: null };
    cache.clear();
    changed();
    void loadCalendars();
  }

  /** In the browser: takes the page to the account's sign-in; it comes back to `prepare`. */
  async function leave(intent: Pending['intent'], email?: string, more: Record<string, string> = {}): Promise<boolean> {
    const { verifier, challenge } = await pkce();
    const at = randomText(16);
    const redirect = `${window.location.origin}/`;
    try {
      sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state: at, intent, redirect } satisfies Pending));
    } catch {
      return false;
    }
    window.location.assign(p.authorizeUrl(redirect, at, challenge, { ...(intent === 'renew' ? p.renew(email) : p.connect), ...more }));
    return true;
  }

  /** On the desktop: the system browser, and the answer caught on this computer. */
  async function signInOnDesktop(more: Record<string, string> = {}) {
    const { verifier, challenge } = await pkce();
    const at = randomText(16);
    const port = await invoke<number>('oauth_listen');
    const redirect = p.desktopRedirect(port);
    await invoke('open_url', { url: p.authorizeUrl(redirect, at, challenge, { ...p.connect, ...more }) });
    const code = await invoke<string>('oauth_wait', { port, state: at, pages: { done: t(`${p.id}.browserDone`), failed: t('cloud.browserFailed') } });
    await signedInWith(await p.tokens({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier }));
  }

  /**
   * Before the app is drawn, in the browser: a sign-in that went to the account and came back is
   * finished; or a key getting old is renewed, the page leaving for it, once a session and only
   * online. Returns false when the page is leaving.
   */
  async function prepare(): Promise<boolean> {
    if (isDesktop || fake) return true;
    const params = new URLSearchParams(window.location.search);
    const pending = readJson<Pending>(sessionStorage, PENDING);
    if (pending && (params.has('code') || params.has('error')) && params.get('state') === pending.state) {
      sessionStorage.removeItem(PENDING);
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      const code = params.get('code');
      if (code) {
        void p
          .tokens({ grant_type: 'authorization_code', code, redirect_uri: pending.redirect, code_verifier: pending.verifier })
          .then(signedInWith)
          .catch((error: unknown) => fail(error));
      } else if (pending.intent === 'renew') {
        state = { ...state, status: 'signin' };
      } else {
        state = { ...state, error: params.get('error_description')?.split('\n')[0] || params.get('error') };
      }
      return true;
    }
    if (!p.renewsByLeaving) return true;
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

  function keptAccount(): CalendarAccount | null {
    try {
      return readJson<CalendarAccount>(localStorage, ACCOUNT);
    } catch {
      return null;
    }
  }

  let state: CalendarState = (() => {
    const account = keptAccount();
    return { id: p.id, status: account ? 'on' : 'off', account, calendars: null, choice: NO_CHOICE, error: null, connecting: false, version: 0 };
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

  let reader: CalendarSource | null = null;
  function source(): CalendarSource {
    reader ??= fake ?? p.reader(token);
    return reader;
  }

  function fail(error: unknown) {
    if (error instanceof RemoteSignedOut) state = { ...state, status: 'signin' };
    else state = { ...state, error: error instanceof Error ? error.message : String(error) };
    changed();
  }

  let readingCalendars: Promise<void> | null = null;
  /** Reads the account's calendars, once at a time. */
  function loadCalendars(): Promise<void> {
    if (state.status !== 'on' || !state.account) return Promise.resolve();
    const account = state.account;
    readingCalendars ??= (async () => {
      try {
        state = { ...state, calendars: await source().calendars(account) };
        changed();
        for (const month of wanted.keys()) void loadMonth(month);
      } catch (error) {
        fail(error);
      } finally {
        readingCalendars = null;
      }
    })();
    return readingCalendars;
  }

  /** The events of a calendar in a month, `YYYY-MM`, and when they were read. */
  const cache = new Map<string, { at: number; events: CalendarEvent[] }>();
  const reading = new Set<string>();
  /** The months drawn somewhere now, by how many. */
  const wanted = new Map<string, number>();

  // The "Scrawl" calendar is not shown: what is in it is Scrawl's own, there already.
  const shownCalendars = () =>
    state.choice.events ? (state.calendars ?? []).filter((calendar) => calendar.id !== state.choice.calendar && isShown(state.choice, calendar)) : [];

  /** Writing to the account, in-memory while developing. */
  let written: CalendarWriter | null = null;
  const writer = (): CalendarWriter => {
    written ??= fake ? fakeWriter() : p.writer(token, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return written;
  };

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

  return {
    id: p.id,
    prepare,

    /** The person's choice, from the personal space, as the app has it: what to show follows it. */
    setChoice(choice: CalendarChoice) {
      if (choice === state.choice) return;
      state = { ...state, choice };
      changed();
      for (const month of wanted.keys()) void loadMonth(month);
    },

    /** The account as it stands; its calendars are read when they are not yet, as Settings shows them before any day. */
    use(): CalendarState {
      const now = useSyncExternalStore(subscribe, () => state);
      useEffect(() => {
        if (now.status === 'on' && now.calendars === null) void loadCalendars();
      }, [now.status, now.calendars]);
      return now;
    },

    /** How the account stands now, outside of drawing. */
    snapshot: (): CalendarState => state,
    subscribe,

    /**
     * The events of the calendars shown, from `from` to `to`, both days included: those read, while
     * the rest come in. Reads the months it covers when they are not read yet, or are old.
     */
    useEvents(from: string, to: string): CalendarEvent[] {
      const now = useSyncExternalStore(subscribe, () => state);
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
      const out: CalendarEvent[] = [];
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
    },

    /** The color of one of its calendars; undefined for a calendar not its own. */
    colorOf: (calendar: string) => state.calendars?.find((each) => each.id === calendar)?.color,

    canWrite,
    writer,

    /**
     * Connects the account: on the desktop it waits for the system browser; in the browser the
     * page goes to sign in and back. With `write`, it asks for writing too (Google's).
     */
    async connect(write = false): Promise<void> {
      if (state.connecting) return;
      state = { ...state, connecting: true, error: null };
      changed();
      const more = write && p.write ? p.write.extra(state.account?.email) : {};
      try {
        if (fake) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          await signedInWith({ access_token: 'fake', refresh_token: 'fake', expires_in: 3600 });
        } else if (isDesktop) await signInOnDesktop(more);
        else await leave('connect', undefined, more);
      } catch (error) {
        fail(error);
      } finally {
        state = { ...state, connecting: false };
        changed();
      }
    },

    /** Disconnects on this device: the key and the account are forgotten, nothing else. */
    async disconnect(): Promise<string | null> {
      const key = await keptKey().catch(() => null);
      await forgetKey();
      localStorage.removeItem(ACCOUNT);
      localStorage.removeItem(SCOPES);
      cache.clear();
      state = { ...state, status: 'off', account: null, calendars: null, error: null };
      changed();
      return key;
    },
  };
}

/** A "Scrawl" calendar in memory, while developing in the browser. */
function fakeWriter(): CalendarWriter {
  const events = new Map<string, SyncedEvent>();
  const kept = (eventId: string, wanted: WantedEvent): SyncedEvent => ({
    eventId,
    base: baseOf(wanted),
    title: eventTitle(wanted),
    day: wanted.day,
    ...(wanted.start && { start: wanted.start }),
    ...(wanted.end && { end: wanted.end }),
  });
  let made = 0;
  return {
    async makeCalendar() {
      return `fake-scrawl-${++made}`;
    },
    async hasCalendar() {
      return true;
    },
    async removeCalendar() {
      events.clear();
    },
    async synced(_calendar, from, to) {
      return [...events.values()].filter((each) => each.day >= from && each.day <= to);
    },
    async find(_calendar, eventId) {
      return events.get(eventId) ?? null;
    },
    async create(_calendar, wanted) {
      events.set(wanted.id, kept(wanted.id, wanted));
    },
    async update(_calendar, eventId, wanted) {
      events.set(eventId, kept(eventId, wanted));
    },
    async remove(_calendar, eventId) {
      events.delete(eventId);
    },
  };
}
