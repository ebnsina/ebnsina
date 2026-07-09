---
title: 'Observability ও replay'
subtitle: 'Webhooks কোনো fire-and-forget feature নয়। এটা একটা operated feature। debug করার জন্য আপনি যে dashboard, metric, আর trace বানান, সেটাই সেই পার্থক্য গড়ে দেয় — যে feature আপনি maintain করেন আর যে feature আপনাকে maintain করায়।'
chapter: 9
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['webhooks', 'observability', 'metrics', 'tracing', 'dashboards']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা webhook সিস্টেম হলো HTTP দিয়ে জোড়া দুটো distributed system (আপনার আর আপনার customer-এর)। Bug নীরবতা হিসেবে প্রকাশ পায় — একটা মিস হওয়া email, একটা বাসি UI, একটা record যা update হয়নি। দ্রুত diagnosis-এর জন্য per-event traceability, per-subscription rollup, আর SSH ছাড়া operator tool দরকার।

এই অধ্যায়টা আপনার প্রয়োজনীয় observability stack ঘুরে দেখায়: structured log, Prometheus metric, trace, আর customer-facing operator UI।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Webhook observability অনেকটা একটা shipping tracking page-এর মতো — package না খুলেই আপনি প্রতিটা scan, delay, আর handoff দেখতে পারেন।

</Callout>

## কী instrument করবেন

প্রতিটা delivery attempt-এ, capture করুন (ইতিমধ্যে অধ্যায় ৮-এর schema-তে):

- Event ID, type, subscription ID।
- Attempt number।
- Started at, duration।
- Response status code, response snippet, error।

schema হলো dashboard-এর source of truth। Log আর metric তা থেকে derived।

## Structured log

প্রতিটা attempt, একটা log line:

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

Failure-এ আরও field পায়:

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

এগুলো **Loki** (self-hosted) বা যেকোনো log aggregator-এ পাঠান। `{event_id="evt_..."}`-এ Grafana query attempt জুড়ে একটা event-এর পূর্ণ timeline দেখায়। `{subscription_id="42",level="warn"}`-এ query একজন customer-এর সাম্প্রতিক failure দেখায়।

Log retention ৭–১৪ দিন active debug-এর জন্য যথেষ্ট। এর চেয়ে পুরনো কিছু DB-তে আছে।

## Prometheus metric

পাঁচটা metric ৯৫% operational প্রশ্ন কভার করে:

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

Counter আর histogram worker-রা record করে; gauge একটা periodic scraper-এ:

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

প্রতি ৩০ সেকেন্ডে চালান।

## Grafana dashboard

এক screen-এ পাঁচটা panel আপনাকে গুরুত্বপূর্ণ সবকিছু বলে:

1. **Delivery rate** — সময়ের সাথে outcome দিয়ে sum। regression ধরুন।
2. **Latency** — `webhook_attempt_duration_seconds`-এর p50/p95/p99। ধীর customer, ধীর producer।
3. **Queue depth** — pending, in_flight, retrying। backlog ধরুন।
4. **DLQ depth ও rate** — DLQ-তে কতগুলো, কত দ্রুত বাড়ছে।
5. **Per-subscription error rate** — সবচেয়ে খারাপ ১০ subscription। Customer-specific issue।

```promql
# delivery rate by outcome
sum by (outcome) (rate(webhook_attempts_total[5m]))

# p95 latency
histogram_quantile(0.95, sum by (le) (rate(webhook_attempt_duration_seconds_bucket[5m])))

# DLQ growth rate
rate(webhook_attempts_total{outcome="permanent_fail"}[1h])
```

Alert Prometheus rule থেকে fire করে:

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

Backlog মানে আপনার worker-রা তাল মেলাতে পারছে না — সেগুলো scale করুন। DLQ দ্রুত বাড়া একটা customer বা producer issue। উঁচু p95 latency নির্দিষ্ট receiver বা সবগুলো হতে পারে।

## Tracing — per delivery OpenTelemetry

প্রতিটা delivery attempt একটা span। প্রতিটা span-এ থাকে event ID, subscription ID, attempt number, status, response time। Span-গুলো event creation span-এর (producer-এর outbound কোডে) সাথে link করে যাতে আপনি পুরো pipeline দেখেন:

```
[event-create]──[outbox-write]──[worker-claim]──[deliver-attempt-1]──[deliver-attempt-2]
                                                  status=502           status=200
```

OpenTelemetry-র HTTP instrumentation outgoing POST auto-span করে। আপনার কোড custom attribute যোগ করে:

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

**Tempo**, **Jaeger**, বা **Honeycomb**-এ পাঠান। `event.id=evt_...`-এ একটা trace search এক চার্টে একটা event-এর পুরো জীবন দেখায়।

receiver-দের জন্য, outbound POST-এ `traceparent` header দিয়ে trace context propagate করুন। যেসব customer OTel ব্যবহার করে তারা আপনার span ID তাদের trace-এ টেনে নিতে পারে — পূর্ণ distributed visibility।

## Customer-facing dashboard

একই data, ভিন্ন audience। Customer-রা কেবল তাদের নিজের subscription দেখে। page-গুলো:

**Subscription list।**

- URL, subscribe করা event type, success rate (24h), শেষ সফল delivery, current state।

**Recent events।**

- Per-event row: ID, type, status, attempt, শেষ attempt time। state আর type দিয়ে filterable।

**Event detail।**

- আমরা যে signed body আর header পাঠিয়েছি।
- সব attempt: timestamp, response status, response body snippet, duration।
- Resend button।
- "এটা কেন fail করল?" hint (যেমন, "আপনার endpoint একটা 502 Bad Gateway return করেছে")।

**Endpoint health।**

- সময়ের সাথে success rate।
- Latency চার্ট।
- সাম্প্রতিক failure।

Stripe-এর dashboard হলো reference। আপনি একটা weekend-এ অনেক সরল একটা version ship করতে পারেন যা ৯০% value কভার করে। অতিরিক্ত engineer করবেন না; ব্যবহারযোগ্য ship করুন।

## Real-time event tail

একটা "live tail" page event ঘটার সাথে সাথে দেখায় — প্রথমবার integrate করা customer-দের জন্য কাজের। Implementation: customer-এর subscription-এর নতুন event-এর একটা SSE stream (WebSockets track-এর অধ্যায় ৫), পূর্ণ request/response inline সহ।

```javascript
const es = new EventSource('/dashboard/subscriptions/42/events/live');
es.addEventListener('event', (e) => {
	const ev = JSON.parse(e.data);
	appendToTable(ev);
});
```

Server-side-এ, `last_event_seen`-এর পর থেকে নতুন row-এর জন্য DB query করুন আর emit করুন। অথবা সঙ্গে সঙ্গে push করতে আপনার producer-এর pubsub channel-এ hook করুন।

এটাই first-time integrator-দের জন্য একক সর্বোচ্চ-value debugging feature। তারা তাদের endpoint URL paste করে, "test event"-এ চাপে, আর round-trip live দেখে। শত শত support ticket বাঁচায়।

<Callout type="tip">

**receiver-এর response body দেখান, শুধু status নয়।** একটা Cloudflare error page সহ একটা 500 response customer-কে ঠিক বলে যে "আপনার origin timeout করছে।" body ছাড়া, তারা একটা ticket ফাইল করে জিজ্ঞেস করে 500 মানে কী।

</Callout>

## Replay action audit করা

প্রতিটা "resend" click একটা audit log লেখা উচিত:

```sql
CREATE TABLE webhook_audit (
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor TEXT NOT NULL, -- "customer:user42" or "operator:alice"
    action TEXT NOT NULL, -- "replay", "bulk_replay", "pause_subscription"
    target TEXT NOT NULL, -- delivery_id or subscription_id
    metadata JSONB
);
```

একটা `bulk_replay` audit row criteria বহন করে:

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

Customer-রা জিজ্ঞেস করলে "আপনি কি আমাদের event resend করেছেন?" আপনার কাছে একটা উত্তর থাকে। একটা duplicate-processing bug তদন্তের সময়, কে কখন replay করল দেখতে পারেন।

## Volume estimate

Webhook ops-এর খরচ delivery volume-এর সাথে scale করে, user count-এর সাথে নয়। মোটামুটি সংখ্যা:

- **10K deliveries/day:** 1 worker, সব log Loki-তে, dashboard একটা HTML page। সহজ।
- **100K/day:** 2–4 worker, INFO level-এ structured log noisy হয় — sample করুন, বা success log-কে DEBUG-এ নামান। Dashboard-এর pagination দরকার।
- **1M/day:** dedicated worker fleet, log sampling, partitioned table, আসল ops মনোযোগ।
- **10M+/day:** specialised infra; build vs buy ভেবে দেখুন।

বেশিরভাগ app integration প্রতি producer-এ 10K–100K/day range-এ। এই অধ্যায়ের pattern commodity hardware-এ ~1M/day পর্যন্ত scale করে।

## Scale-এ log sampling

উঁচু volume-এ, প্রতিটা সফল attempt log করা খরচসাপেক্ষ হয়ে যায়। Sample করুন:

```go
if outcome == "success" && rand.Intn(100) != 0 {
    // log only 1% of successes
} else {
    log.Info("webhook-attempt", ...)
}
```

সবসময় failure log করুন। Success sample করুন। Metric তবুও সবকিছু capture করে; log হলো সেই মুহূর্তগুলোর জন্য যখন আপনি একটা delivery পরিদর্শন করতে চান।

## Per-customer rate limit ও quota

Multi-tenant producer-এর জন্য, observability-তে per-customer counter থাকে:

```go
deliveriesPerCustomer.WithLabelValues(customerID).Inc()
```

তাদের plan limit-এর সাথে মিলিয়ে, আপনি _তাদের_ alert দেন (শুধু নিজেকে নয়):

```
Your webhook usage this month: 4.2M of 5M plan limit.
```

এটা product, শুধু ops নয়। কিন্তু একই metric দুটোকেই সমর্থন করে — এর ওপর শুধু একটা UI লাগে।

## রিক্যাপ

- পাঁচটা Prometheus metric ৯৫% operational প্রশ্ন কভার করে।
- rate, latency, queue depth, DLQ depth, per-subscription rate সহ একটা Grafana dashboard।
- তিনটে Prometheus alert: backlog, DLQ growing, latency high।
- প্রতিটা attempt-এ OpenTelemetry span; event ID দিয়ে trace করুন।
- Customer-facing dashboard: subscription, event, attempt detail, resend, endpoint health।
- Live tail (SSE) হলো first-time integrator-দের জন্য killer feature।
- প্রতিটা replay/pause/resume action actor, target, metadata সহ audit করুন।
- উঁচু volume-এ success log sample করুন; failure কখনও sample করবেন না।
- Per-customer counter ops alert আর product UX দুটোকেই সমর্থন করে।

পরবর্তী: [Self-host](/notes/webhooks/10-production) — outbox pattern, worker pool, আর একটা VPS-এ পূর্ণ deploy।
