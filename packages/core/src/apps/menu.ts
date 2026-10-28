import { t } from '@scrawlnotes/i18n';
import type { Collection, LinkedBlock, Schema } from '../collection';
import { basename, join } from '../fs';
import { PIECES } from './pieces';
import { impliedWith, isTemplateId, readAnswers, TEMPLATES } from './questions';
import type { Answers, AppFile, AppMenuFile, Chosen, TemplateId } from './types';

// An app is shown as an app, not as its files (design/app-home.md): its tab has its modules, a
// template each, and each module its menu, the main screens only. The menu is worked out from the
// app's templates and what is in its folder, wherever the person put it and whatever they called
// it, by the role its schema or board carries; or it is the person's, set with Edit menu and kept
// in `_app.json` (design/app-home.md 6, 8.1), what a template sets up later coming at the end of
// its module. An app of no template has the person's menu, or, without one, what is in its folder.

/** What is in an app's folder as the client knows it: a collection, a board, a folder of notes or a note, with its role when it has one. */
export interface AppPiece {
  kind: 'collection' | 'board' | 'folder' | 'note';
  /** Its path: a collection's or a folder's folder, a board's or a note's file. */
  path: string;
  role?: string;
}

/** A screen of an app's menu: a collection, a board or a folder of notes, and the view it opens on. */
export interface AppScreen extends AppPiece {
  /** Its name as the menu says it: what it is called now. */
  name: string;
  /** The id of the view of a collection it opens on. */
  view?: string;
}

/** A module of an app's menu: a template's screens, or screens the person put together. */
export interface AppModule {
  /** What tells it from the others: its template, else its place. */
  key: string;
  /** Its name; none for the one module of an app of no template. */
  name: string;
  template?: TemplateId;
  screens: AppScreen[];
}

/** The name a piece goes by: a board's or a note's file without its extension, a folder's name. */
export const pieceName = (piece: AppPiece) => basename(piece.path).replace(piece.kind === 'board' ? /\.board\.json$/ : piece.kind === 'note' ? /\.md$/ : /$^/, '');

/** What tells a screen from the others of its menu: its path, and the view it opens on. */
export const screenKey = (screen: Pick<AppScreen, 'path' | 'view'>) => (screen.view ? `${screen.path}#${screen.view}` : screen.path);

/**
 * The modules the templates give an app (design/app-home.md 5.2, 9): a template each, in the order
 * they were set up; its screens the roles of its menu that it set up and that are in the folder, a
 * piece of two templates in each. A template another's answer brings, Budget with a project's
 * budget, has no module of its own: what it adds is at the end of the one that brought it.
 */
function templateModules(app: AppFile, pieces: readonly AppPiece[]): AppModule[] {
  const byRole = new Map<string, AppPiece>();
  for (const piece of pieces) if (piece.role && PIECES[piece.role] && !byRole.has(piece.role)) byRole.set(piece.role, piece);
  const all = new Map<TemplateId, Answers>(app.templates.flatMap((x) => (isTemplateId(x.id) ? [[x.id, x.answers] as const] : [])));
  const implied = impliedWith(all);
  for (const [id] of implied) all.set(id, readAnswers(TEMPLATES[id], new Set([...all.keys(), id])).answers);
  const chosen: Chosen = { has: (id) => all.has(id), answers: (id) => all.get(id) ?? {} };
  const screensOf = (id: TemplateId) => {
    const own = new Set(TEMPLATES[id].pieces(all.get(id)!, chosen));
    return TEMPLATES[id].menu.flatMap((role): AppScreen[] => {
      const piece = own.has(role) ? byRole.get(role) : undefined;
      return piece ? [{ ...piece, name: pieceName(piece) }] : [];
    });
  };
  const modules = new Map<TemplateId, AppModule>();
  for (const id of all.keys()) if (!implied.some(([of]) => of === id)) modules.set(id, { key: id, name: t(TEMPLATES[id].short), template: id, screens: screensOf(id) });
  for (const [id, by] of implied) {
    const module = modules.get(by);
    if (!module) continue;
    const shown = new Set(module.screens.map((s) => s.path));
    module.screens.push(...screensOf(id).filter((s) => !shown.has(s.path)));
  }
  return [...modules.values()];
}

/** A screen as Edit menu shows it: hidden ones too, faint. */
export interface EditScreen extends AppScreen {
  hidden: boolean;
}

/** An app's menu as Edit menu shows it (design/app-home.md 6): every module with every screen, the hidden ones marked; what Home shows. */
export interface MenuEdit {
  modules: (Omit<AppModule, 'screens'> & { screens: EditScreen[] })[];
  home: { today: boolean; cards: boolean };
}

/** What Home shows of an app: Today and the module cards, unless its menu says not. */
export const homeOf = (app: AppFile) => ({ today: app.menu?.home?.today !== false, cards: app.menu?.home?.cards !== false });

/**
 * An app's menu with what is hidden in it, for Edit menu: the person's when `_app.json` has one,
 * what a template set up and is in no module and not hidden at the end of its template's module (a
 * screen Edit app or Add to app brought), or of a module of its own after the others; else the
 * templates'; for an app of no template and no menu, one module of the collections and boards in
 * its folder by name, lines left out (`lines`, by path; design/app-home.md 5.5).
 */
export function menuEditOf(app: AppFile, folder: string, pieces: readonly AppPiece[], lines: ReadonlyMap<string, string> = new Map()): MenuEdit {
  const home = homeOf(app);
  const shown = (s: AppScreen): EditScreen => ({ ...s, hidden: false });
  const derived = templateModules(app, pieces);
  if (!app.menu) {
    if (derived.length > 0) return { modules: derived.map((m) => ({ ...m, screens: m.screens.map(shown) })), home };
    const own = pieces
      .filter((p) => (p.kind === 'collection' || p.kind === 'board') && !lines.has(p.path))
      .map((p) => shown({ ...p, name: pieceName(p) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { modules: [{ key: 'module-0', name: '', screens: own }], home };
  }
  const byPath = new Map(pieces.map((p) => [p.path, p]));
  const hidden = new Set((app.menu.hidden ?? []).map((p) => join(folder, p)));
  const modules: MenuEdit['modules'] = app.menu.modules.map((m, i) => ({
    key: m.template ?? `module-${i}`,
    name: m.name,
    ...(m.template && { template: m.template }),
    screens: m.screens.flatMap((s) => {
      const piece = byPath.get(join(folder, s.path));
      return piece ? [{ ...piece, name: pieceName(piece), ...(s.view && { view: s.view }), hidden: hidden.has(piece.path) }] : [];
    }),
  }));
  const placed = new Set(modules.flatMap((m) => m.screens.map((s) => s.path)));
  for (const d of derived) {
    const fresh = d.screens.filter((s) => !placed.has(s.path) && !hidden.has(s.path)).map(shown);
    if (fresh.length === 0) continue;
    const into = modules.find((m) => m.template === d.template);
    if (into) into.screens.push(...fresh);
    else modules.push({ ...d, screens: fresh });
    for (const s of fresh) placed.add(s.path);
  }
  return { modules, home };
}

/** The modules of an app's menu as its tab shows them: the screens not hidden; a module with none is left out. */
export function menuOf(app: AppFile, folder: string, pieces: readonly AppPiece[], lines: ReadonlyMap<string, string> = new Map()): AppModule[] {
  const modules = menuEditOf(app, folder, pieces, lines)
    .modules.map((m) => ({ ...m, screens: m.screens.filter((s) => !s.hidden).map(({ hidden: _hidden, ...s }) => s) }))
    .filter((m) => m.screens.length > 0);
  if (app.menu) return modules;
  // A template's module all of whose screens another before it has, Shared expenses' with Travel, is not one of its own.
  return modules.filter((m, i) => !m.screens.every((s) => modules.slice(0, i).some((o) => o.screens.some((x) => x.path === s.path))));
}

/** The collections and boards in an app's folder in no module of its menu, lines left out: Edit menu's "In the folder, not in a menu". */
export function unplacedOf(edit: MenuEdit, pieces: readonly AppPiece[], lines: ReadonlyMap<string, string> = new Map()): AppPiece[] {
  const placed = new Set(edit.modules.flatMap((m) => m.screens.map((s) => s.path)));
  return pieces.filter((p) => (p.kind === 'collection' || p.kind === 'board') && !placed.has(p.path) && !lines.has(p.path)).sort((a, b) => pieceName(a).localeCompare(pieceName(b)));
}

/** A menu as `_app.json` keeps it: paths in the app's folder, the hidden screens said apart and kept in their module, Home only where it shows less. */
export function menuFileOf(edit: MenuEdit, folder: string): AppMenuFile {
  const local = (path: string) => (path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path);
  const hidden = [...new Set(edit.modules.flatMap((m) => m.screens.filter((s) => s.hidden).map((s) => local(s.path))))];
  const home = { ...(!edit.home.today && { today: false }), ...(!edit.home.cards && { cards: false }) };
  return {
    modules: edit.modules.map((m) => ({
      name: m.name,
      ...(m.template && { template: m.template }),
      screens: m.screens.map((s) => ({ path: local(s.path), ...(s.view && { view: s.view }) })),
    })),
    ...(hidden.length > 0 && { hidden }),
    ...(Object.keys(home).length > 0 && { home }),
  };
}

/** The icon an app goes by: its template's when it has one, the one it was given, else the app's. */
export const appIcon = (app: AppFile): string => {
  const ids = app.templates.map((x) => x.id).filter(isTemplateId);
  return ids.length === 1 ? TEMPLATES[ids[0]!].icon : (app.icon ?? 'app');
};

/** The fields kept off a collection's record window: as its layout says, else as its template's piece does (Layout.hidden). */
export const hiddenOnForm = (schema: Schema): ReadonlySet<string> => new Set(schema.layout?.hidden ?? (schema.role ? PIECES[schema.role]?.hidden : undefined) ?? []);

/** The roles of the pieces that are another's lines, by role: an order's lines are the order's (design/app-home.md 4). */
export const linesOf = (role: string) => PIECES[role]?.lines ?? [];

/**
 * Whether a linked block shows the record's lines (design/app-home.md 4): as its `lines` says,
 * else as the roles say, an order's lines on an order's screen.
 */
export const showsLines = (block: LinkedBlock, role: string | undefined, sourceRole: string | undefined): boolean =>
  block.lines ?? (!!role && !!sourceRole && linesOf(sourceRole).includes(role));

/** The blocks of a collection's record screen that show its lines, each with the collection of its lines, found by `collection`. */
export function linesBlocks(schema: Schema, collection: (path: string) => Collection | undefined): { block: LinkedBlock; source: Collection }[] {
  const blocks = (schema.layout?.columns ?? []).flatMap((c) => c.sections.flatMap((s) => s.items)).filter((item): item is LinkedBlock => 'block' in item && item.block === 'linked');
  return blocks.flatMap((block) => {
    const source = collection(block.collection);
    return source && showsLines(block, schema.role, source.schema.role) ? [{ block, source }] : [];
  });
}

/** The collections that are another's lines, each with the collection whose lines they are: Order lines with Orders. */
export function linesIn(collections: readonly Collection[]): Map<string, string> {
  const at = (path: string) => collections.find((c) => c.dir === path);
  const out = new Map<string, string>();
  for (const c of collections) for (const { source } of linesBlocks(c.schema, at)) if (!out.has(source.dir)) out.set(source.dir, c.dir);
  return out;
}
