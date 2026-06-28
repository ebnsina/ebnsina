---
title: 'What Makes a System Distributed'
subtitle: 'Why we distribute at all, why independent failure changes everything, and the eight fallacies that trip up every newcomer.'
chapter: 1
level: 'beginner'
readingTime: '9 min'
topics: ['distributed', 'fallacies']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A distributed system is a collection of independent computers that cooperate to appear, to their users, as a single coherent system. The key word is **independent**: each machine has its own memory, its own clock, and its own ability to fail without taking the others down. That independence is both the whole point and the whole problem.

## Why distribute at all

Running everything on one machine is simpler in every way, so you should only distribute when you must. Three forces push you across that line.

**Scale.** A single server has a ceiling: finite CPU, memory, disk, and network. Vertical scaling (a bigger box) gets expensive fast and still has a ceiling. Horizontal scaling — adding more machines — has effectively no ceiling, but only works if the work can be split across them.

**Fault tolerance.** One machine is one point of failure. If it dies, your service dies. Spreading work and data across many machines lets the system survive the loss of any one of them — but only if you design for it.

**Latency.** The speed of light is a hard limit. A user in Tokyo querying a server in Virginia pays roughly 150ms round-trip no matter how fast the server is. Placing machines near users removes that distance.

## Independent failure: the defining property

On a single machine, components fail together. If the process crashes, everything in it stops at once — there is no awkward in-between state where half the program is alive and half is dead.

In a distributed system, **parts fail independently**. Machine A can crash while machine B keeps running. The network link between them can drop while both machines are perfectly healthy. This creates a category of problem that simply does not exist on one machine: **partial failure**.

Worse, when machine A sends a request to machine B and gets no reply, A cannot tell which of these happened:

- B never received the request.
- B received it, did the work, and the reply was lost on the way back.
- B is just slow and the reply is still coming.

All three look identical from A's side. Most of the difficulty in distributed systems flows from this single ambiguity.

<Callout type="warning">

**The central hard truth:** in a distributed system you can never be certain whether a remote operation succeeded, failed, or is still in progress. Every design decision downstream is shaped by living with that uncertainty.

</Callout>

## The eight fallacies of distributed computing

In the 1990s, engineers at Sun Microsystems catalogued the false assumptions newcomers repeatedly make. They are worth memorizing, because every one of them will eventually bite you.

1. **The network is reliable.** Packets are lost, links go down, and messages arrive out of order. Plan for it.
2. **Latency is zero.** A remote call is thousands to millions of times slower than a local one. Chatty designs that make many small calls feel fine on `localhost` and collapse in production.
3. **Bandwidth is infinite.** Large payloads and high request rates saturate links. Data has a size and a cost to move.
4. **The network is secure.** Anything on the wire can be read or tampered with unless you encrypt and authenticate it.
5. **Topology doesn't change.** Machines are added, removed, and relocated constantly. Hard-coding addresses and routes guarantees future pain.
6. **There is one administrator.** Real systems span teams, vendors, and clouds, each with different policies and change windows.
7. **Transport cost is zero.** Serializing, sending, and deserializing data costs CPU and money, not just time.
8. **The network is homogeneous.** Different machines run different hardware, operating systems, and protocol versions. Assume diversity.

Each fallacy is a comfortable assumption from single-machine programming that quietly becomes false the moment a network is involved.

## What changes versus a single machine

It helps to see the shift concretely. The same concept behaves very differently once it crosses a network.

| Concept       | Single machine               | Distributed system                         |
| ------------- | ---------------------------- | ------------------------------------------ |
| Function call | Always returns or throws     | May time out with unknown outcome          |
| Clock         | One clock, monotonic         | Many clocks, all drifting                  |
| Failure       | All-or-nothing               | Partial; some nodes up, some down          |
| Memory        | Shared, instantly consistent | No shared memory; state is copied and lags |
| Ordering      | Program order is obvious     | No global order without extra machinery    |

Consider a simple example. On one machine, incrementing a counter is a single instruction and is automatically consistent. Across two machines, "increment the counter" becomes: read the current value over the network, add one locally, and write it back. If two machines do this at once, they can both read 5, both write 6, and you have lost an update — a bug that the single-machine version made impossible.

```text
Machine A: read counter -> 5
Machine B: read counter -> 5
Machine A: write 6
Machine B: write 6        # the increment from A is gone
```

<Callout type="tip">

**Design heuristic:** before adding a network hop, ask whether the work truly needs to live on another machine. The simplest distributed system is the one you didn't build. Distribute for a concrete reason — scale, fault tolerance, or latency — not by default.

</Callout>

## Where this leaves us

Distribution buys scale, resilience, and locality, but it charges in a currency of uncertainty: partial failure, untrustworthy clocks, and no free global ordering. The rest of this track is about paying that bill deliberately. The next chapter looks hard at the two things you can least trust — failure and time.
