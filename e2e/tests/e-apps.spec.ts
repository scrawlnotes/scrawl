import { type Page } from '@playwright/test';
import { expect, test } from '../fixtures';

// The CRM template, set up from New app with every answer as it opens.
async function installCrm(page: Page) {
  await page.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
  await page.getByRole('option', { name: /^7 App/ }).click();
  const wizard = page.getByRole('dialog', { name: 'New app' });
  await wizard.getByRole('radio', { name: 'Business' }).click();
  await wizard.getByRole('checkbox', { name: /^CRM/ }).click();
  for (const step of ['Next', 'Next', 'Next', 'Create']) await wizard.getByRole('button', { name: step, exact: true }).click();
  await expect(wizard).toBeHidden();
}

const openCrm = (page: Page) => page.getByRole('complementary').getByRole('button', { name: /^CRM/ }).first().click();

test('CRM sets up from New app and opens on its Home', async ({ app, phone }) => {
  test.skip(phone, 'Set up on a computer; the phone opens what it made.');
  await installCrm(app);
  await expect(app.getByRole('tab', { name: 'About CRM' })).toBeVisible();
  await openCrm(app);
  const modules = app.getByRole('tablist', { name: 'CRM' });
  for (const tab of ['Home', 'Deals', 'Companies', 'People', 'Activities']) await expect(modules.getByRole('tab', { name: tab })).toBeVisible();
  await expect(app.getByRole('button', { name: /^Pipeline 0 open/ })).toBeVisible();
});

test('a company added from its form is in the table, and there after a reload', async ({ app, phone }) => {
  test.skip(phone, 'Set up on a computer.');
  await installCrm(app);
  await openCrm(app);
  await app.getByRole('tab', { name: 'Companies' }).click();
  await app.getByRole('button', { name: 'Add record' }).click();
  const form = app.getByRole('dialog', { name: 'New company' });
  // A new company starts at its name.
  await expect(form.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await app.keyboard.type('Acme');
  await form.getByRole('textbox', { name: 'City' }).fill('Izmir');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(app.getByRole('table', { name: 'Companies' }).getByText('Acme')).toBeVisible();

  await app.reload();
  await openCrm(app);
  await app.getByRole('tab', { name: 'Companies' }).click();
  await expect(app.getByRole('table', { name: 'Companies' }).getByText('Izmir')).toBeVisible({ timeout: 15_000 });
});
