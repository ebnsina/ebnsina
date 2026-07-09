---
title: '8 সপ্তাহের রোডম্যাপ: Fullstack → SRE'
subtitle: 'একজন কর্মরত fullstack engineer-কে junior-SRE-ready operator বানানোর জন্য দুই মাসের একটি সলিড প্ল্যান। প্রতিদিনের ব্রেকডাউন, রিয়েল ল্যাব, আর একটি ফাইনাল ক্যাপস্টোন।'
chapter: 0
level: 'beginner'
readingTime: '18 মিনিট'
topics: ['roadmap', 'learning', 'career', 'fullstack to SRE', 'hands-on']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## এই রোডম্যাপ ধরে নিচ্ছে যা তুমি আগে থেকেই জানো

তুমি একটা রিয়েল fullstack ব্যাকগ্রাউন্ড থেকে আসছ। নির্দিষ্টভাবে, তুমি পারো:

- একটা non-trivial web app end-to-end বানাতে (React/Vue/Svelte + Node/Python/Go backend)
- `SELECT *`-এর বাইরে গিয়ে SQL পড়তে ও লিখতে
- git প্রতিদিন ব্যবহার করতে — branches, rebases, merge conflicts
- লোকালি container চালাতে `docker run` আর `docker compose` দিয়ে
- একটা cloud provider-এ কিছু deploy করতে (Vercel, Render, Fly.io, বা raw EC2)
- ব্রাউজার devtools-এ HTTP traces পড়তে আর status codes বুঝতে

তোমার **যা জানার দরকার নেই**:

- Kubernetes internals
- PromQL বা কোনো monitoring DSL
- Terraform
- Queueing theory বা SLO math
- On-call practices
- Linux performance tuning

উপরের ধরে-নেওয়া লিস্টটা যদি অচেনা লাগে, আগে 2-3 সপ্তাহ fullstack fundamentals-এ দাও — সেগুলো ছাড়া SRE কনসেপ্টগুলো মাথায় গেঁথে যাবে না।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন web developer-এর SRE শেখা হচ্ছে একজন building architect-এর structural engineering শেখার মতো। রুমগুলো কীভাবে কানেক্ট হয় তুমি আগে থেকেই জানো; এখন শিখছ কেন load, আগুন, আর ভূমিকম্পের নিচেও বিল্ডিংটা দাঁড়িয়ে থাকে। নতুন mental model হচ্ছে "জিনিস ভেঙে গেলে কী হয়", "কীভাবে একটা feature যোগ করব" নয়।

</Callout>

## রোডম্যাপের গঠন

আট সপ্তাহ। প্রতি সপ্তাহের গঠন একই:

```
Mon-Tue   Theory + reading (1.5h/day)
Wed-Fri   Hands-on lab (2-3h/day)
Sat       Project work (4h)
Sun       Off (deliberately — sustained pace beats burnout)

Total: ~15-18h/week. Realistic alongside a full-time job.
```

তুমি পুরো 8 সপ্তাহ জুড়ে একটা সলিড প্রজেক্ট বানাবে: **full SRE practices সহ Kubernetes-এ চলা একটা production-grade observable Go service**। প্রতি সপ্তাহে একটা করে লেয়ার যোগ হবে।

## Week 0-তে যেসব tool install করবে

```bash
# Local dev
brew install kubectl helm k9s kind                # K8s
brew install prometheus grafana                   # observability locally
brew install go terraform k6                      # languages + IaC + load test
brew install jq yq                                # CLI essentials
brew install gh                                   # GitHub CLI

# Accounts (free tiers are enough for this roadmap)
- A GitHub account
- A free Grafana Cloud account (for hosted Prometheus + Loki)
- An on-call tool with a free tier — PagerDuty (single-user only since 2025), Grafana OnCall, Opsgenie, or self-hosted Alertmanager
- A small cloud account: Fly.io, DigitalOcean, or AWS Free Tier
```

Install যাচাই করো:

```bash
kubectl version --client    # >= 1.30 (1.28 went EOL in 2025)
helm version                # >= 3.14
go version                  # >= 1.22
terraform version           # >= 1.7
k6 version                  # >= 0.50
```

---

## Week 1 — The mental model

### লক্ষ্য

SRE-র worldview মাথায় ঢুকিয়ে ফেলা: SLI/SLO/error budget, চারটা golden signal, deploy-vs-reliability tradeoff।

### Reading (Mon-Tue)

- এই কোর্সের chapter 1, 2, 3 (তুমি এমনিতেও পড়ছ)
- Google SRE Book, ফ্রি অনলাইন: chapter 1, 2, 4 — _Introduction_, _Production Environment_, _Service Level Objectives_
- Charity Majors, "The Engineer/Manager Pendulum" ব্লগ পোস্ট (মাইন্ডসেট সেট করে দেয়)

### Lab (Wed-Fri)

**RED metrics সহ একটা Go HTTP service বানাও।**

```go
// main.go
package main

import (
	"net/http"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	requests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
	}, []string{"method", "path", "status"})

	duration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Buckets: []float64{.05, .1, .2, .3, .5, 1, 2.5, 5},
	}, []string{"method", "path"})
)

// + middleware + 3 endpoints: /healthz, /api/orders, /api/users
// + /metrics exposed for scraping
```

লোকালি Prometheus চালিয়ে ওটাকে scrape করাও। তিনটা প্যানেলসহ একটা Grafana dashboard বানাও: rate, errors, p99 duration।

### শনিবারের project work

Service-টা Fly.io-তে (বা তোমার পছন্দের cloud-এ) deploy করো। Grafana Cloud দিয়ে ওটাকে রিমোটলি scrape করাও।

### Deliverable

একটা লাইভ URL যেটা fake traffic serve করছে, সাথে একটা public Grafana dashboard যেটা তুমি শেয়ার করতে পারো। repo-টা GitHub-এ commit করো — প্রতি সপ্তাহে এটাই তুমি extend করবে।

### Success criteria

তুমি উত্তর দিতে পারো: "শেষ 5 মিনিটে /api/orders-এর p99 latency কত?" — শুধু তোমার dashboard দেখেই।

---

## Week 2 — Containers and Kubernetes basics

### লক্ষ্য

"Docker for dev" পেরিয়ে "Kubernetes for production"-এ যাওয়া। Pods, deployments, services, namespaces, kubectl muscle memory।

### Reading (Mon-Tue)

- _Kubernetes Up & Running_ (3rd ed) — chapter 1-7
- Kubernetes "concepts" docs: Pod, Deployment, Service, ConfigMap

### Lab (Wed-Fri)

**তোমার Week 1-এর service-টা Kubernetes-এ migrate করো।**

```bash
# Spin up local K8s
kind create cluster --name sre-lab

# Build + load image
docker build -t my-svc:0.1 .
kind load docker-image my-svc:0.1 --name sre-lab

# Deploy
kubectl apply -f k8s/
```

প্রথমবার manifests গুলো হাতে লিখো (এখনো Helm ব্যবহার করো না):

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-svc
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-svc
  template:
    metadata:
      labels:
        app: my-svc
    spec:
      containers:
        - name: app
          image: my-svc:0.1
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { cpu: 500m, memory: 512Mi }
```

### শনিবারের project work

একটা sidecar container যোগ করো যেটা একটা ছোট log shipper চালায়। Logs গুলো stdout-এ আনো, `kubectl logs` দিয়ে দেখো।

### Deliverable

3 replicas, health probes, resource limits আর structured logs সহ লোকাল kind cluster-এ চলা service।

### Success criteria

তুমি `kubectl rollout restart deployment/my-svc` করতে পারো আর তোমার Grafana dashboard-এ zero-downtime rolling restart দেখতে পারো।

---

## Week 3 — Observability: metrics, logs, traces

### লক্ষ্য

তিনটা pillar ঠিকমতো wire up করা। Production debugging-এর জন্য `console.log` ব্যবহার বন্ধ করা।

### Reading (Mon-Tue)

- এই কোর্স: chapter 3 (গভীরভাবে আবার পড়ো)
- _Observability Engineering_ (Charity Majors et al), chapter 1-4
- OpenTelemetry "concepts" docs

### Lab (Wed-Fri)

**Structured logging যোগ করো:**

```go
import "log/slog"

logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

logger.Info("order received",
    slog.String("order_id", id),
    slog.String("user_id", userID),
    slog.Int("item_count", len(items)),
)
```

**Distributed tracing যোগ করো:**

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
)

// Set up OTLP exporter to Grafana Cloud Tempo (free tier)
exp, _ := otlptracegrpc.New(ctx, otlptracegrpc.WithEndpoint("..."))
tp := trace.NewTracerProvider(trace.WithBatcher(exp))
otel.SetTracerProvider(tp)

// Instrument
tracer := otel.Tracer("my-svc")
ctx, span := tracer.Start(ctx, "createOrder")
defer span.End()
```

**Logs-এর জন্য Loki wire করো:**

Promtail বা Grafana Agent container logs গুলো Loki-তে পাঠায়। Grafana-তে LogQL দিয়ে দেখো।

### শনিবারের project work

একটা "diagnose this slow request" এক্সারসাইজ বানাও। একটা endpoint-এ random 200-500ms latency inject করো। কোন span slow সেটা খুঁজতে traces ব্যবহার করো। তারপর logs (trace_id দিয়ে filter করা) দিয়ে লাইনটা পিনপয়েন্ট করো।

### Deliverable

Single-pane Grafana view: dashboard panel → একটা slow request-এ ক্লিক → trace-এ drill → logs-এ drill।

### Success criteria

একটা trace ID দেওয়া হলে, তুমি 10 সেকেন্ডের কমে সংশ্লিষ্ট logs খুঁজে বের করতে পারো।

---

## Week 4 — SLOs and burn-rate alerting

### লক্ষ্য

তোমার service-এর জন্য একটা SLO define করো, burn-rate alerts implement করো, আর inject করা failure-এ সেগুলো fire করে সেটা প্রমাণ করো।

### Reading (Mon-Tue)

- এই কোর্স: chapter 2 (গভীরভাবে আবার পড়ো)
- Google SRE Workbook chapter 5: "Alerting on SLOs"
- `sloth` tool-এর docs (শুক্রবার এটা ব্যবহার করবে)

### Lab (Wed-Fri)

তোমার `/api/orders` endpoint-এর জন্য **একটা SLO বেছে নাও**:

```
SLI:  successful (non-5xx) requests / total requests
SLO:  99.5% over 30-day rolling window
```

(99.5% ইচ্ছাকৃতভাবে উদার — এটা তোমাকে testing-এর সময় আসলেই খরচ করার মতো একটা budget দেয়।)

প্রথমবার হাতে **Prometheus recording rules আর burn-rate alerts লিখো**:

```yaml
groups:
  - name: orders-slo
    rules:
      - record: sli:orders_availability:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{path="/api/orders",status!~"5.."}[5m]))
          /
          sum(rate(http_requests_total{path="/api/orders"}[5m]))

      # ... + 1h, 6h, 30d windows
      # ... + multi-window multi-burn-rate alerts
```

তারপর production-grade output দেখতে **`sloth` দিয়ে একই rules আবার generate করো**।

Alerts fire করাতে **failures inject করো**:

```bash
# Use a chaos script that returns 500 for 10% of requests for 10 min
curl -X POST http://your-svc/admin/chaos -d '{"errorRate": 0.1, "duration": "10m"}'
```

তোমার fast-burn alert 2-5 মিনিটের মধ্যে fire করা দেখো।

### শনিবারের project work

তোমার service-এর জন্য এক পাতার একটা **error budget policy** লিখো। budget 50%-এ কী হয়? 0%-এ? এমনভাবে ভাবো যেন তোমার একটা রিয়েল product team-এর সাথে negotiate করতে হচ্ছে।

### Deliverable

burn rate দেখানো একটা SLO dashboard, PagerDuty-তে wire করা alerts (free tier ব্যবহার করো), আর অন্তত একটা প্রমাণিত "chaos test-এর সময় alert fired" screenshot।

### Success criteria

একটা burn rate দেওয়া হলে, তুমি প্রেডিক্ট করতে পারো ঠিক কত দিনের error budget বাকি আছে।

---

## Week 5 — Incident response

### লক্ষ্য

page থেকে postmortem পর্যন্ত একটা রিয়েলিস্টিক incident চালানো। ICS roles মুখস্থ জানা।

### Reading (Mon-Tue)

- এই কোর্স: chapter 4 আর 5
- PagerDuty-র ফ্রি _Incident Response_ docs (এগুলো অসাধারণ)
- 3টা রিয়েল public postmortem: Cloudflare 2019-07-02, GitLab 2017-01-31, AWS S3 2017-02-28

### Lab (Wed-Fri)

**Drill 1: solo incident response.** একজন বন্ধুকে (বা একটা script-কে) দিয়ে তুমি অন্য কাজ করার সময় তোমার service-এ একটা failure inject করাও। তোমার ফোন (PagerDuty) তোমাকে page করে। প্র্যাকটিস করো:

1. 5 মিনিটের মধ্যে Acknowledge করা
2. একটা "incident channel" খোলা (একটা Discord/Slack/Notion doc)
3. IC playbook একা চালানো: severity declare করা, hypothesize করা, mitigate করা
4. চলতে চলতে একটা রিয়েল timeline লেখা

**Drill 2: paired roles.** একজন বন্ধুকে OL খেলতে বলো আর তুমি IC খেলো। একটা multi-cause failure inject করো (যেমন, DB latency spike + একটা আটকে যাওয়া deployment)। role-দের মধ্যে handoff প্র্যাকটিস করো।

### শনিবারের project work

Drill 2-এর incident-এর জন্য একটা **full postmortem** লিখো। chapter 5-এর template হুবহু ব্যবহার করো। তারিখসহ action items রাখো।

### Deliverable

এমন একটা postmortem doc যেটা public-ভাবে শেয়ার করতে তোমার লজ্জা লাগবে না।

### Success criteria

তোমার timeline-এ মিনিট পর্যন্ত timestamp আছে। তোমার action items sized, owned, dated। তোমার root cause statement সিস্টেমের নাম বলে, মানুষের নয়।

---

## Week 6 — Infrastructure as code

### লক্ষ্য

cloud console হাতে-edit করা বন্ধ করা। infrastructure-কে Terraform হিসেবে express করা; কোডের মতো review করা।

### Reading (Mon-Tue)

- HashiCorp-এর অফিসিয়াল Terraform tutorials (তোমার cloud অনুযায়ী AWS বা GCP track)
- _Terraform Up and Running_ (3rd ed), chapter 1-5

### Lab (Wed-Fri)

**তোমার Fly.io/manual deploy-কে Terraform দিয়ে replace করো।**

```hcl
# main.tf
terraform {
  required_providers {
    fly = { source = "fly-apps/fly", version = "~> 0.0.23" }
  }
  backend "s3" {
    bucket = "my-tfstate"
    key    = "sre-lab/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "fly_app" "svc" {
  name = "my-svc-${var.env}"
  org  = "personal"
}

resource "fly_machine" "svc" {
  count  = var.replica_count
  app    = fly_app.svc.name
  region = var.region
  image  = "registry.fly.io/${fly_app.svc.name}:${var.image_tag}"
  # ...
}
```

**একটা CI workflow যোগ করো যেটা প্রতি PR-এ `terraform plan` চালায়** আর main-এ merge হলে `terraform apply` চালায়।

**Service-টাকে module-ize করো।** একটা `modules/observable-service` বানাও যেটা deployment + dashboard + alerts একসাথে বান্ডল করে। এখন একটা নতুন service যোগ করা মানে 10-লাইনের একটা `module "x"` call।

### শনিবারের project work

একটা ছোট Terraform module লিখো যেটা একটা service name আর SLO target দিলে, SLO recording rules + burn-rate alerts-কে Kubernetes manifests হিসেবে generate করে। এটা chapter 7-এর "PRR baseline" pattern।

### Deliverable

তোমার service end-to-end deploy হচ্ছে `git push` → CI → terraform apply-এর মাধ্যমে। কোনো manual cloud-console ক্লিক নেই।

### Success criteria

একই code দিয়ে `terraform workspace new staging && terraform apply` চালিয়ে তুমি একটা হুবহু একই staging environment দাঁড় করাতে পারো।

---

## Week 7 — Capacity planning and load testing

### লক্ষ্য

তোমার service ভাঙার আগেই কোথায় ভাঙবে সেটা প্রেডিক্ট করা। CI-তে রিয়েল load tests ব্যবহার করা।

### Reading (Mon-Tue)

- এই কোর্স: chapter 6
- Brendan Gregg, _Systems Performance_ (2nd ed) — chapter 1, 2, 6 (CPU)
- Neil Gunther-এর USL paper বা summary ব্লগ পোস্ট

### Lab (Wed-Fri)

তোমার service-এর জন্য **একটা k6 load test লিখো**:

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
	stages: [
		{ duration: '2m', target: 50 },
		{ duration: '5m', target: 50 },
		{ duration: '2m', target: 200 },
		{ duration: '5m', target: 200 },
		{ duration: '2m', target: 0 }
	],
	thresholds: {
		http_req_duration: ['p(99)<300'],
		http_req_failed: ['rate<0.005']
	}
};

export default function () {
	const r = http.get('https://my-svc.fly.dev/api/orders');
	check(r, { 200: (r) => r.status === 200 });
}
```

cliff খুঁজতে **এটাকে একটা stress test হিসেবে চালাও**। SLO না ভাঙা পর্যন্ত concurrency বাড়াও। সংখ্যাটা টুকে রাখো — ওটাই তোমার _measured_ capacity।

বর্তমান traffic-এর 2x-এ কতগুলো replica লাগবে তা derive করতে **Little's Law apply করো**। আরেকটা load test দিয়ে verify করো।

### শনিবারের project work

k6-কে CI-তে wire করো — load test threshold ফেল করলে merge block করো।

### Deliverable

তোমার service-এর একটা capacity table, যাতে measured সংখ্যা, Little's Law-এর হিসাব, আর বর্তমান traffic-এর 1x/2x/5x-এর জন্য recommended replica count থাকবে।

### Success criteria

"পরের মাসে traffic 3x হলে প্রথমে কী ভাঙবে?" — তুমি একটা আন্দাজ নয়, একটা আসল সংখ্যা দিয়ে উত্তর দিতে পারো।

---

## Week 8 — Capstone: chaos + DR + the writeup

### লক্ষ্য

সবকিছু একসাথে করা। guardrails সহ একটা রিয়েল chaos experiment চালানো। একটা DR procedure test করা। পুরো 8 সপ্তাহ লিখে ফেলা।

### Reading (Mon-Tue)

- এই কোর্স: chapter 8, 9, 10
- _Chaos Engineering_ (Casey Rosenthal, Nora Jones) — relevant chapters
- 1-2টা chaos engineering case study (Netflix, LinkedIn)

### Lab (Wed-Fri)

**Day 1 — Chaos experiment.** তোমার kind cluster-এ (বা cloud-এ একটা সস্তা K8s-এ) Chaos Mesh ব্যবহার করো। full guardrails সহ একটা pod-kill experiment চালাও:

- ডকুমেন্টেড hypothesis
- Steady-state dashboard
- Kill-switch script
- Abort criteria

**Day 2 — DR drill.** একটা দ্বিতীয় region/cluster-এ একটা "DR" deployment provision করো। fail over প্র্যাকটিস করো: DNS flip, DB promotion (একটা script দিয়ে logical replica ব্যবহার করো), traffic verification। সময় মাপো। ঐ সংখ্যাটাই তোমার রিয়েল RTO।

**Day 3 — Toil audit.** 8 সপ্তাহ পেছনে তাকাও। একের বেশিবার হাতে করা প্রতিটা কাজ লিস্ট করো। প্রতিটা কীভাবে automate করবে তার প্ল্যান করো।

### শনিবারের project work — the writeup

8 সপ্তাহের সারসংক্ষেপ করে একটা public ব্লগ পোস্ট (বা detailed README) লিখো:

```markdown
# 8 weeks from fullstack to SRE — what I built and what I learned

## The project

A Go service running on Kubernetes with:

- Defined SLO + burn-rate alerts
- Full RED + USE observability
- Terraform-managed infra
- k6 load tests in CI
- Documented chaos experiments
- Tested DR runbook

## What surprised me

[your real surprises]

## What I'd do differently

[your honest critique]

## Resources that were worth the time

[your top 5]

## Resources that were not

[your top "skip these"]
```

### Deliverable

- GitHub-এ একটা কাজ-করা capstone project (যে কেউ clone করে full system দাঁড় করাতে পারে)
- একটা public writeup
- এরপর কী শিখবে তার একটা পরিষ্কার প্ল্যান

### Success criteria

তুমি একটা junior SRE role-এর জন্য interview দিতে পারো আর তুমি নিজে বানানো ও operate করা একটা রিয়েল production system নিয়ে বিশ্বাসযোগ্যভাবে কথা বলতে পারো।

---

## যা তুমি শেখোনি (সৎ হও)

আট সপ্তাহ তোমাকে **junior SRE candidate** বানানোর জন্য যথেষ্ট। senior SRE হওয়ার জন্য যথেষ্ট নয়। যেসব জিনিস তুমি এখনো গভীরভাবে ছুঁয়ে দেখোনি:

- Linux performance tuning (perf, eBPF, kernel-level flame graphs)
- Network engineering (BGP, anycast, CDN internals, packet captures)
- "connection pool কী"-এর বাইরে database internals
- Multi-tenant cluster security (network policies, OPA/Kyverno, scale-এ RBAC)
- Scale-এ cost optimization (FinOps)
- Service mesh deep-dive (Istio, Linkerd internals)
- Large-scale Kubernetes (1000+ nodes, scale-এ GitOps, cluster lifecycle)

ওগুলো ভরাট করতে একটা রিয়েল SRE role-এ আরও 6-12 মাসের on-the-job গভীরতার প্ল্যান করো।

<Callout type="tip">

**8-সপ্তাহের প্ল্যান কাজ করে যদি তুমি labs গুলো করো।** সিস্টেমটা না বানিয়ে SRE বই পড়লে তুমি vocabulary পাবে, skill নয়। দরকার হলে reading বাদ দাও, কিন্তু labs বাদ দিও না। hands-on ঘণ্টাগুলোতেই আসলে mental model তৈরি হয়।

</Callout>

## Pacing and rest

আট সপ্তাহ তখনই sustainable যখন তুমি বিশ্রামটা রক্ষা করো। যারা এটা করেছে তাদের রিয়েল recommendation:

- **সপ্তাহে একদিন পুরো ছুটি, কোনো ব্যতিক্রম নয়।** lab work-এর পরদিন compound হয়।
- **কোনো "catch-up weekend" নয়।** পিছিয়ে পড়লে schedule এক সপ্তাহ slip করো। double করো না।
- **সবকিছু time-box করো।** একটা 2-ঘণ্টার lab 5 ঘণ্টায় গড়ালে বুঝবে lab বা তোমার environment-এ কিছু ভুল আছে, তোমার effort-এ নয়।
- **কারো সাথে pair করো।** একই রোডম্যাপ করা একজন study partner হচ্ছে শেষ করার সবচেয়ে বড় predictor।

## Week 9-এ কী করবে

Week 8 শেষ করে আরও গভীরে যেতে চাইলে, সবচেয়ে high-leverage পরবর্তী পদক্ষেপ:

1. **কোথাও oncall জোগাড় করো।** একটা রিয়েল pager rotation এমন জিনিস শেখায় যা কোনো lab পারে না।
2. **একটা open-source SRE tool-এ contribute করো।** Prometheus, Thanos, OpenTelemetry, kube-prometheus-stack। ছোট docs PR-ও context তৈরি করে।
3. **প্রতিটা public postmortem পড়ো।** GitHub এগুলোতে ভরা। সপ্তাহে একটা করে পড়ার অভ্যাস করো।
4. **SRE role-এর জন্য apply করো।** GitHub-এ একটা capstone + একটা writeup একটা generic resume-কে বহু গুণে হারিয়ে দেয়।

## Stay current

এই রোডম্যাপটা 2026-এর জন্য curated। Tools দ্রুত বদলায়। লাইভ রেফারেন্সের জন্য:

- [Google SRE books](https://sre.google/books/) — ফ্রি, canonical curriculum
- [CNCF Landscape](https://landscape.cncf.io) — এখন production-এ আসলে কী আছে
- [Kubernetes docs](https://kubernetes.io/docs/) — version-tracked, সবসময় current
- [USENIX SREcon talks](https://www.usenix.org/conferences) — কর্মরত SRE-রা এই বছর কী করছে

## Key Takeaways

1. **আট সপ্তাহ, ~16h/week** — একটা job-এর পাশাপাশি sustainable
2. **সব সপ্তাহ জুড়ে একটা প্রজেক্ট** — এখানে depth beats breadth
3. **Labs-ই curriculum** — reading হচ্ছে supporting material
4. **একটা public artifact দিয়ে শেষ করো** — একটা রিয়েল system + একটা রিয়েল writeup-ই পরের role আনলক করে
5. **Week 9-এর পরের জন্য প্ল্যান করো** — আট সপ্তাহ তোমাকে junior পর্যন্ত নেয়; depth আসে রিয়েল production থেকে
