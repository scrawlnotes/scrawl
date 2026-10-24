import { type ChatFile, type ChatInfo, type ChatNotify, type ChatPerson, type ChatShared, ServerError } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { AudioPlayer, FileRow, isAudio, isImage, isVideo, Lightbox, useFileUrl } from './ChatParts';
import { Face, leadOf, shortDay, titleOf } from './ChatFaces';
import { clock } from './chatMedia';
import { type ChatServer, store } from './chatStore';
import { ConfirmDialog, Dialog, type MenuItem } from './dialogs';
import { Icon } from './Icon';
import { saveFile } from './storage';

// Rooms (design/chat.md, 2 and 8.1; design/mockups.html, Messaging): New room, Browse rooms and
// New message, each a window in the middle; and a conversation's Info window: About, People, the
// photos, files, recordings and links shared in it, what it tells you, Export, Leave, Hide and
// Archive.

/** A space of a server someone is in: its general room has everyone in it. */
export interface ChatSpace {
  id: string;
  name: string;
  people: ChatPerson[];
}

/** The shared spaces of a server this person is in, by name. */
export function spacesOf(server: ChatServer): ChatSpace[] {
  return server.chats
    .filter((chat) => chat.general && chat.space)
    .map((chat) => ({ id: chat.space!, name: chat.spaceName || chat.space!, people: chat.members.filter((person) => !chat.gone.includes(person.id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone this person shares a space with on a server: whom they write to. */
export function peopleOf(server: ChatServer): ChatPerson[] {
  const people = new Map<string, ChatPerson>();
  for (const space of spacesOf(server)) for (const person of space.people) if (person.id !== server.me) people.set(person.id, person);
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A direct message has nine people at most, whoever opens it among them. */
const MAX_GROUP = 9;

/** People picked by name: a chip for each, × to take one out, and a field that finds the others. */
function PeoplePicker({ people, picked, onChange, max, placeholder, autoFocus = false, active = [] }: {
  people: ChatPerson[];
  picked: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  placeholder: string;
  autoFocus?: boolean;
  /** Who uses Scrawl now: their faces have the green dot. */
  active?: string[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const words = query.trim().toLowerCase();
  const offered = people.filter((person) => !picked.includes(person.id) && (!words || person.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(words)) || person.name.toLowerCase().startsWith(words))).slice(0, 6);
  const full = max !== undefined && picked.length >= max;
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? '';
  const pick = (person: ChatPerson) => {
    onChange([...picked, person.id]);
    setQuery('');
    setAt(0);
    field.current?.focus();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Backspace' && !query && picked.length) onChange(picked.slice(0, -1));
    else if (event.key === 'ArrowDown' && offered.length) setAt((at + 1) % offered.length);
    else if (event.key === 'ArrowUp' && offered.length) setAt((at - 1 + offered.length) % offered.length);
    else if (event.key === 'Enter' && open && offered[at] && !full) pick(offered[at]!);
    else if (event.key === 'Escape' && open && offered.length) setOpen(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div className="ch-ppl-box">
      <div className="ch-ppl" onMouseDown={(event) => event.target === event.currentTarget && (event.preventDefault(), field.current?.focus())}>
        {picked.map((id) => (
          <span key={id} className="pc">
            <Face id={id} name={nameOf(id)} size="xs" />
            {nameOf(id)}
            <button type="button" className="x" aria-label={t('chat.removePerson', { name: nameOf(id) })} onClick={() => onChange(picked.filter((each) => each !== id))}>
              <Icon name="close" />
            </button>
          </span>
        ))}
        <input
          ref={field}
          autoFocus={autoFocus}
          value={query}
          disabled={full}
          placeholder={full ? t('chat.groupFull', { count: MAX_GROUP }) : picked.length ? '' : placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setAt(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
        />
      </div>
      {open && !full && offered.length > 0 && (
        <div className="ch-ppl-pop" role="listbox">
          {offered.map((person, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === at}
              key={person.id}
              className={i === at ? 'r hot' : 'r'}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setAt(i)}
              onClick={() => pick(person)}
            >
              <Face id={person.id} name={person.name} size="sm" online={active.includes(person.id)} />
              <span>{person.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** New room: its space, its name and topic, public or private, and the people it starts with. */
export function NewRoomDialog({ server, space, onDone, onClose }: { server: ChatServer; space: string | null; onDone: (chat: ChatInfo) => void; onClose: () => void }) {
  const spaces = spacesOf(server);
  const [where, setWhere] = useState(space ?? spaces[0]?.id ?? '');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [kind, setKind] = useState<'public' | 'private'>('public');
  const [people, setPeople] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = spaces.find((each) => each.id === where);
  const create = async () => {
    if (!name.trim() || !chosen || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      onDone(await store.server(server.url)!.openRoom({ space: chosen.id, name: name.trim(), topic: topic.trim(), kind, members: people }));
    } catch (error) {
      const code = error instanceof ServerError ? error.code : '';
      setFailed(code === 'name-taken' ? t('chat.nameTaken', { space: chosen.name }) : code === 'bad-name' ? t('chat.badName') : t('chat.notMade'));
      setBusy(false);
    }
  };
  return (
    <Dialog label={t('chat.newRoom')} className="ch-room-dlg" onClose={onClose} onKeyDown={(event) => event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.closest('.ch-ppl') === null && (event.preventDefault(), void create())}>
      <h2>{t('chat.newRoom')}</h2>
      {spaces.length > 1 && (
        <>
          <p className="choices-label">{t('chat.space')}</p>
          <select className="ch-sel" value={where} onChange={(event) => (setWhere(event.target.value), setPeople([]))}>
            {spaces.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </>
      )}
      <p className="choices-label">{t('chat.roomName')}</p>
      <label className={`ch-name${failed ? ' bad' : ''}`}>
        <span className="hs">#</span>
        <input autoFocus maxLength={40} value={name} onChange={(event) => (setName(event.target.value), setFailed(null))} />
      </label>
      {failed && <p className="ch-fail-note">{failed}</p>}
      <p className="choices-label">{t('chat.topic')}</p>
      <input value={topic} maxLength={250} placeholder={t('chat.optional')} onChange={(event) => setTopic(event.target.value)} />
      <div className="ch-vis" role="radiogroup">
        {(['public', 'private'] as const).map((each) => (
          <button type="button" role="radio" aria-checked={kind === each} key={each} className={kind === each ? 'o on' : 'o'} onClick={() => setKind(each)}>
            <span className="rdo" />
            <span>
              <b>{each === 'public' ? t('chat.public') : t('chat.private')}</b>
              <small>{each === 'public' ? t('chat.publicAbout', { space: chosen?.name ?? '' }) : t('chat.privateAbout')}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="choices-label">{t('chat.people')}</p>
      <PeoplePicker people={(chosen?.people ?? []).filter((person) => person.id !== server.me)} picked={people} onChange={setPeople} placeholder={t('chat.addPeople')} active={server.active} />
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!name.trim() || !chosen || busy} onClick={() => void create()}>
          {t('chat.create')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Browse rooms: a space's public rooms to read and join, the private ones this person is in, and
 * those archived, under them.
 */
export function BrowseRoomsDialog({ server, space, onOpen, onNewRoom, onClose }: {
  server: ChatServer;
  space: string | null;
  onOpen: (chat: ChatInfo) => void;
  onNewRoom: (space: string) => void;
  onClose: () => void;
}) {
  const spaces = spacesOf(server);
  const [where, setWhere] = useState(space ?? spaces[0]?.id ?? '');
  const [rooms, setRooms] = useState<ChatInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [find, setFind] = useState('');
  const [joining, setJoining] = useState<string | null>(null);
  const one = store.server(server.url);
  useEffect(() => {
    if (!where || !one) return;
    let live = true;
    setRooms(null);
    setFailed(false);
    one.rooms(where).then(
      (found) => live && setRooms(found),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [where]);
  const words = find.trim().toLowerCase();
  const shown = (rooms ?? []).filter((room) => !words || room.name.toLowerCase().includes(words) || room.topic.toLowerCase().includes(words));
  const open = shown.filter((room) => room.archived === null);
  const archived = shown.filter((room) => room.archived !== null);
  const join = async (room: ChatInfo) => {
    if (!one || joining) return;
    setJoining(room.id);
    try {
      onOpen(await one.join(room.id));
    } catch {
      setJoining(null);
    }
  };
  const row = (room: ChatInfo) => (
    <div key={room.id} className={`ch-browse-row${room.archived !== null ? ' old' : ''}`}>
      <button type="button" className="go" onClick={() => onOpen(room)}>
        {leadOf(room, server)}
        <span className="tx">
          <b>{room.name}</b>
          <small>{[t('count.people', { count: room.members.length }), room.topic].filter(Boolean).join(' · ')}</small>
        </span>
      </button>
      {room.archived === null && (room.joined ? <span className="in">{t('chat.joined')}</span> : room.kind === 'public' && (
        <button type="button" className="st-btn" disabled={joining !== null} onClick={() => void join(room)}>
          {t('chat.join')}
        </button>
      ))}
    </div>
  );
  return (
    <Dialog label={t('chat.browseRooms')} className="ch-room-dlg ch-browse" onClose={onClose}>
      <h2>{t('chat.browseRooms')}</h2>
      <div className="ch-browse-top">
        {spaces.length > 1 && (
          <select className="ch-sel" value={where} onChange={(event) => setWhere(event.target.value)}>
            {spaces.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        )}
        <label className="ch-ff">
          <Icon name="search" />
          <input autoFocus placeholder={t('chat.findRoom')} value={find} onChange={(event) => setFind(event.target.value)} />
        </label>
      </div>
      <div className="ch-browse-list">
        {failed ? (
          <p className="ch-none">{t('chat.roomsFailed')}</p>
        ) : rooms === null ? (
          <p className="ch-none">{t('chat.loading')}</p>
        ) : (
          <>
            {open.map(row)}
            {open.length === 0 && <p className="ch-none">{words ? t('chat.noRoomFound') : t('chat.noRooms')}</p>}
            {archived.length > 0 && <p className="choices-label">{t('chat.archived')}</p>}
            {archived.map(row)}
          </>
        )}
      </div>
      <div className="dialog-actions">
        <button type="button" className="left" onClick={() => onNewRoom(where)}>
          {t('chat.newRoomDots')}
        </button>
        <button type="button" onClick={onClose}>
          {t('dialog.close')}
        </button>
      </div>
    </Dialog>
  );
}

/** New message: the people to write to; with one, the direct message with them; with more, a group of nine at most. */
export function NewMessageDialog({ server, onDone, onClose }: { server: ChatServer; onDone: (chat: ChatInfo) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onDone(await store.server(server.url)!.direct(picked));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <Dialog label={t('chat.newMessage')} className="ch-room-dlg" onClose={onClose}>
      <h2>{t('chat.newMessage')}</h2>
      <p className="choices-label">{t('chat.to')}</p>
      <PeoplePicker people={peopleOf(server)} picked={picked} onChange={setPicked} max={MAX_GROUP - 1} placeholder={t('chat.findPerson')} autoFocus active={server.active} />
      <p className="ch-hint">{picked.length > 1 ? t('chat.groupAbout') : t('chat.directAbout')}</p>
      {failed && <p className="ch-fail-note">{t('chat.notMade')}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!picked.length || busy} onClick={() => void start()}>
          {t('chat.start')}
        </button>
      </div>
    </Dialog>
  );
}

export type InfoTab = 'about' | 'people' | 'media' | 'files' | 'voice' | 'links';

const NOTIFY: ChatNotify[] = ['all', 'mentions', 'off'];

/** A month as Media's headings name it: October, and the year when it is not this one. */
function monthOf(at: number): string {
  const day = new Date(at);
  return day.toLocaleDateString(locale(), { month: 'long', ...(day.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });
}

/**
 * A conversation's Info window (design/chat.md, 8.1): About with its name and topic, which
 * whoever opened it and the space's managers change; People; what was shared in it, each going to
 * its message; and at its foot what it tells this person, Export…, Leave room or Hide, Archive room.
 */
export function ChatInfoDialog({ server, chat, tab: first, nameOf, menu, onJump, onLeft, say, onClose }: {
  server: ChatServer;
  chat: ChatInfo;
  tab: InfoTab;
  nameOf: (id: string) => string;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  /** Goes to a message in the conversation, the window closed. */
  onJump: (message: string) => void;
  /** The conversation is off the list: left, hidden or archived. */
  onLeft: () => void;
  say: (text: string) => void;
  onClose: () => void;
}) {
  const one = store.server(server.url)!;
  const direct = chat.kind === 'direct';
  const [tab, setTab] = useState<InfoTab>(direct && first === 'about' ? 'people' : first);
  const [shared, setShared] = useState<ChatShared | null>(null);
  const [asking, setAsking] = useState<'leave' | 'archive' | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    let live = true;
    one.shared(chat.id).then(
      (found) => live && setShared(found),
      () => live && setShared({ files: [], links: [] }),
    );
    return () => {
      live = false;
    };
  }, [chat.id, chat.lastSeq]);
  const media = shared?.files.filter((each) => isImage(each.file) || isVideo(each.file)) ?? [];
  const files = shared?.files.filter((each) => !isImage(each.file) && !isVideo(each.file) && !isAudio(each.file)) ?? [];
  const voice = shared?.files.filter((each) => isAudio(each.file)) ?? [];
  const links = shared?.links ?? [];
  const count = (n: number) => (shared ? <small>{n}</small> : null);
  const tabs: { id: InfoTab; label: string; n?: number }[] = [
    ...(direct ? [] : [{ id: 'about' as const, label: t('chat.about') }]),
    { id: 'people', label: t('chat.people'), n: chat.members.length },
    { id: 'media', label: t('chat.media'), n: media.length },
    { id: 'files', label: t('chat.files'), n: files.length },
    { id: 'voice', label: t('chat.voiceTab'), n: voice.length },
    { id: 'links', label: t('chat.links'), n: links.length },
  ];

  const notifyMenu = (event: MouseEvent) =>
    menu(
      event,
      NOTIFY.map((each) => ({
        label: t(`chat.notify.${each}`),
        checked: chat.notify === each,
        run: () => void one.notify(chat.id, each).catch(() => say(t('chat.notChanged'))),
      })),
    );
  const exportIt = async () => {
    setExporting(true);
    try {
      const name = `${titleOf(chat, server.me).replace(/[\\/:*?"<>|]/g, '-')}.zip`;
      if (await saveFile(name, await one.exportZip(chat.id), 'zip')) say(t('import.exported', { name }));
    } catch {
      say(t('chat.exportFailed'));
    }
    setExporting(false);
  };
  const leave = async () => {
    setAsking(null);
    try {
      await one.leave(chat.id);
      onLeft();
    } catch {
      say(t('chat.notChanged'));
    }
  };
  const hide = async () => {
    try {
      await one.hide(chat.id, true);
      onLeft();
    } catch {
      say(t('chat.notChanged'));
    }
  };
  const archive = async (archived: boolean) => {
    setAsking(null);
    try {
      const changed = await one.changeRoom(chat.id, { archived });
      // Archived, it leaves the list and stays open, read and not written; unarchived, it is back on the list.
      one.visit(archived ? changed : null);
      onClose();
    } catch {
      say(t('chat.notChanged'));
    }
  };
  /** Who shared it and when: it goes to the message. */
  const from = (item: { message: string; author: string; at: number }) => (
    <button type="button" className="from" title={t('chat.showInChat')} onClick={() => onJump(item.message)}>
      {nameOf(item.author)} · {shortDay(item.at)}
    </button>
  );

  return (
    <>
      <Dialog label={titleOf(chat, server.me)} className="ch-info" onClose={onClose}>
        <div className="ih">
          {leadOf(chat, server)}
          <b>{titleOf(chat, server.me)}</b>
          {!direct && chat.topic && <span className="tp">{chat.topic}</span>}
          <button type="button" className="x" aria-label={t('dialog.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="ch-tabs" role="tablist">
          {tabs.map((each) => (
            <button type="button" role="tab" aria-selected={tab === each.id} key={each.id} className={tab === each.id ? 'on' : ''} onClick={() => setTab(each.id)}>
              {each.label}
              {each.n !== undefined && (each.id === 'people' ? <small>{each.n}</small> : count(each.n))}
            </button>
          ))}
        </div>
        <div className="ch-info-body">
          {tab === 'about' && <About server={server} chat={chat} nameOf={nameOf} say={say} />}
          {tab === 'people' && <People server={server} chat={chat} say={say} />}
          {tab === 'media' && (shared ? <Media url={server.url} items={media} onJump={onJump} /> : <p className="ch-none">{t('chat.loading')}</p>)}
          {tab === 'files' &&
            (files.length ? (
              files.map((each, i) => (
                <div key={`${each.message}${i}`} className="ch-shared-row">
                  <FileRow url={server.url} file={each.file} />
                  {from(each)}
                </div>
              ))
            ) : (
              <p className="ch-none">{shared ? t('chat.noFiles') : t('chat.loading')}</p>
            ))}
          {tab === 'voice' &&
            (voice.length ? (
              voice.map((each, i) => (
                <div key={`${each.message}${i}`} className="ch-shared-row">
                  <AudioPlayer url={server.url} file={each.file} />
                  {from(each)}
                </div>
              ))
            ) : (
              <p className="ch-none">{shared ? t('chat.noVoice') : t('chat.loading')}</p>
            ))}
          {tab === 'links' &&
            (links.length ? (
              links.map((each, i) => (
                <div key={`${each.message}${i}`} className="ch-shared-row">
                  <a className="ch-link" href={each.url} target="_blank" rel="noopener noreferrer">
                    <Icon name="link" />
                    <span className="tx">
                      <b>{each.text}</b>
                      {each.text !== each.url && <small>{each.url}</small>}
                    </span>
                  </a>
                  {from(each)}
                </div>
              ))
            ) : (
              <p className="ch-none">{shared ? t('chat.noLinks') : t('chat.loading')}</p>
            ))}
        </div>
        <div className="ch-info-foot">
          {chat.joined && (
            <button type="button" className="ch-nsel" onClick={notifyMenu}>
              <Icon name={chat.notify === 'off' ? 'bellOff' : 'bell'} />
              {t(`chat.notify.${chat.notify}`)}
              <Icon name="chevron" />
            </button>
          )}
          <span className="gap" />
          <button type="button" className="st-btn" disabled={exporting} onClick={() => void exportIt()}>
            {exporting ? t('chat.exporting') : t('chat.export')}
          </button>
          {direct ? (
            <button type="button" className="st-btn" onClick={() => void hide()}>
              {t('chat.hide')}
            </button>
          ) : (
            chat.joined &&
            !chat.general && (
              <button type="button" className="st-btn" onClick={() => (chat.kind === 'private' ? setAsking('leave') : void leave())}>
                {t('chat.leaveRoom')}
              </button>
            )
          )}
          {!direct && !chat.general && chat.manage && (
            <button type="button" className="st-btn" onClick={() => (chat.archived === null ? setAsking('archive') : void archive(false))}>
              {chat.archived === null ? t('chat.archiveRoom') : t('chat.unarchiveRoom')}
            </button>
          )}
        </div>
      </Dialog>
      {asking === 'leave' && (
        <ConfirmDialog title={t('chat.leaveTitle', { name: `#${chat.name}` })} message={t('chat.leaveText')} action={t('chat.leaveRoom')} onConfirm={() => void leave()} onClose={() => setAsking(null)} />
      )}
      {asking === 'archive' && (
        <ConfirmDialog title={t('chat.archiveTitle', { name: `#${chat.name}` })} message={t('chat.archiveText')} action={t('chat.archiveRoom')} onConfirm={() => void archive(true)} onClose={() => setAsking(null)} />
      )}
    </>
  );
}

/** A room's name and topic, changed where they are by whoever may; who opened it and when. */
function About({ server, chat, nameOf, say }: { server: ChatServer; chat: ChatInfo; nameOf: (id: string) => string; say: (text: string) => void }) {
  const one = store.server(server.url)!;
  const [name, setName] = useState(chat.name);
  const [topic, setTopic] = useState(chat.topic);
  useEffect(() => setName(chat.name), [chat.name]);
  useEffect(() => setTopic(chat.topic), [chat.topic]);
  const can = chat.manage === true && chat.archived === null;
  const keep = async (change: { name?: string; topic?: string }) => {
    try {
      await one.changeRoom(chat.id, change);
    } catch (error) {
      const code = error instanceof ServerError ? error.code : '';
      say(code === 'name-taken' ? t('chat.nameTaken', { space: chat.spaceName }) : code === 'bad-name' ? t('chat.badName') : t('chat.notChanged'));
      setName(chat.name);
      setTopic(chat.topic);
    }
  };
  // Enter and a click away keep what was written; Esc leaves it as it was.
  const keys = (was: string, set: (value: string) => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      set(was);
      window.setTimeout(() => (event.target as HTMLInputElement).blur());
    }
  };
  return (
    <div className="ch-about">
      <p className="choices-label">{t('chat.roomName')}</p>
      {can ? (
        <label className="ch-name">
          <span className="hs">#</span>
          <input
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={keys(chat.name, setName)}
            onBlur={() => (name.trim() && name.trim() !== chat.name ? void keep({ name: name.trim() }) : setName(chat.name))}
          />
        </label>
      ) : (
        <p className="val">#{chat.name}</p>
      )}
      <p className="choices-label">{t('chat.topic')}</p>
      {can ? (
        <input
          value={topic}
          maxLength={250}
          placeholder={t('chat.noTopic')}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={keys(chat.topic, setTopic)}
          onBlur={() => topic.trim() !== chat.topic && void keep({ topic: topic.trim() })}
        />
      ) : (
        <p className={chat.topic ? 'val' : 'val none'}>{chat.topic || t('chat.noTopic')}</p>
      )}
      <p className="ch-made">
        {chat.general
          ? t('chat.generalAbout', { space: chat.spaceName })
          : t('chat.madeBy', { name: nameOf(chat.createdBy), day: new Date(chat.createdAt).toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }), space: chat.spaceName })}
      </p>
      {chat.archived !== null && <p className="ch-made">{t('chat.archivedOn', { day: new Date(chat.archived).toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }) })}</p>}
    </div>
  );
}

/** Who is in it, with who uses Scrawl now; in a private room, Add people… from its space. */
function People({ server, chat, say }: { server: ChatServer; chat: ChatInfo; say: (text: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const space = spacesOf(server).find((each) => each.id === chat.space);
  const canAdd = chat.kind === 'private' && chat.joined && chat.archived === null && !!space;
  const add = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await store.server(server.url)!.add(chat.id, picked);
      setPicked([]);
      setAdding(false);
    } catch {
      say(t('chat.notChanged'));
    }
    setBusy(false);
  };
  return (
    <div className="ch-people">
      {canAdd &&
        (adding ? (
          <div className="ch-adding">
            <PeoplePicker
              people={space!.people.filter((person) => !chat.members.some((member) => member.id === person.id))}
              picked={picked}
              onChange={setPicked}
              placeholder={t('chat.addPeople')}
              autoFocus
              active={server.active}
            />
            <button type="button" className="st-btn" onClick={() => (setAdding(false), setPicked([]))}>
              {t('dialog.cancel')}
            </button>
            <button type="button" className="st-btn go" disabled={!picked.length || busy} onClick={() => void add()}>
              {t('chat.add')}
            </button>
          </div>
        ) : (
          <button type="button" className="ch-add-people" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            {t('chat.addPeopleDots')}
          </button>
        ))}
      {chat.members.map((person) => (
        <div key={person.id} className={`ch-person${chat.gone.includes(person.id) ? ' gone' : ''}`}>
          <Face id={person.id} name={person.name} size="sm" online={server.active.includes(person.id)} />
          <span className="nm">{person.name}</span>
          {person.id === server.me && <small>{t('chat.you')}</small>}
          {chat.gone.includes(person.id) && <small>{t('chat.offServer')}</small>}
          {person.id !== server.me && server.active.includes(person.id) && <small className="act">{t('chat.active')}</small>}
        </div>
      ))}
    </div>
  );
}

/** The photos and videos shared, by month, the latest first: a photo opens large, a video goes to its message. */
function Media({ url, items, onJump }: { url: string; items: ChatShared['files']; onJump: (message: string) => void }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const images = items.filter((each) => isImage(each.file));
  if (!items.length) return <p className="ch-none">{t('chat.noMedia')}</p>;
  const months: { name: string; items: ChatShared['files'] }[] = [];
  for (const each of items) {
    const name = monthOf(each.at);
    if (months.at(-1)?.name === name) months.at(-1)!.items.push(each);
    else months.push({ name, items: [each] });
  }
  return (
    <>
      {months.map((month) => (
        <div key={month.name}>
          <p className="ch-mo">{month.name}</p>
          <div className="ch-grid">
            {month.items.map((each, i) => (
              <MediaThumb
                key={`${each.message}${i}`}
                url={url}
                file={each.file}
                title={`${each.file.name}`}
                onOpen={() => (isImage(each.file) ? setViewing(images.indexOf(each)) : onJump(each.message))}
              />
            ))}
          </div>
        </div>
      ))}
      {viewing !== null && (
        <Lightbox
          url={url}
          images={images.map((each) => each.file)}
          at={viewing}
          onClose={() => setViewing(null)}
          onShow={(index) => {
            setViewing(null);
            onJump(images[index]!.message);
          }}
        />
      )}
    </>
  );
}

function MediaThumb({ url, file, title, onOpen }: { url: string; file: ChatFile; title: string; onOpen: () => void }) {
  const shown = useFileUrl(url, file.thumb ?? (isImage(file) ? file.hash : undefined), file.thumb ? 'image/webp' : file.type);
  return (
    <button type="button" className="ch-th" title={title} onClick={onOpen}>
      {shown ? <img src={shown} alt="" draggable={false} /> : <span className="ch-wait" />}
      {isVideo(file) && (
        <>
          <span className="vd">
            <Icon name="playFill" />
          </span>
          {file.duration !== undefined && <small>{clock(file.duration)}</small>}
        </>
      )}
    </button>
  );
}
