// Notifications from a Scrawl server (design/chat.md, 6 and 11.4). A browser keeps one push
// subscription for each service worker registration, and a subscription is for one server's key,
// so each server has a registration of its own, at /push/<server>/, with this worker: it shows
// what the server sends and opens Chat at the message clicked. The app's own worker, at /, keeps
// the app on the device and has no part in it.

// No page is in its scope: there is nothing for a new version to wait for.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('push', (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (!data || typeof data.title !== 'string') return;
  event.waitUntil(
    (async () => {
      // The app's badge: what is unread and tells the person, the same on every device.
      if ('setAppBadge' in navigator) {
        try {
          await (data.badge > 0 ? navigator.setAppBadge(data.badge) : navigator.clearAppBadge());
        } catch {
          // A browser that keeps no badge.
        }
      }
      // One notification a conversation: the latest message, and how many are new under it.
      const more = data.count > 1 ? `\n${data.count} new messages` : '';
      await self.registration.showNotification(data.title, {
        body: `${data.body}${more}`,
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon-32.png',
        timestamp: Date.now(),
        data,
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const href = data.chat && data.message ? `scrawl:chat/${encodeURIComponent(data.server)}/${encodeURIComponent(data.chat)}/${encodeURIComponent(data.message)}` : null;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Scrawl open: in front, and Chat at the message; closed, it opens there.
      const app = open.find((client) => client.focused) ?? open[0];
      if (app) {
        await app.focus();
        if (href) app.postMessage({ type: 'open-chat', href });
        return;
      }
      await self.clients.openWindow(href ? `/?chat=${encodeURIComponent(href)}` : '/');
    })(),
  );
});
