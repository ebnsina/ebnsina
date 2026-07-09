---
title: 'Observability'
subtitle: 'Log, metric, আর trace — এই তিন স্তম্ভ আপনাকে বুঝতে দেয় production-এ আপনার Go service আসলে কী করছে।'
chapter: 20
level: 'advanced'
readingTime: '20 মিনিট'
topics: ['observability', 'OpenTelemetry', 'metrics', 'tracing', 'Prometheus', 'monitoring']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## তিন স্তম্ভ

Production service-এর তিন ধরনের observability data দরকার:

| স্তম্ভ      | যে প্রশ্নের উত্তর দেয়        | উদাহরণ                                                           |
| ----------- | ----------------------------- | ---------------------------------------------------------------- |
| **Logs**    | কী ঘটেছিল?                    | "User 42 login failed: invalid password"                         |
| **Metrics** | System কেমন perform করছে?     | "p99 latency = 250ms, error rate = 0.5%"                         |
| **Traces**  | একটা request কীভাবে flow করে? | "Request → API Gateway → User Service → Database (total: 180ms)" |

<Callout type="info">

**বাস্তব উদাহরণ**

**Log** = সিকিউরিটি ক্যামেরার ফুটেজ। কিছু গড়বড় হলে আপনি সেগুলো দেখে বোঝেন। **Metric** = ড্যাশবোর্ডের গেজ (গতি, তেল, তাপমাত্রা)। সব ঠিক আছে কিনা জানতে আপনি একনজরে দেখেন। **Trace** = GPS ট্র্যাকিং। একটা প্যাকেজ ওয়্যারহাউস থেকে দরজা পর্যন্ত ঠিক কোন পথে গেল, প্রতিটা স্টপে কতটা সময় লাগল — সব দেখেন।

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

Go service-এর metric-এর জন্য Prometheus হলো standard:

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

### Custom Business Metric

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

## OpenTelemetry দিয়ে Distributed Tracing

Trace একটা request-কে একাধিক service জুড়ে follow করে:

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

### আপনার Code Instrument করা

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

তিন স্তম্ভকে একসাথে করে একটা health overview বানান:

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

## মূল কথা

1. **`slog` দিয়ে structured logging** — production-এ JSON, development-এ text
2. **চার ধরনের metric**: counter (যা শুধু বাড়ে), gauge (যা বাড়ে-কমে), histogram (distribution), summary (quantile)
3. **service-এর জন্য RED method**: Rate (requests/sec), Errors (error rate), Duration (latency)
4. **resource-এর জন্য USE method**: Utilization, Saturation, Errors (CPU, memory, connection-এর জন্য)
5. **Trace একটা request-কে service জুড়ে follow করে** — প্রতিটা span হলো timing সহ একটা কাজের একক
6. **Prometheus-এর জন্য `/metrics` expose করুন**, load balancer-এর জন্য `/health`, profiling-এর জন্য `/debug/pprof`
7. **অতিরিক্ত instrument করবেন না** — RED metric দিয়ে শুরু করুন, সমস্যা খুঁজতে গেলে নির্দিষ্ট metric যোগ করুন
