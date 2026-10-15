// What an agent reads once: how a Scrawl space is laid out, what each file holds, and how to behave
// in it. The tools are shortcuts that know the rules; with this, read and write do the rest.

export const GUIDE = `# Scrawl for agents

Scrawl keeps notes, task lists, boards and collections as plain files in a folder called a space. A person sees them in the Scrawl app; you see the same files. Everything you write, the person sees; everything they write, you can read.

## How to behave

- Look around first: \`spaces\`, then \`tree\` (with \`kind\` for all boards, collections or task lists at once) or \`search\`.
- Before adding, look at what is there and update it instead of adding again: \`cards\`, \`records\` and \`tasks\` show what exists.
- Give boards, collections, task lists and records by name; a tool uses the one match and tells you its path. When more than one thing fits, the tool writes nothing and returns the candidates: ask the person which.
- Do not write what you are not sure of. Say what you did and what is left; on a card, say it with \`comment\`.
- \`spaces\` tells today's date and the person's name; use them for days like "next week" and when something is yours.
- Keys files, the \`.scrawl/\` folder and \`_attachments/\` are closed to you. Nothing is deleted for good: \`trash\` sends to the trash, where the person restores.

## A space

A space is a folder tree. Folders group things; a folder with a \`_collection.json\` in it is a collection. The personal space has a task list \`Inbox.tasks.json\` at its top, where a task without a list goes. Paths are inside the space, with \`/\`.

| Element | File | Tool |
|---|---|---|
| Note | \`Name.md\`, markdown | \`read\`, \`write\` |
| Task list | \`Name.tasks.json\` | \`tasks\`, \`save_task\` |
| Board | \`Name.board.json\` | \`cards\`, \`save_card\`, \`comment\` |
| Collection | folder with \`_collection.json\`; each record a \`.md\` file | \`records\`, \`save_record\` |
| Keys | \`Name.env\` | closed |

\`create\` makes any of them (and folders) with the right file and name; \`write\` writes any open file as it is.

## Notes

A note is markdown. A note that was never named is called after its first line. Links to other notes are markdown links to their paths. When you write over a note, its earlier text is kept: as a version beside the note on a computer, in the server's history on a server.

## Task lists

\`{ "sections": [{ "id", "name" }], "tasks": [Task] }\`. A task: \`id\`, \`title\`, \`done\`, \`priority\` (1 highest, 4 none), \`due\` (\`YYYY-MM-DD\` or null), \`parent\` (a subtask's parent id or null), \`order\`, \`created\`, \`updated\`, \`completed\`; optional \`description\`, \`section\` (a section id), \`assignee\` ({ id?, name? }), \`author\`, \`note\` (a note's path), \`card\` (\`board path#card id\`), \`record\` ({ collection, id, name, code? }). Prefer \`save_task\`: it makes ids and keeps the order.

## Boards

\`{ "prefix", "nextKey", "phasesOn", "columns": [{ "id", "name", "kind" }], "phases": [...], "fields"?: [...], "cards": [...] }\`.

- Column kinds say what a column means, whatever it is called: \`backlog\` (not taken up yet), \`active\` (being worked on: Todo, Doing), \`review\` (where you leave finished work for the person to look at), \`done\`, \`dropped\`. Name a column by its kind in the tools: "move to review" is \`column: "review"\`. A new card lands in the first column.
- Phases are ordered units of scope; exactly one is current while any is open. Work in the current phase: \`cards\` shows it by default (\`phase: "all"\` for every card), \`save_card\` adds to it. Leave other phases alone.
- A card: \`id\`, \`key\` (its number; shown as \`PREFIX-12\`), \`title\`, \`description\` (markdown; a checklist is \`- [ ]\` lines in it), \`column\`, \`phase\`, \`order\`, \`priority\`, \`due\`, \`labels\`, \`assignee\`, \`note\`, \`values\` (the board's own fields), \`timeline\` (moves and comments, with who did them). A card is a brief: \`cards\` with one card and \`brief: true\` gives it as one text, its linked note and phase included.
- Boards may have fields of their own (a deal's company, value, next step), given as \`values\` by key or label; a link field takes a record's name or code.

## Collections

A collection is a folder with \`_collection.json\`: \`{ "version": 2, "template", "singular"?, "fields": [...], "layout"?, "views"? }\`. A field: \`key\`, \`label\`, \`type\` (name, code, text, number, date, select, multi-select, checkbox, person, url, email, phone, link, formula, rollup), \`options\` and \`colors\` for selects, \`required\`, \`collection\` and \`many\` for links, \`formula\` (over the record's own fields: \`qty * unit_price\`, \`today() - last_contact\`), \`rollup\` ({ from, field, fn: count|sum|max|min, open? }). At most one \`name\` and one \`code\` field; nothing is added by itself.

A record is a \`.md\` file named after its id: YAML front matter with \`id\` and the fields by key, then the body (notes about it). A link is \`{ id, name, code? }\` of the record it points at; links never break when records are renamed. Formulas and rollups are worked out on screen and never written to the file. \`records\` returns them worked out; \`save_record\` takes links by name or code and writes a value that does not fit as it is, marked in \`problems\` (the app marks it too). Templates: companies, people, activities, feedback, payments, blank. To set up a new kind of list, \`create\` a blank collection and \`write\` its \`_collection.json\`; the person's rules for a process live in a note next to it (an SOP): read it, then apply it.

## Who did what

Every change you make is written with your name and the person's ("Claude Code · Kaan") on card timelines and in the server's history. Assign a card or a task to a person by their name as the space knows them.
`;
