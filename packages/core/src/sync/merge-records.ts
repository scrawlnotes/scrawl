// Three-way merging of records: what changed on one side is taken from it, what changed on both
// is settled by a rule that gives the same answer whichever side is local. Two devices that merge
// the same three versions must write the same bytes, or they would keep correcting each other.
// See design/sync.md, section 5.

/** JSON with every object's keys sorted, so that equal values are written the same. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** The larger of two values by their canonical JSON: a choice every device makes alike. */
function larger<T>(a: T, b: T): T {
  return canonical(a) >= canonical(b) ? a : b;
}

/**
 * One value from three: the side that changed it, or when both did, the newer side, or when
 * neither is newer, the larger.
 */
export function mergeValue<T>(base: T | undefined, local: T, remote: T, localNewer: boolean | null = null): T {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if (localNewer === null) return larger(local, remote);
  return localNewer ? local : remote;
}

/**
 * A record from three versions, field by field. With `stamp` (`updated`), a field changed on both
 * sides is taken from the side changed later, and the stamp is the later of the two.
 */
export function mergeFields<T extends object>(base: T | undefined, local: T, remote: T, stamp?: keyof T & string): T {
  const b = (base ?? {}) as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  const r = remote as Record<string, unknown>;
  let localNewer: boolean | null = null;
  if (stamp) {
    const ls = String(l[stamp] ?? '');
    const rs = String(r[stamp] ?? '');
    localNewer = ls > rs ? true : ls < rs ? false : null;
  }
  // The base's keys keep their order; keys only the sides have follow, sorted, so the order does
  // not depend on which side is which.
  const known = Object.keys(b);
  const added = [...new Set([...Object.keys(l), ...Object.keys(r)])].filter((k) => !(k in b)).sort();
  const out: Record<string, unknown> = {};
  for (const key of [...known, ...added]) {
    const value =
      key === stamp
        ? [l[key], r[key]].filter((v): v is string => typeof v === 'string').sort().pop()
        : mergeValue(base === undefined ? undefined : b[key], l[key], r[key], localNewer);
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/**
 * The order of a list from three: the side that reordered it, or when both did, the larger
 * order. Ids the chosen order lacks are put in after the ids they follow on their own side.
 */
export function mergeOrder(base: string[], local: string[], remote: string[]): string[] {
  const reordered = (side: string[]) => {
    const kept = side.filter((id) => base.includes(id));
    return !same(kept, base.filter((id) => side.includes(id)));
  };
  const localMoved = reordered(local);
  const remoteMoved = reordered(remote);
  const chosen = localMoved && !remoteMoved ? local : remoteMoved && !localMoved ? remote : larger(local, remote);
  const other = chosen === local ? remote : local;
  const out = [...chosen];
  let at = -1;
  for (const id of other) {
    const there = out.indexOf(id);
    if (there >= 0) at = there;
    else out.splice(++at, 0, id);
  }
  return out;
}

/**
 * A list of records with ids from three versions. A record added on one side stays; one deleted
 * on one side goes unless the other side changed it; one on both sides is merged by `mergeOne`.
 */
export function mergeRecords<T>(
  base: T[],
  local: T[],
  remote: T[],
  idOf: (record: T) => string,
  mergeOne: (base: T | undefined, local: T, remote: T) => T,
): T[] {
  const byId = (list: T[]) => new Map(list.map((record) => [idOf(record), record]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  const merged = new Map<string, T>();
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const was = b.get(id);
    const mine = l.get(id);
    const theirs = r.get(id);
    if (mine !== undefined && theirs !== undefined) merged.set(id, mergeOne(was, mine, theirs));
    else {
      const kept = (mine ?? theirs)!;
      // Gone on the other side: it stays only when it was added, or changed since.
      if (was === undefined || !same(kept, was)) merged.set(id, kept);
    }
  }
  const order = mergeOrder([...b.keys()], [...l.keys()], [...r.keys()]);
  return order.filter((id) => merged.has(id)).map((id) => merged.get(id)!);
}

/**
 * Gives the records of each group that share a position new positions in a row, by their old
 * position then id; groups without a clash keep theirs, so a merge changes no more than it must.
 */
export function spreadOrder<T extends { id: string; order: number }>(records: T[], groupOf: (record: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const record of records) groups.set(groupOf(record), [...(groups.get(groupOf(record)) ?? []), record]);
  const placed = new Map<string, number>();
  for (const group of groups.values()) {
    const orders = group.map((r) => r.order);
    if (new Set(orders).size === orders.length) continue;
    [...group]
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .forEach((record, i) => placed.set(record.id, i));
  }
  return records.map((record) => (placed.has(record.id) ? { ...record, order: placed.get(record.id)! } : record));
}
