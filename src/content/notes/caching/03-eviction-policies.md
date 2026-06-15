---
title: "Eviction Policies"
subtitle: "LRU, LFU, TTL, and friends — how caches decide what to throw away when memory fills up."
chapter: 3
level: "beginner"
readingTime: "12 min"
topics: ["LRU", "LFU", "TTL", "eviction", "memory management"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A whiteboard that's running out of space — you erase something to write something new, and the question is what to erase.

</Callout>

## Why Eviction Matters

Caches are bounded. When a cache fills up, it must evict something to make room for new entries. The wrong eviction policy throws away hot data and keeps cold data — defeating the purpose.

The right policy depends on your access pattern:

- **Uniform random access** — any policy works, LRU is fine
- **Temporal locality** — recently used items are likely to be used again → LRU
- **Frequency skew** — a small set of items is accessed far more often → LFU
- **Time-bounded freshness** — data expires after a period regardless of use → TTL

## TTL — Time to Live

The simplest and most important mechanism. Every cache entry has an expiration time. After it, the entry is treated as a miss regardless of whether it's been accessed.

```typescript
interface CacheEntry<T> {
  value: T;
  expiresAt: number; // unix ms
}

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  set(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key); // lazy expiration
      return undefined;
    }

    return entry.value;
  }
}
```

**Lazy vs eager expiration:** Most caches expire lazily — they check TTL on access and clean up then. Redis uses a hybrid: lazy on access plus a background job that periodically samples and deletes expired keys.

<Callout type="tip">

**Choose TTL based on tolerable staleness, not gut feel.** Product catalog: 5 minutes is fine. User profile: 60 seconds. Session token: match session lifetime. Config values: 30 seconds. Price data: depends on your SLA.

</Callout>

## LRU — Least Recently Used

Evicts the entry that hasn't been accessed for the longest time. Works on the assumption that what you used recently, you'll use again soon.

```typescript
class LRUCache<K, V> {
  private capacity: number;
  private map = new Map<K, V>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;

    // Move to end (most recently used)
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Delete least recently used (first item in Map)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }
}

// JavaScript Maps maintain insertion order
// Deleting and re-inserting on access moves item to end
// First item is always LRU
const cache = new LRUCache<string, User>(1000);
```

**When LRU fails:** A full table scan or batch job that reads many unique keys will evict your hot working set, causing a cache miss storm for normal traffic. This is called **cache pollution**.

## LFU — Least Frequently Used

Evicts the entry accessed the fewest times. Protects genuinely popular items from eviction by batch jobs that access many unique keys once.

```typescript
class LFUCache<K, V> {
  private capacity: number;
  private keyToVal = new Map<K, V>();
  private keyToFreq = new Map<K, number>();
  private freqToKeys = new Map<number, Set<K>>();
  private minFreq = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    if (!this.keyToVal.has(key)) return undefined;
    this.incrementFreq(key);
    return this.keyToVal.get(key);
  }

  set(key: K, value: V): void {
    if (this.capacity <= 0) return;

    if (this.keyToVal.has(key)) {
      this.keyToVal.set(key, value);
      this.incrementFreq(key);
      return;
    }

    if (this.keyToVal.size >= this.capacity) {
      this.evict();
    }

    this.keyToVal.set(key, value);
    this.keyToFreq.set(key, 1);
    if (!this.freqToKeys.has(1)) this.freqToKeys.set(1, new Set());
    this.freqToKeys.get(1)!.add(key);
    this.minFreq = 1;
  }

  private incrementFreq(key: K): void {
    const freq = this.keyToFreq.get(key)!;
    this.keyToFreq.set(key, freq + 1);
    this.freqToKeys.get(freq)!.delete(key);

    if (this.freqToKeys.get(freq)!.size === 0) {
      this.freqToKeys.delete(freq);
      if (this.minFreq === freq) this.minFreq++;
    }

    if (!this.freqToKeys.has(freq + 1)) {
      this.freqToKeys.set(freq + 1, new Set());
    }
    this.freqToKeys.get(freq + 1)!.add(key);
  }

  private evict(): void {
    const keys = this.freqToKeys.get(this.minFreq)!;
    const evictKey = keys.values().next().value;
    keys.delete(evictKey);
    if (keys.size === 0) this.freqToKeys.delete(this.minFreq);
    this.keyToVal.delete(evictKey);
    this.keyToFreq.delete(evictKey);
  }
}
```

LFU is more complex and has a **cache pollution problem in reverse**: newly popular items start with frequency 1 and can be evicted before they prove their worth. The fix is **LFU with aging** — periodically decay all frequencies, preventing old-but-formerly-popular items from dominating.

## FIFO — First In, First Out

Evicts the oldest entry regardless of access frequency. Simple but usually not optimal — an item added 10 minutes ago and accessed every second should not be evicted over one added 9 minutes ago and never accessed.

Used when you genuinely want to keep only the most recent N items, like an event log.

## Random Replacement

Evicts a random entry. Surprisingly competitive with LRU in practice because it has zero overhead — no need to track access order. Used internally in some CPU caches.

## Redis Eviction Policies

Redis offers eight eviction policies, configured via `maxmemory-policy`:

```
noeviction        — return error when memory limit reached (default)
allkeys-lru       — evict any key using LRU
allkeys-lfu       — evict any key using LFU
allkeys-random    — evict any key randomly
volatile-lru      — evict keys with TTL set, using LRU
volatile-lfu      — evict keys with TTL set, using LFU
volatile-random   — evict keys with TTL set, randomly
volatile-ttl      — evict keys with TTL set, shortest TTL first
```

```bash
# Set in redis.conf or at runtime
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

**Which to choose:**

- **Session store / general cache:** `allkeys-lru` — evict any key by LRU, safe default
- **Skewed access (Pareto traffic):** `allkeys-lfu` — protects your top 1% of keys
- **Mix of persistent + cached data:** `volatile-lru` — only evict entries with TTL set, keep persistent keys
- **Never lose data:** `noeviction` + set maxmemory high enough, alert before it fills

<Callout type="warning">

`noeviction` does not mean "no data loss" — it means Redis returns errors on writes when full. Your application must handle those errors. For a cache, this is usually worse than eviction.

</Callout>

## Sizing Your Cache

A cache too small misses constantly. Too large wastes memory. The right size depends on your working set — the set of keys your application actually accesses regularly.

```typescript
// Instrument your cache to find the right size
class InstrumentedCache<K, V> {
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private inner: LRUCache<K, V>;

  constructor(capacity: number) {
    this.inner = new LRUCache(capacity);
  }

  get(key: K): V | undefined {
    const val = this.inner.get(key);
    if (val !== undefined) {
      this.hits++;
    } else {
      this.misses++;
    }
    return val;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      hitRatio: total === 0 ? 0 : this.hits / total,
      evictions: this.evictions,
      total,
    };
  }
}
```

A good starting heuristic: **cache your working set, not your entire dataset**. If 20% of your keys account for 80% of reads (Pareto distribution — very common), caching that 20% gives you ~80% hit ratio. You rarely need to cache everything.

## Combining TTL and LRU

Production caches combine both: entries expire after their TTL (for freshness) and the LRU policy handles memory pressure. Redis does exactly this.

```typescript
class TTLLRUCache<K, V> {
  private lru: LRUCache<K, { value: V; expiresAt: number }>;

  constructor(capacity: number) {
    this.lru = new LRUCache(capacity);
  }

  set(key: K, value: V, ttlSeconds: number): void {
    this.lru.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get(key: K): V | undefined {
    const entry = this.lru.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) return undefined; // expired
    return entry.value;
  }
}
```

TTL handles correctness (stale data). LRU handles memory (eviction under pressure). Neither alone is enough in production.

