import { type Page } from '@playwright/test';
import { browse, expect, test, typeInto, vaultFile } from '../fixtures';

// A Simple board (Todo, Doing, Done) made from the Create window.
async function createBoard(page: Page, phone: boolean, name: string) {
  if (phone) {
    await browse(page, phone);
    await page.getByRole('button', { name: 'Create' }).last().click();
    await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Board/ }).click();
    await page.getByRole('button', { name: /^Template/ }).click();
    await page.getByRole('button', { name: /^Simple/ }).click();
  } else {
    await page.getByRole('tablist').getByRole('button', { name: '+', exact: true }).click();
    await page.getByRole('option', { name: /^4 Board/ }).click();
    await page.getByRole('radio', { name: /^Simple/ }).click();
  }
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('dialog', { name: 'New board' }).getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: /^Todo/ })).toBeVisible({ timeout: 15_000 });
}

async function addCard(page: Page, phone: boolean, title: string) {
  await page.getByRole('button', { name: /Add card$/ }).first().click();
  const sheet = phone ? page.getByRole('dialog').last() : page.locator('main');
  await sheet.getByRole('textbox', { name: 'Card title' }).fill(title);
  await page.keyboard.press('Enter');
  if (phone) await page.keyboard.press('Escape');
}

test('a card added to Todo is there after a reload', async ({ app, phone }) => {
  await createBoard(app, phone, 'Launch');
  await addCard(app, phone, 'Write the press release');
  await expect(app.getByText('Write the press release').first()).toBeVisible();
  await app.reload();
  await browse(app, phone);
  await app.getByRole('button', { name: /^Launch( \d+)?$/ }).first().click();
  await expect(app.getByText('Write the press release').first()).toBeVisible({ timeout: 15_000 });
});

test('a card dragged to Doing stays in Doing', async ({ app, phone }) => {
  test.skip(phone, 'A phone moves a card from its sheet.');
  await createBoard(app, phone, 'Launch');
  await addCard(app, phone, 'Book the venue');
  await app.keyboard.press('Escape');
  const card = app.getByText('Book the venue', { exact: true }).first();
  await card.dragTo(app.getByRole('heading', { name: /^Doing/ }));
  await expect(app.getByRole('heading', { name: /^Doing 1/ })).toBeVisible();
  await expect(app.getByRole('heading', { name: /^Todo 0/ })).toBeVisible();
});

test('on a phone a card moves to Doing from its Status', async ({ app, phone }) => {
  test.skip(!phone);
  await createBoard(app, phone, 'Launch');
  await addCard(app, phone, 'Book the venue');
  await app.getByText('Book the venue', { exact: true }).first().click();
  await app.getByRole('button', { name: /^Status/ }).click();
  await app.getByRole('button', { name: /^Doing/ }).last().click();
  await app.getByRole('button', { name: /^Back to Launch|^Launch$/ }).first().click();
  await expect(app.getByRole('tab', { name: 'Doing 1' })).toBeVisible();
});

test('a comment written on a card shows on its timeline', async ({ app, phone }) => {
  await createBoard(app, phone, 'Launch');
  await addCard(app, phone, 'Book the venue');
  await app.getByText('Book the venue', { exact: true }).first().click();
  await typeInto(app.getByRole('textbox', { name: 'Write a comment…' }), 'Called them, waiting for a price');
  await app.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(app.getByText('Called them, waiting for a price').first()).toBeVisible();
});

test("a card's description is written in its box and saved; a file picked comes in its Attachments, not in the text", async ({ app, phone }) => {
  await createBoard(app, phone, 'Launch');
  await addCard(app, phone, 'Book the venue');
  await app.getByText('Book the venue', { exact: true }).first().click();
  await app.getByRole('button', { name: 'Add a more detailed description…' }).click();
  await app.keyboard.type('The contract came');
  // A computer saves with Ctrl+Enter, a phone with its page's Save.
  if (phone) await app.getByRole('dialog', { name: 'Description' }).getByRole('button', { name: 'Save' }).click();
  else await app.keyboard.press('Control+Enter');
  await expect(app.getByRole('button', { name: 'Description' })).toContainText('The contract came');
  const picking = app.waitForEvent('filechooser');
  await app.getByRole('button', { name: 'Add attachment' }).click();
  await (await picking).setFiles({ name: 'offer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(app.getByRole('button', { name: 'offer.pdf' })).toBeVisible();
  await expect(app.getByText('attached offer.pdf').first()).toBeVisible();
  await expect.poll(async () => JSON.parse((await vaultFile(app, 'Launch.board.json')) ?? '{"cards":[]}').cards[0]?.attachments?.[0]?.name).toBe('offer.pdf');
  await expect.poll(async () => JSON.parse((await vaultFile(app, 'Launch.board.json')) ?? '{"cards":[]}').cards[0]?.description).toBe('The contract came');
});

test('a card of someone with no name yet says You, not Unnamed', async ({ app, phone }) => {
  await createBoard(app, phone, 'Launch');
  await addCard(app, phone, 'Book the venue');
  await app.getByText('Book the venue', { exact: true }).first().click();
  await expect(app.getByText('You', { exact: true }).first()).toBeVisible();
  await expect(app.getByText('Unnamed')).toHaveCount(0);
});

test("a card's priority and due day are picked as a task's are", async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await createBoard(app, phone, 'Launch');
  await addCard(app, phone, 'Book the venue');
  await app.keyboard.press('Escape');
  await app.getByText('Book the venue', { exact: true }).first().click();
  const card = app.getByRole('dialog', { name: /^LAU-1/ });
  await card.locator('#card-priority').click();
  await app.getByRole('menuitem', { name: /Priority 1/ }).click();
  await expect(card.locator('#card-priority')).toHaveText(/Priority 1/);
  await card.locator('#card-due').click();
  await app.getByRole('dialog', { name: 'Date' }).getByRole('button', { name: /^Tomorrow/ }).click();
  await expect(card.locator('#card-due')).toHaveText(/Tomorrow/);
});
