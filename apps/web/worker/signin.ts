// The one Worker at app.scrawlnotes.com, run only for /google/* and /microsoft/* (wrangler.jsonc).
// A browser gets no lasting sign-in without a web client's secret, which a page may not hold: this
// adds it, turns the sign-in's code into a key (/…/token) and renews the key (/…/refresh). Google's
// lasts as long as the app is used; Microsoft's 90 days, renewed with each use, where a page's own
// lasts one (design/cloud.md 10.6, 2.4). It keeps nothing and logs nothing; files and events never
// pass through it.

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
}

/** The pages that may ask; the sign-in comes back to each one's own address, as registered. */
const ORIGINS = ['https://app.scrawlnotes.com', 'http://localhost:5173'];

interface Provider {
  token: string;
  clientId: (env: Env) => string | undefined;
  secret: (env: Env) => string | undefined;
  /** Where on the page the sign-in comes back. */
  back: string;
  /** What each address passes on from the page; everything else it is sent is dropped. */
  grants: Record<string, { grant: string; fields: string[] }>;
}

const PROVIDERS: Record<string, Provider> = {
  google: {
    token: 'https://oauth2.googleapis.com/token',
    clientId: (env) => env.GOOGLE_CLIENT_ID,
    secret: (env) => env.GOOGLE_CLIENT_SECRET,
    back: '/',
    grants: { token: { grant: 'authorization_code', fields: ['code', 'code_verifier'] }, refresh: { grant: 'refresh_token', fields: ['refresh_token'] } },
  },
  // OneDrive's sign-in, as a web app's: its own return address, apart from the page's (design/cloud.md 2.4).
  microsoft: {
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: (env) => env.MICROSOFT_CLIENT_ID,
    secret: (env) => env.MICROSOFT_CLIENT_SECRET,
    back: '/onedrive',
    grants: { token: { grant: 'authorization_code', fields: ['code', 'code_verifier', 'scope'] }, refresh: { grant: 'refresh_token', fields: ['refresh_token', 'scope'] } },
  },
};

export async function handle(request: Request, env: Env, send: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get('Origin') ?? '';
  if (!ORIGINS.includes(origin)) return new Response(null, { status: 403 });
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store', Vary: 'Origin' };
  const [, name, what, ...more] = new URL(request.url).pathname.split('/');
  const provider = PROVIDERS[name ?? ''];
  const grant = more.length === 0 ? provider?.grants[what ?? ''] : undefined;
  if (!provider || !grant) return new Response(null, { status: 404, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers });
  const clientId = provider.clientId(env);
  const secret = provider.secret(env);
  if (!clientId || !secret) return new Response(null, { status: 503, headers });

  let sent: URLSearchParams;
  try {
    sent = new URLSearchParams(await request.text());
  } catch {
    return new Response(null, { status: 400, headers });
  }
  const form = new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: grant.grant });
  for (const field of grant.fields) form.set(field, sent.get(field) ?? '');
  if (grant.grant === 'authorization_code') form.set('redirect_uri', `${origin}${provider.back}`);

  let answer: Response;
  try {
    answer = await send(provider.token, { method: 'POST', body: form });
  } catch {
    return new Response(null, { status: 502, headers });
  }
  return new Response(await answer.text(), { status: answer.status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
