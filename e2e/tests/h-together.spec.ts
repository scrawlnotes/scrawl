import { expect, joinSpace, test, typeInto } from '../fixtures';
import { invite, person, spaceWithInvite } from '../server';

test.describe.configure({ timeout: 90_000 });

test('a direct message reaches the one it is to', async ({ app, second, phone }) => {
  test.skip(phone, 'Started from a computer’s Chat; a phone’s is its + menu.');
  const space = await spaceWithInvite('Direct');
  await joinSpace(app, space.link, person('Ada'), phone);
  await joinSpace(second, await invite(space.id), person('Ben'), phone);
  // Ben opens Chat once, so that Ada's Chat knows him as one of the space's people.
  await second.getByRole('button', { name: 'Chat', exact: true }).click();
  await app.getByRole('button', { name: 'Chat', exact: true }).click();
  await app.getByRole('button', { name: 'New message…' }).first().click();
  const dialog = app.getByRole('dialog', { name: 'New message' });
  await dialog.getByPlaceholder('Find a person').fill('Ben');
  await app.getByRole('option', { name: /Ben/ }).or(dialog.getByRole('button', { name: /^Ben/ })).first().click();
  await dialog.getByRole('button', { name: 'Start' }).click();
  await typeInto(app.getByRole('textbox', { name: /^Message Ben/ }), 'Just between us');
  await app.keyboard.press('Enter');
  // Ben's Chat lists it under Direct messages, with Ada's name and how many are new.
  await second.getByRole('button', { name: /^Ada/ }).first().click({ timeout: 20_000 });
  await expect(second.getByText('Just between us', { exact: true }).first()).toBeVisible();
});

test('offline, the phone says so, and says it is back once online', async ({ app, phone }) => {
  test.skip(!phone, 'The strip is the phone’s; a computer says it in its status bar.');
  // It is about syncing: shown with a space that syncs.
  const space = await spaceWithInvite('Strip');
  await joinSpace(app, space.link, person('Ada'), phone);
  await app.context().setOffline(true);
  await app.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(app.getByText(/Offline/i).first()).toBeVisible({ timeout: 10_000 });
  await app.context().setOffline(false);
  await app.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(app.getByText(/Offline/i)).toHaveCount(0, { timeout: 15_000 });
});
