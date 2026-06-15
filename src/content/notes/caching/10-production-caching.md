---
title: "Production Caching"
subtitle: "Monitoring hit ratios, detecting hot keys, handling Redis failures gracefully, and knowing when to flush everything."
chapter: 10
level: "advanced"
readingTime: "14 min"
topics: ["monitoring", "hot keys", "circuit breaker", "graceful degradation", "observability"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Production Caching Is Different

A cache that works in development will fail in production in ways that are hard to predict: memory exhaustion, hot key contention, network partitions, stale data cascades, and cold-start storms. The difference between a cache that helps and one that creates incidents is operational discipline.

The problem production caching solves differently from development: how do you know the cache is actually working? How do you degrade gracefully when it fails? How do you respond to anomalies before they become outages?

<Callout type="info">

**Real-World Analogy**

A restaurant that caches pre-made meals is efficient — until the kitchen runs out of containers, the stored meals go bad, or one dish becomes so popular that everyone wants it at once. Production caching requires the same operational awareness: inventory monitoring, freshness checks, and a plan for when the system is overwhelmed.

</Callout>

## Observability

### Hit Ratio

The single most important metric. Track it continuously.

```typescript
class ObservableCache {
  private metrics = {
    hits: 0,
    misses: 0,
    errors: 0,
    latencyMs: [] as number[],
  };

  async get(key: string): Promise<string | null> {
    const start = Date.now();
    try {
      const value = await this.redis.get(key);
      const latency = Date.now() - start;
      this.metrics.latencyMs.push(latency);

      if (value !== null) {
        this.metrics.hits++;
        this.recordMetric('cache.hit', 1, { key: this.keyPrefix(key) });
      } else {
        this.metrics.misses++;
        this.recordMetric('cache.miss', 1, { key: this.keyPrefix(key) });
      }
      return value;
    } catch (err) {
      this.metrics.errors++;
      this.recordMetric('cache.error', 1);
      throw err;
    }
  }

  hitRatio(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total === 0 ? 0 : this.metrics.hits / total;
  }

  p99LatencyMs(): number {
    const sorted = [...this.metrics.latencyMs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  }

  private keyPrefix(key: string): string {
    return key.split(':').slice(0, 2).join(':'); // e.g., "user:profile"
  }
}
```

**Alert thresholds:**
- Hit ratio drops below 80%: investigate (cold start? cache poisoning? new access pattern?)
- Hit ratio drops below 50%: page on-call
- Eviction rate > 0 and rising: cache undersized, add memory or reduce TTLs
- Cache latency p99 > 5ms: network issue or hot key contention

### Redis INFO

```bash
redis-cli INFO stats | grep -E "keyspace|evicted|expired|commands"
redis-cli INFO memory | grep -E "used_memory|maxmemory|mem_fragmentation"
redis-cli INFO replication | grep -E "role|connected|lag"

# Key metrics to export to your monitoring system
keyspace_hits      # total cache hits (counter)
keyspace_misses    # total cache misses (counter)
evicted_keys       # keys evicted due to maxmemory (counter)
expired_keys       # keys expired by TTL (counter)
used_memory        # current memory usage
maxmemory          # configured limit
connected_clients  # open connections
```

```typescript
// Collect Redis metrics every 30 seconds
async function collectRedisMetrics(): Promise<void> {
  const info = await redis.info('stats');
  const lines = info.split('\r\n');
  const metrics: Record<string, number> = {};

  for (const line of lines) {
    const [key, value] = line.split(':');
    if (key && value) metrics[key.trim()] = parseFloat(value.trim());
  }

  const hitRatio = metrics.keyspace_hits /
    (metrics.keyspace_hits + metrics.keyspace_misses || 1);

  gauge('redis.hit_ratio', hitRatio);
  gauge('redis.evicted_keys', metrics.evicted_keys);
  gauge('redis.connected_clients', metrics.connected_clients);
  gauge('redis.used_memory_bytes', metrics.used_memory);
}

setInterval(collectRedisMetrics, 30_000);
```

## Hot Key Detection

A hot key is one that receives a disproportionate fraction of all requests — often a viral piece of content or a shared session. It creates a bottleneck on the node hosting that key.

```bash
# Built-in hot key analysis (requires LFU policy)
redis-cli --hotkeys

# Real-time command monitor (dev only — high overhead)
redis-cli MONITOR | grep GET | awk '{print $4}' | sort | uniq -c | sort -rn | head -20

# Slowlog for detecting expensive commands
redis-cli SLOWLOG GET 10
redis-cli CONFIG SET slowlog-log-slower-than 1000  # log commands > 1ms
```

```typescript
// Detect hot keys in your application layer
class HotKeyDetector {
  private counts = new Map<string, number>();
  private window = 60_000; // 1 minute
  private threshold = 1000; // requests/minute = hot

  record(key: string): void {
    const prefix = key.split(':').slice(0, 2).join(':');
    this.counts.set(prefix, (this.counts.get(prefix) ?? 0) + 1);
  }

  getHotKeys(): string[] {
    return [...this.counts.entries()]
      .filter(([, count]) => count > this.threshold)
      .map(([key]) => key);
  }
}
```

**Mitigating hot keys:**

```typescript
// Strategy 1: local in-process cache for hot keys
const localHotCache = new Map<string, { value: string; expiresAt: number }>();

async function getWithLocalFallback(key: string): Promise<string | null> {
  const local = localHotCache.get(key);
  if (local && Date.now() < local.expiresAt) return local.value;

  const value = await redis.get(key);
  if (value) {
    localHotCache.set(key, { value, expiresAt: Date.now() + 1000 }); // 1s local
  }
  return value;
}

// Strategy 2: key fanning for read-heavy keys
const FAN_COUNT = 10;

async function getHotValue(baseKey: string): Promise<string | null> {
  const shard = Math.floor(Math.random() * FAN_COUNT);
  return redis.get(`${baseKey}:shard:${shard}`);
}

async function setHotValue(baseKey: string, value: string, ttl: number): Promise<void> {
  // Write to all shards
  await Promise.all(
    Array.from({ length: FAN_COUNT }, (_, i) =>
      redis.setEx(`${baseKey}:shard:${i}`, ttl, value),
    ),
  );
}
```

## Graceful Degradation

Your application should work when Redis is down — just slower.

```typescript
class ResilientCache {
  private healthy = true;
  private consecutiveErrors = 0;
  private readonly ERROR_THRESHOLD = 5;
  private readonly RECOVERY_MS = 30_000;

  async get<T>(key: string, fallback: () => Promise<T>): Promise<T> {
    if (!this.healthy) {
      return fallback(); // circuit open — go straight to DB
    }

    try {
      const cached = await this.redis.get(key);
      this.consecutiveErrors = 0;

      if (cached) return JSON.parse(cached);
      return this.loadAndCache(key, fallback);
    } catch (err) {
      this.consecutiveErrors++;

      if (this.consecutiveErrors >= this.ERROR_THRESHOLD) {
        this.openCircuit();
      }

      // Degrade gracefully: fetch from source
      return fallback();
    }
  }

  private openCircuit(): void {
    this.healthy = false;
    console.error('Redis circuit breaker opened');

    setTimeout(() => {
      this.healthy = true;
      this.consecutiveErrors = 0;
      console.info('Redis circuit breaker closed (attempting recovery)');
    }, this.RECOVERY_MS);
  }

  private async loadAndCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const value = await loader();
    // Fire-and-forget cache population — don't let cache errors block the response
    this.redis.setEx(key, 300, JSON.stringify(value)).catch(() => {});
    return value;
  }
}
```

<Callout type="warning">

**Never make your application unavailable because Redis is unavailable.** Cache is a performance optimization, not a system of record. When the cache is down, your application should be slower, not broken.

</Callout>

## Cache Flush Strategy

Sometimes you need to flush everything — bad data was cached, a critical bug wrote corrupt values, a deploy changed data shape.

```typescript
// Flush by pattern (never use KEYS in production — blocks Redis)
async function flushByPattern(pattern: string): Promise<number> {
  let deleted = 0;
  let cursor = 0;

  do {
    // SCAN is non-blocking — iterates in batches
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = result.cursor;

    if (result.keys.length > 0) {
      await redis.del(...result.keys);
      deleted += result.keys.length;
    }
  } while (cursor !== 0);

  return deleted;
}

// Flush all user cache entries
await flushByPattern('user:*');

// Flush a specific namespace
await flushByPattern('catalog:product:*');
```

**Version-based global flush** (better than FLUSHDB):

```typescript
// Increment a global cache version — all existing keys become stale
async function globalCacheFlush(): Promise<void> {
  await redis.incr('cache:global:version');
}

function versionedKey(key: string, version: number): string {
  return `v${version}:${key}`;
}

async function get(key: string): Promise<string | null> {
  const version = parseInt(await redis.get('cache:global:version') ?? '1');
  return redis.get(versionedKey(key, version));
}
```

## Connection Pool Management

Unconfigured connection pools are a common source of Redis outages.

```typescript
const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 500,    // fail fast if Redis is unreachable
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Max retries exceeded');
      return Math.min(retries * 100, 3000); // exponential backoff, max 3s
    },
  },
  pingInterval: 10_000, // detect dead connections
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
  metrics.increment('redis.connection_error');
});

redis.on('reconnecting', () => {
  console.warn('Redis reconnecting...');
});
```

## Pre-Deploy Checklist

Before deploying a service that uses Redis heavily:

```
□ maxmemory set with appropriate policy (allkeys-lru for pure cache)
□ TTL set on every key — no immortal cache entries
□ Circuit breaker implemented — app degrades when Redis down
□ Hit ratio monitored and alerted
□ Eviction rate monitored and alerted
□ Hot key detection in place for high-traffic keys
□ SCAN used instead of KEYS for iteration
□ Connection pool configured with timeouts and reconnect strategy
□ Cache flush procedure documented and tested
□ No FLUSHALL/FLUSHDB in application code — only in runbooks
```

