import { describe, expect, it } from 'vitest';
import { atMinutes, calendarRecords, compareOnDay, dueRecords, layoutDay, minutesBetween, minutesOfDay, movedValues, startingValues, stretchedValues, weekDays, weekStart } from './calendar';
import { calendarStarts, type Collection, evaluateFormula, parseSchema, type Record, serializeSchema, type View } from './collection';

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

  it('keeps a Calendar view in the schema file, its fields as they are', () => {
    const fields = [
      { key: 'name', type: 'name' },
      { key: 'starts', type: 'date', time: true },
      { key: 'next', type: 'date' },
      { key: 'duration', type: 'number', format: { style: 'duration' } },
      { key: 'ends', type: 'formula', formula: 'starts + minutes(duration)' },
      { key: 'status', type: 'select', options: ['Planned', 'Done'] },
    ];
    const calendar = { id: 'c', name: 'Calendar', kind: 'calendar', calendar: { start: 'starts', duration: 'duration', color: 'status', upcoming: true }, conditions: [] };
    const schema = parseSchema(JSON.stringify({ version: 2, fields, views: [calendar] }));
    expect(schema.views).toEqual([calendar]);
    expect(parseSchema(serializeSchema(schema)).views).toEqual([calendar]);
    const read = (given: unknown, more: object[] = fields) => parseSchema(JSON.stringify({ version: 2, fields: more, views: [{ id: 'c', name: 'Calendar', kind: 'calendar', calendar: given, conditions: [] }] })).views![0]!;
    // Upcoming is on unless it is said off; an end goes before a length; what is not a field of its kind is left out.
    expect(read({ start: 'next', end: 'ends', duration: 'duration' }).calendar).toEqual({ start: 'next', end: 'ends', upcoming: true });
    expect(read({ start: 'status', color: 'starts', upcoming: false }).calendar).toEqual({ start: 'starts', upcoming: false });
    // With no date field it is a table.
    expect(read({ start: 'starts' }, [{ key: 'name', type: 'name' }]).kind).toBeUndefined();
  });

  it('starts on a formula that gives a day, which is shown and not moved', () => {
    const fields = [
      { key: 'name', type: 'name' },
      { key: 'label', type: 'formula', formula: 'name + "!"' },
      { key: 'next', type: 'formula', formula: 'birthday + years(year(today()) - year(birthday)) < today() ? birthday + years(year(today()) - year(birthday) + 1) : birthday + years(year(today()) - year(birthday))' },
      { key: 'birthday', type: 'date' },
      { key: 'renews', type: 'formula', formula: 'contract.ends - 30' },
      { key: 'contract', type: 'link', collection: 'Contracts' },
    ];
    const view = (start: string) => ({ id: 'c', name: 'Birthdays', kind: 'calendar', calendar: { start, upcoming: true }, conditions: [] });
    const read = (start: string) => parseSchema(JSON.stringify({ version: 2, fields, views: [view(start)] }));
    // The dates first, then the formulas that give a day; one reading a linked record's is kept where it is given.
    expect(calendarStarts(read('next').fields).map((f) => f.key)).toEqual(['birthday', 'next']);
    expect(read('next').views![0]!.calendar!.start).toBe('next');
    expect(read('renews').views![0]!.calendar!.start).toBe('renews');
    expect(read('label').views![0]!.calendar!.start).toBe('birthday');
    const schema = read('next');
    const today = '2026-10-22';
    const person = (id: string, birthday: string): Record => {
      const values = { name: id, birthday };
      return { id, path: `People/${id}.md`, name: id, values: { ...values, next: evaluateFormula(fields[2]!.formula!, values, schema, today) }, body: '' } as unknown as Record;
    };
    const people = { dir: 'People', schema, records: [person('ayse', '1990-11-03'), person('mert', '1985-10-01'), person('can', '2000-02-29')] } as Collection;
    expect(dueRecords([people], today).map((r) => [r.record.id, r.start])).toEqual([
      ['ayse', '2026-11-03'],
      ['can', '2027-02-28'],
      ['mert', '2027-10-01'],
    ]);
    expect(movedValues(schema, schema.views![0]!.calendar!, { start: '2026-11-03', end: null }, '2026-11-04')).toBeNull();
  });

  it('puts the records of a calendar on their days, and brings those from today on to Today and Upcoming', () => {
    const schema = parseSchema(
      JSON.stringify({
        version: 2,
        fields: [
          { key: 'name', type: 'name' },
          { key: 'starts', type: 'date', time: true },
          { key: 'ends', type: 'date', time: true },
          { key: 'duration', type: 'number' },
          { key: 'status', type: 'select', options: ['Planned', 'Done'] },
        ],
      }),
    );
    const record = (id: string, values: Record['values']): Record => ({ id, path: `Visits/${id}.md`, name: id, values: { name: id, ...values }, body: '' }) as unknown as Record;
    const view: View = { id: 'c', name: 'Calendar', kind: 'calendar', calendar: { start: 'starts', end: 'ends', duration: 'duration', color: 'status', upcoming: true }, conditions: [{ field: 'status', op: 'is', value: 'Planned' }] };
    const visits: Collection = {
      dir: 'Visits',
      schema: { ...schema, views: [view, { ...view, id: 'd', conditions: [] }] },
      records: [
        record('inspection', { starts: '2026-10-22', status: 'Planned' }),
        record('maintenance', { starts: '2026-10-22T14:30', duration: 90, status: 'Planned' }),
        record('door', { starts: '2026-10-22T09:00', ends: '2026-10-22T09:45', status: 'Done' }),
        record('fitting', { starts: '2026-10-21T08:00', ends: '2026-10-23T12:00', status: 'Planned' }),
        record('brake', { starts: '2026-10-19T10:00', status: 'Planned' }),
        record('rope', { starts: '2026-10-23T10:00', ends: '2026-10-23T09:00', status: 'Planned' }),
        record('nothing', { status: 'Planned' }),
      ],
    } as Collection;
    const today = '2026-10-22';
    expect(calendarRecords(visits, view, today).map((r) => [r.record.id, r.start, r.end, r.minutes, r.choice])).toEqual([
      ['brake', '2026-10-19T10:00', null, null, 'Planned'],
      ['fitting', '2026-10-21T08:00', '2026-10-23T12:00', null, 'Planned'],
      ['inspection', '2026-10-22', null, null, 'Planned'],
      ['maintenance', '2026-10-22T14:30', null, 90, 'Planned'],
      // An end before its start is no end.
      ['rope', '2026-10-23T10:00', null, null, 'Planned'],
    ]);
    // From today on, and what goes on today; Done ones by the second view; each once; a day with no time first.
    expect(dueRecords([visits], today).map((r) => [r.record.id, r.view.id])).toEqual([
      ['fitting', 'c'],
      ['inspection', 'c'],
      ['door', 'd'],
      ['maintenance', 'c'],
      ['rope', 'c'],
    ]);
    const off = { ...visits, schema: { ...visits.schema, views: visits.schema.views!.map((v) => ({ ...v, calendar: { ...v.calendar!, upcoming: false } })) } };
    expect(dueRecords([off], today)).toEqual([]);
    expect(['2026-10-22T09:00', '2026-10-22', '2026-10-21T23:00'].sort(compareOnDay)).toEqual(['2026-10-21T23:00', '2026-10-22', '2026-10-22T09:00']);
  });

  it('moves a record, stretches it, and starts a new one where it is picked', () => {
    const schema = parseSchema(
      JSON.stringify({
        version: 2,
        fields: [
          { key: 'name', type: 'name' },
          { key: 'starts', type: 'date', time: true },
          { key: 'ends', type: 'date', time: true },
          { key: 'due', type: 'date' },
          { key: 'duration', type: 'number' },
          { key: 'until', type: 'formula', formula: 'starts + minutes(duration)' },
        ],
      }),
    );
    const byEnd = { start: 'starts', end: 'ends', upcoming: true };
    const byLength = { start: 'starts', duration: 'duration', upcoming: true };
    const visit = { start: '2026-10-22T14:30', end: '2026-10-22T16:00' };
    // Moved with its end; to another day keeping its time.
    expect(movedValues(schema, byEnd, visit, '2026-10-23T09:00')).toEqual({ starts: '2026-10-23T09:00', ends: '2026-10-23T10:30' });
    expect(movedValues(schema, byEnd, visit, '2026-10-26T14:30')).toEqual({ starts: '2026-10-26T14:30', ends: '2026-10-26T16:00' });
    expect(movedValues(schema, byLength, { start: '2026-10-22T14:30', end: null }, '2026-10-22T16:00')).toEqual({ starts: '2026-10-22T16:00' });
    // A field of a day alone takes the day; one worked out is not written.
    expect(movedValues(schema, { start: 'due', upcoming: true }, { start: '2026-10-22', end: null }, '2026-10-24T10:00')).toEqual({ due: '2026-10-24' });
    expect(movedValues(schema, { start: 'until', upcoming: true }, visit, '2026-10-24')).toBeNull();
    // Its foot: its length, or its end; nothing when its end is worked out or before its start.
    expect(stretchedValues(schema, byLength, visit, '2026-10-22T16:30')).toEqual({ duration: 120 });
    expect(stretchedValues(schema, byEnd, visit, '2026-10-22T16:30')).toEqual({ ends: '2026-10-22T16:30' });
    expect(stretchedValues(schema, { start: 'starts', end: 'until', upcoming: true }, visit, '2026-10-22T16:30')).toBeNull();
    expect(stretchedValues(schema, byLength, visit, '2026-10-22T14:00')).toBeNull();
    // A new one: where it starts and how long it is.
    expect(startingValues(schema, byLength, '2026-10-23T15:00', '2026-10-23T16:30')).toEqual({ starts: '2026-10-23T15:00', duration: 90 });
    expect(startingValues(schema, byEnd, '2026-10-23T15:00', '2026-10-23T16:30')).toEqual({ starts: '2026-10-23T15:00', ends: '2026-10-23T16:30' });
    expect(startingValues(schema, { start: 'due', upcoming: true }, '2026-10-23T15:00', '2026-10-23T16:30')).toEqual({ due: '2026-10-23' });
  });
});
