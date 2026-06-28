---
title: 'Threads & Concurrency'
subtitle: 'Multiple flows of execution sharing one address space — fast, powerful, and dangerous without discipline.'
chapter: 3
level: 'intermediate'
readingTime: '14 min'
topics: ['threads', 'context switch', 'race condition']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Threads vs Processes

A process can contain more than one **thread** of execution. Each thread has its own stack, its own program counter, and its own register state — so each can be running a different part of the code. But all threads in a process **share the same address space**: the same heap, the same globals, the same open file descriptors.

That sharing is the whole point and the whole danger.

|                 | Process                       | Thread                        |
| --------------- | ----------------------------- | ----------------------------- |
| Address space   | Private                       | Shared with siblings          |
| Creation cost   | Higher                        | Lower                         |
| Communication   | Pipes, sockets, shared memory | Just read/write shared memory |
| Isolation       | Strong                        | None within a process         |
| A crash affects | Only itself                   | The whole process             |

Use multiple **processes** when you want isolation and fault containment. Use multiple **threads** when tasks need to share data cheaply and you accept that a bug in one can corrupt all of them.

## User vs Kernel Threads

Threads can be implemented at two levels:

- **Kernel threads** are known to the kernel scheduler. Each is scheduled independently and can run on a different CPU core. True parallelism is possible. Linux's pthreads are kernel threads — each maps to a schedulable `task_struct`.
- **User threads** (green threads, fibers, goroutines, coroutines) are scheduled by a runtime in user space, invisible to the kernel. They're extremely cheap to create and switch, but the kernel sees only the one underlying thread they run on.

Modern runtimes often use an **M:N** model — many user-level tasks multiplexed onto a smaller pool of kernel threads. Go's goroutines are the classic example: millions of goroutines run on a handful of OS threads.

<Callout type="info">

**Note:** Only kernel threads give you real parallelism across cores. User threads give you concurrency — interleaved progress — but if one of them makes a blocking syscall, the runtime must hand off to another kernel thread or all the user threads on it stall.

</Callout>

## Context Switching

When the kernel moves a CPU from one thread to another, it performs a **context switch**:

1. Save the current thread's registers (including the program counter and stack pointer) into its kernel structure.
2. Load the next thread's saved registers.
3. If switching to a thread in a _different_ process, also switch the page tables, which flushes parts of the **TLB** (Chapter 5).

A switch between threads of the same process is cheaper than between processes, because the address space doesn't change. Even so, context switches aren't free — each costs microseconds plus the indirect cost of cache and TLB pollution. A system that switches too often (thousands of times per second per core, visible in `vmstat` as high `cs`) spends real time shuffling state instead of doing work.

## Sharing State

Because threads share memory, passing data between them is as simple as writing to a variable both can see:

```c
int counter = 0;   // shared by all threads

void *worker(void *arg) {
    for (int i = 0; i < 1000000; i++) {
        counter++;     // looks atomic — it is NOT
    }
    return NULL;
}
```

This is also exactly where things go wrong.

## Race Conditions

`counter++` is not one operation. The CPU must:

```text
1. load counter from memory into a register
2. add 1 to the register
3. store the register back to counter
```

If two threads run this at the same time, their steps can interleave:

```text
Thread A: load counter (0)
Thread B: load counter (0)
Thread A: add 1  -> 1
Thread B: add 1  -> 1
Thread A: store 1
Thread B: store 1      <-- one increment lost
```

Both threads ran `counter++`, but the result is 1, not 2. This is a **race condition**: the outcome depends on the unpredictable timing of how operations interleave. Run the two-thread program above and the final count is almost never 2,000,000.

Races are insidious because the code _looks_ correct and usually _works_ — until the scheduler happens to interleave at the wrong moment, often only under load or on a faster machine.

The shared region of code that must not be interleaved is called a **critical section**. Protecting it requires synchronization — mutexes, atomics, and the tools of Chapter 6.

<Callout type="warning">

**Warning:** Any data touched by more than one thread, where at least one thread writes, is a potential race. "It worked on my machine" is meaningless for concurrency bugs — they are timing-dependent and may surface once in a million runs in production.

</Callout>

## Thread Pools

Creating a thread per task sounds clean but doesn't scale. Threads cost memory (each needs a stack, often megabytes of address space) and creation/teardown overhead. Spawn ten thousand and you'll drown in context switches.

A **thread pool** fixes this. You create a fixed number of worker threads up front — often roughly the number of CPU cores for CPU-bound work — and feed them tasks through a shared queue:

```text
        +-----------------+
tasks ->|   work queue    |
        +-----------------+
           |    |    |
        +----+ +----+ +----+
        | W1 | | W2 | | W3 |   <- fixed pool of worker threads
        +----+ +----+ +----+
```

Workers pull tasks, run them, and loop back for the next. This caps concurrency, reuses threads, and keeps the context-switch rate sane. Web servers, database connection pools, and language runtimes all use this pattern.

Next we look at how the kernel decides _which_ of all these ready threads actually gets a CPU: scheduling.
