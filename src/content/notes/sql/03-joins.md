---
title: 'Joins'
subtitle: 'Combining rows from multiple tables — the operation that makes relational databases relational.'
chapter: 3
level: 'intermediate'
readingTime: '16 min'
topics: ['join', 'inner join', 'outer join']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Joins Exist

Good schema design spreads data across tables to avoid duplication: customers live in `customers`, their orders in `orders`, and each order points back to a customer by `customer_id`. That pointer is a **foreign key**. A **join** stitches those tables back together so you can ask "show each order _with_ its customer's name".

Our two tables:

```text
customers                  orders
+----+----------+          +----+-------------+--------+
| id | name     |          | id | customer_id | amount |
+----+----------+          +----+-------------+--------+
| 10 | Lubna    |          |  1 |     10      | 49.00  |
| 20 | Nusayba  |          |  2 |     10      | 12.50  |
| 30 | Harun    |          |  3 |     20      | 80.00  |
+----+----------+          |  4 |     99      | 15.00  |  <- orphan: no customer 99
                           +----+-------------+--------+
```

Note customer 30 (Harun) has no orders, and order 4 references a non-existent customer 99. These edge cases are exactly where join _types_ differ.

## INNER JOIN

An inner join returns only rows that match on **both** sides:

```sql
SELECT o.id, c.name, o.amount
FROM orders o
INNER JOIN customers c ON c.id = o.customer_id;
```

| o.id | name    | amount |
| ---- | ------- | ------ |
| 1    | Lubna   | 49.00  |
| 2    | Lubna   | 12.50  |
| 3    | Nusayba | 80.00  |

Harun disappears (no orders) and order 4 disappears (no matching customer). `INNER` is the default — you can write just `JOIN`. The `o` and `c` are **table aliases**, which keep multi-table queries readable.

## LEFT JOIN (and RIGHT)

A `LEFT JOIN` keeps **every row from the left table**, filling the right side with `NULL` where there's no match:

```sql
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id;
```

| name    | order_id | amount |
| ------- | -------- | ------ |
| Lubna   | 1        | 49.00  |
| Lubna   | 2        | 12.50  |
| Nusayba | 3        | 80.00  |
| Harun   | _NULL_   | _NULL_ |

Now Harun appears with null order columns — that's the whole point. `LEFT JOIN` answers "all customers, _and their orders if any_". A `RIGHT JOIN` is the mirror image, keeping every row from the right table; in practice people just reorder the tables and use `LEFT`, so `RIGHT` is rare.

<Callout type="tip">

**Find rows with no match** by combining a `LEFT JOIN` with an `IS NULL` filter — a very common, very useful pattern:

```sql
SELECT c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;   -- customers who never ordered
```

</Callout>

## FULL OUTER JOIN

A `FULL OUTER JOIN` keeps unmatched rows from **both** sides:

```sql
SELECT c.name, o.id AS order_id
FROM customers c
FULL OUTER JOIN orders o ON o.customer_id = c.id;
```

You get Lubna and Nusayba's matched rows, Harun with a null order, _and_ order 4 with a null name. It's the union of left and full join behavior — useful for reconciliation reports where you want to surface mismatches on either side.

## CROSS JOIN

A `CROSS JOIN` produces the **Cartesian product** — every row on the left paired with every row on the right, with no `ON` condition:

```sql
SELECT s.size, c.color
FROM sizes s
CROSS JOIN colors c;   -- all size/color combinations
```

With 3 sizes and 4 colors you get 12 rows. It's occasionally intentional (generating combinations, building date grids) but more often the symptom of an accidental missing join condition.

## Join Types at a Glance

| Join type    | Keeps unmatched left?   | Keeps unmatched right? |
| ------------ | ----------------------- | ---------------------- |
| `INNER`      | No                      | No                     |
| `LEFT`       | Yes                     | No                     |
| `RIGHT`      | No                      | Yes                    |
| `FULL OUTER` | Yes                     | Yes                    |
| `CROSS`      | n/a — every combination |                        |

## Self-Joins

A table can join to itself — useful when rows reference other rows in the same table. Picture an `employees` table where each row has a `manager_id` pointing at another employee:

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
```

The same physical table appears twice with different aliases (`e` and `m`), one acting as "the employee" and the other as "their manager". The `LEFT JOIN` ensures the CEO (no manager) still shows up.

## Multi-Table Joins

Joins chain naturally. To list each order line with its product and the customer's name, you join three tables:

```sql
SELECT c.name, p.title, oi.quantity
FROM orders o
JOIN customers c   ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p    ON p.id = oi.product_id;
```

The engine resolves them pairwise, building up the combined result. Always join on indexed key columns (covered in chapter 5) or these queries get slow fast.

## Join Pitfalls

### Fan-out (row multiplication)

When you join a table to another that has _many_ matching rows, the result multiplies. Joining `orders` to `order_items` gives one row _per item_, not per order. If you then `SUM(o.amount)`, each order's amount is counted once per line item — wildly inflating the total.

```sql
-- WRONG: order amount double-counted by line items
SELECT SUM(o.amount)
FROM orders o
JOIN order_items oi ON oi.order_id = o.id;
```

The fix is to aggregate the many-side _before_ joining, often with a subquery or CTE (chapter 4), or to sum the granular column (`oi.quantity * oi.price`) instead.

<Callout type="warning">

**Fan-out silently corrupts totals.** It doesn't throw an error — it just returns a plausible-looking but wrong number. Whenever a join touches a one-to-many relationship and you're aggregating, stop and ask "what is one row in my result?" If the grain changed, your sums are suspect.

</Callout>

### NULLs in join keys

`NULL` never equals `NULL`, so rows with a null join key never match in _any_ join type — they simply drop out of inner joins and produce null-padded rows in outer joins. If `customer_id` is nullable and you rely on the join to enforce a relationship, you may quietly lose rows. Foreign keys plus `NOT NULL` constraints (chapter 9) prevent this at the source.

### Forgetting the ON condition

Omit `ON` (or get it wrong) and you've accidentally written a cross join, returning a vast Cartesian product. A query that should return 1,000 rows suddenly returns a million. If a result is implausibly large, check your join conditions first.

## Recap

Inner joins return matches; outer joins (`LEFT` / `RIGHT` / `FULL`) preserve unmatched rows with nulls; cross joins multiply everything. Watch for fan-out when aggregating across one-to-many relationships, and remember that null keys never match. Next we'll nest queries inside queries with subqueries and CTEs.
