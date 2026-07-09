---
title: 'Sizing Fundamentals'
subtitle: 'CPU, memory, disk আর network — কিছু কেনার আগেই request load-কে resource requirement-এ কীভাবে অনুবাদ করবেন।'
chapter: 1
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['sizing', 'capacity planning', 'CPU', 'memory', 'throughput']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা mall বানানোর আগে parking lot-এর সাইজ ঠিক করা: peak hour-এ কতগুলো গাড়ি আসবে সেটা গুনে নেন, খারাপ দিনের জন্য buffer যোগ করেন, কত floor লাগবে ঠিক করেন, এবং খোলার আগেই বানিয়ে ফেলেন — lot ভরে গিয়ে traffic highway-তে ফিরে আসার পরে নয়।

</Callout>

## চারটি Resource

প্রতিটা server-এর constraint শেষ পর্যন্ত চারটা resource-এ এসে দাঁড়ায়। এদের যেকোনো একটাতে bottleneck হলে বাকিগুলোতে যতই headroom থাকুক, আপনার capacity সেখানেই আটকে যায়।

**CPU** — প্রতি unit time-এ compute work। core আর utilization percentage-এ মাপা হয়। Bottleneck হয় যখন: request handler-গুলো ভারী computation করে, serialization/deserialization ঘন ঘন হয়, encryption overhead বেশি।

**Memory** — working set-এর সাইজ। Bottleneck হয় যখন: cache-এ অনেক বেশি data থাকে, connection pool বড় হয়ে যায়, in-memory datastore (Redis) instance RAM-এর কাছাকাছি পৌঁছে যায়।

**Disk I/O** — read/write throughput আর IOPS (প্রতি সেকেন্ডে operation)। Bottleneck হয় যখন: database disk যত দ্রুত শুষে নিতে পারে তার চেয়ে দ্রুত write করে, log ধীর storage-এ flush হয়, application প্রতি request-এ বড় file পড়ে।

**Network** — bandwidth in/out। Bottleneck হয় যখন: response বড় হয় (image, report), upload-heavy workload, inter-service traffic বেশি।

## Request Cost Model

কিছু sizing করার আগে মাপুন একটা single request-এর খরচ কত:

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

Production-এ অথবা বাস্তবসম্মত load-এ (production-এর data volume সহ staging) profile করুন। Average মিথ্যা বলে — p50, p95, p99 latency আর resource use সংগ্রহ করুন।

## RPS থেকে উল্টো দিকে হিসাব

**Requests per second (RPS)** হলো আপনার প্রধান load metric। বাকি সবকিছু এর থেকে বের হয়।

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

- L = গড় concurrent request-এর সংখ্যা
- λ = arrival rate (RPS)
- W = গড় request duration (সেকেন্ড)

এটা আপনাকে বলে দেয় আপনার server-কে কতগুলো concurrent connection support করতে হবে — যা connection pool sizing, thread pool sizing, আর memory allocation-এর হিসাব চালায়।

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

Memory-র তিনটা প্রধান খরচকারী আছে:

**Per-connection overhead:**

```
Node.js: ~1-2MB per connection (including V8 overhead)
Go: ~8KB per goroutine
Java: ~1MB per thread (with thread-per-request model)

At 25 concurrent: Node.js ~50MB connection overhead
```

**Application working set:**

- In-memory cache (যদি node-cache, LRU, ইত্যাদি ব্যবহার করেন)
- Database query result buffer
- চলমান request/response body

**Runtime overhead:**

- V8 heap (Node.js): base ~50MB
- JVM: heap setting-এর উপর নির্ভর করে
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

Database server-এর জন্য disk I/O সবচেয়ে সাধারণ bottleneck:

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

Application server-এর জন্য (database নয়), disk I/O খুব কমই bottleneck হয় — যদি না আপনি synchronously log write করেন। async logging ব্যবহার করুন বা network-এর উপর দিয়ে log পাঠান।

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

## Headroom আর Growth

কখনো আপনার বর্তমান load-এর জন্য sizing করবেন না। আপনার peak load plus headroom-এর জন্য sizing করুন:

```
Target utilization at peak: 50-70%
(leaves headroom for spikes and for adding capacity before hitting limits)

If you need 1 CPU core at peak RPS:
  Size for 2 cores (50% utilization target)

If memory needed is 356MB:
  Provision 1GB (roughly 50% target)
```

**Growth buffer:** যদি ১২ মাসে 2x growth আশা করেন এবং provisioning-এ ২ সপ্তাহ লাগে, এখনই 2x-এর জন্য sizing করুন। compute overprovision করা emergency-scale করার engineering time-এর চেয়ে সস্তা।

## যাচাই করার জন্য Profiling

আগে model বানান, তারপর measurement দিয়ে যাচাই করুন:

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

Bottleneck নিয়ে অনুমান করবেন না। Load test করুন, metric দেখুন, আর data-কেই বলতে দিন ceiling কোথায়।
