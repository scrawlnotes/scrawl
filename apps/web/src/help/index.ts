import type { MessageKey } from '@scrawlnotes/i18n';
import welcomeComputer from '../welcome.md?raw';
import welcomePhone from '../welcome.phone.md?raw';

// Help (design/help.md): notes that come with the app, one file each in this folder, `<id>.md`,
// and `<id>.phone.md` beside it where a phone says it otherwise. Getting started is Welcome to Scrawl.

/** A page of Help, by its note's id; `group` heads the pages from it on, as the app picker groups them. */
export interface HelpPage {
  id: string;
  label: MessageKey;
  group?: MessageKey;
}

/** A topic: one note, by its own id, or a heading over its pages and then its own topics, which fold too. */
export interface HelpTopic {
  id: string;
  label: MessageKey;
  pages?: HelpPage[];
  topics?: HelpTopic[];
}

export const HELP_START = 'start';

/** The topics in the order they are read: first the everyday things, last setting up; Settings at the foot. */
export const HELP: HelpTopic[] = [
  { id: HELP_START, label: 'help.start' },
  { id: 'notes', label: 'help.notes' },
  { id: 'quick-notes', label: 'help.quickNotes' },
  { id: 'task-lists', label: 'help.taskLists' },
  { id: 'boards', label: 'help.boards' },
  { id: 'keys', label: 'help.keys' },
  { id: 'collections', label: 'help.collections' },
  {
    id: 'apps',
    label: 'help.apps',
    pages: [
      { id: 'apps-how', label: 'help.appsHow' },
      { id: 'apps-editing', label: 'help.appsEditing' },
      { id: 'apps-building', label: 'help.appsBuilding' },
    ],
    topics: [
      // An app's note by its template's id, its name as the app picker gives it, in the picker's groups.
      {
        id: 'business',
        label: 'help.business',
        pages: [
          { id: 'crm', label: 'apps.crm.name', group: 'apps.group.customers' },
          { id: 'support', label: 'apps.support.name' },
          { id: 'appointments', label: 'apps.appointments.name' },
          { id: 'content', label: 'apps.content.name' },
          { id: 'field', label: 'apps.field.name' },
          { id: 'consulting', label: 'apps.consulting.name' },
          { id: 'sales', label: 'apps.sales.name', group: 'apps.group.money' },
          { id: 'budget', label: 'apps.budget.name' },
          { id: 'stock', label: 'apps.stock.name' },
          { id: 'ecommerce', label: 'apps.ecommerce.name' },
          { id: 'assets', label: 'apps.assets.name' },
          { id: 'subscriptions', label: 'apps.subscriptions.name' },
          { id: 'projects', label: 'apps.projects.name', group: 'apps.group.work' },
          { id: 'product', label: 'apps.product.name' },
          { id: 'recruiting', label: 'apps.recruiting.name' },
          { id: 'contracts', label: 'apps.contracts.name' },
          { id: 'timeoff', label: 'apps.timeoff.name' },
          { id: 'goals', label: 'apps.goals.name' },
          { id: 'incidents', label: 'apps.incidents.name' },
        ],
      },
      {
        id: 'personal',
        label: 'help.personal',
        pages: [
          { id: 'finance', label: 'apps.finance.name', group: 'apps.group.home' },
          { id: 'home', label: 'apps.home.name' },
          { id: 'recipes', label: 'apps.recipes.name' },
          { id: 'health', label: 'apps.health.name', group: 'apps.group.health' },
          { id: 'sport', label: 'apps.sport.name' },
          { id: 'gym', label: 'apps.gym.name' },
          { id: 'habits', label: 'apps.habits.name' },
          { id: 'travel', label: 'apps.travel.name', group: 'apps.group.life' },
          { id: 'split', label: 'apps.split.name' },
          { id: 'jobs', label: 'apps.jobs.name' },
          { id: 'people', label: 'apps.people.name' },
          { id: 'reading', label: 'apps.reading.name' },
        ],
      },
    ],
  },
  { id: 'search', label: 'help.search' },
  { id: 'spaces', label: 'help.spaces' },
  { id: 'sync', label: 'help.sync' },
  { id: 'devices', label: 'help.devices' },
  { id: 'working-together', label: 'help.together' },
  { id: 'chat', label: 'help.chat' },
  { id: 'ai-agents', label: 'help.agents' },
  {
    id: 'server',
    label: 'help.server',
    pages: [
      { id: 'server-about', label: 'help.serverAbout' },
      { id: 'server-setup', label: 'help.serverSetup' },
      { id: 'server-running', label: 'help.serverRunning' },
    ],
  },
  { id: 'settings', label: 'help.settings' },
];

const isHeading = (topic: HelpTopic) => !!(topic.pages || topic.topics);
const pagesOf = (topic: HelpTopic): HelpPage[] =>
  isHeading(topic) ? [...(topic.pages ?? []), ...(topic.topics ?? []).flatMap(pagesOf)] : [{ id: topic.id, label: topic.label }];

/** Every page in the order they are read; Previous and Next go by it. */
export const HELP_PAGES: HelpPage[] = HELP.flatMap(pagesOf);

/** The topics a page is under, the outermost first; none for a topic that is a note of its own. */
export function helpTrailOf(id: string, topics: HelpTopic[] = HELP): HelpTopic[] {
  for (const topic of topics) {
    if (topic.pages?.some((page) => page.id === id)) return [topic];
    const inner = helpTrailOf(id, topic.topics ?? []);
    if (inner.length > 0) return [topic, ...inner];
  }
  return [];
}

/** A topic with pages, at any depth, by its id. */
export function helpTopic(id: string, topics: HelpTopic[] = HELP): HelpTopic | undefined {
  for (const topic of topics) {
    if (topic.id === id) return topic;
    const inner = helpTopic(id, topic.topics ?? []);
    if (inner) return inner;
  }
  return undefined;
}

export const isHelpPage = (id: string): boolean => HELP_PAGES.some((page) => page.id === id);

// Read only when Help opens, so that the app does not carry them as it starts.
const NOTES = import.meta.glob<string>('./*.md', { query: '?raw', import: 'default' });

/** A page's text, the phone's where it has its own; a page with no file is empty. */
export async function helpText(id: string, phone: boolean): Promise<string> {
  if (id === HELP_START) return phone ? welcomePhone : welcomeComputer;
  const load = (phone && NOTES[`./${id}.phone.md`]) || NOTES[`./${id}.md`];
  return load ? load() : '';
}
