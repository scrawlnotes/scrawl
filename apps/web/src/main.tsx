import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyLanguage, applyTheme, loadMode, loadTheme, shadeOfMode, systemShade } from './device';
import { startWebApp } from './pwa';

// The theme and the language this device keeps are set before anything is drawn, so that the
// first frame is already right.
applyLanguage();
applyTheme(loadTheme(), shadeOfMode(loadMode(), systemShade()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startWebApp();
