---
title: 'Synchronization'
subtitle: 'When threads share data, correctness depends on controlling who touches what, when — with locks, signals, and care.'
chapter: 6
level: 'advanced'
readingTime: '15 min'
topics: ['mutex', 'semaphore', 'deadlock']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Critical Sections

Chapter 3 showed how `counter++` from two threads loses updates. The root cause is that several instructions that _together_ must appear atomic get interleaved. The span of code that accesses shared state and must not run concurrently with itself is a **critical section**.

Correct synchronization guarantees:

- **Mutual exclusion** — at most one thread in the critical section at a time.
- **Progress** — if the section is free, a waiting thread eventually gets in.
- **No starvation** — a thread doesn't wait forever while others repeatedly cut ahead.

The tools below are mechanisms for enforcing these guarantees.

## Mutexes

A **mutex** (mutual exclusion lock) is the workhorse. A thread _locks_ it before the critical section and _unlocks_ it after. While one thread holds the lock, any other that tries to lock it blocks until the lock is released.

```c
#include <pthread.h>

pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
int counter = 0;

void increment(void) {
    pthread_mutex_lock(&lock);
    counter++;                  // critical section, now safe
    pthread_mutex_unlock(&lock);
}
```

Only one thread can be between `lock` and `unlock` at a time, so the increment is no longer a race. The cost is contention: threads waiting for the lock make no progress. Keep critical sections **short** — do the minimum under the lock and nothing slow (no I/O) while holding it.

<Callout type="warning">

**Warning:** Forgetting to unlock — for instance, returning early or throwing past the `unlock` — leaves the lock held forever and hangs every other thread. In C++/Rust, RAII or scope guards release the lock automatically on exit; in C, be meticulous.

</Callout>

## Semaphores

A **semaphore** is a counter with two atomic operations: _wait_ (decrement; block if it would go below zero) and _post_ (increment; possibly wake a waiter). It generalizes the mutex:

- A **binary semaphore** (count 0 or 1) acts like a lock.
- A **counting semaphore** (count N) allows up to N threads through at once — perfect for a resource pool, like "5 database connections available."

Semaphores also coordinate ordering between threads (signaling), not just exclusion. The classic use is the **producer–consumer** queue: one semaphore counts filled slots, another counts empty slots, so consumers block when the queue is empty and producers block when it's full.

## Condition Variables

A mutex protects data; a **condition variable** lets a thread _wait for a condition to become true_ without busy-spinning. It is always paired with a mutex.

A waiter atomically releases the mutex and sleeps until signaled; a signaler wakes one (or all) waiters:

```c
pthread_mutex_lock(&lock);
while (queue_is_empty())              // always re-check in a loop
    pthread_cond_wait(&not_empty, &lock);
item = dequeue();
pthread_mutex_unlock(&lock);
```

Two rules that trip people up:

- **Always wait in a `while` loop**, not an `if`. A thread can wake **spuriously** or lose the race for the condition to another thread, so it must re-check.
- The mutex is released while waiting and re-acquired before `cond_wait` returns, so the check-then-act is safe.

## Deadlock: The Four Conditions

A **deadlock** is when a set of threads are all blocked, each waiting for a resource another holds — forever. The textbook case: thread 1 holds lock A and wants B; thread 2 holds B and wants A. Neither can proceed.

Deadlock requires **all four** of these conditions simultaneously (the Coffman conditions):

1. **Mutual exclusion** — resources can't be shared.
2. **Hold and wait** — a thread holds one resource while waiting for another.
3. **No preemption** — resources can't be forcibly taken away.
4. **Circular wait** — a cycle of threads each waiting on the next.

Break **any one** and deadlock becomes impossible.

## Prevention and Avoidance

**Prevention** attacks one of the four conditions structurally:

- **Lock ordering** breaks circular wait — the most practical technique. Define a global order over all locks and always acquire them in that order. If everyone takes A before B, the A↔B cycle can never form.
- **No hold-and-wait** — acquire all needed locks at once, or release everything and retry if you can't get them all (`trylock`).
- **Timeouts** approximate preemption — a thread that can't acquire a lock within a deadline backs off and retries, breaking a potential cycle.

**Avoidance** is more dynamic: the system tracks resource requests and refuses any allocation that _could_ lead to an unsafe state (the Banker's algorithm). It's mostly of theoretical interest — real systems overwhelmingly rely on disciplined lock ordering and timeouts.

<Callout type="tip">

**Tip:** When two locks must be held together, always document and follow the order. Most production deadlocks are simply two code paths that grab the same two locks in opposite orders.

</Callout>

## Atomics and Lock-Free Code

For simple operations, taking a lock is overkill. Modern CPUs offer **atomic instructions** that perform read-modify-write as one indivisible step. A `fetch_and_add` increments a counter atomically with no lock at all:

```c
#include <stdatomic.h>

atomic_int counter = 0;
atomic_fetch_add(&counter, 1);   // atomic, no mutex needed
```

The foundational primitive is **compare-and-swap (CAS)**: "if this memory still equals X, set it to Y, atomically; tell me if you succeeded." Lock-free data structures are built from CAS retry loops. They avoid the blocking and contention of locks but are notoriously hard to get right — memory ordering, the ABA problem, and subtle visibility rules make hand-rolled lock-free code a job for experts. Reach for atomics for counters and flags; reach for proven library structures before writing your own lock-free queue.

With shared memory under control, the next chapter turns to shared persistent storage: file systems.
