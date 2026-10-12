import type { VaultFs } from './fs';

// A space is a whole root folder of notes, task lists and boards; the vault opened today is the
// personal one. What a space is called is kept inside it, so that everyone it is shared with sees
// the same name.

const FILE = '.scrawl/space.json';

/** A space's own settings. Without a name it is shown under the name of its kind, "Personal". */
export interface SpaceInfo {
  /** Made once when the space is added beside the personal one; in front of its paths in the app. */
  id?: string;
  name?: string;
}

export function parseSpace(text: string): SpaceInfo {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const { name, id, version: _version, ...rest } = data as Record<string, unknown>;
  // Unknown fields are kept, so a newer version's settings survive an older one saving.
  return { ...rest, ...(typeof id === 'string' && id.trim() && { id: id.trim() }), ...(typeof name === 'string' && name.trim() && { name: name.trim() }) };
}

export const serializeSpace = (space: SpaceInfo) => `${JSON.stringify({ version: 1, ...space }, null, 2)}\n`;

/** The settings of the space a vault is; none when there is no file yet. */
export async function loadSpace(fs: VaultFs): Promise<SpaceInfo> {
  try {
    return parseSpace(await fs.readText(FILE));
  } catch {
    return {};
  }
}

export const saveSpace = (fs: VaultFs, space: SpaceInfo) => fs.writeText(FILE, serializeSpace(space));
