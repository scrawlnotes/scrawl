import { type ChatInfo, type ChatMessage, continues, mentionAt, personLink, plainText, ROOM_MENTION } from '@scrawlnotes/core';
import { createEditor, editorTakesEnter, type EditorView, messageHtml, type ScrawlEditor, toggleBold, toggleCode, toggleCodeBlock, toggleItalic, toggleLinePrefix, toggleList, toggleStrike } from '@scrawlnotes/editor';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type ChatServer, type ChatSnapshot, draftOf, keepDraft, keepOpen, lastOpen, type Pending, store } from './chatStore';
import { ConfirmDialog, type MenuItem } from './dialogs';
import { Icon, type IconName } from './Icon';
import { hostOf } from './servers';

// Chat (design/chat.md, 8.1; design/mockups.html, Messaging): one tab, the conversations of every
// server on its left, each server's rooms under their spaces and then the direct messages; the
// conversation on its right, the box to write in at its foot.

type Open = { url: string; chat: string };

interface Props {
  snapshot: ChatSnapshot;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  onStatus: (parts: string[] | null) => void;
}

/** The six reactions a message offers first; the rest are found in the full list. */
const QUICK = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

/** Someone's name in a conversation, from the people the server named; Someone when it named them nowhere. */
function namesOf(server: ChatServer): (id: string) => string {
  const names = new Map<string, string>();
  for (const chat of server.chats) for (const person of chat.members) names.set(person.id, person.name);
  return (id) => names.get(id) || t('card.someone');
}

/** What a conversation is called in the list and over it: a room's name, or the others in a direct message. */
function titleOf(chat: ChatInfo, me: string): string {
  if (chat.kind !== 'direct') return chat.name;
  const others = chat.members.filter((person) => person.id !== me);
  if (others.length === 1) return others[0]!.name;
  return others.map((person) => person.name.split(/\s+/)[0]).join(', ');
}

const others = (chat: ChatInfo, me: string) => chat.members.filter((person) => person.id !== me);

/** A face's colour, the same for someone wherever they show. */
function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 6;
}

function Face({ id, name, size = 'md', online = false }: { id: string; name: string; size?: 'sm' | 'xs' | 'md' | 'lg'; online?: boolean }) {
  return (
    <span className={`ch-face ${size} h${hueOf(id)}`} aria-hidden="true">
      {(name.trim()[0] ?? '?').toUpperCase()}
      {online && <i />}
    </span>
  );
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });

/** A day as the conversation divides it: Today, Yesterday, a weekday this week, else the date. */
function dayOf(at: number): string {
  const day = new Date(at);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(day.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return t('chat.today');
  if (days === 1) return t('chat.yesterday');
  if (days < 7) return day.toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' });
  return day.toLocaleDateString(locale(), { month: 'short', day: 'numeric', ...(day.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
}

/** What a quote of a message says: its words, or what kind of file it is. */
function quoteText(text: string, file: string | null): string {
  const words = plainText(text);
  if (words) return words;
  if (file?.startsWith('image/')) return t('chat.photo');
  if (file?.startsWith('audio/')) return t('chat.voice');
  return file ? t('chat.file') : '';
}

export function ChatView({ snapshot, menu, onStatus }: Props) {
  const [open, setOpen] = useState<Open | null>(lastOpen);
  // In a narrow window the list and the conversation take turns.
  const [listShown, setListShown] = useState(false);
  const server = open ? snapshot.servers.find((each) => each.url === open.url) : undefined;
  const chat = server?.chats.find((each) => each.id === open!.chat && !each.hidden);
  // The first conversation there is, when the one last open is not there any more.
  const first = snapshot.servers.flatMap((each) => each.chats.filter((c) => !c.hidden).map((c) => ({ url: each.url, chat: c.id }))).at(0);
  const shown: Open | null = chat ? open : (first ?? null);
  const shownServer = shown ? snapshot.servers.find((each) => each.url === shown.url) : undefined;
  const shownChat = shownServer?.chats.find((each) => each.id === shown!.chat);

  useEffect(() => {
    store.setViewing(shown);
    return () => store.setViewing(null);
  }, [shown?.url, shown?.chat]);

  useEffect(() => {
    if (!shownChat || !shownServer) return onStatus(null);
    onStatus(shownChat.kind === 'direct' ? [titleOf(shownChat, shownServer.me)] : [`#${shownChat.name}`, t('count.people', { count: shownChat.members.length })]);
  }, [shownChat?.id, shownChat?.name, shownChat?.members.length]);

  const pick = (next: Open) => {
    setOpen(next);
    keepOpen(next.url, next.chat);
    setListShown(false);
  };

  return (
    <div className={`chat${listShown ? ' list-shown' : ''}`}>
      <ChatList servers={snapshot.servers} open={shown} onOpen={pick} />
      {shownServer && shownChat ? (
        <Conversation key={`${shownServer.url} ${shownChat.id}`} server={shownServer} chat={shownChat} menu={menu} onList={() => setListShown(true)} />
      ) : (
        <div className="chat-conv chat-none">
          <Icon name="chat" />
          <p>{snapshot.servers.length ? t('chat.pick') : t('chat.loading')}</p>
        </div>
      )}
    </div>
  );
}

/** The conversations: each server's rooms under their spaces by name, then its direct messages, the latest first. */
function ChatList({ servers, open, onOpen }: { servers: ChatServer[]; open: Open | null; onOpen: (open: Open) => void }) {
  const many = servers.length > 1;
  const row = (server: ChatServer, chat: ChatInfo) => {
    const on = open?.url === server.url && open.chat === chat.id;
    const off = chat.notify === 'off';
    const unread = chat.unread > 0 && !off && !on;
    const draft = !on && draftOf(server.url, chat.id).trim() !== '';
    const people = others(chat, server.me);
    const lead =
      chat.kind === 'direct' ? (
        people.length === 1 ? (
          <Face id={people[0]!.id} name={people[0]!.name} size="sm" online={server.active.includes(people[0]!.id)} />
        ) : (
          <span className="ch-faces">
            {people.slice(0, 2).map((person) => (
              <Face key={person.id} id={person.id} name={person.name} size="xs" />
            ))}
          </span>
        )
      ) : chat.kind === 'private' ? (
        <Icon name="lock" />
      ) : (
        <span className="hs">#</span>
      );
    return (
      <button type="button" key={chat.id} className={`chat-row${on ? ' on' : ''}${unread ? ' un' : ''}${off ? ' off' : ''}`} onClick={() => onOpen({ url: server.url, chat: chat.id })}>
        {lead}
        <span className="nm">{titleOf(chat, server.me)}</span>
        {chat.alerts > 0 && !on ? <span className="n">{chat.alerts}</span> : off ? <Icon name="bellOff" /> : draft ? <span className="dr">{t('chat.draft')}</span> : null}
      </button>
    );
  };
  return (
    <nav className="chat-list" aria-label={t('chat.title')}>
      {servers.map((server) => {
        const shown = server.chats.filter((chat) => !chat.hidden);
        const spaces = new Map<string, ChatInfo[]>();
        for (const chat of shown) if (chat.kind !== 'direct') spaces.set(chat.spaceName || chat.space!, [...(spaces.get(chat.spaceName || chat.space!) ?? []), chat]);
        const direct = shown.filter((chat) => chat.kind === 'direct').sort((a, b) => (b.last?.at ?? b.createdAt) - (a.last?.at ?? a.createdAt));
        return (
          <div key={server.url} className="chat-server">
            {[...spaces].sort(([a], [b]) => a.localeCompare(b)).map(([space, chats]) => (
              <div key={space} className="chat-group">
                <div className="chat-grp">{space}</div>
                {chats.sort((a, b) => a.name.localeCompare(b.name)).map((chat) => row(server, chat))}
              </div>
            ))}
            {direct.length > 0 && (
              <div className="chat-group">
                <div className="chat-grp">{many ? t('chat.directOn', { server: hostOf(server.url) }) : t('chat.direct')}</div>
                {direct.map((chat) => row(server, chat))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** One conversation: its head, its messages with the days between them and the line before what is new, and the box to write in. */
function Conversation({ server, chat, menu, onList }: { server: ChatServer; chat: ChatInfo; menu: Props['menu']; onList: () => void }) {
  const one = store.server(server.url);
  const nameOf = useMemo(() => namesOf(server), [server.chats]);
  const messages = server.messages[chat.id] ?? [];
  const pending = server.pending.filter((each) => each.chat === chat.id);
  const scroller = useRef<HTMLDivElement>(null);
  // Where what is new starts, as it was when the conversation opened: the line stays while it is open.
  const [newFrom] = useState(() => (chat.readSeq < chat.lastSeq ? chat.readSeq + 1 : null));
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [reacting, setReacting] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const atEnd = useRef(true);
  const placed = useRef(false);
  const lastSeq = messages.at(-1)?.seq ?? 0;

  useEffect(() => {
    void one?.open(chat.id);
  }, [chat.id]);

  // On opening: at the line before what is new, else at the end. After that, at the end while it was there.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || !messages.length) return;
    if (!placed.current) {
      placed.current = true;
      const line = box.querySelector<HTMLElement>('.ch-new');
      if (line) box.scrollTop = Math.max(0, line.offsetTop - 80);
      else box.scrollTop = box.scrollHeight;
      return;
    }
    if (atEnd.current) box.scrollTop = box.scrollHeight;
  }, [messages.length, pending.length, lastSeq]);

  // What is on screen at the end, with the window in front, is read.
  const readNow = () => {
    const box = scroller.current;
    if (!box || !lastSeq || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 40) one?.read(chat.id, lastSeq);
  };
  useEffect(() => {
    readNow();
    window.addEventListener('focus', readNow);
    document.addEventListener('visibilitychange', readNow);
    return () => {
      window.removeEventListener('focus', readNow);
      document.removeEventListener('visibilitychange', readNow);
    };
  }, [lastSeq]);

  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    readNow();
    if (box.scrollTop < 120 && server.older[chat.id] !== false && messages[0] && messages[0].seq > 1) {
      const before = box.scrollHeight;
      void one?.older(chat.id).then(() => {
        // The older page goes above what is read now, which stays where it was.
        requestAnimationFrame(() => (box.scrollTop += box.scrollHeight - before));
      });
    }
  };

  /** Brings a quoted message into sight and marks it a moment; one not here yet is asked for with those around it. */
  const jump = async (id: string) => {
    let row = scroller.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!row && one) {
      try {
        one.put((await one.client.messages(chat.id, { around: id, limit: 40 })).messages);
      } catch {
        return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      row = scroller.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    }
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
    window.setTimeout(() => setFlash(null), 1600);
  };

  const mine = (message: ChatMessage) => message.author === server.me && !message.agent;
  const messageMenu = (event: MouseEvent, message: ChatMessage) => {
    const items: MenuItem[] = [];
    if (mine(message) && !message.forwarded) items.push({ label: t('chat.edit'), icon: 'pen', run: () => setEditing(message.id) });
    items.push({ label: t('chat.copyText'), icon: 'copy', run: () => void navigator.clipboard.writeText(message.body) });
    // Whoever wrote it deletes it; in a room, the space's managers too, which the server says.
    items.push({ label: t('chat.delete'), icon: 'trash', danger: true, apart: true, run: () => setDeleting(message) });
    menu(event, items);
  };

  // Seen, in a direct message of two: under the last of this person's messages the other has read.
  const otherRead = chat.kind === 'direct' && chat.members.length === 2 && chat.reads ? Math.max(0, ...Object.values(chat.reads)) : 0;
  const seenAt = otherRead ? [...messages].reverse().find((message) => mine(message) && message.seq <= otherRead && !message.deleted)?.id : undefined;

  const typing = Object.entries(server.typing[chat.id] ?? {})
    .filter(([account, until]) => account !== server.me && until > Date.now())
    .map(([account]) => nameOf(account).split(/\s+/)[0]!);
  const people = others(chat, server.me);
  const otherActive = chat.kind === 'direct' && people.length === 1 && server.active.includes(people[0]!.id);
  const goneAll = chat.kind === 'direct' && people.length > 0 && people.every((person) => chat.gone.includes(person.id));

  const lead =
    chat.kind === 'direct' ? (
      people.length === 1 ? (
        <Face id={people[0]!.id} name={people[0]!.name} size="md" online={otherActive} />
      ) : (
        <span className="ch-faces">
          {people.slice(0, 3).map((person) => (
            <Face key={person.id} id={person.id} name={person.name} size="sm" />
          ))}
        </span>
      )
    ) : chat.kind === 'private' ? (
      <Icon name="lock" />
    ) : (
      <span className="hs">#</span>
    );

  return (
    <section className="chat-conv" onPointerDown={readNow} onKeyDown={readNow}>
      <header className="ch-head">
        <button type="button" className="ch-back" aria-label={t('chat.title')} onClick={onList}>
          <Icon name="back" />
        </button>
        {lead}
        <b>{titleOf(chat, server.me)}</b>
        {chat.kind === 'direct' ? otherActive && <span className="tp act">{t('chat.active')}</span> : chat.topic && <span className="tp">{chat.topic}</span>}
        {chat.kind !== 'direct' && (
          <span className="acts">
            <span className="ppl" title={chat.members.map((person) => person.name).join(', ')}>
              <Icon name="people" />
              {chat.members.length}
            </span>
          </span>
        )}
      </header>
      <div className="ch-msgs" ref={scroller} onScroll={onScroll}>
        {server.older[chat.id] === false || (messages[0]?.seq ?? 1) <= 1 ? (
          <p className="ch-start">{chat.kind === 'direct' ? t('chat.startDirect', { name: titleOf(chat, server.me) }) : t('chat.startRoom', { name: chat.name })}</p>
        ) : null}
        {messages.map((message, i) => {
          const before = messages[i - 1];
          const day = !before || new Date(before.at).toDateString() !== new Date(message.at).toDateString();
          const isNew = newFrom !== null && message.seq === newFrom && message.author !== server.me;
          return (
            <div key={message.id} className="ch-item">
              {day && <div className="ch-day">{dayOf(message.at)}</div>}
              {isNew && (
                <div className="ch-new">
                  <span>{t('chat.new')}</span>
                </div>
              )}
              <MessageRow
                message={message}
                cont={!day && !isNew && continues(before, message)}
                quoted={message.replyTo ? messages.find((each) => each.id === message.replyTo!.id) : undefined}
                nameOf={nameOf}
                me={server.me}
                editing={editing === message.id}
                reacting={reacting === message.id}
                flash={flash === message.id}
                onEdit={async (body) => {
                  setEditing(null);
                  if (body.trim() && body !== message.body) await one?.edit(message.id, body).catch(() => undefined);
                }}
                onCancelEdit={() => setEditing(null)}
                onReply={() => setReplyTo(message)}
                onReact={(emoji) => {
                  setReacting(null);
                  const had = message.reactions.some((each) => each.emoji === emoji && each.people.includes(server.me));
                  void one?.react(message.id, emoji, !had).catch(() => undefined);
                }}
                onReacting={(on) => setReacting(on ? message.id : null)}
                onMenu={(event) => messageMenu(event, message)}
                onJump={(id) => void jump(id)}
              />
              {message.id === seenAt && <div className="ch-seen">{t('chat.seen')}</div>}
            </div>
          );
        })}
        {pending.map((each) => (
          <PendingRow key={each.id} url={server.url} pending={each} me={server.me} nameOf={nameOf} after={messages.at(-1)} replied={each.replyTo ? messages.find((message) => message.id === each.replyTo) : undefined} />
        ))}
      </div>
      <div className="ch-typing">{typing.length === 0 ? '' : typing.length === 1 ? t('chat.typingOne', { name: typing[0]! }) : typing.length === 2 ? t('chat.typingTwo', { a: typing[0]!, b: typing[1]! }) : t('chat.typingMany')}</div>
      {chat.archived !== null ? (
        <p className="ch-closed">{t('chat.archivedNote')}</p>
      ) : goneAll ? (
        <p className="ch-closed">{t('chat.goneNote', { name: titleOf(chat, server.me) })}</p>
      ) : (
        <Composer key={`${server.url} ${chat.id}`} server={server} chat={chat} replyTo={replyTo} nameOf={nameOf} onCancelReply={() => setReplyTo(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('chat.deleteTitle')}
          message={t('chat.deleteText')}
          action={t('chat.delete')}
          danger
          onConfirm={() => {
            const message = deleting;
            setDeleting(null);
            void one?.remove(message.id).catch(() => undefined);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

/** A message on its row: a face, a name and a time over the first of a run, its quote, its words, its reactions; its buttons when the pointer is on it. */
function MessageRow(props: {
  message: ChatMessage;
  cont: boolean;
  /** The message it answers, when it is here: its quote shows it as it now is, changed or deleted. */
  quoted: ChatMessage | undefined;
  nameOf: (id: string) => string;
  me: string;
  editing: boolean;
  reacting: boolean;
  flash: boolean;
  onEdit: (body: string) => void;
  onCancelEdit: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onReacting: (on: boolean) => void;
  onMenu: (event: MouseEvent) => void;
  onJump: (id: string) => void;
}) {
  const { message, cont, nameOf, me } = props;
  const quote = message.replyTo && props.quoted ? { ...message.replyTo, text: props.quoted.body, file: props.quoted.files[0]?.type ?? null, deleted: props.quoted.deleted !== null } : message.replyTo;
  const name = nameOf(message.author);
  const html = useMemo(() => {
    const body = messageHtml(message.body);
    if (!message.edited) return body;
    const mark = `<span class="ch-ed">${t('chat.edited')}</span>`;
    return /<\/p>\s*$/.test(body) ? body.replace(/<\/p>\s*$/, ` ${mark}</p>`) : `${body}${mark}`;
  }, [message.body, message.edited]);
  const forwarded = message.forwarded;
  return (
    <div className={`ch-m${cont ? ' cont' : ''}${props.reacting ? ' hold' : ''}${props.flash ? ' flash' : ''}`} data-id={message.id} onContextMenu={message.deleted ? undefined : (event) => (event.preventDefault(), props.onMenu(event))}>
      {cont ? <span className="tm">{timeOf(message.at)}</span> : <Face id={message.author} name={name} />}
      <div className="bx">
        {!cont && (
          <div className="hd">
            <b>{name}</b>
            <span className="t">{timeOf(message.at)}</span>
          </div>
        )}
        {forwarded && (
          <div className="ch-fw">
            <Icon name="reply" />
            {t('chat.forwardedFrom', { where: forwarded.kind === 'direct' ? t('chat.aDirect') : `#${forwarded.name}`, name: forwarded.authorName })}
          </div>
        )}
        {quote && (
          <button type="button" className="ch-q" onClick={() => props.onJump(quote.id)}>
            <b>{quote.deleted ? '' : nameOf(quote.author)}</b>
            <span>{quote.deleted ? t('chat.quoteDeleted') : quoteText(quote.text, quote.file)}</span>
          </button>
        )}
        {message.deleted ? (
          <div className="ch-del">{t('chat.deleted')}</div>
        ) : props.editing ? (
          <MessageEditor body={message.body} onSave={props.onEdit} onCancel={props.onCancelEdit} />
        ) : (
          <div className="bd" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {message.reactions.length > 0 && (
          <div className="ch-rx">
            {message.reactions.map((reaction) => (
              <button
                type="button"
                key={reaction.emoji}
                className={reaction.people.includes(me) ? 'me' : ''}
                title={reaction.people.map(nameOf).join(', ')}
                onClick={() => props.onReact(reaction.emoji)}
              >
                {reaction.emoji}
                <b>{reaction.people.length}</b>
              </button>
            ))}
          </div>
        )}
      </div>
      {!message.deleted && !props.editing && (
        <div className="ch-acts">
          <button type="button" className={props.reacting ? 'on' : ''} title={t('chat.react')} aria-label={t('chat.react')} onClick={() => props.onReacting(!props.reacting)}>
            <Icon name="smile" />
          </button>
          <button type="button" title={t('chat.reply')} aria-label={t('chat.reply')} onClick={props.onReply}>
            <Icon name="reply" />
          </button>
          <button type="button" title={t('chat.more')} aria-label={t('chat.more')} onClick={(event) => props.onMenu(event)}>
            <Icon name="more" />
          </button>
          {props.reacting && <ReactionPicker onPick={props.onReact} onClose={() => props.onReacting(false)} />}
        </div>
      )}
    </div>
  );
}

/** A message written here that has not gone yet: soft while it goes; one not taken says so, with Retry and Delete. */
function PendingRow({ url, pending, me, nameOf, after, replied }: { url: string; pending: Pending; me: string; nameOf: (id: string) => string; after: ChatMessage | undefined; replied: ChatMessage | undefined }) {
  const one = store.server(url);
  const cont = !!after && after.author === me && !after.agent && pending.at - after.at < 5 * 60_000;
  const html = useMemo(() => messageHtml(pending.body), [pending.body]);
  return (
    <div className={`ch-m pending${cont ? ' cont' : ''}${pending.failed ? ' failed' : ''}`}>
      {cont ? <span className="tm">{timeOf(pending.at)}</span> : <Face id={me} name={nameOf(me)} />}
      <div className="bx">
        {!cont && (
          <div className="hd">
            <b>{nameOf(me)}</b>
            <span className="t">{timeOf(pending.at)}</span>
          </div>
        )}
        {replied && (
          <div className="ch-q">
            <b>{nameOf(replied.author)}</b>
            <span>{quoteText(replied.body, replied.files[0]?.type ?? null)}</span>
          </div>
        )}
        <div className="bd" dangerouslySetInnerHTML={{ __html: html }} />
        {pending.failed ? (
          <div className="ch-fail">
            <Icon name="warn" />
            {t('chat.notSent')}
            <button type="button" onClick={() => one?.retry(pending.id)}>
              {t('chat.retry')}
            </button>
            <button type="button" onClick={() => one?.discard(pending.id)}>
              {t('chat.discard')}
            </button>
          </div>
        ) : (
          <div className="ch-going">
            <Icon name="clock" />
            {t('chat.sending')}
          </div>
        )}
      </div>
    </div>
  );
}

/** An emoji as the full list has it: its group 2 holds the skin tones, which are not reactions. */
type Emoji = { unicode: string; label: string; tags?: string[]; group?: number; order?: number };

/** The six quick reactions, then every emoji there is, found by its name. */
function ReactionPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [all, setAll] = useState<Emoji[] | null>(null);
  const [wide, setWide] = useState(false);
  const [find, setFind] = useState('');
  // Over the message instead of under it, when under it would go past the foot of the conversation.
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const area = box.current?.closest('.ch-msgs');
    if (!box.current || !area || up) return;
    if (box.current.getBoundingClientRect().bottom > area.getBoundingClientRect().bottom) setUp(true);
  }, [wide, all]);
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, []);
  useEffect(() => {
    if (!wide || all) return;
    // The list is loaded the first time it is asked for.
    void import('emojibase-data/en/compact.json').then((data) => setAll((data.default as Emoji[]).filter((each) => each.group !== undefined && each.group !== 2).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
  }, [wide]);
  const words = find.trim().toLowerCase();
  const found = all?.filter((each) => !words || each.label.toLowerCase().includes(words) || each.tags?.some((tag) => tag.startsWith(words)));
  return (
    <div className={`ch-pick${wide ? ' wide' : ''}${up ? ' up' : ''}`} ref={box} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <div className="quick">
        {QUICK.map((emoji) => (
          <button type="button" key={emoji} onClick={() => onPick(emoji)}>
            {emoji}
          </button>
        ))}
        {!wide && (
          <button type="button" className="more" title={t('chat.allEmoji')} aria-label={t('chat.allEmoji')} onClick={() => setWide(true)}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      {wide && (
        <>
          <input autoFocus className="find" placeholder={t('chat.findEmoji')} value={find} onChange={(event) => setFind(event.target.value)} />
          <div className="grid">
            {found?.slice(0, 400).map((each) => (
              <button type="button" key={each.unicode} title={each.label} onClick={() => onPick(each.unicode)}>
                {each.unicode}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A message's words changed where they are: Enter or a click away keeps them, Esc or Cancel leaves them. */
function MessageEditor({ body, onSave, onCancel }: { body: string; onSave: (body: string) => void; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onSave(editor.current?.view.state.doc.toString() ?? body);
    else onCancel();
  };
  useEffect(() => {
    const made = createEditor({ parent: box.current!, doc: body });
    editor.current = made;
    made.view.focus();
    made.view.dispatch({ selection: { anchor: made.view.state.doc.length } });
    const away = (event: globalThis.MouseEvent) => {
      if (!box.current?.parentElement?.contains(event.target as Node)) finish(true);
    };
    window.addEventListener('mousedown', away);
    return () => {
      window.removeEventListener('mousedown', away);
      made.destroy();
    };
  }, []);
  const onKeyDownCapture = (event: KeyboardEvent) => {
    const view = editor.current?.view;
    if (!view) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    } else if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing && !editorTakesEnter(view) && !inFence(view.state.doc.toString(), view.state.selection.main.head)) {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    }
  };
  return (
    <div className="ch-editing" onKeyDownCapture={onKeyDownCapture}>
      <div className="ch-edit-box" ref={box} />
      <button type="button" className="ch-cancel" onMouseDown={(event) => event.preventDefault()} onClick={() => finish(false)}>
        {t('dialog.cancel')}
      </button>
    </div>
  );
}

/** Whether a place in the text is inside a code block, where Enter is a new line. */
function inFence(text: string, at: number): boolean {
  return (text.slice(0, at).match(/^\s*```/gm)?.length ?? 0) % 2 === 1;
}

/** What the formatting row does, after the note's format bar: marks, then blocks. */
const FORMATS: { title: MessageKey; mark?: string; icon?: IconName; className?: string; run: (view: EditorView) => void }[] = [
  { title: 'format.bold', mark: 'B', className: 'fmt-bold', run: (view) => toggleBold(view) },
  { title: 'format.italic', mark: 'I', className: 'fmt-italic', run: (view) => toggleItalic(view) },
  { title: 'format.strike', mark: 'S', className: 'fmt-strike', run: (view) => toggleStrike(view) },
  { title: 'format.code', mark: '</>', run: (view) => toggleCode(view) },
  { title: 'format.listTitle', icon: 'list', run: (view) => toggleList('bullet')(view) },
  { title: 'format.quote', icon: 'quote', run: (view) => toggleLinePrefix('quote')(view) },
  { title: 'format.codeBlock', icon: 'codeBlock', run: (view) => toggleCodeBlock(view) },
];

interface Choice {
  key: string;
  label: ReactNode;
  sub?: string;
  insert: string;
}

/** The box to write in: Markdown in the editor notes have; Enter sends; @ offers the people of the conversation. */
function Composer({ server, chat, replyTo, nameOf, onCancelReply }: { server: ChatServer; chat: ChatInfo; replyTo: ChatMessage | null; nameOf: (id: string) => string; onCancelReply: () => void }) {
  const one = store.server(server.url);
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const [text, setText] = useState(() => draftOf(server.url, chat.id));
  const [mention, setMention] = useState<{ from: number; to: number; query: string; at: number } | null>(null);
  // The formatting row, which Aa opens over the box; and the emoji, over it too.
  const [formatting, setFormatting] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const placeholder = chat.kind === 'direct' ? t('chat.messageTo', { name: titleOf(chat, server.me) }) : t('chat.messageTo', { name: `#${chat.name}` });

  const look = () => {
    const view = editor.current?.view;
    if (!view) return setMention(null);
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const found = mentionAt(line.text, head - line.from);
    setMention((was) => (found ? { from: line.from + found.from, to: head, query: found.query, at: was && was.from === line.from + found.from ? was.at : 0 } : null));
  };

  useEffect(() => {
    const made = createEditor({
      parent: box.current!,
      doc: text,
      onChange: (doc) => {
        setText(doc);
        keepDraft(server.url, chat.id, doc);
        if (doc.trim()) one?.typing(chat.id);
        window.setTimeout(look);
      },
      placeholder: () => {
        const shown = document.createElement('span');
        shown.textContent = placeholder;
        return shown;
      },
    });
    editor.current = made;
    made.view.focus();
    made.view.dispatch({ selection: { anchor: made.view.state.doc.length } });
    return () => {
      made.destroy();
      editor.current = null;
    };
  }, []);

  useEffect(() => {
    if (replyTo) editor.current?.view.focus();
  }, [replyTo?.id]);

  const query = mention?.query.toLowerCase() ?? '';
  const choices: Choice[] = mention
    ? [
        ...others(chat, server.me)
          .filter((person) => !chat.gone.includes(person.id) && person.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(query)))
          .map((person) => ({ key: person.id, label: person.name, insert: personLink(person.name, person.id) })),
        ...(chat.kind !== 'direct' && 'room'.startsWith(query) ? [{ key: '@room', label: '@room', sub: t('chat.notifyRoom', { name: `#${chat.name}` }), insert: ROOM_MENTION }] : []),
      ]
    : [];
  const picked = mention ? Math.min(mention.at, Math.max(0, choices.length - 1)) : 0;

  const choose = (choice: Choice) => {
    const view = editor.current?.view;
    if (!view || !mention) return;
    const insert = `${choice.insert} `;
    view.dispatch({ changes: { from: mention.from, to: mention.to, insert }, selection: { anchor: mention.from + insert.length } });
    setMention(null);
    view.focus();
  };

  const send = () => {
    const view = editor.current?.view;
    const body = view?.state.doc.toString() ?? '';
    if (!view || !body.trim() || !one) return;
    one.send(chat.id, body, replyTo?.id ?? null);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    keepDraft(server.url, chat.id, '');
    setText('');
    onCancelReply();
  };

  const onKeyDownCapture = (event: KeyboardEvent) => {
    const view = editor.current?.view;
    if (!view) return;
    if (mention && choices.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setMention({ ...mention, at: (picked + step + choices.length) % choices.length });
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        choose(choices[picked]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === 'Escape' && replyTo) {
      event.preventDefault();
      onCancelReply();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.nativeEvent.isComposing || editorTakesEnter(view)) return;
    if (inFence(view.state.doc.toString(), view.state.selection.main.head)) return;
    event.preventDefault();
    event.stopPropagation();
    send();
  };

  return (
    <div className={`ch-cmp${text.trim() ? ' on' : ''}`} onKeyDownCapture={onKeyDownCapture} onKeyUp={look} onMouseUp={look}>
      {replyTo && (
        <div className="rp">
          <Icon name="reply" />
          <span>{t('chat.replying', { name: nameOf(replyTo.author) })}</span>
          <span className="sn">{quoteText(replyTo.body, replyTo.files[0]?.type ?? null)}</span>
          <button type="button" className="x" aria-label={t('dialog.cancel')} onClick={onCancelReply}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {mention && choices.length > 0 && (
        <div className="ch-pop" role="listbox">
          <div className="cap">{chat.kind === 'direct' ? t('chat.inDirect') : t('chat.inRoom', { name: `#${chat.name}` })}</div>
          {choices.map((choice, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === picked}
              key={choice.key}
              className={i === picked ? 'r hot' : 'r'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(choice)}
            >
              {choice.key === '@room' ? (
                <span className="atr">
                  <Icon name="people" />
                </span>
              ) : (
                <Face id={choice.key} name={String(choice.label)} size="sm" online={server.active.includes(choice.key)} />
              )}
              <span>{choice.label}</span>
              {choice.sub && <small>{choice.sub}</small>}
            </button>
          ))}
        </div>
      )}
      {formatting && (
        <div className="fmt" onMouseDown={(event) => event.preventDefault()}>
          {FORMATS.map((format) => (
            <button
              type="button"
              key={format.title}
              className={format.className ?? ''}
              title={t(format.title)}
              aria-label={t(format.title)}
              onClick={() => {
                const view = editor.current?.view;
                if (view) format.run(view);
                view?.focus();
              }}
            >
              {format.icon ? <Icon name={format.icon} /> : format.mark}
            </button>
          ))}
        </div>
      )}
      <div className="in" ref={box} />
      <div className="bar">
        <button type="button" className={`ib${formatting ? ' on' : ''}`} title={t('chat.format')} aria-label={t('chat.format')} aria-pressed={formatting} onMouseDown={(event) => event.preventDefault()} onClick={() => setFormatting(!formatting)}>
          <span className="aa">Aa</span>
        </button>
        <button type="button" className="ib" title={t('chat.mention')} aria-label={t('chat.mention')} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const view = editor.current?.view;
          if (!view) return;
          const head = view.state.selection.main.head;
          const before = view.state.doc.sliceString(Math.max(0, head - 1), head);
          view.dispatch({ changes: { from: head, insert: before && !/\s/.test(before) ? ' @' : '@' }, selection: { anchor: head + (before && !/\s/.test(before) ? 2 : 1) } });
          view.focus();
          window.setTimeout(look);
        }}>
          <Icon name="at" />
        </button>
        <button type="button" className={`ib${emoji ? ' on' : ''}`} title={t('chat.emoji')} aria-label={t('chat.emoji')} onMouseDown={(event) => event.preventDefault()} onClick={() => setEmoji(!emoji)}>
          <Icon name="smile" />
        </button>
        {emoji && (
          <ReactionPicker
            onPick={(chosen) => {
              const view = editor.current?.view;
              setEmoji(false);
              if (!view) return;
              const at = view.state.selection.main;
              view.dispatch({ changes: { from: at.from, to: at.to, insert: chosen }, selection: { anchor: at.from + chosen.length } });
              view.focus();
            }}
            onClose={() => setEmoji(false)}
          />
        )}
        <span className="gap" />
        <button type="button" className={`send${text.trim() ? ' go' : ''}`} title={t('chat.send')} aria-label={t('chat.send')} disabled={!text.trim()} onMouseDown={(event) => event.preventDefault()} onClick={send}>
          <Icon name="send" />
        </button>
      </div>
    </div>
  );
}
