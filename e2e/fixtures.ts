import { test as base, expect, type Page } from '@playwright/test';

// What every test gets: a new device (empty OPFS and storage) opened on Scrawl, and whether it is the phone.
export const test = base.extend<{ app: Page; phone: boolean }>({
  phone: async ({}, use, info) => use(info.project.name === 'phone'),
  app: async ({ page }, use) => {
    await page.goto('/');
    // The welcome note opens on a new device once the space is ready. Dev serves the app's modules one by one: with several devices opening at once this takes a while.
    await expect(page.getByText('Welcome to Scrawl').first()).toBeVisible({ timeout: 30_000 });
    await use(page);
  },
});

export { expect };

// Makes a note in Personal from the Create window, as a person does, and leaves it open.
export async function createNote(page: Page, phone: boolean, name: string) {
  if (phone) {
    await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Browse' }).click();
    await page.getByRole('button', { name: 'Create' }).last().click();
    await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Note/ }).click();
  } else {
    await page.getByRole('tablist').getByRole('button', { name: '+' }).click();
    await page.getByRole('option', { name: /^2 Note/ }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'New note' });
  await dialog.getByPlaceholder('Optional · Named by its first line').fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
}

// Opens a note from Browse (phone) or the sidebar (desktop).
export async function openNote(page: Page, phone: boolean, name: string) {
  if (phone) await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Browse' }).click();
  await page.getByRole('button', { name, exact: true }).first().click();
}

export const editor = (page: Page) => page.locator('[contenteditable="true"]').first();
