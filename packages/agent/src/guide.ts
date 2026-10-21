// What an agent reads once: how a Scrawl space is laid out, what each file holds, and how to behave
// in it. The tools are shortcuts that know the rules; with this, read and write do the rest. It
// reaches the model with `spaces`, the one call every client makes and shows; the brief, its first
// part, goes as the server's instructions to clients that hand those to the model.

import { APP_TEMPLATES, type Question, TEMPLATE_IDS } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';

/** A question as the guide says it: its key, how it is answered and its default. */
function questionLine(q: Question): string {
  const shown = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v));
  const how =
    q.kind === 'yesno' ? 'true or false' : q.kind === 'choice' ? `one of ${q.options!.map((o) => o.value).join(', ')}` : q.kind === 'multi' ? `some of ${q.options!.map((o) => o.value).join(', ')}` : 'a list of words';
  return `\`${q.key}\` (${how}; ${shown(q.default)} when not given): ${t(q.label)}`;
}

/** The templates an app is set up from and what each asks, as \`create\` takes them. */
const appTemplates = () =>
  TEMPLATE_IDS.map((id) => {
    const template = APP_TEMPLATES[id];
    return `- **${id}**, ${t(template.name)}: ${t(template.what)} ${template.questions.map(questionLine).join('; ')}.`;
  }).join('\n');

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
| Set up an app from ready templates, or add one to an app | \`create\` with \`kind: "app"\` |
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

A collection is a folder with \`_collection.json\`: \`{ "version": 2, "template", "singular"?, "fields": [...], "layout"?, "views"? }\`. A field: \`key\`, \`label\`, \`type\` (name, code, text, number, date, select, multi-select, checkbox, person, url, email, phone, link, formula, lookup, rollup), \`options\` and \`colors\` for selects, \`required\`, \`collection\` and \`many\` for links, \`formula\`, \`lookup\` ({ link, field }: the key of this collection's link field and the key of the linked record's field it shows, as a transaction's customer through its project), \`rollup\` ({ from, field, fn: count|sum|avg|max|min, open?, where? }: \`where\` is a list of conditions on the records or cards it works from, as the Filter window's, \`{ "field": "direction", "op": "is", "value": ["Out"] }\`; a day's condition may take \`"today"\`; a sum of nothing is 0), \`default\` (what a new record starts with: a value the field holds, \`"Offer"\`, \`0\`, \`true\`, or \`=\` and a formula worked out when the record is made: \`"=today()"\`, \`"=me()"\`, \`"=project.currency"\`, and the next number, \`"=next('PRJ-', 4)"\`, PRJ-0016 after PRJ-0015), \`format\` for a number, or a formula, lookup or rollup giving one (\`{ "style": "currency", "currency": "TRY", "decimals": 0 }\`; style number, currency or percent, a share written 0.18 for 18%; \`currencyField\` in place of \`currency\` when each record holds its own currency's code, like EUR, in a field). At most one \`name\` and one \`code\` field; nothing is added by itself.

A formula is written in a language like JS's, read by Scrawl, not run as JS: field keys (\`qty * unit_price\`), a linked record's field with a dot (\`project.customer\`, \`customer.segment\`), numbers, texts in quotes, \`\` \`\${name} survey\` \`\`, \`+ - * / %\` (\`+\` joins texts), \`== != < <= > >=\`, \`&& || !\`, \`a ? b : c\`, and \`today()\`, \`empty()\`, \`round(x, n)\`, \`abs()\`, \`min()\`, \`max()\`, \`sum()\`, \`year()\`, \`month()\`, \`contains()\`, \`text()\`. A day minus a day is a number of days; a day plus a number is a day. A formula gives a number, a text, a day or yes or no (\`spent > budget ? "Over budget" : "OK"\`); an empty field makes it empty. There is no \`if()\` and no \`=\`: write \`? :\` and \`==\`. A schema whose formula is wrong is refused, saying what is wrong.

A collection's rules are in \`_rules.js\` beside its \`_collection.json\`, in the same language, never run as JS; \`read\` and \`write\` it as a file. It holds checks, one after another: \`check("delivery", () => delivery >= start, "Delivery is before the start")\`, the key of the field it marks (\`null\` for the record as a whole), what must hold, and what to say when it does not. A record failing a check is not refused but marked, in \`problems\` with kind check; a check of fields still empty does not fail. A rules file with a mistake is refused, each mistake with its line.

It holds buttons too: \`action("Start project", { when: () => status == "Offer", confirm: true, hint: "Only for an offer" }, () => { … })\`, a button on the record's screen (where its layout has \`{ "block": "actions" }\`, else at its top) and in a table row's ··· menu. Its body is statements: \`let\` and \`const\`, \`if\`, \`for (const x of list)\`, a field of the record set as \`status = "Active"\`; it reads the record's fields, \`this\`, \`linked("Budget lines")\`, \`find("Budget lines", { project: this })\` and \`cards("Projects board", { project: this })\`, lists with filter, map, some, every, find and includes; it changes the space with \`add("Budget lines", { name, planned: contract * 0.3 })\` (linked back to the record, the defaults filled), \`update(line, { planned: 500 })\`, \`remove(line)\`, \`card("Projects board", { title, column })\`, \`move(card, "Acceptance")\`, \`subtask("Site survey", { due: start + 3 })\` and \`task("Inbox", { title })\`, all in the record's space and named as the person names them. Nothing is written until it is through; one that stops writes nothing. \`save_record\` with \`action\` presses one on a record and says what it did; the person's Undo takes it back. A button may ask before it runs: \`ask: { total: { label: "Counted total", type: "number", default: () => stock, required: true, note: () => "Now " + text(stock) } }\`, a type being number, text, date, choice (with \`options\`) or link (with \`collection\`), read in its body as \`input.total\`; \`say\` is the sentence under its window's title. Give the answers to \`save_record\` in \`input\` (\`{ "total": 11 }\`, a link by its record's name, code or id). A list's item is picked by its place, from 0: \`find("Locations")[0]\`.

And what runs as a record is saved: \`onSave("Paid date", () => { if (status == "Paid" && old.status != "Paid") paid_on = today() })\`, a body as a button's that reads the record as it is saved and \`old\`, the record as it was (its fields empty for a new one). It runs where the record is written, once: the app's form, a cell, + Add row, an import, a button, and \`save_record\`; never when a change comes by sync, nor on a record's file written with \`write\`. What it sets on the record is saved with it; what it does elsewhere is written right after, and \`save_record\` says it in \`onSave\`. One that stops leaves the record as given, its own changes left out, said in \`onSave.stopped\`. What it changes runs no onSave again; the onSaves of a file run in its order, each seeing what the ones before set.

A record is a \`.md\` file named after its id: YAML front matter with \`id\` and the fields by key, and \`subtasks\` when it has any (a card's kind, one per line), then the body (notes about it). The record's screen shows its subtasks where its layout has a \`{ "block": "subtasks" }\`, and the records linking to it where it has \`{ "block": "linked", "collection": "Atlas/Budget lines", "style": "table", "fields": ["name", "planned", "actual"], "sums": true }\` (style list, timeline or table: a table's cells are typed in, its columns are the fields, and with sums its numbers are summed under it); \`save_record\` with \`subtasks\` changes them as \`save_card\` does. A link is \`{ id, name, code? }\` of the record it points at; links never break when records are renamed. Formulas, lookups and rollups are worked out on screen and never written to the file. \`records\` returns them worked out; \`save_record\` takes links by name or code, gives a new record the defaults of the fields not given, and writes a value that does not fit as it is, marked in \`problems\` (the app marks it too). Templates: companies, people, activities, feedback, payments, blank.

To add a field, change its options or its type: \`read\` the \`_collection.json\`, add to or change \`fields\` (a new field: \`{ "key": "segment", "label": "Segment", "type": "select", "options": ["SMB", "Mid", "Enterprise"] }\`; keys are short, lowercase, unique and never change), \`write\` it back with \`ifMatch\`. Values of a removed field stay in the record files. To set up a new kind of list, \`create\` a blank collection and \`write\` its \`_collection.json\`; the person's rules for a process live in a note next to it (an SOP): read it, then apply it.

## Building a small app

A small app is a few collections that link to each other, what is worked out from them, a board, a note for the process and the rules; nothing more is needed. Build it a step at a time, each refused write mended before the next:

1. \`create\` a folder, and in it the collections (template blank), the board and the note.
2. \`write\` each \`_collection.json\` twice: first its own fields and its links (a link names its collection by path, \`"collection": "Operations/Projects"\`), then, once every collection has its links, with the rollups, lookups and formulas that read the others' fields, and the \`layout\`: the record's fields on the left, \`{ "block": "actions" }\` for its buttons, its linked records as tables on the right.
3. \`read\` the board and \`write\` its columns, and a field linking a card to its record.
4. \`write\` each \`_rules.js\`: its checks, buttons and onSaves. A wrong one is refused on its line.
5. Add a record with \`save_record\`, press a button with \`action\`, and read them back with \`records\`: what is worked out, the checks they fail and what the rules did are there.
6. Write the process in the note: what each status means, what is done when, who does it.

The example a lift company runs its projects with, in Operations:
- **Projects:** name; code, default \`=next('PRJ-', 4)\`; customer, a link to Companies; status, Offer, Active or Done, default Offer; start, default \`=today()\`; delivery; contract in lira (\`format\`). Worked out: budget, a rollup summing Budget lines' planned; spent, summing Transactions' amount where direction is Out; remaining, \`budget - spent\`; health, \`spent > budget ? "Over budget" : "OK"\`. Rules: \`check("delivery", () => delivery >= start, "Delivery is before the start")\` and a button, Start project, adding three budget lines at 30% of the contract each, a subtask and a card in Survey, and setting status to Active.
- **Budget lines:** name, project (a link), category, planned; actual, a rollup summing Transactions' amount where direction is Out; remaining, \`planned - actual\`.
- **Transactions:** name, project, line (a link to Budget lines), direction (In or Out, default Out), amount, due, status (Planned, Invoiced or Paid), paid on; customer, a lookup through project; overdue, \`status != "Paid" && due < today()\`. Rules: \`check("line", () => direction != "Out" || !empty(line), "Pick the budget line")\` and \`onSave("Paid date", () => { if (status == "Paid" && old.status != "Paid" && empty(paid_on)) paid_on = today() })\`.
- **Projects board:** columns Survey, Production, Installation, Acceptance, Done; a project field linking each card to its project.
- **How we run a project:** a note saying what each status means and when a project starts and closes.

## Apps

An app is a folder set up from ready templates at once: its collections, boards and rules, linked to each other, and a note, About and the app's name, saying what is in it and how it is used. \`create\` with \`kind: "app"\`, \`name\`, \`templates\`, \`answers\` by template and, when it keeps money, \`currencies\` (the main one first) sets one up; an answer not given takes its default, and a wrong one is refused with what it takes. Ask the person what the questions ask, or take it from what they told you. Templates set up together share their pieces: one Companies for CRM, Sales, Support and Stock (its suppliers), one Products for Sales and Stock, one Payments for all the money, one Feedback, one Projects. A project's budget brings Budget's pieces.

${appTemplates()}

To add templates to an app, give its folder as \`folder\`: only what is missing is added, the pieces found by the role in their schema or board file (\`"role": "orders"\`) wherever they are and whatever they are called now; nothing there is changed or taken away, and the result says what was added. \`_app.json\` in the app's folder keeps which templates it was set up from, with their answers: \`read\` it, never \`write\` it. After that, change the app as any other collection, board or rule, and keep its About note right.

## Who did what

Every change you make is written with your name and the person's ("Claude Code · Kaan") on card timelines and in the server's history. Assign a card or a task to a person by their name as the space knows them, as \`spaces\` lists them; a first or a last name is enough when only one person has it. In a space with people, a name that is none of them is refused; in the personal space a name is kept as it is written.
`;

/** The guide up to how a space is laid out: how to behave, what each tool is for, a call cut off. Sent as the server's instructions. */
export const BRIEF = `${GUIDE.slice(0, GUIDE.indexOf('\n## A space')).trimEnd()}

## The rest of the guide

\`spaces\` returns the whole guide, with how each file is laid out: a collection's schema, a board, a task list. Call it first.
`;
