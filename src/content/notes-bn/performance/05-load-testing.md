---
title: 'Load Testing'
subtitle: 'k6, autocannon, বাস্তবসম্মত traffic model, breaking point খুঁজে বের করা — আর কেন staging-এ load testing production থেকে আলাদা।'
chapter: 5
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['load testing', 'k6', 'autocannon', 'throughput', 'breaking point', 'performance baseline']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা fire drill vs আসল আগুন: একটা fire drill দেখায় নিয়ন্ত্রিত পরিস্থিতিতে evacuation procedure কাজ করে কিনা, আসল emergency-র আগে। Load testing traffic-এর জন্য একই কাজ করে — তুমি জেনে নাও system ভাঙে কিনা, কোথায় ভাঙে, আর কীভাবে ভাঙে, যখন তুমি নিয়ন্ত্রণে আছ আর test বন্ধ করতে পারো। traffic spike-এর সময় এটা আবিষ্কার করা হলো আসল আগুন।

</Callout>

## গল্পে বুঝি

নতুন একটা কংক্রিটের ব্রিজ সবে তৈরি হয়েছে, নদীর দুই পাড় জুড়ে। ইঞ্জিনিয়ার আল-খোয়ারিজমি জানেন কাগজে-কলমে হিসাব যতই নিখুঁত হোক, ব্রিজ সাধারণ মানুষের জন্য খুলে দেওয়ার আগে বাস্তবে এর সহ্যক্ষমতা যাচাই করতে হবে। তাই তিনি জনসাধারণকে ঢুকতে না দিয়ে আগে বোঝাই ট্রাকের বহর ব্রিজের উপর দিয়ে চালানোর ব্যবস্থা করলেন — প্রথমে অল্প কয়েকটা ট্রাক, ব্রিজ দিব্যি দাঁড়িয়ে আছে। এরপর আরও কয়েকটা, তারপর আরও বেশি — ধীরে ধীরে ওজন বাড়তে থাকল।

বহর যত ভারী হতে থাকল, ততই আল-খোয়ারিজমি খেয়াল রাখলেন ব্রিজ কোথায় কেমন সাড়া দিচ্ছে। এক পর্যায়ে দেখা গেল একটা নির্দিষ্ট ওজনের পর ব্রিজের মাঝখানটা সামান্য দেবে যাচ্ছে, কংক্রিটে চিড় ধরার শব্দ শোনা যাচ্ছে। ঠিক সেই বিন্দুটাই ব্রিজের সীমা — এর বেশি ওজন নিরাপদ নয়। কিন্তু এই সীমাটা তিনি জানলেন একটা নিয়ন্ত্রিত পরীক্ষায়, নিজের হাতে ট্রাক থামিয়ে — ভরা লোকজন নিয়ে ব্রিজ যখন কেঁপে উঠবে তখন নয়।

এই গল্পটাই আসলে **load testing**। বোঝাই ট্রাকের বহর হলো simulated **concurrent users** বা traffic, ধীরে ধীরে ট্রাক বাড়ানোটা হলো test-এ load **ramp up** করা, আর যে বিন্দুতে ব্রিজ দেবে যেতে শুরু করে সেটাই **breaking point** — যেখানে **latency** খারাপ হতে শুরু করে (degrade করে)। খোলার আগে পরীক্ষা করাটাই হলো আসল traffic আসার আগেই সীমা জেনে নেওয়া। বাস্তবে **k6** বা **JMeter** দিয়ে ঠিক এভাবেই বাড়তে থাকা virtual user দিয়ে system-এ চাপ বাড়ানো হয়, **throughput** আর latency মাপা হয়, আর দেখা হয় ঠিক কোথায় গিয়ে সব ভেঙে পড়ে।

## Load Test-এর ধরন

**Baseline:** স্বাভাবিক আচরণ মাপা। প্রত্যাশিত traffic-এ P50/P99 latency কত?

**Stress:** কিছু একটা না ভাঙা পর্যন্ত load বাড়াও। System-এর সীমা খুঁজে বের করো।

**Soak:** ঘণ্টার পর ঘণ্টা প্রত্যাশিত load-এ চালাও। Memory leak, connection pool exhaustion, log file বৃদ্ধি খুঁজে বের করো।

**Spike:** হঠাৎ 10x traffic লাফ। System কি recover করে? কতক্ষণ লাগে?

**Breakpoint:** stress-এর মতোই কিন্তু তুমি ঠিক সেই RPS খুঁজছ যেখানে P99 তোমার SLO পার করে।

## autocannon

Node.js-এর জন্য দ্রুত, সহজ HTTP benchmarking:

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

লক্ষ্য রাখো: P99 উঠছে, error rate দেখা দিচ্ছে, Max P99-এর উপরে বিস্ফোরিত হচ্ছে (outlier)।

## k6

k6 হলো জটিল load test scenario-র জন্য একটা scripting tool — বাস্তবসম্মত user journey ভাবো, শুধু "এই endpoint-এ হাতুড়ি মারা" না:

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
	stages: [
		{ duration: '2m', target: 10 }, // ramp up to 10 users
		{ duration: '5m', target: 10 }, // stay at 10
		{ duration: '2m', target: 50 }, // ramp to 50
		{ duration: '5m', target: 50 }, // stay at 50
		{ duration: '2m', target: 100 }, // ramp to 100
		{ duration: '5m', target: 100 }, // stay at 100
		{ duration: '2m', target: 0 } // ramp down
	],
	thresholds: {
		http_req_duration: ['p(99)<500'], // 99% of requests < 500ms
		errors: ['rate<0.01'] // error rate < 1%
	}
};

const BASE_URL = 'http://staging.api.example.com';

export default function () {
	// Realistic user journey
	// 1. Login
	const loginRes = http.post(
		`${BASE_URL}/auth/login`,
		JSON.stringify({
			email: 'test@example.com',
			password: 'testpass'
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);

	check(loginRes, {
		'login succeeded': (r) => r.status === 200
	});

	const token = loginRes.json('token');

	// 2. Browse products
	const productsRes = http.get(`${BASE_URL}/api/products`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	check(productsRes, {
		'products loaded': (r) => r.status === 200,
		'has products': (r) => r.json('items').length > 0
	});

	errorRate.add(productsRes.status >= 400);
	sleep(1); // user "thinks"

	// 3. Create order
	const product = productsRes.json('items')[0];
	const orderRes = http.post(
		`${BASE_URL}/api/orders`,
		JSON.stringify({
			items: [{ productId: product.id, quantity: 1 }]
		}),
		{
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		}
	);

	check(orderRes, {
		'order created': (r) => r.status === 201
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

## Breaking Point খুঁজে বের করা

P99 কোথায় তোমার SLO পার করে তা খুঁজতে RPS-এ binary search:

```javascript
// breakpoint-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
	executor: 'ramping-arrival-rate', // RPS-based (not VU-based)
	stages: [
		{ target: 100, duration: '1m' }, // 100 RPS for 1 minute
		{ target: 200, duration: '1m' }, // 200 RPS
		{ target: 400, duration: '1m' }, // 400 RPS
		{ target: 800, duration: '1m' }, // 800 RPS
		{ target: 1600, duration: '1m' } // 1600 RPS — will this break it?
	],
	preAllocatedVUs: 200,
	maxVUs: 500,
	thresholds: {
		http_req_duration: ['p(99)<500']
	}
};
```

Test চলার সময় Grafana dashboard-এ নজর রাখো। যে বিন্দুতে P99 খাড়াভাবে উঠতে শুরু করে সেটাই তোমার inflection point — যেখানে queuing শুরু হয়। তোমার sustainable RPS হলো breaking point-এর প্রায় 70%।

## বাস্তবসম্মত Test Data

`cust-123` hardcode করে load testing অবাস্তব cache hit rate আর database আচরণ তৈরি করে:

```javascript
// k6 — parameterized test data
import { SharedArray } from 'k6/data';

const users = new SharedArray('users', function () {
	return JSON.parse(open('./test-users.json')); // 10,000 test users
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

## Load Test চলাকালীন Monitoring

Test চলার সময় এই metric-গুলোতে নজর রাখো:

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

Latency spike হলে: কোন resource আগে saturate হয়েছে চেক করো। CPU? Disk I/O? Connection pool? যেটা প্রথমে saturate হয় সেটাই bottleneck।

## Staging vs Production-এর পার্থক্য

Staging-এ load test করো, কিন্তু ফাঁকগুলো সম্পর্কে সচেতন থাকো:

|                      | Staging          | Production                |
| -------------------- | ---------------- | ------------------------- |
| Database size        | ছোট (100k rows)  | বড় (10M+ rows)           |
| Cache state          | Cold             | Warm                      |
| Index effectiveness  | কৃত্রিমভাবে ভালো | বাস্তব-জগতের performance  |
| External API latency | Mocked           | পরিবর্তনশীল               |
| Background jobs      | বন্ধ             | চলছে আর resource খরচ করছে |

প্রশমন:

- Staging-কে production-scale ডেটা দিয়ে seed করো (anonymized)
- Cache cold এবং warm দুই অবস্থায় load test চালাও — দুটোই মাপো
- Load test-এর সময় background job সক্ষম করো
- External API-কে বাস্তবসম্মত latency দিয়ে mock করো (p50=100ms, p99=500ms)

খালি-table staging-এ একটা load test তুমি যে index ভুলে গেছ সেটা প্রকাশ করবে না। আসল ডেটা scale দিয়ে test করো।
