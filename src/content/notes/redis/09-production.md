---
title: 'Operating Redis in Production'
subtitle: 'Memory, latency, monitoring, security, and the pitfalls that take instances down.'
chapter: 9
level: 'mastery'
readingTime: '14 min'
topics: ['production', 'monitoring', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Running Redis in development is trivial. Running it under real load, where one blocking command stalls thousands of clients and a runaway dataset triggers eviction storms, demands operational discipline. This final chapter is the practical knowledge that keeps a production Redis fast, safe, and predictable — what to measure, what to avoid, and how to lock it down.

## Memory management and fragmentation

Redis lives and dies by memory. `INFO memory` is the first place to look.

```text
127.0.0.1:6379> INFO memory
# Memory
used_memory_human:1.85G          # memory holding your data
used_memory_rss_human:2.10G      # memory the OS sees this process using
mem_fragmentation_ratio:1.14     # rss / used_memory
maxmemory_human:4.00G
maxmemory_policy:allkeys-lru
```

Two numbers matter most. `used_memory` is what your data needs; `used_memory_rss` is what the OS has actually given the process. Their ratio, `mem_fragmentation_ratio`, tells the story:

- **Around 1.0 to 1.5** is healthy — a little overhead from the allocator.
- **Well above 1.5** signals fragmentation: the allocator holds freed memory it cannot return, common after lots of varied-size writes and deletes. Active defragmentation with `activedefrag yes` can reclaim it gradually.
- **Below 1.0** means Redis has been swapped to disk by the OS — a serious problem, because swap turns microsecond memory access into millisecond disk access and destroys Redis's whole premise. Disable swap or set `vm.overcommit_memory = 1` and keep `maxmemory` comfortably under physical RAM.

Set `maxmemory` explicitly (chapter 3) with headroom — never let Redis assume it owns all of RAM, because the fork for persistence can transiently double memory under heavy writes.

## Finding slow commands

Because the core is single-threaded, **one** slow command delays every other client. The slow log captures commands that exceed a microsecond threshold.

```text
127.0.0.1:6379> CONFIG SET slowlog-log-slower-than 10000   # 10ms, in microseconds
OK
127.0.0.1:6379> SLOWLOG GET 2
1) 1) (integer) 14                # entry id
   2) (integer) 1718553600        # timestamp
   3) (integer) 42851             # microseconds taken
   4) 1) "KEYS"                   # the offending command
      2) "user:*"
127.0.0.1:6379> SLOWLOG RESET
OK
```

Review the slow log regularly. The usual culprits are O(N) commands over large collections: `KEYS`, big `LRANGE`/`SMEMBERS`/`HGETALL`, large `ZRANGEBYSCORE`, and unbounded `SORT`. The `LATENCY` subsystem (`LATENCY LATEST`, `LATENCY DOCTOR`) complements this by tracking latency spikes and their likely causes, including fork pauses and slow disk during persistence.

## Key metrics to monitor

Wire these into your monitoring from `INFO` and track trends, not just instantaneous values:

| Metric                   | Source                             | Watch for                     |
| ------------------------ | ---------------------------------- | ----------------------------- |
| Memory used vs maxmemory | `used_memory`, `maxmemory`         | approaching the cap           |
| Fragmentation ratio      | `mem_fragmentation_ratio`          | above 1.5, or below 1.0       |
| Hit rate                 | `keyspace_hits`, `keyspace_misses` | a falling cache hit ratio     |
| Evicted keys             | `evicted_keys`                     | rising — memory pressure      |
| Expired keys             | `expired_keys`                     | sudden changes in pattern     |
| Connected clients        | `connected_clients`                | nearing `maxclients`          |
| Blocked clients          | `blocked_clients`                  | stuck `BRPOP`/`BLPOP` workers |
| Ops per second           | `instantaneous_ops_per_sec`        | unexpected spikes             |
| Replication lag          | `master_repl_offset` vs replica    | growing lag                   |
| Rejected connections     | `rejected_connections`             | nonzero — at the limit        |

The cache hit ratio is `keyspace_hits / (keyspace_hits + keyspace_misses)`. A drop often means TTLs are too short, the working set outgrew memory, or eviction is throwing out hot keys.

## Avoiding big keys and O(N) commands

The two most common ways to wreck a production Redis are big keys and blocking commands — and they compound each other.

- **Big keys.** A single key holding millions of elements (a giant list, set, hash, or sorted set) is dangerous: any O(N) operation on it blocks the server for a long time, and deleting it with `DEL` blocks while it frees every element. Use `UNLINK` instead of `DEL` for large keys — it frees memory in a background thread. Hunt big keys with `redis-cli --bigkeys` or `MEMORY USAGE somekey`.
- **O(N) commands at scale.** `HGETALL` on a hash with a million fields, `SMEMBERS` on a huge set, `LRANGE 0 -1` on a long list — each ships and blocks proportionally to size. Iterate with the cursor commands `HSCAN`, `SSCAN`, `ZSCAN` instead, and design keys so collections stay bounded (shard a huge set across many keys, cap streams and lists with `MAXLEN`/`LTRIM`).

```text
127.0.0.1:6379> MEMORY USAGE leaderboard:global
(integer) 4823120
127.0.0.1:6379> UNLINK leaderboard:global      # non-blocking delete
(integer) 1
```

<Callout type="warning">

**Note:** Never run `KEYS`, `FLUSHALL`, or a `DEL` of a multi-million-element key against production. Each blocks the single thread long enough to time out clients and can trigger a spurious failover. Use `SCAN` to iterate, `UNLINK` to delete large keys, and `FLUSHALL ASYNC` if you must clear everything.

</Callout>

## Connection pooling

Opening a TCP connection per operation is wasteful and will exhaust `maxclients` under load. Clients should use a **connection pool**: a fixed set of reused connections handed out per operation and returned. Size the pool to your concurrency — enough connections to avoid contention, few enough to stay well under the server's `maxclients`. Watch `connected_clients` and `rejected_connections` to confirm the pool is sized right. For throughput, **pipeline** independent commands (send many before reading replies) to amortize network round-trips, which the RESP protocol makes cheap.

## Security

Redis was historically designed for trusted networks and is dangerously open by default. Lock it down.

- **Protected mode and binding.** By default Redis binds to localhost and refuses external connections without authentication (protected mode). Never expose Redis directly to the internet. Bind to private interfaces and put it behind a firewall.
- **Authentication and ACLs.** Set a strong password and, better, use **ACLs** to create users limited to specific commands and key patterns. A cache user need not run `FLUSHALL` or `CONFIG`.

```text
127.0.0.1:6379> ACL SETUSER appuser on >S3cret-pass ~cache:* +get +set +del
OK
127.0.0.1:6379> ACL WHOAMI
"default"
127.0.0.1:6379> ACL LIST
1) "user default on nopass ~* &* +@all"
2) "user appuser on #... ~cache:* +get +set +del"
```

- **Rename or disable dangerous commands.** Use `rename-command` (or ACL restrictions) to neutralize `FLUSHALL`, `CONFIG`, `DEBUG`, and `KEYS` for application users so a compromised app or a fat-fingered query cannot wipe or reconfigure the server.
- **Encrypt in transit.** Enable TLS for connections crossing untrusted networks.

<Callout type="tip">

**Note:** Treat Redis like any other datastore for access control: least privilege per client via ACLs, no internet exposure, secrets in your secret manager not in config files committed to git, and dangerous commands disabled for app users. The single most common Redis breach is an unauthenticated instance bound to a public IP — do not be that instance.

</Callout>

## Common pitfalls, collected

A checklist distilled from the whole track:

- **No `maxmemory` set** — Redis grows until the OS kills it. Always cap it.
- **Wrong eviction policy** — `allkeys-lru` on an instance holding precious data evicts what you needed. Match policy to role.
- **TTLs cleared by writes** — re-set the expiry when you overwrite a key (chapter 3).
- **Using Pub/Sub as a reliable queue** — it loses messages; use Streams or lists (chapters 5, 6).
- **Assuming transactions roll back** — they do not (chapter 7).
- **A distributed lock used for correctness without fencing** — unsafe under pauses (chapter 6).
- **Big keys and O(N) commands** — the top cause of latency spikes.
- **Treating a single instance as durable** — configure persistence and replication for the role (chapter 4, 8).
- **Exposing Redis without auth** — the classic breach.

The throughline of this entire track: Redis is fast and simple precisely because it pushes choices onto you. It does not guess your durability needs, your eviction strategy, your consistency requirements, or your security posture. Operating it well is mostly the discipline of making each of those choices deliberately — and respecting the single thread that makes it all possible.
