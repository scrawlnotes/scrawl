import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteFolderGone, RemoteSignedOut, ServerAccount, ServerRemote } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import { makeServer } from './server';

// People on a server: invites into a space, the roles on the server and in a space, taking
// someone out, and a link for a new password; through the client in packages/core.

const URL = 'https://kaan.scrawlnotes.com';
const ACME = 'sp-acmeacme';
const OTHER = 'sp-otherrrr';
const PASSWORD = 'a long password';
const opened: (() => void)[] = [];

afterEach(() => {
  for (const close of opened.splice(0)) close();
});

async function start() {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-people-'));
  let clock = Date.UTC(2026, 9, 15, 10, 0);
  const config: Config = { url: URL, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const server = makeServer(config, { now: () => clock });
  opened.push(() => {
    server.live.stop();
    server.db.close();
    rmSync(data, { recursive: true, force: true });
  });
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const as = (token: string | null) => new ServerAccount({ url: URL, token: () => token, fetch });
  const { token: owner } = await as(null).setUp({ name: 'Kaan Arslan', email: 'kaan@example.com', password: PASSWORD, person: 'person-kaan-01', device: 'Laptop' });
  await as(owner).openSpace(ACME, 'Acme');
  await as(owner).openSpace(OTHER, 'Other');
  /** Someone invited into a space, joining with a new account. */
  const invited = async (space: string, name: string, email: string, by = owner) => {
    const { link } = await as(by).invite(space);
    return as(null).accept(link.split('/').pop()!, { name, email, password: PASSWORD, person: `person-${name.toLowerCase()}`, device: 'Phone' });
  };
  const remote = (token: string, space: string) => new ServerRemote({ url: URL, token: () => token, space, fetch });
  return { server, fetch, as, owner, invited, remote, later: (ms: number) => (clock += ms) };
}

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);
const codeOf = (link: string) => link.split('/').pop()!;

describe('invites', () => {
  it('brings a new person into a space with a link that works once, as a member who opens no space', async () => {
    const s = await start();
    const { link, expires } = await s.as(s.owner).invite(ACME);
    expect(link).toMatch(/^https:\/\/kaan\.scrawlnotes\.com\/join\/[A-Za-z0-9_-]{24}$/);
    expect(await s.as(null).invitation(codeOf(link))).toEqual({ kind: 'space', space: { id: ACME, name: 'Acme' }, by: 'Kaan Arslan', expires });

    const mert = await s.as(null).accept(codeOf(link), { name: 'Mert Kaya', email: 'mert@example.com', password: PASSWORD, person: 'person-mert-01', device: 'Phone' });
    expect(mert.account).toEqual({ id: 'person-mert-01', email: 'mert@example.com', name: 'Mert Kaya', role: 'member' });
    expect(mert.space).toEqual({ id: ACME, name: 'Acme', role: 'member', people: 2 });
    expect((await s.as(mert.token).spaces()).map((each) => each.name)).toEqual(['Acme']);
    expect(await refusal(s.as(mert.token).openSpace('sp-mertmert', 'Mine'))).toMatchObject({ status: 403, code: 'not-allowed' });
    expect(await refusal(s.as(null).accept(codeOf(link), { name: 'Deniz', email: 'deniz@example.com', password: PASSWORD, person: 'x', device: '' }))).toMatchObject({ status: 410, code: 'invite-used' });
  });

  it('lets someone with an account join another space with their password, and runs out after a week', async () => {
    const s = await start();
    const mert = await s.invited(ACME, 'Mert', 'mert@example.com');
    const { link } = await s.as(s.owner).invite(OTHER);
    expect(await refusal(s.as(null).accept(codeOf(link), { name: '', email: 'mert@example.com', password: 'not his password', person: '', device: '' }))).toMatchObject({ status: 401, code: 'wrong-password' });
    const again = await s.as(null).accept(codeOf(link), { name: '', email: 'MERT@example.com', password: PASSWORD, person: '', device: 'Laptop' });
    expect(again.account.id).toBe(mert.account.id);
    expect((await s.as(again.token).spaces()).map((each) => each.name)).toEqual(['Acme', 'Other']);

    const late = await s.as(s.owner).invite(ACME);
    s.later(7 * 24 * 60 * 60 * 1000 + 1);
    expect(await refusal(s.as(null).invitation(codeOf(late.link)))).toMatchObject({ status: 410, code: 'invite-expired' });
    expect(await refusal(s.as(null).invitation('nothing-like-it'))).toMatchObject({ status: 404, code: 'no-invite' });
  });

  it('shows a link opened in a browser as a page that opens Scrawl with it', async () => {
    const s = await start();
    const { link } = await s.as(s.owner).invite(ACME);
    const page = await (await s.fetch(link)).text();
    expect(page).toContain('Kaan Arslan invited you to Acme');
    expect(page).toContain(`https://app.scrawlnotes.com/?join=${encodeURIComponent(link)}`);
    await s.as(null).accept(codeOf(link), { name: 'Mert', email: 'mert@example.com', password: PASSWORD, person: '', device: '' });
    expect(await (await s.fetch(link)).text()).toContain('This link was used already');
  });
});

describe('roles in a space', () => {
  it('lets its managers invite, make managers and take people out, and keeps one manager at least', async () => {
    const s = await start();
    const mert = await s.invited(ACME, 'Mert', 'mert@example.com');
    const deniz = await s.invited(ACME, 'Deniz', 'deniz@example.com');
    expect((await s.as(s.owner).members(ACME)).map((each) => [each.name, each.role])).toEqual([
      ['Kaan Arslan', 'manager'],
      ['Deniz', 'member'],
      ['Mert', 'member'],
    ]);
    // A member invites no one and takes no one out.
    expect(await refusal(s.as(mert.token).invite(ACME))).toMatchObject({ status: 403 });
    expect(await refusal(s.as(mert.token).removeMember(ACME, deniz.account.id))).toMatchObject({ status: 403 });

    await s.as(s.owner).setMemberRole(ACME, mert.account.id, 'manager');
    expect((await s.as(mert.token).invite(ACME)).link).toContain('/join/');
    await s.as(mert.token).removeMember(ACME, deniz.account.id);
    expect(await refusal(s.remote(deniz.token, ACME).changes(null))).toEqual(new RemoteFolderGone(true));
    expect(await refusal(s.as(mert.token).removeMember(ACME, mert.account.id))).toMatchObject({ code: 'yourself' });

    // Kaan the only manager left once Mert is a member again: he stays one.
    await s.as(s.owner).setMemberRole(ACME, mert.account.id, 'member');
    expect(await refusal(s.as(s.owner).setMemberRole(ACME, (await s.as(s.owner).me()).id, 'member'))).toMatchObject({ code: 'last-manager' });
  });

  it('lets the owner and admins manage every space they are in', async () => {
    const s = await start();
    const lena = await s.invited(OTHER, 'Lena', 'lena@example.com');
    await s.as(s.owner).setRole(lena.account.id, 'admin');
    // Lena is a member of Other, and an admin: she invites into it.
    expect((await s.as(lena.token).invite(OTHER)).link).toContain('/join/');
    expect(await refusal(s.as(lena.token).invite(ACME))).toMatchObject({ status: 403, code: 'not-member' });
  });

  it('keeps the owner and admins in a space unless the owner or an admin takes them out', async () => {
    const s = await start();
    const mert = await s.invited(ACME, 'Mert', 'mert@example.com');
    const lena = await s.invited(ACME, 'Lena', 'lena@example.com');
    await s.as(s.owner).setRole(lena.account.id, 'admin');
    await s.as(s.owner).setMemberRole(ACME, mert.account.id, 'manager');
    expect((await s.as(mert.token).members(ACME)).map((each) => [each.name, each.serverRole])).toEqual([
      ['Kaan Arslan', 'owner'],
      ['Mert', 'member'],
      ['Lena', 'admin'],
    ]);
    // Mert manages Acme, and is a member of the server: the owner and Lena stay.
    const kaan = (await s.as(s.owner).me()).id;
    expect(await refusal(s.as(mert.token).removeMember(ACME, kaan))).toMatchObject({ status: 403, code: 'not-allowed' });
    expect(await refusal(s.as(mert.token).removeMember(ACME, lena.account.id))).toMatchObject({ status: 403, code: 'not-allowed' });
    // Lena, an admin, takes Mert out; the owner takes Lena out.
    await s.as(lena.token).removeMember(ACME, mert.account.id);
    await s.as(s.owner).removeMember(ACME, lena.account.id);
    expect((await s.as(s.owner).members(ACME)).map((each) => each.name)).toEqual(['Kaan Arslan']);
  });
});

describe('the people on a server', () => {
  it('are listed for the owner and admins, made admins by the owner only, and taken off with their keys', async () => {
    const s = await start();
    const mert = await s.invited(ACME, 'Mert', 'mert@example.com');
    const lena = await s.invited(OTHER, 'Lena', 'lena@example.com');
    expect((await s.as(s.owner).people()).map((each) => [each.name, each.role, each.spaces])).toEqual([
      ['Kaan Arslan', 'owner', 2],
      ['Lena', 'member', 1],
      ['Mert', 'member', 1],
    ]);
    expect(await refusal(s.as(mert.token).people())).toMatchObject({ status: 403 });

    await s.as(s.owner).setRole(lena.account.id, 'admin');
    expect(await refusal(s.as(lena.token).setRole(mert.account.id, 'admin'))).toMatchObject({ status: 403 });
    expect(await refusal(s.as(lena.token).removePerson((await s.as(s.owner).me()).id))).toMatchObject({ code: 'owner' });

    // An admin reaches members only: no link for the owner's or another admin's password, no taking an admin off.
    const ben = await s.invited(OTHER, 'Ben', 'ben@example.com');
    await s.as(s.owner).setRole(ben.account.id, 'admin');
    expect(await refusal(s.as(lena.token).passwordLink((await s.as(s.owner).me()).id))).toMatchObject({ status: 403, code: 'not-allowed' });
    expect(await refusal(s.as(lena.token).passwordLink(ben.account.id))).toMatchObject({ status: 403, code: 'not-allowed' });
    expect(await refusal(s.as(lena.token).removePerson(ben.account.id))).toMatchObject({ status: 403, code: 'not-allowed' });
    expect((await s.as(lena.token).passwordLink(mert.account.id)).link).toContain('/join/');

    await s.as(lena.token).removePerson(mert.account.id);
    expect(await refusal(s.as(mert.token).me())).toBeInstanceOf(RemoteSignedOut);
    expect((await s.as(s.owner).members(ACME)).map((each) => each.name)).toEqual(['Kaan Arslan']);
    expect(await refusal(s.as(null).signIn({ email: 'mert@example.com', password: PASSWORD, device: '' }))).toMatchObject({ code: 'no-account' });
  });

  it('get a link for a new password, which ends their other keys', async () => {
    const s = await start();
    const mert = await s.invited(ACME, 'Mert', 'mert@example.com');
    const { link } = await s.as(s.owner).passwordLink(mert.account.id);
    expect(await s.as(null).invitation(codeOf(link))).toMatchObject({ kind: 'reset', email: 'mert@example.com', name: 'Mert' });
    expect(await refusal(s.as(null).setPassword(codeOf(link), { password: 'short', device: '' }))).toMatchObject({ code: 'short-password' });
    const fresh = await s.as(null).setPassword(codeOf(link), { password: 'a new long password', device: 'Phone' });
    expect(fresh.account.id).toBe(mert.account.id);
    expect(await refusal(s.as(mert.token).me())).toBeInstanceOf(RemoteSignedOut);
    expect((await s.as(fresh.token).me()).email).toBe('mert@example.com');
    expect((await s.as(null).signIn({ email: 'mert@example.com', password: 'a new long password', device: '' })).token).toBeTruthy();
    expect(await refusal(s.as(null).setPassword(codeOf(link), { password: 'another long one', device: '' }))).toMatchObject({ code: 'invite-used' });
  });
});
