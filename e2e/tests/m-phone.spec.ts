import { type Page } from '@playwright/test';
import { browse, createNote, editor, expect, joinSpace, noteMenu, test, typeInto, vaultFile, wizardTo } from '../fixtures';
import { agentOf, invite, person, spaceFile, spaceWithInvite } from '../server';

// The phone's own ways of what other tests do on a computer: its pages, sheets and share sheet.
test.describe.configure({ timeout: 90_000 });

/** What the phone hands to its share sheet, as a test sees it: each file's name and text. */
async function catchShares(page: Page) {
  await page.evaluate(() => {
    const shared: { name: string; text: string }[] = ((window as any).__shared = []);
    Object.assign(navigator, {
      canShare: () => true,
      share: async ({ files }: { files: File[] }) => {
        for (const file of files) shared.push({ name: file.name, text: await file.text() });
      },
    });
  });
  return () => page.evaluate(() => (window as any).__shared as { name: string; text: string }[]);
}

test('on a phone History opens as a page on the note, and Back closes it', async ({ app, phone }) => {
  test.skip(!phone);
  await createNote(app, phone, 'Versions');
  await typeInto(editor(app), 'Now');
  await expect.poll(() => vaultFile(app, 'Versions.md')).toBe('Now');
  await noteMenu(app, phone, 'Versions');
  await app.getByRole('menuitem', { name: /^History/ }).click();
  await expect(app.getByText('Current version').first()).toBeVisible();
  await app.getByRole('button', { name: /^Back/ }).first().click();
  await expect(app.getByText('Current version')).toHaveCount(0);
  await expect(editor(app)).toContainText('Now');
});

test('on a phone a note goes out to the share sheet as Markdown and as a PDF', async ({ app, phone }) => {
  test.skip(!phone);
  const shared = await catchShares(app);
  await createNote(app, phone, 'Exported');
  await typeInto(editor(app), '- one\ntwo');
  await expect.poll(() => vaultFile(app, 'Exported.md')).toBe('- one\n- two');
  for (const [kind, ext] of [['Markdown', 'md'], ['PDF', 'pdf']] as const) {
    await noteMenu(app, phone, 'Exported');
    await app.getByRole('menuitem', { name: /^Export/ }).click();
    await app.getByRole('option', { name: new RegExp(`^${kind}`) }).or(app.getByRole('button', { name: new RegExp(`^${kind}`) })).first().click();
    await expect.poll(async () => (await shared()).map((file) => file.name)).toContain(`Exported.${ext}`);
  }
  const files = await shared();
  expect(files.find((file) => file.name === 'Exported.md')?.text).toBe('- one\n- two');
  expect(files.find((file) => file.name === 'Exported.pdf')?.text.startsWith('%PDF-')).toBe(true);
});

test('on a phone the personal space syncs to OneDrive from Settings › Spaces, a note made before going with it', async ({ app, phone }) => {
  test.skip(!phone);
  await createNote(app, phone, 'Before sync');
  await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Settings' }).click();
  await app.getByRole('button', { name: /^Spaces/ }).first().click();
  await app.getByRole('button', { name: /^Personal/ }).first().click();
  await app.getByRole('button', { name: /^Location/ }).click();
  await app.getByRole('dialog', { name: 'Sync Personal' }).getByRole('button', { name: /^OneDrive/ }).click();
  await app.getByRole('button', { name: 'Connect OneDrive' }).click();
  // Scrawl, new, is picked: Use it, then Sync.
  await app.getByRole('dialog', { name: 'OneDrive' }).getByRole('button', { name: 'Use', exact: true }).click();
  await app.getByRole('dialog', { name: 'Sync Personal' }).getByRole('button', { name: 'Sync', exact: true }).click();
  // The fake OneDrive of dev holds what was sent.
  await expect
    .poll(() => app.evaluate(async () => (await import('/src/cloud.ts')).fakeGraph()?.paths('Scrawl').some((p: string) => p.endsWith('Before sync.md'))), { timeout: 20_000 })
    .toBe(true);
});

async function openInbox(page: Page) {
  await browse(page, true);
  await page.getByRole('button', { name: /^Inbox( \d+)?$/ }).first().click();
}

/** Adds a task from the Inbox's +, the sheet closed after. */
async function addTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'Create', exact: true }).last().click();
  const sheet = page.getByRole('dialog', { name: 'Add task' });
  await sheet.getByRole('textbox', { name: 'Task name' }).fill(title);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
}

const inboxFile = async (page: Page) => JSON.parse((await vaultFile(page, 'Inbox.tasks.json')) ?? '{"tasks":[],"sections":[]}') as { tasks: { title: string; order: number }[]; sections?: { name: string }[] };

/** A finger held on `from` until it lifts the row, then moved to `to` and let go, as a phone sends touches. */
async function holdAndDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, at?: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: at ? [{ x: at.x, y: at.y }] : [] });
  await touch('touchStart', from);
  await page.waitForTimeout(600);
  for (let step = 1; step <= 8; step++) await touch('touchMove', { x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 });
  await touch('touchEnd');
}

test('on a phone a section is added from the list’s menu', async ({ app, phone }) => {
  test.skip(!phone);
  await openInbox(app);
  await app.getByRole('button', { name: 'More' }).click();
  await app.getByRole('menuitem', { name: 'Add section' }).click();
  await app.getByRole('textbox', { name: 'Section name' }).fill('Errands');
  await app.getByRole('button', { name: /^(Save|Add)$/ }).last().click();
  await expect.poll(async () => ((await inboxFile(app)).sections ?? []).map((section) => section.name)).toEqual(['Errands']);
});

test('on a phone a task held and moved above another goes before it', async ({ app, phone }) => {
  test.skip(!phone);
  await openInbox(app);
  await addTask(app, 'Alpha');
  await addTask(app, 'Beta');
  const order = async () => [...(await inboxFile(app)).tasks].sort((a, b) => a.order - b.order).map((task) => task.title);
  await expect.poll(order).toEqual(['Alpha', 'Beta']);
  const beta = (await app.getByText('Beta', { exact: true }).first().boundingBox())!;
  const alpha = (await app.getByText('Alpha', { exact: true }).first().boundingBox())!;
  await holdAndDrag(app, { x: beta.x + 10, y: beta.y + beta.height / 2 }, { x: beta.x + 10, y: alpha.y + 2 });
  await expect.poll(order).toEqual(['Beta', 'Alpha']);
});

test('on a phone a task’s page in a shared space shows its Activity: who made it', async ({ app, phone }) => {
  test.skip(!phone);
  const space = await spaceWithInvite('Chores');
  await joinSpace(app, space.link, person('Ada'), phone);
  await browse(app, phone);
  await app.getByRole('button', { name: 'Create' }).last().click();
  await app.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Task list/ }).click();
  const dialog = app.getByRole('dialog', { name: 'New task list' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Home');
  await dialog.getByRole('button', { name: /^Folder/ }).click();
  await app.getByRole('option', { name: space.name }).or(app.getByRole('button', { name: space.name })).last().click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(app.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await addTask(app, 'File taxes');
  await app.getByText('File taxes', { exact: true }).first().click();
  const log = app.locator('.tlog');
  await expect(log.getByText(/created this/)).toBeVisible();
  await expect(log.getByText(/You|Ada/).first()).toBeVisible();
});

/** A Simple board from Browse's Create, with one card in Todo, the card's page open. */
async function boardWithCard(page: Page, name: string, card: string) {
  await browse(page, true);
  await page.getByRole('button', { name: 'Create' }).last().click();
  await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Board/ }).click();
  await page.getByRole('button', { name: /^Template/ }).click();
  await page.getByRole('button', { name: /^Simple/ }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('dialog', { name: 'New board' }).getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: /Add card$/ }).first().click();
  await page.getByRole('dialog').last().getByRole('textbox', { name: 'Card title' }).fill(card);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.getByText(card, { exact: true }).first().click();
}

test('on a phone a card’s Priority and Due are picked from its rows', async ({ app, phone }) => {
  test.skip(!phone);
  await boardWithCard(app, 'Launch', 'Book the venue');
  await app.getByRole('button', { name: /^Priority/ }).click();
  await app.getByRole('menuitem', { name: /Priority 1/ }).or(app.getByRole('button', { name: /^Priority 1/ })).first().click();
  await expect(app.getByRole('button', { name: /^Priority/ })).toContainText(/1/);
  await app.getByRole('button', { name: /^Due/ }).click();
  await app.getByRole('button', { name: /^Tomorrow/ }).first().click();
  await expect(app.getByRole('button', { name: /^Due/ })).toContainText('Tomorrow');
  await expect
    .poll(async () => {
      const board = JSON.parse((await vaultFile(app, 'Launch.board.json')) ?? '{"cards":[]}');
      const saved = board.cards.find((each: { title: string }) => each.title === 'Book the venue');
      return saved ? `${saved.priority} ${!!saved.due}` : null;
    })
    .toBe('1 true');
});

async function phoneBoard(page: Page, name: string, template: 'Simple' | 'Software') {
  await browse(page, true);
  await page.getByRole('button', { name: 'Create' }).last().click();
  await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Board/ }).click();
  await page.getByRole('button', { name: /^Template/ }).click();
  await page.getByRole('button', { name: new RegExp(`^${template}`) }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('dialog', { name: 'New board' }).getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}
const boardFile = async (page: Page, name: string) =>
  JSON.parse((await vaultFile(page, `${name}.board.json`)) ?? '{"columns":[],"cards":[]}') as { columns: { name: string }[]; phases?: { id: string; name: string; state?: string }[]; cards: { title: string; phase?: string | null }[] };

test('on a phone a column is added from the board’s menu with the name asked, before Done', async ({ app, phone }) => {
  test.skip(!phone);
  await phoneBoard(app, 'Hiring', 'Simple');
  await app.getByRole('button', { name: 'More' }).click();
  await app.getByRole('menuitem', { name: 'Add column' }).click();
  // Its name is asked first, in a sheet (design/e2e-findings.md U11).
  const sheet = app.getByRole('dialog', { name: 'New column' });
  await sheet.getByRole('textbox', { name: 'Column name' }).fill('Interview');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(async () => (await boardFile(app, 'Hiring')).columns.map((column) => column.name)).toEqual(['Todo', 'Doing', 'Interview', 'Done']);
});

test('on a phone a phase is added from + Phase, and closed with its unfinished card going to the next', async ({ app, phone }) => {
  test.skip(!phone);
  await phoneBoard(app, 'Sprints', 'Software');
  for (const name of ['First', 'Next']) {
    await app.getByRole('button', { name: '+ Phase' }).click();
    await app.getByRole('textbox', { name: 'Phase name' }).fill(name);
    await app.getByRole('button', { name: /^(Add|Save)$/ }).last().click();
  }
  await expect.poll(async () => ((await boardFile(app, 'Sprints')).phases ?? []).map((phase) => phase.name)).toEqual(['First', 'Next']);
  await app.getByRole('button', { name: /Add card$/ }).first().click();
  await app.getByRole('dialog').last().getByRole('textbox', { name: 'Card title' }).fill('Unfinished work');
  await app.keyboard.press('Enter');
  await app.keyboard.press('Escape');
  // First chosen, its menu is beside its chip.
  await app.getByRole('tab', { name: /^First/ }).click();
  await app.getByRole('button', { name: 'Phase menu' }).click();
  await app.getByRole('menuitem', { name: 'Close phase…' }).click();
  await app.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect
    .poll(async () => {
      const saved = await boardFile(app, 'Sprints');
      const [first, next] = saved.phases ?? [];
      return saved.cards.find((card) => card.title === 'Unfinished work')?.phase === next?.id && first?.state;
    })
    .toBe('done');
});

async function phoneCompanies(page: Page, name: string) {
  await browse(page, true);
  await page.getByRole('button', { name: 'Create' }).last().click();
  await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Collection/ }).click();
  await page.getByRole('button', { name: /^Template/ }).click();
  await page.getByRole('button', { name: /^Companies/ }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('dialog', { name: /New collection/ }).getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test('on a phone rows of a CSV come in from the collection’s menu, and it goes out to the share sheet', async ({ app, phone }) => {
  test.skip(!phone);
  const shared = await catchShares(app);
  await phoneCompanies(app, 'Clients');
  await app.getByRole('button', { name: 'More' }).click();
  const picking = app.waitForEvent('filechooser');
  await app.getByRole('menuitem', { name: 'Import…' }).click();
  const csv = ['Name,Website,Segment,Last contact', 'Acme,acme.example,SMB,2026-11-02', 'Globex,globex.example,Startup,2026-11-03', ''].join('\n');
  await (await picking).setFiles({ name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await app.getByRole('button', { name: 'Import 2 rows' }).click();
  await expect(app.getByText('Acme', { exact: true }).first()).toBeVisible();
  await expect(app.getByText('Globex', { exact: true }).first()).toBeVisible();

  await app.getByRole('button', { name: 'More' }).click();
  await app.getByRole('menuitem', { name: 'Export as CSV' }).click();
  await expect.poll(async () => (await shared()).map((file) => file.name)).toContain('Clients.csv');
  const text = (await shared()).find((file) => file.name === 'Clients.csv')!.text;
  expect(text).toContain('Acme');
  expect(text).toContain('Startup');
});

/** An app set up from Browse's Create, its wizard's sheets gone through to Create. */
async function phoneApp(page: Page, group: 'Business' | 'Personal', template: string) {
  await browse(page, true);
  await page.getByRole('button', { name: 'Create' }).last().click();
  await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^App/ }).click();
  const wizard = page.getByRole('dialog', { name: 'New app' });
  await wizard.getByRole('radio', { name: group }).click();
  await wizard.getByRole('checkbox', { name: new RegExp(`^${template}`) }).click();
  await (await wizardTo(wizard, 'Create')).click();
  await expect(wizard).toBeHidden();
  await browse(page, true);
  await page.getByRole('button', { name: new RegExp(`^${template}`) }).first().click();
}

test('on a phone a collection’s views are chips: Customers shows only customers', async ({ app, phone }) => {
  test.skip(!phone);
  await phoneApp(app, 'Business', 'CRM');
  await app.getByRole('button', { name: /^Companies/ }).first().click();
  await app.getByRole('button', { name: 'Create', exact: true }).last().click();
  const form = app.getByRole('dialog', { name: 'New company' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Acme');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(app.getByText('Acme', { exact: true }).first()).toBeVisible();
  // Acme is no customer yet: Customers leaves it out, All has it.
  await app.getByRole('button', { name: 'Customers', exact: true }).or(app.getByRole('tab', { name: 'Customers' })).first().click();
  await expect(app.getByText('Acme', { exact: true })).toHaveCount(0);
  await app.getByRole('button', { name: 'All', exact: true }).or(app.getByRole('tab', { name: 'All' })).first().click();
  await expect(app.getByText('Acme', { exact: true }).first()).toBeVisible();
});

test('on a phone Edit app shows what a change does before Save, and Save writes it', async ({ app, phone }) => {
  test.skip(!phone);
  await phoneApp(app, 'Business', 'CRM');
  await app.getByRole('button', { name: 'More' }).click();
  await app.getByRole('menuitem', { name: 'Edit app…' }).click();
  const edit = app.getByRole('dialog', { name: 'Edit CRM' });
  await edit.getByPlaceholder('Add a currency…').fill('EUR');
  await app.keyboard.press('Enter');
  const save = await wizardTo(edit, 'Save');
  await expect(edit.getByText('Changed').first()).toBeVisible();
  await save.click();
  await expect(app.getByText(/CRM: .*changed/).first()).toBeVisible();
});

test('on a phone Gym sets up from Create and opens on its Home', async ({ app, phone }) => {
  test.skip(!phone);
  await phoneApp(app, 'Personal', 'Gym');
  await expect(app.getByRole('heading', { name: 'Gym', level: 1 })).toBeVisible();
});

test('on a phone a task in Scheduled’s Day goes to tomorrow from its Date row', async ({ app, phone }) => {
  test.skip(!phone);
  await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Scheduled' }).click();
  await app.getByRole('button', { name: 'Create', exact: true }).last().click();
  const sheet = app.getByRole('dialog', { name: 'Add task' });
  await sheet.getByRole('textbox', { name: 'Task name' }).fill('Pay rent');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await app.keyboard.press('Escape');
  await app.getByRole('tab', { name: 'Day', exact: true }).or(app.getByRole('button', { name: 'Day', exact: true })).first().click();
  await app.getByRole('button', { name: /Pay rent/ }).first().click();
  await app.getByRole('button', { name: /^Date/ }).click();
  await app.getByRole('button', { name: /^Tomorrow/ }).first().click();
  const tomorrow = await app.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() + 1);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
  await expect.poll(async () => (await inboxFile(app)).tasks.find((task) => task.title === 'Pay rent') as unknown as { due: string } | undefined).toMatchObject({ due: tomorrow });
});

test('on a phone a note moved to a shared space from Move to is on the server in a moment', async ({ app, phone }) => {
  test.skip(!phone);
  const space = await spaceWithInvite('Team');
  await joinSpace(app, space.link, person('Ada'), phone);
  await createNote(app, phone, 'Minutes');
  await typeInto(editor(app), 'Decisions of the week');
  await expect.poll(() => vaultFile(app, 'Minutes.md')).toBe('Decisions of the week');
  await noteMenu(app, phone, 'Minutes');
  await app.getByRole('menuitem', { name: 'Move to…' }).click();
  await app.getByRole('button', { name: new RegExp(`^${space.name}`) }).or(app.getByRole('option', { name: new RegExp(space.name) })).last().click();
  await expect.poll(() => spaceFile(space.id, 'Minutes.md'), { timeout: 10_000 }).toBe('Decisions of the week');
});

test('on a phone a conflict copy shows beside its note after the same line changed offline', async ({ app, second, phone }) => {
  test.skip(!phone);
  const space = await spaceWithInvite('Team');
  await joinSpace(app, space.link, person('Ada'), phone);
  await joinSpace(second, await invite(space.id), person('Ben'), phone);
  await createNote(app, phone, 'Plan', space.name);
  await typeInto(editor(app), 'Meet on Monday');
  await expect.poll(() => spaceFile(space.id, 'Plan.md'), { timeout: 20_000 }).toBe('Meet on Monday');
  await browse(second, phone);
  await second.getByRole('button', { name: 'Plan', exact: true }).click({ timeout: 20_000 });
  await expect(editor(second)).toContainText('Meet on Monday', { timeout: 20_000 });

  await second.context().setOffline(true);
  await second.evaluate(() => window.dispatchEvent(new Event('offline')));
  await editor(second).click();
  await second.keyboard.press('End');
  await second.keyboard.type(' at ten');
  await expect.poll(() => vaultFile(second, 'Plan.md')).toBe('Meet on Monday at ten');
  await editor(app).click();
  await app.keyboard.press('End');
  await app.keyboard.type(' at noon');
  await expect.poll(() => spaceFile(space.id, 'Plan.md'), { timeout: 20_000 }).toBe('Meet on Monday at noon');

  await second.context().setOffline(false);
  await second.evaluate(() => window.dispatchEvent(new Event('online')));
  await browse(second, phone);
  await expect(second.getByRole('button', { name: /^Plan \(conflict/ }).first()).toBeVisible({ timeout: 30_000 });
});

/** Ada (`app`) and Ben (`second`) on phones, in a space of their own. */
async function phoneTeam(app: Page, second: Page, name: string) {
  const space = await spaceWithInvite(name);
  await joinSpace(app, space.link, person('Ada'), true);
  await joinSpace(second, await invite(space.id), person('Ben'), true);
  return space;
}

test('on a phone a card is given from its Assignee row, Remind is on its page, and @ offers Ben', async ({ app, second, phone }) => {
  test.skip(!phone);
  const space = await phoneTeam(app, second, 'Team');
  await browse(app, true);
  await app.getByRole('button', { name: 'Create' }).last().click();
  await app.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Board/ }).click();
  await app.getByRole('button', { name: /^Template/ }).click();
  await app.getByRole('button', { name: /^Simple/ }).click();
  const dialog = app.getByRole('dialog', { name: 'New board' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Launch');
  await dialog.getByRole('button', { name: /^Folder/ }).click();
  await app.getByRole('option', { name: space.name }).or(app.getByRole('button', { name: space.name })).last().click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(app.getByRole('heading', { name: 'Launch', level: 1 })).toBeVisible();
  await app.getByRole('button', { name: /Add card$/ }).first().click();
  await app.getByRole('dialog').last().getByRole('textbox', { name: 'Card title' }).fill('Book the venue');
  await app.keyboard.press('Enter');
  await app.keyboard.press('Escape');
  await app.getByText('Book the venue', { exact: true }).first().click();
  await app.getByRole('button', { name: /^Assignee/ }).click();
  await app.getByRole('button', { name: /^Ben/ }).or(app.getByRole('option', { name: /Ben/ })).last().click();
  await expect(app.getByRole('button', { name: /^Assignee/ })).toContainText('Ben');
  await app.getByRole('button', { name: 'Remind Ben' }).click();
  await expect(app.getByRole('button', { name: 'Reminded just now' })).toBeDisabled();
  const box = app.getByRole('textbox', { name: 'Write a comment…' });
  await box.click();
  await expect(box).toBeFocused();
  await app.keyboard.type('Ask @Be');
  await app.getByRole('option', { name: /Ben/ }).first().click();
  await app.keyboard.type('about the price');
  await app.getByRole('button', { name: /^(Comment|Send)$/ }).last().click();
  await expect(app.getByText(/Ask @Ben\s+about the price/).first()).toBeVisible();
});

async function phoneChat(page: Page) {
  await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Chat' }).click();
  await page.getByRole('button', { name: /general/ }).first().click();
}

test('on a phone a message with @ and a file reach the other person', async ({ app, second, phone }) => {
  test.skip(!phone);
  await phoneTeam(app, second, 'Talk');
  await phoneChat(app);
  await phoneChat(second);
  const box = app.getByRole('textbox', { name: 'Message #general' });
  await box.click();
  await expect(box).toBeFocused();
  await app.keyboard.type('Thanks @Be');
  await app.getByRole('option', { name: /Ben/ }).first().click();
  await app.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(second.getByText(/Thanks @Ben/).first()).toBeVisible({ timeout: 20_000 });

  const picking = app.waitForEvent('filechooser');
  await app.getByRole('button', { name: 'Add', exact: true }).last().click();
  await app.getByRole('menuitem', { name: /Photos and files|File/ }).first().click();
  await (await picking).setFiles({ name: 'agenda.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await app.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(second.getByText('agenda.pdf').first()).toBeVisible({ timeout: 20_000 });
});

test('on a phone a direct message is started from Ben’s row in Chat and reaches him', async ({ app, second, phone }) => {
  test.skip(!phone);
  await phoneTeam(app, second, 'Direct');
  await second.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Chat' }).click();
  await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Chat' }).click();
  // The space's people are on the list, to say hello to.
  await app.getByRole('button', { name: /^Ben/ }).first().click();
  const box = app.getByRole('textbox', { name: /^Message Ben/ });
  await box.click();
  await expect(box).toBeFocused();
  await app.keyboard.type('Just between us');
  await app.getByRole('button', { name: 'Send', exact: true }).click();
  await second.getByRole('button', { name: /^Ada/ }).first().click({ timeout: 20_000 });
  await expect(second.getByText('Just between us', { exact: true }).first()).toBeVisible();
});

test('on a phone a shared space’s page lists its People', async ({ app, phone }) => {
  test.skip(!phone);
  const space = await spaceWithInvite('Crew');
  await joinSpace(app, space.link, person('Ada'), true);
  await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Settings' }).click();
  await app.getByRole('button', { name: /^Spaces/ }).first().click();
  await app.getByRole('button', { name: new RegExp(`^${space.name}`) }).first().click();
  // Each with their email; the one signed in here with · you after the name.
  for (const name of [/Olive Owner/, /Ada · you/]) await expect(app.getByText(name).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
});

test('on a phone an agent’s message to its person is a direct message under its name', async ({ app, phone }) => {
  test.skip(!phone);
  const space = await spaceWithInvite('Agent');
  const ada = person('Ada');
  await joinSpace(app, space.link, ada, true);
  const call = await agentOf(ada, 'Claude');
  await call('send_message', { to: 'me', text: 'The report is ready' });
  await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Chat' }).click();
  await app.getByRole('button', { name: /Claude/ }).first().click({ timeout: 20_000 });
  await expect(app.getByText('The report is ready', { exact: true }).first()).toBeVisible();
});

test('on a phone a file uploaded in Files is listed there', async ({ app, phone }) => {
  test.skip(!phone);
  await browse(app, true);
  await app.getByRole('button', { name: /^Files/ }).first().click();
  const picking = app.waitForEvent('filechooser');
  await app.getByRole('button', { name: 'Upload' }).click();
  await (await picking).setFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await expect(app.getByText('contract.pdf').first()).toBeVisible();
});

test('on a phone a key added from + is kept, its value hidden until shown', async ({ app, phone }) => {
  test.skip(!phone);
  await browse(app, true);
  await app.getByRole('button', { name: 'Create' }).last().click();
  await app.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Keys/ }).click();
  await app.getByRole('textbox', { name: 'Name' }).fill('Servers');
  await app.getByRole('dialog').last().getByRole('button', { name: 'Create' }).click();
  await expect(app.getByRole('heading', { name: 'Servers', level: 1 })).toBeVisible();
  await app.getByRole('button', { name: 'Create', exact: true }).last().click();
  const sheet = app.getByRole('dialog', { name: 'New key' });
  await sheet.getByRole('textbox', { name: 'Name' }).fill('API_TOKEN');
  await sheet.getByRole('textbox', { name: 'Value' }).fill('s3cret-value');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(app.getByText('API_TOKEN').first()).toBeVisible();
  await expect(app.getByText('s3cret-value')).toHaveCount(0);
  await expect.poll(async () => (await vaultFile(app, 'Servers.env')) ?? '').toContain('API_TOKEN=s3cret-value');
});
