---
title: 'Ordering & Logical Clocks'
subtitle: 'Ordering events without a shared clock: happens-before, Lamport timestamps, vector clocks, and hybrid logical clocks.'
chapter: 7
level: 'advanced'
readingTime: '11 min'
topics: ['lamport', 'vector clocks', 'ordering']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Chapter 2 established that physical clocks lie: skew and NTP jumps make wall-clock timestamps useless for ordering events across machines. Yet ordering is exactly what we need — to know which write came first, to enforce causal consistency, to reconcile conflicting replicas. The solution is to stop asking "_when_ did this happen?" and start asking "_did this happen before that?_". **Logical clocks** answer the second question without any synchronized physical time at all.

## Happens-before

Leslie Lamport defined the **happens-before** relation, written `a -> b`, capturing when one event could possibly have influenced another. It holds in exactly three cases:

1. **Same process:** if `a` and `b` happen on the same node and `a` comes first in program order, then `a -> b`.
2. **Message passing:** if `a` is the sending of a message and `b` is the receipt of that same message, then `a -> b` (you can't receive before someone sends).
3. **Transitivity:** if `a -> b` and `b -> c`, then `a -> c`.

If neither `a -> b` nor `b -> a` holds, the events are **concurrent**, written `a || b`. Concurrent does not mean "at the same instant" — it means **causally independent**: neither could have influenced the other, so there is no meaningful order between them.

```text
P1:  a --------- send(m) ----------------- d
                    \
P2:  ----- b ------- recv(m) --- c -----

  a -> d            (same process)
  send(m) -> recv(m) (message rule)
  a -> c            (transitivity through m)
  b || a            (concurrent: no path between them)
```

This gives a **partial order**: some pairs of events are ordered, others genuinely are not. That is the honest truth about a distributed execution — and the goal of logical clocks is to capture this relation numerically.

## Lamport timestamps

A **Lamport timestamp** is a single integer counter per process, maintained by two rules:

1. **Before any local event** (including sending a message), increment your counter.
2. **On receiving a message**, set your counter to `max(local_counter, message_counter) + 1`.

Attach the counter to every message. The result has one guaranteed property:

> If `a -> b`, then `timestamp(a) < timestamp(b)`.

```text
P1: [1]a --- [2]send(m, ts=2) ------------------- [3]d
                    \
P2: [1]b ----------- [3]recv(m) --- [4]c
              (max(1,2)+1 = 3)
```

Lamport timestamps are wonderfully cheap — one integer — and they let you build a **total order** by breaking ties (equal timestamps) with the process ID. Many algorithms need _some_ consistent total order, and Lamport timestamps provide one.

But there is a critical limitation. The implication runs _only one way_: `a -> b` implies `ts(a) < ts(b)`, but `ts(a) < ts(b)` does **not** imply `a -> b`. A smaller timestamp might just be a concurrent event. So Lamport timestamps can _order_ events but cannot tell you whether two events were **causally related or merely concurrent**. For detecting concurrency — which conflict resolution needs — you need more.

<Callout type="warning">

**A smaller Lamport timestamp does not mean "happened before."** Lamport clocks impose a total order but lose the distinction between causally-related and concurrent events. If your logic needs to know "did these two writes conflict?", Lamport timestamps will silently give wrong answers. Use vector clocks instead.

</Callout>

## Vector clocks

A **vector clock** restores the lost information. Instead of one integer, each process keeps a **vector** of counters — one entry per process in the system. The rules:

1. **Before a local event**, a process increments **its own** entry in the vector.
2. **Send** the whole vector with every message.
3. **On receipt**, take the element-wise maximum of the local and received vectors, then increment your own entry.

```text
3 processes, vectors written [P1, P2, P3].

P1: [1,0,0]a -- send([1,0,0]) ------------- [2,0,0]
                    \
P2: [0,1,0]b ------- recv -> [1,2,0]c
              (max([0,1,0],[1,0,0]) then +1 on P2)
```

Now you compare vectors element-wise:

- `V(a) < V(b)` (every element `<=` and at least one strictly less) means **`a -> b`**: `a` causally precedes `b`.
- Neither `V(a) <= V(b)` nor `V(b) <= V(a)` means **`a || b`**: the events are concurrent.

This is the property Lamport clocks lacked: vector clocks can **detect concurrency**, which is exactly what you need to find conflicting writes in a leaderless store (chapter 3). Dynamo-style systems use vector clocks (or close relatives) to recognize when two replicas hold genuinely divergent, concurrent versions that must be merged rather than one simply overwriting the other.

The cost: each timestamp grows with the number of processes, which is a real problem in large or churning clusters. Variants (dotted version vectors, pruning) tame this in practice.

|                         | Lamport              | Vector               |
| ----------------------- | -------------------- | -------------------- |
| Size                    | One integer          | One integer per node |
| `a -> b` implies order? | Yes                  | Yes                  |
| Detect concurrency?     | No                   | Yes                  |
| Total order?            | Yes (with tie-break) | Partial order        |

## Total vs partial order

These two notions of order recur throughout the track:

- A **partial order** orders only causally related events and leaves concurrent ones unordered. Vector clocks capture this. It is the _truth_ of what happened.
- A **total order** forces every pair of events into a single line, even concurrent ones, by some arbitrary but consistent tie-break. Lamport timestamps (or a consensus log, chapter 6) provide this. It is a _useful fiction_ the system imposes when it must pick one sequence — for example, the order of entries in a Raft log.

Consensus is, in a sense, the machinery for manufacturing an agreed **total order** out of an inherently **partial** one.

## Hybrid logical clocks

Logical clocks order events correctly but their values are meaningless to humans — counter `4178` tells you nothing about wall-clock time. Pure physical clocks are human-readable but unsafe for ordering. **Hybrid Logical Clocks (HLC)** combine both: each timestamp carries a physical-time component plus a small logical counter.

An HLC tracks physical time closely (so timestamps roughly match real clocks and are human-meaningful) while using the logical counter to break ties and to preserve the happens-before guarantee even when physical clocks momentarily disagree or jump backward. The result is a timestamp that is _both_ close to wall-clock time _and_ a correct logical clock — `ts(a) < ts(b)` whenever `a -> b`, with a value you can actually read.

HLCs are used in modern distributed databases (CockroachDB, YugabyteDB, MongoDB) to order transactions: they give the causal-correctness of logical clocks with timestamps tied to real time, which is invaluable for debugging, time-bounded queries, and bounded staleness.

<Callout type="tip">

**Choosing a clock:** use **Lamport** timestamps when you only need _a_ consistent total order and don't care about detecting concurrency. Use **vector** clocks when you must distinguish causal from concurrent (conflict detection in leaderless replication). Use **HLCs** when you want logical-clock correctness but also need timestamps that approximate real time for humans and queries.

</Callout>
