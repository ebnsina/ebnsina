---
title: 'Consistency & Replication in NoSQL'
subtitle: 'Tunable and eventual consistency, quorum math, conflict resolution with LWW, vector clocks, and CRDTs, plus read repair and anti-entropy.'
chapter: 7
level: 'advanced'
readingTime: '13 min'
topics: ['consistency', 'replication', 'conflicts']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Three friends share a group chat to plan dinner. If everyone must reply before any decision is final, you're always in sync but slow — one friend offline stalls the whole group (strong consistency). If anyone can announce a plan and the others catch up later, decisions happen instantly but two people might book different restaurants for a moment (eventual consistency). Distributed databases run this exact negotiation millions of times a second, and the interesting question is what happens when two friends _did_ book different restaurants — how the system reconciles the conflict.

</Callout>

## Replication and the Core Trade-off

NoSQL databases keep multiple copies (**replicas**) of each piece of data on different nodes, for durability and availability. The **replication factor** (`RF`) is how many copies exist — `RF=3` is common.

The moment you have multiple copies, you face a choice on every operation: do you wait for the copies to agree (slow, consistent) or proceed with whatever's nearby (fast, possibly stale)? The CAP theorem makes this unavoidable during a network partition, but the trade-off is present even in healthy clusters as plain latency. NoSQL's answer is to make consistency **tunable** — decided per request, not fixed for the whole database.

## Quorums

The cleanest way to tune consistency is **quorum** math. Let:

- `N` = replication factor (number of copies)
- `W` = replicas that must acknowledge a **write** before it's considered successful
- `R` = replicas that must respond to a **read** before it returns

The key guarantee:

```text
If  R + W > N   →  read and write quorums overlap on at least
                   one replica, so a read always sees the latest write
                   (strong consistency)

If  R + W <= N  →  the quorums might not overlap, so a read can
                   miss a recent write (eventual consistency)
```

With `N=3`, the popular choice is `W=2, R=2` (`2 + 2 &gt; 3`): strongly consistent, yet tolerant of one dead node on both reads and writes.

```text
N=3 examples:
  W=1, R=1   → fastest, weakest    (1 + 1 = 2, not > 3)   eventual
  W=2, R=2   → balanced, strong    (2 + 2 = 4 > 3)        strong
  W=3, R=1   → fast reads, slow writes, strong            strong
  W=1, R=3   → fast writes, slow reads, strong            strong
```

You tune these per workload. A write-heavy telemetry pipeline might pick `W=1` (fast ingest, tolerate loss); a read of a user's own just-saved profile might pick `R=3` or write at `W=3` to guarantee freshness.

<Callout type="tip">

**Note:** Quorums tune _consistency vs latency/availability_, not _durability against total loss_. Even `W=1` writes the data and replicates it asynchronously afterward — you're choosing how long to _wait_ for replicas, not whether copies eventually exist. Pair quorum tuning with an appropriate replication factor and cross-datacenter placement for real durability.

</Callout>

## Eventual Consistency

Under eventual consistency the system promises only this: _if writes stop, all replicas will eventually converge to the same value._ In the meantime, different replicas may briefly return different answers. For many workloads — a like count, a feed, a product page — a few seconds of staleness is invisible and well worth the latency and availability win.

The hard part is what happens when two clients write to **different replicas at the same time** during a partition. Both succeed locally. Now two replicas hold different values for the same key, and the system must decide which one wins — or how to combine them. That is **conflict resolution.**

## Conflict Resolution

**Last-Write-Wins (LWW).** Each write carries a timestamp; on conflict, the highest timestamp wins. Simple and cheap, and the default in Cassandra.

```text
Replica A: key = "blue"  @ t=1005
Replica B: key = "green" @ t=1004
Resolved → "blue"   (latest timestamp wins; "green" is silently dropped)
```

The danger: LWW _silently discards_ the losing write, and clock skew between machines can make the "wrong" write win. Fine for last-seen status; dangerous for a shopping cart, where dropping an "add item" loses a customer's choice.

**Vector clocks.** Instead of a wall-clock time, each replica tracks a per-node counter, producing a version vector that captures _causality_ — whether one write happened-before another or whether they're genuinely concurrent.

```text
Write at A: cart = {milk}        version [A:1]
Write at B: cart = {eggs}        version [B:1]
   Neither vector dominates the other → CONCURRENT, a real conflict.
```

Vector clocks don't resolve the conflict; they **detect** it precisely, distinguishing a stale write (safe to drop) from concurrent writes (must be reconciled). The system then returns both **siblings** to the application — or to the user — to merge. Dynamo-style stores (Riak) use this so a cart can union the two versions instead of losing one.

**CRDTs (Conflict-free Replicated Data Types).** Data structures defined so that concurrent updates _always_ merge deterministically, with no coordination and no lost writes. A grow-only counter sums all increments; an OR-Set tracks adds and removes so element membership converges. Replicas can accept writes independently and always reconcile to the same state.

```text
Counter CRDT under concurrent +1 at three replicas:
  A: +5   B: +3   C: +2     →  merge = 5 + 3 + 2 = 10  (always)

Set CRDT, concurrent operations:
  A: add "x"      B: remove "x"   →  deterministic merge rule decides,
                                     same result on every replica
```

CRDTs are the gold standard for automatic, lossless convergence (used in collaborative editors and Redis's active-active replication), at the cost of more complex data structures and some metadata overhead.

| Strategy        | Lost writes?           | Detects concurrency?   | Complexity |
| --------------- | ---------------------- | ---------------------- | ---------- |
| Last-Write-Wins | Yes (silently)         | No                     | Low        |
| Vector clocks   | No (surfaces siblings) | Yes                    | Medium     |
| CRDTs           | No (auto-merges)       | N/A (merges by design) | High       |

## Read Repair and Anti-Entropy

Replicas drift, so the database actively heals divergence by two mechanisms.

**Read repair** happens on the read path. When a quorum read finds replicas disagree, the coordinator picks the winning value (by the conflict-resolution rule), returns it to the client, and _writes the correct value back_ to the stale replicas in the background. Frequently-read data stays consistent almost for free.

```text
Read at R=3 finds:
  Replica A: v=5 @ t=1005   ← newest
  Replica B: v=4 @ t=1003   ← stale
  Replica C: v=5 @ t=1005
→ return v=5, and asynchronously push v=5 to Replica B
```

**Anti-entropy** handles the cold data that read repair never touches. Background processes (Cassandra's `nodetool repair`, Dynamo-style Merkle-tree comparison) periodically compare replica contents and reconcile differences, so even never-read keys eventually converge.

<Callout type="warning">

**Warning:** Eventual consistency is not "consistency that arrives soon" — it is "consistency with no time bound and the possibility of conflicts you must handle." If your application logic assumes a read always reflects the last write (decrement-inventory-then-check, read-your-own-write after save), eventual consistency will produce real, intermittent bugs. Either raise consistency for those specific operations (`R + W &gt; N`) or design the logic to tolerate staleness and reconcile conflicts explicitly.

</Callout>

The throughline of NoSQL consistency: it is a dial, not a switch. Set strong consistency for the operations that must be exact (payments, inventory holds, read-your-writes), accept eventual consistency for the operations that merely need to be fast and available (feeds, counts, recommendations), and choose a conflict-resolution strategy that matches how costly a lost or merged write would be for each piece of data.
