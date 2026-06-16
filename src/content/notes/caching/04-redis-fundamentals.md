---
title: "Redis Fundamentals"
subtitle: "Data structures, core commands, persistence modes — everything you need to run Redis confidently in production."
chapter: 4
level: "intermediate"
readingTime: "18 min"
topics: ["Redis", "data structures", "persistence", "commands", "pub/sub"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A Swiss Army knife — not just a key-value store, but a toolbox of data structures each shaped for a specific job.

</Callout>

## What Redis Is

Redis is an in-memory data structure server. Not just a key-value store — it understands Strings, Lists, Sets, Sorted Sets, Hashes, Streams, and more. This matters: the right data structure eliminates application-level logic and reduces round trips.

It's single-threaded for command execution, which gives it predictable latency and no locking. A single Redis instance handles ~100,000 operations per second on modest hardware.

## Core Data Structures

### Strings

The simplest type. Stores text, numbers, or binary data up to 512MB. Also supports atomic increment/decrement.

```bash
SET user:1:name "Fatima"
GET user:1:name           # "Fatima"
SET counter 0
INCR counter              # 1
INCRBY counter 10         # 11
SETNX user:1:name "Omar"  # 0 — key exists, no-op
SETEX session:abc 3600 "data"  # set with TTL in one command
```

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

await redis.set('user:1:name', 'Fatima');
await redis.setEx('session:abc', 3600, JSON.stringify(sessionData));

const name = await redis.get('user:1:name');
const count = await redis.incr('counter');
```

### Hashes

A map of field → value inside a single key. Perfect for storing objects without serializing to JSON.

```bash
HSET user:1 name "Fatima" email "fatima@example.com" age 30
HGET user:1 name           # "Fatima"
HGETALL user:1             # { name, email, age }
HINCRBY user:1 age 1       # 31
HDEL user:1 age
```

```typescript
await redis.hSet('user:1', {
  name: 'Fatima',
  email: 'fatima@example.com',
  age: '30',
});

const user = await redis.hGetAll('user:1');
// { name: 'Fatima', email: 'fatima@example.com', age: '30' }
```

**Hash vs JSON string:** Hashes let you update individual fields without deserializing the whole object. Use hashes when you frequently update partial objects. Use JSON strings when you always read the whole object.

### Lists

Ordered sequences. Push/pop from either end. Used for queues, activity feeds, and job lists.

```bash
RPUSH jobs "job:1" "job:2" "job:3"   # push to right (tail)
LPOP jobs                             # pop from left (head) → "job:1"
LRANGE jobs 0 -1                      # all elements
LLEN jobs                             # length

# Blocking pop — waits up to 30s for an element
BLPOP jobs 30
```

```typescript
// Simple job queue
async function enqueue(job: Job): Promise<void> {
  await redis.rPush('jobs', JSON.stringify(job));
}

async function dequeue(): Promise<Job | null> {
  // Block for up to 5 seconds waiting for a job
  const result = await redis.blPop('jobs', 5);
  if (!result) return null;
  return JSON.parse(result.element);
}
```

### Sets

Unordered unique members. Fast membership checks, unions, intersections.

```bash
SADD tags:post:1 "typescript" "backend" "redis"
SISMEMBER tags:post:1 "redis"   # 1 (true)
SISMEMBER tags:post:1 "golang"  # 0 (false)
SMEMBERS tags:post:1            # all members
SCARD tags:post:1               # count: 3

# Set operations
SUNION tags:post:1 tags:post:2  # union
SINTER tags:post:1 tags:post:2  # intersection
```

### Sorted Sets

Like Sets but each member has a score (float). Members are ordered by score. Used for leaderboards, rate limiting, and priority queues.

```bash
ZADD leaderboard 1500 "fatima" 1200 "omar" 1800 "maryam"
ZRANK leaderboard "fatima"           # rank (0-indexed): 1
ZREVRANK leaderboard "maryam"        # top rank: 0
ZRANGE leaderboard 0 2 WITHSCORES  # top 3
ZINCRBY leaderboard 50 "fatima"      # fatima score → 1550
```

```typescript
// Rate limiter using sorted set
async function isRateLimited(userId: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `ratelimit:${userId}`;

  await redis
    .multi()
    .zRemRangeByScore(key, '-inf', windowStart) // remove old entries
    .zAdd(key, { score: now, value: `${now}` }) // add current request
    .expire(key, Math.ceil(windowMs / 1000))    // auto-cleanup
    .exec();

  const count = await redis.zCard(key);
  return count > limit;
}
```

## Expiration

Set TTL at creation time or add it later:

```bash
SET session:abc "data" EX 3600     # seconds
SET session:abc "data" PX 3600000  # milliseconds
EXPIRE session:abc 3600            # set TTL on existing key
TTL session:abc                    # seconds remaining (-1 = no TTL, -2 = gone)
PERSIST session:abc                # remove TTL, make permanent
```

<Callout type="tip">

**Always set a TTL on cache keys.** The only exception is intentionally persistent data. A cache that never expires is a memory leak.

</Callout>

## Atomic Operations with Transactions

`MULTI`/`EXEC` groups commands into an atomic block. All commands run or none do — but unlike SQL, there's no rollback on individual command errors.

```typescript
async function transferPoints(from: string, to: string, points: number): Promise<void> {
  const multi = redis.multi();
  multi.decrBy(`points:${from}`, points);
  multi.incrBy(`points:${to}`, points);
  await multi.exec();
}
```

For conditional logic, use `WATCH`:

```typescript
async function compareAndSwap(key: string, expected: string, next: string): Promise<boolean> {
  await redis.watch(key);

  const current = await redis.get(key);
  if (current !== expected) {
    await redis.unwatch();
    return false;
  }

  const result = await redis
    .multi()
    .set(key, next)
    .exec();

  return result !== null; // null means WATCH key changed — transaction aborted
}
```

## Pub/Sub

Redis can act as a message broker for simple fanout use cases.

```typescript
// Publisher
const publisher = createClient();
await publisher.connect();
await publisher.publish('notifications', JSON.stringify({ userId: '123', msg: 'Hello' }));

// Subscriber
const subscriber = createClient();
await subscriber.connect();
await subscriber.subscribe('notifications', (message) => {
  const data = JSON.parse(message);
  console.log('Received:', data);
});
```

<Callout type="warning">

**Redis Pub/Sub has no persistence.** Messages sent while a subscriber is disconnected are lost. For reliable messaging, use Redis Streams or a proper message queue (Kafka, RabbitMQ).

</Callout>

## Persistence

Redis is in-memory but supports two persistence modes:

**RDB (Redis Database Backup)** — periodic snapshots of the entire dataset to disk. Fast restarts. Risk: lose changes since last snapshot.

```bash
# redis.conf
save 900 1      # snapshot if ≥1 key changed in 900s
save 300 10     # snapshot if ≥10 keys changed in 300s
save 60 10000   # snapshot if ≥10000 keys changed in 60s
```

**AOF (Append Only File)** — logs every write command. More durable. Larger files, slower restarts.

```bash
appendonly yes
appendfsync everysec   # fsync every second (good balance)
# appendfsync always   # fsync every write (slowest, most durable)
# appendfsync no       # let OS decide (fastest, least durable)
```

**Which to use:**

| | RDB | AOF |
|--|-----|-----|
| Recovery speed | Fast | Slow |
| Data loss | Up to minutes | Up to 1 second |
| File size | Small | Large |
| Use case | Cache | Session store, queues |

For a pure cache, RDB is fine — losing a few minutes of cache is acceptable since it repopulates from the DB. For sessions or queues, use AOF or disable persistence entirely and accept losing state on restart.

## Key Design

Good Redis key design prevents collisions and makes debugging easier:

```
service:entity:id:field
catalog:product:123
auth:session:abc123
ratelimit:api:user:456
leaderboard:weekly:scores
```

**Keep keys short** — Redis stores keys in memory. `u:1` vs `user:1` matters at millions of keys.

**Don't use too many keys for the same logical object** — a Hash beats 20 separate string keys for the same user object.

```typescript
// Bad: 20 keys per user
await redis.set(`user:${id}:name`, name);
await redis.set(`user:${id}:email`, email);
// ...

// Good: 1 hash per user
await redis.hSet(`user:${id}`, { name, email, age: String(age) });
```

## Monitoring

```bash
redis-cli INFO stats        # hits, misses, evictions
redis-cli INFO memory       # used_memory, maxmemory
redis-cli MONITOR           # real-time command stream (dev only)
redis-cli --latency         # latency histogram
redis-cli --hotkeys         # top accessed keys (requires maxmemory-policy LFU)
```

Key metrics to watch:

- `keyspace_hits` / `keyspace_misses` → hit ratio
- `evicted_keys` → if non-zero, your cache is undersized
- `used_memory` vs `maxmemory` → headroom
- `connected_clients` → connection pool health
- `blocked_clients` → queue depth (BLPOP waits)

