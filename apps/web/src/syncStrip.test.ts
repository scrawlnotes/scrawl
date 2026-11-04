import { describe, expect, it } from 'vitest';
import type { SpaceSyncView, SyncPhase } from './sync';
import { stripOf, type SyncStrip } from './syncWords';

/** The strip's line under its word, as it reads. */
const line = (strip: SyncStrip) => [strip.waiting, strip.sub].filter(Boolean).join(' · ');

const NOW = new Date(2026, 10, 3, 19, 30).getTime();
const HOUR = 60 * 60 * 1000;

function unit(phase: SyncPhase, o: Partial<SpaceSyncView> = {}): SpaceSyncView {
  return { space: null, name: 'Personal', connection: null, phase, syncedAt: NOW - 5 * 60 * 1000, error: null, turn: null, lastDone: null, conflict: null, live: false, why: null, moved: null, notSent: 0, ...o };
}

const turnAt = (share: number) => ({ progress: { stage: 'sending', share, looked: 0, jobs: [], files: { done: 0, total: 0 }, bytes: { done: 0, total: 0 }, current: null }, version: 1, startedAt: NOW, sendingSince: null, endedAt: null, stopped: false }) as unknown as SpaceSyncView['turn'];

describe('stripOf', () => {
  it('shows nothing while all is well, or a turn runs soon after the last', () => {
    expect(stripOf({ all: [unit('idle')] }, NOW)).toBeNull();
    expect(stripOf({ all: [unit('syncing', { turn: turnAt(0.4) })] }, NOW)).toBeNull();
    // A first turn ever has its own look.
    expect(stripOf({ all: [unit('syncing', { syncedAt: null })] }, NOW)).toBeNull();
    expect(stripOf({ all: [] }, NOW)).toBeNull();
  });

  it('says offline and when it last synced', () => {
    const strip = stripOf({ all: [unit('offline', { syncedAt: new Date(2026, 10, 1, 21, 40).getTime() })] }, NOW)!;
    expect(strip.word).toBe('Offline');
    expect(strip.notSent).toBe(0);
    expect(line(strip)).toMatch(/^Last synced Sun, Nov 1, 21:40$/);
  });

  it('says yesterday, and only the time for today', () => {
    expect(line(stripOf({ all: [unit('offline', { syncedAt: new Date(2026, 10, 2, 21, 40).getTime() })] }, NOW)!)).toBe('Last synced yesterday, 21:40');
    expect(line(stripOf({ all: [unit('offline', { syncedAt: new Date(2026, 10, 3, 9, 5).getTime() })] }, NOW)!)).toBe('Last synced 09:05');
  });

  it('counts what waits to go in every space, with the oldest last sync of those that cannot go', () => {
    const strip = stripOf(
      {
        all: [
          unit('offline', { notSent: 14, syncedAt: new Date(2026, 10, 1, 21, 40).getTime() }),
          unit('offline', { space: 'sp-a', name: 'Klinitra', notSent: 1, syncedAt: new Date(2026, 9, 30, 8, 0).getTime() }),
          unit('idle', { space: 'sp-b', name: 'Scrawl' }),
        ],
      },
      NOW,
    )!;
    expect(strip.notSent).toBe(15);
    expect(line(strip)).toBe('15 changes not sent yet · synced Oct 30, 08:00');
    expect(line(stripOf({ all: [unit('offline', { notSent: 1, syncedAt: null })] }, NOW)!)).toBe('1 change not sent yet');
  });

  it('puts a space that cannot go before one in a turn', () => {
    const strip = stripOf({ all: [unit('syncing', { syncedAt: NOW - 3 * HOUR, turn: turnAt(0.4) }), unit('signedOut', { space: 'sp-a', name: 'Klinitra' })] }, NOW)!;
    expect(strip.word).toBe('Signed out');
    expect(strip.share).toBeNull();
  });

  it('shows the first turn after a long gap with its share', () => {
    const strip = stripOf({ all: [unit('syncing', { syncedAt: new Date(2026, 10, 2, 21, 40).getTime(), turn: turnAt(0.38) })] }, NOW)!;
    expect(strip.word).toBe('Syncing 38%');
    expect(strip.share).toBe(0.38);
    expect(line(strip)).toBe('Last synced yesterday, 21:40');
  });
});
