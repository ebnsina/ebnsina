---
title: 'Operating Systems — Roadmap'
subtitle: 'How the kernel turns raw hardware into the processes, memory, and files your programs depend on.'
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap', 'operating systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What You'll Learn

Every program you write runs on top of an operating system. It hands you memory you didn't allocate from RAM directly, schedules your code onto CPUs you never asked for, and exposes files that aren't really files. Understanding the OS turns a pile of mysterious behavior — why a thread stalls, why memory usage spikes, why an `fsync` is slow — into something you can reason about.

This track builds a mental model of how a modern OS works, using **Linux** as the reference system. By the end you'll understand:

- How the kernel isolates and protects programs from each other.
- What a process and a thread really are, and how the CPU is shared between them.
- How virtual memory makes every program think it owns the machine.
- How synchronization, file systems, and I/O actually work under the hood.

<Callout type="info">

**Note:** You don't need to write kernel code to benefit from this. The goal is to make the abstractions you use every day — `fork`, `malloc`, `open`, `epoll` — stop being magic.

</Callout>

## Prerequisites

This track pairs naturally with two others:

- **linux-vps** — comfort with the shell, processes, and `ps`/`top` makes the examples concrete.
- **networking** — sockets and I/O multiplexing (Chapter 8) build directly on networking fundamentals.

A little C reading ability helps, since system calls are easiest to show in C. You won't need to be fluent — every snippet is explained.

## The Chapters

1. **What an Operating System Does** — the kernel, user vs kernel space, system calls, and the OS as a resource manager.
2. **Processes** — the process model, address spaces, the PCB, process states, and `fork`/`exec`/`wait`.
3. **Threads & Concurrency** — threads vs processes, context switching, shared state, and race conditions.
4. **CPU Scheduling** — how the kernel decides who runs next, from round-robin to Linux's CFS.
5. **Memory Management & Virtual Memory** — paging, page tables, the TLB, page faults, and swapping.
6. **Synchronization** — mutexes, semaphores, condition variables, and the four conditions for deadlock.
7. **File Systems** — inodes, the page cache, journaling, and durability with `fsync`.
8. **I/O & System Calls** — blocking vs non-blocking I/O, `epoll`, `io_uring`, and how event loops are built.

Work through them in order. Each chapter assumes the vocabulary of the ones before it.
