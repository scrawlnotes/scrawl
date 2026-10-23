import type { VaultFs } from './fs';
import { sameLabel } from './labels';
import { isUnder } from './vault';

// Favorites (design/filters.md 5): what the person starred, in the sidebar under Filters & Labels
// and at the top of a phone's Browse, in the order they were starred or dragged into. A note, a
// task list, a board, a keys file or a collection by its path as the app has it; a saved filter by
// its id; a label by its name in its space. They are the person's: `.scrawl/favorites.json` in the
// personal space, synced to their devices. What is in the trash, or gone, is left out where they
// are shown, so that it comes back with the thing when it is restored.

export type Favorite =
  | { item: string }
  | { filter: string }
  /** `space` as a path of the space is written, `@sp-…`; none for the personal one. */
  | { label: string; space?: string };

export const FAVORITES_FILE = '.scrawl/favorites.json';

/** What tells one favorite from another: two writings of a label in different cases are one. */
export function favoriteKey(favorite: Favorite): string {
  if ('item' in favorite) return `item:${favorite.item}`;
  if ('filter' in favorite) return `filter:${favorite.filter}`;
  return `label:${favorite.space ?? ''}:${favorite.label.toLowerCase()}`;
}

const word = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

/** Reads the favorites; what is not one, and a second writing of one, is left out. */
export function parseFavorites(text: string): Favorite[] {
  let data: { favorites?: unknown } | null;
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return [];
  }
  if (!Array.isArray(data?.favorites)) return [];
  const favorites: Favorite[] = [];
  for (const raw of data.favorites as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const each = raw as Record<string, unknown>;
    const [item, filter, label, space] = [word(each.item), word(each.filter), word(each.label), word(each.space)];
    const favorite: Favorite | null = item ? { item } : filter ? { filter } : label ? { label, ...(space && { space }) } : null;
    if (favorite && !isFavorite(favorites, favorite)) favorites.push(favorite);
  }
  return favorites;
}

export const serializeFavorites = (favorites: Favorite[]) => `${JSON.stringify({ version: 1, favorites }, null, 2)}\n`;

/** The person's favorites; none when there is no file yet. */
export async function loadFavorites(fs: VaultFs): Promise<Favorite[]> {
  try {
    return parseFavorites(await fs.readText(FAVORITES_FILE));
  } catch {
    return [];
  }
}

export const saveFavorites = (fs: VaultFs, favorites: Favorite[]) => fs.writeText(FAVORITES_FILE, serializeFavorites(favorites));

export const isFavorite = (favorites: Favorite[], favorite: Favorite) => favorites.some((each) => favoriteKey(each) === favoriteKey(favorite));

/** Stars `favorite`, after the others, or with `on` false takes its star off. */
export function starFavorite(favorites: Favorite[], favorite: Favorite, on: boolean): Favorite[] {
  if (on) return isFavorite(favorites, favorite) ? favorites : [...favorites, favorite];
  return favorites.filter((each) => favoriteKey(each) !== favoriteKey(favorite));
}

/**
 * What was at `from`, and everything in it when it is a folder, is at `to` now, moved or renamed:
 * the stars go with it. The same list when nothing starred was there.
 */
export function moveFavorites(favorites: Favorite[], from: string, to: string): Favorite[] {
  if (!favorites.some((each) => 'item' in each && isUnder(each.item, from))) return favorites;
  return favorites.map((each) => ('item' in each && isUnder(each.item, from) ? { item: to + each.item.slice(from.length) } : each));
}

/**
 * A label of a space (`@sp-…`, none for the personal one) renamed, in any case: its star goes with
 * it, and is one with the star of the label it was renamed to. With `to` null the label is gone,
 * and so is its star.
 */
export function relabelFavorites(favorites: Favorite[], space: string | undefined, from: string, to: string | null): Favorite[] {
  const isIt = (each: Favorite) => 'label' in each && (each.space ?? '') === (space ?? '') && sameLabel(each.label, from);
  if (!favorites.some(isIt)) return favorites;
  const renamed: Favorite[] = [];
  for (const each of favorites) {
    const now = !isIt(each) ? each : to === null ? null : { label: to, ...(space && { space }) };
    if (now && !isFavorite(renamed, now)) renamed.push(now);
  }
  return renamed;
}
