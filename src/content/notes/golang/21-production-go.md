---
title: 'Production Go'
subtitle: "Logging, configuration, graceful shutdown, profiling, and deployment — everything between 'it works on my machine' and running at scale."
chapter: 21
level: 'advanced'
readingTime: '25 min'
topics:
  ['logging', 'configuration', 'graceful shutdown', 'profiling', 'deployment', 'observability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Structured Logging with slog

Go 1.21 introduced `log/slog` — structured, leveled logging in the standard library. No more `log.Println` in production.

```go
import "log/slog"

func main() {
    // JSON logger for production (machines can parse it)
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
    }))
    slog.SetDefault(logger)

    // Structured log entries
    slog.Info("server started",
        "port", 8080,
        "env", "production",
    )
    // {"time":"2024-01-15T10:30:00Z","level":"INFO","msg":"server started","port":8080,"env":"production"}

    slog.Error("request failed",
        "method", "POST",
        "path", "/api/users",
        "status", 500,
        "error", err,
        "duration_ms", 250,
    )

    // Logger with default fields (add to every log entry)
    reqLogger := slog.With(
        "request_id", requestID,
        "user_id", userID,
    )
    reqLogger.Info("processing order", "order_id", orderID)
    // All fields (request_id, user_id, order_id) appear in every log
}
```

<Callout type="info">

**Real-World Analogy**

Structured logging is like filling out a police report vs. writing a diary entry. A diary says "Something bad happened today at the store." A report has fields: incident_type=theft, location=Main_St, time=14:30, suspect_description=... Machines (log aggregators like Datadog, Splunk) can search, filter, and alert on structured fields.

</Callout>

## Configuration Management

Production services need configuration from environment variables, files, and flags:

```go
type Config struct {
    Port        int           `env:"PORT" default:"8080"`
    DatabaseURL string        `env:"DATABASE_URL" required:"true"`
    RedisURL    string        `env:"REDIS_URL" default:"localhost:6379"`
    LogLevel    string        `env:"LOG_LEVEL" default:"info"`
    Timeout     time.Duration `env:"REQUEST_TIMEOUT" default:"30s"`
}

func LoadConfig() (*Config, error) {
    cfg := &Config{}

    // Read from environment variables
    cfg.Port = getEnvInt("PORT", 8080)
    cfg.DatabaseURL = getEnvRequired("DATABASE_URL")
    cfg.RedisURL = getEnv("REDIS_URL", "localhost:6379")
    cfg.LogLevel = getEnv("LOG_LEVEL", "info")
    cfg.Timeout = getEnvDuration("REQUEST_TIMEOUT", 30*time.Second)

    return cfg, cfg.validate()
}

func getEnv(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}

func getEnvRequired(key string) string {
    v := os.Getenv(key)
    if v == "" {
        log.Fatalf("required environment variable %s is not set", key)
    }
    return v
}

func getEnvInt(key string, fallback int) int {
    v := os.Getenv(key)
    if v == "" {
        return fallback
    }
    n, err := strconv.Atoi(v)
    if err != nil {
        log.Fatalf("invalid integer for %s: %s", key, v)
    }
    return n
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
    v := os.Getenv(key)
    if v == "" {
        return fallback
    }
    d, err := time.ParseDuration(v)
    if err != nil {
        log.Fatalf("invalid duration for %s: %s", key, v)
    }
    return d
}

func (c *Config) validate() error {
    if c.Port < 1 || c.Port > 65535 {
        return fmt.Errorf("invalid port: %d", c.Port)
    }
    return nil
}
```

## Graceful Shutdown

When you deploy new code, existing requests should finish before the old process dies:

```go
func main() {
    cfg, err := LoadConfig()
    if err != nil {
        log.Fatal(err)
    }

    // Setup dependencies
    db, err := sql.Open("postgres", cfg.DatabaseURL)
    if err != nil {
        log.Fatal(err)
    }

    // Setup server
    mux := http.NewServeMux()
    mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("ok"))
    })
    // ... register routes

    server := &http.Server{
        Addr:         fmt.Sprintf(":%d", cfg.Port),
        Handler:      mux,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // Start server in background
    go func() {
        slog.Info("server starting", "port", cfg.Port)
        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatalf("server error: %v", err)
        }
    }()

    // Wait for shutdown signal
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    sig := <-quit
    slog.Info("shutdown signal received", "signal", sig)

    // Graceful shutdown with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        slog.Error("forced shutdown", "error", err)
    }

    // Close other resources
    db.Close()
    slog.Info("server stopped gracefully")
}
```

<Callout type="info">

**Real-World Analogy**

Graceful shutdown is like a restaurant's "last call." The kitchen stops taking new orders (stop accepting connections), but finishes cooking everything that's already been ordered (in-flight requests). After 30 minutes (timeout), they turn off the lights even if someone is still eating (force close).

</Callout>

## Health Checks and Readiness Probes

Essential for Kubernetes and load balancer deployments:

```go
type HealthChecker struct {
    db    *sql.DB
    redis *redis.Client
}

func (h *HealthChecker) LivenessHandler(w http.ResponseWriter, r *http.Request) {
    // Liveness: is the process alive? (simple check)
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "alive"})
}

func (h *HealthChecker) ReadinessHandler(w http.ResponseWriter, r *http.Request) {
    // Readiness: can we serve traffic? (check dependencies)
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    checks := map[string]string{}

    if err := h.db.PingContext(ctx); err != nil {
        checks["database"] = fmt.Sprintf("unhealthy: %v", err)
    } else {
        checks["database"] = "healthy"
    }

    if err := h.redis.Ping(ctx).Err(); err != nil {
        checks["redis"] = fmt.Sprintf("unhealthy: %v", err)
    } else {
        checks["redis"] = "healthy"
    }

    healthy := true
    for _, status := range checks {
        if status != "healthy" {
            healthy = false
            break
        }
    }

    if healthy {
        w.WriteHeader(http.StatusOK)
    } else {
        w.WriteHeader(http.StatusServiceUnavailable)
    }
    json.NewEncoder(w).Encode(checks)
}
```

## Profiling with pprof

Go has built-in profiling. Add one import to expose profiling endpoints:

```go
import _ "net/http/pprof"

func main() {
    // pprof endpoints automatically registered at /debug/pprof/
    go func() {
        log.Println(http.ListenAndServe(":6060", nil))
    }()

    // Your application server on :8080
    // ...
}
```

```bash
# CPU profile (30 seconds)
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Memory profile
go tool pprof http://localhost:6060/debug/pprof/heap

# Goroutine dump (find goroutine leaks)
go tool pprof http://localhost:6060/debug/pprof/goroutine

# Interactive commands in pprof
# (pprof) top 10        — top 10 functions by CPU
# (pprof) web           — open flamegraph in browser
# (pprof) list funcName — show line-by-line cost
```

<Callout type="warning">

**Never expose pprof on your public port.** It reveals internal details about your application. Run it on a separate port (`:6060`) that's only accessible internally, behind your firewall.

</Callout>

## Building and Deploying

### Multi-stage Docker Build

```dockerfile
# Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

# Stage 2: Run (tiny image — ~10MB instead of ~800MB)
FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]
```

### Build with Version Info

```go
// Injected at build time via ldflags
var (
    version   = "dev"
    commit    = "unknown"
    buildTime = "unknown"
)

func main() {
    slog.Info("starting",
        "version", version,
        "commit", commit,
        "build_time", buildTime,
    )
    // ...
}
```

```bash
go build -ldflags="-X main.version=1.2.3 -X main.commit=$(git rev-parse --short HEAD) -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" -o server ./cmd/server
```

## Production Checklist

Here's what separates a toy Go project from a production service:

```go
func main() {
    // 1. Load and validate configuration
    cfg, err := LoadConfig()
    if err != nil {
        log.Fatalf("config error: %v", err)
    }

    // 2. Setup structured logging
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: parseLogLevel(cfg.LogLevel),
    }))
    slog.SetDefault(logger)

    // 3. Connect to dependencies with retry
    db, err := connectWithRetry(cfg.DatabaseURL, 5, 2*time.Second)
    if err != nil {
        log.Fatalf("database connection failed: %v", err)
    }
    defer db.Close()
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)

    // 4. Setup HTTP server with timeouts
    mux := http.NewServeMux()
    registerRoutes(mux, db)

    server := &http.Server{
        Addr:         fmt.Sprintf(":%d", cfg.Port),
        Handler:      middleware(mux),  // logging, recovery, cors
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // 5. Start pprof on separate port
    go func() {
        slog.Info("pprof available", "port", 6060)
        http.ListenAndServe(":6060", nil)
    }()

    // 6. Start server
    go func() {
        slog.Info("server started", "port", cfg.Port)
        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatalf("server error: %v", err)
        }
    }()

    // 7. Graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    server.Shutdown(ctx)
    slog.Info("server stopped")
}

func connectWithRetry(url string, maxRetries int, delay time.Duration) (*sql.DB, error) {
    var db *sql.DB
    var err error
    for i := 0; i < maxRetries; i++ {
        db, err = sql.Open("postgres", url)
        if err == nil {
            if err = db.Ping(); err == nil {
                return db, nil
            }
        }
        slog.Warn("db connection failed, retrying",
            "attempt", i+1,
            "max", maxRetries,
            "error", err,
        )
        time.Sleep(delay)
        delay *= 2  // Exponential backoff
    }
    return nil, fmt.Errorf("failed after %d retries: %w", maxRetries, err)
}
```

## Performance Tips

```go
// 1. Pre-allocate slices when you know the size
users := make([]User, 0, len(ids))  // Avoids repeated re-allocation

// 2. Use strings.Builder for string concatenation
var sb strings.Builder
for _, s := range items {
    sb.WriteString(s)
}
result := sb.String()

// 3. Use sync.Pool for frequently allocated objects
var bufPool = sync.Pool{
    New: func() any {
        return new(bytes.Buffer)
    },
}

func processRequest() {
    buf := bufPool.Get().(*bytes.Buffer)
    defer func() {
        buf.Reset()
        bufPool.Put(buf)
    }()
    // Use buf...
}

// 4. Use strconv instead of fmt for number→string conversion
s := strconv.Itoa(42)          // Fast
s := fmt.Sprintf("%d", 42)    // 5x slower (reflection + allocation)

// 5. Avoid unnecessary allocations in hot paths
// BAD: allocates a new slice every call
func getKeys(m map[string]int) []string {
    keys := []string{}  // Allocates
    for k := range m {
        keys = append(keys, k)
    }
    return keys
}

// GOOD: pre-allocate
func getKeys(m map[string]int) []string {
    keys := make([]string, 0, len(m))  // No re-allocation
    for k := range m {
        keys = append(keys, k)
    }
    return keys
}
```

## Key Takeaways

1. **Use `slog` for structured logging** — JSON in production, text in development
2. **Load config from environment variables** — validate at startup, fail fast
3. **Graceful shutdown is mandatory** — `signal.Notify` + `server.Shutdown(ctx)` + timeout
4. **Health checks**: liveness (is the process alive?) and readiness (can it serve traffic?)
5. **pprof on a separate port** — profile CPU, memory, and goroutines in production
6. **Multi-stage Docker builds** — final image is ~10MB with just the binary
7. **Connection retry with exponential backoff** — databases and caches aren't always ready instantly
8. **Pre-allocate slices, use `sync.Pool`, avoid `fmt.Sprintf` in hot paths** — small optimizations compound at scale
