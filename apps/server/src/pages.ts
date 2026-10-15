// The server's own pages, for its address or a link opened in a browser: there is nothing to do
// here but go to Scrawl. Its address says, before it is set up, that it is ready and where to
// connect; after, that it is a Scrawl server. A link says who invited whom to what, or that it
// is for a new password, and opens the web app with it. See the mockups' Server part.

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CONNECT = 'in Settings › Spaces choose Add space…, then Connect a server…, and type this address.';

export function readyPage(options: { host: string; version: string; isNew: boolean }): string {
  const host = escape(options.host);
  const body = options.isNew
    ? `<h1>This Scrawl server is ready</h1>
      <p>Open Scrawl and connect to ${host} to set it up: ${CONNECT} The first to connect becomes its owner.</p>
      <button type="button" id="copy" data-copy="${host}">Copy address</button>`
    : `<h1>This is a Scrawl server</h1>
      <p>Open Scrawl and connect to ${host}: ${CONNECT}</p>
      <button type="button" id="copy" data-copy="${host}">Copy address</button>`;
  return page(host, options.version, body);
}

/** What a link turned out to be, for its page. */
export type JoinFound =
  | { kind: 'space'; space: string; by: string; expires: number }
  | { kind: 'reset'; email: string; expires: number }
  | { kind: 'used' | 'expired' | 'none' };

/**
 * The page of a link opened in a browser: the way into Scrawl is the web app opening with the
 * link, or for the desktop app, the link to copy. A link used, run out or unknown says so.
 */
export function joinPage(options: { host: string; version: string; link: string; appUrl: string; found: JoinFound }): string {
  const host = escape(options.host);
  const day = (at: number) => new Date(at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const open = `${options.appUrl}/?join=${encodeURIComponent(options.link)}`;
  const way = `<a class="go" href="${escape(open)}">Open in Scrawl</a>
      <p class="small">Using the desktop app? Copy this link, then in Scrawl choose Add space › Connect a server… and paste it.</p>
      <button type="button" id="copy" data-copy="${escape(options.link)}">Copy link</button>`;
  const { found } = options;
  let body: string;
  if (found.kind === 'space') {
    const space = escape(found.space);
    body = `<h1>${found.by ? `${escape(found.by)} invited you to ${space}` : `You are invited to ${space}`}</h1>
      <p>${space} is a space on ${host}. Open this link in Scrawl to join it; the link works once, until ${day(found.expires)}.</p>
      ${way}`;
  } else if (found.kind === 'reset') {
    body = `<h1>A new password for ${escape(found.email)}</h1>
      <p>Open this link in Scrawl to set a new password for your account on ${host}. It works once, until ${day(found.expires)}.</p>
      ${way}`;
  } else {
    const why = found.kind === 'used' ? 'This link was used already' : found.kind === 'expired' ? 'This link ran out' : 'This link leads nowhere';
    body = `<h1>${why}</h1>
      <p>Ask whoever sent it for a new one: a link works for one person, once.</p>`;
  }
  return page(host, options.version, body);
}

/** What the sign-in page needs: who asks, and the request to carry through the form. */
export interface AuthorizeView {
  host: string;
  version: string;
  /** The client as it names itself: "Claude", "ChatGPT". */
  client: string;
  /** The request's parameters, carried as hidden fields. */
  fields: { [name: string]: string };
  /** The email typed last time, when the password was not right. */
  email?: string;
  error?: string;
}

/**
 * The page an agent's sign-in opens: the person lets a client use their account here, with their
 * email and password, or does not. Nothing is kept between visits; each connection asks again.
 */
export function authorizePage(view: AuthorizeView): string {
  const host = escape(view.host);
  const client = escape(view.client);
  const hidden = Object.entries(view.fields)
    .map(([name, value]) => `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`)
    .join('\n      ');
  const body = `<h1>Let ${client} use your Scrawl account?</h1>
      <p>${client} will see and change the spaces you are in on ${host}, as you would. Sign in to allow it.</p>
      <form method="post" action="/oauth/authorize">
      ${hidden}
      <label>Email<input type="email" name="email" value="${escape(view.email ?? '')}" autocomplete="username" required autofocus></label>
      <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
      ${view.error ? `<p class="error">${escape(view.error)}</p>` : ''}
      <div class="buttons"><button type="submit" name="decision" value="deny" formnovalidate>Cancel</button><button type="submit" class="primary" name="decision" value="allow">Allow</button></div>
      </form>`;
  return page(host, view.version, body);
}

/** A sign-in that cannot go on: the client or its address is not right, so there is nowhere to send the person back to. */
export function oauthErrorPage(options: { host: string; version: string; message: string }): string {
  return page(escape(options.host), options.version, `<h1>This sign-in cannot go on</h1>
      <p>${escape(options.message)}</p>`);
}

function page(host: string, version: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scrawl server · ${host}</title>
<style>
:root { color-scheme: light dark; --bg: #f7f7f8; --fg: #1d2027; --dim: #5d6370; --faint: #8b919c; --line: #d9dce3; --accent: #a8690c; --on-accent: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --bg: #1e2229; --fg: #d5d9e0; --dim: #8b93a1; --faint: #5a6270; --line: #2b303a; --accent: #e0a84a; --on-accent: #1b1608; } }
* { box-sizing: border-box; }
body { display: flex; flex-direction: column; align-items: center; min-height: 100vh; margin: 0; padding: 72px 16px 20px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 460px; text-align: center; }
.mark { display: flex; align-items: center; gap: 8px; color: var(--dim); font-size: 14px; }
.mark svg { width: 17px; height: 17px; fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linecap: round; }
h1 { margin: 4px 0 0; font-size: 24px; font-weight: 600; line-height: 1.3; }
p { margin: 0; color: var(--dim); }
p.small { margin-top: 14px; color: var(--faint); font-size: 13.5px; }
a.go { margin-top: 6px; padding: 10px 26px; border-radius: 9px; background: var(--accent); color: var(--on-accent); font-weight: 600; text-decoration: none; }
button { margin-top: 2px; padding: 6px 16px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--dim); font: inherit; font-size: 14px; cursor: pointer; }
button:hover { color: var(--fg); }
footer { margin-top: auto; padding-top: 40px; color: var(--faint); font-size: 12.5px; }
form { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 320px; margin-top: 10px; text-align: left; }
label { display: flex; flex-direction: column; gap: 4px; color: var(--dim); font-size: 13.5px; }
input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); font: inherit; }
.buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
button.primary { padding: 8px 22px; border: none; background: var(--accent); color: var(--on-accent); font-weight: 600; }
button.primary:hover { color: var(--on-accent); opacity: 0.92; }
p.error { color: #c0392b; font-size: 13.5px; }
</style>
</head>
<body>
<main>
  <span class="mark"><svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="6" rx="1.5"/><rect x="4" y="13.5" width="16" height="6" rx="1.5"/><path d="M7.5 7.5h.01M7.5 16.5h.01"/></svg>Scrawl server</span>
  ${body}
</main>
<footer>${host} · Scrawl server ${escape(version)}</footer>
<script>
var copy = document.getElementById('copy');
if (copy) copy.addEventListener('click', function () {
  navigator.clipboard.writeText(copy.dataset.copy).then(function () { copy.textContent = 'Copied'; });
});
</script>
</body>
</html>`;
}
