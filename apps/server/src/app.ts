import { Readable } from 'node:stream';
import { rmSync } from 'node:fs';
import { upgradeWebSocket } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { type Account, type Accounts, Refused } from './auth';
import { type Blobs, TooLarge } from './blobs';
import { type Config, VERSION } from './config';
import { BadPath, checkPath, Conflict, type SpaceFiles } from './files';
import type { Live, LiveSocket } from './live';
import type { Invites } from './invites';
import { agentRoutes } from './agent';
import type { OAuth } from './oauth';
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
  const { config, blobs, files, accounts, spaces, live, invites, oauth } = parts;
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

  // `personal`: it keeps personal spaces, so the app offers it for one (design/spaces.md).
  app.get('/api/v1/server', (c) => c.json({ version: VERSION, new: accounts.isNew(), setupOpen: accounts.setupOpen(), personal: true }));
  app.post('/api/v1/setup', async (c) => c.json(await accounts.setUp(await json(c))));
  app.post('/api/v1/sessions', async (c) => c.json(await accounts.signIn(await json(c), addressOf(c))));

  // A link: what it is, joining a space with an invite, a new password with a reset link.
  app.get('/api/v1/invites/:code', (c) => c.json(invites.look(c.req.param('code'))));
  app.post('/api/v1/invites/:code/accept', async (c) => c.json(await invites.accept(c.req.param('code'), await json(c), addressOf(c))));
  app.post('/api/v1/invites/:code/reset', async (c) => {
    const done = await invites.setPassword(c.req.param('code'), await json(c));
    // Its other devices' connections end with their keys.
    live.end({ account: done.account.id });
    return c.json(done);
  });

  // The live channel: a browser cannot give a WebSocket a header, so the key comes as the first
  // message, within five seconds. Then the device hears every change of the spaces its person is in.
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
          if (socket) return;
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
    return c.body(null, 204);
  });
  app.post('/api/v1/accounts/:id/reset', (c) => c.json(invites.reset(c.req.param('id'), c.get('account'))));
  // Every shared space and who is in it, for the owner and admins.
  app.get('/api/v1/shared-spaces', (c) => c.json(spaces.shared(c.get('account'))));
  app.get('/api/v1/me', (c) => c.json(c.get('account')));
  // The person's time zone, which the app tells as it signs in and as it opens.
  app.patch('/api/v1/me', async (c) => c.json(accounts.setTimeZone(c.get('account').id, (await json(c)).timeZone)));
  app.get('/api/v1/spaces', (c) => c.json(spaces.of(c.get('account').id)));
  app.post('/api/v1/spaces', async (c) => c.json(spaces.open(c.get('account'), await json(c))));
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
    return c.body(null, 204);
  });
  app.post('/api/v1/spaces/:id/invites', (c) => c.json(invites.invite(c.req.param('id'), c.get('account'))));

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

  // ---------- agents: the MCP door and its sign-in ----------

  agentRoutes(app, parts, addressOf);

  return app;
}
