import { type ChatHas, type ChatInfo, type ChatMessage, chatLink, markedText, plainText, queryWords, type Span } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { useEffect, useRef, useState } from 'react';
import { shortDay, timeOf, titleOf } from './ChatFaces';
import { clock } from './chatMedia';
import { store } from './chatStore';

// Messages found by their words (design/chat.md, 7). The servers find them: each one this device
// has messaging with, or the one a filter names; their pages come together, the newest first.
// Chat's search, the search window's Messages and a phone's Search tab use it alike.

/** A message found, with its conversation as the server gave it, and its link. */
export interface Hit {
  url: string;
  message: ChatMessage;
  chat: ChatInfo;
  href: string;
}

/** What the search is narrowed to: someone, a conversation, what a message has, when. */
export interface HitFilters {
  from?: { url: string; account: string; name: string };
  in?: { url: string; chat: string; name: string };
  has?: ChatHas;
  date?: HitDate;
}

/** Today, the last seven days, the last thirty. */
export type HitDate = 'today' | 'week' | 'month';

export const HAS: ChatHas[] = ['photos', 'files', 'voice', 'code', 'links'];
export const DATES: HitDate[] = ['today', 'week', 'month'];

/** Since when a date filter finds: today's start here, or seven or thirty days ago. */
function sinceOf(date: HitDate): number {
  if (date === 'today') return new Date(new Date().toDateString()).getTime();
  return Date.now() - (date === 'week' ? 7 : 30) * 24 * 60 * 60 * 1000;
}

/** Whether there is something to look for: a word, or someone, or what a message has. */
export const searchable = (query: string, filters: HitFilters) => queryWords(query).some((word) => /[\p{L}\p{N}]/u.test(word)) || !!filters.from || !!filters.has;

export type HitState = 'idle' | 'searching' | 'done' | 'failed';

/** A page's size: what a screen of results needs, and a little more. */
const PAGE = 30;

/**
 * Searches a quarter of a second after what is typed or narrowed changes, while `on`; `more`
 * brings the next page of each server that has one, null when none has.
 */
export function useMessageSearch(query: string, filters: HitFilters, on = true): { hits: Hit[]; state: HitState; more: (() => void) | null } {
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<HitState>('idle');
  const [next, setNext] = useState<Map<string, number>>(new Map());
  const asked = useRef(0);
  const loading = useRef(false);
  const key = JSON.stringify([query.trim(), filters.from?.url, filters.from?.account, filters.in?.url, filters.in?.chat, filters.has, filters.date]);
  const ask = (url: string, before?: number) =>
    store
      .server(url)!
      .client.search({
        q: query.trim(),
        from: filters.from?.account,
        in: filters.in?.chat,
        has: filters.has,
        since: filters.date ? sinceOf(filters.date) : undefined,
        before,
        limit: PAGE,
      })
      .then((found) => ({ url, found }));
  const take = (pages: { url: string; found: Awaited<ReturnType<typeof ask>>['found'] }[], had: Hit[]) => {
    const fresh = pages.flatMap(({ url, found }) =>
      found.messages.flatMap((message) => {
        const chat = found.chats.find((each) => each.id === message.chat);
        return chat ? [{ url, message, chat, href: chatLink(url, chat.id, message.id) }] : [];
      }),
    );
    const seen = new Set(had.map((hit) => hit.href));
    return [...had, ...fresh.filter((hit) => !seen.has(hit.href))].sort((a, b) => b.message.at - a.message.at);
  };
  useEffect(() => {
    const ticket = ++asked.current;
    if (!on || !searchable(query, filters)) {
      setHits([]);
      setNext(new Map());
      setState('idle');
      return;
    }
    setState('searching');
    const timer = window.setTimeout(() => {
      const urls = store
        .read()
        .servers.map((server) => server.url)
        .filter((url) => (!filters.from || filters.from.url === url) && (!filters.in || filters.in.url === url));
      void Promise.allSettled(urls.map((url) => ask(url))).then((results) => {
        if (ticket !== asked.current) return;
        const pages = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
        setHits(take(pages, []));
        setNext(new Map(pages.flatMap(({ url, found }) => (found.next === null ? [] : [[url, found.next] as const]))));
        setState(pages.length === 0 && results.length > 0 ? 'failed' : 'done');
      });
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on]);
  const more =
    next.size > 0 && state === 'done'
      ? () => {
          if (loading.current) return;
          loading.current = true;
          const ticket = asked.current;
          void Promise.allSettled([...next].map(([url, before]) => ask(url, before))).then((results) => {
            loading.current = false;
            if (ticket !== asked.current) return;
            const pages = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
            setHits((had) => take(pages, had));
            setNext(new Map(pages.flatMap(({ url, found }) => (found.next === null ? [] : [[url, found.next] as const]))));
          });
        }
      : null;
  return { hits, state, more };
}

// ---------- what a hit shows ----------

/** Who wrote a message found, as its conversation names them. */
export const authorOf = (hit: Hit) => hit.chat.members.find((person) => person.id === hit.message.author)?.name ?? t('card.someone');

/** When a message found was written: Today 11:40, a weekday this week, else its day. */
export function whenOf(at: number): string {
  const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(new Date(at).toDateString()).getTime()) / 86_400_000);
  if (days === 0) return t('chat.todayAt', { time: timeOf(at) });
  if (days < 7) return new Date(at).toLocaleDateString(locale(), { weekday: 'long' });
  return shortDay(at);
}

/**
 * Where a message found is, after who wrote it: in a room (# or the lock before its name), in a
 * group's direct message, or between two, to you or to the other.
 */
export function whereOf(hit: Hit, me: string): { words: string; lead?: 'hash' | 'lock'; name?: string } {
  const { chat } = hit;
  if (chat.kind !== 'direct') return { words: t('chat.inWord'), lead: chat.kind === 'private' ? 'lock' : 'hash', name: chat.name };
  const others = chat.members.filter((person) => person.id !== me);
  if (others.length > 1) return { words: t('chat.inWord'), name: titleOf(chat, me) };
  return { words: hit.message.author === me ? t('chat.toName', { name: others[0]?.name ?? t('card.someone') }) : t('chat.toYou') };
}

/**
 * What a hit shows of its message: its words, cut around those typed and with them marked; the
 * names of its files that have them; and what its file is when it has no words of its own.
 */
export function hitLines(hit: Hit, query: string): { text: { text: string; marks: Span[] } | null; files: { name: string; marks: Span[] }[] } {
  const words = plainText(hit.message.body);
  const files = hit.message.files.map((file) => markedText(file.name, query)).filter((each) => each.marks.length > 0);
  const text = words ? markedText(words, query) : files.length ? null : { text: kindOf(hit.message), marks: [] };
  return { text, files: files.map((each) => ({ name: each.text, marks: each.marks })) };
}

/** A message without words, as its first file is: Photo, Video, Voice message · 0:14, or its name. */
function kindOf(message: ChatMessage): string {
  const file = message.files[0];
  if (!file) return '';
  if (file.type.startsWith('image/')) return t('chat.photo');
  if (file.type.startsWith('video/')) return t('chat.video');
  if (file.type.startsWith('audio/')) return file.duration !== undefined ? `${t('chat.voice')} · ${clock(file.duration)}` : t('chat.voice');
  return file.name || t('chat.file');
}
