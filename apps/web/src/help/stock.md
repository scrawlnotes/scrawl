# 📦 Stock and purchasing

What you have in stock, every movement in and out, and what you order from suppliers. Stock is never typed: it is worked out from the movements.

## Setting it up

- **Will you track purchasing too?** Yes by default: purchase orders, **Reorder** and **Receive**.
- **Do you have more than one warehouse?** No by default. Yes asks **Your warehouses**, **Main warehouse** and **Second warehouse** to start with; the first is where goods go when no warehouse is given. Each product then has its stock in each.
- **Should a sale take its products out of stock?** Asked with [Sales and invoicing](sales): **No**, **When the order is confirmed**, or **When the order is delivered**, the default.
- **Add what you owe the supplier when goods come in?** Asked with [Budget and spending](budget), when you track purchasing. Yes by default.

## Products

A product has its **Code**, **Unit**, **Price**, **Cost**, **Supplier**, **Reorder at** and **Reorder quantity**. Its numbers are worked out:

- **In stock:** what came in less what went out.
- **Committed:** with Sales and invoicing, what orders hold of it, confirmed and not gone out yet.
- **Available:** what is in stock less what is committed.
- **On order:** what is still to come on purchase orders sent.

It is **Low** when what is available and on order is under **Reorder at**, **Out** when there is none: one already ordered is not low.

The tabs are **All** and **Low stock**. Over them: how many products, what the stock is worth, and how many are low. A product's window starts with "38 in stock · 6 committed · 32 available · 20 on order", and lists its movements day by day and, with warehouses, its stock in each.

- **Adjust** asks what was **Counted**, saying "Now 38 · 2 less", with warehouses which **Location**, and **Why**: **Count**, **Damaged**, **Lost**, **Found** or **Other**. The difference is written as an adjustment.
- **Transfer**, with warehouses, asks the **Quantity**, **From** and **To**: it goes out of one and into the other.
- **Reorder** puts the product on its supplier's draft purchase order, or starts one: its **Reorder quantity**, or as many as bring it to **Reorder at**. It needs a supplier.
- **Reorder all**, on **Low stock**, does it for every low product, one draft for each supplier. A product already on its draft is not added twice.

## Purchase orders

A purchase order has its **Supplier**, the day it was **Ordered on**, the day it is **Expected**, and its lines: each product with what was **Ordered** and **Received**, its **Cost** and **Amount**. A line takes its name and cost from its product. Its **Status** goes from **Draft** to **Ordered**, **Partially received** and **Received**, or **Cancelled**.

The tabs are **Open** and **Received**. A row says when it arrives: "today", "Nov 3", "2 days late".

- **Order**, on a draft, asks the day it is **Expected**, a week from today to start with, and marks it ordered today.
- **Receive** asks what **Came** of each line, filled with what is still to come; lower what is short. It asks the day it was **Received on** too and, with warehouses, **Into** which. What came goes into stock; what is short stays on its way, and the order is **Partially received**. A product then costs what it was last bought for.
- **Cancel order**, on a draft or an ordered one, asks first.

## Stock counts

Add a count with its **Date** and, with warehouses, its **Location**. Every product comes into it as a line with what is **In stock**; write what was **Counted** of each in the table, and its **Difference** shows beside it. The count says how far it is: "12 of 48 counted · 2 differ · a product left empty stays as it is".

**Apply** writes each difference as an adjustment, why **Count**, and marks the count **Applied**.

## Locations

With warehouses, each one with its **Address** and the stock of each product in it. The one marked **Default** is where goods go when no warehouse is given.

## Companies

Your suppliers. With purchasing, a supplier's window lists its purchase orders, with their status and total.

## Today

A purchase order sent comes to Today on the day it is expected, with **Receive**, saying its supplier and total, and to Upcoming before. Late ones stay under **Overdue**.

## Home

- **Low stock:** how many, each with what is available and its reorder level, or "out · 20 on order"; **Reorder all** is there too.
- **In stock:** the **Stock value**, and what is **Committed** and **On order**, in money.
- **To receive:** the purchase orders on their way, and when each arrives.

## With other apps

- [Sales and invoicing](sales) keeps the same products. Its confirmed orders commit them; with the question above, an order confirmed or delivered takes them out of stock, and they come back when it goes back or is cancelled. With warehouses, an order has its **Location**. A line asking for more than is available is marked: "Not enough stock: 4 available".
- [Budget and spending](budget): once a purchase order is **Received**, what you owe the supplier is added to **Bills and payments**, **Invoiced**.
- [E-commerce](ecommerce): a return received goes back into stock.
- [Field service](field): the parts a job uses go out of stock.
- [Assets and maintenance](assets): with more than one place there too, its places are the same list as your warehouses.
- [CRM](crm): your suppliers are among the same companies.

## Ask an agent

- "Count the Rail stock as 12."
- "Reorder everything on Low stock."
- "Receive PO-0004: everything came but 5 of the hinges."
- "What is on order from Demir Metal, and when does it come?"
- "Move 20 chairs from Main warehouse to Second warehouse."
