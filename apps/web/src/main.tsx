import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import './phone.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { prepareSignIn } from './cloud';
import { startDesktopUpdates } from './desktopUpdate';
import { applyLanguage, applySize, applyTheme, keepTyping, loadMode, loadTheme, onTurn, shadeOfMode, systemShade } from './device';
import { startWebApp } from './pwa';
import { keptConnection } from './sync';

// The theme, the size and the language this device keeps are set before anything is drawn, so
// that the first frame is already right.
applyLanguage();
applyTheme(loadTheme(), shadeOfMode(loadMode(), systemShade()));
applySize();
onTurn(applySize);
// No field corrects what is typed, on any device.
keepTyping();

// In the browser, a sign-in that went to Microsoft is finished first, or an old one renewed, in
// which case the page leaves before anything is drawn.
const connection = keptConnection();
void prepareSignIn(connection && connection.account.email).then((stay) => {
  if (!stay) return;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  startWebApp();
  startDesktopUpdates();
});
