import type { ChatInfo } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { Fragment, type MouseEvent, type ReactNode, useEffect } from 'react';
import { type ChatLinks, Conversation } from './Chat';
import { Face, namesOf, others, titleOf } from './ChatFaces';
import { NotifyBanner } from './ChatParts';
import { InfoBody, type InfoTab, MediaThumb, useChatInfo } from './ChatRooms';
import { notWrittenTo, staysFolded, teammatesOf, useFolded } from './ChatStart';
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

/**
 * Chat's first page, as Slack's Home (design/chat.md 25): each space a section of its rooms by
 * name with + Add room at its foot, then Direct messages, the latest first, with the people not
 * written to yet and + Start a new message, or + Invite people with no one to write to. A row is
 * one line: its mark and name, bold while unread, its number, a draft's pen. A section folds.
 */
export function PhoneChatList({ onOpen, onSearch, onWrite, onInvite, onAddRoom, onNewMessage }: {
  onOpen: (url: string, chat: string) => void;
  onSearch: () => void;
  /** Someone to write to, with no direct message yet: it opens. */
  onWrite: (url: string, person: string) => void;
  /** Invite people, when no one shares a space with this person. */
  onInvite: () => void;
  /** + Add room at a space's foot: Create room and Browse rooms. */
  onAddRoom: (event: MouseEvent, url: string, space: string) => void;
  /** + Start a new message at Direct messages' foot. */
  onNewMessage: (url: string) => void;
}) {
  const snapshot = useChat();
  const folds = useFolded();
  const many = snapshot.servers.length > 1;
  if (!snapshot.servers.length) return <p className="chp-none">{t('chat.loading')}</p>;
  const row = (server: ChatServer, chat: ChatInfo) => {
    const off = chat.notify === 'off';
    const draft = draftOf(server.url, chat.id).trim() !== '';
    return (
      <button type="button" key={chat.id} className={`chp-r${chat.unread > 0 && !off ? ' un' : ''}${off ? ' off' : ''}`} onClick={() => onOpen(server.url, chat.id)}>
        <RowLead chat={chat} server={server} />
        <span className="nm">{titleOf(chat, server.me)}</span>
        {draft && <Icon name="pen" />}
        {chat.alerts > 0 ? <em>{chat.alerts}</em> : off ? <Icon name="bellOff" /> : null}
      </button>
    );
  };
  const add = (label: string, run: (event: MouseEvent) => void) => (
    <button type="button" className="chp-r add" onClick={run}>
      <span className="ic">
        <Icon name="plus" />
      </span>
      <span className="nm">{label}</span>
    </button>
  );
  const section = (url: string, space: string | null, title: string, body: ReactNode) => (
    <div key={`${url} ${space ?? 'direct'}`} className={folds.isFolded(url, space) ? 'chp-sec folded' : 'chp-sec'}>
      <button type="button" className="chp-sh" aria-expanded={!folds.isFolded(url, space)} onClick={() => folds.toggle(url, space)}>
        <b>{title}</b>
        <Icon name="chevron" />
      </button>
      {body}
    </div>
  );
  return (
    <div className="chp-list">
      <button type="button" className="mb-searchbar chp-find" onClick={onSearch}>
        <Icon name="search" />
        <span>{t('chat.searchMessages')}</span>
      </button>
      <NotifyBanner phone />
      {snapshot.servers.map((server) => {
        const shown = server.chats.filter((chat) => !chat.hidden && chat.archived === null);
        const spaces = new Map<string, { name: string; chats: ChatInfo[] }>();
        for (const chat of shown) {
          if (chat.kind === 'direct' || !chat.space) continue;
          const group = spaces.get(chat.space) ?? { name: chat.spaceName || chat.space, chats: [] };
          group.chats.push(chat);
          spaces.set(chat.space, group);
        }
        const direct = shown.filter((chat) => chat.kind === 'direct').sort((a, b) => (b.last?.at ?? b.createdAt) - (a.last?.at ?? a.createdAt));
        const folded = (space: string | null) => folds.isFolded(server.url, space);
        return (
          <Fragment key={server.url}>
            {[...spaces]
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([space, group]) =>
                section(
                  server.url,
                  space,
                  group.name,
                  <>
                    {group.chats
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .filter((chat) => !folded(space) || staysFolded(chat, false))
                      .map((chat) => row(server, chat))}
                    {!folded(space) && add(t('chat.addRoom'), (event) => onAddRoom(event, server.url, space))}
                  </>,
                ),
              )}
            {section(
              server.url,
              null,
              many ? t('chat.directMessagesOn', { server: hostOf(server.url) }) : t('chat.directMessages'),
              <>
                {direct.filter((chat) => !folded(null) || staysFolded(chat, false)).map((chat) => row(server, chat))}
                {!folded(null) &&
                  notWrittenTo(server)
                    .slice(0, 5)
                    .map((person) => (
                      <button type="button" key={person.id} className="chp-r" onClick={() => onWrite(server.url, person.id)}>
                        <span className="ic">
                          <Face id={person.id} name={person.name} size="md" online={server.active.includes(person.id)} />
                        </span>
                        <span className="nm">{person.name}</span>
                      </button>
                    ))}
                {!folded(null) && (teammatesOf(server).length > 0 ? add(t('chat.startNewMessage'), () => onNewMessage(server.url)) : add(t('chat.invitePeople'), onInvite))}
              </>,
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/** A row's mark, as Slack's: # or a lock for a room, the other's face, two faces for a group. */
function RowLead({ chat, server }: { chat: ChatInfo; server: ChatServer }) {
  const people = others(chat, server.me);
  if (chat.kind === 'private') return <span className="ic"><Icon name="lock" /></span>;
  if (chat.kind !== 'direct') return <span className="ic hs">#</span>;
  if (people.length === 1) return <span className="ic"><Face id={people[0]!.id} name={people[0]!.name} size="md" online={server.active.includes(people[0]!.id)} /></span>;
  return (
    <span className="ic">
      <span className="ch-faces">
        {people.slice(0, 2).map((person) => (
          <Face key={person.id} id={person.id} name={person.name} size="xs" />
        ))}
      </span>
    </span>
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
          {chat.joined && row(chat.notify === 'off' ? 'bellOff' : 'bell', t('chat.notifications'), t(`chat.notify.${chat.notify}`), (event) => menu(event, info.notifyItems()))}
          {row('people', t('chat.people'), String(chat.members.length), () => onPart('people'))}
          {!direct && row('info', t('chat.about'), '', () => onPart('about'))}
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
      <InfoBody server={server} chat={chat} tab={tab} info={info} nameOf={namesOf(server)} say={say} onJump={onJump} />
    </div>
  );
}

/** What a part of Info is called, as its page's title. */
export const partName = (tab: InfoTab) =>
  ({ about: t('chat.about'), people: t('chat.people'), media: t('chat.media'), files: t('chat.files'), voice: t('chat.voiceTab'), links: t('chat.links') })[tab];
