import { t } from '@scrawlnotes/i18n';
import { appointments } from './templates/appointments';
import { assets } from './templates/assets';
import { budget } from './templates/budget';
import { content } from './templates/content';
import { contracts } from './templates/contracts';
import { crm } from './templates/crm';
import { ecommerce } from './templates/ecommerce';
import { goals } from './templates/goals';
import { incidents } from './templates/incidents';
import { product } from './templates/product';
import { projects } from './templates/projects';
import { recruiting } from './templates/recruiting';
import { sales } from './templates/sales';
import { stock } from './templates/stock';
import { subscriptions } from './templates/subscriptions';
import { support } from './templates/support';
import { timeoff } from './templates/timeoff';
import { type Answer, type Answers, type AppTemplate, type Question, TEMPLATE_IDS, type TemplateId } from './types';

export const TEMPLATES: { [id in TemplateId]: AppTemplate } = { crm, sales, support, appointments, projects, budget, stock, ecommerce, product, recruiting, assets, content, subscriptions, contracts, timeoff, goals, incidents };

export const isTemplateId = (id: unknown): id is TemplateId => TEMPLATE_IDS.includes(id as TemplateId);

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
  }
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
    answers[q.key] = (q.kind === 'list' || q.kind === 'multi' ? cleanList(value as string[]) : value) as Answer;
  }
  return { answers, problems };
}

/** The templates another's answers bring with them, with their defaults: a project's budget brings Budget's pieces. */
export function impliedBy(answers: ReadonlyMap<TemplateId, Answers>): TemplateId[] {
  const implied: TemplateId[] = [];
  if (answers.has('projects') && !answers.has('budget') && answers.get('projects')!.budget === true) implied.push('budget');
  // E-commerce sells as Sales does.
  if (answers.has('ecommerce') && !answers.has('sales')) implied.push('sales');
  return implied;
}

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
