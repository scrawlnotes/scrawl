import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, day, formula, link, nameField, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { stageColumns, stageHints } from './crm';

const CHANNELS = ['Blog', 'Newsletter', 'LinkedIn', 'X', 'Instagram', 'YouTube', 'Podcast'];
const STAGES = ['Ideas', 'Writing', 'Review', 'Scheduled', 'Published'];

/** What each of the usual stages means; another stage is the team's to say. */
const MEANS: { [stage: string]: string } = {
  Ideas: 'a thought, not written yet.',
  Writing: 'someone is writing it.',
  Review: 'someone else is reading it.',
  Scheduled: 'ready, with its day set.',
  Published: 'it is out; put its link on the card.',
};

export const content: AppTemplate = {
  id: 'content',
  version: 1,
  group: 'customers',
  name: 'apps.content.name',
  short: 'apps.content.short',
  icon: 'calendar',
  what: 'apps.content.what',
  questions: [
    {
      key: 'channels',
      kind: 'multi',
      label: 'apps.content.channels',
      options: CHANNELS.map((value) => ({ value, label: `apps.content.channel.${value.toLowerCase()}` as MessageKey })),
      default: CHANNELS.slice(0, 3),
    },
    { key: 'stages', kind: 'list', label: 'apps.content.stages', default: STAGES, help: 'apps.content.stagesHelp', add: 'apps.content.addStage', hints: stageHints },
    { key: 'campaigns', kind: 'yesno', label: 'apps.content.campaigns', default: false },
  ],
  money: () => false,
  pieces: (answers) => ['content', ...(answers.campaigns === true ? ['campaigns'] : [])],
  menu: ['content', 'campaigns'],
  build(app, answers) {
    const channels = (answers.channels as string[] | undefined) ?? [];
    const listed = (answers.stages as string[] | undefined) ?? [];
    // A board needs its stages: none given, it has the usual ones.
    const stages = listed.length > 0 ? listed : STAGES;
    const campaigns = answers.campaigns === true;
    const releases = app.hasPiece('releases');
    const budget = campaigns && app.hasPiece('budget-lines');
    const board = app.called('content');

    app.columns('content', stageColumns(stages));
    if (channels.length > 0) app.field('content', select('channel', 'Channel', channels, { Blog: 'green', Newsletter: 'yellow', LinkedIn: 'blue', X: 'gray', Instagram: 'pink', YouTube: 'red', Podcast: 'purple' }));
    app.field('content', select('type', 'Type', ['Post', 'Article', 'Video', 'Newsletter'], { Post: 'blue', Article: 'teal', Video: 'red', Newsletter: 'yellow' }));
    app.field('content', { key: 'link', label: 'Link', type: 'url' });
    if (releases) app.field('content', link('release', 'Release', app.path('releases')));

    if (campaigns) {
      const cards = app.path('content');
      app.field('content', link('campaign', 'Campaign', app.path('campaigns')));
      app.field('campaigns', nameField());
      app.field('campaigns', text('goal', 'Goal'));
      app.field('campaigns', day('start', 'Start', true));
      app.field('campaigns', day('end', 'End'));
      app.field('campaigns', select('status', 'Status', ['Planned', 'Running', 'Done'], { Planned: 'gray', Running: 'blue', Done: 'green' }, 'Planned'));
      app.view('campaigns', calendar({ start: 'start', end: 'end', color: 'status' }));
      app.field('campaigns', { key: 'pieces', label: 'Pieces', type: 'rollup', rollup: { from: cards, fn: 'count' } });
      app.field('campaigns', { key: 'open_pieces', label: 'Not out yet', type: 'rollup', rollup: { from: cards, fn: 'count', open: true } });
      app.field('campaigns', formula('published', 'Published', 'pieces - open_pieces'));
      if (budget) {
        app.field('campaigns', link('budget_line', 'Budget line', app.path('budget-lines')));
        app.field('campaigns', { key: 'spent', label: 'Spent', type: 'lookup', lookup: { link: 'budget_line', field: 'actual' } });
      }
      app.block('campaigns', { block: 'cards' });
      app.rule('campaigns', { kind: 'check', name: 'The end is before the start', src: 'check("end", () => end >= start, "The end is before the start")' });
      app.rule('campaigns', {
        kind: 'action',
        name: 'Plan content',
        src: `action("Plan content", {
  ask: {
    title: { label: "Title", type: "text", required: true },${channels.length > 0 ? `\n    channel: { label: "Channel", type: "choice", options: [${channels.map((c) => JSON.stringify(c)).join(', ')}] },` : ''}
    day: { label: "Goes out on", type: "date" },
  },
}, () => {
  card("${board}", { title: input.title, due: input.day, campaign: this${channels.length > 0 ? ', channel: input.channel' : ''} })
})`,
      });
    }

    app.about({
      title: 'Content calendar',
      what: `What you will publish${channels.length > 0 ? ` on ${channels.join(', ')}` : ''}, and when${campaigns ? ', in campaigns' : ''}.`,
      pieces: ['content', ...(campaigns ? ['campaigns'] : [])],
      glance: ['Its day shows in Upcoming', ...(campaigns ? ['Plan content adds a card to a campaign'] : [])],
      how: [
        `Add each piece as a card on ${board}${channels.length > 0 ? ' with its channel' : ''}: its due day is the day it goes out, its person the one who writes it.`,
        `Move it as it goes; put its link on the card once it is out.`,
        ...(campaigns ? ['Add a campaign with its dates, and press Plan content on it to add its pieces.'] : []),
        ...(releases ? ['Link a piece to the release it tells about.'] : []),
      ],
      auto: [
        'A card with a day shows in Upcoming on that day, until it is out.',
        ...(campaigns ? ['Plan content asks for the title, the channel and the day, and adds the card to the campaign.', 'A campaign counts its pieces and the ones out; one that ends before it starts is marked.'] : []),
        ...(budget ? ['A campaign shows what was paid on its budget line.'] : []),
        ...(releases ? ['A release shows the pieces that tell about it.'] : []),
      ],
      work: ['What each stage means:', ...stages.map((s) => `  - **${s}:** ${MEANS[s] ?? 'what it means for us.'}`), 'How often we publish on each channel.', 'Who reads a piece before it goes out.'],
    });
  },
};
