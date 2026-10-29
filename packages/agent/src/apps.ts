import {
  APP_ICONS,
  APP_TEMPLATES,
  type AppFile,
  type AppMenuFile,
  appPieces,
  AppProblems,
  audienceOf,
  findApp,
  fold,
  installApp,
  markCreated,
  menuOf,
  planApp,
  readAppMenu,
  TEMPLATE_IDS,
  writeAppMenu,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { Refusal } from './paths';
import { type Agent, AGENT_DEVICE, type AgentSpace, nowOf, todayOf } from './space';

// An app set up by an agent, as the New app window sets it up (design/scrawl-apps.md 6.3): the
// templates, each with its answers, the ones not given taking their defaults; in `folder` a new
// app's folder is made, or, when `folder` is an app, the templates are added to it, and those it
// has already take the answers given (Edit app, design/edit-app.md): settings go, data stays.
// With no template it is an app of the person's own (design/app-home.md 5.5): its folder and its
// menu; given an app and a menu, its menu is changed.

export interface AppArgs {
  folder: string;
  name: string;
  templates?: string[];
  answers?: { [template: string]: { [question: string]: unknown } };
  /** Editing, by template and question, the items of a list typed anew: { crm: { stages: { Proposal: "Quote" } } }. */
  renames?: { [template: string]: { [question: string]: { [from: string]: string } } };
  currencies?: string[];
  /** Its menu: { modules: [{ name, screens: [paths] }], hidden?, home? }. */
  menu?: unknown;
  /** A new app of no template: its icon. */
  icon?: string;
}

/** An app's menu in the tools' words: its modules, each with its name and the paths of its screens. */
const modulesOut = async (space: AgentSpace, folder: string, app: AppFile) => {
  const { pieces, lines } = await appPieces(space.fs, folder);
  return menuOf(app, folder, pieces, lines).map((m) => ({ name: m.name, screens: m.screens.map((s) => s.path) }));
};

/**
 * A menu as the agent gave it, read against the app in `folder`: each screen and each hidden one
 * a collection, a board or a note in its folder, by its path there or in the space; a module named
 * as one of its templates is that template's, so what the template sets up later comes into it.
 */
async function menuFor(space: AgentSpace, folder: string, app: AppFile, given: unknown): Promise<AppMenuFile> {
  const menu = readAppMenu(given);
  if (!menu) throw new Refusal('menu is { modules: [{ name, screens: [paths] }], hidden?, home? }: each module with its name and the paths of its screens, in order');
  const local = (path: string) => (path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path);
  const { pieces } = await appPieces(space.fs, folder);
  const there = new Set(pieces.map((p) => local(p.path)));
  // A hidden screen that opens on a view is its path, `#`, its view.
  const missing = [...menu.modules.flatMap((m) => m.screens.map((s) => local(s.path))), ...(menu.hidden ?? []).map((p) => local(p.split('#')[0]!))].filter((p) => !there.has(p));
  if (missing.length > 0) throw new Refusal(`Not in ${folder}: ${missing.join(', ')}; a screen is a collection, a board or a note in the app's folder`, { inTheApp: [...there] });
  const own = app.templates.map((x) => x.id);
  const templateOf = (name: string) => own.find((id) => fold(t(APP_TEMPLATES[id].short)) === fold(name) || fold(t(APP_TEMPLATES[id].name)) === fold(name));
  return {
    ...menu,
    modules: menu.modules.map((m) => {
      const template = m.template ?? templateOf(m.name);
      return { name: m.name, ...(template && { template }), screens: m.screens.map((s) => ({ ...s, path: local(s.path) })) };
    }),
    ...(menu.hidden && { hidden: menu.hidden.map(local) }),
  };
}

/** The templates, whom each is for and what each asks, for a refusal to say what is there. */
const templateList = () => TEMPLATE_IDS.map((id) => ({ id, audience: audienceOf(APP_TEMPLATES[id].group), questions: APP_TEMPLATES[id].questions.map((q) => q.key) }));

export async function createApp(agent: Agent, space: AgentSpace, args: AppArgs) {
  const ids = args.templates ?? [];
  if (ids.length === 0) return ownApp(agent, space, args);
  for (const key of Object.keys(args.answers ?? {})) {
    if (!ids.includes(key)) throw new Refusal(`answers has ${key}, which is not one of the templates given (${ids.join(', ')}); answers are by template`, { templates: templateList() });
  }
  const found = args.folder ? await findApp(space.fs, args.folder) : null;
  const input = { name: args.name, currencies: args.currencies, templates: ids.map((id) => ({ id, answers: args.answers?.[id] })) };
  if (!found) {
    // The same app asked for again: the one that is there, set up from these templates, is returned.
    const there = await findApp(space.fs, [args.folder, args.name.trim()].filter(Boolean).join('/'));
    if (there) {
      const same = ids.every((id) => there.app.templates.some((t) => t.id === id));
      return {
        data: {
          space: space.id,
          path: there.folder,
          kind: 'app',
          created: false,
          exists: true,
          templates: there.app.templates.map((t) => t.id),
          message: same
            ? `An app called ${there.app.name} with these templates is already there (${there.folder}); nothing was made.`
            : `An app called ${there.app.name} is already there (${there.folder}); to add templates to it, give it as folder.`,
        },
      };
    }
  }
  // Templates the app has already: their answers are changed first, then the others are added.
  const own = found ? ids.filter((id) => found.app.templates.some((x) => x.id === id)) : [];
  let edit = null;
  if (found && own.length > 0) {
    try {
      const withRecords = (await findApp(space.fs, found.folder, { records: true }))!;
      edit = planApp({ name: found.app.name, currencies: args.currencies, templates: own.map((id) => ({ id, answers: args.answers?.[id], renames: args.renames?.[id] })) }, { found: withRecords, edit: true, today: todayOf(agent) });
    } catch (error) {
      if (error instanceof AppProblems) throw new Refusal(`The app was not changed: ${error.problems.length === 1 ? 'one thing' : `${error.problems.length} things`} to mend`, { problems: error.problems, templates: templateList() });
      throw error;
    }
    if (!edit.edit!.same) await installApp(space.fs, edit);
    const rest = ids.filter((id) => !own.includes(id));
    if (rest.length === 0) {
      const said = (items: { name: string; what: string }[]) => items.map((i) => `${i.name}: ${i.what}`);
      return {
        data: {
          space: space.id,
          path: found.folder,
          kind: 'app',
          created: false,
          templates: edit.app.templates.map((t) => t.id),
          ...(edit.edit!.same
            ? { message: 'Every answer is as it was; nothing was changed.' }
            : {
                answered: edit.edit!.templates,
                ...(edit.added.length + edit.created.length > 0 && { added: [...edit.created.map((c) => `${c.kind} ${c.path}`), ...said(edit.added)] }),
                ...(edit.edit!.changed.length > 0 && { changed: said(edit.edit!.changed) }),
                ...(edit.edit!.takenOff.length > 0 && { takenOff: said(edit.edit!.takenOff) }),
                ...(edit.edit!.kept.length > 0 && { kept: said(edit.edit!.kept) }),
              }),
          ...(found.about && { about: `${found.about.path}: what the app holds and how it is used; read it, and keep it right when you change the app` }),
        },
      };
    }
    input.templates = input.templates.filter((x) => rest.includes(x.id));
  }
  let plan;
  try {
    const taken = new Set((await space.fs.list(args.folder)).map((e) => e.path.toLowerCase()));
    const there = edit && !edit.edit!.same ? await findApp(space.fs, found!.folder) : found;
    plan = planApp(input, { parent: args.folder, taken, today: todayOf(agent), ...(there && { found: there }) });
  } catch (error) {
    if (error instanceof AppProblems) throw new Refusal(`The app was not ${found ? 'changed' : 'made'}: ${error.problems.length === 1 ? 'one thing' : `${error.problems.length} things`} to mend`, { problems: error.problems, templates: templateList() });
    throw error;
  }
  await installApp(space.fs, plan);
  // A menu given with the templates is the app's menu, what they set up in it.
  if (args.menu !== undefined) {
    const app = (await findApp(space.fs, plan.folder))!.app;
    await writeAppMenu(space.fs, plan.folder, await menuFor(space, plan.folder, app, args.menu));
  }
  const now = nowOf(agent);
  await markCreated(space.fs, AGENT_DEVICE, Object.fromEntries(plan.created.map((c) => [c.path, now]))).catch(() => undefined);
  const about = plan.created.find((c) => c.kind === 'note')?.path ?? found?.about?.path;
  return {
    data: {
      space: space.id,
      path: plan.folder,
      kind: 'app',
      created: !found,
      templates: plan.app.templates.map((t) => t.id),
      made: plan.created.map((c) => `${c.kind} ${c.path}`),
      ...(plan.changed.length > 0 && { changed: plan.changed }),
      ...(plan.notes.length > 0 && { notes: plan.notes }),
      ...(edit && !edit.edit!.same && { answered: edit.edit!.templates }),
      ...(about && { about: `${about}: what the app holds and how it is used; read it, and keep it right when you change the app` }),
    },
  };
}

/**
 * An app of no template (design/app-home.md 5.5): made with its menu, one module with no name when
 * none is given, and its icon; or, given an app, its menu changed. The same app asked for again is
 * the one there.
 */
async function ownApp(agent: Agent, space: AgentSpace, args: AppArgs) {
  const found = args.folder ? await findApp(space.fs, args.folder) : null;
  if (found) {
    if (args.menu === undefined) throw new Refusal(`Give templates to add to ${found.app.name}, or menu to change its menu`, { templates: templateList() });
    const menu = await menuFor(space, found.folder, found.app, args.menu);
    await writeAppMenu(space.fs, found.folder, menu);
    return { data: { space: space.id, path: found.folder, kind: 'app', created: false, menu: await modulesOut(space, found.folder, { ...found.app, menu }) } };
  }
  const there = await findApp(space.fs, [args.folder, args.name.trim()].filter(Boolean).join('/'));
  if (there) {
    return {
      data: {
        space: space.id,
        path: there.folder,
        kind: 'app',
        created: false,
        exists: true,
        message: `An app called ${there.app.name} is already there (${there.folder}); nothing was made. To change its menu, give it as folder with menu.`,
      },
    };
  }
  const given = args.menu === undefined ? { modules: [{ name: '', screens: [] }] } : readAppMenu(args.menu);
  if (!given) throw new Refusal('menu is { modules: [{ name, screens: [paths] }], hidden?, home? }: each module with its name and the paths of its screens, in order');
  if (args.icon !== undefined && !APP_ICONS.includes(args.icon)) throw new Refusal(`An app's icon is one of ${APP_ICONS.join(', ')}`, { icons: APP_ICONS });
  let plan;
  try {
    const taken = new Set((await space.fs.list(args.folder)).map((e) => e.path.toLowerCase()));
    plan = planApp({ name: args.name, currencies: args.currencies ?? [], templates: [], menu: given, ...(args.icon && { icon: args.icon }) }, { parent: args.folder, taken, today: todayOf(agent) });
  } catch (error) {
    if (error instanceof AppProblems) throw new Refusal(`The app was not made: ${error.problems.join('; ')}`, { problems: error.problems });
    throw error;
  }
  await installApp(space.fs, plan);
  await markCreated(space.fs, AGENT_DEVICE, { [plan.folder]: nowOf(agent) }).catch(() => undefined);
  return {
    data: {
      space: space.id,
      path: plan.folder,
      kind: 'app',
      created: true,
      templates: [],
      message: 'An app of no template, its menu empty: make its collections and boards in its folder with create and module, and they are in its menu.',
    },
  };
}
