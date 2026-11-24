import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type Page } from '@playwright/test';
import { expect, joinSpace, test, typeInto } from '../fixtures';
import { person, spaceWithInvite } from '../server';

// A web link in a message (design/chat.md 29): its address short, and under it a card of what its
// page says, which the server read; whoever wrote it takes the card off. The page is a site on this
// computer, which the test server, itself on this computer, may read.

test.describe.configure({ timeout: 90_000 });

let site: Server;
let base = '';

test.beforeAll(async () => {
  site = createServer((request, response) => {
    if (request.url?.startsWith('/blog/tr/crminizle-konusun-teamgram-crmde-asistan-ve-mcp/')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(
        '<html><head><meta property="og:site_name" content="TeamGram"><meta property="og:title" content="CRM’inizle konuşun: TeamGram CRM’de asistan ve MCP">' +
          '<meta property="og:description" content="Yeni yapay zekâ asistanı ve MCP sunucusu."><meta property="og:image" content="/card.png"></head><body></body></html>',
      );
    }
    if (request.url === '/card.png') {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      // A one-pixel picture.
      return response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64'));
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((resolve) => site.close(() => resolve())));

async function openGeneral(page: Page, phone: boolean) {
  if (!phone) return page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Chat' }).click();
  await page.getByRole('button', { name: /general/ }).first().click();
}

/** A finger held on a message until it lifts, as a phone sends touches. */
async function hold(page: Page, at: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('a link shows short, with its page’s card under it, and its writer takes the card off', async ({ app, phone }) => {
  const space = await spaceWithInvite('Links');
  await joinSpace(app, space.link, person('Ada'), phone);
  await openGeneral(app, phone);

  const link = `${base}/blog/tr/crminizle-konusun-teamgram-crmde-asistan-ve-mcp/?utm_source=tgmailer&utm_medium=email`;
  await typeInto(app.getByRole('textbox', { name: 'Message #general' }), `Bunu gördün mü? ${link} `);
  if (phone) await app.getByRole('button', { name: 'Send', exact: true }).click();
  else await app.keyboard.press('Enter');

  // The address is short; the whole of it is what opens.
  const shown = app.locator('.ch-m .bd a', { hasText: `127.0.0.1:${new URL(base).port}/blog/tr/crminizle-konusun-teamgram-crmd…` });
  await expect(shown).toBeVisible({ timeout: 20_000 });
  await expect(shown).toHaveAttribute('href', link);

  // The card comes once the server read the page: the site, the title, a line and the picture.
  const card = app.locator('.ch-lc');
  await expect(card.getByText('CRM’inizle konuşun: TeamGram CRM’de asistan ve MCP')).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('TeamGram', { exact: true })).toBeVisible();
  await expect(card.getByText('Yeni yapay zekâ asistanı ve MCP sunucusu.')).toBeVisible();
  await expect(card.locator('.im img')).toHaveAttribute('src', /^blob:/, { timeout: 15_000 });

  if (phone) {
    // Held, the message offers Remove preview.
    const box = (await app.locator('.ch-m', { has: card }).locator('.hd, .bd').first().boundingBox())!;
    await hold(app, { x: box.x + 20, y: box.y + box.height / 2 });
    await app.getByRole('button', { name: 'Remove preview' }).click();
  } else {
    // On a computer, the × beside the card while the pointer is on the message.
    await app.locator('.ch-m', { has: card }).hover();
    await card.getByRole('button', { name: 'Remove preview' }).click();
  }
  await expect(app.locator('.ch-lc')).toHaveCount(0);
  await expect(shown).toBeVisible();
});
