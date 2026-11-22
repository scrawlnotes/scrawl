import { test as base, expect, type Page } from '@playwright/test';

// What every test gets: a new device (empty OPFS and storage) opened on Scrawl, and whether it is the phone.
export const test = base.extend<{ app: Page; phone: boolean }>({
  phone: async ({}, use, info) => use(info.project.name === 'phone'),
  app: async ({ page }, use) => {
    // An error nothing caught fails the test that met it, whatever the test was about.
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    // The welcome note opens on a new device once the space is ready. Dev serves the app's modules one by one: with several devices opening at once this takes a while.
    await expect(page.getByText('Welcome to Scrawl').first()).toBeVisible({ timeout: 30_000 });
    await use(page);
    expect(errors, 'errors in the page').toEqual([]);
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
    await page.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
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

// A file of this device's vault, by its name, as saved: what the app wrote, not what it shows. Null when none.
export const vaultFile = (page: Page, name: string) =>
  page.evaluate(async (name) => {
    const find = async (dir: FileSystemDirectoryHandle): Promise<string | null> => {
      // @ts-expect-error entries() is in every browser that has OPFS.
      for await (const [entry, handle] of dir.entries()) {
        // A file moved (to the trash) while it is read is not there.
        if (handle.kind === 'file' && entry === name) return (await handle.getFile().catch(() => null))?.text() ?? null;
        if (handle.kind === 'directory') {
          const found = await find(handle).catch(() => null);
          if (found !== null) return found;
        }
      }
      return null;
    };
    return find(await navigator.storage.getDirectory());
  }, name);

// Opens a note's menu: the sidebar row's on a computer, the note's More on a phone (the note open).
export async function noteMenu(page: Page, phone: boolean, name: string) {
  if (phone) await page.getByRole('button', { name: 'More' }).click();
  else await page.getByRole('button', { name, exact: true }).first().click({ button: 'right' });
}

// Browse on a phone; the sidebar is always there on a computer.
export async function browse(page: Page, phone: boolean) {
  if (phone) await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Browse' }).click();
}
