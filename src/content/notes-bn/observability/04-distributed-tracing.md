---
title: 'Distributed Tracing'
subtitle: 'OpenTelemetry instrumentation, service জুড়ে trace propagation, Jaeger, আর logs ও metrics যা পারে না তা খুঁজে বের করতে traces ব্যবহার করা।'
chapter: 4
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['OpenTelemetry', 'Jaeger', 'traces', 'spans', 'context propagation', 'sampling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা পার্সেলের GPS breadcrumb trail: প্রতিটা হাতবদল — origin depot, regional hub, local office, delivery van — timestamp সহ রেকর্ড করা। পার্সেল দেরি হলে আপনি ঠিক দেখতে পান কোথায় সেটা থেমে গিয়েছিল আর কতক্ষণের জন্য। একটা distributed trace microservices-এর মধ্য দিয়ে যাওয়া একটা request-এর জন্য একই কাজ করে: প্রতিটা service রেকর্ড করে কখন সে request পেল আর পাঠাল, timing মিলিসেকেন্ড পর্যন্ত।

</Callout>

## ধারণা

**Trace:** সিস্টেমের মধ্য দিয়ে একটা request-এর সম্পূর্ণ যাত্রা। এর একটা globally unique trace ID আছে।

**Span:** একটা trace-এর মধ্যে একটা একক unit of work। এর একটা start time, duration, status, আর attributes আছে। Span গুলো একটা tree গঠন করে — প্রতিটা span-এর একটা parent থাকে (root span বাদে)।

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

**Context propagation:** trace ID আর span ID header-এর মাধ্যমে service থেকে service-এ যায়, তাই একটা request-এর সব span একই trace ID শেয়ার করে।

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

Auto-instrumentation HTTP, Express, Postgres, Redis, gRPC সামলায় — timing আর status সহ span আপনাআপনি তৈরি হয়।

## Manual Spans

Auto-instrumentation আপনার business logic জানে না। অর্থপূর্ণ operation-এর জন্য span যোগ করুন:

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

Trace context (trace ID + span ID) service-এর মধ্যে প্রবাহিত হতে হবে। OTel আপনাআপনি W3C `traceparent` header ব্যবহার করে:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             vv-trace_id(32)-parent_span_id(16)-flags
```

Auto-instrumentation HTTP আর gRPC-র জন্য এটা সামলায়। message queue-র জন্য নিজে হাতে propagate করুন:

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

এখন একটা HTTP request থেকে শুরু হওয়া trace যা Kafka-তে publish করে আর অন্য একটা service consume করে, সেটা একটা একটানা trace হিসেবে দেখায়।

## OTel Collector

Collector instrumentation কে backend থেকে আলাদা করে। App গুলো collector-এ export করে; collector Jaeger, Prometheus, Loki-তে fan out করে:

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

প্রোডাকশনে backend হিসেবে Elasticsearch বা Cassandra ব্যবহার করুন — badger single-node আর দীর্ঘ retention বা high volume-এর জন্য উপযুক্ত নয়।

## Sampling

High throughput-এ 100% trace সংগ্রহ করা ব্যয়বহুল। Sampling strategy:

**Head-based (trace শুরুতে):**

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
	sampler: new TraceIdRatioBasedSampler(0.1) // sample 10% of traces
	// ...
});
```

অসুবিধা: আপনি এলোমেলোভাবে sample করেন — একটা error trace হয়তো ধরাই পড়ল না।

**Tail-based (trace সম্পূর্ণ হওয়ার পরে):**
OTel collector-এ configure করুন — span বাফার করুন, তারপর outcome-এর ভিত্তিতে সিদ্ধান্ত নিন:

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

Tail-based sampling নিশ্চিত করে আপনি সবসময় error আর slow trace ধরবেন — যেগুলো আকর্ষণীয়। এলোমেলো fast trace 5%-এ sample হয়।

## Traces আর Logs জুড়ে দেওয়া

log output-এ trace ID যোগ করুন — একটা trace থেকে তার logs-এ ঝাঁপ দেওয়া সম্ভব করে:

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

Grafana-তে: একটা log line-এ "View traces" ক্লিক করুন → Jaeger-এ trace খোলে। অথবা একটা Jaeger trace থেকে "View logs" ক্লিক করুন → trace ID দিয়ে filter করা Loki খোলে। trace-থেকে-logs (আর ফিরে আসা) এই ঝাঁপটাই incident গুলোকে ঘণ্টার বদলে মিনিটে debug করার যোগ্য বানায়।
