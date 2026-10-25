import { t } from '@scrawlnotes/i18n';
import type { Collection, LinkedBlock, Schema } from '../collection';
import { basename } from '../fs';
import { PIECES } from './pieces';
import { impliedWith, isTemplateId, readAnswers, TEMPLATES } from './questions';
import type { Answers, AppFile, Chosen, TemplateId } from './types';

// An app is shown as an app, not as its files (design/app-home.md): its tab has its modules, a
// template each, and each module its menu, the main screens only. Nothing is written for it: the
// menu is worked out from the app's templates and what is in its folder, wherever the person put
// it and whatever they called it, by the role its schema or board carries.

/** What is in an app's folder as the client knows it: a collection, a board or a folder of notes, with its role when it has one. */
export interface AppPiece {
  kind: 'collection' | 'board' | 'folder';
  /** Its path: a collection's or a folder's folder, a board's file. */
  path: string;
  role?: string;
}

/** A screen of an app's menu: a collection, a board or a folder of notes. */
export interface AppScreen extends AppPiece {
  /** Its name as the menu says it: what it is called now. */
  name: string;
}

/** A module of an app's menu: a template's screens. */
export interface AppModule {
  name: string;
  template: TemplateId;
  screens: AppScreen[];
}

/** The name a piece goes by: a board's file without its extension, a folder's name. */
export const pieceName = (piece: AppPiece) => (piece.kind === 'board' ? basename(piece.path).replace(/\.board\.json$/, '') : basename(piece.path));

/**
 * The modules of an app's menu (design/app-home.md 5.2, 9): a template each, in the order they
 * were set up; its screens the roles of its menu that it set up and that are in the folder, a
 * piece of two templates in each. A template another's answer brings, Budget with a project's
 * budget, has no module of its own: what it adds is at the end of the one that brought it. A
 * module with no screen is left out.
 */
export function menuOf(app: AppFile, pieces: readonly AppPiece[]): AppModule[] {
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
  for (const id of all.keys()) if (!implied.some(([of]) => of === id)) modules.set(id, { name: t(TEMPLATES[id].short), template: id, screens: screensOf(id) });
  for (const [id, by] of implied) {
    const module = modules.get(by);
    if (!module) continue;
    const shown = new Set(module.screens.map((s) => s.path));
    module.screens.push(...screensOf(id).filter((s) => !shown.has(s.path)));
  }
  return [...modules.values()].filter((m) => m.screens.length > 0);
}

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
