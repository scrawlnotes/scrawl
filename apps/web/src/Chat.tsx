import { type ChatFile, type ChatInfo, type ChatMessage, chatLink, continues, mentionAt, parseChatLink, personLink, plainText, ROOM_MENTION } from '@scrawlnotes/core';
import {
  createEditor,
  editorTakesEnter,
  type EditorView,
  highlightCodeBlocks,
  MARKDOWN_TYPE,
  messageHtml,
  type ScrawlEditor,
  toggleBold,
  toggleCode,
  toggleCodeBlock,
  toggleItalic,
  toggleLinePrefix,
  toggleList,
  toggleStrike,
} from '@scrawlnotes/editor';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clock, measure, Recording } from './chatMedia';
import { Attachments, ForwardDialog, type Going, isImage, NotifyBanner, NotifyBell, RecorderBar, Tray } from './ChatParts';
import { type ChatServer, type ChatSnapshot, draftOf, keepDraft, keepOpen, lastOpen, type Pending, store } from './chatStore';
import { ConfirmDialog, type MenuItem } from './dialogs';
import { Icon, type IconName } from './Icon';
import { Face, leadOf, namesOf, others, shortDay, timeOf, titleOf } from './ChatFaces';
import { BrowseRoomsDialog, ChatInfoDialog, type InfoTab, NewMessageDialog, NewRoomDialog } from './ChatRooms';
import { hostOf } from './servers';
import { ITEM_DRAG_TYPE } from './Sidebar';
import { clipboardFilesOnDesktop, isDesktop } from './storage';

// Chat (design/chat.md, 8.1; design/mockups.html, Messaging): one tab, the conversations of every
// server on its left, each server's rooms under their spaces and then the direct messages; the
// conversation on its right, the box to write in at its foot.

type Open = { url: string; chat: string };

/**
 * What a chip's thing is to this person: there to open; in a space of theirs that is not on this
 * device; in a space they are not in; or not found.
 */
export type ChipState = 'here' | 'notHere' | 'noAccess' | 'gone';

/** What Chat asks of the app around it: what a message points at, and what is made from one (design/chat.md, 3.7). */
export interface ChatLinks {
  /** Opens what a chip points at: a note, a list, a task, a board, a card, a collection or a record. */
  open: (href: string) => void;
  stateOf: (href: string) => ChipState;
  /** Asks for a note, a task or a card of the server's spaces; its chip, or null when none was picked. */
  pick: (url: string) => Promise<string | null>;
  /** The chip of what is dragged from the sidebar, by its path; null when it is not in a space of that server. */
  chipOf: (url: string, path: string) => string | null;
  /** New task and New card from a message: its first words, the description that links back to it, and where it is from. */
  toTask: (title: string, description: string, from: string) => void;
  toCard: (title: string, description: string, from: string) => void;
  say: (text: string) => void;
}

interface Props {
  snapshot: ChatSnapshot;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  onStatus: (parts: string[] | null) => void;
  links: ChatLinks;
  /** A message's link followed elsewhere, as in a task's description: Chat opens at it. */
  goTo: { href: string; at: number } | null;
}

/** How many files a message takes. */
const MAX_FILES = 10;

/** When the last message's link followed from elsewhere was. */
let followedAt = 0;

/** The largest file a server takes, in words: 1 GB, 250 MB. */
const limitText = (mb: number) => (mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`);

/**
 * Puts words on the clipboard as a copy does, right in the click; with `markdown`, as Markdown too
 * for a note or a message to paste in, as a link copied with its words (design/chat.md, 3.7).
 */
function copy(text: string, markdown?: string): Promise<void> {
  const put = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/plain', text);
    if (markdown) event.clipboardData?.setData(MARKDOWN_TYPE, markdown);
    event.preventDefault();
  };
  document.addEventListener('copy', put);
  const done = document.execCommand('copy');
  document.removeEventListener('copy', put);
  return done ? Promise.resolve() : navigator.clipboard.writeText(text);
}

/** The six reactions a message offers first; the rest are found in the full list. */
const QUICK = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

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

export function ChatView({ snapshot, menu, onStatus, links, goTo }: Props) {
  const [open, setOpen] = useState<Open | null>(lastOpen);
  // In a narrow window the list and the conversation take turns.
  const [listShown, setListShown] = useState(false);
  // The message a link opened Chat at, brought into sight once its conversation is on screen.
  const [target, setTarget] = useState<{ message: string; at: number } | null>(null);
  // New room, Browse rooms and New message, for a server, from the list's headings.
  const [making, setMaking] = useState<{ kind: 'newRoom' | 'browse'; url: string; space: string | null } | { kind: 'newMessage'; url: string } | null>(null);
  /** A conversation of a server: one this person is in, or a room read from Browse rooms. */
  const found = (server: ChatServer | undefined, id: string) => server?.chats.find((each) => each.id === id && !each.hidden) ?? (server?.visiting?.id === id ? server.visiting : undefined);
  const server = open ? snapshot.servers.find((each) => each.url === open.url) : undefined;
  const chat = open ? found(server, open.chat) : undefined;
  // The first conversation there is, when the one last open is not there any more.
  const first = snapshot.servers.flatMap((each) => each.chats.filter((c) => !c.hidden && c.archived === null).map((c) => ({ url: each.url, chat: c.id }))).at(0);
  const shown: Open | null = chat ? open : (first ?? null);
  const shownServer = shown ? snapshot.servers.find((each) => each.url === shown.url) : undefined;
  const shownChat = shown ? found(shownServer, shown.chat) : undefined;

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
    // A room read without being in it is left when another conversation opens.
    for (const each of snapshot.servers) if (each.visiting && !(each.url === next.url && each.visiting.id === next.chat)) store.server(each.url)?.visit(null);
  };
  /** A conversation from a window: one this person is in opens; a room they are not in is read. */
  const openFrom = (url: string, chat: ChatInfo) => {
    setMaking(null);
    const server = snapshot.servers.find((each) => each.url === url);
    if (!server?.chats.some((each) => each.id === chat.id && !each.hidden)) store.server(url)?.visit(chat);
    pick({ url, chat: chat.id });
  };
  /** The + of a heading in the list: a space's New room… and Browse rooms…; Direct's opens New message. */
  const addMenu = (event: MouseEvent, url: string, space: string | null) => {
    if (space === null) return setMaking({ kind: 'newMessage', url });
    menu(event, [
      { label: t('chat.newRoomDots'), icon: 'plus', run: () => setMaking({ kind: 'newRoom', url, space }) },
      { label: t('chat.browseRoomsDots'), icon: 'search', run: () => setMaking({ kind: 'browse', url, space }) },
    ]);
  };
  const makingServer = making ? snapshot.servers.find((each) => each.url === making.url) : undefined;

  /** A message's link: its conversation opens at it; one not there for this person says so. */
  const follow = (href: string) => {
    const link = parseChatLink(href);
    if (!link) return;
    const server = snapshot.servers.find((each) => each.url === link.server);
    const there = server?.chats.find((each) => each.id === link.chat);
    if (!there) return links.say(t('chat.linkGone'));
    pick({ url: link.server, chat: link.chat });
    setTarget({ message: link.message, at: Date.now() });
  };
  useEffect(() => {
    // Once each: Chat opened again later does not go back to it.
    if (!goTo || goTo.at <= followedAt || !snapshot.servers.length) return;
    followedAt = goTo.at;
    follow(goTo.href);
  }, [goTo?.at, snapshot.servers.length > 0]);

  return (
    <div className={`chat${listShown ? ' list-shown' : ''}`}>
      <ChatList servers={snapshot.servers} open={shown} onOpen={pick} onAdd={addMenu} />
      {shownServer && shownChat ? (
        <Conversation
          key={`${shownServer.url} ${shownChat.id}`}
          server={shownServer}
          chat={shownChat}
          menu={menu}
          links={links}
          target={target}
          onFollow={follow}
          onList={() => setListShown(true)}
        />
      ) : (
        <div className="chat-conv chat-none">
          <Icon name="chat" />
          <p>{snapshot.servers.length ? t('chat.pick') : t('chat.loading')}</p>
        </div>
      )}
      {making?.kind === 'newRoom' && makingServer && (
        <NewRoomDialog server={makingServer} space={making.space} onDone={(made) => openFrom(making.url, made)} onClose={() => setMaking(null)} />
      )}
      {making?.kind === 'browse' && makingServer && (
        <BrowseRoomsDialog
          server={makingServer}
          space={making.space}
          onOpen={(room) => openFrom(making.url, room)}
          onNewRoom={(space) => setMaking({ kind: 'newRoom', url: making.url, space })}
          onClose={() => setMaking(null)}
        />
      )}
      {making?.kind === 'newMessage' && makingServer && <NewMessageDialog server={makingServer} onDone={(made) => openFrom(making.url, made)} onClose={() => setMaking(null)} />}
    </div>
  );
}

/** The conversations: each server's rooms under their spaces by name, then its direct messages, the latest first. */
function ChatList({ servers, open, onOpen, onAdd }: {
  servers: ChatServer[];
  open: Open | null;
  onOpen: (open: Open) => void;
  /** The + of a space's heading, or of Direct's (space null). */
  onAdd: (event: MouseEvent, url: string, space: string | null) => void;
}) {
  const many = servers.length > 1;
  const row = (server: ChatServer, chat: ChatInfo) => {
    const on = open?.url === server.url && open.chat === chat.id;
    const off = chat.notify === 'off';
    const unread = chat.unread > 0 && !off && !on;
    const draft = !on && draftOf(server.url, chat.id).trim() !== '';
    // A room read without being in it, or archived, shows only while it is open.
    const peek = !chat.joined || chat.archived !== null;
    return (
      <button type="button" key={chat.id} className={`chat-row${on ? ' on' : ''}${unread ? ' un' : ''}${off ? ' off' : ''}${peek ? ' peek' : ''}`} onClick={() => onOpen({ url: server.url, chat: chat.id })}>
        {leadOf(chat, server)}
        <span className="nm">{titleOf(chat, server.me)}</span>
        {chat.alerts > 0 && !on ? <span className="n">{chat.alerts}</span> : off ? <Icon name="bellOff" /> : draft ? <span className="dr">{t('chat.draft')}</span> : null}
      </button>
    );
  };
  const heading = (name: string, url: string, space: string | null) => (
    <div className="chat-grp">
      <span>{name}</span>
      <button type="button" className="gadd" title={space === null ? t('chat.newMessageDots') : t('chat.add')} aria-label={space === null ? t('chat.newMessageDots') : t('chat.add')} onClick={(event) => onAdd(event, url, space)}>
        <Icon name="plus" />
      </button>
    </div>
  );
  return (
    <nav className="chat-list" aria-label={t('chat.title')}>
      <NotifyBanner />
      {servers.map((server) => {
        const isOpen = (chat: ChatInfo) => open?.url === server.url && open.chat === chat.id;
        const shown = server.chats.filter((chat) => !chat.hidden && (chat.archived === null || isOpen(chat)));
        if (server.visiting && isOpen(server.visiting) && !shown.some((chat) => chat.id === server.visiting!.id)) shown.push(server.visiting);
        const spaces = new Map<string, { name: string; chats: ChatInfo[] }>();
        for (const chat of shown) {
          if (chat.kind === 'direct' || !chat.space) continue;
          const group = spaces.get(chat.space) ?? { name: chat.spaceName || chat.space, chats: [] };
          group.chats.push(chat);
          spaces.set(chat.space, group);
        }
        const direct = shown.filter((chat) => chat.kind === 'direct').sort((a, b) => (b.last?.at ?? b.createdAt) - (a.last?.at ?? a.createdAt));
        return (
          <div key={server.url} className="chat-server">
            {[...spaces]
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([space, group]) => (
                <div key={space} className="chat-group">
                  {heading(group.name, server.url, space)}
                  {group.chats.sort((a, b) => a.name.localeCompare(b.name)).map((chat) => row(server, chat))}
                </div>
              ))}
            {spaces.size > 0 && (
              <div className="chat-group">
                {heading(many ? t('chat.directOn', { server: hostOf(server.url) }) : t('chat.direct'), server.url, null)}
                {direct.map((chat) => row(server, chat))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** On a phone the conversation is a page (design/chat.md, 8.2): its bar goes back to Chat, and ⓘ opens its Info page. */
export interface PhoneMode {
  back: string;
  onBack: () => void;
  onInfo: () => void;
}

/** One conversation: its head, its messages with the days between them and the line before what is new, and the box to write in. */
export function Conversation({ server, chat, menu, links, target, onFollow, onList, phone }: {
  server: ChatServer;
  chat: ChatInfo;
  menu: Props['menu'];
  links: ChatLinks;
  target: { message: string; at: number } | null;
  onFollow: (href: string) => void;
  onList: () => void;
  phone?: PhoneMode;
}) {
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
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  // The Info window, at a tab; and a room read without being in it, joined.
  const [info, setInfo] = useState<InfoTab | null>(null);
  const [joining, setJoining] = useState(false);
  const join = async () => {
    setJoining(true);
    try {
      await one?.join(chat.id);
    } catch {
      links.say(t('chat.notChanged'));
    }
    setJoining(false);
  };
  const [reacting, setReacting] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // On a phone: a message held, lifted over the dimmed page as it showed.
  const [lifted, setLifted] = useState<{ message: ChatMessage; html: string } | null>(null);
  // Files dragged over the conversation go in the box to write in.
  const [dropping, setDropping] = useState(false);
  const addFiles = useRef<((files: File[]) => void) | null>(null);
  const atEnd = useRef(true);
  const placed = useRef(false);
  const lastSeq = messages.at(-1)?.seq ?? 0;

  useEffect(() => {
    void one?.open(chat.id);
  }, [chat.id]);

  // Opened at a message: the conversation is not put at its end while it is brought into sight.
  const aiming = useRef(false);
  useEffect(() => {
    if (!target) return;
    aiming.current = true;
    void jump(target.message).finally(() => {
      aiming.current = false;
      placed.current = true;
    });
  }, [target?.at]);

  // On opening: at the line before what is new, else at the end. After that, at the end while it was there.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || !messages.length || aiming.current) return;
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
    if (!box || !lastSeq || !chat.joined || document.visibilityState !== 'visible' || !document.hasFocus()) return;
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
    // Away from the end: new messages do not take the reader there.
    atEnd.current = false;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
    window.setTimeout(() => setFlash(null), 1600);
  };

  const mine = (message: ChatMessage) => message.author === server.me && !message.agent;
  /** Where a message is, as its link back and Forward name it: #dev, or a direct message. */
  const where = chat.kind === 'direct' ? t('chat.aDirect') : `#${chat.name}`;
  /** A task or a card from a message: its first line, and its words with a link back to it under them. */
  const made = (message: ChatMessage) => {
    const first = plainText(message.body.split('\n').find((line) => line.trim()) ?? '') || message.files[0]?.name || '';
    const back = `[${t('chat.fromLink', { where, name: nameOf(message.author), day: shortDay(message.at) })}](${chatLink(server.url, chat.id, message.id)})`;
    return { title: first.slice(0, 200), description: message.body.trim() ? `${message.body.trim()}\n\n${back}` : back, from: `${where} · ${nameOf(message.author)}` };
  };
  const messageMenu = (event: MouseEvent, message: ChatMessage) => menu(event, actionsOf(message));
  /** What is done with a message: Edit for whoever wrote it, Copy text and Copy link, To task and To card, Delete. */
  const actionsOf = (message: ChatMessage): MenuItem[] => {
    const items: MenuItem[] = [];
    if (mine(message) && !message.forwarded) items.push({ label: t('chat.edit'), icon: 'pen', run: () => setEditing(message.id) });
    items.push({ label: t('chat.copyText'), icon: 'copy', run: () => void copy(message.body).catch(() => undefined) });
    items.push({
      label: t('chat.copyLink'),
      icon: 'link',
      run: () => {
        const address = chatLink(server.url, chat.id, message.id);
        void copy(address, `[${t('chat.fromLink', { where, name: nameOf(message.author), day: shortDay(message.at) })}](${address})`).then(
          () => links.say(t('chat.linkCopied')),
          () => links.say(t('error.clipboard')),
        );
      },
    });
    const task = made(message);
    items.push({ label: t('chat.toTask'), icon: 'tasks', apart: true, run: () => links.toTask(task.title, task.description, task.from) });
    items.push({ label: t('chat.toCard'), icon: 'board', run: () => links.toCard(task.title, task.description, task.from) });
    // Whoever wrote it deletes it; in a room, the space's managers too, which the server says.
    items.push({ label: t('chat.delete'), icon: 'trash', danger: true, apart: true, run: () => setDeleting(message) });
    return items;
  };
  const react = (message: ChatMessage, emoji: string) => {
    const had = message.reactions.some((each) => each.emoji === emoji && each.people.includes(server.me));
    void one?.react(message.id, emoji, !had).catch(() => undefined);
  };
  /** A link in a message: another message opens in Chat, a chip opens what it points at. */
  const onLink = (href: string) => (href.startsWith('scrawl:chat/') ? onFollow(href) : links.open(href));

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

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
    <section
      className={phone ? 'chat-conv phone' : 'chat-conv'}
      onPointerDown={readNow}
      onKeyDown={readNow}
      onDragOver={(event) => {
        if (!hasFiles(event) || !addFiles.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setDropping(false)}
      onDrop={(event) => {
        setDropping(false);
        // The box to write in takes files dropped in it itself.
        if (event.defaultPrevented || !event.dataTransfer.files.length || !addFiles.current) return;
        event.preventDefault();
        addFiles.current([...event.dataTransfer.files]);
      }}
    >
      {phone ? (
        <div className="mb-nav bar chp-nav">
          <button type="button" className="mb-back" aria-label={t('phone.back', { page: phone.back })} onClick={phone.onBack}>
            <Icon name="back" />
            <span>{phone.back}</span>
          </button>
          <button type="button" className="chp-mid" onClick={phone.onInfo}>
            <b>{chat.kind === 'private' ? titleOf(chat, server.me) : chat.kind === 'direct' ? titleOf(chat, server.me) : `# ${chat.name}`}</b>
            <small className={otherActive ? 'act' : ''}>{chat.kind === 'direct' ? (otherActive ? t('chat.active') : people.length > 1 ? t('count.people', { count: chat.members.length }) : '') : t('count.people', { count: chat.members.length })}</small>
          </button>
          <button type="button" className="mb-ib" aria-label={t('chat.info')} title={t('chat.info')} onClick={phone.onInfo}>
            <Icon name="info" />
          </button>
        </div>
      ) : (
      <header className="ch-head">
        <button type="button" className="ch-back" aria-label={t('chat.title')} onClick={onList}>
          <Icon name="back" />
        </button>
        {lead}
        <b>{titleOf(chat, server.me)}</b>
        {chat.kind === 'direct' ? otherActive && <span className="tp act">{t('chat.active')}</span> : chat.topic && <span className="tp">{chat.topic}</span>}
        <span className="acts">
          {chat.kind !== 'direct' && (
            <button type="button" className="ppl" title={chat.members.map((person) => person.name).join(', ')} onClick={() => setInfo('people')}>
              <Icon name="people" />
              {chat.members.length}
            </button>
          )}
          {chat.joined && (
            <NotifyBell
              chat={chat}
              label={chat.kind === 'public' ? `#${chat.name}` : titleOf(chat, server.me)}
              me={nameOf(server.me).split(/\s+/)[0]!}
              onPick={(notify) => void one?.notify(chat.id, notify).catch(() => links.say(t('chat.notChanged')))}
            />
          )}
          <button type="button" className="ib" title={t('chat.info')} aria-label={t('chat.info')} onClick={() => setInfo(chat.kind === 'direct' ? 'people' : 'about')}>
            <Icon name="info" />
          </button>
        </span>
      </header>
      )}
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
                  react(message, emoji);
                }}
                onReacting={(on) => setReacting(on ? message.id : null)}
                onForward={() => setForwarding(message)}
                onMenu={(event) => messageMenu(event, message)}
                onJump={(id) => void jump(id)}
                url={server.url}
                chipState={links.stateOf}
                onLink={onLink}
                {...(phone && {
                  onHold: (row: HTMLElement) => !message.deleted && setLifted({ message, html: row.outerHTML }),
                  onSwipe: () => !message.deleted && setReplyTo(message),
                })}
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
      ) : !chat.joined ? (
        <div className="ch-joinbar">
          <span>{t('chat.notJoined', { name: chat.name })}</span>
          <button type="button" className="st-btn go" disabled={joining} onClick={() => void join()}>
            {t('chat.join')}
          </button>
        </div>
      ) : goneAll ? (
        <p className="ch-closed">{t('chat.goneNote', { name: titleOf(chat, server.me) })}</p>
      ) : (
        <Composer
          key={`${server.url} ${chat.id}`}
          server={server}
          chat={chat}
          replyTo={replyTo}
          nameOf={nameOf}
          menu={menu}
          links={links}
          dropping={dropping}
          addFiles={addFiles}
          onCancelReply={() => setReplyTo(null)}
          phone={!!phone}
        />
      )}
      {lifted && (
        <PhoneHold
          html={lifted.html}
          actions={[
            { label: t('chat.reply'), icon: 'reply', run: () => setReplyTo(lifted.message) },
            { label: t('chat.forward'), icon: 'forward', run: () => setForwarding(lifted.message) },
            ...actionsOf(lifted.message),
          ]}
          onReact={(emoji) => {
            react(lifted.message, emoji);
            setLifted(null);
          }}
          onClose={() => setLifted(null)}
        />
      )}
      {forwarding && (
        <ForwardDialog
          server={server}
          message={forwarding}
          face={<Face id={forwarding.author} name={nameOf(forwarding.author)} size="sm" />}
          from={
            <>
              <b>{nameOf(forwarding.author)}</b> · {where} · {timeOf(forwarding.at)}
            </>
          }
          titleOf={(each) => titleOf(each, server.me)}
          leadOf={(each) => leadOf(each, server)}
          onClose={() => setForwarding(null)}
          onDone={(count) => {
            setForwarding(null);
            links.say(t('chat.forwarded', { count }));
          }}
        />
      )}
      {info && (
        <ChatInfoDialog
          server={server}
          chat={chat}
          tab={info}
          nameOf={nameOf}
          menu={menu}
          onJump={(id) => {
            setInfo(null);
            void jump(id);
          }}
          onLeft={() => setInfo(null)}
          say={links.say}
          onClose={() => setInfo(null)}
        />
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
  onForward: () => void;
  onMenu: (event: MouseEvent) => void;
  onJump: (id: string) => void;
  url: string;
  chipState: (href: string) => ChipState;
  onLink: (href: string) => void;
  /** On a phone: a finger resting on it lifts it; drawn to the right, it is answered. */
  onHold?: (row: HTMLElement) => void;
  onSwipe?: () => void;
}) {
  const { message, cont, nameOf, me } = props;
  const press = usePress(props.onHold, props.onSwipe);
  const quote = message.replyTo && props.quoted ? { ...message.replyTo, text: props.quoted.body, file: props.quoted.files[0]?.type ?? null, deleted: props.quoted.deleted !== null } : message.replyTo;
  const name = nameOf(message.author);
  const html = useMemo(() => {
    const body = messageHtml(message.body);
    if (!message.edited) return body;
    const mark = `<span class="ch-ed">${t('chat.edited')}</span>`;
    return /<\/p>\s*$/.test(body) ? body.replace(/<\/p>\s*$/, ` ${mark}</p>`) : `${body}${mark}`;
  }, [message.body, message.edited]);
  const forwarded = message.forwarded;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) shape(body.current, props.chipState);
  }, [html, props.chipState, props.editing]);
  return (
    <div
      className={`ch-m${cont ? ' cont' : ''}${props.reacting ? ' hold' : ''}${props.flash ? ' flash' : ''}`}
      data-id={message.id}
      style={press.style}
      {...(props.onHold ? press.handlers : { onContextMenu: message.deleted ? undefined : (event: MouseEvent) => (event.preventDefault(), props.onMenu(event)) })}
    >
      {press.pulled > 0 && (
        <span className="chp-swipe" style={{ opacity: Math.min(1, press.pulled / SWIPE) }}>
          <Icon name="reply" />
        </span>
      )}
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
            <Icon name="forward" />
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
          message.body.trim() !== '' && <div className="bd" ref={body} onClick={(event) => onBodyClick(event, props.onLink)} dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {!message.deleted && message.files.length > 0 && <Attachments url={props.url} files={message.files} />}
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
      {!message.deleted && !props.editing && !props.onHold && (
        <div className="ch-acts">
          <button type="button" className={props.reacting ? 'on' : ''} title={t('chat.react')} aria-label={t('chat.react')} onClick={() => props.onReacting(!props.reacting)}>
            <Icon name="smile" />
          </button>
          <button type="button" title={t('chat.reply')} aria-label={t('chat.reply')} onClick={props.onReply}>
            <Icon name="reply" />
          </button>
          <button type="button" title={t('chat.forward')} aria-label={t('chat.forward')} onClick={props.onForward}>
            <Icon name="forward" />
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

/** How long a finger rests on a message before it lifts, and how far it is drawn to answer it. */
const HOLD_MS = 450;
const SWIPE = 56;

/**
 * On a phone: a finger resting on a message lifts it (`onHold`, with its row); one drawn to the
 * right pulls it along, and past a little answers it (`onSwipe`). A finger moving up or down is
 * scrolling. Without `onHold`, nothing.
 */
function usePress(onHold?: (row: HTMLElement) => void, onSwipe?: () => void) {
  const [pulled, setPulled] = useState(0);
  const at = useRef<{ x: number; y: number; timer: number; fired: boolean; swiping: boolean; row: HTMLElement } | null>(null);
  const end = () => {
    if (at.current) window.clearTimeout(at.current.timer);
    at.current = null;
    setPulled(0);
  };
  if (!onHold) return { pulled: 0, style: undefined, handlers: {} };
  return {
    pulled,
    style: pulled ? { transform: `translateX(${pulled}px)`, transition: 'none' } : undefined,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const row = event.currentTarget;
        at.current = {
          x: event.clientX,
          y: event.clientY,
          fired: false,
          swiping: false,
          row,
          timer: window.setTimeout(() => {
            if (!at.current) return;
            at.current.fired = true;
            navigator.vibrate?.(8);
            onHold(row);
          }, HOLD_MS),
        };
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const now = at.current;
        if (!now || now.fired) return;
        const x = event.clientX - now.x;
        const y = event.clientY - now.y;
        if (!now.swiping) {
          if (Math.abs(y) > 10) return end();
          if (x < 10 || x < Math.abs(y)) return;
          now.swiping = true;
          window.clearTimeout(now.timer);
          try {
            now.row.setPointerCapture(event.pointerId);
          } catch {
            // Captured or not, the row follows while the finger stays on it.
          }
        }
        setPulled(Math.max(0, Math.min(x, 90)));
      },
      onPointerUp: () => {
        if (at.current?.swiping && pulled >= SWIPE) onSwipe?.();
        const fired = at.current?.fired;
        end();
        // The tap that ends a hold opens nothing under the finger.
        if (fired) suppressClick();
      },
      onPointerCancel: end,
      onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (!at.current?.fired) onHold(event.currentTarget);
        end();
      },
    },
  };
}

/** Takes the click that comes after a finger lifted from a hold. */
function suppressClick() {
  const take = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('click', take, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', take, { capture: true }), 250);
}

/**
 * On a phone, a message held (design/chat.md, 8.2; design/mockups.html, Messaging): it lifts over
 * the dimmed page, the reactions above it, every emoji behind +, and what can be done under it.
 */
function PhoneHold({ html, actions, onReact, onClose }: { html: string; actions: MenuItem[]; onReact: (emoji: string) => void; onClose: () => void }) {
  const [all, setAll] = useState(false);
  return (
    <div className="chp-hold-layer" onClick={onClose}>
      <div className="chp-hold" onClick={(event) => event.stopPropagation()}>
        {all ? (
          <div className="chp-allrx">
            <ReactionPicker onPick={onReact} onClose={() => setAll(false)} startWide />
          </div>
        ) : (
          <div className="chp-rxbar">
            {QUICK.map((emoji) => (
              <button type="button" key={emoji} onClick={() => onReact(emoji)}>
                {emoji}
              </button>
            ))}
            <button type="button" className="more" aria-label={t('chat.allEmoji')} onClick={() => setAll(true)}>
              <Icon name="plus" />
            </button>
          </div>
        )}
        <div className="chp-lift" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="chp-acts">
          {actions.map((action) => (
            <button
              type="button"
              key={action.label}
              className={action.danger ? 'r red' : 'r'}
              onClick={() => {
                onClose();
                action.run();
              }}
            >
              <span>{action.label}</span>
              {action.icon && <Icon name={action.icon} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * What a message's HTML cannot know: its code coloured, and each chip as it is to this person,
 * faint with No access or Moved or deleted when it cannot be opened (design/chat.md, 3.7).
 */
function shape(root: HTMLElement, stateOf: (href: string) => ChipState) {
  void highlightCodeBlocks(root);
  for (const chip of root.querySelectorAll<HTMLElement>('.msg-chip')) {
    const state = stateOf(chip.dataset.href ?? '');
    chip.classList.toggle('faint', state !== 'here');
    let why = chip.querySelector('em');
    if (state === 'here') {
      why?.remove();
      continue;
    }
    why ??= chip.appendChild(document.createElement('em'));
    why.textContent = state === 'notHere' ? t('chat.notHere') : state === 'noAccess' ? t('chat.noAccess') : t('chat.gone');
  }
}

/** A click in a message's words: a chip or a message's link opens, a code block is copied or unfolded. */
function onBodyClick(event: MouseEvent, onLink: (href: string) => void) {
  const at = event.target as HTMLElement;
  const link = at.closest<HTMLElement>('.msg-chip, a.msg-chat');
  if (link) {
    event.preventDefault();
    return onLink(link.dataset.href ?? '');
  }
  const button = at.closest<HTMLElement>('[data-act]');
  const box = button?.closest<HTMLElement>('.msg-codebox');
  if (!button || !box) return;
  if (button.dataset.act === 'more') {
    box.classList.add('open');
    button.remove();
    return;
  }
  void copy(box.querySelector('pre')?.textContent ?? '').then(
    () => {
      button.textContent = t('chat.copied');
      window.setTimeout(() => (button.textContent = t('chat.copy')), 1500);
    },
    () => undefined,
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
        {pending.body.trim() !== '' && <div className="bd" dangerouslySetInnerHTML={{ __html: html }} />}
        {/* What waited on this device from before files went in messages has none. */}
        {(pending.files ?? []).length > 0 && <Attachments url={url} files={pending.files} />}
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
function ReactionPicker({ onPick, onClose, startWide = false }: { onPick: (emoji: string) => void; onClose: () => void; startWide?: boolean }) {
  const [all, setAll] = useState<Emoji[] | null>(null);
  const [wide, setWide] = useState(startWide);
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

/**
 * The box to write in: Markdown in the editor notes have; Enter sends; @ offers the people of the
 * conversation; + adds files, a code block or a chip; the microphone records a voice message.
 */
function Composer({ server, chat, replyTo, nameOf, menu, links, dropping, addFiles: addFilesHere, onCancelReply, phone = false }: {
  server: ChatServer;
  chat: ChatInfo;
  replyTo: ChatMessage | null;
  nameOf: (id: string) => string;
  menu: Props['menu'];
  links: ChatLinks;
  dropping: boolean;
  /** Where the conversation hands the files dropped on it. */
  addFiles: RefObject<((files: File[]) => void) | null>;
  onCancelReply: () => void;
  /** The phone's box: +, the words, and Send or the microphone held to record. */
  phone?: boolean;
}) {
  const one = store.server(server.url);
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<ScrawlEditor | null>(null);
  const [text, setText] = useState(() => draftOf(server.url, chat.id));
  const [mention, setMention] = useState<{ from: number; to: number; query: string; at: number } | null>(null);
  // The formatting row, which Aa opens over the box; and the emoji, over it too.
  const [formatting, setFormatting] = useState(false);
  const [emoji, setEmoji] = useState(false);
  // The files on their way into the message, over the box; and a voice message being recorded in its place.
  const [going, setGoing] = useState<Going[]>([]);
  const goingNow = useRef(going);
  goingNow.current = going;
  const [recording, setRecording] = useState(false);
  const placeholder = chat.kind === 'direct' ? t('chat.messageTo', { name: titleOf(chat, server.me) }) : t('chat.messageTo', { name: `#${chat.name}` });

  const change = (key: string, patch: Partial<Going>) => setGoing((was) => was.map((each) => (each.key === key ? { ...each, ...patch } : each)));
  const letGo = (each: Going) => {
    if (!each.file && !each.failed) each.stop.abort();
    if (each.preview) URL.revokeObjectURL(each.preview);
  };
  useEffect(() => () => goingNow.current.forEach(letGo), []);

  /** Files for the message: each measured, its small picture sent, then itself, with how far it went. */
  const add = (files: File[]) => {
    if (!one || !files.length) return;
    const room = MAX_FILES - goingNow.current.length;
    if (files.length > room) links.say(t('chat.tooMany', { count: MAX_FILES }));
    const limit = server.maxFileMb;
    const added: Going[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      if (limit !== null && file.size > limit * 1024 * 1024) {
        links.say(t('chat.tooLarge', { size: limitText(limit) }));
        continue;
      }
      const each: Going = { key: crypto.randomUUID(), name: file.name || 'file', type: file.type, size: file.size, sent: 0, preview: isImage(file) ? URL.createObjectURL(file) : null, stop: new AbortController() };
      added.push(each);
      void (async () => {
        try {
          const measured = await measure(file);
          if (measured.thumb && !each.preview) change(each.key, { preview: URL.createObjectURL(measured.thumb) });
          const thumb = measured.thumb ? (await one.upload(measured.thumb, () => undefined, each.stop.signal)).hash : undefined;
          const sent = await one.upload(file, (count) => change(each.key, { sent: count }), each.stop.signal);
          const done: ChatFile = {
            hash: sent.hash,
            name: each.name,
            type: file.type || 'application/octet-stream',
            size: sent.size,
            ...(measured.width && { width: measured.width }),
            ...(measured.height && { height: measured.height }),
            ...(measured.duration !== undefined && Number.isFinite(measured.duration) && { duration: measured.duration }),
            ...(thumb && { thumb }),
          };
          change(each.key, { sent: file.size, file: done });
        } catch (error) {
          if (each.stop.signal.aborted) return;
          change(each.key, { failed: error instanceof Error && error.message === 'too-large' && limit !== null ? t('chat.tooLarge', { size: limitText(limit) }) : t('chat.notUploaded') });
        }
      })();
    }
    if (added.length) setGoing((was) => [...was, ...added]);
    editor.current?.view.focus();
  };
  const adding = useRef(add);
  adding.current = add;
  useEffect(() => {
    addFilesHere.current = (files) => adding.current(files);
    return () => {
      addFilesHere.current = null;
    };
  }, []);

  const remove = (key: string) => {
    const each = goingNow.current.find((one) => one.key === key);
    if (each) letGo(each);
    setGoing((was) => was.filter((one) => one.key !== key));
  };

  /** Photos and files…: the computer's own picker, many at once. */
  /** Photos and files…: the device's own picker, many at once; on a phone the photos, or the camera. */
  const pickFiles = (accept = '', camera = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !camera;
    if (accept) input.accept = accept;
    if (camera) input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => add([...(input.files ?? [])]));
    input.click();
  };

  /** Puts a chip where the cursor is, apart from the words around it. */
  const putChip = (chip: string, at?: number) => {
    const view = editor.current?.view;
    if (!view) return;
    const from = at ?? view.state.selection.main.head;
    const before = view.state.doc.sliceString(Math.max(0, from - 1), from);
    const insert = `${before && !/\s/.test(before) ? ' ' : ''}${chip} `;
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
    view.focus();
  };

  const plusMenu = (event: MouseEvent) =>
    menu(
      event,
      phone
        ? [
            { label: t('chat.photoLibrary'), icon: 'image', run: () => pickFiles('image/*,video/*') },
            { label: t('chat.camera'), icon: 'image', run: () => pickFiles('image/*', true) },
            { label: t('chat.fileDots'), icon: 'file', run: () => pickFiles() },
          ]
        : [
      { label: t('chat.photosFiles'), icon: 'image', run: () => pickFiles() },
      {
        label: t('chat.codeBlock'),
        icon: 'codeBlock',
        run: () => {
          const view = editor.current?.view;
          if (view) toggleCodeBlock(view);
          view?.focus();
        },
      },
      { label: t('chat.itemChip'), icon: 'link', run: () => void links.pick(server.url).then((chip) => (chip ? putChip(chip) : editor.current?.view.focus())) },
          ],
    );

  // On a phone the microphone is held: drawn left the recording is dropped, drawn up it is locked
  // and waits for Send in the bar a computer has; let go, it is sent.
  const [hold, setHold] = useState<{ x: number; y: number; dx: number; since: number } | null>(null);
  const holding = useRef<{ recording: Promise<Recording | null>; done: boolean } | null>(null);
  const [locked, setLocked] = useState<Recording | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!hold) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 200);
    return () => window.clearInterval(timer);
  }, [hold !== null]);
  const dropHold = () => {
    const now = holding.current;
    if (!now || now.done) return;
    now.done = true;
    void now.recording.then((recording) => recording?.stop());
    setHold(null);
  };
  const mic = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Not captured: the finger's moves still reach the button while it stays on it.
      }
      const recording = Recording.start();
      holding.current = { recording, done: false };
      setHold({ x: event.clientX, y: event.clientY, dx: 0, since: Date.now() });
      void recording.then((started) => {
        if (started) return;
        dropHold();
        links.say(t('format.noMicrophone'));
      });
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const now = holding.current;
      if (!hold || !now || now.done) return;
      const dx = event.clientX - hold.x;
      const dy = event.clientY - hold.y;
      if (dx < -CANCEL_X) return dropHold();
      if (dy < -LOCK_Y) {
        now.done = true;
        setHold(null);
        void now.recording.then((recording) => {
          if (!recording) return;
          setLocked(recording);
          setRecording(true);
        });
        return;
      }
      setHold({ ...hold, dx: Math.min(0, dx) });
    },
    onPointerUp: () => {
      const now = holding.current;
      if (!now || now.done) return;
      now.done = true;
      setHold(null);
      void now.recording.then(async (recording) => {
        if (!recording) return;
        const seconds = recording.seconds();
        const blob = await recording.stop();
        // A tap is not a recording: it says how to make one.
        if (seconds < 0.6) return links.say(t('chat.holdToRecord'));
        await sendVoice(blob, seconds).catch(() => undefined);
      });
    },
    onPointerCancel: dropHold,
  };

  /** A voice message: its recording sent, then the message with it, an answer when one is being written. */
  const sendVoice = async (blob: Blob, seconds: number) => {
    if (!one) return;
    const type = blob.type || 'audio/webm';
    const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
    try {
      const sent = await one.upload(blob, () => undefined, new AbortController().signal);
      one.send(chat.id, '', replyTo?.id ?? null, [{ hash: sent.hash, name: `${t('chat.voiceFile', { stamp })}.${extension}`, type, size: sent.size, duration: Math.round(seconds * 10) / 10 }]);
    } catch (error) {
      links.say(t('chat.notUploaded'));
      throw error;
    }
    setRecording(false);
    setLocked(null);
    onCancelReply();
    window.setTimeout(() => editor.current?.view.focus());
  };

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
      // Pasted and dropped files, a screenshot too, go in the message.
      addFiles: (files) => adding.current(files),
      pastedFiles: isDesktop ? clipboardFilesOnDesktop : undefined,
      onEmptyPaste: () => links.say(t('editor.pasteNothing')),
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

  // What is uploaded goes with the words; what is still on its way holds Send, what failed stays in the tray.
  const ready = going.filter((each) => each.file);
  const uploading = going.some((each) => !each.file && !each.failed);
  const canSend = !uploading && (text.trim() !== '' || ready.length > 0);

  const send = () => {
    const view = editor.current?.view;
    const body = view?.state.doc.toString() ?? '';
    if (!view || !canSend || !one) return;
    one.send(chat.id, body.trim() ? body : '', replyTo?.id ?? null, ready.map((each) => each.file!));
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    keepDraft(server.url, chat.id, '');
    setText('');
    ready.forEach(letGo);
    setGoing((was) => was.filter((each) => !each.file));
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
    // On a phone Enter is a new line; Send sends.
    if (phone || event.key !== 'Enter' || event.shiftKey || event.altKey || event.nativeEvent.isComposing || editorTakesEnter(view)) return;
    if (inFence(view.state.doc.toString(), view.state.selection.main.head)) return;
    event.preventDefault();
    event.stopPropagation();
    send();
  };

  // A row of the sidebar dragged in: a note, a list, a board or a collection, as a chip.
  const takesItem = (event: DragEvent) => event.dataTransfer.types.includes(ITEM_DRAG_TYPE);

  return (
    <div
      className={`ch-cmp${phone ? ' chp-box' : ''}${text.trim() || going.length || recording || dropping ? ' on' : ''}${recording ? ' rec' : ''}${hold ? ' holding' : ''}`}
      onKeyDownCapture={recording ? undefined : onKeyDownCapture}
      onKeyUp={look}
      onMouseUp={look}
      onDragOverCapture={(event) => {
        if (!takesItem(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDropCapture={(event) => {
        if (!takesItem(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const chip = links.chipOf(server.url, event.dataTransfer.getData(ITEM_DRAG_TYPE));
        if (!chip) return links.say(t('chat.notOnServer'));
        const view = editor.current?.view;
        putChip(chip, view?.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined);
      }}
    >
      {recording && (
        <RecorderBar
          onSend={sendVoice}
          onCancel={() => {
            setRecording(false);
            setLocked(null);
            if (!phone) window.setTimeout(() => editor.current?.view.focus());
          }}
          {...(locked && { going: locked })}
        />
      )}
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
      <Tray going={going} onRemove={remove} />
      {phone ? (
        <div className="chp-row">
          {!hold && (
            <button type="button" className="pl" aria-label={t('chat.add')} onMouseDown={(event) => event.preventDefault()} onClick={plusMenu}>
              <Icon name="plus" />
            </button>
          )}
          <div className={hold ? 'in gone' : 'in'} ref={box} />
          {hold && (
            <>
              <span className="rd" />
              <span className="tm">{clock((Date.now() - hold.since) / 1000)}</span>
              <span className="sl" style={{ transform: `translateX(${hold.dx / 2}px)`, opacity: 1 + hold.dx / CANCEL_X }}>
                <Icon name="back" />
                {t('chat.slideToCancel')}
              </span>
            </>
          )}
          {canSend && !hold ? (
            <button type="button" className="send go" aria-label={t('chat.send')} onMouseDown={(event) => event.preventDefault()} onClick={send}>
              <Icon name="send" />
            </button>
          ) : (
            <button type="button" key="mic" className={hold ? 'mic big' : 'mic'} aria-label={t('chat.holdToRecord')} {...mic}>
              <Icon name="audio" />
            </button>
          )}
          {hold && (
            <span className="chp-lockp" aria-hidden="true">
              <Icon name="lock" />
              <Icon name="up" />
            </span>
          )}
        </div>
      ) : (
      <>
      <div className="in" ref={box} />
      <div className="bar">
        <button type="button" className="ib" title={t('chat.add')} aria-label={t('chat.add')} onMouseDown={(event) => event.preventDefault()} onClick={plusMenu}>
          <Icon name="plus" />
        </button>
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
        <button type="button" className="ib" title={t('chat.record')} aria-label={t('chat.record')} onMouseDown={(event) => event.preventDefault()} onClick={() => setRecording(true)}>
          <Icon name="audio" />
        </button>
        <button type="button" className={`send${canSend ? ' go' : ''}`} title={t('chat.send')} aria-label={t('chat.send')} disabled={!canSend} onMouseDown={(event) => event.preventDefault()} onClick={send}>
          <Icon name="send" />
        </button>
      </div>
      </>
      )}
    </div>
  );
}

/** How far the held microphone is drawn left to drop the recording, and up to lock it. */
const CANCEL_X = 110;
const LOCK_Y = 80;
