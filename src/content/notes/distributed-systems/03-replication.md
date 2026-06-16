---
title: "Replication"
subtitle: "Keeping copies of data on multiple machines: single-leader, multi-leader, and leaderless designs, sync vs async, and quorums."
chapter: 3
level: "intermediate"
readingTime: "11 min"
topics: ["replication", "quorum", "leader"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

**Replication** means keeping a copy of the same data on more than one machine. You do it for three reasons: to survive the loss of a machine (availability), to serve reads from nearby or additional copies (scale and latency), and to keep data close to users (locality). The hard part is not making copies — it is keeping them consistent while machines and networks fail. Every replication design is a different answer to one question: *where are writes allowed to happen?*

## Single-leader replication

The most common design. One replica is designated the **leader** (primary); all others are **followers** (replicas, secondaries). All writes go to the leader. The leader applies the write, then streams the change to its followers, which apply it in the same order. Reads can be served by any replica.

```text
          writes
   client ------> [ LEADER ]
                     |  \
                     |   \  replication stream
                     v    v
              [follower] [follower]
                  ^           ^
                  |  reads    |
               client      client
```

This is exactly how PostgreSQL streaming replication, MySQL replication, and most managed databases work. Its great virtue is simplicity: because every write passes through one node in one order, there are no write conflicts to resolve. Its weaknesses are that the leader is a write bottleneck and a single point of failure — losing the leader requires a **failover**, promoting a follower to leader, which is delicate to get right.

## Multi-leader replication

Now allow more than one node to accept writes, each acting as a leader and replicating its writes to the others. This is mainly used across datacenters: each region has a local leader so writes are fast locally, and leaders sync across regions in the background.

The benefit is write availability and low write latency in every region. The cost is severe: two leaders can accept conflicting writes to the same record at the same time, and there is no single order to fall back on. You must **detect and resolve conflicts** — by last-write-wins (lossy), by application-specific merge logic, or by conflict-free data types (CRDTs). Multi-leader is powerful but should be reached for only when single-leader genuinely cannot meet latency needs.

## Leaderless replication

In the leaderless (Dynamo-style) design, popularized by Amazon Dynamo and used by Cassandra and Riak, there is no leader at all. The client (or a coordinator on its behalf) sends each write to **several replicas at once** and considers it successful once enough of them acknowledge. Reads also query several replicas at once and reconcile any disagreement they find.

Because writes and reads talk to overlapping sets of replicas directly, the system keeps accepting writes even when some replicas are down — there is no leader to lose. The trade-off is that replicas can temporarily hold different values, so the system needs anti-entropy mechanisms (read repair, background sync) and a way to decide which value wins. The cleverness lives in the **quorum** math.

## Synchronous vs asynchronous replication

Cutting across all three designs is *when* the write is acknowledged to the client.

- **Synchronous:** the leader waits for the follower to confirm it has the write before telling the client "done." The follower is guaranteed up to date, so a failover loses nothing — but the client waits for the slowest follower, and if that follower is down, writes stall.
- **Asynchronous:** the leader acknowledges immediately and ships the write to followers afterward. Writes are fast and the leader doesn't depend on followers being up, but a follower can lag (**replication lag**), and if the leader dies before a write reaches any follower, that write is **lost**.

```text
Synchronous:   client -> leader -> follower(ack) -> leader -> client(ack)
Asynchronous:  client -> leader -> client(ack)
                                \-> follower (later)
```

Most systems use a pragmatic middle ground: **semi-synchronous**, where the leader waits for one follower to confirm (so at least one durable copy exists) while the rest replicate asynchronously.

## Quorums: R + W &gt; N

Leaderless systems make the trade-off explicit and tunable. Let:

- **N** = the number of replicas each piece of data is stored on.
- **W** = the number of replicas that must acknowledge a *write* for it to count as successful.
- **R** = the number of replicas that must respond to a *read* before the client accepts the result.

The key insight: if **W + R &gt; N**, then the set of replicas a read contacts is guaranteed to **overlap** the set that acknowledged the latest write by at least one replica. That overlapping replica has the newest value, so the read is guaranteed to see it (the reader then picks the newest among the responses, using version numbers).

```text
N = 3.  Choose W = 2, R = 2.   W + R = 4 > 3, so reads and writes overlap.

  write goes to: [r1] [r2]  r3
  read asks:      r1  [r2] [r3]
  overlap at r2 -> read sees the latest write
```

Tuning W and R lets you slide along a spectrum:

| Setting | Effect |
| --- | --- |
| W = N, R = 1 | Fast reads, slow/fragile writes, strong read consistency |
| W = 1, R = N | Fast writes, slow reads, write always available |
| W = R = (N+1)/2 | Balanced "quorum" — survives a minority of failures |

<Callout type="info">

**Note:** A quorum with W + R &gt; N is not the same as linearizability. With concurrent writes, clock skew, or failed writes that partially succeeded, quorum reads can still return stale or ambiguous values. Quorums make staleness *unlikely and bounded*; they do not by themselves give the strong guarantees of chapter 4.

</Callout>

## Read-your-writes consistency

Replication lag produces a jarring user-facing bug. A user updates their profile (write goes to the leader), then immediately reloads the page (read served by a lagging follower that hasn't received the update yet) — and sees their *old* profile. It looks like the write was lost.

**Read-your-writes consistency** (also called read-after-write) guarantees that a user always sees their own most recent writes, even if other users might briefly see stale data. Common techniques:

- For a short window after a user writes, route their reads to the leader.
- Track the position (log sequence number) of the user's last write and only serve their reads from a replica that has caught up to that position.
- Have the client remember its last-write timestamp and ask replicas to wait until they are at least that current.

This is one of several **client-centric** guarantees (alongside monotonic reads — never seeing time go backward — and consistent prefix reads) that fix the most disorienting symptoms of asynchronous replication without paying for full strong consistency. The next chapter formalizes exactly what those guarantees are.

<Callout type="tip">

**Practical default:** start with single-leader, asynchronous replication and add read-your-writes routing for the handful of flows where users immediately re-read their own writes. Reach for multi-leader or leaderless only when a concrete requirement — cross-region writes, always-on writes during partitions — forces it.

</Callout>
