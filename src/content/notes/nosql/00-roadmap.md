---
title: "NoSQL — Roadmap"
subtitle: "Four families, one question: what are your access patterns? Key-value, document, wide-column, and graph stores explained."
chapter: 0
level: "beginner"
readingTime: "5 min"
topics: ["roadmap", "nosql"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A relational database is a single, perfectly organized filing cabinet with strict rules: every form must match a template, and cross-referencing forms requires walking between drawers. NoSQL is a workshop with the right tool for each job: a fast pegboard for things you grab constantly (key-value), labeled bins that hold a whole kit per slot (document), a giant ledger optimized for appending rows (wide-column), and a corkboard of pinned photos connected by string (graph). The skill is knowing which tool fits the work in front of you.

</Callout>

## What you will learn

NoSQL is not one technology — it is four distinct families of databases, each built around a different shape of data and a different access pattern. This track teaches you to recognize those shapes. You will learn why relational databases hit walls at scale, what trade-offs each NoSQL family makes (and what it gives up), and — most importantly — how to model data when you can no longer lean on joins and a flexible query planner.

The recurring theme is **access-pattern-first design**. In the SQL world you model the data and figure out queries later. In most NoSQL systems you do the opposite: you list the questions your application must answer, then design storage so each question is a fast lookup. Get that mindset right and NoSQL is a superpower. Get it wrong and you reinvent a slow, broken relational database on top of a store that was never meant for it.

## Prerequisites

This track pairs naturally with two others:

- **Data Modeling** — entities, relationships, normalization. You should understand what a foreign key and a join are before you learn to live without them.
- **Database Internals** — pages, indexes, the write path, and how durability works. Knowing how a B-tree differs from an LSM-tree makes the wide-column and key-value chapters click.

If you are comfortable writing SQL and understand `1NF` through `3NF` normalization, you are ready.

## Chapters in this track

1. **Why NoSQL** — where relational databases strain at scale, the four NoSQL families, ACID vs BASE, and when NOT to reach for NoSQL.
2. **Key-Value Stores** — the simplest model, Redis and DynamoDB, TTL, and the classic uses: cache, sessions, rate limiting.
3. **Document Databases** — JSON documents, MongoDB, the embedding vs referencing decision, indexing, and schema design by access pattern.
4. **Wide-Column Stores** — Cassandra and Bigtable, partition keys vs clustering keys, query-first modeling, and the write path.
5. **Graph Databases** — nodes, edges, properties, Neo4j and Cypher, traversals, and when a graph crushes a pile of joins.
6. **Data Modeling for NoSQL** — access-pattern-first design, denormalization, single-table design, and relationships without joins.
7. **Consistency & Replication in NoSQL** — tunable and eventual consistency, quorums, conflict resolution, and read repair.
8. **Choosing the Right Database** — a decision framework, polyglot persistence, common mistakes, and matching workload to store.

By the end you will not ask "is NoSQL better than SQL?" You will ask "what does this workload need, and which store gives it to me with the fewest trade-offs?"
