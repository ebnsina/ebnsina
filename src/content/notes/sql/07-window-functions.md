---
title: 'Window Functions'
subtitle: 'Aggregate-like calculations that keep every row — rankings, running totals, and row-to-row comparisons.'
chapter: 7
level: 'advanced'
readingTime: '16 min'
topics: ['window function', 'partition by', 'ranking']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Gap Window Functions Fill

`GROUP BY` collapses rows: ten orders per customer become one summary row. But often you want a calculation _across_ a set of rows while **keeping every individual row** — rank each order within its customer, show each row's share of the total, compare each row to the previous one. That's exactly what **window functions** do.

A window function looks like an aggregate but with an `OVER` clause attached. The `OVER` clause defines the "window" of rows the function sees, _without_ collapsing the result.

```sql
SELECT
  customer_id,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id) AS customer_total
FROM orders;
```

Every order row is returned, each annotated with its customer's total. Compare to `GROUP BY`, which would return one row per customer. Same `SUM`, very different shape.

## Anatomy of OVER

The `OVER` clause has up to three parts:

```sql
function(...) OVER (
  PARTITION BY <columns>   -- split rows into independent groups
  ORDER BY    <columns>    -- order within each partition
  <frame clause>           -- which rows around the current row count
)
```

- **`PARTITION BY`** divides rows into groups; the function restarts for each group. Omit it and the whole result is one partition.
- **`ORDER BY`** orders rows within a partition — essential for ranking, running totals, and `LAG`/`LEAD`.
- **Frame clause** narrows the window to a range of rows _relative to the current row_ (more below).

An empty `OVER ()` means "the entire result set as one unordered window" — useful for "each row's percentage of the grand total":

```sql
SELECT amount,
       amount / SUM(amount) OVER () AS pct_of_total
FROM orders;
```

## Ranking Functions

Three functions assign positions within an ordered partition:

```sql
SELECT
  customer_id, amount,
  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rn,
  RANK()       OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS dense
FROM orders;
```

They differ only in how they handle **ties**:

| Function       | Behavior on ties                       | Example sequence |
| -------------- | -------------------------------------- | ---------------- |
| `ROW_NUMBER()` | Always distinct, arbitrary tie-break   | 1, 2, 3, 4       |
| `RANK()`       | Ties share a rank, then _skip_ numbers | 1, 2, 2, 4       |
| `DENSE_RANK()` | Ties share a rank, _no_ gaps           | 1, 2, 2, 3       |

<Callout type="tip">

**"Top N per group" is the killer use case.** Wrap a `ROW_NUMBER()` query in a subquery and filter:

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY customer_id ORDER BY amount DESC
  ) AS rn
  FROM orders
) t
WHERE rn <= 3;   -- the 3 biggest orders per customer
```

You can't filter on a window function in `WHERE` directly (it's computed in `SELECT`, after `WHERE`), so the subquery is required.

</Callout>

## LAG and LEAD: Looking at Neighbors

`LAG` and `LEAD` pull a value from a row _before_ or _after_ the current one within the partition — perfect for period-over-period comparisons:

```sql
SELECT
  month,
  revenue,
  LAG(revenue) OVER (ORDER BY month)  AS prev_month,
  revenue - LAG(revenue) OVER (ORDER BY month) AS mom_change
FROM monthly_revenue;
```

`LAG(revenue)` returns the previous row's revenue; subtracting gives month-over-month change. Both take optional arguments — `LAG(revenue, 1, 0)` means "go back 1 row, default to 0 when there's no prior row" (e.g. the first month). `LEAD` is the same idea looking forward.

## Running Totals and Frame Clauses

When a window function has an `ORDER BY` but no explicit frame, the default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — everything from the start of the partition up to the current row. That default is exactly what produces a **running total**:

```sql
SELECT
  created_at,
  amount,
  SUM(amount) OVER (ORDER BY created_at) AS running_total
FROM orders;
```

Each row's `running_total` is the sum of every order up to and including it. To compute a **moving average** over the current row plus the two before it, specify the frame explicitly with `ROWS`:

```sql
SELECT
  created_at,
  amount,
  AVG(amount) OVER (
    ORDER BY created_at
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ) AS moving_avg_3
FROM orders;
```

The frame clause has two common forms:

- **`ROWS`** — counts a physical number of rows (`2 PRECEDING` = the two rows above).
- **`RANGE`** — counts rows by _value_ of the `ORDER BY` column (all rows with the same value are one peer group).

<Callout type="warning">

**`ROWS` and `RANGE` differ on ties.** With `RANGE`, rows that share the same `ORDER BY` value are treated as a single peer group, so a running total can "jump" past several equal-valued rows at once. With `ROWS`, each physical row is distinct. For a strict row-by-row running total, prefer `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

</Callout>

## Other Useful Window Functions

- **`FIRST_VALUE(col)` / `LAST_VALUE(col)`** — the first/last value in the frame (mind the frame: `LAST_VALUE` needs an explicit full frame to mean "last in the partition").
- **`NTH_VALUE(col, n)`** — the nth value in the frame.
- **`NTILE(n)`** — splits the partition into `n` roughly equal buckets, e.g. `NTILE(4)` for quartiles.
- **`PERCENT_RANK()` / `CUME_DIST()`** — relative rank as a fraction, for percentile analysis.

## Naming the Window with WINDOW

When several functions share the same `OVER` spec, define it once with a `WINDOW` clause to avoid repetition:

```sql
SELECT
  customer_id, amount,
  RANK()       OVER w AS rnk,
  SUM(amount)  OVER w AS running
FROM orders
WINDOW w AS (PARTITION BY customer_id ORDER BY amount DESC);
```

## A Mental Model

Think of a window function as running in two passes. First the engine produces the normal result set (after `FROM`/`WHERE`/`GROUP BY`). Then, for each row, it looks at that row's _window_ of related rows and computes the function — annotating, never collapsing. Because window functions run _after_ `WHERE` and `GROUP BY` but _before_ the final `ORDER BY`, you filter their output in an outer query, as the top-N example showed.

## Recap

Window functions compute across related rows while preserving every row. `PARTITION BY` groups, `ORDER BY` sequences, and the frame clause bounds the rows considered. Use ranking functions for top-N and leaderboards, `LAG`/`LEAD` for period comparisons, and ordered `SUM`/`AVG` for running totals and moving averages. They replace whole families of self-joins and correlated subqueries with one readable clause. Next we pull everything together into query optimization.
