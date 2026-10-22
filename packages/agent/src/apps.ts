import { APP_TEMPLATES, AppProblems, audienceOf, findApp, installApp, markCreated, planApp, TEMPLATE_IDS } from '@scrawlnotes/core';
import { Refusal } from './paths';
import { type Agent, AGENT_DEVICE, type AgentSpace, nowOf } from './space';

// An app set up by an agent, as the New app window sets it up (design/scrawl-apps.md 6.3): the
// templates, each with its answers, the ones not given taking their defaults; in `folder` a new
// app's folder is made, or, when `folder` is an app, the templates are added to it.

export interface AppArgs {
  folder: string;
  name: string;
  templates?: string[];
  answers?: { [template: string]: { [question: string]: unknown } };
  currencies?: string[];
}

/** The templates, whom each is for and what each asks, for a refusal to say what is there. */
const templateList = () => TEMPLATE_IDS.map((id) => ({ id, audience: audienceOf(APP_TEMPLATES[id].group), questions: APP_TEMPLATES[id].questions.map((q) => q.key) }));

export async function createApp(agent: Agent, space: AgentSpace, args: AppArgs) {
  const ids = args.templates ?? [];
  if (ids.length === 0) throw new Refusal(`An app is set up from templates: give templates, some of ${TEMPLATE_IDS.join(', ')}`, { templates: templateList() });
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
  let plan;
  try {
    const taken = new Set((await space.fs.list(args.folder)).map((e) => e.path.toLowerCase()));
    plan = planApp(input, { parent: args.folder, taken, ...(found && { found }) });
  } catch (error) {
    if (error instanceof AppProblems) throw new Refusal(`The app was not ${found ? 'changed' : 'made'}: ${error.problems.length === 1 ? 'one thing' : `${error.problems.length} things`} to mend`, { problems: error.problems, templates: templateList() });
    throw error;
  }
  await installApp(space.fs, plan);
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
      ...(about && { about: `${about}: what the app holds and how it is used; read it, and keep it right when you change the app` }),
    },
  };
}
