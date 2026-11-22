import { type Page } from '@playwright/test';
import { expect, joinSpace, test } from '../fixtures';
import { person, spaceWithInvite } from '../server';

// Delivering a notification goes through the browser's push service, which a test on this computer
// does not reach: that is the server's tests' (notices.test.ts, push.test.ts) and a real phone's.
test.describe.configure({ timeout: 90_000 });

async function notificationSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Notifications/ }).first().click();
}

test('a kind of notification turned off stays off after a reload', async ({ app, phone }) => {
  test.skip(phone, 'At computer size; the phone in its own slice.');
  const space = await spaceWithInvite('Notify');
  await joinSpace(app, space.link, person('Ada'));
  await notificationSettings(app);
  const mentions = app.getByRole('checkbox', { name: /^Mentions/ });
  await expect(mentions).toBeChecked();
  await mentions.click();
  await expect(mentions).not.toBeChecked();

  await app.reload();
  await expect(app.getByRole('button', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
  await notificationSettings(app);
  await expect(app.getByRole('checkbox', { name: /^Mentions/ })).not.toBeChecked();
  await expect(app.getByRole('checkbox', { name: /^Assignments/ })).toBeChecked();
});
