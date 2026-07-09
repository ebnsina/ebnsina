---
title: 'Concurrency Models'
subtitle: 'Process per request, thread per request, prefork, event loop, hybrid. web server-রা হাজার হাজার concurrent connection সামলানোর যে পাঁচটি উপায় ব্যবহার করে — আর কেন প্রতিটির অস্তিত্ব আছে।'
chapter: 4
level: 'beginner'
readingTime: '13 মিনিট'
topics: ['concurrency', 'threads', 'event loop', 'epoll', 'go']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## মূল প্রশ্নটা

যখন একটা connection আসে, **কী রান হয়?** ঐ একটা সিদ্ধান্তই Apache, nginx, Node, Go, আর আপনার ব্যবহার করা অন্য প্রতিটি web server-এর মধ্যে পার্থক্য গড়ে দেয়। পাঁচটি সাধারণ উত্তর, প্রতিটির সাথেই বাস্তব tradeoff জড়িয়ে আছে।

কল্পনা করুন একটা server-এ N-টা concurrent connection আছে। নিচের প্রতিটি মডেলের জন্য আমরা জিজ্ঞেস করব:

- এটা কতগুলো OS resource ব্যবহার করে?
- কী কাকে block করে?
- load-এর নিচে এটা কোথায় ভেঙে পড়ে?

<Callout type="info">

**বাস্তব জীবনের উপমা**

Concurrency model অনেকটা রেস্তোরাঁর staffing কৌশলের মতো — একজন waiter সব টেবিল একের পর এক সামলাচ্ছে, প্রতি টেবিলে একজন করে waiter দেওয়া, অথবা একজন অত্যন্ত মনোযোগী waiter যে কখনো block না হয়ে মনে মনে সব টেবিল একসাথে সামলে যাচ্ছে।

</Callout>

## Model 1 — Process per request

মূল Unix ডিজাইন। accept loop প্রতিটি connection-এর জন্য `fork()` কল করে, child request সামলায়, parent accept করতে থাকে।

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

**সুবিধা।** সর্বোচ্চ isolation — একটা request-এ crash হলে শুধু সেই child-টাই পড়ে যায়। shared memory নেই মানে কোনো concurrency bug নেই। CGI এভাবে কাজ করত; আদি inetd এভাবে কাজ করত।

**অসুবিধা।** fork করা _ব্যয়বহুল_ — kernel একটা নতুন process control block বরাদ্দ করে, page table কপি করে, file descriptor সেট আপ করে। প্রতি fork-এ কয়েকশো microsecond। ছোট একটা VPS-এ সেকেন্ডে হাজারটা request হলে, request সামলানোর চেয়ে fork করাতেই বেশি সময় যায়। memory লিনিয়ারলি ফুলে ওঠে।

**এখনো কোথায় দেখবেন।** পুরনো CGI script, qmail, কিছু বিশেষ cron-চালিত setup। আধুনিক web-এ বিরল।

## Model 2 — Thread per request

একই loop, কিন্তু fork করার বদলে একটা OS thread spawn করা:

```c
while (1) {
    int conn = accept(listener, ...);
    pthread_create(&tid, NULL, handle_thread, &conn);
}
```

Thread parent-এর সাথে memory শেয়ার করে, তাই spawn করা fork করার চেয়ে অনেক সস্তা — কয়েকশো নয়, কয়েক দশ microsecond। এরা একই heap, file descriptor, আর global state শেয়ার করে।

**সুবিধা।** সহজ programming model। প্রতিটি handler একটা synchronous function; disk থেকে পড়তে হলে সেটা শুধু block হয়ে যায়। concurrency ঘটে কারণ kernel thread-গুলোকে core-এ schedule করে।

**অসুবিধা।** প্রতিটি OS thread-এর একটা stack থাকে — Linux ডিফল্টে 8MB virtual, ~64KB resident। হাজারটা thread লক্ষণীয় পরিমাণ RAM খায়। thread-এর মধ্যে context-switch করা দ্রুত কিন্তু বিনামূল্যে নয়। ~10K concurrent connection-এ kernel scheduler bottleneck হতে শুরু করে।

**কোথায় দেখবেন।** Apache-র `mpm_worker` mode, Tomcat, অনেক JVM framework-এর "প্রতি connection-এ একটা thread spawn" প্যাটার্ন। কয়েক হাজার concurrent connection পর্যন্ত ঠিকঠাক; এর বেশি হলে ভেঙে পড়ে।

## Model 3 — Prefork (worker pool)

request-প্রতি fork করা ঠিক করুন startup-এ একটা নির্দিষ্ট pool worker process _prefork_ করে। প্রতিটি worker-এর নিজস্ব accept loop থাকে shared listener-এর ওপর:

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

kernel একাধিক process থেকে `accept()` সঠিকভাবে সামলায় — প্রতি connection-এ শুধু একটাই জেগে ওঠে।

**সুবিধা।** hot path-এ কোনো fork নেই। process isolation বজায় থাকে। একটা worker crash করলে master আরেকটা spawn করে। একটা worker-এ memory leak থাকলে, আপনি সেটাকে N request পর অন্যদের প্রভাবিত না করে recycle করতে পারেন।

**অসুবিধা।** প্রতিটি worker একবারে শুধু একটা connection সামলায়, তাই pool-এর সাইজই concurrency-কে সীমিত করে দেয়। 100টা worker আর 101টা client এলে, 101তম-টা অপেক্ষা করে।

**কোথায় দেখবেন।** Apache-র `mpm_prefork` (বছরের পর বছর ডিফল্ট), PHP-FPM, Gunicorn (ডিফল্ট `sync` worker class)। এখনো PHP/Python deployment-এ অত্যন্ত সাধারণ। Unicorn (Ruby)-ও একই ধারণা।

## Model 4 — Event loop (reactor pattern)

একটাই thread একটা _event loop_ চালায়। যখন একটা connection আসে, kernel `epoll` (Linux), `kqueue` (BSD/macOS), বা `IOCP` (Windows)-এর মাধ্যমে loop-কে জানায়। loop "এই socket readable" আর "এই socket writable"-এর জন্য callback register করে, তারপর ঘুরতে থাকে।

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

loop কখনো একটা মাত্র connection-এ block হয় না। একটা connection যখন disk I/O-র অপেক্ষায় থাকে, loop তখন আনন্দে আরেকটা connection-এর socket থেকে পড়ছে। OS মাঝখান থেকে সরে থাকে।

**সুবিধা।** একটা thread স্বচ্ছন্দে 10K+ connection সামলাতে পারে। RAM ব্যবহার _connection_-এর সাথে scale করে, thread-এর সাথে নয় (~প্রতি connection-এ 10KB)। latency কম কারণ কোনো context-switch নেই।

**অসুবিধা।** programming model কঠিন। প্রতিটি blocking call-কে non-blocking (`fcntl(F_SETFL, O_NONBLOCK)`) বানাতে হবে অথবা আলাদা thread-এ চালাতে হবে, নয়তো পুরো loop আটকে যায়। আপনার handler ভুলে একটা synchronous `pg_query()` করলে, অন্য প্রতিটি client অপেক্ষা করে। এটাই **single-threaded blocking** ফাঁদ, আর "কেউ `fs.readFileSync` কল করায় Node পড়ে গেল" জাতীয় গল্পের উৎস।

**কোথায় দেখবেন।** nginx, HAProxy, Redis, Node.js, Python asyncio (uvloop), Vert.x, Tokio। high-performance server-এর প্রধান মডেল।

<Callout type="info">

**C10K problem।**

1999 সালে Dan Kegel একটা পেপার লেখেন, যেখানে প্রশ্ন করা হয় একটা মেশিনে 10,000 concurrent connection কীভাবে সামলানো যায়। Thread-per-connection পারত না। উত্তর — `epoll`, `kqueue`, reactor pattern — হয়ে উঠল event-loop server। আজ প্রশ্নটা C10M (এক কোটি), আর কৌশলগুলো মূলত একই: প্রতি byte-এ syscall এড়ানো, core-গুলোর মধ্যে state সাবধানে শেয়ার করা।

</Callout>

## Model 5 — M:N goroutines (বা virtual threads)

একটা hybrid: অনেকগুলো _lightweight_ userspace thread কম কয়েকটা OS thread-এর ওপর multiplex করা। runtime এদের schedule করে। একটা যখন block হয় (I/O, lock, channel-এ), runtime সেটাকে park করে আর একই OS thread-এ আরেকটা চালায়।

এটাই Go-তে **goroutines**। এটাই Java 21+-এ **virtual threads** (Loom)। কিছু অন্য ভাষায় এটাই **fibers**।

```go
listener, _ := net.Listen("tcp", ":8080")
for {
    conn, _ := listener.Accept()
    go handle(conn) // costs ~2KB; runtime decides which OS thread runs it
}
```

Go runtime ভেতরে `epoll`/`kqueue` ব্যবহার করে। যখন `handle(conn)` `conn.Read()` কল করে, runtime সেই goroutine-কে একটা `epoll` set-এ park করে আর একই thread-এ অন্যদের চালাতে থাকে। data এলে, kernel runtime-কে জাগায়, যা goroutine-টা resume করে।

**সুবিধা।** synchronous-দেখতে কোড (কোনো callback নেই, কোনো `await` ঝামেলা নেই) event-loop-এর মতো performance সহ। সস্তা goroutine (প্রতিটি কয়েক KB) মানে না ভেবেই আপনি প্রতি connection-এ একটা করে spawn করতে পারেন।

**অসুবিধা।** runtime আপনার binary-র অংশ। stack বাড়া-কমার খরচ আছে। এখনো আপনাকে concurrency নিয়ে ভাবতে হয় — channel, mutex, race। `cgo`-র সহযোগিতা ছাড়া একটা blocking C call একটা OS thread আটকে দিতে পারে (runtime আরেকটা spawn করে, কিন্তু তার খরচ আছে)।

**কোথায় দেখবেন।** Go-র `net/http`। virtual thread সহ Java। Rust-এর `tokio` চেতনায় একই রকম (একটা executor-এর ওপর async/await)।

## load-এর নিচে এদের তুলনা

কল্পনা করুন একটা ছোট VPS, চারটা core, 4GB RAM, প্রত্যাশিত workload 5,000 concurrent connection, প্রতিটি একটা করে DB query করছে যেটায় 50ms লাগে।

| Model                      | Memory | Throughput               | Bottleneck          |
| -------------------------- | ------ | ------------------------ | ------------------- |
| Process-per-request        | ~5GB+  | fork করতে করতে পড়ে যায় | Process create cost |
| Thread-per-request         | ~500MB | ~2K পর্যন্ত ভালো         | Scheduler, RAM      |
| Prefork worker pool of 100 | ~200MB | in-flight 100-তে আটকায়  | Pool size           |
| Event loop                 | ~50MB  | পুরো 5K সামলায়          | Blocking syscalls   |
| Goroutines                 | ~100MB | পুরো 5K সামলায়          | Runtime scheduler   |

Event loop আর goroutines — এই দুটোই একটা ছোট মেশিনে এই workload স্বচ্ছন্দে সামলাতে পারে।

## `net/http` আসলে কী

Go-র `net/http` server goroutine-per-connection। accept loop একটা goroutine-এ চলে। প্রতিটি নতুন connection একটা goroutine spawn করে যা পুরো request lifecycle সামলায়। runtime সেই goroutine-গুলোকে কম কয়েকটা OS thread-এর ওপর multiplex করে (সাধারণত `GOMAXPROCS`, ডিফল্ট `nproc`)।

```go
// Simplified version of http.Server.Serve
for {
    rw, err := l.Accept()
    if err != nil { /* ... */ }
    c := srv.newConn(rw)
    go c.serve(ctx)
}
```

ঐ `go c.serve(ctx)`-ই পুরো concurrency model। সস্তা, সহজ, হাজার হাজার পর্যন্ত scale করে।

## nginx আসলে কী

nginx হলো একটা _master_ process আর কম কয়েকটা _worker_ process, প্রতিটি নিজের event loop চালায়। ডিফল্ট হলো প্রতি CPU core-এ একটা করে worker (`worker_processes auto`)। প্রতিটি worker `epoll`-এর মাধ্যমে concurrent-ভাবে হাজার হাজার connection সামলাতে পারে।

```text
master (root, port 80/443)
  ├─ worker 0 (epoll loop, ~10K connections)
  ├─ worker 1 (epoll loop, ~10K connections)
  ├─ worker 2 ...
  └─ worker N
```

এই hybrid — একাধিক process (প্রতি core-এ একটা) প্রতিটি একটা event loop চালাচ্ছে — static-content আর reverse-proxy workload-এর জন্য gold standard। CPU-bound কাজ core-গুলোর মধ্যে parallelize হয়; একটা core-এর মধ্যে, event loop context-switch-এর overhead এড়ায়।

## কখন কোন মডেল বেছে নেবেন

আপনি যদি বেছে নিচ্ছেন — সাধারণত একটা ভাষা আর framework বেছে নিয়ে — এই হলো cheat sheet:

- **Static content, প্রচুর connection, request-প্রতি কম CPU** — event loop। nginx এর জন্যই বানানো।
- **CPU-bound কাজ, মাঝারি concurrency** — thread-per-request বা worker pool। JVM বা .NET এখানে জ্বলজ্বল করে।
- **মিশ্র I/O-ভারী + CPU-মাঝারি, developer ergonomics সহ** — goroutines (Go), virtual threads (Java 21+), বা async/await (Rust, আধুনিক Python)।
- **PHP / classic Ruby / classic Python** — prefork worker pool। PHP-FPM, Unicorn, Gunicorn sync worker। সহজ, debug-যোগ্য, কয়েক হাজার RPS-এর নিচে বেশিরভাগ app-এর জন্য ঠিকঠাক।

## কেন বেশিরভাগ production setup _দুটো_ মডেল ব্যবহার করে

একটা Go application server (goroutines)-এর সামনে nginx (event loop) বসান। দুটোই কেন?

- **nginx সস্তা CPU core-এর সামনে TLS, HTTP/2, আর gzip terminate করে, সেই কাজের জন্য optimize করা একটা মডেল দিয়ে।**
- **আপনার app dynamic logic goroutine-এ সামলায়, যা I/O-ভারী app কোডের জন্য optimal মডেল।**

প্রতিটি সে যা ভালো পারে তাই করছে। Go-তে TLS termination করা ঠিকই আছে — `crypto/tls` মজবুত — কিন্তু scale-এ, nginx দ্রুততর আর tune করা সহজ।

## সাধারণ ভুল

- **event loop-এ sync I/O কল করা।** Node-এ `fs.readFileSync`, `asyncio`-তে `time.sleep()`। পুরো loop আটকে যায়।
- **database-এর প্রতি রেকর্ডে একটা করে goroutine spawn করা।** goroutine সস্তা কিন্তু বিনামূল্যে নয়। প্রতি _connection_-এ একটা goroutine ঠিক আছে; লক্ষ লক্ষ রেকর্ডের inner-loop প্রতি iteration-এ একটা goroutine একটা leak।
- **prefork worker কম দেওয়া।** `pm.max_children = 5` সহ PHP-FPM পঞ্চম-এর পরের প্রতিটি request queue করবে। ডিফল্ট নয়, memory headroom-এর ভিত্তিতে সেট করুন।
- **thread বেশি দেওয়া।** `-Xss8m` আর 10,000 thread সহ একটা JVM OOM ডেকে আনছে। Java 21+-এ virtual thread ব্যবহার করুন অথবা async-এ যান।

## রিক্যাপ

- পাঁচটি সাধারণ মডেল: process-per-request, thread-per-request, prefork pool, event loop, goroutines/virtual threads।
- Event loop প্রতি CPU-তে অনেক connection scale করে; programming কঠিন; কখনো block করবেন না।
- Goroutines (আর virtual threads) event-loop performance সহ synchronous-দেখতে কোড দেয়।
- Production সাধারণত একটা goroutine/event-loop _application_ server-কে একটা event-loop _reverse proxy_ (nginx)-এর সাথে জোড়া বাঁধে।
- সঠিক মডেল workload-এর ওপর নির্ভর করে: I/O-bound বনাম CPU-bound বনাম concurrency-র মাত্রা।

পরের অধ্যায়: static file serve করা — "web server"-এর সেই অর্ধেক, যেটায় nginx আপনার app-এর চেয়ে _লজ্জাজনকভাবে_ ভালো।
