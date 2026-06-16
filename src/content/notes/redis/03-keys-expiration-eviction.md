---
title: "Keys, Expiration & Eviction"
subtitle: "Naming, TTLs, how Redis reclaims expired keys, and what happens when memory fills up."
chapter: 3
level: "beginner"
readingTime: "12 min"
topics: ["ttl", "expiration", "eviction"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Memory is finite, so a long-running Redis instance is really a story about keys: how you name them, how long they live, and what gets thrown away when RAM runs out. Getting this wrong leads to mysterious memory growth, stale data, or — worst — the server refusing writes. This chapter covers the full lifecycle of a key.

## Key naming conventions

Redis has no tables or namespaces, just a flat keyspace. The convention that brings order is a colon-delimited hierarchy:

```text
user:1042                 a hash for user 1042
user:1042:sessions        a set of that user's session ids
session:abc123            a session blob
cache:product:99          a cached product
leaderboard:weekly        a sorted set
rate:ip:203.0.113.5       a rate-limit counter
```

Good keys are predictable and self-documenting. A few rules pay off:

- **Use a consistent separator** (`:` by convention) and a stable `object:id:attribute` shape.
- **Keep keys reasonably short** — every key lives in RAM, and a million long keys add up. But do not sacrifice clarity for a few bytes.
- **Embed everything you need to find or expire the key.** If you cannot construct a key from data you already have, you will end up scanning for it.
- **Reserve a prefix per concern** (`cache:`, `session:`, `lock:`) so you can reason about and, if needed, find related keys.

## Setting expirations

The defining feature of a cache is that entries do not live forever. Redis attaches a TTL (time to live) to any key.

```text
127.0.0.1:6379> SET session:abc123 "user=1042" EX 3600
OK
127.0.0.1:6379> TTL session:abc123
(integer) 3600
127.0.0.1:6379> EXPIRE session:abc123 60
(integer) 1
127.0.0.1:6379> TTL session:abc123
(integer) 58
127.0.0.1:6379> PERSIST session:abc123
(integer) 1
127.0.0.1:6379> TTL session:abc123
(integer) -1
```

- `EX seconds` / `PX milliseconds` set a TTL at write time (with `SET`).
- `EXPIRE key seconds` and `PEXPIRE` add or change a TTL on an existing key. `EXPIREAT` takes an absolute Unix timestamp.
- `TTL` returns the remaining seconds, `-1` if the key exists but has no expiry, and `-2` if the key does not exist.
- `PERSIST` removes the TTL, making the key permanent again.

<Callout type="warning">

**Note:** Most write commands that *replace* a key's value also clear its TTL. If you `SET` a key that had an expiry without re-specifying `EX`, the key becomes permanent. Commands that modify in place (`HSET`, `APPEND`, `INCR`) keep the existing TTL. When in doubt, check `TTL` after a write.

</Callout>

## How expiration actually works

A key with a TTL is not deleted at the exact instant it expires. Redis uses two mechanisms together.

- **Lazy (passive) expiration.** When a client touches a key, Redis checks its TTL first. If it has expired, the key is deleted right then and the command behaves as if the key is gone. This is free for keys nobody asks for — but a key that is never accessed again would linger forever on its own.
- **Active expiration.** To reclaim those untouched keys, a background cycle runs about ten times a second, samples a batch of keys that have TTLs, deletes the expired ones, and — if too many in the sample were expired — repeats immediately. This is probabilistic, so a key may sit expired-but-present for a short while, but memory is kept from growing unbounded.

The practical consequence: never assume a key vanishes at its exact expiry second for memory-accounting purposes. For correctness it does — a read after expiry returns nothing — but the memory is freed slightly later.

## Eviction: when memory runs out

Expiration handles keys you *told* to expire. Eviction handles the harder case: memory is full and a new write arrives. You bound memory with `maxmemory`, then choose a policy for what to drop.

```text
127.0.0.1:6379> CONFIG SET maxmemory 512mb
OK
127.0.0.1:6379> CONFIG SET maxmemory-policy allkeys-lru
OK
127.0.0.1:6379> CONFIG GET maxmemory-policy
1) "maxmemory-policy"
2) "allkeys-lru"
```

The policies split along two axes: *which* keys are candidates (all keys, or only keys that have a TTL — the `volatile-` family), and *how* a victim is chosen.

| Policy | Candidates | Victim chosen by |
|---|---|---|
| `noeviction` | none | writes fail with an error |
| `allkeys-lru` | all keys | least recently used |
| `allkeys-lfu` | all keys | least frequently used |
| `allkeys-random` | all keys | random |
| `volatile-lru` | keys with a TTL | least recently used |
| `volatile-lfu` | keys with a TTL | least frequently used |
| `volatile-ttl` | keys with a TTL | nearest expiry first |
| `volatile-random` | keys with a TTL | random |

- **`noeviction`** is the safe default for a primary store: when full, writes are rejected rather than silently losing data. Reads still work.
- **LRU vs LFU.** LRU (least *recently* used) evicts what has not been touched lately. LFU (least *frequently* used) tracks an access counter and evicts what is rarely used — better when some keys are accessed in bursts then forgotten while others are steadily popular. Redis's LRU and LFU are *approximate*: they sample a handful of keys rather than maintaining a perfect global order, trading a little accuracy for a lot of speed.
- **The `volatile-` family** only evicts keys that carry a TTL. This is useful when you mix permanent data and disposable cache in one instance — but if no expirable key exists and memory is full, these policies behave like `noeviction` and writes fail.

<Callout type="tip">

**Note:** For a pure cache, `allkeys-lru` or `allkeys-lfu` is usually right — every key is disposable, so evict whatever is coldest. If the same instance also holds data you must not lose, separate the two: a different instance, or `volatile-*` plus TTLs only on the cache keys. Mixing precious and disposable data under `allkeys-*` risks evicting the data you needed.

</Callout>

## SCAN vs KEYS

You will eventually need to find keys matching a pattern. There are two ways, and only one is safe in production.

```text
127.0.0.1:6379> KEYS user:*
1) "user:1042"
2) "user:55"
... (blocks the whole server until done)

127.0.0.1:6379> SCAN 0 MATCH user:* COUNT 100
1) "176"
2) 1) "user:1042"
   2) "user:55"
127.0.0.1:6379> SCAN 176 MATCH user:* COUNT 100
1) "0"
2) 1) "user:99"
```

`KEYS` walks the **entire** keyspace in one shot. Because Redis is single-threaded, that blocks every other client for the whole scan — on a large instance, long enough to time out clients and trigger failovers. Treat `KEYS` as a debugging tool on a throwaway dataset only.

`SCAN` is the production answer. It is a cursor-based iterator: each call returns a small batch and a cursor to pass to the next call. You start at cursor `0` and stop when the returned cursor is `0` again. It never blocks the server for long, and `MATCH` filters by pattern while `COUNT` hints at batch size. The trade-off is weaker guarantees — keys added or removed mid-scan may or may not appear, though keys present for the whole scan are guaranteed to be returned. There are typed variants `HSCAN`, `SSCAN`, and `ZSCAN` for iterating large hashes, sets, and sorted sets the same way.

The rule is simple: **never run `KEYS` against production.** Reach for `SCAN`.
