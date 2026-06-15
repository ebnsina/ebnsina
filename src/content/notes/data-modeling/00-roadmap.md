---
title: "Data Modeling — Roadmap"
subtitle: "Ten chapters that take you from 'what's a primary key' to deliberate schema design under load — keys, normalization, denormalization, constraints, multi-tenancy, JSONB, and zero-downtime evolution."
chapter: 0
level: "beginner"
readingTime: "5 min"
topics: ["roadmap", "data-modeling", "schemas", "postgres"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will be able to design Postgres schemas that match real query patterns, pick keys that age well, normalize where it helps and denormalize where it pays, encode invariants as constraints instead of application checks, model time and tenancy without painting yourself into a corner, decide when JSONB earns its keep, and run zero-downtime schema migrations on a live system.

<Callout type="info">

**Prereqs:** finish **REST API building**. The path's **Databases self-hosted** and **Background jobs** tracks lean on this one — most schema mistakes show up as either slow queries or impossible migrations later. Postgres is the reference; concepts apply to any relational database.

</Callout>

## The 10 chapters, in order

**Foundations**

1. **What data modeling is** — vs schema design, vs ORMs, vs "let's just make a table"
2. **Entities, attributes, relationships** — ER thinking before SQL
3. **Keys** — natural vs surrogate, ULID/UUID/serial, composite, when each fits
4. **Normalization** — 1NF, 2NF, 3NF in plain English, with examples

**Real-world tradeoffs**

5. **Denormalization** — why, when, and the bookkeeping cost
6. **Constraints** — NOT NULL, FK, CHECK, UNIQUE, exclusion, generated
7. **Time and soft delete** — timestamps, time zones, history tables, the soft-delete trap
8. **Multi-tenancy** — single-DB, schema-per-tenant, row-level security

**Production**

9. **JSONB and the schemaless trap** — when to use, when it bites
10. **Schema evolution** — expand/contract, zero-downtime migrations, backfills

## How to use this track

Read in order. The first four chapters are conceptual; from chapter 5 you are weighing tradeoffs against real query patterns. The last two are operational. Total reading: ~3 hours. Hands-on, with a real Postgres database: a long weekend.

You need Postgres 15+ and a SQL client (`psql`, DBeaver, TablePlus, or VS Code with the Postgres extension). Everything runs locally.

