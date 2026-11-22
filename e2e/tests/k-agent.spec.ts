import { expect, joinSpace, test } from '../fixtures';
import { agentOf, person, spaceWithInvite } from '../server';

test.describe.configure({ timeout: 90_000 });

test("a note an agent writes in the person's space opens in their app within seconds", async ({ app, phone }) => {
  test.skip(phone, 'At computer size; the phone in its own slice.');
  const space = await spaceWithInvite('Agent');
  const ada = person('Ada');
  await joinSpace(app, space.link, ada);

  const call = await agentOf(ada);
  await call('write', { space: space.name, path: 'Standup.md', text: 'Written by the agent' });

  const note = app.getByRole('button', { name: 'Standup', exact: true });
  await expect(note).toBeVisible({ timeout: 20_000 });
  await note.click();
  await expect(app.locator('[contenteditable="true"]').first()).toContainText('Written by the agent');
});

test("a task an agent adds shows in the person's list, made by the agent", async ({ app, phone }) => {
  test.skip(phone, 'At computer size; the phone in its own slice.');
  const space = await spaceWithInvite('Agent');
  const ada = person('Ada');
  await joinSpace(app, space.link, ada);

  const call = await agentOf(ada, 'Claude');
  await call('create', { space: space.name, kind: 'tasks', name: 'Launch' });
  await call('save_task', { list: 'Launch', space: space.name, title: 'Draft the announcement' });

  const list = app.getByRole('button', { name: /^Launch( \d+)?$/ });
  await expect(list).toBeVisible({ timeout: 20_000 });
  await list.click();
  await expect(app.getByText('Draft the announcement')).toBeVisible({ timeout: 20_000 });
});
