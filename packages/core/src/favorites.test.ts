import { describe, expect, it } from 'vitest';
import { type Favorite, isFavorite, moveFavorites, parseFavorites, relabelFavorites, serializeFavorites, starFavorite } from './favorites';

const SPACE = '@sp-abcdefgh';

describe('favorites', () => {
  it('reads what is starred in its order, leaving out what is not a favorite and a second writing of one', () => {
    const text = JSON.stringify({
      version: 1,
      favorites: [{ item: 'Plan.md' }, { filter: 'p1' }, { label: 'bug', space: SPACE }, { label: 'Bug', space: SPACE }, { item: '' }, { what: 'x' }, 'Plan.md', { item: 'Plan.md' }, { label: 'later' }],
    });
    expect(parseFavorites(text)).toEqual([{ item: 'Plan.md' }, { filter: 'p1' }, { label: 'bug', space: SPACE }, { label: 'later' }]);
    expect(parseFavorites('not json')).toEqual([]);
    const favorites: Favorite[] = [{ item: `${SPACE}/Roadmap.board.json` }, { label: 'bug', space: SPACE }];
    expect(parseFavorites(serializeFavorites(favorites))).toEqual(favorites);
  });

  it('stars after the others, once, and takes a star off', () => {
    const one = starFavorite([], { filter: 'p1' }, true);
    const two = starFavorite(one, { label: 'bug' }, true);
    expect(two).toEqual([{ filter: 'p1' }, { label: 'bug' }]);
    expect(starFavorite(two, { filter: 'p1' }, true)).toBe(two);
    expect(isFavorite(two, { label: 'BUG' })).toBe(true);
    expect(isFavorite(two, { label: 'bug', space: SPACE })).toBe(false);
    expect(starFavorite(two, { label: 'Bug' }, false)).toEqual([{ filter: 'p1' }]);
  });

  it('follows what moved or was renamed, and what is in a folder that did', () => {
    const favorites: Favorite[] = [{ item: 'Work/Plan.md' }, { item: 'Work/Sub/Tasks.tasks.json' }, { item: 'Workshop.md' }, { filter: 'p1' }];
    expect(moveFavorites(favorites, 'Work/Plan.md', 'Work/Plan 2.md')[0]).toEqual({ item: 'Work/Plan 2.md' });
    expect(moveFavorites(favorites, 'Work', `${SPACE}/Jobs`)).toEqual([
      { item: `${SPACE}/Jobs/Plan.md` },
      { item: `${SPACE}/Jobs/Sub/Tasks.tasks.json` },
      { item: 'Workshop.md' },
      { filter: 'p1' },
    ]);
    expect(moveFavorites(favorites, 'Other.md', 'Else.md')).toBe(favorites);
  });

  it('follows a label renamed in its space, in any case; a label gone takes its star along', () => {
    const favorites: Favorite[] = [{ label: 'Bug', space: SPACE }, { label: 'bug' }, { label: 'issue', space: SPACE }];
    expect(relabelFavorites(favorites, SPACE, 'bug', 'defect')).toEqual([{ label: 'defect', space: SPACE }, { label: 'bug' }, { label: 'issue', space: SPACE }]);
    expect(relabelFavorites(favorites, undefined, 'bug', null)).toEqual([{ label: 'Bug', space: SPACE }, { label: 'issue', space: SPACE }]);
    // Renamed to a label starred too, the two are one.
    expect(relabelFavorites(favorites, SPACE, 'bug', 'issue')).toEqual([{ label: 'issue', space: SPACE }, { label: 'bug' }]);
    expect(relabelFavorites(favorites, SPACE, 'later', 'soon')).toBe(favorites);
  });
});
