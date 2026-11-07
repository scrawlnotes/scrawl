# 🧰 Running a server

Once it is set up, a server needs little: backups, and an update now and then. The commands are run where its `compose` file is.

## Backups

```
docker compose exec scrawl scrawl-server backup
```

It copies the database and the files to `/data/backups/<time>/` while the server runs, and keeps the last seven. Run it each night, and copy the backups off the machine yourself:

```
docker compose cp scrawl:/data/backups ./backups
```

To put one back, stop the server, run `scrawl-server restore <time>`, and start it again. `restore` alone lists the backups.

## Exporting a space

```
docker compose exec scrawl scrawl-server export Acme
```

It writes the space as it is now, a plain folder tree in a zip, to take it to OneDrive or elsewhere. Chat's rooms come along; direct messages do not.

## Updating

```
docker compose pull && docker compose up -d
```

The database is brought to the new version as the server starts. Put a version such as `0.2` in the compose file to update only when you choose.

## Agents

An agent reaches the server at `https://<your server>/mcp`; **Settings › Agents** has the steps for each. Every connection is listed there, and **Disconnect** ends one.

## People

The Owner and the Admins see the server's accounts, give a link to reset a password, and take an account off the server. Only the Owner changes roles.
