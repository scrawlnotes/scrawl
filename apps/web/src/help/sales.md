# 🧾 Sales and invoicing

Sales and invoicing keeps what you sell, the quotes and orders for it, and the money coming in, from the quote to the last payment. Invoices are made in your accounting program; their numbers and due days are kept here.

## Setting it up

- **What do you sell?** **Products**, **Services** or **Both**, the default. It sets the units a product is sold in: **piece**, **kg**, **litre** or **box** for goods, **hour**, **day**, **month** or **project** for services. With both, a product has a **Type**: **product** or **service**.
- **Is tax added to your prices?** Yes by default: products and order lines get **Tax %** and **Tax included**. **Do your prices usually include the tax?**, no by default, is where a new product starts; each product and each line says its own, with its own rate.
- **Do you give discounts?** Yes by default: a line gets **Discount %**, a share of it.
- **Do you send quotes?** Yes by default: an order starts as a **Quote**, and becomes **Confirmed** when the customer says yes. With no, it starts **Confirmed**.
- **When do your customers pay?** **On receipt**, **In 15 days**, **In 30 days**, the default, or **In 60 days**. A customer with no terms of its own takes these; an invoice is due that many days after it is made.

With more than one currency in the app, each order has its own **Currency**.

## Orders

**Orders** has a tab for each step: **Quotes**, **Open**, **To invoice**, **Unpaid** and **Paid**. The list says what is to collect, how much of it is overdue and what is in quotes: "₺85.110 to collect · ₺19.150 overdue · ₺31.000 in quotes". Each order shows its customer, date, total, what is **Left**, its status and where it stands: "Valid until Nov 28", "To invoice", "Due today", "Overdue 12 days".

A new quote or order asks its **Customer**, its **Date**, today to start, and for a quote **Valid until**, 30 days on. It gets a number such as SO-0001. Then add its lines: pick the **Product** and write the **Quantity**.

Its status goes **Quote**, **Confirmed**, **Delivered**, **Invoiced**, **Paid**; or it ends **Declined** or **Cancelled**. Its window says where it stands, "Invoiced · ₺39.150 · ₺19.150 left · 12 days overdue", with its statuses as a bar: move it on there, **Delivered** once the customer has it. It lists its lines, what they come to, "Subtotal · Tax · Total · Collected · Left", and the payments made on it. Its buttons, as its status allows:

- **Accept**, on a quote: it becomes **Confirmed**.
- **Declined**, on a quote: asks **Why**: **Price**, **Timing**, **Competitor**, **No budget**, **No response** or **Not a fit**.
- **Invoice**, on an order confirmed or delivered: asks the **Invoice no** and **Invoiced on**, today to start, and shows the due day it works out from the payment terms: "Due Nov 13 · Net 15, Kuzey Asansör's terms". The order becomes **Invoiced**.
- **Record payment**: asks the **Amount**, what is left to start, **Paid on**, today to start, and the **Method**: **Bank transfer**, **Card** or **Cash**. Less than what is left keeps the order open with the rest to collect.
- **Cancel order**, after asking.

Worked out by itself:

- A line takes its name and price from its product when they are left empty, and its tax rate and whether tax is included as the product is picked.
- A line works out its amount with its discount and tax; the order adds its lines up.
- An order takes its customer's **Payment terms**, else the app's.
- An order with no lines is marked, **An order needs at least one line**, unless it is a quote, declined or cancelled.
- When nothing is left to collect, the order is **Paid**.

## Payments

Every payment in and out: its **Direction**, **In** or **Out**, **Amount**, **Status** (**Planned**, **Invoiced**, **Paid**), **Due**, **Paid on**, **Method**, **Invoice no**, company and **Order**. **Record payment** writes them: it pays a payment of the order that is waiting, leaving what is not paid yet as a new one, or adds a paid one. A payment marked **Paid** gets today as its **Paid on**.

## Products

What you sell: its **Name**, a **Code** such as PRD-0001, **Unit**, **Price**, **Tax %**, **Tax included** and **For sale**, on to start.

## Companies

Your customers. Each has its **Payment terms**, **Due on receipt**, **Net 15**, **Net 30** or **Net 60**; left empty, the app's. Its window lists its orders, each with where it stands and what is left, and **New quote** makes one for it, or **New order** without quotes.

When [CRM](crm) keeps people only, your customers are its **People**, and all this holds for them.

## Today

An invoice comes to Today on its due day with **Record payment**, and to Upcoming before it; one not paid stays in Overdue. Only invoiced orders come, not quotes. A payment not paid yet comes on its **Due** day too.

## Home

- **To collect**: what is left on the invoices not paid and how much of it is overdue, each with its customer and where it stands.
- **Quotes**: how many are open, and their total.
- **This month**: the total of this month's orders and how many; what is **To invoice**, what is **Collected**, and the **Best customer**.

## With other apps

- [CRM](crm): your customers are its companies. A deal's window lists its quotes, and **Quote** makes one with the deal's company as the customer. **Accept** moves the deal to **Won**, **Declined** to **Lost** with its reason; a deal moved to **Won** confirms its quote, one moved to **Lost** declines it. A company says what is to collect from it.
- [Stock and purchasing](stock): the products are the same. As Stock asks, an order's products go out of stock when it is **Confirmed** or **Delivered**, and come back when it is **Cancelled**; a line asking for more than is available is marked.
- [E-commerce](ecommerce): an order is **Packed** and **Shipped** on its way.
- [Budget and spending](budget): the payments are the same, and money recorded here goes on the **Sales** budget line. Budget can add the payment to collect when an order is invoiced.
- [Field service](field), [Consulting](consulting) and [Subscriptions and memberships](subscriptions): what they invoice, a job, hours or a renewal, becomes an order here, to invoice.

## Ask an agent

- "Make a quote for Kuzey Asansör: 4 Rail at list price, valid for two weeks."
- "What is overdue, and from whom?"
- "Invoice SO-0012 with number FTR-2026-118."
- "Kuzey Asansör paid ₺20.000 on SO-0012 by bank transfer."
- "Who was our best customer this month?"

To connect one, see [Agents](ai-agents).
