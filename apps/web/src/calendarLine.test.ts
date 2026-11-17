import { describe, expect, it } from 'vitest';
import { accountLine, type LineInput } from './calendarLine';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const base: LineInput = { status: 'on', error: null, where: 'In this browser', target: true, canWrite: true, sync: { status: 'done', error: null, at: NOW - 2 * 60_000 }, now: NOW };

describe('a calendar account’s line', () => {
  it('says where it is when tasks do not go to it', () => {
    expect(accountLine({ ...base, target: false })).toEqual({ text: 'In this browser', tone: 'plain' });
  });

  it('says it syncs, then when it did', () => {
    expect(accountLine({ ...base, sync: { status: 'syncing', error: null, at: null } })).toEqual({ text: 'Syncing…', tone: 'busy' });
    expect(accountLine({ ...base, sync: { status: 'off', error: null, at: null } }).tone).toBe('busy');
    const done = accountLine(base);
    expect(done.tone).toBe('ok');
    expect(done.text).toMatch(/^Synced .+ · In this browser$/);
  });

  it('says what keeps it from writing, and how it is put right', () => {
    expect(accountLine({ ...base, canWrite: false })).toEqual({ text: 'Can’t write to the Scrawl calendar', tone: 'bad', fix: 'allow' });
    expect(accountLine({ ...base, sync: { status: 'permission', error: null, at: null } }).fix).toBe('allow');
    expect(accountLine({ ...base, status: 'signin' })).toEqual({ text: 'Sign in again', tone: 'bad', fix: 'signin' });
    expect(accountLine({ ...base, sync: { status: 'signin', error: null, at: null } }).fix).toBe('signin');
    expect(accountLine({ ...base, sync: { status: 'failed', error: 'Quota exceeded', at: null } })).toEqual({ text: 'Couldn’t sync: Quota exceeded', tone: 'bad' });
  });

  it('puts a sign-in that failed first, even when tasks go elsewhere', () => {
    expect(accountLine({ ...base, target: false, error: 'access_denied' })).toEqual({ text: 'access_denied', tone: 'bad' });
    expect(accountLine({ ...base, target: false, status: 'signin' }).fix).toBe('signin');
  });
});
