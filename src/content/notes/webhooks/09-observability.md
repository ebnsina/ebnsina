---
title: 'Observability and replay'
subtitle: 'Webhooks are not a fire-and-forget feature. They are an operated feature. The dashboards, metrics, and traces you build for debugging are the difference between a feature you maintain and one that maintains you.'
chapter: 9
level: 'advanced'
readingTime: '12 min'
topics: ['webhooks', 'observability', 'metrics', 'tracing', 'dashboards']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A webhook system is two distributed systems (yours and your customer's) glued by HTTP. Bugs surface as silence — a missing email, a stale UI, a record that didn't update. Fast diagnosis requires per-event traceability, per-subscription rollups, and operator tools that don't require SSH.

This chapter walks the observability stack you need: structured logs, Prometheus metrics, traces, and the customer-facing operator UI.

<Callout type="info">

**Real-World Analogy**

Webhook observability is like a shipping tracking page — you can see every scan, delay, and handoff without opening the package.

</Callout>

## What you instrument

Per delivery attempt, capture (already in chapter 8's schema):

- Event ID, type, subscription ID.
- Attempt number.
- Started at, duration.
- Response status code, response snippet, error.

The schema is the source of truth for the dashboard. Logs and metrics are derived.

## Structured logs

Every attempt, one log line:

```
{
  "ts": "2026-05-04T12:00:13.492Z",
  "level": "info",
  "msg": "webhook-attempt",
  "delivery_id": 9384,
  "event_id": "evt_01HF5J7XK4TG6N2VRT9P0M3DZ4",
  "type": "payment.succeeded",
  "subscription_id": 42,
  "url": "https://customer.example.com/webhooks",
  "attempt": 1,
  "status": 200,
  "duration_ms": 243
}
```

Failures get more fields:

```
{
  ...
  "level": "warn",
  "status": 502,
  "error": "non-2xx",
  "response_snippet": "<html>cloudflare error</html>",
  "next_attempt_at": "2026-05-04T12:01:13.492Z"
}
```

Send these to **Loki** (self-hosted) or any log aggregator. Grafana queries on `{event_id="evt_..."}` show the full timeline of one event across attempts. Queries on `{subscription_id="42",level="warn"}` show one customer's recent failures.

Log retention 7–14 days is plenty for active debugging. Anything older is in the DB.

## Prometheus metrics

Five metrics cover 95% of operational questions:

```go
var (
    deliveryAttempts = prometheus.NewCounterVec(prometheus.CounterOpts{
        Name: "webhook_attempts_total",
        Help: "Total webhook delivery attempts.",
    }, []string{"event_type", "outcome"}) // outcome: success, transient_fail, permanent_fail

    deliveryDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
        Name:    "webhook_attempt_duration_seconds",
        Help:    "Webhook attempt duration.",
        Buckets: prometheus.ExponentialBuckets(0.01, 2, 12),
    }, []string{"event_type", "outcome"})

    queueDepth = prometheus.NewGaugeVec(prometheus.GaugeOpts{
        Name: "webhook_queue_depth",
        Help: "Pending deliveries by state.",
    }, []string{"state"}) // pending, in_flight, retrying

    dlqDepth = prometheus.NewGauge(prometheus.GaugeOpts{
        Name: "webhook_dlq_depth_total",
        Help: "Deliveries currently in failed/expired state.",
    })

    workerInflight = prometheus.NewGauge(prometheus.GaugeOpts{
        Name: "webhook_workers_inflight",
        Help: "Workers currently sending.",
    })
)
```

Counters and histograms are recorded by workers; gauges by a periodic scraper:

```go
func updateGauges() {
    var pending, inflight, retrying int
    db.QueryRow(`SELECT
        count(*) FILTER (WHERE state='pending'),
        count(*) FILTER (WHERE state='in_flight'),
        count(*) FILTER (WHERE state='pending' AND attempts > 0)
        FROM webhook_deliveries`).Scan(&pending, &inflight, &retrying)
    queueDepth.WithLabelValues("pending").Set(float64(pending))
    queueDepth.WithLabelValues("in_flight").Set(float64(inflight))
    queueDepth.WithLabelValues("retrying").Set(float64(retrying))

    var dlq int
    db.QueryRow(`SELECT count(*) FROM webhook_deliveries
                 WHERE state IN ('failed','expired')`).Scan(&dlq)
    dlqDepth.Set(float64(dlq))
}
```

Run every 30 seconds.

## The Grafana dashboard

Five panels on one screen tell you everything important:

1. **Delivery rate** — sum by outcome over time. Spot regressions.
2. **Latency** — p50/p95/p99 of `webhook_attempt_duration_seconds`. Slow customers, slow producer.
3. **Queue depth** — pending, in_flight, retrying. Spot backlog.
4. **DLQ depth and rate** — how many in DLQ, growing how fast.
5. **Per-subscription error rate** — top 10 worst subscriptions. Customer-specific issues.

```promql
# delivery rate by outcome
sum by (outcome) (rate(webhook_attempts_total[5m]))

# p95 latency
histogram_quantile(0.95, sum by (le) (rate(webhook_attempt_duration_seconds_bucket[5m])))

# DLQ growth rate
rate(webhook_attempts_total{outcome="permanent_fail"}[1h])
```

Alerts fire from Prometheus rules:

```yaml
- alert: WebhookQueueBacklog
  expr: webhook_queue_depth{state="pending"} > 10000
  for: 15m

- alert: WebhookDLQGrowing
  expr: rate(webhook_attempts_total{outcome="permanent_fail"}[5m]) > 5
  for: 10m

- alert: WebhookLatencyHigh
  expr: histogram_quantile(0.95, sum by (le) (rate(webhook_attempt_duration_seconds_bucket[5m]))) > 5
  for: 10m
```

Backlog means your workers can't keep up — scale them. DLQ growing fast is a customer or producer issue. High p95 latency may be specific receivers or all of them.

## Tracing — OpenTelemetry per delivery

Each delivery attempt is a span. Each span includes the event ID, subscription ID, attempt number, status, response time. Spans link to the event creation span (in the producer's outbound code) so you see the whole pipeline:

```
[event-create]──[outbox-write]──[worker-claim]──[deliver-attempt-1]──[deliver-attempt-2]
                                                  status=502           status=200
```

OpenTelemetry's HTTP instrumentation auto-spans the outgoing POST. Your code adds custom attributes:

```go
ctx, span := tracer.Start(ctx, "deliver-attempt",
    trace.WithAttributes(
        attribute.String("event.id", event.ID),
        attribute.String("event.type", event.Type),
        attribute.Int64("subscription.id", sub.ID),
        attribute.Int("attempt", attempt),
    ),
)
defer span.End()

resp, err := httpClient.Do(req)
if err != nil {
    span.SetStatus(codes.Error, err.Error())
    return
}
span.SetAttributes(attribute.Int("http.status_code", resp.StatusCode))
```

Send to **Tempo**, **Jaeger**, or **Honeycomb**. A trace search on `event.id=evt_...` shows the whole life of an event in one chart.

For receivers, propagate the trace context via `traceparent` header on the outbound POST. Customers who use OTel can pull your span IDs into their traces — full distributed visibility.

## The customer-facing dashboard

Same data, different audience. Customers see only their own subscriptions. The pages:

**Subscription list.**

- URL, event types subscribed, success rate (24h), last successful delivery, current state.

**Recent events.**

- Per-event row: ID, type, status, attempts, last attempt time. Filterable by state and type.

**Event detail.**

- The signed body and headers we sent.
- All attempts: timestamps, response status, response body snippet, durations.
- Resend button.
- "Why did this fail?" hints (e.g., "Your endpoint returned 502 Bad Gateway").

**Endpoint health.**

- Success rate over time.
- Latency chart.
- Recent failures.

Stripe's dashboard is the reference. You can ship a much simpler version in a weekend that covers 90% of the value. Don't over-engineer; ship usable.

## Real-time event tail

A "live tail" page shows events as they happen — useful for customers integrating for the first time. Implementation: a SSE stream (chapter 5 of WebSockets track) of new events for the customer's subscriptions, with the full request/response inline.

```javascript
const es = new EventSource('/dashboard/subscriptions/42/events/live');
es.addEventListener('event', (e) => {
	const ev = JSON.parse(e.data);
	appendToTable(ev);
});
```

Server-side, query the DB for new rows since `last_event_seen` and emit. Or hook into your producer's pubsub channel to push immediately.

This is the single highest-value debugging feature for first-time integrators. They paste their endpoint URL, hit "test event," and see the round-trip live. Saves hundreds of support tickets.

<Callout type="tip">

**Show the receiver's response body, not just the status.** A 500 response with a Cloudflare error page tells the customer exactly that "your origin is timing out." Without the body, they file a ticket asking what 500 means.

</Callout>

## Auditing replay actions

Every "resend" click should write an audit log:

```sql
CREATE TABLE webhook_audit (
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor TEXT NOT NULL, -- "customer:user42" or "operator:alice"
    action TEXT NOT NULL, -- "replay", "bulk_replay", "pause_subscription"
    target TEXT NOT NULL, -- delivery_id or subscription_id
    metadata JSONB
);
```

A `bulk_replay` audit row carries the criteria:

```json
{
	"actor": "operator:alice",
	"action": "bulk_replay",
	"metadata": {
		"criteria": { "created_at": ">=2026-05-04T12:00:00Z" },
		"count": 4823,
		"reason": "deploy bug, ticket #1234"
	}
}
```

When customers ask "did you resend our events?" you have an answer. When investigating a duplicate-processing bug, you can see who replayed when.

## Volume estimates

Webhook ops costs scale with delivery volume, not user count. Rough numbers:

- **10K deliveries/day:** 1 worker, all logs to Loki, dashboard is one HTML page. Easy.
- **100K/day:** 2–4 workers, structured logs at INFO level get noisy — sample, or downgrade success logs to DEBUG. Dashboard needs pagination.
- **1M/day:** dedicated worker fleet, log sampling, partitioned tables, real ops attention.
- **10M+/day:** specialised infra; consider whether to build vs buy.

Most app integrations are in the 10K–100K/day range per producer. The patterns in this chapter scale through ~1M/day on commodity hardware.

## Sampling logs at scale

At high volume, logging every successful attempt becomes expensive. Sample:

```go
if outcome == "success" && rand.Intn(100) != 0 {
    // log only 1% of successes
} else {
    log.Info("webhook-attempt", ...)
}
```

Always log failures. Sample successes. Metrics still capture everything; logs are for the moments you want to inspect a single delivery.

## Per-customer rate limits and quotas

For multi-tenant producers, observability includes per-customer counters:

```go
deliveriesPerCustomer.WithLabelValues(customerID).Inc()
```

Combined with their plan limits, you alert _them_ (not just yourself):

```
Your webhook usage this month: 4.2M of 5M plan limit.
```

This is product, not just ops. But the same metric supports both — it just takes a UI on top.

## Recap

- Five Prometheus metrics cover 95% of operational questions.
- One Grafana dashboard with rate, latency, queue depth, DLQ depth, per-subscription rate.
- Three Prometheus alerts: backlog, DLQ growing, latency high.
- OpenTelemetry spans on every attempt; trace by event ID.
- Customer-facing dashboard: subscriptions, events, attempt detail, resend, endpoint health.
- Live tail (SSE) is the killer feature for first-time integrators.
- Audit every replay/pause/resume action with actor, target, metadata.
- Sample success logs at high volume; never sample failures.
- Per-customer counters support both ops alerts and product UX.

Next: [Self-host](/notes/webhooks/10-production) — the outbox pattern, worker pool, and full deploy on a VPS.
