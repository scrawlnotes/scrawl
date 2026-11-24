import { expect, joinSpace, test } from '../fixtures';
import { makeAdmin, person, SERVER, spaceWithInvite } from '../server';

// A newer version of the server out: its owner and admins are told, a member is not, and the
// notice opens Help where it says how to update. The test server says a newer one is out here.
test('an admin is told of a newer version of the server, and sent to Help on updating it', async ({ app, phone }) => {
  test.skip(phone, 'The status bar is the computer’s; a phone has the same line on the server’s page.');
  await app.route('**/api/v1/server', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), latest: '99.0.0' } });
  });
  const space = await spaceWithInvite('Updates');
  const who = person('Ada');
  await joinSpace(app, space.link, who);
  const notice = app.getByRole('button', { name: 'Server update: 99.0.0' });
  await expect(notice).toHaveCount(0);

  // Made an admin, the server's page says so and shows the version out; opened again, the app tells.
  await makeAdmin(who.email);
  await app.getByRole('button', { name: 'Settings', exact: true }).click();
  await app.getByRole('button', { name: /^Spaces/ }).first().click();
  await app.getByRole('dialog').getByRole('button').filter({ hasText: new URL(SERVER).host }).filter({ hasText: /spaces? here/ }).click();
  await expect(app.getByText(/· 99\.0\.0 is out/)).toBeVisible();
  await app.reload();
  await notice.click();
  await expect(app.getByRole('heading', { name: 'Updating' }).or(app.getByText('Updating', { exact: true })).first()).toBeVisible();
});
