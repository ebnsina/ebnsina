---
title: 'Distributed Systems Theory for SREs'
subtitle: 'CAP, PACELC, FLP, Raft, Paxos, gossip, vector clocks, CRDTs, fencing tokens. The theory that explains why your distributed system breaks the way it does.'
chapter: 15
level: 'mastery'
readingTime: '32 min'
topics:
  [
    'distributed systems',
    'CAP',
    'Raft',
    'Paxos',
    'consensus',
    'CRDT',
    'vector clock',
    'fencing tokens'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Coordinating a team spread across time zones — agreement takes longer, partial failures are normal, and you design around them.

</Callout>

## Why theory matters at the SRE level

You can run a single-node service for years without thinking about consensus. The day you add a second region, a leader election, or a read replica, distributed-systems theory stops being academic — it becomes the explanation for every "this can't be happening" outage.

This chapter is the working theory a senior SRE references in design reviews and incident retros. It is enough to read papers, argue with vendors about consistency claims, and predict the failure mode of a system before it fails.

## The eight fallacies of distributed computing

L. Peter Deutsch's classic — every one of these is the cause of a real outage you've shipped:

```
1. The network is reliable.
2. Latency is zero.
3. Bandwidth is infinite.
4. The network is secure.
5. Topology doesn't change.
6. There is one administrator.
7. Transport cost is zero.
8. The network is homogeneous.
```

Memorize them. The first three explain ~70% of distributed bugs. Every "we'll just add a retry" decision must be checked against #1 (it can lose your message both ways) and #2 (the retry might race the original).

## CAP — the most misquoted theorem in our industry

Eric Brewer's CAP theorem says: in the presence of a _network Partition_, a system must choose between Consistency and Availability. That's it.

The common misquote: "pick two of three." That's wrong. Networks partition. You don't get to pick "no partition." You get to pick C-or-A _during_ a partition.

```
Partition occurs.
                    ┌─→ keep accepting writes (AP). Risk: divergent state.
Choose: ──────────┤
                    └─→ stop serving requests (CP). Risk: downtime.

When the partition heals, AP systems must reconcile divergent writes.
CP systems just resume.
```

### Real-world examples

| System                        | Choice                              | Behavior under partition                                |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------- |
| etcd, Consul, ZooKeeper       | CP                                  | Minority side becomes read-only                         |
| Cassandra, DynamoDB (default) | AP                                  | Both sides accept writes; LWW or merge later            |
| Postgres (single primary)     | CP                                  | Standby may be promoted; split-brain risk if mishandled |
| Spanner (TrueTime)            | "CP-ish, with bounded availability" | Refuses writes that can't get a TrueTime quorum         |

## PACELC — the more useful framework

Daniel Abadi's extension. The complete tradeoff is:

```
If a Partition happens:  Choose Availability or Consistency  (the CAP part)
Else (normal operation): Choose Latency or Consistency       (the EL part)

Example labels:
  Cassandra  AP / EL — sacrifices C in partition AND latency for C in normal ops.
  HBase      CP / EC — picks consistency in both cases.
  DynamoDB   AP / EL — same as Cassandra by default; can be tuned.
  Spanner    CP / EC — picks consistency always; pays latency cost.
```

PACELC is the more useful framework because most of the time the system _isn't_ partitioned. The latency-vs-consistency choice is the daily one. The CAP choice is the once-a-quarter one.

## FLP impossibility — why consensus algorithms have weird timeouts

Fischer-Lynch-Paterson (1985): in a fully asynchronous distributed system, no deterministic consensus algorithm can guarantee both safety and liveness if even one node may crash.

Translation: you cannot tell "this node is slow" apart from "this node is dead" without a timeout. Every real consensus protocol (Paxos, Raft, ZAB) breaks this impossibility by adding **partial synchrony assumptions** (eventually messages get through within some delay) and **failure detectors** (timeouts).

This is why every Raft cluster has heartbeat timeouts you can tune, and why every "split-brain" incident report mentions clock skew.

## Consensus — Raft in 2 minutes

Raft is the algorithm to learn first. Paxos is older and equivalent in power but harder to implement correctly. Raft is the basis of etcd, Consul, CockroachDB, TiKV.

```
Roles:        Leader (one), Followers (many), Candidate (briefly).
Term:         Monotonically increasing election epoch.
Log:          Append-only sequence of commands.

Election:
  - Followers expect a heartbeat from the leader.
  - If none arrives within election timeout (~150-300 ms randomized),
    a follower becomes a Candidate, increments term, requests votes.
  - A candidate that wins majority becomes the new Leader.

Replication:
  - Client sends command to Leader.
  - Leader appends to its log, sends AppendEntries to Followers.
  - Once majority of Followers have persisted the entry, it's committed.
  - Leader applies it and tells the client "ok."
  - Followers apply on next heartbeat.

Safety guarantee: at most one Leader per term; committed entries never lost.
```

### Why this matters for SREs

- **Cluster size = 2f+1.** A 3-node cluster tolerates 1 failure. 5-node tolerates 2. Even-sized clusters give you no extra fault tolerance — a 4-node cluster still tolerates only 1 failure (you need majority = 3 either way) but doubles disagreement risk.
- **Quorum writes block on the slowest of (f+1) nodes.** A slow disk on one node halves your write latency. Spread your replicas across nodes with similar disk performance.
- **Geo-distributed Raft is brutal.** Every commit is one round trip to the slowest member of the quorum. Atlanta + Frankfurt + Tokyo = ~150 ms commit latency floor.
- **Leader pinning.** etcd/CockroachDB let you pin the Raft leader to one region so reads from that region are local. The minority regions pay the WAN cost on writes only.

### Operational pages around Raft systems

```
- "etcd cluster lost quorum" — usually network partition or 2/3 disks slow.
- "leader changed N times in 5 minutes" — flaky network, not a bug.
- "Raft snapshot lag growing" — applier slower than incoming traffic.
  Tune snapshot frequency or scale CPU on followers.
```

## Linearizability vs serializability vs strong consistency

The words mean different things. Conflating them is how you mis-spec consistency.

```
Linearizability       — single-object real-time order. Each read sees the
                        most recent write or later. Per-key.

Serializability       — multi-object: the result of concurrent transactions
                        is equivalent to *some* serial order.

Strict Serializability= Linearizable + Serializable. (What Spanner gives you.)

Snapshot Isolation    — each transaction sees a consistent snapshot at start.
                        Allows write skew. (Postgres SERIALIZABLE level
                        actually gives Serializable Snapshot Isolation, SSI.)

Read Committed        — you only see committed data. (Default in Postgres.)
                        Allows non-repeatable reads.

Eventual Consistency  — converges if writes stop. No order guarantees.
```

The honest framing: 99% of features want Read Committed plus a sticky-write rule for read-after-write UX. The other 1% (financial ledgers, inventory) need Serializable. Knowing which one you're running prevents subtle data bugs.

### Anomalies you should recognize

```
Dirty read       — read uncommitted data. (Read Committed prevents this.)
Non-repeatable   — read same row twice in a transaction, get different values.
Phantom          — read returns a different set of rows on retry.
Lost update      — two writers each read, modify, write. Last writer wins,
                   first writer's change vanishes.
Write skew       — two transactions read disjoint sets, write disjoint sets,
                   but together violate an invariant.
```

The "doctors on call" example for write skew:

```sql
-- Invariant: at least one doctor on call.
-- Both transactions check, both see 2 doctors, both let their doctor leave.
-- Result: zero on call.
BEGIN;
SELECT count(*) FROM oncall WHERE shift = 'tonight';  -- returns 2
-- (other transaction does the same)
UPDATE oncall SET on_call = false WHERE doctor_id = 1;
COMMIT;
```

Snapshot Isolation does NOT prevent this. SSI does. So does explicit `SELECT ... FOR UPDATE`.

## Vector clocks — knowing what happened before what

A logical clock for distributed events. Each node keeps a counter for itself and the latest seen counters for every peer. Compare two events:

```
Event A's vector: { N1: 5, N2: 3, N3: 7 }
Event B's vector: { N1: 4, N2: 3, N3: 8 }

Is A → B?  No: A.N1 (5) > B.N1 (4).
Is B → A?  No: B.N3 (8) > A.N3 (7).
Conclusion: A and B are concurrent. Application must merge.
```

Used by: Riak, Cassandra (sort of), DynamoDB (vector versions internally), Git (sort of — DAG of commits).

The SRE relevance: when you see "vector clocks" in a system's docs, expect to deal with conflict resolution at the application layer. The DB will hand you both versions and ask which wins.

## CRDTs — the conflict-resolution that doesn't ask

Conflict-free Replicated Data Types: data structures where concurrent updates always merge to the same result, no matter the order. No coordination needed.

```
G-Counter (grow-only counter):
  Each replica tracks its own count: { N1: 5, N2: 3 }
  Merge = element-wise max.
  Total = sum.

LWW-Element-Set (last-writer-wins set):
  Each element tagged with timestamp. Merge by max timestamp.

OR-Set (observed-remove set):
  Each add is tagged with a unique ID. Removes only remove observed IDs.
  Lets you concurrently add and remove the same element correctly.
```

Used by: Redis Enterprise (CRDTs across regions), Riak, Riverbed, collaborative editors (Yjs, Automerge).

The catch: CRDTs constrain your data model. You can't trivially CRDT a relational `JOIN`. The good news: shopping carts, presence states, social graphs, document editing, and KV counters all have natural CRDT representations.

## Gossip — eventual consistency at scale

Gossip protocols spread state by random pairwise exchanges. Each node periodically picks a random peer, exchanges state, and merges. After O(log N) rounds, the cluster converges.

```
Used by:   Cassandra (cluster membership), Consul (gossip layer),
           Serf, Hashicorp's product line, Bitcoin's peer discovery.

Properties:
  - Fast: O(log N) convergence.
  - Robust: no central coordinator.
  - Bandwidth-stable: each node sends a fixed amount per round.
  - Eventually consistent only.

When you'd choose gossip:
  - Cluster membership (who's alive)
  - Service discovery (where is foo?)
  - Failure detection (Phi-accrual is the clever variant)
```

You don't write gossip protocols; you operate them. Symptoms of trouble: nodes "blipping" in and out of the cluster (timeouts too aggressive), or stale state lingering after a node really died (timeouts too loose).

## Idempotency, exactly-once, and the lies we tell

"Exactly-once delivery" is a marketing claim. The truth:

```
At-most-once   — fire and forget. Message may be lost.
At-least-once  — retry until ack. Message may be delivered multiple times.
"Exactly-once" — at-least-once delivery + idempotent receiver = effective once.
```

The receiver is doing the work. That's why every queue/event-bus README hammers idempotency:

```typescript
// Bad: not idempotent. Retried delivery double-charges.
async function processOrder(msg) {
	await charge(msg.userId, msg.amount);
}

// Good: dedupe by message ID.
async function processOrder(msg) {
	const inserted = await db.insertOrIgnore('processed_messages', { id: msg.id });
	if (!inserted) return; // already processed
	await charge(msg.userId, msg.amount);
}
```

Kafka's "exactly once" is at-least-once delivery + producer transactions + idempotent consumers. It works only inside Kafka. The moment you write to anything else, you own the dedup logic.

## Fencing tokens — preventing the zombie writer

The classic Martin Kleppmann example: a process holds a distributed lock, GC pauses for 30 seconds, the lock expires, another process takes over, then the original wakes up and writes anyway. Both think they hold the lock. Data corrupts.

```
Fix: every lock acquisition returns a monotonically increasing token.
The storage layer rejects writes with a token < the highest seen.
```

```typescript
const token = await lockManager.acquire('resource'); // returns 17
// ... later, after GC pause ...
await storage.write({ key, value, token });
// storage layer: "I've already seen token 23 from process B. Reject 17."
```

Used by: Spanner (timestamps as tokens), Chubby, modern S3 conditional writes (`If-Match`), HDFS NameNode generation IDs. If your distributed lock provider doesn't return a fencing token, it isn't safe — period.

## Time and clocks — the silent killer

Server clocks drift. NTP keeps them within ~10–100 ms. Across regions, clock skew can be seconds. Every "ordering by timestamp" assumption you make is suspect.

```
- "Last writer wins" by wall clock — unsafe across regions.
- "Token expires at clock+5s" — can expire instantly on a slow-clock node.
- "Cache invalidate at exact time" — depends on synchronized clocks.

Fixes:
  - Logical clocks (Lamport, vector) for ordering events.
  - Hybrid Logical Clock (HLC) — combines logical + physical, used by CockroachDB.
  - Google's TrueTime — bounded uncertainty (typically <7 ms) using GPS + atomic clocks.
    Used by Spanner. The cluster waits out the uncertainty window before committing.
```

When you see a system claim "globally consistent timestamps," ask: TrueTime? HLC? Or are they trusting NTP? The answer tells you the failure mode.

## Coordination-avoidance patterns

Theory in practice. The senior-SRE mantra: **coordination is the enemy of scale.** Whenever you can avoid it, do.

```
- Sharded counters instead of locking a single row.
- Append-only event logs instead of mutable state.
- CRDTs for things that naturally merge.
- Optimistic concurrency control (compare-and-swap) instead of locks.
- Sagas instead of distributed transactions.
- Read-your-writes via session stickiness instead of synchronous replication.
```

The two-line rule: every time you find yourself adding a lock, ask "can I make this commutative or idempotent instead?" If yes, do that instead.

## Partial failure — the defining feature of distsys

In a single-node system, things work or they don't. In a distributed system, half the dependencies are up and half are down, and the half that's up doesn't always know which is which.

The patterns that contain partial failure:

```
- Timeouts on every RPC. No exceptions. (No timeout = crash later.)
- Bulkheads: per-dependency thread pools / connection pools.
  A slow dependency can't drain the whole app's threads.
- Circuit breakers: stop calling a dep that's been failing for N seconds.
- Hedged requests: send to two replicas, take the first response.
- Backpressure: when downstream slows, slow your accept rate.
  (Don't queue infinitely.)
- Load shedding: when at saturation, return 503 fast — don't let
  requests pile up.
```

These patterns are why senior teams write "Bulkhead" and "CircuitBreaker" in design docs as nouns, not verbs.

## Papers worth a careful read (in order)

The reading list a senior SRE has actually read, not just heard of:

```
1. "Time, Clocks, and the Ordering of Events"     — Lamport, 1978
2. "The Byzantine Generals Problem"               — Lamport, 1982
3. "Impossibility of Distributed Consensus..."    — FLP, 1985
4. "The Part-Time Parliament" (or "Paxos Made Simple") — Lamport
5. "In Search of an Understandable Consensus Algorithm" — Raft, Ongaro 2014
6. "Spanner: Google's Globally Distributed DB"    — OSDI 2012
7. "Dynamo: Amazon's Highly Available Key-Value Store" — SOSP 2007
8. "Conflict-free Replicated Data Types"          — Shapiro et al, 2011
9. "Designing Data-Intensive Applications"        — Kleppmann (book)
10. "Jepsen reports"                              — Aphyr.com
```

The Jepsen reports are required reading — they're the field's empirical reality check. Many vendors quietly fixed bugs after a Jepsen test embarrassed them.

## Common SRE-level theory mistakes

1. **Treating CAP as a static label** instead of a behavior during partition.
2. **Assuming network is reliable + latency is zero** in any retry/timeout policy.
3. **"We're using Kafka, so exactly-once."** Only inside Kafka. Outside, you dedupe.
4. **Replacing Raft with custom leader election** because "we know our system." This goes badly. Use etcd.
5. **Trusting wall-clock ordering across regions.** Use logical or hybrid clocks.
6. **Locks without fencing tokens.** Single line, infinite trouble.
7. **Synchronous replication "for safety"** without realizing it doubles your tail latency.

## Stay current

- [Papers We Love](https://paperswelove.org/) — curated systems papers + talks
- [The Morning Paper archive (Adrian Colyer)](https://blog.acolyer.org/) — paper-a-day summaries
- [Aphyr — Jepsen](https://jepsen.io/analyses) — adversarial distributed-systems testing
- [Murat Demirbas — Metadata](https://muratbuffalo.blogspot.com/) — distsys research blog

## Key Takeaways

1. **CAP is about behavior during partition; PACELC adds the daily tradeoff.**
2. **FLP says you can't tell slow from dead** — every consensus protocol uses timeouts as a workaround.
3. **Raft is the consensus algorithm to know first**, and `2f+1` is the cluster sizing rule.
4. **Linearizability ≠ serializability ≠ snapshot isolation** — pick the one your feature actually needs.
5. **Idempotency is the only real "exactly once"** — design receivers, not pipes.
6. **Fencing tokens are the only safe distributed locks.**
7. **Clocks lie; use logical, hybrid, or TrueTime when ordering matters.**
