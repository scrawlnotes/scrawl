# 👋 Welcome to Scrawl

## ✨ What is Scrawl

Scrawl keeps notes, tasks, boards, collections and keys in folders. Everything for a project sits together: its meeting notes, things to do, customer records and API keys.

Each item is a plain file. Work on it in Scrawl, open it in another editor, or have an AI agent work on it with you.

---

## 💾 Your notes are on this phone

Scrawl has no sign-up and no cloud of its own. What you write is saved here, on this phone, not online.

So when you open Scrawl in another browser, on your computer or on another phone, it is empty. Nothing is lost: your notes are still here.

To have the same notes everywhere, sync them to one of these:

- ☁️ **OneDrive:** your own Microsoft storage. Good for your own devices, and a folder shared with others.
- 🗄️ **Scrawl server:** a server your team runs, with Docker. Good for a team; changes reach others in seconds.

1. Here, open **Sync** in **Browse**, then **Sync…**, and choose OneDrive or a server.
2. On your computer or other device, open Scrawl, press **Sync**, and choose the same OneDrive folder or the same server.

From then on, what you change on one shows up on the others.

---

## 📦 Versions

Scrawl is the same app everywhere. Once synced, each version shows the same work.

- 🌐 **Web:** open [app.scrawlnotes.com](https://app.scrawlnotes.com) in any browser. It works offline once loaded.
- 💻 **Desktop, for Windows and Mac:** on a computer, open app.scrawlnotes.com, press **Downloads** at the foot of the sidebar and install it. It updates itself.
- 📱 **Phone, for iPhone and Android:** it is not in the app stores. Open app.scrawlnotes.com on your phone and add it to the home screen: in Safari use **Share › Add to Home Screen**, in Chrome use **⋮ › Add to Home screen**. From then on it opens from the home screen like any app.

---

## ➕ What you can add

In **Browse**, press **+** at the bottom right and pick one. A note is enough to start; add lists and boards to the same folder as the project grows.

### 📝 Notes

For writing. What you type stays as you typed it; the bar above the note handles formatting. Type `/` at the start of a line for headings, tables or code. Paste Excel cells as a table, add images. **To task** and **To card** turn a line or a selection into work you can track. A note's menu has **History…** for earlier versions and **Export…** for PDF, HTML or Markdown.

### ✅ Task lists

Tasks with dates, priorities and subtasks. **Today** and **Upcoming** gather dated tasks and cards from all your lists and boards; Upcoming has a list and a calendar. A **Filter** saves a view of tasks by date, priority or place.

### 📋 Boards

Cards in columns. **Software** works in phases, **Issue tracking** shows issues as a list, **CRM** gives each deal a company, a contact and a value. Each card has a description, fields, and a timeline of moves and comments.

### 🔑 Keys

API keys, passwords and settings in a `.env` file. Secret values stay hidden until shown. Copy one value, or a whole group as `.env` text.

### 🧭 Where things are

| At the foot of the screen | In Browse |
| --- | --- |
| **Recent**, **Browse**, **Today**, **Search** | Your spaces and folders, **Files**, **Trash**, **Sync**, **Settings** |

---

## 🧱 Apps and collections

### 🧩 Collections

Records such as companies, people or payments, each on its own form. Start from a template (**Companies**, **People**, **Activities**, **Feedback**, **Payments**) or an empty one. With **Fields** you design the form: choose the fields, drag them into columns, link records to each other, and add rules and buttons. You can bring in rows from CSV or Excel.

### 🧱 Apps

Collections, boards and rules set up together from ready templates. In **Browse**, press **+** and pick **App**, choose the ones you need and answer a few questions.

- **For a business:** CRM, sales and invoicing, customer support, projects, stock, recruiting, contracts, and more.
- **For a person:** personal finance, health, travel, recipes, habits, reading, and more.

**Add to app**, in the folder's **···** menu, adds another one later.

---

## 🤖 Working with an agent

An agent works on the same notes, tasks, boards and collections you see here, as you would. On a computer, connect Claude Desktop, Claude Code, Codex, Cursor or Antigravity through the desktop app; on the web and your phone, connect Claude, ChatGPT or Gemini through a Scrawl server. **Settings › Agents** shows the steps.

Ask it, for example:

- **Turn a meeting into work:** "Add a card to the Launch board for each decision in today's meeting note."
- **Catch up:** "What is due today?" or "What is Ayşe working on?"
- **Keep records:** "Add Lara Turizm as a customer and log today's call with them."
- **Set up an app:** "Set up a CRM with sales and stock for our spare parts business, in TRY and EUR."
- **Make your own:** "Make a collection of job candidates with their CV, source and score, and a button that schedules an interview."
- **Press a button:** "Approve Ayşe's taxi expense." or "Count the Rail stock as 12."
- **Tidy up:** "Move last year's project notes into an Archive folder." Links to them keep working.

What the agent changes carries its name. When it rewrites a note, the earlier version stays in **History**; what it deletes goes to **Trash**. It cannot open your **Keys** files, attachments or settings.

---

## 🗄️ Scrawl server

**You don't need one.** A server is for a team that wants:

- spaces with accounts and invite links, where a change reaches everyone in seconds;
- Claude, ChatGPT or Gemini working on your notes from the web and the phone.

The team runs it on its own machine with Docker ([steps](https://github.com/scrawlnotes/scrawl/tree/main/apps/server)). Then they connect it in **Settings › Spaces › Add space… › Connect a server…**

---

🗑️ Deleted items go to **Trash** first. This welcome note is only on this device, and opens each time until you close it.
