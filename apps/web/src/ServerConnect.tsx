import { type Me, readServerInput, RemoteOffline, ServerError, type ServerInvitation, type ServerSpace } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { hostOf, keepSignIn, type KnownServer, serverAccount, type SignInWhy } from './servers';
import { Sheet } from './sheets';
import { ServerIcon } from './SyncViews';

// Connect a server…, after the Server part of design/mockups.html: one field, the server's
// address or an invite link. Typed, the app asks the server and says what Continue opens: setting
// up a new server, whose first to connect becomes its owner; signing in to one set up already;
// joining a space with an invite link, who invited you to what; a new password with a link for
// one. Setting up and joining take the name, the email and a password, the name and email from
// Profile as it is; signing in the email and the password. Profile takes what it lacks from the
// account after (`signedInToServer`). Joining with an email that has an account there takes its
// password, and adds the space to it. On a computer it is a step of Add space, where what the
// server asks for opens under the field at once; on its own, a window signs in to a server whose
// spaces wait for it: one this device never signed in to, one signed out of here, or one that no
// longer takes the key. It names the spaces it opens. On a phone, a sheet.

/** What the field leads to, once the server answered. */
type Found =
  | { kind: 'looking' }
  | { kind: 'bad' }
  | { kind: 'new' | 'closed' | 'ready' | 'none'; url: string }
  | { kind: 'invite'; url: string; code: string; invitation: ServerInvitation }
  | { kind: 'used' | 'expired' | 'gone'; url: string };

type Step = 'address' | 'setup' | 'signin' | 'join' | 'reset';

/** The day a link runs out, as its card says it: `Oct 22`. */
const dayText = (at: number) => new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

export interface ConnectOptions {
  me: Me | null;
  /** This device's name, which the server keeps with its key. */
  device: string;
  /**
   * Signing in to a server whose spaces wait for it: its address, the account, why it is asked,
   * and the spaces on it here, which the sign-in opens.
   */
  again?: { url: string; email: string; why?: SignInWhy; spaces?: readonly string[] } | undefined;
  /** What the field starts with: the link the app was opened with, from a link's page. */
  start?: string | null | undefined;
  /** Connected; with the space an invite brought the person into, or after a link for a new password. */
  onDone: (server: KnownServer, after?: { joined: ServerSpace } | { reset: true }) => void;
}

/** Why something asked of a server did not go through, in the app's words. */
export function serverFailure(error: unknown, host: string): string {
  if (error instanceof RemoteOffline) return t('server.errOffline', { host });
  if (error instanceof ServerError) {
    switch (error.code) {
      case 'no-account':
        return t('server.errNoAccount', { host });
      case 'wrong-password':
        return t('server.errWrongPassword');
      case 'too-many':
        return t('server.errTooMany');
      case 'short-password':
        return t('server.errShortPassword');
      case 'bad-email':
        return t('server.errEmail');
      case 'set-up':
        return t('server.errSetUp', { host });
      case 'setup-closed':
        return t('server.closedText');
      case 'not-owner':
        return t('server.errNotOwner');
      case 'not-allowed':
      case 'not-member':
        return t('server.errNotAllowed');
      case 'last-manager':
        return t('server.errLastManager');
      case 'owner':
        return t('server.errOwner');
      case 'yourself':
        return t('server.errYourself');
      case 'invite-used':
        return t('server.linkUsed');
      case 'invite-expired':
        return t('server.linkExpired');
      case 'no-invite':
        return t('server.linkNone');
      default:
        return t('server.errOther', { message: error.message });
    }
  }
  return t('server.errOther', { message: error instanceof Error ? error.message : String(error) });
}

function useServerConnect({ me, device, again, start, onDone }: ConnectOptions) {
  const [input, setInput] = useState(again ? hostOf(again.url) : (start ?? ''));
  const [found, setFound] = useState<Found | null>(null);
  const [step, setStep] = useState<Step>(again ? 'signin' : 'address');
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(again?.email ?? me?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = again?.url ?? (found && 'url' in found ? found.url : null);
  const host = url ? hostOf(url) : '';

  // Opened with a link as the app starts, Profile comes a moment later: its name and email fill what is still empty.
  useEffect(() => {
    if (me?.name) setName((now) => now || me.name || '');
    if (me?.email && !again) setEmail((now) => now || me.email || '');
  }, [me?.name, me?.email, again]);

  // What was typed is asked of the server a moment after typing stops.
  useEffect(() => {
    if (step !== 'address') return;
    if (!input.trim()) return setFound(null);
    const read = readServerInput(input);
    if (!read) return setFound({ kind: 'bad' });
    setFound({ kind: 'looking' });
    let live = true;
    const { url, invite } = read;
    const timer = window.setTimeout(() => {
      const account = serverAccount(url);
      if (invite) {
        // A link: who invited whom to what, or whose password it sets; or why it no longer works.
        account.invitation(invite).then(
          (invitation) => live && setFound({ kind: 'invite', url, code: invite, invitation }),
          (failure: unknown) => {
            if (!live) return;
            const code = failure instanceof ServerError ? failure.code : '';
            setFound({ kind: code === 'invite-used' ? 'used' : code === 'invite-expired' ? 'expired' : code === 'no-invite' ? 'gone' : 'none', url });
          },
        );
        return;
      }
      account.status().then(
        (status) => live && setFound({ kind: !status.new ? 'ready' : status.setupOpen ? 'new' : 'closed', url }),
        () => live && setFound({ kind: 'none', url }),
      );
    }, invite && input === start ? 0 : 450);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [input, step]);

  const invitation = found?.kind === 'invite' ? found.invitation : null;
  const canContinue = found?.kind === 'new' || found?.kind === 'ready' || found?.kind === 'invite';
  // As a step of a window, what the server asks for opens under the field as soon as it answered.
  const answered: Step | null = !found ? null : found.kind === 'new' ? 'setup' : found.kind === 'ready' ? 'signin' : found.kind === 'invite' ? (found.invitation.kind === 'space' ? 'join' : 'reset') : null;
  const acting: Step = step !== 'address' ? step : (answered ?? 'address');
  // A password link is for one account: its email is not typed.
  useEffect(() => {
    if (found?.kind === 'invite' && found.invitation.kind === 'reset') setEmail(found.invitation.email);
  }, [found]);
  const next = () => {
    if (!found || !canContinue) return;
    setError(null);
    if (found.kind === 'invite') setStep(found.invitation.kind === 'space' ? 'join' : 'reset');
    else setStep(found.kind === 'new' ? 'setup' : 'signin');
  };
  const back = () => {
    setError(null);
    setPassword('');
    setStep('address');
  };
  const submit = async () => {
    if (!url || busy || acting === 'address') return;
    setBusy(true);
    setError(null);
    try {
      const account = serverAccount(url);
      const code = found?.kind === 'invite' ? found.code : '';
      if (acting === 'join') {
        const joined = await account.accept(code, { name: name.trim(), email: email.trim(), password, person: me?.id ?? '', device });
        onDone(await keepSignIn(url, joined), { joined: joined.space });
      } else if (acting === 'reset') {
        onDone(await keepSignIn(url, await account.setPassword(code, { password, device })), { reset: true });
      } else {
        const signedIn =
          acting === 'setup'
            ? await account.setUp({ name: name.trim(), email: email.trim(), password, person: me?.id ?? '', device })
            : await account.signIn({ email: email.trim(), password, device });
        onDone(await keepSignIn(url, signedIn));
      }
    } catch (failure) {
      // Joining with an email that has an account there asks for that account's password.
      const taken = acting === 'join' && failure instanceof ServerError && failure.code === 'wrong-password';
      setError(taken ? t('server.errJoinPassword', { email: email.trim(), host }) : serverFailure(failure, host));
      setBusy(false);
    }
  };
  const ready = !busy && acting !== 'address' && !!email.trim() && !!password;
  return { input, setInput, found, invitation, step, acting, next, back, canContinue, name, setName, email, setEmail, password, setPassword, error, setError, busy, ready, submit, host };
}

/** The window's title for a step: the space joined is named. */
function stepTitle(step: Step, invitation: ServerInvitation | null): string {
  if (step === 'join' && invitation?.kind === 'space') return t('server.joinTitle', { space: invitation.space.name });
  if (step === 'reset') return t('server.resetTitle');
  return t(step === 'setup' ? 'server.setupTitle' : step === 'signin' ? 'server.signInTitle' : 'server.connectTitle');
}

/**
 * Why a server asks to be signed in to, in a sentence: this device never signed in to it, the
 * person signed out of it here, or it no longer takes the key; with the spaces it opens.
 */
export function signInWords(why: SignInWhy, host: string, spaces: readonly string[] = []): string {
  const names = spaces.length > 0 ? new Intl.ListFormat(locale(), { type: 'conjunction' }).format(spaces) : '';
  if (why === 'notYet') return names ? t('server.notSignedInOpens', { host, spaces: names }) : t('server.notSignedIn', { host });
  if (why === 'left') return names ? t('server.signedOutOpens', { host, spaces: names }) : t('server.signedOutHere', { host });
  return t('server.signInAgain', { host });
}

/** What the window says over its fields for a step, when it says something. */
function stepWords(step: Step, invitation: ServerInvitation | null, host: string, again: ConnectOptions['again']): string | null {
  if (step === 'setup') return t('server.setupText', { host });
  if (step === 'join' && invitation?.kind === 'space') return t(invitation.by ? 'server.joinText' : 'server.joinTextNoOne', { by: invitation.by, space: invitation.space.name, host });
  if (step === 'reset' && invitation?.kind === 'reset') return t('server.resetText', { email: invitation.email, host });
  if (again) return signInWords(again.why ?? 'again', host, again.spaces);
  return null;
}

/** The note under the fields: what the password is for. */
const stepNote = (step: Step) => t(step === 'signin' ? 'server.forgot' : step === 'reset' ? 'server.resetNote' : 'server.passwordNote');

/** The button that does a step. */
function stepAction(step: Step, invitation: ServerInvitation | null, short: boolean): string {
  if (step === 'join') return short || invitation?.kind !== 'space' ? t('server.join') : t('server.joinTitle', { space: invitation.space.name });
  if (step === 'reset') return t('server.setPassword');
  return t(step === 'setup' ? 'server.setUp' : 'server.signIn');
}

/** What the field leads to, said under it: a card for a server found, a line otherwise. */
function foundWords(found: Found | null, short = false): { card?: { title: string; text: string; late: boolean }; line?: { text: string; err: boolean } } {
  if (!found) return {};
  if (found.kind === 'looking') return { line: { text: t('server.looking'), err: false } };
  if (found.kind === 'bad') return { line: { text: t('server.notAddress'), err: true } };
  const host = hostOf(found.url);
  if (found.kind === 'none') return { line: { text: t('server.noServer', { host }), err: true } };
  if (found.kind === 'new') return { card: { title: t('server.isNew', { host }), text: t('server.isNewText'), late: false } };
  if (found.kind === 'closed') return { card: { title: t('server.closed', { host }), text: t('server.closedText'), late: true } };
  if (found.kind === 'used') return { line: { text: t('server.linkUsed'), err: true } };
  if (found.kind === 'expired') return { line: { text: t('server.linkExpired'), err: true } };
  if (found.kind === 'gone') return { line: { text: t('server.linkNone'), err: true } };
  if (found.kind === 'invite') {
    const { invitation } = found;
    const text = t(short ? 'server.linkUntilShort' : 'server.linkUntil', { host, day: dayText(invitation.expires) });
    if (invitation.kind === 'reset') return { card: { title: t('server.resetFor', { email: invitation.email }), text, late: false } };
    return { card: { title: invitation.by ? t('server.invited', { by: invitation.by, space: invitation.space.name }) : t('server.invitedNoOne', { space: invitation.space.name }), text, late: false } };
  }
  return { card: { title: host, text: t('server.isSetUp'), late: false } };
}

/** Connect a server…, as a window on a computer. */
export function ConnectServerDialog({ onClose, ...options }: ConnectOptions & { onClose: () => void }) {
  const c = useServerConnect(options);
  const { card, line } = foundWords(c.found);
  const signing = c.step !== 'address';
  const words = stepWords(c.step, c.invitation, c.host, options.again);
  // A link is shown as code from the moment it is pasted.
  const linked = !!readServerInput(c.input)?.invite;
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return;
    // The windows behind close on Escape too; this one takes it first.
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (signing) void c.submit();
    else c.next();
  };
  return (
    <div className="fp-ovl" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="fp space-add srv-connect" role="dialog" aria-modal="true" aria-label={stepTitle(c.step, c.invitation)} onKeyDown={onKeyDown} onSubmit={onSubmit}>
        {!signing ? (
          <>
            <h3>{t('server.connectTitle')}</h3>
            <label className="label" htmlFor="srv-address">
              {t('server.field')}
            </label>
            <input
              id="srv-address"
              className={linked ? 'field mono' : 'field'}
              value={c.input}
              placeholder={t('server.example')}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => c.setInput(event.target.value)}
            />
            {card && (
              <div className={card.late ? 'srv-found late' : 'srv-found'}>
                {card.late ? <Icon name="warn" /> : <ServerIcon />}
                <span>
                  <b>{card.title}</b>
                  <small>{card.text}</small>
                </span>
              </div>
            )}
            {line ? <p className={line.err ? 'note err' : 'note'}>{line.text}</p> : <p className="note">{t('server.fieldNote')}</p>}
            <div className="foot">
              <button type="button" className="st-btn" onClick={onClose}>
                {t('dialog.cancel')}
              </button>
              <button type="submit" className="st-btn go" disabled={!c.canContinue}>
                {t('server.continue')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>
              {stepTitle(c.step, c.invitation)}
              <small>{c.host}</small>
            </h3>
            {words && <p className="srv-what">{words}</p>}
            {(c.step === 'setup' || c.step === 'join') && (
              <>
                <label className="label" htmlFor="srv-name">
                  {t('settings.name')}
                </label>
                <input id="srv-name" className="field" value={c.name} autoComplete="name" autoFocus={!c.name} onChange={(event) => c.setName(event.target.value)} />
              </>
            )}
            <label className="label" htmlFor="srv-email">
              {t('settings.email')}
            </label>
            <input
              id="srv-email"
              className="field"
              type="email"
              value={c.email}
              autoComplete={c.step === 'reset' ? 'username' : 'email'}
              autoFocus={!c.email && (!!c.name || (c.step !== 'setup' && c.step !== 'join'))}
              readOnly={c.step === 'reset'}
              onChange={(event) => {
                c.setEmail(event.target.value);
                c.setError(null);
              }}
            />
            <label className="label" htmlFor="srv-password">
              {t(c.step === 'reset' ? 'server.newPassword' : 'server.password')}
            </label>
            <input
              id="srv-password"
              className="field"
              type="password"
              value={c.password}
              autoComplete={c.step === 'signin' ? 'current-password' : 'new-password'}
              autoFocus={!!c.email && (!!c.name || (c.step !== 'setup' && c.step !== 'join'))}
              onChange={(event) => {
                c.setPassword(event.target.value);
                c.setError(null);
              }}
            />
            {c.error ? (
              <p className="srv-err" role="alert">
                <Icon name="warn" />
                <span>{c.error}</span>
              </p>
            ) : (
              <p className="note">{stepNote(c.step)}</p>
            )}
            <div className="foot">
              <button type="button" className="st-btn" onClick={options.again ? onClose : c.back}>
                {options.again ? t('dialog.cancel') : t('server.back')}
              </button>
              <button type="submit" className="st-btn go" disabled={!c.ready}>
                {stepAction(c.step, c.invitation, false)}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/**
 * Connect a server…, as a step of Add space on a computer (design/spaces.md 2.5): under "‹ Location",
 * the field, and as soon as the server answers, what it asks for in the same step, setting up a new
 * server, signing in to one, or joining a space with an invite link. Done, the window is back at
 * Location with the server chosen; Back goes there too. For the personal space it takes an
 * address only (`addressOnly`): an invite link calls to a shared space.
 */
export function ConnectStep({ onBack, addressOnly = false, ...options }: ConnectOptions & { onBack: () => void; addressOnly?: boolean }) {
  const c = useServerConnect(options);
  // A link is shown as code from the moment it is pasted.
  const linked = !!readServerInput(c.input)?.invite;
  const refused = addressOnly && linked;
  const found = foundWords(c.found);
  const card = refused ? undefined : found.card;
  const line = refused ? { text: t('server.linkNotHere'), err: true } : found.line;
  const step = refused ? 'address' : c.acting;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void c.submit();
  };
  return (
    <form className="srv-step" onSubmit={onSubmit}>
      <button type="button" className="step-back" onClick={onBack}>
        <Icon name="back" />
        {t('space.location')}
      </button>
      <label className="label" htmlFor="srv-address">
        {t(addressOnly ? 'server.address' : 'server.field')}
      </label>
      <input
        id="srv-address"
        className={linked ? 'field mono' : 'field'}
        value={c.input}
        placeholder={t('server.example')}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => {
          c.setInput(event.target.value);
          c.setError(null);
        }}
      />
      {card && (
        <div className={card.late ? 'srv-found late' : 'srv-found'}>
          {card.late ? <Icon name="warn" /> : <ServerIcon />}
          <span>
            <b>{card.title}</b>
            <small>{card.text}</small>
          </span>
        </div>
      )}
      {step === 'address' ? (
        line ? <p className={line.err ? 'note err' : 'note'}>{line.text}</p> : <p className="note">{t(addressOnly ? 'server.addressNote' : 'server.fieldNote')}</p>
      ) : (
        <>
          {(step === 'setup' || step === 'join') && (
            <>
              <label className="label" htmlFor="srv-name">
                {t('settings.name')}
              </label>
              <input id="srv-name" className="field" value={c.name} autoComplete="name" onChange={(event) => c.setName(event.target.value)} />
            </>
          )}
          <label className="label" htmlFor="srv-email">
            {t('settings.email')}
          </label>
          <input
            id="srv-email"
            className="field"
            type="email"
            value={c.email}
            autoComplete={step === 'reset' ? 'username' : 'email'}
            readOnly={step === 'reset'}
            onChange={(event) => {
              c.setEmail(event.target.value);
              c.setError(null);
            }}
          />
          <label className="label" htmlFor="srv-password">
            {t(step === 'reset' ? 'server.newPassword' : 'server.password')}
          </label>
          <input
            id="srv-password"
            className="field"
            type="password"
            value={c.password}
            autoComplete={step === 'signin' ? 'current-password' : 'new-password'}
            onChange={(event) => {
              c.setPassword(event.target.value);
              c.setError(null);
            }}
          />
          {c.error ? (
            <p className="srv-err" role="alert">
              <Icon name="warn" />
              <span>{c.error}</span>
            </p>
          ) : (
            <p className="note">{stepNote(step)}</p>
          )}
        </>
      )}
      <div className="foot">
        <button type="button" className="st-btn" onClick={onBack}>
          {t('server.back')}
        </button>
        <button type="submit" className="st-btn go" disabled={!c.ready || refused}>
          {step === 'address' ? t('server.continue') : stepAction(step, c.invitation, false)}
        </button>
      </div>
    </form>
  );
}

/** Connect a server…, as a sheet on a phone; for the personal space, an address only (`addressOnly`). */
export function ConnectServerSheet({ onClose, addressOnly = false, ...options }: ConnectOptions & { onClose: () => void; addressOnly?: boolean }) {
  const c = useServerConnect(options);
  const signing = c.step !== 'address';
  const leaving = !signing || !!options.again;
  const words = stepWords(c.step, c.invitation, c.host, options.again);
  // A link is shown as code from the moment it is pasted.
  const linked = !!readServerInput(c.input)?.invite;
  const refused = addressOnly && linked;
  const found = foundWords(c.found, true);
  const card = refused ? undefined : found.card;
  const line = refused ? { text: t('server.linkNotHere'), err: true } : found.line;
  return (
    <Sheet label={t('server.connectTitle')} className="mb-create mb-srv" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={leaving ? onClose : c.back}>
          {leaving ? t('dialog.cancel') : t('server.back')}
        </button>
        <b>{stepTitle(c.step, c.invitation)}</b>
        <button type="button" className="ok" disabled={signing ? !c.ready : !c.canContinue || refused} onClick={() => (signing ? void c.submit() : c.next())}>
          {signing ? stepAction(c.step, c.invitation, true) : t('server.continue')}
        </button>
      </div>
      {!signing ? (
        <>
          <div className="mb-sec">{t(addressOnly ? 'server.address' : 'server.field')}</div>
          <div className="mb-form">
            <div className="mb-group">
              <label className="mb-fr">
                <input
                  className={linked ? 'in mono' : 'in'}
                  aria-label={t(addressOnly ? 'server.address' : 'server.field')}
                  value={c.input}
                  placeholder={t('server.example')}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  onChange={(event) => c.setInput(event.target.value)}
                />
              </label>
            </div>
          </div>
          {card && (
            <div className={card.late ? 'mb-srvfound late' : 'mb-srvfound'}>
              {card.late ? <Icon name="warn" /> : <ServerIcon />}
              <span>
                <b>{card.title}</b>
                <small>{card.text}</small>
              </span>
            </div>
          )}
          {line ? <p className={line.err ? 'mb-hint err' : 'mb-hint'}>{line.text}</p> : <p className="mb-hint">{t(addressOnly ? 'server.addressNote' : 'server.fieldNote')}</p>}
        </>
      ) : (
        <>
          <p className="mb-hint top">{words ?? c.host}</p>
          <div className="mb-form">
            <div className="mb-group">
              {(c.step === 'setup' || c.step === 'join') && (
                <label className="mb-fr">
                  <span className="fl">{t('settings.name')}</span>
                  <input className="in" autoComplete="name" value={c.name} onChange={(event) => c.setName(event.target.value)} />
                </label>
              )}
              <label className="mb-fr">
                <span className="fl">{t('settings.email')}</span>
                <input
                  className="in"
                  type="email"
                  autoComplete={c.step === 'reset' ? 'username' : 'email'}
                  autoCapitalize="off"
                  readOnly={c.step === 'reset'}
                  value={c.email}
                  onChange={(event) => {
                    c.setEmail(event.target.value);
                    c.setError(null);
                  }}
                />
              </label>
              <label className="mb-fr">
                <span className="fl">{t(c.step === 'reset' ? 'server.newPassword' : 'server.password')}</span>
                <input
                  className="in"
                  type="password"
                  autoComplete={c.step === 'signin' ? 'current-password' : 'new-password'}
                  enterKeyHint="go"
                  value={c.password}
                  onChange={(event) => {
                    c.setPassword(event.target.value);
                    c.setError(null);
                  }}
                />
              </label>
            </div>
          </div>
          {c.error ? (
            <p className="mb-hint err" role="alert">
              {c.error}
            </p>
          ) : (
            <p className="mb-hint">{stepNote(c.step)}</p>
          )}
        </>
      )}
    </Sheet>
  );
}
