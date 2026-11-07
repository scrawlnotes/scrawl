# 🛠️ Setting up a server

The server runs in Docker, on a machine of yours that is always on: a cloud server, or a computer at home. Scrawl reaches it only over HTTPS, so it needs a domain.

## Starting it

The files to run it, and each way in detail, are in the server's [guide](https://github.com/scrawlnotes/scrawl/tree/main/apps/server). There are three ways:

- **Caddy**, when the domain points at the machine and its ports 80 and 443 are open. Caddy gets the certificate itself. Set `SCRAWL_DOMAIN` in `.env`, then `docker compose up -d`.
- **Cloudflare Tunnel**, when no port can be opened, as on a machine at home. The domain must be on Cloudflare. Through the tunnel a file can be at most 100 MB.
- **Coolify**, or any place that runs a Docker image: `ghcr.io/scrawlnotes/server`, port 8080, a volume at `/data`, and `SCRAWL_URL` set to its address.

Everything the server keeps is in `/data`.

## Becoming its owner

In Scrawl, go to **Settings › Spaces › Add space… › Connect a server…** and type the server's address. The first to connect becomes its **Owner**, and makes their account. Setting up stays open for an hour after the server starts; restarting it opens it again. With `SCRAWL_OWNER_EMAIL` set, only that email can set it up.

## Spaces and people

1. In **Settings › Spaces › Add space…**, choose the server and make a new space on it.
2. On the space's page in **Settings › Spaces**, **Invite…** gives a link. Send it as you like; the server sends no email.
3. Whoever opens the link makes an account, or signs in, and the space comes to their devices.

A forgotten password is reset with a link the Owner or an Admin gives.

## Settings

The server is set in its `.env` file, or wherever it runs:

- `SCRAWL_URL`: the server's address, such as `https://scrawl.example.com`. Required.
- `SCRAWL_OWNER_EMAIL`: only this email can set the server up.
- `SCRAWL_MAX_FILE_MB`: the largest file it takes, in MB; 1024 unless set.

Next: [Running it](server-running).
