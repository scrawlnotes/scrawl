// How new a sync this version does: a whole number, raised only when a change to syncing is one an
// older version would undo. A space keeps in `.scrawl/sync.json` the highest level that synced it;
// a version below it does nothing there and asks to be updated. See design/sync-gate.md.

/**
 * This version's level. 1: nested folders deleted elsewhere do not come back (26d652c), and this
 * gate itself; a version without it counts as 0.
 */
export const SYNC_LEVEL = 1;

/** Where a space keeps the highest level that synced it; synced as any file is. */
export const LEVEL_FILE = '.scrawl/sync.json';

/** The level a level file says; 0 when it says none, or cannot be read. */
export function parseLevel(text: string): number {
  try {
    const level = (JSON.parse(text) as { level?: unknown }).level;
    return typeof level === 'number' && Number.isInteger(level) && level > 0 ? level : 0;
  } catch {
    return 0;
  }
}

export const serializeLevel = (level: number) => `${JSON.stringify({ version: 1, level }, null, 2)}\n`;

/** Two devices that raised it at once: the higher level stands, as a level is never lowered. */
export const mergeLevels = (_base: string, local: string, remote: string) => serializeLevel(Math.max(parseLevel(local), parseLevel(remote)));
