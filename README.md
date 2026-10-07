# Scrawl

Work notes that behave like the tabs you never close: open, type, and it is kept.
Plain Markdown files, a separate task manager, and sync to your own cloud drive. No server.

Status: phase 1, the desktop editor, is close to done; sync is not built yet. See [PLAN.md](PLAN.md)
for the roadmap (in Turkish).

## What it does today

- **Notes** are `.md` files in a folder you choose. The editor shows Markdown formatted in place
  and hides its syntax; what you type stays as typed. Tables, code blocks with a copy button,
  images, attached files and voice memos, a `/` menu, find and replace, multiple cursors.
- **Tabs** for notes, task lists and views, reordered by dragging. New notes need no name or
  place: unnamed notes are called by their first line and land in the Inbox.
- **Task lists** live in folders, as many as you want, with sections, subtasks, priorities, due
  dates and descriptions, reordered by dragging. Today, Upcoming and saved filters gather them
  all. A line of a note becomes a task that links back to it.
- **Attached files** are selected with a click and offer Open, Show in folder and Delete. A file
  no note uses any more goes to the trash, and comes back if undo or paste links it again.
- **Safety nets**: a trash you can restore from, and the history of every note (kept on this
  device) with a window to look back and restore.
- Pasted web addresses become links; Ctrl+click opens them in the browser.

## Development

Requires Node 22+ and pnpm. The desktop app also needs Rust (https://rustup.rs).

```bash
pnpm install
pnpm desktop        # desktop app; notes are .md files in a folder you choose
pnpm desktop:build  # Windows installer
pnpm dev            # web version at http://localhost:5173; notes are kept in the browser
pnpm test
pnpm typecheck
```

## Layout

- `packages/core`: vault model and storage interface, task lists, trash and history, independent of any UI
- `packages/editor`: CodeMirror 6 editor with Markdown live preview
- `packages/i18n`: the words of the interface; English for now, other languages as further dictionaries
- `apps/web`: the interface (sidebar, tabs, format bar, task views, dialogs) and browser storage
- `apps/desktop`: Tauri shell around the interface, with file access to the notes folder
- `design/`: interface mockups

## License

MIT
