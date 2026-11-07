# 🔑 Keys

A keys file holds API keys, passwords, user names and settings, beside the project they are for. It is a `.env` file: `NAME=value` lines in groups, so a project can use it as it is.

## Groups and keys

Press **+** beside the tabs and pick **Keys**. **Add group** starts a group, such as Production or Stripe; in the file it is a `# heading` line. **+ Add key** adds a key to a group; click a name or a value to change it.

**Copy as .env**, on a group, copies it as `.env` text, ready to paste into a project. Every value has its own copy button.

## Secret values

A value whose name has PASS, PWD, SECRET, TOKEN, KEY or PRIVATE in it, and an address with a password in it, shows as dots. The eye shows it until the tab is closed.

## Text

**Text** shows the file as it is written, to change it as text. A line that is not a key, such as `API KEY=…` with a space in its name, is underlined in red. The table says how many lines are not keys, and **Show** goes to the first.

## Keep in mind

- A keys file is plain text, and it syncs as it is: it is not encrypted.
- Its earlier versions are not kept, so a changed password does not stay behind.
- Agents cannot open keys files.
