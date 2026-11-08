import { type ChatInfo, type ChatMessage, plainText } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type MouseEvent, useEffect, useState } from 'react';
import { type ChatLinks, Conversation } from './Chat';
import { Face, namesOf, others, shortDay, timeOf, titleOf } from './ChatFaces';
import { clock } from './chatMedia';
import { isAudio, isImage, isVideo, NotifyBanner } from './ChatParts';
import { InfoBody, type InfoTab, MediaThumb, useChatInfo } from './ChatRooms';
import { notWrittenTo, teammatesOf } from './ChatStart';
import { type ChatServer, draftOf, store, useChat } from './chatStore';
import type { MenuItem } from './dialogs';
import { Icon } from './Icon';
import { hostOf } from './servers';

// Chat on a phone (design/chat.md, 8.2; design/mockups.html, Messaging, Telefon): the fifth tab of
// the tab bar. Its first page lists each space's rooms and then the direct messages, with the
// latest of each; a conversation is a page of its own, and its Info a page over it.

/** A conversation of a server: one this person is in, or a room read from Browse rooms. */
export function chatOf(server: ChatServer | undefined, id: string): ChatInfo | undefined {
  return server?.chats.find((each) => each.id === id && !each.hidden) ?? (server?.visiting?.id === id ? server.visiting : undefined);
}

/** What a message is in a list's line: its words, or what kind of file it is. */
function whatOf(message: ChatMessage): string {
  if (message.deleted) return t('chat.deleted');
  const words = plainText(message.body);
  if (words) return words;
  const file = message.files[0];
  if (!file) return '';
  if (isImage(file)) return t('chat.photo');
  if (isVideo(file)) return t('chat.video');
  if (isAudio(file)) return file.duration !== undefined ? `${t('chat.voice')} · ${clock(file.duration)}` : t('chat.voice');
  return file.name || t('chat.file');
}

/** When the latest message came, as a list's line says it: its time today, its weekday this week, else its day. */
function whenOf(at: number): string {
  const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(new Date(at).toDateString()).getTime()) / 86_400_000);
  if (days === 0) return timeOf(at);
  if (days < 7) return new Date(at).toLocaleDateString(locale(), { weekday: 'short' });
  return shortDay(at);
}

/** The mark before a conversation on a phone: a room's # or lock in its tile, the other's face, two faces for a group. */
function PhoneLead({ chat, server, size = 'list' }: { chat: ChatInfo; server: ChatServer; size?: 'list' | 'big' }) {
  const people = others(chat, server.me);
  if (chat.kind !== 'direct') return <span className={size === 'big' ? 'chp-ic big' : 'chp-ic'}>{chat.kind === 'private' ? <Icon name="lock" /> : '#'}</span>;
  if (people.length === 1) return <Face id={people[0]!.id} name={people[0]!.name} size="lg" online={server.active.includes(people[0]!.id)} />;
  return (
    <span className="chp-g">
      {people.slice(0, 2).map((person) => (
        <Face key={person.id} id={person.id} name={person.name} size="md" />
      ))}
    </span>
  );
}

/** Which conversations the list shows: all, the ones with something unread, the rooms, the direct messages. */
type Chip = 'all' | 'unread' | 'rooms' | 'direct';
const CHIPS: Chip[] = ['all', 'unread', 'rooms', 'direct'];
const CHIP = 'scrawl.chatChip';

/** The chip chosen on this device, else All. */
function loadChip(): Chip {
  try {
    const kept = localStorage.getItem(CHIP);
    return CHIPS.includes(kept as Chip) ? (kept as Chip) : 'all';
  } catch {
    return 'all';
  }
}

function saveChip(chip: Chip) {
  try {
    localStorage.setItem(CHIP, chip);
  } catch {
    // Not kept; the list opens on All next time.
  }
}

/**
 * Chat's first page (design/chat.md, 26): the rooms and the direct messages in one list, the latest
 * message first, a room with its space after its name; All, Unread, Rooms and Direct over it. The
 * conversations with no message and the people to write to come last, under No messages yet.
 */
export function PhoneChatList({ onOpen, onSearch, onWrite, onInvite }: {
  onOpen: (url: string, chat: string) => void;
  onSearch: () => void;
  /** Someone to write to, with no direct message yet: it opens. */
  onWrite: (url: string, person: string) => void;
  /** Invite people, when no one shares a space with this person. */
  onInvite: () => void;
}) {
  const snapshot = useChat();
  const [chip, setChip] = useState(loadChip);
  if (!snapshot.servers.length) return <p className="chp-none">{t('chat.loading')}</p>;
  const many = snapshot.servers.length > 1;
  const shown = snapshot.servers.flatMap((server) => server.chats.filter((chat) => !chat.hidden && chat.archived === null).map((chat) => ({ server, chat })));
  // A room's space is said only when there is more than one to tell apart.
  const spaced = new Set(shown.filter(({ chat }) => chat.kind !== 'direct' && chat.space).map(({ server, chat }) => `${server.url} ${chat.space}`)).size > 1;
  const fits = ({ chat }: { chat: ChatInfo }) =>
    chip === 'unread' ? chat.unread > 0 : chip === 'rooms' ? chat.kind !== 'direct' : chip === 'direct' ? chat.kind === 'direct' : true;
  const listed = shown.filter(fits);
  const latest = listed.filter(({ chat }) => chat.last).sort((a, b) => b.chat.last!.at - a.chat.last!.at);
  const empty = chip === 'unread' ? [] : listed.filter(({ chat }) => !chat.last).sort((a, b) => a.chat.name.localeCompare(b.chat.name, locale()));
  const people = chip === 'all' || chip === 'direct';
  const row = (server: ChatServer, chat: ChatInfo) => {
    const nameOf = namesOf(server);
    const off = chat.notify === 'off';
    const draft = draftOf(server.url, chat.id).trim();
    const last = chat.last;
    const solo = chat.kind === 'direct' && others(chat, server.me).length === 1;
    const line = draft
      ? t('chat.draftLine', { text: plainText(draft) })
      : !last
        ? chat.topic || null
        : last.author === server.me && !last.agent
          ? t('chat.youLine', { text: whatOf(last) })
          : solo
            ? whatOf(last)
            : `${nameOf(last.author).split(/\s+/)[0]}: ${whatOf(last)}`;
    const where = chat.kind === 'direct' ? (many ? hostOf(server.url) : null) : spaced ? chat.spaceName || chat.space : null;
    return (
      <button type="button" key={`${server.url} ${chat.id}`} className={off ? 'chp-c off' : 'chp-c'} onClick={() => onOpen(server.url, chat.id)}>
        <PhoneLead chat={chat} server={server} />
        <span className="tx">
          <b className={chat.unread > 0 && !off ? 'un' : ''}>
            {titleOf(chat, server.me)}
            {where && <span className="at"> · {where}</span>}
          </b>
          {line ? <small className={draft ? 'dr' : ''}>{line}</small> : <small className="none">{t('chat.noMessagesYet')}</small>}
        </span>
        <span className="rt">
          {last && <small className={chat.alerts > 0 ? 'hot' : ''}>{whenOf(last.at)}</small>}
          {chat.alerts > 0 ? <em>{chat.alerts}</em> : off ? <Icon name="bellOff" /> : null}
        </span>
      </button>
    );
  };
  // The people to write to with no direct message yet; with no one at all, Invite people.
  const toWrite = people
    ? snapshot.servers.flatMap((server) =>
        teammatesOf(server).length === 0
          ? [
              <button type="button" key={`${server.url} invite`} className="chp-c addr" onClick={onInvite}>
                <span className="chp-ic">
                  <Icon name="plus" />
                </span>
                <span className="tx">
                  <b>{t('chat.invitePeople')}</b>
                  <small>{t('chat.aloneSoFar')}</small>
                </span>
              </button>,
            ]
          : notWrittenTo(server)
              .slice(0, 5)
              .map((person) => (
                <button type="button" key={`${server.url} ${person.id}`} className="chp-c" onClick={() => onWrite(server.url, person.id)}>
                  <Face id={person.id} name={person.name} size="lg" online={server.active.includes(person.id)} />
                  <span className="tx">
                    <b>{person.name}</b>
                    <small>{t('chat.sayHello', { space: person.space })}</small>
                  </span>
                </button>
              )),
      )
    : [];
  const foot = [...empty.map(({ server, chat }) => row(server, chat)), ...toWrite];
  return (
    <div className="chp-list">
      <button type="button" className="mb-searchbar chp-find" onClick={onSearch}>
        <Icon name="search" />
        <span>{t('chat.searchMessages')}</span>
      </button>
      <NotifyBanner phone />
      <div className="chn-spaces chp-chips" role="tablist" aria-label={t('chat.show')}>
        {CHIPS.map((each) => (
          <button
            type="button"
            role="tab"
            key={each}
            aria-selected={each === chip}
            onClick={() => {
              setChip(each);
              saveChip(each);
            }}
          >
            {t(`chat.chip.${each}`)}
          </button>
        ))}
      </div>
      {latest.map(({ server, chat }) => row(server, chat))}
      {chip === 'unread' && !latest.length && <p className="chp-none">{t('chat.caughtUp')}</p>}
      {foot.length > 0 && (
        <>
          <div className="mb-sec">{t('chat.noMessagesYet')}</div>
          {foot}
        </>
      )}
    </div>
  );
}

/** A conversation as a page: the conversation Chat shows on a computer, in the phone's way. */
export function PhoneChatConversation({ url, chat: id, target, links, menu, back, onBack, onInfo, onFollow }: {
  url: string;
  chat: string;
  target: { message: string; at: number } | null;
  links: ChatLinks;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  back: string;
  onBack: () => void;
  onInfo: () => void;
  onFollow: (href: string) => void;
}) {
  const snapshot = useChat();
  const server = snapshot.servers.find((each) => each.url === url);
  const chat = chatOf(server, id);
  useEffect(() => {
    store.setViewing({ url, chat: id });
    return () => store.setViewing(null);
  }, [url, id]);
  // Taken out of it, or it gone, while it is open: back to the list, as a computer shows another.
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (chat) setSeen(true);
    else if (seen) onBack();
  }, [chat !== undefined]);
  if (!server || !chat) {
    return (
      <>
        <div className="mb-nav">
          <button type="button" className="mb-back" onClick={onBack}>
            <Icon name="back" />
            <span>{back}</span>
          </button>
        </div>
        <p className="chp-none">{t('chat.linkGone')}</p>
      </>
    );
  }
  return (
    <Conversation
      key={`${url} ${id}`}
      server={server}
      chat={chat}
      menu={menu}
      links={links}
      target={target}
      onFollow={onFollow}
      onList={onBack}
      phone={{ back, onBack, onInfo }}
    />
  );
}

/**
 * A conversation's Info as a page (design/mockups.html, Messaging, Telefon): its mark, name and
 * topic; what it tells you and its people; its photos and videos, all of them a tap away; its
 * files, recordings and links; Export…, Leave room or Hide, Archive room.
 */
export function PhoneChatInfo({ url, chat: id, menu, say, onPart, onLeft, onClose }: {
  url: string;
  chat: string;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  say: (text: string) => void;
  /** Opens a part of it as a page of its own: People, Media, Files, Voice, Links, About. */
  onPart: (tab: InfoTab) => void;
  /** The conversation is off the list: left or hidden. */
  onLeft: () => void;
  /** Archived or unarchived: back to the conversation. */
  onClose: () => void;
}) {
  const snapshot = useChat();
  const server = snapshot.servers.find((each) => each.url === url);
  const chat = chatOf(server, id);
  if (!server || !chat) return <p className="chp-none">{t('chat.linkGone')}</p>;
  return <InfoPage server={server} chat={chat} menu={menu} say={say} onPart={onPart} onLeft={onLeft} onClose={onClose} />;
}

function InfoPage({ server, chat, menu, say, onPart, onLeft, onClose }: {
  server: ChatServer;
  chat: ChatInfo;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  say: (text: string) => void;
  onPart: (tab: InfoTab) => void;
  onLeft: () => void;
  onClose: () => void;
}) {
  const info = useChatInfo({ server, chat, say, onLeft, onClose });
  const direct = chat.kind === 'direct';
  const count = (n: number) => (info.shared ? String(n) : '');
  const row = (icon: Parameters<typeof Icon>[0]['name'], label: string, value: string, run: (event: MouseEvent) => void, red = false) => (
    <button type="button" className={red ? 'mb-fr red' : 'mb-fr'} onClick={run}>
      <Icon name={icon} />
      <span className="fl">{label}</span>
      {!red && <span className="val">{value}</span>}
      {!red && <Icon name="chevron" />}
    </button>
  );
  return (
    <>
      <div className="chp-ih">
        <PhoneLead chat={chat} server={server} size="big" />
        <b>{titleOf(chat, server.me)}</b>
        <small>{direct ? t('count.people', { count: chat.members.length }) : chat.topic || chat.spaceName}</small>
      </div>
      <div className="chp-info">
        <div className="mb-group">
          {!direct && row('settings', t('chat.settings'), '', () => onPart('about'))}
          {chat.joined && row(chat.notify === 'off' ? 'bellOff' : 'bell', t('chat.notifications'), t(`chat.notify.${chat.notify}`), (event) => menu(event, info.notifyItems()))}
          {chat.kind !== 'public' && row('people', t('chat.people'), String(chat.members.length), () => onPart('people'))}
        </div>
        <div className="cap">
          <span>
            {t('chat.media')}
            {info.shared && ` · ${info.media.length}`}
          </span>
          {info.media.length > 0 && (
            <button type="button" className="all" onClick={() => onPart('media')}>
              {t('chat.seeAll')}
            </button>
          )}
        </div>
        {info.media.length > 0 ? (
          <div className="chp-media">
            {info.media.slice(0, 8).map((each, i) => (
              <MediaThumb key={`${each.message}${i}`} url={server.url} file={each.file} title={each.file.name} onOpen={() => onPart('media')} />
            ))}
          </div>
        ) : (
          <p className="chp-none small">{info.shared ? t('chat.noMedia') : t('chat.loading')}</p>
        )}
        <div className="mb-group">
          {row('file', t('chat.files'), count(info.files.length), () => onPart('files'))}
          {row('audio', t('chat.voiceTab'), count(info.voice.length), () => onPart('voice'))}
          {row('link', t('chat.links'), count(info.links.length), () => onPart('links'))}
        </div>
        <div className="mb-group">
          <button type="button" className="mb-fr" disabled={info.exporting} onClick={() => void info.exportIt()}>
            <Icon name="download" />
            <span className="fl">{info.exporting ? t('chat.exporting') : t('chat.export')}</span>
          </button>
          {direct && (
            <button type="button" className="mb-fr" onClick={() => void info.hide()}>
              <Icon name="eye" />
              <span className="fl">{t('chat.hide')}</span>
            </button>
          )}
          {info.canArchive && (
            <button type="button" className="mb-fr" onClick={info.askArchive}>
              <Icon name="restore" />
              <span className="fl">{chat.archived === null ? t('chat.archiveRoom') : t('chat.unarchiveRoom')}</span>
            </button>
          )}
          {info.canLeave && (
            <button type="button" className="mb-fr red" onClick={info.askLeave}>
              <Icon name="close" />
              <span className="fl">{t('chat.leaveRoom')}</span>
            </button>
          )}
        </div>
      </div>
      {info.asking}
    </>
  );
}

/** A part of a conversation's Info as a page: its people, its photos and videos, files, recordings, links, or About. */
export function PhoneChatPart({ url, chat: id, tab, say, onJump }: { url: string; chat: string; tab: InfoTab; say: (text: string) => void; onJump: (message: string) => void }) {
  const snapshot = useChat();
  const server = snapshot.servers.find((each) => each.url === url);
  const chat = chatOf(server, id);
  if (!server || !chat) return <p className="chp-none">{t('chat.linkGone')}</p>;
  return <PartPage server={server} chat={chat} tab={tab} say={say} onJump={onJump} />;
}

function PartPage({ server, chat, tab, say, onJump }: { server: ChatServer; chat: ChatInfo; tab: InfoTab; say: (text: string) => void; onJump: (message: string) => void }) {
  const info = useChatInfo({ server, chat, say, onLeft: () => undefined, onClose: () => undefined });
  return (
    <div className="chp-part">
      <InfoBody server={server} chat={chat} tab={tab} info={info} nameOf={namesOf(server)} say={say} onJump={onJump} phone />
    </div>
  );
}

/** What a part of Info is called, as its page's title. */
export const partName = (tab: InfoTab) =>
  ({ about: t('chat.settings'), people: t('chat.people'), media: t('chat.media'), files: t('chat.files'), voice: t('chat.voiceTab'), links: t('chat.links') })[tab];
