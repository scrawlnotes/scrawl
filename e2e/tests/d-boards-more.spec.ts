import { type Page } from '@playwright/test';
import { browse, expect, test, vaultFile } from '../fixtures';

interface SavedBoard {
  columns: { name: string }[];
  phasesOn: boolean;
  /** Left out while there are none. */
  phases?: { id: string; name: string; state?: string }[];
  cards: { title: string; phase?: string | null }[];
}
const board = async (page: Page, name: string): Promise<SavedBoard | null> => {
  const text = await vaultFile(page, `${name}.board.json`);
  return text ? JSON.parse(text) : null;
};

async function createBoard(page: Page, phone: boolean, name: string, template: 'Simple' | 'Software' | 'Issue tracking') {
  if (phone) {
    await browse(page, phone);
    await page.getByRole('button', { name: 'Create' }).last().click();
    await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Board/ }).click();
    await page.getByRole('button', { name: /^Template/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${template}`) }).click();
  } else {
    await page.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
    await page.getByRole('option', { name: /^4 Board/ }).click();
    await page.getByRole('radio', { name: new RegExp(`^${template}`) }).click();
  }
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('dialog', { name: 'New board' }).getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: /^Todo/ }).first()).toBeVisible({ timeout: 15_000 });
}

test('a board from Software has its columns, with phases on', async ({ app, phone }) => {
  await createBoard(app, phone, 'Product', 'Software');
  await expect.poll(async () => (await board(app, 'Product'))?.columns.map((column) => column.name)).toEqual(['Backlog', 'Todo', 'Doing', 'Review', 'Done']);
  expect((await board(app, 'Product'))!.phasesOn).toBe(true);
});

test('a column added to a board is there with its name', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await createBoard(app, phone, 'Hiring', 'Simple');
  // The welcome note's table has a + Column too, unseen in its tab.
  await app.getByRole('button', { name: '+ Column' }).filter({ visible: true }).click();
  // It asks for the name where it is, and goes in before Done (design/e2e-findings.md U10).
  await app.getByRole('textbox', { name: 'Column name' }).fill('Interview');
  await app.keyboard.press('Enter');
  await expect(app.getByRole('heading', { name: /^Interview/ })).toBeVisible();
  await expect.poll(async () => (await board(app, 'Hiring'))?.columns.map((column) => column.name)).toEqual(['Todo', 'Doing', 'Interview', 'Done']);
});

test('a phase closed with a card left moves the card to the next phase', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await createBoard(app, phone, 'Sprints', 'Software');
  // Two phases: the card is in the first, and goes to the next as the first closes.
  for (const name of ['First', 'Next']) {
    await app.getByRole('button', { name: '+ Phase' }).click();
    await app.getByRole('textbox', { name: 'Phase name' }).fill(name);
    await app.keyboard.press('Enter');
  }
  await app.getByRole('button', { name: /Add card$/ }).first().click();
  await app.locator('main').getByRole('textbox', { name: 'Card title' }).fill('Unfinished work');
  await app.keyboard.press('Enter');
  await app.keyboard.press('Escape');
  const first = (await board(app, 'Sprints'))!.phases![0]!;
  await expect.poll(async () => (await board(app, 'Sprints'))?.cards.find((card) => card.title === 'Unfinished work')?.phase).toBe(first.id);

  // The phase's chip, right-clicked: its menu.
  await app.getByRole('tab', { name: new RegExp('^' + first.name) }).click({ button: 'right' });
  await app.getByRole('menuitem', { name: 'Close phase…' }).click();
  const dialog = app.getByRole('dialog', { name: /Close phase/ });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(async () => {
    const saved = (await board(app, 'Sprints'))!;
    const next = saved.phases!.find((phase) => phase.name === 'Next');
    return saved.cards.find((card) => card.title === 'Unfinished work')?.phase === next?.id && saved.phases!.find((phase) => phase.id === first.id)?.state;
    // A closed phase is written as done.
  }).toBe('done');
});
