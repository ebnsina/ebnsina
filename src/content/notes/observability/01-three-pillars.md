---
title: 'The Three Pillars of Observability'
subtitle: "Logs, metrics, and traces — what each tells you, where each falls short, and how they work together to answer 'what's broken and why.'"
chapter: 1
level: 'beginner'
readingTime: '8 min'
topics: ['observability', 'logs', 'metrics', 'traces', 'SLO', 'alerting']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A doctor's diagnostic tools: metrics are the vitals monitor (heart rate, blood pressure — you know something is wrong instantly). Logs are the patient's symptom journal (detailed narrative of what happened, when). Traces are the MRI — they show exactly what's happening inside and where the problem is. You need all three; each alone is insufficient.

</Callout>

## Logs

Logs are discrete events: something happened at a specific time.

```
2024-01-15T10:23:41Z ERROR payment failed order_id=ord-123 reason="card_declined" user_id=usr-456
2024-01-15T10:23:42Z INFO  order cancelled order_id=ord-123
```

**What logs answer:** "What happened?" Logs give you the narrative — the sequence of events that led to a failure.

**Where logs fail:** volume and search. A system processing 10k req/sec generates millions of log lines per hour. Finding the specific error in that stream requires good tooling (Loki, Elasticsearch) and good structure (JSON, not freeform text).

**Structured logging (do this):**

```typescript
import pino from 'pino';

const log = pino({
	level: process.env.LOG_LEVEL || 'info',
	base: { service: 'order-service', version: process.env.GIT_SHA }
});

// NOT this:
console.log(`Order ${orderId} failed: ${err.message}`);

// This:
log.error({ orderId, userId, err: err.message, code: err.code }, 'Order creation failed');
```

Structured logs are JSON — searchable, filterable, aggregatable. Freeform text logs require regex to extract any useful information.

## Metrics

Metrics are numeric measurements sampled over time.

```
http_requests_total{method="POST", path="/orders", status="500"} 142
http_request_duration_seconds{p99} 0.847
order_processing_queue_depth 234
```

**What metrics answer:** "Is something wrong right now?" Metrics are how you detect incidents before users report them. A spike in error rate, a drop in throughput, a queue depth growing — metrics catch these in real time.

**Where metrics fail:** they tell you _that_ something is wrong, not _why_. An error rate spike on `/orders` tells you there's a problem; the logs tell you what the error is; the traces tell you which service is causing it.

**The four golden signals** (Google SRE):

- **Latency** — how long requests take (distinguish success latency from error latency)
- **Traffic** — how much demand (requests/sec, messages/sec)
- **Errors** — rate of failed requests
- **Saturation** — how full is the system (queue depth, CPU, memory, connection pool)

## Traces

Traces follow a single request as it flows through multiple services.

```
Trace: ord-request-abc123 (total: 847ms)
  ├─ API Gateway            12ms
  ├─ Order Service          820ms
  │   ├─ Validate input      5ms
  │   ├─ Payment Service    750ms   ← the bottleneck
  │   │   ├─ DB query        20ms
  │   │   └─ Stripe API     730ms   ← Stripe is slow
  │   └─ Save order          15ms
  └─ Response               15ms
```

**What traces answer:** "Where is the time going?" In a microservices system with 10 services involved in one request, a trace shows exactly which service or operation is slow.

**Where traces fail:** sampling. Collecting 100% of traces at high throughput is expensive. Most systems sample 1-10% of traces, which means rare errors might not be captured. Use head-based sampling (decide at ingress) or tail-based sampling (buffer traces, decide after completion based on whether errors occurred).

## How They Work Together

The workflow for an incident:

1. **Metrics alert fires** — error rate on `/api/orders` > 5% for 5 minutes
2. **Check dashboards** — which specific error codes? What's the latency distribution? When did it start?
3. **Search logs** — find the actual error messages. Stack traces. What's failing?
4. **Pull a trace** — find a failing request. Which service returned the error? Which downstream call failed?
5. **Fix and verify** — deploy fix. Watch metrics return to baseline.

Without all three: metrics tells you there's a fire but not where. Logs show you individual fires but not the pattern. Traces show the path but not when the incident started.

## SLOs: The North Star

Before choosing tools, define what you're measuring for.

**SLI (Service Level Indicator):** what you measure.

```
Request success rate = successful_requests / total_requests
Request latency P99 = 99th percentile response time
```

**SLO (Service Level Objective):** the target.

```
Success rate: 99.9% over 30 days
P99 latency: < 500ms
```

**Error budget:** how much failure the SLO allows.

```
99.9% success → 0.1% allowed failures
In 30 days (43,200 minutes): 43.2 minutes of downtime budget
```

SLOs make alerting rational: alert when error budget is burning too fast, not when any error occurs.

```yaml
# Prometheus alert based on error budget burn rate
alert: HighErrorBudgetBurn
expr: |
  (
    rate(http_requests_total{status=~"5.."}[1h])
    /
    rate(http_requests_total[1h])
  ) > 0.001   # burning 1% per hour = budget exhausted in ~4 days
severity: warning
```

## Choosing Your Stack

For a small-to-medium production system, a pragmatic stack:

```
Logs:    Loki + Promtail (self-hosted) or Datadog Logs
Metrics: Prometheus + Grafana (self-hosted) or Datadog Metrics
Traces:  Jaeger or Tempo (self-hosted) or Datadog APM

Instrumentation: OpenTelemetry SDKs (vendor-neutral)
```

OpenTelemetry is the key: instrument once with the OTel SDK, export to any backend. Don't instrument directly to Datadog or Jaeger — if you switch backends, you don't have to re-instrument.

```typescript
// Instrument once with OpenTelemetry
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
	traceExporter: new OTLPTraceExporter({
		url: 'http://otel-collector:4318/v1/traces' // collector routes to Jaeger/Tempo
	})
});

sdk.start();
// Now switch to Datadog by changing the collector config, not the app code
```

The chapters ahead cover each pillar in depth: structured logging with Loki, metrics with Prometheus and Grafana, and distributed tracing with OpenTelemetry and Jaeger.
