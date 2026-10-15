import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { ServerAccount, ServerLive, ServerRemote } from '@scrawlnotes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { makeServer } from './server';

// The live channel over a real connection: a server listening on this computer, and the app's
// client in packages/core with Node's own WebSocket.

const SPACE = 'sp-k7f3m2qa';
const OTHER = 'sp-zzzzzzzz';
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function listen() {
  const data = mkdtempSync(join(tmpdir(), 'scrawl-live-'));
  const server = makeServer({ url: 'http://localhost', port: 0, data, maxFileBytes: 1024 * 1024, ownerEmail: null, appUrl: 'https://app.scrawlnotes.com' });
  const sockets = new WebSocketServer({ noServer: true });
  const http = serve({ fetch: server.app.fetch, port: 0, websocket: { server: sockets } });
  await new Promise<void>((resolve) => http.once('listening', () => resolve()));
  const url = `http://localhost:${(http.address() as AddressInfo).port}`;
  closers.push(async () => {
    server.live.stop();
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    server.db.close();
    rmSync(data, { recursive: true, force: true });
  });
  const { token } = await new ServerAccount({ url, token: () => null }).setUp({ name: 'Kaan', email: 'kaan@example.com', password: 'a long password', person: 'p-owner-0001', device: 'Laptop' });
  const account = new ServerAccount({ url, token: () => token });
  await account.openSpace(SPACE, 'Acme');
  await account.openSpace(OTHER, 'Other');
  return { server, url, token };
}

/** Waits until `check` holds, a few seconds at most. */
async function until(check: () => boolean) {
  for (let waited = 0; !check(); waited += 20) {
    if (waited > 3000) throw new Error('Waited too long');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function connect(url: string, token: string) {
  const heard: { space: string; seq: number }[] = [];
  const state = { live: false, signedOut: false };
  const live = new ServerLive({
    url,
    token: () => token,
    onChanged: (space, seq) => heard.push({ space, seq }),
    onLive: (on) => (state.live = on),
    onSignedOut: () => (state.signedOut = true),
  });
  live.start();
  closers.unshift(async () => live.stop());
  return { heard, state, live };
}

describe('the live channel', () => {
  it('tells a connected device every change of its spaces, with the space’s number', async () => {
    const { url, token } = await listen();
    const device = connect(url, token);
    await until(() => device.state.live);
    const remote = new ServerRemote({ url, token: () => token, space: SPACE });
    const file = await remote.write('Plan.md', new Blob(['# Plan']), null);
    await until(() => device.heard.length === 1);
    await remote.move('Plan.md', 'Notes/Plan.md', file.tag);
    await until(() => device.heard.length === 2);
    const { cursor } = await remote.changes(null);
    expect(device.heard.map((each) => each.space)).toEqual([SPACE, SPACE]);
    expect(device.heard.at(-1)!.seq).toBe(Number(cursor));
  });

  it('tells nothing of a space the person is not in', async () => {
    const { server, url, token } = await listen();
    server.db.prepare("INSERT INTO accounts (id, email, name, password, role, created_at) VALUES ('m1', 'mert@example.com', 'Mert', 'x', 'member', 0)").run();
    server.db.prepare("INSERT INTO members (space_id, account_id, role, added_at) VALUES (?, 'm1', 'member', 0)").run(OTHER);
    const memberKey = (server.accounts as unknown as { newDevice(a: string, n: string): string }).newDevice('m1', 'Phone');
    const member = connect(url, memberKey);
    await until(() => member.state.live);
    await new ServerRemote({ url, token: () => token, space: SPACE }).write('Acme only.md', new Blob(['x']), null);
    await new ServerRemote({ url, token: () => token, space: OTHER }).write('Shared.md', new Blob(['y']), null);
    await until(() => member.heard.length === 1);
    expect(member.heard[0]!.space).toBe(OTHER);
  });

  it('says a key the server does not take, and opens again after the connection is lost', async () => {
    const { url, token } = await listen();
    const stranger = connect(url, 'not a key');
    await until(() => stranger.state.signedOut);
    expect(stranger.state.live).toBe(false);

    const device = connect(url, token);
    await until(() => device.state.live);
    (device.live as unknown as { socket: WebSocket }).socket.close();
    await until(() => !device.state.live);
    await until(() => device.state.live);
    await new ServerRemote({ url, token: () => token, space: SPACE }).write('After.md', new Blob(['z']), null);
    await until(() => device.heard.length === 1);
  });
});
