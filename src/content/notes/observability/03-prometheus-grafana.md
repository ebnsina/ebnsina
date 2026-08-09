---
title: 'Prometheus & Grafana'
subtitle: 'Application instrument করা, PromQL লেখা, dashboard বানানো, আর যা সত্যিই গুরুত্বপূর্ণ তার উপর alert করা।'
chapter: 3
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['Prometheus', 'Grafana', 'PromQL', 'metrics', 'alerting', 'instrumentation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা কারখানার monitoring সিস্টেম: প্রতিটা মেশিনের সেন্সর (instrumentation) একটা কন্ট্রোল রুমে (Prometheus) রিডিং পাঠায়। কন্ট্রোল রুম স্ক্রিনে trend দেখায় (Grafana dashboard) আর রিডিং সীমার বাইরে গেলে অ্যালার্ম বাজায় (alerting)। কারখানার ম্যানেজার প্রতিটা সেন্সর দেখেন না — তিনি dashboard দেখেন আর অ্যালার্মে সাড়া দেন।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি একটা বিদ্যুৎ কোম্পানি চালান। শহরের প্রতিটা বাড়িতে একটা করে মিটার বসানো, আর ইবনে সিনা হলেন তাঁর মিটার-রিডার। ইবনে সিনার কাজ বাঁধা — প্রতি পনেরো মিনিট অন্তর সে একই রাউন্ডে হাঁটে, একটা একটা করে বাড়ির মিটারে গিয়ে সংখ্যাটা দেখে, আর সময়সহ সেই রিডিং একটা মোটা খাতায় টুকে রাখে। খেয়াল করুন — বাড়িগুলো ইবনে সিনার কাছে রিডিং পাঠায় না, ইবনে সিনা নিজেই গিয়ে প্রতিটা মিটার থেকে সংখ্যা টেনে আনে। খাতায় তাই এক-একটা বাড়ির জন্য সময়ে-সময়ে নেওয়া রিডিংয়ের একটা লম্বা সারি জমতে থাকে — সকাল ৯টায় এত, সোয়া ৯টায় এত, সাড়ে ৯টায় এত।

এই খাতাটা কিন্তু নিজে থেকে কিছু বোঝায় না — শুধু সংখ্যা আর সময়ের স্তূপ। তাই কোম্পানিতে আল-খোয়ারিজমি নামে একজন ড্রাফটসম্যান আছেন। তিনি খাতা খুলে বসেন, আর ওই সময়ধরে-জমা রিডিংগুলো থেকে দেয়ালে টাঙানোর জন্য বড় বড় চার্ট আঁকেন — কোন এলাকায় সারা মাসে ব্যবহার কেমন উঠল-নামল, কোথায় হঠাৎ খরচ বেড়ে গেল। ম্যানেজার প্রতিটা মিটার নিজে দেখেন না; তিনি শুধু আল-খোয়ারিজমির চার্টের দিকে তাকান।

এই গল্পটাই আসলে **Prometheus** আর **Grafana**। ইবনে সিনার বাঁধা রাউন্ডে গিয়ে প্রতিটা মিটার থেকে সংখ্যা টেনে আনাটাই Prometheus-এর **scrape** — নির্দিষ্ট সময় পরপর সে নিজে প্রতিটা service থেকে **metrics** টেনে আনে (এটাই **pull** model, service নিজে ঠেলে পাঠায় না)। সময়সহ রিডিং জমা মোটা খাতাটাই হলো Prometheus-এর **time-series** store, আর আল-খোয়ারিজমির খাতা থেকে আঁকা দেয়াল-চার্টগুলোই হলো **Grafana dashboard** — যা ওই time-series store-কে query করে গ্রাফ এঁকে দেখায়। বাস্তবে ঠিক এভাবেই প্রতিটা service একটা `/metrics` endpoint খুলে রাখে, Prometheus নির্দিষ্ট interval-এ সেখান থেকে scrape করে জমা রাখে, আর Grafana সেই ডেটা query করে টিমের দেয়ালের বড় স্ক্রিনে dashboard আঁকে।

## Prometheus Data Model

Prometheus **time series** store করে — (timestamp, value) জোড়ার ধারাবাহিকতা যা একটা metric name আর labels দিয়ে চিহ্নিত:

```
http_requests_total{method="POST", path="/orders", status="200"} 1827 @1705312200
http_requests_total{method="POST", path="/orders", status="500"} 23   @1705312200
http_request_duration_seconds{quantile="0.99"}                   0.847 @1705312200
```

**Metric types:**

- **Counter** — একদিকে বাড়ে (requests, errors, bytes)। restart ছাড়া কখনো কমে না।
- **Gauge** — বর্তমান value (queue depth, active connections, memory)। উপরে-নিচে দুই দিকেই যেতে পারে।
- **Histogram** — observation-এর distribution (request duration, response size)। bucket আর sum/count অন্তর্ভুক্ত।
- **Summary** — histogram-এর মতো কিন্তু quantile client-side-এ হিসাব করে (কম নমনীয়, বদলে histogram ব্যবহার করুন)।

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

**Label cardinality:** কখনো high-cardinality value কে label হিসেবে ব্যবহার করবেন না (user ID, order ID)। প্রতিটা unique label combination একটা নতুন time series তৈরি করে। 1M users × 5 paths × 3 methods = 15M time series → OOM।

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

Kubernetes-এর জন্য static config-এর বদলে service discovery ব্যবহার করুন:

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

**গুরুত্বপূর্ণ PromQL function:**

- `rate()` — একটা window জুড়ে counter-এর প্রতি-সেকেন্ড বৃদ্ধির হার
- `irate()` — instant rate (শেষ দুটো data point) — বেশি responsive, বেশি noisy
- `increase()` — একটা window জুড়ে মোট বৃদ্ধি (rate × window)
- `histogram_quantile()` — histogram bucket থেকে quantile আনুমানিক হিসাব করে
- `sum()`, `avg()`, `max()` — label dimension জুড়ে aggregation

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

**Data source আর dashboard কোড হিসেবে provision করুন:**

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

Dashboard JSON যায় `/var/lib/grafana/dashboards/`-এ — git-এ commit করা, startup-এ provision করা।

**Service-এর জন্য USE method panel:**

- Utilization (CPU, memory — limit-এর % হিসেবে)
- Saturation (queue depth, connection pool usage)
- Errors (error rate, 5xx rate)

**Request-এর জন্য RED method panel:**

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

Alert গুলোকে সঠিক channel-এ route করে:

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

Dashboard-এর জন্য ব্যয়বহুল query আগেভাগে হিসাব করে রাখুন:

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

Dashboard query তখন `job:http_errors:rate5m` ব্যবহার করে — সাথে সাথে, query-র সময় কোনো হিসাব নেই।
