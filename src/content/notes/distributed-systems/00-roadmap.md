---
title: 'Distributed Systems — Roadmap'
subtitle: 'From a single machine to many: failure, time, replication, consensus, and the trade-offs that define every distributed system.'
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Coordinating one cook in one kitchen is easy: you see the whole counter at once. Coordinating a hundred cooks across a hundred kitchens in different cities — who can only talk by sending letters that sometimes get lost — is a different problem entirely. Distributed systems are the study of that second kitchen.

</Callout>

## What you will be able to do

By the end of this track you will be able to reason precisely about systems that span multiple machines: predict how they fail, explain why they cannot agree instantly, and choose the right trade-offs for a given workload. Concretely, you will be able to:

- Explain why a network of computers behaves nothing like one big computer.
- Classify failures (crash, omission, Byzantine) and design around partial failure.
- Pick a replication strategy and reason about quorums and read-your-writes guarantees.
- Place a system on the consistency spectrum from linearizable to eventual.
- State the CAP and PACELC theorems precisely and apply them to real databases.
- Walk through how Raft achieves consensus, and contrast it with Paxos.
- Order events without a shared clock using Lamport and vector clocks.
- Coordinate changes across services with sagas, the outbox pattern, and idempotency.

## Prerequisites and related tracks

This track assumes you can read pseudocode and have built at least one networked application. It pairs naturally with three other tracks:

- **Networking** — packets, latency, TCP, and why the network is the source of most distributed-systems pain.
- **Replication & Sharding** — the hands-on, database-specific counterpart to the replication theory here.
- **Event-Driven Architecture** — pub/sub, change data capture, and event sourcing, which lean heavily on the ordering and delivery ideas in this track.

You do not need any specific language. Code samples are pseudocode in `text`, `go`, or `python` to illustrate mechanics, not to be copy-pasted.

## Chapters in this track

1. **What Makes a System Distributed** — why distribute, independent failure, the eight fallacies, and what changes versus one machine.
2. **Failure Models &amp; Time** — crash vs omission vs Byzantine, partial failure, partitions, and why clocks and timeouts lie.
3. **Replication** — single-leader, multi-leader, and leaderless designs; sync vs async; quorums and read-your-writes.
4. **Consistency Models** — linearizable, sequential, causal, and eventual consistency, and the trade-offs along the spectrum.
5. **CAP &amp; PACELC** — the CAP theorem stated precisely, CP vs AP under partition, and the latency dimension PACELC adds.
6. **Consensus: Raft &amp; Paxos** — the consensus problem, leader election, log replication, and a full Raft walkthrough.
7. **Ordering &amp; Logical Clocks** — happens-before, Lamport timestamps, vector clocks, and hybrid logical clocks.
8. **Distributed Transactions** — two-phase commit, sagas, the outbox pattern, idempotency keys, and exactly-once myths.
9. **Building Reliable Distributed Systems** — retries, backoff, jitter, deduplication, and durable execution.

## How to read this track

Read in order. Each chapter builds vocabulary the next one assumes. Chapters 1–3 are foundational; 4–7 are the theoretical core; 8–9 are about applying it all to build systems that survive the real world. Take the failure chapter seriously — almost every distributed bug traces back to an assumption that the network or a clock would behave.
