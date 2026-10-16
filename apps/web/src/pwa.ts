import { isDesktop } from './storage';

// The web app as an app of its own: its service worker, which keeps the app's files on the device
// (sw/sw.js), and telling when a new version waits for the user to reload into it. Not on the
// desktop, whose files are its own, nor while developing, where every change comes at once.

/** The app's version, the desktop app's number, written in by vite.config.ts. */
declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

/** When this build went out on the web, written in by vite.config.ts as it is built. */
declare const __BUILD_TIME__: string;
export const PUBLISHED = __BUILD_TIME__;

/** How a check from Settings › About stands; a version found waiting is `ready` whoever found it. */
export type WebUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'upToDate'; checked: number }
  | { state: 'downloading' }
  | { state: 'ready' }
  | { state: 'failed'; offline: boolean; reason: string };

const READY: WebUpdateStatus = { state: 'ready' };

let registration: ServiceWorkerRegistration | null = null;
let waiting: ServiceWorker | null = null;
let checked: WebUpdateStatus = { state: 'idle' };
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of listeners) listener();
};

export const subscribeUpdate = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether a new version is ready. */
export const updateReady = () => waiting !== null;

/** How the updates stand, for Settings › About. */
export const webUpdateStatus = (): WebUpdateStatus => (waiting ? READY : checked);

/** Whether a check can be made: the built app with its service worker, not while developing. */
export const webUpdatesOn = () => registration !== null;

// A version is waiting only where an older one runs the page; the first one simply starts.
function found(worker: ServiceWorker | null) {
  if (!worker || !navigator.serviceWorker.controller) return;
  waiting = worker;
  tell();
}

/**
 * Looks for a new version now, from Settings › About: the service worker is fetched again, and a
 * new one is kept on the device before it is offered, as when the app finds it by itself.
 */
export async function checkForWebUpdate() {
  if (!registration || waiting) return;
  checked = { state: 'checking' };
  tell();
  try {
    await registration.update();
  } catch (error) {
    checked = { state: 'failed', offline: !navigator.onLine || error instanceof TypeError, reason: error instanceof Error ? error.message : String(error) };
    return tell();
  }
  const worker = registration.installing ?? registration.waiting;
  if (!worker) {
    checked = { state: 'upToDate', checked: Date.now() };
    return tell();
  }
  if (worker.state === 'installed') return found(worker);
  checked = { state: 'downloading' };
  tell();
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') found(worker);
    else if (worker.state === 'redundant') {
      checked = { state: 'failed', offline: !navigator.onLine, reason: 'the new version could not be kept on this device' };
      tell();
    }
  });
}

export function startWebApp() {
  if (isDesktop) return;
  // The notes live in the browser until they are synced: the browser is asked not to clear them when short of room.
  void navigator.storage?.persist?.().catch(() => undefined);
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('/sw.js')
    .then((kept) => {
      registration = kept;
      tell();
      found(kept.waiting);
      kept.addEventListener('updatefound', () => {
        const worker = kept.installing;
        worker?.addEventListener('statechange', () => worker.state === 'installed' && found(worker));
      });
      // An app left open for days looks for a new version whenever it comes back on screen.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void kept.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}

/** Goes over to the new version: the page reloads into it once it has taken over. */
export function reloadIntoUpdate() {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage('update');
}
