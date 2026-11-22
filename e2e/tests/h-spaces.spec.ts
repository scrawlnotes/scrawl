import { createNote, editor, expect, joinSpace, test } from '../fixtures';
import { invite, person, spaceWithInvite } from '../server';

// Two devices that open, join and sync take longer than one.
test.describe.configure({ timeout: 90_000 });

test('a note written by one person shows on the other’s device in a shared space, and back', async ({ app, second, phone }) => {
  test.skip(phone, 'Two devices at computer size; the phone joins in its own slice.');
  const space = await spaceWithInvite('Team');
  await joinSpace(app, space.link, person('Ada'));
  await joinSpace(second, await invite(space.id), person('Ben'));

  await createNote(app, false, 'Plan', space.name);
  await editor(app).click();
  await app.keyboard.type('From Ada');

  const plan = second.getByRole('button', { name: 'Plan', exact: true });
  await expect(plan).toBeVisible({ timeout: 20_000 });
  await plan.click();
  await expect(editor(second)).toContainText('From Ada', { timeout: 20_000 });
  await editor(second).click();
  await second.keyboard.press('Control+End');
  await second.keyboard.type(' and Ben');

  await expect(editor(app)).toContainText('From Ada and Ben', { timeout: 20_000 });
});
