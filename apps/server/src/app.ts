import { PassThrough, Readable } from 'node:stream';
import { rmSync } from 'node:fs';
import { upgradeWebSocket } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { type Account, type Accounts, Refused } from './auth';
import { type Blobs, TooLarge } from './blobs';
import { type Config, VERSION } from './config';
import { BadPath, checkPath, Conflict, type SpaceFiles } from './files';
import type { Chats } from './chat';
import type { Push } from './push';
import type { Live, LiveSocket } from './live';
import type { Invites } from './invites';
import { agentRoutes } from './agent';
import type { OAuth } from './oauth';
import { zipInto } from './export';
import { joinPage, type JoinFound, readyPage } from './pages';
import type { Spaces } from './spaces';

// The server's API: what the sync engine asks of a remote, and what the app asks to set the
// server up, sign in and open spaces. Every answer is JSON but a file's content; what cannot be
// done is told with a code, for the app to say it in its words. See design/server.md, section 5.

export interface Parts {
  config: Config;
  blobs: Blobs;
  files: SpaceFiles;
  accounts: Accounts;
  spaces: Spaces;
  live: Live;
  invites: Invites;
  oauth: OAuth;
  chats: Chats;
  push: Push;
  /** The server's clock, for what is measured against it. */
  now: () => number;
}

type Env = { Variables: { account: Account; device: string } };

/** The device's address, for counting sign-in tries: the proxy's word for it, else the connection's. */
function addressOf(c: Context): string {
  const forwarded = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim();
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return forwarded || incoming?.socket?.remoteAddress || '';
}

const json = async (c: Context): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await c.req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The file's path in a request to `/spaces/:id/files/<path>`, each part as it was written. */
function pathIn(c: Context, space: string): string {
  const raw = new URL(c.req.url).pathname.slice(`/api/v1/spaces/${space}/files/`.length);
  try {
    return checkPath(raw.split('/').map(decodeURIComponent).join('/'));
  } catch (error) {
    if (error instanceof URIError) throw new BadPath(raw);
    throw error;
  }
}

const unquote = (tag: string) => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');

export function createApp(parts: Parts) {
  const { config, blobs, files, accounts, spaces, live, invites, oauth, chats, push } = parts;
  const app = new Hono<Env>();

  app.use(
    '/api/*',
    cors({
      origin: '*',
      allowHeaders: ['Authorization', 'Content-Type', 'If-Match', 'If-None-Match'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['ETag'],
      maxAge: 86400,
    }),
  );

  app.onError((error, c) => {
    if (error instanceof Refused) return c.json({ error: { code: error.code, message: error.message } }, error.status);
    if (error instanceof Conflict) return c.json({ error: { code: 'changed', message: error.message } }, 412);
    if (error instanceof BadPath) return c.json({ error: { code: 'bad-path', message: error.message } }, 400);
    if (error instanceof TooLarge) return c.json({ error: { code: 'too-large', message: error.message } }, 413);
    console.error(error);
    return c.json({ error: { code: 'server', message: 'Something went wrong on the server' } }, 500);
  });

  const host = new URL(config.url).host;
  app.get('/', (c) => c.html(readyPage({ host, version: VERSION, isNew: accounts.isNew() })));

  // A link opened in a browser.
  app.get('/join/:code', (c) => {
    const code = c.req.param('code');
    let found: JoinFound;
    try {
      const invitation = invites.look(code);
      found = invitation.kind === 'space' ? { kind: 'space', space: invitation.space.name, by: invitation.by, expires: invitation.expires } : { kind: 'reset', email: invitation.email, expires: invitation.expires };
    } catch (error) {
      const why = error instanceof Refused ? error.code : '';
      found = { kind: why === 'invite-used' ? 'used' : why === 'invite-expired' ? 'expired' : 'none' };
    }
    return c.html(joinPage({ host, version: VERSION, link: `${config.url}/join/${code}`, appUrl: config.appUrl, found }));
  });

  // ---------- without a key: how the server stands, setting it up, signing in ----------

  // `personal`: it keeps personal spaces, so the app offers it for one (design/spaces.md); `chat`:
  // it has messaging, so the app shows Chat (design/chat.md, 1.2); `maxFileMb`: the largest file it
  // takes, which a message's file is weighed against before it is sent (design/chat.md, 4).
  app.get('/api/v1/server', (c) => c.json({ version: VERSION, new: accounts.isNew(), setupOpen: accounts.setupOpen(), personal: true, chat: true, push: true, maxFileMb: Math.round(config.maxFileBytes / (1024 * 1024)) }));
  app.post('/api/v1/setup', async (c) => c.json(await accounts.setUp(await json(c))));
  app.post('/api/v1/sessions', async (c) => c.json(await accounts.signIn(await json(c), addressOf(c))));

  // A link: what it is, joining a space with an invite, a new password with a reset link.
  app.get('/api/v1/invites/:code', (c) => c.json(invites.look(c.req.param('code'))));
  app.post('/api/v1/invites/:code/accept', async (c) => {
    const joined = await invites.accept(c.req.param('code'), await json(c), addressOf(c));
    // Someone new in a space is in its general room.
    chats.spaceChanged(joined.space.id);
    return c.json(joined);
  });
  app.post('/api/v1/invites/:code/reset', async (c) => {
    const done = await invites.setPassword(c.req.param('code'), await json(c));
    // Its other devices' connections end with their keys.
    live.end({ account: done.account.id });
    return c.json(done);
  });

  // The live channel: a browser cannot give a WebSocket a header, so the key comes as the first
  // message, within five seconds. Then the device hears every change of the spaces its person is in,
  // and what happens in their conversations. It says whether Scrawl is in use on it, which
  // conversation is on its screen, and that its person is writing in one.
  const heard = (socket: LiveSocket, data: unknown) => {
    let said: { type?: unknown; active?: unknown; viewing?: unknown; chat?: unknown } = {};
    try {
      said = JSON.parse(String(data)) as typeof said;
    } catch {
      return;
    }
    if (said.type === 'active') live.setActive(socket, said.active === true, typeof said.viewing === 'string' ? said.viewing : null);
    else if (said.type === 'typing' && typeof said.chat === 'string') live.tell(chats.typing(socket.account, said.chat), { type: 'typing', chat: said.chat, account: socket.account });
  };
  app.get(
    '/api/v1/live',
    upgradeWebSocket(() => {
      let socket: LiveSocket | null = null;
      let waiting: ReturnType<typeof setTimeout> | undefined;
      return {
        onOpen(_event, ws) {
          waiting = setTimeout(() => ws.close(4001, 'No key'), 5000);
        },
        onMessage(event, ws) {
          if (socket) {
            heard(socket, event.data);
            return;
          }
          clearTimeout(waiting);
          let hello: { type?: unknown; token?: unknown } = {};
          try {
            hello = JSON.parse(String(event.data)) as typeof hello;
          } catch {
            // Not a hello: refused below.
          }
          const who = hello.type === 'hello' && typeof hello.token === 'string' ? accounts.byToken(hello.token) : null;
          if (!who) {
            ws.send(JSON.stringify({ type: 'signed-out' }));
            ws.close(4401, 'Signed out');
            return;
          }
          socket = { account: who.account.id, device: who.device, send: (text) => ws.send(text), close: () => ws.close(4401, 'Signed out') };
          live.add(socket);
          ws.send(JSON.stringify({ type: 'ready' }));
          live.presenceFor(socket);
        },
        onClose() {
          clearTimeout(waiting);
          if (socket) live.remove(socket);
        },
      };
    }),
  );

  // ---------- everything else is a device's, by its key ----------

  app.use('/api/v1/*', async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const who = header.startsWith('Bearer ') ? accounts.byToken(header.slice(7).trim()) : null;
    if (!who) throw new Refused(401, 'signed-out', 'This device is not signed in to the server');
    // An agent's token is for /mcp only: it was given for that resource and nothing else.
    if (oauth.isAgent(who.device)) throw new Refused(401, 'agent-key', 'An agent’s key does not open the API; agents use /mcp');
    c.set('account', who.account);
    c.set('device', who.device);
    await next();
  });

  app.delete('/api/v1/sessions/current', (c) => {
    accounts.signOut(c.get('device'));
    live.end({ device: c.get('device') });
    return c.body(null, 204);
  });

  // The people on the server, for its owner and admins.
  app.get('/api/v1/accounts', (c) => c.json(accounts.list(c.get('account'))));
  app.patch('/api/v1/accounts/:id', async (c) => c.json(accounts.setRole(c.get('account'), c.req.param('id'), (await json(c)).role)));
  app.delete('/api/v1/accounts/:id', (c) => {
    const gone = accounts.remove(c.get('account'), c.req.param('id'));
    live.end({ account: gone.id });
    chats.leftSpaces(gone.id);
    return c.body(null, 204);
  });
  app.post('/api/v1/accounts/:id/reset', (c) => c.json(invites.reset(c.req.param('id'), c.get('account'))));
  // Every shared space and who is in it, for the owner and admins.
  app.get('/api/v1/shared-spaces', (c) => c.json(spaces.shared(c.get('account'))));
  app.get('/api/v1/me', (c) => c.json(c.get('account')));
  // The person's time zone, which the app tells as it signs in and as it opens.
  app.patch('/api/v1/me', async (c) => c.json(accounts.setTimeZone(c.get('account').id, (await json(c)).timeZone)));
  app.get('/api/v1/spaces', (c) => c.json(spaces.of(c.get('account').id)));
  app.post('/api/v1/spaces', async (c) => {
    const opened = spaces.open(c.get('account'), await json(c));
    if (!opened.personal) chats.openGeneral(opened.id);
    return c.json(opened);
  });
  // A new name, by its managers.
  app.patch('/api/v1/spaces/:id', async (c) => c.json(spaces.rename(c.req.param('id'), (await json(c)).name, c.get('account'))));

  // ---------- a space's files, for those in it ----------

  app.use('/api/v1/spaces/:id/*', async (c, next) => {
    spaces.check(c.req.param('id'), c.get('account').id);
    await next();
  });
  const actor = (c: Context<Env>) => ({ account: c.get('account').id, device: c.get('device') });

  // Who is in a space, their roles, inviting, taking out.
  app.get('/api/v1/spaces/:id/members', (c) => c.json(spaces.members(c.req.param('id'))));
  app.patch('/api/v1/spaces/:id/members/:account', async (c) => {
    spaces.setRole(c.req.param('id'), c.req.param('account'), (await json(c)).role, c.get('account'));
    return c.json(spaces.members(c.req.param('id')));
  });
  app.delete('/api/v1/spaces/:id/members/:account', (c) => {
    const space = c.req.param('id');
    const account = c.req.param('account');
    spaces.remove(space, account, c.get('account'));
    live.nudge(account, space);
    chats.leftSpaces(account);
    chats.spaceChanged(space);
    return c.body(null, 204);
  });
  app.post('/api/v1/spaces/:id/invites', (c) => c.json(invites.invite(c.req.param('id'), c.get('account'))));
  // Its rooms for Browse rooms (design/chat.md, 8.1).
  app.get('/api/v1/spaces/:id/rooms', (c) => c.json(chats.rooms(c.get('account').id, c.req.param('id'))));

  app.get('/api/v1/spaces/:id/changes', (c) => {
    const cursor = c.req.query('cursor');
    const at = c.req.query('at');
    return c.json(
      files.changes(c.req.param('id'), cursor === undefined || cursor === '' ? null : Number(cursor), {
        ...(c.req.query('after') !== undefined && { after: c.req.query('after') }),
        ...(at !== undefined && { at: Number(at) }),
      }),
    );
  });

  app.get('/api/v1/spaces/:id/files/*', (c) => {
    const space = c.req.param('id');
    const file = files.file(space, pathIn(c, space));
    if (!file) throw new Refused(404, 'no-file', 'No such file in this space');
    const stream = Readable.toWeb(blobs.open(file.hash)) as ReadableStream<Uint8Array>;
    return c.body(stream, 200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size), ETag: `"${file.hash}"` });
  });

  app.put('/api/v1/spaces/:id/files/*', async (c) => {
    const space = c.req.param('id');
    const path = pathIn(c, space);
    const ifMatch = c.req.header('If-Match');
    const expected = c.req.header('If-None-Match') === '*' ? null : ifMatch ? unquote(ifMatch) : undefined;
    if (expected === undefined) throw new Refused(400, 'no-condition', 'A write needs If-Match or If-None-Match: *');
    const taken = await blobs.take(c.req.raw.body, config.maxFileBytes);
    try {
      return c.json(files.write(space, path, taken, expected, actor(c)));
    } finally {
      rmSync(taken.temp, { force: true });
    }
  });

  app.delete('/api/v1/spaces/:id/files/*', (c) => {
    const space = c.req.param('id');
    const ifMatch = c.req.header('If-Match');
    files.remove(space, pathIn(c, space), ifMatch ? unquote(ifMatch) : null, actor(c));
    return c.body(null, 204);
  });

  app.post('/api/v1/spaces/:id/move', async (c) => {
    const body = await json(c);
    const from = typeof body.from === 'string' ? checkPath(body.from) : '';
    const to = typeof body.to === 'string' ? checkPath(body.to) : '';
    if (!from || !to) throw new Refused(400, 'bad-path', 'A move needs from and to');
    return c.json(files.move(c.req.param('id'), from, to, typeof body.ifMatch === 'string' ? body.ifMatch : null, actor(c)));
  });

  app.post('/api/v1/spaces/:id/dirs', async (c) => {
    const body = await json(c);
    files.mkdir(c.req.param('id'), typeof body.path === 'string' ? body.path : '', actor(c));
    return c.body(null, 204);
  });

  // ---------- messaging (design/chat.md, 11.2) ----------

  const me = (c: Context<Env>) => c.get('account');
  const number = (value: string | undefined) => (value === undefined || value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value));

  // Without a cursor, every conversation someone is in; with one, what changed after it.
  app.get('/api/v1/chat', (c) => c.json(chats.changes(me(c).id, null)));
  app.get('/api/v1/chat/changes', (c) => c.json(chats.changes(me(c).id, number(c.req.query('cursor')) ?? null)));
  // Messages found by their words, narrowed by who, where, what and when (design/chat.md, 7).
  app.get('/api/v1/chat/search', (c) => {
    const query = (key: string) => c.req.query(key) || undefined;
    return c.json(
      chats.search(me(c).id, {
        q: query('q'),
        from: query('from'),
        in: query('in'),
        has: query('has'),
        since: number(c.req.query('since')),
        until: number(c.req.query('until')),
        before: number(c.req.query('before')),
        limit: number(c.req.query('limit')),
      }),
    );
  });
  app.post('/api/v1/chat/rooms', async (c) => c.json(chats.openRoom(me(c), await json(c))));
  app.post('/api/v1/chat/direct', async (c) => c.json(chats.direct(me(c), (await json(c)).people)));

  // A file is sent on its own, then attached to a message by its digest.
  app.post('/api/v1/chat/files', async (c) => {
    const taken = await blobs.take(c.req.raw.body, config.maxFileBytes);
    try {
      return c.json(chats.upload(me(c).id, taken));
    } finally {
      rmSync(taken.temp, { force: true });
    }
  });
  app.get('/api/v1/chat/files/:hash', (c) => {
    const file = chats.file(me(c).id, c.req.param('hash'));
    const stream = Readable.toWeb(blobs.open(file.hash)) as ReadableStream<Uint8Array>;
    // A file's content never changes under its digest.
    return c.body(stream, 200, {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: `"${file.hash}"`,
    });
  });

  app.patch('/api/v1/chat/messages/:message', async (c) => c.json(chats.edit(me(c), c.req.param('message'), await json(c))));
  app.delete('/api/v1/chat/messages/:message', (c) => c.json(chats.remove(me(c), c.req.param('message'))));
  app.put('/api/v1/chat/messages/:message/reactions/:emoji', (c) => c.json(chats.react(me(c), c.req.param('message'), c.req.param('emoji'), true)));
  app.delete('/api/v1/chat/messages/:message/reactions/:emoji', (c) => c.json(chats.react(me(c), c.req.param('message'), c.req.param('emoji'), false)));

  app.get('/api/v1/chat/:id', (c) => c.json(chats.one(me(c).id, c.req.param('id'))));
  app.patch('/api/v1/chat/:id', async (c) => c.json(chats.change(me(c), c.req.param('id'), await json(c))));
  app.get('/api/v1/chat/:id/messages', (c) => {
    const around = c.req.query('around');
    return c.json(
      chats.messages(me(c).id, c.req.param('id'), {
        ...(number(c.req.query('before')) !== undefined && { before: number(c.req.query('before')) }),
        ...(number(c.req.query('after')) !== undefined && { after: number(c.req.query('after')) }),
        ...(around && { around }),
        ...(number(c.req.query('limit')) !== undefined && { limit: number(c.req.query('limit')) }),
      }),
    );
  });
  app.post('/api/v1/chat/:id/messages', async (c) => c.json(chats.send(me(c), c.req.param('id'), await json(c))));
  app.post('/api/v1/chat/:id/join', (c) => c.json(chats.join(me(c), c.req.param('id'))));
  app.post('/api/v1/chat/:id/members', async (c) => c.json(chats.add(me(c), c.req.param('id'), (await json(c)).accounts)));
  app.delete('/api/v1/chat/:id/members/:account', (c) => {
    chats.leave(me(c), c.req.param('id'), c.req.param('account'));
    return c.body(null, 204);
  });
  app.patch('/api/v1/chat/:id/me', async (c) => c.json(chats.setMine(me(c), c.req.param('id'), await json(c))));
  app.post('/api/v1/chat/:id/read', async (c) => c.json(chats.read(me(c), c.req.param('id'), (await json(c)).seq)));
  // Notifications by Web Push (design/chat.md, 6 and 11.4): the server's key, a browser's subscription, a test.
  app.get('/api/v1/push/key', (c) => c.json({ key: push.keys.publicKey }));
  app.post('/api/v1/push/subscriptions', async (c) => {
    push.subscribe(me(c).id, c.get('device'), await json(c));
    return c.body(null, 204);
  });
  app.delete('/api/v1/push/subscriptions', async (c) => {
    push.unsubscribe(me(c).id, (await json(c)).endpoint);
    return c.body(null, 204);
  });
  app.post('/api/v1/push/test', async (c) => c.json({ sent: await push.test(me(c).id, c.get('device')) }));
  // Its files and links for its Info window, and its export: a zip written as it is sent (design/chat.md, 8.1 and 10).
  app.get('/api/v1/chat/:id/shared', (c) => c.json(chats.shared(me(c).id, c.req.param('id'))));
  app.get('/api/v1/chat/:id/export', (c) => {
    const { name, entries } = chats.exportOf(me(c).id, c.req.param('id'), c.req.query('tz') ?? 'UTC');
    const out = new PassThrough();
    void zipInto(
      out,
      entries.map((entry) => ({ name: entry.name, from: entry.hash ? blobs.pathOf(entry.hash) : null, ...(entry.text !== undefined && { text: entry.text }), at: entry.at })),
    ).catch((error: unknown) => out.destroy(error instanceof Error ? error : new Error(String(error))));
    return c.body(Readable.toWeb(out) as ReadableStream<Uint8Array>, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`,
    });
  });

  // ---------- agents: the MCP door and its sign-in ----------

  agentRoutes(app, parts, addressOf);

  return app;
}
