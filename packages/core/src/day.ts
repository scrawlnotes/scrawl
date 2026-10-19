// A day as the files write it, `YYYY-MM-DD`, checked against the calendar: what is written by
// hand, pasted, imported or sent by an agent can look like a day and not be one (2026-02-30).

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const leap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Whether `text` is a day on the calendar as `YYYY-MM-DD`: 2024-02-29 is, 2025-02-29, 2026-02-30 and 2026-13-01 are not. */
export function isDay(text: string): boolean {
  const m = DAY.exec(text);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const days = [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day <= days;
}
