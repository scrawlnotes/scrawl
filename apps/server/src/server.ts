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
import { Due } from './due';
import { Notices } from './notices';
import { OAuth } from './oauth';
import { Push, type Sender, vapidKeys } from './push';
import { Spaces } from './spaces';
import { type VideoTools, Videos } from './video';
import { type WakeSend, Wakes } from './wake';

/** The server's parts on its data folder, and its app; for running it and for tests. */
export function makeServer(
  config: Config,
  options: {
    now?: () => number;
    pageSize?: number;
    fetchDoc?: typeof fetch;
    sender?: Sender;
    later?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
    minSyncLevel?: number;
    /** ffmpeg's, which `serve` finds; none in a test that does not give its own. */
    videoTools?: VideoTools | null;
    /** What sends an agent's wake; a test gives its own receiver. */
    wakeSend?: WakeSend;
  } = {},
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
  // A video that a computer cannot play gets a copy that plays everywhere (design/chat.md 27).
  const videos = options.videoTools ? new Videos(blobs, options.videoTools, (skip) => chats.nextVideo(skip), (hash, result) => chats.videoDone(hash, result)) : null;
  chats.videos = videos;
  // A push service takes an https address or an email as who sends.
  const subject = config.url.startsWith('https://') ? config.url : 'mailto:push@scrawlnotes.com';
  const push = new Push(db, live, chats, vapidKeys(join(config.data, 'vapid.json')), subject, config.url, options.sender, options.later);
  // An agent its owner mentions or answers wakes (design/agent-wake.md).
  const wakes = new Wakes(db, push, live, chats, config.url, now, options.wakeSend, options.later);
  wakes.directs();
  chats.onSent = (chat, message) => {
    push.sent(chat, message);
    wakes.sent(chat, message);
  };
  chats.onReacted = (chat, message, by, emoji) => push.reacted(chat, message, by, emoji);
  // A board or a task list written tells whoever it mentions or gives something to.
  const notices = new Notices(db, blobs, push, wakes);
  files.onWrite = (space, path, before, after, by) => notices.written(space, path, before, after, by);
  // Each morning at nine, the work due today and tomorrow.
  const due = new Due(db, blobs, push, now);
  const app = createApp({ config, blobs, files, accounts, spaces, live, invites, oauth, chats, push, wakes, now, ...(options.minSyncLevel !== undefined && { minSyncLevel: options.minSyncLevel }) });
  return { db, blobs, files, accounts, spaces, live, invites, oauth, chats, push, wakes, notices, due, app };
}
