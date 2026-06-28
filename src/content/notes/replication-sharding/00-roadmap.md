---
title: 'Replication & Sharding — Roadmap'
subtitle: 'Postgres streaming replicas by hand. Manual shard routing without Vitess.'
chapter: 0
level: 'beginner'
readingTime: '3 min'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A growing library system: one branch (primary) holds the authoritative collection. Copies (replicas) let more people read simultaneously and survive a branch fire. When the collection outgrows all branches, you split it across buildings by subject (sharding). Most libraries never need to shard — but every library should have a backup copy.

</Callout>

## What you will learn

Replication solves availability and read scale. Sharding solves write scale. This track covers both from first principles: how Postgres WAL streaming works, how to set up a standby by hand with `pg_basebackup`, the theory behind shard key selection and routing strategies, and how to build a shard router in application code without a proxy layer. The final chapter covers Postgres table partitioning — the single-server alternative that handles most use cases without the operational complexity of sharding.

## Chapters in this track

1. **Replication Fundamentals** — WAL, synchronous vs async, replication lag, read replicas in code
2. **Postgres Streaming Replication** — pg_basebackup, standby setup, manual failover, WAL archiving
3. **Sharding Concepts** — when to shard, shard key selection, range vs hash vs consistent hashing
4. **Manual Shard Routing** — shard manager, repository pattern, cross-shard operations, migrations
5. **Postgres Partitioning** — range, list, hash partitioning, pg_partman, partition pruning
