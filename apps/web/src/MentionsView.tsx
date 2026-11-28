import { dayOf, type Mention, type Person, type PersonRef } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import type { ReactNode } from 'react';
import { when } from './Activity';
import { Icon } from './Icon';
import { firstName, WhoOf } from './People';

// Mentions (design/mentions.html): where someone wrote @ of the person on a card or a task, the
// newest first, under Today and Earlier; each opens what it is in, at the comment.

/** A mention as the view shows it: where it is in the app, and what it is in, by name. */
export interface ShownMention extends Mention {
  /** The board's or the list's path in the app. */
  path: string;
  /** The board's or the list's name, as the row says where it is. */
  where: string;
  /** The people of its space, to name and picture who wrote it. */
  people: Person[];
  /** Not seen yet. */
  fresh: boolean;
}

const refOf = (mention: ShownMention): PersonRef => ({ ...(mention.by.id && { id: mention.by.id }), ...(mention.by.name && { name: mention.by.name }) });

/** The words, the mention of the person in them marked as the app marks a mention. */
function Said({ text, me }: { text: string; me: string | null }) {
  if (!me) return <>{text}</>;
  const parts = text.split(`@${me}`);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="mn-chip">@{me}</span>}
          {part}
        </span>
      ))}
    </>
  );
}

export function MentionsView({ mentions, today, me, onOpen, phone = false }: {
  mentions: ShownMention[];
  today: string;
  /** The person's name, as others write it after @. */
  me: string | null;
  onOpen: (mention: ShownMention) => void;
  phone?: boolean;
}) {
  const sorted = [...mentions].sort((a, b) => b.at.localeCompare(a.at));
  const now = sorted.filter((m) => dayOf(new Date(m.at)) === today);
  const before = sorted.filter((m) => dayOf(new Date(m.at)) !== today);
  const who = (m: ShownMention) => firstName(refOf(m), m.people) || m.by.name || t('card.someone');
  const where = (m: ShownMention): ReactNode =>
    m.item.kind === 'card' ? (
      <>
        <span className="mn-key">{m.item.key}</span> {m.item.title}
      </>
    ) : (
      <b>{m.item.title}</b>
    );
  const row = (m: ShownMention) => (
    <button key={`${m.path}\n${m.key}`} type="button" className={m.fresh ? 'mn-row fresh' : 'mn-row'} onClick={() => onOpen(m)}>
      <span className="mn-dot" aria-label={m.fresh ? t('mentions.unseen') : undefined} />
      <WhoOf who={refOf(m)} people={m.people} />
      <span className="mn-what">
        {phone ? (
          <span className="mn-l1">
            <b>{who(m)}</b> · {where(m)}
          </span>
        ) : (
          <span className="mn-l1">
            <b>{who(m)}</b> {m.in === 'description' ? (m.item.kind === 'task' ? t('mentions.inTask') : t('mentions.inDescription')) : t('mentions.inComment')} {where(m)} · {m.where}
          </span>
        )}
        <span className="mn-q">
          <Said text={m.text} me={me} />
        </span>
        {phone && (
          <span className="mn-t">
            {m.in === 'description' ? (m.item.kind === 'task' ? t('mentions.taskDescription') : t('mentions.description')) : t('mentions.comment')} · {when(m.at, today)}
          </span>
        )}
      </span>
      {!phone && <span className="mn-t">{when(m.at, today)}</span>}
    </button>
  );
  return (
    <section className={phone ? 'mentions-view phone' : 'mentions-view'}>
      {phone && (
        <header className="mb-head">
          <h1>{t('mentions.title')}</h1>
        </header>
      )}
      {!phone && (
        <div className="th">
          <b>{t('mentions.title')}</b>
          {me && <span>{t('mentions.hint', { name: me })}</span>}
        </div>
      )}
      <div className="tl">
        {sorted.length === 0 ? (
          <p className="mn-empty">
            <Icon name="at" />
            {t('mentions.empty', { name: me ?? '' })}
          </p>
        ) : (
          <>
            {now.length > 0 && <div className="mn-day">{t('mentions.today')}</div>}
            {now.map(row)}
            {before.length > 0 && <div className="mn-day">{t('mentions.earlier')}</div>}
            {before.map(row)}
          </>
        )}
      </div>
    </section>
  );
}
