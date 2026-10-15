// The server's own page, for its address opened in a browser: there is nothing to do here but go
// to Scrawl. Before it is set up it says it is ready and where to connect; after, that it is a
// Scrawl server. See the mockups' Server part, "Ready page".

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function readyPage(options: { host: string; version: string; isNew: boolean }): string {
  const host = escape(options.host);
  const body = options.isNew
    ? `<h1>This Scrawl server is ready</h1>
      <p>Open Scrawl and connect to ${host} to set it up: in Settings › Spaces choose Add space…, then Connect a server…, and type this address. The first to connect becomes its owner.</p>
      <button type="button" id="copy">Copy address</button>`
    : `<h1>This is a Scrawl server</h1>
      <p>Open Scrawl and connect to ${host}: in Settings › Spaces choose Add space…, then Connect a server…, and type this address.</p>
      <button type="button" id="copy">Copy address</button>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scrawl server · ${host}</title>
<style>
:root { color-scheme: light dark; --bg: #f7f7f8; --fg: #1d2027; --dim: #5d6370; --faint: #8b919c; --line: #d9dce3; --accent: #a8690c; }
@media (prefers-color-scheme: dark) { :root { --bg: #1e2229; --fg: #d5d9e0; --dim: #8b93a1; --faint: #5a6270; --line: #2b303a; --accent: #e0a84a; } }
* { box-sizing: border-box; }
body { display: flex; flex-direction: column; align-items: center; min-height: 100vh; margin: 0; padding: 72px 16px 20px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 460px; text-align: center; }
.mark { display: flex; align-items: center; gap: 8px; color: var(--dim); font-size: 14px; }
.mark svg { width: 17px; height: 17px; fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linecap: round; }
h1 { margin: 4px 0 0; font-size: 24px; font-weight: 600; line-height: 1.3; }
p { margin: 0; color: var(--dim); }
button { margin-top: 6px; padding: 6px 16px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--dim); font: inherit; font-size: 14px; cursor: pointer; }
button:hover { color: var(--fg); }
footer { margin-top: auto; padding-top: 40px; color: var(--faint); font-size: 12.5px; }
</style>
</head>
<body>
<main>
  <span class="mark"><svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="6" rx="1.5"/><rect x="4" y="13.5" width="16" height="6" rx="1.5"/><path d="M7.5 7.5h.01M7.5 16.5h.01"/></svg>Scrawl server</span>
  ${body}
</main>
<footer>${host} · Scrawl server ${escape(options.version)}</footer>
<script>
document.getElementById('copy').addEventListener('click', function (e) {
  navigator.clipboard.writeText(${JSON.stringify(options.host)}).then(function () { e.target.textContent = 'Copied'; });
});
</script>
</body>
</html>`;
}
