import { type Page } from '@playwright/test';
import { browse, expect, test, undoInNotice } from '../fixtures';

async function openInbox(page: Page, phone: boolean) {
  await browse(page, phone);
  await page.getByRole('button', { name: /^Inbox( \d+)?$/ }).first().click();
}

// Adds a task from the list's own Add task, as a person does on each size.
async function addTask(page: Page, phone: boolean, name: string, today = false) {
  // On a phone the list's + (Create); on a computer the row at the end of the list, or the row still open.
  const composer = phone ? page.getByRole('dialog', { name: 'Add task' }) : page.locator('main');
  const opener = phone ? page.getByRole('button', { name: 'Create', exact: true }).last() : page.getByRole('button', { name: '+ Add task', exact: true });
  if (!(await composer.getByRole('textbox', { name: 'Task name' }).isVisible())) await opener.click();
  await composer.getByRole('textbox', { name: 'Task name' }).fill(name);
  if (today) {
    await composer.getByRole('button', { name: 'Date' }).click();
    await page.getByRole('button', { name: /^Today/ }).first().click();
  }
  await composer.getByRole('button', { name: phone ? 'Add' : 'Add task', exact: true }).last().click();
}

const row = (page: Page, name: string) => page.getByText(name, { exact: true }).first();

test('a task added to the Inbox is there after a reload', async ({ app, phone }) => {
  await openInbox(app, phone);
  await addTask(app, phone, 'Call the bank');
  if (phone) await app.keyboard.press('Escape');
  await expect(row(app, 'Call the bank')).toBeVisible();
  await app.reload();
  await openInbox(app, phone);
  await expect(row(app, 'Call the bank')).toBeVisible({ timeout: 15_000 });
});

test('a task ticked off goes, and Undo brings it back', async ({ app, phone }) => {
  await openInbox(app, phone);
  await addTask(app, phone, 'Water the plants');
  if (phone) await app.keyboard.press('Escape');
  await app.getByRole('checkbox', { name: /Water the plants/ }).click();
  await expect(row(app, 'Water the plants')).toBeHidden();
  await undoInNotice(app).click();
  await expect(row(app, 'Water the plants')).toBeVisible();
});

test('a task for today shows in Scheduled', async ({ app, phone }) => {
  await openInbox(app, phone);
  await addTask(app, phone, 'Send the invoice', true);
  if (phone) await app.keyboard.press('Escape');
  if (phone) await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Scheduled' }).click();
  else await app.getByRole('button', { name: 'Scheduled', exact: true }).first().click();
  await expect(row(app, 'Send the invoice')).toBeVisible();
});

test('a task added after one with a date starts with none', async ({ app, phone }) => {
  await openInbox(app, phone);
  await addTask(app, phone, 'Dated', true);
  await addTask(app, phone, 'Undated');
  await app.keyboard.press('Escape');
  await expect(row(app, 'Undated')).toBeVisible();
  // Only Dated shows a date: Today is written once in the list.
  await expect(app.getByText('Today', { exact: true })).toHaveCount(1);
});
