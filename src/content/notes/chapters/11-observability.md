---
title: "Observability & Service Mesh"
subtitle: "Implement distributed tracing with OpenTelemetry, Prometheus metrics, and structured logging with correlation IDs."
chapter: 11
level: "advanced"
readingTime: "20 min"
topics: ["OpenTelemetry", "Prometheus", "tracing", "metrics", "structured logging"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## The Three Pillars of Observability

You can't debug a distributed system by SSHing into servers and reading log files. You need three complementary signals:

- **Logs** — what happened (structured JSON with correlation IDs)
- **Metrics** — how much (request count, latency percentiles, error rates)
- **Traces** — how long and where (end-to-end request flow across services)

<Callout type="info">

**Real-World Analogy**

Like a hospital monitoring system — heart rate monitors track vitals (metrics), nurses log observations (logs), and patient charts trace the care journey (traces). An alarm fires when vitals drop.

</Callout>

<Diagram title="Observability Stack">
  <div class="diagram-row">
    <div class="box box-server">Service A</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Service B</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-db">Database</div>
  </div>
  <div class="arrow-down">v</div>
  <div class="diagram-row">
    <div class="box box-cache">Logs<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">ELK / Loki</span></div>
    <div class="box box-lb">Metrics<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Prometheus</span></div>
    <div class="box box-queue">Traces<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Jaeger / Tempo</span></div>
  </div>
</Diagram>

## Production Observability Setup

<CodeTabs tsFile="observability.ts" goFile="observability.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";

// --- Structured Logger ---
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  service: string;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  [key: string]: unknown;
}

class Logger {
  constructor(private service: string) {}

  private log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    const entry: LogEntry = {
      level,
      msg,
      timestamp: new Date().toISOString(),
      service: this.service,
      ...fields,
    };
    // In production: write to stdout, collected by Fluentd/Vector
    console.log(JSON.stringify(entry));
  }

  debug(msg: string, fields?: Record<string, unknown>) { this.log("debug", msg, fields); }
  info(msg: string, fields?: Record<string, unknown>) { this.log("info", msg, fields); }
  warn(msg: string, fields?: Record<string, unknown>) { this.log("warn", msg, fields); }
  error(msg: string, fields?: Record<string, unknown>) { this.log("error", msg, fields); }

  // Create child logger with additional context
  child(fields: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, fields);
  }
}

class ChildLogger {
  constructor(private parent: Logger, private fields: Record<string, unknown>) {}
  info(msg: string, extra?: Record<string, unknown>) {
    this.parent.info(msg, { ...this.fields, ...extra });
  }
  error(msg: string, extra?: Record<string, unknown>) {
    this.parent.error(msg, { ...this.fields, ...extra });
  }
  warn(msg: string, extra?: Record<string, unknown>) {
    this.parent.warn(msg, { ...this.fields, ...extra });
  }
}

// --- Metrics (Prometheus-compatible) ---
class Counter {
  private values = new Map<string, number>();

  constructor(private name: string, private help: string) {}

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = this.labelKey(labels);
    this.values.set(key, (this.values.get(key) || 0) + value);
  }

  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(",");
  }

  serialize(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
    for (const [labels, value] of this.values) {
      const labelStr = labels ? `{${labels}}` : "";
      out += `${this.name}${labelStr} ${value}\n`;
    }
    return out;
  }
}

class Histogram {
  private observations = new Map<string, number[]>();
  private buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

  constructor(private name: string, private help: string) {}

  observe(labels: Record<string, string>, value: number): void {
    const key = this.labelKey(labels);
    const obs = this.observations.get(key) || [];
    obs.push(value);
    this.observations.set(key, obs);
  }

  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(",");
  }

  serialize(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
    for (const [labels, values] of this.observations) {
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);

      for (const bucket of this.buckets) {
        const count = sorted.filter((v) => v <= bucket).length;
        const labelStr = labels ? `${labels},` : "";
        out += `${this.name}_bucket{${labelStr}le="${bucket}"} ${count}\n`;
      }
      const labelStr = labels ? `${labels},` : "";
      out += `${this.name}_bucket{${labelStr}le="+Inf"} ${values.length}\n`;
      out += `${this.name}_sum{${labels}} ${sum}\n`;
      out += `${this.name}_count{${labels}} ${values.length}\n`;
    }
    return out;
  }
}

// --- Distributed Tracing ---
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration?: number;
  status: "ok" | "error";
  attributes: Record<string, string | number>;
  events: { name: string; timestamp: number; attributes?: Record<string, string> }[];
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

class Tracer {
  private spans: Span[] = [];

  constructor(private serviceName: string) {}

  startSpan(name: string, parentSpan?: Span): Span {
    const span: Span = {
      traceId: parentSpan?.traceId || generateId() + generateId(),
      spanId: generateId(),
      parentSpanId: parentSpan?.spanId,
      operationName: name,
      serviceName: this.serviceName,
      startTime: performance.now(),
      status: "ok",
      attributes: {},
      events: [],
    };
    return span;
  }

  endSpan(span: Span): void {
    span.duration = performance.now() - span.startTime;
    this.spans.push(span);

    // In production: export to Jaeger/Tempo via OTLP
    console.log(JSON.stringify({
      type: "span",
      traceId: span.traceId,
      spanId: span.spanId,
      parent: span.parentSpanId,
      operation: span.operationName,
      duration_ms: span.duration.toFixed(2),
      status: span.status,
      attributes: span.attributes,
    }));
  }
}

// --- Metrics Registry ---
const httpRequestsTotal = new Counter(
  "http_requests_total",
  "Total number of HTTP requests"
);

const httpRequestDuration = new Histogram(
  "http_request_duration_seconds",
  "HTTP request duration in seconds"
);

const httpRequestsInFlight = { value: 0 };

// --- Middleware ---
const logger = new Logger("api-gateway");
const tracer = new Tracer("api-gateway");

function metricsEndpoint(_req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(httpRequestsTotal.serialize() + httpRequestDuration.serialize());
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // Extract or create trace context
  const incomingTraceId = req.headers["x-trace-id"] as string | undefined;
  const requestId = req.headers["x-request-id"] as string || crypto.randomUUID();

  const span = tracer.startSpan(`${req.method} ${req.url}`);
  if (incomingTraceId) {
    (span as any).traceId = incomingTraceId;
  }

  span.attributes["http.method"] = req.method || "GET";
  span.attributes["http.url"] = req.url || "/";
  span.attributes["http.request_id"] = requestId;

  const reqLogger = logger.child({
    traceId: span.traceId,
    spanId: span.spanId,
    requestId,
    method: req.method,
    path: req.url,
  });

  const startTime = performance.now();
  httpRequestsInFlight.value++;

  reqLogger.info("request_started");

  try {
    // Simulate downstream service call
    const dbSpan = tracer.startSpan("db.query", span);
    dbSpan.attributes["db.system"] = "postgresql";
    dbSpan.attributes["db.statement"] = "SELECT * FROM users WHERE id = $1";
    await new Promise((r) => setTimeout(r, Math.random() * 50));
    tracer.endSpan(dbSpan);

    // Response
    const statusCode = 200;
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "X-Trace-Id": span.traceId,
      "X-Request-Id": requestId,
    });
    res.end(JSON.stringify({ status: "ok", traceId: span.traceId }));

    span.attributes["http.status_code"] = statusCode;
    span.status = "ok";

    const duration = (performance.now() - startTime) / 1000;
    httpRequestsTotal.inc({ method: req.method || "GET", status: String(statusCode), path: req.url || "/" });
    httpRequestDuration.observe({ method: req.method || "GET", path: req.url || "/" }, duration);

    reqLogger.info("request_completed", { statusCode, duration_ms: (duration * 1000).toFixed(2) });
  } catch (err) {
    span.status = "error";
    span.events.push({ name: "exception", timestamp: performance.now() });

    const statusCode = 500;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal error" }));

    httpRequestsTotal.inc({ method: req.method || "GET", status: "500", path: req.url || "/" });
    reqLogger.error("request_failed", { error: String(err) });
  } finally {
    httpRequestsInFlight.value--;
    tracer.endSpan(span);
  }
}

// --- Server ---
const server = http.createServer((req, res) => {
  if (req.url === "/metrics") return metricsEndpoint(req, res);
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  handleRequest(req, res);
});

server.listen(3000, () => logger.info("server_started", { port: 3000 }));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// --- Structured Logger ---
type Logger struct {
	service string
}

type LogEntry struct {
	Level     string                 `json:"level"`
	Msg       string                 `json:"msg"`
	Timestamp string                 `json:"timestamp"`
	Service   string                 `json:"service"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

func NewLogger(service string) *Logger {
	return &Logger{service: service}
}

func (l *Logger) log(level, msg string, fields map[string]interface{}) {
	entry := LogEntry{
		Level:     level,
		Msg:       msg,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Service:   l.service,
		Fields:    fields,
	}
	data, _ := json.Marshal(entry)
	fmt.Fprintln(os.Stdout, string(data))
}

func (l *Logger) Info(msg string, fields map[string]interface{})  { l.log("info", msg, fields) }
func (l *Logger) Error(msg string, fields map[string]interface{}) { l.log("error", msg, fields) }
func (l *Logger) Warn(msg string, fields map[string]interface{})  { l.log("warn", msg, fields) }

func (l *Logger) With(fields map[string]interface{}) *ContextLogger {
	return &ContextLogger{parent: l, fields: fields}
}

type ContextLogger struct {
	parent *Logger
	fields map[string]interface{}
}

func (cl *ContextLogger) Info(msg string, extra map[string]interface{}) {
	merged := make(map[string]interface{})
	for k, v := range cl.fields {
		merged[k] = v
	}
	for k, v := range extra {
		merged[k] = v
	}
	cl.parent.Info(msg, merged)
}

func (cl *ContextLogger) Error(msg string, extra map[string]interface{}) {
	merged := make(map[string]interface{})
	for k, v := range cl.fields {
		merged[k] = v
	}
	for k, v := range extra {
		merged[k] = v
	}
	cl.parent.Error(msg, merged)
}

// --- Metrics ---
type Counter struct {
	name   string
	help   string
	mu     sync.Mutex
	values map[string]int64
}

func NewCounter(name, help string) *Counter {
	return &Counter{name: name, help: help, values: make(map[string]int64)}
}

func (c *Counter) Inc(labels map[string]string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	key := labelKey(labels)
	c.values[key]++
}

func (c *Counter) Serialize() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	var sb strings.Builder
	fmt.Fprintf(&sb, "# HELP %s %s\n# TYPE %s counter\n", c.name, c.help, c.name)
	for labels, value := range c.values {
		labelStr := ""
		if labels != "" {
			labelStr = "{" + labels + "}"
		}
		fmt.Fprintf(&sb, "%s%s %d\n", c.name, labelStr, value)
	}
	return sb.String()
}

type Histogram struct {
	name         string
	help         string
	mu           sync.Mutex
	observations map[string][]float64
	buckets      []float64
}

func NewHistogram(name, help string) *Histogram {
	return &Histogram{
		name: name, help: help,
		observations: make(map[string][]float64),
		buckets:      []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
	}
}

func (h *Histogram) Observe(labels map[string]string, value float64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	key := labelKey(labels)
	h.observations[key] = append(h.observations[key], value)
}

func (h *Histogram) Serialize() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	var sb strings.Builder
	fmt.Fprintf(&sb, "# HELP %s %s\n# TYPE %s histogram\n", h.name, h.help, h.name)
	for labels, values := range h.observations {
		sorted := make([]float64, len(values))
		copy(sorted, values)
		sort.Float64s(sorted)

		var sum float64
		for _, v := range values {
			sum += v
		}

		for _, bucket := range h.buckets {
			count := 0
			for _, v := range sorted {
				if v <= bucket {
					count++
				}
			}
			fmt.Fprintf(&sb, "%s_bucket{%sle=\"%g\"} %d\n", h.name, labels+",", bucket, count)
		}
		fmt.Fprintf(&sb, "%s_bucket{%sle=\"+Inf\"} %d\n", h.name, labels+",", len(values))
		fmt.Fprintf(&sb, "%s_sum{%s} %g\n", h.name, labels, sum)
		fmt.Fprintf(&sb, "%s_count{%s} %d\n", h.name, labels, len(values))
	}
	return sb.String()
}

func labelKey(labels map[string]string) string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf(`%s="%s"`, k, labels[k]))
	}
	return strings.Join(parts, ",")
}

// --- Tracing ---
type Span struct {
	TraceID       string            `json:"traceId"`
	SpanID        string            `json:"spanId"`
	ParentSpanID  string            `json:"parentSpanId,omitempty"`
	OperationName string            `json:"operationName"`
	ServiceName   string            `json:"serviceName"`
	StartTime     time.Time         `json:"startTime"`
	Duration      time.Duration     `json:"duration,omitempty"`
	Status        string            `json:"status"`
	Attributes    map[string]string `json:"attributes"`
}

type Tracer struct {
	serviceName string
}

func NewTracer(service string) *Tracer {
	return &Tracer{serviceName: service}
}

func (t *Tracer) StartSpan(name string, parent *Span) *Span {
	traceID := uuid.New().String()[:16] + uuid.New().String()[:16]
	if parent != nil {
		traceID = parent.TraceID
	}
	parentID := ""
	if parent != nil {
		parentID = parent.SpanID
	}
	return &Span{
		TraceID: traceID, SpanID: uuid.New().String()[:16],
		ParentSpanID: parentID, OperationName: name,
		ServiceName: t.serviceName, StartTime: time.Now(),
		Status: "ok", Attributes: make(map[string]string),
	}
}

func (t *Tracer) EndSpan(span *Span) {
	span.Duration = time.Since(span.StartTime)
	data, _ := json.Marshal(map[string]interface{}{
		"type": "span", "traceId": span.TraceID, "spanId": span.SpanID,
		"operation": span.OperationName, "duration_ms": span.Duration.Milliseconds(),
		"status": span.Status, "attributes": span.Attributes,
	})
	fmt.Fprintln(os.Stdout, string(data))
}

// --- Middleware ---
var (
	logger               = NewLogger("api-gateway")
	tracer               = NewTracer("api-gateway")
	httpRequestsTotal    = NewCounter("http_requests_total", "Total HTTP requests")
	httpRequestDuration  = NewHistogram("http_request_duration_seconds", "Request duration")
	httpRequestsInFlight atomic.Int64
)

type contextKey string

func observabilityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-Id")
		if requestID == "" {
			requestID = uuid.New().String()
		}

		span := tracer.StartSpan(fmt.Sprintf("%s %s", r.Method, r.URL.Path), nil)
		if traceID := r.Header.Get("X-Trace-Id"); traceID != "" {
			span.TraceID = traceID
		}

		span.Attributes["http.method"] = r.Method
		span.Attributes["http.url"] = r.URL.Path

		reqLogger := logger.With(map[string]interface{}{
			"traceId": span.TraceID, "spanId": span.SpanID,
			"requestId": requestID, "method": r.Method, "path": r.URL.Path,
		})

		start := time.Now()
		httpRequestsInFlight.Add(1)
		reqLogger.Info("request_started", nil)

		// Wrap response writer to capture status code
		rw := &responseWriter{ResponseWriter: w, statusCode: 200}

		ctx := context.WithValue(r.Context(), contextKey("span"), span)
		ctx = context.WithValue(ctx, contextKey("requestId"), requestID)

		w.Header().Set("X-Trace-Id", span.TraceID)
		w.Header().Set("X-Request-Id", requestID)

		next.ServeHTTP(rw, r.WithContext(ctx))

		duration := time.Since(start).Seconds()
		httpRequestsInFlight.Add(-1)

		status := fmt.Sprintf("%d", rw.statusCode)
		httpRequestsTotal.Inc(map[string]string{"method": r.Method, "status": status, "path": r.URL.Path})
		httpRequestDuration.Observe(map[string]string{"method": r.Method, "path": r.URL.Path}, duration)

		span.Attributes["http.status_code"] = status
		if rw.statusCode >= 500 {
			span.Status = "error"
		}
		tracer.EndSpan(span)

		reqLogger.Info("request_completed", map[string]interface{}{
			"statusCode": rw.statusCode, "duration_ms": duration * 1000,
		})
	})
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, httpRequestsTotal.Serialize()+httpRequestDuration.Serialize())
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
		// Simulate DB query with child span
		parentSpan := r.Context().Value(contextKey("span")).(*Span)
		dbSpan := tracer.StartSpan("db.query", parentSpan)
		dbSpan.Attributes["db.system"] = "postgresql"
		time.Sleep(time.Duration(rand.Intn(50)) * time.Millisecond)
		tracer.EndSpan(dbSpan)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	handler := observabilityMiddleware(mux)

	log.Println("Server with observability on :3000")
	log.Fatal(http.ListenAndServe(":3000", handler))
}
```

</div>
</CodeTabs>

<div class="takeaways">

### Key Takeaways

- Always use **structured JSON logging** — grep-friendly text logs don't scale
- **Correlation IDs** (trace ID, request ID) let you follow a request across all services
- Expose a `/metrics` endpoint in Prometheus format — it's the industry standard
- Create **child spans** for downstream calls (DB queries, HTTP calls) to see where time is spent
- **Fail open** on observability — if tracing/metrics fail, don't block the request

</div>

<div class="when-to-use">

### Real-World Usage

- **Uber** built Jaeger (now CNCF) for distributed tracing across 4,000+ microservices
- **Netflix** uses distributed tracing to debug latency across their service mesh
- **Datadog, Grafana, New Relic** all consume OpenTelemetry data — instrumenting with OTEL keeps you vendor-neutral
- Add observability from day one. Retrofitting tracing into an existing system is 10x harder.

</div>

