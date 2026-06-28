---
title: 'Monitoring & Observability'
subtitle: 'Metrics, logs, traces — the three pillars of understanding what your system is doing in production.'
chapter: 5
level: 'intermediate'
readingTime: '15 min'
topics: ['monitoring', 'observability', 'metrics', 'logging', 'tracing']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Three Pillars

**Metrics**: numbers over time (request count, error rate, latency p99)
**Logs**: discrete events with context (request details, errors, audit trail)
**Traces**: request flow across services (which service took how long)

You need all three. Metrics tell you _something is wrong_. Logs tell you _what went wrong_. Traces tell you _where it went wrong_.

<Callout type="info">

**Real-World Analogy**

Like a hospital patient monitoring system — sensors track heart rate, blood pressure, and oxygen levels. When any metric drops below threshold, an alarm fires and the medical team is dispatched.

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

### The Four Golden Signals

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

**Log levels matter.** Use `error` for things that need attention, `warn` for degraded behavior, `info` for significant events, `debug` for development. In production, set the level to `info` — debug logs can generate terabytes.

</Callout>

## Distributed Tracing

When a request touches 5 services, how do you know which one is slow?

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

**Alert fatigue kills on-call teams.** Every alert must be actionable. If you get paged and the answer is "ignore it," delete that alert. Aim for fewer, higher-signal alerts rather than monitoring everything.

</Callout>

## Key Takeaways

1. **Metrics, logs, traces** — you need all three to diagnose production issues
2. **Alert on symptoms** (error rate, latency), not causes (CPU, memory)
3. **Structured logging** makes logs queryable — never use string concatenation
4. **Distributed tracing** is essential for debugging microservice architectures
