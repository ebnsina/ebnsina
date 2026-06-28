---
title: '8-Week Roadmap: Fullstack → SRE'
subtitle: 'A solid two-month plan to convert a working fullstack engineer into a junior-SRE-ready operator. Daily breakdown, real labs, and a final capstone.'
chapter: 0
level: 'beginner'
readingTime: '18 min'
topics: ['roadmap', 'learning', 'career', 'fullstack to SRE', 'hands-on']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What this roadmap assumes you already know

You are coming from a real fullstack background. Specifically, you can:

- Build a non-trivial web app end-to-end (React/Vue/Svelte + Node/Python/Go backend)
- Read and write SQL beyond `SELECT *`
- Use git daily — branches, rebases, merge conflicts
- Run containers locally with `docker run` and `docker compose`
- Deploy something to a cloud provider (Vercel, Render, Fly.io, or raw EC2)
- Read HTTP traces in browser devtools and understand status codes

You do **not** need to know:

- Kubernetes internals
- PromQL or any monitoring DSL
- Terraform
- Queueing theory or SLO math
- On-call practices
- Linux performance tuning

If the assumed list looks unfamiliar, spend 2-3 weeks on fullstack fundamentals first — the SRE concepts will not stick without them.

<Callout type="info">

**Real-World Analogy**

A web developer learning SRE is like a building architect learning structural engineering. You already know how rooms connect; now you learn why the building stays up under load, fire, and earthquakes. The new mental model is "what happens when things break," not "how do I add a feature."

</Callout>

## The roadmap shape

Eight weeks. Every week has the same shape:

```
Mon-Tue   Theory + reading (1.5h/day)
Wed-Fri   Hands-on lab (2-3h/day)
Sat       Project work (4h)
Sun       Off (deliberately — sustained pace beats burnout)

Total: ~15-18h/week. Realistic alongside a full-time job.
```

You will build one substantial project across all 8 weeks: a **production-grade observable Go service running on Kubernetes with full SRE practices**. Each week adds one layer.

## Tools you will install in Week 0

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

Verify install:

```bash
kubectl version --client    # >= 1.30 (1.28 went EOL in 2025)
helm version                # >= 3.14
go version                  # >= 1.22
terraform version           # >= 1.7
k6 version                  # >= 0.50
```

---

## Week 1 — The mental model

### Goals

Internalize the SRE worldview: SLI/SLO/error budget, the four golden signals, the deploy-vs-reliability tradeoff.

### Reading (Mon-Tue)

- Chapters 1, 2, 3 of this course (you are reading them anyway)
- Google SRE Book, free online: chapters 1, 2, 4 — _Introduction_, _Production Environment_, _Service Level Objectives_
- Charity Majors, "The Engineer/Manager Pendulum" blog post (sets the mindset)

### Lab (Wed-Fri)

**Build a Go HTTP service with RED metrics.**

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

Spin up Prometheus locally to scrape it. Build a Grafana dashboard with three panels: rate, errors, p99 duration.

### Saturday project work

Deploy the service to Fly.io (or your cloud of choice). Wire Grafana Cloud to scrape it remotely.

### Deliverable

A live URL serving fake traffic, with a public Grafana dashboard you can share. Commit the repo to GitHub — you will extend it every week.

### Success criteria

You can answer: "What is the p99 latency of /api/orders over the last 5 minutes?" by looking only at your dashboard.

---

## Week 2 — Containers and Kubernetes basics

### Goals

Get past "Docker for dev" into "Kubernetes for production." Pods, deployments, services, namespaces, kubectl muscle memory.

### Reading (Mon-Tue)

- _Kubernetes Up & Running_ (3rd ed) — chapters 1-7
- The Kubernetes "concepts" docs: Pod, Deployment, Service, ConfigMap

### Lab (Wed-Fri)

**Migrate your Week 1 service to Kubernetes.**

```bash
# Spin up local K8s
kind create cluster --name sre-lab

# Build + load image
docker build -t my-svc:0.1 .
kind load docker-image my-svc:0.1 --name sre-lab

# Deploy
kubectl apply -f k8s/
```

Write the manifests by hand the first time (don't use Helm yet):

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

### Saturday project work

Add a sidecar container that runs a small log shipper. Get logs into stdout, view with `kubectl logs`.

### Deliverable

Service running on local kind cluster with 3 replicas, health probes, resource limits, structured logs.

### Success criteria

You can `kubectl rollout restart deployment/my-svc` and watch zero-downtime rolling restarts in your Grafana dashboard.

---

## Week 3 — Observability: metrics, logs, traces

### Goals

Wire up the three pillars properly. Stop using `console.log` for production debugging.

### Reading (Mon-Tue)

- This course: chapter 3 (re-read deeply)
- _Observability Engineering_ (Charity Majors et al), chapters 1-4
- OpenTelemetry "concepts" docs

### Lab (Wed-Fri)

**Add structured logging:**

```go
import "log/slog"

logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

logger.Info("order received",
    slog.String("order_id", id),
    slog.String("user_id", userID),
    slog.Int("item_count", len(items)),
)
```

**Add distributed tracing:**

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

**Wire Loki for logs:**

Promtail or Grafana Agent ships container logs to Loki. View in Grafana with LogQL.

### Saturday project work

Build a "diagnose this slow request" exercise. Inject random 200-500ms latency into one endpoint. Use traces to find which span is slow. Then use logs (filtered by trace_id) to pinpoint the line.

### Deliverable

Single-pane Grafana view: dashboard panel → click a slow request → drill into trace → drill into logs.

### Success criteria

Given a trace ID, you can find the corresponding logs in under 10 seconds.

---

## Week 4 — SLOs and burn-rate alerting

### Goals

Define an SLO for your service, implement burn-rate alerts, and prove they fire on injected failures.

### Reading (Mon-Tue)

- This course: chapter 2 (deep re-read)
- Google SRE Workbook chapter 5: "Alerting on SLOs"
- The `sloth` tool docs (you will use it on Friday)

### Lab (Wed-Fri)

**Pick an SLO** for your `/api/orders` endpoint:

```
SLI:  successful (non-5xx) requests / total requests
SLO:  99.5% over 30-day rolling window
```

(99.5% is generous on purpose — it gives you a budget to actually consume during testing.)

**Write Prometheus recording rules and burn-rate alerts** by hand the first time:

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

Then **regenerate the same rules using `sloth`** to see the production-grade output.

**Inject failures** to fire the alerts:

```bash
# Use a chaos script that returns 500 for 10% of requests for 10 min
curl -X POST http://your-svc/admin/chaos -d '{"errorRate": 0.1, "duration": "10m"}'
```

Watch your fast-burn alert fire in 2-5 minutes.

### Saturday project work

Write a one-page **error budget policy** for your service. What happens at 50% budget? At 0%? Treat it as if you had a real product team to negotiate with.

### Deliverable

SLO dashboard showing burn rate, alerts wired to PagerDuty (use the free tier), at least one demonstrated "alert fired during chaos test" screenshot.

### Success criteria

You can predict, given a burn rate, exactly how many days of error budget remain.

---

## Week 5 — Incident response

### Goals

Run a realistic incident from page to postmortem. Know the ICS roles by heart.

### Reading (Mon-Tue)

- This course: chapters 4 and 5
- Pagerduty's free _Incident Response_ docs (they are exceptional)
- 3 real public postmortems: Cloudflare 2019-07-02, GitLab 2017-01-31, AWS S3 2017-02-28

### Lab (Wed-Fri)

**Drill 1: solo incident response.** Have a friend (or a script) inject a failure into your service while you are doing other work. Your phone (PagerDuty) pages you. Practice:

1. Acknowledge within 5 minutes
2. Open an "incident channel" (a Discord/Slack/Notion doc)
3. Run the IC playbook solo: declare severity, hypothesize, mitigate
4. Write a real timeline as you go

**Drill 2: paired roles.** Get a friend to play OL while you play IC. Inject a multi-cause failure (e.g., DB latency spike + a stuck deployment). Practice the handoff between roles.

### Saturday project work

Write a **full postmortem** for the Drill 2 incident. Use the template from chapter 5 verbatim. Include action items with dates.

### Deliverable

A postmortem doc you would not be embarrassed to share publicly.

### Success criteria

Your timeline has timestamps to the minute. Your action items are sized, owned, dated. Your root cause statement names the system, not the person.

---

## Week 6 — Infrastructure as code

### Goals

Stop hand-editing cloud consoles. Express infrastructure as Terraform; review it like code.

### Reading (Mon-Tue)

- HashiCorp's official Terraform tutorials (the AWS or GCP track depending on your cloud)
- _Terraform Up and Running_ (3rd ed), chapters 1-5

### Lab (Wed-Fri)

**Replace your Fly.io/manual deploy with Terraform.**

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

**Add a CI workflow that runs `terraform plan` on every PR** and `terraform apply` on merge to main.

**Module-ize the service.** Build `modules/observable-service` that bundles the deployment + dashboard + alerts. Now adding a new service is a 10-line `module "x"` call.

### Saturday project work

Write a small Terraform module that, given a service name and SLO target, generates the SLO recording rules + burn-rate alerts as Kubernetes manifests. This is the "PRR baseline" pattern from chapter 7.

### Deliverable

Your service deployed end-to-end via `git push` → CI → terraform apply. No manual cloud-console clicks.

### Success criteria

You can stand up an identical staging environment by running `terraform workspace new staging && terraform apply` with the same code.

---

## Week 7 — Capacity planning and load testing

### Goals

Predict where your service breaks before it breaks. Use real load tests in CI.

### Reading (Mon-Tue)

- This course: chapter 6
- Brendan Gregg, _Systems Performance_ (2nd ed) — chapters 1, 2, 6 (CPU)
- Neil Gunther's USL paper or summary blog post

### Lab (Wed-Fri)

**Write a k6 load test** for your service:

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

**Run it as a stress test** to find the cliff. Increase concurrency until SLO breaks. Note the number — that is your _measured_ capacity.

**Apply Little's Law** to derive how many replicas you need at 2x current traffic. Verify with another load test.

### Saturday project work

Wire k6 into CI — block merges if the load test fails the thresholds.

### Deliverable

A capacity table for your service, with measured numbers, Little's Law math, and recommended replica count for 1x/2x/5x current traffic.

### Success criteria

You can answer "if traffic 3x next month, what breaks first?" with an actual number, not a guess.

---

## Week 8 — Capstone: chaos + DR + the writeup

### Goals

Combine everything. Run a real chaos experiment with guardrails. Test a DR procedure. Write up the whole 8 weeks.

### Reading (Mon-Tue)

- This course: chapters 8, 9, 10
- _Chaos Engineering_ (Casey Rosenthal, Nora Jones) — relevant chapters
- 1-2 chaos engineering case studies (Netflix, LinkedIn)

### Lab (Wed-Fri)

**Day 1 — Chaos experiment.** Use Chaos Mesh on your kind cluster (or a cheap K8s on cloud). Run a pod-kill experiment with full guardrails:

- Documented hypothesis
- Steady-state dashboard
- Kill-switch script
- Abort criteria

**Day 2 — DR drill.** Provision a "DR" deployment in a second region/cluster. Practice failing over: DNS flip, DB promotion (use a logical replica with a script), traffic verification. Time it. That number is your real RTO.

**Day 3 — Toil audit.** Look back at the 8 weeks. List every manual thing you did more than once. Plan how you would automate each.

### Saturday project work — the writeup

Write a public blog post (or detailed README) summarizing the 8 weeks:

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

- A working capstone project on GitHub (anyone can clone and stand up the full system)
- A public writeup
- A clear plan for what to learn next

### Success criteria

You can interview for a junior SRE role and credibly walk through a real production system you built and operated.

---

## What you will not have learned (be honest)

Eight weeks is enough to be a **junior SRE candidate**. It is not enough to be a senior SRE. Things you have not deeply touched yet:

- Linux performance tuning (perf, eBPF, flame graphs at the kernel level)
- Network engineering (BGP, anycast, CDN internals, packet captures)
- Database internals beyond "what is a connection pool"
- Multi-tenant cluster security (network policies, OPA/Kyverno, RBAC at scale)
- Cost optimization at scale (FinOps)
- Service mesh deep-dive (Istio, Linkerd internals)
- Large-scale Kubernetes (1000+ nodes, GitOps at scale, cluster lifecycle)

Plan another 6-12 months of on-the-job depth in a real SRE role to fill those.

<Callout type="tip">

**The 8-week plan works if you do the labs.** Reading SRE books without building the system gives you vocabulary, not skill. Skip the reading if you must, but do not skip the labs. The hands-on hours are where the mental model actually forms.

</Callout>

## Pacing and rest

Eight weeks is sustainable only if you protect the rest. Real recommendations from people who have done this:

- **One full day off per week, no exceptions.** The day after lab work compounds.
- **No "catch-up weekends."** If you fell behind, slip the schedule by a week. Don't double up.
- **Time-box everything.** A 2-hour lab that sprawls into 5 hours indicates something is wrong with the lab or your environment, not your effort.
- **Pair with someone.** A study partner doing the same roadmap is the single biggest predictor of finishing.

## What to do at week 9

If you finished week 8 and want to go deeper, the highest-leverage next steps:

1. **Get oncall somewhere.** A real pager rotation teaches things no lab can.
2. **Contribute to an open-source SRE tool.** Prometheus, Thanos, OpenTelemetry, kube-prometheus-stack. Even small docs PRs build context.
3. **Read every public postmortem.** GitHub is full of them. Make a habit of reading one per week.
4. **Apply for SRE roles.** A capstone on GitHub + a writeup beats a generic resume by an order of magnitude.

## Stay current

This roadmap is curated for 2026. Tools shift fast. For live references:

- [Google SRE books](https://sre.google/books/) — free, the canonical curriculum
- [CNCF Landscape](https://landscape.cncf.io) — what's actually in production now
- [Kubernetes docs](https://kubernetes.io/docs/) — version-tracked, always current
- [USENIX SREcon talks](https://www.usenix.org/conferences) — what working SREs are doing this year

## Key Takeaways

1. **Eight weeks, ~16h/week** — sustainable alongside a job
2. **One project across all weeks** — depth beats breadth here
3. **The labs are the curriculum** — reading is supporting material
4. **End with a public artifact** — a real system + a real writeup is what unlocks the next role
5. **Plan for week 9 onward** — eight weeks gets you to junior; depth comes from real production
