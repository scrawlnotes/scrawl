// The public holidays a team's leave is counted without (design/more-apps.md 3.3): of Turkey, the
// United States, the United Kingdom (England and Wales) and Germany, by the year. The days that
// follow a rule are worked out; the feasts of the Islamic calendar are as Diyanet announces them,
// for the years that are known. Half days are left out.

export const HOLIDAY_COUNTRIES = ['tr', 'us', 'gb', 'de'] as const;

export type HolidayCountry = (typeof HOLIDAY_COUNTRIES)[number];

export interface Holiday {
  name: string;
  /** `YYYY-MM-DD`. */
  day: string;
}

/** The first days of Ramazan Bayramı and Kurban Bayramı, as Diyanet announced them. */
const TR_FEASTS: { [year: number]: { ramadan: string; sacrifice: string } } = {
  2026: { ramadan: '2026-03-20', sacrifice: '2026-05-27' },
  2027: { ramadan: '2027-03-09', sacrifice: '2027-05-16' },
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const at = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const weekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** The `n`th weekday (0 Sunday) of a month; with a negative `n`, counted from its end. */
function nth(year: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = at(year, month, 1);
    return plus(first, ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = at(year, month + 1, 0);
  return plus(last, -((last.getUTCDay() - weekday + 7) % 7) + (n + 1) * 7);
}

/** Easter Sunday of the Gregorian calendar. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return at(year, month, ((h + l - 7 * m + 114) % 31) + 1);
}

function turkey(year: number): [string, Date][] {
  const days: [string, Date][] = [
    ["New Year's Day", at(year, 1, 1)],
    ["National Sovereignty and Children's Day", at(year, 4, 23)],
    ['Labour and Solidarity Day', at(year, 5, 1)],
    ['Commemoration of Atatürk, Youth and Sports Day', at(year, 5, 19)],
    ['Democracy and National Unity Day', at(year, 7, 15)],
    ['Victory Day', at(year, 8, 30)],
    ['Republic Day', at(year, 10, 29)],
  ];
  const feasts = TR_FEASTS[year];
  if (feasts) {
    const ramadan = new Date(`${feasts.ramadan}T00:00:00Z`);
    const sacrifice = new Date(`${feasts.sacrifice}T00:00:00Z`);
    for (let i = 0; i < 3; i++) days.push([`Ramadan Feast, day ${i + 1}`, plus(ramadan, i)]);
    for (let i = 0; i < 4; i++) days.push([`Feast of Sacrifice, day ${i + 1}`, plus(sacrifice, i)]);
  }
  return days;
}

/** A federal holiday on a Saturday is kept on the Friday before, on a Sunday on the Monday after. */
const observed = (d: Date) => (d.getUTCDay() === 6 ? plus(d, -1) : d.getUTCDay() === 0 ? plus(d, 1) : d);

function unitedStates(year: number): [string, Date][] {
  return [
    ["New Year's Day", observed(at(year, 1, 1))],
    ['Martin Luther King Jr. Day', nth(year, 1, 1, 3)],
    ["Washington's Birthday", nth(year, 2, 1, 3)],
    ['Memorial Day', nth(year, 5, 1, -1)],
    ['Juneteenth', observed(at(year, 6, 19))],
    ['Independence Day', observed(at(year, 7, 4))],
    ['Labor Day', nth(year, 9, 1, 1)],
    ['Columbus Day', nth(year, 10, 1, 2)],
    ['Veterans Day', observed(at(year, 11, 11))],
    ['Thanksgiving Day', nth(year, 11, 4, 4)],
    ['Christmas Day', observed(at(year, 12, 25))],
  ];
}

function unitedKingdom(year: number): [string, Date][] {
  const sunday = easter(year);
  const days: [string, Date][] = [
    ['Good Friday', plus(sunday, -2)],
    ['Easter Monday', plus(sunday, 1)],
    ['Early May bank holiday', nth(year, 5, 1, 1)],
    ['Spring bank holiday', nth(year, 5, 1, -1)],
    ['Summer bank holiday', nth(year, 8, 1, -1)],
  ];
  // A bank holiday on a weekend is kept on the next weekday that is not one already.
  const taken = new Set<string>();
  const substitute = (d: Date) => {
    let day = d;
    while (weekend(day) || taken.has(iso(day))) day = plus(day, 1);
    taken.add(iso(day));
    return day;
  };
  days.unshift(["New Year's Day", substitute(at(year, 1, 1))]);
  days.push(['Christmas Day', substitute(at(year, 12, 25))], ['Boxing Day', substitute(at(year, 12, 26))]);
  return days;
}

function germany(year: number): [string, Date][] {
  const sunday = easter(year);
  return [
    ["New Year's Day", at(year, 1, 1)],
    ['Good Friday', plus(sunday, -2)],
    ['Easter Monday', plus(sunday, 1)],
    ['Labour Day', at(year, 5, 1)],
    ['Ascension Day', plus(sunday, 39)],
    ['Whit Monday', plus(sunday, 50)],
    ['German Unity Day', at(year, 10, 3)],
    ['Christmas Day', at(year, 12, 25)],
    ['Second Day of Christmas', at(year, 12, 26)],
  ];
}

const BY_COUNTRY: { [country in HolidayCountry]: (year: number) => [string, Date][] } = { tr: turkey, us: unitedStates, gb: unitedKingdom, de: germany };

/** A country's public holidays of a year, in their order. */
export function publicHolidays(country: HolidayCountry, year: number): Holiday[] {
  return BY_COUNTRY[country](year)
    .map(([name, d]) => ({ name, day: iso(d) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}
