# 🧩 Collections

A collection keeps records of one kind, each on a form of its own: companies, people, candidates, payments, anything you keep a list of. You design the form, so it holds what you need and nothing else.

A collection is a folder. Each record in it is a Markdown file: its fields at the top, its notes below.

## Making one

Press **+** beside the tabs and pick **Collection**. Start from a template, **Companies**, **People**, **Activities**, **Feedback** or **Payments**, or from an empty one.

For a set of collections that work together, a CRM or a stock list, start from an app instead: see [How apps work](apps-how).

## Records and the table

A collection shows as a table, a column for each field. **+ Add row** adds a record in the table; **Add record** opens its form. A record opens in a window, laid out as its form says, with its notes under its fields.

At the top of the table:

- **Filter** shows only the records that match, such as **Status is Active**.
- **Group** puts them under headings by a field.
- **Columns** chooses the columns, and **Fit to content** sizes them.
- Each view is a tab: save what you filtered and sorted as one, with a name.

## Designing the form

**Fields** opens the form's designer. In **Design**:

- Add fields and choose their kind: **Text**, **Number**, **Date**, **Time**, **Select**, **Multi-select**, **Checkbox**, **URL**, **Email**, **Phone**, **Person**, **Link**, and the record's **Name** and **Code**.
- Drag them into up to three columns, under section headings.
- Make a field required, give it a default value, or say how its number shows.

A **Link** field points to a record of another collection: a person's company, a payment's project. The other side can show the records that link to it, such as a company's people, as a list, a table or a timeline.

**Formula**, **Lookup** and **Rollup** work out a value: `budget - spent`, the city of a person's company, the total of a project's payments. They are worked out as you look, never typed.

## Rules and buttons

The **Rules** tab holds what a collection does by itself:

- A check stops a wrong value and says why: an end date before the start.
- A button on a record does several things at once: **Start project** adds its first tasks and sets it to Active.
- What happens when a record is saved: a payment marked Paid gets its day.

Rules are written in a short language like JavaScript. You need not write them yourself: ask an agent, see [Building an app with an agent](apps-building).

## A calendar

A collection with dates can have a calendar view, by the day, the week or the month. Its records come to Today and Upcoming on their day too.

## Import and export

**Import…**, in the collection's menu, brings rows in from a CSV or an Excel file, matching their columns to the fields. **Export as Excel** and **Export as CSV** take them out, worked-out values included.

## Records in your work

A card's link field, or a task's **Record**, points to a record. A task given a record shows in Today with the record's name. In a record's notes, **To task** and **To card** work as in a note.
