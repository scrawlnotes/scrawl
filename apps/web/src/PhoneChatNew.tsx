import { type ChatInfo, type ChatPerson, fold, ServerError } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { type ChatLinks, Composer } from './Chat';
import { Face, namesOf, others, titleOf } from './ChatFaces';
import { peopleOf, spacesOf } from './ChatRooms';
import { type ChatServer, store } from './chatStore';
import type { MenuItem } from './dialogs';
import { Icon } from './Icon';
import { Sheet } from './sheets';

// Making a conversation on a phone, as Slack's app does (design/chat.md 25): + Add room's Create
// room, its name, then public or private, then the people to add, and Browse rooms; New message,
// its room or people picked under To, the first message written right there.

/** A direct message has nine people at most, whoever opens it among them. */
const MAX_GROUP = 9;

/** Whether a name has the words looked for: any part of it, without accents. */
const has = (name: string, words: string) => !words || fold(name).includes(words);

/** A row picked with a tap: its mark, its name, and the circle that is ticked while it is picked. */
function PickRow({ lead, name, sub, on, disabled = false, onPick }: { lead?: ReactNode; name: string; sub?: string; on: boolean; disabled?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      className={on ? 'chn-r on' : 'chn-r'}
      disabled={disabled}
      // The keyboard stays up for the next name.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
    >
      {lead && <span className="ic">{lead}</span>}
      <span className="nm">
        {name}
        {sub && <small>{sub}</small>}
      </span>
      <span className="ck">{on && <Icon name="check" />}</span>
    </button>
  );
}

const roomMark = (chat: ChatInfo) => (chat.kind === 'private' ? <Icon name="lock" /> : <span className="hs">#</span>);
const personMark = (server: ChatServer, person: ChatPerson) => <Face id={person.id} name={person.name} size="md" online={server.active.includes(person.id)} />;

/**
 * The To line: a chip for each picked, the field that finds the others, and Backspace in the empty
 * field taking the last one out; a chip tapped is taken out too.
 */
function ToLine({ label, chips, query, placeholder, onQuery, onRemoveLast, autoFocus = false }: {
  label?: string;
  chips: { key: string; lead: ReactNode; name: string; remove: () => void }[];
  query: string;
  placeholder: string;
  onQuery: (query: string) => void;
  onRemoveLast: () => void;
  autoFocus?: boolean;
}) {
  const field = useRef<HTMLInputElement>(null);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Backspace' || query || !chips.length) return;
    event.preventDefault();
    onRemoveLast();
  };
  return (
    <div className="chn-to" onClick={() => field.current?.focus()}>
      {label && <span className="lb">{label}</span>}
      {chips.map((chip) => (
        <button type="button" key={chip.key} className="chn-chip" aria-label={t('chat.removePerson', { name: chip.name })} onMouseDown={(event) => event.preventDefault()} onClick={chip.remove}>
          {chip.lead}
          <span>{chip.name}</span>
        </button>
      ))}
      <input
        ref={field}
        autoFocus={autoFocus}
        value={query}
        placeholder={chips.length ? '' : placeholder}
        aria-label={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={onKey}
      />
    </div>
  );
}

/**
 * Create a room, in Slack's three steps: its name, with its space when + was not under one; Public
 * or Private, and Create; then the people to add from its space, or Skip. The room is open after.
 */
export function PhoneNewRoom({ server, space, onDone, onClose }: { server: ChatServer; space: string | null; onDone: (chat: ChatInfo) => void; onClose: () => void }) {
  const spaces = spacesOf(server);
  const [step, setStep] = useState<'name' | 'kind' | 'people'>('name');
  const [where, setWhere] = useState(space ?? spaces[0]?.id ?? '');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'public' | 'private'>('public');
  const [made, setMade] = useState<ChatInfo | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = spaces.find((each) => each.id === where);
  const people = (chosen?.people ?? []).filter((person) => person.id !== server.me);
  const one = store.server(server.url);

  const next = () => {
    if (!name.trim() || !chosen) return;
    setFailed(null);
    setStep('kind');
  };
  const create = async () => {
    if (!chosen || !one || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const room = await one.openRoom({ space: chosen.id, name: name.trim(), kind });
      setBusy(false);
      // Alone in its space, there is no one to add.
      if (!people.length) return onDone(room);
      setMade(room);
      setStep('people');
    } catch (error) {
      const code = error instanceof ServerError ? error.code : '';
      setBusy(false);
      if (code === 'name-taken' || code === 'bad-name') {
        setFailed(code === 'name-taken' ? t('chat.nameTaken', { space: chosen.name }) : t('chat.badName'));
        setStep('name');
      } else setFailed(t('chat.notMade'));
    }
  };
  const add = async () => {
    if (!made || !one || !picked.length || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await one.add(made.id, picked);
      onDone(made);
    } catch {
      setFailed(t('chat.notChanged'));
      setBusy(false);
    }
  };
  // Once it is made, closing opens it.
  const close = made ? () => onDone(made) : onClose;
  const words = fold(query.trim());
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? '';

  return (
    <Sheet label={t('chat.createARoom')} className="chn" onClose={close} onEscape={step === 'kind' ? () => setStep('name') : close}>
      {step === 'name' && (
        <>
          <div className="mb-sh three">
            <button type="button" className="cancel" onClick={onClose}>
              {t('dialog.cancel')}
            </button>
            <b>{t('chat.createARoom')}</b>
            <button type="button" className="ok" disabled={!name.trim() || !chosen} onClick={next}>
              {t('chat.next')}
            </button>
          </div>
          <div className="chn-body mb-scroll">
            {!space && spaces.length > 1 && (
              <>
                <p className="chn-lb">{t('chat.space')}</p>
                <div className="chn-group" role="radiogroup">
                  {spaces.map((each) => (
                    <PickRow key={each.id} name={each.name} on={each.id === where} onPick={() => (setWhere(each.id), setFailed(null))} />
                  ))}
                </div>
              </>
            )}
            <p className="chn-lb">{t('chat.roomName')}</p>
            <label className={failed ? 'chn-name bad' : 'chn-name'}>
              <span className="hs">#</span>
              <input
                autoFocus
                maxLength={40}
                value={name}
                enterKeyHint="next"
                autoCapitalize="off"
                autoCorrect="off"
                aria-label={t('chat.roomName')}
                onChange={(event) => (setName(event.target.value), setFailed(null))}
                onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), next())}
              />
            </label>
            {failed && <p className="chn-fail">{failed}</p>}
            <p className="chn-note">
              <Icon name="chat" />
              <span>{t('chat.roomAbout')}</span>
            </p>
          </div>
        </>
      )}
      {step === 'kind' && (
        <>
          <div className="mb-sh three">
            <button type="button" className="cancel back" onClick={() => setStep('name')}>
              <Icon name="back" />
              <span>{t('dialog.back')}</span>
            </button>
            <b>{t('chat.visibility')}</b>
            <button type="button" className="ok" disabled={busy} onClick={() => void create()}>
              {t('chat.create')}
            </button>
          </div>
          <div className="chn-body mb-scroll">
            <p className="chn-lb">
              <span className="hs">#</span>
              {name.trim()}
              {spaces.length > 1 && chosen && <small> · {chosen.name}</small>}
            </p>
            <div className="chn-group" role="radiogroup">
              {(['public', 'private'] as const).map((each) => (
                <button type="button" role="radio" aria-checked={kind === each} key={each} className={kind === each ? 'chn-r kind on' : 'chn-r kind'} onClick={() => setKind(each)}>
                  <span className="ic">{each === 'public' ? <span className="hs">#</span> : <Icon name="lock" />}</span>
                  <span className="nm">
                    {each === 'public' ? t('chat.public') : t('chat.private')}
                    <small>{each === 'public' ? t('chat.publicAbout', { space: chosen?.name ?? '' }) : t('chat.privateAbout')}</small>
                  </span>
                  <span className="ck">{kind === each && <Icon name="check" />}</span>
                </button>
              ))}
            </div>
            {failed && <p className="chn-fail">{failed}</p>}
          </div>
        </>
      )}
      {step === 'people' && made && (
        <>
          <div className="mb-sh three">
            <button type="button" className="cancel" onClick={() => onDone(made)}>
              {t('chat.skip')}
            </button>
            <b>{t('chat.addPeople')}</b>
            <button type="button" className="ok" disabled={!picked.length || busy} onClick={() => void add()}>
              {t('chat.add')}
            </button>
          </div>
          <ToLine
            chips={picked.map((id) => ({ key: id, lead: <Face id={id} name={nameOf(id)} size="xs" />, name: nameOf(id), remove: () => setPicked(picked.filter((each) => each !== id)) }))}
            query={query}
            placeholder={t('chat.findPerson')}
            onQuery={setQuery}
            onRemoveLast={() => setPicked(picked.slice(0, -1))}
          />
          {failed && <p className="chn-fail">{failed}</p>}
          <div className="chn-list mb-scroll">
            {people
              .filter((person) => has(person.name, words))
              .map((person) => (
                <PickRow
                  key={person.id}
                  lead={personMark(server, person)}
                  name={person.name}
                  on={picked.includes(person.id)}
                  onPick={() => {
                    setPicked(picked.includes(person.id) ? picked.filter((each) => each !== person.id) : [...picked, person.id]);
                    setQuery('');
                  }}
                />
              ))}
            {words && !people.some((person) => has(person.name, words)) && <p className="chn-none">{t('chat.noOneFound')}</p>}
          </div>
        </>
      )}
    </Sheet>
  );
}

/**
 * Browse rooms: a space's rooms, found by name, each with how many are in it and its topic; one
 * tapped opens, to read and join. The archived ones are under them.
 */
export function PhoneBrowseRooms({ server, space, onOpen, onClose }: { server: ChatServer; space: string | null; onOpen: (chat: ChatInfo) => void; onClose: () => void }) {
  const spaces = spacesOf(server);
  const [where, setWhere] = useState(space ?? spaces[0]?.id ?? '');
  const [rooms, setRooms] = useState<ChatInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
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
  const words = fold(query.trim());
  const shown = (rooms ?? []).filter((room) => has(room.name, words) || has(room.topic, words)).sort((a, b) => a.name.localeCompare(b.name, locale()));
  const open = shown.filter((room) => room.archived === null);
  const archived = shown.filter((room) => room.archived !== null);
  const row = (room: ChatInfo) => (
    <button type="button" key={room.id} className={room.archived !== null ? 'chn-r room old' : 'chn-r room'} onClick={() => onOpen(room)}>
      <span className="ic">{roomMark(room)}</span>
      <span className="nm">
        {room.name}
        <small>{[t('count.people', { count: room.members.length }), room.topic].filter(Boolean).join(' · ')}</small>
      </span>
      {room.joined && room.archived === null && <span className="in">{t('chat.joined')}</span>}
    </button>
  );
  return (
    <Sheet label={t('chat.browseRooms')} className="chn" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('chat.browseRooms')}</b>
        <span />
      </div>
      {spaces.length > 1 && (
        <div className="chn-spaces" role="tablist" aria-label={t('chat.space')}>
          {spaces.map((each) => (
            <button type="button" role="tab" key={each.id} aria-selected={each.id === where} onClick={() => setWhere(each.id)}>
              {each.name}
            </button>
          ))}
        </div>
      )}
      <label className="mb-searchbar chn-find">
        <Icon name="search" />
        <input type="search" placeholder={t('chat.findRoom')} value={query} enterKeyHint="search" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="chn-list mb-scroll">
        {failed ? (
          <p className="chn-none">{t('chat.roomsFailed')}</p>
        ) : rooms === null ? (
          <p className="chn-none">{t('chat.loading')}</p>
        ) : (
          <>
            {open.map(row)}
            {open.length === 0 && <p className="chn-none">{words ? t('chat.noRoomFound') : t('chat.noRooms')}</p>}
            {archived.length > 0 && <p className="chn-lb">{t('chat.archived')}</p>}
            {archived.map(row)}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Whether two lists hold the same people. */
const same = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * New message, as Slack's: To, the rooms this person is in and the people they share a space with,
 * the latest written to first; picked, a chip each. A room is written to alone; people, up to
 * eight, make a direct message, and the rooms leave the list. The box at the foot writes the first
 * message, and Send opens the conversation with it.
 */
export function PhoneNewMessage({ server, menu, links, onDone, onClose }: {
  server: ChatServer;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  links: ChatLinks;
  onDone: (chat: ChatInfo) => void;
  onClose: () => void;
}) {
  const [room, setRoom] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const addFiles = useRef<((files: File[]) => void) | null>(null);
  const people = peopleOf(server);
  const rooms = server.chats.filter((chat) => chat.kind !== 'direct' && chat.joined && !chat.hidden && chat.archived === null);
  const directWith = (ids: string[]) => server.chats.find((chat) => chat.kind === 'direct' && same(others(chat, server.me).map((person) => person.id), ids));
  const full = picked.length >= MAX_GROUP - 1;
  const words = fold(query.trim());
  const manySpaces = new Set(rooms.map((chat) => chat.space)).size > 1;

  // The latest written to first: a room by its last message, a person by the last one between the two.
  const rows = [
    ...(picked.length ? [] : rooms.map((chat) => ({ key: chat.id, name: chat.name, at: chat.last?.at ?? chat.createdAt, room: chat, person: null }))),
    ...people.map((person) => ({ key: person.id, name: person.name, at: directWith([person.id])?.last?.at ?? 0, room: null, person })),
  ]
    .filter((each) => has(each.name, words))
    .sort((a, b) => b.at - a.at || a.name.localeCompare(b.name, locale()));

  const pickRoom = (id: string) => {
    setRoom(room === id ? null : id);
    setPicked([]);
    setQuery('');
  };
  const pickPerson = (id: string) => {
    setRoom(null);
    setPicked(picked.includes(id) ? picked.filter((each) => each !== id) : full ? picked : [...picked, id]);
    setQuery('');
  };

  const roomChat = room ? rooms.find((chat) => chat.id === room) : undefined;
  const chosen = picked.map((id) => people.find((person) => person.id === id)).filter((person): person is ChatPerson => person !== undefined);
  const existing = picked.length ? directWith(picked) : undefined;
  // What the box writes to: the room, the direct message there is with these people, or the one to be made.
  const to: ChatInfo = roomChat ?? existing ?? {
    id: '',
    kind: 'direct',
    space: null,
    spaceName: '',
    name: '',
    topic: '',
    general: false,
    createdBy: server.me,
    createdAt: 0,
    archived: null,
    members: chosen,
    gone: [],
    lastSeq: 0,
    last: null,
    joined: true,
    readSeq: 0,
    notify: 'all',
    hidden: false,
    unread: 0,
    alerts: 0,
    reads: null,
  };
  const target = roomChat ? `room ${roomChat.id}` : picked.length ? `people ${picked.join(' ')}` : 'none';
  const placeholder = roomChat ? t('chat.messageTo', { name: `#${roomChat.name}` }) : picked.length ? t('chat.messageTo', { name: titleOf(to, server.me) }) : t('chat.writeMessage');
  // A message to a room, or to people already written to, goes as one in a conversation does, kept until the server has it.
  const ready = roomChat ?? existing;
  const make = ready ? async () => ready : picked.length ? () => store.server(server.url)!.direct(picked) : null;

  const chips = roomChat
    ? [{ key: roomChat.id, lead: roomMark(roomChat), name: roomChat.name, remove: () => setRoom(null) }]
    : chosen.map((person) => ({ key: person.id, lead: <Face id={person.id} name={person.name} size="xs" />, name: person.name, remove: () => pickPerson(person.id) }));

  return (
    <Sheet label={t('chat.newMessage')} className="chn chn-msg" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('chat.newMessage')}</b>
        <span />
      </div>
      <ToLine
        label={t('chat.toLabel')}
        chips={chips}
        query={query}
        placeholder={t('chat.findRoomOrPerson')}
        onQuery={setQuery}
        onRemoveLast={() => (roomChat ? setRoom(null) : setPicked(picked.slice(0, -1)))}
        autoFocus
      />
      <div className="chn-list mb-scroll">
        {rows.map((each) =>
          each.room ? (
            // With more than one space, a room's space tells the generals apart.
            <PickRow key={each.key} lead={roomMark(each.room)} name={each.name} sub={manySpaces ? each.room.spaceName : undefined} on={room === each.room.id} onPick={() => pickRoom(each.room.id)} />
          ) : (
            <PickRow
              key={each.key}
              lead={personMark(server, each.person!)}
              name={each.name}
              on={picked.includes(each.key)}
              disabled={full && !picked.includes(each.key)}
              onPick={() => pickPerson(each.key)}
            />
          ),
        )}
        {rows.length === 0 && <p className="chn-none">{words ? t('chat.nothingFound') : t('chat.aloneSoFar')}</p>}
        {full && <p className="chn-none">{t('chat.groupFull', { count: MAX_GROUP })}</p>}
      </div>
      <Composer
        key={target}
        server={server}
        chat={to}
        replyTo={null}
        nameOf={namesOf(server)}
        menu={menu}
        links={links}
        dropping={false}
        addFiles={addFiles}
        onCancelReply={() => undefined}
        phone
        fresh={{ placeholder, make, onSent: onDone }}
      />
    </Sheet>
  );
}
