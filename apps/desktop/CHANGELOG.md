# Changelog

The desktop app's versions. The notes of each go on its GitHub release and into the app's update.

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
