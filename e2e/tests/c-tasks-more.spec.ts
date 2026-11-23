import { type Page } from '@playwright/test';
import { browse, expect, test, vaultFile } from '../fixtures';

interface Saved {
  title: string;
  priority: number;
  parent: string | null;
  section?: string | null;
  labels?: string[];
  id: string;
  order: number;
}

async function openInbox(page: Page, phone: boolean) {
  await browse(page, phone);
  await page.getByRole('button', { name: /^Inbox( \d+)?$/ }).first().click();
}

const composerOf = (page: Page, phone: boolean) => (phone ? page.getByRole('dialog', { name: 'Add task' }) : page.locator('main'));

async function openComposer(page: Page, phone: boolean) {
  const composer = composerOf(page, phone);
  const opener = phone ? page.getByRole('button', { name: 'Create', exact: true }).last() : page.getByRole('button', { name: '+ Add task', exact: true });
  if (!(await composer.getByRole('textbox', { name: 'Task name' }).isVisible())) await opener.click();
  return composer;
}

const add = (page: Page, phone: boolean) => composerOf(page, phone).getByRole('button', { name: phone ? 'Add' : 'Add task', exact: true }).last().click();

/** The Inbox's tasks as written. */
async function inbox(page: Page): Promise<{ tasks: Saved[]; sections: { id: string; name: string }[] }> {
  const text = await vaultFile(page, 'Inbox.tasks.json');
  return text ? JSON.parse(text) : { tasks: [], sections: [] };
}
/** Titles in the order the list shows them: by `order`. */
const ordered = (tasks: Saved[]) => [...tasks].sort((a, b) => a.order - b.order).map((task) => task.title);
const titled = async (page: Page, title: string) => (await inbox(page)).tasks.find((task) => task.title === title);

test('a task added with Priority 1 is saved with it', async ({ app, phone }) => {
  await openInbox(app, phone);
  const composer = await openComposer(app, phone);
  await composer.getByRole('textbox', { name: 'Task name' }).fill('Renew passport');
  await composer.getByRole('button', { name: 'Priority' }).click();
  await app.getByRole('menuitem', { name: /Priority 1/ }).or(app.getByRole('option', { name: /Priority 1/ })).first().click();
  await add(app, phone);
  await expect.poll(async () => (await titled(app, 'Renew passport'))?.priority).toBe(1);
});

test('a label typed in the composer is made and put on the task', async ({ app, phone }) => {
  await openInbox(app, phone);
  const composer = await openComposer(app, phone);
  await composer.getByRole('textbox', { name: 'Task name' }).fill('Buy paint');
  await composer.getByRole('button', { name: 'Labels' }).click();
  await app.getByRole('combobox', { name: 'Find or create a label' }).or(app.getByPlaceholder('Find or create a label')).first().fill('home');
  await app.getByText('Create “home”').click();
  if (phone) await app.getByRole('dialog', { name: /^Labels/ }).getByRole('button', { name: 'Close' }).click();
  else await app.keyboard.press('Escape');
  await add(app, phone);
  await expect.poll(async () => (await titled(app, 'Buy paint'))?.labels).toEqual(['home']);
});

test('a subtask added in a task is saved under it', async ({ app, phone }) => {
  await openInbox(app, phone);
  await openComposer(app, phone);
  await composerOf(app, phone).getByRole('textbox', { name: 'Task name' }).fill('Move house');
  await add(app, phone);
  await app.keyboard.press('Escape');
  // A computer's row has it among its actions, shown on hover; a phone's task page has it under the task.
  if (phone) await app.getByText('Move house', { exact: true }).first().click();
  else await app.getByText('Move house', { exact: true }).first().hover();
  await app.getByRole('button', { name: 'Add subtask' }).first().click();
  await app.getByRole('textbox', { name: /Subtask name|Task name/ }).last().fill('Book the van');
  await app.keyboard.press('Enter');
  await expect.poll(async () => {
    const parent = await titled(app, 'Move house');
    return (await titled(app, 'Book the van'))?.parent === parent?.id && !!parent;
  }).toBe(true);
});

test('a section added to a list is saved in it', async ({ app, phone }) => {
  test.skip(phone, 'A section is added from the list’s menu on a phone; this is the computer’s row.');
  await openInbox(app, phone);
  await app.getByRole('button', { name: 'Add section' }).first().click();
  await app.getByRole('textbox', { name: 'Section name' }).fill('Errands');
  await app.keyboard.press('Enter');
  await expect.poll(async () => (await inbox(app)).sections.map((section) => section.name)).toEqual(['Errands']);
});

test('a task dragged above another goes before it', async ({ app, phone }) => {
  test.skip(phone, 'Dragging is a computer’s; a phone holds a row to move it.');
  await openInbox(app, phone);
  for (const name of ['Alpha', 'Beta']) {
    await openComposer(app, phone);
    await composerOf(app, phone).getByRole('textbox', { name: 'Task name' }).fill(name);
    await add(app, phone);
  }
  await app.keyboard.press('Escape');
  await expect.poll(async () => ordered((await inbox(app)).tasks)).toEqual(['Alpha', 'Beta']);
  // By the grip that shows on the row's left as the pointer is over it, to the top of Alpha's row.
  const beta = app.getByText('Beta', { exact: true }).first();
  await beta.hover();
  const grip = app.locator('[data-row="task"]').filter({ has: beta }).getByTitle('Drag to move');
  // Straight up, to the top of Alpha's row: a drop further right would put it under the task above, as a subtask.
  const gripBox = (await grip.boundingBox())!;
  const alphaBox = (await app.locator('[data-row="task"]').filter({ has: app.getByText('Alpha', { exact: true }) }).boundingBox())!;
  await app.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await app.mouse.down();
  await app.mouse.move(gripBox.x + gripBox.width / 2, alphaBox.y + 2, { steps: 10 });

  await app.mouse.up();
  await expect.poll(async () => ordered((await inbox(app)).tasks)).toEqual(['Beta', 'Alpha']);
});

async function addWith(page: Page, phone: boolean, title: string, label: string) {
  const composer = await openComposer(page, phone);
  await composer.getByRole('textbox', { name: 'Task name' }).fill(title);
  await composer.getByRole('button', { name: 'Labels' }).click();
  await page.getByRole('combobox', { name: 'Find or create a label' }).or(page.getByPlaceholder('Find or create a label')).first().fill(label);
  await page.getByText(`Create “${label}”`).click();
  if (phone) await page.getByRole('dialog', { name: /^Labels/ }).getByRole('button', { name: 'Close' }).click();
  else await page.keyboard.press('Escape');
  await add(page, phone);
  if (phone) await page.keyboard.press('Escape');
}

test('a label in Filters & Labels shows its tasks, and a favorite one is a tap away', async ({ app, phone }) => {
  await openInbox(app, phone);
  await addWith(app, phone, 'Buy paint', 'home');
  await expect.poll(async () => (await titled(app, 'Buy paint'))?.labels).toEqual(['home']);
  await browse(app, phone);
  await app.getByRole('button', { name: /^Filters & Labels/ }).first().click();
  // A computer's row has a star; a phone's label page has it in its menu.
  if (!phone) await app.getByRole('button', { name: 'Add to favorites' }).first().click();
  await app.getByRole('button', { name: /^home/ }).first().click();
  await expect(app.getByText('Buy paint', { exact: true }).first()).toBeVisible();
  if (phone) {
    await app.getByRole('button', { name: 'More' }).click();
    await app.getByRole('menuitem', { name: 'Add to favorites' }).click();
  }
  // Starred, it is in Favorites: on a computer's sidebar, on a phone's Browse.
  await browse(app, phone);
  await expect(app.getByText('Favorites', { exact: true }).first()).toBeVisible();
  await expect(app.getByRole('button', { name: /^home/ }).first()).toBeVisible();
});

test('a task’s Activity says who worked on it', async ({ app, phone }) => {
  test.skip(phone, 'A computer’s row menu; the phone’s task page shows it under the task.');
  await openInbox(app, phone);
  await openComposer(app, phone);
  await composerOf(app, phone).getByRole('textbox', { name: 'Task name' }).fill('File taxes');
  await add(app, phone);
  await app.keyboard.press('Escape');
  await app.getByText('File taxes', { exact: true }).first().click({ button: 'right' });
  await app.getByRole('menuitem', { name: 'Activity…' }).click();
  const activity = app.getByRole('dialog', { name: 'Activity' });
  // Made just now: You under Worked on, and nothing that mattered yet (made is not one).
  await expect(activity.getByText('Worked on')).toBeVisible();
  await expect(activity.getByText(/You/).first()).toBeVisible();
  await expect(activity.getByText('Nothing yet.')).toBeVisible();
});
