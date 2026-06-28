---
title: 'Redis as Cache, Queue & Distributed Lock'
subtitle: 'Three workhorse patterns — and the sharp edges hiding in each.'
chapter: 6
level: 'advanced'
readingTime: '14 min'
topics: ['cache', 'queue', 'distributed lock']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Most production uses of Redis are one of three patterns: a cache in front of a slow store, a queue feeding background workers, or a lock coordinating distributed processes. Each is a few commands to start and surprisingly subtle to get right. This chapter builds all three and walks through the failure modes that bite people.

## Cache-aside

The dominant caching pattern. The application — not Redis — owns the logic: check the cache, and on a miss fetch from the database and populate the cache for next time.

```text
1. value = GET cache:product:99
2. if value exists -> return it (a "hit")
3. else (a "miss"):
     row = SELECT * FROM products WHERE id = 99
     SET cache:product:99 <serialized row> EX 300
     return row
```

In a redis-cli session the cache half looks like this:

```text
127.0.0.1:6379> GET cache:product:99
(nil)
127.0.0.1:6379> SET cache:product:99 "{\"id\":99,\"name\":\"Lamp\"}" EX 300
OK
127.0.0.1:6379> GET cache:product:99
"{\"id\":99,\"name\":\"Lamp\"}"
```

The essentials that make this safe:

- **Always set a TTL.** Bugs and missed invalidations are inevitable; a TTL caps how long stale data can live.
- **Invalidate on write.** When the underlying row changes, `DEL cache:product:99` so the next read repopulates. Deleting is safer than updating the cache in place, which can race.
- **Tolerate misses.** A cache is an optimization, not a source of truth. If Redis is down the app should fall back to the database, slower but correct.

Two classic hazards. A **cache stampede** happens when a hot key expires and a flood of concurrent requests all miss and hammer the database at once — mitigated with a short lock so only one request rebuilds, or by recomputing slightly before expiry. **Cache penetration** is repeated misses for keys that do not exist; cache a short-lived negative result (an empty marker) so the database is not queried every time. The Caching track covers these in depth.

## Simple queues with lists

A Redis list is a ready-made queue: push on one end, pop from the other. The blocking pop is what makes it practical — a worker waits efficiently instead of polling.

```text
# Producer enqueues a job
127.0.0.1:6379> LPUSH queue:emails "{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"
(integer) 1

# Worker blocks until a job is available (up to 5s), then takes it
127.0.0.1:6379> BRPOP queue:emails 5
1) "queue:emails"
2) "{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"
```

`LPUSH` + `BRPOP` gives a FIFO queue: producers add at the left, workers take from the right. `BRPOP` blocks the _client_ (not the server) until an item arrives or the timeout elapses, so workers consume no CPU while idle and pick up work the instant it lands.

This is enough for fire-and-forget jobs where occasional loss is tolerable. But notice the gap: the moment `BRPOP` returns, the job is _gone_ from Redis. If the worker crashes before finishing, that job is lost — no one knows it existed.

## Reliable queues

To survive a crashing worker you must not remove the job until it is done. `BRPOPLPUSH` (or the newer `BLMOVE`) atomically moves a job from the main queue to a per-worker _processing_ list in one step:

```text
# Atomically take a job AND record it as in-flight
127.0.0.1:6379> BRPOPLPUSH queue:emails queue:emails:processing 5
"{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"

# ...do the work...

# On success, remove it from the processing list
127.0.0.1:6379> LREM queue:emails:processing 1 "{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"
(integer) 1
```

Now a crash leaves the job sitting in `queue:emails:processing`. A recovery process (or the worker on restart) scans that list and re-queues anything stuck there beyond a timeout. This gives **at-least-once** delivery — a job may run twice if a worker dies after doing the work but before the `LREM`, so jobs should be **idempotent**.

Honestly, for anything beyond the basics, prefer **Streams with consumer groups** (chapter 5) or a battle-tested library built on Redis. They give you acknowledgements, automatic claim of stalled jobs, and visibility into pending work without you reinventing the recovery loop.

<Callout type="tip">

**Note:** The dividing question for queues is "what happens if a worker dies mid-job?" A plain `BRPOP` answers "the job is lost." `BRPOPLPUSH` plus a recovery sweep, or a Stream consumer group, answers "the job is retried." Choose based on whether losing a job is acceptable — and make jobs idempotent either way, because at-least-once means _sometimes twice_.

</Callout>

## Distributed locks

When several processes might do the same exclusive thing — run a cron job, charge a card, rebuild a cache — you need a lock they all respect. A single Redis instance gives a simple one with `SET ... NX EX`:

```text
# Acquire: set only if absent (NX), auto-expire in 30s (EX), unique token as value
127.0.0.1:6379> SET lock:reindex "owner-token-abc" NX EX 30
OK
127.0.0.1:6379> SET lock:reindex "owner-token-xyz" NX EX 30
(nil)                # someone already holds it
```

Three details are non-negotiable:

- **`NX` makes acquisition atomic.** Set-if-not-exists in a single command means two processes cannot both think they won.
- **`EX` is mandatory.** If the holder crashes without releasing, the TTL frees the lock. A lock with no expiry that outlives its owner deadlocks the system forever.
- **The value is a unique token**, so only the true owner releases it. Releasing safely requires a check-then-delete that must be atomic — and a plain `GET` then `DEL` is not, because the lock could expire and be re-acquired between the two. Use a Lua script (chapter 7):

```lua
-- release lock only if we still own it
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

### The Redlock debate

The single-instance lock has a real weakness: if that one Redis fails over to a replica that had not yet received the lock write, two clients can hold the "same" lock. **Redlock** is an algorithm to harden against this by acquiring the lock on a majority of several independent Redis masters, so one node's failure does not lose the lock.

Redlock is genuinely contested. The critique (notably by Martin Kleppmann) is that no lock based on timeouts is safe against the things that actually break locks: clock drift, long GC or stop-the-world pauses, and network delays can make a client _believe_ it still holds a lock whose TTL has already expired, while another client has taken over. The counter-argument (from Redis's author, antirez) is that Redlock is fine for the common case and that the critique demands guarantees few systems truly need.

The pragmatic position:

- For **efficiency** locks — "avoid doing this redundant work twice, but it is merely wasteful if it occasionally happens" — a single-instance `SET NX EX` lock is simple and good enough.
- For **correctness** locks — "doing this twice corrupts data or double-charges a customer" — do **not** rely on a Redis lock alone. Add a real safeguard at the resource: a fencing token (a monotonically increasing number the resource checks and rejects if stale), a unique constraint, or a conditional write in the database. The lock becomes an optimization, and correctness rests on the resource, not the timeout.

<Callout type="warning">

**Note:** No timeout-based distributed lock — Redlock included — is safe for correctness on its own, because a process can pause (GC, scheduling, a slow disk) past its lock's expiry without knowing it. If "two holders at once" would corrupt data, you need a fencing token or a database-level guarantee underneath. Treat the Redis lock as best-effort coordination, not a mutual-exclusion guarantee.

</Callout>
