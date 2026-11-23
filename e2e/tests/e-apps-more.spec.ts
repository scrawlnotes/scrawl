import { type Page } from '@playwright/test';
import { expect, test } from '../fixtures';

// A collection made from the Companies template, from the tab bar's +.
async function createCompanies(page: Page, name: string) {
  await page.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
  await page.getByRole('option', { name: /Collection/ }).click();
  await page.getByRole('radio', { name: /^Companies/ }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('dialog', { name: /New collection/ }).getByRole('button', { name: 'Create' }).click();
}

test('rows imported from a CSV become records; a new choice is added, a worked-out column goes nowhere', async ({ app, phone }) => {
  test.skip(phone, 'Import is a computer’s: a file chosen from a folder.');
  await createCompanies(app, 'Clients');
  await app.getByRole('complementary').getByRole('button', { name: /^Clients/ }).first().click({ button: 'right' });
  const picking = app.waitForEvent('filechooser');
  await app.getByRole('menuitem', { name: 'Import…' }).click();
  // A new Segment (Startup) becomes one of its choices. Last contact is worked out from activities, as
  // an export writes it: it goes nowhere, and no second Last contact is made (design/e2e-findings.md H12).
  const csv = ['Name,Website,Segment,Last contact', 'Acme,acme.example,SMB,2026-11-02', 'Globex,globex.example,Startup,2026-11-03', ''].join('\n');
  await (await picking).setFiles({ name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await app.getByRole('button', { name: 'Import 2 rows' }).click();
  const table = app.getByRole('table', { name: 'Clients' });
  await expect(table.getByText('Acme', { exact: true })).toBeVisible();
  await expect(table.getByText('Globex', { exact: true })).toBeVisible();
  await expect(table.getByText('Startup')).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Last contact' })).toHaveCount(1);
});

test('a collection exported as CSV gives its records', async ({ app, phone }) => {
  test.skip(phone, 'The phone shares the file instead of downloading it.');
  await createCompanies(app, 'Partners');
  await app.getByRole('button', { name: 'Add record' }).click();
  const form = app.getByRole('dialog', { name: /New company|New record/ });
  await form.getByRole('textbox', { name: 'Name' }).fill('Initech');
  await form.getByRole('textbox', { name: 'Website' }).fill('initech.example');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(app.getByRole('table', { name: 'Partners' }).getByText('Initech', { exact: true })).toBeVisible();
  await app.getByRole('complementary').getByRole('button', { name: /^Partners/ }).first().click({ button: 'right' });
  const download = app.waitForEvent('download');
  await app.getByRole('menuitem', { name: 'Export as CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Partners.csv');
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(await file.path(), 'utf8');
  expect(text).toContain('Initech');
  expect(text).toContain('initech.example');
});

test('a table view added to a collection is a tab of its own, there after a reload', async ({ app, phone }) => {
  test.skip(phone, 'Views are made on a computer; a phone opens them.');
  await createCompanies(app, 'Leads');
  await app.getByRole('button', { name: 'Add a view' }).click();
  await app.getByRole('menuitem', { name: 'Table' }).click();
  await app.getByRole('textbox', { name: 'View name' }).fill('Mine');
  await app.keyboard.press('Enter');
  await expect(app.getByRole('tab', { name: 'Mine' })).toHaveAttribute('aria-selected', 'true');
  await app.reload();
  await app.getByRole('complementary').getByRole('button', { name: /^Leads/ }).first().click();
  await expect(app.getByRole('tab', { name: 'Mine' })).toBeVisible({ timeout: 15_000 });
});

test('Gym sets up from New app and opens on its Home', async ({ app, phone }) => {
  test.skip(phone, 'Set up on a computer; the phone’s wizard is CRM’s test.');
  await app.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
  await app.getByRole('option', { name: /^7 App/ }).click();
  const wizard = app.getByRole('dialog', { name: 'New app' });
  await wizard.getByRole('radio', { name: 'Personal' }).click();
  await wizard.getByRole('checkbox', { name: /^Gym/ }).click();
  const go = wizard.getByRole('button', { name: /^(Next|Create)$/ });
  for (let step = 0; step < 6; step++) {
    await expect(go).toHaveCount(1);
    const name = await go.textContent();
    await go.click();
    if (name === 'Create') break;
  }
  await expect(wizard).toBeHidden();
  await app.getByRole('complementary').getByRole('button', { name: /^Gym/ }).first().click();
  await expect(app.getByRole('tablist', { name: 'Gym' })).toBeVisible();
});
