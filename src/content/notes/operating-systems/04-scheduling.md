---
title: 'CPU Scheduling'
subtitle: 'With more runnable threads than cores, the kernel must constantly choose who runs next — quickly and fairly.'
chapter: 4
level: 'intermediate'
readingTime: '13 min'
topics: ['scheduler', 'preemption', 'cfs']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Scheduling Problem

A typical machine has a handful of cores but hundreds or thousands of runnable threads. The **scheduler** is the part of the kernel that decides, moment to moment, which thread runs on each core and for how long. It runs constantly and must decide in microseconds.

There is no perfect schedule, because the goals conflict:

- **Throughput** — finish as much work as possible.
- **Latency / responsiveness** — react quickly to interactive events (a keypress, an arriving packet).
- **Fairness** — every thread gets a reasonable share; nobody is starved.
- **Efficiency** — don't waste time in scheduling overhead or context switches.

Optimizing for throughput (run each job to completion) hurts responsiveness. Optimizing for responsiveness (switch constantly) hurts throughput. Real schedulers balance these.

## Preemptive vs Cooperative

Two fundamental models:

- **Cooperative** — a thread runs until it _voluntarily_ yields (blocks on I/O or calls a yield function). Simple, but one misbehaving thread that never yields hangs the whole system.
- **Preemptive** — the kernel can forcibly take the CPU back. A hardware **timer interrupt** fires periodically; the interrupt handler runs the scheduler, which may switch to another thread.

The slice of time a thread gets before it might be preempted is its **time quantum** (or time slice). Linux and every modern general-purpose OS is preemptive — no single program can monopolize a core.

<Callout type="info">

**Note:** Preemption is why a runaway infinite loop in one program doesn't freeze your desktop. The timer interrupt yanks the CPU away regardless of what the program is doing.

</Callout>

## Classic Algorithms

A tour of the building-block algorithms:

**First-Come, First-Served (FCFS).** Run jobs in arrival order, to completion. Simple and fair in ordering, but a long job at the front makes everyone behind it wait — the _convoy effect_. A 10-second job blocks a 10-millisecond one stuck behind it.

**Round Robin (RR).** Give each thread a fixed quantum, then move it to the back of the queue. Naturally fair and responsive. The quantum size is a trade-off: too large and it degrades toward FCFS; too small and context-switch overhead dominates.

```text
quantum = 10ms, threads A B C
time:  0    10   20   30   40   50
run:  [A ] [B ] [C ] [A ] [B ] [C ] ...
```

**Priority Scheduling.** Each thread has a priority; the scheduler runs the highest-priority ready thread. Great for important work, but a steady stream of high-priority threads can **starve** low-priority ones indefinitely.

**Multi-Level Feedback Queue (MLFQ).** Multiple priority queues. New threads start high. A thread that uses its whole quantum (CPU-bound) is demoted; a thread that blocks early (interactive, I/O-bound) stays high. This automatically favors responsive, interactive work without knowing anything about the threads in advance. Periodic _priority boosts_ lift everyone back up to prevent permanent starvation.

## Linux CFS

For years Linux's default scheduler was the **Completely Fair Scheduler (CFS)**. Its idea: instead of fixed time slices, track how much CPU time each thread has received and always run the one that has gotten the _least_.

CFS keeps a per-thread **virtual runtime** (`vruntime`) — roughly the CPU time consumed, weighted by priority (the "nice" value). All runnable threads sit in a red-black tree ordered by `vruntime`. The scheduler picks the leftmost node — the thread with the smallest `vruntime`, i.e. the one most "owed" CPU. As a thread runs, its `vruntime` grows and it sinks rightward in the tree, eventually yielding to others.

The effect is that, over time, every thread of equal priority converges on an equal share of the CPU — fairness as an emergent property rather than a fixed quantum. Nice values bias the weighting: a lower nice value makes `vruntime` accumulate more slowly, so the thread gets a larger share.

<Callout type="tip">

**Tip:** `nice` and `renice` adjust a process's priority. A higher nice value (up to 19) means "be nicer to others" — less CPU. A lower value (down to -20, root only) grabs more. Recent Linux kernels have moved toward a successor scheduler (EEVDF), but the fair-share mental model carries over.

</Callout>

## Starvation and Fairness

**Starvation** is when a thread is runnable but never gets the CPU because something always outranks it. Pure priority scheduling is the classic culprit.

Defenses:

- **Aging** — gradually raise the priority of threads that have waited a long time, so they eventually rise to the top.
- **Fair-share schedulers** like CFS — by construction, the most-neglected thread is the one chosen next, so nobody waits forever.

Fairness and responsiveness are in tension with raw throughput, and every scheduler picks a point on that spectrum. Understanding the trade-off explains a lot of observed behavior: why a batch job slows your interactive shell, why `nice`-ing a backup job helps, and why a flood of high-priority work can make everything else crawl.

With CPU sharing covered, the next chapter tackles the other great shared resource: memory.
