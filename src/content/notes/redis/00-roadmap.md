---
title: "Redis — Roadmap"
subtitle: "An in-memory data structure store: cache, queue, lock, and primary store all in one."
chapter: 0
level: "beginner"
readingTime: "5 min"
topics: ["roadmap", "redis"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A well-organized kitchen pass: the line cook doesn't run to the walk-in fridge for every order. The most-used ingredients sit in labelled containers within arm's reach, each shaped for its job — a deep bin for stock, a flat tray for garnish, a sorted rack for plating. Redis is that pass for your data: many specialized in-memory structures, each tuned to a different access pattern, all a microsecond away.

</Callout>

## What you will be able to do

By the end of this track you will understand Redis well enough to use it deliberately rather than as a magic black box. You will know which of its data structures fits which problem, how to control memory and expiration, how it survives a restart, and how it behaves under replication and failure. You will be able to build a cache, a work queue, and a distributed lock, write atomic multi-step operations with Lua, and reason about what can go wrong in production.

## Prerequisites

You should be comfortable on a command line and understand basic client-server networking. A little knowledge of how databases store data helps but is not required.

This track pairs naturally with three others on this site:

- **Caching** — Redis is the most common shared cache; that track covers strategies and invalidation in depth.
- **NoSQL** — Redis is a key-value store; the NoSQL track frames where it sits among other non-relational models.
- **Background Jobs** — Redis backs many job queues; that track covers the worker side of the patterns introduced here.

## Chapters in this track

1. **What Redis Is & the Core Model** — in-memory key-value store, the single-threaded event loop, why it is fast, the RESP protocol, and connecting with redis-cli.
2. **Core Data Structures** — strings, hashes, lists, sets, sorted sets, plus bitmaps, HyperLogLog, and geo, each with commands and a real use.
3. **Keys, Expiration & Eviction** — key naming, TTLs, lazy vs active expiration, maxmemory policies, and why SCAN beats KEYS.
4. **Persistence: RDB & AOF** — snapshots, the append-only log, fsync policies, and what durability really means for an in-memory store.
5. **Pub/Sub & Streams** — fire-and-forget messaging, durable Streams, consumer groups, and when you need a real broker instead.
6. **Redis as Cache, Queue & Distributed Lock** — cache-aside, list-based queues, reliable queues, and the distributed-lock debate.
7. **Transactions & Lua Scripting** — MULTI/EXEC/WATCH, why these are not rollback transactions, and atomic scripting with EVAL.
8. **Replication, Sentinel & Cluster** — primary/replica replication, Sentinel for failover, hash-slot sharding, and consistency trade-offs.
9. **Operating Redis in Production** — memory and fragmentation, the slow log, key metrics, big-key avoidance, security, and common pitfalls.

Work through them in order the first time. Afterwards each chapter stands alone as a reference.
