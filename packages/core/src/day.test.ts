import { describe, expect, it } from 'vitest';
import { isDay } from './day';

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
});
