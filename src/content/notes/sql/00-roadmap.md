---
title: 'SQL — Roadmap'
subtitle: 'Your path from writing your first SELECT to designing schemas and shipping zero-downtime migrations.'
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap', 'sql', 'postgres']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What This Track Covers

SQL is the lingua franca of data. Almost every backend you build will eventually talk to a relational database, and the difference between a query that returns in two milliseconds and one that locks up production for thirty seconds is usually a matter of understanding what the database is actually doing under the hood.

By the end of this track you'll be able to:

- Write correct, readable queries — from simple lookups to multi-table joins, subqueries, and window functions.
- Reason about _why_ a query is slow by reading its execution plan, and fix it with the right index.
- Use transactions and isolation levels correctly so concurrent writes don't corrupt your data.
- Design normalized schemas with the right constraints, and evolve them safely while the application keeps running.

We use **PostgreSQL** as the reference dialect throughout. The core SQL concepts transfer to MySQL, SQLite, and SQL Server, but syntax details (and especially query planner behavior) differ.

## Prerequisites

You don't need prior database experience — chapter 1 starts from tables and rows. A little command-line comfort helps, since most examples assume you can run `psql` or a similar client.

<Callout type="tip">

**Pairs well with two sibling tracks.** This track focuses on the _language and usage_ of SQL. The **db-internals** track explains the machinery underneath (B-trees, the write-ahead log, MVCC) and **data-modeling** goes deeper on translating a domain into entities and relationships. Read them together for the full picture.

</Callout>

## The Chapters

1. **The Relational Model & Basic Queries** — tables, rows, columns, data types, `CREATE TABLE`, and the `SELECT` / `WHERE` / `ORDER BY` / `LIMIT` core, plus `NULL` semantics.
2. **Filtering, Grouping & Aggregation** — `COUNT` / `SUM` / `AVG`, `GROUP BY`, the difference between `HAVING` and `WHERE`, and the logical order in which a query actually runs.
3. **Joins** — `INNER`, `LEFT`, `RIGHT`, `FULL`, and `CROSS` joins, self-joins, and the classic pitfalls like fan-out and `NULL` mismatches.
4. **Subqueries & CTEs** — scalar and correlated subqueries, `IN` vs `EXISTS`, derived tables, `WITH` clauses, and recursive CTEs for tree traversal.
5. **Indexes & Query Plans** — B-tree indexes, composite and covering indexes, reading `EXPLAIN ANALYZE`, and when an index won't help at all.
6. **Transactions & Isolation Levels** — ACID, `BEGIN` / `COMMIT` / `ROLLBACK`, the four isolation levels and the anomalies they prevent, MVCC, locks, and deadlocks.
7. **Window Functions** — `OVER` / `PARTITION BY` / `ORDER BY`, ranking functions, `LAG` / `LEAD`, running totals, and frame clauses.
8. **Query Optimization & Performance** — reading plans in anger, the N+1 problem, keyset vs offset pagination, common anti-patterns, and when to denormalize.
9. **Schema Design & Migrations** — constraints, normalization in practice, generated columns, and the expand/contract pattern for zero-downtime schema changes.

## How to Use This Track

Read in order — each chapter assumes the previous ones. Type the queries out against a real database rather than just reading them; SQL rewards experimentation. Spin up a throwaway Postgres instance, load a few hundred rows of fake data, and break things. You'll learn more from one confusing query plan than from ten pages of prose.

Let's start with the foundation: what a relational table actually is.
