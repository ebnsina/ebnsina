---
title: "Load Testing"
subtitle: "k6, autocannon, realistic traffic models, finding the breaking point — and why load testing in staging is different from production."
chapter: 5
level: "intermediate"
readingTime: "9 min"
topics: ["load testing", "k6", "autocannon", "throughput", "breaking point", "performance baseline"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A fire drill vs an actual fire: a fire drill reveals whether evacuation procedures work under controlled conditions, before the real emergency. Load testing does the same for traffic — you find out whether the system breaks, where it breaks, and how it breaks, while you're in control and can stop the test. Discovering it during a traffic spike is the fire.

</Callout>

## Types of Load Tests

**Baseline:** measure normal behavior. What are the P50/P99 latencies at expected traffic?

**Stress:** increase load until something breaks. Find the system's limits.

**Soak:** run at expected load for hours. Find memory leaks, connection pool exhaustion, log file growth.

**Spike:** sudden 10x traffic jump. Does the system recover? How long does it take?

**Breakpoint:** same as stress but you're looking for the exact RPS where P99 crosses your SLO.

## autocannon

Fast, simple HTTP benchmarking for Node.js:

```bash
# 100 connections, 30 seconds
npx autocannon -c 100 -d 30 http://localhost:3000/api/orders

# With a body (POST)
npx autocannon -c 100 -d 30 \
  -m POST \
  -H 'Content-Type: application/json' \
  -b '{"customerId":"cust-123","items":[{"productId":"prod-456","quantity":1}]}' \
  http://localhost:3000/api/orders

# Ramp up (10 connections, then 50, then 100)
npx autocannon -c 10 -d 10 http://localhost:3000/api/orders
npx autocannon -c 50 -d 10 http://localhost:3000/api/orders
npx autocannon -c 100 -d 10 http://localhost:3000/api/orders
```

Output:
```
Stat         | 2.5% | 50%  | 97.5% | 99%  | Avg   | Stdev | Max
Latency      | 14ms | 22ms | 89ms  | 145ms| 23.4ms| 19.1ms| 2341ms

Req/Sec      | 3240 | 4100 | 4380  | 4410 |
Bytes/Sec    | 2.1M | 2.7M | 2.9M  | 2.9M |

35672 requests in 10s, 236 MB read
```

Watch for: P99 climbing, error rate appearing, Max exploding above P99 (outliers).

## k6

k6 is a scripting tool for complex load test scenarios — think realistic user journeys, not just "hammer this endpoint":

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // ramp up to 10 users
    { duration: '5m', target: 10 },   // stay at 10
    { duration: '2m', target: 50 },   // ramp to 50
    { duration: '5m', target: 50 },   // stay at 50
    { duration: '2m', target: 100 },  // ramp to 100
    { duration: '5m', target: 100 },  // stay at 100
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<500'],  // 99% of requests < 500ms
    errors: ['rate<0.01'],             // error rate < 1%
  },
};

const BASE_URL = 'http://staging.api.example.com';

export default function () {
  // Realistic user journey
  // 1. Login
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: 'test@example.com',
    password: 'testpass',
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, {
    'login succeeded': (r) => r.status === 200,
  });

  const token = loginRes.json('token');

  // 2. Browse products
  const productsRes = http.get(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(productsRes, {
    'products loaded': (r) => r.status === 200,
    'has products': (r) => r.json('items').length > 0,
  });

  errorRate.add(productsRes.status >= 400);
  sleep(1);  // user "thinks"

  // 3. Create order
  const product = productsRes.json('items')[0];
  const orderRes = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
    items: [{ productId: product.id, quantity: 1 }],
  }), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  check(orderRes, {
    'order created': (r) => r.status === 201,
  });

  errorRate.add(orderRes.status >= 400);
  sleep(2);
}
```

```bash
# Run the test
k6 run load-test.js

# With output to InfluxDB (for Grafana dashboard)
k6 run --out influxdb=http://localhost:8086/k6 load-test.js

# HTML report
k6 run --out json=results.json load-test.js
k6-html-reporter results.json
```

## Finding the Breaking Point

Binary search on RPS to find where P99 crosses your SLO:

```javascript
// breakpoint-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  executor: 'ramping-arrival-rate',  // RPS-based (not VU-based)
  stages: [
    { target: 100, duration: '1m' },   // 100 RPS for 1 minute
    { target: 200, duration: '1m' },   // 200 RPS
    { target: 400, duration: '1m' },   // 400 RPS
    { target: 800, duration: '1m' },   // 800 RPS
    { target: 1600, duration: '1m' },  // 1600 RPS — will this break it?
  ],
  preAllocatedVUs: 200,
  maxVUs: 500,
  thresholds: {
    http_req_duration: ['p(99)<500'],
  },
};
```

Watch the Grafana dashboard while the test runs. The point where P99 starts climbing steeply is your inflection point — where queuing begins. Your sustainable RPS is about 70% of the breaking point.

## Realistic Test Data

Load testing with `cust-123` hardcoded produces unrealistic cache hit rates and database behavior:

```javascript
// k6 — parameterized test data
import { SharedArray } from 'k6/data';

const users = new SharedArray('users', function () {
  return JSON.parse(open('./test-users.json'));  // 10,000 test users
});

const products = new SharedArray('products', function () {
  return JSON.parse(open('./test-products.json'));
});

export default function () {
  const user = users[Math.floor(Math.random() * users.length)];
  const product = products[Math.floor(Math.random() * products.length)];

  // Now the test exercises different code paths, database queries,
  // and cache keys — closer to production behavior
}
```

## Monitoring During Load Tests

Watch these metrics while the test runs:

```bash
# Node.js process
watch -n1 "node -e \"const p=process; console.log(JSON.stringify(p.memoryUsage()))\""

# PostgreSQL connections and queries
watch -n1 "psql -c \"SELECT count(*), state FROM pg_stat_activity GROUP BY state\""

# Redis
watch -n1 "redis-cli info stats | grep -E 'connected_clients|used_memory_human|instantaneous_ops_per_sec'"

# System
htop  # CPU and memory
iostat -x 1  # disk I/O
ss -s  # connection counts
```

When latency spikes: check which resource saturated first. CPU? Disk I/O? Connection pool? The first one to saturate is the bottleneck.

## Staging vs Production Differences

Load test in staging, but be aware of the gaps:

| | Staging | Production |
|---|---|---|
| Database size | Small (100k rows) | Large (10M+ rows) |
| Cache state | Cold | Warm |
| Index effectiveness | Artificially good | Real-world performance |
| External API latency | Mocked | Variable |
| Background jobs | Off | Running and consuming resources |

Mitigation:
- Seed staging with production-scale data (anonymized)
- Run load test with cache cold AND warm — measure both
- Enable background jobs during load test
- Mock external APIs with realistic latency (p50=100ms, p99=500ms)

A load test on empty-table staging will not reveal the index you forgot. Test with real data scale.

