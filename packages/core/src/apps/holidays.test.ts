import { describe, expect, it } from 'vitest';
import { publicHolidays } from './holidays';

const days = (country: Parameters<typeof publicHolidays>[0], year: number) => publicHolidays(country, year).map((h) => `${h.day} ${h.name}`);

describe('public holidays', () => {
  it('has Turkey’s, with the feasts of the years Diyanet announced', () => {
    expect(days('tr', 2026)).toEqual([
      "2026-01-01 New Year's Day",
      '2026-03-20 Ramadan Feast, day 1',
      '2026-03-21 Ramadan Feast, day 2',
      '2026-03-22 Ramadan Feast, day 3',
      "2026-04-23 National Sovereignty and Children's Day",
      '2026-05-01 Labour and Solidarity Day',
      '2026-05-19 Commemoration of Atatürk, Youth and Sports Day',
      '2026-05-27 Feast of Sacrifice, day 1',
      '2026-05-28 Feast of Sacrifice, day 2',
      '2026-05-29 Feast of Sacrifice, day 3',
      '2026-05-30 Feast of Sacrifice, day 4',
      '2026-07-15 Democracy and National Unity Day',
      '2026-08-30 Victory Day',
      '2026-10-29 Republic Day',
    ]);
    expect(days('tr', 2027).filter((d) => d.includes('Feast'))).toEqual([
      '2027-03-09 Ramadan Feast, day 1',
      '2027-03-10 Ramadan Feast, day 2',
      '2027-03-11 Ramadan Feast, day 3',
      '2027-05-16 Feast of Sacrifice, day 1',
      '2027-05-17 Feast of Sacrifice, day 2',
      '2027-05-18 Feast of Sacrifice, day 3',
      '2027-05-19 Feast of Sacrifice, day 4',
    ]);
    // A year whose feasts are not announced yet has the ones of the calendar.
    expect(days('tr', 2028)).toHaveLength(7);
  });

  it('works out the ones of a rule: a weekday of a month, Easter, a day kept on a weekday', () => {
    expect(days('us', 2026)).toEqual([
      "2026-01-01 New Year's Day",
      '2026-01-19 Martin Luther King Jr. Day',
      "2026-02-16 Washington's Birthday",
      '2026-05-25 Memorial Day',
      '2026-06-19 Juneteenth',
      // The 4th of July is a Saturday: kept on the Friday.
      '2026-07-03 Independence Day',
      '2026-09-07 Labor Day',
      '2026-10-12 Columbus Day',
      '2026-11-11 Veterans Day',
      '2026-11-26 Thanksgiving Day',
      '2026-12-25 Christmas Day',
    ]);
    expect(days('gb', 2026)).toEqual([
      "2026-01-01 New Year's Day",
      '2026-04-03 Good Friday',
      '2026-04-06 Easter Monday',
      '2026-05-04 Early May bank holiday',
      '2026-05-25 Spring bank holiday',
      '2026-08-31 Summer bank holiday',
      '2026-12-25 Christmas Day',
      // Boxing Day is a Saturday: the Monday after.
      '2026-12-28 Boxing Day',
    ]);
    // Christmas on a Saturday and Boxing Day on a Sunday: the Monday and the Tuesday.
    expect(days('gb', 2027).slice(-2)).toEqual(['2027-12-27 Christmas Day', '2027-12-28 Boxing Day']);
    expect(days('de', 2026)).toEqual([
      "2026-01-01 New Year's Day",
      '2026-04-03 Good Friday',
      '2026-04-06 Easter Monday',
      '2026-05-01 Labour Day',
      '2026-05-14 Ascension Day',
      '2026-05-25 Whit Monday',
      '2026-10-03 German Unity Day',
      '2026-12-25 Christmas Day',
      '2026-12-26 Second Day of Christmas',
    ]);
  });
});
