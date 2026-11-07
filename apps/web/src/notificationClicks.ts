// A notification clicked opens Chat at its message (push-sw.js). Its link is kept for the page's
// session until the app opens it: the click can come before the app's code does (an iPhone opening
// the app for it, the worker's message then given out as the page has loaded), and the page can
// leave before the app opens it, to go over to a new version or to finish a sign-in.

const KEPT = 'scrawl.notificationClicked';
let take: ((href: string) => void) | null = null;
let opened = false;

const keep = (href: string) => {
  try {
    sessionStorage.setItem(KEPT, href);
  } catch {
    // No storage: the link is lost should the page leave first.
  }
};

/** As the page opens (main.tsx), before the app's code: the link in the address, and those the notifications' worker sends. */
export function listenForClicks() {
  const params = new URLSearchParams(location.search);
  const href = params.get('chat');
  if (href) {
    keep(href);
    params.delete('chat');
    const rest = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  }
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string; href?: string }>) => {
    if (event.data?.type !== 'open-chat' || typeof event.data.href !== 'string') return;
    if (!take) return keep(event.data.href);
    opened = true;
    take(event.data.href);
  });
  navigator.serviceWorker.startMessages();
}

/** Gives `open` the link of each notification clicked, one kept from before first. */
export function takeClicks(open: (href: string) => void) {
  take = open;
  let href: string | null = null;
  try {
    href = sessionStorage.getItem(KEPT);
    sessionStorage.removeItem(KEPT);
  } catch {
    href = null;
  }
  if (!href) return;
  opened = true;
  open(href);
}

/** Whether a notification clicked opened something: the person came to it, as if they had touched the page. */
export const openedByNotification = () => opened;
