import { lookAtOpening, waitingAtOpen } from './newVersion';
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

/** How long the page waits, as it opens, for its service worker before it is drawn all the same. */
const REGISTER_MS = 3000;
/** How long the page waits to go over to a version found waiting before it is drawn as it is. */
const TAKE_OVER_MS = 3000;
/** How long the first turn of syncing waits for a new version coming down as the app opens (design/sync-gate.md 2). */
const OPENING_WAIT_MS = 60_000;

/** Resolves with what `promise` gives, or with null after `ms`. */
const within = <T>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/** The person did something on the page since it opened: a version found then is offered, not gone over to by itself. */
let touched = false;

/**
 * Starts the web app's service worker as the page opens, before the app is drawn. A new version
 * that came on an earlier opening and waits on the device is gone over to at once, before the app
 * draws and syncs anything: false then, the page going. See design/sync-gate.md 2.
 */
export async function startWebApp(): Promise<boolean> {
  if (isDesktop) return true;
  // The notes live in the browser until they are synced: the browser is asked not to clear them when short of room.
  void navigator.storage?.persist?.().catch(() => undefined);
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return true;
  for (const kind of ['keydown', 'pointerdown'] as const) window.addEventListener(kind, () => (touched = true), { capture: true, once: true });
  const kept = await within(navigator.serviceWorker.register('/sw.js'), REGISTER_MS).catch(() => null);
  if (!kept) return true;
  registration = kept;
  const ready = waitingAtOpen(kept, navigator.serviceWorker.controller !== null) as ServiceWorker | null;
  if (ready) {
    const going = await new Promise<boolean>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
        resolve(true);
      }, { once: true });
      ready.postMessage('update');
      // Should it not take over, the page opens as it is.
      setTimeout(() => resolve(false), TAKE_OVER_MS);
    });
    if (going) return false;
  }
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
  return true;
}

let opening: Promise<boolean> | null = null;

/**
 * The look for a new version as the app opens, which its first turn of syncing waits on, so that
 * an old version kept on the device does not sync before the new one is known (design/sync-gate.md
 * 2). True when one came down while the person did nothing yet: the page goes over to it before it
 * syncs. False when none came, the look failed or went on for a minute, or the person already did
 * something; the status bar's Reload offers it then.
 */
export function openingUpdate(): Promise<boolean> {
  opening ??= within(lookHere(), OPENING_WAIT_MS).then((found) => found === true);
  return opening;
}

async function lookHere(): Promise<boolean> {
  const kept = registration;
  if (!kept || waiting) return false;
  const came = await lookAtOpening(kept, navigator.serviceWorker.controller !== null, () => touched);
  if (!came) return false;
  found(came.worker as ServiceWorker);
  return came.go;
}

/**
 * Looks for a new version and resolves once it is kept on the device, for a space a newer version
 * synced (design/sync-gate.md 3.4): true then, to reload into it; false when none is found.
 */
export async function webUpdateReady(): Promise<boolean> {
  if (waiting) return true;
  if (!registration) return false;
  await checkForWebUpdate();
  return new Promise<boolean>((resolve) => {
    const settle = () => {
      if (waiting) resolve(true);
      else if (checked.state === 'upToDate' || checked.state === 'failed') resolve(false);
      else return;
      listeners.delete(settle);
    };
    listeners.add(settle);
    settle();
  });
}

/** Goes over to the new version: the page reloads into it once it has taken over. */
export function reloadIntoUpdate() {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage('update');
}
