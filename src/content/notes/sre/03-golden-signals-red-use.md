---
title: "Golden Signals, RED, and USE"
subtitle: "The three monitoring frameworks that actually matter, when to use each, and the Prometheus + Grafana stack that exposes them all."
chapter: 3
level: "beginner"
readingTime: "16 min"
topics: ["monitoring", "golden signals", "RED", "USE", "Prometheus", "Grafana"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Three frameworks, one decision tree

There are three competing acronyms for "what to monitor." They are not rivals — each fits a different layer of the stack.

```
GOLDEN SIGNALS  → User-facing services (any service Google would pager-rotate on)
RED             → Request-driven microservices specifically
USE             → Resources (machines, disks, NICs, queues)

Decision tree:
  Are you measuring a service that handles requests?      → RED
  Are you measuring a resource (CPU, disk, queue depth)?  → USE
  Are you defining the top-level SLI dashboard?           → GOLDEN SIGNALS
```

Most production setups use all three layered: USE for the underlying infra, RED for each microservice, Golden Signals for the user journey.

## The Four Golden Signals (Google SRE)

```
1. Latency      — how long does it take?     (split success vs error latency)
2. Traffic      — how much demand?           (RPS, concurrent users)
3. Errors       — how often does it fail?    (5xx, semantic errors)
4. Saturation   — how full is the system?    (queue depth, CPU, file descriptors)
```

Saturation is the one teams forget. A service running at 95% CPU is healthy *until* it isn't, and the inflection point is usually a cliff. Saturation tells you how close to the cliff you are.

<Callout type="info">

**Real-World Analogy**

A car dashboard shows speed (latency), RPM (traffic), check-engine light (errors), and fuel gauge (saturation). Each tells you a different question — none replaces the others. A car with a full tank can still die if the engine is overheating.

</Callout>

## RED method (Tom Wilkie / Weaveworks)

For request-driven services. RED is essentially Golden Signals minus saturation, optimized for microservice dashboards.

```
R — Rate       Requests per second
E — Errors     Failed requests per second
D — Duration   Latency distribution
```

A standard RED dashboard has three panels per service. Once you have RED for every microservice, you can navigate from a top-level SLO dashboard down to "which microservice is the source of error rate spike" in two clicks.

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

For resources — anything finite that requests consume.

```
U — Utilization   % of time the resource is busy
S — Saturation    Extra work that can't be serviced (queue depth, run-queue length)
E — Errors        Error events (failed I/O, dropped packets, retransmits)
```

The trick is recognizing what counts as a "resource." Some non-obvious ones:

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

Every one of those will eventually be the bottleneck in some incident. Have USE metrics for all of them or you will be debugging blind.

## Instrumenting a Go service end-to-end

Here is a complete, production-shape Go HTTP service with RED metrics, exposed for Prometheus scraping.

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

The path label is hardcoded per route on purpose. **Never use `r.URL.Path` as a label** — high-cardinality labels (UUIDs, slugs) will explode Prometheus memory and bring it down.

<Callout type="warning">

**Cardinality is the silent killer.** A single mistake — labeling metrics with `user_id` — will create one time series per user, blow up Prometheus memory, and OOM the whole monitoring stack. Always label with a small, bounded set: `method`, `route_pattern`, `status_class`.

</Callout>

## Histogram bucket selection

The default Prometheus buckets are wrong for most services. They cover 5ms to 10s linearly-ish, but your SLO threshold is probably one specific value.

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

## A real Grafana dashboard layout

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

Rule: the dashboard should answer "is the service healthy?" in under 5 seconds. If you have to scroll, redesign it.

## Symptom-based alerting

This is the rule that prevents alert fatigue:

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

USE metrics belong on dashboards (for diagnosis during incidents) but rarely on pagers (the symptom alert covers the user-facing impact).

## Stay current

- [Brendan Gregg — USE method](https://www.brendangregg.com/usemethod.html) — the source
- [Tom Wilkie — RED method](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/) — original post
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) — keep your metric names portable
- [Prometheus best practices](https://prometheus.io/docs/practices/) — naming, labels, histograms

## Key Takeaways

1. **Golden Signals at the top, RED per service, USE per resource** — three layers
2. **Latency must be a quantile** (p99), never an average
3. **Saturation is the cliff indicator** — utilization without saturation is misleading
4. **Bucket your histograms around the SLO threshold** for accurate quantiles
5. **Page on symptoms, dashboard on causes** — it's the only sustainable alerting

