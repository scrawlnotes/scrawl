import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SETUP_MS } from './config';
import { type Db, transaction } from './db';

// Accounts and devices. An account is an email and a password on this server; whoever connects
// to it first, while it has none, becomes its owner. Each device signed in has a key of its own,
// of which only the digest is kept; signing out or being taken off the server ends it. See
// design/server.md, section 6.

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MIN_PASSWORD = 8;

export type Role = 'owner' | 'admin' | 'member';

export interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** What a request that asks for something it cannot have is told: the code says what, for the app to say it in its words. */
export class Refused extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'Refused';
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function passwordMatches(stored: string, password: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const given = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return timingSafeEqual(expected, given);
}

export const digestOf = (text: string) => createHash('sha256').update(text).digest('hex');

const cleanEmail = (email: unknown) => (typeof email === 'string' ? email.trim() : '');
const cleanName = (name: unknown) => (typeof name === 'string' ? name.trim().slice(0, 200) : '');

function checkSignUp(email: string, password: unknown): asserts password is string {
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Refused(400, 'bad-email', 'An email is needed');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new Refused(400, 'short-password', `The password needs at least ${MIN_PASSWORD} characters`);
}

/** Five tries a minute for an email from one address; the sixth waits. */
export class Tries {
  private readonly seen = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  take(key: string) {
    const since = this.now() - 60_000;
    const tries = (this.seen.get(key) ?? []).filter((at) => at > since);
    if (tries.length >= 5) throw new Refused(429, 'too-many', 'Too many tries; wait a minute');
    tries.push(this.now());
    this.seen.set(key, tries);
  }
}

export class Accounts {
  readonly tries: Tries;

  constructor(
    private readonly db: Db,
    private readonly options: { ownerEmail: string | null; startedAt: number },
    private readonly now: () => number = Date.now,
  ) {
    this.tries = new Tries(now);
  }

  isNew(): boolean {
    return !this.db.prepare('SELECT 1 FROM accounts LIMIT 1').get();
  }

  /** A new server can be set up for an hour after it started; restarting it opens that hour again. */
  setupOpen(): boolean {
    return this.isNew() && this.now() - this.options.startedAt < SETUP_MS;
  }

  /** The first account, the owner's, with this device's key. */
  async setUp(input: { name?: unknown; email?: unknown; password?: unknown; person?: unknown; device?: unknown }): Promise<{ token: string; account: Account }> {
    const email = cleanEmail(input.email);
    checkSignUp(email, input.password);
    if (!this.isNew()) throw new Refused(409, 'set-up', 'This server is set up already');
    if (!this.setupOpen()) throw new Refused(410, 'setup-closed', 'The time to set up this server ran out; restart it, then connect again');
    if (this.options.ownerEmail && this.options.ownerEmail.toLowerCase() !== email.toLowerCase()) throw new Refused(403, 'not-owner', 'This server is set up by another email');
    const password = await hashPassword(input.password);
    const account: Account = { id: personId(input.person), email, name: cleanName(input.name), role: 'owner' };
    return transaction(this.db, () => {
      // Two who connect at once: the one whose transaction comes second finds the owner there.
      if (!this.isNew()) throw new Refused(409, 'set-up', 'This server is set up already');
      this.db.prepare('INSERT INTO accounts (id, email, name, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(account.id, email, account.name, password, 'owner', this.now());
      return { token: this.newDevice(account.id, input.device), account };
    });
  }

  /** Signs in on a device: a key of its own. */
  async signIn(input: { email?: unknown; password?: unknown; device?: unknown }, from: string): Promise<{ token: string; account: Account }> {
    const email = cleanEmail(input.email);
    this.tries.take(`${email.toLowerCase()} ${from}`);
    const row = this.db.prepare('SELECT * FROM accounts WHERE email = ? AND disabled_at IS NULL').get(email) as (Account & { password: string }) | undefined;
    if (!row) throw new Refused(401, 'no-account', 'No account with this email on this server');
    if (typeof input.password !== 'string' || !(await passwordMatches(row.password, input.password))) throw new Refused(401, 'wrong-password', 'The password is not right');
    return { token: this.newDevice(row.id, input.device), account: { id: row.id, email: row.email, name: row.name, role: row.role } };
  }

  /** The account and device a key belongs to, or null. */
  byToken(token: string): { account: Account; device: string } | null {
    const row = this.db
      .prepare(
        `SELECT a.id, a.email, a.name, a.role, d.id AS device, d.seen_at FROM devices d JOIN accounts a ON a.id = d.account_id
         WHERE d.token_hash = ? AND d.revoked_at IS NULL AND a.disabled_at IS NULL`,
      )
      .get(digestOf(token)) as (Account & { device: string; seen_at: number }) | undefined;
    if (!row) return null;
    // When a device was last seen, to the minute; not written on every request.
    if (this.now() - row.seen_at > 60_000) this.db.prepare('UPDATE devices SET seen_at = ? WHERE id = ?').run(this.now(), row.device);
    return { account: { id: row.id, email: row.email, name: row.name, role: row.role }, device: row.device };
  }

  signOut(device: string) {
    this.db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ?').run(this.now(), device);
  }

  private newDevice(account: string, name: unknown): string {
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO devices (id, account_id, name, token_hash, created_at, seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), account, cleanName(name), digestOf(token), this.now(), this.now());
    return token;
  }
}

/** The person's id from their `me.json`, which an account keeps so that tasks given to them stay theirs. */
function personId(person: unknown): string {
  return typeof person === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(person) ? person : randomUUID();
}
