import { describe, expect, it } from 'vitest';
import { baseOf, eventKey, eventTitle, planCalendar, seenAfter, type SyncedEvent, type WantedEvent } from './calendar-sync';
import { mergeCalendarChoice, NO_CHOICE, parseCalendarChoice, rowGoes, serializeCalendarChoice } from './outlook';

const TODAY = '2026-11-09';
const task = (id: string, o: Partial<WantedEvent> = {}): WantedEvent => ({ id, title: `Task ${id}`, day: TODAY, done: false, where: 'Scrawl · Personal › Tasks', ...o });
const event = (wanted: WantedEvent, o: Partial<SyncedEvent> = {}): SyncedEvent => ({ eventId: `e-${wanted.id}`, base: baseOf(wanted), day: wanted.day, ...o });

describe('Scrawl in a calendar', () => {
  it('makes what is not there, changes what Scrawl changed, and removes what no longer goes', () => {
    const kept = task('a');
    const renamed = task('b');
    const gone = task('c');
    const plan = planCalendar([kept, { ...renamed, title: 'New name' }, task('d')], [event(kept), event(renamed), event(gone)], new Set(), TODAY);
    expect(plan.create.map((w) => w.id)).toEqual(['d']);
    expect(plan.update).toEqual([{ eventId: 'e-b', wanted: { ...renamed, title: 'New name' } }]);
    expect(plan.remove.map((e) => e.eventId)).toEqual(['e-c']);
  });

  it('leaves a change made in the calendar to Scrawl’s work that did not change, for slice 3', () => {
    const work = task('a');
    const moved = event(work, { day: '2026-11-12' });
    expect(planCalendar([work], [moved], new Set(), TODAY)).toEqual({ create: [], update: [], remove: [] });
  });

  it('does not make again what was removed in the calendar, nor touch what Scrawl did not write', () => {
    const plan = planCalendar([task('a')], [{ eventId: 'by-hand', base: null, day: TODAY }], new Set(['a']), TODAY);
    expect(plan).toEqual({ create: [], update: [], remove: [] });
  });

  it('leaves events before yesterday, and removes a second event of the same work', () => {
    const old = task('old', { day: '2026-10-01' });
    const twice = task('twice');
    const plan = planCalendar([twice], [event(old), event(twice), event(twice, { eventId: 'again' })], new Set(), TODAY);
    expect(plan.remove.map((e) => e.eventId)).toEqual(['again']);
  });

  it('marks a finished one with ✓ and keeps it, and remembers what it saw', () => {
    expect(eventTitle({ title: 'Call the dentist', done: true })).toBe('✓ Call the dentist');
    const done = task('a');
    const plan = planCalendar([{ ...done, done: true }, task('b')], [event(done), event(task('c'))], new Set(['z']), TODAY);
    expect(plan.update.map((u) => u.wanted.done)).toEqual([true]);
    expect([...seenAfter(plan, [event(done), event(task('c'))], new Set(['z']))].sort()).toEqual(['a', 'b', 'z']);
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
