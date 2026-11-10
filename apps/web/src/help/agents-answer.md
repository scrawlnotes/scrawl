# 💬 Agents that answer in Scrawl

Mention Claude or ChatGPT in Chat, answer one of its messages, or give it a card or a task, and it does the work and answers where you wrote. You set this up once for each agent, in **Settings › Agents › Answer in Scrawl**.

## How it works

1. You write `@Claude find why the build fails` in a room, or give Claude a card.
2. Scrawl tells Claude what you wrote and where. Under your message, **Sent to Claude** shows that it went; only you see it.
3. Claude reads the conversation or the card, does the work, and answers there with `@` and your name, so you are told.

Only what you write starts your agent. A message from someone else, or from any agent, does not.

## Before you start

- **A space on a Scrawl server.** Answering works in its rooms, direct messages, cards and tasks.
- **The agent added to Scrawl.** In **Settings › Agents**, use **Add to Claude** or **Add to ChatGPT**. When it has signed in, it is listed under **Connected to your account**.
- **Scrawl on a computer or in a browser.** A phone shows whether an agent answers, but you set it up on a computer.

## Claude

Claude answers through a task on claude.ai, which Scrawl starts each time you write to it. Tasks need a Pro, Max, Ultra, Team or Enterprise plan, and each answer counts against your Claude plan, as a chat does.

1. In Scrawl, open **Settings › Agents**. Under **Answer in Scrawl**, choose **Set up…** beside **Claude**. Keep this window open: the rest goes in it.
2. Choose **Open claude.ai**, or go to **claude.ai/code/routines** yourself, and choose **New task**. If a menu opens, choose **Set up manually**.
3. Name the task `Scrawl`. For its prompt, choose **Copy** in Scrawl's window and paste it.
4. In the **Trigger** row, choose **API**.
5. Open **Advanced settings**, then **Connectors**. Keep **Scrawl**; remove the others if you like.
6. Choose **Create**. A dialog shows the task's token once; it starts with `sk-ant-oat01-`. Copy it into **Token** in Scrawl's window.
7. On the task's page, open the menu beside its name and choose **Edit**. Under **Trigger**, the API panel shows the **Fire URL**; it starts with `https://api.anthropic.com/v1/claude_code/routines/`. Copy it into **URL** in Scrawl's window.
8. Choose **Turn on**. Claude's row now says **On**.

To try it, write `@Claude say hello` in a room. On claude.ai, the task's page lists each time it ran under **History**; open one to see what Claude did.

## ChatGPT

ChatGPT watches Scrawl for you from a Work chat, and answers through Scrawl.

1. In Scrawl, open **Settings › Agents**. Under **Answer in Scrawl**, choose **Set up…** beside **ChatGPT**. Keep this window open.
2. Choose **Open ChatGPT**, or go to **chatgpt.com** yourself. At the top of the page, switch from **Chat** to **Work**, and start a new chat.
3. In the box, type `@` and pick **Scrawl**. Then choose **Copy** under **Send it this** in Scrawl's window, paste it after it, and send.
4. If ChatGPT asks whether it may watch Scrawl, allow it. Scrawl's window then says **ChatGPT is watching Scrawl for you**, and ChatGPT's row says **On**.

Keep that Work chat: ChatGPT does the work there each time. To try it, write `@ChatGPT say hello` in a room.

## Another agent

For n8n, Zapier, Make or your own code. It must be connected to Scrawl as an agent, so that it is listed under **Connected to your account** and answers through Scrawl.

1. Under **Answer in Scrawl**, choose **Set up…** beside **Another agent**.
2. **Agent:** pick it.
3. **Address:** its webhook's address. It starts with `https://` and is on the internet; an address on your home or office network is refused.
4. **Headers:** what the address asks for, one a line, such as `Authorization: Bearer <secret>`. Once saved, their values are not shown again.
5. Choose **Turn on**.

Scrawl sends the address a POST with JSON:

```json
{
  "text": "Kaan Arslan wrote to you in #dev (space Scrawl) on the Scrawl server scrawl.example.com: …",
  "event": {
    "kind": "mention",
    "server": "https://scrawl.example.com",
    "agent": { "id": "a1:3f9c", "name": "n8n" },
    "from": { "id": "a1", "name": "Kaan Arslan" },
    "at": "2026-11-09T10:12:00.000Z",
    "space": { "id": "s4", "name": "Scrawl" },
    "chat": { "id": "c7", "kind": "public", "name": "#dev", "message": "m81" }
  }
}
```

- `text` says it all in words, for an agent that reads only words.
- `kind` is `mention`, `reply` (an answer to one of its messages) or `assign` (a card or a task given to it).
- On a card, `card` comes instead of `chat`, with its `id`, `key`, `title`, `board` and the `comment` it was mentioned in; on a task, `task`, with its `id`, `title` and `list`.

## When it doesn't answer

- **Couldn't reach Claude** under your message: a notification says why.
  - *Claude didn't accept the token:* the token was regenerated or deleted on claude.ai. Set Claude up again.
  - *Claude couldn't be reached:* Scrawl tries again after a minute and after five, then tells you.
- **No answer from Claude yet** under your message: open the task on claude.ai and look under **History**; the run shows what Claude did.
- **ChatGPT doesn't answer:** the Work chat must still be there. If ChatGPT's row says **Off**, set it up again.
- **ChatGPT says it couldn't start watching Scrawl**, and offers to check every hour instead:
  - Only these can watch: a **Work** chat on **chatgpt.com**, and ChatGPT's desktop app with **Work** and **Cloud** chosen. A Chat, the phone app and **Local** can't. Send the message again in one of them.
  - On a company's ChatGPT, its admin's settings for plugins and for work that events start apply. Ask them to allow these for Scrawl.
  - Checking every hour isn't the same: an answer can come an hour late, and ChatGPT's row stays **Off**.

## Turning it off

Choose **Change…** beside the agent, then **Turn off**, or **Stop watching** for ChatGPT. **Disconnect**, under **Connected to your account**, turns it off too.
