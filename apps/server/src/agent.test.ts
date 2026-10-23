import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ServerAccount } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { type Config } from './config';
import type { LiveSocket } from './live';
import { makeServer } from './server';

// The agent's door: an agent signs in through the server's own OAuth, gets a token for /mcp, and
// works on the spaces its person is in with the same tools as on a computer. See design/agent.md,
// 7 and 10.

const URL_ = 'https://kaan.scrawlnotes.com';
const PERSON = '0b6f3c9e-7a51-4d2a-9a43-2f1c9d5e8b10';
const SPACE = 'sp-k7f3m2qa';
const CLAUDE_DOC = 'https://claude.ai/oauth/claude-client-metadata';
const opened: { data: string; close: () => void }[] = [];

afterEach(() => {
  for (const { data, close } of opened.splice(0)) {
    close();
    rmSync(data, { recursive: true, force: true });
  }
});

/** A metadata document server for the tests: Claude's, and a few that must be refused. */
const docs: typeof fetch = async (input) => {
  const url = String(input);
  if (url === CLAUDE_DOC) {
    return new Response(JSON.stringify({ client_id: CLAUDE_DOC, client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback', 'http://127.0.0.1/callback'] }), { status: 200 });
  }
  if (url === 'https://example.com/liar') return new Response(JSON.stringify({ client_id: 'https://example.com/other', redirect_uris: ['https://example.com/cb'] }), { status: 200 });
  throw new Error(`fetched ${url}`);
};

function start() {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-agent-'));
  let clock = Date.UTC(2026, 9, 15, 10, 0);
  const config: Config = { url: URL_, port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' };
  const server = makeServer(config, { now: () => clock, fetchDoc: docs });
  opened.push({
    data,
    close: () => {
      server.live.stop();
      server.db.close();
    },
  });
  const fetch: typeof globalThis.fetch = (input, init) => Promise.resolve(server.app.request(input instanceof Request ? input : String(input), init));
  const account = (token: string | null = null) => new ServerAccount({ url: URL_, token: () => token, fetch });
  return { server, fetch, account, later: (ms: number) => (clock += ms) };
}

type S = ReturnType<typeof start>;

/** A file's text as the server keeps it, by its digest. */
const readOf = (s: S, hash: string) => readFileSync(s.server.blobs.pathOf(hash), 'utf8');

async function owner(s: S) {
  const { token } = await s.account().setUp({ name: 'Kaan Arslan', email: 'kaan@outlook.com', password: 'a long password', person: PERSON, device: 'Laptop' });
  await s.account(token).openSpace(SPACE, 'Acme');
  return token;
}

const form = (fields: { [key: string]: string }) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

/** A code verifier and its S256 challenge, as a client makes them. */
function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Registers a client (DCR), unless a metadata address is given. */
async function clientOf(s: S, cimd?: string): Promise<{ id: string; redirect: string }> {
  if (cimd) return { id: cimd, redirect: 'https://claude.ai/api/mcp/auth_callback' };
  const registered = await s.fetch(`${URL_}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Test agent', redirect_uris: ['https://agent.example/callback'] }) });
  expect(registered.status).toBe(201);
  const body = (await registered.json()) as { client_id: string; token_endpoint_auth_method: string };
  expect(body.token_endpoint_auth_method).toBe('none');
  return { id: body.client_id, redirect: 'https://agent.example/callback' };
}

/** The sign-in as a client does it: the page, the person's password, the code, the tokens. */
async function signIn(s: S, options: { cimd?: string; redirect?: string; password?: string; deny?: boolean } = {}) {
  const client = await clientOf(s, options.cimd);
  const redirect = options.redirect ?? client.redirect;
  const { verifier, challenge } = pkce();
  const params = new URLSearchParams({ client_id: client.id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: `${URL_}/mcp`, scope: 'scrawl offline_access' });
  const page = await s.fetch(`${URL_}/oauth/authorize?${params}`);
  if (page.status !== 200) return { page, client, verifier };
  expect(await page.text()).toContain('use your Scrawl account');
  const answered = await s.fetch(`${URL_}/oauth/authorize`, form({ ...Object.fromEntries(params), email: 'kaan@outlook.com', password: options.password ?? 'a long password', decision: options.deny ? 'deny' : 'allow' }));
  if (answered.status !== 302) return { page, answered, client, verifier };
  const location = new URL(answered.headers.get('Location')!);
  return { page, answered, location, client, verifier, code: location.searchParams.get('code') ?? '' };
}

async function tokensOf(s: S, client: { id: string; redirect: string }, code: string, verifier: string) {
  const response = await s.fetch(`${URL_}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: client.redirect, client_id: client.id, resource: `${URL_}/mcp` }));
  return { status: response.status, body: (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } };
}

async function connect(s: S) {
  const done = await signIn(s);
  const { body } = await tokensOf(s, done.client, done.code!, done.verifier);
  return { access: body.access_token!, refresh: body.refresh_token!, client: done.client };
}

/** An MCP client over the server's /mcp with a token. */
async function mcp(s: S, access: string) {
  const transport = new StreamableHTTPClientTransport(new URL(`${URL_}/mcp`), { fetch: s.fetch, requestInit: { headers: { Authorization: `Bearer ${access}` } } });
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

describe('discovery', () => {
  it('tells where the sign-in is, and asks for one on /mcp without a token', async () => {
    const s = start();
    const resource = (await (await s.fetch(`${URL_}/.well-known/oauth-protected-resource/mcp`)).json()) as { resource: string; authorization_servers: string[] };
    expect(resource).toMatchObject({ resource: `${URL_}/mcp`, authorization_servers: [URL_], scopes_supported: ['scrawl'] });
    const as = (await (await s.fetch(`${URL_}/.well-known/oauth-authorization-server`)).json()) as { [key: string]: unknown };
    expect(as).toMatchObject({ issuer: URL_, token_endpoint: `${URL_}/oauth/token`, registration_endpoint: `${URL_}/oauth/register`, code_challenge_methods_supported: ['S256'], client_id_metadata_document_supported: true, token_endpoint_auth_methods_supported: ['none'] });
    const bare = await s.fetch(`${URL_}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
    expect(bare.status).toBe(401);
    expect(bare.headers.get('WWW-Authenticate')).toContain(`resource_metadata="${URL_}/.well-known/oauth-protected-resource/mcp"`);
  });
});

describe('signing in', () => {
  it('registers a client, shows the page, takes the password, gives a code and turns it into tokens once', async () => {
    const s = start();
    await owner(s);
    const done = await signIn(s);
    expect(done.location!.origin + done.location!.pathname).toBe('https://agent.example/callback');
    expect(done.location!.searchParams.get('state')).toBe('xyz');
    expect(done.location!.searchParams.get('iss')).toBe(URL_);
    const wrong = await tokensOf(s, done.client, done.code!, 'not the verifier');
    expect(wrong).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
    const tokens = await tokensOf(s, done.client, done.code!, done.verifier);
    expect(tokens.status).toBe(200);
    expect(tokens.body).toMatchObject({ expires_in: 3600 });
    expect(tokens.body.access_token).toBeTruthy();
    // A code is for once: used again, it ends what it gave.
    const again = await tokensOf(s, done.client, done.code!, done.verifier);
    expect(again.body.error).toBe('invalid_grant');
    const ended = await s.fetch(`${URL_}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${tokens.body.access_token}` }, body: '{}' });
    expect(ended.status).toBe(401);
  });

  it('lets Enter allow: Allow is the form’s first submit button, and a form without a decision allows', async () => {
    const s = start();
    await owner(s);
    const client = await clientOf(s);
    const { challenge } = pkce();
    const params = new URLSearchParams({ client_id: client.id, redirect_uri: client.redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: `${URL_}/mcp` });
    const html = await (await s.fetch(`${URL_}/oauth/authorize?${params}`)).text();
    expect(html.indexOf('value="allow"')).toBeGreaterThan(0);
    expect(html.indexOf('value="allow"')).toBeLessThan(html.indexOf('value="deny"'));
    const answered = await s.fetch(`${URL_}/oauth/authorize`, form({ ...Object.fromEntries(params), email: 'kaan@outlook.com', password: 'a long password' }));
    expect(answered.status).toBe(302);
    expect(new URL(answered.headers.get('Location')!).searchParams.get('code')).toBeTruthy();
  });

  it('refuses a wrong password on the page, and sends the client back when the person says no', async () => {
    const s = start();
    await owner(s);
    const wrong = await signIn(s, { password: 'nope' });
    expect(wrong.answered!.status).toBe(401);
    expect(await wrong.answered!.text()).toContain('The password is not right');
    const denied = await signIn(s, { deny: true });
    expect(denied.location!.searchParams.get('error')).toBe('access_denied');
  });

  it('takes a client that brings its metadata document, with the loopback on any port, and refuses the ones it must', async () => {
    const s = start();
    await owner(s);
    const claude = await signIn(s, { cimd: CLAUDE_DOC });
    expect(claude.location!.searchParams.get('code')).toBeTruthy();
    const loopback = await signIn(s, { cimd: CLAUDE_DOC, redirect: 'http://localhost:3118/callback' });
    expect(loopback.location!.pathname).toBe('/callback');
    const elsewhere = await signIn(s, { cimd: CLAUDE_DOC, redirect: 'https://evil.example/callback' });
    expect(elsewhere.page.status).toBe(400);
    expect(await elsewhere.page.text()).toContain('not one this client registered');
    expect((await signIn(s, { cimd: 'http://claude.ai/doc' })).page.status).toBe(400);
    expect((await signIn(s, { cimd: 'https://127.0.0.1/doc' })).page.status).toBe(400);
    expect((await signIn(s, { cimd: 'https://localhost/doc' })).page.status).toBe(400);
    const liar = await signIn(s, { cimd: 'https://example.com/liar' });
    expect(await liar.page.text()).toContain('does not name its own address');
  });

  it('registers Cursor, which sends its own scheme with the others, and sends it back to either; refuses a scheme the browser runs', async () => {
    const s = start();
    await owner(s);
    const register = (redirect_uris: string[]) => s.fetch(`${URL_}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Cursor', redirect_uris }) });
    const cursor = await register(['cursor://anysphere.cursor-mcp/oauth/callback', 'https://www.cursor.com/agents/mcp/oauth/callback', 'http://localhost:8787/callback']);
    expect(cursor.status).toBe(201);
    const { client_id } = (await cursor.json()) as { client_id: string };
    for (const redirect of ['cursor://anysphere.cursor-mcp/oauth/callback', 'http://localhost:8787/callback']) {
      const { challenge } = pkce();
      const params = new URLSearchParams({ client_id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: `${URL_}/mcp` });
      expect((await s.fetch(`${URL_}/oauth/authorize?${params}`)).status).toBe(200);
      const answered = await s.fetch(`${URL_}/oauth/authorize`, form({ ...Object.fromEntries(params), email: 'kaan@outlook.com', password: 'a long password' }));
      const location = answered.headers.get('Location')!;
      expect(location.startsWith(`${redirect}?`)).toBe(true);
      expect(new URL(location).searchParams.get('code')).toBeTruthy();
    }
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'http://evil.example/callback']) {
      const refused = await register(['cursor://anysphere.cursor-mcp/oauth/callback', bad]);
      expect(refused.status).toBe(400);
      expect(((await refused.json()) as { error: string }).error).toBe('invalid_redirect_uri');
    }
  });

  it('turns a refresh token over, ends an access token in an hour, and lets the person disconnect', async () => {
    const s = start();
    const key = await owner(s);
    const { access, refresh } = await connect(s);
    const listed = await s.account(key).agents();
    expect(listed.map((a) => a.client)).toEqual(['Test agent']);
    expect(listed[0]!.connected).toBeGreaterThan(0);
    // An agent's key opens /mcp and nothing else.
    expect((await s.fetch(`${URL_}/api/v1/me`, { headers: { Authorization: `Bearer ${access}` } })).status).toBe(401);
    s.later(60 * 60 * 1000 + 1);
    const stale = await s.fetch(`${URL_}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${access}` }, body: '{}' });
    expect(stale.status).toBe(401);
    const turned = (await (await s.fetch(`${URL_}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: refresh }))).json()) as { access_token: string; refresh_token: string };
    expect(turned.access_token).not.toBe(access);
    const old = (await (await s.fetch(`${URL_}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: refresh }))).json()) as { error: string };
    expect(old.error).toBe('invalid_grant');
    const client = await mcp(s, turned.access_token);
    expect((await client.callTool({ name: 'spaces', arguments: {} })).structuredContent).toMatchObject({ person: 'Kaan Arslan', spaces: [{ id: SPACE, name: 'Acme', where: 'kaan.scrawlnotes.com' }] });
    await client.close();
    await s.account(key).disconnectAgent(listed[0]!.id);
    expect(await s.account(key).agents()).toEqual([]);
    const gone = await s.fetch(`${URL_}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${turned.access_token}` }, body: '{}' });
    expect(gone.status).toBe(401);
    expect(((await (await s.fetch(`${URL_}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: turned.refresh_token }))).json()) as { error: string }).error).toBe('invalid_grant');
  });
});

describe('working through /mcp', () => {
  it('serves the tools over HTTP, writes to the space as the account with the agent as the device, and tells the live channel', async () => {
    const s = start();
    await owner(s);
    const { access } = await connect(s);
    const heard: string[] = [];
    const socket: LiveSocket = { account: PERSON, device: 'laptop', send: (text) => heard.push(text), close: () => undefined };
    s.server.live.add(socket);
    const client = await mcp(s, access);
    expect((await client.listTools()).tools.length).toBe(15);
    expect(client.getInstructions()).toContain('## What each tool is for');
    expect(((await client.callTool({ name: 'spaces', arguments: {} })).content as { text: string }[])[0]!.text).toContain('# Scrawl for agents');
    const made =await client.callTool({ name: 'create', arguments: { kind: 'board', name: 'Scrawl', template: 'software' } });
    expect(made.structuredContent).toMatchObject({ space: SPACE, path: 'Scrawl.board.json' });
    const card = await client.callTool({ name: 'save_card', arguments: { board: 'Scrawl', title: 'Write the server door', column: 'Todo' } });
    expect(card.isError).toBeFalsy();
    expect(card.structuredContent).toMatchObject({ card: { key: 'SCR-1', column: { name: 'Todo' } } });
    const cards = await client.callTool({ name: 'cards', arguments: { board: 'Scrawl' } });
    expect((cards.structuredContent as { cards: { title: string }[] }).cards.map((c) => c.title)).toEqual(['Write the server door']);
    const file = s.server.files.file(SPACE, 'Scrawl.board.json');
    expect(file).toBeTruthy();
    const written = s.server.db.prepare('SELECT author_id, device_id FROM versions WHERE space_id = ? AND path = ? ORDER BY at DESC LIMIT 1').get(SPACE, 'Scrawl.board.json') as { author_id: string; device_id: string };
    expect(written.author_id).toBe(PERSON);
    expect(s.server.oauth.isAgent(written.device_id)).toBe(true);
    expect(heard.filter((text) => text.includes('"changed"')).length).toBeGreaterThanOrEqual(2);
    // A note written, then written over with the hash read gave: the server keeps the versions, not a history folder.
    const note = await client.callTool({ name: 'write', arguments: { path: 'Plans/Roadmap.md', text: '# Roadmap\n\nOctober.\n' } });
    expect(note.isError).toBeFalsy();
    const again = await client.callTool({ name: 'write', arguments: { path: 'Plans/Roadmap.md', text: '# Roadmap\n\nNovember.\n', ifMatch: (note.structuredContent as { hash: string }).hash } });
    expect(again.isError).toBeFalsy();
    expect((again.structuredContent as { created: boolean }).created).toBe(false);
    expect(s.server.db.prepare('SELECT COUNT(*) AS n FROM versions WHERE space_id = ? AND path = ?').get(SPACE, 'Plans/Roadmap.md')).toEqual({ n: 2 });
    const text = await client.callTool({ name: 'read', arguments: { path: 'Scrawl.board.json' } });
    expect((text.content[0] as { text: string }).text).toContain('"prefix": "SCR"');
    const board = JSON.parse((text.content[0] as { text: string }).text) as { cards: { author: { id: string; name: string } }[] };
    expect(board.cards[0]!.author).toEqual({ id: expect.stringMatching(new RegExp(`^${PERSON}:[0-9a-f]{8}$`)), name: 'Test agent' });
    // A board's phases alone, read and written back, its cards as they were; a note changed where its text is.
    const phases = await client.callTool({ name: 'read', arguments: { path: 'Scrawl.board.json', part: 'phases' } });
    expect(phases.structuredContent).toMatchObject({ part: 'phases', text: '[]' });
    const phased = await client.callTool({ name: 'write', arguments: { path: 'Scrawl.board.json', part: 'phases', text: JSON.stringify([{ name: 'Server', state: 'current' }]), ifMatch: (phases.structuredContent as { hash: string }).hash } });
    expect(phased.structuredContent).toMatchObject({ part: 'phases', written: true });
    const after = JSON.parse(((await client.callTool({ name: 'read', arguments: { path: 'Scrawl.board.json' } })).content[0] as { text: string }).text) as { phases: { name: string }[]; cards: { title: string }[] };
    expect(after.phases.map((p) => p.name)).toEqual(['Server']);
    expect(after.cards.map((c) => c.title)).toEqual(['Write the server door']);
    const edited = await client.callTool({ name: 'write', arguments: { path: 'Plans/Roadmap.md', edits: [{ find: 'November', replace: 'December' }] } });
    expect(edited.structuredContent).toMatchObject({ replaced: 1 });
    expect(s.server.db.prepare('SELECT COUNT(*) AS n FROM versions WHERE space_id = ? AND path = ?').get(SPACE, 'Plans/Roadmap.md')).toEqual({ n: 3 });
    await client.close();
  });

  it('keeps the person’s time zone as the app tells it, and gives an agent their today, not the server’s', async () => {
    const s = start();
    const key = await owner(s);
    expect((await s.account(key).setTimeZone('Europe/Istanbul')).timeZone).toBe('Europe/Istanbul');
    await expect(s.account(key).setTimeZone('Mars/Olympus')).rejects.toMatchObject({ status: 400, code: 'bad-time-zone' });
    // 22:30 at the server is 01:30 the next day in Istanbul.
    s.later(12.5 * 60 * 60 * 1000);
    const { access } = await connect(s);
    const client = await mcp(s, access);
    expect((await client.callTool({ name: 'spaces', arguments: {} })).structuredContent).toMatchObject({ today: '2026-10-16' });
    const note = await client.callTool({ name: 'create', arguments: { kind: 'note', name: '' } });
    expect(note.structuredContent).toMatchObject({ path: '2026-10-16 013000.md' });
    await client.close();
  });

  it('shows the person’s personal space there as theirs, and puts a task with neither a space nor a list in its Inbox', async () => {
    const s = start();
    const key = await owner(s);
    await s.account(key).openSpace('sp-kaanmine', 'Personal', true);
    const { access } = await connect(s);
    const client = await mcp(s, access);
    const listed = (await client.callTool({ name: 'spaces', arguments: {} })).structuredContent as { spaces: { id: string; personal: boolean }[] };
    expect(listed.spaces.map((each) => [each.id, each.personal])).toEqual(expect.arrayContaining([[SPACE, false], ['sp-kaanmine', true]]));
    const added = await client.callTool({ name: 'save_task', arguments: { title: 'Renew the domain' } });
    expect(added.isError).toBeFalsy();
    expect(added.structuredContent).toMatchObject({ space: 'sp-kaanmine', list: 'Inbox.tasks.json' });
    expect(s.server.files.file('sp-kaanmine', 'Inbox.tasks.json')).toBeTruthy();
    await client.close();
  });

  it('gives each agent its own identity, writes it into a space it changes once a day, and lets the person rename it', async () => {
    const s = start();
    const key = await owner(s);
    await s.account(key).openSpace('sp-kaanmine', 'Personal', true);
    const people = () => (s.server.files.file(SPACE, '.scrawl/people.json') ? (JSON.parse(readOf(s, s.server.files.file(SPACE, '.scrawl/people.json')!.hash)) as { people: { id: string; name: string; agent?: object }[] }).people : []);
    const peopleVersions = () => (s.server.db.prepare('SELECT COUNT(*) AS n FROM versions WHERE space_id = ? AND path = ?').get(SPACE, '.scrawl/people.json') as { n: number }).n;
    // Signed in, it has no identity until it writes.
    const first = await connect(s);
    expect((await s.account(key).agents())[0]).toMatchObject({ client: 'Test agent', name: null });
    const client = await mcp(s, first.access);
    await client.callTool({ name: 'spaces', arguments: {} });
    expect(people()).toEqual([]);
    // Writing in the personal space writes no one there; writing in Acme writes it into Acme's people.
    expect((await client.callTool({ name: 'save_task', arguments: { title: 'Renew the domain' } })).structuredContent).toMatchObject({ space: 'sp-kaanmine' });
    expect(s.server.files.file('sp-kaanmine', '.scrawl/people.json')).toBeFalsy();
    await client.callTool({ name: 'create', arguments: { kind: 'board', name: 'Scrawl', template: 'software', space: SPACE } });
    const agent = people().find((p) => p.id.startsWith(`${PERSON}:`))!;
    expect(agent).toMatchObject({ name: 'Test agent', agent: { client: 'Test agent' }, active: true });
    expect((await s.account(key).agents())[0]).toMatchObject({ name: 'Test agent' });
    // The same day, the next change writes no more; the card carries the identity.
    await client.callTool({ name: 'save_card', arguments: { board: 'Scrawl', title: 'Write the server door' } });
    expect(peopleVersions()).toBe(1);
    const board = JSON.parse(readOf(s, s.server.files.file(SPACE, 'Scrawl.board.json')!.hash)) as { cards: { author: { id: string } }[] };
    expect(board.cards[0]!.author.id).toBe(agent.id);
    // Renamed, the next change writes the new name.
    const connection = (await s.account(key).agents())[0]!;
    expect(await s.account(key).renameAgent(connection.id, ' Claude Code (Mac mini) ')).toEqual({ id: agent.id, name: 'Claude Code (Mac mini)' });
    await expect(s.account(key).renameAgent(connection.id, ' ')).rejects.toMatchObject({ status: 400 });
    await client.callTool({ name: 'save_card', arguments: { board: 'Scrawl', title: 'Rename an agent' } });
    expect(people().find((p) => p.id === agent.id)!.name).toBe('Claude Code (Mac mini)');
    await client.close();
    // Another client of the same account is another agent, named apart.
    const second = await connect(s);
    const other = await mcp(s, second.access);
    await other.callTool({ name: 'save_card', arguments: { board: 'Scrawl', title: 'From the second one' } });
    expect(people().filter((p) => p.id.startsWith(`${PERSON}:`)).map((p) => p.name).sort()).toEqual(['Claude Code (Mac mini)', 'Test agent (2)']);
    await other.close();
  });

  it('keeps an agent’s identity when the same client signs in again', async () => {
    const s = start();
    const key = await owner(s);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const done = await signIn(s, { cimd: CLAUDE_DOC });
      const { body } = await tokensOf(s, done.client, done.code!, done.verifier);
      const client = await mcp(s, body.access_token!);
      await client.callTool({ name: 'write', arguments: { path: `Note ${i}.md`, text: 'Hello.\n' } });
      await client.close();
      const listed = await s.account(key).agents();
      expect(listed.every((a) => a.name === 'Claude')).toBe(true);
      ids.push(...(s.server.db.prepare('SELECT id FROM agent_identities').all() as { id: string }[]).map((r) => r.id));
    }
    expect(new Set(ids).size).toBe(1);
  });

  it('shows an agent only the spaces its person is in', async () => {
    const s = start();
    const key = await owner(s);
    const other = await s.account(key).openSpace('sp-abcdefgh', 'Other');
    expect(other.id).toBe('sp-abcdefgh');
    const invite = await s.account(key).invite('sp-abcdefgh');
    const code = invite.link.split('/join/')[1]!;
    const mert = await s.account().accept(code, { name: 'Mert', email: 'mert@example.com', password: 'another password', person: 'p-mert', device: 'Phone' });
    expect(mert.space.id).toBe('sp-abcdefgh');
    // Mert signs an agent in.
    const done = await signIn(s);
    const client = await clientOf(s);
    const { verifier, challenge } = pkce();
    const params = new URLSearchParams({ client_id: client.id, redirect_uri: client.redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', resource: `${URL_}/mcp` });
    const answered = await s.fetch(`${URL_}/oauth/authorize`, form({ ...Object.fromEntries(params), email: 'mert@example.com', password: 'another password', decision: 'allow' }));
    const mertCode = new URL(answered.headers.get('Location')!).searchParams.get('code')!;
    const { body } = await tokensOf(s, client, mertCode, verifier);
    const agent = await mcp(s, body.access_token!);
    expect((await agent.callTool({ name: 'spaces', arguments: {} })).structuredContent).toMatchObject({ person: 'Mert', spaces: [{ id: 'sp-abcdefgh', name: 'Other' }] });
    const refused = await agent.callTool({ name: 'tree', arguments: { space: 'Acme' } });
    expect(refused.isError).toBe(true);
    await agent.close();
    expect(done.code).toBeTruthy();
  });
});
