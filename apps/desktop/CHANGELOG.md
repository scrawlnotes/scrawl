# Changelog

The desktop app's versions. The notes of each go on its GitHub release and into the app's update.

## 0.1.11

Apps set up from ready templates, links to what is in the space, and a tab menu like VS Code's.

- New app, in Create and in a folder's + menu as New app here, sets up an app from ten ready templates: CRM, Sales and invoicing, Customer support, Project management, Budget and spending, Stock and purchasing, Product development, Recruiting, Assets and maintenance, and Content calendar. Pick the ones you need and answer a few questions, each ready with an answer: the app's folder gets its collections, boards and rules, linked to each other, and an About note that says what is in it and how it is used. Undo takes it back.
- Add to app, first in an app folder's ··· menu, adds a template to an app. Only what is missing is added and nothing there is changed; where something there would keep it from working, it says what to change first.
- A button can ask before it runs: a number, a text, a day, a choice, a record or a person, in a window that shows what it will do with the answers.
- A note links to a note, a task list, a board, a collection or a folder in the space. Typing a name in the link box finds it, Ctrl+click opens it in the app, and moving or renaming it keeps the links to it right.
- A tab's right-click menu is as VS Code's: Close, Close Others, Close to the Right and Close All; Reveal in File Explorer, or in Finder on a Mac; Rename, Move to…, History, Export… and Delete.

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
