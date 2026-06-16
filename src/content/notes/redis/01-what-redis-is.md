---
title: "What Redis Is & the Core Model"
subtitle: "An in-memory key-value store with a single-threaded event loop and a dead-simple wire protocol."
chapter: 1
level: "beginner"
readingTime: "11 min"
topics: ["redis", "in-memory", "single-threaded"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What Redis actually is

Redis stands for **RE**mote **DI**ctionary **S**erver. At its heart it is a dictionary — a map from keys to values — that lives in RAM and is reachable over the network. Where a plain hash map holds only opaque blobs, Redis values are themselves rich data structures: strings, lists, hashes, sets, sorted sets, and more. The server understands these structures and exposes operations on them, so the work happens next to the data instead of being shipped to your application.

Because the entire dataset lives in memory, reads and writes are measured in microseconds, not milliseconds. There is no disk seek on the hot path. Disk is used only for durability (covered in chapter 4), never to serve a normal request.

## Why it is fast

Three design choices explain most of Redis's speed.

- **Everything is in memory.** RAM access is roughly a hundred thousand times faster than a random disk seek. Redis trades the cost of memory for the speed of memory.
- **A single-threaded command loop.** One thread executes commands one at a time, in order. This sounds like a limitation, and for raw CPU parallelism it is. But it means there are no locks, no mutexes, and no contention on the data structures. Each command runs to completion atomically with respect to other commands. The simplicity is itself a performance feature.
- **An efficient event loop and a tiny protocol.** Redis multiplexes thousands of client connections on that one thread using an event loop (epoll/kqueue under the hood). Parsing the protocol is nearly free.

A single-threaded core does not mean a single process. Modern Redis offloads some work — closing connections, certain deletes, and persistence — to background threads, and you run multiple Redis processes to use multiple cores. But the logical model you reason about is: one command at a time, atomic, no surprises.

<Callout type="tip">

**Note:** Because commands are atomic and serialized, you never need a lock to make a single Redis command safe. The trouble starts only when a *business operation* spans several commands — that is what transactions and Lua scripting (chapter 7) are for.

</Callout>

## The single-threaded event loop, concretely

Imagine three clients hit the server at the same instant with `INCR counter`. With a naive multithreaded store you would worry about a lost update — two threads read the same value and both write back. In Redis there is no race: the loop picks one command, runs it fully, then the next, then the next. The counter ends at the right value with no locking code anywhere. This is the mental model to keep: **a queue of commands, drained one at a time.**

The flip side: a slow command blocks every other client until it finishes. A single `KEYS *` over a million keys, or a giant sorted-set range, can stall the whole server. Avoiding O(N) commands on big collections is a recurring theme in this track.

## The RESP protocol

Clients talk to Redis using **RESP** (REdis Serialization Protocol). It is text-based and human-readable, which is why you can debug it with plain `telnet` or `nc`. Each type is prefixed by a single byte:

```text
+   simple string   -> +OK\r\n
-   error           -> -ERR unknown command\r\n
:   integer         -> :1000\r\n
$   bulk string     -> $5\r\nhello\r\n
*   array           -> *2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
```

A command is sent as an array of bulk strings. `SET name redis` goes over the wire as:

```text
*3\r\n$3\r\nSET\r\n$4\r\nname\r\n$5\r\nredis\r\n
```

You rarely write this by hand — a client library does it — but knowing the shape demystifies what `redis-cli` is doing and explains why pipelining (sending many commands before reading replies) is such an easy win: the protocol has no per-command handshake.

## Installing and connecting

On most systems Redis installs in one line, and `redis-cli` is the interactive client:

```bash
# macOS
brew install redis
redis-server &        # start the server (foreground without &)

# Debian / Ubuntu
sudo apt-get install redis-server

# Connect
redis-cli
redis-cli -h 127.0.0.1 -p 6379
```

A first session looks like this. The lines after each command are the server's replies:

```text
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET greeting "hello world"
OK
127.0.0.1:6379> GET greeting
"hello world"
127.0.0.1:6379> APPEND greeting "!"
(integer) 12
127.0.0.1:6379> GET greeting
"hello world!"
127.0.0.1:6379> DEL greeting
(integer) 1
127.0.0.1:6379> EXISTS greeting
(integer) 0
```

`PING` is the health check, `SET`/`GET` the workhorses, and the `(integer)` replies are RESP integers — `DEL` returns how many keys it removed, `EXISTS` returns a count.

## When to use Redis (and when not to)

Redis shines when access is fast and the data fits in memory:

- **Caching** the results of expensive queries or computations.
- **Session storage** for web apps.
- **Rate limiting** and counters, using atomic increments.
- **Queues and job brokers** with lists and streams.
- **Leaderboards and ranking** with sorted sets.
- **Ephemeral real-time data** like presence, typing indicators, and short-lived locks.

Reach for a traditional database instead when:

- Your working set is far larger than affordable RAM and most of it is cold.
- You need rich ad-hoc queries, joins, and a query planner.
- You need the strict, multi-row, roll-backable transactions of a relational engine.
- The data is the source of truth and losing the last second of writes is unacceptable without careful durability tuning.

<Callout type="info">

**Note:** "In-memory" does not have to mean "volatile." Redis can persist to disk and reload on restart (chapter 4). But its durability guarantees are weaker and more configurable than a relational database's, so for a true system of record it is usually paired with one, not used as a replacement.

</Callout>

The right framing: Redis is a **toolbox of fast data structures over the network**, not a drop-in for your primary database. The rest of this track is about learning the tools well enough to pick the right one.
