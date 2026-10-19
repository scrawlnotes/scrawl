import { describe, expect, it } from 'vitest';
import { dayIn, isDay, isTimeZone, wallClock } from './day';
import { stamp } from './paths';

describe('a day', () => {
  it('is on the calendar', () => {
    expect(isDay('2026-10-19')).toBe(true);
    expect(isDay('2024-02-29')).toBe(true);
    expect(isDay('2000-02-29')).toBe(true);
    expect(isDay('2026-12-31')).toBe(true);
    for (const day of ['2025-02-29', '1900-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-10-00', '19.10.2026', '2026-1-5', '2026-10-19T10:00', '']) {
      expect(isDay(day), day).toBe(false);
    }
  });

  it('is the one of a time zone, whatever the device’s own', () => {
    // 22:30 in London's winter is 01:30 the next day in Istanbul.
    const late = new Date(Date.UTC(2026, 10, 19, 22, 30, 5));
    expect(dayIn(late, 'Europe/Istanbul')).toBe('2026-11-20');
    expect(dayIn(late, 'UTC')).toBe('2026-11-19');
    expect(dayIn(late, 'America/New_York')).toBe('2026-11-19');
    expect(stamp(wallClock(late, 'Europe/Istanbul'))).toBe('2026-11-20 013005');
    expect(wallClock(late)).toBe(late);
    expect(wallClock(late, 'Mars/Olympus')).toBe(late);
    expect(isTimeZone('Europe/Istanbul')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});
