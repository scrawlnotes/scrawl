import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Ports of their own, so a dev server already open on 5173/8080 is never touched.
export const WEB = 'http://localhost:5199';
import { SERVER } from './server';
export { SERVER };
// Every run starts the server on an empty folder.
const data = mkdtempSync(join(tmpdir(), 'scrawl-e2e-'));

export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.ts',
  outputDir: 'results',
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: WEB,
    // The Edge on this computer: no browser to download.
    channel: 'msedge',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    // An iPhone's size and touch, with Edge's own user agent: the app knows a phone by its touch and
    // size, and the editor, told it is an iPhone, takes keys as iOS sends them, which Chromium does not.
    // How iOS types is tried on an iPhone itself.
    {
      name: 'phone',
      use: { viewport: devices['iPhone 15'].viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @scrawlnotes/web exec vite --port 5199 --strictPort',
      url: WEB,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @scrawlnotes/server exec node scripts/build.mjs && node ../apps/server/dist/server.mjs',
      url: `${SERVER}/`,
      env: { PORT: '8199', SCRAWL_DATA: data, SCRAWL_APP_URL: WEB },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
