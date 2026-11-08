// The one Worker at app.scrawlnotes.com, run only for /google/* (wrangler.jsonc). Google gives a
// browser no lasting sign-in without the web client's secret, which a page may not hold: this adds
// it, turns the sign-in's code into a key (/google/token) and renews the key (/google/refresh).
// It keeps nothing and logs nothing; files and events never pass through it (design/cloud.md 10.6).

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const TOKEN = 'https://oauth2.googleapis.com/token';

/** The pages that may ask; the sign-in comes back to each one's root, as Google has them registered. */
const ORIGINS = ['https://app.scrawlnotes.com', 'http://localhost:5173'];

/** What each address passes on from the page; everything else it is sent is dropped. */
const GRANTS: Record<string, { grant: string; fields: string[] }> = {
  '/google/token': { grant: 'authorization_code', fields: ['code', 'code_verifier'] },
  '/google/refresh': { grant: 'refresh_token', fields: ['refresh_token'] },
};

export async function handle(request: Request, env: Env, send: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get('Origin') ?? '';
  if (!ORIGINS.includes(origin)) return new Response(null, { status: 403 });
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store', Vary: 'Origin' };
  const grant = GRANTS[new URL(request.url).pathname];
  if (!grant) return new Response(null, { status: 404, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers });
  if (!env.GOOGLE_CLIENT_SECRET) return new Response(null, { status: 503, headers });

  let sent: URLSearchParams;
  try {
    sent = new URLSearchParams(await request.text());
  } catch {
    return new Response(null, { status: 400, headers });
  }
  const form = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: grant.grant });
  for (const field of grant.fields) form.set(field, sent.get(field) ?? '');
  if (grant.grant === 'authorization_code') form.set('redirect_uri', `${origin}/`);

  let answer: Response;
  try {
    answer = await send(TOKEN, { method: 'POST', body: form });
  } catch {
    return new Response(null, { status: 502, headers });
  }
  return new Response(await answer.text(), { status: answer.status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
