import { t } from '@scrawlnotes/i18n';
import { useState } from 'react';

/**
 * The first start: who the user is, a name and an email, for the people they will share a
 * space with. Both may stay empty; Continue saves what there is, and the screen is not shown
 * again. On a phone it is a page, on a computer a screen over the app; the same markup.
 */
export function Welcome({ onDone }: { onDone: (name: string, email: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const done = () => onDone(name, email);
  return (
    <form
      className="welcome"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        done();
      }}
    >
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.text')}</p>
      <div className="wl-row">
        <label htmlFor="welcome-name">{t('welcome.name')}</label>
        <input id="welcome-name" value={name} autoComplete="name" autoFocus onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="wl-row">
        <label htmlFor="welcome-email">{t('welcome.email')}</label>
        <input id="welcome-email" type="email" value={email} autoComplete="email" placeholder={t('welcome.emailHint')} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="wl-foot">
        <span>{t('welcome.nothingSent')}</span>
        <button type="submit">{t('welcome.continue')}</button>
      </div>
    </form>
  );
}
