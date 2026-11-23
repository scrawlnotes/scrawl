import { browse, createNote, editor, expect, joinSpace, noteMenu, test, typeInto, vaultFile } from '../fixtures';
import { invite, person, spaceFile, spaceWithInvite } from '../server';

// Two devices that open, join and sync take longer than one.
test.describe.configure({ timeout: 90_000 });

test('a note written by one person shows on the other’s device in a shared space, and back', async ({ app, second, phone }) => {
  const space = await spaceWithInvite('Team');
  await joinSpace(app, space.link, person('Ada'), phone);
  await joinSpace(second, await invite(space.id), person('Ben'), phone);

  await createNote(app, phone, 'Plan', space.name);
  await typeInto(editor(app), 'From Ada');

  await browse(second, phone);
  const plan = second.getByRole('button', { name: 'Plan', exact: true });
  await expect(plan).toBeVisible({ timeout: 20_000 });
  await plan.click();
  await expect(editor(second)).toContainText('From Ada', { timeout: 20_000 });
  await editor(second).click();
  await second.keyboard.press('Control+End');
  await second.keyboard.type(' and Ben');

  await expect(editor(app)).toContainText('From Ada and Ben', { timeout: 20_000 });
});

test('a note moved from the personal space to a shared one reaches the other person, the original in the trash', async ({ app, second, phone }) => {
  test.skip(phone, 'Moved from a computer’s Move to; the phone’s is the same window.');
  const space = await spaceWithInvite('Team');
  await joinSpace(app, space.link, person('Ada'), phone);
  await joinSpace(second, await invite(space.id), person('Ben'), phone);
  await createNote(app, phone, 'Minutes');
  await typeInto(editor(app), 'Decisions of the week');
  await expect.poll(() => vaultFile(app, 'Minutes.md')).toBe('Decisions of the week');

  await noteMenu(app, phone, 'Minutes');
  await app.getByRole('menuitem', { name: 'Move to…' }).click();
  const move = app.getByRole('dialog', { name: 'Move to' });
  await move.getByRole('textbox', { name: 'Folder' }).fill(space.name);
  await move.getByRole('option', { name: new RegExp(space.name) }).first().click();
  await expect(app.getByText(new RegExp(`Moved to ${space.name}`)).first()).toBeVisible();
  // On the server in a moment, not at the next turn of the minute (design/e2e-findings.md H13).
  await expect.poll(() => spaceFile(space.id, 'Minutes.md'), { timeout: 10_000 }).toBe('Decisions of the week');

  await browse(second, phone);
  const minutes = second.getByRole('button', { name: 'Minutes', exact: true });
  await expect(minutes).toBeVisible({ timeout: 20_000 });
  await minutes.click();
  await expect(editor(second)).toContainText('Decisions of the week', { timeout: 20_000 });
});

test('the same line changed on two devices, one offline, keeps both: the other text in a conflict copy', async ({ app, second, phone }) => {
  test.skip(phone, 'Sync is the same on a phone; tried on a computer.');
  const space = await spaceWithInvite('Team');
  await joinSpace(app, space.link, person('Ada'), phone);
  await joinSpace(second, await invite(space.id), person('Ben'), phone);
  await createNote(app, phone, 'Plan', space.name);
  await typeInto(editor(app), 'Meet on Monday');
  await browse(second, phone);
  await second.getByRole('button', { name: 'Plan', exact: true }).click({ timeout: 20_000 });
  await expect(editor(second)).toContainText('Meet on Monday', { timeout: 20_000 });

  // Ben goes offline and changes the line; Ada changes it too, online.
  await second.context().setOffline(true);
  await second.evaluate(() => window.dispatchEvent(new Event('offline')));
  await editor(second).click();
  await second.keyboard.press('Control+End');
  await second.keyboard.type(' at ten');
  await expect.poll(() => vaultFile(second, 'Plan.md')).toBe('Meet on Monday at ten');
  await editor(app).click();
  await app.keyboard.press('Control+End');
  await app.keyboard.type(' at noon');
  await expect.poll(() => vaultFile(app, 'Plan.md')).toBe('Meet on Monday at noon');
  // Ada's change is on the server before Ben comes back.
  await expect.poll(() => spaceFile(space.id, 'Plan.md'), { timeout: 20_000 }).toBe('Meet on Monday at noon');

  await second.context().setOffline(false);
  await second.evaluate(() => window.dispatchEvent(new Event('online')));
  // Nothing is lost: one text stays Plan, the other is beside it as a conflict copy.
  await browse(second, phone);
  await expect(second.getByRole('button', { name: /^Plan \(conflict/ }).first()).toBeVisible({ timeout: 30_000 });
});
