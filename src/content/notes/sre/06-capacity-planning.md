---
title: 'Capacity Planning & Load Testing'
subtitle: "Little's Law, Universal Scalability Law, headroom, আর একটা রিয়েল k6 + Locust load test যা তুমি আজই চালাতে পারো।"
chapter: 6
level: 'intermediate'
readingTime: '18 মিনিট'
topics: ['capacity planning', 'load testing', 'k6', 'queueing theory', "Little's Law"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একটা দ্রুত বেড়ে ওঠা শহরের পানি সরবরাহ বিভাগের ইঞ্জিনিয়ার। তার কাজ একটাই — গরমকালে যেন কোনোদিন কল খুললে পানি না আসে, এমনটা না হয়। কিন্তু শহরটা প্রতি বছর ফুলেফেঁপে উঠছে, নতুন এলাকা, নতুন বাড়িঘর। তাই সে প্রতিদিন কল খুলে বসে থাকে না; বরং সে গত কয়েক বছরের জনসংখ্যা বাড়ার curve-টা মন দিয়ে দেখে, আর সেখান থেকে হিসাব কষে বের করে — আগামী গরমে দুপুরবেলা সবচেয়ে বেশি পানি টানার সময় ঠিক কতটা চাহিদা হবে।

সেই হিসাবটা হাতে নিয়ে ফাতিমা কল শুকিয়ে যাওয়ার দিনের জন্য বসে থাকে না। সে আগেভাগেই বাড়তি reservoir বানায়, মোটা পাইপ বসায় — আর সেটাও ঠিক যতটুকু লাগবে ততটুকু নয়, একটু বেশি রেখে, যাতে হঠাৎ তাপপ্রবাহে চাহিদা লাফিয়ে বাড়লেও কুলিয়ে যায়। আর সবচেয়ে চালাক কাজটা হলো — নতুন পাইপলাইন চালু করার আগে সে ইচ্ছে করে খুব জোরে পানি ঠেলে দিয়ে দেখে কোন জোড়টা কত চাপে ফেটে যায়, কোথায় আসল সীমা। এতে সে দুর্ঘটনার দিন নয়, নিয়ন্ত্রিত পরীক্ষায় দুর্বল জায়গাটা খুঁজে বের করে ফেলে।

এই গল্পটাই আসলে **capacity planning**। জনসংখ্যা বাড়ার curve দেখে আগামী গরমের peak চাহিদা বের করাটা হলো growth trend থেকে demand **forecast** করা; সীমার ঠিক গায়ে না বসে একটু বেশি reservoir আর পাইপ আগেভাগে বানানোটা হলো **headroom** রেখে আগেভাগে **provision** করা; আর জোরে পানি ঠেলে পাইপ কোথায় ফাটে দেখাটা হলো **load testing** দিয়ে সিস্টেমের আসল সীমা খুঁজে বের করা। বাস্তবে ঠিক এভাবেই — Prometheus-এর পুরনো ডেটা থেকে peak RPS forecast করে, headroom সহ replica আগে থেকে provision করে, আর k6 দিয়ে stress test চালিয়ে — টিমরা নিশ্চিত করে সিস্টেম যেন spike-এ ধসে না পড়ে, আবার ফাঁকা বসে থাকা সার্ভারের পেছনে অযথা টাকাও না যায়।

## Capacity planning কেন, autoscaling নয়

Autoscaling reactive। এটা যখন kick in করে, ততক্ষণে তোমার user latency spike টের পেয়ে গেছে। Capacity planning proactive: তুমি জানো তোমার সিস্টেম launch সামলাবে _traffic আসার আগেই_।

মূল প্রশ্ন: **কোন point-এ আমার সিস্টেম তার SLO মেটানো বন্ধ করে?** ঐ সংখ্যাটা খুঁজে বের করো, তারপর load-কে তার আরামদায়কভাবে নিচে রাখো।

## Little's Law (যে একটা formula তোমাকে জানতেই হবে)

```
L = λ × W

L = average number of items in the system (concurrency)
λ = arrival rate (requests per second)
W = average time each item spends in the system (latency)
```

এটুকুই। তিনটা measurable পরিমাণ থেকে চতুর্থটা derive করো।

```typescript
// Worked example: how many app server replicas do I need?

// Measurements from production:
const arrivalRate = 5_000; // 5k req/s
const avgLatencyMs = 80; // 80ms per request
const concurrencyPerReplica = 50; // each pod handles 50 concurrent reqs
// before its event loop chokes

// Concurrent requests in flight (Little's Law)
const concurrencyL = arrivalRate * (avgLatencyMs / 1000);
// = 5000 * 0.08 = 400 concurrent requests

// Required replicas
const replicas = Math.ceil(concurrencyL / concurrencyPerReplica);
// = ceil(400 / 50) = 8 replicas

// Add 50% headroom for spikes and rolling deploys
const provisionedReplicas = Math.ceil(replicas * 1.5);
// = 12 replicas
```

formula-টা মুখস্থ করো। তুমি এটা interview-এ, capacity review-তে, আর তোমার ক্যারিয়ারের বাকি সময়ের প্রতিটা রিয়েল planning exercise-এ ব্যবহার করবে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা coffee shop-এ 1 জন barista যে প্রতি drink-এ 60 সেকেন্ড নেয়, প্রতি মিনিটে 1 জন customer serve করতে পারে। যদি প্রতি মিনিটে 5 জন customer আসে, queue প্রতি মিনিটে 4 করে বাড়ে — service ধসে যায়। Capacity = throughput / per-unit-cost। Little's Law তোমাকে queue length বলে।

</Callout>

## Universal Scalability Law (কখন server যোগ করা আর সাহায্য করে না)

Linear scaling একটা মিথ্যা। রিয়েল সিস্টেম contention (locks, shared state) আর coherence (cache sync, consensus)-এ ভোগে। Neil Gunther-এর USL দুটোই ধরে:

```
              N
X(N) = ────────────────────
       1 + α(N-1) + βN(N-1)

X(N) = throughput at concurrency N
α    = contention coefficient    (queueing)
β    = coherence coefficient     (cross-node coordination)
```

```typescript
// USL prediction
function uslThroughput(n: number, alpha: number, beta: number): number {
	return n / (1 + alpha * (n - 1) + beta * n * (n - 1));
}

// Real measurements: throughput at N=1, 2, 4, 8, 16 nodes
// Fit α and β by least-squares regression to your real data.

// Example fitted values for a typical SQL-backed service:
// α ≈ 0.05 (5% serial work — connection pool, GIL, etc.)
// β ≈ 0.005 (0.5% coherence — cross-shard transactions)

// Throughput at scale:
console.log(uslThroughput(1, 0.05, 0.005)); //  1.00 (baseline)
console.log(uslThroughput(8, 0.05, 0.005)); //  4.97 (~5x, not 8x)
console.log(uslThroughput(32, 0.05, 0.005)); // 11.21 (~11x, not 32x)
console.log(uslThroughput(64, 0.05, 0.005)); // 13.48 — peak!
console.log(uslThroughput(128, 0.05, 0.005)); // 12.21 — going DOWN
```

output-টাই punchline: একটা peak আছে। এর পরে, server যোগ করলে সিস্টেম _আরও slow_ হয়। তুমি যদি তোমার USL curve না জানো, তাহলে আতঙ্কে তুমি peak পেরিয়ে scale করবে আর outage-টা আরও খারাপ করবে।

## একটা রিয়েল k6 load test

k6 হচ্ছে standard। JavaScript-এ scriptable, যেকোনো জায়গায় চলে, Prometheus-এর সাথে integrate করে।

```javascript
// load-test/checkout.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const checkoutLatency = new Trend('checkout_latency_ms');
const checkoutErrors = new Rate('checkout_errors');

export const options = {
	// Stages: simulate a realistic ramp pattern
	stages: [
		{ duration: '2m', target: 100 }, // ramp to 100 VUs
		{ duration: '5m', target: 100 }, // hold steady
		{ duration: '2m', target: 500 }, // burst to 500
		{ duration: '5m', target: 500 }, // hold burst
		{ duration: '2m', target: 0 } // ramp down
	],
	// SLO assertions — the test FAILS if these are violated
	thresholds: {
		checkout_latency_ms: ['p(99)<300'], // p99 must stay under 300ms
		checkout_errors: ['rate<0.001'], // <0.1% errors
		http_req_failed: ['rate<0.001']
	}
};

export default function () {
	const payload = JSON.stringify({
		cart_id: `cart_${__VU}_${__ITER}`,
		items: [
			{ sku: 'ABC-123', qty: 1 },
			{ sku: 'XYZ-789', qty: 2 }
		]
	});

	const res = http.post('https://api.example.com/v1/checkout', payload, {
		headers: { 'Content-Type': 'application/json' }
	});

	checkoutLatency.add(res.timings.duration);
	checkoutErrors.add(res.status >= 500);

	check(res, {
		'status is 200': (r) => r.status === 200,
		'has order_id': (r) => r.json('order_id') !== undefined
	});

	sleep(1); // simulate think time
}
```

চালাও:

```bash
# Local run with Grafana Cloud output
k6 run --out cloud checkout.js

# Or output Prometheus metrics for your own stack
# (the prometheus-rw output graduated from experimental in k6 v0.50)
k6 run \
  --out prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write \
  checkout.js
```

thresholds block-টাই magic। SLO assertion ফেল করলে test non-zero exit করে, তাই তুমি এটা CI-তে একটা gate হিসেবে চালাতে পারো।

<Callout type="tip">

**production scale mirror করে এমন staging-এর বিরুদ্ধে load test চালাও।** 1/10th scale-এ test করলে 1/10th accuracy পাবে। full-scale staging afford করতে না পারলে, weird endpoint খুঁজতে production canary-র বিরুদ্ধে `k6 --vus 1 --duration 1h` দিয়ে shadow traffic চালাও।

</Callout>

## Headroom: the rule of thumb

সবচেয়ে বেশি জিজ্ঞেস করা planning প্রশ্ন: "আমার কত spare capacity লাগবে?"

```
Service type             Headroom    Rationale
------------------------|-----------|----------------------------------
Stateless web tier      |   30-50%  | Spikes + rolling deploys
Stateful (DB primary)   |   100%+   | Failover doubles load on survivor
Cache (Redis/Memcache)  |    50%    | Cold-start floods the DB
Queue worker pool       |   200-500%| Burst absorption is the point
Network bandwidth       |   100%    | Asymmetric (egress matters more)
DB connection pool      |   2x avg  | Slow queries spike pool usage
```

DB নিয়মটা critical। তোমার primary যদি 60% CPU-তে চলে আর তোমার একটা মাত্র read replica থাকে, একটা primary failover সেই server-এ 100% write load ফেলবে যেটা আগেই 60% read load-এ ছিল। তুমি দ্রুত আবিষ্কার করবে 160% CPU কেমন লাগে।

## Capacity planning spreadsheet (আসলটা)

রিয়েল team-রা একটা ত্রৈমাসিক capacity plan একটা spreadsheet বা notebook হিসেবে maintain করে। এখানে schema:

```
Service    | RPS  | p99   | Replicas | CPU/replica | Mem/replica | Cost/mo  | 90d trend | Action
-----------|------|-------|----------|-------------|-------------|----------|-----------|--------
checkout   | 5000 | 80ms  |    12    |    1.5      |   2GB       | $2,400   | +18%      | Add 4 by Q3
payment    | 800  | 120ms |     6    |    2.0      |   3GB       | $1,800   | +5%       | OK
search     | 9k   | 50ms  |    18    |    0.8      |   1GB       | $1,200   | +35%      | Investigate growth
inventory  | 200  | 200ms |     3    |    1.0      |   2GB       | $600     | -2%       | Right-sized
```

90d trend column-টা early-warning signal। 70% utilization-এ চলা একটা service-এর বিরুদ্ধে 35% growth rate মোটামুটি 8 সপ্তাহে saturate করবে। এখনই plan করো, saturation cliff-এ নয়।

## Load testing patterns ("শুধু আরও RPS"-এর বাইরে)

আলাদা test shape আলাদা bug খুঁজে পায়:

```typescript
// 1. Smoke test — does it work at all?
//    Light, short, run in CI on every PR
const smoke = { vus: 5, duration: '1m' };

// 2. Load test — can it handle expected traffic?
//    Production-sized, run pre-launch
const load = { vus: 500, duration: '30m' };

// 3. Stress test — where does it break?
//    Push past expected, find the cliff
const stress = {
	stages: [
		{ duration: '5m', target: 500 },
		{ duration: '5m', target: 1000 },
		{ duration: '5m', target: 2000 },
		{ duration: '5m', target: 4000 } // expect failure here
	]
};

// 4. Soak test — does it leak / degrade over time?
//    Steady load for hours; finds memory leaks, connection leaks
const soak = { vus: 200, duration: '12h' };

// 5. Spike test — does it recover from sudden bursts?
//    Bursty pattern; tests autoscaler reactivity
const spike = {
	stages: [
		{ duration: '10m', target: 100 },
		{ duration: '30s', target: 2000 }, // hammer
		{ duration: '10m', target: 100 } // recovery
	]
};
```

প্রতিটা shape একটা আলাদা শ্রেণীর bug ফাঁস করে। যে service load test পাস করে কিন্তু soak ফেল করে সেটা কিছু একটা leak করছে। যে service load পাস করে কিন্তু spike ফেল করে তার একটা autoscaler আছে যেটা বড্ড slow।

## Forecasting (underrated skill)

```python
# Seasonal forecast for capacity planning
# Real teams use Prophet or statsmodels; here's the shape

import pandas as pd
from prophet import Prophet

# Pull last 90 days of daily peak RPS from Prometheus
df = pd.read_csv("daily_peak_rps.csv")  # columns: ds, y

model = Prophet(
    yearly_seasonality=True,
    weekly_seasonality=True,
    daily_seasonality=False,
)
model.add_country_holidays(country_name="US")
model.fit(df)

# Forecast next 90 days
future = model.make_future_dataframe(periods=90)
forecast = model.predict(future)

# Use the upper-bound (yhat_upper) for capacity decisions
# It's the 80th percentile prediction — leaves room for noise
peak_forecast = forecast["yhat_upper"].max()
print(f"Forecasted 90-day peak RPS: {peak_forecast:.0f}")
```

point estimate-এর চেয়ে bound-টা বেশি গুরুত্বপূর্ণ। তুমি planning window-এর worst case-এর জন্য size করছ, average-এর জন্য নয়।

## Stay current

- [k6 docs](https://grafana.com/docs/k6/) — load testing, version-tracked
- [Google SRE Workbook — Managing Load](https://sre.google/workbook/managing-load/) — practical patterns
- [Brendan Gregg — Capacity Planning](https://www.brendangregg.com/usemethod.html) — bottleneck-first thinking
- [AWS Builders' Library — Caching challenges](https://aws.amazon.com/builders-library/) — real-world scaling writeups

## Key Takeaways

1. **Little's Law**: L = λW। চারটার তিনটা; চতুর্থটা derive করো।
2. **USL বলে scaling-এর একটা peak আছে** — α আর β মাপো যাতে জানো সেটা কোথায়
3. **thresholds সহ k6** load test-কে CI-তে pass/fail SLO gate-এ পরিণত করে
4. **Headroom rules of thumb** service type অনুযায়ী বদলায় — DB-র 100%+ লাগে, web-এর 30-50%
5. **seasonality সহ forecast করো + upper-bound ব্যবহার করো** — window-এর worst case-এর জন্য capacity
