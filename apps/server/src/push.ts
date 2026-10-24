import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';
import { Refused } from './auth';
import type { Chats } from './chat';
import type { Db } from './db';
import type { Live } from './live';

// Notifications on the phone and in the browser (design/chat.md, 6 and 11.4): Web Push, sent by
// this server straight to the push service of the browser that subscribed (Apple's, Google's,
// Mozilla's), encrypted for that browser alone; nothing of ours runs between. The server signs as
// itself (VAPID) with a key made at its first start and kept in the data folder.
//
// A new message tells those its conversation's rules say (Chats.alertsFor), but not while the
// conversation is on one of their screens; someone using Scrawl on a device has a minute to read
// it there before their other devices hear of it; and the device in use is told by the live
// channel, not by a push. What waits is kept in the process: a restart drops it, the message stays.

/** How long a message waits for someone using Scrawl on a device before their other devices are told. */
export const WAIT_MS = 60_000;

/** A browser's subscription, as its Push API gives it. */
export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** What a push carries: what the service worker shows, and where a click goes. */
export interface PushPayload {
  title: string;
  body: string;
  /** What is unread and tells the person, everywhere: the app's badge. */
  badge: number;
  /** What is unread and tells them in this conversation: "3 new messages" under its notification. */
  count: number;
  server: string;
  chat: string;
  message: string;
  /** One notification a conversation: the next replaces it. */
  tag: string;
}

/** Sends a push; the push service's status comes back, or the call throws with it. */
export type Sender = (subscription: PushSubscription, payload: string, options: { TTL: number; urgency: 'high' | 'normal' }) => Promise<{ statusCode: number }>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** The server's VAPID keys, made the first time and kept in `file`, which the backup has. */
export function vapidKeys(file: string): VapidKeys {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as VapidKeys;
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  return keys;
}

interface SubscriptionRow {
  endpoint: string;
  account_id: string;
  device_id: string;
  p256dh: string;
  auth: string;
}

export class Push {
  /** Messages waiting for someone who uses Scrawl elsewhere to read them there. */
  private readonly waiting = new Set<ReturnType<typeof setTimeout>>();
  private readonly sender: Sender;

  constructor(
    private readonly db: Db,
    private readonly live: Live,
    private readonly chats: Chats,
    readonly keys: VapidKeys,
    /** Who the server is to the push services: its address when it is https, else an email. */
    private readonly subject: string,
    /** Where the app is: what a push names as the server, as the app's links do. */
    private readonly server: string,
    sender?: Sender,
    private readonly later: (run: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  ) {
    this.sender =
      sender ??
      ((subscription, payload, options) =>
        webpush.sendNotification(subscription, payload, { ...options, vapidDetails: { subject: this.subject, publicKey: this.keys.publicKey, privateKey: this.keys.privateKey } }));
  }

  /** A browser's subscription, for the person and the device that gave it; the same browser again replaces it. */
  subscribe(account: string, device: string, input: unknown) {
    const given = input as Partial<PushSubscription> | null;
    const endpoint = typeof given?.endpoint === 'string' ? given.endpoint : '';
    const p256dh = typeof given?.keys?.p256dh === 'string' ? given.keys.p256dh : '';
    const auth = typeof given?.keys?.auth === 'string' ? given.keys.auth : '';
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth) throw new Refused(400, 'bad-subscription', 'A push subscription has an https endpoint and its keys');
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, account_id, device_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET account_id = excluded.account_id, device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth, failed_at = NULL`,
      )
      .run(endpoint, account, device, p256dh, auth, Date.now());
  }

  /** Notifications off on a device: its subscription goes. */
  unsubscribe(account: string, endpoint: unknown) {
    if (typeof endpoint !== 'string') throw new Refused(400, 'bad-subscription', 'Which subscription?');
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND account_id = ?').run(endpoint, account);
  }

  /** Send a test notification: to this device's subscriptions; how many it went to. */
  async test(account: string, device: string): Promise<number> {
    const rows = this.subscriptionsOf(account).filter((row) => row.device_id === device);
    const payload: PushPayload = { title: 'Scrawl', body: 'Notifications work on this device.', badge: this.chats.alertCount(account), count: 1, server: this.server, chat: '', message: '', tag: 'test' };
    await Promise.all(rows.map((row) => this.deliver(row, payload, 'high')));
    return rows.length;
  }

  /** A message was written: those it tells hear of it now, or in a minute if they use Scrawl elsewhere and have not read it. */
  sent(chat: string, message: string) {
    for (const { account } of this.chats.alertsFor(message)) {
      if (this.live.isViewing(account, chat)) continue;
      if (!this.live.isActive(account)) {
        void this.tell(account, chat, message);
        continue;
      }
      const timer = this.later(() => {
        this.waiting.delete(timer);
        void this.tell(account, chat, message);
      }, WAIT_MS);
      // A minute's wait never keeps the process alive on its own.
      (timer as { unref?: () => void }).unref?.();
      this.waiting.add(timer);
    }
  }

  stop() {
    for (const timer of this.waiting) clearTimeout(timer);
    this.waiting.clear();
  }

  /** Tells someone's devices of a message, when it still tells them: not read, not deleted, not on a screen. */
  private async tell(account: string, chat: string, message: string) {
    const still = this.chats.alertsFor(message).find((each) => each.account === account);
    if (!still || this.live.isViewing(account, chat)) return;
    const content = this.chats.pushContent(message, account);
    if (!content) return;
    const chats = this.chats.list(account);
    const badge = chats.reduce((sum, each) => sum + each.alerts, 0);
    const count = chats.find((each) => each.id === chat)?.alerts ?? 1;
    const payload: PushPayload = { title: content.title, body: content.body, badge, count, server: this.server, chat, message, tag: chat };
    // The device in use hears it on the live channel.
    const rows = this.subscriptionsOf(account).filter((row) => !this.live.isDeviceActive(row.device_id));
    await Promise.all(rows.map((row) => this.deliver(row, payload, still.mention || content.direct ? 'high' : 'normal')));
  }

  /** One push; a subscription its service says is gone (404, 410) goes too, one that failed otherwise is marked. */
  private async deliver(row: SubscriptionRow, payload: PushPayload, urgency: 'high' | 'normal') {
    try {
      await this.sender({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), { TTL: 24 * 60 * 60, urgency });
      this.db.prepare('UPDATE push_subscriptions SET failed_at = NULL WHERE endpoint = ? AND failed_at IS NOT NULL').run(row.endpoint);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(row.endpoint);
      else this.db.prepare('UPDATE push_subscriptions SET failed_at = ? WHERE endpoint = ?').run(Date.now(), row.endpoint);
    }
  }

  /** Someone's subscriptions, on devices still signed in. */
  private subscriptionsOf(account: string): SubscriptionRow[] {
    return this.db
      .prepare('SELECT s.* FROM push_subscriptions s JOIN devices d ON d.id = s.device_id WHERE s.account_id = ? AND d.revoked_at IS NULL')
      .all(account) as unknown as SubscriptionRow[];
  }
}
