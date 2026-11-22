import { test as base, expect, type Locator, type Page } from '@playwright/test';

// Opens Scrawl on a page of a new device and waits for it to be ready; what nothing caught in it is kept.
async function openDevice(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  // The welcome note opens on a new device once the space is ready. Dev serves the app's modules one by one: with several devices opening at once this takes a while.
  await expect(page.getByText('Welcome to Scrawl').first()).toBeVisible({ timeout: 30_000 });
}

// What every test gets: a new device (empty OPFS and storage) opened on Scrawl, and whether it is the phone.
// `second` is another device, of another person when a test has them join: a browser of its own, the same size.
export const test = base.extend<{ app: Page; phone: boolean; second: Page }>({
  phone: async ({}, use, info) => use(info.project.name === 'phone'),
  app: async ({ page }, use) => {
    // An error nothing caught fails the test that met it, whatever the test was about.
    const errors: string[] = [];
    await openDevice(page, errors);
    await use(page);
    expect(errors, 'errors in the page').toEqual([]);
  },
  second: async ({ browser }, use, info) => {
    const { viewport, deviceScaleFactor, isMobile, hasTouch, baseURL } = info.project.use;
    const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, baseURL });
    const page = await context.newPage();
    const errors: string[] = [];
    await openDevice(page, errors);
    await use(page);
    await context.close();
    expect(errors, 'errors in the second device').toEqual([]);
  },
});

export { expect };

// Joins a space of the test server from its invite link, as a new person: on a phone from Settings ›
// Spaces, in sheets one after another; on a computer from Sync, in one window.
export async function joinSpace(page: Page, link: string, who: { name: string; email: string; password: string }, phone = false) {
  if (phone) {
    await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Spaces/ }).first().click();
    await page.getByRole('button', { name: 'Add space' }).click();
    await page.getByRole('button', { name: /^Location/ }).click();
    await page.getByRole('button', { name: 'Connect a server…' }).click();
    const sheet = page.getByRole('dialog', { name: 'Connect a server' });
    await sheet.getByRole('textbox', { name: 'Server address or invite link' }).fill(link);
    await sheet.getByRole('button', { name: 'Continue' }).click();
    await sheet.getByRole('textbox', { name: 'Name' }).fill(who.name);
    await sheet.getByRole('textbox', { name: 'Email' }).fill(who.email);
    await sheet.getByRole('textbox', { name: 'Password' }).fill(who.password);
    await sheet.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 });
    return;
  }
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await page.getByRole('button', { name: /Add space/ }).click();
  await page.getByRole('button', { name: 'Connect a server…' }).click();
  // Within Add space: Settings under it has a Name of its own, the device's.
  const add = page.getByRole('dialog', { name: 'Add space' });
  await add.getByRole('textbox', { name: 'Server address or invite link' }).fill(link);
  await add.getByRole('textbox', { name: 'Name' }).fill(who.name);
  await add.getByRole('textbox', { name: 'Email' }).fill(who.email);
  await add.getByRole('textbox', { name: 'Password' }).fill(who.password);
  await add.getByRole('button', { name: /^Join / }).click();
  await expect(add).toBeHidden({ timeout: 20_000 });
  // Settings stays on the space joined; closed to work in it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// Makes a note from the Create window, as a person does, and leaves it open: in Personal, or in `space`.
export async function createNote(page: Page, phone: boolean, name: string, space?: string) {
  if (phone) {
    await browse(page, phone);
    await page.getByRole('button', { name: 'Create' }).last().click();
    await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Note/ }).click();
  } else {
    await page.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
    await page.getByRole('option', { name: /^2 Note/ }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'New note' });
  await dialog.getByPlaceholder('Optional · Named by its first line').fill(name);
  if (space) {
    await dialog.getByRole('button', { name: /^Folder/ }).click();
    await page.getByRole('option', { name: space }).or(page.getByRole('button', { name: space })).last().click();
  }
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
}

// Opens a note from Browse (phone) or the sidebar (desktop).
export async function openNote(page: Page, phone: boolean, name: string) {
  await browse(page, phone);
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
    // A folder changing while it is walked (a file moving to the trash) is walked again.
    for (let tries = 0; ; tries++) {
      try {
        return await find(await navigator.storage.getDirectory());
      } catch (error) {
        if (tries === 4) throw error;
        await new Promise((done) => setTimeout(done, 100));
      }
    }
  }, name);

// Opens a note's menu: the sidebar row's on a computer, the note's More on a phone (the note open).
export async function noteMenu(page: Page, phone: boolean, name: string) {
  if (phone) await page.getByRole('button', { name: 'More' }).click();
  else await page.getByRole('button', { name, exact: true }).first().click({ button: 'right' });
}

// The Undo of the notice (the status bar's or a toast), not the editor's Undo in its format bar.
export const undoInNotice = (page: Page) => page.locator('.toast, .mb-toast, .notice').getByRole('button', { name: 'Undo' });

// Browse on a phone; the sidebar is always there on a computer.
export async function browse(page: Page, phone: boolean) {
  if (!phone) return;
  const tab = page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Browse' });
  await tab.click();
  // Back on Browse its page left open shows (a note); Browse again goes to its top, as on an iPhone.
  const top = page.getByRole('heading', { name: 'Browse', level: 1 });
  if (!(await top.isVisible())) await tab.click();
  await expect(top).toBeVisible();
}

// Taps a field and types in it once it has the keyboard. A phone's empty editor first hands the
// keyboard to a hidden field for a moment, so that it starts on a capital (packages/editor
// handKeyboard): a person cannot type in that moment, a test on a slow computer would.
export async function typeInto(field: Locator, text: string) {
  await field.click();
  await expect(field).toBeFocused();
  await field.page().keyboard.type(text);
}
