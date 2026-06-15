---
title: "Observability"
subtitle: "Logs, metrics, and traces — the three pillars that let you understand what your Go service is doing in production."
chapter: 20
level: "advanced"
readingTime: "20 min"
topics: ["observability", "OpenTelemetry", "metrics", "tracing", "Prometheus", "monitoring"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Three Pillars

Production services need three types of observability data:

| Pillar | Question It Answers | Example |
|--------|-------------------|---------|
| **Logs** | What happened? | "User 42 login failed: invalid password" |
| **Metrics** | How is the system performing? | "p99 latency = 250ms, error rate = 0.5%" |
| **Traces** | How does a request flow? | "Request → API Gateway → User Service → Database (total: 180ms)" |

<Callout type="info">

**Real-World Analogy**

**Logs** = security camera footage. You review them when something goes wrong. **Metrics** = dashboard gauges (speed, fuel, temperature). You glance at them to know if everything is healthy. **Traces** = GPS tracking. You see the exact path a package took from warehouse to doorstep, with time spent at each stop.

</Callout>

## Structured Logging (slog)

```go
// Production logging setup
func setupLogger(env string) *slog.Logger {
    var handler slog.Handler

    switch env {
    case "production":
        handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelInfo,
        })
    default:
        handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelDebug,
        })
    }

    return slog.New(handler)
}

// Request-scoped logger
func requestLogger(logger *slog.Logger, r *http.Request) *slog.Logger {
    return logger.With(
        "request_id", getRequestID(r.Context()),
        "method", r.Method,
        "path", r.URL.Path,
        "remote_addr", r.RemoteAddr,
    )
}

// Usage in handlers
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    log := requestLogger(h.logger, r)

    log.Info("fetching user", "user_id", id)

    user, err := h.service.GetByID(r.Context(), id)
    if err != nil {
        log.Error("failed to get user", "error", err, "user_id", id)
        // ...
    }

    log.Info("user fetched successfully", "user_id", id)
}
```

## Prometheus Metrics

Prometheus is the standard for Go service metrics:

```go
import "github.com/prometheus/client_golang/prometheus"
import "github.com/prometheus/client_golang/prometheus/promhttp"

var (
    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "path", "status"},
    )

    httpRequestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request duration in seconds",
            Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5},
        },
        []string{"method", "path"},
    )

    activeConnections = prometheus.NewGauge(
        prometheus.GaugeOpts{
            Name: "active_connections",
            Help: "Number of active connections",
        },
    )

    dbQueryDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "db_query_duration_seconds",
            Help:    "Database query duration",
            Buckets: prometheus.DefBuckets,
        },
        []string{"query"},
    )
)

func init() {
    prometheus.MustRegister(httpRequestsTotal)
    prometheus.MustRegister(httpRequestDuration)
    prometheus.MustRegister(activeConnections)
    prometheus.MustRegister(dbQueryDuration)
}
```

### Metrics Middleware

```go
func MetricsMiddleware() Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            wrapped := &statusWriter{ResponseWriter: w, status: 200}

            next.ServeHTTP(wrapped, r)

            duration := time.Since(start).Seconds()
            status := strconv.Itoa(wrapped.status)

            httpRequestsTotal.WithLabelValues(r.Method, r.URL.Path, status).Inc()
            httpRequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)
        })
    }
}

// Expose metrics endpoint
mux.Handle("GET /metrics", promhttp.Handler())
```

### Custom Business Metrics

```go
var (
    ordersPlaced = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "orders_placed_total",
            Help: "Total orders placed",
        },
        []string{"payment_method", "status"},
    )

    orderAmount = prometheus.NewHistogram(
        prometheus.HistogramOpts{
            Name:    "order_amount_dollars",
            Help:    "Order amounts in dollars",
            Buckets: []float64{10, 25, 50, 100, 250, 500, 1000},
        },
    )
)

func (s *OrderService) PlaceOrder(ctx context.Context, order Order) error {
    err := s.processOrder(ctx, order)

    if err != nil {
        ordersPlaced.WithLabelValues(order.PaymentMethod, "failed").Inc()
        return err
    }

    ordersPlaced.WithLabelValues(order.PaymentMethod, "success").Inc()
    orderAmount.Observe(order.Total)
    return nil
}
```

## Distributed Tracing with OpenTelemetry

Traces follow a request across multiple services:

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func setupTracing(ctx context.Context, serviceName string) (func(), error) {
    exporter, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint("localhost:4317"),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil {
        return nil, fmt.Errorf("creating exporter: %w", err)
    }

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String(serviceName),
        )),
    )
    otel.SetTracerProvider(tp)

    return func() { tp.Shutdown(ctx) }, nil
}
```

### Instrumenting Your Code

```go
var tracer = otel.Tracer("bookstore")

func (s *BookService) GetByID(ctx context.Context, id int) (*Book, error) {
    ctx, span := tracer.Start(ctx, "BookService.GetByID",
        trace.WithAttributes(
            attribute.Int("book.id", id),
        ),
    )
    defer span.End()

    // Check cache
    ctx, cacheSpan := tracer.Start(ctx, "cache.get")
    book, err := s.cache.Get(ctx, fmt.Sprintf("book:%d", id))
    cacheSpan.End()

    if err == nil && book != nil {
        span.SetAttributes(attribute.Bool("cache.hit", true))
        return book, nil
    }

    // Query database
    ctx, dbSpan := tracer.Start(ctx, "db.query",
        trace.WithAttributes(
            attribute.String("db.statement", "SELECT * FROM books WHERE id = $1"),
        ),
    )
    book, err = s.repo.GetByID(ctx, id)
    dbSpan.End()

    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return nil, err
    }

    return book, nil
}
```

## Health Check Dashboard

Combine all three pillars into a health overview:

```go
type HealthStatus struct {
    Status    string            `json:"status"`
    Version   string            `json:"version"`
    Uptime    string            `json:"uptime"`
    Checks    map[string]Check  `json:"checks"`
}

type Check struct {
    Status   string        `json:"status"`
    Duration string        `json:"duration"`
    Error    string        `json:"error,omitempty"`
}

func (h *HealthHandler) DetailedHealth(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
    defer cancel()

    checks := make(map[string]Check)

    // Database check
    dbStart := time.Now()
    if err := h.db.PingContext(ctx); err != nil {
        checks["database"] = Check{Status: "unhealthy", Duration: time.Since(dbStart).String(), Error: err.Error()}
    } else {
        checks["database"] = Check{Status: "healthy", Duration: time.Since(dbStart).String()}
    }

    // Redis check
    redisStart := time.Now()
    if err := h.redis.Ping(ctx).Err(); err != nil {
        checks["redis"] = Check{Status: "unhealthy", Duration: time.Since(redisStart).String(), Error: err.Error()}
    } else {
        checks["redis"] = Check{Status: "healthy", Duration: time.Since(redisStart).String()}
    }

    overall := "healthy"
    for _, c := range checks {
        if c.Status != "healthy" {
            overall = "degraded"
            break
        }
    }

    status := http.StatusOK
    if overall != "healthy" {
        status = http.StatusServiceUnavailable
    }

    writeJSON(w, status, HealthStatus{
        Status:  overall,
        Version: version,
        Uptime:  time.Since(startTime).String(),
        Checks:  checks,
    })
}
```

## Key Takeaways

1. **Structured logging with `slog`** — JSON in production, text in development
2. **Four metric types**: counters (things that go up), gauges (things that go up and down), histograms (distributions), summaries (quantiles)
3. **RED method for services**: Rate (requests/sec), Errors (error rate), Duration (latency)
4. **USE method for resources**: Utilization, Saturation, Errors (for CPU, memory, connections)
5. **Traces follow requests across services** — each span is a unit of work with timing
6. **Expose `/metrics` for Prometheus**, `/health` for load balancers, `/debug/pprof` for profiling
7. **Don't over-instrument** — start with RED metrics and add specific ones when investigating issues

