import { describe, expect, it } from 'vitest';
import { handle } from './google';

// The Worker that adds the web client's secret to Google's sign-in (design/cloud.md 10.6), with a
// stand-in for Google: what it passes on, to whom it answers, and that Google's answer comes back.

const env = { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret' };
const APP = 'https://app.scrawlnotes.com';

function google(status = 200, body = '{"access_token":"a","expires_in":3599}') {
  const sent: { url: string; form: Record<string, string> }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    sent.push({ url, form: Object.fromEntries(init.body as URLSearchParams) });
    return new Response(body, { status });
  }) as typeof fetch;
  return { sent, send };
}

const post = (path: string, form: Record<string, string>, origin = APP) =>
  new Request(`${APP}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });

describe('the Google sign-in Worker', () => {
  it('turns a code into a key with the secret, coming back to the page that asked', async () => {
    const { sent, send } = google();
    const response = await handle(post('/google/token', { code: 'c', code_verifier: 'v', client_secret: 'theirs', redirect_uri: 'https://elsewhere/' }), env, send);
    expect(sent).toEqual([
      {
        url: 'https://oauth2.googleapis.com/token',
        form: { client_id: env.GOOGLE_CLIENT_ID, client_secret: 'secret', grant_type: 'authorization_code', code: 'c', code_verifier: 'v', redirect_uri: `${APP}/` },
      },
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ access_token: 'a', expires_in: 3599 });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('renews a key, passing on only the refresh token', async () => {
    const { sent, send } = google();
    await handle(post('/google/refresh', { refresh_token: 'r', code: 'c', scope: 'drive' }), env, send);
    expect(sent[0].form).toEqual({ client_id: env.GOOGLE_CLIENT_ID, client_secret: 'secret', grant_type: 'refresh_token', refresh_token: 'r' });
  });

  it("gives Google's refusal back as it is", async () => {
    const { send } = google(400, '{"error":"invalid_grant"}');
    const response = await handle(post('/google/refresh', { refresh_token: 'old' }), env, send);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_grant' });
  });

  it('answers the development page too, and no other', async () => {
    const { sent, send } = google();
    await handle(post('/google/token', { code: 'c', code_verifier: 'v' }, 'http://localhost:5173'), env, send);
    expect(sent[0].form.redirect_uri).toBe('http://localhost:5173/');
    expect((await handle(post('/google/token', { code: 'c' }, 'https://evil.example'), env, send)).status).toBe(403);
    expect((await handle(new Request(`${APP}/google/token`, { method: 'POST' }), env, send)).status).toBe(403);
    expect(sent).toHaveLength(1);
  });

  it("lets the browser ask first, and turns away what is not one of its two addresses", async () => {
    const { sent, send } = google();
    const preflight = await handle(new Request(`${APP}/google/token`, { method: 'OPTIONS', headers: { Origin: APP } }), env, send);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect((await handle(post('/google/revoke', { token: 't' }), env, send)).status).toBe(404);
    expect((await handle(new Request(`${APP}/google/token`, { headers: { Origin: APP } }), env, send)).status).toBe(405);
    expect(sent).toHaveLength(0);
  });

  it('says it is not set up while the secret is missing, and that Google is out of reach', async () => {
    const { send } = google();
    expect((await handle(post('/google/token', { code: 'c' }), { GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID }, send)).status).toBe(503);
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect((await handle(post('/google/token', { code: 'c' }), env, down)).status).toBe(502);
  });
});
