import { BOARD_EXT, parseBoard } from '../board';
import { type Collection, COLLECTION_FILE, loadCollection, parseSchema, RECORD_EXT, type Record } from '../collection';
import { type Entry, join, type VaultFs } from '../fs';
import { APP_FILE, type FoundApp, type FoundPiece } from './build';
import { aboutName } from './about';
import { type AppPiece, linesIn } from './menu';
import { PIECES } from './pieces';
import { isTemplateId } from './questions';
import type { AppFile, AppMenuFile, MenuModuleFile, MenuScreenFile } from './types';

// An app's pieces are found by the role their schema or board file carries, wherever in its folder
// they are and whatever they are called now: Companies renamed Customers and moved into a folder is
// still the CRM's companies. A folder piece is found by its name. Of two with the same role, the
// first found is taken.

const hidden = (name: string) => name.startsWith('.') || name.startsWith('_');

/** Reads `_app.json`; null when it is not there or is not one. */
export async function readAppFile(fs: VaultFs, folder: string): Promise<AppFile | null> {
  try {
    const data = JSON.parse(await fs.readText(join(folder, APP_FILE))) as Partial<AppFile> & { menu?: unknown; icon?: unknown };
    if (typeof data.name !== 'string' || !Array.isArray(data.templates)) return null;
    const menu = readAppMenu(data.menu);
    return {
      version: 1,
      name: data.name,
      currencies: Array.isArray(data.currencies) ? data.currencies.filter((c): c is string => typeof c === 'string') : [],
      templates: data.templates.filter((x) => isTemplateId(x?.id) && typeof x.answers === 'object' && x.answers !== null).map((x) => ({ id: x.id, version: typeof x.version === 'number' ? x.version : 1, answers: x.answers })),
      ...(menu && { menu }),
      ...(typeof data.icon === 'string' && data.icon.trim() && { icon: data.icon.trim() }),
    };
  } catch {
    return null;
  }
}

const isObject = (value: unknown): value is { [key: string]: unknown } => typeof value === 'object' && value !== null && !Array.isArray(value);
const cleanPath = (path: string) => path.trim().replace(/^\/+|\/+$/g, '');

/**
 * An app's menu as `_app.json` or an agent gives it (design/app-home.md 8.1), read as far as it
 * can be: a module without a name has none, a template that is not one is left out, a screen is
 * its path (in the app's folder) and the view it opens on; undefined when it is not a menu.
 */
export function readAppMenu(raw: unknown): AppMenuFile | undefined {
  if (!isObject(raw) || !Array.isArray(raw.modules)) return undefined;
  const screenOf = (s: unknown): MenuScreenFile[] => {
    if (typeof s === 'string') return cleanPath(s) ? [{ path: cleanPath(s) }] : [];
    if (!isObject(s) || typeof s.path !== 'string' || !cleanPath(s.path)) return [];
    return [{ path: cleanPath(s.path), ...(typeof s.view === 'string' && s.view.trim() && { view: s.view.trim() }) }];
  };
  const modules = raw.modules.filter(isObject).map(
    (m): MenuModuleFile => ({
      name: typeof m.name === 'string' ? m.name.trim() : '',
      ...(isTemplateId(m.template) && { template: m.template }),
      screens: Array.isArray(m.screens) ? m.screens.flatMap(screenOf) : [],
    }),
  );
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((p): p is string => typeof p === 'string' && !!cleanPath(p)).map(cleanPath) : [];
  const home = isObject(raw.home) ? raw.home : {};
  const shows = {
    ...(typeof home.today === 'boolean' && { today: home.today }),
    ...(typeof home.cards === 'boolean' && { cards: home.cards }),
  };
  return { modules, ...(hidden.length > 0 && { hidden }), ...(Object.keys(shows).length > 0 && { home: shows }) };
}

/**
 * Writes an app's menu into its `_app.json`, the rest of it as it is; null takes it out, the
 * templates' menu shown again (Reset to template). Gives the file as it was, for Undo.
 */
export async function writeAppMenu(fs: VaultFs, folder: string, menu: AppMenuFile | null): Promise<string> {
  const path = join(folder, APP_FILE);
  const before = await fs.readText(path);
  const data = JSON.parse(before) as { [key: string]: unknown };
  if (menu) data.menu = menu;
  else delete data.menu;
  await fs.writeText(path, `${JSON.stringify(data, null, 2)}\n`);
  return before;
}

/**
 * What is in an app's folder for its menu (design/app-home.md 5.5, 6): every collection and board
 * with its role when it has one, its folders of notes and the notes at its top; and the
 * collections that are another's lines, each with the collection whose lines it is.
 */
export async function appPieces(fs: VaultFs, folder: string): Promise<{ pieces: AppPiece[]; lines: Map<string, string> }> {
  const pieces: AppPiece[] = [];
  const collections: Collection[] = [];
  const top = await fs.list(folder);
  const visit = async (dir: string, entries: Entry[]) => {
    if (entries.some((e) => e.kind === 'file' && e.name === COLLECTION_FILE)) {
      const schema = parseSchema(await fs.readText(join(dir, COLLECTION_FILE)));
      pieces.push({ kind: 'collection', path: dir, ...(schema.role && { role: schema.role }) });
      collections.push({ dir, schema, records: [] });
      return;
    }
    for (const entry of entries) {
      if (hidden(entry.name)) continue;
      if (entry.kind === 'file' && entry.name.endsWith(BOARD_EXT)) {
        const role = parseBoard(await fs.readText(entry.path)).role;
        pieces.push({ kind: 'board', path: entry.path, ...(role && { role }) });
      } else if (entry.kind === 'dir') await visit(entry.path, await fs.list(entry.path));
      else if (dir === folder && entry.kind === 'file' && entry.name.endsWith('.md')) pieces.push({ kind: 'note', path: entry.path });
    }
  };
  await visit(folder, top);
  for (const [role, info] of Object.entries(PIECES)) {
    const dir = info.kind === 'folder' ? top.find((e) => e.kind === 'dir' && e.name.toLowerCase() === info.name.toLowerCase()) : undefined;
    if (dir) pieces.push({ kind: 'folder', path: dir.path, role });
  }
  return { pieces, lines: linesIn(collections) };
}

/** Whether a folder is an app: it holds `_app.json`. */
export const isApp = (entries: Entry[]) => entries.some((e) => e.kind === 'file' && e.name === APP_FILE);

/**
 * The app in `folder` as it is: its file, its pieces by role, its About note and the names taken;
 * null when it is not an app. With `records`, its collections' records too, for an edit to rename
 * what they hold.
 */
export async function findApp(fs: VaultFs, folder: string, { records = false }: { records?: boolean } = {}): Promise<FoundApp | null> {
  const app = await readAppFile(fs, folder);
  if (!app) return null;
  const pieces = new Map<string, FoundPiece>();
  const held = new Map<string, { record: Record; text: string }[]>();
  const top = await fs.list(folder);
  const visit = async (dir: string, entries: Entry[]) => {
    if (entries.some((e) => e.kind === 'file' && e.name === COLLECTION_FILE)) {
      const text = await fs.readText(join(dir, COLLECTION_FILE));
      const role = parseSchema(text).role;
      if (role && PIECES[role] && !pieces.has(role)) {
        const collection = await loadCollection(fs, dir).catch(() => null);
        pieces.set(role, { kind: 'collection', path: dir, text, rules: collection?.rules ?? null, names: (collection?.records ?? []).map((r) => r.name.toLowerCase()) });
        if (records && collection) held.set(dir, await Promise.all(collection.records.map(async (record) => ({ record, text: await fs.readText(record.path) }))));
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
    ...(records && { records: held }),
  };
}

