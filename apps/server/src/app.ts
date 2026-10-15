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
import { readyPage } from './pages';
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
  const { config, blobs, files, accounts, spaces, live } = parts;
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

  // ---------- without a key: how the server stands, setting it up, signing in ----------

  app.get('/api/v1/server', (c) => c.json({ version: VERSION, new: accounts.isNew(), setupOpen: accounts.setupOpen() }));
  app.post('/api/v1/setup', async (c) => c.json(await accounts.setUp(await json(c))));
  app.post('/api/v1/sessions', async (c) => c.json(await accounts.signIn(await json(c), addressOf(c))));

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
          socket = { account: who.account.id, device: who.device, send: (text) => ws.send(text) };
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
    c.set('account', who.account);
    c.set('device', who.device);
    await next();
  });

  app.delete('/api/v1/sessions/current', (c) => {
    accounts.signOut(c.get('device'));
    return c.body(null, 204);
  });
  app.get('/api/v1/me', (c) => c.json(c.get('account')));
  app.get('/api/v1/spaces', (c) => c.json(spaces.of(c.get('account').id)));
  app.post('/api/v1/spaces', async (c) => c.json(spaces.open(c.get('account'), await json(c))));

  // ---------- a space's files, for those in it ----------

  app.use('/api/v1/spaces/:id/*', async (c, next) => {
    spaces.check(c.req.param('id'), c.get('account').id);
    await next();
  });
  const actor = (c: Context<Env>) => ({ account: c.get('account').id, device: c.get('device') });

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

  return app;
}
