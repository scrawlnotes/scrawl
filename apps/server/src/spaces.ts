import { type Account, Refused, type Role } from './auth';
import { type Db, transaction } from './db';

// The spaces on the server and who is in each. The owner and the admins open shared spaces;
// whoever opens one is its manager. A space's managers invite people, make others managers and
// take people out; the owner and the admins may do so in every space they are in. Everyone in a
// space edits what is in it. Someone sees only the spaces they are in. Anyone with an account opens
// a personal space of their own, one at most: only they are in it, so only they see it, and no one
// is invited into it or taken out of it. See PLAN 5.5, Roles, and design/spaces.md 4.

export type SpaceRole = 'manager' | 'member';

export interface SpaceInfo {
  id: string;
  name: string;
  role: SpaceRole;
  people: number;
  /** Its owner's own space, where no one else is. */
  personal: boolean;
}

/** Someone in a space, as its page lists them: their role there, and when one of their devices was last seen. */
export interface Member {
  id: string;
  email: string;
  name: string;
  role: SpaceRole;
  /** Their role on the server: its owner and admins are taken out of a space only by the owner or an admin. */
  serverRole: Role;
  seen: number | null;
}

/** A shared space as its owner and admins see it in the server's page: who is in it, by account. */
export interface SharedSpace {
  id: string;
  name: string;
  people: number;
  /** The accounts in it, by id. */
  members: string[];
}

const ID = /^sp-[a-z0-9]{8}$/;

export class Spaces {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /** The spaces this account is in. */
  of(account: string): SpaceInfo[] {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.name, m.role, (SELECT COUNT(*) FROM members x WHERE x.space_id = s.id) AS people, s.personal_of IS NOT NULL AS personal
         FROM members m JOIN spaces s ON s.id = m.space_id WHERE m.account_id = ? ORDER BY s.name COLLATE NOCASE`,
      )
      .all(account) as unknown as (Omit<SpaceInfo, 'personal'> & { personal: number })[];
    return rows.map((row) => ({ ...row, personal: row.personal === 1 }));
  }

  /**
   * Every shared space on the server with who is in it, for its owner and admins, whether they are
   * in it or not. No personal space: only its owner sees it.
   */
  shared(by: Account): SharedSpace[] {
    if (by.role === 'member') throw new Refused(403, 'not-allowed', 'Only the owner and admins see every space on this server');
    const spaces = this.db.prepare('SELECT id, name FROM spaces WHERE personal_of IS NULL ORDER BY name COLLATE NOCASE').all() as unknown as { id: string; name: string }[];
    const members = this.db
      .prepare('SELECT m.space_id AS space, m.account_id AS account FROM members m JOIN accounts a ON a.id = m.account_id WHERE a.disabled_at IS NULL')
      .all() as unknown as { space: string; account: string }[];
    return spaces.map((space) => {
      const ids = members.filter((m) => m.space === space.id).map((m) => m.account);
      return { ...space, people: ids.length, members: ids };
    });
  }

  /** A space this account is in. */
  info(space: string, account: string): SpaceInfo {
    const found = this.of(account).find((each) => each.id === space);
    if (!found) throw new Refused(404, 'no-space', 'No such space on this server');
    return found;
  }

  /**
   * A new space, with the one who opened it as its manager. Its id is the one the app made for it.
   * A shared one is opened by the owner or an admin; a personal one by anyone, once.
   */
  open(by: Account, input: { id?: unknown; name?: unknown; personal?: unknown }): SpaceInfo {
    const personal = input.personal === true;
    if (!personal && by.role === 'member') throw new Refused(403, 'not-allowed', 'Only the owner and admins of this server open spaces');
    const id = typeof input.id === 'string' ? input.id : '';
    if (!ID.test(id)) throw new Refused(400, 'bad-space', 'Not a space id');
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 200) : '';
    return transaction(this.db, () => {
      if (this.db.prepare('SELECT 1 FROM spaces WHERE id = ?').get(id)) throw new Refused(409, 'space-exists', 'A space with this id is on the server already');
      if (personal && this.db.prepare('SELECT 1 FROM spaces WHERE personal_of = ?').get(by.id)) throw new Refused(409, 'personal-exists', 'Your personal space is on this server already');
      this.db.prepare('INSERT INTO spaces (id, name, created_by, created_at, personal_of) VALUES (?, ?, ?, ?, ?)').run(id, name, by.id, this.now(), personal ? by.id : null);
      this.db.prepare('INSERT INTO members (space_id, account_id, role, added_by, added_at) VALUES (?, ?, ?, ?, ?)').run(id, by.id, 'manager', by.id, this.now());
      return { id, name, role: 'manager' as const, people: 1, personal };
    });
  }

  /** Whether the space is there and this account is in it: the files of a space are only for those in it. */
  check(space: string, account: string) {
    if (!this.db.prepare('SELECT 1 FROM spaces WHERE id = ?').get(space)) throw new Refused(404, 'no-space', 'No such space on this server');
    if (!this.roleOf(space, account)) throw new Refused(403, 'not-member', 'You are not in this space');
  }

  /** Everyone in a space: its managers first, then by name. */
  members(space: string): Member[] {
    return this.db
      .prepare(
        `SELECT a.id, a.email, a.name, m.role, a.role AS serverRole, (SELECT MAX(d.seen_at) FROM devices d WHERE d.account_id = a.id) AS seen
         FROM members m JOIN accounts a ON a.id = m.account_id WHERE m.space_id = ? AND a.disabled_at IS NULL
         ORDER BY CASE m.role WHEN 'manager' THEN 0 ELSE 1 END, a.name COLLATE NOCASE, a.email COLLATE NOCASE`,
      )
      .all(space) as unknown as Member[];
  }

  /** Whether this account manages the space: its manager, or the server's owner or an admin who is in it. */
  manages(space: string, by: Account): boolean {
    const role = this.roleOf(space, by.id);
    return role === 'manager' || (role !== undefined && by.role !== 'member');
  }

  /** Lets a space's managers through; refuses everyone else, and everyone in a personal space, where no one else comes in. */
  checkManager(space: string, by: Account) {
    if (this.db.prepare('SELECT 1 FROM spaces WHERE id = ? AND personal_of IS NOT NULL').get(space)) throw new Refused(403, 'personal', 'A personal space has no one else in it');
    if (!this.manages(space, by)) throw new Refused(403, 'not-allowed', 'Only the managers of this space do this');
  }

  /** Brings someone into a space, as a member, unless they are in it already. */
  add(space: string, account: string, by: string) {
    this.db.prepare("INSERT INTO members (space_id, account_id, role, added_by, added_at) VALUES (?, ?, 'member', ?, ?) ON CONFLICT DO NOTHING").run(space, account, by, this.now());
  }

  /** Makes someone in a space a manager, or a member again; a space keeps one manager at least. */
  setRole(space: string, account: string, role: unknown, by: Account) {
    this.checkManager(space, by);
    if (role !== 'manager' && role !== 'member') throw new Refused(400, 'bad-role', 'Someone in a space is a manager or a member');
    const now = this.roleOf(space, account);
    if (!now) throw new Refused(404, 'not-member', 'They are not in this space');
    if (now === 'manager' && role === 'member' && this.managerCount(space) === 1) throw new Refused(409, 'last-manager', 'A space keeps one manager at least');
    this.db.prepare('UPDATE members SET role = ? WHERE space_id = ? AND account_id = ?').run(role, space, account);
  }

  /**
   * Takes someone out of a space: they no longer reach it; what they did stays. Its last manager
   * stays, no one takes themselves out, and the server's owner and admins are taken out only by
   * the owner or an admin.
   */
  remove(space: string, account: string, by: Account) {
    this.checkManager(space, by);
    if (account === by.id) throw new Refused(409, 'yourself', 'You cannot take yourself out of the space');
    const role = this.roleOf(space, account);
    if (!role) throw new Refused(404, 'not-member', 'They are not in this space');
    const them = this.db.prepare('SELECT role FROM accounts WHERE id = ?').get(account) as { role: Role } | undefined;
    if (by.role === 'member' && them && them.role !== 'member') throw new Refused(403, 'not-allowed', 'Only the owner and admins take the owner or an admin out of a space');
    if (role === 'manager' && this.managerCount(space) === 1) throw new Refused(409, 'last-manager', 'A space keeps one manager at least');
    this.db.prepare('DELETE FROM members WHERE space_id = ? AND account_id = ?').run(space, account);
  }

  private roleOf(space: string, account: string): SpaceRole | undefined {
    return (this.db.prepare('SELECT role FROM members WHERE space_id = ? AND account_id = ?').get(space, account) as { role: SpaceRole } | undefined)?.role;
  }

  private managerCount(space: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM members WHERE space_id = ? AND role = 'manager'").get(space) as { n: number }).n;
  }
}
