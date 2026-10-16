# Scrawl

Notes, task lists, boards and collections, kept as plain files, for you and your agent. Spaces you
share with others sync through a OneDrive folder or a Scrawl server you run yourself.

It runs on Windows, in the browser at https://app.scrawlnotes.com, and on phones as a web app.
macOS and Linux apps, and native iOS and Android apps, are on the way.

**Windows:** download [Scrawl-setup.exe](https://github.com/scrawlnotes/scrawl/releases/latest/download/Scrawl-setup.exe).
The app keeps itself up to date. The setup is not signed yet, so Windows may stop it the first
time: choose More info, then Run anyway.

## Features

- **Agent first**: every note, task, board and record is a plain file your agent (Claude Code or
  another) can read and write. No assistant inside; MCP comes next.
- **Notes**: Markdown, formatted as you type. No name or folder needed to start.
- **Task lists**: sections, subtasks, priorities and due dates; Today, Upcoming and filters.
- **Boards**: columns, cards, comments and phases. A card copies as a brief for a person or an agent.
- **Collections**: lists of records that link to each other, like people, companies and deals,
  with their own form designer, views, formulas and CSV or Excel in and out.
- **Templates**: People, Companies, Activities, Feedback and Payments collections; Software,
  Issue tracking, CRM and Simple boards. Ready for running a startup.
- **Keys**: `.env` files as a table.
- **Spaces**: work with others in a OneDrive folder or on your own Scrawl server.
- Search, export to PDF, HTML or Markdown, note history and a trash.

## How it is different

- **Your files, your cloud.** Plain files on your disk, synced through your own OneDrive or your own
  server. No account, and no server of ours.
- **Pieces that stand alone.** Notes, tasks, boards and collections link to each other; tasks are
  never checkboxes inside a note.
- **Less on purpose.** No plugins, no graph view, no tags. Each part earns its place in daily use.
- **Opinionated.** Made for people who work in tech, with templates for that work.

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

## Why I built it

My notes lived in Sublime Text and Notepad tabs I never closed: open, type, done. But they were not
on my phone, and a task among them was just another line. Joplin never felt right, Obsidian wanted
paid sync and plugins, Notion is for everyone. The tools I loved were Todoist for tasks and Trello
for boards. And running my own startup, I needed one place for notes and tasks, customers and
deals, payments and keys, without paying for a CRM like HubSpot, and with my agent working in it
beside me. Scrawl is that place, in files I own.
