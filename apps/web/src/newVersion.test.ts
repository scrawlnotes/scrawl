import { describe, expect, it } from 'vitest';
import { lookAtOpening, type RegistrationLike, waitingAtOpen, type WorkerLike } from './newVersion';

/** A service worker that goes through the states given, one after another, once it is listened to. */
function worker(...states: string[]): WorkerLike & { state: string } {
  const listeners: (() => void)[] = [];
  const one = {
    state: states.shift() ?? 'installed',
    addEventListener: (_type: 'statechange', listener: () => void) => {
      listeners.push(listener);
      queueMicrotask(function next() {
        const state = states.shift();
        if (state === undefined) return;
        one.state = state;
        for (const each of listeners) each();
        queueMicrotask(next);
      });
    },
  };
  return one;
}

function registration(found: Partial<Pick<RegistrationLike, 'installing' | 'waiting'>> = {}, offline = false): RegistrationLike {
  return { installing: found.installing ?? null, waiting: found.waiting ?? null, update: () => (offline ? Promise.reject(new TypeError('offline')) : Promise.resolve()) };
}

const untouched = () => false;

describe('a new version as the web app opens', () => {
  it('goes over to one waiting on the device before drawing, where an older one runs the page', () => {
    const ready = worker('installed');
    expect(waitingAtOpen(registration({ waiting: ready }), true)).toBe(ready);
    expect(waitingAtOpen(registration({ waiting: ready }), false)).toBeNull();
    expect(waitingAtOpen(registration(), true)).toBeNull();
  });

  it('syncs at once when none comes, or the look fails', async () => {
    expect(await lookAtOpening(registration(), true, untouched)).toBeNull();
    expect(await lookAtOpening(registration({}, true), true, untouched)).toBeNull();
  });

  it('goes over to one that comes down while the person did nothing yet', async () => {
    const coming = worker('installing', 'installed');
    expect(await lookAtOpening(registration({ installing: coming }), true, untouched)).toEqual({ worker: coming, go: true });
  });

  it('only offers one that comes down after the person did something', async () => {
    const coming = worker('installing', 'installed');
    expect(await lookAtOpening(registration({ installing: coming }), true, () => true)).toEqual({ worker: coming, go: false });
  });

  it('syncs as it is when the one coming fails, and on a first opening, which nothing older runs', async () => {
    expect(await lookAtOpening(registration({ installing: worker('installing', 'redundant') }), true, untouched)).toBeNull();
    expect(await lookAtOpening(registration({ installing: worker('installing', 'installed') }), false, untouched)).toBeNull();
  });
});
