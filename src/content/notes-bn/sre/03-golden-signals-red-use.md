---
title: 'Golden Signals, RED, and USE'
subtitle: 'যে তিনটা monitoring framework আসলে গুরুত্বপূর্ণ, কখন কোনটা ব্যবহার করবে, আর যে Prometheus + Grafana stack সেগুলো সব expose করে।'
chapter: 3
level: 'beginner'
readingTime: '16 মিনিট'
topics: ['monitoring', 'golden signals', 'RED', 'USE', 'Prometheus', 'Grafana']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## তিনটা framework, একটা decision tree

"কী monitor করব" নিয়ে তিনটা প্রতিদ্বন্দ্বী acronym আছে। এরা প্রতিদ্বন্দ্বী নয় — প্রতিটা stack-এর একটা আলাদা layer-এ ফিট করে।

```
GOLDEN SIGNALS  → User-facing services (any service Google would pager-rotate on)
RED             → Request-driven microservices specifically
USE             → Resources (machines, disks, NICs, queues)

Decision tree:
  Are you measuring a service that handles requests?      → RED
  Are you measuring a resource (CPU, disk, queue depth)?  → USE
  Are you defining the top-level SLI dashboard?           → GOLDEN SIGNALS
```

বেশিরভাগ production setup তিনটাই layered ব্যবহার করে: underlying infra-র জন্য USE, প্রতিটা microservice-এর জন্য RED, user journey-র জন্য Golden Signals।

## The Four Golden Signals (Google SRE)

```
1. Latency      — how long does it take?     (split success vs error latency)
2. Traffic      — how much demand?           (RPS, concurrent users)
3. Errors       — how often does it fail?    (5xx, semantic errors)
4. Saturation   — how full is the system?    (queue depth, CPU, file descriptors)
```

Saturation-টাই team-রা ভুলে যায়। 95% CPU-তে চলা একটা service ততক্ষণ healthy _যতক্ষণ না_ সেটা নয়, আর inflection point-টা সাধারণত একটা cliff। Saturation তোমাকে বলে তুমি cliff থেকে কত কাছে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা গাড়ির dashboard দেখায় speed (latency), RPM (traffic), check-engine light (errors), আর fuel gauge (saturation)। প্রতিটা তোমাকে একটা আলাদা প্রশ্ন বলে — কোনোটা অন্যটার বিকল্প নয়। full tank সহ একটা গাড়িও মরে যেতে পারে যদি engine overheat হয়।

</Callout>

## RED method (Tom Wilkie / Weaveworks)

Request-driven service-এর জন্য। RED মূলত Golden Signals থেকে saturation বাদ, microservice dashboard-এর জন্য optimized।

```
R — Rate       Requests per second
E — Errors     Failed requests per second
D — Duration   Latency distribution
```

একটা standard RED dashboard-এ প্রতি service-এ তিনটা panel থাকে। প্রতিটা microservice-এর জন্য RED পেয়ে গেলে, তুমি একটা top-level SLO dashboard থেকে দুই ক্লিকে "কোন microservice error rate spike-এর উৎস" পর্যন্ত navigate করতে পারো।

```promql
# Rate (requests/sec, by service and status)
sum by (service, status) (
  rate(http_requests_total[1m])
)

# Errors (5xx rate as a percentage)
100 * sum by (service) (
  rate(http_requests_total{status=~"5.."}[1m])
)
/
sum by (service) (
  rate(http_requests_total[1m])
)

# Duration (p50, p95, p99)
histogram_quantile(0.50, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))
histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))
histogram_quantile(0.99, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))
```

## USE method (Brendan Gregg)

Resource-এর জন্য — যেকোনো finite জিনিস যা request consume করে।

```
U — Utilization   % of time the resource is busy
S — Saturation    Extra work that can't be serviced (queue depth, run-queue length)
E — Errors        Error events (failed I/O, dropped packets, retransmits)
```

কৌশলটা হচ্ছে কী "resource" হিসেবে গণ্য হয় তা চিনতে পারা। কিছু non-obvious ঃ

```
CPU            → utilization, run-queue length, throttled time
Memory         → used %, swap-in rate, OOM kill count
Disk I/O       → utilization, queue depth, await time, error count
Network        → bandwidth used, dropped packets, retransmits
File descriptors → open count vs ulimit
DB connections → active vs pool size
Thread pools   → busy threads vs max
Kafka topics   → consumer lag, broker disk pressure
```

এদের প্রতিটাই শেষমেশ কোনো না কোনো incident-এ bottleneck হবে। এদের সবার জন্য USE metrics রাখো নয়তো তুমি অন্ধ হয়ে debug করবে।

## একটা Go service end-to-end instrument করা

এখানে একটা সম্পূর্ণ, production-shape Go HTTP service, RED metrics সহ, Prometheus scraping-এর জন্য expose করা।

```go
package main

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests processed",
	}, []string{"method", "path", "status"})

	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name: "http_request_duration_seconds",
		Help: "HTTP request duration in seconds",
		// Buckets matter — pick them around your SLO threshold
		Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
	}, []string{"method", "path"})

	inflightRequests = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "http_requests_inflight",
		Help: "Currently in-flight HTTP requests (saturation signal)",
	})
)

// statusRecorder captures the status code so we can label metrics.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func metricsMiddleware(path string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inflightRequests.Inc()
		defer inflightRequests.Dec()

		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}

		next.ServeHTTP(rec, r)

		duration := time.Since(start).Seconds()
		httpDuration.WithLabelValues(r.Method, path).Observe(duration)
		httpRequests.WithLabelValues(r.Method, path, strconv.Itoa(rec.status)).Inc()
	})
}

func checkoutHandler(w http.ResponseWriter, r *http.Request) {
	// pretend work
	time.Sleep(50 * time.Millisecond)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"ok":true}`))
}

func main() {
	mux := http.NewServeMux()
	mux.Handle("/checkout", metricsMiddleware("/checkout", http.HandlerFunc(checkoutHandler)))
	mux.Handle("/metrics", promhttp.Handler())

	http.ListenAndServe(":8080", mux)
}
```

path label-টা ইচ্ছাকৃতভাবে প্রতি route-এ hardcode করা। **`r.URL.Path`-কে কখনো label হিসেবে ব্যবহার করো না** — high-cardinality labels (UUIDs, slugs) Prometheus memory উড়িয়ে দেবে আর সেটাকে ধসিয়ে দেবে।

<Callout type="warning">

**Cardinality হচ্ছে নীরব ঘাতক।** একটা মাত্র ভুল — metrics-কে `user_id` দিয়ে label করা — প্রতি user-এ একটা time series তৈরি করবে, Prometheus memory উড়িয়ে দেবে, আর পুরো monitoring stack-কে OOM করবে। সবসময় একটা ছোট, bounded set দিয়ে label করো: `method`, `route_pattern`, `status_class`।

</Callout>

## Histogram bucket নির্বাচন

default Prometheus buckets বেশিরভাগ service-এর জন্য ভুল। এরা 5ms থেকে 10s পর্যন্ত মোটামুটি linearly cover করে, কিন্তু তোমার SLO threshold সম্ভবত একটা নির্দিষ্ট value।

```go
// Rule of thumb: cluster buckets around your SLO threshold
// SLO says "99% of checkout requests under 300ms"
// → put dense buckets near 300ms

Buckets: []float64{
	.05,  .1,  .15, .2, .25,
	.3,   .35, .4,  .5,         // dense around SLO
	.75,  1, 2.5, 5, 10,         // sparse for the long tail
}

// Why? histogram_quantile interpolates within the bucket the
// quantile falls into. Sparse buckets near 300ms = inaccurate p99.
```

## একটা রিয়েল Grafana dashboard layout

```
┌──────────────────────────────────────────────────────────────┐
│  TOP ROW: SLO COMPLIANCE                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ SLO Attainment│ │ Budget Used  │ │ Burn Rate    │         │
│  │   99.96%     │ │   23%        │ │   1.2x       │         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
├──────────────────────────────────────────────────────────────┤
│  RED PER SERVICE (heatmap of all microservices)             │
│  Rate │ Errors │ Latency p99                                │
├──────────────────────────────────────────────────────────────┤
│  USE FOR INFRA (per-pod and per-node)                       │
│  CPU util │ Memory util │ Disk util │ Network util          │
│  CPU sat  │ Mem  sat    │ Disk sat  │ Net retransmits       │
└──────────────────────────────────────────────────────────────┘
```

নিয়ম: dashboard-টা 5 সেকেন্ডের কমে "service কি healthy?" প্রশ্নের উত্তর দিতে পারবে। scroll করতে হলে, redesign করো।

## Symptom-based alerting

এই নিয়মটাই alert fatigue আটকায়:

```yaml
# ✗ BAD: alerting on a cause
- alert: HighCPU
  expr: node_cpu_utilization > 0.9
  # Most "high CPU" never produces a user-visible problem.
  # You'll page yourself for nothing.

# ✓ GOOD: alerting on a symptom (SLI is degraded)
- alert: CheckoutErrorBudgetFastBurn
  expr: |
    (1 - sli:checkout_availability:ratio_rate1h) >
    (14.4 * (1 - 0.999))
  # This fires only when users are actually being hurt.
```

USE metrics dashboard-এ থাকে (incident-এর সময় diagnosis-এর জন্য) কিন্তু pager-এ কদাচিৎ (symptom alert-টাই user-facing impact cover করে)।

## Stay current

- [Brendan Gregg — USE method](https://www.brendangregg.com/usemethod.html) — source
- [Tom Wilkie — RED method](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/) — original post
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) — তোমার metric name portable রাখো
- [Prometheus best practices](https://prometheus.io/docs/practices/) — naming, labels, histograms

## Key Takeaways

1. **উপরে Golden Signals, প্রতি service-এ RED, প্রতি resource-এ USE** — তিনটা layer
2. **Latency অবশ্যই একটা quantile হতে হবে** (p99), কখনো average নয়
3. **Saturation হচ্ছে cliff indicator** — saturation ছাড়া utilization বিভ্রান্তিকর
4. **তোমার histogram-গুলোকে SLO threshold-এর চারপাশে bucket করো** — accurate quantile-এর জন্য
5. **Symptom-এ page, cause-এ dashboard** — এটাই একমাত্র sustainable alerting
