import type { MessageKey } from '@scrawlnotes/i18n';
import { link, select } from '../pieces';
import { companies, feedback, people } from '../shared';
import type { AppTemplate } from '../types';

const CHANNELS = ['email', 'phone', 'chat', 'web form', 'social'];

/** Whether the app keeps feedback: Support's answer, else Product development's. */
export const keepsFeedback = (app: { has(id: 'support' | 'product'): boolean; answers(id: 'support' | 'product'): { [key: string]: unknown } }) =>
  app.has('support') ? app.answers('support').feedback !== false : app.has('product') && app.answers('product').feedback !== false;

const REPLIES: [string, string][] = [
  ['We are on it', "Thanks for writing to us. We have your request and are looking into it; we will write again by [day].\n"],
  ['We need a few more details', 'Thanks for writing to us. To help you, we need a few more details:\n\n- What did you do just before it happened?\n- What did you expect, and what happened instead?\n- A screenshot, if you can.\n'],
  ['Closing this request', 'We have not heard from you for a while, so we are closing this request. Write to us any time and we will open it again.\n'],
];

export const support: AppTemplate = {
  id: 'support',
  version: 1,
  group: 'customers',
  name: 'apps.support.name',
  what: 'apps.support.what',
  questions: [
    {
      key: 'channels',
      kind: 'multi',
      label: 'apps.support.channels',
      options: CHANNELS.map((value) => ({ value, label: `apps.support.channel.${value === 'web form' ? 'web' : value}` as MessageKey })),
      default: ['email', 'phone', 'chat'],
    },
    { key: 'feedback', kind: 'yesno', label: 'apps.support.feedback', default: true },
    { key: 'replies', kind: 'yesno', label: 'apps.support.replies', default: true },
  ],
  money: () => false,
  pieces: (answers) => ['people', 'requests', ...(answers.feedback !== false ? ['feedback'] : []), ...(answers.replies !== false ? ['saved-replies'] : [])],
  build(app, answers) {
    companies(app);
    people(app);
    const channels = (answers.channels as string[] | undefined) ?? [];
    app.columns('requests', [
      ['New', 'backlog'],
      ['In progress', 'active'],
      ['Waiting on customer', 'active'],
      ['Resolved', 'done'],
      ['Closed', 'done'],
    ]);
    if (app.hasPiece('companies')) app.field('requests', link('company', 'Company', app.path('companies')));
    app.field('requests', link('person', 'Person', app.path('people')));
    if (channels.length > 0) app.field('requests', select('channel', 'Channel', channels, { email: 'yellow', phone: 'blue', chat: 'green', 'web form': 'purple', social: 'pink' }));
    app.field('requests', select('type', 'Type', ['question', 'problem', 'request'], { question: 'blue', problem: 'red', request: 'purple' }));
    for (const role of ['companies', 'people']) if (app.hasPiece(role)) app.block(role, { block: 'cards' });
    if (answers.feedback !== false) feedback(app);
    if (answers.replies !== false) for (const [name, text] of REPLIES) app.note('saved-replies', name, text);

    app.about({
      title: 'Customer support',
      what: `Every request a customer sends${channels.length > 0 ? ` by ${channels.join(', ')}` : ''}, from the first message to its answer${answers.feedback !== false ? ', and what customers tell you about the product' : ''}.`,
      pieces: ['requests', ...(answers.feedback !== false ? ['feedback'] : []), ...(answers.replies !== false ? ['saved-replies'] : [])],
      how: [
        `Add a card on ${app.called('requests')} for each request; link it to the person${app.hasPiece('companies') ? ' and the company' : ''}.`,
        'Move it as you work: In progress, Waiting on customer while you wait for an answer, Resolved once it is answered.',
        ...(answers.feedback !== false ? [`When a customer asks for something new, add it to ${app.called('feedback')}.`] : []),
        ...(answers.replies !== false ? [`Copy an answer from ${app.called('saved-replies')}; add the ones you write often.`] : []),
      ],
      auto: [`A ${app.hasPiece('companies') ? 'company and a ' : ''}person show their requests${answers.feedback !== false ? ' and feedback' : ''} on their screen.`],
      work: ['Who looks at new requests, and how often.', 'We answer a request within one working day; give the card a due day when you promise one.', 'A request is Closed a week after it is Resolved, if the customer does not write again.'],
    });
  },
};
