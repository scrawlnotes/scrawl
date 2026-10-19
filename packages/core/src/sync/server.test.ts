import { describe, expect, it } from 'vitest';
import { RemoteSignedOut } from './remote';
import { readServerInput, ServerRemote } from './server';

// The server itself is tried in apps/server, against this client.

describe('a space on a server that cannot be reached with this device’s key', () => {
  const signedOut = (remote: ServerRemote) => remote.changes(null).then(
    () => null,
    (error: unknown) => error,
  );

  it('says this device has no key, when it has none, without asking the server', async () => {
    let asked = 0;
    const fetch = (async () => {
      asked++;
      return new Response('{}');
    }) as typeof globalThis.fetch;
    const error = await signedOut(new ServerRemote({ url: 'https://kaan.scrawlnotes.com', token: () => null, space: 'sp-1', fetch }));
    expect(error).toBeInstanceOf(RemoteSignedOut);
    expect((error as RemoteSignedOut).notYet).toBe(true);
    expect(asked).toBe(0);
  });

  it('says the server no longer takes the key it has', async () => {
    const fetch = (async () => new Response('{}', { status: 401 })) as typeof globalThis.fetch;
    const error = await signedOut(new ServerRemote({ url: 'https://kaan.scrawlnotes.com', token: () => 'old-key', space: 'sp-1', fetch }));
    expect(error).toBeInstanceOf(RemoteSignedOut);
    expect((error as RemoteSignedOut).notYet).toBe(false);
  });
});

describe('what is typed in Connect a server…', () => {
  it('takes an address with or without https://, keeping only where the server is', () => {
    expect(readServerInput('kaan.scrawlnotes.com')).toEqual({ url: 'https://kaan.scrawlnotes.com' });
    expect(readServerInput('  https://Kaan.Scrawlnotes.com/some/page  ')).toEqual({ url: 'https://kaan.scrawlnotes.com' });
    expect(readServerInput('http://kaan.scrawlnotes.com:8443')).toEqual({ url: 'http://kaan.scrawlnotes.com:8443' });
  });

  it('tries a server on this computer without HTTPS', () => {
    expect(readServerInput('localhost:8080')).toEqual({ url: 'http://localhost:8080' });
    expect(readServerInput('127.0.0.1:8080/')).toEqual({ url: 'http://127.0.0.1:8080' });
  });

  it('tells an invite link by its code', () => {
    expect(readServerInput('https://kaan.scrawlnotes.com/join/K8t4wQ2mZr7pXc')).toEqual({ url: 'https://kaan.scrawlnotes.com', invite: 'K8t4wQ2mZr7pXc' });
  });

  it('takes nothing that is not an address', () => {
    expect(readServerInput('')).toBeNull();
    expect(readServerInput('just words')).toBeNull();
    expect(readServerInput('ftp://kaan.scrawlnotes.com')).toBeNull();
    expect(readServerInput('kaan')).toBeNull();
  });
});
