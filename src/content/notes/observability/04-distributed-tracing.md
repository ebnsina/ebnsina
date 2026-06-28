---
title: 'Distributed Tracing'
subtitle: "OpenTelemetry instrumentation, trace propagation across services, Jaeger, and using traces to find what logs and metrics can't."
chapter: 4
level: 'intermediate'
readingTime: '11 min'
topics: ['OpenTelemetry', 'Jaeger', 'traces', 'spans', 'context propagation', 'sampling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A GPS breadcrumb trail for a package: every handoff — origin depot, regional hub, local office, delivery van — is timestamped and recorded. When the package is late, you see exactly where it stopped moving and for how long. A distributed trace does the same for a request passing through microservices: every service records when it received and sent the request, with the timing down to the millisecond.

</Callout>

## Concepts

**Trace:** the complete journey of one request through the system. Has a globally unique trace ID.

**Span:** a single unit of work within a trace. Has a start time, duration, status, and attributes. Spans form a tree — each span has a parent (except the root span).

```
Trace abc123
  [Root span] POST /orders              0ms–847ms
    [Child]   Validate request          0ms–5ms
    [Child]   Payment.charge()          5ms–755ms
      [Child] SELECT * FROM cards...    5ms–25ms
      [Child] Stripe HTTP request       25ms–755ms   ← 730ms in Stripe
    [Child]   INSERT INTO orders...     755ms–770ms
    [Child]   Publish order.created     770ms–790ms
```

**Context propagation:** trace ID and span ID flow from service to service via headers, so all spans from one request share the same trace ID.

## OpenTelemetry SDK Setup

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http
```

```typescript
// instrumentation.ts — must be loaded BEFORE any other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
	SEMRESATTRS_SERVICE_NAME,
	SEMRESATTRS_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
	resource: new Resource({
		[SEMRESATTRS_SERVICE_NAME]: 'order-service',
		[SEMRESATTRS_SERVICE_VERSION]: process.env.GIT_SHA ?? 'dev'
	}),
	traceExporter: new OTLPTraceExporter({
		url: 'http://otel-collector:4318/v1/traces'
	}),
	metricReader: new PeriodicExportingMetricReader({
		exporter: new OTLPMetricExporter({
			url: 'http://otel-collector:4318/v1/metrics'
		}),
		exportIntervalMillis: 15_000
	}),
	instrumentations: [
		getNodeAutoInstrumentations({
			'@opentelemetry/instrumentation-http': { enabled: true },
			'@opentelemetry/instrumentation-express': { enabled: true },
			'@opentelemetry/instrumentation-pg': { enabled: true },
			'@opentelemetry/instrumentation-redis': { enabled: true }
		})
	]
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => sdk.shutdown());
```

```typescript
// package.json start command
// "start": "node --require ./instrumentation.js dist/index.js"
```

Auto-instrumentation handles HTTP, Express, Postgres, Redis, gRPC — spans created automatically with timing and status.

## Manual Spans

Auto-instrumentation doesn't know your business logic. Add spans for meaningful operations:

```typescript
import { trace, SpanStatusCode, context } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function createOrder(data: CreateOrderInput): Promise<Order> {
	return tracer.startActiveSpan('createOrder', async (span) => {
		span.setAttributes({
			'order.customer_id': data.customerId,
			'order.item_count': data.items.length,
			'order.total_cents': data.totalCents
		});

		try {
			const order = await db.orders.create(data);

			span.setAttributes({ 'order.id': order.id });
			span.setStatus({ code: SpanStatusCode.OK });
			return order;
		} catch (err) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: (err as Error).message
			});
			span.recordException(err as Error);
			throw err;
		} finally {
			span.end();
		}
	});
}
```

## Context Propagation

Trace context (trace ID + span ID) must flow between services. OTel uses W3C `traceparent` header automatically:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             vv-trace_id(32)-parent_span_id(16)-flags
```

Auto-instrumentation handles this for HTTP and gRPC. For message queues, propagate manually:

```typescript
import { propagation, context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

// Producer — inject trace context into message headers
async function publishOrder(order: Order) {
	const headers: Record<string, string> = {};
	propagation.inject(context.active(), headers);

	await producer.send({
		topic: 'orders',
		messages: [
			{
				key: order.id,
				value: JSON.stringify(order),
				headers // trace context in Kafka message headers
			}
		]
	});
}

// Consumer — extract and restore trace context
async function handleOrderMessage(msg: KafkaMessage) {
	const carrier = Object.fromEntries(
		Object.entries(msg.headers ?? {}).map(([k, v]) => [k, v?.toString()])
	);
	const ctx = propagation.extract(context.active(), carrier);

	await context.with(ctx, async () => {
		return tracer.startActiveSpan('handleOrder', async (span) => {
			await processOrder(JSON.parse(msg.value!.toString()));
			span.end();
		});
	});
}
```

Now a trace from an HTTP request that publishes to Kafka and is consumed by another service shows as one continuous trace.

## OTel Collector

The collector decouples instrumentation from backends. Apps export to the collector; the collector fans out to Jaeger, Prometheus, Loki:

```yaml
# otel-collector-config.yml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

  memory_limiter:
    limit_mib: 512
    spike_limit_mib: 128

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true

  prometheus:
    endpoint: 0.0.0.0:9464

  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [jaeger]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

## Jaeger Setup

```yaml
# docker-compose
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - '16686:16686' # Jaeger UI
      - '14250:14250' # gRPC receiver (from collector)
    environment:
      SPAN_STORAGE_TYPE: badger # embedded for dev; use Elasticsearch/Cassandra for prod
      BADGER_EPHEMERAL: 'false'
      BADGER_DIRECTORY_VALUE: /badger/data
      BADGER_DIRECTORY_KEY: /badger/key
    volumes:
      - jaeger-data:/badger
```

In production, use Elasticsearch or Cassandra as the backend — badger is single-node and not suitable for long retention or high volume.

## Sampling

Collecting 100% of traces at high throughput is expensive. Sampling strategies:

**Head-based (at trace start):**

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
	sampler: new TraceIdRatioBasedSampler(0.1) // sample 10% of traces
	// ...
});
```

Downside: you sample at random — an error trace might not be captured.

**Tail-based (after trace completion):**
Configure in the OTel collector — buffer spans, then decide based on outcome:

```yaml
processors:
  tail_sampling:
    decision_wait: 10s # wait 10s for all spans to arrive
    num_traces: 100000 # buffer size
    policies:
      - name: errors-policy
        type: status_code
        status_code: { status_codes: [ERROR] } # always sample errors

      - name: slow-traces-policy
        type: latency
        latency: { threshold_ms: 1000 } # always sample traces > 1s

      - name: probabilistic-policy
        type: probabilistic
        probabilistic: { sampling_percentage: 5 } # sample 5% of the rest
```

Tail-based sampling ensures you always capture errors and slow traces — the interesting ones. Random fast traces are sampled at 5%.

## Connecting Traces to Logs

Add trace ID to log output — enables jumping from a trace to its logs:

```typescript
import { trace, context } from '@opentelemetry/api';

// pino hook to inject trace context
const log = pino({
	mixin() {
		const span = trace.getActiveSpan();
		if (!span) return {};
		const { traceId, spanId } = span.spanContext();
		return { traceId, spanId };
	}
});

// Now every log line includes:
// {"traceId":"4bf92f...","spanId":"00f067...","msg":"Order created"}
```

In Grafana: click "View traces" on a log line → opens the trace in Jaeger. Or from a Jaeger trace, click "View logs" → opens Loki filtered by trace ID. This jump-from-trace-to-logs (and back) is what makes incidents debuggable in minutes instead of hours.
