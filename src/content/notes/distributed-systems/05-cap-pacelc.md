---
title: 'CAP & PACELC'
subtitle: 'The CAP theorem stated precisely, why a partition forces a choice between consistency and availability, and the latency dimension PACELC adds.'
chapter: 5
level: 'advanced'
readingTime: '10 min'
topics: ['cap', 'pacelc', 'tradeoffs']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

CAP is the most cited — and most misunderstood — result in distributed systems. Stated loosely ("pick two of three") it is misleading. Stated precisely it is a sharp, useful tool for reasoning about what a system must give up when the network fails. This chapter states it correctly, draws the real conclusion, and then extends it with PACELC, which captures the trade-off that exists even when nothing is broken.

## The three properties

CAP concerns three properties of a distributed data store:

- **Consistency (C):** every read receives the most recent write or an error. Here "consistency" means **linearizability** specifically (chapter 4) — a single up-to-date copy of the data. This is _not_ the "C" of ACID transactions; the overloaded word causes endless confusion.
- **Availability (A):** every request to a non-failed node receives a non-error response — the system keeps serving, even if the response might be stale.
- **Partition tolerance (P):** the system continues to operate despite the network dropping or delaying arbitrarily many messages between nodes.

## The theorem, stated precisely

The careless version is "you can only have two of the three." The precise version is more pointed:

> When a network **partition** occurs, a distributed system must choose between **consistency** and **availability**. It cannot have both.

The key realization is that **partition tolerance is not optional**. In any real network, partitions _will_ happen — links fail, switches reboot, packets drop. You do not get to "choose" P out; the network chooses it for you. So the real, forced choice is between C and A, and it is only forced **during a partition**. When the network is healthy, a well-built system can offer both consistency and availability.

<Callout type="warning">

**"Pick two of three" is wrong.** P is a fact of nature, not a design choice — you must tolerate partitions. CAP really says: _during a partition_, choose C or A. The rest of the time the trade-off does not even apply. Read CAP as a statement about behavior under partition, not a menu.

</Callout>

## Why the choice is forced

Picture a system partitioned into two halves that cannot communicate. A client sends a write to one half. Now consider what the _other_ half should do when it receives a read for that same data:

```text
   [ Half 1 ]   ||  partition  ||   [ Half 2 ]
   write x = 9                        read x = ?
```

- If Half 2 **answers** the read, it must answer with its stale value (it never heard about `x = 9`). It stayed **available** but broke **consistency**.
- If Half 2 **refuses** the read (or blocks until the partition heals), it stayed **consistent** but broke **availability**.

There is no third option. Half 2 cannot return the new value because the new value physically cannot reach it. This is the whole theorem, and it is unavoidable.

## CP versus AP

Systems are therefore classified by which property they sacrifice during a partition:

**CP (consistent under partition):** when partitioned, the system refuses requests it cannot serve correctly rather than return stale or conflicting data. The minority side stops accepting writes; only a side with a quorum keeps working. You get correctness at the cost of some unavailability. Examples: ZooKeeper, etcd, HBase, and consensus-backed stores generally. Choose CP when wrong data is worse than no data — account balances, locks, configuration, leader election.

**AP (available under partition):** when partitioned, every side keeps accepting reads and writes, allowing replicas to diverge, and reconciles afterward (last-write-wins, merges, CRDTs). You get availability at the cost of temporary inconsistency. Examples: Cassandra, DynamoDB (in its eventually-consistent mode), Riak. Choose AP when serving _something_ always matters more than serving the _latest_ — shopping carts, social feeds, telemetry, caches.

|                  | CP system             | AP system                 |
| ---------------- | --------------------- | ------------------------- |
| During partition | Rejects some requests | Serves all requests       |
| Sacrifices       | Availability          | Consistency               |
| Recovery         | Already consistent    | Must reconcile divergence |
| Good for         | Money, locks, config  | Carts, feeds, metrics     |

<Callout type="info">

**Note:** CP and AP are not whole-system labels carved in stone. Many systems are tunable per operation — DynamoDB and Cassandra let you request a strongly consistent read (more CP-leaning) or an eventual one (more AP-leaning) per query. The trade-off can be made at the granularity of individual requests.

</Callout>

## PACELC: the part CAP omits

CAP only describes behavior _during a partition_, which is rare. It says nothing about the trade-off you face the other 99.9% of the time, when the network is healthy. **PACELC** (proposed by Daniel Abadi) fills that gap. Read it as a sentence:

> **If** there is a **P**artition, choose between **A**vailability and **C**onsistency; **E**lse (normal operation), choose between **L**atency and **C**onsistency.

The new insight is the "else" clause. Even with a perfectly healthy network, a system that wants strong consistency must coordinate across replicas before answering — and that coordination takes time. So strong consistency costs **latency** even when nothing is broken. A system can buy lower latency by relaxing consistency (answering from the nearest replica without checking), or pay for consistency with higher latency on every request.

This gives a four-way classification, written `PA/EL`, `PC/EC`, and so on:

| Class | Under partition | Normally    | Example                                          |
| ----- | --------------- | ----------- | ------------------------------------------------ |
| PC/EC | Consistency     | Consistency | Strongly consistent stores, etcd / spanner-style |
| PA/EL | Availability    | Latency     | Cassandra, DynamoDB (eventual)                   |
| PA/EC | Availability    | Consistency | Tunable, leans consistent when healthy           |
| PC/EL | Consistency     | Latency     | Less common                                      |

PACELC is the more honest model because it surfaces the trade-off you actually make every day. Most teams never hit a partition in a given month, but every single request pays — or skips — the consistency-versus-latency tax described by the `EL`/`EC` choice.

<Callout type="tip">

**Using these in design:** decide CP vs AP per _data category_, not per company. Your billing ledger wants PC/EC; your "users online now" widget wants PA/EL. Picking one stance for an entire system either makes critical data unsafe or makes trivial data needlessly slow and fragile. Match the trade-off to the cost of being wrong about that specific data.

</Callout>
