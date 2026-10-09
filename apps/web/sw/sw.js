// The web app's service worker: the app's own files are kept on the device, so that once opened it
// opens without a network, and a new build waits until the user reloads into it. The notes are not
// here; they are in the browser's own storage. Requests elsewhere (OneDrive) go on as they are.
// The build writes the version and the list of files in (see vite.config.ts).

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `scrawl-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

// The version taking over drops the files of the ones before.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('scrawl-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The user chose to reload into the new version.
self.addEventListener('message', (event) => {
  if (event.data === 'update') self.skipWaiting();
});

// Every address of the app opens the app; its files come from the device, from the network only
// when they are not kept.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = request.mode === 'navigate' ? '/' : url.pathname;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key))
      .then((kept) => kept ?? fetch(request)),
  );
});
