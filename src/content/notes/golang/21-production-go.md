---
title: 'Production Go'
subtitle: "Logging, configuration, graceful shutdown, profiling, আর deployment — 'আমার মেশিনে তো কাজ করে' থেকে scale-এ চালানোর মাঝের সবকিছু।"
chapter: 21
level: 'advanced'
readingTime: '25 মিনিট'
topics:
  ['logging', 'configuration', 'graceful shutdown', 'profiling', 'deployment', 'observability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনার মুদি দোকানের বন্ধ করার একটা নিয়ম আছে। সকালে খোলার সময় দরজায় একটা সাইনবোর্ড ঝুলিয়ে দেয় — আজ কয়টায় খুলছে, কী কী দর, কোন কোন জিনিস আজ পাওয়া যাবে। দোকানের বাইরে আরেকটা ছোট বোর্ড, "খোলা আছে, সব ঠিকঠাক" — পথচারী বা সাপ্লায়ার দূর থেকে দেখেই বুঝে যায় ভেতরে ঢোকা যাবে কিনা। আর একটা অলিখিত নিয়ম, একজন খদ্দের কাউন্টার আঁকড়ে সারাদিন দাঁড়িয়ে থাকতে পারবে না — মালপত্র বাছাই আর দাম মেটানোর একটা মোটামুটি সময়সীমা আছে, নইলে পেছনের লাইন আটকে যায়।

বন্ধ করার সময়টাই আসল। ঠিক বন্ধের মুহূর্তে সিনা হুট করে সবাইকে ধাক্কা দিয়ে বের করে দেয় না। সে নতুন খদ্দের ঢোকানো বন্ধ করে দেয় — দরজায় দাঁড়িয়ে যায়, নতুন কেউ এলে বলে "আজকের মতো শেষ"। কিন্তু ভেতরে যারা ইতিমধ্যে কাউন্টারে মাল নিয়ে দাঁড়িয়ে আছে, তাদের কেনাকাটা পুরো শেষ করতে দেয়, দাম নেয়, তারপর শাটার নামায়। কেউ যদি অস্বাভাবিক দেরি করে ফেলে, তখন অবশ্য সে বাধ্য হয়ে তালা দিয়ে দেয়।

এটাই আসলে production-এ Go চালানোর গল্প। নতুন খদ্দের ঢোকানো বন্ধ করেও চলমান কেনাকাটা শেষ করতে দেওয়াটা হলো **graceful shutdown** — নতুন request নেওয়া বন্ধ, কিন্তু in-flight request-গুলো শেষ হওয়ার সুযোগ। সকালের সাইনবোর্ডের দর-নিয়ম হলো **configuration** (port, log level, timeout — বাইরে থেকে দেওয়া)। বাইরের "খোলা আছে, সব ঠিকঠাক" বোর্ডটা হলো **health check**, যা দেখে load balancer ঠিক করে traffic পাঠাবে কিনা। আর একজন খদ্দের কাউন্টার আঁকড়ে থাকতে না পারার নিয়মটা হলো **timeout ও resource limit**। বাস্তবে Kubernetes যখন rolling deploy করে, পুরনো pod-কে সে একটা **SIGTERM** পাঠায় — ঠিক সিনার "আজকের মতো শেষ" বলার মতো সংকেত — আর আপনার Go program-এর কাজ হলো সেটা শুনে চলমান request শেষ করে তবেই বন্ধ হওয়া।

## slog দিয়ে Structured Logging

Go 1.21 এনেছে `log/slog` — standard library-তে structured, leveled logging। Production-এ আর `log.Println` নয়।

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

**বাস্তব উদাহরণ**

Structured logging হলো ডায়েরি লেখার বদলে একটা পুলিশ রিপোর্ট পূরণ করার মতো। ডায়েরি বলে "আজ দোকানে খারাপ কিছু একটা ঘটেছে।" রিপোর্টে থাকে ফিল্ড: incident_type=theft, location=Main_St, time=14:30, suspect_description=...। মেশিন (Datadog, Splunk-এর মতো log aggregator) এই structured field-গুলোতে search, filter, আর alert করতে পারে।

</Callout>

## Configuration Management

Production service-এর configuration লাগে environment variable, file, আর flag থেকে:

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

আপনি যখন নতুন code deploy করেন, পুরনো process মরার আগে চলমান request-গুলোর শেষ হওয়া উচিত:

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

**বাস্তব উদাহরণ**

Graceful shutdown হলো একটা রেস্তোরাঁর "last call"-এর মতো। রান্নাঘর নতুন অর্ডার নেওয়া বন্ধ করে (নতুন connection নেওয়া বন্ধ), কিন্তু যা অর্ডার হয়ে গেছে সেসব রান্না শেষ করে (in-flight request)। 30 মিনিট পরে (timeout) কেউ এখনো খেতে থাকলেও তারা বাতি নিভিয়ে দেয় (force close)।

</Callout>

## Health Check ও Readiness Probe

Kubernetes আর load balancer deployment-এর জন্য অপরিহার্য:

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

## pprof দিয়ে Profiling

Go-তে built-in profiling আছে। profiling endpoint expose করতে একটা import যোগ করুন:

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

**কখনো আপনার public port-এ pprof expose করবেন না।** এটা আপনার application-এর internal detail প্রকাশ করে দেয়। এটা একটা আলাদা port-এ (`:6060`) চালান যেটা শুধু internally, আপনার firewall-এর পেছনে accessible।

</Callout>

## Build ও Deploy করা

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

### Version Info সহ Build

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

একটা toy Go project থেকে একটা production service-কে যা আলাদা করে:

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

## মূল কথা

1. **structured logging-এর জন্য `slog` ব্যবহার করুন** — production-এ JSON, development-এ text
2. **environment variable থেকে config load করুন** — startup-এ validate করুন, fail fast
3. **Graceful shutdown বাধ্যতামূলক** — `signal.Notify` + `server.Shutdown(ctx)` + timeout
4. **Health check**: liveness (process কি alive?) আর readiness (এটা কি traffic serve করতে পারে?)
5. **আলাদা port-এ pprof** — production-এ CPU, memory, আর goroutine profile করুন
6. **Multi-stage Docker build** — final image শুধু binary নিয়ে ~10MB
7. **exponential backoff সহ connection retry** — database আর cache সবসময় সঙ্গে সঙ্গে ready থাকে না
8. **slice pre-allocate করুন, `sync.Pool` ব্যবহার করুন, hot path-এ `fmt.Sprintf` এড়ান** — ছোট optimization scale-এ জমে বড় হয়
