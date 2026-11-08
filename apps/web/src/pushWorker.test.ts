import { describe, expect, it } from 'vitest';
import worker from '../public/push-sw.js?raw';

// The notifications' worker (public/push-sw.js), run here with a stand-in for the browser: a
// click opens what the notification is of (design/notifications.md 6): a card or a task at its
// comment, else the message; in the app when it is open, else in a new window.

type Listener = (event: unknown) => void;

function load(windows: { focused: boolean; posted: unknown[] }[]) {
  const listeners: Record<string, Listener> = {};
  const opened: string[] = [];
  const self = {
    addEventListener: (type: string, listener: Listener) => (listeners[type] = listener),
    skipWaiting: () => undefined,
    registration: { showNotification: () => Promise.resolve() },
    clients: {
      matchAll: () => Promise.resolve(windows.map((each) => ({ focused: each.focused, postMessage: (message: unknown) => each.posted.push(message), focus: () => Promise.resolve() }))),
      openWindow: (url: string) => (opened.push(url), Promise.resolve()),
    },
  };
  new Function('self', worker)(self);
  const click = async (data: object) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.notificationclick!({ notification: { data, close: () => undefined }, waitUntil: (work: Promise<unknown>) => (done = work) });
    await done;
  };
  return { click, opened };
}

const CARD = 'scrawl:item/card/sp-1/Roadmap.board.json?id=card1&comment=cm1';

describe('a notification clicked', () => {
  it("opens a card's notice at its comment in the app that is open", async () => {
    const app = { focused: true, posted: [] as unknown[] };
    const { click, opened } = load([app]);
    await click({ server: 'https://kaan.scrawlnotes.com', href: CARD, tag: 'n1' });
    expect(app.posted).toEqual([{ type: 'open-chat', href: CARD }]);
    expect(opened).toEqual([]);
  });

  it('opens the app at it when it is closed', async () => {
    const { click, opened } = load([]);
    await click({ server: 'https://kaan.scrawlnotes.com', href: CARD });
    expect(opened).toEqual([`/?chat=${encodeURIComponent(CARD)}`]);
  });

  it('opens a message as before, and nothing else a notification may carry', async () => {
    const app = { focused: false, posted: [] as unknown[] };
    const { click } = load([app]);
    await click({ server: 'https://kaan.scrawlnotes.com', chat: 'c1', message: 'm1' });
    await click({ server: 'https://kaan.scrawlnotes.com', href: 'https://elsewhere.example.com/' });
    expect(app.posted).toEqual([{ type: 'open-chat', href: 'scrawl:chat/https%3A%2F%2Fkaan.scrawlnotes.com/c1/m1' }]);
  });
});
