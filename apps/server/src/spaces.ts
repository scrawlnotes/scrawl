import { type Account, Refused } from './auth';
import { type Db, transaction } from './db';

// The spaces on the server and who is in each. The owner and the admins open spaces; whoever
// opens one is its manager. Someone sees only the spaces they are in. See PLAN 5.5, Roles.

export type SpaceRole = 'manager' | 'member';

export interface SpaceInfo {
  id: string;
  name: string;
  role: SpaceRole;
  people: number;
}

const ID = /^sp-[a-z0-9]{8}$/;

export class Spaces {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /** The spaces this account is in. */
  of(account: string): SpaceInfo[] {
    return this.db
      .prepare(
        `SELECT s.id, s.name, m.role, (SELECT COUNT(*) FROM members x WHERE x.space_id = s.id) AS people
         FROM members m JOIN spaces s ON s.id = m.space_id WHERE m.account_id = ? ORDER BY s.name COLLATE NOCASE`,
      )
      .all(account) as unknown as SpaceInfo[];
  }

  /** A new space, with the one who opened it as its manager. Its id is the one the app made for it. */
  open(by: Account, input: { id?: unknown; name?: unknown }): SpaceInfo {
    if (by.role === 'member') throw new Refused(403, 'not-allowed', 'Only the owner and admins of this server open spaces');
    const id = typeof input.id === 'string' ? input.id : '';
    if (!ID.test(id)) throw new Refused(400, 'bad-space', 'Not a space id');
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 200) : '';
    return transaction(this.db, () => {
      if (this.db.prepare('SELECT 1 FROM spaces WHERE id = ?').get(id)) throw new Refused(409, 'space-exists', 'A space with this id is on the server already');
      this.db.prepare('INSERT INTO spaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(id, name, by.id, this.now());
      this.db.prepare('INSERT INTO members (space_id, account_id, role, added_by, added_at) VALUES (?, ?, ?, ?, ?)').run(id, by.id, 'manager', by.id, this.now());
      return { id, name, role: 'manager' as const, people: 1 };
    });
  }

  /** Whether the space is there and this account is in it: the files of a space are only for those in it. */
  check(space: string, account: string) {
    if (!this.db.prepare('SELECT 1 FROM spaces WHERE id = ?').get(space)) throw new Refused(404, 'no-space', 'No such space on this server');
    if (!this.db.prepare('SELECT 1 FROM members WHERE space_id = ? AND account_id = ?').get(space, account)) throw new Refused(403, 'not-member', 'You are not in this space');
  }
}
