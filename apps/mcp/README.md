# Scrawl for agents

`scrawl-mcp` is an MCP server over the notes, task lists, boards and collections in your [Scrawl](https://scrawlnotes.com) spaces, for the agent on your computer: Claude Code, Claude Desktop, Cursor, or any client that speaks MCP over stdio.

Run with nothing, it reads the Scrawl desktop app's settings and serves what the app sees: your personal space and the copies of the spaces you share, whichever provider they live in. Given folders, it serves those.

```bash
npx -y @scrawlnotes/mcp
npx -y @scrawlnotes/mcp "C:\Users\you\OneDrive\Scrawl"
```

## Claude Code

```bash
claude mcp add scrawl -- npx -y @scrawlnotes/mcp
```

## Claude Desktop

Install the `scrawl.mcpb` bundle from the [releases](https://github.com/scrawlnotes/scrawl/releases): double-click it, and Claude Desktop asks to add it. Leave the folders empty to use what the Scrawl app is set to.

## Cursor

Add a server with `command: npx`, `args: ["-y", "@scrawlnotes/mcp"]`, or use the install link the Scrawl app gives under Settings › Agents.

## What the agent can do

Fifteen tools: `spaces`, `tree`, `read`, `write`, `search`, `create`, `trash`, `move`; `records`, `save_record`; `cards`, `save_card`, `comment`; `tasks`, `save_task`; and a guide that tells it how a space is laid out and how to behave, which comes with `spaces` and as `scrawl://guide`. It finds things by name, asks when more than one fits, never adds the same record, card or comment twice when a cut-off call is sent again, writes every change with its name and yours, keeps a note's earlier text as a version, never touches keys files and never deletes for good.

Claude on the web and on your phone, and ChatGPT, cannot reach this computer: connect them to a Scrawl server instead.

## Options

```
scrawl-mcp [folder ...] [--vault <folder>] [--client <name>]
```

`--client` names the agent in what it writes when the client does not say its own name. Needs Node 20 or later.
