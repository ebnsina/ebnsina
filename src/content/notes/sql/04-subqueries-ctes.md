---
title: "Subqueries & CTEs"
subtitle: "Queries inside queries — scalar, correlated, derived tables, WITH clauses, and recursion."
chapter: 4
level: "intermediate"
readingTime: "15 min"
topics: ["subquery", "cte", "recursive"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Queries Within Queries

A **subquery** is a `SELECT` nested inside another statement. They let you answer questions in stages: compute an intermediate result, then use it. Subqueries appear in three main positions — as a single value, in a `WHERE` filter, and as a table in the `FROM` clause.

## Scalar Subqueries

A scalar subquery returns exactly **one row and one column** — a single value — that you can drop anywhere a value is expected:

```sql
SELECT name, amount,
       amount - (SELECT AVG(amount) FROM orders) AS diff_from_avg
FROM orders;
```

The inner query computes the overall average once; each row subtracts it. If a scalar subquery accidentally returns more than one row, the database raises an error — that constraint is the point.

## Subqueries in WHERE: IN and EXISTS

To filter against a *set* of values, use a subquery with `IN`:

```sql
SELECT name FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE amount > 100);
```

This finds customers who have at least one order over 100. `EXISTS` expresses the same idea differently — it tests whether the subquery returns *any* row at all:

```sql
SELECT name FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.id AND o.amount > 100
);
```

<Callout type="warning">

**`NOT IN` with nulls is a trap.** If the subquery returns even one `NULL`, `NOT IN` returns *no rows at all*, because `x <> NULL` is unknown for every comparison. `WHERE id NOT IN (SELECT customer_id FROM orders)` silently breaks if `customer_id` can be null. Prefer `NOT EXISTS`, which handles nulls correctly and is usually optimized just as well.

</Callout>

## Correlated Subqueries

The `EXISTS` example above is **correlated**: the inner query references `c.id` from the outer query. Logically it re-runs once per outer row. Correlated subqueries are expressive but can be slow when the table is large, because of that per-row evaluation — though Postgres often rewrites them into joins internally. Reach for a join or CTE if a correlated subquery dominates your query plan.

A classic correlated pattern is "the most recent order per customer":

```sql
SELECT * FROM orders o
WHERE o.created_at = (
  SELECT MAX(created_at) FROM orders o2
  WHERE o2.customer_id = o.customer_id
);
```

(Window functions in chapter 7 usually express this more cleanly.)

## Derived Tables (Subqueries in FROM)

A subquery in the `FROM` clause acts as a temporary, unnamed table — a **derived table**. It must be given an alias:

```sql
SELECT bucket, COUNT(*)
FROM (
  SELECT CASE
           WHEN amount < 50  THEN 'small'
           WHEN amount < 100 THEN 'medium'
           ELSE 'large'
         END AS bucket
  FROM orders
) AS labeled
GROUP BY bucket;
```

The inner query labels each order; the outer query counts per label. Derived tables are how you aggregate the result of an aggregation, or join against a pre-summarized set. Recall the fan-out fix from chapter 3 — pre-aggregating the many-side in a derived table is exactly that technique.

## Common Table Expressions (CTEs)

A **CTE** is a named subquery defined up front with `WITH`. It does the same job as a derived table but reads top-to-bottom and can be referenced multiple times:

```sql
WITH customer_totals AS (
  SELECT customer_id, SUM(amount) AS total
  FROM orders
  GROUP BY customer_id
)
SELECT c.name, ct.total
FROM customer_totals ct
JOIN customers c ON c.id = ct.customer_id
WHERE ct.total > 100
ORDER BY ct.total DESC;
```

You can chain several CTEs, each building on the last, which turns an intimidating nested query into a readable pipeline:

```sql
WITH shipped AS (
  SELECT * FROM orders WHERE status = 'shipped'
),
per_customer AS (
  SELECT customer_id, SUM(amount) AS total
  FROM shipped GROUP BY customer_id
)
SELECT * FROM per_customer WHERE total > 50;
```

<Callout type="info">

**CTEs and performance.** Historically Postgres treated CTEs as an "optimization fence" — always materializing them, sometimes hurting performance. Since Postgres 12, simple non-recursive CTEs referenced once are *inlined* (optimized like a subquery) by default. You can force the old behavior with `WITH ... AS MATERIALIZED` when you genuinely want to compute a result once and reuse it.

</Callout>

## Recursive CTEs

A `WITH RECURSIVE` CTE references *itself*, letting you traverse hierarchies and graphs — org charts, category trees, bill-of-materials. It has two parts joined by `UNION ALL`:

1. The **anchor** — the starting rows.
2. The **recursive term** — rows derived from the previous iteration, run repeatedly until it produces nothing.

Given an `employees` table with `id`, `name`, and `manager_id`, walk the chain of command downward from the CEO:

```sql
WITH RECURSIVE org AS (
  -- anchor: top of the tree (no manager)
  SELECT id, name, manager_id, 1 AS depth
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- recursive term: everyone reporting to the previous level
  SELECT e.id, e.name, e.manager_id, org.depth + 1
  FROM employees e
  JOIN org ON e.manager_id = org.id
)
SELECT repeat('  ', depth - 1) || name AS tree, depth
FROM org
ORDER BY depth;
```

Each iteration finds the direct reports of the rows discovered last round, accumulating a `depth` counter. The recursion stops automatically when no new rows are produced — i.e. when you reach the leaves.

<Callout type="warning">

**Guard against infinite loops.** If your data has a cycle (A manages B manages A), a naive recursive CTE never terminates. Track visited nodes in an array, or use the `UNION` (deduplicating) form, or in newer Postgres add a `CYCLE` clause to detect and stop on repeats.

</Callout>

A common companion query is "everything *under* a given node" — flip the join direction (`org.id = e.manager_id` becomes `e.manager_id = org.id`) and start the anchor at the node you care about rather than the root.

## Choosing Between Them

- **Scalar subquery** — when you need one computed value inline.
- **`IN` / `EXISTS`** — set membership filters; prefer `EXISTS` / `NOT EXISTS` for null safety.
- **Derived table / CTE** — when you need to query the result of another query; CTEs win on readability and reuse.
- **Recursive CTE** — the only standard SQL tool for hierarchical and graph traversal.

## Recap

Subqueries let you compose queries in stages; CTEs give those stages names and make complex logic readable; recursive CTEs unlock tree and graph traversal. Mind the `NOT IN`-with-nulls trap and watch correlated subqueries on large tables. Next we make all of this *fast* with indexes and query plans.
