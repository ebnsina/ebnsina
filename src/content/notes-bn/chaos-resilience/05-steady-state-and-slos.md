---
title: 'Steady State & SLOs'
subtitle: "'কাজ করছে' মানে কী তা পরিমাপযোগ্য ভাষায় সংজ্ঞায়িত করা — SLIs, SLOs, error budgets, এবং সেই ফিডব্যাক লুপ যা reliability-র কাজকে চালায়।"
chapter: 5
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['SLO', 'SLI', 'error budget', 'steady state', 'reliability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা thermostat: এটা শুধু জানে না যে তাপমাত্রা গুরুত্বপূর্ণ — এর একটা নির্দিষ্ট target আছে (68°F), এটা current state ক্রমাগত মাপে, আর ব্যবধান খুব বড় হলে action ট্রিগার করে। SLOs হলো reliability-র জন্য আপনার thermostat: একটা নির্দিষ্ট target, ক্রমাগত পরিমাপ, আর কখন action নিতে হবে তার একটা ট্রিগার।

</Callout>

## গল্পে বুঝি

চিকিৎসক ইবনে সিনার চেম্বারে এক রোগী এসেছেন হার্টের চেকআপ করাতে। ইবনে সিনা প্রথমে রোগীকে চুপচাপ বসিয়ে বিশ্রাম নেওয়ালেন, তারপর মেপে নিলেন তার বিশ্রামরত অবস্থার স্বাভাবিক ভাইটাল সাইন — নাড়ির গতি প্রতি মিনিটে ৭২, রক্তচাপ ১২০ বাই ৮০, শ্বাসপ্রশ্বাস স্বাভাবিক। এই মাপা সংখ্যাগুলোই এখন রোগীর "স্বাভাবিক" অবস্থার একটা পরিষ্কার ছবি — অনুমান নয়, সংখ্যায় লেখা।

এবার আসল পরীক্ষা। ইবনে সিনা রোগীকে ট্রেডমিলে তুললেন, ধীরে ধীরে গতি বাড়ালেন — এটাই ইচ্ছাকৃত চাপ। তার মাথায় একটা স্পষ্ট প্রশ্ন: "একটা সুস্থ হার্ট কি এই চাপেও ভাইটালগুলো নিরাপদ সীমার ভেতরে রাখতে পারবে?" সীমাটা তিনি আগেই ঠিক করে রেখেছেন — নাড়ি ১৬০ ছাড়ানো চলবে না, বুকে ব্যথা বা শ্বাসকষ্ট দেখা দিলেই থামতে হবে। পুরো সময় তিনি মনিটরে চোখ রাখেন। রোগী দৌড়ানোর সময় নাড়ি যদি হঠাৎ নিরাপদ সীমার বাইরে চলে যায়, তিনি এক মুহূর্তও দেরি না করে মেশিন থামিয়ে দেন।

এই পুরো ব্যাপারটাই আসলে একটা **chaos experiment**। রোগীর বিশ্রামরত স্বাভাবিক ভাইটাল হলো মাপা **steady state**, আর আগে থেকে ঠিক করা নিরাপদ সীমা হলো **SLO**। "চাপেও ভাইটাল নিরাপদ থাকবে" — এই প্রত্যাশাটাই experiment-এর **hypothesis**, আর মনিটরে চোখ রেখে সীমা ভাঙলেই থামিয়ে দেওয়াটা হলো steady-state **metric** মেপে **SLO** breach হলে rollback করা। বাস্তবে ঠিক এভাবেই latency inject করার আগে-পরে steady state মেপে দেখা হয়, আর SLO ভাঙার লক্ষণ দেখলেই experiment abort করে সিস্টেম আগের অবস্থায় ফিরিয়ে আনা হয়।

## Steady State মানে "কোনো error নেই" নয়

"সিস্টেম কাজ করছে" chaos engineering-এর জন্য অর্থহীন। আপনার একটা পরিমাপযোগ্য সংজ্ঞা দরকার:

**খারাপ steady state সংজ্ঞা:**

> "সিস্টেম up আছে আর স্বাভাবিকভাবে request সামলাচ্ছে।"

**ভালো steady state সংজ্ঞা:**

> "p99 request latency &lt; 300ms, error rate &lt; 0.5%, সফল checkout rate > 99.2%, সবকিছু একটা 5-মিনিটের rolling window-এ মাপা।"

এখন আপনি উত্তর দিতে পারবেন: "200ms injected latency দিয়েও কি এটা সত্য থাকে?" উত্তর হয় হ্যাঁ নয়তো না, রিয়েল-টাইমে পরিমাপযোগ্য।

## Service Level Indicators (SLIs)

একটা SLI হলো একটা metric যা ইউজারের দৃষ্টিকোণ থেকে আপনার service-এর মান প্রতিনিধিত্ব করে:

```typescript
// Availability SLI: fraction of requests that succeed
const availabilitySLI = successRequests / totalRequests;

// Latency SLI: fraction of requests faster than threshold
const latencySLI = requestsFasterThan300ms / totalRequests;

// Throughput SLI: successful operations per second
const throughputSLI = successfulOpsPerSecond;

// Error rate (inverted availability)
const errorRate = errorRequests / totalRequests;
```

SLI মাপে ইউজাররা কী অনুভব করে, আপনার infrastructure কী দেখায় তা নয়। CPU 80%-এ থাকা একটা SLI নয় — এটা আপনাকে বলে না ইউজাররা ভালো service পাচ্ছে কি না। 99.5% request 300ms-এর নিচে সম্পন্ন হওয়া একটা SLI।

**SLI collection বাস্তবায়ন:**

```typescript
const requestDuration = new Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration',
	labelNames: ['method', 'route', 'status_code'],
	buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5]
});

const requestTotal = new Counter({
	name: 'http_requests_total',
	help: 'Total HTTP requests',
	labelNames: ['method', 'route', 'status_code']
});

// Middleware
app.use((req, res, next) => {
	const end = requestDuration.startTimer({ method: req.method, route: req.route?.path });
	res.on('finish', () => {
		end({ status_code: res.statusCode });
		requestTotal.inc({ method: req.method, route: req.route?.path, status_code: res.statusCode });
	});
	next();
});
```

**আপনার SLI-এর জন্য Prometheus query:**

```promql
# Availability SLI (5m window)
sum(rate(http_requests_total{status_code!~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))

# Latency SLI: fraction of requests < 300ms
sum(rate(http_request_duration_seconds_bucket{le="0.3"}[5m]))
/
sum(rate(http_request_duration_seconds_count[5m]))
```

## Service Level Objectives (SLOs)

একটা SLO হলো একটা SLI-এর জন্য একটা target value:

```
SLI: availability = successful requests / total requests
SLO: availability >= 99.9% over a 30-day rolling window

SLI: p99 latency
SLO: p99 latency < 300ms, 99% of the time over a 30-day window

SLI: successful checkout rate
SLO: > 99.2% of checkout attempts succeed
```

SLO হলো আকাঙ্ক্ষিত target — চুক্তিভিত্তিক গ্যারান্টি নয় (সেগুলো SLA)। এগুলো আপনার প্রকৃত সক্ষমতার সামান্য নিচে সেট করলে আপনার error budget না পুড়িয়ে পরীক্ষা আর উন্নতির জায়গা থাকে।

**বাস্তবসম্মত SLO সেট করা:**

```
Step 1: Measure your current actual performance over 30 days
Step 2: Set SLO slightly below your actual best (not your worst)
Step 3: Review quarterly — tighten if you consistently exceed it

Example:
  Actual 30-day availability: 99.95%
  Initial SLO: 99.9%   (leaves headroom for experiments)
  After 6 months: 99.95% SLO if consistently met
```

## Error Budgets

Error budget হলো আপনার SLO-এর বিপরীত — আপনাকে যতটুকু failure-এর অনুমতি দেওয়া হয়েছে:

```
SLO: 99.9% availability
Error budget: 100% - 99.9% = 0.1%

In a 30-day month (43,200 minutes):
  Allowed downtime: 43,200 × 0.001 = 43.2 minutes/month

SLO: 99.99% availability
  Allowed downtime: 43,200 × 0.0001 = 4.32 minutes/month
```

Error budget সিদ্ধান্ত চালায়:

- **Budget বাকি:** Chaos experiment চালানোর, ঝুঁকিপূর্ণ পরিবর্তন deploy করার, হিসাব করা ঝুঁকি নেওয়ার আত্মবিশ্বাস।
- **Budget নিঃশেষ:** Feature deployment ফ্রিজ করুন, reliability উন্নতিতে মনোযোগ দিন, budget recover না হওয়া পর্যন্ত chaos experiment বাতিল করুন।

```typescript
interface ErrorBudget {
	sloPercent: number; // e.g., 99.9
	windowDays: number; // e.g., 30
	budgetMinutes: number; // 43.2
	usedMinutes: number; // measured from incidents
	remainingMinutes: number; // budget - used
	remainingPercent: number; // remaining / budget
}

function calculateErrorBudget(
	sloPercent: number,
	windowDays: number,
	actualAvailability: number
): ErrorBudget {
	const windowMinutes = windowDays * 24 * 60;
	const budgetPercent = 100 - sloPercent;
	const budgetMinutes = windowMinutes * (budgetPercent / 100);
	const usedMinutes = windowMinutes * ((100 - actualAvailability * 100) / 100);

	return {
		sloPercent,
		windowDays,
		budgetMinutes,
		usedMinutes,
		remainingMinutes: budgetMinutes - usedMinutes,
		remainingPercent: (budgetMinutes - usedMinutes) / budgetMinutes
	};
}
```

## Error Budget Policy

বিভিন্ন budget লেভেলে দল কী করে তা ডকুমেন্ট করুন:

```markdown
## Error Budget Policy

### > 50% remaining

- Normal operations
- Chaos experiments encouraged
- Feature deployments proceed
- Risky infrastructure changes OK with review

### 25-50% remaining

- Slow chaos experiment cadence
- Require post-mortems for any SLO violations
- Review and improve monitoring

### < 25% remaining

- Freeze non-critical feature deployments
- Focus engineering time on reliability improvements
- Cancel chaos experiments until budget recovers

### Exhausted (0%)

- Feature freeze (critical fixes only)
- Incident review for all SLO violations
- Executive visibility
- Recovery plan required before feature work resumes
```

## Chaos Experiment এবং Error Budget

Chaos experiment ইচ্ছাকৃতভাবে error budget খরচ করে — সেটাই উদ্দেশ্য। এটা স্পষ্টভাবে ট্র্যাক করুন:

```typescript
interface ChaosExperiment {
	name: string;
	plannedBudgetCost: number; // estimated minutes of budget consumed
	actualBudgetCost: number; // measured after experiment
	hypothesis: string;
	result: 'passed' | 'failed' | 'aborted';
	findings: string[];
}

// Before running an experiment:
function canRunExperiment(budget: ErrorBudget, experiment: ChaosExperiment): boolean {
	// Don't run if experiment would exhaust remaining budget
	return budget.remainingMinutes > experiment.plannedBudgetCost * 2; // 2x safety margin
}
```

আপনার error budget কম থাকলে, শুধু staging-এ experiment চালান। Production experiment তখনকার জন্য রাখুন যখন খরচ করার মতো budget আছে।

## Downstream Dependency-র জন্য SLOs

আপনার SLO আপনার dependency-দের SLO দ্বারা সীমাবদ্ধ। যদি payment service-এর 99.9% availability থাকে, আপনার checkout flow বাস্তবসম্মতভাবে 99.9%-এর চেয়ে ভালো অফার করতে পারে না:

```
Your availability = product of all critical dependency availabilities
  = 99.95% (your app) × 99.9% (payment) × 99.99% (database)
  = 99.84%

Realistic SLO: 99.8% (leaves margin for correlated failures)
```

প্রতিটা dependency-র SLO আর তাদের প্রকৃত performance ট্র্যাক করুন। যখন একটা dependency তার SLO-এর নিচে degrade করে, সেটা আপনার নিজের budget burn-এর একটা বৈধ অজুহাত — এবং সেই dependency-র জন্য circuit breaker বা fallback-এ বিনিয়োগ করার একটা signal।

## Steady State-এর জন্য Dashboards

SLI/SLO visibility সামনে আর কেন্দ্রে রাখুন:

```
Main reliability dashboard:
┌─────────────────────────────────────────────────┐
│ 30-day SLO Status          Current: 99.94%      │
│ Target: 99.9%              Status: ✓ PASSING     │
│                                                  │
│ Error Budget                                     │
│ Budget: 43.2 min           Used: 17.3 min (40%) │
│ Remaining: 25.9 min        Burn rate: normal     │
│                                                  │
│ Current SLIs (5min window)                       │
│ Availability: 99.97%   Latency p99: 187ms        │
│ Checkout success: 99.4%                          │
└─────────────────────────────────────────────────┘
```

এই dashboard আপনাকে ১০ সেকেন্ডে বলে দেয় সিস্টেম সুস্থ কি না আর আপনার কতটুকু risk budget আছে। প্রতিটা chaos experiment আর প্রতিটা বড় deployment-এর আগে এটা দেখুন।
