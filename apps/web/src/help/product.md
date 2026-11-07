# 🚀 Product development

Product development keeps the work on your product from idea to release, the bugs found on the way, and what customers ask for. It is for a team that plans on a roadmap and ships in releases.

## Setting it up

- **Will you track bugs on a board of their own?** Yes by default: a **Bugs** board. With no, a roadmap card can be a **bug**.
- **Do you make releases?** Yes by default: **Releases**, and each card can go out in one.
- **Do you work in phases?** No by default. With yes, Roadmap works in phases: see [Boards](boards).
- **Will you collect feedback from customers too?** Yes by default: **Feedback**, and a card can link to what it answers. It is asked here only without [Customer support](support), which asks it itself.

## Roadmap

Each piece of work is a card. **Ideas**, **Later** and **Next** wait, **Now** is being done, **Review** waits for someone to look, **Shipped** is done, and **Won't do** is given up. A card moved to **Won't do** asks **Why we won't do it**.

A card has a **Type** (**feature**, **improvement**, **chore**), an **Area**, its **Release** and the **Feedback** it answers. It shows its type, its release, and how many asked for it: "Asked by 3".

## Bugs

Each bug is a card, and the board opens as a list: **New**, **Confirmed**, **Fixing**, **Fixed**, and **Won't fix**, which asks **Why we won't fix it**. A bug has its **Severity** (**critical**, **major**, **minor**), its **Release** and **Reported by**.

## Releases

**Releases** has two tabs, **Planned** and **Released**. A new release asks its **Version** and the day it is **Planned**. Each says when, "Nov 20", "Today", "3 days late", and how many of its cards are done: "5 of 8 cards done". Its window lists its cards.

**Ship**, when it is out, asks what to do with the cards still open: **Move to the next release**, which moves them to **Next** with the next planned release, or **Ship with it**. Then it:

- writes the **Release notes** from its shipped cards under **New**, **Improved** and **Fixed**, the bugs fixed in it under **Fixed**, chores left out; change them as you like;
- marks the feedback those cards answer **done**;
- sets the release **Released**, shipped today.

A release **Released** with open cards is marked.

## Feedback

What customers ask for: each with its **Title**, the person and company it came from, its **Source**, **Topic** and **Status** (**new**, **planned**, **done**, **declined**). Its window shows the cards that answer it. Link a card to the feedback it answers, and the card counts it.

## Today

A planned release comes to Today on its day with **Ship**, and to Upcoming before it.

## Home

- **Next release**: the next one planned, when it is, and how many of its cards are done.
- **Roadmap** and **Bugs**: how many cards are open.

## With other apps

- [Customer support](support): the feedback is the same, and a card adds up the requests that ask for what it answers: "Asked by 12". With **Bugs**, **Report bug** on a request adds a bug card linked to it; when the bug moves to **Fixed**, the request opens again, saying "Bug fixed", its reply due now.
- [CRM](crm): **Ship** asks **Tell those who asked, an activity each in Today**. Ticked, each company whose feedback went out gets an email to send in Today: "Tell them: Dark mode is out in 2.4".
- [Content calendar](content): a piece can be about a release, and the release's window lists the pieces that tell about it.

## Ask an agent

- "Add a card to the Roadmap for dark mode, linked to the feedback that asks for it."
- "What is in 2.4, and what is still open?"
- "Move the CSV import card to Now and put it in 2.5."
- "Which feedback has no card on the Roadmap yet?"
- "Ship 2.4 and move what is open to the next release."

To connect one, see [Agents](ai-agents).
