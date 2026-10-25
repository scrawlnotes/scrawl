// The app itself, which main.tsx brings once the boot screen is drawn. Its styles come with it, so
// that the boot screen does not wait for them either.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import './phone.css';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { backFromRenewing, prepareSignIn } from './cloud';
import { startDesktopUpdates } from './desktopUpdate';
import { applyLanguage, applyNumbers, applySize, applyTheme, keepTyping, loadMode, loadTheme, onTurn, shadeOfMode, systemShade } from './device';
import { openingBegins } from './opening';
import { startWebApp } from './pwa';
import { keptConnection } from './sync';

/** The boot screen of index.html goes softly once the app is drawn under it. */
function BootGoes() {
  useEffect(() => {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.classList.add('gone');
    const timer = window.setTimeout(() => boot.remove(), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

// The opening's log begins as soon as the page's code runs: how long the code took to come, and
// how long the page was at Microsoft when it comes back from renewing the sign-in.
openingBegins(backFromRenewing());

// The theme, the size and the language this device keeps are set before the app is drawn, so
// that its first frame is already right.
applyLanguage();
applyNumbers();
applyTheme(loadTheme(), shadeOfMode(loadMode(), systemShade()));
applySize();
onTurn(applySize);
// No field corrects what is typed, on any device.
keepTyping();

// In the browser, a sign-in that went to Microsoft is finished first, or an old one renewed, in
// which case the page leaves before anything is drawn. Then a new version that waits on the
// device is gone over to, before the app draws and syncs anything (design/sync-gate.md 2).
const connection = keptConnection();
void prepareSignIn(connection && connection.account.email).then(async (stay) => {
  if (!stay || !(await startWebApp())) return;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <BootGoes />
    </StrictMode>,
  );
  startDesktopUpdates();
});
