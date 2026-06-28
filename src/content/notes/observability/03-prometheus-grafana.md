---
title: 'Prometheus & Grafana'
subtitle: 'Instrumenting applications, writing PromQL, building dashboards, and alerting on what actually matters.'
chapter: 3
level: 'intermediate'
readingTime: '12 min'
topics: ['Prometheus', 'Grafana', 'PromQL', 'metrics', 'alerting', 'instrumentation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A factory's monitoring system: sensors on every machine (instrumentation) send readings to a control room (Prometheus). The control room displays trends on screens (Grafana dashboards) and triggers alarms when readings go out of range (alerting). The factory manager doesn't watch every sensor — they watch the dashboard and respond to alarms.

</Callout>

## Prometheus Data Model

Prometheus stores **time series** — sequences of (timestamp, value) pairs identified by a metric name and labels:

```
http_requests_total{method="POST", path="/orders", status="200"} 1827 @1705312200
http_requests_total{method="POST", path="/orders", status="500"} 23   @1705312200
http_request_duration_seconds{quantile="0.99"}                   0.847 @1705312200
```

**Metric types:**

- **Counter** — monotonically increasing (requests, errors, bytes). Never decreases except on restart.
- **Gauge** — current value (queue depth, active connections, memory). Can go up or down.
- **Histogram** — distribution of observations (request duration, response size). Includes buckets and sum/count.
- **Summary** — like histogram but calculates quantiles client-side (less flexible, use histogram instead).

## Instrumentation (Node.js)

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();

// Collect Node.js runtime metrics (memory, CPU, event loop lag)
collectDefaultMetrics({ register: registry });

// Custom metrics
export const httpRequestsTotal = new Counter({
	name: 'http_requests_total',
	help: 'Total HTTP requests',
	labelNames: ['method', 'path', 'status'],
	registers: [registry]
});

export const httpRequestDuration = new Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration',
	labelNames: ['method', 'path', 'status'],
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
	registers: [registry]
});

export const queueDepth = new Gauge({
	name: 'order_queue_depth',
	help: 'Current order processing queue depth',
	registers: [registry]
});

// Middleware
app.use((req, res, next) => {
	const end = httpRequestDuration.startTimer({
		method: req.method,
		path: req.route?.path ?? req.path // use route pattern, not full URL
	});

	res.on('finish', () => {
		const labels = {
			method: req.method,
			path: req.route?.path ?? req.path,
			status: String(res.statusCode)
		};
		httpRequestsTotal.inc(labels);
		end(labels);
	});
	next();
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
	res.set('Content-Type', registry.contentType);
	res.send(await registry.metrics());
});
```

**Label cardinality:** never use high-cardinality values as labels (user IDs, order IDs). Each unique label combination creates a new time series. 1M users × 5 paths × 3 methods = 15M time series → OOM.

```typescript
// BAD — high cardinality
httpRequestsTotal.inc({ userId: req.userId, ... });

// GOOD — low cardinality labels only
httpRequestsTotal.inc({ method: req.method, path: req.route.path, status: '200' });
```

## Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'order-service'
    static_configs:
      - targets: ['order-service:3000']
    metrics_path: /metrics
    scheme: http

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

For Kubernetes, use service discovery instead of static configs:

```yaml
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: 'true'
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        target_label: __address__
        regex: (.+)
        replacement: $1
```

## PromQL

```
# Request rate (per second over 5 minute window)
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Error percentage
rate(http_requests_total{status=~"5.."}[5m])
/
rate(http_requests_total[5m])
* 100

# P99 latency from histogram
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# P99 by path
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path)
)

# Throughput per service
sum(rate(http_requests_total[5m])) by (job)

# Queue depth growing faster than 10/sec
deriv(order_queue_depth[5m]) > 10

# Available memory (from default metrics)
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100
```

**Key PromQL functions:**

- `rate()` — per-second rate of increase of a counter over a window
- `irate()` — instant rate (last two data points) — more responsive, noisier
- `increase()` — total increase over a window (rate × window)
- `histogram_quantile()` — estimate quantile from histogram buckets
- `sum()`, `avg()`, `max()` — aggregation across label dimensions

## Grafana Dashboards

```bash
# docker-compose
services:
  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: secret
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
```

**Provision data sources and dashboards as code:**

```yaml
# grafana/provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true

# grafana/provisioning/dashboards/default.yml
apiVersion: 1
providers:
  - name: default
    folder: ''
    type: file
    options:
      path: /var/lib/grafana/dashboards
```

Dashboard JSON goes in `/var/lib/grafana/dashboards/` — committed to git, provisioned on startup.

**USE method panels for services:**

- Utilization (CPU, memory as % of limit)
- Saturation (queue depth, connection pool usage)
- Errors (error rate, 5xx rate)

**RED method panels for requests:**

- Rate (requests/sec)
- Errors (error rate)
- Duration (P50, P95, P99 latency)

## Alerting Rules

```yaml
# /etc/prometheus/rules/order-service.yml
groups:
  - name: order-service
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{job="order-service", status=~"5.."}[5m])
          /
          rate(http_requests_total{job="order-service"}[5m])
          > 0.05
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: 'High error rate on order-service'
          description: 'Error rate is {{ $value | humanizePercentage }} (threshold: 5%)'
          runbook: 'https://runbooks.internal/order-service/high-error-rate'

      # Latency SLO breach
      - alert: HighP99Latency
        expr: |
          histogram_quantile(0.99,
            rate(http_request_duration_seconds_bucket{job="order-service"}[5m])
          ) > 1.0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'P99 latency above 1s'

      # Queue backing up
      - alert: OrderQueueHigh
        expr: order_queue_depth > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Order queue depth is {{ $value }}'

      # Service down
      - alert: ServiceDown
        expr: up{job="order-service"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'order-service is down'
```

## Alertmanager

Routes alerts to the right channel:

```yaml
# alertmanager.yml
global:
  slack_api_url: 'https://hooks.slack.com/...'

route:
  group_by: ['alertname', 'job']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-warnings'

  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true # also send to slack
    - match:
        severity: critical
      receiver: 'slack-critical'

receivers:
  - name: 'slack-warnings'
    slack_configs:
      - channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'slack-critical'
    slack_configs:
      - channel: '#incidents'
        title: '🔴 CRITICAL: {{ .GroupLabels.alertname }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - routing_key: '<PAGERDUTY_KEY>'

inhibit_rules:
  # If service is down, suppress its other alerts
  - source_match:
      alertname: ServiceDown
    target_match_re:
      alertname: High.*
    equal: ['job']
```

## Recording Rules

Pre-compute expensive queries for dashboards:

```yaml
groups:
  - name: recording_rules
    interval: 1m
    rules:
      # Pre-compute error rate to avoid recomputing on every dashboard load
      - record: job:http_errors:rate5m
        expr: |
          rate(http_requests_total{status=~"5.."}[5m])
          /
          rate(http_requests_total[5m])

      # Pre-compute P99 latency
      - record: job:http_latency_p99:rate5m
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job)
          )
```

Dashboard queries then use `job:http_errors:rate5m` — instant, no computation at query time.
