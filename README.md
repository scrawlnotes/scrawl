# Scrawl

Notes, task lists, boards and collections, kept as plain files, for you and your agent. Spaces you
share with others sync through a OneDrive folder or a Scrawl server you run yourself.

It runs on Windows, in the browser at https://app.scrawlnotes.com, and on phones as a web app.
macOS and Linux apps, and native iOS and Android apps, are on the way. There is no release yet.

## Features

- **Agent first**: every note, task list, board and record is a plain file your agent, Claude Code
  or another, can read and write, and what it writes shows up in the app as if you had. No
  assistant is built in; your own agent works from outside, with your tools. MCP, to reach your
  spaces from your phone and the web, comes next.
- **Notes**: Markdown, formatted as you type, with tables, images, files and voice memos. Open and
  type; a note needs no name or folder, and is called by its first line until you give it one.
- **Task lists**: sections, subtasks, priorities and due dates, with Today, Upcoming and saved
  filters across every list. A line of a note becomes a task that links back to it.
- **Boards**: columns and cards with comments, phases and a key for each card, from a software,
  issues, sales or simple template. A card copies as a Markdown brief to hand to a person or an
  agent.
- **Collections**: the lists a company keeps, such as people, companies, activities, feedback and
  payments, each a folder with a record per file. Records link to each other: a person to their
  company, a call to the person. A record's page shows what links to it, its activities as a
  timeline and its cards, and lays out its fields the way the template or you arranged them.
  Formulas and rollups work out the rest, like the last contact with a company or what a customer
  has paid. Views filter, sort, group and total; CSV and Excel come in and go out.
- **Keys**: `.env` files, as a table or as text, with groups.
- **Spaces**: places to work with others, in a OneDrive folder or on your own Scrawl server, where
  tasks and cards are given to the people in them. On a server, changes arrive in a second or two.
- Search across everything, export to PDF, HTML or Markdown, the history of every note, a trash.

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
