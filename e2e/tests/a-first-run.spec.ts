import { createNote, expect, test } from '../fixtures';

test('a new device opens on the welcome note, and closing it shows the start page', async ({ app, phone }) => {
  test.skip(phone, 'The phone has no tabs or start page.');
  await expect(app.getByRole('tab', { name: /Welcome to Scrawl/ })).toBeVisible();
  await app.getByRole('tab').getByRole('button', { name: /Close/ }).click();
  await expect(app.getByText('Start from a template')).toBeVisible();
  // The start page's Note makes a note.
  await app.getByRole('button', { name: /^Note/ }).first().click();
  await expect(app.getByRole('dialog', { name: 'New note' })).toBeVisible();
});

test('the phone opens on the welcome note, with Browse one tap away', async ({ app, phone }) => {
  test.skip(!phone);
  await app.getByRole('button', { name: 'Back to Browse' }).click();
  await expect(app.getByRole('heading', { name: 'Browse', level: 1 })).toBeVisible();
  for (const row of ['Quick notes', 'Inbox', 'Files', 'Trash']) await expect(app.getByRole('button', { name: row, exact: true })).toBeVisible();
});

test('the personal space syncs to OneDrive, and a note made before goes with it', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await createNote(app, phone, 'Before sync');

  await app.getByRole('button', { name: 'Sync', exact: true }).click();
  await app.getByRole('button', { name: /^Personal/ }).last().click();
  await app.getByRole('button', { name: 'Sync…' }).click();
  await app.getByRole('radio', { name: /OneDrive/ }).click();
  await app.getByRole('button', { name: 'Connect OneDrive' }).click();
  const choose = app.getByRole('dialog', { name: 'Choose a folder in OneDrive' });
  await choose.getByRole('button', { name: /^Use/ }).click();
  await app.getByRole('button', { name: 'Sync with OneDrive' }).click();

  // The fake OneDrive of dev holds what was sent.
  await expect
    .poll(() => app.evaluate(async () => (await import('/src/cloud.ts')).fakeGraph()?.paths('Scrawl').some((p: string) => p.endsWith('Before sync.md'))), { timeout: 20_000 })
    .toBe(true);
});
