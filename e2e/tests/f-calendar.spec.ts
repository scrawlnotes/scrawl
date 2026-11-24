import { type Page } from '@playwright/test';
import { expect, test, vaultFile } from '../fixtures';

async function openSettings(page: Page, phone: boolean, section: string) {
  if (phone) await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Settings' }).click();
  else await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${section}`) }).first().click();
}

async function openScheduled(page: Page, phone: boolean) {
  if (phone) await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Scheduled' }).click();
  else await page.getByRole('button', { name: 'Scheduled', exact: true }).first().click();
}

test("Outlook's meetings of today show in Scheduled once it is connected", async ({ app, phone }) => {
  await openSettings(app, phone, 'Calendars');
  await app.getByRole('button', { name: 'Connect Outlook Calendar' }).click();
  // Dev's Outlook is a fake one, with a meeting called Acme demo today.
  await expect(app.getByText('test@example.com').first()).toBeVisible();
  if (phone) await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Scheduled' }).click();
  else {
    await app.keyboard.press('Escape');
    await openScheduled(app, phone);
  }
  await expect(app.getByText('Acme demo').first()).toBeVisible({ timeout: 15_000 });
});

test('a task for today is on today in the calendar', async ({ app, phone }) => {
  await openScheduled(app, phone);
  if (phone) await app.getByRole('button', { name: 'Create', exact: true }).last().click();
  else await app.getByRole('button', { name: '+ Add task', exact: true }).click();
  const composer = phone ? app.getByRole('dialog', { name: 'Add task' }) : app.locator('main');
  await composer.getByRole('textbox', { name: 'Task name' }).fill('Pay rent');
  await composer.getByRole('button', { name: phone ? 'Add' : 'Add task', exact: true }).last().click();
  await app.keyboard.press('Escape');
  const view = phone ? 'Day' : 'Calendar';
  await app.getByRole('tab', { name: view, exact: true }).or(app.getByRole('button', { name: view, exact: true })).first().click();
  await expect(app.getByText('Pay rent').first()).toBeVisible();
});

test('the calendar opens on today at the hour of now, not at the morning (U7, U9)', async ({ app, phone }) => {
  await openScheduled(app, phone);
  const view = phone ? 'Day' : 'Calendar';
  await app.getByRole('tab', { name: view, exact: true }).or(app.getByRole('button', { name: view, exact: true })).first().click();
  // A computer's calendar opens on Month; its hours are in Week and Day.
  if (!phone) await app.getByRole('tab', { name: 'Week', exact: true }).click();
  const hours = app.locator(phone ? '.mb-hours' : '.tg-scroll');
  const line = hours.locator('.tg-now');
  await expect(line).toBeVisible();
  // The line of now is in the part of the hours on screen, whatever time it is.
  const [box, seen] = await Promise.all([line.boundingBox(), hours.boundingBox()]);
  expect(box!.y).toBeGreaterThanOrEqual(seen!.y);
  expect(box!.y).toBeLessThanOrEqual(seen!.y + seen!.height);
});

test("Google's events of today show in Scheduled once it is connected", async ({ app, phone }) => {
  await openSettings(app, phone, 'Calendars');
  await app.getByRole('button', { name: 'Connect Google Calendar' }).click();
  // Dev's Google is a fake one, with Pilates today.
  await expect(app.getByText('test@gmail.com').first()).toBeVisible();
  if (phone) await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Scheduled' }).click();
  else {
    await app.keyboard.press('Escape');
    await openScheduled(app, phone);
  }
  await expect(app.getByText('Pilates').first()).toBeVisible({ timeout: 15_000 });
});

test('a task dragged to another day in the month moves to that day', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await openScheduled(app, phone);
  await app.getByRole('button', { name: '+ Add task', exact: true }).click();
  await app.locator('main').getByRole('textbox', { name: 'Task name' }).fill('Pay rent');
  await app.locator('main').getByRole('button', { name: 'Add task', exact: true }).last().click();
  await app.keyboard.press('Escape');
  await app.getByRole('button', { name: 'Calendar', exact: true }).or(app.getByRole('tab', { name: 'Calendar', exact: true })).first().click();
  // The day after today, as this computer's calendar has it.
  const tomorrow = await app.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() + 1);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
  await app.getByText('Pay rent', { exact: true }).first().dragTo(app.locator(`.cd[data-day="${tomorrow}"]`));
  await expect
    .poll(async () => JSON.parse((await vaultFile(app, 'Inbox.tasks.json')) ?? '{"tasks":[]}').tasks.find((task: { title: string }) => task.title === 'Pay rent')?.due)
    .toBe(tomorrow);
});
