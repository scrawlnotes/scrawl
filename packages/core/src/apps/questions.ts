import { t } from '@scrawlnotes/i18n';
import { appointments } from './templates/appointments';
import { association } from './templates/association';
import { assets } from './templates/assets';
import { budget } from './templates/budget';
import { consulting } from './templates/consulting';
import { content } from './templates/content';
import { contracts } from './templates/contracts';
import { crm } from './templates/crm';
import { ecommerce } from './templates/ecommerce';
import { field } from './templates/field';
import { finance } from './templates/finance';
import { goals } from './templates/goals';
import { gym } from './templates/gym';
import { habits } from './templates/habits';
import { health } from './templates/health';
import { home } from './templates/home';
import { incidents } from './templates/incidents';
import { jobs } from './templates/jobs';
import { people } from './templates/people';
import { product } from './templates/product';
import { reading } from './templates/reading';
import { recipes } from './templates/recipes';
import { projects } from './templates/projects';
import { recruiting } from './templates/recruiting';
import { sales } from './templates/sales';
import { split } from './templates/split';
import { sport } from './templates/sport';
import { stock } from './templates/stock';
import { subscriptions } from './templates/subscriptions';
import { support } from './templates/support';
import { timeoff } from './templates/timeoff';
import { travel } from './templates/travel';
import { listed } from './about';
import { type Answer, type AnswerRow, type Answers, type AppTemplate, audienceOf, type Question, TEMPLATE_IDS, type TemplateId } from './types';

export const TEMPLATES: { [id in TemplateId]: AppTemplate } = { crm, sales, support, appointments, projects, budget, stock, ecommerce, product, recruiting, assets, content, subscriptions, contracts, timeoff, goals, incidents, field, consulting, association, finance, home, health, recipes, travel, split, jobs, people, reading, habits, sport, gym };

export const isTemplateId = (id: unknown): id is TemplateId => TEMPLATE_IDS.includes(id as TemplateId);

/** Whether two templates go in one app: of one side, and a person's only with one it shares data with (design/more-apps.md 1). */
export function goTogether(a: TemplateId, b: TemplateId): boolean {
  const side = audienceOf(TEMPLATES[a].group);
  if (side !== audienceOf(TEMPLATES[b].group)) return false;
  return side === 'business' || !!TEMPLATES[a].goesWith?.includes(b) || !!TEMPLATES[b].goesWith?.includes(a);
}

/** Whether a template may be picked with those chosen and in the app: with none, or beside one it goes together with. */
export const fitsWith = (id: TemplateId, chosen: ReadonlySet<TemplateId>): boolean => chosen.size === 0 || chosen.has(id) || [...chosen].some((other) => goTogether(id, other));

/** The templates in groups of those that go together one after another, in their order: Finance, Travel, Shared expenses; Habits. */
function groupsOf(ids: readonly TemplateId[]): TemplateId[][] {
  const groups: TemplateId[][] = [];
  const left = TEMPLATE_IDS.filter((id) => ids.includes(id));
  while (left.length > 0) {
    const group = [left.shift()!];
    for (let i = 0; i < group.length; i++) {
      for (let j = left.length - 1; j >= 0; j--) if (goTogether(group[i]!, left[j]!)) group.push(...left.splice(j, 1));
    }
    groups.push(TEMPLATE_IDS.filter((id) => group.includes(id)));
  }
  return groups;
}

/**
 * What is wrong with templates of one side set apart from each other, null when they go in one app:
 * a new app's in more than one group, or one added that goes with nothing in the app. A person's
 * app set up mixed before keeps its templates; only what is added is asked of.
 */
export function apartProblem(chosen: readonly TemplateId[], installed: ReadonlySet<TemplateId>): string | null {
  const names = (ids: TemplateId[]) => listed(ids.map((id) => t(TEMPLATES[id].short)));
  const groups = groupsOf([...new Set([...installed, ...chosen])]);
  if (installed.size === 0) return groups.length > 1 ? t('apps.apart', { groups: listed(groups.map((g) => g.map((id) => t(TEMPLATES[id].short)).join(' + '))) }) : null;
  const lone = groups.filter((g) => !g.some((id) => installed.has(id))).flat();
  return lone.length > 0 ? t('apps.apartFromApp', { templates: names(lone), count: lone.length, installed: names([...installed]) }) : null;
}

/** The questions a template asks, in order, with the templates chosen and its answers so far: one bound to another template or answer only when that holds. */
export function askedQuestions(template: AppTemplate, chosen: ReadonlySet<TemplateId>, answers: Answers = {}): Question[] {
  const asked: Question[] = [];
  const so: Answers = {};
  for (const q of template.questions) {
    if (q.when && !q.when({ chosen, answers: { ...so } })) continue;
    asked.push(q);
    so[q.key] = answers[q.key] ?? q.default;
  }
  return asked;
}

/** What is wrong with an answer to a question, said for whoever gave it; null when it is one. */
function wrongAnswer(q: Question, value: unknown): string | null {
  const values = q.options?.map((o) => o.value) ?? [];
  switch (q.kind) {
    case 'yesno':
      return typeof value === 'boolean' ? null : t('apps.answerYesNo');
    case 'choice':
      return typeof value === 'string' && values.includes(value) ? null : t('apps.answerOneOf', { options: values.join(', ') });
    case 'multi':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && values.includes(v)) ? null : t('apps.answerSomeOf', { options: values.join(', ') });
    case 'list':
      return Array.isArray(value) && value.every((v) => typeof v === 'string') ? null : t('apps.answerList');
    case 'text':
      return typeof value === 'string' ? null : t('apps.answerText');
    case 'rows': {
      const keys = (q.columns ?? []).map((c) => c.key);
      return Array.isArray(value) && value.every((row) => typeof row === 'object' && row !== null && !Array.isArray(row) && Object.entries(row).every(([k, v]) => keys.includes(k) && (typeof v === 'string' || typeof v === 'number')))
        ? null
        : t('apps.answerRows', { columns: keys.join(', ') });
    }
  }
}

/**
 * A rows answer as kept: each row's values by its columns, a text trimmed, a number or a day read
 * as one (a day kept 1 to 31), a choice one of its options; a row with no name (its first column)
 * left out.
 */
function cleanRows(q: Question, rows: AnswerRow[]): AnswerRow[] {
  const columns = q.columns ?? [];
  const first = columns[0]?.key;
  return rows
    .map((row) => {
      const out: AnswerRow = {};
      for (const c of columns) {
        const v = row[c.key];
        if (v === undefined || v === '') continue;
        if (c.type === 'number' || c.type === 'day') {
          const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
          if (Number.isFinite(n) && String(v).trim() !== '') out[c.key] = c.type === 'day' ? Math.max(1, Math.min(31, Math.round(n))) : n;
        } else if (c.type === 'choice') {
          if (c.options?.includes(String(v))) out[c.key] = String(v);
        } else if (String(v).trim()) out[c.key] = String(v).trim();
      }
      return out;
    })
    .filter((row) => !first || (typeof row[first] === 'string' && row[first] !== ''));
}

/** A list's items as kept: trimmed, the empty ones and the second of the same left out. */
function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  return items.map((i) => i.trim()).filter((i) => i && !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()));
}

/** A question's default for a device in `region`: its own there, else the usual one. */
export const defaultOf = (q: Question, region?: string): Answer => (region && q.regional?.[region]) ?? q.default;

/**
 * A template's answers from what was given, each question it asks with its answer or its default,
 * each it does not ask with its default; and what is wrong with what was given: a question it does
 * not have, an answer that is not one.
 */
export function readAnswers(template: AppTemplate, chosen: ReadonlySet<TemplateId>, given: { [key: string]: unknown } = {}, region?: string): { answers: Answers; problems: string[] } {
  const problems: string[] = [];
  const keys = template.questions.map((q) => q.key);
  for (const key of Object.keys(given)) if (!keys.includes(key)) problems.push(t('apps.noQuestion', { template: template.id, key, keys: keys.join(', ') }));
  const answers: Answers = {};
  for (const q of template.questions) {
    const asked = !q.when || q.when({ chosen, answers: { ...answers } });
    let value: unknown = asked && given[q.key] !== undefined ? given[q.key] : defaultOf(q, region);
    const wrong = wrongAnswer(q, value);
    if (wrong) {
      problems.push(`${template.id}.${q.key}: ${wrong}`);
      value = q.default;
    }
    answers[q.key] = (q.kind === 'list' || q.kind === 'multi' ? cleanList(value as string[]) : q.kind === 'rows' ? cleanRows(q, value as AnswerRow[]) : value) as Answer;
  }
  return { answers, problems };
}

/** The templates another's answers bring with them, each with the one that brings it: a project's budget brings Budget's pieces. */
export function impliedWith(answers: ReadonlyMap<TemplateId, Answers>): [TemplateId, TemplateId][] {
  const implied: [TemplateId, TemplateId][] = [];
  if (answers.has('projects') && !answers.has('budget') && answers.get('projects')!.budget === true) implied.push(['budget', 'projects']);
  // E-commerce sells as Sales does.
  if (answers.has('ecommerce') && !answers.has('sales')) implied.push(['sales', 'ecommerce']);
  return implied;
}

/** The templates another's answers bring with them, with their defaults. */
export const impliedBy = (answers: ReadonlyMap<TemplateId, Answers>): TemplateId[] => impliedWith(answers).map(([id]) => id);

/** The currencies as kept: codes in capitals, each once; null when one of them is not a code. */
export function readCurrencies(given: unknown): string[] | null {
  if (!Array.isArray(given)) return null;
  const codes: string[] = [];
  for (const c of given) {
    if (typeof c !== 'string' || !/^[A-Za-z]{3}$/.test(c.trim())) return null;
    const code = c.trim().toUpperCase();
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}
