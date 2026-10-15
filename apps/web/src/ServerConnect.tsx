import { type Me, readServerInput, RemoteOffline, ServerError } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { hostOf, keepSignIn, type KnownServer, serverAccount } from './servers';
import { Sheet } from './sheets';
import { ServerIcon } from './SyncViews';

// Connect a server…, after the Server part of design/mockups.html: one field, the server's
// address or an invite link. Typed, the app asks the server and says what Continue opens: setting
// up a new server, whose first to connect becomes its owner; signing in to one set up already;
// joining with an invite link, which comes in a later version. Setting up and signing in take
// the email and a password; setting up takes the name too, both from Profile. The same window
// signs in again to a server whose key no longer works. A window on a computer, a sheet on a phone.

/** What the field leads to, once the server answered. */
type Found =
  | { kind: 'looking' }
  | { kind: 'bad' }
  | { kind: 'new' | 'closed' | 'ready' | 'invite' | 'none'; url: string };

type Step = 'address' | 'setup' | 'signin';

export interface ConnectOptions {
  me: Me | null;
  /** This device's name, which the server keeps with its key. */
  device: string;
  /** Signing in again to a server whose key no longer works: its address and the account. */
  again?: { url: string; email: string } | undefined;
  onDone: (server: KnownServer) => void;
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
      default:
        return t('server.errOther', { message: error.message });
    }
  }
  return t('server.errOther', { message: error instanceof Error ? error.message : String(error) });
}

function useServerConnect({ me, device, again, onDone }: ConnectOptions) {
  const [input, setInput] = useState(again ? hostOf(again.url) : '');
  const [found, setFound] = useState<Found | null>(null);
  const [step, setStep] = useState<Step>(again ? 'signin' : 'address');
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(again?.email ?? me?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = again?.url ?? (found && 'url' in found ? found.url : null);
  const host = url ? hostOf(url) : '';

  // What was typed is asked of the server a moment after typing stops.
  useEffect(() => {
    if (step !== 'address') return;
    if (!input.trim()) return setFound(null);
    const read = readServerInput(input);
    if (!read) return setFound({ kind: 'bad' });
    if (read.invite) return setFound({ kind: 'invite', url: read.url });
    setFound({ kind: 'looking' });
    let live = true;
    const timer = window.setTimeout(() => {
      serverAccount(read.url)
        .status()
        .then(
          (status) => live && setFound({ kind: !status.new ? 'ready' : status.setupOpen ? 'new' : 'closed', url: read.url }),
          () => live && setFound({ kind: 'none', url: read.url }),
        );
    }, 450);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [input, step]);

  const canContinue = found?.kind === 'new' || found?.kind === 'ready';
  const next = () => {
    if (!found || !canContinue) return;
    setError(null);
    setStep(found.kind === 'new' ? 'setup' : 'signin');
  };
  const back = () => {
    setError(null);
    setPassword('');
    setStep('address');
  };
  const submit = async () => {
    if (!url || busy) return;
    setBusy(true);
    setError(null);
    try {
      const account = serverAccount(url);
      const signedIn =
        step === 'setup'
          ? await account.setUp({ name: name.trim(), email: email.trim(), password, person: me?.id ?? '', device })
          : await account.signIn({ email: email.trim(), password, device });
      onDone(await keepSignIn(url, signedIn));
    } catch (failure) {
      setError(serverFailure(failure, host));
      setBusy(false);
    }
  };
  const ready = !busy && !!email.trim() && !!password;
  return { input, setInput, found, step, next, back, canContinue, name, setName, email, setEmail, password, setPassword, error, setError, busy, ready, submit, host };
}

/** What the field leads to, said under it: a card for a server found, a line otherwise. */
function foundWords(found: Found | null): { card?: { title: string; text: string; late: boolean }; line?: { text: string; err: boolean } } {
  if (!found) return {};
  if (found.kind === 'looking') return { line: { text: t('server.looking'), err: false } };
  if (found.kind === 'bad') return { line: { text: t('server.notAddress'), err: true } };
  const host = hostOf(found.url);
  if (found.kind === 'none') return { line: { text: t('server.noServer', { host }), err: true } };
  if (found.kind === 'new') return { card: { title: t('server.isNew', { host }), text: t('server.isNewText'), late: false } };
  if (found.kind === 'closed') return { card: { title: t('server.closed', { host }), text: t('server.closedText'), late: true } };
  if (found.kind === 'invite') return { card: { title: host, text: t('server.inviteLater'), late: true } };
  return { card: { title: host, text: t('server.isSetUp'), late: false } };
}

/** Connect a server…, as a window on a computer. */
export function ConnectServerDialog({ onClose, ...options }: ConnectOptions & { onClose: () => void }) {
  const c = useServerConnect(options);
  const { card, line } = foundWords(c.found);
  const signing = c.step !== 'address';
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
      <form className="fp space-add srv-connect" role="dialog" aria-modal="true" aria-label={signing ? t(c.step === 'setup' ? 'server.setupTitle' : 'server.signInTitle') : t('server.connectTitle')} onKeyDown={onKeyDown} onSubmit={onSubmit}>
        {!signing ? (
          <>
            <h3>{t('server.connectTitle')}</h3>
            <label className="label" htmlFor="srv-address">
              {t('server.field')}
            </label>
            <input
              id="srv-address"
              className={c.found?.kind === 'invite' ? 'field mono' : 'field'}
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
              {t(c.step === 'setup' ? 'server.setupTitle' : 'server.signInTitle')}
              <small>{c.host}</small>
            </h3>
            {c.step === 'setup' && <p className="srv-what">{t('server.setupText', { host: c.host })}</p>}
            {options.again && <p className="srv-what">{t('server.signInAgain', { host: c.host })}</p>}
            {c.step === 'setup' && (
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
              autoComplete="email"
              autoFocus={!c.email}
              onChange={(event) => {
                c.setEmail(event.target.value);
                c.setError(null);
              }}
            />
            <label className="label" htmlFor="srv-password">
              {t('server.password')}
            </label>
            <input
              id="srv-password"
              className="field"
              type="password"
              value={c.password}
              autoComplete={c.step === 'setup' ? 'new-password' : 'current-password'}
              autoFocus={!!c.email}
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
              <p className="note">{t(c.step === 'setup' ? 'server.passwordNote' : 'server.forgot')}</p>
            )}
            <div className="foot">
              <button type="button" className="st-btn" onClick={options.again ? onClose : c.back}>
                {options.again ? t('dialog.cancel') : t('server.back')}
              </button>
              <button type="submit" className="st-btn go" disabled={!c.ready}>
                {t(c.step === 'setup' ? 'server.setUp' : 'server.signIn')}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/** Connect a server…, as a sheet on a phone. */
export function ConnectServerSheet({ onClose, ...options }: ConnectOptions & { onClose: () => void }) {
  const c = useServerConnect(options);
  const { card, line } = foundWords(c.found);
  const signing = c.step !== 'address';
  const leaving = !signing || !!options.again;
  return (
    <Sheet label={t('server.connectTitle')} className="mb-create mb-srv" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={leaving ? onClose : c.back}>
          {leaving ? t('dialog.cancel') : t('server.back')}
        </button>
        <b>{signing ? t(c.step === 'setup' ? 'server.setupTitle' : 'server.signInTitle') : t('server.connectTitle')}</b>
        <button type="button" className="ok" disabled={signing ? !c.ready : !c.canContinue} onClick={() => (signing ? void c.submit() : c.next())}>
          {signing ? t(c.step === 'setup' ? 'server.setUp' : 'server.signIn') : t('server.continue')}
        </button>
      </div>
      {!signing ? (
        <>
          <div className="mb-sec">{t('server.field')}</div>
          <div className="mb-form">
            <div className="mb-group">
              <label className="mb-fr">
                <input
                  className={c.found?.kind === 'invite' ? 'in mono' : 'in'}
                  aria-label={t('server.field')}
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
          {line ? <p className={line.err ? 'mb-hint err' : 'mb-hint'}>{line.text}</p> : <p className="mb-hint">{t('server.fieldNote')}</p>}
        </>
      ) : (
        <>
          <p className="mb-hint top">{c.step === 'setup' ? t('server.setupText', { host: c.host }) : options.again ? t('server.signInAgain', { host: c.host }) : c.host}</p>
          <div className="mb-form">
            <div className="mb-group">
              {c.step === 'setup' && (
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
                  autoComplete="email"
                  autoCapitalize="off"
                  value={c.email}
                  onChange={(event) => {
                    c.setEmail(event.target.value);
                    c.setError(null);
                  }}
                />
              </label>
              <label className="mb-fr">
                <span className="fl">{t('server.password')}</span>
                <input
                  className="in"
                  type="password"
                  autoComplete={c.step === 'setup' ? 'new-password' : 'current-password'}
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
            <p className="mb-hint">{t(c.step === 'setup' ? 'server.passwordNote' : 'server.forgot')}</p>
          )}
        </>
      )}
    </Sheet>
  );
}
