---
title: 'Sizing Fundamentals'
subtitle: 'CPU, memory, disk, and network — how to translate request load into resource requirements before you buy anything.'
chapter: 1
level: 'beginner'
readingTime: '9 min'
topics: ['sizing', 'capacity planning', 'CPU', 'memory', 'throughput']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Sizing a parking lot before building a mall: you count expected cars at peak hour, add buffer for bad days, decide how many floors you need, and build it before you open — not after the lot fills up and traffic backs onto the highway.

</Callout>

## The Four Resources

Every server constraint comes down to four resources. A bottleneck in any one of them caps your capacity regardless of how much headroom you have on the others.

**CPU** — compute work per unit time. Measured in cores and utilization percentage. Bottlenecks when: request handlers do heavy computation, serialization/deserialization is frequent, encryption overhead is high.

**Memory** — working set size. Bottlenecks when: caches hold too much data, connection pools grow large, in-memory datastores (Redis) approach instance RAM.

**Disk I/O** — read/write throughput and IOPS (operations per second). Bottlenecks when: databases write faster than disk can absorb, logs flush to slow storage, application reads large files per request.

**Network** — bandwidth in/out. Bottlenecks when: responses are large (images, reports), upload-heavy workloads, inter-service traffic is high.

## Request Cost Model

Before sizing anything, measure what a single request costs:

```typescript
// Instrument your handlers to capture resource use
app.use(async (req, res, next) => {
	const start = process.hrtime.bigint();
	const memBefore = process.memoryUsage().heapUsed;

	res.on('finish', () => {
		const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
		const memDelta = process.memoryUsage().heapUsed - memBefore;

		logger.info({
			path: req.route?.path,
			durationMs,
			memDeltaKb: memDelta / 1024,
			responseBytes: parseInt(res.get('content-length') ?? '0'),
			status: res.statusCode
		});
	});

	next();
});
```

Profile in production or under realistic load (staging with production data volume). Averages lie — collect p50, p95, p99 latency and resource use.

## Working Backwards from RPS

**Requests per second (RPS)** is your primary load metric. Everything else derives from it.

```
Given:
  Peak RPS: 500
  CPU cost per request: 2ms (based on profiling)
  Request duration: 50ms (mostly I/O wait)

Concurrent requests at any moment:
  = RPS × avg_duration_seconds
  = 500 × 0.05
  = 25 concurrent requests

CPU required:
  = RPS × CPU_cost_per_request
  = 500 × 0.002s
  = 1 core fully utilized

(A 4-core server handles 4x → 2000 RPS on CPU alone)
```

**Little's Law:** `L = λ × W`

- L = average number of concurrent requests
- λ = arrival rate (RPS)
- W = average request duration (seconds)

This tells you how many concurrent connections your server must support — which drives connection pool sizing, thread pool sizing, and memory allocation.

```typescript
function estimateConcurrency(rps: number, avgDurationMs: number): number {
	return rps * (avgDurationMs / 1000);
}

function estimateCpuCores(rps: number, cpuTimePerRequestMs: number): number {
	return (rps * cpuTimePerRequestMs) / 1000;
}

// Example
const concurrency = estimateConcurrency(500, 50); // 25
const coresNeeded = estimateCpuCores(500, 2); // 1 core
```

## Memory Sizing

Memory has three main consumers:

**Per-connection overhead:**

```
Node.js: ~1-2MB per connection (including V8 overhead)
Go: ~8KB per goroutine
Java: ~1MB per thread (with thread-per-request model)

At 25 concurrent: Node.js ~50MB connection overhead
```

**Application working set:**

- In-memory cache (if using node-cache, LRU, etc.)
- Database query result buffers
- Request/response bodies in flight

**Runtime overhead:**

- V8 heap (Node.js): base ~50MB
- JVM: depends on heap settings
- Go binary: base ~10MB

```typescript
function estimateMemoryMb(
	concurrentRequests: number,
	perRequestMb: number,
	cacheMb: number,
	runtimeMb: number
): number {
	return concurrentRequests * perRequestMb + cacheMb + runtimeMb;
}

// Minimum memory: 25 × 2MB + 256MB cache + 50MB runtime = 356MB
// → provision 1GB with headroom
```

## Disk I/O Sizing

For database servers, disk I/O is the most common bottleneck:

```
IOPS needed = write_rate + read_rate

For a write-heavy app at 500 RPS with 2 DB writes per request:
  Write IOPS = 1000
  Random read IOPS (cache misses) = ~200 (assuming 80% cache hit)
  Total IOPS = 1200

Cloud disk options:
  AWS gp3: 3000 IOPS base (free), up to 16000 (paid)
  AWS io2: up to 64000 IOPS (expensive)
  NVMe SSD (bare metal): 100k+ IOPS
```

For application servers (not databases), disk I/O is rarely the bottleneck unless you're writing logs synchronously — use async logging or ship logs over network.

## Network Sizing

```
Bandwidth = RPS × avg_response_size_bytes × 8 bits/byte

At 500 RPS with 10KB avg response:
  = 500 × 10,000 × 8 bits
  = 40,000,000 bits/second
  = 40 Mbps

A 1Gbps link handles 25x this. Not usually the bottleneck for APIs.

For video streaming or file downloads:
  1080p video: ~8 Mbps per stream
  At 1000 concurrent streams: 8 Gbps — now network matters
```

## Headroom and Growth

Never size for your current load. Size for your peak load plus headroom:

```
Target utilization at peak: 50-70%
(leaves headroom for spikes and for adding capacity before hitting limits)

If you need 1 CPU core at peak RPS:
  Size for 2 cores (50% utilization target)

If memory needed is 356MB:
  Provision 1GB (roughly 50% target)
```

**Growth buffer:** If you expect 2x growth in 12 months and provisioning takes 2 weeks, size for 2x now. Overprovisioning compute is cheaper than the engineering time to emergency-scale.

## Profiling to Verify

Model first, then verify with measurement:

```bash
# Load test to find actual limits
npx autocannon -c 50 -d 30 http://localhost:3000/api/users
# -c 50: 50 concurrent connections
# -d 30: 30 second duration

# Results: RPS achieved, latency p50/p95/p99, error rate
# Watch CPU, memory via: htop, vmstat, or your monitoring

# Find where the bottleneck is:
# CPU pegged → need more cores or optimize code
# Memory OOM → reduce per-request allocation or add RAM
# Disk I/O wait → SSD upgrade or read-replica
# Network saturation → CDN for static, compression for APIs
```

Don't guess at bottlenecks. Load test, watch metrics, and let the data tell you where the ceiling is.
