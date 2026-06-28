---
title: 'Persistence: RDB & AOF'
subtitle: "How an in-memory store survives a restart, and what 'durable' really buys you."
chapter: 4
level: 'intermediate'
readingTime: '12 min'
topics: ['rdb', 'aof', 'durability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

If everything lives in RAM, a crash or restart should wipe it all — yet a well-configured Redis comes back with its data intact. It does that by writing to disk in the background. Redis offers two persistence mechanisms with different trade-offs, and understanding them is the difference between "I lost an hour of data" and "I lost the last second." This chapter explains both and how durability is really a dial, not a switch.

## What "in-memory" means for durability

The authoritative copy of your data is in RAM. Disk persistence is a _backup_ that lets Redis reconstruct that RAM image after a restart. This is the opposite of a traditional database, where disk is the source of truth and memory is a cache of it.

The consequence: between the last successful disk write and a crash, whatever was only in memory is gone. How much that window holds — zero, one second, several minutes — depends entirely on how you configure persistence. Redis does not force a choice; it gives you knobs.

## RDB: point-in-time snapshots

RDB (Redis Database) periodically saves a compact, binary snapshot of the entire dataset to a single file, typically `dump.rdb`. You configure triggers by how many writes happen in a window:

```text
# redis.conf — save a snapshot if:
save 900 1       # 900s pass with at least 1 change
save 300 10      # 300s pass with at least 10 changes
save 60 10000    # 60s pass with at least 10000 changes

127.0.0.1:6379> BGSAVE
Background saving started
127.0.0.1:6379> LASTSAVE
(integer) 1718553600
```

When a snapshot triggers, Redis calls `fork()`. The child process inherits a copy-on-write view of memory and writes it to disk while the parent keeps serving clients. Only memory pages that change during the save are duplicated, so the overhead is usually modest — though on a very large, write-heavy dataset the fork and copy-on-write churn can spike memory and latency.

**Strengths.** A single compact file, trivial to copy off the box for backups or to seed a replica. Fast restart — loading one binary file is quicker than replaying a log. Minimal runtime overhead between snapshots.

**Weakness.** It is a _point-in-time_ backup. If you snapshot every five minutes and crash four minutes in, you lose four minutes of writes. RDB alone is for data where some loss is acceptable.

## AOF: the append-only log

AOF (Append Only File) takes the opposite approach: it logs every write command to a file as it happens. On restart Redis replays the log to rebuild the exact state.

```text
# redis.conf
appendonly yes
appendfsync everysec      # fsync policy (see below)
```

The durability of AOF hinges on **when the log is flushed from the OS buffer to disk** — the `fsync` policy:

| `appendfsync` | Behavior                | Worst-case loss  | Speed          |
| ------------- | ----------------------- | ---------------- | -------------- |
| `always`      | fsync after every write | a single command | slowest        |
| `everysec`    | fsync once per second   | about one second | fast (default) |
| `no`          | let the OS decide when  | up to ~30s       | fastest        |

`everysec` is the sweet spot most deployments use: at most about one second of writes lost, with throughput close to no-fsync.

Because an append-only log grows forever, Redis periodically **rewrites** it: it forks, builds the smallest set of commands that reproduces the current dataset, and replaces the old log. `BGREWRITEAOF` triggers this manually; `auto-aof-rewrite-percentage` automates it.

```text
127.0.0.1:6379> BGREWRITEAOF
Background append only file rewriting started
```

**Strengths.** Much smaller loss window than RDB — down to one second or even one command. The log is an append-only text-ish format you can inspect and, in a pinch, repair.

**Weakness.** The file is larger than an RDB snapshot, and replaying a long log on restart is slower than loading a snapshot. With `always`, throughput drops noticeably.

<Callout type="info">

**Note:** `fsync` is the key concept behind every durability claim. Writing to a file does not mean the data is safely on disk — the OS buffers it in a page cache and writes lazily. Only `fsync` forces those bytes to the physical device. "How often do we fsync?" _is_ the durability question, for Redis and for databases generally.

</Callout>

## Combining both

RDB and AOF are not mutually exclusive, and running both is the common production choice. AOF gives you a small loss window for normal recovery; RDB gives you a compact file for fast backups and quick reseeding. When both are enabled, Redis uses the AOF on restart because it is the more complete record.

Modern Redis sharpens this with **mixed (RDB-AOF) persistence**: an AOF rewrite writes an RDB-format snapshot as the file's base, then appends new commands after it. You get fast snapshot-style loading for the bulk of the data plus the fine-grained tail of recent commands — the best of both.

```text
# redis.conf
appendonly yes
aof-use-rdb-preamble yes
```

## Recovery in practice

On startup Redis loads persistence files automatically: AOF if enabled, otherwise RDB. You can verify and inspect with:

```text
127.0.0.1:6379> INFO persistence
# Persistence
loading:0
rdb_last_save_time:1718553600
rdb_last_bgsave_status:ok
aof_enabled:1
aof_last_rewrite_time_sec:2
aof_last_bgrewrite_status:ok
```

A few operational realities:

- **Backups are snapshots of a snapshot.** Copy the `dump.rdb` (and AOF) off the host on a schedule. Persistence protects against a process crash; off-box backups protect against losing the host.
- **A corrupted AOF** can be checked and trimmed with the `redis-check-aof` tool; `redis-check-rdb` does the same for snapshots.
- **Disabling persistence entirely** is valid for a pure cache where the source of truth is elsewhere. With `save ""` and `appendonly no`, a restart starts empty — which is fine if the cache simply refills from the database.

<Callout type="tip">

**Note:** Match persistence to the role. A **cache** in front of a database often needs none — losing it just means a cold start. A queue or a primary store needs AOF with `everysec` at minimum, plus RDB for backups. Decide by asking: if this instance died right now, what would it cost to lose the last second, the last minute, or all of it?

</Callout>
