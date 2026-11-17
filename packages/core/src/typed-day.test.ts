import { describe, expect, it } from 'vitest';
import { dayInText, dayOfWords, withoutDay } from './typed-day';

// Tuesday, 17 November 2026.
const today = '2026-11-17';
const day = (text: string) => dayInText(text, today)?.day ?? null;

describe('a day written in words', () => {
  it('is read from the words Todoist knows', () => {
    expect(day('today')).toBe('2026-11-17');
    expect(day('Tomorrow')).toBe('2026-11-18');
    expect(day('next week')).toBe('2026-11-23');
    expect(day('this weekend')).toBe('2026-11-21');
    expect(day('weekend')).toBe('2026-11-21');
    expect(day('next month')).toBe('2026-12-01');
    expect(day('in 3 days')).toBe('2026-11-20');
    expect(day('in a week')).toBe('2026-11-24');
    expect(day('in two weeks')).toBe('2026-12-01');
    expect(day('in 1 month')).toBe('2026-12-17');
    expect(day('2027-01-05')).toBe('2027-01-05');
  });

  it('takes a weekday as the next one, never today', () => {
    expect(day('wed')).toBe('2026-11-18');
    expect(day('fri')).toBe('2026-11-20');
    expect(day('Friday')).toBe('2026-11-20');
    expect(day('tue')).toBe('2026-11-24');
    expect(day('mon')).toBe('2026-11-23');
    expect(day('next fri')).toBe('2026-11-27');
    expect(day('next monday')).toBe('2026-11-23');
  });

  it('takes a date either way round, next year once it went by', () => {
    expect(day('dec 3')).toBe('2026-12-03');
    expect(day('3 dec')).toBe('2026-12-03');
    expect(day('December 3rd')).toBe('2026-12-03');
    expect(day('3rd of december')).toBe('2026-12-03');
    expect(day('nov 17')).toBe('2026-11-17');
    expect(day('nov 16')).toBe('2027-11-16');
    expect(day('jan 5 2028')).toBe('2028-01-05');
    expect(day('feb 29')).toBe('2028-02-29');
    expect(day('feb 30')).toBeNull();
    expect(day('apr 31 2027')).toBeNull();
  });

  it('is found in a name, with "on" before it, and not inside other words', () => {
    expect(dayInText('Call Ana on fri', today)).toEqual({ day: '2026-11-20', from: 9, to: 15 });
    expect(dayInText('Pay rent dec 1 please', today)).toEqual({ day: '2026-12-01', from: 9, to: 14 });
    for (const text of ['Fried rice', 'Sundays off', "Today's agenda", 'Monitor the logs', 'Decide', 'May I', 'Buy 3 dec']) {
      expect(day(text), text).toBe(text === 'Buy 3 dec' ? '2026-12-03' : null);
    }
  });

  it('takes the first day written, the longest where two start together', () => {
    expect(dayInText('next fri or tomorrow', today)).toEqual({ day: '2026-11-27', from: 0, to: 8 });
  });

  it('is a whole date box only when all of it is a day', () => {
    expect(dayOfWords('  dec 3 ', today)).toBe('2026-12-03');
    expect(dayOfWords('dec 3 x', today)).toBeNull();
    expect(dayOfWords('', today)).toBeNull();
  });

  it('leaves a name without its words', () => {
    const text = 'Call Ana on fri about it';
    expect(withoutDay(text, dayInText(text, today)!)).toBe('Call Ana about it');
  });
});
