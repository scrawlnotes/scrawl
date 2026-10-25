# Changelog

The desktop app's versions. The notes of each go on its GitHub release and into the app's update.

## 0.1.19

Every table is a plain table, Gym's program holds numbers, and a program's days are on its calendar.

- Every table of records, a collection's, a record's linked records and its lines under its row, is a plain table: each column as wide as its values, a long text cut short. A click on a row opens it; its ··· at the end of the row, and the right click, have Open, the rules' buttons and Delete. Nothing is typed in a cell any more.
- What a table changes where it is, you pick: Changed in the table, under Columns for a view and in Fields for a linked table, for ticks (one click) and choices (a small list). Gym's workout items come with Done.
- A duration is kept to the second: 90 s, 1 min 30 s. In a new Gym a program's sets and reps are numbers and its time and rest durations; its program has each range's upper end.
- A workout's items are drawn as Gym's mockup has them: a narrow tick at the start, each move by its name.
- A program's days are on its Program days calendar, each as it went: gone to, not gone to, gone by unwritten in red, to come. A day clicked opens its workout, or offers Start and Didn't go.
- On a phone a new workout's items come with its program, as on a computer.
- A week's days and any choices are listed in their own order, and kept in it once picked. A new app is named after its templates, Gym, Gym 2. In New app, + Add of a list question works again.
- A line whose name comes from its move, added empty, says the move is needed, not a name.

## 0.1.18

Spaces no longer sync over and over with nothing to sync.

- On Windows, every space started a sync again a second or a few seconds after its last one, with nothing changed: the app took the note it keeps of each sync for another program writing in the space. It syncs now when something changed, and checks now and then as before.

## 0.1.17

An app opens as an app, with its Home and its menu; a record's lines are written inside it; Edit menu and an app of your own; Gym as its mockup has it.

- An app is one row in the sidebar and opens in a tab of its own: Home with what is due today and a card for each module, then each module's menu of its main screens. Its ··· menu has Home, its About note, Edit menu…, New, Add to app…, Edit app…, Show files, Move to, Rename and Delete app.
- A record's lines, an order's or a program's items, are in no menu: a new record's are added before Create and written with it, and the table opens a record's lines under its row with ▸. A record sent to the trash takes its lines with it, and Restore brings them back.
- Edit menu… puts modules and screens in order by dragging, renames them where they are, hides a screen, picks the view it opens on and what Home shows. Undo takes it back, and Reset to template brings the templates' menu back.
- New app has Blank app: an app of your own, its screens made from its ··· menu, New › Collection, Board or Note, each into a module of its menu.
- + Add row, + Add line and + Add to a group open the new row in a window of its own, instead of a row of boxes in the table; a line's first cell opens it again.
- Gym's windows are as its mockup has them: a workout has its day, its program, how long it took and its notes, and a new one starts at its program; a program has its days, how long it takes, how often it was done and its notes. Fields has an eye on each field to keep it off a record's window.
- A new Gym starts with 72 common gym moves, each with its muscle group, and a 3-day full-body program with its notes.
- What is worked out is shown without a box, and a new record shows only what says something. A tick in a table is a box, and turns at the first click.

## 0.1.16

Gym and Edit app, Chat's lists as Slack's, and an older version that no longer syncs over a newer one.

- Edit app…, in an app folder's ··· menu under Add to app…, changes an installed app's answers: its questions open with the answers it has, its last page says what is added, changed, taken off and kept, and no record is ever deleted. Undo takes it back.
- Gym, a personal template under Health: programs with their weekdays and their moves under Warm-up, Workout, Cool-down and Cardio; a workout filled from its program with each move's sets, reps and the weight of last time; how regularly each move is done. A program's days come to Today, Upcoming and Overdue, with Start and Didn't go.
- A rule can run as a field changes, with `onChange`: what it adds to a linked table shows in the form before you save. A linked table can be grouped, and can go newest first. `number()` reads a number in a text.
- A collection's calendar can bring days that come back every week to Today and Upcoming; a day gone by with nothing done is late.
- A percent column has no sum under a table, and a collection's screen no longer draws itself again without end.
- Chat's lists are as Slack's: a section folds from its heading, and + beside it adds a room or a message. A new conversation says what it is and what to do first. Create a room, Browse rooms and a new message are as Slack's too.
- A click on a task's description opens it for editing, as a click on its name does.
- A quick note dragged goes where the pointer holds it, and no longer moves back and forth.
- A space a newer Scrawl synced, or whose server asks for a newer one, stops syncing here and says Update Scrawl to keep syncing; Update brings the new version. An older version can no longer undo what a newer one did, such as deleted folders coming back.

## 0.1.15

Scrawl keeps running with its window closed, Chat on a Scrawl server, and quick notes.

- Closing the window leaves Scrawl in the tray, still syncing, so that an agent on this computer reads what is current and what it writes leaves in seconds. The tray has Open Scrawl, how sync stands and Quit Scrawl. Settings › General › Keep running when the window is closed turns it off.
- Scrawl opens when you sign in to the computer, without a window; Settings › General › Open at login turns it off.
- What another program writes in a space's folder, an agent above all, is synced at once, and shows without a click.
- An update goes in while the window is closed, or when you close it.
- Chat, on a Scrawl server: every shared space has a general room, anyone opens public and private rooms, and direct messages go to one person or up to nine. A message takes photos, videos, files and voice, reactions, and a reply quoting what it answers; it points at a note, a task, a card or a record, and becomes a task or a card. Direct messages, private rooms and mentions tell you, each conversation set to All, Mentions or Off. Search finds messages too, and an agent reads and writes them through the server. With the server out of reach, Chat opens with what this device keeps.
- Quick notes, as in Keep: a few lines each, seen as cards with what they say, in your personal space. Quick notes is in the sidebar under Filters & Labels, with how many there are. Take a note… has a title and the note's own editor, with images, files and recordings; a note is pinned, and they are in your order, by when they were made or by when they were changed. Quick note is first in Create and in every + menu.
- A list is made by typing `- `, `* ` or `1. ` at the start of a line; Undo right after keeps it as text.
- A folder's New note here… and a right click's Add new › Note… open Create with that folder chosen; the name may stay empty.
- Upcoming has a number beside it, as Today has.
- The ready filters now come to those who never had them.

## 0.1.14

Labels on tasks, filtering where a list or a board is, Filters & Labels and Favorites, and who worked on what, agents too.

- A task takes labels, as a card does; a space's tasks and cards share them, each in a color of its own. They are put on from a task's row, from its editor, or with @ as its name is typed. Labels, from the picker's Edit labels…, renames them, colors them and deletes them everywhere in the space.
- A task being edited has its date, priority, labels, who it is given to, record and Attach in a bar under it. Enter saves it, in the description too, where Ctrl+Enter starts a new line. There is no Save where leaving a field already saves: a task, a section's name, a card's subtask, its title and text fields, a board's column and phase names.
- A collection's multi-select, as Tags in the CRM, has the same picker, and offers what the other records hold.
- A task list and a board are filtered where they are: Search and Filter in their header, by labels, priority, due day, who and, on a board, its own fields. This device keeps each one's filter.
- Filters & Labels is in the sidebar under Today and Upcoming, as Todoist's: the saved filters, six ready ones, and each space's labels, each opening its view. A filter is no longer a file in a folder.
- Favorites: a note, a list, a board, a keys file, a collection, a filter or a label is starred to the top of the sidebar.
- Who worked on a card or a task shows under it, agents too: each agent has a name of its own and shows whose it is. A card's timeline and a task's Activity… keep what mattered on it: who it was given to, moves, ticks, done and opened again. Work can be given to an agent.
- Closing a phase asks what becomes of its cards not finished: to an open phase, out of any phase, or kept in it.
- Search finds a task by its labels.

## 0.1.13

A calendar for what has a day and a time, templates for a business and for a person, callouts in notes, and folders that move.

- A date field can hold a time too, never needing one; a field can be a time of day, and a number a length, shown as 1 h 30 min. A formula adds minutes, hours, months and years to a day, and counts the working days between two.
- Upcoming has a full calendar: Day, Week and Month, back and forth, Today. A collection and a board can have a Calendar view by a date: drag over its hours to add, drag a record or a card to move it, its foot to make it longer. A calendar's records come to Today and Upcoming beside the tasks; a calendar may go by a day a formula works out, as a birthday every year.
- New app says Business or Personal, and an app is set up from one of them. For a business, besides the ten: Appointments and bookings, E-commerce, Subscriptions and memberships, Contracts and renewals, Time off and team, Goals, Incidents and actions, Field service, Consulting, and Association and club. For a person: Personal finance; Home, car and documents; Recipes and meal plan; Health; Sport and training; Habits and goals; Travel; Shared expenses; Job search; People and birthdays; and Reading and watching. A question's answer may start as your region has it: a marketplace, a carrier, the days of leave, the public holidays, where you watch.
- Add to app asks the currencies of an app that keeps no money yet, when what is added does.
- Callouts in notes, as GitHub writes them: Note, Tip, Important, Warning and Caution, from the format bar's Callout, the / menu, or a quote that starts with `[!NOTE]`.
- A folder moves with everything in it, or gets another name: dragged in the sidebar, or with Move to… and Rename. What points at what is in it follows. What is dropped on a row goes into that row's folder.
- Files can be renamed in Files, and in a note's, a card's or a record's file bar; every link to them follows.
- Search says where each thing found is, the whole way down to it. A right click on a folder has Add new first; New app and New folder are apart in the + menus.
- The welcome note says where your notes are, and how to have them on every device.
- Settings › Agents adds Antigravity, and Cursor for a Scrawl server.

## 0.1.12

A deleted folder stays deleted.

- A folder with folders in it, deleted on one device, no longer comes back from another device that syncs the space. Before, the empty folders left on that device's disk brought it back, a level less each time; from the trash too, once deleted for good. Update every device that syncs the space, then delete such a folder once more.

## 0.1.11

Apps set up from ready templates, links to what is in the space, and a tab menu like VS Code's.

- New app, in Create and in a folder's + menu as New app here, sets up an app from ten ready templates: CRM, Sales and invoicing, Customer support, Project management, Budget and spending, Stock and purchasing, Product development, Recruiting, Assets and maintenance, and Content calendar. Pick the ones you need and answer a few questions, each ready with an answer: the app's folder gets its collections, boards and rules, linked to each other, and an About note that says what is in it and how it is used. Undo takes it back.
- Add to app, first in an app folder's ··· menu, adds a template to an app. Only what is missing is added and nothing there is changed; where something there would keep it from working, it says what to change first.
- A button can ask before it runs: a number, a text, a day, a choice, a record or a person, in a window that shows what it will do with the answers.
- A note links to a note, a task list, a board, a collection or a folder in the space. Typing a name in the link box finds it, Ctrl+click opens it in the app, and moving or renaming it keeps the links to it right.
- A tab's right-click menu is as VS Code's: Close, Close Others, Close to the Right and Close All; Reveal in File Explorer, or in Finder on a Mac; Rename, Move to…, History, Export… and Delete.
- The welcome note tells about apps, and more of what an agent can do for you. It has the newest text each time it opens.

## 0.1.10

A collection can be a small app: what is worked out from linked records, checks, default values, money, a table typed in as a sheet, buttons, and rules that run when a record is saved.

- Formulas are written in a language like JS's: they give a number, a text, a day or yes or no, and read a linked record's field with a dot (`project.customer`). A lookup shows a field of a linked record; a rollup takes only what its condition picks, averages too, and a sum of nothing is 0. A day's condition in Filter takes Today.
- The Fields window has a Rules tab, the collection's `_rules.js`: a check marks a record that does not fit, at its field, and never refuses it; what is wrong with a rule is said under its line, and the rules are saved once it is put right. The Text tab is called Schema now, and comes last.
- A field can start with a value, or a formula: Today, Me, the next number (PRJ-0016 after PRJ-0015).
- A number has a format: Number, Currency or Percent, its decimals, and its currency or each record's own; sums of money are one line a currency. Settings › Appearance › Numbers picks how numbers are written on this computer.
- A collection's table is typed in as a sheet: a click picks a cell, typing or Enter edits it, Tab and the arrows move. + Add row adds a record with its defaults, and opens the next. A record opens from the button at the start of its row, or from its name. A record's linked records can show as a table, with their sums.
- Buttons: `action("Start project", …)` in the rules is a button on the record's screen and in a row's ··· menu. It asks first when it says so, a button that cannot run now says why, and Undo takes back what it did.
- Rules that run when a record is saved, `onSave(…)`: from the form, a cell, + Add row, an import or a button. What one will write in the record shows in the form before you save, and a cell it wrote lights for a moment; what it does elsewhere comes with Undo. One that stops leaves the record as you wrote it, and the Rules tab shows where it stopped.

## 0.1.9

A key being added waits for you.

- In a keys file, a key you are adding stays as you left it when you go to another tab, to copy its value there, and come back: its name, its value and where the cursor was.

## 0.1.8

The app no longer opens white.

- On Windows the window opens in your theme's colour, not white while it gets ready; on a Mac it shows once it is ready.
- The Scrawl icon shows at once while the app opens, and goes softly when the app is there.

## 0.1.7

A web address in a note is a link, and a note dragged to another space moves there.

- A web address in a note's text is a link, typed or pasted with other text: Ctrl+click opens it. With the cursor in it, the Link button changes the address in place.
- In the Link field, Enter no longer puts a new line where the selected text was.
- A note, a task list, a board or a keys file dragged onto another space moves there; before, nothing happened. A move that does not work says why in the status bar.
- A divider stays a divider when the blank line above it is deleted or written on.
- A name too long for its tab or its row in the sidebar shows in full when the pointer rests on it.
- A folder you make something in, or move something into, opens in the sidebar.
- The status bar says when the note on screen was last modified.

## 0.1.6

A space waiting for you to sign in says so, and a computer back after a long time sends nothing deleted up again.

- A space on a server this computer is not signed in to says so in the sidebar, with Sign in to sync inside it, and in the status bar beside sync, even while another space syncs. One sign-in opens every space on that server, and the window says which.
- A space syncing to this computer for the first time shows how far it is inside it, until what it holds is there.
- A computer back after a long time, or the app installed again over an old folder, no longer puts what was deleted meanwhile in the trash again, nor sends it up.
- A file found only on this computer and deleted elsewhere goes to this computer's trash and stays there, marked Only on this device; restored, it syncs again.
- Choosing a folder inside OneDrive for a space asks first: OneDrive's own app would sync it a second time.

## 0.1.5

Deleting a task or a card can be undone.

- A task, a section or a card goes to the trash without asking, a task with its subtasks and a section with its tasks: Moved to Trash, with Undo.
- In the trash each says which list or board it was in and shows what it held; Restore puts it back where it was, a card with its key. If its list or board is in the trash too, Restore asks to bring both back.
- Deleting a comment or a card's subtask shows Undo too.
- In a search, what you typed, found just as you typed it, comes before its words found apart.
- A day that is not on the calendar, like 30.02.2026, is marked in a record and is not taken as a day when importing.
- A phase's note stays linked when the note is moved or renamed.
- An agent on your server knows your day: the app tells the server your time zone.

## 0.1.4

Many small things made right, and a few new ones.

Notes and files
- Paste files copied in File Explorer into a note, as dragging them in does.
- Make an image smaller or larger by its corner, or Small, Medium or Full width from its bar. The width goes with the note, also to PDF and HTML.
- Files takes files of its own: Upload, drop them on it, or paste. A file goes to the trash only with the note, card, record or task that used it, and comes back with it.
- A task's description takes images and files like a card's, and tasks, cards and records have Attach.
- Names keep ? : / and the rest of what file names do not take.
- A note opens at its top; going back to a tab shows where you were. The note's footer counts its words.

Tasks and boards
- A card and a collection's record have subtasks.
- A long task title wraps while you type it, and the caret goes to its end when you change it.
- Each section has its own + Add task, and the tasks in no section too; Add section shows between sections once there are some.
- Priorities 1 to 3 have their colours. A board's phase strip has No phase.
- Pressing a menu's button again closes it: Date, Priority, ··· and the rest.

Sidebar and spaces
- Spaces and folders have + for what can be made in them, and a button to put their items in order: Group by type or not, folders first, by name, date created or last modified. Each folder keeps its own order on this computer.
- Drag a space by its heading to another place among the spaces.
- Rename a space beside its name; on a server its managers do, for everyone in it. Adding a space that is there already asks no name.
- Your spaces and servers come with your personal space to every device it syncs to; you sign in to each server once.
- A server's page lists its spaces. The trash folds by group and shows what a deleted item holds. A tab's × sits at its end.

Opening
- The app opens faster, in pieces, and Settings › Logs shows what it did. Welcome to Scrawl opens until you close it.

## 0.1.3

- A start page while nothing is open, in place of Create opening by itself: Create's kinds on top, then Recent, what you opened last on this device, and Today. While nothing has been made yet, it says what each kind is for and offers the templates and connecting an agent.

## 0.1.2

Scrawl comes to the Mac.

- On the Mac, one Scrawl.dmg for Apple silicon and Intel. It is not signed by an Apple developer yet, so the first time, open System Settings › Privacy & Security and choose Open Anyway.
- Settings › Spaces in two parts: Personal, the space that is only yours, and Shared, the spaces you work in with others.
- Where your personal space syncs is chosen in one window: only on this device, OneDrive, or a Scrawl server from 0.2.6 on. It can move from one to another; your other devices show where it went and follow when you say so.
- Connect a server is a step of Add space.
- An attached file over 10 MB stays in the cloud until you open it; the download setting is gone.

## 0.1.1

- The first start asks nothing. Your name and email are asked only where others see you, when you add a shared space; a Scrawl server takes them from your account.
- Double-click a tab to rename what it shows. A filter's tab opens its Filter window.
- The right-click menu of a collection's tab opens.
- Add to Claude Desktop in Settings › Agents opens the bundle made for this version of the agent command.

## 0.1.0

The first release of the Windows app.

- Notes, task lists, boards, collections and keys, as plain files in a folder on this computer.
- Spaces shared with others through a OneDrive folder or a Scrawl server.
- Search, export to PDF, HTML or Markdown, note history and a trash.
- Settings › Agents connects Claude Desktop, Claude Code, Codex and Cursor.
- The app looks for new versions by itself and updates when you restart or close it.
