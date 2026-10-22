import { describe, expect, it } from 'vitest';
import {
  durationText,
  evaluateFormula,
  type Field,
  formatNumber,
  formulaProblem,
  groupRecords,
  matchesConditions,
  parseSchema,
  readValue,
  type Record,
  type Schema,
  sortRecords,
  valueText,
} from './collection';
import { guessType, planImport, sheetDate, sheetSerial } from './csv';
import { clockOf, dateOf, dateTimeOf, isClock, minutesOf, timeOf } from './day';

// A day with its time, a time of day and a duration (design/calendar.md 2): written as the wall
// clock shows them, with no time zone.

const FIELDS: Field[] = [
  { key: 'name', label: 'Name', type: 'name' },
  { key: 'starts', label: 'Starts', type: 'date', time: true },
  { key: 'duration', label: 'Duration', type: 'number', format: { style: 'duration' } },
  { key: 'arrival', label: 'Arrival window', type: 'time' },
  { key: 'next', label: 'Next visit', type: 'date' },
];
const schema = { version: 2, template: 'blank', fields: FIELDS } as Schema;
const visit = (id: string, starts: string | null, extra: Record['values'] = {}): Record => ({ id, path: `Visits/${id}.md`, name: id, code: '', values: { name: id, starts, ...extra }, extra: {}, body: '' });

describe('a day with its time', () => {
  it('is read as the clock on the wall, whatever way it was written', () => {
    expect(clockOf('9:05')).toBe('09:05');
    expect(clockOf('14:30:12')).toBe('14:30');
    expect(clockOf('24:00')).toBeNull();
    expect(isClock('14:30')).toBe(true);
    expect(isClock('9:30')).toBe(false);
    expect(dateTimeOf('2026-10-22 14:30')).toBe('2026-10-22T14:30');
    expect(dateTimeOf('2026-10-22T14:30:00Z')).toBe('2026-10-22T14:30');
    expect(dateTimeOf('2026-02-30T10:00')).toBeNull();
    expect(dateOf('2026-10-22T14:30', true)).toBe('2026-10-22T14:30');
    expect(dateOf('2026-10-22T14:30')).toBe('2026-10-22');
    expect(dateOf('2026-10-22', true)).toBe('2026-10-22');
    expect(timeOf('2026-10-22T14:30')).toBe('14:30');
    expect(timeOf('2026-10-22')).toBeNull();
    expect([minutesOf('90'), minutesOf('1:30'), minutesOf('1 h 30 min'), minutesOf('2h'), minutesOf('45 min'), minutesOf('soon')]).toEqual([90, 90, 90, 120, 45, null]);
  });

  it('is kept where the field has a time, and a day alone where it has not', () => {
    expect(readValue('date', '2026-10-22T14:30', false, true)).toBe('2026-10-22T14:30');
    expect(readValue('date', '2026-10-22 14:30', false, true)).toBe('2026-10-22T14:30');
    expect(readValue('date', '2026-10-22', false, true)).toBe('2026-10-22');
    expect(readValue('date', '2026-10-22T14:30')).toBe('2026-10-22');
    expect(readValue('time', '9:05')).toBe('09:05');
    expect(readValue('time', 'noon')).toBeNull();
    const read = parseSchema(JSON.stringify(schema));
    expect(read.fields.find((f) => f.key === 'starts')).toMatchObject({ type: 'date', time: true });
    expect(read.fields.find((f) => f.key === 'arrival')!.type).toBe('time');
    expect(read.fields.find((f) => f.key === 'duration')!.format).toEqual({ style: 'duration' });
  });

  it('shows the day and the clock, and minutes as hours and minutes', () => {
    expect(valueText('2026-10-22T14:30')).toBe('2026-10-22 14:30');
    expect([durationText(90), durationText(45), durationText(60), durationText(0), durationText(-30)]).toEqual(['1 h 30 min', '45 min', '1 h', '0 min', '−30 min']);
    expect(formatNumber(135, { style: 'duration' })).toBe('2 h 15 min');
  });
});

describe('working with time', () => {
  const values = { starts: '2026-10-22T14:30', duration: 90, arrival: '14:00', next: '2027-01-21' };
  const run = (expr: string, v: Record['values'] = values) => evaluateFormula(expr, v, schema, '2026-10-21');

  it('adds minutes and hours to a day and a time, and takes them apart', () => {
    expect(run('starts + minutes(duration)')).toBe('2026-10-22T16:00');
    expect(run('starts + hours(10)')).toBe('2026-10-23T00:30');
    expect(run('starts - minutes(45)')).toBe('2026-10-22T13:45');
    expect(run('starts + 1')).toBe('2026-10-23T14:30');
    expect(run('(starts + minutes(duration)) - starts')).toBe(90);
    expect(run('day(starts)')).toBe('2026-10-22');
    expect(run('time(starts)')).toBe('14:30');
    expect(run('at(next, arrival)')).toBe('2027-01-21T14:00');
    expect(run('arrival + minutes(45)')).toBe('14:45');
    expect(run('time(starts) - arrival')).toBe(30);
    expect(run('time(starts) >= arrival')).toBe(true);
    expect(run('next - day(starts)')).toBe(91);
    expect(run('text(time(starts))')).toBe('14:30');
    // A day alone is at its start: a time added makes it one with its time.
    expect(run('starts + minutes(30)', { starts: '2026-10-22' })).toBe('2026-10-22T00:30');
    expect(run('time(starts)', { starts: '2026-10-22' })).toBeNull();
    expect(run('starts < next')).toBe(true);
  });

  it('says what is wrong with time in a formula', () => {
    expect(formulaProblem('arrival + 1', schema)).toBe('A time takes minutes(n) or hours(n): 14:30 + minutes(45).');
    expect(formulaProblem('minutes(30) + name', schema)).toBe(null);
    expect(formulaProblem('minutes("half")', schema)).toBe('minutes() takes a number.');
    expect(formulaProblem('at(next, 3)', schema)).toBe('at() takes a time as its second.');
    expect(formulaProblem('arrival < next', schema)).toBe('Cannot compare a time with a day.');
  });
});

describe('a view of days with their times', () => {
  const records = [visit('b', '2026-10-22T14:30'), visit('a', '2026-10-22'), visit('c', '2026-10-22T09:00'), visit('d', '2026-10-23T10:00', { arrival: '09:30' })];

  it('sorts a day alone first on its day, then by the clock', () => {
    expect(sortRecords(records, schema, { key: 'starts', dir: 'asc' }).map((r) => r.name)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('finds them by their day, and a time by the time', () => {
    const on = (op: 'on' | 'before' | 'after', value: string) => records.filter((r) => matchesConditions(r, schema, [{ field: 'starts', op, value }], '2026-10-22')).map((r) => r.name);
    expect(on('on', '2026-10-22')).toEqual(['b', 'a', 'c']);
    expect(on('on', 'today')).toEqual(['b', 'a', 'c']);
    expect(on('after', '2026-10-22')).toEqual(['d']);
    expect(on('before', '2026-10-23')).toEqual(['b', 'a', 'c']);
    expect(records.filter((r) => matchesConditions(r, schema, [{ field: 'arrival', op: 'before', value: '10:00' }], '2026-10-22')).map((r) => r.name)).toEqual(['d']);
  });

  it('groups them by their day', () => {
    expect(groupRecords(records, schema, 'starts', '2026-10-22').map((g) => [g.key, g.records.length])).toEqual([
      ['2026-10-22', 3],
      ['2026-10-23', 1],
    ]);
  });
});

describe('time in and out of a sheet', () => {
  it('takes a day with its time and a time from a file, and gives them back to a workbook', () => {
    expect(guessType(['2026-03-12 14:30', '2026-03-13 09:00'])).toBe('date');
    expect(guessType(['14:30', '9:00'])).toBe('time');
    const collection = { dir: 'Visits', schema, records: [], rules: undefined } as never;
    const plan = planImport(collection, ['Name', 'Starts', 'Arrival window', 'Booked'], [['Rope tension', '2026-10-23 10:00', '9:30', '2026-10-01 08:15']], [{ field: 'name' }, { field: 'starts' }, { field: 'arrival' }, { add: 'date' }], 'add', {});
    expect(plan.added[0]!.values).toMatchObject({ starts: '2026-10-23T10:00', arrival: '09:30', booked: '2026-10-01T08:15' });
    expect(plan.schema.fields.find((f) => f.key === 'booked')).toMatchObject({ type: 'date', time: true });
    expect(sheetDate(sheetSerial('2026-10-22T14:30'))).toBe('2026-10-22 14:30');
    expect(sheetDate(sheetSerial('2026-10-22'))).toBe('2026-10-22');
  });
});
