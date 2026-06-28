---
title: 'Profiling'
subtitle: 'Node.js --prof, Go pprof, Linux perf, and flamegraphs — finding where the time actually goes before guessing at optimizations.'
chapter: 2
level: 'intermediate'
readingTime: '11 min'
topics: ['profiling', 'flamegraph', 'pprof', 'perf', 'Node.js', 'Go', 'CPU', 'memory']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A doctor ordering tests before prescribing: you don't prescribe antibiotics before knowing whether the infection is bacterial. You don't optimize a function before knowing it's the bottleneck. Profiling is the test. "I think the problem is in the database layer" is a hypothesis; a flamegraph is evidence.

</Callout>

## The Rule: Profile Before Optimizing

Guessing is expensive. The bottleneck is almost never where you expect:

- The function you think is slow is often called once; the real bottleneck is called 10,000 times
- The slow path is often in a library you didn't write
- The problem is often memory pressure causing GC pauses, not the actual computation

Profile first. Always.

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

48% of CPU time in buffer operations → look at serialization code.

### Flamegraph from V8

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

The flamegraph shows call stacks. Wide bars = more CPU time. Tall stacks = deep call chains. You want to find the wide bars at the top — those are the actual CPU consumers.

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

Load in Chrome DevTools → Memory → Load snapshot. Look for objects that shouldn't be alive, or that accumulate over time.

**Detecting memory leaks in production:**

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

If `heapUsed` grows monotonically over hours without plateauing: memory leak.

## Go pprof

Go has profiling built into the standard library:

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

### Benchmarks

Benchmarks in Go are first-class:

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

`allocs/op` is critical — allocations trigger GC. Reduce allocations to reduce GC pressure.

## Linux perf

For system-level profiling (C extensions, JVM internals, kernel calls):

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

`-g` enables call graph (stack traces). `-F 99` = 99 samples/sec (avoids interference with 100Hz timer).

**Useful perf commands:**

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

## Async Performance in Node.js

The event loop is single-threaded. Blocking the event loop blocks all requests.

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

P99 event loop delay > 100ms = something is blocking the loop. Common culprits:

- JSON.parse on large payloads (synchronous, blocking)
- Crypto operations (use `crypto.subtle` async or worker threads)
- Large array sorts or regex on big strings
- Synchronous file system calls (`fs.readFileSync`)

**Offload CPU work:**

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

## Profiling in Production

Profiling in production is different from dev — you need low overhead:

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

Pyroscope samples CPU at 100Hz continuously, aggregates, and lets you query "what was the CPU doing between 14:00 and 14:05 yesterday?" — invaluable for post-incident analysis.
