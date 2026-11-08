import { describe, expect, it } from 'vitest';
import { baseOf, changeOf, eventKey, eventTitle, planCalendar, seenAfter, type SyncedEvent, type WantedEvent } from './calendar-sync';
import { mergeCalendarChoice, NO_CHOICE, parseCalendarChoice, rowGoes, serializeCalendarChoice } from './outlook';

const TODAY = '2026-11-09';
const task = (id: string, o: Partial<WantedEvent> = {}): WantedEvent => ({ id, title: `Task ${id}`, day: TODAY, done: false, where: 'Scrawl · Personal › Tasks', ...o });
const event = (wanted: WantedEvent, o: Partial<SyncedEvent> = {}): SyncedEvent => ({
  eventId: `e-${wanted.id}`,
  base: baseOf(wanted),
  title: eventTitle(wanted),
  day: wanted.day,
  ...(wanted.start && { start: wanted.start }),
  ...(wanted.end && { end: wanted.end }),
  ...o,
});
const none = new Map<string, string>();
const empty = { create: [], update: [], remove: [], back: [], missing: [] };

describe('Scrawl in a calendar', () => {
  it('makes what is not there, changes what Scrawl changed, and removes what no longer goes', () => {
    const kept = task('a');
    const renamed = task('b');
    const gone = task('c');
    const plan = planCalendar([kept, { ...renamed, title: 'New name' }, task('d')], [event(kept), event(renamed), event(gone)], none, TODAY);
    expect(plan.create.map((w) => w.id)).toEqual(['d']);
    expect(plan.update).toEqual([{ eventId: 'e-b', wanted: { ...renamed, title: 'New name' } }]);
    expect(plan.remove.map((e) => e.eventId)).toEqual(['e-c']);
    expect(plan.back).toEqual([]);
  });

  it('brings back what the calendar changed of work that did not change in Scrawl', () => {
    const work = task('a');
    expect(planCalendar([work], [event(work, { day: '2026-11-12', title: 'Pay the bill today' })], none, TODAY)).toEqual({ ...empty, back: [{ id: 'a', title: 'Pay the bill today', day: '2026-11-12' }] });
  });

  it('lets Scrawl’s change go over the calendar’s', () => {
    const work = task('a');
    const plan = planCalendar([{ ...work, title: 'Mine' }], [event(work, { title: 'Theirs' })], none, TODAY);
    expect(plan.update.map((u) => u.wanted.title)).toEqual(['Mine']);
    expect(plan.back).toEqual([]);
  });

  it('writes a repeating record’s day over again, rather than bringing it back', () => {
    const day = task('record:Gym/Workouts#r1@2026-11-09');
    const plan = planCalendar([day], [event(day, { day: '2026-11-10' })], none, TODAY);
    expect(plan.update.map((u) => u.eventId)).toEqual(['e-record:Gym/Workouts#r1@2026-11-09']);
    expect(plan.back).toEqual([]);
  });

  it('asks after seen work that is not in the range, and leaves what Scrawl did not write', () => {
    const plan = planCalendar([task('a')], [{ eventId: 'by-hand', base: null, title: 'Lunch', day: TODAY }], new Map([['a', 'e-a']]), TODAY);
    expect(plan).toEqual({ ...empty, missing: [{ id: 'a', eventId: 'e-a' }] });
  });

  it('leaves events before yesterday, and removes a second event of the same work', () => {
    const old = task('old', { day: '2026-10-01' });
    const twice = task('twice');
    const plan = planCalendar([twice], [event(old), event(twice), event(twice, { eventId: 'again' })], none, TODAY);
    expect(plan.remove.map((e) => e.eventId)).toEqual(['again']);
  });

  it('marks a finished one with ✓ and reads it without it, and remembers what it saw', () => {
    expect(eventTitle({ title: 'Call the dentist', done: true })).toBe('✓ Call the dentist');
    const done = task('a', { done: true });
    expect(planCalendar([done], [event(done)], none, TODAY)).toEqual(empty);
    const plan = planCalendar([done, task('b')], [event(done), event(task('c'))], new Map([['z', 'e-z']]), TODAY);
    expect([...seenAfter(plan, [event(done), event(task('c'))], new Map([['z', 'e-z'], ['y', 'e-y']]), ['y'])].sort()).toEqual([
      ['a', 'e-a'],
      ['z', 'e-z'],
    ]);
  });

  it('takes a task or a card’s day only, and a record’s time, or its time taken off', () => {
    const card = task('card');
    expect(changeOf(baseOf(card), { title: card.title, day: '2026-11-11', start: '2026-11-11T09:00', end: '2026-11-11T10:00' })).toEqual({ id: 'card', day: '2026-11-11' });
    const visit = task('visit', { start: '2026-11-09T14:00', end: '2026-11-09T15:00' });
    expect(changeOf(baseOf(visit), { title: visit.title, day: TODAY, start: '2026-11-09T16:00', end: '2026-11-09T17:00' })).toEqual({ id: 'visit', start: '2026-11-09T16:00', end: '2026-11-09T17:00' });
    expect(changeOf(baseOf(visit), { title: visit.title, day: TODAY })).toEqual({ id: 'visit', start: null });
    expect(changeOf(baseOf(visit), { title: visit.title, day: TODAY, start: visit.start, end: visit.end })).toBeNull();
  });

  it('gives the same work the same key, made of what Google takes', () => {
    expect(eventKey('task:Tasks.tasks.json#1')).toBe(eventKey('task:Tasks.tasks.json#1'));
    expect(eventKey('task:Tasks.tasks.json#1')).not.toBe(eventKey('task:Tasks.tasks.json#2'));
    expect(eventKey('card:Roadmap.board.json#x')).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe('The choice of what goes', () => {
  it('sends tasks and boards, not apps or collections, till chosen otherwise', () => {
    expect([rowGoes(NO_CHOICE, 'tasks'), rowGoes(NO_CHOICE, 'boards'), rowGoes(NO_CHOICE, 'collections'), rowGoes(NO_CHOICE, { app: 'Gym' })]).toEqual([true, true, false, false]);
    const chosen = { ...NO_CHOICE, goes: { boards: false, apps: { Gym: true } } };
    expect([rowGoes(chosen, 'boards'), rowGoes(chosen, { app: 'Gym' })]).toEqual([false, true]);
  });

  it('writes only what differs, and reads it back', () => {
    expect(serializeCalendarChoice(NO_CHOICE)).toBe('{\n  "version": 1\n}\n');
    const chosen = { ...NO_CHOICE, sync: true, to: 'google' as const, account: 'kaan@gmail.com', calendar: 'c1', goes: { tasks: false, apps: { '@sp-1/Clinic': true } } };
    expect(parseCalendarChoice(serializeCalendarChoice(chosen))).toEqual(chosen);
  });

  it('keeps what two devices chose, each its own', () => {
    const base = serializeCalendarChoice(NO_CHOICE);
    const local = serializeCalendarChoice({ ...NO_CHOICE, sync: true, to: 'google', goes: { apps: { Gym: true } } });
    const remote = serializeCalendarChoice({ ...NO_CHOICE, goes: { boards: false, apps: { Clinic: true } } });
    expect(parseCalendarChoice(mergeCalendarChoice(base, local, remote))).toEqual({ ...NO_CHOICE, sync: true, to: 'google', goes: { boards: false, apps: { Clinic: true, Gym: true } } });
  });
});
