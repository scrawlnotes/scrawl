import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Ports of their own, so a dev server already open on 5173/8080 is never touched.
export const WEB = 'http://localhost:5199';
export const SERVER = 'http://localhost:8199';
// Every run starts the server on an empty folder.
const data = mkdtempSync(join(tmpdir(), 'scrawl-e2e-'));

export default defineConfig({
  testDir: 'tests',
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
    { name: 'phone', use: { ...devices['iPhone 15'], defaultBrowserType: 'chromium', channel: 'msedge' } },
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
