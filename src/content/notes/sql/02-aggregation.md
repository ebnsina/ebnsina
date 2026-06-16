---
title: "Filtering, Grouping & Aggregation"
subtitle: "Collapse many rows into summary answers with COUNT, SUM, GROUP BY, and HAVING."
chapter: 2
level: "beginner"
readingTime: "13 min"
topics: ["group by", "aggregate", "having"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## From Rows to Summaries

So far every query returned individual rows. Often you want a *summary* instead: how many orders did we ship? What's the average order value per customer? Aggregation answers these by collapsing many rows into one.

We'll use an `orders` table:

| id | customer_id | status    | amount | created_at |
|----|-------------|-----------|--------|------------|
| 1  | 10          | shipped   | 49.00  | 2026-05-01 |
| 2  | 10          | shipped   | 12.50  | 2026-05-03 |
| 3  | 20          | cancelled | 80.00  | 2026-05-04 |
| 4  | 20          | shipped   | 99.99  | 2026-05-06 |

## Aggregate Functions

An aggregate function takes a set of values and returns a single value:

| Function       | Returns                                    |
|----------------|--------------------------------------------|
| `COUNT(*)`     | Number of rows                             |
| `COUNT(col)`   | Number of rows where `col` is not null     |
| `SUM(col)`     | Total of all values                        |
| `AVG(col)`     | Mean                                       |
| `MIN(col)` / `MAX(col)` | Smallest / largest value          |

```sql
SELECT
  COUNT(*)        AS order_count,
  SUM(amount)     AS revenue,
  AVG(amount)     AS avg_order,
  MAX(amount)     AS biggest_order
FROM orders;
```

This returns exactly one row summarizing the whole table.

<Callout type="info">

**`COUNT(*)` vs `COUNT(col)`.** `COUNT(*)` counts rows regardless of nulls. `COUNT(col)` counts only rows where `col` is non-null — handy for "how many orders have a discount code". And `COUNT(DISTINCT col)` counts distinct non-null values, e.g. `COUNT(DISTINCT customer_id)` gives the number of unique customers.

</Callout>

## GROUP BY: Aggregating Per Category

A single grand total is rarely enough — you usually want one summary *per group*. `GROUP BY` splits rows into buckets and runs the aggregate within each:

```sql
SELECT
  customer_id,
  COUNT(*)    AS order_count,
  SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id;
```

Result:

| customer_id | order_count | total_spent |
|-------------|-------------|-------------|
| 10          | 2           | 61.50       |
| 20          | 2           | 179.99      |

The rule that catches everyone: **every column in the `SELECT` list must either be inside an aggregate function or named in the `GROUP BY`.** Otherwise the database can't decide which value to show, since a group has many rows. This fails:

```sql
SELECT customer_id, status, SUM(amount)
FROM orders
GROUP BY customer_id;   -- ERROR: status must appear in GROUP BY
```

You can group by multiple columns to make finer buckets:

```sql
SELECT customer_id, status, SUM(amount) AS total
FROM orders
GROUP BY customer_id, status;
```

## HAVING vs WHERE

You can't filter on an aggregate with `WHERE`, because `WHERE` runs *before* grouping happens — at that point the aggregate doesn't exist yet. `HAVING` is the filter that applies *after* grouping:

```sql
SELECT customer_id, SUM(amount) AS total
FROM orders
WHERE status = 'shipped'        -- filter rows BEFORE grouping
GROUP BY customer_id
HAVING SUM(amount) > 50;        -- filter groups AFTER aggregating
```

Read it as a pipeline:

1. `WHERE status = 'shipped'` throws away cancelled orders, row by row.
2. `GROUP BY customer_id` buckets the survivors.
3. `HAVING SUM(amount) > 50` discards whole groups whose total is too small.

<Callout type="tip">

**Put the cheap filter in `WHERE`.** Filtering rows early (in `WHERE`) means fewer rows to group and aggregate, which is faster. Reserve `HAVING` for conditions that genuinely depend on an aggregate value. Writing `WHERE amount > 50` and `HAVING amount > 50` mean very different things.

</Callout>

## The Logical Order of Execution

SQL clauses are *written* in one order but *evaluated* in another. Understanding the logical order explains nearly every "why can't I reference that alias here?" question. The engine conceptually processes a query like this:

```text
1. FROM      — pick the source tables, resolve joins
2. WHERE     — filter individual rows
3. GROUP BY  — collapse rows into groups
4. HAVING    — filter groups
5. SELECT    — compute output columns / aggregates, assign aliases
6. DISTINCT  — remove duplicate result rows
7. ORDER BY  — sort the result
8. LIMIT     — keep only the first N rows
```

Two consequences fall out of this:

- **You can't use a `SELECT` alias in `WHERE` or `GROUP BY`**, because `SELECT` runs *after* them. The alias doesn't exist yet.

  ```sql
  SELECT amount * 0.9 AS discounted FROM orders
  WHERE discounted > 40;   -- ERROR: "discounted" unknown here
  ```

- **You *can* use a `SELECT` alias in `ORDER BY`**, since sorting happens last:

  ```sql
  SELECT amount * 0.9 AS discounted FROM orders
  ORDER BY discounted DESC;   -- works fine
  ```

(PostgreSQL is lenient and also allows aliases in `GROUP BY` as a convenience, but the logical model above is the portable mental picture.)

## Putting It Together

A realistic aggregation query touches most of these clauses at once:

```sql
SELECT
  customer_id,
  COUNT(*)            AS shipped_orders,
  SUM(amount)         AS revenue,
  ROUND(AVG(amount), 2) AS avg_order
FROM orders
WHERE status = 'shipped'
GROUP BY customer_id
HAVING SUM(amount) > 50
ORDER BY revenue DESC
LIMIT 10;
```

This reads as: of the shipped orders, group by customer, keep customers who spent more than 50, and show the top 10 by revenue. That single statement replaces what would be dozens of lines of imperative code — the declarative payoff of SQL.

## Recap

Aggregates collapse rows; `GROUP BY` does it per category; `HAVING` filters the resulting groups while `WHERE` filters the input rows. Internalize the logical execution order and most surprising errors stop being surprising. Next we connect multiple tables together with joins.
