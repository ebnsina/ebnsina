---
title: "I/O & System Calls"
subtitle: "How read and write really travel through the kernel — and how one thread watches thousands of connections at once."
chapter: 8
level: "mastery"
readingTime: "16 min"
topics: ["epoll", "non-blocking", "io_uring"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## File Descriptors and the I/O Path

Every open file, socket, pipe, or device a process holds is referred to by a small integer: a **file descriptor** (fd). `0`, `1`, `2` are stdin, stdout, stderr by convention; `open`, `socket`, and `accept` return fresh ones. The fd indexes into a per-process table the kernel maintains, which points at the underlying kernel object.

All I/O flows through `read` and `write` on these descriptors. When you call `read(fd, buf, n)`:

1. The CPU traps into the kernel (a system call).
2. The kernel finds the object behind `fd`.
3. For a file, it checks the **page cache** (Chapter 7); a hit copies bytes straight to your buffer. A miss issues disk I/O.
4. The data is copied from kernel space into your `buf`, and the call returns the byte count.

That copy from kernel buffers to user buffers — and the syscall trap itself — is the per-call overhead that the rest of this chapter is largely about minimizing.

## Blocking vs Non-Blocking I/O

By default, descriptors are **blocking**. If you `read` from a socket with no data yet, the calling thread is put to sleep (the **blocked** state from Chapter 2) until data arrives. Simple to reason about, but it ties up a whole thread per in-flight operation. A server using one blocking thread per connection needs thousands of threads to handle thousands of clients — expensive in memory and context switches.

A descriptor set **non-blocking** (`O_NONBLOCK`) behaves differently: if the operation can't proceed immediately, the syscall returns right away with the error `EAGAIN` (or `EWOULDBLOCK`) instead of sleeping.

```c
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);

ssize_t n = read(fd, buf, sizeof buf);
if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
    // no data right now — go do something else, don't block
}
```

Non-blocking I/O lets a single thread juggle many descriptors — but only if it has a way to know *which* descriptors are ready, instead of spinning over all of them. That mechanism is I/O multiplexing.

## Multiplexing: select, poll, epoll

I/O multiplexing lets one thread wait on many descriptors and be told which became ready. Three generations:

**`select`** — pass a bitmask of descriptors; the kernel blocks until at least one is ready, then returns the ready set. Limited to `FD_SETSIZE` (typically 1024) descriptors, and you rebuild and re-scan the whole set every call. O(n) per call.

**`poll`** — same idea with an array instead of a fixed bitmask, lifting the 1024 limit. Still O(n): every call passes the full list and the kernel scans all of it, even if only one fd is ready. At ten thousand mostly-idle connections this is pure waste.

**`epoll`** (Linux) — the scalable answer. You register interest in descriptors *once* with `epoll_ctl`; the kernel keeps that interest set internally. `epoll_wait` then returns only the descriptors that are *actually ready*. Cost scales with the number of *active* connections, not the total registered — O(ready), not O(n).

```c
int ep = epoll_create1(0);

struct epoll_event ev = { .events = EPOLLIN, .data.fd = sock };
epoll_ctl(ep, EPOLL_CTL_ADD, sock, &ev);   // register once

struct epoll_event events[64];
for (;;) {
    int n = epoll_wait(ep, events, 64, -1);  // block until ready
    for (int i = 0; i < n; i++) {
        handle(events[i].data.fd);           // only ready fds
    }
}
```

This is why `epoll` (and the equivalent `kqueue` on BSD/macOS, IOCP on Windows) is the backbone of every high-concurrency server.

<Callout type="info">

**Note:** `epoll` only helps with **readiness-based** waiting — sockets and pipes. Regular disk files are essentially always "ready," so `epoll` doesn't help with disk I/O. That gap is part of what motivated `io_uring`.

</Callout>

## Edge-Triggered vs Level-Triggered

`epoll` offers two notification modes, and confusing them is a classic bug:

- **Level-triggered (LT)** — the default. `epoll_wait` keeps reporting a descriptor as ready *as long as* there is data to read. If you read only part of the buffered data, the next `epoll_wait` reminds you there's more. Forgiving.
- **Edge-triggered (ET)** — you're notified only on the *transition* from not-ready to ready. You get told *once* when data arrives. If you don't drain everything, you won't be told again until *new* data comes.

The rule for edge-triggered: on each notification, **loop reading until you get `EAGAIN`**, so you fully drain the descriptor. ET means fewer wakeups (higher performance) but demands this disciplined draining; forget it and connections silently hang with unread data.

<Callout type="warning">

**Warning:** With edge-triggered `epoll`, a single non-looping `read` is a stall waiting to happen. Always drain to `EAGAIN`. With level-triggered, a partial read is harmless — you'll simply be notified again.

</Callout>

## io_uring

Even with `epoll`, each individual `read`/`write` is still a separate syscall with its own trap and data copy. At extreme request rates the syscall overhead itself becomes the bottleneck. **`io_uring`** (modern Linux) attacks this.

It sets up two shared ring buffers between user space and the kernel — a **submission queue** and a **completion queue** — in memory both can see. The application writes I/O requests into the submission ring and the kernel posts results to the completion ring:

- **Batching** — submit many operations with one (or zero) syscalls instead of one syscall each.
- **Truly asynchronous** — it works for disk files too, not just sockets, closing the gap `epoll` left.
- **Lower overhead** — in polled modes the kernel can pick up submissions without any syscall at all.

`io_uring` is more complex to use directly and is usually consumed through a library, but it represents the current frontier of high-performance I/O on Linux.

## How This Powers Event Loops

Put the pieces together and you have the architecture behind Node.js, nginx, Redis, and most async runtimes: the **event loop**.

```text
loop:
  ready = epoll_wait(...)          # block until something happens
  for fd in ready:
      data = read(fd)              # non-blocking, won't stall
      result = handle(data)        # run the right callback / task
      queue writes for ready fds
```

A single thread, using **non-blocking** descriptors and **`epoll`** to wait on thousands of them, services enormous numbers of connections by only ever touching the ones with work to do. No thread-per-connection, no thousands of stacks, minimal context switching. When a descriptor signals readiness, the loop runs the associated callback or resumes the suspended task (a promise, a coroutine, an async function).

This is the payoff of the whole track. Non-blocking I/O and multiplexing (this chapter) ride on file descriptors and the page cache (Chapter 7), run on threads the scheduler manages (Chapters 3–4), inside the virtual memory the kernel maps (Chapter 5), all reached through the system-call boundary you started with in Chapter 1. The "magic" of a high-performance server is just these OS primitives, composed.
