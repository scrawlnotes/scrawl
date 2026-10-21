import { BOARD_EXT, parseBoard } from '../board';
import { COLLECTION_FILE, loadCollection, parseSchema, RECORD_EXT } from '../collection';
import { type Entry, join, type VaultFs } from '../fs';
import { APP_FILE, type FoundApp, type FoundPiece } from './build';
import { aboutName } from './about';
import { PIECES } from './pieces';
import { isTemplateId } from './questions';
import type { AppFile } from './types';

// An app's pieces are found by the role their schema or board file carries, wherever in its folder
// they are and whatever they are called now: Companies renamed Customers and moved into a folder is
// still the CRM's companies. A folder piece is found by its name. Of two with the same role, the
// first found is taken.

const hidden = (name: string) => name.startsWith('.') || name.startsWith('_');

/** Reads `_app.json`; null when it is not there or is not one. */
export async function readAppFile(fs: VaultFs, folder: string): Promise<AppFile | null> {
  try {
    const data = JSON.parse(await fs.readText(join(folder, APP_FILE))) as Partial<AppFile>;
    if (typeof data.name !== 'string' || !Array.isArray(data.templates)) return null;
    return {
      version: 1,
      name: data.name,
      currencies: Array.isArray(data.currencies) ? data.currencies.filter((c): c is string => typeof c === 'string') : [],
      templates: data.templates.filter((x) => isTemplateId(x?.id) && typeof x.answers === 'object' && x.answers !== null).map((x) => ({ id: x.id, version: typeof x.version === 'number' ? x.version : 1, answers: x.answers })),
    };
  } catch {
    return null;
  }
}

/** Whether a folder is an app: it holds `_app.json`. */
export const isApp = (entries: Entry[]) => entries.some((e) => e.kind === 'file' && e.name === APP_FILE);

/** The app in `folder` as it is: its file, its pieces by role, its About note and the names taken; null when it is not an app. */
export async function findApp(fs: VaultFs, folder: string): Promise<FoundApp | null> {
  const app = await readAppFile(fs, folder);
  if (!app) return null;
  const pieces = new Map<string, FoundPiece>();
  const top = await fs.list(folder);
  const visit = async (dir: string, entries: Entry[]) => {
    if (entries.some((e) => e.kind === 'file' && e.name === COLLECTION_FILE)) {
      const text = await fs.readText(join(dir, COLLECTION_FILE));
      const role = parseSchema(text).role;
      if (role && PIECES[role] && !pieces.has(role)) {
        const collection = await loadCollection(fs, dir).catch(() => null);
        pieces.set(role, { kind: 'collection', path: dir, text, rules: collection?.rules ?? null, names: (collection?.records ?? []).map((r) => r.name.toLowerCase()) });
      }
      return;
    }
    for (const entry of entries) {
      if (hidden(entry.name)) continue;
      if (entry.kind === 'file' && entry.name.endsWith(BOARD_EXT)) {
        const text = await fs.readText(entry.path);
        const role = parseBoard(text).role;
        if (role && PIECES[role] && !pieces.has(role)) pieces.set(role, { kind: 'board', path: entry.path, text, rules: null, names: [] });
      } else if (entry.kind === 'dir') await visit(entry.path, await fs.list(entry.path));
    }
  };
  await visit(folder, top);
  for (const [role, info] of Object.entries(PIECES)) {
    if (info.kind !== 'folder' || pieces.has(role)) continue;
    const dir = top.find((e) => e.kind === 'dir' && e.name.toLowerCase() === info.name.toLowerCase());
    if (dir) pieces.set(role, { kind: 'folder', path: dir.path, text: '', rules: null, names: (await fs.list(dir.path)).filter((e) => e.name.endsWith(RECORD_EXT)).map((e) => e.name.toLowerCase()) });
  }
  const note = top.find((e) => e.kind === 'file' && e.name.toLowerCase() === `${aboutName(app.name)}.md`.toLowerCase());
  return {
    folder,
    app,
    pieces,
    about: note ? { path: note.path, text: await fs.readText(note.path) } : null,
    taken: new Set(top.map((e) => e.path.toLowerCase())),
  };
}

