---
title: 'Key-Value Stores'
subtitle: 'The simplest NoSQL model: a giant distributed hash map. Redis, DynamoDB, TTL, and the workloads where nothing beats an O(1) lookup.'
chapter: 2
level: 'beginner'
readingTime: '10 min'
topics: ['key-value', 'redis', 'dynamodb']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A coat check at a theater. You hand over your coat and get a numbered ticket. The attendant doesn't care what's in your coat, doesn't search by color or size, and can't find "all the wool coats." But hand over ticket number 47 and your coat appears instantly. A key-value store is a coat check at planetary scale: give it the key, get the value, in one step — and ask it for nothing else.

</Callout>

## The Model

A key-value store is conceptually a hash map. Each entry is a unique **key** mapped to a **value**. The store treats the value as opaque — it does not look inside it, index it, or let you query by its contents.

```text
"user:1042"           → {"name": "Zubaida", "tier": "gold"}
"session:abc123"      → {"userId": 1042, "expires": 1718500000}
"ratelimit:ip:1.2.3.4"→ 47
```

This radical simplicity is the whole point. With no query planner, no joins, and no schema, the store can be brutally fast and trivially partitioned: hash the key, and that determines which node owns it. Add nodes, rebalance the hash ranges, and you have linear horizontal scaling.

## Access Patterns

A key-value store supports essentially three operations:

- `GET key` — fetch the value for a key.
- `PUT key value` (or `SET`) — store or overwrite a value.
- `DELETE key` — remove a key.

That is the contract. There is no "find all values where tier = gold" — to support a query, you must build the index yourself by writing an extra key (for example a set named `tier:gold` listing member keys). This is your first taste of NoSQL data modeling: **if you need to look something up, you must store it under a key shaped like the question you'll ask.**

## Redis

Redis is an in-memory key-value store, prized for sub-millisecond latency. Its twist is that values are not just opaque blobs — they are **typed data structures**: strings, hashes, lists, sets, sorted sets, and more. This makes it far more than a cache.

```text
# String — a counter
INCR page:views:home          → 1, 2, 3 ...

# Hash — fields within one key
HSET user:1042 name "Zubaida" tier "gold"
HGET user:1042 tier           → "gold"

# Sorted set — a leaderboard, scored and ordered
ZADD leaderboard 4820 "zubaida"
ZADD leaderboard 5100 "alex"
ZREVRANGE leaderboard 0 9     → top 10 players by score

# List — a simple queue
LPUSH jobs "send-email:42"
RPOP jobs                     → "send-email:42"
```

Because Redis holds data in RAM, it is fast but bounded by memory size, and durability requires care (it offers snapshot and append-only-log persistence). Treat it as a high-speed working set, not your system of record, unless you have deliberately configured durability.

## DynamoDB

DynamoDB is AWS's managed key-value (and document) store. Unlike Redis, it is disk-backed, durable, and scales to enormous size with predictable single-digit-millisecond latency. Its data lives on SSDs across many partitions, and AWS handles replication and partitioning for you.

DynamoDB's key is richer than a single string. Each item has a **partition key** (which node/partition holds it) and an optional **sort key** (ordering within a partition). This lets one "key" address a _range_ of related items — the foundation of single-table design, covered in chapter 6.

```json
{
	"PK": "USER#1042",
	"SK": "PROFILE",
	"name": "Zubaida",
	"tier": "gold"
}
```

<Callout type="tip">

**Note:** Redis and DynamoDB occupy different niches. Redis is an in-memory accelerator — wickedly fast, memory-bound, often paired with another database. DynamoDB is a durable primary store that scales to terabytes with a managed operations story. "Key-value store" describes both, but you choose between them for very different reasons.

</Callout>

## TTL — Time To Live

Most key-value stores let you attach an expiry to a key. After the TTL elapses, the store deletes the key automatically. This is the killer feature for ephemeral data — you never have to write a cleanup job.

```text
# Redis: set a key that self-destructs in 1 hour
SET session:abc123 "{...}" EX 3600

# Check remaining life
TTL session:abc123            → 3599
```

DynamoDB has the same idea via a designated TTL attribute holding a Unix timestamp; AWS deletes expired items in the background. TTL turns sessions, caches, one-time tokens, and rate-limit windows into self-maintaining data.

## Common Uses

**Caching.** The original use case: store the result of an expensive query or computation under a key, with a TTL. Future requests hit the cache instead of the database. (The Caching track covers the strategies and pitfalls in depth.)

**Sessions.** Web sessions are pure key-value: the session ID is the key, the session blob is the value, and a TTL handles expiry. Storing sessions in Redis instead of application memory lets you scale your web servers horizontally without sticky sessions.

**Rate limiting.** A counter per client per time window, with the window length as the TTL.

```text
# Increment, and on first hit set a 60s window
INCR ratelimit:user:1042
EXPIRE ratelimit:user:1042 60
# If the value exceeds your limit, reject the request
```

**Feature flags, leaderboards, distributed locks, pub/sub.** Redis's data structures make all of these a few commands.

## Limitations

The strengths are the weaknesses. A key-value store gives you no way to query by value, no joins, no aggregations, and no schema enforcement. If you find yourself wanting "all sessions for users in the gold tier," you have outgrown the model — or you must denormalize that query into its own key.

It also offers weak built-in relationships. Modeling a one-to-many relationship means maintaining a key whose value is a list of other keys, and keeping that list in sync by hand. When relationships and richer queries dominate, a document or graph store is the better fit. Use key-value stores for what they do best: fast, simple lookups by a known key.
