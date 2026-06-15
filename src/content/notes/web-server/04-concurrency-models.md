---
title: "Concurrency Models"
subtitle: "Process per request, thread per request, prefork, event loop, hybrid. The five ways web servers handle thousands of concurrent connections — and why each one exists."
chapter: 4
level: "beginner"
readingTime: "13 min"
topics: ["concurrency", "threads", "event loop", "epoll", "go"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The fundamental question

When a connection arrives, **what runs?** That single decision is the difference between Apache, nginx, Node, Go, and every other web server you have ever used. Five common answers, each with real tradeoffs.

Picture a server with N concurrent connections. For each model below, we will ask:

- How many OS resources does it use?
- What blocks what?
- Where does it fall over under load?

<Callout type="info">

**Real-World Analogy**

Concurrency models are like restaurant staffing strategies — one waiter handling all tables sequentially, one waiter assigned per table, or one highly attentive waiter who mentally juggles every table at once without ever blocking.

</Callout>

## Model 1 — Process per request

The original Unix design. The accept loop calls `fork()` for every connection, the child handles the request, the parent continues accepting.

```c
while (1) {
    int conn = accept(listener, ...);
    if (fork() == 0) {
        // child
        handle(conn);
        exit(0);
    }
    close(conn);
    waitpid(-1, NULL, WNOHANG); // reap dead children
}
```

**Pros.** Maximum isolation — a crash in one request takes down only that child. No shared memory means no concurrency bugs. CGI worked this way; original inetd worked this way.

**Cons.** Forking is *expensive* — kernel allocates a new process control block, copies page tables, sets up file descriptors. Hundreds of microseconds per fork. At a thousand requests per second on a small VPS, you spend more time forking than handling requests. Memory blows up linearly.

**Where you still see it.** Old CGI scripts, qmail, some specialty cron-driven setups. Rare for modern web.

## Model 2 — Thread per request

Same loop, but spawn an OS thread instead of forking:

```c
while (1) {
    int conn = accept(listener, ...);
    pthread_create(&tid, NULL, handle_thread, &conn);
}
```

Threads share memory with the parent, so spawning is much cheaper than forking — tens of microseconds, not hundreds. They share the same heap, file descriptors, and global state.

**Pros.** Simple programming model. Each handler is a synchronous function; if it needs to read from disk, it just blocks. Concurrency happens because the kernel schedules threads onto cores.

**Cons.** Each OS thread has a stack — Linux defaults to 8MB virtual, ~64KB resident. A thousand threads consume noticeable RAM. Context-switching between threads is fast but not free. At ~10K concurrent connections, the kernel scheduler starts becoming the bottleneck.

**Where you see it.** Apache's `mpm_worker` mode, Tomcat, the "spawn one thread per connection" pattern in many JVM frameworks. Fine up to a few thousand concurrent connections; falls over beyond that.

## Model 3 — Prefork (worker pool)

Fix forking-per-request by *preforking* a fixed pool of worker processes at startup. Each worker has its own accept loop on the shared listener:

```c
// at startup
for (int i = 0; i < NUM_WORKERS; i++) {
    if (fork() == 0) {
        worker_loop(); // never returns
    }
}

void worker_loop() {
    while (1) {
        int conn = accept(listener, ...);
        handle(conn);
        close(conn);
    }
}
```

The kernel handles `accept()` from multiple processes correctly — only one wakes up per connection.

**Pros.** No forking on the hot path. Process isolation is preserved. If a worker crashes, the master spawns another. If one worker has a memory leak, you can recycle it after N requests without affecting others.

**Cons.** Each worker handles only one connection at a time, so the pool size limits concurrency. If you have 100 workers and 101 clients arrive, the 101st waits.

**Where you see it.** Apache's `mpm_prefork` (the default for years), PHP-FPM, Gunicorn (the default `sync` worker class). Still extremely common in PHP/Python deployments. Unicorn (Ruby) is the same idea.

## Model 4 — Event loop (reactor pattern)

A single thread runs an *event loop*. When a connection arrives, the kernel notifies the loop via `epoll` (Linux), `kqueue` (BSD/macOS), or `IOCP` (Windows). The loop registers callbacks for "this socket is readable" and "this socket is writable," then continues spinning.

```c
int ep = epoll_create1(0);
struct epoll_event ev = {.events = EPOLLIN, .data.fd = listener};
epoll_ctl(ep, EPOLL_CTL_ADD, listener, &ev);

while (1) {
    struct epoll_event events[64];
    int n = epoll_wait(ep, events, 64, -1);
    for (int i = 0; i < n; i++) {
        if (events[i].data.fd == listener) {
            int conn = accept(listener, ...);
            // register conn for read events
            ev.events = EPOLLIN | EPOLLET;
            ev.data.fd = conn;
            epoll_ctl(ep, EPOLL_CTL_ADD, conn, &ev);
        } else {
            // read from events[i].data.fd, parse, respond
        }
    }
}
```

The loop never blocks on a single connection. While one connection is waiting on disk I/O, the loop is happily reading from another connection's socket. The OS stays out of the way.

**Pros.** One thread can comfortably manage 10K+ connections. RAM usage scales with *connections*, not threads (~10KB per connection). Latency is low because there is no context-switching.

**Cons.** Programming model is harder. Every blocking call must be made non-blocking (`fcntl(F_SETFL, O_NONBLOCK)`) or run on a separate thread, or the whole loop stalls. If your handler accidentally does a synchronous `pg_query()`, every other client waits. This is the **single-threaded blocking** trap and the source of most "Node went down because someone called `fs.readFileSync`" stories.

**Where you see it.** nginx, HAProxy, Redis, Node.js, Python asyncio (uvloop), Vert.x, Tokio. The dominant model for high-performance servers.

<Callout type="info">

**The C10K problem.**

In 1999 Dan Kegel wrote a paper asking how to handle 10,000 concurrent connections on a single machine. Thread-per-connection could not. The answer — `epoll`, `kqueue`, the reactor pattern — became event-loop servers. Today the question is C10M (ten million), and the techniques are largely the same: avoid syscalls per byte, share state across cores carefully.

</Callout>

## Model 5 — M:N goroutines (or virtual threads)

A hybrid: many *lightweight* userspace threads multiplexed onto few OS threads. The runtime schedules them. When one blocks (on I/O, lock, channel), the runtime parks it and runs another on the same OS thread.

This is **goroutines** in Go. It is **virtual threads** (Loom) in Java 21+. It is **fibers** in some other languages.

```go
listener, _ := net.Listen("tcp", ":8080")
for {
    conn, _ := listener.Accept()
    go handle(conn) // costs ~2KB; runtime decides which OS thread runs it
}
```

The Go runtime under the hood uses `epoll`/`kqueue`. When `handle(conn)` calls `conn.Read()`, the runtime parks that goroutine on an `epoll` set and continues running others on the same thread. When data arrives, the kernel wakes the runtime, which resumes the goroutine.

**Pros.** Synchronous-looking code (no callbacks, no `await` ceremony) with event-loop-like performance. Cheap goroutines (a few KB each) mean you can spawn one per connection without thinking.

**Cons.** Runtime is part of your binary. Stack growth and shrinkage have costs. You still have to think about concurrency — channels, mutexes, races. A blocking C call without `cgo` cooperation can stall an OS thread (the runtime spawns another, but it costs).

**Where you see it.** Go's `net/http`. Java with virtual threads. Rust's `tokio` is similar in spirit (async/await over an executor).

## Comparing them under load

Imagine a single small VPS, four cores, 4GB RAM, expected workload of 5,000 concurrent connections, each doing one DB query that takes 50ms.

| Model | Memory | Throughput | Bottleneck |
|---|---|---|---|
| Process-per-request | ~5GB+ | Falls over forking | Process create cost |
| Thread-per-request | ~500MB | Decent until ~2K | Scheduler, RAM |
| Prefork worker pool of 100 | ~200MB | Caps at 100 in flight | Pool size |
| Event loop | ~50MB | Handles all 5K | Blocking syscalls |
| Goroutines | ~100MB | Handles all 5K | Runtime scheduler |

Event loop and goroutines are the only two that comfortably handle the workload on a small box.

## What `net/http` actually is

Go's `net/http` server is goroutine-per-connection. The accept loop runs in one goroutine. Each new connection spawns a goroutine that handles the entire request lifecycle. The runtime multiplexes those goroutines onto a small number of OS threads (typically `GOMAXPROCS`, default `nproc`).

```go
// Simplified version of http.Server.Serve
for {
    rw, err := l.Accept()
    if err != nil { /* ... */ }
    c := srv.newConn(rw)
    go c.serve(ctx)
}
```

That `go c.serve(ctx)` is the entire concurrency model. Cheap, simple, scales to many thousands.

## What nginx actually is

nginx is a *master* process plus a small number of *worker* processes, each running its own event loop. The default is one worker per CPU core (`worker_processes auto`). Each worker can handle thousands of connections concurrently via `epoll`.

```text
master (root, port 80/443)
  ├─ worker 0 (epoll loop, ~10K connections)
  ├─ worker 1 (epoll loop, ~10K connections)
  ├─ worker 2 ...
  └─ worker N
```

This hybrid — multiple processes (one per core) each running an event loop — is the gold standard for static-content and reverse-proxy workloads. CPU-bound work is parallelized across cores; within a core, the event loop avoids context-switching overhead.

## When to pick which model

If you are choosing — usually by picking a language and framework — here is the cheat sheet:

- **Static content, lots of connections, low CPU per request** — event loop. nginx is purpose-built for this.
- **CPU-bound work, modest concurrency** — thread-per-request or worker pool. JVM or .NET shines here.
- **Mixed I/O-heavy + CPU-medium with developer ergonomics** — goroutines (Go), virtual threads (Java 21+), or async/await (Rust, modern Python).
- **PHP / classic Ruby / classic Python** — prefork worker pool. PHP-FPM, Unicorn, Gunicorn sync workers. Simple, debuggable, fine for most apps under a few thousand RPS.

## Why most production setups use *two* models

Front a Go application server (goroutines) with nginx (event loop). Why both?

- **nginx terminates TLS, HTTP/2, and gzip in front of cheap CPU cores using a model optimized for that work.**
- **Your app handles dynamic logic in goroutines, which is the optimal model for I/O-heavy app code.**

Each is doing what it is good at. Trying to do TLS termination in Go is fine — `crypto/tls` is solid — but at scale, nginx is faster and easier to tune.

## Common mistakes

- **Calling sync I/O in an event loop.** `fs.readFileSync` in Node, `time.sleep()` in `asyncio`. The whole loop stalls.
- **Spawning a goroutine per shed-record-of-the-database.** Goroutines are cheap but not free. A goroutine per *connection* is right; a goroutine per inner-loop iteration over millions of records is a leak.
- **Underprovisioning prefork workers.** PHP-FPM with `pm.max_children = 5` will queue every request beyond the fifth. Set it based on memory headroom, not the default.
- **Overprovisioning threads.** A JVM with `-Xss8m` and 10,000 threads is asking for OOM. Use virtual threads on Java 21+ or move to async.

## Recap

- Five common models: process-per-request, thread-per-request, prefork pool, event loop, goroutines/virtual threads.
- Event loops scale to many connections per CPU; programming is harder; never block.
- Goroutines (and virtual threads) give synchronous-looking code with event-loop performance.
- Production typically pairs a goroutine/event-loop *application* server with an event-loop *reverse proxy* (nginx).
- The right model depends on workload: I/O-bound vs CPU-bound vs concurrency level.

Next chapter: serving static files — the half of "web server" that nginx is *embarrassingly* better at than your app.

