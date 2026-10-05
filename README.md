# Scrawl

Work notes that behave like the tabs you never close: open, type, and it is kept.
Plain Markdown files, a separate task manager, and sync to your own cloud drive. No server.

Status: early prototype (phase 0). See [PLAN.md](PLAN.md) for the roadmap (in Turkish).

## Development

Requires Node 22+ and pnpm. The desktop app also needs Rust (https://rustup.rs).

```bash
pnpm install
pnpm desktop    # desktop app; notes are .md files in a folder you choose
pnpm dev        # web version at http://localhost:5173; notes are kept in the browser
pnpm test
pnpm typecheck
```

## Layout

- `packages/core`: vault model and storage interface, independent of any UI
- `packages/editor`: CodeMirror 6 editor with Markdown live preview
- `apps/web`: the interface (sidebar, tabs, format bar) and browser storage
- `apps/desktop`: Tauri shell around the interface, with file access to the notes folder
- `design/`: interface mockups

## License

MIT
