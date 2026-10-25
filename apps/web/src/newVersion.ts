// Whether a new version of the web app is gone over to as it opens, from what its service
// worker's registration tells (design/sync-gate.md 2). Apart from pwa.ts, which starts the worker
// in the browser, so that it is tested without one.

/** A service worker, as these look at it. */
export interface WorkerLike {
  readonly state: string;
  addEventListener(type: 'statechange', listener: () => void): void;
}

/** A service worker's registration, as these look at it. */
export interface RegistrationLike {
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  update(): Promise<unknown>;
}

/**
 * A version that came on an earlier opening and waits on the device, to go over to before the app
 * is drawn; null when there is none, or no older version runs the page (`controlled`).
 */
export const waitingAtOpen = (kept: RegistrationLike, controlled: boolean): WorkerLike | null => (controlled ? kept.waiting : null);

/**
 * Looks for a new version as the app opens: null when none came down, the look failed, or no older
 * version runs the page; else the version, which is gone over to before syncing (`go`) when the
 * person did nothing on the page yet, and offered by the status bar's Reload when they did.
 */
export async function lookAtOpening(kept: RegistrationLike, controlled: boolean, touched: () => boolean): Promise<{ worker: WorkerLike; go: boolean } | null> {
  try {
    await kept.update();
  } catch {
    return null;
  }
  const worker = kept.installing ?? kept.waiting;
  if (!worker || !controlled) return null;
  const installed =
    worker.state === 'installed' ||
    (await new Promise<boolean>((resolve) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') resolve(true);
        else if (worker.state === 'redundant') resolve(false);
      });
    }));
  return installed ? { worker, go: !touched() } : null;
}
