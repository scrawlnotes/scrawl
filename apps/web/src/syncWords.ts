import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import type { SpaceSync, SyncPhase } from './sync';

// How sync is said in a few words: how long ago, a share, a space's word on a phone, and the
// strip over a phone's tab bar. Plain words with no screen, so they can be tested alone.

/** How long ago a moment was, as the status bar and the settings say it. */
export function ago(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 5) return t('ago.now');
  if (seconds < 60) return t('ago.seconds', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? t('ago.hours', { count: hours }) : t('ago.days', { count: Math.floor(hours / 24) });
}

/** A share as the language writes it, never 100% before the end: `38%`. */
export function percent(share: number): string {
  return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 0 }).format(Math.min(0.99, Math.floor(share * 100) / 100));
}

/** A space's sync in a word on a phone: `12 s ago`, `38%`, or what keeps it from going on. */
const SHORT: Record<Exclude<SyncPhase, 'off' | 'idle' | 'syncing'>, MessageKey> = {
  offline: 'sync.offline',
  signedOut: 'phone.signedOut',
  folderGone: 'phone.folderGone',
  moved: 'phone.moved',
  update: 'phone.update',
  failed: 'phone.syncFailed',
};

/** How a space's sync stands in a word, and whether something keeps it from going on. */
export function shortOf({ phase, syncedAt, turn, connection, why }: SpaceSync): { text: string; bad: boolean } {
  if (phase === 'syncing') return { text: percent(turn?.progress.share ?? 0), bad: false };
  if (phase === 'off' || phase === 'idle') return { text: syncedAt === null ? t('sync.notYet') : ago(syncedAt), bad: false };
  if (phase === 'signedOut' && connection?.server && why === 'notYet') return { text: t('sync.notSignedInShort'), bad: true };
  return { text: phase === 'folderGone' && connection?.server ? t(why === 'removed' ? 'phone.removed' : 'phone.spaceGone') : t(SHORT[phase]), bad: true };
}

/** A turn after this long a gap shows over a phone's tab bar while it runs; the usual turns do not. */
const LONG_GAP_MS = 60 * 60 * 1000;

/** When a space last synced, as the strip says it: `21:40`, `yesterday, 21:40`, `Sun, Nov 2, 21:40`; `Nov 2, 21:40` short. */
export function syncedWhen(at: number, now: number, short = false): string {
  const day = new Date(at);
  const time = day.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return time;
  if (day.toDateString() === yesterday.toDateString()) return t('sync.yesterdayAt', { time });
  const date = day.toLocaleDateString(locale(), { ...(!short && { weekday: 'short' }), month: 'short', day: 'numeric', ...(day.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
  return `${date}, ${time}`;
}

/** What the strip over a phone's tab bar says: its word; under it what waits to go and when it last synced; a turn's share. */
export interface SyncStrip {
  word: string;
  /** `14 changes not sent yet`, null when nothing waits. */
  waiting: string | null;
  sub: string | null;
  notSent: number;
  share: number | null;
}

/**
 * The strip over a phone's tab bar (design/sync-strip.md): while a space cannot sync, its word,
 * how many files wait to go here in every space, and the oldest last sync; else, in the first
 * turn after a long gap, its share. Null when all is well.
 */
export function stripOf(sync: { all: readonly SpaceSync[] }, now = Date.now()): SyncStrip | null {
  const stuck = sync.all.filter((unit) => shortOf(unit).bad);
  const oldest = (units: readonly SpaceSync[]) => units.reduce<number | null>((min, unit) => (unit.syncedAt !== null && (min === null || unit.syncedAt < min) ? unit.syncedAt : min), null);
  if (stuck.length > 0) {
    const notSent = sync.all.reduce((sum, unit) => sum + unit.notSent, 0);
    const at = oldest(stuck);
    // What waits to go comes first; then the last sync, short beside it.
    const waiting = notSent > 0 ? t('sync.notSent', { count: notSent }) : null;
    const sub = at === null ? (waiting ? null : t('sync.notYet')) : waiting ? t('sync.syncedWhen', { when: syncedWhen(at, now, true) }) : t('sync.lastSynced', { when: syncedWhen(at, now) });
    return { word: shortOf(stuck[0]!).text, waiting, sub, notSent, share: null };
  }
  // A first turn ever has its own look where the space's files go; only one after a long gap shows here.
  const gap = sync.all.find((unit) => unit.phase === 'syncing' && unit.syncedAt !== null && now - unit.syncedAt > LONG_GAP_MS);
  if (!gap) return null;
  const share = gap.turn?.progress.share ?? 0;
  return { word: t('sync.syncingPct', { pct: percent(share) }), waiting: null, sub: t('sync.lastSynced', { when: syncedWhen(gap.syncedAt!, now) }), notSent: 0, share };
}
