// What an agent reads once: how a Scrawl space is laid out, what each file holds, and how to behave
// in it. The tools are shortcuts that know the rules; with this, read and write do the rest. It
// reaches the model with `spaces`, the one call every client makes and shows; the brief, its first
// part, goes as the server's instructions to clients that hand those to the model.

export const GUIDE = `# Scrawl for agents

Scrawl keeps notes, task lists, boards and collections as plain files in a folder called a space. A person sees them in the Scrawl app; you see the same files. Everything you write, the person sees; everything they write, you can read.

## How to behave

- Look around first: \`spaces\`, then \`tree\` (with \`kind\` for all boards, collections or task lists at once) or \`search\`.
- Before adding, look at what is there and update it instead of adding again: \`cards\`, \`records\` and \`tasks\` show what exists.
- Give boards, collections, task lists and records by name; a tool uses the one match and tells you its path. You need not name the space: what is named is looked for in every space, and the result says which space it is in; give \`space\` to look in one only, and to make something new when there is more than one. When more than one thing fits, the tool writes nothing and returns the candidates with their spaces: ask the person which.
- Lists come short: \`cards\` gives each card's key, title, column and counts; ask for one card, or \`full: true\`, for its description and comments.
- Do not write what you are not sure of. Say what you did and what is left; on a card, say it with \`comment\`.
- \`spaces\` tells today's date and the person's name; use them for days like "next week" and when something is yours. It also gives each space's people: give a card or a task to one of them by name.
- Keys files, the \`.scrawl/\` folder and \`_attachments/\` are closed to you. Nothing is deleted for good: \`trash\` sends to the trash, where the person restores.

## What each tool is for

| To | Use |
|---|---|
| Know where you are | \`spaces\`, then \`tree\` or \`search\` |
| Read or write a note | \`read\`, \`write\` (with \`ifMatch\`) |
| Make a new note, list, board, collection or folder | \`create\` |
| Add or change a task, a card, a record | \`save_task\`, \`save_card\`, \`save_record\` (with \`id\` to change) |
| Move a task to another section, under another task, to another list | \`save_task\` with \`id\` and \`section\`, \`parent\` or \`toList\` |
| Tie a task or a card to a note | \`save_task\` or \`save_card\` with \`note\` |
| See tasks, cards, records | \`tasks\`, \`cards\`, \`records\` |
| Add many cards or tasks at once (a meeting's points) | \`save_card\` or \`save_task\` with \`items\`; tie them to the meeting's note with \`note\` |
| See what is due today, or what is someone's, everywhere | \`tasks\` and \`cards\`, both with \`due: "today"\` or \`assignee\` (\`"me"\` for the person), no list, board or space |
| Finish or drop | a task: \`save_task\` with \`done: true\`; a card: \`save_card\` with \`column: "done"\` or \`"dropped"\` |
| Change a collection's fields, a board's columns or phases | \`read\` the file, change the JSON, \`write\` it back with \`ifMatch\`; there is no other tool for it |
| Move or rename a note, list, board or collection | \`move\`; what points at it follows |
| Remove a note, list, board, folder or collection | \`trash\` with its path or name |
| Remove one task, card or record, or a section with its tasks | \`trash\` with the list, board or collection as \`path\` and \`id\`, or \`section\`; what is finished is closed instead, not trashed |
| Say what you did on a card | \`comment\` |

Not yours: restoring from the trash, seeing a note's versions, attached files, settings and people. Ask the person for those.

## When a call is cut off

Call it again; nothing is added twice. No idempotency key is needed, and none is taken. \`save_record\` does not add a record whose name or code is already there, \`save_card\` does not add an open card whose title is already on the board, \`save_task\` does not add an open task whose title is already in the same place of the list, \`create\` does not make what is already in the folder by that name: each returns the one that exists with \`exists: true\`, and you give its \`id\` (its path, for \`create\`) to change it. When you mean a second one with the same name, pass \`another: true\`. A subtask sent again is not added twice: an open one with its title is changed instead. \`comment\` does not write the same text twice in a row. \`write\` with \`ifMatch\` refuses when the file changed since you read it: read it again, then write.

## A space

A space is a folder tree. Folders group things; a folder with a \`_collection.json\` in it is a collection. The personal space has a task list \`Inbox.tasks.json\` at its top, where a task without a list goes. Paths are inside the space, with \`/\`.

| Element | File | Tool |
|---|---|---|
| Note | \`Name.md\`, markdown | \`read\`, \`write\` |
| Task list | \`Name.tasks.json\` | \`tasks\`, \`save_task\` |
| Board | \`Name.board.json\` | \`cards\`, \`save_card\`, \`comment\` |
| Collection | folder with \`_collection.json\`; each record a \`.md\` file | \`records\`, \`save_record\` |
| Keys | \`Name.env\` | closed |

\`create\` makes any of them (and folders) with the right file and name; \`write\` writes any of them but keys as it is, and refuses a schema, a board or a task list the app could not read, saying each thing to mend; \`move\` moves or renames any of them; \`trash\` removes any of them. A name with what a file name cannot hold (\`?\`, \`:\`) is kept in the file with a look-alike: \`Ne yapmalı?\` is \`Ne yapmalı？.md\`; the tools take it either way.

## Notes

A note is markdown. A note that was never named is called after its first line. Links to other notes are markdown links to their paths. When you write over a note, its earlier text is kept: as a version beside the note on a computer, in the server's history on a server.

## Task lists

\`{ "sections": [{ "id", "name" }], "tasks": [Task] }\`. A task: \`id\`, \`title\`, \`done\`, \`priority\` (1 highest, 4 none), \`due\` (\`YYYY-MM-DD\` or null), \`parent\` (a subtask's parent id or null), \`order\`, \`created\`, \`updated\`, \`completed\`; optional \`description\`, \`section\` (a section id), \`assignee\` ({ id?, name? }), \`author\`, \`note\` (a note's path), \`card\` (\`board path#card id\`), \`record\` ({ collection, id, name, code? }). Prefer \`save_task\`: it makes ids and keeps the order. To add, rename or reorder sections, \`read\` the list, change \`sections\`, \`write\` it back.

## Boards

\`{ "prefix", "nextKey", "phasesOn", "columns": [{ "id", "name", "kind" }], "phases": [...], "fields"?: [...], "cards": [...] }\`.

- Column kinds say what a column means, whatever it is called: \`backlog\` (not taken up yet), \`active\` (being worked on: Todo, Doing), \`review\` (where you leave finished work for the person to look at), \`done\`, \`dropped\`. Name a column by its kind in the tools: "move to review" is \`column: "review"\`. A new card lands in the first column.
- Phases are ordered units of scope; exactly one is current while any is open. Work in the current phase: \`cards\` shows it by default (\`phase: "all"\` for every card), \`save_card\` adds to it. Leave other phases alone.
- A card: \`id\`, \`key\` (its number; shown as \`PREFIX-12\`), \`title\`, \`description\` (markdown), \`subtasks\` (the steps to tick off, one level: \`{ id, title, done, priority, due, assignee?, created, completed? }\`; \`save_card\` with \`subtasks\` adds, changes, ticks off or takes off one by one), \`column\`, \`phase\`, \`order\`, \`priority\`, \`due\`, \`labels\`, \`assignee\`, \`note\`, \`values\` (the board's own fields), \`timeline\` (moves and comments, with who did them). A card is a brief: \`cards\` with one card and \`brief: true\` gives it as one text, its linked note and phase included.
- Boards may have fields of their own (a deal's company, value, next step), given as \`values\` by key or label; a link field takes a record's name or code.
- To add, rename or reorder columns or phases, or to add a field: \`read\` the board, change \`columns\`, \`phases\` or \`fields\`, \`write\` it back with \`ifMatch\`. Keep every \`id\` as it is and keep at least one \`done\` column. A column: \`{ "id", "name", "kind" }\`; a phase: \`{ "id", "name", "state": "upcoming" | "current" | "done", "goal"?, "doneWhen"?, "note"? }\`, one of them current.

## Collections

A collection is a folder with \`_collection.json\`: \`{ "version": 2, "template", "singular"?, "fields": [...], "layout"?, "views"? }\`. A field: \`key\`, \`label\`, \`type\` (name, code, text, number, date, select, multi-select, checkbox, person, url, email, phone, link, formula, rollup), \`options\` and \`colors\` for selects, \`required\`, \`collection\` and \`many\` for links, \`formula\` (over the record's own fields: \`qty * unit_price\`, \`today() - last_contact\`), \`rollup\` ({ from, field, fn: count|sum|max|min, open? }). At most one \`name\` and one \`code\` field; nothing is added by itself.

A record is a \`.md\` file named after its id: YAML front matter with \`id\` and the fields by key, and \`subtasks\` when it has any (a card's kind, one per line), then the body (notes about it). The record's screen shows its subtasks where its layout has a \`{ "block": "subtasks" }\`; \`save_record\` with \`subtasks\` changes them as \`save_card\` does. A link is \`{ id, name, code? }\` of the record it points at; links never break when records are renamed. Formulas and rollups are worked out on screen and never written to the file. \`records\` returns them worked out; \`save_record\` takes links by name or code and writes a value that does not fit as it is, marked in \`problems\` (the app marks it too). Templates: companies, people, activities, feedback, payments, blank.

To add a field, change its options or its type: \`read\` the \`_collection.json\`, add to or change \`fields\` (a new field: \`{ "key": "segment", "label": "Segment", "type": "select", "options": ["SMB", "Mid", "Enterprise"] }\`; keys are short, lowercase, unique and never change), \`write\` it back with \`ifMatch\`. Values of a removed field stay in the record files. To set up a new kind of list, \`create\` a blank collection and \`write\` its \`_collection.json\`; the person's rules for a process live in a note next to it (an SOP): read it, then apply it.

## Who did what

Every change you make is written with your name and the person's ("Claude Code · Kaan") on card timelines and in the server's history. Assign a card or a task to a person by their name as the space knows them, as \`spaces\` lists them; a first or a last name is enough when only one person has it. In a space with people, a name that is none of them is refused; in the personal space a name is kept as it is written.
`;

/** The guide up to how a space is laid out: how to behave, what each tool is for, a call cut off. Sent as the server's instructions. */
export const BRIEF = `${GUIDE.slice(0, GUIDE.indexOf('\n## A space')).trimEnd()}

## The rest of the guide

\`spaces\` returns the whole guide, with how each file is laid out: a collection's schema, a board, a task list. Call it first.
`;
