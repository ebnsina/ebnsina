---
title: 'Latency Thinking'
subtitle: 'P50 vs P99 vs P999, the tail latency problem, latency budgets, and why averages hide the failures that matter most.'
chapter: 1
level: 'beginner'
readingTime: '8 min'
topics: ['latency', 'percentiles', 'P99', 'tail latency', 'latency budget', 'SLO']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A coffee shop that serves 1000 customers a day: the average wait is 3 minutes. But one customer waited 45 minutes because the espresso machine broke mid-order. The average tells you nothing about that customer's experience — and if you're Amazon, that customer is 1 in 1000 requests, which at scale means thousands of users per minute experiencing 45-minute waits. Percentiles tell you what the average hides.

</Callout>

## Why Averages Lie

Average response time of 50ms sounds good. But consider this distribution:

```
900 requests at 10ms   →  contributes 9000ms
 90 requests at 100ms  →  contributes 9000ms
  9 requests at 500ms  →  contributes 4500ms
  1 request  at 9000ms →  contributes 9000ms
────────────────────────────────────────────
1000 requests, 31500ms total → average: 31.5ms
```

Average: 31.5ms. Looks fine. But 10% of users waited 100ms+, and 1 user waited 9 seconds.

**Percentiles give the full picture:**

- P50 (median): 10ms — most requests are fast
- P90: 100ms — 10% of requests here
- P99: 500ms — 1% of requests here
- P999: 9000ms — 0.1% of requests here

## The Tail Latency Problem

At scale, rare percentiles affect many users.

If each user makes 10 requests per page load:

```
P(any request slow) = 1 - P(all requests fast)
                    = 1 - (1 - P99_rate)^10
                    = 1 - (1 - 0.01)^10
                    = 1 - 0.99^10
                    = 1 - 0.904
                    = 9.6%
```

A P99 of 1% per request means ~10% of page loads hit at least one slow request. Your P99 becomes users' P10.

At Amazon's scale: 100M requests/day × 1% P99 = 1M slow requests per day. Tail latency is a revenue problem.

## Latency Budgets

For a request that calls 5 services serially:

```
User request budget: 500ms
  └─ API Gateway:        10ms
  └─ Auth service:       20ms
  └─ Order service:      100ms
      └─ DB query:       50ms
      └─ Cache lookup:   5ms
  └─ Payment service:    300ms
      └─ Stripe API:     250ms
      └─ DB write:       30ms
  └─ Response:           10ms
```

If Payment service P99 is 300ms and you budget 300ms: fine at P99. But P999 of Payment is 2s — you've blown the budget for 0.1% of users.

**Serial vs parallel affects budget math:**

```
// Serial — budgets add up
const auth = await authService.verify(token);     // 20ms
const order = await orderService.get(orderId);    // 100ms
// Total: 120ms minimum

// Parallel — budgets overlap
const [auth, order] = await Promise.all([
  authService.verify(token),    // 20ms
  orderService.get(orderId),    // 100ms
]);
// Total: 100ms (max of the two)
```

Identify the critical path — the sequential chain of slowest operations. That's your floor. Everything else runs in parallel.

## Measuring Latency Correctly

### In Code

```typescript
// Don't use Date.now() for sub-millisecond measurements
const start = process.hrtime.bigint(); // nanosecond precision

await doWork();

const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000; // ms
console.log(`${elapsed.toFixed(2)}ms`);
```

### Histogram Buckets in Prometheus

```typescript
import { Histogram } from 'prom-client';

const httpDuration = new Histogram({
	name: 'http_request_duration_seconds',
	help: 'Request duration',
	labelNames: ['route', 'method', 'status'],
	// Buckets chosen to match your SLO breakpoints
	buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// Query P99:
// histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

Bucket boundaries matter. If your SLO is 500ms, you need buckets around it (0.25, 0.5, 1.0) to get an accurate quantile estimate — Prometheus interpolates linearly between buckets.

### Load Testing

```bash
# autocannon — Node.js HTTP benchmarking
npx autocannon -c 100 -d 30 http://localhost:3000/api/orders

# Output:
# Stat     | 2.5% | 50% | 97.5% | 99%  | Avg   | Stdev | Max
# Latency  | 15ms | 23ms| 89ms  | 134ms| 24.1ms| 18.2ms| 2341ms

# oha — fast, pretty output with histogram
oha -n 10000 -c 100 http://localhost:3000/api/orders
```

Run under realistic concurrency — 10 concurrent users behave differently than 1000. Find where latency starts climbing.

## Little's Law

```
L = λ × W
```

- `L` — average number of requests in the system (concurrency)
- `λ` — arrival rate (requests/sec)
- `W` — average time a request spends in the system (latency)

Rearranged: `W = L / λ`

If your server handles 100 concurrent requests and processes 200 req/sec:

```
W = 100 / 200 = 0.5 seconds average latency
```

To halve latency without increasing throughput: reduce concurrency (queue fewer requests) or reduce `W` (make each request faster).

## The Four Latency Sources

Every millisecond of latency comes from one of four places:

**1. CPU computation**

```
Profile: CPU time in your code, not in I/O waits
Tool: Node.js --prof, Go pprof, async_hooks
Fix: Algorithmic improvement, caching, moving work off the critical path
```

**2. I/O wait (DB, external APIs)**

```
Profile: Time spent waiting for responses
Tool: Slow query logs, APM traces, OpenTelemetry
Fix: Query optimization, caching, connection pooling, parallelization
```

**3. Network**

```
Profile: RTT between services
Tool: ping, traceroute, service mesh latency metrics
Fix: Colocate services, use faster protocols (gRPC/HTTP2), reduce round trips
```

**4. Queue wait**

```
Profile: Time requests wait before processing starts
Tool: active connections vs server capacity, queue depth metrics
Fix: Increase server capacity, reduce queue length, shed load early
```

Most optimization time is in #2. Profile before guessing.

## Latency vs Throughput Trade-Off

Batching improves throughput but hurts latency:

```typescript
// No batching: each item processed immediately (low latency, low throughput)
async function handleRequest(item: Item) {
	await db.insert(item); // 5ms per insert
}

// Batching: wait 10ms, then insert up to 100 items at once (high latency, high throughput)
const batch: Item[] = [];
let timer: NodeJS.Timeout;

async function handleRequest(item: Item) {
	batch.push(item);
	clearTimeout(timer);
	timer = setTimeout(async () => {
		const toInsert = batch.splice(0);
		await db.batchInsert(toInsert); // 15ms for 100 items vs 500ms serially
	}, 10); // wait 10ms to collect a batch
}
```

Batching trades latency (items wait up to 10ms) for throughput (100x fewer DB roundtrips).

Choose based on your workload:

- User-facing API: optimize for latency (P99 SLO)
- Bulk data processing: optimize for throughput (items/sec)
- Analytics writes: batch aggressively (latency doesn't matter, throughput does)
