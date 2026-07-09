---
title: 'Monitoring ও Observability'
subtitle: 'Metrics, logs, traces — production-এ আপনার সিস্টেম কী করছে তা বোঝার তিনটি স্তম্ভ।'
chapter: 5
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['monitoring', 'observability', 'metrics', 'logging', 'tracing']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## তিনটি স্তম্ভ

**Metrics**: সময়ের সাথে সংখ্যা (request count, error rate, latency p99)
**Logs**: context সহ আলাদা আলাদা event (request-এর বিস্তারিত, error, audit trail)
**Traces**: service-গুলোর মধ্য দিয়ে request-এর flow (কোন service কতক্ষণ নিল)

আপনার তিনটিই দরকার। Metrics বলে দেয় _কিছু একটা ভুল হচ্ছে_। Logs বলে দেয় _কী ভুল হলো_। Traces বলে দেয় _কোথায় ভুল হলো_।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

হাসপাতালের patient monitoring system-এর মতো — sensor-গুলো heart rate, blood pressure আর oxygen level ট্র্যাক করে। যখন কোনো metric threshold-এর নিচে নেমে যায়, একটা alarm বাজে আর medical team ছুটে আসে।

</Callout>

## Metrics

```typescript
// Key metrics for any service (RED method):
// Rate:   requests per second
// Errors: error rate (% of requests that fail)
// Duration: latency distribution (p50, p95, p99)

// Prometheus-style metrics
import { Counter, Histogram } from 'prom-client';

const httpRequests = new Counter({
	name: 'http_requests_total',
	help: 'Total HTTP requests',
	labelNames: ['method', 'path', 'status']
});

const httpDuration = new Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration',
	labelNames: ['method', 'path'],
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

// Middleware
app.use((req, res, next) => {
	const end = httpDuration.startTimer({ method: req.method, path: req.route });
	res.on('finish', () => {
		httpRequests.inc({ method: req.method, path: req.route, status: res.statusCode });
		end();
	});
	next();
});
```

### চারটি Golden Signal

```typescript
// Google SRE's four golden signals:
// 1. Latency    — how long requests take (distinguish success vs error latency)
// 2. Traffic    — requests per second
// 3. Errors     — rate of failed requests
// 4. Saturation — how "full" your system is (CPU, memory, disk, connections)

// Alert on symptoms, not causes:
// ✓ "Error rate > 1% for 5 minutes"
// ✓ "p99 latency > 2s for 5 minutes"
// ✗ "CPU > 80%" (might be fine if latency is normal)
```

## Structured Logging

```typescript
// ✗ Unstructured — impossible to parse at scale
console.log(`User ${userId} placed order ${orderId} for $${total}`);

// ✓ Structured — queryable, filterable
import pino from 'pino';
const logger = pino();

logger.info(
	{
		event: 'order_placed',
		userId,
		orderId,
		total,
		items: cart.length,
		paymentMethod: 'stripe'
	},
	'Order placed successfully'
);

// Output (JSON):
// {"level":30,"time":1234567890,"event":"order_placed",
//  "userId":"u_123","orderId":"o_456","total":99.99,
//  "msg":"Order placed successfully"}
```

<Callout type="tip">

**Log level গুরুত্বপূর্ণ।** যেসব জিনিসে নজর দেওয়া দরকার তার জন্য `error`, degraded behavior-এর জন্য `warn`, গুরুত্বপূর্ণ event-এর জন্য `info`, আর development-এর জন্য `debug` ব্যবহার করুন। Production-এ level `info` রাখুন — debug log টেরাবাইট পরিমাণ ডেটা তৈরি করতে পারে।

</Callout>

## Distributed Tracing

যখন একটা request ৫টি service-এ যায়, তখন কোনটা slow তা কীভাবে বুঝবেন?

```typescript
// Each request gets a trace ID that propagates across services
interface Span {
	traceId: string; // same across all services for one request
	spanId: string; // unique to this operation
	parentSpanId: string; // who called me
	operationName: string;
	serviceName: string;
	startTime: number;
	duration: number;
	tags: Record<string, string>;
}

// OpenTelemetry (standard for instrumentation)
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function processOrder(orderId: string) {
	return tracer.startActiveSpan('processOrder', async (span) => {
		span.setAttribute('order.id', orderId);

		// Child span for database call
		await tracer.startActiveSpan('db.getOrder', async (dbSpan) => {
			const order = await db.orders.findById(orderId);
			dbSpan.end();
			return order;
		});

		// Child span for payment service call
		await tracer.startActiveSpan('payment.charge', async (paySpan) => {
			await paymentService.charge(order);
			paySpan.end();
		});

		span.end();
	});
}
```

## Alerting

```yaml
# Prometheus alerting rule
groups:
  - name: api-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))
          > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Error rate above 1% for 5 minutes'

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99,
            rate(http_request_duration_seconds_bucket[5m])
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'p99 latency above 2 seconds'
```

<Callout type="warning">

**Alert fatigue on-call team-কে শেষ করে দেয়।** প্রতিটা alert actionable হতে হবে। যদি আপনাকে page করা হয় আর উত্তরটা হয় "এটা ignore করো," তাহলে সেই alert মুছে ফেলুন। সবকিছু monitor করার চেয়ে কম কিন্তু বেশি signal-যুক্ত alert-এর দিকে লক্ষ্য রাখুন।

</Callout>

## মূল কথা

1. **Metrics, logs, traces** — production issue diagnose করতে আপনার তিনটিই দরকার
2. **Symptom-এর উপর alert দিন** (error rate, latency), cause-এর উপর নয় (CPU, memory)
3. **Structured logging** log-কে queryable করে তোলে — কখনো string concatenation ব্যবহার করবেন না
4. **Distributed tracing** microservice architecture debug করার জন্য অপরিহার্য
