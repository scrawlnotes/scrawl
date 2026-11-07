# 🔑 Keys

A keys file holds API keys, passwords, user names and settings, beside the project they are for. It is a `.env` file: `NAME=value` lines in groups, so a project can use it as it is.

## Groups and keys

In **Browse** or in a folder, press **+** at the bottom right and pick **Keys**. In the file, **+** adds a key; **Add group**, at the end, starts a group such as Production or Stripe.

Tap a key to change it. Press and hold one for **Copy value**, **Edit** and **Delete**. A group's **···** menu has **Add key**, **Copy as .env**, which copies the group as `.env` text, **Rename** and **Delete**.

## Secret values

A value whose name has PASS, PWD, SECRET, TOKEN, KEY or PRIVATE in it, and an address with a password in it, shows as dots. The eye shows it.

## Text

**Text** shows the file as it is written, to change it as text. When a line is not a key, such as `API KEY=…` with a space in its name, the file says so, and goes to that line.

## Keep in mind

- A keys file is plain text, and it syncs as it is: it is not encrypted.
- Its earlier versions are not kept, so a changed password does not stay behind.
- Agents cannot open keys files.
