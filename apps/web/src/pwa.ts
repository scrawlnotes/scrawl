import { isDesktop } from './storage';

// The web app as an app of its own: its service worker, which keeps the app's files on the device
// (sw/sw.js), and telling when a new version waits for the user to reload into it. Not on the
// desktop, whose files are its own, nor while developing, where every change comes at once.

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

export const subscribeUpdate = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether a new version is ready. */
export const updateReady = () => waiting !== null;

export function startWebApp() {
  if (isDesktop) return;
  // The notes live in the browser until they are synced: the browser is asked not to clear them when short of room.
  void navigator.storage?.persist?.().catch(() => undefined);
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      // A version is waiting only where an older one runs the page; the first one simply starts.
      const found = (worker: ServiceWorker | null) => {
        if (!worker || !navigator.serviceWorker.controller) return;
        waiting = worker;
        for (const listener of listeners) listener();
      };
      found(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => worker.state === 'installed' && found(worker));
      });
      // An app left open for days looks for a new version whenever it comes back on screen.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
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
