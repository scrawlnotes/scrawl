// What was opened last on a device, the latest first: the start page's Recent. It is kept on the
// device by the id of each tab and the moment it was last on screen, and is never synced. What
// moves or is renamed keeps its place under its new id; what is gone is left out where the list is
// shown, so that it comes back with the thing if it is restored.

export interface Seen {
  /** The tab's id: a path, or a collection's or a filter's tab. */
  id: string;
  /** When it was last on screen, in milliseconds. */
  at: number;
}

/** How many are kept: more than are shown, so that what was deleted leaves room for the next. */
export const RECENT_KEPT = 50;

/** The list as it was kept; anything unreadable in it is left out. */
export function parseRecent(text: string | null): Seen[] {
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Seen[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const { id, at } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof at !== 'number' || !Number.isFinite(at)) continue;
    if (out.some((seen) => seen.id === id)) continue;
    out.push({ id, at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, RECENT_KEPT);
}

export const serializeRecent = (recent: Seen[]): string => JSON.stringify(recent);

/** `id` was on screen at `at`: it goes first. */
export function seenNow(recent: Seen[], id: string, at: number): Seen[] {
  return [{ id, at }, ...recent.filter((seen) => seen.id !== id)].slice(0, RECENT_KEPT);
}

/** What was at `from` is at `to` now: it keeps its place and its moment under its new id. */
export function seenMoved(recent: Seen[], from: string, to: string): Seen[] {
  if (from === to || !recent.some((seen) => seen.id === from)) return recent;
  return recent.filter((seen) => seen.id !== to).map((seen) => (seen.id === from ? { ...seen, id: to } : seen));
}
