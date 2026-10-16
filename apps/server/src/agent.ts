import { type AuthInfo, createMcpHandler, OAuthError, OAuthErrorCode, requireBearerAuth } from '@modelcontextprotocol/server';
import { type Agent, buildServer } from '@scrawlnotes/agent';
import { type Context, type Hono } from 'hono';
import { cors } from 'hono/cors';
import { ServerFs } from './agentfs';
import type { Parts } from './app';
import { type Account, Refused } from './auth';
import { OAuthRefused, SCOPE } from './oauth';
import { authorizePage, oauthErrorPage } from './pages';
import { VERSION } from './config';

// The agent's door into the server (design/agent.md, 7): /mcp, where an agent with a token
// works on the spaces its person is in with the same tools as on a computer; and around it the
// sign-in that gives such a token: the discovery documents, registration, the sign-in page and
// the token endpoint. A connection shows on the account's page and is ended from there.

type Env = { Variables: { account: Account; device: string } };

/** A form or a query as strings by name. */
function stringsOf(data: { [key: string]: unknown }): { [key: string]: string | undefined } {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value : undefined]));
}

export function agentRoutes(app: Hono<Env>, parts: Parts, addressOf: (c: Context) => string) {
  const { config, oauth, accounts, spaces, files, blobs, live } = parts;
  const now = parts.now;
  const host = new URL(config.url).host;
  const open = cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'Accept', 'Mcp-Protocol-Version', 'Mcp-Session-Id'], allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'], exposeHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'], maxAge: 86400 });
  app.use('/mcp', open);
  app.use('/.well-known/*', open);
  app.use('/oauth/*', open);

  // ---------- discovery and registration ----------

  app.get('/.well-known/oauth-protected-resource/mcp', (c) => c.json(oauth.protectedResourceMetadata()));
  app.get('/.well-known/oauth-protected-resource', (c) => c.json(oauth.protectedResourceMetadata()));
  app.get('/.well-known/oauth-authorization-server', (c) => c.json(oauth.serverMetadata()));

  const refusing = async (c: Context, run: () => Promise<Response> | Response): Promise<Response> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof OAuthRefused) return c.json(error.body(), error.status);
      throw error;
    }
  };

  app.post('/oauth/register', (c) =>
    refusing(c, async () => {
      let body: unknown = null;
      try {
        body = await c.req.json();
      } catch {
        // Not JSON: refused below.
      }
      return c.json(oauth.register(body && typeof body === 'object' ? (body as { [key: string]: unknown }) : {}), 201);
    }),
  );

  // ---------- the sign-in page ----------

  const view = (params: { [key: string]: string | undefined }, client: string, extra: { email?: string; error?: string } = {}) =>
    authorizePage({
      host,
      version: VERSION,
      client: client || 'This agent',
      fields: Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !['email', 'password', 'decision'].includes(entry[0]))),
      ...extra,
    });

  const cannot = (c: Context, error: unknown): Response => {
    if (error instanceof OAuthRefused) {
      if (error.redirect) return c.redirect(error.redirect, 302);
      return c.html(oauthErrorPage({ host, version: VERSION, message: error.message }), error.status);
    }
    throw error;
  };

  app.get('/oauth/authorize', async (c) => {
    const params = stringsOf(c.req.query());
    try {
      const request = await oauth.start(params);
      return c.html(view(params, request.client.name));
    } catch (error) {
      return cannot(c, error);
    }
  });

  app.post('/oauth/authorize', async (c) => {
    const form = stringsOf(await c.req.parseBody());
    let request;
    try {
      request = await oauth.start(form);
    } catch (error) {
      return cannot(c, error);
    }
    if (form.decision === 'deny') return c.redirect(oauth.denied(request), 302);
    try {
      const account = await accounts.verifyPassword({ email: form.email, password: form.password }, addressOf(c));
      return c.redirect(oauth.grant(request, account), 302);
    } catch (error) {
      if (error instanceof Refused) return c.html(view(form, request.client.name, { email: form.email, error: error.message }), error.status === 429 ? 429 : 401);
      throw error;
    }
  });

  app.post('/oauth/token', (c) => refusing(c, async () => c.json(await oauth.token(stringsOf(await c.req.parseBody())))));

  // ---------- /mcp ----------

  const gate = requireBearerAuth({
    verifier: {
      async verifyAccessToken(bearer: string): Promise<AuthInfo> {
        const verified = oauth.verify(bearer);
        if (!verified) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The token is not an agent’s, was ended, or ran out');
        return {
          token: bearer,
          clientId: verified.clientId,
          scopes: [SCOPE],
          // The SDK measures expiry by the real clock; the server's own clock (which tests set) says how long is left.
          expiresAt: Math.floor(Date.now() / 1000) + Math.max(1, Math.floor((verified.expiresAt - now()) / 1000)),
          resource: new URL(oauth.resource),
          extra: { account: verified.account, device: verified.device, clientName: verified.clientName },
        };
      },
    },
    requiredScopes: [SCOPE],
    resourceMetadataUrl: oauth.resourceMetadataUrl,
    expectedResource: new URL(oauth.resource),
  });

  /** The spaces and the person an agent works on, for one request: those of the account the token is for. */
  const agentOf = (account: Account, device: string, clientName: string): Agent => ({
    spaces: async () =>
      spaces.of(account.id).map((space) => ({
        id: space.id,
        name: space.name,
        where: host,
        // The account's personal space here, where a task without a list goes.
        personal: space.personal,
        fs: new ServerFs(files, blobs, space.id, { account: account.id, device }, config.maxFileBytes),
        // The store keeps every version: nothing goes to a history folder, which the server does not take.
        versioned: true,
      })),
    person: async () => ({ id: account.id, name: account.name }),
    // The protocol does not carry the client's name with every request; the sign-in does.
    client: { name: clientName || 'Agent' },
  });

  const handler = createMcpHandler((ctx) => {
    const extra = ctx.authInfo?.extra as { account: Account; device: string; clientName: string } | undefined;
    if (!extra) throw new Error('No account for this request');
    return buildServer(agentOf(extra.account, extra.device, extra.clientName));
  });

  app.all('/mcp', async (c) => {
    const auth = await gate(c.req.raw);
    if (auth instanceof Response) return auth;
    return handler.fetch(c.req.raw, { authInfo: auth });
  });

  // ---------- the account's connections ----------

  app.get('/api/v1/agents', (c) => c.json(oauth.list(c.get('account').id)));
  app.delete('/api/v1/agents/:id', (c) => {
    oauth.disconnect(c.get('account'), c.req.param('id'));
    live.end({ device: c.req.param('id') });
    return c.body(null, 204);
  });
}
