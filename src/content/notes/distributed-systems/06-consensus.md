---
title: 'Consensus: Raft & Paxos'
subtitle: 'How a group of machines agrees on a single value despite failures: leader election, log replication, and a full walkthrough of Raft.'
chapter: 6
level: 'advanced'
readingTime: '13 min'
topics: ['consensus', 'raft', 'paxos']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

**Consensus** is the problem of getting a group of machines to agree on a single value — or, more usefully, on a single ordered sequence of values — even when some of those machines crash and the network drops messages. It is the beating heart of reliable distributed systems: leader election, distributed locks, configuration management, and the strongly consistent (CP) stores of the last chapter are all consensus in disguise. This chapter explains the problem and walks through Raft, the algorithm designed to be understandable.

## The consensus problem

A correct consensus algorithm must satisfy four properties:

- **Agreement:** no two non-faulty nodes decide on different values.
- **Validity (integrity):** the value decided was actually proposed by some node — the system can't invent a value.
- **Termination:** every non-faulty node eventually decides (it doesn't hang forever).
- **Fault tolerance:** the above hold even though some nodes crash.

Achieving all of this is genuinely hard. Recall the FLP result from chapter 2: in a fully asynchronous network where even one node may crash, _no_ algorithm can guarantee both safety and termination. Practical algorithms sidestep this by assuming the network is mostly timely (using timeouts) so that they always stay _safe_ (never decide two different values) and _eventually_ terminate once the network behaves.

## Quorums and why you need an odd number

Consensus algorithms make progress using a **majority quorum**: any decision requires agreement from more than half the nodes. Because any two majorities of the same group must share at least one node, two conflicting decisions can never both gather a majority — that shared node would have to vote for both, which it refuses to do. This is what guarantees agreement.

A majority of N nodes tolerates the failure of a _minority_:

| Nodes (N) | Majority needed | Failures tolerated |
| --------- | --------------- | ------------------ |
| 3         | 2               | 1                  |
| 5         | 3               | 2                  |
| 7         | 4               | 3                  |

Note that 4 nodes tolerate only 1 failure — the same as 3 — so clusters are almost always sized to an **odd number**. The minority side of a partition cannot form a majority, so it stops; this is exactly the CP behavior that keeps the system from splitting its brain.

## Raft: consensus you can follow

Raft was explicitly designed to be easier to understand than Paxos while being equally capable. It decomposes consensus into three pieces: **leader election**, **log replication**, and **safety**. Every node is in one of three states at any time:

- **Follower:** passive; responds to the leader and to candidates.
- **Candidate:** a node trying to become leader.
- **Leader:** the single node handling all client requests for the current term.

### Terms: logical time for the cluster

Raft divides time into **terms**, numbered consecutively. Each term begins with an election. A term is a logical clock (chapter 7) that lets nodes detect stale information: every message carries its sender's term, and any node that sees a higher term immediately steps down to follower and adopts it. At most one leader is elected per term.

### Leader election

Each follower runs a randomized **election timeout** (say, 150–300ms). If it goes that long without hearing from a leader, it suspects the leader is dead and starts an election:

```text
1. Follower increments its term and becomes a Candidate.
2. It votes for itself and sends RequestVote RPCs to all other nodes.
3. Each node grants its vote to the first valid candidate it sees in that
   term (one vote per term), provided the candidate's log is at least as
   up to date as its own.
4. If the candidate collects votes from a majority, it becomes Leader.
5. If it hears from a legitimate leader (equal or higher term) first,
   it steps back down to Follower.
6. If nobody wins (split vote), the term ends with no leader; the
   randomized timeouts make a repeat split unlikely, and a new election
   starts.
```

The **randomized** timeout is the trick that keeps split votes rare: nodes are unlikely to time out simultaneously, so usually one candidate gets a head start and wins cleanly.

### Heartbeats

Once elected, the leader sends periodic **heartbeats** (empty `AppendEntries` messages) to all followers. Heartbeats reset the followers' election timeouts, suppressing new elections. The moment heartbeats stop — leader crash or partition — a follower times out and the election cycle begins again. This is the same slow-vs-dead timeout from chapter 2: a healthy-but-slow leader can be wrongly replaced, which Raft tolerates because terms ensure the old leader steps down once it reconnects.

### Log replication

Client requests are commands appended to the leader's **log**. The leader's job is to replicate its log, in order, to a majority:

```text
1. Client sends a command to the leader.
2. Leader appends it to its own log as a new (uncommitted) entry.
3. Leader sends AppendEntries (with the new entry) to all followers.
4. When a majority have written the entry to their logs, the leader marks
   it COMMITTED and applies it to its state machine.
5. Leader returns success to the client and tells followers (via the next
   AppendEntries) that the entry is committed, so they apply it too.
```

Each entry is identified by its index and the term in which it was created. `AppendEntries` includes the index and term of the entry _preceding_ the new ones; a follower rejects the request if its log doesn't match there. This **consistency check** lets the leader detect and repair divergence by walking backward until the logs agree, then overwriting the follower's conflicting tail. Because all entries flow through the leader in one order, every replica's log converges to the same sequence — a linearizable, replicated state machine.

### Safety

The properties above are not enough on their own; Raft adds restrictions so a newly elected leader can never erase a committed entry:

- **Election restriction:** a node only grants its vote to a candidate whose log is at least as up to date as its own. This guarantees the winner already holds every committed entry, so no committed data is ever lost in a leadership change.
- **Commit rule:** a leader only counts an entry as committed once it is stored on a majority _and_ belongs to the leader's current term. This subtle rule prevents a rare scenario where an entry replicated on a majority could otherwise be overwritten by a later leader.

<Callout type="info">

**Note:** Raft turns the abstract consensus problem into a _replicated log_. Agreeing on "the next entry in the log," over and over, is equivalent to running an identical state machine on every node. This **replicated state machine** pattern is how etcd, Consul, and CockroachDB provide the strongly consistent storage that locks, leader election, and configuration depend on.

</Callout>

## A brief contrast with Paxos

Paxos, introduced by Leslie Lamport, was the first proven-correct consensus algorithm and remains the theoretical foundation. **Basic Paxos** lets a group agree on a _single_ value through a two-phase exchange: a _prepare_ phase in which a proposer claims a proposal number and learns any value already accepted, and an _accept_ phase in which it asks nodes to accept its value. Quorums guarantee agreement exactly as in Raft.

But agreeing on one value is rarely what you want — you want a _log_ of values, which requires **Multi-Paxos**, and that extension is famously underspecified. The differences in practice:

- **Understandability:** Raft was designed around it; Paxos is notoriously hard to teach and to implement correctly.
- **Leadership:** Raft has a strong, explicit leader as a first-class concept. Multi-Paxos bolts a leader on as an optimization, less cleanly.
- **Equivalence:** they tolerate the same failures and provide the same guarantees. Raft is not "better" in power — it is better _specified_, which is why most new systems choose it.

<Callout type="tip">

**Practical advice:** never implement consensus from scratch for production. Subtle safety bugs hide in the corners — split votes, log repair, the commit rule — and they surface only under rare failure timing. Build on a battle-tested implementation (etcd, ZooKeeper, Consul) and spend your effort on using it correctly.

</Callout>
