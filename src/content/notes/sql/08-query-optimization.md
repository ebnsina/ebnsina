---
title: "Query Optimization & Performance"
subtitle: "Reading plans in anger, killing N+1 queries, paginating at scale, and avoiding the classic anti-patterns."
chapter: 8
level: "advanced"
readingTime: "17 min"
topics: ["optimization", "n+1", "performance"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Optimization Mindset

Performance work follows one rule: **measure, don't guess.** Find the actual slow query (with `pg_stat_statements` or your APM), look at its real plan with `EXPLAIN ANALYZE`, change one thing, and re-measure. Most "optimizations" applied blindly do nothing — or make things worse. The database's planner is usually smarter than your intuition; your job is to give it good indexes, good statistics, and queries it can plan well.

## Reading Plans in Practice

Chapter 5 introduced `EXPLAIN ANALYZE`. In real diagnosis, scan a plan for these red flags:

- **`Seq Scan` on a large table** with a high `Rows Removed by Filter` — a missing index, or a non-sargable condition.
- **Estimated rows far from actual rows** — stale statistics (`ANALYZE` the table) or a condition the planner can't estimate. Bad estimates cascade into bad join choices.
- **`Nested Loop` with a large inner side** — fine when the inner side is tiny and indexed, disastrous when it isn't. Often the symptom of the N+1 pattern below, or a bad row estimate.
- **High `loops=` count** on a node — that node ran many times; its per-loop cost multiplies.
- **`Sort` or `Hash` spilling to disk** (`Sort Method: external merge Disk: 24MB`) — increase `work_mem`, or add an index that provides the order for free.

Use `EXPLAIN (ANALYZE, BUFFERS)` to also see how many pages came from cache vs disk — a query that's slow only on a cold cache needs a different fix than one that's CPU-bound.

## The N+1 Problem

The single most common performance bug in application code isn't a slow query — it's *too many* queries. You fetch a list, then loop and issue one more query per item:

```text
SELECT * FROM posts LIMIT 20;            -- 1 query
-- then, in app code, for each of the 20 posts:
SELECT * FROM users WHERE id = ?;        -- 20 queries
```

That's 21 round trips where 1 or 2 would do. Each round trip pays network and parsing overhead; at 20 items it's annoying, at 2,000 it's an outage. The fix is to fetch related data in a **single query with a join**, or a second query using `IN`:

```sql
-- One join instead of N+1
SELECT p.*, u.name AS author
FROM posts p
JOIN users u ON u.id = p.author_id
LIMIT 20;
```

<Callout type="warning">

**N+1 hides behind ORMs.** Lazy-loading a relation inside a loop looks like innocent property access (`post.author.name`) but fires a query every iteration. Enable query logging in development and watch the count. Use your ORM's eager-loading or batching feature (`include`, `joinedload`, `with`, DataLoader) to collapse N+1 into a constant number of queries.

</Callout>

## Pagination: Offset vs Keyset

The naive way to page through results is `LIMIT` / `OFFSET`:

```sql
SELECT * FROM posts ORDER BY created_at DESC
LIMIT 20 OFFSET 10000;   -- page 501
```

The problem: the database must **generate and discard** all 10,000 skipped rows before returning your 20. `OFFSET` gets linearly slower the deeper you page — page 1 is instant, page 500 crawls. It's also *unstable*: if a row is inserted while a user pages, rows shift and they see a duplicate or skip one.

**Keyset pagination** (also called cursor or seek pagination) instead remembers the last row seen and asks for rows *after* it:

```sql
-- First page
SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT 20;

-- Next page: pass the last row's (created_at, id) as a cursor
SELECT * FROM posts
WHERE (created_at, id) < ('2026-05-01 10:00:00', 8423)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

The `WHERE` uses a B-tree index to jump straight to the cursor position, so **every page is equally fast** regardless of depth. The trade-off: you can't jump to an arbitrary page number, only "next"/"previous". Include a unique tie-breaker (`id`) in the order so the cursor is unambiguous.

| | Offset | Keyset |
|---|---|---|
| Deep-page speed | degrades linearly | constant |
| Jump to page N | yes | no |
| Stable under inserts | no | yes |

## Common Anti-Patterns

- **`SELECT *` in application code** — fetches columns you don't use (wasting I/O and bandwidth) and breaks index-only scans. List the columns you need.
- **Functions on indexed columns** — `WHERE date_trunc('day', ts) = '2026-05-01'` can't use an index on `ts`. Rewrite as a range: `WHERE ts >= '2026-05-01' AND ts < '2026-05-02'`. Such index-friendly conditions are called *sargable*.
- **Implicit type casts** — comparing an indexed column to a mismatched type can silently force a cast that disables the index.
- **Leading-wildcard `LIKE`** — `'%term'` can't use a B-tree; use full-text search or trigram indexes.
- **`OR` across columns** — sometimes prevents index use; a `UNION ALL` of two indexed queries can be far faster.
- **Counting everything for pagination** — `SELECT COUNT(*)` over a huge filtered set on every page is expensive; consider an estimate (`reltuples`) or removing exact counts from the UI.

<Callout type="tip">

**Make conditions sargable.** A "sargable" predicate is one the planner can satisfy with an index range. The mechanical rule: keep the indexed column *bare* on one side of the comparison and do any transformation on the *literal* side. `WHERE price > 100 * 1.2` is sargable; `WHERE price / 1.2 > 100` is not.

</Callout>

## When to Denormalize

Normalization (chapter 9) is the right default — it prevents update anomalies and keeps data consistent. But sometimes a read is so hot, and the join so expensive, that storing redundant data wins. Denormalize *deliberately* when:

- A heavily-read value requires joining many tables every time (e.g. a cached `comment_count` on `posts` instead of `COUNT`-ing comments on each page load).
- An aggregate is read far more than it's written — maintain it with a trigger or in application code.
- A materialized view can precompute an expensive report and refresh periodically: `CREATE MATERIALIZED VIEW ... ; REFRESH MATERIALIZED VIEW CONCURRENTLY ...`.

The cost is consistency: every denormalized copy is another thing that can drift from the source of truth. Only pay it when measurement proves the join is the bottleneck.

## Connection and Statement Considerations

Performance isn't only about the query text:

- **Connection pooling.** Postgres connections are heavyweight (each is a process). Opening one per request exhausts the server. Put a pooler (PgBouncer, or your framework's pool) in front and reuse connections.
- **Prepared statements** let the database parse and plan a query once and reuse the plan, saving overhead on hot paths — but a cached generic plan can occasionally be worse than one planned for specific parameters.
- **Batch writes.** Inserting 10,000 rows with one multi-row `INSERT` (or `COPY`) is vastly faster than 10,000 single-row inserts, each with its own round trip and transaction.
- **Keep transactions short.** As chapter 6 noted, long transactions hold locks and block `VACUUM`, causing bloat that slows *everything* over time.

## A Diagnostic Checklist

1. Identify the slow query from `pg_stat_statements` (by total time, not just per-call time — a fast query called a million times can dominate).
2. `EXPLAIN (ANALYZE, BUFFERS)` it. Find the most expensive node.
3. Is it a missing index? A non-sargable condition? Stale stats? N+1 from the app?
4. Fix one thing. Re-run. Confirm the plan changed and time dropped.
5. Check you didn't regress write performance or add an unused index.

## Recap

Optimize by measuring: read real plans, not your assumptions. Collapse N+1 into joins, page with keyset cursors instead of deep offsets, keep conditions sargable, and denormalize only when a measured join bottleneck justifies the consistency cost. Around the query, pool connections and batch writes. Next, the foundation under all of this — designing and evolving the schema itself.
