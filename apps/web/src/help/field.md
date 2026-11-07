# 🔧 Field service

Jobs at your customers' sites: who goes when, what was checked, the parts used and the customer's signature. For a team that repairs, services, installs or inspects equipment where it stands.

## Setting it up

- **What jobs do you do?** **Repair**, **Maintenance**, **Installation** and **Inspection**, all by default. They are a job's **Type**, and each comes with a checklist.
- **Your technicians:** each gets a row of their own on Schedule. Leave it empty and add them later if you like.
- **Do you service equipment regularly, under a maintenance agreement?** Yes by default: each unit says how often it is serviced, and when its maintenance is done, the next is planned.
- **Take the parts used out of stock?** Asked with Stock and purchasing; yes by default.
- **Invoice a job when it is done?** Asked with Sales and invoicing or Budget and spending; yes by default. With Sales it writes an order; with Budget, a payment.

## Jobs

Its tabs are **Today**, **Unscheduled**, **Scheduled**, **Late**, **To invoice** and **Done**. Over them: how many are today, unscheduled and late, and what there is to invoice.

A new job asks its **Customer**, **Equipment**, **Type**, **Technician**, **When**, and how long it **Takes**, an hour unless you change it. Leave **When** empty and it waits in Unscheduled. A job for a unit takes its customer and address from the unit, and its title from its type and the unit; given a day, it is Scheduled.

A job starts with the checklist of its type, ticked as the work is done. Under it, **Parts and labour** lists the parts used: a part takes its price from its product, in **Products**. Photos go in its notes.

A job is **Unscheduled**, **Scheduled**, **In progress**, **Done**, **Invoiced** or **Cancelled**. Its buttons, as it goes:

- **Schedule**, on one with no day, asks the **Technician** and **When**.
- **On my way** writes when the technician set out.
- **Start**, on arrival, writes the time and makes it In progress.
- **Complete** asks **What was done**, when it **Started** and **Finished**, the **Customer's signature** and who it was **Signed by**. If checklist items are not ticked, it says how many; you can complete it anyway. The hours times the technician's **Hourly rate** are added as a labour line.
- **Reschedule**, on a scheduled one, asks the technician and the time again.
- **Invoice**, on a job done, when jobs are invoiced. Over **To invoice**, **Invoice all** invoices each one.

A scheduled job whose day has passed is **Late**. Two jobs of the same technician at the same time are marked; both are kept.

A job's window says where it stands in one line: "Scheduled · Today 11:00 · Ahmet · Acme Lojistik, Beşiktaş".

## Schedule

Each technician's day on a row, a row for the jobs given to no one, and the jobs with no day beside them. Drag a job onto a technician's row at its hour: it is theirs then, and Scheduled. Jobs are colored by their type.

## Equipment

What you look after at your customers' sites: its **Customer**, **Address**, **Type**, **Brand and model**, **Serial no** and when it was **Installed**. Under a maintenance agreement, how often it is **Serviced**, **Monthly**, **Every 3 months**, **Every 6 months** or **Yearly**, and its **Next service**; one past its day is marked **Service due**. **Service due** shows the services on a calendar.

A unit's window lists its jobs, with **+ Job**. A customer's window lists their equipment and their jobs.

## Technicians and Checklists

- **Technicians:** each one's **Phone**, **Hourly rate**, **Works from** and **Works until**, 08:00 to 17:00 to start, and **Days**, Monday to Friday; how many jobs they have **Today**, and their jobs.
- **Checklists:** what is checked on each type of job, in order, such as "Check the safety devices". A new job of the type starts with them, so change them here.

## Today

- A scheduled job comes to Today on its day, and to Upcoming before it, with **Start**; one not started stays under **Overdue**.
- A job in progress comes with **Complete**.
- A unit's next service comes on its day with **Book visit**. It asks **When** and the **Technician**, and adds a maintenance job; with no time, it waits in Unscheduled. A unit with a maintenance job already open has no **Book visit**.
- When a unit's maintenance job is completed, its next service is set that much after the day: a month, 3 months, 6 months or a year.

## Home

- **Today:** the day's jobs and how many are late, each with its time and technician.
- **To schedule:** the jobs with no day.
- **To invoice:** what the jobs done come to, and how many there are.
- **Service due:** each unit's next service.

## With other apps

- [CRM](crm): the same customers.
- [Customer support](support): a request can name its unit, and a job the request it came from. A request's window lists its jobs, with **+ Job**, and the job's line says "from RQ-0142".
- [Sales and invoicing](sales): **Invoice** adds the job's parts and labour to its customer's order of the day, to invoice there, and the job is Invoiced. **Products** are the same as Sales'.
- [Budget and spending](budget): without Sales, **Invoice** adds a payment of the job's total to collect, under a **Field service** budget line.
- [Stock and purchasing](stock): when a job is done, its parts go out of stock; if it is set back from Done, they come back.

## Ask an agent

- "Add a maintenance job for the lift at Acme Lojistik tomorrow at 10:00, with Ahmet."
- "Which jobs are late, and whose are they?"
- "Schedule the unscheduled jobs over next week, shared between the technicians."
- "Which units are due for service this month?"
- "Invoice all the jobs done for Acme Lojistik."
