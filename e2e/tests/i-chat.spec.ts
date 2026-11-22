import { type Page } from '@playwright/test';
import { expect, joinSpace, test } from '../fixtures';
import { invite, person, spaceWithInvite } from '../server';

// Two people who join and talk take longer than one device.
test.describe.configure({ timeout: 90_000 });

const openChat = (page: Page) => page.getByRole('button', { name: 'Chat', exact: true }).click();

async function send(page: Page, room: string, text: string) {
  const box = page.getByRole('textbox', { name: `Message ${room}` });
  await box.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('a message in #general reaches the other person, and their answer comes back', async ({ app, second, phone }) => {
  test.skip(phone, 'Two people at computer size; the phone in its own slice.');
  const space = await spaceWithInvite('Chat');
  await joinSpace(app, space.link, person('Ada'));
  await joinSpace(second, await invite(space.id), person('Ben'));
  await openChat(app);
  await openChat(second);

  await send(app, '#general', 'Lunch at noon?');
  await expect(second.getByText('Lunch at noon?')).toBeVisible({ timeout: 20_000 });
  await send(second, '#general', 'Yes, see you there');
  await expect(app.getByText('Yes, see you there')).toBeVisible({ timeout: 20_000 });
});

test('a message is found by a word in it', async ({ app, phone }) => {
  test.skip(phone, 'At computer size; the phone in its own slice.');
  const space = await spaceWithInvite('Chat');
  await joinSpace(app, space.link, person('Ada'));
  await openChat(app);
  await send(app, '#general', 'The invoice for Atlas is ready');
  await expect(app.getByText('The invoice for Atlas is ready')).toBeVisible();
  await app.getByRole('textbox', { name: 'Search messages' }).fill('atlas');
  await app.keyboard.press('Enter');
  await expect(app.getByRole('mark', { name: /Atlas/i }).or(app.locator('mark', { hasText: /atlas/i })).first()).toBeVisible({ timeout: 15_000 });
});
