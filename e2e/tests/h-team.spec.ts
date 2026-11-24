import { type Page } from '@playwright/test';
import { expect, joinSpace, test } from '../fixtures';
import { invite, person, spaceWithInvite } from '../server';

// Two people in one space take longer than one device.
test.describe.configure({ timeout: 90_000 });

/** Ada and Ben in a space of their own; Ada's device is `app`, with a Simple board in the space open. */
async function teamBoard(app: Page, second: Page) {
  const space = await spaceWithInvite('Team');
  await joinSpace(app, space.link, person('Ada'), false);
  await joinSpace(second, await invite(space.id), person('Ben'), false);
  await app.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
  await app.getByRole('option', { name: /^4 Board/ }).click();
  const dialog = app.getByRole('dialog', { name: 'New board' });
  await dialog.getByRole('radio', { name: /^Simple/ }).click();
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Launch');
  await dialog.getByRole('button', { name: /^Folder/ }).click();
  await app.getByRole('option', { name: space.name }).or(app.getByRole('button', { name: space.name })).last().click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(app.getByRole('heading', { name: /^Todo/ })).toBeVisible({ timeout: 15_000 });
  await app.getByRole('button', { name: /Add card$/ }).first().click();
  await app.locator('main').getByRole('textbox', { name: 'Card title' }).fill('Book the venue');
  await app.keyboard.press('Enter');
  await app.keyboard.press('Escape');
  await app.getByText('Book the venue', { exact: true }).first().click();
  return app.getByRole('dialog', { name: /Book the venue|^LAU-1/ });
}

test('a card given to someone can be reminded of, once in a while', async ({ app, second, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  const card = await teamBoard(app, second);
  await card.locator('#card-assignee').click();
  await app.getByRole('option', { name: /Ben/ }).first().click();
  await expect(card.locator('#card-assignee')).toContainText('Ben');
  // Reminding is told to Ben (by push: the server's tests); here, the button says it was done.
  await card.getByRole('button', { name: 'Remind Ben' }).click();
  await expect(card.getByRole('button', { name: 'Reminded just now' })).toBeDisabled();
});

test('@ in a comment offers the space’s people, and the one picked is written', async ({ app, second, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  const card = await teamBoard(app, second);
  const box = card.getByRole('textbox', { name: 'Write a comment…' });
  await box.click();
  await expect(box).toBeFocused();
  await app.keyboard.type('Ask @Be');
  await app.getByRole('option', { name: /Ben/ }).first().click();
  await app.keyboard.type('about the price');
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(card.getByText(/Ask @Ben\s+about the price/).first()).toBeVisible();
});

/** Ada and Ben in a space of their own, both on its #general. */
async function teamChat(app: Page, second: Page) {
  const space = await spaceWithInvite('Talk');
  await joinSpace(app, space.link, person('Ada'), false);
  await joinSpace(second, await invite(space.id), person('Ben'), false);
  for (const page of [app, second]) await page.getByRole('button', { name: 'Chat', exact: true }).click();
  return space;
}

test('a file sent in a message reaches the other person, with its name', async ({ app, second, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await teamChat(app, second);
  const picking = app.waitForEvent('filechooser');
  // The message box's +; the list of conversations has an Add of its own, for rooms.
  await app.getByRole('button', { name: 'Add', exact: true }).last().click();
  await app.getByRole('menuitem', { name: 'Photos and files' }).click();
  await (await picking).setFiles({ name: 'agenda.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await app.keyboard.press('Enter');
  await expect(second.getByText('agenda.pdf').first()).toBeVisible({ timeout: 20_000 });
});

test('@ in a message offers the room’s people, and the one picked is written', async ({ app, second, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await teamChat(app, second);
  const box = app.getByRole('textbox', { name: 'Message #general' });
  await box.click();
  await expect(box).toBeFocused();
  await app.keyboard.type('Thanks @Be');
  await app.getByRole('option', { name: /Ben/ }).first().click();
  await app.keyboard.press('Enter');
  await expect(second.getByText(/Thanks @Ben/).first()).toBeVisible({ timeout: 20_000 });
});

test('@ in a message being changed offers the room’s people too', async ({ app, second, phone }) => {
  test.skip(phone, 'Desktop only.');
  await teamChat(app, second);
  const box = app.getByRole('textbox', { name: 'Message #general' });
  await box.click();
  await app.keyboard.type('See you');
  await app.keyboard.press('Enter');
  // Sent, not still on its way: only then is it there to change.
  await expect(second.getByText('See you').first()).toBeVisible({ timeout: 20_000 });
  await app.locator('.ch-m', { hasText: 'See you' }).last().click({ button: 'right' });
  await app.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(app.locator('.ch-edit-box .cm-content')).toBeFocused();
  await app.keyboard.type(' @Be');
  await app.getByRole('option', { name: /Ben/ }).first().click();
  // The click on the list keeps the change going; Enter keeps it.
  await expect(app.locator('.ch-editing')).toBeVisible();
  await app.keyboard.press('Enter');
  await expect(second.getByText(/See you @Ben/).first()).toBeVisible({ timeout: 20_000 });
});

test('a shared space’s People lists who is in it', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  const space = await spaceWithInvite('Crew');
  await joinSpace(app, space.link, person('Ada'), false);
  await app.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = app.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: /^Spaces/ }).first().click();
  await settings.getByText(space.name, { exact: true }).click();
  // Each with their role or a you after the name.
  for (const name of [/^Olive Owner/, /^Ada/]) await expect(settings.getByText(name).first()).toBeVisible({ timeout: 15_000 });
});
