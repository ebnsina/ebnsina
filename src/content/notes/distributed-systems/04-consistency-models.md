---
title: "Consistency Models"
subtitle: "What 'consistent' actually means: linearizable, sequential, causal, and eventual consistency, and the trade-offs along the spectrum."
chapter: 4
level: "advanced"
readingTime: "12 min"
topics: ["consistency", "linearizability", "causal"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

When data lives on several machines, "is the data consistent?" stops being a yes/no question. A **consistency model** is a precise contract between the storage system and the programmer: it says which results a read is allowed to return given the writes that came before it. Stronger models are easier to reason about but cost more in latency and availability; weaker models are cheaper and faster but push complexity onto you. This chapter walks the spectrum from strongest to weakest.

## Why a model is a contract

Without a stated model, you cannot reason about your program, because you do not know what a read can return. A consistency model removes that uncertainty by enumerating the legal outcomes. The stronger the model, the fewer surprising outcomes it permits — and the more the system has to coordinate behind the scenes to forbid them.

Two large families exist. **Data-centric** models describe the order all clients see together; **client-centric** models describe guarantees from a single client's point of view (we met some of these as read-your-writes in chapter 3). We start with the strongest data-centric model.

## Linearizability (strong consistency)

**Linearizability** is the gold standard. It makes the system behave as if there were only one copy of the data and every operation took effect **instantaneously at some point between when it was called and when it returned**. Once any client's write completes, every subsequent read — by any client — sees that write or a later one. There is a single, real-time-respecting order, and nobody ever observes a value go backward.

```text
A writes x = 1 (returns at t=5)
        ----------------------> after t=5, ANY read returns 1 (or newer)
B reads x at t=6  -> must return 1
C reads x at t=6  -> must return 1   (cannot still see the old value)
```

This is what lets you treat the distributed store like a single variable. The price is steep: to guarantee that no read ever sees stale data, the system must coordinate across replicas on the critical path of every operation, which adds latency, and — as chapter 5 shows — it cannot stay fully available during a network partition. Consensus systems (chapter 6) and `compare-and-swap` registers provide linearizability.

## Sequential consistency

Slightly weaker. **Sequential consistency** requires that all operations appear in *some* single total order, and that this order respects the order each individual client issued its own operations. The crucial difference from linearizability: this order need not match **real time**. If A writes at 10:00 and B reads at 10:01, sequential consistency permits B's read to be ordered *before* A's write, as long as every client agrees on one consistent ordering.

In practice this means all clients see the same movie, but the movie may run slightly behind real time. It is rarely offered as a standalone database guarantee but is an important rung on the conceptual ladder.

## Causal consistency

A very useful middle point. **Causal consistency** guarantees that operations which are *causally related* are seen by everyone in the same order, while operations that are merely **concurrent** (neither caused the other) may be seen in different orders by different clients.

Causality is the "happens-before" relationship of chapter 7: if you read a value and then write something based on it, your write is causally *after* that read. The classic example:

```text
Alice posts: "I lost my keys."
Bob replies: "Glad you found them!"   (causally after Alice's post)

Causal consistency guarantees nobody sees Bob's reply
before Alice's post. Two unrelated posts may appear in any order.
```

Causal consistency is attractive because it forbids the genuinely confusing reorderings (a reply before its question) while remaining **available during partitions** — it can be implemented without cross-replica coordination on the write path, by tracking dependencies (vector clocks). It is the strongest model you can have without sacrificing availability under partition.

## Eventual consistency

The weakest commonly used model. **Eventual consistency** promises only that *if writes stop, all replicas will eventually converge to the same value*. It says nothing about what reads return in the meantime: you might read your own write and get the old value, see values jump around, or observe updates out of order. "Eventually" is unbounded — it could be milliseconds or, under sustained problems, much longer.

This sounds alarmingly weak, and used carelessly it is. But for many workloads — a like counter, a cache, a shopping cart that merges, DNS — eventual consistency is exactly right, because it buys maximum availability and the lowest latency. The application absorbs the temporary disagreement.

<Callout type="warning">

**"Eventual" hides a multitude of sins.** Eventual consistency permits a read to return a value *older* than one the same client already saw, and provides no bound on how long convergence takes. If your code assumes monotonic progress or read-your-writes, plain eventual consistency will violate that assumption. Layer client-centric guarantees on top when you need them.

</Callout>

## The spectrum and its trade-offs

Arranged from strongest to weakest:

| Model | Guarantee | Coordination cost | Available under partition? |
| --- | --- | --- | --- |
| Linearizable | Single copy, respects real time | Highest | No |
| Sequential | One total order, respects per-client order | High | No |
| Causal | Causally related ops ordered for all | Moderate | Yes |
| Eventual | Replicas converge if writes stop | Lowest | Yes |

The pattern is monotonic: **the stronger the guarantee, the more coordination it requires, and the less available the system is during failures.** There is a hard line in this table — between sequential and causal — across which you trade strong, real-time-respecting ordering for the ability to keep serving during a partition. Chapter 5 (CAP) is precisely the formalization of that line.

## Client-centric guarantees

Even on top of an eventually consistent store, you can offer per-client promises that eliminate the most disorienting symptoms without global coordination:

- **Read-your-writes:** a client always sees its own latest writes (chapter 3).
- **Monotonic reads:** a client never sees time go backward — once it reads a value, later reads return that value or newer, never older.
- **Monotonic writes:** a client's writes are applied in the order the client issued them.
- **Consistent prefix reads:** if a sequence of writes happened in some order, a reader never sees a later one without the earlier ones (no reply before its question).

These are cheap to implement (session stickiness, version tracking) and often the right answer: they fix what users actually notice while keeping the availability and latency benefits of weak data-centric consistency.

<Callout type="tip">

**Choosing a model:** pick the *weakest* model your correctness requires, not the strongest you can imagine. Money movement and unique-username allocation need linearizability. Social feeds and comment threads are well served by causal. Counters, caches, and presence indicators are fine with eventual plus a client-centric guarantee or two. Each step weaker buys real availability and latency.

</Callout>
