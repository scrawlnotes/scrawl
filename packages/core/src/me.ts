import type { VaultFs } from './fs';

// Who the user is: an id made once, a name and an email. It is kept in the personal space, so
// that every device of the user and every space they open knows the same person. The name and
// the email may be empty; such a person shows as Unnamed where a name is expected, and the id
// is what everything is tied to, so that a name set later reaches what was done before.

const FILE = '.scrawl/me.json';

export interface Me {
  id: string;
  name?: string;
  email?: string;
}

const clean = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** The person a file describes; none when the file has no id. */
export function parseMe(text: string): Me | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { id, name, email, version: _version, ...rest } = data as Record<string, unknown>;
  if (typeof id !== 'string' || !id.trim()) return null;
  // Unknown fields are kept, so a newer version's settings survive an older one saving.
  return { ...rest, id: id.trim(), ...(clean(name) && { name: clean(name) }), ...(clean(email) && { email: clean(email) }) };
}

export const serializeMe = (me: Me) => `${JSON.stringify({ version: 1, ...me }, null, 2)}\n`;

/** A new person, with an id of their own. */
export const newMe = (name?: string, email?: string): Me => ({ id: crypto.randomUUID(), ...(clean(name) && { name: clean(name) }), ...(clean(email) && { email: clean(email) }) });

/** The person the personal space belongs to; none until the first start wrote one. */
export async function loadMe(fs: VaultFs): Promise<Me | null> {
  try {
    return parseMe(await fs.readText(FILE));
  } catch {
    return null;
  }
}

export const saveMe = (fs: VaultFs, me: Me) => fs.writeText(FILE, serializeMe(me));

/**
 * The person from three versions of the file. Two devices that both made a person before the
 * first sync between them have two ids: the one that was synced first stays, since it may be in
 * a space's people already; the fields are merged as those of any record.
 */
export function mergeMe(base: Me | null, local: Me | null, remote: Me | null, mergeFields: (was: Me | undefined, mine: Me, theirs: Me) => Me): Me | null {
  if (!local) return remote;
  if (!remote) return local;
  const merged = mergeFields(base ?? undefined, local, remote);
  return { ...merged, id: base?.id ?? remote.id };
}
