---
title: 'Latency Thinking'
subtitle: 'P50 vs P99 vs P999, tail latency-র সমস্যা, latency budget, আর কেন average সবচেয়ে গুরুত্বপূর্ণ failure-গুলো লুকিয়ে ফেলে।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['latency', 'percentiles', 'P99', 'tail latency', 'latency budget', 'SLO']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমার বিয়ের ভোজ। উঠোনে লম্বা লাইনে অতিথিরা এগোচ্ছে — প্রথমে ভাত, তারপর কোরমা, শেষে মিষ্টি, তিনটে আলাদা স্টেশন একটার পর একটা। সিনা সব ঠিকঠাক সাজিয়েছেন, কিন্তু কোরমার হাঁড়ি একটাই আর পরিবেশক ধীর — ভাতের স্টেশন সেকেন্ডে প্লেট ভরে দিলেও কী লাভ, পুরো লাইন কোরমার স্টেশনের গতিতেই এগোচ্ছে। একটা স্টেশন জ্যাম হয়ে গেলে গোটা লাইন থমকে দাঁড়িয়ে যায়, সবাই অপেক্ষা করে।

ভোজ শেষে সিনা গর্ব করে বললেন, "গড়ে সবাই তো দশ মিনিটেই খেয়ে নিয়েছে।" পাশ থেকে খোয়ারিজমি মনে করিয়ে দিলেন — লাইনের একদম পেছনের হতভাগা কয়েকজন, ওই শেষ ১%, কোরমার হাঁড়ি বদলানোর সময় পড়ে গিয়ে পাক্কা এক ঘণ্টা দাঁড়িয়ে ছিল। গড় সংখ্যাটা ওই দুর্ভাগা অতিথিদের যন্ত্রণা পুরো ঢেকে দিয়েছিল। পরের বছর তাই সিনা তিনটে খাবার আলাদা টেবিলে একসাথে পরিবেশনের ব্যবস্থা করলেন — অতিথিরা তিনটে লাইনে ভাগ হয়ে একই সময়ে খাবার নিতে লাগল, একটার পর একটা অপেক্ষার দিন শেষ।

এই ভোজটাই আসলে **latency thinking**। পুরো লাইন যেমন সবচেয়ে ধীর স্টেশনের (কোরমা) গতিতে চলে, ঠিক তেমনি একটা request-এর মোট সময় তার সবচেয়ে ধীর ধাপটাই নির্ধারণ করে — তাই সবচেয়ে ধীর step-ই total latency-কে dominate করে। সিনার "গড়ে দশ মিনিট" যেমন ওই ১% অতিথির এক ঘণ্টা লুকিয়ে ফেলেছিল, তেমনি average আসল যন্ত্রণা লুকায় — সেটা ধরতে হয় **tail latency** দেখে, মানে **p95**/**p99** (সবচেয়ে দুর্ভাগা ১% request)। আর একটার পর একটা (**sequential**) স্টেশনের বদলে তিনটে খাবার একসাথে (**parallel**) পরিবেশন করলে যেমন লাইন দ্রুত এগোয়, কোডেও স্বাধীন কাজগুলো parallel-এ চালালে মোট সময় কমে। বাস্তবে একটা page load-এ যদি দশটা API একসাথে ডাকা যায় sequential-এর বদলে, আর slowest service-টার p99 চেপে ধরা যায়, তাহলেই ইউজার পায় দ্রুত, স্থিতিশীল অভিজ্ঞতা।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা coffee shop দিনে 1000 কাস্টমারকে সার্ভ করে: গড় অপেক্ষা 3 মিনিট। কিন্তু একজন কাস্টমার 45 মিনিট অপেক্ষা করেছিল কারণ order-এর মাঝপথে espresso মেশিন নষ্ট হয়ে গিয়েছিল। গড় তোমাকে সেই কাস্টমারের অভিজ্ঞতা সম্পর্কে কিছুই বলে না — আর তুমি যদি Amazon হও, সেই কাস্টমার হলো 1000 request-এর মধ্যে 1টা, যা scale-এ মানে প্রতি মিনিটে হাজার হাজার ইউজার 45 মিনিটের অপেক্ষা অনুভব করছে। গড় যা লুকায়, percentile তোমাকে সেটা বলে।

</Callout>

## কেন Average মিথ্যা বলে

50ms গড় response time শুনতে ভালোই লাগে। কিন্তু এই distribution-টা ভেবে দেখো:

```
900 requests at 10ms   →  contributes 9000ms
 90 requests at 100ms  →  contributes 9000ms
  9 requests at 500ms  →  contributes 4500ms
  1 request  at 9000ms →  contributes 9000ms
────────────────────────────────────────────
1000 requests, 31500ms total → average: 31.5ms
```

গড়: 31.5ms। দেখতে ঠিকঠাকই লাগে। কিন্তু 10% ইউজার 100ms+ অপেক্ষা করেছে, আর 1 জন ইউজার 9 সেকেন্ড অপেক্ষা করেছে।

**Percentile পুরো ছবিটা দেয়:**

- P50 (median): 10ms — বেশিরভাগ request দ্রুত
- P90: 100ms — 10% request এখানে
- P99: 500ms — 1% request এখানে
- P999: 9000ms — 0.1% request এখানে

## Tail Latency-র সমস্যা

Scale-এ, বিরল percentile-গুলো অনেক ইউজারকে প্রভাবিত করে।

প্রতিটা ইউজার যদি প্রতি page load-এ 10টা request করে:

```
P(any request slow) = 1 - P(all requests fast)
                    = 1 - (1 - P99_rate)^10
                    = 1 - (1 - 0.01)^10
                    = 1 - 0.99^10
                    = 1 - 0.904
                    = 9.6%
```

প্রতি request-এ 1% P99 মানে ~10% page load কমপক্ষে একটা ধীর request-এ পড়ে। তোমার P99 হয়ে যায় ইউজারদের P10।

Amazon-এর scale-এ: 100M requests/day × 1% P99 = দিনে 1M ধীর request। Tail latency একটা revenue সমস্যা।

## Latency Budget

এমন একটা request-এর জন্য যেটা 5টা service-কে serially কল করে:

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

Payment service-এর P99 যদি 300ms হয় আর তুমি 300ms budget রাখো: P99-তে ঠিক আছে। কিন্তু Payment-এর P999 হলো 2s — তুমি 0.1% ইউজারের জন্য budget ফাটিয়ে ফেলেছ।

**Serial vs parallel budget-এর অঙ্ককে প্রভাবিত করে:**

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

Critical path শনাক্ত করো — সবচেয়ে ধীর operation-গুলোর sequential chain। সেটাই তোমার floor। বাকি সবকিছু parallel-এ চলে।

## Latency সঠিকভাবে মাপা

### কোডে

```typescript
// Don't use Date.now() for sub-millisecond measurements
const start = process.hrtime.bigint(); // nanosecond precision

await doWork();

const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000; // ms
console.log(`${elapsed.toFixed(2)}ms`);
```

### Prometheus-এ Histogram Bucket

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

Bucket-এর সীমানা গুরুত্বপূর্ণ। তোমার SLO যদি 500ms হয়, একটা নির্ভুল quantile estimate পেতে তোমার তার আশেপাশে bucket দরকার (0.25, 0.5, 1.0) — Prometheus bucket-এর মধ্যে linearly interpolate করে।

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

বাস্তবসম্মত concurrency-তে চালাও — 10 concurrent ইউজার 1000-এর থেকে আলাদাভাবে আচরণ করে। খুঁজে বের করো latency কোথায় থেকে উঠতে শুরু করে।

## Little's Law

```
L = λ × W
```

- `L` — system-এ থাকা request-এর গড় সংখ্যা (concurrency)
- `λ` — arrival rate (requests/sec)
- `W` — একটা request system-এ কাটানো গড় সময় (latency)

সাজিয়ে নিলে: `W = L / λ`

তোমার server যদি 100টা concurrent request handle করে আর 200 req/sec প্রসেস করে:

```
W = 100 / 200 = 0.5 seconds average latency
```

Throughput না বাড়িয়ে latency অর্ধেক করতে: concurrency কমাও (কম request queue করো) অথবা `W` কমাও (প্রতিটা request দ্রুততর করো)।

## চারটে Latency-র উৎস

Latency-র প্রতিটা millisecond চারটে জায়গার একটা থেকে আসে:

**1. CPU computation**

```
Profile: CPU time in your code, not in I/O waits
Tool: Node.js --prof, Go pprof, async_hooks
Fix: Algorithmic improvement, caching, moving work off the critical path
```

**2. I/O wait (DB, external API)**

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

বেশিরভাগ optimization-এর সময় খরচ হয় #2-তে। অনুমান করার আগে profile করো।

## Latency vs Throughput ট্রেড-অফ

Batching throughput বাড়ায় কিন্তু latency-র ক্ষতি করে:

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

Batching latency-কে (item সর্বোচ্চ 10ms অপেক্ষা করে) throughput-এর (100x কম DB roundtrip) বিনিময়ে দেয়।

তোমার workload-এর ভিত্তিতে বেছে নাও:

- User-facing API: latency-র জন্য optimize করো (P99 SLO)
- Bulk data processing: throughput-এর জন্য optimize করো (items/sec)
- Analytics write: আগ্রাসীভাবে batch করো (latency গুরুত্বপূর্ণ না, throughput গুরুত্বপূর্ণ)
