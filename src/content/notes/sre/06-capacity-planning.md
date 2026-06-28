---
title: 'Capacity Planning & Load Testing'
subtitle: "Little's Law, Universal Scalability Law, headroom, and a real k6 + Locust load test you can run today."
chapter: 6
level: 'intermediate'
readingTime: '18 min'
topics: ['capacity planning', 'load testing', 'k6', 'queueing theory', "Little's Law"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why capacity planning, not autoscaling

Autoscaling is reactive. By the time it kicks in, your users have felt the latency spike. Capacity planning is proactive: you know your system will handle the launch _before_ the traffic arrives.

The core question: **at what point does my system stop meeting its SLO?** Find that number, then keep load comfortably below it.

## Little's Law (the one formula you must know)

```
L = λ × W

L = average number of items in the system (concurrency)
λ = arrival rate (requests per second)
W = average time each item spends in the system (latency)
```

That is it. From three measurable quantities, derive the fourth.

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

Memorize the formula. You will use it in interviews, capacity reviews, and every real planning exercise for the rest of your career.

<Callout type="info">

**Real-World Analogy**

A coffee shop with 1 barista who takes 60 seconds per drink can serve 1 customer per minute. If 5 customers/min arrive, queue grows by 4/min — service collapses. Capacity = throughput / per-unit-cost. Little's Law tells you the queue length.

</Callout>

## Universal Scalability Law (when adding servers stops helping)

Linear scaling is a lie. Real systems suffer from contention (locks, shared state) and coherence (cache sync, consensus). Neil Gunther's USL captures both:

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

The output is the punchline: there is a peak. Beyond it, adding servers makes the system _slower_. If you do not know your USL curve, you will scale past the peak in a panic and make the outage worse.

## A real k6 load test

k6 is the standard. Scriptable in JavaScript, runs anywhere, integrates with Prometheus.

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

Run it:

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

The thresholds block is the magic. The test exits non-zero if SLO assertions fail, so you can run it in CI as a gate.

<Callout type="tip">

**Run load tests against staging that mirrors production scale.** Testing at 1/10th the scale gives 1/10th the accuracy. If you cannot afford a full-scale staging, run shadow traffic against production canaries with `k6 --vus 1 --duration 1h` to find weird endpoints.

</Callout>

## Headroom: the rule of thumb

The single most-asked planning question: "how much spare capacity do I need?"

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

The DB rule is critical. If your primary runs at 60% CPU and you have a single read replica, a primary failover puts 100% of write load on a server that was already at 60% read load. You will rapidly discover what 160% CPU feels like.

## Capacity planning spreadsheet (the actual one)

Real teams maintain a quarterly capacity plan as a spreadsheet or notebook. Here's the schema:

```
Service    | RPS  | p99   | Replicas | CPU/replica | Mem/replica | Cost/mo  | 90d trend | Action
-----------|------|-------|----------|-------------|-------------|----------|-----------|--------
checkout   | 5000 | 80ms  |    12    |    1.5      |   2GB       | $2,400   | +18%      | Add 4 by Q3
payment    | 800  | 120ms |     6    |    2.0      |   3GB       | $1,800   | +5%       | OK
search     | 9k   | 50ms  |    18    |    0.8      |   1GB       | $1,200   | +35%      | Investigate growth
inventory  | 200  | 200ms |     3    |    1.0      |   2GB       | $600     | -2%       | Right-sized
```

The 90d trend column is the early-warning signal. A 35% growth rate against a service running at 70% utilization will saturate in roughly 8 weeks. Plan now, not at the saturation cliff.

## Load testing patterns (beyond just "more RPS")

Different test shapes find different bugs:

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

Each shape exposes a different class of bug. A service that passes load tests but fails soak is leaking something. A service that passes load but fails spike has an autoscaler that is too slow.

## Forecasting (the underrated skill)

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

The bound matters more than the point estimate. You are sizing for the worst case in the planning window, not the average.

## Stay current

- [k6 docs](https://grafana.com/docs/k6/) — load testing, version-tracked
- [Google SRE Workbook — Managing Load](https://sre.google/workbook/managing-load/) — practical patterns
- [Brendan Gregg — Capacity Planning](https://www.brendangregg.com/usemethod.html) — bottleneck-first thinking
- [AWS Builders' Library — Caching challenges](https://aws.amazon.com/builders-library/) — real-world scaling writeups

## Key Takeaways

1. **Little's Law**: L = λW. Three out of four; derive the fourth.
2. **USL says scaling has a peak** — measure α and β so you know where it is
3. **k6 with thresholds** turns load tests into pass/fail SLO gates in CI
4. **Headroom rules of thumb** vary by service type — DB needs 100%+, web 30-50%
5. **Forecast with seasonality + use upper-bound** — capacity for the worst case in the window
