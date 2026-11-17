import { t } from '@scrawlnotes/i18n';
import { ago } from './syncWords';

// What a calendar account says of itself, as Todoist's Accounts row does ("Syncing…"): under its
// address in Settings › Calendars, and on its row in the sync window. A problem says how it is
// put right: signing in again, or letting Scrawl write its "Scrawl" calendar.

export interface AccountLine {
  text: string;
  tone: 'busy' | 'ok' | 'bad' | 'plain';
  fix?: 'signin' | 'allow';
}

export interface LineInput {
  /** The account on this device: connected, or wanting its sign-in again. */
  status: 'off' | 'on' | 'signin';
  /** Why its last sign-in did not go through. */
  error: string | null;
  /** "In this browser", "On this computer". */
  where: string;
  /** Tasks sync to this account. */
  target: boolean;
  canWrite: boolean;
  sync: { status: 'off' | 'syncing' | 'done' | 'signin' | 'permission' | 'failed'; error: string | null; at: number | null };
  now?: number;
}

export function accountLine({ status, error, where, target, canWrite, sync, now = Date.now() }: LineInput): AccountLine {
  if (status === 'signin' || (target && sync.status === 'signin')) return { text: t('calendars.signInAgain'), tone: 'bad', fix: 'signin' };
  if (error) return { text: error, tone: 'bad' };
  if (!target) return { text: where, tone: 'plain' };
  if (!canWrite || sync.status === 'permission') return { text: t('calendars.cantWrite'), tone: 'bad', fix: 'allow' };
  if (sync.status === 'failed') return { text: t('calendars.failedShort', { error: sync.error ?? '' }), tone: 'bad' };
  if (sync.status === 'done' && sync.at !== null) return { text: `${t('sync.syncedAgo', { ago: ago(sync.at, now) })} · ${where}`, tone: 'ok' };
  return { text: t('calendars.syncing'), tone: 'busy' };
}
