# Scrawl

Notes, task lists, boards and collections, kept as plain files in a folder. Spaces you share with
others sync through a OneDrive folder or a Scrawl server you run yourself.

It runs as a desktop app (Windows, Tauri), in the browser at https://app.scrawlnotes.com, and on a
phone as a web app added to the home screen. There is no release yet. The roadmap is
[PLAN.md](PLAN.md) and the designs are in [design/](design/), both in Turkish.

## What is in it

- **Notes**: Markdown files, formatted as you type, with tables, images, attached files and voice
  memos. Unnamed notes are called by their first line and go to the Inbox.
- **Task lists** with sections, subtasks, priorities and due dates; Today, Upcoming and saved
  filters gather them.
- **Boards** with columns, cards, comments and phases.
- **Collections**: records with typed fields, links between them, views and formulas; CSV and Excel
  in and out.
- **Keys**: `.env`-style files, shown as a table.
- **Spaces**: folders shared with others, on OneDrive or on a Scrawl server, with tasks and cards
  given to people in them.
- Search across everything, export to PDF, HTML or Markdown, the history of every note, a trash.

## Develop

Needs Node 24 and pnpm; the desktop app also needs Rust.

```bash
pnpm install
pnpm dev            # the web app at http://localhost:5173
pnpm desktop        # the desktop app
pnpm desktop:build  # the Windows installer
pnpm test
pnpm typecheck
```

## Layout

- `packages/core`: files, task lists, boards, collections, spaces and sync, without any interface
- `packages/editor`: the CodeMirror 6 editor
- `packages/i18n`: the interface's words
- `apps/web`: the interface, for the browser and inside the desktop app
- `apps/desktop`: the Tauri shell
- `apps/server`: the Scrawl server, a Docker image; see its [README](apps/server/README.md)

## License

MIT, except `apps/server`, which is AGPL-3.0.
