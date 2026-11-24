import { type Page } from '@playwright/test';
import { browse, expect, test, wizardTo } from '../fixtures';

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

test('on a phone CRM sets up from Create and a company is added from +', async ({ app, phone }) => {
  test.skip(!phone);
  await browse(app, phone);
  await app.getByRole('button', { name: 'Create' }).last().click();
  await app.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^App/ }).click();
  const wizard = app.getByRole('dialog', { name: 'New app' });
  await wizard.getByRole('radio', { name: 'Business' }).click();
  await wizard.getByRole('checkbox', { name: /^CRM/ }).click();
  // The phone's steps are sheets: Next until Create.
  await (await wizardTo(wizard, 'Create')).click();

  await browse(app, phone);
  await app.getByRole('button', { name: /^CRM/ }).first().click();
  await app.getByRole('button', { name: /^Companies/ }).first().click();
  // Empty, it says so; adding is the + alone (design/e2e-findings.md U8).
  await expect(app.getByText('No records yet')).toBeVisible();
  await expect(app.getByRole('button', { name: 'Add record' })).toHaveCount(0);
  await app.getByRole('button', { name: 'Create', exact: true }).last().click();
  const form = app.getByRole('dialog', { name: 'New company' });
  await expect(form.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await app.keyboard.type('Acme');
  await expect(form.getByRole('textbox', { name: 'Add a note…' })).toBeVisible();
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(app.getByText('Acme', { exact: true }).first()).toBeVisible();
});
