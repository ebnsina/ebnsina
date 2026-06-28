---
title: 'Caching — Roadmap'
subtitle: 'In-process LRU first. Self-host Redis. Eviction policies, invalidation, stampedes.'
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A chef's mise en place: everything prepped and within arm's reach before service starts. The chef doesn't walk to the stockroom for each ingredient mid-service — the frequently needed things are already on the counter. Caching is mise en place for software: the data your application uses most often lives somewhere fast and close, so it doesn't have to fetch it from the database on every request.

</Callout>

## What you will learn

Caching is the single most effective performance optimization in most systems — and one of the easiest to get wrong. This track starts with why caches exist (the latency gap between memory, disk, and network), then covers every layer: in-process LRU, Redis fundamentals, eviction policies, cache invalidation strategies, stampede prevention, distributed caching with Redis Cluster, HTTP caching and CDN edge caching, and the operational patterns that keep caches reliable in production.

## Chapters in this track

1. **Why Caching Exists** — latency gap, memory hierarchy, when caching is and isn't the answer
2. **Cache Strategies** — cache-aside, read-through, write-through, write-behind — trade-offs and failure modes
3. **Eviction Policies** — LRU, LFU, TTL, random — how caches decide what to drop
4. **Redis Fundamentals** — data structures, core commands, persistence (RDB/AOF), self-hosting
5. **Cache Invalidation** — TTL, event-driven purging, versioned keys, write-through patterns
6. **Cache Stampede & Thundering Herd** — what causes it, mutex locks, probabilistic early expiration, request coalescing
7. **Distributed Caching** — consistent hashing, Redis Cluster, replication, failure modes
8. **HTTP Caching & CDN** — Cache-Control, ETags, Vary, CDN edge caching, purging
9. **Application Caching Patterns** — fragment caching, query result caching, session stores, memoization
10. **Production Caching** — monitoring hit ratios, hot keys, graceful Redis failure, when to flush
