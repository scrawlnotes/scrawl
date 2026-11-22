import { browse, expect, test } from '../fixtures';

const background = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number));

test('Dark in Settings › Appearance darkens the app at once', async ({ app, phone }) => {
  if (phone) await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Settings' }).click();
  else await app.getByRole('button', { name: 'Settings', exact: true }).click();
  await app.getByRole('button', { name: /^Appearance/ }).first().click();
  await app.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect.poll(async () => Math.max(...(await background(app)))).toBeLessThan(80);
});

test('Help opens on Getting started and goes to a topic', async ({ app, phone }) => {
  await browse(app, phone);
  await app.getByRole('button', { name: 'Help', exact: true }).first().click();
  await app.getByRole('button', { name: 'Task lists', exact: true }).first().click();
  await expect(app.getByText(/task/i).first()).toBeVisible();
});
