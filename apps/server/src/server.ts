import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app';
import { Accounts } from './auth';
import { Blobs } from './blobs';
import { Chats } from './chat';
import type { Config } from './config';
import { type Db, openDb } from './db';
import { SpaceFiles } from './files';
import { Invites } from './invites';
import { Live } from './live';
import { OAuth } from './oauth';
import { Push, type Sender, vapidKeys } from './push';
import { Spaces } from './spaces';

/** The server's parts on its data folder, and its app; for running it and for tests. */
export function makeServer(
  config: Config,
  options: { now?: () => number; pageSize?: number; fetchDoc?: typeof fetch; sender?: Sender; later?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>; minSyncLevel?: number } = {},
) {
  const now = options.now ?? Date.now;
  mkdirSync(config.data, { recursive: true });
  const db: Db = openDb(join(config.data, 'scrawl.db'));
  const blobs = new Blobs(join(config.data, 'blobs'));
  const live = new Live(db);
  const files = new SpaceFiles(db, blobs, now, options.pageSize, (space, seq) => live.changed(space, seq));
  const accounts = new Accounts(db, { ownerEmail: config.ownerEmail, startedAt: now() }, now);
  const spaces = new Spaces(db, now);
  const invites = new Invites(db, accounts, spaces, config.url, now);
  const oauth = new OAuth(db, accounts, config.url, now, options.fetchDoc);
  const chats = new Chats(db, spaces, blobs, (people, event) => live.tell(people, event), now);
  // Spaces from before messaging get their general rooms.
  chats.openGenerals();
  // Messages written before search came are found too.
  chats.indexMessages();
  // A push service takes an https address or an email as who sends.
  const subject = config.url.startsWith('https://') ? config.url : 'mailto:push@scrawlnotes.com';
  const push = new Push(db, live, chats, vapidKeys(join(config.data, 'vapid.json')), subject, config.url, options.sender, options.later);
  chats.onSent = (chat, message) => push.sent(chat, message);
  const app = createApp({ config, blobs, files, accounts, spaces, live, invites, oauth, chats, push, now, ...(options.minSyncLevel !== undefined && { minSyncLevel: options.minSyncLevel }) });
  return { db, blobs, files, accounts, spaces, live, invites, oauth, chats, push, app };
}
