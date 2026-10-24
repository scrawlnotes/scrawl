import type { ChatFile } from '@scrawlnotes/core';
import { type MessageKey, t } from '@scrawlnotes/i18n';
import { type MouseEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { Face, titleOf } from './ChatFaces';
import { isImage, isVideo, useFileUrl } from './ChatParts';
import { authorOf, DATES, HAS, type Hit, type HitFilters, hitLines, type HitState, searchable, useMessageSearch, whenOf, whereOf } from './messageSearch';
import { type ChatServer, useChat } from './chatStore';
import type { MenuItem } from './dialogs';
import { hostOf } from './servers';
import { Icon } from './Icon';
import { Marked } from './Search';

// Chat's search (design/chat.md, 7): on a computer the results take the conversation's place,
// newest first, with what narrows them over them; on a phone a page of its own over Chat's list.

type Menu = (event: MouseEvent, items: MenuItem[]) => void;

const HAS_WORDS: Record<NonNullable<HitFilters['has']>, MessageKey> = {
  photos: 'chat.has.photos',
  files: 'chat.has.files',
  voice: 'chat.has.voice',
  code: 'chat.has.code',
  links: 'chat.has.links',
};
const DATE_WORDS: Record<NonNullable<HitFilters['date']>, MessageKey> = { today: 'chat.date.today', week: 'chat.date.week', month: 'chat.date.month' };

/** The people of every conversation here, each once, by name; a server's name after it when there are more. */
function peopleOf(servers: ChatServer[]): { url: string; account: string; name: string }[] {
  const people = new Map<string, { url: string; account: string; name: string }>();
  for (const server of servers) for (const chat of server.chats) for (const person of chat.members) people.set(`${server.url}\n${person.id}`, { url: server.url, account: person.id, name: person.name });
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The conversations here: the rooms by name, then the direct messages; a room's space after it where there is more than one. */
function conversationsOf(servers: ChatServer[]): { url: string; chat: string; name: string; where: string; direct: boolean }[] {
  const spaces = new Set(servers.flatMap((server) => server.chats.flatMap((chat) => (chat.space ? [`${server.url}\n${chat.space}`] : []))));
  return servers.flatMap((server) =>
    server.chats
      .filter((chat) => !chat.hidden)
      .map((chat) => ({
        url: server.url,
        chat: chat.id,
        name: chat.kind === 'public' ? `#${chat.name}` : titleOf(chat, server.me),
        where: chat.kind !== 'direct' && spaces.size > 1 ? chat.spaceName : '',
        direct: chat.kind === 'direct',
      }))
      .sort((a, b) => Number(a.direct) - Number(b.direct) || a.where.localeCompare(b.where) || a.name.localeCompare(b.name)),
  );
}

/** From, In, Has and Date over the results, each a menu; what is chosen said in it. */
export function SearchFilters({ filters, onFilters, servers, menu, className }: { filters: HitFilters; onFilters: (filters: HitFilters) => void; servers: ChatServer[]; menu: Menu; className: string }) {
  const many = servers.length > 1;
  const set = (change: Partial<HitFilters>) => onFilters({ ...filters, ...change });
  /** A filter's chip: its name and what it is set to, lit once it narrows; Has alone says nothing until set. */
  const chip = (label: MessageKey, chosen: boolean, value: string | null, items: () => MenuItem[]) => (
    <button type="button" className={chosen ? 'on' : ''} onClick={(event) => menu(event, items())}>
      {value === null ? t(label) : <>{t(label)}: <b>{value}</b></>}
      <span className="dd">▾</span>
    </button>
  );
  return (
    <div className={className}>
      {chip('chat.from', !!filters.from, filters.from?.name ?? t('chat.anyone'), () => [
        { label: t('chat.anyone'), checked: !filters.from, run: () => set({ from: undefined }) },
        ...peopleOf(servers).map((person, index) => ({
          label: many ? `${person.name} · ${hostOf(person.url)}` : person.name,
          apart: index === 0,
          checked: filters.from?.url === person.url && filters.from.account === person.account,
          run: () => set({ from: person }),
        })),
      ])}
      {chip('chat.in', !!filters.in, filters.in?.name ?? t('chat.anywhere'), () => [
        { label: t('chat.anywhere'), checked: !filters.in, run: () => set({ in: undefined }) },
        ...conversationsOf(servers).map((each, index) => ({
          label: [each.name, each.where, many ? hostOf(each.url) : ''].filter(Boolean).join(' · '),
          apart: index === 0,
          checked: filters.in?.url === each.url && filters.in.chat === each.chat,
          run: () => set({ in: { url: each.url, chat: each.chat, name: each.name } }),
        })),
      ])}
      {chip('chat.has', !!filters.has, filters.has ? t(HAS_WORDS[filters.has]) : null, () => [
        { label: t('chat.anything'), checked: !filters.has, run: () => set({ has: undefined }) },
        ...HAS.map((has, index) => ({ label: t(HAS_WORDS[has]), apart: index === 0, checked: filters.has === has, run: () => set({ has }) })),
      ])}
      {chip('chat.date', !!filters.date, filters.date ? t(DATE_WORDS[filters.date]) : t('chat.anyTime'), () => [
        { label: t('chat.anyTime'), checked: !filters.date, run: () => set({ date: undefined }) },
        ...DATES.map((date, index) => ({ label: t(DATE_WORDS[date]), apart: index === 0, checked: filters.date === date, run: () => set({ date }) })),
      ])}
    </div>
  );
}

/** A photo's or a video's small picture beside a message found. */
function HitThumb({ url, file }: { url: string; file: ChatFile }) {
  const shown = useFileUrl(url, file.thumb ?? (isImage(file) ? file.hash : undefined), file.thumb ? 'image/webp' : file.type);
  return <span className="ch-th">{shown ? <img src={shown} alt="" draggable={false} /> : <span className="ch-wait" />}</span>;
}

/** Who wrote it, where, when; its words with those typed marked, and the names of its files that have them. */
function HitBody({ hit, query, me }: { hit: Hit; query: string; me: string }) {
  const where = whereOf(hit, me);
  const lines = hitLines(hit, query);
  return (
    <>
      <span className="wh">
        <b>{authorOf(hit)}</b>
        <span>{where.words}</span>
        {where.lead === 'lock' ? <Icon name="lock" /> : where.lead === 'hash' ? <span className="hs">#</span> : null}
        {where.name && <span>{where.name}</span>}
        <span>· {whenOf(hit.message.at)}</span>
      </span>
      {lines.text && (
        <span className="tx">
          <Marked text={lines.text.text} spans={lines.text.marks} />
        </span>
      )}
      {lines.files.map((file, index) => (
        <span key={index} className="fl">
          <Icon name="file" />
          <Marked text={file.name} spans={file.marks} />
        </span>
      ))}
    </>
  );
}

/** A message found: the face of who wrote it, what is said of it, its picture when it has one. */
function HitRow({ hit, query, me, on, onOpen, onHover, className }: { hit: Hit; query: string; me: string; on?: boolean; onOpen: () => void; onHover?: () => void; className: string }) {
  const picture = hit.message.files.find((file) => isImage(file) || isVideo(file));
  return (
    <button type="button" className={on ? `${className} hot` : className} data-href={hit.href} onClick={onOpen} onMouseMove={onHover}>
      <Face id={hit.message.author} name={authorOf(hit)} size="md" />
      <span className="bd">
        <HitBody hit={hit} query={query} me={me} />
      </span>
      {picture ? <HitThumb url={hit.url} file={picture} /> : <span />}
    </button>
  );
}

/** What the results say over them, or in their place: how many there are, still searching, none, out of reach. */
function countText(query: string, hits: Hit[], state: HitState, more: boolean): string {
  const words = query.trim();
  if (state === 'searching' && hits.length === 0) return t('chat.searching');
  if (more) return words ? t('chat.resultsMore', { count: hits.length, query: words }) : t('chat.resultsMoreBare', { count: hits.length });
  return words ? t('chat.results', { count: hits.length, query: words }) : t('chat.resultsBare', { count: hits.length });
}

function Empty({ query, filters, state }: { query: string; filters: HitFilters; state: HitState }) {
  if (state === 'failed') return <p className="ch-rnone">{t('chat.searchFailed')}</p>;
  if (!searchable(query, filters)) return <p className="ch-rnone">{filters.in ? t('chat.searchHintIn', { name: filters.in.name }) : t('chat.searchHint')}</p>;
  if (state !== 'done') return null;
  return <p className="ch-rnone">{query.trim() ? t('chat.noResults', { query: query.trim() }) : t('chat.noResultsBare')}</p>;
}

/** Brings the next page when the list is scrolled near its end. */
const nearEnd = (more: (() => void) | null) => (event: { currentTarget: HTMLElement }) => {
  const box = event.currentTarget;
  if (more && box.scrollHeight - box.scrollTop - box.clientHeight < 300) more();
};

/**
 * The results on a computer, in the conversation's place (design/chat.md, 7): Search and how many
 * over them, From, In, Has and Date, then the messages found, the newest first; the one the arrow
 * keys are on is lit. Too narrow for the list, the box to search in is over them, with back to the list.
 */
export function ChatResults({ query, filters, onFilters, hits, state, more, selected, onSelect, onOpen, servers, menu, box, onList }: {
  query: string;
  filters: HitFilters;
  onFilters: (filters: HitFilters) => void;
  hits: Hit[];
  state: HitState;
  more: (() => void) | null;
  selected: number;
  onSelect: (index: number) => void;
  onOpen: (hit: Hit) => void;
  servers: ChatServer[];
  menu: Menu;
  /** The box to search in, over the results while the list is not on screen. */
  box: ReactNode;
  onList: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('.ch-r.hot')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const meOf = (url: string) => servers.find((server) => server.url === url)?.me ?? '';
  return (
    <section className="chat-conv ch-res">
      <header className="ch-head">
        <button type="button" className="ch-back" aria-label={t('chat.title')} onClick={onList}>
          <Icon name="back" />
        </button>
        <b>{t('chat.search')}</b>
        {searchable(query, filters) && <span className="tp">{countText(query, hits, state, more !== null)}</span>}
        <span className="ch-rbox">{box}</span>
      </header>
      <SearchFilters filters={filters} onFilters={onFilters} servers={servers} menu={menu} className="ch-fl" />
      <div className="ch-rlist" ref={list} role="listbox" aria-label={t('chat.search')} onScroll={nearEnd(more)}>
        {hits.length === 0 ? (
          <Empty query={query} filters={filters} state={state} />
        ) : (
          hits.map((hit, index) => (
            <HitRow key={hit.href} hit={hit} query={query} me={meOf(hit.url)} on={index === selected} className="ch-r" onOpen={() => onOpen(hit)} onHover={() => index !== selected && onSelect(index)} />
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Chat's search on a phone: the box at the top, From, In, Has and Date under it as sheets, and the
 * messages found; one tapped opens its conversation at it.
 */
export function PhoneChatSearch({ menu, onOpen, inputRef }: { menu: Menu; onOpen: (hit: Hit) => void; inputRef?: RefObject<HTMLInputElement | null> }) {
  const chat = useChat();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<HitFilters>({});
  const { hits, state, more } = useMessageSearch(query, filters);
  const meOf = (url: string) => chat.servers.find((server) => server.url === url)?.me ?? '';
  return (
    <div className="chp-search" onScroll={nearEnd(more)}>
      <form
        className="mb-sxbar on"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          inputRef?.current?.blur();
        }}
      >
        <label className="mb-searchbar">
          <Icon name="search" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoFocus
            aria-label={t('chat.searchMessages')}
            placeholder={t('chat.searchMessages')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" className="clr" aria-label={t('search.clear')} onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery('')}>
              <Icon name="close" />
            </button>
          )}
        </label>
      </form>
      <SearchFilters filters={filters} onFilters={setFilters} servers={chat.servers} menu={menu} className="chp-fl" />
      {searchable(query, filters) && hits.length > 0 && <div className="mb-sec">{countText(query, hits, state, more !== null)}</div>}
      {hits.length === 0 ? (
        <Empty query={query} filters={filters} state={state} />
      ) : (
        <div className="chp-hits">
          {hits.map((hit) => (
            <HitRow key={hit.href} hit={hit} query={query} me={meOf(hit.url)} className="chp-hit" onOpen={() => onOpen(hit)} />
          ))}
        </div>
      )}
    </div>
  );
}
