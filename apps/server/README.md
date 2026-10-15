# Scrawl server

A server a team runs on its own machine. Spaces on it sync like a cloud folder, and a change
reaches the others in a second or two. Accounts, spaces and the list of files are in SQLite; the
files themselves sit beside it, named by their SHA-256. Everything is in `/data`.

The image is `ghcr.io/scrawlnotes/server`, for amd64 and arm64. The design is in
[design/server.md](../../design/server.md) (Turkish).

## Run it

The app reaches a server only over HTTPS, so the server needs a domain and a certificate. Two
ways with Docker Compose: copy the files in [deploy/](deploy/) to a folder on the machine, then

**Caddy**, if the domain points at the machine and ports 80 and 443 are open. Caddy gets the
certificate itself.

```bash
cp .env.example .env    # set SCRAWL_DOMAIN
docker compose up -d
```

**Cloudflare Tunnel**, if no port can be opened (a machine at home, behind a router). The domain
must be on Cloudflare. In the Cloudflare dashboard, under Zero Trust › Networks › Tunnels, create a
tunnel, copy its token into `.env` as `TUNNEL_TOKEN`, and add a public hostname for your domain
pointing at `http://scrawl:8080`.

```bash
docker compose -f compose.tunnel.yml up -d
```

On Cloudflare's free plan a request through the tunnel can carry at most 100 MB, so larger files
do not go through it.

Both keep the data in a named volume. To keep it in a folder of the machine instead, give that
folder to the user the server runs as first: `chown -R 1000:1000 ./data`.

**Coolify**: a new resource from the Docker image `ghcr.io/scrawlnotes/server:latest`, port 8080,
your domain, the environment variable `SCRAWL_URL` set to that domain with `https://`, and a
volume at `/data`. If the domain is on Cloudflare, keep its record DNS only, for the same 100 MB
limit. A scheduled task running `scrawl-server backup` each night keeps the backups.

## Set it up

In Scrawl, Settings › Spaces › Add space… › Connect a server…, type the server's address. The
first to connect becomes its owner, and setting it up stays open for an hour after the server
starts; restarting it opens it again. With `SCRAWL_OWNER_EMAIL` set, only that email can set it
up. The owner then opens spaces and invites people with links; no mail is sent.

## Settings

| Variable | |
|---|---|
| `SCRAWL_URL` | The address the server is reached at, as links give it: `https://scrawl.example.com`. Required, and it must be HTTPS except for `http://localhost`. |
| `SCRAWL_OWNER_EMAIL` | Only this email can set the server up. |
| `SCRAWL_MAX_FILE_MB` | The largest file it takes, in MB. 1024 by default. |
| `SCRAWL_APP_URL` | Where a link opened in a browser sends people. `https://app.scrawlnotes.com` by default. |
| `PORT` | 8080 by default. |

## Backups

```bash
docker compose exec scrawl scrawl-server backup
```

It writes a consistent copy of the database and the files to `/data/backups/<time>/`, while the
server runs, and keeps the last seven. Copy them off the machine yourself:
`docker compose cp scrawl:/data/backups ./backups`.

To put one back, stop the server first. `restore` without a name lists the backups.

```bash
docker compose stop scrawl
docker compose run --rm scrawl scrawl-server restore <time>
docker compose start scrawl
```

## Export a space

```bash
docker compose exec scrawl scrawl-server export Acme
docker compose cp scrawl:/data/exports/Acme-2026-10-15.zip .
```

The space as it is now, as a plain folder tree in a zip, to take it to OneDrive or elsewhere. It
takes a space's name or id; with a wrong one it lists the spaces.

## Update

```bash
docker compose pull && docker compose up -d
```

The database is brought to the new version as the server starts. `latest` follows each release;
put a version such as `0.1` in the compose file to update only when you choose.

## Develop

```bash
pnpm --filter @scrawlnotes/server dev     # http://localhost:8080, rebuilt and restarted on change
pnpm --filter @scrawlnotes/server test
docker build -f apps/server/Dockerfile -t scrawl-server .    # from the repository's root
```

## License

AGPL-3.0, see [LICENSE](LICENSE).
