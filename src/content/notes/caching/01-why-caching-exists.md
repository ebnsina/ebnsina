---
title: "Why Caching Exists"
subtitle: "The latency gap between memory, disk, and network — and why every fast system exploits it."
chapter: 1
level: "beginner"
readingTime: "10 min"
topics: ["latency", "memory hierarchy", "cache fundamentals", "performance"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Speed Gap

Your CPU can read from L1 cache in **0.5 nanoseconds**. Reading from RAM takes ~100ns. Hitting a local SSD is ~100 microseconds. A network round-trip to a database server in the same datacenter? ~500 microseconds to a few milliseconds. Crossing a continent: 100ms+.

That's a six-order-of-magnitude difference between L1 cache and a transatlantic request.

| Storage | Latency | Relative |
|---------|---------|----------|
| L1 CPU cache | 0.5 ns | 1x |
| L2 CPU cache | 5 ns | 10x |
| RAM | 100 ns | 200x |
| NVMe SSD | 100 µs | 200,000x |
| Network (same DC) | 500 µs | 1,000,000x |
| Network (cross-region) | 100 ms | 200,000,000x |

Caching is the art of **storing results closer to where they're needed**, trading memory space for time.

<Callout type="info">

**Real-World Analogy**

A chef who walks to the warehouse every time they need salt will be slow. One who keeps a small container on the counter is fast. The pantry is RAM, the warehouse is the database, the counter is cache. You don't store everything on the counter — just what you reach for constantly.

</Callout>

## What Makes Something Cacheable

Not everything should be cached. Good cache candidates are:

- **Expensive to compute** — database aggregations, ML inference, rendering
- **Read frequently** — user profiles, product catalog, configuration
- **Rarely changes** — or changes in predictable ways you can invalidate
- **Tolerable when slightly stale** — most reads can accept 1s, 1m, or even 1h of staleness

Bad cache candidates:

- Data that must be real-time (stock prices, live inventory counts)
- Data unique per request with no repetition
- Data that changes every write and is read once

## The Cache Hit Ratio

The fundamental metric. If 95 out of 100 requests are served from cache, your hit ratio is 95%. The higher the ratio, the less work your database does.

```typescript
class CacheMetrics {
  private hits = 0;
  private misses = 0;

  recordHit() { this.hits++; }
  recordMiss() { this.misses++; }

  hitRatio(): number {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return this.hits / total;
  }

  // A 95% hit ratio means your DB sees 1/20th the read load
  effectiveDbLoad(): number {
    return 1 - this.hitRatio();
  }
}
```

A 95% hit ratio sounds good. Moving from 95% to 99% cuts database load by another 80%. The last few percentage points matter enormously at scale.

## Cache Miss Anatomy

Every cache miss has a cost: the time to fetch from the origin plus the time to populate the cache.

```typescript
async function getUser(id: string): Promise<User> {
  // 1. Check cache (~0.5ms)
  const cached = await cache.get(`user:${id}`);
  if (cached) return JSON.parse(cached); // cache hit — done

  // 2. Cache miss — fall through to DB (~5ms)
  const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);

  // 3. Populate cache for next time
  await cache.set(`user:${id}`, JSON.stringify(user), { ttl: 300 });

  return user;
}
```

The first caller pays the full cost. Subsequent callers pay almost nothing.

## Where Caches Live

Caches exist at every layer of a system:

**Browser** — HTTP cache (`Cache-Control`, `ETag`). Zero server cost for repeat visits.

**CDN** — Cloudflare, Fastly, Akamai. Assets and API responses cached at the network edge, close to users.

**Application** — In-process dictionary/LRU (`Map`, `lru-cache`). Zero network hop. Lost on restart.

**Distributed cache** — Redis, Memcached. Shared across all app instances. Survives restarts. Slightly slower than in-process.

**Database query cache** — Some databases cache query results internally. Postgres dropped this in v16; MySQL has it. Generally unreliable — usually better to cache at the application layer.

```
User → Browser cache
     → CDN edge cache
     → Load balancer
     → App server (in-process cache)
     → Redis (distributed cache)
     → Database
```

<Callout type="tip">

**Start with in-process caching.** A simple `Map` with a TTL is often enough to eliminate 80% of database load for read-heavy workloads. Add Redis only when you need the cache to be shared across multiple app instances.

</Callout>

## The Simplest Cache

```typescript
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SimpleCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  set(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

// Usage
const cache = new SimpleCache<User>();

async function getUser(id: string): Promise<User> {
  const cached = cache.get(`user:${id}`);
  if (cached) return cached;

  const user = await db.findUser(id);
  cache.set(`user:${id}`, user, 60); // cache for 60s
  return user;
}
```

This is where most applications should start. No dependencies, no ops burden, immediate impact.

## When Caching Goes Wrong

Caching introduces complexity. The two failure modes that bite everyone:

**Stale data** — you serve a cached value after the underlying data changed. The user sees their old username for a minute after updating it.

**Cache stampede** — the cache expires for a popular key, and 1000 concurrent requests all miss and hit the database simultaneously, bringing it to its knees.

Both are solvable. Later chapters cover them in depth. For now, know that caching is not free — it trades consistency for performance, and you need to manage that trade deliberately.

<Callout type="warning">

**Cache is not a backup for a slow database.** If your queries are slow because they're missing indexes or doing full table scans, fix the queries first. Cache can hide the problem, but it won't survive a cache flush or a traffic spike that misses the cache.

</Callout>

## Summary

- The latency gap between RAM and network is enormous — caching exploits it
- Good cache candidates: expensive, read-heavy, tolerably stale
- Hit ratio is the key metric — even 99% is meaningfully better than 95%
- Caches exist at every layer: browser, CDN, application, distributed, database
- Start simple (in-process Map), add Redis when you need shared state

