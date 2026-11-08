import {
  type BackChange,
  type CalendarChoice,
  changeOf,
  type CalendarProviderId,
  dayIn,
  GraphError,
  NO_CHOICE,
  planCalendar,
  RemoteOffline,
  RemoteSignedOut,
  seenAfter,
  syncRange,
  type WantedEvent,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { useSyncExternalStore } from 'react';
import { google } from './google';
import { outlook } from './outlook';

// Scrawl's work into the "Scrawl" calendar of the account it goes to (design/outlook-calendar.md
// 2, 3, 12): a turn when the work changes (a few seconds after, together), when the window comes
// back, and every five minutes while it is seen. Only a device connected to that account writes;
// each keeps the work it saw in the calendar, so that one removed there is not made again.

const STORES = { google, outlook } as const;
const AFTER_CHANGE_MS = 3000;
const EVERY_MS = 5 * 60 * 1000;

/** What What goes lists beside Tasks and Boards: the installed apps, and Collections when there is one outside them. */
export interface SyncRows {
  apps: { path: string; name: string }[];
  collections: boolean;
}

/** How the last turn went: `permission` when the account must let Scrawl write first (Google). */
export type SyncStatus = 'off' | 'syncing' | 'done' | 'signin' | 'permission' | 'failed';

interface SyncState {
  status: SyncStatus;
  error: string | null;
  /** The events Scrawl keeps in the calendar after the last turn. */
  count: number;
  rows: SyncRows;
}

let state: SyncState = { status: 'off', error: null, count: 0, rows: { apps: [], collections: false } };
const listeners = new Set<() => void>();
const set = (next: Partial<SyncState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

let wanted: WantedEvent[] = [];
/** The work is known: no turn runs before, or it would take everything out. */
let known = false;
let choice: CalendarChoice = NO_CHOICE;
let save: (choice: CalendarChoice) => void = () => undefined;

/** The account the work goes to: the chosen one, else the only one connected. */
export function syncTarget(of: CalendarChoice = choice): CalendarProviderId | null {
  if (of.to) return of.to;
  const on = (Object.keys(STORES) as CalendarProviderId[]).filter((id) => STORES[id].snapshot().status !== 'off');
  return on.length === 1 ? on[0]! : null;
}

/** The name of where the work goes, "Google Calendar" or "Outlook"; undefined while none can be told. */
export function calendarTargetName(of: CalendarChoice): string | undefined {
  const to = syncTarget(of);
  return to ? t(to === 'google' ? 'calendars.google' : 'calendars.outlook') : undefined;
}

const seenKey = (to: string, calendar: string) => `scrawl.calendarSeen.${to}.${calendar}`;
/** The work this device saw in the calendar, by its id to its event's. */
function readSeen(to: string, calendar: string): Map<string, string> {
  try {
    const kept = JSON.parse(localStorage.getItem(seenKey(to, calendar)) ?? '{}') as unknown;
    // Slice 2 kept the ids alone: their events are learned again at this turn.
    return new Map(Array.isArray(kept) ? [] : Object.entries(kept as Record<string, string>));
  } catch {
    return new Map();
  }
}
function writeSeen(to: string, calendar: string, seen: Map<string, string>) {
  try {
    localStorage.setItem(seenKey(to, calendar), JSON.stringify(Object.fromEntries(seen)));
  } catch {
    // Not kept: work removed in the calendar may be made again once.
  }
}

/** Writes in Scrawl what the calendar changed, and trashes the work whose event was removed; the ids it could not write. */
type WriteBack = (changes: BackChange[], gone: string[]) => Promise<{ skipped: string[] }>;
let writeBack: WriteBack = async (changes) => ({ skipped: changes.map((change) => change.id) });
/** Work whose Scrawl state goes over the calendar's at the next turns: what was undone after it came back. */
const forced = new Set<string>();

/** How the app writes what comes back (App, with the session and its Undo). */
export function setCalendarBack(write: WriteBack) {
  writeBack = write;
}

/** Undone in Scrawl: the calendar is written over with Scrawl's at the next turn. */
export function forceScrawl(ids: readonly string[]) {
  for (const id of ids) forced.add(id);
  soon(500);
}

let running: Promise<void> | null = null;
let again = false;

async function turn(): Promise<void> {
  if (!known || !choice.sync) {
    if (state.status !== 'off') set({ status: 'off', error: null });
    return;
  }
  const to = syncTarget();
  if (!to) return;
  const store = STORES[to];
  const account = store.snapshot();
  if (account.status === 'signin') return set({ status: 'signin', error: null });
  if (account.status !== 'on' || !account.account) return;
  // A device connected with another account shows that account's events, and does not write.
  if (choice.account && choice.account !== account.account.email) return;
  if (!store.canWrite()) return set({ status: 'permission', error: null });
  set({ status: 'syncing', error: null });
  const writer = store.writer();
  try {
    let calendar = choice.calendar;
    if (!calendar || !(await writer.hasCalendar(calendar))) {
      calendar = await writer.makeCalendar();
      choice = { ...choice, to, account: account.account.email, calendar };
      save(choice);
    } else if (choice.to !== to || choice.account !== account.account.email) {
      choice = { ...choice, to, account: account.account.email };
      save(choice);
    }
    const today = dayIn(new Date());
    const { from, to: until } = syncRange(today);
    const events = await writer.synced(calendar, from, until);
    const seen = readSeen(to, calendar);
    const plan = planCalendar(wanted, events, seen, today);
    const eventOf = new Map(events.filter((event) => event.base).map((event) => [event.base!.id, event.eventId]));
    const wantedOf = new Map(wanted.map((each) => [each.id, each]));
    // Seen work not in the range: moved out of it in the calendar, or removed there.
    const gone: string[] = [];
    for (const { id, eventId } of plan.missing) {
      const found = await writer.find(calendar, eventId);
      const change = found?.base ? changeOf(found.base, found) : null;
      if (found) {
        eventOf.set(id, eventId);
        if (change) plan.back.push(change);
      } else gone.push(id);
    }
    // What was undone in Scrawl after it came back is written over with Scrawl's.
    const back = plan.back.filter((change) => !forced.has(change.id));
    const over = plan.back.filter((change) => forced.has(change.id)).map((change) => change.id);
    const { skipped } = back.length > 0 || gone.length > 0 ? await writeBack(back, gone) : { skipped: [] };
    for (const id of [...over, ...skipped]) {
      const eventId = eventOf.get(id);
      const each = wantedOf.get(id);
      if (eventId && each) plan.update.push({ eventId, wanted: each });
    }
    // shortcut: one request at a time; batch them (Graph's $batch, Google's batch) if hundreds come at once.
    for (const each of plan.create) await writer.create(calendar, each);
    for (const { eventId, wanted: each } of plan.update) {
      await writer.update(calendar, eventId, each);
      forced.delete(each.id);
    }
    for (const event of plan.remove) await writer.remove(calendar, event.eventId);
    writeSeen(to, calendar, seenAfter(plan, events, seen, gone));
    set({ status: 'done', count: events.filter((event) => event.base).length + plan.create.length - plan.remove.length });
  } catch (error) {
    if (error instanceof RemoteSignedOut) set({ status: 'signin' });
    else if (error instanceof GraphError && error.status === 403 && /insufficient/i.test(error.code)) set({ status: 'permission' });
    else if (error instanceof RemoteOffline) set({ status: 'done' });
    else set({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
  }
}

/** Runs a turn, one at a time; one asked for while another runs follows it. */
function run(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = turn().finally(() => {
    running = null;
    if (again) {
      again = false;
      void run();
    }
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;
function soon(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void run();
  }, ms);
}

if (typeof window !== 'undefined') {
  const seen = () => document.visibilityState === 'visible' && soon(500);
  window.addEventListener('focus', seen);
  document.addEventListener('visibilitychange', seen);
  window.setInterval(() => document.visibilityState === 'visible' && void run(), EVERY_MS);
  // An account connected or signed in again: the work goes as soon as it can.
  for (const store of Object.values(STORES)) {
    let was = store.snapshot().status;
    store.subscribe(() => {
      const now = store.snapshot().status;
      if (now !== was && now === 'on') soon(500);
      was = now;
    });
  }
}

/** The person's dated work as it is now, and the rows What goes lists; a turn follows a few seconds after. */
export function setCalendarWork(next: WantedEvent[], rows: SyncRows) {
  if (rows.apps.map((app) => app.path).join('|') !== state.rows.apps.map((app) => app.path).join('|') || rows.collections !== state.rows.collections) set({ rows });
  const same = known && next.length === wanted.length && JSON.stringify(next) === JSON.stringify(wanted);
  wanted = next;
  known = true;
  if (!same) soon(AFTER_CHANGE_MS);
}

/** The choice, from the personal space, and how to keep a change the sync makes to it (the calendar it made). */
export function setSyncChoice(next: CalendarChoice, keep: (choice: CalendarChoice) => void) {
  const was = choice;
  choice = next;
  save = keep;
  if (next.sync !== was.sync || next.to !== was.to || next.calendar !== was.calendar || JSON.stringify(next.goes) !== JSON.stringify(was.goes)) soon(500);
}

/**
 * Takes the "Scrawl" calendar and its events out of the account it is in: syncing is turned off,
 * or goes to the other account. Its device must be connected to that account.
 */
export async function removeScrawlCalendar(of: CalendarChoice): Promise<void> {
  if (!of.to || !of.calendar) return;
  const store = STORES[of.to];
  if (store.snapshot().status !== 'on' || store.snapshot().account?.email !== of.account) return;
  await store.writer().removeCalendar(of.calendar);
  try {
    localStorage.removeItem(seenKey(of.to, of.calendar));
  } catch {
    // Nothing kept.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCalendarSync(): SyncState {
  return useSyncExternalStore(subscribe, () => state);
}