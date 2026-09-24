---
title: 'Profiling'
subtitle: 'Node.js --prof, Go pprof, Linux perf, আর flamegraph — optimization নিয়ে অনুমান করার আগে সময়টা আসলে কোথায় যাচ্ছে সেটা খুঁজে বের করা।'
chapter: 2
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['profiling', 'flamegraph', 'pprof', 'perf', 'Node.js', 'Go', 'CPU', 'memory']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন ডাক্তার prescribe করার আগে টেস্ট দেন: infection টা bacterial কিনা না জেনে তুমি antibiotic prescribe করো না। একটা function bottleneck কিনা না জেনে তুমি সেটা optimize করো না। Profiling হলো সেই টেস্ট। "আমার মনে হয় সমস্যাটা database layer-এ" হলো একটা hypothesis; একটা flamegraph হলো প্রমাণ।

</Callout>

## গল্পে বুঝি

খোয়ারিজমির একটা পুরনো গাড়ি হঠাৎ ভয়ানক ধীর হয়ে গেছে — চাপ দিলেও টানছে না। তার শিক্ষানবিশ সিনা মাথা চুলকে বলল, "নিশ্চয়ই ফুয়েল পাম্প নষ্ট," আর পুরনো পাম্প খুলে নতুন লাগিয়ে দিল। কিছু বদলাল না। এরপর সে অনুমানে স্পার্ক প্লাগ বদলাল, তারপর ফুয়েল ফিল্টার — তিনটে ভালো পার্ট খুলে ফেলল, একগাদা টাকা আর গোটা দিন গেল, অথচ গাড়ি সেই আগের মতোই ধীর।

ওস্তাদ খোয়ারিজমি এসে হাসলেন। একটা পার্টেও হাত না দিয়ে আগে তিনি ইঞ্জিনে ডায়াগনস্টিক মিটার লাগালেন। মিটার সেকেন্ডে দেখিয়ে দিল আসল দোষী — একটা চোক হয়ে যাওয়া ক্যাটালিটিক কনভার্টার নিষ্কাশন আটকে সব শক্তি খেয়ে ফেলছে। তিনি শুধু ওই একটা জিনিস সারালেন, আর গাড়ি উড়তে শুরু করল। বাকি যেসব পার্ট সিনা বদলেছিল, তার একটাও আসল সমস্যা ছিল না।

এই গল্পটাই আসলে **profiling**। সিনার অনুমানে ভালো পার্ট বদলানো হলো guesswork দিয়ে premature optimization — টাকা আর সময় দুটোই নষ্ট। ডায়াগনস্টিক মিটার হলো **profiler**, আর চোক হওয়া কনভার্টারটাই আসল **bottleneck** বা hotspot। মিটার দিয়ে সেটা pinpoint করে শুধু ওই এক জায়গা সারানোটাই হলো প্রমাণিত hotspot-টা optimize করা — অনুমান নয়। বাস্তবেও ঠিক এভাবেই কাজ হয়: কোন function ধীর সেটা আন্দাজ না করে আগে profiler চালিয়ে দেখো CPU/memory-টা আসলে কোথায় খরচ হচ্ছে, flamegraph-এর চওড়া bar-টা খুঁজে বের করো, তারপর শুধু সেটাই ঠিক করো — Google, Netflix থেকে শুরু করে সবাই production-এ Pyroscope-এর মতো continuous profiler দিয়ে ঠিক এটাই করে।

## নিয়ম: Optimize করার আগে Profile করো

অনুমান করা ব্যয়বহুল। Bottleneck প্রায় কখনোই সেখানে থাকে না যেখানে তুমি আশা করো:

- যে function-কে তুমি ধীর মনে করো সেটা প্রায়ই একবার কল হয়; আসল bottleneck 10,000 বার কল হয়
- ধীর path প্রায়ই এমন একটা library-তে থাকে যেটা তুমি লেখোনি
- সমস্যাটা প্রায়ই GC pause ঘটানো memory pressure, আসল computation না

আগে profile করো। সবসময়।

## Node.js CPU Profiling

```bash
# Built-in V8 profiler — runs in production safely
node --prof server.js

# After collecting (run load: ab -n 10000 -c 100 http://localhost:3000/)
# Ctrl-C to stop, generates isolate-*.log

# Process the profile
node --prof-process isolate-*.log > profile.txt
cat profile.txt
```

Output:

```
 [Bottom up (heavy) profile]:
  Note: percentage shows a share of a particular caller in the total
  amount of its parent calls.
  Callers occupying less than 1.0% are not shown.

   ticks parent  name
  12943   47.2%  node:internal/buffer
   8234   30.0%  /app/src/serialization.js:45:serialize
   3421   12.5%  node:crypto
```

buffer operation-এ 48% CPU time → serialization code দেখো।

### V8 থেকে Flamegraph

```bash
# 0x — better than raw --prof-process
npm install -g 0x

# Run with profiling
0x -o flamegraph.html -- node server.js

# Or collect against running process
0x --collect-only -o profile/ -- node server.js
# ... run load test ...
# Ctrl-C → generates flamegraph.html
open flamegraph.html
```

Flamegraph call stack দেখায়। চওড়া bar = বেশি CPU time। লম্বা stack = গভীর call chain। তুমি উপরের চওড়া bar-গুলো খুঁজতে চাও — সেগুলোই আসল CPU consumer।

### Node.js Memory Profiling

```typescript
// Heap snapshot — good for memory leaks
import v8 from 'v8';
import fs from 'fs';

// In production, expose via a protected endpoint
app.get('/debug/heap-snapshot', (req, res) => {
	const filename = `/tmp/heap-${Date.now()}.heapsnapshot`;
	const snapshot = v8.writeHeapSnapshot(filename);
	res.download(filename);
});
```

Chrome DevTools-এ load করো → Memory → Load snapshot। এমন object খোঁজো যেগুলোর জীবিত থাকার কথা না, অথবা যেগুলো সময়ের সাথে জমতে থাকে।

**Production-এ memory leak শনাক্ত করা:**

```typescript
import { setInterval } from 'timers';

// Log heap usage every 30 seconds
setInterval(() => {
	const mem = process.memoryUsage();
	log.info(
		{
			heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
			heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
			rss: Math.round(mem.rss / 1024 / 1024),
			external: Math.round(mem.external / 1024 / 1024)
		},
		'Memory usage'
	);
}, 30_000);
```

`heapUsed` যদি ঘণ্টার পর ঘণ্টা plateau না করে একটানা বাড়তে থাকে: memory leak।

## Go pprof

Go-তে profiling standard library-তেই built-in:

```go
import (
    "net/http"
    _ "net/http/pprof"   // registers /debug/pprof/* handlers
    "runtime"
)

func main() {
    // Enable block and mutex profiling (disabled by default)
    runtime.SetBlockProfileRate(1)    // profile all blocking events
    runtime.SetMutexProfileFraction(1)

    // pprof HTTP server (separate from your app port — protect this!)
    go func() {
        log.Println(http.ListenAndServe("localhost:6060", nil))
    }()

    // ... your app
}
```

```bash
# Collect 30s CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Inside pprof:
(pprof) top10        # top 10 functions by CPU time
(pprof) web          # open flamegraph in browser (requires graphviz)
(pprof) list myFunc  # annotated source for a function

# Heap profile
go tool pprof http://localhost:6060/debug/pprof/heap
(pprof) top10 -cum   # cumulative allocations

# Goroutine profile — detect goroutine leaks
go tool pprof http://localhost:6060/debug/pprof/goroutine
(pprof) top          # goroutines by count

# Block profile — where goroutines block waiting
go tool pprof http://localhost:6060/debug/pprof/block
```

### Go Flamegraph

```bash
# Using pprof's built-in HTTP server
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/profile?seconds=30
# Opens browser with flamegraph, call tree, top functions
```

### Benchmark

Go-তে benchmark first-class:

```go
// order_test.go
func BenchmarkProcessOrder(b *testing.B) {
    order := generateTestOrder()
    b.ResetTimer()                    // don't count setup time

    b.RunParallel(func(pb *testing.PB) {  // parallel benchmark
        for pb.Next() {
            if err := processOrder(order); err != nil {
                b.Fatal(err)
            }
        }
    })
}
```

```bash
# Run benchmark with CPU and memory profiling
go test -bench=BenchmarkProcessOrder -benchmem \
  -cpuprofile=cpu.prof \
  -memprofile=mem.prof \
  -benchtime=10s

# Output:
# BenchmarkProcessOrder-8   234156   5124 ns/op   1024 B/op   12 allocs/op

# Analyze
go tool pprof cpu.prof
```

`allocs/op` গুরুত্বপূর্ণ — allocation GC trigger করে। GC pressure কমাতে allocation কমাও।

## Linux perf

System-level profiling-এর জন্য (C extension, JVM internals, kernel call):

```bash
# CPU profile for 30 seconds
perf record -g -F 99 -p $(pgrep node) -- sleep 30
perf report                    # TUI report
perf report --stdio            # text output

# Flamegraph from perf
perf script | \
  stackcollapse-perf.pl | \
  flamegraph.pl > flamegraph.svg
```

`-g` call graph (stack trace) সক্ষম করে। `-F 99` = 99 samples/sec (100Hz timer-এর সাথে interference এড়ায়)।

**উপকারী perf command:**

```bash
# What system calls is the process making?
strace -p <pid> -c       # count system calls

# Is the process blocked on I/O?
perf stat -e 'block:*' -p <pid>

# Cache misses (memory bottleneck)
perf stat -e cache-misses,cache-references,instructions,cycles -p <pid>

# System-wide top (like top but with CPU cycles)
perf top
```

## Node.js-এ Async Performance

Event loop single-threaded। Event loop block করা মানে সব request block করা।

```bash
# Measure event loop lag (blocked = slow I/O or CPU)
npm install -g @nicolo-ribaudo/clinic
clinic doctor -- node server.js
```

```typescript
// Detect event loop lag in code
import { monitorEventLoopDelay } from 'perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
	log.info(
		{
			p50: h.percentile(50) / 1e6, // convert nanoseconds to ms
			p99: h.percentile(99) / 1e6,
			max: h.max / 1e6
		},
		'Event loop delay'
	);
	h.reset();
}, 10_000);
```

P99 event loop delay > 100ms = কিছু একটা loop block করছে। সাধারণ দোষী:

- বড় payload-এ JSON.parse (synchronous, blocking)
- Crypto operation (`crypto.subtle` async অথবা worker thread ব্যবহার করো)
- বড় array sort অথবা বড় string-এ regex
- Synchronous file system call (`fs.readFileSync`)

**CPU-র কাজ offload করা:**

```typescript
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// Worker thread for CPU-intensive work
if (!isMainThread) {
	const result = heavyCpuWork(workerData.input);
	parentPort!.postMessage(result);
	process.exit(0);
}

function runInWorker(input: any): Promise<any> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(__filename, { workerData: { input } });
		worker.on('message', resolve);
		worker.on('error', reject);
	});
}
```

## Production-এ Profiling

Production-এ profiling dev থেকে আলাদা — তোমার low overhead দরকার:

```bash
# Node.js: continuous profiling with 0% overhead using V8's sampling profiler
# (sampling at 1ms intervals — negligible overhead)
node --prof server.js &
kill -USR2 $(cat server.pid)   # dump profile without stopping process
```

**Pyroscope** — continuous profiling service (open source):

```typescript
import Pyroscope from '@pyroscope/nodejs';

Pyroscope.init({
	serverAddress: 'http://pyroscope:4040',
	appName: 'order-service'
});
Pyroscope.start();
```

Pyroscope একটানা 100Hz-এ CPU sample করে, aggregate করে, আর তোমাকে query করতে দেয় "গতকাল 14:00 আর 14:05-এর মধ্যে CPU কী করছিল?" — post-incident বিশ্লেষণের জন্য অমূল্য।
