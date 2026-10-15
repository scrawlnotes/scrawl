import { randomBytes } from 'node:crypto';
import { type Account, type Accounts, digestOf, Refused } from './auth';
import { type Db, transaction } from './db';
import type { SpaceInfo, Spaces } from './spaces';

// Links: an invite into a space, made by its managers, and a link for a new password, made by the
// owner or an admin. Each works once; an invite for a week, a password link for a day. Only the
// digest of a link's code is kept. The server sends no mail: a link goes by hand. See
// design/server.md, section 6.

const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** What a link is, for the app to say before it is used. */
export type Invitation =
  | { kind: 'space'; space: { id: string; name: string }; by: string; expires: number }
  | { kind: 'reset'; email: string; name: string; expires: number };

interface Row {
  kind: 'space' | 'reset';
  space_id: string | null;
  account_id: string | null;
  created_by: string;
  expires_at: number;
  used_at: number | null;
}

export class Invites {
  constructor(
    private readonly db: Db,
    private readonly accounts: Accounts,
    private readonly spaces: Spaces,
    private readonly url: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** An invite into a space, for one person. */
  invite(space: string, by: Account): { link: string; expires: number } {
    this.spaces.checkManager(space, by);
    return this.make('space', { space, by: by.id, ms: WEEK });
  }

  /** A link for a new password, for someone with an account here. */
  reset(account: string, by: Account): { link: string; expires: number } {
    if (by.role === 'member') throw new Refused(403, 'not-allowed', 'Only the owner and admins give a link for a new password');
    // An admin's link would let them in as the owner or another admin: those links are the owner's.
    const target = this.accounts.get(account);
    if (by.role === 'admin' && target.role !== 'member' && target.id !== by.id) throw new Refused(403, 'not-allowed', 'Only the owner gives a link for an admin’s or the owner’s new password');
    return this.make('reset', { account, by: by.id, ms: DAY });
  }

  /** What a link is; a refusal when it is not one, was used, or ran out. */
  look(code: string): Invitation {
    const row = this.row(code);
    if (row.kind === 'space') {
      const space = this.db.prepare('SELECT id, name FROM spaces WHERE id = ?').get(row.space_id) as { id: string; name: string } | undefined;
      if (!space) throw new Refused(404, 'no-invite', 'This link leads nowhere on this server');
      const by = this.db.prepare('SELECT name, email FROM accounts WHERE id = ?').get(row.created_by) as { name: string; email: string } | undefined;
      return { kind: 'space', space, by: by?.name || by?.email || '', expires: row.expires_at };
    }
    const account = this.accounts.get(row.account_id!);
    return { kind: 'reset', email: account.email, name: account.name, expires: row.expires_at };
  }

  /** Joins a space with an invite: the account with that email, its password checked, or a new member. */
  async accept(code: string, input: { name?: unknown; email?: unknown; password?: unknown; person?: unknown; device?: unknown }, from: string): Promise<{ token: string; account: Account; space: SpaceInfo }> {
    const row = this.row(code);
    if (row.kind !== 'space' || !row.space_id) throw new Refused(400, 'not-invite', 'This link is not an invite into a space');
    const account = await this.accounts.joining(input, from);
    const space = row.space_id;
    return transaction(this.db, () => {
      // Used by someone else meanwhile: it works once.
      if (this.row(code).used_at !== null) throw new Refused(410, 'invite-used', 'This link was used already');
      this.spaces.add(space, account.id, row.created_by);
      this.db.prepare('UPDATE invites SET used_at = ? WHERE code_hash = ?').run(this.now(), digestOf(code));
      return { token: this.accounts.newDevice(account.id, input.device), account, space: this.spaces.info(space, account.id) };
    });
  }

  /** Sets a new password with a link: the account's other keys end, and this device gets a new one. */
  async setPassword(code: string, input: { password?: unknown; device?: unknown }): Promise<{ token: string; account: Account }> {
    const row = this.row(code);
    if (row.kind !== 'reset' || !row.account_id) throw new Refused(400, 'not-reset', 'This link is not for a new password');
    const account = this.accounts.get(row.account_id);
    await this.accounts.setPassword(account.id, input.password);
    this.db.prepare('UPDATE invites SET used_at = ? WHERE code_hash = ?').run(this.now(), digestOf(code));
    return { token: this.accounts.newDevice(account.id, input.device), account };
  }

  private make(kind: 'space' | 'reset', { space, account, by, ms }: { space?: string; account?: string; by: string; ms: number }) {
    const code = randomBytes(18).toString('base64url');
    const expires = this.now() + ms;
    this.db
      .prepare('INSERT INTO invites (code_hash, kind, space_id, account_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(digestOf(code), kind, space ?? null, account ?? null, by, this.now(), expires);
    return { link: `${this.url}/join/${code}`, expires };
  }

  private row(code: string): Row {
    const row = this.db.prepare('SELECT * FROM invites WHERE code_hash = ?').get(digestOf(code)) as Row | undefined;
    if (!row) throw new Refused(404, 'no-invite', 'This link leads nowhere on this server');
    if (row.used_at !== null) throw new Refused(410, 'invite-used', 'This link was used already');
    if (row.expires_at < this.now()) throw new Refused(410, 'invite-expired', 'This link ran out');
    return row;
  }
}
