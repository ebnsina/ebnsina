---
title: "Failure Models & Time"
subtitle: "How nodes fail, why a network partition is the failure that matters, and why clocks and timeouts cannot be trusted to tell slow from dead."
chapter: 2
level: "intermediate"
readingTime: "11 min"
topics: ["failure", "clocks", "timeouts"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

To build a system that survives failure, you first have to say precisely what "failure" means. Casual language — "the server went down" — hides important distinctions. A node that crashes cleanly is a very different problem from a node that keeps answering with wrong data. This chapter pins down the failure models and then turns to the two things you fundamentally cannot trust: time and timeouts.

## Failure models

A **failure model** is an explicit statement of how components are allowed to misbehave. Algorithms are proved correct only against a stated model, so naming the model is not pedantry — it is the contract.

### Crash (fail-stop) failures

The node simply stops. It executes correctly until the moment it halts, then does nothing: no more messages, no wrong answers, just silence. This is the friendliest model. The catch is that other nodes cannot directly observe the crash; they only observe the absence of messages, which — as we will see — is ambiguous.

### Omission failures

The node is alive but drops some messages. A **send omission** loses an outgoing message; a **receive omission** loses an incoming one. Crucially, a dropped network link looks exactly like an omission failure to the nodes on either side. Omission failures are the everyday reality of unreliable networks.

### Byzantine failures

The node behaves arbitrarily: it may send wrong, inconsistent, or actively malicious messages, telling one peer it voted yes and another that it voted no. The name comes from the "Byzantine Generals Problem." This is the hardest model and matters when nodes can be compromised or are run by parties who may cheat — for example, in blockchains. Tolerating Byzantine faults requires more replicas and far more expensive protocols, so most internal systems assume only crash and omission failures.

| Model | Node behavior | Difficulty | Typical use |
| --- | --- | --- | --- |
| Crash / fail-stop | Stops cleanly | Easiest | Internal services, most databases |
| Omission | Drops messages | Moderate | Realistic networks |
| Byzantine | Arbitrary or malicious | Hardest | Blockchains, untrusted parties |

<Callout type="info">

**Note:** Most distributed databases and consensus systems (Raft, Paxos, ZooKeeper) assume the crash/omission model, not the Byzantine one. They guarantee correctness as long as nodes either work correctly or stop — never lie. Choosing the weakest model that fits your threat reality keeps the protocol affordable.

</Callout>

## Partial failure

On one machine, failure is total: the process is alive or it isn't. Distributed systems live in the uncomfortable middle. At any instant some nodes are healthy, some have crashed, some are slow, and some links are down — and no single node has a complete, current picture of which is which. Designing for **partial failure** means assuming that any subset of the system can be unavailable at any time, and that your code must do something sensible anyway, rather than blocking forever or corrupting state.

## Network partitions

A **network partition** is the failure that defines the field. The network splits so that two groups of healthy nodes cannot talk to each other, even though every node inside each group is fine and can talk among itself.

```text
Before partition:        After partition:

  A --- B --- C            A --- B  ||  C --- D
  |     |     |            |     |  ||  |     |
  D --- E --- F            D --- E  ||  F
```

From inside group one, the nodes in group two look crashed — silence — and vice versa. But they are not crashed; they are running and possibly still accepting requests. Now you have a genuine dilemma: if both halves keep serving writes, they will diverge and you get **split-brain** — two conflicting versions of reality that must later be reconciled. Partitions are the scenario that forces the CAP trade-off we will study in chapter 5.

## Why wall-clock time is unreliable

It is tempting to use timestamps to order events or to expire data. Resist it. The wall-clock time a machine reports cannot be trusted across machines, for several compounding reasons:

- **Clock drift.** Quartz clocks run slightly fast or slow. Without correction, two machines diverge by seconds per day.
- **Imperfect synchronization.** NTP corrects drift but only to within milliseconds to tens of milliseconds — and that error is larger than many of the events you might want to order.
- **Clock jumps.** When NTP corrects a clock, time can jump forward or even **backward**. Code that assumes time only moves forward breaks badly here, sometimes silently expiring fresh data or computing negative durations.

The dangerous consequence: if you compare timestamps from two machines to decide which write happened "last," you can easily pick the wrong one. A write that genuinely happened later may carry an earlier timestamp simply because that machine's clock was behind. This is why robust systems order events with **logical clocks** (chapter 7) rather than physical ones.

<Callout type="warning">

**Never use wall-clock timestamps from different machines to determine the order of events.** Clock skew can make a later event appear earlier. For ordering, use logical clocks; for measuring elapsed time on one machine, use a monotonic clock, which is immune to NTP jumps.

</Callout>

For measuring durations on a single machine — a timeout, a benchmark — use the **monotonic clock**, which only ever moves forward and ignores NTP adjustments. Use the wall clock only for displaying human-readable times, never for logic that depends on ordering.

## Timeouts and the slow-vs-dead problem

Because a crashed node and a slow node both produce silence, the only tool you have to detect failure is the **timeout**: wait a while, and if no reply arrives, assume the node is dead. But this assumption is fundamentally a guess, and choosing the timeout is a no-win trade-off:

- **Too short:** you declare a healthy-but-slow node dead, triggering needless failovers. Worse, the "dead" node is still running and may still be processing the request, leading to duplicate work or split-brain.
- **Too long:** you leave clients hanging and the system unresponsive while you wait to be sure.

There is no value that is correct in all conditions, because the network gives you no way to distinguish "slow" from "dead."

```text
A sends request to B, starts a timer.

  Case 1: B crashed       -> no reply, ever
  Case 2: B is slow        -> reply will arrive, eventually
  Case 3: reply was lost   -> B finished, but A never hears

A's timer fires. A sees the same thing in all three cases: nothing.
```

This is not a limitation of any particular language or library. It is provable. In a model where messages can be arbitrarily delayed (an **asynchronous network**), there is no algorithm that can reliably tell a crashed node from a slow one. This result is the practical face of the famous **FLP impossibility**, which shows that consensus cannot be guaranteed in a fully asynchronous system with even one possible crash. Real systems escape it by assuming the network is *mostly* timely and using timeouts as a practical — but fallible — failure detector.

<Callout type="tip">

**Practical guidance:** since timeouts can be wrong, never let a timeout alone cause irreversible action. Pair failure detection with mechanisms that tolerate a false positive — leases that expire, fencing tokens that reject stale leaders, and idempotent operations that make a retried-but-actually-completed request harmless.

</Callout>

## Where this leaves us

Failure is partial, the network can partition healthy nodes apart, clocks lie, and timeouts cannot tell slow from dead. Every technique in the rest of this track — replication, quorums, consensus, logical clocks — exists to build reliable behavior on top of these untrustworthy foundations. The next chapter starts that construction with replication.
