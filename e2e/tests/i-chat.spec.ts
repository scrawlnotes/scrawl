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

test('a message’s menu copies it as it reads or as Markdown, and Copy copies what is selected', async ({ app, phone }) => {
  test.skip(phone, 'A phone selects no words in a message; its menu has Copy message.');
  const space = await spaceWithInvite('Chat');
  await joinSpace(app, space.link, person('Ada'), phone);
  await openChat(app, phone);
  // Bold as the box makes it: what is typed with ** is kept as it was typed.
  await app.getByRole('textbox', { name: 'Message #general' }).click();
  await app.keyboard.type('The ');
  await app.keyboard.press('Control+b');
  await app.keyboard.type('plan');
  await app.keyboard.press('Control+b');
  await app.keyboard.type(' is ready');
  await app.keyboard.press('Enter');
  // Sent, not still on its way (that row has no data-id): only then has it a menu.
  const message = app.locator('.ch-m[data-id]', { hasText: 'The plan is ready' }).last();
  await expect(message).toBeVisible({ timeout: 20_000 });
  // What the page put on the clipboard.
  await app.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copied = () => app.evaluate(() => navigator.clipboard.readText());

  await message.locator('.bd').click({ button: 'right' });
  await expect(app.getByRole('menuitem', { name: 'Copy', exact: true })).toHaveCount(0);
  await app.getByRole('menuitem', { name: 'Copy message', exact: true }).click();
  await expect.poll(copied).toBe('The plan is ready');

  await message.locator('.bd').click({ button: 'right' });
  await app.getByRole('menuitem', { name: 'Copy message as Markdown' }).click();
  await expect.poll(copied).toBe('The **plan** is ready');

  await message.locator('.bd strong').dblclick();
  await message.locator('.bd strong').click({ button: 'right' });
  await app.getByRole('menuitem', { name: 'Copy', exact: true }).click();
  // A double click on Windows takes the space after the word too, as Ctrl+C would copy it.
  await expect.poll(copied).toMatch(/^plan ?$/);
});

test('@here and @everyone are offered in a room, and mention everyone as @room does', async ({ app, second, phone }) => {
  const space = await spaceWithInvite('Chat');
  await joinSpace(app, space.link, person('Ada'), phone);
  await joinSpace(second, await invite(space.id), person('Ben'), phone);
  await openChat(app, phone);
  await openChat(second, phone);

  const box = app.getByRole('textbox', { name: 'Message #general' });
  await typeInto(box, '@');
  const list = app.getByRole('listbox');
  for (const word of ['@room', '@here', '@everyone']) await expect(list.getByRole('option', { name: new RegExp(word) })).toBeVisible();
  await app.keyboard.type('he');
  await list.getByRole('option', { name: /@here/ }).click();
  await app.keyboard.type('lunch is here');
  if (phone) await app.getByRole('button', { name: 'Send', exact: true }).click();
  else await app.keyboard.press('Enter');
  await expect(second.locator('.msg-at.room', { hasText: '@here' })).toBeVisible({ timeout: 20_000 });
});
