import { dayOf, type Me, RemoteSignedOut, type ServerAccountInfo, type ServerAgent, type ServerLink, type ServerMember, type ServerPerson, type ServerSharedSpace, type ServerSpace } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { Fragment, type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, ContextMenu, Dialog, type MenuItem } from './dialogs';
import { Icon } from './Icon';
import { writeClipboard } from './Keys';
import { serverFailure } from './ServerConnect';
import { hostOf, type KnownServer, knownServers, noteRole, serverAccount, useKnownServers } from './servers';
import type { SpaceView } from './session';
import { ActionSheet } from './sheets';
import { ServerIcon } from './SyncViews';
import { dueLabel } from './Tasks';

// The people of a Scrawl server, after the Server part of design/mockups.html. A space on a
// server lists who can open it, its managers marked; its managers invite with a link for one
// person and take people out. The server's page, from Settings › Spaces › Servers, has the account
// this device is signed in with and Sign out; its owner and admins see everyone with an account
// there, make admins (the owner), give a link for a new password and take people off. On a
// computer in Settings, on a phone as pages and sheets. No mail is sent: links go by hand.

/** When a link runs out, as its window says it: `Oct 22`. */
const dayText = (at: number) => new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

/** When someone was last seen: today, yesterday, a day. */
const seenText = (seen: number | null) => (seen === null ? '' : dueLabel(dayOf(new Date(seen)), dayOf(new Date())));

const initial = (name: string, email: string) => (name || email || '?').slice(0, 1).toUpperCase();

/** A role on a server, as a word. */
export const ROLE_WORD = { owner: 'server.roleOwner', admin: 'server.roleAdmin', member: 'server.roleMember' } as const;

/** Under a server's name: this person's role there, as the server said it last. */
export function YouAre({ url }: { url: string }) {
  const role = useKnownServers().find((each) => each.url === url)?.role ?? 'member';
  return <>{t(role === 'owner' ? 'server.youOwner' : role === 'admin' ? 'server.youAdmin' : 'server.youMember')}</>;
}

/**
 * Whether this person renames a space, and its new name sent to its server first where it is on
 * one. On a server its managers rename it, and the owner and admins who are in it; the server
 * keeps the name for everyone in it. A space in a folder of the cloud or of the device has no
 * roles: whoever has it renames it, as the personal space (null) is its person's.
 */
export function useSpaceRename(space: SpaceView | null) {
  const place = space?.source?.provider === 'server' ? space.source.place : null;
  const url = place?.url ?? '';
  const id = place?.space ?? '';
  const [manages, setManages] = useState(!url);
  useEffect(() => {
    if (!url) {
      setManages(true);
      return;
    }
    let live = true;
    setManages(false);
    serverAccount(url)
      .spaces()
      .then(
        (list) => {
          const role = list.find((each) => each.id === id)?.role;
          const server = knownServers().find((each) => each.url === url)?.role ?? 'member';
          if (live) setManages(role === 'manager' || (role !== undefined && server !== 'member'));
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [url, id]);
  const onServer = async (name: string) => {
    if (!url) return;
    try {
      await serverAccount(url).renameSpace(id, name);
    } catch (failure) {
      throw new Error(serverFailure(failure, hostOf(url)));
    }
  };
  return { canRename: manages, onServer };
}

/** A space on a server, for its page: who is in it, whether this person manages it, and what managing it does. */
export function useServerSpace(space: SpaceView, me: Me | null) {
  const url = space.source?.place.url ?? '';
  const id = space.source?.place.space ?? '';
  const host = hostOf(url);
  const known = knownServers().find((each) => each.url === url);
  const [members, setMembers] = useState<ServerMember[] | null>(null);
  const [role, setRole] = useState<ServerAccountInfo['role']>(known?.role ?? 'member');
  const [meId, setMeId] = useState(known?.id ?? me?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  // Signed out of the server on this device: who is in the space is not asked until signing in again.
  const [signedOut, setSignedOut] = useState(false);
  const load = useCallback(async () => {
    try {
      const account = serverAccount(url);
      const [list, mine] = await Promise.all([account.members(id), account.me()]);
      setMembers(list);
      setRole(mine.role);
      noteRole(url, mine.role);
      setMeId(mine.id);
      setError(null);
      setSignedOut(false);
    } catch (failure) {
      setMembers((now) => now ?? []);
      if (failure instanceof RemoteSignedOut) setSignedOut(true);
      else setError(serverFailure(failure, host));
    }
  }, [url, id, host]);
  useEffect(() => {
    void load();
  }, [load]);
  const mine = members?.find((member) => member.id === meId);
  const manages = !!mine && (mine.role === 'manager' || role !== 'member');
  const act = async (run: () => Promise<unknown>) => {
    try {
      await run();
      await load();
    } catch (failure) {
      setError(serverFailure(failure, host));
    }
  };
  return {
    host,
    members,
    meId,
    role,
    manages,
    signedOut,
    error,
    setMemberRole: (member: ServerMember, to: ServerMember['role']) => act(() => serverAccount(url).setMemberRole(id, member.id, to)),
    remove: (member: ServerMember) => act(() => serverAccount(url).removeMember(id, member.id)),
    fail: (failure: unknown) => setError(serverFailure(failure, host)),
    invite: () => serverAccount(url).invite(id),
  };
}

/** A link a server made, to send by hand: copied with a button; a new one made in its place when asked. */
export function LinkDialog({ title, about, note, first, make, onClose }: {
  title: string;
  /** What the link does, told with the day it runs out. */
  about: (day: string) => string;
  note?: string;
  /** A link made already, shown first; otherwise one is made as the window opens. */
  first?: ServerLink;
  make: () => Promise<ServerLink>;
  onClose: () => void;
}) {
  const [link, setLink] = useState<ServerLink | null>(first ?? null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The link is made once as the window opens, and again with New link; not on every render.
  const maker = useRef(make);
  const made = useRef(!!first);
  const fresh = useCallback(() => {
    setCopied(false);
    setError(null);
    maker.current().then(setLink, (failure: unknown) => setError(serverFailure(failure, '')));
  }, []);
  useEffect(() => {
    if (made.current) return;
    made.current = true;
    fresh();
  }, [fresh]);
  const copy = () => {
    if (!link) return;
    void writeClipboard(link.link).then(setCopied);
  };
  return (
    <Dialog label={title} className="srv-link" onClose={onClose}>
      <h2>{title}</h2>
      {error ? (
        <p className="srv-err" role="alert">
          <Icon name="warn" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="confirm">{link ? about(dayText(link.expires)) : t('server.making')}</p>
      )}
      <div className="srv-copy">
        <input readOnly value={link?.link ?? ''} aria-label={title} onFocus={(event) => event.target.select()} />
        <button type="button" className="go" disabled={!link} onClick={copy}>
          {copied ? t('server.copied') : t('server.copy')}
        </button>
      </div>
      <div className="dialog-actions">
        {note && <span className="srv-note">{note}</span>}
        <button type="button" className="again" onClick={fresh}>
          {t('server.newLink')}
        </button>
        <button type="button" className="done" onClick={onClose}>
          {t('server.done')}
        </button>
      </div>
    </Dialog>
  );
}

/** Asks before someone is taken out, with the app's own question: a window, an action sheet on a phone. */
function AskRemove({ title, message, onConfirm, onClose }: { title: string; message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <ConfirmDialog
      title={title}
      message={message}
      action={t('server.remove')}
      danger
      onConfirm={() => {
        onClose();
        onConfirm();
      }}
      onClose={onClose}
    />
  );
}

/**
 * What a manager does to someone in the space: make them a manager or a member again, take them
 * out. The server's owner and admins are taken out only by the owner or an admin.
 */
function memberItems(s: ReturnType<typeof useServerSpace>, member: ServerMember, space: string, onRemove: () => void): MenuItem[] {
  const items: MenuItem[] = [
    member.role === 'manager'
      ? { label: t('server.makeMember'), icon: 'person', run: () => void s.setMemberRole(member, 'member') }
      : { label: t('server.makeManager'), icon: 'person', run: () => void s.setMemberRole(member, 'manager') },
  ];
  if (s.role !== 'member' || member.serverRole === 'member') items.push({ label: t('server.removeFromSpace', { space }), icon: 'trash', danger: true, apart: true, run: onRemove });
  return items;
}

/** A space on a server, People on its page on a computer: who can open it, managers marked, Invite… and each row's menu for its managers. */
export function ServerMembers({ space, me }: { space: SpaceView; me: Me | null }) {
  const s = useServerSpace(space, me);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; member: ServerMember } | null>(null);
  const [removing, setRemoving] = useState<ServerMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const open = (event: MouseEvent, member: ServerMember) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, member });
  };
  return (
    <>
      <div className="st-acts srv-people">
        <span className="st-label">{t('settings.people')}</span>
        {s.manages && (
          <button type="button" className="primary right" onClick={() => setInviting(true)}>
            <Icon name="plus" />
            {t('server.invite')}
          </button>
        )}
      </div>
      <p className="st-note">{s.signedOut ? t('server.membersSignedOut', { host: s.host }) : s.manages ? t('server.membersAbout') : t('server.membersAboutMember')}</p>
      {s.error && (
        <p className="srv-err" role="alert">
          <Icon name="warn" />
          <span>{s.error}</span>
        </p>
      )}
      {s.members && s.members.length > 0 && (
        <div className="st-list">
          {s.members.map((member) => {
            const you = member.id === s.meId;
            const offered = s.manages && !you;
            return (
              <div key={member.id} className={`st-li one${menu?.member.id === member.id ? ' menu-on' : ''}`} {...(offered && { onContextMenu: (event: MouseEvent) => open(event, member) })}>
                <span className="who" aria-hidden="true">
                  {initial(member.name, member.email)}
                </span>
                <span className="nm">
                  <b>
                    {member.name || member.email}
                    {you && <small>{t('settings.itsYou')}</small>}
                    {member.role === 'manager' && <span className="srv-role">{t('server.manager')}</span>}
                  </b>
                  <small>{member.email}</small>
                </span>
                <span className="r">{seenText(member.seen)}</span>
                {offered && (
                  <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => open(event, member)}>
                    ···
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {menu && <ContextMenu at={menu.at} items={memberItems(s, menu.member, space.name, () => setRemoving(menu.member))} onClose={() => setMenu(null)} />}
      {removing && (
        <AskRemove
          title={t('server.removeTitle', { name: removing.name || removing.email, space: space.name })}
          message={t('server.removeText', { name: removing.name || removing.email, space: space.name })}
          onConfirm={() => void s.remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {inviting && (
        <LinkDialog
          title={t('server.inviteTitle', { space: space.name })}
          about={(day) => t('server.inviteText', { day })}
          note={t('server.inviteEach')}
          make={s.invite}
          onClose={() => setInviting(false)}
        />
      )}
    </>
  );
}

/** A space on a server, People on its page on a phone: rows, a tap on one for its manager's sheet, Invite… to the phone's share sheet. */
export function PhoneServerMembers({ space, me }: { space: SpaceView; me: Me | null }) {
  const s = useServerSpace(space, me);
  const [held, setHeld] = useState<ServerMember | null>(null);
  const [removing, setRemoving] = useState<ServerMember | null>(null);
  const [linking, setLinking] = useState<ServerLink | null>(null);
  // The phone's own share sheet takes the link; where there is none, or it would not open, the link shows in a sheet to copy.
  const invite = async () => {
    let made: ServerLink;
    try {
      made = await s.invite();
    } catch (failure) {
      s.fail(failure);
      return;
    }
    try {
      if (!navigator.share) throw new Error('No share sheet');
      await navigator.share({ title: t('server.shareText', { space: space.name }), text: t('server.shareText', { space: space.name }), url: made.link });
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      setLinking(made);
    }
  };
  return (
    <>
      <div className="mb-sec">
        <span>{t('settings.people')}</span>
      </div>
      {s.error && <p className="mb-p err">{s.error}</p>}
      <div className="mb-list">
        {(s.members ?? []).map((member) => {
          const you = member.id === s.meId;
          const row = (
            <>
              <span className="who" aria-hidden="true">
                {initial(member.name, member.email)}
              </span>
              <span className="tx">
                <b>
                  {member.name || member.email}
                  {you && <small className="you"> · {t('settings.itsYou')}</small>}
                </b>
                <small>{member.email}</small>
              </span>
              {member.role === 'manager' && <span className="ct">{t('server.manager')}</span>}
            </>
          );
          return s.manages && !you ? (
            <button key={member.id} type="button" className="mb-row person" onClick={() => setHeld(member)}>
              {row}
            </button>
          ) : (
            <div key={member.id} className="mb-row person">
              {row}
            </div>
          );
        })}
        {s.manages && (
          <button type="button" className="mb-row srv-new" onClick={() => void invite()}>
            <Icon name="plus" />
            <span className="tx">
              <b>{t('server.invite')}</b>
            </span>
          </button>
        )}
      </div>
      <p className="mb-p">{s.signedOut ? t('server.membersSignedOut', { host: s.host }) : s.manages ? t('server.membersAboutPhone') : t('server.membersAboutMember')}</p>
      {held && (
        <ActionSheet
          head={{ icon: 'person', title: held.name || held.email, sub: `${held.email} · ${t(held.role === 'manager' ? 'server.managerOf' : 'server.memberOf', { space: space.name })}` }}
          items={memberItems(s, held, space.name, () => setRemoving(held))}
          onClose={() => setHeld(null)}
        />
      )}
      {removing && (
        <AskRemove
          title={t('server.removeTitle', { name: removing.name || removing.email, space: space.name })}
          message={t('server.removeText', { name: removing.name || removing.email, space: space.name })}
          onConfirm={() => void s.remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {linking && (
        <LinkDialog
          title={t('server.inviteTitle', { space: space.name })}
          about={(day) => t('server.inviteText', { day })}
          note={t('server.inviteEach')}
          first={linking}
          make={s.invite}
          onClose={() => setLinking(null)}
        />
      )}
    </>
  );
}

/** A server's page, for this device's account on it and, for its owner and admins, the people there. */
function useServerPage(server: KnownServer) {
  const host = hostOf(server.url);
  const [me, setMe] = useState<ServerAccountInfo | null>(null);
  const [people, setPeople] = useState<ServerPerson[] | null>(null);
  const [agents, setAgents] = useState<ServerAgent[] | null>(null);
  // The shared spaces the account is in; and for the owner and admins every shared space with who is
  // in it, null from a server from before that tells it.
  const [spaces, setSpaces] = useState<ServerSpace[] | null>(null);
  const [shared, setShared] = useState<ServerSharedSpace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const account = serverAccount(server.url);
      const mine = await account.me();
      setMe(mine);
      noteRole(server.url, mine.role);
      setAgents(await account.agents().catch(() => []));
      setSpaces((await account.spaces()).filter((space) => !space.personal));
      setShared(mine.role === 'member' ? null : await account.sharedSpaces().catch(() => null));
      setPeople(mine.role === 'member' ? [] : await account.people());
      setError(null);
    } catch (failure) {
      setPeople((now) => now ?? []);
      setError(failure instanceof RemoteSignedOut ? t('server.signInAgain', { host }) : serverFailure(failure, host));
    }
  }, [server.url, host]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (run: () => Promise<unknown>) => {
    try {
      await run();
      await load();
    } catch (failure) {
      setError(serverFailure(failure, host));
    }
  };
  const role = me?.role ?? server.role;
  const inIt = new Set((spaces ?? []).map((space) => space.id));
  return {
    host,
    me,
    role,
    people,
    agents,
    error,
    /** The spaces the page lists: every shared one for the owner and admins, else those the account is in; null while asked. */
    listed:
      spaces === null
        ? null
        : shared
          ? shared.map((space) => ({ id: space.id, name: space.name, people: space.people, mine: inIt.has(space.id) }))
          : spaces.map((space) => ({ id: space.id, name: space.name, people: space.people, mine: true })),
    /** The names of the shared spaces someone is in, for the owner and admins. */
    spacesOf: (person: string) => (shared ?? []).filter((space) => space.members.includes(person)).map((space) => space.name || t('settings.unnamed')),
    everySpace: shared !== null,
    setRole: (person: ServerPerson, to: 'admin' | 'member') => act(() => serverAccount(server.url).setRole(person.id, to)),
    remove: (person: ServerPerson) => act(() => serverAccount(server.url).removePerson(person.id)),
    passwordLink: (person: ServerPerson) => () => serverAccount(server.url).passwordLink(person.id),
  };
}

/** Whether this person may act on someone on the server: the owner on everyone else, an admin on its members. */
const reaches = (p: ReturnType<typeof useServerPage>, person: ServerPerson) => person.id !== p.me?.id && (p.role === 'owner' || (p.role === 'admin' && person.role === 'member'));

/** What the owner or an admin does to someone on the server: make an admin (the owner), a link for a new password, take them off. */
function personItems(p: ReturnType<typeof useServerPage>, person: ServerPerson, onLink: () => void, onRemove: () => void): MenuItem[] {
  const items: MenuItem[] = [];
  if (p.role === 'owner' && person.role !== 'owner') {
    items.push(
      person.role === 'admin'
        ? { label: t('server.makeMember'), icon: 'person', run: () => void p.setRole(person, 'member') }
        : { label: t('server.makeAdmin'), icon: 'person', run: () => void p.setRole(person, 'admin') },
    );
  }
  items.push({ label: t('server.passwordLink'), icon: 'keys', run: onLink });
  if (person.role !== 'owner') items.push({ label: t('server.removeFromServer'), icon: 'trash', danger: true, apart: true, run: onRemove });
  return items;
}

/** The server's page in Settings on a computer. */
/** What the agents row says: who is connected, by name. */
const agentNames = (agents: ServerAgent[] | null) => (agents === null ? '' : agents.length === 0 ? t('agents.noneConnected') : agents.map((agent) => agent.client || t('agents.unnamedAgent')).join(', '));

/**
 * The spaces of a server on its page: each with how many people are in it and whether it is on this
 * device, with Add for one that is not and that the account is in. For the owner and admins every
 * shared space, those they are not in said so; personal spaces are only their owners'.
 */
function ServerSpaces({ p, onDevice, onAdd }: { p: ReturnType<typeof useServerPage>; onDevice: string[]; onAdd?: (space: string) => void }) {
  if (!p.listed || p.listed.length === 0) return null;
  return (
    <>
      <span className="st-label">{t('server.spacesOn')}</span>
      <p className="st-note">{t(p.everySpace ? 'server.spacesAboutAll' : 'server.spacesAboutMine')}</p>
      <div className="st-list">
        {p.listed.map((space) => {
          const here = onDevice.includes(space.id);
          return (
            <div key={space.id} className="st-li one">
              <span className="srv-sp" aria-hidden="true">
                <Icon name="space" />
              </span>
              <span className="nm">
                <b>{space.name || t('settings.unnamed')}</b>
                <small>
                  {t('count.people', { count: space.people })}
                  {!space.mine && ` · ${t('server.notInIt')}`}
                </small>
              </span>
              {here ? (
                <span className="r">{t('server.onThisDevice')}</span>
              ) : space.mine && onAdd ? (
                <button type="button" className="srv-add" onClick={() => onAdd(space.id)}>
                  {t('settings.add')}
                </button>
              ) : (
                <span className="r" />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ServerPage({ server, onDevice, onAdd, onBack, onSignOut, onAgents }: {
  server: KnownServer;
  /** The ids of the spaces on this device. */
  onDevice: string[];
  /** Adds a space of the server that the account is in to this device. */
  onAdd: (space: string) => void;
  onBack: () => void;
  onSignOut: () => void;
  onAgents?: () => void;
}) {
  const p = useServerPage(server);
  // The people whose spaces are shown under them, by id.
  const [opened, setOpened] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; person: ServerPerson } | null>(null);
  const [removing, setRemoving] = useState<ServerPerson | null>(null);
  const [linking, setLinking] = useState<ServerPerson | null>(null);
  const open = (event: MouseEvent, person: ServerPerson) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, person });
  };
  return (
    <>
      <button type="button" className="st-back" onClick={onBack}>
        <Icon name="chevron" />
        <span>{t('settings.backToSpaces')}</span>
      </button>
      <div className="st-space srv-page">
        <div className="top">
          <ServerIcon />
          <b>{p.host}</b>
          <small>{t(p.role === 'owner' ? 'server.youOwner' : p.role === 'admin' ? 'server.youAdmin' : 'server.youMember')}</small>
        </div>
        <div className="st-row">
          <span className="fl">{t('server.account')}</span>
          <span className="path plain">{server.email}</span>
          <button type="button" onClick={onSignOut}>
            {t('server.signOut')}
          </button>
        </div>
        <div className="st-row">
          <span className="fl">{t('agents.row')}</span>
          <span className="path plain">{agentNames(p.agents)}</span>
          {onAgents ? (
            <button type="button" onClick={onAgents}>
              {t('agents.manage')}
            </button>
          ) : (
            <span />
          )}
        </div>
        <p className="st-note">{t('server.signOutText')}</p>
      </div>
      {p.error && (
        <p className="srv-err" role="alert">
          <Icon name="warn" />
          <span>{p.error}</span>
        </p>
      )}
      <ServerSpaces p={p} onDevice={onDevice} onAdd={onAdd} />
      {p.role !== 'member' && p.people && p.people.length > 0 && (
        <>
          <span className="st-label">{t('server.peopleOn')}</span>
          <p className="st-note">{t('server.peopleAbout')}</p>
          <div className="st-list">
            {p.people.map((person) => {
              const you = person.id === p.me?.id;
              const theirs = p.everySpace && person.spaces > 0 ? p.spacesOf(person.id) : null;
              const shown = theirs !== null && opened.includes(person.id);
              return (
                <Fragment key={person.id}>
                <div className={`st-li one${menu?.person.id === person.id ? ' menu-on' : ''}`} {...(reaches(p, person) && { onContextMenu: (event: MouseEvent) => open(event, person) })}>
                  <span className="who" aria-hidden="true">
                    {initial(person.name, person.email)}
                  </span>
                  <span className="nm">
                    <b>
                      {person.name || person.email}
                      {you && <small>{t('settings.itsYou')}</small>}
                      <span className="srv-role">{t(ROLE_WORD[person.role])}</span>
                    </b>
                    <small>{person.email}</small>
                  </span>
                  {theirs ? (
                    <button
                      type="button"
                      className="r srv-count"
                      aria-expanded={shown}
                      onClick={() => setOpened((now) => (now.includes(person.id) ? now.filter((id) => id !== person.id) : [...now, person.id]))}
                    >
                      {t('server.spacesCount', { count: person.spaces })}
                      <Icon name="chevron" />
                    </button>
                  ) : (
                    <span className="r">{t('server.spacesCount', { count: person.spaces })}</span>
                  )}
                  {reaches(p, person) && (
                    <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => open(event, person)}>
                      ···
                    </button>
                  )}
                </div>
                {shown && <div className="srv-theirs">{theirs.join(' · ')}</div>}
                </Fragment>
              );
            })}
          </div>
          <p className="st-note">{t('server.removePersonNote')}</p>
        </>
      )}
      {menu && (
        <ContextMenu
          at={menu.at}
          items={personItems(
            p,
            menu.person,
            () => setLinking(menu.person),
            () => setRemoving(menu.person),
          )}
          onClose={() => setMenu(null)}
        />
      )}
      {removing && (
        <AskRemove
          title={t('server.removePersonTitle', { name: removing.name || removing.email, host: p.host })}
          message={t('server.removePersonText', { name: removing.name || removing.email })}
          onConfirm={() => void p.remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {linking && (
        <LinkDialog
          title={t('server.passwordTitle', { name: linking.name || linking.email })}
          about={(day) => t('server.passwordText', { name: linking.name || linking.email, day })}
          make={p.passwordLink(linking)}
          onClose={() => setLinking(null)}
        />
      )}
    </>
  );
}

/** The server's page on a phone: the account and Sign out, and for its owner and admins the people, each with a sheet. */
export function PhoneServerPage({ server, onDevice, onSignOut, onAgents }: { server: KnownServer; onDevice: string[]; onSignOut: () => void; onAgents?: () => void }) {
  const p = useServerPage(server);
  const [held, setHeld] = useState<ServerPerson | null>(null);
  const [removing, setRemoving] = useState<ServerPerson | null>(null);
  const [linking, setLinking] = useState<ServerPerson | null>(null);
  return (
    <>
      <div className="mb-form">
        <div className="mb-group">
          <div className="mb-fr">
            <span className="fl">{t('server.account')}</span>
            <span className="in">{server.email}</span>
          </div>
          {onAgents && (
            <button type="button" className="mb-fr" onClick={onAgents}>
              <span className="fl">{t('agents.row')}</span>
              <span className="in">{agentNames(p.agents)}</span>
              <Icon name="chevron" />
            </button>
          )}
        </div>
      </div>
      {p.error && <p className="mb-p err">{p.error}</p>}
      {p.listed && p.listed.length > 0 && (
        <>
          <div className="mb-sec">
            <span>{t('server.spacesOn')}</span>
          </div>
          <div className="mb-list">
            {p.listed.map((space) => (
              <div key={space.id} className="mb-row person">
                <span className="tx">
                  <b>{space.name || t('settings.unnamed')}</b>
                  <small>
                    {t('count.people', { count: space.people })}
                    {!space.mine && ` · ${t('server.notInIt')}`}
                  </small>
                </span>
                <span className="ct">{onDevice.includes(space.id) ? t('server.onThisDevice') : ''}</span>
              </div>
            ))}
          </div>
          <p className="mb-p">{t(p.everySpace ? 'server.spacesAboutAll' : 'server.spacesAboutMine')}</p>
        </>
      )}
      {p.role !== 'member' && p.people && p.people.length > 0 && (
        <>
          <div className="mb-sec">
            <span>{t('server.peopleOn')}</span>
          </div>
          <div className="mb-list">
            {p.people.map((person) => {
              const you = person.id === p.me?.id;
              const row = (
                <>
                  <span className="who" aria-hidden="true">
                    {initial(person.name, person.email)}
                  </span>
                  <span className="tx">
                    <b>
                      {person.name || person.email}
                      {you && <small className="you"> · {t('settings.itsYou')}</small>}
                    </b>
                    <small>{person.email}</small>
                  </span>
                  <span className="ct">{t(ROLE_WORD[person.role])}</span>
                </>
              );
              return !reaches(p, person) ? (
                <div key={person.id} className="mb-row person">
                  {row}
                </div>
              ) : (
                <button key={person.id} type="button" className="mb-row person" onClick={() => setHeld(person)}>
                  {row}
                </button>
              );
            })}
          </div>
          <p className="mb-p">{t('server.peopleAbout')}</p>
        </>
      )}
      <div className="mb-form">
        <div className="mb-group">
          <button type="button" className="mb-fr red" onClick={onSignOut}>
            {t('server.signOutPhone')}
          </button>
        </div>
      </div>
      <p className="mb-p">{t('server.signOutText')}</p>
      {held && (
        <ActionSheet
          head={{
            icon: 'person',
            title: held.name || held.email,
            sub: [held.email, t(ROLE_WORD[held.role]), p.everySpace && held.spaces > 0 ? p.spacesOf(held.id).join(', ') : t('server.spacesCount', { count: held.spaces })].join(' · '),
          }}
          items={personItems(
            p,
            held,
            () => setLinking(held),
            () => setRemoving(held),
          )}
          onClose={() => setHeld(null)}
        />
      )}
      {removing && (
        <AskRemove
          title={t('server.removePersonTitle', { name: removing.name || removing.email, host: p.host })}
          message={t('server.removePersonText', { name: removing.name || removing.email })}
          onConfirm={() => void p.remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {linking && (
        <LinkDialog
          title={t('server.passwordTitle', { name: linking.name || linking.email })}
          about={(day) => t('server.passwordText', { name: linking.name || linking.email, day })}
          make={p.passwordLink(linking)}
          onClose={() => setLinking(null)}
        />
      )}
    </>
  );
}
