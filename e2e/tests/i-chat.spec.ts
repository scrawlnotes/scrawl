import { type Page } from '@playwright/test';
import { expect, joinSpace, test, typeInto } from '../fixtures';
import { invite, person, spaceWithInvite } from '../server';

// Two people who join and talk take longer than one device.
test.describe.configure({ timeout: 90_000 });

// Chat: the sidebar's on a computer; on a phone its tab, then the room from the list.
async function openChat(page: Page, phone: boolean) {
  if (!phone) return page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Chat' }).click();
  await page.getByRole('button', { name: /general/ }).first().click();
}

// Enter sends on a computer; on a phone it is a new line, and Send sends.
async function send(page: Page, phone: boolean, room: string, text: string) {
  const box = page.getByRole('textbox', { name: `Message ${room}` });
  await typeInto(box, text);
  if (phone) await page.getByRole('button', { name: 'Send', exact: true }).click();
  else await page.keyboard.press('Enter');
}

test('a message in #general reaches the other person, and their answer comes back', async ({ app, second, phone }) => {
  const space = await spaceWithInvite('Chat');
  await joinSpace(app, space.link, person('Ada'), phone);
  await joinSpace(second, await invite(space.id), person('Ben'), phone);
  await openChat(app, phone);
  await openChat(second, phone);

  await send(app, phone, '#general', 'Lunch at noon?');
  await expect(second.getByText('Lunch at noon?', { exact: true })).toBeVisible({ timeout: 20_000 });
  await send(second, phone, '#general', 'Yes, see you there');
  await expect(app.getByText('Yes, see you there', { exact: true })).toBeVisible({ timeout: 20_000 });
});

test('a message is found by a word in it', async ({ app, phone }) => {
  const space = await spaceWithInvite('Chat');
  await joinSpace(app, space.link, person('Ada'), phone);
  await openChat(app, phone);
  await send(app, phone, '#general', 'The invoice for Atlas is ready');
  await expect(app.getByText('The invoice for Atlas is ready', { exact: true })).toBeVisible();
  // On a phone the search is on the list of conversations.
  if (phone) await app.getByRole('button', { name: /^(Back to )?Chat$/ }).first().click();
  // On a phone it is a row that opens the search, which takes the keyboard.
  if (phone) {
    await app.getByText('Search messages').first().click();
    await app.keyboard.type('atlas');
  } else await app.getByRole('textbox', { name: 'Search messages' }).fill('atlas');
  await app.keyboard.press('Enter');
  await expect(app.getByRole('mark', { name: /Atlas/i }).or(app.locator('mark', { hasText: /atlas/i })).first()).toBeVisible({ timeout: 15_000 });
});
