import { describe, expect, it } from 'vitest';
import { atMinutes, layoutDay, minutesBetween, minutesOfDay, weekDays, weekStart } from './calendar';

describe('the calendar', () => {
  it('has a week from its Monday', () => {
    expect(weekStart('2026-10-22')).toBe('2026-10-19');
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(weekDays('2026-11-01')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('works with minutes of a day', () => {
    expect(minutesOfDay('2026-10-22T14:30')).toBe(870);
    expect(minutesOfDay('2026-10-22')).toBeNull();
    expect(atMinutes('2026-10-22', 870)).toBe('2026-10-22T14:30');
    expect(atMinutes('2026-10-22', 1440 + 60)).toBe('2026-10-23T01:00');
    expect(minutesBetween('2026-10-22T14:30', '2026-10-22T16:00')).toBe(90);
    expect(minutesBetween('2026-10-22T23:00', '2026-10-23T01:00')).toBe(120);
  });

  it('lays a day out: a box from its start to its end, side by side with those at the same time', () => {
    const day = '2026-10-22';
    const boxes = layoutDay(
      [
        { item: 'inspection', start: '2026-10-22' },
        { item: 'door', start: '2026-10-22T09:00', minutes: 45 },
        { item: 'maintenance', start: '2026-10-22T14:30', end: '2026-10-22T16:00' },
        { item: 'call', start: '2026-10-22T15:00', minutes: 30 },
        { item: 'review', start: '2026-10-22T15:45' },
        { item: 'night', start: '2026-10-21T22:00', end: '2026-10-22T02:00' },
        { item: 'tomorrow', start: '2026-10-23T10:00' },
      ],
      day,
    ).map((b) => [b.item, b.from, b.to, b.col, b.cols]);
    expect(boxes).toEqual([
      ['night', 0, 120, 0, 1],
      ['door', 540, 585, 0, 1],
      ['maintenance', 870, 960, 0, 2],
      ['call', 900, 930, 1, 2],
      ['review', 945, 975, 1, 2],
    ]);
    // A box that began the day before goes on to its end; one that ends at midnight is not on the next day.
    expect(layoutDay([{ item: 'late', start: '2026-10-21T23:00', end: '2026-10-22T00:00' }], day)).toEqual([]);
  });
});
