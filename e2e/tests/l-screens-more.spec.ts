import { type Page } from '@playwright/test';
import { createNote, editor, expect, test, typeInto, vaultFile } from '../fixtures';

async function openSearch(page: Page, phone: boolean) {
  if (phone) await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Search' }).click();
  else await page.keyboard.press('Control+k');
}

test('a search made once is offered again under Recent searches', async ({ app, phone }) => {
  await createNote(app, phone, 'Budget');
  await typeInto(editor(app), 'Quarterly numbers');
  if (!phone) await app.getByRole('tab', { name: /Welcome to Scrawl/ }).click();
  await openSearch(app, phone);
  const box = phone ? app.getByRole('searchbox', { name: 'Search' }) : app.getByRole('combobox', { name: 'Search' });
  await box.fill('quarterly');
  await app.getByRole(phone ? 'button' : 'option', { name: /^Budget/ }).first().click();
  await expect(editor(app)).toContainText('Quarterly numbers');
  await openSearch(app, phone);
  // A phone's Search keeps what was looked for, as iPhone's does; Cancel empties it.
  if (phone) await app.getByRole('button', { name: 'Cancel' }).click();
  await expect(app.getByText('Recent searches').first()).toBeVisible();
  await expect(app.getByText('quarterly', { exact: true }).first()).toBeVisible();
});

test('a file uploaded in Files is listed there', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await app.getByRole('button', { name: /^Files/ }).first().click();
  const picking = app.waitForEvent('filechooser');
  await app.getByRole('button', { name: 'Upload' }).click();
  await (await picking).setFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await expect(app.getByText('contract.pdf').first()).toBeVisible();
});

test('a key added to a Keys file is kept, its value hidden until shown', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await app.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
  await app.getByRole('option', { name: /Keys/ }).click();
  await app.getByRole('textbox', { name: 'Name' }).fill('Servers');
  await app.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await app.getByRole('button', { name: 'Add key' }).first().click();
  await app.getByRole('textbox', { name: 'Key' }).fill('API_TOKEN');
  await app.getByRole('textbox', { name: 'Value' }).fill('s3cret-value');
  await app.keyboard.press('Enter');
  await expect(app.getByText('API_TOKEN').first()).toBeVisible();
  // Hidden until Show value.
  await expect(app.getByText('s3cret-value')).toHaveCount(0);
  await app.getByRole('button', { name: 'Show value' }).first().click();
  await expect(app.getByText('s3cret-value').first()).toBeVisible();
  await expect.poll(async () => (await vaultFile(app, 'Servers.env')) ?? '').toContain('API_TOKEN=s3cret-value');
});
