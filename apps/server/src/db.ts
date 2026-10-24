import { DatabaseSync } from 'node:sqlite';

// The server's list of what it keeps: accounts and their devices, spaces and who is in them,
// invites, every file of every space with its versions, and the messages (design/chat.md). A
// file's content is not here but in the blobs beside it, by its digest. See design/server.md, section 4.

export type Db = DatabaseSync;

/** Each step brings the schema one version further; a database is taken through the ones it lacks, in order. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at INTEGER NOT NULL,
    disabled_at INTEGER
  );
  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    name TEXT NOT NULL DEFAULT '',
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    seen_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES accounts (id),
    created_at INTEGER NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    oldest_seq INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE members (
    space_id TEXT NOT NULL REFERENCES spaces (id),
    account_id TEXT NOT NULL REFERENCES accounts (id),
    role TEXT NOT NULL CHECK (role IN ('manager', 'member')),
    added_by TEXT,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (space_id, account_id)
  );
  CREATE TABLE invites (
    code_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('space', 'reset')),
    space_id TEXT REFERENCES spaces (id),
    account_id TEXT REFERENCES accounts (id),
    created_by TEXT NOT NULL REFERENCES accounts (id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE TABLE entries (
    space_id TEXT NOT NULL REFERENCES spaces (id),
    key TEXT NOT NULL,
    path TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('file', 'dir')),
    hash TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    seq INTEGER NOT NULL,
    author_id TEXT,
    device_id TEXT,
    at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (space_id, key)
  );
  CREATE INDEX entries_seq ON entries (space_id, seq);
  CREATE TABLE versions (
    space_id TEXT NOT NULL,
    path TEXT NOT NULL,
    from_path TEXT,
    op TEXT NOT NULL CHECK (op IN ('write', 'move', 'remove')),
    hash TEXT,
    size INTEGER,
    author_id TEXT,
    device_id TEXT,
    at INTEGER NOT NULL
  );
  CREATE INDEX versions_path ON versions (space_id, path);
  `,
  // Agents (design/agent.md, 7.2): the OAuth clients that registered themselves, the codes given
  // out while a sign-in is under way, and each agent connection, which is a device with an access
  // token that runs out and a refresh token that is turned over.
  `
  CREATE TABLE oauth_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    redirect_uris TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE oauth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    resource TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    scope TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    device_id TEXT
  );
  CREATE TABLE agents (
    device_id TEXT PRIMARY KEY REFERENCES devices (id),
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL DEFAULT '',
    access_expires_at INTEGER NOT NULL,
    refresh_hash TEXT UNIQUE,
    refresh_expires_at INTEGER,
    created_at INTEGER NOT NULL
  );
  `,
  // A personal space: its owner's account, one at most for each (design/spaces.md 3.3).
  `
  ALTER TABLE spaces ADD COLUMN personal_of TEXT REFERENCES accounts (id);
  CREATE UNIQUE INDEX spaces_personal ON spaces (personal_of) WHERE personal_of IS NOT NULL;
  `,
  // The person's time zone, as the app tells it: an agent's "today" is theirs, not the server's (design/agent-fixes.md 5).
  `
  ALTER TABLE accounts ADD COLUMN time_zone TEXT;
  `,
  // Each agent's own identity (design/activity.md 2.1): one for an account and an OAuth client,
  // made the first time it writes, kept when it signs in again; its name is the client's, and
  // the person changes it.
  `
  CREATE TABLE agent_identities (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    client_id TEXT NOT NULL,
    client TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (account_id, client_id)
  );
  `,
  // Messaging (design/chat.md, 11.1): the conversations, a space's rooms and the server's direct
  // messages; who is in each and how far they read; the messages with their files, mentions and
  // reactions; and what each person uploaded, which only they attach. Every change takes the
  // next number of the chat's own count, `chat_rev`, which a device asks what changed after.
  `
  CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('public', 'private', 'direct')),
    space_id TEXT REFERENCES spaces (id),
    name TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    general INTEGER NOT NULL DEFAULT 0,
    direct_key TEXT UNIQUE,
    created_by TEXT NOT NULL REFERENCES accounts (id),
    created_at INTEGER NOT NULL,
    archived_at INTEGER,
    last_seq INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX chats_name ON chats (space_id, name COLLATE NOCASE) WHERE kind <> 'direct';
  CREATE UNIQUE INDEX chats_general ON chats (space_id) WHERE general = 1;
  CREATE TABLE chat_members (
    chat_id TEXT NOT NULL REFERENCES chats (id),
    account_id TEXT NOT NULL REFERENCES accounts (id),
    added_by TEXT,
    joined_at INTEGER NOT NULL,
    left_at INTEGER,
    read_seq INTEGER NOT NULL DEFAULT 0,
    notify TEXT CHECK (notify IN ('all', 'mentions', 'off')),
    hidden INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL,
    PRIMARY KEY (chat_id, account_id)
  );
  CREATE INDEX chat_members_account ON chat_members (account_id);
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats (id),
    seq INTEGER NOT NULL,
    author_id TEXT NOT NULL REFERENCES accounts (id),
    agent_id TEXT,
    body TEXT NOT NULL DEFAULT '',
    mentions_room INTEGER NOT NULL DEFAULT 0,
    reply_to TEXT,
    forward_of TEXT,
    forward_from TEXT,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    deleted_at INTEGER,
    rev INTEGER NOT NULL,
    UNIQUE (chat_id, seq)
  );
  CREATE INDEX messages_rev ON messages (rev);
  CREATE TABLE message_files (
    message_id TEXT NOT NULL REFERENCES messages (id),
    n INTEGER NOT NULL,
    hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration REAL,
    thumb TEXT,
    PRIMARY KEY (message_id, n)
  );
  CREATE INDEX message_files_hash ON message_files (hash);
  CREATE INDEX message_files_thumb ON message_files (thumb);
  CREATE TABLE mentions (
    message_id TEXT NOT NULL REFERENCES messages (id),
    account_id TEXT NOT NULL,
    PRIMARY KEY (message_id, account_id)
  );
  CREATE TABLE reactions (
    message_id TEXT NOT NULL REFERENCES messages (id),
    account_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (message_id, account_id, emoji)
  );
  CREATE TABLE chat_uploads (
    hash TEXT NOT NULL,
    account_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (hash, account_id)
  );
  INSERT INTO meta (key, value) VALUES ('chat_rev', '0');
  `,
  // Notifications by Web Push (design/chat.md, 11.4): each browser that asked for them, by the
  // address its push service gave it, for the person and the device it is on.
  `
  CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    device_id TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    failed_at INTEGER
  );
  CREATE INDEX push_subscriptions_account ON push_subscriptions (account_id);
  `,
  // Messages found by their words (design/chat.md, 7 and 11.6): each message's words and its
  // files' names, folded as the app's search folds them. Only the words are kept, not the text;
  // the messages from before it are put in at the next start (Chats.indexMessages).
  `
  CREATE VIRTUAL TABLE messages_fts USING fts5 (text, content = '', contentless_delete = 1, tokenize = 'unicode61 remove_diacritics 2');
  INSERT INTO meta (key, value) VALUES ('chat_fts', '0');
  `,
];

export function openDb(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined;
  for (let version = Number(row?.value ?? 0); version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]!);
      db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(String(version + 1));
    });
  }
}

/** Runs `run` as one transaction: all of it is kept, or none of it. */
export function transaction<T>(db: Db, run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
