---
title: 'Replication, Sentinel & Cluster'
subtitle: 'From one node to many: copies, automatic failover, and sharding across hash slots.'
chapter: 8
level: 'advanced'
readingTime: '13 min'
topics: ['replication', 'sentinel', 'cluster']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A single Redis node is a single point of failure and a hard ceiling on memory and read throughput. Scaling past one node comes in layers: replication for copies and read scaling, Sentinel for automatic failover, and Cluster for sharding data across machines. Each layer adds capability and complexity, and adds them in that order. This chapter explains what each gives you and what it costs in consistency.

## Primary/replica replication

The foundation is replication: one **primary** (master) accepts writes and streams every change to one or more **replicas**, which keep their own full copy. Replicas serve reads, freeing the primary, and stand ready to be promoted if it dies.

```text
# On a replica node
127.0.0.1:6380> REPLICAOF 127.0.0.1 6379
OK
127.0.0.1:6380> INFO replication
# Replication
role:slave
master_host:127.0.0.1
master_link_status:up
slave_read_only:1
```

How it works: on connect the replica does a full sync — the primary forks an RDB snapshot, ships it, and the replica loads it. From then on the primary streams a continuous replication log of commands. A brief disconnect triggers a _partial_ resync from a backlog buffer rather than a full one.

The crucial property is that **replication is asynchronous**. The primary acknowledges a write to the client _before_ confirming the replica received it. This keeps writes fast but means a replica can lag slightly behind, and a primary that crashes may take its last few writes with it.

What replication buys you:

- **Read scaling** — point read-heavy traffic at replicas (accepting they may be slightly stale).
- **Data redundancy** — a full live copy on another machine.
- **A failover target** — a replica can be promoted to primary.

What it does _not_ buy you: automatic recovery. If the primary dies, promoting a replica and repointing clients is manual. That is Sentinel's job.

<Callout type="info">

**Note:** Because replication is asynchronous, replicas are **eventually consistent**. A write acknowledged by the primary may not yet be on a replica, so a read from a replica right after a write can return stale data. The `WAIT numreplicas timeout` command lets a client block until a write reaches N replicas, narrowing the window — but it cannot make replication synchronous or eliminate the risk entirely.

</Callout>

## Sentinel: automatic failover

Replication gives you a spare; Sentinel makes the swap automatic. Sentinel is a separate set of processes (you run at least three for a reliable quorum) that monitor the primary and replicas, agree among themselves when the primary is truly down, promote a replica, and tell clients where the new primary is.

```text
# sentinel.conf — monitor a primary named "mymaster", quorum of 2
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
```

The failover sequence:

1. **Detection.** A Sentinel stops getting `PING` replies and marks the primary _subjectively down_.
2. **Agreement.** Once a _quorum_ of Sentinels agree, the primary is _objectively down_ — the quorum prevents one Sentinel's bad network from triggering a needless failover.
3. **Election.** The Sentinels elect a leader to run the failover.
4. **Promotion.** A suitable replica is promoted; the others are reconfigured to replicate from it.
5. **Notification.** Clients, using a Sentinel-aware library, ask Sentinel for the current primary address and reconnect.

Sentinel handles **high availability** but not sharding — every node still holds the entire dataset, so your data must fit on one machine. When it does not, you need Cluster.

## Cluster: sharding across nodes

Cluster mode partitions data across multiple primaries so the total dataset can exceed any single machine's memory and writes scale horizontally. The mechanism is **hash slots**: the keyspace is divided into a fixed **16384** slots, each slot owned by one primary.

```text
127.0.0.1:7000> CLUSTER INFO
cluster_enabled:1
cluster_state:ok
cluster_known_nodes:6
cluster_slots_assigned:16384
127.0.0.1:7000> CLUSTER KEYSLOT user:1042
(integer) 8326
127.0.0.1:7000> SET user:1042 "Lubna"
-> Redirected to slot [8326] located at 127.0.0.1:7001
OK
```

A key's slot is `CRC16(key) mod 16384`. To find a key, a client hashes it, looks up which node owns that slot, and talks to that node directly — no proxy in the hot path. If a client hits the wrong node it gets a `MOVED` redirect telling it the right one; smart clients cache the slot map and route correctly thereafter. Each primary typically has its own replica, so Cluster also provides HA — failover is built in, no separate Sentinel needed.

### Multi-key operations and hash tags

Sharding has a real cost: a command touching several keys only works if those keys live in the **same** slot, because no single node sees them all. `MGET a b c`, `SINTER`, and multi-key Lua scripts fail across slots. **Hash tags** force related keys onto one slot by hashing only the part in braces:

```text
# Both keys hash on "{1042}" -> same slot -> multi-key ops work
127.0.0.1:7000> MSET user:{1042}:name "Lubna" user:{1042}:email "lubna@x.com"
OK
127.0.0.1:7000> CLUSTER KEYSLOT user:{1042}:name
(integer) 5439
127.0.0.1:7000> CLUSTER KEYSLOT user:{1042}:email
(integer) 5439
```

Design your keys with hash tags _up front_ for any group you will need to read or modify together — retrofitting them later means moving data.

<Callout type="warning">

**Note:** Cluster changes the programming model, not just the deployment. Cross-slot multi-key commands and transactions are restricted, some clients need extra logic, and operations like `KEYS` or `SCAN` only see one node at a time. Do not enable Cluster for high availability alone — Sentinel does that without these constraints. Use Cluster only when one machine genuinely cannot hold your data or serve your write rate.

</Callout>

## Consistency trade-offs

Every layer here is built on asynchronous replication, so none offers strong consistency. The honest model is:

- **A failover can lose recently acknowledged writes.** If the primary accepts a write, has not yet replicated it, and then dies, the promoted replica never had that write. It is gone.
- **Split-brain is possible.** During a partition an old primary may keep accepting writes from clients on its side until it notices it has been replaced; those writes are discarded when it rejoins. `min-replicas-to-write` reduces this by refusing writes unless enough replicas are connected.
- **Reads from replicas are stale** by some small, variable amount.

This is the standard CAP trade-off: under a partition Redis favors availability over strict consistency. For caches, sessions, and most of what Redis is good at, that is the right trade — losing a few of the last writes during a rare failover is acceptable. If it is _not_ acceptable for a particular piece of data, that data probably belongs in a system designed for strong consistency, with Redis caching in front of it.

## When you actually need clustering

Resist scaling complexity until the numbers demand it. A practical ladder:

1. **Single instance** — most applications never outgrow one well-sized Redis. Start here.
2. **Add a replica** when you need read scaling or a warm standby.
3. **Add Sentinel** when downtime from a manual failover is unacceptable and the data still fits on one machine.
4. **Adopt Cluster** only when the dataset truly exceeds one machine's RAM, or write throughput exceeds one primary — and you can live with the multi-key restrictions.

Each rung adds operational burden. Climb only as high as your actual constraints require; premature clustering buys complexity you will pay for at 3 a.m.
