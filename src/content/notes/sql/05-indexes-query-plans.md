---
title: 'Indexes & Query Plans'
subtitle: 'How the database finds rows fast — B-tree indexes, EXPLAIN, and when an index is useless.'
chapter: 5
level: 'intermediate'
readingTime: '17 min'
topics: ['index', 'explain', 'b-tree']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Problem Indexes Solve

Without an index, finding rows that match `WHERE email = 'lubna@example.com'` means reading **every row** in the table — a _sequential scan_. On a million-row table that's a million reads to find one row. An index is a separate, sorted data structure that lets the database jump straight to matching rows, the same way a book's index sends you to a page instead of reading cover to cover.

The trade-off: indexes speed up reads but slow down writes (every `INSERT` / `UPDATE` / `DELETE` must also update the index) and consume disk space. Index deliberately, not reflexively.

## B-Tree Indexes

Postgres's default index type is a **B-tree** (balanced tree). It keeps keys sorted and stays only a few levels deep even for huge tables, so any lookup takes a handful of page reads. Because it stores keys _in order_, a B-tree accelerates:

- Equality: `WHERE id = 42`
- Ranges: `WHERE created_at >= '2026-01-01'`
- Sorting: `ORDER BY created_at` (the index is already sorted)
- Prefix matching: `WHERE email LIKE 'lubna%'` (but _not_ `LIKE '%lubna'`)

```sql
CREATE INDEX idx_users_email ON users (email);
```

A `UNIQUE` constraint or `PRIMARY KEY` creates a B-tree index automatically — you don't add one separately.

<Callout type="info">

**B-trees aren't the only index type.** Postgres also offers `hash` (equality only), `GIN` (for `jsonb`, arrays, and full-text search), `GiST` (geometric / range data), and `BRIN` (huge, naturally-ordered tables like time-series logs). B-tree is the right default for the vast majority of cases; reach for the others when their specific data shape applies. The db-internals track covers their machinery.

</Callout>

## Composite Indexes and Column Order

A **composite** (multi-column) index covers several columns at once:

```sql
CREATE INDEX idx_orders_cust_date ON orders (customer_id, created_at);
```

Column **order matters enormously**. This index is sorted by `customer_id` first, then `created_at` within each customer. It serves:

- `WHERE customer_id = 10` — yes (leading column)
- `WHERE customer_id = 10 AND created_at > '2026-01-01'` — yes, ideal
- `WHERE created_at > '2026-01-01'` alone — **no**, because `created_at` is not the leading column

This is the **leftmost-prefix rule**: a composite index helps only when your filter uses a contiguous prefix of its columns starting from the first. Order columns by equality first, then range/sort columns.

## Covering Indexes

If an index contains _every_ column a query needs, Postgres can answer entirely from the index without touching the table — an **index-only scan**. The `INCLUDE` clause adds payload columns that aren't part of the search key:

```sql
CREATE INDEX idx_orders_cust_amount
  ON orders (customer_id) INCLUDE (amount);

-- Answered from the index alone:
SELECT amount FROM orders WHERE customer_id = 10;
```

Covering indexes can dramatically speed up hot queries, at the cost of a larger index.

## Reading Query Plans with EXPLAIN

`EXPLAIN` shows the _plan_ the optimizer chose — without running the query. `EXPLAIN ANALYZE` actually executes it and reports real timings and row counts, which is what you want when diagnosing slowness.

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 10;
```

A plan reads as a tree of nodes; indentation shows nesting, and you read inner (more-indented) nodes first. Two plans for the same query:

```text
-- Without an index:
Seq Scan on orders  (cost=0.00..1834.00 rows=12 width=40)
                    (actual time=0.30..14.20 rows=12 loops=1)
  Filter: (customer_id = 10)
  Rows Removed by Filter: 99988

-- With an index on customer_id:
Index Scan using idx_orders_cust on orders
                    (cost=0.42..8.44 rows=12 width=40)
                    (actual time=0.03..0.05 rows=12 loops=1)
  Index Cond: (customer_id = 10)
```

Key things to read off a plan:

- **Node type** — `Seq Scan` (read whole table), `Index Scan`, `Index Only Scan`, `Bitmap Heap Scan`, or join nodes like `Nested Loop`, `Hash Join`, `Merge Join`.
- **`cost`** — the planner's estimate, in arbitrary units (startup..total). Lower is what it optimizes for.
- **`actual time`** — real milliseconds (only with `ANALYZE`).
- **`rows` estimated vs actual** — a large mismatch means stale statistics; run `ANALYZE tablename` to refresh them. Bad estimates lead to bad plans.
- **`Rows Removed by Filter`** — high numbers mean you scanned far more than you returned, a hint that an index would help.

<Callout type="tip">

**The estimate-vs-actual gap is your best clue.** If the planner expects 10 rows but gets 100,000, it likely chose a nested loop that's now catastrophically slow. The fix is often `ANALYZE` to update statistics, or restructuring the query so the planner can estimate better.

</Callout>

## Seq Scan vs Index Scan and Selectivity

A sequential scan isn't always bad. The planner weighs **selectivity** — what fraction of rows a condition matches:

- **High selectivity** (matches few rows, e.g. a unique email) → index scan wins. Jump to the few matches.
- **Low selectivity** (matches many rows, e.g. `status = 'active'` where 90% are active) → a seq scan is often _faster_, because following index pointers to most of the table, in random order, costs more than streaming the whole table sequentially.

This is why an index on a boolean or low-cardinality column frequently goes unused — and why the planner is right to ignore it. Indexes pay off when they let you skip the _majority_ of rows.

## When Indexes Don't Help

An index on a column is wasted if the query can't use it. Common cases:

- **Function or expression on the column.** `WHERE lower(email) = 'lubna@x.com'` can't use a plain index on `email`. Create an _expression index_: `CREATE INDEX ON users (lower(email))`.
- **Leading wildcard.** `LIKE '%lubna'` can't use a B-tree (it's sorted by prefix). Trigram (`GIN` + `pg_trgm`) indexes handle this.
- **Type mismatch.** Comparing an indexed `text` column to an integer literal may force a cast that bypasses the index.
- **Low selectivity**, as above — the planner correctly skips it.
- **Tiny tables.** Below a few hundred rows, a seq scan is faster than index overhead; the planner won't bother with the index.
- **`OR` across different columns** sometimes prevents index use; a `UNION` of two indexed queries, or a bitmap scan, can be faster.

<Callout type="warning">

**Don't index everything.** Each index adds write amplification and storage. A table with fifteen indexes can spend more time maintaining them than serving queries. Index the columns your real `WHERE`, `JOIN`, and `ORDER BY` clauses actually use, then verify with `EXPLAIN` that the index is chosen. Drop indexes that `pg_stat_user_indexes` shows are never scanned.

</Callout>

## A Practical Workflow

1. Find the slow query (from logs or `pg_stat_statements`).
2. Run `EXPLAIN ANALYZE` on it.
3. Spot the expensive node — usually a `Seq Scan` with many `Rows Removed by Filter`, or a join with a bad row estimate.
4. Add a targeted index (matching column order to the query), or refactor the query.
5. Re-run `EXPLAIN ANALYZE` and confirm the plan changed and the time dropped.

## Recap

Indexes are sorted side structures that let the database skip most of a table; B-trees handle equality, ranges, and ordering. Composite indexes obey the leftmost-prefix rule, covering indexes enable index-only scans, and `EXPLAIN ANALYZE` is how you see what's really happening. But indexes only help high-selectivity, sargable conditions — and every one costs you on writes. Next we make concurrent writes safe with transactions.
