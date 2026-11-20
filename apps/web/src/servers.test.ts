import { describe, expect, it, vi } from 'vitest';
import { accountToTake, type KnownServer, personIn } from './servers';

// servers.ts asks, as it loads, whether it runs in the desktop app's window.
vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = globalThis;
});

const URL = 'https://scrawl.example.com';
const SERVER: KnownServer = { url: URL, id: 'account-eren', email: 'eren@example.com', name: 'Eren', role: 'member' };
const onServer = { source: { provider: 'server', place: { url: URL, space: 'sp-1' } } };
const onOneDrive = { source: { provider: 'onedrive', place: { id: 'x' } } };

describe('personIn', () => {
  it('writes a server space row with the account id, filling name and email where Profile has none', () => {
    expect(personIn(onServer, { id: 'device-new' }, [SERVER])).toEqual({ id: 'account-eren', name: 'Eren', email: 'eren@example.com' });
  });

  it("keeps Profile's own name over the account's", () => {
    expect(personIn(onServer, { id: 'device-new', name: 'Eren Y.' }, [SERVER])).toEqual({ id: 'account-eren', name: 'Eren Y.', email: 'eren@example.com' });
  });

  it('leaves the person as they are when the id is the account already, or the space is not a server', () => {
    const me = { id: 'account-eren' };
    expect(personIn(onServer, me, [SERVER])).toBe(me);
    const other = { id: 'device-new' };
    expect(personIn(onOneDrive, other, [SERVER])).toBe(other);
    expect(personIn({}, other, [SERVER])).toBe(other);
  });

  it('leaves the person as they are for a server not known here, or known without an id', () => {
    const me = { id: 'device-new' };
    expect(personIn(onServer, me, [])).toBe(me);
    expect(personIn(onServer, me, [{ ...SERVER, id: undefined }])).toBe(me);
  });
});

describe('accountToTake', () => {
  it('is the server account when the person is none of the accounts', () => {
    expect(accountToTake({ id: 'device-new' }, [SERVER])).toBe(SERVER);
  });

  it('is none when the person is an account already, none is known, or there is no person', () => {
    expect(accountToTake({ id: 'account-eren' }, [SERVER, { ...SERVER, url: 'https://other.example.com', id: 'account-other' }])).toBeUndefined();
    expect(accountToTake({ id: 'device-new' }, [])).toBeUndefined();
    expect(accountToTake({ id: 'device-new' }, [{ ...SERVER, id: undefined }])).toBeUndefined();
    expect(accountToTake(null, [SERVER])).toBeUndefined();
  });
});
